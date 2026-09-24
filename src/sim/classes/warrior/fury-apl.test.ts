// Fury's rotation as a priority list (decision D31; docs/classes/warrior.md §5.2 "The priority
// list"): the rows cover every setting, the compiler follows the stored order, a moved row keeps
// its own conditions, and the default order gives the same plan, fight for fight, as no order.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { MIGHTY_RAGE_POTION } from '../../effects/buffs'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { COND, type Plan } from '../../plan/types'
import { emptyAggregate, mergeChunk } from '../../run/aggregate'
import { defaultAplOrder, moveAplRow, normalizeAplOrder } from '../apl'
import { FURY_APL, FURY_OPTIONS, furyRotation } from './fury'
import { fingerprint, furyCases } from './fury-apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.warrior, defaultConfig('warrior-fury').talents)
const CONTEXT = { consumables: [MIGHTY_RAGE_POTION] }
const noAura = () => -1
type Rot = ReturnType<typeof furyRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const linesOf = (r: Rot, id: string) => r.rotation.filter((e) => r.abilities[e.ability].id === id)
const at = (r: Rot, id: string) => r.abilities.findIndex((a) => a.id === id)
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string) => {
  const order = defaultAplOrder(FURY_APL)
  return moveAplRow(FURY_APL, order, id, order.indexOf(before) - (order.indexOf(id) < order.indexOf(before) ? 1 : 0))!
}

