// The plan builder and computeSheet against the docs' worked examples: character-stats
// Example 1, warrior W8/W16/W24/W25, threat T3/T20, buffs examples 1–5, encounter WE-4/WE-5.
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, encodeTalentCode } from '@/data/talents/types'
import { meleeChances } from '../core/attack-table'
import { defaultConfig as todaysDefaultConfig, TALENT_DATA } from '../defaults'
import { withPopularTalents } from '../classes/warrior/popular-builds'
import { presetBuffIds } from '../effects/presets'
import { Sim } from '../engine/sim'
import { rotationOff } from '../engine/test-helpers'
import { computeSheet, normalizeConfig } from '../index'
import { CLASSIC_ERA, FOREVER } from '../rules/profiles'
import { SPEC_IDS, SPEC_META } from '../specs'
import type { SimConfig, SpecId } from '../types'
import itemJson from '@/data/items/pre-bis.json'
import raceJson from '@/data/races/races.json'
import { racesForClass, type RaceData } from '@/data/races/types'
import type { ItemData } from '@/data/items/types'
import { revengeDamageText, unbridledWrathText } from './assumptions'
import { buildPlan, setOf } from './build'
import { STANCE, STANCE_ANY, TRIGGER } from './types'

/** Today's default setup with the popular warrior builds, the defaults until W4, which these tests were written
 * for (popular-builds.ts; warrior.md §6.1). */
const defaultConfig = (...args: Parameters<typeof todaysDefaultConfig>) => withPopularTalents(todaysDefaultConfig(...args))

/** A bare config: no gear, no talents, no buffs, and no Battle Shout of Arms's own (warrior.md §5.3 row 1). */
function bare(spec: SpecId = 'warrior-arms', patch: Partial<SimConfig> = {}): SimConfig {
  const d = defaultConfig(spec)
  // No Battle Shout of its own (Arms), and no Protection rotation: the Buffs tab's buffs and debuffs apply.
  const rotation: SimConfig['rotation'] =
    spec === 'warrior-arms' ? { 'warrior.arms.battleShout.enabled': false } : spec === 'warrior-protection' ? rotationOff(spec) : {}
  return { ...d, race: 'alliance-human', talents: '', gear: {}, buffs: { raid: d.buffs.raid, enabled: [] }, rotation, ...patch }
}

const withRules = (c: SimConfig, profile: 'forever' | 'classicEra'): SimConfig => ({ ...c, rules: { ...c.rules, profile } })
const ITEMS = new Map((itemJson as unknown as ItemData).items.map((i) => [i.id, i]))

describe('character-stats Example 1 through computeSheet', () => {
  it('naked Human warrior (Battle Stance: Arms)', () => {
    const s = computeSheet(bare())!
    expect([s.strength, s.agility, s.stamina, s.spirit]).toEqual([120, 80, 110, 47])
    expect(s.attackPower).toBe(400)
    expect(s.critPct).toBeCloseTo(4, 9)
    expect(s.hitPct).toBe(0)
    expect(s.armor).toBe(160)
    // Base health 1,689 is D24's Classic-based placeholder (OQ-2): 1689 + 20 + 90 × 10.
    expect(s.health).toBe(2609)
    expect(s.weaponSkill).toEqual({ mainHand: 300, offHand: null })
    expect(s.mana).toBeNull()
    // Nothing left out; base health is a placeholder (no weapon to parry with, no shield).
    expect(s.unknown).toEqual([])
    expect(s.placeholders).toEqual(['base health'])
    // Dodge: base dodge 0% [C] + 80 / 20.
    expect(s.dodgePct).toBeCloseTo(4, 9)
    expect(s.critReductionPct).toBe(0)
  })

  it('against a level-63 boss: forever 3.40%, classicEra 1.00% crit (no aura crit, no 1.8%)', () => {
    const table = (profile: typeof FOREVER) =>
      meleeChances(
        profile,
        { attackerLevel: 60, targetLevel: 63, skill: 300, hit: 0, sheetCrit: 4, auraCrit: 0, expertise: 0, front: false, canDodge: true, canParry: true, canBlock: true },
        true,
        false,
      )
    expect(table(FOREVER).crit).toBeCloseTo(3.4, 9)
    expect(table(CLASSIC_ERA).crit).toBeCloseTo(1.0, 9)
    expect(table(FOREVER).miss).toBe(8)
  })

  it('1b: plus Blessing of Kings', () => {
    const s = computeSheet(bare('warrior-arms', { buffs: { raid: ['paladin'], enabled: ['blessingOfKings'] } }))!
    expect([s.strength, s.agility, s.stamina]).toEqual([132, 88, 121])
    expect(s.attackPower).toBe(424)
    expect(s.critPct).toBeCloseTo(4.4, 9)
    expect(s.armor).toBe(176)
    expect(s.health).toBe(1689 + 1030)
  })

  it('1c: holding a one-handed sword (Sword Specialization, aura crit)', () => {
    // Arbiter's Blade: a one-handed sword with no Strength, Agility or crit.
    const config = bare('warrior-arms', { gear: { mainHand: { itemId: 11784 } } })
    const s = computeSheet(config)!
    expect(s.critPct).toBeCloseTo(6, 9)
    for (const [profile, expected] of [
      ['forever', 3.6],
      ['classicEra', 1.2],
    ] as const) {
      const sim = new Sim(buildPlan(withRules(config, profile)).plan)
      const t = sim.inspect().whiteThresholds[0]
      // Crit slice = threshold 5 − threshold 4.
      expect(t[5] - t[4]).toBeCloseTo(expected, 9)
    }
  })
})

describe('character-stats Example 4 and the tank’s sheet (combat-tables §8, D24)', () => {
  // Arbiter's Blade (a one-handed sword: +8 Sta, +5 Int, no avoidance) and Sacred Protector (a
  // Forever shield: +15 Sta, +10 Int, no block value in the client).
  const gear: SimConfig['gear'] = { mainHand: { itemId: 11784 }, offHand: { itemId: 16998 } }

  it('a naked Human warrior with a one-hander and a shield: dodge 4, parry 5, block 5, and the boss’s table', () => {
    const { sheet, assumptions } = buildPlan(bare('warrior-protection', { gear }))
    // Health: 1,689 (D24 placeholder) + 20 + (133 − 20) × 10.
    expect(sheet.health).toBe(2839)
    expect(sheet.dodgePct).toBeCloseTo(4, 9)
    expect([sheet.parryPct, sheet.blockPct, sheet.defense, sheet.critReductionPct]).toEqual([5, 5, 300, 0])
    // No block value on a Forever shield: floor(120 Str / 20) only.
    expect(sheet.blockValue).toBe(6)
    const t = sheet.bossTable!
    const shares = [t.miss, t.dodge, t.parry, t.block, t.crit, t.crush, t.hit]
    expect(shares).toEqual([4.4, 3.4, 4.4, 4.4, 5.6, 15, 62.8].map((x) => expect.closeTo(x, 9)))
    expect(sheet.placeholders).toEqual(['base health', 'base parry', 'base block'])
    const ids = assumptions.map((a) => a.id)
    expect(ids).toContain('shieldBlockValue')
    expect(ids).not.toContain('classicShieldBlockValue')
  })

  it('lists avoidance placeholders for a tank only, on the sheet and in the assumptions alike (D24, OQ-5)', () => {
    const stated = (spec: SpecId) => {
      const { sheet, assumptions } = buildPlan(bare(spec, { gear }))
      const note = assumptions.find((a) => a.id === 'baseStatPlaceholders')!
      return { sheet: sheet.placeholders, note: note.text, rows: sheet.blockValue > 0 }
    }
    // Protection: base parry and block 5% in both lists.
    const prot = stated('warrior-protection')
    expect(prot.sheet).toEqual(['base health', 'base parry', 'base block'])
    expect(prot.note).toMatch(/: base health 1,689, which rage from damage taken divides by; base parry 5%; base block 5%\.$/)
    // Arms with the same one-hander and shield: the sheet shows its defensive rows (it has block
    // value), but the boss never attacks it, so neither list names its avoidance.
    const arms = stated('warrior-arms')
    expect(arms.rows).toBe(true)
    expect(arms.sheet).toEqual(['base health'])
    expect(arms.note).toMatch(/: base health 1,689\.$/)
  })

  it('a Classic Era fallback shield counts its Classic block value, flagged; a Forever one has none (items.md)', () => {
    const classic = buildPlan(bare('warrior-protection', { gear: { mainHand: { itemId: 11784 }, offHand: { itemId: 12602 } } }))
    // Draconian Deflector: classicShieldBlockValue 40, + floor(120 / 20).
    expect(classic.sheet.blockValue).toBe(46)
    const note = classic.assumptions.find((a) => a.id === 'classicShieldBlockValue')!
    expect(note.text).toMatch(/Draconian Deflector, 40 block value\.$/)
    expect(classic.assumptions.map((a) => a.id)).not.toContain('shieldBlockValue')
    // Not a tank, or no shield: no shield note, and no block value without a shield.
    expect(buildPlan(bare('warrior-arms', { gear: { mainHand: { itemId: 11784 }, offHand: { itemId: 12602 } } })).sheet.blockValue).toBe(46)
    expect(buildPlan(bare('warrior-protection', { gear: { mainHand: { itemId: 11784 } } })).sheet.blockValue).toBe(0)
  })

  it('a tank faces the boss: the plan’s boss swings come from the front', () => {
    expect(buildPlan(defaultConfig('warrior-protection')).plan.fight.bossSwing!.front).toBe(true)
  })

  it('DPS specs have no boss table', () => {
    expect(buildPlan(defaultConfig('warrior-fury')).sheet.bossTable).toBeNull()
  })
})

