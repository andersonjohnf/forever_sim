// Which talents the sim can measure, for one setup (docs/optimizer.md#which-talents-matter, D30).
//
// A talent is taken off (rank 0) and put on (max rank) in a few contexts: the setup's own build,
// and a build with every talent at max (so a talent that only acts with another one, Improved
// Revenge with Revenge or Berserk with Mangle, shows up), each with the setup's rotation and any
// rotation variants the search tries. Then:
// 1. If the plan is the same with and without it in every context, it changes nothing: the engine
//    is a function of the plan alone. No fights are needed. (`none`)
// 2. Otherwise both plans run the same fights (common random numbers). If DPS and TPS are equal on
//    every fight in every context, it's `survival` when damage taken differs and `none` when not.
// 3. If DPS or TPS differs, it's `objective`, unless its paired change in score is below zero with
//    95% confidence in every context where it acts: then it's `harmful` (more health means less
//    rage from each hit taken, so Heart of the Wild costs a bear threat).
// It also notes which of the sheet's numbers the talent changes (health, armor, effective health,
// …), from the plans alone: a constraint that reads one makes the talent a search dimension
// (./talents.ts). The contexts' builds aren't legal ones (the plan builder doesn't need them to
// be); they only decide whether the talent does anything.
import { decodeTalentCode, encodeTalentCode, type TalentData, talentsInCodeOrder } from '@/data/talents/types'
import { buildPlan } from '../plan/build'
import type { Plan } from '../plan/types'
import type { RotationValue, SimConfig } from '../types'
import { SHEET_STATS, type SheetStat, sheetValues, type SheetValues } from './constraints'
import { type FightRunner, type FightSamples, type PlanSource, planKey } from './fights'
import { type Interval, meanInterval, type ObjectiveId, pairedInterval, scorer, upper } from './objective'
import type { TalentRole } from './talents'

export interface ScreenOptions {
  /** The setup: its build is the first context. */
  config: SimConfig
  data: TalentData
  runner: FightRunner
  objective: ObjectiveId
  /** Fights per plan (default 400). */
  fights?: number
  /** Rotation settings to screen under besides the setup's own (a search's rotation variants). */
  rotations?: readonly Record<string, RotationValue>[]
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export interface TalentVerdict {
  id: string
  name: string
  role: TalentRole
  /** Whether its plan changed in some context, and whether DPS or TPS, or damage taken, changed on some fight. */
  planChanges: boolean
  scoreChanges: boolean
  takenChanges: boolean
  /** The sheet's numbers it changes in some context (health, armor, effective health, …). */
  sheetStats: SheetStat[]
  /** Its paired change in score, max rank against none, in the first context where it acts (95%). */
  effect?: Interval
}

export interface TalentScreen {
  verdicts: TalentVerdict[]
  roles: Map<string, TalentRole>
  /** Fights run. */
  fights: number
}

/** Runs one plan's fights once, however many talents share it. */
class SampleCache {
  private readonly bySource = new Map<string, { source: PlanSource; samples?: Promise<FightSamples> }>()
  private readonly runner: FightRunner
  private readonly fights: number
  constructor(runner: FightRunner, fights: number) {
    this.runner = runner
    this.fights = fights
  }
  fightsRun = 0

  source(plan: Plan): string {
    const text = JSON.stringify(plan)
    if (!this.bySource.has(text)) this.bySource.set(text, { source: { key: planKey(), plan: () => plan } })
    return text
  }

