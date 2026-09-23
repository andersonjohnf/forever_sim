// The Arms rotation in the engine, from the default setup (docs/classes/warrior.md §5.3, §7):
// Rend kept up, Overpower from dodges and Bloodthrill, Slam in and out of the execute phase,
// Execute, Recklessness swapping to Berserker Stance for the rest of the fight, the Whirlwind
// dance, Spearing Strike by creature type, Hamstring (row 14, with and without the Whirlwind
// dance), Death Wish with the talent (row 16), the Mighty Rage Potion without an execute phase
// (row 17), the Berserker base stance (Q24), and determinism.
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, encodeTalentCode } from '@/data/talents/types'
import { defaultConfig, TALENT_DATA } from '../defaults'
import { buildPlan } from '../plan/build'
import { type Plan, STANCE } from '../plan/types'
import type { SimConfig } from '../types'
import { FIELD, Sim } from './sim'
import { counter } from './test-helpers'

const ARMS = defaultConfig('warrior-arms')

function armsPlan(rotation: SimConfig['rotation'] = {}, patch: Partial<SimConfig> = {}, seed = 12345): Plan {
  return buildPlan({ ...ARMS, rotation, run: { ...ARMS.run, seed }, ...patch }).plan
}

/** Every fight's casts (ability id, time, rage before, stance), stance swaps and Rend ticks. */
function fights(plan: Plan, count = 100) {
  const sim = new Sim(plan)
  const rendRow = plan.abilities.find((a) => a.id === 'rend')?.source ?? -1
  const out: {
    ms: number
    executeAt: number
    casts: { id: string; t: number; rage: number; stance: number }[]
    swaps: { to: number; t: number; before: number; after: number }[]
    rendTicks: number[]
  }[] = []
  for (let i = 0; i < count; i++) {
    const casts: (typeof out)[number]['casts'] = []
    const swaps: (typeof out)[number]['swaps'] = []
    const rendTicks: number[] = []
    let stance = plan.stance
    sim.stanceTrace = (to, t, before, after) => {
      stance = to
      swaps.push({ to, t, before, after })
    }
    sim.castTrace = (a, t, rage) => casts.push({ id: plan.abilities[a].id, t, rage, stance })
    sim.trace = (source, hand, t) => {
      if (hand < 0 && source === rendRow) rendTicks.push(t)
    }
    sim.runFight(i)
    out.push({ ms: sim.fightMs, executeAt: sim.executeAtMs, casts, swaps, rendTicks })
  }
  return { sim, out }
}

const uses = <C extends { id: string }>(f: { casts: C[] }, id: string): C[] => f.casts.filter((c) => c.id === id)

