// The warrior ability rows (strikes, Rend's bleed, Overpower and its window, and the cooldowns and
// racial cooldowns as casts), stance swaps and talent modifiers against the Forever client data,
// the cost tables and worked examples (W10, W11, W13, W18, W19, W20, W21; rage.md R16, R17), and
// the Fury priority list built from its settings (docs/classes/warrior.md §2.1, §2.3, §2.5, §2.8,
// §2.9, §3.1, §3.2, §4.1, §5.2; docs/data/client.md).
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpells, ClientTalents } from '@/data/client/types'
import { TALENT_DATA } from '../../defaults'
import { COND, STANCE, STANCE_ANY, weaponPercentVs } from '../../plan/types'
import { CLASSIC_ERA, FOREVER } from '../../rules/profiles'
import type { CreatureType } from '../../types'
import { talentRanksByName } from '../index'
import { BUFFS_BY_ID, JUJU_FLURRY, MIGHTY_RAGE_POTION } from '../../effects/buffs'
import { ITEM_EFFECTS } from '../../effects/items'
import { catalogueEffects } from '../../effects/types'
import {
  type AbilityDef,
  BATTLE_SHOUT,
  BATTLE_SHOUT_CLASSIC_ERA,
  battleShout,
  BERSERKER_RAGE,
  BERSERKING,
  BLOOD_FURY,
  BLOODRAGE,
  BLOODTHIRST,
  BLOODTHRILL_PCT_PER_RANK,
  BLOODTHRILL_WINDOW_MS,
  CHARGE_RAGE_TENTHS,
  DEATH_WISH,
  ELUNES_LIGHT,
  EXECUTE,
  executeBreakEvenAp,
  executeDamage,
  HAMSTRING,
  HEROIC_STRIKE,
  IMPROVED_CHARGE_TENTHS_PER_RANK,
  MORTAL_STRIKE,
  onUseAbility,
  OVERPOWER,
  OVERPOWER_WINDOW,
  overpowerWindowProcs,
  RACIAL_COOLDOWNS,
  RECKLESSNESS,
  RECKLESSNESS_CLASSIC_ERA,
  recklessness,
  REND,
  SLAM,
  SPEARING_STRIKE,
  STANCE_SWAP_COOLDOWN_MS,
  stanceSwapKeepTenths,
  WHIRLWIND,
} from './abilities'
import { FURY_OPTIONS, FURY_RENAMED_OPTIONS, furyMaintainedBuffs, furyRotation, PREPULL_BLOODRAGE_MS, PREPULL_SHOUT_MS } from './fury'
import {
  abilityCritMultiplier,
  costReduction,
  FOCUSED_RAGE,
  IMPALE,
  IMPROVED_OVERPOWER_CRIT_PER_RANK,
  IMPROVED_REND_PCT,
  IMPROVED_SLAM_MS_PER_RANK,
  rageCost,
  withTalents,
} from './modifiers'

const spells = (spellsJson as unknown as ClientSpells).spells
const clientTalents = (talentsJson as unknown as ClientTalents).classes.warrior.talents

/** SpellEffectName codes (docs/data/client.md, src/data/client/types.ts). */
const EFFECT = { schoolDamage: 2, dummy: 3, weaponDamageNoSchool: 17, weaponPercent: 31, weaponDamage: 58, normalized: 121 }
const WEAPON_EFFECTS = [EFFECT.weaponDamageNoSchool, EFFECT.weaponPercent, EFFECT.weaponDamage, EFFECT.normalized]
const RAGE = 1
/** `ShapeshiftMask` bits: 1 << (form − 1) for Battle (17), Defensive (18) and Berserker (19) Stance. */
const FORM = { battle: 1 << 16, defensive: 1 << 17, berserker: 1 << 18 }
/** `TargetAuraState` 2: the target is at or below 20% health (the execute phase). */
const HEALTH_20 = 2

/** Every warrior ability the talent lists name, with its max-rank spell id (warrior.md §3.1, §3.2). */
const SPELL_ID: Record<string, number> = {
  heroicStrike: 25286,
  cleave: 20569,
  bloodthirst: 23894,
  mortalStrike: 21553,
  whirlwind: 1680,
  slam: 11605,
  execute: 20662,
  overpower: 11585,
  hamstring: 7373,
  rend: 11574,
  spearingStrike: 1310222,
  thunderClap: 11581,
  revenge: 25288,
  shieldSlam: 23925,
  victoryRush: 402927,
  battleShout: 25289,
  demoralizingShout: 11556,
  sunderArmor: 11597,
  bloodrage: 2687,
  berserkerRage: 18499,
  deathWish: 12328,
  sweepingStrikes: 12292,
  shieldBlock: 2565,
  pummel: 6554,
  shieldBash: 1672,
  intercept: 20617,
  mockingBlow: 20560,
  disarm: 676,
  concussionBlow: 12809,
  challengingShout: 1161,
  intimidatingShout: 5246,
  piercingHowl: 12323,
  recklessness: 1719,
}
/** Talent spells whose effect carries a class mask: Impale, Focused Rage, Improved Heroic Strike, Improved Execute. */
const TALENT_MASK = {
  impale: spells['16493'].effects[0].effectSpellClassMask!,
  focusedRage: spells['29787'].effects[0].effectSpellClassMask!,
  improvedHeroicStrike: spells['12282'].effects[0].effectSpellClassMask!,
  improvedExecute: spells['20502'].effects[0].effectSpellClassMask!,
}
/** Whether a talent's class mask covers an ability (any shared bit; both are warrior spells, class set 4). */
const inMask = (id: string, mask: number[]) => {
  const own = spells[String(SPELL_ID[id])].classOptions?.spellClassMask ?? []
  return own.some((word, i) => (word & (mask[i] ?? 0)) !== 0)
}
/** Base rage cost of an ability from the client data, in rage. */
const baseCost = (id: string) => (spells[String(SPELL_ID[id])].power?.find((p) => (p.powerType ?? 0) === RAGE)?.manaCost ?? 0) / 10

const ABILITIES: AbilityDef[] = [BLOODTHIRST, WHIRLWIND, HEROIC_STRIKE, HAMSTRING, EXECUTE]
/** The Arms strikes (warrior.md §3.1); Rend, a bleed, is checked on its own. */
const ARMS_STRIKES: AbilityDef[] = [MORTAL_STRIKE, SLAM, SPEARING_STRIKE]
/** `EquippedItemSubclass` bits of the two-handed melee weapons: axe 1, mace 5, polearm 6, sword 8, staff 10. */
const TWO_HANDED = (1 << 1) | (1 << 5) | (1 << 6) | (1 << 8) | (1 << 10)
/** SpellMisc Attributes[8] 0x200: the periodic-crit flag (damage-and-timing §4). */
const PERIODIC_CAN_CRIT = 0x200
/** SpellAuraName 3: periodic damage; 107/108: flat and percent spell modifiers (misc 10 cast time, 21 GCD, 22 periodic damage). */
const PERIODIC_DAMAGE = 3