describe('warrior worked examples on the plan', () => {
  const fury = (patch: Partial<SimConfig> = {}) =>
    bare('warrior-fury', {
      // Dark Iron Destroyer (axe) and Hedgecutter (axe); Dual Wield Specialization 5/5 via the popular build.
      gear: { mainHand: { itemId: 17016 }, offHand: { itemId: 18498 } },
      ...patch,
    })

  it('W8: the off hand deals 0.5 × (1 + 0.25) with Dual Wield Specialization 5/5', () => {
    const { plan } = buildPlan(fury({ talents: defaultConfig('warrior-fury').talents }))
    expect(plan.weapons[1]!.handMult).toBeCloseTo(0.625, 12)
    expect(plan.weapons[1]!.rageMult).toBeCloseTo(2, 12)
    const bareOff = buildPlan(fury()).plan.weapons[1]!
    expect(bareOff.handMult).toBe(0.5)
  })

  it('W24: off-hand white miss with 5% hit and DWS 5/5 (forever 12%, classicEra 13%; main hand 22% / 23%; 0% queued)', () => {
    // Two Hit Rating items would muddy this; add 5% hit directly as a Classic-form item stat isn't possible,
    // so use Precision-free Fury talents plus Devilsaur Leggings + Gauntlets (+2% set hit, 28 crit rating)
    // and Battleborn Armbraces (+1% hit), Brigam Girdle (+1%), Satyr's Bow (+1%): 5% hit.
    const gear = {
      mainHand: { itemId: 17016 },
      offHand: { itemId: 18498 },
      legs: { itemId: 15062 },
      hands: { itemId: 15063 },
      wrist: { itemId: 12936 },
      waist: { itemId: 13142 },
      ranged: { itemId: 18323 },
    }
    const talents = defaultConfig('warrior-fury').talents
    for (const [profile, off, main] of [
      ['forever', 12, 22],
      ['classicEra', 13, 23],
    ] as const) {
      const bundle = buildPlan(withRules(fury({ gear, talents }), profile))
      expect(bundle.sheet.hitPct).toBeCloseTo(5, 9)
      const state = new Sim(bundle.plan).inspect()
      const t = state.whiteThresholds
      expect(t[0][0]).toBeCloseTo(main, 9)
      expect(t[1][0]).toBeCloseTo(off, 9)
      // With Heroic Strike queued the off hand uses the single-wield miss chance: max(0, 8 − 14 or 15) = 0.
      expect(state.offHandQueuedThresholds[0]).toBe(0)
      // Main-hand specials never take the dual-wield penalty (combat-tables §3): 19 below the white miss.
      expect(state.specialThresholds[0]).toBeCloseTo(main - 19, 9)
    }
  })

  it('W16 and T3: Defensive Stance with Defiance 3/3 is ×1.495 with a shield, ×1.3 without', () => {
    const prot = defaultConfig('warrior-protection')
    const shield = buildPlan(bare('warrior-protection', { talents: prot.talents, gear: { mainHand: { itemId: 15806 }, offHand: { itemId: 12602 } } }))
    expect(shield.plan.threatMult).toBeCloseTo(1.495, 12)
    const twoHand = buildPlan(bare('warrior-protection', { talents: prot.talents, gear: { mainHand: { itemId: 12784 } } }))
    expect(twoHand.plan.threatMult).toBeCloseTo(1.3, 12)
    expect(buildPlan(bare('warrior-fury')).plan.threatMult).toBeCloseTo(0.8, 12)
  })

  it('T20: Defensive Stance with the threat and subtlety enchants, no Defiance', () => {
    const config = bare('warrior-protection', {
      gear: { hands: { itemId: 15063, enchantId: 'gloveThreat' }, back: { itemId: 13340, enchantId: 'cloakSubtlety' } },
    })
    expect(buildPlan(config).plan.threatMult).toBeCloseTo(1.3 * 1.02 * 0.98, 12)
  })

  it('W25: Weaponmaster 5/5 with a mace ignores 15% of the remaining 471 armor', () => {
    const arms = defaultConfig('warrior-arms')
    const config = bare('warrior-arms', {
      talents: arms.talents,
      gear: { mainHand: { itemId: 22348 } }, // Doomulus Prime, a two-handed mace
      buffs: { raid: arms.buffs.raid, enabled: ['sunderArmor', 'faerieFire', 'curseOfRecklessness'] },
    })
    const { plan } = buildPlan(config)
    expect(plan.fight.targetArmor).toBe(471)
    expect(plan.weapons[0]!.armorPenPct).toBeCloseTo(0.15, 12)
    const armor = 471 * 0.85
    expect(armor).toBeCloseTo(400.35, 9)
    expect(new Sim(plan).inspect().armorFactor[0]).toBeCloseTo(1 - armor / (armor + 5500), 12)
  })
})

describe('buffs-debuffs-consumables worked examples on the plan', () => {
  const debuffs = (enabled: string[], profile: 'forever' | 'classicEra' = 'forever') =>
    buildPlan(withRules(bare('warrior-fury', { buffs: { raid: defaultConfig('warrior-fury').buffs.raid, enabled } }), profile)).plan

  it('1: Sunder ×5 + Faerie Fire + Curse of Recklessness, Forever → 471', () => {
    expect(debuffs(['sunderArmor', 'faerieFire', 'curseOfRecklessness']).fight.targetArmor).toBe(471)
  })
  it('2: the same set in Classic Era → 336', () => {
    expect(debuffs(['sunderArmor', 'faerieFire', 'curseOfRecklessness'], 'classicEra').fight.targetArmor).toBe(336)
  })
  it('3: below zero with Armor Shatter ×3, per profile', () => {
    const forever = debuffs(['sunderArmor', 'faerieFire', 'curseOfRecklessness', 'armorShatter'])
    expect(forever.fight.targetArmor).toBe(-24)
    const f = forever
    f.weapons[0] = { name: 'x', icon: 'x', min: 1, max: 1, speedSec: 2, twoHand: false, flatDamage: 0, handMult: 1, skill: 300, hitBonus: 0, critBonus: 0, armorPenPct: 0, rageMult: 1, glanceLow: 0.65, glanceHigh: 0.85, normalizedSpeed: 2.4 }
    expect(new Sim(f).inspect().armorFactor[0]).toBeCloseTo(1.00438, 5)
    const classic = debuffs(['sunderArmor', 'faerieFire', 'curseOfRecklessness', 'armorShatter'], 'classicEra')
    expect(classic.fight.targetArmor).toBe(-264)
    classic.weapons[0] = f.weapons[0]
    expect(new Sim(classic).inspect().armorFactor[0]).toBe(1)
  })
  it('4: Sunder and Expose Armor share one slot', () => {
    const d = defaultConfig('warrior-fury')
    const { config, warnings } = normalizeConfig({ ...d, buffs: { raid: d.buffs.raid, enabled: ['sunderArmor', 'exposeArmor'] } })
    expect(config.buffs.enabled).toEqual(['sunderArmor'])
    expect(warnings).toHaveLength(1)
    expect(buildPlan(config).plan.fight.targetArmor).toBe(3731 - 2250)
  })
  it('5: Battle Shout r6 + Blessing of Might r6 = 227 attack power (the trainers’ ranks, D36)', () => {
    // Another warrior's shout: the rotation's own upkeep is off (warrior.md §5.2 row 1).
    const rotation = { 'warrior.fury.battleShout.enabled': false }
    const base = computeSheet(bare('warrior-fury', { rotation }))!.attackPower
    const buffed = computeSheet(bare('warrior-fury', { rotation, buffs: { raid: ['warrior', 'paladin'], enabled: ['battleShout', 'blessingOfMight'] } }))!
    expect(buffed.attackPower - base).toBe(227)
  })
  it('7: a Windfury extra attack gets +246 attack power (Classic: +315)', () => {
    const wf = (profile: 'forever' | 'classicEra') =>
      buildPlan(withRules(bare('warrior-arms', { gear: { mainHand: { itemId: 12784 } }, buffs: { raid: ['shaman'], enabled: ['windfuryTotem'] } }), profile)).plan.procs.find(
        (p) => p.id === 'windfury',
      )!
    expect(wf('forever').a).toBe(246)
    expect((246 / 14) * 3.8).toBeCloseTo(66.8, 1)
    expect(wf('classicEra').a).toBe(315)
  })
  it('8: Crusader on a 3.6-speed weapon procs 6% per hit', () => {
    const { plan } = buildPlan(bare('warrior-arms', { gear: { mainHand: { itemId: 20669, enchantId: 'crusader' } } }))
    expect(plan.procs.find((p) => p.id === 'crusader')!.chance[0]).toBeCloseTo(0.06, 12)
  })
  it('9: the Blasted Lands buffs share a cooldown', () => {
    const d = defaultConfig('warrior-fury')
    const { config } = normalizeConfig({ ...d, buffs: { raid: d.buffs.raid, enabled: ['roids', 'groundScorpokAssay'] } })
    expect(config.buffs.enabled).toEqual(['roids'])
  })
})

