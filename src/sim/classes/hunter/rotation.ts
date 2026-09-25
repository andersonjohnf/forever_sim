// The hunter's priority list and its settings, for its three specs (docs/classes/hunter.md §8).
//
// Before the pull: Aspect of the Hawk, Trueshot Aura with the talent, and the pet (a cat, or none with
// Lone Wolf). Off the global cooldown: the racial cooldown, on-use trinkets, Rapid Fire, Bestial
// Wrath and the mana consumables. On it: Hunter's Mark while it's off the boss; the shot on Aimed Shot
// and Multi-Shot's shared cooldown, fitted between Auto Shots so it holds none back; Arcane Shot on
// cooldown; Serpent Sting while it's off the boss; Sniper Shot with the talent. Auto Shot fires on its
// own timer throughout. Setting ids are `hunter.<spec>.<ability>.<param>`. Abilities are resolved
// with the build's talents (talents.ts). The defaults are the Classic Era common priority adapted to
// Forever with a first quick search (decision D27; hunter.md "First-pass defaults"). Each spec's
// rotation is a priority list you reorder (HUNTER_APL, decision D31; hunter.md §8.3), its rows the
// lines above, each with its own settings.
import type { OnUseSpec } from '../../effects/types'
import { type AbilityDef, COND, NO_PREPULL, type RotationCondition, type RotationEntry } from '../../plan/types'
import type { AplDefinition, FixedRotationRow, RotationOption, RotationValue, SpecId } from '../../types'
import { compileAplRows } from '../apl'
import type { PaladinContext } from '../paladin/setup'
import { NO_CONTEXT, reader, timeLeftAtLeast, type ClassRotation } from '../warrior/shared'
import { AIMED_SHOT, ARCANE_SHOT, BESTIAL_WRATH, HUNTER_RACIALS, HUNTERS_MARK, MULTI_SHOT, RAPID_FIRE, SERPENT_STING, SNIPER_SHOT } from './abilities'
import { hunterPet } from './pet'
import { hasPet, rank, type TalentRanks, TRUESHOT_AURA_RAP, withTalents } from './talents'

/** The hunter specs and their setting keys. */
export const HUNTER_SPECS = ['hunter-marksmanship', 'hunter-beast-mastery', 'hunter-survival'] as const satisfies readonly SpecId[]
export type HunterSpec = (typeof HUNTER_SPECS)[number]
const KEY: Record<HunterSpec, string> = {
  'hunter-marksmanship': 'marksmanship',
  'hunter-beast-mastery': 'beastMastery',
  'hunter-survival': 'survival',
}
export const isHunterSpec = (spec: SpecId): spec is HunterSpec => (HUNTER_SPECS as readonly SpecId[]).includes(spec)

/** The setting ids of a hunter spec. */
export function hunterIds(spec: HunterSpec) {
  const S = `hunter.${KEY[spec]}`
  return {
    racial: `${S}.racial.enabled`,
    trinkets: `${S}.trinkets.enabled`,
    rapidFire: `${S}.rapidFire.enabled`,
    bestialWrath: `${S}.bestialWrath.enabled`,
    mark: `${S}.huntersMark.enabled`,
    sharedShot: `${S}.sharedCooldown.shot`,
    noClip: `${S}.sharedCooldown.noClip`,
    arcane: `${S}.arcaneShot.enabled`,
    sting: `${S}.serpentSting.enabled`,
    stingTimeLeft: `${S}.serpentSting.minTimeLeftSec`,
    sniper: `${S}.sniperShot.enabled`,
    clawFocus: `${S}.pet.clawFocus`,
    manaPotion: `${S}.manaPotion.enabled`,
    manaPotionMissing: `${S}.manaPotion.missingMana`,
    rune: `${S}.rune.enabled`,
    runeMissing: `${S}.rune.missingMana`,
  }
}

/**
 * The first-pass defaults of decision D27 (hunter.md "First-pass defaults"): a quick search of 20,000
 * fights on seed 1 over the shot on the shared cooldown, waiting for Auto Shot, Arcane Shot and
 * (Marksmanship) Sniper Shot. Mana decides it: Arcane Shot and Sniper Shot cost more than they add
 * for Marksmanship and Survival, and Beast Mastery's cheaper Multi-Shot beats Aimed Shot.
 */
