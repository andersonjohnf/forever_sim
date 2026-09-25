// The Enhancement shaman's rotation as a priority list (decision D31; docs/classes/shaman.md
// "Enhancement priority" and "The priority list"): the rows cover every setting, the list in its
// default order plays exactly as the rotation played before it, and the compiler follows the stored
// order, a moved row keeping its own conditions.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { JUJU_FLURRY as JUJU, MAJOR_MANA_POTION } from '../../effects/buffs'
import { ITEM_EFFECTS } from '../../effects/items'
import { normalizeConfig } from '../../config/normalize'
import { rotationPreset } from '../../index'
import { buildPlan } from '../../plan/build'
import { CUSTOM_APL_PRESET, DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder, storedAplOrder } from '../apl'
import { ENHANCEMENT_APL, ENHANCEMENT_IDS as ID, ENHANCEMENT_OPTIONS, enhancementRotation } from './enhancement'
import { enhancementCases, fingerprint, planJson } from './enhancement-apl-cases'

const SPEC = 'shaman-enhancement'
const TALENTS = talentRanksByName(TALENT_DATA.shaman, defaultConfig(SPEC).talents)
const EARTHSTRIKE = ITEM_EFFECTS[21180].use!
const CONTEXT = { race: 'horde-orc', maxMana: 6000, items: [EARTHSTRIKE], consumables: [JUJU, MAJOR_MANA_POTION] }
/** Maelstrom Weapon's aura is the plan's first. */
const auraIndex = (id: string) => (id === 'maelstromWeapon' ? 0 : -1)
type Rot = ReturnType<typeof enhancementRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const conditionsOf = (r: Rot, id: string) => r.rotation.filter((e) => r.abilities[e.ability].id === id).map((e) => e.conditions)
/** The default order with `id` moved to just before `before` (or last). */
const moved = (id: string, before?: string) => {
  const order = defaultAplOrder(ENHANCEMENT_APL)
  const to = before === undefined ? order.length - 1 : order.indexOf(before) - (order.indexOf(id) < order.indexOf(before) ? 1 : 0)
  return moveAplRow(ENHANCEMENT_APL, order, id, to)!
}

