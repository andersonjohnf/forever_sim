// The Feral cat's rotation as a priority list (decision D31; docs/classes/druid.md §6.2 "The
// priority list"): the rows cover every setting, the default order plays exactly as the cat played
// before the list, the compiler follows the stored order, a moved row keeps its own conditions, and
// a setup saved before the list loads as it was.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { normalizeConfig } from '../../config/normalize'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { JUJU_FLURRY, MIGHTY_RAGE_POTION } from '../../effects/buffs'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { rotationPreset } from '../../index'
import { buildPlan } from '../../plan/build'
import { COND, type Plan } from '../../plan/types'
import { emptyAggregate, mergeChunk } from '../../run/aggregate'
import { DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder, storedAplOrder } from '../apl'
import { planJson } from '../warrior/fury-apl-cases'
import { CAT_APL, CAT_IDS, CAT_OPTIONS, catRotation } from './cat'
import { catCases, fingerprint } from './cat-apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.druid, defaultConfig('druid-feral-cat').talents)
const CONTEXT = { consumables: [MIGHTY_RAGE_POTION, JUJU_FLURRY] }
/** The plan's Clearcasting aura at index 0, as the plan builder resolves it (every druid has Omen of Clarity, §2.7). */
const auraIndex = (id: string) => (id === 'clearcasting' ? 0 : -1)
type Rot = ReturnType<typeof catRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
/** A line's conditions with each ability index read as that ability's id, so lists built in two orders compare. */
const conditionsOf = (r: Rot, id: string) =>
  r.rotation
    .filter((e) => r.abilities[e.ability].id === id)
    .map((e) =>
      e.conditions.map((c) =>
        c.code === COND.cooldownAtLeast || c.code === COND.abilityAuraUp || c.code === COND.abilityAuraDown || c.code === COND.abilityAuraRefresh
          ? { ...c, a: r.abilities[c.a].id }
          : c,
      ),
    )
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string, from = defaultAplOrder(CAT_APL)) =>
  moveAplRow(CAT_APL, from, id, from.indexOf(before) - (from.indexOf(id) < from.indexOf(before) ? 1 : 0))!
const rotation = (values: Record<string, string | number | boolean>, order?: string[], context: Parameters<typeof catRotation>[3] = CONTEXT) =>
  catRotation(values, TALENTS, auraIndex, context, order)

/** The default list, druid.md §6.2's order, with the consumables selected. */
const DEFAULT_IDS = [
  'berserk',
  'tigersFury',
  'mightyRagePotion',
  'jujuFlurry',
  'faerieFire',
  'faerieFire',
  'shred',
  'claw',
  'rip',
  'ferociousBite',
  'shred',
  'claw',
  'ferociousBite',
  'shred',
  'claw',
]

