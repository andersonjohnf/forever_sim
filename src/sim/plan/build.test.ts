// The plan builder and computeSheet against the docs' worked examples: character-stats
// Example 1, warrior W8/W16/W24/W25, threat T3/T20, buffs examples 1–5, encounter WE-4/WE-5.
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, encodeTalentCode } from '@/data/talents/types'
import { meleeChances } from '../core/attack-table'
import { defaultConfig, TALENT_DATA } from '../defaults'
import { presetBuffIds } from '../effects/presets'
import { Sim } from '../engine/sim'
import { computeSheet, normalizeConfig } from '../index'
import { CLASSIC_ERA, FOREVER } from '../rules/profiles'
import type { SimConfig, SpecId } from '../types'
import itemJson from '@/data/items/pre-bis.json'
import type { ItemData } from '@/data/items/types'
import { buildPlan, setOf } from './build'
import { STANCE, STANCE_ANY, TRIGGER } from './types'

/** A bare config: no gear, no talents, no buffs, and no Battle Shout of Arms's own (warrior.md §5.3 row 1). */
function bare(spec: SpecId = 'warrior-arms', patch: Partial<SimConfig> = {}): SimConfig {
  const d = defaultConfig(spec)
  const rotation: SimConfig['rotation'] = spec === 'warrior-arms' ? { 'warrior.arms.battleShout.enabled': false } : {}
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
    // Another warrior's shout: the rotation's own upkeep is off (warrior.md §5.2 row 1).
    const rotation = { 'warrior.fury.battleShout.enabled': false }
    const base = computeSheet(bare('warrior-fury', { rotation }))!.attackPower
    const buffed = computeSheet(bare('warrior-fury', { rotation, buffs: { raid: ['warrior', 'paladin'], enabled: ['battleShout', 'blessingOfMight'] } }))!
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
    expect(buildPlan(d).plan.procs.map((p) => p.id)).not.toContain('overpowerDodge')
    // The Fury default with Bloodthrill 1/5 instead of a point of Improved Heroic Strike's.
    const ranks = decodeTalentCode(TALENT_DATA.warrior, d.talents)
    const withBloodthrill = encodeTalentCode(TALENT_DATA.warrior, { ...ranks, 'warrior-arms-bloodthrill': 1, 'warrior-arms-improved-heroic-strike': 2 })
    const { plan, assumptions } = buildPlan({ ...d, talents: withBloodthrill, rotation: { 'warrior.fury.overpower.enabled': true } })
    const op = plan.abilities.find((a) => a.id === 'overpower')!
    expect(plan.auras[op.window].id).toBe('overpowerWindow')
    const dodge = plan.procs.find((p) => p.id === 'overpowerDodge')!
    expect(dodge).toMatchObject({ trigger: TRIGGER.targetDodge, chance: [1, 1], hands: 3, amount: op.window, b: 0 })
    expect(plan.triggers[TRIGGER.targetDodge]).toEqual([plan.procs.indexOf(dodge)])
    expect(plan.procs.map((p) => p.id)).not.toContain('bloodthrill')
    expect(assumptions.map((a) => a.id)).toContain('overpowerWindow')
    expect(assumptions.map((a) => a.id)).not.toContain('bloodthrill')
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

  it('lists the on-use items and consumables no rotation uses (warrior.md §5.2 rows 3, 16, 17; §7)', () => {
    const d = defaultConfig('warrior-fury')
    const note = (config: SimConfig) => buildPlan(config).assumptions.find((a) => a.id === 'onUseConsumables')?.text
    const ids = (config: SimConfig) => buildPlan(config).assumptions.map((a) => a.id)
    // Standard raid: the Mighty Rage Potion is used.
    expect(d.buffs.enabled).toContain('mightyRagePotion')
    // Blackhand's Breadth (default trinket 2) has Forever's use, which isn't simulated (review L5).
    expect(note(d)).toBe("Some on-use items and consumables aren’t simulated: Blackhand's Breadth.")
    // Max consumables: Juju Flurry is used too; the bomb isn't.
    const max = { ...d, buffs: { raid: d.buffs.raid, enabled: presetBuffIds('max', 'warrior-fury', d.buffs.raid) } }
    expect(max.buffs.enabled).toEqual(expect.arrayContaining(['jujuFlurry', 'ezThroDarkBomb']))
    expect(note(max)).toBe("Some on-use items and consumables aren’t simulated: EZ-Thro Dark Bomb, Blackhand's Breadth.")
    // Weakness Analyzer is used (with its own note); Diamond Flask isn't.
    const trinkets = { ...d, gear: { ...d.gear, trinket1: { itemId: 272438 }, trinket2: { itemId: 20130 } } }
    expect(note(trinkets)).toBe('Some on-use items and consumables aren’t simulated: Diamond Flask.')
    expect(ids(trinkets)).toContain('weaknessAnalyzer')
    expect(ids(d)).not.toContain('weaknessAnalyzer')
    // Arms uses them too (warrior.md §5.3 rows 3 and 17); a spec without a rotation uses none of them.
    const arms = defaultConfig('warrior-arms')
    // Weakness Analyzer is used; Blackhand's Breadth (trinket 2) keeps its not-simulated use (review L5).
    expect(note({ ...arms, gear: { ...arms.gear, trinket1: { itemId: 272438 } } })).toBe(
      "Some on-use items and consumables aren’t simulated: Blackhand's Breadth.",
    )
    const prot = defaultConfig('warrior-protection')
    expect(note({ ...prot, gear: { ...prot.gear, trinket1: { itemId: 272438 } } })).toContain('Weakness Analyzer')
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
    // Fury's default uses none of them.
    const fury = ids(defaultConfig('warrior-fury'))
    for (const id of ['overpowerWindow', 'bloodthrill', 'slamCast', 'spearingStrike', 'rendTickCrits', 'rendOnHit']) expect(fury).not.toContain(id)
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
