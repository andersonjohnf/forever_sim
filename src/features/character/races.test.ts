import { describe, expect, it } from 'vitest'
import { defaultConfig, type SimConfig } from '@/sim'
import { changeRace } from './faction-gear'
import { raceChangeMessage, raceSimulatable } from './races'

describe('races the sim can simulate', () => {
  it('knows every warrior race’s base stats except the Skyborne (character-stats OQ-1)', () => {
    expect(raceSimulatable('warrior-fury', 'alliance-human')).toBe(true)
    expect(raceSimulatable('warrior-arms', 'horde-tauren')).toBe(true)
    expect(raceSimulatable('warrior-fury', 'alliance-skyborne-high-order')).toBe(false)
    expect(raceSimulatable('warrior-arms', 'horde-skyborne-windshaper')).toBe(false)
  })
})

describe('the race-change toast', () => {
  const human = defaultConfig('warrior-fury', 'alliance-human')

  it('names the swapped items', () => {
    const message = raceChangeMessage(changeRace(human, 'horde-orc'), 'Horde')!
    expect(message.title).toMatch(/^Swapped \d+ items for their Horde versions$/)
    expect(message.description).toMatch(/Champion's Plate Shoulders.*, with the same stats\.$/)
  })

  it('says how a piece’s set bonus differs: none, gained, or another set (GV-1, FU-7)', () => {
    const rogue = defaultConfig('rogue-combat', 'horde-orc')
    const helm: SimConfig = { ...rogue, gear: { ...rogue.gear, head: { itemId: 23257 } } }
    const toAlliance = changeRace(helm, 'alliance-human')
    // The Horde's Rank 7 to 10 leather is in no item set in Forever's rows; the Alliance's is.
    expect(raceChangeMessage(toAlliance, 'Alliance')!.description).toContain("Lieutenant Commander's Leather Helm, with the same stats, now with a set bonus.")
    // And back.
    expect(raceChangeMessage(changeRace(toAlliance.config, 'horde-orc'), 'Horde')!.description).toContain(
      "Champion's Leather Helm, with the same stats but no set bonus.",
    )
    // Highlander's Mail Pauldrons' 3-piece is spell crit where the Defilers' is melee crit.
    const shaman = defaultConfig('shaman-enhancement', 'horde-orc')
    const pauldrons: SimConfig = { ...shaman, gear: { ...shaman.gear, shoulder: { itemId: 20203 } } }
    expect(raceChangeMessage(changeRace(pauldrons, 'alliance-dwarf'), 'Alliance')!.description).toContain(
      "Highlander's Mail Pauldrons, with the same stats but in another set.",
    )
  })

  it('says which items stayed, and says nothing within a faction', () => {
    const cape: SimConfig = { ...human, gear: { back: { itemId: 16337 } } }
    expect(raceChangeMessage(changeRace(cape, 'horde-orc'), 'Horde')).toEqual({
      title: 'Your gear includes items a Horde character can’t wear',
      description: "Kept Sergeant Major's Cape: it has no Horde version, so pick a replacement under Gear.",
    })
    expect(raceChangeMessage(changeRace(human, 'alliance-gnome'), 'Alliance')).toBeNull()
  })
})
