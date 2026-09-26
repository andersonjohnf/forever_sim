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
import { PROTECTION_APL, PROTECTION_IDS as ID, PROTECTION_OPTIONS, PROTECTION_PRESET_MEASURES as M, PROTECTION_PRIORITY, protectionPresetText } from './protection'

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
    expect(help('defensive')).toContain('814 TPS, 369 DPS and 322 damage taken a second in the default setup')
    expect(presets.default.summary).toBe('Shield Block and 5 Sunders kept, no Thunder Clap or Shout: +6% TPS, +7% DPS, 22% more damage taken than Defensive.')
    expect(help('default')).toContain('Against Defensive in the default setup: 6.3% more TPS, 6.9% more DPS and 22% more damage taken.')
    expect(help('maxTps')).toContain('Against Balanced in the default setup: 1.3% more TPS, 0.1% more DPS and the same damage taken')
    expect(help('maxTps')).toContain('against Defensive, 7.7% more TPS, 7.0% more DPS and 22% more damage taken')
    expect(presets.maxTps.summary).toContain('about +1.3% TPS over Balanced for the same damage taken')
    // Heroic Strike's two thresholds in the units each is set in (FU-4).
    // Its extra threat is the Sunder Armor filler's; Heroic Strike's direction against Balanced comes from the two thresholds at 100 rage (JL-11, JU-2).
    expect(help('maxTps')).toContain('Balanced’s rotation with more of your rage on Sunder Armor: its filler from its cost')
    expect(help('maxTps')).toContain('Heroic Strike from 85 rage, later than Balanced’s 84% of your max rage (84 of the default 100), since rage kept for Sunder Armor makes more threat than Heroic Strike does.')
    expect(protectionPresetText(M, { maxTps: 45, balancedPct: 84 }).maxTps.help).toContain('Heroic Strike from 45 rage, sooner than Balanced’s 84% of your max rage (84 of the default 100). Like Balanced')
    expect(protectionPresetText(M, { maxTps: 84, balancedPct: 84 }).maxTps.help).toContain('Heroic Strike from 84 rage, where Balanced’s 84% of your max rage is at the default 100. Like Balanced')
    // Its advice matches its numbers: no more damage taken than Balanced (W4U-8).
    expect(help('maxTps')).toContain('It takes no more damage than Balanced for about 1.3% more threat: pick it when every bit of threat counts.')
  })

  it('takes every word of direction from the value (W4U-6): more, less, or the same under 0.5% damage taken', () => {
    const flipped = protectionPresetText({
      defensive: M.defensive,
      balanced: { tpsPct: -1.26, dpsPct: 0.02, damageTakenPct: -0.4 },
      maxTps: { tpsPct: 0.04, dpsPct: -5.56, damageTakenPct: -2.6 },
      maxTpsOverBalanced: { tpsPct: -0.44, dpsPct: 0.24, damageTakenPct: 0.6 },
    })
    expect(flipped.balanced.summary).toBe('Shield Block and 5 Sunders kept, no Thunder Clap or Shout: −1% TPS, the same DPS, the same damage taken as Defensive.')
    expect(flipped.balanced.help).toContain('Against Defensive in the default setup: 1.3% less TPS, the same DPS and the same damage taken.')
    expect(flipped.maxTps.summary).toContain('about −0.4% TPS over Balanced for 1% more damage taken.')
    expect(flipped.maxTps.help).toContain('Against Balanced in the default setup: 0.4% less TPS, 0.2% more DPS and 1% more damage taken; against Defensive, the same TPS, 5.6% less DPS and 3% less damage taken.')
    expect(flipped.maxTps.help).toContain('It takes 1% more damage than Balanced for about 0.4% less threat: pick it when another tank or the raid covers your survival.')
    // Less damage taken than Balanced reads as less, and the advice is threat's.
    const less = protectionPresetText({ ...M, maxTpsOverBalanced: { tpsPct: 0.44, dpsPct: -0.24, damageTakenPct: -0.7 } })
    expect(less.maxTps.help).toContain('It takes 1% less damage than Balanced for about 0.4% more threat: pick it when every bit of threat counts.')
    // Today's measures: every direction as measured, and 0.3% damage taken is the same.
    const today = protectionPresetText(M)
    expect(today.balanced.summary).toContain('+6% TPS, +7% DPS, 22% more damage taken than Defensive.')
    expect(today.maxTps.summary).toBe('Balanced, but the Sunder Armor filler from its cost: about +1.3% TPS over Balanced for the same damage taken.')
  })
})

describe('the Sunder Armor filler’s help (W4U-5)', () => {
  it('says 9 uses it whenever you can pay for it, with either talent build', () => {
    const filler = PROTECTION_OPTIONS.find((o) => o.id === ID.fillerMinRage)!
    expect(filler.help).toContain('At 9 it’s used whenever you can pay for it: 12 rage with the default talents, 9 with Improved Sunder Armor 3/3.')
    expect(filler.kind === 'number' && filler.default).toBe(9)
  })
})
