// The Assassination rogue's priority list and its settings (docs/classes/rogue.md §6.2): the Classic
// Era Seal Fate Daggers priority adapted to Forever, with first-pass defaults (decision D27).
//
// Off the GCD: the racial, on-use items, Thistle Tea, Juju Flurry, and Cold Blood before a
// 5-point Eviscerate. On the GCD: Slice and Dice's upkeep, Venom's upkeep if it's on (off by default:
// the quick search finds its combo points do more in Eviscerate, §6.2), Expose Armor if it's on,
// Eviscerate, and Mutilate with daggers in both hands, or Sinister Strike without them.
import type { RotationOption, RotationValue } from '../../types'
import type { ClassRotationContext } from '../rotation'
import { reader, seconds, type ClassRotation } from '../warrior/shared'
import { COLD_BLOOD, EVISCERATE, MUTILATE, SINISTER_STRIKE, VENOM } from './abilities'
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
  minEnergy,
  offGcdLines,
  refresh,
  rogueIds,
  rogueOnUse,
  RogueRotationBuilder,
  sliceAndDiceLine,
  sliceAndDiceOptions,
} from './shared'

const ID = {
  ...rogueIds('assassination'),
  coldBlood: 'rogue.assassination.coldBlood.enabled',
  venom: 'rogue.assassination.venom.enabled',
  venomCp: 'rogue.assassination.venom.minComboPoints',
  venomRefresh: 'rogue.assassination.venom.refreshBelowSec',
  mutilate: 'rogue.assassination.mutilate.enabled',
}

/** Defaults from rogue.md §6.2's table, in priority order: the common priority with a first-pass search (D27). */
export const ASSASSINATION_OPTIONS: RotationOption[] = [
  ...cooldownOptions(ID),
  ...sliceAndDiceOptions(ID, 2, 0.5),
  {
    kind: 'toggle',
    id: ID.venom,
    group: 'Cooldowns and buffs',
    label: 'Venom',
    help: 'Keep Venom up: your poisons deal 30% more and apply 10 points more often, for 6 s plus 3 s per combo point. It comes after Slice and Dice. Off by default: its combo points do more in Eviscerate.',
    default: false,
    requires: { talent: 'Venom' },
  },
  comboPointOption(ID.venomCp, 'Venom at', 'Use it at or above this many combo points when it’s down or about to run out.', 3, ID.venom, 'Cooldowns and buffs'),
  {
    kind: 'number',
    id: ID.venomRefresh,
    group: 'Cooldowns and buffs',
    label: 'Venom again with',
    help: 'Renew it when this much of it is left. At 0, only once it has run out.',
    unit: 's left',
    min: 0,
    max: 10,
    step: 0.5,
    default: 0,
    dependsOn: ID.venom,
  },
  exposeArmorOption(ID),
  {
    kind: 'toggle',
    id: ID.coldBlood,
    group: 'Cooldowns and buffs',
    label: 'Cold Blood',
    help: 'Use Cold Blood just before a 5-point Eviscerate: that Eviscerate crits, every 3 min.',
    default: true,
    requires: { talent: 'Cold Blood' },
  },
  ...eviscerateOptions(ID, 4),
  {
    kind: 'toggle',
    id: ID.mutilate,
    group: 'Core abilities',
    label: 'Mutilate',
    help: 'Build with Mutilate: both daggers strike for 75% of (weapon damage + 67), 20% more against your Deadly Poison, for 2 combo points and 60 Energy. It needs a dagger in each hand; without them, or with this off, Sinister Strike builds.',
    default: true,
    requires: { talent: 'Mutilate' },
  },
  ...consumableOptions(ID, 10),
]

/**
 * The Assassination priority list from the settings (rogue.md §6.2). `talents` gates Cold Blood, Venom
 * and Mutilate and resolves every ability's talents; `context` gives the race, the on-use items, the
 * consumables selected in Buffs and the weapons (Mutilate needs daggers in both hands).
 */
export function assassinationRotation(values: Record<string, RotationValue>, talents: TalentRanks, context: Partial<ClassRotationContext> = {}): ClassRotation {
  const ctx = { race: context.race ?? '', items: context.items ?? [], consumables: context.consumables ?? [] }
  const v = reader(ASSASSINATION_OPTIONS, values, talents)
  const b = new RogueRotationBuilder(talents)

  offGcdLines(b, v, ID, ctx)
  sliceAndDiceLine(b, v, ID)
  // Venom: down, or about to run out, at its points.
  if (talents.has('Venom') && v.on(ID.venom)) {
    const venom = b.ability(VENOM)
    b.add(VENOM, [refresh(venom, seconds(v, ID.venomRefresh)), minComboPoints(v.num(ID.venomCp))])
  }
  exposeArmorLine(b, v, ID)
  // Cold Blood just before a 5-point Eviscerate: at 5 points with its Energy, so the Eviscerate that
  // follows in the same moment uses it.
  if (talents.has('Cold Blood') && v.on(ID.coldBlood) && v.on(ID.eviscerate)) {
    b.add(COLD_BLOOD, [minComboPoints(5), minEnergy(b.cost(b.ability(EVISCERATE)) / 10)])
  }
  eviscerateLine(b, v, ID)
  // The builder: Mutilate with a dagger in each hand, Sinister Strike otherwise.
  const daggers = context.weaponTypes === undefined || (context.weaponTypes[0] === 'dagger' && context.weaponTypes[1] === 'dagger')
  if (talents.has('Mutilate') && v.on(ID.mutilate) && daggers) b.add(MUTILATE, [])
  else b.add(SINISTER_STRIKE, [])
  return b.result(rogueOnUse(ctx))
}

/** Buff catalogue ids the Assassination rogue keeps up itself with these settings: its Expose Armor. */
export function assassinationMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return reader(ASSASSINATION_OPTIONS, values).on(ID.expose) ? ['exposeArmor'] : []
}