describe('Fury’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    const known = new Set(FURY_OPTIONS.map((o) => o.id))
    const placed = new Set([...FURY_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...FURY_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    // A row's switch is a switch, and its summary reads its own settings.
    for (const row of FURY_APL.rows) {
      if (row.enabledId) expect(FURY_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    }
    expect(new Set(FURY_APL.rows.map((r) => r.id)).size).toBe(FURY_APL.rows.length)
    // Only the pre-pull is pinned, first.
    expect(FURY_APL.rows.filter((r) => r.pinned).map((r) => r.id)).toEqual(['prepull'])
    expect(FURY_APL.rows[0].id).toBe('prepull')
  })

  it('gives the same list in the default order as with none', () => {
    const none = furyRotation({}, TALENTS, noAura, CONTEXT)
    expect(furyRotation({}, TALENTS, noAura, CONTEXT, defaultAplOrder(FURY_APL))).toEqual(none)
    // warrior.md §5.2's order: rows 1–13 and 15 (Berserker Rage needs a talent the default build
    // skips), then the potion (16).
    expect(ids(none)).toEqual([
      'battleShout',
      'deathWish',
      'deathWish',
      'deathWish',
      'recklessness',
      'recklessness',
      'bloodrage',
      'bloodthirst',
      'execute',
      'bloodthirst',
      'whirlwind',
      'overpower',
      'overpower',
      'overpower',
      'heroicStrike',
      'mightyRagePotion',
      'mightyRagePotion',
      'mightyRagePotion',
    ])
  })

  it('gives 200 random setups the plan they had before the list, in the default order', () => {
    // Settings, talents, race, on-use items, consumables, phase and rules at random; the switch the
    // list added (row 6's) at its default, on, as it always was before. The snapshot is of the
    // rotation before the priority list (A1), checked byte for byte against it then: a change to
    // it is a change to what Fury plays.
    const before = FURY_OPTIONS.filter((o) => o.id !== 'warrior.fury.execute.bloodthirst')
    const hashes = furyCases(before, 200).map(({ values, talents, context }) => {
      const none = furyRotation(values, talents, noAura, context)
      expect(furyRotation(values, talents, noAura, context, defaultAplOrder(FURY_APL))).toEqual(none)
      return fingerprint(JSON.stringify(none))
    })
    expect(new Set(hashes).size).toBeGreaterThan(150)
    expect(hashes).toMatchSnapshot()
  })

  it('builds the list in the stored order', () => {
    // Whirlwind above Bloodthirst, and Execute above Bloodthirst in the execute phase.
    const order = moved('execute', 'executeBloodthirst')
    const r = furyRotation({}, TALENTS, noAura, CONTEXT, moveAplRow(FURY_APL, order, 'whirlwind', order.indexOf('bloodthirst'))!)
    expect(ids(r).slice(0, 11)).toEqual(['battleShout', 'deathWish', 'deathWish', 'deathWish', 'recklessness', 'recklessness', 'bloodrage', 'execute', 'bloodthirst', 'whirlwind', 'bloodthirst'])
    // The potion stays after the list, and the pre-pull is the same.
    expect(ids(r).slice(-3)).toEqual(['mightyRagePotion', 'mightyRagePotion', 'mightyRagePotion'])
    expect(r.prepull.casts.map((c) => r.abilities[c.ability].id)).toEqual(['battleShout', 'bloodrage'])
  })

  it('keeps a moved row’s own conditions: Whirlwind still waits on Bloodthirst, Hamstring stays GCD-safe for both', () => {
    const values = { 'warrior.fury.hamstring.enabled': true }
    const base = furyRotation(values, TALENTS, noAura, CONTEXT)
    const order = moved('hamstring', 'executeBloodthirst')
    const r = furyRotation(values, TALENTS, noAura, CONTEXT, moveAplRow(FURY_APL, order, 'whirlwind', order.indexOf('hamstring'))!)
    // Same conditions, read with each ability's index in its own list.
    const conditionsOf = (rot: Rot, id: string) =>
      linesOf(rot, id).map((e) =>
        e.conditions.map((c) => (c.code === COND.cooldownAtLeast ? { ...c, a: rot.abilities[c.a].id } : c.code === COND.gcdSafe ? { ...c, a: maskIds(rot, c.a) } : c)),
      )
    const maskIds = (rot: Rot, mask: number) => rot.abilities.filter((_, i) => mask & (1 << i)).map((a) => a.id).sort()
    expect(conditionsOf(r, 'whirlwind')).toEqual(conditionsOf(base, 'whirlwind'))
    expect(conditionsOf(r, 'hamstring')).toEqual(conditionsOf(base, 'hamstring'))
    expect(conditionsOf(r, 'hamstring')[0].find((c) => c.code === COND.gcdSafe)?.a).toEqual(['bloodthirst', 'whirlwind'])
    // Whirlwind is now ahead of Bloodthirst, and Bloodthirst still gets an index.
    expect(ids(r).indexOf('whirlwind')).toBeLessThan(ids(r).indexOf('bloodthirst'))
    expect(at(r, 'bloodthirst')).toBeGreaterThanOrEqual(0)
  })

  it('turns off Bloodthirst in the execute phase with its own switch (row 6), and what waits on it there', () => {
    const values = { 'warrior.fury.execute.bloodthirst': false, 'warrior.fury.execute.whirlwindInExecute': true }
    const r = furyRotation(values, new Map([...TALENTS, ['Improved Berserker Rage', 2]]), noAura, CONTEXT)
    const inExec = { code: COND.executePhase, a: 1, b: 0 }
    expect(linesOf(r, 'bloodthirst')).toHaveLength(1)
    expect(linesOf(r, 'bloodthirst')[0].conditions).toEqual([{ code: COND.executePhase, a: 0, b: 0 }])
    // Whirlwind in the phase doesn't wait for a Bloodthirst that never comes; the dance and
    // Berserker Rage there are GCD-safe for Whirlwind alone.
    const wwIn = linesOf(r, 'whirlwind').filter((e) => e.conditions.some((c) => c.code === inExec.code && c.a === 1))
    expect(wwIn).toHaveLength(1)
    expect(wwIn[0].conditions.some((c) => c.code === COND.cooldownAtLeast)).toBe(false)
    for (const id of ['overpower', 'berserkerRage']) {
      const lines = linesOf(r, id).filter((e) => e.conditions.some((c) => c.code === inExec.code && c.a === 1))
      expect(lines, id).toHaveLength(1)
      expect(lines[0].conditions.find((c) => c.code === COND.gcdSafe)?.a, id).toBe(1 << at(r, 'whirlwind'))
    }
  })

  it('plays the same fights with the default order stored as with none, and different ones reordered', () => {
    const config = { ...defaultConfig('warrior-fury'), run: { mode: 'fixed' as const, iterations: 200, seed: 99 } }
    const run = (plan: Plan) => {
      const sim = new Sim(plan)
      return mergeChunk(emptyAggregate(plan.sources.length, plan.auras.length), runChunk(plan, 0, Math.min(CHUNK_SIZE, 200), sim)).dps.mean
    }
    const none = buildPlan(config).plan
    expect(buildPlan({ ...config, rotationOrder: normalizeAplOrder(FURY_APL, undefined) }).plan).toEqual(none)
    const reordered = buildPlan({ ...config, rotationOrder: moved('hamstring', 'bloodthirst') }).plan
    // Hamstring is off by default, so moving it changes nothing it plays…
    expect(run(reordered)).toBe(run(none))
    // …while Heroic Strike ahead of Bloodthirst does (it's off the GCD, but spends the rage first).
    const hsFirst = buildPlan({ ...config, rotationOrder: moved('heroicStrike', 'executeBloodthirst') }).plan
    expect(run(hsFirst)).not.toBe(run(none))
  })
})
