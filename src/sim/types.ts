// The contract between the UI and the engine (docs/architecture.md#data-flow).
//
// SimConfig is plain, versioned JSON: it's what gets saved to localStorage, shared by URL and
// posted to workers. The engine declares everything the UI renders generically (specs,
// rotation options, buffs, enchants), so the UI never hard-codes game rules.
import type { PreRaidBisSpec } from '@/data/items/types'
import type { ClassSlug } from '@/data/races/types'

export type SpecId = PreRaidBisSpec
export type ClassId = 'warrior' | 'druid' | 'paladin' | 'shaman' | 'rogue' | 'mage' | 'warlock' | 'priest' | 'hunter'
export type Role = 'dps' | 'tank'

/** Paper-doll slots. Rings and trinkets have two each. */
export type GearSlot =
  | 'head'
  | 'neck'
  | 'shoulder'
  | 'back'
  | 'chest'
  | 'wrist'
  | 'hands'
  | 'waist'
  | 'legs'
  | 'feet'
  | 'finger1'
  | 'finger2'
  | 'trinket1'
  | 'trinket2'
  | 'mainHand'
  | 'offHand'
  | 'ranged'
  /** A ranged weapon's arrows or bullets, and a quiver or ammo pouch (docs/mechanics/ranged-and-pets.md §1). */
  | 'ammo'
  | 'quiver'

export interface EquippedItem {
  itemId: number
  /** An EnchantDefinition id, if enchanted. */
  enchantId?: string
}

/** docs/mechanics: rules where Forever and Classic Era disagree live in a profile (D12, architecture). */
export type RuleProfileId = 'forever' | 'classicEra'

export type CreatureType =
  | 'none'
  | 'beast'
  | 'demon'
  | 'dragonkin'
  | 'elemental'
  | 'giant'
  | 'humanoid'
  | 'mechanical'
  | 'undead'

/** Encounter settings (docs/mechanics/encounter.md#encounter-settings owns defaults and ranges). */
export interface FightConfig {
  /** Fight length in seconds. */
  durationSec: number
  /** Each iteration's length varies by up to ± this percentage. */
  durationVariationPct: number
  bossLevel: number
  /** Boss armor before debuffs. */
  bossArmor: number
  /** The execute phase is the last this-many percent of boss health; 0 = none. */
  executePct: number
  /** Extra enemies in range for cleave and AoE abilities (0 = single target). */
  extraTargets: number
  /** DPS attack from behind (no parry or block); tanks from the front. */
  position: 'behind' | 'front'
  creatureType: CreatureType
  /** Forever zone-specific effects (e.g. Hyjal-only flasks). */
  zone: 'hyjal' | 'barrowDeeps' | 'onyxia' | 'other'
  /** Damage per second a DPS player takes, for damage-taken procs (e.g. Forever's Enrage). */
  damageTakenPerSec: number
  /** Boss melee against the player (tank specs). */
  boss: {
    swingSpeedSec: number
    /** Pre-armor damage per swing. */
    damageMin: number
    damageMax: number
    canDodge: boolean
    canParry: boolean
    canBlock: boolean
    parryHaste: boolean
    canCrush: boolean
  }
}

