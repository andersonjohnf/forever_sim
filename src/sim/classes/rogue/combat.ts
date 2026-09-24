// The Combat rogue's priority list and its settings (docs/classes/rogue.md §6.1): the Classic Era
// community priority adapted to Forever, with first-pass defaults (decision D27).
//
// Off the GCD: the racial, on-use items, Thistle Tea at low Energy and Juju Flurry. On the GCD: Slice
// and Dice's upkeep, Blade Flurry and Adrenaline Rush on cooldown, Expose Armor if it's on, Rupture
// if it's on, Eviscerate at 5 combo points, and Sinister Strike.
import type { RotationOption, RotationValue } from '../../types'
import type { ClassRotationContext } from '../rotation'
import { reader, seconds, timeLeftAtLeast, type ClassRotation } from '../warrior/shared'
import { ADRENALINE_RUSH, BLADE_FLURRY, RUPTURE, SINISTER_STRIKE } from './abilities'
import type { TalentRanks } from './modifiers'
import {
  comboPointOption,
  consumableOptions,
  cooldownOptions,
  eviscerateLine,
  eviscerateOptions,
  exposeArmorLine,
  exposeArmorOption,
  minComboPoints,
  offGcdLines,
  refresh,
  rogueIds,
  rogueOnUse,
  RogueRotationBuilder,
  sliceAndDiceLine,
  sliceAndDiceOptions,
} from './shared'

const IDS = rogueIds('combat')
const ID = {
  ...IDS,
  bladeFlurry: 'rogue.combat.bladeFlurry.enabled',
  adrenalineRush: 'rogue.combat.adrenalineRush.enabled',
  rupture: 'rogue.combat.rupture.enabled',
  ruptureCp: 'rogue.combat.rupture.minComboPoints',
  ruptureLeft: 'rogue.combat.rupture.minFightLeftSec',
}

/** Defaults from rogue.md §6.1's table, in priority order: the common priority with a first-pass search (D27). */
export const COMBAT_OPTIONS: RotationOption[] = [
  ...cooldownOptions(ID),
  {
    kind: 'toggle',
    id: ID.bladeFlurry,
    group: 'Cooldowns and buffs',
    label: 'Blade Flurry',
    help: 'Use Blade Flurry on cooldown: +20% attack speed for 15 s, every 2 min, for 25 Energy. Its second target isn’t simulated yet.',
    default: true,
    requires: { talent: 'Blade Flurry' },
  },
  {
    kind: 'toggle',
    id: ID.adrenalineRush,
    group: 'Cooldowns and buffs',
    label: 'Adrenaline Rush',
    help: 'Use Adrenaline Rush on cooldown: twice the Energy for 15 s, every 5 min.',
    default: true,
    requires: { talent: 'Adrenaline Rush' },
  },
  ...sliceAndDiceOptions(ID, 2, 0.5),
  exposeArmorOption(ID),
  {
    kind: 'toggle',
    id: ID.rupture,
    group: 'Core abilities',
    label: 'Rupture',
    help: 'Keep Rupture on the boss: a bleed of 6 s plus 2 s per combo point that ignores armor. Combat does more with Eviscerate.',
    default: false,
  },
  comboPointOption(ID.ruptureCp, 'Rupture at', 'Use Rupture at or above this many combo points.', 5, ID.rupture),
  {
    kind: 'number',
    id: ID.ruptureLeft,
    group: 'Core abilities',
    label: 'Rupture while the fight has',
    help: 'Use Rupture only while at least this much of the fight is left, so enough of its ticks land.',
    unit: 's left',
    min: 0,
    max: 60,
    step: 1,
    default: 10,
    dependsOn: ID.rupture,
  },
  ...eviscerateOptions(ID, 5),
  ...consumableOptions(ID, 10),
]

/**
 * The Combat priority list from the settings (rogue.md §6.1). `talents` gates Blade Flurry and
 * Adrenaline Rush and resolves every ability's talents; `context` gives the race, the on-use items
 * and the consumables selected in Buffs.
 */
export function combatRotation(values: Record<string, RotationValue>, talents: TalentRanks, context: Partial<ClassRotationContext> = {}): ClassRotation {
  const ctx = { race: context.race ?? '', items: context.items ?? [], consumables: context.consumables ?? [] }
  const v = reader(COMBAT_OPTIONS, values, talents)
  const b = new RogueRotationBuilder(talents)

  // Off the GCD: the racial, on-use items and consumables.
  offGcdLines(b, v, ID, ctx)
  // Slice and Dice first: down, or about to run out, at its combo points.
  sliceAndDiceLine(b, v, ID)
  // Blade Flurry and Adrenaline Rush on cooldown, with their talents.
  if (talents.has('Blade Flurry') && v.on(ID.bladeFlurry)) b.add(BLADE_FLURRY, [])
  if (talents.has('Adrenaline Rush') && v.on(ID.adrenalineRush)) b.add(ADRENALINE_RUSH, [])
  // Expose Armor at 5 points when it's down.
  exposeArmorLine(b, v, ID)
  // Rupture when it's off the boss, at its points, with time for its ticks.
  if (v.on(ID.rupture)) {
    const rupture = b.ability(RUPTURE)
    b.add(RUPTURE, [minComboPoints(v.num(ID.ruptureCp)), refresh(rupture, 0), timeLeftAtLeast(seconds(v, ID.ruptureLeft))])
  }
  // Eviscerate at its points, then Sinister Strike whenever it's affordable.
  eviscerateLine(b, v, ID)
  b.add(SINISTER_STRIKE, [])
  return b.result(rogueOnUse(ctx))
}

/** Buff catalogue ids the Combat rogue keeps up itself with these settings: its Expose Armor. */
export function combatMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return reader(COMBAT_OPTIONS, values).on(ID.expose) ? ['exposeArmor'] : []
}
