// The event-driven engine (docs/architecture.md#engine-design-m1, decision D15).
//
// One Sim runs one plan, fight after fight. It is a single monomorphic class over typed arrays:
// the plan is flattened in the constructor, per-fight state is reset rather than reallocated,
// and the hot loop allocates nothing. Derived stats are recomputed only when an aura that
// changes attributes starts or ends. Rules come from the plan's profile; constants cite their
// doc in the pure reference functions (core/formulas.ts, core/attack-table.ts).
//
// It simulates white swings, procs, auras, rage, threat, boss melee, and abilities driven by a
// priority-list rotation: GCD and cooldown events on the same queue, one-roll strikes, two-roll
// melee spells, abilities on the spell table (Thunder Clap), on-next-swing queues, off-hand
// strikes, casts that buff the warrior or grant rage, abilities with a cast time (Slam), bleeds
// with a marker on the target (Rend), debuffs on the boss (Sunder Armor's stacks, Thunder Clap's
// slow, Demoralizing Shout's attack power), reactive windows (Overpower, Revenge), stances and
// stance dancing, the execute phase, time-left conditions, buff upkeep and the pre-pull
// (docs/architecture.md#engine-design-m1). For druids it adds Energy and mana on a power tick,
// combo points, Clearcasting's free ability, and forms a shapeshift swaps in (docs/classes/druid.md
// §2). For the paladin it adds damaging spells on their own tables, mp5 and a share of spirit
// regeneration inside the five-second rule, Holy damage and threat multipliers, cooldown
// categories and exclusive auras (seals; docs/classes/paladin.md). For the bear (druid.md §4) it
// adds stacking bleeds (Lacerate), a cooldown an aura suspends (Berserk's Mangle) and an item-armor
// aura (Enrage). For the rogue it adds Energy regeneration from an aura, finishers that time a buff
// or a bleed by their combo points, the combo point and Energy talents around finishers, an aura a
// strike uses up, and poisons: their apply chance and damage from auras, and a stacking poison on
// the target (docs/classes/rogue.md §8). For the caster core (docs/mechanics/spells.md) it adds
// binary and partial resists per school, spell damage by school, school multipliers on the caster
// and the boss, spell DoTs that snapshot at application, channels that can be cut off, casting
// speed, spell procs filtered by school, and the mana hooks the class slices build on. A plan
// without them never enters those paths.
import {
  averageResist,
  bossSlices,
  type DefenderInputs,
  emptyChances,
  levelResistance,
  type MeleeInputs,
  meleeChances,
  specialSlices,
  spellMiss,
  thresholds,
  whiteSlices,
} from '../core/attack-table'
import {
  armorReduction,
  CRIT_MULTIPLIER,
  executePhaseStart,
  furorCatEnergyTenths,
  hastedCastMs,
  parryHasteRemaining,
  ppmChance,
  rageConversion,
  slowedSwingSec,
  swingMs,
} from '../core/formulas'
import { EventQueue } from '../core/queue'
import { Rng, STREAM } from '../core/rng'
import { ACTION, COND, DEFENSE, HAND, POWER_TICK_MS, SCHOOL, SCHOOL_COUNT, TRIGGER, TRIGGER_COUNT, type Plan, type WeaponPlan } from '../plan/types'
import { DerivedStats, deriveStats, StatBlock } from '../stats/stat-block'

/** Event kinds. */
const EV_MH = 1
const EV_OH = 2
const EV_BOSS = 3
const EV_AURA_EXPIRE = 4
const EV_BLEED_TICK = 5
const EV_PERIODIC_RAGE = 6
const EV_DAMAGE_TAKEN = 7
/** The rotation may act: a GCD or cooldown ended. */
const EV_ACT = 8
/** The execute phase begins (encounter.md#implementation-notes). */
const EV_EXECUTE = 9
/** A `cast` ability's rage tick (Bloodrage; data = ability index). */
const EV_CAST_RAGE = 10
/** An ability's cast time is over (Slam; data = ability index). */
const EV_CAST_END = 11
/** A `bleed` ability's tick (Rend; data = ability index). */
const EV_DOT_TICK = 12
/** The player-global power tick: Energy and mana (druid.md §2.4, §2.8). */
const EV_POWER_TICK = 13
/** A stacking poison's tick (Deadly Poison; data = its slot; docs/classes/rogue.md §4.2). */
const EV_STACKING_DOT_TICK = 14
/** A spell DoT's tick (docs/mechanics/spells.md §7; data = plan spell index). */
const EV_SPELL_DOT_TICK = 15
/** A channel ends, run out or cut off (docs/mechanics/spells.md §6; data = ability index). */
const EV_CHANNEL_END = 16
/** The mage's rolling Ignite ticks (docs/classes/mage.md#ignite; data = 0). */
const EV_IGNITE_TICK = 17
// The ranged and pet core (docs/mechanics/ranged-and-pets.md):
/** An Auto Shot fires (§4; data = 0). */
const EV_AUTO_SHOT = 18
/** The pet's white swing (§6; data = 0). */
const EV_PET_SWING = 19
/** The pet may act: its global cooldown or an ability's cooldown ended, or it arrives (§7). */
const EV_PET_ACT = 20
/** The pet's power tick (§7). */
const EV_PET_POWER = 21
/** The pet's cast completes (§7; data = its ability). */
const EV_PET_CAST_END = 22

/** `trace` hook hand codes beyond the melee hands: an Auto Shot, and the pet's white swing. */
export const TRACE_RANGED = 2
export const TRACE_PET = 3

/** Ability kinds (AbilityPlan.kind). */
const KIND_STRIKE = 0
const KIND_MELEE_SPELL = 1
const KIND_ON_NEXT_SWING = 2
const KIND_CAST = 3
const KIND_BLEED = 4
const KIND_SHIFT = 5
const KIND_SPELL = 6
const KIND_SPELL_TABLE = 7
const KIND_CHANNEL = 8
const KIND_CODE = {
  weaponStrike: KIND_STRIKE,
  meleeSpell: KIND_MELEE_SPELL,
  onNextSwing: KIND_ON_NEXT_SWING,
  cast: KIND_CAST,
  bleed: KIND_BLEED,
  shift: KIND_SHIFT,
  spell: KIND_SPELL,
  spellTable: KIND_SPELL_TABLE,
  channel: KIND_CHANNEL,
} as const

/** A pet ability's kind (PetAbilityPlan.kind; docs/mechanics/ranged-and-pets.md §7). */
const PAB_MELEE = 0
const PAB_SPELL = 1
const PAB_BUFF = 2

/** The pool an ability pays from (AbilityPlan.resource). */
const RES_RAGE = 0
const RES_ENERGY = 1
const RES_MANA = 2
const RESOURCE_CODE = { rage: RES_RAGE, energy: RES_ENERGY, mana: RES_MANA } as const

/** At most 5 combo points (druid.md §2.5). */
const MAX_COMBO_POINTS = 5

/**
 * Threat per tenth of Energy and of mana gained from a spell effect: 5 per Energy and 0.5 per mana
 * [?] (threat.md#threat-from-healing-power-gains-and-buffs).
 */
const THREAT_PER_ENERGY_TENTH = 0.5
const THREAT_PER_MANA_TENTH = 0.05

/** Breakdown columns per source. */
export const FIELD = {
  damage: 0,
  threat: 1,
  casts: 2,
  hits: 3,
  crits: 4,
  misses: 5,
  dodges: 6,
  parries: 7,
  glances: 8,
  blocks: 9,
} as const
export const FIELD_COUNT = 10

/** Source rows 0 and 1 are always the white swings of each hand. */
export const SOURCE_MAIN_HAND = 0
export const SOURCE_OFF_HAND = 1

/** Safety cap on one chain of extra attacks (damage-and-timing §5.4). */
const MAX_CHAIN = 10
const EXTRA_QUEUE = 16

/** Threat per rage from a spell effect (threat.md#threat-from-healing-power-gains-and-buffs). */
const THREAT_PER_RAGE_TENTH = 0.5

/** The boss's swing outcomes, in its table's roll order (combat-tables §8): `Sim.bossOutcomes` columns. */
export const BOSS_OUTCOME = { miss: 0, dodge: 1, parry: 2, block: 3, crit: 4, crush: 5, hit: 6 } as const
export const BOSS_OUTCOME_COUNT = 7

/**
 * A ring over the items that share a key (a cooldown category, an exclusive aura group): next[i]
 * is the next index with i's key, wrapping round, and i itself when it has none.
 */
function ring(keys: readonly (string | undefined)[]): Int32Array {
  const next = Int32Array.from(keys, (_, i) => i)
  const first = new Map<string, number>()
  const last = new Map<string, number>()
  keys.forEach((k, i) => {
    if (k === undefined) return
    const prev = last.get(k)
    if (prev === undefined) first.set(k, i)
    else next[prev] = i
    last.set(k, i)
  })
  for (const [k, i] of last) next[i] = first.get(k)!
  return next
}

export class Sim {
  readonly plan: Plan
  /** Totals per source × field, summed over every fight run. */
  readonly counters: Float64Array
  /**
   * Time each plan aura was up, ms, summed over every fight run: from the pull (a pre-pull aura
   * counts from 0) until it ends or the fight does (the results' uptimes).
   */
  readonly auraUpMs: Float64Array
  /**
   * Times each plan aura was put up or refreshed, summed over every fight run: the results' procs
   * per fight for a proc the next ability spends (Clearcasting, druid.md §2.7).
   */
  readonly auraApplications: Float64Array
  /**
   * For an aura that stacks (Lacerate's marker, druid.md §4.3): its stacks × the time it held them,
   * ms, summed like `auraUpMs`, so ÷ `auraUpMs` is its average stacks while up. 0 for the others.
   */
  readonly auraStackMs: Float64Array
  /** Last fight's results. */
  fightDamage = 0
  fightThreat = 0
  fightMs = 0
  /** Diagnostics summed over every fight run (tests and tuning). */
  totalRageGainedTenths = 0
  totalRageWastedTenths = 0
  /** Rage lost to stance swaps' cap (warrior.md §2.1), in tenths, summed over every fight run. */
  totalSwapRageLostTenths = 0
  /** Energy gained and lost to its cap in Cat Form, in tenths, summed over every fight run (druid.md §2.4). */
  totalEnergyGainedTenths = 0
  totalEnergyWastedTenths = 0
  /** Mana spent on abilities, and gained from regeneration and spell effects, in tenths, summed over every fight run. */
  totalManaSpentTenths = 0
  totalManaGainedTenths = 0
  /** The part of the mana gained that the power ticks regenerated (Spirit and mp5), in tenths. */
  totalManaRegenTenths = 0
  /**
   * Mana gained per source row, in tenths, summed over every fight run: what each spell effect or
   * consumable restored (Sanctified Judgement on its judgement's row, a mana potion or rune on its
   * own), for the results' mana ledger. The power ticks have no row.
   */
  readonly manaBySource: Float64Array
  /** Test hook: called for every white swing (source row, hand, time), and bleed tick and spell tick (source, −1, time). */
  trace: ((source: number, hand: number, time: number) => void) | null = null
  /**
   * Test hook: called when an ability is used, before its cost is paid (ability index, time, the
   * pool it pays from in tenths: rage, a druid's Energy, or a druid's or paladin's mana); for an
   * ability with a cast time, when the cast starts.
   */
  castTrace: ((ability: number, time: number, poolTenths: number) => void) | null = null
  /** Test hook: every damage event (source row, damage). */
  damageTrace: ((source: number, damage: number) => void) | null = null
  /** Test hook: every stance swap in a fight (the STANCE bit swapped to, time, rage before and after, in tenths). */
  stanceTrace: ((stance: number, time: number, rageBefore: number, rageAfter: number) => void) | null = null
  /** Test hook: every boss swing on the tank (its time). */
  bossTrace: ((time: number) => void) | null = null
  /** Test hook: every power tick with mana (its time, and the mana it restores in tenths before the cap). */
  manaTrace: ((time: number, tenths: number) => void) | null = null
  /**
   * Test hook: every boss swing on the tank, as it resolves: its BOSS_OUTCOME, the health it cost
   * and its size before mitigation (both 0 for a miss, dodge or parry).
   */
  swingTakenTrace: ((outcome: number, healthLost: number, pre: number) => void) | null = null
  /** The boss's swings by outcome (BOSS_OUTCOME), summed over every fight run (combat-tables §8). */
  readonly bossOutcomes = new Float64Array(BOSS_OUTCOME_COUNT)
  /** Last fight's health lost to hits taken: the boss's swings, or a DPS spec's stand-in hits. */
  fightDamageTaken = 0
  /** When the last fight's execute phase started, ms (its end if there was none; encounter §3). */
  executeAtMs = 0

  private readonly q = new EventQueue(512)
  private readonly rngFight = new Rng()
  private readonly rngTable = new Rng()
  private readonly rngDamage = new Rng()
  private readonly rngProc = new Rng()
  private readonly rngBoss = new Rng()

  // Static inputs.
  private readonly base: StatBlock
  /** The base block plus aura deltas; only the fields auras change are rewritten (deriveStats doesn't mutate it). */
  private readonly scratch: StatBlock
  private readonly derived = new DerivedStats()
  private readonly deriveOptions: { profile: Plan['profile']; applyUnmeasured: boolean; level: number }
  private readonly hasWeapon: Uint8Array
  private readonly wMin: Float64Array
  private readonly wMax: Float64Array
  private readonly wSpeedSec: Float64Array
  private readonly wFlat: Float64Array
  private readonly wHandMult: Float64Array
  private readonly wSkill: Float64Array
  private readonly wHitBonus: Float64Array
  private readonly wCritBonus: Float64Array
  private readonly wArmorPenPct: Float64Array
  private readonly wGlanceLow: Float64Array
  private readonly wGlanceHigh: Float64Array
  private readonly wTwoHand: Uint8Array
  /** Normalized white rage per landed swing, in tenths with their fraction (profile `normalized`). */
  private readonly wNormRageTenths: Float64Array
  private readonly wRageMult: Float64Array
  private readonly wNormSpeed: Float64Array
  private readonly dualWield: boolean
  private readonly normalizedRage: boolean
  /** Whether a white hit's or a hit taken's fraction of a tenth carries to the next (rage.md#rounding). */
  private readonly carryRageFraction: boolean
  private readonly avoidedRageShare: number
  private readonly rageConv: number
  private readonly staticPhysMult: number
  private readonly staticMagicMult: number
  private readonly bossLevelResist: number

  // Procs, flattened.
  private readonly pTrigger: Int32Array
  private readonly pChance: Float64Array // [proc × 2]
  private readonly pHands: Int32Array
  private readonly pIcd: Float64Array
  private readonly pAction: Int32Array
  private readonly pAmount: Float64Array
  private readonly pA: Float64Array
  private readonly pB: Float64Array
  private readonly pSchool: Int32Array
  private readonly pSource: Int32Array
  private readonly pChainBit: Int32Array
  /**
   * The aura a proc needs to be up to roll, or −1 (Bloodthrill: your Rend, warrior.md §2.8). Such
   * procs are in their own lists per trigger, so the others' loop doesn't check it.
   */
  private readonly pReqAura: Int32Array
  private readonly gatedLists: Int32Array[]
  private readonly pBleedSlot: Int32Array
  /**
   * The rogue's poisons (docs/classes/rogue.md §4): whether a proc is one (auras' poison chance and
   * damage apply), and a stacking poison's slot, or −1, with its duration and tick-crit flag.
   */
  private readonly pPoison: Uint8Array
  private readonly pDotSlot: Int32Array
  private readonly pDuration: Float64Array
  private readonly pPeriodicCrit: Uint8Array
  private readonly triggerLists: Int32Array[]

  // Auras, flattened.
  private readonly aDuration: Float64Array
  private readonly aMaxStacks: Int32Array
  private readonly aCharges: Int32Array
  private readonly aStr: Float64Array
  private readonly aAgi: Float64Array
  private readonly aAp: Float64Array
  private readonly aApPct: Float64Array
  private readonly aCrit: Float64Array
  /** Spell crit, for all-crit auras (290): Recklessness, Elune's Light, Weakness Analyzer. */
  private readonly aSpellCrit: Float64Array
  private readonly aHaste: Float64Array
  private readonly aDamage: Float64Array
  private readonly aStatful: Uint8Array
  /**
   * Auras that procs apply for different durations (the Overpower window: 5 s from a dodge, 6 s from
   * Bloodthrill, warrior.md §7), and when each ends: a refresh of one never shortens it.
   */
  private readonly aKeepsEnd: Uint8Array
  private readonly auraEnd: Float64Array
  private readonly chargeAuras: Int32Array
  /** Crits dealt that end an aura (Weakness Analyzer), and the auras that have them. */
  private readonly aCritCharges: Int32Array
  private readonly critChargeAuras: Int32Array
  /**
   * Defensive aura mods (combat-tables §8): dodge, parry and block %, block value, bonus armor and
   * damage taken %; and blocks that end an aura (Holy Shield, Redoubt), with the auras that have them.
   */
  private readonly aDodge: Float64Array
  private readonly aParry: Float64Array
  private readonly aBlock: Float64Array
  private readonly aBlockValue: Float64Array
  private readonly aArmor: Float64Array
  private readonly aTaken: Float64Array
  private readonly aBlockCharges: Int32Array
  private readonly blockChargeAuras: Int32Array
  /** An aura's item-armor % on the player, per stack (Enrage, druid.md §4.5). */
  private readonly aItemArmorPct: Float64Array
  /** Each block-charged aura's `auraGen` as a blocked swing lands, before its procs (`useBlockCharges`). */
  private readonly blockChargeGen: Int32Array
  /**
   * Debuffs a rotation keeps on the boss (Faerie Fire, druid.md §3.8; warrior.md §7 "Debuffs on the
   * boss"), per stack: armor removed, attack-speed slow % and attack power; and whether an aura has
   * either of the last two.
   */
  private readonly aTargetArmor: Float64Array
  private readonly aBossSlow: Float64Array
  private readonly aBossAp: Float64Array
  private readonly aBossDebuff: Uint8Array
  /**
   * Lines that refresh an aura (COND.abilityAuraRefresh, Battle Shout's upkeep, warrior.md §5.2
   * row 1): aura a's are watchLine[watchStart[a] … watchStart[a + 1] − 1], each with its lead (ms
   * before the aura's end). Resolved into the line's time window whenever the aura starts or ends.
   */
  private readonly watchStart: Int32Array
  private readonly watchLine: Int32Array
  private readonly watchLead: Float64Array
  /** Holy damage done % (Vengeance) and flat Holy damage taken by the target (JotC) per stack (paladin.md). */
  private readonly aHoly: Float64Array
  private readonly aHolyTaken: Float64Array
  /** The next aura of the same exclusive group, in a ring (itself when it has none): one seal at a time. */
  private readonly aGroupNext: Int32Array
  /**
   * Charges that hits taken which cost health use up (Seal of Fury's absorb, 1; paladin.md#protection-tree),
   * the auras that have them, and each active one's charges left.
   */
  private readonly aTakenCharges: Int32Array
  private readonly takenChargeAuras: Int32Array
  private readonly auraTakenCharges: Int32Array
  /** Each taken-charged aura's `auraGen` as a hit that costs health lands, before its procs (`onDamageTaken`). */
  private readonly takenChargeGen: Int32Array
  /**
   * At most one white-swing charge used per this many ms (the shaman's Flurry, 500: docs/classes/shaman.md#flurry),
   * and when each aura's next one can go; 0 for every other aura, which loses one per white swing.
   */
  private readonly aChargeIcd: Float64Array
  private readonly auraChargeReadyAt: Float64Array
  /** The plan aura a spell is boosted by and uses up when it lands (−1: none), and by how much %: Stormstrike's (shaman.md). */
  private readonly splBoostAura: Int32Array
  /** 1: the boost's aura stays up when the spell lands (Incinerate on Immolate, docs/classes/warlock.md §3; Lava Burst on your Flame Shock, shaman.md). */
  private readonly splBoostKeep: Uint8Array
  /** A spell's direct damage % below a health share, and from when this fight (Decimation, docs/classes/warlock.md §11.3). */
  private readonly splLowPct: Float64Array
  private readonly splLowBelow: Float64Array
  private readonly splLowAt: Float64Array
  private readonly lowHealthSpells: Int32Array
  /** A DoT's own multiplier, snapshotted in place of `splDamageMult` (docs/classes/warlock.md §4). */
  private readonly splDotMult: Float64Array
  private readonly splBoostPct: Float64Array
  /**
   * The shaman's (docs/classes/shaman.md): the aura whose stacks cut an ability's cast time and cost
   * by these % each and which using it spends (Maelstrom Weapon on Lightning Bolt; −1: none), and an
   * aura it puts on the player when used (Improved Stormstrike's; −1: none).
   */
  private readonly abStackAura: Int32Array
  private readonly abStackCast: Float64Array
  private readonly abStackCost: Float64Array
  private readonly abSelfAura: Int32Array
  /** The cost (tenths) a cast in progress was cut to by its stacks, which it pays when it completes; −1: none. */
  private stackCastCost = -1
  /** Energy regeneration %, and the poisons' damage % and apply chance in points, per aura (the rogue's; rogue.md §3.7, §4.4). */
  private readonly aEnergyRegen: Float64Array
  private readonly aPoisonDamage: Float64Array
  private readonly aPoisonChance: Float64Array
  /** Your bleeds' tick damage %, per aura (Hemorrhage's, rogue.md §3.9). */
  private readonly aBleedDamage: Float64Array

  // Spells, flattened (paladin.md#conventions-used-below; Plan.spells).
  private readonly splSource: Int32Array
  private readonly splSchool: Int32Array
  private readonly splDefense: Int32Array
  private readonly splNoActive: Uint8Array
  private readonly splAlwaysHit: Uint8Array
  private readonly splTriggersProcs: Uint8Array
  private readonly splMin: Float64Array
  private readonly splMax: Float64Array
  private readonly splWeaponPct: Float64Array
  private readonly splNormalized: Uint8Array
  /** A weapon-damage spell's flat part outside its weapon share (SpellDef.flatApart: Holy Strike). */
  private readonly splFlatApart: Uint8Array
  /** Damage from the main hand's weapon DPS × this, and whether with attack power (SpellDef.weaponDps: Hammer of the Righteous). */
  private readonly splWeaponDps: Float64Array
  private readonly splWeaponDpsAp: Uint8Array
  private readonly splSpCoef: Float64Array
  private readonly splTakenScale: Float64Array
  private readonly splCritMult: Float64Array
  private readonly splBonusCrit: Float64Array
  private readonly splDamageMult: Float64Array
  private readonly splThreatMult: Float64Array
  private readonly splThreatBonus: Float64Array
  /** Rolls no crit on any table (Holy Shield's block damage, Retribution Aura's; paladin.md [?]). */
  private readonly splNoCrit: Uint8Array

  // The caster core (docs/mechanics/spells.md), flattened. A plan without caster spells, school
  // effects or channels has every spell plain here (no DoT, not binary, a direct part), every
  // school at 1, 1 and 0, and no channel, so none of this changes what it does.
  /** Resisted whole at its school's resistance, with its hit, and never partially (§3). */
  private readonly splBinary: Uint8Array
  /** It has a direct part; one without is a pure DoT, which rolls no crit when it lands (§7). */
  private readonly splHasDirect: Uint8Array
  /** Its DoT (§7): ticks, period, damage and coefficient per tick, whether a tick can crit (in this profile), its row and marker. */
  private readonly splDotTicks: Int32Array
  private readonly splDotTickMs: Float64Array
  private readonly splDotTick: Float64Array
  private readonly splDotCoef: Float64Array
  private readonly splDotCanCrit: Uint8Array
  private readonly splDotSource: Int32Array
  private readonly splDotAura: Int32Array
  /** Each spell DoT on the target: ticks to come, generation, next tick, and the snapshot's damage and crit % (−1: can't crit). */
  private readonly spDotTicksLeft: Int32Array
  private readonly spDotGen: Int32Array
  private readonly spDotNextAt: Float64Array
  private readonly spDotDamage: Float64Array
  private readonly spDotCrit: Float64Array
  /** Per SCHOOL code (§5, §9): the plan's static caster multiplier, boss damage taken and crit, and 1 − the boss's average resist. */
  private readonly schStaticDamage = new Float64Array(SCHOOL_COUNT).fill(1)
  private readonly schStaticTaken = new Float64Array(SCHOOL_COUNT).fill(1)
  private readonly schStaticCrit = new Float64Array(SCHOOL_COUNT)
  private readonly resistFactor = new Float64Array(SCHOOL_COUNT).fill(1)
  /** The boss's average resist per school as a binary spell's chance to be resisted whole, not below 0 (§3). */
  private readonly resistChance = new Float64Array(SCHOOL_COUNT)
  /** The same with the active auras' school mods: what a spell reads now. */
  private readonly schDamage = new Float64Array(SCHOOL_COUNT).fill(1)
  private readonly schTaken = new Float64Array(SCHOOL_COUNT).fill(1)
  private readonly schCrit = new Float64Array(SCHOOL_COUNT)
  /** Spell damage per school, from the derived stats (Holy's with Champion of the Light's share; physical none). */
  private readonly spSchool = new Float64Array(SCHOOL_COUNT)
  /** An aura's school mods (§5, §9), casting speed (§4) and mana hooks (§8); `aSchool` marks the auras with any. */
  private readonly aSchoolMask: Int32Array
  private readonly aSchoolDamage: Float64Array
  private readonly aSchoolTaken: Float64Array
  private readonly aSchoolCrit: Float64Array
  private readonly aCastHaste: Float64Array
  private readonly aSpiritRegen: Float64Array
  private readonly aCastingRegen: Float64Array
  private readonly aSchool: Uint8Array
  /** Spell damage, all schools, per stack (§5): a stat, so it re-derives the stats. */
  private readonly aSpellDamage: Float64Array
  private readonly aSpellDamagePct: Float64Array
  /** Casting speed shortens its cast time (§4). */
  private readonly abCastHasted: Uint8Array
  // The Balance druid's (docs/classes/druid.md §11.3): Nature's Grace's GCD cut, Eclipse's charges, and
  // Omen of Clarity's rate per minute of casting.
  /** The auras' `gcdPct`, and the product of (1 − it) over the active ones; the abilities it shortens. */
  private readonly aGcdPct: Float64Array
  private gcdMult = 1
  private readonly abGcdCut: Uint8Array
  /** The aura whose stacks shorten its cast (−1: none), by how many ms a stack. */
  private readonly abChargeAura: Int32Array
  private readonly abChargeCastMs: Float64Array
  /** A spell proc's rate per minute of casting (0: its chance), and each row's cast time for it, ms. */
  private readonly pPpmCast: Float64Array
  private readonly srcProcCastMs: Float64Array
  /** `channel`: ticks after which it's cut off (0: all of them; §6). */
  private readonly abChannelTicks: Int32Array
  /** A spell proc's schools (a mask, 0: any) and the one spell row that fires it (−1: any; §10). */
  private readonly pSchools: Int32Array
  private readonly pFromSource: Int32Array
  /** Some proc listens for landed spells, or for spell DoT ticks (§10). */
  private readonly hasSpellLanded: boolean
  private readonly hasSpellTick: boolean

  // Abilities and the rotation, flattened.
  private readonly abKind: Int32Array
  private readonly abCost: Int32Array
  private readonly abCd: Float64Array
  private readonly abGcd: Float64Array
  /** Cast time (0 = instant), and whether the cast stops white swings and restarts the timers (Slam, warrior.md §3.1). */
  private readonly abCastMs: Float64Array
  private readonly abCastStopsSwings: Uint8Array
  /** Nothing else is used during its cast, off-GCD lines included (a paladin's Hammer of Wrath, paladin.md#other-abilities). */
  private readonly abCastHolds: Uint8Array
  /** Abilities this setup can never use (Spearing Strike without a two-hander): never ready. */
  private readonly abNeverReady: Uint8Array
  /** Can't be dodged, parried or blocked: only a miss avoids it (Overpower, combat-tables §3). */
  private readonly abUnavoidable: Uint8Array
  /** The aura it needs and ends, or −1 (the Overpower window, warrior.md §2.8). */
  private readonly abWindow: Int32Array
  /** The warlock's (docs/classes/warlock.md §8): the spell whose DoT a landed spell ends, its chance, and threat-free gains. */
  private readonly abConsumesDot: Int32Array
  private readonly abConsumeChance: Float64Array
  private readonly abNoThreat: Uint8Array
  /**
   * Some line dances for it (warrior.md §7): GCD-safe counts it as coming up even while the stance
   * refuses it, as long as that dance could happen at the current rage (§7 "GCD-safe and stances").
   */
  private readonly abDances: Uint8Array
  /** The highest `maxRage` (tenths) of its dance lines; Infinity when one has none. */
  private readonly abDanceMaxRage: Float64Array
  private readonly abWeaponPct: Float64Array
  private readonly abNormalized: Uint8Array
  private readonly abFlat: Float64Array
  /** ± spread on the flat damage, and the share of block value added (Shield Slam, Revenge; warrior.md §3.1). */
  private readonly abFlatSpread: Float64Array
  private readonly abBlockValueCoef: Float64Array
  /**
   * Deals no damage (Sunder Armor, Demoralizing Shout): what lands is a hit, never a crit, so it
   * fires no crit procs (warrior.md §7 "Debuffs on the boss"). A druid's combo-point row never is:
   * a finisher's damage is per point, and a builder's crit awards Primal Fury's point (druid.md §2.5).
   */
  private readonly abNoDamage: Uint8Array
  private readonly abApCoef: Float64Array
  private readonly abBonusCrit: Float64Array
  private readonly abCritMult: Float64Array
  private readonly abRefund: Float64Array
  private readonly abThreatMult: Float64Array
  private readonly abThreatBonus: Float64Array
  private readonly abSource: Int32Array
  private readonly abStances: Int32Array
  private readonly abPerExtraRage: Float64Array
  private readonly abOffSource: Int32Array
  private readonly abUnqueueBelow: Int32Array
  /** On-next-swing abilities whose line stops in the execute phase: cancelled when it starts (warrior.md §7). */
  private readonly abUnqueueAtExecute: Uint8Array
  /** `cast` abilities: the aura they apply (−1 none) and their rage, at once and per tick (tenths). */
  private readonly abAura: Int32Array
  private readonly abRage: Int32Array
  private readonly abTickRage: Int32Array
  private readonly abTicks: Int32Array
  private readonly abTickMs: Float64Array
  /** `cast` abilities: a random extra of 0…this many tenths on the rage at once (Mighty Rage Potion). */
  private readonly abRageSpread: Int32Array
  /**
   * `bleed` abilities: damage per tick before physical multipliers, ticks, tick period, and
   * whether a tick may crit (the spell's flag, in a profile whose periodic effects crit).
   */
  private readonly abDotTick: Float64Array
  private readonly abDotTicks: Int32Array
  private readonly abDotTickMs: Float64Array
  private readonly abDotCanCrit: Uint8Array
  /** Uses per fight (0 = no limit), and this fight's uses so far. */
  private readonly abUsesPerFight: Int32Array
  private readonly abUses: Int32Array
  /** The ability whose cooldown (and category's) a cast ends, or −1 (Swift Judgement, paladin.md#protection-tree). */
  private readonly abEndsCd: Int32Array
  /**
   * The spell it casts on use and on each tick (−1 none), and the mana in tenths it returns when it
   * lands, with this chance (paladin.md). Its mana cost is `abCost`, from the pool `abRes`.
   */
  private readonly abSpell: Int32Array
  private readonly abTickSpell: Int32Array
  private readonly abManaReturn: Float64Array
  private readonly abManaReturnChance: Float64Array
  /** `cast` abilities: mana at once in tenths, plus a random 0…spread (a mana potion or rune). */
  private readonly abManaGain: Float64Array
  private readonly abManaSpread: Int32Array
  /** A `cast`'s power for the pet, in tenths (Demonic Energies on Life Tap, docs/classes/warlock.md §11.3). */
  private readonly abPetPower: Int32Array
  /** The next ability of the same cooldown category, in a ring (itself when it has none). */
  private readonly abCatNext: Int32Array
  /** The pre-pull casts (ability, time < 0) and the opener's rage (warrior.md §5.2 row 0). */
  private readonly preAbility: Int32Array
  private readonly preAt: Float64Array
  private readonly preChargeTenths: number
  private readonly preKeepTenths: number
  private readonly rotAbility: Int32Array
  /** The STANCE bit a line dances to when the current stance refuses its ability, or 0 (warrior.md §7). */
  private readonly entryDance: Int32Array
  /** 1: once the line's ability is used, its stance is the base stance for the rest of the fight (Arms Recklessness). */
  private readonly entryStay: Uint8Array
  /**
   * The priority list per phase, in order: the entries that can apply outside and inside the
   * execute phase, and of those the off-GCD ones (all that can act while the GCD runs). The phase
   * is resolved here, from the entries' execute-phase conditions and execute-only abilities, so a
   * walk never visits a line that can't apply.
   */
  private readonly rotNormal: Int32Array
  private readonly rotExecute: Int32Array
  private readonly offGcdNormal: Int32Array
  private readonly offGcdExecute: Int32Array
  /** Entry e's conditions are indices condStart[e] … condStart[e + 1] − 1 (execute-phase conditions resolved into the lists). */
  private readonly condStart: Int32Array
  private readonly condCode: Int32Array
  private readonly condA: Float64Array
  private readonly condB: Float64Array
  /**
   * Time-left conditions per entry (ms): time left ≤ `entryLeftAtMost` (∞ = none) and ≥
   * `entryLeftAtLeast` (−∞ = none). Each fight turns them into the window `entryBaseFrom` ≤ now
   * ≤ `entryTo`, so a walk checks them with two comparisons. `entryFrom` is that window's start,
   * moved later while an aura the line refreshes is up (COND.abilityAuraRefresh).
   */
  private readonly entryLeftAtMost: Float64Array
  private readonly entryLeftAtLeast: Float64Array
  /**
   * The line's "execute phase starts within x" condition (ms; ∞ = none, COND.executeWithin): each
   * fight moves the window's start to `execute start − x`, or never in a fight without the phase.
   */
  private readonly entryExecuteWithin: Float64Array
  /**
   * The line's "execute phase starts in more than x" condition (ms; −∞ = none,
   * COND.executeNotWithin): each fight moves the window's end to `execute start − x − 1`, or leaves
   * it in a fight without the phase.
   */
  private readonly entryExecuteNotWithin: Float64Array
  private readonly entryBaseFrom: Float64Array
  private readonly entryFrom: Float64Array
  private readonly entryTo: Float64Array
  /**
   * The distinct thresholds of `timeLeftAtMost` conditions (ms): each fight wakes the rotation at
   * `fightEnd − x`, when that condition becomes true.
   */
  private readonly wakeTimeLeft: Float64Array
  /** The distinct thresholds of `executeWithin` conditions (ms): each fight wakes the rotation at `execute start − x`. */
  private readonly wakeExecuteWithin: Float64Array
  /** Some line waits for rage ≤ x, so spending rage is a decision point. */
  private readonly hasMaxRage: boolean
  /** Some proc listens for the target's dodges (the Overpower window); without one, a dodge fires nothing. */
  private readonly hasDodgeProcs: boolean
  /**
   * Stances (warrior.md §2.1, §7 "Stances"), per STANCE bit: the factors on the plan's damage,
   * threat and damage taken, and the aura crit added (1, 1, 1, 0 for the stance the plan's static
   * numbers are for); the base stance the fight starts in; and a swap's shared cooldown and the
   * most rage it keeps.
   */
  private readonly sDamage = new Float64Array(8).fill(1)
  private readonly sThreat = new Float64Array(8).fill(1)
  private readonly sTaken = new Float64Array(8).fill(1)
  private readonly sCrit = new Float64Array(8)
  private readonly sSpellCrit = new Float64Array(8)
  private readonly baseStance: number
  private readonly swapCdMs: number
  private readonly swapKeep: number
  private readonly hasRotation: boolean
  private readonly hasAbilities: boolean
  /**
   * Some ability or spell attacks without a weapon: a spell-table one, or one that needs only a
   * shield (Thunder Clap, Shield Slam; warrior.md §7 "Without a main-hand weapon"), or a paladin
   * spell of the melee or ranged class (its judgements, Hammer of Wrath; paladin.md#how-the-engine-does-it),
   * so an empty main hand still gets its special-attack table.
   */
  private readonly hasWeaponlessAttacks: boolean
  /** Some proc fires after a landed white swing's own procs (the paladin's damage seals). */
  private readonly hasWhiteResolved: boolean
  /** Static multipliers on Holy damage and Holy threat (Righteous Fury ×1.9, paladin.md#threat-paladin-specific). */
  private readonly staticHolyMult: number
  private readonly holyThreatMult: number

