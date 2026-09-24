// Rotation tuning: paired comparisons of rotation settings against a baseline, on the real engine
// (decision D23; docs/classes/warrior.md §5.3 and docs/classes/druid.md §6.2, §6.3, "Tuning the defaults").
//
// Every candidate runs the same fights as the baseline: the same config seed and fight indices, so
// the same fight lengths and random streams (common random numbers). Each fight gives a paired
// difference, candidate DPS − baseline DPS, and the report is the mean difference with its 95%
// confidence interval (± 1.96 standard errors of the paired differences). A candidate clears D23's
// bar when the whole interval is above zero. Tank specs are compared on TPS by default (D23), and the
// report adds each candidate's paired Δ DPS beside it, since tanks report both (D18), and its Δ
// damage taken (the health the boss's swings cost a second), since a tank's duties are weighed on it
// (D26).
//
// The engine is bundled from src/ with Vite (the same modules the app and the tests run, with the
// full data) into .cache/tune/<hash>/engine.mjs, where <hash> is a digest of every file under src/.
// So a run always uses the current source: it reuses the bundle while src/ is unchanged and builds
// a new one when anything in it changes. Each build goes to its own temporary folder, renamed into
// place when it's done, so concurrent runs never clobber each other. Bundles unused for a day are
// removed. The fights are split over worker threads; results don't depend on the worker count.
//
//   node scripts/tune/rotation.mjs heroicStrike.minRage=55                 # one candidate against the defaults
//   node scripts/tune/rotation.mjs --sweep heroicStrike.minRage=40:70:5    # one candidate per value
//   node scripts/tune/rotation.mjs --sweep a=1:3:1 --sweep b=x|y           # the cartesian product of the sweeps
//   node scripts/tune/rotation.mjs "heroicStrike.minRage=55,whirlwind.enabled=true" whirlwind.enabled=true
//   node scripts/tune/rotation.mjs --base heroicStrike.minRage=55 --sweep spearingStrike.minRageOtherTargets=30:60:5
//   node scripts/tune/rotation.mjs --against main                           # the defaults against main's
//   node scripts/tune/rotation.mjs --spec druid-feral-cat --sweep ferociousBite.minComboPoints=3:5:1
//   node scripts/tune/rotation.mjs --spec paladin-retribution --creature undead exorcism.minManaPct=40
//   node scripts/tune/rotation.mjs --spec paladin-protection --metric tps consecration.minManaPct=50
//   node scripts/tune/rotation.mjs --spec druid-feral-bear --sweep maul.minRage=10:40:5
//   node scripts/tune/rotation.mjs --spec druid-feral-bear --raid=-warrior lacerate.refreshBelowSec=3
//   node scripts/tune/rotation.mjs --spec shaman-elemental talents=5504301500103031-055-05005
//
// A setting is `id=value`. An id is either a full setting id of the spec, or one without the spec's
// prefix, which the tool works out from the spec's own setting ids (`warrior.arms.` for Arms, so
// `heroicStrike.minRage` is `warrior.arms.heroicStrike.minRage`; `warrior.protection.` for
// Protection, `druid.cat.` for the Feral cat, `druid.bear.` for the Feral bear,
// `paladin.retribution.` for Retribution, `paladin.protection.` for Protection paladins). Values
// are numbers, true/false, or a choice's value. A candidate's settings are separated by commas.
// `talents=<build code>` is a setting too: that candidate's talents instead of the spec's default
// build (docs/data/talents.md), so builds are compared on the same fights as settings are.
// `--base` changes the baseline from the spec's defaults, and each candidate is applied on top of it.
//
// `--against <commit>` runs the baseline on the engine and defaults of another commit (any git
// ref, bundled from its src/), so a change of semantics can be compared with the rotation it
// replaces, fight by fight on the same seeds. Then `--base` applies to the baseline only (in that
// commit's settings), each candidate is the current defaults plus its own settings, and with no
// candidates given, the candidate is the current defaults.
//
// Options (numbers are checked against the app's own limits):
//   --spec warrior-arms   the spec (a SpecId with rotation settings: warrior-fury, warrior-arms, warrior-protection, druid-feral-cat,
//                         paladin-retribution, paladin-protection)
//   --fights 40000        fights per candidate, a whole number (rounded up to a multiple of the job size, 500)
//   --seed 1              the config seed, 0 to 4294967295 (fight i uses the seed and i, so a new seed gives new fights)
//   --race <id>           the race (default: the spec's default, e.g. alliance-human); its faction's gear
//   --duration <s>        fight length (default 180; the Fight tab's range)
//   --armor <n>           boss armor before debuffs (default 3731)
//   --execute <pct>       execute phase (default 20; 0 for none)
//   --creature <type>     target creature type (default none)
//   --position <side>     behind or front (default: the spec's, behind for DPS)
//   --profile <id>        the rules profile, forever or classicEra (default forever)
//   --raid <classes>      the raid's classes (default: the spec's default raid): a comma-separated list
//                         (warrior,druid,...), or changes to the default (-warrior drops the warriors,
//                         +warlock adds one). Buffs nobody left in the raid brings are turned off, as the
//                         Buffs tab does, and listed; the rest of the default buffs stay.
//   --buffs-off <ids>     Buffs switches to turn off, comma-separated (e.g. thunderClap,demoralizingShout: nobody
//                         else in the raid keeps them up); each must be on in the spec's default setup
//   --metric dps|tps      what to compare (default: tps for a tank spec, dps otherwise)
//   --workers <n>         worker threads (default: available cores − 1)
//   --against <commit>    the baseline is that commit's engine and defaults (see above)
//   --help                this text
import { availableParallelism } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { engineBundle, flagNumber, fmt, label, parseSettings, printHelp, raidBuffs, refBundle, settingIds, sweepProduct, TALENTS, validate, Z95 } from './lib.mjs'

