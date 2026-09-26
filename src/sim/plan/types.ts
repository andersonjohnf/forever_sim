// The resolved plan (decision D15: "the config is resolved once into a flat, precomputed plan").
//
// The main thread turns a SimConfig into a Plan: gear summed, buffs and talents applied,
// conditions resolved, profile values copied in. The plan is plain data, so it posts to workers
// by structured clone, and the engine that runs it imports no datasets. Everything the engine
// needs per event is a number here.
import type { AuraSpec } from '../effects/types'
import type { RulesProfile } from '../rules/profiles'
import type { StatBlock } from '../stats/stat-block'
import type { Assumption, CharacterSheet, ClassId, CreatureType, DamageTakenRageModel, Role, SpecId } from '../types'

export const HAND = { main: 0, off: 1 } as const

/** Proc triggers as integer codes (effects/types.ts ProcTrigger). */
export const TRIGGER = {
  meleeLanded: 0,
  whiteLanded: 1,
  meleeCrit: 2,
  damageTaken: 3,
  block: 4,
  dodgeParry: 5,
  /**
   * Retired (D36): white swings and on-next-swing swings, for Unbridled Wrath, which now procs from
   * auto attacks only (`whiteLanded`). Nothing fires it; the code stays so the others keep theirs.
   */
  swingLanded: 6,
  /** The target dodged one of the player's attacks, white or special (the Overpower window, warrior.md §2.8). */
  targetDodge: 7,
  // The boss's swings on the player (combat-tables §8), for any class's defensive procs:
  /** The player dodged (Natural Reaction). `dodgeParry` fires too. */
  dodge: 8,
  /** The player parried. `dodgeParry` fires too. */
  parry: 9,
  /**
   * A swing landed on the player: a hit, crit, crushing blow or block, whatever it costs (Redoubt).
   * Fires after `damageTaken` (if the swing cost health) and before `block` or `critTaken`.
   */
  meleeTaken: 10,
  /** The player took a crit (Reckoning). */
  critTaken: 11,
  /**
   * A landed white swing (an extra attack too), after its own crit's procs: the paladin's damage
   * seals, which fire after the swing's Vengeance (paladin.md#implementation-notes).
   */
  whiteResolved: 12,
  /** A spell crit on the magic or ranged table (combat-tables §9): Vengeance (paladin.md#retribution-tree). */
  spellCrit: 13,
  // 14–19 are left to the parallel tracks (rogue, shaman). The caster core's (docs/mechanics/spells.md §10):
  /**
   * A plan spell of the magic or `none` class landed on the target (a direct hit, a DoT's
   * application, a DoT channel's start, each missile of a channel that triggers a spell): Shadow
   * Weaving, Winter's Chill, Improved Scorch. A proc can name the schools (`ProcPlan.schools`) or
   * the one spell (`ProcPlan.fromSource`) that fire it.
   */
  spellLanded: 20,
  /** A spell DoT ticked (docs/mechanics/spells.md §7): Nightfall's Shadow Trance. The same filters. */
  spellTick: 21,
  // The ranged and pet core's (docs/mechanics/ranged-and-pets.md §9), past main's highest:
  /** A ranged attack landed: an Auto Shot or a ranged-weapon shot (a `SpellDef.ranged` spell). Hand −1. */
  rangedLanded: 22,
  /** An Auto Shot landed (Improved Aspect of the Hawk's Quick Shots: "normal ranged attacks"). */
  autoShotLanded: 23,
  /** A ranged attack crit, Auto Shot or a shot (Go for the Throat's kind of proc). */
  rangedCrit: 24,
  /** The pet's attack landed, white or special (Plan.pet). */
  petLanded: 25,
  /** The pet's attack crit, white or special (Frenzy, Ferocious Inspiration). */
  petCrit: 26,
  /**
   * One of your attacks or spells that deals damage landed: a white swing, a damaging special, a
   * bleed's or DoT's application, a damaging spell-table strike, a spell or shot that fires your
   * procs; never a tick or a proc's spell. Hand −1 (Touch of the Grave,
   * docs/mechanics/character-stats.md#touch-of-the-grave).
   */
  damageLanded: 27,
} as const
export const TRIGGER_COUNT = 28

/**
 * Warrior stances as bits (docs/classes/warrior.md#21-stances). An ability's `stances` mask says
 * where it can be used; a plan's `stance` is the bit it fights in, or STANCE_ANY for a class
 * without stances.
 */
export const STANCE = { battle: 1, defensive: 2, berserker: 4 } as const
export const STANCE_ANY = 7

/**
 * What a stance changes, relative to the plan's base stance (warrior.md §2.1, §7 "Stances"). The
 * plan's static numbers (`damageMult`, `threatMult`, `damageTakenMult`, the stat block's crit) are
 * the base stance's, exactly as before stances could change; each stance carries the factors and
 * the crit delta that turn them into its own, so the base stance's are 1, 1, 1 and 0.
 */
export interface StancePlan {
  /** The STANCE bit. */
  stance: number
  /** Factor on all damage done (Defensive Stance −10%). */
  damage: number
  /** Factor on threat (the stance's own, and Defiance's in Defensive Stance with a shield). */
  threat: number
  /** Factor on damage taken (Defensive −10%, Berserker +10%). */
  damageTaken: number
  /** Aura crit %, added (Berserker Stance +3). */
  crit: number
  /** Spell crit %, added (Berserker Stance's +3 is all crit in `forever`, melee only in `classicEra`). */
  spellCrit: number
}

/** Proc actions as integer codes. */
export const ACTION = {
  extraAttacks: 0,
  aura: 1,
  spellDamage: 2,
  rage: 3,
  weaponBleed: 4,
  /** Casts a plan spell (`amount`: its index in Plan.spells): the paladin's seal procs. */
  spell: 5,
  /** Mana: `amount` % of maximum mana (Shield Specialization, paladin.md#protection-tree). */
  mana: 6,
  /** Mana: `amount` tenths (Improved Seal of Fury, paladin.md#protection-tree). */
  manaFlat: 7,
  /**
   * A stacking poison on the target (Deadly Poison, docs/classes/rogue.md §4.2): `amount` its most
   * stacks, `a` each stack's tick damage, `b` the tick period (ms), `school` its school; it lasts
   * `durationMs` from its last application. The rogue's; added after main's codes.
   */
  stackingDot: 8,
  // 9–19 are left to the parallel tracks. The mage's (docs/classes/mage.md):
  /** Adds the crit that fired it to the plan's rolling Ignite (`Plan.ignite`, docs/classes/mage.md#ignite). */
  ignite: 20,
  /** Mana: `amount` % of the cost of the ability whose spell fired it (Master of Elements, docs/classes/mage.md#talents). */
  manaOfCost: 21,
  // The ranged and pet core's (docs/mechanics/ranged-and-pets.md §9):
  /** The pet's power (Focus, Energy or mana): `amount` tenths, capped at its maximum. */
  petPower: 22,
  /**
   * Drains health from the target as damage of `school`: `a` per proc, a share of your maximum
   * health; never misses or crits (Touch of the Grave, docs/mechanics/character-stats.md#touch-of-the-grave).
   */
  healthDrain: 23,
  /**
   * Damage your pet deals as its attack lands: `a`–`b` + `spCoefficient` × your spell damage of
   * `school`, with the pet's multipliers and crit (Demonic Brand, docs/classes/warlock.md §11.3).
   */
  petSpellDamage: 24,
} as const

/**
 * A spell's damage class, the client's `SpellCategories.DefenseType`, which picks its attack table
 * (paladin.md#conventions-used-below; combat-tables §3 "Defense type"): `magic` the spell table
 * (§9), `melee` the special-attack table (§3), `ranged` miss, block, then crit, `none` always hits.
 */
export const DEFENSE = { none: 0, magic: 1, melee: 2, ranged: 3 } as const

/** Spell schools as codes (ProcPlan.school's, plus physical). */
export const SCHOOL = { fire: 0, frost: 1, shadow: 2, nature: 3, arcane: 4, holy: 5, physical: 6 } as const

/**
 * A damaging spell, as data (paladin.md#conventions-used-below): a seal's proc, a judgement, Holy
 * Strike, Exorcism. One engine function resolves them all. Damage is `min…max` (weapon-based:
 * `weaponPercent` × (main-hand roll + flat weapon damage + AP/14 × speed + `min…max`)), plus
 * `spCoefficient` × spell damage, × `damageMult` and the school's multipliers, then plus the
 * target's flat damage taken of its school (Judgement of the Crusader) × `takenScale`, and × the
 * crit multiplier on a crit.
 */