export interface SimConfig {
  /**
   * Bump on breaking changes; normalizeConfig migrates or rejects old versions. 2 since 1.60.1.70009's
   * talent trees: version 1's talent code is on 1.60.1.69913's trees (docs/data/talents.md#tree-versions).
   */
  version: 2
  spec: SpecId
  /** A race id from src/data/races/races.json, legal for the spec's class in Forever. */
  race: string
  /** Build code in the site's format (docs/data/talents.md). */
  talents: string
  gear: Partial<Record<GearSlot, EquippedItem>>
  buffs: {
    /** Classes present in the raid; raid buffs they provide become available. */
    raid: ClassSlug[]
    /** Enabled BuffDefinition ids (raid buffs, target debuffs, consumables). */
    enabled: string[]
  }
  /**
   * Values for the spec's RotationOption ids; missing ids use the option's default for this setup
   * (`rotationValues`).
   */
  rotation: Record<string, RotationValue>
  /**
   * The order of a priority-list spec's rows (`AplDefinition`, decision D31), by row id, stored only
   * while it differs from the spec's default order. Absent: the default order. normalizeConfig drops
   * unknown ids, puts missing rows back at their default place and keeps pinned rows where they are.
   */
  rotationOrder?: string[]
  fight: FightConfig
  rules: {
    profile: RuleProfileId
    /** Decision D12: apply unmeasured Forever ratings (expertise, haste, armor pen) by hypothesis, or ignore them. */
    unmeasuredRatings: 'apply' | 'ignore'
    /**
     * Rage from damage taken (docs/mechanics/rage.md#rage-from-damage-taken). Omitted: the
     * profile's default (`forever` for Forever, `classic` for Classic Era). A setup saved before
     * the models were renamed may still carry a legacy id, which isn't a SimConfig value:
     * normalizeConfig maps it to today's, and so does buildPlan for a config that skipped
     * normalizing (`LEGACY_DAMAGE_TAKEN_RAGE` in rules/profiles.ts).
     */
    damageTakenRage?: DamageTakenRageModel
    /**
     * How much of Judgement of the Crusader's +161 Holy damage taken each Holy hit gets, a
     * paladin's untested-mechanic switch (docs/classes/paladin.md open question 5, Character →
     * Advanced). Omitted: `coefficient`, a share by the spell's damage coefficient; `flat`, all of
     * it on melee-class hits (seal procs, judgements, Holy Strike). Kept for paladins only.
     */
    jotcBonus?: 'coefficient' | 'flat'
    /**
     * Whether Hammer of the Righteous's "damage per second of your main hand weapon" counts attack
     * power, a Protection paladin's untested-mechanic switch (docs/classes/paladin.md open question
     * 11, Character → Advanced). Omitted: `withAttackPower`, the weapon's DPS as the character sheet
     * shows it, attack power included; `weaponOnly`, the weapon's own damage. Kept for paladins only.
     */
    hotrWeaponDps?: 'withAttackPower' | 'weaponOnly'
  }
  run: {
    /**
     * `adaptive` (default): run until the 95% CI half-width of every headline metric (DPS, or
     * TPS and DPS for tank specs) is within 0.25% of its mean, between 1,000 and 50,000 fights.
     * `fixed`: exactly `iterations` fights (decisions D15, D18).
     */
    mode: 'adaptive' | 'fixed'
    /** Fights to run in `fixed` mode (100–100,000). */
    iterations: number
    /** Master seed (uint32): the same config and seed give identical results on any device. */
    seed: number
  }
}

/**
 * docs/mechanics/rage.md#rage-from-damage-taken: `forever`, 10 × damage before mitigation ÷ max
 * health (the Forever default); `foreverFlat`, 1.5 × health lost ÷ 230.6; `foreverHealthLost`,
 * 10 × health lost ÷ max health; `classic`, 2.5 × health lost ÷ 230.6 (the Classic Era default).
 */
export type DamageTakenRageModel = 'forever' | 'foreverFlat' | 'foreverHealthLost' | 'classic'

/**
 * Ids from before the damage-taken models were renamed (M2.4h): `foreverHp` is now
 * `foreverHealthLost`, and `foreverHpPreArmor` is now `forever`.
 */
export type LegacyDamageTakenRageModel = 'foreverHp' | 'foreverHpPreArmor'

// ---------------------------------------------------------------------------
// Schemas the engine declares and the UI renders.
// ---------------------------------------------------------------------------

/** A rotation setting's value: a toggle's boolean, a number input's number, a choice's value. */
export type RotationValue = number | boolean | string

/** What a rotation switch needs from the setup (RotationOption `requires`, docs/ux.md "Rotation"). */
export interface RotationRequirement {
  /** A shield in the off hand, beside a one-hander (Shield Block, Shield Slam; warrior.md §3.1, §3.2). */
  shield?: boolean
  /** A talent, by name (Shield Slam). */
  talent?: string
}

/**
 * A default that depends on the setup (docs/classes/warrior.md §5.1, §5.3): used when the build has
 * `talent`, or when another option (declared earlier in the list) currently has the value `is`.
 * The first entry that matches wins; with none, the option's `default` applies. A switch's is on or
 * off; a number's is a number (Protection's Max TPS moves Heroic Strike's threshold, §5.4).
 */
