// Shared by the tuning tools (rotation.mjs, optimize.mjs): the engine bundle built from src/, and
// the command line's rotation settings (`id=value`), sweeps, numbers and raid.
//
// The engine is bundled from src/ with Vite (the same modules the app and the tests run, with the
// full data) into .cache/tune/<hash>/engine.mjs, where <hash> is a digest of every file under src/
// and of the tool's entry. So a run always uses the current source: it reuses the bundle while src/
// is unchanged and builds a new one when anything in it changes. Each build goes to its own
// temporary folder, renamed into place when it's done, so concurrent runs never clobber each other.
// Bundles unused for a day are removed.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'src')
const OUT_DIR = join(ROOT, '.cache/tune')
/** Bundles unused for this long are removed. */
const STALE_MS = 24 * 60 * 60 * 1000
/** Two-sided 95% normal quantile. */
export const Z95 = 1.959963984540054

/** A digest of every file under src/ (paths and contents), and of the entry: the bundle's name. */
function sourceHash(entry) {
  const hash = createHash('sha256').update(entry)
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

/** The bundle of the current src/, re-exporting what `entry` (module source importing from '@/…') lists. */
export const engineBundle = (entry) => cachedBundle(sourceHash(entry), (tmp) => buildEngine(SRC, entry, join(tmp, 'out')))

/**
 * The bundle of src/ at a git commit (`--against`), keyed by its tree: git writes that src/ into the
 * build folder, and Vite bundles it with this checkout's node_modules.
 */
export async function refBundle(ref, entry) {
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
    await buildEngine(join(tmp, 'src'), entry, join(tmp, 'out'))
  })
  return { commit, bundle }
}

const ENTRY_ID = '\0tune-engine'

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

/** Prints a tool's manual: the `//` comment block at the top of its file. */
export function printHelp(fileUrl) {
  const header = readFileSync(fileURLToPath(fileUrl), 'utf8').split('\n')
  console.log(
    header
      .slice(0, header.findIndex((line) => !line.startsWith('//')))
      .map((line) => line.replace(/^\/\/ ?/, ''))
      .join('\n'),
  )
}

// ---------------------------------------------------------------------------------------------
// Rotation settings on the command line.

/** The pseudo-setting for a candidate's talent build code. */
export const TALENTS = 'talents'
/** The pseudo-setting for a priority-list spec's row order (D31): row ids joined by `>`, as `SimConfig.rotationOrder`. */
export const ORDER = 'order'

/**
 * The spec's setting ids and their shared prefix (`warrior.arms.`): an id given without it gets it,
 * so `heroicStrike.minRage` is `warrior.arms.heroicStrike.minRage`, whatever the spec's class.
 */
export function settingIds(options) {
  const ids = new Set(options.map((o) => o.id))
  const parts = options.map((o) => o.id.split('.').slice(0, -1))
  let n = 0
  while (parts.length > 0 && parts.every((p) => n < p.length && p[n] === parts[0][n])) n++
  const prefix = n > 0 ? parts[0].slice(0, n).join('.') + '.' : ''
  return { ids, prefix, qualify: (id) => (ids.has(id) || id === TALENTS || id === ORDER ? id : prefix + id) }
}

/** `a=1,b=true,c=x` → [[id, value], …], ids qualified with the spec's prefix. */
export function parseSettings(text, spec) {
  if (!text) return []
  return text.split(',').map((pair) => {
    const eq = pair.indexOf('=')
    if (eq < 0) throw new Error(`Expected id=value, got "${pair}"`)
    return [spec.qualify(pair.slice(0, eq).trim()), parseValue(pair.slice(eq + 1).trim())]
  })
}

export function parseValue(text) {
  if (text === 'true') return true
  if (text === 'false') return false
  const n = Number(text)
  return text !== '' && Number.isFinite(n) ? n : text
}