export interface SpellDef {
  id: string
  name: string
  icon: string
  school: keyof typeof SCHOOL
  defense: keyof typeof DEFENSE
  /** Can't be dodged, parried or blocked (SpellMisc Attr0 0x200000, "No Active Defense"). */
  noActiveDefense: boolean
  /** Never misses (SpellMisc Attr3 0x40000, "Always Hit"). */
  alwaysHit: boolean
  /**
   * Its hits and crits trigger procs: on-hit and crit procs, and crit charges. A spell you cast
   * always does; a spell that another spell or an aura triggers (a seal's proc, a judgement's
   * damage, a periodic tick) only with SpellMisc Attr3 0x200, "NOT_A_PROC" [?]
   * (paladin.md#conventions-used-below).
   */
  triggersProcs: boolean
  min: number
  max: number
  weaponPercent: number
  normalized: boolean
  spCoefficient: number
  /** Share of the target's flat damage taken of this school it gets (JotC: the coefficient, paladin.md). */
  takenScale: number
  critMultiplier: number
  bonusCrit: number
  /** Its own damage multiplier (Improved Seals, Sacred Arbiter). */
  damageMult: number
  /** Threat = damage × mult + bonus, before the school's and the global multipliers (threat.md). */
  threatMult: number
  threatBonus: number
  /**
   * Never crits, and rolls no crit, on any table (Holy Shield's block damage and Retribution Aura's:
   * paladin.md#other-abilities [?]). Absent: it can crit.
   */
  cannotCrit?: boolean
  /**
   * A weapon-damage spell whose flat `min`–`max` is added after its weapon share, not inside it: Holy
   * Strike's tooltip, "40% weapon damage plus an additional 81 to 105" (paladin.md#other-abilities,
   * OQ 6). Absent: the flat part is inside the share, as a warrior's specials have it.
   */
  flatApart?: boolean
  /**
   * Damage from the main hand's weapon DPS, not a swing: `weaponDps` × (its average damage, its flat
   * weapon damage and, with `weaponDpsAp`, attack power ÷ 14 × its speed) ÷ its base speed, no roll
   * (Hammer of the Righteous's "3 times the damage per second of your main hand weapon",
   * paladin.md#other-abilities). A spell without a weapon share, so a melee-class one rolls twice
   * (paladin.md#conventions-used-below), and it needs a main hand. Absent: none.
   */
  weaponDps?: number
  /** Whether `weaponDps` counts attack power (paladin.md OQ 11) [?]. */
  weaponDpsAp?: boolean
  /**
   * More damage while an aura (by id) is up, which the spell uses up when it lands: Stormstrike's
   * +20% to the shaman's next Lightning Bolt or Earth Shock (docs/classes/shaman.md#stormstrike).
   * Absent: none. With `keep`, the spell doesn't use the aura up: Lava Burst's +20% while your Flame
   * Shock is on the target (docs/classes/shaman.md#elemental-abilities).
   */
  boost?: { aura: string; pct: number; keep?: boolean }
  // --- The caster core (docs/mechanics/spells.md). All optional: absent, a spell behaves as before. ---
  /**
   * A binary spell (docs/mechanics/spells.md §3): one with an effect besides damage (a slow, a debuff)
   * is resisted whole, at its school's average resistance, rolled with its hit, and a landed one
   * takes no partial resist. Absent: a pure damage spell, partially resisted on average.
   */
  binary?: boolean
  /**
   * A periodic part (docs/mechanics/spells.md §7): when the spell lands, `dotTicks` ticks of
   * `dotTickDamage` + `dotSpCoefficient` × the school's spell damage, one every `dotTickMs` from
   * then. A spell with no direct part (`min`, `max`, `spCoefficient` and `weaponPercent` all 0) is a
   * pure DoT: it rolls its hit and no crit when it lands. Reapplying restarts it (a tick due that
   * very moment lands first). `dotCanCrit` is the spell's periodic-crit flag (SpellMisc
   * Attributes[8] 0x200): its ticks crit only in a profile whose periodic effects can.
   */
  dotTicks?: number
  dotTickMs?: number
  dotTickDamage?: number
  dotSpCoefficient?: number
  dotCanCrit?: boolean
  /**
   * More crit for this spell only, per stack of an aura (by id) while it's up: Winter's Chill's +2% a
   * stack for "your Ice Lance and Frostbolt" (docs/classes/mage.md#winters-chill). Absent: none.
   */
  critAura?: { aura: string; pctPerStack: number }
  /**
   * Its DoT's own multiplier, which a DoT snapshots in place of `damageMult` (docs/classes/warlock.md
   * §4: Aftermath's +50% is Immolate's direct hit only, Malediction's +5% its ticks only). Absent: the
   * DoT uses `damageMult`, as every spell before the warlock's.
   */
  dotDamageMult?: number
  /**
   * A shot with the ranged weapon (docs/mechanics/ranged-and-pets.md §5): it rolls the ranged table
   * (`Plan.ranged`: its miss and block from the front, then a second roll for its ranged crit) and
   * its weapon part is the ranged weapon's roll, flat damage and ranged attack power ÷ 14 × its speed
   * (normalized: 2.8), × the ranged damage multiplier. A pure DoT (a sting) rolls only the first. Its
   * `defense` is `ranged`. Absent: a spell as before (the paladin's Hammer of Wrath rolls the main
   * hand's table).
   */
  ranged?: boolean
  /**
   * Damage % on its direct damage once the target is below `lowHealthBelowPct`% health, from
   * t = floor(L × (1 − that/100)), the execute phase's rule (Decimation: Shadow Bolt +6% below 35%,
   * docs/classes/warlock.md §11.3), as an ability's `lowHealthPct`. Absent: none.
   */
  lowHealthPct?: number
  lowHealthBelowPct?: number
  /**
   * An item's spell with no class options (spell 1269334 has no SpellClassOptions row: EZ-Thro Dark
   * Bomb, buffs doc §3.7): your class's talents and auras, which name your class's spells, don't reach
   * it [?]. None of your school's hit, crit or damage (Elemental Precision, Critical Mass, Combustion,
   * a demon's sacrifice), no per-spell crit (Winter's Chill) or free-cast crit, none of your spell
   * procs (Ignite, Combustion's stacks, Master of Elements), and only the crit charges any crit ends.
   * Your spell hit and crit, your all-damage multiplier and the boss's damage taken apply. Absent: a
   * spell of your class's.
   */
  itemSpell?: boolean
  /**
   * Another player's spell that deals its damage from you (a raid druid's Thorns on the tank, buffs
   * doc §1.2 "Thorns on the tank"): your school damage auras (Power Infusion's +20%, a school talent)
   * are yours, not its caster's, so they don't reach it [?]. Everything else is as for any spell.
   * Absent: your own spell.
   */
  othersSpell?: boolean
}

export interface SpellPlan extends Omit<SpellDef, 'name' | 'icon' | 'school' | 'defense' | 'boost' | 'critAura'> {
  /** `SpellDef.critAura` resolved: the plan aura and its crit % a stack (docs/classes/mage.md#winters-chill). Absent: none. */
  critAura?: number
  critAuraPct?: number
  school: number
  defense: number
  /** Breakdown row. */
  source: number
  /** `SpellDef.boost` resolved: the plan aura it's boosted by and uses up, and the % (shaman.md#stormstrike). Absent: none. */
  boostAura?: number
  boostPct?: number
  /** `SpellDef.boost.keep`: the boost's aura stays up when the spell lands (Incinerate's +25% on an Immolated target, docs/classes/warlock.md §3; Lava Burst's on your Flame Shock, shaman.md#elemental-abilities). Absent: used up. */
  boostKeep?: boolean
  /**
   * Its DoT's breakdown row, when it has a direct part too (Fireball's, Immolate's: "<name> (DoT)");
   * absent: its own row (a pure DoT: Corruption).
   */
  dotSource?: number
  /**
   * The plan aura that marks its DoT on the target, up from an application until the last tick, so
   * rotation conditions can read it (the ability's `aura`; docs/mechanics/spells.md §7). Absent or −1: none.
   */
  dotAura?: number
  /**
   * The cast time a proc's rate per minute of casting reads for it (`ProcPlan.ppmCast`): its ability's
   * cast time, at least the GCD (docs/classes/druid.md §11.3). Set only on a plan with such a proc.
   */
  procCastMs?: number
}

/**
 * A school's code in a bit mask (docs/mechanics/spells.md §9): bit `SCHOOL[s]`. The magic schools
 * are every school but physical; Curse of the Elements' "Magic" is all of them, Holy included.
 */
export const schoolBit = (school: keyof typeof SCHOOL) => 1 << SCHOOL[school]
/** The mask of these schools (docs/mechanics/spells.md §9). */
export const schoolMask = (schools: readonly (keyof typeof SCHOOL)[]) => schools.reduce((m, s) => m | schoolBit(s), 0)
export const MAGIC_SCHOOLS = ['fire', 'frost', 'shadow', 'nature', 'arcane', 'holy'] as const
export type MagicSchool = (typeof MAGIC_SCHOOLS)[number]
export const SCHOOL_COUNT = 7

/**
 * What the plan knows about each spell school, indexed by `SCHOOL` code (docs/mechanics/spells.md
 * §5, §9): absent on a plan where every school is plain (all 1, 1, 0 and the boss's level-based
 * resistance), which is every plan without a caster's effects.
 */
export interface SchoolPlan {
  /** The caster's own damage multiplier per school: talents and static buffs (Power Infusion's is an aura). */
  damage: number[]
  /** The boss's damage-taken multiplier per school: the Buffs tab's debuffs (Curse of the Elements). */
  taken: number[]
  /** Spell crit %, added, per school: talents (Critical Mass's Fire crit). */
  crit: number[]
  /**
   * The boss's resistance per school, as the average-resist formula reads it (combat-tables §9): its
   * level-based resistance, plus its own (0) less the debuffs' reductions, not below 0, less your
   * spell penetration; below 0 only in a profile that allows it (docs/mechanics/spells.md §3).
   */
  resistance: number[]
  /**
   * Spell hit %, added per school to the sheet's (Elemental Precision's Fire and Frost, Arcane Focus's
   * Arcane; docs/classes/mage.md#talents), under the same floor. Absent: none for any school.
   */
  hit?: number[]
}

export interface WeaponPlan {
  name: string
  icon: string
  min: number
  max: number
  speedSec: number
  twoHand: boolean
  /** Flat weapon damage (stones, enchants), added to the roll (damage-and-timing §2.1). */
  flatDamage: number
  /** Damage share of this hand: 1 main hand; 0.5 × (1 + DWS) off hand (damage-and-timing §2.3). */
  handMult: number
  skill: number
  /** Hit % only this hand gets (Dual Wield Specialization's off-hand hit). */
  hitBonus: number
  /** Aura crit % only this hand's attacks get (Weaponmaster's axe and polearm crit, warrior.md §2.7). */
  critBonus: number
  /** Fraction of the target's armor this hand ignores (Weaponmaster, maces). */
  armorPenPct: number
  /** Multiplier on this hand's white rage after the profile's off-hand base (Dual Wield Specialization). */
  rageMult: number
  /** Glancing damage factor range at this hand's skill (combat-tables §2.3). */
  glanceLow: number
  glanceHigh: number
  /** Speed for normalized abilities: 2.4 one-hand, 1.7 dagger, 3.3 two-hand (damage-and-timing §2.2). */
  normalizedSpeed: number
}