describe('the Enhancement shaman’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    const known = new Set(ENHANCEMENT_OPTIONS.map((o) => o.id))
    const placed = new Set([...ENHANCEMENT_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...ENHANCEMENT_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    for (const row of ENHANCEMENT_APL.rows) {
      if (row.enabledId) expect(ENHANCEMENT_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      else expect(row.help, row.id).toBeTruthy()
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    }
    expect(new Set(ENHANCEMENT_APL.rows.map((r) => r.id)).size).toBe(ENHANCEMENT_APL.rows.length)
    // Nothing is pinned: the imbue goes on before the pull, spec-wide, whatever the order.
    expect(ENHANCEMENT_APL.rows.filter((r) => r.pinned)).toEqual([])
    expect(ENHANCEMENT_APL.specWide).toContain(ID.imbue)
    // No named rotations: the implicit Default only (D27's common priority).
    expect(ENHANCEMENT_APL.presets).toEqual([])
  })

  it('gives 200 random setups the plan they had before the list, in the default order', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Enhancement plays.
    const plans = enhancementCases(ENHANCEMENT_OPTIONS, 200).map((config) => buildPlan({ ...config, rotationOrder: defaultAplOrder(ENHANCEMENT_APL) }).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover both imbues and Stormstrike on and off.
    const storm = plans.filter((p) => p.abilities.some((a) => a.id === 'stormstrike')).length
    expect(storm).toBeGreaterThan(40)
    expect(storm).toBeLessThan(190)
    const rockbiter = plans.filter((p) => p.abilities.some((a) => a.id.startsWith('rockbiter'))).length
    expect(rockbiter).toBeGreaterThan(20)
    expect(hashes).toMatchSnapshot()
  })

  it('gives the same list in the default order as with none, in shaman.md’s order', () => {
    const none = enhancementRotation({}, TALENTS, auraIndex, CONTEXT)
    expect(enhancementRotation({}, TALENTS, auraIndex, CONTEXT, defaultAplOrder(ENHANCEMENT_APL))).toEqual(none)
    // Rows 1–7, then the mana potion after the list.
    expect(ids(none)).toEqual(['bloodFury', 'rageOfTheFarseer', 'earthstrike', 'jujuFlurry', 'stormstrike', 'lightningBolt', 'earthShock', 'majorManaPotion'])
  })

  it('builds the rows in the stored order, each with its own conditions', () => {
    const none = enhancementRotation({}, TALENTS, auraIndex, CONTEXT)
    // The shock above Stormstrike, and Lightning Bolt first.
    let order = moved('shock', 'stormstrike')
    order = moveAplRow(ENHANCEMENT_APL, order, 'lightningBolt', 0)!
    const r = enhancementRotation({}, TALENTS, auraIndex, CONTEXT, order)
    expect(ids(r)).toEqual(['lightningBolt', 'bloodFury', 'rageOfTheFarseer', 'earthstrike', 'jujuFlurry', 'earthShock', 'stormstrike', 'majorManaPotion'])
    // Lightning Bolt still waits for 5 stacks and the shock for 10% mana; only their place moved.
    expect(conditionsOf(r, 'lightningBolt')).toEqual(conditionsOf(none, 'lightningBolt'))
    expect(conditionsOf(r, 'earthShock')).toEqual(conditionsOf(none, 'earthShock'))
    expect(conditionsOf(r, 'earthShock')).toEqual([[{ code: expect.any(Number), a: 6000, b: 0 }]])
    // Juju Flurry takes its turn with the on-use trinkets, wherever they sit.
    const last = enhancementRotation({}, TALENTS, auraIndex, CONTEXT, moved('trinkets'))
    expect(ids(last)).toEqual(['bloodFury', 'rageOfTheFarseer', 'stormstrike', 'lightningBolt', 'earthShock', 'earthstrike', 'jujuFlurry', 'majorManaPotion'])
    // The same abilities and pre-pull, only in another order.
    expect(new Set(r.abilities.map((a) => a.id))).toEqual(new Set(none.abilities.map((a) => a.id)))
    expect(r.onUse).toEqual(none.onUse)
    // A moved list is Custom; the default order is the Default preset.
    expect(rotationPreset({ spec: SPEC, talents: defaultConfig(SPEC).talents, rotation: {}, rotationOrder: order })).toBe(CUSTOM_APL_PRESET)
    expect(rotationPreset({ spec: SPEC, talents: defaultConfig(SPEC).talents, rotation: {} })).toBe(DEFAULT_APL_PRESET)
  })

  it('skips a row that’s turned off, wherever it sits', () => {
    const off = { [ID.stormstrike]: false, [ID.trinkets]: false, [ID.shock]: 'none' }
    const order = moved('stormstrike', 'racial')
    const r = enhancementRotation(off, TALENTS, auraIndex, CONTEXT, order)
    expect(ids(r)).toEqual(['bloodFury', 'rageOfTheFarseer', 'jujuFlurry', 'lightningBolt', 'majorManaPotion'])
    // The trinkets' row off leaves Juju Flurry, spec-wide, on; its own switch takes it out.
    expect(ids(enhancementRotation({ ...off, [ID.juju]: false }, TALENTS, auraIndex, CONTEXT, order))).not.toContain('jujuFlurry')
  })

  it('places rows a stored order leaves out, and ignores what it doesn’t know', () => {
    expect(normalizeAplOrder(ENHANCEMENT_APL, ['shock', 'stormstrike'])).toEqual(['racial', 'rageOfTheFarseer', 'trinkets', 'shock', 'stormstrike', 'lightningBolt'])
    // Unknown ids, repeats and non-strings are dropped; the rest keep their stored order.
    expect(normalizeAplOrder(ENHANCEMENT_APL, ['shock', 'bogus', 7, 'lightningBolt', 'shock'])).toEqual(['racial', 'rageOfTheFarseer', 'trinkets', 'stormstrike', 'shock', 'lightningBolt'])
    expect(normalizeAplOrder(ENHANCEMENT_APL, undefined)).toEqual(defaultAplOrder(ENHANCEMENT_APL))
    expect(storedAplOrder(ENHANCEMENT_APL, defaultAplOrder(ENHANCEMENT_APL))).toBeUndefined()
  })

  it('loads a setup saved before the list byte-identical, and one with an order as it was stored', () => {
    const before = { ...defaultConfig(SPEC), rotation: { [ID.shock]: 'frost', [ID.boltStacks]: 4, [ID.imbue]: 'rockbiter' } }
    const { config, warnings } = normalizeConfig(JSON.parse(JSON.stringify(before)))
    expect(warnings).toEqual([])
    expect(JSON.stringify(config)).toBe(JSON.stringify(before))
    expect(config.rotationOrder).toBeUndefined()
    expect(fingerprint(planJson(buildPlan(config).plan))).toBe(fingerprint(planJson(buildPlan({ ...before, rotationOrder: defaultAplOrder(ENHANCEMENT_APL) }).plan)))
    // A stored order survives a save and a load, and plays as stored.
    const order = moved('shock', 'stormstrike')
    const saved = normalizeConfig(JSON.parse(JSON.stringify({ ...before, rotationOrder: order }))).config
    expect(saved.rotationOrder).toEqual(order)
    const plan = buildPlan(saved).plan
    const shockAt = plan.rotation.findIndex((e) => plan.abilities[e.ability].id === 'frostShock')
    const stormAt = plan.rotation.findIndex((e) => plan.abilities[e.ability].id === 'stormstrike')
    expect(shockAt).toBeLessThan(stormAt)
  })
})