describe('warrior abilities match src/data/client/spells.json', () => {
  for (const ability of [...ABILITIES, ...ARMS_STRIKES, OVERPOWER]) {
    const id = SPELL_ID[ability.id]
    it(`${ability.name} (${id})`, () => {
      const spell = spells[String(id)]
      expect(spell.name).toBe(ability.name)
      const power = spell.power?.find((p) => (p.powerType ?? 0) === RAGE)
      expect(power?.manaCost, 'rage cost in tenths').toBe(ability.costTenths)
      expect(spell.cooldowns?.categoryRecoveryTime ?? spell.cooldowns?.recoveryTime ?? 0, 'cooldown').toBe(ability.cooldownMs)
      expect(spell.cooldowns?.startRecoveryTime ?? 0, 'GCD').toBe(ability.gcdMs)
      expect(spell.categories?.defenseType, 'melee defense type').toBe(2)
      // warrior.md §3.1 "Stance": no shapeshift mask means any stance.
      const forms = spell.shapeshift?.shapeshiftMask?.[0] ?? 0
      const stances = forms === 0 ? STANCE_ANY : (forms & FORM.battle ? STANCE.battle : 0) | (forms & FORM.defensive ? STANCE.defensive : 0) | (forms & FORM.berserker ? STANCE.berserker : 0)
      expect(ability.stances, 'stances').toBe(stances)
      expect(ability.executePhaseOnly, 'only at ≤ 20% health').toBe(spell.auraRestrictions?.targetAuraState === HEALTH_20)
      const weapon = spell.effects.find((e) => WEAPON_EFFECTS.includes(e.effect))
      expect(ability.weaponPercent > 0, 'weapon-based').toBe(weapon !== undefined)
      expect(ability.normalized, 'normalized (effect 121)').toBe(weapon?.effect === EFFECT.normalized)
      // Effect 31 WEAPON_PERCENT_DAMAGE scales the weapon damage (Spearing Strike's 40%).
      const percent = spell.effects.find((e) => e.effect === EFFECT.weaponPercent)
      if (weapon) expect(ability.weaponPercent, 'weapon %').toBe(percent ? percent.effectBasePointsF! / 100 : 1)
      expect(ability.castMs, 'cast time').toBe(spell.castTime?.base ?? 0)
      const subclass = spell.equippedItems?.equippedItemSubclass ?? 0
      expect(ability.twoHandOnly, 'two-handers only').toBe(subclass !== 0 && (subclass & ~TWO_HANDED) === 0)
      const dummy = spell.effects.find((e) => e.effect === EFFECT.dummy)
      if (weapon) {
        expect(ability.flatDamage, 'weapon damage bonus').toBe(weapon.effectBasePointsF ?? 0)
      } else if (ability.damagePerExtraRage > 0) {
        // Execute: the DUMMY effect is its base damage, and its `effectChainAmplitude` × 10 the
        // damage per extra rage, as the tooltip's `$*10;F1` shows it (warrior.md §3.1).
        expect(ability.flatDamage, 'Execute base damage').toBe(dummy?.effectBasePointsF)
        expect(ability.damagePerExtraRage, 'damage per extra rage').toBe((dummy?.effectChainAmplitude ?? 0) * 10)
        expect(ability.apCoefficient).toBe(0)
      } else {
        const damage = spell.effects.find((e) => e.effect === EFFECT.schoolDamage)
        expect(ability.flatDamage, 'school damage').toBe(damage?.effectBasePointsF)
        // Forever puts AP scaling in a DUMMY effect (docs/data/client.md "AP coefficients").
        expect(ability.apCoefficient, 'AP coefficient').toBeCloseTo((dummy?.effectBasePointsF ?? 0) / 100, 12)
      }
    })
  }

  it('on-next-swing abilities have no GCD; the rest use the 1.5 s GCD (warrior.md §2.2)', () => {
    expect(HEROIC_STRIKE.kind).toBe('onNextSwing')
    expect(HEROIC_STRIKE.gcdMs).toBe(0)
    for (const a of [BLOODTHIRST, WHIRLWIND, HAMSTRING, EXECUTE]) expect(a.gcdMs).toBe(1500)
  })

  it('Execute is a two-roll melee spell, like Bloodthirst (combat-tables §3)', () => {
    expect([BLOODTHIRST.kind, EXECUTE.kind]).toEqual(['meleeSpell', 'meleeSpell'])
    expect([WHIRLWIND.kind, HAMSTRING.kind]).toEqual(['weaponStrike', 'weaponStrike'])
  })

  it('refunds 80% on a miss, dodge or parry except Whirlwind and Execute (rage.md#rage-refunds-on-avoided-abilities)', () => {
    expect([BLOODTHIRST, WHIRLWIND, HEROIC_STRIKE, HAMSTRING, EXECUTE].map((a) => a.refundShare)).toEqual([0.8, 0, 0.8, 0.8, 0])
    expect([MORTAL_STRIKE, SLAM, SPEARING_STRIKE, REND].map((a) => a.refundShare)).toEqual([0.8, 0.8, 0.8, 0.8])
  })

  it('Mortal Strike, Slam and Spearing Strike are one-roll strikes (combat-tables §3); only Slam has a cast, stopping swings until Improved Slam', () => {
    expect(ARMS_STRIKES.map((a) => [a.kind, a.castMs, a.castStopsSwings, a.twoHandOnly])).toEqual([
      ['weaponStrike', 0, false, false],
      ['weaponStrike', 1500, true, false],
      ['weaponStrike', 0, false, true],
    ])
  })

  it('Slam’s Improved Slam version (1310200) has the same cost, cooldown, cast, GCD and damage (warrior.md Q19)', () => {
    const [plain, improved] = [spells['11605'], spells['1310200']]
    expect(improved.name).toBe('Slam')
    expect(improved.power).toEqual(plain.power)
    expect(improved.cooldowns).toEqual(plain.cooldowns)
    expect(improved.castTime).toEqual(plain.castTime)
    expect(improved.effects).toEqual(plain.effects)
    expect(improved.classOptions?.spellClassMask).toEqual(plain.classOptions?.spellClassMask)
  })

  it('Rend (11574): 21 every 3 s for 21 s, 7 ticks and 147 in all, with the periodic-crit flag (warrior.md §3.1, W13)', () => {
    const spell = spells['11574']
    expect(spell.name).toBe('Rend')
    expect(REND.kind).toBe('bleed')
    expect(spell.power?.find((p) => (p.powerType ?? 0) === RAGE)?.manaCost).toBe(REND.costTenths)
    expect(spell.cooldowns?.categoryRecoveryTime ?? spell.cooldowns?.recoveryTime ?? 0).toBe(REND.cooldownMs)
    expect(spell.cooldowns?.startRecoveryTime).toBe(REND.gcdMs)
    expect(spell.categories?.defenseType).toBe(2)
    expect(spell.shapeshift?.shapeshiftMask?.[0]).toBe(FORM.battle | FORM.defensive)
    expect(REND.stances).toBe(STANCE.battle | STANCE.defensive)
    const bleed = spell.effects.find((e) => e.effect === APPLY_AURA && e.effectAura === PERIODIC_DAMAGE)!
    expect(REND.dotTickDamage).toBe(bleed.effectBasePointsF)
    expect(REND.dotTickMs).toBe(bleed.effectAuraPeriod)
    expect(REND.dotTicks).toBe(spell.duration!.duration! / bleed.effectAuraPeriod!)
    expect(REND.dotTicks * REND.dotTickDamage).toBe(147)
    // The marker on the target lasts as long as the bleed.
    expect(REND.aura).toEqual({ id: 'rend', name: 'Rend', durationMs: spell.duration!.duration, mods: {} })
    expect(REND.periodicCanCrit).toBe((spell.misc!.attributes![8] & PERIODIC_CAN_CRIT) !== 0)
    expect(REND.weaponPercent).toBe(0)
  })
})

describe('Overpower, its window and Bloodthrill (warrior.md §2.8, §3.1, §4.1)', () => {
  it('Overpower (11585) is a Battle Stance strike for 5 rage and a point of the window (power type 4), unavoidable, refunding 80%, threat × 0.75', () => {
    const spell = spells['11585']
    expect(spell.power).toEqual([
      { manaCost: OVERPOWER.costTenths, powerType: RAGE },
      { manaCost: 1, optionalCost: 4, powerType: 4 },
    ])
    expect(OVERPOWER.stances).toBe(STANCE.battle)
    expect([OVERPOWER.kind, OVERPOWER.unavoidable, OVERPOWER.refundShare, OVERPOWER.threatMult, OVERPOWER.threatBonus]).toEqual(['weaponStrike', true, 0.8, 0.75, 0])
    expect(OVERPOWER.window).toBe(OVERPOWER_WINDOW)
    // Every other strike can be dodged, parried and blocked.
    for (const a of [...ABILITIES, ...ARMS_STRIKES, REND]) expect(a.unavoidable, a.id).toBe(false)
  })

  it('the window (1282733) lasts 5 s; the client stacks it to 3, the sim keeps one (Q10)', () => {
    const spell = spells['1282733']
    expect(spell.name).toBe('Overpower')
    expect(spell.duration?.duration).toBe(OVERPOWER_WINDOW.durationMs)
    expect(spell.auraOptions?.cumulativeAura).toBe(3)
    expect(OVERPOWER_WINDOW.maxStacks ?? 1).toBe(1)
    // It energizes the point of power type 4 that Overpower spends.
    expect(spell.effects.find((e) => e.effect === ENERGIZE)?.effectMiscValue?.[0]).toBe(4)
  })

  it('Improved Overpower adds 25% crit per rank (12290: aura 107, misc 7); Focused Rage takes 1 rage per rank off it', () => {
    const talent = spells['12290']
    expect([talent.effects[0].effectAura, talent.effects[0].effectMiscValue?.[0]]).toEqual([107, 7])
    expect(clientTalents.find((c) => c.name === 'Improved Overpower')!.rankEffects).toMatchObject([
      { effectIndex: 0, values: [IMPROVED_OVERPOWER_CRIT_PER_RANK, 2 * IMPROVED_OVERPOWER_CRIT_PER_RANK] },
    ])
    expect(inMask('overpower', talent.effects[0].effectSpellClassMask!)).toBe(true)
    expect([0, 1, 2].map((r) => withTalents(OVERPOWER, new Map([['Improved Overpower', r]])).bonusCrit)).toEqual([0, 25, 50])
    expect(withTalents(OVERPOWER, new Map([['Focused Rage', 3], ['Impale', 2]]))).toMatchObject({ costTenths: 20, critMultiplier: 2.2 })
  })

  it('opens on any dodge for 5 s; Bloodthrill (1289682, proc mask 4: auto attacks) at 2% per rank for 6 s with your Rend up', () => {
    const talent = spells['1289682']
    expect(talent.auraOptions?.procTypeMask?.[0]).toBe(4)
    expect(clientTalents.find((c) => c.name === 'Bloodthrill')!.rankEffects[0].values).toEqual([1, 2, 3, 4, 5].map((r) => BLOODTHRILL_PCT_PER_RANK * r))
    expect(overpowerWindowProcs(new Map())).toEqual([
      expect.objectContaining({ trigger: 'targetDodge', from: 'any', chance: { pct: 100 }, action: { kind: 'aura', aura: OVERPOWER_WINDOW } }),
    ])
    const [, bloodthrill] = overpowerWindowProcs(new Map([['Bloodthrill', 5]]))
    expect(bloodthrill).toMatchObject({
      trigger: 'whiteLanded',
      chance: { pct: 10 },
      action: { kind: 'aura', aura: OVERPOWER_WINDOW, durationMs: BLOODTHRILL_WINDOW_MS },
      requiresAura: REND.aura!.id,
    })
    expect(BLOODTHRILL_WINDOW_MS).toBe(6000)
  })
})

describe('stance swaps (warrior.md §2.1, W18; rage.md#stance-changes-and-tactical-mastery R16, R17)', () => {
  it('share a 1 s cooldown, off the GCD (category 47)', () => {
    for (const id of ['2457', '71', '2458']) {
      expect(spells[id].cooldowns).toEqual({ categoryRecoveryTime: STANCE_SWAP_COOLDOWN_MS })
      expect(spells[id].categories?.category).toBe(47)
    }
  })

  it('keep 10 + 3 per Improved Tactical Mastery rank in `forever` (1310185 keeps 10; 12295’s curve 3–15), 5 per rank in `classicEra`', () => {
    expect(spells['1310185'].effects[0].effectBasePointsF).toBe(10)
    expect(clientTalents.find((c) => c.name === 'Improved Tactical Mastery')!.rankEffects[0].values).toEqual([3, 6, 9, 12, 15])
    const keep = (profile: typeof FOREVER) => [0, 1, 2, 3, 4, 5].map((r) => stanceSwapKeepTenths(new Map([['Improved Tactical Mastery', r]]), profile))
    expect(keep(FOREVER)).toEqual([100, 130, 160, 190, 220, 250])
    expect(keep(CLASSIC_ERA)).toEqual([0, 50, 100, 150, 200, 250])
    // W18: 60 rage keeps 25 at 5/5 and 10 at 0/5 (Classic 0/5 kept 0); R16: 3/5 keeps 19; R17: Classic 5/5 keeps 25.
    expect(Math.min(600, keep(FOREVER)[5])).toBe(250)
    expect(Math.min(600, keep(FOREVER)[0])).toBe(100)
    expect(Math.min(600, keep(CLASSIC_ERA)[0])).toBe(0)
    expect(Math.min(180, keep(FOREVER)[5])).toBe(180)
    expect(Math.min(600, keep(FOREVER)[3])).toBe(190)
    expect(Math.min(600, keep(CLASSIC_ERA)[5])).toBe(250)
  })
})

