// The user's setup (docs/ux.md#persistence-and-sharing): the current SimConfig plus the last
// setup per spec, so switching specs and back keeps your changes. Persisted to localStorage;
// anything loaded back goes through the engine's normalizeConfig, and the parts the player never
// changed take the current defaults (./follow-defaults.ts).
import { toast } from 'sonner'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { sameEntry } from '@/features/gear/default-set'
import { defaultConfig, GEAR_SLOTS, normalizeConfig, SPEC_IDS, type EquippedItem, type GearSlot, type SimConfig, type SpecId } from '@/sim'
import { followDefaults, following, legacyFollowing, readFollowing, writtenGearOf, writtenV1Talents, type DefaultsUpdate, type Following } from './follow-defaults'
import { autoSaveFullMessage, hasShownSaves } from './saved-setups'
import { defaultSpec, isVisibleSpec } from './specs'
import { isQuotaError } from './storage-errors'

/**
 * Every tab, in the order the app shows them (src/App.tsx), so a stored one that no longer exists
 * opens the default instead (issue #8). `Section` is derived from it, so the two can't drift.
 */
export const SECTION_IDS = ['character', 'talents', 'gear', 'buffs', 'rotation', 'fight'] as const
export type Section = (typeof SECTION_IDS)[number]

/** The tab a first visit opens on, and a stored tab that no longer exists. */
const DEFAULT_SECTION: Section = 'gear'

/** Whether a stored value is one of today's tabs. */
export const isSection = (value: unknown): value is Section => typeof value === 'string' && (SECTION_IDS as readonly string[]).includes(value)

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

/**
 * The slots the last load couldn't move to their default (a Unique rule or a two-hander, in
 * followDefaults), per spec, with what each held then. They still follow the default while they hold
 * that, so the save keeps them in `following` and the next load tries again; a change to one makes it
 * the player's, and a replaced setup (a link, a saved setup, Reset) drops its spec's.
 */
let blockedSlots: Partial<Record<SpecId, Partial<Record<GearSlot, EquippedItem | undefined>>>> = {}

/** The parts of a setup that follow the defaults: those holding them, and the slots a load couldn't move yet. */
function followingOf(config: SimConfig): Following {
  const follow = following(config)
  const blocked = blockedSlots[config.spec] ?? {}
  const held = (slot: GearSlot) => Object.hasOwn(blocked, slot) && sameEntry(config.gear[slot], blocked[slot])
  return { ...follow, gear: GEAR_SLOTS.filter((slot) => follow.gear.includes(slot) || held(slot)) }
}

/**
 * The localStorage key that remembers the last defaults notice, apart from the automatic save: when
 * that save can't be written (full storage), every visit makes the same move again, and this keeps it
 * from saying so every time.
 */
export const DEFAULTS_NOTICE_KEY = 'forever-sim:defaults-notice'

/** A short digest of what a load moved to: the moved specs' talents, gear and boss melee (FNV-1a, 32 bits). */
function digest(moved: readonly SimConfig[]): string {
  const text = JSON.stringify(moved.map((c) => [c.spec, c.talents, GEAR_SLOTS.map((slot) => c.gear[slot] ?? null), c.fight.boss.damageMin, c.fight.boss.damageMax]))
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16)
}

/**
 * Whether a load's move is news: not the same move the last notice announced. Records it, so the
 * next load that makes the same move says nothing. Storage that can't be read or written is news.
 */
