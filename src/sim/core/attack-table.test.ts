// Worked examples from docs/mechanics/combat-tables.md#worked-examples.
import { describe, expect, it } from 'vitest'
import { CLASSIC_ERA, FOREVER, type RulesProfile } from '../rules/profiles'
import {
  averageResist,
  bossOutcomeShares,
  bossSlices,
  type DefenderInputs,
  glanceRange,
  type MeleeInputs,
  meleeChances,
  probabilities,
  specialSlices,
  spellMiss,
  thresholds,
  whiteSlices,
} from './attack-table'

const base: MeleeInputs = {
  attackerLevel: 60,
  targetLevel: 63,
  skill: 300,
  hit: 6,
  sheetCrit: 25,
  auraCrit: 10,
  expertise: 0,
  front: false,
  canDodge: true,
  canParry: true,
  canBlock: true,
}

/** Truncated white-table probabilities [miss, dodge, parry, glance, block, crit, hit]. */
function white(profile: RulesProfile, i: MeleeInputs, dw: boolean) {
  return probabilities(thresholds(whiteSlices(meleeChances(profile, i, true, dw)), new Float64Array(6)), 6)
}

/** One-roll special probabilities [miss, dodge, parry, glance(0), block, crit, hit]. */
function special(profile: RulesProfile, i: MeleeInputs) {
  return probabilities(thresholds(specialSlices(meleeChances(profile, i, false, false)), new Float64Array(6)), 6)
}

const close = (actual: number[], expected: number[]) =>
  expected.forEach((e, k) => expect(actual[k], `outcome ${k}`).toBeCloseTo(e, 6))

describe('WE-1: Fury white swing, dual wield, behind, 300 skill, 6% hit, 25% crit', () => {
  it('forever', () => close(white(FOREVER, base, true), [21, 6.5, 0, 40, 0, 22.6, 9.9]))
  it('classicEra', () => close(white(CLASSIC_ERA, base, true), [22, 6.5, 0, 40, 0, 20.2, 11.3]))
})

describe('WE-2: yellow specials, same character', () => {
  it('weapon-damage special, one roll', () => {
    close(special(FOREVER, base), [2, 6.5, 0, 0, 0, 22.6, 68.9])
    close(special(CLASSIC_ERA, base), [3, 6.5, 0, 0, 0, 20.2, 70.3])
  })

  it('melee spell (Bloodthirst), two rolls', () => {
    for (const [profile, lands, critOfAll] of [
      [FOREVER, 91.5, 20.679],
      [CLASSIC_ERA, 90.5, 18.281],
    ] as const) {
      const ch = meleeChances(profile, base, false, false)
      const land = 100 - ch.miss - ch.dodge - ch.parry
      expect(land).toBeCloseTo(lands, 6)
      expect((land * ch.crit) / 100).toBeCloseTo(critOfAll, 3)
    }
  })
})

describe('WE-3: white crit cap and truncation (forever, 2H, 8% hit, 58% crit)', () => {
  const i = { ...base, hit: 8, sheetCrit: 58 }
  it('squeezes white crit to 53.5% and hit to 0', () => close(white(FOREVER, i, false), [0, 6.5, 0, 40, 0, 53.5, 0]))
  it('leaves specials a 93.5% crit cap', () => {
    const p = special(FOREVER, i)
    expect(p[5]).toBeCloseTo(55.6, 6)
    expect(100 - p[0] - p[1]).toBeCloseTo(93.5, 6)
  })
})

describe('WE-4: from the front, 1H + shield, 5% hit, 10% crit, 1.2% expertise', () => {
  const i = { ...base, front: true, hit: 5, sheetCrit: 10, expertise: 1.2 }
  it('forever', () => close(white(FOREVER, i, false), [3, 5.3, 15.3, 40, 5, 7.6, 23.8]))
  it('classicEra (no expertise)', () => close(white(CLASSIC_ERA, { ...i, expertise: 0 }, false), [4, 6.5, 14, 40, 5, 5.2, 25.3]))
})

describe('WE-5: off hand while Heroic Strike is queued (DW, 6% hit)', () => {
  it('drops the dual-wield penalty only while queued', () => {
    expect(meleeChances(FOREVER, base, true, false).miss).toBeCloseTo(2, 6)
    expect(meleeChances(FOREVER, base, true, true).miss).toBeCloseTo(21, 6)
    expect(meleeChances(CLASSIC_ERA, base, true, false).miss).toBeCloseTo(3, 6)
    expect(meleeChances(CLASSIC_ERA, base, true, true).miss).toBeCloseTo(22, 6)
  })
})

