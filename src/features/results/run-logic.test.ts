import { describe, expect, it } from 'vitest'
import { defaultConfig, normalizeConfig, WORKER_CRASH_MESSAGE, WORKER_HANG_MESSAGE, WORKER_START_MESSAGE, type CooldownResult, type SimConfig, type SimResult, type SpecId } from '@/sim'
import { TALENT_EFFECTS } from '@/sim/classes/warrior/talents'
import { BUFFS } from '@/sim/effects/buffs'
import { ENCHANTS } from '@/sim/effects/enchants'
import { ITEM_EFFECTS } from '@/sim/effects/items'
import { buildPlan } from '@/sim/plan/build'
import { breakdownRows, carriesItsOwnAdvice, headlineText, isSetupError, NEEDS_DAMAGE_TAKEN, neverHit, runConfigFromKey, runError, runOutcomeMessage } from './run-logic'

const config = (spec: SpecId, change: (c: SimConfig) => SimConfig = (c) => c) => normalizeConfig(change(defaultConfig(spec))).config

describe('isSetupError', () => {
  it('recognises every way the engine refuses a setup, so those errors skip the retry advice', () => {
    // A hunter with no ranged weapon (build.ts); every race of every class has a base row now (D36).
    const noRanged = buildPlan(config('hunter-marksmanship', (c) => ({ ...c, gear: {} }))).blockers
    expect(noRanged.length).toBeGreaterThan(0)
    for (const message of noRanged) expect(isSetupError(message), message).toBe(true)
    // A race and class with no base row, measured or placeholder: none the UI offers (a saved setup
    // is normalized to a race the class can be), but the engine keeps the refusal.
    const noRow = buildPlan({ ...defaultConfig('paladin-retribution'), race: 'alliance-night-elf' }).blockers
    expect(noRow.length).toBeGreaterThan(0)
    for (const message of noRow) expect(isSetupError(message), message).toBe(true)
    // Every class simulates now; one without a class module would get build.ts's other blocker.
    expect(isSetupError('Paladin simulation isn’t available yet.')).toBe(true)
  })

  it('treats other failures as ones a retry may fix', () => {
    expect(isSetupError('The simulation stopped unexpectedly.')).toBe(false)
    expect(isSetupError('The worker has no plan for this chunk.')).toBe(false)
    expect(isSetupError("Cannot read properties of undefined (reading 'x')")).toBe(false)
  })
})

describe('carriesItsOwnAdvice', () => {
  it('skips the retry advice for setup refusals and a hung or unstartable worker, which already say what to do', () => {
    expect(carriesItsOwnAdvice(WORKER_HANG_MESSAGE)).toBe(true)
    expect(carriesItsOwnAdvice(WORKER_START_MESSAGE)).toBe(true)
    expect(carriesItsOwnAdvice('Paladin simulation isn’t available yet.')).toBe(true)
    expect(carriesItsOwnAdvice(WORKER_CRASH_MESSAGE)).toBe(false)
    expect(isSetupError(WORKER_START_MESSAGE)).toBe(false)
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

// What the live region says when a run ends (docs/ux.md#states "Running").
describe('runOutcomeMessage', () => {
  const summary = (mean: number) => ({ mean, stdev: 1, ci95: 0.5 })
  const fury = { spec: 'warrior-fury', dps: summary(682.46), tps: summary(0) } as unknown as SimResult
  const base = { status: 'done', error: null, result: fury, desktop: true }

  it('says a run is done, or was cancelled', () => {
    expect(runOutcomeMessage(base)).toBe('Done: 682.5 DPS')
    expect(runOutcomeMessage({ ...base, status: 'idle', result: null })).toBe('Simulation cancelled.')
  })

  it('reads a failure on a phone; on desktop the panel’s alert does', () => {
    const failed = { ...base, status: 'error', error: 'This setup can’t be simulated.', result: null }
    expect(runOutcomeMessage(failed)).toBe('')
    expect(runOutcomeMessage({ ...failed, desktop: false })).toBe('Couldn’t simulate: This setup can’t be simulated. Open the results for details.')
  })
})

describe('runError', () => {
  const noRanged = JSON.stringify(config('hunter-marksmanship', (c) => ({ ...c, gear: {} })))
  const failed = { status: 'error', error: 'This setup can’t be simulated.', errorKey: noRanged }

  it('shows a failure while the setup is the one that failed', () => {
    expect(runError(failed, noRanged)).toBe('This setup can’t be simulated.')
  })

  it('clears it once the setup changes or on another spec, and brings it back for the same setup', () => {
    expect(runError(failed, JSON.stringify(config('hunter-marksmanship')))).toBeNull()
    expect(runError(failed, JSON.stringify(config('hunter-beast-mastery', (c) => ({ ...c, gear: {} }))))).toBeNull()
    expect(runError(failed, noRanged)).toBe('This setup can’t be simulated.')
  })

  it('shows nothing unless the last run failed', () => {
    expect(runError({ ...failed, status: 'running' }, noRanged)).toBeNull()
    expect(runError({ ...failed, status: 'done' }, noRanged)).toBeNull()
  })
})

describe('breakdownRows (docs/ux.md#results)', () => {
  const row = (id: string, damage: number, hitId?: string) => ({ id, damage, ...(hitId ? { bleed: { hitId } } : {}) })
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

  it('orders rows by the metric and puts a bleed with a hit of its own right after that hit', () => {
    const rows = [row('shred', 500), row('rakeBleed', 90, 'rake'), row('rip', 300), row('rake', 40), row('rend', 20), row('none', 0)]
    expect(ids(breakdownRows(rows, (r) => r.damage))).toEqual(['shred', 'rip', 'rake', 'rakeBleed', 'rend'])
  })

  it('keeps a bleed in its own place when its hit adds nothing to the metric', () => {
    const rows = [row('shred', 500), row('rakeBleed', 90, 'rake'), row('rake', 0)]
    expect(ids(breakdownRows(rows, (r) => r.damage))).toEqual(['shred', 'rakeBleed'])
  })
})
