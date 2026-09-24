// The Protection abilities against the Forever client data, its talents on them (W14, W20), and
// its priority list and settings (docs/classes/warrior.md §2.8, §3.1, §3.2, §4.3, §5.1, §5.4).
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import type { ClientSpells } from '@/data/client/types'
import { TALENT_DATA, defaultConfig } from '../../defaults'
import { COND, STANCE, STANCE_ANY } from '../../plan/types'
import { CLASSIC_ERA, FOREVER } from '../../rules/profiles'
import type { OnUseSpec } from '../../effects/types'
import { talentRanksByName } from '..'
import { resolveRotationValues } from '../options'
import { buildPlan } from '../../plan/build'
import { FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import type { SimConfig } from '../../types'
import { rotationPreset, rotationValues, unusedRotationSettings } from '../..'
import { defaultAplOrder, moveAplRow } from '../apl'
import {
  DEMORALIZING_SHOUT,
  demoralizingShout,
  EXECUTE,
  REVENGE,
  REVENGE_WINDOW,
  revengeWindowProcs,
  SHIELD_BLOCK,
  SHIELD_SLAM,
  SUNDER_ARMOR,
  THUNDER_CLAP,
  thunderClap,
} from './abilities'
import { IMPROVED_REVENGE_PCT_PER_RANK, withTalents } from './modifiers'
import { PROTECTION_APL, PROTECTION_IDS as ID, PROTECTION_OPTIONS, PROTECTION_PRIORITY, protectionMaintainedBuffs, protectionRotation } from './protection'
import { maxRageOf } from './shared'

const spells = (spellsJson as unknown as ClientSpells).spells
const RAGE = 1
/** `ShapeshiftMask` bits for Battle (17) and Defensive (18) Stance. */
const FORM = { battle: 1 << 16, defensive: 1 << 17 }
/** SpellAura codes: 22 resistance (armor), 51 block chance, 99 attack power, 319 melee attack speed. */
const AURA = { armor: 22, block: 51, ap: 99, slow: 319 }
/** `EquippedItemSubclass` 64: shields (item class 4, armor). */
const SHIELD = 64

/** The default Protection build's talents by name (8/5/38, warrior.md §6.1). */
const TALENTS = talentRanksByName(TALENT_DATA.warrior, defaultConfig('warrior-protection').talents)
/** The Defensive preset, the default before Balanced (D28): the duties first, tuned on threat. */
const DEFENSIVE = { [ID.priority]: PROTECTION_PRIORITY.defensive }
const noAura = () => -1
type Rot = ReturnType<typeof protectionRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const linesOf = (r: Rot, id: string) => r.rotation.filter((e) => r.abilities[e.ability].id === id)
const at = (r: Rot, id: string) => r.abilities.findIndex((a) => a.id === id)
const cost = (spell: number) => spells[String(spell)].power?.find((p) => (p.powerType ?? 0) === RAGE)?.manaCost ?? 0
const aura = (spell: number, code: number) => spells[String(spell)].effects.find((e) => e.effectAura === code)!

describe('Protection abilities match src/data/client/spells.json (warrior.md §3.1, §3.2)', () => {
  it('Shield Slam (23925): 20 rage, 6 s, the GCD, any stance, a shield, 655 ± 15 (the tooltip’s 640–670) + block value, two rolls', () => {
    const s = spells['23925']
    expect(s.name).toBe('Shield Slam')
    expect([cost(23925), s.cooldowns?.categoryRecoveryTime, s.cooldowns?.startRecoveryTime]).toEqual([SHIELD_SLAM.costTenths, SHIELD_SLAM.cooldownMs, SHIELD_SLAM.gcdMs])
    expect(s.shapeshift).toBeUndefined()
    expect(SHIELD_SLAM.stances).toBe(STANCE_ANY)
    expect(s.equippedItems).toMatchObject({ equippedItemClass: 4, equippedItemSubclass: SHIELD })
    expect(SHIELD_SLAM.shieldOnly).toBe(true)
    expect(s.categories?.defenseType).toBe(2)
    expect(SHIELD_SLAM.kind).toBe('meleeSpell')
    const dmg = s.effects.find((e) => e.effect === 2)!
    expect(SHIELD_SLAM.flatDamage).toBe(dmg.effectBasePointsF)
    // The client's variance is the whole range as a share of the base: 655 × 0.0457 / 2 = 14.97.
    expect(Math.round(dmg.effectBasePointsF! * (1 - dmg.variance! / 2))).toBe(640)
    expect(Math.round(dmg.effectBasePointsF! * (1 + dmg.variance! / 2))).toBe(670)
    expect([SHIELD_SLAM.flatDamage - SHIELD_SLAM.flatSpread!, SHIELD_SLAM.flatDamage + SHIELD_SLAM.flatSpread!]).toEqual([640, 670])
    expect(SHIELD_SLAM.blockValueCoefficient).toBe(1)
    expect([SHIELD_SLAM.threatMult, SHIELD_SLAM.threatBonus, SHIELD_SLAM.refundShare]).toEqual([1, 254, 0.8])
  })

  it('Revenge (25288): 5 rage, 5 s, the GCD, Defensive Stance, 153 ± 15 (the tooltip’s 138–168), two rolls, its window', () => {
    const s = spells['25288']
    expect(s.name).toBe('Revenge')
    expect([cost(25288), s.cooldowns?.categoryRecoveryTime, s.cooldowns?.startRecoveryTime]).toEqual([REVENGE.costTenths, REVENGE.cooldownMs, REVENGE.gcdMs])
    expect(s.shapeshift?.shapeshiftMask?.[0]).toBe(FORM.defensive)
    expect(REVENGE.stances).toBe(STANCE.defensive)
    // The window is the server's aura state 1, set on a block, dodge or parry (§2.8).
    expect(s.auraRestrictions?.casterAuraState).toBe(1)
    expect(REVENGE.window).toBe(REVENGE_WINDOW)
    expect(REVENGE_WINDOW.durationMs).toBe(5000)
    const dmg = s.effects.find((e) => e.effect === 2)!
    expect(REVENGE.flatDamage).toBe(dmg.effectBasePointsF)
    expect(Math.round(dmg.effectBasePointsF! * (1 - dmg.variance! / 2))).toBe(138)
    expect(Math.round(dmg.effectBasePointsF! * (1 + dmg.variance! / 2))).toBe(168)
    expect(REVENGE.flatSpread).toBe(15)
    expect([REVENGE.kind, REVENGE.threatMult, REVENGE.threatBonus, REVENGE.shieldOnly ?? false]).toEqual(['meleeSpell', 2.25, 270, false])
  })

  it('Sunder Armor (11597): 15 rage, the GCD, any stance; −450 armor, 5 stacks, 30 s, and a threat effect of 1013; no damage', () => {
    const s = spells['11597']
    expect(s.name).toBe('Sunder Armor')
    expect([cost(11597), s.cooldowns?.categoryRecoveryTime ?? 0, s.cooldowns?.startRecoveryTime]).toEqual([SUNDER_ARMOR.costTenths, 0, SUNDER_ARMOR.gcdMs])
    expect(SUNDER_ARMOR.stances).toBe(STANCE_ANY)
    expect(s.categories?.defenseType).toBe(2)
    expect(SUNDER_ARMOR.kind).toBe('weaponStrike')
    expect(aura(11597, AURA.armor).effectBasePointsF).toBe(-SUNDER_ARMOR.aura!.mods.targetArmor!)
    expect(s.auraOptions?.cumulativeAura).toBe(SUNDER_ARMOR.aura!.maxStacks)
    expect(s.duration?.duration).toBe(SUNDER_ARMOR.aura!.durationMs)
    expect(s.effects.find((e) => e.effect === 63)?.effectBasePointsF).toBe(SUNDER_ARMOR.threatBonus)
    expect([SUNDER_ARMOR.weaponPercent, SUNDER_ARMOR.flatDamage, SUNDER_ARMOR.threatMult]).toEqual([0, 0, 0])
    // Its stacks are the Buffs tab's Sunder Armor ×5, so the plan can drop that one.
    expect(SUNDER_ARMOR.aura!.id).toBe('sunderArmor')
  })

  it('Thunder Clap (11581): 20 rage, 6 s, the GCD, Battle or Defensive Stance, the spell table, 103 damage and a 20% slow for 30 s', () => {
    const s = spells['11581']
    expect(s.name).toBe('Thunder Clap')
    expect([cost(11581), s.cooldowns?.categoryRecoveryTime, s.cooldowns?.startRecoveryTime]).toEqual([THUNDER_CLAP.costTenths, THUNDER_CLAP.cooldownMs, THUNDER_CLAP.gcdMs])
    expect(s.shapeshift?.shapeshiftMask?.[0]).toBe(FORM.battle | FORM.defensive)
    expect(THUNDER_CLAP.stances).toBe(STANCE.battle | STANCE.defensive)
    expect(s.categories?.defenseType).toBe(1)
    expect(THUNDER_CLAP.kind).toBe('spellTable')
    expect(s.effects.find((e) => e.effect === 2)?.effectBasePointsF).toBe(THUNDER_CLAP.flatDamage)
    expect(aura(11581, AURA.slow).effectBasePointsF).toBe(-THUNDER_CLAP.aura!.mods.bossSlow!)
    expect(s.duration?.duration).toBe(THUNDER_CLAP.aura!.durationMs)
    expect([THUNDER_CLAP.threatMult, THUNDER_CLAP.threatBonus]).toEqual([2.5, 0])
    // The rule profile's slow, as the Buffs tab's Thunder Clap reads it.
    expect(thunderClap(FOREVER)).toBe(THUNDER_CLAP)
    expect(thunderClap(CLASSIC_ERA).aura!.mods.bossSlow).toBe(10)
  })

  it('Demoralizing Shout (11556): 10 rage, the GCD, any stance, the spell table, −204 attack power at 60 for 45 s; no damage', () => {
    const s = spells['11556']
    expect(s.name).toBe('Demoralizing Shout')
    expect([cost(11556), s.cooldowns?.startRecoveryTime]).toEqual([DEMORALIZING_SHOUT.costTenths, DEMORALIZING_SHOUT.gcdMs])
    expect(s.categories?.defenseType).toBe(1)
    expect(DEMORALIZING_SHOUT.kind).toBe('spellTable')
    const ap = aura(11556, AURA.ap)
    // −196 − 1.4 per level above 54, at 60: −204.4, the tooltip's 204 (warrior.md §3.2).
    expect(Math.round(ap.effectBasePointsF! + ap.effectRealPointsPerLevel! * (60 - 54))).toBe(DEMORALIZING_SHOUT.aura!.mods.bossAp)
    expect(s.duration?.duration).toBe(DEMORALIZING_SHOUT.aura!.durationMs)
    expect([DEMORALIZING_SHOUT.flatDamage, DEMORALIZING_SHOUT.threatBonus]).toEqual([0, 43.2])
    expect(demoralizingShout(FOREVER)).toBe(DEMORALIZING_SHOUT)
    expect(demoralizingShout(CLASSIC_ERA).aura!.mods.bossAp).toBe(-146)
  })

  it('Shield Block (2565): 10 rage, 5 s, off the GCD, Defensive Stance, a shield; +75% block for 7 s or 2 blocks', () => {
    const s = spells['2565']
    expect(s.name).toBe('Shield Block')
    expect([cost(2565), s.cooldowns?.recoveryTime, s.cooldowns?.startRecoveryTime ?? 0]).toEqual([SHIELD_BLOCK.costTenths, SHIELD_BLOCK.cooldownMs, SHIELD_BLOCK.gcdMs])
    expect(s.shapeshift?.shapeshiftMask?.[0]).toBe(FORM.defensive)
    expect(SHIELD_BLOCK.stances).toBe(STANCE.defensive)
    expect(s.equippedItems).toMatchObject({ equippedItemClass: 4, equippedItemSubclass: SHIELD })
    expect(SHIELD_BLOCK.shieldOnly).toBe(true)
    expect(SHIELD_BLOCK.kind).toBe('cast')
    expect(aura(2565, AURA.block).effectBasePointsF).toBe(SHIELD_BLOCK.aura!.mods.block)
    expect(s.duration?.duration).toBe(SHIELD_BLOCK.aura!.durationMs)
    expect(s.auraOptions?.procCharges).toBe(SHIELD_BLOCK.aura!.blockCharges)
  })

  it('the Revenge window opens on a dodge or parry, and on a block, of the boss’s swings', () => {
    expect(revengeWindowProcs().map((p) => [p.trigger, p.chance, p.action])).toEqual([
      ['dodgeParry', { pct: 100 }, { kind: 'aura', aura: REVENGE_WINDOW }],
      ['block', { pct: 100 }, { kind: 'aura', aura: REVENGE_WINDOW }],
    ])
  })
})

describe('Protection talents on its abilities (warrior.md §4.3, W14, W20)', () => {
  it('Improved Revenge is +20% per rank (12797, curve 20 / 40 / 60) on its base and range: 244.8 ± 24 at 3/3', () => {
    const s = spells['12797']
    expect(s.effects[0]).toMatchObject({ effectAura: 108, effectBasePointsF: 3 * IMPROVED_REVENGE_PCT_PER_RANK })
    const r = withTalents(REVENGE, TALENTS)
    expect(r.flatDamage).toBeCloseTo(244.8, 12)
    expect(r.flatSpread).toBeCloseTo(24, 12)
    // W14 then takes Bastion's ×1.10 and Defensive Stance's ×0.90 in the plan: 242.35, 218.59–266.11.
    expect(r.flatDamage * 1.1 * 0.9).toBeCloseTo(242.35, 2)
  })

  it('W26: threat per GCD and per rage, the default build (×1.495, block value 62, average hits, no armor or crits)', () => {
    const m = 1.3 * 1.15 // W16
    const dmg = 0.99 // Bastion 5/5 × Defensive Stance
    const threat = (def: typeof SUNDER_ARMOR) => {
      const a = withTalents(def, TALENTS)
      const damage = (a.flatDamage + 62 * (a.blockValueCoefficient ?? 0)) * dmg
      const t = (damage * a.threatMult + a.threatBonus) * m
      return [Math.round(t * 100) / 100, a.costTenths / 10, Math.round((t / (a.costTenths / 10)) * 100) / 100]
    }
    expect(threat(SUNDER_ARMOR)).toEqual([1514.44, 9, 168.27])
    expect(threat(SHIELD_SLAM)).toEqual([1440.93, 17, 84.76])
    expect(threat(REVENGE)).toEqual([1218.86, 2, 609.43])
    expect(threat(THUNDER_CLAP)).toEqual([381.11, 17, 22.42])
    expect(threat(DEMORALIZING_SHOUT)).toEqual([64.58, 7, 9.23])
  })

  it('W20: the default build’s costs (Focused Rage 3/3, Improved Sunder Armor 3/3)', () => {
    const costs = [SUNDER_ARMOR, SHIELD_SLAM, REVENGE, THUNDER_CLAP, DEMORALIZING_SHOUT, SHIELD_BLOCK].map((a) => withTalents(a, TALENTS).costTenths / 10)
    expect(costs).toEqual([9, 17, 2, 17, 7, 10])
  })
})

describe('Protection rotation options (warrior.md §5.1, §5.4)', () => {
  it('declares valid, uniquely named settings in its spec’s namespace', () => {
    const optionIds = PROTECTION_OPTIONS.map((o) => o.id)
    expect(new Set(optionIds).size).toBe(optionIds.length)
    // The priority shapes the rest, so it comes first, without a heading (docs/ux.md "Rotation").
    const [priority, ...rest] = PROTECTION_OPTIONS
    // Balanced is the default (D28); Defensive keeps the old default's stored value, so a setup that chose it loads as Defensive.
    expect(priority).toMatchObject({ kind: 'choice', id: 'warrior.protection.priority', default: 'balanced' })
    expect(priority.kind === 'choice' && priority.choices).toEqual([
      { value: 'duties', label: 'Defensive' },
      { value: 'balanced', label: 'Balanced' },
      { value: 'maxTps', label: 'Max TPS' },
    ])
    expect(priority.group).toBeUndefined()
    for (const option of rest) {
      expect(option.id).toMatch(/^warrior\.protection\.[a-zA-Z]+\.[a-zA-Z]+$/)
      expect(option.label.length).toBeGreaterThan(0)
      expect(option.help.length).toBeGreaterThan(0)
      expect(option.group).toBeDefined()
      if (option.kind === 'number') {
        expect(option.min).toBeLessThanOrEqual(option.default)
        expect(option.default).toBeLessThanOrEqual(option.max)
      }
      if (option.dependsOn !== undefined) expect(PROTECTION_OPTIONS.find((o) => o.id === option.dependsOn)?.kind, option.id).toBe('toggle')
    }
    // No Death Wish to sync the racial and trinkets with.
    expect(optionIds).not.toContain('warrior.protection.cooldowns.syncWithDeathWish')
  })

  it('Charge in is on by default with Vanguard (§5.4 row 0)', () => {
    expect(resolveRotationValues(PROTECTION_OPTIONS, {}, TALENTS)[ID.prepullCharge]).toBe(true)
    expect(resolveRotationValues(PROTECTION_OPTIONS, {}, new Map())[ID.prepullCharge]).toBe(false)
  })

  it('keeps Battle Shout, and the boss’s Sunder Armor, Thunder Clap and Demoralizing Shout, itself', () => {
    expect(protectionMaintainedBuffs(DEFENSIVE)).toEqual(['battleShout', 'sunderArmor', 'thunderClap', 'demoralizingShout'])
    // Balanced, the default, keeps Sunder Armor and leaves the slow and the shout to the Buffs tab.
    expect(protectionMaintainedBuffs({})).toEqual(['battleShout', 'sunderArmor'])
    const off = { [ID.sunderEnabled]: false, [ID.fillerEnabled]: false, [ID.tcEnabled]: false, [ID.demoEnabled]: false, [ID.bsEnabled]: false }
    expect(protectionMaintainedBuffs(off)).toEqual([])
    // The filler keeps Sunder Armor up by itself.
    expect(protectionMaintainedBuffs({ ...off, [ID.fillerEnabled]: true })).toEqual(['sunderArmor'])
    const maintains = PROTECTION_OPTIONS.flatMap((o) => (o.kind === 'toggle' && o.maintainsBuff ? [[o.id, o.maintainsBuff]] : []))
    expect(maintains).toEqual([
      [ID.bsEnabled, 'battleShout'],
      [ID.tcEnabled, 'thunderClap'],
      [ID.demoEnabled, 'demoralizingShout'],
      [ID.sunderEnabled, 'sunderArmor'],
      [ID.fillerEnabled, 'sunderArmor'],
    ])
  })
})

describe('Max TPS (warrior.md §5.4 "Priority" and "Max TPS", D26)', () => {
  const MAX = { [ID.priority]: PROTECTION_PRIORITY.maxTps }
  const DUTIES = [ID.sbEnabled, ID.tcEnabled, ID.demoEnabled]

  it('drops the duties, Shield Block, Thunder Clap and Demoralizing Shout, by default, keeps Shield Slam, and queues Heroic Strike from 45', () => {
    const duties = resolveRotationValues(PROTECTION_OPTIONS, DEFENSIVE, TALENTS)
    const max = resolveRotationValues(PROTECTION_OPTIONS, MAX, TALENTS)
    for (const id of DUTIES) expect([id, duties[id], max[id]]).toEqual([id, true, false])
    // D26's amendment: Max TPS drops only the duties.
    expect([duties[ID.slamEnabled], max[ID.slamEnabled]]).toEqual([true, true])
    expect([duties[ID.hsMinRage], max[ID.hsMinRage]]).toEqual([76, 45])
    // Nothing else moves: the search found no other setting better (§5.4 "Max TPS").
    const moved = Object.keys(duties).filter((id) => duties[id] !== max[id])
    expect(moved.sort()).toEqual([ID.priority, ...DUTIES, ID.hsMinRage].sort())
    // Each switch's help says it follows the choice.
    for (const id of [...DUTIES, ID.hsMinRage]) expect(PROTECTION_OPTIONS.find((o) => o.id === id)!.help, id).toContain('Max TPS')
  })

  it('keeps a value you set yourself, and Balanced is the default', () => {
    const own = resolveRotationValues(PROTECTION_OPTIONS, { ...MAX, [ID.sbEnabled]: true, [ID.hsMinRage]: 70 }, TALENTS)
    expect([own[ID.sbEnabled], own[ID.hsMinRage], own[ID.tcEnabled]]).toEqual([true, 70, false])
    const back = resolveRotationValues(PROTECTION_OPTIONS, { [ID.priority]: PROTECTION_PRIORITY.balanced }, TALENTS)
    expect(back).toEqual(resolveRotationValues(PROTECTION_OPTIONS, {}, TALENTS))
  })

  it('leaves Thunder Clap and Demoralizing Shout to the Buffs tab, and its rows are the rest of the list', () => {
    expect(protectionMaintainedBuffs(MAX)).toEqual(['battleShout', 'sunderArmor'])
    const r = protectionRotation(MAX, TALENTS, noAura, { race: 'alliance-human' })
    expect(r.rotation.map((e) => r.abilities[e.ability].id)).toEqual([
      'bloodrage',
      'shieldSlam',
      'revenge',
      'battleShout',
      'sunderArmor',
      'sunderArmor',
      'sunderArmor',
      'heroicStrike',
      'heroicStrike',
    ])
    expect(linesOf(r, 'heroicStrike')[0].conditions).toEqual([{ code: COND.minRage, a: 450, b: 0 }])
  })
})

describe('Balanced (warrior.md §5.4 "Balanced", D28)', () => {
  const BALANCED = { [ID.priority]: PROTECTION_PRIORITY.balanced }

  it('keeps Shield Block and Sunder Armor’s 5 stacks, refreshed by the duty rule; drops Thunder Clap and Demoralizing Shout; the filler from 60 rage; Heroic Strike from 84', () => {
    const def = resolveRotationValues(PROTECTION_OPTIONS, DEFENSIVE, TALENTS)
    const bal = resolveRotationValues(PROTECTION_OPTIONS, {}, TALENTS)
    expect(resolveRotationValues(PROTECTION_OPTIONS, BALANCED, TALENTS)).toEqual(bal)
    expect(bal).toMatchObject({
      [ID.sbEnabled]: true,
      [ID.sbMinRage]: 10,
      [ID.sunderEnabled]: true,
      // D26's rule for a debuff without a cooldown: one global cooldown.
      [ID.sunderRefresh]: 1.5,
      [ID.tcEnabled]: false,
      [ID.demoEnabled]: false,
      [ID.fillerEnabled]: true,
      // The filler only above 60% rage (user decision, D28): 60 of the default build's 100.
      [ID.fillerMinRage]: 60,
      [ID.slamEnabled]: true,
      [ID.hsMinRage]: 84,
      [ID.hsLastSec]: 12,
    })
    // Nothing else moves: the first-pass search found no other setting better (§5.4 "Balanced", D27).
    const moved = Object.keys(def).filter((id) => def[id] !== bal[id])
    expect(moved.sort()).toEqual([ID.priority, ID.tcEnabled, ID.demoEnabled, ID.sunderRefresh, ID.fillerMinRage, ID.hsMinRage].sort())
    for (const id of [ID.tcEnabled, ID.demoEnabled, ID.sunderRefresh, ID.fillerMinRage, ID.hsMinRage]) expect(PROTECTION_OPTIONS.find((o) => o.id === id)!.help, id).toContain('Balanced')
  })

  it('builds the list without Thunder Clap or Demoralizing Shout, Sunder Armor again with 1.5 s left, and the filler from 60 rage', () => {
    const r = protectionRotation({}, TALENTS, noAura, { race: 'alliance-human' })
    expect(ids(r)).toEqual(['shieldBlock', 'bloodrage', 'shieldSlam', 'revenge', 'battleShout', 'sunderArmor', 'sunderArmor', 'sunderArmor', 'heroicStrike', 'heroicStrike'])
    const sunder = at(r, 'sunderArmor')
    expect(linesOf(r, 'sunderArmor').map((e) => e.conditions)).toEqual([
      [{ code: COND.abilityAuraStacksBelow, a: sunder, b: 5 }],
      [{ code: COND.abilityAuraRefresh, a: sunder, b: 1500 }],
      [{ code: COND.minRage, a: 600, b: 0 }],
    ])
    expect(linesOf(r, 'heroicStrike')[0].conditions).toEqual([{ code: COND.minRage, a: 840, b: 0 }])
  })

  describe('its thresholds are shares of the rage bar: the filler from 60%, Heroic Strike from 84% (§5.4 "Balanced", D28)', () => {
    const BOUNDLESS = new Map([...TALENTS, ['Boundless Rage', 3]])
    const thresholds = (r: Rot) => ({
      filler: linesOf(r, 'sunderArmor')[2].conditions,
      hs: linesOf(r, 'heroicStrike')[0].conditions,
    })
    const minRages = (filler: number, hs: number) => ({
      filler: [{ code: COND.minRage, a: filler * 10, b: 0 }],
      hs: [{ code: COND.minRage, a: hs * 10, b: 0 }],
    })

    it('reads the max rage the plan has: 100, a Gnome’s 105, Boundless Rage 3/3’s 130, both 136.5', () => {
      for (const [race, talents, max] of [
        ['alliance-human', TALENTS, 100],
        ['alliance-gnome', TALENTS, 105],
        ['alliance-human', BOUNDLESS, 130],
        ['alliance-gnome', BOUNDLESS, 136.5],
      ] as const) {
        expect(maxRageOf(talents, race), `${race} ${talents.get('Boundless Rage') ?? 0}`).toBe(max)
      }
      // The plan's own max rage: the default talents, and a build with Boundless Rage 3/3.
      const boundless = '05-05050003-552101233301210031'
      expect(talentRanksByName(TALENT_DATA.warrior, boundless).get('Boundless Rage')).toBe(3)
      for (const [race, talents, max] of [
        ['alliance-human', undefined, 100],
        ['alliance-gnome', undefined, 105],
        ['alliance-human', boundless, 130],
        ['alliance-gnome', boundless, 136.5],
      ] as const) {
        const d = defaultConfig('warrior-protection')
        const config = { ...d, race, talents: talents ?? d.talents }
        expect(buildPlan(config).plan.rage.maxTenths / 10).toBe(max)
        expect(maxRageOf(talentRanksByName(TALENT_DATA.warrior, config.talents), race)).toBe(max)
      }
    })

    it('at 100 max rage, plays exactly as the absolute 60 and 84 did', () => {
      const r = protectionRotation({}, TALENTS, noAura, { race: 'alliance-human' })
      expect(r).toEqual(protectionRotation({ [ID.fillerMinRage]: 60, [ID.hsMinRage]: 84 }, TALENTS, noAura, { race: 'alliance-human' }))
      expect(thresholds(r)).toEqual(minRages(60, 84))
    })

    it('a Gnome’s 105 max rage: the filler from 63, Heroic Strike from 88', () => {
      expect(resolveRotationValues(PROTECTION_OPTIONS, {}, TALENTS, { maxRage: 105 })).toMatchObject({ [ID.fillerMinRage]: 63, [ID.hsMinRage]: 88 })
      expect(thresholds(protectionRotation({}, TALENTS, noAura, { race: 'alliance-gnome' }))).toEqual(minRages(63, 88))
    })

    it('Boundless Rage 3/3’s 130: the filler from 78, Heroic Strike from 109; with a Gnome’s 136.5, 82 and 115', () => {
      expect(thresholds(protectionRotation({}, BOUNDLESS, noAura, { race: 'alliance-human' }))).toEqual(minRages(78, 109))
      expect(thresholds(protectionRotation({}, BOUNDLESS, noAura, { race: 'alliance-gnome' }))).toEqual(minRages(82, 115))
    })

    it('only Balanced’s defaults scale: a value you set, and Defensive’s and Max TPS’s, stay in rage points', () => {
      expect(thresholds(protectionRotation({ [ID.fillerMinRage]: 60, [ID.hsMinRage]: 84 }, BOUNDLESS, noAura, { race: 'alliance-gnome' }))).toEqual(minRages(60, 84))
      expect(resolveRotationValues(PROTECTION_OPTIONS, DEFENSIVE, BOUNDLESS, { maxRage: 136.5 })).toMatchObject({ [ID.fillerMinRage]: 9, [ID.hsMinRage]: 76 })
      expect(resolveRotationValues(PROTECTION_OPTIONS, { [ID.priority]: PROTECTION_PRIORITY.maxTps }, BOUNDLESS, { maxRage: 136.5 })).toMatchObject({ [ID.hsMinRage]: 45 })
    })

    it('the Rotation tab reads the same values as the sim, and a Gnome at the defaults is still on Balanced', () => {
      const gnome = { ...defaultConfig('warrior-protection'), race: 'alliance-gnome' }
      expect(rotationValues(gnome)).toMatchObject({ [ID.fillerMinRage]: 63, [ID.hsMinRage]: 88 })
      expect(rotationPreset(gnome)).toBe('default')
      // The Human's 60, saved by hand on a Gnome, is a changed setting: Custom.
      expect(rotationPreset({ ...gnome, rotation: { [ID.fillerMinRage]: 60 } })).toBe('custom')
    })
  })
})

describe('the Protection priority list (warrior.md §5.4)', () => {
  const potion: OnUseSpec = { id: 'mightyRagePotion', name: 'Mighty Rage Potion', icon: 'x', cooldownMs: 120000, gcdMs: 0, aura: null, rageTenths: 450, rageSpreadTenths: 300 }
  /** Defensive's list, unless `values` names another Priority. */
  const rot = (values: Record<string, boolean | number | string> = {}, talents = TALENTS) =>
    protectionRotation({ ...DEFENSIVE, ...values }, talents, noAura, { consumables: [potion], race: 'alliance-human' })

  it('uses §5.4’s rows in priority order with Defensive’s settings: the duty rule, and the best rotation found around it (D23, D26, P1, PV1, PW1)', () => {
    const r = rot()
    // Thunder Clap and Demoralizing Shout first from the pull, before any threat ability on the global
    // cooldown (D26's amendment).
    expect(ids(r)).toEqual([
      'shieldBlock',
      'bloodrage',
      'mightyRagePotion',
      'thunderClap',
      'demoralizingShout',
      'shieldSlam',
      'revenge',
      'battleShout',
      'sunderArmor',
      'sunderArmor',
      'sunderArmor',
      'heroicStrike',
      'heroicStrike',
    ])
    // Bloodrage waits for the pull, where its rage makes threat (§5.4 "Tuning the defaults").
    expect(r.prepull.casts.map((c) => [r.abilities[c.ability].id, c.atMs])).toEqual([['battleShout', -3000]])
    expect(resolveRotationValues(PROTECTION_OPTIONS, DEFENSIVE, TALENTS)).toMatchObject({
      [ID.prepullBloodrage]: false,
      [ID.bsRefresh]: 0,
      [ID.fillerSafe]: false,
      [ID.hsMinRage]: 76,
      [ID.hsLastSec]: 12,
      [ID.fillerMinRage]: 9,
      // The duties' refresh: D26's fixed rule, never tuned (the next test).
      [ID.tcRefresh]: 6,
      [ID.demoRefresh]: 1.5,
    })
    // Charge in Defensive Stance with Vanguard: its 15 rage, no swap.
    expect([r.prepull.chargeTenths, r.prepull.keepTenths]).toEqual([150, -1])
    expect(r.procs).toEqual(revengeWindowProcs())
  })

  it('writes each line’s conditions from its settings', () => {
    const r = rot()
    const sunder = at(r, 'sunderArmor')
    expect(linesOf(r, 'shieldBlock')[0].conditions).toEqual([{ code: COND.minRage, a: 100, b: 0 }])
    expect(linesOf(r, 'bloodrage')[0].conditions).toEqual([{ code: COND.maxRage, a: 700, b: 0 }])
    expect(linesOf(r, 'mightyRagePotion')[0].conditions).toEqual([{ code: COND.maxRage, a: 250, b: 0 }])
    expect(r.abilities[at(r, 'mightyRagePotion')].usesPerFight).toBe(1)
    expect(linesOf(r, 'shieldSlam')[0].conditions).toEqual([{ code: COND.minRage, a: 170, b: 0 }])
    expect(linesOf(r, 'battleShout')[0].conditions).toEqual([{ code: COND.abilityAuraRefresh, a: at(r, 'battleShout'), b: 0 }])
    expect(linesOf(r, 'sunderArmor').map((e) => e.conditions)).toEqual([
      [{ code: COND.abilityAuraStacksBelow, a: sunder, b: 5 }],
      [{ code: COND.abilityAuraRefresh, a: sunder, b: 3000 }],
      [{ code: COND.minRage, a: 90, b: 0 }],
    ])
    // The duties' refresh is D26's fixed rule, not the search's: as soon as a miss could still be tried
    // again before the debuff falls off. Thunder Clap from its 6 s cooldown; Demoralizing Shout, which
    // has none, from one 1.5 s global cooldown (§5.4, PW1).
    expect(THUNDER_CLAP.cooldownMs).toBe(6000)
    expect(DEMORALIZING_SHOUT.cooldownMs).toBe(0)
    expect(linesOf(r, 'thunderClap')[0].conditions).toEqual([{ code: COND.abilityAuraRefresh, a: at(r, 'thunderClap'), b: 6000 }])
    expect(linesOf(r, 'demoralizingShout')[0].conditions).toEqual([{ code: COND.abilityAuraRefresh, a: at(r, 'demoralizingShout'), b: 1500 }])
    // From 76 rage, and in the fight's last 12 s from its cost: rage left at the end is wasted.
    expect(linesOf(r, 'heroicStrike').map((e) => e.conditions)).toEqual([
      [{ code: COND.minRage, a: 760, b: 0 }],
      [
        { code: COND.timeLeftAtMost, a: 12000, b: 0 },
        { code: COND.minRage, a: 0, b: 0 },
      ],
    ])
    expect(ids(rot({ [ID.hsLastSec]: 0 })).filter((id) => id === 'heroicStrike')).toHaveLength(1)
    // No line stops in the execute phase.
    for (const e of r.rotation) expect(e.conditions.some((c) => c.code === COND.executePhase)).toBe(false)
  })

  it('follows its switches: Thunder Clap on cooldown, the filler waiting for Shield Slam, Execute’s dance, and rows off', () => {
    const r = rot({ [ID.tcMaintainOnly]: false, [ID.fillerSafe]: true, [ID.exEnabled]: true, [ID.prepullBloodrage]: true })
    // Its slow still goes up first from the pull, once it's down; then it's used on cooldown, below
    // Sunder Armor's upkeep, when Shield Slam is GCD-safe.
    expect(linesOf(r, 'thunderClap').map((e) => e.conditions)).toEqual([
      [{ code: COND.abilityAuraRefresh, a: at(r, 'thunderClap'), b: 0 }],
      [{ code: COND.gcdSafe, a: 1 << at(r, 'shieldSlam'), b: 1500 }],
    ])
    expect(ids(r).slice(3, 12)).toEqual([
      'thunderClap',
      'demoralizingShout',
      'shieldSlam',
      'revenge',
      'battleShout',
      'sunderArmor',
      'sunderArmor',
      'thunderClap',
      'sunderArmor',
    ])
    expect(r.prepull.casts.map((c) => [r.abilities[c.ability].id, c.atMs])).toEqual([
      ['battleShout', -3000],
      ['bloodrage', -1000],
    ])
    const ex = linesOf(r, 'execute')
    expect(ex).toHaveLength(1)
    expect(ex[0].danceTo).toBe(STANCE.battle)
    expect(r.abilities[at(r, 'execute')].stances & STANCE.defensive).toBe(0)
    expect(EXECUTE.executePhaseOnly).toBe(true)
    const waits = rot({ [ID.tcMaintainOnly]: false, [ID.fillerSafe]: true })
    // It waits for Shield Slam alone, even with Thunder Clap on cooldown, so without Shield Slam it's
    // a setting that changes nothing (the Rotation tab dims it then, PU4).
    expect(linesOf(waits, 'sunderArmor')[2].conditions[1]).toEqual({ code: COND.gcdSafe, a: 1 << at(waits, 'shieldSlam'), b: 1500 })
    const none = rot(Object.fromEntries(PROTECTION_OPTIONS.flatMap((o) => (o.kind === 'toggle' ? [[o.id, false]] : []))))
    expect(ids(none)).toEqual([])
    expect(none.procs).toEqual([])
    expect(none.prepull.casts).toEqual([])
  })

  it('needs the Shield Slam talent for Shield Slam; without Vanguard, Charge swaps back to Defensive Stance', () => {
    const r = rot({ [ID.prepullCharge]: true }, new Map([...TALENTS].filter(([n]) => n !== 'Shield Slam' && n !== 'Vanguard')))
    expect(ids(r)).not.toContain('shieldSlam')
    expect(r.prepull.keepTenths).toBe(100)
  })

  it('Thunder Clap’s slow and Demoralizing Shout’s attack power follow the rule profile', () => {
    const r = protectionRotation(DEFENSIVE, TALENTS, noAura, { profile: CLASSIC_ERA })
    expect(r.abilities[at(r, 'thunderClap')].aura!.mods.bossSlow).toBe(10)
    expect(r.abilities[at(r, 'demoralizingShout')].aura!.mods.bossAp).toBe(-146)
  })
})

describe('a duty below the Sunder Armor filler says when it’s used (TI-4 and TV-1; docs/ux.md "Rotation")', () => {
  const below = (rage: number) => `Below the Sunder Armor filler: used only while your rage is under its ${rage}.`
  const d = defaultConfig('warrior-protection')
  /** The default order with `id` moved to just below the filler. */
  const belowFiller = (id: string) => {
    const order = defaultAplOrder(PROTECTION_APL)
    const moved = moveAplRow(PROTECTION_APL, order, id, order.indexOf('sunderFiller'))!
    expect(moved.indexOf(id)).toBe(moved.indexOf('sunderFiller') + 1)
    return moved
  }
  /** The notes but the racial's (the default Human's has none the sim uses). */
  const unused = (rotation: SimConfig['rotation'], rotationOrder?: string[]) => {
    const { [ID.racialEnabled]: _, ...rest } = unusedRotationSettings({ ...d, rotation, ...(rotationOrder ? { rotationOrder } : {}) })
    return rest
  }

  it('says nothing in any preset’s own order', () => {
    for (const rotation of [{}, DEFENSIVE, { [ID.priority]: PROTECTION_PRIORITY.maxTps }]) expect(unused(rotation), JSON.stringify(rotation)).toEqual({})
  })

  it('on Thunder Clap, Demoralizing Shout and Battle Shout moved below Defensive’s filler from 9', () => {
    expect(unused(DEFENSIVE, belowFiller('thunderClap'))).toEqual({ [ID.tcEnabled]: below(9) })
    expect(unused(DEFENSIVE, belowFiller('demoShout'))).toEqual({ [ID.demoEnabled]: below(9) })
    expect(unused(DEFENSIVE, belowFiller('battleShout'))).toEqual({ [ID.bsEnabled]: below(9) })
  })

  it('whatever the threshold, and while the filler waits for Shield Slam: the filler still takes the global cooldown first (TV-1)', () => {
    // Balanced's filler from 60% of the bar: 60 at 100, 63 for a Gnome's 105.
    expect(unused({ [ID.demoEnabled]: true }, belowFiller('demoShout'))).toEqual({ [ID.demoEnabled]: below(60) })
    const gnome = unusedRotationSettings({ ...d, race: 'alliance-gnome', rotation: { [ID.demoEnabled]: true }, rotationOrder: belowFiller('demoShout') })
    expect(gnome[ID.demoEnabled]).toBe(below(63))
    // Just above a duty's cost (Demoralizing Shout's 7, Thunder Clap's 17) it's still under it only.
    expect(unused({ ...DEFENSIVE, [ID.fillerMinRage]: 15 }, belowFiller('demoShout'))).toEqual({ [ID.demoEnabled]: below(15) })
    expect(unused({ ...DEFENSIVE, [ID.fillerMinRage]: 18 }, belowFiller('thunderClap'))).toEqual({ [ID.tcEnabled]: below(18) })
    // Waiting for Shield Slam, the filler still comes first whenever it doesn't wait.
    expect(unused({ ...DEFENSIVE, [ID.fillerSafe]: true }, belowFiller('demoShout'))).toEqual({ [ID.demoEnabled]: below(9) })
    // Under Sunder Armor's cost, the filler can't be cast: the note gives the cost.
    expect(unused({ ...DEFENSIVE, [ID.fillerMinRage]: 5 }, belowFiller('demoShout'))).toEqual({ [ID.demoEnabled]: below(9) })
  })

  it('not with the filler off or the row off, nor on Thunder Clap on cooldown, which is tried above the filler', () => {
    expect(unused({ ...DEFENSIVE, [ID.fillerEnabled]: false }, belowFiller('demoShout'))).toEqual({})
    expect(unused({ ...DEFENSIVE, [ID.tcMaintainOnly]: false }, belowFiller('thunderClap'))).toEqual({})
    expect(unused({ ...DEFENSIVE, [ID.demoEnabled]: false }, belowFiller('demoShout'))).toEqual({})
  })

  it('is what the engine does: Demoralizing Shout below Defensive’s filler is cast only at the pull, if ever', () => {
    const plan = (order?: string[]) => buildPlan({ ...d, rotation: DEFENSIVE, ...(order ? { rotationOrder: order } : {}) }).plan
    const casts = (p: ReturnType<typeof plan>) => {
      const sim = new Sim(p)
      for (let i = 0; i < 3; i++) sim.runFight(i)
      const i = p.sources.findIndex((s) => s.id === 'demoralizingShout')
      return sim.counters[i * FIELD_COUNT + FIELD.casts] / 3
    }
    expect(casts(plan())).toBeGreaterThan(3)
    expect(casts(plan(belowFiller('demoShout')))).toBeLessThan(1)
  })
})
