// Power Infusion (docs/mechanics/buffs-debuffs-consumables.md#power-infusion): a priest's +20% spell
// damage for 15 s, cast on you once at the pull, for the caster specs and the Protection paladin. Its
// client values, worked example 14, the fights it changes (only their first 15 s), who sees it, and
// that it's off by default.
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import type { ClientSpells } from '@/data/client/types'
import { normalizeConfig } from '../config/normalize'
import { defaultConfig, FULL_RAID } from '../defaults'
import { Sim } from '../engine/sim'
import { buildPlan } from '../plan/build'
import { MAGIC_SCHOOLS, SCHOOL, schoolMask, type Plan } from '../plan/types'
import { SPEC_IDS, SPEC_META } from '../specs'
import type { SimConfig, SpecId } from '../types'
import { BUFFS_BY_ID, POWER_INFUSION } from './buffs'
import { forSpecClass, presetBuffIds } from './presets'
import { rotationOff } from '../classes/mage/test-helpers'

const spells = (spellsJson as unknown as ClientSpells).spells
const PI = 'powerInfusion'
const PROT = 'paladin-protection'
/** The specs the entry is for: every caster spec, and the Protection paladin (buffs doc §1.1). */
const FOR: readonly SpecId[] = [
  'druid-balance',
  'shaman-elemental',
  'mage-fire',
  'mage-frost',
  'mage-arcane',
  'warlock-affliction',
  'warlock-demonology',
  'warlock-destruction',
  'priest-shadow',
  PROT,
]

/** The spec's default setup (its Standard raid preset), with Power Infusion on or off. */
const withPi = (spec: SpecId, on: boolean, patch: Partial<SimConfig> = {}): SimConfig => {
  const base = { ...defaultConfig(spec), ...patch }
  const enabled = base.buffs.enabled.filter((id) => id !== PI)
  return { ...base, buffs: { raid: [...FULL_RAID], enabled: on ? [...enabled, PI] : enabled } }
}

const nowOf = (sim: Sim) => (sim as unknown as { now: number }).now
const auraOf = (plan: Plan, id: string) => plan.auras.findIndex((a) => a.id === id)

/** Each damage event of fight `index`, in order: when, from which row, its damage and the threat it added. */
function events(plan: Plan, index: number) {
  const sim = new Sim(plan)
  const log: { t: number; source: string; damage: number; threat: number }[] = []
  let threat = 0
  sim.damageTrace = (s, damage) => {
    log.push({ t: nowOf(sim), source: plan.sources[s].id, damage, threat: sim.fightThreat - threat })
    threat = sim.fightThreat
  }
  sim.runFight(index)
  return { log, sim }
}

describe('Power Infusion’s client values (buffs doc §1.1 "Power Infusion")', () => {
  const pi = spells['10060']
  it('10060: +20% damage (aura 79) and healing done (aura 136) to every magic school, 15 s, 3 min, and no mana-cost effect', () => {
    expect(pi.name).toBe('Power Infusion')
    const auras = pi.effects.map((e) => [e.effectAura, e.effectBasePointsF, e.effectMiscValue?.[0]])
    expect(auras).toEqual([
      [136, 20, 126],
      [79, 20, 126],
    ])
    expect(pi.duration?.duration).toBe(15000)
    expect(pi.cooldowns?.recoveryTime).toBe(180000)
    // No aura 72 (a school's power cost %) or 108 misc 14 (a spell's cost): the cost cut isn't in the client.
    expect(pi.effects.some((e) => e.effectAura === 72 || (e.effectAura === 108 && e.effectMiscValue?.[0] === 14))).toBe(false)
    // Nothing that keeps it and Arcane Power (12042) apart: neither has aura restrictions (open question 23).
    expect(pi.auraRestrictions).toBeUndefined()
    expect(spells['12042'].auraRestrictions).toBeUndefined()
  })

  it('the catalogue’s cast carries them: +20% to the magic schools for 15 s, off the GCD, once a fight', () => {
    expect(POWER_INFUSION).toMatchObject({ cooldownMs: 180000, gcdMs: 0, charges: 1 })
    expect(POWER_INFUSION.aura).toMatchObject({ durationMs: 15000, mods: { schoolDamage: 20, schoolMask: schoolMask(MAGIC_SCHOOLS) } })
  })
})

