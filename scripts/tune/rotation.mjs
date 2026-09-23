// Rotation tuning: paired comparisons of rotation settings against a baseline, on the real engine
// (decision D23; docs/classes/warrior.md §5.3 "Tuning the defaults").
//
// Every candidate runs the same fights as the baseline: the same config seed and fight indices, so
// the same fight lengths and random streams (common random numbers). Each fight gives a paired
// difference, candidate DPS − baseline DPS, and the report is the mean difference with its 95%
// confidence interval (± 1.96 standard errors of the paired differences). A candidate clears D23's
// bar when the whole interval is above zero. Tank specs are compared on TPS (--metric tps).
//
// The engine is bundled from src/ with Vite into .cache/tune/engine.mjs (the same modules the app
// and the tests run, with the full data), and the fights are split over worker threads. Results
// don't depend on the worker count.
//
//   node scripts/tune/rotation.mjs heroicStrike.minRage=55                 # one candidate against the defaults
//   node scripts/tune/rotation.mjs --sweep heroicStrike.minRage=40:70:5    # one candidate per value
//   node scripts/tune/rotation.mjs --sweep a=1:3:1 --sweep b=x|y           # the cartesian product of the sweeps
//   node scripts/tune/rotation.mjs "heroicStrike.minRage=55,whirlwind.enabled=true" whirlwind.enabled=true
//   node scripts/tune/rotation.mjs --base heroicStrike.minRage=55 --sweep spearingStrike.minRageOtherTargets=30:60:5
//
// A setting is `id=value`; ids without a `warrior.` prefix take the spec's (`warrior.arms.` for
// Arms). Values are numbers, true/false, or a choice's value. A candidate's settings are separated
// by commas. `--base` changes the baseline from the spec's defaults, and each candidate is applied on
// top of it.
//
// Options:
//   --spec warrior-arms   the spec (a SpecId)
//   --fights 40000        fights per candidate (rounded up to a multiple of the job size, 500)
//   --seed 1              the config seed (fight i uses the seed and i, so a new seed gives new fights)
//   --race <id>           the race (default: the spec's default, e.g. alliance-human); its faction's gear
//   --duration <s>        fight length (default 180)
//   --armor <n>           boss armor before debuffs (default 3731)
//   --execute <pct>       execute phase (default 20; 0 for none)
//   --creature <type>     target creature type (default none)
//   --metric dps|tps      what to compare (default dps)
//   --workers <n>         worker threads (default: available cores − 1)
//   --no-build            reuse .cache/tune/engine.mjs instead of rebuilding it
import { existsSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT_DIR = join(ROOT, '.cache/tune')
const BUNDLE = join(OUT_DIR, 'engine.mjs')
/** Fights per job handed to a worker. */
const JOB = 500
/** Two-sided 95% normal quantile. */
const Z95 = 1.959963984540054

/** The engine modules the tool needs, re-exported from one virtual entry and bundled with Vite. */
const ENTRY_ID = '\0tune-engine'
const ENTRY_SOURCE = `
export { defaultConfig } from '@/sim/defaults'
export { buildPlan } from '@/sim/plan/build'
export { Sim } from '@/sim/engine/sim'
export { rotationOptions } from '@/sim/classes/rotation'
`

async function buildEngine() {
  const { build } = await import('vite')
  await build({
    configFile: false,
    root: ROOT,
    logLevel: 'warn',
    publicDir: false,
    resolve: { alias: { '@': join(ROOT, 'src') } },
    plugins: [
      {
        name: 'tune-engine-entry',
        resolveId: (id) => (id === 'tune-engine' ? ENTRY_ID : null),
        load: (id) => (id === ENTRY_ID ? ENTRY_SOURCE : null),
      },
    ],
    build: {
      ssr: true,
      outDir: OUT_DIR,
      emptyOutDir: true,
      minify: false,
      rollupOptions: { input: 'tune-engine', output: { format: 'es', entryFileNames: 'engine.mjs' } },
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Worker: builds each candidate's plan once, then runs the fights of each job it's sent.

if (!isMainThread) {
  const engine = await import(pathToFileURL(workerData.bundle).href)
  const { configs, metric } = workerData
  const sims = configs.map((config) => {
    const bundle = engine.buildPlan(config)
    if (bundle.blockers.length > 0) throw new Error(bundle.blockers[0])
    return new engine.Sim(bundle.plan)
  })
  const read = metric === 'tps' ? (sim) => sim.fightThreat / (sim.fightMs / 1000) : (sim) => sim.fightDamage / (sim.fightMs / 1000)
  parentPort.on('message', ({ from, to }) => {
    // Per config: sum of its metric, and (candidates) sum and sum of squares of the paired difference.
    const sum = new Float64Array(configs.length)
    const sumSq = new Float64Array(configs.length)
    const dSum = new Float64Array(configs.length)
    const dSq = new Float64Array(configs.length)
    for (let i = from; i < to; i++) {
      sims[0].runFight(i)
      const base = read(sims[0])
      sum[0] += base
      sumSq[0] += base * base
      for (let c = 1; c < sims.length; c++) {
        sims[c].runFight(i)
        const x = read(sims[c])
        const d = x - base
        sum[c] += x
        sumSq[c] += x * x
        dSum[c] += d
        dSq[c] += d * d
      }
    }
    parentPort.postMessage({ n: to - from, sum, sumSq, dSum, dSq })
  })
  parentPort.postMessage({ ready: true })
}

// ---------------------------------------------------------------------------------------------
// Main thread.

/** `a=1,b=true,c=x` → [[id, value], …], ids prefixed with the spec's. */
function parseSettings(text, prefix) {
  if (!text) return []
  return text.split(',').map((pair) => {
    const eq = pair.indexOf('=')
    if (eq < 0) throw new Error(`Expected id=value, got "${pair}"`)
    return [qualify(pair.slice(0, eq).trim(), prefix), parseValue(pair.slice(eq + 1).trim())]
  })
}

const qualify = (id, prefix) => (id.startsWith('warrior.') ? id : prefix + id)

function parseValue(text) {
  if (text === 'true') return true
  if (text === 'false') return false
  const n = Number(text)
  return text !== '' && Number.isFinite(n) ? n : text
}

/** `id=30:60:5` (a range) or `id=a|b|c` (a list) → [[id, value]] per value. */
function parseSweep(text, prefix) {
  const eq = text.indexOf('=')
  if (eq < 0) throw new Error(`Expected id=from:to:step or id=a|b, got "${text}"`)
  const id = qualify(text.slice(0, eq).trim(), prefix)
  const spec = text.slice(eq + 1).trim()
  const range = spec.split(':')
  if (range.length === 3) {
    const [from, to, step] = range.map(Number)
    if (!(step > 0)) throw new Error(`Bad step in "${text}"`)
    const values = []
    for (let k = 0; from + k * step <= to + 1e-9; k++) values.push(Math.round((from + k * step) * 1000) / 1000)
    return values.map((v) => [id, v])
  }
  return spec.split('|').map((v) => [id, parseValue(v)])
}

/** Checks each setting against the spec's options: a known id, and a value of the right kind. */
function validate(settings, options) {
  for (const [id, value] of settings) {
    const option = options.find((o) => o.id === id)
    if (!option) throw new Error(`Unknown setting ${id}`)
    if (option.kind === 'toggle' && typeof value !== 'boolean') throw new Error(`${id} is a toggle: true or false`)
    if (option.kind === 'number' && (typeof value !== 'number' || value < option.min || value > option.max))
      throw new Error(`${id} is a number from ${option.min} to ${option.max}`)
    if (option.kind === 'choice' && !option.choices.some((c) => c.value === value))
      throw new Error(`${id} is one of ${option.choices.map((c) => c.value).join(', ')}`)
  }
}

const short = (id, prefix) => (id.startsWith(prefix) ? id.slice(prefix.length) : id)
const label = (settings, prefix) => settings.map(([id, v]) => `${short(id, prefix)}=${v}`).join(', ')
const fmt = (x, digits = 2) => (x >= 0 ? '+' : '') + x.toFixed(digits)

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
      metric: { type: 'string', default: 'dps' },
      base: { type: 'string', default: '' },
      sweep: { type: 'string', multiple: true, default: [] },
      workers: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
      'no-build': { type: 'boolean', default: false },
    },
  })

  if (!args['no-build'] || !existsSync(BUNDLE)) await buildEngine()
  const engine = await import(pathToFileURL(BUNDLE).href)

  const spec = args.spec
  const prefix = spec.replace('-', '.') + '.' // warrior-arms → warrior.arms.
  const options = engine.rotationOptions(spec)
  const base = parseSettings(args.base, prefix)
  validate(base, options)

  const candidates = positionals.map((p) => parseSettings(p, prefix))
  if (args.sweep.length > 0) {
    let product = [[]]
    for (const sweep of args.sweep) product = product.flatMap((set) => parseSweep(sweep, prefix).map((s) => [...set, s]))
    candidates.push(...product)
  }
  if (candidates.length === 0) throw new Error('No candidates: give settings, or --sweep')
  for (const c of candidates) validate(c, options)

  const d = engine.defaultConfig(spec, args.race)
  const fight = { ...d.fight }
  if (args.duration) fight.durationSec = Number(args.duration)
  if (args.armor) fight.bossArmor = Number(args.armor)
  if (args.execute) fight.executePct = Number(args.execute)
  if (args.creature) fight.creatureType = args.creature
  const config = (settings) => ({
    ...d,
    fight,
    rotation: Object.fromEntries(settings),
    run: { mode: 'fixed', iterations: 0, seed: Number(args.seed) },
  })
  const configs = [config(base), ...candidates.map((c) => config([...base, ...c]))]

  const fights = Math.ceil(Number(args.fights) / JOB) * JOB
  const workers = Math.min(Number(args.workers), fights / JOB)
  const metric = args.metric
  const totals = { n: 0, sum: new Float64Array(configs.length), sumSq: new Float64Array(configs.length), dSum: new Float64Array(configs.length), dSq: new Float64Array(configs.length) }

  const setup = [
    `${spec}, ${d.race}`,
    `${fight.durationSec} s ± ${fight.durationVariationPct}%`,
    `armor ${fight.bossArmor}`,
    `execute ${fight.executePct}%`,
    `creature ${fight.creatureType}`,
    `seed ${args.seed}`,
    `${fights} fights per candidate, paired`,
  ].join('; ')
  console.log(setup)
  console.log(`baseline: ${base.length ? label(base, prefix) : 'the defaults'}`)

  const start = performance.now()
  let next = 0
  await Promise.all(
    Array.from({ length: workers }, () => {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { bundle: BUNDLE, configs, metric } })
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
  console.log(`| Candidate | ${metric.toUpperCase()} | Δ | 95% CI of Δ | Δ % | Clears |`)
  console.log('| --- | --- | --- | --- | --- | --- |')
  for (let c = 1; c < configs.length; c++) {
    const delta = totals.dSum[c] / n
    const hw = halfWidth(totals.dSum[c], totals.dSq[c])
    const clears = delta - hw > 0 ? 'yes' : delta + hw < 0 ? 'worse' : 'no'
    console.log(
      `| ${label(candidates[c - 1], prefix)} | ${mean(c).toFixed(2)} | ${fmt(delta)} | ${fmt(delta - hw)} to ${fmt(delta + hw)} | ${fmt((100 * delta) / baseMean)}% | ${clears} |`,
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
