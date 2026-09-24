import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultGearFor, slotsOffDefault } from '@/features/gear/default-set'
import { defaultConfig, defaultTalents, normalizeConfig, preRaidListGear, type SimConfig, type SpecId } from '@/sim'

// The store persists to localStorage, which Node doesn't have: a Map stands in for it, and a test
// can fill it up.
const memory = new Map<string, string>()
let full = false
/** The longest value storage still has room for: a nearly full storage refuses the big save, not a small key. */
let roomFor = Infinity
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (full || value.length > roomFor) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    memory.set(key, value)
  },
  removeItem: (key: string) => void memory.delete(key),
})
const notices = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('sonner', () => ({ toast: notices }))
const { DEFAULTS_NOTICE_KEY, takeDefaultsUpdates, useSetup } = await import('./setup-store')
const { packSetup } = await import('./share')
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
    // Only saves the list shows count: one for a spec the sim doesn't offer (every spec it knows
    // ships, so one it doesn't know) can't be deleted there.
    const save = (spec: string) => ({ id: spec, name: spec, savedAt: '2026-09-23T10:00:00.000Z', config: { ...fresh('warrior-fury'), spec } })
    memory.set(SAVED_SETUPS_KEY, JSON.stringify({ version: 1, setups: [save('mage-spellblade')] }))
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