describe('Arms talents on the abilities (warrior.md §4.1)', () => {
  const t = (entries: [string, number][]) => new Map(entries)
  const curve = (name: string) => clientTalents.find((c) => c.name === name)!.rankEffects

  it('W13: Improved Rend multiplies Rend’s ticks by its 1.12 / 1.23 / 1.35 table: 3/3 is 28.35 a tick, 198.45 over 21 s', () => {
    expect(curve('Improved Rend')).toMatchObject([{ effectIndex: 0, values: IMPROVED_REND_PCT.slice(1) }])
    const ticks = [0, 1, 2, 3].map((r) => withTalents(REND, t([['Improved Rend', r]])).dotTickDamage)
    expect(ticks[0]).toBe(21)
    expect(ticks[1]).toBeCloseTo(23.52, 12)
    expect(ticks[2]).toBeCloseTo(25.83, 12)
    expect(ticks[3]).toBeCloseTo(28.35, 12)
    expect(ticks[3] * REND.dotTicks).toBeCloseTo(198.45, 12)
  })

  it('W4: Improved Slam takes 0.25 s per rank off Slam’s cast and GCD, and any rank leaves the swing timers alone', () => {
    // Effect 0 lowers the cast time (aura 107, misc 10), effect 1 the GCD (misc 21), −250 per rank.
    const spell = spells['12862']
    expect(spell.effects.slice(0, 2).map((e) => [e.effectAura, e.effectMiscValue?.[0]])).toEqual([
      [107, 10],
      [107, 21],
    ])
    const ms = [1, 2].map((r) => -IMPROVED_SLAM_MS_PER_RANK * r)
    expect(curve('Improved Slam')).toMatchObject([
      { effectIndex: 0, values: ms },
      { effectIndex: 1, values: ms },
    ])
    // Its ranks replace Slam with 1310196–1310200 (Q19).
    expect(spell.effects.slice(2).map((e) => e.effectBasePointsF)).toEqual([1310196, 1310197, 1310198, 1310199, 1310200])
    const slam = [0, 1, 2].map((r) => withTalents(SLAM, t([['Improved Slam', r]])))
    expect(slam.map((a) => [a.castMs, a.gcdMs, a.castStopsSwings])).toEqual([
      [1500, 1500, true],
      [1250, 1250, false],
      [1000, 1000, false],
    ])
  })

  it('Focused Rage takes 1 rage per rank off each, and Impale 2/2 makes their crits ×2.2, Rend’s tick crits included', () => {
    const talents = t([
      ['Focused Rage', 3],
      ['Impale', 2],
    ])
    const resolved = [MORTAL_STRIKE, SLAM, SPEARING_STRIKE, REND].map((a) => withTalents(a, talents))
    expect(resolved.map((a) => [a.id, a.costTenths, a.critMultiplier])).toEqual([
      ['mortalStrike', 270, 2.2],
      ['slam', 120, 2.2],
      ['spearingStrike', 120, 2.2],
      ['rend', 70, 2.2],
    ])
  })

  it('W6: Spearing Strike deals 0.40 of normalized weapon damage, 1.20 against Giants and Dragonkin (Q13)', () => {
    const types: CreatureType[] = ['none', 'beast', 'demon', 'dragonkin', 'elemental', 'giant', 'humanoid', 'mechanical', 'undead']
    expect(types.map((c) => weaponPercentVs(SPEARING_STRIKE, c))).toEqual([0.4, 0.4, 0.4, 1.2, 0.4, 1.2, 0.4, 0.4, 0.4])
    // Other abilities have one weapon share.
    expect(weaponPercentVs(MORTAL_STRIKE, 'giant')).toBe(1)
    // The client's weapon % is the 40; its tooltip adds 80% more against those types.
    expect(spells['1310222'].effects.find((e) => e.effect === EFFECT.weaponPercent)?.effectBasePointsF).toBe(40)
  })
})

/** Cast abilities and their spell ids (warrior.md §3.2, §2.9). */
const CAST_SPELL_ID: Record<string, number> = {
  battleShout: 25289,
  bloodrage: 2687,
  deathWish: 12328,
  recklessness: 1719,
  berserkerRage: 18499,
  bloodFury: 20572,
  berserking: 20554,
  elunesLight: 1259799,
}
const CASTS: AbilityDef[] = [BATTLE_SHOUT, BLOODRAGE, DEATH_WISH, RECKLESSNESS, BERSERKER_RAGE, BLOOD_FURY, BERSERKING, ELUNES_LIGHT]
/** SpellEffectName: apply aura, energize, trigger spell; SpellAuraName: periodic energize. */
const APPLY_AURA = 6
const ENERGIZE = 30
const TRIGGER_SPELL = 64
const PERIODIC_ENERGIZE = 24
/**
 * The aura effects the sim models, by SpellAuraName: damage done %, all crit (attacks and spells,
 * combat-tables §9), attack power %, melee haste %, melee attack power.
 */
const AURA_MOD: Record<number, string[]> = { 79: ['damage'], 290: ['crit', 'spellCrit'], 166: ['apPct'], 319: ['haste'], 99: ['ap'] }
/**
 * An effect's points at level 60, by the spell-text renderer's rule (scripts/scrape/lib/spell-text.mjs
 * `scalingLevels`, `effectRange`; docs/data/items.md#per-level-values): base + the per-level term ×
 * the levels from `spellLevel` to 60 (or to `maxLevel` when lower), never below 0, truncated toward
 * zero (Battle Shout: 139 + 0.6 × 0).
 */
const pointsAt60 = (spell: (typeof spells)[string], e: (typeof spells)[string]['effects'][number]) =>
  (e.effectBasePointsF ?? 0) +
  Math.trunc((e.effectRealPointsPerLevel ?? 0) * Math.max(0, Math.min(60, spell.levels?.maxLevel || 60) - (spell.levels?.spellLevel ?? 60)))

describe('cast abilities match src/data/client/spells.json (warrior.md §2.3, §2.6, §2.9, §3.2)', () => {
  for (const ability of CASTS) {
    const id = CAST_SPELL_ID[ability.id]
    it(`${ability.name} (${id})`, () => {
      const spell = spells[String(id)]
      expect(spell.name).toBe(ability.name.replace('’', "'"))
      expect(ability.kind).toBe('cast')
      // No SpellPower rage row means no cost (Bloodrage's is health; Berserking has none in Forever).
      const power = spell.power?.find((p) => (p.powerType ?? 0) === RAGE)
      expect(power?.manaCost ?? 0, 'rage cost in tenths').toBe(ability.costTenths)
      expect(spell.cooldowns?.categoryRecoveryTime ?? spell.cooldowns?.recoveryTime ?? 0, 'cooldown').toBe(ability.cooldownMs)
      expect(spell.cooldowns?.startRecoveryTime ?? 0, 'GCD').toBe(ability.gcdMs)
      const forms = spell.shapeshift?.shapeshiftMask?.[0] ?? 0
      expect(ability.stances, 'stances').toBe(forms === 0 ? STANCE_ANY : forms === FORM.berserker ? STANCE.berserker : -1)
      // The buff: every modelled aura effect, at its value, for the spell's duration.
      const mods: Record<string, number> = {}
      for (const e of spell.effects) {
        if (e.effect !== APPLY_AURA || e.effectAura === undefined || !(e.effectAura in AURA_MOD)) continue
        for (const mod of AURA_MOD[e.effectAura]) mods[mod] = pointsAt60(spell, e)
        // Death Wish's damage aura is on the physical school (misc 1), as the engine's damage mod is.
        if (e.effectAura === 79) expect(e.effectMiscValue?.[0]).toBe(1)
      }
      expect(ability.aura?.mods ?? {}, 'aura mods').toEqual(mods)
      if (ability.aura) expect(ability.aura.durationMs, 'aura duration').toBe(spell.duration?.duration)
      // Rage: an energize (misc 1 = rage) at once, and a triggered periodic energize.
      const energize = spell.effects.find((e) => e.effect === ENERGIZE && e.effectMiscValue?.[0] === 1)
      expect(ability.rageTenths, 'rage at once').toBe(energize?.effectBasePointsF ?? 0)
      const trigger = spell.effects.find((e) => e.effect === TRIGGER_SPELL)?.effectTriggerSpell
      const periodic = trigger ? spells[String(trigger)] : undefined
      const tick = periodic?.effects.find((e) => e.effect === APPLY_AURA && e.effectAura === PERIODIC_ENERGIZE)
      expect(tick?.effectMiscValue?.[0] ?? 1, 'periodic energize of rage').toBe(1)
      expect(ability.rageTickTenths, 'rage per tick').toBe(tick?.effectBasePointsF ?? 0)
      expect(ability.rageTickMs, 'tick period').toBe(tick?.effectAuraPeriod ?? 0)
      expect(ability.rageTicks, 'ticks').toBe(tick ? (periodic!.duration!.duration ?? 0) / tick.effectAuraPeriod! : 0)
    })
  }

  it('Battle Shout rank 7 is 139 attack power at 60 (0.6 per level from level 60), not reduced by Focused Rage (warrior.md §1.1, §2.3)', () => {
    expect(BATTLE_SHOUT.aura?.mods).toEqual({ ap: 139 })
    expect(withTalents(BATTLE_SHOUT, new Map([['Focused Rage', 3]])).costTenths).toBe(100)
    // The same 139 as the Buffs tab's Battle Shout, which the rotation's upkeep replaces.
    expect(BUFFS_BY_ID.get('battleShout')!.effects).toEqual([{ kind: 'stat', stat: 'ap', value: 139 }])
  })

  it('Recklessness per profile: all crit (aura 290) in Forever, so spells crit more; Classic Era’s is melee crit only (aura 52) (warrior.md §2.6)', () => {
    expect(recklessness(FOREVER)).toBe(RECKLESSNESS)
    expect(recklessness(CLASSIC_ERA)).toBe(RECKLESSNESS_CLASSIC_ERA)
    const { aura, ...rest } = RECKLESSNESS_CLASSIC_ERA
    const { aura: foreverAura, ...foreverRest } = RECKLESSNESS
    expect(rest).toEqual(foreverRest)
    expect(foreverAura!.mods).toEqual({ crit: 100, spellCrit: 100 })
    expect(aura).toEqual({ ...foreverAura, mods: { crit: 100 } })
  })

  it('Battle Shout per profile: Classic Era’s is 232 attack power for 2 min, the catalogue’s Classic Era value (warrior.md §1.1, §3.2)', () => {
    expect(battleShout(FOREVER)).toBe(BATTLE_SHOUT)
    expect(battleShout(CLASSIC_ERA)).toBe(BATTLE_SHOUT_CLASSIC_ERA)
    // Only the aura differs: the cost, cooldown, GCD and stances are the same in both clients.
    const { aura, ...rest } = BATTLE_SHOUT_CLASSIC_ERA
    const { aura: foreverAura, ...foreverRest } = BATTLE_SHOUT
    expect(rest).toEqual(foreverRest)
    expect(aura).toEqual({ ...foreverAura, durationMs: 120000, mods: { ap: 232 } })
    for (const profile of [FOREVER, CLASSIC_ERA]) {
      expect(catalogueEffects(BUFFS_BY_ID.get('battleShout')!, profile)).toEqual([{ kind: 'stat', stat: 'ap', value: battleShout(profile).aura!.mods.ap }])
    }
  })

  // The committed client data is Forever's only; with the raw Classic Era tables cached locally
  // (.cache/client/1.15.9.69722/tables, from `npm run scrape:client`), check Classic Era's 25289.
  const CLASSIC_TABLES = import.meta.glob<string>('/.cache/client/1.15.9.69722/tables/{SpellEffect,SpellLevels,SpellMisc,SpellDuration,SpellPower,SpellCooldowns}.ndjson', {
    query: '?raw',
    import: 'default',
  })
  it.skipIf(Object.keys(CLASSIC_TABLES).length !== 6)('Classic Era’s Battle Shout matches the Classic Era client’s 25289 (1.15.9.69722, cached locally)', async () => {
    /** The spell's rows in a table, found by line so the large tables aren't parsed whole. */
    const rows = async (table: string, key: string, id: number) => {
      const raw = await CLASSIC_TABLES[`/.cache/client/1.15.9.69722/tables/${table}.ndjson`]()
      const pattern = new RegExp(`"${key}":${id}[,}]`)
      return raw
        .split('\n')
        .filter((line) => pattern.test(line))
        .map((line) => JSON.parse(line) as Record<string, number>)
        .filter((r) => (r.DifficultyID ?? 0) === 0)
    }
    const [effect] = (await rows('SpellEffect', 'SpellID', 25289)).filter((r) => r.Effect === APPLY_AURA && r.EffectAura === 99)
    const [levels] = await rows('SpellLevels', 'SpellID', 25289)
    const [misc] = await rows('SpellMisc', 'SpellID', 25289)
    const [duration] = await rows('SpellDuration', 'ID', misc.DurationIndex)
    const [power] = await rows('SpellPower', 'SpellID', 25289)
    const [cooldowns] = await rows('SpellCooldowns', 'SpellID', 25289)
    // Classic Era's layout: EffectBasePoints + 1 (EffectDieSides 1), + the per-level term at 60.
    const scaled = Math.trunc(effect.EffectRealPointsPerLevel * Math.max(0, Math.min(60, levels.MaxLevel || 60) - levels.SpellLevel))
    expect(effect.EffectDieSides).toBe(1)
    expect(BATTLE_SHOUT_CLASSIC_ERA.aura?.mods).toEqual({ ap: effect.EffectBasePoints + 1 + scaled })
    expect(BATTLE_SHOUT_CLASSIC_ERA.aura?.durationMs).toBe(duration.Duration)
    expect([power.PowerType, power.ManaCost]).toEqual([RAGE, BATTLE_SHOUT_CLASSIC_ERA.costTenths])
    expect([cooldowns.RecoveryTime, cooldowns.StartRecoveryTime]).toEqual([BATTLE_SHOUT_CLASSIC_ERA.cooldownMs, BATTLE_SHOUT_CLASSIC_ERA.gcdMs])
  })

  it('Charge rank 3 gives 15 rage, +3 per Improved Charge rank (warrior.md §2.3)', () => {
    const charge = spells['11578']
    expect(charge.name).toBe('Charge')
    expect(charge.effects.find((e) => e.effect === ENERGIZE && e.effectMiscValue?.[0] === 1)?.effectBasePointsF).toBe(CHARGE_RAGE_TENTHS)
    expect(charge.shapeshift?.shapeshiftMask?.[0]).toBe(FORM.battle)
    const improved = spells['12285']
    expect(improved.name).toBe('Improved Charge')
    expect(improved.effects[0].effectBasePointsF).toBe(IMPROVED_CHARGE_TENTHS_PER_RANK)
  })

  it('on-use items and consumables become off-GCD casts in any stance (warrior.md §5.2 rows 3, 16, 17)', () => {
    for (const use of [MIGHTY_RAGE_POTION, JUJU_FLURRY, ITEM_EFFECTS[272438].use!]) {
      const a = onUseAbility(use)
      expect(a).toMatchObject({ kind: 'cast', costTenths: 0, gcdMs: 0, stances: STANCE_ANY, cooldownMs: use.cooldownMs, aura: use.aura, rageTenths: use.rageTenths, rageSpreadTenths: use.rageSpreadTenths, usesPerFight: 0 })
    }
  })

  it('puts the racial cooldowns under their races', () => {
    expect(RACIAL_COOLDOWNS).toEqual({ 'horde-orc': BLOOD_FURY, 'horde-troll': BERSERKING, 'alliance-night-elf': ELUNES_LIGHT })
  })
})

