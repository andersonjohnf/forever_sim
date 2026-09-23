// The warrior ability rows against the Forever client data, and the Fury priority list built
// from its settings (docs/classes/warrior.md §3.1, §5.2; docs/data/client.md).
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import type { ClientSpells } from '@/data/client/types'
import { COND } from '../../plan/types'
import { type AbilityDef, BLOODTHIRST, HAMSTRING, HEROIC_STRIKE, WHIRLWIND } from './abilities'
import { FURY_OPTIONS, furyRotation } from './fury'

const spells = (spellsJson as unknown as ClientSpells).spells

/** SpellEffectName codes (docs/data/client.md, src/data/client/types.ts). */
const EFFECT = { schoolDamage: 2, dummy: 3, weaponDamageNoSchool: 17, weaponPercent: 31, weaponDamage: 58, normalized: 121 }
const WEAPON_EFFECTS = [EFFECT.weaponDamageNoSchool, EFFECT.weaponPercent, EFFECT.weaponDamage, EFFECT.normalized]
const RAGE = 1

describe('warrior abilities match src/data/client/spells.json', () => {
  const rows: [AbilityDef, number][] = [
    [BLOODTHIRST, 23894],
    [WHIRLWIND, 1680],
    [HEROIC_STRIKE, 25286],
    [HAMSTRING, 7373],
  ]
  for (const [ability, id] of rows) {
    it(`${ability.name} (${id})`, () => {
      const spell = spells[String(id)]
      expect(spell.name).toBe(ability.name)
      const power = spell.power?.find((p) => (p.powerType ?? 0) === RAGE)
      expect(power?.manaCost, 'rage cost in tenths').toBe(ability.costTenths)
      expect(spell.cooldowns?.categoryRecoveryTime ?? spell.cooldowns?.recoveryTime ?? 0, 'cooldown').toBe(ability.cooldownMs)
      expect(spell.cooldowns?.startRecoveryTime ?? 0, 'GCD').toBe(ability.gcdMs)
      expect(spell.categories?.defenseType, 'melee defense type').toBe(2)
      const weapon = spell.effects.find((e) => WEAPON_EFFECTS.includes(e.effect))
      expect(ability.weaponPercent > 0, 'weapon-based').toBe(weapon !== undefined)
      expect(ability.normalized, 'normalized (effect 121)').toBe(weapon?.effect === EFFECT.normalized)
      if (weapon) {
        expect(ability.flatDamage, 'weapon damage bonus').toBe(weapon.effectBasePointsF ?? 0)
      } else {
        const damage = spell.effects.find((e) => e.effect === EFFECT.schoolDamage)
        expect(ability.flatDamage, 'school damage').toBe(damage?.effectBasePointsF)
        // Forever puts AP scaling in a DUMMY effect (docs/data/client.md "AP coefficients").
        const dummy = spell.effects.find((e) => e.effect === EFFECT.dummy)
        expect(ability.apCoefficient, 'AP coefficient').toBeCloseTo((dummy?.effectBasePointsF ?? 0) / 100, 12)
      }
    })
  }

  it('on-next-swing abilities have no GCD; the rest use the 1.5 s GCD (warrior.md §2.2)', () => {
    expect(HEROIC_STRIKE.kind).toBe('onNextSwing')
    expect(HEROIC_STRIKE.gcdMs).toBe(0)
    for (const a of [BLOODTHIRST, WHIRLWIND, HAMSTRING]) expect(a.gcdMs).toBe(1500)
  })

  it('refunds 80% on a miss, dodge or parry except Whirlwind (rage.md#rage-refunds-on-avoided-abilities)', () => {
    expect([BLOODTHIRST, WHIRLWIND, HEROIC_STRIKE, HAMSTRING].map((a) => a.refundShare)).toEqual([0.8, 0, 0.8, 0.8])
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

  it('uses the §5.2 defaults: Heroic Strike at 42, Hamstring at 60, Whirlwind after 1.5 s of Bloodthirst cooldown', () => {
    const defaults = Object.fromEntries(FURY_OPTIONS.map((o) => [o.id, o.default]))
    expect(defaults).toMatchObject({
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

  it('builds Bloodthirst, Whirlwind, Heroic Strike, Hamstring in priority order with the default conditions', () => {
    const { abilities, rotation } = furyRotation({}, withBt, noAura)
    expect(abilities.map((a) => a.id)).toEqual(['bloodthirst', 'whirlwind', 'heroicStrike', 'hamstring'])
    expect(rotation.map((e) => e.ability)).toEqual([0, 1, 2, 3])
    expect(rotation[0].conditions).toEqual([])
    expect(rotation[1].conditions).toEqual([
      { code: COND.minRage, a: 250, b: 0 },
      { code: COND.cooldownAtLeast, a: 0, b: 1500 },
    ])
    expect(rotation[2].conditions).toEqual([{ code: COND.minRage, a: 420, b: 0 }])
    expect(rotation[2].unqueueBelowTenths).toBe(0)
    expect(rotation[3].conditions).toEqual([
      { code: COND.minRage, a: 600, b: 0 },
      { code: COND.gcdSafe, a: 0b11, b: 1500 },
    ])
  })

  it('applies the settings: reserve, thresholds, unqueue and the Flurry condition', () => {
    const { rotation } = furyRotation(
      {
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

  it('leaves out disabled abilities, and Bloodthirst without the talent', () => {
    const noTalent = furyRotation({}, new Map(), noAura)
    expect(noTalent.abilities.map((a) => a.id)).toEqual(['whirlwind', 'heroicStrike', 'hamstring'])
    // Whirlwind then has no Bloodthirst condition, and Hamstring is GCD-safe for Whirlwind only.
    expect(noTalent.rotation[0].conditions).toEqual([{ code: COND.minRage, a: 250, b: 0 }])
    expect(noTalent.rotation[2].conditions).toContainEqual({ code: COND.gcdSafe, a: 0b1, b: 1500 })

    const onlyHs = furyRotation(
      { 'warrior.fury.bloodthirst.enabled': false, 'warrior.fury.whirlwind.enabled': false, 'warrior.fury.hamstring.enabled': false },
      withBt,
      noAura,
    )
    expect(onlyHs.abilities.map((a) => a.id)).toEqual(['heroicStrike'])
  })
})
