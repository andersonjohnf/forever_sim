// Rule profiles (docs/architecture.md#engine-design-m1, docs/milestones.md#m1-engine-core).
//
// Every mechanic where the Forever client and Classic Era disagree, or where Forever is
// unmeasured, is a number in one of these objects, never a branch in the engine. A guild
// measurement changes a value here (with its source), not code. `forever` is the default;
// `classicEra` is the tested Classic Era baseline. Each field cites the doc section that owns
// it; the tags ([F]/[C]/[?]) live in that doc.
import type { DamageTakenRageModel, LegacyDamageTakenRageModel, RuleProfileId } from '../types'

export type { DamageTakenRageModel }

/** The damage-taken rage models (docs/mechanics/rage.md#rage-from-damage-taken). */
export const DAMAGE_TAKEN_RAGE_MODELS: readonly DamageTakenRageModel[] = ['forever', 'foreverFlat', 'foreverHealthLost', 'classic']

/**
 * Legacy ids a saved setup may carry, and the model each now names (M2.4h). `forever` kept its
 * name: it has always meant the Forever default, which is now the logged fit that
 * `foreverHpPreArmor` used to name (rage.md#forever-).
 */
export const LEGACY_DAMAGE_TAKEN_RAGE: Readonly<Record<LegacyDamageTakenRageModel, DamageTakenRageModel>> = {
  foreverHp: 'foreverHealthLost',
  foreverHpPreArmor: 'forever',
}

/** A damage-taken model id, legacy ones mapped to today's; anything else is `undefined`. */
export function currentDamageTakenRageModel(id: unknown): DamageTakenRageModel | undefined {
  if (typeof id !== 'string') return undefined
  if ((DAMAGE_TAKEN_RAGE_MODELS as readonly string[]).includes(id)) return id as DamageTakenRageModel
  return Object.hasOwn(LEGACY_DAMAGE_TAKEN_RAGE, id) ? LEGACY_DAMAGE_TAKEN_RAGE[id as LegacyDamageTakenRageModel] : undefined
}

