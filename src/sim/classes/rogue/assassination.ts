// The Assassination rogue's priority list and its settings (docs/classes/rogue.md §6.2): the Classic
// Era Seal Fate Daggers priority adapted to Forever, with first-pass defaults (decision D27). The
// rows are a priority list you reorder (ASSASSINATION_APL, decision D31), each with its own settings.
//
// Off the GCD: the racial, on-use items, Thistle Tea, Juju Flurry, and Cold Blood before a
// 5-point Eviscerate. On the GCD: Slice and Dice's upkeep, Venom's upkeep if it's on (off by default:
// the quick search finds its combo points do more in Eviscerate, §6.2), Expose Armor if it's on,
// Eviscerate, and Mutilate with daggers in both hands, or Sinister Strike without them.
import type { AplDefinition, RotationOption, RotationValue } from '../../types'
import { compileAplRows } from '../apl'
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
  onUseLines,
  racialLine,
  refresh,
  rogueIds,
  rogueOnUse,
  rogueRows,
  RogueRotationBuilder,
  rogueSpecWide,
  sliceAndDiceLine,
  sliceAndDiceOptions,
} from './shared'

export const ASSASSINATION_IDS = {
  ...rogueIds('assassination'),
  coldBlood: 'rogue.assassination.coldBlood.enabled',
  venom: 'rogue.assassination.venom.enabled',
  venomCp: 'rogue.assassination.venom.minComboPoints',
  venomRefresh: 'rogue.assassination.venom.refreshBelowSec',
  mutilate: 'rogue.assassination.mutilate.enabled',
}
const ID = ASSASSINATION_IDS

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
    // It waits for Eviscerate, so with Eviscerate off its row says it isn't used (D31).
    alsoDependsOn: ID.eviscerate,
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

const ROWS = rogueRows(ID)

/**
 * Assassination's rotation as a priority list (decision D31; rogue.md §6.2 "The priority list"):
 * §6.2's rows in their default order, each with its switch and settings. Nothing is pinned: a rogue
 * has no pre-pull. The consumables are spec-wide and take their turn with the on-use items' row. No
 * named rotations: the defaults are the implicit Default, the common priority (D27).
 */
export const ASSASSINATION_APL: AplDefinition = {
  rows: [
    ROWS.racial,
    ROWS.onUseItems,
    ROWS.sliceAndDice,
    {
      id: 'venom',
      label: 'Venom',
      icon: VENOM.icon,
      enabledId: ID.venom,
      optionIds: [ID.venomCp, ID.venomRefresh],
      summary: [
        { option: ID.venomCp, text: 'from {}' },
        { option: ID.venomRefresh, text: 'again with {}', zeroText: 'again once it runs out' },
      ],
    },
    ROWS.exposeArmor,
    {
      id: 'coldBlood',
      label: 'Cold Blood',
      icon: COLD_BLOOD.icon,
      enabledId: ID.coldBlood,
      optionIds: [],
      summary: [{ text: 'at 5 combo points, before Eviscerate' }],
    },
    ROWS.eviscerate,
    {
      id: 'builder',
      label: 'Builder',
      icon: MUTILATE.icon,
      optionIds: [ID.mutilate],
      summary: [
        { option: ID.mutilate, text: 'Mutilate with a dagger in each hand, else Sinister Strike' },
        { option: ID.mutilate, text: 'Sinister Strike', when: false },
      ],
      help: 'What builds your combo points, whenever you have the Energy: Mutilate with a dagger in each hand, Sinister Strike otherwise. It has no switch: the rotation always builds.',
    },
  ],
  specWide: rogueSpecWide(ID),
  presets: [],
}

/**
 * The Assassination priority list from the settings (rogue.md §6.2), its rows in `order`
 * (ASSASSINATION_APL; absent: the default order). `talents` gates Cold Blood, Venom and Mutilate and
 * resolves every ability's talents; `context` gives the race, the on-use items, the consumables
 * selected in Buffs and the weapons (Mutilate needs daggers in both hands). Cold Blood's Energy is
 * Eviscerate's cost, which it reads by definition (`b.ability`), so it's the same wherever it sits.
 */
export function assassinationRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  context: Partial<ClassRotationContext> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx = { race: context.race ?? '', items: context.items ?? [], consumables: context.consumables ?? [] }
  const v = reader(ASSASSINATION_OPTIONS, values, talents)
  const b = new RogueRotationBuilder(talents)
  const daggers = context.weaponTypes === undefined || (context.weaponTypes[0] === 'dagger' && context.weaponTypes[1] === 'dagger')

  compileAplRows(ASSASSINATION_APL, order, {
    // Off the GCD (§6.2 row 1): the racial, then the on-use items with the consumables selected in Buffs.
    racial: () => racialLine(b, v, ID, ctx),
    onUseItems: () => onUseLines(b, v, ID, ctx),
    // Row 2: Slice and Dice, down or about to run out, at its combo points.
    sliceAndDice: () => sliceAndDiceLine(b, v, ID),
    // Row 3: Venom, down or about to run out, at its points.
    venom: () => {
      if (!talents.has('Venom') || !v.on(ID.venom)) return
      const venom = b.ability(VENOM)
      b.add(VENOM, [refresh(venom, seconds(v, ID.venomRefresh)), minComboPoints(v.num(ID.venomCp))])
    },
    // Row 4: Expose Armor at 5 points when it's down.
    exposeArmor: () => exposeArmorLine(b, v, ID),
    // Row 5: Cold Blood just before a 5-point Eviscerate: at 5 points with its Energy, so the
    // Eviscerate that follows in the same moment uses it.
    coldBlood: () => {
      if (talents.has('Cold Blood') && v.on(ID.coldBlood) && v.on(ID.eviscerate)) {
        b.add(COLD_BLOOD, [minComboPoints(5), minEnergy(b.cost(b.ability(EVISCERATE)) / 10)])
      }
    },
    // Row 6: Eviscerate at its points.
    eviscerate: () => eviscerateLine(b, v, ID),
    // Row 7, the builder: Mutilate with a dagger in each hand, Sinister Strike otherwise.
    builder: () => {
      if (talents.has('Mutilate') && v.on(ID.mutilate) && daggers) b.add(MUTILATE, [])
      else b.add(SINISTER_STRIKE, [])
    },
  })
  return b.result(rogueOnUse(ctx))
}

/** Buff catalogue ids the Assassination rogue keeps up itself with these settings: its Expose Armor. */
export function assassinationMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return reader(ASSASSINATION_OPTIONS, values).on(ID.expose) ? ['exposeArmor'] : []
}
