// The user's setup (docs/ux.md#persistence-and-sharing): the current SimConfig plus the last
// setup per spec, so switching specs and back keeps your changes. Persisted to localStorage;
// anything loaded back goes through the engine's normalizeConfig, and the parts the player never
// changed take the current defaults (./follow-defaults.ts).
import { toast } from 'sonner'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { defaultConfig, normalizeConfig, type SimConfig, type SpecId } from '@/sim'
import { followDefaults, following, legacyFollowing, readFollowing, type DefaultsUpdate, type Following } from './follow-defaults'
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

/**
 * What the automatic save holds: the setups, and for each spec the parts that hold its defaults
 * (docs/architecture.md "Following the defaults"). A save from before `following` has none.
 */
interface SavedSetup {
  config: SimConfig
  bySpec: Partial<Record<SpecId, SimConfig>>
  section: Section
  following: Partial<Record<SpecId, Following>>
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** What the last load moved to newer defaults, for its notice (useDefaultsNotice); taken once. */
let loadUpdates: DefaultsUpdate[] = []

/** The parts of the setup the last load moved to newer defaults, once: a second call gets none. */
export function takeDefaultsUpdates(): DefaultsUpdate[] {
  const updates = loadUpdates
  loadUpdates = []
  return updates
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
      partialize: ({ config, bySpec, section }): SavedSetup => {
        const follows: SavedSetup['following'] = {}
        for (const other of Object.values(bySpec)) if (other) follows[other.spec] = following(other)
        // The current spec's entry in bySpec is stale: its own setup says what follows.
        follows[config.spec] = following(config)
        return { config, bySpec, section, following: follows }
      },
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Record<keyof SavedSetup, unknown>>
        const follows = readFollowing(saved.following)
        const updates: DefaultsUpdate[] = []
        let migrated = false
        // A saved setup, normalized, with the parts the player never changed on today's defaults.
        const load = (raw: unknown): SimConfig => {
          const normalized = normalizeConfig(raw).config
          const follow = follows[normalized.spec]
          if (!follow) migrated = true
          const moved = followDefaults(normalized, follow ?? legacyFollowing(normalized))
          if (moved.gear || moved.talents) updates.push({ spec: normalized.spec, gear: moved.gear, talents: moved.talents })
          return moved.config
        }
        // The last spec used, if the app still offers it (docs/ux.md principles 1 and 8); a setup
        // for a spec it doesn't offer is kept for later, and the default spec opens instead.
        let config = saved.config ? load(saved.config) : current.config
        const bySpec: SetupState['bySpec'] = {}
        for (const [spec, other] of Object.entries(isRecord(saved.bySpec) ? saved.bySpec : {})) {
          // The current spec's entry is stale, and `following` describes the current setup, not it.
          bySpec[spec as SpecId] = spec === config.spec ? normalizeConfig(other).config : load(other)
        }
        if (!isVisibleSpec(config.spec)) {
          bySpec[config.spec] = config
          config = bySpec[defaultSpec()] ?? fresh(defaultSpec())
        }
        loadUpdates = updates.filter((u) => isVisibleSpec(u.spec))
        // Hydration doesn't save. A load that moved anything, or read a save from before `following`,
        // saves at once (once the store exists), so the next load finds nothing to move and says nothing.
        if (updates.length > 0 || migrated) queueMicrotask(() => useSetup.setState({}))
        return {
          ...current,
          config,
          bySpec,
          section: (saved.section as Section | undefined) ?? current.section,
        }
      },
    },
  ),
)