  // Resources and forms (docs/classes/druid.md §2; the paladin's mana, paladin.md#mana-model),
  // flattened. A plan without them has every ability `abPlainRage` and no power tick, forms or
  // free-cast aura, so none of this runs for it.
  /** The pool each ability pays from (RES_*). */
  private readonly abRes: Int32Array
  /** Form bits it can be used in (0: any), and its combo-point rules (druid.md §2.5). */
  private readonly abForms: Int32Array
  private readonly abCp: Int32Array
  private readonly abCritCp: Float64Array
  private readonly abFinisher: Uint8Array
  private readonly abPerCp: Float64Array
  private readonly abApPerCp: Float64Array
  private readonly abCpApCap: Int32Array
  private readonly abDotPerCp: Float64Array
  private readonly abDotApPerCp: Float64Array
  /** A Clearcasting charge makes it free (druid.md §2.7). */
  private readonly abFree: Uint8Array
  /** `shift`: the form it enters. */
  private readonly abShiftTo: Int32Array
  /** Pays rage, in any form, with no combo points and never free: every warrior row, on the unchanged path. */
  private readonly abPlainRage: Uint8Array
  /** Fields the cat's abilities brought (druid.md §3; plan/types.ts AbilityPlan): all 0 or −1 on a warrior row. */
  /** A uniform extra of 0…this on a non-weapon ability's flat damage (Ferocious Bite, §3.5). */
  private readonly abFlatRange: Float64Array
  /** The plan aura that gives it extra crit while up (−1: none), and how much (Berserk, §3.7). */
  private readonly abCritAura: Int32Array
  private readonly abCritAuraPct: Float64Array
  /** Damage % on its direct damage while the target bleeds (Rend and Tear, §5.1). */
  private readonly abBleedPct: Float64Array
  /** The breakdown row of its bleed's ticks: its own for an attack that also bleeds (Rake, §3.3; Lacerate, §4.3). */
  private readonly abDotSource: Int32Array
  /** A `cast` that rolls spell hit on the target (Faerie Fire, §3.8). */
  private readonly abSpellHit: Uint8Array
  // And the bear's (druid.md §4), 0 or −1 on every other row:
  /**
   * The boss's average resistance to a `spellTable` ability, 0–1: a binary spell of a resistible
   * school (the bear's Faerie Fire, Nature) is resisted whole that share of the time it would land
   * (combat-tables §9); 0 without a school, and for Physical and Holy.
   */
  private readonly abResist: Float64Array
  /** Weapon share per stack of its own bleed already on the target (Lacerate, §4.3). */
  private readonly abPctPerStack: Float64Array
  /** The aura while which it starts no cooldown (Berserk's Mangle, §4.6), or −1. */
  private readonly abNoCdAura: Int32Array
  /**
   * What the rogue's rows brought (docs/classes/rogue.md §8; plan/types.ts AbilityPlan), all 0 on
   * every other row: a finisher's aura time and bleed ticks per combo point, Relentless Strikes'
   * Energy, Ruthlessness's and Puncturing Wounds' combo points, Improved Expose Armor's points back,
   * an aura crit that the strike uses up (Cold Blood), and a bonus against a poisoned target.
   */
  private readonly abAuraMsPerCp: Float64Array
  private readonly abDotTicksPerCp: Int32Array
  private readonly abFinishEnergyChance: Float64Array
  private readonly abFinishEnergy: Int32Array
  private readonly abFinishCpChance: Float64Array
  private readonly abBonusCp: Float64Array
  private readonly abCpBackAtFive: Int32Array
  private readonly abCritAuraConsume: Uint8Array
  private readonly abPoisonedPct: Float64Array
  /**
   * What Subtlety's rows brought (rogue.md §5.3, §8), 0 or −1 on every other row: a bonus below a
   * health share (Quietus) and when this fight reaches it, the aura a bleed's ticks put up (Thousand
   * Cuts) and the one whose stacks make an ability cheaper, and the aura a landed hit opens with a
   * chance (Cutthroat's Ambush window).
   */
  private readonly abLowPct: Float64Array
  private readonly abLowBelow: Float64Array
  private readonly abLowAt: Float64Array
  private readonly lowHealthAbilities: Int32Array
  private readonly abTickAura: Int32Array
  private readonly abCostAura: Int32Array
  private readonly abCostPerStack: Int32Array
  private readonly abOpensAura: Int32Array
  private readonly abOpensChance: Float64Array
  /** Others keep the target bleeding (Plan.fight.othersBleed). */
  private readonly othersBleed: boolean
  /** PPM procs that can roll on the main hand, and their rates: a shapeshift re-resolves their chance (druid.md §2.1). */
  private readonly pPpm: Float64Array
  private readonly ppmProcs: Int32Array
  /** Form bits a proc rolls in (0: any), in the gated lists (Primal Fury's rage: bear). */
  private readonly pForms: Int32Array
  /** The aura whose charge makes the next ability with a cost free (Clearcasting), or −1. */
  private readonly freeAura: number
  /** Spell crit % the ability that uses the free-cast charge gets (Inner Focus's 25, docs/classes/priest.md); 0 for Clearcasting. */
  private readonly freeCritPct: number
  /** That crit while the ability that used the charge resolves its spell, else 0. */
  private freeCrit = 0
  /** The form the fight starts in (−1: no forms), and the forms Furor's rules name (druid.md §2.8). */
  private readonly startForm: number
  private readonly catForm: number
  private readonly bearForm: number
  private readonly casterForm: number
  private readonly furorRank: number
  private readonly bearEntryRage: number
  private readonly bearEntryRageChance: number
  private readonly hasPowerTick: boolean
  /** Some line waits for Energy ≤ x (Tiger's Fury, druid.md §6.2), so spending Energy is a decision point. */
  private readonly hasMaxEnergy: boolean
  private readonly energyMax: number
  private readonly energyStart: number
  private readonly energyTick: number
  private readonly manaMax: number
  private readonly manaRegen: number
  private readonly fiveSecondRuleMs: number
  /** mp5 per power tick, and the share of spirit regeneration inside the five-second rule (the paladin's Reverence; paladin.md#mana-model). */
  private readonly manaMp5: number
  private readonly manaInFsrShare: number

  // Per-fight state.
  /** Energy, mana (tenths) and combo points (druid.md §2.4, §2.5, §2.8; paladin.md#mana-model). */
  private energy = 0
  private mana = 0
  private comboPoints = 0
  /** The form the druid is in (an index into `Plan.forms`; −1 without forms). */
  private form = -1
  /** What the last ability used paid (tenths of its pool; 0 when Clearcasting paid): refunds are a share of it. */
  private lastPaid = 0
  /** When mana was last spent (the five-second rule, druid.md §2.8, paladin.md#mana-model). */
  private manaSpentAt = -Infinity
  /** The player's bleeds on the target now (`bleed` abilities', Rake's and Lacerate's; druid.md §5.1 Rend and Tear). */
  private activeDots = 0
  /** Stacking poisons on the target (Deadly Poison, rogue.md §4.2): stacks, when each ends, its next tick and generation; and how many are up. */
  private readonly dotStacks: Int32Array
  private readonly dotEnd: Float64Array
  private readonly sdNextAt: Float64Array
  private readonly sdGen: Int32Array
  private readonly sdProc: Int32Array
  private poisonedDots = 0
  /** The auras' Energy regeneration factor and the poisons' damage factor and extra apply chance (a fraction). */
  private energyRegenMult = 1
  private poisonMult = 1
  private poisonChance = 0
  /** The auras' factor on your bleeds' ticks (Hemorrhage, rogue.md §3.9). */
  private bleedMult = 1
  /**
   * White hits and hits taken give rage: for a warrior, in a druid's bear form (FormPlan.rage), and
   * never for a class without a rage pool (the paladin).
   */
  private gainsRage = true
  /** Furor's inputs (druid.md §2.8): Energy when last leaving cat, and time since in no animal form. */
  private catEnergyLeft = 0
  private outOfFormMs = 0
  private formSince = 0
  private now = 0
  private fightEnd = 0
  private rage = 0
  /** Flat Holy damage the target takes from active auras (JotC), and the aura multiplier on Holy damage (Vengeance). */
  private holyTaken = 0
  private holyMult = 1
  /** The fraction of a tenth carried to the next white hit or hit taken, 0 ≤ it < 1 (rage.md#rounding). */
  private rageFraction = 0
  private readonly maxRage: number
  private readonly swingMs = new Float64Array(2)
  private readonly nextSwingAt = new Float64Array(2)
  private readonly swingGen = new Int32Array(2)
  private bossNextAt = 0
  private bossGen = 0
  private bossSwingMs = 0
  private readonly procReadyAt: Float64Array
  private readonly auraActive: Uint8Array
  private readonly auraStacks: Int32Array
  private readonly auraCharges: Int32Array
  private readonly auraCritCharges: Int32Array
  private readonly auraBlockCharges: Int32Array
  private readonly auraGen: Int32Array
  /** When each active aura came up this fight (0 for a pre-pull one), for `auraUpMs`. */
  private readonly auraSince: Float64Array
  /** When a stacking aura's stacks last changed or were counted, for `auraStackMs`. */
  private readonly auraStackSince: Float64Array
  private readonly bleedTicksLeft: Int32Array
  private readonly bleedGen: Int32Array
  /** When each weapon bleed's next tick is due (for the refresh tie-break, damage-and-timing §4). */
  private readonly bleedNextAt: Float64Array
  private readonly bleedProc: Int32Array
  private gcdEnd = 0
  private readonly abReadyAt: Float64Array
  /** `cast` rage ticks still to come, their generation (a recast restarts them), and when the next is due. */
  private readonly abTicksLeft: Int32Array
  private readonly abTickGen: Int32Array
  private readonly abTickAt: Float64Array
  /**
   * `bleed` abilities on the target: ticks still to come, their generation (a refresh restarts
   * them), the next tick's time, and the damage and crit chance snapshotted at the application
   * (−1: the ticks can't crit).
   */
  private readonly dotTicksLeft: Int32Array
  private readonly dotGen: Int32Array
  private readonly dotNextAt: Float64Array
  private readonly dotDamage: Float64Array
  private readonly dotCrit: Float64Array
  /** While an ability's cast runs, the GCD is held (gcdEnd = ∞); this is when the GCD would end on its own. */
  private castGcdEnd = 0
  /** A cast that stops white swings is running: no swing timers are pending (damage-and-timing §3.3). */
  private swingsStopped = false
  /** A cast that holds every other action is running: the rotation waits for it (paladin.md#other-abilities). */
  private castHolding = false
  /** The STANCE bit the warrior is in: the base stance, or the one a dance swapped to (warrior.md §7). */
  private stance = 0
  /**
   * The stance dances end in: the plan's base stance, until a line that stays makes the stance it
   * was used in the base for the rest of the fight (Arms Recklessness, warrior.md §5.3 row 4).
   */
  private home = 0
  /** When the stances' shared swap cooldown ends (warrior.md §2.1). */
  private stanceReadyAt = 0
  /** The current stance's factor on all damage, its aura crit and spell crit, and the threat and damage-taken multipliers in it. */
  private stanceDamage = 1
  private stanceCrit = 0
  private stanceSpellCrit = 0
  private threatMult = 1
  private damageTakenMult = 1
  /** The current phase's lists (rotNormal / rotExecute and their off-GCD entries). */
  private rotList: Int32Array
  private rotOffList: Int32Array
  /** The queued on-next-swing ability, or −1. */
  private queued = -1
  /** Something the rotation depends on changed (rage, GCD, a cooldown, an aura, the queue). */
  private actPending = false
  private dynStr = 0
  private dynAgi = 0
  private dynAp = 0
  /** Product of the active attack-power % auras (Blood Fury). */
  private dynApMult = 1
  private dynCrit = 0
  private dynSpellCrit = 0
  /** Spell damage from the active auras (docs/mechanics/spells.md §5). */
  private dynSpellDamage = 0
  /** Product of the active spell damage % auras (Forever's Blood Fury, docs/classes/warlock.md#72-race). */
  private dynSpellDamageMult = 1
  private auraHasteMult = 1
  /** Defensive aura deltas (combat-tables §8) and the product of damage-taken aura mods. */
  private dynDodge = 0
  private dynParry = 0
  private dynBlock = 0
  private dynBlockValue = 0
  private dynArmor = 0
  private auraTakenMult = 1
  /**
   * Debuffs on the boss from the player's auras (Faerie Fire, druid.md §3.8; warrior.md §7 "Debuffs
   * on the boss"): armor removed, the strongest slow as a fraction, and the swing damage the
   * attack-power changes add.
   */
  private dynTargetArmor = 0
  private dynBossSlow = 0
  private dynBossDamage = 0
  /** The item-armor % of the player's auras (Enrage, druid.md §4.5). */
  private dynItemArmorPct = 0

  // Derived per hand, refreshed on stat changes.
  private ap = 0
  private readonly critPct = new Float64Array(2)
  private readonly thrWhite = new Float64Array(12)
  /** The off hand's white table while an on-next-swing ability is queued: no dual-wield penalty (combat-tables §5). */
  private readonly thrOffQueued = new Float64Array(6)
  /** Special-attack table per hand (combat-tables §3): miss, dodge, parry, 0 (no glancing), block, crit. */
  private readonly thrSpecial = new Float64Array(12)
  /** Special crit % per hand before truncation, for ability bonus crit and melee spells' second roll. */
  private readonly specCrit = new Float64Array(2)
  private readonly thrBoss = new Float64Array(6)
  /** 1 − the player's armor reduction against the boss's level (damage-and-timing §1.1). */
  private bossArmorFactor = 1
  private readonly armorFactor = new Float64Array(2)
  private physMult = 1
  private magicMult = 1
  private hasteMult = 1
  private blockValue = 0
  private spellMissPct = 0
  /** Sheet spell crit %, for magic procs' second roll (combat-tables §9). */
  private spellCritPct = 0
  /** Holy spell damage (paladin.md#conventions-used-below "SP"). */
  private sp = 0
  /** Casting speed: the derived stats' and the product of the auras' (docs/mechanics/spells.md §4). */
  private castHasteStat = 1
  private castHasteAura = 1
  private castHasteMult = 1
  /** The mana hooks' Spirit regen multiplier and extra share inside the five-second rule (§8). */
  private dynSpiritRegen = 1
  private dynCastingRegen = 0
  /** The school and row of the spell whose triggers are firing, for school-filtered procs (§10). */
  private procSchool = 0
  private procSource = -1
  /** The ability channeling now, or −1 (§6), and the generation of its end event. */
  private channeling = -1
  private channelGen = 0

  // The mage's (docs/classes/mage.md), flattened. A plan without them has none of these auras,
  // spells or abilities, so none of this changes what it does.
  /** A spell's crit % per stack of a plan aura while it's up (Winter's Chill on Frostbolt; −1: none). */
  private readonly splCritAura: Int32Array
  private readonly splCritAuraPct: Float64Array
  /** An aura's crit charges used only by crits of these schools (a mask, 0: any; Combustion's Fire), and whether a refresh keeps them. */
  private readonly aCritChargeSchools: Int32Array
  private readonly aKeepsCharges: Uint8Array
  /** An aura's mana cost %, per stack (Arcane Power's +30%), and the product of the active ones'. */
  private readonly aManaCost: Float64Array
  private manaCostMult = 1
  /** The aura that makes an ability's cast instant and is used up by it (Presence of Mind; −1: none). */
  private readonly abInstantAura: Int32Array
  /** Its cooldown starts when its aura ends (Combustion's): not ready until then. */
  private readonly abCdAfterAura: Uint8Array
  /** For each aura, the abilities whose cooldown starts when it ends (Combustion's), as a list. */
  private readonly cdAfterStart: Int32Array
  private readonly cdAfterAbility: Int32Array
  /** Spell hit per school is set (Elemental Precision): then a magic spell reads its school's miss. */
  private readonly hasSchoolHit: boolean
  private readonly schStaticHit = new Float64Array(SCHOOL_COUNT)
  private readonly schMiss = new Float64Array(SCHOOL_COUNT)
  /** The cost in tenths of the ability whose spell resolves now, for a share of it back (Master of Elements). */
  private castCostTenths = 0
  /** The damage of the crit whose procs fire now, for Ignite. */
  private critDamage = 0
  /** The rolling Ignite (Plan.ignite): the damage still to come, ticks left, the next tick, its generation. */
  private readonly igPct: number
  private readonly igTicks: number
  private readonly igTickMs: number
  private readonly igSchool: number
  private readonly igSource: number
  private readonly igAura: number
  private igPool = 0
  private igTicksLeft = 0
  private igNextAt = 0
  private igGen = 0

  // The ranged and pet core (docs/mechanics/ranged-and-pets.md), flattened. A plan without a ranged
  // weapon or a pet has none of these auras, spells, conditions or events, so none of this changes
  // what it does.
  /** The ranged weapon (Plan.ranged, §2–§5): its numbers, Auto Shot's wind-up and first shot, and its row. */
  private readonly hasRanged: boolean
  private readonly rMin: number
  private readonly rMax: number
  private readonly rSpeedSec: number
  private readonly rFlat: number
  private readonly rSkill: number
  private readonly rHitBonus: number
  private readonly rCritBonus: number
  private readonly rDamageMult: number
  private readonly rStaticHaste: number
  private readonly rNormSpeed: number
  /** Auto Shot's wind-up, ms, now (÷ ranged haste when it's hasted), its unhasted length, and whether casts hold it back. */
  private rWindupMs = 0
  private readonly rBaseWindupMs: number
  private readonly rWindupHasted: boolean
  private readonly rCastsHold: boolean
  private readonly rCritMult: number
  private readonly rFirstShotMs: number
  private readonly rSource: number
  /** The ranged table (§2): miss, 0, 0 (no dodge or parry), 0 (no glancing), block, crit; and its crit % before truncation. */
  private readonly thrRanged = new Float64Array(6)
  private rCritPct = 0
  /** Ranged attack power now (§3), and 1 − the boss's armor reduction for ranged attacks. */
  private rap = 0
  private rArmorFactor = 1
  /** One Auto Shot cycle now, ms: speed ÷ ranged haste (§4). */
  private rCycleMs = 0
  /** The product of the active ranged-haste auras (Rapid Fire). */
  private rangedHasteAura = 1
  /** Ranged attack power from the active auras, and the product of their ranged attack power %. */
  private dynRap = 0
  private dynRapMult = 1
  /**
   * Auto Shot's timer (§4): when the reload part of the cycle ends, until when a cast or channel
   * holds the wind-up back, when the next shot fires (and its event's generation), and when the last
   * one fired.
   */
  private rReloadAt = 0
  private rHeldUntil = 0
  private rNextAt = 0
  private rGen = 0
  private rLastShotAt = -Infinity
  /** A spell is a shot with the ranged weapon (SpellDef.ranged): the ranged table and weapon. */
  private readonly splRanged: Uint8Array
  /** Ranged haste shortens its cast time (Aimed Shot's, §4). */
  private readonly abCastRangedHasted: Uint8Array
  /** Some line reads Auto Shot's timer (COND 62, 63), so each Auto Shot is a decision point. */
  private readonly walksOnAutoShot: boolean
  /** Auras' ranged attack power, its %, and ranged haste %, per stack. */
  private readonly aRap: Float64Array
  private readonly aRapPct: Float64Array
  private readonly aRangedHaste: Float64Array
  /** Auras' pet mods (§8), per stack, and whether an aura has any. */
  private readonly aPetAp: Float64Array
  private readonly aPetCrit: Float64Array
  private readonly aPetHaste: Float64Array
  private readonly aPetDamage: Float64Array
  private readonly aPetful: Uint8Array
  /** The pet (Plan.pet, §6–§10): its static numbers, as the plan builder derived them. */
  private readonly hasPet: boolean
  private readonly rngPet = new Rng()
  private readonly petHasWeapon: boolean
  private readonly petWMin: number
  private readonly petWMax: number
  private readonly petWSpeedSec: number
  private readonly petLevel: number
  private readonly petSkill: number
  private readonly petBaseAp: number
  private readonly petBaseCrit: number
  private readonly petAuraCritBase: number
  private readonly petHit: number
  private readonly petBaseSp: number
  private readonly petSpellCrit: number
  private readonly petSpellHit: number
  private readonly petApFromAp: number
  private readonly petApFromRap: number
  private readonly petSpFromOwner: number
  private readonly petCritFromOwner: number
  private readonly petHitFromOwner: number
  private readonly petStaticDamage: number
  private readonly petStaticHaste: number
  private readonly petCritMult: number
  private readonly petGlances: boolean
  private readonly petGlanceLow: number
  private readonly petGlanceHigh: number
  private readonly petFront: boolean
  private readonly petStartMs: number
  private readonly petSource: number
  private readonly hasPetPower: boolean
  private readonly petPowerMax: number
  private readonly petPowerStart: number
  private readonly petPowerTick: number
  private readonly petPowerTickMs: number
  /** The pet's abilities (PetAbilityPlan), flattened: 0 melee, 1 spell. */
  private readonly pabKind: Uint8Array
  private readonly pabSchool: Int32Array
  private readonly pabCost: Int32Array
  private readonly pabCd: Float64Array
  private readonly pabGcd: Float64Array
  private readonly pabCast: Float64Array
  private readonly pabMin: Float64Array
  private readonly pabMax: Float64Array
  private readonly pabApCoef: Float64Array
  private readonly pabSpCoef: Float64Array
  private readonly pabWeaponPct: Float64Array
  private readonly pabBonusCrit: Float64Array
  private readonly pabCritMult: Float64Array
  private readonly pabAura: Int32Array
  private readonly pabSource: Int32Array
  private readonly pabReadyAt: Float64Array
  /** The pet's priority list: line l's ability, and its conditions (code, a) at petCondStart[l] … petCondStart[l + 1] − 1. */
  private readonly petLineAbility: Int32Array
  private readonly petCondStart: Int32Array
  private readonly petCondCode: Int32Array
  private readonly petCondA: Float64Array
  /** The pet now: its power, global cooldown, the ability it casts (−1: none), and whether it should walk its list. */
  private petPower = 0
  private petGcdEnd = 0
  private petCasting = -1
  private petActPending = false
  private petNextSwingAt = 0
  private petSwingGen = 0
  /** Its derived numbers: attack power, crit, damage multiplier, swing ms, armor factor, tables and spell miss. */
  private petAp = 0
  private petCritPct = 0
  private petDamageMult = 1
  private petSwingMs = 0
  private petArmorFactor = 1
  private petSpellMissPct = 0
  private petSpellCritNow = 0
  private petSpecCrit = 0
  private readonly petThrWhite = new Float64Array(6)
  private readonly petThrSpecial = new Float64Array(6)
  /** The active auras' pet mods: attack power and crit added, attack speed and damage multiplied. */
  private dynPetAp = 0
  private dynPetCrit = 0
  private petAuraHaste = 1
  private petAuraDamage = 1

  // Scratch for recomputeStats, so re-deriving the tables allocates nothing (architecture.md).
  private readonly meleeIn: MeleeInputs = {
    attackerLevel: 0,
    targetLevel: 0,
    skill: 0,
    hit: 0,
    sheetCrit: 0,
    auraCrit: 0,
    expertise: 0,
    front: false,
    canDodge: false,
    canParry: false,
    canBlock: false,
  }
  private readonly defenderIn: DefenderInputs = { playerLevel: 0, bossLevel: 0, defense: 0, dodge: 0, parry: 0, block: 0, canCrush: false, front: false }
  private readonly chances = emptyChances()
  private readonly slices = new Float64Array(6)

  // Extra-attack FIFO, and the chain mask of the root attack being resolved: the bit of every
  // extra-attack source that has procced from it or from the extra attacks that followed
  // (damage-and-timing §5.4). `exMask` keeps each queued attack's root mask for one that waits.
  private readonly exSource = new Int32Array(EXTRA_QUEUE)
  private readonly exBonusAp = new Float64Array(EXTRA_QUEUE)
  private readonly exMask = new Int32Array(EXTRA_QUEUE)
  private exHead = 0
  private exCount = 0
  private chainMask = 0

