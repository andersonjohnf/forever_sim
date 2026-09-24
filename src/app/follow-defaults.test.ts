import { describe, expect, it } from 'vitest'
import { changeRace } from '@/features/character/faction-gear'
import { raceChangeMessage } from '@/features/character/races'
import { defaultGearFor, slotsOffDefault } from '@/features/gear/default-set'
import { defaultConfig, defaultTalents, GEAR_SLOTS, normalizeConfig, preRaidListGear, type SimConfig, type SpecId } from '@/sim'
import { defaultsUpdateNotice, followDefaults, following, legacyFollowing, readFollowing, writtenV1Talents } from './follow-defaults'

// docs/architecture.md "Following the defaults"

const PROT_PALADIN: SpecId = 'paladin-protection'
/** v1's default Protection paladin talents: the popular build, 2/42/7, on 1.60.1.69913's trees (stored-builds.json). */
const V1_PALADIN_TALENTS = '2-4530513321301551-502'

/** A loaded setup: normalized, as the store holds it. */
const setup = (spec: SpecId, patch: Partial<SimConfig> = {}): SimConfig => normalizeConfig({ ...defaultConfig(spec, patch.race), ...patch }).config
/** v1's default gear, the pre-raid lists alone. */
const v1Gear = (spec: SpecId, race?: string) => normalizeConfig({ ...defaultConfig(spec, race), gear: preRaidListGear(spec, race) }).config.gear
/**
 * What a load does to a save from before `following`: a setup of version 1, whose talents are on
 * 1.60.1.69913's trees, normalized (which maps them onto today's), then its parts that held a
 * default then moved to today's.
 */
const migrate = (saved: SimConfig) => {
  const raw = { ...saved, version: 1 }
  const config = normalizeConfig(raw).config
  return followDefaults(config, legacyFollowing(config, writtenV1Talents(raw)))
}

describe('following the defaults', () => {
  it('follows every part of an untouched setup, and nothing moves', () => {
    const config = setup('warrior-fury')
    expect(following(config)).toEqual({ gear: GEAR_SLOTS, talents: true })
    expect(followDefaults(config, following(config))).toEqual({ config, gear: false, talents: false, blocked: [] })
  })

  it('leaves out the slots and talents the player set', () => {
    const d = setup('warrior-fury')
    const config = { ...d, talents: '30305013-050520035150310051-', gear: { ...d.gear, head: { itemId: 16731 } } }
    const follow = following(config)
    expect(follow.talents).toBe(false)
    expect(follow.gear).not.toContain('head')
    expect(follow.gear).toHaveLength(GEAR_SLOTS.length - 1)
  })

  it('reads a save’s list back, dropping what isn’t one', () => {
    expect(readFollowing({ 'warrior-fury': { gear: ['head', 'nope', 3], talents: false } })).toEqual({ 'warrior-fury': { gear: ['head'], talents: false } })
    expect(readFollowing({ 'warrior-fury': { gear: 'head', talents: true }, 'mage-spellblade': { gear: [], talents: true } })).toEqual({})
    expect(readFollowing(null)).toEqual({})
    expect(readFollowing([])).toEqual({})
  })
})

