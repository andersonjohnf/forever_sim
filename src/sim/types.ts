// The contract between the UI and the engine (docs/architecture.md#data-flow).
//
// SimConfig is plain, versioned JSON: it's what gets saved to localStorage, shared by URL and
// posted to workers. The engine declares everything the UI renders generically (specs,
// rotation options, buffs, enchants), so the UI never hard-codes game rules.
import type { PreRaidBisSpec } from '@/data/items/types'
import type { ClassSlug } from '@/data/races/types'

export type SpecId = PreRaidBisSpec
export type ClassId = 'warrior' | 'druid' | 'paladin'
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
  /** Bump on breaking changes; normalizeConfig migrates or rejects old versions. */
  version: 1
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

/**
 * A default that depends on the setup (docs/classes/warrior.md §5.3): used when the build has
 * `talent`, or when another option (declared earlier in the list) currently has the value `is`.
 * The first entry that matches wins; with none, the option's `default` applies.
 */
export type RotationDefaultWhen = ({ talent: string } | { option: string; is: RotationValue }) & { default: boolean }

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
       * It does something only in an execute phase, so with Fight's execute phase at 0% it can't
       * apply, and the settings that need it are dimmed with it (Execute, docs/ux.md "Rotation").
       */
      needsExecutePhase?: boolean
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
  /** Buffs sharing a key are mutually exclusive (e.g. one battle elixir). */
  exclusiveGroup?: string
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
}

export interface BleedResult {
  /** Its ticks can crit (Rend in the `forever` profile; damage-and-timing §4). */
  ticksCanCrit: boolean
  /** An application rolls miss, dodge and parry (Rend); a proc's bleed can't be avoided (Deep Wounds). */
  avoidable: boolean
  /** Share of fight time it was on the boss, 0–100, or null when the sim doesn't track it (Deep Wounds). */
  uptimePct: number | null
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
  /** Casts per fight, pre-pull ones included; null for a buff nothing casts (Flurry, the Overpower window). */
  castsPerFight: number | null
}

/** Final stats as the sim computed them (docs/mechanics/character-stats.md). */
export interface CharacterSheet {
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
  sheet: CharacterSheet
  /** The [?] assumptions that affect this configuration. */
  assumptions: Assumption[]
  elapsedMs: number
}

export interface SimProgress {
  completedIterations: number
  totalIterations: number
}