  constructor(plan: Plan) {
    this.plan = plan
    this.base = new StatBlock().copyFrom(plan.stats)
    this.scratch = new StatBlock().copyFrom(this.base)
    this.deriveOptions = { profile: plan.profile, applyUnmeasured: plan.applyUnmeasured, level: plan.playerLevel }
    this.counters = new Float64Array(plan.sources.length * FIELD_COUNT)
    this.manaBySource = new Float64Array(plan.sources.length)

    const w = plan.weapons
    this.hasWeapon = new Uint8Array(2)
    this.wMin = new Float64Array(2)
    this.wMax = new Float64Array(2)
    this.wSpeedSec = new Float64Array(2)
    this.wFlat = new Float64Array(2)
    this.wHandMult = new Float64Array(2)
    this.wSkill = new Float64Array(2)
    this.wHitBonus = new Float64Array(2)
    this.wCritBonus = new Float64Array(2)
    this.wArmorPenPct = new Float64Array(2)
    this.wGlanceLow = new Float64Array(2)
    this.wGlanceHigh = new Float64Array(2)
    this.wTwoHand = new Uint8Array(2)
    this.wNormRageTenths = new Float64Array(2)
    this.wRageMult = new Float64Array(2)
    this.wNormSpeed = new Float64Array(2)
    for (let h = 0; h < 2; h++) this.loadHand(h, w[h])
    const rage = plan.profile.rage
    this.dualWield = w[HAND.main] !== null && w[HAND.off] !== null
    this.normalizedRage = rage.white === 'normalized'
    this.carryRageFraction = rage.fraction === 'carry'
    this.avoidedRageShare = rage.avoidedWhiteShare
    this.rageConv = rageConversion(plan.playerLevel)
    this.staticPhysMult = plan.damageMult * plan.physicalMult
    this.staticMagicMult = plan.damageMult
    this.bossLevelResist = levelResistance(plan.fight.targetLevel, plan.playerLevel)
    this.maxRage = plan.rage.maxTenths

    const procs = plan.procs
    const np = procs.length
    this.pTrigger = new Int32Array(np)
    this.pChance = new Float64Array(np * 2)
    this.pHands = new Int32Array(np)
    this.pIcd = new Float64Array(np)
    this.pAction = new Int32Array(np)
    this.pAmount = new Float64Array(np)
    this.pA = new Float64Array(np)
    this.pB = new Float64Array(np)
    this.pSchool = new Int32Array(np)
    this.pSource = new Int32Array(np)
    this.pChainBit = new Int32Array(np)
    this.pReqAura = new Int32Array(np).fill(-1)
    this.pPpm = new Float64Array(np)
    this.pForms = new Int32Array(np)
    this.pBleedSlot = new Int32Array(np).fill(-1)
    this.pPoison = new Uint8Array(np)
    this.pDotSlot = new Int32Array(np).fill(-1)
    this.pDuration = new Float64Array(np)
    this.pPeriodicCrit = new Uint8Array(np)
    this.procReadyAt = new Float64Array(np)
    let bleeds = 0
    let stackingDots = 0
    const dotSlots = new Map<string, number>()
    for (let i = 0; i < np; i++) {
      const p = procs[i]
      this.pTrigger[i] = p.trigger
      this.pChance[2 * i] = p.chance[0]
      this.pChance[2 * i + 1] = p.chance[1]
      this.pHands[i] = p.hands
      this.pIcd[i] = p.icdMs
      this.pAction[i] = p.action
      this.pAmount[i] = p.amount
      this.pA[i] = p.a
      this.pB[i] = p.b
      this.pSchool[i] = p.school
      this.pSource[i] = p.source
      this.pChainBit[i] = p.chainBit
      this.pReqAura[i] = p.requiresAura ?? -1
      this.pPpm[i] = p.ppm ?? 0
      this.pForms[i] = p.forms ?? 0
      if (p.action === ACTION.weaponBleed) this.pBleedSlot[i] = bleeds++
      this.pPoison[i] = p.poison ? 1 : 0
      this.pDuration[i] = p.durationMs ?? 0
      // docs/mechanics/damage-and-timing.md#4-dots-and-bleeds: flagged ticks crit only in `forever`
      this.pPeriodicCrit[i] = p.periodicCanCrit && plan.profile.combat.periodicCrits ? 1 : 0
      // One poison on the target whichever weapon applies it: the procs of one id share a slot.
      if (p.action === ACTION.stackingDot) {
        let slot = dotSlots.get(p.id)
        if (slot === undefined) dotSlots.set(p.id, (slot = stackingDots++))
        this.pDotSlot[i] = slot
      }
    }
    this.dotStacks = new Int32Array(stackingDots)
    this.dotEnd = new Float64Array(stackingDots)
    this.sdNextAt = new Float64Array(stackingDots)
    this.sdGen = new Int32Array(stackingDots)
    this.sdProc = new Int32Array(stackingDots)
    for (let i = 0; i < np; i++) if (this.pDotSlot[i] >= 0) this.sdProc[this.pDotSlot[i]] = i
    // Only a shapeshift changes a PPM proc's main-hand chance (druid.md §2.1), so only a plan with forms lists them.
    this.ppmProcs = Int32Array.from(plan.forms ? procs.flatMap((p, i) => (p.ppm && p.hands & 1 ? [i] : [])) : [])
    this.bleedTicksLeft = new Int32Array(bleeds)
    this.bleedGen = new Int32Array(bleeds)
    this.bleedNextAt = new Float64Array(bleeds)
    this.bleedProc = new Int32Array(bleeds)
    for (let i = 0; i < np; i++) if (this.pBleedSlot[i] >= 0) this.bleedProc[this.pBleedSlot[i]] = i
    // docs/mechanics/spells.md §10: a spell proc's schools and spell.
    this.pSchools = Int32Array.from(procs, (p) => p.schools ?? 0)
    this.pFromSource = Int32Array.from(procs, (p) => p.fromSource ?? -1)
    // docs/classes/druid.md §11.3: a rate per minute of casting reads the spell's row's cast time.
    this.pPpmCast = Float64Array.from(procs, (p) => p.ppmCast ?? 0)
    this.srcProcCastMs = new Float64Array(plan.sources.length)
    for (const x of plan.spells ?? []) if (x.procCastMs !== undefined) this.srcProcCastMs[x.source] = x.procCastMs
    this.triggerLists = []
    this.gatedLists = []
    for (let t = 0; t < TRIGGER_COUNT; t++) {
      const list = plan.triggers[t] ?? []
      // A proc that needs an aura or a form (druid.md §2.8), or names a spell's schools or row
      // (docs/mechanics/spells.md §10), is gated; the rest roll with no check.
      const gated = (p: number) => this.pReqAura[p] >= 0 || this.pForms[p] !== 0 || this.pSchools[p] !== 0 || this.pFromSource[p] >= 0 || this.pPpmCast[p] > 0
      this.triggerLists.push(Int32Array.from(list.filter((p) => !gated(p))))
      this.gatedLists.push(Int32Array.from(list.filter(gated)))
    }

    const auras = plan.auras
    const na = auras.length
    this.aDuration = new Float64Array(na)
    this.aMaxStacks = new Int32Array(na)
    this.aCharges = new Int32Array(na)
    this.aStr = new Float64Array(na)
    this.aAgi = new Float64Array(na)
    this.aAp = new Float64Array(na)
    this.aApPct = new Float64Array(na)
    this.aCrit = new Float64Array(na)
    this.aSpellCrit = new Float64Array(na)
    this.aHaste = new Float64Array(na)
    this.aDamage = new Float64Array(na)
    this.aStatful = new Uint8Array(na)
    this.auraEnd = new Float64Array(na)
    this.aKeepsEnd = new Uint8Array(na)
    for (const p of plan.procs) if (p.action === ACTION.aura && p.b > 0) this.aKeepsEnd[p.amount] = 1
    this.aCritCharges = new Int32Array(na)
    this.aDodge = new Float64Array(na)
    this.aParry = new Float64Array(na)
    this.aBlock = new Float64Array(na)
    this.aBlockValue = new Float64Array(na)
    this.aArmor = new Float64Array(na)
    this.aTaken = new Float64Array(na)
    this.aBlockCharges = new Int32Array(na)
    this.aTargetArmor = new Float64Array(na)
    this.aBossSlow = new Float64Array(na)
    this.aBossAp = new Float64Array(na)
    this.aBossDebuff = new Uint8Array(na)
    this.aItemArmorPct = new Float64Array(na)
    this.auraActive = new Uint8Array(na)
    this.auraStacks = new Int32Array(na)
    this.auraCharges = new Int32Array(na)
    this.auraCritCharges = new Int32Array(na)
    this.auraBlockCharges = new Int32Array(na)
    this.auraGen = new Int32Array(na)
    this.auraSince = new Float64Array(na)
    this.auraUpMs = new Float64Array(na)
    this.auraApplications = new Float64Array(na)
    this.auraStackSince = new Float64Array(na)
    this.auraStackMs = new Float64Array(na)
    // docs/mechanics/spells.md §5: an aura's spell damage, a stat like the others.
    this.aSpellDamage = Float64Array.from(auras, (a) => a.spellDamage ?? 0)
    // docs/classes/warlock.md#72-race: a spell damage % (Blood Fury's), a stat too.
    this.aSpellDamagePct = Float64Array.from(auras, (a) => a.spellDamagePct ?? 0)
    const chargeAuras: number[] = []
    const critChargeAuras: number[] = []
    const blockChargeAuras: number[] = []
    for (let i = 0; i < na; i++) {
      const a = auras[i]
      this.aDuration[i] = a.durationMs
      this.aMaxStacks[i] = Math.max(1, a.maxStacks)
      this.aCharges[i] = a.whiteSwingCharges
      this.aStr[i] = a.str
      this.aAgi[i] = a.agi
      this.aAp[i] = a.ap
      this.aApPct[i] = a.apPct
      this.aCrit[i] = a.crit
      this.aSpellCrit[i] = a.spellCrit
      this.aHaste[i] = a.haste
      this.aDamage[i] = a.damage
      this.aDodge[i] = a.dodge ?? 0
      this.aParry[i] = a.parry ?? 0
      this.aBlock[i] = a.block ?? 0
      this.aBlockValue[i] = a.blockValue ?? 0
      this.aArmor[i] = a.armor ?? 0
      this.aTaken[i] = a.damageTaken ?? 0
      this.aBlockCharges[i] = a.blockCharges ?? 0
      this.aTargetArmor[i] = a.targetArmor ?? 0
      this.aBossSlow[i] = a.bossSlow ?? 0
      this.aBossAp[i] = a.bossAp ?? 0
      this.aBossDebuff[i] = this.aBossSlow[i] || this.aBossAp[i] ? 1 : 0
      this.aItemArmorPct[i] = a.itemArmorPct ?? 0
      const defensive = this.aDodge[i] || this.aParry[i] || this.aBlock[i] || this.aBlockValue[i] || this.aArmor[i] || this.aItemArmorPct[i]
      // A debuff's armor (Faerie Fire, druid.md §3.8; Sunder Armor, warrior.md §7) re-derives the
      // armor factor with the stats.
      this.aStatful[i] = a.str || a.agi || a.ap || a.apPct || a.crit || a.spellCrit || defensive || this.aTargetArmor[i] || this.aSpellDamage[i] || this.aSpellDamagePct[i] ? 1 : 0
      this.aCritCharges[i] = a.critCharges
      if (a.whiteSwingCharges > 0) chargeAuras.push(i)
      if (a.critCharges > 0) critChargeAuras.push(i)
      if (this.aBlockCharges[i] > 0) blockChargeAuras.push(i)
    }
    this.chargeAuras = Int32Array.from(chargeAuras)
    this.critChargeAuras = Int32Array.from(critChargeAuras)
    this.blockChargeAuras = Int32Array.from(blockChargeAuras)
    this.blockChargeGen = new Int32Array(blockChargeAuras.length)
    // paladin.md: Vengeance's Holy damage, JotC's Holy damage taken, and exclusive groups (one seal).
    this.aHoly = Float64Array.from(auras, (a) => a.holy ?? 0)
    this.aHolyTaken = Float64Array.from(auras, (a) => a.holyTaken ?? 0)
    this.aGroupNext = ring(auras.map((a) => a.group))
    this.aTakenCharges = Int32Array.from(auras, (a) => a.takenCharges ?? 0)
    this.takenChargeAuras = Int32Array.from(auras.flatMap((a, i) => ((a.takenCharges ?? 0) > 0 ? [i] : [])))
    this.auraTakenCharges = new Int32Array(na)
    this.takenChargeGen = new Int32Array(this.takenChargeAuras.length)
    this.aChargeIcd = Float64Array.from(auras, (a) => a.whiteSwingChargeIcdMs ?? 0)
    this.auraChargeReadyAt = new Float64Array(na)
    // The rogue's: Adrenaline Rush's Energy, Venom's poison damage and chance (rogue.md §3.7, §4.4).
    this.aEnergyRegen = Float64Array.from(auras, (a) => a.energyRegen ?? 0)
    this.aPoisonDamage = Float64Array.from(auras, (a) => a.poisonDamage ?? 0)
    this.aPoisonChance = Float64Array.from(auras, (a) => a.poisonChance ?? 0)
    this.aBleedDamage = Float64Array.from(auras, (a) => a.bleedDamage ?? 0)
    // docs/mechanics/spells.md §4, §5, §8, §9: school mods, casting speed and the mana hooks.
    this.aSchoolMask = Int32Array.from(auras, (a) => a.schoolMask ?? 0)
    this.aSchoolDamage = Float64Array.from(auras, (a) => a.schoolDamage ?? 0)
    this.aSchoolTaken = Float64Array.from(auras, (a) => a.schoolTaken ?? 0)
    this.aSchoolCrit = Float64Array.from(auras, (a) => a.schoolCrit ?? 0)
    this.aCastHaste = Float64Array.from(auras, (a) => a.castHaste ?? 0)
    this.aSpiritRegen = Float64Array.from(auras, (a) => a.spiritRegen ?? 0)
    this.aCastingRegen = Float64Array.from(auras, (a) => a.castingRegen ?? 0)
    this.aGcdPct = Float64Array.from(auras, (a) => a.gcdPct ?? 0)
    this.aSchool = Uint8Array.from(auras, (a) =>
      (a.schoolMask && (a.schoolDamage || a.schoolTaken || a.schoolCrit)) || a.castHaste || a.spiritRegen || a.castingRegen || a.gcdPct ? 1 : 0,
    )
    // docs/classes/mage.md#combustion, #arcane-power: crit charges by school, charges a refresh keeps, mana cost.
    this.aCritChargeSchools = Int32Array.from(auras, (a) => a.critChargeSchools ?? 0)
    this.aKeepsCharges = Uint8Array.from(auras, (a) => (a.refreshKeepsCharges ? 1 : 0))
    this.aManaCost = Float64Array.from(auras, (a) => a.manaCostPct ?? 0)
    // docs/mechanics/ranged-and-pets.md §3, §4, §8: ranged attack power and haste, and the pet mods.
    this.aRap = Float64Array.from(auras, (a) => a.rap ?? 0)
    this.aRapPct = Float64Array.from(auras, (a) => a.rapPct ?? 0)
    this.aRangedHaste = Float64Array.from(auras, (a) => a.rangedHaste ?? 0)
    this.aPetAp = Float64Array.from(auras, (a) => a.petAp ?? 0)
    this.aPetCrit = Float64Array.from(auras, (a) => a.petCrit ?? 0)
    this.aPetHaste = Float64Array.from(auras, (a) => a.petHaste ?? 0)
    this.aPetDamage = Float64Array.from(auras, (a) => a.petDamage ?? 0)
    this.aPetful = Uint8Array.from(auras, (a) => (a.petAp || a.petCrit || a.petHaste || a.petDamage ? 1 : 0))
    for (let i = 0; i < na; i++) if (this.aRap[i] || this.aRapPct[i]) this.aStatful[i] = 1
    // docs/classes/mage.md#ignite: the rolling Ignite's numbers, all 0 without one.
    const ignite = plan.ignite
    this.igPct = ignite?.pct ?? 0
    this.igTicks = ignite?.ticks ?? 0
    this.igTickMs = ignite?.tickMs ?? 0
    this.igSchool = ignite?.school ?? 0
    this.igSource = ignite?.source ?? -1
    this.igAura = ignite?.aura ?? -1

    const spells = plan.spells ?? []
    // docs/classes/mage.md#winters-chill: a spell's crit from an aura's stacks.
    this.splCritAura = Int32Array.from(spells, (x) => x.critAura ?? -1)
    this.splCritAuraPct = Float64Array.from(spells, (x) => x.critAuraPct ?? 0)
    this.splBoostAura = Int32Array.from(spells, (x) => x.boostAura ?? -1)
    this.splBoostPct = Float64Array.from(spells, (x) => x.boostPct ?? 0)
    this.splBoostKeep = Uint8Array.from(spells, (x) => (x.boostKeep ? 1 : 0))
    this.splLowPct = Float64Array.from(spells, (x) => x.lowHealthPct ?? 0)
    this.splLowBelow = Float64Array.from(spells, (x) => x.lowHealthBelowPct ?? 0)
    this.splLowAt = new Float64Array(spells.length).fill(Infinity)
    this.lowHealthSpells = Int32Array.from(spells.flatMap((x, i) => ((x.lowHealthPct ?? 0) !== 0 ? [i] : [])))
    this.splDotMult = Float64Array.from(spells, (x) => x.dotDamageMult ?? x.damageMult)
    this.splSource = Int32Array.from(spells, (x) => x.source)
    this.splSchool = Int32Array.from(spells, (x) => x.school)
    this.splDefense = Int32Array.from(spells, (x) => x.defense)
    this.splNoActive = Uint8Array.from(spells, (x) => (x.noActiveDefense ? 1 : 0))
    this.splAlwaysHit = Uint8Array.from(spells, (x) => (x.alwaysHit ? 1 : 0))
    this.splTriggersProcs = Uint8Array.from(spells, (x) => (x.triggersProcs ? 1 : 0))
    this.splMin = Float64Array.from(spells, (x) => x.min)
    this.splMax = Float64Array.from(spells, (x) => x.max)
    this.splWeaponPct = Float64Array.from(spells, (x) => x.weaponPercent)
    this.splNormalized = Uint8Array.from(spells, (x) => (x.normalized ? 1 : 0))
    this.splFlatApart = Uint8Array.from(spells, (x) => (x.flatApart ? 1 : 0))
    this.splWeaponDps = Float64Array.from(spells, (x) => x.weaponDps ?? 0)
    this.splWeaponDpsAp = Uint8Array.from(spells, (x) => (x.weaponDpsAp ? 1 : 0))
    this.splSpCoef = Float64Array.from(spells, (x) => x.spCoefficient)
    this.splTakenScale = Float64Array.from(spells, (x) => x.takenScale)
    this.splCritMult = Float64Array.from(spells, (x) => x.critMultiplier)
    this.splBonusCrit = Float64Array.from(spells, (x) => x.bonusCrit)
    this.splDamageMult = Float64Array.from(spells, (x) => x.damageMult)
    this.splThreatMult = Float64Array.from(spells, (x) => x.threatMult)
    this.splThreatBonus = Float64Array.from(spells, (x) => x.threatBonus)
    this.splNoCrit = Uint8Array.from(spells, (x) => (x.cannotCrit ? 1 : 0))
    // docs/mechanics/ranged-and-pets.md §5: a shot rolls the ranged table, with the ranged weapon.
    this.splRanged = Uint8Array.from(spells, (x) => (x.ranged && plan.ranged ? 1 : 0))
    this.staticHolyMult = plan.holyMult ?? 1
    this.holyThreatMult = plan.holyThreatMult ?? 1
    // docs/mechanics/spells.md §3, §7: binary spells and DoTs. A tick crits only with the spell's
    // flag, in a profile whose periodic effects can (damage-and-timing §4).
    this.splBinary = Uint8Array.from(spells, (x) => (x.binary ? 1 : 0))
    this.splHasDirect = Uint8Array.from(spells, (x) => (x.min > 0 || x.max > 0 || x.spCoefficient > 0 || x.weaponPercent > 0 || (x.weaponDps ?? 0) > 0 || !(x.dotTicks ?? 0) ? 1 : 0))
    this.splDotTicks = Int32Array.from(spells, (x) => x.dotTicks ?? 0)
    this.splDotTickMs = Float64Array.from(spells, (x) => x.dotTickMs ?? 0)
    this.splDotTick = Float64Array.from(spells, (x) => x.dotTickDamage ?? 0)
    this.splDotCoef = Float64Array.from(spells, (x) => x.dotSpCoefficient ?? 0)
    this.splDotCanCrit = Uint8Array.from(spells, (x) => (x.dotCanCrit && plan.profile.combat.periodicCrits ? 1 : 0))
    this.splDotSource = Int32Array.from(spells, (x) => x.dotSource ?? x.source)
    this.splDotAura = Int32Array.from(spells, (x) => x.dotAura ?? -1)
    this.spDotTicksLeft = new Int32Array(spells.length)
    this.spDotGen = new Int32Array(spells.length)
    this.spDotNextAt = new Float64Array(spells.length)
    this.spDotDamage = new Float64Array(spells.length)
    this.spDotCrit = new Float64Array(spells.length)
    // docs/mechanics/spells.md §5, §9 and combat-tables §9: the schools' static multipliers and crit,
    // and 1 − the boss's average resist per school. Holy and physical have no resistance; without a
    // school plan every other school has the boss's level-based resistance.
    const schools = plan.schools
    for (let k = 0; k < SCHOOL_COUNT; k++) {
      if (schools) {
        this.schStaticDamage[k] = schools.damage[k]
        this.schStaticTaken[k] = schools.taken[k]
        this.schStaticCrit[k] = schools.crit[k]
      }
      const resistible = k !== SCHOOL.holy && k !== SCHOOL.physical
      const resist = resistible ? averageResist(schools ? schools.resistance[k] : this.bossLevelResist, plan.playerLevel) : 0
      this.resistFactor[k] = resistible ? 1 - resist : 1
      this.resistChance[k] = Math.max(0, resist)
    }
    // docs/classes/mage.md#talents: spell hit per school (Elemental Precision), only when set.
    this.hasSchoolHit = schools?.hit !== undefined
    if (schools?.hit) this.schStaticHit.set(schools.hit)

    const abilities = plan.abilities
    const nb = abilities.length
    this.abKind = new Int32Array(nb)
    this.abCost = new Int32Array(nb)
    this.abCd = new Float64Array(nb)
    this.abGcd = new Float64Array(nb)
    this.abCastMs = new Float64Array(nb)
    this.abCastStopsSwings = new Uint8Array(nb)
    this.abCastHolds = new Uint8Array(nb)
    this.abNeverReady = new Uint8Array(nb)
    this.abUnavoidable = new Uint8Array(nb)
    this.abWindow = new Int32Array(nb)
    this.abDances = new Uint8Array(nb)
    this.abDanceMaxRage = new Float64Array(nb).fill(-Infinity)
    this.abWeaponPct = new Float64Array(nb)
    this.abNormalized = new Uint8Array(nb)
    this.abFlat = new Float64Array(nb)
    this.abFlatSpread = new Float64Array(nb)
    this.abBlockValueCoef = new Float64Array(nb)
    this.abNoDamage = new Uint8Array(nb)
    this.abApCoef = new Float64Array(nb)
    this.abBonusCrit = new Float64Array(nb)
    this.abCritMult = new Float64Array(nb)
    this.abRefund = new Float64Array(nb)
    this.abThreatMult = new Float64Array(nb)
    this.abThreatBonus = new Float64Array(nb)
    this.abSource = new Int32Array(nb)
    this.abStances = new Int32Array(nb)
    this.abPerExtraRage = new Float64Array(nb)
    this.abOffSource = new Int32Array(nb)
    this.abUnqueueBelow = new Int32Array(nb)
    this.abUnqueueAtExecute = new Uint8Array(nb)
    this.abAura = new Int32Array(nb)
    this.abRage = new Int32Array(nb)
    this.abTickRage = new Int32Array(nb)
    this.abTicks = new Int32Array(nb)
    this.abTickMs = new Float64Array(nb)
    this.abRageSpread = new Int32Array(nb)
    this.abDotTick = new Float64Array(nb)
    this.abDotTicks = new Int32Array(nb)
    this.abDotTickMs = new Float64Array(nb)
    this.abDotCanCrit = new Uint8Array(nb)
    this.dotTicksLeft = new Int32Array(nb)
    this.dotGen = new Int32Array(nb)
    this.dotNextAt = new Float64Array(nb)
    this.dotDamage = new Float64Array(nb)
    this.dotCrit = new Float64Array(nb)
    this.abUsesPerFight = new Int32Array(nb)
    this.abUses = new Int32Array(nb)
    this.abReadyAt = new Float64Array(nb)
    this.abTicksLeft = new Int32Array(nb)
    this.abTickGen = new Int32Array(nb)
    this.abRes = new Int32Array(nb)
    this.abForms = new Int32Array(nb)
    this.abCp = new Int32Array(nb)
    this.abCritCp = new Float64Array(nb)
    this.abFinisher = new Uint8Array(nb)
    this.abPerCp = new Float64Array(nb)
    this.abApPerCp = new Float64Array(nb)
    this.abCpApCap = new Int32Array(nb)
    this.abDotPerCp = new Float64Array(nb)
    this.abDotApPerCp = new Float64Array(nb)
    this.abFree = new Uint8Array(nb)
    this.abShiftTo = new Int32Array(nb).fill(-1)
    this.abPlainRage = new Uint8Array(nb)
    this.abFlatRange = new Float64Array(nb)
    this.abCritAura = new Int32Array(nb).fill(-1)
    this.abCritAuraPct = new Float64Array(nb)
    this.abBleedPct = new Float64Array(nb)
    this.abDotSource = new Int32Array(nb)
    this.abSpellHit = new Uint8Array(nb)
    this.abResist = new Float64Array(nb)
    this.abPctPerStack = new Float64Array(nb)
    this.abNoCdAura = new Int32Array(nb).fill(-1)
    this.abAuraMsPerCp = Float64Array.from(abilities, (a) => a.auraMsPerComboPoint ?? 0)
    this.abDotTicksPerCp = Int32Array.from(abilities, (a) => a.dotTicksPerComboPoint ?? 0)
    this.abFinishEnergyChance = Float64Array.from(abilities, (a) => a.finisherEnergyChancePerCp ?? 0)
    this.abFinishEnergy = Int32Array.from(abilities, (a) => a.finisherEnergyTenths ?? 0)
    this.abFinishCpChance = Float64Array.from(abilities, (a) => a.finisherComboPointChance ?? 0)
    this.abBonusCp = Float64Array.from(abilities, (a) => a.bonusComboPointChance ?? 0)
    this.abCpBackAtFive = Int32Array.from(abilities, (a) => a.comboPointsBackAtFive ?? 0)
    this.abCritAuraConsume = Uint8Array.from(abilities, (a) => (a.auraCrit?.consume ? 1 : 0))
    this.abPoisonedPct = Float64Array.from(abilities, (a) => a.poisonedTargetPct ?? 0)
    this.abLowPct = Float64Array.from(abilities, (a) => a.lowHealthPct ?? 0)
    this.abLowBelow = Float64Array.from(abilities, (a) => a.lowHealthBelowPct ?? 0)
    this.abLowAt = new Float64Array(nb).fill(Infinity)
    this.lowHealthAbilities = Int32Array.from(abilities.flatMap((a, i) => ((a.lowHealthPct ?? 0) !== 0 ? [i] : [])))
    this.abTickAura = Int32Array.from(abilities, (a) => a.tickAura ?? -1)
    this.abCostAura = Int32Array.from(abilities, (a) => a.costAura ?? -1)
    this.abCostPerStack = Int32Array.from(abilities, (a) => a.costPerStackTenths ?? 0)
    this.abOpensAura = Int32Array.from(abilities, (a) => a.opensAura ?? -1)
    this.abOpensChance = Float64Array.from(abilities, (a) => a.opensAuraChance ?? 0)
    this.othersBleed = plan.fight.othersBleed === true
    this.freeAura = plan.freeCastAura ?? -1
    this.freeCritPct = plan.freeCastCritPct ?? 0
    this.abTickAt = new Float64Array(nb)
    this.abSpell = Int32Array.from(abilities, (a) => a.spell ?? -1)
    this.abTickSpell = Int32Array.from(abilities, (a) => a.tickSpell ?? -1)
    this.abManaReturn = Float64Array.from(abilities, (a) => a.manaReturnTenths ?? 0)
    this.abManaReturnChance = Float64Array.from(abilities, (a) => a.manaReturnChance ?? 0)
    this.abManaGain = Float64Array.from(abilities, (a) => a.manaTenths ?? 0)
    this.abManaSpread = Int32Array.from(abilities, (a) => a.manaSpreadTenths ?? 0)
    this.abPetPower = Int32Array.from(abilities, (a) => a.petPowerTenths ?? 0)
    this.abCatNext = ring(abilities.map((a) => a.category))
    this.abStackAura = Int32Array.from(abilities, (a) => a.stackAura ?? -1)
    this.abStackCast = Float64Array.from(abilities, (a) => a.stackCastPct ?? 0)
    this.abStackCost = Float64Array.from(abilities, (a) => a.stackCostPct ?? 0)
    this.abSelfAura = Int32Array.from(abilities, (a) => a.selfAura ?? -1)
    // docs/classes/mage.md#presence-of-mind, #combustion: an instant-cast aura, and cooldowns that
    // start when the ability's aura ends, listed per aura.
    this.abInstantAura = Int32Array.from(abilities, (a) => a.instantAura ?? -1)
    this.abCdAfterAura = Uint8Array.from(abilities, (a) => (a.cooldownAfterAura && a.aura >= 0 ? 1 : 0))
    const cdAfter: number[][] = Array.from({ length: na }, () => [])
    abilities.forEach((a, i) => {
      if (a.cooldownAfterAura && a.aura >= 0) cdAfter[a.aura].push(i)
    })
    this.cdAfterStart = new Int32Array(na + 1)
    for (let k = 0; k < na; k++) this.cdAfterStart[k + 1] = this.cdAfterStart[k] + cdAfter[k].length
    this.cdAfterAbility = Int32Array.from(cdAfter.flat())
    this.abConsumesDot = Int32Array.from(abilities, (a) => a.consumesDot ?? -1)
    this.abConsumeChance = Float64Array.from(abilities, (a) => a.consumeChance ?? 0)
    this.abNoThreat = Uint8Array.from(abilities, (a) => (a.noThreat ? 1 : 0))
    for (let i = 0; i < nb; i++) {
      const a = abilities[i]
      // docs/classes/druid.md §2.4–§2.8: the pool it pays from, its forms, combo points and Clearcasting.
      this.abRes[i] = RESOURCE_CODE[a.resource ?? 'rage']
      this.abForms[i] = a.forms ?? 0
      this.abCp[i] = a.comboPoints ?? 0
      this.abCritCp[i] = a.critComboPointChance ?? 0
      this.abFinisher[i] = a.finisher ? 1 : 0
      this.abPerCp[i] = a.damagePerComboPoint ?? 0
      this.abApPerCp[i] = a.apCoefficientPerComboPoint ?? 0
      this.abCpApCap[i] = a.comboPointApCap ?? MAX_COMBO_POINTS
      this.abDotPerCp[i] = a.dotTickPerComboPoint ?? 0
      this.abDotApPerCp[i] = a.dotApCoefficientPerComboPoint ?? 0
      this.abFree[i] = a.clearcastable && this.freeAura >= 0 ? 1 : 0
      this.abShiftTo[i] = a.shiftTo ?? -1
      // druid.md §3: Ferocious Bite's range, Berserk's crit, Rend and Tear, Rake's bleed row, Faerie Fire's hit roll.
      this.abFlatRange[i] = a.flatDamageRange ?? 0
      if (a.auraCrit) {
        this.abCritAura[i] = a.auraCrit.aura
        this.abCritAuraPct[i] = a.auraCrit.pct
      }
      this.abBleedPct[i] = a.bleedingTargetPct ?? 0
      this.abDotSource[i] = a.dotSource ?? a.source
      this.abSpellHit[i] = a.spellHit ? 1 : 0
      // druid.md §4: the bear's Faerie Fire's resist (combat-tables §9: a binary spell's, at the boss's
      // level-based resistance; Physical and Holy have none), Lacerate's per-stack hit, and Berserk's Mangle.
      const school = a.spellSchool
      this.abResist[i] =
        a.kind === 'spellTable' && school !== undefined && school !== SCHOOL.holy && school !== SCHOOL.physical ? averageResist(this.bossLevelResist, plan.playerLevel) : 0
      this.abPctPerStack[i] = a.weaponPercentPerStack ?? 0
      this.abNoCdAura[i] = a.noCooldownAura ?? -1
      this.abPlainRage[i] = this.abRes[i] === RES_RAGE && this.abForms[i] === 0 && !a.finisher && !this.abCp[i] && !this.abFree[i] ? 1 : 0
      this.abKind[i] = KIND_CODE[a.kind]
      this.abCost[i] = a.costTenths
      this.abCd[i] = a.cooldownMs
      this.abGcd[i] = a.gcdMs
      this.abCastMs[i] = a.castMs
      this.abCastStopsSwings[i] = a.castStopsSwings ? 1 : 0
      this.abCastHolds[i] = a.castHoldsOffGcd ? 1 : 0
      // warrior.md §3.1: Spearing Strike needs a two-hander. §7 "Without a main-hand weapon": every
      // ability that attacks (strikes, melee spells, bleeds, the on-next-swing queue) needs one; casts
      // don't, nor does a shapeshift (druid.md §2.8), nor a spell unless it deals weapon damage (Holy
      // Strike, paladin.md), nor a spell-table ability (Thunder Clap, Demoralizing Shout) or one that
      // needs a shield instead (Shield Slam; Shield Block is a cast). Those need a shield (§3.1, §3.2).
      // docs/mechanics/ranged-and-pets.md §5: a shot needs the ranged weapon, not the main hand.
      const shot = a.kind === 'spell' && a.spell !== undefined && a.spell >= 0 && spells[a.spell].ranged === true
      const weaponSpell = a.kind === 'spell' && a.spell !== undefined && a.spell >= 0 && (spells[a.spell].weaponPercent > 0 || (spells[a.spell].weaponDps ?? 0) > 0) && !shot
      const needsWeapon =
        a.kind === 'spell'
          ? weaponSpell
          : a.kind !== 'cast' && a.kind !== 'shift' && a.kind !== 'spellTable' && a.kind !== 'channel' && a.shieldOnly !== true
      // druid.md §3.1: Shred needs you behind the target, so from the front it's never used.
      this.abNeverReady[i] =
        (a.twoHandOnly && !this.wTwoHand[HAND.main]) ||
        (a.shieldOnly === true && !plan.hasShield) ||
        (needsWeapon && !this.hasWeapon[HAND.main]) ||
        ((shot || a.needsRanged === true) && !plan.ranged) ||
        (a.behindOnly && plan.fight.front)
          ? 1
          : 0
      this.abUnavoidable[i] = a.unavoidable ? 1 : 0
      this.abWindow[i] = a.window
      this.abWeaponPct[i] = a.weaponPercent
      this.abNormalized[i] = a.normalized ? 1 : 0
      this.abFlat[i] = a.flatDamage
      this.abFlatSpread[i] = a.flatSpread ?? 0
      this.abBlockValueCoef[i] = a.blockValueCoefficient ?? 0
      this.abNoDamage[i] =
        a.weaponPercent === 0 &&
        (a.weaponPercentPerStack ?? 0) === 0 &&
        a.flatDamage === 0 &&
        a.apCoefficient === 0 &&
        a.damagePerExtraRage === 0 &&
        (a.blockValueCoefficient ?? 0) === 0 &&
        this.abCp[i] === 0 &&
        // A finisher deals damage per point or bleeds, unless it does neither (the rogue's Expose
        // Armor: a debuff only, rogue.md §3.6).
        (this.abFinisher[i] === 0 || (this.abPerCp[i] === 0 && this.abApPerCp[i] === 0 && a.dotTicks === 0 && (a.flatDamageRange ?? 0) === 0))
          ? 1
          : 0
      this.abApCoef[i] = a.apCoefficient
      this.abBonusCrit[i] = a.bonusCrit
      this.abCritMult[i] = a.critMultiplier
      this.abRefund[i] = a.refundShare
      this.abThreatMult[i] = a.threatMult
      this.abThreatBonus[i] = a.threatBonus
      this.abSource[i] = a.source
      this.abStances[i] = a.stances
      this.abPerExtraRage[i] = a.damagePerExtraRage
      this.abOffSource[i] = a.offHandSource
      this.abAura[i] = a.aura
      this.abRage[i] = a.rageTenths
      this.abTickRage[i] = a.rageTickTenths
      this.abTicks[i] = a.rageTicks
      this.abTickMs[i] = a.rageTickMs
      this.abRageSpread[i] = a.rageSpreadTenths
      this.abDotTick[i] = a.dotTickDamage
      this.abDotTicks[i] = a.dotTicks
      this.abDotTickMs[i] = a.dotTickMs
      // docs/mechanics/damage-and-timing.md#4-dots-and-bleeds: flagged ticks crit only in `forever`
      this.abDotCanCrit[i] = a.periodicCanCrit && plan.profile.combat.periodicCrits ? 1 : 0
      this.abUsesPerFight[i] = a.usesPerFight
    }
    this.abEndsCd = Int32Array.from(abilities, (a) => a.endsCooldownOf ?? -1)
    // docs/mechanics/spells.md §4, §6: casting speed, and a channel's cut-off.
    this.abCastHasted = Uint8Array.from(abilities, (a) => (a.castHasted ? 1 : 0))
    this.abGcdCut = Uint8Array.from(abilities, (a) => (a.gcdCut ? 1 : 0))
    this.abChargeAura = Int32Array.from(abilities, (a) => a.chargeAura ?? -1)
    this.abChargeCastMs = Float64Array.from(abilities, (a) => a.chargeCastMs ?? 0)
    this.abChannelTicks = Int32Array.from(abilities, (a) => a.channelTicks ?? 0)
    const prepull = plan.prepull
    this.preAbility = Int32Array.from(prepull.casts.map((c) => c.ability))
    this.preAt = Float64Array.from(prepull.casts.map((c) => c.atMs))
    this.preChargeTenths = prepull.chargeTenths
    this.preKeepTenths = prepull.keepTenths
    // Stances: the plan's static numbers are its base stance's; each stance's factors switch them.
    for (const st of plan.stances) {
      this.sDamage[st.stance] = st.damage
      this.sThreat[st.stance] = st.threat
      this.sTaken[st.stance] = st.damageTaken
      this.sCrit[st.stance] = st.crit
      this.sSpellCrit[st.stance] = st.spellCrit
    }
    this.baseStance = plan.stance
    this.swapCdMs = plan.stanceSwap.cooldownMs
    this.swapKeep = plan.stanceSwap.keepTenths
    const rotation = plan.rotation
    this.rotAbility = new Int32Array(rotation.length)
    this.entryDance = new Int32Array(rotation.length)
    this.entryStay = new Uint8Array(rotation.length)
    this.condStart = new Int32Array(rotation.length + 1)
    // Phase, time-left and aura-refresh conditions are resolved up front, into the per-phase lists
    // and a time window per line, so a walk never evaluates them.
    const resolved = (c: { code: number }) =>
      c.code === COND.executePhase ||
      c.code === COND.timeLeftAtMost ||
      c.code === COND.timeLeftAtLeast ||
      c.code === COND.executeWithin ||
      c.code === COND.executeNotWithin ||
      c.code === COND.abilityAuraRefresh
    const needs = (a: number) => (abilities[a].needsAura ?? -1) >= 0
    const nc = rotation.reduce((n, e) => n + e.conditions.filter((c) => !resolved(c)).length + (abilities[e.ability].window >= 0 ? 1 : 0) + (needs(e.ability) ? 1 : 0), 0)
    this.condCode = new Int32Array(nc)
    this.condA = new Float64Array(nc)
    this.condB = new Float64Array(nc)
    this.entryLeftAtMost = new Float64Array(rotation.length).fill(Infinity)
    this.entryLeftAtLeast = new Float64Array(rotation.length).fill(-Infinity)
    this.entryExecuteWithin = new Float64Array(rotation.length).fill(Infinity)
    this.entryExecuteNotWithin = new Float64Array(rotation.length).fill(-Infinity)
    this.entryBaseFrom = new Float64Array(rotation.length)
    this.entryFrom = new Float64Array(rotation.length)
    this.entryTo = new Float64Array(rotation.length)
    /** Bit 1: the entry can apply outside the execute phase; bit 2: inside it. */
    const phases: number[] = []
    /** [aura, line, lead] of each aura-refresh condition. */
    const watches: [number, number, number][] = []
    let k = 0
    for (let e = 0; e < rotation.length; e++) {
      const entry = rotation[e]
      const ability = abilities[entry.ability]
      this.rotAbility[e] = entry.ability
      // warrior.md §7: a dance goes to a stance that allows the ability, for a class with stances.
      const to = entry.danceTo ?? 0
      if (to !== 0 && (ability.stances & to) !== 0 && plan.stances.length > 0) {
        this.entryDance[e] = to
        this.abDances[entry.ability] = 1
        // The rage up to which this line dances (its maxRage: the Whirlwind dance's 30, §5.3 row 12).
        let upTo = Infinity
        for (const cond of entry.conditions) if (cond.code === COND.maxRage) upTo = Math.min(upTo, cond.a)
        this.abDanceMaxRage[entry.ability] = Math.max(this.abDanceMaxRage[entry.ability], upTo)
        // warrior.md §5.3 row 4: a line can stay in the stance it danced to.
        if (entry.stay) this.entryStay[e] = 1
      }
      this.abUnqueueBelow[entry.ability] = entry.unqueueBelowTenths
      this.condStart[e] = k
      // warrior.md §2.8: a reactive ability's lines need its window, checked first.
      if (ability.window >= 0) {
        this.condCode[k] = COND.windowOpen
        this.condA[k] = ability.window
        this.condB[k] = 0
        k++
      }
      // docs/classes/warlock.md §8: an ability that needs an aura up (Conflagrate: your Immolate) checks it first too.
      if (needs(entry.ability)) {
        this.condCode[k] = COND.auraUp
        this.condA[k] = ability.needsAura!
        this.condB[k] = 0
        k++
      }
      // Execute is refused outside the execute phase (warrior.md §3.1): its lines are execute-only.
      let phase = ability.executePhaseOnly ? 2 : 3
      for (const cond of entry.conditions) {
        if (cond.code === COND.executePhase) {
          phase &= cond.a === 1 ? 2 : 1
          // warrior.md §7: a queued on-next-swing ability whose line stops in the phase is cancelled when it starts.
          if (cond.a === 0 && ability.kind === 'onNextSwing') this.abUnqueueAtExecute[entry.ability] = 1
          continue
        }
        if (cond.code === COND.timeLeftAtMost) {
          this.entryLeftAtMost[e] = Math.min(this.entryLeftAtMost[e], cond.a)
          continue
        }
        if (cond.code === COND.timeLeftAtLeast) {
          this.entryLeftAtLeast[e] = Math.max(this.entryLeftAtLeast[e], cond.a)
          continue
        }
        if (cond.code === COND.executeWithin) {
          this.entryExecuteWithin[e] = Math.min(this.entryExecuteWithin[e], cond.a)
          continue
        }
        if (cond.code === COND.executeNotWithin) {
          this.entryExecuteNotWithin[e] = Math.max(this.entryExecuteNotWithin[e], cond.a)
          continue
        }
        if (cond.code === COND.abilityAuraRefresh) {
          // warrior.md §5.2 row 1: usable while the aura is down, or from `lead` before its end.
          const aura = abilities[cond.a].aura
          if (aura >= 0) watches.push([aura, e, cond.b])
          continue
        }
        this.condCode[k] = cond.code
        this.condA[k] = cond.a
        this.condB[k] = cond.b
        k++
      }
      phases.push(phase)
    }
    this.condStart[rotation.length] = k
    watches.sort((x, y) => x[0] - y[0] || x[1] - y[1])
    this.watchStart = new Int32Array(auras.length + 1)
    for (const [aura] of watches) this.watchStart[aura + 1]++
    for (let i = 0; i < auras.length; i++) this.watchStart[i + 1] += this.watchStart[i]
    this.watchLine = Int32Array.from(watches.map((w) => w[1]))
    this.watchLead = Float64Array.from(watches.map((w) => w[2]))
    const entries = (phase: number, offGcdOnly: boolean) =>
      Int32Array.from(
        rotation.map((_, e) => e).filter((e) => phases[e] & phase && (!offGcdOnly || abilities[rotation[e].ability].gcdMs === 0)),
      )
    this.rotNormal = entries(1, false)
    this.rotExecute = entries(2, false)
    this.offGcdNormal = entries(1, true)
    this.offGcdExecute = entries(2, true)
    this.rotList = this.rotNormal
    this.rotOffList = this.offGcdNormal
    const wakes = new Set<number>()
    for (const x of this.entryLeftAtMost) if (x !== Infinity) wakes.add(x)
    this.wakeTimeLeft = Float64Array.from([...wakes].sort((x, y) => y - x))
    this.wakeExecuteWithin = Float64Array.from(new Set(this.entryExecuteWithin.filter((x) => x !== Infinity)))
    this.hasMaxRage = this.condCode.includes(COND.maxRage)
    this.hasDodgeProcs = (plan.triggers[TRIGGER.targetDodge] ?? []).length > 0
    this.hasRotation = rotation.length > 0
    // Spells on the melee table read the special-attack tables too (paladin.md#conventions-used-below).
    this.hasAbilities = nb > 0 || spells.length > 0
    this.hasWeaponlessAttacks =
      abilities.some((a) => a.kind === 'spellTable' || (a.shieldOnly === true && a.kind !== 'cast')) ||
      spells.some((x) => x.defense === DEFENSE.melee || x.defense === DEFENSE.ranged)
    this.hasWhiteResolved = (plan.triggers[TRIGGER.whiteResolved] ?? []).length > 0
    this.hasSpellLanded = (plan.triggers[TRIGGER.spellLanded] ?? []).length > 0
    this.hasSpellTick = (plan.triggers[TRIGGER.spellTick] ?? []).length > 0
    // docs/classes/druid.md §2.4, §2.8: forms, Furor, and the power tick's Energy and mana.
    const shift = plan.shapeshift
    this.startForm = plan.forms && plan.form !== undefined ? plan.form : -1
    this.form = this.startForm
    this.catForm = shift?.cat ?? -1
    this.bearForm = shift?.bear ?? -1
    this.casterForm = shift?.caster ?? -1
    this.furorRank = shift?.furorRank ?? 0
    this.bearEntryRage = shift?.bearRageTenths ?? 0
    this.bearEntryRageChance = shift?.bearRageChance ?? 0
    this.energyMax = plan.energy?.maxTenths ?? 0
    this.energyStart = plan.energy?.startTenths ?? 0
    this.energyTick = plan.energy?.tickTenths ?? 0
    this.manaMax = plan.mana?.maxTenths ?? 0
    this.manaRegen = plan.mana?.regenTickTenths ?? 0
    this.fiveSecondRuleMs = plan.mana?.fiveSecondRuleMs ?? 0
    // paladin.md#mana-model: mp5 per tick, and Reverence's share of spirit regeneration inside the rule.
    this.manaMp5 = plan.mana?.mp5TickTenths ?? 0
    this.manaInFsrShare = plan.mana?.inFsrShare ?? 0
    // docs/classes/shaman.md: Improved Stormstrike's share while its aura is up.
    this.hasPowerTick = plan.energy !== undefined || plan.mana !== undefined
    this.hasMaxEnergy = this.condCode.includes(COND.maxEnergy)
    // Hits give rage in a form whose power is rage, and for a class with a rage pool: a warrior, not a
    // paladin (plan.rage.maxTenths 0, paladin.md#mana-model).
    this.gainsRage = this.startForm >= 0 ? plan.forms![this.startForm].rage : this.maxRage > 0

    // docs/mechanics/ranged-and-pets.md §2–§5: the ranged weapon and Auto Shot.
    const r = plan.ranged
    this.hasRanged = r !== undefined
    this.rMin = r?.min ?? 0
    this.rMax = r?.max ?? 0
    this.rSpeedSec = r?.speedSec ?? 0
    this.rFlat = r?.flatDamage ?? 0
    this.rSkill = r?.skill ?? 0
    this.rHitBonus = r?.hitBonus ?? 0
    this.rCritBonus = r?.critBonus ?? 0
    this.rDamageMult = r?.damageMult ?? 1
    this.rStaticHaste = r?.hasteMult ?? 1
    this.rNormSpeed = r?.normalizedSpeed ?? 0
    this.rBaseWindupMs = r?.windupMs ?? 0
    this.rWindupMs = this.rBaseWindupMs
    this.rWindupHasted = r?.windupHasted === true
    this.rCastsHold = r?.castsHoldAutoShot === true
    this.rCritMult = r?.critMultiplier ?? CRIT_MULTIPLIER.melee
    this.rFirstShotMs = r?.firstShotMs ?? 0
    this.rSource = r?.source ?? -1
    this.abCastRangedHasted = Uint8Array.from(abilities, (a) => (a.castRangedHasted && r ? 1 : 0))
    this.walksOnAutoShot = this.hasRanged && (this.condCode.includes(COND.autoShotClear) || this.condCode.includes(COND.autoShotWithin))
    // §6–§10: the pet.
    const pet = plan.pet
    this.hasPet = pet !== undefined
    this.petHasWeapon = pet?.weapon != null
    this.petWMin = pet?.weapon?.min ?? 0
    this.petWMax = pet?.weapon?.max ?? 0
    this.petWSpeedSec = pet?.weapon?.speedSec ?? 0
    this.petLevel = pet?.level ?? plan.playerLevel
    this.petSkill = pet?.skill ?? 0
    this.petBaseAp = pet?.ap ?? 0
    this.petBaseCrit = pet?.crit ?? 0
    this.petAuraCritBase = pet?.auraCrit ?? 0
    this.petHit = pet?.hit ?? 0
    this.petBaseSp = pet?.spellDamage ?? 0
    this.petSpellCrit = pet?.spellCrit ?? 0
    this.petSpellHit = pet?.spellHit ?? 0
    this.petApFromAp = pet?.apFromOwnerAp ?? 0
    this.petApFromRap = pet?.apFromOwnerRap ?? 0
    this.petSpFromOwner = pet?.spellDamageFromOwner ?? 0
    this.petCritFromOwner = pet?.critFromOwnerSpellCrit ?? 0
    this.petHitFromOwner = pet?.hitFromOwnerSpellHit ?? 0
    this.petStaticDamage = pet?.damageMult ?? 1
    this.petStaticHaste = pet?.hasteMult ?? 1
    this.petCritMult = pet?.critMultiplier ?? CRIT_MULTIPLIER.melee
    this.petGlances = pet?.glances ?? false
    this.petGlanceLow = pet?.glanceLow ?? 1
    this.petGlanceHigh = pet?.glanceHigh ?? 1
    this.petFront = pet?.front ?? false
    this.petStartMs = pet?.startMs ?? 0
    this.petSource = pet?.source ?? -1
    const power = pet?.power ?? null
    this.hasPetPower = power !== null
    this.petPowerMax = power?.maxTenths ?? 0
    this.petPowerStart = power?.startTenths ?? 0
    this.petPowerTick = power?.tickTenths ?? 0
    this.petPowerTickMs = power?.tickMs ?? 0
    const pabs = pet?.abilities ?? []
    this.pabKind = Uint8Array.from(pabs, (x) => (x.kind === 'buff' ? PAB_BUFF : x.kind === 'spell' ? PAB_SPELL : PAB_MELEE))
    this.pabSchool = Int32Array.from(pabs, (x) => x.school)
    this.pabCost = Int32Array.from(pabs, (x) => x.costTenths)
    this.pabCd = Float64Array.from(pabs, (x) => x.cooldownMs)
    this.pabGcd = Float64Array.from(pabs, (x) => x.gcdMs)
    this.pabCast = Float64Array.from(pabs, (x) => x.castMs)
    this.pabMin = Float64Array.from(pabs, (x) => x.min)
    this.pabMax = Float64Array.from(pabs, (x) => x.max)
    this.pabApCoef = Float64Array.from(pabs, (x) => x.apCoefficient)
    this.pabSpCoef = Float64Array.from(pabs, (x) => x.spCoefficient)
    this.pabWeaponPct = Float64Array.from(pabs, (x) => x.weaponPercent)
    this.pabBonusCrit = Float64Array.from(pabs, (x) => x.bonusCrit)
    this.pabCritMult = Float64Array.from(pabs, (x) => x.critMultiplier)
    this.pabAura = Int32Array.from(pabs, (x) => x.aura)
    this.pabSource = Int32Array.from(pabs, (x) => x.source)
    this.pabReadyAt = new Float64Array(pabs.length)
    const petLines = pet?.rotation ?? []
    this.petLineAbility = Int32Array.from(petLines, (l) => l.ability)
    this.petCondStart = new Int32Array(petLines.length + 1)
    for (let l = 0; l < petLines.length; l++) this.petCondStart[l + 1] = this.petCondStart[l] + petLines[l].conditions.length
    const petConds = petLines.flatMap((l) => l.conditions)
    this.petCondCode = Int32Array.from(petConds, (c) => c.code)
    this.petCondA = Float64Array.from(petConds, (c) => c.a)
  }

