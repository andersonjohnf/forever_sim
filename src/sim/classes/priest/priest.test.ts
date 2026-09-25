// The Shadow Priest (docs/classes/priest.md): the worked examples, then the engine's behaviour for its
// spells, talents, rotation and plan. Inputs are the synthetic ones of test-helpers.ts unless a test
// builds the default setup.
import { describe, expect, it } from 'vitest'
import { averageResist, levelResistance } from '../../core/attack-table'
import { defaultConfig } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { FIELD, Sim } from '../../engine/sim'
import { forSpecClass, presetBuffIds } from '../../effects/presets'
import { BUFFS_BY_ID } from '../../effects/buffs'
import { unusedRotationSettings } from '../../index'
import { buildPlan } from '../../plan/build'
import { ACTION, COND, SCHOOL, TRIGGER } from '../../plan/types'
import { CLASSIC_ERA } from '../../rules/profiles'
import { DARK_SACRIFICE_MANA, SHADOW_APL } from './shadow'
import { darkSacrifice } from './abilities'
import { priestManaPlan } from './setup'
import { abilityOf, damagesOf, events, examplePlan, ID, row, SHADOW, talentCode } from './test-helpers'

/** 1 − the level-63 boss's average resist at level 60: 0.94 (spells.md §3). */
const RESIST = 1 - averageResist(levelResistance(63, 60), 60)
const round = (x: number) => Math.round(x * 1e6) / 1e6
const counter = (sim: Sim, r: number, field: number) => sim.counters[r * Object.keys(FIELD).length + field]
const near = (x: number, p: number, n: number) => expect(Math.abs(x - p)).toBeLessThanOrEqual(4 * Math.sqrt((p * (1 - p)) / n) + 1e-12)
const MB_AVG = (477.06653804499996 + 503.333461955) / 2

