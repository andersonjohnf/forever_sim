import { describe, expect, it } from 'vitest'
import { Rng } from '../core/rng'
import { defaultConfig } from '../defaults'
import { BUFFS_BY_ID, type BuffSpec } from '../effects/buffs'
import { defaultAplOrder, moveAplRow } from '../classes/apl'
import { rotationApl } from '../classes/rotation'
import { buildPlan } from '../plan/build'
import { CLASSIC_ERA, FOREVER } from '../rules/profiles'
import { SPEC_IDS } from '../specs'
import type { SimConfig } from '../types'
import { compareEffects, normalizeConfig } from './normalize'

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
    const { config, warnings } = normalizeConfig({ ...defaultConfig('warrior-arms'), version: 3 })
    expect(config).toEqual(defaultConfig('warrior-arms'))
    expect(warnings).toHaveLength(1)
  })

  describe('talent codes on older trees (docs/data/talents.md#tree-versions)', () => {
    it('reads version 1 (or none) as 1.60.1.69913’s trees: a player’s own build by name, with what was refunded said', () => {
      // Retribution's default then, one point off: Improved Holy Strike and Crusade are gone, and the
      // 20-point row below Crusade loses its gate, and with it the talents under it.
      const { config, warnings, talentChange } = normalizeConfig({ version: 1, spec: 'paladin-retribution', talents: '250003-503-052052310012330311' })
      expect(config.version).toBe(2)
      expect(config.talents).toBe('50003-503-05205231001')
      expect(talentChange?.successor).toBeUndefined()
      expect(talentChange?.refunds.map((t) => t.name)).toEqual(['Improved Holy Strike', 'Crusade', 'Two-Handed Weapon Specialization', 'Vengeance', 'Twist of Light', 'Champion of the Light', 'Instrument of Law'])
      expect(warnings).toEqual([
        'The game’s new talent trees refunded 15 talent points: Improved Holy Strike and Crusade left the game, and 5 talents below them lost the points their rows need. Spend them again in Talents.',
      ])
      // No version is version 1.
      expect(normalizeConfig({ spec: 'paladin-retribution', talents: '250003-503-052052310012330311' }).config.talents).toBe('50003-503-05205231001')
    })

    it('reads a default or preset the sim shipped on the old trees as today’s version of it, and says so (review TM2-1)', () => {
      const { config, warnings, talentChange } = normalizeConfig({ version: 1, spec: 'paladin-retribution', talents: '250003-503-052052310012330321' })
      expect(config.talents).toBe(defaultConfig('paladin-retribution').talents)
      expect(talentChange).toEqual({ refunds: [], successor: { label: 'the Retribution default', now: 'today’s default', spec: 'paladin-retribution' } })
      expect(warnings).toEqual(['Your talents were the Retribution default on the game’s old trees; they’re now today’s default.'])
      expect(normalizeConfig({ version: 1, spec: 'paladin-protection', talents: '240003-0530213321301551-502' }).config.talents).toBe(defaultConfig('paladin-protection').talents)
    })

    it('says nothing when a version-1 build keeps every point, and writes it on today’s trees', () => {
      const { config, warnings, talentChange } = normalizeConfig({ version: 1, spec: 'shaman-elemental', talents: '5504301500103031-04-053250000001' })
      expect(config.talents).toBe(defaultConfig('shaman-elemental').talents)
      expect(warnings).toEqual([])
      expect(talentChange).toBeUndefined()
      // A tree no build moved: the same code, in canonical form (a player's own build; the shipped
      // defaults read as today's, talent-successors.ts).
      expect(normalizeConfig({ version: 1, spec: 'warrior-fury', talents: '3200521-250500035152310051' }).config.talents).toBe('3200521-250500035152310051-')
    })

    it('reads version 2 on today’s trees: the same digits can be another build, or none', () => {
      // 2-4530513321301541-502 is Improved Holy Strike 2 on 69913's trees and Divine Strength 2 on today's.
      const v1 = normalizeConfig({ version: 1, spec: 'paladin-protection', talents: '2-4530513321301541-502' })
      const v2 = normalizeConfig({ version: 2, spec: 'paladin-protection', talents: '2-4530513321301541-502' })
      expect(v1.config.talents).toBe('-4530513321301541-502')
      expect(v2.config.talents).toBe('2-4530513321301541-502')
      expect(v2.warnings).toEqual([])
      // 69913's Elemental default is illegal on today's trees (Elemental Alacrity has 3 ranks there).
      const illegal = normalizeConfig({ version: 2, spec: 'shaman-elemental', talents: '5504301500103031-04-053250000001' })
      expect(illegal.config.talents).toBe(defaultConfig('shaman-elemental').talents)
      expect(illegal.warnings).toEqual(['The talent build wasn’t valid, so the default build was used.'])
    })

    it('refuses a version-1 code that wasn’t legal on 69913’s trees, as before', () => {
      // Lava Burst (tier 7) with 28 points above it: illegal then, so not "refunded" now.
      const { config, warnings, talentChange } = normalizeConfig({ version: 1, spec: 'shaman-elemental', talents: '5505301500103001' })
      expect(config.talents).toBe(defaultConfig('shaman-elemental').talents)
      expect(warnings).toEqual(['The talent build wasn’t valid, so the default build was used.'])
      expect(talentChange).toBeUndefined()
    })
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

  it('removes the later item of a Unique-Equipped group, and a unique weapon’s second copy (docs/data/items.md#equipping-rules)', () => {
    const d = defaultConfig('warrior-fury')
    const { config, warnings } = normalizeConfig({
      ...d,
      gear: {
        ...d.gear,
        trinket1: { itemId: 272438 }, // Weakness Analyzer…
        trinket2: { itemId: 272437 }, // …and Adaptive Combat Assistant: both Undermine Trinkets (1)
        finger1: { itemId: 275968 }, // Ferocious…
        finger2: { itemId: 275970 }, // …and Vigilant Watcher's Signet (1)
        mainHand: { itemId: 12798, enchantId: 'crusader' }, // Annihilator…
        offHand: { itemId: 12798, enchantId: 'crusader' }, // …in both hands
      },
    })
    expect(config.gear.trinket1).toEqual({ itemId: 272438 })
    expect(config.gear.trinket2).toBeUndefined()
    expect(config.gear.finger1).toEqual({ itemId: 275968 })
    expect(config.gear.finger2).toBeUndefined()
    expect(config.gear.mainHand).toEqual({ itemId: 12798, enchantId: 'crusader' })
    expect(config.gear.offHand).toBeUndefined()
    expect(warnings).toEqual([
      "Vigilant Watcher's Signet can’t be worn with Ferocious Watcher's Signet (Unique-Equipped: Watcher's Signet), so it was removed.",
      'Adaptive Combat Assistant can’t be worn with Weakness Analyzer (Unique-Equipped: Undermine Trinkets), so it was removed.',
      'Annihilator is unique, so the second copy was removed.',
    ])
    expect(normalizeConfig(config).warnings).toEqual([])
  })

  it('equips the race’s faction’s default gear when a setup has none', () => {
    const orc = normalizeConfig({ spec: 'warrior-fury', race: 'horde-orc' }).config
    expect(orc.gear).toEqual(defaultConfig('warrior-fury', 'horde-orc').gear)
    expect(orc.gear.shoulder).toEqual({ itemId: 23243 }) // Champion's Plate Shoulders
    expect(normalizeConfig({ spec: 'warrior-fury' }).config.gear.shoulder).toEqual({ itemId: 23315 }) // Lieutenant Commander's
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

  it('keeps the exclusive buff with the largest effect (buffs doc, "Exclusivity groups")', () => {
    const d = defaultConfig('warrior-fury')
    const keep = (enabled: string[], config: SimConfig = d) => normalizeConfig({ ...config, buffs: { raid: d.buffs.raid, enabled } })
    // Juju Power (+30 Str) over Elixir of Greater Strength (+25), whichever comes first.
    for (const enabled of [['elixirOfGreaterStrength', 'jujuPower'], ['jujuPower', 'elixirOfGreaterStrength']]) {
      const { config, warnings } = keep(enabled)
      expect(config.buffs.enabled).toEqual(['jujuPower'])
      expect(warnings).toEqual(['Elixir of Greater Strength doesn’t stack with Juju Power, so it was turned off.'])
    }
    expect(keep(['jujuMight', 'winterfallFirewater']).config.buffs.enabled).toEqual(['jujuMight'])
    // Equal effects keep the first: Sunder Armor and Expose Armor both take 2,250 armor in Forever…
    expect(keep(['exposeArmor', 'sunderArmor']).config.buffs.enabled).toEqual(['exposeArmor'])
    // …but Expose takes 1,700 in Classic Era, so Sunder is the larger there.
    const classic = { ...d, rules: { ...d.rules, profile: 'classicEra' as const } }
    expect(keep(['exposeArmor', 'sunderArmor'], classic).config.buffs.enabled).toEqual(['sunderArmor'])
    // Rivals that change different things: the one the spec's Max consumables preset picks, else the first.
    expect(keep(['mightfishSteak', 'smokedDesertDumplings']).config.buffs.enabled).toEqual(['smokedDesertDumplings'])
    expect(keep(['grilledSquid', 'mightfishSteak']).config.buffs.enabled).toEqual(['grilledSquid'])
    const prot = defaultConfig('warrior-protection')
    expect(keep(['flaskOfNaturalAggression', 'flaskOfTheTitans'], prot).config.buffs.enabled).toEqual(['flaskOfTheTitans'])
  })

  // Issue #13: one stone or oil a weapon; the one the plan would put on it stays (buffs doc §3.6).
  it('keeps one stone or oil, the one with the weapon’s higher priority, and says they take the same weapon', () => {
    const mage = defaultConfig('mage-fire')
    for (const enabled of [['wizardOil', 'brilliantWizardOil'], ['brilliantWizardOil', 'wizardOil']]) {
      const { config, warnings } = normalizeConfig({ ...mage, buffs: { raid: mage.buffs.raid, enabled } })
      expect(config.buffs.enabled).toEqual(['brilliantWizardOil'])
      expect(warnings).toEqual(['Wizard Oil takes the same weapon as Brilliant Wizard Oil, so it was turned off.'])
    }
    const ret = defaultConfig('paladin-retribution')
    const keep = (enabled: string[]) => normalizeConfig({ ...ret, buffs: { raid: ret.buffs.raid, enabled } }).config.buffs.enabled
    expect(keep(['elementalSharpeningStone', 'denseSharpeningStone'])).toEqual(['elementalSharpeningStone'])
    expect(keep(['denseSharpeningStone', 'wizardOil'])).toEqual(['wizardOil'])
    // The plan put the same one on the weapon before, so a saved setup's result doesn't move.
    const both = buildPlan({ ...ret, buffs: { raid: ret.buffs.raid, enabled: [...ret.buffs.enabled, 'elementalSharpeningStone'] } })
    const kept = buildPlan(normalizeConfig({ ...ret, buffs: { raid: ret.buffs.raid, enabled: [...ret.buffs.enabled, 'elementalSharpeningStone'] } }).config)
    expect(kept.sheet.critPct).toBe(both.sheet.critPct)
    // Poisons are chosen per hand and keep their own groups: both hands' stay.
    const rogue = defaultConfig('rogue-combat')
    expect(normalizeConfig(rogue).warnings).toEqual([])
    expect(rogue.buffs.enabled).toEqual(expect.arrayContaining(['deadlyPoisonMainHand', 'instantPoisonOffHand']))
  })

  // Issue #14: consumables on one shared cooldown (buffs doc "On-use items and cooldown categories").
  it('keeps one potion, the one the rotation drinks, and says they share a cooldown', () => {
    const prot = defaultConfig('warrior-protection')
    for (const enabled of [['greaterStoneshieldPotion', 'mightyRagePotion'], ['mightyRagePotion', 'greaterStoneshieldPotion']]) {
      const { config, warnings } = normalizeConfig({ ...prot, buffs: { raid: prot.buffs.raid, enabled } })
      expect(config.buffs.enabled).toEqual(['mightyRagePotion'])
      expect(warnings).toEqual(['Greater Stoneshield Potion shares a cooldown with Mighty Rage Potion, so it was turned off.'])
    }
    const ret = defaultConfig('paladin-retribution')
    const { config } = normalizeConfig({ ...ret, buffs: { raid: ret.buffs.raid, enabled: ['greaterStoneshieldPotion', 'majorManaPotion', 'demonicRune', 'ezThroDarkBomb'] } })
    // The rune and the bomb have cooldowns of their own, apart from the potions'.
    expect(config.buffs.enabled).toEqual(['majorManaPotion', 'demonicRune', 'ezThroDarkBomb'])
  })

  // Review CR-3: a rival that's locked off for the spec anyway did nothing, so its going needs no note.
  it('drops an Enhancement shaman’s second stone without a note: its imbue takes the weapon anyway', () => {
    const enh = defaultConfig('shaman-enhancement')
    const { config, warnings } = normalizeConfig({ ...enh, buffs: { raid: enh.buffs.raid, enabled: ['denseSharpeningStone', 'elementalSharpeningStone'] } })
    expect(config.buffs.enabled).toEqual(['elementalSharpeningStone'])
    expect(warnings).toEqual([])
    // A warrior's two stones still say why one went.
    const fury = defaultConfig('warrior-fury')
    expect(normalizeConfig({ ...fury, buffs: { raid: fury.buffs.raid, enabled: ['denseSharpeningStone', 'elementalSharpeningStone'] } }).warnings).toEqual([
      'Dense Sharpening Stone / Weightstone takes the same weapon as Elemental Sharpening Stone, so it was turned off.',
    ])
  })

  // Review CV-8: a rival the spec can use beats a bigger one locked off for it.
  it('keeps a hunter’s Grilled Squid over Smoked Desert Dumplings, whose attack power its shots don’t use', () => {
    const hunter = defaultConfig('hunter-marksmanship')
    for (const enabled of [
      ['smokedDesertDumplings', 'grilledSquid'],
      ['grilledSquid', 'smokedDesertDumplings'],
    ]) {
      const { config, warnings } = normalizeConfig({ ...hunter, buffs: { raid: hunter.buffs.raid, enabled } })
      expect(config.buffs.enabled, enabled.join()).toEqual(['grilledSquid'])
      // The one that goes did nothing for a hunter, so its going needs no note (CR-3).
      expect(warnings, enabled.join()).toEqual([])
    }
    const roids = normalizeConfig({ ...hunter, buffs: { raid: hunter.buffs.raid, enabled: ['roids', 'groundScorpokAssay'] } })
    expect(roids.config.buffs.enabled).toEqual(['groundScorpokAssay'])
    // Both usable: the bigger one still wins, for a warrior.
    const fury = defaultConfig('warrior-fury')
    expect(normalizeConfig({ ...fury, buffs: { raid: fury.buffs.raid, enabled: ['grilledSquid', 'smokedDesertDumplings'] } }).config.buffs.enabled).toEqual([
      'smokedDesertDumplings',
    ])
  })

  // RL4: the comparison reads each entry's Classic Era values in `classicEra` (catalogueEffects).
  it('compares exclusive rivals by the profile’s own values, Classic Era’s included', () => {
    const giants = BUFFS_BY_ID.get('elixirOfGreaterStrength')! // +25 Strength in both clients
    const juju = BUFFS_BY_ID.get('jujuPower')! // +30 in both
    expect(compareEffects(juju, giants, FOREVER)).toBe(1)
    expect(compareEffects(juju, giants, CLASSIC_ERA)).toBe(1)
    // A rival whose Classic Era value is smaller than Forever's loses in `classicEra` only.
    const rival: BuffSpec = {
      ...juju,
      effects: [{ kind: 'stat', stat: 'str', value: 30 }],
      classicEra: { summary: '+20 Strength', effects: [{ kind: 'stat', stat: 'str', value: 20 }] },
    }
    expect(compareEffects(rival, giants, FOREVER)).toBe(1)
    expect(compareEffects(rival, giants, CLASSIC_ERA)).toBe(-1)
    // A real entry with Classic Era values of another kind: Mightfish Steak is +40 attack power in
    // Forever and +10 Stamina in Classic Era, so against Rumsey Rum's +15 Stamina it only compares there.
    const steak = BUFFS_BY_ID.get('mightfishSteak')!
    const rum = BUFFS_BY_ID.get('rumseyRum')!
    expect(compareEffects(steak, rum, FOREVER)).toBeNull()
    expect(compareEffects(steak, rum, CLASSIC_ERA)).toBe(-1)
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
    for (const model of ['forever', 'foreverFlat', 'foreverHealthLost', 'classic'] as const) {
      const out = normalizeConfig({ ...d, rules: { ...d.rules, damageTakenRage: model } })
      expect(out.config.rules.damageTakenRage).toBe(model)
      expect(out.warnings).toEqual([])
    }
  })

  it('drops a saved Judgement of the Crusader rule without a word: the setting is gone (paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc)', () => {
    const ret = defaultConfig('paladin-retribution')
    for (const jotcBonus of ['flat', 'coefficient', 'always']) {
      const out = normalizeConfig({ ...ret, rules: { ...ret.rules, jotcBonus } })
      expect(out.config.rules).toEqual(ret.rules)
      expect(out.warnings).toEqual([])
    }
  })

  it('maps the legacy damage-taken rage ids to their new names, without a warning (rage.md#rage-from-damage-taken)', () => {
    const d = defaultConfig('warrior-protection')
    const legacy = { foreverHp: 'foreverHealthLost', foreverHpPreArmor: 'forever' } as const
    for (const [old, now] of Object.entries(legacy)) {
      const { config, warnings } = normalizeConfig({ ...d, rules: { ...d.rules, damageTakenRage: old } })
      expect(config.rules.damageTakenRage).toBe(now)
      expect(warnings).toEqual([])
      // A raw setup that skips normalizing still gets the new model.
      const raw = { ...d, rules: { ...d.rules, damageTakenRage: old } } as unknown as SimConfig
      expect(buildPlan(raw).plan.rage.damageTakenModel).toBe(now)
    }
    // Prototype keys aren't ids.
    expect(normalizeConfig({ ...d, rules: { ...d.rules, damageTakenRage: 'toString' } }).config.rules.damageTakenRage).toBeUndefined()
  })

  it('drops rotation settings the spec doesn’t have', () => {
    const { config, warnings } = normalizeConfig({ ...defaultConfig('warrior-fury'), rotation: { 'warrior.fury.nope': 3 } })
    expect(config.rotation).toEqual({})
    expect(warnings).toHaveLength(1)
  })

  describe('a priority list’s order (decision D31)', () => {
    const d = defaultConfig('warrior-fury')
    const def = rotationApl('warrior-fury')!
    const order = moveAplRow(def, defaultAplOrder(def), 'whirlwind', 2)!

    it('keeps a moved order, and a setup without one loads as before, with no order stored', () => {
      const kept = normalizeConfig({ ...d, rotationOrder: order })
      expect(kept.config.rotationOrder).toEqual(order)
      expect(kept.warnings).toEqual([])
      // Saved before priority lists: no order, the same config.
      const old = normalizeConfig(d)
      expect('rotationOrder' in old.config).toBe(false)
      expect(JSON.stringify(old.config)).toBe(JSON.stringify(d))
      // The default order isn't stored.
      const same = normalizeConfig({ ...d, rotationOrder: defaultAplOrder(def) })
      expect('rotationOrder' in same.config).toBe(false)
      expect(same.warnings).toEqual([])
    })

    it('drops unknown rows with a warning, and puts missing ones back at their default place quietly', () => {
      const unknown = normalizeConfig({ ...d, rotationOrder: ['nope', ...order, 7] })
      expect(unknown.config.rotationOrder).toEqual(order)
      expect(unknown.warnings).toEqual(['Abilities in the rotation’s priority order that this spec doesn’t have were dropped.'])
      // A setup saved before a row existed (say Slam): it goes back after Berserker Rage.
      const missing = normalizeConfig({ ...d, rotationOrder: order.filter((id) => id !== 'slam') })
      expect(missing.config.rotationOrder).toEqual(order)
      expect(missing.warnings).toEqual([])
      // The pinned pre-pull stays first.
      const pinned = normalizeConfig({ ...d, rotationOrder: [...order.slice(1), 'prepull'] })
      expect(pinned.config.rotationOrder).toEqual(order)
    })

    it('resets an order it can’t read, and reads another spec’s order as this one’s', () => {
      const bad = normalizeConfig({ ...d, rotationOrder: 'whirlwind' })
      expect('rotationOrder' in bad.config).toBe(false)
      expect(bad.warnings).toEqual(['The rotation’s priority order couldn’t be read, so the default order was used.'])
      // Every spec has a list (M5.65 A2), so a Fury order given to Arms keeps the rows Arms has, drops
      // the rest with the unknown-rows warning, and puts Arms's own missing rows back.
      const arms = normalizeConfig({ ...defaultConfig('warrior-arms'), rotationOrder: order })
      const armsIds = defaultAplOrder(rotationApl('warrior-arms')!)
      expect([...(arms.config.rotationOrder ?? armsIds)].sort()).toEqual([...armsIds].sort())
      expect(arms.warnings).toEqual(['Abilities in the rotation’s priority order that this spec doesn’t have were dropped.'])
    })
  })

  it('carries a renamed rotation setting over to its new id (warrior.md §5.2 row 3)', () => {
    const d = defaultConfig('warrior-fury')
    const old = normalizeConfig({ ...d, rotation: { 'warrior.fury.racial.syncWithDeathWish': false } })
    expect(old.config.rotation).toEqual({ 'warrior.fury.cooldowns.syncWithDeathWish': false })
    expect(old.warnings).toEqual([])
    // The new id wins when both are saved.
    const both = normalizeConfig({ ...d, rotation: { 'warrior.fury.racial.syncWithDeathWish': false, 'warrior.fury.cooldowns.syncWithDeathWish': true } })
    expect(both.config.rotation).toEqual({ 'warrior.fury.cooldowns.syncWithDeathWish': true })
    expect(both.warnings).toEqual([])
  })

  it('keeps a choice only when it’s one of its values (the Arms base stance, warrior.md §5.3)', () => {
    const d = defaultConfig('warrior-arms')
    const ok = normalizeConfig({ ...d, rotation: { 'warrior.arms.baseStance': 'berserker' } })
    expect(ok.config.rotation).toEqual({ 'warrior.arms.baseStance': 'berserker' })
    expect(ok.warnings).toEqual([])
    for (const bad of ['defensive', 4, true]) {
      const { config, warnings } = normalizeConfig({ ...d, rotation: { 'warrior.arms.baseStance': bad } })
      expect(config.rotation).toEqual({})
      expect(warnings).toHaveLength(1)
    }
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