  /**
   * Puts a weapon in hand h (null: none): its damage, speed, skill and table inputs, and its white
   * rage. The constructor loads the plan's weapons; a shapeshift loads the form's main hand
   * (druid.md §2.1).
   */
  private loadHand(h: number, weapon: WeaponPlan | null): void {
    if (!weapon) {
      this.hasWeapon[h] = 0
      return
    }
    const rage = this.plan.profile.rage
    this.hasWeapon[h] = 1
    this.wMin[h] = weapon.min
    this.wMax[h] = weapon.max
    this.wSpeedSec[h] = weapon.speedSec
    this.wFlat[h] = weapon.flatDamage
    this.wHandMult[h] = weapon.handMult
    this.wSkill[h] = weapon.skill
    this.wHitBonus[h] = weapon.hitBonus
    this.wCritBonus[h] = weapon.critBonus
    this.wArmorPenPct[h] = weapon.armorPenPct
    this.wGlanceLow[h] = weapon.glanceLow
    this.wGlanceHigh[h] = weapon.glanceHigh
    this.wTwoHand[h] = weapon.twoHand ? 1 : 0
    this.wRageMult[h] = weapon.rageMult
    this.wNormSpeed[h] = weapon.normalizedSpeed
    // docs/mechanics/rage.md#forever-normalized-rage-per-swing-: k × base speed (× off-hand base), in
    // tenths with its fraction, which rage.md#rounding carries or drops
    const k = weapon.twoHand ? rage.normalizedTwoHand : rage.normalizedOneHand
    const offBase = h === HAND.off ? rage.offHandBase : 1
    this.wNormRageTenths[h] = k * weapon.speedSec * offBase * weapon.rageMult * 10
  }

  // ------------------------------------------------------------------------------------------
  // Fight loop
  // ------------------------------------------------------------------------------------------

  /** Runs fight number `index` (its randomness depends only on the plan's seed and `index`). */
  runFight(index: number): void {
    const plan = this.plan
    const seed = plan.seed
    this.rngFight.seed(seed, index, STREAM.fight)
    this.rngTable.seed(seed, index, STREAM.table)
    this.rngDamage.seed(seed, index, STREAM.damage)
    this.rngProc.seed(seed, index, STREAM.proc)
    this.rngBoss.seed(seed, index, STREAM.boss)
    // docs/mechanics/ranged-and-pets.md §6: the pet rolls from a stream of its own.
    if (this.hasPet) this.rngPet.seed(seed, index, STREAM.pet)

    // docs/mechanics/encounter.md#implementation-notes: L_i = round(L × (1 + v × (2u − 1)))
    const f = plan.fight
    const u = this.rngFight.next()
    this.fightEnd = Math.round(f.durationMs * (1 + f.variation * (2 * u - 1)))
    this.reset()
    // docs/mechanics/encounter.md#implementation-notes: t_exec = floor(L_i × (1 − executePct/100))
    this.executeAtMs = executePhaseStart(this.fightEnd, f.executePct)
    // rogue.md §5.3: Quietus's bonus from the target's 35%, by the execute phase's rule.
    for (let i = 0; i < this.lowHealthAbilities.length; i++) {
      const a = this.lowHealthAbilities[i]
      this.abLowAt[a] = executePhaseStart(this.fightEnd, this.abLowBelow[a])
    }
    // docs/classes/warlock.md §11.3: Decimation's Shadow Bolt bonus from the target's 35%, by the same rule.
    for (let i = 0; i < this.lowHealthSpells.length; i++) {
      const s = this.lowHealthSpells[i]
      this.splLowAt[s] = executePhaseStart(this.fightEnd, this.splLowBelow[s])
    }
    const hasExecute = this.executeAtMs < this.fightEnd
    // Time left ≤ x ⇔ now ≥ fightEnd − x; time left ≥ x ⇔ now ≤ fightEnd − x (warrior.md §5.2 rows 2–4).
    // The execute phase starts within x ⇔ now ≥ t_exec − x, never without the phase (§5.3 row 4); in
    // more than x ⇔ now < t_exec − x (whole ms), always without the phase (§5.2 row 16).
    for (let e = 0; e < this.entryFrom.length; e++) {
      let from = this.fightEnd - this.entryLeftAtMost[e]
      const lead = this.entryExecuteWithin[e]
      if (lead !== Infinity) from = hasExecute ? Math.max(from, this.executeAtMs - lead) : Infinity
      this.entryBaseFrom[e] = from
      this.entryFrom[e] = from
      let to = this.fightEnd - this.entryLeftAtLeast[e]
      const notWithin = this.entryExecuteNotWithin[e]
      if (notWithin !== -Infinity && hasExecute) to = Math.min(to, this.executeAtMs - notWithin - 1)
      this.entryTo[e] = to
    }
    if (this.preAbility.length > 0 || this.preChargeTenths > 0) this.prepull()

    const q = this.q
    // docs/mechanics/ranged-and-pets.md §4: the first Auto Shot, queued before the rotation's first
    // walk so a cast at the pull comes after the pull's shot.
    if (this.hasRanged) this.startAutoShot()
    if (this.hasRotation) {
      q.push(0, EV_ACT, 0, 0)
      if (hasExecute) q.push(this.executeAtMs, EV_EXECUTE, 0, 0)
      // "Time left ≤ x" becomes true at fightEnd − x, and "the phase starts within x" at t_exec − x:
      // wake the rotation then.
      const wakes = this.wakeTimeLeft
      for (let i = 0; i < wakes.length; i++) if (this.fightEnd - wakes[i] > 0) q.push(this.fightEnd - wakes[i], EV_ACT, 0, 0)
      const leads = this.wakeExecuteWithin
      if (hasExecute) for (let i = 0; i < leads.length; i++) if (this.executeAtMs - leads[i] > 0) q.push(this.executeAtMs - leads[i], EV_ACT, 0, 0)
    }
    // docs/mechanics/damage-and-timing.md#31-haste: main hand at 0, off hand at half its swing [?]
    if (this.hasWeapon[HAND.main]) this.scheduleSwing(HAND.main, 0)
    if (this.dualWield) this.scheduleSwing(HAND.off, Math.round(0.5 * this.swingMs[HAND.off]))
    if (f.bossSwing) {
      this.updateBossSpeed()
      this.bossNextAt = 0
      q.push(0, EV_BOSS, 0, this.bossGen)
    }
    if (f.damageTakenPerHit > 0) q.push(f.damageTakenIntervalMs, EV_DAMAGE_TAKEN, 0, 0)
    // druid.md §2.4: the player-global power tick, from a random phase in [0, 2 s) [?].
    if (this.hasPowerTick) q.push(Math.floor(this.rngFight.next() * POWER_TICK_MS), EV_POWER_TICK, 0, 0)
    const periodic = plan.periodicRage
    for (let i = 0; i < periodic.length; i++) q.push(periodic[i].periodMs, EV_PERIODIC_RAGE, i, 0)
    // docs/mechanics/ranged-and-pets.md §6, §7: the pet arrives, swings, walks its list and gains power.
    if (this.hasPet) this.startPet()

    const end = this.fightEnd
    while (q.pop()) {
      const t = q.time
      if (t >= end) break
      this.now = t
      const data = q.data
      switch (q.kind) {
        case EV_MH:
          if (q.gen === this.swingGen[HAND.main]) this.onSwingTimer(HAND.main)
          break
        case EV_OH:
          if (q.gen === this.swingGen[HAND.off]) this.onSwingTimer(HAND.off)
          break
        case EV_BOSS:
          if (q.gen === this.bossGen) {
            this.chainMask = 0
            this.onBossSwing()
            // Extra attacks granted by defensive procs (e.g. Reckoning, M5) swing now too.
            if (this.exCount > 0) this.drainExtraAttacks()
          }
          break
        case EV_AURA_EXPIRE:
          if (q.gen === this.auraGen[data] && this.auraActive[data]) this.removeAura(data)
          break
        case EV_BLEED_TICK:
          if (q.gen === this.bleedGen[data]) this.onBleedTick(data)
          break
        case EV_PERIODIC_RAGE: {
          const p = periodic[data]
          this.gainRage(p.tenths, -1)
          q.push(t + p.periodMs, EV_PERIODIC_RAGE, data, 0)
          break
        }
        case EV_DAMAGE_TAKEN:
          this.chainMask = 0
          // encounter.md §4: the stand-in hit's size is before your mitigation, and nothing mitigates it.
          this.takeHit(f.damageTakenPerHit, f.damageTakenPerHit)
          if (this.exCount > 0) this.drainExtraAttacks()
          q.push(t + f.damageTakenIntervalMs, EV_DAMAGE_TAKEN, 0, 0)
          break
        case EV_ACT:
          this.actPending = true
          break
        case EV_CAST_RAGE:
          if (q.gen === this.abTickGen[data]) this.onCastRageTick(data)
          break
        case EV_CAST_END:
          this.onCastEnd(data)
          break
        case EV_DOT_TICK:
          if (q.gen === this.dotGen[data]) this.onDotTick(data)
          break
        case EV_POWER_TICK:
          this.onPowerTick()
          q.push(t + POWER_TICK_MS, EV_POWER_TICK, 0, 0)
          break
        case EV_STACKING_DOT_TICK:
          if (q.gen === this.sdGen[data]) this.onStackingDotTick(data)
          break
        case EV_SPELL_DOT_TICK:
          if (q.gen === this.spDotGen[data]) this.spellDotTick(data)
          break
        case EV_CHANNEL_END:
          if (q.gen === this.channelGen && this.channeling === data) this.endChannel(data)
          break
        case EV_IGNITE_TICK:
          if (q.gen === this.igGen) this.igniteTick()
          break
        case EV_AUTO_SHOT:
          if (q.gen === this.rGen) this.onAutoShot()
          break
        case EV_PET_SWING:
          if (q.gen === this.petSwingGen) this.petSwing()
          break
        case EV_PET_ACT:
          this.petActPending = true
          break
        case EV_PET_POWER:
          this.gainPetPower(this.petPowerTick)
          q.push(t + this.petPowerTickMs, EV_PET_POWER, 0, 0)
          break
        case EV_PET_CAST_END:
          this.onPetCastEnd(data)
          break
        case EV_EXECUTE:
          this.rotList = this.rotExecute
          this.rotOffList = this.offGcdExecute
          // warrior.md §7: a queued Heroic Strike whose line stops in the execute phase is cancelled.
          if (this.queued >= 0 && this.abUnqueueAtExecute[this.queued]) this.queued = -1
          this.actPending = true
          break
      }
      // A decision point: the event changed rage, the GCD, a cooldown, an aura or the queue.
      while (this.actPending) this.act()
      // The pet's own decision point (docs/mechanics/ranged-and-pets.md §7), after yours; what it
      // does can make one for you (a howl's buff).
      if (this.hasPet) {
        while (this.petActPending) {
          this.petAct()
          while (this.actPending) this.act()
        }
      }
    }
    // Auras still up when the fight ends count until its end.
    const active = this.auraActive
    for (let a = 0; a < active.length; a++) {
      if (!active[a]) continue
      this.auraUpMs[a] += end - this.auraSince[a]
      if (this.aMaxStacks[a] > 1) this.auraStackMs[a] += this.auraStacks[a] * (end - this.auraStackSince[a])
    }
    this.fightMs = end
  }

  /** A snapshot of the fight-start state before the pre-pull, for tests: derived stats, tables and multipliers. */
  inspect() {
    this.reset()
    return {
      attackPower: this.ap,
      crit: Array.from(this.critPct),
      whiteThresholds: [Array.from(this.thrWhite.subarray(0, 6)), Array.from(this.thrWhite.subarray(6, 12))],
      bossThresholds: Array.from(this.thrBoss),
      armorFactor: Array.from(this.armorFactor),
      swingMs: Array.from(this.swingMs),
      specialThresholds: Array.from(this.thrSpecial.subarray(0, 6)),
      offHandSpecialThresholds: Array.from(this.thrSpecial.subarray(6, 12)),
      offHandQueuedThresholds: Array.from(this.thrOffQueued),
      physMult: this.physMult,
      maxRage: this.maxRage,
      blockValue: this.blockValue,
      bossArmorFactor: this.bossArmorFactor,
      damageTakenMult: this.damageTakenMult * this.auraTakenMult,
      energy: this.energy,
      mana: this.mana,
      form: this.form,
      maxMana: this.manaMax / 10,
      spellDamage: this.sp,
      spellMiss: this.spellMissPct,
      spellCrit: this.spellCritPct,
      holyMult: this.magicMult * this.holyMult,
      // docs/mechanics/spells.md: spell damage and the multipliers per school, and casting speed.
      schoolSpellDamage: Array.from(this.spSchool),
      schoolDamage: Array.from(this.schDamage),
      schoolTaken: Array.from(this.schTaken),
      schoolCrit: Array.from(this.schCrit),
      resistFactor: Array.from(this.resistFactor),
      castHaste: this.castHasteMult,
      // docs/mechanics/ranged-and-pets.md: the ranged table, attack power and cycle, and the pet's numbers.
      rangedAttackPower: this.rap,
      rangedThresholds: Array.from(this.thrRanged),
      rangedCrit: this.rCritPct,
      rangedCycleMs: this.rCycleMs,
      rangedArmorFactor: this.rArmorFactor,
      petAttackPower: this.petAp,
      petWhiteThresholds: Array.from(this.petThrWhite),
      petSpecialThresholds: Array.from(this.petThrSpecial),
      petSwingMs: this.petSwingMs,
      petArmorFactor: this.petArmorFactor,
      petSpellMiss: this.petSpellMissPct,
      petPower: this.petPower,
    }
  }

  /** Test hook: the pools, combo points and form now (druid.md §2), e.g. from a trace or after a fight. */
  resources() {
    return { rage: this.rage, energy: this.energy, mana: this.mana, comboPoints: this.comboPoints, form: this.form, petPower: this.petPower }
  }

  private reset(): void {
    this.q.clear()
    // A fight that ended in another form starts again in the plan's (druid.md §2.8).
    if (this.form !== this.startForm) this.setForm(this.startForm)
    this.energy = this.energyStart
    this.mana = this.manaMax
    this.comboPoints = 0
    this.lastPaid = 0
    this.manaSpentAt = -Infinity
    this.activeDots = 0
    this.poisonedDots = 0
    for (let i = 0; i < this.dotStacks.length; i++) {
      this.dotStacks[i] = 0
      this.sdGen[i]++
    }
    this.dynTargetArmor = 0
    this.catEnergyLeft = this.energyStart
    this.outOfFormMs = 0
    this.formSince = 0
    this.now = 0
    this.rage = 0
    this.rageFraction = 0
    this.fightDamage = 0
    this.fightThreat = 0
    this.swingGen[0]++
    this.swingGen[1]++
    this.bossGen++
    this.procReadyAt.fill(0)
    for (let i = 0; i < this.auraActive.length; i++) {
      this.auraActive[i] = 0
      this.auraStacks[i] = 0
      this.auraCharges[i] = 0
      this.auraCritCharges[i] = 0
      this.auraGen[i]++
    }
    this.auraChargeReadyAt.fill(0)
    this.stackCastCost = -1
    for (let i = 0; i < this.bleedTicksLeft.length; i++) {
      this.bleedTicksLeft[i] = 0
      this.bleedGen[i]++
    }
    this.dynStr = 0
    this.dynAgi = 0
    this.dynAp = 0
    this.dynApMult = 1
    this.dynCrit = 0
    this.dynSpellCrit = 0
    this.dynSpellDamage = 0
    this.dynSpellDamageMult = 1
    this.auraHasteMult = 1
    this.resetDefense()
    this.exHead = 0
    this.exCount = 0
    this.chainMask = 0
    this.gcdEnd = 0
    this.castGcdEnd = 0
    this.swingsStopped = false
    this.castHolding = false
    for (let i = 0; i < this.abReadyAt.length; i++) this.abReadyAt[i] = this.abNeverReady[i] ? Infinity : 0
    this.abUses.fill(0)
    this.abTicksLeft.fill(0)
    for (let i = 0; i < this.abTickGen.length; i++) this.abTickGen[i]++
    this.dotTicksLeft.fill(0)
    for (let i = 0; i < this.dotGen.length; i++) this.dotGen[i]++
    this.queued = -1
    this.actPending = false
    // The fight starts in the base stance, with its factors (1, 1, 1 and 0 when the plan's static
    // numbers are its own) and the swap cooldown ready.
    const base = this.baseStance
    this.stance = base
    this.home = base
    this.stanceReadyAt = 0
    this.stanceDamage = this.sDamage[base]
    this.stanceCrit = this.sCrit[base]
    this.stanceSpellCrit = this.sSpellCrit[base]
    this.threatMult = this.plan.threatMult * this.sThreat[base]
    this.damageTakenMult = this.plan.damageTakenMult * this.sTaken[base]
    this.rotList = this.rotNormal
    this.rotOffList = this.offGcdNormal
    // paladin.md: another paladin's Judgement of the Crusader is on the boss from the pull (buffs doc §4.2).
    this.holyTaken = this.plan.holyTaken ?? 0
    this.auraTakenCharges.fill(0)
    // docs/mechanics/spells.md: no spell DoTs, no channel, and the schools' static numbers.
    this.spDotTicksLeft.fill(0)
    for (let i = 0; i < this.spDotGen.length; i++) this.spDotGen[i]++
    this.channeling = -1
    this.channelGen++
    this.schDamage.set(this.schStaticDamage)
    this.schTaken.set(this.schStaticTaken)
    this.schCrit.set(this.schStaticCrit)
    this.castHasteAura = 1
    this.dynSpiritRegen = 1
    this.dynCastingRegen = 0
    // docs/classes/mage.md: no Ignite, no mana-cost aura.
    this.igPool = 0
    this.igTicksLeft = 0
    this.igNextAt = 0
    this.igGen++
    this.manaCostMult = 1
    this.castCostTenths = 0
    this.gcdMult = 1
    // docs/mechanics/ranged-and-pets.md: no ranged or pet aura mods, Auto Shot not yet fired, the pet fresh.
    this.dynRap = 0
    this.dynRapMult = 1
    this.rangedHasteAura = 1
    this.rGen++
    this.rLastShotAt = -Infinity
    this.rHeldUntil = 0
    this.dynPetAp = 0
    this.dynPetCrit = 0
    this.petAuraHaste = 1
    this.petAuraDamage = 1
    this.petPower = this.petPowerStart
    this.petGcdEnd = 0
    this.petCasting = -1
    this.petActPending = false
    this.petSwingGen++
    this.pabReadyAt.fill(0)
    this.recomputeStats()
    this.recomputeMultipliers()
  }