describe('talents on the cast abilities (warrior.md §2.3)', () => {
  const t = (entries: [string, number][]) => new Map(entries)

  it('W19: Improved Bloodrage 2/2 gives 15 at once and 1.5 per second for 10 s, 30 in all; 0/2 gives 10 + 10 × 1', () => {
    const total = (a: AbilityDef) => a.rageTenths + a.rageTicks * a.rageTickTenths
    const two = withTalents(BLOODRAGE, t([['Improved Bloodrage', 2]]))
    expect([two.rageTenths, two.rageTickTenths, two.rageTicks, two.rageTickMs, total(two)]).toEqual([150, 15, 10, 1000, 300])
    const none = withTalents(BLOODRAGE, t([]))
    expect([none.rageTenths, none.rageTickTenths, total(none)]).toEqual([100, 10, 200])
    // 1/2: 12.5 at once; the 1.25-rage ticks floor to 1.2 (rage.md "Rounding").
    const one = withTalents(BLOODRAGE, t([['Improved Bloodrage', 1]]))
    expect([one.rageTenths, one.rageTickTenths]).toEqual([125, 12])
  })

  it('Improved Berserker Rage gives +5 / +10 rage on use; Focused Rage makes Death Wish cost 7 at 3/3 (W20)', () => {
    expect([0, 1, 2].map((r) => withTalents(BERSERKER_RAGE, t([['Improved Berserker Rage', r]])).rageTenths)).toEqual([0, 50, 100])
    expect(withTalents(DEATH_WISH, t([['Focused Rage', 3]])).costTenths).toBe(70)
    // Focused Rage doesn't reduce Bloodrage or Berserker Rage, which cost nothing anyway.
    expect(FOCUSED_RAGE.has('recklessness')).toBe(false)
  })
})

describe('talent class masks match the client data (warrior.md §2.3, §2.5)', () => {
  it('Focused Rage covers exactly its listed abilities, not Battle Shout, Shield Block, Berserker Rage or Bloodrage', () => {
    for (const id of Object.keys(SPELL_ID)) expect(FOCUSED_RAGE.has(id), id).toBe(inMask(id, TALENT_MASK.focusedRage))
    for (const id of ['battleShout', 'shieldBlock', 'berserkerRage', 'bloodrage']) expect(FOCUSED_RAGE.has(id)).toBe(false)
  })

  it('Impale covers exactly its listed abilities: Rend and Sunder Armor too, not the shouts or cooldowns', () => {
    for (const id of Object.keys(SPELL_ID)) expect(IMPALE.has(id), id).toBe(inMask(id, TALENT_MASK.impale))
    for (const a of [...ABILITIES, ...ARMS_STRIKES, REND]) expect(IMPALE.has(a.id)).toBe(true)
    expect(IMPALE.has('rend') && IMPALE.has('sunderArmor')).toBe(true)
  })

  it('Improved Heroic Strike and Improved Execute reduce only their own ability', () => {
    for (const id of Object.keys(SPELL_ID)) {
      expect(inMask(id, TALENT_MASK.improvedHeroicStrike), id).toBe(id === 'heroicStrike')
      expect(inMask(id, TALENT_MASK.improvedExecute), id).toBe(id === 'execute')
    }
  })
})

describe('rage costs per build (warrior.md §2.3 "Cost reductions")', () => {
  const ranks = (code: string) => talentRanksByName(TALENT_DATA.warrior, code)
  const costs = (code: string, ids: string[]) => Object.fromEntries(ids.map((id) => [id, rageCost(id, baseCost(id), ranks(code))]))

  it('W20: Protection default build (Focused Rage 3/3, Improved Sunder Armor 3/3, Improved Heroic Strike 3/3), and its Improved Thunder Clap preset', () => {
    const ids = ['sunderArmor', 'shieldSlam', 'revenge', 'heroicStrike', 'thunderClap', 'demoralizingShout', 'battleShout', 'shieldBlock', 'deathWish']
    expect(costs('35-05-552101233301210531', ids)).toEqual({
      sunderArmor: 9,
      shieldSlam: 17,
      revenge: 2,
      heroicStrike: 9,
      thunderClap: 17,
      demoralizingShout: 7,
      battleShout: 10,
      shieldBlock: 10,
      deathWish: 7,
    })
    // Improved Thunder Clap 3/3 in place of Improved Heroic Strike 3/3.
    expect(costs('05-05-552131233301210531', ['heroicStrike', 'thunderClap'])).toEqual({ heroicStrike: 12, thunderClap: 11 })
  })

  it('W21: Fury default build (Improved Heroic Strike 3/3, no Improved Execute)', () => {
    // W21's Cleave rows (15, and 16 for Fury + Precision) wait for Cleave itself.
    expect(
      costs('30305013002-050530035150010051-', ['heroicStrike', 'bloodthirst', 'whirlwind', 'execute', 'hamstring', 'overpower', 'battleShout', 'deathWish']),
    ).toEqual({ heroicStrike: 12, bloodthirst: 30, whirlwind: 25, execute: 15, hamstring: 10, overpower: 5, battleShout: 10, deathWish: 10 })
  })

  it('Improved Execute is a table (−3, −5), and the reductions stack', () => {
    const t = (entries: [string, number][]) => new Map(entries)
    expect([0, 1, 2].map((r) => costReduction('execute', t([['Improved Execute', r]])))).toEqual([0, 3, 5])
    expect(rageCost('execute', 15, t([['Improved Execute', 2], ['Focused Rage', 3]]))).toBe(7)
    expect(rageCost('thunderClap', 20, t([['Improved Thunder Clap', 3], ['Focused Rage', 3]]))).toBe(11)
    expect(rageCost('revenge', 5, t([['Focused Rage', 3]]))).toBe(2)
    expect(rageCost('revenge', 2, t([['Focused Rage', 3]]))).toBe(0)
  })
})