describe('worked examples (docs/classes/priest.md#worked-examples)', () => {
  it('1. Shadow Word: Pain: (127 + 0.2 × 500) × 0.94 = 213.38 a tick, 6 ticks; 8 with Improved Shadow Word: Pain 2/2', () => {
    expect(RESIST).toBeCloseTo(0.94, 12)
    const plan = examplePlan({ rotation: { [ID.pain]: true }, durationMs: 20000, dropProcs: ['shadowWeaving'] })
    const ticks = damagesOf(plan, 'shadowWordPain')
    expect(ticks.map(round)).toEqual(Array(6).fill(round(227 * RESIST)))
    expect(round(ticks.reduce((a, b) => a + b, 0))).toBe(round(1280.28))
    const improved = examplePlan({ talents: { 'Improved Shadow Word: Pain': 2 }, rotation: { [ID.pain]: true }, durationMs: 26000 })
    expect(damagesOf(improved, 'shadowWordPain')).toHaveLength(8)
    expect(round(damagesOf(improved, 'shadowWordPain').reduce((a, b) => a + b, 0))).toBe(round(1707.04))
  })

  it('2. in the default build: × 1.1 × 1.1 × 1.05 = 271.10 a tick, a crit ×2.0 = 542.20, and 298.21 at 5 Shadow Weaving stacks', () => {
    const talents = { Shadowform: 1, Darkness: 5, 'Twin Disciplines': 5 }
    const plan = examplePlan({ talents, rotation: { [ID.pain]: true }, durationMs: 20000 })
    const tick = 227 * 1.1 * 1.1 * 1.05 * RESIST
    expect(round(tick)).toBe(round(271.09929))
    expect(damagesOf(plan, 'shadowWordPain').map(round)).toEqual(Array(6).fill(round(tick)))
    const crits = examplePlan({ talents, rotation: { [ID.pain]: true }, durationMs: 20000, crit: true })
    expect(damagesOf(crits, 'shadowWordPain').map(round)).toEqual(Array(6).fill(round(2 * tick)))
    expect(round(2 * tick)).toBe(round(542.19858))
    // 5 stacks on the boss, read at each tick.
    expect(round(tick * 1.1)).toBe(round(298.209219))
  })

  it('3. Mind Blast: (477.07 to 503.33 + 214.5) × 0.94, 662.42 on average; a 5.5 s cooldown with Improved Mind Blast 5/5, from the cast’s end', () => {
    const plan = examplePlan({ talents: { 'Improved Mind Blast': 5 }, rotation: { [ID.blast]: true }, durationMs: 30000 })
    const hits = damagesOf(plan, 'mindBlast', 40)
    for (const d of hits) {
      expect(d).toBeGreaterThanOrEqual((477.06653804499996 + 214.5) * RESIST - 1e-9)
      expect(d).toBeLessThanOrEqual((503.333461955 + 214.5) * RESIST + 1e-9)
    }
    const mean = hits.reduce((a, b) => a + b, 0) / hits.length
    expect(Math.abs(mean - 662.418)).toBeLessThan(2)
    expect(round((MB_AVG + 214.5) * RESIST)).toBe(round(662.418))
    const uses = events(plan).list.filter((e) => e.kind === 'use').map((e) => e.t)
    // The cooldown starts as the 1.5 s cast lands (spells.md §4): one every 7 s.
    expect(uses.slice(0, 4)).toEqual([0, 7000, 14000, 21000])
  })

  it('4. Mind Flay: 130 + 0.167 × 500 = 213.5 a tick, never partially resisted; 256.2 with Improved Mind Flay 2/2', () => {
    const plan = examplePlan({ talents: { 'Mind Flay': 1 }, rotation: { [ID.flay]: true }, durationMs: 9500, dropProcs: ['shadowWeaving'] })
    expect(damagesOf(plan, 'mindFlay').map(round)).toEqual(Array(9).fill(213.5))
    const improved = examplePlan({ talents: { 'Mind Flay': 1, 'Improved Mind Flay': 2 }, rotation: { [ID.flay]: true }, durationMs: 3500 })
    expect(damagesOf(improved, 'mindFlay').map(round)).toEqual([256.2, 256.2, 256.2])
  })

  it('4. Mind Flay lands 78.02% of the time with no hit (resisted whole), and 89.3% with 7% hit and Shadow Focus 5/5', () => {
    const land = (talents: Record<string, number>, hit: number) => {
      const plan = examplePlan({ talents: { 'Mind Flay': 1, ...talents }, rotation: { [ID.flay]: true }, durationMs: 60000 })
      plan.stats.spellHit = hit
      const sim = new Sim(plan)
      for (let i = 0; i < 60; i++) sim.runFight(i)
      const r = row(plan, 'mindFlay')
      const n = counter(sim, r, FIELD.casts)
      return { rate: 1 - counter(sim, r, FIELD.misses) / n, n }
    }
    const none = land({}, 0)
    near(none.rate, 1 - (0.17 + 0.83 * 0.06), none.n)
    const focused = land({ 'Shadow Focus': 5 }, 7)
    near(focused.rate, 1 - (0.05 + 0.95 * 0.06), focused.n)
    expect(1 - (0.05 + 0.95 * 0.06)).toBeCloseTo(0.893, 12)
  })

  it('5. costs in the default build: Shadow Word: Pain 211, Devouring Plague 197, Mind Blast 175, Mind Flay 102', () => {
    const plan = buildPlan(defaultConfig(SHADOW)).plan
    const cost = (id: string) => plan.abilities[abilityOf(plan, id)].costTenths / 10
    expect([cost('shadowWordPain'), cost('devouringPlague'), cost('mindBlast'), cost('mindFlay')]).toEqual([211, 197, 175, 102])
  })

  it('6. regeneration: 200 Spirit gives 63 a tick outside the five-second rule, and Meditation 3/3 half of it inside', () => {
    const plan = priestManaPlan({ mana: 5000, spirit: 200 }, 0, new Map([['Meditation', 3]]))
    expect(plan.regenTickTenths).toBe(630)
    expect(plan.inFsrShare).toBe(0.5)
    expect(priestManaPlan({ mana: 5000, spirit: 200 }, 0, new Map()).inFsrShare).toBeUndefined()
  })

  it('7. Shadow Weaving: each landed Shadow spell adds a stack, to 5; Mind Blast at 5 stacks is 728.66 on average', () => {
    const plan = examplePlan({ talents: { 'Shadow Weaving': 3, 'Improved Mind Blast': 5 }, rotation: { [ID.blast]: true }, durationMs: 60000 })
    const hits = damagesOf(plan, 'mindBlast', 60)
    // Nine a fight, 7 s apart: the first five meet 0–4 stacks; from the sixth on, 5.
    expect(hits).toHaveLength(9 * 60)
    const late = hits.filter((_, i) => i % 9 >= 5)
    const mean = late.reduce((a, b) => a + b, 0) / late.length
    expect(Math.abs(mean - 728.66)).toBeLessThan(2.5)
    expect(round(662.418 * 1.1)).toBe(round(728.6598))
  })

  it('8. Inner Focus: the Mind Blast after it costs nothing and crits at the sheet’s crit + 25%', () => {
    const plan = examplePlan({ talents: { 'Inner Focus': 1 }, rotation: { [ID.blast]: true, [ID.innerFocus]: true }, durationMs: 1600, manaTenths: 50000 })
    // The sheet's spell crit exactly 0, so only Inner Focus's 25% can crit.
    plan.stats.spellCrit -= new Sim(plan).inspect().spellCrit
    expect(new Sim(plan).inspect().spellCrit).toBeCloseTo(0, 9)
    const { sim, list } = events(plan)
    expect(list.filter((e) => e.kind === 'use').map((e) => [e.id, e.t])).toEqual([
      ['innerFocus', 0],
      ['mindBlast', 0],
    ])
    expect(sim.resources().mana).toBe(50000)
    const many = new Sim(plan)
    for (let i = 0; i < 2000; i++) many.runFight(i)
    const r = row(plan, 'mindBlast')
    near(counter(many, r, FIELD.crits) / counter(many, r, FIELD.casts), 0.25, 2000)
  })

  it('9. Dark Sacrifice: 5 ticks of 320 + Spirit ÷ 5, 1,600 mana plus your Spirit over 15 s, once the Undead is missing that much', () => {
    expect(DARK_SACRIFICE_MANA).toBe(1600)
    // 1.60.1.70009's tooltip: ${$o2+$SPI}. At 250 Spirit, 5 ticks of 370: 1,850.
    expect(darkSacrifice(250).rageTickTenths * darkSacrifice(250).rageTicks).toBe(18500)
    expect(darkSacrifice(0).rageTickTenths).toBe(3200)
    expect(darkSacrifice(251).rageTickTenths).toBe(3702)
    const plan = examplePlan({
      race: 'horde-undead',
      talents: { 'Mind Flay': 1 },
      rotation: { [ID.flay]: true, [ID.sacrifice]: true, [ID.sacrificeMissing]: 1600 },
      durationMs: 120000,
      manaTenths: 50000,
    })
    const spirit = plan.abilities.find((a) => a.id === 'darkSacrifice')!.rageTickTenths * 5 - 16000
    expect(spirit).toBeGreaterThan(0)
    const agg = runChunk(plan, 0, 1, new Sim(plan))
    expect(agg.manaBySource[row(plan, 'darkSacrifice')]).toBe(16000 + spirit)
  })
})