export type RotationDefaultWhen<V extends boolean | number = boolean> = ({ talent: string } | { option: string; is: RotationValue }) & {
  default: V
  /**
   * A number's `default` is a share of the build's rage bar, in %, not rage points: it resolves to
   * that share of the max rage (100, raised by Boundless Rage and a Gnome's Expansive Mind), to the
   * nearest point. Protection's Balanced thresholds (warrior.md §5.4 "Balanced", D28).
   */
  pctOfMaxRage?: true
}

/**
 * The heading a rotation setting sits under on the Rotation tab (docs/ux.md "Rotation"). The tab
 * shows the groups in `rotationGroups` order and each group's settings in the spec's priority
 * order, a dependent setting under its parent when they share a group.
 */
export type RotationGroup =
  | 'Before the pull'
  | 'Cooldowns and buffs'
  | 'Core abilities'
  | 'Fillers'
  | 'Execute phase'
  | 'Consumables'

export type RotationOption =
  | {
      kind: 'toggle'
      id: string
      label: string
      /** Its heading; none for the few that shape the rest, which come first (Arms' stance). */
      group?: RotationGroup
      /** One line of help shown under the control. */
      help: string
      default: boolean
      /** Defaults that follow the build's talents or another setting (Arms: Rend with Bloodthrill). */
      defaultWhen?: RotationDefaultWhen[]
      /** Id of a toggle that must be on for this one to apply. */
      dependsOn?: string
      /**
       * While on, the rotation keeps this buff (a BuffDefinition id) up itself, and the Buffs
       * switch for it adds nothing more (Battle Shout, warrior.md §5.2 row 1).
       */
      maintainsBuff?: string
      /** The consumable (a BuffDefinition id) that must be selected in Buffs for this to do anything. */
      requiresBuff?: string
      /**
       * What it needs from the setup besides a consumable: a shield (Shield Block, Shield Slam) or a
       * talent (Shield Slam). Without it the engine never uses the ability, so the Rotation tab shows
       * the switch off and locked, and says where to get it (docs/ux.md "Rotation").
       */
      requires?: RotationRequirement
      /**
       * It does something only in an execute phase, so with Fight's execute phase at 0% it can't
       * apply, and the settings that need it are dimmed with it (Execute, docs/ux.md "Rotation").
       */
      needsExecutePhase?: boolean
      /**
       * It can only be used on these creature types (Exorcism: Undead and Demons), so with the
       * Fight tab's creature type another it can't apply, and it's dimmed with the settings under it.
       */
      needsCreatureType?: readonly CreatureType[]
      /**
       * Id of another toggle that must apply too, though this one sits under `dependsOn`: its help
       * names it (Protection's filler waiting for Shield Slam needs Shield Slam).
       */
      alsoDependsOn?: string
    }
  | {
      kind: 'number'
      id: string
      label: string
      group?: RotationGroup
      help: string
      /** Shown after the value, e.g. "rage", "s", "%". */
      unit: string
      min: number
      max: number
      step: number
      default: number
      /** Defaults that follow another setting (Protection: Heroic Strike's threshold with Max TPS). */
      defaultWhen?: RotationDefaultWhen<number>[]
      /** Id of a toggle that must be on for this input to apply. */
      dependsOn?: string
      /**
       * Id of another toggle that must be on too, under another heading: the input doesn't sit
       * under it, and its help names it (Recklessness before the execute phase needs Execute).
       */
      alsoDependsOn?: string
    }
  | {
      /** One of a few named values, shown as a segmented control (Arms: the stance it fights in). */
      kind: 'choice'
      id: string
      label: string
      group?: RotationGroup
      help: string
      choices: { value: string; label: string }[]
      default: string
      /** Id of a toggle that must be on for this choice to apply. */
      dependsOn?: string
    }

/**
 * A row the Rotation tab shows under a heading with no control: something the spec always does
 * (a Protection paladin's Righteous Fury, docs/ux.md "Rotation"). It comes first under its heading.
 */
export interface FixedRotationRow {
  id: string
  label: string
  group: RotationGroup
  /** One line of help, as a setting's. */
  help: string
  /** What it shows where a setting's control would be: "Always on". */
  value: string
}

