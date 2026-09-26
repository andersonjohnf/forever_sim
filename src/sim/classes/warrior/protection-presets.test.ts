// The Protection warrior presets' help numbers come from measurement (the final pre-release review's
// FU-3; warrior.md §5.4 "Build 1.60.1.70009"): PROTECTION_PRESET_MEASURES holds what the help and the
// short lines say, measured on seed 31101 over 100,000 paired fights, and this measures the default
// setup again on the same seed's first fights. A change that moves a preset's result fails here until
// its numbers are re-measured, so the help never quotes a stale figure.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'
import type { RotationValue } from '../../types'
import { aplPresets } from '../apl'
import { PROTECTION_APL, PROTECTION_IDS as ID, PROTECTION_PRESET_MEASURES as M, PROTECTION_PRIORITY } from './protection'

const FIGHTS = 4000

function measure(rotation: Record<string, RotationValue>) {
  const bundle = buildPlan({ ...defaultConfig('warrior-protection'), rotation, run: { mode: 'fixed', iterations: FIGHTS, seed: 31101 } })
  const sim = new Sim(bundle.plan)
  let agg = emptyAggregate(bundle.plan.sources.length, bundle.plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < FIGHTS; k++) agg = mergeChunk(agg, runChunk(bundle.plan, k, Math.min(CHUNK_SIZE, FIGHTS - k * CHUNK_SIZE), sim))
  const r = toResult(bundle, agg, 0)
  return { tps: r.tps.mean, dps: r.dps.mean, damageTaken: r.tank!.dtps.mean }
}

describe('the Protection warrior presets’ help numbers (FU-3)', () => {
  const defensive = measure({ [ID.priority]: PROTECTION_PRIORITY.defensive })
  const balanced = measure({})
  const maxTps = measure({ [ID.priority]: PROTECTION_PRIORITY.maxTps })
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

  it('the help and the short lines quote them', () => {
    const presets = Object.fromEntries(aplPresets(PROTECTION_APL).map((p) => [p.id, p]))
    const help = (id: string) => `${presets[id].summary ?? ''} ${presets[id].help}`
    expect(help('defensive')).toContain('925 TPS, 386 DPS and 616 damage taken a second in the default setup')
    expect(presets.default.summary).toBe('Shield Block and 5 Sunders kept, no Thunder Clap or Shout: +6% TPS, +6% DPS, 21% more damage taken than Defensive.')
    expect(help('default')).toContain('Against Defensive in the default setup: 6.4% more TPS, 5.8% more DPS and 21% more damage taken.')
    expect(help('maxTps')).toContain('Against Balanced in the default setup: 0.4% more TPS, 0.2% less DPS and the same damage taken')
    expect(help('maxTps')).toContain('against Defensive, 6.9% more TPS, 5.6% more DPS and 21% more damage taken')
    expect(presets.maxTps.summary).toContain('about +0.4% TPS over Balanced for the same damage taken')
    // Heroic Strike's two thresholds in the units each is set in (FU-4).
    expect(help('maxTps')).toContain('Heroic Strike from 45 rage rather than 84% of your max rage')
  })
})