describe('Impale and Raging Blows (warrior.md §2.5, §3.1)', () => {
  it('ability crits deal 1 + 1.0 × (1 + 0.10 × rank): 2.0, 2.1, 2.2 (W1)', () => {
    expect([0, 1, 2].map((r) => abilityCritMultiplier('bloodthirst', new Map([['Impale', r]])))).toEqual([2, 2.1, 2.2])
    expect(abilityCritMultiplier('battleShout', new Map([['Impale', 2]]))).toBe(2)
  })

  it('applies the default Fury build to its abilities', () => {
    const fury = talentRanksByName(TALENT_DATA.warrior, '30305013002-050530035150010051-')
    const resolved = ABILITIES.map((a) => withTalents(a, fury))
    expect(resolved.map((a) => [a.id, a.costTenths, a.critMultiplier, a.offHand])).toEqual([
      ['bloodthirst', 300, 2.2, false],
      ['whirlwind', 250, 2.2, true],
      ['heroicStrike', 120, 2.2, false],
      ['hamstring', 100, 2.2, false],
      ['execute', 150, 2.2, false],
    ])
    const none = ABILITIES.map((a) => withTalents(a, new Map()))
    expect(none.map((a) => [a.costTenths, a.critMultiplier, a.offHand])).toEqual(ABILITIES.map((a) => [a.costTenths, 2, false]))
  })
})

describe('Execute worked examples', () => {
  it('W10: 600 + 15 × (rage − cost)', () => {
    expect(executeDamage(50, 10)).toBe(1200) // Improved Execute 2/2
    expect(executeDamage(50, 15)).toBe(1125) // the popular Fury build
    expect(executeDamage(130, 15)).toBe(2325) // Boundless Rage 3/3, full bar
  })

  it('W11: Bloodthirst beats a 30-rage Execute above 2220 AP at cost 15, 2434.29 at 10, 2348.57 at 12', () => {
    expect(executeBreakEvenAp(15)).toBeCloseTo(2220, 9)
    expect(executeBreakEvenAp(10)).toBeCloseTo(2434.2857142857, 9)
    expect(executeBreakEvenAp(12)).toBeCloseTo(2348.5714285714, 9)
  })
})

describe('Fury rotation options (warrior.md §5.1, §5.2)', () => {
  it('declares valid, uniquely named settings', () => {
    const ids = FURY_OPTIONS.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const option of FURY_OPTIONS) {
      expect(option.id).toMatch(/^warrior\.fury\.[a-zA-Z]+\.[a-zA-Z]+$/)
      expect(option.label.length).toBeGreaterThan(0)
      expect(option.help.length).toBeGreaterThan(0)
      if (option.kind === 'number') {
        expect(option.min).toBeLessThanOrEqual(option.default)
        expect(option.default).toBeLessThanOrEqual(option.max)
        expect(option.step).toBeGreaterThan(0)
        expect(option.unit.length).toBeGreaterThan(0)
      }
      if (option.dependsOn !== undefined) {
        const parent = FURY_OPTIONS.find((o) => o.id === option.dependsOn)
        expect(parent?.kind, `${option.id} depends on a toggle`).toBe('toggle')
      }
      if (option.kind === 'number' && option.alsoDependsOn !== undefined)
        expect(FURY_OPTIONS.find((o) => o.id === option.alsoDependsOn)?.kind, `${option.id} also depends on a toggle`).toBe('toggle')
      if (option.kind === 'toggle') {
        if (option.requiresBuff) expect(BUFFS_BY_ID.get(option.requiresBuff)?.category, option.id).toBe('consumable')
        if (option.maintainsBuff) expect(BUFFS_BY_ID.has(option.maintainsBuff), option.id).toBe(true)
      }
    }
  })

  it('uses the §5.2 defaults for the pre-pull, Battle Shout and consumables (rows 0, 1, 16 and 17)', () => {
    const defaults = Object.fromEntries(FURY_OPTIONS.map((o) => [o.id, o.default]))
    expect(defaults).toMatchObject({
      'warrior.fury.prepull.battleShout': true,
      'warrior.fury.prepull.bloodrage': true,
      'warrior.fury.prepull.charge': false,
      'warrior.fury.battleShout.enabled': true,
      'warrior.fury.battleShout.refreshBelowSec': 3,
      'warrior.fury.trinkets.enabled': true,
      'warrior.fury.cooldowns.syncWithDeathWish': true,
      'warrior.fury.ragePotion.enabled': true,
      'warrior.fury.ragePotion.maxRage': 0,
      'warrior.fury.jujuFlurry.enabled': true,
    })
    // The racial's sync covers trinkets now; a saved setup keeps its value under the new id.
    expect(FURY_RENAMED_OPTIONS).toEqual({ 'warrior.fury.racial.syncWithDeathWish': 'warrior.fury.cooldowns.syncWithDeathWish' })
  })

  it('uses the §5.2 defaults, the best rotation found (D23, M2.5b): the Overpower dance up to 40 rage, Heroic Strike from 40 with its cancel and in the phase, no Hamstring', () => {
    const defaults = Object.fromEntries(FURY_OPTIONS.map((o) => [o.id, o.default]))
    expect(defaults).toMatchObject({
      'warrior.fury.execute.enabled': true,
      'warrior.fury.execute.minExtraRage': 0,
      'warrior.fury.execute.btOverExecuteAp': 2220,
      'warrior.fury.execute.whirlwindInExecute': false,
      'warrior.fury.execute.heroicStrikeInExecute': true,
      'warrior.fury.bloodthirst.enabled': true,
      'warrior.fury.whirlwind.enabled': true,
      'warrior.fury.whirlwind.reserve': 0,
      'warrior.fury.whirlwind.btCdMinSec': 0.5,
      'warrior.fury.overpower.enabled': true,
      'warrior.fury.overpower.maxRage': 40,
      'warrior.fury.heroicStrike.enabled': true,
      'warrior.fury.heroicStrike.minRage': 40,
      'warrior.fury.heroicStrike.unqueue': true,
      'warrior.fury.heroicStrike.unqueueBelow': 20,
      'warrior.fury.hamstring.enabled': false,
      'warrior.fury.hamstring.minRage': 60,
      'warrior.fury.hamstring.onlyWhenFlurryDown': false,
      'warrior.fury.slam.enabled': false,
    })
  })

  it('uses the §5.2 cooldown defaults: thresholds in absolute rage from the 130 cap (§5.1)', () => {
    const defaults = Object.fromEntries(FURY_OPTIONS.map((o) => [o.id, o.default]))
    expect(defaults).toMatchObject({
      'warrior.fury.deathWish.enabled': true,
      'warrior.fury.deathWish.alignToEnd': true,
      'warrior.fury.racial.enabled': true,
      'warrior.fury.cooldowns.syncWithDeathWish': true,
      'warrior.fury.deathWish.beforeExecuteSec': 3,
      'warrior.fury.recklessness.enabled': true,
      'warrior.fury.recklessness.beforeExecuteSec': 1.5,
      'warrior.fury.recklessness.lastSec': 16,
      'warrior.fury.bloodrage.enabled': true,
      'warrior.fury.bloodrage.maxRage': 110,
      'warrior.fury.berserkerRage.enabled': true,
      'warrior.fury.berserkerRage.maxRage': 120,
    })
  })

  it('lists the settings in §5.2’s priority order', () => {
    const rows = [...new Set(FURY_OPTIONS.map((o) => o.id.split('.')[2]))]
    expect(rows).toEqual([
      'prepull', // 0
      'battleShout', // 1
      'deathWish', // 2
      ...['racial', 'trinkets', 'cooldowns'], // 3
      'recklessness', // 4
      'bloodrage', // 5
      'execute', // 6, 7
      'bloodthirst', // 8
      'whirlwind', // 9
      'overpower', // 10
      'heroicStrike', // 11
      'hamstring', // 12
      'berserkerRage', // 13
      'slam', // 15
      'ragePotion', // 16
      'jujuFlurry', // 17
    ])
  })
})

/** The pre-pull, Battle Shout and cooldown rows (warrior.md §5.2 rows 0–5 and 13) off, for the M2.2a list's own tests. */
const NO_CD = {
  'warrior.fury.prepull.bloodrage': false,
  'warrior.fury.battleShout.enabled': false,
  'warrior.fury.deathWish.enabled': false,
  'warrior.fury.racial.enabled': false,
  'warrior.fury.recklessness.enabled': false,
  'warrior.fury.bloodrage.enabled': false,
  'warrior.fury.berserkerRage.enabled': false,
}

