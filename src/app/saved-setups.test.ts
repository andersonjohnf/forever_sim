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
  findByName,
  importSetups,
  importToStorage,
  listSetups,
  MAX_CONFIG_DEPTH,
  MAX_ID_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NAME_UNITS,
  MAX_RAW_NAME_UNITS,
  nameProblem,
  parseSavedSetups,
  readEntry,
  storageMessage,
  withinDepth,
  refreshSavedSetups,
  renameInStorage,
  renameSetup,
  replaceSetup,
  SAVED_SETUPS_KEY,
  sameName,
  saveSetup,
  readStoredSetups,
  sameConfig,
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

  // LX8: names are kept in NFC, and compared the same way in every locale.
  test('an accent typed either way is the same name, kept composed', () => {
    const decomposed = 'Café raid'
    const composed = 'Café raid'
    expect(cleanName(decomposed)).toBe(composed)
    expect(sameName(decomposed, composed.toUpperCase())).toBe(true)
    expect(findByName([{ name: composed }], decomposed)).toEqual({ name: composed })
  })

  test('case is compared the same in every locale', () => {
    // A Turkish locale lowercases "I" to a dotless "ı", so "RAID" wouldn't match "raid" there.
    const turkish = vi.spyOn(String.prototype, 'toLocaleLowerCase').mockImplementation(function (this: string) {
      return this.replace(/I/g, 'ı').toLowerCase()
    })
    try {
      expect(sameName('RAID NIGHT', 'raid night')).toBe(true)
      expect(findByName([{ name: 'raid night' }], 'RAID NIGHT')).toEqual({ name: 'raid night' })
    } finally {
      turkish.mockRestore()
    }
  })

  test('60 characters counts an emoji as one, and never cuts one in half', () => {
    expect(nameProblem('😀'.repeat(MAX_NAME_LENGTH))).toBeNull()
    expect(nameProblem('😀'.repeat(MAX_NAME_LENGTH + 1))).toMatch(/60 characters/)
    const halves = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/
    const stored60 = readEntry(stored('a', `${'a'.repeat(MAX_NAME_LENGTH - 1)}😀b`, stamp(20)))!.name
    expect(stored60).toBe(`${'a'.repeat(MAX_NAME_LENGTH - 1)}😀`)
    const long = `${'b'.repeat(MAX_NAME_LENGTH - 5)}😀😀`
    const unique = uniqueName(long, [{ name: long }])
    expect(unique).toBe(`${'b'.repeat(MAX_NAME_LENGTH - 5)}😀 (2)`)
    expect(unique).not.toMatch(halves)
  })

  // VF11: counting code points split a skin-toned or ZWJ emoji, and counted it as several.
  test('an emoji with a skin tone, or a family joined with ZWJs, is one character, never cut', () => {
    const thumb = '👍🏽' // 2 code points
    const family = '👨‍👩‍👧‍👦' // 7 code points
    const kiss = '👩🏻‍❤️‍💋‍👨🏼' // 15 UTF-16 units, the longest
    for (const emoji of [thumb, family, kiss]) {
      expect(nameProblem(emoji.repeat(MAX_NAME_LENGTH)), emoji).toBeNull()
      expect(nameProblem(emoji.repeat(MAX_NAME_LENGTH + 1)), emoji).toMatch(/60 characters/)
    }
    // A name cut to 60 keeps its last emoji whole, or leaves it out.
    const a59 = 'a'.repeat(MAX_NAME_LENGTH - 1)
    expect(readEntry(stored('a', `${a59}${thumb}b`, stamp(20)))!.name).toBe(`${a59}${thumb}`)
    expect(readEntry(stored('a', `${a59}${family}${family}`, stamp(20)))!.name).toBe(`${a59}${family}`)
    // 60 of the longest emoji are kept as they are.
    expect(readEntry(stored('a', kiss.repeat(MAX_NAME_LENGTH), stamp(20)))!.name).toBe(kiss.repeat(MAX_NAME_LENGTH))
    // A unique name's number makes room by whole characters.
    const long = `${'b'.repeat(MAX_NAME_LENGTH - 5)}${family}${family}`
    expect(uniqueName(long, [{ name: long }])).toBe(`${'b'.repeat(MAX_NAME_LENGTH - 5)}${family} (2)`)
  })

  test('a name stays within the name field’s limit in UTF-16 units, cut between characters', () => {
    // One character however long: a letter under a thousand accents (an "x", so NFC keeps them all).
    const zalgo = `x${'\u0301'.repeat(1000)}`
    expect(nameProblem(zalgo)).toMatch(/60 characters/)
    expect(nameProblem(zalgo.slice(0, MAX_NAME_UNITS))).toBeNull()
    expect(nameProblem(`b${zalgo.slice(0, MAX_NAME_UNITS)}`)).toMatch(/60 characters/)
    // Read back, it's left out whole, rather than cut into.
    expect(readEntry(stored('a', `ok ${zalgo}`, stamp(20)))!.name).toBe('ok')
  })

  test('without Intl.Segmenter, a name counts code points', async () => {
    const segmenter = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!
    Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true, writable: true })
    try {
      vi.resetModules()
      const fallback = await import('./saved-setups')
      expect(fallback.nameProblem('👍🏽'.repeat(MAX_NAME_LENGTH / 2))).toBeNull()
      expect(fallback.nameProblem('👍🏽'.repeat(MAX_NAME_LENGTH / 2 + 1))).toMatch(/60 characters/)
      // Still never half an emoji's code point.
      expect(fallback.readEntry(stored('a', `${'a'.repeat(MAX_NAME_LENGTH - 1)}😀b`, stamp(20)))!.name).toBe(`${'a'.repeat(MAX_NAME_LENGTH - 1)}😀`)
    } finally {
      Object.defineProperty(Intl, 'Segmenter', segmenter)
      vi.resetModules()
    }
  })

  // LX6: a file of 1,000 setups with one name took about 25 s to name (every name against every other).
  test('naming many setups with one name takes time in proportion to them', () => {
    const entries = Array.from({ length: 1000 }, (_, i) => stored(`e${i}`, 'Raid night', stamp(1), { ...fresh('warrior-fury'), run: { mode: 'fixed', iterations: 100, seed: i } }))
    const started = performance.now()
    const result = importSetups([stored('a', 'Raid night (500)', stamp(2))], entries, null, new Date(2026, 8, 23), nextId)
    expect(performance.now() - started).toBeLessThan(2000)
    const added = names(result.added)
    expect(added.slice(0, 3)).toEqual(['Raid night', 'Raid night (2)', 'Raid night (3)'])
    // The one saved already is skipped, and the count goes on past it.
    expect(added[498]).toBe('Raid night (499)')
    expect(added[499]).toBe('Raid night (501)')
    expect(new Set(added.map((n) => n.toLowerCase())).size).toBe(1000)
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
      stored('arcane', 'Tank', stamp(3), { version: 1, spec: 'mage-spellblade' }),
      stored('newer', 'Newer', stamp(2), { version: 4, spec: 'warrior-fury' }),
      stored('unknown', 'Unknown', stamp(1), { version: 1, spec: 'warrior-gladiator' }),
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

// docs/ux.md#setups: a file's setups join the list without replacing any.
describe('importing a file’s setups', () => {
  const NOW = new Date(2026, 8, 23, 14, 5)

  test('a name that’s saved already gets a number, as a new save’s would', () => {
    const list = [stored('a', 'Raid night', stamp(20)), stored('b', 'Raid night (2)', stamp(21))]
    const troll = fresh('warrior-fury', 'horde-troll')
    const result = importSetups(list, [stored('x', 'RAID NIGHT', stamp(19), troll), stored('y', 'Arms', stamp(18))], null, NOW, nextId)
    expect(result.added.map((s) => [s.id, s.name])).toEqual([
      ['x', 'RAID NIGHT (3)'],
      ['y', 'Arms'],
    ])
    // Nothing is replaced, and each keeps its date and config.
    expect(result.setups).toHaveLength(4)
    expect(result.setups).toEqual(expect.arrayContaining(list))
    expect(result.setups.find((s) => s.id === 'x')).toEqual({ id: 'x', name: 'RAID NIGHT (3)', savedAt: stamp(19), config: troll })
    // Two of the file's own with one name are kept apart too.
    const twins = importSetups([], [stored('p', 'Twin', stamp(1)), stored('q', 'twin', stamp(2), fresh('warrior-arms'))], null, NOW, nextId)
    expect(names(twins.added)).toEqual(['Twin', 'twin (2)'])
  })

  test('an id that’s taken gets a new one, so the save isn’t read as a copy', () => {
    const list = [stored('a', 'Mine', stamp(20))]
    const result = importSetups(list, [stored('a', 'Theirs', stamp(21), fresh('warrior-arms')), stored('a', 'Also theirs', stamp(22), fresh('warrior-arms'))], null, NOW, nextId)
    expect(result.added.map((s) => s.id)).toEqual(['id-1', 'id-2'])
    expect(parseSavedSetups(serializeSavedSetups(result.setups))).toMatchObject({ ok: true, unreadable: [] })
  })

  test('a save that’s saved already, same name and setup, isn’t added again', () => {
    const list = [stored('a', 'Raid night', stamp(20))]
    // The same setup with its keys in another order is the same setup.
    const reordered = Object.fromEntries(Object.entries(fresh('warrior-fury')).reverse())
    expect(sameConfig(reordered, fresh('warrior-fury'))).toBe(true)
    const result = importSetups(list, [stored('z', ' raid  NIGHT ', stamp(1), reordered)], null, NOW, nextId)
    expect(result).toEqual({ setups: list, added: [], duplicates: 1 })
    // The same name with another setup is a different save.
    expect(importSetups(list, [stored('z', 'Raid night', stamp(1), fresh('warrior-arms'))], null, NOW, nextId).added).toHaveLength(1)
  })

  // LX2: the reviewer's case. A file's save whose name was taken came in as "Raid night (2)", and
  // then each import of the file added another: "(3)", "(4)", ….
  test('a save renamed to keep names apart on the way in isn’t added again by the next import', () => {
    const list = [stored('a', 'Raid night', stamp(20), fresh('warrior-fury'))]
    const file = [stored('x', 'Raid night', stamp(19), fresh('warrior-arms'))]
    const first = importSetups(list, file, null, NOW, nextId)
    expect(names(first.setups)).toEqual(['Raid night (2)', 'Raid night'])
    const second = importSetups(first.setups, file, null, NOW, nextId)
    expect(second).toEqual({ setups: first.setups, added: [], duplicates: 1 })
    // Its id matches too, but the name alone is enough: here the file's id was taken, so it has a new one.
    const clash = [stored('a', 'Raid night', stamp(19), fresh('warrior-arms'))]
    const renumbered = importSetups(list, clash, null, NOW, nextId)
    expect(renumbered.added.map((s) => [s.id, s.name])).toEqual([['id-1', 'Raid night (2)']])
    expect(importSetups(renumbered.setups, clash, null, NOW, nextId).added).toEqual([])
    // And a save renamed since, with its id and setup, is the same save.
    const renamed = first.setups.map((s) => (s.id === 'x' ? { ...s, name: 'Arms for raids' } : s))
    expect(importSetups(renamed, file, null, NOW, nextId).added).toEqual([])
    // A number at the end doesn't count: "raid night (7)" with this setup is a copy of "Raid night (2)".
    expect(importSetups(first.setups, [stored('y', 'raid night (7)', stamp(1), fresh('warrior-arms'))], null, NOW, nextId).duplicates).toBe(1)
  })

  test('the file’s current setup is saved as "Imported · 23 Sep", now, unless a save has it already', () => {
    const list = [stored('a', 'Raid night', stamp(20))]
    const arms = fresh('warrior-arms')
    const result = importSetups(list, [], arms, NOW, nextId)
    expect(result.added).toEqual([{ id: 'id-1', name: 'Imported · 23 Sep', savedAt: NOW.toISOString(), config: arms }])
    expect(importSetups(result.setups, [], fresh('warrior-fury', 'horde-orc'), NOW, nextId).added[0].name).toBe('Imported · 23 Sep (2)')
    // Saved already, under any name, or among the file's own saves.
    expect(importSetups(list, [], fresh('warrior-fury'), NOW, nextId).added).toEqual([])
    expect(importSetups([], [stored('b', 'Arms', stamp(1), arms)], arms, NOW, nextId).added.map((s) => s.name)).toEqual(['Arms'])
  })

  test('a save the list doesn’t show is kept as it is, and its name doesn’t count', () => {
    const tank = stored('arcane', 'Raid night', stamp(1), { version: 1, spec: 'mage-spellblade' })
    const result = importSetups([stored('a', 'Raid night', stamp(20))], [tank], null, NOW, nextId)
    expect(result.added).toEqual([tank])
    expect(names(listSetups(result.setups))).toEqual(['Raid night'])
  })

  test('into storage: added to what’s stored now, and shown', () => {
    memory.set(SAVED_SETUPS_KEY, serializeSavedSetups([stored('a', 'From another tab', stamp(20))]))
    const result = importToStorage([stored('x', 'From a file', stamp(21))], fresh('warrior-arms'), NOW)
    expect(result).toMatchObject({ ok: true, duplicates: 0 })
    expect(names(kept().setups)).toEqual(['Imported · 23 Sep', 'From a file', 'From another tab'])
    expect(names(useSavedSetups.getState().setups)).toEqual(['Imported · 23 Sep', 'From a file', 'From another tab'])
    expect(readStoredSetups()).toEqual({ setups: kept().setups, unreadable: [], problem: null })
  })

  test('into storage the browser refuses: nothing changes, and it says why', () => {
    saveToStorage('First', fresh('warrior-fury'))
    const before = memory.get(SAVED_SETUPS_KEY)
    refuse = 'full'
    expect(importToStorage([stored('x', 'From a file', stamp(21))], null, NOW)).toEqual({ ok: false, problem: 'full' })
    expect(memory.get(SAVED_SETUPS_KEY)).toBe(before)
    refuse = 'get'
    expect(importToStorage([stored('x', 'From a file', stamp(21))], null, NOW)).toEqual({ ok: false, problem: 'blocked' })
    expect(readStoredSetups()).toEqual({ setups: [], unreadable: [], problem: 'blocked' })
  })
})

describe('the stored form', () => {
  test('round-trips', () => {
    const list = [stored('a', 'A', stamp(20)), stored('b', 'B', stamp(21), fresh('warrior-arms'))]
    const text = serializeSavedSetups(list)
    expect(JSON.parse(text)).toEqual({ version: 1, setups: list })
    expect(parseSavedSetups(text)).toEqual({ ok: true, setups: list, unreadable: [] })
    expect(parseSavedSetups(null)).toEqual({ ok: true, setups: [], unreadable: [] })
  })

  test('what isn’t the stored form is corrupt; a newer version is left alone', () => {
    expect(parseSavedSetups('{not json')).toEqual({ ok: false, problem: 'corrupt' })
    expect(parseSavedSetups('[]')).toEqual({ ok: false, problem: 'corrupt' })
    expect(parseSavedSetups('{"version":1}')).toEqual({ ok: false, problem: 'corrupt' })
    expect(parseSavedSetups('{"version":0,"setups":[]}')).toEqual({ ok: false, problem: 'corrupt' })
    expect(parseSavedSetups('{"version":2,"setups":[]}')).toEqual({ ok: false, problem: 'newer' })
  })

  test('entries that can’t be read are set apart, as they are', () => {
    const good = stored('a', 'A', stamp(20))
    const unreadable = [
      null,
      { ...good, id: '' },
      { ...good, id: 'b', name: '   ' },
      { ...good, id: 'c', savedAt: 'yesterday' },
      { ...good, id: 'd', config: 'fury' },
      // A repeated id is a copy: the first one stands.
      { ...good, name: 'Copy' },
    ]
    const text = JSON.stringify({ version: 1, setups: [good, ...unreadable] })
    expect(parseSavedSetups(text)).toEqual({ ok: true, setups: [good], unreadable })
  })

  test('a stored name is tidied and kept within 60 characters', () => {
    const text = JSON.stringify({ version: 1, setups: [stored('a', `  ${'z'.repeat(70)}  `, stamp(20))] })
    const parsed = parseSavedSetups(text)
    expect(parsed.ok && parsed.setups[0].name).toBe('z'.repeat(MAX_NAME_LENGTH))
  })

  // LX7: a file's entries can't fill the browser's storage with ids or names no save has.
  test('an id over 64 characters can’t be read, and a raw name is cut to 3,840 units before it’s tidied', () => {
    expect(readEntry(stored('x'.repeat(MAX_ID_LENGTH), 'A', stamp(20)))).not.toBeNull()
    expect(readEntry(stored('x'.repeat(MAX_ID_LENGTH + 1), 'A', stamp(20)))).toBeNull()
    expect(MAX_RAW_NAME_UNITS).toBe(3840)
    // Past 3,840 units, what's left isn't read: here, all but the "a".
    expect(readEntry(stored('a', `a${' '.repeat(MAX_RAW_NAME_UNITS)}b`, stamp(20)))?.name).toBe('a')
    expect(readEntry(stored('a', `a${' '.repeat(MAX_RAW_NAME_UNITS - 2)}b`, stamp(20)))?.name).toBe('a b')
    expect(readEntry(stored('a', `${' '.repeat(MAX_RAW_NAME_UNITS)}b`, stamp(20)))).toBeNull()
    expect(readEntry(stored('a', 'y'.repeat(1_000_000), stamp(20)))?.name).toBe('y'.repeat(MAX_NAME_LENGTH))
  })

  // LX5: a config nested deeper than any setup would overflow the stack of what compares them.
  test('a config nested deeper than 10 levels can’t be read', () => {
    const nested = (depth: number): Record<string, unknown> => (depth === 1 ? { spec: 'warrior-fury' } : { version: 1, x: nested(depth - 1) })
    expect(readEntry(stored('a', 'A', stamp(20), nested(MAX_CONFIG_DEPTH)))).not.toBeNull()
    expect(readEntry(stored('a', 'A', stamp(20), nested(MAX_CONFIG_DEPTH + 1)))).toBeNull()
    // Arrays count as levels too.
    let deep: unknown = 0
    for (let i = 0; i < 5000; i++) deep = [deep]
    expect(readEntry(stored('a', 'A', stamp(20), { version: 1, spec: 'warrior-fury', deep }))).toBeNull()
    expect(withinDepth({ a: [[1]] }, 3)).toBe(true)
    expect(withinDepth({ a: [[[1]]] }, 3)).toBe(false)
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
    expect(refreshSavedSetups()).toEqual({ unreadable: 0, problem: null })
    expect(useSavedSetups.getState().setups.map((s) => s.name)).toEqual(['From another tab'])
    // A save goes on top of what's stored now, not what was read before.
    memory.set(SAVED_SETUPS_KEY, serializeSavedSetups([stored('a', 'From another tab', stamp(20)), stored('b', 'And another', stamp(21))]))
    saveToStorage('Mine', fresh('warrior-fury'))
    expect(names(kept().setups)).toEqual(['Mine', 'From another tab', 'And another'])
  })

  test('blocked storage says so, on reading and on saving', () => {
    refuse = 'get'
    expect(refreshSavedSetups()).toEqual({ unreadable: 0, problem: 'blocked' })
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

  test('corrupt storage says so, and saving replaces it with a new list', () => {
    memory.set(SAVED_SETUPS_KEY, '{"version":1,"setups":')
    expect(refreshSavedSetups()).toEqual({ unreadable: 0, problem: 'corrupt' })
    expect(useSavedSetups.getState().problem).toBe('corrupt')
    expect(saveToStorage('Fresh start', fresh('warrior-fury')).ok).toBe(true)
    expect(names(kept().setups)).toEqual(['Fresh start'])
    expect(useSavedSetups.getState().problem).toBeNull()
  })

  // LX9: an entry that can't be read may be one a later version can, so nothing drops it.
  test('entries that can’t be read are counted, and kept as they are through every change', () => {
    const odd = [{ id: 'b' }, 'not even an object', { ...stored('c', 'Bad date', 'yesterday') }]
    memory.set(SAVED_SETUPS_KEY, JSON.stringify({ version: 1, setups: [stored('a', 'Good', stamp(20)), ...odd] }))
    expect(refreshSavedSetups()).toEqual({ unreadable: 3, problem: null })
    saveToStorage('New', fresh('warrior-fury'))
    const id = kept().setups[0].id
    renameInStorage(id, 'Renamed')
    importToStorage([stored('x', 'From a file', stamp(21), fresh('warrior-arms'))], null)
    deleteFromStorage('a')
    expect(kept().setups).toEqual([expect.objectContaining({ id: 'x' }), expect.objectContaining({ id, name: 'Renamed' }), ...odd])
    expect(readStoredSetups()).toEqual({ setups: kept().setups.slice(0, 2), unreadable: odd, problem: null })
  })

  test('deleting a save deletes its copies, which repeat its id', () => {
    const good = stored('a', 'Good', stamp(20))
    const copy = { ...good, name: 'Copy' }
    const other = stored('b', 'Other', stamp(21))
    memory.set(SAVED_SETUPS_KEY, JSON.stringify({ version: 1, setups: [good, other, copy, { id: 'a' }, { id: 'b' }] }))
    expect(refreshSavedSetups()).toEqual({ unreadable: 3, problem: null })
    deleteFromStorage('a')
    // Else the copy would show up in its place, next time the list is read.
    expect(kept().setups).toEqual([other, { id: 'b' }])
  })

  test('saves from a newer version of the app are left alone', () => {
    const newer = JSON.stringify({ version: 2, setups: [{ anything: true }] })
    memory.set(SAVED_SETUPS_KEY, newer)
    expect(refreshSavedSetups()).toEqual({ unreadable: 0, problem: 'newer' })
    expect(saveToStorage('Mine', fresh('warrior-fury'))).toEqual({ ok: false, problem: 'newer' })
    expect(memory.get(SAVED_SETUPS_KEY)).toBe(newer)
  })

  // UX10: full storage asks you to delete a save only when there's one to delete.
  test('says why storage refused a change, in words for what was being done', () => {
    expect(storageMessage('full', 'save', true)).toBe('Your browser’s storage for this site is full. Delete a saved setup you don’t need, then try again.')
    expect(storageMessage('full', 'save', false)).toMatch(/^Your browser’s storage for this site is full, but not with saved setups\. Clearing/)
    expect(storageMessage('full', 'import', true)).toMatch(/^Those setups don’t fit .* Delete saved setups you don’t need/)
    expect(storageMessage('full', 'import', false)).toMatch(/Try a file with fewer setups\.$/)
    expect(storageMessage('full', 'delete', true)).not.toMatch(/Delete/)
    expect(storageMessage('blocked', 'save', false)).toMatch(/blocking storage/)
  })

  test('saves it doesn’t show are kept through changes', () => {
    const tank = stored('arcane', 'Tank', stamp(1), { version: 1, spec: 'mage-spellblade' })
    memory.set(SAVED_SETUPS_KEY, serializeSavedSetups([tank]))
    saveToStorage('Fury', fresh('warrior-fury'))
    expect(kept().setups).toContainEqual(tank)
    expect(useSavedSetups.getState().setups.map((s) => s.name)).toEqual(['Fury'])
  })
})