describe('Inner Focus’s +25% crit goes to its own spell only (docs/classes/priest.md#35-inner-focus-14751)', () => {
  /** Test 8's setup, the sheet's spell crit exactly 0, so only a leaked +25% can crit. */
  function zeroCritPlan(rotation: Record<string, boolean> = {}, durationMs = 4000) {
    const plan = examplePlan({
      talents: { 'Inner Focus': 1 },
      rotation: { [ID.blast]: true, [ID.innerFocus]: true, ...rotation },
      durationMs,
      manaTenths: 50000,
    })
    plan.stats.spellCrit -= new Sim(plan).inspect().spellCrit
    return plan
  }
  const run = (plan: ReturnType<typeof zeroCritPlan>, fights = 2000) => {
    const sim = new Sim(plan)
    for (let i = 0; i < fights; i++) sim.runFight(i)
    return sim
  }

  it('spent on a channel of tick spells, the charge’s crit goes to nothing: its ticks crit at the sheet’s 0%', () => {
    // Mind Blast made a channel with no spell of its own that casts its spell as one tick 100 ms in.
    const plan = zeroCritPlan()
    const blast = plan.abilities[abilityOf(plan, 'mindBlast')]
    Object.assign(blast, { kind: 'channel', tickSpell: blast.spell, spell: -1, rageTicks: 1, rageTickMs: 100, rageTickTenths: 0 })
    const { list } = events(plan)
    expect(list.filter((e) => e.kind === 'use').map((e) => e.id).slice(0, 2)).toEqual(['innerFocus', 'mindBlast'])
    const sim = run(plan)
    const r = row(plan, 'mindBlast')
    expect(counter(sim, r, FIELD.hits)).toBeGreaterThan(1000)
    expect(counter(sim, r, FIELD.crits)).toBe(0)
  })

  it('determinism: a fight on a reused Sim deals what it deals on a fresh one, whatever the fight before spent the charge on', () => {
    // The tick-spell channel above, also cast before the pull so its tick lands at 0 ms, before the
    // rotation pays for anything: a crit left over from the fight before would show there.
    const plan = zeroCritPlan({}, 12000)
    const a = abilityOf(plan, 'mindBlast')
    const blast = plan.abilities[a]
    Object.assign(blast, { kind: 'channel', tickSpell: blast.spell, spell: -1, rageTicks: 1, rageTickMs: 100, rageTickTenths: 0 })
    plan.prepull = { ...plan.prepull, casts: [{ ability: a, atMs: -100 }] }
    const damage = (sim: Sim, fight: number) => {
      let total = 0
      sim.damageTrace = (_source, d) => (total += d)
      sim.runFight(fight)
      return total
    }
    const reused = new Sim(plan)
    for (let fight = 0; fight < 200; fight++) expect(damage(reused, fight), `fight ${fight}`).toBe(damage(new Sim(plan), fight))
  })

  it('a spell a proc of the Inner Focus spell casts doesn’t get the charge’s crit', () => {
    // A proc on Mind Blast landing that casts Shadow Word: Pain's spell: its DoT's snapshot crit is the
    // sheet's 0%. One Mind Blast in 7 s (landing at 1.5 s), so a tick at 4.5 s.
    const plan = zeroCritPlan({ [ID.pain]: true }, 7000)
    const pain = plan.abilities[abilityOf(plan, 'shadowWordPain')]
    const blast = plan.abilities[abilityOf(plan, 'mindBlast')]
    // Only Inner Focus and Mind Blast are pressed; the proc casts Pain's spell.
    plan.rotation = plan.rotation.filter((e) => plan.abilities[e.ability].id !== 'shadowWordPain')
    plan.procs.push({
      id: 'testProc',
      name: 'Test proc',
      trigger: TRIGGER.spellLanded,
      chance: [1, 0],
      hands: 1,
      icdMs: 0,
      action: ACTION.spell,
      amount: pain.spell!,
      a: 0,
      b: 0,
      school: SCHOOL.shadow,
      source: plan.spells![pain.spell!].source,
      chainBit: 0,
      fromSource: blast.source,
    })
    plan.triggers[TRIGGER.spellLanded].push(plan.procs.length - 1)
    const sim = run(plan)
    const r = row(plan, 'shadowWordPain')
    expect(counter(sim, r, FIELD.hits)).toBeGreaterThan(1000)
    expect(counter(sim, r, FIELD.crits)).toBe(0)
    // Mind Blast itself still crits at 25%.
    const b = row(plan, 'mindBlast')
    near(counter(sim, b, FIELD.crits) / counter(sim, b, FIELD.casts), 0.25, 2000)
  })
})

