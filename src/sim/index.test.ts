// The public API as the UI uses it (docs/architecture.md#data-flow).
import { describe, expect, it } from 'vitest'
import {
  buffCatalogue,
  buffCatalogueFor,
  buffPresets,
  buffProvided,
  computeSheet,
  defaultConfig,
  enchantCatalogue,
  enchantCatalogueFor,
  FULL_RAID,
  modelledItemEffects,
  normalizeConfig,
  getSpec,
  presetBuffs,
  rotationGroups,
  rotationValues,
  type SimConfig,
  type SimProgress,
  type SpecId,
  simulate,
  SPEC_IDS,
  specs,
  talentBuffs,
  unusedBuffs,
  unusedRotationSettings,
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

  it('fills a SimResult for a Feral cat: its abilities, cooldowns and the Energy it runs on', async () => {
    const result = await simulate(quick(defaultConfig('druid-feral-cat'), 500))
    expect(result.spec).toBe('druid-feral-cat')
    expect(result.dps.mean).toBeGreaterThan(300)
    // The form's swings are the main hand's row; Shred and Rip carry the damage (druid.md §6.2).
    const ids = result.abilities.map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['mainHand', 'shred', 'rip', 'ferociousBite']))
    expect(ids).not.toContain('offHand')
    expect(result.abilities.find((a) => a.id === 'rip')?.bleed?.uptimePct).toBeGreaterThan(50)
    const casts = Object.fromEntries(result.cooldowns.map((c) => [c.id, c.castsPerFight]))
    expect(casts.tigersFury).toBeGreaterThan(4)
    expect(casts.berserk).toBeGreaterThanOrEqual(1)
    expect(casts.faerieFire).toBeGreaterThan(4)
    // The form's swings are named for what they are, not for the weapon, whose damage they don't use.
    expect(result.abilities.find((a) => a.id === 'mainHand')?.name).toBe('Auto attack')
    // Energy's ticks and refunds, Omen of Clarity and the form weapon are listed; no rage refunds,
    // and the reaction time and GCD in the cat's terms (Energy, Clearcasting, a 1 s GCD).
    const notes = result.assumptions.map((a) => a.id)
    expect(notes).toEqual(expect.arrayContaining(['energyTicks', 'omenOfClarityCat', 'formWeaponCat', 'noPowershift', 'reactionTimeEnergy', 'gcdHasteCat']))
    for (const id of ['abilityRefunds', 'reactionTime', 'gcdHaste', 'formWeapon', 'omenOfClarity']) expect(notes).not.toContain(id)
    // Only Cat Form's figures, and no warrior terms (CU10).
    const texts = result.assumptions.map((a) => a.text).join(' ')
    expect(texts).not.toMatch(/bear|Bear|Bloodthirst/)
    expect(result.assumptions.find((a) => a.id === 'noPowershift')?.docRef).toMatch(/druid\.md#28-/)
    expect(result.assumptions.find((a) => a.id === 'gcdHasteCat')?.text).toMatch(/1 s in Cat Form/)
  })

  it('keeps a warrior’s reaction time and 1.5 s GCD assumptions, and its white swings as Main hand', async () => {
    const result = await simulate(quick(defaultConfig('warrior-arms')))
    const notes = result.assumptions.map((a) => a.id)
    expect(notes).toEqual(expect.arrayContaining(['reactionTime', 'gcdHaste']))
    expect(result.assumptions.find((a) => a.id === 'gcdHaste')?.text).toMatch(/^The 1\.5 s global cooldown/)
    expect(result.abilities.find((a) => a.id === 'mainHand')?.name).toBe('Main hand')
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
    await expect(simulate(quick({ ...defaultConfig('warrior-arms'), race: 'alliance-skyborne-high-order' }))).rejects.toThrow(/Skyborne/)
  })
})