describe('furyRotation', () => {
  const withBt = new Map([['Bloodthirst', 1]])
  const noAura = () => -1
  const inExec = { code: COND.executePhase, a: 1, b: 0 }
  const notExec = { code: COND.executePhase, a: 0, b: 0 }
  const noExecute = { ...NO_CD, 'warrior.fury.execute.enabled': false }

  it('builds rows 6–11 in priority order with the default conditions (M2.5b): the Overpower dance, Heroic Strike in both phases, no Hamstring', () => {
    const { abilities, rotation } = furyRotation(NO_CD, withBt, noAura)
    expect(abilities.map((a) => a.id)).toEqual(['bloodthirst', 'execute', 'whirlwind', 'overpower', 'heroicStrike'])
    expect(rotation.map((e) => e.ability)).toEqual([0, 1, 0, 2, 3, 3, 3, 4])
    const upTo40 = { code: COND.maxRage, a: 400, b: 0 }
    expect(rotation.map((e) => e.conditions)).toEqual([
      [inExec, { code: COND.apAtLeast, a: 2220, b: 0 }], // 6: Bloodthirst in the execute phase
      [{ code: COND.minRage, a: 150, b: 0 }], // 7: Execute
      [notExec], // 8: Bloodthirst
      [notExec, { code: COND.minRage, a: 250, b: 0 }, { code: COND.cooldownAtLeast, a: 0, b: 500 }], // 9: Whirlwind
      // 10: the Overpower dance at rage ≤ 40, GCD-safe as Berserker Rage is in each phase (row 13).
      [notExec, { code: COND.gcdSafe, a: 0b101, b: 1500 }, upTo40],
      [inExec, { code: COND.apAtLeast, a: 2220, b: 0 }, { code: COND.gcdSafe, a: 0b1, b: 1500 }, upTo40],
      [inExec, { code: COND.apBelow, a: 2220, b: 0 }, upTo40],
      [{ code: COND.minRage, a: 400, b: 0 }], // 11: Heroic Strike, in both phases
    ])
    expect(rotation.slice(4, 7).map((e) => e.danceTo)).toEqual([STANCE.battle, STANCE.battle, STANCE.battle])
    // Cancelled below 20 rage before its swing.
    expect(rotation[7].unqueueBelowTenths).toBe(200)
  })

  it('without Execute, builds one list with no phase conditions', () => {
    const { abilities, rotation } = furyRotation(noExecute, withBt, noAura)
    expect(abilities.map((a) => a.id)).toEqual(['bloodthirst', 'whirlwind', 'overpower', 'heroicStrike'])
    expect(rotation.map((e) => e.ability)).toEqual([0, 1, 2, 3])
    expect(rotation[0].conditions).toEqual([])
    expect(rotation[1].conditions).toEqual([
      { code: COND.minRage, a: 250, b: 0 },
      { code: COND.cooldownAtLeast, a: 0, b: 500 },
    ])
    expect(rotation[2].conditions).toEqual([
      { code: COND.gcdSafe, a: 0b11, b: 1500 },
      { code: COND.maxRage, a: 400, b: 0 },
    ])
    expect(rotation[3].conditions).toEqual([{ code: COND.minRage, a: 400, b: 0 }])
  })

  it('applies the settings: reserve, thresholds, unqueue and the Flurry condition', () => {
    // With Hamstring on and the Overpower dance off (the defaults before M2.5b), so the list is rows 8, 9, 11, 12.
    const { rotation } = furyRotation(
      {
        ...noExecute,
        'warrior.fury.overpower.enabled': false,
        'warrior.fury.hamstring.enabled': true,
        'warrior.fury.whirlwind.reserve': 10,
        'warrior.fury.whirlwind.btCdMinSec': 2,
        'warrior.fury.heroicStrike.minRage': 55,
        'warrior.fury.heroicStrike.unqueue': true,
        'warrior.fury.heroicStrike.unqueueBelow': 25,
        'warrior.fury.hamstring.onlyWhenFlurryDown': true,
      },
      withBt,
      (id) => (id === 'flurry' ? 4 : -1),
    )
    expect(rotation[1].conditions).toEqual([
      { code: COND.minRage, a: 350, b: 0 },
      { code: COND.cooldownAtLeast, a: 0, b: 2000 },
    ])
    expect(rotation[2].conditions).toEqual([{ code: COND.minRage, a: 550, b: 0 }])
    expect(rotation[2].unqueueBelowTenths).toBe(250)
    expect(rotation[3].conditions).toContainEqual({ code: COND.auraDown, a: 4, b: 0 })
    expect(rotation[3].conditions).toContainEqual({ code: COND.minRage, a: 600, b: 0 })
    // Without its cancel, a queued Heroic Strike stays queued.
    expect(furyRotation({ ...noExecute, 'warrior.fury.heroicStrike.unqueue': false }, withBt, noAura).rotation[3].unqueueBelowTenths).toBe(0)
  })

  it('applies the execute settings: extra rage, the Bloodthirst AP, and the talented Execute cost', () => {
    const talents = new Map([
      ['Bloodthirst', 1],
      ['Improved Execute', 2],
    ])
    const { abilities, rotation } = furyRotation({ ...NO_CD, 'warrior.fury.execute.minExtraRage': 20, 'warrior.fury.execute.btOverExecuteAp': 2434 }, talents, noAura)
    expect(abilities[1].costTenths).toBe(100)
    expect(rotation[0].conditions).toContainEqual({ code: COND.apAtLeast, a: 2434, b: 0 })
    expect(rotation[1].conditions).toEqual([{ code: COND.minRage, a: 300, b: 0 }])
  })

  it('keeps Heroic Strike in the execute phase by default (M2.5b), and stops it there with heroicStrikeInExecute off', () => {
    const hsLine = (values: Record<string, boolean>) => {
      const { rotation, abilities } = furyRotation(values, withBt, noAura)
      return rotation.find((e) => e.ability === abilities.findIndex((a) => a.id === 'heroicStrike'))!.conditions
    }
    expect(hsLine({})).toEqual([{ code: COND.minRage, a: 400, b: 0 }])
    expect(hsLine({ 'warrior.fury.execute.heroicStrikeInExecute': false })).toEqual([notExec, { code: COND.minRage, a: 400, b: 0 }])
  })

  it('keeps Whirlwind in the execute phase if asked, waiting on Bloodthirst only while it’s used there', () => {
    const { rotation, abilities } = furyRotation({ ...NO_CD, 'warrior.fury.execute.whirlwindInExecute': true }, withBt, noAura)
    const ww = abilities.findIndex((a) => a.id === 'whirlwind')
    const minRage = { code: COND.minRage, a: 250, b: 0 }
    const btWait = { code: COND.cooldownAtLeast, a: 0, b: 500 }
    expect(rotation.filter((e) => e.ability === ww).map((e) => e.conditions)).toEqual([
      [notExec, minRage, btWait],
      [inExec, { code: COND.apAtLeast, a: 2220, b: 0 }, minRage, btWait],
      [inExec, { code: COND.apBelow, a: 2220, b: 0 }, minRage],
    ])
    // Without Bloodthirst there is nothing to wait on: one line for both phases.
    const noBt = furyRotation({ ...NO_CD, 'warrior.fury.execute.whirlwindInExecute': true }, new Map(), noAura)
    expect(noBt.rotation.filter((e) => noBt.abilities[e.ability].id === 'whirlwind').map((e) => e.conditions)).toEqual([[minRage]])
  })

  it('leaves out disabled abilities, and Bloodthirst without the talent', () => {
    const noTalent = furyRotation({ ...noExecute, 'warrior.fury.hamstring.enabled': true }, new Map(), noAura)
    expect(noTalent.abilities.map((a) => a.id)).toEqual(['whirlwind', 'overpower', 'heroicStrike', 'hamstring'])
    // Whirlwind then has no Bloodthirst condition, and the Overpower dance and Hamstring are GCD-safe for Whirlwind only.
    expect(noTalent.rotation[0].conditions).toEqual([{ code: COND.minRage, a: 250, b: 0 }])
    expect(noTalent.rotation[1].conditions).toContainEqual({ code: COND.gcdSafe, a: 0b1, b: 1500 })
    expect(noTalent.rotation[3].conditions).toContainEqual({ code: COND.gcdSafe, a: 0b1, b: 1500 })
    // Execute doesn't need the Bloodthirst talent.
    expect(furyRotation(NO_CD, new Map(), noAura).abilities.map((a) => a.id)).toEqual(['execute', 'whirlwind', 'overpower', 'heroicStrike'])

    const onlyHs = furyRotation(
      { ...noExecute, 'warrior.fury.bloodthirst.enabled': false, 'warrior.fury.whirlwind.enabled': false, 'warrior.fury.overpower.enabled': false },
      withBt,
      noAura,
    )
    expect(onlyHs.abilities.map((a) => a.id)).toEqual(['heroicStrike'])
  })
})

