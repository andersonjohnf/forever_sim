import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultConfig, normalizeConfig, type SimConfig, type SpecId } from '@/sim'

// Storage is localStorage, which Node doesn't have: a Map stands in for it, and each test can make
// it refuse (blocked) or run out of room (full).
const memory = new Map<string, string>()
let refuse: 'get' | 'set' | 'full' | null = null
vi.stubGlobal('localStorage', {
  getItem: (key: string) => {
    if (refuse === 'get') throw new DOMException('The operation is insecure.', 'SecurityError')
    return memory.get(key) ?? null
  },
  setItem: (key: string, value: string) => {
    if (refuse === 'get' || refuse === 'set') throw new DOMException('The operation is insecure.', 'SecurityError')
    if (refuse === 'full') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    memory.set(key, value)
  },
  removeItem: (key: string) => void memory.delete(key),
})
const {
  addSetup,
  cleanName,
  deleteFromStorage,
  deleteSetup,
  formatDay,
  formatSavedAt,
  listSetups,
  MAX_NAME_LENGTH,
  nameProblem,
  parseSavedSetups,
  refreshSavedSetups,
  renameInStorage,
  renameSetup,
  replaceSetup,
  SAVED_SETUPS_KEY,
  sameName,
  saveSetup,
  saveToStorage,
  serializeSavedSetups,
  uniqueName,
  useSavedSetups,
} = await import('./saved-setups')
type StoredSetup = import('./saved-setups').StoredSetup

const fresh = (spec: SpecId, race?: string): SimConfig => {
  const config = normalizeConfig(defaultConfig(spec)).config
  return race ? { ...config, race } : config
}
const stored = (id: string, name: string, savedAt: string, config: unknown = fresh('warrior-fury')): StoredSetup => ({ id, name, savedAt, config })
let ids = 0
const nextId = () => `id-${++ids}`
const stamp = (day: number) => new Date(Date.UTC(2026, 8, day, 12)).toISOString()
const names = (setups: readonly { name: string }[]) => setups.map((s) => s.name)
const kept = () => JSON.parse(memory.get(SAVED_SETUPS_KEY) ?? 'null')

beforeEach(() => {
  memory.clear()
  refuse = null
  ids = 0
  useSavedSetups.setState({ setups: [], problem: null })
})

// docs/ux.md#setups
describe('names', () => {
  test('are trimmed, with each run of spaces as one', () => {
    expect(cleanName('  Raid   night \n')).toBe('Raid night')
  })

  test('are required, and at most 60 characters', () => {
    expect(nameProblem('')).toBe('Enter a name.')
    expect(nameProblem('   ')).toBe('Enter a name.')
    expect(nameProblem('x'.repeat(MAX_NAME_LENGTH))).toBeNull()
    expect(nameProblem(` ${'x'.repeat(MAX_NAME_LENGTH)} `)).toBeNull()
    expect(nameProblem('x'.repeat(MAX_NAME_LENGTH + 1))).toMatch(/60 characters/)
  })

  test('match whatever their case and spacing', () => {
    expect(sameName('Raid Night', ' raid  night')).toBe(true)
    expect(sameName('Raid night', 'Raid night 2')).toBe(false)
  })

  test('a unique name counts up from (2), within 60 characters', () => {
    const list = [{ name: 'Fury' }, { name: 'fury (2)' }]
    expect(uniqueName('Arms', list)).toBe('Arms')
    expect(uniqueName('Fury', list)).toBe('Fury (3)')
    // A name that already ends in a number counts on from it, rather than adding a second.
    expect(uniqueName('Fury (2)', list)).toBe('Fury (3)')
    const long = 'y'.repeat(MAX_NAME_LENGTH)
    const unique = uniqueName(long, [{ name: long }])
    expect(unique).toBe(`${'y'.repeat(MAX_NAME_LENGTH - 4)} (2)`)
    expect(unique).toHaveLength(MAX_NAME_LENGTH)
    expect(uniqueName('   ', [])).toBe('Setup')
  })

  test('the default day reads the same in every locale: "23 Sep"', () => {
    expect(formatDay(new Date(2026, 8, 23, 23, 59))).toBe('23 Sep')
    expect(formatDay(new Date(2026, 0, 1))).toBe('1 Jan')
  })

  test('a save’s date has its time this year, and its year before', () => {
    const now = new Date(2026, 8, 23, 18)
    expect(formatSavedAt(new Date(2026, 8, 23, 9, 5).toISOString(), now)).toBe('23 Sep, 09:05')
    expect(formatSavedAt(new Date(2025, 7, 19, 21, 30).toISOString(), now)).toBe('19 Aug 2025')
  })
})