/**
 * A part of a priority-list row's one-line summary ("From 40 rage · cancel below 20 rage"), from
 * one of its settings: `text` with `{}` replaced by the value as the Rotation tab writes it ("40
 * rage"). A switch's part shows while the switch is on, or at `when`; a number's always, unless
 * it's at `hideWhen`; a choice's, as its label. A part without `option` is fixed text. A part whose
 * setting can't apply (its switch is off) is left out, and so is one whose `choiceIs`,
 * `choiceIsNot` or `requires` doesn't hold.
 */
export interface AplSummaryPart {
  option?: string
  text: string
  /** A switch's part shows at this value (default: on). */
  when?: boolean
  /** A number's part is left out at this value (Execute's extra rage at 0). */
  hideWhen?: number
  /** A number's part reads this instead at 0 (Battle Shout's refresh: "again once it runs out"). */
  zeroText?: string
  /**
   * What the part reads while its setting can't apply (it's unused: a warlock's filler choice without
   * Incinerate reads "Shadow Bolt", docs/classes/warlock.md §6.4). Absent: the part is left out.
   */
  inactiveText?: string
  /**
   * Switches of other rows that must be on and apply too, for a part about them (Fury's fillers:
   * "while Bloodthirst and Whirlwind cool down").
   */
  alsoOn?: readonly string[]
  /**
   * A choice setting (this part's own, or another) whose value must be one of `values` for the part
   * to show (Chain Lightning's "with Clearcasting" at that choice only).
   */
  choiceIs?: { option: string; values: readonly string[] }
  /**
   * A choice setting whose value must be none of `values` for the part to show (the hunter's "between
   * Auto Shots" not with Neither; the Shock's mana threshold not with None).
   */
  choiceIsNot?: { option: string; values: readonly string[] }
  /** What the setup must have for the part to show (the hunter's Trueshot Aura: its talent). */
  requires?: RotationRequirement
}

/**
 * One row of a spec's action priority list (decision D31, docs/ux.md "Rotation"): an ability, or a
 * few that go together (the pre-pull), with its own settings. Its settings are RotationOptions of
 * the spec, by id, so the resolver, normalizeConfig and the changed marks work as for any setting.
 */
export interface AplRow {
  /** Stable: saved setups and share links store the order by it. */
  id: string
  label: string
  /** WoW icon name (docs/ux.md "Visual language"). */
  icon: string
  /** The switch that turns the row on and off; none for a row that's always there (the pre-pull). */
  enabledId?: string
  /** The row's own settings, shown when it's selected, in this order. A setting can sit in two rows. */
  optionIds: readonly string[]
  /** Its one-line summary on the list. */
  summary?: readonly AplSummaryPart[]
  /** One line on what the row does, for a row without a switch whose help would say it. */
  help?: string
  /**
   * Its place is a rule, not a preference (the pre-pull and opener; D26's duties keep their timing
   * rule wherever they sit): it can't be moved, and no row moves past it.
   */
  pinned?: boolean
}

/**
 * A named rotation: an order and the values of the rows' settings (which rows are on, and their
 * thresholds); settings it doesn't name are at their defaults. D28's tank rotations are presets.
 */
export interface AplPreset {
  id: string
  label: string
  /**
   * What it is and when to pick it, with its measured numbers for a tank's (D28): the preset
   * picker's info lists each one's.
   */
  help: string
  /**
   * The short line under the picker while it's the one picked: what it keeps and gives up, three
   * lines at most on a phone (docs/ux.md "Rotation"). Absent: `help`.
   */
  summary?: string
  /** Its order; absent: the default order. */
  order?: readonly string[]
  values: Readonly<Record<string, RotationValue>>
}

/** A spec's rotation as an action priority list (decision D31). */
export interface AplDefinition {
  /** The rows, in the default order. */
  rows: readonly AplRow[]
  /**
   * Settings for the whole rotation, shown above the list rather than in a row: a stance, a pet, a
   * tank's priority, the consumables.
   */
  specWide: readonly string[]
  /**
   * Named presets, in the picker's order. The spec's defaults are the preset with the id `default`
   * (DEFAULT_APL_PRESET): a spec with named rotations lists it itself, to name and place it (a
   * tank's Balanced, between Defensive and Max TPS; its values are empty and it has no order, since
   * it's the defaults), and the picker marks it "(default)". Otherwise it's "Default", first. A
   * spec-wide setting a preset names (a tank's Priority) is the presets' to set: it has no control
   * but the picker, and every preset is compared on it (sim/classes/apl.ts).
   */
  presets: readonly AplPreset[]
}