describe('Mind Flay’s ticks (docs/classes/priest.md#33-mind-flay-r6-18807; spells.md §6)', () => {
  it('ticks exactly 3 times a full channel, even when another spell follows it (the last tick isn’t delivered twice)', () => {
    const plan = examplePlan({ talents: { 'Mind Flay': 1, 'Improved Mind Blast': 5 }, rotation: { [ID.flay]: true, [ID.blast]: true }, durationMs: 60000 })
    const sim = new Sim(plan)
    const ticks: number[] = []
    const r = row(plan, 'mindFlay')
    sim.damageTrace = (s) => {
      if (s === r) ticks.push(1)
    }
    sim.runFight(0)
    const channels = counter(sim, r, FIELD.casts)
    const { list } = events(plan)
    // Every Mind Flay but a last one the fight's end cuts delivers 3 ticks.
    expect(ticks.length).toBeGreaterThan(3 * (channels - 1) - 1)
    expect(ticks.length).toBeLessThanOrEqual(3 * channels)
    // A Mind Blast follows some Mind Flays: the case the stale tick event double-counted.
    const uses = list.filter((e) => e.kind === 'use').map((e) => e.id)
    expect(uses.some((id, i) => id === 'mindFlay' && uses[i + 1] === 'mindBlast')).toBe(true)
  })

  it('cut after 2 ticks: 2 ticks, and the next cast starts 2 s after the channel did', () => {
    const plan = examplePlan({ talents: { 'Mind Flay': 1 }, rotation: { [ID.flay]: true, [ID.flayTicks]: 2 }, durationMs: 6500 })
    expect(plan.abilities[abilityOf(plan, 'mindFlay')].channelTicks).toBe(2)
    const { list } = events(plan)
    expect(list.filter((e) => e.kind === 'use').map((e) => e.t)).toEqual([0, 2000, 4000, 6000])
    expect(list.filter((e) => e.kind === 'damage').map((e) => e.t)).toEqual([1000, 2000, 3000, 4000, 5000, 6000])
  })

  it('a channel holds the GCD: Mind Blast off cooldown waits for the channel to end', () => {
    const plan = examplePlan({ talents: { 'Mind Flay': 1 }, rotation: { [ID.flay]: true, [ID.blast]: true }, durationMs: 14000 })
    const uses = events(plan).list.filter((e) => e.kind === 'use').map((e) => [e.id, e.t])
    // Mind Blast (1.5 s cast), then Mind Flay until 4.5 s; Mind Blast is ready at 8 s, mid-channel, so it waits for 10.5 s.
    expect(uses).toEqual([
      ['mindBlast', 0],
      ['mindFlay', 1500],
      ['mindFlay', 4500],
      ['mindFlay', 7500],
      ['mindBlast', 10500],
      ['mindFlay', 12000],
    ])
  })
})