export interface AuraPlan {
  id: string
  /** For the results' "Cooldowns and buffs"; a weapon's own proc names its hand when both have one. */
  name: string
  /** WoW icon name: the proc's or the ability's that applies it. */
  icon: string
  durationMs: number
  maxStacks: number
  whiteSwingCharges: number
  /**
   * At most one white-swing charge used per this many ms (the shaman's Flurry, 16257:
   * `ProcCategoryRecovery` 500, so a Windfury Weapon's extra attacks use one between them;
   * docs/classes/shaman.md#flurry). Absent or 0: every white swing uses one.
   */
  whiteSwingChargeIcdMs?: number
  str: number
  agi: number
  ap: number
  /** Attack power %, multiplicative with the stat block's AP multiplier (Blood Fury, warrior.md §2.9). */
  apPct: number
  crit: number
  /** Spell crit % (all-crit auras, 290: Recklessness, Elune's Light, Weakness Analyzer). */
  spellCrit: number
  /** Attack speed %, multiplicative. */
  haste: number
  /** Physical damage %, multiplicative. */
  damage: number
  /** Crits dealt that end it early (Weakness Analyzer: 1; 0 = none). */
  critCharges: number
  // Defensive mods (combat-tables §8), absent = 0: dodge, parry and block chance %, block value,
  // bonus armor, and damage taken % (multiplicative; −75 is ×0.25).
  dodge?: number
  parry?: number
  block?: number
  blockValue?: number
  armor?: number
  damageTaken?: number
  /** Blocks that end it early (Holy Shield 4, Redoubt 5; absent or 0 = none). */
  blockCharges?: number
  /** Hits taken that cost health and end it (Seal of Fury's absorb, 1; paladin.md#protection-tree); absent or 0 = none. */
  takenCharges?: number
  /** Your pet's landed attacks that end it, after their procs (Demonic Brand, docs/classes/warlock.md §11.3); absent or 0 = none. */
  petLandedCharges?: number
  /** Holy damage done %, multiplicative (Vengeance, paladin.md#retribution-tree). */
  holy?: number
  /** Flat Holy damage the target takes (Judgement of the Crusader, paladin.md). */
  holyTaken?: number
  /**
   * Auras in the same group exclude each other: putting one up ends the others (one seal per
   * paladin, one judgement debuff per paladin on the target; paladin.md#seals).
   */
  group?: string
  /**
   * The id of an aura that outranks it (`AuraSpec.yieldsTo`): while that one is up this one doesn't
   * go up, and that one going up ends it (Power Infusion yields to Arcane Power, a [?] placeholder (D24), buffs doc §1.1
   * "Power Infusion"). Absent, or an aura not in the plan: none.
   */
  yieldsTo?: string
  /**
   * Debuffs the player keeps on the boss, as auras (Faerie Fire, druid.md §3.8; warrior.md §5.4, §7
   * "Debuffs on the boss"), per stack, absent = 0: armor removed (Faerie Fire's 505, Sunder Armor's
   * 450), attack-speed slow % (Thunder Clap 20; the strongest active one counts, with the Buffs
   * tab's) and attack power (Demoralizing Shout −204).
   */
  targetArmor?: number
  bossSlow?: number
  bossAp?: number
  /**
   * Item-armor %, added to the other item-armor bonuses while it's up (Enrage −16 in Dire Bear
   * Form, druid.md §4.5 [?]); absent = 0.
   */
  itemArmorPct?: number
  /** Energy regeneration %, multiplicative (Adrenaline Rush +100%, docs/classes/rogue.md §3.7); absent = 0. */
  energyRegen?: number
  /** The rogue's poisons' damage % and apply chance in points while it's up (Venom, rogue.md §4.4); absent = 0. */
  poisonDamage?: number
  poisonChance?: number
  /** Your bleeds' ticks deal this % more while it's up, read at each tick (Hemorrhage's +15% Rupture, rogue.md §3.9); absent = 0. */
  bleedDamage?: number
  // --- The caster core (docs/mechanics/spells.md §5, §8, §9). All optional, absent = 0. ---
  /**
   * The spell schools (a `schoolBit` mask) its school mods cover, per stack: your damage with them
   * % (Power Infusion's +20), snapshotted by a DoT as it lands; the boss's damage taken from them %,
   * read at each hit and each DoT tick (a debuff you keep up: Curse of the Elements, or Forever's
   * Fire Vulnerability and Shadow Weaving, which count only your damage, the only damage the sim
   * deals); and your spell crit with them % (Winter's Chill). The damage and taken % multiply
   * across auras, and add across one aura's stacks; the crit adds (docs/mechanics/spells.md §9).
   */
  schoolMask?: number
  schoolDamage?: number
  schoolTaken?: number
  schoolCrit?: number
  /** Casting speed %, multiplicative, for the abilities whose cast time haste shortens (`castHasted`). */
  castHaste?: number
  /** Spell damage, all schools, per stack (a trinket's: Talisman of Ephemeral Power; docs/mechanics/spells.md §5). */
  spellDamage?: number
  /** Spell damage %, every school's, multiplicative (Forever's Blood Fury: +10%; docs/classes/warlock.md#72-race). */
  spellDamagePct?: number
  /**
   * Mana hooks for the class slices (docs/mechanics/spells.md §8): Spirit regeneration % more
   * (Innervate), and the % of it that goes on inside the five-second rule, added to the plan's share.
   */
  spiritRegen?: number
  castingRegen?: number
  // --- The mage's (docs/classes/mage.md). All optional, absent = none. ---
  /** Only crits of these schools (a `schoolBit` mask) use its crit charges (Combustion's Fire). */
  critChargeSchools?: number
  /** A refresh that adds a stack keeps its charges (Combustion's stacks). */
  refreshKeepsCharges?: boolean
  /** The mana cost of mana abilities %, per stack, multiplicative (Arcane Power's +30%). */
  manaCostPct?: number
  /**
   * The global cooldown % shorter while it's up, for the abilities marked `gcdCut`, multiplied across
   * auras: Nature's Grace's −10% (docs/classes/druid.md §11.3). Absent = 0.
   */
  gcdPct?: number
  // --- The ranged and pet core's (docs/mechanics/ranged-and-pets.md §3, §8). All optional, absent = 0. ---
  /** Ranged attack power, per stack (an Aimed-Shot-style buff; Blood Fury's ranged half is `rapPct`). */
  rap?: number
  /** Ranged attack power %, multiplicative (Forever's Blood Fury, aura 167). */
  rapPct?: number
  /** Ranged attack speed %, multiplicative, from the next Auto Shot (Rapid Fire, Quick Shots, Berserking's ranged part). */
  rangedHaste?: number
  /**
   * What it does to the pet (`Plan.pet`), per stack, while it's up: attack power, melee crit %,
   * attack speed % (multiplicative), and all its damage % (multiplicative). An aura on the pet
   * (Bestial Wrath, Frenzy) has only these; an owner's buff that reaches the pet too (Ferocious
   * Inspiration) has both.
   */
  petAp?: number
  petCrit?: number
  petHaste?: number
  petDamage?: number
}

export interface ProcPlan {
  id: string
  name: string
  trigger: number
  /** Chance per trigger as a fraction, per hand [main, off]; for non-weapon triggers index 0. */
  chance: [number, number]
  /** Bit mask of hands that can trigger it (1 = main, 2 = off). */
  hands: number
  icdMs: number
  action: number
  /** extraAttacks: count; rage: tenths; aura: aura index; weaponBleed: ticks. */
  amount: number
  /** extraAttacks: bonus AP; spellDamage: min; weaponBleed: share; healthDrain: damage per proc. */
  a: number
  /** spellDamage: max; weaponBleed: tick period in ms. */
  b: number
  /** spellDamage: school code (`SCHOOL`: 0 fire, 1 frost, 2 shadow, 3 nature, 4 arcane, 5 holy). */
  school: number
  /** petSpellDamage: the share of your spell damage of its school it adds (Demonic Brand's 0.078). Absent on every other proc. */
  spCoefficient?: number
  /**
   * spellDamage, stackingDot: the share of your attack power each hit or each stack's tick adds, with
   * the poison's damage bonus in it (Vile Poisons; the rogue's poisons, docs/classes/rogue.md §4.1,
   * §4.2). Absent when there's none, so every other plan's JSON is unchanged.
   */
  apCoefficient?: number
  /** Breakdown row for what it does, or −1. */
  source: number
  /** Chain bit for extra-attack procs (damage-and-timing §5.4), 0 otherwise. */
  chainBit: number
  /**
   * Rolled only while this plan aura is up (Bloodthrill: your Rend on the target, warrior.md §2.8);
   * absent or −1 for none.
   */
  requiresAura?: number
  /**
   * A PPM proc's rate (damage-and-timing §5.1), kept so a shapeshift can re-resolve its main-hand
   * chance from the new form's swing speed (druid.md §2.1); absent for flat chances.
   */
  ppm?: number
  /**
   * Bit mask of the plan's forms (1 << index into `Plan.forms`) it can be rolled in (Primal Fury's
   * rage: bear only, druid.md §4.8); absent or 0 for any form.
   */
  forms?: number
  // --- The rogue's poisons (docs/classes/rogue.md §4). Absent on every other proc. ---
  /** A poison: auras' poison chance and damage mods apply to it (Venom, rogue.md §4.4). */
  poison?: boolean
  /** `stackingDot`: how long it lasts after its last application, ms, and whether its ticks may crit (the spell's flag, in a profile whose periodic effects crit). */
  durationMs?: number
  periodicCanCrit?: boolean
  /**
   * On the spell triggers (`spellLanded`, `spellCrit`, `spellTick`): only spells of these schools (a
   * `schoolBit` mask; Shadow Weaving's Shadow), or only the spell on this breakdown row (Improved
   * Scorch's Scorch). Absent or 0 / −1: any (docs/mechanics/spells.md §10).
   */
  schools?: number
  fromSource?: number
  /**
   * It can proc from procs (its aura's SpellMisc Attr3 0x4000000, "Can Proc From Procs"): a triggered
   * spell without NOT_A_PROC, which fires no other procs (`SpellDef.triggersProcs` false), still fires
   * it, unless the spell is a periodic aura's tick (Vengeance from Seal of Righteousness's and Seal of
   * Fury's procs, not Consecration's ticks; paladin.md#retribution-tree) [?].
   */
  fromProcs?: boolean
  /**
   * On the spell triggers: its rate per minute of casting, instead of `chance`: each landed spell's
   * chance is this × its ability's cast time (`SpellPlan.procCastMs`, at least the GCD) / 60,000 (Omen
   * of Clarity's spells [?], docs/classes/druid.md §11.3). Absent or 0: `chance`.
   */
  ppmCast?: number
}

export interface SourcePlan {
  id: string
  name: string
  icon: string
  /**
   * A bleed's row (Rend, Deep Wounds): its casts, misses, dodges and parries count applications,
   * its hits and crits count ticks. Whether the ticks can crit and an application can be avoided.
   */
  bleed?: { ticksCanCrit: boolean; avoidable: boolean }
  /**
   * It can neither crit nor be avoided (Holy Shield's block damage, Retribution Aura's: they always
   * land and never crit, paladin.md#other-abilities), so its breakdown row shows no such shares.
   */
  certain?: true
  /** What its casts count, for its breakdown row: the blocks that dealt it (Holy Shield), or extra attacks (Reckoning). */
  counts?: 'blocks' | 'extraAttacks'
  /** A spell cast on the boss (Faerie Fire, Demoralizing Roar): it can't crit, and it can only miss (or be resisted). */
  spell?: boolean
  /** A consumable the rotation uses (a potion, a rune): its breakdown row counts uses, not casts (docs/ux.md#results "Breakdown"). */
  consumable?: true
  /**
   * What one of its landings is, on the row of an ability whose ticks cast a spell onto that same
   * row (`AbilityPlan.tickSpell`): a tick (Consecration) or a missile (Arcane Missiles). Its
   * breakdown row counts casts, and its average is per landing (docs/ux.md#results "Breakdown").
   */
  landing?: 'tick' | 'missile'
  /**
   * The pet's name, on a row of the pet's damage (its melee, its abilities): the results label the
   * row with it, and the damage counts toward your DPS but makes none of your threat
   * (docs/mechanics/ranged-and-pets.md §10).
   */
  pet?: string
}

/**
 * An active ability, as data. The engine resolves every ability with one switch on `kind`, so a
 * new ability adds a row, not a code path. Numbers come from src/data/client/spells.json (doc
 * fallback), per ability in classes/warrior/abilities.ts.
 */
