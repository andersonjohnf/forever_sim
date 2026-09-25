// Gnome Eureka! (eureka.ts): each class's variant against the client, the abilities each modifies
// against its spell masks, and the engine's charges, cost cut and damage (docs/mechanics/character-stats.md#racials-that-matter-to-the-sim).
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import type { ClientSpells } from '@/data/client/types'
import { defaultConfig } from '../defaults'
import { Sim } from '../engine/sim'
import { alwaysLandNoCrit } from '../engine/test-helpers'
import { buildPlan } from '../plan/build'
import { EUREKA, EUREKA_ABILITIES, EUREKA_COST, EUREKA_DAMAGE, EUREKA_DOT, type EurekaClass } from './eureka'
import { SPEC_IDS, SPEC_META } from '../specs'
import { MAGE_IDS } from './mage/rotation'
import { rotationOptions } from './rotation'
import { auraOf, events, examplePlan, fixSpell } from './mage/test-helpers'

const spells = (spellsJson as unknown as ClientSpells).spells
const spell = (id: number) => spells[String(id)]
/** A spell family mask's overlap with another, word by word. */
const overlaps = (a: readonly number[], b: readonly number[]) => a.some((w, i) => ((w >>> 0) & ((b[i] ?? 0) >>> 0)) !== 0)

describe('Eureka! against the client (eureka.ts)', () => {
  it('each class’s variant: aura 108 cost −x% (misc 14), damage +10% (misc 0), periodic +10% (misc 22), 3 charges, 15 s, 2 min', () => {
    for (const [cls, e] of Object.entries(EUREKA)) {
      const s = spell(e.spellId)
      expect(s.name, cls).toBe('Eureka!')
      const [cost, damage, dot] = s.effects
      expect([cost.effectAura, cost.effectMiscValue?.[0], cost.effectBasePointsF], cls).toEqual([108, 14, -e.costPct])
      expect([damage.effectAura, damage.effectMiscValue?.[0] ?? 0, damage.effectBasePointsF], cls).toEqual([108, 0, e.damagePct])
      expect([dot.effectAura, dot.effectMiscValue?.[0], dot.effectBasePointsF], cls).toEqual([108, 22, e.dotPct])
      expect([s.auraOptions?.procCharges, s.duration?.duration, s.cooldowns?.recoveryTime], cls).toEqual([e.charges, e.durationMs, e.cooldownMs])
    }
    // 1.60.1.70009: a flat 10% for every class (it was 40 / 20 / 50 / 50 / 15).
    expect(Object.fromEntries(Object.entries(EUREKA).map(([c, e]) => [c, e.costPct]))).toEqual({ warrior: 10, rogue: 10, mage: 10, warlock: 10, priest: 10 })
  })

  it('the abilities each one modifies are its masks’: the cast spell’s for the cost, the damaging spell’s for the damage and DoT', () => {
    for (const [cls, table] of Object.entries(EUREKA_ABILITIES)) {
      const e = spell(EUREKA[cls as EurekaClass].spellId)
      const set = e.classOptions!.spellClassSet
      const [cost, damage, dot] = e.effects.map((x) => x.effectSpellClassMask ?? [])
      for (const [id, { spell: cast, damageSpell, bits }] of Object.entries(table)) {
        const own = spell(cast).classOptions!
        const dealt = spell(damageSpell ?? cast).classOptions!
        expect([own.spellClassSet, dealt.spellClassSet], `${cls} ${id}`).toEqual([set, set])
        const want = (overlaps(own.spellClassMask!, cost) ? EUREKA_COST : 0) | (overlaps(dealt.spellClassMask!, damage) ? EUREKA_DAMAGE : 0) | (overlaps(dealt.spellClassMask!, dot) ? EUREKA_DOT : 0)
        expect(bits, `${cls} ${id}`).toBe(want)
      }
    }
    // Mutilate's cast only cuts its cost; its strikes, the damage spell, take the +10% (EV-1).
    expect(EUREKA_ABILITIES.rogue.mutilate.bits).toBe(EUREKA_COST | EUREKA_DAMAGE)
    // Outside the masks: Pyroblast (18809), Incinerate (1293813), Siphon Life (18881), Hemorrhage (16511), Sunder Armor (11597), Revenge (25288).
    const outside: [EurekaClass, number][] = [['mage', 18809], ['warlock', 1293813], ['warlock', 18881], ['rogue', 16511], ['warrior', 11597], ['warrior', 25288]]
    for (const [cls, id] of outside) {
      const [cost, damage] = spell(EUREKA[cls].spellId).effects.map((x) => x.effectSpellClassMask ?? [])
      const mask = spell(id).classOptions!.spellClassMask!
      expect(overlaps(mask, cost) || overlaps(mask, damage), `${cls} ${id}`).toBe(false)
    }
  })

  it('no ability in any of its classes’ plans, every setting on, is in a mask but missing from the list', () => {
    // Consumables: items, not the class's spells, so no client spell of theirs carries its name.
    const items = new Set(['mightyRagePotion', 'thistleTea', 'manaRuby', 'manaCitrine', 'majorManaPotion'])
    const byName = new Map<string, number[]>()
    for (const s of Object.values(spells)) byName.set(s.name, [...(byName.get(s.name) ?? []), s.id])
    let seen = 0
    for (const spec of SPEC_IDS) {
      const cls = SPEC_META[spec].classId
      if (!(cls in EUREKA)) continue
      const e = spell(EUREKA[cls as EurekaClass].spellId)
      const set = e.classOptions!.spellClassSet
      const masks = e.effects.map((x) => x.effectSpellClassMask ?? [])
      const table = EUREKA_ABILITIES[cls as EurekaClass]
      // Every switch on, and each choice at each of its values (Arms's stance, the warlock's demon).
      const options = rotationOptions(spec)
      const on = Object.fromEntries(options.flatMap((o) => (o.kind === 'toggle' ? [[o.id, true]] : [])))
      const settings = [on, ...options.flatMap((o) => (o.kind === 'choice' ? o.choices.map((c) => ({ ...on, [o.id]: c.value })) : []))]
      const abilities = new Map<string, string>()
      for (const rotation of settings) for (const a of buildPlan({ ...defaultConfig(spec), race: 'alliance-gnome', rotation }).plan.abilities) abilities.set(a.id, a.name)
      for (const [id, name] of abilities) {
        seen++
        if (id === 'eureka' || items.has(id)) continue
        // Each is a client spell, by its name: a new ability the sim names otherwise must be added above.
        const ids = byName.get(name) ?? []
        expect(ids.length, `${spec} ${id}: no client spell is named ${name}`).toBeGreaterThan(0)
        const listed = table[id]
        if (listed) {
          expect(spell(listed.spell).name, `${spec} ${id}`).toBe(name)
          continue
        }
        const inMask = ids.filter((i) => {
          const own = spell(i).classOptions?.spellClassSet === set ? spell(i).classOptions?.spellClassMask : undefined
          return own !== undefined && masks.some((m) => overlaps(own, m))
        })
        expect(inMask, `${spec} ${id} (${name}) is in ${cls}'s Eureka! masks but not in EUREKA_ABILITIES`).toEqual([])
      }
    }
    expect(seen).toBeGreaterThan(100)
  })
})

