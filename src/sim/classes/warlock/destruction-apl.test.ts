// The Destruction warlock's rotation as a priority list (decision D31; docs/classes/warlock.md §6.4
// "The priority list"):the rows cover every setting, the default order plays exactly as Destruction
// played before the list, and the compiler follows the stored order with each row's own conditions.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { normalizeConfig } from '../../config/normalize'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { MAJOR_MANA_POTION, POWER_INFUSION } from '../../effects/buffs'
import { buildPlan } from '../../plan/build'
import { COND } from '../../plan/types'
import { defaultAplOrder, moveAplRow, normalizeAplOrder } from '../apl'
import { rotationApl } from '../rotation'
import { fingerprint, planJson } from './apl-cases'
import { destructionCases } from './destruction-apl-cases'
import { DESTRUCTION_APL, DESTRUCTION_IDS as ID, DESTRUCTION_OPTIONS, destructionRotation } from './destruction'

const TALENTS = talentRanksByName(TALENT_DATA.warlock, defaultConfig('warlock-destruction').talents)
const CONTEXT = { consumables: [POWER_INFUSION, MAJOR_MANA_POTION], race: 'horde-orc', maxMana: 6000 }
const noAura = () => -1
type Rot = ReturnType<typeof destructionRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
/** Each line's conditions, with an ability they name by its id, so two lists compare line for line. */
const lines = (r: Rot) =>
  Object.fromEntries(
    r.rotation.map((e, i) => [
      `${r.abilities[e.ability].id}#${r.rotation.slice(0, i).filter((x) => x.ability === e.ability).length}`,
      e.conditions.map((c) => ({ ...c, a: NAMES_ABILITY.includes(c.code) ? r.abilities[c.a].id : c.a })),
    ]),
  )
/** Condition codes whose `a` is an ability's index. */
const NAMES_ABILITY: number[] = [COND.cooldownAtLeast, COND.abilityAuraUp, COND.abilityAuraRefresh, COND.abilityAuraDown, COND.abilityAuraStacksBelow]
const DEFAULT = defaultAplOrder(DESTRUCTION_APL)
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string, from = DEFAULT) => moveAplRow(DESTRUCTION_APL, from, id, from.indexOf(before) - (from.indexOf(id) < from.indexOf(before) ? 1 : 0))!

