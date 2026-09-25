// The Subtlety rogue's rotation as a priority list (decision D31; docs/classes/rogue.md §6.3 "The
// priority list"): the rows cover every setting, the list in its default order plays exactly as
// Subtlety played before it, the compiler follows the stored order, and a setup saved before the
// list loads unchanged.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { JUJU_FLURRY } from '../../effects/buffs'
import { normalizeConfig } from '../../config/normalize'
import { rotationPreset } from '../../index'
import { COND } from '../../plan/types'
import { buildPlan } from '../../plan/build'
import { activeAplPreset, aplPresets, CUSTOM_APL_PRESET, DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder } from '../apl'
import { THISTLE_TEA } from './abilities'
import { SUBTLETY_APL, SUBTLETY_IDS as ID, SUBTLETY_OPTIONS, subtletyRotation } from './subtlety'
import { subtletyCases } from './subtlety-apl-cases'
import { expectRowsCoverOptions, fingerprint, planJson } from './combat-apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.rogue, defaultConfig('rogue-subtlety').talents)
const CONTEXT = { race: 'horde-orc', items: [], consumables: [THISTLE_TEA, JUJU_FLURRY], weaponTypes: ['dagger', 'dagger'] as const, front: false }
type Rot = ReturnType<typeof subtletyRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const DEFAULT_ORDER = defaultAplOrder(SUBTLETY_APL)
const BACKSTAB_BUILDER = { [ID.builder]: 'backstab', [ID.ghostlyStrike]: true }

