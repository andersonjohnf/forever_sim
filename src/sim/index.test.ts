// The public API as the UI uses it (docs/architecture.md#data-flow).
import { describe, expect, it } from 'vitest'
import {
  buffCatalogue,
  buffCatalogueFor,
  buffPresets,
  computeSheet,
  defaultConfig,
  enchantCatalogue,
  enchantCatalogueFor,
  FULL_RAID,
  modelledItemEffects,
  getSpec,
  presetBuffs,
  rotationGroups,
  rotationValues,
  type SimConfig,
  type SimProgress,
  simulate,
  SPEC_IDS,
  specs,
} from './index'

const quick = (config: SimConfig, iterations = 250): SimConfig => ({ ...config, run: { ...config.run, mode: 'fixed', iterations } })

describe('simulate', () => {
  it('fills a SimResult for a warrior, with DPS and TPS', async () => {
    const progress: SimProgress[] = []
    const result = await simulate(quick(defaultConfig('warrior-fury'), 500), { onProgress: (p) => progress.push(p) })
    expect(result.spec).toBe('warrior-fury')
    expect(result.profile).toBe('forever')
    expect(result.iterations).toBe(500)
    expect(result.durationSec).toBeGreaterThan(160)
    expect(result.durationSec).toBeLessThan(200)
    expect(result.dps.mean).toBeGreaterThan(100)
    expect(result.dps.ci95).toBeGreaterThan(0)
    expect(result.dps.stdev).toBeGreaterThan(result.dps.ci95)
    expect(result.tps.mean).toBeGreaterThan(0)
    expect(result.abilities.map((a) => a.id)).toEqual(expect.arrayContaining(['mainHand', 'offHand']))
    const total = result.abilities.reduce((n, a) => n + a.damage, 0) / result.iterations / result.durationSec
    expect(total / result.dps.mean).toBeCloseTo(1, 1)
    const main = result.abilities.find((a) => a.id === 'mainHand')!
    expect(main.hits + main.crits + main.glances + main.blocks + main.misses + main.dodges + main.parries).toBe(main.casts)
    expect(result.sheet.attackPower).toBeGreaterThan(1000)
    expect(result.assumptions.length).toBeGreaterThan(3)
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(progress.at(-1)).toEqual({ completedIterations: 500, totalIterations: 500 })
    // Cooldowns and buffs: what deals no damage, with casts per fight and uptimes (docs/ux.md#results).
    const deathWish = result.cooldowns.find((c) => c.id === 'deathWish')!
    expect(deathWish.castsPerFight).toBeGreaterThanOrEqual(1)
    expect(deathWish.uptimePct).toBeGreaterThan(10)
    expect(result.cooldowns.find((c) => c.id === 'flurry')).toMatchObject({ castsPerFight: null })
  })

  it('headlines TPS for a tank and reports the boss parrying from the front', async () => {
    const result = await simulate(quick(defaultConfig('warrior-protection')))
    expect(result.tps.mean).toBeGreaterThan(result.dps.mean)
    const main = result.abilities.find((a) => a.id === 'mainHand')!
    expect(main.parries).toBeGreaterThan(0)
    expect(main.blocks).toBeGreaterThan(0)
  })

  it('is reproducible from the seed, and changes with it', async () => {
    const config = quick(defaultConfig('warrior-arms'))
    const a = await simulate(config)
    const b = await simulate(config)
    const c = await simulate({ ...config, run: { ...config.run, seed: 2 } })
    expect(b.dps).toEqual(a.dps)
    expect(c.dps.mean).not.toBe(a.dps.mean)
  })

  it('runs Classic Era rules', async () => {
    const config = quick(defaultConfig('warrior-arms'))
    const classic = await simulate({ ...config, rules: { ...config.rules, profile: 'classicEra' } })
    expect(classic.profile).toBe('classicEra')
    expect(classic.assumptions.map((a) => a.id)).not.toContain('foreverGlancing')
  })

  it('rejects with an AbortError when cancelled', async () => {
    const controller = new AbortController()
    const run = simulate(defaultConfig('warrior-fury'), { signal: controller.signal })
    controller.abort()
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('explains setups it can’t simulate yet instead of guessing', async () => {
    await expect(simulate(quick(defaultConfig('paladin-retribution')))).rejects.toThrow(/Paladin simulation/)
    await expect(simulate(quick({ ...defaultConfig('warrior-arms'), race: 'alliance-skyborne-high-order' }))).rejects.toThrow(/Skyborne/)
  })
})

describe('specs', () => {
  it('offers only finished specs: Fury since M2.2c and Arms since M2.3c (docs/ux.md principle 8), with every spec’s metadata', () => {
    expect(specs.map((s) => s.id)).toEqual(SPEC_IDS)
    expect(specs.filter((s) => s.available).map((s) => s.id)).toEqual(['warrior-fury', 'warrior-arms'])
    expect(getSpec('warrior-protection').role).toBe('tank')
    expect(() => getSpec('mage-fire' as never)).toThrow()
  })
})

describe('rotation groups (docs/ux.md "Rotation")', () => {
  for (const spec of specs.filter((s) => s.available)) {
    it(`puts every ${spec.name} setting under a heading, a dependent one with its parent or naming it`, () => {
      const options = spec.rotationOptions
      for (const [i, option] of options.entries()) {
        // Only Arms' stance, which shapes the rest, comes first without a heading.
        if (option.id === 'warrior.arms.baseStance') expect(option.group).toBeUndefined()
        else expect(rotationGroups, option.id).toContain(option.group)
        if (option.dependsOn === undefined) continue
        const p = options.findIndex((o) => o.id === option.dependsOn)
        const parent = options[p]
        // The tab indents it under its parent when they share a heading; otherwise its help says what it needs.
        if (parent.group === option.group) expect(p, option.id).toBeLessThan(i)
        else expect(option.help, option.id).toContain(`Needs ${parent.label} on`)
      }
      // No heading over a single setting.
      for (const group of rotationGroups) {
        const n = options.filter((o) => o.group === group).length
        if (n > 0) expect(n, group).toBeGreaterThanOrEqual(2)
      }
    })
  }
})

describe('rotationValues', () => {
  it('gives each setting its saved value or its default for the setup: Arms follows the talents and the base stance (warrior.md §5.3)', () => {
    const arms = defaultConfig('warrior-arms')
    expect(rotationValues(arms)).toMatchObject({ 'warrior.arms.baseStance': 'battle', 'warrior.arms.rend.enabled': true, 'warrior.arms.whirlwind.enabled': false })
    // Without Bloodthrill (no Arms talents at all), Rend is off by default.
    expect(rotationValues({ ...arms, talents: '' })['warrior.arms.rend.enabled']).toBe(false)
    expect(rotationValues({ ...arms, rotation: { 'warrior.arms.baseStance': 'berserker' } })).toMatchObject({
      'warrior.arms.rend.enabled': false,
      'warrior.arms.overpower.enabled': false,
      'warrior.arms.whirlwind.enabled': true,
    })
    // Fury's are its plain defaults, and a spec without a rotation has none.
    expect(rotationValues(defaultConfig('warrior-fury'))['warrior.fury.bloodthirst.enabled']).toBe(true)
    expect(rotationValues(defaultConfig('warrior-protection'))).toEqual({})
  })
})

describe('catalogues and presets', () => {
  it('has unique ids, a doc reference each, and no world buffs (D8)', () => {
    expect(new Set(buffCatalogue.map((b) => b.id)).size).toBe(buffCatalogue.length)
    expect(new Set(enchantCatalogue.map((e) => e.id)).size).toBe(enchantCatalogue.length)
    for (const b of [...buffCatalogue, ...enchantCatalogue]) expect(b.docRef).toMatch(/^docs\/mechanics\/buffs-debuffs-consumables\.md#/)
    const names = buffCatalogue.map((b) => b.name.toLowerCase()).join(' ')
    for (const world of ['rallying cry', 'zandalar', 'songflower', 'warchief', 'fengus', 'mol’dar', 'slip’kik', 'darkmoon']) expect(names).not.toContain(world)
  })

  it('shows each rule profile’s numbers in the summaries (buffs doc, Classic Era values)', () => {
    const summary = (list: { id: string; summary: string }[], id: string) => list.find((e) => e.id === id)!.summary
    expect(buffCatalogueFor('forever')).toBe(buffCatalogue)
    expect(enchantCatalogueFor('forever')).toBe(enchantCatalogue)
    expect(buffCatalogueFor('classicEra')).toBe(buffCatalogueFor('classicEra'))
    expect(summary(buffCatalogueFor('forever'), 'battleShout')).toBe('+139 attack power')
    expect(summary(buffCatalogueFor('classicEra'), 'battleShout')).toBe('+232 attack power')
    expect(summary(buffCatalogueFor('classicEra'), 'blessingOfKings')).toBe('+10% all stats')
    expect(summary(enchantCatalogueFor('forever'), 'gloveGreaterStrength')).toBe('+10 Strength')
    expect(summary(enchantCatalogueFor('classicEra'), 'gloveGreaterStrength')).toBe('+7 Strength')
    // Everything but the summary is the same in both.
    const rest = (list: { summary: string }[]) => list.map((e) => JSON.stringify({ ...e, summary: null }))
    expect(rest(buffCatalogueFor('classicEra'))).toEqual(rest(buffCatalogue))
    expect(rest(enchantCatalogueFor('classicEra'))).toEqual(rest(enchantCatalogue))
  })

  it('says which item effects the engine models', () => {
    // Hand of Justice: its extra attack; Weakness Analyzer: its use too; Blackblade of Shahram: neither.
    expect(modelledItemEffects(11815)).toEqual({ equip: true, use: false })
    expect(modelledItemEffects(272438)).toEqual({ equip: true, use: true })
    expect(modelledItemEffects(12592)).toEqual({ equip: false, use: false })
  })

  it('makes Standard raid the default and matches the doc’s Fury preset', () => {
    const fury = defaultConfig('warrior-fury')
    expect(fury.buffs.enabled).toEqual(presetBuffs('raid', 'warrior-fury', FULL_RAID))
    expect(new Set(fury.buffs.enabled)).toEqual(
      new Set([
        'battleShout',
        'blessingOfMight',
        'blessingOfKings',
        'markOfTheWild',
        'powerWordFortitude',
        'leaderOfThePack',
        'windfuryTotem',
        'strengthOfEarth',
        'blessingOfSalvation',
        'sunderArmor',
        'faerieFire',
        'curseOfRecklessness',
        'elixirOfTheMongoose',
        'elixirOfGreaterStrength',
        'winterfallFirewater',
        'smokedDesertDumplings',
        'denseSharpeningStone',
        'mightyRagePotion',
      ]),
    )
  })

  it('gives tanks Devotion Aura and boss debuffs but not Salvation or Leader of the Pack', () => {
    const prot = presetBuffs('raid', 'warrior-protection', FULL_RAID)
    expect(prot).toEqual(expect.arrayContaining(['devotionAura', 'demoralizingShout', 'thunderClap', 'elixirOfGreaterDefense']))
    expect(prot).not.toContain('blessingOfSalvation')
    expect(prot).not.toContain('leaderOfThePack')
  })

  it('follows composition, not faction', () => {
    const noShaman = presetBuffs('raid', 'warrior-fury', FULL_RAID.filter((c) => c !== 'shaman'))
    expect(noShaman).not.toContain('windfuryTotem')
    expect(noShaman).not.toContain('strengthOfEarth')
    expect(presetBuffs('self', 'warrior-fury', FULL_RAID)).toEqual([])
    expect(presetBuffs('max', 'warrior-fury', FULL_RAID)).toEqual(expect.arrayContaining(['jujuPower', 'jujuMight', 'roids', 'armorShatter', 'elementalSharpeningStone']))
    expect(presetBuffs('max', 'warrior-fury', FULL_RAID)).not.toContain('elixirOfGreaterStrength')
    expect(buffPresets.map((p) => p.id)).toEqual(['self', 'dungeon', 'raid', 'max'])
  })

  it('never lets a preset pick two buffs from one exclusive group', () => {
    for (const spec of SPEC_IDS) {
      for (const preset of buffPresets) {
        const groups = presetBuffs(preset.id, spec, FULL_RAID)
          .map((id) => buffCatalogue.find((b) => b.id === id)!.exclusiveGroup)
          .filter(Boolean)
        expect(new Set(groups).size, `${spec} ${preset.id}`).toBe(groups.length)
      }
    }
  })

  it('gives warrior defaults the doc’s enchants', () => {
    const gear = defaultConfig('warrior-fury').gear
    expect(gear.mainHand?.enchantId).toBe('crusader')
    expect(gear.offHand?.enchantId).toBe('crusader')
    expect(gear.hands?.enchantId).toBe('gloveGreaterStrength')
    expect(defaultConfig('warrior-protection').gear.hands?.enchantId).toBe('gloveThreat')
    expect(defaultConfig('warrior-protection').gear.offHand?.enchantId).toBe('shieldGreaterStamina')
  })
})

describe('computeSheet', () => {
  it('returns a sheet for every spec’s default setup', () => {
    for (const spec of SPEC_IDS) expect(computeSheet(defaultConfig(spec)), spec).not.toBeNull()
  })
  it('survives junk', () => {
    expect(computeSheet({} as SimConfig)).not.toBeNull()
  })
})
