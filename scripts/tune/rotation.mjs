// Rotation tuning: paired comparisons of rotation settings against a baseline, on the real engine
// (decision D23; docs/classes/warrior.md §5.3 and docs/classes/druid.md §6.2, "Tuning the defaults").
//
// Every candidate runs the same fights as the baseline: the same config seed and fight indices, so
// the same fight lengths and random streams (common random numbers). Each fight gives a paired
// difference, candidate DPS − baseline DPS, and the report is the mean difference with its 95%
// confidence interval (± 1.96 standard errors of the paired differences). A candidate clears D23's
// bar when the whole interval is above zero. Tank specs are compared on TPS (--metric tps).
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
//
// A setting is `id=value`. An id is either a full setting id of the spec, or one without the spec's
// prefix, which the tool works out from the spec's own setting ids (`warrior.arms.` for Arms, so
// `heroicStrike.minRage` is `warrior.arms.heroicStrike.minRage`; `druid.cat.` for the Feral cat).
// Values are numbers, true/false, or a choice's value. A candidate's settings are separated by
// commas. `--base` changes the baseline from the spec's defaults, and each candidate is applied on
// top of it.
//
// `--against <commit>` runs the baseline on the engine and defaults of another commit (any git
// ref, bundled from its src/), so a change of semantics can be compared with the rotation it
// replaces, fight by fight on the same seeds. Then `--base` applies to the baseline only (in that
// commit's settings), each candidate is the current defaults plus its own settings, and with no
// candidates given, the candidate is the current defaults.
//
// Options (numbers are checked against the app's own limits):
//   --spec warrior-arms   the spec (a SpecId with rotation settings)
//   --fights 40000        fights per candidate, a whole number (rounded up to a multiple of the job size, 500)
//   --seed 1              the config seed, 0 to 4294967295 (fight i uses the seed and i, so a new seed gives new fights)
//   --race <id>           the race (default: the spec's default, e.g. alliance-human); its faction's gear
//   --duration <s>        fight length (default 180; the Fight tab's range)
//   --armor <n>           boss armor before debuffs (default 3731)
//   --execute <pct>       execute phase (default 20; 0 for none)
//   --creature <type>     target creature type (default none)
//   --metric dps|tps      what to compare (default dps)
//   --workers <n>         worker threads (default: available cores − 1)
//   --against <commit>    the baseline is that commit's engine and defaults (see above)
//   --help                this text
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'src')
const OUT_DIR = join(ROOT, '.cache/tune')
/** Bundles unused for this long are removed. */
const STALE_MS = 24 * 60 * 60 * 1000
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
export { normalizeConfig } from '@/sim/config/normalize'
export { SPEC_IDS } from '@/sim/specs'
`

/** What a baseline from another commit needs (`--against`): the modules every version has. */
const REF_ENTRY_SOURCE = `
export { defaultConfig } from '@/sim/defaults'
export { buildPlan } from '@/sim/plan/build'
export { Sim } from '@/sim/engine/sim'
export { rotationOptions } from '@/sim/classes/rotation'
`

/** A digest of every file under src/ (paths and contents), and of the entry: the bundle's name. */
function sourceHash() {
  const hash = createHash('sha256').update(ENTRY_SOURCE)
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else hash.update(relative(SRC, path)).update('\0').update(readFileSync(path)).update('\0')
    }
  }
  walk(SRC)
  return hash.digest('hex').slice(0, 16)
}

/**
 * The bundle named `key`: reused if it's there, built otherwise by `build(folder)` into a folder of
 * this process's own that's renamed into place once it's complete, so a concurrent run sees either
 * no bundle or a whole one. If another run got there first, its bundle is used and this one dropped.
 * Bundles (and abandoned builds) nobody has used for a day are removed.
 */
async function cachedBundle(key, build) {
  mkdirSync(OUT_DIR, { recursive: true })
  const dir = join(OUT_DIR, key)
  const bundle = join(dir, 'engine.mjs')
  if (!existsSync(bundle)) {
    const tmp = join(OUT_DIR, `.build-${process.pid}-${Date.now()}`)
    try {
      await build(tmp)
      renameSync(join(tmp, 'out'), dir)
    } catch (error) {
      if (!existsSync(bundle)) throw error
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
  const now = new Date()
  utimesSync(dir, now, now)
  for (const name of readdirSync(OUT_DIR)) {
    const path = join(OUT_DIR, name)
    if (path !== dir && now.getTime() - statSync(path).mtimeMs > STALE_MS) rmSync(path, { recursive: true, force: true })
  }
  return bundle
}

/** The bundle of the current src/. */
const engineBundle = () => cachedBundle(sourceHash(), (tmp) => buildEngine(SRC, ENTRY_SOURCE, join(tmp, 'out')))

/**
 * The bundle of src/ at a git commit (`--against`), keyed by its tree: git writes that src/ into the
 * build folder, and Vite bundles it with this checkout's node_modules.
 */
async function refBundle(ref) {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  let commit
  try {
    commit = git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
  } catch {
    throw new Error(`--against: "${ref}" isn't a commit in this repository`)
  }
  const tree = git('rev-parse', `${commit}:src`)
  const bundle = await cachedBundle(`src-${tree.slice(0, 16)}`, async (tmp) => {
    mkdirSync(tmp, { recursive: true })
    execFileSync('sh', ['-c', `git archive "${commit}" src | tar -x -C "${tmp}"`], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] })
    await buildEngine(join(tmp, 'src'), REF_ENTRY_SOURCE, join(tmp, 'out'))
  })
  return { commit, bundle }
}