export interface AbilityPlan {
  id: string
  name: string
  icon: string
  /** Breakdown row. */
  source: number
  /**
   * How it rolls (docs/mechanics/combat-tables.md#3-special-yellow-attacks):
   * `weaponStrike`: one roll over miss, dodge, parry, block, crit (every special except the
   * melee spells: Whirlwind, Mortal Strike, Hamstring, …);
   * `meleeSpell`: roll 1 for miss, dodge, parry, block, roll 2 for crit (Bloodthirst, Execute,
   * Shield Slam, Revenge);
   * `onNextSwing`: queued off the GCD, replaces the next main-hand swing and rolls like a
   * `weaponStrike` (Heroic Strike, Cleave; warrior.md §2.4);
   * `cast`: no attack: it puts `aura` on the warrior and grants its rage (Battle Shout,
   * Bloodrage, Death Wish, Recklessness, Berserker Rage, racial cooldowns, on-use items and
   * consumables; warrior.md §3.2, §2.9, §5.2). The damage fields are unused;
   * `bleed`: one roll for miss, dodge and parry and no crit; if it lands it puts its bleed on the
   * target (`dotTicks` ticks of `dotTickDamage`) and `aura` marks it there (Rend, warrior.md
   * §3.1; damage-and-timing §4). The direct-damage fields are unused;
   * `shift`: no attack: a druid's shapeshift into form `shiftTo`, with the form's entry rules for
   * Energy and rage (Furor, druid.md §2.8). The damage fields are unused;
   * `spell`: casts its plan spell (`spell`), which rolls on the table its damage class picks and
   * deals the spell's damage (the paladin's abilities, paladin.md#conventions-used-below). It rolls
   * nothing itself, and its own damage fields are unused;
   * `spellTable`: a warrior ability of the client's `DefenseType` Magic (Thunder Clap, Demoralizing
   * Shout): roll 1 over the spell table's miss (combat-tables §9), so it can't be dodged, parried or
   * blocked, and a miss refunds as a melee special's; roll 2 for crit at the main hand's special crit,
   * × its own crit multiplier (warrior.md §7 "Spell-table abilities" [?]). Its damage and threat are
   * its own fields, as a special's, and one that deals none never crits;
   * `channel` (the caster core, docs/mechanics/spells.md §6): pays, starts its GCD and cooldown, and
   * holds the GCD (and with `castHoldsOffGcd` everything else) while it channels. Its `spell`, if
   * any, is cast at the start: a miss ends the channel there, and its periodic part is the channel's
   * ticks (Mind Flay, Drain Soul). Otherwise its `tickSpell` is cast every `rageTickMs`, `rageTicks`
   * times (Arcane Missiles): the cast ticks' fields, not the bleed's `dotTicks` (§12's note).
   * `channelTicks` cuts it off after that many ticks, and its `aura` with them.
   * A `weaponStrike`, `meleeSpell` or `spellTable` with an `aura` puts it on the target when it lands
   * (Sunder Armor's stacks, Thunder Clap's slow, Demoralizing Shout's attack power; warrior.md §7).
   */
  kind: 'weaponStrike' | 'meleeSpell' | 'onNextSwing' | 'cast' | 'bleed' | 'shift' | 'spell' | 'spellTable' | 'channel'
  /** Rage cost in tenths after the build's talent reductions (warrior.md §2.3 "Cost reductions"). */
  costTenths: number
  cooldownMs: number
  /** 0 = off the GCD (damage-and-timing §3.5). */
  gcdMs: number
  /**
   * Cast time in ms, 0 for an instant (Slam: 1500 − 250 per Improved Slam rank, warrior.md §3.1).
   * The GCD starts with the cast, and no GCD ability starts before it completes; off-GCD lines
   * still act. When it completes the ability pays its cost (it fails with too little rage then),
   * starts its cooldown and strikes (warrior.md §7).
   */
  castMs: number
  /**
   * No white swings during the cast, and both swing timers restart from full when it completes
   * (Slam without Improved Slam; damage-and-timing §3.3). Otherwise the timers are untouched.
   */
  castStopsSwings: boolean
  /**
   * Nothing else is used during the cast, off-GCD lines included: a paladin's spell cast (Hammer of
   * Wrath without Instrument of Law holds Judgement, paladin.md#other-abilities [?]). Absent: off-GCD
   * lines still act (Slam's Heroic Strike, warrior.md §7).
   */
  castHoldsOffGcd?: boolean
  /** Needs a two-handed weapon (Spearing Strike, warrior.md §3.1): never used with one-handers. */
  twoHandOnly: boolean
  /** Needs a shield (Shield Slam, Shield Block; warrior.md §3.1, §3.2): never used without one. Absent = no. */
  shieldOnly?: boolean
  /**
   * Can't be dodged, parried or blocked (Overpower, warrior.md §3.1): its one roll is miss, then
   * crit, then hit (combat-tables §3).
   */
  unavoidable: boolean
  /**
   * The plan aura that must be on the warrior for it to be usable, and that using it ends, or −1:
   * the Overpower window a dodge or Bloodthrill opens (warrior.md §2.8, §7).
   */
  window: number
  /** STANCE bits of the stances it can be used in (warrior.md §3.1 "Stance"); STANCE_ANY for any. */
  stances: number
  /** Usable only in the execute phase, at or below the target's execute health (Execute; encounter §3). */
  executePhaseOnly: boolean
  /**
   * Weapon damage share (0 = not weapon-based), and whether its AP bonus uses the normalized
   * speed (damage-and-timing §2.2). Weapon-based damage is (roll + flat weapon damage + AP/14 ×
   * speed + `flatDamage`) × `weaponPercent` × the hand's multiplier; otherwise it is
   * `flatDamage` + `apCoefficient` × AP (+ `damagePerExtraRage` × rage; damage-and-timing §2.6).
   */
  weaponPercent: number
  normalized: boolean
  flatDamage: number
  /**
   * Not weapon-based: a uniform ± spread on `flatDamage` (Shield Slam 640–670, Revenge 138–168: the
   * client's `Variance`), and a share of the block value added to it (Shield Slam's "increased by
   * your Block Value", 1; warrior.md §3.1, W14, W15). Absent = 0: no draw, nothing added.
   */
  flatSpread?: number
  blockValueCoefficient?: number
  apCoefficient: number
  /**
   * Execute: damage per point of rage left after paying the cost, read when it's cast; a landed
   * hit then spends all the rage (warrior.md §3.1 "Execute details"). 0 for everything else.
   */
  damagePerExtraRage: number
  /** Extra crit % for this ability (Improved Overpower) and its crit multiplier (2.2 with Impale, warrior.md §2.5). */
  bonusCrit: number
  critMultiplier: number
  /** Share of the cost refunded on a miss, dodge or parry (rage.md#rage-refunds-on-avoided-abilities). */
  refundShare: number
  /** Threat = damage × mult + bonus on a landed hit (threat.md#per-ability-threat-at-max-rank). */
  threatMult: number
  threatBonus: number
  /**
   * A share of the attack power at the moment it lands added to its threat bonus: Sunder Armor's
   * "threat generated from Attack Power" (threat.md#warrior, warrior.md Q1). Absent = 0.
   */
  threatApCoefficient?: number
  /**
   * Breakdown row of a second strike with the off hand, or −1: Raging Blows' off-hand Whirlwind
   * (warrior.md §3.1). It rolls the off hand's special table and deals the weapon damage at the
   * off hand's speed and hand multiplier; it costs nothing more and refunds nothing.
   */
  offHandSource: number
  /**
   * `cast`: the plan aura it puts on the warrior, or −1 (Death Wish, Recklessness, Blood Fury, …).
   * `bleed`: the plan aura that marks the bleed on the target, with no stat mods: up from the
   * application until its last tick, so rotation conditions can read it, as Bloodthrill's proc
   * will (Rend).
   * `spell`: the plan aura it puts on the player when its spell lands (Iron Creed's −10% damage
   * taken after Holy Strike, paladin.md#protection-tree), or its DoT's marker on the boss.
   * `channel`: its DoT's marker, or else a plan aura on the player while it channels, which ends
   * with the channel, cut off or not (Evocation's regeneration, docs/mechanics/spells.md §6, §8).
   */
  aura: number
  /**
   * `bleed`: damage per tick before physical damage modifiers, after the ability's own talents
   * (Rend: 21 × Improved Rend's 1.12 / 1.23 / 1.35, W13), and `dotTicks` ticks every `dotTickMs`
   * from the application. The ticks ignore armor, never miss, and snapshot the caster's
   * multipliers and crit chance at the application (damage-and-timing §4).
   */
  dotTickDamage: number
  dotTicks: number
  dotTickMs: number
  /**
   * `bleed`: this share of the attack power as each tick lands, added to `dotTickDamage` and under
   * the same snapshotted multipliers (Rend's 0.02 in `forever` [?], × Improved Rend's factor,
   * warrior.md §3.1, W13). Absent: none.
   */
  dotTickApCoefficient?: number
  /**
   * `bleed`: the spell's periodic-crit flag (SpellMisc Attributes[8] 0x200). Its ticks may crit
   * only in a profile whose periodic effects can crit (`forever`), at `critMultiplier`
   * (damage-and-timing §2.5, §4).
   */
  periodicCanCrit: boolean
  /**
   * `cast`: rage in tenths, `rageTenths` at once and then `rageTicks` ticks of `rageTickTenths`
   * every `rageTickMs` from the cast (Bloodrage: 100, then 10 × 10 every 1000 ms; warrior.md
   * §2.3). These are energizes: capped at max rage, with 5 threat per rage gained
   * (rage.md#rage-pool-cap-and-decay, threat.md#threat-from-healing-power-gains-and-buffs).
   */
  rageTenths: number
  /**
   * `cast`: a random extra of 0 to this many tenths on the rage at once, a whole number drawn
   * uniformly from the proc stream (Mighty Rage Potion: 450 + 0…300, warrior.md §5.2 row 16).
   */
  rageSpreadTenths: number
  rageTickTenths: number
  rageTicks: number
  rageTickMs: number
  /** Uses per fight, then never again (Mighty Rage Potion: once, warrior.md §5.2 row 16); 0 = no limit. */
  usesPerFight: number
  // --- Druid resources and forms (docs/classes/druid.md §2). All optional: a row without them is
  // a rage ability usable in any form, as every warrior row is. ---
  /**
   * The pool `costTenths` is paid from, refunds go back to, a `cast`'s `rageTenths` and ticks go to,
   * and `damagePerExtraRage` reads and a landed hit then spends (Ferocious Bite's Energy, druid.md
   * §3.5; the paladin's mana, paladin.md#mana-model). All pools are in tenths. Absent: rage.
   */
  resource?: 'rage' | 'energy' | 'mana'
  /** Bit mask of the plan's forms (1 << index into `Plan.forms`) it can be used in; absent or 0: any. */
  forms?: number
  /** Combo points it awards when it lands (a cat builder: 1, druid.md §2.5). */
  comboPoints?: number
  /** Chance of one more combo point on a non-periodic crit (Primal Fury: 0.5 per rank, druid.md §2.5). */
  critComboPointChance?: number
  /**
   * A finisher (Rip, Ferocious Bite, druid.md §2.5): usable only with a combo point, and a landed hit
   * spends them all; a miss, dodge or parry keeps them.
   */
  finisher?: boolean
  /** Damage per combo point spent, and attack-power coefficient per combo point (Ferocious Bite, druid.md §3.5). */
  damagePerComboPoint?: number
  apCoefficientPerComboPoint?: number
  /** The most combo points the attack-power terms count (Rip: 4, druid.md §3.4); absent: 5. */
  comboPointApCap?: number
  /**
   * `bleed`: tick damage per combo point, and attack power per combo point per tick, snapshotted at
   * the application (Rip, druid.md §3.4, §2.9).
   */
  dotTickPerComboPoint?: number
  dotApCoefficientPerComboPoint?: number
  /** A Clearcasting charge (`Plan.freeCastAura`) makes it cost nothing, and is used up (druid.md §2.7). */
  clearcastable?: boolean
  /** `shift`: the form it shifts into (an index into `Plan.forms`, druid.md §2.8). */
  shiftTo?: number
  // --- Spells, mana returns and shared cooldowns (the paladin, docs/classes/paladin.md). ---
  /**
   * `spell` (and `cast`): the plan spell it casts on use (Plan.spells), and the one each tick casts
   * (Consecration), or −1 / absent. A `spell` ability rolls nothing itself: its spell does.
   */
  spell?: number
  tickSpell?: number
  /**
   * Mana in tenths it returns, with this chance, when it lands (its spell doesn't miss, or it has
   * none): Sanctified Judgement's share of the judged seal's cost (paladin.md#judgement).
   */
  manaReturnTenths?: number
  manaReturnChance?: number
  /**
   * `cast`: mana in tenths at once, `manaTenths` plus a uniform whole number of tenths from 0 to
   * `manaSpreadTenths`, drawn from the proc stream (Major Mana Potion: 13,500 + 0…9,000,
   * buffs-debuffs-consumables.md §3.5). Capped at the maximum; 0.5 threat per mana on its row.
   * Absent: none.
   */
  manaTenths?: number
  manaSpreadTenths?: number
  /**
   * A cooldown category: using any ability of a category starts the cooldown it was used with on
   * all of them (Holy Strike and Hammer of the Righteous, paladin.md#other-abilities; the
   * judgements of each seal). Absent for none.
   */
  category?: string
  // --- More generic fields the cat's abilities brought (docs/classes/druid.md §3). All optional:
  // absent, a row behaves as before. ---
  /**
   * A uniform extra of 0 to this much damage on top of `flatDamage`, for an ability that isn't
   * weapon-based (Ferocious Bite's 52–112: 52 plus 0–60, druid.md §3.5). Absent or 0: none.
   */
  flatDamageRange?: number
  /**
   * Extra crit chance while a plan aura is up, for this ability only (Berserk's +100% on Shred,
   * Claw and Rake, druid.md §3.7): its direct hit, and its bleed's ticks, which snapshot it.
   */
  auraCrit?: { aura: number; pct: number; consume?: boolean }
  /**
   * Damage % on its direct damage while the target bleeds, from the player's own bleeds or others'
   * (`Plan.fight.othersBleed`): Rend and Tear, druid.md §5.1. Not on periodic ticks.
   */
  bleedingTargetPct?: number
  /** Usable only from behind the target (Shred, druid.md §3.1): from the front it's never used. */
  behindOnly?: boolean
  /**
   * An attack that also lands a bleed (Rake, druid.md §3.3; Lacerate, §4.3): its hit deals its
   * damage, and on a landed hit its `dotTicks` start as a `bleed`'s would, with `aura` as their
   * marker. Their breakdown row, which counts the applications and ticks; absent for a `bleed`,
   * whose row is `source`. A marker with more than one stack makes a stacking bleed (Lacerate): each
   * application adds a stack, restarts the ticks and snapshots them for every stack, and the marker
   * ends with the last tick.
   */
  dotSource?: number
  /**
   * `cast`: it's a spell on the target that rolls spell hit (combat-tables §9); a miss applies
   * nothing (Faerie Fire, druid.md §3.8).
   */
  spellHit?: boolean
  /**
   * `cast`: the ability whose cooldown it ends, with its category's (an index into Plan.abilities):
   * Swift Judgement ends Judgement's (paladin.md#protection-tree). Absent or −1: none.
   */
  endsCooldownOf?: number
  // --- Fields the bear's abilities brought (docs/classes/druid.md §4). All optional: absent, a row
  // behaves as before. ---
  /**
   * `spellTable`: its school (`SCHOOL`), absent for one no resistance applies to. A binary spell of a
   * school the boss resists (not Physical or Holy) is resisted whole at its average resistance,
   * rolled with the hit (combat-tables §9): the bear's Faerie Fire, Nature (druid.md §4.5).
   */
  spellSchool?: number
  /**
   * Weapon share per stack of its own bleed already on the target when it lands (Lacerate's "10%
   * weapon damage per existing application", druid.md §4.3 [?]); with none on it, the attack deals
   * no direct damage and can't crit. Absent or 0: the plain `weaponPercent`.
   */
  weaponPercentPerStack?: number
  /**
   * While this plan aura is up, using it starts no cooldown (Berserk's Primal Bite, druid.md §4.6); a
   * cooldown already running keeps running [?]. Absent or −1: none.
   */
  noCooldownAura?: number
  // --- The shaman's (docs/classes/shaman.md). All optional: absent, a row behaves as before. ---
  /**
   * A plan aura whose stacks each cut this ability's cast time and cost by `stackCastPct` and
   * `stackCostPct` %, and which using it spends: Maelstrom Weapon on Lightning Bolt, 20% a stack at
   * 5/5, so 5 stacks make it instant and free (shaman.md#maelstrom-weapon). The cut is read when the
   * ability is used, and the stacks go then [?].
   */
  stackAura?: number
  stackCastPct?: number
  stackCostPct?: number
  /** A plan aura put on the player when it's used, beside its own `aura` (Improved Stormstrike's regeneration, shaman.md). */
  selfAura?: number
  // --- What the rogue brought (docs/classes/rogue.md §8). All optional: absent, a row behaves as
  // before. ---
  /**
   * A `cast` finisher's aura lasts this much longer per combo point it spends (Slice and Dice:
   * 6 s + 3 s per point, × 1.45 with Improved Slice and Dice 3/3), and a `bleed` finisher gets this
   * many more ticks per point (Rupture: 3 + 1 per point).
   */
  auraMsPerComboPoint?: number
  dotTicksPerComboPoint?: number
  /**
   * A finisher that lands (or a `cast` finisher) restores `finisherEnergyTenths` Energy with this
   * chance per combo point it spent (Relentless Strikes: 20% per point, 25 Energy), and adds a combo
   * point with `finisherComboPointChance` once it has spent them (Ruthlessness: 20% per rank).
   */
  finisherEnergyChancePerCp?: number
  finisherEnergyTenths?: number
  finisherComboPointChance?: number
  /** A landed builder's chance of one more combo point, crit or not (Puncturing Wounds on Backstab: 15% per rank). */
  bonusComboPointChance?: number
  /** A finisher that spends 5 combo points gets this many back (Improved Expose Armor: 1 per rank). */
  comboPointsBackAtFive?: number
  /** Damage % on its direct damage while the target has a lasting poison on it (Mutilate: +20%). */
  poisonedTargetPct?: number
  // --- What Subtlety brought (docs/classes/rogue.md §8). All optional: absent, a row behaves as
  // before. ---
  /**
   * Damage % on its direct damage once the target is below `lowHealthBelowPct`% health, from
   * t = floor(L × (1 − that/100)), the execute phase's rule (Quietus: +10% below 35%, rogue.md §5.3).
   */
  lowHealthPct?: number
  lowHealthBelowPct?: number
  /** `bleed`: each of its ticks puts this plan aura up, a stack more each (Thousand Cuts, rogue.md §5.3), or −1. */
  tickAura?: number
  /**
   * While this plan aura is up it costs `costPerStackTenths` less per stack, and using it takes the
   * aura down (Thousand Cuts on Backstab and Hemorrhage: 3 Energy per stack), or −1.
   */
  costAura?: number
  costPerStackTenths?: number
  /** A landed hit puts this plan aura up with this chance (Cutthroat's Ambush window on Backstab, rogue.md §5.3), or −1. */
  opensAura?: number
  opensAuraChance?: number
  // --- The caster core (docs/mechanics/spells.md §4, §6). All optional: absent, a row behaves as before. ---
  /**
   * Casting speed shortens its cast time: `castMs` ÷ the casting-speed multiplier, rounded to a
   * whole ms (docs/mechanics/spells.md §4). Absent: its cast time is fixed (Slam, Hammer of Wrath).
   */
  castHasted?: boolean
  /** `channel`: it's cut off after this many ticks (docs/mechanics/spells.md §6); absent or 0: all of them. */
  channelTicks?: number
  // --- The mage's (docs/classes/mage.md). All optional: absent, a row behaves as before. ---
  /**
   * While this plan aura is up, its cast is instant, and using it uses the aura up: Presence of Mind
   * (docs/classes/mage.md#presence-of-mind). Absent or −1: none.
   */
  instantAura?: number
  /**
   * Its cooldown starts when its `aura` ends, not when it's used (Combustion's, docs/classes/mage.md#combustion):
   * it isn't ready while the aura is up.
   */
  cooldownAfterAura?: boolean
  // --- The warlock's (docs/classes/warlock.md §8). All optional: absent, a row behaves as before. ---
  /**
   * Usable only while this plan aura is up, which using it doesn't end (Conflagrate needs your
   * Immolate on the target): the engine checks it first on each of its lines. Absent or −1: none.
   */
  needsAura?: number
  /**
   * When its spell lands it ends this plan spell's DoT, ticks and marker, with `consumeChance`
   * (Conflagrate consumes Immolate, unless Shadow and Flame's chance keeps it). Absent or −1: none.
   */
  consumesDot?: number
  consumeChance?: number
  /** Its mana and power gains make no threat (Life Tap, Demonic Sacrifice's Fel Energy; warlock.md §3). Absent: they make an energize's. */
  noThreat?: boolean
  // --- What the Balance druid brought (docs/classes/druid.md §11). All optional: absent, a row behaves
  // as before. ---
  /** The auras' `gcdPct` shortens its GCD (Nature's Grace's class mask: the Balance spells, §11.3). */
  gcdCut?: boolean
  /**
   * While this plan aura has a stack, its cast time is `chargeCastMs` shorter, before casting speed,
   * and using it takes one stack off (Eclipse's charges on Starfire, §11.3 [?]). Absent or −1: none.
   */
  chargeAura?: number
  chargeCastMs?: number
  // --- The ranged and pet core's (docs/mechanics/ranged-and-pets.md §4, §5). All optional. ---
  /**
   * Ranged haste shortens its cast time (Aimed Shot's, Multi-Shot's): `castMs` ÷ the current ranged
   * attack speed multiplier, to a whole ms [?]. Its cast pauses Auto Shot as every cast does (§4).
   */
  castRangedHasted?: boolean
  /** It needs a ranged weapon (a shot): never used without `Plan.ranged`. */
  needsRanged?: boolean
  // --- The Demonology warlock's (docs/classes/warlock.md §11). Optional: absent, a row behaves as before. ---
  /**
   * `cast`: power in tenths it gives the pet at once, capped at the pet's maximum (Demonic Energies:
   * the demon gains the mana your Life Tap gives, §11.3). Absent, 0 or without a pet with power: none.
   */
  petPowerTenths?: number
  /**
   * What Gnome Eureka! does to it (`Plan.eureka`), bits: 1 its cost, 2 its direct damage, 4 its DoT's
   * or bleed's snapshot (src/sim/classes/eureka.ts). Absent or 0: nothing, and it spends no charge.
   */
  eureka?: number
}