  samples(text: string): Promise<FightSamples> {
    const entry = this.bySource.get(text)!
    if (!entry.samples) {
      entry.samples = this.runner.run(entry.source, 0, this.fights)
      this.fightsRun += this.fights
    }
    return entry.samples
  }
}

export async function screenTalents(options: ScreenOptions): Promise<TalentScreen> {
  const { config, data, objective, signal } = options
  const fights = options.fights ?? 400
  const talents = talentsInCodeOrder(data).flat()
  const own = decodeRanks(data, config.talents)
  const allMax = Object.fromEntries(talents.map((t) => [t.id, t.maxRank]))
  const rotations = [config.rotation, ...(options.rotations ?? []).map((r) => ({ ...config.rotation, ...r }))]
  const contexts = rotations.flatMap((rotation) => [own, allMax].map((ranks) => ({ ranks, rotation })))
  const cache = new SampleCache(options.runner, fights)
  const planFor = (ranks: Record<string, number>, rotation: Record<string, RotationValue>) => {
    const bundle = buildPlan({ ...config, talents: encodeTalentCode(data, ranks), rotation })
    return { text: cache.source(bundle.plan), sheet: sheetValues(bundle) }
  }

  // Each talent's plan pairs, off and on, per context, and the sheet stats that differ.
  const pairs = talents.map((t) =>
    contexts.map(({ ranks, rotation }) => {
      const off = planFor({ ...ranks, [t.id]: 0 }, rotation)
      const on = planFor({ ...ranks, [t.id]: t.maxRank }, rotation)
      return { off: off.text, on: on.text, sheet: changedStats(off.sheet, on.sheet) }
    }),
  )
  const differing = pairs.flat().filter((p) => p.off !== p.on)
  const texts = [...new Set(differing.flatMap((p) => [p.off, p.on]))]
  const results = new Map<string, FightSamples>()
  // A few runs in flight at a time (twice the runner's lanes, as the race keeps), each started only
  // if the search hasn't been cancelled, so a cancel stops the screen within a run or two a lane.
  await new Promise<void>((resolve, reject) => {
    let next = 0
    let done = 0
    let inFlight = 0
    let failed = false
    const fail = (error: unknown) => {
      if (failed) return
      failed = true
      signal?.removeEventListener('abort', onAbort)
      reject(error)
    }
    const onAbort = () => fail(abortError())
    signal?.addEventListener('abort', onAbort, { once: true })
    const pump = () => {
      if (failed) return
      if (done === texts.length) {
        signal?.removeEventListener('abort', onAbort)
        resolve()
        return
      }
      while (inFlight < Math.max(1, options.runner.lanes * 2) && next < texts.length) {
        if (signal?.aborted) return fail(abortError())
        const text = texts[next++]
        inFlight++
        cache.samples(text).then(
          (s) => {
            inFlight--
            if (failed) return
            results.set(text, s)
            done++
            options.onProgress?.(done, texts.length)
            pump()
          },
          (error) => {
            inFlight--
            fail(error)
          },
        )
      }
    }
    pump()
  })

  const verdicts: TalentVerdict[] = talents.map((t, ti) => {
    let planChanges = false
    let scoreChanges = false
    let takenChanges = false
    const effects: Interval[] = []
    const sheetStats = SHEET_STATS.filter((stat) => pairs[ti].some((p) => p.sheet.includes(stat)))
    for (const { off, on } of pairs[ti]) {
      if (off === on) continue
      planChanges = true
      const a = results.get(on)!
      const b = results.get(off)!
      let differs = false
      for (let k = 0; k < fights; k++) {
        if (a.dps[k] !== b.dps[k] || a.tps[k] !== b.tps[k]) differs = true
        if (a.taken[k] !== b.taken[k]) takenChanges = true
      }
      if (!differs) continue
      scoreChanges = true
      const score = scorer(objective, { dps: meanInterval(b.dps, fights).mean, tps: meanInterval(b.tps, fights).mean })
      const sa = new Float64Array(fights)
      const sb = new Float64Array(fights)
      for (let k = 0; k < fights; k++) {
        sa[k] = score(a.dps[k], a.tps[k])
        sb[k] = score(b.dps[k], b.tps[k])
      }
      effects.push(pairedInterval(sa, sb, fights))
    }
    const role: TalentRole = !scoreChanges
      ? takenChanges
        ? 'survival'
        : 'none'
      : effects.every((e) => upper(e) < 0)
        ? 'harmful'
        : 'objective'
    return { id: t.id, name: t.name, role, planChanges, scoreChanges, takenChanges, sheetStats, ...(effects.length ? { effect: effects[0] } : {}) }
  })
  return { verdicts, roles: new Map(verdicts.map((v) => [v.id, v.role])), fights: cache.fightsRun }
}

function abortError(): Error {
  return new DOMException('The optimizer was cancelled.', 'AbortError')
}

function changedStats(a: SheetValues, b: SheetValues): SheetStat[] {
  return SHEET_STATS.filter((stat) => a[stat] !== b[stat])
}

function decodeRanks(data: TalentData, code: string): Record<string, number> {
  // The setup's code is normalized already; a bad one screens against an empty build.
  try {
    return decodeTalentCode(data, code)
  } catch {
    return {}
  }
}
