// Arms' rotation as a priority list (decision D31; docs/classes/warrior.md §5.3 "The priority
// list"): the rows cover every setting, the default order gives every setup the plan it had before
// the list, the compiler follows the stored order, and a moved row keeps its own conditions.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { normalizeConfig } from '../../config/normalize'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { MIGHTY_RAGE_POTION } from '../../effects/buffs'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { COND, type Plan } from '../../plan/types'
import { emptyAggregate, mergeChunk } from '../../run/aggregate'
import { activeAplPreset, DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder, storedAplOrder } from '../apl'
import { ARMS_APL, ARMS_OPTIONS, armsRotation } from './arms'
import { armsCases, fingerprint } from './arms-apl-cases'
import { planJson } from './fury-apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.warrior, defaultConfig('warrior-arms').talents)
const CONTEXT = { consumables: [MIGHTY_RAGE_POTION] }
const noAura = () => -1
type Rot = ReturnType<typeof armsRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const linesOf = (r: Rot, id: string) => r.rotation.filter((e) => r.abilities[e.ability].id === id)
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string, from = defaultAplOrder(ARMS_APL)) =>
  moveAplRow(ARMS_APL, from, id, from.indexOf(before) - (from.indexOf(id) < from.indexOf(before) ? 1 : 0))!
/** A line's conditions with each ability read by id, so lists built in different orders compare. */
const conditionsOf = (rot: Rot, id: string) =>
  linesOf(rot, id).map((e) =>
    e.conditions.map((c) =>
      c.code === COND.cooldownAtLeast || c.code === COND.abilityAuraUp || c.code === COND.abilityAuraRefresh
        ? { ...c, a: rot.abilities[c.a].id }
        : c.code === COND.gcdSafe
          ? { ...c, a: rot.abilities.filter((_, i) => c.a & (1 << i)).map((a) => a.id).sort() }
          : c,
    ),
  )

