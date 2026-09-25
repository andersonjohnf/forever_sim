// Catalogue entries for one class (docs/mechanics/buffs-debuffs-consumables.md "Class-only
// entries"): mana and spell damage are the paladin's, so warriors and druids never get them, in a
// preset, a saved setup or a plan; and the paladin presets follow §6.2 and §6.3.
import { describe, expect, it } from 'vitest'
import { normalizeConfig } from '../config/normalize'
import { defaultConfig, FULL_RAID } from '../defaults'
import { buildPlan } from '../plan/build'
import { SPEC_IDS, SPEC_META } from '../specs'
import { BUFFS, CASTER_CLASSES, CASTER_SPECS } from './buffs'
import { forSpecClass, presetBuffIds } from './presets'

const PALADIN_ONLY = [
  'prayerOfSpirit',
  'arcaneBrilliance',
  'blessingOfWisdom',
  'manaSpringTotem',
  'flaskOfSupremePower',
  'greaterArcaneElixir',
  'elixirOfHolyPower',
  'majorManaPotion',
  'demonicRune',
  // The caster food and oils (buffs doc §3.4, §3.6).
  'nightfinSoup',
  'wizardOil',
  'brilliantWizardOil',
  // Another paladin's Judgement of the Crusader: Holy damage, which only a paladin deals (buffs doc §4.2).
  'judgementOfTheCrusader',
]
/** The mana and all-schools spell damage entries are the shaman's too (docs/classes/shaman.md); Holy Power and Judgement of the Crusader, Holy only, aren't. */
const SHAMAN_TOO = PALADIN_ONLY.filter((id) => id !== 'elixirOfHolyPower' && id !== 'judgementOfTheCrusader')
/** And the casters': the mage, the first (docs/classes/mage.md), the warlock (docs/classes/warlock.md) and the priest (docs/classes/priest.md; docs/mechanics/spells.md §12). */
const CASTERS_TOO = SHAMAN_TOO
/** And every caster spec's, whatever its class (`forCasterSpecs`): the Balance druid's (docs/classes/druid.md §11.6). */
const CASTER_TOO = SHAMAN_TOO
/**
 * And the hunter's mana entries (docs/classes/hunter.md#74-enchants-and-consumables): Intellect, Spirit,
 * mana per 5 s, potions and runes, not the spell damage ones (no hunter spell reads spell damage).
 */
const HUNTER_TOO = ['prayerOfSpirit', 'arcaneBrilliance', 'blessingOfWisdom', 'manaSpringTotem', 'majorManaPotion', 'demonicRune']

