// The Retribution priority list (docs/classes/paladin.md "Retribution: model and rotation"): its
// settings, the opener and Judgement of the Crusader's upkeep, the seal and its judgement, Hammer of
// Wrath in the execute phase, Exorcism against Undead and Demons, Consecration by mana, the mana
// potion and rune, running out of mana, and determinism. The worked examples 20–22 run here too.
import { describe, expect, it } from 'vitest'
import { normalizeConfig } from '../../config/normalize'
import { defaultConfig, FULL_RAID } from '../../defaults'
import { BUFFS_BY_ID } from '../../effects/buffs'
import { buffProvided, presetBuffIds } from '../../effects/presets'
import { runChunk } from '../../engine/chunk'
import { FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { emptyAggregate, manaResult } from '../../run/aggregate'
import { COND, type Plan } from '../../plan/types'
import { ROTATION_GROUPS } from '../rotation'
import type { CreatureType, RotationValue, SimConfig } from '../../types'
import { CONSECRATION, HAMMER_OF_WRATH_ABILITY, SEAL_BASE_COST } from './abilities'
import { RETRIBUTION_IDS as ID, RETRIBUTION_OPTIONS } from './retribution'
import { withTalents } from './talents'

const RET = 'paladin-retribution'

/** The default Retribution setup, with these settings, fight, buffs and rules changes. */
function config(
  o: { rotation?: Record<string, RotationValue>; fight?: Partial<SimConfig['fight']>; buffs?: string[]; raid?: SimConfig['buffs']['raid']; rules?: Partial<SimConfig['rules']> } = {},
): SimConfig {
  const d = defaultConfig(RET)
  return {
    ...d,
    rotation: o.rotation ?? {},
    fight: { ...d.fight, ...o.fight },
    buffs: { raid: o.raid ?? d.buffs.raid, enabled: o.buffs ?? d.buffs.enabled },
    rules: { ...d.rules, ...o.rules },
  }
}
/** Judgement of the Crusader's bonus in full on melee-class hits (Character → Advanced; OQ 5). */
const FLAT = { rules: { jotcBonus: 'flat' } } as const
const planOf = (o: Parameters<typeof config>[0] = {}) => buildPlan(config(o)).plan

interface Cast {
  id: string
  t: number
  mana: number
}

/** Every use of an ability in fight `index`, with the mana before it (tenths). */
function casts(plan: Plan, index = 0): { casts: Cast[]; sim: Sim } {
  const sim = new Sim(plan)
  const out: Cast[] = []
  sim.castTrace = (a, t) => out.push({ id: plan.abilities[a].id, t, mana: sim.resources().mana })
  sim.runFight(index)
  return { casts: out, sim }
}
const times = (list: Cast[], id: string) => list.filter((c) => c.id === id).map((c) => c.t)
const auraUp = (plan: Plan, sim: Sim, id: string) => sim.auraUpMs[plan.auras.findIndex((a) => a.id === id)]
const counter = (plan: Plan, sim: Sim, id: string, field: number) => sim.counters[plan.sources.findIndex((s) => s.id === id) * FIELD_COUNT + field]

describe('the Retribution settings (paladin.md "Forever priority list (default)")', () => {
  it('put every setting under a heading, a dependent one after its parent under the same heading, and no heading over one setting', () => {
    for (const [i, option] of RETRIBUTION_OPTIONS.entries()) {
      expect(option.id).toMatch(/^paladin\.retribution\.\w+\.\w+$/)
      expect(ROTATION_GROUPS, option.id).toContain(option.group)
      if (option.dependsOn === undefined) continue
      const p = RETRIBUTION_OPTIONS.findIndex((o) => o.id === option.dependsOn)
      expect(p, option.id).toBeGreaterThanOrEqual(0)
      expect(p, option.id).toBeLessThan(i)
      expect(RETRIBUTION_OPTIONS[p].group, option.id).toBe(option.group)
    }
    for (const group of ROTATION_GROUPS) {
      const n = RETRIBUTION_OPTIONS.filter((o) => o.group === group).length
      if (n > 0) expect(n, group).toBeGreaterThanOrEqual(2)
    }
    expect(new Set(RETRIBUTION_OPTIONS.map((o) => o.id)).size).toBe(RETRIBUTION_OPTIONS.length)
  })

  it('build the default list: Judgement of the Crusader, the seal and its judgement, Hammer of Wrath, Holy Strike, Consecration and the mana potion', () => {
    const plan = planOf()
    expect(plan.abilities.map((a) => a.id)).toEqual([
      'sealOfCommand',
      'judgementOfCommand',
      'sealOfTheCrusader',
      'judgementOfTheCrusader',
      'hammerOfWrath',
      'holyStrike',
      'consecration',
      'consecrationRank1',
      'majorManaPotion',
    ])
    // Row 0: Seal of the Crusader before the pull (paladin.md row 0), free.
    expect(plan.prepull.casts).toEqual([{ ability: 2, atMs: -1500 }])
    // The default build's costs (paladin.md#mana-model): Benediction 5/5, no Holy Conduit.
    expect(plan.abilities.map((a) => a.costTenths / 10)).toEqual([189, 81, 144, 81, 382, 18, 508, 121, 0])
  })

  it('choose Seal of Righteousness and its judgement as abilities 0 and 1, with its procs', () => {
    const plan = planOf({ rotation: { [ID.seal]: 'righteousness' } })
    expect(plan.abilities.slice(0, 2).map((a) => a.id)).toEqual(['sealOfRighteousness', 'judgementOfRighteousness'])
    expect(plan.procs.map((p) => p.id)).toContain('sealOfRighteousnessProc')
    expect(plan.procs.map((p) => p.id)).not.toContain('sealOfCommandProc')
  })

  it('apply the Judgement of the Crusader rule from Character → Advanced: flat gives melee-class hits all of the +161, spells keep their coefficient (OQ 5)', () => {
    const share = (plan: Plan, id: string) => plan.spells!.find((s) => plan.sources[s.source].id === id)!.takenScale
    const coefficient = planOf()
    const flat = planOf(FLAT)
    for (const id of ['sealOfCommandProc', 'judgementOfCommand', 'holyStrike']) expect(share(flat, id), id).toBe(1)
    expect(share(coefficient, 'sealOfCommandProc')).toBeCloseTo(0.203, 12)
    expect(share(coefficient, 'judgementOfCommand')).toBe(0.429)
    expect(share(coefficient, 'holyStrike')).toBe(0.429)
    // Consecration (magic) and Hammer of Wrath (ranged) keep their coefficient under either rule.
    for (const plan of [coefficient, flat]) {
      expect(share(plan, 'consecration')).toBe(0.095)
      expect(share(plan, 'hammerOfWrath')).toBe(0.429)
    }
  })
})

describe('on-use trinkets and Juju Flurry (RU2)', () => {
  const withAnalyzer = (rotation: Record<string, RotationValue> = {}, buffs = defaultConfig(RET).buffs.enabled) => {
    const c = config({ rotation, buffs })
    return buildPlan({ ...c, gear: { ...c.gear, trinket2: { itemId: 272438 } } })
  }

  it('uses Weakness Analyzer on its 90 s cooldown from the pull, off the GCD, when worn', () => {
    const { plan, assumptions } = withAnalyzer()
    const list = casts(plan).casts
    const uses = times(list, 'weaknessAnalyzer')
    expect(uses[0]).toBe(0)
    for (let k = 1; k < uses.length; k++) expect(uses[k] - uses[k - 1]).toBeGreaterThanOrEqual(90000)
    expect(plan.abilities.find((a) => a.id === 'weaknessAnalyzer')!.gcdMs).toBe(0)
    const ids = assumptions.map((a) => a.id)
    expect(ids).toContain('weaknessAnalyzerPaladin')
    expect(ids).not.toContain('weaknessAnalyzer')
    expect(assumptions.find((a) => a.id === 'onUseConsumables')?.text ?? '').not.toContain('Weakness Analyzer')
    // Off: never used, and still not listed as unsimulated.
    const off = withAnalyzer({ [ID.trinkets]: false })
    expect(off.plan.abilities.map((a) => a.id)).not.toContain('weaknessAnalyzer')
    expect(off.assumptions.find((a) => a.id === 'onUseConsumables')?.text ?? '').not.toContain('Weakness Analyzer')
  })

  it('ends Weakness Analyzer’s +5% on a Seal of Command proc’s crit, which carries NOT_A_PROC, as on a white hit’s (RV1)', () => {
    // White swings and Seal of Command alone, with no crit of your own against a level-60 target:
    // every crit comes from the trinket, used once in a 60 s fight (90 s cooldown), and one crit ends it.
    const sealOnly = {
      [ID.crusader]: false,
      [ID.judgement]: false,
      [ID.holyStrike]: false,
      [ID.exorcism]: false,
      [ID.consecration]: false,
      [ID.consecrationRank1]: false,
      [ID.hammerOfWrath]: false,
      [ID.manaPotion]: false,
    }
    /** Crits per fight over 400 fights: [white, Seal of Command's proc]. */
    const critsPerFight = (trinkets: boolean) => {
      const c = config({ rotation: { ...sealOnly, [ID.trinkets]: trinkets }, fight: { durationSec: 60, durationVariationPct: 0 } })
      const plan = buildPlan({ ...c, gear: { ...c.gear, trinket2: { itemId: 272438 } } }).plan
      plan.fight.targetLevel = 60
      plan.stats.crit -= new Sim(plan).inspect().crit[0]
      expect(new Sim(plan).inspect().crit[0]).toBeCloseTo(0, 9)
      const sim = new Sim(plan)
      const rows = ['mainHand', 'sealOfCommandProc'].map((id) => plan.sources.findIndex((s) => s.id === id))
      expect(rows.every((r) => r >= 0)).toBe(true)
      const out: [number, number][] = []
      for (let i = 0; i < 400; i++) {
        const before = rows.map((r) => sim.counters[r * FIELD_COUNT + FIELD.crits])
        sim.runFight(i)
        out.push(rows.map((r, k) => sim.counters[r * FIELD_COUNT + FIELD.crits] - before[k]) as [number, number])
      }
      return out
    }
    expect(critsPerFight(false).every(([white, proc]) => white === 0 && proc === 0)).toBe(true)
    const on = critsPerFight(true)
    // Never a second crit after the first, whichever it was.
    expect(on.every(([white, proc]) => white + proc <= 1)).toBe(true)
    // The proc's crit did end it, in a good share of the fights (about 7 procs a minute beside
    // about 17 swings, over the trinket's up to 20 s).
    const byProc = on.filter(([, proc]) => proc === 1).length
    expect(byProc).toBeGreaterThan(10)
    expect(on.filter(([white]) => white === 1).length).toBeGreaterThan(byProc)
    // The result says so: Seal of Command's proc ends it, Seal of Righteousness's doesn't.
    const note = withAnalyzer().assumptions.find((a) => a.id === 'weaknessAnalyzerPaladin')!.text
    expect(note).toMatch(/: a white hit, Seal of Command’s proc, a judgement, Holy Strike, Exorcism or Hammer of Wrath; not Seal of Righteousness’s or Seal of Fury’s proc or a Consecration tick\./)
  })

  it('uses Juju Flurry every minute from the pull when it’s selected in Buffs, and not otherwise', () => {
    const plan = planOf({ buffs: [...defaultConfig(RET).buffs.enabled, 'jujuFlurry'] })
    const uses = times(casts(plan).casts, 'jujuFlurry')
    expect(uses[0]).toBe(0)
    expect(uses.length).toBeGreaterThanOrEqual(3)
    for (let k = 1; k < uses.length; k++) expect(uses[k] - uses[k - 1]).toBeGreaterThanOrEqual(60000)
    expect(planOf().abilities.map((a) => a.id)).not.toContain('jujuFlurry')
    expect(planOf({ buffs: ['jujuFlurry'], rotation: { [ID.juju]: false } }).abilities.map((a) => a.id)).not.toContain('jujuFlurry')
    expect(buildPlan(config({ buffs: ['jujuFlurry'], rotation: { [ID.juju]: false } })).assumptions.find((a) => a.id === 'onUseConsumables')?.text ?? '').not.toContain('Juju')
  })
})

describe('your own Blessing of Might (RU9): the Buffs tab’s, which a paladin casts on itself (selfCast)', () => {
  const ap = (o: Parameters<typeof config>[0]) => buildPlan(config(o)).sheet.attackPower
  const noPaladin = FULL_RAID.filter((c) => c !== 'paladin')
  const MIGHT = BUFFS_BY_ID.get('blessingOfMight')!

  it('needs no other paladin, where the other blessings do, and counts once', () => {
    expect(buffProvided(MIGHT, noPaladin, RET)).toBe(true)
    expect(buffProvided(BUFFS_BY_ID.get('blessingOfKings')!, noPaladin, RET)).toBe(false)
    expect(buffProvided(MIGHT, noPaladin, 'warrior-fury')).toBe(false)
    // The Standard raid without a paladin still blesses you with Might, but not with Kings.
    const preset = presetBuffIds('raid', RET, noPaladin)
    expect(preset).toContain('blessingOfMight')
    expect(preset).not.toContain('blessingOfKings')
    // With or without another paladin, it's the same one blessing.
    const noKings = defaultConfig(RET).buffs.enabled.filter((id) => id !== 'blessingOfKings')
    expect(ap({ raid: noPaladin, buffs: noKings })).toBe(ap({ buffs: noKings }))
    // A saved setup keeps it when the raid has no paladin.
    const saved = normalizeConfig({ ...config({ raid: noPaladin, buffs: ['blessingOfMight'] }) })
    expect(saved.config.buffs.enabled).toEqual(['blessingOfMight'])
  })

  it('is its switch: +133 attack power (Classic Era 185), and nothing with it off', () => {
    const alone = { raid: noPaladin }
    expect(ap({ ...alone, buffs: ['blessingOfMight'] }) - ap({ ...alone, buffs: [] })).toBe(133)
    const classic = { ...alone, rules: { profile: 'classicEra' as const } }
    expect(ap({ ...classic, buffs: ['blessingOfMight'] }) - ap({ ...classic, buffs: [] })).toBe(185)
    // Self only is no one's buffs, as for a druid's Mark of the Wild.
    expect(presetBuffIds('self', RET, FULL_RAID)).toEqual([])
  })
})

describe('the [?] assumptions the rotation rests on (paladin.md#open-questions)', () => {
  const ids = (o: Parameters<typeof config>[0] = {}) => buildPlan(config(o)).assumptions.map((a) => a.id)
  it('lists Holy Strike’s formula, Consecration’s ticks, Hammer of Wrath’s table and the JotC rule in use', () => {
    expect(ids()).toEqual(expect.arrayContaining(['jotcBonus', 'holyStrike', 'consecrationTicks', 'hammerOfWrath', 'sanctifiedJudgement']))
    expect(ids()).not.toContain('jotcBonusFlat')
    const flat = ids(FLAT)
    expect(flat).toContain('jotcBonusFlat')
    expect(flat).not.toContain('jotcBonus')
    expect(ids({ fight: { executePct: 0 } })).not.toContain('hammerOfWrath')
    expect(ids({ rotation: { [ID.crusader]: false } })).not.toContain('jotcBonus')
    // The potion is pressed, so it isn't listed as unsimulated.
    expect(buildPlan(config()).assumptions.find((a) => a.id === 'onUseConsumables')?.text ?? '').not.toContain('Mana Potion')
  })

  it('list the fight’s end the early potion line relies on, in paladin words, only while an early line is in the list (RL2)', () => {
    const known = (o: Parameters<typeof config>[0] = {}) => buildPlan(config(o)).assumptions.find((a) => a.id.startsWith('knownFight'))
    expect(known()?.id).toBe('knownFightEnd')
    expect(known()?.text).toMatch(/drinks a mana potion or uses a rune early only while another will be ready.*: with the default setup, judging it 10 to 20 s off costs up to 0\.\d+%\.$/)
    expect(known()?.text).not.toMatch(/Mighty Rage Potion|execute phase/)
    expect(known({ rotation: { [ID.manaPotionEarly]: 0 } })).toBeUndefined()
    expect(known({ buffs: [] })).toBeUndefined()
  })

  it('list the fight’s end without a main hand too, since the potion line still acts then (RV4)', () => {
    const { mainHand: _, ...unarmed } = config().gear
    const assumptions = buildPlan({ ...config(), gear: unarmed }).assumptions
    expect(assumptions.map((a) => a.id)).toContain('noWeaponSpells')
    expect(assumptions.map((a) => a.id)).toContain('knownFightEnd')
    // The rotation still drinks the potion early, which is what rests on it.
    const plan = buildPlan({ ...config(), gear: unarmed }).plan
    const early = plan.rotation.find((e) => plan.abilities[e.ability].id === 'majorManaPotion' && e.conditions.some((c) => c.code === COND.timeLeftAtLeast))
    expect(early).toBeDefined()
  })

  it('speak paladin: no rage, stances or forms in any of them, whatever the setup (reactionTimeMana)', () => {
    const d = defaultConfig(RET)
    const setups: SimConfig[] = [
      d,
      { ...d, rules: { ...d.rules, profile: 'classicEra' } },
      { ...d, race: 'horde-undead' },
      { ...d, race: 'alliance-dwarf' },
      config({ fight: { creatureType: 'demon', executePct: 0, position: 'front', damageTakenPerSec: 100 } }),
    ]
    for (const c of setups) {
      const notes = buildPlan(c).assumptions
      expect(notes.map((a) => a.id)).toContain('reactionTimeMana')
      for (const a of notes) expect(a.text, a.id).not.toMatch(/\brage\b|stance|\bforms?\b|druid|energy/i)
    }
  })

  it('leave out the stand-in hits a DPS player takes: nothing of a Retribution paladin’s reacts to them (docs/ux.md "Fight")', () => {
    const { plan, assumptions } = buildPlan(config({ fight: { damageTakenPerSec: 100 } }))
    expect(plan.fight.damageTakenPerHit).toBe(0)
    expect(assumptions.map((a) => a.id)).not.toContain('dpsDamageTaken')
  })
})

describe('worked example 20: the Retribution opener (paladin.md rows 0–3)', () => {
  it('Seal of the Crusader at −1.5 s; at the pull its judgement, then Seal of Command; Judgement of Command 8 s later', () => {
    const plan = planOf()
    for (let fight = 0; fight < 5; fight++) {
      const { casts: list, sim } = casts(plan, fight)
      expect(list.slice(0, 3).map((c) => `${c.id}@${c.t}`)).toEqual(['sealOfTheCrusader@-1500', 'judgementOfTheCrusader@0', 'sealOfCommand@0'])
      // Improved Judgement 2/2: an 8 s cooldown, which Judgement of the Crusader started.
      expect(times(list, 'judgementOfCommand')[0]).toBe(8000)
      // Once each: your landed auto attacks keep the debuff up all fight.
      expect(times(list, 'sealOfTheCrusader')).toEqual([-1500])
      expect(times(list, 'judgementOfTheCrusader')).toEqual([0])
      expect(auraUp(plan, sim, 'judgementOfTheCrusader')).toBe(sim.fightMs)
    }
  })

  it('pays 81 for the judgement and gets 96 back (60% of Seal of the Crusader’s 160), then 189 for Seal of Command', () => {
    const plan = planOf()
    const { casts: list } = casts(plan)
    const max = 10 * new Sim(plan).inspect().maxMana
    expect(SEAL_BASE_COST.sealOfTheCrusader).toBe(160)
    expect(list[1].mana).toBe(max)
    // Seal of Command's cast sees the judgement's cost and its return, which the cap clipped to what was spent.
    expect(list[2].mana).toBe(max)
    expect(plan.abilities[3].manaReturnTenths).toBe(960)
  })

  it('without Judgement of the Crusader: Seal of Command at −1.5 s and its judgement at the pull', () => {
    const plan = planOf({ rotation: { [ID.crusader]: false } })
    expect(plan.abilities.map((a) => a.id)).not.toContain('sealOfTheCrusader')
    const { casts: list } = casts(plan)
    expect(list.slice(0, 2).map((c) => `${c.id}@${c.t}`)).toEqual(['sealOfCommand@-1500', 'judgementOfCommand@0'])
    expect(plan.auras.some((a) => a.id === 'judgementOfTheCrusader')).toBe(false)
  })
})

describe('the seal and its judgement (paladin.md rows 1 and 3)', () => {
  it('recasts Seal of Command with 1.5 s left, so it’s up all fight; judges it on every cooldown', () => {
    const plan = planOf()
    for (let fight = 0; fight < 5; fight++) {
      const { casts: list, sim } = casts(plan, fight)
      const seals = times(list, 'sealOfCommand')
      // Each recast comes when 1.5 s are left (28.5 s after the last), or within a GCD of it.
      for (let k = 1; k < seals.length; k++) {
        expect(seals[k] - seals[k - 1], `fight ${fight}`).toBeGreaterThanOrEqual(28500)
        expect(seals[k] - seals[k - 1], `fight ${fight}`).toBeLessThanOrEqual(30000)
      }
      const up = auraUp(plan, sim, 'sealOfCommand')
      expect(up / sim.fightMs).toBeGreaterThan(0.99)
      // Judgement of Command every 8 s from 8 s, never without the seal.
      const judged = times(list, 'judgementOfCommand')
      for (let k = 1; k < judged.length; k++) expect(judged[k] - judged[k - 1]).toBeGreaterThanOrEqual(8000)
      expect(judged.length).toBeGreaterThanOrEqual(Math.floor((sim.fightMs - 8000) / 8000 / 1.05))
    }
  })

  it('judges the Crusader again, then recasts the seal, if the debuff ever drops (row 2)', () => {
    const plan = planOf()
    // A 5 s debuff that auto attacks don't refresh, to force the upkeep.
    const jotc = plan.auras.findIndex((a) => a.id === 'judgementOfTheCrusader')
    plan.auras[jotc].durationMs = 5000
    plan.procs = plan.procs.filter((p) => p.id !== 'judgementOfTheCrusaderRefresh')
    plan.triggers = plan.triggers.map(() => [])
    plan.procs.forEach((p, i) => plan.triggers[p.trigger].push(i))
    plan.fight.durationMs = 30000
    plan.fight.variation = 0
    const { casts: list } = casts(plan)
    const seq = list.filter((c) => /Crusader|sealOfCommand$/.test(c.id)).map((c) => `${c.id}@${c.t}`)
    // The debuff drops at 5 s: Seal of the Crusader at once, its judgement when Judgement is ready
    // (8 s after the pull's), then Seal of Command; the same again 5 s later.
    expect(seq.slice(0, 6)).toEqual([
      'sealOfTheCrusader@-1500',
      'judgementOfTheCrusader@0',
      'sealOfCommand@0',
      'sealOfTheCrusader@5000',
      'judgementOfTheCrusader@8000',
      'sealOfCommand@8000',
    ])
    // It never recasts Seal of the Crusader before judging it: a judgement comes between any two.
    const sotc = times(list, 'sealOfTheCrusader')
    const judged = times(list, 'judgementOfTheCrusader')
    for (let k = 1; k < sotc.length; k++) expect(judged.some((t) => t >= sotc[k - 1] && t <= sotc[k])).toBe(true)
  })
})

describe('Hammer of Wrath in the execute phase (paladin.md row 4)', () => {
  it('is used only once the execute phase starts, on its 6 s cooldown', () => {
    const plan = planOf()
    for (let fight = 0; fight < 10; fight++) {
      const { casts: list, sim } = casts(plan, fight)
      const how = times(list, 'hammerOfWrath')
      const start = Math.floor(sim.fightMs * 0.8)
      expect(how.length).toBeGreaterThan(0)
      for (const t of how) expect(t).toBeGreaterThanOrEqual(start)
      for (let k = 1; k < how.length; k++) expect(how[k] - how[k - 1]).toBeGreaterThanOrEqual(6000)
    }
  })

  it('isn’t in the list without an execute phase, or when it’s off', () => {
    expect(planOf({ fight: { executePct: 0 } }).abilities.map((a) => a.id)).not.toContain('hammerOfWrath')
    expect(planOf({ rotation: { [ID.hammerOfWrath]: false } }).abilities.map((a) => a.id)).not.toContain('hammerOfWrath')
    // Instant with Instrument of Law 2/2, on a 1 s GCD (worked example 10).
    const how = planOf().abilities.find((a) => a.id === 'hammerOfWrath')!
    expect([how.castMs, how.gcdMs]).toEqual([0, 1000])
    expect(HAMMER_OF_WRATH_ABILITY.executePhaseOnly).toBe(true)
  })
})

describe('Exorcism against Undead and Demons (paladin.md row 6)', () => {
  it('isn’t cast on other creature types', () => {
    for (const creatureType of ['none', 'beast', 'dragonkin', 'giant', 'humanoid'] as CreatureType[]) {
      expect(planOf({ fight: { creatureType } }).abilities.map((a) => a.id), creatureType).not.toContain('exorcism')
    }
  })

  it('is used on its 15 s cooldown against Undead and Demons, only at or above its mana setting', () => {
    const option = RETRIBUTION_OPTIONS.find((o) => o.id === ID.exorcismMana)!
    for (const pct of [Number(option.default), 50]) {
      for (const creatureType of ['undead', 'demon'] as CreatureType[]) {
        const plan = planOf({ fight: { creatureType }, rotation: { [ID.exorcismMana]: pct } })
        const floor = (pct / 100) * 10 * new Sim(plan).inspect().maxMana
        const { casts: list } = casts(plan)
        const exo = list.filter((c) => c.id === 'exorcism')
        expect(exo.length, `${creatureType} ${pct}%`).toBeGreaterThan(3)
        for (const c of exo) expect(c.mana).toBeGreaterThanOrEqual(floor)
        for (let k = 1; k < exo.length; k++) expect(exo[k].t - exo[k - 1].t).toBeGreaterThanOrEqual(15000)
      }
    }
  })
})

describe('Consecration by mana (paladin.md rows 7 and 8)', () => {
  it('worked example 21: the default setup’s thresholds, in tenths of its 3,392 mana', () => {
    const plan = planOf()
    expect(plan.mana!.maxTenths).toBe(33920)
    const line = (id: string) => plan.rotation.filter((e) => plan.abilities[e.ability].id === id).map((e) => e.conditions)
    expect(line('consecration')).toEqual([[{ code: COND.minMana, a: 20352, b: 0 }]])
    expect(line('consecrationRank1')).toEqual([[{ code: COND.minMana, a: 5088, b: 0 }]])
    // The potion: early from 1,500 missing (18,920 tenths or less) while 2 minutes are left, then from 2,250 (11,420).
    expect(line('majorManaPotion')).toEqual([
      [
        { code: COND.maxMana, a: 18920, b: 0 },
        { code: COND.timeLeftAtLeast, a: 120000, b: 0 },
      ],
      [{ code: COND.maxMana, a: 11420, b: 0 }],
    ])
  })

  it('rank 5 only at or above its share of maximum mana, rank 1 at or above its own; one cooldown for both', () => {
    const rotation = { [ID.consecrationMana]: 70, [ID.consecrationRank1Mana]: 20 }
    const plan = planOf({ rotation })
    const max = 10 * new Sim(plan).inspect().maxMana
    // worked example 21: the thresholds are shares of maximum mana, in tenths.
    const line = (id: string) => plan.rotation.find((e) => plan.abilities[e.ability].id === id)!
    expect(line('consecration').conditions).toEqual([{ code: COND.minMana, a: Math.round(0.7 * max), b: 0 }])
    expect(line('consecrationRank1').conditions).toEqual([{ code: COND.minMana, a: Math.round(0.2 * max), b: 0 }])
    for (let fight = 0; fight < 5; fight++) {
      const { casts: list } = casts(plan, fight)
      const cons = list.filter((c) => c.id === 'consecration' || c.id === 'consecrationRank1')
      expect(cons.length).toBeGreaterThan(5)
      for (const c of cons) expect(c.mana).toBeGreaterThanOrEqual(c.id === 'consecration' ? 0.7 * max : 0.2 * max)
      for (let k = 1; k < cons.length; k++) expect(cons[k].t - cons[k - 1].t).toBeGreaterThanOrEqual(CONSECRATION.cooldownMs)
    }
  })

  it('ticks 8 times a cast, and a rank with its setting off is left out', () => {
    const plan = planOf({ rotation: { [ID.consecrationRank1]: false } })
    expect(plan.abilities.map((a) => a.id)).not.toContain('consecrationRank1')
    expect(withTalents(CONSECRATION, new Map([['Benediction', 5]])).costTenths).toBe(5080)
  })
})

describe('mana (paladin.md#mana-model; buffs doc §3.5)', () => {
  /** A plan whose only mana gains are its consumables': no regeneration, no judgement returns. */
  function noRegen(o: Parameters<typeof config>[0]): Plan {
    const plan = planOf(o)
    plan.mana = { ...plan.mana!, regenTickTenths: 0, mp5TickTenths: 0 }
    for (const a of plan.abilities) a.manaReturnTenths = 0
    return plan
  }

  it('worked example 22: the Major Mana Potion restores 1,350–2,250, once you’re missing 2,250, or 1,500 while another fits, every 2 minutes', () => {
    const plan = noRegen({ buffs: ['majorManaPotion'], fight: { durationSec: 300 } })
    const max = 10 * new Sim(plan).inspect().maxMana
    let early = 0
    for (let fight = 0; fight < 10; fight++) {
      const { casts: list, sim } = casts(plan, fight)
      const potions = list.filter((c) => c.id === 'majorManaPotion')
      expect(potions.length).toBeGreaterThan(1)
      for (const p of potions) {
        // With at least its 2 min cooldown left, from 1,500 missing; after that, from 2,250.
        const another = sim.fightMs - p.t >= 120000
        expect(p.mana).toBeLessThanOrEqual(max - (another ? 15000 : 22500))
        if (another && p.mana > max - 22500) early++
      }
      for (let k = 1; k < potions.length; k++) expect(potions[k].t - potions[k - 1].t).toBeGreaterThanOrEqual(120000)
    }
    expect(early).toBeGreaterThan(0)
    // Without the early line, never capped (it waits until its most fits), so the mana gained is its roll.
    const once = noRegen({ buffs: ['majorManaPotion'], rotation: { [ID.manaPotionEarly]: 0 } })
    once.abilities.find((a) => a.id === 'majorManaPotion')!.cooldownMs = 1e9
    const gains: number[] = []
    for (let fight = 0; fight < 200; fight++) {
      const { casts: list, sim } = casts(once, fight)
      expect(times(list, 'majorManaPotion')).toHaveLength(1)
      gains.push(sim.totalManaGainedTenths)
    }
    for (const g of gains) {
      expect(g).toBeGreaterThanOrEqual(13500)
      expect(g).toBeLessThanOrEqual(22500)
      expect(Number.isInteger(g)).toBe(true)
    }
    const mean = gains.reduce((a, b) => a + b, 0) / gains.length
    expect(Math.abs(mean - 18000)).toBeLessThan(4 * (9000 / Math.sqrt(12)) / Math.sqrt(gains.length))
  })

  it('uses the rune on its own cooldown, apart from the potion’s, with its own threshold', () => {
    const plan = noRegen({ buffs: ['majorManaPotion', 'demonicRune'], fight: { durationSec: 300 } })
    const max = 10 * new Sim(plan).inspect().maxMana
    const { casts: list } = casts(plan)
    const runes = list.filter((c) => c.id === 'demonicRune')
    expect(runes.length).toBeGreaterThan(0)
    for (const r of runes) expect(r.mana).toBeLessThanOrEqual(max - 15000)
    // The rune doesn't wait for the potion's cooldown.
    const potions = times(list, 'majorManaPotion')
    expect(runes.some((r) => potions.some((p) => Math.abs(r.t - p) < 120000))).toBe(true)
    // Off, or not selected in Buffs: never.
    expect(times(casts(noRegen({ buffs: ['demonicRune'], rotation: { [ID.rune]: false } })).casts, 'demonicRune')).toEqual([])
    expect(noRegen({ buffs: [] }).abilities.map((a) => a.id)).not.toContain('majorManaPotion')
  })

  it('the cast trace gives the pre-pull seal the mana pool it’s cast from, full at the pull (RL6)', () => {
    const plan = planOf()
    const sim = new Sim(plan)
    const seen: [string, number, number][] = []
    sim.castTrace = (a, t, pool) => seen.push([plan.abilities[a].id, t, pool])
    sim.runFight(0)
    expect(seen[0]).toEqual(['sealOfTheCrusader', -1500, plan.mana!.maxTenths])
  })

  it('never drinks when told to wait for more missing mana than the maximum: that much is never missing (RL4)', () => {
    const plan = noRegen({ buffs: ['majorManaPotion', 'demonicRune'], fight: { durationSec: 300 }, rotation: { [ID.manaPotionMissing]: 5000, [ID.manaPotionEarly]: 5000, [ID.runeMissing]: 5000 } })
    const max = 10 * new Sim(plan).inspect().maxMana
    expect(max).toBeLessThan(50000)
    // Each line's maxMana is the maximum less 5,000 mana: below zero, so it never holds.
    const lines = plan.rotation.filter((e) => ['majorManaPotion', 'demonicRune'].includes(plan.abilities[e.ability].id))
    expect(lines).toHaveLength(3)
    for (const e of lines) expect(e.conditions.find((c) => c.code === COND.maxMana)!.a).toBe(max - 50000)
    for (let fight = 0; fight < 20; fight++) {
      const { casts: list, sim } = casts(plan, fight)
      expect(list.filter((c) => c.id === 'majorManaPotion' || c.id === 'demonicRune'), `fight ${fight}`).toEqual([])
      expect(sim.resources().mana).toBeGreaterThanOrEqual(0)
    }
  })

  it('running out of mana: nothing is cast without its mana, the seal drops, and mana never goes below zero', () => {
    const plan = noRegen({ buffs: [], fight: { durationSec: 300 } })
    const { casts: list, sim } = casts(plan)
    const max = 10 * new Sim(plan).inspect().maxMana
    for (const c of list) {
      if (c.t < 0) continue
      const cost = plan.abilities.find((a) => a.id === c.id)!.costTenths
      expect(c.mana, `${c.id}@${c.t}`).toBeGreaterThanOrEqual(cost)
    }
    // Everything spent came from the starting pool (the pre-pull seal is free).
    expect(sim.totalManaSpentTenths).toBeLessThanOrEqual(max)
    expect(sim.totalManaSpentTenths).toBeGreaterThan(max - 5080)
    // Out of mana, the seal isn't recast, so it runs out and its procs and judgements stop.
    const seal = auraUp(plan, sim, 'sealOfCommand')
    expect(seal).toBeLessThan(sim.fightMs)
    const lastJudgement = Math.max(...times(list, 'judgementOfCommand'))
    expect(lastJudgement).toBeLessThan(sim.fightMs - 30000)
    // Holy Strike (18 mana) outlasts Consecration (121 and 508).
    expect(Math.max(...times(list, 'holyStrike'))).toBeGreaterThan(Math.max(...times(list, 'consecration'), ...times(list, 'consecrationRank1')))
  })
})

describe('the mana the results report (docs/ux.md#results "Mana per fight")', () => {
  it('balances: the pool at the pull, plus what was regenerated and restored, less what was spent, is the mana left at the end', () => {
    const plan = planOf({ buffs: [...defaultConfig(RET).buffs.enabled, 'demonicRune'] })
    const sim = new Sim(plan)
    const fights = 200
    const chunk = runChunk(plan, 0, fights, sim)
    let left = 0
    for (let i = 0; i < fights; i++) {
      sim.runFight(i)
      left += sim.resources().mana
    }
    const agg = { ...emptyAggregate(plan.sources.length, plan.auras.length), ...chunk, fights }
    const mana = manaResult(plan, agg)!
    expect(mana.max).toBe(plan.mana!.maxTenths / 10)
    expect(mana.regeneratedPerFight).toBeGreaterThan(0)
    // Sanctified Judgement's returns, then the potion and the rune, each on its own line, together all of it.
    expect(mana.restored.map((r) => r.name)).toEqual(['Sanctified Judgement', 'Major Mana Potion', 'Demonic Rune'])
    for (const r of mana.restored) expect(r.perFight, r.id).toBeGreaterThan(0)
    expect(mana.restored.reduce((sum, r) => sum + r.perFight, 0)).toBeCloseTo(mana.restoredPerFight, 6)
    // The potion's line is what it restored: between 1,350 and 2,250 a drink.
    const potions = chunk.counters[plan.sources.findIndex((x) => x.id === 'majorManaPotion') * FIELD_COUNT + FIELD.casts] / fights
    expect(potions).toBeGreaterThan(1)
    const potion = mana.restored.find((r) => r.id === 'majorManaPotion')!.perFight
    expect(potion).toBeGreaterThanOrEqual(1350 * potions * 0.99)
    expect(potion).toBeLessThanOrEqual(2250 * potions)
    expect(mana.max + mana.regeneratedPerFight + mana.restoredPerFight - mana.spentPerFight).toBeCloseTo(left / 10 / fights, 6)
    // With no potion, rune or Sanctified Judgement, nothing is restored.
    const bare = planOf({ buffs: [] })
    for (const a of bare.abilities) a.manaReturnTenths = 0
    const none = manaResult(bare, { ...emptyAggregate(bare.sources.length, bare.auras.length), ...runChunk(bare, 0, 50), fights: 50 })!
    expect(none.restoredPerFight).toBe(0)
    expect(none.restored).toEqual([])
  })

  it('is only a paladin’s, by its class: a warrior’s and a druid’s results have none (RL5)', () => {
    // The ledger of 10 fights run on `plan`, read as `as` would read it.
    const ledger = (plan: Plan, as: Plan = plan) => manaResult(as, { ...emptyAggregate(plan.sources.length, plan.auras.length), ...runChunk(plan, 0, 10), fights: 10 })
    for (const spec of ['warrior-fury', 'druid-feral-cat', 'druid-feral-bear'] as const) {
      const plan = buildPlan(defaultConfig(spec)).plan
      expect(ledger(plan), spec).toBeNull()
      // A druid's plan with spells would still have none: the class decides, not the spells.
      expect(ledger(plan, { ...plan, spells: planOf().spells }), spec).toBeNull()
    }
    // A paladin's has one even with no spells in the plan.
    const ret = planOf()
    expect(ledger(ret, { ...ret, spells: [] })).not.toBeNull()
  })
})

describe('determinism', () => {
  it('the same config and seed give the same result; another seed a different one', () => {
    for (const creatureType of ['none', 'undead'] as CreatureType[]) {
      const plan = planOf({ fight: { creatureType } })
      const a = runChunk(plan, 0, 100)
      const b = runChunk(buildPlan(config({ fight: { creatureType } })).plan, 0, 100)
      expect(Array.from(b.counters)).toEqual(Array.from(a.counters))
      expect(b.dps).toEqual(a.dps)
      expect(runChunk({ ...plan, seed: plan.seed + 1 }, 0, 100).dps.mean).not.toBe(a.dps.mean)
    }
  })

  it('counts every cast on its row', () => {
    const plan = planOf()
    const { casts: list, sim } = casts(plan)
    for (const id of ['judgementOfCommand', 'holyStrike', 'hammerOfWrath']) expect(counter(plan, sim, id, FIELD.casts), id).toBe(times(list, id).length)
  })
})