export interface SpecDefinition {
  id: SpecId
  classId: ClassId
  /** "Fury", "Feral (Cat)", … */
  name: string
  role: Role
  /** WoW icon name (docs/ux.md#visual-language). */
  icon: string
  /** Shown in the spec picker only when its sim and UI are complete (docs/ux.md principle 8). */
  available: boolean
  rotationOptions: RotationOption[]
  /** What the Rotation tab says about the defaults: tuned for the default setup, or the common priority (D23). */
  rotationDefaults?: string
  /** Buffs the Buffs tab assumes are the spec's own, kept up by its rotation (SpecMeta.ownBuffs). */
  ownBuffs?: readonly string[]
  /** Rows the Rotation tab shows with no control, for what the spec always does. */
  rotationFixed: FixedRotationRow[]
  /** The spec's rotation as a priority list you reorder (D31); absent for a spec still on switches. */
  rotationApl?: AplDefinition
}

export type BuffCategory = 'raidBuff' | 'targetDebuff' | 'consumable'

export interface BuffDefinition {
  id: string
  name: string
  icon: string
  category: BuffCategory
  /** UI grouping within the category, e.g. "Flask", "Battle elixir", "Food". */
  group: string
  /** One-line effect for the UI, e.g. "+139 attack power". */
  summary: string
  /** Raid composition needed for this buff to be available. */
  providedBy?: ClassSlug
  /**
   * A player of the `providedBy` class casts it on themselves, so for one the raid needs no other
   * (a druid's Mark of the Wild, a paladin's Blessing of Might; buffs doc §6.1).
   */
  selfCast?: boolean
  /**
   * The classes it does anything for (mana and spell damage: the paladin); absent, every class.
   * The Buffs tab lists it only for them, and presets and the plan skip it for the others.
   */
  forClasses?: readonly ClassId[]
  /**
   * The kind of spec it's for (buffs doc "Class-only entries"; docs/ux.md "Buffs"): `melee`, an
   * entry that changes only attacks (attack power, Strength, Agility, a weapon's temporary enchant,
   * the boss's armor), which a caster spec (SpecMeta.caster) never sees; `caster`, the caster core's
   * (Moonkin Aura, Power Infusion, Curse of the Elements), which only a caster spec sees (and the
   * specs in `alsoForSpecs`). Absent,
   * every spec. Like `forClasses`, the Buffs tab lists it only for them, and presets, saved setups and
   * the plan skip it for the others.
   */
  forSpecs?: 'melee' | 'caster'
  /**
   * Specs it's also for, whatever `forSpecs` says: Power Infusion is the casters' and the Protection
   * paladin's, whose threat is Holy spell damage (buffs doc §1.1 "Power Infusion").
   */
  alsoForSpecs?: readonly SpecId[]
  /**
   * Also for every caster spec (SpecMeta.caster), whatever its class: the mana and spell damage
   * entries, which a druid's Balance spec needs and its Feral specs don't (docs/classes/druid.md
   * §11.6; docs/mechanics/spells.md §12).
   */
  forCasterSpecs?: boolean
  /** Buffs sharing a key are mutually exclusive (e.g. one battle elixir). */
  exclusiveGroup?: string
  /**
   * It acts only on the boss's melee swings (Demoralizing Shout and Roar, Thunder Clap, Thorns), or
   * adds only armor, which only those swings meet (Devotion Aura, Elixir of Greater Defense, Greater
   * Stoneshield Potion); only a tank takes them: for the other specs it changes nothing, and the
   * Buffs tab says so. Set by the catalogue from its effects.
   */
  bossMelee?: true
  /** Owning doc section, e.g. "docs/mechanics/buffs-debuffs-consumables.md#…". */
  docRef: string
}

export interface BuffPreset {
  id: 'self' | 'dungeon' | 'raid' | 'max'
  name: string
  description: string
}