describe('worked example 14: Power Infusion at the pull', () => {
  it('a 180 s fight: up from 0 to 15 s, 8.33% of the fight, cast once', () => {
    const plan = buildPlan(withPi('mage-fire', true, { fight: { ...defaultConfig('mage-fire').fight, durationSec: 180, durationVariationPct: 0 } })).plan
    const { sim } = events(plan, 0)
    expect(sim.auraUpMs[auraOf(plan, PI)]).toBe(15000)
    expect(sim.auraUpMs[auraOf(plan, PI)] / 180000).toBeCloseTo(0.0833, 4)
  })

  it('a 400 s fight: still once, though its 3 min cooldown would allow a second and a third', () => {
    for (const spec of ['mage-fire', PROT] as const) {
      const plan = buildPlan(withPi(spec, true, { fight: { ...defaultConfig(spec).fight, durationSec: 400, durationVariationPct: 0 } })).plan
      const sim = new Sim(plan)
      const casts: number[] = []
      const pi = plan.abilities.findIndex((a) => a.id === PI)
      expect(pi, spec).toBeGreaterThanOrEqual(0)
      expect(plan.abilities[pi].usesPerFight, spec).toBe(1)
      sim.castTrace = (a, t) => {
        if (a === pi) casts.push(t)
      }
      sim.runFight(0)
      expect(casts, spec).toEqual([0])
      expect(sim.auraUpMs[auraOf(plan, PI)], spec).toBe(15000)
    }
  })

  it('×1.20 on each magic school while it’s up: a 1,000 Frostbolt deals 1,200; with Arcane Power ×1.30 × 1.20 = ×1.56', () => {
    // A Frost mage with only its filler and Power Infusion's row, the same fight with and without it:
    // every Frostbolt that lands in the first 15 s deals 1.2× as much, and every later one the same.
    const config = (on: boolean) => withPi('mage-frost', on, { rotation: { ...rotationOff('frost'), 'mage.frost.powerInfusion.enabled': true } })
    const [off, on] = [false, true].map((o) => events(buildPlan(config(o)).plan, 3).log)
    expect(on.length).toBe(off.length)
    let inside = 0
    for (let k = 0; k < on.length; k++) {
      expect(on[k].t).toBe(off[k].t)
      if (on[k].t === 15000) continue
      const ratio = on[k].damage / off[k].damage
      if (on[k].t < 15000) {
        inside++
        expect(ratio).toBeCloseTo(1.2, 9)
      } else expect(ratio).toBeCloseTo(1, 9)
    }
    expect(inside).toBeGreaterThan(3)
    expect(1000 * 1.2).toBe(1200)
    expect(1.3 * 1.2).toBeCloseTo(1.56, 12)
  })
})

