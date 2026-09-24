// The casters' racial cooldowns (caster-racials.ts): the client's effects, and one definition that
// every casting class presses (docs/mechanics/character-stats.md#racials-that-matter-to-the-sim).
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import type { ClientSpells } from '@/data/client/types'
import { defaultConfig } from '../defaults'
import { unusedRotationSettings } from '../index'
import { Sim } from '../engine/sim'
import { buildPlan } from '../plan/build'
import type { SpecId } from '../types'
import { BERSERKING_CASTER, BLOOD_FURY_CASTER, CASTER_RACIALS } from './caster-racials'

const spells = (spellsJson as unknown as ClientSpells).spells
const auras = (id: number) => spells[String(id)].effects.map((e) => [e.effectAura, e.effectBasePointsF])

describe('the casters’ racial cooldowns (caster-racials.ts)', () => {
  it('match the client: Berserking +10% casting and attack speed, Blood Fury +10% attack power and spell power', () => {
    expect(auras(20554)).toEqual(expect.arrayContaining([[65, 10], [319, 10]]))
    expect(BERSERKING_CASTER.aura!.mods).toEqual({ haste: 10, castHaste: 10 })
    expect(auras(20572)).toEqual(expect.arrayContaining([[166, 10], [317, 10]]))
    expect(BLOOD_FURY_CASTER.aura!.mods).toEqual({ apPct: 10, spellDamagePct: 10 })
    expect(CASTER_RACIALS['horde-orc']).toBe(BLOOD_FURY_CASTER)
    expect(CASTER_RACIALS['horde-troll']).toBe(BERSERKING_CASTER)
  })

  it('every casting class presses the same ones: the mage’s Blood Fury included', () => {
    const cases: [SpecId, string, string][] = [
      ['mage-frost', 'horde-troll', 'berserking'],
      ['mage-fire', 'horde-orc', 'bloodFury'],
      ['priest-shadow', 'horde-troll', 'berserking'],
      ['warlock-affliction', 'horde-troll', 'berserking'],
      ['warlock-destruction', 'horde-orc', 'bloodFury'],
      ['shaman-elemental', 'horde-troll', 'berserking'],
      ['shaman-elemental', 'horde-orc', 'bloodFury'],
      ['shaman-enhancement', 'horde-orc', 'bloodFury'],
      // Enhancement's Troll: the melee's attack speed and the shocks' and Lightning Bolt's casting speed.
      ['shaman-enhancement', 'horde-troll', 'berserking'],
    ]
    for (const [spec, race, id] of cases) {
      const bundle = buildPlan({ ...defaultConfig(spec), race })
      const def = id === 'berserking' ? BERSERKING_CASTER : BLOOD_FURY_CASTER
      expect(bundle.plan.abilities.map((a) => a.id), `${spec} ${race}`).toContain(id)
      const aura = bundle.plan.auras.find((a) => a.id === id)!
      expect(aura.durationMs, `${spec} ${race}`).toBe(def.aura!.durationMs)
      if (id === 'berserking') expect(aura, `${spec} ${race}`).toMatchObject({ haste: 10, castHaste: 10 })
      else expect(aura, `${spec} ${race}`).toMatchObject({ apPct: 10, spellDamagePct: 10 })
      // The Rotation tab doesn't mark the racial setting unused (a mage's Blood Fury was, before).
      expect(Object.keys(unusedRotationSettings({ ...defaultConfig(spec), race })).filter((k) => k.endsWith('.racial.enabled')), `${spec} ${race}`).toEqual([])
    }
  })

  it('an Enhancement Troll presses Berserking at the pull and on its 3-minute cooldown in a fight', () => {
    const plan = buildPlan({ ...defaultConfig('shaman-enhancement'), race: 'horde-troll' }).plan
    const sim = new Sim(plan)
    const used: number[] = []
    sim.castTrace = (a, t) => {
      if (plan.abilities[a].id === 'berserking') used.push(t)
    }
    sim.runFight(0)
    expect(used[0]).toBe(0)
    for (let k = 1; k < used.length; k++) expect(used[k] - used[k - 1]).toBeGreaterThanOrEqual(BERSERKING_CASTER.cooldownMs)
    expect(used.length).toBe(Math.floor(sim.fightMs / BERSERKING_CASTER.cooldownMs) + 1)
  })
})
