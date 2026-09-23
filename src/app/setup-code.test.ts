import { describe, expect, test, vi } from 'vitest'
import { defaultConfig, normalizeConfig, type SimConfig } from '@/sim'

// The spec list reads the setup store, which persists to localStorage: Node has none, so a Map
// stands in for it before the modules load.
const memory = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
})
const { CODE_ERRORS, findSetupCode, readSetupCode } = await import('./setup-code')
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

  test('a damaged or cut-short code says so', async () => {
    const code = await packSetup(fresh('warrior-fury'))
    expect(await readSetupCode(code.slice(0, code.length / 2))).toEqual({ ok: false, error: CODE_ERRORS.damaged })
    expect(await readSetupCode('hello')).toEqual({ ok: false, error: CODE_ERRORS.damaged })
    expect(await readSetupCode(LINK)).toEqual({ ok: false, error: CODE_ERRORS.damaged })
    // Valid, but not a setup.
    expect(await readSetupCode(await packSetup([1, 2] as unknown as SimConfig))).toEqual({ ok: false, error: CODE_ERRORS.damaged })
  })

  test('a code over a share link’s size caps is refused, unread', async () => {
    expect(await readSetupCode('A'.repeat(MAX_LINK_CHARS + 1))).toEqual({ ok: false, error: CODE_ERRORS.tooLarge })
    const bomb = await packSetup({ padding: ' '.repeat(4 * 1024 * 1024) } as unknown as SimConfig)
    expect(await readSetupCode(bomb)).toEqual({ ok: false, error: CODE_ERRORS.tooLarge })
  })

  test('a setup for a spec the sim doesn’t cover says so', async () => {
    expect(await readSetupCode(await packSetup(fresh('warrior-protection')))).toEqual({
      ok: false,
      error: 'That setup is for a Protection Warrior. This sim doesn’t cover that spec.',
    })
  })
})