function isNewMove(moved: readonly SimConfig[]): boolean {
  const value = digest(moved)
  try {
    if (localStorage.getItem(DEFAULTS_NOTICE_KEY) === value) return false
    localStorage.setItem(DEFAULTS_NOTICE_KEY, value)
  } catch {
    // Blocked or full: announce, as without this key.
  }
  return true
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
      section: DEFAULT_SECTION,
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
        // A deliberate setup: what it holds is what follows, not the slots a load couldn't move.
        delete blockedSlots[config.spec]
        set({ config, bySpec: config.spec === previous.spec ? bySpec : { ...bySpec, [previous.spec]: previous } })
      },
    }),
    {
      name: 'forever-sim:setup',
      version: 1,
      storage: createJSONStorage(() => autoSaveStorage),
      // A save from another version of the app (an older one, or a newer one's in another tab) goes
      // through the same careful merge as any other, which keeps what it can read; without this,
      // zustand logs an error and drops it.
      migrate: (persisted) => persisted,
      partialize: ({ config, bySpec, section }): SavedSetup => {
        const follows: SavedSetup['following'] = {}
        for (const other of Object.values(bySpec)) if (other) follows[other.spec] = followingOf(other)
        // The current spec's entry in bySpec is stale: its own setup says what follows.
        follows[config.spec] = followingOf(config)
        return { config, bySpec, section, following: follows }
      },
      // The stored save is untrusted (issue #8): anything it holds that isn't what this version
      // saves falls back to the default rather than breaking the page or mixing up specs.
      merge: (persisted, current) => {
        const saved: Partial<Record<keyof SavedSetup, unknown>> = isRecord(persisted) ? persisted : {}
        const follows = readFollowing(saved.following)
        const updates: DefaultsUpdate[] = []
        const moves: SimConfig[] = []
        let migrated = false
        blockedSlots = {}
        // A saved setup, normalized, with the parts the player never changed on today's defaults.
        const load = (raw: unknown): SimConfig => {
          const { config: normalized, talentChange, questRemovals = [], bossMeleeMoved } = normalizeConfig(raw)
          const follow = follows[normalized.spec]
          if (!follow) migrated = true
          const moved = followDefaults(normalized, follow ?? legacyFollowing(normalized, writtenV1Talents(raw), writtenGearOf(raw)))
          // What reading a build from older talent trees changed is said (docs/data/talents.md
          // #tree-versions); a build that follows the default takes today's, which changes nothing.
          const change = moved.talents ? undefined : talentChange
          // Another class's quest reward the player chose is gone, and they must pick another, so
          // it's said (docs/data/items.md#class-quest-rewards). One in a slot that follows the
          // defaults was the default, and today's default took its place: that move says enough.
          const removed = questRemovals.filter((q) => !moved.config.gear[q.slot])
          // A tank's boss melee that was the former default took today's (FORMER_BOSS_MELEE): its
          // results moved, so it's said (JL-3, JU-1).
          if (moved.gear || moved.talents || change || removed.length > 0 || bossMeleeMoved) {
            updates.push({
              spec: normalized.spec,
              gear: moved.gear,
              talents: moved.talents,
              ...(change ? { change } : {}),
              ...(removed.length > 0 ? { removed } : {}),
              ...(bossMeleeMoved ? { boss: true as const } : {}),
            })
            moves.push(moved.config)
          }
          if (moved.blocked.length > 0) {
            blockedSlots[normalized.spec] = Object.fromEntries(moved.blocked.map((slot) => [slot, moved.config.gear[slot]]))
          }
          return moved.config
        }
        // The last spec used, if the app still offers it (docs/ux.md principles 1 and 8); a setup
        // for a spec it doesn't offer is kept for later, and the default spec opens instead. One
        // for a spec this version doesn't know at all (a newer version's, in another tab) is
        // ignored: normalizing would read it as the default spec's and replace the player's own
        // setup for that spec (AR-5). The default spec's stored setup opens instead.
        const known = isRecord(saved.config) && SPEC_IDS.includes(saved.config.spec as SpecId)
        let config: SimConfig | null = known ? load(saved.config) : null
        const bySpec: SetupState['bySpec'] = {}
        for (const [spec, other] of Object.entries(isRecord(saved.bySpec) ? saved.bySpec : {})) {
          // Only a setup stored under its own spec's key: an unknown key ("__proto__" included) or
          // one holding another spec's setup would open the wrong setup when you switch to it.
          if (!SPEC_IDS.includes(spec as SpecId) || !isRecord(other) || other.spec !== spec) continue
          // The current spec's entry is stale, and `following` describes the current setup, not it.
          bySpec[spec as SpecId] = spec === config?.spec ? normalizeConfig(other).config : load(other)
        }
        if (config === null) config = bySpec[defaultSpec()] ?? (saved.config === undefined ? current.config : fresh(defaultSpec()))
        else if (!isVisibleSpec(config.spec)) {
          bySpec[config.spec] = config
          config = bySpec[defaultSpec()] ?? fresh(defaultSpec())
        }
        const visible = updates.filter((u) => isVisibleSpec(u.spec))
        // Said once per move, even if the save below fails and the next visit makes it again.
        loadUpdates = visible.length > 0 && isNewMove(moves) ? visible : []
        // Hydration doesn't save. A load that moved anything, or read a save from before `following`,
        // saves at once (once the store exists), so the next load finds nothing to move and says nothing.
        if (updates.length > 0 || migrated) queueMicrotask(() => useSetup.setState({}))
        return {
          ...current,
          config,
          bySpec,
          // A tab that no longer exists (or never did) opens the default one.
          section: isSection(saved.section) ? saved.section : DEFAULT_SECTION,
        }
      },
    },
  ),
)

