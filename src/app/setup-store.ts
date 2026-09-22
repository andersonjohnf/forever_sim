// The user's setup (docs/ux.md#persistence-and-sharing): the current SimConfig plus the last
// setup per spec, so switching specs and back keeps your changes. Persisted to localStorage;
// anything loaded back goes through the engine's normalizeConfig.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { defaultConfig, normalizeConfig, type SimConfig, type SpecId } from '@/sim'

export type Section = 'character' | 'talents' | 'gear' | 'buffs' | 'rotation' | 'fight'

interface SetupState {
  config: SimConfig
  bySpec: Partial<Record<SpecId, SimConfig>>
  section: Section
  setSection: (section: Section) => void
  setSpec: (spec: SpecId) => void
  /** Applies a change to the current config. */
  update: (change: (config: SimConfig) => SimConfig) => void
  /** Resets the current spec to its defaults. */
  reset: () => void
  /** Replaces the setup (a shared link). Returns the previous config, for Undo. */
  replace: (config: SimConfig) => SimConfig
}

const DEFAULT_SPEC: SpecId = 'warrior-fury'

function fresh(spec: SpecId): SimConfig {
  return normalizeConfig(defaultConfig(spec)).config
}

export const useSetup = create<SetupState>()(
  persist(
    (set, get) => ({
      config: fresh(DEFAULT_SPEC),
      bySpec: {},
      section: 'gear',
      setSection: (section) => set({ section }),
      setSpec: (spec) => {
        const { config, bySpec } = get()
        if (spec === config.spec) return
        set({
          bySpec: { ...bySpec, [config.spec]: config },
          config: bySpec[spec] ?? fresh(spec),
        })
      },
      update: (change) => set({ config: change(get().config) }),
      reset: () => set({ config: fresh(get().config.spec) }),
      replace: (config) => {
        const previous = get().config
        set({ config, bySpec: { ...get().bySpec, [previous.spec]: previous } })
        return previous
      },
    }),
    {
      name: 'forever-sim:setup',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ config, bySpec, section }) => ({ config, bySpec, section }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SetupState>
        const bySpec: SetupState['bySpec'] = {}
        for (const [spec, config] of Object.entries(saved.bySpec ?? {})) {
          bySpec[spec as SpecId] = normalizeConfig(config).config
        }
        return {
          ...current,
          config: saved.config ? normalizeConfig(saved.config).config : current.config,
          bySpec,
          section: saved.section ?? current.section,
        }
      },
    },
  ),
)
