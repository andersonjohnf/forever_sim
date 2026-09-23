// The warrior ability rows and talent modifiers against the Forever client data, the cost tables
// and Execute worked examples (W10, W11, W20, W21), and the Fury priority list built from its
// settings (docs/classes/warrior.md §2.3, §2.5, §3.1, §5.2; docs/data/client.md).
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import type { ClientSpells } from '@/data/client/types'
import { TALENT_DATA } from '../../defaults'
import { COND, STANCE, STANCE_ANY } from '../../plan/types'
import { talentRanksByName } from '../index'
import { type AbilityDef, BLOODTHIRST, EXECUTE, executeBreakEvenAp, executeDamage, HAMSTRING, HEROIC_STRIKE, WHIRLWIND } from './abilities'
import { FURY_OPTIONS, furyRotation } from './fury'
import { abilityCritMultiplier, costReduction, FOCUSED_RAGE, IMPALE, rageCost, withTalents } from './modifiers'

const spells = (spellsJson as unknown as ClientSpells).spells

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

describe('warrior abilities match src/data/client/spells.json', () => {
  for (const ability of ABILITIES) {
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
      const dummy = spell.effects.find((e) => e.effect === EFFECT.dummy)
      if (weapon) {
        expect(ability.flatDamage, 'weapon damage bonus').toBe(weapon.effectBasePointsF ?? 0)
      } else if (ability.damagePerExtraRage > 0) {
        // Execute: the DUMMY effect is its base damage; the 15 per rage is server-side (warrior.md §3.1).
        expect(ability.flatDamage, 'Execute base damage').toBe(dummy?.effectBasePointsF)
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
  })
})

describe('talent class masks match the client data (warrior.md §2.3, §2.5)', () => {
  it('Focused Rage covers exactly its listed abilities, not Battle Shout, Shield Block, Berserker Rage or Bloodrage', () => {
    for (const id of Object.keys(SPELL_ID)) expect(FOCUSED_RAGE.has(id), id).toBe(inMask(id, TALENT_MASK.focusedRage))
    for (const id of ['battleShout', 'shieldBlock', 'berserkerRage', 'bloodrage']) expect(FOCUSED_RAGE.has(id)).toBe(false)
  })

  it('Impale covers every attack in its list and every simulated ability', () => {
    for (const id of IMPALE) expect(inMask(id, TALENT_MASK.impale), id).toBe(true)
    for (const a of ABILITIES) expect(IMPALE.has(a.id)).toBe(true)
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

  it('W20: Protection default build (Focused Rage 3/3, Improved Sunder Armor 2/3)', () => {
    expect(
      costs('05-05-552001233201210531', ['sunderArmor', 'shieldSlam', 'revenge', 'heroicStrike', 'thunderClap', 'demoralizingShout', 'battleShout', 'shieldBlock', 'deathWish']),
    ).toEqual({ sunderArmor: 10, shieldSlam: 17, revenge: 2, heroicStrike: 12, thunderClap: 17, demoralizingShout: 7, battleShout: 10, shieldBlock: 10, deathWish: 7 })
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
        const parent = FURY_OPTIONS.find((o) => o.id === option.dependsOn)
        expect(parent?.kind, `${option.id} depends on a toggle`).toBe('toggle')
      }
    }
  })

  it('uses the §5.2 defaults: Execute on, Bloodthirst over Execute from 2220 AP, Heroic Strike at 42, Hamstring at 60', () => {
    const defaults = Object.fromEntries(FURY_OPTIONS.map((o) => [o.id, o.default]))
    expect(defaults).toMatchObject({
      'warrior.fury.execute.enabled': true,
      'warrior.fury.execute.minExtraRage': 0,
      'warrior.fury.execute.btOverExecuteAp': 2220,
      'warrior.fury.execute.whirlwindInExecute': false,
      'warrior.fury.execute.heroicStrikeInExecute': false,
      'warrior.fury.bloodthirst.enabled': true,
      'warrior.fury.whirlwind.enabled': true,
      'warrior.fury.whirlwind.reserve': 0,
      'warrior.fury.whirlwind.btCdMinSec': 1.5,
      'warrior.fury.heroicStrike.enabled': true,
      'warrior.fury.heroicStrike.minRage': 42,
      'warrior.fury.heroicStrike.unqueue': false,
      'warrior.fury.heroicStrike.unqueueBelow': 20,
      'warrior.fury.hamstring.enabled': true,
      'warrior.fury.hamstring.minRage': 60,
      'warrior.fury.hamstring.onlyWhenFlurryDown': false,
    })
  })
})