/** Fights per job handed to a worker. */
const JOB = 500

/** The engine modules the tool needs, re-exported from one virtual entry and bundled with Vite (lib.mjs). */
const ENTRY_SOURCE = `
export { defaultConfig } from '@/sim/defaults'
export { buildPlan } from '@/sim/plan/build'
export { Sim } from '@/sim/engine/sim'
export { rotationOptions } from '@/sim/classes/rotation'
export { normalizeConfig } from '@/sim/config/normalize'
export { SPEC_IDS, SPEC_META } from '@/sim/specs'
export { FULL_RAID } from '@/sim/defaults'
export { BUFFS } from '@/sim/effects/buffs'
export { buffProvided } from '@/sim/effects/presets'
`

/** What a baseline from another commit needs (`--against`): the modules every version has. */
const REF_ENTRY_SOURCE = `
export { defaultConfig } from '@/sim/defaults'
export { buildPlan } from '@/sim/plan/build'
export { Sim } from '@/sim/engine/sim'
export { rotationOptions } from '@/sim/classes/rotation'
`

// ---------------------------------------------------------------------------------------------
// Worker: builds each candidate's plan once, then runs the fights of each job it's sent.

if (!isMainThread) {
  // Config i runs on engine engineOf[i]: the baseline's (another commit's with --against) or this one's.
  const { bundles, engineOf, configs, metric } = workerData
  const engines = await Promise.all(bundles.map((b) => import(pathToFileURL(b).href)))
  const sims = configs.map((config, i) => {
    const engine = engines[engineOf[i]]
    const bundle = engine.buildPlan(config)
    if (bundle.blockers.length > 0) throw new Error(bundle.blockers[0])
    return new engine.Sim(bundle.plan)
  })
  const tps = (sim) => sim.fightThreat / (sim.fightMs / 1000)
  const dps = (sim) => sim.fightDamage / (sim.fightMs / 1000)
  // A tank's health lost to the boss's swings a second (the results' damage taken, encounter §5).
  const dtps = (sim) => sim.fightDamageTaken / (sim.fightMs / 1000)
  // The compared metric, and the other one beside it (a tank's Δ DPS, D18), and its damage taken.
  const [read, other] = metric === 'tps' ? [tps, dps] : [dps, tps]
  parentPort.on('message', ({ from, to }) => {
    // Per config: sum of its metric, and (candidates) sum and sum of squares of the paired difference,
    // of the metric and of the other one.
    const sum = new Float64Array(configs.length)
    const sumSq = new Float64Array(configs.length)
    const dSum = new Float64Array(configs.length)
    const dSq = new Float64Array(configs.length)
    const oSum = new Float64Array(configs.length)
    const oSq = new Float64Array(configs.length)
    const tSum = new Float64Array(configs.length)
    const tSq = new Float64Array(configs.length)
    for (let i = from; i < to; i++) {
      sims[0].runFight(i)
      const base = read(sims[0])
      const baseOther = other(sims[0])
      const baseTaken = dtps(sims[0])
      sum[0] += base
      sumSq[0] += base * base
      for (let c = 1; c < sims.length; c++) {
        sims[c].runFight(i)
        const x = read(sims[c])
        const d = x - base
        const o = other(sims[c]) - baseOther
        const t = dtps(sims[c]) - baseTaken
        sum[c] += x
        sumSq[c] += x * x
        dSum[c] += d
        dSq[c] += d * d
        oSum[c] += o
        oSq[c] += o * o
        tSum[c] += t
        tSq[c] += t * t
      }
    }
    parentPort.postMessage({ n: to - from, sum, sumSq, dSum, dSq, oSum, oSq, tSum, tSq })
  })
  parentPort.postMessage({ ready: true })
}

