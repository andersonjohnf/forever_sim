// The cat's ability rows against the Forever client data (docs/classes/druid.md §1.1, §3, §5.1;
// docs/data/client.md), Tiger's Fury's Energy (W8), and the priority list its settings build
// (§6.2): the default lines in order, and what each setting changes.
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpells, ClientTalents } from '@/data/client/types'
import { CRIT_MULTIPLIER } from '../../core/formulas'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { JUJU_FLURRY, MIGHTY_RAGE_POTION } from '../../effects/buffs'
import { ITEM_EFFECTS } from '../../effects/items'
import { COND } from '../../plan/types'
import { talentRanksByName } from '../index'
import { MAX_ENERGY_TENTHS, WOLFSHEAD_HELM } from './abilities'
import { CAT_OPTIONS, catMaintainedBuffs, catRotation } from './cat'
import {
  BERSERK,
  BERSERK_CRIT_PCT,
  CAT_GCD_MS,
  CLAW,
  FAERIE_FIRE_ARMOR,
  FAERIE_FIRE_CAT,
  FEROCIOUS_BITE,
  KING_OF_THE_JUNGLE_ENERGY_PER_RANK,
  onUseCast,
  RAKE,
  RIP,
  SHRED,
  tigersFury,
  tigersFuryEnergy,
  WOLFSHEAD_TIGERS_FURY_ENERGY,
} from './cat-abilities'
import { formBit } from './forms'
import { withDruidTalents } from './modifiers'

const spells = (spellsJson as unknown as ClientSpells).spells
const clientTalents = (talentsJson as unknown as ClientTalents).classes.druid.talents
const CAT = talentRanksByName(TALENT_DATA.druid, defaultConfig('druid-feral-cat').talents)
const spell = (id: number) => spells[String(id)]
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
/** SpellEffect: school damage, apply aura, energize, weapon damage, weapon % damage; SpellAuraName: periodic damage. */
const EFFECT = { schoolDamage: 2, applyAura: 6, energize: 30, weaponDamage: 58, weaponPercent: 31, dummy: 3 }
const AURA = { periodicDamage: 3, dummy: 4, modArmor: 22, addFlatModifier: 107, addPctModifier: 108, meleeHaste: 319 }
/** SPELLMOD codes (the aura's misc value): crit chance, cooldown, cost, GCD. */
const SPELLMOD = { critChance: 7, cooldown: 11, cost: 14, gcd: 21 }
const ENERGY = 3
const COMBO_POINTS = 4
/** SpellMisc Attributes[8] 0x200: periodic effects can crit. */
const periodicCrits = (id: number) => ((spell(id).misc?.attributes?.[8] ?? 0) & 0x200) !== 0
const masked = (mask: readonly number[], id: number) => mask.some((m, i) => (m & (spell(id).classOptions?.spellClassMask?.[i] ?? 0)) !== 0)