export interface RulesProfile {
  id: RuleProfileId
  name: string
  combat: {
    /**
     * `foreverUi`: the Forever client's weapon-skill panel (0.04% per point for miss, dodge,
     * parry and crit; no hit suppression). `classic`: Magey's Classic Era table.
     * docs/mechanics/combat-tables.md#22-outcome-formulas
     */
    model: 'foreverUi' | 'classic'
    /** `foreverUi` base miss by level difference 0..3 at skill 5 × 60 (combat-tables §2.2). */
    missBase: readonly [number, number, number, number]
    /** `foreverUi` base dodge by level difference (combat-tables §2.2). */
    dodgeBase: readonly [number, number, number, number]
    /** `foreverUi` base parry by level difference, front only (combat-tables §2.2). */
    parryBase: readonly [number, number, number, number]
    /** `foreverUi` change per weapon-skill point for miss, dodge, parry and crit (combat-tables §4.1). */
    perSkillPoint: number
    /** White-swing miss added while dual wielding (combat-tables §5). */
    dualWieldPenalty: number
    /** Mob block chance from the front (combat-tables §1.1). */
    mobBlock: number
    /** Glancing damage: the Forever UI formula (+0.10 above a 10-point gap) or Beaza's (combat-tables §2.3). */
    glance: 'foreverUi' | 'classic'
    /** Cap on the aura-crit part of crit suppression vs a +3 boss (combat-tables §4.4). */
    auraCritSuppression: number
    /** Spell miss by level difference 0..3 (combat-tables §9). */
    spellMiss: readonly [number, number, number, number]
    /** The spell hit floor: always this much miss (combat-tables §9). */
    spellMissFloor: number
    /** Whether expertise exists in this ruleset (combat-tables §7; Classic Era has none). */
    expertise: boolean
    /**
     * Whether the ticks of a spell with the periodic-crit flag can crit (`forever`: "Most periodic
     * effects can critically strike"; Classic Era: never). docs/mechanics/damage-and-timing.md#4-dots-and-bleeds
     */
    periodicCrits: boolean
  }
  armor: {
    /** Armor below 0 increases damage (`forever`) or is floored at 0 (docs/mechanics/damage-and-timing.md#12-armor-reduction-debuffs-and-penetration). */
    allowNegative: boolean
    /** Damage-reduction cap (damage-and-timing §1.1). */
    cap: number
  }
  ratings: {
    /** Rating per 1% (defense: per point). docs/mechanics/character-stats.md#combat-ratings-forever-items */
    hit: number
    crit: number
    dodge: number
    parry: number
    block: number
    defense: number
    haste: number
    expertise: number
    /**
     * Whether this ruleset has the stats D12 applies by hypothesis (haste rating, expertise,
     * armor penetration). Classic Era has none of them (character-stats §combat ratings).
     */
    unmeasuredStats: boolean
  }
  rage: {
    /** `normalized`: a fixed amount per landed white hit; `damage`: 7.5 × damage / c. docs/mechanics/rage.md#rage-from-damage-dealt */
    white: 'normalized' | 'damage'
    /** Rage per second of base weapon speed per landed white hit, one-hander (rage.md, Forever). */
    normalizedOneHand: number
    /** Same, two-hander (rage.md, Forever). */
    normalizedTwoHand: number
    /** Off-hand share of the normalized rate before Dual Wield Specialization (rage.md unknowns). */
    offHandBase: number
    /** Share of would-be damage a dodged or parried white swing gives in the damage model (rage.md). */
    avoidedWhiteShare: number
    /** Rage conversion value c(60) (rage.md, Classic Era formula). */
    conversion: number
    /** Default damage-taken model (rage.md#rage-from-damage-taken; `damageTakenRage` in core/formulas.ts). */
    damageTaken: DamageTakenRageModel
    /**
     * A white hit's or a hit taken's fraction of a tenth (docs/mechanics/rage.md#rounding): `carry`
     * keeps it for the next such gain, so fractions add up and none is lost; `floor` drops it.
     */
    fraction: 'carry' | 'floor'
    /** Rage kept on a stance swap: base + per rank of (Improved) Tactical Mastery (rage.md#stance-changes-and-tactical-mastery). */
    stanceRetainBase: number
    stanceRetainPerRank: number
  }
  /** The buff, consumable and enchant catalogue (docs/mechanics/buffs-debuffs-consumables.md#classic-era-values). */
  catalogue: {
    /**
     * Which values the entries use: their own (Forever's), or their Classic Era ones where an
     * entry has them (`classicEra` on buffs.ts and enchants.ts entries).
     */
    column: 'forever' | 'classicEra'
    /**
     * Windfury Totem is a main-hand temporary enchant (Classic Era: enchant 564, which replaces a
     * stone there) rather than a party aura (Forever). docs/mechanics/buffs-debuffs-consumables.md#windfury-totem
     */
    windfuryMainHandEnchant: boolean
  }
  /**
   * Spell values that differ between the two clients and that worked examples tie to the
   * profile (docs/mechanics/buffs-debuffs-consumables.md, damage-and-timing WE-1, encounter WE-4).
   */
  values: {
    curseOfRecklessnessArmor: number
    /** Classic's Curse of Recklessness also raises the target's attack power (buffs §4.1). */
    curseOfRecklessnessBossAp: number
    armorShatterPerStack: number
    exposeArmor: number
    demoralizingShoutAp: number
    thunderClapSlow: number
    windfuryAp: number
    /** Windfury Totem's internal cooldown, ms (damage-and-timing §5.4). */
    windfuryIcdMs: number
    /** Hand of Justice's chance per landed melee hit against a non-Dwarf target, % (damage-and-timing §5.2). */
    handOfJusticePct: number
    /**
     * Ironfoe's proc on its own hits (damage-and-timing §5.2): the chance per landed melee hit
     * against a non-Orc target, and its internal cooldown, ms.
     */
    ironfoe: { chance: { pct: number } | { ppm: number }; icdMs: number }
  }
}