describe('encounter worked examples on the plan', () => {
  const tank = (enabled: string[], profile: 'forever' | 'classicEra' = 'forever') => {
    const d = defaultConfig('warrior-protection')
    const config = withRules(
      { ...bare('warrior-protection'), buffs: { raid: d.buffs.raid, enabled }, fight: { ...d.fight, boss: { ...d.fight.boss, damageMin: 5000, damageMax: 5000 } } },
      profile,
    )
    return buildPlan(config).plan.fight.bossSwing!
  }
  it('WE-4: Demoralizing Shout takes 29.14 (Classic 20.86) off each 2.0 s swing', () => {
    // −204 × 2.0 / 14 and −146 × 2.0 / 14, the level-60 values (encounter.md WE-4).
    expect(tank(['demoralizingShout']).minDamage).toBeCloseTo(4970.857, 3)
    expect(tank(['demoralizingShout'], 'classicEra').maxDamage).toBeCloseTo(4979.143, 3)
  })
  it('WE-5: Thunder Clap slows the boss to 2.4 s (Classic 2.2 s)', () => {
    expect(tank(['thunderClap']).speedSec).toBeCloseTo(2.4, 9)
    expect(tank(['thunderClap'], 'classicEra').speedSec).toBeCloseTo(2.2, 9)
  })
  it('Protection’s own Sunder Armor, Thunder Clap and Demoralizing Shout take the Buffs tab’s place (warrior.md §5.4 notes)', () => {
    // Defensive, which keeps all three (Balanced, the default, keeps Sunder Armor alone, D28).
    const d = { ...defaultConfig('warrior-protection'), rotation: { 'warrior.protection.priority': 'duties' } }
    const plan = buildPlan(d).plan
    // The boss starts unslowed and at full attack power; the rotation's debuffs are auras.
    expect(plan.fight.bossSwing).toMatchObject({ speedSec: 2, unslowedSec: 2, slow: 0, minDamage: 4500, maxDamage: 5500 })
    expect(plan.fight.targetArmor).toBe(3731 - 505 - 505) // Faerie Fire and Curse of Recklessness only
    const debuffs = Object.fromEntries(plan.auras.filter((a) => ['sunderArmor', 'thunderClap', 'demoralizingShout'].includes(a.id)).map((a) => [a.id, a]))
    expect(debuffs.sunderArmor).toMatchObject({ targetArmor: 450, maxStacks: 5 })
    expect(debuffs.thunderClap).toMatchObject({ bossSlow: 20 })
    expect(debuffs.demoralizingShout).toMatchObject({ bossAp: -204 })
    // The assumptions behind them are listed as the Buffs tab's are.
    expect(buildPlan(d).assumptions.map((a) => a.id)).toEqual(expect.arrayContaining(['bossSlow', 'bossApDebuff']))
    // With Expose Armor from the Buffs tab, only one of the two applies in game: the rotation's
    // Sunder Armor removes no armor, and its threat still counts.
    const exposeConfig = { ...d, buffs: { ...d.buffs, enabled: [...d.buffs.enabled.filter((id) => id !== 'sunderArmor'), 'exposeArmor'] } }
    const expose = buildPlan(exposeConfig).plan
    expect(expose.fight.targetArmor).toBe(3731 - 2250 - 505 - 505)
    expect(expose.auras.find((a) => a.id === 'sunderArmor')!.targetArmor).toBeUndefined()
    expect(expose.abilities.find((a) => a.id === 'sunderArmor')!.threatBonus).toBe(206)
    // The result says so, and that a Sunder may fail over it in Classic Era [?] (PL3, Q35); only then.
    const note = (config: SimConfig) => buildPlan(config).assumptions.find((a) => a.id === 'replacedDebuff')?.text
    expect(note(exposeConfig)).toBe(
      'Expose Armor (Buffs) takes the place of your Sunder Armor on the boss, since only one applies: yours removes nothing, but still lands and makes its full threat. In Classic Era it may fail to apply over a stronger one, and then make none; untested.',
    )
    expect(note(d)).toBeUndefined()
    const noSunder = { 'warrior.protection.sunder.enabled': false, 'warrior.protection.sunderFiller.enabled': false }
    expect(note({ ...exposeConfig, rotation: noSunder })).toBeUndefined()
  })

  it('only tank specs get boss melee', () => {
    expect(buildPlan(defaultConfig('warrior-fury')).plan.fight.bossSwing).toBeNull()
    expect(buildPlan(defaultConfig('warrior-protection')).plan.fight.bossSwing).not.toBeNull()
  })
})

