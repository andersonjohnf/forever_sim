import { describe, expect, test, vi } from 'vitest'
import { defaultConfig, normalizeConfig, type SimConfig, type SpecId } from '@/sim'

// Saved setups read the spec list, which reads the setup store, which persists to localStorage:
// Node has none, so a Map stands in for it before the modules load.
const memory = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
})
const {
  buildSetupsFile,
  importNotice,
  MAX_SETUPS_FILE_BYTES,
  MAX_SETUPS_FILE_SETUPS,
  parseSetupsFile,
  serializeSetupsFile,
  setupsFileName,
} = await import('./setups-file')
const { importSetups, listSetups } = await import('./saved-setups')
const { MAX_SETUP_BYTES } = await import('./share')
type StoredSetup = import('./saved-setups').StoredSetup

const fresh = (spec: SpecId, race?: string): SimConfig => {
  const config = normalizeConfig(defaultConfig(spec)).config
  return race ? { ...config, race } : config
}
const stamp = (day: number) => new Date(Date.UTC(2026, 8, day, 12)).toISOString()
const stored = (id: string, name: string, day: number, config: unknown = fresh('warrior-fury')): StoredSetup => ({ id, name, savedAt: stamp(day), config })
const NOW = new Date(2026, 8, 23, 14, 5)
const text = (value: unknown) => JSON.stringify(value)
const file = (fields: Record<string, unknown>) => text({ app: 'forever-sim', version: 1, exportedAt: stamp(22), current: fresh('warrior-fury'), setups: [], ...fields })