describe('the cat’s abilities against the client (druid.md §3)', () => {
  it('Shred (9830): 60 Energy, 155% weapon damage + 80, a combo point, the 1 s cat GCD, Cat Form only', () => {
    const s = spell(9830)
    expect(s.power).toEqual([{ manaCost: SHRED.costTenths / 10, powerType: ENERGY }])
    expect(s.cooldowns?.startRecoveryTime).toBe(CAT_GCD_MS)
    expect(SHRED.gcdMs).toBe(CAT_GCD_MS)
    expect(effect(9830, 1).effect).toBe(EFFECT.weaponPercent)
    expect(effect(9830, 1).effectBasePointsF! / 100).toBeCloseTo(SHRED.weaponPercent, 12)
    expect(effect(9830, 0)).toMatchObject({ effect: EFFECT.weaponDamage, effectBasePointsF: SHRED.flatDamage })
    expect(effect(9830, 2)).toMatchObject({ effect: EFFECT.energize, effectBasePointsF: SHRED.comboPoints, effectMiscValue: [COMBO_POINTS, 0] })
    expect(s.shapeshift?.shapeshiftMask).toEqual([1, 0])
    expect(SHRED.forms).toBe(formBit('cat'))
    expect(SHRED.behindOnly).toBe(true)
  })

  it('Claw (9850): 45 Energy, 110% weapon damage + 115, a combo point', () => {
    expect(spell(9850).power![0].manaCost).toBe(CLAW.costTenths / 10)
    expect(effect(9850, 1).effectBasePointsF! / 100).toBeCloseTo(CLAW.weaponPercent, 12)
    expect(effect(9850, 0).effectBasePointsF).toBe(CLAW.flatDamage)
    expect(CLAW.comboPoints).toBe(effect(9850, 2).effectBasePointsF)
  })

  it('Rake (9904): 40 Energy, 61 damage, then 34 every 3 s for 9 s, which can crit in Forever; a combo point', () => {
    expect(spell(9904).power![0].manaCost).toBe(RAKE.costTenths / 10)
    expect(effect(9904, 0)).toMatchObject({ effect: EFFECT.schoolDamage, effectBasePointsF: RAKE.flatDamage })
    expect(effect(9904, 1)).toMatchObject({ effectAura: AURA.periodicDamage, effectBasePointsF: RAKE.dotTickDamage, effectAuraPeriod: RAKE.dotTickMs })
    expect(spell(9904).duration?.duration).toBe(RAKE.dotTicks * RAKE.dotTickMs)
    expect(RAKE.aura?.durationMs).toBe(spell(9904).duration?.duration)
    expect(periodicCrits(9904)).toBe(RAKE.periodicCanCrit)
    expect(RAKE.kind).toBe('meleeSpell') // no weapon damage: two rolls [?] (Q33)
  })

  it('Rip (9896): 30 Energy and every combo point; 15 + 25.5 per point every 2 s for 12 s, which can crit in Forever', () => {
    const s = spell(9896)
    expect(s.power).toEqual([
      { manaCost: RIP.costTenths / 10, powerType: ENERGY },
      { manaCost: 1, optionalCost: 4, powerType: COMBO_POINTS },
    ])
    expect(effect(9896, 0)).toMatchObject({
      effectAura: AURA.periodicDamage,
      effectBasePointsF: RIP.dotTickDamage,
      effectPointsPerResource: RIP.dotTickPerComboPoint,
      effectAuraPeriod: RIP.dotTickMs,
    })
    expect(s.duration?.duration).toBe(RIP.dotTicks * RIP.dotTickMs)
    expect(periodicCrits(9896)).toBe(RIP.periodicCanCrit)
    expect(RIP.finisher).toBe(true)
    // The attack power term isn't in the client: 1% per point per tick, 4 points at most [?] (Q3).
    expect([RIP.dotApCoefficientPerComboPoint, RIP.comboPointApCap]).toEqual([0.01, 4])
  })

  it('Ferocious Bite (31018): 35 Energy; 82 ± 30 (52–112) + 147 per point, + 2.7 per extra Energy', () => {
    const e = effect(31018, 0)
    expect(spell(31018).power![0].manaCost).toBe(FEROCIOUS_BITE.costTenths / 10)
    const half = (e.effectBasePointsF! * e.variance!) / 2
    expect(FEROCIOUS_BITE.flatDamage).toBeCloseTo(e.effectBasePointsF! - half, 3)
    expect(FEROCIOUS_BITE.flatDamage + FEROCIOUS_BITE.flatDamageRange!).toBeCloseTo(e.effectBasePointsF! + half, 3)
    expect([FEROCIOUS_BITE.flatDamage, FEROCIOUS_BITE.flatDamageRange]).toEqual([52, 60])
    expect(e.effectPointsPerResource).toBe(FEROCIOUS_BITE.damagePerComboPoint)
    expect(effect(31018, 1)).toMatchObject({ effect: EFFECT.dummy, effectBasePointsF: 100 * FEROCIOUS_BITE.damagePerExtraRage })
    expect(FEROCIOUS_BITE.apCoefficientPerComboPoint).toBe(0.03) // [?] (Q3)
  })

  it('Tiger’s Fury (5217): +15% physical damage for 6 s, a 30 s cooldown, off the GCD, Cat Form only', () => {
    const s = spell(5217)
    const tf = tigersFury(3, false)
    expect(s.cooldowns).toEqual({ recoveryTime: tf.cooldownMs })
    expect(s.duration?.duration).toBe(tf.aura?.durationMs)
    expect(effect(5217, 0)).toMatchObject({ effectAura: AURA.dummy, effectBasePointsF: tf.aura?.mods.damage })
    expect(s.auraRestrictions?.casterAuraSpell).toBe(768) // Cat Form
    expect([tf.gcdMs, tf.costTenths, tf.forms]).toEqual([0, 0, formBit('cat')])
  })

  it('W8: King of the Jungle’s 20/40/60 and Wolfshead Helm’s 20 more: 80 at 3/3 with the helm', () => {
    const kotj = clientTalents.find((t) => t.name === 'King of the Jungle')!
    expect(kotj.rankEffects[0].values).toEqual([1, 2, 3].map((r) => r * KING_OF_THE_JUNGLE_ENERGY_PER_RANK))
    expect(effect(17768, 1)).toMatchObject({ effectAura: AURA.dummy, effectBasePointsF: WOLFSHEAD_TIGERS_FURY_ENERGY })
    expect(tigersFuryEnergy(3, true)).toBe(80)
    expect(tigersFury(3, true).rageTenths).toBe(800)
    expect(tigersFury(3, false).rageTenths).toBe(600)
    expect(tigersFury(3, true).resource).toBe('energy')
    // `tfMaxEnergy` of the setup: 100 − 80 = 20, or 40 without the helm.
    expect(MAX_ENERGY_TENTHS / 10 - tigersFuryEnergy(3, true)).toBe(20)
    expect(MAX_ENERGY_TENTHS / 10 - tigersFuryEnergy(3, false)).toBe(40)
  })

  it('Berserk (417141): 15 s, a 3 min cooldown, +100% crit on Shred, Claw and Rake only', () => {
    const s = spell(417141)
    expect(s.cooldowns?.recoveryTime).toBe(BERSERK.cooldownMs)
    expect(s.duration?.duration).toBe(BERSERK.aura?.durationMs)
    const crit = effect(417141, 0)
    expect(crit).toMatchObject({ effectAura: AURA.addFlatModifier, effectBasePointsF: BERSERK_CRIT_PCT, effectMiscValue: [SPELLMOD.critChance, 0] })
    const mask = crit.effectSpellClassMask!
    for (const [id, def] of [
      [9830, SHRED],
      [9850, CLAW],
      [9904, RAKE],
      [9896, RIP],
      [31018, FEROCIOUS_BITE],
    ] as const) {
      expect(masked(mask, id), def.id).toBe(def.auraCrit !== undefined)
    }
  })

  it('Faerie Fire (9907) in Cat Form: −505 armor for 40 s; the cat passive makes it free, 6 s cooldown, 1 s GCD', () => {
    expect(effect(9907, 0)).toMatchObject({ effectAura: AURA.modArmor, effectBasePointsF: -FAERIE_FIRE_ARMOR })
    expect(spell(9907).duration?.duration).toBe(FAERIE_FIRE_CAT.aura?.durationMs)
    expect(FAERIE_FIRE_CAT.aura?.mods.targetArmor).toBe(FAERIE_FIRE_ARMOR)
    const mod = (m: number) => spell(3025).effects.find((e) => e.effectMiscValue?.[0] === m && masked(e.effectSpellClassMask ?? [], 9907))!
    expect(mod(SPELLMOD.cost).effectBasePointsF).toBe(-100)
    expect(mod(SPELLMOD.cooldown).effectBasePointsF).toBe(FAERIE_FIRE_CAT.cooldownMs)
    expect(spell(9907).cooldowns!.startRecoveryTime! + mod(SPELLMOD.gcd).effectBasePointsF!).toBe(FAERIE_FIRE_CAT.gcdMs)
    expect(FAERIE_FIRE_CAT.costTenths).toBe(0)
    expect(FAERIE_FIRE_CAT.spellHit).toBe(true)
  })

  it('Clearcasting (16870) pays Shred, Claw, Rake, Rip and Ferocious Bite; not the free casts', () => {
    const mask = effect(16870, 0).effectSpellClassMask!
    for (const [id, def] of [
      [9830, SHRED],
      [9850, CLAW],
      [9904, RAKE],
      [9896, RIP],
      [31018, FEROCIOUS_BITE],
      [5217, tigersFury(3, true)],
      [417141, BERSERK],
      [9907, FAERIE_FIRE_CAT],
    ] as const) {
      expect(masked(mask, id), def.id).toBe(def.clearcastable === true)
    }
  })

  it('the build’s talents: Shred 42, Claw 40, Rake 35; Savage Fury, Predatory Instincts, Rend and Tear on the specials', () => {
    const r = (def: typeof SHRED) => withDruidTalents(def, CAT)
    expect([r(SHRED), r(CLAW), r(RAKE), r(RIP), r(FEROCIOUS_BITE)].map((d) => d.costTenths)).toEqual([420, 400, 350, 300, 350])
    expect(r(SHRED).critMultiplier).toBeCloseTo(2.2, 9)
    expect(r(FEROCIOUS_BITE).critMultiplier).toBeCloseTo(2.2, 9)
    // Rend and Tear 5/5 on the direct damage of Shred, Claw, Rake and Bite; Rip has none.
    expect([r(SHRED), r(CLAW), r(RAKE), r(FEROCIOUS_BITE)].map((d) => d.bleedingTargetPct)).toEqual([10, 10, 10, 10])
    expect(r(RIP).bleedingTargetPct).toBeUndefined()
    // Savage Fury isn't on Bite: its 52–112 is unchanged.
    expect([r(FEROCIOUS_BITE).flatDamage, r(FEROCIOUS_BITE).flatDamageRange]).toEqual([52, 60])
    expect(r(tigersFury(3, true)).critMultiplier).toBe(CRIT_MULTIPLIER.melee)
  })
})