export interface EnchantDefinition {
  id: string
  name: string
  /** Gear slots it can be applied to (finger1/finger2 etc. listed individually). */
  slots: GearSlot[]
  /** What the item in the slot must be: any weapon, a two-hander, or a shield. */
  requires?: 'weapon' | 'twoHand' | 'shield'
  summary: string
  docRef: string
}

// ---------------------------------------------------------------------------
// Results.
// ---------------------------------------------------------------------------

export interface Summary {
  mean: number
  stdev: number
  /** Half-width of the 95% confidence interval of the mean. */
  ci95: number
}

export interface AbilityResult {
  id: string
  name: string
  icon: string
  damage: number
  threat: number
  casts: number
  hits: number
  crits: number
  misses: number
  dodges: number
  parries: number
  glances: number
  blocks: number
  /**
   * A bleed's row (Rend, Deep Wounds): its casts, misses, dodges and parries count applications,
   * and its hits and crits count ticks (docs/ux.md#results). Absent for every other row.
   */
  bleed?: BleedResult
  /** It can neither crit nor be avoided (Holy Shield's damage), so the row shows no such shares. */
  certain?: true
  /** What its casts count, shown a fight on its row: blocks (Holy Shield's damage) or extra attacks (Reckoning). */
  counts?: 'blocks' | 'extraAttacks'
  /**
   * For a row whose threat is only the mana it gave (Shield Specialization, Improved Seal of Fury):
   * that mana, over every fight. Absent for every other row.
   */
  mana?: number
  /** A spell cast on the boss (Faerie Fire, Demoralizing Roar): it can't crit, and its misses count its resists too. */
  spell?: true
  /** The pet's name, on a row of the pet's damage, which counts toward your DPS (docs/mechanics/ranged-and-pets.md §10). */
  pet?: string
  /**
   * What the row's count a fight counts, which its outcomes line starts with (docs/ux.md#results
   * "Breakdown"): `swings`, a white melee swing's (Main hand, Off hand, a form's or a pet's Auto
   * attack); `shots`, Auto Shot's; `procs`, an item's, talent's, weapon's or seal's proc (Hand of
   * Justice, Windfury, Seal of Command, Deep Wounds, Deadly Poison, Ignite); `applications`, a bleed's
   * or DoT's put on the boss (Rend, Corruption, Rake's bleed); `ticks`, a periodic effect's ticks
   * where nothing counts its casts; `uses`, a consumable's (a potion, a rune, a bomb); `casts`, everything
   * else, a channel's (Mind Flay, Arcane Missiles) and a rage cast's (Bloodrage, Enrage) included.
   * The count is `casts`, but `procs` where the row has it (an extra-attacks proc's fires) and its
   * attempts (hits, crits, glances, blocks, misses, dodges, parries) for `ticks`. Absent for a row
   * that shows its own count (`counts`) or has nothing to count (a talent's row of mana or rage:
   * Shield Specialization, Improved Seal of Fury).
   */
  unit?: AbilityUnit
  /**
   * On a `procs` row an extra-attacks proc feeds (Windfury Weapon, Ironfoe, Hand of Justice): the
   * times it fired, over every fight, which is the row's count. Its `casts` count the extra swings
   * (Windfury Weapon's and Ironfoe's two a proc), and its crit and avoided shares are over those.
   * A fire whose swing becomes a queued Heroic Strike or Maul still counts here, but that swing's
   * damage lands on the Heroic Strike's or Maul's row.
   */
  procs?: number
  /**
   * What one of its landings is, on a `casts` row that lands more than once a cast: a tick
   * (Consecration) or a missile (Arcane Missiles). Its average damage and its crit and avoided
   * shares are per landing and say so: "9.1% tick crit · 11.0% of ticks avoided · 95 avg tick".
   */
  landing?: 'tick' | 'missile'
}

export type AbilityUnit = 'casts' | 'swings' | 'shots' | 'procs' | 'applications' | 'ticks' | 'uses'

