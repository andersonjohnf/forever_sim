// The engine's public API: the only module the UI imports from src/sim
// (docs/architecture.md#data-flow). Keep these signatures stable.
import type { ClassSlug } from '@/data/races/types'
import { classSetup, talentRanksByName } from './classes'
import { resolveRotationValues } from './classes/options'
import { othersKeepBleeding, ROTATION_GROUPS, rotationDefaultsNote, rotationOptions, unusedSettings } from './classes/rotation'
import { raceName } from './equip'
import { normalizeConfig } from './config/normalize'
import { TALENT_DATA } from './defaults'
import { BUFFS } from './effects/buffs'
import { ENCHANTS } from './effects/enchants'
import { ITEM_EFFECTS } from './effects/items'
import { presetBuffIds } from './effects/presets'
import { catalogueSummary } from './effects/types'
import { buildPlan, UnsupportedSetupError } from './plan/build'
import { toResult } from './run/aggregate'
import { type ChunkExecutor, drive } from './run/driver'
import { localExecutor } from './run/local'
import { WorkerPool } from './run/pool'
import { PROFILES } from './rules/profiles'
import { SPEC_IDS, SPEC_META } from './specs'
import type {
  BuffDefinition,
  BuffPreset,
  CharacterSheet,
  EnchantDefinition,
  RotationGroup,
  RotationValue,
  RuleProfileId,
  SimConfig,
  SimProgress,
  SimResult,
  SpecDefinition,
  SpecId,
} from './types'

export * from './types'
export { CLASS_COLOR, SPEC_IDS, SPEC_META } from './specs'
export { defaultConfig, FULL_RAID, TALENT_DATA, talentPresets, type TalentPreset } from './defaults'
export { canUse, fitsFaction, fitsSlot, isTwoHand, itemFaction, PROFICIENCY, uniqueConflicts, type UniqueConflict } from './equip'
export { normalizeConfig } from './config/normalize'
// The boss → player table's constants, for the results to explain it (docs/mechanics/combat-tables.md#8-boss--player-tanks).
export { CRUSH_MIN_LEVEL_GAP, DEFENSE_PER_POINT, mobSkill, PLAYER_LEVEL } from './core/attack-table'

/**
 * Specs whose sim and UI are complete (docs/ux.md principle 8): Fury from M2.2c, Arms from M2.3c,
 * the Feral cat from B2.
 */
const AVAILABLE: ReadonlySet<SpecId> = new Set(['warrior-fury', 'warrior-arms', 'druid-feral-cat'])

/**
 * Every spec with its engine-declared options. `available` flips when the spec's sim and UI are
 * complete (docs/ux.md principle 8).
 */
export const specs: SpecDefinition[] = SPEC_IDS.map((id) => ({
  ...SPEC_META[id],
  available: AVAILABLE.has(id),
  rotationOptions: rotationOptions(id),
  rotationDefaults: rotationDefaultsNote(id),
}))

export function getSpec(id: SpecId): SpecDefinition {
  const spec = specs.find((s) => s.id === id)
  if (!spec) throw new Error(`Unknown spec ${id}`)
  return spec
}

/**
 * The Rotation tab's headings in the order it shows them; each spec's settings name theirs in
 * `RotationOption.group` (docs/ux.md "Rotation").
 */
export const rotationGroups: readonly RotationGroup[] = ROTATION_GROUPS

/**
 * Every rotation setting's value for a setup: the saved one, or the option's default for this
 * setup, which can follow the build's talents or another setting (Arms: Rend with Bloodthrill,
 * Whirlwind in Berserker Stance; docs/classes/warrior.md §5.3). The plan uses the same values.
 */
export function rotationValues(config: Pick<SimConfig, 'spec' | 'talents' | 'rotation'>): Record<string, RotationValue> {
  const classId = SPEC_META[config.spec].classId
  return resolveRotationValues(rotationOptions(config.spec), config.rotation, talentRanksByName(TALENT_DATA[classId], config.talents))
}

/**
 * Rotation settings that can't do anything in this setup, each with the note the Rotation tab shows
 * under it, "Not used: …" (docs/ux.md "Rotation"): the racial cooldown for a race without one the
 * sim uses, and the cat's Rake or Rip when "only when nothing else bleeds" meets a raid whose
 * warriors keep the boss bleeding.
 */
export function unusedRotationSettings(config: Pick<SimConfig, 'spec' | 'talents' | 'rotation' | 'race' | 'buffs'>): Record<string, string> {
  return unusedSettings(config.spec, rotationValues(config), {
    race: config.race,
    raceName: raceName(config.race),
    othersBleed: othersKeepBleeding(config.buffs.raid),
  })
}

/**
 * Buff catalogue ids the talent build provides itself (a druid's Leader of the Pack, druid.md §2.3):
 * the plan leaves the Buffs tab's copy out, so the tab shows it on and locked, as it does a buff the
 * rotation keeps up (docs/ux.md "Buffs").
 */
export function talentBuffs(config: Pick<SimConfig, 'spec' | 'talents'>): string[] {
  const classId = SPEC_META[config.spec].classId
  return classSetup(classId, config.spec, config.talents, PROFILES.forever).replacesBuffs ?? []
}

