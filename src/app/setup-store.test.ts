import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultConfig, normalizeConfig, type SimConfig, type SpecId } from '@/sim'

// The store persists to localStorage, which Node doesn't have: a Map stands in for it.
const memory = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
})
const { useSetup } = await import('./setup-store')

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
})