/** `id=30:60:5` (a range) or `id=a|b|c` (a list) → [[id, value]] per value. */
export function parseSweep(text, spec) {
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

/** The cartesian product of sweeps: one list of settings per combination. */
export function sweepProduct(sweeps, spec) {
  let product = [[]]
  for (const sweep of sweeps) product = product.flatMap((set) => parseSweep(sweep, spec).map((s) => [...set, s]))
  return product
}

/**
 * Checks each setting against the spec's options: a known id, and a value of the right kind; an
 * order against the spec's priority-list rows (`rows`: their ids, or null for a spec without a list).
 */
export function validate(settings, options, rows = null) {
  for (const [id, value] of settings) {
    if (id === ORDER) {
      if (typeof value !== 'string' || value.split('>').some((row) => row === '')) throw new Error(`order is row ids joined by ">", got "${value}"`)
      if (rows === null) throw new Error('order is for a spec with a priority list, and this one has none')
      const named = value.split('>')
      const unknown = named.filter((row) => !rows.includes(row))
      if (unknown.length > 0) throw new Error(`order: unknown row ${unknown.join(', ')}; the rows are ${rows.join(', ')}`)
      const twice = named.filter((row, i) => named.indexOf(row) !== i)
      if (twice.length > 0) throw new Error(`order: ${twice.join(', ')} named more than once`)
      continue
    }
    if (id === TALENTS) {
      if (typeof value !== 'string' || !/^[0-9]*-[0-9]*-[0-9]*$/.test(value)) throw new Error(`talents is a build code (digits and two "-"), got "${value}"`)
      continue
    }
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
export function flagNumber(name, text, { min = -Infinity, max = Infinity, whole = false } = {}) {
  const n = text.trim() === '' ? NaN : Number(text)
  if (!Number.isFinite(n) || (whole && !Number.isInteger(n)) || n < min || n > max) {
    const range = max === Infinity ? `at least ${min}` : `from ${min} to ${max}`
    throw new Error(`--${name} must be ${whole ? 'a whole number' : 'a number'} ${range}, got "${text}"`)
  }
  return n
}

/**
 * The raid for --raid and the buffs that follow it: the default raid, or a comma-separated list of
 * classes, or changes to the default (`-warrior`, `+warlock`). As the Buffs tab's class buttons do,
 * a buff nobody left in the raid brings is turned off (listed in `dropped`); the other default
 * buffs stay, so the setup is the default one but for the raid.
 */
export function raidBuffs(engine, d, text) {
  if (text === undefined) return { ...d.buffs, dropped: [] }
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean)
  const changes = parts.every((p) => p.startsWith('-') || p.startsWith('+'))
  if (!changes && parts.some((p) => p.startsWith('-') || p.startsWith('+'))) throw new Error(`--raid takes a list of classes or changes (-warrior,+warlock), not both: "${text}"`)
  let raid = changes ? [...d.buffs.raid] : []
  for (const p of parts) {
    const cls = changes ? p.slice(1) : p
    if (!engine.FULL_RAID.includes(cls)) throw new Error(`--raid: "${cls}" isn't a class (${engine.FULL_RAID.join(', ')})`)
    if (!changes || p.startsWith('+')) raid = raid.includes(cls) ? raid : [...raid, cls]
    else raid = raid.filter((c) => c !== cls)
  }
  // Someone left in the raid brings it, or you cast it on yourself (a druid's Mark of the Wild).
  const brings = (id) => {
    const buff = engine.BUFFS.find((b) => b.id === id)
    return !buff || engine.buffProvided(buff, raid, d.spec)
  }
  return { raid, enabled: d.buffs.enabled.filter(brings), dropped: d.buffs.enabled.filter((id) => !brings(id)) }
}

export const short = (id, prefix) => (id.startsWith(prefix) ? id.slice(prefix.length) : id)
export const label = (settings, prefix) => settings.map(([id, v]) => `${short(id, prefix)}=${v}`).join(', ')
export const fmt = (x, digits = 2) => (x >= 0 ? '+' : '') + x.toFixed(digits)
