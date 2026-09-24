import { describe, expect, test, vi } from 'vitest'
import { defaultConfig, normalizeConfig, type SimConfig } from '@/sim'

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
const { CODE_ERRORS, findSetupCode, MIN_CODE_CHARS, readSetupCode, setupProblem } = await import('./setup-code')
const { MAX_LINK_CHARS, packSetup } = await import('./share')

const fresh = (spec: SimConfig['spec'], race?: string): SimConfig => {
  const config = normalizeConfig(defaultConfig(spec)).config
  return race ? { ...config, race } : config
}
const LINK = 'https://andersonjohnf.github.io/forever_sim/#s='

// docs/ux.md#setups: Import takes a setup code, or a share link, which is anything with #s=….
describe('finding the code in what was pasted', () => {
  test('a bare code', () => {
    expect(findSetupCode('abc-DEF_123')).toBe('abc-DEF_123')
  })

  test('whitespace around a code, or in it (a wrapped code), is dropped', () => {
    expect(findSetupCode('  abc-DEF_123\n')).toBe('abc-DEF_123')
    expect(findSetupCode('abc-DEF\n_123\t456 789')).toBe('abc-DEF_123456789')
  })

  test('a share link, or just its hash', () => {
    expect(findSetupCode(`${LINK}abc-DEF_123`)).toBe('abc-DEF_123')
    expect(findSetupCode('#s=abc')).toBe('abc')
    expect(findSetupCode(`  ${LINK}abc  `)).toBe('abc')
  })

  test('a link with other hash parameters, before or after', () => {
    expect(findSetupCode(`${LINK}abc&tab=gear`)).toBe('abc')
    expect(findSetupCode('https://example.com/forever_sim/#tab=gear&s=abc&x=1')).toBe('abc')
  })

  test('a link in a sentence, even after another hash', () => {
    expect(findSetupCode(`My #1 setup: ${LINK}abc, have fun`)).toBe('abc')
    expect(findSetupCode(`(${LINK}abc)`)).toBe('abc')
    expect(findSetupCode(`Try this:\n${LINK}abc\nthanks`)).toBe('abc')
  })

  test('a link’s code may be empty or cut short, for unpacking to find it damaged', () => {
    expect(findSetupCode(`${LINK}`)).toBe('')
    expect(findSetupCode(`${LINK}ab%2Bc`)).toBe('ab')
  })

  test('anything else has no code', () => {
    expect(findSetupCode('')).toBeNull()
    expect(findSetupCode('not a code!')).toBeNull()
    expect(findSetupCode('{"spec":"warrior-fury"}')).toBeNull()
    expect(findSetupCode('https://classic.wowhead.com/talent-calc/warrior/30305213132515201')).toBeNull()
    expect(findSetupCode('https://example.com/forever_sim/?s=abc')).toBeNull()
    expect(findSetupCode('https://example.com/forever_sim/#tab=gear')).toBeNull()
  })
})

