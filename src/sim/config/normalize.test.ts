import { describe, expect, it } from 'vitest'
import { Rng } from '../core/rng'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { SPEC_IDS } from '../specs'
import type { SimConfig } from '../types'
import { normalizeConfig } from './normalize'

describe('normalizeConfig', () => {
  it('leaves every default setup untouched, with no warnings', () => {
    for (const spec of SPEC_IDS) {
      const d = defaultConfig(spec)
      const { config, warnings } = normalizeConfig(d)
      expect(warnings, spec).toEqual([])
      expect(config).toEqual(d)
    }
  })

  it('is idempotent', () => {
    const once = normalizeConfig({ spec: 'warrior-arms', race: 'horde-orc', fight: { durationSec: 9999 } }).config
    const twice = normalizeConfig(once)
    expect(twice.config).toEqual(once)
    expect(twice.warnings).toEqual([])
  })

  it.each([null, undefined, 42, 'text', [], true])('resets unreadable input (%s) to a Fury warrior', (input) => {
    const { config, warnings } = normalizeConfig(input)
    expect(config).toEqual(defaultConfig('warrior-fury'))
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('resets a config from a newer version, keeping its spec', () => {
    const { config, warnings } = normalizeConfig({ ...defaultConfig('warrior-arms'), version: 2 })
    expect(config).toEqual(defaultConfig('warrior-arms'))
    expect(warnings).toHaveLength(1)
  })

  it('repairs an illegal race for the class', () => {
    const { config, warnings } = normalizeConfig({ ...defaultConfig('paladin-protection'), race: 'horde-orc' })
    expect(config.race).toBe('alliance-human')
    expect(warnings[0]).toMatch(/paladin/)
    expect(normalizeConfig({ ...defaultConfig('druid-feral-cat'), race: 'alliance-human' }).config.race).toBe('horde-tauren')
  })

  it('repairs bad talent codes', () => {
    for (const talents of ['99999', 'abc', 42, '5555555555555555555555555555-', '---']) {
      const { config, warnings } = normalizeConfig({ ...defaultConfig('warrior-fury'), talents })
      expect(config.talents).toBe(defaultConfig('warrior-fury').talents)
      expect(warnings).toHaveLength(1)
    }
    // A legal but different build is kept; an empty build is legal.
    expect(normalizeConfig({ ...defaultConfig('warrior-fury'), talents: '' }).config.talents).toBe('')
  })

  it('removes unknown items, wrong slots, illegal items, extra off hands, duplicate uniques and bad enchants', () => {
    const d = defaultConfig('warrior-fury')
    const { config, warnings } = normalizeConfig({
      ...d,
      gear: {
        head: { itemId: 999999999 },
        neck: { itemId: 12640 }, // Lionheart Helm in the neck slot
        mainHand: { itemId: 12592, enchantId: 'crusader' }, // a two-hander…
        offHand: { itemId: 15806 }, // …frees the off hand
        finger1: { itemId: 19325 },
        finger2: { itemId: 19325 }, // Don Julio's Band twice
        hands: { itemId: 15063, enchantId: 'twoHandAgility' }, // a weapon enchant on gloves
        back: { itemId: 13340, enchantId: 'no-such-enchant' },
        tabard: { itemId: 1 },
        chest: 'lol',
      },
    })
    expect(config.gear.head).toBeUndefined()
    expect(config.gear.neck).toBeUndefined()
    expect(config.gear.mainHand).toEqual({ itemId: 12592, enchantId: 'crusader' })
    expect(config.gear.offHand).toBeUndefined()
    expect(config.gear.finger1).toEqual({ itemId: 19325 })
    expect(config.gear.finger2 === undefined || config.gear.finger2.itemId !== 19325 || false).toBe(true)
    expect(config.gear.hands).toEqual({ itemId: 15063 })
    expect(config.gear.back).toEqual({ itemId: 13340 })
    expect(warnings.length).toBeGreaterThanOrEqual(8)
  })

  it('keeps druids out of plate and paladins’ off hands free of weapons', () => {
    const cat = normalizeConfig({ ...defaultConfig('druid-feral-cat'), gear: { head: { itemId: 12640 } } })
    expect(cat.config.gear.head).toBeUndefined()
    const pal = normalizeConfig({ ...defaultConfig('paladin-retribution'), gear: { offHand: { itemId: 15806 } } })
    expect(pal.config.gear.offHand).toBeUndefined()
  })

  it('drops unknown buffs, buffs nobody provides, and rivals in an exclusive group', () => {
    const d = defaultConfig('warrior-fury')
    const { config, warnings } = normalizeConfig({
      ...d,
      buffs: { raid: ['warrior', 'druid', 'nobody'], enabled: ['battleShout', 'rallyingCryOfTheDragonslayer', 'blessingOfKings', 'jujuPower', 'elixirOfGreaterStrength', 7] },
    })
    expect(config.buffs.raid).toEqual(['warrior', 'druid'])
    expect(config.buffs.enabled).toEqual(['battleShout', 'jujuPower'])
    expect(warnings.length).toBe(5)
  })

  it('migrates a setup saved before M1: an empty buff list becomes the Standard raid preset', () => {
    const old = { ...defaultConfig('warrior-arms'), buffs: { raid: defaultConfig('warrior-arms').buffs.raid, enabled: [] }, run: { iterations: 3000, seed: 1 } }
    const { config, warnings } = normalizeConfig(old)
    expect(config.buffs.enabled).toEqual(defaultConfig('warrior-arms').buffs.enabled)
    expect(config.run).toEqual({ mode: 'adaptive', iterations: 3000, seed: 1 })
    expect(warnings).toEqual([])
    // A current setup with no buffs keeps its choice.
    const now = { ...defaultConfig('warrior-arms'), buffs: { raid: [], enabled: [] } }
    expect(normalizeConfig(now).config.buffs.enabled).toEqual([])
  })

  it('clamps out-of-range fight values and resets non-numbers', () => {
    const d = defaultConfig('warrior-protection')
    const { config, warnings } = normalizeConfig({
      ...d,
      fight: {
        ...d.fight,
        durationSec: 5,
        durationVariationPct: -3,
        bossLevel: 70,
        bossArmor: Number.NaN,
        executePct: 90,
        extraTargets: 2.6,
        position: 'sideways',
        creatureType: 'dragon',
        zone: 'moon',
        damageTakenPerSec: 1e9,
        boss: { ...d.fight.boss, swingSpeedSec: 0, damageMin: 6000, damageMax: 100, canCrush: 'yes' },
      },
    })
    expect(config.fight).toMatchObject({
      durationSec: 30,
      durationVariationPct: 0,
      bossLevel: 63,
      bossArmor: 3731,
      executePct: 50,
      extraTargets: 3,
      position: 'front',
      creatureType: 'none',
      zone: 'hyjal',
      damageTakenPerSec: 500,
    })
    expect(config.fight.boss).toMatchObject({ swingSpeedSec: 1, damageMin: 100, damageMax: 6000, canCrush: true })
    expect(warnings.length).toBeGreaterThanOrEqual(12)
  })

  it('validates run settings and rules', () => {
    const d = defaultConfig('warrior-fury')
    const { config, warnings } = normalizeConfig({
      ...d,
      rules: { profile: 'sod', unmeasuredRatings: 'maybe', damageTakenRage: 'magic' },
      run: { mode: 'forever', iterations: 10, seed: -5.5 },
    })
    expect(config.rules).toEqual({ profile: 'forever', unmeasuredRatings: 'apply' })
    expect(config.run).toEqual({ mode: 'adaptive', iterations: 100, seed: 5 })
    expect(warnings).toHaveLength(6)
    expect(normalizeConfig({ ...d, rules: { ...d.rules, damageTakenRage: 'foreverHp' } }).config.rules.damageTakenRage).toBe('foreverHp')
  })

  it('drops rotation settings the spec doesn’t have', () => {
    const { config, warnings } = normalizeConfig({ ...defaultConfig('warrior-fury'), rotation: { 'warrior.fury.nope': 3 } })
    expect(config.rotation).toEqual({})
    expect(warnings).toHaveLength(1)
  })

  it('never throws, and always returns a config the engine accepts (fuzz)', () => {
    const rng = new Rng()
    rng.seed(2024, 0, 0)
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)]
    const junk = (): unknown =>
      pick([null, undefined, -1, 0, 1e12, Number.NaN, Infinity, '', 'x', true, [], {}, [1, 'a'], { a: 1 }, 'warrior-fury', 12640, 'crusader'])
    const mutate = (value: unknown, depth: number): unknown => {
      if (depth > 3 || rng.next() < 0.15) return junk()
      if (Array.isArray(value)) return value.map((v) => mutate(v, depth + 1)).filter(() => rng.next() > 0.1)
      if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value)) if (rng.next() > 0.1) out[k] = rng.next() < 0.3 ? mutate(v, depth + 1) : v
        if (rng.next() < 0.1) out[pick(['__proto__', 'constructor', 'extra', 'toString'])] = junk()
        return out
      }
      return rng.next() < 0.3 ? junk() : value
    }
    for (let i = 0; i < 400; i++) {
      const input = mutate(defaultConfig(pick(SPEC_IDS)), 0)
      let result: { config: SimConfig; warnings: string[] } | undefined
      expect(() => (result = normalizeConfig(input))).not.toThrow()
      const { config } = result!
      expect(SPEC_IDS).toContain(config.spec)
      expect(() => buildPlan(config)).not.toThrow()
      expect(normalizeConfig(config).warnings).toEqual([])
    }
  })
})
