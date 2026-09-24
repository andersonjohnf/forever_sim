// The effect model (docs/mechanics/buffs-debuffs-consumables.md#what-the-sim-needs).
//
// Buffs, debuffs, consumables, enchants, talents, racials, stances and item procs are all lists
// of these plain, serializable effects. The plan builder resolves them once per run against the
// setup (weapons, shield, stance, zone, creature type) into the stat block, damage and threat
// multipliers, target modifiers, and aura/proc definitions the engine runs. Nothing here is
// class-specific, so a new spec adds data, not engine branches.
import type { WeaponType } from '@/data/items/types'
import type { SpellDef } from '../plan/types'
import type { RulesProfile } from '../rules/profiles'
import type { CreatureType, FightConfig } from '../types'

/** Flat additive stats (fields of StatBlock). Percent stats are percentage points. */
export type FlatStat =
  | 'str'
  | 'agi'
  | 'sta'
  | 'int'
  | 'spi'
  | 'ap'
  /** Attack power per point of Agility (Cat Form's aura 598: 1, docs/classes/druid.md §2.2). */
  | 'apPerAgi'
  /** Attack power per point of Intellect (Mental Dexterity's aura 598: 1 at 3/3, docs/classes/shaman.md#talents). */
  | 'apPerInt'
  | 'crit'
  | 'critRating'
  | 'hit'
  | 'hitRating'
  | 'spellHit'
  | 'spellCrit'
  | 'hasteRating'
  | 'expertise'
  | 'expertiseRating'
  | 'armorPen'
  | 'itemArmor'
  | 'bonusArmor'
  | 'defense'
  | 'defenseRating'
  | 'dodge'
  | 'dodgeRating'
  | 'parry'
  | 'parryRating'
  | 'block'
  | 'blockRating'
  | 'blockValue'
  | 'health'
  | 'mana'
  /** Spell damage, all schools (paladin.md#conventions-used-below). */
  | 'spellDamage'
  | 'holySpellDamage'
  /** Spell damage from a % of Intellect (Champion of the Light). */
  | 'spellDamagePerIntPct'
  /** Mana per 5 s (character-stats.md#spirit-and-mana-regeneration). */
  | 'mp5'

/** Stats that % modifiers multiply (character-stats.md#derived-stat-pipeline, step 3 and 4). */
export type MultStat = 'str' | 'agi' | 'sta' | 'int' | 'spi' | 'allStats' | 'ap' | 'health' | 'blockValue'

/** Effects that depend on the rule profile (Classic Era spell values), resolved per run. */
export type EffectList = Effect[] | ((profile: RulesProfile) => Effect[])

/**
 * A catalogue entry's Classic Era values where they differ from Forever's (its own `summary` and
 * `effects`), from the Classic Era client (docs/mechanics/buffs-debuffs-consumables.md#classic-era-values).
 * A profile whose `catalogue.column` is `classicEra` reads them instead. `effects` is left out
 * where the entry's own effects already read the profile (`EffectList` as a function).
 */
export interface ClassicEraValues {
  summary: string
  effects?: Effect[]
}

/** A buff, consumable or enchant: its Forever values, and its Classic Era ones where they differ. */
export interface CatalogueEntry {
  summary: string
  effects: EffectList
  classicEra?: ClassicEraValues
}

/** The effects a catalogue entry has under a rule profile (buffs doc, Classic Era values). */
export function catalogueEffects(entry: CatalogueEntry, profile: RulesProfile): Effect[] {
  const list = (profile.catalogue.column === 'classicEra' && entry.classicEra?.effects) || entry.effects
  return typeof list === 'function' ? list(profile) : list
}

/** The one-line summary a catalogue entry shows under a rule profile. */
export function catalogueSummary(entry: CatalogueEntry, profile: RulesProfile): string {
  return (profile.catalogue.column === 'classicEra' && entry.classicEra?.summary) || entry.summary
}

export type Zone = FightConfig['zone']

/** When an effect applies. Everything here is known before the fight, so it resolves at plan time. */
export interface Condition {
  /** A shield is equipped. */
  shield?: boolean
  /** A two-handed weapon is equipped. */
  twoHand?: boolean
  /** The spec fights in this stance. */
  stance?: 'battle' | 'defensive' | 'berserker'
  /** The fight is in one of these zones (Forever zone-gated flasks). */
  zones?: Zone[]
  /** The boss is one of these creature types. */
  creature?: CreatureType[]
  /**
   * A weapon of one of these types is equipped in either hand: the weapon racials, whose tooltips
   * give their crit to all attacks and spells while one is [?] (warrior.md §2.9, Q15).
   */
  weapons?: readonly WeaponType[]
  /**
   * The druid is in one of these forms (docs/classes/druid.md §2.2, §2.3): Heart of the Wild, Sharpened
   * Claws, Predatory Strikes, Leader of the Pack. The plan builds one stat block per form with them.
   */
  form?: readonly DruidForm[]
}