describe('a save from before `following` (the migration)', () => {
  it('moves an untouched v1 Protection paladin to today’s threat set and talents', () => {
    const old = setup(PROT_PALADIN, { gear: v1Gear(PROT_PALADIN), talents: V1_PALADIN_TALENTS })
    expect(slotsOffDefault(old).length).toBeGreaterThan(5)
    const moved = migrate(old)
    expect(moved.gear).toBe(true)
    expect(moved.talents).toBe(true)
    expect(moved.config.gear).toEqual(defaultGearFor(PROT_PALADIN, 'alliance-human'))
    expect(moved.config.talents).toBe(defaultTalents(PROT_PALADIN))
    // Everything else stays as it was.
    expect({ ...moved.config, gear: old.gear, talents: old.talents }).toEqual(old)
  })

  it('recognises the former interim talents and the former unenchanted pieces', () => {
    const d = setup(PROT_PALADIN)
    const gear = { ...d.gear, head: { itemId: 12640 }, legs: { itemId: 23273 }, mainHand: { itemId: 871 } }
    const moved = migrate({ ...d, gear, talents: '2-4530013321301551-50205' })
    expect(moved.config.gear).toEqual(d.gear)
    expect(moved.config.talents).toBe(d.talents)
  })

  it('keeps a slot the player changed, and talents that were never a default', () => {
    const own = { itemId: 16731, enchantId: 'arcanumFocus' } // Helm of Valor
    const talents = '-0530513321301551-5021' // not a default, ever: one point short of the former default
    const old = setup(PROT_PALADIN, { gear: { ...v1Gear(PROT_PALADIN), head: own }, talents })
    expect(old.talents).toBe(talents)
    const moved = migrate(old)
    expect(moved.config.gear.head).toEqual(own)
    expect(moved.config.talents).toBe(talents)
    expect(moved.talents).toBe(false)
    expect(slotsOffDefault(moved.config)).toEqual(['head'])
  })

  it('treats a default item with an enchant the player changed as theirs', () => {
    const d = setup(PROT_PALADIN)
    const gear = { ...v1Gear(PROT_PALADIN), chest: { itemId: 14624, enchantId: 'chestMajorStamina' } }
    const moved = migrate({ ...d, gear })
    expect(moved.config.gear.chest).toEqual({ itemId: 14624, enchantId: 'chestMajorStamina' })
    expect(slotsOffDefault(moved.config)).toEqual(['chest'])
  })

  it('mixes: v1 picks move, today’s stay, the player’s own stay, emptied slots stay empty', () => {
    const d = setup('warrior-protection')
    const v1 = v1Gear('warrior-protection')
    const gear: SimConfig['gear'] = {
      ...d.gear,
      neck: v1.neck, // v1's pick → today's
      back: v1.back,
      wrist: { itemId: 18445, enchantId: 'bracerSuperiorStrength' }, // the player's
    }
    delete gear.ranged // the player took the ranged weapon off
    const moved = migrate({ ...d, gear, talents: '05-05-552001233201210531' })
    expect(moved.config.gear.neck).toEqual(d.gear.neck)
    expect(moved.config.gear.back).toEqual(d.gear.back)
    expect(moved.config.gear.wrist).toEqual({ itemId: 18445, enchantId: 'bracerSuperiorStrength' })
    expect(moved.config.gear.ranged).toBeUndefined()
    expect(moved.config.talents).toBe(defaultTalents('warrior-protection'))
    expect(slotsOffDefault(moved.config)).toEqual(['wrist', 'ranged'])
  })

  it('follows the race’s own defaults: a Horde paladin’s former pieces become its threat set', () => {
    // Saved as a Horde (Undead) paladin after a race change kept the Alliance-only Lamellar shoulders,
    // and with an older version's Horde feet.
    const d = setup(PROT_PALADIN, { race: 'horde-undead' })
    const gear = { ...d.gear, shoulder: { itemId: 23277 }, feet: { itemId: 272718, enchantId: 'bootsGreaterAgility' } }
    const moved = migrate({ ...d, gear })
    expect(moved.config.gear).toEqual(defaultGearFor(PROT_PALADIN, 'horde-undead'))
    expect(moved.config.gear.shoulder).toEqual({ itemId: 274233 })
  })

  it('recognises a race change’s twin of a v1 pick', () => {
    // v1's Protection warrior shoulders are Alliance's (Lieutenant Commander's Plate Shoulders); an
    // Orc took their Horde twin, Champion's Plate Shoulders.
    const d = setup('warrior-protection', { race: 'horde-orc' })
    expect(v1Gear('warrior-protection').shoulder).toEqual({ itemId: 23315 })
    const moved = migrate({ ...d, gear: { ...d.gear, shoulder: { itemId: 23243 } } })
    expect(moved.config.gear.shoulder).toEqual(defaultGearFor('warrior-protection', 'horde-orc').shoulder)
  })

  it('never lets a default displace the player’s own item (a Unique rule)', () => {
    // The player wears today's default first trinket in the second slot; the first slot held v1's pick.
    const d = setup('warrior-protection')
    const v1 = v1Gear('warrior-protection')
    const moved = migrate({ ...d, gear: { ...d.gear, trinket1: v1.trinket1, trinket2: d.gear.trinket1 } })
    expect(moved.config.gear.trinket2).toEqual(d.gear.trinket1)
    // Its own slot can't take the same unique item, so it keeps what it had, and still follows the default.
    expect(moved.config.gear.trinket1).toEqual(v1.trinket1)
    expect(moved.blocked).toEqual(['trinket1'])
  })
})

