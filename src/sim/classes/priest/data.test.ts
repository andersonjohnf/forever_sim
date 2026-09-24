// The Shadow Priest's spells and talents against the Forever client data (docs/classes/priest.md;
// docs/data/client.md): every number abilities.ts and talents.ts write out, read back from
// src/data/client/{spells,talents,gametables}.json.
import { describe, expect, it } from 'vitest'
import gametablesJson from '@/data/client/gametables.json'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpell, ClientSpells } from '@/data/client/types'
import { GCD_MS, spellCritMultiplier } from '../../core/formulas'
import type { AbilityDef, SpellDef } from '../../plan/types'
import { CLASS_BASE } from '../../stats/base-stats'
import { atLevel60, spread } from '../paladin/spells'
import {
  DARK_SACRIFICE,
  DARK_SACRIFICE_TICK,
  DEVOURING_PLAGUE,
  INNER_FOCUS,
  INNER_FOCUS_CRIT_PCT,
  MIND_BLAST,
  MIND_FLAY,
  PRIEST_BASE_MANA,
  SHADOW_WORD_PAIN,
  STARSHARDS,
  VAMPIRIC_EMBRACE,
} from './abilities'
import { BERSERKING_CASTER } from '../caster-racials'
import { MEDITATION_SHARE, SHADOW_WEAVING_AURA, SHADOWFORM_COST_PCT, SHADOWFORM_CRIT_BONUS_PCT, SHADOWFORM_DAMAGE_PCT, TALENT_EFFECTS, withTalents } from './talents'

const spells = (spellsJson as unknown as ClientSpells).spells
const spell = (id: number): ClientSpell => {
  const s = spells[String(id)]
  expect(s, `client spell ${id}`).toBeDefined()
  return s
}
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
const mana = (def: AbilityDef) => def.costTenths / 10
const ranks = (r: Record<string, number>) => new Map(Object.entries(r))
/** SpellMisc Attributes[8] 0x200: the periodic-crit flag (docs/mechanics/spells.md §7). */
const periodicCrit = (id: number) => ((spell(id).misc!.attributes![8] ?? 0) & 0x200) !== 0
/** SpellMisc Attributes[1] 0x4: channeled. */
const channeled = (id: number) => ((spell(id).misc!.attributes![1] ?? 0) & 0x4) !== 0
const SHADOW = 32
const ARCANE = 64
/** Whether an effect's class mask (all four words) selects a spell's (SpellClassOptions). */
const selects = (id: number, index: number, target: number) => {
  const mask = effect(id, index).effectSpellClassMask!
  const own = spell(target).classOptions!.spellClassMask!
  return mask.some((w, i) => ((w >>> 0) & (own[i] >>> 0)) !== 0)
}

/** The Forever client's rank curve of a priest talent's effect (TraitDefinitionEffectPoints). */
const curve = (name: string, effectIndex = 0): number[] => {
  const t = (talentsJson as unknown as { classes: { priest: { talents: { name: string; rankEffects: { effectIndex: number; values: number[] }[] }[] } } }).classes.priest.talents.find(
    (x) => x.name === name,
  )
  expect(t, name).toBeDefined()
  const e = t!.rankEffects.find((r) => r.effectIndex === effectIndex)
  expect(e, `${name} #${effectIndex}`).toBeDefined()
  return e!.values
}

const SWP = 10894
const MB = 10947
const MF = 18807
const DP = 19280
const SF = 15473

/** A DoT spell def against its client row: school, the tick, period, count, coefficient and the crit flag. */
function dotMatches(def: SpellDef, id: number, school: number) {
  const s = spell(id)
  expect(s.misc!.schoolMask, def.id).toBe(school)
  expect(s.categories!.defenseType, def.id).toBe(1)
  const e = effect(id, 0)
  expect(e.effectAura, def.id).toBe(id === DP ? 53 : 3)
  expect(e.effectBasePointsF, def.id).toBe(def.dotTickDamage)
  expect(e.effectAuraPeriod, def.id).toBe(def.dotTickMs)
  expect(e.effectBonusCoefficient, def.id).toBe(def.dotSpCoefficient)
  expect(s.duration!.duration! / def.dotTickMs!, def.id).toBe(def.dotTicks)
  expect(periodicCrit(id), def.id).toBe(def.dotCanCrit === true)
}