/** A catalogue per rule profile: each entry's summary is the profile's (`catalogueSummary`). */
function perProfile<T>(build: (profile: RuleProfileId) => T): Record<RuleProfileId, T> {
  return { forever: build('forever'), classicEra: build('classicEra') }
}

const BUFF_CATALOGUES = perProfile((profile): BuffDefinition[] =>
  BUFFS.map((b) => ({
    id: b.id,
    name: b.name,
    icon: b.icon,
    category: b.category,
    group: b.group,
    summary: catalogueSummary(b, PROFILES[profile]),
    ...(b.providedBy ? { providedBy: b.providedBy } : {}),
    ...(b.selfCast ? { selfCast: true } : {}),
    ...(b.exclusiveGroup ? { exclusiveGroup: b.exclusiveGroup } : {}),
    docRef: b.docRef,
  })),
)

/**
 * Raid buffs, target debuffs and consumables (docs/mechanics/buffs-debuffs-consumables.md), with
 * Forever's summaries. To show a setup's numbers, use `buffCatalogueFor(config.rules.profile)`.
 */
export const buffCatalogue: BuffDefinition[] = BUFF_CATALOGUES.forever

/**
 * The buff catalogue with each entry's summary under a rule profile: Classic Era's numbers where
 * they differ (buffs doc, Classic Era values). The same array for a profile every time.
 */
export function buffCatalogueFor(profile: RuleProfileId): BuffDefinition[] {
  return BUFF_CATALOGUES[profile]
}

export const buffPresets: BuffPreset[] = [
  { id: 'self', name: 'Self only', description: 'Your own buffs, no group.' },
  { id: 'dungeon', name: 'Dungeon group', description: 'A five-player group and basic consumables.' },
  { id: 'raid', name: 'Standard raid', description: 'Raid buffs and common consumables.' },
  { id: 'max', name: 'Max consumables', description: 'Raid buffs and every consumable that helps.' },
]

export { buffProvided, unusedBuffs } from './effects/presets'

/** The buff ids a preset enables for a spec, given the raid composition (buffs doc §6). */
export function presetBuffs(preset: BuffPreset['id'], spec: SpecId, raid: ClassSlug[]): string[] {
  return presetBuffIds(preset, spec, raid)
}

const ENCHANT_CATALOGUES = perProfile((profile): EnchantDefinition[] =>
  ENCHANTS.map((e) => ({ id: e.id, name: e.name, slots: e.slots, requires: e.requires, summary: catalogueSummary(e, PROFILES[profile]), docRef: e.docRef })),
)

/**
 * Enchants per slot (docs/mechanics/buffs-debuffs-consumables.md#5-enchants-and-item-enhancements),
 * with Forever's summaries. To show a setup's numbers, use `enchantCatalogueFor(config.rules.profile)`.
 */
export const enchantCatalogue: EnchantDefinition[] = ENCHANT_CATALOGUES.forever

/** The enchant catalogue with each summary under a rule profile, as `buffCatalogueFor`. */
export function enchantCatalogueFor(profile: RuleProfileId): EnchantDefinition[] {
  return ENCHANT_CATALOGUES[profile]
}

/**
 * Which of an item's effects the engine models, read the way the plan builder reads its item-effect
 * overrides (`sim/effects/items.ts`): `equip`, its equip and chance-on-hit effects and extra weapon
 * damage (an override replaces what the tooltip says); `use`, its use effect, as a cast a rotation
 * can press. The plan lists every other effect as not simulated.
 */
export function modelledItemEffects(itemId: number): { equip: boolean; use: boolean } {
  const override = ITEM_EFFECTS[itemId]
  return { equip: override !== undefined, use: override?.use !== undefined }
}

/** Final character stats for a config, synchronously (docs/mechanics/character-stats.md). */
export function computeSheet(config: SimConfig): CharacterSheet | null {
  try {
    return buildPlan(normalizeConfig(config).config).sheet
  } catch {
    return null
  }
}

let pool: WorkerPool | null = null

function executorFor(plan: Parameters<typeof localExecutor>[0]): ChunkExecutor {
  if (WorkerPool.supported()) {
    try {
      pool ??= new WorkerPool(WorkerPool.defaultSize())
      return pool.executor(plan)
    } catch {
      pool = null
    }
  }
  return localExecutor(plan)
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)

/**
 * Runs the simulation in Web Workers (or on this thread where there are none). Adaptive by
 * default: it stops once every headline metric's 95% CI is within 0.25% of its mean: DPS, or TPS
 * and DPS for tank specs (decisions D15, D18).
 * Rejects with an AbortError if the signal aborts, and with a plain message if the setup can't be
 * simulated yet.
 */
export async function simulate(
  config: SimConfig,
  options: { onProgress?: (progress: SimProgress) => void; signal?: AbortSignal } = {},
): Promise<SimResult> {
  const start = now()
  const normalized = normalizeConfig(config).config
  const bundle = buildPlan(normalized)
  if (bundle.blockers.length > 0) throw new UnsupportedSetupError(bundle.blockers[0])
  const agg = await drive(bundle.plan, executorFor(bundle.plan), {
    mode: normalized.run.mode,
    iterations: normalized.run.iterations,
    onProgress: options.onProgress,
    signal: options.signal,
  })
  return toResult(bundle, agg, now() - start)
}
