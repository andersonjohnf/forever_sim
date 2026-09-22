// Worked examples from docs/mechanics/damage-and-timing.md, rage.md, threat.md and encounter.md
// that are pure formulas. Examples that need the engine or the plan live next to those.
import { describe, expect, it } from 'vitest'
import { CLASSIC_ERA, FOREVER } from '../rules/profiles'
import {
  AGGRO_THRESHOLD,
  armorReduction,
  averageWeaponDamage,
  damageTakenRage,
  GCD_MS,
  NORMALIZED_SPEED,
  OFF_HAND_DAMAGE,
  parryHasteRemaining,
  ppmChance,
  rageConversion,
  slowedSwingSec,
  swingMs,
  threat,
  THREAT_PER_RAGE,
  toTenths,
  whiteHitRage,
} from './formulas'

describe('damage-and-timing.md worked examples', () => {
  it('WE-1: armor mitigation at boss armor 3,731', () => {
    const f = (armor: number, p = FOREVER) => armorReduction(armor, 60, p)
    expect(f(3731) * 100).toBeCloseTo(40.418, 3)
    expect(f(1481) * 100).toBeCloseTo(21.215, 3)
    expect(f(976) * 100).toBeCloseTo(15.071, 3)
    expect(f(471) * 100).toBeCloseTo(7.888, 3)
    expect(f(-129) * 100).toBeCloseTo(-2.402, 3)
    expect(f(336, CLASSIC_ERA) * 100).toBeCloseTo(5.757, 3)
    expect(f(-264, CLASSIC_ERA)).toBe(0)
    expect(f(16500)).toBeCloseTo(0.75, 10)
    expect(f(40000)).toBe(0.75)
    // Tank vs a level-63 boss.
    expect(armorReduction(10000, 63, FOREVER) * 100).toBeCloseTo(63.472, 3)
    expect(armorReduction(17265, 63, FOREVER)).toBeCloseTo(0.75, 10)
  })

  it('WE-2: white 2H swing (150–230, 3.60, 1500 AP, ×1.05)', () => {
    const base = averageWeaponDamage(150, 230, 0, 1500, 3.6)
    expect(base).toBeCloseTo(575.714, 3)
    const modded = base * 1.05
    expect(modded).toBeCloseTo(604.5, 3)
    const forever = modded * (1 - armorReduction(471, 60, FOREVER))
    expect(forever).toBeCloseTo(556.816, 3)
    expect(forever * 2).toBeCloseTo(1113.633, 2)
    expect(forever * 0.75).toBeCloseTo(417.612, 3)
    const classic = modded * (1 - armorReduction(336, 60, CLASSIC_ERA))
    expect(classic).toBeCloseTo(569.697, 3)
    expect(classic * 2).toBeCloseTo(1139.393, 2)
    expect(classic * 0.65).toBeCloseTo(370.303, 3)
  })

  it('WE-3: normalization', () => {
    const ww = averageWeaponDamage(150, 230, 0, 1500, NORMALIZED_SPEED.twoHand)
    expect(ww).toBeCloseTo(543.571, 3)
    expect(ww + 160).toBeCloseTo(703.571, 3)
    expect(averageWeaponDamage(150, 230, 0, 1500, 3.6) + 157).toBeCloseTo(732.714, 3)
  })

  it('WE-4: off hand', () => {
    expect(averageWeaponDamage(100, 100, 0, 1500, 2.0) * OFF_HAND_DAMAGE).toBeCloseTo(157.143, 3)
  })

  it('WE-5: haste stacking', () => {
    expect(swingMs(3.6, 1.3 * 1.05)).toBe(2637)
    expect(swingMs(3.6, 1.3)).toBe(2769)
  })

  it('WE-6: parry haste on a 2.0 s boss swing', () => {
    expect(parryHasteRemaining(1600, 2000)).toBeCloseTo(800, 9)
    expect(parryHasteRemaining(1200, 2000)).toBeCloseTo(400, 9)
    expect(parryHasteRemaining(1000, 2000)).toBeCloseTo(400, 9)
    expect(parryHasteRemaining(300, 2000)).toBeCloseTo(300, 9)
  })

  it('WE-7: PPM', () => {
    expect(ppmChance(1, 3.6)).toBeCloseTo(0.06, 10)
    expect(ppmChance(1, 2.6)).toBeCloseTo(0.04333, 5)
    expect(ppmChance(6, 2.7)).toBeCloseTo(0.27, 10)
  })

  it('WE-10: GCD is 1.5 s for warrior abilities', () => {
    expect(GCD_MS).toBe(1500)
  })
})