const FIRST_PASS: Record<HunterSpec, { sharedShot: string; noClip: boolean; arcane: boolean; sniper: boolean }> = {
  'hunter-marksmanship': { sharedShot: 'aimed', noClip: true, arcane: false, sniper: false },
  'hunter-beast-mastery': { sharedShot: 'multi', noClip: true, arcane: true, sniper: false },
  'hunter-survival': { sharedShot: 'aimed', noClip: false, arcane: false, sniper: false },
}

/** Buff catalogue ids of the mana consumables the rotation presses (effects/buffs.ts). */
export const MANA_POTION = 'majorManaPotion'
export const MANA_RUNE = 'demonicRune'

/**
 * Defaults from hunter.md §8, in priority order: the Classic Era common priority adapted to Forever,
 * with the first quick search of decision D27 (hunter.md "First-pass defaults").
 */
export function hunterOptions(spec: HunterSpec): RotationOption[] {
  const ID = hunterIds(spec)
  const d = FIRST_PASS[spec]
  return [
    {
      kind: 'toggle',
      id: ID.racial,
      group: 'Cooldowns and buffs',
      label: 'Racial cooldown',
      help: 'Use Blood Fury (Orc: +10% attack power for 15 s), Berserking (Troll: +10% ranged attack speed for 10 s) or Elune’s Light (Night Elf: +10% crit for 15 s) on cooldown from the pull.',
      default: true,
    },
    {
      kind: 'toggle',
      id: ID.trinkets,
      group: 'Cooldowns and buffs',
      label: 'On-use trinkets',
      help: 'Use the on-use trinkets the sim models on cooldown if you wear them. Others aren’t simulated.',
      default: true,
    },
    {
      kind: 'toggle',
      id: ID.rapidFire,
      group: 'Cooldowns and buffs',
      label: 'Rapid Fire',
      help: 'Use it on cooldown from the pull: +40% ranged attack speed for 15 s, every 5 minutes (4 with 1 point in Rapid Killing, 3 with 2). It’s off the global cooldown.',
      default: true,
    },
    {
      kind: 'toggle',
      id: ID.bestialWrath,
      group: 'Cooldowns and buffs',
      label: 'Bestial Wrath',
      help: 'Enrage your pet on cooldown from the pull: +50% pet damage for 18 s, every 2 minutes. It’s off the global cooldown.',
      default: true,
      requires: { talent: 'Bestial Wrath' },
    },
    {
      kind: 'toggle',
      id: ID.mark,
      group: 'Core abilities',
      label: 'Hunter’s Mark',
      help: 'Keep it on the boss: +71 ranged attack power for your shots, for 2 minutes. It takes a global cooldown at the pull.',
      default: true,
    },
    {
      kind: 'choice',
      id: ID.sharedShot,
      group: 'Core abilities',
      label: 'Shared cooldown',
      help: 'Aimed Shot and Multi-Shot share a 6 s cooldown in Forever. Aimed Shot is a 2 s cast for 166 more damage; Multi-Shot a 0.5 s cast for your weapon’s damage.',
      choices: [
        { value: 'aimed', label: 'Aimed Shot' },
        { value: 'multi', label: 'Multi-Shot' },
        { value: 'none', label: 'Neither' },
      ],
      default: d.sharedShot,
    },
    {
      kind: 'toggle',
      id: ID.noClip,
      group: 'Core abilities',
      label: 'Wait for Auto Shot',
      help: 'Start the cast only when it ends before your next Auto Shot starts to aim, so it never delays one. Off, cast it as soon as it’s ready.',
      default: d.noClip,
    },
    {
      kind: 'toggle',
      id: ID.arcane,
      group: 'Core abilities',
      label: 'Arcane Shot',
      help: 'Shoot it on cooldown: 217 Arcane damage, instant, every 6 s (4.5 s with Improved Arcane Shot). It costs mana your other shots may need.',
      default: d.arcane,
    },
    {
      kind: 'toggle',
      id: ID.sting,
      group: 'Core abilities',
      label: 'Serpent Sting',
      help: 'Keep it on the boss: 555 Nature damage over 15 s (666 with Improved Stings 3/3), whose ticks can crit in Forever.',
      default: true,
    },
    {
      kind: 'number',
      id: ID.stingTimeLeft,
      group: 'Core abilities',
      label: 'Serpent Sting until',
      help: 'Sting only while at least this much of the fight is left; later, its ticks won’t finish.',
      unit: 's',
      min: 0,
      max: 30,
      step: 1,
      default: 6,
      dependsOn: ID.sting,
    },
    {
      kind: 'toggle',
      id: ID.sniper,
      group: 'Core abilities',
      label: 'Sniper Shot',
      help: 'Shoot it on cooldown: a 4 s cast for your weapon’s damage plus 295, every 15 s. Its cast holds back an Auto Shot, and it costs 365 mana.',
      default: d.sniper,
      requires: { talent: 'Sniper Shot' },
    },
    {
      kind: 'number',
      id: ID.clawFocus,
      group: 'Core abilities',
      label: 'Pet: Claw at',
      help: 'Your cat uses Bite on cooldown, and Claw only while it has at least this much Focus, so Bite stays affordable. 100 is its most.',
      unit: 'Focus',
      min: 25,
      max: 100,
      step: 5,
      default: 60,
    },
    {
      kind: 'toggle',
      id: ID.manaPotion,
      group: 'Consumables',
      label: 'Major Mana Potion',
      help: 'Drink one every 2 minutes, once all it can restore (up to 2,250 mana) fits.',
      default: true,
      requiresBuff: MANA_POTION,
    },
    {
      kind: 'number',
      id: ID.manaPotionMissing,
      group: 'Consumables',
      label: 'Major Mana Potion when missing',
      help: 'Drink it when you’re missing at least this much mana. 2,250 is the most it restores.',
      unit: 'mana',
      min: 0,
      max: 5000,
      step: 50,
      default: 2250,
      dependsOn: ID.manaPotion,
    },
    {
      kind: 'toggle',
      id: ID.rune,
      group: 'Consumables',
      label: 'Demonic Rune',
      help: 'Use one every 2 minutes, apart from the potion’s cooldown, once all it can restore (up to 1,500 mana) fits.',
      default: true,
      requiresBuff: MANA_RUNE,
    },
    {
      kind: 'number',
      id: ID.runeMissing,
      group: 'Consumables',
      label: 'Demonic Rune when missing',
      help: 'Use it when you’re missing at least this much mana. 1,500 is the most it restores.',
      unit: 'mana',
      min: 0,
      max: 5000,
      step: 50,
      default: 1500,
      dependsOn: ID.rune,
    },
  ]
}