describe('the priest’s spells against the client (priest.md §3)', () => {
  it('Shadow Word: Pain r8: 127 every 3 s for 18 s, 0.2 a tick, the crit flag, 470 mana, the GCD; pure damage', () => {
    dotMatches(SHADOW_WORD_PAIN.spellDef!, SWP, SHADOW)
    expect(spell(SWP).effects).toHaveLength(1)
    expect(SHADOW_WORD_PAIN.spellDef!.binary).toBeUndefined()
    expect(spell(SWP).power![0].manaCost).toBe(mana(SHADOW_WORD_PAIN))
    expect(spell(SWP).cooldowns!.startRecoveryTime).toBe(SHADOW_WORD_PAIN.gcdMs)
    expect(SHADOW_WORD_PAIN.aura!.durationMs).toBe(spell(SWP).duration!.duration)
  })

  it('Mind Blast r9: 485, variance 0.054, +2.6 a level from 58 to 63, 0.429; 350 mana, a 1.5 s cast, 8 s (category 19)', () => {
    const def = MIND_BLAST.spellDef!
    const e = effect(MB, 0)
    const l = spell(MB).levels!
    const grow = atLevel60(0, e.effectRealPointsPerLevel!, l.baseLevel!, l.maxLevel!)
    const [lo, hi] = spread(e.effectBasePointsF!, e.variance!)
    expect(def.min).toBeCloseTo(lo + grow, 9)
    expect(def.max).toBeCloseTo(hi + grow, 9)
    expect([Math.round(def.min), Math.round(def.max)]).toEqual([477, 503])
    expect(e.effectBonusCoefficient).toBe(def.spCoefficient)
    expect(spell(MB).misc!.schoolMask).toBe(SHADOW)
    expect(spell(MB).power![0].manaCost).toBe(mana(MIND_BLAST))
    expect(spell(MB).castTime!.base).toBe(MIND_BLAST.castMs)
    expect(spell(MB).cooldowns!.categoryRecoveryTime).toBe(MIND_BLAST.cooldownMs)
    expect(MIND_BLAST.castHasted).toBe(true)
  })

  it('Mind Flay r6: a channel, 130 a second for 3 s, 0.167, the crit flag and a slow (binary); 205 mana', () => {
    dotMatches(MIND_FLAY.spellDef!, MF, SHADOW)
    expect(channeled(MF)).toBe(true)
    expect(effect(MF, 1).effectAura).toBe(33)
    expect(MIND_FLAY.spellDef!.binary).toBe(true)
    expect(MIND_FLAY.kind).toBe('channel')
    expect(spell(MF).power![0].manaCost).toBe(mana(MIND_FLAY))
  })

  it('Devouring Plague r6: 106 every 3 s for 24 s, 0.1, no crit flag, 985 mana, a 1 min cooldown', () => {
    dotMatches(DEVOURING_PLAGUE.spellDef!, DP, SHADOW)
    expect(spell(DP).power![0].manaCost).toBe(mana(DEVOURING_PLAGUE))
    expect(spell(DP).cooldowns!.categoryRecoveryTime).toBe(DEVOURING_PLAGUE.cooldownMs)
  })

  it('Starshards r7: a channel, 300 Arcane a second for 6 s, 0.167, the crit flag, 350 mana, 30 s', () => {
    dotMatches(STARSHARDS.spellDef!, 19305, ARCANE)
    expect(channeled(19305)).toBe(true)
    expect(spell(19305).power![0].manaCost).toBe(mana(STARSHARDS))
    expect(spell(19305).cooldowns!.categoryRecoveryTime).toBe(STARSHARDS.cooldownMs)
  })

  it('Inner Focus: one charge, −100% cost and +25% crit, 3 min, off the GCD', () => {
    const s = spell(14751)
    expect(s.auraOptions!.procCharges).toBe(1)
    expect(effect(14751, 0)).toMatchObject({ effectAura: 108, effectBasePointsF: -100 })
    expect(effect(14751, 1)).toMatchObject({ effectAura: 107, effectBasePointsF: INNER_FOCUS_CRIT_PCT })
    expect(s.cooldowns!.recoveryTime).toBe(INNER_FOCUS.cooldownMs)
    expect(s.cooldowns!.startRecoveryTime ?? 0).toBe(INNER_FOCUS.gcdMs)
    // Its cost cut and crit cover the spells the sim casts.
    for (const id of [SWP, MB, MF, DP]) expect(selects(14751, 0, id), String(id)).toBe(true)
  })

  it('Vampiric Embrace: 40 mana, 1 min, 30 s on the boss; Dark Sacrifice: 320 mana every 3 s for 15 s, 10 min', () => {
    expect(spell(15286).power![0].manaCost).toBe(mana(VAMPIRIC_EMBRACE))
    expect(spell(15286).cooldowns!.recoveryTime).toBe(VAMPIRIC_EMBRACE.cooldownMs)
    expect(spell(15286).duration!.duration).toBe(VAMPIRIC_EMBRACE.aura!.durationMs)
    const ds = effect(1277328, 1)
    expect(ds).toMatchObject({ effectAura: 24, effectAuraPeriod: DARK_SACRIFICE.rageTickMs })
    expect(DARK_SACRIFICE_TICK).toBe(ds.effectBasePointsF)
    expect(spell(1277328).duration!.duration! / ds.effectAuraPeriod!).toBe(DARK_SACRIFICE.rageTicks)
    expect(spell(1277328).cooldowns!.categoryRecoveryTime).toBe(DARK_SACRIFICE.cooldownMs)
    expect(DARK_SACRIFICE.gcdMs).toBe(GCD_MS)
  })

  it('Berserking in Forever: +10% attack speed (319) and casting speed (65) for 10 s', () => {
    const auras = spell(20554).effects.map((e) => [e.effectAura, e.effectBasePointsF])
    expect(auras).toEqual(expect.arrayContaining([
      [65, 10],
      [319, 10],
    ]))
    expect(BERSERKING_CASTER.aura!.mods).toEqual({ haste: 10, castHaste: 10 })
  })
})

