// What the rogue's priority lists share (docs/classes/rogue.md §6): the builder that resolves
// abilities with the rogue's talents, condition helpers, and the settings and lines every spec has:
// the racial, on-use items and consumables, Slice and Dice's upkeep, Expose Armor and Eviscerate.
// Setting ids are `rogue.<spec>.<ability>.<param>`; Energy thresholds are absolute Energy points.
import { JUJU_FLURRY } from '../../effects/buffs'
import type { OnUseSpec } from '../../effects/types'
import { COND, type RotationCondition } from '../../plan/types'
import type { RotationGroup, RotationOption } from '../../types'
import { onUseCast } from '../druid/cat-abilities'
import { eurekaFor } from '../eureka'
import { RACIAL_COOLDOWNS } from '../warrior/abilities'
import { type Reader, RotationBuilder, seconds } from '../warrior/shared'
import { type AbilityDef, EVISCERATE, EXPOSE_ARMOR, SLICE_AND_DICE, THISTLE_TEA, THISTLE_TEA_CAST } from './abilities'
import { type TalentRanks, withRogueTalents } from './modifiers'

export type RogueSpec = 'combat' | 'assassination' | 'subtlety'

/** Resolves abilities with the rogue's talents (modifiers.ts). */
export class RogueRotationBuilder extends RotationBuilder {
  constructor(talents: TalentRanks) {
    super(talents)
  }

  override ability(def: AbilityDef): number {
    const i = this.abilities.findIndex((a) => a.id === def.id)
    if (i >= 0) return i
    this.abilities.push(withRogueTalents(def, this.talents))
    return this.abilities.length - 1
  }
}

export const minEnergy = (energy: number): RotationCondition => ({ code: COND.minEnergy, a: 10 * energy, b: 0 })
export const maxEnergy = (energy: number): RotationCondition => ({ code: COND.maxEnergy, a: 10 * energy, b: 0 })
export const minComboPoints = (cp: number): RotationCondition => ({ code: COND.minComboPoints, a: cp, b: 0 })
export const maxComboPoints = (cp: number): RotationCondition => ({ code: COND.maxComboPoints, a: cp, b: 0 })
/** Ability a's aura (or bleed) is down, or has at most `ms` left and would end before the fight does. */
export const refresh = (a: number, ms: number): RotationCondition => ({ code: COND.abilityAuraRefresh, a, b: ms })
export const auraUp = (a: number): RotationCondition => ({ code: COND.abilityAuraUp, a, b: 0 })

/** The setting ids every rogue spec has, under its own prefix. */
export function rogueIds(spec: RogueSpec) {
  const p = `rogue.${spec}`
  return {
    racial: `${p}.racial.enabled`,
    items: `${p}.onUseItems.enabled`,
    tea: `${p}.thistleTea.enabled`,
    teaEnergy: `${p}.thistleTea.maxEnergy`,
    juju: `${p}.jujuFlurry.enabled`,
    snd: `${p}.sliceAndDice.enabled`,
    sndCp: `${p}.sliceAndDice.minComboPoints`,
    sndRefresh: `${p}.sliceAndDice.refreshBelowSec`,
    expose: `${p}.exposeArmor.enabled`,
    eviscerate: `${p}.eviscerate.enabled`,
    eviscerateCp: `${p}.eviscerate.minComboPoints`,
  }
}
export type RogueIds = ReturnType<typeof rogueIds>

/** A combo-point threshold input, 1 to 5. */
export const comboPointOption = (id: string, label: string, help: string, def: number, dependsOn: string, group: RotationGroup = 'Core abilities'): RotationOption => ({
  kind: 'number',
  id,
  label,
  group,
  help,
  unit: 'combo points',
  min: 1,
  max: 5,
  step: 1,
  default: def,
  dependsOn,
})

/** The cooldowns every spec has: the racial and on-use items, first in the list (rogue.md §6). */
export const cooldownOptions = (ids: RogueIds): RotationOption[] => [
  {
    kind: 'toggle',
    id: ids.racial,
    group: 'Cooldowns and buffs',
    label: 'Racial cooldown',
    help: 'Use Blood Fury (Orc, +10% attack power for 15 s), Berserking (Troll, +10% attack speed for 10 s), Elune’s Light (Night Elf, +10% crit for 15 s) or Eureka! (Gnome, your next 3 attacks cost 20% less Energy and deal 10% more) on cooldown.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ids.items,
    group: 'Cooldowns and buffs',
    label: 'On-use items',
    help: 'Use Weakness Analyzer (+5% crit until your next crit, for up to 20 s) and Earthstrike (+280 attack power for 20 s) on cooldown if you wear them. Other on-use trinkets aren’t simulated.',
    default: true,
  },
]

/** Slice and Dice's upkeep settings (rogue.md §6, rows "Slice and Dice"). */
export const sliceAndDiceOptions = (ids: RogueIds, minCp: number, refreshSec: number): RotationOption[] => [
  {
    kind: 'toggle',
    id: ids.snd,
    group: 'Cooldowns and buffs',
    label: 'Slice and Dice',
    help: 'Keep Slice and Dice up: +30% attack speed for 6 s plus 3 s per combo point, 45% longer with Improved Slice and Dice 3/3. It comes before Eviscerate.',
    default: true,
  },
  comboPointOption(
    ids.sndCp,
    'Slice and Dice at',
    'Use it at or above this many combo points when it’s down or about to run out: fewer points put it up sooner but for less time.',
    minCp,
    ids.snd,
    'Cooldowns and buffs',
  ),
  {
    kind: 'number',
    id: ids.sndRefresh,
    group: 'Cooldowns and buffs',
    label: 'Slice and Dice again with',
    help: 'Renew it when this much of it is left, so it never drops. At 0, only once it has run out.',
    unit: 's left',
    min: 0,
    max: 10,
    step: 0.5,
    default: refreshSec,
    dependsOn: ids.snd,
  },
]

