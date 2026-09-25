// The Protection paladin presets' help numbers come from measurement (the paladin review's PR-5;
// paladin.md "Priority: Defensive, Balanced or Max TPS"): PROTECTION_PRESET_MEASURES holds what the
// help says, measured on seed 31101 over 100,000 fights, and this measures the default setup again
// on the same seed's first fights. A change that moves a preset's result fails here until its
// numbers are re-measured, so the help never quotes a stale figure.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'
import type { RotationValue } from '../../types'
import { aplPresets } from '../apl'
import { PROTECTION_APL, PROTECTION_IDS as ID, PROTECTION_OPTIONS, PROTECTION_PRESET_MEASURES as M } from './protection'

const FIGHTS = 4000

function measure(rotation: Record<string, RotationValue>) {
  const bundle = buildPlan({ ...defaultConfig('paladin-protection'), rotation, run: { mode: 'fixed', iterations: FIGHTS, seed: 31101 } })
  const sim = new Sim(bundle.plan)
  let agg = emptyAggregate(bundle.plan.sources.length, bundle.plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < FIGHTS; k++) agg = mergeChunk(agg, runChunk(bundle.plan, k, Math.min(CHUNK_SIZE, FIGHTS - k * CHUNK_SIZE), sim))
  const r = toResult(bundle, agg, 0)
  return { tps: r.tps.mean, dps: r.dps.mean, damageTaken: r.tank!.dtps.mean }
}

describe('the Protection presets’ help numbers (PR-5)', () => {
  const defensive = measure({ [ID.priority]: 'duties' })
  const maxTps = measure({ [ID.priority]: 'maxTps' })
  const hammer = measure({ [ID.hammerOfTheRighteous]: true })
  const pctOf = (x: number, base: number) => (x / base - 1) * 100

  it('Defensive’s TPS, DPS and damage taken are within 0.5% of the measured ones', () => {
    expect(Math.abs(pctOf(defensive.tps, M.defensive.tps))).toBeLessThan(0.5)
    expect(Math.abs(pctOf(defensive.dps, M.defensive.dps))).toBeLessThan(0.5)
    expect(Math.abs(pctOf(defensive.damageTaken, M.defensive.damageTaken))).toBeLessThan(0.5)
  })

  it('Max TPS and Hammer of the Righteous against Defensive are within 0.3 points of the measured ones', () => {
    for (const [got, want] of [
      [maxTps, M.maxTps],
      [hammer, M.hammerOfTheRighteous],
    ] as const) {
      expect(Math.abs(pctOf(got.tps, defensive.tps) - want.tpsPct)).toBeLessThan(0.3)
      expect(Math.abs(pctOf(got.dps, defensive.dps) - want.dpsPct)).toBeLessThan(0.3)
      expect(Math.abs(pctOf(got.damageTaken, defensive.damageTaken) - want.damageTakenPct)).toBeLessThan(0.3)
    }
  })

  it('the help quotes them: Defensive’s whole numbers, Max TPS’s whole percents, Hammer of the Righteous’s to a tenth', () => {
    const help = Object.fromEntries(aplPresets(PROTECTION_APL).map((p) => [p.id, `${p.summary ?? ''} ${p.help}`]))
    expect(help.defensive).toContain(`${Math.round(M.defensive.tps)} TPS, ${Math.round(M.defensive.dps)} DPS and ${Math.round(M.defensive.damageTaken)} damage taken a second`)
    expect(help.maxTps).toContain(`${M.maxTps.tpsPct.toFixed(0)}% more TPS and ${M.maxTps.dpsPct.toFixed(0)}% more DPS than Defensive, for ${M.maxTps.damageTakenPct.toFixed(0)}% more damage taken`)
    // Since the trainers' ranks (D36) Hammer of the Righteous costs a little DPS too: each change says its direction.
    expect(help.default).toContain('about 0.1% less DPS and 2.0% less TPS')
    const option = PROTECTION_OPTIONS.find((o) => o.id === ID.hammerOfTheRighteous)!
    expect(option.help).toContain('about 0.1% less DPS and 2.0% less TPS in the default setup')
  })
})
