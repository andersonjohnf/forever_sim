// Worked examples from docs/mechanics/character-stats.md#worked-examples, run through the
// pipeline directly. Examples 2 and 3 use the doc's labelled synthetic fixture for base values
// (pipeline arithmetic only); everything else is the documented real value.
import { describe, expect, it } from 'vitest'
import { CLASSIC_ERA, FOREVER } from '../rules/profiles'
import { BASE_PLACEHOLDERS, CLASS_BASE } from './base-stats'
import { deriveStats, StatBlock } from './stat-block'

const opts = { profile: FOREVER, applyUnmeasured: true, level: 60 }

function warrior(race = 'alliance-human') {
  const b = new StatBlock()
  const row = CLASS_BASE.warrior.attributes(race)!
  b.baseStr = row.str
  b.baseAgi = row.agi
  b.baseSta = row.sta
  b.baseInt = row.int
  b.baseSpi = row.spi
  b.baseAp = CLASS_BASE.warrior.baseAp!
  b.critPerAgi = CLASS_BASE.warrior.critPerAgi
  b.spiMult = 1.05 // The Human Spirit
  // Base health is D24's placeholder (base-stats.ts BASE_PLACEHOLDERS); base dodge 0 is [C].
  b.baseHealth = BASE_PLACEHOLDERS.warrior.baseHealth!
  b.baseDodge = CLASS_BASE.warrior.baseDodge!
  return b
}

describe('Example 1: naked Human warrior', () => {
  it('derives the documented sheet', () => {
    const d = deriveStats(warrior(), opts)
    expect([d.strength, d.agility, d.stamina, d.spirit]).toEqual([120, 80, 110, 47])
    expect(d.attackPower).toBe(400)
    expect(d.crit).toBeCloseTo(4, 9)
    expect(d.hit).toBe(0)
    expect(d.armor).toBe(160)
    // Max HP = 1,689 (the placeholder, OQ-2) + 20 + 90 × 10.
    expect(d.health).toBe(2609)
    expect(d.dodge).toBeCloseTo(4, 9)
    expect(d.defense).toBe(300)
  })

  it('1b: plus Blessing of Kings', () => {
    const b = warrior()
    b.strMult *= 1.1
    b.agiMult *= 1.1
    b.staMult *= 1.1
    b.intMult *= 1.1
    b.spiMult *= 1.1
    const d = deriveStats(b, opts)
    expect([d.strength, d.agility, d.stamina]).toEqual([132, 88, 121])
    expect(d.attackPower).toBe(424)
    expect(d.crit).toBeCloseTo(4.4, 9)
    expect(d.armor).toBe(176)
    expect(d.health).toBe(2719)
  })
})

describe('Example 2: Tauren druid in Cat Form (synthetic fixture)', () => {
  it('runs the pipeline arithmetic', () => {
    const b = new StatBlock()
    // Synthetic fixture: tests pipeline arithmetic only, not real base stats.
    b.baseStr = b.baseAgi = b.baseSta = b.baseInt = b.baseSpi = 100
    b.baseHealth = 1000
    // Real values: druid −20 AP [?] (a D24 placeholder), Cat Form +120 and Predatory Strikes +90 [F], Cat AP per Agi 1 [F].
    b.baseAp = BASE_PLACEHOLDERS.druid.baseAp!
    b.apPerAgi = 1
    b.ap = 120 + 90
    b.critPerAgi = CLASS_BASE.druid.critPerAgi
    b.crit = 6 // Sharpened Claws 2/2
    b.hit = 1 // Tauren Endurance
    b.healthMult = 1.05 // Tauren Endurance
    b.strMult = 1.1 // Heart of the Wild (Cat)
    b.intMult = 1.1 // Heart of the Wild
    b.hasMana = true
    b.baseMana = CLASS_BASE.druid.baseMana!
    const d = deriveStats(b, opts)
    expect([d.strength, d.agility, d.intellect]).toEqual([110, 100, 110])
    expect(d.attackPower).toBe(510)
    expect(d.crit).toBeCloseTo(11, 9)
    expect(d.hit).toBe(1)
    expect(d.dodge).toBeCloseTo(5, 9)
    expect(d.mana).toBe(2614)
    expect(d.health).toBe(1911)
    expect(d.armor).toBe(200)
  })
})

