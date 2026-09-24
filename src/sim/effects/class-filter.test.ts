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
]
/** The mana and all-schools spell damage entries are the shaman's too (docs/classes/shaman.md); Holy Power isn't. */
const SHAMAN_TOO = PALADIN_ONLY.filter((id) => id !== 'elixirOfHolyPower')

describe('class-only catalogue entries', () => {
  it('give the caster core’s buffs and debuffs to the casters only: no class yet, so no warrior, druid, paladin or shaman gets them (docs/mechanics/spells.md §12)', () => {
    expect([CASTER_CLASSES, CASTER_SPECS]).toEqual([[], []])
    const caster = ['moonkinAura', 'powerInfusion', 'curseOfTheElements']
    for (const spec of SPEC_IDS) {
      for (const id of caster) expect(forSpecClass(BUFFS.find((b) => b.id === id)!, spec), `${spec} ${id}`).toBe(false)
      for (const preset of ['self', 'dungeon', 'raid', 'max'] as const) {
        for (const id of caster) expect(presetBuffIds(preset, spec, FULL_RAID), `${spec} ${preset}`).not.toContain(id)
      }
    }
  })

  it('are the paladin’s mana and spell damage entries, the shaman’s but for Holy Power, the casters’, and the Mighty Rage Potion (warriors and druids only)', () => {
    expect(BUFFS.filter((b) => b.forClasses?.includes('paladin')).map((b) => b.id).sort()).toEqual([...PALADIN_ONLY].sort())
    for (const id of PALADIN_ONLY) expect(BUFFS.find((b) => b.id === id)!.forClasses).toEqual(SHAMAN_TOO.includes(id) ? ['paladin', 'shaman'] : ['paladin'])
    expect(BUFFS.filter((b) => b.forClasses && !b.forClasses.includes('paladin')).map((b) => [b.id, b.forClasses])).toEqual([
      ['moonkinAura', CASTER_CLASSES],
      ['powerInfusion', CASTER_CLASSES],
      ['curseOfTheElements', CASTER_CLASSES],
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
        for (const id of PALADIN_ONLY) if (classId !== 'paladin' && !(classId === 'shaman' && SHAMAN_TOO.includes(id))) expect(ids, `${spec} ${preset}`).not.toContain(id)
      }
    }
    expect(forSpecClass({ forClasses: ['paladin'] }, 'warrior-fury')).toBe(false)
    expect(forSpecClass({ forClasses: ['paladin'] }, 'paladin-protection')).toBe(true)
    expect(forSpecClass({}, 'druid-feral-cat')).toBe(true)
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
    // Max consumables adds Elixir of Holy Power, a rune and Flask of Supreme Power.
    expect(max('paladin-retribution').filter((id) => PALADIN_ONLY.includes(id)).sort()).toEqual([...PALADIN_ONLY].sort())
    // Protection: Elixir of Holy Power and the potion in Standard; Greater Arcane Elixir, the flask and a rune in Max.
    expect(raid('paladin-protection').filter((id) => PALADIN_ONLY.includes(id))).toEqual([
      'prayerOfSpirit',
      'arcaneBrilliance',
      'blessingOfWisdom',
      'manaSpringTotem',
      'elixirOfHolyPower',
      'majorManaPotion',
    ])
    expect(max('paladin-protection').filter((id) => PALADIN_ONLY.includes(id)).sort()).toEqual([...PALADIN_ONLY].sort())
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
    // Prayer of Spirit's +40 Spirit (+5% for a Human: 42) and Arcane Brilliance's +31 Intellect (15 mana each, character-stats.md).
    const sheet = (enabled: string[]) => buildPlan({ ...ret, buffs: { ...ret.buffs, enabled } }).sheet
    const bare = sheet([])
    const both = sheet(['prayerOfSpirit', 'arcaneBrilliance'])
    expect(ret.race).toBe('alliance-human')
    expect([both.spirit - bare.spirit, both.intellect - bare.intellect]).toEqual([42, 31])
    expect(both.mana! - bare.mana!).toBe(31 * 15)
  })
})
