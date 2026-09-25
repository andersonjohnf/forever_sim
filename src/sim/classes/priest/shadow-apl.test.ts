// The Shadow Priest's rotation as a priority list (decision D31; docs/classes/priest.md §6 "The
// priority list"): the rows cover every setting, the default order gives the plan the rotation gave
// before the list (200 random setups, fingerprinted on the code before it), the compiler follows the
// stored order with each row's own conditions, a row turned off is skipped, and an old setup loads
// byte-identical.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { normalizeConfig } from '../../config/normalize'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { MAJOR_MANA_POTION, POWER_INFUSION as POWER_INFUSION_USE } from '../../effects/buffs'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { COND, type Plan } from '../../plan/types'
import { emptyAggregate, mergeChunk } from '../../run/aggregate'
import { aplPresets, defaultAplOrder, DEFAULT_APL_PRESET, moveAplRow, normalizeAplOrder, storedAplOrder } from '../apl'
import { SHADOW_APL, SHADOW_IDS as ID, SHADOW_OPTIONS, shadowRotation } from './shadow'
import { fingerprint, planJson, shadowCases } from './shadow-apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.priest, defaultConfig('priest-shadow').talents)
const CONTEXT = { race: 'horde-troll', consumables: [POWER_INFUSION_USE, MAJOR_MANA_POTION], maxMana: 6000 }
type Rot = ReturnType<typeof shadowRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const DEFAULT = defaultAplOrder(SHADOW_APL)
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string, from = DEFAULT) =>
  moveAplRow(SHADOW_APL, from, id, from.indexOf(before) - (from.indexOf(id) < from.indexOf(before) ? 1 : 0))!