/** Expose Armor as a raid choice (rogue.md §3.6), off by default: the raid's warriors keep Sunder Armor up. */
export const exposeArmorOption = (ids: RogueIds): RotationOption => ({
  kind: 'toggle',
  id: ids.expose,
  group: 'Cooldowns and buffs',
  label: 'Expose Armor',
  help: 'Keep your Expose Armor on the boss at 5 combo points: −2,250 armor for 30 s, the same as 5 Sunder Armors, and the two don’t stack. Turn it on when no warrior keeps Sunder Armor up, and turn Sunder Armor off in Buffs.',
  default: false,
  maintainsBuff: 'exposeArmor',
})

/** Eviscerate's settings (rogue.md §3.4). */
export const eviscerateOptions = (ids: RogueIds, minCp: number): RotationOption[] => [
  {
    kind: 'toggle',
    id: ids.eviscerate,
    group: 'Core abilities',
    label: 'Eviscerate',
    help: 'Spend combo points on Eviscerate: 54–162 plus 170 per point, and a share of your attack power.',
    default: true,
  },
  comboPointOption(ids.eviscerateCp, 'Eviscerate at', 'Use it at or above this many combo points, once Slice and Dice is up.', minCp, ids.eviscerate),
]

/** The consumables every spec can use, when they're selected in Buffs (rogue.md §7.5). */
export const consumableOptions = (ids: RogueIds, teaEnergy: number): RotationOption[] => [
  {
    kind: 'toggle',
    id: ids.tea,
    group: 'Consumables',
    label: 'Thistle Tea',
    help: 'Drink it for 100 Energy, every 5 min, when your Energy is low.',
    default: true,
    requiresBuff: THISTLE_TEA.id,
  },
  {
    kind: 'number',
    id: ids.teaEnergy,
    group: 'Consumables',
    label: 'Thistle Tea at or below',
    help: 'Drink it only at this much Energy or less, so little of its 100 is lost at the cap.',
    unit: 'Energy',
    min: 0,
    max: 100,
    step: 1,
    default: teaEnergy,
    dependsOn: ids.tea,
  },
  {
    kind: 'toggle',
    id: ids.juju,
    group: 'Consumables',
    label: 'Juju Flurry',
    help: 'Use it on cooldown from the pull: +3% attack speed for 20 s, every minute.',
    default: true,
    requiresBuff: JUJU_FLURRY.id,
  },
]

/** What the rotation needs from the rest of the setup. */
export interface RogueContext {
  race: string
  items: OnUseSpec[]
  consumables: OnUseSpec[]
}

/** The off-GCD lines every spec has: the racial, on-use items, Thistle Tea and Juju Flurry (rogue.md §6). */
export function offGcdLines(b: RogueRotationBuilder, v: Reader, ids: RogueIds, ctx: RogueContext): void {
  // A Gnome's Eureka! (classes/eureka.ts): its 3 charges go to the next abilities it modifies.
  const racial = eurekaFor(ctx.race, 'rogue') ?? RACIAL_COOLDOWNS[ctx.race]
  if (racial && v.on(ids.racial)) b.add(racial, [])
  if (v.on(ids.items)) for (const item of ctx.items) b.add(onUseCast(item), [])
  if (ctx.consumables.some((c) => c.id === THISTLE_TEA.id) && v.on(ids.tea)) b.add(THISTLE_TEA_CAST, [maxEnergy(v.num(ids.teaEnergy))])
  const juju = ctx.consumables.find((c) => c.id === JUJU_FLURRY.id)
  if (juju && v.on(ids.juju)) b.add(onUseCast(juju), [])
}

/** Slice and Dice's upkeep line: down, or about to run out, at enough combo points. Its index, or −1. */
export function sliceAndDiceLine(b: RogueRotationBuilder, v: Reader, ids: RogueIds): number {
  if (!v.on(ids.snd)) return -1
  const snd = b.ability(SLICE_AND_DICE)
  b.add(SLICE_AND_DICE, [refresh(snd, seconds(v, ids.sndRefresh)), minComboPoints(v.num(ids.sndCp))])
  return snd
}

/** Expose Armor's upkeep at 5 combo points, when it's on. */
export function exposeArmorLine(b: RogueRotationBuilder, v: Reader, ids: RogueIds): void {
  if (!v.on(ids.expose)) return
  const ea = b.ability(EXPOSE_ARMOR)
  b.add(EXPOSE_ARMOR, [refresh(ea, 0), minComboPoints(5)])
}

/** Eviscerate at its combo points, when it's on. */
export function eviscerateLine(b: RogueRotationBuilder, v: Reader, ids: RogueIds, extra: RotationCondition[] = []): void {
  if (v.on(ids.eviscerate)) b.add(EVISCERATE, [minComboPoints(v.num(ids.eviscerateCp)), ...extra])
}

/** The ids of the on-use items and consumables a rogue rotation knows how to use. */
export const rogueOnUse = (ctx: RogueContext): string[] => [
  ...ctx.items.map((i) => i.id),
  ...ctx.consumables.filter((c) => c.id === THISTLE_TEA.id || c.id === JUJU_FLURRY.id).map((c) => c.id),
]