describe('the default Arms rotation in the engine (warrior.md §5.3)', () => {
  const plan = armsPlan()
  const { sim, out } = fights(plan)
  const row = (id: string) => plan.abilities.find((a) => a.id === id)!.source

  it('fights in Battle Stance and uses every default row', () => {
    expect(plan.stance).toBe(STANCE.battle)
    for (const id of ['battleShout', 'rend', 'recklessness', 'bloodrage', 'slam', 'execute', 'mortalStrike', 'overpower', 'spearingStrike', 'heroicStrike', 'mightyRagePotion'])
      expect(counter(sim, row(id), FIELD.casts), id).toBeGreaterThan(0)
    for (const id of ['mortalStrike', 'slam', 'overpower', 'execute', 'heroicStrike']) expect(counter(sim, row(id), FIELD.damage), id).toBeGreaterThan(0)
  })

  it('row 2: keeps Rend up until Recklessness leaves Battle Stance: each refresh comes within a GCD or two of its window opening', () => {
    let refreshes = 0
    let late = 0
    for (const f of out) {
      const leave = f.swaps.find((s) => s.to === STANCE.berserker)?.t ?? f.ms
      const ticks = f.rendTicks.filter((t) => t <= leave)
      expect(ticks[0]).toBeLessThanOrEqual(6000) // applied at the pull, or a GCD or two later if it missed
      for (let k = 1; k < ticks.length; k++) {
        const gap = ticks[k] - ticks[k - 1]
        // 3 s between ticks; across a refresh at 1.5 s left, 4.5 s plus however long the GCD, a
        // Slam cast or rage for it held the refresh up; never so long that a tick was missed twice,
        // unless an application in between missed or was dodged (a second Rend before the tick).
        const attempts = f.casts.filter((c) => c.id === 'rend' && c.t > ticks[k - 1] && c.t < ticks[k]).length
        if (attempts < 2) expect(gap).toBeLessThanOrEqual(7500)
        if (gap <= 3000) continue
        refreshes++
        if (gap > 6000) late++
      }
    }
    expect(refreshes).toBeGreaterThan(out.length * 5)
    expect(late / refreshes).toBeLessThan(0.05)
  })

  it('row 9: Overpower only in Battle Stance while its window is open; the window opens from dodges and from Bloodthrill', () => {
    for (const f of out) for (const c of uses(f, 'overpower')) expect(c.stance).toBe(STANCE.battle)
    // A boss that can't dodge: every window is Bloodthrill's, which needs Rend.
    const noDodge = armsPlan()
    noDodge.fight.bossCanDodge = false
    const withRend = fights(noDodge, 50).out.reduce((n, f) => n + uses(f, 'overpower').length, 0)
    expect(withRend).toBeGreaterThan(50 * 3)
    const noRend = armsPlan({ 'warrior.arms.rend.enabled': false })
    noRend.fight.bossCanDodge = false
    expect(noRend.procs.map((p) => p.id)).not.toContain('bloodthrill')
    expect(fights(noRend, 50).out.reduce((n, f) => n + uses(f, 'overpower').length, 0)).toBe(0)
  })

  it('rows 6, 7 and 10: Slam in and out of the execute phase, Execute only in it, Mortal Strike only outside it', () => {
    let slamIn = 0
    let slamOut = 0
    for (const f of out) {
      for (const c of uses(f, 'slam')) {
        if (c.t >= f.executeAt) {
          slamIn++
          expect(c.rage).toBeGreaterThanOrEqual(300) // its cost + Execute's
        } else slamOut++
      }
      for (const c of uses(f, 'execute')) expect(c.t).toBeGreaterThanOrEqual(f.executeAt)
      for (const c of uses(f, 'mortalStrike')) expect(c.t).toBeLessThan(f.executeAt)
      expect(uses(f, 'execute').length).toBeGreaterThan(0)
    }
    expect(slamIn).toBeGreaterThan(out.length)
    expect(slamOut).toBeGreaterThan(5 * out.length)
  })

  it('row 4: Recklessness swaps to Berserker Stance in the last 15 s and stays there: no swap back, no Rend or Overpower after it', () => {
    for (const f of out) {
      const reck = uses(f, 'recklessness')
      expect(reck).toHaveLength(1)
      expect(f.ms - reck[0].t).toBeLessThanOrEqual(15000)
      expect(reck[0].stance).toBe(STANCE.berserker)
      // The only swap in the fight is Recklessness's, at the moment it's used, and keeps at most 25 rage.
      expect(f.swaps).toHaveLength(1)
      expect(f.swaps[0]).toMatchObject({ to: STANCE.berserker, t: reck[0].t, after: Math.min(f.swaps[0].before, 250) })
      for (const c of f.casts.filter((x) => x.t > reck[0].t)) {
        expect(['rend', 'overpower']).not.toContain(c.id)
        expect(c.stance).toBe(STANCE.berserker)
      }
    }
  })
})

