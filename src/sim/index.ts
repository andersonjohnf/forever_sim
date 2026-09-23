// The engine's public API: the only module the UI imports from src/sim
// (docs/architecture.md#data-flow). Keep these signatures stable.
import type { ClassSlug } from '@/data/races/types'
import { rotationOptions } from './classes/rotation'
import { normalizeConfig } from './config/normalize'
import { BUFFS } from './effects/buffs'
import { ENCHANTS } from './effects/enchants'
import { presetBuffIds } from './effects/presets'
import { buildPlan, UnsupportedSetupError } from './plan/build'
import { toResult } from './run/aggregate'
import { type ChunkExecutor, drive } from './run/driver'
import { localExecutor } from './run/local'
import { WorkerPool } from './run/pool'
import { SPEC_IDS, SPEC_META } from './specs'
import type {
  BuffDefinition,
  BuffPreset,
  CharacterSheet,
  EnchantDefinition,
  SimConfig,
  SimProgress,
  SimResult,
  SpecDefinition,
  SpecId,
} from './types'

export * from './types'
export { CLASS_COLOR, SPEC_IDS, SPEC_META } from './specs'
export { defaultConfig, FULL_RAID, TALENT_DATA, talentPresets, type TalentPreset } from './defaults'
export { canUse, fitsSlot, isTwoHand, PROFICIENCY } from './equip'
export { normalizeConfig } from './config/normalize'

/** Specs whose sim and UI are complete (docs/ux.md principle 8): Fury from M2.2c; Arms joins it in M2.3. */
const AVAILABLE: ReadonlySet<SpecId> = new Set(['warrior-fury'])

/**
 * Every spec with its engine-declared options. `available` flips when the spec's sim and UI are
 * complete (docs/ux.md principle 8).
 */
export const specs: SpecDefinition[] = SPEC_IDS.map((id) => ({
  ...SPEC_META[id],
  available: AVAILABLE.has(id),
  rotationOptions: rotationOptions(id),
}))

export function getSpec(id: SpecId): SpecDefinition {
  const spec = specs.find((s) => s.id === id)
  if (!spec) throw new Error(`Unknown spec ${id}`)
  return spec
}

/** Raid buffs, target debuffs and consumables (docs/mechanics/buffs-debuffs-consumables.md). */
export const buffCatalogue: BuffDefinition[] = BUFFS.map(
  ({ id, name, icon, category, group, summary, providedBy, exclusiveGroup, docRef }) => ({
    id,
    name,
    icon,
    category,
    group,
    summary,
    ...(providedBy ? { providedBy } : {}),
    ...(exclusiveGroup ? { exclusiveGroup } : {}),
    docRef,
  }),
)

export const buffPresets: BuffPreset[] = [
  { id: 'self', name: 'Self only', description: 'Your own buffs, no group.' },
  { id: 'dungeon', name: 'Dungeon group', description: 'A five-player group and basic consumables.' },
  { id: 'raid', name: 'Standard raid', description: 'Raid buffs and common consumables.' },
  { id: 'max', name: 'Max consumables', description: 'Raid buffs and every consumable that helps.' },
]

/** The buff ids a preset enables for a spec, given the raid composition (buffs doc §6). */
export function presetBuffs(preset: BuffPreset['id'], spec: SpecId, raid: ClassSlug[]): string[] {
  return presetBuffIds(preset, spec, raid)
}

/** Enchants per slot (docs/mechanics/buffs-debuffs-consumables.md#5-enchants-and-item-enhancements). */
export const enchantCatalogue: EnchantDefinition[] = ENCHANTS.map(({ id, name, slots, requires, summary, docRef }) => ({
  id,
  name,
  slots,
  requires,
  summary,
  docRef,
}))

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
 * default: it stops once the headline's 95% CI is within 0.25% of its mean (decision D15).
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