describe('Shadowform and the talents against the client (priest.md §3.6, §4)', () => {
  it('Shadowform: +10% Shadow (79), −50% Shadow cost (72), +100% crit bonus (108 mod 15) on the four spells', () => {
    expect(effect(SF, 1)).toMatchObject({ effectAura: 79, effectBasePointsF: SHADOWFORM_DAMAGE_PCT })
    expect(effect(SF, 1).effectMiscValue![0]).toBe(SHADOW)
    expect(effect(SF, 3)).toMatchObject({ effectAura: 72, effectBasePointsF: -SHADOWFORM_COST_PCT })
    expect(effect(SF, 4)).toMatchObject({ effectAura: 108, effectBasePointsF: SHADOWFORM_CRIT_BONUS_PCT })
    expect(effect(SF, 4).effectMiscValue![0]).toBe(15)
    for (const id of [SWP, MB, MF, DP]) expect(selects(SF, 4, id), String(id)).toBe(true)
    expect(spellCritMultiplier(SHADOWFORM_CRIT_BONUS_PCT)).toBe(2)
  })

  it('Shadow Weaving: 33 / 67 / 100%, +2% Shadow taken from the caster (270) a stack, 5, 15 s', () => {
    expect(curve('Shadow Weaving')).toEqual([33, 67, 100])
    expect(effect(15258, 0)).toMatchObject({ effectAura: 270, effectBasePointsF: SHADOW_WEAVING_AURA.mods.schoolTaken })
    expect(spell(15258).auraOptions!.cumulativeAura).toBe(SHADOW_WEAVING_AURA.maxStacks)
    expect(spell(15258).duration!.duration).toBe(SHADOW_WEAVING_AURA.durationMs)
    expect(TALENT_EFFECTS['Shadow Weaving'](3)[0]).toMatchObject({ kind: 'proc', proc: { trigger: 'spellLanded', schools: ['shadow'], chance: { pct: 100 } } })
  })

  it('the passives’ curves: Darkness 2% a rank, Mental Strength 3%, Meditation 17 / 33 / 50%', () => {
    expect(curve('Darkness')).toEqual([2, 4, 6, 8, 10])
    expect(TALENT_EFFECTS.Darkness(5)).toEqual([{ kind: 'schoolDamage', schools: ['shadow'], pct: 10 }])
    expect(curve('Mental Strength')).toEqual([3, 6, 9, 12, 15])
    expect(TALENT_EFFECTS['Mental Strength'](5)).toEqual([{ kind: 'mult', stat: 'int', pct: 15 }])
    expect(curve('Meditation').map((v) => v / 100)).toEqual(MEDITATION_SHARE.slice(1))
  })

  it('the rows’ talents: Shadow Focus, Improved Shadow Word: Pain, Improved Mind Blast, Improved Mind Flay, Twin Disciplines, the cost cuts', () => {
    expect(curve('Shadow Focus')).toEqual([1, 2, 3, 4, 5])
    expect(curve('Improved Shadow Word: Pain')).toEqual([3000, 6000])
    expect(curve('Improved Mind Blast')).toEqual([-500, -1000, -1500, -2000, -2500])
    expect(curve('Improved Mind Flay')).toEqual([10, 20])
    expect(curve('Twin Disciplines', 1)).toEqual([1, 2, 3, 4, 5])
    expect(curve('Mental Agility')).toEqual([-3, -7, -10])
    expect(curve('Devouring Contagion')).toEqual([-25, -50])
    // Twin Disciplines #1 (spell mod 22, periodic) selects Shadow Word: Pain and Devouring Plague, not Mind Flay.
    expect([selects(1225132, 1, SWP), selects(1225132, 1, DP), selects(1225132, 1, MF)]).toEqual([true, true, false])
    // Mental Agility covers Shadow Word: Pain, Devouring Plague and Vampiric Embrace, not Mind Blast,
    // Mind Flay or Starshards; so Starshards keeps its full cost with it.
    expect([SWP, DP, 15286, MB, MF, 19305].map((id) => selects(14520, 0, id))).toEqual([true, true, true, false, false, false])
    expect(mana(withTalents(STARSHARDS, ranks({ 'Mental Agility': 3 })))).toBe(mana(STARSHARDS))
    const t = ranks({ 'Shadow Focus': 5, 'Improved Shadow Word: Pain': 2, 'Improved Mind Blast': 5, 'Improved Mind Flay': 2, 'Twin Disciplines': 5, 'Mental Agility': 3, 'Devouring Contagion': 2 })
    expect(withTalents(SHADOW_WORD_PAIN, t).spellDef).toMatchObject({ dotTicks: 8, damageMult: 1.05 })
    expect(withTalents(SHADOW_WORD_PAIN, t).aura!.durationMs).toBe(24000)
    expect(withTalents(MIND_BLAST, t).cooldownMs).toBe(5500)
    expect(withTalents(MIND_FLAY, t).spellDef!.damageMult).toBeCloseTo(1.2, 12)
    expect(mana(withTalents(DEVOURING_PLAGUE, t))).toBe(394)
    expect(mana(withTalents(SHADOW_WORD_PAIN, t))).toBe(423)
    expect(TALENT_EFFECTS['Shadow Focus'](5)).toEqual([{ kind: 'schoolHit', schools: ['shadow'], pct: 5 }])
  })

  it('base mana 1,376 and 0.0168% spell crit per Intellect (PlayerExpectedStat)', () => {
    const p = (gametablesJson as unknown as { playerExpectedStat: { level60: Record<string, { baseMana: number; spellCritPerIntellect: number; critPerAgility: number }> } }).playerExpectedStat.level60.priest
    expect(p.baseMana).toBe(PRIEST_BASE_MANA)
    expect(CLASS_BASE.priest.baseMana).toBe(PRIEST_BASE_MANA)
    expect(CLASS_BASE.priest.spellCritPerInt).toBeCloseTo(100 * p.spellCritPerIntellect, 12)
    expect(CLASS_BASE.priest.critPerAgi).toBeCloseTo(100 * p.critPerAgility, 12)
  })
})
