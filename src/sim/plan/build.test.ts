// The plan builder and computeSheet against the docs' worked examples: character-stats
// Example 1, warrior W8/W16/W24/W25, threat T3/T20, buffs examples 1–5, encounter WE-4/WE-5.
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, encodeTalentCode } from '@/data/talents/types'
import { meleeChances } from '../core/attack-table'
import { defaultConfig, TALENT_DATA } from '../defaults'
import { Sim } from '../engine/sim'
import { computeSheet, normalizeConfig } from '../index'
import { CLASSIC_ERA, FOREVER } from '../rules/profiles'
import type { SimConfig, SpecId } from '../types'
import { buildPlan } from './build'
import { STANCE, STANCE_ANY } from './types'

/** A bare config: no gear, no talents, no buffs. */
function bare(spec: SpecId = 'warrior-arms', patch: Partial<SimConfig> = {}): SimConfig {
  const d = defaultConfig(spec)
  return { ...d, race: 'alliance-human', talents: '', gear: {}, buffs: { raid: d.buffs.raid, enabled: [] }, ...patch }
}

const withRules = (c: SimConfig, profile: 'forever' | 'classicEra'): SimConfig => ({ ...c, rules: { ...c.rules, profile } })

describe('character-stats Example 1 through computeSheet', () => {
  it('naked Human warrior (Battle Stance: Arms)', () => {
    const s = computeSheet(bare())!
    expect([s.strength, s.agility, s.stamina, s.spirit]).toEqual([120, 80, 110, 47])
    expect(s.attackPower).toBe(400)
    expect(s.critPct).toBeCloseTo(4, 9)
    expect(s.hitPct).toBe(0)
    expect(s.armor).toBe(160)
    expect(s.health).toBe(920)
    expect(s.weaponSkill).toEqual({ mainHand: 300, offHand: null })
    expect(s.mana).toBeNull()
    expect(s.unknown).toEqual(['base dodge', 'base health'])
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
    expect(s.health).toBe(1030)
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
  it('5: Battle Shout + Blessing of Might = 272 attack power', () => {
    const base = computeSheet(bare('warrior-fury'))!.attackPower
    const buffed = computeSheet(bare('warrior-fury', { buffs: { raid: ['warrior', 'paladin'], enabled: ['battleShout', 'blessingOfMight'] } }))!
    expect(buffed.attackPower - base).toBe(272)
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
  it('WE-4: Demoralizing Shout takes 28 (Classic 20) off each 2.0 s swing', () => {
    expect(tank(['demoralizingShout']).minDamage).toBeCloseTo(4972, 9)
    expect(tank(['demoralizingShout'], 'classicEra').maxDamage).toBeCloseTo(4980, 9)
  })
  it('WE-5: Thunder Clap slows the boss to 2.4 s (Classic 2.2 s)', () => {
    expect(tank(['thunderClap']).speedSec).toBeCloseTo(2.4, 9)
    expect(tank(['thunderClap'], 'classicEra').speedSec).toBeCloseTo(2.2, 9)
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

  it('gives racial weapon crit only to that weapon’s hand', () => {
    const { plan } = buildPlan(defaultConfig('warrior-fury')) // Human: Ironfoe (mace) + Mirah's Song (sword)
    expect(plan.weapons[0]!.critBonus).toBe(0)
    expect(plan.weapons[1]!.critBonus).toBe(2)
  })
})

describe('setups the engine can’t run yet', () => {
  it('flags paladin and druid sheets and blocks their simulation', () => {
    for (const spec of ['paladin-retribution', 'druid-feral-cat'] as const) {
      const bundle = buildPlan(defaultConfig(spec))
      expect(bundle.sheet.unknown).toContain('base attributes')
      expect(bundle.blockers.length).toBeGreaterThan(0)
      expect(bundle.assumptions.map((a) => a.id)).toContain('unknownBaseAttributes')
      expect(computeSheet(defaultConfig(spec))).not.toBeNull()
    }
    expect(computeSheet(defaultConfig('paladin-retribution'))!.mana).toBeGreaterThan(1512)
  })

  it('blocks Skyborne warriors, whose base stats are unknown', () => {
    const bundle = buildPlan({ ...defaultConfig('warrior-fury'), race: 'horde-skyborne-windshaper' })
    expect(bundle.blockers[0]).toMatch(/Skyborne/)
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
    expect(prot).toEqual(expect.arrayContaining(['bossMelee', 'damageTakenRage', 'foreverBossParry', 'whiteThreat', 'defiance', 'shieldBlockValue']))
    const classic = ids(withRules(defaultConfig('warrior-arms'), 'classicEra'))
    expect(classic).not.toContain('foreverGlancing')
    expect(classic).not.toContain('foreverWhiteRage')
    for (const a of buildPlan(defaultConfig('warrior-protection')).assumptions) {
      expect(a.docRef).toMatch(/^docs\//)
      expect(a.text.length).toBeGreaterThan(20)
    }
  })

  it('surfaces Unbridled Wrath on Heroic Strike swings and Raging Blows only when the build relies on them', () => {
    const ids = (config: SimConfig) => buildPlan(config).assumptions.map((a) => a.id)
    const fury = defaultConfig('warrior-fury')
    expect(ids(fury)).toEqual(expect.arrayContaining(['unbridledWrathSwings', 'ragingBlows', 'partialRotation', 'abilityRefunds']))
    const noTalents = ids({ ...fury, talents: '' })
    expect(noTalents).not.toContain('unbridledWrathSwings')
    expect(noTalents).not.toContain('ragingBlows')
    // A two-hander has no off hand for Raging Blows.
    const twoHander = ids({ ...fury, gear: { ...fury.gear, mainHand: { itemId: 12784 }, offHand: undefined } })
    expect(twoHander).not.toContain('ragingBlows')
    expect(twoHander).toContain('unbridledWrathSwings')
    expect(ids({ ...fury, rotation: { 'warrior.fury.whirlwind.enabled': false } })).not.toContain('ragingBlows')
  })

  it('flags Eureka! as not simulated, and no other racial cooldown (warrior.md §2.9, Q18)', () => {
    const ids = (race: string) => buildPlan({ ...defaultConfig('warrior-fury'), race }).assumptions.map((a) => a.id)
    expect(ids('alliance-gnome')).toContain('cooldownRacial')
    for (const race of ['horde-orc', 'horde-troll', 'alliance-night-elf', 'alliance-human']) expect(ids(race)).not.toContain('cooldownRacial')
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

  it('names unmodelled item effects', () => {
    const arms = buildPlan(defaultConfig('warrior-arms')).assumptions.find((a) => a.id === 'unmodelledProcs')
    expect(arms?.text).toContain('Blackblade of Shahram')
  })
})
