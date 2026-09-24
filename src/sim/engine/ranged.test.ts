// The ranged and pet core (docs/mechanics/ranged-and-pets.md), with hand-built plans: a warrior plan
// from test-helpers with no melee weapon, a ranged weapon and Auto Shot, shots as ranged spells, and a
// pet. Every number here is a test input, not a class's value; each describe names the doc section it
// checks; the plans come from ranged-helpers.ts. The doc's worked examples are in ranged-examples.test.ts.
import { describe, expect, it } from 'vitest'
import { emptyChances, meleeChances, type MeleeInputs } from '../core/attack-table'
import { runChunk } from './chunk'
import { emptyAggregate, mergeChunk, toResult } from '../run/aggregate'
import { ACTION, CASTER_ROW, COND, type Plan, SCHOOL, TRIGGER } from '../plan/types'
import { CLASSIC_ERA } from '../rules/profiles'
import { FIELD, Sim } from './sim'
import { addCast, addPetAbility, addPlanAura, addShot, petLine, rangedPlan, withPet } from './ranged-helpers'
import { addProc, at, counter, damages, line, timeline } from './test-helpers'

describe('Auto Shot’s timer (ranged-and-pets.md §4)', () => {
  it('fires at the pull and then every weapon speed, independent of any melee', () => {
    expect(timeline(rangedPlan(10000)).shots).toEqual([0, 3000, 6000, 9000])
  })

  it('a quiver’s haste shortens the cycle: 3.0 / 1.15 = 2609 ms', () => {
    expect(timeline(rangedPlan(10000, { hasteMult: 1.15 })).shots).toEqual([0, 2609, 5218, 7827])
  })

  it('a ranged-haste aura applies from the next shot (Rapid Fire at the pull, after the pull’s shot)', () => {
    const plan = rangedPlan(10000)
    const rapid = addCast(plan, addPlanAura(plan, 'rapidFire', 15000, { rangedHaste: 40 }))
    line(plan, rapid)
    // The shot at 0 set a 3000 ms cycle; from then 3000 / 1.4 = 2143.
    expect(timeline(plan).shots).toEqual([0, 3000, 5143, 7286, 9429])
  })

  it('melee-only haste (an aura’s `haste`, Flurry’s kind) doesn’t touch it', () => {
    const plan = rangedPlan(10000)
    line(plan, addCast(plan, addPlanAura(plan, 'flurry', 15000, { haste: 30 })))
    expect(timeline(plan).shots).toEqual([0, 3000, 6000, 9000])
  })

  it('a cast that ends before the reload does delays nothing (a 2 s cast right after a shot)', () => {
    const plan = rangedPlan(10000)
    const shot = addShot(plan, { castMs: 2000, cooldownMs: 60000 })
    line(plan, shot, at(plan, 0))
    const t = timeline(plan)
    expect(t.uses[shot]).toEqual([0])
    expect(t.shots).toEqual([0, 3000, 6000, 9000])
  })

  it('a cast over the wind-up holds it back: the shot fires a wind-up after the cast (clipping)', () => {
    const plan = rangedPlan(10000)
    const shot = addShot(plan, { castMs: 2000, cooldownMs: 60000 })
    // At 2700 the wind-up (2500–3000) is running: the cast ends at 4700, the shot fires at 5200.
    line(plan, shot, at(plan, 2700))
    expect(timeline(plan).shots).toEqual([0, 5200, 8200])
  })

  it('a cast past the reload’s end delays the shot to a wind-up after the cast: 3 s at 1000 → 4500', () => {
    const plan = rangedPlan(10000)
    const shot = addShot(plan, { castMs: 3000, cooldownMs: 60000 })
    line(plan, shot, at(plan, 1000))
    expect(timeline(plan).shots).toEqual([0, 4500, 7500])
  })

  it('the reload keeps running during a cast: it isn’t restarted', () => {
    const plan = rangedPlan(10000)
    const shot = addShot(plan, { castMs: 1000, cooldownMs: 60000 })
    // A 1 s cast at 1600 ends at 2600, 100 ms into where the wind-up would have been: the shot is 600 ms late, not a whole cycle.
    line(plan, shot, at(plan, 1600))
    expect(timeline(plan).shots).toEqual([0, 3100, 6100, 9100])
  })

  it('without casts holding it back (the Forever reports’ model, castsHoldAutoShot false) a cast delays nothing', () => {
    const plan = rangedPlan(10000, { castsHoldAutoShot: false })
    const shot = addShot(plan, { castMs: 2000, cooldownMs: 60000 })
    line(plan, shot, at(plan, 2700))
    expect(timeline(plan).shots).toEqual([0, 3000, 6000, 9000])
  })

  it('a hasted wind-up (windupHasted) shrinks with ranged haste: 500 / 1.25 = 400 ms', () => {
    const plan = rangedPlan(10000, { hasteMult: 1.25, windupHasted: true })
    const shot = addShot(plan, { castMs: 2000, cooldownMs: 60000 })
    // Cycle 2400; a 2 s cast at 2300 (in the wind-up 2000–2400) ends at 4300; the shot comes 400 later.
    line(plan, shot, at(plan, 2300))
    expect(timeline(plan).shots).toEqual([0, 4700, 7100, 9500])
  })

  it('ranged haste shortens a shot’s cast when it’s castRangedHasted (Aimed Shot’s, §4): 2000 / 1.15 = 1739', () => {
    const plan = rangedPlan(10000, { hasteMult: 1.15 })
    const shot = addShot(plan, { castMs: 2000, cooldownMs: 60000, castRangedHasted: true })
    line(plan, shot, at(plan, 100))
    const t = timeline(plan)
    expect(t.uses[shot]).toEqual([100])
    // It lands at 100 + 1739 = 1839, before the reload's end (2609 − 500 = 2109): no shot moved. Unhasted
    // it would end at 2100, still clear; at 400 it's 2139 hasted, clear, and 2400 unhasted, which clips.
    expect(t.shots).toEqual([0, 2609, 5218, 7827])
    const late = rangedPlan(10000, { hasteMult: 1.15 })
    const lateShot = addShot(late, { castMs: 2000, cooldownMs: 60000, castRangedHasted: true })
    line(late, lateShot, at(late, 400))
    expect(timeline(late).shots).toEqual([0, 2639, 5248, 7857])
  })

  it('a channel holds it back too, until it ends', () => {
    const plan = rangedPlan(10000)
    plan.sources.push({ id: 'volley', name: 'Volley', icon: 'x' })
    plan.abilities.push({ ...CASTER_ROW, id: 'volley', name: 'Volley', icon: 'x', kind: 'channel', source: plan.sources.length - 1, costTenths: 0, cooldownMs: 60000, gcdMs: 1500, castMs: 0, offHandSource: -1, aura: -1, window: -1, rageTicks: 6, rageTickMs: 1000 })
    line(plan, plan.abilities.length - 1, at(plan, 2000))
    // 6 s from 2000 to 8000: the shot waits for it, then its wind-up.
    expect(timeline(plan).shots).toEqual([0, 8500])
  })
})