/**
 * What the Rotation tab shows without a control, above the priority list (docs/ux.md "Rotation"):
 * Auto Shot and the pet, which fight all along beside the list. Aspect of the Hawk and Trueshot Aura
 * are the list's pinned first row (HUNTER_APL).
 */
export function hunterFixedRows(spec: HunterSpec): FixedRotationRow[] {
  const S = `hunter.${KEY[spec]}`
  return [
    {
      id: `${S}.autoShot`,
      label: 'Auto Shot',
      group: 'Core abilities',
      help: 'Your ranged weapon fires on its own timer all fight. A cast that’s still going when a shot starts to aim holds that shot back.',
      value: 'Always on',
    },
    {
      id: `${S}.pet`,
      label: 'Pet',
      group: 'Core abilities',
      help: 'A happy cat, out before the pull and attacking from behind the boss. With Lone Wolf you fight without a pet for its +20% damage.',
      value: 'Cat, or none with Lone Wolf',
    },
  ]
}

/**
 * A hunter spec's rotation as a priority list (decision D31; hunter.md §8.3 "The priority list"):
 * §8.1's lines in its order, each with its switch and its own settings. Aspect of the Hawk and
 * Trueshot Aura before the pull are pinned first. The shot on the shared cooldown is one row, whose
 * choice picks Aimed Shot, Multi-Shot or neither, with its wait for Auto Shot. The pet's Claw
 * threshold and the mana consumables are spec-wide, above the list; the consumables take their turn
 * just before the list's first row on the global cooldown (hunterRotation).
 */