async function buildEngine(srcDir, entry, outDir) {
  const { build } = await import('vite')
  await build({
    configFile: false,
    root: ROOT,
    logLevel: 'warn',
    publicDir: false,
    resolve: { alias: { '@': srcDir } },
    plugins: [
      {
        name: 'tune-engine-entry',
        resolveId: (id) => (id === 'tune-engine' ? ENTRY_ID : null),
        load: (id) => (id === ENTRY_ID ? entry : null),
      },
    ],
    build: {
      ssr: true,
      outDir,
      emptyOutDir: true,
      minify: false,
      rollupOptions: { input: 'tune-engine', output: { format: 'es', entryFileNames: 'engine.mjs' } },
    },
  })
}

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

/**
 * The spec's setting ids and their shared prefix (`warrior.arms.`): an id given without it gets it,
 * so `heroicStrike.minRage` is `warrior.arms.heroicStrike.minRage`, whatever the spec's class.
 */
function settingIds(options) {
  const ids = new Set(options.map((o) => o.id))
  const parts = options.map((o) => o.id.split('.').slice(0, -1))
  let n = 0
  while (parts.length > 0 && parts.every((p) => n < p.length && p[n] === parts[0][n])) n++
  const prefix = n > 0 ? parts[0].slice(0, n).join('.') + '.' : ''
  return { ids, prefix, qualify: (id) => (ids.has(id) ? id : prefix + id) }
}

/** `a=1,b=true,c=x` → [[id, value], …], ids qualified with the spec's prefix. */
function parseSettings(text, spec) {
  if (!text) return []
  return text.split(',').map((pair) => {
    const eq = pair.indexOf('=')
    if (eq < 0) throw new Error(`Expected id=value, got "${pair}"`)
    return [spec.qualify(pair.slice(0, eq).trim()), parseValue(pair.slice(eq + 1).trim())]
  })
}

function parseValue(text) {
  if (text === 'true') return true
  if (text === 'false') return false
  const n = Number(text)
  return text !== '' && Number.isFinite(n) ? n : text
}

