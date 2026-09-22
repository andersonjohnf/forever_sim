import { SPEC_META, specs, type SpecDefinition } from '@/sim'
import { useSetup } from './setup-store'

/**
 * Specs shown in the spec switcher: only finished ones (docs/ux.md principle 8). Until the
 * first spec is finished there's nothing to hide behind, so every spec shows in development.
 */
export function visibleSpecs(): SpecDefinition[] {
  const finished = specs.filter((s) => s.available)
  return finished.length > 0 ? finished : specs
}

export function useSpecMeta() {
  return SPEC_META[useSetup((s) => s.config.spec)]
}
