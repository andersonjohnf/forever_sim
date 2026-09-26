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
import { BEAR_APL, BEAR_IDS as ID, BEAR_PRESET_MEASURES as M, BEAR_PRIORITY, bearPresetText } from './bear'

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

  it('the help and the short lines quote them, every direction from its value', () => {
    const presets = Object.fromEntries(aplPresets(BEAR_APL).map((p) => [p.id, p]))
    expect(presets.default.summary).toBe('Faerie Fire kept, Demoralizing Roar dropped: +3.3% TPS, +3.1% DPS and 1.3% more damage taken than Defensive.')
    expect(presets.default.help).toContain('3.3% more TPS and 3.1% more DPS than Defensive in the default setup, for 1.3% more damage taken.')
    // Since the boss melee of 2026-09-26 no Maul threshold makes more threat than Balanced's 20, so Max TPS keeps it and plays as Balanced (druid.md §6.3 "Max TPS", JL-1).
    expect(presets.maxTps.summary).toBe('Plays as Balanced: Mauls from 20 rage too, as no other threshold makes more threat; 1.3% more damage taken than Defensive.')
    expect(presets.maxTps.help).toContain('so it Mauls from 20 too and plays as Balanced: against Defensive, 3.3% more TPS, 3.1% more DPS and 1.3% more damage taken.')
    // A Max TPS level with Balanced at another threshold reads "the same TPS", not "±0.0%" (± is an interval elsewhere; JU-3), and says it once.
    const level = bearPresetText({ ...M, maxTps: { tpsPct: 3.29, dpsPct: 2.56, damageTakenPct: 1.16 }, maxTpsOverBalanced: { tpsPct: -0.007, dpsPct: -0.53, damageTakenPct: -0.1 } }, { maxTps: 16, balanced: 20 })
    expect(level.maxTps.summary).toBe('Balanced, but Mauls from 16 rage: the same TPS, −0.5% DPS, the same damage taken (1.2% more than Defensive).')
    expect(level.maxTps.help).toContain('and Mauls from 16 rage rather than Balanced’s 20. Against Balanced in the default setup that’s the same TPS and 0.5% less DPS, and the same damage taken; against Defensive, 3.3% more TPS, 2.6% more DPS and 1.2% more damage taken. The Buffs tab’s')
    expect(presets.defensive.help).toContain('1.2% less damage taken than Balanced, for 3.2% less TPS and 3.0% less DPS in the default setup')
    // A Max TPS ahead or behind reads so, and advises so.
    const ahead = bearPresetText({ ...M, maxTpsOverBalanced: { tpsPct: 0.16, dpsPct: -0.16, damageTakenPct: -0.02 } }, { maxTps: 14, balanced: 20 })
    expect(ahead.maxTps.summary).toContain(': +0.2% TPS, −0.2% DPS, the same damage taken (')
    expect(ahead.maxTps.help).toContain('0.2% more TPS and 0.2% less DPS, and the same damage taken')
    expect(ahead.maxTps.help).toContain('Pick it when threat is all that matters')
    const behind = bearPresetText({ ...M, maxTpsOverBalanced: { tpsPct: -0.3, dpsPct: 0.2, damageTakenPct: 0.8 } }, { maxTps: 14, balanced: 20 })
    expect(behind.maxTps.summary).toContain(': −0.3% TPS, +0.2% DPS, 0.8% more damage taken (')
    expect(behind.maxTps.help).toContain('In the default setup Balanced makes more threat.')
  })
})