// docs/architecture.md "Following the defaults"
describe('the automatic save follows the defaults', () => {
  const KEY = 'forever-sim:setup'
  /**
   * v1's defaults: the pre-raid lists alone, and v1's talents where they differ from today's, as a save
   * from then holds them (setup version 1, its talents on 1.60.1.69913's trees).
   */
  const v1 = (spec: SpecId, talents?: string): SimConfig =>
    ({ ...normalizeConfig({ ...defaultConfig(spec), gear: preRaidListGear(spec) }).config, version: 1, ...(talents ? { talents } : {}) }) as unknown as SimConfig
  const seed = (state: object) => memory.set(KEY, JSON.stringify({ state, version: 1 }))
  const saved = () => JSON.parse(memory.get(KEY)!).state
  /** A load, as the page's: hydration, then its save once the store exists (a microtask). */
  const load = async () => {
    await useSetup.persist.rehydrate()
    await Promise.resolve()
  }
  const HELM_OF_VALOR = { itemId: 16731, enchantId: 'arcanumFocus' }

  test('an old save moves what was never changed to today’s defaults, keeps the rest, and says so once', async () => {
    const paladin = { ...v1('paladin-protection', '2-4530513321301551-502'), gear: { ...v1('paladin-protection').gear, head: HELM_OF_VALOR } }
    const warrior = v1('warrior-protection', '05-05-552001233201210531')
    const fury = normalizeConfig(defaultConfig('warrior-fury', 'horde-orc')).config
    seed({ config: paladin, bySpec: { 'warrior-protection': warrior, 'warrior-fury': fury }, section: 'gear' })
    takeDefaultsUpdates()
    await load()

    const { config } = store()
    expect(config.spec).toBe('paladin-protection')
    expect(config.gear).toEqual({ ...defaultGearFor('paladin-protection', 'alliance-human'), head: HELM_OF_VALOR })
    expect(config.talents).toBe(defaultTalents('paladin-protection'))
    expect(takeDefaultsUpdates()).toEqual([
      { spec: 'paladin-protection', gear: true, talents: true },
      { spec: 'warrior-protection', gear: true, talents: true },
    ])
    // The other spec's setup moved too, and a spec switch brings it.
    store().setSpec('warrior-protection')
    expect(store().config).toEqual(normalizeConfig(defaultConfig('warrior-protection')).config)
    store().setSpec('warrior-fury')
    expect(store().config.race).toBe('horde-orc')
    store().setSpec('paladin-protection')

    // The load saved what follows the defaults, so the next load moves nothing and says nothing.
    expect(saved().following['paladin-protection'].gear).not.toContain('head')
    expect(saved().following['paladin-protection'].talents).toBe(true)
    const before = store().config
    await load()
    expect(store().config).toEqual(before)
    expect(takeDefaultsUpdates()).toEqual([])
  })

  test('a save that says what follows the defaults: those parts take newer defaults, the player’s never do', async () => {
    const d = normalizeConfig(defaultConfig('paladin-protection')).config
    // Saved when the default head was Helm of Valor (as a later default change would leave it), with the
    // player's own talents and v1's neck, chosen after saves said what follows.
    const config = { ...d, talents: '2-4530513321301551-502', gear: { ...d.gear, head: HELM_OF_VALOR, neck: { itemId: 13091 } } }
    const follow = { gear: Object.keys(d.gear).filter((slot) => slot !== 'neck'), talents: false }
    seed({ config, bySpec: {}, section: 'gear', following: { 'paladin-protection': follow } })
    takeDefaultsUpdates()
    await load()
    expect(store().config.gear.head).toEqual(d.gear.head)
    expect(store().config.gear.neck).toEqual({ itemId: 13091 })
    expect(store().config.talents).toBe('2-4530513321301551-502')
    expect(takeDefaultsUpdates()).toEqual([{ spec: 'paladin-protection', gear: true, talents: false }])
  })

  test('the player’s own build on 1.60.1.69913’s trees is mapped by name, says what it lost once, and saves on today’s', async () => {
    // Saved after saves said what follows, before 1.60.1.70009: version 1, the player's own Retribution talents.
    const d = normalizeConfig(defaultConfig('paladin-retribution')).config
    const config = { ...d, version: 1, talents: '250003-503-052052310012330321' }
    seed({ config, bySpec: {}, section: 'gear', following: { 'paladin-retribution': { gear: Object.keys(d.gear), talents: false } } })
    takeDefaultsUpdates()
    await load()
    expect(store().config.talents).toBe('50003-503-05205231001')
    const [update] = takeDefaultsUpdates()
    expect(update).toMatchObject({ spec: 'paladin-retribution', gear: false, talents: false })
    expect(update.refunds?.map((r) => `${r.name} ${r.points}`)).toEqual([
      'Improved Holy Strike 2',
      'Crusade 2',
      'Two-Handed Weapon Specialization 3',
      'Vengeance 3',
      'Champion of the Light 3',
      'Instrument of Law 2',
      'Twist of Light 1',
    ])
    // The load saved it on today's trees, so the next one has nothing to say.
    expect(saved().config).toMatchObject({ version: 2, talents: '50003-503-05205231001' })
    await load()
    expect(takeDefaultsUpdates()).toEqual([])
  })

  test('a shared link’s or saved setup’s old gear and talents are kept exactly, through reloads', async () => {
    // A link from then, as loading it gives it: its talents mapped onto today's trees.
    const shared = normalizeConfig({ ...v1('paladin-protection', '2-4530513321301551-502'), race: 'alliance-dwarf' }).config
    expect(shared.talents).toBe('-4530513321301551-502')
    const code = await packSetup(shared)
    store().replace(shared)
    expect(store().config).toBe(shared)
    await load()
    expect(store().config).toEqual(shared)
    expect(takeDefaultsUpdates()).toEqual([])
    // Its code still packs the same.
    expect(await packSetup(store().config)).toBe(code)
  })

  test('a fresh visit has nothing to move and says nothing', async () => {
    memory.delete(KEY)
    takeDefaultsUpdates()
    await load()
    expect(takeDefaultsUpdates()).toEqual([])
  })

  test('a slot a Unique rule kept from its default still follows it, and takes it once the rule allows', async () => {
    // The player wears today's default first trinket in the second slot; the first held v1's pick.
    const d = normalizeConfig(defaultConfig('warrior-protection')).config
    const v1Trinket = v1('warrior-protection').gear.trinket1
    const config = { ...d, gear: { ...d.gear, trinket1: v1Trinket, trinket2: d.gear.trinket1 } }
    seed({ config, bySpec: {}, section: 'gear' })
    takeDefaultsUpdates()
    await load()
    expect(store().config.gear.trinket1).toEqual(v1Trinket)
    // Blocked, not the player's: the save still has it following the default.
    expect(saved().following['warrior-protection'].gear).toContain('trinket1')
    expect(saved().following['warrior-protection'].gear).not.toContain('trinket2')
    // A reload tries again, still blocked, and keeps it following.
    await load()
    store().update((c) => ({ ...c }))
    expect(saved().following['warrior-protection'].gear).toContain('trinket1')
    // The player takes the trinket out of the second slot: the next load puts the default in the first.
    store().update((c) => ({ ...c, gear: { ...c.gear, trinket2: d.gear.trinket2 } }))
    await load()
    expect(store().config.gear.trinket1).toEqual(d.gear.trinket1)
    expect(slotsOffDefault(store().config)).toEqual([])
  })

  test('a blocked slot the player changes is theirs', async () => {
    const d = normalizeConfig(defaultConfig('warrior-protection')).config
    const config = { ...d, gear: { ...d.gear, trinket1: v1('warrior-protection').gear.trinket1, trinket2: d.gear.trinket1 } }
    seed({ config, bySpec: {}, section: 'gear' })
    await load()
    const own = { itemId: 11810 }
    store().update((c) => ({ ...c, gear: { ...c.gear, trinket1: own } }))
    expect(saved().following['warrior-protection'].gear).not.toContain('trinket1')
  })

  test('with the save failing for want of room, the same move is announced once, not every visit', async () => {
    const paladin = v1('paladin-protection', '2-4530513321301551-502')
    memory.delete(DEFAULTS_NOTICE_KEY)
    seed({ config: paladin, bySpec: {}, section: 'gear' })
    roomFor = 100
    try {
      takeDefaultsUpdates()
      await load()
      expect(takeDefaultsUpdates()).toEqual([{ spec: 'paladin-protection', gear: true, talents: true }])
      // The save failed: the old one is still there, so the next visit makes the same move, quietly.
      expect(saved().following).toBeUndefined()
      await load()
      expect(store().config.talents).toBe(defaultTalents('paladin-protection'))
      expect(takeDefaultsUpdates()).toEqual([])
      // A move to another setup is news.
      seed({ config: { ...paladin, gear: { ...paladin.gear, head: HELM_OF_VALOR } }, bySpec: {}, section: 'gear' })
      await load()
      expect(takeDefaultsUpdates()).toEqual([{ spec: 'paladin-protection', gear: true, talents: true }])
    } finally {
      roomFor = Infinity
    }
  })

  test('storage that can’t keep the notice’s key still announces', async () => {
    seed({ config: v1('paladin-protection', '2-4530513321301551-502'), bySpec: {}, section: 'gear' })
    memory.delete(DEFAULTS_NOTICE_KEY)
    full = true
    try {
      await load()
      expect(takeDefaultsUpdates()).toHaveLength(1)
      await load()
      expect(takeDefaultsUpdates()).toHaveLength(1)
    } finally {
      full = false
    }
  })
})