describe('furyRotation', () => {
  const withBt = new Map([['Bloodthirst', 1]])
  const noAura = () => -1
  const inExec = { code: COND.executePhase, a: 1, b: 0 }
  const notExec = { code: COND.executePhase, a: 0, b: 0 }
  const noExecute = { 'warrior.fury.execute.enabled': false }

  it('builds rows 6–9, 11 and 12 in priority order with the default conditions', () => {
    const { abilities, rotation } = furyRotation({}, withBt, noAura)
    expect(abilities.map((a) => a.id)).toEqual(['bloodthirst', 'execute', 'whirlwind', 'heroicStrike', 'hamstring'])
    expect(rotation.map((e) => e.ability)).toEqual([0, 1, 0, 2, 3, 4])
    expect(rotation.map((e) => e.conditions)).toEqual([
      [inExec, { code: COND.apAtLeast, a: 2220, b: 0 }], // 6: Bloodthirst in the execute phase
      [{ code: COND.minRage, a: 150, b: 0 }], // 7: Execute
      [notExec], // 8: Bloodthirst
      [notExec, { code: COND.minRage, a: 250, b: 0 }, { code: COND.cooldownAtLeast, a: 0, b: 1500 }], // 9: Whirlwind
      [notExec, { code: COND.minRage, a: 420, b: 0 }], // 11: Heroic Strike
      [notExec, { code: COND.minRage, a: 600, b: 0 }, { code: COND.gcdSafe, a: 0b101, b: 1500 }], // 12: Hamstring
    ])
    expect(rotation[4].unqueueBelowTenths).toBe(0)
  })

  it('without Execute, keeps the M2.1 list with no phase conditions', () => {
    const { abilities, rotation } = furyRotation(noExecute, withBt, noAura)
    expect(abilities.map((a) => a.id)).toEqual(['bloodthirst', 'whirlwind', 'heroicStrike', 'hamstring'])
    expect(rotation.map((e) => e.ability)).toEqual([0, 1, 2, 3])
    expect(rotation[0].conditions).toEqual([])
    expect(rotation[1].conditions).toEqual([
      { code: COND.minRage, a: 250, b: 0 },
      { code: COND.cooldownAtLeast, a: 0, b: 1500 },
    ])
    expect(rotation[2].conditions).toEqual([{ code: COND.minRage, a: 420, b: 0 }])
    expect(rotation[3].conditions).toEqual([
      { code: COND.minRage, a: 600, b: 0 },
      { code: COND.gcdSafe, a: 0b11, b: 1500 },
    ])
  })

  it('applies the settings: reserve, thresholds, unqueue and the Flurry condition', () => {
    const { rotation } = furyRotation(
      {
        ...noExecute,
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
  })

  it('applies the execute settings: extra rage, the Bloodthirst AP, and the talented Execute cost', () => {
    const talents = new Map([
      ['Bloodthirst', 1],
      ['Improved Execute', 2],
    ])
    const { abilities, rotation } = furyRotation({ 'warrior.fury.execute.minExtraRage': 20, 'warrior.fury.execute.btOverExecuteAp': 2434 }, talents, noAura)
    expect(abilities[1].costTenths).toBe(100)
    expect(rotation[0].conditions).toContainEqual({ code: COND.apAtLeast, a: 2434, b: 0 })
    expect(rotation[1].conditions).toEqual([{ code: COND.minRage, a: 300, b: 0 }])
  })

  it('keeps Heroic Strike in the execute phase if asked', () => {
    const { rotation, abilities } = furyRotation({ 'warrior.fury.execute.heroicStrikeInExecute': true }, withBt, noAura)
    const hs = abilities.findIndex((a) => a.id === 'heroicStrike')
    expect(rotation.find((e) => e.ability === hs)!.conditions).toEqual([{ code: COND.minRage, a: 420, b: 0 }])
  })

  it('keeps Whirlwind in the execute phase if asked, waiting on Bloodthirst only while it’s used there', () => {
    const { rotation, abilities } = furyRotation({ 'warrior.fury.execute.whirlwindInExecute': true }, withBt, noAura)
    const ww = abilities.findIndex((a) => a.id === 'whirlwind')
    const minRage = { code: COND.minRage, a: 250, b: 0 }
    const btWait = { code: COND.cooldownAtLeast, a: 0, b: 1500 }
    expect(rotation.filter((e) => e.ability === ww).map((e) => e.conditions)).toEqual([
      [notExec, minRage, btWait],
      [inExec, { code: COND.apAtLeast, a: 2220, b: 0 }, minRage, btWait],
      [inExec, { code: COND.apBelow, a: 2220, b: 0 }, minRage],
    ])
    // Without Bloodthirst there is nothing to wait on: one line for both phases.
    const noBt = furyRotation({ 'warrior.fury.execute.whirlwindInExecute': true }, new Map(), noAura)
    expect(noBt.rotation.filter((e) => noBt.abilities[e.ability].id === 'whirlwind').map((e) => e.conditions)).toEqual([[minRage]])
  })

  it('leaves out disabled abilities, and Bloodthirst without the talent', () => {
    const noTalent = furyRotation(noExecute, new Map(), noAura)
    expect(noTalent.abilities.map((a) => a.id)).toEqual(['whirlwind', 'heroicStrike', 'hamstring'])
    // Whirlwind then has no Bloodthirst condition, and Hamstring is GCD-safe for Whirlwind only.
    expect(noTalent.rotation[0].conditions).toEqual([{ code: COND.minRage, a: 250, b: 0 }])
    expect(noTalent.rotation[2].conditions).toContainEqual({ code: COND.gcdSafe, a: 0b1, b: 1500 })
    // Execute doesn't need the Bloodthirst talent.
    expect(furyRotation({}, new Map(), noAura).abilities.map((a) => a.id)).toEqual(['execute', 'whirlwind', 'heroicStrike', 'hamstring'])

    const onlyHs = furyRotation(
      { ...noExecute, 'warrior.fury.bloodthirst.enabled': false, 'warrior.fury.whirlwind.enabled': false, 'warrior.fury.hamstring.enabled': false },
      withBt,
      noAura,
    )
    expect(onlyHs.abilities.map((a) => a.id)).toEqual(['heroicStrike'])
  })
})