describe('rage.md worked examples', () => {
  const r = (outcome: Parameters<typeof whiteHitRage>[1], ...rest: [boolean, boolean, number, number, number]) =>
    whiteHitRage(FOREVER, outcome, ...rest)
  const classic = (outcome: Parameters<typeof whiteHitRage>[1], dealt: number, wouldBe = 0) =>
    whiteHitRage(CLASSIC_ERA, outcome, false, false, 2.6, dealt, wouldBe)

  it('R1: rageConversion(60) = 230.6', () => expect(rageConversion(60)).toBeCloseTo(230.6, 3))
  it('R2–R5: Classic white rage', () => {
    expect(classic('hit', 600)).toBeCloseTo(19.514, 3)
    expect(classic('crit', 1200)).toBeCloseTo(39.029, 3)
    expect(classic('dodge', 0, 450)).toBeCloseTo(10.977, 3)
    expect(classic('miss', 0)).toBe(0)
  })
  it('R6–R9: Forever normalized white rage', () => {
    expect(toTenths(r('crit', false, false, 2.6, 500, 0))).toBe(91)
    expect(r('glance', false, true, 3.8, 300, 0)).toBeCloseTo(17.1, 9)
    const offHand = r('hit', true, false, 1.8, 200, 0)
    expect(offHand).toBeCloseTo(3.15, 9)
    // W23: Dual Wield Specialization 5/5 doubles it.
    expect(offHand * 2).toBeCloseTo(6.3, 9)
    expect(r('dodge', false, false, 2.6, 0, 500)).toBe(0)
    expect(r('parry', false, false, 2.6, 0, 500)).toBe(0)
  })
  it('R10–R12b: rage from damage taken', () => {
    expect(damageTakenRage('classic', 1000, 1000, 7000)).toBeCloseTo(10.841, 3)
    expect(damageTakenRage('forever', 1000, 1000, 7000)).toBeCloseTo(6.505, 3)
    expect(damageTakenRage('foreverHp', 1000, 1000, 7000)).toBeCloseTo(1.429, 3)
    expect(damageTakenRage('foreverHpPreArmor', 1000, 2000, 7000)).toBeCloseTo(2.857, 3)
    expect(damageTakenRage('forever', 0, 5000, 7000)).toBe(0)
  })
  it('R23–R24: tank rage model per boss swing', () => {
    const taken = (model: 'classic' | 'forever') =>
      0.4 * damageTakenRage(model, 1200, 0, 0) + 0.25 * damageTakenRage(model, 1050, 0, 0)
    const block = 0.25 * 5 * 0.2 * 5 // Shield Specialization 5/5
    const avoid = (0.15 + 0.15) * 5 * 0.5 * 2 // Master of Defense 2/2
    expect(taken('classic')).toBeCloseTo(8.0497, 4)
    expect(block).toBeCloseTo(1.25, 9)
    expect(avoid).toBeCloseTo(1.5, 9)
    expect((taken('classic') + block + avoid) / 2).toBeCloseTo(5.3998, 4)
    expect(taken('forever')).toBeCloseTo(4.8298, 4)
    expect((taken('forever') + block + avoid) / 2).toBeCloseTo(3.7899, 4)
  })
  it('W22: Unbridled Wrath 5/5 expected rage per 100 landed white hits', () => {
    expect(100 * 0.6 * 1).toBe(60)
    expect(100 * 0.6 * 2).toBe(120)
  })
})