describe('talents, racials and stances', () => {
  it('turns the popular Fury build into its passives', () => {
    const { plan, sheet } = buildPlan(defaultConfig('warrior-fury'))
    const ids = plan.procs.map((p) => p.id)
    expect(ids).toEqual(expect.arrayContaining(['flurry', 'unbridledWrath', 'deepWounds', 'enrage']))
    expect(plan.rage.maxTenths).toBe(1300) // Boundless Rage 3/3
    expect(plan.periodicRage).toEqual([{ periodMs: 3000, tenths: 10, source: -1 }]) // Anger Management
    expect(plan.auras.find((a) => a.id === 'flurry')).toMatchObject({ haste: 25, whiteSwingCharges: 3, durationMs: 15000 })
    // Cruelty 5 and Berserker Stance 3 are aura crit on the sheet.
    const noTalents = computeSheet({ ...defaultConfig('warrior-fury'), talents: '' })!
    expect(sheet.critPct - noTalents.critPct).toBeCloseTo(5, 9)
  })

  it('gives Unbridled Wrath 2 rage with a two-hander and 1 with one-handers', () => {
    const rage = (config: SimConfig) => buildPlan(config).plan.procs.filter((p) => p.id === 'unbridledWrath').map((p) => p.amount)
    expect(rage(defaultConfig('warrior-arms'))).toEqual([20])
    expect(rage(defaultConfig('warrior-fury'))).toEqual([10])
  })

  it('applies Gnome +5% max rage on top of Boundless Rage [?] and Tauren +1% hit', () => {
    const gnome = buildPlan({ ...defaultConfig('warrior-fury'), race: 'alliance-gnome' })
    expect(gnome.plan.rage.maxTenths).toBe(1365)
    expect(gnome.assumptions.map((a) => a.id)).toContain('gnomeRage')
    const tauren = computeSheet({ ...bare('warrior-arms'), race: 'horde-tauren' })!
    expect(tauren.hitPct).toBe(1)
  })

  it('gives a Gnome Expansive Mind for every class it has: mana, Energy or rage +5% (character-stats racials)', () => {
    // Class masks 400 (priest, mage, warlock: mana), 8 (rogue: Energy), 1 (warrior: rage) [F] [client].
    for (const spec of ['mage-frost', 'priest-shadow', 'warlock-affliction'] as const) {
      const gnome = buildPlan({ ...defaultConfig(spec), race: 'alliance-gnome' }).plan
      const human = buildPlan({ ...defaultConfig(spec), race: 'alliance-human' }).plan
      // The warlock's Fel Vitality multiplies too; the Gnome's share is 5%.
      expect(gnome.stats.manaMult / human.stats.manaMult, spec).toBeCloseTo(1.05, 9)
      expect(gnome.mana!.maxTenths, spec).toBe(10 * computeSheet({ ...defaultConfig(spec), race: 'alliance-gnome' })!.mana!)
    }
    // A rogue with no Vigor: 100 Energy × 1.05 = 105, full at the pull (rogue.md §2.1).
    const rogue = (race: string) => buildPlan({ ...defaultConfig('rogue-combat'), race, talents: '' }).plan.energy!
    expect(rogue('alliance-gnome')).toMatchObject({ maxTenths: 1050, startTenths: 1050 })
    expect(rogue('alliance-human')).toMatchObject({ maxTenths: 1000, startTenths: 1000 })
    // With Vigor, how the two combine is [?]: the result says so.
    const vigor = encodeTalentCode(TALENT_DATA.rogue, { 'rogue-assassination-vigor': 2 })
    const notes = (race: string, talents: string) => buildPlan({ ...defaultConfig('rogue-combat'), race, talents }).assumptions.map((a) => a.id)
    expect(notes('alliance-gnome', vigor)).toContain('gnomeEnergy')
    expect(notes('alliance-gnome', '')).not.toContain('gnomeEnergy')
    expect(notes('alliance-human', vigor)).not.toContain('gnomeEnergy')
  })

  it('resolves the rotation’s abilities with the build’s talents (warrior.md §2.3, §2.5, §3.1)', () => {
    const { plan } = buildPlan(defaultConfig('warrior-fury'))
    const byId = Object.fromEntries(plan.abilities.map((a) => [a.id, a]))
    expect(byId.heroicStrike.costTenths).toBe(120) // Improved Heroic Strike 3/3
    expect(byId.execute.costTenths).toBe(150) // no Improved Execute
    for (const a of plan.abilities.filter((x) => x.kind !== 'cast')) expect(a.critMultiplier, a.id).toBeCloseTo(2.2, 12) // Impale 2/2
    // Raging Blows: Whirlwind's off-hand strike has its own breakdown row, right after Whirlwind's.
    expect(byId.whirlwind.offHandSource).toBe(byId.whirlwind.source + 1)
    expect(plan.sources[byId.whirlwind.offHandSource].id).toBe('whirlwindOffHand')
    for (const a of plan.abilities.filter((x) => x.id !== 'whirlwind')) expect(a.offHandSource).toBe(-1)
  })

  it('adds the casts’ buffs to the plan’s auras, and the racial cooldown for its race (warrior.md §3.2, §2.9)', () => {
    const { plan } = buildPlan({ ...defaultConfig('warrior-fury'), race: 'horde-orc' })
    const aura = (id: string) => plan.auras[plan.abilities.find((a) => a.id === id)!.aura]
    expect(aura('deathWish')).toMatchObject({ id: 'deathWish', durationMs: 30000, damage: 20 })
    expect(aura('recklessness')).toMatchObject({ id: 'recklessness', durationMs: 15000, crit: 100 })
    expect(aura('bloodFury')).toMatchObject({ id: 'bloodFury', durationMs: 15000, apPct: 10 })
    expect(plan.abilities.find((a) => a.id === 'bloodrage')!.aura).toBe(-1)
    // Casts get breakdown rows like any ability.
    for (const a of plan.abilities) expect(plan.sources[a.source].id).toBe(a.id)
    const races = (race: string) => buildPlan({ ...defaultConfig('warrior-fury'), race }).plan.abilities.map((a) => a.id)
    expect(races('horde-troll')).toContain('berserking')
    expect(races('alliance-night-elf')).toContain('elunesLight')
    for (const id of ['bloodFury', 'berserking', 'elunesLight']) expect(races('alliance-human')).not.toContain(id)
  })

  it('records the stance each spec fights in, and any stance for classes without one', () => {
    expect(buildPlan(defaultConfig('warrior-fury')).plan.stance).toBe(STANCE.berserker)
    expect(buildPlan(defaultConfig('warrior-arms')).plan.stance).toBe(STANCE.battle)
    expect(buildPlan(defaultConfig('warrior-protection')).plan.stance).toBe(STANCE.defensive)
    expect(buildPlan(defaultConfig('paladin-retribution')).plan.stance).toBe(STANCE_ANY)
  })

  it('turns each stance’s effects into factors on the base stance’s numbers, Defiance included (warrior.md §2.1, §7)', () => {
    const factors = (config: SimConfig) =>
      Object.fromEntries(buildPlan(config).plan.stances.map((s) => [s.stance, [s.damage, s.threat, s.damageTaken, s.crit]]))
    const close = (got: number[], want: number[]) => want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 12))
    // Fury fights in Berserker Stance: its factors are exactly 1, 1, 1 and 0.
    const fury = factors(defaultConfig('warrior-fury'))
    expect(fury[STANCE.berserker]).toEqual([1, 1, 1, 0])
    close(fury[STANCE.battle], [1, 1, 1 / 1.1, -3])
    close(fury[STANCE.defensive], [0.9, 1.3 / 0.8, 0.9 / 1.1, -3])
    // Arms fights in Battle Stance.
    const arms = factors(defaultConfig('warrior-arms'))
    expect(arms[STANCE.battle]).toEqual([1, 1, 1, 0])
    close(arms[STANCE.berserker], [1, 1, 1.1, 3])
    // Protection with a shield: Defiance 3/3 is ×1.15 more in Defensive Stance only (W16).
    const prot = defaultConfig('warrior-protection')
    const shield = factors(bare('warrior-protection', { talents: prot.talents, gear: { mainHand: { itemId: 15806 }, offHand: { itemId: 12602 } } }))
    expect(shield[STANCE.defensive]).toEqual([1, 1, 1, 0])
    close(shield[STANCE.battle], [1 / 0.9, 0.8 / 1.495, 1 / 0.9, 0])
    const twoHand = factors(bare('warrior-protection', { talents: prot.talents, gear: { mainHand: { itemId: 12784 } } }))
    close(twoHand[STANCE.battle], [1 / 0.9, 0.8 / 1.3, 1 / 0.9, 0])
    // Classes without stances have none.
    expect(buildPlan(defaultConfig('paladin-retribution')).plan.stances).toEqual([])
  })

  it('keeps 10 + 3 per Improved Tactical Mastery rank on a swap in `forever`, 5 per rank in `classicEra` (W18, rage.md R16, R17)', () => {
    const fury = defaultConfig('warrior-fury') // Improved Tactical Mastery 5/5
    expect(buildPlan(fury).plan.stanceSwap).toEqual({ cooldownMs: 1000, keepTenths: 250 })
    expect(buildPlan(withRules(fury, 'classicEra')).plan.stanceSwap.keepTenths).toBe(250)
    expect(buildPlan(bare('warrior-fury')).plan.stanceSwap.keepTenths).toBe(100)
    expect(buildPlan(withRules(bare('warrior-fury'), 'classicEra')).plan.stanceSwap.keepTenths).toBe(0)
  })

  it('adds the Overpower window’s dodge opener with the Overpower dance, and drops Bloodthrill without Rend (warrior.md §2.8)', () => {
    const d = defaultConfig('warrior-fury')
    // The dance is on by default since M2.5b; without it, no opener.
    expect(buildPlan(d).plan.procs.map((p) => p.id)).toContain('overpowerDodge')
    expect(buildPlan({ ...d, rotation: { 'warrior.fury.overpower.enabled': false } }).plan.procs.map((p) => p.id)).not.toContain('overpowerDodge')
    // The Fury default with Bloodthrill 1/5 instead of a point of Improved Heroic Strike's.
    const ranks = decodeTalentCode(TALENT_DATA.warrior, d.talents)
    const withBloodthrill = encodeTalentCode(TALENT_DATA.warrior, { ...ranks, 'warrior-arms-bloodthrill': 1, 'warrior-arms-improved-heroic-strike': 2 })
    // The Rend dance (W4) off: Bloodthrill's proc needs your Rend.
    const { plan, assumptions } = buildPlan({ ...d, talents: withBloodthrill, rotation: { 'warrior.fury.overpower.enabled': true, 'warrior.fury.rend.enabled': false } })
    const op = plan.abilities.find((a) => a.id === 'overpower')!
    expect(plan.auras[op.window].id).toBe('overpowerWindow')
    const dodge = plan.procs.find((p) => p.id === 'overpowerDodge')!
    expect(dodge).toMatchObject({ trigger: TRIGGER.targetDodge, chance: [1, 1], hands: 3, amount: op.window, b: 0 })
    expect(plan.triggers[TRIGGER.targetDodge]).toEqual([plan.procs.indexOf(dodge)])
    expect(plan.procs.map((p) => p.id)).not.toContain('bloodthrill')
    expect(assumptions.map((a) => a.id)).toContain('overpowerWindow')
    expect(assumptions.map((a) => a.id)).not.toContain('bloodthrill')
    // With the Rend dance, on by default since W4, it's kept.
    expect(buildPlan({ ...d, talents: withBloodthrill }).plan.procs.map((p) => p.id)).toContain('bloodthrill')
  })

  it('gives a weapon racial’s crit to all attacks and spells while either hand holds that weapon (warrior.md §2.9) [?] (Q15)', () => {
    const d = defaultConfig('warrior-fury') // Human: Ironfoe (mace) + Mirah's Song (sword)
    const bundle = (race: string, gear: Partial<SimConfig['gear']> = {}) => buildPlan({ ...d, race, gear: { ...d.gear, ...gear } })
    const human = bundle('alliance-human')
    const gnome = bundle('alliance-gnome') // no weapon racial
    // Aura crit on the sheet, not a per-hand bonus: both hands, the sheet and spells get +2.
    expect(human.plan.weapons.map((w) => w!.critBonus)).toEqual([0, 0])
    expect(human.plan.stats.crit - gnome.plan.stats.crit).toBeCloseTo(2, 9)
    expect(human.plan.stats.spellCrit - gnome.plan.stats.spellCrit).toBeCloseTo(2, 9)
    const [mh, oh] = new Sim(human.plan).inspect().crit
    expect(oh).toBeCloseTo(mh, 9)
    expect(human.assumptions.map((a) => a.id)).toContain('racialWeaponCrit')
    expect(gnome.assumptions.map((a) => a.id)).not.toContain('racialWeaponCrit')
    // A sword in the main hand counts the same as one in the off hand.
    const swapped = bundle('alliance-human', { mainHand: d.gear.offHand, offHand: d.gear.mainHand })
    expect(swapped.plan.stats.crit).toBeCloseTo(human.plan.stats.crit, 9)
    // No sword, no Sword Specialization; an Orc gets +1 from an axe in either hand, a Dwarf +1 from its mace.
    const crit = (race: string, gear: Partial<SimConfig['gear']> = {}) => bundle(race, gear).plan.stats.crit
    const axes = { mainHand: { itemId: 17016 }, offHand: { itemId: 18498 } } // Dark Iron Destroyer and Hedgecutter
    expect(crit('alliance-human', axes)).toBeCloseTo(gnome.plan.stats.crit, 9)
    expect(crit('horde-orc', axes) - crit('alliance-human', axes)).toBeCloseTo(1, 9)
    const maceAndAxe = { offHand: { itemId: 18498 } }
    expect(crit('horde-orc', maceAndAxe) - crit('alliance-human', maceAndAxe)).toBeCloseTo(1, 9)
    expect(crit('alliance-dwarf') - gnome.plan.stats.crit).toBeCloseTo(1, 9)
    expect(bundle('alliance-human', axes).assumptions.map((a) => a.id)).not.toContain('racialWeaponCrit')
  })

  it('gives a caster its weapon racial’s crit, spells too, for the weapon it holds and never swings (mage.md "Races")', () => {
    // Scepter of the Unholy, a mace (the Shadow Priest's list's rank 2): a Dwarf's Mace Specialization holds.
    const d = defaultConfig('priest-shadow')
    const gear = { ...d.gear, mainHand: { ...d.gear.mainHand, itemId: 13349 } }
    const plan = (race: string) => buildPlan({ ...d, race, gear }).plan
    const [dwarf, gnome] = [plan('alliance-dwarf'), plan('alliance-gnome')] // the Gnome has no weapon racial
    expect(dwarf.weapons).toEqual([null, null])
    expect(dwarf.stats.spellCrit - gnome.stats.spellCrit).toBeCloseTo(1, 9)
    expect(dwarf.stats.crit - gnome.stats.crit).toBeCloseTo(1, 9)
  })

  // TL2: 12700's own tooltip reads "…with Axes and Polearms", and tooltips beat derived values (doctrine §2).
  it('gives Weaponmaster’s axe and polearm crit to that weapon’s attacks only, and not to spells, as its tooltip reads (warrior.md §2.7) [?] (Q15)', () => {
    const arms = defaultConfig('warrior-arms')
    const ranks = decodeTalentCode(TALENT_DATA.warrior, arms.talents)
    expect(ranks['warrior-arms-weaponmaster']).toBe(5)
    const four = encodeTalentCode(TALENT_DATA.warrior, { ...ranks, 'warrior-arms-weaponmaster': 4 })
    const bundle = (talents: string, gear: SimConfig['gear']) => buildPlan({ ...arms, race: 'alliance-gnome', talents, gear })
    const sword = { itemId: 15806 } // Mirah's Song
    const axe = { itemId: 18498 } // Hedgecutter
    const bonus = (gear: SimConfig['gear']) => bundle(arms.talents, gear).plan.weapons.map((w) => w?.critBonus ?? null)
    // The axe's hand only, whichever hand it's in; a two-handed axe; nothing without one.
    expect(bonus({ mainHand: sword, offHand: axe })).toEqual([0, 5])
    expect(bonus({ mainHand: axe, offHand: sword })).toEqual([5, 0])
    expect(bonus({ mainHand: axe, offHand: axe })).toEqual([5, 5])
    const reaper = { mainHand: { itemId: 12784 } } // Arcanite Reaper, a two-handed axe
    expect(bonus(reaper)).toEqual([5, null])
    expect(bonus({ mainHand: sword, offHand: sword })).toEqual([0, 0])
    // One rank moves the axe's hand by 1 and leaves the other hand, the stat block and spell crit alone.
    const swordAndAxe = { mainHand: sword, offHand: axe }
    const [five, less] = [bundle(arms.talents, swordAndAxe), bundle(four, swordAndAxe)]
    expect(five.plan.stats.crit).toBe(less.plan.stats.crit)
    expect(five.plan.stats.spellCrit).toBe(less.plan.stats.spellCrit)
    const [[mh5, oh5], [mh4, oh4]] = [new Sim(five.plan).inspect().crit, new Sim(less.plan).inspect().crit]
    expect(mh5).toBeCloseTo(mh4, 9)
    expect(oh5 - oh4).toBeCloseTo(1, 9)
    // The sheet's crit is the main hand's, so it shows the rank with an axe in the main hand only.
    expect(five.sheet.critPct).toBeCloseTo(less.sheet.critPct, 9)
    const axeAndSword = { mainHand: axe, offHand: sword }
    expect(bundle(arms.talents, axeAndSword).sheet.critPct - bundle(four, axeAndSword).sheet.critPct).toBeCloseTo(1, 9)
    // An axe and another weapon: the result lists the reading, with the racials' (Q15).
    const notes = (gear: SimConfig['gear']) => bundle(arms.talents, gear).assumptions.map((a) => a.id)
    expect(notes(swordAndAxe)).toContain('racialWeaponCrit')
    expect(notes(reaper)).not.toContain('racialWeaponCrit')
  })

  it('counts all-crit (aura 290) stances and buffs toward spell crit in `forever`, melee crit only where Classic Era’s is aura 52 (RL5)', () => {
    const d = defaultConfig('warrior-fury')
    const spellCrit = (config: SimConfig) => buildPlan(config).plan.stats.spellCrit
    const none: SimConfig = { ...d, buffs: { raid: d.buffs.raid, enabled: [] } }
    const withBuffs = (enabled: string[]): SimConfig => ({ ...d, buffs: { raid: d.buffs.raid, enabled } })
    // Leader of the Pack +3 and Mongoose +2: spells too in Forever; Classic Era's are melee only.
    expect(spellCrit(withBuffs(['leaderOfThePack', 'elixirOfTheMongoose'])) - spellCrit(none)).toBeCloseTo(5, 9)
    expect(spellCrit(withRules(withBuffs(['leaderOfThePack', 'elixirOfTheMongoose']), 'classicEra')) - spellCrit(withRules(none, 'classicEra'))).toBeCloseTo(0, 9)
    // Berserker Stance's +3: a stance factor on spell crit too, in Forever only.
    const stance = (profile: 'forever' | 'classicEra') =>
      Object.fromEntries(buildPlan(withRules(d, profile)).plan.stances.map((s) => [s.stance, s.spellCrit]))
    expect(stance('forever')[STANCE.battle]).toBeCloseTo(-3, 9)
    expect(stance('classicEra')[STANCE.battle]).toBeCloseTo(0, 9)
    // Recklessness's aura: +100 spell crit in Forever, none in Classic Era.
    const reck = (profile: 'forever' | 'classicEra') => buildPlan(withRules(d, profile)).plan.auras.find((a) => a.id === 'recklessness')!
    expect(reck('forever')).toMatchObject({ crit: 100, spellCrit: 100 })
    expect(reck('classicEra')).toMatchObject({ crit: 100, spellCrit: 0 })
  })
})

