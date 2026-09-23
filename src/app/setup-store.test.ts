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

  test('undoing a shared link for your other spec gives your own setup for it back', () => {
    store().setSpec('warrior-arms')
    setRace('horde-orc')
    store().setSpec('warrior-fury')
    setRace('horde-tauren')

    const undo = store().replace(fresh('warrior-arms', 'horde-troll'))
    expect(store().config.spec).toBe('warrior-arms')
    expect(store().config.race).toBe('horde-troll')
    undo()
    expect(store().config.spec).toBe('warrior-fury')
    expect(store().config.race).toBe('horde-tauren')
    expect(raceOf('warrior-arms')).toBe('horde-orc')
  })

  test('undo still restores both specs after switching spec in between', () => {
    store().setSpec('warrior-arms')
    setRace('horde-orc')
    store().setSpec('warrior-fury')

    const undo = store().replace(fresh('warrior-arms', 'horde-troll'))
    store().setSpec('warrior-fury')
    undo()
    expect(store().config.spec).toBe('warrior-fury')
    expect(raceOf('warrior-arms')).toBe('horde-orc')
  })

  test('a shared link for your current spec leaves your other spec alone', () => {
    store().setSpec('warrior-arms')
    setRace('horde-orc')
    store().setSpec('warrior-fury')

    const undo = store().replace(fresh('warrior-fury', 'horde-troll'))
    expect(store().config.race).toBe('horde-troll')
    undo()
    expect(store().config.race).toBe(fresh('warrior-fury').race)
    expect(raceOf('warrior-arms')).toBe('horde-orc')
  })

  test('without Undo, the link’s setup is kept and your own current one is saved for its spec', () => {
    setRace('horde-tauren')
    store().replace(fresh('warrior-arms', 'horde-troll'))
    expect(raceOf('warrior-fury')).toBe('horde-tauren')
    expect(raceOf('warrior-arms')).toBe('horde-troll')
  })

  test('reset’s Undo puts your setup back', () => {
    setRace('horde-troll')
    const undo = store().reset()
    expect(store().config.race).toBe(fresh('warrior-fury').race)
    undo()
    expect(store().config.race).toBe('horde-troll')
  })
})
