// The Affliction warlock's rotation as a priority list (decision D31; docs/classes/warlock.md §6.4
// "The priority list"): the rows cover every setting, the default order plays exactly as Affliction
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
import { SHADOW_TRANCE } from './abilities'
import { AFFLICTION_APL, AFFLICTION_IDS as ID, AFFLICTION_OPTIONS, afflictionRotation } from './affliction'
import { afflictionCases } from './affliction-apl-cases'
import { fingerprint, planJson } from './apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.warlock, defaultConfig('warlock-affliction').talents)
const CONTEXT = { consumables: [POWER_INFUSION, MAJOR_MANA_POTION], race: 'horde-orc', maxMana: 6000 }
/** Shadow Trance in the plan, as Nightfall puts it there. */
const trance = (id: string) => (id === SHADOW_TRANCE.id ? 0 : -1)
type Rot = ReturnType<typeof afflictionRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
/** Condition codes whose `a` is an ability's index. */
const NAMES_ABILITY: number[] = [COND.cooldownAtLeast, COND.abilityAuraUp, COND.abilityAuraRefresh, COND.abilityAuraDown, COND.abilityAuraStacksBelow]
/** Each line's conditions, with an ability they name by its id, so two lists compare line for line. */
const lines = (r: Rot) =>
  Object.fromEntries(
    r.rotation.map((e, i) => [
      `${r.abilities[e.ability].id}#${r.rotation.slice(0, i).filter((x) => x.ability === e.ability).length}`,
      e.conditions.map((c) => ({ ...c, a: NAMES_ABILITY.includes(c.code) ? r.abilities[c.a].id : c.a })),
    ]),
  )
const DEFAULT = defaultAplOrder(AFFLICTION_APL)
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string, from = DEFAULT) => moveAplRow(AFFLICTION_APL, from, id, from.indexOf(before) - (from.indexOf(id) < from.indexOf(before) ? 1 : 0))!