describe('paladin', () => {
  it('simulates both specs on the placeholder base stats of D24, and says so; Retribution ships since C2, Protection since C3', async () => {
    for (const spec of ['paladin-retribution', 'paladin-protection'] as const) {
      const result = await simulate(quick(defaultConfig(spec)))
      expect(result.dps.mean).toBeGreaterThan(0)
      expect(result.assumptions.map((a) => a.id)).toContain('baseStatPlaceholders')
    }
    expect(getSpec('paladin-retribution').available).toBe(true)
    expect(getSpec('paladin-protection').available).toBe(true)
  })

  it('reports a paladin’s spell stats and mana (docs/ux.md#results), and no one else’s', async () => {
    const ret = await simulate(quick(defaultConfig('paladin-retribution')))
    expect(ret.sheet.mana).toBeGreaterThan(2000)
    expect(ret.sheet.spell).toMatchObject({ holyDamage: expect.any(Number), critPct: expect.any(Number), hitPct: expect.any(Number) })
    // Blessing of Wisdom and Mana Spring Totem in the Standard raid.
    expect(ret.sheet.spell!.mp5).toBeGreaterThan(0)
    expect(ret.mana).toMatchObject({ max: ret.sheet.mana })
    expect(ret.mana!.spentPerFight).toBeGreaterThan(ret.mana!.max)
    const fury = await simulate(quick(defaultConfig('warrior-fury')))
    expect(fury.sheet.spell).toBeUndefined()
    expect(fury.mana).toBeUndefined()
  })
})

describe('specs', () => {
  it('offers only finished specs: Fury since M2.2c, Arms since M2.3c, Protection since P2, the Feral cat since B2, Retribution since C2 and the Protection paladin since C3 (docs/ux.md principle 8), with every spec’s metadata', () => {
    expect(specs.map((s) => s.id)).toEqual(SPEC_IDS)
    expect(specs.filter((s) => s.available).map((s) => s.id)).toEqual(['warrior-fury', 'warrior-arms', 'warrior-protection', 'druid-feral-cat', 'paladin-retribution', 'paladin-protection'])
    // The bear is still unfinished, so the switcher doesn't offer it.
    expect(getSpec('druid-feral-bear').available).toBe(false)
    expect(getSpec('warrior-protection').role).toBe('tank')
    expect(() => getSpec('mage-fire' as never)).toThrow()
  })
})

describe('buffs the talents bring (docs/ux.md "Buffs")', () => {
  it('names a druid’s Leader of the Pack from its talent, and nothing for a build without it or a warrior', () => {
    expect(talentBuffs(defaultConfig('druid-feral-cat'))).toEqual(['leaderOfThePack'])
    expect(talentBuffs({ spec: 'druid-feral-cat', talents: '' })).toEqual([])
    expect(talentBuffs(defaultConfig('warrior-fury'))).toEqual([])
  })
})

