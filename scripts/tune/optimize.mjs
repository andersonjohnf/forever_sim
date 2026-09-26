// The optimizer: the best talents, gear and rotation settings for a setup and a goal, found by the sim
// itself (decision D30; docs/optimizer.md). You pick the goal: Defense, DPS, TPS or Balanced. It
// screens the class's talents for what the sim can measure for that goal, builds every sensible
// build under the constraints (no talent is kept or ordered by its name), and races them on common
// random numbers: every candidate runs the same fights, and each round drops those clearly worse
// than the leader, until the leader is clear of every survivor at 95% (D23's bar) or the budget runs
// out.
//
// The engine is bundled from the current src/ as rotation.mjs does (lib.mjs), and the fights run on
// worker threads; the result doesn't depend on how many.
//
//   npm run optimize -- --spec warrior-protection
//   npm run optimize -- --spec warrior-protection --goal defense
//   npm run optimize -- --spec druid-feral-bear --budget thorough --confirm
//   npm run optimize -- --spec paladin-protection --require "health>=100%" --crush-immune
//   npm run optimize -- --spec warrior-fury --goal dps --keep "Precision"
//   npm run optimize -- --spec warrior-arms --search rotation --sweep heroicStrike.minRage=40:70:10
//   npm run optimize -- --spec druid-feral-bear --search both --sweep maul.minRage=10:40:10
//   npm run optimize -- --spec druid-feral-bear --turns --sweep maul.minRage=10:40:10
//   npm run optimize -- --spec warrior-fury --search gear --budget quick
//   npm run optimize -- --spec warrior-protection --search gear --ilvl 55-66 --sources other,reputation --lock trinket1
//   npm run optimize -- --spec druid-feral-bear --search all --sweep maul.minRage=10:40:10
//
// The setup as it is is the baseline: every candidate is measured against it, fight for fight, but
// it's never the answer. Every answer meets every constraint below; the setup itself races as a
// candidate like any other when it does. When none does, the tool says which constraints block.
//
// What to search:
//   --search talents      talents (the default); the setup's rotation
//   --search rotation     rotation settings only (--sweep and --rotation give the variants); the setup's
//                         talents, with no talent constraints (the talent flags below are refused with it)
//   --search both         every build with every rotation variant, and with the setup's own rotation
//   --search gear         gear only (docs/optimizer.md#gear): coordinate ascent over the paper doll, one slot
//                         (rings, trinkets and the weapons a pair) at a time, each step's candidates raced, until a
//                         pass changes nothing; restarts from the default preset and a greedy set; the ends race
//   --search all          talents, gear and rotation in turns until a whole cycle moves nothing
//                         (docs/optimizer.md#talents-gear-and-rotation-together); a rotation pass only with variants
//   --turns               talents, then the rotation variants with the winning build, then talents again,
//                         until a pass keeps its start (docs/optimizer.md#talents-and-rotation-together).
//                         Every pass races its start too, and holds every candidate to every constraint.
//                         Each pass but the last runs at most 90% of what's left of the cap (OGV2-4).
//   --sweep id=a:b:step   rotation variants, as rotation.mjs's --sweep (id=a|b|c for a list); repeatable, the
//                         cartesian product of all of them
//   --rotation "a=1,b=2"  one rotation variant; repeatable
//
// Talent constraints (names as the talent trees show them), when talents are searched:
//   --talents <code>      the setup's build: the baseline every result is compared with, and where the
//                         search starts (default: the spec's default build)
//   --min-tree <tree>=<n> at least n points in that tree (repeatable): "Protection=31". A tank's default is
//                         31 in its tank tree, which a minimum for another tree joins; "--min-tree
//                         Protection=0" drops it
//   --keep <talent>[=r]   in every build at rank r (default: its max); repeatable, or comma-separated.
//                         No talent is kept by default (D30)
//   --exclude <talent>    never taken; repeatable, or comma-separated
//   --no-partials         search max ranks only: leftover points still go to partial ranks, by score per
//                         point. By default every rank of one objective talent a build is searched too (OG-2;
//                         a talent searched only for a constraint is at 0 or max, OGV-1)
//   --screen-fights <n>   fights per plan in the talent screen (default 400)
//
// Gear (with --search gear or all; docs/optimizer.md#gear):
//   --ilvl <min>-<max>    item levels to search ("58-66", "60-", "-63"); default the whole pool
//   --sources <list>      pvp, reputation, profession, other (drops, quests, crafts): comma-separated; default all
//   --include-later-raids search the later raids' loot and later patches' items too: Zul'Gurub, Ahn'Qiraj, Molten
//                         Core, Blackwing Lair, Naxxramas, and any item above item level 63 on no pre-raid list. By
//                         default the pool is pre-raid gear and the launch raids (Onyxia, Barrow Deeps, Hyjal) only
//                         (D30, user decision 2026-09-25; docs/optimizer.md#the-default-pool)
//   --lock <slots>        slots left as they are: head, neck, shoulder, back, chest, wrist, hands, waist, legs, feet,
//                         finger1, finger2, trinket1, trinket2, mainHand, offHand, ranged; repeatable or comma-separated
//   --faction alliance|horde   the character's faction (the gear it can wear): the class's default race of that
//                         faction, unless --race gives one
//   --enchants all        search every enchant, the Zandalar and Scourge shoulder enchants too (left out by
//                         default: their content in Forever is unconfirmed, buffs doc §6.4)
//   --per-slot <n>        items each slot races by value, beside its current one (default 6; D30: 5 to 8)
//   --no-restarts         only the ascent from the setup's gear (default: also from the default preset and a greedy set)
//   --gear-passes <n>     most passes over the paper doll a start runs (default 4)
//   --weight-fights <n>   fights a plan when the stat weights are measured (default 1000; at least 50)
//   --measure-fights <n>  fights a plan when an item or enchant is measured by a swap (default 300; at least 50)
//   --cycles <n>          --search all: most cycles of talents, gear and rotation (default 3)
//
// Constraints on the character sheet (docs/optimizer.md#constraints), repeatable:
//   --require <limit>     name>=value or name<=value; a % makes it a share of the baseline's value:
//                         ehp (effective health: health ÷ (1 − armor's reduction vs the boss)),
//                         health, armor, stamina, defense, dodgePct, parryPct, blockPct, blockValue,
//                         critReductionPct, hitPct, critPct, attackPower, bossCritPct and bossCrushPct
//                         (the boss's crit and crushing blow chances against you). "ehp>=95%",
//                         "health>=8000". Fight results (dps, tps, damage taken) take no limits (D30).
//   --no-ehp-floor        drop a tank's default floor, 90% of the default's effective health (D30)
//   --crit-immune         the boss can't crit you (bossCritPct<=0: 440 defense vs a level-63 boss, on the
//                         table with no block buff up); off by default
//   --crush-immune        the boss can't crush you (bossCrushPct<=0: miss, dodge, parry and block fill the
//                         table; a Protection paladin's with Holy Shield up); off by default
//
// The search:
//   --goal defense|dps|tps|balanced   what to optimize for (docs/optimizer.md#goals; default: dps for DPS
//                         specs, balanced for tanks). defense: the least damage taken a second, TPS breaking a
//                         tie (a tank's only); dps, tps: the most of it, the least damage taken breaking a tie;
//                         balanced: the sum of the TPS and DPS changes relative to the setup's own (DPS alone
//                         for a DPS spec)
//   --budget quick|standard|thorough|<fights>   fights for the whole race (default standard: 1.5M, 6M, 24M).
//                         A space too big for it grows the budget, up to the cap, so every plan runs 50 fights
//                         in the first round, and says so
//   --max-fights <n>      the hard ceiling: the most fights the search runs, the screen's and the race's, over
//                         every pass (default thorough's 24,000,000; never raised automatically). A space past it,
//                         or past 200,000 builds, narrows to max ranks and says so; one past it even then isn't run
//   --first <n>           fights each candidate runs in the first round (default: 30% of the budget, 50 to 1,000);
//                         one past the cap shrinks to fit it, and never narrows the space
//   --seed <n>            the master seed, 0 to 4294967295 (default 1)
//   --threads <n>         worker threads (default: available cores − 1)
//   --top <n>             standings to show (default 10)
//   --confirm             D23's check: the winner against the setup on a fresh seed, and again with the
//                         unmeasured ratings switched (D12), to say whether the winner depends on them; and
//                         the [?] assumptions only the winner (or only the setup) relies on
//   --confirm-fights <n>  fights each in the check (default 40000; at least 100). The check counts under
//                         --max-fights: with less left, it runs fewer each and says so
//   --json <path>         the report (default .cache/optimize/<spec>-<seed>-<time>.json)
//
// The setup (as rotation.mjs): --race, --duration, --armor, --execute, --creature, --position,
// --profile, --raid, --buffs-off, --ratings apply|ignore (D12's unmeasured ratings). --help: this text.
import { mkdirSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { engineBundle, flagNumber, fmt, parseSettings, printHelp, raidBuffs, ROOT, settingIds, sweepProduct, validate } from './lib.mjs'
import racesJson from '../../src/data/races/races.json' with { type: 'json' }

/** The engine modules the tool needs (lib.mjs bundles them from src/). */
const ENTRY_SOURCE = `
export { defaultConfig, FULL_RAID, TALENT_DATA } from '@/sim/defaults'
export { decodeTalentCode, validateTalentBuild } from '@/data/talents/types'
export { rotationOptions } from '@/sim/classes/rotation'
export { normalizeConfig } from '@/sim/config/normalize'
export { SPEC_IDS, SPEC_META } from '@/sim/specs'
export { BUFFS } from '@/sim/effects/buffs'
export { buffProvided } from '@/sim/effects/presets'
export { Sim } from '@/sim/engine/sim'
export * from '@/sim/optimize'
`

// ---------------------------------------------------------------------------------------------
// Worker: keeps a few engines by plan key and runs the fights it's sent.

if (!isMainThread) {
  const engine = await import(pathToFileURL(workerData.bundle).href)
  const engines = new engine.EngineCache(workerData.capacity)
  parentPort.on('message', ({ id, key, plan, from, count }) => {
    try {
      let sim = engines.get(key)
      if (!sim) {
        if (!plan) throw new Error(`The worker has no plan ${key}`)
        sim = new engine.Sim(plan)
        engines.set(key, sim)
      }
      const s = engine.runFights(sim, from, count)
      parentPort.postMessage({ id, dps: s.dps, tps: s.tps, taken: s.taken }, [s.dps.buffer, s.tps.buffer, s.taken.buffer])
    } catch (error) {
      parentPort.postMessage({ id, error: error.message ?? String(error) })
    }
  })
}

/**
 * A FightRunner on worker threads. Each thread keeps `capacity` engines, least recently used first
 * out; the main thread mirrors each thread's cache (the same operations in the same order), so a
 * plan is sent only to a thread that doesn't have its engine. A job goes to a free thread that has
 * its engine if there is one.
 */
function threadRunner(engine, bundle, threads) {
  const capacity = engine.ENGINES_PER_LANE
  const slots = Array.from({ length: threads }, () => ({
    worker: new Worker(fileURLToPath(import.meta.url), { workerData: { bundle, capacity } }),
    busy: 0,
    mirror: new engine.EngineCache(capacity),
  }))
  const jobs = new Map()
  let nextId = 1
  for (const slot of slots) {
    slot.worker.on('message', (m) => {
      const job = jobs.get(m.id)
      jobs.delete(m.id)
      slot.busy--
      if (m.error) job.reject(new Error(m.error))
      else job.resolve({ dps: m.dps, tps: m.tps, taken: m.taken })
    })
    slot.worker.on('error', (error) => {
      for (const job of jobs.values()) job.reject(error)
      jobs.clear()
    })
  }
  return {
    lanes: threads,
    run(source, from, count) {
      return new Promise((resolve, reject) => {
        const least = Math.min(...slots.map((s) => s.busy))
        const slot = slots.find((s) => s.busy === least && s.mirror.has(source.key)) ?? slots.find((s) => s.busy === least)
        const known = slot.mirror.has(source.key)
        // Build the plan before any bookkeeping: if it throws, the mirror and the thread's load stay as they were.
        let plan
        try {
          if (!known) plan = source.plan()
        } catch (error) {
          reject(error)
          return
        }
        if (known) slot.mirror.get(source.key)
        else slot.mirror.set(source.key, true)
        const id = nextId++
        jobs.set(id, { resolve, reject })
        slot.busy++
        slot.worker.postMessage({ id, key: source.key, plan, from, count })
      })
    },
    close: () => Promise.all(slots.map((s) => s.worker.terminate())),
  }
}

// ---------------------------------------------------------------------------------------------
// Main thread.

const list = (values) => values.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
const pct = (x, digits = 2) => `${fmt(x, digits)}%`
/** A chance in %, unsigned. */
const chance = (x) => `${x.toFixed(2)}%`
const ci = (i, digits = 2) => `${fmt(i.mean, digits)} (${fmt(i.mean - i.halfWidth, digits)} to ${fmt(i.mean + i.halfWidth, digits)})`
const count = (n) => n.toLocaleString('en-US')
/** A count and its noun, singular for one (OV5-4): "1 build", "3,690 builds". */
const plural = (n, noun) => `${count(n)} ${noun}${n === 1 ? '' : 's'}`
/**
 * A rough pace for estimates before anything has run: fights a second a thread on this machine
 * under load, at PACE_FIGHT_SEC-second fights (docs/optimizer.md#budgets: about 80,000 a second on
 * 12–15 threads). A fight's cost grows with its length, so the estimate scales it (OGV2-3).
 */
const PER_THREAD = 6000
const PACE_FIGHT_SEC = 180
/** Seconds as "about 40 s" or "about 5 min". */
const duration = (seconds) => (seconds < 90 ? `about ${Math.max(1, Math.round(seconds))} s` : `about ${Math.round(seconds / 60)} min`)

async function main() {
  const { values: args } = parseArgs({
    options: {
      spec: { type: 'string' },
      search: { type: 'string', default: 'talents' },
      turns: { type: 'boolean', default: false },
      sweep: { type: 'string', multiple: true, default: [] },
      rotation: { type: 'string', multiple: true, default: [] },
      'min-tree': { type: 'string', multiple: true, default: [] },
      keep: { type: 'string', multiple: true, default: [] },
      exclude: { type: 'string', multiple: true, default: [] },
      'no-ehp-floor': { type: 'boolean', default: false },
      'crit-immune': { type: 'boolean', default: false },
      'crush-immune': { type: 'boolean', default: false },
      talents: { type: 'string' },
      'no-partials': { type: 'boolean', default: false },
      'screen-fights': { type: 'string', default: '400' },
      ilvl: { type: 'string' },
      sources: { type: 'string' },
      'include-later-raids': { type: 'boolean', default: false },
      lock: { type: 'string', multiple: true, default: [] },
      faction: { type: 'string' },
      enchants: { type: 'string' },
      'per-slot': { type: 'string' },
      'no-restarts': { type: 'boolean', default: false },
      'gear-passes': { type: 'string' },
      'weight-fights': { type: 'string' },
      'measure-fights': { type: 'string' },
      cycles: { type: 'string' },
      require: { type: 'string', multiple: true, default: [] },
      goal: { type: 'string' },
      budget: { type: 'string', default: 'standard' },
      first: { type: 'string' },
      'max-fights': { type: 'string' },
      seed: { type: 'string', default: '1' },
      threads: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
      top: { type: 'string', default: '10' },
      confirm: { type: 'boolean', default: false },
      'confirm-fights': { type: 'string', default: '40000' },
      json: { type: 'string' },
      race: { type: 'string' },
      duration: { type: 'string' },
      armor: { type: 'string' },
      execute: { type: 'string' },
      creature: { type: 'string' },
      position: { type: 'string' },
      profile: { type: 'string' },
      raid: { type: 'string' },
      'buffs-off': { type: 'string', default: '' },
      ratings: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (args.help) return printHelp(import.meta.url)

  const bundle = await engineBundle(ENTRY_SOURCE)
  const engine = await import(pathToFileURL(bundle).href)
  const specId = args.spec
  if (!engine.SPEC_IDS.includes(specId)) throw new Error(`--spec must be one of ${engine.SPEC_IDS.join(', ')}, got "${specId}"`)
  const meta = engine.SPEC_META[specId]
  const data = engine.TALENT_DATA[meta.classId]
  const tank = meta.role === 'tank'

  // --- What to search ---
  if (!['talents', 'rotation', 'both', 'gear', 'all'].includes(args.search)) throw new Error(`--search must be talents, rotation, both, gear or all, got "${args.search}"`)
  const searchGear = args.search === 'gear' || args.search === 'all'
  if (args.turns && searchGear) throw new Error('--turns is for talents and rotation; --search all takes turns with gear too')
  // The gear flags need a gear search: say so, rather than drop them.
  const gearFlags = ['ilvl', 'sources', 'enchants', 'per-slot', 'gear-passes', 'weight-fights', 'measure-fights']
    .filter((f) => args[f] !== undefined)
    .concat(args.lock.length ? ['lock'] : [], args['no-restarts'] ? ['no-restarts'] : [], args['include-later-raids'] ? ['include-later-raids'] : [])
  if (!searchGear && gearFlags.length) throw new Error(`${gearFlags.map((f) => `--${f}`).join(', ')} need a gear search: --search gear or --search all`)
  if (args.cycles !== undefined && args.search !== 'all') throw new Error('--cycles is for --search all')
  const options = engine.rotationOptions(specId)
  const spec = settingIds(options)
  const variants = [...args.rotation.map((r) => parseSettings(r, spec)), ...(args.sweep.length ? sweepProduct(args.sweep, spec) : [])]
  for (const v of variants) {
    if (v.some(([id]) => id === 'talents')) throw new Error('Rotation variants are rotation settings; the talent search builds the talents')
    validate(v, options)
  }
  const rotations = variants.map((v) => Object.fromEntries(v))
  const searchTalents = args.turns || ['talents', 'both', 'all'].includes(args.search)
  // A rotation-only search keeps the setup's talents with no talent constraints: say so, rather than drop the flags (OV2-2).
  if (!searchTalents) {
    const given = ['keep', 'exclude', 'min-tree'].filter((f) => args[f].length > 0).concat(['no-partials'].filter((f) => args[f]))
    if (given.length) throw new Error(`--search ${args.search} keeps the setup's talents, with no talent constraints: drop ${given.map((f) => `--${f}`).join(', ')}, or search talents too (--search both, all or --turns)`)
  }
  if ((args.turns || args.search === 'rotation' || args.search === 'both') && rotations.length === 0) throw new Error('Searching the rotation needs variants: --sweep or --rotation')
  if (args.search === 'gear' && rotations.length > 0) throw new Error("--search gear keeps the setup's rotation: drop --sweep and --rotation, or use --search all")

  const treeOf = (name) => {
    const tree = data.trees.find((t) => t.id.toLowerCase() === name.toLowerCase() || t.name.toLowerCase() === name.toLowerCase())
    if (!tree) throw new Error(`No tree "${name}" for a ${meta.classId} (${data.trees.map((t) => t.name).join(', ')})`)
    return tree.id
  }
  const talentByName = (name) => {
    const t = data.trees.flatMap((tree) => tree.talents).find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (!t) throw new Error(`No talent "${name}" for a ${meta.classId}`)
    return t
  }
  const minPoints = Object.fromEntries(
    args['min-tree'].map((text) => {
      const eq = text.lastIndexOf('=')
      if (eq < 0) throw new Error(`--min-tree is <tree>=<points>, got "${text}"`)
      return [treeOf(text.slice(0, eq).trim()), flagNumber('min-tree', text.slice(eq + 1), { min: 0, max: data.rules.maxPoints, whole: true })]
    }),
  )
  const keep = Object.fromEntries(
    list(args.keep).map((text) => {
      const eq = text.lastIndexOf('=')
      const t = talentByName(eq < 0 ? text : text.slice(0, eq).trim())
      return [t.name, eq < 0 ? t.maxRank : flagNumber('keep', text.slice(eq + 1), { min: 1, max: t.maxRank, whole: true })]
    }),
  )
  const exclude = list(args.exclude).map((name) => talentByName(name).name)
  const required = args.require.map((text) => engine.parseConstraint(text))
  // A tank keeps 90% of the default's effective health unless told otherwise (D30).
  const floorOff = args['no-ehp-floor'] || required.some((c) => c.stat === 'ehp')
  const immune = [...(args['crit-immune'] ? [engine.CRIT_IMMUNE] : []), ...(args['crush-immune'] ? [engine.CRUSH_IMMUNE] : [])]
  if (immune.length && !tank) throw new Error('--crit-immune and --crush-immune are for tanks: the boss attacks only a tank')
  const constraints = [...(floorOff ? [] : engine.defaultConstraints(meta.role)), ...required, ...immune]

  // --- The setup, as rotation.mjs builds it ---
  const seed = flagNumber('seed', args.seed, { min: 0, max: 0xffffffff, whole: true })
  const threads = flagNumber('threads', args.threads, { min: 1, whole: true })
  const top = flagNumber('top', args.top, { min: 1, whole: true })
  // --faction: the class's default race of that faction, unless --race names one (it must be of that faction).
  let race = args.race
  if (args.faction !== undefined) {
    const faction = { alliance: 'Alliance', horde: 'Horde' }[args.faction.toLowerCase()]
    if (!faction) throw new Error(`--faction must be alliance or horde, got "${args.faction}"`)
    const legal = racesJson.races.filter((r) => r.faction === faction && (r.classes.forever ?? []).includes(meta.classId))
    if (legal.length === 0) throw new Error(`No ${faction} race can be a ${meta.classId}`)
    const fallback = engine.defaultConfig(specId).race
    if (race !== undefined && !legal.some((r) => r.id === race)) throw new Error(`--race ${race} isn't ${faction}`)
    race ??= legal.some((r) => r.id === fallback) ? fallback : legal[0].id
  }
  const d = engine.defaultConfig(specId, race)
  const fight = { ...d.fight }
  if (args.duration !== undefined) fight.durationSec = flagNumber('duration', args.duration)
  if (args.armor !== undefined) fight.bossArmor = flagNumber('armor', args.armor)
  if (args.execute !== undefined) fight.executePct = flagNumber('execute', args.execute)
  if (args.creature !== undefined) fight.creatureType = args.creature
  if (args.position !== undefined) fight.position = args.position
  const rules = { ...d.rules, ...(args.profile === undefined ? {} : { profile: args.profile }) }
  if (args.ratings !== undefined) {
    if (!['apply', 'ignore'].includes(args.ratings)) throw new Error(`--ratings must be apply or ignore, got "${args.ratings}"`)
    rules.unmeasuredRatings = args.ratings
  }
  const raid = raidBuffs(engine, d, args.raid)
  const buffsOff = args['buffs-off'] ? args['buffs-off'].split(',').map((b) => b.trim()) : []
  for (const b of buffsOff) if (!d.buffs.enabled.includes(b)) throw new Error(`--buffs-off: ${b} isn't on in ${specId}'s default setup (${d.buffs.enabled.join(', ')})`)
  const config = {
    ...d,
    ...(args.talents === undefined ? {} : { talents: args.talents }),
    buffs: { raid: raid.raid, enabled: raid.enabled.filter((b) => !buffsOff.includes(b)) },
    fight,
    rules,
    run: { mode: 'fixed', iterations: 0, seed },
  }
  const { warnings } = engine.normalizeConfig({ ...config, run: { ...d.run, mode: 'fixed', seed } })
  if (warnings.length > 0) throw new Error(warnings.join('\n'))
  if (args.talents !== undefined) {
    const problems = engine.validateTalentBuild(data, engine.decodeTalentCode(data, args.talents))
    if (problems.length > 0) throw new Error(`--talents ${args.talents}: ${problems[0]}`)
  }

  const goal = args.goal ?? engine.defaultGoal(meta.role)
  if (!engine.GOALS.includes(goal)) throw new Error(`--goal must be one of ${engine.GOALS.join(', ')}, got "${goal}"`)
  // Balanced for a DPS spec is DPS alone; Defense is a tank's (it throws for a DPS spec, saying why).
  const scored = engine.scoredGoal(goal, meta.role)
  // The score's units. Defense's score is minus the damage taken a second: a positive change is less damage taken.
  const unit = { balanced: ' (pts)', defense: ' (less taken/s)', dps: '', tps: '' }[scored]
  const units = { balanced: ' points', defense: ' less damage taken a second', dps: ' DPS', tps: ' TPS' }[scored]
  const budget = engine.BUDGETS[args.budget] ?? { fights: flagNumber('budget', args.budget, { min: 100, whole: true }) }
  if (args.first !== undefined) budget.initialFights = flagNumber('first', args.first, { min: 2, whole: true })
  const maxFights = args['max-fights'] === undefined ? engine.MAX_SEARCH_FIGHTS : flagNumber('max-fights', args['max-fights'], { min: 1, whole: true })

  console.log(
    [
      `${specId}, ${d.race}`,
      `${fight.durationSec} s ± ${fight.durationVariationPct}%`,
      `armor ${fight.bossArmor}`,
      `execute ${fight.executePct}%`,
      `creature ${fight.creatureType}`,
      fight.position,
      `profile ${rules.profile}`,
      `ratings ${rules.unmeasuredRatings}`,
      ...(args.raid === undefined ? [] : [`raid ${raid.raid.join(',')}`]),
      ...(buffsOff.length ? [`Buffs off: ${buffsOff.join(', ')}`] : []),
      `seed ${seed}`,
    ].join('; '),
  )
  console.log(`baseline: ${args.talents === undefined ? 'the defaults' : 'the defaults with --talents'}, talents ${config.talents}`)
  const goalText = {
    defense: 'Defense (the least damage taken a second; the most TPS breaks a tie)',
    dps: 'DPS (the least damage taken breaks a tie)',
    tps: 'TPS (the least damage taken breaks a tie)',
    balanced: 'Balanced (Δ TPS % + Δ DPS %, relative to the baseline; the least damage taken breaks a tie)',
  }
  console.log(
    `goal: ${goal === scored ? goalText[goal] : `${goal}, which for a DPS spec is ${goalText[scored]}`}; budget ${args.budget} (${count(budget.fights)} fights)` +
      (constraints.length ? `; constraints ${constraints.map(engine.formatConstraint).join(', ')}` : ''),
  )
  // The hard ceiling (D30, OGV-2), and roughly how long it could take, before anything runs: the
  // rough pace scaled by the fight's length (OGV2-3).
  const perThread = Math.round((PER_THREAD * PACE_FIGHT_SEC) / fight.durationSec)
  const rough = `at a rough ${count(perThread)} fights a second a thread${fight.durationSec === PACE_FIGHT_SEC ? '' : ` (${count(PER_THREAD)} at ${PACE_FIGHT_SEC} s fights, scaled to ${fight.durationSec} s)`}`
  console.log(
    `ceiling: at most ${plural(maxFights, 'fight')} for the whole search${args['max-fights'] === undefined ? ' (the cap, thorough’s budget)' : ' (--max-fights)'}; the budget ${count(budget.fights)} is ${duration(Math.min(budget.fights, maxFights) / (threads * perThread))} and the cap ${duration(maxFights / (threads * perThread))} ${rough}`,
  )

  // --- The gear search's filters ---
  let filters
  if (searchGear) {
    filters = {}
    if (args.ilvl !== undefined) {
      const m = /^(\d*)-(\d*)$/.exec(args.ilvl.trim())
      if (!m || (m[1] === '' && m[2] === '')) throw new Error(`--ilvl is <min>-<max>, "60-" or "-66", got "${args.ilvl}"`)
      filters.itemLevel = { ...(m[1] ? { min: Number(m[1]) } : {}), ...(m[2] ? { max: Number(m[2]) } : {}) }
    }
    if (args.sources !== undefined) {
      const sources = list([args.sources])
      for (const x of sources) if (!engine.GEAR_SOURCES.includes(x)) throw new Error(`--sources: "${x}" isn't one of ${engine.GEAR_SOURCES.join(', ')}`)
      filters.sources = sources
    }
    const locked = list(args.lock)
    for (const x of locked) if (!engine.SEARCHED_SLOTS.includes(x)) throw new Error(`--lock: "${x}" isn't a slot (${engine.SEARCHED_SLOTS.join(', ')})`)
    if (locked.length) filters.locked = locked
    if (args.enchants !== undefined) {
      if (args.enchants !== 'all') throw new Error(`--enchants takes "all", got "${args.enchants}"`)
      filters.excludedEnchants = []
    }
    if (args['include-later-raids']) filters.laterRaids = true
    const f = filters
    console.log(
      `gear: ${f.laterRaids ? 'every raid, the later ones opted in' : `pre-raid gear and the launch raids (no item above item level ${engine.PRE_RAID_MAX_ITEM_LEVEL} on no pre-raid list, no Zul'Gurub; --include-later-raids searches them)`}; ` +
        `${f.itemLevel ? `item level ${f.itemLevel.min ?? ''}-${f.itemLevel.max ?? ''}` : 'every item level'}; ${f.sources ? `sources ${f.sources.join(', ')}` : 'every source'}; ${d.race} (${racesJson.races.find((r) => r.id === d.race)?.faction ?? '?'} gear)` +
        `${f.locked ? `; locked ${f.locked.join(', ')}` : ''}; ${f.excludedEnchants ? 'every enchant' : `every enchant but ${engine.UNCONFIRMED_ENCHANTS.join(', ')}`}`,
    )
  }
  const gearOptions = {
    ...(args['per-slot'] !== undefined ? { perSlot: flagNumber('per-slot', args['per-slot'], { min: 1, max: 20, whole: true }) } : {}),
    ...(args['no-restarts'] ? { restarts: false } : {}),
    ...(args['gear-passes'] !== undefined ? { passes: flagNumber('gear-passes', args['gear-passes'], { min: 1, whole: true }) } : {}),
    // At least a ranking's floor (MIN_RANK_FIGHTS, 50): fewer would leave the weights' and swaps' intervals too wide to rank by (O2L-12).
    ...(args['weight-fights'] !== undefined ? { weightFights: flagNumber('weight-fights', args['weight-fights'], { min: engine.MIN_RANK_FIGHTS, whole: true }) } : {}),
    ...(args['measure-fights'] !== undefined ? { measureFights: flagNumber('measure-fights', args['measure-fights'], { min: engine.MIN_RANK_FIGHTS, whole: true }) } : {}),
  }

  if (args.turns)
    console.log(`in turns: each pass but the last runs at most ${Math.round(100 * (1 - engine.TURNS_RESERVE))}% of what's left of the cap, holding back the rest for the passes after it`)

  const runner = threadRunner(engine, bundle, threads)
  const started = performance.now()
  let lastRound = -1
  // In turns, a pass's header prints on its first progress event, before its space and rounds (OV2-6).
  let pendingPass = args.turns ? 0 : null
  const talents = searchTalents ? { ...(Object.keys(minPoints).length ? { minPoints } : {}), keep, exclude, searchPartials: !args['no-partials'], screenFights: flagNumber('screen-fights', args['screen-fights'], { min: 10, whole: true }) } : undefined
  const common = {
    config,
    goal,
    constraints,
    budget,
    maxFights,
    runner,
    top,
    onProgress: (p) => {
      if (pendingPass !== null) {
        console.log(`\n=== pass ${pendingPass + 1}: ${pendingPass % 2 === 0 ? 'talents' : 'rotation'} ===`)
        pendingPass = null
      }
      if (p.phase === 'space') {
        describeSpace(p)
        console.log(`${plural(p.candidates, 'candidate')}, each paired with the baseline; first round ${plural(p.budget.initialFights, 'fight')} each${p.budget.fights !== budget.fights ? `, budget ${plural(p.budget.fights, 'fight')}` : ''}`)
        for (const note of p.notes) console.log(`  note: ${note}`)
        // Before the race's first fight: the most it can run, and how long at the screen's pace (OGV-2).
        const e = p.estimate
        const pace = e.seconds !== undefined ? `, ${duration(e.seconds)} at the screen's pace` : `, ${duration(e.raceFights / (threads * perThread))} ${rough}`
        console.log(`estimate: the race runs at most ${plural(e.raceFights, 'fight')}${pace}; the search at most ${plural(e.fights, 'fight')} with the screen's ${count(e.screenFights)} (the cap is ${count(p.budget.cap)})`)
      }
      if (p.phase === 'race' && p.jobsDone === p.jobs && p.round !== lastRound) {
        lastRound = p.round
        process.stdout.write(`  round ${p.round}: ${plural(p.survivors, 'survivor')}, ${plural(p.fightsPerCandidate, 'fight')} each, ${count(p.spent)} of ${plural(p.budget, 'fight')}\n`)
      }
    },
  }
  let reports
  /** Every fight the search ran, when its reports don't count them all (a gear search's rankings and steps). */
  let searchFights
  /** The gear passes' own reports (starts, steps, weights), for the JSON. */
  const gearReports = []
  const onGearProgress = (p) => {
    if (p.phase === 'rank') console.log(`  ${p.start}, pass ${p.pass}: ranked the slots (stat weights and measured swaps, ${plural(p.fights, 'fight')}); ${count(p.spent)} of ${count(p.budget)}`)
    else if (p.phase === 'step') console.log(`    ${p.group}: ${plural(p.candidates, 'candidate')}, ${p.changed ? 'CHANGED' : 'kept'} (${plural(p.fights, 'fight')})`)
    else console.log(`  final race: ${plural(p.ends, 'end')} of the starts, with the setup; ${count(p.spent)} of ${count(p.budget)} spent`)
  }
  const gearPass = (g) => {
    gearReports.push(g)
    console.log('')
    for (const s of g.starts) {
      console.log(`start ${s.name}: ${count(s.passes)} ${s.passes === 1 ? 'pass' : 'passes'}, ${s.stable ? 'stable' : 'not stable (passes or budget ran out)'}, ${plural(s.fights, 'fight')}`)
      const changes = engine.describeGearChange(config.gear, s.end, filters)
      for (const c of changes.length ? changes : ["(the setup's gear)"]) console.log(`    ${c}`)
    }
    for (const note of g.notes) console.log(`  note: ${note}`)
    console.log(`gear search: ${plural(g.fights, 'fight')} of its budget of ${count(g.budget.fights)}, in ${(g.ms / 1000).toFixed(1)} s`)
    // The first ranking's weights, at the setup's gear with the most fights, each with its 95% interval (O2L-8).
    const w = g.ranking.weights
    const shown = Object.entries(w.weights).filter(([, v]) => Math.abs(v) > 1e-9).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 12)
    if (shown.length)
      console.log(
        `stat weights (the first ranking, at the setup's gear, ${plural(g.ranking.weightFights, 'fight')} a plan; score per point, 95%): ${shown.map(([k, v]) => `${k} ${fmt(v, 3)} ± ${fmt(w.intervals[k]?.halfWidth ?? 0, 3)}`).join(', ')}`,
      )
    if (g.final) printStandings(g.final)
    else console.log('the final race did not run')
  }
  try {
    if (args.search === 'gear') {
      const g = await engine.optimizeGear({ ...gearOptions, config, goal, filters, constraints, budget, maxFights, runner, top, onProgress: onGearProgress })
      gearPass(g)
      reports = g.final ? [g.final] : []
      searchFights = g.fights
    } else if (args.search === 'all') {
      const passes = await engine.optimizeTogether({
        ...common,
        talents,
        rotations,
        filters,
        gearOptions,
        ...(args.cycles !== undefined ? { cycles: flagNumber('cycles', args.cycles, { min: 1, whole: true }) } : {}),
        onGearProgress,
        onPass: (p, i) => {
          console.log(`\n=== pass ${i + 1}: ${p.kind}${p.moved ? '' : ' (nothing moved)'} ===`)
          if (p.kind === 'gear') gearPass(p.report)
          else report(p.report)
        },
      })
      reports = passes.map((p) => (p.kind === 'gear' ? p.report.final : p.report)).filter(Boolean)
      searchFights = passes.reduce((n, p) => n + p.report.fights, 0)
    } else if (args.turns) {
      reports = await engine.optimizeInTurns({ ...common, talents, rotations, onPass: (r, pass) => report(r, pass) })
    } else {
      const r = await engine.optimize({ ...common, talents, rotations: args.search === 'talents' ? [] : rotations })
      report(r)
      reports = [r]
    }
  } finally {
    await runner.close()
  }
  if (reports.length === 0) {
    console.log('\nno answer: the final race did not run')
    return
  }
  const stopped = reports[reports.length - 1].turnsStopped
  if (stopped) console.log(`\nturns: ${stopped}`)
  function report(r, pass) {
    lastRound = -1
    printStandings(r)
    if (pass !== undefined) pendingPass = pass + 1
  }
  function describeSpace(r) {
    if (r.screen) {
      const by = (role) => r.screen.verdicts.filter((v) => v.role === role)
      const tieName = scored === 'defense' ? 'TPS' : 'damage taken'
      console.log(
        `\ntalent screen for ${scored} (${plural(r.screen.fights, 'fight')}): ${by('objective').length} objective, ${by('tie-break').length} tie-break only (${tieName}), ${by('none').length} no effect, ${by('harmful').length} harmful`,
      )
      const effect = (v) => (v.effect ? ` ${fmt(v.effect.mean)}` : '')
      const tieEffect = (v) => (v.tieEffect ? ` ${fmt(v.tieEffect.mean)}` : '')
      console.log(`  objective (score change at max rank${scored === 'defense' ? ': less damage taken a second' : ''}): ${by('objective').map((v) => `${v.name}${effect(v)}`).join(', ')}`)
      if (by('harmful').length) console.log(`  harmful (never taken unless kept or a constraint reads it): ${by('harmful').map((v) => `${v.name}${effect(v)}`).join(', ')}`)
      if (by('tie-break').length)
        console.log(`  tie-break only (fillers, those that help the tie-break most first; ${scored === 'defense' ? 'more TPS' : 'less damage taken a second'}): ${by('tie-break').map((v) => `${v.name}${tieEffect(v)}`).join(', ')}`)
    }
    if (r.space) {
      // The dimensions: the objective talents, and those a constraint made one (OV3-6).
      const dims = r.space.dimensions
      const objectiveIds = new Set((r.screen?.verdicts ?? []).filter((v) => v.role === 'objective').map((v) => v.id))
      const others = dims.filter((d) => !objectiveIds.has(d.id)).map((d) => d.name)
      const dimensions = `${dims.length} dimensions (${dims.length - others.length} objective${others.length ? ` + ${others.join(', ')}` : ''})`
      console.log(
        `talent space: ${plural(r.space.builds, 'build')}${r.space.truncated ? ' (truncated)' : ''} from ${dimensions}, ${r.space.searchPartials ? 'every rank of one talent a build' : 'max ranks only'}; ${plural(r.space.cores, 'legal core')}, ${count(r.space.dominated)} dominated`,
      )
      // Plainly, when the ceiling narrowed it (OGV-2): the note below says why.
      const n = r.space.narrowed
      if (n)
        console.log(
          `  NARROWED to max ranks: every rank of one talent a build makes ${n.atLeast ? 'more than ' : ''}${plural(n.atLeast ? n.builds - 1 : n.builds, 'build')}, past ${n.passes === 'builds' ? 'the 200,000 builds a search lists' : `the fights the cap races at ${engine.FIRST_ROUND_MIN} each`}`,
        )
      const kept = Object.keys(keep)
      if (kept.length) console.log(`  kept (--keep): ${kept.join(', ')}`)
      const name = (id) => data.trees.flatMap((t) => t.talents).find((t) => t.id === id).name
      if (r.space.constrained.length) console.log(`  searched for the constraints (they change what a limit reads): ${r.space.constrained.map(name).join(', ')}`)
      if (r.space.notBinding?.length)
        console.log(`  not searched for the constraints (every build meets them with these as fillers): ${r.space.notBinding.map(name).join(', ')}`)
      if (r.space.minPoints && Object.values(r.space.minPoints).some((n) => n > 0))
        console.log(`  minimum points: ${Object.entries(r.space.minPoints).map(([t, n]) => `${t} ${n}${t in minPoints ? '' : " (the tank's default)"}`).join(', ')}`)
    }
    if (r.excluded.talents) console.log(`  left out for a talent constraint: ${plural(r.excluded.talents, 'candidate')}`)
    if (r.excluded.sheet) console.log(`  left out for a sheet constraint: ${plural(r.excluded.sheet, 'candidate')}`)
    if (r.setupFails.length) console.log(`  the setup itself fails ${r.setupFails.join(', ')}: it's the baseline every candidate is measured against, never an answer`)
  }
  function printStandings(r) {
    const race = r.race
    const describe = (c) => {
      const cand = r.candidates[c]
      if (engine.isSetup(config, cand)) return 'the setup itself'
      const changes = engine.describeBuildChange(data, config.talents, cand.talents)
      const rot = Object.entries(cand.rotation).map(([id, v]) => `${id.startsWith(spec.prefix) ? id.slice(spec.prefix.length) : id}=${v}`)
      const gear = engine.describeGearChange(config.gear, cand.gear ?? config.gear, filters)
      return [...changes, ...rot, ...gear].join('; ')
    }
    console.log('')
    if (race.standings.length === 0) console.log('no candidate raced')
    else {
      console.log(`| # | Build | Changes from the default | ${tank ? 'TPS | ' : ''}DPS | ${tank ? 'Taken/s | Health | EHP | Boss crit | Boss crush | ' : ''}Δ score${unit} (95% CI) |${tank ? ' Δ TPS (95% CI) | Δ DPS (95% CI) | Δ taken (95% CI) |' : ' Δ DPS % |'} Fights | State |`)
      console.log(`| --- | --- | --- | ${tank ? '--- | ' : ''}--- | ${tank ? '--- | --- | --- | --- | --- | ' : ''}--- |${tank ? ' --- | --- | --- |' : ' --- |'} --- | --- |`)
      race.standings.forEach((s, i) => {
        const cand = r.candidates[s.candidate]
        const sheet = r.sheets[s.candidate]
        const state =
          s.state === 'dropped' ? `dropped r${s.droppedInRound}` : s.state
        console.log(
          `| ${i + 1} | \`${cand.talents}\` | ${describe(s.candidate)} | ${tank ? `${s.mean.tps.toFixed(1)} | ` : ''}${s.mean.dps.toFixed(1)} | ${tank ? `${s.mean.taken.toFixed(1)} | ${Math.round(sheet.health)} | ${Math.round(sheet.ehp)} | ${chance(sheet.bossCritPct)} | ${chance(sheet.bossCrushPct)} | ` : ''}${ci(s.vsBaseline.score)} |` +
            (tank ? ` ${ci(s.vsBaseline.tps, 1)} | ${ci(s.vsBaseline.dps, 1)} | ${ci(s.vsBaseline.taken, 1)} |` : ` ${pct((100 * s.vsBaseline.dps.mean) / race.baseline.dps)} |`) +
            ` ${count(s.fights)} | ${state}${s.ties.length ? `, ${s.ties.length} ties` : ''} |`,
        )
      })
    }
    console.log('')
    const bs = r.sheets[0]
    console.log(`baseline: TPS ${race.baseline.tps.toFixed(1)}, DPS ${race.baseline.dps.toFixed(1)}${tank ? `, taken ${race.baseline.taken.toFixed(1)}/s, health ${Math.round(bs.health)}, EHP ${Math.round(bs.ehp)}, boss crit ${chance(bs.bossCritPct)}, crush ${chance(bs.bossCrushPct)}` : ''} over ${count(race.baseline.fights)} fights`)
    const seconds = r.ms / 1000
    const speed = `${plural(r.fights, 'fight')} in ${seconds.toFixed(1)} s on ${plural(threads, 'thread')}: ${count(Math.round(r.fights / seconds))} fights a second`
    if (race.leader === null) {
      console.log('result: no setup meets these constraints:')
      for (const line of r.blocked) console.log(`  - ${line}`)
      console.log(speed)
      return
    }
    console.log(
      race.status === 'separated'
        ? `result: the leader clears every other candidate at 95% (D23's bar) after ${plural(race.rounds.length, 'round')}`
        : `result: the budget ran out after ${plural(race.rounds.length, 'round')} with ${plural(race.unseparated.length, 'candidate')} the leader isn't clear of at 95%` +
            (race.closest ? `; the closest (\`${r.candidates[race.closest.candidate].talents}\`: ${describe(race.closest.candidate)}) is ${ci(race.closest.vsLeader)}${units} behind (95% CI)` : ''),
    )
    const leader = race.standings.find((s) => s.candidate === race.leader)
    const beatsBase = leader.vsBaseline.score.mean - leader.vsBaseline.score.halfWidth > 0
    const own = engine.isSetup(config, r.candidates[race.leader])
    const below = leader.vsBaseline.score.mean + leader.vsBaseline.score.halfWidth < 0
    console.log(
      `leader vs the default: ${ci(leader.vsBaseline.score)}${units}${own ? ' (the setup itself leads)' : beatsBase ? ', above zero' : below ? ', below the default, which fails a constraint' : ', not clear of the default'}`,
    )
    console.log(speed)
  }

  // --- D23's confirmation on a fresh seed ---
  const final = reports[reports.length - 1]
  const winner = final.race.leader === null ? null : final.candidates[final.race.leader]
  let confirmation
  if (args.confirm && winner === null) console.log('\nconfirmation: no setup meets the constraints, so there is nothing to confirm')
  else if (args.confirm && engine.isSetup(config, winner)) console.log('\nconfirmation: the setup itself leads, so there is nothing to confirm')
  else if (args.confirm) {
    const asked = flagNumber('confirm-fights', args['confirm-fights'], { min: engine.MIN_CONFIRM_FIGHTS, whole: true })
    // The check counts under the cap (OGV2-2): its two runs, each the winner and the default, get what
    // the search left of it, and no more than asked for.
    // A gear pass's fights are its rankings', steps' and final race's, not only the final race's.
    const spent = searchFights ?? reports.reduce((n, r) => n + r.fights, 0)
    const fit = engine.confirmFights(asked, maxFights - spent, 2)
    if (fit === null)
      console.log(
        `\nconfirmation: the search left ${plural(Math.max(0, maxFights - spent), 'fight')} of the cap's ${count(maxFights)}, fewer than the ${count(4 * engine.MIN_CONFIRM_FIGHTS)} the check needs at ${count(engine.MIN_CONFIRM_FIGHTS)} each; raise --max-fights to confirm`,
      )
    else await confirmWinner(fit.fights, fit.clamped ? `the search left ${plural(maxFights - spent, 'fight')} of the cap's ${count(maxFights)}, so the check runs ${count(fit.fights)} each rather than the ${count(asked)} asked for` : undefined)
  }
  async function confirmWinner(confirmFights, clampNote) {
    if (clampNote) console.log(`\nnote: ${clampNote}`)
    // A seed the search never used.
    const fresh = (seed + 0x9e3779b9) >>> 0
    const runner2 = threadRunner(engine, bundle, threads)
    try {
      const main = await engine.confirm({ config, candidate: winner, goal: scored, seed: fresh, fights: confirmFights, runner: runner2 })
      const flipped = { ...config, rules: { ...config.rules, unmeasuredRatings: config.rules.unmeasuredRatings === 'apply' ? 'ignore' : 'apply' } }
      const other = await engine.confirm({ config: flipped, candidate: winner, goal: scored, seed: fresh, fights: confirmFights, runner: runner2 })
      confirmation = { main, ratingsFlipped: { ...other, unmeasuredRatings: flipped.rules.unmeasuredRatings } }
      console.log(`\nconfirmation on fresh seed ${fresh}, ${plural(confirmFights, 'fight')} each, winner vs the default:`)
      console.log(`  score ${ci(main.vsBaseline.score)}${units}, TPS ${ci(main.vsBaseline.tps, 1)}, DPS ${ci(main.vsBaseline.dps, 1)}, taken ${ci(main.vsBaseline.taken, 1)}: ${main.clears ? 'clears D23’s bar' : 'does NOT clear D23’s bar'}`)
      console.log(`  with unmeasured ratings ${flipped.rules.unmeasuredRatings}: score ${ci(other.vsBaseline.score)}: ${other.clears ? 'clears' : 'does not clear'}${main.clears !== other.clears ? ' (the winner depends on the unmeasured ratings, D12)' : ''}`)
      // The [?] assumptions the gain can flow through: the sim can't switch them off, so it names them.
      const a = main.assumptions
      const names = (list) => list.map((x) => x.id).join(', ')
      console.log(`  [?] assumptions only the winner relies on: ${a.winnerOnly.length ? names(a.winnerOnly) : 'none'}`)
      if (a.winnerOnly.length) for (const x of a.winnerOnly) console.log(`    - ${x.id}: ${x.text} (${x.docRef})`)
      console.log(`  [?] assumptions only the default relies on: ${a.baselineOnly.length ? names(a.baselineOnly) : 'none'}`)
      console.log(`  [?] assumptions both rely on (the gain can flow through these too; the sim can't switch them off): ${a.shared.length ? names(a.shared) : 'none'}`)
    } finally {
      await runner2.close()
    }
  }

  // --- The report ---
  const path = args.json ?? join(ROOT, '.cache/optimize', `${specId}-${seed}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  mkdirSync(dirname(path), { recursive: true })
  const annotate = (r) => ({
    ...r,
    race: {
      ...r.race,
      standings: r.race.standings.map((s) => ({
        ...s,
        talents: r.candidates[s.candidate].talents,
        rotation: r.candidates[s.candidate].rotation,
        ...(r.candidates[s.candidate].gear ? { gear: r.candidates[s.candidate].gear, gearChanges: engine.describeGearChange(config.gear, r.candidates[s.candidate].gear, filters) } : {}),
        changes: engine.describeBuildChange(data, config.talents, r.candidates[s.candidate].talents),
      })),
    },
  })
  writeFileSync(
    path,
    JSON.stringify(
      {
        setup: { spec: specId, seed, goal, scoredGoal: scored, budget, maxFights, args, config, ...(filters ? { filters } : {}) },
        passes: reports.map(annotate),
        ...(gearReports.length
          ? { gear: gearReports.map((g) => ({ ranking: g.ranking, starts: g.starts.map((s) => ({ ...s, endChanges: engine.describeGearChange(config.gear, s.end, filters) })), notes: g.notes, budget: g.budget, fights: g.fights })) }
          : {}),
        winner,
        ...(winner?.gear ? { winnerGearChanges: engine.describeGearChange(config.gear, winner.gear, filters) } : {}),
        confirmation,
        seconds: (performance.now() - started) / 1000,
      },
      null,
      1,
    ),
  )
  console.log(`\nreport: ${relative(process.cwd(), path)}`)
}

if (isMainThread) {
  main().catch((error) => {
    console.error(error.message ?? error)
    process.exit(1)
  })
}