/** A druid's forms at level 60 (bear is Dire Bear Form; docs/classes/druid.md §2.1). */
export type DruidForm = 'caster' | 'cat' | 'bear'

export type Effect = (
  | { kind: 'stat'; stat: FlatStat; value: number }
  | { kind: 'mult'; stat: MultStat; pct: number }
  /** Item armor % (Toughness), summed before multiplying (character-stats step 4). */
  | { kind: 'itemArmorPct'; pct: number }
  /** Bonus armor % (Forever's Dire Bear Form, aura 466 [?]), summed before multiplying (druid.md §4.7). */
  | { kind: 'bonusArmorPct'; pct: number }
  /** Attack speed, multiplicative with other haste (damage-and-timing §3.1). */
  | { kind: 'haste'; pct: number }
  /** Damage done (damage-and-timing §2.4); multiplicative. `physicalOnly` skips magic procs. */
  | { kind: 'damage'; pct: number; physicalOnly?: boolean }
  /** Damage taken (tanks); multiplicative. */
  | { kind: 'damageTaken'; pct: number }
  /**
   * Global threat multiplier (threat.md#global-threat-modifiers); multiplicative. `holyOnly`: Holy
   * threat only (Righteous Fury, threat.md#paladin-righteous-fury).
   */
  | { kind: 'threat'; pct: number; holyOnly?: boolean }
  /** Maximum rage, flat or % (rage.md#rage-pool-cap-and-decay). */
  | { kind: 'maxRage'; value: number }
  | { kind: 'maxRagePct'; pct: number }
  /** Per-weapon effects: only weapons of these types (all weapons when omitted). */
  | { kind: 'weaponDamage'; value: number; weapons?: WeaponType[] }
  /** Aura crit % on the attacks made with these weapons, not spells (Weaponmaster, axes and polearms). */
  | { kind: 'weaponCrit'; value: number; weapons?: WeaponType[] }
  /** Armor ignored by attacks with these weapons, as a fraction of the target's armor (Weaponmaster, maces). */
  | { kind: 'weaponArmorPenPct'; pct: number; weapons?: WeaponType[] }
  /** Off-hand modifiers (Dual Wield Specialization). */
  | { kind: 'offHand'; damagePct?: number; hit?: number; ragePct?: number }
  /**
   * A temporary weapon enchant (stone, oil, poison): each weapon takes the highest-priority one that
   * fits it (docs/mechanics/buffs-debuffs-consumables.md#36-weapon-enhancements-temporary). A poison
   * goes on one `hand` only and brings its `proc` from that weapon's hits (docs/classes/rogue.md §4).
   */
  | {
      kind: 'tempEnchant'
      id: string
      priority: number
      weapons?: WeaponType[]
      weaponDamage?: number
      crit?: number
      hand?: 'main' | 'off'
      proc?: ProcSpec
    }
  /**
   * The rogue's poisons (docs/classes/rogue.md §4): their apply chance in points (Improved Poisons
   * +2 per rank) and their damage % (Vile Poisons +4% per rank), on every proc marked `poison`.
   */
  | { kind: 'poisonChance'; pct: number }
  | { kind: 'poisonDamage'; pct: number }
  /** Target armor reduction (docs/mechanics/buffs-debuffs-consumables.md#41-armor-reduction). */
  | { kind: 'targetArmor'; value: number }
  /** Boss attack power (+ raises it, − lowers it) and attack-speed slow (encounter.md#5-boss-melee-tank-modeling). */
  | { kind: 'bossAp'; value: number }
  | { kind: 'bossSlow'; pct: number }
  | { kind: 'proc'; proc: ProcSpec }
  /** Rage every `periodMs` from the pull (Anger Management: not an energize, so no threat). */
  | { kind: 'periodicRage'; periodMs: number; amount: number }
  /**
   * A consumable the rotation uses. `use` is the cast a rotation can press; without it, or for a
   * spec whose rotation doesn't press it, it's listed as not simulated.
   */
  | { kind: 'onUse'; id: string; name: string; use?: OnUseSpec }
) & { when?: Condition }