describe('Shadow Weaving (docs/classes/priest.md#4-talents; spells.md §9)', () => {
  it('is the boss’s Shadow damage taken, +2% a stack, and a DoT’s own landing counts from its first tick; its ticks add no stack', () => {
    const plan = examplePlan({ talents: { 'Shadow Weaving': 3 }, rotation: { [ID.pain]: true }, durationMs: 20000 })
    const aura = plan.auras.find((a) => a.id === 'shadowWeaving')!
    expect(aura).toMatchObject({ maxStacks: 5, durationMs: 15000, schoolMask: 1 << SCHOOL.shadow, schoolTaken: 2 })
    // One application, one stack for 15 s: the ticks at 3–12 s × 1.02; the stack expires at 15 s,
    // before that moment's tick, so the last two have none.
    const ticks = damagesOf(plan, 'shadowWordPain')
    expect(ticks.map(round)).toEqual([...Array(4).fill(round(227 * RESIST * 1.02)), ...Array(2).fill(round(227 * RESIST))])
  })

  it('stacks on a landed spell with the talent’s chance: 33% at 1/3', () => {
    const plan = examplePlan({ talents: { 'Shadow Weaving': 1 }, rotation: { [ID.blast]: true }, durationMs: 6000 })
    expect(plan.procs.find((p) => p.id === 'shadowWeaving')!.chance[0]).toBeCloseTo(0.33, 12)
  })
})