describe('WE-6: weapon skill 305 vs 300, 2H, 0% hit, behind', () => {
  const at = (profile: RulesProfile, skill: number) => {
    const ch = meleeChances(profile, { ...base, skill, hit: 0, sheetCrit: 10, auraCrit: 10 }, true, false)
    const [low, high] = glanceRange(profile, 63, skill)
    return { miss: ch.miss, dodge: ch.dodge, glanceMean: (low + high) / 2, suppression: 10 - ch.crit }
  }
  it.each([
    [FOREVER, 300, 8.0, 6.5, 0.75, 2.4],
    [FOREVER, 305, 7.8, 6.3, 0.85, 2.2],
    [CLASSIC_ERA, 300, 8.0, 6.5, 0.65, 4.8],
    [CLASSIC_ERA, 305, 6.0, 6.0, 0.85, 4.8],
  ])('%s.id at %i skill', (profile, skill, miss, dodge, glance, suppression) => {
    const r = at(profile, skill)
    expect(r.miss).toBeCloseTo(miss, 6)
    expect(r.dodge).toBeCloseTo(dodge, 6)
    expect(r.glanceMean).toBeCloseTo(glance, 6)
    expect(r.suppression).toBeCloseTo(suppression, 6)
  })
})

describe('WE-7: glancing damage range on a 1,000-damage hit', () => {
  it('draws uniform(650, 850) in forever and uniform(550, 750) in classicEra at 300', () => {
    const [fl, fh] = glanceRange(FOREVER, 63, 300)
    const [cl, ch] = glanceRange(CLASSIC_ERA, 63, 300)
    expect([fl * 1000, fh * 1000]).toEqual([expect.closeTo(650, 6), expect.closeTo(850, 6)])
    expect([cl * 1000, ch * 1000]).toEqual([expect.closeTo(550, 6), expect.closeTo(750, 6)])
  })
  it('draws uniform(910, 990) at 308 in both profiles', () => {
    for (const p of [FOREVER, CLASSIC_ERA]) {
      const [l, h] = glanceRange(p, 63, 308)
      expect(l * 1000).toBeCloseTo(910, 6)
      expect(h * 1000).toBeCloseTo(990, 6)
    }
  })
})

describe('WE-8 and WE-9: boss → warrior tank', () => {
  const tank = { playerLevel: 60, bossLevel: 63, defense: 440, dodge: 12, parry: 14, block: 20, canCrush: true, front: true }
  const boss = (i: typeof tank) => probabilities(thresholds(bossSlices(i), new Float64Array(6)), 6)

  it('WE-8: 440 defense', () => close(boss(tank), [10, 11.4, 13.4, 19.4, 0, 15, 30.8]))
  it('WE-8: 300 defense', () => {
    const p = boss({ ...tank, defense: 300 })
    expect(p[0]).toBeCloseTo(4.4, 6)
    expect(p[4]).toBeCloseTo(5.6, 6)
    expect(p[5]).toBeCloseTo(15, 6)
  })
  it('WE-9: uncrushable at 102.4% avoidance', () => close(boss({ ...tank, block: 66 }), [10, 11.4, 13.4, 65.2, 0, 0, 0]))
})

