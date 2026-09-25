import { describe, expect, it } from 'vitest'
import { buffCatalogue, forSpecClass, unusedBuffs, type SpecId } from '@/sim'
import { rivalNote } from './rival-note'

// docs/ux.md "Buffs": an entry that turns a rival off says so, when the spec's tab lists the rival
// (review FU-5; buffs doc "Exclusivity groups").
const noteFor = (spec: SpecId, id: string, locked: Record<string, string> = {}) => {
  const catalogue = buffCatalogue.filter((b) => forSpecClass(b, spec))
  const def = catalogue.find((b) => b.id === id)
  return def && rivalNote(def, catalogue, { ...unusedBuffs(spec), ...locked })
}

describe('the rival note', () => {
  it('gives both air totems theirs on a Fury warrior', () => {
    for (const id of ['windfuryTotem', 'graceOfAir']) expect(noteFor('warrior-fury', id), id).toBe('One air totem at a time (even from different shamans)')
  })

  it('gives both Thorns theirs on a bear', () => {
    for (const id of ['thorns', 'thornsOwn']) expect(noteFor('druid-feral-bear', id), id).toBe('Doesn’t stack with the other Thorns')
  })

  it('leaves it out with no rival listed or usable', () => {
    // Only a druid casts its own Thorns, so a warrior's lists one.
    expect(noteFor('warrior-protection', 'thorns')).toBeUndefined()
    // An Enhancement shaman's Windfury Weapon locks the totem off (the Buffs tab adds it to the locked
    // ones): it says why instead, and Grace of Air turns nothing off it could use.
    const windfuryWeapon = { windfuryTotem: 'Not used: your Windfury Weapon (see Rotation) turns it off for you' }
    expect(noteFor('shaman-enhancement', 'windfuryTotem', windfuryWeapon)).toBeUndefined()
    expect(noteFor('shaman-enhancement', 'graceOfAir', windfuryWeapon)).toBeUndefined()
    // With another imbue, it's the totem's usual pair.
    expect(noteFor('shaman-enhancement', 'graceOfAir')).toBe('One air totem at a time (even from different shamans)')
  })

  it('gives none to groups whose summaries say it themselves, or to other entries', () => {
    expect(noteFor('warrior-fury', 'mightyRagePotion')).toBeUndefined()
    expect(noteFor('warrior-fury', 'denseSharpeningStone')).toBeUndefined()
    expect(noteFor('warrior-fury', 'strengthOfEarth')).toBeUndefined()
  })
})
