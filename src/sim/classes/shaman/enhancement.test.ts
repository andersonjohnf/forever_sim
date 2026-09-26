// The Enhancement priority list (docs/classes/shaman.md#enhancement-priority): the rows each setting
// builds, the imbue before the pull, the mana thresholds, the assumptions the results list, the mana
// the results report, and determinism.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { CHUNK_SIZE, type ChunkResult, runChunk } from '../../engine/chunk'
import { FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { COND, type Plan } from '../../plan/types'
import { emptyAggregate, manaResult } from '../../run/aggregate'
import { type ChunkExecutor, drive } from '../../run/driver'
import { localExecutor } from '../../run/local'
import type { RotationValue, SimConfig } from '../../types'
import { ROTATION_GROUPS, rotationDefaultsNote, rotationOptions } from '../rotation'
import { ENHANCEMENT_APL, ENHANCEMENT_IDS as ID, ENHANCEMENT_OPTIONS, enhancementRotation, PREPULL_IMBUE_MS, TOTEM_OF_RAGE } from './enhancement'
import { EARTH_SHOCK_THREAT_MULT } from './abilities'
import { auraOf, ENH, talentCode } from './test-helpers'

/** The default Enhancement setup, with these settings, race, buffs and fight. */
function config(o: { rotation?: Record<string, RotationValue>; race?: string; buffs?: string[]; fight?: Partial<SimConfig['fight']> } = {}): SimConfig {
  const d = defaultConfig(ENH, o.race)
  return { ...d, rotation: o.rotation ?? {}, buffs: { raid: d.buffs.raid, enabled: o.buffs ?? d.buffs.enabled }, fight: { ...d.fight, ...o.fight } }
}
const planOf = (o: Parameters<typeof config>[0] = {}) => buildPlan(config(o)).plan
const ids = (plan: Plan) => plan.abilities.map((a) => a.id)
const lineOf = (plan: Plan, id: string) => plan.rotation.find((e) => plan.abilities[e.ability].id === id)
const counter = (plan: Plan, sim: Sim, id: string, field: number) => sim.counters[plan.sources.findIndex((s) => s.id === id) * FIELD_COUNT + field]
/** The Standard raid's buffs with Juju Flurry and the Demonic Rune (the Max-consumables preset has both). */
const MAX_BUFFS = () => [...defaultConfig(ENH).buffs.enabled, 'jujuFlurry', 'demonicRune']

describe('the Enhancement settings (shaman.md "Enhancement priority")', () => {
  it('put every setting but the imbue under a heading, a dependent one after its parent under the same heading, and no spec-wide heading over one setting', () => {
    expect(rotationOptions(ENH)).toBe(ENHANCEMENT_OPTIONS)
    for (const [i, option] of ENHANCEMENT_OPTIONS.entries()) {
      expect(option.id).toMatch(/^shaman\.enhancement\.\w+(\.\w+)?$/)
      // The imbue shapes the rest (it turns off Windfury Totem), so it has no heading and comes first, as Arms' stance does (docs/ux.md "Rotation").
      if (option.id === ID.imbue) expect(option.group).toBeUndefined()
      else expect(ROTATION_GROUPS, option.id).toContain(option.group)
      if (option.dependsOn === undefined) continue
      const p = ENHANCEMENT_OPTIONS.findIndex((o) => o.id === option.dependsOn)
      expect(p, option.id).toBeGreaterThanOrEqual(0)
      expect(p, option.id).toBeLessThan(i)
      expect(ENHANCEMENT_OPTIONS[p].group, option.id).toBe(option.group)
    }
    // The headings are the spec-wide settings', above the priority list (the rows hold the rest).
    const specWide = ENHANCEMENT_OPTIONS.filter((o) => ENHANCEMENT_APL.specWide.includes(o.id))
    expect(specWide[0].id).toBe(ID.imbue)
    for (const group of ROTATION_GROUPS) {
      const n = specWide.filter((o) => o.group === group).length
      if (n > 0) expect(n, group).toBeGreaterThanOrEqual(2)
    }
    expect(new Set(ENHANCEMENT_OPTIONS.map((o) => o.id)).size).toBe(ENHANCEMENT_OPTIONS.length)
  })

  it('default to the first-pass priority: Windfury, every cooldown, Stormstrike, Lightning Bolt at 5 stacks, Earth Shock from 10% mana, the potion at 2,250 missing', () => {
    const defaults = Object.fromEntries(ENHANCEMENT_OPTIONS.map((o) => [o.id, o.default]))
    expect(defaults).toEqual({
      [ID.imbue]: 'windfury',
      [ID.racial]: true,
      [ID.farseer]: true,
      [ID.trinkets]: true,
      [ID.juju]: true,
      [ID.stormstrike]: true,
      [ID.bolt]: true,
      [ID.boltStacks]: 5,
      [ID.shock]: 'earth',
      [ID.shockMana]: 10,
      [ID.manaPotion]: true,
      [ID.manaPotionMissing]: 2250,
      [ID.rune]: true,
      [ID.runeMissing]: 1500,
    })
    // The Rotation tab says these are the common priority until the spec is tuned (D27).
    expect(rotationDefaultsNote(ENH)).toMatch(/^The defaults are the common priority\./)
  })

  it('build the default list: Blood Fury, Rage of the Farseer and Earthstrike, then Stormstrike, Lightning Bolt, Earth Shock and the mana potion', () => {
    const plan = planOf()
    expect(ids(plan)).toEqual(['bloodFury', 'rageOfTheFarseer', 'earthstrike', 'stormstrike', 'lightningBolt', 'earthShock', 'majorManaPotion'])
    expect(plan.abilities.map((a) => a.costTenths / 10)).toEqual([0, 0, 0, 125, 220, 247, 0])
    expect(plan.rotation.map((e) => ids(plan)[e.ability])).toEqual(ids(plan))
    // Lightning Bolt at 5 Maelstrom Weapon stacks; Earth Shock from 10% of 3,925 mana; the potion at 1,675 or less.
    expect(lineOf(plan, 'lightningBolt')!.conditions).toEqual([{ code: COND.auraStacksAtLeast, a: auraOf(plan, 'maelstromWeapon'), b: 5 }])
    expect(lineOf(plan, 'earthShock')!.conditions).toEqual([{ code: COND.minMana, a: 3925, b: 0 }])
    expect(lineOf(plan, 'majorManaPotion')!.conditions).toEqual([{ code: COND.maxMana, a: 16750, b: 0 }])
    expect(plan.prepull.casts).toEqual([])
    expect(plan.procs.find((p) => p.id === 'windfuryWeapon')!.a).toBeCloseTo(466.2, 9)
    // Totem of Rage (the default relic) adds its 2% to the shock.
    expect(plan.spells!.find((s) => plan.sources[s.source].id === 'earthShock')!.damageMult).toBeCloseTo(1.05 * 1.02, 12)
    expect(plan.spells!.find((s) => plan.sources[s.source].id === 'lightningBolt')!.damageMult).toBeCloseTo(1.05, 12)
  })

  it('Rockbiter Weapon: cast 3 s before the pull (an hour-long buff, +783.6 attack power), and no Windfury Weapon', () => {
    const plan = planOf({ rotation: { [ID.imbue]: 'rockbiter' } })
    const a = ids(plan).indexOf('rockbiterWeapon')
    expect(plan.prepull.casts).toEqual([{ ability: a, atMs: PREPULL_IMBUE_MS }])
    expect(PREPULL_IMBUE_MS).toBe(-3000)
    expect(plan.rotation.some((e) => e.ability === a)).toBe(false)
    expect(plan.auras[plan.abilities[a].aura]).toMatchObject({ durationMs: 3600000, ap: expect.closeTo(783.6, 9) })
    expect(plan.procs.map((p) => p.id)).not.toContain('windfuryWeapon')
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(sim.auraUpMs[plan.abilities[a].aura]).toBe(sim.fightMs)
  })

  it('the racial: Blood Fury for an Orc, Berserking for a Troll, none for a Tauren or with the switch off', () => {
    expect(ids(planOf({ race: 'horde-troll' }))[0]).toBe('berserking')
    expect(ids(planOf({ race: 'horde-tauren' }))).not.toContain('bloodFury')
    expect(ids(planOf({ rotation: { [ID.racial]: false } }))).not.toContain('bloodFury')
  })

  it('each switch takes its row out; Rage of the Farseer and Stormstrike need their talents, Lightning Bolt Maelstrom Weapon', () => {
    for (const [setting, id] of [
      [ID.farseer, 'rageOfTheFarseer'],
      [ID.trinkets, 'earthstrike'],
      [ID.stormstrike, 'stormstrike'],
      [ID.bolt, 'lightningBolt'],
      [ID.manaPotion, 'majorManaPotion'],
    ] as const) {
      const plan = planOf({ rotation: { [setting]: false } })
      expect(ids(plan), setting).not.toContain(id)
    }
    const values = { [ID.farseer]: true, [ID.stormstrike]: true, [ID.bolt]: true }
    const bare = enhancementRotation(values, new Map(), () => 0)
    expect(bare.abilities.map((a) => a.id)).toEqual(['earthShock'])
    // Without Maelstrom Weapon's aura in the plan, the bolt has no line.
    const noAura = enhancementRotation(values, new Map([['Maelstrom Weapon', 5]]), () => -1)
    expect(noAura.rotation.map((e) => noAura.abilities[e.ability].id)).toEqual(['earthShock'])
  })

  it('Lightning Bolt at 1–5 stacks, rounded and clamped', () => {
    for (const [stacks, b] of [
      [3, 3],
      [4.4, 4],
      [0, 1],
      [9, 5],
    ] as const) {
      const plan = planOf({ rotation: { [ID.boltStacks]: stacks } })
      expect(lineOf(plan, 'lightningBolt')!.conditions[0], `${stacks}`).toMatchObject({ code: COND.auraStacksAtLeast, b })
    }
  })

  it('the shock: Frost Shock (236 mana) or none; its mana threshold a share of the maximum, none at 0%', () => {
    const frost = planOf({ rotation: { [ID.shock]: 'frost', [ID.shockMana]: 50 } })
    expect(ids(frost)).toContain('frostShock')
    expect(ids(frost)).not.toContain('earthShock')
    expect(frost.abilities[ids(frost).indexOf('frostShock')].costTenths).toBe(2360)
    expect(lineOf(frost, 'frostShock')!.conditions).toEqual([{ code: COND.minMana, a: 19625, b: 0 }])
    expect(ids(planOf({ rotation: { [ID.shock]: 'none' } })).some((id) => id.endsWith('Shock'))).toBe(false)
    expect(lineOf(planOf({ rotation: { [ID.shockMana]: 0 } }), 'earthShock')!.conditions).toEqual([])
  })

  it('the potion and the rune: when missing their amounts, off the GCD, only when selected in Buffs', () => {
    const plan = planOf({ rotation: { [ID.manaPotionMissing]: 1500 }, buffs: MAX_BUFFS() })
    expect(lineOf(plan, 'majorManaPotion')!.conditions).toEqual([{ code: COND.maxMana, a: 39250 - 15000, b: 0 }])
    expect(lineOf(plan, 'demonicRune')!.conditions).toEqual([{ code: COND.maxMana, a: 39250 - 15000, b: 0 }])
    expect(plan.abilities.filter((a) => a.id === 'majorManaPotion' || a.id === 'demonicRune').map((a) => a.gcdMs)).toEqual([0, 0])
    expect(ids(planOf({ rotation: { [ID.rune]: false }, buffs: MAX_BUFFS() }))).not.toContain('demonicRune')
    expect(ids(planOf({ buffs: defaultConfig(ENH).buffs.enabled.filter((b) => b !== 'majorManaPotion') }))).not.toContain('majorManaPotion')
  })

  it('Juju Flurry on cooldown when selected in Buffs', () => {
    const plan = planOf({ buffs: MAX_BUFFS() })
    expect(ids(plan)).toContain('jujuFlurry')
    expect(ids(planOf({ buffs: MAX_BUFFS(), rotation: { [ID.juju]: false } }))).not.toContain('jujuFlurry')
  })

  it('Totem of Rage adds 2% to either shock, and nothing to Lightning Bolt', () => {
    const talents = new Map([['Concussion', 5]])
    const values = { [ID.shock]: 'frost', [ID.bolt]: false, [ID.stormstrike]: false }
    const withIt = enhancementRotation(values, talents, () => 0, { equipped: new Set([TOTEM_OF_RAGE]) })
    const without = enhancementRotation(values, talents, () => 0, { equipped: new Set() })
    expect(withIt.abilities[0].spellDef!.damageMult).toBeCloseTo(1.02, 12)
    expect(without.abilities[0].spellDef!.damageMult).toBe(1)
  })
})

describe('what the default fight does (shaman.md "Enhancement priority")', () => {
  it('uses every row: Stormstrike every 8 s or so, a Lightning Bolt at each 5th Maelstrom Weapon stack (about 9 a fight), Earth Shock on its cooldown while mana lasts', () => {
    const plan = planOf()
    const sim = new Sim(plan)
    for (let i = 0; i < 50; i++) sim.runFight(i)
    const casts = (id: string) => counter(plan, sim, id, FIELD.casts) / 50
    const seconds = sim.fightMs / 1000
    expect(casts('stormstrike')).toBeGreaterThan(seconds / 8 - 3)
    expect(casts('lightningBolt')).toBeGreaterThan(7)
    expect(casts('earthShock')).toBeGreaterThan(10)
    expect(casts('bloodFury')).toBeGreaterThanOrEqual(1)
    expect(casts('rageOfTheFarseer')).toBeGreaterThanOrEqual(1)
    expect(casts('earthstrike')).toBeGreaterThanOrEqual(1)
    expect(counter(plan, sim, 'windfuryWeapon', FIELD.casts)).toBeGreaterThan(0)
  })

  it('Earth Shock’s threat is twice its damage, Lightning Bolt’s its damage (shaman.md open question 8)', () => {
    const plan = planOf()
    const sim = new Sim(plan)
    for (let i = 0; i < 20; i++) sim.runFight(i)
    const perDamage = (id: string) => counter(plan, sim, id, FIELD.threat) / counter(plan, sim, id, FIELD.damage)
    expect(counter(plan, sim, 'earthShock', FIELD.damage)).toBeGreaterThan(0)
    expect(perDamage('earthShock') / perDamage('lightningBolt')).toBeCloseTo(EARTH_SHOCK_THREAT_MULT, 9)
    expect(EARTH_SHOCK_THREAT_MULT).toBe(2)
    const text = buildPlan(config()).assumptions.find((a) => a.id === 'earthShockThreat')!.text
    expect(text).toContain('twice its damage, as a Classic Era threat library has it')
    // A DPS result shows no threat, so the row says what the value changes (EU-5).
    expect(text).toContain('It changes only your threat, which a DPS result doesn’t show.')
  })

  it('lists the [?] assumptions it relies on; a Lightning Bolt with a cast time adds its own, not Slam’s', () => {
    const notes = (o: Parameters<typeof config>[0] = {}) => buildPlan(config(o)).assumptions.map((a) => a.id)
    const d = notes()
    for (const id of ['reactionTimeShaman', 'manaRegenShaman', 'windfuryWeapon', 'maelstromWeapon', 'shamanFlurry', 'stormstrikeBoost', 'earthShockThreat', 'shamanSpellDamage', 'shamanTotems', 'baseStatPlaceholders'])
      expect(d, id).toContain(id)
    for (const id of ['lightningBoltCast', 'slamCast', 'reactionTime', 'reactionTimeMana', 'windfuryWeaponTotem']) expect(d, id).not.toContain(id)
    const cast = notes({ rotation: { [ID.boltStacks]: 4 } })
    expect(cast).toContain('lightningBoltCast')
    expect(cast).not.toContain('slamCast')
    expect(notes({ rotation: { [ID.imbue]: 'rockbiter' } })).not.toContain('windfuryWeapon')
  })

  it('reports its mana: the pool, regenerated, restored by the potion and spent, balanced (shaman.md#mana)', () => {
    const plan = planOf()
    const sim = new Sim(plan)
    const fights = 100
    const chunk = runChunk(plan, 0, fights, sim)
    let left = 0
    for (let i = 0; i < fights; i++) {
      sim.runFight(i)
      left += sim.resources().mana
    }
    const mana = manaResult(plan, { ...emptyAggregate(plan.sources.length, plan.auras.length), ...chunk, fights })!
    expect(mana.max).toBe(3925)
    expect(mana.restored.map((r) => r.name)).toEqual(['Major Mana Potion'])
    expect(mana.spentPerFight).toBeGreaterThan(mana.max)
    expect(mana.max + mana.regeneratedPerFight + mana.restoredPerFight - mana.spentPerFight).toBeCloseTo(left / 10 / fights, 6)
  })
})

/** A fake pool: `lanes` chunks at once, finishing out of order (engine.test.ts). */
function racingExecutor(plan: Plan, lanes: number): ChunkExecutor {
  const sims = Array.from({ length: lanes }, () => new Sim(plan))
  let n = 0
  return {
    lanes,
    run: (chunk, fights) =>
      new Promise<ChunkResult>((resolve) => {
        const result = runChunk(plan, chunk, fights, sims[n++ % lanes])
        setTimeout(() => resolve(result), (chunk * 7919) % 13)
      }),
  }
}

describe('determinism (D15)', () => {
  it('the same config and seed give the same result; another seed a different one', () => {
    for (const rotation of [{}, { [ID.imbue]: 'rockbiter', [ID.boltStacks]: 3 }]) {
      const plan = planOf({ rotation })
      const a = runChunk(plan, 0, 100)
      const b = runChunk(buildPlan(structuredClone(config({ rotation }))).plan, 0, 100)
      expect(Array.from(b.counters)).toEqual(Array.from(a.counters))
      expect(b.dps).toEqual(a.dps)
      expect(runChunk({ ...plan, seed: plan.seed + 1 }, 0, 100).dps.mean).not.toBe(a.dps.mean)
    }
  })

  it('gives bit-identical results on 1 and 3 workers, including a partial last chunk', async () => {
    const c: SimConfig = { ...config(), run: { mode: 'fixed', iterations: 2 * CHUNK_SIZE + 100, seed: 42 } }
    const a = buildPlan(c).plan
    const b = buildPlan(structuredClone(c)).plan
    const one = await drive(a, localExecutor(a), { mode: 'fixed', iterations: c.run.iterations })
    const three = await drive(b, racingExecutor(b, 3), { mode: 'fixed', iterations: c.run.iterations })
    expect(one.fights).toBe(c.run.iterations)
    expect(three).toEqual(one)
  })
})

describe('the talents the list reads (shaman.md#talents)', () => {
  it('without Elemental Weapons, Windfury Weapon has its bare 333 and Rockbiter its 653', () => {
    const talents = talentCode({ Stormstrike: 1, 'Maelstrom Weapon': 5 })
    const d = config()
    const wf = buildPlan({ ...d, talents }).plan
    expect(wf.procs.find((p) => p.id === 'windfuryWeapon')!.a).toBe(333)
    const rb = buildPlan({ ...d, talents, rotation: { [ID.imbue]: 'rockbiter' } }).plan
    expect(rb.auras[rb.abilities[ids(rb).indexOf('rockbiterWeapon')].aura].ap).toBe(653)
  })
})
