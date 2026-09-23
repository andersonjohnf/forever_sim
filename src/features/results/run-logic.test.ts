import { describe, expect, it } from 'vitest'
import { defaultConfig, normalizeConfig, type CooldownResult, type SimConfig, type SimResult, type SpecId } from '@/sim'
import { TALENT_EFFECTS } from '@/sim/classes/warrior/talents'
import { BUFFS } from '@/sim/effects/buffs'
import { ENCHANTS } from '@/sim/effects/enchants'
import { ITEM_EFFECTS } from '@/sim/effects/items'
import { buildPlan } from '@/sim/plan/build'
import { headlineText, isSetupError, NEEDS_DAMAGE_TAKEN, neverHit, runConfigFromKey, runError } from './run-logic'

const config = (spec: SpecId, change: (c: SimConfig) => SimConfig = (c) => c) => normalizeConfig(change(defaultConfig(spec))).config

describe('isSetupError', () => {
  it('recognises every way the engine refuses a setup, so those errors skip the retry advice', () => {
    const skyborne = buildPlan(config('warrior-fury', (c) => ({ ...c, race: 'alliance-skyborne-high-order' }))).blockers
    expect(skyborne.length).toBeGreaterThan(0)
    for (const message of skyborne) expect(isSetupError(message), message).toBe(true)
    // Every class simulates now; one without a class module would get build.ts's other blocker.
    expect(isSetupError('Paladin simulation isn’t available yet.')).toBe(true)
  })

  it('treats other failures as ones a retry may fix', () => {
    expect(isSetupError('A simulation worker stopped unexpectedly.')).toBe(false)
    expect(isSetupError('The worker has no plan for this chunk.')).toBe(false)
    expect(isSetupError("Cannot read properties of undefined (reading 'x')")).toBe(false)
  })
})

describe('NEEDS_DAMAGE_TAKEN', () => {
  /** Aura ids put on the player by a proc that triggers when the player is hit, anywhere in `value`. */
  function damageTakenAuras(value: unknown, found = new Set<string>()): Set<string> {
    if (Array.isArray(value)) value.forEach((v) => damageTakenAuras(v, found))
    else if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>
      const action = o.action as { kind?: string; aura?: { id?: string } } | undefined
      if (o.trigger === 'damageTaken' && action?.kind === 'aura' && action.aura?.id) found.add(action.aura.id)
      Object.values(o).forEach((v) => damageTakenAuras(v, found))
    }
    return found
  }

  it('lists every buff that only triggers when you’re hit', () => {
    const talents = Object.values(TALENT_EFFECTS).flatMap((effects) => [1, 2, 3, 4, 5].flatMap((rank) => effects(rank)))
    const auras = damageTakenAuras([talents, ENCHANTS, Object.values(ITEM_EFFECTS), BUFFS])
    expect(auras.size).toBeGreaterThan(0)
    expect([...auras].filter((id) => !NEEDS_DAMAGE_TAKEN.has(id))).toEqual([])
  })
})

describe('neverHit', () => {
  const enrage: CooldownResult = { id: 'enrage', name: 'Enrage', icon: '', uptimePct: 0, castsPerFight: null }
  const fury = config('warrior-fury')

  it('explains Enrage at 0% when a DPS run took no damage', () => {
    expect(fury.fight.damageTakenPerSec).toBe(0)
    expect(neverHit(enrage, fury)).toBe(true)
  })

  it('shows the uptime once you take damage, for tanks, and for other rows', () => {
    const hit = { ...fury, fight: { ...fury.fight, damageTakenPerSec: 100 } }
    expect(neverHit(enrage, hit)).toBe(false)
    expect(neverHit({ ...enrage, uptimePct: 12.3 }, fury)).toBe(false)
    expect(neverHit(enrage, config('warrior-protection'))).toBe(false)
    expect(neverHit({ ...enrage, id: 'flurry', name: 'Flurry' }, fury)).toBe(false)
    expect(neverHit(enrage, null)).toBe(false)
  })
})

describe('runConfigFromKey', () => {
  it('reads back the setup a result was run for', () => {
    const fury = config('warrior-fury')
    expect(runConfigFromKey(JSON.stringify(fury))).toEqual(fury)
  })

  it('gives null for a missing or unreadable key', () => {
    expect(runConfigFromKey(null)).toBeNull()
    expect(runConfigFromKey('{')).toBeNull()
    expect(runConfigFromKey('"text"')).toBeNull()
    expect(runConfigFromKey('null')).toBeNull()
  })
})

describe('headlineText', () => {
  const summary = (mean: number) => ({ mean, stdev: 1, ci95: 0.5 })
  const result = (spec: SpecId) => ({ spec, dps: summary(682.46), tps: summary(1204.33) }) as unknown as SimResult

  it('reads DPS for a DPS spec, and TPS then DPS for a tank', () => {
    expect(headlineText(result('warrior-fury'))).toBe('682.5 DPS')
    expect(headlineText(result('warrior-protection'))).toBe('1,204.3 TPS and 682.5 DPS')
  })
})

describe('runError', () => {
  const skyborne = JSON.stringify(config('warrior-fury', (c) => ({ ...c, race: 'alliance-skyborne-high-order' })))
  const failed = { status: 'error', error: 'This setup can’t be simulated.', errorKey: skyborne }

  it('shows a failure while the setup is the one that failed', () => {
    expect(runError(failed, skyborne)).toBe('This setup can’t be simulated.')
  })

  it('clears it once the setup changes or on another spec, and brings it back for the same setup', () => {
    expect(runError(failed, JSON.stringify(config('warrior-fury')))).toBeNull()
    expect(runError(failed, JSON.stringify(config('warrior-arms')))).toBeNull()
    expect(runError(failed, skyborne)).toBe('This setup can’t be simulated.')
  })

  it('shows nothing unless the last run failed', () => {
    expect(runError({ ...failed, status: 'running' }, skyborne)).toBeNull()
    expect(runError({ ...failed, status: 'done' }, skyborne)).toBeNull()
  })
})