describe('the Shadow Priest’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    const known = new Set(SHADOW_OPTIONS.map((o) => o.id))
    const placed = new Set([...SHADOW_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...SHADOW_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    for (const row of SHADOW_APL.rows) {
      if (row.enabledId) expect(SHADOW_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    }
    expect(new Set(SHADOW_APL.rows.map((r) => r.id)).size).toBe(SHADOW_APL.rows.length)
    // Only Shadowform before the pull is pinned, first; the implicit Default is the one preset.
    expect(SHADOW_APL.rows.filter((r) => r.pinned).map((r) => r.id)).toEqual(['prepull'])
    expect(DEFAULT).toEqual(['prepull', 'racial', 'trinkets', 'darkSacrifice', 'shadowWordPain', 'devouringPlague', 'innerFocus', 'mindBlast', 'starshards', 'vampiricEmbrace', 'mindFlay'])
    expect(aplPresets(SHADOW_APL).map((p) => p.id)).toEqual([DEFAULT_APL_PRESET])
  })

  it('gives 200 random setups the plan they had before the list, in the default order', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Shadow plays. With the default order stored or none,
    // each plan is the same.
    const cases = shadowCases(SHADOW_OPTIONS, 200)
    const plans = cases.map((config) => buildPlan({ ...config, rotationOrder: DEFAULT }).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(cases.slice(0, 20).map((config) => fingerprint(planJson(buildPlan(config).plan)))).toEqual(hashes.slice(0, 20))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover each race's own spells and the mana consumables, on and off.
    const using = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['starshards', 'darkSacrifice', 'majorManaPotion', 'demonicRune', 'powerInfusion', 'vampiricEmbrace', 'innerFocus']) {
      expect(using(id), id).toBeGreaterThan(5)
      expect(using(id), id).toBeLessThan(195)
    }
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })

  it('gives the same list in the default order as with none, and builds it in the stored order', () => {
    const none = shadowRotation({}, TALENTS, CONTEXT)
    expect(shadowRotation({}, TALENTS, CONTEXT, DEFAULT)).toEqual(none)
    // priest.md §6's order: Berserking, then Power Infusion and the potion with the (no) trinkets,
    // the DoTs, Inner Focus, Mind Blast and Mind Flay.
    expect(ids(none)).toEqual(['berserking', 'powerInfusion', 'majorManaPotion', 'shadowWordPain', 'devouringPlague', 'innerFocus', 'mindBlast', 'mindFlay'])
    // Mind Blast above the DoTs, and the trinkets' row (with the consumables) last.
    let order = moved('mindBlast', 'shadowWordPain')
    order = moveAplRow(SHADOW_APL, order, 'trinkets', order.length - 1)!
    const r = shadowRotation({}, TALENTS, CONTEXT, order)
    expect(ids(r)).toEqual(['berserking', 'mindBlast', 'shadowWordPain', 'devouringPlague', 'innerFocus', 'mindFlay', 'powerInfusion', 'majorManaPotion'])
    // What the rotation presses is the same, whatever the order.
    expect(r.onUse).toEqual(none.onUse)
    // Shadowform can't move, and nothing passes it.
    expect(moveAplRow(SHADOW_APL, DEFAULT, 'prepull', 3)).toBeNull()
    expect(moveAplRow(SHADOW_APL, DEFAULT, 'racial', 0)).toBeNull()
  })

  it('keeps a moved row’s own conditions: Inner Focus still waits for Mind Blast, and the DoTs for the fight’s end', () => {
    const none = shadowRotation({}, TALENTS, CONTEXT)
    const order = moved('mindBlast', 'racial', moved('innerFocus', 'racial'))
    const r = shadowRotation({}, TALENTS, CONTEXT, order)
    expect(ids(r).slice(0, 3)).toEqual(['innerFocus', 'mindBlast', 'berserking'])
    const conditionsOf = (rot: Rot, id: string) =>
      rot.rotation
        .filter((e) => rot.abilities[e.ability].id === id)
        .map((e) => e.conditions.map((c) => (c.code === COND.abilityReady || c.code === COND.abilityAuraRefresh ? { ...c, a: rot.abilities[c.a].id } : c)))
    for (const id of ['innerFocus', 'shadowWordPain', 'devouringPlague', 'majorManaPotion']) expect(conditionsOf(r, id), id).toEqual(conditionsOf(none, id))
    expect(conditionsOf(r, 'innerFocus')).toEqual([[{ code: COND.abilityReady, a: 'mindBlast', b: 0 }]])
  })

  it('skips a row that’s off: Devouring Plague, or Inner Focus with Mind Blast off', () => {
    expect(ids(shadowRotation({ [ID.plague]: false }, TALENTS, CONTEXT))).not.toContain('devouringPlague')
    const noBlast = ids(shadowRotation({ [ID.blast]: false }, TALENTS, CONTEXT))
    expect(noBlast).not.toContain('mindBlast')
    expect(noBlast).not.toContain('innerFocus')
    // The trinkets' row off still presses the spec-wide consumables in its turn.
    expect(ids(shadowRotation({ [ID.trinkets]: false }, TALENTS, CONTEXT))).toEqual(ids(shadowRotation({}, TALENTS, CONTEXT)))
  })

  it('places what a stored order leaves out, and keeps the pinned row first', () => {
    // An order saved before a row existed, or edited by hand: Mind Flay above the DoTs, the rest where they fit.
    expect(normalizeAplOrder(SHADOW_APL, ['mindFlay', 'shadowWordPain'])).toEqual([
      'prepull',
      'racial',
      'trinkets',
      'darkSacrifice',
      'mindFlay',
      'shadowWordPain',
      'devouringPlague',
      'innerFocus',
      'mindBlast',
      'starshards',
      'vampiricEmbrace',
    ])
    expect(normalizeAplOrder(SHADOW_APL, ['vampiricEmbrace', 'prepull', 'nope', 3, 'vampiricEmbrace'])[0]).toBe('prepull')
    expect(normalizeAplOrder(SHADOW_APL, undefined)).toEqual(DEFAULT)
    expect(storedAplOrder(SHADOW_APL, DEFAULT)).toBeUndefined()
  })

  it('loads a setup saved before the list byte-identical, and plays the same fights with the default order as with none', () => {
    const d = defaultConfig('priest-shadow')
    const old = { ...d, rotation: { [ID.plague]: false, [ID.flayTicks]: 2 } }
    const { config } = normalizeConfig(JSON.parse(JSON.stringify(old)))
    expect(config.rotationOrder).toBeUndefined()
    expect(JSON.stringify(config)).toBe(JSON.stringify(normalizeConfig(old).config))
    expect(fingerprint(planJson(buildPlan(config).plan))).toBe(fingerprint(planJson(buildPlan(old).plan)))

    const run = (plan: Plan) => {
      const sim = new Sim(plan)
      return mergeChunk(emptyAggregate(plan.sources.length, plan.auras.length), runChunk(plan, 0, Math.min(CHUNK_SIZE, 200), sim)).dps.mean
    }
    const fixed = { ...d, run: { mode: 'fixed' as const, iterations: 200, seed: 99 } }
    const none = buildPlan(fixed).plan
    expect(buildPlan({ ...fixed, rotationOrder: DEFAULT }).plan).toEqual(none)
    // Vampiric Embrace is off by default, so moving it changes nothing it plays…
    expect(run(buildPlan({ ...fixed, rotationOrder: moved('vampiricEmbrace', 'shadowWordPain') }).plan)).toBe(run(none))
    // …while Mind Flay above Mind Blast does: the filler takes every global cooldown.
    const flayFirst = buildPlan({ ...fixed, rotationOrder: moved('mindFlay', 'shadowWordPain') }).plan
    expect(run(flayFirst)).toBeLessThan(run(none))
  })
})