describe('the ranged table and Auto Shot’s damage (§2, §3)', () => {
  const inputs = (plan: Plan): MeleeInputs => ({
    attackerLevel: 60,
    targetLevel: plan.fight.targetLevel,
    skill: 300,
    hit: 0,
    sheetCrit: 10,
    auraCrit: 10,
    expertise: 0,
    front: false,
    canDodge: false,
    canParry: false,
    canBlock: plan.fight.bossCanBlock,
  })

  it('miss is the special table’s, 8% at 300 skill vs +3, with no dodge, parry or glancing, from behind', () => {
    for (const profile of [undefined, CLASSIC_ERA]) {
      const plan = rangedPlan()
      if (profile) plan.profile = profile
      plan.stats.hit = 0
      plan.stats.baseCrit = 0
      plan.stats.critPerAgi = 0
      plan.stats.crit = 10
      const i = new Sim(plan).inspect()
      const ch = meleeChances(plan.profile, inputs(plan), false, false, emptyChances())
      expect(i.rangedThresholds[0]).toBeCloseTo(8, 9)
      expect(i.rangedThresholds[2]).toBe(i.rangedThresholds[0])
      expect(i.rangedThresholds[3]).toBe(i.rangedThresholds[0])
      expect(i.rangedThresholds[4]).toBe(i.rangedThresholds[0])
      expect(i.rangedCrit).toBeCloseTo(ch.crit, 9)
    }
  })

  it('from the front the boss blocks it (5%), and never dodges or parries it', () => {
    const plan = rangedPlan()
    plan.stats.hit = 0
    plan.fight.front = true
    const th = new Sim(plan).inspect().rangedThresholds
    expect(th[1]).toBe(th[0])
    expect(th[2]).toBe(th[0])
    expect(th[4] - th[2]).toBeCloseTo(5, 9)
  })

  it('a hit deals (roll + ammo × speed + RAP / 14 × speed) × ranged damage × armor: (100 + 30 + 280 / 14 × 3) × 1.05 = 199.5', () => {
    const plan = rangedPlan(10000, { flatDamage: 30, damageMult: 1.05 })
    plan.stats.rap = 280
    expect(new Sim(plan).inspect().rangedAttackPower).toBe(280)
    const hits = damages(plan, plan.ranged!.source, 1)
    expect(hits).toHaveLength(4)
    for (const d of hits) expect(d).toBeCloseTo(199.5, 9)
  })

  it('ranged attack power: base + per Agility + flat, × its %; an aura’s adds and multiplies (§3)', () => {
    const plan = rangedPlan()
    const s = plan.stats
    s.baseRap = 110
    s.rapPerAgi = 2
    s.rap = 100
    s.rapMult = 1.1
    const agi = Math.floor((s.baseAgi + s.agi) * s.agiMult)
    expect(new Sim(plan).inspect().rangedAttackPower).toBe(Math.floor((110 + 2 * agi + 100) * 1.1 + 1e-9))
  })

  it('an aura’s ranged attack power and % join it while up (Hunter’s-Mark- and Blood-Fury-style)', () => {
    const plan = rangedPlan(10000)
    const mark = addCast(plan, addPlanAura(plan, 'mark', 60000, { rap: 100, rapPct: 10 }))
    line(plan, mark, at(plan, 1))
    const hits = damages(plan, plan.ranged!.source, 1)
    // The pull's shot: 100; after: 100 + (100 × 1.1 = 110) / 14 × 3.
    expect(hits[0]).toBeCloseTo(100, 9)
    expect(hits[1]).toBeCloseTo(100 + (110 / 14) * 3, 9)
  })

  it('a crit deals the crit multiplier: two rolls, so a shot the boss blocks can still crit (§2)', () => {
    const plan = rangedPlan(10000)
    plan.stats.crit = 200
    plan.fight.front = true
    const hits = damages(plan, plan.ranged!.source, 20)
    for (const d of hits) expect(d).toBeCloseTo(200, 9)
    const sim = new Sim(plan)
    for (let i = 0; i < 20; i++) sim.runFight(i)
    expect(counter(sim, plan.ranged!.source, FIELD.crits)).toBe(80)
    expect(counter(sim, plan.ranged!.source, FIELD.blocks)).toBe(0)
  })

  it('makes threat as a white swing does, and no rage', () => {
    const plan = rangedPlan(10000)
    plan.rage.maxTenths = 1000
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(sim.fightThreat).toBeCloseTo(sim.fightDamage * plan.threatMult, 6)
    expect(sim.resources().rage).toBe(0)
  })

  it('fires the ranged procs: an Auto Shot’s (Quick Shots), a crit’s, and power for the pet', () => {
    const plan = withPet(rangedPlan(10000), { power: { kind: 'focus', maxTenths: 1000, startTenths: 0, tickTenths: 0, tickMs: 0 } })
    plan.stats.crit = 200
    const quick = addPlanAura(plan, 'quickShots', 12000, { rangedHaste: 30 })
    addProc(plan, { trigger: TRIGGER.autoShotLanded, chance: [1, 1], hands: 0, action: ACTION.aura, amount: quick, b: 0 })
    addProc(plan, { trigger: TRIGGER.rangedCrit, chance: [1, 1], hands: 0, action: ACTION.petPower, amount: 50, b: 0 })
    const t = timeline(plan)
    // Quick Shots from the pull's shot: 3000 / 1.3 = 2308 from the shot at 0.
    expect(t.shots).toEqual([0, 2308, 4616, 6924, 9232])
    // Five crits, 5 Focus each, from none.
    expect(t.sim.resources().petPower).toBe(5 * 50)
  })
})

