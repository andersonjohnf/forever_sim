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
// melee spells, on-next-swing queues, off-hand strikes, casts that buff the warrior or grant rage,
// stance limits, the execute phase, time-left conditions, buff upkeep and the pre-pull
// (docs/architecture.md#engine-design-m1).
import {
  bossSlices,
  meleeChances,
  specialSlices,
  spellMiss,
  thresholds,
  whiteSlices,
  averageResist,
} from '../core/attack-table'
import { armorReduction, executePhaseStart, parryHasteRemaining, rageConversion } from '../core/formulas'
import { EventQueue } from '../core/queue'
import { Rng, STREAM } from '../core/rng'
import { ACTION, COND, HAND, TRIGGER, TRIGGER_COUNT, type Plan } from '../plan/types'
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

/** Ability kinds (AbilityPlan.kind). */
const KIND_STRIKE = 0
const KIND_MELEE_SPELL = 1
const KIND_ON_NEXT_SWING = 2
const KIND_CAST = 3
const KIND_CODE = { weaponStrike: KIND_STRIKE, meleeSpell: KIND_MELEE_SPELL, onNextSwing: KIND_ON_NEXT_SWING, cast: KIND_CAST } as const

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

/** Level-based resistance of a +3 boss for magic procs [?] (combat-tables §9). */
const BOSS_LEVEL_RESISTANCE_PER_LEVEL = 8

/** Threat per rage from a spell effect (threat.md#threat-from-healing-power-gains-and-buffs). */
const THREAT_PER_RAGE_TENTH = 0.5

export class Sim {
  readonly plan: Plan
  /** Totals per source × field, summed over every fight run. */
  readonly counters: Float64Array
  /** Last fight's results. */
  fightDamage = 0
  fightThreat = 0
  fightMs = 0
  /** Diagnostics summed over every fight run (tests and tuning). */
  totalRageGainedTenths = 0
  totalRageWastedTenths = 0
  /** Test hook: called for every white swing (source row, hand, time) and bleed tick (source, −1, time). */
  trace: ((source: number, hand: number, time: number) => void) | null = null
  /** Test hook: called when an ability is used, before its cost is paid (ability index, time, rage in tenths). */
  castTrace: ((ability: number, time: number, rageTenths: number) => void) | null = null
  /** Test hook: every damage event (source row, damage). */
  damageTrace: ((source: number, damage: number) => void) | null = null
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
  /** Normalized white rage per landed swing, in tenths (profile `normalized`). */
  private readonly wNormRageTenths: Int32Array
  private readonly wRageMult: Float64Array
  private readonly wNormSpeed: Float64Array
  private readonly dualWield: boolean
  private readonly normalizedRage: boolean
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
  private readonly pBleedSlot: Int32Array
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
  private readonly aHaste: Float64Array
  private readonly aDamage: Float64Array
  private readonly aStatful: Uint8Array
  private readonly chargeAuras: Int32Array
  /** Crits dealt that end an aura (Weakness Analyzer), and the auras that have them. */
  private readonly aCritCharges: Int32Array
  private readonly critChargeAuras: Int32Array
  /**
   * Lines that refresh an aura (COND.abilityAuraRefresh, Battle Shout's upkeep, warrior.md §5.2
   * row 1): aura a's are watchLine[watchStart[a] … watchStart[a + 1] − 1], each with its lead (ms
   * before the aura's end). Resolved into the line's time window whenever the aura starts or ends.
   */
  private readonly watchStart: Int32Array
  private readonly watchLine: Int32Array
  private readonly watchLead: Float64Array

  // Abilities and the rotation, flattened.
  private readonly abKind: Int32Array
  private readonly abCost: Int32Array
  private readonly abCd: Float64Array
  private readonly abGcd: Float64Array
  private readonly abWeaponPct: Float64Array
  private readonly abNormalized: Uint8Array
  private readonly abFlat: Float64Array
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
  /** Uses per fight (0 = no limit), and this fight's uses so far. */
  private readonly abUsesPerFight: Int32Array
  private readonly abUses: Int32Array
  /** The pre-pull casts (ability, time < 0) and the opener's rage (warrior.md §5.2 row 0). */
  private readonly preAbility: Int32Array
  private readonly preAt: Float64Array
  private readonly preChargeTenths: number
  private readonly preKeepTenths: number
  private readonly rotAbility: Int32Array
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
  private readonly entryBaseFrom: Float64Array
  private readonly entryFrom: Float64Array
  private readonly entryTo: Float64Array
  /**
   * The distinct thresholds of `timeLeftAtMost` conditions (ms): each fight wakes the rotation at
   * `fightEnd − x`, when that condition becomes true.
   */
  private readonly wakeTimeLeft: Float64Array
  /** Some line waits for rage ≤ x, so spending rage is a decision point. */
  private readonly hasMaxRage: boolean
  private readonly hasRotation: boolean
  private readonly hasAbilities: boolean