describe('base values the sim stands in for (D24), and setups it can’t run yet', () => {
  it('gives paladins the placeholders of D24 (base attributes, health, dodge and crits), and says so', () => {
    for (const race of ['alliance-human', 'alliance-dwarf', 'horde-undead']) {
      const bundle = buildPlan({ ...defaultConfig('paladin-retribution'), race })
      expect(bundle.sheet.unknown).toEqual([])
      expect(bundle.sheet.placeholders).toEqual(expect.arrayContaining(['base attributes', 'base health', 'base crit', 'base spell crit']))
      expect(bundle.blockers).toEqual([])
      const ids = bundle.assumptions.map((a) => a.id)
      expect(ids).toContain('baseStatPlaceholders')
      expect(ids).not.toContain('unknownBaseAttributes')
    }
    // docs/mechanics/character-stats.md#paladin-and-druid-base-attributes: the naked Human sheet
    // 105/65/100/70/78 [?] (a D24 placeholder; Spirit 75 × 1.05, floored); mana 1512 + 20 + 15 × (70 − 20) = 2282;
    // health 1381 [?] + 20 + 10 × (100 − 20) = 2201; crit 0.7 [?] + 65 × 0.0506 = 3.989; dodge
    // 0.7 [?] + 65 / 20 = 3.95.
    const naked = buildPlan({ ...defaultConfig('paladin-retribution'), gear: {}, buffs: { raid: [], enabled: [] }, talents: '' })
    expect(naked.sheet).toMatchObject({ strength: 105, agility: 65, stamina: 100, intellect: 70, spirit: 78, mana: 2282, health: 2201 })
    expect(naked.sheet.critPct).toBeCloseTo(0.7 + 65 * 0.0506, 9)
    expect(naked.sheet.dodgePct).toBeCloseTo(0.7 + 65 / 20, 9)
  })

  it('gives Skyborne warriors and hunters their class row, a placeholder named in the assumptions (D24, D36)', () => {
    // docs/mechanics/character-stats.md#warrior-base-attributes: the warrior class row is the Human
    // row 120/80/110/30/45; docs/classes/hunter.md#75-base-values: the hunter's is 55/125/90/65/70.
    const cases = [
      ['warrior-fury', 'Str 120, Agi 80, Sta 110, Int 30, Spi 45', 'warrior'],
      ['warrior-protection', 'Str 120, Agi 80, Sta 110, Int 30, Spi 45', 'warrior'],
      ['hunter-marksmanship', 'Str 55, Agi 125, Sta 90, Int 65, Spi 70', 'hunter'],
    ] as const
    for (const [spec, row, cls] of cases) {
      for (const race of ['alliance-skyborne-high-order', 'horde-skyborne-windshaper']) {
        const bundle = buildPlan(defaultConfig(spec, race))
        expect(bundle.blockers, `${spec} ${race}`).toEqual([])
        expect(bundle.sheet.unknown).not.toContain('base attributes')
        expect(bundle.sheet.placeholders).toContain('base attributes')
        const ids = bundle.assumptions.map((a) => a.id)
        expect(ids).not.toContain('unknownBaseAttributes')
        expect(bundle.assumptions.find((a) => a.id === 'baseStatPlaceholders')!.text).toContain(
          `base attributes ${row}, a ${cls}’s base stats before any racial bonus, as the Skyborne’s aren’t known;`,
        )
      }
    }
    // A measured warrior row is no placeholder: the Human's is [C].
    expect(buildPlan(defaultConfig('warrior-fury', 'alliance-human')).sheet.placeholders).not.toContain('base attributes')
  })

  it('simulates every race each spec’s class can be: none reaches the missing-row blocker or leaves a base value out', () => {
    for (const spec of SPEC_IDS) {
      for (const race of racesForClass(raceJson as RaceData, SPEC_META[spec].classId)) {
        const bundle = buildPlan(defaultConfig(spec, race.id))
        expect(bundle.blockers, `${spec} ${race.id}`).toEqual([])
        expect(bundle.sheet.unknown, `${spec} ${race.id}`).toEqual([])
      }
    }
  })

  it('still refuses a race and class with no row, measured or placeholder, and names the class', () => {
    // No such pair in Forever, so the UI never offers it: the guard for a pair the data adds first.
    const paladin = buildPlan({ ...defaultConfig('paladin-retribution'), race: 'alliance-night-elf' })
    expect(paladin.blockers).toEqual(['This race’s base stats at level 60 aren’t known yet, so this paladin can’t be simulated. Pick another race.'])
    expect(paladin.sheet.unknown).toContain('base attributes')
    expect(paladin.assumptions.map((a) => a.id)).toContain('unknownBaseAttributes')
    const priest = buildPlan({ ...defaultConfig('priest-shadow'), race: 'horde-skyborne-windshaper' })
    expect(priest.blockers).toEqual(['Skyborne base stats at level 60 aren’t known yet, so a Skyborne priest can’t be simulated. Pick another race.'])
  })
})

