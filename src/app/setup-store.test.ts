import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultConfig, normalizeConfig, type SimConfig, type SpecId } from '@/sim'

// The store persists to localStorage, which Node doesn't have: a Map stands in for it, and a test
// can fill it up.
const memory = new Map<string, string>()
let full = false
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    memory.set(key, value)
  },
  removeItem: (key: string) => void memory.delete(key),
})
const notices = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('sonner', () => ({ toast: notices }))
const { useSetup } = await import('./setup-store')
const { SAVED_SETUPS_KEY, storageMessage } = await import('./saved-setups')

const store = () => useSetup.getState()
const fresh = (spec: SpecId, race?: string): SimConfig => {
  const config = normalizeConfig(defaultConfig(spec)).config
  return race ? { ...config, race } : config
}
const setRace = (race: string) => store().update((c) => ({ ...c, race }))
const raceOf = (spec: SpecId) => {
  store().setSpec(spec)
  return store().config.race
}

beforeEach(() => {
  useSetup.setState({ config: fresh('warrior-fury'), bySpec: {} })
})

// docs/ux.md#persistence-and-sharing
describe('setup store', () => {
  test('switching spec keeps each spec’s own setup', () => {
    setRace('horde-troll')
    store().setSpec('warrior-arms')
    setRace('horde-orc')
    expect(raceOf('warrior-fury')).toBe('horde-troll')
    expect(raceOf('warrior-arms')).toBe('horde-orc')
  })

  test('a shared link for your other spec switches to it, and keeps your own current setup for its spec', () => {
    setRace('horde-tauren')
    store().replace(fresh('warrior-arms', 'horde-troll'))
    expect(store().config.spec).toBe('warrior-arms')
    expect(store().config.race).toBe('horde-troll')
    expect(raceOf('warrior-fury')).toBe('horde-tauren')
    expect(raceOf('warrior-arms')).toBe('horde-troll')
  })

  test('a shared link for your current spec leaves your other spec alone', () => {
    store().setSpec('warrior-arms')
    setRace('horde-orc')
    store().setSpec('warrior-fury')

    store().replace(fresh('warrior-fury', 'horde-troll'))
    expect(store().config.race).toBe('horde-troll')
    expect(raceOf('warrior-arms')).toBe('horde-orc')
  })

  test('reset puts the current spec back to its defaults, and leaves your other spec alone', () => {
    store().setSpec('warrior-arms')
    setRace('horde-orc')
    store().setSpec('warrior-fury')
    setRace('horde-troll')

    store().reset()
    expect(store().config).toEqual(fresh('warrior-fury'))
    expect(raceOf('warrior-arms')).toBe('horde-orc')
  })

  // LX7: a full localStorage made the automatic save throw out of every change.
  test('a change still applies when storage is full, and a notice says so once', () => {
    notices.error.mockClear()
    full = true
    try {
      expect(() => setRace('horde-troll')).not.toThrow()
      expect(() => setRace('horde-orc')).not.toThrow()
      expect(store().config.race).toBe('horde-orc')
      expect(notices.error).toHaveBeenCalledTimes(1)
      expect(notices.error.mock.calls[0][0]).toBe('Your changes aren’t being kept')
      // Once a save works again, a later failure says so again.
      full = false
      setRace('horde-tauren')
      expect(JSON.parse(memory.get('forever-sim:setup')!).state.config.race).toBe('horde-tauren')
      full = true
      setRace('horde-troll')
      expect(notices.error).toHaveBeenCalledTimes(2)
    } finally {
      full = false
    }
  })

  // VF3: it asked you to delete saved setups even when there were none.
  test('the full-storage notice asks you to delete saves only when there are some to delete', () => {
    const description = () => (notices.error.mock.lastCall![1] as { description: string }).description
    const fillUp = (race: string) => {
      notices.error.mockClear()
      full = true
      try {
        setRace(race)
      } finally {
        full = false
      }
      expect(notices.error).toHaveBeenCalledTimes(1)
      // A save that works resets the notice, so the next full storage says it again.
      setRace('alliance-human')
    }
    memory.delete(SAVED_SETUPS_KEY)
    fillUp('horde-troll')
    expect(description()).toBe(
      'Your browser’s storage for this site is full, but not with saved setups, so this setup will be lost when you close the page. Clearing this site’s data in your browser’s settings makes room, and resets your setup too.',
    )
    // The no-saves wording is the Setups sheet's.
    expect(description()).toContain(storageMessage('full', 'save', false).replace(/^.*but not with saved setups\. /, ''))
    // Only saves the list shows count: one for a spec the sim doesn't offer can't be deleted there.
    const save = (spec: string) => ({ id: spec, name: spec, savedAt: '2026-09-23T10:00:00.000Z', config: { ...fresh('warrior-fury'), spec } })
    memory.set(SAVED_SETUPS_KEY, JSON.stringify({ version: 1, setups: [save('paladin-protection')] }))
    fillUp('horde-orc')
    expect(description()).toMatch(/but not with saved setups/)
    memory.set(SAVED_SETUPS_KEY, JSON.stringify({ version: 1, setups: [save('warrior-arms')] }))
    fillUp('horde-tauren')
    expect(description()).toBe(
      'Your browser’s storage for this site is full, so this setup will be lost when you close the page. Delete saved setups you don’t need to make room.',
    )
    memory.delete(SAVED_SETUPS_KEY)
  })
})
