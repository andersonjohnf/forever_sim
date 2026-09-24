// The optimizer: the best talents (and rotation settings) for a setup, found by the sim itself
// (decision D30; docs/optimizer.md). It screens the class's talents for what the sim can measure,
// builds every sensible build under the constraints, and races them on common random numbers:
// every candidate runs the same fights, and each round drops those clearly worse than the leader,
// until the leader is clear of every survivor at 95% (D23's bar) or the budget runs out.
//
// The engine is bundled from the current src/ as rotation.mjs does (lib.mjs), and the fights run on
// worker threads; the result doesn't depend on how many.
//
//   npm run optimize -- --spec warrior-protection
//   npm run optimize -- --spec druid-feral-bear --budget thorough --confirm
//   npm run optimize -- --spec paladin-protection --require "health>=100%" --crush-immune
//   npm run optimize -- --spec warrior-fury --metric dps --keep "Precision"
//   npm run optimize -- --spec warrior-arms --search rotation --sweep heroicStrike.minRage=40:70:10
//   npm run optimize -- --spec druid-feral-bear --search both --sweep maul.minRage=10:40:10
//   npm run optimize -- --spec druid-feral-bear --turns --sweep maul.minRage=10:40:10
//
// The setup as it is is the baseline: every candidate is measured against it, fight for fight, but
// it's never the answer. Every answer meets every constraint below; the setup itself races as a
// candidate like any other when it does. When none does, the tool says which constraints block.
//
// What to search:
//   --search talents      talents (the default); the setup's rotation
//   --search rotation     rotation settings only (--sweep and --rotation give the variants); the setup's
//                         talents, with no talent constraints
//   --search both         every build with every rotation variant, and with the setup's own rotation
//   --turns               talents, then the rotation variants with the winning build, then talents again,
//                         until a pass keeps its start (docs/optimizer.md#talents-and-rotation-together).
//                         Every pass races its start too, and holds every candidate to every constraint.
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
//   --keep <talent>[=r]   in every build at rank r (default: its max); repeatable, or comma-separated. Kept
//                         talents extend the survival floor for this search
//   --exclude <talent>    never taken; repeatable, or comma-separated
//   --no-floor            drop the spec's survival floor (a tank's; docs/classes/*.md "Survival floor")
//   --partials            search partial ranks too, one per build (a far larger space)
//   --screen-fights <n>   fights per plan in the talent screen (default 400)
//
// Constraints on the result (docs/optimizer.md#constraints), repeatable:
//   --require <limit>     name>=value or name<=value; a % makes it a share of the baseline's value.
//                         Sheet: ehp (effective health: health ÷ (1 − armor's reduction vs the boss)),
//                         health, armor, stamina, defense, dodgePct, parryPct, blockPct, blockValue,
//                         critReductionPct, hitPct, critPct, attackPower, bossCritPct and bossCrushPct
//                         (the boss's crit and crushing blow chances against you). Results: dps, tps,
//                         taken (damage taken per second). "ehp>=95%", "health>=8000", "taken<=102%".
//   --no-ehp-floor        drop a tank's default floor, 90% of the default's effective health (D30)
//   --crit-immune         the boss can't crit you (bossCritPct<=0: 440 defense vs a level-63 boss, on the
//                         table with no block buff up); off by default
//   --crush-immune        the boss can't crush you (bossCrushPct<=0: miss, dodge, parry and block fill the
//                         table; a Protection paladin's with Holy Shield up); off by default
//
// The search:
//   --metric dps|tps|balanced   what to maximize (default: D30's, dps for DPS specs, balanced for tanks:
//                         the sum of the TPS and DPS changes relative to the setup's own)
//   --budget quick|standard|thorough|<fights>   fights for the whole race (default standard: 1.5M, 6M, 24M).
//                         A space too big for it runs a smaller first round, or a larger budget, and says so
//   --first <n>           fights each candidate runs in the first round (default: 30% of the budget, 50 to 1,000)
//   --seed <n>            the master seed, 0 to 4294967295 (default 1)
//   --threads <n>         worker threads (default: available cores − 1)
//   --top <n>             standings to show (default 10)
//   --confirm             D23's check: the winner against the setup on a fresh seed, and again with the
//                         unmeasured ratings switched (D12), to say whether the winner depends on them; and
//                         the [?] assumptions only the winner (or only the setup) relies on
//   --confirm-fights <n>  fights each in the check (default 40000)
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
      'no-floor': { type: 'boolean', default: false },
      'no-ehp-floor': { type: 'boolean', default: false },
      'crit-immune': { type: 'boolean', default: false },
      'crush-immune': { type: 'boolean', default: false },
      talents: { type: 'string' },
      partials: { type: 'boolean', default: false },
      'screen-fights': { type: 'string', default: '400' },
      require: { type: 'string', multiple: true, default: [] },
      metric: { type: 'string' },
      budget: { type: 'string', default: 'standard' },
      first: { type: 'string' },
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
  if (!['talents', 'rotation', 'both'].includes(args.search)) throw new Error(`--search must be talents, rotation or both, got "${args.search}"`)
  const options = engine.rotationOptions(specId)
  const spec = settingIds(options)
  const variants = [...args.rotation.map((r) => parseSettings(r, spec)), ...(args.sweep.length ? sweepProduct(args.sweep, spec) : [])]
  for (const v of variants) {
    if (v.some(([id]) => id === 'talents')) throw new Error('Rotation variants are rotation settings; the talent search builds the talents')
    validate(v, options)
  }
  const rotations = variants.map((v) => Object.fromEntries(v))
  const searchTalents = args.turns || args.search !== 'rotation'
  if ((args.turns || args.search !== 'talents') && rotations.length === 0) throw new Error('Searching the rotation needs variants: --sweep or --rotation')

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
  const floorOff = args['no-ehp-floor'] || required.some((c) => c.on === 'sheet' && c.stat === 'ehp')
  const immune = [...(args['crit-immune'] ? [engine.CRIT_IMMUNE] : []), ...(args['crush-immune'] ? [engine.CRUSH_IMMUNE] : [])]
  if (immune.length && !tank) throw new Error('--crit-immune and --crush-immune are for tanks: the boss attacks only a tank')
  const constraints = [...(floorOff ? [] : engine.defaultConstraints(meta.role)), ...required, ...immune]

  // --- The setup, as rotation.mjs builds it ---
  const seed = flagNumber('seed', args.seed, { min: 0, max: 0xffffffff, whole: true })
  const threads = flagNumber('threads', args.threads, { min: 1, whole: true })
  const top = flagNumber('top', args.top, { min: 1, whole: true })
  const d = engine.defaultConfig(specId, args.race)
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

  const objective = args.metric ?? engine.defaultObjective(meta.role)
  if (!engine.OBJECTIVES.includes(objective)) throw new Error(`--metric must be one of ${engine.OBJECTIVES.join(', ')}, got "${objective}"`)
  const budget = engine.BUDGETS[args.budget] ?? { fights: flagNumber('budget', args.budget, { min: 100, whole: true }) }
  if (args.first !== undefined) budget.initialFights = flagNumber('first', args.first, { min: 2, whole: true })

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
  console.log(
    `objective: ${objective === 'balanced' ? 'balanced (Δ TPS % + Δ DPS %, relative to the baseline)' : objective.toUpperCase()}; budget ${args.budget} (${count(budget.fights)} fights)` +
      (constraints.length ? `; constraints ${constraints.map(engine.formatConstraint).join(', ')}` : ''),
  )

  const runner = threadRunner(engine, bundle, threads)
  const started = performance.now()
  let lastRound = -1
  const talents = searchTalents ? { ...(Object.keys(minPoints).length ? { minPoints } : {}), keep, exclude, floor: !args['no-floor'], searchPartials: args.partials, screenFights: flagNumber('screen-fights', args['screen-fights'], { min: 10, whole: true }) } : undefined
  const common = {
    config,
    objective,
    constraints,
    budget,
    runner,
    top,
    onProgress: (p) => {
      if (p.phase === 'space') {
        describeSpace(p)
        console.log(`candidates: ${count(p.candidates)}, each paired with the baseline; first round ${count(p.budget.initialFights)} fights each${p.budget.fights !== budget.fights ? `, budget ${count(p.budget.fights)} fights` : ''}`)
        for (const note of p.notes) console.log(`  note: ${note}`)
      }
      if (p.phase === 'race' && p.jobsDone === p.jobs && p.round !== lastRound) {
        lastRound = p.round
        process.stdout.write(`  round ${p.round}: ${count(p.survivors)} survivors, ${count(p.fightsPerCandidate)} fights each, ${count(p.spent)} of ${count(p.budget)} fights\n`)
      }
    },
  }
  let reports
  try {
    if (args.turns) {
      reports = await engine.optimizeInTurns({ ...common, talents, rotations, onPass: (r, pass) => report(r, pass) })
    } else {
      const r = await engine.optimize({ ...common, talents, rotations: args.search === 'talents' ? [] : rotations })
      report(r)
      reports = [r]
    }
  } finally {
    await runner.close()
  }
  function report(r, pass) {
    lastRound = -1
    if (pass !== undefined) console.log(`\n=== pass ${pass + 1}: ${pass % 2 === 0 ? 'talents' : 'rotation'} ===`)
    printStandings(r)
  }
  function describeSpace(r) {
    if (r.screen) {
      const by = (role) => r.screen.verdicts.filter((v) => v.role === role)
      console.log(`\ntalent screen (${count(r.screen.fights)} fights): ${by('objective').length} objective, ${by('survival').length} survival only, ${by('none').length} no effect, ${by('harmful').length} harmful`)
      const effect = (v) => (v.effect ? ` ${fmt(v.effect.mean)}` : '')
      console.log(`  objective: ${by('objective').map((v) => `${v.name}${effect(v)}`).join(', ')}`)
      if (by('harmful').length) console.log(`  harmful (never taken unless kept): ${by('harmful').map((v) => `${v.name}${effect(v)}`).join(', ')}`)
      if (by('survival').length) console.log(`  survival only (fillers first): ${by('survival').map((v) => v.name).join(', ')}`)
    }
    if (r.space) {
      const floor = Object.keys(r.space.floor).map((id) => data.trees.flatMap((t) => t.talents).find((t) => t.id === id).name)
      console.log(`talent space: ${count(r.space.builds)} builds${r.space.truncated ? ' (truncated)' : ''} from ${r.space.dimensions.length} objective talents; ${count(r.space.cores)} legal cores, ${count(r.space.dominated)} dominated`)
      const kept = Object.keys(keep).filter((name) => !floor.includes(name))
      if (floor.length) console.log(`  survival floor kept: ${floor.join(', ')}${kept.length ? `; and kept (--keep): ${kept.join(', ')}` : ''}`)
      else if (kept.length) console.log(`  kept (--keep): ${kept.join(', ')}`)
      const name = (id) => data.trees.flatMap((t) => t.talents).find((t) => t.id === id).name
      if (r.space.constrained.length) console.log(`  searched for the constraints (they change what a limit reads): ${r.space.constrained.map(name).join(', ')}`)
      if (r.space.minPoints && Object.values(r.space.minPoints).some((n) => n > 0))
        console.log(`  minimum points: ${Object.entries(r.space.minPoints).map(([t, n]) => `${t} ${n}${t in minPoints ? '' : " (the tank's default)"}`).join(', ')}`)
    }
    const some = (n) => (n === 1 ? '1 candidate' : `${count(n)} candidates`)
    if (r.excluded.talents) console.log(`  left out for a talent constraint: ${some(r.excluded.talents)}`)
    if (r.excluded.sheet) console.log(`  left out for a sheet constraint: ${some(r.excluded.sheet)}`)
    if (r.setupFails.length) console.log(`  the setup itself fails ${r.setupFails.join(', ')}: it's the baseline every candidate is measured against, never an answer`)
  }
  function printStandings(r) {
    const race = r.race
    const describe = (c) => {
      const cand = r.candidates[c]
      if (engine.isSetup(config, cand)) return 'the setup itself'
      const changes = engine.describeBuildChange(data, config.talents, cand.talents)
      const rot = Object.entries(cand.rotation).map(([id, v]) => `${id.startsWith(spec.prefix) ? id.slice(spec.prefix.length) : id}=${v}`)
      return [...changes, ...rot].join(', ')
    }
    const unit = objective === 'balanced' ? ' (pts)' : ''
    console.log('')
    if (race.standings.length === 0) console.log('no candidate raced')
    else {
      console.log(`| # | Build | Changes from the default | ${tank ? 'TPS | ' : ''}DPS | ${tank ? 'Taken/s | Health | EHP | Boss crit | Boss crush | ' : ''}Δ score${unit} (95% CI) |${tank ? ' Δ TPS (95% CI) | Δ DPS (95% CI) | Δ taken (95% CI) |' : ' Δ DPS % |'} Fights | State |`)
      console.log(`| --- | --- | --- | ${tank ? '--- | ' : ''}--- | ${tank ? '--- | --- | --- | --- | --- | ' : ''}--- |${tank ? ' --- | --- | --- |' : ' --- |'} --- | --- |`)
      race.standings.forEach((s, i) => {
        const cand = r.candidates[s.candidate]
        const sheet = r.sheets[s.candidate]
        const state = s.state === 'dropped' ? `dropped r${s.droppedInRound}${s.droppedAs === 'infeasible' ? ' (outside a limit)' : ''}` : s.state
        console.log(
          `| ${i + 1} | \`${cand.talents}\` | ${describe(s.candidate)} | ${tank ? `${s.mean.tps.toFixed(1)} | ` : ''}${s.mean.dps.toFixed(1)} | ${tank ? `${s.mean.taken.toFixed(1)} | ${Math.round(sheet.health)} | ${Math.round(sheet.ehp)} | ${chance(sheet.bossCritPct)} | ${chance(sheet.bossCrushPct)} | ` : ''}${ci(s.vsBaseline.score)} |` +
            (tank ? ` ${ci(s.vsBaseline.tps, 1)} | ${ci(s.vsBaseline.dps, 1)} | ${ci(s.vsBaseline.taken, 1)} |` : ` ${pct((100 * s.vsBaseline.dps.mean) / race.baseline.dps)} |`) +
            ` ${count(s.fights)} | ${state}${s.feasible || s.droppedAs === 'infeasible' ? '' : ', misses a limit'}${s.ties.length ? `, ${s.ties.length} ties` : ''} |`,
        )
      })
    }
    console.log('')
    const bs = r.sheets[0]
    console.log(`baseline: TPS ${race.baseline.tps.toFixed(1)}, DPS ${race.baseline.dps.toFixed(1)}${tank ? `, taken ${race.baseline.taken.toFixed(1)}/s, health ${Math.round(bs.health)}, EHP ${Math.round(bs.ehp)}, boss crit ${chance(bs.bossCritPct)}, crush ${chance(bs.bossCrushPct)}` : ''} over ${count(race.baseline.fights)} fights`)
    const seconds = r.ms / 1000
    const speed = `${count(r.fights)} fights in ${seconds.toFixed(1)} s on ${threads} threads: ${count(Math.round(r.fights / seconds))} fights a second`
    if (race.leader === null) {
      console.log('result: no setup meets these constraints:')
      for (const line of r.blocked) console.log(`  - ${line}`)
      console.log(speed)
      return
    }
    const leader = race.standings[0]
    const infeasible = race.rounds.reduce((n, round) => n + round.infeasible, 0)
    console.log(
      race.status === 'separated'
        ? `result: the leader clears every other candidate at 95% (D23's bar) after ${race.rounds.length} rounds${infeasible ? `; ${count(infeasible)} were dropped as clearly outside a limit` : ''}`
        : `result: the budget ran out after ${race.rounds.length} rounds with ${count(race.unseparated.length)} candidates the leader isn't clear of at 95%` +
            (race.closest ? `; the closest (\`${r.candidates[race.closest.candidate].talents}\`: ${describe(race.closest.candidate)}) is ${ci(race.closest.vsLeader)}${unit} behind (95% CI)` : ''),
    )
    const leaderBeatsBase = leader.vsBaseline.score.mean - leader.vsBaseline.score.halfWidth > 0
    const units = objective === 'balanced' ? ' points' : ` ${objective.toUpperCase()}`
    const own = engine.isSetup(config, r.candidates[race.leader])
    const below = leader.vsBaseline.score.mean + leader.vsBaseline.score.halfWidth < 0
    console.log(
      `leader vs the default: ${ci(leader.vsBaseline.score)}${units}${own ? ' (the setup itself leads)' : leaderBeatsBase ? ', above zero' : below ? ', below the default, which fails a constraint' : ', not clear of the default'}`,
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
    const confirmFights = flagNumber('confirm-fights', args['confirm-fights'], { min: 100, whole: true })
    // A seed the search never used.
    const fresh = (seed + 0x9e3779b9) >>> 0
    const runner2 = threadRunner(engine, bundle, threads)
    try {
      const main = await engine.confirm({ config, candidate: winner, objective, seed: fresh, fights: confirmFights, runner: runner2 })
      const flipped = { ...config, rules: { ...config.rules, unmeasuredRatings: config.rules.unmeasuredRatings === 'apply' ? 'ignore' : 'apply' } }
      const other = await engine.confirm({ config: flipped, candidate: winner, objective, seed: fresh, fights: confirmFights, runner: runner2 })
      confirmation = { main, ratingsFlipped: { ...other, unmeasuredRatings: flipped.rules.unmeasuredRatings } }
      console.log(`\nconfirmation on fresh seed ${fresh}, ${count(confirmFights)} fights each, winner vs the default:`)
      console.log(`  score ${ci(main.vsBaseline.score)}, TPS ${ci(main.vsBaseline.tps, 1)}, DPS ${ci(main.vsBaseline.dps, 1)}, taken ${ci(main.vsBaseline.taken, 1)}: ${main.clears ? 'clears D23’s bar' : 'does NOT clear D23’s bar'}`)
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
    race: { ...r.race, standings: r.race.standings.map((s) => ({ ...s, talents: r.candidates[s.candidate].talents, rotation: r.candidates[s.candidate].rotation, changes: engine.describeBuildChange(data, config.talents, r.candidates[s.candidate].talents) })) },
  })
  writeFileSync(
    path,
    JSON.stringify({ setup: { spec: specId, seed, objective, budget, args, config }, passes: reports.map(annotate), winner, confirmation, seconds: (performance.now() - started) / 1000 }, null, 1),
  )
  console.log(`\nreport: ${relative(process.cwd(), path)}`)
}

if (isMainThread) {
  main().catch((error) => {
    console.error(error.message ?? error)
    process.exit(1)
  })
}
