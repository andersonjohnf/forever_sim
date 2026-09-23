// Which specs the app offers (docs/ux.md principles 1 and 8). setup-store imports these while
// it's being created, and this module imports the store for useSpecMeta: the helpers are
// function declarations, so the import cycle is safe in either load order.
import { SPEC_META, specs, type SpecDefinition, type SpecId } from '@/sim'
import { useSetup } from './setup-store'

/**
 * Specs shown in the spec switcher: only finished ones (docs/ux.md principle 8). Until the
 * first spec is finished there's nothing to hide behind, so every spec shows in development.
 */
export function visibleSpecs(): SpecDefinition[] {
  const finished = specs.filter((s) => s.available)
  return finished.length > 0 ? finished : specs
}

/** The spec a first visit opens on: Fury, or the first finished spec if Fury isn't (docs/ux.md principle 1). */
export function defaultSpec(): SpecId {
  const visible = visibleSpecs()
  return visible.find((s) => s.id === 'warrior-fury')?.id ?? visible[0].id
}

/** Whether a saved or shared setup's spec can be shown: the switcher offers it. */
export function isVisibleSpec(spec: SpecId): boolean {
  return visibleSpecs().some((s) => s.id === spec)
}

export function useSpecMeta() {
  return SPEC_META[useSetup((s) => s.config.spec)]
}