describe('the Subtlety rogue’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and nothing pinned', () => {
    expectRowsCoverOptions(SUBTLETY_APL, SUBTLETY_OPTIONS)
    expect(DEFAULT_ORDER).toEqual(['racial', 'onUseItems', 'premeditation', 'sliceAndDice', 'exposeArmor', 'rupture', 'eviscerate', 'hemorrhage', 'ambush', 'ghostlyStrike', 'builder'])
    expect(SUBTLETY_APL.specWide).toEqual([ID.tea, ID.teaEnergy, ID.juju])
    expect(aplPresets(SUBTLETY_APL).map((p) => p.label)).toEqual(['Default'])
  })

  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before it,
    // with no order stored; the default order stored gives the same plans.
    // Re-taken 2026-09-25 only for Eviscerate's attack power, 3% → 4% per point (a guild test, rogue.md
    // §3.4): the plan carries the coefficient, and with 0.03 the earlier snapshot still matched.
    // Re-taken 2026-09-25 again only for the poisons' attack power (a guild test, rogue.md §4.1, §4.2):
    // their procs carry `apCoefficient`, and without it the earlier snapshot still matched.
    const cases = subtletyCases(SUBTLETY_OPTIONS, 200)
    const plans = cases.map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(cases.map((config) => fingerprint(planJson(buildPlan({ ...config, rotationOrder: DEFAULT_ORDER }).plan)))).toEqual(hashes)
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover both builders, Ambush, Rupture and Ghostly Strike.
    const has = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    expect(has('backstab')).toBeGreaterThan(20)
    expect(has('hemorrhage')).toBeGreaterThan(30)
    expect(has('ambush')).toBeGreaterThan(10)
    expect(has('rupture')).toBeGreaterThan(30)
    expect(has('ghostlyStrike')).toBeGreaterThan(20)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })

  it('gives the same list in the default order as with none, and builds it in the stored order', () => {
    const none = subtletyRotation(BACKSTAB_BUILDER, TALENTS, CONTEXT)
    expect(subtletyRotation(BACKSTAB_BUILDER, TALENTS, CONTEXT, DEFAULT_ORDER)).toEqual(none)
    // rogue.md §6.3's order, with Backstab building and Ghostly Strike on.
    expect(ids(none)).toEqual(['bloodFury', 'thistleTea', 'jujuFlurry', 'premeditation', 'sliceAndDice', 'rupture', 'eviscerate', 'hemorrhage', 'ambush', 'ghostlyStrike', 'backstab'])
    // Hemorrhage's debuff above Rupture, and Ghostly Strike above Eviscerate: each keeps its own
    // lines, and the debuff still waits for Rupture's bleed, which it reads by definition.
    let order = moveAplRow(SUBTLETY_APL, DEFAULT_ORDER, 'hemorrhage', DEFAULT_ORDER.indexOf('rupture'))!
    order = moveAplRow(SUBTLETY_APL, order, 'ghostlyStrike', order.indexOf('eviscerate'))!
    const r = subtletyRotation(BACKSTAB_BUILDER, TALENTS, CONTEXT, order)
    expect(ids(r)).toEqual(['bloodFury', 'thistleTea', 'jujuFlurry', 'premeditation', 'sliceAndDice', 'hemorrhage', 'rupture', 'ghostlyStrike', 'eviscerate', 'ambush', 'backstab'])
    const hemo = r.rotation.find((e) => r.abilities[e.ability].id === 'hemorrhage')!
    const up = hemo.conditions.find((c) => c.code === COND.abilityAuraUp)!
    expect(r.abilities[up.a].id).toBe('rupture')
    const conditions = (rot: Rot, id: string) => rot.rotation.filter((e) => rot.abilities[e.ability].id === id).map((e) => e.conditions.map((c) => [c.code, c.b]))
    for (const id of ['hemorrhage', 'rupture', 'ghostlyStrike', 'eviscerate', 'backstab']) expect(conditions(r, id), id).toEqual(conditions(none, id))
    // Ambush below Backstab: the builder takes the moment first, but Backstab still opens the window.
    const ambushLast = moveAplRow(SUBTLETY_APL, DEFAULT_ORDER, 'ambush', DEFAULT_ORDER.length - 1)!
    const low = subtletyRotation(BACKSTAB_BUILDER, TALENTS, CONTEXT, ambushLast)
    expect(ids(low).slice(-2)).toEqual(['backstab', 'ambush'])
    expect(low.abilities.find((a) => a.id === 'backstab')!.opensWindow).toBeDefined()
  })

  it('skips a row that’s off, wherever it sits; the builder, which has no switch, follows its setting', () => {
    const order = moveAplRow(SUBTLETY_APL, DEFAULT_ORDER, 'premeditation', DEFAULT_ORDER.length - 1)!
    expect(ids(subtletyRotation({}, TALENTS, CONTEXT, order)).at(-1)).toBe('premeditation')
    const off = subtletyRotation({ [ID.premeditation]: false, [ID.rupture]: false }, TALENTS, CONTEXT, order)
    // With Rupture off, the Hemorrhage debuff row, which needs its bleed, is skipped too.
    expect(ids(off)).toEqual(['bloodFury', 'thistleTea', 'jujuFlurry', 'sliceAndDice', 'eviscerate', 'hemorrhage'])
    // Hemorrhage builds by default; Backstab from behind with a dagger, Hemorrhage from the front.
    expect(ids(subtletyRotation(BACKSTAB_BUILDER, TALENTS, CONTEXT, order)).at(-2)).toBe('backstab')
    expect(ids(subtletyRotation(BACKSTAB_BUILDER, TALENTS, { ...CONTEXT, front: true }, order))).not.toContain('backstab')
  })

  it('places the rows a stored order doesn’t name, and drops what it doesn’t know', () => {
    // A row added in a later version (here, Ambush missing) lands between its default neighbours;
    // with Hemorrhage's debuff moved to the top, after it and past the rows that come before Ambush
    // by default too, so in its default place.
    expect(normalizeAplOrder(SUBTLETY_APL, DEFAULT_ORDER.filter((id) => id !== 'ambush'))).toEqual(DEFAULT_ORDER)
    const moved = moveAplRow(SUBTLETY_APL, DEFAULT_ORDER, 'hemorrhage', 0)!
    expect(normalizeAplOrder(SUBTLETY_APL, moved.filter((id) => id !== 'ambush'))).toEqual(moved)
    expect(normalizeAplOrder(SUBTLETY_APL, [null, 'nope'])).toEqual(DEFAULT_ORDER)
  })

  it('loads a setup saved before the list byte-identical, and reads it as the Default', () => {
    const before = defaultConfig('rogue-subtlety')
    const { config, warnings } = normalizeConfig(JSON.parse(JSON.stringify(before)))
    expect(warnings).toEqual([])
    expect(JSON.stringify(config)).toBe(JSON.stringify(before))
    expect(fingerprint(planJson(buildPlan(config).plan))).toBe(fingerprint(planJson(buildPlan({ ...before, rotationOrder: DEFAULT_ORDER }).plan)))
    expect(rotationPreset(config)).toBe(DEFAULT_APL_PRESET)
    const active = (saved: Record<string, number | boolean | string>, order?: string[]) => activeAplPreset(SUBTLETY_APL, SUBTLETY_OPTIONS, saved, order, TALENTS)
    expect(active({ [ID.teaEnergy]: 5 })).toBe(DEFAULT_APL_PRESET)
    expect(active({ [ID.builder]: 'backstab' })).toBe(CUSTOM_APL_PRESET)
    expect(active({}, moveAplRow(SUBTLETY_APL, DEFAULT_ORDER, 'builder', 0)!)).toBe(CUSTOM_APL_PRESET)
  })
})