describe('Eureka! in the engine (eureka.ts)', () => {
  it('a Gnome mage: the next 3 Fireballs cost 369 mana, not 410, and deal +10%, their DoT’s ticks too; then the aura is gone', () => {
    const plan = examplePlan({ race: 'alliance-gnome', rotation: { [MAGE_IDS.fire.racial]: true } })
    fixSpell(plan, 'fireball', 1000)
    const { uses, damage, list } = events(plan, ['eureka'])
    expect(uses('eureka').map((u) => u.t)).toEqual([0])
    // Fireball's 3.5 s casts: each is paid, and spends a charge, as it lands.
    const casts = uses('fireball').slice(0, 5)
    expect(casts.map((u) => u.t)).toEqual([0, 3500, 7000, 10500, 14000])
    const spent = casts.slice(1).map((u, i) => casts[i].value - u.value)
    expect(spent).toEqual([3690, 3690, 3690, 4100])
    const hits = damage('fireball').slice(0, 5).map((d) => d.value)
    for (const k of [0, 1, 2]) expect(hits[k] / hits[3], `Fireball ${k + 1}`).toBeCloseTo(1.1, 12)
    expect(hits[4]).toBeCloseTo(hits[3], 12)
    // The DoT of the first (ticks 2 s after each landing, until the next restarts it) and the fourth's.
    const tick = (after: number) => damage('fireballDot').find((d) => d.t > after)!.value
    expect(tick(3500) / tick(14000)).toBeCloseTo(1.1, 12)
    // The third charge takes the aura down at 10.5 s, well before its 15 s.
    expect(uses('fireball')[3].stacks.eureka).toBe(0)
    expect(list.filter((e) => e.kind === 'use' && e.id === 'fireball' && e.t === 7000)[0].stacks.eureka).toBe(1)
  })

  it('a Gnome Fury warrior: the next 3 Bloodthirsts cost 27 rage, not 30, and deal +10% (the plain-rage rows pay through the cut)', () => {
    const d = defaultConfig('warrior-fury')
    // No buffs and no armor, so nothing but Eureka! changes Bloodthirst's damage.
    const plan = buildPlan({ ...d, race: 'alliance-gnome', buffs: { raid: d.buffs.raid, enabled: [] }, rotation: { 'warrior.fury.deathWish.enabled': false, 'warrior.fury.recklessness.enabled': false } }).plan
    alwaysLandNoCrit(plan)
    plan.fight.targetArmor = 0
    const keep = new Set(['eureka', 'bloodthirst'])
    plan.rotation = plan.rotation.filter((r) => keep.has(plan.abilities[r.ability].id))
    const bt = plan.abilities.findIndex((a) => a.id === 'bloodthirst')
    const btRow = plan.abilities[bt].source
    const sim = new Sim(plan)
    const paid: number[] = []
    const dealt: number[] = []
    let before = 0
    sim.castTrace = (a, _t, pool) => {
      if (a === bt) before = pool
    }
    sim.damageTrace = (s, dmg) => {
      if (s !== btRow) return
      paid.push(before - sim.resources().rage)
      dealt.push(dmg)
    }
    sim.runFight(0)
    expect(plan.eureka?.aura).toBe(auraOf(plan, 'eureka'))
    expect(paid.slice(0, 5)).toEqual([270, 270, 270, 300, 300])
    for (const k of [0, 1, 2]) expect(dealt[k] / dealt[3], `Bloodthirst ${k + 1}`).toBeCloseTo(1.1, 9)
  })

  it('a Gnome Combat rogue: the next 3 Sinister Strikes cost 10% less Energy, rounded down', () => {
    const d = defaultConfig('rogue-combat')
    const plan = buildPlan({ ...d, race: 'alliance-gnome', buffs: { raid: d.buffs.raid, enabled: [] } }).plan
    alwaysLandNoCrit(plan)
    plan.fight.targetArmor = 0
    const keep = new Set(['eureka', 'sinisterStrike'])
    plan.rotation = plan.rotation.filter((r) => keep.has(plan.abilities[r.ability].id))
    const ss = plan.abilities.findIndex((a) => a.id === 'sinisterStrike')
    const full = plan.abilities[ss].costTenths
    const sim = new Sim(plan)
    const paid: number[] = []
    const dealt: number[] = []
    let before = 0
    sim.castTrace = (a, _t, pool) => {
      if (a === ss) before = pool
    }
    sim.damageTrace = (s, dmg) => {
      if (s !== plan.abilities[ss].source) return
      paid.push(before - sim.resources().energy)
      dealt.push(dmg)
    }
    sim.runFight(0)
    const cut = 10 * Math.floor((full * 0.9) / 10)
    expect(paid.slice(0, 4)).toEqual([cut, cut, cut, full])
    // Its +10% is the strike's damage path, the warrior's above (Sinister Strike rolls the weapon).
    expect(dealt.length).toBeGreaterThan(3)
    expect(plan.abilities[ss].eureka).toBe(EUREKA_COST | EUREKA_DAMAGE)
  })

  it('a Gnome Assassination rogue: the next 3 Mutilates cost 54 Energy, not 60, and both hands’ strikes deal +10%', () => {
    const d = defaultConfig('rogue-assassination')
    const plan = buildPlan({ ...d, race: 'alliance-gnome', buffs: { raid: d.buffs.raid, enabled: [] } }).plan
    alwaysLandNoCrit(plan)
    plan.fight.targetArmor = 0
    // Fixed weapon rolls and no poison bonus, so nothing but Eureka! changes a strike's damage.
    for (const w of plan.weapons) if (w) w.max = w.min
    const keep = new Set(['eureka', 'mutilate'])
    plan.rotation = plan.rotation.filter((r) => keep.has(plan.abilities[r.ability].id))
    const m = plan.abilities.findIndex((a) => a.id === 'mutilate')
    plan.abilities[m].poisonedTargetPct = 0
    const { source, offHandSource } = plan.abilities[m]
    expect(offHandSource).toBeGreaterThanOrEqual(0)
    const sim = new Sim(plan)
    const paid: number[] = []
    const main: number[] = []
    const off: number[] = []
    let before = 0
    sim.castTrace = (a, _t, pool) => {
      if (a === m) before = pool
    }
    sim.damageTrace = (s, dmg) => {
      if (s === source) {
        main.push(dmg)
        paid.push(before - sim.resources().energy)
      } else if (s === offHandSource) off.push(dmg)
    }
    sim.runFight(0)
    expect(paid.slice(0, 4)).toEqual([540, 540, 540, 600])
    for (const hand of [main, off]) {
      for (const k of [0, 1, 2]) expect(hand[k] / hand[3], `strike ${k + 1}`).toBeCloseTo(1.1, 9)
    }
  })

  it('an ability it doesn’t modify spends no charge: a Gnome Fire mage’s Pyroblast', () => {
    const plan = examplePlan({ race: 'alliance-gnome', talents: { 'Hot Streak': 1, Pyroblast: 1 }, rotation: { [MAGE_IDS.fire.racial]: true, [MAGE_IDS.fire.pyroblast]: true }, spellCrit: 200 })
    const { uses } = events(plan, ['eureka'])
    const pyro = uses('pyroblast')[0]
    const fireballs = uses('fireball')
    // The first Fireball crits, so a Pyroblast follows it: Eureka! still has its 2 charges left.
    expect(pyro.t).toBe(fireballs[0].t + 3500)
    expect(pyro.stacks.eureka).toBe(1)
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(plan.abilities.find((a) => a.id === 'pyroblast')?.eureka ?? 0).toBe(0)
  })
})
