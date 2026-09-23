// The user's setup (docs/ux.md#persistence-and-sharing): the current SimConfig plus the last
// setup per spec, so switching specs and back keeps your changes. Persisted to localStorage;
// anything loaded back goes through the engine's normalizeConfig.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { defaultConfig, normalizeConfig, type SimConfig, type SpecId } from '@/sim'
import { defaultSpec, isVisibleSpec } from './specs'

export type Section = 'character' | 'talents' | 'gear' | 'buffs' | 'rotation' | 'fight'

/** Puts the setup back as it was before a change: the current config and every spec's saved setup. */
export type Undo = () => void

interface SetupState {
  config: SimConfig
  /** The last setup of each spec other than the current one (the current spec's entry is stale). */
  bySpec: Partial<Record<SpecId, SimConfig>>
  section: Section
  setSection: (section: Section) => void
  /** Switches spec, saving the current setup for its spec and restoring the other spec's own. */
  setSpec: (spec: SpecId) => void
  /** Applies a change to the current config. */
  update: (change: (config: SimConfig) => SimConfig) => void
  /** Resets the current spec to its defaults. */
  reset: () => Undo
  /**
   * Replaces the current setup (a shared link, or putting one back). A setup for another spec
   * switches to it, saving the current one as setSpec does. The Undo restores the saved setups
   * too, so undoing a shared link for your other spec gives you back your own setup for it.
   */
  replace: (config: SimConfig) => Undo
}

function fresh(spec: SpecId): SimConfig {
  return normalizeConfig(defaultConfig(spec)).config
}

export const useSetup = create<SetupState>()(
  persist(
    (set, get) => ({
      config: fresh(defaultSpec()),
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
      reset: () => get().replace(fresh(get().config.spec)),
      replace: (config) => {
        const { config: previous, bySpec } = get()
        set({ config, bySpec: config.spec === previous.spec ? bySpec : { ...bySpec, [previous.spec]: previous } })
        return () => set({ config: previous, bySpec })
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
        // The last spec used, if the app still offers it (docs/ux.md principles 1 and 8); a setup
        // for a spec it doesn't offer is kept for later, and the default spec opens instead.
        let config = saved.config ? normalizeConfig(saved.config).config : current.config
        if (!isVisibleSpec(config.spec)) {
          bySpec[config.spec] = config
          config = bySpec[defaultSpec()] ?? fresh(defaultSpec())
        }
        return {
          ...current,
          config,
          bySpec,
          section: saved.section ?? current.section,
        }
      },
    },
  ),
)