describe('reading a code', () => {
  test('a code copied from a setup gives the setup back, as does its share link', async () => {
    const arms = fresh('warrior-arms', 'horde-troll')
    const code = await packSetup(arms)
    expect(await readSetupCode(code)).toEqual({ ok: true, config: arms, warnings: [] })
    expect(await readSetupCode(`${LINK}${code}`)).toEqual({ ok: true, config: arms, warnings: [] })
    expect(await readSetupCode(`\n ${code.slice(0, 40)}\n${code.slice(40)} \n`)).toEqual({ ok: true, config: arms, warnings: [] })
  })

  test('an out-of-date setup is normalized, and says what was out of date', async () => {
    const code = await packSetup({ version: 1, spec: 'warrior-arms', rotation: { aSettingThatWasRemoved: true } } as unknown as SimConfig)
    const result = await readSetupCode(code)
    expect(result.ok && result.config.spec).toBe('warrior-arms')
    expect(result.ok && result.warnings).toEqual(['Rotation settings that don’t apply to this spec were reset.'])
  })

  test('nothing, or no code, says so', async () => {
    expect(await readSetupCode('   ')).toEqual({ ok: false, error: CODE_ERRORS.empty })
    expect(await readSetupCode('not a code!')).toEqual({ ok: false, error: CODE_ERRORS.notACode })
  })

  // UX4: a word is text, not a code cut short.
  test('text too short to be a code isn’t one', async () => {
    expect(await readSetupCode('hello')).toEqual({ ok: false, error: CODE_ERRORS.notACode })
    expect(await readSetupCode('hello world')).toEqual({ ok: false, error: CODE_ERRORS.notACode })
    // The smallest setup that's usable packs to more.
    expect((await packSetup({ spec: 'warrior-fury' } as unknown as SimConfig)).length).toBeGreaterThanOrEqual(MIN_CODE_CHARS)
    // A link's code is a code, however short: it was cut short.
    expect(await readSetupCode('#s=AAAA')).toEqual({ ok: false, error: CODE_ERRORS.damaged })
  })

  // UX4: a talent build pasted here belongs in the Talents tab.
  test('a talent build code, or a talent calculator’s link, says where it goes', async () => {
    for (const text of ['30305213132515201-05050103-', ' 30305213132515201-05050103-5 ', '0503-', 'https://classic.wowhead.com/talent-calc/warrior/30305213132515201']) {
      expect(await readSetupCode(text), text).toEqual({ ok: false, error: CODE_ERRORS.talentCode })
    }
  })

  test('a damaged or cut-short code says so', async () => {
    const code = await packSetup(fresh('warrior-fury'))
    expect(await readSetupCode(code.slice(0, code.length / 2))).toEqual({ ok: false, error: CODE_ERRORS.damaged })
    expect(await readSetupCode('x'.repeat(MIN_CODE_CHARS))).toEqual({ ok: false, error: CODE_ERRORS.damaged })
    expect(await readSetupCode(LINK)).toEqual({ ok: false, error: CODE_ERRORS.damaged })
  })

  // LX1: normalizing turns anything into a default setup, which would have replaced yours.
  test('a code that isn’t a usable setup is refused before it’s normalized, and says why', async () => {
    const code = (value: unknown) => packSetup(value as SimConfig)
    // As a link's #s=…: most of these pack too short to be taken for a bare code at all.
    for (const value of [null, 42, 'fury', [], [1, 2], {}, { version: '1', spec: 'warrior-fury' }, { version: 0, spec: 'warrior-fury' }]) {
      expect(await readSetupCode(`#s=${await code(value)}`), JSON.stringify(value)).toEqual({ ok: false, error: CODE_ERRORS.notASetup })
      expect((await readSetupCode(await code(value))).ok, JSON.stringify(value)).toBe(false)
    }
    expect(await readSetupCode(await code({ ...fresh('warrior-arms'), version: 2 }))).toEqual({ ok: false, error: CODE_ERRORS.newer })
    expect(CODE_ERRORS.newer).toBe('That code is from a newer version of Forever Sim. Reload this page to update it, then try again.')
    for (const spec of ['mage-fire', undefined, 7]) {
      expect(await readSetupCode(await code({ ...fresh('warrior-arms'), spec })), String(spec)).toEqual({ ok: false, error: CODE_ERRORS.unknownSpec })
    }
    let deep: unknown = 0
    for (let i = 0; i < 20; i++) deep = [deep]
    expect(await readSetupCode(await code({ ...fresh('warrior-arms'), deep }))).toEqual({ ok: false, error: CODE_ERRORS.notASetup })
  })

  test('a setup with no version is read as version 1, as a saved one is', async () => {
    const { version: _version, ...unversioned } = fresh('warrior-arms', 'horde-troll')
    expect(setupProblem(unversioned)).toBeNull()
    expect(await readSetupCode(await packSetup(unversioned as SimConfig))).toMatchObject({ ok: true, config: { spec: 'warrior-arms', race: 'horde-troll' } })
  })

  test('a code over a share link’s size caps is refused, unread', async () => {
    expect(await readSetupCode('A'.repeat(MAX_LINK_CHARS + 1))).toEqual({ ok: false, error: CODE_ERRORS.tooLarge })
    const bomb = await packSetup({ padding: ' '.repeat(4 * 1024 * 1024) } as unknown as SimConfig)
    expect(await readSetupCode(bomb)).toEqual({ ok: false, error: CODE_ERRORS.tooLarge })
  })

  test('a setup for a spec the sim doesn’t cover says so', async () => {
    expect(await readSetupCode(await packSetup(fresh('druid-feral-bear')))).toEqual({
      ok: false,
      error: 'That setup is for a Feral (Bear) Druid. This sim doesn’t cover that spec.',
    })
  })
})