  // Per-fight state.
  private now = 0
  private fightEnd = 0
  private rage = 0
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
  private readonly auraGen: Int32Array
  private readonly bleedTicksLeft: Int32Array
  private readonly bleedGen: Int32Array
  private readonly bleedProc: Int32Array
  private gcdEnd = 0
  private readonly abReadyAt: Float64Array
  /** `cast` rage ticks still to come, and their generation (a recast restarts them). */
  private readonly abTicksLeft: Int32Array
  private readonly abTickGen: Int32Array
  /** The STANCE bit the warrior is in (plan.stance; no stance dancing yet). */
  private stance = 0
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
  private auraHasteMult = 1

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
  private readonly armorFactor = new Float64Array(2)
  private physMult = 1
  private magicMult = 1
  private hasteMult = 1
  private blockValue = 0
  private spellMissPct = 0

  // Extra-attack FIFO and the chain mask of the attack being resolved.
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
    this.wNormRageTenths = new Int32Array(2)
    this.wRageMult = new Float64Array(2)
    this.wNormSpeed = new Float64Array(2)
    const rage = plan.profile.rage
    for (let h = 0; h < 2; h++) {
      const weapon = w[h]
      if (!weapon) continue
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
      // docs/mechanics/rage.md#forever-normalized-rage-per-swing-: k × base speed (× off-hand base), floored to tenths
      const k = weapon.twoHand ? rage.normalizedTwoHand : rage.normalizedOneHand
      const offBase = h === HAND.off ? rage.offHandBase : 1
      this.wNormRageTenths[h] = Math.floor(k * weapon.speedSec * offBase * weapon.rageMult * 10 + 1e-9)
    }
    this.dualWield = w[HAND.main] !== null && w[HAND.off] !== null
    this.normalizedRage = rage.white === 'normalized'
    this.avoidedRageShare = rage.avoidedWhiteShare
    this.rageConv = rageConversion(plan.playerLevel)
    this.staticPhysMult = plan.damageMult * plan.physicalMult
    this.staticMagicMult = plan.damageMult
    this.bossLevelResist = BOSS_LEVEL_RESISTANCE_PER_LEVEL * Math.max(0, plan.fight.targetLevel - plan.playerLevel)
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
    this.pBleedSlot = new Int32Array(np).fill(-1)
    this.procReadyAt = new Float64Array(np)
    let bleeds = 0
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
      if (p.action === ACTION.weaponBleed) this.pBleedSlot[i] = bleeds++
    }
    this.bleedTicksLeft = new Int32Array(bleeds)
    this.bleedGen = new Int32Array(bleeds)
    this.bleedProc = new Int32Array(bleeds)
    for (let i = 0; i < np; i++) if (this.pBleedSlot[i] >= 0) this.bleedProc[this.pBleedSlot[i]] = i
    this.triggerLists = []
    for (let t = 0; t < TRIGGER_COUNT; t++) this.triggerLists.push(Int32Array.from(plan.triggers[t] ?? []))

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
    this.aHaste = new Float64Array(na)
    this.aDamage = new Float64Array(na)
    this.aStatful = new Uint8Array(na)
    this.aCritCharges = new Int32Array(na)
    this.auraActive = new Uint8Array(na)
    this.auraStacks = new Int32Array(na)
    this.auraCharges = new Int32Array(na)
    this.auraCritCharges = new Int32Array(na)
    this.auraGen = new Int32Array(na)
    const chargeAuras: number[] = []
    const critChargeAuras: number[] = []
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
      this.aHaste[i] = a.haste
      this.aDamage[i] = a.damage
      this.aStatful[i] = a.str || a.agi || a.ap || a.apPct || a.crit ? 1 : 0
      this.aCritCharges[i] = a.critCharges
      if (a.whiteSwingCharges > 0) chargeAuras.push(i)
      if (a.critCharges > 0) critChargeAuras.push(i)
    }
    this.chargeAuras = Int32Array.from(chargeAuras)
    this.critChargeAuras = Int32Array.from(critChargeAuras)

    const abilities = plan.abilities
    const nb = abilities.length
    this.abKind = new Int32Array(nb)
    this.abCost = new Int32Array(nb)
    this.abCd = new Float64Array(nb)
    this.abGcd = new Float64Array(nb)
    this.abWeaponPct = new Float64Array(nb)
    this.abNormalized = new Uint8Array(nb)
    this.abFlat = new Float64Array(nb)
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
    this.abUsesPerFight = new Int32Array(nb)
    this.abUses = new Int32Array(nb)
    this.abReadyAt = new Float64Array(nb)
    this.abTicksLeft = new Int32Array(nb)
    this.abTickGen = new Int32Array(nb)
    for (let i = 0; i < nb; i++) {
      const a = abilities[i]
      this.abKind[i] = KIND_CODE[a.kind]
      this.abCost[i] = a.costTenths
      this.abCd[i] = a.cooldownMs
      this.abGcd[i] = a.gcdMs
      this.abWeaponPct[i] = a.weaponPercent
      this.abNormalized[i] = a.normalized ? 1 : 0
      this.abFlat[i] = a.flatDamage
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
      this.abUsesPerFight[i] = a.usesPerFight
    }
    const prepull = plan.prepull
    this.preAbility = Int32Array.from(prepull.casts.map((c) => c.ability))
    this.preAt = Float64Array.from(prepull.casts.map((c) => c.atMs))
    this.preChargeTenths = prepull.chargeTenths
    this.preKeepTenths = prepull.keepTenths
    const rotation = plan.rotation
    this.rotAbility = new Int32Array(rotation.length)
    this.condStart = new Int32Array(rotation.length + 1)
    // Phase, time-left and aura-refresh conditions are resolved up front, into the per-phase lists
    // and a time window per line, so a walk never evaluates them.
    const resolved = (c: { code: number }) =>
      c.code === COND.executePhase || c.code === COND.timeLeftAtMost || c.code === COND.timeLeftAtLeast || c.code === COND.abilityAuraRefresh
    const nc = rotation.reduce((n, e) => n + e.conditions.filter((c) => !resolved(c)).length, 0)
    this.condCode = new Int32Array(nc)
    this.condA = new Float64Array(nc)
    this.condB = new Float64Array(nc)
    this.entryLeftAtMost = new Float64Array(rotation.length).fill(Infinity)
    this.entryLeftAtLeast = new Float64Array(rotation.length).fill(-Infinity)
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
      this.abUnqueueBelow[entry.ability] = entry.unqueueBelowTenths
      this.condStart[e] = k
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
    this.hasMaxRage = this.condCode.includes(COND.maxRage)
    this.hasRotation = rotation.length > 0
    this.hasAbilities = nb > 0
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

    // docs/mechanics/encounter.md#implementation-notes: L_i = round(L × (1 + v × (2u − 1)))
    const f = plan.fight
    const u = this.rngFight.next()
    this.fightEnd = Math.round(f.durationMs * (1 + f.variation * (2 * u - 1)))
    this.reset()
    // Time left ≤ x ⇔ now ≥ fightEnd − x; time left ≥ x ⇔ now ≤ fightEnd − x (warrior.md §5.2 rows 2–4).
    for (let e = 0; e < this.entryFrom.length; e++) {
      this.entryBaseFrom[e] = this.fightEnd - this.entryLeftAtMost[e]
      this.entryFrom[e] = this.entryBaseFrom[e]
      this.entryTo[e] = this.fightEnd - this.entryLeftAtLeast[e]
    }
    if (this.preAbility.length > 0 || this.preChargeTenths > 0) this.prepull()

    const q = this.q
    // docs/mechanics/encounter.md#implementation-notes: t_exec = floor(L_i × (1 − executePct/100))
    this.executeAtMs = executePhaseStart(this.fightEnd, f.executePct)
    if (this.hasRotation) {
      q.push(0, EV_ACT, 0, 0)
      if (this.executeAtMs < this.fightEnd) q.push(this.executeAtMs, EV_EXECUTE, 0, 0)
      // "Time left ≤ x" becomes true at fightEnd − x: wake the rotation then.
      const wakes = this.wakeTimeLeft
      for (let i = 0; i < wakes.length; i++) if (this.fightEnd - wakes[i] > 0) q.push(this.fightEnd - wakes[i], EV_ACT, 0, 0)
    }
    // docs/mechanics/damage-and-timing.md#31-haste: main hand at 0, off hand at half its swing [?]
    if (this.hasWeapon[HAND.main]) this.scheduleSwing(HAND.main, 0)
    if (this.dualWield) this.scheduleSwing(HAND.off, Math.round(0.5 * this.swingMs[HAND.off]))
    if (f.bossSwing) {
      this.bossSwingMs = Math.round(f.bossSwing.speedSec * 1000)
      this.bossNextAt = 0
      q.push(0, EV_BOSS, 0, this.bossGen)
    }
    if (f.damageTakenPerHit > 0) q.push(f.damageTakenIntervalMs, EV_DAMAGE_TAKEN, 0, 0)
    const periodic = plan.periodicRage
    for (let i = 0; i < periodic.length; i++) q.push(periodic[i].periodMs, EV_PERIODIC_RAGE, i, 0)

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
          this.takeDamage(f.damageTakenPerHit, f.damageTakenPerHit)
          if (this.exCount > 0) this.drainExtraAttacks()
          q.push(t + f.damageTakenIntervalMs, EV_DAMAGE_TAKEN, 0, 0)
          break
        case EV_ACT:
          this.actPending = true
          break
        case EV_CAST_RAGE:
          if (q.gen === this.abTickGen[data]) this.onCastRageTick(data)
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
    }
  }

  private reset(): void {
    this.q.clear()
    this.now = 0
    this.rage = 0
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
    for (let i = 0; i < this.bleedTicksLeft.length; i++) {
      this.bleedTicksLeft[i] = 0
      this.bleedGen[i]++
    }
    this.dynStr = 0
    this.dynAgi = 0
    this.dynAp = 0
    this.dynApMult = 1
    this.dynCrit = 0
    this.auraHasteMult = 1
    this.exHead = 0
    this.exCount = 0
    this.chainMask = 0
    this.gcdEnd = 0
    this.abReadyAt.fill(0)
    this.abUses.fill(0)
    this.abTicksLeft.fill(0)
    for (let i = 0; i < this.abTickGen.length; i++) this.abTickGen[i]++
    this.queued = -1
    this.actPending = false
    this.stance = this.plan.stance
    this.rotList = this.rotNormal
    this.rotOffList = this.offGcdNormal
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
      if (this.castTrace !== null) this.castTrace(a, at, this.rage)
      this.counters[this.abSource[a] * FIELD_COUNT + FIELD.casts]++
      if (!this.countUse(a) && this.abCd[a] > 0) {
        this.abReadyAt[a] = at + this.abCd[a]
        if (this.abReadyAt[a] > 0) this.q.push(this.abReadyAt[a], EV_ACT, 0, 0)
      }
      const aura = this.abAura[a]
      if (aura >= 0 && at + this.aDuration[aura] > 0) this.startAura(aura, at + this.aDuration[aura])
      this.gainRage(this.castRageTenths(a), -1)
      const ticks = this.abTicks[a]
      for (let k = 1; k <= ticks; k++) {
        const t = at + k * this.abTickMs[a]
        if (t < 0) {
          this.gainRage(this.abTickRage[a], -1)
          continue
        }
        this.abTicksLeft[a] = ticks - k + 1
        this.q.push(t, EV_CAST_RAGE, a, ++this.abTickGen[a])
        break
      }
    }
    if (this.preChargeTenths > 0) {
      this.gainRage(this.preChargeTenths, -1)
      // warrior.md §2.1: the swap to the fighting stance keeps at most 10 + 3 × Improved Tactical Mastery.
      if (this.preKeepTenths >= 0 && this.rage > this.preKeepTenths) this.rage = this.preKeepTenths
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
    s.crit = base.crit + this.dynCrit
    const d = deriveStats(s, this.deriveOptions, this.derived)
    this.ap = d.attackPower
    this.blockValue = d.blockValue
    this.spellMissPct = spellMiss(plan.profile, plan.playerLevel, plan.fight.targetLevel, d.spellHit)
    const f = plan.fight
    for (let h = 0; h < 2; h++) {
      if (!this.hasWeapon[h]) continue
      const sheetCrit = d.crit + this.wCritBonus[h]
      this.critPct[h] = sheetCrit
      // docs/mechanics/combat-tables.md#2-melee-attack-table-white-swings
      const inputs = {
        attackerLevel: plan.playerLevel,
        targetLevel: f.targetLevel,
        skill: this.wSkill[h],
        hit: d.hit + this.wHitBonus[h],
        sheetCrit,
        auraCrit: d.auraCrit + this.wCritBonus[h],
        expertise: d.expertise,
        front: f.front,
        canDodge: f.bossCanDodge,
        canParry: f.bossCanParry,
        canBlock: f.bossCanBlock,
      }
      thresholds(whiteSlices(meleeChances(plan.profile, inputs, true, this.dualWield)), this.thrWhite.subarray(6 * h, 6 * h + 6))
      if (this.hasAbilities) {
        // docs/mechanics/combat-tables.md#5-dual-wield-and-on-next-swing-queues: dwPenalty = dualWielding && !queue.active
        if (h === HAND.off && this.dualWield) thresholds(whiteSlices(meleeChances(plan.profile, inputs, true, false)), this.thrOffQueued)
        // docs/mechanics/combat-tables.md#3-special-yellow-attacks: no glancing, no dual-wield penalty
        const special = meleeChances(plan.profile, inputs, false, false)
        thresholds(specialSlices(special), this.thrSpecial.subarray(6 * h, 6 * h + 6))
        this.specCrit[h] = special.crit
      }
      // docs/mechanics/damage-and-timing.md#12-armor-reduction-debuffs-and-penetration: flat reductions, then % ignored
      let armor = f.targetArmor - d.armorPen
      if (armor > 0) armor *= 1 - this.wArmorPenPct[h]
      this.armorFactor[h] = 1 - armorReduction(armor, plan.playerLevel, plan.profile)
    }
    if (f.bossSwing) {
      // docs/mechanics/combat-tables.md#8-boss--player-tanks
      thresholds(
        bossSlices({
          playerLevel: plan.playerLevel,
          bossLevel: f.targetLevel,
          defense: d.defense,
          dodge: d.dodge,
          parry: d.parry,
          block: d.block,
          canCrush: f.bossSwing.canCrush,
        }),
        this.thrBoss,
      )
    }
    this.hasteMult = d.hasteMult * this.auraHasteMult
    this.updateSwingSpeeds()
  }

  /** Damage and haste multipliers from auras (multiplicative, damage-and-timing §2.4 and §3.1). */
  private recomputeMultipliers(): void {
    let haste = 1
    let damage = 1
    for (let i = 0; i < this.auraActive.length; i++) {
      if (!this.auraActive[i]) continue
      const stacks = this.auraStacks[i]
      if (this.aHaste[i]) haste *= 1 + (this.aHaste[i] * stacks) / 100
      if (this.aDamage[i]) damage *= 1 + (this.aDamage[i] * stacks) / 100
    }
    this.auraHasteMult = haste
    this.physMult = this.staticPhysMult * damage
    this.magicMult = this.staticMagicMult
    this.hasteMult = this.derived.hasteMult * haste
    this.updateSwingSpeeds()
  }

  /** New swing speeds apply from the next swing; the running timer isn't rescaled [?] (damage-and-timing §3.1). */
  private updateSwingSpeeds(): void {
    for (let h = 0; h < 2; h++) {
      if (this.hasWeapon[h]) this.swingMs[h] = Math.round((this.wSpeedSec[h] * 1000) / this.hasteMult)
    }
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
      if (this.rage >= this.abCost[a]) {
        if (this.castTrace !== null) this.castTrace(a, this.now, this.rage)
        this.spendRage(a)
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
      if (this.auraActive[a] && --this.auraCharges[a] <= 0) this.removeAura(a)
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
        this.gainRage(this.whiteDamageRageTenths(hand, this.avoidedRageShare * wouldBe), -1)
      }
      if (!dodged) this.onBossParried()
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
    if (this.normalizedRage) this.gainRage(this.wNormRageTenths[hand], -1)
    else this.gainRage(this.whiteDamageRageTenths(hand, damage), -1)
    this.fireProcs(TRIGGER.swingLanded, hand)
    this.fireProcs(TRIGGER.whiteLanded, hand)
    this.fireProcs(TRIGGER.meleeLanded, hand)
    if (crit) this.onCrit(hand)
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

  /** Classic Era white-hit rage, 7.5 × damage / c, × this hand's multiplier (rage.md). */
  private whiteDamageRageTenths(hand: number, damage: number): number {
    const rage = ((7.5 * damage) / this.rageConv) * this.wRageMult[hand]
    return Math.floor(rage * 10 + 1e-9)
  }

  private drainExtraAttacks(): void {
    let chain = 0
    while (this.exCount > 0 && chain < MAX_CHAIN) {
      const i = this.exHead
      this.exHead = (this.exHead + 1) % EXTRA_QUEUE
      this.exCount--
      this.chainMask = this.exMask[i]
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
    this.addDamage(source, damage, damage * this.plan.threatMult)
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
   * usable now (off cooldown, rage, GCD, stance, execute phase) and whose conditions hold. A GCD
   * ability blocks the later GCD entries through the GCD it starts; off-GCD entries (the Heroic
   * Strike queue) are still checked after it.
   */
  private act(): void {
    this.actPending = false
    const now = this.now
    // While the GCD runs only off-GCD entries can be used; skipping the others changes nothing.
    const gcdBusy = this.gcdEnd > now
    // The current phase's list: lines that can't apply in it (and Execute outside it) aren't in it.
    const list = gcdBusy ? this.rotOffList : this.rotList
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      // The line's time-left conditions, as this fight's window (warrior.md §5.2 rows 2–4).
      if (now < this.entryFrom[e] || now > this.entryTo[e]) continue
      const a = this.rotAbility[e]
      if (this.abReadyAt[a] > now || this.rage < this.abCost[a]) continue
      // warrior.md §3.1 "Stance": only in the stances it's usable in.
      if ((this.abStances[a] & this.stance) === 0) continue
      if (this.abKind[a] === KIND_ON_NEXT_SWING) {
        if (this.queued >= 0 || !this.hasWeapon[HAND.main]) continue
      } else {
        if (this.abGcd[a] > 0 && this.gcdEnd > now) continue
        if (this.abWeaponPct[a] > 0 && !this.hasWeapon[HAND.main]) continue
      }
      if (!this.conditionsHold(e)) continue
      this.use(a)
    }
  }

  private conditionsHold(e: number): boolean {
    const now = this.now
    for (let k = this.condStart[e]; k < this.condStart[e + 1]; k++) {
      const a = this.condA[k]
      const b = this.condB[k]
      switch (this.condCode[k]) {
        case COND.minRage:
          if (this.rage < a) return false
          break
        case COND.cooldownAtLeast:
          if (this.abReadyAt[a] - now < b) return false
          break
        case COND.gcdSafe:
          // docs/classes/warrior.md#51-conventions-for-rotation-settings: each has ≥ one GCD of cooldown left
          for (let i = 0, mask = a; mask !== 0; i++, mask >>>= 1) {
            if (mask & 1 && this.abReadyAt[i] - now < b) return false
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
    if (this.castTrace !== null) this.castTrace(a, this.now, this.rage)
    this.spendRage(a)
    const gcd = this.abGcd[a]
    if (gcd > 0) {
      this.gcdEnd = this.now + gcd
      this.q.push(this.gcdEnd, EV_ACT, 0, 0)
    }
    const cd = this.abCd[a]
    if (!this.countUse(a) && cd > 0) {
      this.abReadyAt[a] = this.now + cd
      this.q.push(this.abReadyAt[a], EV_ACT, 0, 0)
    }
    if (this.abKind[a] === KIND_CAST) {
      this.cast(a)
      return
    }
    this.chainMask = 0
    this.special(a, HAND.main, 0)
    // Raging Blows: Whirlwind also strikes with the off hand (warrior.md §3.1) [?].
    if (this.abOffSource[a] >= 0 && this.hasWeapon[HAND.off]) this.special(a, HAND.off, 0)
    if (this.exCount > 0) this.drainExtraAttacks()
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
    const source = this.abSource[a]
    this.counters[source * FIELD_COUNT + FIELD.casts]++
    if (this.abAura[a] >= 0) this.applyAura(this.abAura[a])
    this.gainRage(this.castRageTenths(a), source)
    if (this.abTicks[a] > 0) {
      // A recast restarts the ticks (none of the abilities recasts before they end).
      this.abTicksLeft[a] = this.abTicks[a]
      this.q.push(this.now + this.abTickMs[a], EV_CAST_RAGE, a, ++this.abTickGen[a])
    }
  }

  private onCastRageTick(a: number): void {
    this.gainRage(this.abTickRage[a], this.abSource[a])
    if (--this.abTicksLeft[a] > 0) this.q.push(this.now + this.abTickMs[a], EV_CAST_RAGE, a, this.abTickGen[a])
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
    if (r < th[o + 2]) {
      if (r < th[o]) c[row + FIELD.misses]++
      else if (r < th[o + 1]) c[row + FIELD.dodges]++
      else {
        c[row + FIELD.parries]++
        this.onBossParried()
      }
      if (main) {
        // docs/mechanics/rage.md#rage-refunds-on-avoided-abilities: no threat, not an energize.
        // Execute refunds nothing, so a miss loses only its cost (warrior.md §3.1 "Execute details").
        const refund = Math.floor(this.abRefund[a] * this.abCost[a] + 1e-9)
        this.rage = Math.min(this.maxRage, this.rage + refund)
        this.actPending = this.hasRotation
      }
      return
    }
    const blocked = r < th[o + 4]
    const critChance = this.specCrit[hand] + this.abBonusCrit[a]
    const crit =
      this.abKind[a] === KIND_MELEE_SPELL
        ? this.rngTable.roll100() < critChance // roll 2, not truncated by roll 1
        : !blocked && r < Math.min(100, th[o + 4] + Math.max(0, critChance))
    let damage = this.abilityDamage(a, hand, bonusAp)
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
      // warrior.md §3.1 "Execute details": a landed Execute (a block lands too) spends all the rage.
      this.rage = 0
      this.afterRageSpent()
      this.actPending = this.hasRotation
    }
    // docs/mechanics/threat.md#base-rule-and-how-modifiers-stack: (dmg × mult + bonus) × global
    this.addDamage(source, damage, (damage * this.abThreatMult[a] + this.abThreatBonus[a]) * this.plan.threatMult)
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
    if (this.abWeaponPct[a] > 0) {
      const speed = this.abNormalized[a] ? this.wNormSpeed[hand] : this.wSpeedSec[hand]
      const roll = this.rngDamage.uniform(this.wMin[hand], this.wMax[hand])
      base = (roll + this.wFlat[hand] + (ap / 14) * speed + this.abFlat[a]) * this.abWeaponPct[a] * this.wHandMult[hand]
    } else {
      base = this.abFlat[a] + this.abApCoef[a] * ap + (this.abPerExtraRage[a] * this.rage) / 10
    }
    return base * this.physMult * this.armorFactor[hand]
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
    const list = this.critChargeAuras
    for (let i = 0; i < list.length; i++) {
      const a = list[i]
      if (this.auraActive[a] && --this.auraCritCharges[a] <= 0) this.removeAura(a)
    }
  }

  /** Rolls every proc on this trigger (damage-and-timing §5). `hand` is −1 for non-attack triggers. */
  private fireProcs(trigger: number, hand: number): void {
    const list = this.triggerLists[trigger]
    for (let k = 0; k < list.length; k++) {
      const p = list[k]
      if (hand >= 0 && (this.pHands[p] & (1 << hand)) === 0) continue
      if (this.procReadyAt[p] > this.now) continue
      const chance = this.pChance[2 * p + (hand > 0 ? hand : 0)]
      if (chance < 1 && this.rngProc.next() >= chance) continue
      if (this.pIcd[p] > 0) this.procReadyAt[p] = this.now + this.pIcd[p]
      this.doAction(p)
    }
  }

  private doAction(p: number): void {
    switch (this.pAction[p]) {
      case ACTION.extraAttacks: {
        const bit = this.pChainBit[p]
        // A source can't proc from its own chain of extra attacks (damage-and-timing §5.4).
        if (this.chainMask & bit || !this.hasWeapon[HAND.main]) return
        const n = this.pAmount[p]
        for (let k = 0; k < n && this.exCount < EXTRA_QUEUE; k++) {
          const slot = (this.exHead + this.exCount) % EXTRA_QUEUE
          this.exSource[slot] = this.pSource[p]
          this.exBonusAp[slot] = this.pA[p]
          this.exMask[slot] = this.chainMask | bit
          this.exCount++
        }
        return
      }
      case ACTION.aura:
        this.applyAura(this.pAmount[p])
        return
      case ACTION.rage:
        this.gainRage(this.pAmount[p], this.pSource[p])
        return
      case ACTION.spellDamage:
        this.spellProc(p)
        return
      case ACTION.weaponBleed: {
        const slot = this.pBleedSlot[p]
        // Refresh restarts the ticks; old damage doesn't roll over (warrior.md §2.5).
        this.bleedTicksLeft[slot] = this.pAmount[p]
        this.q.push(this.now + this.pB[p], EV_BLEED_TICK, slot, ++this.bleedGen[slot])
        this.counters[this.pSource[p] * FIELD_COUNT + FIELD.casts]++
        return
      }
    }
  }

  private applyAura(a: number): void {
    this.startAura(a, this.now + this.aDuration[a])
  }

  /** Puts aura a on the warrior (or refreshes it, adding a stack) until `end` (a pre-pull aura ends early). */
  private startAura(a: number, end: number): void {
    const wasActive = this.auraActive[a] === 1
    const oldStacks = this.auraStacks[a]
    const stacks = wasActive ? Math.min(oldStacks + 1, this.aMaxStacks[a]) : 1
    this.auraActive[a] = 1
    this.auraStacks[a] = stacks
    this.auraCharges[a] = this.aCharges[a]
    this.auraCritCharges[a] = this.aCritCharges[a]
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

  private removeAura(a: number): void {
    const stacks = this.auraStacks[a]
    this.auraActive[a] = 0
    this.auraStacks[a] = 0
    this.auraCharges[a] = 0
    this.auraCritCharges[a] = 0
    this.auraGen[a]++
    if (this.watchStart[a] !== this.watchStart[a + 1]) this.watchAura(a, Infinity)
    this.auraChanged(a, -stacks)
  }

  private auraChanged(a: number, deltaStacks: number): void {
    this.actPending = this.hasRotation
    if (this.aStatful[a]) {
      this.dynStr += this.aStr[a] * deltaStacks
      this.dynAgi += this.aAgi[a] * deltaStacks
      this.dynAp += this.aAp[a] * deltaStacks
      this.dynCrit += this.aCrit[a] * deltaStacks
      if (this.aApPct[a]) {
        // Attack power % auras multiply (character-stats step 4); recomputed from the active ones, so no drift.
        let m = 1
        for (let i = 0; i < this.auraActive.length; i++) {
          if (this.auraActive[i] && this.aApPct[i]) m *= 1 + (this.aApPct[i] * this.auraStacks[i]) / 100
        }
        this.dynApMult = m
      }
      this.recomputeStats()
    }
    if (this.aHaste[a] || this.aDamage[a]) this.recomputeMultipliers()
  }

  /** A magic proc: spell hit roll, average partial resist, no crit [?] (combat-tables §9). */
  private spellProc(p: number): void {
    const row = this.pSource[p] * FIELD_COUNT
    const c = this.counters
    c[row + FIELD.casts]++
    if (this.rngProc.roll100() < this.spellMissPct) {
      c[row + FIELD.misses]++
      return
    }
    const holy = this.pSchool[p] === 5
    const resist = holy ? 0 : averageResist(this.bossLevelResist, this.plan.playerLevel)
    const damage = this.rngDamage.uniform(this.pA[p], this.pB[p]) * (1 - resist) * this.magicMult
    c[row + FIELD.hits]++
    this.dealDamage(this.pSource[p], damage)
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
    if (--this.bleedTicksLeft[slot] > 0) this.q.push(this.now + this.pB[p], EV_BLEED_TICK, slot, this.bleedGen[slot])
  }

  // ------------------------------------------------------------------------------------------
  // Rage
  // ------------------------------------------------------------------------------------------

  /** Adds rage in tenths, capped. `source` ≥ 0 marks an energize: 5 threat per rage gained (threat.md). */
  private gainRage(tenths: number, source: number): void {
    if (tenths <= 0) return
    const gained = Math.min(tenths, this.maxRage - this.rage)
    this.rage += gained
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

  /** One boss swing on the tank (combat-tables §8, encounter §5). */
  private onBossSwing(): void {
    const boss = this.plan.fight.bossSwing!
    const rng = this.rngBoss
    const r = rng.roll100()
    const raw = rng.uniform(boss.minDamage, boss.maxDamage)
    const th = this.thrBoss
    this.bossNextAt = this.now + this.bossSwingMs
    this.q.push(this.bossNextAt, EV_BOSS, 0, ++this.bossGen)
    if (r < th[0]) return // miss
    if (r < th[2]) {
      this.fireProcs(TRIGGER.dodgeParry, -1)
      if (r >= th[1]) this.onPlayerParried()
      return
    }
    // docs/mechanics/damage-and-timing.md#26-order-of-operations-physical-direct-hit, boss → tank
    const mitigated = raw * (1 - armorReduction(this.plan.armor, this.plan.fight.targetLevel, this.plan.profile)) * this.plan.damageTakenMult
    let lost: number
    let preArmor = raw
    if (r < th[3]) {
      lost = Math.max(0, mitigated - this.blockValue)
      preArmor = mitigated > 0 ? raw * (lost / mitigated) : 0
      this.fireProcs(TRIGGER.block, -1)
    } else if (r < th[4]) {
      lost = mitigated * 2
      preArmor = raw * 2
    } else if (r < th[5]) {
      lost = mitigated * 1.5
      preArmor = raw * 1.5
    } else {
      lost = mitigated
    }
    this.takeDamage(lost, preArmor)
  }

  /** The tank parried: parry haste on its own main-hand swing (damage-and-timing §3.4). */
  private onPlayerParried(): void {
    if (!this.hasWeapon[HAND.main]) return
    const remaining = this.nextSwingAt[HAND.main] - this.now
    const after = Math.round(parryHasteRemaining(remaining, this.swingMs[HAND.main]))
    if (after !== remaining) this.scheduleSwing(HAND.main, this.now + after)
  }

  /** Health lost to an attack: rage from damage taken, then damage-taken procs (rage.md implementation notes). */
  private takeDamage(healthLost: number, preArmor: number): void {
    if (healthLost <= 0) return
    const plan = this.plan
    let rage: number
    switch (plan.rage.damageTakenModel) {
      case 'forever':
        rage = (1.5 * healthLost) / this.rageConv
        break
      case 'classic':
        rage = (2.5 * healthLost) / this.rageConv
        break
      case 'foreverHp':
        rage = plan.rage.maxHealth > 0 ? (10 * healthLost) / plan.rage.maxHealth : 0
        break
      case 'foreverHpPreArmor':
        rage = plan.rage.maxHealth > 0 ? (10 * preArmor) / plan.rage.maxHealth : 0
        break
    }
    this.gainRage(Math.floor(rage * 10 + 1e-9), -1)
    this.fireProcs(TRIGGER.damageTaken, -1)
  }
}