// Issue #8: a stored save is untrusted. Unknown or malformed keys, and a tab that no longer exists,
// fall back safely instead of breaking the app or putting one spec's setup under another.
describe('a malformed automatic save', () => {
  const KEY = 'forever-sim:setup'
  const load = async () => {
    await useSetup.persist.rehydrate()
    await Promise.resolve()
  }
  const fury = fresh('warrior-fury', 'horde-orc')
  const arms = fresh('warrior-arms', 'horde-troll')
  const following = { 'warrior-fury': { gear: [], talents: false }, 'warrior-arms': { gear: [], talents: false } }
  const seedRaw = (raw: string) => memory.set(KEY, raw)
  const seed = (state: unknown, version: unknown = 1) => seedRaw(JSON.stringify({ state, version }))
  beforeEach(() => {
    useSetup.setState({ config: fresh('warrior-fury'), bySpec: {}, section: 'gear' })
  })

  test('a stored tab that no longer exists opens Gear', async () => {
    for (const section of ['stats', 'constructor', 42, null, { id: 'gear' }]) {
      useSetup.setState({ section: 'fight' })
      seed({ config: fury, bySpec: {}, section, following })
      await load()
      expect(store().section, JSON.stringify(section)).toBe('gear')
      expect(store().config.race).toBe('horde-orc')
    }
    seed({ config: fury, bySpec: {}, section: 'rotation', following })
    await load()
    expect(store().section).toBe('rotation')
  })

  test('drops setups stored under a spec the sim doesn’t know, or under another spec’s key', async () => {
    const bySpec = { 'warrior-arms': fury, 'warrior-berserker': arms, toString: arms, constructor: arms, 'rogue-combat': 'garbage' }
    // A key JSON can hold but an object literal can't set: it must not become the list's prototype.
    const raw = JSON.stringify({ state: { config: fury, bySpec, section: 'gear', following }, version: 1 }).replace('"toString":', '"__proto__":')
    seedRaw(raw)
    await load()
    const { bySpec: loaded } = store()
    expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype)
    expect(Object.keys(loaded)).toEqual([])
    // Arms opens on its own defaults, not on the Fury setup stored under its name.
    store().setSpec('warrior-arms')
    expect(store().config).toEqual(fresh('warrior-arms'))
    store().setSpec('rogue-combat')
    expect(store().config.spec).toBe('rogue-combat')
  })

  test('a last-used spec it doesn’t know opens the default spec on the player’s own setup for it (AR-5)', async () => {
    // A newer version's save, in another tab: its current spec is one this version doesn't have.
    // Normalizing it would read it as a Fury setup and put it over the player's own Fury setup.
    seed({ config: { ...arms, spec: 'mage-bogus' }, bySpec: { 'warrior-fury': fury, 'warrior-arms': arms }, section: 'gear', following }, 2)
    await load()
    expect(store().config.spec).toBe('warrior-fury')
    expect(store().config.race).toBe('horde-orc')
    // Still the player's after a round trip through Arms, which kept its own.
    store().setSpec('warrior-arms')
    expect(store().config.race).toBe('horde-troll')
    store().setSpec('warrior-fury')
    expect(store().config.race).toBe('horde-orc')

    // With no setup of its own stored, the default spec opens on its defaults.
    seed({ config: { ...arms, spec: 'mage-bogus' }, bySpec: {}, section: 'gear', following }, 2)
    await load()
    expect(store().config).toEqual(fresh('warrior-fury'))
  })

  test('keeps a well-formed save’s other specs', async () => {
    seed({ config: fury, bySpec: { 'warrior-arms': arms }, section: 'talents', following })
    await load()
    expect(store().section).toBe('talents')
    store().setSpec('warrior-arms')
    expect(store().config.race).toBe('horde-troll')
  })

  test('a save whose state isn’t a setup, or that isn’t JSON, opens the defaults', async () => {
    for (const state of [null, 'text', 7, [fury], { config: 'garbage', bySpec: [arms], section: 'gear' }, { config: [1, 2], bySpec: 'x' }]) {
      useSetup.setState({ config: fresh('warrior-fury'), bySpec: {}, section: 'fight' })
      seed(state)
      await expect(load(), JSON.stringify(state)).resolves.toBeUndefined()
      expect(store().config.spec).toBe('warrior-fury')
      expect(store().config.race).toBe(fresh('warrior-fury').race)
      expect(store().bySpec).toEqual({})
    }
    seedRaw('{"state": {"config": ')
    await expect(load()).resolves.toBeUndefined()
    // Still usable: a change applies and saves.
    store().update((c) => ({ ...c, race: 'horde-troll' }))
    expect(JSON.parse(memory.get(KEY)!).state.config.race).toBe('horde-troll')
  })

  test('a save from another version of the app is read the same careful way, without an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      for (const version of [0, 2]) {
        seed({ config: fury, bySpec: { 'warrior-arms': arms, bogus: arms }, section: 'nope', following }, version)
        await load()
        expect(store().config.race, String(version)).toBe('horde-orc')
        expect(Object.keys(store().bySpec)).toEqual(['warrior-arms'])
        expect(store().section).toBe('gear')
      }
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })
})