describe('the saved list', () => {
  test('save adds a new setup first, with a fresh id', () => {
    const first = saveSetup([], 'Raid night', fresh('warrior-fury'), stamp(20), nextId)
    expect(first.ok && first.updated).toBe(false)
    if (!first.ok) throw new Error(first.error)
    const second = saveSetup(first.setups, '  Arms   test ', fresh('warrior-arms'), stamp(21), nextId)
    if (!second.ok) throw new Error(second.error)
    expect(names(second.setups)).toEqual(['Arms test', 'Raid night'])
    expect(second.setups.map((s) => s.id)).toEqual(['id-2', 'id-1'])
  })

  test('saving under a name that’s saved already replaces that save: "Updated"', () => {
    const list = [stored('a', 'Raid night', stamp(20)), stored('b', 'Other', stamp(21))]
    const troll = fresh('warrior-fury', 'horde-troll')
    const result = saveSetup(list, 'RAID NIGHT', troll, stamp(22), nextId)
    if (!result.ok) throw new Error(result.error)
    expect(result.updated).toBe(true)
    expect(result.setup).toEqual({ id: 'a', name: 'RAID NIGHT', savedAt: stamp(22), config: troll })
    expect(result.setups).toHaveLength(2)
    expect(listSetups(result.setups).map((s) => s.id)).toEqual(['a', 'b'])
  })

  test('a name that breaks the rules isn’t saved', () => {
    expect(saveSetup([], '  ', fresh('warrior-fury'), stamp(20), nextId)).toEqual({ ok: false, error: 'Enter a name.' })
    expect(saveSetup([], 'x'.repeat(61), fresh('warrior-fury'), stamp(20), nextId).ok).toBe(false)
  })

  test('rename changes only the name, and never takes another save’s', () => {
    const list = [stored('a', 'Raid night', stamp(20)), stored('b', 'Other', stamp(21))]
    const renamed = renameSetup(list, 'a', ' Onyxia ')
    if (!renamed.ok) throw new Error(renamed.error)
    expect(renamed.setups[0]).toEqual({ ...list[0], name: 'Onyxia' })
    expect(renameSetup(list, 'a', 'other')).toEqual({ ok: false, error: 'Another saved setup has that name.' })
    expect(renameSetup(list, 'a', '')).toEqual({ ok: false, error: 'Enter a name.' })
    // Its own name in another case is fine.
    expect(renameSetup(list, 'a', 'RAID NIGHT').ok).toBe(true)
    expect(renameSetup(list, 'gone', 'New').ok).toBe(false)
  })

  test('add, replace and delete', () => {
    const list = [stored('a', 'A', stamp(20))]
    const added = addSetup(list, stored('b', 'B', stamp(21)))
    expect(added.map((s) => s.id)).toEqual(['b', 'a'])
    const arms = fresh('warrior-arms')
    expect(replaceSetup(added, 'a', arms, stamp(22))[1]).toEqual({ id: 'a', name: 'A', savedAt: stamp(22), config: arms })
    expect(deleteSetup(added, 'b').map((s) => s.id)).toEqual(['a'])
  })

  test('lists newest first', () => {
    const list = [stored('old', 'Old', stamp(1)), stored('new', 'New', stamp(22)), stored('mid', 'Mid', stamp(10))]
    expect(names(listSetups(list))).toEqual(['New', 'Mid', 'Old'])
  })

  test('a stale setup is normalized when it’s read, and says what was out of date', () => {
    const stale = { version: 1, spec: 'warrior-arms', race: 'horde-troll', rotation: { aSettingThatWasRemoved: true } }
    const [setup] = listSetups([stored('a', 'Old arms', stamp(1), stale)])
    expect(setup.config.spec).toBe('warrior-arms')
    expect(setup.config.race).toBe('horde-troll')
    expect(setup.config.rotation).toEqual({})
    expect(setup.warnings).toEqual(['Rotation settings that don’t apply to this spec were reset.'])
    // A current one has nothing to say.
    expect(listSetups([stored('b', 'Fury', stamp(1))])[0].warnings).toEqual([])
  })

  test('a save for a spec the app doesn’t offer, or from a newer app, is kept but not shown', () => {
    const list = [
      stored('prot', 'Tank', stamp(3), { version: 1, spec: 'warrior-protection' }),
      stored('newer', 'Newer', stamp(2), { version: 2, spec: 'warrior-fury' }),
      stored('unknown', 'Unknown', stamp(1), { version: 1, spec: 'mage-fire' }),
      stored('fury', 'Fury', stamp(4)),
    ]
    expect(names(listSetups(list))).toEqual(['Fury'])
    // Its name doesn't count: saving under it adds a save rather than replacing one you can't see.
    const result = saveSetup(list, 'Tank', fresh('warrior-fury'), stamp(5), nextId)
    expect(result.ok && result.updated).toBe(false)
    expect(result.ok && result.setups).toHaveLength(5)
    expect(renameSetup(list, 'fury', 'tank').ok).toBe(true)
  })
})