describe('Power Infusion in the fight: only its first 15 s gain', () => {
  it('a Fire mage’s damage: higher before 15 s, the same after, but for the DoTs that snapshotted it', () => {
    const [off, on] = [false, true].map((o) => events(buildPlan(withPi('mage-fire', o)).plan, 5).log)
    expect(on.length).toBe(off.length)
    // docs/mechanics/spells.md §7: a DoT (Fireball's, Pyroblast's, Ignite) keeps the multipliers it
    // landed with, so one that landed inside ticks higher after it.
    const direct = (e: { source: string }) => !e.source.endsWith('Dot') && e.source !== 'ignite'
    const sum = (log: typeof on, from: number, to: number) => log.filter((e) => e.t >= from && e.t < to && direct(e)).reduce((a, e) => a + e.damage, 0)
    expect(sum(on, 0, 15000) / sum(off, 0, 15000)).toBeCloseTo(1.2, 9)
    expect(sum(on, 15000, Infinity)).toBeCloseTo(sum(off, 15000, Infinity), 6)
    expect(on.filter((e) => e.t >= 15000 && !direct(e)).length).toBeGreaterThan(0)
  })

  it('a Protection paladin’s Holy damage and threat: higher before 15 s, the same after; physical swings don’t change', () => {
    const [off, on] = [false, true].map((o) => events(buildPlan(withPi(PROT, o)).plan, 5).log)
    expect(on.length).toBe(off.length)
    let gained = 0
    for (let k = 0; k < on.length; k++) {
      expect(on[k].source).toBe(off[k].source)
      expect(on[k].t).toBe(off[k].t)
      const ratio = off[k].damage > 0 ? on[k].damage / off[k].damage : 1
      const threat = off[k].threat > 0 ? on[k].threat / off[k].threat : 1
      if (on[k].t >= 15000 || on[k].source === 'mainHand') {
        expect(ratio, `${on[k].source} at ${on[k].t}`).toBeCloseTo(1, 9)
        expect(threat, `${on[k].source} at ${on[k].t}`).toBeCloseTo(1, 9)
        continue
      }
      // Holy: ×1.2, less where Judgement of the Crusader's flat bonus (not multiplied) is part of it.
      expect(ratio).toBeGreaterThanOrEqual(1 - 1e-9)
      expect(ratio).toBeLessThanOrEqual(1.2 + 1e-9)
      if (ratio > 1.1) gained++
    }
    expect(gained).toBeGreaterThan(3)
    const threat = (log: typeof on, from: number, to: number) => log.filter((e) => e.t >= from && e.t < to).reduce((a, e) => a + e.threat, 0)
    expect(threat(on, 0, 15000)).toBeGreaterThan(1.05 * threat(off, 0, 15000))
  })

  it('the Protection paladin’s spell damage multiplier while it’s up is ×1.2 on Holy, not on physical', () => {
    const plan = buildPlan(withPi(PROT, true)).plan
    const aura = plan.auras[auraOf(plan, PI)]
    expect(aura.schoolDamage).toBe(20)
    expect(aura.schoolMask! & (1 << SCHOOL.holy)).not.toBe(0)
    expect(aura.schoolMask! & (1 << SCHOOL.physical)).toBe(0)
  })
})

describe('who sees Power Infusion, and its default', () => {
  it('the caster specs and the Protection paladin, and no other spec', () => {
    const buff = BUFFS_BY_ID.get(PI)!
    expect(SPEC_IDS.filter((s) => forSpecClass(buff, s)).sort()).toEqual([...FOR].sort())
    // Every caster spec is in it: a new caster gets it without a change here.
    for (const s of SPEC_IDS) if (SPEC_META[s].caster) expect(FOR, s).toContain(s)
  })

  it('off by default: in no preset of any spec', () => {
    for (const spec of SPEC_IDS) {
      expect(defaultConfig(spec).buffs.enabled, spec).not.toContain(PI)
      for (const preset of ['self', 'dungeon', 'raid', 'max'] as const) expect(presetBuffIds(preset, spec, [...FULL_RAID]), `${spec} ${preset}`).not.toContain(PI)
    }
  })

  it('a melee spec never sees it: a saved Fury or Retribution setup drops it, saying why, and a plan ignores it', () => {
    for (const spec of ['warrior-fury', 'paladin-retribution', 'rogue-combat'] as const) {
      const config = withPi(spec, true)
      const normalized = normalizeConfig(config)
      expect(normalized.config.buffs.enabled, spec).not.toContain(PI)
      expect(normalized.warnings.join(' '), spec).toMatch(/Power Infusion is for casters and Protection paladins only/)
      const plan = buildPlan(config)
      expect(plan.plan.abilities.some((a) => a.id === PI), spec).toBe(false)
      expect(plan.assumptions.some((a) => a.id === PI), spec).toBe(false)
    }
  })

  it('on, the results say it’s cast once at the pull; an Arcane mage’s add that it stacks with Arcane Power', () => {
    for (const spec of FOR) {
      const text = buildPlan(withPi(spec, true)).assumptions.find((a) => a.id === PI)?.text
      expect(text, spec).toMatch(/once, at the pull/)
      expect(text?.includes('Arcane Power'), spec).toBe(spec === 'mage-arcane')
      expect(buildPlan(withPi(spec, false)).assumptions.some((a) => a.id === PI), spec).toBe(false)
    }
  })
})
