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
import { PROTECTION_IDS as ID, PROTECTION_OPTIONS, PROTECTION_PRIORITY, protectionMaintainedBuffs, protectionRotation } from './protection'

const spells = (spellsJson as unknown as ClientSpells).spells
const RAGE = 1
/** `ShapeshiftMask` bits for Battle (17) and Defensive (18) Stance. */
const FORM = { battle: 1 << 16, defensive: 1 << 17 }
/** SpellAura codes: 22 resistance (armor), 51 block chance, 99 attack power, 319 melee attack speed. */
const AURA = { armor: 22, block: 51, ap: 99, slow: 319 }
/** `EquippedItemSubclass` 64: shields (item class 4, armor). */
const SHIELD = 64

/** The default Protection build's talents by name (5/5/36, warrior.md §6.1). */
const TALENTS = talentRanksByName(TALENT_DATA.warrior, defaultConfig('warrior-protection').talents)
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
    expect(threat(SUNDER_ARMOR)).toEqual([1514.44, 10, 151.44])
    expect(threat(SHIELD_SLAM)).toEqual([1440.93, 17, 84.76])
    expect(threat(REVENGE)).toEqual([1218.86, 2, 609.43])
    expect(threat(THUNDER_CLAP)).toEqual([381.11, 17, 22.42])
    expect(threat(DEMORALIZING_SHOUT)).toEqual([64.58, 7, 9.23])
  })

  it('W20: the default build’s costs (Focused Rage 3/3, Improved Sunder Armor 2/3)', () => {
    const costs = [SUNDER_ARMOR, SHIELD_SLAM, REVENGE, THUNDER_CLAP, DEMORALIZING_SHOUT, SHIELD_BLOCK].map((a) => withTalents(a, TALENTS).costTenths / 10)
    expect(costs).toEqual([10, 17, 2, 17, 7, 10])
  })
})

describe('Protection rotation options (warrior.md §5.1, §5.4)', () => {
  it('declares valid, uniquely named settings in its spec’s namespace', () => {
    const optionIds = PROTECTION_OPTIONS.map((o) => o.id)
    expect(new Set(optionIds).size).toBe(optionIds.length)
    // The priority shapes the rest, so it comes first, without a heading (docs/ux.md "Rotation").
    const [priority, ...rest] = PROTECTION_OPTIONS
    expect(priority).toMatchObject({ kind: 'choice', id: 'warrior.protection.priority', default: 'duties' })
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
    expect(protectionMaintainedBuffs({})).toEqual(['battleShout', 'sunderArmor', 'thunderClap', 'demoralizingShout'])
    const off = { [ID.sunderEnabled]: false, [ID.fillerEnabled]: false, [ID.tcEnabled]: false, [ID.demoEnabled]: false, [ID.bsEnabled]: false }
    expect(protectionMaintainedBuffs(off)).toEqual([])
    // The filler keeps Sunder Armor up by itself.
    expect(protectionMaintainedBuffs({ ...off, [ID.fillerEnabled]: true })).toEqual(['sunderArmor'])
    const maintains = PROTECTION_OPTIONS.flatMap((o) => (o.kind === 'toggle' && o.maintainsBuff ? [[o.id, o.maintainsBuff]] : []))
    expect(maintains).toEqual([
      [ID.bsEnabled, 'battleShout'],
      [ID.sunderEnabled, 'sunderArmor'],
      [ID.tcEnabled, 'thunderClap'],
      [ID.demoEnabled, 'demoralizingShout'],
      [ID.fillerEnabled, 'sunderArmor'],
    ])
  })
})

describe('Max TPS (warrior.md §5.4 "Priority" and "Max TPS", D26)', () => {
  const MAX = { [ID.priority]: PROTECTION_PRIORITY.maxTps }
  const DUTIES = [ID.sbEnabled, ID.tcEnabled, ID.demoEnabled]

  it('drops the duties, Shield Block, Thunder Clap and Demoralizing Shout, by default, keeps Shield Slam, and queues Heroic Strike from 50', () => {
    const duties = resolveRotationValues(PROTECTION_OPTIONS, {}, TALENTS)
    const max = resolveRotationValues(PROTECTION_OPTIONS, MAX, TALENTS)
    for (const id of DUTIES) expect([id, duties[id], max[id]]).toEqual([id, true, false])
    // D26's amendment: Max TPS drops only the duties.
    expect([duties[ID.slamEnabled], max[ID.slamEnabled]]).toEqual([true, true])
    expect([duties[ID.hsMinRage], max[ID.hsMinRage]]).toEqual([65, 50])
    // Nothing else moves: the search found no other setting better (§5.4 "Max TPS").
    const moved = Object.keys(duties).filter((id) => duties[id] !== max[id])
    expect(moved.sort()).toEqual([ID.priority, ...DUTIES, ID.hsMinRage].sort())
    // Each switch's help says it follows the choice.
    for (const id of [...DUTIES, ID.hsMinRage]) expect(PROTECTION_OPTIONS.find((o) => o.id === id)!.help, id).toContain('Max TPS')
  })

  it('keeps a value you set yourself, and the tank-duties choice is the default', () => {
    const own = resolveRotationValues(PROTECTION_OPTIONS, { ...MAX, [ID.sbEnabled]: true, [ID.hsMinRage]: 70 }, TALENTS)
    expect([own[ID.sbEnabled], own[ID.hsMinRage], own[ID.tcEnabled]]).toEqual([true, 70, false])
    const back = resolveRotationValues(PROTECTION_OPTIONS, { [ID.priority]: PROTECTION_PRIORITY.duties }, TALENTS)
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
    expect(linesOf(r, 'heroicStrike')[0].conditions).toEqual([{ code: COND.minRage, a: 500, b: 0 }])
  })
})