describe('Shadowform, Shadow Focus and the costs (docs/classes/priest.md §3.6, §4)', () => {
  it('Shadowform: +10% Shadow damage (a school multiplier), Shadow crits ×2.0, half the mana', () => {
    const plain = examplePlan({ rotation: { [ID.blast]: true } })
    const form = examplePlan({ talents: { Shadowform: 1 }, rotation: { [ID.blast]: true } })
    expect(new Sim(form).inspect().schoolDamage[SCHOOL.shadow]).toBeCloseTo(1.1, 12)
    expect(new Sim(plain).inspect().schoolDamage[SCHOOL.shadow]).toBe(1)
    const spell = (p: typeof plain) => p.spells!.find((s) => s.id === 'mindBlast')!
    expect([spell(plain).critMultiplier, spell(form).critMultiplier]).toEqual([1.5, 2])
    expect([plain.abilities[0].costTenths, form.abilities[0].costTenths]).toEqual([3500, 1750])
  })

  it('Shadow Focus: its hit counts before the floor, so 12% gear hit and 5/5 never miss in Forever, and miss 1% in Classic Era', () => {
    const miss = (profile?: 'classicEra') => {
      const plan = examplePlan({ talents: { 'Shadow Focus': 5 }, rotation: { [ID.blast]: true }, config: profile ? { rules: { profile, unmeasuredRatings: 'apply' } } : {} })
      plan.stats.spellHit = 12
      if (profile) expect(plan.profile).toBe(CLASSIC_ERA)
      expect(plan.schools!.hit![SCHOOL.shadow]).toBe(5)
      const sim = new Sim(plan)
      for (let i = 0; i < 100; i++) sim.runFight(i)
      const r = row(plan, 'mindBlast')
      return { rate: counter(sim, r, FIELD.misses) / counter(sim, r, FIELD.casts), n: counter(sim, r, FIELD.casts) }
    }
    expect(miss().rate).toBe(0)
    const ce = miss('classicEra')
    near(ce.rate, 0.01, ce.n)
  })
})