export interface BleedResult {
  /** Its ticks can crit (Rend in the `forever` profile; damage-and-timing §4). */
  ticksCanCrit: boolean
  /** An application rolls miss, dodge and parry (Rend); a proc's bleed can't be avoided (Deep Wounds). */
  avoidable: boolean
  /** Share of fight time it was on the boss, 0–100, or null when the sim doesn't track it (Deep Wounds). */
  uptimePct: number | null
  /** The row of the hit that lands it, for a bleed with a row of its own (Rake's): the breakdown puts it right after. */
  hitId?: string
  /** A bleed that stacks (Lacerate, up to 5): its average stacks while on the boss. Absent for the others. */
  averageStacks?: number
}

/**
 * A cooldown, buff or proc on the player in the results' "Cooldowns and buffs" (docs/ux.md#results):
 * every cast the rotation can press (they deal no damage, so the breakdown leaves them out) and
 * every other aura on the player.
 */
export interface CooldownResult {
  id: string
  name: string
  icon: string
  /** Share of fight time its buff was up, 0–100; null for a cast without one (Bloodrage). */
  uptimePct: number | null
  /**
   * Casts per fight, pre-pull ones included; for a debuff an attack puts on the boss, that attack's
   * (Sunder Armor); null for a buff nothing casts (Flurry, the Overpower window).
   */
  castsPerFight: number | null
  /**
   * For a proc the next ability spends (Clearcasting, druid.md §2.7): how many times a fight it came
   * up. Its uptime is only the moments until the next ability, so this says what it did.
   */
  procsPerFight?: number
  /**
   * Cast before the pull, with its buff all but gone by the pull (under 0.05% of the fight): Seal of
   * the Crusader, up only until its judgement at the pull. Its uptime says nothing, so the results
   * show when it's cast instead.
   */
  beforePull?: true
}

/** Final stats as the sim computed them (docs/mechanics/character-stats.md). */
export interface CharacterSheet {
  /**
   * A ranged spec's (SpecMeta.ranged; docs/classes/hunter.md#9-implementation-notes): ranged attack
   * power, crit and hit % with the ranged weapon (its own bonuses included, before the +3 crit
   * suppression), its time between Auto Shots in seconds with the static ranged haste (null without a
   * ranged weapon), its weapon skill, the ammo's damage per second, and mana per 5 s. Absent otherwise.
   */
  ranged?: { rangedAttackPower: number; critPct: number; hitPct: number; speedSec: number | null; weaponSkill: number; ammoDps: number; mp5: number }
  strength: number
  agility: number
  stamina: number
  intellect: number
  spirit: number
  health: number
  mana: number | null
  armor: number
  attackPower: number
  /** Melee crit chance in %, before boss crit suppression. */
  critPct: number
  /** Melee hit bonus in %. */
  hitPct: number
  hastePct: number
  /** Expertise in percentage points (the boss's dodge and parry reduction); 0 when not applied. */
  expertise: number
  weaponSkill: { mainHand: number; offHand: number | null }
  dodgePct: number
  parryPct: number
  blockPct: number
  blockValue: number
  /**
   * The class can parry, and block with a shield: false for a druid, whose sheet leaves those rows
   * out (docs/ux.md#results). Absent: it can.
   */
  canParry?: boolean
  canBlock?: boolean
  defense: number
  /**
   * How much your defense lowers an attacker's crit chance, % (0.04 per point above 300; negative
   * below it): 5.6 at 440 defense, where a raid boss can't crit you
   * (docs/mechanics/character-stats.md#defense-skill).
   */
  critReductionPct: number
  /**
   * Tank specs: the boss's swings against you as the fight starts, shares of its table in %
   * (miss, dodge, parry, block, crit, crushing, hit; docs/mechanics/combat-tables.md#8-boss--player-tanks).
   * Null for specs the boss doesn't attack.
   */
  bossTable: BossOutcomes | null
  /**
   * A class that casts spells (the paladin; docs/classes/paladin.md#conventions-used-below): Holy
   * spell damage (Champion of the Light's share of Intellect included), spell crit and spell hit in
   * %, and mana per 5 s. Absent for other classes.
   */
  spell?: {
    holyDamage: number
    critPct: number
    hitPct: number
    mp5: number
    /**
     * A caster's (SpecMeta.caster; docs/mechanics/spells.md §5, §4, §3): spell damage, crit and hit
     * per school (the all-schools figure plus the school's own lines), casting speed in %, and spell
     * penetration. Absent for the paladin, whose spells are Holy.
     */
    caster?: {
      schoolDamage: Record<'arcane' | 'fire' | 'frost' | 'holy' | 'nature' | 'shadow', number>
      /** Spell crit and hit % per school: `critPct` and `hitPct` plus the school's own talents (Critical Mass, Elemental Precision). */
      schoolCrit: Record<'arcane' | 'fire' | 'frost' | 'holy' | 'nature' | 'shadow', number>
      schoolHit: Record<'arcane' | 'fire' | 'frost' | 'holy' | 'nature' | 'shadow', number>
      castSpeedPct: number
      spellPen: number
    }
  }
  /**
   * A tank whose rotation keeps a block buff up (a Protection paladin's Holy Shield): the boss's
   * table with it up, the buff's name and plan aura id (its uptime is in the result's cooldowns), and
   * the block it adds (docs/ux.md#results). Absent otherwise.
   */
  bossTableUp?: { name: string; auraId: string; blockPct: number; table: BossOutcomes }
  /**
   * Base values not known yet for this race and class (e.g. "base attributes"), left out of the
   * numbers above (docs/mechanics/character-stats.md#open-questions). Empty when complete.
   */
  unknown: string[]
  /**
   * Base values that aren't measured for Forever yet, in the numbers above as Classic-based
   * placeholders or other unmeasured [?] values (decision D24; e.g. "base health"). The
   * assumptions name the same ones. Avoidance ones (base dodge, parry and block) are a tank's
   * only: they matter only when the boss attacks you.
   */
  placeholders: string[]
}

