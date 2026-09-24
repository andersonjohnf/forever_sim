// The plan builder's side of the caster core (docs/mechanics/spells.md §5, §7, §9, §10, §12): a
// caster's abilities, DoT rows and markers, spell procs, school effects and sheet, before any
// caster spec exists. The Retribution paladin stands in: its rotation and passives are replaced
// here by a synthetic caster's (a Corruption, a Fireball, an Arcane Missiles channel, Improved
// Scorch-like stacks, school effects), so buildPlan and the results run on them as they will for K2–K6.
import { describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../defaults'
import { CHUNK_SIZE, runChunk } from '../engine/chunk'
import { Sim } from '../engine/sim'
import { emptyAggregate, mergeChunk, toResult } from '../run/aggregate'
import { SPEC_META } from '../specs'
import { buildPlan } from './build'
import { CASTER_ROW, COND, SCHOOL, type AbilityDef, type SpellDef } from './types'

vi.mock('../classes/rotation', async (importOriginal) => {
  const original = await importOriginal<typeof import('../classes/rotation')>()
  const { CASTER_ROW: row } = await import('./types')
  const spell = (patch: Partial<SpellDef> & Pick<SpellDef, 'id' | 'name' | 'school'>): SpellDef => ({
    icon: 'x',
    defense: 'magic',
    noActiveDefense: false,
    alwaysHit: false,
    triggersProcs: true,
    min: 0,
    max: 0,
    weaponPercent: 0,
    normalized: false,
    spCoefficient: 0,
    takenScale: 0,
    critMultiplier: 1.5,
    bonusCrit: 0,
    damageMult: 1,
    threatMult: 1,
    threatBonus: 0,
    ...patch,
  })
  const ability = (patch: Partial<AbilityDef> & Pick<AbilityDef, 'id' | 'name' | 'kind'>): AbilityDef => ({
    ...row,
    icon: 'x',
    resource: 'mana',
    costTenths: 100,
    cooldownMs: 0,
    gcdMs: 1500,
    castMs: 0,
    offHand: false,
    aura: null,
    ...patch,
  })
  const abilities: AbilityDef[] = [
    ability({
      id: 'corruption',
      name: 'Corruption',
      kind: 'spell',
      castMs: 2000,
      castHasted: true,
      aura: { id: 'corruption', name: 'Corruption', durationMs: 18000, mods: {} },
      spellDef: spell({ id: 'corruption', name: 'Corruption', school: 'shadow', dotTicks: 6, dotTickMs: 3000, dotTickDamage: 73, dotSpCoefficient: 0.2, dotCanCrit: true }),
    }),
    ability({
      id: 'fireball',
      name: 'Fireball',
      kind: 'spell',
      castMs: 3500,
      castHasted: true,
      spellDef: spell({ id: 'fireball', name: 'Fireball', school: 'fire', min: 425, max: 541, spCoefficient: 1, dotTicks: 4, dotTickMs: 2000, dotTickDamage: 15, dotCanCrit: true }),
    }),
    ability({
      id: 'arcaneMissiles',
      name: 'Arcane Missiles',
      kind: 'channel',
      cooldownMs: 30000,
      rageTicks: 5,
      rageTickMs: 1000,
      tickSpellDef: spell({ id: 'arcaneMissile', name: 'Arcane Missiles', school: 'arcane', min: 100, max: 100, spCoefficient: 0.24 }),
    }),
  ]
  return {
    ...original,
    classRotation: (...args: Parameters<typeof original.classRotation>) =>
      args[0] !== 'paladin-retribution'
        ? original.classRotation(...args)
        : {
            abilities,
            rotation: [
              { ability: 0, conditions: [{ code: COND.abilityAuraRefresh, a: 0, b: 2000 }], unqueueBelowTenths: 0 },
              { ability: 2, conditions: [], unqueueBelowTenths: 0 },
              { ability: 1, conditions: [], unqueueBelowTenths: 0 },
            ],
            prepull: { casts: [], chargeTenths: 0, keepTenths: -1 },
            onUse: [],
            procs: [
              {
                id: 'fireVulnerability',
                name: 'Fire Vulnerability',
                icon: 'x',
                trigger: 'spellLanded',
                from: 'any',
                chance: { pct: 100 },
                fromSpell: 'fireball',
                action: { kind: 'aura', aura: { id: 'fireVulnerability', name: 'Fire Vulnerability', durationMs: 30000, maxStacks: 5, mods: { schoolMask: 1 << SCHOOL.fire, schoolTaken: 3 } } },
                docRef: 'docs/mechanics/spells.md#9-caster-raid-buffs-and-debuffs',
              },
              {
                id: 'nowhere',
                name: 'Nowhere',
                icon: 'x',
                trigger: 'spellLanded',
                from: 'any',
                chance: { pct: 100 },
                fromSpell: 'frostbolt',
                action: { kind: 'aura', aura: { id: 'nowhere', name: 'Nowhere', durationMs: 1000, mods: {} } },
                docRef: 'docs/mechanics/spells.md#10-spell-procs',
              },
            ],
          },
  }
})

vi.mock('../classes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../classes')>()
  return {
    ...original,
    classSetup: (...args: Parameters<typeof original.classSetup>) => {
      const setup = original.classSetup(...args)
      if (args[1] !== 'paladin-retribution') return setup
      // A caster's passives, as its talents and buffs will give them (spells.md §5, §9).
      return {
        ...setup,
        effects: [
          ...setup.effects,
          { kind: 'schoolTaken', schools: ['shadow'], pct: 10 },
          { kind: 'targetResistance', schools: ['shadow'], value: -75 },
          { kind: 'schoolDamage', schools: ['fire'], pct: 10 },
          { kind: 'schoolCrit', schools: ['fire'], pct: 5 },
          { kind: 'castHaste', pct: 10 },
          { kind: 'stat', stat: 'shadowSpellDamage', value: 30 },
          { kind: 'stat', stat: 'spellPen', value: 10 },
        ],
      }
    },
  }
})