describe('class-only catalogue entries', () => {
  it('give the caster core’s buffs and debuffs to the casters only: the mage since K2, the warlock since K3, the Shadow Priest since K4, the Elemental shaman since K5 and the Balance druid since K6, so no warrior, feral druid, paladin, Enhancement shaman or rogue gets them (docs/mechanics/spells.md §12)', () => {
    expect([CASTER_CLASSES, CASTER_SPECS]).toEqual([
      // The druid isn't a caster class: its Feral specs aren't casters (docs/classes/druid.md §11.6).
      ['mage', 'warlock', 'priest'],
      ['druid-balance', 'shaman-elemental', 'mage-fire', 'mage-frost', 'mage-arcane', 'warlock-destruction', 'warlock-affliction', 'warlock-demonology', 'priest-shadow'],
    ])
    const caster = ['moonkinAura', 'powerInfusion', 'curseOfTheElements']
    // And the Elixir of Shadow Power, a caster's by kind and the warlock's and the priest's by class.
    expect(BUFFS.filter((b) => b.forSpecs === 'caster').map((b) => b.id)).toEqual([...caster, 'elixirOfShadowPower'])
    for (const spec of SPEC_IDS) {
      const isCaster = CASTER_SPECS.includes(spec)
      for (const id of caster) expect(forSpecClass(BUFFS.find((b) => b.id === id)!, spec), `${spec} ${id}`).toBe(isCaster)
      if (isCaster) continue
      for (const preset of ['self', 'dungeon', 'raid', 'max'] as const) {
        for (const id of caster) expect(presetBuffIds(preset, spec, FULL_RAID), `${spec} ${preset}`).not.toContain(id)
      }
    }
    // A warlock keeps its own curse (SpecMeta.ownBuffs), so no preset adds the Buffs tab's.
    for (const preset of ['self', 'dungeon', 'raid', 'max'] as const) expect(presetBuffIds(preset, 'warlock-destruction', FULL_RAID)).not.toContain('curseOfTheElements')
    // The Elemental shaman: all three listed; Curse of the Elements in its raid presets. Power Infusion is in
    // no preset (a caster's rotation presses it when you turn it on).
    for (const id of caster) expect(forSpecClass(BUFFS.find((b) => b.id === id)!, 'shaman-elemental'), id).toBe(true)
    expect(presetBuffIds('raid', 'shaman-elemental', FULL_RAID)).toContain('curseOfTheElements')
    expect(presetBuffIds('raid', 'shaman-elemental', FULL_RAID)).not.toContain('powerInfusion')
    // The priest's raid presets have Moonkin Aura and Curse of the Elements; Power Infusion is in none.
    expect(presetBuffIds('raid', 'priest-shadow', FULL_RAID)).toEqual(expect.arrayContaining(['moonkinAura', 'curseOfTheElements']))
    expect(presetBuffIds('max', 'priest-shadow', FULL_RAID)).not.toContain('powerInfusion')
  })

  it('are the paladin’s mana and spell damage entries, the shaman’s but for Holy Power, the casters’, and the Mighty Rage Potion (warriors and druids only)', () => {
    expect(BUFFS.filter((b) => b.forClasses?.includes('paladin')).map((b) => b.id).sort()).toEqual([...PALADIN_ONLY].sort())
    for (const id of PALADIN_ONLY)
      expect(BUFFS.find((b) => b.id === id)!.forClasses, id).toEqual(
        HUNTER_TOO.includes(id) ? ['paladin', 'shaman', 'mage', 'warlock', 'priest', 'hunter'] : SHAMAN_TOO.includes(id) ? ['paladin', 'shaman', 'mage', 'warlock', 'priest'] : ['paladin'],
      )
    expect(BUFFS.filter((b) => b.forClasses && !b.forClasses.includes('paladin')).map((b) => [b.id, b.forClasses])).toEqual([
      // A bear's own Thorns: only a druid casts it on itself (buffs doc §1.2).
      ['thornsOwn', ['druid']],
      ['elixirOfShadowPower', ['warlock', 'priest']],
      ['instantPoisonMainHand', ['rogue']],
      ['deadlyPoisonMainHand', ['rogue']],
      ['instantPoisonOffHand', ['rogue']],
      ['deadlyPoisonOffHand', ['rogue']],
      ['mightyRagePotion', ['warrior', 'druid']],
      ['thistleTea', ['rogue']],
    ])
    expect(presetBuffIds('max', 'paladin-retribution', FULL_RAID)).not.toContain('mightyRagePotion')
  })

  it('never reach another class’s preset', () => {
    for (const spec of SPEC_IDS) {
      for (const preset of ['dungeon', 'raid', 'max'] as const) {
        const ids = presetBuffIds(preset, spec, FULL_RAID)
        const classId = SPEC_META[spec].classId
        for (const id of PALADIN_ONLY) if (classId !== 'paladin' && !(classId === 'shaman' && SHAMAN_TOO.includes(id)) && !(CASTER_CLASSES.includes(classId) && CASTERS_TOO.includes(id)) && !(SPEC_META[spec].caster === true && CASTER_TOO.includes(id)) && !(classId === 'hunter' && HUNTER_TOO.includes(id))) expect(ids, `${spec} ${preset}`).not.toContain(id)
      }
    }
    expect(forSpecClass({ forClasses: ['paladin'] }, 'warrior-fury')).toBe(false)
    expect(forSpecClass({ forClasses: ['paladin'] }, 'paladin-protection')).toBe(true)
    expect(forSpecClass({}, 'druid-feral-cat')).toBe(true)
    // docs/classes/druid.md §11.6: a druid's mana and spell entries are the Balance spec's, never a feral's.
    expect(forSpecClass({ forClasses: ['paladin'], forCasterSpecs: true }, 'druid-balance')).toBe(true)
    expect(forSpecClass({ forClasses: ['paladin'], forCasterSpecs: true }, 'druid-feral-cat')).toBe(false)
    expect(presetBuffIds('raid', 'druid-balance', FULL_RAID)).toEqual(
      expect.arrayContaining(['arcaneBrilliance', 'blessingOfWisdom', 'greaterArcaneElixir', 'majorManaPotion', 'moonkinAura', 'curseOfTheElements']),
    )
    expect(presetBuffIds('raid', 'druid-feral-cat', FULL_RAID)).not.toContain('arcaneBrilliance')
  })

  it('follow the paladin presets (buffs doc §6.2 “Pal”, §6.3)', () => {
    const raid = (spec: 'paladin-retribution' | 'paladin-protection') => presetBuffIds('raid', spec, FULL_RAID)
    const max = (spec: 'paladin-retribution' | 'paladin-protection') => presetBuffIds('max', spec, FULL_RAID)
    // Retribution, Standard raid: Prayer of Spirit, Arcane Brilliance, Blessing of Wisdom, Mana Spring, Greater Arcane Elixir, Major Mana Potion.
    expect(raid('paladin-retribution').filter((id) => PALADIN_ONLY.includes(id))).toEqual([
      'prayerOfSpirit',
      'arcaneBrilliance',
      'blessingOfWisdom',
      'manaSpringTotem',
      'greaterArcaneElixir',
      'majorManaPotion',
    ])
    // Max consumables adds Elixir of Holy Power, a rune and Flask of Supreme Power; the caster food and
    // oils are Protection's (§6.3).
    // The Buffs tab's Judgement of the Crusader is in no preset: each paladin spec judges its own (SpecMeta.ownBuffs).
    const PROT_ONLY = ['nightfinSoup', 'wizardOil', 'brilliantWizardOil', 'judgementOfTheCrusader']
    expect(max('paladin-retribution').filter((id) => PALADIN_ONLY.includes(id)).sort()).toEqual(PALADIN_ONLY.filter((id) => !PROT_ONLY.includes(id)).sort())
    // Protection: Elixir of Holy Power, Nightfin Soup, Wizard Oil and the potion in Standard; Greater
    // Arcane Elixir, the flask, Brilliant Wizard Oil (in place of Wizard Oil) and a rune in Max.
    expect(raid('paladin-protection').filter((id) => PALADIN_ONLY.includes(id))).toEqual([
      'prayerOfSpirit',
      'arcaneBrilliance',
      'blessingOfWisdom',
      'manaSpringTotem',
      'elixirOfHolyPower',
      'nightfinSoup',
      'wizardOil',
      'majorManaPotion',
    ])
    expect(max('paladin-protection').filter((id) => PALADIN_ONLY.includes(id)).sort()).toEqual(PALADIN_ONLY.filter((id) => id !== 'wizardOil' && id !== 'judgementOfTheCrusader').sort())
    expect(presetBuffIds('dungeon', 'paladin-protection', FULL_RAID)).toContain('nightfinSoup')
    // Each needs its provider: no shaman, no Mana Spring; no priest or mage, no Spirit or Intellect.
    expect(presetBuffIds('raid', 'paladin-retribution', FULL_RAID.filter((c) => c !== 'shaman'))).not.toContain('manaSpringTotem')
    const noCasters = presetBuffIds('raid', 'paladin-retribution', FULL_RAID.filter((c) => c !== 'priest' && c !== 'mage'))
    expect(noCasters).not.toContain('prayerOfSpirit')
    expect(noCasters).not.toContain('arcaneBrilliance')
  })

  it('are turned off in another class’s saved setup, with a note, and do nothing in its plan', () => {
    const fury = defaultConfig('warrior-fury')
    const saved = { ...fury, buffs: { ...fury.buffs, enabled: [...fury.buffs.enabled, 'greaterArcaneElixir', 'majorManaPotion'] } }
    const { config, warnings } = normalizeConfig(saved)
    expect(config.buffs.enabled).toEqual(fury.buffs.enabled)
    expect(warnings).toEqual(expect.arrayContaining(['Greater Arcane Elixir does nothing for a warrior, so it was turned off.']))
    // A plan built without normalizing skips them too: no spell damage, and no potion left unpressed.
    const bundle = buildPlan(saved)
    expect(bundle.plan.stats.spellDamage).toBe(buildPlan(fury).plan.stats.spellDamage)
    expect(bundle.assumptions.find((a) => a.id === 'onUseConsumables')?.text ?? '').not.toContain('Major Mana Potion')
  })

  it('give a paladin their mana and spell damage', () => {
    const ret = defaultConfig('paladin-retribution')
    const none = buildPlan({ ...ret, buffs: { ...ret.buffs, enabled: [] } }).plan
    const some = buildPlan({ ...ret, buffs: { ...ret.buffs, enabled: ['blessingOfWisdom', 'manaSpringTotem', 'greaterArcaneElixir', 'elixirOfHolyPower'] } }).plan
    expect(some.stats.spellDamage - none.stats.spellDamage).toBe(35)
    expect(some.stats.holySpellDamage - none.stats.holySpellDamage).toBe(40)
    // 40 + 25 mana per 5 s: 26 mana a 2 s tick, in tenths.
    expect(some.mana!.mp5TickTenths! - none.mana!.mp5TickTenths!).toBe(260)
    // Prayer of Spirit's +40 Spirit (+5% for a Human: 42) and Arcane Brilliance's +31 Intellect (+2%
    // from the default build's Divine Intellect 1: 32; 15 mana each, character-stats.md).
    const sheet = (enabled: string[]) => buildPlan({ ...ret, buffs: { ...ret.buffs, enabled } }).sheet
    const bare = sheet([])
    const both = sheet(['prayerOfSpirit', 'arcaneBrilliance'])
    expect(ret.race).toBe('alliance-human')
    expect([both.spirit - bare.spirit, both.intellect - bare.intellect]).toEqual([42, 32])
    expect(both.mana! - bare.mana!).toBe(32 * 15)
  })
})
