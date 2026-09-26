// The Combat rogue's rotation as a priority list (decision D31; docs/classes/rogue.md §6.1 "The
// priority list"): the rows cover every setting, the list in its default order plays exactly as
// Combat played before it, the compiler follows the stored order, and a setup saved before the list
// loads unchanged.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { JUJU_FLURRY } from '../../effects/buffs'
import { normalizeConfig } from '../../config/normalize'
import { rotationPreset } from '../../index'
import { buildPlan } from '../../plan/build'
import { activeAplPreset, aplPresets, CUSTOM_APL_PRESET, DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder } from '../apl'
import { THISTLE_TEA } from './abilities'
import { COMBAT_APL, COMBAT_IDS as ID, COMBAT_OPTIONS, combatRotation } from './combat'
import { combatCases, expectRowsCoverOptions, fingerprint, planJson } from './combat-apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.rogue, defaultConfig('rogue-combat').talents)
const CONTEXT = { race: 'horde-orc', items: [], consumables: [THISTLE_TEA, JUJU_FLURRY] }
type Rot = ReturnType<typeof combatRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const DEFAULT_ORDER = defaultAplOrder(COMBAT_APL)

describe('the Combat rogue’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and nothing pinned', () => {
    expectRowsCoverOptions(COMBAT_APL, COMBAT_OPTIONS)
    expect(DEFAULT_ORDER).toEqual(['racial', 'onUseItems', 'sliceAndDice', 'bladeFlurry', 'adrenalineRush', 'exposeArmor', 'rupture', 'eviscerate', 'sinisterStrike'])
    expect(COMBAT_APL.specWide).toEqual([ID.tea, ID.teaEnergy, ID.juju])
    // No named rotations: the implicit Default, the common priority (D27).
    expect(aplPresets(COMBAT_APL).map((p) => p.label)).toEqual(['Default'])
  })

  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before it,
    // with no order stored; the default order stored gives the same plans.
    // Re-taken 2026-09-25 only for Eviscerate's attack power, 3% → 4% per point (a player's Discord tests, rogue.md
    // §3.4): the plan carries the coefficient, and with 0.03 the earlier snapshot still matched.
    // Re-taken 2026-09-25 again only for the poisons' attack power (a player's Discord tests, rogue.md §4.1, §4.2):
    // their procs carry `apCoefficient`, and without it the earlier snapshot still matched.
    // Re-taken 2026-09-26 only for `classicEra`'s Eviscerate share, back to 3% per point (rogue.md §3.4):
    // with `classicEra` at 4% the earlier snapshot still matched.
    const cases = combatCases(COMBAT_OPTIONS, 200)
    const plans = cases.map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(cases.map((config) => fingerprint(planJson(buildPlan({ ...config, rotationOrder: DEFAULT_ORDER }).plan)))).toEqual(hashes)
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover Rupture and Expose Armor on and off, and every plan has a rotation.
    const ruptures = plans.filter((p) => p.abilities.some((a) => a.id === 'rupture')).length
    expect(ruptures).toBeGreaterThan(30)
    expect(ruptures).toBeLessThan(170)
    const exposes = plans.filter((p) => p.abilities.some((a) => a.id === 'exposeArmor')).length
    expect(exposes).toBeGreaterThan(30)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })

  it('gives the same list in the default order as with none, and builds it in the stored order', () => {
    const values = { [ID.rupture]: true, [ID.expose]: true }
    const none = combatRotation(values, TALENTS, CONTEXT)
    expect(combatRotation(values, TALENTS, CONTEXT, DEFAULT_ORDER)).toEqual(none)
    // rogue.md §6.1's order: the racial, the on-use items' turn (Thistle Tea, Juju Flurry), Slice and
    // Dice, Blade Flurry, Adrenaline Rush, Expose Armor, Rupture, Eviscerate and Sinister Strike.
    expect(ids(none)).toEqual(['bloodFury', 'thistleTea', 'jujuFlurry', 'sliceAndDice', 'bladeFlurry', 'adrenalineRush', 'exposeArmor', 'rupture', 'eviscerate', 'sinisterStrike'])
    // Eviscerate above Slice and Dice, and Rupture above Expose Armor: each keeps its own lines.
    let order = moveAplRow(COMBAT_APL, DEFAULT_ORDER, 'eviscerate', DEFAULT_ORDER.indexOf('sliceAndDice'))!
    order = moveAplRow(COMBAT_APL, order, 'rupture', order.indexOf('exposeArmor'))!
    const r = combatRotation(values, TALENTS, CONTEXT, order)
    expect(ids(r)).toEqual(['bloodFury', 'thistleTea', 'jujuFlurry', 'eviscerate', 'sliceAndDice', 'bladeFlurry', 'adrenalineRush', 'rupture', 'exposeArmor', 'sinisterStrike'])
    const conditions = (rot: Rot, id: string) => rot.rotation.filter((e) => rot.abilities[e.ability].id === id).map((e) => e.conditions.map((c) => [c.code, c.b]))
    for (const id of ['eviscerate', 'sliceAndDice', 'rupture', 'exposeArmor']) expect(conditions(r, id), id).toEqual(conditions(none, id))
    // The consumables are spec-wide and move with the on-use items' row.
    const last = moveAplRow(COMBAT_APL, DEFAULT_ORDER, 'onUseItems', DEFAULT_ORDER.length - 1)!
    expect(ids(combatRotation(values, TALENTS, CONTEXT, last)).slice(-3)).toEqual(['sinisterStrike', 'thistleTea', 'jujuFlurry'])
    // Sinister Strike above Eviscerate: it's always affordable first, so Eviscerate waits for Energy it leaves.
    const ssUp = moveAplRow(COMBAT_APL, DEFAULT_ORDER, 'sinisterStrike', DEFAULT_ORDER.indexOf('eviscerate'))!
    expect(ids(combatRotation({}, TALENTS, CONTEXT, ssUp)).slice(-2)).toEqual(['sinisterStrike', 'eviscerate'])
  })

  it('skips a row that’s off, wherever it sits', () => {
    const order = moveAplRow(COMBAT_APL, DEFAULT_ORDER, 'adrenalineRush', 0)!
    const on = combatRotation({}, TALENTS, CONTEXT, order)
    expect(ids(on)[0]).toBe('adrenalineRush')
    const off = combatRotation({ [ID.adrenalineRush]: false, [ID.snd]: false }, TALENTS, CONTEXT, order)
    expect(ids(off)).not.toContain('adrenalineRush')
    expect(ids(off)).not.toContain('sliceAndDice')
    expect(ids(off)).toEqual(['bloodFury', 'thistleTea', 'jujuFlurry', 'bladeFlurry', 'eviscerate', 'sinisterStrike'])
  })

  it('places the rows a stored order doesn’t name, and drops what it doesn’t know', () => {
    // Eviscerate above the racial: the rows between them by default follow the racial, and Sinister
    // Strike, after Eviscerate by default, goes past them too, so it's still after both.
    expect(normalizeAplOrder(COMBAT_APL, ['eviscerate', 'racial'])).toEqual([
      'eviscerate',
      'racial',
      'onUseItems',
      'sliceAndDice',
      'bladeFlurry',
      'adrenalineRush',
      'exposeArmor',
      'rupture',
      'sinisterStrike',
    ])
    // A row added in a later version (here, Rupture missing) lands between its default neighbours.
    const stored = DEFAULT_ORDER.filter((id) => id !== 'rupture')
    expect(normalizeAplOrder(COMBAT_APL, stored)).toEqual(DEFAULT_ORDER)
    const moved = moveAplRow(COMBAT_APL, DEFAULT_ORDER, 'eviscerate', 0)!.filter((id) => id !== 'rupture')
    expect(normalizeAplOrder(COMBAT_APL, moved)).toEqual(['eviscerate', 'racial', 'onUseItems', 'sliceAndDice', 'bladeFlurry', 'adrenalineRush', 'exposeArmor', 'rupture', 'sinisterStrike'])
    expect(normalizeAplOrder(COMBAT_APL, ['nope', 7, 'rupture'])).toEqual(DEFAULT_ORDER)
    expect(normalizeAplOrder(COMBAT_APL, undefined)).toEqual(DEFAULT_ORDER)
  })

  it('loads a setup saved before the list byte-identical, and reads it as the Default', () => {
    const before = defaultConfig('rogue-combat')
    const { config, warnings } = normalizeConfig(JSON.parse(JSON.stringify(before)))
    expect(warnings).toEqual([])
    expect(JSON.stringify(config)).toBe(JSON.stringify(before))
    expect(config.rotationOrder).toBeUndefined()
    expect(fingerprint(planJson(buildPlan(config).plan))).toBe(fingerprint(planJson(buildPlan({ ...before, rotationOrder: DEFAULT_ORDER }).plan)))
    expect(rotationPreset(config)).toBe(DEFAULT_APL_PRESET)
    // A moved row, or a row setting changed, is Custom; a consumable's setting, spec-wide, isn't the list's.
    const active = (saved: Record<string, number | boolean>, order?: string[]) => activeAplPreset(COMBAT_APL, COMBAT_OPTIONS, saved, order, TALENTS)
    expect(active({ [ID.teaEnergy]: 20 })).toBe(DEFAULT_APL_PRESET)
    expect(active({ [ID.rupture]: true })).toBe(CUSTOM_APL_PRESET)
    expect(active({}, moveAplRow(COMBAT_APL, DEFAULT_ORDER, 'rupture', 1)!)).toBe(CUSTOM_APL_PRESET)
  })
})