describe('Example 3: geared Human Retribution paladin (synthetic fixture)', () => {
  function paladin() {
    const b = new StatBlock()
    // Synthetic fixture base values.
    b.baseStr = b.baseAgi = b.baseSta = b.baseInt = b.baseSpi = 100
    b.baseHealth = 1000
    // Real values: paladin slopes and base mana [F]; 160 base AP [?].
    b.baseAp = CLASS_BASE.paladin.baseAp!
    b.critPerAgi = CLASS_BASE.paladin.critPerAgi
    b.spellCritPerInt = CLASS_BASE.paladin.spellCritPerInt
    b.hasMana = true
    b.baseMana = CLASS_BASE.paladin.baseMana!
    // Gear totals.
    b.str += 120
    b.agi += 40
    b.sta += 110
    b.int += 60
    b.ap += 60
    b.hitRating += 10
    // Mark of the Wild r7 (Forever), Blessing of Might r7 (Forever).
    for (const k of ['str', 'agi', 'sta', 'int', 'spi'] as const) b[k] += 16
    b.bonusArmor += 385
    b.ap += 133
    // Kings, Human Spirit, Divine Strength.
    b.strMult = 1.1 * 1.1
    b.agiMult = b.staMult = b.intMult = 1.1
    b.spiMult = 1.05 * 1.1
    // Conviction 5/5, Precision 3/3; Sword Specialization is aura 290: melee and spell crit.
    b.crit += 5 + 2
    b.spellCrit += 2
    b.hit += 3
    b.spellHit += 3
    return b
  }

  it('with a Forever crit rating', () => {
    const b = paladin()
    b.critRating += 14
    const d = deriveStats(b, opts)
    expect([d.strength, d.agility, d.stamina, d.intellect, d.spirit]).toEqual([285, 171, 248, 193, 133])
    expect(d.attackPower).toBe(923)
    expect(d.crit).toBeCloseTo(16.6526, 4)
    expect(d.auraCrit).toBeCloseTo(8, 9)
    expect(d.hit).toBeCloseTo(4, 9)
    expect(d.spellHit).toBeCloseTo(4, 9)
    expect(d.spellCrit).toBeCloseTo(6.2231, 4)
    expect(d.mana).toBe(4127)
    expect(d.health).toBe(3300)
    expect(d.dodge).toBeCloseTo(8.55, 9)
    expect(d.armor).toBe(385 + 342)
  })

  it('3b: the same +1% crit from a Classic item', () => {
    const b = paladin()
    b.crit += 1
    const d = deriveStats(b, opts)
    expect(d.crit).toBeCloseTo(16.6526, 4)
    expect(d.spellCrit).toBeCloseTo(5.2231, 4)
  })
})

describe('ratings and the D12 switch', () => {
  it('converts the old ratings at the displayed ratios in both profiles', () => {
    for (const profile of [FOREVER, CLASSIC_ERA]) {
      const b = new StatBlock()
      b.critRating = 28
      b.hitRating = 20
      b.dodgeRating = 24
      b.parryRating = 15
      b.blockRating = 10
      b.defenseRating = 20
      b.canParry = b.canBlock = true
      const d = deriveStats(b, { profile, applyUnmeasured: true, level: 60 })
      expect(d.crit).toBeCloseTo(2, 9)
      expect(d.hit).toBeCloseTo(2, 9)
      expect(d.defense).toBe(320)
      expect(d.dodge).toBeCloseTo(2 + 0.8, 9)
      expect(d.parry).toBeCloseTo(1 + 0.8, 9)
      expect(d.block).toBeCloseTo(2 + 0.8, 9)
    }
  })

  it('applies haste rating, expertise and armor penetration only when switched on, and never in classicEra', () => {
    const b = new StatBlock()
    b.hasteRating = 50
    b.expertiseRating = 20
    b.armorPen = 50
    b.haste = 1.3
    const on = deriveStats(b, { profile: FOREVER, applyUnmeasured: true, level: 60 })
    expect(on.hasteMult).toBeCloseTo(1.3 * 1.05, 12) // damage-and-timing WE-5
    expect(on.expertise).toBeCloseTo(2, 9)
    expect(on.armorPen).toBe(50)
    for (const off of [
      deriveStats(b, { profile: FOREVER, applyUnmeasured: false, level: 60 }),
      deriveStats(b, { profile: CLASSIC_ERA, applyUnmeasured: true, level: 60 }),
    ]) {
      expect(off.hasteMult).toBeCloseTo(1.3, 12)
      expect(off.expertise).toBe(0)
      expect(off.armorPen).toBe(0)
    }
  })

  it('floors attributes once after multipliers, with an epsilon for exact products', () => {
    const b = new StatBlock()
    b.baseStr = 1820
    b.strMult = 1.05
    expect(deriveStats(b, opts).strength).toBe(1911)
    // buffs doc worked example 6: (200 + 53 + 16) × 1.10 = 295.9 before rounding.
    const s = new StatBlock()
    s.baseStr = 200
    s.str = 53 + 16
    s.strMult = 1.1
    expect(deriveStats(s, opts).strength).toBe(295)
  })
})

describe('Example 4: a naked Human warrior’s defensive sheet (character-stats, D24 placeholders)', () => {
  it('holding a one-hander and a shield: dodge 4%, parry 5%, block 5%, block value 6, no crit reduction', () => {
    const b = warrior()
    b.canParry = true
    b.baseParry = CLASS_BASE.warrior.baseParry
    b.canBlock = true
    b.baseBlock = CLASS_BASE.warrior.baseBlock
    const d = deriveStats(b, opts)
    expect(d.health).toBe(2609)
    expect(d.dodge).toBeCloseTo(4, 9)
    expect(d.parry).toBe(5)
    expect(d.block).toBe(5)
    expect(d.blockValue).toBe(6)
    expect(d.defense).toBe(300)
    expect(d.critReduction).toBe(0)
  })

  it('defense moves dodge, parry, block and the crit reduction by 0.04% a point, both ways', () => {
    const b = warrior()
    b.canParry = true
    b.canBlock = true
    b.defense = 140 // 440 defense: the raid-boss crit cap
    const d = deriveStats(b, opts)
    expect(d.critReduction).toBeCloseTo(5.6, 9)
    expect(d.parry).toBeCloseTo(5.6, 9)
    b.defense = -10
    const low = deriveStats(b, opts)
    expect(low.critReduction).toBeCloseTo(-0.4, 9)
    expect(low.block).toBeCloseTo(-0.4, 9)
  })
})