describe('threat.md worked examples (formula level)', () => {
  const defensive = 1.3 * 1.15
  it('T1–T3: Sunder Armor', () => {
    expect(threat(0, 1, 1013, defensive)).toBeCloseTo(1514.435, 3)
    expect(threat(0, 1, 261, 1.495)).toBeCloseTo(390.195, 3)
    expect(threat(0, 1, 1013, 1.3)).toBeCloseTo(1316.9, 3)
  })
  it('T4–T7: warrior abilities at ×1.495', () => {
    expect(threat(500, 1, 173, 1.495)).toBeCloseTo(1006.135, 3)
    expect(threat(150, 2.25, 270, 1.495)).toBeCloseTo(908.2125, 4)
    expect(threat(90, 2.5, 0, 1.495)).toBeCloseTo(336.375, 3)
    expect(threat(45, 1.5, 156, 1.495)).toBeCloseTo(334.1325, 4)
  })
  it('T8–T14: bear, paladin and DPS multipliers', () => {
    expect(threat(400, 1.75, 0, 1.3)).toBeCloseTo(910, 6)
    expect(threat(400, 1.75, 0, 1.45)).toBeCloseTo(1015, 6)
    expect(threat(221, 1.2, 0, 1.9)).toBeCloseTo(503.88, 6)
    expect(threat(130, 1.2, 0, 1.6)).toBeCloseTo(249.6, 6)
    expect(threat(130, 1.2, 0, 1.9)).toBeCloseTo(296.4, 6)
    expect(threat(250, 1.25, 0, 1.9)).toBeCloseTo(593.75, 6)
    expect(threat(300, 1, 0, 1)).toBe(300)
    expect(threat(1000, 1, 0, 0.71 * 0.7)).toBeCloseTo(497, 6)
  })
  it('T15–T16: power-gain threat is 5 per rage gained, split, no multipliers', () => {
    expect((10 * THREAT_PER_RAGE) / 2).toBe(25)
    expect(Math.min(5, 100 - 98) * THREAT_PER_RAGE).toBe(10)
  })
  it('T20–T21: enchant multipliers and aggro thresholds', () => {
    expect(threat(100, 1, 0, 1.3 * 1.02 * 0.98)).toBeCloseTo(129.948, 3)
    expect(10000 * AGGRO_THRESHOLD.melee).toBeCloseTo(11000, 6)
    expect(10000 * AGGRO_THRESHOLD.ranged).toBeCloseTo(13000, 6)
  })
})

describe('encounter.md worked examples (formula level)', () => {
  it('WE-1 and WE-2: fight length and execute timing', () => {
    const length = (L: number, v: number, u: number) => Math.round(L * (1 + v * (2 * u - 1)))
    expect(length(180000, 0.1, 0.25)).toBe(171000)
    expect(Math.floor(180000 * (1 - 0.2))).toBe(144000)
    expect(Math.floor(171000 * (1 - 0.2))).toBe(136800)
  })
  it('WE-3: a boss swing on a 10,000-armor tank', () => {
    const hit = 5000 * (1 - armorReduction(10000, 63, FOREVER))
    expect(hit).toBeCloseTo(1826.4, 1)
    expect(hit * 2).toBeCloseTo(3652.8, 1)
    expect(hit * 1.5).toBeCloseTo(2739.6, 1)
    expect(hit - 150).toBeCloseTo(1676.4, 1)
  })
  it('WE-4 and WE-5: Demoralizing Shout and Thunder Clap', () => {
    expect(5000 - (196 / 14) * 2.0).toBeCloseTo(4972, 9)
    expect(5000 - (140 / 14) * 2.0).toBeCloseTo(4980, 9)
    expect(slowedSwingSec(2.0, 0.2)).toBeCloseTo(2.4, 9)
  })
})
