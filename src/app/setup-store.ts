// The user's setup (docs/ux.md#persistence-and-sharing): the current SimConfig plus the last
// setup per spec, so switching specs and back keeps your changes. Persisted to localStorage;
// anything loaded back goes through the engine's normalizeConfig.
import { toast } from 'sonner'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { defaultConfig, normalizeConfig, type SimConfig, type SpecId } from '@/sim'
import { autoSaveFullMessage, hasShownSaves } from './saved-setups'
import { defaultSpec, isVisibleSpec } from './specs'
import { isQuotaError } from './storage-errors'

export type Section = 'character' | 'talents' | 'gear' | 'buffs' | 'rotation' | 'fight'

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
  reset: () => void
  /**
   * Replaces the current setup, e.g. with a shared link's. A setup for another spec switches to
   * it, saving the current one as setSpec does.
   */
  replace: (config: SimConfig) => void
}

function fresh(spec: SpecId): SimConfig {
  return normalizeConfig(defaultConfig(spec)).config
}

/** Whether the notice that the automatic save failed is up, or was, since the last save that worked. */
let saidFull = false

/**
 * The automatic save's storage: localStorage, with its errors caught, so a change never throws
 * because the setup can't be written. When this site's storage is full, a notice says so once,
 * until a save works again, and what makes room: deleting saves, or with none, clearing the site's
 * data. The change itself still applies, for as long as the page is open.
 * Storage the browser blocks fails quietly, as zustand does when it can't reach localStorage at
 * all: the Setups sheet says so where it matters.
 */
export const autoSaveStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
      saidFull = false
    } catch (error) {
      if (!isQuotaError(error) || saidFull) return
      saidFull = true
      toast.error('Your changes aren’t being kept', { id: 'auto-save', description: autoSaveFullMessage(hasShownSaves()) })
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // Nothing to do: it stays as it was.
    }
  },
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
      },
    }),
    {
      name: 'forever-sim:setup',
      version: 1,
      storage: createJSONStorage(() => autoSaveStorage),
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
