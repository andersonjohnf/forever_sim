import { describe, expect, it } from 'vitest'
import { buffCatalogue, forSpecClass, unusedBuffs, type SpecId } from '@/sim'
import { weaponNote } from './weapon-note'

// docs/ux.md "Buffs": a stone's or an oil's note names only what the spec can put on its weapons
// (review CR-5; buffs doc §3.6).
const noteFor = (spec: SpecId, id: string) => {
  const catalogue = buffCatalogue.filter((b) => forSpecClass(b, spec))
  const def = catalogue.find((b) => b.id === id)
  return def && weaponNote(def, catalogue, unusedBuffs(spec))
}

describe('the stones’ and oils’ note', () => {
  it('names a warrior’s stones, a rogue’s stones and poisons, a Retribution paladin’s stones and oils', () => {
    expect(noteFor('warrior-fury', 'denseSharpeningStone')).toBe('(one stone per weapon)')
    expect(noteFor('warrior-protection', 'elementalSharpeningStone')).toBe('(one stone per weapon)')
    expect(noteFor('rogue-combat', 'elementalSharpeningStone')).toBe('(one stone or poison per weapon)')
    expect(noteFor('paladin-retribution', 'elementalSharpeningStone')).toBe('(one stone or oil per weapon)')
    expect(noteFor('paladin-retribution', 'wizardOil')).toBe('(one stone or oil per weapon)')
  })

  it('gives a caster’s oils, on its one weapon, "(one oil at a time)"', () => {
    for (const spec of ['mage-fire', 'warlock-affliction', 'priest-shadow', 'druid-balance', 'shaman-elemental'] as const) {
      expect(noteFor(spec, 'brilliantWizardOil'), spec).toBe('(one oil at a time)')
    }
  })

  it('leaves out a stone the spec can’t use, which says why instead', () => {
    // An Enhancement shaman's imbue, a hunter's ranged weapon, a bear's form.
    expect(noteFor('shaman-enhancement', 'denseSharpeningStone')).toBeUndefined()
    expect(noteFor('hunter-marksmanship', 'elementalSharpeningStone')).toBeUndefined()
    expect(noteFor('druid-feral-bear', 'denseSharpeningStone')).toBeUndefined()
    // The bear's Elemental stone still works in its form; its Dense one doesn't, so only stones are named.
    expect(noteFor('druid-feral-bear', 'elementalSharpeningStone')).toBe('(one stone per weapon)')
  })

  it('gives no note to other entries', () => {
    expect(noteFor('warrior-fury', 'mightyRagePotion')).toBeUndefined()
    expect(noteFor('rogue-combat', 'deadlyPoisonMainHand')).toBeUndefined()
  })
})
