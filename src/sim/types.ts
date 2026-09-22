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

export interface FightConfig {
  /** Fight length in seconds. */
  durationSec: number
  /** Boss armor before debuffs (docs/mechanics/encounter.md). */
  bossArmor: number
  /** Simulate the execute phase (last 20% of the boss's health). */
  executePhase: boolean
  /** Enemies in range for cleave/AoE abilities. 1 = single target. */
  targets: number
  /** DPS attack from behind (no parry/block); tanks from the front. */
  position: 'behind' | 'front'
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
  /** Values for the spec's RotationOption ids; missing ids use the option default. */
  rotation: Record<string, number | boolean>
  fight: FightConfig
  rules: {
    profile: RuleProfileId
    /** Decision D12: apply unmeasured Forever ratings (expertise, haste, armor pen) by hypothesis, or ignore them. */
    unmeasuredRatings: 'apply' | 'ignore'
  }
  run: {
    iterations: number
    seed: number
  }
}

// ---------------------------------------------------------------------------
// Schemas the engine declares and the UI renders.
// ---------------------------------------------------------------------------

export type RotationOption =
  | {
      kind: 'toggle'
      id: string
      label: string
      /** One line of help shown under the control. */
      help: string
      default: boolean
    }
  | {
      kind: 'number'
      id: string
      label: string
      help: string
      /** Shown after the value, e.g. "rage", "s", "%". */
      unit: string
      min: number
      max: number
      step: number
      default: number
      /** Id of a toggle that must be on for this input to apply. */
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
  expertise: number
  weaponSkill: { mainHand: number; offHand: number | null }
  dodgePct: number
  parryPct: number
  blockPct: number
  blockValue: number
  defense: number
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
  sheet: CharacterSheet
  /** The [?] assumptions that affect this configuration. */
  assumptions: Assumption[]
  elapsedMs: number
}

export interface SimProgress {
  completedIterations: number
  totalIterations: number
}