function hunterApl(spec: HunterSpec): AplDefinition {
  const ID = hunterIds(spec)
  const onCooldown = [{ text: 'on cooldown' }]
  return {
    rows: [
      {
        id: 'prepull',
        label: 'Before the pull',
        icon: 'spell_nature_ravenform',
        optionIds: [],
        summary: [{ text: 'Aspect of the Hawk' }, { text: 'Trueshot Aura with the talent' }],
        help: `Aspect of the Hawk (+120 ranged attack power; with Deadly Aspects, your Auto Shots can give you Quick Shots), and Trueshot Aura with the talent (+${TRUESHOT_AURA_RAP} ranged attack power for your party), cast before the pull and up all fight. It always comes first.`,
        pinned: true,
      },
      { id: 'racial', label: 'Racial cooldown', icon: 'racial_orc_berserkerstrength', enabledId: ID.racial, optionIds: [], summary: onCooldown },
      { id: 'trinkets', label: 'On-use trinkets', icon: 'inv_jewelry_talisman_01', enabledId: ID.trinkets, optionIds: [], summary: onCooldown },
      { id: 'rapidFire', label: 'Rapid Fire', icon: RAPID_FIRE.icon, enabledId: ID.rapidFire, optionIds: [], summary: onCooldown },
      { id: 'bestialWrath', label: 'Bestial Wrath', icon: BESTIAL_WRATH.icon, enabledId: ID.bestialWrath, optionIds: [], summary: onCooldown },
      { id: 'huntersMark', label: 'Hunter’s Mark', icon: HUNTERS_MARK.icon, enabledId: ID.mark, optionIds: [], summary: [{ text: 'while it’s off the boss' }] },
      {
        id: 'sharedShot',
        label: 'Aimed Shot or Multi-Shot',
        icon: AIMED_SHOT.icon,
        optionIds: [ID.sharedShot, ID.noClip],
        summary: [{ option: ID.sharedShot, text: '{}' }, { option: ID.noClip, text: 'between Auto Shots' }],
        help: 'Which shot fills the shared cooldown, and whether it waits for Auto Shot. Neither leaves it empty.',
      },
      { id: 'arcaneShot', label: 'Arcane Shot', icon: ARCANE_SHOT.icon, enabledId: ID.arcane, optionIds: [], summary: onCooldown },
      {
        id: 'serpentSting',
        label: 'Serpent Sting',
        icon: SERPENT_STING.icon,
        enabledId: ID.sting,
        optionIds: [ID.stingTimeLeft],
        summary: [{ text: 'while it’s off the boss' }, { option: ID.stingTimeLeft, text: 'until {} are left', hideWhen: 0 }],
      },
      { id: 'sniperShot', label: 'Sniper Shot', icon: SNIPER_SHOT.icon, enabledId: ID.sniper, optionIds: [], summary: onCooldown },
    ],
    specWide: [ID.clawFocus, ID.manaPotion, ID.manaPotionMissing, ID.rune, ID.runeMissing],
    presets: [],
  }
}

/** Each hunter spec's priority list (hunterApl): one object per spec, so what reads it gets the same one. */
export const HUNTER_APL: Readonly<Record<HunterSpec, AplDefinition>> = {
  'hunter-marksmanship': hunterApl('hunter-marksmanship'),
  'hunter-beast-mastery': hunterApl('hunter-beast-mastery'),
  'hunter-survival': hunterApl('hunter-survival'),
}

/**
 * Settings that can't do anything in this setup (docs/ux.md "Rotation"): the pet's Claw threshold
 * and Bestial Wrath without a pet (Lone Wolf). The racial's note is every spec's (classes/rotation.ts).
 */
export function hunterUnusedSettings(spec: HunterSpec, talents: TalentRanks): Record<string, string> {
  const ID = hunterIds(spec)
  const out: Record<string, string> = {}
  if (!hasPet(talents)) {
    out[ID.clawFocus] = 'Not used: with Lone Wolf you fight without a pet.'
    if (rank(talents, 'Bestial Wrath') > 0) out[ID.bestialWrath] = 'Not used: with Lone Wolf you fight without a pet.'
  }
  return out
}

/** An on-use item or consumable as a hunter `cast`: no cost, its cooldown, GCD and buff, its mana at once. */
const consumable = (use: OnUseSpec): AbilityDef => ({
  ...RAPID_FIRE,
  id: use.id,
  name: use.name,
  icon: use.icon,
  costTenths: 0,
  cooldownMs: use.cooldownMs,
  gcdMs: use.gcdMs,
  aura: use.aura,
  manaTenths: use.manaTenths ?? 0,
  manaSpreadTenths: use.manaSpreadTenths ?? 0,
})

/**
 * The hunter's priority list from the settings (hunter.md §8), its rows in `order` (HUNTER_APL;
 * absent: the default order). `context` gives the maximum mana (the mana thresholds), the race (its
 * racial cooldown), the equipped on-use items and the selected consumables.
 *
 * A row's conditions are its own wherever it sits; no row reads another's ability. The mana
 * consumables, spec-wide, are off the global cooldown and take their turn just before the list's
 * first row on it (Hunter's Mark and the shots), wherever that sits: in the default order that's
 * after Bestial Wrath, where they were before the list.
 */