describe('the Feral cat’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    const known = new Set(CAT_OPTIONS.map((o) => o.id))
    const placed = new Set([...CAT_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...CAT_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    expect(CAT_APL.specWide).toEqual([CAT_IDS.potion, CAT_IDS.juju])
    for (const row of CAT_APL.rows) {
      if (row.enabledId) expect(CAT_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      // A summary part reads the row's own settings; a part about another row's says so with alsoOn.
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
      // A row without a switch says what it does.
      if (!row.enabledId) expect(row.help, row.id).toBeTruthy()
    }
    expect(new Set(CAT_APL.rows.map((r) => r.id)).size).toBe(CAT_APL.rows.length)
    // The cat has no pre-pull or opener: nothing is pinned. Its only preset is the implicit Default.
    expect(CAT_APL.rows.filter((r) => r.pinned)).toEqual([])
    expect(CAT_APL.presets).toEqual([])
    expect(defaultAplOrder(CAT_APL)).toEqual(['berserk', 'racial', 'onUseItems', 'tigersFury', 'faerieFire', 'clearcasting', 'rip', 'ferociousBite', 'rake', 'shred', 'claw'])
  })

  it('gives the same list in the default order as with none', () => {
    const none = rotation({})
    expect(rotation({}, defaultAplOrder(CAT_APL))).toEqual(none)
    expect(ids(none)).toEqual(DEFAULT_IDS)
  })

  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before it:
    // a change to it is a change to what the default order plays.
    const cases = catCases(CAT_OPTIONS, 200)
    const plans = cases.map((config) => buildPlan({ ...config, rotationOrder: defaultAplOrder(CAT_APL) }).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover Rake, Claw and Berserk each on and off, and a rotation each. Every druid has Omen of
    // Clarity in Forever (druid.md §2.7), so every plan has Clearcasting.
    const has = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['rake', 'claw', 'berserk']) {
      expect(has(id), id).toBeGreaterThan(20)
      expect(has(id), id).toBeLessThan(190)
    }
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })

  it('builds the list in the stored order, each row keeping its own conditions', () => {
    const values = { [CAT_IDS.rakeEnabled]: true, [CAT_IDS.rakeNoBleed]: true, [CAT_IDS.biteRipUp]: true }
    const base = rotation(values)
    // Rake first on the GCD, and Ferocious Bite above Rip.
    const order = moved('ferociousBite', 'rip', moved('rake', 'faerieFire'))
    const r = rotation(values, order)
    expect(ids(r)).toEqual([
      'berserk',
      'tigersFury',
      'mightyRagePotion',
      'jujuFlurry',
      'rake',
      'faerieFire',
      'faerieFire',
      'shred',
      'claw',
      'ferociousBite',
      'shred',
      'claw',
      'ferociousBite',
      'ferociousBite',
      'rip',
      'shred',
      'claw',
    ])
    // Rake still waits for your Rip to be off the boss, and Bite for Rip to be up, though Rip comes later.
    for (const id of ['rake', 'ferociousBite', 'rip', 'claw', 'faerieFire']) expect(conditionsOf(r, id), id).toEqual(conditionsOf(base, id))
    expect(conditionsOf(r, 'rake')[0]).toContainEqual({ code: COND.abilityAuraDown, a: 'rip', b: 0 })
    expect(conditionsOf(r, 'ferociousBite').flat()).toContainEqual({ code: COND.abilityAuraUp, a: 'rip', b: 0 })
  })

  it('takes the consumables just before the first row on the global cooldown, wherever it sits', () => {
    // Shred moved to the top: the consumables, then Shred, then the cooldowns. The potion still waits for Berserk.
    const r = rotation({}, moved('shred', 'berserk'))
    expect(ids(r).slice(0, 5)).toEqual(['mightyRagePotion', 'jujuFlurry', 'shred', 'berserk', 'tigersFury'])
    expect(conditionsOf(r, 'mightyRagePotion')).toEqual([[{ code: COND.abilityAuraUp, a: 'berserk', b: 0 }]])
    // Faerie Fire's early refresh still reads Shred's cost, and Claw still waits for Shred to be unusable.
    expect(conditionsOf(r, 'faerieFire')).toEqual(conditionsOf(rotation({}), 'faerieFire'))
    expect(conditionsOf(r, 'claw')).toEqual(conditionsOf(rotation({}), 'claw'))
    // Tiger's Fury moved below Rip is used after the consumables and the rows on the GCD above it.
    const late = rotation({}, moved('tigersFury', 'ferociousBite'))
    expect(ids(late).slice(0, 10)).toEqual(['berserk', 'mightyRagePotion', 'jujuFlurry', 'faerieFire', 'faerieFire', 'shred', 'claw', 'rip', 'tigersFury', 'ferociousBite'])
  })

  it('skips a row that’s off, and what reads it', () => {
    // Rip off: no Rip, and Bite's "only while Rip is up" and Rake's wait for it have nothing to read.
    const values = { [CAT_IDS.ripEnabled]: false, [CAT_IDS.rakeEnabled]: true, [CAT_IDS.biteRipUp]: true }
    const r = rotation(values, moved('rake', 'faerieFire'))
    expect(ids(r)).not.toContain('rip')
    expect(r.abilities.map((a) => a.id)).not.toContain('rip')
    expect(conditionsOf(r, 'rake')[0].map((c) => c.code)).not.toContain(COND.abilityAuraDown)
    expect(conditionsOf(r, 'ferociousBite').map((c) => c.map((x) => x.code))).not.toContainEqual(expect.arrayContaining([COND.abilityAuraUp]))
    // Shred off: no Shred anywhere, in Clearcasting's and Bite's lines too, and Claw builds without waiting for it.
    const clawOnly = rotation({ [CAT_IDS.shred]: false })
    expect(ids(clawOnly)).not.toContain('shred')
    expect(ids(clawOnly).filter((id) => id === 'claw')).toHaveLength(3)
    expect(conditionsOf(clawOnly, 'claw').at(-1)).toEqual([])
    // Tiger's Fury, Berserk and Faerie Fire off.
    const off = rotation({ [CAT_IDS.tfEnabled]: false, [CAT_IDS.berserk]: false, [CAT_IDS.ffEnabled]: false })
    expect(ids(off)).toEqual(DEFAULT_IDS.filter((id) => !['tigersFury', 'berserk', 'faerieFire'].includes(id)))
    // Without Berserk the potion goes at the pull.
    expect(conditionsOf(off, 'mightyRagePotion')).toEqual([[]])
  })

  it('reads a stored order: unknown ids dropped, a missing row at its default place', () => {
    const def = defaultAplOrder(CAT_APL)
    expect(normalizeAplOrder(CAT_APL, undefined)).toEqual(def)
    expect(normalizeAplOrder(CAT_APL, ['bogus', 3, 'rake'])).toEqual(def)
    // Rake first: the rest follow Berserk in their default order, Shred and Claw after Rake's default neighbours.
    expect(normalizeAplOrder(CAT_APL, ['rake', 'berserk'])).toEqual(['rake', ...def.filter((id) => id !== 'rake')])
    // Claw above Shred, the others in front of both.
    expect(normalizeAplOrder(CAT_APL, ['claw', 'shred'])).toEqual([...def.slice(0, -2), 'claw', 'shred'])
    // A row an order leaves out (as one added in a later version would be; here Clearcasting) goes
    // after its default neighbour, Faerie Fire, moved first, and past the rows after it that come
    // before it by default: between Tiger's Fury and Rip, where it was.
    const withoutCc = def.filter((id) => id !== 'clearcasting')
    expect(normalizeAplOrder(CAT_APL, moved('faerieFire', 'berserk', withoutCc))).toEqual(['faerieFire', 'berserk', 'racial', 'onUseItems', 'tigersFury', 'clearcasting', 'rip', 'ferociousBite', 'rake', 'shred', 'claw'])
    expect(storedAplOrder(CAT_APL, def)).toBeUndefined()
  })

  it('loads a setup saved before the list as it was, and plays a moved order differently', () => {
    const saved = { ...defaultConfig('druid-feral-cat'), rotation: { [CAT_IDS.biteCp]: 4, [CAT_IDS.rakeEnabled]: true } }
    const { config } = normalizeConfig(saved)
    expect(config.rotationOrder).toBeUndefined()
    expect(planJson(buildPlan(config).plan)).toBe(planJson(buildPlan({ ...saved, rotationOrder: defaultAplOrder(CAT_APL) }).plan))
    expect(rotationPreset(config)).toBe('custom')
    expect(rotationPreset(normalizeConfig(defaultConfig('druid-feral-cat')).config)).toBe(DEFAULT_APL_PRESET)
    // A stored default order is stored as none; a moved one is kept, and changes the fights.
    expect(normalizeConfig({ ...saved, rotationOrder: defaultAplOrder(CAT_APL) }).config.rotationOrder).toBeUndefined()
    const order = moved('ferociousBite', 'rip')
    expect(normalizeConfig({ ...saved, rotationOrder: order }).config.rotationOrder).toEqual(order)
    const run = (plan: Plan) => {
      const sim = new Sim(plan)
      return mergeChunk(emptyAggregate(plan.sources.length, plan.auras.length), runChunk(plan, 0, Math.min(CHUNK_SIZE, 200), sim)).dps.mean
    }
    const fixed = { ...defaultConfig('druid-feral-cat'), run: { mode: 'fixed' as const, iterations: 200, seed: 99 } }
    const none = buildPlan(fixed).plan
    // Rake is off by default, so moving it changes nothing it plays; Bite above Rip does.
    expect(run(buildPlan({ ...fixed, rotationOrder: moved('rake', 'faerieFire') }).plan)).toBe(run(none))
    expect(run(buildPlan({ ...fixed, rotationOrder: order }).plan)).not.toBe(run(none))
  })
})