describe('a race change', () => {
  it('moves the default pieces to the new race’s default set, and back', () => {
    const human = setup(PROT_PALADIN)
    const change = changeRace(human, 'horde-undead')
    expect(change.config.gear).toEqual(defaultGearFor(PROT_PALADIN, 'horde-undead'))
    expect(change.kept).toEqual([])
    expect(change.defaulted.map((d) => d.slot)).toEqual(['shoulder', 'chest', 'legs', 'feet'])
    expect(raceChangeMessage(change, 'Horde')).toEqual({
      title: 'Swapped 4 items for Horde gear',
      description: 'Premier Scaled Shoulders, Plate of the Shaman King, Premier Scaled Leggings and Premier Scaled Sabatons, from the Horde threat set.',
    })
    expect(changeRace(change.config, 'alliance-human').config.gear).toEqual(human.gear)
  })

  it('leaves the player’s own pieces to the twin rules', () => {
    const human = setup(PROT_PALADIN)
    // Stockade Pauldrons, neutral: the player's, so it stays.
    const own = { ...human, gear: { ...human.gear, shoulder: { itemId: 14552 } } }
    const change = changeRace(own, 'horde-undead')
    expect(change.config.gear.shoulder).toEqual({ itemId: 14552 })
    expect(change.defaulted.map((d) => d.slot)).toEqual(['chest', 'legs', 'feet'])
  })
})

describe('the notice', () => {
  it('names the spec and what moved, the current spec first', () => {
    expect(defaultsUpdateNotice([{ spec: PROT_PALADIN, gear: true, talents: true }], PROT_PALADIN)).toEqual({
      title: 'Updated to the new default gear and talents for Protection Paladin',
      description: 'Gear and talents you changed yourself are kept.',
    })
    const two = [
      { spec: 'warrior-protection' as const, gear: true, talents: false },
      { spec: PROT_PALADIN, gear: true, talents: false },
    ]
    expect(defaultsUpdateNotice(two, PROT_PALADIN)?.title).toBe('Updated to the new default gear for Protection Paladin and Protection Warrior')
    const three = [...two, { spec: 'druid-feral-bear' as const, gear: false, talents: true }]
    expect(defaultsUpdateNotice(three, 'warrior-fury')?.title).toBe('Updated to the new default gear and talents for Protection Warrior and 2 other specs')
    expect(defaultsUpdateNotice([], PROT_PALADIN)).toBeNull()
  })

  it('says what the player’s own talent build lost on the game’s new trees, after what moved or on its own', () => {
    const ret = { spec: 'paladin-retribution' as const, gear: false, talents: false, refunds: [{ name: 'Crusade', points: 2, reason: 'removed from the game' }] }
    const refund = 'The game’s new talent trees refunded 2 of your Retribution Paladin talent points: 2 in Crusade (removed from the game).'
    expect(defaultsUpdateNotice([ret], PROT_PALADIN)).toEqual({ title: 'Talent points refunded for Retribution Paladin', description: refund })
    expect(defaultsUpdateNotice([{ spec: PROT_PALADIN, gear: true, talents: false }, ret], 'paladin-retribution')).toEqual({
      title: 'Updated to the new default gear for Protection Paladin',
      description: `Gear and talents you changed yourself are kept. ${refund}`,
    })
  })
})

describe('a player’s own talents on the game’s new trees (docs/data/talents.md#tree-versions)', () => {
  it('a save from before `following` keeps the player’s build, mapped by name, with what it lost', () => {
    // Improved Holy Strike 2 and one point short of the popular build's Iron Creed: never a default.
    const raw = { ...setup(PROT_PALADIN), version: 1, talents: '2-4530513321301541-502' }
    const { config, talentRefunds } = normalizeConfig(raw)
    expect(config.talents).toBe('-4530513321301541-502')
    expect(talentRefunds).toEqual([{ name: 'Improved Holy Strike', points: 2, reason: 'removed from the game' }])
    const moved = followDefaults(config, legacyFollowing(config, writtenV1Talents(raw)))
    expect(moved.talents).toBe(false)
    expect(moved.config.talents).toBe('-4530513321301541-502')
  })

  it('reads only a version-1 save’s code as written on the old trees', () => {
    expect(writtenV1Talents({ version: 1, talents: 'x' })).toBe('x')
    expect(writtenV1Talents({ talents: 'x' })).toBe('x')
    expect(writtenV1Talents({ version: 2, talents: 'x' })).toBeUndefined()
    expect(writtenV1Talents({ version: 1, talents: 3 })).toBeUndefined()
    expect(writtenV1Talents(null)).toBeUndefined()
  })
})