/**
 * The boss's melee swings against the player by outcome, in the table's roll order
 * (docs/mechanics/combat-tables.md#8-boss--player-tanks). As shares, % of its swings, they add up
 * to 100.
 */
export interface BossOutcomes {
  miss: number
  dodge: number
  parry: number
  block: number
  crit: number
  /** Crushing blows (×1.5). */
  crush: number
  hit: number
}

/**
 * What a tank needs to read the fight (decision D18 puts TPS and DPS in the headline): the damage
 * it takes and how the boss's swings landed (docs/mechanics/encounter.md#5-boss-melee-tank-modeling).
 */
export interface TankResult {
  /**
   * Damage taken per second: the health the boss's swings cost, after armor, block, stance and
   * other damage-taken modifiers, with its 95% CI over fights.
   */
  dtps: Summary
  /** The boss's swings per fight, parry-hastened ones included. */
  bossSwingsPerFight: number
  /** Share of the boss's swings by outcome, %, as they fell in the fights run. */
  outcomes: BossOutcomes
}

export interface Assumption {
  id: string
  /** Plain-language statement of what the sim assumes. */
  text: string
  docRef: string
}

export interface SimResult {
  spec: SpecId
  profile: RuleProfileId
  iterations: number
  durationSec: number
  dps: Summary
  tps: Summary
  abilities: AbilityResult[]
  /** Casts and buffs on the player, with uptimes: casts first, in the rotation's order, then procs. */
  cooldowns: CooldownResult[]
  /** Tank specs (the boss attacks you): damage taken and the boss's outcomes. Absent otherwise. */
  tank?: TankResult
  /** A spec that casts spells from mana (the paladin): its mana over a fight. Absent otherwise. */
  mana?: ManaResult
  sheet: CharacterSheet
  /** The [?] assumptions that affect this configuration. */
  assumptions: Assumption[]
  elapsedMs: number
}

/**
 * Mana over a fight, averaged over the fights run (docs/classes/paladin.md#mana-model): the pool
 * at the pull, what the power ticks regenerated (Spirit and mana per 5 s), what spells and
 * consumables restored, and what the rotation spent. What's left at the end is the pool plus both
 * gains, less what was spent.
 */
export interface ManaResult {
  max: number
  regeneratedPerFight: number
  /** What restored mana, one line each: Sanctified Judgement, a mana potion, a rune (only those that did). */
  restored: ManaRestored[]
  /** All of it: `restored`'s lines together. */
  restoredPerFight: number
  spentPerFight: number
}

/** One line of what restored mana over a fight, per fight. */
export interface ManaRestored {
  id: string
  name: string
  perFight: number
}

export interface SimProgress {
  completedIterations: number
  totalIterations: number
}