describe('boss → player edge cases (combat-tables §8)', () => {
  const tank: DefenderInputs = { playerLevel: 60, bossLevel: 63, defense: 440, dodge: 12, parry: 14, block: 20, canCrush: true, front: true }
  const shares = (i: DefenderInputs) => {
    const s = bossOutcomeShares(i)
    return [s.miss, s.dodge, s.parry, s.block, s.crit, s.crush, s.hit]
  }

  it('the shares are the truncated slices and add up to 100 (WE-8)', () => {
    close(shares(tank), [10, 11.4, 13.4, 19.4, 0, 15, 30.8])
    expect(shares({ ...tank, defense: 300 }).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 12)
  })

  it('WE-12: facing away, a player can’t dodge, parry or block; miss, crit and crushing stay', () => {
    close(shares({ ...tank, front: false }), [10, 0, 0, 0, 0, 15, 75])
    close(shares({ ...tank, defense: 300, front: false }), [4.4, 0, 0, 0, 5.6, 15, 75])
  })

  it('WE-13: below 300 defense, crushing rises by 2% a point and crit by 0.04% (290 defense)', () => {
    // The sheet's dodge, parry and block already carry the −0.4 of the missing 10 defense.
    close(shares({ ...tank, defense: 290, dodge: 0, parry: 0, block: 0 }), [4, 0, 0, 0, 6, 35, 55])
  })

  it('crit is 0 from 440 defense up, and never negative', () => {
    expect(bossOutcomeShares({ ...tank, defense: 440 }).crit).toBe(0)
    expect(bossOutcomeShares({ ...tank, defense: 500 }).crit).toBe(0)
    expect(bossOutcomeShares({ ...tank, defense: 439 }).crit).toBeCloseTo(0.04, 12)
  })

  it('truncates crushing blows first, then crits: 97% avoidance leaves crit 3, no crushing, no hits', () => {
    // 300 defense: miss 4.4, crit 5.6. Dodge 93.2 on the sheet is 92.6 against the boss: 97 in all.
    close(shares({ ...tank, defense: 300, dodge: 93.2, parry: 0, block: 0 }), [4.4, 92.6, 0, 0, 3, 0, 0])
  })

  it('0% and 100% avoidance', () => {
    close(shares({ ...tank, defense: 300, dodge: 0, parry: 0, block: 0 }), [4.4, 0, 0, 0, 5.6, 15, 75])
    close(shares({ ...tank, defense: 300, dodge: 150, parry: 0, block: 0 }), [4.4, 95.6, 0, 0, 0, 0, 0])
  })

  it('crushing blows need an attacker 3 or more levels above, and the setting', () => {
    expect(bossOutcomeShares({ ...tank, bossLevel: 62 }).crush).toBe(0)
    expect(bossOutcomeShares({ ...tank, canCrush: false }).crush).toBe(0)
    // A level-60 attacker: 5% miss and crit at 300 defense, no skill gap on dodge, parry and block.
    close(shares({ ...tank, bossLevel: 60, defense: 300 }), [5, 12, 14, 20, 5, 0, 44])
  })

  it('no shield or no weapon: a 0 sheet block or parry is 0 against the boss, never negative', () => {
    const s = bossOutcomeShares({ ...tank, parry: 0, block: 0 })
    expect([s.parry, s.block]).toEqual([0, 0])
  })
})

describe('WE-10 and WE-11: spells', () => {
  it('WE-10: spell miss with 3% and 17% hit', () => {
    expect(spellMiss(FOREVER, 60, 63, 3)).toBeCloseTo(14, 6)
    expect(spellMiss(CLASSIC_ERA, 60, 63, 3)).toBeCloseTo(14, 6)
    expect(spellMiss(FOREVER, 60, 63, 17)).toBe(0)
    expect(spellMiss(CLASSIC_ERA, 60, 63, 17)).toBe(1)
  })
  it('WE-11: average partial resist of a fire proc at R = 24', () => {
    const avg = averageResist(24, 60)
    expect(avg).toBeCloseTo(0.06, 10)
    expect(40 * (1 - avg)).toBeCloseTo(37.6, 10)
    expect(0.17 + 0.83 * avg).toBeCloseTo(0.2198, 10)
  })
})

describe('edge cases (combat-tables implementation notes)', () => {
  it('clamps excess hit at 0 before truncation, so it never eats into dodge', () => {
    const p = white(FOREVER, { ...base, hit: 40 }, false)
    expect(p[0]).toBe(0)
    expect(p[1]).toBeCloseTo(6.5, 6)
  })
  it('gives 0% and 100%-ish crit tables sensible slices', () => {
    const none = white(FOREVER, { ...base, sheetCrit: 0, auraCrit: 0 }, false)
    expect(none[5]).toBe(0)
    const all = white(FOREVER, { ...base, sheetCrit: 100 }, false)
    expect(all.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9)
    expect(all[6]).toBe(0)
  })
  it('takes no parry or block from behind, and both from the front unless the boss can’t', () => {
    expect(meleeChances(FOREVER, base, true, false).parry).toBe(0)
    const front = meleeChances(FOREVER, { ...base, front: true }, true, false)
    expect(front.parry).toBeCloseTo(16.5, 6)
    expect(front.block).toBe(5)
    const noFlags = meleeChances(FOREVER, { ...base, front: true, canParry: false, canBlock: false, canDodge: false }, true, false)
    expect([noFlags.dodge, noFlags.parry, noFlags.block]).toEqual([0, 0, 0])
  })
  it('applies the 1.8% aura suppression only up to the aura crit you have', () => {
    const ch = meleeChances(FOREVER, { ...base, sheetCrit: 4, auraCrit: 0 }, true, false)
    expect(ch.crit).toBeCloseTo(3.4, 6)
  })
})
