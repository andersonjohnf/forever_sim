// The Feral bear presets' help numbers come from measurement (druid.md §6.3 "Max TPS"):
// BEAR_PRESET_MEASURES holds what the help and the short lines say, measured on seed 28401 over
// 200,000 paired fights, and this measures the default setup again on the same seed's first fights.
// A change that moves a preset's result fails here until its numbers are re-measured, so the help
// never quotes a stale figure (as the Protection warrior's protection-presets.test.ts does).
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'
import type { RotationValue } from '../../types'
import { aplPresets } from '../apl'
import { BEAR_APL, BEAR_IDS as ID, BEAR_PRESET_MEASURES as M, BEAR_PRIORITY } from './bear'

const FIGHTS = 4000

function measure(rotation: Record<string, RotationValue>) {
  const bundle = buildPlan({ ...defaultConfig('druid-feral-bear'), rotation, run: { mode: 'fixed', iterations: FIGHTS, seed: 28401 } })
  const sim = new Sim(bundle.plan)
  let agg = emptyAggregate(bundle.plan.sources.length, bundle.plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < FIGHTS; k++) agg = mergeChunk(agg, runChunk(bundle.plan, k, Math.min(CHUNK_SIZE, FIGHTS - k * CHUNK_SIZE), sim))
  const r = toResult(bundle, agg, 0)
  return { tps: r.tps.mean, dps: r.dps.mean, damageTaken: r.tank!.dtps.mean }
}

describe('the Feral bear presets’ help numbers (CU-1)', () => {
  const defensive = measure({ [ID.priority]: BEAR_PRIORITY.duties })
  const balanced = measure({})
  const maxTps = measure({ [ID.priority]: BEAR_PRIORITY.maxTps })
  const pctOf = (x: number, base: number) => (x / base - 1) * 100

  it('Defensive’s TPS, DPS and damage taken are within 0.5% of the measured ones', () => {
    expect(Math.abs(pctOf(defensive.tps, M.defensive.tps))).toBeLessThan(0.5)
    expect(Math.abs(pctOf(defensive.dps, M.defensive.dps))).toBeLessThan(0.5)
    expect(Math.abs(pctOf(defensive.damageTaken, M.defensive.damageTaken))).toBeLessThan(0.5)
  })

  it('Balanced and Max TPS against Defensive, and Max TPS against Balanced, are within 0.3 points of the measured ones', () => {
    for (const [got, base, want] of [
      [balanced, defensive, M.balanced],
      [maxTps, defensive, M.maxTps],
      [maxTps, balanced, M.maxTpsOverBalanced],
    ] as const) {
      expect(Math.abs(pctOf(got.tps, base.tps) - want.tpsPct)).toBeLessThan(0.3)
      expect(Math.abs(pctOf(got.dps, base.dps) - want.dpsPct)).toBeLessThan(0.3)
      expect(Math.abs(pctOf(got.damageTaken, base.damageTaken) - want.damageTakenPct)).toBeLessThan(0.3)
    }
  })

  it('the help and the short lines quote them, with the directions they were measured in', () => {
    // The words are fixed: Balanced and Max TPS make more threat and damage than Defensive for more
    // damage taken; Max TPS makes more threat and less damage than Balanced for the same damage taken.
    expect(M.balanced.tpsPct > 0 && M.balanced.dpsPct > 0 && M.balanced.damageTakenPct > 0).toBe(true)
    expect(M.maxTps.tpsPct > 0 && M.maxTps.dpsPct > 0 && M.maxTps.damageTakenPct > 0).toBe(true)
    expect(M.maxTpsOverBalanced.tpsPct > 0 && M.maxTpsOverBalanced.dpsPct < 0 && Math.abs(M.maxTpsOverBalanced.damageTakenPct) < 0.5).toBe(true)
    const presets = Object.fromEntries(aplPresets(BEAR_APL).map((p) => [p.id, p]))
    expect(presets.default.summary).toBe('Faerie Fire kept, Demoralizing Roar dropped: +2.8% TPS, +2.6% DPS and 0.7% more damage taken than Defensive.')
    expect(presets.default.help).toContain('2.8% more TPS and 2.6% more DPS than Defensive in the default setup, for 0.7% more damage taken.')
    expect(presets.maxTps.summary).toBe('Balanced, but Mauls from 14 rage: +0.2% TPS, −0.2% DPS, the same damage taken (0.7% more than Defensive).')
    expect(presets.maxTps.help).toContain('Against Balanced in the default setup that’s 0.2% more TPS for 0.2% less DPS, and the same damage taken; against Defensive, 2.9% more TPS, 2.4% more DPS and 0.7% more damage taken.')
    // Defensive's help rounds to whole percents against Balanced: −2.7% TPS and −2.6% DPS.
    expect(presets.defensive.help).toContain('0.7% less damage taken than Balanced, for 3% less TPS and 3% less DPS in the default setup')
  })
})