/**
 * An on-use consumable or item as a `cast` a rotation can press (plan/types.ts AbilityPlan):
 * no cost, any stance, its cooldown and GCD from the client, a buff, and rage at once (an
 * energize). Numbers from src/data/client, checked by effects/on-use.test.ts.
 */
export interface OnUseSpec {
  id: string
  name: string
  icon: string
  /** Its own cooldown (the item's, or the category's when that's longer). */
  cooldownMs: number
  /** 0 = off the GCD. */
  gcdMs: number
  aura: AuraSpec | null
  /** Rage at once: `rageTenths` plus a uniform whole number of tenths from 0 to `rageSpreadTenths`. */
  rageTenths: number
  rageSpreadTenths: number
  /**
   * Uses before it's spent, each fight (Manual Crowd Pummeler's 3 charges, `ItemEffect.Charges`,
   * druid.md §7.3); absent or 0: no limit.
   */
  charges?: number
  /** Mana at once, the same way (a mana potion or rune; buffs doc §3.5). Absent: none. */
  manaTenths?: number
  manaSpreadTenths?: number
}

/** Timed buff applied by a proc or a `cast` ability (plan/types.ts AbilityPlan). Mods apply per stack. */
export interface AuraSpec {
  id: string
  name: string
  durationMs: number
  maxStacks?: number
  /** Charges consumed by white swings (Flurry: 3); the aura drops when they run out. */
  whiteSwingCharges?: number
  /** At most one of those charges used per this many ms (the shaman's Flurry: 500; plan/types.ts AuraPlan). */
  whiteSwingChargeIcdMs?: number
  /** Charges consumed by crits dealt, white or special (Weakness Analyzer: 1); the aura drops when they run out. */
  critCharges?: number
  /** Charges consumed by the player's blocks (Holy Shield 4, Redoubt 5); the aura drops when they run out. */
  blockCharges?: number
  /**
   * Charges consumed by hits taken that cost health (Seal of Fury's absorb: 1, paladin.md#protection-tree),
   * after their damage-taken procs; the aura drops when they run out.
   */
  takenCharges?: number
  /** Auras in the same group exclude each other: one seal, one judgement debuff (paladin.md#seals). */
  group?: string
  mods: {
    str?: number
    agi?: number
    ap?: number
    /** Attack power %, multiplicative (Blood Fury). */
    apPct?: number
    crit?: number
    /** Spell crit % (an all-crit aura, 290, gives `crit` and this alike: combat-tables §9). */
    spellCrit?: number
    /** Attack speed %, multiplicative. */
    haste?: number
    /** Physical damage done %, multiplicative. */
    damage?: number
    // Defensive (combat-tables §8): dodge, parry and block chance %, block value, bonus armor,
    // and damage taken % (multiplicative).
    dodge?: number
    parry?: number
    block?: number
    blockValue?: number
    armor?: number
    damageTaken?: number
    /** Holy damage done %, multiplicative (Vengeance, paladin.md#retribution-tree). */
    holy?: number
    /** Flat Holy damage taken by the target (Judgement of the Crusader, paladin.md). */
    holyTaken?: number
    /**
     * On the boss (a debuff a rotation keeps up: Faerie Fire, druid.md §3.8; warrior.md §7 "Debuffs
     * on the boss"): armor removed, attack-speed slow % and attack power (+ raises it, − lowers it).
     */
    targetArmor?: number
    bossSlow?: number
    bossAp?: number
    /** Item-armor % while it's up, added to the other item-armor bonuses (Enrage, druid.md §4.5). */
    itemArmorPct?: number
    /** Energy regeneration %, multiplicative (Adrenaline Rush +100%, docs/classes/rogue.md §3.7). */
    energyRegen?: number
    /** The rogue's poisons' damage % and apply chance in points (Venom, docs/classes/rogue.md §4.4). */
    poisonDamage?: number
    poisonChance?: number
  }
}