describe('furyRotation: the cooldowns (warrior.md §5.2 rows 2–5 and 13)', () => {
  const noAura = () => -1
  const talents = new Map([
    ['Bloodthirst', 1],
    ['Death Wish', 1],
    ['Improved Berserker Rage', 2],
  ])
  type Rot = ReturnType<typeof furyRotation>
  const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
  const linesOf = (r: Rot, id: string) => r.rotation.filter((e) => r.abilities[e.ability].id === id).map((e) => e.conditions)
  const at = (r: Rot, id: string) => r.abilities.findIndex((a) => a.id === id)
  const timeLeftAtMost = (ms: number) => ({ code: COND.timeLeftAtMost, a: ms, b: 0 })
  const timeLeftAtLeast = (ms: number) => ({ code: COND.timeLeftAtLeast, a: ms, b: 0 })
  const executeWithin = (ms: number) => ({ code: COND.executeWithin, a: ms, b: 0 })

  it('puts rows 1–5 before the execute phase’s lines and row 13 after them, in §5.2 order', () => {
    const r = furyRotation({}, talents, noAura, { race: 'horde-orc' })
    expect(ids(r)).toEqual([
      'battleShout', // 1
      ...['deathWish', 'deathWish', 'deathWish'], // 2: not the final use, or the final one with 30 s left or before the phase
      ...['bloodFury', 'bloodFury', 'bloodFury'], // 3: synced with Death Wish
      ...['recklessness', 'recklessness'], // 4: before the execute phase, or by the clock
      'bloodrage', // 5
      ...['bloodthirst', 'execute', 'bloodthirst', 'whirlwind'], // 6–9
      ...['overpower', 'overpower', 'overpower'], // 10: the dance, outside the phase and in it above and below btOverExecuteAp
      'heroicStrike', // 11
      ...['berserkerRage', 'berserkerRage', 'berserkerRage'], // 13: outside the phase, and in it above and below btOverExecuteAp
    ])
    // Off-GCD casts: Bloodrage and the racial; the rest (Battle Shout too) use the GCD (warrior.md §2.2).
    expect(r.abilities.filter((a) => a.gcdMs === 0).map((a) => a.id).sort()).toEqual(['bloodFury', 'bloodrage', 'heroicStrike'])
  })

  it('row 2: Death Wish on cooldown, the final use 3 s before the execute phase or with 30 s left; one plain line without alignToEnd; none without the talent', () => {
    const r = furyRotation({}, talents, noAura)
    const final = [[timeLeftAtLeast(180001)], [timeLeftAtMost(30000)]]
    // The final use is the one no later use could follow: time left ≤ its 3 min cooldown.
    expect(linesOf(r, 'deathWish')).toEqual([...final, [executeWithin(3000), timeLeftAtMost(180000)]])
    expect(linesOf(furyRotation({ 'warrior.fury.deathWish.beforeExecuteSec': 10 }, talents, noAura), 'deathWish')[2][0]).toEqual(executeWithin(10000))
    // Without the execute phase, or with Execute off, only the clock.
    expect(linesOf(furyRotation({}, talents, noAura, { executePhase: false }), 'deathWish')).toEqual(final)
    expect(linesOf(furyRotation({ 'warrior.fury.execute.enabled': false }, talents, noAura), 'deathWish')).toEqual(final)
    expect(linesOf(furyRotation({ 'warrior.fury.deathWish.alignToEnd': false }, talents, noAura), 'deathWish')).toEqual([[]])
    expect(ids(furyRotation({}, new Map([['Bloodthirst', 1]]), noAura))).not.toContain('deathWish')
    expect(ids(furyRotation({ 'warrior.fury.deathWish.enabled': false }, talents, noAura))).not.toContain('deathWish')
  })

  it('row 3: the racial synced with Death Wish, on cooldown without it, and nothing for races without one', () => {
    const r = furyRotation({}, talents, noAura, { race: 'horde-troll' })
    const dw = at(r, 'deathWish')
    expect(linesOf(r, 'berserking')).toEqual([
      [{ code: COND.abilityAuraUp, a: dw, b: 0 }], // while Death Wish is up
      [{ code: COND.cooldownAtLeast, a: dw, b: 180000 }], // Death Wish's cooldown outlasts the racial's
      // The held final Death Wish is that far off, counted from 30 s left even though it comes 3 s
      // before the execute phase when that's first: holding the racial for that too measured worse.
      [timeLeftAtMost(180000), timeLeftAtLeast(30000 + 180000)],
    ])
    const plain = [[]]
    expect(linesOf(furyRotation({ 'warrior.fury.cooldowns.syncWithDeathWish': false }, talents, noAura, { race: 'horde-troll' }), 'berserking')).toEqual(plain)
    expect(linesOf(furyRotation({}, new Map(), noAura, { race: 'alliance-night-elf' }), 'elunesLight')).toEqual(plain)
    // Without alignToEnd there's no held final use to wait for.
    expect(linesOf(furyRotation({ 'warrior.fury.deathWish.alignToEnd': false }, talents, noAura, { race: 'horde-orc' }), 'bloodFury')).toHaveLength(2)
    for (const race of ['alliance-human', 'alliance-gnome', 'horde-undead', '']) {
      expect(furyRotation({}, talents, noAura, { race }).abilities.every((a) => !['bloodFury', 'berserking', 'elunesLight'].includes(a.id))).toBe(true)
    }
    expect(ids(furyRotation({ 'warrior.fury.racial.enabled': false }, talents, noAura, { race: 'horde-orc' }))).not.toContain('bloodFury')
  })

  it('rows 4 and 5: Recklessness 1.5 s before the execute phase or at ≤ lastSec left, Bloodrage at rage ≤ maxRage', () => {
    const r = furyRotation({ 'warrior.fury.recklessness.lastSec': 40, 'warrior.fury.bloodrage.maxRage': 90 }, talents, noAura)
    expect(linesOf(r, 'recklessness')).toEqual([[executeWithin(1500)], [timeLeftAtMost(40000)]])
    expect(linesOf(furyRotation({}, talents, noAura), 'recklessness')).toEqual([[executeWithin(1500)], [timeLeftAtMost(16000)]])
    expect(linesOf(furyRotation({ 'warrior.fury.recklessness.beforeExecuteSec': 5 }, talents, noAura), 'recklessness')[0]).toEqual([executeWithin(5000)])
    // Without the execute phase, or with Execute off, only the clock.
    expect(linesOf(furyRotation({}, talents, noAura, { executePhase: false }), 'recklessness')).toEqual([[timeLeftAtMost(16000)]])
    expect(linesOf(furyRotation({ 'warrior.fury.execute.enabled': false }, talents, noAura), 'recklessness')).toEqual([[timeLeftAtMost(16000)]])
    expect(linesOf(r, 'bloodrage')).toEqual([[{ code: COND.maxRage, a: 900, b: 0 }]])
    expect(linesOf(furyRotation({}, talents, noAura), 'bloodrage')).toEqual([[{ code: COND.maxRage, a: 1100, b: 0 }]])
    const off = furyRotation({ 'warrior.fury.recklessness.enabled': false, 'warrior.fury.bloodrage.enabled': false }, talents, noAura)
    expect(ids(off)).not.toContain('recklessness')
    expect(ids(off)).not.toContain('bloodrage')
  })

  it('row 13: Berserker Rage GCD-safe for Bloodthirst and Whirlwind at rage ≤ 120, only with Improved Berserker Rage', () => {
    const r = furyRotation({}, talents, noAura)
    const bt = at(r, 'bloodthirst')
    const ww = at(r, 'whirlwind')
    const safe = (mask: number) => ({ code: COND.gcdSafe, a: mask, b: 1500 })
    const limit = { code: COND.maxRage, a: 1200, b: 0 }
    expect(linesOf(r, 'berserkerRage')).toEqual([
      [{ code: COND.executePhase, a: 0, b: 0 }, safe((1 << bt) | (1 << ww)), limit],
      // In the phase: Bloodthirst counts only while row 6 uses it; Whirlwind only with whirlwindInExecute.
      [{ code: COND.executePhase, a: 1, b: 0 }, { code: COND.apAtLeast, a: 2220, b: 0 }, safe(1 << bt), limit],
      [{ code: COND.executePhase, a: 1, b: 0 }, { code: COND.apBelow, a: 2220, b: 0 }, limit],
    ])
    expect(r.abilities[at(r, 'berserkerRage')].rageTenths).toBe(100)
    const withWw = furyRotation({ 'warrior.fury.execute.whirlwindInExecute': true }, talents, noAura)
    expect(linesOf(withWw, 'berserkerRage')[2]).toContainEqual(safe(1 << at(withWw, 'whirlwind')))
    const noExec = furyRotation({ 'warrior.fury.execute.enabled': false }, talents, noAura)
    expect(linesOf(noExec, 'berserkerRage')).toEqual([[safe((1 << at(noExec, 'bloodthirst')) | (1 << at(noExec, 'whirlwind'))), limit]])
    // The talent gates it, as the option's help says.
    expect(ids(furyRotation({}, new Map([['Bloodthirst', 1]]), noAura))).not.toContain('berserkerRage')
    expect(ids(furyRotation({ 'warrior.fury.berserkerRage.enabled': false }, talents, noAura))).not.toContain('berserkerRage')
  })
})

describe('furyRotation: Battle Shout, the pre-pull, trinkets and consumables (warrior.md §5.2 rows 0, 1, 3, 16 and 17)', () => {
  const noAura = () => -1
  const talents = new Map([
    ['Bloodthirst', 1],
    ['Death Wish', 1],
  ])
  type Rot = ReturnType<typeof furyRotation>
  const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
  const linesOf = (r: Rot, id: string) => r.rotation.filter((e) => r.abilities[e.ability].id === id).map((e) => e.conditions)
  const at = (r: Rot, id: string) => r.abilities.findIndex((a) => a.id === id)
  const analyzer = ITEM_EFFECTS[272438].use!

  it('row 1: Battle Shout first, refreshed at refreshBelowSec left; it replaces the Buffs switch’s static version', () => {
    const r = furyRotation({}, talents, noAura)
    expect(ids(r)[0]).toBe('battleShout')
    expect(linesOf(r, 'battleShout')).toEqual([[{ code: COND.abilityAuraRefresh, a: at(r, 'battleShout'), b: 3000 }]])
    expect(linesOf(furyRotation({ 'warrior.fury.battleShout.refreshBelowSec': 5 }, talents, noAura), 'battleShout')[0][0].b).toBe(5000)
    expect(furyMaintainedBuffs({})).toEqual(['battleShout'])
    const off = { 'warrior.fury.battleShout.enabled': false }
    expect(furyMaintainedBuffs(off)).toEqual([])
    expect(furyRotation(off, talents, noAura).abilities.map((a) => a.id)).not.toContain('battleShout')
  })

  it('row 0: Battle Shout at −3 s (only with the upkeep on) and Bloodrage at −1 s, in time order; Charge off', () => {
    const r = furyRotation({}, talents, noAura)
    expect(r.prepull).toEqual({
      casts: [
        { ability: at(r, 'battleShout'), atMs: PREPULL_SHOUT_MS },
        { ability: at(r, 'bloodrage'), atMs: PREPULL_BLOODRAGE_MS },
      ],
      chargeTenths: 0,
      keepTenths: -1,
    })
    expect([PREPULL_SHOUT_MS, PREPULL_BLOODRAGE_MS]).toEqual([-3000, -1000])
    const noShout = furyRotation({ 'warrior.fury.battleShout.enabled': false }, talents, noAura)
    expect(noShout.prepull.casts.map((c) => noShout.abilities[c.ability].id)).toEqual(['bloodrage'])
    // Pre-pull Bloodrage without the in-fight line: the ability is there, with no line.
    const preOnly = furyRotation({ 'warrior.fury.bloodrage.enabled': false }, talents, noAura)
    expect(linesOf(preOnly, 'bloodrage')).toEqual([])
    expect(preOnly.prepull.casts.map((c) => preOnly.abilities[c.ability].id)).toEqual(['battleShout', 'bloodrage'])
    // Charge: 15 + 3 per Improved Charge rank; the swap keeps 10 + 3 per Improved Tactical Mastery rank.
    const charge = furyRotation({ 'warrior.fury.prepull.charge': true }, new Map([['Improved Charge', 2], ['Improved Tactical Mastery', 5]]), noAura)
    expect(charge.prepull).toMatchObject({ chargeTenths: 210, keepTenths: 250 })
    expect(furyRotation({ 'warrior.fury.prepull.charge': true }, new Map(), noAura).prepull).toMatchObject({ chargeTenths: 150, keepTenths: 100 })
  })

  it('row 3: on-use trinkets synced with Death Wish like the racial, on cooldown without it', () => {
    const r = furyRotation({}, talents, noAura, { race: 'horde-orc', items: [analyzer] })
    const dw = at(r, 'deathWish')
    expect(ids(r).slice(0, 10)).toEqual([
      'battleShout',
      ...['deathWish', 'deathWish', 'deathWish'],
      ...['bloodFury', 'bloodFury', 'bloodFury'],
      ...['weaknessAnalyzer', 'weaknessAnalyzer', 'weaknessAnalyzer'],
    ])
    expect(linesOf(r, 'weaknessAnalyzer')).toEqual([
      [{ code: COND.abilityAuraUp, a: dw, b: 0 }],
      [{ code: COND.cooldownAtLeast, a: dw, b: 90000 }],
      [
        { code: COND.timeLeftAtMost, a: 180000, b: 0 },
        { code: COND.timeLeftAtLeast, a: 30000 + 90000, b: 0 },
      ],
    ])
    expect(linesOf(furyRotation({ 'warrior.fury.cooldowns.syncWithDeathWish': false }, talents, noAura, { items: [analyzer] }), 'weaknessAnalyzer')).toEqual([[]])
    expect(linesOf(furyRotation({}, new Map(), noAura, { items: [analyzer] }), 'weaknessAnalyzer')).toEqual([[]])
    expect(ids(furyRotation({ 'warrior.fury.trinkets.enabled': false }, talents, noAura, { items: [analyzer] }))).not.toContain('weaknessAnalyzer')
    expect(r.abilities[at(r, 'weaknessAnalyzer')].gcdMs).toBe(0)
  })

  it('row 16: the potion once: with a Recklessness that came by its clock; in the execute phase at rage ≤ maxRage, or in its last 2 s at ≤ 55; without one, with Recklessness in the last 20 s; only when selected', () => {
    const consumables = [MIGHTY_RAGE_POTION]
    // With Boundless Rage 3/3, the default build's 130 cap.
    const cap130 = new Map([...talents, ['Boundless Rage', 3]])
    const r = furyRotation({}, cap130, noAura, { consumables })
    const potion = r.abilities[at(r, 'mightyRagePotion')]
    expect(potion).toMatchObject({ usesPerFight: 1, gcdMs: 0, rageTenths: 450, rageSpreadTenths: 300, cooldownMs: 120000 })
    const inExec = { code: COND.executePhase, a: 1, b: 0 }
    const upTo = (tenths: number) => ({ code: COND.maxRage, a: tenths, b: 0 })
    const last = (ms: number) => ({ code: COND.timeLeftAtMost, a: ms, b: 0 })
    const afterReck = (rot: Rot) => [last(20000), { code: COND.cooldownAtLeast, a: at(rot, 'recklessness'), b: 1 }, upTo(550)]
    const notWithin = (ms: number) => ({ code: COND.executeNotWithin, a: ms, b: 0 })
    // First, with Recklessness if it came by its clock: the phase was still more than its
    // beforeExecuteSec (1.5 s) away then. Otherwise at 0 rage in the phase: once an Execute has
    // emptied the bar; or, not drunk by the phase's last 2 s, at up to the build's cap minus 75 (55 at 130).
    expect(linesOf(r, 'mightyRagePotion')).toEqual([
      [...afterReck(r), notWithin(1500)],
      [inExec, upTo(0)],
      [inExec, last(2000), upTo(550)],
    ])
    const reck5 = furyRotation({ 'warrior.fury.recklessness.beforeExecuteSec': 5 }, cap130, noAura, { consumables })
    expect(linesOf(reck5, 'mightyRagePotion')[0]).toEqual([...afterReck(reck5), notWithin(5000)])
    expect(linesOf(furyRotation({ 'warrior.fury.ragePotion.maxRage': 20 }, cap130, noAura, { consumables }), 'mightyRagePotion')[1]).toEqual([inExec, upTo(200)])
    // Without Recklessness, only the phase's lines.
    expect(linesOf(furyRotation({ 'warrior.fury.recklessness.enabled': false }, cap130, noAura, { consumables }), 'mightyRagePotion')).toEqual([
      [inExec, upTo(0)],
      [inExec, last(2000), upTo(550)],
    ])
    // Without the phase, or with Execute off: in the last 20 s at up to 55, whatever maxRage says,
    // once Recklessness has been used; without Recklessness, in the last 20 s.
    for (const rot of [
      furyRotation({ 'warrior.fury.ragePotion.maxRage': 40 }, cap130, noAura, { consumables, executePhase: false }),
      furyRotation({ 'warrior.fury.execute.enabled': false }, cap130, noAura, { consumables }),
    ])
      expect(linesOf(rot, 'mightyRagePotion')).toEqual([afterReck(rot)])
    const noReck = furyRotation({ 'warrior.fury.recklessness.enabled': false }, cap130, noAura, { consumables, executePhase: false })
    expect(linesOf(noReck, 'mightyRagePotion')).toEqual([[last(20000), upTo(550)]])
    // The limit follows the build's cap: 100 + 10 per Boundless Rage rank, minus 75.
    const twoRanks = furyRotation({}, new Map([...talents, ['Boundless Rage', 2]]), noAura, { consumables })
    expect(linesOf(twoRanks, 'mightyRagePotion')[2]).toEqual([inExec, last(2000), upTo(450)])
    expect(linesOf(furyRotation({}, talents, noAura, { consumables }), 'mightyRagePotion')[2]).toEqual([inExec, last(2000), upTo(250)])
    expect(ids(furyRotation({}, talents, noAura))).not.toContain('mightyRagePotion')
    expect(ids(furyRotation({ 'warrior.fury.ragePotion.enabled': false }, talents, noAura, { consumables }))).not.toContain('mightyRagePotion')
    // Known either way, so it isn't listed as "not simulated".
    expect(furyRotation({ 'warrior.fury.ragePotion.enabled': false }, talents, noAura, { consumables }).onUse).toEqual(['mightyRagePotion'])
  })

  it('row 17: Juju Flurry on cooldown, last, when selected', () => {
    const r = furyRotation({}, talents, noAura, { consumables: [MIGHTY_RAGE_POTION, JUJU_FLURRY], items: [analyzer] })
    expect(ids(r).slice(-2)).toEqual(['mightyRagePotion', 'jujuFlurry'])
    expect(linesOf(r, 'jujuFlurry')).toEqual([[]])
    expect(r.onUse.sort()).toEqual(['jujuFlurry', 'mightyRagePotion', 'weaknessAnalyzer'])
    expect(ids(furyRotation({ 'warrior.fury.jujuFlurry.enabled': false }, talents, noAura, { consumables: [JUJU_FLURRY] }))).not.toContain('jujuFlurry')
  })
})