describe('shots: ranged spells (§5)', () => {
  it('a weapon shot: (roll + ammo × speed + RAP / 14 × 2.8 + its bonus) × ranged damage × armor, normalized', () => {
    const plan = rangedPlan(10000, { flatDamage: 30, damageMult: 1.05 })
    plan.stats.rap = 280
    const shot = addShot(plan, { flat: 166, cooldownMs: 60000 })
    line(plan, shot, at(plan, 1))
    const d = damages(plan, plan.abilities[shot].source, 1)
    expect(d).toHaveLength(1)
    expect(d[0]).toBeCloseTo((100 + 30 + (280 / 14) * 2.8 + 166) * 1.05, 9)
  })

  it('a shot needs the ranged weapon, not a melee one: without Plan.ranged it’s never used', () => {
    const plan = rangedPlan(10000)
    const shot = addShot(plan, { cooldownMs: 1000 })
    line(plan, shot)
    const withBow = timeline(plan)
    expect(withBow.uses[shot].length).toBeGreaterThan(0)
    delete plan.ranged
    expect(timeline(plan).uses[shot]).toEqual([])
  })

  it('a school shot (Arcane Shot’s kind) is magic damage on the ranged table: its school’s multipliers and resist, no armor', () => {
    const plan = rangedPlan(10000)
    plan.fight.targetArmor = 3000
    const shot = addShot(plan, { flat: 200, cooldownMs: 60000, school: SCHOOL.arcane, weaponPercent: 0 })
    line(plan, shot, at(plan, 1))
    const sim = new Sim(plan)
    const d = damages(plan, plan.abilities[shot].source, 1)
    expect(d[0]).toBeCloseTo(200 * sim.inspect().resistFactor[SCHOOL.arcane], 9)
  })

  it('a miss on the ranged table: 8% at 300 skill with no hit, over many fights', () => {
    const plan = rangedPlan(60000)
    plan.stats.hit = 0
    const shot = addShot(plan, { cooldownMs: 6000 })
    line(plan, shot)
    const sim = new Sim(plan)
    for (let i = 0; i < 400; i++) sim.runFight(i)
    const row = plan.abilities[shot].source
    const n = counter(sim, row, FIELD.casts)
    const missPct = (100 * counter(sim, row, FIELD.misses)) / n
    expect(missPct).toBeGreaterThan(8 - 4 * Math.sqrt((8 * 92) / n))
    expect(missPct).toBeLessThan(8 + 4 * Math.sqrt((8 * 92) / n))
    expect(counter(sim, row, FIELD.dodges) + counter(sim, row, FIELD.parries) + counter(sim, row, FIELD.glances)).toBe(0)
  })
})