export type ProcTrigger =
  /** A white or special melee attack that landed: hit, crit, glance or block (damage-and-timing §5.3). */
  | 'meleeLanded'
  /** A white swing (including extra attacks) that landed. */
  | 'whiteLanded'
  /** A landed swing: a white swing, an extra attack, or an on-next-swing ability's replaced swing (warrior.md §2.4 item 3). */
  | 'swingLanded'
  /** Any melee crit. */
  | 'meleeCrit'
  /** The player is hit by a damaging attack (not avoided). */
  | 'damageTaken'
  /** The player blocks. */
  | 'block'
  /** The player dodges or parries. */
  | 'dodgeParry'
  /** The player dodges (Natural Reaction). */
  | 'dodge'
  /** The player parries. */
  | 'parry'
  /** A melee swing lands on the player: hit, crit, crushing blow or block, whatever it costs (Redoubt). */
  | 'meleeTaken'
  /** The player takes a melee crit (Reckoning). */
  | 'critTaken'
  /** The target dodges one of the player's attacks, white or special, either hand (the Overpower window, warrior.md §2.8). */
  | 'targetDodge'
  /** A landed white swing, after its own crit's procs (the paladin's damage seals, paladin.md#implementation-notes). */
  | 'whiteResolved'
  /** A crit on the spell table (magic or ranged spells, combat-tables §9). */
  | 'spellCrit'

export type ProcAction =
  /** Extra main-hand swings, immediately (damage-and-timing §5.4); `bonusAp` applies to them only. */
  | { kind: 'extraAttacks'; count: number; bonusAp?: number }
  /**
   * Puts the aura on the player; `durationMs` overrides its duration for this proc (the Overpower
   * window: 5 s from a dodge, 6 s from Bloodthrill, warrior.md §2.8). A refresh never shortens it.
   */
  | { kind: 'aura'; aura: AuraSpec; durationMs?: number }
  /** Magic damage on the spell table with an average partial resist (combat-tables §9). */
  | { kind: 'spellDamage'; school: 'fire' | 'frost' | 'shadow' | 'nature' | 'arcane' | 'holy'; min: number; max: number }
  /** Rage from a spell effect (an energize: it makes threat, threat.md). */
  | { kind: 'rage'; amount: number }
  /** A bleed of `share` × the main hand's average swing, recomputed each tick (Deep Wounds, warrior.md §2.5). */
  | { kind: 'weaponBleed'; share: number; ticks: number; periodMs: number }
  /** Casts a damaging spell on its own table (the paladin's seal procs, paladin.md#seals). */
  | { kind: 'spell'; spell: SpellDef }
  /** Mana: a % of maximum mana (Shield Specialization, paladin.md#protection-tree); spell-effect mana makes threat. */
  | { kind: 'mana'; pctOfMax: number }
  /**
   * Mana: a flat amount, `perLevelPct`% more for each level the boss is above you, up to
   * `maxLevelPct`% more (Improved Seal of Fury, paladin.md#protection-tree); it makes threat too.
   */
  | { kind: 'manaFlat'; amount: number; perLevelPct: number; maxLevelPct: number }
  /**
   * A poison that stacks on the target (Deadly Poison, docs/classes/rogue.md §4.2): each application
   * rolls spell hit and adds a stack, up to `maxStacks`, and the poison lasts `durationMs` from the
   * last one; it ticks `tick` per stack every `periodMs`, on its own timer.
   */
  | { kind: 'stackingDot'; school: 'nature'; tick: number; periodMs: number; durationMs: number; maxStacks: number; periodicCanCrit: boolean }

export interface ProcSpec {
  id: string
  name: string
  icon: string
  trigger: ProcTrigger
  /**
   * Which attacks can trigger it: `weapon` = only the weapon the item or enchant is on (resolved
   * per hand at plan time), `mainHand`/`offHand`, or `any`.
   */
  from: 'weapon' | 'mainHand' | 'offHand' | 'any'
  /** Only attacks made with these weapon types (Weaponmaster swords). */
  weapons?: WeaponType[]
  chance: { ppm: number } | { pct: number }
  icdMs?: number
  action: ProcAction
  /**
   * Only while this aura is up (an aura id of the plan: a buff, or a bleed's marker on the target,
   * e.g. `rend` for Bloodthrill, warrior.md §2.8). A proc whose aura the plan doesn't have is left
   * out; while the aura is down, the proc isn't rolled.
   */
  requiresAura?: string
  /**
   * Only in these druid forms (Primal Fury's rage: bear, druid.md §4.8). The plan resolves it against
   * the forms the fight can be in: always rolled if it holds in all of them, left out if in none.
   */
  forms?: readonly DruidForm[]
  /** What each of its procs is, for its breakdown row's count a fight: an extra attack (Reckoning), a block (Holy Shield's damage). */
  counts?: 'blocks' | 'extraAttacks'
  /** A rogue's poison: the talents' and auras' poison chance and damage apply (docs/classes/rogue.md §4). */
  poison?: boolean
  /** Doc section that owns the numbers. */
  docRef: string
}