describe('Arms’ priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    const known = new Set(ARMS_OPTIONS.map((o) => o.id))
    const placed = new Set([...ARMS_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...ARMS_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    // A row's switch is a switch, and its summary reads its own settings.
    for (const row of ARMS_APL.rows) {
      if (row.enabledId) expect(ARMS_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    }
    expect(new Set(ARMS_APL.rows.map((r) => r.id)).size).toBe(ARMS_APL.rows.length)
    // Only the pre-pull is pinned, first; the stance is spec-wide; no named presets, so the default is "Default".
    expect(ARMS_APL.rows.filter((r) => r.pinned).map((r) => r.id)).toEqual(['prepull'])
    expect(ARMS_APL.rows[0].id).toBe('prepull')
    expect(ARMS_APL.specWide[0]).toBe('warrior.arms.baseStance')
    expect(ARMS_APL.presets).toEqual([])
  })

  it('gives 200 random setups the plan they had before the list, in the default order', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Arms plays.
    const cases = armsCases(ARMS_OPTIONS, 200)
    const plans = cases.map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover each stance, Death Wish, Spearing Strike, the potion and the Whirlwind dance.
    const using = (id: string) => plans.filter((p) => p.rotation.some((e) => p.abilities[e.ability].id === id)).length
    for (const id of ['deathWish', 'spearingStrike', 'mightyRagePotion', 'whirlwind', 'rend', 'overpower', 'heroicStrike', 'execute']) {
      expect(using(id), id).toBeGreaterThan(15)
      expect(using(id), id).toBeLessThan(195)
    }
    expect(hashes).toMatchSnapshot()
    // The default order stored gives the same plans as none.
    for (const config of cases.slice(0, 40)) {
      expect(fingerprint(planJson(buildPlan({ ...config, rotationOrder: defaultAplOrder(ARMS_APL) }).plan))).toBe(fingerprint(planJson(buildPlan(config).plan)))
    }
  })

  it('gives the same list in the default order as with none, in warrior.md §5.3’s order', () => {
    const none = armsRotation({}, TALENTS, noAura, CONTEXT)
    expect(armsRotation({}, TALENTS, noAura, CONTEXT, defaultAplOrder(ARMS_APL))).toEqual(none)
    // Rows 1, 2, 3 (a Human has no racial, and no trinket is worn), 4 (two lines), 5, 6, 7, 8, 9
    // (both phases, two lines each), 10, 11, 14, then the potion (17: in the phase, and its last chance). Death Wish,
    // Whirlwind and Heroic Strike are off by default.
    expect(ids(none)).toEqual([
      'battleShout',
      'rend',
      'recklessness',
      'recklessness',
      'bloodrage',
      'slam',
      'mortalStrike',
      'execute',
      'mortalStrike',
      'overpower',
      'overpower',
      'overpower',
      'overpower',
      'slam',
      'spearingStrike',
      'hamstring',
      'mightyRagePotion',
      'mightyRagePotion',
    ])
  })

  it('builds the list in the stored order, and keeps the pre-pull and the consumables where they were', () => {
    // Execute above Slam in the execute phase, and Slam above Mortal Strike.
    let order = moved('execute', 'executeSlam')
    order = moved('slam', 'mortalStrike', order)
    const none = armsRotation({}, TALENTS, noAura, CONTEXT)
    const r = armsRotation({}, TALENTS, noAura, CONTEXT, order)
    expect(ids(r).slice(0, 10)).toEqual(['battleShout', 'rend', 'recklessness', 'recklessness', 'bloodrage', 'execute', 'slam', 'mortalStrike', 'slam', 'mortalStrike'])
    expect(ids(r).slice(-2)).toEqual(['mightyRagePotion', 'mightyRagePotion'])
    expect(r.prepull).toEqual({ ...none.prepull, casts: none.prepull.casts.map((c) => ({ ...c, ability: r.abilities.findIndex((a) => a.id === none.abilities[c.ability].id) })) })
    // The pinned pre-pull can't move, and no row crosses it.
    expect(moveAplRow(ARMS_APL, order, 'prepull', 3)).toBeNull()
    expect(moveAplRow(ARMS_APL, order, 'hamstring', 0)).toBeNull()
  })

  it('keeps a moved row’s own conditions: Slam and Hamstring stay GCD-safe for Mortal Strike, the racial waits for Death Wish', () => {
    const talents = new Map([...TALENTS, ['Death Wish', 1]])
    const context = { ...CONTEXT, race: 'horde-orc' }
    const values = { 'warrior.arms.whirlwind.enabled': true }
    const base = armsRotation(values, talents, noAura, context)
    let order = moved('hamstring', 'battleShout')
    order = moved('slam', 'hamstring', order)
    order = moved('racial', 'battleShout', order)
    order = moved('overpower', 'executeSlam', order)
    const r = armsRotation(values, talents, noAura, context, order)
    expect(ids(r).slice(0, 5)).toEqual(['slam', 'hamstring', 'bloodFury', 'bloodFury', 'bloodFury'])
    // Slam's two rows (in the execute phase and outside it) now come in the other order, so its lines are compared as a set.
    const sorted = (lines: unknown[]) => lines.map((l) => JSON.stringify(l)).sort()
    for (const id of ['slam', 'hamstring', 'overpower', 'whirlwind', 'bloodFury', 'deathWish', 'spearingStrike', 'execute', 'rend']) {
      expect(sorted(conditionsOf(r, id)), id).toEqual(sorted(conditionsOf(base, id)))
    }
    // Hamstring is GCD-safe for every strike with a cooldown, though it now comes before them all.
    expect(conditionsOf(r, 'hamstring')[0].find((c) => c.code === COND.gcdSafe)?.a).toEqual(['mortalStrike', 'slam', 'spearingStrike', 'whirlwind'])
    // The racial still waits for Death Wish, and Death Wish still gets its lines.
    expect(conditionsOf(r, 'bloodFury')[0]).toEqual([{ code: COND.abilityAuraUp, a: 'deathWish', b: 0 }])
    expect(linesOf(r, 'deathWish')).toHaveLength(2)
  })

  it('skips a row that’s turned off, wherever it sits', () => {
    const order = moved('hamstring', 'battleShout')
    const off = armsRotation({ 'warrior.arms.hamstring.enabled': false }, TALENTS, noAura, CONTEXT, order)
    expect(ids(off)).not.toContain('hamstring')
    expect(ids(off)).toEqual(ids(armsRotation({ 'warrior.arms.hamstring.enabled': false }, TALENTS, noAura, CONTEXT)))
    // Mortal Strike's row off leaves it in the execute phase (its own row there), and the rows that
    // waited on it stop waiting.
    const noMs = armsRotation({ 'warrior.arms.mortalStrike.enabled': false }, TALENTS, noAura, CONTEXT)
    expect(linesOf(noMs, 'mortalStrike')).toHaveLength(1)
    expect(linesOf(noMs, 'mortalStrike')[0].conditions).toEqual([{ code: COND.executePhase, a: 1, b: 0 }])
    expect(linesOf(noMs, 'slam').flatMap((e) => e.conditions).some((c) => c.code === COND.gcdSafe)).toBe(false)
  })

  it('places a row a stored order leaves out between its default neighbours', () => {
    const order = defaultAplOrder(ARMS_APL)
    // A setup saved before a row existed: it goes back to its place.
    expect(normalizeAplOrder(ARMS_APL, order.filter((id) => id !== 'spearingStrike'))).toEqual(order)
    // A hand-written order: the rows it doesn't name follow the nearest one before them that it does.
    const partial = normalizeAplOrder(ARMS_APL, ['whirlwind', 'mortalStrike'])
    expect(partial.slice(0, 12)).toEqual(order.slice(0, 11).concat('whirlwind'))
    expect(partial.slice(12)).toEqual(['mortalStrike', 'overpower', 'slam', 'spearingStrike', 'heroicStrike', 'hamstring'])
    // Unknown ids go, and the pre-pull stays first.
    expect(normalizeAplOrder(ARMS_APL, ['sweepingStrikes', ...order.slice(1), 'prepull'])).toEqual(order)
    // The app stores nothing for the default order.
    expect(storedAplOrder(ARMS_APL, order)).toBeUndefined()
  })

  it('loads an old saved setup without an order byte-identical, as the Default preset', () => {
    const old = { ...defaultConfig('warrior-arms'), rotation: { 'warrior.arms.baseStance': 'berserker', 'warrior.arms.hamstring.minRage': 55 } }
    const { config, warnings } = normalizeConfig(JSON.parse(JSON.stringify(old)))
    expect(warnings).toEqual([])
    expect(config).toEqual(old)
    expect('rotationOrder' in config).toBe(false)
    expect(planJson(buildPlan(config).plan)).toBe(planJson(buildPlan(old).plan))
    expect(activeAplPreset(ARMS_APL, ARMS_OPTIONS, {}, undefined, TALENTS)).toBe(DEFAULT_APL_PRESET)
    // A spec-wide setting doesn't make the list Custom; a moved row does.
    expect(activeAplPreset(ARMS_APL, ARMS_OPTIONS, { 'warrior.arms.baseStance': 'berserker' }, undefined, TALENTS)).toBe(DEFAULT_APL_PRESET)
    expect(activeAplPreset(ARMS_APL, ARMS_OPTIONS, {}, moved('hamstring', 'mortalStrike'), TALENTS)).toBe('custom')
  })

  it('plays the same fights with the default order stored as with none, and different ones reordered', () => {
    const config = { ...defaultConfig('warrior-arms'), run: { mode: 'fixed' as const, iterations: 200, seed: 99 } }
    const run = (plan: Plan) => {
      const sim = new Sim(plan)
      return mergeChunk(emptyAggregate(plan.sources.length, plan.auras.length), runChunk(plan, 0, Math.min(CHUNK_SIZE, 200), sim)).dps.mean
    }
    const none = buildPlan(config).plan
    expect(buildPlan({ ...config, rotationOrder: defaultAplOrder(ARMS_APL) }).plan).toEqual(none)
    // Heroic Strike is off by default, so moving it changes nothing it plays…
    expect(run(buildPlan({ ...config, rotationOrder: moved('heroicStrike', 'battleShout') }).plan)).toBe(run(none))
    // …while Hamstring ahead of Mortal Strike does: it spends the rage first.
    expect(run(buildPlan({ ...config, rotationOrder: moved('hamstring', 'battleShout') }).plan)).not.toBe(run(none))
  })
})