// ---------------------------------------------------------------------------------------------
// Main thread.

async function main() {
  const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      spec: { type: 'string', default: 'warrior-arms' },
      fights: { type: 'string', default: '40000' },
      seed: { type: 'string', default: '1' },
      race: { type: 'string' },
      duration: { type: 'string' },
      armor: { type: 'string' },
      execute: { type: 'string' },
      creature: { type: 'string' },
      position: { type: 'string' },
      profile: { type: 'string' },
      raid: { type: 'string' },
      'buffs-off': { type: 'string', default: '' },
      metric: { type: 'string' },
      base: { type: 'string', default: '' },
      sweep: { type: 'string', multiple: true, default: [] },
      workers: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
      against: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (args.help) {
    // The header comment above is the manual.
    printHelp(import.meta.url)
    return
  }

  const bundle = await engineBundle(ENTRY_SOURCE)
  const engine = await import(pathToFileURL(bundle).href)
  const ref = args.against === undefined ? null : await refBundle(args.against, REF_ENTRY_SOURCE)
  const refEngine = ref ? await import(pathToFileURL(ref.bundle).href) : engine

  const specId = args.spec
  if (!engine.SPEC_IDS.includes(specId)) throw new Error(`--spec must be one of ${engine.SPEC_IDS.join(', ')}, got "${specId}"`)
  const options = engine.rotationOptions(specId)
  if (options.length === 0) throw new Error(`${specId} has no rotation settings to tune`)
  const spec = settingIds(options)
  const prefix = spec.prefix
  // --base is the baseline's: with --against, that commit's settings.
  const baseOptions = refEngine.rotationOptions(specId)
  const base = parseSettings(args.base, ref ? settingIds(baseOptions) : spec)
  validate(base, baseOptions)

  const candidates = positionals.map((p) => parseSettings(p, spec))
  if (args.sweep.length > 0) candidates.push(...sweepProduct(args.sweep, spec))
  // Against another commit, the current defaults are the candidate when none is given.
  if (candidates.length === 0 && ref) candidates.push([])
  if (candidates.length === 0) throw new Error('No candidates: give settings, or --sweep')
  for (const c of candidates) validate(c, options)

  const requested = flagNumber('fights', args.fights, { min: 1, whole: true })
  const seed = flagNumber('seed', args.seed, { min: 0, max: 0xffffffff, whole: true })
  const workerCount = flagNumber('workers', args.workers, { min: 1, whole: true })
  // A tank spec's default metric is TPS (D23), a DPS spec's DPS.
  const metric = args.metric ?? (engine.SPEC_META[specId].role === 'tank' ? 'tps' : 'dps')
  if (metric !== 'dps' && metric !== 'tps') throw new Error(`--metric must be dps or tps, got "${metric}"`)
  const otherMetric = metric === 'tps' ? 'dps' : 'tps'
  const showOther = engine.SPEC_META[specId].role === 'tank'

  const d = engine.defaultConfig(specId, args.race)
  const fight = { ...d.fight }
  if (args.duration !== undefined) fight.durationSec = flagNumber('duration', args.duration)
  if (args.armor !== undefined) fight.bossArmor = flagNumber('armor', args.armor)
  if (args.execute !== undefined) fight.executePct = flagNumber('execute', args.execute)
  if (args.creature !== undefined) fight.creatureType = args.creature
  if (args.position !== undefined) fight.position = args.position
  const rules = args.profile === undefined ? d.rules : { ...d.rules, profile: args.profile }
  // Raid composition, not the rotation (D23): the same Buffs for every config.
  // The raid (--raid): its buffs follow it, as the Buffs tab's class buttons do; then --buffs-off.
  const raid = raidBuffs(engine, d, args.raid)
  const buffsOff = args['buffs-off'] ? args['buffs-off'].split(',').map((b) => b.trim()) : []
  for (const b of buffsOff) if (!d.buffs.enabled.includes(b)) throw new Error(`--buffs-off: ${b} isn't on in ${specId}'s default setup (${d.buffs.enabled.join(', ')})`)
  const buffs = { raid: raid.raid, enabled: raid.enabled.filter((b) => !buffsOff.includes(b)) }
  const config = (settings) => ({
    ...d,
    ...Object.fromEntries(settings.filter(([id]) => id === TALENTS)),
    buffs,
    fight,
    rules,
    rotation: Object.fromEntries(settings.filter(([id]) => id !== TALENTS)),
    run: { mode: 'fixed', iterations: 0, seed },
  })
  // The app's own checks for the rest (the race, the fight's ranges, the creature type): a setup it
  // would repair is refused.
  const { warnings } = engine.normalizeConfig({ ...config(base), run: { ...d.run, mode: 'fixed', seed } })
  if (warnings.length > 0) throw new Error(warnings.join('\n'))
  // Against another commit, each candidate is the current defaults plus its own settings.
  const configs = [config(base), ...candidates.map((c) => config(ref ? c : [...base, ...c]))]
  const bundles = ref ? [ref.bundle, bundle] : [bundle]
  const engineOf = configs.map((_, i) => (ref && i > 0 ? 1 : 0))

  const fights = Math.ceil(requested / JOB) * JOB
  const workers = Math.min(workerCount, fights / JOB)
  const zeros = () => new Float64Array(configs.length)
  const totals = { n: 0, sum: zeros(), sumSq: zeros(), dSum: zeros(), dSq: zeros(), oSum: zeros(), oSq: zeros(), tSum: zeros(), tSq: zeros() }

  const setup = [
    `${specId}, ${d.race}`,
    `${fight.durationSec} s ± ${fight.durationVariationPct}%`,
    `armor ${fight.bossArmor}`,
    `execute ${fight.executePct}%`,
    `creature ${fight.creatureType}`,
    `${fight.position}`,
    `profile ${rules.profile}`,
    ...(args.raid === undefined ? [] : [`raid ${raid.raid.join(',')}${raid.dropped.length ? ` (off: ${raid.dropped.join(', ')})` : ''}`]),
    ...(buffsOff.length ? [`Buffs off: ${buffsOff.join(', ')}`] : []),
    `seed ${seed}`,
    `${fights} fights per candidate, paired`,
  ].join('; ')
  console.log(setup)
  const defaults = ref ? `the defaults at ${args.against} (${ref.commit.slice(0, 7)})` : 'the defaults'
  console.log(`baseline: ${base.length ? `${defaults} with ${label(base, prefix)}` : defaults}`)
  if (ref) console.log('candidates: the current defaults, with their settings')

  const start = performance.now()
  let next = 0
  await Promise.all(
    Array.from({ length: workers }, () => {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { bundles, engineOf, configs, metric } })
      return new Promise((done, fail) => {
        const dispatch = () => {
          if (next >= fights) return worker.terminate().then(() => done())
          const from = next
          next += JOB
          worker.postMessage({ from, to: from + JOB })
        }
        worker.on('error', fail)
        worker.on('message', (m) => {
          if (!m.ready) {
            totals.n += m.n
            for (let c = 0; c < configs.length; c++) {
              totals.sum[c] += m.sum[c]
              totals.sumSq[c] += m.sumSq[c]
              totals.dSum[c] += m.dSum[c]
              totals.dSq[c] += m.dSq[c]
              totals.oSum[c] += m.oSum[c]
              totals.oSq[c] += m.oSq[c]
              totals.tSum[c] += m.tSum[c]
              totals.tSq[c] += m.tSq[c]
            }
          }
          dispatch()
        })
      })
    }),
  )
  const seconds = (performance.now() - start) / 1000

  const n = totals.n
  const mean = (c) => totals.sum[c] / n
  const halfWidth = (s, sq) => Z95 * Math.sqrt(Math.max(0, (sq - (s * s) / n) / (n - 1)) / n)
  const baseMean = mean(0)
  console.log(`baseline ${metric.toUpperCase()}: ${baseMean.toFixed(2)} ± ${halfWidth(totals.sum[0], totals.sumSq[0]).toFixed(2)} (95% CI)`)
  console.log('')
  const O = otherMetric.toUpperCase()
  // A tank's damage taken too, beside its Δ DPS: the survival a rotation change costs or saves (D26).
  console.log(`| Candidate | ${metric.toUpperCase()} | Δ | 95% CI of Δ | Δ % | Clears |${showOther ? ` Δ ${O} (95% CI) | Δ damage taken (95% CI) |` : ''}`)
  console.log(`| --- | --- | --- | --- | --- | --- |${showOther ? ' --- | --- |' : ''}`)
  for (let c = 1; c < configs.length; c++) {
    const delta = totals.dSum[c] / n
    const hw = halfWidth(totals.dSum[c], totals.dSq[c])
    const clears = delta - hw > 0 ? 'yes' : delta + hw < 0 ? 'worse' : 'no'
    const o = totals.oSum[c] / n
    const ohw = halfWidth(totals.oSum[c], totals.oSq[c])
    const t = totals.tSum[c] / n
    const thw = halfWidth(totals.tSum[c], totals.tSq[c])
    console.log(
      `| ${label(candidates[c - 1], prefix) || 'the defaults'} | ${mean(c).toFixed(2)} | ${fmt(delta)} | ${fmt(delta - hw)} to ${fmt(delta + hw)} | ${fmt((100 * delta) / baseMean)}% | ${clears} |${showOther ? ` ${fmt(o)} (${fmt(o - ohw)} to ${fmt(o + ohw)}) | ${fmt(t)} (${fmt(t - thw)} to ${fmt(t + thw)}) |` : ''}`,
    )
  }
  console.log('')
  console.log(`${n} fights × ${configs.length} configs in ${seconds.toFixed(1)} s on ${workers} workers`)
}

if (isMainThread) {
  main().catch((error) => {
    console.error(error.message ?? error)
    process.exit(1)
  })
}