export function hunterRotation(
  spec: HunterSpec,
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  context: Partial<PaladinContext> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx = { ...NO_CONTEXT, ...context }
  const ID = hunterIds(spec)
  const v = reader(hunterOptions(spec), values, talents)
  const abilities: AbilityDef[] = []
  const rotation: RotationEntry[] = []
  const index = (def: AbilityDef): number => {
    const i = abilities.findIndex((a) => a.id === def.id)
    if (i >= 0) return i
    abilities.push(withTalents(def, talents))
    return abilities.length - 1
  }
  const add = (def: AbilityDef, conditions: RotationCondition[] = []) => {
    const a = index(def)
    rotation.push({ ability: a, conditions, unqueueBelowTenths: 0 })
    return a
  }
  const maxManaTenths = 10 * (ctx.maxMana ?? 0)
  const missing = (mana: number): RotationCondition => ({ code: COND.maxMana, a: maxManaTenths - 10 * mana, b: 0 })
  const pet = hasPet(talents)

  // What the plan presses: the on-use items, then the mana consumables selected in Buffs.
  const consumables = [
    [MANA_POTION, ID.manaPotion, ID.manaPotionMissing],
    [MANA_RUNE, ID.rune, ID.runeMissing],
  ] as const
  const pressed: string[] = [...ctx.items.map((i) => i.id), ...consumables.map(([id]) => id).filter((id) => ctx.consumables.some((c) => c.id === id))]

  // The mana potion and the rune, once the most they restore fits: once, just before the first row on the GCD.
  let consumablesDone = false
  const manaConsumables = () => {
    if (consumablesDone) return
    consumablesDone = true
    for (const [id, setting, amount] of consumables) {
      const use = ctx.consumables.find((c) => c.id === id)
      if (use && v.on(setting)) add(consumable(use), [missing(v.num(amount))])
    }
  }
  const onGcd = (emit: () => void) => () => {
    manaConsumables()
    emit()
  }

  compileAplRows(HUNTER_APL[spec], order, {
    // Off the GCD, on cooldown from the pull: the racial, on-use trinkets, Rapid Fire and Bestial Wrath.
    racial: () => {
      const racial = HUNTER_RACIALS[ctx.race]
      if (racial && v.on(ID.racial)) add(racial)
    },
    trinkets: () => {
      if (v.on(ID.trinkets)) for (const item of ctx.items) add(consumable(item))
    },
    rapidFire: () => {
      if (v.on(ID.rapidFire)) add(RAPID_FIRE)
    },
    bestialWrath: () => {
      if (pet && v.on(ID.bestialWrath) && rank(talents, 'Bestial Wrath') > 0) add(BESTIAL_WRATH)
    },
    // Hunter's Mark whenever it's off the boss.
    huntersMark: onGcd(() => {
      if (!v.on(ID.mark)) return
      const mark = index(HUNTERS_MARK)
      rotation.push({ ability: mark, conditions: [{ code: COND.abilityAuraRefresh, a: mark, b: 0 }], unqueueBelowTenths: 0 })
    }),
    // The shot on the shared cooldown, with "Wait for Auto Shot" started only when it ends before the next Auto Shot aims.
    sharedShot: onGcd(() => {
      const shared = v.str(ID.sharedShot)
      if (shared !== 'aimed' && shared !== 'multi') return
      const shot = index(shared === 'aimed' ? AIMED_SHOT : MULTI_SHOT)
      rotation.push({ ability: shot, conditions: v.on(ID.noClip) ? [{ code: COND.autoShotClear, a: shot, b: 0 }] : [], unqueueBelowTenths: 0 })
    }),
    arcaneShot: onGcd(() => {
      if (v.on(ID.arcane)) add(ARCANE_SHOT)
    }),
    // Serpent Sting whenever it's off the boss, while its ticks can finish.
    serpentSting: onGcd(() => {
      if (!v.on(ID.sting)) return
      const sting = index(SERPENT_STING)
      rotation.push({
        ability: sting,
        conditions: [{ code: COND.abilityAuraRefresh, a: sting, b: 0 }, timeLeftAtLeast(1000 * v.num(ID.stingTimeLeft))],
        unqueueBelowTenths: 0,
      })
    }),
    sniperShot: onGcd(() => {
      if (v.on(ID.sniper) && rank(talents, 'Sniper Shot') > 0) add(SNIPER_SHOT)
    }),
  })
  manaConsumables()

  return {
    abilities,
    rotation,
    prepull: NO_PREPULL,
    onUse: pressed,
    procs: [],
    ...(pet ? { pet: hunterPet(talents, v.num(ID.clawFocus)) } : {}),
  }
}