export const FOREVER: RulesProfile = {
  id: 'forever',
  name: 'Forever',
  combat: {
    model: 'foreverUi',
    // docs/mechanics/combat-tables.md#22-outcome-formulas (table of missBase/dodgeBase/parryBase by d)
    missBase: [5.0, 5.5, 6.0, 8.0],
    dodgeBase: [5.0, 5.5, 6.0, 6.5],
    parryBase: [5.0, 5.5, 6.0, 16.5],
    // docs/mechanics/combat-tables.md#41-effects-per-point
    perSkillPoint: 0.04,
    // docs/mechanics/combat-tables.md#5-dual-wield-and-on-next-swing-queues
    dualWieldPenalty: 19,
    // docs/mechanics/combat-tables.md#11-profile-parameters-player-level-60-vs-boss-level-63-defense-315
    mobBlock: 5,
    // docs/mechanics/combat-tables.md#23-glancing-blows
    glance: 'foreverUi',
    // docs/mechanics/combat-tables.md#44-crit-suppression
    auraCritSuppression: 1.8,
    // docs/mechanics/combat-tables.md#9-spell-hit-and-crit-generic
    spellMiss: [4, 5, 6, 17],
    spellMissFloor: 0,
    // docs/mechanics/combat-tables.md#7-expertise-forever
    expertise: true,
    // docs/mechanics/damage-and-timing.md#4-dots-and-bleeds (the flag is client data; ticks critting in combat is [?])
    periodicCrits: true,
  },
  // docs/mechanics/damage-and-timing.md#1-armor
  armor: { allowNegative: true, cap: 0.75 },
  // docs/mechanics/character-stats.md#combat-ratings-forever-items; haste and expertise per D12
  ratings: { hit: 10, crit: 14, dodge: 12, parry: 15, block: 5, defense: 1, haste: 10, expertise: 10, unmeasuredStats: true },
  rage: {
    // docs/mechanics/rage.md#forever-normalized-rage-per-swing-
    white: 'normalized',
    normalizedOneHand: 3.5,
    normalizedTwoHand: 4.5,
    offHandBase: 0.5,
    avoidedWhiteShare: 0,
    // docs/mechanics/rage.md#classic-era-formula-c
    conversion: 230.6,
    // docs/mechanics/rage.md#forever-: 10 × damage before armor, block and absorbs ÷ max health
    damageTaken: 'forever',
    // docs/mechanics/rage.md#rounding: the logs keep every fraction of a tenth on average
    fraction: 'carry',
    // docs/mechanics/rage.md#stance-changes-and-tactical-mastery (Forever: 10 + 3 × Improved Tactical Mastery)
    stanceRetainBase: 10,
    stanceRetainPerRank: 3,
  },
  // docs/mechanics/buffs-debuffs-consumables.md#classic-era-values, #windfury-totem
  catalogue: { column: 'forever', windfuryMainHandEnchant: false },
  values: {
    // docs/mechanics/buffs-debuffs-consumables.md#41-armor-reduction
    curseOfRecklessnessArmor: 505,
    curseOfRecklessnessBossAp: 0,
    armorShatterPerStack: 165,
    exposeArmor: 2250,
    // docs/mechanics/buffs-debuffs-consumables.md#42-other-debuffs: rank 5's level-60 tooltip, base −196
    // and −1.4 per level from 54 (11556); whether combat applies the per-level term is OQ 19
    demoralizingShoutAp: 204,
    thunderClapSlow: 0.2,
    // docs/mechanics/buffs-debuffs-consumables.md#11-attack-power-stats-and-crit (Windfury Totem r3)
    windfuryAp: 246,
    // docs/mechanics/damage-and-timing.md#54-extra-attacks-and-chaining: 10612 ProcCategoryRecovery 100
    windfuryIcdMs: 100,
    // docs/mechanics/damage-and-timing.md#52-ppm-vs-flat-chance-classic-era-examples: 15600 ProcChance 3, ÷ 3 unless the target is a Dwarf
    handOfJusticePct: 1,
    // docs/mechanics/damage-and-timing.md#52-ppm-vs-flat-chance-classic-era-examples: equip aura 1301046, ProcChance 6
    // read as Hand of Justice's, ÷ 2 unless the target is an Orc [?]; ProcCategoryRecovery 100
    ironfoe: { chance: { pct: 3 }, icdMs: 100 },
  },
}