describe('assumptions', () => {
  it('surfaces only what a setup relies on', () => {
    const ids = (config: SimConfig) => buildPlan(config).assumptions.map((a) => a.id)
    const fury = ids(defaultConfig('warrior-fury'))
    expect(fury).toEqual(expect.arrayContaining(['foreverGlancing', 'foreverWhiteRage', 'foreverOffHandRage', 'offHandFirstSwing', 'classicItems']))
    expect(fury).not.toContain('bossMelee')
    expect(fury).not.toContain('foreverBossParry')
    const prot = ids(defaultConfig('warrior-protection'))
    expect(prot).toEqual(
      expect.arrayContaining(['bossMelee', 'damageTakenRage', 'foreverBossParry', 'whiteThreat', 'defiance', 'classicShieldBlockValue', 'baseStatPlaceholders']),
    )
    expect(prot).not.toContain('shieldBlockValue')
    // threat.md#warrior (W2): Sunder Armor's and Shield Slam's threat is the profile's, and so are the notes.
    const note = (config: SimConfig, id: string) => buildPlan(config).assumptions.find((a) => a.id === id)?.text
    const classicProt = withRules(defaultConfig('warrior-protection'), 'classicEra')
    const ability = (config: SimConfig, id: string) => buildPlan(config).plan.abilities.find((a) => a.id === id)!
    expect([ability(classicProt, 'sunderArmor').threatBonus, ability(classicProt, 'sunderArmor').threatApCoefficient]).toEqual([261, 0])
    expect(ability(classicProt, 'shieldSlam').threatBonus).toBe(254)
    const prot1 = defaultConfig('warrior-protection')
    expect([ability(prot1, 'sunderArmor').threatBonus, ability(prot1, 'sunderArmor').threatApCoefficient]).toEqual([206, 0.05])
    expect(ability(prot1, 'shieldSlam').threatBonus).toBe(475)
    expect(note(prot1, 'whiteThreat')).toMatch(/: Sunder Armor and Shield Slam use their own values \(below\), the other abilities Classic Era’s\.$/)
    // Without Shield Slam the note names Sunder Armor alone, in the singular.
    const noSlam = { ...prot1, rotation: { ...prot1.rotation, 'warrior.protection.shieldSlam.enabled': false } }
    expect(note(noSlam, 'whiteThreat')).toMatch(/: Sunder Armor uses its own value \(below\), the other abilities Classic Era’s\.$/)
    expect(note(prot1, 'sunderThreat')).toMatch(/^Sunder Armor makes 206 plus 5% of your attack power in threat, before your stance’s multiplier\./)
    expect(note(prot1, 'shieldSlamThreat')).toMatch(/^Shield Slam makes its damage plus 475 in threat\./)
    expect(note(classicProt, 'whiteThreat')).not.toMatch(/Sunder/)
    expect(note(classicProt, 'sunderThreat')).toBeUndefined()
    expect(note(classicProt, 'shieldSlamThreat')).toBeUndefined()
    const classic = ids(withRules(defaultConfig('warrior-arms'), 'classicEra'))
    expect(classic).not.toContain('foreverGlancing')
    expect(classic).not.toContain('foreverWhiteRage')
    for (const a of buildPlan(defaultConfig('warrior-protection')).assumptions) {
      expect(a.docRef).toMatch(/^docs\//)
      expect(a.text.length).toBeGreaterThan(20)
    }
  })

  it('surfaces Protection’s Revenge window and spell-table rolls under their own ids, only while its rotation uses them (warrior.md §2.8, §7, Q12, Q33)', () => {
    const notes = (rotation: SimConfig['rotation']) => buildPlan({ ...defaultConfig('warrior-protection'), rotation }).assumptions
    // Defensive, which uses both spells; Balanced, the default, drops them as Max TPS does (D28).
    const prot = notes({ 'warrior.protection.priority': 'duties' })
    expect(notes({}).map((a) => a.id)).not.toContain('spellTable')
    expect(prot.find((a) => a.id === 'revengeWindow')!.text).toMatch(/^A block, dodge or parry of the boss’s swings opens Revenge for 5 s/)
    expect(prot.find((a) => a.id === 'spellTable')!.text).toMatch(/^Thunder Clap and Demoralizing Shout roll the spell table, as the Forever client marks it: one roll for a spell miss/)
    // Only Thunder Clap deals damage, so only it crits (PU9).
    expect(prot.find((a) => a.id === 'spellTableCrit')!.text).toBe('Thunder Clap crits at your special-attack crit chance, not your spell crit, as a melee ability does. Low-level beta logs show Thunder Clap critting far less often, about 0.3% of the time, so its crits here may be too many.')
    // Neither rides on another's text any more.
    expect(prot.map((a) => a.id)).not.toContain('overpowerWindow')
    expect(prot.find((a) => a.id === 'foreverHitTable')!.text).not.toMatch(/spell table/)
    // Max TPS drops both spells; one of them back names only it. Without Revenge, no window.
    const max = notes({ 'warrior.protection.priority': 'maxTps' })
    expect(max.map((a) => a.id)).not.toContain('spellTable')
    expect(notes({ 'warrior.protection.priority': 'maxTps', 'warrior.protection.thunderClap.enabled': true }).find((a) => a.id === 'spellTable')!.text).toMatch(
      /^Thunder Clap rolls the spell table/,
    )
    const shout = notes({ 'warrior.protection.priority': 'maxTps', 'warrior.protection.demoShout.enabled': true })
    expect(shout.find((a) => a.id === 'spellTable')!.text).toMatch(/^Demoralizing Shout rolls the spell table/)
    expect(shout.map((a) => a.id)).not.toContain('spellTableCrit')
    expect(notes({ 'warrior.protection.revenge.enabled': false }).map((a) => a.id)).not.toContain('revengeWindow')
    expect(notes({ 'warrior.protection.revenge.enabled': false }).map((a) => a.id)).not.toContain('revengeDamage')
  })

  it('gives Revenge’s damage its own assumption, linked to warrior.md §3.1, at the build’s Improved Revenge rank (BU-1, Q38)', () => {
    const revenge = buildPlan(defaultConfig('warrior-protection')).assumptions.find((a) => a.id === 'revengeDamage')!
    expect(revenge.docRef).toBe('docs/classes/warrior.md#31-damage-abilities')
    expect(revenge.text).toMatch(/^Revenge deals the Forever client’s 109–133, ×1\.6 with Improved Revenge 3\/3 \(174–213\), with nothing from your attack power\./)
    // The default build takes 3/3; other ranks give their own range, and none leaves the talent out.
    expect(revengeDamageText(1)).toMatch(/^Revenge deals the Forever client’s 109–133, ×1\.2 with Improved Revenge 1\/3 \(131–160\), with nothing/)
    expect(revengeDamageText(0)).toMatch(/^Revenge deals the Forever client’s 109–133, with nothing from your attack power\./)
  })

  it('surfaces Unbridled Wrath on Heroic Strike swings and Raging Blows only when the build relies on them', () => {
    const ids = (config: SimConfig) => buildPlan(config).assumptions.map((a) => a.id)
    const fury = defaultConfig('warrior-fury')
    expect(ids(fury)).toEqual(expect.arrayContaining(['unbridledWrathSwings', 'ragingBlows', 'abilityRefunds']))
    expect(ids(fury)).not.toContain('whiteSwingsOnly')
    const noTalents = ids({ ...fury, talents: '' })
    expect(noTalents).not.toContain('unbridledWrathSwings')
    expect(noTalents).not.toContain('ragingBlows')
    // A two-hander has no off hand for Raging Blows.
    const twoHander = ids({ ...fury, gear: { ...fury.gear, mainHand: { itemId: 12784 }, offHand: undefined } })
    expect(twoHander).not.toContain('ragingBlows')
    expect(twoHander).toContain('unbridledWrathSwings')
    expect(ids({ ...fury, rotation: { 'warrior.fury.whirlwind.enabled': false } })).not.toContain('ragingBlows')
  })

  it('gives the Unbridled Wrath assumption the beta’s rate and only the reader’s spec’s loss at it (warrior.md §2.3, BU-8)', () => {
    const text = (config: SimConfig) => buildPlan(config).assumptions.find((a) => a.id === 'unbridledWrathSwings')?.text
    const fury = text(defaultConfig('warrior-fury'))!
    expect(fury).toMatch(/The sim uses the talent’s 12% a rank; on the beta it procs about 7\.2% a rank/)
    expect(fury).toMatch(/At the beta’s rate you’d lose about 0\.7% of your damage\.$/)
    expect(fury).not.toMatch(/Arms/)
    const arms = text(defaultConfig('warrior-arms'))!
    expect(arms).toMatch(/At the beta’s rate you’d lose about 1% of your damage\.$/)
    expect(arms).not.toMatch(/Fury/)
    expect(unbridledWrathText('warrior-protection')).toMatch(/later build fixes\.$/)
  })

  it('gives a Gnome of every class its Eureka!: the aura, its charges and cuts, the abilities it modifies, and the assumption with its cut (classes/eureka.ts)', () => {
    // 1.60.1.70009: every class's cut is 10%.
    const cases = [
      ['warrior-fury', 10, 'rage', ['bloodthirst', 'whirlwind', 'execute', 'heroicStrike']],
      ['rogue-combat', 10, 'Energy', ['sinisterStrike', 'eviscerate']],
      ['mage-fire', 10, 'mana', ['fireball', 'scorch', 'fireBlast']],
      ['warlock-affliction', 10, 'mana', ['shadowBolt', 'corruption']],
      ['priest-shadow', 10, 'mana', ['mindBlast', 'shadowWordPain', 'mindFlay']],
    ] as const
    for (const [spec, cut, resource, modified] of cases) {
      const { plan, assumptions } = buildPlan({ ...defaultConfig(spec), race: 'alliance-gnome' })
      const eureka = plan.abilities.find((a) => a.id === 'eureka')
      expect(eureka, spec).toMatchObject({ cooldownMs: 120000, gcdMs: 0, costTenths: 0 })
      expect(plan.auras[eureka!.aura].durationMs, spec).toBe(15000)
      expect(plan.eureka, spec).toEqual({ aura: eureka!.aura, charges: 3, costPct: cut, damagePct: 10, dotPct: 10 })
      for (const id of modified) expect(plan.abilities.find((a) => a.id === id)?.eureka ?? 0, `${spec} ${id}`).toBeGreaterThan(0)
      // Pyroblast and Incinerate are outside the masks; the racial itself too.
      for (const a of plan.abilities) if (['pyroblast', 'incinerate', 'eureka'].includes(a.id)) expect(a.eureka ?? 0, `${spec} ${a.id}`).toBe(0)
      // Plain words (FU-8): the cut names the class's resource.
      expect(assumptions.find((a) => a.id === 'eureka')?.text, spec).toContain(`cuts the next 3 covered abilities’ ${resource} cost ${cut}%, rounded down to a whole point`)
    }
    // Another race has none.
    for (const race of ['horde-orc', 'horde-troll', 'alliance-night-elf', 'alliance-human']) {
      const { plan, assumptions } = buildPlan({ ...defaultConfig('warrior-fury'), race })
      expect(plan.eureka, race).toBeUndefined()
      expect(assumptions.map((a) => a.id), race).not.toContain('eureka')
    }
  })

  it('flags the damage-taken rage model in use, only when you take damage, and says rage divides by the placeholder base health (rage.md#forever-, D24)', () => {
    const taken = (config: SimConfig) => buildPlan(config).assumptions.filter((a) => a.id.startsWith('damageTakenRage') || a.id === 'baseStatPlaceholders')
    const prot = defaultConfig('warrior-protection')
    const withModel = (damageTakenRage: NonNullable<SimConfig['rules']['damageTakenRage']>) => taken({ ...prot, rules: { ...prot.rules, damageTakenRage } })
    const [model, health] = taken(prot)
    expect(model.id).toBe('damageTakenRage')
    expect(model.text).toMatch(/rage of 10 × the hit before armor, block and absorbs, divided by your maximum health/)
    expect(health.text).toMatch(/placeholders/)
    expect(health.text).toMatch(/base health 1,689, which rage from damage taken divides by/)
    // A tank's avoidance placeholders: base parry and block 5% with a weapon and a shield.
    expect(health.text).toMatch(/: base health 1,689, which rage from damage taken divides by; base parry 5%; base block 5%\.$/)
    expect(withModel('foreverFlat').map((a) => a.id)).toEqual(['damageTakenRageFlat', 'baseStatPlaceholders'])
    expect(withModel('foreverHealthLost').map((a) => a.id)).toEqual(['damageTakenRageHealthLost', 'baseStatPlaceholders'])
    expect(withModel('foreverHealthLost')[1].text).toMatch(/divides by/)
    // A legacy id, in a raw setup that skipped normalizing, flags the model it now names.
    const legacy = { ...prot, rules: { ...prot.rules, damageTakenRage: 'foreverHpPreArmor' } } as unknown as SimConfig
    expect(taken(legacy).map((a) => a.id)).toEqual(['damageTakenRage', 'baseStatPlaceholders'])
    // Classic Era's own model is [C]; it and `foreverFlat` don't divide by health.
    const classic = withModel('classic')
    expect(classic.map((a) => a.id)).toEqual(['baseStatPlaceholders'])
    expect(classic[0].text).not.toMatch(/divides by/)
    expect(withModel('foreverFlat')[1].text).not.toMatch(/divides by/)
    // A DPS warrior takes no damage by default, and the boss doesn't attack it: health only.
    const fury = defaultConfig('warrior-fury')
    const furyNotes = taken(fury)
    expect(furyNotes.map((a) => a.id)).toEqual(['baseStatPlaceholders'])
    expect(furyNotes[0].text).toMatch(/: base health 1,689\.$/)
    const hit = taken({ ...fury, fight: { ...fury.fight, damageTakenPerSec: 100 } })
    expect(hit.map((a) => a.id)).toEqual(['damageTakenRage', 'baseStatPlaceholders'])
    expect(hit[1].text).toMatch(/base health 1,689, which rage from damage taken divides by\.$/)
  })

  it('flags Berserker Rage’s unknown damage-taken rage only when it’s used and damage is taken (rage.md, Q20)', () => {
    const fury = defaultConfig('warrior-fury')
    // Improved Berserker Rage 2/2 on top of the default build.
    const data = TALENT_DATA.warrior
    const ibr = data.trees.flatMap((t) => t.talents).find((t) => t.name === 'Improved Berserker Rage')!.id
    const talents = encodeTalentCode(data, { ...decodeTalentCode(data, fury.talents), [ibr]: 2 })
    const ids = (config: SimConfig) => buildPlan(config).assumptions.map((a) => a.id)
    expect(buildPlan({ ...fury, talents }).plan.abilities.map((a) => a.id)).toContain('berserkerRage')
    expect(ids({ ...fury, talents })).not.toContain('berserkerRageTaken')
    expect(ids({ ...fury, talents, fight: { ...fury.fight, damageTakenPerSec: 100 } })).toContain('berserkerRageTaken')
    expect(ids({ ...fury, fight: { ...fury.fight, damageTakenPerSec: 100 } })).not.toContain('berserkerRageTaken')
  })

  it('lists the on-use items and consumables no rotation uses (warrior.md §5.2 rows 3, 16, 17; §7)', () => {
    const d = defaultConfig('warrior-fury')
    const note = (config: SimConfig) => buildPlan(config).assumptions.find((a) => a.id === 'onUseConsumables')?.text
    const ids = (config: SimConfig) => buildPlan(config).assumptions.map((a) => a.id)
    // Standard raid: the Mighty Rage Potion is used.
    expect(d.buffs.enabled).toContain('mightyRagePotion')
    // Blackhand's Breadth (default trinket 2) has Forever's use, which isn't simulated (review L5).
    expect(note(d)).toBe("Some on-use items and consumables aren’t simulated: Blackhand's Breadth.")
    // Max consumables: Juju Flurry is used too, and so is the bomb when it's on (every rotation
    // throws it, buffs doc "On-use items and cooldown categories").
    const max = { ...d, buffs: { raid: d.buffs.raid, enabled: presetBuffIds('max', 'warrior-fury', d.buffs.raid) } }
    expect(max.buffs.enabled).toContain('jujuFlurry')
    expect(note(max)).toBe("Some on-use items and consumables aren’t simulated: Blackhand's Breadth.")
    const bomb = { ...max, buffs: { ...max.buffs, enabled: [...max.buffs.enabled, 'ezThroDarkBomb'] } }
    expect(note(bomb)).toBe("Some on-use items and consumables aren’t simulated: Blackhand's Breadth.")
    // Weakness Analyzer is used (with its own note); Counterattack Lodestone's disarm isn't.
    const trinkets = { ...d, gear: { ...d.gear, trinket1: { itemId: 272438 }, trinket2: { itemId: 18537 } } }
    expect(note(trinkets)).toBe('Some on-use items and consumables aren’t simulated: Counterattack Lodestone.')
    expect(ids(trinkets)).toContain('weaknessAnalyzer')
    expect(ids(d)).not.toContain('weaknessAnalyzer')
    // Arms and Protection use them too (warrior.md §5.3 rows 3 and 17, §5.4 rows 3 and 4).
    const arms = defaultConfig('warrior-arms')
    // Weakness Analyzer is used; Blackhand's Breadth (trinket 2) keeps its not-simulated use (review L5).
    expect(note({ ...arms, gear: { ...arms.gear, trinket1: { itemId: 272438 } } })).toBe(
      "Some on-use items and consumables aren’t simulated: Blackhand's Breadth.",
    )
    // Protection's interim trinket, Adaptive Combat Assistant, keeps its not-simulated use (warrior.md §6.3).
    const prot = defaultConfig('warrior-protection')
    expect(note(prot)).toBe('Some on-use items and consumables aren’t simulated: Adaptive Combat Assistant.')
    expect(note({ ...prot, gear: { ...prot.gear, trinket1: { itemId: 272438 } } }) ?? '').not.toContain('Weakness Analyzer')
  })

  it('surfaces the Arms rotation’s assumptions: the Overpower window, Bloodthrill, Slam’s cast, Spearing Strike and Rend (warrior.md §7, Q3, Q10, Q11, Q13, Q32)', () => {
    const ids = (config: SimConfig) => buildPlan(config).assumptions.map((a) => a.id)
    const arms = defaultConfig('warrior-arms')
    expect(ids(arms)).toEqual(expect.arrayContaining(['overpowerWindow', 'bloodthrill', 'slamCast', 'spearingStrike', 'rendTickCrits', 'rendOnHit']))
    expect(ids(arms)).not.toContain('whiteSwingsOnly')
    // Classic Era: Rend's ticks can't crit, but its landing still procs.
    const classic = ids(withRules(arms, 'classicEra'))
    expect(classic).not.toContain('rendTickCrits')
    expect(classic).toContain('rendOnHit')
    // Without Rend there's no Bloodthrill; in Berserker Stance, no Overpower either.
    expect(ids({ ...arms, rotation: { 'warrior.arms.rend.enabled': false } })).not.toContain('bloodthrill')
    const berserker = ids({ ...arms, rotation: { 'warrior.arms.baseStance': 'berserker' } })
    for (const id of ['overpowerWindow', 'bloodthrill', 'rendTickCrits', 'rendOnHit']) expect(berserker).not.toContain(id)
    // Fury's default uses the Overpower window, for its Overpower dance (on since M2.5b), and Rend's, for its Rend
    // dance (on since W4); without the Rend dance, only the window.
    const fury = ids(defaultConfig('warrior-fury'))
    for (const id of ['overpowerWindow', 'rendTickCrits', 'rendOnHit']) expect(fury).toContain(id)
    for (const id of ['bloodthrill', 'slamCast', 'spearingStrike']) expect(fury).not.toContain(id)
    const noRend = ids({ ...defaultConfig('warrior-fury'), rotation: { 'warrior.fury.rend.enabled': false } })
    expect(noRend).toContain('overpowerWindow')
    for (const id of ['bloodthrill', 'slamCast', 'spearingStrike', 'rendTickCrits', 'rendOnHit']) expect(noRend).not.toContain(id)
    expect(ids({ ...defaultConfig('warrior-fury'), rotation: { 'warrior.fury.overpower.enabled': false } })).not.toContain('overpowerWindow')
  })

  it('lists Heroic Strike’s swing rage for Arms even with Heroic Strike off, since its default rests on it (warrior.md §5.3 notes)', () => {
    const note = (config: SimConfig) => buildPlan(config).assumptions.find((a) => a.id === 'onNextSwingRage')?.text
    const arms = defaultConfig('warrior-arms')
    const plain = 'A Heroic Strike swing generates no rage from its damage, as in Classic Era and as Forever players report; unmeasured.'
    expect(note(arms)).toBe(
      'A Heroic Strike swing generates no rage from its damage, as in Classic Era and as Forever players report; unmeasured: it’s why Arms leaves Heroic Strike off by default.',
    )
    // Turned on, it's the plain note, as Fury's.
    expect(note({ ...arms, rotation: { 'warrior.arms.heroicStrike.enabled': true } })).toBe(plain)
    expect(note(defaultConfig('warrior-fury'))).toBe(plain)
    // Fury with Heroic Strike off doesn't rest on it; nor does an Arms warrior with no weapon, who swings nothing.
    expect(note({ ...defaultConfig('warrior-fury'), rotation: { 'warrior.fury.heroicStrike.enabled': false } })).toBeUndefined()
    const { mainHand: _, ...unarmed } = arms.gear
    expect(note({ ...arms, gear: unarmed })).toBeUndefined()
  })

  it('surfaces Execute’s rage tenths whenever Execute is used, and Improved Bloodrage’s rounding only at 1/2 (warrior.md §7, Q28, Q29)', () => {
    const ids = (config: SimConfig) => buildPlan(config).assumptions.map((a) => a.id)
    const fury = defaultConfig('warrior-fury')
    const arms = defaultConfig('warrior-arms')
    expect(ids(fury)).toContain('executeRageTenths')
    expect(ids(arms)).toContain('executeRageTenths')
    expect(ids({ ...fury, rotation: { 'warrior.fury.execute.enabled': false } })).not.toContain('executeRageTenths')
    // No execute phase: Execute isn't in the rotation.
    expect(ids({ ...fury, fight: { ...fury.fight, executePct: 0 } })).not.toContain('executeRageTenths')
    // Improved Bloodrage: 0/2 in the default Fury build; 1/2 rounds, 2/2 is exact.
    const data = TALENT_DATA.warrior
    const ib = data.trees.flatMap((t) => t.talents).find((t) => t.name === 'Improved Bloodrage')!.id
    const withRank = (rank: number) => ({ ...fury, talents: encodeTalentCode(data, { ...decodeTalentCode(data, fury.talents), [ib]: rank }) })
    expect(ids(fury)).not.toContain('improvedBloodrageRounding')
    expect(ids(withRank(1))).toContain('improvedBloodrageRounding')
    expect(ids(withRank(2))).not.toContain('improvedBloodrageRounding')
    // Without Bloodrage in the rotation (nor before the pull), nothing to round.
    const noBloodrage = { 'warrior.fury.bloodrage.enabled': false, 'warrior.fury.prepull.bloodrage': false }
    expect(ids({ ...withRank(1), rotation: noBloodrage })).not.toContain('improvedBloodrageRounding')
  })

  it('names unmodelled item effects', () => {
    const arms = buildPlan(defaultConfig('warrior-arms')).assumptions.find((a) => a.id === 'unmodelledProcs')
    expect(arms?.text).toContain('Blackblade of Shahram')
  })

  it('names active set bonuses it can’t apply, and not the ones it does', () => {
    // Lieutenant Commander's Battlearmor: (2) +40 AP, a flat stat; (4) Intercept's cooldown, which isn't.
    const pieces = { shoulder: { itemId: 23315 }, chest: { itemId: 23300 }, feet: { itemId: 23287 }, hands: { itemId: 23286 } }
    const note = (gear: SimConfig['gear']) => buildPlan(bare('warrior-arms', { gear })).assumptions.find((a) => a.id === 'unmodelledSetBonuses')
    expect(note(pieces)?.text).toBe('Some of your set bonuses aren’t simulated yet: Lieutenant Commander\'s Battlearmor (4).')
    const { hands: _, ...three } = pieces
    expect(note(three)).toBeUndefined()
  })
})

describe('set bonuses', () => {
  // The plan builder takes gear as given, so a warrior can stand in for these hunter pieces.
  const agility = (gear: SimConfig['gear']) => buildPlan(bare('warrior-arms', { gear })).sheet!.agility

  it('counts a piece only toward a set that lists it (docs/data/items.md#equipping-rules)', () => {
    // Champion's Chain Headguard (16526) is a Classic Era row carrying Classic's set 361, an id
    // Forever reuses for Champion's Pursuit (272490, 272492, …), whose (2) bonus is +20 Agility.
    expect(setOf(ITEMS.get(16526)!)).toBeNull()
    expect(setOf(ITEMS.get(272490)!)).toBe('361')
    const chest = agility({ chest: { itemId: 272490 } })
    expect(agility({ chest: { itemId: 272490 }, head: { itemId: 16526 } }) - chest).toBe(15) // its own 15 Agility, no bonus
    expect(agility({ chest: { itemId: 272490 }, legs: { itemId: 272492 } }) - chest).toBe(13 + 20) // its own 13, and the bonus
  })
})

// warrior.md §2.5 (review DL-4): the rolling Deep Wounds is Forever's assumption; `classicEra` restarts
// the bleed, Classic Era's own rule, so its results don't say it rolls.
describe('the Deep Wounds assumption', () => {
  it('is in a `forever` Fury warrior’s results, and not in a `classicEra` one’s', () => {
    const ids = (profile: 'forever' | 'classicEra') => buildPlan(withRules(defaultConfig('warrior-fury'), profile)).assumptions.map((a) => a.id)
    expect(ids('forever')).toContain('deepWounds')
    expect(ids('classicEra')).not.toContain('deepWounds')
  })
})

// buffs doc §1.1 (D36, review DU-8): the ranks trainable before Ahn'Qiraj, said for every setup whose
// buffs or abilities an Ahn'Qiraj book would raise.
describe('the pre-Ahn’Qiraj ranks assumption', () => {
  const text = (config: SimConfig) => buildPlan(config).assumptions.find((a) => a.id === 'preAqRanks')?.text
  const withBuffs = (spec: SpecId, enabled: string[]): SimConfig => {
    const d = defaultConfig(spec)
    return { ...d, buffs: { ...d.buffs, enabled } }
  }
  const PLAIN = 'Abilities and buffs use the ranks trainable before Ahn’Qiraj, not the higher ones its books teach.'
  const BLESSINGS = 'Abilities and buffs use the ranks trainable before Ahn’Qiraj, not the higher ones its books teach, and the Greater Blessings’ rank 2 is taken to need Ahn’Qiraj too.'

  it('is in every spec’s default results, naming the Greater Blessings where a Blessing of Might or Wisdom is on', () => {
    for (const spec of SPEC_IDS) {
      const d = defaultConfig(spec)
      const blessing = d.buffs.enabled.includes('blessingOfMight') || d.buffs.enabled.includes('blessingOfWisdom')
      expect(text(d), spec).toBe(blessing ? BLESSINGS : PLAIN)
    }
  })

  it('follows the setup: a Fury warrior’s own Battle Shout, a mage’s Frostbolt; none for a Shadow priest with no such buff', () => {
    // Fury keeps its own Battle Shout up, and its Heroic Strike is a book's rank too.
    expect(text(withBuffs('warrior-fury', []))).toBe(PLAIN)
    expect(text(withBuffs('mage-frost', []))).toBe(PLAIN)
    // Mind Blast, Mind Flay and Shadow Word: Pain have no Ahn'Qiraj book, nor Kings.
    expect(text(withBuffs('priest-shadow', []))).toBeUndefined()
    expect(text(withBuffs('priest-shadow', ['blessingOfKings']))).toBeUndefined()
    expect(text(withBuffs('priest-shadow', ['blessingOfWisdom']))).toBe(BLESSINGS)
  })
})