function caster() {
  const config = { ...defaultConfig('paladin-retribution'), run: { mode: 'fixed' as const, iterations: 500, seed: 7 } }
  return buildPlan(config)
}

describe('a caster’s plan (docs/mechanics/spells.md §12)', () => {
  it('gives a pure DoT one row that counts applications and ticks, a hybrid’s DoT its own, and marks the DoT with its ability’s aura', () => {
    const { plan } = caster()
    const row = (id: string) => plan.sources.findIndex((s) => s.id === id)
    const corruption = plan.spells!.find((s) => s.source === row('corruption'))!
    const fireball = plan.spells!.find((s) => s.source === row('fireball'))!
    expect(plan.sources[row('corruption')].bleed).toEqual({ ticksCanCrit: true, avoidable: true })
    expect(corruption.dotSource).toBeUndefined()
    expect(corruption.dotAura).toBe(plan.auras.findIndex((a) => a.id === 'corruption'))
    expect(fireball.dotSource).toBe(row('fireballDot'))
    expect(plan.sources[row('fireballDot')]).toMatchObject({ name: 'Fireball (DoT)', bleed: { ticksCanCrit: true, avoidable: false } })
    expect(fireball.dotAura).toBeUndefined()
    // A channel needs no weapon; Arcane Missiles' missiles have their own row.
    expect(plan.abilities.find((a) => a.id === 'arcaneMissiles')).toMatchObject({ kind: 'channel', rageTicks: 5 })
    expect(plan.spells!.some((s) => s.source === row('arcaneMissile'))).toBe(true)
  })

  it('resolves a spell proc’s one spell to its row, and leaves out one that names a spell the plan doesn’t cast', () => {
    const { plan } = caster()
    const vuln = plan.procs.find((p) => p.id === 'fireVulnerability')!
    expect(vuln.fromSource).toBe(plan.sources.findIndex((s) => s.id === 'fireball'))
    expect(plan.auras.find((a) => a.id === 'fireVulnerability')).toMatchObject({ schoolMask: 1 << SCHOOL.fire, schoolTaken: 3, maxStacks: 5 })
    expect(plan.procs.some((p) => p.id === 'nowhere')).toBe(false)
  })

  it('collects the school effects into the plan’s schools, with the boss’s resistance per school', () => {
    const { plan } = caster()
    const s = plan.schools!
    expect(s.taken[SCHOOL.shadow]).toBeCloseTo(1.1, 12)
    expect(s.damage[SCHOOL.fire]).toBeCloseTo(1.1, 12)
    expect(s.crit[SCHOOL.fire]).toBe(5)
    // 24 + max(0, −75) − 10 penetration (spells.md §3); Holy and physical none.
    expect(s.resistance).toEqual([14, 14, 14, 14, 14, 0, 0])
    expect(plan.stats.castHaste).toBeCloseTo(1.1, 12)
    expect(new Sim(plan).inspect().castHaste).toBeCloseTo(1.1, 12)
  })

  it('shows a caster’s spell block on the sheet: spell damage by school, casting speed and penetration', () => {
    const meta = SPEC_META['paladin-retribution']
    meta.caster = true
    try {
      const { sheet } = caster()
      const c = sheet.spell!.caster!
      expect(c.schoolDamage.shadow - c.schoolDamage.fire).toBe(30)
      expect(c.castSpeedPct).toBeCloseTo(10, 9)
      expect(c.spellPen).toBe(10)
    } finally {
      delete meta.caster
    }
    expect(caster().sheet.spell!.caster).toBeUndefined()
  })

  it('runs, and reports each DoT row with its uptime on the boss and the hybrid’s hit row', () => {
    const bundle = caster()
    const { plan } = bundle
    const sim = new Sim(plan)
    let agg = emptyAggregate(plan.sources.length, plan.auras.length)
    for (let k = 0; k * CHUNK_SIZE < 500; k++) agg = mergeChunk(agg, runChunk(plan, k, CHUNK_SIZE, sim))
    const result = toResult(bundle, agg, 0)
    const row = (id: string) => result.abilities.find((a) => a.id === id)!
    expect(row('corruption').bleed).toMatchObject({ ticksCanCrit: true, avoidable: true })
    expect(row('corruption').bleed!.uptimePct).toBeGreaterThan(80)
    expect(row('corruption').bleed!.hitId).toBeUndefined()
    expect(row('fireballDot').bleed).toMatchObject({ hitId: 'fireball', avoidable: false })
    expect(row('arcaneMissile').damage).toBeGreaterThan(0)
    // The DoT's marker is on the boss: not a buff in "Cooldowns and buffs".
    expect(result.cooldowns.some((c) => c.id === 'corruption')).toBe(false)
    expect(result.cooldowns.find((c) => c.id === 'fireVulnerability')!.uptimePct).toBeGreaterThan(80)
    // A caster spends mana: the result has its ledger.
    expect(result.mana).toBeDefined()
  })
})

// The core leaves every shipped setup alone: engine/engine.test.ts and the paladin goldens hold
// their snapshots, and a caster's school effects can't reach a warrior, druid or paladin
// (effects/class-filter.test.ts). CASTER_ROW is what a class slice starts its rows from.
it('CASTER_ROW is a plain row: no weapon, any stance, no rage, crit ×1.5', () => {
  expect(CASTER_ROW).toMatchObject({ weaponPercent: 0, stances: 7, rageTenths: 0, critMultiplier: 1.5, usesPerFight: 0 })
})