/**
 * An ability before the plan gives it breakdown rows and resolves its aura and target. `offHand`
 * asks for a second strike with the off hand (Raging Blows' Whirlwind, warrior.md §3.1); `aura`
 * is the buff a `cast` puts on the warrior, or a bleed's marker on the target, which the plan adds
 * to its auras; `vsCreature` is a different weapon share against some creature types (Spearing
 * Strike), which the plan resolves against the encounter's creature type (encounter §6).
 */
export type AbilityDef = Omit<
  AbilityPlan,
  | 'source'
  | 'offHandSource'
  | 'aura'
  | 'window'
  | 'spell'
  | 'tickSpell'
  | 'auraCrit'
  | 'dotSource'
  | 'noCooldownAura'
  | 'tickAura'
  | 'costAura'
  | 'costPerStackTenths'
  | 'opensAura'
  | 'opensAuraChance'
  | 'instantAura'
  | 'needsAura'
  | 'consumesDot'
  | 'consumeChance'
  | 'chargeAura'
> & {
  /** The id of the aura that makes its cast instant (Presence of Mind, docs/classes/mage.md): resolved into `instantAura`, left out if no ability or proc puts it up. */
  instantAuraId?: string
  offHand: boolean
  aura: AuraSpec | null
  /** The spell it casts on use, and on each tick (paladin abilities); the plan adds them to Plan.spells. */
  spellDef?: SpellDef
  tickSpellDef?: SpellDef
  /** What each of `tickSpellDef`'s landings is called in the breakdown's average: a missile (Arcane Missiles); absent, a tick (Consecration). */
  tickNoun?: 'missile'
  vsCreature?: { types: readonly CreatureType[]; weaponPercent: number }
  /** The reactive window it needs and ends (the Overpower window, warrior.md §2.8); the plan adds it to its auras. */
  window?: AuraSpec
  /**
   * Extra crit while the aura with this id is up (Berserk's, druid.md §3.7); the plan resolves the
   * id once every ability's aura is in, and drops it if no ability puts that aura up. With `consume`,
   * the ability uses the aura up when it lands (Cold Blood, docs/classes/rogue.md §3.8).
   */
  auraCrit?: { aura: string; pct: number; consume?: boolean }
  /**
   * The id of the aura while which it starts no cooldown (Berserk's Primal Bite, druid.md §4.6), resolved
   * and dropped the same way.
   */
  noCooldownWhile?: string
  /**
   * The aura (by id) whose stacks cut its cast time and cost (Maelstrom Weapon, shaman.md): the plan
   * resolves it into `stackAura`, and leaves it out if no proc puts that aura up.
   */
  stackAuraId?: string
  /** An aura it puts on the player when used (Improved Stormstrike's, shaman.md): the plan adds it to its auras as `selfAura`. */
  selfAuraSpec?: AuraSpec
  /** The aura, by id, it needs up (Conflagrate: Immolate's marker); the plan resolves it into `needsAura`, and drops the ability's lines without it. */
  needsAuraId?: string
  /** The spell, by id, whose DoT it ends when it lands, with this chance (Conflagrate's Immolate); resolved into `consumesDot`. */
  consumesDotOf?: { spell: string; chance: number }
  /** `bleed`: the aura each tick puts up (Thousand Cuts, rogue.md §5.3); the plan adds it to its auras. */
  tickAuraSpec?: AuraSpec
  /** The aura, by id, whose stacks make it cheaper and that using it takes down (Thousand Cuts); resolved and dropped as `auraCrit`. */
  costStacks?: { aura: string; tenthsPerStack: number }
  /** The aura a landed hit puts up with `chance` (Cutthroat's Ambush window, rogue.md §5.3); the plan adds it to its auras. */
  opensWindow?: { aura: AuraSpec; chance: number }
  /** The aura, by id, whose stacks shorten its cast (Eclipse, docs/classes/druid.md §11.3): resolved into `chargeAura`, and dropped as `auraCrit`. */
  chargeAuraId?: string
}