export const CLASSIC_ERA: RulesProfile = {
  id: 'classicEra',
  name: 'Classic Era',
  combat: {
    // docs/mechanics/combat-tables.md#22-outcome-formulas (classicEra formulas; only parryBase is read:
    // 14% vs +3, 5 + 0.5 × d below that [?])
    model: 'classic',
    missBase: [5.0, 5.5, 6.0, 8.0],
    dodgeBase: [5.0, 5.5, 6.0, 6.5],
    parryBase: [5.0, 5.5, 6.0, 14.0],
    perSkillPoint: 0.1,
    dualWieldPenalty: 19,
    mobBlock: 5,
    glance: 'classic',
    auraCritSuppression: 1.8,
    spellMiss: [4, 5, 6, 17],
    spellMissFloor: 1,
    expertise: false,
    periodicCrits: false,
  },
  armor: { allowNegative: false, cap: 0.75 },
  // Forever items still carry the old stats as ratings; they convert at the displayed ratios.
  // Classic Era has no haste rating, expertise or armor penetration (character-stats §combat ratings).
  ratings: { hit: 10, crit: 14, dodge: 12, parry: 15, block: 5, defense: 1, haste: 10, expertise: 10, unmeasuredStats: false },
  rage: {
    // docs/mechanics/rage.md#classic-era-formula-c
    white: 'damage',
    normalizedOneHand: 3.5,
    normalizedTwoHand: 4.5,
    offHandBase: 0.5,
    avoidedWhiteShare: 0.75,
    conversion: 230.6,
    // docs/mechanics/rage.md#classic-era-c: 2.5 × health lost ÷ 230.6
    damageTaken: 'classic',
    // docs/mechanics/rage.md#rounding: unmeasured in Classic Era, so each gain is floored as before
    fraction: 'floor',
    // docs/mechanics/rage.md#stance-changes-and-tactical-mastery (Classic Era: 5 × Tactical Mastery)
    stanceRetainBase: 0,
    stanceRetainPerRank: 5,
  },
  // docs/mechanics/buffs-debuffs-consumables.md#classic-era-values, #windfury-totem
  catalogue: { column: 'classicEra', windfuryMainHandEnchant: true },
  values: {
    // docs/mechanics/buffs-debuffs-consumables.md#41-armor-reduction (Classic Era columns)
    curseOfRecklessnessArmor: 640,
    curseOfRecklessnessBossAp: 90,
    armorShatterPerStack: 200,
    exposeArmor: 1700,
    // docs/mechanics/buffs-debuffs-consumables.md#42-other-debuffs (Classic Era columns): rank 5 at
    // level 60, −140 − 1 per level from 54 (11556, 1.15.9)
    demoralizingShoutAp: 146,
    thunderClapSlow: 0.1,
    windfuryAp: 315,
    // docs/mechanics/damage-and-timing.md#54-extra-attacks-and-chaining: none in Classic Era
    windfuryIcdMs: 0,
    // docs/mechanics/damage-and-timing.md#52-ppm-vs-flat-chance-classic-era-examples: 15600 ProcChance 2 (1.15.9)
    handOfJusticePct: 2,
    // docs/mechanics/damage-and-timing.md#52-ppm-vs-flat-chance-classic-era-examples: chance on hit (15494), 0.8 PPM
    ironfoe: { chance: { ppm: 0.8 }, icdMs: 0 },
  },
}

export const PROFILES: Record<RuleProfileId, RulesProfile> = { forever: FOREVER, classicEra: CLASSIC_ERA }
