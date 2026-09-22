// The engine's public API: the only module the UI imports from src/sim.
//
// Data-only pieces (spec metadata, default setups) are implemented here. The simulation
// pieces are typed stubs until the engine lands (docs/milestones.md, M1/M2); each says
// what it must do. Replace the stubs; keep the signatures (docs/architecture.md#data-flow).
import type { ClassSlug } from '@/data/races/types'
import { defaultConfig } from './defaults'
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
export { defaultConfig, FULL_RAID, TALENT_DATA } from './defaults'

/** Every spec with its engine-declared options. `available` flips when the spec is complete. */
export const specs: SpecDefinition[] = SPEC_IDS.map((id) => ({
  ...SPEC_META[id],
  available: false,
  rotationOptions: [],
}))

export function getSpec(id: SpecId): SpecDefinition {
  const spec = specs.find((s) => s.id === id)
  if (!spec) throw new Error(`Unknown spec ${id}`)
  return spec
}

/** Raid buffs, target debuffs and consumables (docs/mechanics/buffs-debuffs-consumables.md). */
export const buffCatalogue: BuffDefinition[] = []

export const buffPresets: BuffPreset[] = [
  { id: 'self', name: 'Self only', description: 'Your own buffs, no group.' },
  { id: 'dungeon', name: 'Dungeon group', description: 'A five-player group and basic consumables.' },
  { id: 'raid', name: 'Standard raid', description: 'Raid buffs and common consumables.' },
  { id: 'max', name: 'Max consumables', description: 'Raid buffs and every consumable that helps.' },
]

/** The buff ids a preset enables for a spec, given the raid composition. */
export function presetBuffs(_preset: BuffPreset['id'], _spec: SpecId, _raid: ClassSlug[]): string[] {
  return []
}

/** Enchants per slot (docs/mechanics/buffs-debuffs-consumables.md, enchants). */
export const enchantCatalogue: EnchantDefinition[] = []

/**
 * Validates and migrates an untrusted config (localStorage, share links): unknown items,
 * illegal races, bad talent codes and out-of-range values are repaired or reset to the
 * spec default, with a warning each.
 */
export function normalizeConfig(input: unknown): { config: SimConfig; warnings: string[] } {
  const spec = (input as Partial<SimConfig> | null)?.spec
  const safeSpec = spec && SPEC_IDS.includes(spec) ? spec : 'warrior-fury'
  return { config: { ...defaultConfig(safeSpec), ...(input as object) } as SimConfig, warnings: [] }
}

/** Final character stats for a config, synchronously (docs/mechanics/character-stats.md). */
export function computeSheet(_config: SimConfig): CharacterSheet | null {
  return null
}

/** Runs the simulation in Web Workers. Rejects with an AbortError if the signal aborts. */
export function simulate(
  _config: SimConfig,
  _options: { onProgress?: (progress: SimProgress) => void; signal?: AbortSignal } = {},
): Promise<SimResult> {
  return Promise.reject(new Error('The simulation engine is not implemented yet.'))
}