/** An ability's weapon share against the encounter's creature type (Spearing Strike ×3 vs Giants and Dragonkin, warrior.md §3.1). */
export const weaponPercentVs = (def: AbilityDef, creatureType: CreatureType): number =>
  def.vsCreature && def.vsCreature.types.includes(creatureType) ? def.vsCreature.weaponPercent : def.weaponPercent

/** Rotation condition codes (docs/classes/warrior.md#51-conventions-for-rotation-settings). */
export const COND = {
  /** rage ≥ a (tenths) */
  minRage: 0,
  /** ability a has at least b ms of cooldown left */
  cooldownAtLeast: 1,
  /** GCD-safe: every ability in bit mask a has at least b ms (one GCD) of cooldown left */
  gcdSafe: 2,
  /** aura a is down (a = −1: always true) */
  auraDown: 3,
  /**
   * a = 1: in the execute phase; a = 0: not in it (encounter §3, warrior.md §5.1). The engine
   * resolves it up front into one priority list per phase rather than checking it per walk.
   */
  executePhase: 4,
  /** attack power ≥ a */
  apAtLeast: 5,
  /** attack power < a */
  apBelow: 6,
  /** rage ≤ a (tenths): Bloodrage and Berserker Rage wait so their rage isn't lost at the cap (warrior.md §5.2) */
  maxRage: 7,
  /**
   * the fight has at most a ms left (each fight's drawn length is known; encounter §3). Like the
   * phase, the engine resolves it up front: into a window of times per line for each fight, and
   * a wake-up of the rotation when it becomes true.
   */
  timeLeftAtMost: 8,
  /** the fight has at least a ms left (resolved the same way; it only becomes false, so no wake-up) */
  timeLeftAtLeast: 9,
  /**
   * the aura that ability a puts on the warrior is up (the racial synced with Death Wish, warrior.md
   * §5.2); for a bleed, its bleed is on the target (Rend)
   */
  abilityAuraUp: 10,
  /**
   * the aura that ability a puts on the warrior is down, or has at most b ms left and would end
   * before the fight does (Battle Shout's upkeep, warrior.md §5.2 row 1); for a bleed, its bleed
   * is missing from the target or has at most b ms of ticks left ("Rend missing or under x s").
   * Like the time-left conditions, the engine resolves it into the line's window of times, moved
   * whenever the aura starts or ends, and wakes the rotation when the window opens.
   */
  abilityAuraRefresh: 11,
  /**
   * aura a (an ability's window) is up. The engine puts it first on every line of an ability with a
   * window (the Overpower window, warrior.md §2.8, §7), so a plan needn't, and lines without one pay
   * nothing for it.
   */
  windowOpen: 12,
  /**
   * the execute phase starts in at most a ms, or has started (encounter §3; Arms Recklessness,
   * warrior.md §5.3 row 4). Never true in a fight without one. Each fight's phase start is known,
   * so the engine resolves it like the time-left conditions: into the line's window of times, with
   * a wake-up of the rotation at `execute start − a`.
   */
  executeWithin: 13,
  /** Energy ≥ a (tenths; druid.md §6.2) */
  minEnergy: 14,
  /** Energy ≤ a (tenths): Tiger's Fury waits so its Energy isn't lost at the cap (druid.md §6.2) */
  maxEnergy: 15,
  /** combo points ≥ a (druid.md §2.5, §6.2) */
  minComboPoints: 16,
  /**
   * the aura that ability a puts up is down: a buff on the player, or a debuff it keeps on the
   * target (a judgement's); for a bleed, or an attack that bleeds, its bleed is off the target (Rake
   * waits while your Rip bleeds, druid.md §6.2). Checked on each walk, so a line may have several,
   * unlike `abilityAuraRefresh`'s one window per line: Seal of the Crusader and Judgement of the
   * Crusader in the Retribution opener (paladin.md#forever-priority-list-default rows 0–2).
   */
  abilityAuraDown: 17,
  /** mana ≥ a, in tenths (paladin.md "mana% ≥ x" settings, as mana at the plan's maximum) */
  minMana: 18,
  /** mana ≤ a, in tenths: a mana potion or rune waits until its most mana fits (paladin.md#forever-priority-list-default) */
  maxMana: 19,
  /**
   * the aura that ability a puts on the target has fewer than b stacks (down counts as none): Sunder
   * Armor's upkeep, "stacks below 5" (warrior.md §5.4 row 10), and Lacerate's (druid.md §6.3)
   */
  abilityAuraStacksBelow: 20,
  // 21–24 are the bear's, 25–28 the Protection paladin's: tracks that merge separately.
  /**
   * the execute phase starts in more than a ms: `executeWithin`'s opposite, always true in a fight
   * without one (Fury's potion with a Recklessness that came by its clock, warrior.md §5.2 row 16).
   * Resolved the same way, into the end of the line's window at `execute start − a`; it only becomes
   * false, so no wake-up.
   */
  executeNotWithin: 29,
  // 30–33 are the Rogue's: tracks that merge separately.
  /**
   * plan aura a is up with at least b stacks: Lightning Bolt waits for 5 Maelstrom Weapon stacks, so
   * it's instant and free (docs/classes/shaman.md#enhancement-priority). Checked on each walk; a
   * stack gained is a decision point, as every aura change is.
   */
  auraStacksAtLeast: 34,
  /**
   * the main hand has swung this fight, white or on-next-swing, from its timer or an extra attack;
   * true without a main hand, which never swings. EZ-Thro Dark Bomb's first throw waits for it, so
   * its cast doesn't cancel the pull's first swing (buffs doc §3.7); later throws ignore the swing
   * timer. The fight's first main-hand swing is a decision point for a plan with such a line.
   */
  mainHandSwung: 35,
  // 30–33 are the rogue's (docs/classes/rogue.md §8).
  /** combo points ≤ a (Premeditation waits for room for its 2, rogue.md §6) */
  maxComboPoints: 30,
  // 35 is mainHandSwung, 36–37 are free for the parallel tracks; 38–41 the caster core's (docs/mechanics/spells.md §11).
  /** aura a is up: a proc's buff a caster spends (Clearcasting, Shadow Trance), or any plan aura */
  auraUp: 38,
  // 42–45 the mage's (docs/classes/mage.md).
  /**
   * plan aura a has fewer than b stacks (down counts as none): Scorch until Improved Scorch's Fire
   * Vulnerability has 5 (docs/classes/mage.md#fire-priority). Checked on each walk.
   */
  auraStacksBelow: 42,
  /**
   * plan aura a is down, or has at most b ms left: Scorch before the Fire Vulnerability runs out
   * (docs/classes/mage.md#fire-priority). Checked on each walk, so a caster, who walks as each cast
   * lands, sees it at its next decision; it schedules no wake-up.
   */
  auraEndsWithin: 43,
  /**
   * plan aura a is down, or runs out before ability b's cast and then this line's own cast would
   * land: at most b's cast time + the line's cast time left, both as they'd start now (casting
   * speed, their stacks' cut, an instant-cast aura). Scorch before a Pyroblast or Fireball that would
   * let Fire Vulnerability run out before the Scorch after it lands (docs/classes/mage.md#fire-priority).
   * Checked on each walk.
   */
  auraEndsBeforeCasts: 44,
  /**
   * ability a's spell DoT has no tick due within b ms after a cast of a started now would land. When
   * one is, the walk waits there until the cast would land with the tick, rather than cut it off:
   * Pyroblast and its own DoT (docs/classes/mage.md#fire-priority). Checked on each walk.
   */
  dotTickWait: 45,
  // 50–53 are the Shadow Priest's (docs/classes/priest.md#8-implementation-notes).
  /**
   * ability a could start now: it's off cooldown and affordable, and a GCD ability's global cooldown
   * is free. Inner Focus waits for Mind Blast this way, so the Mind Blast right after it is the spell
   * that uses its charge (docs/classes/priest.md#6-rotation). Checked on each walk.
   */
  abilityReady: 50,
  // 62–65 the ranged and pet core's (docs/mechanics/ranged-and-pets.md §11).
  /**
   * ability a, started now, completes at least b ms before the next Auto Shot's wind-up begins, so
   * it doesn't delay that shot ("no clipping"): an instant always does. False without a ranged
   * weapon. An Auto Shot is a decision point, so a line waiting for this walks as each one fires.
   */
  autoShotClear: 62,
  /** the last Auto Shot fired at most a ms ago (a shot right after an Auto Shot); false before the first */
  autoShotWithin: 63,
  /** the pet's power (Focus, Energy or mana) ≥ a, in tenths: a pet line keeping Focus for Bite; false without a pet */
  petPowerAtLeast: 64,
  /** the pet's power ≤ a, in tenths; false without a pet */
  petPowerAtMost: 65,
  // 70–73 the Demonology warlock's (docs/classes/warlock.md §11).
  /**
   * the target is at or below a% health: from t = floor(L × (1 − a/100)), the execute phase's rule
   * (Decimation's Soul Fire below 35%, docs/classes/warlock.md §11.3). Checked on each walk; it
   * schedules no wake-up, so it suits a caster, who walks as each cast lands.
   */
  healthAtMost: 70,
} as const