describe('rotation groups (docs/ux.md "Rotation")', () => {
  // Every spec with settings, a hidden one too, so a spec meets these rules before it ships.
  for (const spec of specs.filter((s) => s.rotationOptions.length > 0)) {
    it(`puts every ${spec.name} setting under a heading, a dependent one with its parent or naming it`, () => {
      const options = spec.rotationOptions
      for (const [i, option] of options.entries()) {
        // Only what shapes the rest comes first without a heading: Arms' stance, and a tank's
        // Priority, its duties first or Max TPS (D26).
        if (option.id === 'warrior.arms.baseStance' || option.id === 'warrior.protection.priority' || option.id === 'paladin.protection.priority') {
          expect(option.group).toBeUndefined()
          expect(i, option.id).toBe(0)
        } else expect(rotationGroups, option.id).toContain(option.group)
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

describe('unusedRotationSettings (docs/ux.md "Rotation")', () => {
  it('names a racial cooldown setting the race can’t use, in every spec with one', () => {
    const note = (spec: SpecId, race: string) => unusedRotationSettings({ ...defaultConfig(spec), race })
    expect(note('warrior-fury', 'alliance-human')).toEqual({ 'warrior.fury.racial.enabled': 'Not used: Human has no racial cooldown that adds damage.' })
    expect(note('warrior-arms', 'alliance-gnome')).toEqual({ 'warrior.arms.racial.enabled': 'Not used: the Gnome’s Eureka! isn’t simulated.' })
    expect(note('warrior-fury', 'horde-orc')).toEqual({})
    expect(note('warrior-arms', 'horde-troll')).toEqual({})
    expect(Object.keys(note('druid-feral-cat', 'alliance-night-elf'))).not.toContain('druid.cat.racial.enabled')
    expect(note('druid-feral-cat', 'horde-skyborne-windshaper')).toMatchObject({
      'druid.cat.racial.enabled': 'Not used: Skyborne (Windshaper) has no racial cooldown that adds damage.',
    })
    // Every one of them is a setting of its spec.
    for (const spec of SPEC_IDS) {
      for (const id of Object.keys(note(spec, 'alliance-human'))) expect(getSpec(spec).rotationOptions.map((o) => o.id)).toContain(id)
    }
  })

  it('names the cat’s Rake and Rip when "only when nothing else bleeds" meets a raid with warriors, and not without them', () => {
    const cat = { ...defaultConfig('druid-feral-cat'), race: 'alliance-night-elf' }
    const both = { 'druid.cat.rip.onlyWithoutOtherBleeds': true }
    // Rake's "only when nothing else bleeds" is on by default, so its note shows whether Rake is on or off.
    expect(Object.keys(unusedRotationSettings(cat))).toEqual(['druid.cat.rake.enabled'])
    expect(Object.keys(unusedRotationSettings({ ...cat, rotation: both }))).toEqual(['druid.cat.rake.enabled', 'druid.cat.rip.enabled'])
    const noWarriors = { ...cat, rotation: both, buffs: { ...cat.buffs, raid: cat.buffs.raid.filter((c) => c !== 'warrior') } }
    expect(unusedRotationSettings(noWarriors)).toEqual({})
  })
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
    // Fury's are its plain defaults; Protection's Charge follows Vanguard (warrior.md §5.4 row 0); a spec
    // without a rotation has none.
    expect(rotationValues(defaultConfig('warrior-fury'))['warrior.fury.bloodthirst.enabled']).toBe(true)
    const prot = defaultConfig('warrior-protection')
    expect(rotationValues(prot)['warrior.protection.prepull.charge']).toBe(true)
    expect(rotationValues({ ...prot, talents: '' })['warrior.protection.prepull.charge']).toBe(false)
    // Its priority moves switches and a number: Max TPS drops the duties and keeps Shield Slam (§5.4, D26).
    expect(rotationValues({ ...prot, rotation: { 'warrior.protection.priority': 'maxTps' } })).toMatchObject({
      'warrior.protection.shieldBlock.enabled': false,
      'warrior.protection.shieldSlam.enabled': true,
      'warrior.protection.heroicStrike.minRage': 45,
    })
    // A spec without settings has no values.
    expect(rotationValues(defaultConfig('paladin-protection'))).toEqual({})
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
    for (const spec of ['warrior-protection', 'druid-feral-bear', 'paladin-protection'] as const) {
      const buffs = presetBuffs('raid', spec, FULL_RAID)
      expect(buffs, spec).toEqual(expect.arrayContaining(['elixirOfGreaterDefense']))
      expect(buffs, spec).not.toContain('blessingOfSalvation')
      expect(buffs, spec).not.toContain('leaderOfThePack')
    }
    // A Protection paladin's Devotion Aura is its own duty (SpecMeta.ownBuffs): the other tanks' presets have one.
    expect(presetBuffs('raid', 'warrior-protection', FULL_RAID)).toContain('devotionAura')
    expect(presetBuffs('raid', 'druid-feral-bear', FULL_RAID)).toContain('devotionAura')
    for (const preset of buffPresets) expect(presetBuffs(preset.id, 'paladin-protection', FULL_RAID), preset.id).not.toContain('devotionAura')
    // No warrior tank's Thunder Clap or Demoralizing Shout in any preset: a Protection warrior's are
    // its own (below), and another tank's raid has none unless you add them (buffs doc §6.2, D26).
    for (const spec of SPEC_IDS) {
      for (const preset of buffPresets) {
        expect(presetBuffs(preset.id, spec, FULL_RAID), `${spec} ${preset.id}`).not.toContain('thunderClap')
        expect(presetBuffs(preset.id, spec, FULL_RAID), `${spec} ${preset.id}`).not.toContain('demoralizingShout')
      }
    }
  })

  it('follows composition, not faction', () => {
    const noShaman = presetBuffs('raid', 'warrior-fury', FULL_RAID.filter((c) => c !== 'shaman'))
    expect(noShaman).not.toContain('windfuryTotem')
    expect(noShaman).not.toContain('strengthOfEarth')
    expect(presetBuffs('self', 'warrior-fury', FULL_RAID)).toEqual([])
    // Self only is what you cast on yourself: a paladin's Might, a druid's Mark of the Wild.
    expect(presetBuffs('self', 'paladin-retribution', FULL_RAID)).toEqual(['blessingOfMight'])
    expect(presetBuffs('self', 'druid-feral-cat', [])).toEqual(['markOfTheWild'])
    expect(presetBuffs('max', 'warrior-fury', FULL_RAID)).toEqual(expect.arrayContaining(['jujuPower', 'jujuMight', 'roids', 'armorShatter', 'elementalSharpeningStone']))
    expect(presetBuffs('max', 'warrior-fury', FULL_RAID)).not.toContain('elixirOfGreaterStrength')
    expect(buffPresets.map((p) => p.id)).toEqual(['self', 'dungeon', 'raid', 'max'])
  })

  it('leaves out a spec’s own buffs: the cat’s Faerie Fire is its rotation’s, a warrior’s the raid’s', () => {
    for (const preset of ['raid', 'max'] as const) {
      expect(presetBuffs(preset, 'druid-feral-cat', FULL_RAID)).not.toContain('faerieFire')
      expect(presetBuffs(preset, 'warrior-fury', FULL_RAID)).toContain('faerieFire')
      // A Protection warrior's Thunder Clap and Demoralizing Shout are its duties (D26).
      expect(presetBuffs(preset, 'warrior-protection', FULL_RAID)).not.toContain('thunderClap')
      expect(presetBuffs(preset, 'warrior-protection', FULL_RAID)).not.toContain('demoralizingShout')
    }
    expect(getSpec('druid-feral-cat').ownBuffs).toEqual(['faerieFire'])
    expect(getSpec('warrior-protection').ownBuffs).toEqual(['thunderClap', 'demoralizingShout'])
    expect(getSpec('warrior-arms').ownBuffs).toBeUndefined()
  })

  it('counts a druid player as the raid’s druid for Mark of the Wild, which it casts on itself; not a warrior', () => {
    const noDruid = FULL_RAID.filter((c) => c !== 'druid')
    const gift = buffCatalogue.find((b) => b.id === 'markOfTheWild')!
    expect(buffProvided(gift, noDruid, 'druid-feral-cat')).toBe(true)
    expect(buffProvided(gift, noDruid, 'warrior-fury')).toBe(false)
    // Faerie Fire in Buffs is another druid's, so it still needs one.
    expect(buffProvided(buffCatalogue.find((b) => b.id === 'faerieFire')!, noDruid, 'druid-feral-cat')).toBe(false)
    expect(presetBuffs('raid', 'druid-feral-cat', noDruid)).toContain('markOfTheWild')
    expect(presetBuffs('raid', 'warrior-fury', noDruid)).not.toContain('markOfTheWild')
    // The plan applies it, and loading the setup keeps it.
    const cat = defaultConfig('druid-feral-cat')
    const alone = { ...cat, buffs: { raid: noDruid, enabled: presetBuffs('raid', 'druid-feral-cat', noDruid) } }
    expect(computeSheet(alone)!.strength).toBe(computeSheet(cat)!.strength)
    expect(normalizeConfig(alone).config.buffs.enabled).toContain('markOfTheWild')
  })

  it('locks a weapon stone’s damage off for a cat, whose attacks in Cat Form don’t use the weapon’s damage (Q25)', () => {
    expect(unusedBuffs('druid-feral-cat')).toEqual({ denseSharpeningStone: 'Not used in Cat Form: your attacks there don’t use your weapon’s damage' })
    expect(unusedBuffs('warrior-fury')).toEqual({})
    // The plan leaves it out; the Elemental Sharpening Stone's crit still applies.
    const cat = defaultConfig('druid-feral-cat')
    const withStone = (id: string) => computeSheet({ ...cat, buffs: { ...cat.buffs, enabled: [...cat.buffs.enabled, id] } })!
    expect(withStone('denseSharpeningStone')).toEqual(computeSheet(cat))
    expect(withStone('elementalSharpeningStone').critPct).toBeCloseTo(computeSheet(cat)!.critPct + 2, 9)
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
