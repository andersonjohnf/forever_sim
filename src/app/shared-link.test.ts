import { describe, expect, test, vi } from 'vitest'
import { defaultConfig, normalizeConfig, type SpecId } from '@/sim'

// Every spec ships (B4), so the spec "the sim doesn't cover yet" is made one here: the Feral bear,
// hidden as an unfinished spec is (src/app/specs.ts isVisibleSpec).
vi.mock('./specs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./specs')>()
  return { ...actual, isVisibleSpec: (spec: Parameters<typeof actual.isVisibleSpec>[0]) => spec !== 'druid-feral-bear' && actual.isVisibleSpec(spec) }
})

// The spec list reads the setup store, which persists to localStorage: Node has none, so a Map
// stands in for it before the modules load.
const memory = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
})
const { readLinkSetup } = await import('./shared-link')

const fresh = (spec: SpecId) => normalizeConfig(defaultConfig(spec)).config
const UNCHANGED = /your own setup is unchanged\.$/

// docs/ux.md#persistence-and-sharing (LX1): a link that isn't a setup the app can load is refused,
// with a notice saying why, rather than normalized into a default setup that replaces yours.
describe('a shared link’s setup', () => {
  test('a setup loads, normalized', () => {
    expect(readLinkSetup(fresh('warrior-arms'))).toEqual({ ok: true, config: fresh('warrior-arms'), warnings: [] })
  })

  test('JSON that isn’t a setup is a broken link', () => {
    for (const raw of [null, 42, [], [1], 'fury', {}, { version: 'one', spec: 'warrior-fury' }]) {
      expect(readLinkSetup(raw), JSON.stringify(raw)).toEqual({
        ok: false,
        title: 'That share link is broken',
        description: 'It doesn’t hold a setup, so your own setup is unchanged.',
      })
    }
  })

  test('a newer version’s link says to reload, as a newer file does', () => {
    const read = readLinkSetup({ ...fresh('warrior-arms'), version: 2 })
    expect(read).toMatchObject({ ok: false, title: 'That link is from a newer version of Forever Sim' })
    expect(!read.ok && read.description).toMatch(/^Reload this page to update it, then open the link again\. Your own setup is unchanged\.$/)
  })

  test('a spec the sim doesn’t know, or doesn’t offer yet, says so', () => {
    expect(readLinkSetup({ version: 1, spec: 'warlock-affliction' })).toMatchObject({ ok: false, title: 'That link is for a spec this sim doesn’t know' })
    const hidden = readLinkSetup({ version: 1, spec: 'druid-feral-bear' })
    expect(hidden).toMatchObject({ ok: false, title: 'That link is for a Feral (Bear) Druid' })
    expect(!hidden.ok && hidden.description).toMatch(UNCHANGED)
  })
})