export interface RotationCondition {
  code: number
  a: number
  b: number
}

/**
 * One line of a spec's priority list (warrior.md §5.1). Whenever the warrior can act, the engine
 * uses every line in order whose ability is usable (off cooldown, enough rage, the GCD free if
 * it needs it, the right stance, the execute phase if it needs it) and whose conditions all
 * hold; one GCD ability per decision, plus off-GCD ones. An ability may have several lines
 * (Bloodthirst in and out of the execute phase).
 */
export interface RotationEntry {
  ability: number
  conditions: RotationCondition[]
  /** On-next-swing only: cancel the queue if rage falls below this before the swing (tenths; 0 = never; warrior.md §2.4). */
  unqueueBelowTenths: number
  /**
   * A stance dance (warrior.md §7 "Stance dancing"): when the current stance refuses the ability,
   * swap to this STANCE bit first (if the swap cooldown allows and the rage the swap keeps pays for
   * it), then use it; the engine swaps back to the base stance once the swap cooldown allows.
   * Absent or 0: no dance, so the line waits for a stance that allows the ability.
   */
  danceTo?: number
  /**
   * With `danceTo`: once the line's ability is used, the stance it was used in becomes the base
   * stance for the rest of the fight, so the engine no longer swaps back (Arms Recklessness, which
   * swaps to Berserker Stance and stays; warrior.md §5.3 row 4, §7 "Stance dancing").
   */
  stay?: boolean
}

/**
 * Before the pull (warrior.md §5.2 row 0). Each cast uses an ability of `Plan.abilities` at
 * `atMs` < 0, without paying its cost (its rage came before the pull): its aura starts then, so
 * it has `durationMs + atMs` left at the pull, its cooldown runs from then, its rage at once is
 * there at the pull, and its ticks keep their phase. Then the opener: Charge's rage, and the
 * stance swap that keeps at most `keepTenths`. Pre-pull rage makes no threat.
 */
export interface PrepullPlan {
  /** In time order. */
  casts: { ability: number; atMs: number }[]
  /** Charge's rage at the pull (0 = no Charge). */
  chargeTenths: number
  /** The most rage the stance swap after Charge keeps (−1 = no swap). */
  keepTenths: number
}

export const NO_PREPULL: PrepullPlan = { casts: [], chargeTenths: 0, keepTenths: -1 }

/** The boss's melee on the player (combat-tables §8, encounter.md §5). */
export interface BossSwingPlan {
  /** Between swings, after the Buffs tab's attack-speed slows (damage-and-timing §3.2). */
  speedSec: number
  /**
   * Before any slow, and the Buffs tab's slow as a fraction (Thunder Clap 0.2): a slow the rotation
   * puts on the boss counts instead while it's stronger (warrior.md §7 "Debuffs on the boss").
   */
  unslowedSec: number
  slow: number
  /** Each swing's damage, uniform in [min, max], before the player's mitigation; the Buffs tab's AP debuffs included. */
  minDamage: number
  maxDamage: number
  canCrush: boolean
  /** Parry haste, both ways: on the boss's swing when it parries, and on the tank's when the tank parries (encounter.md §5). */
  parryHaste: boolean
  /** The swings come from in front of the player, so it can dodge, parry and block them (combat-tables §8, "Direction"). */
  front: boolean
}

export interface Plan {
  spec: SpecId
  classId: ClassId
  role: Role
  headline: 'dps' | 'tps'
  profile: RulesProfile
  applyUnmeasured: boolean
  seed: number
  playerLevel: number
  /**
   * STANCE bit the warrior fights in, its base stance (warrior.md §5; Arms: its setting, §5.3), or
   * STANCE_ANY for classes without stances. Stance dances leave it and come back, and a line that
   * stays makes its stance the base for the rest of the fight (warrior.md §7).
   */
  stance: number
  /** What each stance changes relative to the base stance (empty for classes without stances). */
  stances: StancePlan[]
  /**
   * Stance swaps (warrior.md §2.1): the cooldown the three stances share, and the most rage a swap
   * keeps (`forever`: 10 + 3 × Improved Tactical Mastery; `classicEra`: 5 × the rank; rage.md).
   */
  stanceSwap: { cooldownMs: number; keepTenths: number }
  fight: {
    durationMs: number
    /** Fight-length variation as a fraction (encounter §3). */
    variation: number
    /** The execute phase is the last `executePct`% of boss health, from t_exec (encounter §3). */
    executePct: number
    targetLevel: number
    front: boolean
    bossCanDodge: boolean
    bossCanParry: boolean
    bossCanBlock: boolean
    /** Boss armor after debuffs, before the player's own armor penetration. */
    targetArmor: number
    /** Boss melee on the player (tank specs), or null. */
    bossSwing: BossSwingPlan | null
    /**
     * Incoming damage for DPS specs: a hit this size every `damageTakenIntervalMs` (0 = none). The
     * size is before your mitigation, and nothing mitigates it, so it's also the health each hit
     * costs (encounter.md §4).
     */
    damageTakenPerHit: number
    damageTakenIntervalMs: number
    /**
     * Others keep a bleed on the target all fight (a raid's warriors and their Deep Wounds), for
     * abilities that do more to a bleeding target (Rend and Tear, druid.md §5.1, Q9 [?]). Absent: no.
     */
    othersBleed?: boolean
  }
  /** The static stat block; the engine adds aura deltas to it and re-derives. */
  stats: StatBlock
  /** [main hand, off hand]; the off hand is null unless dual wielding. */
  weapons: [WeaponPlan | null, WeaponPlan | null]
  hasShield: boolean
  /**
   * Multiplier on all damage (the base stance, creature-type racials) and on physical damage only
   * (2H spec, Bastion). These, `damageTakenMult` and `threatMult` are the base stance's; `stances`
   * changes them for the others.
   */
  damageMult: number
  physicalMult: number
  damageTakenMult: number
  threatMult: number
  /** Player armor after static sources, for boss hits. */
  armor: number
  rage: {
    maxTenths: number
    /** Rage from damage taken (rage.md#rage-from-damage-taken; `damageTakenRage` in core/formulas.ts). */
    damageTakenModel: DamageTakenRageModel
    /**
     * Max health, which the `forever` and `foreverHealthLost` models divide by. Its base health is
     * a Classic-based stand-in while unmeasured (character-stats OQ-2, D24).
     */
    maxHealth: number
    /**
     * Hits that land on the player can give rage (rage.md#rage-from-damage-taken): true for
     * warriors, and for a druid whose fight can be in Bear Form (its start form or a shapeshift's;
     * rage.md#bear-druid-rage). False for classes without rage. A druid gains it only while in a
     * form whose `FormPlan.rage` is set. Either way, a hit that costs health fires the damage-taken
     * procs.
     */
    fromDamageTaken: boolean
  }
  periodicRage: { periodMs: number; tenths: number; source: number }[]
  auras: AuraPlan[]
  procs: ProcPlan[]
  /** Proc indices per trigger code. */
  triggers: number[][]
  sources: SourcePlan[]
  /** Active abilities and the priority list that uses them (empty for specs without a rotation yet). */
  abilities: AbilityPlan[]
  rotation: RotationEntry[]
  prepull: PrepullPlan
  /**
   * A druid's forms (docs/classes/druid.md §2.1, §2.2, §2.8), or absent for classes without them.
   * The plan's static stats, main hand and threat multiplier are those of `forms[form]`, the form it
   * fights in; a `shift` ability swaps in another's, and the boss's swings then meet its armor and
   * dodge. `armor` and `rage.maxHealth` stay the starting form's (druid.md §2.8).
   */
  forms?: FormPlan[]
  /** The index into `forms` of the form the fight starts in. */
  form?: number
  /** What entering a form does to Energy and rage (druid.md §2.8); absent without forms. */
  shapeshift?: ShapeshiftPlan
  /** Energy (druid.md §2.4): absent for classes without it. */
  energy?: EnergyPlan
  /** Mana and its regeneration (druid.md §2.8, paladin.md#mana-model): absent unless the plan can spend mana. */
  mana?: ManaPlan
  /** The plan aura that makes the next ability with a cost free (Clearcasting, druid.md §2.7), or absent. */
  freeCastAura?: number
  /**
   * Spell crit % the spell that uses `freeCastAura`'s charge gets, its DoT's ticks included (Inner
   * Focus's +25%, docs/classes/priest.md#35-inner-focus-14751). Absent: none (Clearcasting's).
   */
  freeCastCritPct?: number
  /**
   * Gnome Eureka! (src/sim/classes/eureka.ts, docs/mechanics/character-stats.md#racials-that-matter-to-the-sim):
   * its aura, the charges it goes up with, and what it does to the abilities marked `eureka`: their
   * cost −costPct% (rounded down to whole resource), their direct damage +damagePct%, their DoT's or
   * bleed's snapshot +dotPct%. Each use of a marked ability, as it's paid, spends a charge [?].
   */
  eureka?: { aura: number; charges: number; costPct: number; damagePct: number; dotPct: number }
  /** Damaging spells (seal procs, judgements, Holy Strike), indexed by abilities and procs. */
  spells?: SpellPlan[]
  /** Multiplier on Holy damage done, static (paladin.md#conventions-used-below). */
  holyMult?: number
  /** Multiplier on Holy threat, static: Righteous Fury ×1.6 (paladin.md#threat-paladin-specific). */
  holyThreatMult?: number
  /**
   * The boss's flat Holy damage taken all fight, from the Buffs tab: another paladin's Judgement of
   * the Crusader (buffs doc §4.2). Your own judgement's aura adds to it; a paladin that judges the
   * Crusader itself has the Buffs entry as its own (maintained), so the two never count twice.
   */
  holyTaken?: number
  /**
   * The boss's flat physical damage taken all fight, from the Buffs tab: a tank's Gift of Arthas, +8
   * (buffs doc §4.2). Each direct physical hit, yours and your pet's, adds it after your damage
   * multipliers and before the outcome's (a crit doubles it) and the boss's armor; a bleed's or
   * other periodic tick gets none [?] (docs/mechanics/damage-and-timing.md#24-damage-modifier-stacking).
   * Absent: 0.
   */
  physicalTaken?: number
  /**
   * The spell schools' multipliers, crit and the boss's resistance (docs/mechanics/spells.md §5, §9);
   * absent when every school is plain.
   */
  schools?: SchoolPlan
  /** The mage's rolling Ignite (docs/classes/mage.md#ignite), which `ignite` procs feed; absent without it. */
  ignite?: IgnitePlan
  /**
   * The ranged weapon and its Auto Shot (docs/mechanics/ranged-and-pets.md §2–§5): a timer of its
   * own, beside the melee swings. Absent: no ranged attacks, and nothing here runs.
   */
  ranged?: RangedPlan
  /**
   * The pet: a second attacker in the same fight, with its own stats, swing timer, abilities and
   * power (docs/mechanics/ranged-and-pets.md §6–§10). Absent: no pet.
   */
  pet?: PetPlan
}