describe('Arms options in the engine (warrior.md §5.3)', () => {
  it('row 12: the Whirlwind dance swaps to Berserker Stance at rage ≤ 30 and back 1 s later', () => {
    const plan = armsPlan({ 'warrior.arms.whirlwind.enabled': true })
    const { out } = fights(plan, 50)
    let count = 0
    for (const f of out) {
      const reck = uses(f, 'recklessness')[0]?.t ?? Infinity
      for (const c of uses(f, 'whirlwind').filter((x) => x.t < reck)) {
        count++
        expect(c.stance).toBe(STANCE.berserker)
        const into = f.swaps.find((s) => s.t === c.t && s.to === STANCE.berserker)!
        expect(into.before).toBeLessThanOrEqual(300)
        expect(into.after).toBe(Math.min(into.before, 250))
        if (c.t + 1000 < Math.min(f.ms, reck)) expect(f.swaps.find((s) => s.t > c.t)).toMatchObject({ to: STANCE.battle, t: c.t + 1000 })
      }
    }
    expect(count).toBeGreaterThan(50 * 3)
  })

  it('row 11: Spearing Strike on cooldown against Dragonkin, only with rage to spare against anything else', () => {
    const casts = (creatureType: 'dragonkin' | 'none') =>
      fights(armsPlan({}, { fight: { ...ARMS.fight, creatureType } }), 50).out.reduce((n, f) => n + uses(f, 'spearingStrike').length, 0) / 50
    const dragonkin = casts('dragonkin')
    const other = casts('none')
    // About 144 s before the execute phase at a 20 s cooldown: at most 8 a fight.
    expect(dragonkin).toBeGreaterThan(5)
    expect(dragonkin).toBeLessThanOrEqual(8)
    expect(other).toBeLessThan(dragonkin / 2)
  })

  it('Q24: fighting in Berserker Stance swaps to nothing by default: Whirlwind with +3% crit, and no Rend, Overpower or Bloodthrill', () => {
    const battle = buildPlan(ARMS)
    const bundle = buildPlan({ ...ARMS, rotation: { 'warrior.arms.baseStance': 'berserker' } })
    expect(bundle.plan.stance).toBe(STANCE.berserker)
    expect(bundle.sheet.critPct - battle.sheet.critPct).toBeCloseTo(3, 9)
    expect(bundle.plan.procs.map((p) => p.id)).not.toContain('bloodthrill')
    const { out } = fights(bundle.plan, 50)
    for (const f of out) {
      expect(f.swaps).toEqual([])
      expect(uses(f, 'whirlwind').length).toBeGreaterThan(0)
      for (const id of ['rend', 'overpower']) expect(uses(f, id)).toEqual([])
      for (const c of f.casts) expect(c.stance).toBe(STANCE.berserker)
    }
  })

  it('Q24: in Berserker Stance, Rend and Overpower dance to Battle Stance at rage ≤ 25 and come back', () => {
    const plan = armsPlan({ 'warrior.arms.baseStance': 'berserker', 'warrior.arms.rend.enabled': true, 'warrior.arms.overpower.enabled': true })
    expect(plan.procs.map((p) => p.id)).toContain('bloodthrill')
    const { out } = fights(plan, 50)
    let dances = 0
    for (const f of out) {
      for (const c of f.casts.filter((x) => x.id === 'rend' || x.id === 'overpower')) {
        dances++
        expect(c.stance).toBe(STANCE.battle)
        const into = f.swaps.find((s) => s.t === c.t && s.to === STANCE.battle)!
        expect(into.before).toBeLessThanOrEqual(250)
        expect(into.after).toBe(into.before)
        if (c.t + 1000 < f.ms) expect(f.swaps.find((s) => s.t > c.t)).toMatchObject({ to: STANCE.berserker, t: c.t + 1000 })
      }
    }
    expect(dances).toBeGreaterThan(50 * 10)
  })

  it('row 14: Hamstring at rage ≥ 60, outside the execute phase, only while Mortal Strike, Slam and Spearing Strike have a GCD of cooldown left', () => {
    const plan = armsPlan({ 'warrior.arms.hamstring.enabled': true })
    expect(armsPlan().abilities.map((a) => a.id)).not.toContain('hamstring') // off by default
    const ability = (id: string) => plan.abilities.find((a) => a.id === id)!
    const { out } = fights(plan, 200)
    let count = 0
    for (const f of out) {
      // When each ability is ready again, from its uses: Slam's cooldown starts when its cast ends.
      const readyAt = new Map<string, number>()
      for (const c of f.casts) {
        if (c.id === 'hamstring') {
          count++
          expect(c.rage).toBeGreaterThanOrEqual(600)
          expect(c.t).toBeLessThan(f.executeAt)
          for (const id of ['mortalStrike', 'slam', 'spearingStrike']) expect((readyAt.get(id) ?? 0) - c.t, id).toBeGreaterThanOrEqual(1500)
        }
        if (c.id === 'mortalStrike' || c.id === 'spearingStrike' || c.id === 'slam') {
          const a = ability(c.id)
          readyAt.set(c.id, c.t + a.castMs + a.cooldownMs)
        }
      }
    }
    expect(count).toBeGreaterThan(20)
  })

  it('row 14 with the Whirlwind dance (row 12): a dance waiting for rage ≤ 30 doesn’t hold back Hamstring at 60 (§7 "GCD-safe and stances")', () => {
    const hamstrings = (rotation: SimConfig['rotation']) => fights(armsPlan(rotation), 200).out.reduce((n, f) => n + uses(f, 'hamstring').length, 0)
    const withDance = hamstrings({ 'warrior.arms.hamstring.enabled': true, 'warrior.arms.whirlwind.enabled': true })
    const alone = hamstrings({ 'warrior.arms.hamstring.enabled': true })
    // Whirlwind spends rage Hamstring would have had, but no longer blocks it (0.01 a fight before).
    expect(withDance).toBeGreaterThan(alone / 3)
  })

  it('row 16: with the Death Wish talent, Death Wish is used as Fury’s: once in a 180 s fight, held to the last 30 s; Blood Fury waits for it', () => {
    const data = TALENT_DATA.warrior
    const deathWish = data.trees.flatMap((t) => t.talents).find((t) => t.name === 'Death Wish')!
    const talents = encodeTalentCode(data, { ...decodeTalentCode(data, ARMS.talents), [deathWish.id]: 1 })
    const plan = armsPlan({}, { talents, race: 'horde-orc', fight: { ...ARMS.fight, durationVariationPct: 0 } })
    expect(plan.auras.find((a) => a.id === 'deathWish')).toMatchObject({ damage: 20, durationMs: 30000 })
    for (const f of fights(plan, 30).out) {
      expect(f.ms).toBe(180000)
      const dw = uses(f, 'deathWish')
      expect(dw).toHaveLength(1)
      expect(f.ms - dw[0].t).toBeLessThanOrEqual(30000)
      // Then as soon as the GCD and its 10 rage allow, well before the end.
      expect(f.ms - dw[0].t).toBeGreaterThan(20000)
      // Blood Fury (2 min): at the pull, since Death Wish is more than a cooldown away, then with it.
      expect(uses(f, 'bloodFury').map((c) => c.t)).toEqual([0, dw[0].t])
    }
    // Without the talent it's never used, whatever the setting.
    expect(armsPlan({ 'warrior.arms.deathWish.enabled': true }).abilities.map((a) => a.id)).not.toContain('deathWish')
  })

  it('row 17 without an execute phase: the Mighty Rage Potion follows Recklessness’s swap, whose cap would take its rage', () => {
    const noExecute = { fight: { ...ARMS.fight, executePct: 0 } }
    const { out } = fights(armsPlan({}, noExecute), 50)
    for (const f of out) {
      const reck = uses(f, 'recklessness')
      const potion = uses(f, 'mightyRagePotion')
      expect(reck).toHaveLength(1)
      expect(potion).toHaveLength(1)
      // The same moment, after the swap (at most 25 rage kept): all 45–75 of its rage fits.
      expect(potion[0].t).toBe(reck[0].t)
      expect(f.swaps.map((s) => s.t)).toEqual([reck[0].t])
      expect(potion[0].rage).toBeLessThanOrEqual(250)
    }
    // With Recklessness off, or fighting in Berserker Stance (no swap), it's the last 20 s, as Fury's.
    const noSwap: SimConfig['rotation'][] = [{ 'warrior.arms.recklessness.enabled': false }, { 'warrior.arms.baseStance': 'berserker' }]
    for (const rotation of noSwap) {
      const times = fights(armsPlan(rotation, noExecute), 30).out.map((f) => f.ms - uses(f, 'mightyRagePotion')[0].t)
      for (const left of times) expect(left).toBeLessThanOrEqual(20000)
      expect(Math.max(...times)).toBeGreaterThan(15000)
    }
    // With an execute phase, from its start as before.
    for (const f of fights(armsPlan(), 30).out) expect(uses(f, 'mightyRagePotion')[0].t).toBeGreaterThanOrEqual(f.executeAt)
  })

  it('is deterministic: the same seed gives the same result, another seed a different one, and a fight depends only on its index', () => {
    const run = (seed: number, rotation: SimConfig['rotation'] = {}) => Array.from(fights(armsPlan(rotation, {}, seed), 40).sim.counters)
    const a = run(7)
    expect(run(7)).toEqual(a)
    expect(run(8)).not.toEqual(a)
    const dance = { 'warrior.arms.whirlwind.enabled': true }
    expect(run(7, dance)).toEqual(run(7, dance))
    const plan = armsPlan(dance)
    const fresh = new Sim(plan)
    fresh.runFight(5)
    const used = new Sim(plan)
    for (let i = 0; i < 5; i++) used.runFight(i)
    used.runFight(5)
    expect([used.fightDamage, used.fightThreat]).toEqual([fresh.fightDamage, fresh.fightThreat])
  })
})