describe('the stored form', () => {
  test('round-trips', () => {
    const list = [stored('a', 'A', stamp(20)), stored('b', 'B', stamp(21), fresh('warrior-arms'))]
    const text = serializeSavedSetups(list)
    expect(JSON.parse(text)).toEqual({ version: 1, setups: list })
    expect(parseSavedSetups(text)).toEqual({ ok: true, setups: list, skipped: 0 })
    expect(parseSavedSetups(null)).toEqual({ ok: true, setups: [], skipped: 0 })
  })

  test('what isn’t the stored form is corrupt; a newer version is left alone', () => {
    expect(parseSavedSetups('{not json')).toEqual({ ok: false, problem: 'corrupt' })
    expect(parseSavedSetups('[]')).toEqual({ ok: false, problem: 'corrupt' })
    expect(parseSavedSetups('{"version":1}')).toEqual({ ok: false, problem: 'corrupt' })
    expect(parseSavedSetups('{"version":0,"setups":[]}')).toEqual({ ok: false, problem: 'corrupt' })
    expect(parseSavedSetups('{"version":2,"setups":[]}')).toEqual({ ok: false, problem: 'newer' })
  })

  test('entries that can’t be read are skipped and counted', () => {
    const good = stored('a', 'A', stamp(20))
    const text = JSON.stringify({
      version: 1,
      setups: [
        good,
        null,
        { ...good, id: '' },
        { ...good, id: 'b', name: '   ' },
        { ...good, id: 'c', savedAt: 'yesterday' },
        { ...good, id: 'd', config: 'fury' },
        // A repeated id is a copy: the first one stands.
        { ...good, name: 'Copy' },
      ],
    })
    expect(parseSavedSetups(text)).toEqual({ ok: true, setups: [good], skipped: 6 })
  })

  test('a stored name is tidied and kept within 60 characters', () => {
    const text = JSON.stringify({ version: 1, setups: [stored('a', `  ${'z'.repeat(70)}  `, stamp(20))] })
    const parsed = parseSavedSetups(text)
    expect(parsed.ok && parsed.setups[0].name).toBe('z'.repeat(MAX_NAME_LENGTH))
  })
})