describe('furyRotation: the Overpower dance and Slam (warrior.md §5.2 rows 10 and 15)', () => {
  const noAura = () => -1
  const talents = new Map([
    ['Bloodthirst', 1],
    ['Improved Berserker Rage', 2],
  ])
  type Rot = ReturnType<typeof furyRotation>
  const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
  const linesOf = (r: Rot, id: string) => r.rotation.filter((e) => r.abilities[e.ability].id === id)
  const at = (r: Rot, id: string) => r.abilities.findIndex((a) => a.id === id)
  const safe = (mask: number) => ({ code: COND.gcdSafe, a: mask, b: 1500 })
  const inExec = { code: COND.executePhase, a: 1, b: 0 }
  const notExec = { code: COND.executePhase, a: 0, b: 0 }

  it('the Overpower dance is on by default (M2.5b) and Slam off; without the dance, no dance lines or procs', () => {
    const defaults = Object.fromEntries(FURY_OPTIONS.map((o) => [o.id, o.default]))
    expect(defaults).toMatchObject({ 'warrior.fury.overpower.enabled': true, 'warrior.fury.overpower.maxRage': 40, 'warrior.fury.slam.enabled': false })
    const r = furyRotation({}, talents, noAura)
    expect(r.abilities.map((a) => a.id)).toContain('overpower')
    expect(r.abilities.map((a) => a.id)).not.toContain('slam')
    expect(r.procs).toEqual(overpowerWindowProcs(talents))
    const off = furyRotation({ 'warrior.fury.overpower.enabled': false }, talents, noAura)
    expect(off.abilities.map((a) => a.id)).not.toContain('overpower')
    expect(off.procs).toEqual([])
    expect(off.rotation.every((e) => e.danceTo === undefined)).toBe(true)
  })

  it('row 10: an Overpower dance to Battle Stance after Whirlwind, GCD-safe for Bloodthirst and Whirlwind at rage ≤ maxRage, in both phases as row 13', () => {
    const r = furyRotation({}, talents, noAura)
    const [bt, ww, op] = [at(r, 'bloodthirst'), at(r, 'whirlwind'), at(r, 'overpower')]
    const limit = { code: COND.maxRage, a: 400, b: 0 }
    expect(ids(r).slice(ids(r).lastIndexOf('whirlwind') + 1, ids(r).indexOf('heroicStrike'))).toEqual(['overpower', 'overpower', 'overpower'])
    const lines = linesOf(r, 'overpower')
    expect(lines.map((e) => e.danceTo)).toEqual([STANCE.battle, STANCE.battle, STANCE.battle])
    expect(lines.map((e) => e.conditions)).toEqual([
      [notExec, safe((1 << bt) | (1 << ww)), limit],
      [inExec, { code: COND.apAtLeast, a: 2220, b: 0 }, safe(1 << bt), limit],
      [inExec, { code: COND.apBelow, a: 2220, b: 0 }, limit],
    ])
    expect(r.abilities[op]).toMatchObject({ costTenths: 50, stances: STANCE.battle, unavoidable: true, window: OVERPOWER_WINDOW })
    // Its window's opener comes with it: a dodge; Bloodthrill too when talented (the plan drops it without Rend).
    expect(r.procs).toEqual(overpowerWindowProcs(talents))
    expect(furyRotation({ 'warrior.fury.overpower.enabled': true }, new Map([['Bloodthrill', 5]]), noAura).procs.map((p) => p.id)).toEqual(['overpowerDodge', 'bloodthrill'])
    // Without the execute phase, one line; the rage limit follows the setting.
    const noExec = furyRotation({ 'warrior.fury.overpower.enabled': true, 'warrior.fury.execute.enabled': false, 'warrior.fury.overpower.maxRage': 20 }, talents, noAura)
    expect(linesOf(noExec, 'overpower').map((e) => e.conditions)).toEqual([[safe((1 << at(noExec, 'bloodthirst')) | (1 << at(noExec, 'whirlwind'))), { code: COND.maxRage, a: 200, b: 0 }]])
  })

  it('row 15: Slam outside the execute phase, GCD-safe for Bloodthirst and Whirlwind, after Berserker Rage; without Improved Slam its cast stops the swings', () => {
    const r = furyRotation({ 'warrior.fury.slam.enabled': true }, talents, noAura)
    expect(ids(r).slice(-2)).toEqual(['berserkerRage', 'slam'])
    expect(linesOf(r, 'slam').map((e) => e.conditions)).toEqual([[notExec, safe((1 << at(r, 'bloodthirst')) | (1 << at(r, 'whirlwind')))]])
    expect(r.abilities[at(r, 'slam')]).toMatchObject({ castMs: 1500, gcdMs: 1500, castStopsSwings: true, costTenths: 150 })
    const noExec = furyRotation({ 'warrior.fury.slam.enabled': true, 'warrior.fury.execute.enabled': false }, talents, noAura)
    expect(linesOf(noExec, 'slam').map((e) => e.conditions)).toEqual([[safe((1 << at(noExec, 'bloodthirst')) | (1 << at(noExec, 'whirlwind')))]])
  })

  it('the Charge opener’s swap keeps the profile’s amount: 5 per Tactical Mastery rank in `classicEra`', () => {
    const values = { 'warrior.fury.prepull.charge': true }
    const itm = new Map([['Improved Tactical Mastery', 3]])
    expect(furyRotation(values, itm, noAura, { profile: FOREVER }).prepull.keepTenths).toBe(190)
    expect(furyRotation(values, itm, noAura, { profile: CLASSIC_ERA }).prepull.keepTenths).toBe(150)
  })
})
