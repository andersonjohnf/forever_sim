// The Demonology warlock's rotation as a priority list (decision D31; docs/classes/warlock.md §6.4
// "The priority list", §11.5): the rows cover every setting, the default order plays exactly as
// Demonology played before the list, and the compiler follows the stored order with each row's own
// conditions; the demon and its passives before the pull don't move.
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
import { DEMONOLOGY_APL, DEMONOLOGY_IDS as ID, DEMONOLOGY_OPTIONS, demonologyRotation, demonologyUnusedSettings } from './demonology'
import { demonologyCases } from './demonology-apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.warlock, defaultConfig('warlock-demonology').talents)
const CONTEXT = { consumables: [POWER_INFUSION, MAJOR_MANA_POTION], race: 'horde-orc', maxMana: 6000 }
const noAura = () => -1
type Rot = ReturnType<typeof demonologyRotation>
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
const DEFAULT = defaultAplOrder(DEMONOLOGY_APL)
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string, from = DEFAULT) => moveAplRow(DEMONOLOGY_APL, from, id, from.indexOf(before) - (from.indexOf(id) < from.indexOf(before) ? 1 : 0))!

describe('the Demonology warlock’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    expect(rotationApl('warlock-demonology')).toBe(DEMONOLOGY_APL)
    const known = new Set(DEMONOLOGY_OPTIONS.map((o) => o.id))
    const placed = new Set([...DEMONOLOGY_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...DEMONOLOGY_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    for (const row of DEMONOLOGY_APL.rows) {
      if (row.enabledId) expect(DEMONOLOGY_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    }
    expect(new Set(DEFAULT).size).toBe(DEFAULT.length)
    // warlock.md §11.5's order; nothing is pinned (the pre-pull is the sacrifice and the demon, spec-wide).
    expect(DEFAULT).toEqual(['racial', 'trinkets', 'powerInfusion', 'searingPain', 'curse', 'immolate', 'corruption', 'bane', 'soulFire', 'lifeTap', 'filler'])
    expect(DEMONOLOGY_APL.rows.filter((r) => r.pinned)).toEqual([])
    expect(DEMONOLOGY_APL.specWide).toEqual([ID.sacrifice, ID.demon, ID.manaPotion, ID.manaPotionMissing, ID.rune, ID.runeMissing])
    expect(DEMONOLOGY_APL.presets).toEqual([])
  })

  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Demonology plays. They're built in the default order.
    const plans = demonologyCases(DEMONOLOGY_OPTIONS, 200).map((config) => buildPlan({ ...config, rotationOrder: DEFAULT }).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    // They cover Soul Fire on and off.
    const using = plans.filter((p) => p.abilities.some((a) => a.id === 'soulFire')).length
    expect(using).toBeGreaterThan(40)
    expect(using).toBeLessThan(160)
    expect(hashes).toMatchSnapshot()
  })

  it('loads a setup saved before the list, with no order, byte-identical', () => {
    const config = defaultConfig('warlock-demonology')
    const { config: loaded } = normalizeConfig(JSON.parse(JSON.stringify(config)))
    expect(loaded.rotationOrder).toBeUndefined()
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(config))
    expect(planJson(buildPlan(loaded).plan)).toBe(planJson(buildPlan({ ...config, rotationOrder: DEFAULT }).plan))
  })

  it('gives the same list in the default order as with none', () => {
    const none = demonologyRotation({}, TALENTS, noAura, CONTEXT)
    expect(demonologyRotation({}, TALENTS, noAura, CONTEXT, DEFAULT)).toEqual(none)
    // The racial, Power Infusion and the potion with it, the curse, Immolate, Corruption, Doom then
    // Agony, Soul Fire below 35%, Life Tap at 10%, Shadow Bolt, and Life Tap after the list.
    expect(ids(none)).toEqual([
      'bloodFury',
      'powerInfusion',
      'majorManaPotion',
      'curseOfTheElements',
      'immolate',
      'corruption',
      'baneOfDoom',
      'baneOfAgony',
      'soulFire',
      'lifeTap',
      'shadowBolt',
      'lifeTap',
    ])
    expect(none.pet?.id).toBe('imp')
  })

  it('builds the list in the stored order, each row keeping its own conditions', () => {
    const none = demonologyRotation({}, TALENTS, noAura, CONTEXT)
    // Soul Fire first on the global cooldown, and Immolate below the Bane.
    let order = moved('soulFire', 'curse')
    order = moved('immolate', 'lifeTap', order)
    const r = demonologyRotation({}, TALENTS, noAura, CONTEXT, order)
    expect(ids(r)).toEqual([
      'bloodFury',
      'powerInfusion',
      'majorManaPotion',
      'soulFire',
      'curseOfTheElements',
      'corruption',
      'baneOfDoom',
      'baneOfAgony',
      'immolate',
      'lifeTap',
      'shadowBolt',
      'lifeTap',
    ])
    // Every line keeps its conditions: Soul Fire still waits for 35% health.
    expect(lines(r)).toEqual(lines(none))
    expect(lines(r)['soulFire#0'][0].code).toBe(COND.healthAtMost)
    // The demon and its passives before the pull are the same, and so is the pet.
    expect(r.prepull.casts.map((c) => [r.abilities[c.ability].id, c.atMs])).toEqual(none.prepull.casts.map((c) => [none.abilities[c.ability].id, c.atMs]))
    expect(r.pet).toEqual(none.pet)
  })

  it('skips a row that’s off, wherever it sits', () => {
    const order = moved('soulFire', 'curse')
    expect(ids(demonologyRotation({ [ID.soulFire]: false }, TALENTS, noAura, CONTEXT, order))).not.toContain('soulFire')
    expect(ids(demonologyRotation({ [ID.immolate]: false }, TALENTS, noAura, CONTEXT, moved('immolate', 'racial')))).not.toContain('immolate')
  })

  it('places a row a stored order leaves out between its default neighbours', () => {
    expect(normalizeAplOrder(DEMONOLOGY_APL, DEFAULT.filter((id) => id !== 'soulFire'))).toEqual(DEFAULT)
    // With the Bane moved first, a missing Soul Fire follows it and the rows after it that come before it by default.
    const baneFirst = ['bane', ...DEFAULT.filter((id) => id !== 'bane' && id !== 'soulFire')]
    expect(normalizeAplOrder(DEMONOLOGY_APL, baneFirst)).toEqual(['bane', 'racial', 'trinkets', 'powerInfusion', 'searingPain', 'curse', 'immolate', 'corruption', 'soulFire', 'lifeTap', 'filler'])
    // An order saved before Searing Pain's row (issue #17) gets it after Power Infusion, its default neighbour.
    const before = ['racial', 'trinkets', 'powerInfusion', 'curse', 'immolate', 'corruption', 'bane', 'soulFire', 'lifeTap', 'filler']
    expect(normalizeAplOrder(DEMONOLOGY_APL, before)).toEqual(DEFAULT)
    expect(normalizeAplOrder(DEMONOLOGY_APL, ['filler', ...before.filter((id) => id !== 'filler')])).toEqual(['filler', ...DEFAULT.filter((id) => id !== 'filler')])
    // One that moved the curse first keeps it there; Searing Pain still follows Power Infusion.
    expect(normalizeAplOrder(DEMONOLOGY_APL, ['curse', ...before.filter((id) => id !== 'curse')])).toEqual(['curse', 'racial', 'trinkets', 'powerInfusion', 'searingPain', 'immolate', 'corruption', 'bane', 'soulFire', 'lifeTap', 'filler'])
  })

  it('builds the same plan with the default order stored as with none, and another reordered', () => {
    const config = defaultConfig('warlock-demonology')
    const none = buildPlan(config).plan
    expect(buildPlan({ ...config, rotationOrder: DEFAULT }).plan).toEqual(none)
    const fillerFirst = buildPlan({ ...config, rotationOrder: moved('filler', 'racial') }).plan
    expect(fingerprint(planJson(fillerFirst))).not.toBe(fingerprint(planJson(none)))
  })

  it('offers the filler choice, Incinerate by default when it’s talented (issue #17)', () => {
    // warlock.md §6.4: a 0/20/31 build with Incinerate, where it's measured ahead of Shadow Bolt.
    const incinerate = talentRanksByName(TALENT_DATA.warlock, '-03050032011203-0550315103101051')
    const filler = (r: Rot) => ids(r).at(-2)
    expect(DEMONOLOGY_OPTIONS.find((o) => o.id === ID.filler)?.default).toBe('incinerate')
    expect(filler(demonologyRotation({}, incinerate, noAura, CONTEXT))).toBe('incinerate')
    expect(filler(demonologyRotation({ [ID.filler]: 'shadowBolt' }, incinerate, noAura, CONTEXT))).toBe('shadowBolt')
    // The default talents have no Incinerate: Shadow Bolt, and the note says why.
    expect(filler(demonologyRotation({}, TALENTS, noAura, CONTEXT))).toBe('shadowBolt')
    expect(demonologyUnusedSettings({}, TALENTS)[ID.filler]).toBe('Not used: Incinerate isn’t in your talents, so Shadow Bolt is the filler.')
    expect(demonologyUnusedSettings({}, incinerate)[ID.filler]).toBeUndefined()
  })
})