describe('the cat priority list (druid.md §6.2)', () => {
  const clearcasting = 7
  const auraIndex = (id: string) => (id === 'clearcasting' ? clearcasting : -1)
  const ctx = { race: 'horde-tauren', items: [], consumables: [], equipped: new Set([WOLFSHEAD_HELM]), othersBleed: true }
  const names = (rot: ReturnType<typeof catRotation>) => rot.rotation.map((e) => rot.abilities[e.ability].id)

  it('by default: Berserk, Tiger’s Fury, Faerie Fire (twice), a Clearcasting Shred, Rip, Bite at the end, Shred first, Bite, Shred', () => {
    const rot = catRotation({}, CAT, auraIndex, ctx)
    expect(names(rot)).toEqual(['berserk', 'tigersFury', 'faerieFire', 'faerieFire', 'shred', 'claw', 'rip', 'ferociousBite', 'shred', 'claw', 'ferociousBite', 'shred', 'claw'])
    const line = (i: number) => rot.rotation[i].conditions
    // Tiger's Fury at ≤ 100 − 80 + 20 Energy (the default loss allowed).
    expect(line(1)).toEqual([{ code: COND.maxEnergy, a: 400, b: 0 }])
    // The Clearcasting Shred reads the aura.
    expect(line(4)).toEqual([{ code: COND.windowOpen, a: clearcasting, b: 0 }])
    // Rip at 5, when it's off the boss, with 8 s of the fight left.
    expect(line(6)).toEqual([
      { code: COND.minComboPoints, a: 5, b: 0 },
      { code: COND.abilityAuraRefresh, a: rot.rotation[6].ability, b: 0 },
      { code: COND.timeLeftAtLeast, a: 8000, b: 0 },
    ])
    // In the last 4 s, Bite at 5 whatever the Energy, ahead of the Shred first (CL7, D23).
    expect(line(7)).toEqual([
      { code: COND.minComboPoints, a: 5, b: 0 },
      { code: COND.timeLeftAtMost, a: 4000, b: 0 },
    ])
    expect(line(8)).toContainEqual({ code: COND.minEnergy, a: 350, b: 0 })
    // Faerie Fire's early refresh waits until there's no Energy for a Shred (42).
    expect(line(3)).toContainEqual({ code: COND.maxEnergy, a: 419, b: 0 })
    // Claw only when Shred can never be used.
    const shred = rot.abilities.findIndex((a) => a.id === 'shred')
    expect(line(12)).toEqual([{ code: COND.cooldownAtLeast, a: shred, b: 1 }])
    // At 0 there's no end-of-fight line.
    expect(names(catRotation({ 'druid.cat.ferociousBite.anyEnergyLastSec': 0 }, CAT, auraIndex, ctx)).filter((n) => n === 'ferociousBite')).toHaveLength(1)
    expect(rot.prepull.casts).toEqual([])
  })

  it('from the front, Faerie Fire’s early refresh waits for Claw’s Energy (40), since Shred can’t be used there', () => {
    const rot = catRotation({}, CAT, auraIndex, { ...ctx, front: true })
    const early = rot.rotation.filter((e) => rot.abilities[e.ability].id === 'faerieFire')[1]
    expect(early.conditions).toContainEqual({ code: COND.maxEnergy, a: 399, b: 0 })
    // With Claw off too, nothing builds from the front, so there's nothing to wait for: no early refresh.
    const none = catRotation({ 'druid.cat.claw.enabled': false }, CAT, auraIndex, { ...ctx, front: true })
    expect(none.rotation.filter((e) => none.abilities[e.ability].id === 'faerieFire')).toHaveLength(1)
  })

  it('Tiger’s Fury without Wolfshead Helm waits for 100 − 60 + 20', () => {
    const rot = catRotation({}, CAT, auraIndex, { ...ctx, equipped: new Set() })
    const tf = rot.rotation.find((e) => rot.abilities[e.ability].id === 'tigersFury')!
    expect(tf.conditions).toEqual([{ code: COND.maxEnergy, a: 600, b: 0 }])
    expect(rot.abilities[tf.ability].rageTenths).toBe(600)
  })

  it('without the Berserk talent there’s no Berserk; Rake and the Rip setting follow others’ bleeds', () => {
    const noBerserk = new Map(CAT)
    noBerserk.delete('Berserk')
    expect(names(catRotation({}, noBerserk, auraIndex, ctx))).not.toContain('berserk')
    const rake = { 'druid.cat.rake.enabled': true }
    // With a raid's warriors bleeding the boss, Rake "only when nothing else bleeds" has no line.
    expect(names(catRotation(rake, CAT, auraIndex, ctx))).not.toContain('rake')
    const alone = catRotation(rake, CAT, auraIndex, { ...ctx, othersBleed: false })
    const rakeLine = alone.rotation.find((e) => alone.abilities[e.ability].id === 'rake')!
    const rip = alone.abilities.findIndex((a) => a.id === 'rip')
    expect(rakeLine.conditions).toContainEqual({ code: COND.abilityAuraDown, a: rip, b: 0 })
    expect(names(catRotation({ ...rake, 'druid.cat.rake.onlyWithoutBleeds': false }, CAT, auraIndex, ctx))).toContain('rake')
    expect(names(catRotation({ 'druid.cat.rip.onlyWithoutOtherBleeds': true }, CAT, auraIndex, ctx))).not.toContain('rip')
    expect(names(catRotation({ 'druid.cat.rip.onlyWithoutOtherBleeds': true }, CAT, auraIndex, { ...ctx, othersBleed: false }))).toContain('rip')
  })

  it('Bite only while Rip is up: two lines, Rip’s aura or too late for a Rip (after the end-of-fight Bite)', () => {
    const rot = catRotation({ 'druid.cat.ferociousBite.onlyWhileRipUp': true }, CAT, auraIndex, ctx)
    const bites = rot.rotation.filter((e) => rot.abilities[e.ability].id === 'ferociousBite')
    const rip = rot.abilities.findIndex((a) => a.id === 'rip')
    expect(bites.map((e) => e.conditions[1])).toEqual([
      { code: COND.timeLeftAtMost, a: 4000, b: 0 },
      { code: COND.abilityAuraUp, a: rip, b: 0 },
      { code: COND.timeLeftAtMost, a: 8000, b: 0 },
    ])
  })

  it('presses the racial (Night Elf), on-use items, and the potion and Juju Flurry when selected', () => {
    const mcp = ITEM_EFFECTS[9449].use!
    const full = catRotation({}, CAT, auraIndex, { ...ctx, race: 'alliance-night-elf', items: [mcp], consumables: [MIGHTY_RAGE_POTION, JUJU_FLURRY] })
    expect(names(full).slice(0, 6)).toEqual(['berserk', 'elunesLight', 'manualCrowdPummeler', 'tigersFury', 'mightyRagePotion', 'jujuFlurry'])
    expect(full.onUse).toEqual(['manualCrowdPummeler', 'mightyRagePotion', 'jujuFlurry'])
    const potion = full.rotation.find((e) => full.abilities[e.ability].id === 'mightyRagePotion')!
    expect(potion.conditions).toEqual([{ code: COND.abilityAuraUp, a: full.abilities.findIndex((a) => a.id === 'berserk'), b: 0 }])
    expect(full.abilities[potion.ability].usesPerFight).toBe(1)
    expect(full.abilities.find((a) => a.id === 'manualCrowdPummeler')?.usesPerFight).toBe(3)
    expect(onUseCast(mcp).aura?.mods.haste).toBe(50)
  })

  it('keeps Faerie Fire up itself, so the Buffs tab’s adds nothing; not with the setting off', () => {
    expect(catMaintainedBuffs({})).toEqual(['faerieFire'])
    expect(catMaintainedBuffs({ 'druid.cat.faerieFire.enabled': false })).toEqual([])
    expect(names(catRotation({ 'druid.cat.faerieFire.enabled': false }, CAT, auraIndex, ctx))).not.toContain('faerieFire')
  })

  it('every setting has a documented id, and the numbers their units', () => {
    for (const o of CAT_OPTIONS) {
      expect(o.id).toMatch(/^druid\.cat\.[a-zA-Z]+\.[a-zA-Z]+$/)
      if (o.kind === 'number') expect(o.default).toBeGreaterThanOrEqual(o.min)
    }
  })
})