describe('rotation conditions on Auto Shot (§11)', () => {
  it('autoShotClear: a 2 s shot only when it ends before the next wind-up, so no Auto Shot is delayed', () => {
    const plan = rangedPlan(12000)
    const shot = addShot(plan, { castMs: 2000 })
    line(plan, shot, [{ code: COND.autoShotClear, a: shot, b: 0 }])
    const t = timeline(plan)
    expect(t.shots).toEqual([0, 3000, 6000, 9000])
    expect(t.uses[shot]).toEqual([0, 3000, 6000, 9000])
  })

  it('without it, the same shot on cooldown clips: fewer Auto Shots', () => {
    const plan = rangedPlan(12000)
    const shot = addShot(plan, { castMs: 2000 })
    line(plan, shot)
    // Casts back to back from 0: 0–2000, 2000–4000 (holds the shot to 4500), 4000–6000, 6000–8000, …
    expect(timeline(plan).shots.length).toBeLessThan(4)
  })

  it('autoShotClear with spare ms, and an instant is always clear', () => {
    const plan = rangedPlan(12000)
    const slow = addShot(plan, { castMs: 2000 })
    const instant = addShot(plan, { castMs: 0, cooldownMs: 60000 })
    line(plan, slow, [{ code: COND.autoShotClear, a: slow, b: 600 }])
    line(plan, instant, [...at(plan, 2800), { code: COND.autoShotClear, a: instant, b: 0 }])
    const t = timeline(plan)
    // 0 + 2000 + 600 > 2500: never clear with 600 spare in a 3 s cycle.
    expect(t.uses[slow]).toEqual([])
    expect(t.uses[instant]).toEqual([2800])
  })

  it('autoShotWithin: a line right after an Auto Shot only', () => {
    const plan = rangedPlan(12000)
    const shot = addShot(plan, { castMs: 0, gcdMs: 1500 })
    line(plan, shot, [{ code: COND.autoShotWithin, a: 100, b: 0 }])
    expect(timeline(plan).uses[shot]).toEqual([0, 3000, 6000, 9000])
  })

  it('both are false without a ranged weapon', () => {
    const plan = rangedPlan(12000)
    const shot = addShot(plan, { castMs: 0, gcdMs: 1500 })
    plan.spells![0].ranged = false
    delete plan.ranged
    line(plan, shot, [{ code: COND.autoShotWithin, a: 100000, b: 0 }])
    expect(timeline(plan).uses[shot]).toEqual([])
  })
})