describe('the Shadow priority and its plan (docs/classes/priest.md §6, §8)', () => {
  it('the default rotation: the racial, Shadow Word: Pain, Devouring Plague, Inner Focus before Mind Blast, Mind Flay', () => {
    const plan = buildPlan(defaultConfig(SHADOW)).plan
    const lines = plan.rotation.map((e) => plan.abilities[e.ability].id)
    expect(lines).toEqual(['berserking', 'majorManaPotion', 'shadowWordPain', 'devouringPlague', 'innerFocus', 'mindBlast', 'mindFlay'])
    const focus = plan.rotation[lines.indexOf('innerFocus')]
    expect(focus.conditions).toEqual([{ code: COND.abilityReady, a: abilityOf(plan, 'mindBlast'), b: 0 }])
    expect(plan.freeCastCritPct).toBe(25)
    expect(plan.auras[plan.freeCastAura!].id).toBe('innerFocus')
    // Troll Berserking casts faster, as Forever's does.
    expect(plan.auras.find((a) => a.id === 'berserking')).toMatchObject({ haste: 10, castHaste: 10 })
  })

  it('never swings: a caster’s plan has no weapons, though the weapon’s stats count', () => {
    const d = defaultConfig(SHADOW)
    const bundle = buildPlan(d)
    expect(bundle.plan.weapons).toEqual([null, null])
    expect(bundle.plan.stats.shadowSpellDamage).toBeGreaterThan(0)
    const ids = bundle.assumptions.map((a) => a.id)
    for (const melee of ['noWeapon', 'foreverGlancing', 'critSuppression']) expect(ids).not.toContain(melee)
    expect(ids).toEqual(expect.arrayContaining(['priestNoMelee', 'manaRegenPriest', 'shadowWeaving', 'shadowfiendNotSimulated']))
  })

  it('Starshards is the Night Elf’s and Dark Sacrifice the Undead’s: other races’ settings say they’re not used', () => {
    const elf = buildPlan({ ...defaultConfig(SHADOW, 'alliance-night-elf') }).plan
    expect(elf.abilities.map((a) => a.id)).toEqual(expect.arrayContaining(['starshards', 'elunesLight']))
    expect(elf.spells!.find((s) => s.id === 'starshards')).toMatchObject({ school: SCHOOL.arcane, dotTicks: 6, dotTickDamage: 300 })
    const undead = buildPlan({ ...defaultConfig(SHADOW, 'horde-undead') }).plan
    expect(undead.abilities.map((a) => a.id)).toContain('darkSacrifice')
    expect(undead.abilities.map((a) => a.id)).not.toContain('starshards')
    const unused = unusedRotationSettings(defaultConfig(SHADOW))
    expect(unused[ID.starshards]).toBe('Not used: only Night Elf priests have Starshards, not Troll.')
    expect(unused[ID.sacrifice]).toBe('Not used: only Undead priests have Dark Sacrifice, not Troll.')
    expect(unused['priest.shadow.racial.enabled']).toBeUndefined()
  })

  it('Shadowform is the priority list’s pinned row before the pull, and Vampiric Embrace is off by default', () => {
    expect(SHADOW_APL.rows.filter((r) => r.pinned).map((r) => [r.id, r.summary?.map((p) => p.text)])).toEqual([['prepull', ['Shadowform']]])
    const embrace = examplePlan({ talents: { 'Vampiric Embrace': 1 }, rotation: { [ID.embrace]: true }, durationMs: 70000 })
    const uses = events(embrace).list.filter((e) => e.kind === 'use').map((e) => e.t)
    expect(uses).toEqual([0, 60000])
    expect(buildPlan(defaultConfig(SHADOW)).plan.abilities.map((a) => a.id)).not.toContain('vampiricEmbrace')
  })

  it('a caster gets no melee buffs, and its raid preset brings its caster entries and consumables', () => {
    const raid = presetBuffIds('raid', SHADOW, defaultConfig(SHADOW).buffs.raid)
    for (const melee of ['battleShout', 'blessingOfMight', 'windfuryTotem', 'strengthOfEarth', 'sunderArmor', 'faerieFire', 'curseOfRecklessness', 'leaderOfThePack', 'jujuFlurry']) {
      expect(raid).not.toContain(melee)
      expect(forSpecClass(BUFFS_BY_ID.get(melee)!, SHADOW), melee).toBe(false)
    }
    expect(raid).toEqual(expect.arrayContaining(['arcaneBrilliance', 'moonkinAura', 'curseOfTheElements', 'greaterArcaneElixir', 'elixirOfShadowPower', 'majorManaPotion']))
    // Another class never gets the priest's Shadow elixir.
    expect(forSpecClass(BUFFS_BY_ID.get('elixirOfShadowPower')!, 'mage-fire')).toBe(false)
  })

  it('reports mana over the fight: the pool, what regenerated, the potion, and what the rotation spent', () => {
    const d = defaultConfig(SHADOW)
    const bundle = buildPlan({ ...d, run: { mode: 'fixed', iterations: 250, seed: 3 } })
    const agg = runChunk(bundle.plan, 0, CHUNK_SIZE, new Sim(bundle.plan))
    expect(agg.manaSpentTenths).toBeGreaterThan(0)
    expect(agg.manaRegenTenths).toBeGreaterThan(0)
    expect(agg.manaBySource[row(bundle.plan, 'majorManaPotion')]).toBeGreaterThan(0)
  })

  it('a talent code round-trips (test helper)', () => {
    expect(talentCode({ 'Shadow Focus': 5 })).toBe('--5')
  })
})
