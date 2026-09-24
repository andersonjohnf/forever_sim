import { describe, expect, test } from 'vitest'
import { specs, type SpecId } from '@/sim'
import { appSentence, coverageSentence } from './specs'

const offering = (...ids: SpecId[]) => ids.map((id) => specs.find((s) => s.id === id)!)

// docs/ux.md, "About & data": the description names no spec, and says "DPS and TPS" once a tank
// spec ships; the coverage line lists the specs one class at a time.
describe('the About sheet and page description', () => {
  test('say DPS until a tank spec ships, then DPS and TPS', () => {
    expect(appSentence(offering('warrior-fury', 'warrior-arms'))).toBe('A DPS simulator for WoW Forever.')
    expect(appSentence(offering('warrior-fury', 'warrior-arms', 'druid-feral-cat'))).toBe('A DPS simulator for WoW Forever.')
    expect(appSentence(offering('warrior-fury', 'warrior-protection'))).toBe('A DPS and TPS simulator for WoW Forever.')
    // What ships today: Protection, the first tank since P2, so index.html's descriptions say
    // "A DPS and TPS simulator" too.
    expect(appSentence()).toBe('A DPS and TPS simulator for WoW Forever.')
  })

  test('list the specs one class at a time', () => {
    expect(coverageSentence(offering('warrior-fury'))).toBe('Covers Warriors: Fury.')
    expect(coverageSentence(offering('warrior-fury', 'warrior-arms'))).toBe('Covers Warriors: Fury and Arms.')
    // The specs that ship today: Protection since P2, the Feral cat since B2 and the bear since B4,
    // whose names never break across lines, Retribution since C2, a class after another " · ", the
    // Protection paladin since C3, Enhancement since S1, the three rogues since R1, the mages since K2, the warlocks since K3 and Elemental since K5.
    expect(coverageSentence()).toBe(
      'Covers Warriors: Fury, Arms and Protection · Druids: Feral (Cat) and Feral (Bear) · Paladins: Retribution and Protection · Shamans: Enhancement and Elemental · Rogues: Combat, Assassination and Subtlety · Mages: Fire, Frost and Arcane · Warlocks: Destruction and Affliction.',
    )
    const all = coverageSentence(specs)
    expect(all).toMatch(/^Covers Warriors: [^·]+ · Druids: [^·]+ · Paladins: [^·]+ · Shamans: [^·]+ · Rogues: [^·]+ · Mages: [^·]+ · Warlocks: [^·]+\.$/)
    expect(all).toContain('Fury, Arms and Protection')
  })
})