describe('the pet (§6–§10)', () => {
  it('swings on its own timer: (roll + its AP / 14 × speed) × its damage × armor, every 2 s from its arrival', () => {
    const plan = withPet(rangedPlan(10000), { startMs: 1000, damageMult: 1.1 })
    const t = timeline(plan)
    expect(t.petSwings).toEqual([1000, 3000, 5000, 7000, 9000])
    for (const d of damages(plan, plan.pet!.source, 1)) expect(d).toBeCloseTo((50 + (280 / 14) * 2) * 1.1, 9)
  })

  it('its white table at its level and skill: glancing only if it glances, parry and block only from the front', () => {
    const plan = withPet(rangedPlan(), { hit: 0, crit: 5, glances: true, glanceLow: 0.65, glanceHigh: 0.85 })
    plan.fight.bossCanDodge = true
    const i = new Sim(plan).inspect()
    const ch = meleeChances(plan.profile, { attackerLevel: 60, targetLevel: 63, skill: 300, hit: 0, sheetCrit: 5, auraCrit: 0, expertise: 0, front: false, canDodge: true, canParry: true, canBlock: true }, true, false, emptyChances())
    expect(i.petWhiteThresholds[0]).toBeCloseTo(ch.miss, 9)
    expect(i.petWhiteThresholds[1] - i.petWhiteThresholds[0]).toBeCloseTo(ch.dodge, 9)
    expect(i.petWhiteThresholds[2]).toBe(i.petWhiteThresholds[1])
    expect(i.petWhiteThresholds[3] - i.petWhiteThresholds[2]).toBeCloseTo(40, 9)
    plan.pet!.glances = false
    const j = new Sim(plan).inspect()
    expect(j.petWhiteThresholds[3]).toBe(j.petWhiteThresholds[2])
  })

  it('uses its abilities from its power, on its own global cooldown: 4 Claws of 25 Focus from 100', () => {
    const plan = withPet(rangedPlan(10000), { power: { kind: 'focus', maxTenths: 1000, startTenths: 1000, tickTenths: 0, tickMs: 0 } })
    const claw = addPetAbility(plan, { costTenths: 250, gcdMs: 1500 })
    petLine(plan, claw)
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(counter(sim, plan.pet!.abilities[claw].source, FIELD.casts)).toBe(4)
    expect(counter(sim, plan.pet!.abilities[claw].source, FIELD.damage)).toBeCloseTo(4 * 60, 9)
  })

  it('its power regenerates on its tick, capped; a line can keep power for another (petPowerAtLeast)', () => {
    const plan = withPet(rangedPlan(60000), { power: { kind: 'focus', maxTenths: 1000, startTenths: 1000, tickTenths: 50, tickMs: 1000 } })
    const bite = addPetAbility(plan, { costTenths: 350, cooldownMs: 10000, gcdMs: 1500, min: 90, max: 90 })
    const claw = addPetAbility(plan, { costTenths: 250, gcdMs: 1500 })
    petLine(plan, bite)
    // Claw only with enough left for the next Bite.
    petLine(plan, claw, [{ code: COND.petPowerAtLeast, a: 600, b: 0 }])
    const sim = new Sim(plan)
    sim.runFight(0)
    // 60 s: 6 Bites (every 10 s); Focus in = 100 + 5 × ~60 = ~400 Focus; Bites spend 210, Claws the rest.
    expect(counter(sim, plan.pet!.abilities[bite].source, FIELD.casts)).toBe(6)
    const claws = counter(sim, plan.pet!.abilities[claw].source, FIELD.casts)
    expect(claws).toBeGreaterThanOrEqual(6)
    expect(claws).toBeLessThanOrEqual(9)
  })

  it('a pet spell with a cast time: the spell table, its school and the boss’s damage taken, when the cast completes', () => {
    const plan = withPet(rangedPlan(10000), { weapon: null, spellDamage: 100, power: { kind: 'mana', maxTenths: 100000, startTenths: 100000, tickTenths: 0, tickMs: 0 } })
    const bolt = addPetAbility(plan, { kind: 'spell', school: SCHOOL.fire, costTenths: 1150, castMs: 2000, gcdMs: 1000, min: 44, max: 44, spCoefficient: 0.5, critMultiplier: 1.5 })
    petLine(plan, bolt)
    const t = timeline(plan)
    expect(counter(t.sim, plan.pet!.abilities[bolt].source, FIELD.casts)).toBe(4)
    for (const d of damages(plan, plan.pet!.abilities[bolt].source, 1)) expect(d).toBeCloseTo((44 + 50) * new Sim(plan).inspect().resistFactor[SCHOOL.fire], 9)
  })

  it('your auras reach it through their pet mods: +50% damage while a Bestial-Wrath-style aura is up', () => {
    const plan = withPet(rangedPlan(10000))
    const wrath = addCast(plan, addPlanAura(plan, 'bestialWrath', 5000, { petDamage: 50 }))
    line(plan, wrath, at(plan, 1))
    const d = damages(plan, plan.pet!.source, 1)
    // Swings at 0 (before it), 2000 and 4000 (during), 6000 and 8000 (after).
    expect(d.map((x) => Math.round(x))).toEqual([90, 135, 135, 90, 90])
  })

  it('its crits fire `petCrit`: a Frenzy on the pet hastes its next swing', () => {
    const plan = withPet(rangedPlan(8000), { crit: 200 })
    const frenzy = addPlanAura(plan, 'frenzy', 8000, { petHaste: 30 })
    addProc(plan, { trigger: TRIGGER.petCrit, chance: [1, 1], hands: 0, action: ACTION.aura, amount: frenzy, b: 0 })
    // The first swing crits, and the next comes 2000 / 1.3 = 1538 ms later.
    expect(timeline(plan).petSwings).toEqual([0, 1538, 3076, 4614, 6152, 7690])
  })

  it('a buff ability (Furious Howl’s kind) has no target: no roll, no damage and no `petLanded`, just its aura (§7)', () => {
    const plan = withPet(rangedPlan(60000), { weapon: null, hit: 0, power: { kind: 'focus', maxTenths: 1000, startTenths: 1000, tickTenths: 50, tickMs: 1000 } })
    // With no hit and a boss that dodges, a rolled ability would miss or be dodged about 13% of the time.
    plan.fight.bossCanDodge = true
    const howl = addPlanAura(plan, 'howl', 10000, { ap: 136, petAp: 136 })
    const a = addPetAbility(plan, { kind: 'buff', min: 0, max: 0, aura: howl, cooldownMs: 10000, gcdMs: 1500, costTenths: 200 })
    petLine(plan, a)
    const landed = addPlanAura(plan, 'landed', 1000, {})
    addProc(plan, { trigger: TRIGGER.petLanded, chance: [1, 1], hands: 0, action: ACTION.aura, amount: landed, b: 0 })
    const sim = new Sim(plan)
    for (let i = 0; i < 20; i++) sim.runFight(i)
    const row = plan.pet!.abilities[a].source
    expect(counter(sim, row, FIELD.casts)).toBe(20 * 6)
    for (const f of [FIELD.misses, FIELD.dodges, FIELD.parries, FIELD.hits, FIELD.crits, FIELD.damage]) expect(counter(sim, row, f)).toBe(0)
    expect(sim.auraApplications[howl]).toBe(20 * 6)
    expect(sim.auraApplications[landed]).toBe(0)
  })

  it('its triggers’ procs roll on its stream: a pet with 50% `petLanded` and `petCrit` procs changes none of your rolls', () => {
    const shots = (pet: boolean) => {
      let plan = rangedPlan(60000)
      plan.stats.crit = 30
      addProc(plan, { trigger: TRIGGER.rangedLanded, chance: [0.5, 0.5], hands: 0, action: ACTION.aura, amount: addPlanAura(plan, 'x', 3500, { damage: 10 }), b: 0 })
      if (pet) {
        plan = withPet(plan, { crit: 50 })
        addProc(plan, { trigger: TRIGGER.petLanded, chance: [0.5, 0.5], hands: 0, action: ACTION.aura, amount: addPlanAura(plan, 'y', 1000, {}), b: 0 })
        addProc(plan, { trigger: TRIGGER.petCrit, chance: [0.5, 0.5], hands: 0, action: ACTION.aura, amount: addPlanAura(plan, 'frenzy', 1000, { petHaste: 30 }), b: 0 })
      }
      return damages(plan, plan.ranged!.source, 3)
    }
    const mine = shots(false)
    expect(mine.length).toBeGreaterThan(50)
    expect(shots(true)).toEqual(mine)
  })

  it('an aura’s pet attack power and crit add to its own; its shares of your stats follow them (§6)', () => {
    const plan = withPet(rangedPlan(), { apFromOwnerRap: 0.1 })
    plan.stats.rap = 1000
    expect(new Sim(plan).inspect().petAttackPower).toBe(280 + 100)
  })

  it('its damage counts toward your DPS on its labelled rows, and makes none of your threat (§10)', () => {
    const plan = withPet(rangedPlan(10000))
    const claw = addPetAbility(plan)
    petLine(plan, claw, [{ code: COND.petPowerAtMost, a: 0, b: 0 }])
    plan.pet!.power = { kind: 'focus', maxTenths: 0, startTenths: 0, tickTenths: 0, tickMs: 0 }
    const sim = new Sim(plan)
    sim.runFight(0)
    const petRow = plan.pet!.source
    expect(counter(sim, petRow, FIELD.damage)).toBeGreaterThan(0)
    expect(counter(sim, petRow, FIELD.threat)).toBe(0)
    const autoShot = counter(sim, plan.ranged!.source, FIELD.damage)
    expect(sim.fightThreat).toBeCloseTo(autoShot * plan.threatMult, 6)
    let agg = emptyAggregate(plan.sources.length, plan.auras.length)
    agg = mergeChunk(agg, runChunk(plan, 0, 10))
    const result = toResult({ plan, sheet: {} as never, assumptions: [] }, agg, 0)
    expect(result.abilities.find((a) => a.id === 'petMelee')?.pet).toBe('Cat')
    expect(result.abilities.find((a) => a.id === 'pet0')?.pet).toBe('Cat')
    expect(result.abilities.find((a) => a.id === 'autoShot')?.pet).toBeUndefined()
  })
})

describe('determinism (§12)', () => {
  it('the same plan and fight index give the same fight, pet and Auto Shot included', () => {
    const make = () => {
      const plan = withPet(rangedPlan(60000, { hasteMult: 1.15 }), { hit: 0, crit: 10, glances: true, glanceLow: 0.65, glanceHigh: 0.85, power: { kind: 'focus', maxTenths: 1000, startTenths: 1000, tickTenths: 50, tickMs: 1000 } })
      plan.stats.hit = 0
      plan.stats.crit = 20
      plan.fight.bossCanDodge = true
      const claw = addPetAbility(plan, { costTenths: 250, gcdMs: 1500, min: 43, max: 59 })
      petLine(plan, claw)
      const shot = addShot(plan, { castMs: 2000, cooldownMs: 6000, castRangedHasted: true })
      line(plan, shot, [{ code: COND.autoShotClear, a: shot, b: 0 }])
      return plan
    }
    const a = runChunk(make(), 3, 50)
    const b = runChunk(make(), 3, 50)
    expect(Array.from(a.counters)).toEqual(Array.from(b.counters))
    expect(a.dps).toEqual(b.dps)
  })
})