  /**
   * Before the pull (warrior.md §5.2 row 0, Plan.prepull): each cast, in time order, at its
   * negative time and without paying its cost. Its cooldown and aura run from then, its rage at
   * once and any ticks due before the pull are there at the pull, and later ticks keep their
   * phase. Then Charge's rage, and the stance swap's cap. Pre-pull rage makes no threat.
   */
  private prepull(): void {
    for (let i = 0; i < this.preAbility.length; i++) {
      const a = this.preAbility[i]
      const at = this.preAt[i]
      if (this.castTrace !== null) this.castTrace(a, at, this.pool(this.abRes[a]))
      this.counters[this.abSource[a] * FIELD_COUNT + FIELD.casts]++
      if (!this.countUse(a) && this.abCd[a] > 0) {
        this.abReadyAt[a] = at + this.abCd[a]
        if (this.abReadyAt[a] > 0) this.q.push(this.abReadyAt[a], EV_ACT, 0, 0)
      }
      if (this.abCatNext[a] !== a && this.abReadyAt[a] > 0) this.shareCooldown(a)
      const aura = this.abAura[a]
      if (aura >= 0 && at + this.aDuration[aura] > 0) this.putAura(aura, at + this.aDuration[aura])
      this.gainPower(this.abRes[a], this.castRageTenths(a), -1)
      const ticks = this.abTicks[a]
      for (let k = 1; k <= ticks; k++) {
        const t = at + k * this.abTickMs[a]
        if (t < 0) {
          this.gainPower(this.abRes[a], this.abTickRage[a], -1)
          continue
        }
        this.abTicksLeft[a] = ticks - k + 1
        this.abTickAt[a] = t
        this.q.push(t, EV_CAST_RAGE, a, ++this.abTickGen[a])
        break
      }
    }
    if (this.preChargeTenths > 0) {
      this.gainRage(this.preChargeTenths, -1)
      // warrior.md §2.1: the swap to the fighting stance keeps at most 10 + 3 × Improved Tactical Mastery.
      if (this.preKeepTenths >= 0 && this.rage > this.preKeepTenths) this.setRage(this.preKeepTenths)
      // The swap is at the pull, so the next can come after its cooldown (warrior.md §7, an engine choice).
      if (this.preKeepTenths >= 0) {
        this.stanceReadyAt = this.swapCdMs
        if (this.hasRotation) this.q.push(this.stanceReadyAt, EV_ACT, 0, 0)
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // Stats
  // ------------------------------------------------------------------------------------------

  /** Re-derives stats after an attribute aura changes (character-stats.md#derived-stat-pipeline). */
  private recomputeStats(): void {
    const plan = this.plan
    const s = this.scratch
    const base = this.base
    s.str = base.str + this.dynStr
    s.agi = base.agi + this.dynAgi
    s.ap = base.ap + this.dynAp
    s.apMult = base.apMult * this.dynApMult
    // The stance's aura crit (Berserker Stance +3, relative to the base stance's in `base`), and
    // all-crit auras' spell crit (character-stats.md#derived-stat-pipeline, step 4).
    s.crit = base.crit + this.dynCrit + this.stanceCrit
    s.spellCrit = base.spellCrit + this.dynSpellCrit + this.stanceSpellCrit
    // docs/mechanics/spells.md §5: the auras' spell damage (a trinket's).
    s.spellDamage = base.spellDamage + this.dynSpellDamage
    s.spellDamageMult = base.spellDamageMult * this.dynSpellDamageMult
    // docs/mechanics/ranged-and-pets.md §3: the auras' ranged attack power.
    s.rap = base.rap + this.dynRap
    s.rapMult = base.rapMult * this.dynRapMult
    this.defensiveScratch(s, base)
    const d = deriveStats(s, this.deriveOptions, this.derived)
    this.ap = d.attackPower
    this.blockValue = d.blockValue
    this.spellMissPct = spellMiss(plan.profile, plan.playerLevel, plan.fight.targetLevel, d.spellHit)
    // docs/classes/mage.md#talents: each school's miss with its own spell hit (Elemental Precision), under the same floor.
    if (this.hasSchoolHit) for (let k = 0; k < SCHOOL_COUNT; k++) this.schMiss[k] = spellMiss(plan.profile, plan.playerLevel, plan.fight.targetLevel, d.spellHit + this.schStaticHit[k])
    this.spellCritPct = d.spellCrit
    this.sp = d.holySpellDamage
    // docs/mechanics/spells.md §4, §5: spell damage by school, and casting speed.
    const sp = this.spSchool
    sp[SCHOOL.fire] = d.fireSpellDamage
    sp[SCHOOL.frost] = d.frostSpellDamage
    sp[SCHOOL.shadow] = d.shadowSpellDamage
    sp[SCHOOL.nature] = d.natureSpellDamage
    sp[SCHOOL.arcane] = d.arcaneSpellDamage
    sp[SCHOOL.holy] = d.holySpellDamage
    this.castHasteStat = d.castHasteMult
    this.castHasteMult = this.castHasteStat * this.castHasteAura
    const f = plan.fight
    const inputs = this.meleeIn
    const ch = this.chances
    const slices = this.slices
    for (let h = 0; h < 2; h++) {
      // warrior.md §7 "Without a main-hand weapon": an empty main hand gets a special-attack table for
      // the attacks that need no weapon (Thunder Clap, Shield Slam), at your level's base skill (300)
      // with no weapon's hit, crit or armor penetration. No white table: it has no swings.
      const armed = this.hasWeapon[h] === 1
      if (!armed && !(h === HAND.main && this.hasWeaponlessAttacks)) continue
      const sheetCrit = d.crit + (armed ? this.wCritBonus[h] : 0)
      this.critPct[h] = sheetCrit
      // docs/mechanics/combat-tables.md#2-melee-attack-table-white-swings
      inputs.attackerLevel = plan.playerLevel
      inputs.targetLevel = f.targetLevel
      inputs.skill = armed ? this.wSkill[h] : 5 * plan.playerLevel
      inputs.hit = d.hit + (armed ? this.wHitBonus[h] : 0)
      inputs.sheetCrit = sheetCrit
      inputs.auraCrit = d.auraCrit + (armed ? this.wCritBonus[h] : 0)
      inputs.expertise = d.expertise
      inputs.front = f.front
      inputs.canDodge = f.bossCanDodge
      inputs.canParry = f.bossCanParry
      inputs.canBlock = f.bossCanBlock
      if (armed) thresholds(whiteSlices(meleeChances(plan.profile, inputs, true, this.dualWield, ch), slices), this.thrWhite, 6 * h)
      if (this.hasAbilities) {
        // docs/mechanics/combat-tables.md#5-dual-wield-and-on-next-swing-queues: dwPenalty = dualWielding && !queue.active
        if (h === HAND.off && this.dualWield) thresholds(whiteSlices(meleeChances(plan.profile, inputs, true, false, ch), slices), this.thrOffQueued)
        // docs/mechanics/combat-tables.md#3-special-yellow-attacks: no glancing, no dual-wield penalty
        meleeChances(plan.profile, inputs, false, false, ch)
        thresholds(specialSlices(ch, 0, slices), this.thrSpecial, 6 * h)
        this.specCrit[h] = ch.crit
      }
      // docs/mechanics/damage-and-timing.md#12-armor-reduction-debuffs-and-penetration: flat reductions, then % ignored
      // A debuff the player keeps up (Faerie Fire, druid.md §3.8, §4.5; Sunder Armor's stacks,
      // warrior.md §7) takes its armor off first.
      let armor = f.targetArmor - this.dynTargetArmor - d.armorPen
      if (armor > 0 && armed) armor *= 1 - this.wArmorPenPct[h]
      this.armorFactor[h] = 1 - armorReduction(armor, plan.playerLevel, plan.profile)
    }
    if (f.bossSwing) this.updateBossTable(d)
    if (this.hasRanged) this.updateRangedTable(d)
    this.hasteMult = d.hasteMult * this.auraHasteMult
    this.updateSwingSpeeds()
    // The pet's shares of your stats, and the armor your debuffs leave the boss (ranged-and-pets.md §6).
    if (this.hasPet) this.recomputePet()
  }

  /**
   * The ranged table and ranged attack power against the current stats (docs/mechanics/ranged-and-pets.md
   * §2, §3): the special-attack table's miss at the ranged weapon's skill, with its own hit, no dodge
   * or parry (creatures dodge and parry melee only), a block from the front, and the sheet's crit plus
   * the ranged weapon's, suppressed vs +3 like a melee attack's; and the boss's armor, as the main
   * hand's without a weapon's armor penetration.
   */
  private updateRangedTable(d: DerivedStats): void {
    const plan = this.plan
    const f = plan.fight
    const inputs = this.meleeIn
    const ch = this.chances
    inputs.attackerLevel = plan.playerLevel
    inputs.targetLevel = f.targetLevel
    inputs.skill = this.rSkill
    inputs.hit = d.hit + this.rHitBonus
    inputs.sheetCrit = d.crit + this.rCritBonus
    inputs.auraCrit = d.auraCrit + this.rCritBonus
    inputs.expertise = 0
    inputs.front = f.front
    inputs.canDodge = false
    inputs.canParry = false
    inputs.canBlock = f.bossCanBlock
    meleeChances(plan.profile, inputs, false, false, ch)
    thresholds(specialSlices(ch, 0, this.slices), this.thrRanged)
    this.rCritPct = ch.crit
    this.rap = d.rangedAttackPower
    const armor = f.targetArmor - this.dynTargetArmor - d.armorPen
    this.rArmorFactor = 1 - armorReduction(armor, plan.playerLevel, plan.profile)
  }

  /** Damage and haste multipliers from auras (multiplicative, damage-and-timing §2.4 and §3.1). */
  private recomputeMultipliers(): void {
    let haste = 1
    let damage = 1
    let holy = 1
    // The rogue's (rogue.md §3.7, §4.4): Energy regeneration and the poisons' damage multiply; their
    // apply chance adds.
    let energy = 1
    let poison = 1
    let poisonChance = 0
    let bleed = 1
    // docs/mechanics/ranged-and-pets.md §4: ranged attack speed multiplies too.
    let ranged = 1
    for (let i = 0; i < this.auraActive.length; i++) {
      if (!this.auraActive[i]) continue
      const stacks = this.auraStacks[i]
      if (this.aHaste[i]) haste *= 1 + (this.aHaste[i] * stacks) / 100
      if (this.aRangedHaste[i]) ranged *= 1 + (this.aRangedHaste[i] * stacks) / 100
      if (this.aDamage[i]) damage *= 1 + (this.aDamage[i] * stacks) / 100
      if (this.aHoly[i]) holy *= 1 + (this.aHoly[i] * stacks) / 100
      if (this.aEnergyRegen[i]) energy *= 1 + (this.aEnergyRegen[i] * stacks) / 100
      if (this.aPoisonDamage[i]) poison *= 1 + (this.aPoisonDamage[i] * stacks) / 100
      if (this.aPoisonChance[i]) poisonChance += (this.aPoisonChance[i] * stacks) / 100
      if (this.aBleedDamage[i]) bleed *= 1 + (this.aBleedDamage[i] * stacks) / 100
    }
    this.bleedMult = bleed
    this.rangedHasteAura = ranged
    this.energyRegenMult = energy
    this.poisonMult = poison
    this.poisonChance = poisonChance
    this.auraHasteMult = haste
    this.holyMult = this.staticHolyMult * holy
    // The stance's damage factor (Defensive Stance −10% on all damage, warrior.md §2.1).
    this.physMult = this.staticPhysMult * this.stanceDamage * damage
    this.magicMult = this.staticMagicMult * this.stanceDamage
    this.hasteMult = this.derived.hasteMult * haste
    this.updateSwingSpeeds()
  }

  /** New swing speeds apply from the next swing; the running timer isn't rescaled [?] (damage-and-timing §3.1). */
  private updateSwingSpeeds(): void {
    for (let h = 0; h < 2; h++) {
      if (this.hasWeapon[h]) this.swingMs[h] = swingMs(this.wSpeedSec[h], this.hasteMult)
    }
    // docs/mechanics/ranged-and-pets.md §4: Auto Shot's cycle, from the next shot, like a swing.
    if (this.hasRanged) {
      const haste = this.rangedHaste()
      this.rCycleMs = swingMs(this.rSpeedSec, haste)
      if (this.rWindupHasted) this.rWindupMs = hastedCastMs(this.rBaseWindupMs, haste)
    }
  }

  /**
   * Ranged attack speed now (docs/mechanics/ranged-and-pets.md §4): the stat block's attack speed
   * (haste rating and the static "attack speed" effects, which cover melee and ranged [?]) × the
   * quiver's × the ranged-haste auras'. Melee-only auras (Flurry) don't count.
   */
  private rangedHaste(): number {
    return this.derived.hasteMult * this.rStaticHaste * this.rangedHasteAura
  }

  // ------------------------------------------------------------------------------------------
  // White swings
  // ------------------------------------------------------------------------------------------

  private scheduleSwing(hand: number, at: number): void {
    this.nextSwingAt[hand] = at
    this.q.push(at, hand === HAND.main ? EV_MH : EV_OH, 0, ++this.swingGen[hand])
  }

  private onSwingTimer(hand: number): void {
    this.chainMask = 0
    if (hand === HAND.main) this.mainHandSwing(SOURCE_MAIN_HAND, 0)
    else this.whiteSwing(hand, SOURCE_OFF_HAND, 0)
    this.scheduleSwing(hand, this.now + this.swingMs[hand])
    if (this.exCount > 0) this.drainExtraAttacks()
  }

  /**
   * A main-hand swing, from its timer or an extra attack: a queued on-next-swing ability replaces
   * it if there's rage for it when the swing happens, otherwise it's a white swing. Either way
   * the queue is used up (warrior.md §2.4 items 1 and 7).
   */
  private mainHandSwing(source: number, bonusAp: number): void {
    const a = this.queued
    if (a >= 0) {
      this.queued = -1
      this.actPending = this.hasRotation
      if (this.affordable(a)) {
        if (this.castTrace !== null) this.castTrace(a, this.now, this.pool(this.abRes[a]))
        this.payCost(a)
        // No white rage from the replaced swing (rage.md#yellow-damage-and-on-next-swing-attacks),
        // and it doesn't use Flurry charges in Forever (warrior.md §2.4 item 5).
        this.special(a, HAND.main, bonusAp)
        return
      }
    }
    this.whiteSwing(HAND.main, source, bonusAp)
  }

  /**
   * Resolves one white swing: roll the table, deal damage, gain rage, fire procs
   * (combat-tables §2, damage-and-timing §2, rage.md, threat.md).
   */
  private whiteSwing(hand: number, source: number, bonusAp: number): void {
    // Flurry-style charges: every white swing uses one before its own crit can refresh them.
    const charged = this.chargeAuras
    for (let i = 0; i < charged.length; i++) {
      const a = charged[i]
      if (!this.auraActive[a]) continue
      // docs/classes/shaman.md#flurry: the shaman's Flurry loses at most one charge per 500 ms.
      if (this.aChargeIcd[a] > 0) {
        if (this.auraChargeReadyAt[a] > this.now) continue
        this.auraChargeReadyAt[a] = this.now + this.aChargeIcd[a]
      }
      if (--this.auraCharges[a] <= 0) this.removeAura(a)
    }

    const c = this.counters
    const row = source * FIELD_COUNT
    c[row + FIELD.casts]++
    if (this.trace !== null) this.trace(source, hand, this.now)
    const r = this.rngTable.roll100()
    let o = 6 * hand
    let th = this.thrWhite
    if (hand === HAND.off && this.queued >= 0) {
      // docs/mechanics/combat-tables.md#5-dual-wield-and-on-next-swing-queues
      th = this.thrOffQueued
      o = 0
    }
    if (r < th[o]) {
      c[row + FIELD.misses]++
      return
    }
    if (r < th[o + 2]) {
      const dodged = r < th[o + 1]
      c[row + (dodged ? FIELD.dodges : FIELD.parries)]++
      // docs/mechanics/rage.md#rage-from-damage-dealt: Classic gives 75% of the would-be damage; Forever 0
      if (!this.normalizedRage && this.avoidedRageShare > 0) {
        const wouldBe = this.whiteDamage(hand, bonusAp)
        this.gainRageFraction(this.whiteDamageRageTenths(hand, this.avoidedRageShare * wouldBe))
      }
      // warrior.md §2.8: the target's dodge opens the Overpower window.
      if (!dodged) this.onBossParried()
      else if (this.hasDodgeProcs) this.fireProcs(TRIGGER.targetDodge, hand)
      return
    }
    let damage = this.whiteDamage(hand, bonusAp)
    let crit = false
    if (r < th[o + 3]) {
      // docs/mechanics/combat-tables.md#23-glancing-blows
      damage *= this.rngDamage.uniform(this.wGlanceLow[hand], this.wGlanceHigh[hand])
      c[row + FIELD.glances]++
    } else if (r < th[o + 4]) {
      // Mob block value is 0 [?] (combat-tables §2.4): a block is a normal hit in its own slice.
      c[row + FIELD.blocks]++
    } else if (r < th[o + 5]) {
      damage *= 2 // docs/mechanics/damage-and-timing.md#25-crit-glancing-crushing-and-block-multipliers
      crit = true
      c[row + FIELD.crits]++
    } else {
      c[row + FIELD.hits]++
    }
    this.dealDamage(source, damage)
    this.gainRageFraction(this.normalizedRage ? this.wNormRageTenths[hand] : this.whiteDamageRageTenths(hand, damage))
    this.fireProcs(TRIGGER.swingLanded, hand)
    this.fireProcs(TRIGGER.whiteLanded, hand)
    this.fireProcs(TRIGGER.meleeLanded, hand)
    if (crit) this.onCrit(hand)
    // paladin.md#implementation-notes: the damage seals' procs come after the swing's Vengeance.
    if (this.hasWhiteResolved) this.fireProcs(TRIGGER.whiteResolved, hand)
  }

  /** A landed white swing's damage before the outcome multiplier (damage-and-timing §2.6, steps 1–4). */
  private whiteDamage(hand: number, bonusAp: number): number {
    const weaponRoll = this.rngDamage.uniform(this.wMin[hand], this.wMax[hand])
    return (
      (weaponRoll + this.wFlat[hand] + ((this.ap + bonusAp) / 14) * this.wSpeedSec[hand]) *
      this.wHandMult[hand] *
      this.physMult *
      this.armorFactor[hand]
    )
  }

  /** Classic Era white-hit rage, 7.5 × damage / c, × this hand's multiplier (rage.md), in tenths with its fraction. */
  private whiteDamageRageTenths(hand: number, damage: number): number {
    return ((7.5 * damage) / this.rageConv) * this.wRageMult[hand] * 10
  }

  /**
   * Swings the queued extra attacks, in order, and those they grant in turn. The chain shares its
   * root's mask, so each source procs at most once from one root swing, even from another
   * source's extra attack (damage-and-timing §5.4).
   */
  private drainExtraAttacks(): void {
    // One granted during a cast that stops swings waits for the cast to complete (warrior.md §7).
    if (this.swingsStopped) return
    let chain = 0
    while (this.exCount > 0 && chain < MAX_CHAIN) {
      const i = this.exHead
      this.exHead = (this.exHead + 1) % EXTRA_QUEUE
      this.exCount--
      // Usually already in the mask; an attack that waited out a cast brings its own root's.
      this.chainMask |= this.exMask[i]
      // docs/mechanics/damage-and-timing.md#33-swing-reset-rules: the main hand swings now and restarts its timer
      this.mainHandSwing(this.exSource[i], this.exBonusAp[i])
      chain++
    }
    this.exCount = 0
    this.exHead = 0
    this.chainMask = 0
    this.scheduleSwing(HAND.main, this.now + this.swingMs[HAND.main])
  }

  private dealDamage(source: number, damage: number): void {
    this.addDamage(source, damage, damage * this.threatMult)
  }

  private addDamage(source: number, damage: number, threat: number): void {
    const row = source * FIELD_COUNT
    this.counters[row + FIELD.damage] += damage
    this.counters[row + FIELD.threat] += threat
    this.fightDamage += damage
    this.fightThreat += threat
    if (this.damageTrace !== null) this.damageTrace(source, damage)
  }

  // ------------------------------------------------------------------------------------------
  // Abilities and the rotation
  // ------------------------------------------------------------------------------------------

  /**
   * Walks the priority list (warrior.md §5.1): uses every entry, in order, whose ability is
   * usable now (off cooldown, rage, GCD, stance, execute phase) and whose conditions hold, its
   * window among them (the constructor adds it to the line). A GCD ability blocks the later GCD
   * entries through the GCD it starts; off-GCD entries (the Heroic Strike queue) are still checked
   * after it. Away from the base stance, the walk first swaps back if the swap cooldown allows; a
   * dance line swaps to its stance just before its ability, and a line that stays makes that
   * stance the base for the rest of the fight (warrior.md §7 "Stance dancing").
   */
  private act(): void {
    this.actPending = false
    // A cast that holds everything (Hammer of Wrath's, paladin.md#other-abilities): its end walks again.
    if (this.castHolding) return
    const now = this.now
    if (this.stance !== this.home && this.stanceReadyAt <= now) this.swapStance(this.home)
    // While the GCD runs only off-GCD entries can be used; skipping the others changes nothing.
    const gcdBusy = this.gcdEnd > now
    // The current phase's list: lines that can't apply in it (and Execute outside it) aren't in it.
    const list = gcdBusy ? this.rotOffList : this.rotList
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      // The line's time-left conditions, as this fight's window (warrior.md §5.2 rows 2–4).
      if (now < this.entryFrom[e] || now > this.entryTo[e]) continue
      const a = this.rotAbility[e]
      // Off cooldown (never ready when used up, or needing a weapon the setup lacks: the
      // constructor's `abNeverReady`), with the rage for it (a druid's: its form, combo points and cost).
      if (this.abReadyAt[a] > now || (this.abPlainRage[a] === 1 ? this.rage < this.abCost[a] : !this.affordable(a))) continue
      // warrior.md §3.1 "Stance": only in the stances it's usable in, or by dancing to one (§7).
      let dance = 0
      if ((this.abStances[a] & this.stance) === 0 && (dance = this.danceFor(e, a)) === 0) continue
      if (this.abKind[a] === KIND_ON_NEXT_SWING) {
        if (this.queued >= 0) continue
      } else if (this.abGcd[a] > 0 && this.gcdEnd > now) continue
      if (!this.conditionsHold(e)) continue
      if (dance !== 0) this.swapStance(dance)
      if (this.entryStay[e] !== 0) this.home = this.stance
      this.use(a)
      // A cast that holds everything (Hammer of Wrath's) ends the walk too: its end walks again.
      if (this.castHolding) return
    }
  }

  /**
   * The stance a line would dance to for its ability, which the current stance refuses, or 0: its
   * dance stance, if the swap cooldown allows and the rage the swap keeps still pays for it (§7).
   */
  private danceFor(e: number, a: number): number {
    const to = this.entryDance[e]
    if (to === 0 || this.stanceReadyAt > this.now || Math.min(this.rage, this.swapKeep) < this.abCost[a]) return 0
    return to
  }

  /**
   * Swaps stance (warrior.md §2.1): off the GCD, the three stances' shared cooldown starts, and the
   * warrior keeps at most `swapKeep` rage; the rest is lost, with no threat and no refund. The
   * rotation wakes when the cooldown ends, to swap back or dance again (§7).
   */
  private swapStance(to: number): void {
    const before = this.rage
    if (before > this.swapKeep) {
      this.setRage(this.swapKeep)
      this.totalSwapRageLostTenths += before - this.rage
      this.afterRageSpent()
    }
    this.stanceReadyAt = this.now + this.swapCdMs
    this.q.push(this.stanceReadyAt, EV_ACT, 0, 0)
    this.setStance(to)
    // The stance and rage changed: lines it refused, or that wait for rage ≤ x, may be usable now.
    this.actPending = true
    if (this.stanceTrace !== null) this.stanceTrace(to, this.now, before, this.rage)
  }

  /**
   * Puts the warrior in a stance: its factors on the plan's damage, threat and damage taken and its
   * aura crit and spell crit (warrior.md §2.1, §7 "Stances"). Crit re-derives the stats; the rest
   * are multipliers.
   */
  private setStance(to: number): void {
    this.stance = to
    this.stanceDamage = this.sDamage[to]
    this.threatMult = this.plan.threatMult * this.sThreat[to]
    this.damageTakenMult = this.plan.damageTakenMult * this.sTaken[to]
    if (this.sCrit[to] !== this.stanceCrit || this.sSpellCrit[to] !== this.stanceSpellCrit) {
      this.stanceCrit = this.sCrit[to]
      this.stanceSpellCrit = this.sSpellCrit[to]
      this.recomputeStats()
    }
    this.recomputeMultipliers()
  }

  private conditionsHold(e: number): boolean {
    const now = this.now
    for (let k = this.condStart[e]; k < this.condStart[e + 1]; k++) {
      const a = this.condA[k]
      const b = this.condB[k]
      switch (this.condCode[k]) {
        case COND.windowOpen:
          if (!this.auraActive[a]) return false
          break
        case COND.minRage:
          if (this.rage < a) return false
          break
        case COND.cooldownAtLeast:
          if (this.abReadyAt[a] - now < b) return false
          break
        case COND.gcdSafe:
          // docs/classes/warrior.md#51-conventions-for-rotation-settings: each has ≥ one GCD of cooldown
          // left. One the current stance refuses isn't coming up, unless a line dances for it and that
          // dance could happen at this rage: the swap keeps enough to pay for it, and rage is within
          // the line's maxRage (§7 "GCD-safe and stances").
          for (let i = 0, mask = a; mask !== 0; i++, mask >>>= 1) {
            if ((mask & 1) === 0 || this.abReadyAt[i] - now >= b) continue
            if ((this.abStances[i] & this.stance) !== 0) return false
            const rage = this.rage
            if (this.abDances[i] === 1 && Math.min(rage, this.swapKeep) >= this.abCost[i] && rage <= this.abDanceMaxRage[i]) return false
          }
          break
        case COND.auraDown:
          if (a >= 0 && this.auraActive[a]) return false
          break
        case COND.apAtLeast:
          if (this.ap < a) return false
          break
        case COND.apBelow:
          if (this.ap >= a) return false
          break
        case COND.maxRage:
          if (this.rage > a) return false
          break
        case COND.abilityAuraUp: {
          const aura = this.abAura[a]
          if (aura < 0 || !this.auraActive[aura]) return false
          break
        }
        // docs/classes/druid.md §6.2: Energy and combo-point thresholds.
        case COND.minEnergy:
          if (this.energy < a) return false
          break
        case COND.maxEnergy:
          if (this.energy > a) return false
          break
        case COND.minComboPoints:
          if (this.comboPoints < a) return false
          break
        // rogue.md §6: room for a cast's combo points (Premeditation).
        case COND.maxComboPoints:
          if (this.comboPoints > a) return false
          break
        case COND.abilityAuraDown: {
          const aura = this.abAura[a]
          if (aura >= 0 && this.auraActive[aura]) return false
          break
        }
        // paladin.md: a mana threshold.
        case COND.minMana:
          if (this.mana < a) return false
          break
        case COND.maxMana:
          if (this.mana > a) return false
          break
        // docs/mechanics/spells.md §11: a plan aura is up (Clearcasting, Shadow Trance).
        case COND.auraUp:
          if (!this.auraActive[a]) return false
          break
        case COND.abilityAuraStacksBelow: {
          // warrior.md §5.4 row 10: Sunder Armor's stacks below 5; druid.md §6.3: Lacerate's (down counts as none).
          const aura = this.abAura[a]
          if (aura >= 0 && this.auraActive[aura] && this.auraStacks[aura] >= b) return false
          break
        }
        // docs/classes/shaman.md#enhancement-priority: Lightning Bolt at 5 Maelstrom Weapon stacks.
        case COND.auraStacksAtLeast:
          if (!this.auraActive[a] || this.auraStacks[a] < b) return false
          break
        // docs/classes/mage.md#fire-priority: Scorch until Fire Vulnerability has 5 stacks, or before it runs out.
        case COND.auraStacksBelow:
          if (this.auraActive[a] && this.auraStacks[a] >= b) return false
          break
        case COND.auraEndsWithin:
          if (this.auraActive[a] && this.auraEndAt(a) - now > b) return false
          break
        // docs/classes/priest.md#6-rotation: Inner Focus waits until Mind Blast could start now.
        case COND.abilityReady:
          if (this.abReadyAt[a] > now || (this.abGcd[a] > 0 && this.gcdEnd > now)) return false
          if (this.abPlainRage[a] === 1 ? this.rage < this.abCost[a] : !this.affordable(a)) return false
          break
        // docs/mechanics/ranged-and-pets.md §11: Auto Shot's timer and the pet's power.
        case COND.autoShotClear:
          if (!this.autoShotClear(a, b)) return false
          break
        case COND.autoShotWithin:
          if (!this.hasRanged || now - this.rLastShotAt > a) return false
          break
        case COND.petPowerAtLeast:
          if (!this.hasPet || this.petPower < a) return false
          break
        case COND.petPowerAtMost:
          if (!this.hasPet || this.petPower > a) return false
          break
        // docs/classes/warlock.md §11.3: the target below a% health, from t = floor(L × (1 − a/100)),
        // the execute phase's rule. Read on each walk: a caster walks as each cast lands.
        case COND.healthAtMost:
          if (now < executePhaseStart(this.fightEnd, a)) return false
          break
      }
    }
    return true
  }

  /** Uses an ability: queues an on-next-swing one, otherwise pays, starts the GCD and cooldown, and strikes or casts. */
  private use(a: number): void {
    if (this.abKind[a] === KIND_ON_NEXT_SWING) {
      // Queueing is free and off the GCD; rage is checked and spent at the swing (warrior.md §2.4).
      this.queued = a
      return
    }
    if (this.castTrace !== null) this.castTrace(a, this.now, this.pool(this.abRes[a]))
    // warrior.md §2.8: using a reactive ability closes its window, whether or not it lands.
    const w = this.abWindow[a]
    if (w >= 0 && this.auraActive[w]) this.removeAura(w)
    // docs/classes/shaman.md#maelstrom-weapon: its stacks cut the cast time and cost, and go now.
    // docs/mechanics/spells.md §4: then casting speed divides a hasted cast's time, to a whole ms. The
    // one cast time the engine uses: the stacks' cut and the casting speed, both read now.
    let castMs = this.abCastMs[a]
    let stackCost = -1
    const instant = this.abInstantAura[a]
    if (instant >= 0 && castMs > 0 && this.auraActive[instant]) {
      // docs/classes/mage.md#presence-of-mind: its aura makes the cast instant, and goes; stacks that
      // cut the cast time (Hot Streak) stay for the next one.
      castMs = 0
      this.removeAura(instant)
    } else {
      const stack = this.abStackAura[a]
      if (stack >= 0) {
        // Stacks that cut only the cast time (Hot Streak on Pyroblast, docs/classes/mage.md) leave the
        // cost to the usual payment, Clearcasting included.
        if (this.abStackCost[a] !== 0) stackCost = this.costOf(a)
        castMs *= this.stackCut(a, this.abStackCast[a])
      }
      // docs/classes/druid.md §11.3: a charge (Eclipse's) cuts the cast before casting speed, and goes now.
      const charge = this.abChargeAura[a]
      if (charge >= 0 && this.auraActive[charge]) {
        castMs = Math.max(0, castMs - this.abChargeCastMs[a])
        this.dropStack(charge)
      }
      if (this.abCastHasted[a]) castMs = hastedCastMs(castMs, this.castHasteMult)
      // docs/mechanics/ranged-and-pets.md §4: ranged haste shortens a shot's cast (Aimed Shot) [?].
      if (this.abCastRangedHasted[a]) castMs = hastedCastMs(castMs, this.rangedHaste())
      if (stack >= 0 && this.auraActive[stack]) this.removeAura(stack)
    }
    // Improved Stormstrike's regeneration comes when it's used, whether or not it lands (shaman.md).
    if (this.abSelfAura[a] >= 0) this.applyAura(this.abSelfAura[a])
    if (castMs > 0) {
      this.stackCastCost = stackCost
      this.startCast(a, castMs)
      return
    }
    if (stackCost >= 0) this.payStackCost(stackCost)
    else this.payCost(a)
    const gcd = this.gcdOf(a)
    if (gcd > 0) {
      this.gcdEnd = this.now + gcd
      this.q.push(this.gcdEnd, EV_ACT, 0, 0)
    }
    // druid.md §4.6: while Berserk is up, Mangle starts no cooldown.
    const noCd = this.abNoCdAura[a]
    const cd = noCd >= 0 && this.auraActive[noCd] ? 0 : this.abCd[a]
    if (this.abCdAfterAura[a] === 1) {
      // docs/classes/mage.md#combustion: not ready while its aura is up; the cooldown starts as it ends.
      this.countUse(a)
      this.abReadyAt[a] = Infinity
      if (this.abCatNext[a] !== a) this.shareCooldown(a)
    } else if (this.countUse(a)) {
      // docs/classes/mage.md#mana: its last use still holds its category (a mana gem's 2 min).
      if (cd > 0 && this.abCatNext[a] !== a) this.holdCategory(a, this.now + cd)
    } else if (cd > 0) {
      this.abReadyAt[a] = this.now + cd
      this.q.push(this.abReadyAt[a], EV_ACT, 0, 0)
      if (this.abCatNext[a] !== a) this.shareCooldown(a)
    }
    if (this.abKind[a] === KIND_CAST) {
      this.cast(a)
      return
    }
    if (this.abKind[a] === KIND_SPELL) {
      this.spellAbility(a)
      if (this.exCount > 0) this.drainExtraAttacks()
      return
    }
    if (this.abKind[a] === KIND_SHIFT) {
      this.shift(a)
      return
    }
    if (this.abKind[a] === KIND_CHANNEL) {
      this.channel(a)
      return
    }
    this.strike(a)
    if (this.exCount > 0) this.drainExtraAttacks()
  }

  /**
   * An ability's GCD now: its own, cut by the active auras' `gcdPct` if it's marked `gcdCut` (Nature's
   * Grace, docs/classes/druid.md §11.3), to a whole ms.
   */
  private gcdOf(a: number): number {
    const gcd = this.abGcd[a]
    return this.gcdMult !== 1 && this.abGcdCut[a] === 1 ? Math.round(gcd * this.gcdMult) : gcd
  }

  /** Takes one stack off aura a, and the aura with its last (Eclipse's charges, docs/classes/druid.md §11.3). */
  private dropStack(a: number): void {
    const stacks = this.auraStacks[a]
    if (stacks <= 1) {
      this.removeAura(a)
      return
    }
    if (this.aMaxStacks[a] > 1) this.countStacks(a, stacks)
    this.auraStacks[a] = stacks - 1
    this.auraChanged(a, -1)
  }

  /** An attack's strikes: the main hand's, and the off hand's if it has one (Raging Blows' Whirlwind, warrior.md §3.1) [?]. */
  private strike(a: number): void {
    this.chainMask = 0
    if (this.abKind[a] === KIND_SPELL_TABLE) {
      this.spellStrike(a)
      return
    }
    this.special(a, HAND.main, 0)
    if (this.abOffSource[a] >= 0 && this.hasWeapon[HAND.off]) this.special(a, HAND.off, 0)
  }

  /**
   * Starts an ability's cast (Slam, warrior.md §3.1 "Slam" and §7): the GCD runs from now, but no
   * GCD ability starts until the cast completes, so the GCD is held until then; off-GCD lines
   * still act, unless the cast holds them too (a paladin's Hammer of Wrath holds Judgement,
   * paladin.md#other-abilities [?]). A cast that stops swings cancels both pending swings
   * (damage-and-timing §3.3 and its implementation notes). The cost, cooldown and strike wait for
   * the cast to complete.
   */
  private startCast(a: number, castMs: number): void {
    const now = this.now
    this.castGcdEnd = now + this.gcdOf(a)
    this.gcdEnd = Infinity
    this.q.push(now + castMs, EV_CAST_END, a, 0)
    if (this.abCastHolds[a]) this.castHolding = true
    // docs/mechanics/ranged-and-pets.md §4: a cast holds Auto Shot's wind-up back until it completes.
    if (this.rCastsHold) this.holdAutoShot(now + castMs)
    if (this.abCastStopsSwings[a]) {
      this.swingGen[HAND.main]++
      this.swingGen[HAND.off]++
      this.swingsStopped = true
    }
  }

  /**
   * A cast completes (warrior.md §7): the GCD ends when it would have on its own, and the ability
   * pays its cost, starts its cooldown and strikes, unless rage fell below its cost during the
   * cast (a Heroic Strike swing while Improved Slam keeps the timers running), when it fails and
   * costs nothing. Swing timers a cast stopped restart from full now (damage-and-timing §3.3).
   */
  private onCastEnd(a: number): void {
    const now = this.now
    this.castHolding = false
    this.gcdEnd = this.castGcdEnd
    if (this.gcdEnd > now) this.q.push(this.gcdEnd, EV_ACT, 0, 0)
    this.actPending = this.hasRotation
    // A cast whose stacks cut its cost pays that cut cost now (shaman.md#maelstrom-weapon).
    const stackCost = this.stackCastCost
    this.stackCastCost = -1
    if (stackCost >= 0 ? this.mana >= stackCost : this.affordable(a)) {
      if (stackCost >= 0) this.payStackCost(stackCost)
      else this.payCost(a)
      const cd = this.abCd[a]
      if (this.countUse(a)) {
        if (cd > 0 && this.abCatNext[a] !== a) this.holdCategory(a, now + cd)
      } else if (cd > 0) {
        this.abReadyAt[a] = now + cd
        this.q.push(this.abReadyAt[a], EV_ACT, 0, 0)
        if (this.abCatNext[a] !== a) this.shareCooldown(a)
      }
      if (this.abKind[a] === KIND_SPELL) this.spellAbility(a)
      // docs/mechanics/spells.md §6: a channel with a cast before it starts channeling as the cast lands.
      else if (this.abKind[a] === KIND_CHANNEL) this.channel(a)
      else this.strike(a)
    }
    if (this.swingsStopped) {
      this.swingsStopped = false
      if (this.hasWeapon[HAND.main]) this.scheduleSwing(HAND.main, now + this.swingMs[HAND.main])
      if (this.dualWield) this.scheduleSwing(HAND.off, now + this.swingMs[HAND.off])
    }
    if (this.exCount > 0) this.drainExtraAttacks()
  }

  /**
   * The rest of ability a's category waits until `until`: a one-use ability's last use, which is
   * never ready again itself, still starts its category's cooldown (a Mana Ruby holds the Mana
   * Citrine and the Demonic Rune for 2 min, docs/classes/mage.md#mana).
   */
  private holdCategory(a: number, until: number): void {
    for (let b = this.abCatNext[a]; b !== a; b = this.abCatNext[b]) if (this.abReadyAt[b] < until) this.abReadyAt[b] = until
    this.q.push(until, EV_ACT, 0, 0)
  }

  /**
   * Counts a use of an ability with a limit per fight; once it's reached, the ability is never
   * ready again this fight (Mighty Rage Potion, warrior.md §5.2 row 16). True when it was the last.
   */
  private countUse(a: number): boolean {
    if (this.abUsesPerFight[a] === 0 || ++this.abUses[a] < this.abUsesPerFight[a]) return false
    this.abReadyAt[a] = Infinity
    return true
  }

  /** A cast's rage at once, in tenths: its base plus a whole 0…spread from the proc stream (Mighty Rage Potion, 45–75). */
  private castRageTenths(a: number): number {
    const spread = this.abRageSpread[a]
    return spread > 0 ? this.abRage[a] + Math.floor(this.rngProc.next() * (spread + 1)) : this.abRage[a]
  }

  /**
   * A `cast` ability (warrior.md §3.2): no roll. It puts its aura on the warrior and grants its
   * rage, at once and then on ticks from the cast (Bloodrage, W19). The rage is an energize:
   * capped, and 5 threat per rage gained, on the ability's row (rage.md, threat.md).
   */
  private cast(a: number): void {
    // docs/classes/priest.md#35-inner-focus-14751: a free-cast charge a `cast` spends gives its crit
    // to nothing, as a spell's or a channel's does once its spell resolves.
    this.freeCrit = 0
    const source = this.abSource[a]
    this.counters[source * FIELD_COUNT + FIELD.casts]++
    // A spell on the target rolls spell hit first; a miss applies nothing (Faerie Fire, druid.md §3.8).
    if (this.abSpellHit[a] === 1 && this.rngTable.roll100() < this.spellMissPct) {
      this.counters[source * FIELD_COUNT + FIELD.misses]++
      return
    }
    const aura = this.abAura[a]
    // A finisher's buff lasts longer per combo point (Slice and Dice, rogue.md §3.3).
    if (aura >= 0) this.putAura(aura, this.now + this.aDuration[aura] + this.abAuraMsPerCp[a] * this.comboPoints)
    // A `cast` that builds (Premeditation) or finishes (Slice and Dice) moves combo points once its
    // aura has read them (rogue.md §3.3, §3.10).
    if (this.abCp[a] !== 0 || this.abFinisher[a] === 1) this.landComboPoints(a, false)
    this.gainPower(this.abRes[a], this.castRageTenths(a), source, this.abNoThreat[a] === 0)
    // A mana potion or rune (buffs-debuffs-consumables.md §3.5): its mana at once, capped. Life Tap's
    // makes no threat (docs/classes/warlock.md §3).
    const spread = this.abManaSpread[a]
    if (this.abManaGain[a] > 0) this.gainMana(this.abManaGain[a] + (spread > 0 ? Math.floor(this.rngProc.next() * (spread + 1)) : 0), source, this.abNoThreat[a] === 0)
    if (this.abManaReturn[a] > 0) this.returnMana(a)
    // docs/classes/warlock.md §11.3: Demonic Energies gives the demon the mana your Life Tap gives.
    if (this.abPetPower[a] > 0) this.gainPetPower(this.abPetPower[a])
    this.startTicks(a)
    // paladin.md#protection-tree: Swift Judgement ends Judgement's cooldown.
    if (this.abEndsCd[a] >= 0) this.endCooldown(this.abEndsCd[a])
  }

  /**
   * Ability b and every ability of its category are ready now (Swift Judgement "finishes the
   * remaining cooldown on your Judgement ability", paladin.md#protection-tree), and the rotation
   * walks again so it can use them. One never ready again (used up, or needing a weapon the setup
   * lacks: ready at Infinity) stays so.
   */
  private endCooldown(b: number): void {
    this.readyNow(b)
    for (let c = this.abCatNext[b]; c !== b; c = this.abCatNext[c]) this.readyNow(c)
    this.actPending = this.hasRotation
  }

  /** Ability a is ready now, if it's cooling down (`endCooldown`). */
  private readyNow(a: number): void {
    const at = this.abReadyAt[a]
    if (at > this.now && at !== Infinity) this.abReadyAt[a] = this.now
  }

  /**
   * A cast's ticks from now. A recast restarts them, but a tick due this very moment lands first,
   * as Rend's refresh does (damage-and-timing §4 "Refresh"): Consecration recast on its 8 s
   * cooldown keeps its 8th tick (paladin.md#other-abilities). None of the warrior's casts is recast
   * before its ticks end.
   */
  private startTicks(a: number): void {
    if (this.abTicks[a] > 0) {
      if (this.abTicksLeft[a] > 0 && this.abTickAt[a] === this.now) this.castTick(a)
      this.abTicksLeft[a] = this.abTicks[a]
      this.abTickAt[a] = this.now + this.abTickMs[a]
      this.q.push(this.abTickAt[a], EV_CAST_RAGE, a, ++this.abTickGen[a])
    }
  }

  private onCastRageTick(a: number): void {
    this.castTick(a)
    if (--this.abTicksLeft[a] > 0) {
      this.abTickAt[a] = this.now + this.abTickMs[a]
      this.q.push(this.abTickAt[a], EV_CAST_RAGE, a, this.abTickGen[a])
    }
  }

  /** One tick of a cast: its rage, and its spell if it has one (Consecration, paladin.md#other-abilities), each with its own rolls [?]. */
  private castTick(a: number): void {
    this.gainPower(this.abRes[a], this.abTickRage[a], this.abSource[a], this.abNoThreat[a] === 0)
    if (this.abTickSpell[a] >= 0) {
      if (this.trace !== null) this.trace(this.abSource[a], -1, this.now)
      this.castCostTenths = this.abCost[a]
      this.castSpell(this.abTickSpell[a], false)
      this.castCostTenths = 0
    }
  }

  /**
   * A special attack (combat-tables §3): one roll over miss, dodge, parry, block, crit, or for
   * melee spells a second roll for crit. Damage per damage-and-timing §2.6; no rage from its damage
   * (rage.md#yellow-damage-and-on-next-swing-attacks). `hand` is the main hand, or the off hand
   * for Raging Blows' Whirlwind strike: its own row and table (Dual Wield Specialization's hit),
   * and it neither refunds nor spends rage (warrior.md §3.1).
   */
  private special(a: number, hand: number, bonusAp: number): void {
    const main = hand === HAND.main
    const source = main ? this.abSource[a] : this.abOffSource[a]
    const row = source * FIELD_COUNT
    const c = this.counters
    c[row + FIELD.casts]++
    const o = 6 * hand
    const th = this.thrSpecial
    const r = this.rngTable.roll100()
    // Overpower can't be dodged, parried or blocked: its roll is miss, crit, hit (combat-tables §3).
    const unavoidable = this.abUnavoidable[a] === 1
    if (r < (unavoidable ? th[o] : th[o + 2])) {
      if (r < th[o]) c[row + FIELD.misses]++
      else if (r < th[o + 1]) {
        c[row + FIELD.dodges]++
        // warrior.md §2.8: the target's dodge opens the Overpower window.
        if (this.hasDodgeProcs) this.fireProcs(TRIGGER.targetDodge, hand)
      } else {
        c[row + FIELD.parries]++
        this.onBossParried()
      }
      if (main && this.abPlainRage[a] === 1) {
        // docs/mechanics/rage.md#rage-refunds-on-avoided-abilities: no threat, not an energize.
        // Execute refunds nothing, so a miss loses only its cost (warrior.md §3.1 "Execute details").
        const refund = Math.floor(this.abRefund[a] * this.abCost[a] + 1e-9)
        if (this.rage + refund >= this.maxRage) this.setRage(this.maxRage)
        else this.rage += refund
        this.actPending = this.hasRotation
      } else if (main) {
        // druid.md §2.4, §2.5: a share of what it paid (none under Clearcasting), and a finisher keeps its combo points.
        this.refundPaid(a)
      }
      return
    }
    if (this.abKind[a] === KIND_BLEED) {
      // warrior.md §3.1, §7: the application can't crit and deals nothing itself; it lands its
      // bleed, and as a landed melee attack it can proc on-hit effects [?].
      this.applyDot(a)
      // druid.md §2.5: a bleed that builds or finishes moves combo points once it's snapshotted.
      if (main && (this.abCp[a] !== 0 || this.abFinisher[a] === 1)) this.landComboPoints(a, false)
      this.fireProcs(TRIGGER.meleeLanded, hand)
      return
    }
    const blocked = !unavoidable && r < th[o + 4]
    const critChance = this.specCrit[hand] + this.abBonusCrit[a] + this.auraCritPct(a)
    // The crit slice follows the block slice, or the miss slice for an unavoidable attack. An ability
    // that deals no damage (Sunder Armor) can't crit: what lands in the crit slice is a hit (§7). Nor
    // can Lacerate with none of its stacks on the target, which deals no direct damage (druid.md §4.3).
    const critFrom = unavoidable ? th[o] : th[o + 4]
    const crit =
      this.abKind[a] === KIND_MELEE_SPELL
        ? this.rngTable.roll100() < critChance // roll 2, not truncated by roll 1
        : !blocked &&
          r < Math.min(100, critFrom + Math.max(0, critChance)) &&
          this.abNoDamage[a] === 0 &&
          (this.abPctPerStack[a] === 0 || this.stacksOn(a) > 0)
    let damage = this.abilityDamage(a, hand, bonusAp)
    // rogue.md §3.8: a strike that lands uses up the aura that gave it crit (Cold Blood).
    if (main && this.abCritAuraConsume[a] === 1 && this.auraActive[this.abCritAura[a]]) this.removeAura(this.abCritAura[a])
    if (crit) {
      damage *= this.abCritMult[a]
      c[row + FIELD.crits]++
    } else if (blocked) {
      // Mob block value is 0 [?] (combat-tables §2.4): a blocked special deals full damage.
      c[row + FIELD.blocks]++
    } else {
      c[row + FIELD.hits]++
    }
    if (main && this.abPerExtraRage[a] > 0) {
      // warrior.md §3.1 "Execute details": a landed Execute (a block lands too) spends all the rage;
      // Ferocious Bite all the Energy (druid.md §3.5).
      if (this.abRes[a] === RES_RAGE) {
        this.setRage(0)
        this.afterRageSpent()
      } else this.emptyPool(this.abRes[a])
      this.actPending = this.hasRotation
    }
    // druid.md §3.3, §4.3: an attack that also bleeds (Rake, Lacerate) lands its bleed with its hit,
    // after the hit read the stacks already on the target.
    if (main && this.abDotTicks[a] > 0) this.applyDot(a)
    // druid.md §2.5: a landed builder awards its combo points (Primal Fury one more on a crit), a
    // finisher spends them, after its damage read them.
    if (main && (this.abCp[a] !== 0 || this.abFinisher[a] === 1)) this.landComboPoints(a, crit)
    // docs/mechanics/threat.md#base-rule-and-how-modifiers-stack: (dmg × mult + bonus) × global
    this.addDamage(source, damage, (damage * this.abThreatMult[a] + this.abThreatBonus[a]) * this.threatMult)
    // A landed strike puts its debuff on the boss: Sunder Armor adds a stack (warrior.md §7). An
    // attack that also bleeds put its marker up with its bleed, above (Rake; Lacerate's stacks).
    if (main && this.abAura[a] >= 0 && this.abDotTicks[a] === 0) this.applyAura(this.abAura[a])
    // rogue.md §5.3: a landed Backstab opens Cutthroat's Ambush window at its chance.
    if (main && this.abOpensAura[a] >= 0 && this.rngProc.next() < this.abOpensChance[a]) this.applyAura(this.abOpensAura[a])
    // An on-next-swing ability's swing counts as a landed swing (Unbridled Wrath, warrior.md §2.3 [?]).
    if (this.abKind[a] === KIND_ON_NEXT_SWING) this.fireProcs(TRIGGER.swingLanded, hand)
    this.fireProcs(TRIGGER.meleeLanded, hand)
    if (crit) this.onCrit(hand)
  }

  /**
   * A landed special's damage before the outcome multiplier (damage-and-timing §2.6, steps 1–4).
   * Weapon-based: (roll + flat weapon damage + AP/14 × real or normalized speed + ability flat)
   * × weapon % × the hand's multiplier (1 main hand; 0.5 × (1 + DWS) off hand, warrior W9).
   * Otherwise flat + AP coefficient × AP (Bloodthirst, Hamstring), plus Execute's damage per rage
   * left after its cost, read now that the cost is paid (warrior.md §3.1, W10). The hand's armor
   * factor applies.
   */
  private abilityDamage(a: number, hand: number, bonusAp: number): number {
    const ap = this.ap + bonusAp
    let base: number
    const perStack = this.abPctPerStack[a]
    if (this.abWeaponPct[a] > 0 || perStack > 0) {
      const speed = this.abNormalized[a] ? this.wNormSpeed[hand] : this.wSpeedSec[hand]
      const roll = this.rngDamage.uniform(this.wMin[hand], this.wMax[hand])
      // druid.md §4.3: Lacerate's share grows with its stacks already on the target.
      const pct = perStack > 0 ? perStack * this.stacksOn(a) : this.abWeaponPct[a]
      base = (roll + this.wFlat[hand] + (ap / 14) * speed + this.abFlat[a]) * pct * this.wHandMult[hand]
    } else {
      if (this.abPlainRage[a] === 1) {
        base = this.abFlat[a] + this.abApCoef[a] * ap + (this.abPerExtraRage[a] * this.rage) / 10
      } else {
        base = this.abFlat[a] + this.abApCoef[a] * ap + (this.abPerExtraRage[a] * this.pool(this.abRes[a])) / 10
        // druid.md §3.5: Ferocious Bite's 52–112, and a finisher's damage per combo point and attack power per combo point.
        if (this.abFlatRange[a] > 0) base += this.rngDamage.uniform(0, this.abFlatRange[a])
        if (this.abFinisher[a] === 1) base += this.comboPointDamage(a, ap)
      }
      // Shield Slam and Revenge roll their range, and Shield Slam adds the block value (§3.1, W14, W15).
      const spread = this.abFlatSpread[a]
      if (spread > 0) base += this.rngDamage.uniform(-spread, spread)
      if (this.abBlockValueCoef[a] > 0) base += this.abBlockValueCoef[a] * this.blockValue
    }
    // druid.md §5.1: Rend and Tear, on a bleeding target (the player's bleeds or others').
    if (this.abBleedPct[a] !== 0 && (this.othersBleed || this.activeDots > 0)) base *= 1 + this.abBleedPct[a] / 100
    // rogue.md §3.11: Mutilate's bonus against a target with your lasting poison on it.
    if (this.abPoisonedPct[a] !== 0 && this.poisonedDots > 0) base *= 1 + this.abPoisonedPct[a] / 100
    // rogue.md §5.3: Quietus, once the target is below 35% health.
    if (this.abLowPct[a] !== 0 && this.now >= this.abLowAt[a]) base *= 1 + this.abLowPct[a] / 100
    return base * this.physMult * this.armorFactor[hand]
  }

  /** Extra crit an aura gives this ability while it's up (Berserk on Shred, Claw and Rake, druid.md §3.7). */
  private auraCritPct(a: number): number {
    const aura = this.abCritAura[a]
    return aura >= 0 && this.auraActive[aura] ? this.abCritAuraPct[a] : 0
  }

  /** Stacks of ability a's own bleed on the target now: its marker's (Lacerate, druid.md §4.3), 0 when it's down. */
  private stacksOn(a: number): number {
    const marker = this.abAura[a]
    return marker >= 0 && this.auraActive[marker] ? this.auraStacks[marker] : 0
  }

  /** A finisher's combo-point terms: damage per point, and attack power per point up to its cap (druid.md §3.4, §3.5). */
  private comboPointDamage(a: number, ap: number): number {
    const cp = this.comboPoints
    return this.abPerCp[a] * cp + this.abApPerCp[a] * Math.min(cp, this.abCpApCap[a]) * ap
  }

  /**
   * A `spellTable` ability (DefenseType Magic: Thunder Clap, Demoralizing Shout; warrior.md §7
   * "Spell-table abilities" [?]): roll 1 against the spell table's miss (combat-tables §9), so no
   * dodge, parry or block, and a miss refunds as a melee special's does: 80% of the cost [?], or a
   * druid row's share of what it paid, in its own pool; roll 2 for crit at the main hand's special
   * crit chance, × the ability's crit multiplier (Impale's class mask has Thunder Clap). Damage and
   * threat as a special's; a landed one puts its debuff on the boss. It fires no melee procs; a crit
   * uses the charges crits end (Weakness Analyzer).
   */
  private spellStrike(a: number): void {
    const source = this.abSource[a]
    const row = source * FIELD_COUNT
    const c = this.counters
    c[row + FIELD.casts]++
    // A binary spell of a resistible school is also resisted whole at the boss's average resistance
    // (the bear's Faerie Fire, druid.md §4.5): one roll against miss + (1 − miss) × resist.
    const miss = this.spellMissPct
    if (this.rngTable.roll100() < miss + (100 - miss) * this.abResist[a]) {
      c[row + FIELD.misses]++
      if (this.abPlainRage[a] === 1) {
        const refund = Math.floor(this.abRefund[a] * this.abCost[a] + 1e-9)
        if (this.rage + refund >= this.maxRage) this.setRage(this.maxRage)
        else this.rage += refund
        this.actPending = this.hasRotation
      } else {
        // A druid's row, as its avoided specials: a share of what it paid, in its own pool (druid.md §2.4).
        this.refundPaid(a)
      }
      return
    }
    const damages = this.abNoDamage[a] === 0
    const crit = damages && this.rngTable.roll100() < this.specCrit[HAND.main] + this.abBonusCrit[a]
    let damage = damages ? this.abilityDamage(a, HAND.main, 0) : 0
    if (crit) {
      damage *= this.abCritMult[a]
      c[row + FIELD.crits]++
    } else {
      c[row + FIELD.hits]++
    }
    this.addDamage(source, damage, (damage * this.abThreatMult[a] + this.abThreatBonus[a]) * this.threatMult)
    if (this.abAura[a] >= 0) this.applyAura(this.abAura[a])
    if (crit) this.useCritCharges(SCHOOL.physical)
  }

  /**
   * Pays an ability's cost. Less rage can make a `maxRage` line usable (Bloodrage, Berserker
   * Rage), so the rotation walks again if it has one.
   */
  private spendRage(a: number): void {
    if (this.abCost[a] > 0) {
      this.rage -= this.abCost[a]
      if (this.hasMaxRage) this.actPending = true
    }
    this.afterRageSpent()
  }

  /** A queued on-next-swing ability is cancelled if rage drops below its threshold (warrior.md §2.4 item 8). */
  private afterRageSpent(): void {
    const q = this.queued
    if (q >= 0 && this.rage < this.abUnqueueBelow[q]) {
      this.queued = -1
      this.actPending = true
    }
  }

  // ------------------------------------------------------------------------------------------
  // Procs and auras
  // ------------------------------------------------------------------------------------------

  /**
   * A crit dealt, white or special: crit procs, then the charge of each aura a crit ends
   * (Weakness Analyzer: "until you deal a non-periodic critical effect", warrior.md §7).
   */
  private onCrit(hand: number): void {
    this.fireProcs(TRIGGER.meleeCrit, hand)
    this.useCritCharges(SCHOOL.physical)
  }

  /**
   * A non-periodic crit dealt, melee or spell, of this `SCHOOL`, uses a charge of each aura a crit
   * ends (Weakness Analyzer), or a crit of its schools (Combustion's Fire, docs/classes/mage.md#combustion).
   */
  private useCritCharges(school: number): void {
    const list = this.critChargeAuras
    for (let i = 0; i < list.length; i++) {
      const a = list[i]
      const schools = this.aCritChargeSchools[a]
      if (schools !== 0 && (schools & (1 << school)) === 0) continue
      if (this.auraActive[a] && --this.auraCritCharges[a] <= 0) this.removeAura(a)
    }
  }

  /**
   * Rolls every proc on this trigger (damage-and-timing §5), in the plan's order, then those that
   * need an aura, while it's up. `hand` is −1 for non-attack triggers. An extra-attack source that
   * already procced in this chain doesn't roll (§5.4), so it starts no internal cooldown either.
   * The pet's triggers roll their chances on the pet's stream, so a pet changes none of your rolls
   * (docs/mechanics/ranged-and-pets.md#implementation-notes).
   */
  private fireProcs(trigger: number, hand: number): void {
    const list = this.triggerLists[trigger]
    const rng = trigger === TRIGGER.petLanded || trigger === TRIGGER.petCrit ? this.rngPet : this.rngProc
    for (let k = 0; k < list.length; k++) {
      const p = list[k]
      if (hand >= 0 && (this.pHands[p] & (1 << hand)) === 0) continue
      if (this.procReadyAt[p] > this.now || (this.pChainBit[p] & this.chainMask) !== 0) continue
      let chance = this.pChance[2 * p + (hand > 0 ? hand : 0)]
      // A rogue's poison takes the auras' extra apply chance (Venom, rogue.md §4.4).
      if (this.pPoison[p] === 1) chance += this.poisonChance
      if (chance < 1 && rng.next() >= chance) continue
      if (this.pIcd[p] > 0) this.procReadyAt[p] = this.now + this.pIcd[p]
      this.doAction(p)
    }
    if (this.gatedLists[trigger].length > 0) this.fireGatedProcs(trigger, hand, rng)
  }

  /**
   * The procs on this trigger that need an aura or a form: each rolls only while its aura is up
   * (Bloodthrill: your Rend) and in its forms (Primal Fury's rage: bear).
   */
  private fireGatedProcs(trigger: number, hand: number, rng: Rng): void {
    const list = this.gatedLists[trigger]
    for (let k = 0; k < list.length; k++) {
      const p = list[k]
      if (hand >= 0 && (this.pHands[p] & (1 << hand)) === 0) continue
      const need = this.pReqAura[p]
      const forms = this.pForms[p]
      if (this.procReadyAt[p] > this.now || (need >= 0 && !this.auraActive[need]) || (this.pChainBit[p] & this.chainMask) !== 0) continue
      // druid.md §2.8: a proc bound to forms (Primal Fury's rage: bear) rolls only in them.
      if (forms !== 0 && (forms & (1 << this.form)) === 0) continue
      // docs/mechanics/spells.md §10: a spell proc rolls only for its schools, or its one spell.
      const schools = this.pSchools[p]
      if (schools !== 0 && (schools & (1 << this.procSchool)) === 0) continue
      if (this.pFromSource[p] >= 0 && this.pFromSource[p] !== this.procSource) continue
      // docs/classes/druid.md §11.3: a rate per minute of casting, from the landed spell's cast time.
      let chance = this.pPpmCast[p] > 0 ? (this.pPpmCast[p] * this.srcProcCastMs[this.procSource]) / 60000 : this.pChance[2 * p + (hand > 0 ? hand : 0)]
      // A rogue's poison takes the auras' extra apply chance (Venom, rogue.md §4.4).
      if (this.pPoison[p] === 1) chance += this.poisonChance
      if (chance < 1 && rng.next() >= chance) continue
      if (this.pIcd[p] > 0) this.procReadyAt[p] = this.now + this.pIcd[p]
      this.doAction(p)
    }
  }

  private doAction(p: number): void {
    switch (this.pAction[p]) {
      case ACTION.extraAttacks: {
        if (!this.hasWeapon[HAND.main]) return
        // This source is used up for the rest of the root swing's chain (damage-and-timing §5.4).
        this.chainMask |= this.pChainBit[p]
        const n = this.pAmount[p]
        for (let k = 0; k < n && this.exCount < EXTRA_QUEUE; k++) {
          const slot = (this.exHead + this.exCount) % EXTRA_QUEUE
          this.exSource[slot] = this.pSource[p]
          this.exBonusAp[slot] = this.pA[p]
          this.exMask[slot] = this.chainMask
          this.exCount++
        }
        return
      }
      case ACTION.aura: {
        const a = this.pAmount[p]
        if (this.aKeepsEnd[a]) this.extendAura(a, this.now + (this.pB[p] > 0 ? this.pB[p] : this.aDuration[a]))
        else this.applyAura(a)
        // docs/classes/druid.md §11.3: a proc that adds more than one stack (Eclipse's 2 charges).
        for (let k = this.pA[p]; k > 1; k--) this.applyAura(a)
        return
      }
      case ACTION.rage:
        this.gainRage(this.pAmount[p], this.pSource[p])
        return
      case ACTION.spellDamage:
        this.spellProc(p)
        return
      case ACTION.spell:
        this.castSpell(this.pAmount[p], true)
        return
      case ACTION.mana:
        this.gainMana((this.manaMax * this.pAmount[p]) / 100, this.pSource[p])
        return
      case ACTION.manaFlat:
        this.gainMana(this.pAmount[p], this.pSource[p])
        return
      case ACTION.stackingDot:
        this.applyStackingDot(p)
        return
      // docs/classes/mage.md#ignite, #talents: the crit feeds Ignite; Master of Elements returns a share of its spell's cost.
      case ACTION.ignite:
        this.feedIgnite()
        return
      case ACTION.manaOfCost:
        this.gainMana(Math.floor((this.pAmount[p] * this.castCostTenths) / 100), this.pSource[p])
        return
      // docs/mechanics/ranged-and-pets.md §7: power for the pet.
      case ACTION.petPower:
        if (this.hasPet) this.gainPetPower(this.pAmount[p])
        return
      case ACTION.weaponBleed: {
        const slot = this.pBleedSlot[p]
        // A tick due this very moment lands before the refresh, as Rend's does (damage-and-timing
        // §4 "Refresh"); the refresh then restarts the ticks, and old damage doesn't roll over
        // (warrior.md §2.5).
        if (this.bleedTicksLeft[slot] > 0 && this.bleedNextAt[slot] === this.now) this.onBleedTick(slot)
        this.bleedTicksLeft[slot] = this.pAmount[p]
        this.bleedNextAt[slot] = this.now + this.pB[p]
        this.q.push(this.bleedNextAt[slot], EV_BLEED_TICK, slot, ++this.bleedGen[slot])
        this.counters[this.pSource[p] * FIELD_COUNT + FIELD.casts]++
        return
      }
    }
  }

  private applyAura(a: number): void {
    this.startAura(a, this.now + this.aDuration[a])
  }

  /**
   * An aura procs apply for different durations, until `end` or its current end if that's later:
   * the Overpower window keeps a Bloodthrill's 6 s through a later dodge's 5 s (warrior.md §7).
   * Every other aura has one duration, so a refresh always ends later.
   */
  private extendAura(a: number, end: number): void {
    if (this.auraActive[a] && end < this.auraEnd[a]) end = this.auraEnd[a]
    this.auraEnd[a] = end
    this.startAura(a, end)
  }

  /** Puts aura a on the warrior (or refreshes it, adding a stack) until `end` (a pre-pull aura ends early). */
  private startAura(a: number, end: number): void {
    this.auraApplications[a]++
    const wasActive = this.auraActive[a] === 1
    const oldStacks = this.auraStacks[a]
    const stacks = wasActive ? Math.min(oldStacks + 1, this.aMaxStacks[a]) : 1
    if (!wasActive) this.auraSince[a] = this.now
    if (this.aMaxStacks[a] > 1) this.countStacks(a, wasActive ? oldStacks : 0)
    this.auraActive[a] = 1
    this.auraStacks[a] = stacks
    this.auraEnd[a] = end
    this.auraCharges[a] = this.aCharges[a]
    // docs/classes/mage.md#combustion: a stack added to an aura that keeps its charges leaves them as they are.
    if (!wasActive || this.aKeepsCharges[a] === 0) this.auraCritCharges[a] = this.aCritCharges[a]
    this.auraBlockCharges[a] = this.aBlockCharges[a]
    this.auraTakenCharges[a] = this.aTakenCharges[a]
    this.q.push(end, EV_AURA_EXPIRE, a, ++this.auraGen[a])
    if (this.watchStart[a] !== this.watchStart[a + 1]) this.watchAura(a, end)
    if (stacks !== oldStacks || !wasActive) this.auraChanged(a, stacks - (wasActive ? oldStacks : 0))
  }

  /**
   * Aura a now ends at `end` (∞ = it's down): each line that refreshes it (Battle Shout's upkeep,
   * warrior.md §5.2 row 1) is usable from `lead` before that end, or never if the fight ends first,
   * and the rotation wakes then. While it's down, only the line's time-left window applies.
   */
  private watchAura(a: number, end: number): void {
    for (let k = this.watchStart[a]; k < this.watchStart[a + 1]; k++) {
      const e = this.watchLine[k]
      if (end === Infinity) {
        this.entryFrom[e] = this.entryBaseFrom[e]
      } else if (end >= this.fightEnd) {
        this.entryFrom[e] = Infinity
      } else {
        const from = end - this.watchLead[k]
        this.entryFrom[e] = Math.max(this.entryBaseFrom[e], from)
        if (from > this.now) this.q.push(from, EV_ACT, 0, 0)
      }
    }
  }

  /** When active aura a ends (docs/classes/mage.md#fire-priority: Scorch before Fire Vulnerability runs out). */
  private auraEndAt(a: number): number {
    return this.auraEnd[a]
  }

  /** A stacking aura's stacks change now: the time it held `held` stacks counts for `auraStackMs`. */
  private countStacks(a: number, held: number): void {
    if (held > 0) this.auraStackMs[a] += held * (this.now - this.auraStackSince[a])
    this.auraStackSince[a] = this.now
  }

  private removeAura(a: number): void {
    const stacks = this.auraStacks[a]
    this.auraUpMs[a] += this.now - this.auraSince[a]
    if (this.aMaxStacks[a] > 1) this.countStacks(a, stacks)
    this.auraActive[a] = 0
    this.auraStacks[a] = 0
    this.auraCharges[a] = 0
    this.auraCritCharges[a] = 0
    this.auraGen[a]++
    if (this.watchStart[a] !== this.watchStart[a + 1]) this.watchAura(a, Infinity)
    // docs/classes/mage.md#combustion: an ability whose cooldown starts as its aura ends.
    for (let k = this.cdAfterStart[a]; k < this.cdAfterStart[a + 1]; k++) this.startCooldown(this.cdAfterAbility[k])
    this.auraChanged(a, -stacks)
  }

  /**
   * Ability b's cooldown starts now, as its aura ends (Combustion's, docs/classes/mage.md#combustion),
   * and its category's with it (Presence of Mind's, which its use held until now).
   */
  private startCooldown(b: number): void {
    if (this.abReadyAt[b] !== Infinity || this.usedUp(b)) return
    const until = this.now + this.abCd[b]
    this.abReadyAt[b] = until
    this.q.push(until, EV_ACT, 0, 0)
    for (let c = this.abCatNext[b]; c !== b; c = this.abCatNext[c]) {
      if (this.abReadyAt[c] < until || (this.abReadyAt[c] === Infinity && !this.usedUp(c) && this.abNeverReady[c] === 0)) this.abReadyAt[c] = until
    }
  }

  /** Ability a has had all its uses this fight (the Mighty Rage Potion's one, a mana gem's). */
  private usedUp(a: number): boolean {
    return this.abUsesPerFight[a] > 0 && this.abUses[a] >= this.abUsesPerFight[a]
  }

  private auraChanged(a: number, deltaStacks: number): void {
    this.actPending = this.hasRotation
    // paladin.md: JotC's flat Holy damage taken (Vengeance's Holy % is a multiplier, below).
    if (this.aHolyTaken[a]) this.holyTaken += this.aHolyTaken[a] * deltaStacks
    if (this.aStatful[a]) {
      this.dynStr += this.aStr[a] * deltaStacks
      this.dynAgi += this.aAgi[a] * deltaStacks
      this.dynAp += this.aAp[a] * deltaStacks
      this.dynCrit += this.aCrit[a] * deltaStacks
      this.dynSpellCrit += this.aSpellCrit[a] * deltaStacks
      this.dynSpellDamage += this.aSpellDamage[a] * deltaStacks
      this.defensiveDelta(a, deltaStacks)
      this.dynTargetArmor += this.aTargetArmor[a] * deltaStacks
      if (this.aApPct[a]) {
        // Attack power % auras multiply (character-stats step 4); recomputed from the active ones, so no drift.
        let m = 1
        for (let i = 0; i < this.auraActive.length; i++) {
          if (this.auraActive[i] && this.aApPct[i]) m *= 1 + (this.aApPct[i] * this.auraStacks[i]) / 100
        }
        this.dynApMult = m
      }
      // docs/mechanics/ranged-and-pets.md §3: ranged attack power, and its % the same way.
      this.dynRap += this.aRap[a] * deltaStacks
      if (this.aRapPct[a]) {
        let m = 1
        for (let i = 0; i < this.auraActive.length; i++) {
          if (this.auraActive[i] && this.aRapPct[i]) m *= 1 + (this.aRapPct[i] * this.auraStacks[i]) / 100
        }
        this.dynRapMult = m
      }
      if (this.aSpellDamagePct[a]) {
        // Spell damage % auras multiply the same way (docs/classes/warlock.md#72-race).
        let m = 1
        for (let i = 0; i < this.auraActive.length; i++) {
          if (this.auraActive[i] && this.aSpellDamagePct[i]) m *= 1 + (this.aSpellDamagePct[i] * this.auraStacks[i]) / 100
        }
        this.dynSpellDamageMult = m
      }
      this.recomputeStats()
    }
    if (this.aHaste[a] || this.aDamage[a] || this.aHoly[a] || this.aEnergyRegen[a] || this.aPoisonDamage[a] || this.aPoisonChance[a] || this.aBleedDamage[a] || this.aRangedHaste[a]) this.recomputeMultipliers()
    if (this.aTaken[a]) this.recomputeTakenMult()
    if (this.aBossDebuff[a]) this.recomputeBossDebuffs()
    if (this.aSchool[a]) this.recomputeSchools()
    if (this.aManaCost[a]) this.recomputeManaCost()
    // docs/mechanics/ranged-and-pets.md §7, §8: the pet's mods, and any aura is a decision point for its list.
    if (this.hasPet) {
      if (this.aPetful[a]) this.petAuraChanged(a, deltaStacks)
      this.petActPending = true
    }
  }

  /** The active auras' mana-cost multiplier (Arcane Power's +30%, docs/classes/mage.md#arcane-power), from the active ones, so no drift. */
  private recomputeManaCost(): void {
    let m = 1
    for (let i = 0; i < this.auraActive.length; i++) if (this.auraActive[i] && this.aManaCost[i]) m *= 1 + (this.aManaCost[i] * this.auraStacks[i]) / 100
    this.manaCostMult = m
  }

  /**
   * The schools' numbers with the active auras' school mods (docs/mechanics/spells.md §5, §9):
   * damage and damage taken multiply, crit adds, per stack; and casting speed (§4) and the mana hooks
   * (§8). Recomputed from the active auras, so no drift.
   */
  private recomputeSchools(): void {
    this.schDamage.set(this.schStaticDamage)
    this.schTaken.set(this.schStaticTaken)
    this.schCrit.set(this.schStaticCrit)
    let haste = 1
    let regen = 1
    let casting = 0
    let gcd = 1
    for (let i = 0; i < this.auraActive.length; i++) {
      if (!this.auraActive[i] || !this.aSchool[i]) continue
      const stacks = this.auraStacks[i]
      const mask = this.aSchoolMask[i]
      for (let k = 0; mask !== 0 && k < SCHOOL_COUNT; k++) {
        if ((mask & (1 << k)) === 0) continue
        this.schDamage[k] *= 1 + (this.aSchoolDamage[i] * stacks) / 100
        this.schTaken[k] *= 1 + (this.aSchoolTaken[i] * stacks) / 100
        this.schCrit[k] += this.aSchoolCrit[i] * stacks
      }
      haste *= 1 + (this.aCastHaste[i] * stacks) / 100
      regen *= 1 + (this.aSpiritRegen[i] * stacks) / 100
      casting += (this.aCastingRegen[i] * stacks) / 100
      if (this.aGcdPct[i] !== 0) gcd *= 1 - (this.aGcdPct[i] * stacks) / 100
    }
    this.gcdMult = gcd
    this.castHasteAura = haste
    this.castHasteMult = this.castHasteStat * haste
    this.dynSpiritRegen = regen
    this.dynCastingRegen = casting
  }

  /**
   * A magic proc (combat-tables §9): roll 1 for spell hit, an average partial resist, then roll 2
   * for crit at the sheet's spell crit, ×1.5, with no crit suppression [C]. A spell crit fires no
   * melee crit procs, but as a non-periodic crit it uses a Weakness Analyzer charge (warrior.md §7).
   */
  private spellProc(p: number): void {
    const row = this.pSource[p] * FIELD_COUNT
    const c = this.counters
    c[row + FIELD.casts]++
    if (this.rngProc.roll100() < this.spellMissPct) {
      c[row + FIELD.misses]++
      return
    }
    // docs/mechanics/spells.md §3, §9: its school's average resist (Holy has none) and multipliers, and crit.
    const school = this.pSchool[p]
    let damage = this.rngDamage.uniform(this.pA[p], this.pB[p]) * this.resistFactor[school] * this.magicMult * this.schDamage[school] * this.schTaken[school]
    // A rogue's poison: the auras' damage bonus (Venom, rogue.md §4.4).
    if (this.pPoison[p] === 1) damage *= this.poisonMult
    const crit = this.rngProc.roll100() < this.spellCritPct + this.schCrit[school]
    if (crit) {
      damage *= CRIT_MULTIPLIER.spell
      c[row + FIELD.crits]++
    } else {
      c[row + FIELD.hits]++
    }
    this.dealDamage(this.pSource[p], damage)
    if (crit) this.useCritCharges(this.pSchool[p])
  }

  /**
   * A `bleed` ability lands (Rend; damage-and-timing §4): its ticks snapshot the physical damage
   * multiplier and the main hand's special-attack crit chance now, and come every `dotTickMs` from
   * now; its marker aura is up until the last one. Reapplying restarts it and re-snapshots: a
   * tick due this very moment lands first, and the partial tick in progress is lost (WE-9).
   */
  private applyDot(a: number): void {
    const now = this.now
    if (this.dotTicksLeft[a] > 0 && this.dotNextAt[a] === now) this.onDotTick(a)
    // druid.md §5.1: the target bleeds while any of the player's bleeds has ticks to come.
    if (this.dotTicksLeft[a] === 0) this.activeDots++
    // An attack that also bleeds (Rake, Lacerate) counts its applications on the bleed's own row.
    if (this.abDotSource[a] !== this.abSource[a]) this.counters[this.abDotSource[a] * FIELD_COUNT + FIELD.casts]++
    // druid.md §4.3: a stacking bleed ticks for every stack, the one this application adds included
    // (its marker's stacks, up to its maximum); any other bleed has one.
    const marker = this.abAura[a]
    const stacks = marker >= 0 ? Math.min(this.aMaxStacks[marker], this.stacksOn(a) + 1) : 1
    // druid.md §2.9, §3.4: a finisher's bleed snapshots its combo points and attack power too (Rip);
    // a rogue's lasts longer per point (Rupture: 3 ticks + 1 per point, rogue.md §3.5).
    const cp = this.comboPoints
    const ticks = this.abDotTicks[a] + (this.abFinisher[a] === 1 ? this.abDotTicksPerCp[a] * cp : 0)
    this.dotTicksLeft[a] = ticks
    const perCp = this.abFinisher[a] === 1 ? this.abDotPerCp[a] * cp + this.abDotApPerCp[a] * Math.min(cp, this.abCpApCap[a]) * this.ap : 0
    this.dotDamage[a] = (this.abDotTick[a] * stacks + perCp) * this.physMult
    this.dotCrit[a] = this.abDotCanCrit[a] ? this.specCrit[HAND.main] + this.abBonusCrit[a] + this.auraCritPct(a) : -1
    this.dotNextAt[a] = now + this.abDotTickMs[a]
    this.q.push(this.dotNextAt[a], EV_DOT_TICK, a, ++this.dotGen[a])
    if (this.abAura[a] >= 0) this.startAura(this.abAura[a], now + ticks * this.abDotTickMs[a])
  }

  /**
   * One tick of a `bleed` ability: the snapshotted damage, no armor, never a miss. In `forever` a
   * flagged tick rolls crit at the snapshotted chance and deals the ability's crit multiplier
   * (Impale on Rend, 2.2 at 2/2) [?]; a tick crit fires no crit procs, since Flurry's and Deep
   * Wounds' proc masks have no periodic bit (damage-and-timing §4, warrior.md §2.5, §7). Threat is
   * damage × the ability's multiplier.
   */
  private onDotTick(a: number): void {
    const source = this.abDotSource[a]
    const row = source * FIELD_COUNT
    // rogue.md §3.9: Hemorrhage's debuff raises your bleeds' ticks while it's on the target.
    let damage = this.dotDamage[a] * this.bleedMult
    const chance = this.dotCrit[a]
    if (chance > 0 && this.rngTable.roll100() < chance) {
      damage *= this.abCritMult[a]
      this.counters[row + FIELD.crits]++
    } else {
      this.counters[row + FIELD.hits]++
    }
    if (this.trace !== null) this.trace(source, -1, this.now)
    this.addDamage(source, damage, damage * this.abThreatMult[a] * this.threatMult)
    // rogue.md §5.3: each Rupture tick adds a Thousand Cuts stack.
    if (this.abTickAura[a] >= 0) this.applyAura(this.abTickAura[a])
    if (--this.dotTicksLeft[a] > 0) {
      this.dotNextAt[a] = this.now + this.abDotTickMs[a]
      this.q.push(this.dotNextAt[a], EV_DOT_TICK, a, this.dotGen[a])
      return
    }
    this.activeDots--
    // druid.md §4.3: a stacking bleed's marker ends with its last tick, so an application at that
    // very moment starts again from one stack, whichever of the two events comes first.
    const marker = this.abAura[a]
    if (marker >= 0 && this.aMaxStacks[marker] > 1 && this.auraActive[marker]) this.removeAura(marker)
  }

  /**
   * A stacking poison lands (Deadly Poison, docs/classes/rogue.md §4.2): it rolls spell hit (combat-tables
   * §9) and adds a stack, up to its most, and lasts its duration from now. Its ticks keep their own
   * timer: a new application doesn't restart it [?]. One that has run out starts again from 1 stack,
   * ticking a period from now. The row counts applications in casts, and ticks in hits and crits.
   */
  private applyStackingDot(p: number): void {
    const slot = this.pDotSlot[p]
    const row = this.pSource[p] * FIELD_COUNT
    this.counters[row + FIELD.casts]++
    if (this.rngProc.roll100() < this.spellMissPct) {
      this.counters[row + FIELD.misses]++
      return
    }
    const now = this.now
    if (this.dotStacks[slot] > 0 && now > this.dotEnd[slot]) this.endStackingDot(slot)
    if (this.dotStacks[slot] === 0) {
      this.poisonedDots++
      this.sdNextAt[slot] = now + this.pB[p]
      this.q.push(this.sdNextAt[slot], EV_STACKING_DOT_TICK, slot, ++this.sdGen[slot])
    }
    this.dotStacks[slot] = Math.min(this.pAmount[p], this.dotStacks[slot] + 1)
    this.dotEnd[slot] = now + this.pDuration[p]
  }

  /**
   * One tick of a stacking poison: its damage per stack × the stacks, the magic multiplier with its
   * school's average partial resist and multipliers, as every spell's (docs/mechanics/spells.md §3,
   * §9), and the auras' poison bonus (rogue.md §4.2 [?]); in `forever` a flagged tick may crit at
   * spell crit with its school's, ×1.5, firing nothing. A tick that comes after its end finds it run
   * out (its last partial period deals nothing).
   */
  private onStackingDotTick(slot: number): void {
    const p = this.sdProc[slot]
    if (this.now > this.dotEnd[slot]) {
      this.endStackingDot(slot)
      return
    }
    const row = this.pSource[p] * FIELD_COUNT
    const school = this.pSchool[p]
    let damage = this.pA[p] * this.dotStacks[slot] * this.resistFactor[school] * this.magicMult * this.schDamage[school] * this.schTaken[school]
    if (this.pPoison[p] === 1) damage *= this.poisonMult
    if (this.pPeriodicCrit[p] === 1 && this.rngProc.roll100() < this.spellCritPct + this.schCrit[school]) {
      damage *= CRIT_MULTIPLIER.spell
      this.counters[row + FIELD.crits]++
    } else this.counters[row + FIELD.hits]++
    if (this.trace !== null) this.trace(this.pSource[p], -1, this.now)
    this.dealDamage(this.pSource[p], damage)
    // The next tick keeps the timer; if no application extends the poison by then, it has run out.
    this.sdNextAt[slot] = this.now + this.pB[p]
    this.q.push(this.sdNextAt[slot], EV_STACKING_DOT_TICK, slot, this.sdGen[slot])
  }

  /** A stacking poison runs out: no stacks, no ticks, one poison fewer on the target. */
  private endStackingDot(slot: number): void {
    if (this.dotStacks[slot] === 0) return
    this.dotStacks[slot] = 0
    this.sdGen[slot]++
    this.poisonedDots--
  }

  /** Deep Wounds-style bleed tick: share × main-hand average swing / ticks, current AP, no armor (warrior.md §2.5). */
  private onBleedTick(slot: number): void {
    const p = this.bleedProc[slot]
    const ticks = this.pAmount[p]
    const h = HAND.main
    const average = this.hasWeapon[h]
      ? (this.wMin[h] + this.wMax[h]) / 2 + this.wFlat[h] + (this.ap / 14) * this.wSpeedSec[h]
      : 0
    const damage = ((this.pA[p] * average) / ticks) * this.physMult
    const row = this.pSource[p] * FIELD_COUNT
    this.counters[row + FIELD.hits]++
    if (this.trace !== null) this.trace(this.pSource[p], -1, this.now)
    this.dealDamage(this.pSource[p], damage)
    if (--this.bleedTicksLeft[slot] > 0) {
      this.bleedNextAt[slot] = this.now + this.pB[p]
      this.q.push(this.bleedNextAt[slot], EV_BLEED_TICK, slot, this.bleedGen[slot])
    }
  }

  // ------------------------------------------------------------------------------------------
  // Spells, cooldown categories and exclusive auras (the paladin; its mana is the pool below)
  // ------------------------------------------------------------------------------------------

  /** Puts aura a up until `end`, first ending the others of its exclusive group (one seal, paladin.md#seals). */
  private putAura(a: number, end: number): void {
    for (let i = this.aGroupNext[a]; i !== a; i = this.aGroupNext[i]) if (this.auraActive[i]) this.removeAura(i)
    this.startAura(a, end)
  }

  /** Ability a's cooldown also holds every ability of its category (paladin.md#implementation-notes). */
  private shareCooldown(a: number): void {
    const until = this.abReadyAt[a]
    for (let b = this.abCatNext[a]; b !== a; b = this.abCatNext[b]) if (this.abReadyAt[b] < until) this.abReadyAt[b] = until
  }

  /**
   * A `spell` ability, paid for (paladin.md): its row counts the cast, its spell rolls and deals
   * damage, and if the spell lands (or it has none) it returns its mana (Sanctified Judgement). Its
   * ticks, if any, start now (Consecration).
   */
  private spellAbility(a: number): void {
    this.chainMask = 0
    this.counters[this.abSource[a] * FIELD_COUNT + FIELD.casts]++
    const s = this.abSpell[a]
    // docs/classes/mage.md#talents: the cost Master of Elements returns a share of, while its spell resolves.
    this.castCostTenths = this.abCost[a]
    const landed = s < 0 || this.castSpell(s, false)
    this.castCostTenths = 0
    this.freeCrit = 0
    if (landed && this.abManaReturn[a] > 0) this.returnMana(a)
    // docs/classes/warlock.md §3: a landed Conflagrate ends your Immolate, unless Shadow and Flame keeps it.
    const consumed = this.abConsumesDot[a]
    if (landed && consumed >= 0 && (this.abConsumeChance[a] >= 1 || this.rngProc.next() < this.abConsumeChance[a])) this.cancelSpellDot(consumed)
    // paladin.md#protection-tree: a landed Holy Strike puts Iron Creed's buff up. A caster's DoT
    // marker (docs/mechanics/spells.md §7) is its DoT's, which put it up as it landed.
    const aura = this.abAura[a]
    if (landed && aura >= 0 && (s < 0 || this.splDotAura[s] !== aura)) this.putAura(aura, this.now + this.aDuration[aura])
    this.startTicks(a)
  }

  /**
   * Casts plan spell s and returns whether it landed (paladin.md#conventions-used-below; combat-tables
   * §3 and §9). Its table follows its damage class: `melee` is the main hand's special table, without
   * the miss slice if it always hits and without dodge, parry and block if it has No Active Defense,
   * crit ×2, in one roll for a weapon-damage spell and in two for one without (roll 1 for the
   * avoidance, roll 2 for crit on anything that landed, blocked too: combat-tables §3 "melee spells"
   * [?]); `ranged` is miss, block, then a crit roll [?]; `magic` is the spell table, a
   * miss roll unless it always hits, then a crit roll at spell crit; `none` always lands and rolls
   * spell crit. A spell that can't crit (`cannotCrit`: Holy Shield's block damage and Retribution
   * Aura's, paladin.md [?]) rolls no crit on any table. Damage: base (or weapon-based) + SP × coefficient, × its own and its school's
   * multipliers, then + the target's flat Holy damage taken × its share (JotC's bonus comes after
   * your own multipliers [?]), × the crit multiplier. Threat: (damage × mult + bonus) × Righteous
   * Fury for Holy × the global multiplier. A landed melee-class spell fires on-hit procs, and its
   * crit the melee crit procs (Vengeance) [?]; another spell's crit fires the spell crit procs. A
   * spell that doesn't trigger procs (a triggered spell without NOT_A_PROC: Seal of Righteousness's
   * and Seal of Fury's procs, Consecration's ticks) fires none and uses no crit charge [?].
   * `countCast`: count a cast on its row (a proc's spell; an ability counts its own).
   */
  private castSpell(s: number, countCast: boolean): boolean {
    const source = this.splSource[s]
    const row = source * FIELD_COUNT
    const c = this.counters
    if (countCast) c[row + FIELD.casts]++
    const defense = this.splDefense[s]
    const alwaysHit = this.splAlwaysHit[s] === 1
    let crit = false
    let blocked = false
    /** A shot with the ranged weapon (docs/mechanics/ranged-and-pets.md §5): the ranged table and weapon. */
    const shot = this.splRanged[s] === 1
    if (defense === DEFENSE.melee || defense === DEFENSE.ranged) {
      const th = shot ? this.thrRanged : this.thrSpecial
      const r = this.rngTable.roll100()
      const missTh = alwaysHit ? 0 : th[0]
      if (r < missTh) {
        c[row + FIELD.misses]++
        return false
      }
      const critChance = (shot ? this.rCritPct : this.specCrit[HAND.main]) + this.splBonusCrit[s]
      // A spell that can't crit rolls no crit (splNoCrit), on every table.
      const canCrit = this.splNoCrit[s] === 0
      if (defense === DEFENSE.ranged) {
        // combat-tables §3 "Defense type": ranged is miss, then block (from the front), then a second crit roll.
        const blockTh = missTh + (th[4] - th[2])
        blocked = r < blockTh
        if (shot && this.splHasDirect[s] === 0) {
          // ranged-and-pets.md §5: a sting (a pure DoT) lands its DoT and rolls no crit.
          this.applySpellDot(s)
          if (this.splTriggersProcs[s] === 1) this.fireProcs(TRIGGER.rangedLanded, -1)
          return true
        }
        crit = canCrit && this.rngTable.roll100() < critChance
      } else {
        let critFrom = missTh
        if (this.splNoActive[s] === 0) {
          // The miss slice removed for a spell that always hits.
          const shift = th[0] - missTh
          if (r < th[2] - shift) {
            if (r < th[1] - shift) {
              c[row + FIELD.dodges]++
              if (this.hasDodgeProcs) this.fireProcs(TRIGGER.targetDodge, HAND.main)
            } else {
              c[row + FIELD.parries]++
              this.onBossParried()
            }
            return false
          }
          critFrom = th[4] - shift
          blocked = r < critFrom
        }
        if (this.splWeaponPct[s] > 0) {
          // A weapon-damage spell (Seal of Command's proc, Holy Strike): one roll, the crit slice after the rest.
          crit = canCrit && !blocked && r < Math.min(100, critFrom + Math.max(0, critChance))
        } else {
          // combat-tables §3 "melee spells" (the damage judgements): roll 2 for crit, not truncated by
          // roll 1. When roll 1 has no slices (Always Hit and No Active Defense), its roll is the crit roll.
          crit = canCrit && (critFrom === 0 ? r : this.rngTable.roll100()) < critChance
        }
      }
    } else {
      // docs/mechanics/spells.md §2, §3: a binary spell is also resisted whole, in the same roll as
      // its hit, at its school's average resist: miss + (1 − miss) × resist.
      if (defense === DEFENSE.magic && !alwaysHit) {
        // docs/classes/mage.md#talents: its school's own hit (Elemental Precision), when the plan has any.
        const miss = this.hasSchoolHit ? this.schMiss[this.splSchool[s]] : this.spellMissPct
        const threshold = this.splBinary[s] === 1 ? miss + (100 - miss) * this.resistChance[this.splSchool[s]] : miss
        if (this.rngTable.roll100() < threshold) {
          c[row + FIELD.misses]++
          return false
        }
      }
      // docs/mechanics/spells.md §7: a pure DoT deals nothing as it lands and rolls no crit: its ticks start.
      if (this.splHasDirect[s] === 0) {
        this.applySpellDot(s)
        if (this.hasSpellLanded && this.splTriggersProcs[s] === 1) this.spellProcs(TRIGGER.spellLanded, s)
        return true
      }
      // §5: spell crit, the spell's own and its school's (Critical Mass, Combustion), and an aura's
      // stacks for this spell only (Winter's Chill on Frostbolt, docs/classes/mage.md#winters-chill).
      crit = this.splNoCrit[s] === 0 && this.rngTable.roll100() < this.spellCritPct + this.splBonusCrit[s] + this.schCrit[this.splSchool[s]] + this.critAuraPct(s) + this.freeCrit
    }

    let base: number
    const pct = this.splWeaponPct[s]
    if (pct > 0 && shot) {
      // ranged-and-pets.md §3, §5: the ranged weapon's roll, its flat damage (ammo, scope) and ranged
      // attack power ÷ 14 × its speed, or the normalized 2.8 [?].
      const speed = this.splNormalized[s] ? this.rNormSpeed : this.rSpeedSec
      const roll = this.rngDamage.uniform(this.rMin, this.rMax)
      const flat = this.splMin[s] === this.splMax[s] ? this.splMin[s] : this.rngDamage.uniform(this.splMin[s], this.splMax[s])
      base = (roll + this.rFlat + (this.rap / 14) * speed + flat) * pct
    } else if (pct > 0) {
      const h = HAND.main
      const speed = this.splNormalized[s] ? this.wNormSpeed[h] : this.wSpeedSec[h]
      const roll = this.rngDamage.uniform(this.wMin[h], this.wMax[h])
      const flat = this.splMin[s] === this.splMax[s] ? this.splMin[s] : this.rngDamage.uniform(this.splMin[s], this.splMax[s])
      // paladin.md#other-abilities: Holy Strike's flat 81–105 comes after its 40% (flatApart) [?].
      base = this.splFlatApart[s] === 1 ? (roll + this.wFlat[h] + (this.ap / 14) * speed) * pct + flat : (roll + this.wFlat[h] + (this.ap / 14) * speed + flat) * pct
    } else if (this.splWeaponDps[s] > 0) {
      // paladin.md#other-abilities: Hammer of the Righteous, 3 × the main hand's weapon DPS, with its
      // attack power or without [?] (OQ 11), no roll.
      const h = HAND.main
      const speed = this.wSpeedSec[h]
      const average = (this.wMin[h] + this.wMax[h]) / 2 + this.wFlat[h] + (this.splWeaponDpsAp[s] === 1 ? (this.ap / 14) * speed : 0)
      base = (this.splWeaponDps[s] * average) / speed
    } else {
      base = this.splMin[s] === this.splMax[s] ? this.splMin[s] : this.rngDamage.uniform(this.splMin[s], this.splMax[s])
    }
    // docs/mechanics/spells.md §5: the school's spell damage (Holy's is the paladin's "SP").
    const school = this.splSchool[s]
    let damage = (base + this.splSpCoef[s] * this.spSchool[school]) * this.splDamageMult[s]
    const holy = school === SCHOOL.holy
    if (holy) {
      // paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc: the target's flat bonus × the spell's share.
      // docs/mechanics/spells.md §9: the school's multipliers, the boss's damage taken last (Curse of the Elements) [?].
      damage = (damage * this.magicMult * this.holyMult * this.schDamage[school] + this.holyTaken * this.splTakenScale[s]) * this.schTaken[school]
    } else if (school === SCHOOL.physical) {
      // ranged-and-pets.md §5: a physical shot takes the ranged damage multiplier and armor.
      damage *= shot ? this.physMult * this.rArmorFactor * this.rDamageMult : this.physMult * this.armorFactor[HAND.main]
    } else {
      // docs/mechanics/spells.md §3, §9: the school's multipliers, and a partial resist on average unless binary.
      damage *= this.magicMult * this.schDamage[school] * this.schTaken[school] * (this.splBinary[s] === 1 ? 1 : this.resistFactor[school])
    }
    // docs/classes/shaman.md#stormstrike: +20% while Stormstrike's aura is up, which this landed spell uses up;
    // Lava Burst's +20% while your Flame Shock is on the target, which it leaves up (#elemental-abilities).
    const boost = this.splBoostAura[s]
    // docs/classes/warlock.md §11.3: Decimation's Shadow Bolt below 35%.
    if (this.splLowPct[s] !== 0 && this.now >= this.splLowAt[s]) damage *= 1 + this.splLowPct[s] / 100
    if (boost >= 0 && this.auraActive[boost]) {
      damage *= 1 + this.splBoostPct[s] / 100
      if (this.splBoostKeep[s] === 0) this.removeAura(boost)
    }
    if (crit) {
      damage *= this.splCritMult[s]
      c[row + FIELD.crits]++
    } else if (blocked) {
      // Mob block value is 0 [?] (combat-tables §2.4): a blocked spell deals full damage.
      c[row + FIELD.blocks]++
    } else {
      c[row + FIELD.hits]++
    }
    const threat = (damage * this.splThreatMult[s] + this.splThreatBonus[s]) * (holy ? this.holyThreatMult : 1) * this.threatMult
    this.addDamage(source, damage, threat)
    // docs/mechanics/spells.md §7: a hybrid's DoT starts as its direct part lands (Fireball, Immolate).
    if (this.splDotTicks[s] > 0) this.applySpellDot(s)
    // paladin.md#conventions-used-below: a triggered spell without NOT_A_PROC triggers nothing [?].
    if (this.splTriggersProcs[s] === 0) return true
    if (shot) {
      // ranged-and-pets.md §9: a shot fires the ranged procs, not the melee or spell ones.
      this.fireProcs(TRIGGER.rangedLanded, -1)
      if (crit) {
        this.fireProcs(TRIGGER.rangedCrit, -1)
        this.useCritCharges(school)
      }
    } else if (defense === DEFENSE.melee) {
      this.fireProcs(TRIGGER.meleeLanded, HAND.main)
      if (crit) this.onCrit(HAND.main)
    } else {
      // docs/mechanics/spells.md §10: a landed spell's procs, then its crit's (their schools filter them).
      if (this.hasSpellLanded && defense !== DEFENSE.ranged) this.spellProcs(TRIGGER.spellLanded, s)
      if (crit) {
        // docs/classes/mage.md#ignite: the crit's damage, which Ignite takes its share of.
        this.critDamage = damage
        this.fireSpellTrigger(TRIGGER.spellCrit, school, source)
        this.useCritCharges(school)
      }
    }
    return true
  }

  /** Spell s's crit % from its aura's stacks while it's up (Winter's Chill, docs/classes/mage.md#winters-chill); 0 without. */
  private critAuraPct(s: number): number {
    const aura = this.splCritAura[s]
    return aura >= 0 && this.auraActive[aura] ? this.splCritAuraPct[s] * this.auraStacks[aura] : 0
  }

  /**
   * A crit feeds the rolling Ignite (docs/classes/mage.md#ignite; Plan.ignite): its share of the crit's
   * damage joins the damage still to come, over the next `igTicks` ticks; a tick already due keeps
   * its time, otherwise the next comes one period from now. Its marker is up until the last tick.
   */
  private feedIgnite(): void {
    this.igPool += (this.igPct / 100) * this.critDamage
    this.counters[this.igSource * FIELD_COUNT + FIELD.casts]++
    if (this.igTicksLeft === 0) {
      this.igNextAt = this.now + this.igTickMs
      this.q.push(this.igNextAt, EV_IGNITE_TICK, 0, ++this.igGen)
    }
    this.igTicksLeft = this.igTicks
    if (this.igAura >= 0) this.startAura(this.igAura, this.igNextAt + (this.igTicks - 1) * this.igTickMs)
  }

  /** One tick of the rolling Ignite: the pool ÷ the ticks left, × the boss's damage taken and average resist now; no miss, no crit. */
  private igniteTick(): void {
    const share = this.igPool / this.igTicksLeft
    this.igPool -= share
    const school = this.igSchool
    const damage = share * this.schTaken[school] * this.resistFactor[school]
    this.counters[this.igSource * FIELD_COUNT + FIELD.hits]++
    if (this.trace !== null) this.trace(this.igSource, -1, this.now)
    this.addDamage(this.igSource, damage, damage * this.threatMult)
    if (--this.igTicksLeft > 0) {
      this.igNextAt = this.now + this.igTickMs
      this.q.push(this.igNextAt, EV_IGNITE_TICK, 0, this.igGen)
    } else this.igPool = 0
  }

  /** Fires a spell trigger for plan spell s: its school and row filter the procs that name them (docs/mechanics/spells.md §10). */
  private spellProcs(trigger: number, s: number): void {
    this.fireSpellTrigger(trigger, this.splSchool[s], this.splSource[s])
  }

  /**
   * Fires a spell trigger for a spell of `school` on row `source`. A proc it fires can cast a spell
   * that fires spell triggers of its own; the filters come back afterwards, so the rest of this
   * trigger's procs still see this spell's school and row (docs/mechanics/spells.md §10).
   */
  private fireSpellTrigger(trigger: number, school: number, source: number): void {
    const outerSchool = this.procSchool
    const outerSource = this.procSource
    this.procSchool = school
    this.procSource = source
    this.fireProcs(trigger, -1)
    this.procSchool = outerSchool
    this.procSource = outerSource
  }

  /**
   * Plan spell s's DoT lands (docs/mechanics/spells.md §7): a tick due this very moment lands first,
   * then it restarts, the partial tick in progress lost. Each tick snapshots, now, the spell's base
   * plus its coefficient × the school's spell damage, × the spell's own, your magic and your
   * school's multipliers, and the crit chance (a tick crits only with the spell's flag, in a profile
   * whose periodic effects can). The boss's side (damage taken, the resist) is read at each tick.
   * Its marker aura is up until the last tick; on a hybrid's own DoT row an application counts as a cast.
   */
  private applySpellDot(s: number): void {
    const now = this.now
    if (this.spDotTicksLeft[s] > 0 && this.spDotNextAt[s] === now) this.spellDotTick(s)
    const school = this.splSchool[s]
    let snapshot = (this.splDotTick[s] + this.splDotCoef[s] * this.spSchool[school]) * this.splDotMult[s] * this.magicMult * this.schDamage[school]
    if (school === SCHOOL.holy) snapshot *= this.holyMult
    this.spDotDamage[s] = snapshot
    this.spDotCrit[s] = this.splDotCanCrit[s] === 1 ? this.spellCritPct + this.splBonusCrit[s] + this.schCrit[school] + this.freeCrit : -1
    this.spDotTicksLeft[s] = this.splDotTicks[s]
    this.spDotNextAt[s] = now + this.splDotTickMs[s]
    this.q.push(this.spDotNextAt[s], EV_SPELL_DOT_TICK, s, ++this.spDotGen[s])
    const dotRow = this.splDotSource[s]
    if (dotRow !== this.splSource[s]) this.counters[dotRow * FIELD_COUNT + FIELD.casts]++
    const marker = this.splDotAura[s]
    if (marker >= 0) this.startAura(marker, now + this.splDotTicks[s] * this.splDotTickMs[s])
  }

  /**
   * One tick of a spell DoT (docs/mechanics/spells.md §7): its snapshot × the boss's damage taken of
   * its school now, and its average partial resist unless it's binary; never a miss; a crit at the
   * snapshot's chance × the spell's crit multiplier. It fires the `spellTick` procs, and no others.
   */
  private spellDotTick(s: number): void {
    const school = this.splSchool[s]
    const row = this.splDotSource[s] * FIELD_COUNT
    let damage = this.spDotDamage[s] * this.schTaken[school] * (this.splBinary[s] === 1 ? 1 : this.resistFactor[school])
    const chance = this.spDotCrit[s]
    if (chance > 0 && this.rngTable.roll100() < chance) {
      damage *= this.splCritMult[s]
      this.counters[row + FIELD.crits]++
    } else {
      this.counters[row + FIELD.hits]++
    }
    if (this.trace !== null) this.trace(this.splDotSource[s], -1, this.now)
    const threat = damage * this.splThreatMult[s] * (school === SCHOOL.holy ? this.holyThreatMult : 1) * this.threatMult
    this.addDamage(this.splDotSource[s], damage, threat)
    if (--this.spDotTicksLeft[s] > 0) {
      this.spDotNextAt[s] = this.now + this.splDotTickMs[s]
      this.q.push(this.spDotNextAt[s], EV_SPELL_DOT_TICK, s, this.spDotGen[s])
    }
    if (this.hasSpellTick) this.spellProcs(TRIGGER.spellTick, s)
  }

  /** Ends plan spell s's DoT now, its remaining ticks and its marker (a channel cut off; docs/mechanics/spells.md §6). */
  private cancelSpellDot(s: number): void {
    if (this.spDotTicksLeft[s] === 0) return
    this.spDotTicksLeft[s] = 0
    this.spDotGen[s]++
    const marker = this.splDotAura[s]
    if (marker >= 0 && this.auraActive[marker]) this.removeAura(marker)
  }

  /**
   * A channel starts (docs/mechanics/spells.md §6), paid for, its GCD and cooldown started: its row
   * counts the cast. Its `spell`, if any, is cast now: a miss ends the channel at once (the GCD runs
   * on), and its DoT is the channel's ticks (Mind Flay). Otherwise its `tickSpell` ticks from now
   * (Arcane Missiles). It holds the GCD until it ends, and everything else with `castHoldsOffGcd`,
   * after `channelTicks` ticks when it's cut off, or all of them. Its `aura`, unless that's its
   * DoT's marker, is up on the player while it channels (Evocation's regeneration, §8).
   */
  private channel(a: number): void {
    const now = this.now
    this.counters[this.abSource[a] * FIELD_COUNT + FIELD.casts]++
    const s = this.abSpell[a]
    let ticks = this.abTicks[a]
    let tickMs = this.abTickMs[a]
    if (s >= 0) {
      const landed = this.castSpell(s, false)
      this.freeCrit = 0
      if (!landed) return
      ticks = this.splDotTicks[s]
      tickMs = this.splDotTickMs[s]
    } else this.startTicks(a)
    const cut = this.abChannelTicks[a]
    const n = cut > 0 && cut < ticks ? cut : ticks
    this.channeling = a
    this.castGcdEnd = this.gcdEnd
    this.gcdEnd = Infinity
    if (this.abCastHolds[a]) this.castHolding = true
    const end = now + n * tickMs
    this.q.push(end, EV_CHANNEL_END, a, ++this.channelGen)
    // docs/mechanics/ranged-and-pets.md §4: so does a channel, until it ends.
    if (this.rCastsHold) this.holdAutoShot(end)
    // Queued after the end, so the end (and a tick due then) comes first and takes it down.
    const aura = this.channelAura(a)
    if (aura >= 0) this.putAura(aura, end)
  }

  /** A channel's own aura on the player (docs/mechanics/spells.md §6, §8), or −1: its `aura` unless that marks its DoT. */
  private channelAura(a: number): number {
    const aura = this.abAura[a]
    const s = this.abSpell[a]
    return s >= 0 && aura === this.splDotAura[s] ? -1 : aura
  }

  /**
   * A channel ends (docs/mechanics/spells.md §6): a tick due this very moment lands first, and the
   * ticks it cut off are lost, and its own aura with them; the GCD ends when it would have on its
   * own, and the rotation walks.
   */
  private endChannel(a: number): void {
    const now = this.now
    const s = this.abSpell[a]
    if (s >= 0) {
      if (this.spDotTicksLeft[s] > 0 && this.spDotNextAt[s] === now) {
        this.spellDotTick(s)
        // That tick's own event is still queued for now: stale from here, even when it was the last
        // (docs/classes/priest.md#33-mind-flay-r6-18807: a full Mind Flay ticks 3 times, not 4).
        this.spDotGen[s]++
      }
      this.cancelSpellDot(s)
    } else {
      if (this.abTicksLeft[a] > 0 && this.abTickAt[a] === now) this.castTick(a)
      this.abTicksLeft[a] = 0
      this.abTickGen[a]++
    }
    // A guard: today a channel ends only when its aura was set to expire, so this is a no-op; it
    // keeps the aura from outliving a channel ended any other way.
    const aura = this.channelAura(a)
    if (aura >= 0 && this.auraActive[aura]) this.removeAura(aura)
    this.channeling = -1
    this.castHolding = false
    this.gcdEnd = this.castGcdEnd
    if (this.gcdEnd > now) this.q.push(this.gcdEnd, EV_ACT, 0, 0)
    this.actPending = this.hasRotation
  }

  // ------------------------------------------------------------------------------------------
  // The ranged weapon and Auto Shot (docs/mechanics/ranged-and-pets.md §2–§5)
  // ------------------------------------------------------------------------------------------

  /**
   * The fight's first Auto Shot, at `firstShotMs` (§4): its wind-up came before, so a cast at the
   * pull doesn't hold it back.
   */
  private startAutoShot(): void {
    const at = this.rFirstShotMs
    this.rReloadAt = at - this.rWindupMs
    this.rNextAt = at
    this.q.push(at, EV_AUTO_SHOT, 0, ++this.rGen)
  }

  /**
   * Auto Shot fires (§4): it resolves, then the next cycle starts: the reload part, cycle − wind-up,
   * then the wind-up, which a cast or channel still running then holds back until it ends. The new
   * cycle's length is read now, so a haste change applies from the next shot, as a swing's does.
   */
  private onAutoShot(): void {
    const now = this.now
    this.rLastShotAt = now
    this.autoShot()
    this.rReloadAt = now + Math.max(0, this.rCycleMs - this.rWindupMs)
    this.rNextAt = Math.max(this.rReloadAt, this.rHeldUntil) + this.rWindupMs
    this.q.push(this.rNextAt, EV_AUTO_SHOT, 0, ++this.rGen)
    // A line that reads the timer (COND 62, 63) may be usable now.
    if (this.walksOnAutoShot) this.actPending = this.hasRotation
  }

  /**
   * A cast or channel runs until `until` (§4): Auto Shot's wind-up can't run meanwhile, so the next
   * shot fires a wind-up after both the reload and the cast are over. A cast that ends before the
   * reload does delays nothing; one that starts during the wind-up restarts it after the cast.
   */
  private holdAutoShot(until: number): void {
    if (until <= this.rHeldUntil) return
    this.rHeldUntil = until
    const at = Math.max(this.rReloadAt, until) + this.rWindupMs
    if (at > this.rNextAt) {
      this.rNextAt = at
      this.q.push(at, EV_AUTO_SHOT, 0, ++this.rGen)
    }
  }

  /**
   * An Auto Shot (§2, §3): roll 1 over miss and block (from the front), no dodge, parry or glancing;
   * roll 2 for crit on anything that landed, blocked too, as combat-tables §3's ranged defense type
   * [?]. Damage is the weapon's roll + its flat damage (the ammo's DPS × its speed, a scope's) +
   * ranged attack power ÷ 14 × its speed, × the ranged and physical multipliers and armor; a crit ×
   * its multiplier. It fires the ranged procs, and makes threat as a white swing does, but no rage.
   */
  private autoShot(): void {
    const source = this.rSource
    const row = source * FIELD_COUNT
    const c = this.counters
    c[row + FIELD.casts]++
    if (this.trace !== null) this.trace(source, TRACE_RANGED, this.now)
    const th = this.thrRanged
    const r = this.rngTable.roll100()
    if (r < th[0]) {
      c[row + FIELD.misses]++
      return
    }
    const roll = this.rngDamage.uniform(this.rMin, this.rMax)
    let damage = (roll + this.rFlat + (this.rap / 14) * this.rSpeedSec) * this.rDamageMult * this.physMult * this.rArmorFactor
    const crit = this.rngTable.roll100() < this.rCritPct
    if (crit) {
      damage *= this.rCritMult
      c[row + FIELD.crits]++
    } else if (r < th[4]) {
      // Mob block value is 0 [?] (combat-tables §2.4): a blocked shot deals full damage.
      c[row + FIELD.blocks]++
    } else {
      c[row + FIELD.hits]++
    }
    this.dealDamage(source, damage)
    this.fireProcs(TRIGGER.rangedLanded, -1)
    this.fireProcs(TRIGGER.autoShotLanded, -1)
    if (crit) {
      this.fireProcs(TRIGGER.rangedCrit, -1)
      this.useCritCharges(SCHOOL.physical)
    }
  }

  /**
   * COND.autoShotClear (§11): ability a, started now, completes at least `spare` ms before the next
   * Auto Shot's wind-up begins, so it holds nothing back. An instant always does; without a ranged
   * weapon, nothing does. Its cast time is the one `use` would start: an instant-cast aura, its
   * stacks' cut, casting speed and ranged haste.
   */
  private autoShotClear(a: number, spare: number): boolean {
    if (!this.hasRanged) return false
    let castMs = this.abCastMs[a]
    if (castMs === 0) return true
    const instant = this.abInstantAura[a]
    if (instant >= 0 && this.auraActive[instant]) return true
    if (this.abStackAura[a] >= 0) castMs *= this.stackCut(a, this.abStackCast[a])
    if (this.abCastHasted[a]) castMs = hastedCastMs(castMs, this.castHasteMult)
    if (this.abCastRangedHasted[a]) castMs = hastedCastMs(castMs, this.rangedHaste())
    if (castMs === 0) return true
    return this.now + castMs + spare <= this.rNextAt - this.rWindupMs
  }

  // ------------------------------------------------------------------------------------------
  // The pet (docs/mechanics/ranged-and-pets.md §6–§10): a second attacker in the same fight
  // ------------------------------------------------------------------------------------------

  /** The pet arrives at `startMs`: its first swing, its first walk, and its power tick from a random phase (§7) [?]. */
  private startPet(): void {
    const at = this.petStartMs
    if (this.petHasWeapon) {
      this.petNextSwingAt = at
      this.q.push(at, EV_PET_SWING, 0, ++this.petSwingGen)
    }
    this.q.push(at, EV_PET_ACT, 0, 0)
    if (this.hasPetPower && this.petPowerTickMs > 0) this.q.push(at + Math.floor(this.rngPet.next() * this.petPowerTickMs), EV_PET_POWER, 0, 0)
  }

  /**
   * The pet's numbers against the current stats and auras (§6, §8): attack power (its own, the
   * auras' and its shares of yours), crit and hit (its own and its shares of your spell crit and spell
   * hit, melee and spells alike), damage and attack speed; its white and special tables
   * against the boss at its level and skill (combat-tables §2–§4, from behind or the front, glancing
   * only if it glances); its spell miss (combat-tables §9); and the boss's armor, less your debuffs on
   * it, at its level.
   */
  private recomputePet(): void {
    const plan = this.plan
    const f = plan.fight
    this.petAp = Math.max(0, this.petBaseAp + this.dynPetAp + this.petApFromAp * this.ap + this.petApFromRap * this.rap)
    // Its shares of your spell crit and spell hit (§6: a warlock's demon, warlock.md §11.2) [?].
    const ownerCrit = this.petCritFromOwner * this.derived.spellCrit
    const ownerHit = this.petHitFromOwner * this.derived.spellHit
    this.petCritPct = this.petBaseCrit + ownerCrit + this.dynPetCrit
    this.petSpellCritNow = this.petSpellCrit + ownerCrit
    this.petDamageMult = this.petStaticDamage * this.petAuraDamage
    if (this.petHasWeapon) this.petSwingMs = swingMs(this.petWSpeedSec, this.petStaticHaste * this.petAuraHaste)
    const inputs = this.meleeIn
    const ch = this.chances
    inputs.attackerLevel = this.petLevel
    inputs.targetLevel = f.targetLevel
    inputs.skill = this.petSkill
    inputs.hit = this.petHit + ownerHit
    inputs.sheetCrit = this.petCritPct
    inputs.auraCrit = this.petAuraCritBase + this.dynPetCrit
    inputs.expertise = 0
    inputs.front = this.petFront
    inputs.canDodge = f.bossCanDodge
    inputs.canParry = f.bossCanParry
    inputs.canBlock = f.bossCanBlock
    meleeChances(plan.profile, inputs, true, false, ch)
    if (!this.petGlances) ch.glance = 0
    thresholds(whiteSlices(ch, this.slices), this.petThrWhite)
    meleeChances(plan.profile, inputs, false, false, ch)
    thresholds(specialSlices(ch, 0, this.slices), this.petThrSpecial)
    this.petSpecCrit = ch.crit
    this.petSpellMissPct = spellMiss(plan.profile, this.petLevel, f.targetLevel, this.petSpellHit + ownerHit)
    this.petArmorFactor = 1 - armorReduction(f.targetArmor - this.dynTargetArmor, this.petLevel, plan.profile)
  }

  /** Aura a's pet mods changed by `deltaStacks` stacks (§8): attack power and crit add; attack speed and damage multiply, from the active auras. */
  private petAuraChanged(a: number, deltaStacks: number): void {
    this.dynPetAp += this.aPetAp[a] * deltaStacks
    this.dynPetCrit += this.aPetCrit[a] * deltaStacks
    let haste = 1
    let damage = 1
    for (let i = 0; i < this.auraActive.length; i++) {
      if (!this.auraActive[i] || !this.aPetful[i]) continue
      const stacks = this.auraStacks[i]
      if (this.aPetHaste[i]) haste *= 1 + (this.aPetHaste[i] * stacks) / 100
      if (this.aPetDamage[i]) damage *= 1 + (this.aPetDamage[i] * stacks) / 100
    }
    this.petAuraHaste = haste
    this.petAuraDamage = damage
    this.recomputePet()
  }

  /** The pet's power gained, capped (§7), and a decision point for its list. */
  private gainPetPower(tenths: number): void {
    if (!this.hasPetPower || tenths <= 0) return
    this.petPower = Math.min(this.petPowerMax, this.petPower + tenths)
    this.petActPending = true
  }

  /** The pet's damage (§10): your DPS counts it, on its own row; it makes none of your threat. */
  private addPetDamage(source: number, damage: number): void {
    this.counters[source * FIELD_COUNT + FIELD.damage] += damage
    this.fightDamage += damage
    if (this.damageTrace !== null) this.damageTrace(source, damage)
  }

  /**
   * The pet's white swing (§6): one roll over its white table (miss, dodge, parry and block from the
   * front, glancing only if it glances, crit × its multiplier); damage its roll + its attack power
   * ÷ 14 × its speed, × its damage multiplier and the boss's armor at its level. It fires `petLanded`
   * and `petCrit`; the next swing comes a hasted swing later, at the speed its procs leave.
   */
  private petSwing(): void {
    this.petWhiteSwing()
    // The next swing at the speed its procs left it (a Frenzy from this crit), as a hand's is.
    this.petNextSwingAt = this.now + this.petSwingMs
    this.q.push(this.petNextSwingAt, EV_PET_SWING, 0, ++this.petSwingGen)
  }

  private petWhiteSwing(): void {
    const now = this.now
    const source = this.petSource
    const row = source * FIELD_COUNT
    const c = this.counters
    c[row + FIELD.casts]++
    if (this.trace !== null) this.trace(source, TRACE_PET, now)
    const rng = this.rngPet
    const th = this.petThrWhite
    const r = rng.roll100()
    if (r < th[0]) {
      c[row + FIELD.misses]++
      return
    }
    if (r < th[2]) {
      c[row + (r < th[1] ? FIELD.dodges : FIELD.parries)]++
      return
    }
    let damage = (rng.uniform(this.petWMin, this.petWMax) + (this.petAp / 14) * this.petWSpeedSec) * this.petDamageMult * this.petArmorFactor
    let crit = false
    if (r < th[3]) {
      damage *= rng.uniform(this.petGlanceLow, this.petGlanceHigh)
      c[row + FIELD.glances]++
    } else if (r < th[4]) {
      c[row + FIELD.blocks]++
    } else if (r < th[5]) {
      damage *= this.petCritMult
      crit = true
      c[row + FIELD.crits]++
    } else {
      c[row + FIELD.hits]++
    }
    this.addPetDamage(source, damage)
    this.fireProcs(TRIGGER.petLanded, -1)
    if (crit) this.fireProcs(TRIGGER.petCrit, -1)
  }

  /**
   * The pet walks its priority list (§7): it uses every line, in order, whose ability is off
   * cooldown, affordable from its power, clear of its global cooldown (for one that starts it) and
   * whose conditions hold; not while it casts, nor before it arrives.
   */
  private petAct(): void {
    this.petActPending = false
    const now = this.now
    if (this.petCasting >= 0 || now < this.petStartMs) return
    const lines = this.petLineAbility
    for (let l = 0; l < lines.length; l++) {
      const a = lines[l]
      if (this.pabReadyAt[a] > now || this.petPower < this.pabCost[a]) continue
      if (this.pabGcd[a] > 0 && this.petGcdEnd > now) continue
      if (!this.petConditionsHold(l)) continue
      this.petUse(a)
      if (this.petCasting >= 0) return
    }
  }

  /** A pet line's conditions (§7, §11): its power, and a plan aura up or down. */
  private petConditionsHold(l: number): boolean {
    for (let k = this.petCondStart[l]; k < this.petCondStart[l + 1]; k++) {
      const a = this.petCondA[k]
      switch (this.petCondCode[k]) {
        case COND.petPowerAtLeast:
          if (this.petPower < a) return false
          break
        case COND.petPowerAtMost:
          if (this.petPower > a) return false
          break
        case COND.auraUp:
          if (!this.auraActive[a]) return false
          break
        case COND.auraDown:
          if (a >= 0 && this.auraActive[a]) return false
          break
      }
    }
    return true
  }

  /** The pet uses ability a (§7): it pays, starts its cooldown and global cooldown, and strikes now or when its cast completes. */
  private petUse(a: number): void {
    const now = this.now
    this.petPower -= this.pabCost[a]
    if (this.pabCd[a] > 0) {
      this.pabReadyAt[a] = now + this.pabCd[a]
      this.q.push(this.pabReadyAt[a], EV_PET_ACT, 0, 0)
    }
    if (this.pabGcd[a] > 0) {
      this.petGcdEnd = now + this.pabGcd[a]
      this.q.push(this.petGcdEnd, EV_PET_ACT, 0, 0)
    }
    if (this.pabCast[a] > 0) {
      this.petCasting = a
      this.q.push(now + this.pabCast[a], EV_PET_CAST_END, a, 0)
      return
    }
    this.petStrike(a)
  }

  /** The pet's cast completes (§7): its spell strikes, and the pet walks its list again. */
  private onPetCastEnd(a: number): void {
    this.petCasting = -1
    this.petStrike(a)
    this.petActPending = true
  }

  /**
   * One of the pet's abilities strikes (§7). `melee`: one roll on its special table (miss, dodge,
   * parry and block from the front, crit), damage `min…max` + its coefficient × the pet's attack
   * power + a share of its swing, × the boss's armor at its level. `spell`: its spell miss, then a crit
   * roll at its spell crit; damage `min…max` + its coefficient × the pet's spell damage (its own and
   * its share of yours in that school), × the boss's damage taken of the school and its average
   * resist. Both × the pet's damage multiplier and the ability's crit multiplier on a crit; then its
   * aura, if any, and `petLanded`, then `petCrit` on a crit. `buff`: no target, so it only puts its
   * aura up: no roll, no damage, no `petLanded`.
   */
  private petStrike(a: number): void {
    const source = this.pabSource[a]
    const row = source * FIELD_COUNT
    const c = this.counters
    c[row + FIELD.casts]++
    if (this.pabKind[a] === PAB_BUFF) {
      if (this.pabAura[a] >= 0) this.applyAura(this.pabAura[a])
      return
    }
    const rng = this.rngPet
    let damage = this.pabMin[a] === this.pabMax[a] ? this.pabMin[a] : rng.uniform(this.pabMin[a], this.pabMax[a])
    let crit: boolean
    let blocked = false
    if (this.pabKind[a] === PAB_MELEE) {
      const th = this.petThrSpecial
      const r = rng.roll100()
      if (r < th[0]) {
        c[row + FIELD.misses]++
        return
      }
      if (r < th[2]) {
        c[row + (r < th[1] ? FIELD.dodges : FIELD.parries)]++
        return
      }
      blocked = r < th[4]
      crit = !blocked && r < Math.min(100, th[4] + Math.max(0, this.petSpecCrit + this.pabBonusCrit[a]))
      damage += this.pabApCoef[a] * this.petAp
      if (this.pabWeaponPct[a] > 0 && this.petHasWeapon) {
        damage += this.pabWeaponPct[a] * (rng.uniform(this.petWMin, this.petWMax) + (this.petAp / 14) * this.petWSpeedSec)
      }
      damage *= this.petDamageMult * this.petArmorFactor
    } else {
      const school = this.pabSchool[a]
      if (rng.roll100() < this.petSpellMissPct) {
        c[row + FIELD.misses]++
        return
      }
      const sp = this.petBaseSp + this.petSpFromOwner * this.spSchool[school]
      damage = (damage + this.pabSpCoef[a] * sp) * this.petDamageMult * this.schTaken[school] * this.resistFactor[school]
      crit = rng.roll100() < this.petSpellCritNow + this.pabBonusCrit[a]
    }
    if (crit) {
      damage *= this.pabCritMult[a]
      c[row + FIELD.crits]++
    } else if (blocked) {
      c[row + FIELD.blocks]++
    } else {
      c[row + FIELD.hits]++
    }
    this.addPetDamage(source, damage)
    if (this.pabAura[a] >= 0) this.applyAura(this.pabAura[a])
    this.fireProcs(TRIGGER.petLanded, -1)
    if (crit) this.fireProcs(TRIGGER.petCrit, -1)
  }

  // ------------------------------------------------------------------------------------------
  // Resources and forms (docs/classes/druid.md §2): every warrior row is `abPlainRage` and pays
  // rage as before; the rest take these paths.
  // ------------------------------------------------------------------------------------------

  /**
   * Whether an ability can be paid for now: rage for a plain rage row; otherwise it must be allowed
   * in the current form, a finisher needs a combo point, a Clearcasting charge pays for a
   * clearcastable one, and its pool must hold its cost (druid.md §2.4–§2.7).
   */
  private affordable(a: number): boolean {
    if (this.abPlainRage[a] === 1) return this.rage >= this.abCost[a]
    const forms = this.abForms[a]
    if (forms !== 0 && (forms & (1 << this.form)) === 0) return false
    if (this.abFinisher[a] === 1 && this.comboPoints === 0) return false
    if (this.abFree[a] === 1 && this.auraActive[this.freeAura]) return true
    return this.pool(this.abRes[a]) >= this.affordCost(a)
  }

  /**
   * An ability's cost now, in tenths: its stacks' cut (Maelstrom Weapon; not stacks that cut only the
   * cast time), and a mana cost × the active auras' mana-cost multiplier (Arcane Power's +30%,
   * docs/classes/mage.md#arcane-power), to a whole tenth.
   */
  private affordCost(a: number): number {
    const cost = this.abStackAura[a] >= 0 && this.abStackCost[a] !== 0 ? this.costOf(a) : this.costNow(a)
    return this.manaCostMult !== 1 && this.abRes[a] === RES_MANA ? Math.round(cost * this.manaCostMult) : cost
  }

  /**
   * The factor its stacks cut an ability's cast time or cost to: 1 − stacks × pct / 100, at least 0
   * (Maelstrom Weapon: 20% a stack, so 5 stacks make Lightning Bolt instant and free; shaman.md).
   */
  private stackCut(a: number, pct: number): number {
    const aura = this.abStackAura[a]
    const stacks = this.auraActive[aura] ? this.auraStacks[aura] : 0
    return Math.max(0, 1 - (stacks * pct) / 100)
  }

  /** An ability's cost now, in tenths: its stacks' cut, rounded down to whole mana (shaman.md#maelstrom-weapon) [?]. */
  private costOf(a: number): number {
    return 10 * Math.floor((this.abCost[a] * this.stackCut(a, this.abStackCost[a])) / 10 + 1e-9)
  }

  /** Pays a cost its stacks cut (a mana ability, shaman.md#maelstrom-weapon): spending any mana starts the five-second rule. */
  private payStackCost(cost: number): void {
    this.lastPaid = cost
    if (cost <= 0) return
    this.mana -= cost
    this.totalManaSpentTenths += cost
    this.manaSpentAt = this.now
  }

  /** An ability's cost now: its own, less Thousand Cuts' Energy per stack while that's up (rogue.md §5.3). */
  private costNow(a: number): number {
    const aura = this.abCostAura[a]
    if (aura < 0 || !this.auraActive[aura]) return this.abCost[a]
    return Math.max(0, this.abCost[a] - this.abCostPerStack[a] * this.auraStacks[aura])
  }

  /** The pool of a resource, in tenths. */
  private pool(res: number): number {
    return res === RES_RAGE ? this.rage : res === RES_ENERGY ? this.energy : this.mana
  }

  /**
   * Pays an ability's cost from its pool. A Clearcasting charge pays a clearcastable ability that
   * costs something, and is used up (druid.md §2.7); spending mana restarts the five-second rule
   * (§2.8). `lastPaid` keeps what was paid, for a refund.
   */
  private payCost(a: number): void {
    const cost = this.costNow(a)
    this.freeCrit = 0
    // rogue.md §5.3: the ability that Thousand Cuts made cheaper uses its stacks up.
    const costAura = this.abCostAura[a]
    if (costAura >= 0 && this.auraActive[costAura]) this.removeAura(costAura)
    this.lastPaid = cost
    if (this.abPlainRage[a] === 1) {
      this.spendRage(a)
      return
    }
    if (cost > 0 && this.abFree[a] === 1 && this.auraActive[this.freeAura]) {
      this.lastPaid = 0
      this.removeAura(this.freeAura)
      // docs/classes/priest.md#35-inner-focus-14751: the charge's crit goes to this ability's spell.
      this.freeCrit = this.freeCritPct
      return
    }
    const res = this.abRes[a]
    if (res === RES_RAGE) this.spendRage(a)
    else if (res === RES_ENERGY) {
      this.energy -= cost
      if (cost > 0 && this.hasMaxEnergy) this.actPending = true
    } else if (cost > 0) {
      // docs/classes/mage.md#arcane-power: a mana cost × the auras' multiplier, to a whole tenth.
      const paid = this.manaCostMult !== 1 ? Math.round(cost * this.manaCostMult) : cost
      this.lastPaid = paid
      this.mana -= paid
      this.totalManaSpentTenths += paid
      this.manaSpentAt = this.now
    }
  }

  /**
   * A druid ability that missed or was dodged or parried gets back its refund share of what it paid
   * (a builder 80%, a finisher nothing [?]; nothing when Clearcasting paid), and a finisher keeps its
   * combo points (druid.md §2.4, §2.5, Q29). No threat. Rage that reaches the cap drops the carried
   * fraction, as a warrior's refund does (rage.md#rounding).
   */
  private refundPaid(a: number): void {
    const refund = Math.floor(this.abRefund[a] * this.lastPaid + 1e-9)
    if (refund <= 0) return
    const res = this.abRes[a]
    if (res === RES_RAGE) {
      if (this.rage + refund >= this.maxRage) this.setRage(this.maxRage)
      else this.rage += refund
    } else if (res === RES_ENERGY) this.energy = Math.min(this.energyMax, this.energy + refund)
    else this.mana = Math.min(this.manaMax, this.mana + refund)
    this.actPending = this.hasRotation
  }

  /** Empties a pool after a landed hit that converts all of it (Ferocious Bite's Energy, druid.md §3.5). */
  private emptyPool(res: number): void {
    if (res === RES_ENERGY) this.energy = 0
    else if (res === RES_MANA) this.mana = 0
  }

  /**
   * A landed builder or finisher (druid.md §2.5): a finisher spends every combo point; a builder
   * adds its own, and one more on a non-periodic crit with Primal Fury's chance; at most 5.
   */
  private landComboPoints(a: number, crit: boolean): void {
    if (this.abFinisher[a] === 1) {
      const spent = this.comboPoints
      this.comboPoints = 0
      this.afterFinisher(a, spent)
    }
    let gained = this.abCp[a]
    const extra = this.abCritCp[a]
    if (gained > 0 && crit && extra > 0 && (extra >= 1 || this.rngProc.next() < extra)) gained++
    // rogue.md §5: Puncturing Wounds' extra point on any landed Backstab, crit or not.
    const bonus = this.abBonusCp[a]
    if (gained > 0 && bonus > 0 && (bonus >= 1 || this.rngProc.next() < bonus)) gained++
    this.comboPoints = Math.min(MAX_COMBO_POINTS, this.comboPoints + gained)
    this.actPending = this.hasRotation
  }

  /**
   * What a rogue's finisher does once it has spent its points (rogue.md §5): Relentless Strikes'
   * Energy at its chance per point spent, Improved Expose Armor's points back after 5, then
   * Ruthlessness's point at its chance. Nothing on a row without them (every druid row).
   */
  private afterFinisher(a: number, spent: number): void {
    const energyChance = this.abFinishEnergyChance[a] * spent
    if (energyChance > 0 && (energyChance >= 1 || this.rngProc.next() < energyChance)) this.gainEnergy(this.abFinishEnergy[a], this.abSource[a])
    if (spent === MAX_COMBO_POINTS) this.comboPoints += this.abCpBackAtFive[a]
    const cpChance = this.abFinishCpChance[a]
    if (cpChance > 0 && (cpChance >= 1 || this.rngProc.next() < cpChance)) this.comboPoints++
  }

  /** Gains a resource from a cast or an energize (`source` ≥ 0: its threat goes on that row). */
  /** `threat`: false for a gain that makes none (Life Tap's, docs/classes/warlock.md §3); only mana reads it. */
  private gainPower(res: number, tenths: number, source: number, threat = true): void {
    if (res === RES_RAGE) this.gainRage(tenths, source)
    else if (res === RES_ENERGY) this.gainEnergy(tenths, source)
    else this.gainMana(tenths, source, threat)
  }

  /**
   * Adds Energy in tenths, capped (druid.md §2.4); an energize (`source` ≥ 0) makes 5 threat per Energy [?].
   * The totals count it only in Cat Form, whose power it is: in another form the tick's Energy is
   * replaced when the druid enters cat (§2.8), so none of it is gained or lost.
   */
  private gainEnergy(tenths: number, source: number): void {
    if (tenths <= 0) return
    const gained = Math.min(tenths, this.energyMax - this.energy)
    this.energy += gained
    if (gained > 0) this.actPending = this.hasRotation
    if (this.form === this.catForm) {
      this.totalEnergyGainedTenths += gained
      this.totalEnergyWastedTenths += tenths - gained
    }
    if (source >= 0 && gained > 0) {
      const threat = gained * THREAT_PER_ENERGY_TENTH
      this.counters[source * FIELD_COUNT + FIELD.threat] += threat
      this.fightThreat += threat
    }
  }

  /**
   * Adds mana in tenths, capped (druid.md §2.8, paladin.md#mana-model); an energize (`source` ≥ 0:
   * Sanctified Judgement, Shield Specialization) makes 0.5 threat per mana on its row [?].
   */
  private gainMana(tenths: number, source: number, makesThreat = true): void {
    if (tenths <= 0) return
    const gained = Math.min(tenths, this.manaMax - this.mana)
    this.mana += gained
    this.totalManaGainedTenths += gained
    if (gained > 0) this.actPending = this.hasRotation
    if (source >= 0 && gained > 0) {
      this.manaBySource[source] += gained
      if (!makesThreat) return
      const threat = gained * THREAT_PER_MANA_TENTH
      this.counters[source * FIELD_COUNT + FIELD.threat] += threat
      this.fightThreat += threat
    }
  }

  /** An ability's mana back when it lands, at its chance (Sanctified Judgement, paladin.md#judgement). */
  private returnMana(a: number): void {
    const chance = this.abManaReturnChance[a]
    if (chance < 1 && this.rngProc.next() >= chance) return
    this.gainMana(this.abManaReturn[a], this.abSource[a])
  }

  /**
   * The player-global power tick (druid.md §2.4, §2.8; character-stats.md#spirit-and-mana-regeneration):
   * 20 Energy, and mana: mp5 always, and spirit regeneration unless mana was spent in the last 5 s,
   * or inside that rule the share of it that continues (Reverence; paladin.md#mana-model). The tick
   * doesn't reset on a shapeshift. A druid has no mp5 or share, so gains spirit regeneration only.
   */
  private onPowerTick(): void {
    // Adrenaline Rush doubles the tick while it's up (rogue.md §3.7), in whole tenths.
    if (this.energyMax > 0) this.gainEnergy(this.energyRegenMult === 1 ? this.energyTick : Math.round(this.energyTick * this.energyRegenMult), -1)
    if (this.manaMax > 0) {
      const outside = this.now - this.manaSpentAt >= this.fiveSecondRuleMs
      // docs/mechanics/spells.md §8: the mana hooks' Spirit regen multiplier (Innervate) and their
      // share inside the rule (Improved Stormstrike's, shaman.md), added to the plan's (at most all
      // of it). Without them, ×1 and +0.
      const regen = this.manaRegen * this.dynSpiritRegen
      const share = this.dynCastingRegen === 0 ? this.manaInFsrShare : Math.min(1, this.manaInFsrShare + this.dynCastingRegen)
      const tenths = this.manaMp5 + (outside ? regen : regen * share)
      if (this.manaTrace !== null) this.manaTrace(this.now, tenths)
      const before = this.mana
      this.gainMana(tenths, -1)
      this.totalManaRegenTenths += this.mana - before
    }
  }

  /**
   * Puts the druid in form f (plan/types.ts FormPlan): its stat block, its main hand, with the PPM
   * procs' main-hand chance from the new swing speed [?] (druid.md §2.1, Q28), and its threat
   * multiplier. A queued ability the form refuses is dropped. The swing in progress keeps its time;
   * the next uses the new speed.
   */
  private setForm(f: number): void {
    const form = this.plan.forms![f]
    this.form = f
    this.base.copyFrom(form.stats)
    this.scratch.copyFrom(form.stats)
    this.loadHand(HAND.main, form.mainHand)
    for (let i = 0; i < this.ppmProcs.length; i++) {
      const p = this.ppmProcs[i]
      this.pChance[2 * p] = this.hasWeapon[HAND.main] ? ppmChance(this.pPpm[p], this.wSpeedSec[HAND.main]) : 0
    }
    this.threatMult = form.threatMult * this.sThreat[this.stance]
    this.gainsRage = form.rage
    const queued = this.queued
    if (queued >= 0 && this.abForms[queued] !== 0 && (this.abForms[queued] & (1 << f)) === 0) this.queued = -1
    this.recomputeStats()
    this.recomputeMultipliers()
  }

  /**
   * A shapeshift (druid.md §2.8): into its form, then the form's entry rules. Entering cat sets
   * Energy by Furor from the Energy left in cat and the time since in no animal form (a powershift,
   * cat into cat, keeps it); entering bear sets rage to 0, then Furor may add 10 (an energize, on the
   * shapeshift's row). Wolfshead Helm adds nothing in Forever.
   */
  private shift(a: number): void {
    const source = this.abSource[a]
    this.counters[source * FIELD_COUNT + FIELD.casts]++
    const now = this.now
    const from = this.form
    if (from === this.catForm) {
      this.catEnergyLeft = this.energy
      this.outOfFormMs = 0
    } else if (from === this.casterForm) this.outOfFormMs += now - this.formSince
    this.formSince = now
    const armed = this.hasWeapon[HAND.main] === 1
    const to = this.abShiftTo[a]
    this.setForm(to)
    // A form with a weapon when the last had none starts swinging; one without stops.
    if (!armed && this.hasWeapon[HAND.main]) this.scheduleSwing(HAND.main, now + this.swingMs[HAND.main])
    else if (armed && !this.hasWeapon[HAND.main]) this.swingGen[HAND.main]++
    if (to === this.catForm) {
      this.energy = Math.min(this.energyMax, furorCatEnergyTenths(this.furorRank, this.catEnergyLeft, this.outOfFormMs))
    } else if (to === this.bearForm) {
      this.setRage(0)
      this.afterRageSpent()
      const chance = this.bearEntryRageChance
      if (chance > 0 && (chance >= 1 || this.rngProc.next() < chance)) this.gainRage(this.bearEntryRage, source)
    }
    this.actPending = this.hasRotation
  }

  // ------------------------------------------------------------------------------------------
  // Rage
  // ------------------------------------------------------------------------------------------

  /**
   * Adds a white hit's or a hit taken's rage, in tenths with its fraction (rage.md#rounding). The
   * pool holds whole tenths. `carry` keeps the fraction for the next such gain, so the fractions
   * add up and none is lost; `floor` drops it. At the cap the fraction is lost with the rest.
   */
  private gainRageFraction(tenths: number): void {
    // White hits give rage only in a form whose power is rage (a druid's bear; every warrior):
    // druid.md §8 "Rage from hits", rage.md#bear-druid-rage. `takeHit` checks the same before it.
    if (!this.gainsRage) return
    if (!this.carryRageFraction) {
      this.gainRage(Math.floor(tenths + 1e-9), -1)
      return
    }
    const total = this.rageFraction + tenths
    const whole = Math.floor(total + 1e-9)
    // gainRage drops the fraction if this gain reaches the cap; one already there keeps none.
    this.rageFraction = this.rage >= this.maxRage ? 0 : Math.max(0, total - whole)
    this.gainRage(whole, -1)
  }

  /** Sets the pool, dropping any carried fraction: a stance swap's limit, the cap, or all of it spent (rage.md#rounding). */
  private setRage(tenths: number): void {
    this.rage = tenths
    this.rageFraction = 0
  }

  /**
   * Adds rage in tenths, capped; a pool that reaches the cap keeps no carried fraction
   * (rage.md#rounding). `source` ≥ 0 marks an energize: 5 threat per rage gained (threat.md).
   */
  private gainRage(tenths: number, source: number): void {
    if (tenths <= 0) return
    const gained = Math.min(tenths, this.maxRage - this.rage)
    this.rage += gained
    if (this.rage >= this.maxRage) this.rageFraction = 0
    if (gained > 0) this.actPending = this.hasRotation
    this.totalRageGainedTenths += gained
    this.totalRageWastedTenths += tenths - gained
    if (source >= 0 && gained > 0) {
      const threat = gained * THREAT_PER_RAGE_TENTH
      this.counters[source * FIELD_COUNT + FIELD.threat] += threat
      this.fightThreat += threat
    }
  }

  // ------------------------------------------------------------------------------------------
  // Boss melee and damage taken
  // ------------------------------------------------------------------------------------------

  /** The boss parried the player: parry haste on the boss's pending swing (damage-and-timing §3.4). */
  private onBossParried(): void {
    const boss = this.plan.fight.bossSwing
    if (!boss || !boss.parryHaste) return
    const remaining = this.bossNextAt - this.now
    const after = Math.round(parryHasteRemaining(remaining, this.bossSwingMs))
    if (after !== remaining) {
      this.bossNextAt = this.now + after
      this.q.push(this.bossNextAt, EV_BOSS, 0, ++this.bossGen)
    }
  }

  /**
   * One boss swing on the player (combat-tables §8, encounter §5): one roll over miss, dodge, parry,
   * block, crit and crushing. A landed swing costs health after damage-taken modifiers, armor, its
   * outcome's multiplier and a block's block value (damage-and-timing §2.6), and gives rage from its
   * size before all of them (rage.md#forever-). Then the class hooks: `dodgeParry` and `dodge` or
   * `parry` for an avoided swing; for a landed one `damageTaken` (if it cost health), `meleeTaken`,
   * and `block` (then the blocks that end auras, of the auras up before these procs) or `critTaken`.
   */
  private onBossSwing(): void {
    const boss = this.plan.fight.bossSwing!
    const rng = this.rngBoss
    const r = rng.roll100()
    let raw = rng.uniform(boss.minDamage, boss.maxDamage)
    // The rotation's own attack-power debuff (Demoralizing Shout, warrior.md §7; Demoralizing Roar,
    // druid.md §4.5), never below 0.
    if (this.dynBossDamage !== 0) raw = Math.max(0, raw + this.dynBossDamage)
    const th = this.thrBoss
    if (this.bossTrace !== null) this.bossTrace(this.now)
    this.bossNextAt = this.now + this.bossSwingMs
    this.q.push(this.bossNextAt, EV_BOSS, 0, ++this.bossGen)
    const out = this.bossOutcomes
    if (r < th[0]) {
      out[BOSS_OUTCOME.miss]++
      if (this.swingTakenTrace !== null) this.swingTakenTrace(BOSS_OUTCOME.miss, 0, 0)
      return
    }
    if (r < th[2]) {
      const dodged = r < th[1]
      out[dodged ? BOSS_OUTCOME.dodge : BOSS_OUTCOME.parry]++
      if (this.swingTakenTrace !== null) this.swingTakenTrace(dodged ? BOSS_OUTCOME.dodge : BOSS_OUTCOME.parry, 0, 0)
      this.fireProcs(TRIGGER.dodgeParry, -1)
      if (dodged) this.fireProcs(TRIGGER.dodge, -1)
      else {
        this.fireProcs(TRIGGER.parry, -1)
        this.onPlayerParried()
      }
      return
    }
    // docs/mechanics/damage-and-timing.md#26-order-of-operations-physical-direct-hit, boss → tank:
    // damage-taken modifiers (the stance's and auras'), armor against the boss's level, then the
    // outcome's multiplier (combat-tables §8: crit ×2, crushing ×1.5), then the block value, floored
    // at 0. `pre` is the swing before armor, block and damage-taken modifiers, a crit or crushing
    // blow at its multiplied size: what `forever` rage reads, blocked or not (rage.md#forever-).
    const mitigated = raw * this.damageTakenMult * this.auraTakenMult * this.bossArmorFactor
    let outcome: number
    let lost: number
    let pre = raw
    if (r < th[3]) {
      outcome = BOSS_OUTCOME.block
      lost = Math.max(0, mitigated - this.blockValue)
    } else if (r < th[4]) {
      outcome = BOSS_OUTCOME.crit
      lost = mitigated * CRIT_MULTIPLIER.creature
      pre = raw * CRIT_MULTIPLIER.creature
    } else if (r < th[5]) {
      outcome = BOSS_OUTCOME.crush
      lost = mitigated * CRIT_MULTIPLIER.crushing
      pre = raw * CRIT_MULTIPLIER.crushing
    } else {
      outcome = BOSS_OUTCOME.hit
      lost = mitigated
    }
    out[outcome]++
    if (this.swingTakenTrace !== null) this.swingTakenTrace(outcome, lost, pre)
    const blocked = outcome === BOSS_OUTCOME.block
    if (blocked) this.markBlockChargeAuras()
    // rage.md#implementation-notes item 4: the damage-taken rage first, then the procs (Shield Specialization).
    this.takeHit(lost, pre)
    this.fireProcs(TRIGGER.meleeTaken, -1)
    if (blocked) {
      this.fireProcs(TRIGGER.block, -1)
      this.useBlockCharges()
    } else if (outcome === BOSS_OUTCOME.crit) this.fireProcs(TRIGGER.critTaken, -1)
  }

  /** Notes each block-charged aura's generation before a blocked swing's procs can apply or refresh it. */
  private markBlockChargeAuras(): void {
    const list = this.blockChargeAuras
    for (let i = 0; i < list.length; i++) this.blockChargeGen[i] = this.auraGen[list[i]]
  }

  /**
   * A block uses a charge of each aura blocks end (Holy Shield, Redoubt), after the block's procs,
   * so the last charge's block still fires Holy Shield's damage (combat-tables §8, "The engine").
   * Only an aura up before this swing's procs pays: one they applied or refreshed (Redoubt from the
   * very swing it blocks) has a new generation and keeps every charge.
   */
  private useBlockCharges(): void {
    const list = this.blockChargeAuras
    for (let i = 0; i < list.length; i++) {
      const a = list[i]
      if (this.auraActive[a] && this.auraGen[a] === this.blockChargeGen[i] && --this.auraBlockCharges[a] <= 0) this.removeAura(a)
    }
  }

  /** The tank parried: parry haste on its own main-hand swing (damage-and-timing §3.4; encounter §5's setting). */
  private onPlayerParried(): void {
    // During a cast that stops swings there is no pending swing to hasten.
    if (!this.hasWeapon[HAND.main] || this.swingsStopped || !this.plan.fight.bossSwing?.parryHaste) return
    const remaining = this.nextSwingAt[HAND.main] - this.now
    const after = Math.round(parryHasteRemaining(remaining, this.swingMs[HAND.main]))
    if (after !== remaining) this.scheduleSwing(HAND.main, this.now + after)
  }

  /**
   * The boss → player table against the current stats (combat-tables §8), and the armor factor
   * against the boss's level (damage-and-timing §1.1): at the start of a fight and whenever an aura
   * changes the stats.
   */
  private updateBossTable(d: DerivedStats): void {
    const plan = this.plan
    const f = plan.fight
    const tank = this.defenderIn
    tank.playerLevel = plan.playerLevel
    tank.bossLevel = f.targetLevel
    tank.defense = d.defense
    tank.dodge = d.dodge
    tank.parry = d.parry
    tank.block = d.block
    tank.canCrush = f.bossSwing!.canCrush
    tank.front = f.bossSwing!.front
    thresholds(bossSlices(tank, this.slices), this.thrBoss)
    this.bossArmorFactor = 1 - armorReduction(d.armor, f.targetLevel, plan.profile)
  }

  /** The defensive aura deltas on the scratch stat block, before a re-derive (combat-tables §8). */
  private defensiveScratch(s: StatBlock, base: StatBlock): void {
    s.dodge = base.dodge + this.dynDodge
    s.parry = base.parry + this.dynParry
    s.block = base.block + this.dynBlock
    s.blockValue = base.blockValue + this.dynBlockValue
    s.bonusArmor = base.bonusArmor + this.dynArmor
    s.itemArmorPct = base.itemArmorPct + this.dynItemArmorPct
  }

  /** Aura a's defensive mods, `deltaStacks` stacks of them, added to the deltas. */
  private defensiveDelta(a: number, deltaStacks: number): void {
    this.dynDodge += this.aDodge[a] * deltaStacks
    this.dynParry += this.aParry[a] * deltaStacks
    this.dynBlock += this.aBlock[a] * deltaStacks
    this.dynBlockValue += this.aBlockValue[a] * deltaStacks
    this.dynArmor += this.aArmor[a] * deltaStacks
    // An item-armor % (Enrage −16, druid.md §4.5), as a fraction like the stat block's.
    this.dynItemArmorPct += (this.aItemArmorPct[a] * deltaStacks) / 100
  }

  /**
   * Damage-taken aura mods multiply (Iron Creed −10%), recomputed from the active ones, so no drift.
   * Each aura's factor is floored at 0 (combat-tables §8, "What a landed swing costs"): stacks past
   * −100% make a swing cost nothing, never heal.
   */
  private recomputeTakenMult(): void {
    let m = 1
    for (let i = 0; i < this.auraActive.length; i++) {
      if (this.auraActive[i] && this.aTaken[i]) m *= Math.max(0, 1 + (this.aTaken[i] * this.auraStacks[i]) / 100)
    }
    this.auraTakenMult = m
  }

  /** A fight starts with no defensive auras and no damage taken. */
  private resetDefense(): void {
    this.dynDodge = 0
    this.dynParry = 0
    this.dynBlock = 0
    this.dynBlockValue = 0
    this.dynArmor = 0
    this.auraTakenMult = 1
    this.auraBlockCharges.fill(0)
    this.fightDamageTaken = 0
    this.dynBossSlow = 0
    this.dynBossDamage = 0
    this.dynItemArmorPct = 0
  }

  /**
   * The rotation's debuffs on the boss's swings (warrior.md §7 "Debuffs on the boss"): the strongest
   * active slow, and the attack power the active ones add, as damage per swing (encounter §5: AP ÷ 14
   * × the unslowed swing speed). Recomputed from the active auras, so no drift.
   */
  private recomputeBossDebuffs(): void {
    const boss = this.plan.fight.bossSwing
    if (!boss) return
    let slow = 0
    let ap = 0
    for (let i = 0; i < this.auraActive.length; i++) {
      if (!this.auraActive[i] || !this.aBossDebuff[i]) continue
      slow = Math.max(slow, this.aBossSlow[i] / 100)
      ap += this.aBossAp[i] * this.auraStacks[i]
    }
    this.dynBossSlow = slow
    this.dynBossDamage = (ap / 14) * boss.unslowedSec
    this.updateBossSpeed()
  }

  /**
   * The boss's time between swings: the plan's (the Buffs tab's slow in it), or a stronger slow the
   * rotation keeps on it, as base × (1 + slow) (damage-and-timing §3.2). Like the player's haste it
   * applies from the next swing: the one under way isn't rescaled [?] (§3.1).
   */
  private updateBossSpeed(): void {
    const boss = this.plan.fight.bossSwing
    if (!boss) return
    const sec = this.dynBossSlow > boss.slow ? slowedSwingSec(boss.unslowedSec, this.dynBossSlow) : boss.speedSec
    this.bossSwingMs = Math.round(sec * 1000)
  }

  /**
   * A hit that landed on the player (missed, dodged and parried ones never get here): rage from
   * damage taken, then, if it cost health, the damage-taken procs (rage.md#rage-from-damage-taken,
   * #implementation-notes). `pre` is its size before armor, block, absorbs and damage-taken
   * modifiers. The inlined `damageTakenRage` (core/formulas.ts): `forever` reads `pre`, so a
   * blocked hit that costs nothing still gives its full rage; the other models read health lost.
   */
  private takeHit(healthLost: number, pre: number): void {
    const plan = this.plan
    this.fightDamageTaken += healthLost
    // rage.md#rage-from-damage-taken, #bear-druid-rage: rage users only: the plan's switch (warriors,
    // a druid that can be in Bear Form), and a druid's current form (bear). The procs fire either way.
    if (!plan.rage.fromDamageTaken || !this.gainsRage) {
      if (healthLost > 0) this.onDamageTaken()
      return
    }
    let rage = 0
    switch (plan.rage.damageTakenModel) {
      case 'forever':
        if (pre > 0 && plan.rage.maxHealth > 0) rage = (10 * pre) / plan.rage.maxHealth
        break
      case 'foreverFlat':
        if (healthLost > 0) rage = (1.5 * healthLost) / this.rageConv
        break
      case 'foreverHealthLost':
        if (healthLost > 0 && plan.rage.maxHealth > 0) rage = (10 * healthLost) / plan.rage.maxHealth
        break
      case 'classic':
        if (healthLost > 0) rage = (2.5 * healthLost) / this.rageConv
        break
    }
    this.gainRageFraction(rage * 10)
    if (healthLost > 0) this.onDamageTaken()
  }

  /**
   * A hit that cost health: the damage-taken procs, then a charge of each aura such hits use up,
   * so a proc that needs the aura still sees it (Seal of Fury's absorb and Improved Seal of Fury's
   * mana, paladin.md#protection-tree). As with blocks (`useBlockCharges`), only an aura up before
   * these procs pays: one they applied or refreshed has a new generation and keeps its charges.
   */
  private onDamageTaken(): void {
    const list = this.takenChargeAuras
    for (let i = 0; i < list.length; i++) this.takenChargeGen[i] = this.auraGen[list[i]]
    this.fireProcs(TRIGGER.damageTaken, -1)
    for (let i = 0; i < list.length; i++) {
      const a = list[i]
      if (this.auraActive[a] && this.auraGen[a] === this.takenChargeGen[i] && --this.auraTakenCharges[a] <= 0) this.removeAura(a)
    }
  }
}