// docs/ux.md#setups (decision D21): Download all setups, and Add setups from a file….
describe('downloading', () => {
  test('the file holds every save as stored and the current setup, and says what it is', () => {
    const setups = [stored('a', 'Raid night', 20), stored('prot', 'Tank', 21, { version: 1, spec: 'warrior-protection' })]
    const current = fresh('warrior-arms', 'horde-troll')
    const built = buildSetupsFile(current, setups, NOW)
    expect(built).toEqual({ app: 'forever-sim', version: 1, exportedAt: NOW.toISOString(), current, setups })
    const serialized = serializeSetupsFile(built)
    expect(JSON.parse(serialized)).toEqual(built)
    // Indented, to read in a text editor.
    expect(serialized).toMatch(/^{\n {2}"app": "forever-sim",\n/)
  })

  // LX9: the file keeps everything that's stored, so a save a later version can read isn't lost.
  test('saves that couldn’t be read go in too, after the rest, as they are', () => {
    const setups = [stored('a', 'Raid night', 20)]
    const unreadable = [{ id: 'b' }, null]
    expect(buildSetupsFile(fresh('warrior-fury'), setups, NOW, unreadable).setups).toEqual([...setups, ...unreadable])
  })

  test('the file is named for the local day', () => {
    expect(setupsFileName(NOW)).toBe('forever-sim-setups-2026-09-23.json')
    expect(setupsFileName(new Date(2027, 0, 5, 0, 1))).toBe('forever-sim-setups-2027-01-05.json')
  })
})

describe('reading a file', () => {
  test('a good file gives its saves and its current setup', () => {
    const setups = [stored('a', 'Raid night', 20), stored('b', 'Arms', 21, fresh('warrior-arms'))]
    const current = fresh('warrior-arms', 'horde-troll')
    expect(parseSetupsFile(file({ setups, current }))).toEqual({ ok: true, setups, current, skipped: 0 })
    // With no current setup, the saves alone.
    expect(parseSetupsFile(file({ setups, current: undefined }))).toEqual({ ok: true, setups, current: null, skipped: 0 })
    // VF10: `"current": null` is no current setup too, not one that couldn't be read.
    expect(parseSetupsFile(file({ setups, current: null }))).toEqual({ ok: true, setups, current: null, skipped: 0 })
  })

  test('a file from a newer version of the app is refused', () => {
    expect(parseSetupsFile(file({ version: 2 }))).toEqual({ ok: false, problem: 'newer' })
  })

  test('a file that isn’t ours is refused', () => {
    expect(parseSetupsFile('not json')).toEqual({ ok: false, problem: 'notOurs' })
    expect(parseSetupsFile('[]')).toEqual({ ok: false, problem: 'notOurs' })
    expect(parseSetupsFile(text({ hello: 'world' }))).toEqual({ ok: false, problem: 'notOurs' })
    expect(parseSetupsFile(file({ app: 'wowsims' }))).toEqual({ ok: false, problem: 'notOurs' })
    // The browser's stored form isn't a setups file.
    expect(parseSetupsFile(text({ version: 1, setups: [] }))).toEqual({ ok: false, problem: 'notOurs' })
  })

  test('a setups file whose setups aren’t a list, or of no version we know, is damaged', () => {
    expect(parseSetupsFile(file({ setups: {} }))).toEqual({ ok: false, problem: 'damaged' })
    expect(parseSetupsFile(file({ version: '1' }))).toEqual({ ok: false, problem: 'damaged' })
    expect(parseSetupsFile(file({ version: 0 }))).toEqual({ ok: false, problem: 'damaged' })
  })

  // UX4: a file cut short in the download (or by an edit) still says it's ours.
  test('a setups file that’s cut short is damaged, not someone else’s', () => {
    const whole = serializeSetupsFile(buildSetupsFile(fresh('warrior-fury'), [stored('a', 'Raid night', 20)], NOW))
    expect(parseSetupsFile(whole.slice(0, whole.length / 2))).toEqual({ ok: false, problem: 'damaged' })
    expect(parseSetupsFile('{"app":"forever-sim","version":1,"setups":[')).toEqual({ ok: false, problem: 'damaged' })
    // Text that only mentions the app isn't a setups file.
    expect(parseSetupsFile('I use forever-sim for my raids')).toEqual({ ok: false, problem: 'notOurs' })
  })

  // LX5: a config nested deeper than any setup crashed the import, which compares configs.
  test('a setup nested deeper than any real one is left out, and counted', () => {
    // 5,000 levels, spliced in as text: Node 22's JSON.stringify recurses, and on x64 (the deploy
    // runner) it overflows at about 4,000 levels. The parser under test doesn't recurse.
    const deep = `${'['.repeat(5000)}0${']'.repeat(5000)}`
    const good = stored('a', 'Good', 20)
    const withDeep = file({ setups: [good, stored('b', 'Deep', 21, { ...fresh('warrior-fury'), deep: 'DEEP' })], current: { ...fresh('warrior-arms'), deep: 'DEEP' } })
    const parsed = parseSetupsFile(withDeep.replaceAll('"DEEP"', deep))
    expect(parsed).toEqual({ ok: true, setups: [good], current: null, skipped: 2 })
    if (!parsed.ok) return
    expect(() => importSetups([], parsed.setups, parsed.current, NOW, () => 'new')).not.toThrow()
  })

  test('a file with nothing in it says so', () => {
    expect(parseSetupsFile(file({ current: undefined }))).toEqual({ ok: false, problem: 'empty' })
    expect(parseSetupsFile(file({ current: null }))).toEqual({ ok: false, problem: 'empty' })
  })

  test('a setup larger than a share link can hold is left out, and counted', () => {
    const big = { ...fresh('warrior-fury'), padding: 'x'.repeat(MAX_SETUP_BYTES) }
    const good = stored('a', 'Good', 20)
    expect(parseSetupsFile(file({ setups: [good, stored('big', 'Big', 21, big)] }))).toMatchObject({ ok: true, setups: [good], skipped: 1 })
    expect(parseSetupsFile(file({ setups: [good], current: big }))).toEqual({ ok: true, setups: [good], current: null, skipped: 1 })
  })

  test('a file over the size caps is refused', () => {
    expect(parseSetupsFile(file({ padding: 'x'.repeat(MAX_SETUPS_FILE_BYTES) }))).toEqual({ ok: false, problem: 'tooLarge' })
    const many = Array.from({ length: MAX_SETUPS_FILE_SETUPS + 1 }, (_, i) => stored(`id-${i}`, `Setup ${i}`, 20, { version: 1, spec: 'warrior-fury' }))
    expect(parseSetupsFile(file({ setups: many }))).toEqual({ ok: false, problem: 'tooLarge' })
  })

  test('in a mixed list, the setups that can be read are kept, and the rest counted', () => {
    const good = stored('a', 'Good', 20)
    const arms = stored('b', '  Arms   test ', 21, fresh('warrior-arms'))
    const parsed = parseSetupsFile(
      file({
        setups: [good, null, 'Fury', { ...good, id: 'c', name: '' }, { ...good, id: 'd', savedAt: 'yesterday' }, { ...good, id: 'e', config: [] }, arms],
        current: 'Fury',
      }),
    )
    // Names are tidied as stored ones are.
    expect(parsed).toEqual({ ok: true, setups: [good, { ...arms, name: 'Arms test' }], current: null, skipped: 6 })
  })
})

describe('the notice for a file’s import', () => {
  test('counts what was imported, and what else happened', () => {
    expect(importNotice({ shown: 1, hidden: 0, duplicates: 0, skipped: 0 })).toEqual({ title: 'Imported 1 setup', description: undefined })
    expect(importNotice({ shown: 3, hidden: 0, duplicates: 1, skipped: 2 })).toEqual({
      title: 'Imported 3 setups',
      description: '1 was saved already. 2 couldn’t be read, so they were left out.',
    })
    expect(importNotice({ shown: 1, hidden: 1, duplicates: 2, skipped: 1 })).toEqual({
      title: 'Imported 2 setups',
      description: '2 were saved already. 1 is kept but not shown: this version of the sim can’t load it. 1 couldn’t be read, so it was left out.',
    })
  })

  test('a file that’s saved already adds nothing, and says so', () => {
    expect(importNotice({ shown: 0, hidden: 0, duplicates: 4, skipped: 0 })).toEqual({
      title: 'Nothing new to import',
      description: 'Every setup in that file is saved already.',
    })
  })

  test('a file with nothing readable has no notice: the sheet says so under the button', () => {
    expect(importNotice({ shown: 0, hidden: 0, duplicates: 0, skipped: 3 })).toBeNull()
  })
})

describe('export, then import', () => {
  test('round-trips every save and the current setup, into an empty list', () => {
    const setups = [stored('a', 'Raid night', 20, fresh('warrior-fury', 'horde-troll')), stored('b', 'Arms', 21, fresh('warrior-arms'))]
    const current = fresh('warrior-arms', 'alliance-gnome')
    const parsed = parseSetupsFile(serializeSetupsFile(buildSetupsFile(current, setups, NOW)))
    if (!parsed.ok) throw new Error(parsed.problem)
    let ids = 0
    const imported = importSetups([], parsed.setups, parsed.current, NOW, () => `new-${++ids}`)
    expect(imported.duplicates).toBe(0)
    expect(imported.setups).toEqual([{ id: 'new-1', name: 'Imported · 23 Sep', savedAt: NOW.toISOString(), config: current }, ...[...setups].reverse()])
    expect(listSetups(imported.setups).map((s) => [s.name, s.config])).toEqual([
      ['Imported · 23 Sep', current],
      ['Arms', setups[1].config],
      ['Raid night', setups[0].config],
    ])
    // Into the list it came from, it adds nothing: every save is there already, and so is the current setup.
    const again = importSetups(imported.setups, parsed.setups, parsed.current, NOW, () => `new-${++ids}`)
    expect(again).toEqual({ setups: imported.setups, added: [], duplicates: 2 })
  })
})