describe('the Destruction warlock’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    expect(rotationApl('warlock-destruction')).toBe(DESTRUCTION_APL)
    const known = new Set(DESTRUCTION_OPTIONS.map((o) => o.id))
    const placed = new Set([...DESTRUCTION_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...DESTRUCTION_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    for (const row of DESTRUCTION_APL.rows) {
      if (row.enabledId) expect(DESTRUCTION_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    }
    expect(new Set(DEFAULT).size).toBe(DEFAULT.length)
    // warlock.md §6.1's order; nothing is pinned (the pre-pull is the sacrifice, spec-wide).
    expect(DEFAULT).toEqual(['racial', 'trinkets', 'powerInfusion', 'curse', 'immolate', 'conflagrate', 'shadowburn', 'corruption', 'bane', 'lifeTap', 'filler'])
    expect(DESTRUCTION_APL.rows.filter((r) => r.pinned)).toEqual([])
    expect(DESTRUCTION_APL.specWide).toEqual([ID.sacrifice, ID.manaPotion, ID.manaPotionMissing, ID.rune, ID.runeMissing])
    expect(DESTRUCTION_APL.presets).toEqual([])
  })

  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Destruction plays.
    const plans = destructionCases(DESTRUCTION_OPTIONS, 200).map((config) => buildPlan({ ...config, rotationOrder: DEFAULT }).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    // They cover Conflagrate on and off.
    const using = plans.filter((p) => p.abilities.some((a) => a.id === 'conflagrate')).length
    expect(using).toBeGreaterThan(40)
    expect(using).toBeLessThan(160)
    expect(hashes).toMatchSnapshot()
  })

  it('loads a setup saved before the list, with no order, byte-identical', () => {
    const config = defaultConfig('warlock-destruction')
    const { config: loaded } = normalizeConfig(JSON.parse(JSON.stringify(config)))
    expect(loaded.rotationOrder).toBeUndefined()
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(config))
    expect(planJson(buildPlan(loaded).plan)).toBe(planJson(buildPlan({ ...config, rotationOrder: DEFAULT }).plan))
  })

  it('gives the same list in the default order as with none', () => {
    const none = destructionRotation({}, TALENTS, noAura, CONTEXT)
    expect(destructionRotation({}, TALENTS, noAura, CONTEXT, DEFAULT)).toEqual(none)
    // The racial, Power Infusion and the potion with it, the curse, Immolate, Conflagrate, Shadowburn,
    // Corruption, Doom then Agony, Life Tap at 5%, Incinerate, and Life Tap after the list.
    expect(ids(none)).toEqual([
      'bloodFury',
      'powerInfusion',
      'majorManaPotion',
      'curseOfTheElements',
      'immolate',
      'conflagrate',
      'shadowburn',
      'corruption',
      'baneOfDoom',
      'baneOfAgony',
      'lifeTap',
      'incinerate',
      'lifeTap',
    ])
  })

  it('builds the list in the stored order, each row keeping its own conditions', () => {
    const none = destructionRotation({}, TALENTS, noAura, CONTEXT)
    // Corruption and the Bane above Immolate, and the filler above Life Tap at 5%.
    let order = moved('corruption', 'immolate')
    order = moved('bane', 'immolate', order)
    order = moved('filler', 'lifeTap', order)
    const r = destructionRotation({}, TALENTS, noAura, CONTEXT, order)
    expect(ids(r)).toEqual([
      'bloodFury',
      'powerInfusion',
      'majorManaPotion',
      'curseOfTheElements',
      'corruption',
      'baneOfDoom',
      'baneOfAgony',
      'immolate',
      'conflagrate',
      'shadowburn',
      'incinerate',
      'lifeTap',
      'lifeTap',
    ])
    // Every line keeps its conditions: Agony still waits for the last Doom, read by its id.
    expect(lines(r)).toEqual(lines(none))
    expect(lines(r)['baneOfAgony#0']).toContainEqual(expect.objectContaining({ a: 'baneOfDoom' }))
    // The potion takes its turn with Power Infusion's row wherever it sits, and both are still pressed.
    const piLast = destructionRotation({}, TALENTS, noAura, CONTEXT, moved('powerInfusion', 'filler'))
    expect(ids(piLast).slice(-5)).toEqual(['lifeTap', 'powerInfusion', 'majorManaPotion', 'incinerate', 'lifeTap'])
    expect(piLast.onUse).toEqual(none.onUse)
    // The pre-pull is the same.
    expect(r.prepull.casts.map((c) => [r.abilities[c.ability].id, c.atMs])).toEqual(none.prepull.casts.map((c) => [none.abilities[c.ability].id, c.atMs]))
  })

  it('skips a row that’s off, wherever it sits, and Conflagrate with Immolate’s row off', () => {
    const order = moved('shadowburn', 'curse')
    expect(ids(destructionRotation({}, TALENTS, noAura, CONTEXT, order))).toContain('shadowburn')
    expect(ids(destructionRotation({ [ID.shadowburn]: false }, TALENTS, noAura, CONTEXT, order))).not.toContain('shadowburn')
    const noImmolate = destructionRotation({ [ID.immolate]: false }, TALENTS, noAura, CONTEXT, moved('conflagrate', 'curse'))
    expect(ids(noImmolate)).not.toContain('immolate')
    expect(ids(noImmolate)).not.toContain('conflagrate')
  })

  it('places a row a stored order leaves out between its default neighbours', () => {
    // An order edited by hand without Shadowburn: it goes back after Conflagrate.
    expect(normalizeAplOrder(DESTRUCTION_APL, DEFAULT.filter((id) => id !== 'shadowburn'))).toEqual(DEFAULT)
    // With Conflagrate moved first, Shadowburn follows it and the rows after it that come before
    // Shadowburn by default, so it lands after Immolate, before Corruption.
    const conflagFirst = ['conflagrate', ...DEFAULT.filter((id) => id !== 'conflagrate' && id !== 'shadowburn')]
    expect(normalizeAplOrder(DESTRUCTION_APL, conflagFirst)).toEqual(['conflagrate', 'racial', 'trinkets', 'powerInfusion', 'curse', 'immolate', 'shadowburn', 'corruption', 'bane', 'lifeTap', 'filler'])
    // With the filler moved first, a missing Life Tap goes after the Bane.
    expect(normalizeAplOrder(DESTRUCTION_APL, ['filler', ...DEFAULT.filter((id) => id !== 'filler' && id !== 'lifeTap')]).slice(-2)).toEqual(['bane', 'lifeTap'])
    // Unknown ids and repeats are dropped, and the rest go round the one it names in their default places.
    expect(normalizeAplOrder(DESTRUCTION_APL, ['filler', 'nope', 'filler', 7])).toEqual(DEFAULT)
    expect(normalizeAplOrder(DESTRUCTION_APL, ['filler', 'racial'])).toEqual(['filler', 'racial', ...DEFAULT.slice(1, -1)])
  })

  it('builds the same plan with the default order stored as with none, and another reordered', () => {
    const config = defaultConfig('warlock-destruction')
    const none = buildPlan(config).plan
    expect(buildPlan({ ...config, rotationOrder: DEFAULT }).plan).toEqual(none)
    const fillerFirst = buildPlan({ ...config, rotationOrder: moved('filler', 'racial') }).plan
    expect(fingerprint(planJson(fillerFirst))).not.toBe(fingerprint(planJson(none)))
  })
})