/**
 * The ranged weapon, as Auto Shot and the shots use it (docs/mechanics/ranged-and-pets.md §2–§5).
 * Its attack power is the stat block's ranged attack power (`StatBlock.baseRap` …).
 */
export interface RangedPlan {
  name: string
  icon: string
  min: number
  max: number
  speedSec: number
  /** Added to each roll: the ammo's DPS × the weapon's speed, and a scope's flat damage (§3). */
  flatDamage: number
  /** Weapon skill with it: 5 × level plus its type's bonuses (§2). */
  skill: number
  /** Hit % and crit % only its attacks get (a scope's, a ranged-only talent's). */
  hitBonus: number
  critBonus: number
  /** Damage % of its attacks, multiplicative (a ranged-weapon talent's); 1 for none. */
  damageMult: number
  /** Static ranged attack speed, a product: the quiver's or ammo pouch's (§4). */
  hasteMult: number
  /** Speed its normalized shots use (§3): 2.8 [?]. */
  normalizedSpeed: number
  /**
   * Auto Shot's wind-up, ms (§4): the last part of each cycle, which a cast or channel in progress
   * holds back until it ends (when `castsHoldAutoShot`); ÷ ranged haste when `windupHasted` [?].
   */
  windupMs: number
  windupHasted: boolean
  /** A cast or channel holds Auto Shot's wind-up back until it ends (Classic Era's clipping, §4) [?]. */
  castsHoldAutoShot: boolean
  /** Auto Shot's crit multiplier (×2, §2). */
  critMultiplier: number
  /** When the first Auto Shot fires, ms from the pull (§4). */
  firstShotMs: number
  /** Auto Shot's breakdown row. */
  source: number
}

/** The pet's power (docs/mechanics/ranged-and-pets.md §7): Focus, Energy or mana, in tenths. */
export interface PetPowerPlan {
  kind: 'focus' | 'energy' | 'mana'
  maxTenths: number
  startTenths: number
  /** Gained every `tickMs`, from the pull's random phase, capped. */
  tickTenths: number
  tickMs: number
}

/**
 * One of the pet's abilities (docs/mechanics/ranged-and-pets.md §7). `melee`: one roll on the pet's
 * special-attack table (miss, dodge, parry and block from the front, crit ×`critMultiplier`), its
 * damage `min…max` + `apCoefficient` × the pet's attack power (+ `weaponPercent` of its swing),
 * against armor. `spell`: the pet's spell table (miss, the school's average resist, then crit),
 * `min…max` + `spCoefficient` × the pet's spell damage.
 */
export interface PetAbilityPlan {
  id: string
  name: string
  icon: string
  /**
   * `melee`: its special table; `spell`: its spell table; `buff`: no target, so no roll, no damage and
   * no `petLanded`: it only puts its aura up (Furious Howl; docs/mechanics/ranged-and-pets.md §7).
   */
  kind: 'melee' | 'spell' | 'buff'
  /** `SCHOOL` code: physical for melee. */
  school: number
  costTenths: number
  cooldownMs: number
  /** The pet's own global cooldown this starts, ms (0: none). */
  gcdMs: number
  /** Cast time, ms (the Imp's Firebolt); its melee swings keep their timer. */
  castMs: number
  min: number
  max: number
  apCoefficient: number
  spCoefficient: number
  /** Share of the pet's white swing it adds (0: none). */
  weaponPercent: number
  bonusCrit: number
  critMultiplier: number
  /** A plan aura it puts up when it lands (a howl's buff on you and the pet), or −1. */
  aura: number
  /** Breakdown row. */
  source: number
}

/** The shares of your stats a pet inherits (docs/mechanics/ranged-and-pets.md §6) [?]. */
export interface PetInheritance {
  /** Of the higher of your attack power and ranged attack power. */
  attackPower: number
  /** Of your spell damage in its spell's school. */
  spellDamage: number
  /** Of your crit: the higher of melee and ranged on its physical attacks, your spell crit on its spells. */
  crit: number
  /** Of your hit: the higher of melee and ranged on its physical attacks, your spell hit on its spells. */
  hit: number
}

/**
 * The pet (docs/mechanics/ranged-and-pets.md §6–§10): its stats as the plan builder derived them,
 * its melee, its abilities and its power. Owner auras reach it through their pet mods
 * (`AuraPlan.petAp` …), and through its shares of your stats, read as they change.
 */
export interface PetPlan {
  id: string
  /** Its name for the results' rows (Cat, Imp). */
  name: string
  icon: string
  level: number
  /** Its melee, or null for a pet that only casts (the Imp). */
  weapon: { min: number; max: number; speedSec: number } | null
  /** Weapon skill: 5 × its level (§6). */
  skill: number
  /** Attack power, and melee crit and hit %, from its own stats and the buffs that reach it (§6, §8). */
  ap: number
  crit: number
  /**
   * The part of `crit` from buffs, which the +3 crit suppression reads as a player's aura crit (§6) [?].
   * The crit it inherits from you joins it in the engine: it arrives through an aura too.
   */
  auraCrit: number
  hit: number
  /** Spell damage, spell crit % and spell hit % for its spells (§7). */
  spellDamage: number
  spellCrit: number
  spellHit: number
  /**
   * What it inherits from you, read whenever your stats change (§6, the one rule for every pet) [?]:
   * shares of your higher attack power (melee or ranged), of your spell damage in its spell's school,
   * of your crit (your higher melee or ranged crit on its swings and specials, your spell crit on its
   * spells) and of your hit (the same split). `PET_INHERITANCE` in plan/pet.ts; 0 inherits nothing.
   */
  inherit: PetInheritance
  /** All its damage %, as a product: its family's, happiness's, your talents' (§6). */
  damageMult: number
  /** Static attack speed, a product (1: none). */
  hasteMult: number
  /** Its melee crit multiplier (×2) and whether its white swings glance (§6). */
  critMultiplier: number
  glances: boolean
  glanceLow: number
  glanceHigh: number
  /** It attacks from the front (the boss can parry and block it) or from behind (§6). */
  front: boolean
  /** When it starts attacking, ms from the pull. */
  startMs: number
  power: PetPowerPlan | null
  abilities: PetAbilityPlan[]
  /** Its priority list: each line's ability, used when ready, affordable and its conditions hold (§7). */
  rotation: { ability: number; conditions: RotationCondition[] }[]
  /** Its white swings' breakdown row. */
  source: number
}

/**
 * A pooled, rolling Ignite (docs/classes/mage.md#ignite) [?]: each crit that feeds it adds `pct`% of
 * its damage to the pool of damage still to come and gives it `ticks` ticks from now, the next tick
 * `tickMs` from now unless one is already due (that one keeps its time). Each tick deals the pool ÷
 * the ticks left, × its school's average resist at the tick; the boss's damage taken isn't applied
 * again (the crit carries it). Ticks never miss and never crit.
 */
export interface IgnitePlan {
  pct: number
  ticks: number
  tickMs: number
  /** Its school (`SCHOOL`): Fire. */
  school: number
  /** Breakdown row: its casts count the crits that fed it, its hits the ticks. */
  source: number
  /** The plan aura that marks it on the boss, for its uptime; −1 for none. */
  aura: number
}

/** One druid form (druid.md §2.1, §2.2, §2.3): everything a shapeshift swaps in. */
export interface FormPlan {
  id: 'caster' | 'cat' | 'bear' | 'moonkin'
  name: string
  /** The stat block in the form: the shared one plus the form's own effects and form-bound talents. */
  stats: StatBlock
  /** The main hand in the form: the form's own weapon (cat, bear), the equipped one (caster), or none. */
  mainHand: WeaponPlan | null
  /** The global threat multiplier in the form (the plan's static sources × the form's own, threat.md). */
  threatMult: number
  /**
   * White hits and hits taken give rage in this form: only in bear, whose power is rage (druid.md
   * §2.4, §8 "Rage from hits"; rage.md#bear-druid-rage). Hits taken also need the plan's
   * `rage.fromDamageTaken`, which is set when the fight can be in such a form. An energize adds
   * rage in whatever form it fires in: Furor's and Primal Fury's fire only in bear, so outside it
   * that's Natural Reaction and a potion.
   */
  rage: boolean
}

/** Entering a form (druid.md §2.8, rage.md#bear-druid-rage). */
export interface ShapeshiftPlan {
  /** Indices into `Plan.forms` (−1 when the plan has no such form). */
  caster: number
  cat: number
  bear: number
  /** Furor's rank: the Energy kept on entering cat (core/formulas.ts `furorCatEnergyTenths`). */
  furorRank: number
  /** Rage on entering bear, after rage is set to 0, and its chance (Furor: 10 rage at 20% per rank). */
  bearRageTenths: number
  bearRageChance: number
}

/** Energy (druid.md §2.4), in tenths. */
export interface EnergyPlan {
  maxTenths: number
  /** At the pull. */
  startTenths: number
  /** Gained on every power tick. */
  tickTenths: number
}

/**
 * Mana (druid.md §2.8, paladin.md#mana-model, character-stats.md#spirit-and-mana-regeneration), in
 * tenths: the pool starts full, and every power tick it regains `mp5TickTenths` always, plus the
 * Spirit regen `regenTickTenths` if no mana was spent in the last `fiveSecondRuleMs`, or
 * `inFsrShare` of it if some was.
 */
export interface ManaPlan {
  maxTenths: number
  /** Spirit regeneration per power tick, outside the five-second rule. */
  regenTickTenths: number
  /** How long after spending mana spirit regeneration stops (the five-second rule). */
  fiveSecondRuleMs: number
  /** mp5 per power tick (mp5 × 2/5), inside the five-second rule too (the paladin's gear and buffs); absent: 0. */
  mp5TickTenths?: number
  /** Share of the Spirit regeneration that continues inside the five-second rule (Reverence); absent: 0. */
  inFsrShare?: number
}

/**
 * The fields a caster's `spell` or `channel` ability (an `AbilityDef`) has that it doesn't use,
 * beyond its id, name, icon, kind, costs and timings (docs/mechanics/spells.md §12): the class
 * slices build their rows from this.
 */
export const CASTER_ROW = {
  twoHandOnly: false,
  unavoidable: false,
  stances: STANCE_ANY,
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 0,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: 1.5,
  refundShare: 0,
  threatMult: 0,
  threatBonus: 0,
  dotTickDamage: 0,
  dotTicks: 0,
  dotTickMs: 0,
  periodicCanCrit: false,
  rageTenths: 0,
  rageSpreadTenths: 0,
  rageTickTenths: 0,
  rageTicks: 0,
  rageTickMs: 0,
  usesPerFight: 0,
  castStopsSwings: false,
} as const

/**
 * The player-global power tick (druid.md §2.4; character-stats.md#spirit-and-mana-regeneration):
 * Energy and mana regenerate every this many ms, from a random phase in [0, tick) at the pull [?].
 */
export const POWER_TICK_MS = 2000

/** What the main thread keeps next to the plan: the sheet and assumptions for the result. */
export interface PlanBundle {
  plan: Plan
  sheet: CharacterSheet
  assumptions: Assumption[]
}