describe('the Affliction warlock’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    expect(rotationApl('warlock-affliction')).toBe(AFFLICTION_APL)
    const known = new Set(AFFLICTION_OPTIONS.map((o) => o.id))
    const placed = new Set([...AFFLICTION_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...AFFLICTION_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    for (const row of AFFLICTION_APL.rows) {
      if (row.enabledId) expect(AFFLICTION_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    }
    expect(new Set(DEFAULT).size).toBe(DEFAULT.length)
    // warlock.md §6.2's order; nothing is pinned (the pre-pull is the sacrifice, spec-wide).
    expect(DEFAULT).toEqual(['racial', 'trinkets', 'powerInfusion', 'curse', 'corruption', 'bane', 'siphonLife', 'shadowTrance', 'lifeTap', 'filler'])
    expect(AFFLICTION_APL.rows.filter((r) => r.pinned)).toEqual([])
    expect(AFFLICTION_APL.specWide).toEqual([ID.sacrifice, ID.manaPotion, ID.manaPotionMissing, ID.rune, ID.runeMissing])
    expect(AFFLICTION_APL.presets).toEqual([])
  })

  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Affliction plays. They're built in the default order.
    const plans = afflictionCases(AFFLICTION_OPTIONS, 200).map((config) => buildPlan({ ...config, rotationOrder: DEFAULT }).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    // They cover Siphon Life on and off.
    const using = plans.filter((p) => p.abilities.some((a) => a.id === 'siphonLife')).length
    expect(using).toBeGreaterThan(40)
    expect(using).toBeLessThan(160)
    expect(hashes).toMatchSnapshot()
  })

  it('loads a setup saved before the list, with no order, byte-identical', () => {
    const config = defaultConfig('warlock-affliction')
    const { config: loaded } = normalizeConfig(JSON.parse(JSON.stringify(config)))
    expect(loaded.rotationOrder).toBeUndefined()
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(config))
    expect(planJson(buildPlan(loaded).plan)).toBe(planJson(buildPlan({ ...config, rotationOrder: DEFAULT }).plan))
  })

  it('gives the same list in the default order as with none', () => {
    const none = afflictionRotation({}, TALENTS, trance, CONTEXT)
    expect(afflictionRotation({}, TALENTS, trance, CONTEXT, DEFAULT)).toEqual(none)
    // The racial, Power Infusion and the potion with it, the curse, Corruption, Doom then Agony, Siphon
    // Life, Shadow Bolt on Shadow Trance, Life Tap at 10%, Shadow Bolt, and Life Tap after the list.
    expect(ids(none)).toEqual([
      'bloodFury',
      'powerInfusion',
      'majorManaPotion',
      'curseOfTheElements',
      'corruption',
      'baneOfDoom',
      'baneOfAgony',
      'siphonLife',
      'shadowBolt',
      'lifeTap',
      'shadowBolt',
      'lifeTap',
    ])
  })

  it('builds the list in the stored order, each row keeping its own conditions', () => {
    const none = afflictionRotation({}, TALENTS, trance, CONTEXT)
    // Shadow Trance's Shadow Bolt first on the global cooldown, and Siphon Life above Corruption.
    let order = moved('shadowTrance', 'curse')
    order = moved('siphonLife', 'corruption', order)
    const r = afflictionRotation({}, TALENTS, trance, CONTEXT, order)
    expect(ids(r)).toEqual([
      'bloodFury',
      'powerInfusion',
      'majorManaPotion',
      'shadowBolt',
      'curseOfTheElements',
      'siphonLife',
      'corruption',
      'baneOfDoom',
      'baneOfAgony',
      'lifeTap',
      'shadowBolt',
      'lifeTap',
    ])
    // Every line keeps its conditions: the instant Shadow Bolt still waits for Shadow Trance.
    expect(lines(r)).toEqual(lines(none))
    expect(lines(r)['shadowBolt#0']).toEqual([{ code: COND.auraUp, a: 0, b: 0 }])
    expect(r.prepull.casts.map((c) => [r.abilities[c.ability].id, c.atMs])).toEqual(none.prepull.casts.map((c) => [none.abilities[c.ability].id, c.atMs]))
  })

  it('skips a row that’s off wherever it sits, and Shadow Trance’s without Nightfall', () => {
    const order = moved('siphonLife', 'curse')
    expect(ids(afflictionRotation({}, TALENTS, trance, CONTEXT, order))).toContain('siphonLife')
    expect(ids(afflictionRotation({ [ID.siphonLife]: false }, TALENTS, trance, CONTEXT, order))).not.toContain('siphonLife')
    // No Shadow Trance in the plan (no Nightfall): its row casts nothing, wherever it sits.
    const noTrance = afflictionRotation({}, TALENTS, () => -1, CONTEXT, moved('shadowTrance', 'curse'))
    expect(ids(noTrance).filter((id) => id === 'shadowBolt')).toHaveLength(1)
  })

  it('places a row a stored order leaves out between its default neighbours', () => {
    expect(normalizeAplOrder(AFFLICTION_APL, DEFAULT.filter((id) => id !== 'shadowTrance'))).toEqual(DEFAULT)
    // With the filler moved first, a missing Shadow Trance row goes after Siphon Life.
    const fillerFirst = ['filler', ...DEFAULT.filter((id) => id !== 'filler' && id !== 'shadowTrance')]
    expect(normalizeAplOrder(AFFLICTION_APL, fillerFirst)).toEqual(['filler', 'racial', 'trinkets', 'powerInfusion', 'curse', 'corruption', 'bane', 'siphonLife', 'shadowTrance', 'lifeTap'])
  })

  it('builds the same plan with the default order stored as with none, and another reordered', () => {
    const config = defaultConfig('warlock-affliction')
    const none = buildPlan(config).plan
    expect(buildPlan({ ...config, rotationOrder: DEFAULT }).plan).toEqual(none)
    const fillerFirst = buildPlan({ ...config, rotationOrder: moved('filler', 'racial') }).plan
    expect(fingerprint(planJson(fillerFirst))).not.toBe(fingerprint(planJson(none)))
  })
})