/** `id=30:60:5` (a range) or `id=a|b|c` (a list) → [[id, value]] per value. */
function parseSweep(text, spec) {
  const eq = text.indexOf('=')
  if (eq < 0) throw new Error(`Expected id=from:to:step or id=a|b, got "${text}"`)
  const id = spec.qualify(text.slice(0, eq).trim())
  const values = text.slice(eq + 1).trim()
  const range = values.split(':')
  if (range.length === 3) {
    const [from, to, step] = range.map((x) => (x.trim() === '' ? NaN : Number(x)))
    if (![from, to, step].every(Number.isFinite) || !(step > 0) || to < from) throw new Error(`Expected from:to:step with from ≤ to and step > 0, got "${text}"`)
    const out = []
    for (let k = 0; from + k * step <= to + 1e-9; k++) out.push(Math.round((from + k * step) * 1000) / 1000)
    return out.map((v) => [id, v])
  }
  return values.split('|').map((v) => [id, parseValue(v)])
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

/** A command-line number: finite, whole if asked, within [min, max]. */
function flagNumber(name, text, { min = -Infinity, max = Infinity, whole = false } = {}) {
  const n = text.trim() === '' ? NaN : Number(text)
  if (!Number.isFinite(n) || (whole && !Number.isInteger(n)) || n < min || n > max) {
    const range = max === Infinity ? `at least ${min}` : `from ${min} to ${max}`
    throw new Error(`--${name} must be ${whole ? 'a whole number' : 'a number'} ${range}, got "${text}"`)
  }
  return n
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
      against: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (args.help) {
    // The header comment above is the manual.
    const header = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n')
    console.log(
      header
        .slice(0, header.findIndex((line) => !line.startsWith('//')))
        .map((line) => line.replace(/^\/\/ ?/, ''))
        .join('\n'),
    )
    return
  }

  const bundle = await engineBundle()
  const engine = await import(pathToFileURL(bundle).href)
  const ref = args.against === undefined ? null : await refBundle(args.against)
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
  if (args.sweep.length > 0) {
    let product = [[]]
    for (const sweep of args.sweep) product = product.flatMap((set) => parseSweep(sweep, spec).map((s) => [...set, s]))
    candidates.push(...product)
  }
  // Against another commit, the current defaults are the candidate when none is given.
  if (candidates.length === 0 && ref) candidates.push([])
  if (candidates.length === 0) throw new Error('No candidates: give settings, or --sweep')
  for (const c of candidates) validate(c, options)

  const requested = flagNumber('fights', args.fights, { min: 1, whole: true })
  const seed = flagNumber('seed', args.seed, { min: 0, max: 0xffffffff, whole: true })
  const workerCount = flagNumber('workers', args.workers, { min: 1, whole: true })
  const metric = args.metric
  if (metric !== 'dps' && metric !== 'tps') throw new Error(`--metric must be dps or tps, got "${metric}"`)

  const d = engine.defaultConfig(specId, args.race)
  const fight = { ...d.fight }
  if (args.duration !== undefined) fight.durationSec = flagNumber('duration', args.duration)
  if (args.armor !== undefined) fight.bossArmor = flagNumber('armor', args.armor)
  if (args.execute !== undefined) fight.executePct = flagNumber('execute', args.execute)
  if (args.creature !== undefined) fight.creatureType = args.creature
  const config = (settings) => ({
    ...d,
    fight,
    rotation: Object.fromEntries(settings),
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
  const totals = { n: 0, sum: new Float64Array(configs.length), sumSq: new Float64Array(configs.length), dSum: new Float64Array(configs.length), dSq: new Float64Array(configs.length) }

  const setup = [
    `${specId}, ${d.race}`,
    `${fight.durationSec} s ± ${fight.durationVariationPct}%`,
    `armor ${fight.bossArmor}`,
    `execute ${fight.executePct}%`,
    `creature ${fight.creatureType}`,
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
      `| ${label(candidates[c - 1], prefix) || 'the defaults'} | ${mean(c).toFixed(2)} | ${fmt(delta)} | ${fmt(delta - hw)} to ${fmt(delta + hw)} | ${fmt((100 * delta) / baseMean)}% | ${clears} |`,
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