describe('browser storage', () => {
  test('saves, renames and deletes, under its own versioned key', () => {
    const saved = saveToStorage('Raid night', fresh('warrior-fury', 'horde-troll'), new Date(stamp(20)))
    expect(saved.ok).toBe(true)
    expect(kept()).toMatchObject({ version: 1, setups: [{ name: 'Raid night', savedAt: stamp(20), config: { race: 'horde-troll' } }] })
    const id = kept().setups[0].id
    expect(useSavedSetups.getState().setups.map((s) => s.name)).toEqual(['Raid night'])

    expect(saveToStorage('raid night', fresh('warrior-fury'), new Date(stamp(21)))).toMatchObject({ ok: true, updated: true })
    expect(kept().setups).toHaveLength(1)

    expect(renameInStorage(id, 'Onyxia').ok).toBe(true)
    expect(kept().setups[0].name).toBe('Onyxia')
    expect(renameInStorage(id, '')).toEqual({ ok: false, error: 'Enter a name.' })

    expect(deleteFromStorage(id).ok).toBe(true)
    expect(kept().setups).toEqual([])
    expect(useSavedSetups.getState().setups).toEqual([])
  })

  test('reads what another tab saved', () => {
    memory.set(SAVED_SETUPS_KEY, serializeSavedSetups([stored('a', 'From another tab', stamp(20))]))
    expect(refreshSavedSetups()).toEqual({ skipped: 0, problem: null })
    expect(useSavedSetups.getState().setups.map((s) => s.name)).toEqual(['From another tab'])
    // A save goes on top of what's stored now, not what was read before.
    memory.set(SAVED_SETUPS_KEY, serializeSavedSetups([stored('a', 'From another tab', stamp(20)), stored('b', 'And another', stamp(21))]))
    saveToStorage('Mine', fresh('warrior-fury'))
    expect(names(kept().setups)).toEqual(['Mine', 'From another tab', 'And another'])
  })

  test('blocked storage says so, on reading and on saving', () => {
    refuse = 'get'
    expect(refreshSavedSetups()).toEqual({ skipped: 0, problem: 'blocked' })
    expect(useSavedSetups.getState().problem).toBe('blocked')
    expect(saveToStorage('Raid night', fresh('warrior-fury'))).toEqual({ ok: false, problem: 'blocked' })
    // Reading works but writing doesn't.
    refuse = 'set'
    expect(saveToStorage('Raid night', fresh('warrior-fury'))).toEqual({ ok: false, problem: 'blocked' })
    expect(memory.size).toBe(0)
  })

  test('full storage says so, and keeps what was saved', () => {
    saveToStorage('First', fresh('warrior-fury'))
    const before = memory.get(SAVED_SETUPS_KEY)
    refuse = 'full'
    expect(saveToStorage('Second', fresh('warrior-fury'))).toEqual({ ok: false, problem: 'full' })
    expect(deleteFromStorage(kept().setups[0].id)).toEqual({ ok: false, problem: 'full' })
    expect(memory.get(SAVED_SETUPS_KEY)).toBe(before)
    expect(useSavedSetups.getState().setups.map((s) => s.name)).toEqual(['First'])
  })

  test('corrupt storage says so, and saving starts a new list', () => {
    memory.set(SAVED_SETUPS_KEY, '{"version":1,"setups":')
    expect(refreshSavedSetups()).toEqual({ skipped: 0, problem: 'corrupt' })
    expect(saveToStorage('Fresh start', fresh('warrior-fury')).ok).toBe(true)
    expect(names(kept().setups)).toEqual(['Fresh start'])
  })

  test('entries that can’t be read are counted, and go at the next save', () => {
    memory.set(SAVED_SETUPS_KEY, JSON.stringify({ version: 1, setups: [stored('a', 'Good', stamp(20)), { id: 'b' }] }))
    expect(refreshSavedSetups()).toEqual({ skipped: 1, problem: null })
    saveToStorage('New', fresh('warrior-fury'))
    expect(kept().setups.map((s: StoredSetup) => s.id)).toEqual([expect.any(String), 'a'])
  })

  test('saves from a newer version of the app are left alone', () => {
    const newer = JSON.stringify({ version: 2, setups: [{ anything: true }] })
    memory.set(SAVED_SETUPS_KEY, newer)
    expect(refreshSavedSetups()).toEqual({ skipped: 0, problem: 'newer' })
    expect(saveToStorage('Mine', fresh('warrior-fury'))).toEqual({ ok: false, problem: 'newer' })
    expect(memory.get(SAVED_SETUPS_KEY)).toBe(newer)
  })

  test('saves it doesn’t show are kept through changes', () => {
    const tank = stored('prot', 'Tank', stamp(1), { version: 1, spec: 'warrior-protection' })
    memory.set(SAVED_SETUPS_KEY, serializeSavedSetups([tank]))
    saveToStorage('Fury', fresh('warrior-fury'))
    expect(kept().setups).toContainEqual(tank)
    expect(useSavedSetups.getState().setups.map((s) => s.name)).toEqual(['Fury'])
  })
})