describe('the Protection priority list (warrior.md §5.4)', () => {
  const potion: OnUseSpec = { id: 'mightyRagePotion', name: 'Mighty Rage Potion', icon: 'x', cooldownMs: 120000, gcdMs: 0, aura: null, rageTenths: 450, rageSpreadTenths: 300 }
  const rot = (values: Record<string, boolean | number> = {}, talents = TALENTS) =>
    protectionRotation(values, talents, noAura, { consumables: [potion], race: 'alliance-human' })

  it('uses §5.4’s rows in priority order with the default settings: the best rotation found (D23, P1)', () => {
    const r = rot()
    expect(ids(r)).toEqual([
      'shieldBlock',
      'bloodrage',
      'mightyRagePotion',
      'shieldSlam',
      'revenge',
      'battleShout',
      'sunderArmor',
      'sunderArmor',
      'thunderClap',
      'demoralizingShout',
      'sunderArmor',
      'heroicStrike',
      'heroicStrike',
    ])
    // Bloodrage waits for the pull, where its rage makes threat (§5.4 "Tuning the defaults").
    expect(r.prepull.casts.map((c) => [r.abilities[c.ability].id, c.atMs])).toEqual([['battleShout', -3000]])
    expect(resolveRotationValues(PROTECTION_OPTIONS, {}, TALENTS)).toMatchObject({
      [ID.prepullBloodrage]: false,
      [ID.bsRefresh]: 0,
      [ID.fillerSafe]: false,
      [ID.hsMinRage]: 65,
      [ID.hsLastSec]: 7,
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
      [{ code: COND.minRage, a: 100, b: 0 }],
    ])
    expect(linesOf(r, 'thunderClap')[0].conditions).toEqual([{ code: COND.abilityAuraRefresh, a: at(r, 'thunderClap'), b: 3000 }])
    expect(linesOf(r, 'demoralizingShout')[0].conditions).toEqual([{ code: COND.abilityAuraRefresh, a: at(r, 'demoralizingShout'), b: 3000 }])
    // From 65 rage, and in the fight's last 7 s from its cost: rage left at the end is wasted.
    expect(linesOf(r, 'heroicStrike').map((e) => e.conditions)).toEqual([
      [{ code: COND.minRage, a: 650, b: 0 }],
      [
        { code: COND.timeLeftAtMost, a: 7000, b: 0 },
        { code: COND.minRage, a: 0, b: 0 },
      ],
    ])
    expect(ids(rot({ [ID.hsLastSec]: 0 })).filter((id) => id === 'heroicStrike')).toHaveLength(1)
    // No line stops in the execute phase.
    for (const e of r.rotation) expect(e.conditions.some((c) => c.code === COND.executePhase)).toBe(false)
  })

  it('follows its switches: Thunder Clap on cooldown, the filler waiting for Shield Slam, Execute’s dance, and rows off', () => {
    const r = rot({ [ID.tcMaintainOnly]: false, [ID.fillerSafe]: true, [ID.exEnabled]: true, [ID.prepullBloodrage]: true })
    expect(linesOf(r, 'thunderClap')[0].conditions).toEqual([{ code: COND.gcdSafe, a: 1 << at(r, 'shieldSlam'), b: 1500 }])
    expect(r.prepull.casts.map((c) => [r.abilities[c.ability].id, c.atMs])).toEqual([
      ['battleShout', -3000],
      ['bloodrage', -1000],
    ])
    const ex = linesOf(r, 'execute')
    expect(ex).toHaveLength(1)
    expect(ex[0].danceTo).toBe(STANCE.battle)
    expect(r.abilities[at(r, 'execute')].stances & STANCE.defensive).toBe(0)
    expect(EXECUTE.executePhaseOnly).toBe(true)
    // A Thunder Clap on cooldown counts in the filler's GCD-safe check when the filler waits.
    const waits = rot({ [ID.tcMaintainOnly]: false, [ID.fillerSafe]: true })
    expect(linesOf(waits, 'sunderArmor')[2].conditions[1]).toEqual({ code: COND.gcdSafe, a: (1 << at(waits, 'shieldSlam')) | (1 << at(waits, 'thunderClap')), b: 1500 })
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
    const r = protectionRotation({}, TALENTS, noAura, { profile: CLASSIC_ERA })
    expect(r.abilities[at(r, 'thunderClap')].aura!.mods.bossSlow).toBe(10)
    expect(r.abilities[at(r, 'demoralizingShout')].aura!.mods.bossAp).toBe(-146)
  })
})
