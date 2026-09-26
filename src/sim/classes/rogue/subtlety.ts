// The Subtlety rogue's priority list and its settings (docs/classes/rogue.md §6.3): the Classic Era
// Hemorrhage priority adapted to Forever's Subtlety, with first-pass defaults (decision D27). The rows
// are a priority list you reorder (SUBTLETY_APL, decision D31), each with its own settings.
//
// Off the GCD: the racial, on-use items, Thistle Tea, Juju Flurry, and Premeditation with room for
// its 2 points. On the GCD: Slice and Dice's upkeep, Expose Armor if it's on, Rupture at 5 points,
// Eviscerate, Hemorrhage to keep its debuff on a bleeding boss, Ambush in Cutthroat's window, Ghostly
// Strike on cooldown, and Backstab from behind with a dagger; Hemorrhage builds otherwise, from the
// front or without one (Sinister Strike without the talent).
import type { AplDefinition, RotationOption, RotationValue } from '../../types'
import { compileAplRows } from '../apl'
import type { ClassRotationContext } from '../rotation'
import { reader, seconds, timeLeftAtLeast, type ClassRotation } from '../warrior/shared'
import {
  AMBUSH,
  BACKSTAB,
  CUTTHROAT_WINDOW,
  GHOSTLY_STRIKE,
  GHOSTLY_STRIKE_DAGGER_PCT,
  HEMORRHAGE,
  HEMORRHAGE_DAGGER_PCT,
  PREMEDITATION,
  RUPTURE,
  SINISTER_STRIKE,
} from './abilities'
import type { TalentRanks } from './modifiers'
import {
  auraUp,
  comboPointOption,
  consumableOptions,
  cooldownOptions,
  eviscerateLine,
  eviscerateOptions,
  exposeArmorLine,
  exposeArmorOption,
  maxComboPoints,
  minComboPoints,
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

export const SUBTLETY_IDS = {
  ...rogueIds('subtlety'),
  premeditation: 'rogue.subtlety.premeditation.enabled',
  rupture: 'rogue.subtlety.rupture.enabled',
  ruptureCp: 'rogue.subtlety.rupture.minComboPoints',
  ruptureLeft: 'rogue.subtlety.rupture.minFightLeftSec',
  hemorrhage: 'rogue.subtlety.hemorrhage.enabled',
  ambush: 'rogue.subtlety.ambush.enabled',
  ghostlyStrike: 'rogue.subtlety.ghostlyStrike.enabled',
  builder: 'rogue.subtlety.builder',
}
const ID = SUBTLETY_IDS

/** Cutthroat's chance per rank that a landed Backstab opens the Ambush window, 3% (462708's curve) [F] (rogue.md §5.3). */
export const CUTTHROAT_PCT_PER_RANK = 3

/** Defaults from rogue.md §6.3's table, in priority order: the common priority with a first-pass search (D27). */
export const SUBTLETY_OPTIONS: RotationOption[] = [
  ...cooldownOptions(ID),
  {
    kind: 'toggle',
    id: ID.premeditation,
    group: 'Cooldowns and buffs',
    label: 'Premeditation',
    help: 'Use Premeditation on cooldown at 3 combo points or fewer: 2 combo points at once, every 2 min, off the global cooldown.',
    default: true,
    requires: { talent: 'Premeditation' },
  },
  ...sliceAndDiceOptions(ID, 2, 0.5),
  exposeArmorOption(ID),
  {
    kind: 'choice',
    id: ID.builder,
    group: 'Core abilities',
    label: 'Builder',
    help: 'What builds your combo points. Hemorrhage costs 35 Energy to Backstab’s 60, so it builds them faster and keeps its debuff up. Backstab needs a dagger in the main hand and hits only from behind (Hemorrhage builds otherwise), and only its hits open Cutthroat’s Ambush.',
    choices: [
      { value: 'hemorrhage', label: 'Hemorrhage' },
      { value: 'backstab', label: 'Backstab' },
    ],
    default: 'hemorrhage',
  },
  {
    kind: 'toggle',
    id: ID.rupture,
    group: 'Core abilities',
    label: 'Rupture',
    help: 'Keep Rupture on the boss: a bleed of 6 s plus 2 s per combo point that ignores armor, 30% stronger with Serrated Blades 3/3. With Thousand Cuts, each tick makes your next Backstab or Hemorrhage 3 Energy cheaper.',
    default: true,
  },
  comboPointOption(ID.ruptureCp, 'Rupture at', 'Use Rupture at or above this many combo points when it’s off the boss.', 3, ID.rupture),
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
  {
    kind: 'toggle',
    id: ID.hemorrhage,
    group: 'Core abilities',
    label: 'Hemorrhage on a bleeding boss',
    help: 'While your Rupture bleeds, keep Hemorrhage’s debuff on the boss: your Rupture deals 15% more for 15 s.',
    default: true,
    requires: { talent: 'Hemorrhage' },
    // It keeps Rupture's bleed stronger, so with Rupture off its row says it isn't used (D31).
    alsoDependsOn: ID.rupture,
  },
  {
    kind: 'toggle',
    id: ID.ambush,
    group: 'Core abilities',
    label: 'Ambush',
    help: 'With Backstab as the builder, use Ambush when Cutthroat allows it without Stealth: 15% of your Backstabs let the next Ambush within 10 s hit for 250% of (weapon damage + 116).',
    default: true,
    requires: { talent: 'Cutthroat' },
  },
  {
    kind: 'toggle',
    id: ID.ghostlyStrike,
    group: 'Core abilities',
    label: 'Ghostly Strike',
    help: 'Use Ghostly Strike on cooldown: 125% weapon damage, 180% with a dagger in the main hand, for 40 Energy, every 20 s. Off by default: its Energy does as much in Hemorrhage.',
    default: false,
    requires: { talent: 'Ghostly Strike' },
  },
  ...consumableOptions(ID, 10),
]


const ROWS = rogueRows(ID)

/**
 * Subtlety's rotation as a priority list (decision D31; rogue.md §6.3 "The priority list"): §6.3's
 * rows in their default order, each with its switch and settings. Nothing is pinned: a rogue has no
 * pre-pull. The consumables are spec-wide and take their turn with the on-use items' row. No named
 * rotations: the defaults are the implicit Default, the common priority (D27).
 */
export const SUBTLETY_APL: AplDefinition = {
  rows: [
    ROWS.racial,
    ROWS.onUseItems,
    {
      id: 'premeditation',
      label: 'Premeditation',
      icon: PREMEDITATION.icon,
      enabledId: ID.premeditation,
      optionIds: [],
      summary: [{ text: 'on cooldown, at 3 combo points or fewer' }],
    },
    ROWS.sliceAndDice,
    ROWS.exposeArmor,
    {
      id: 'rupture',
      label: 'Rupture',
      icon: RUPTURE.icon,
      enabledId: ID.rupture,
      optionIds: [ID.ruptureCp, ID.ruptureLeft],
      summary: [
        { option: ID.ruptureCp, text: 'from {}' },
        { option: ID.ruptureLeft, text: 'while the fight has {}', hideWhen: 0 },
      ],
    },
    ROWS.eviscerate,
    {
      id: 'hemorrhage',
      label: 'Hemorrhage on a bleeding boss',
      icon: HEMORRHAGE.icon,
      enabledId: ID.hemorrhage,
      optionIds: [],
      summary: [{ text: 'while Rupture bleeds, when its debuff is down' }],
    },
    { id: 'ambush', label: 'Ambush', icon: AMBUSH.icon, enabledId: ID.ambush, optionIds: [], summary: [{ text: 'in Cutthroat’s window' }] },
    { id: 'ghostlyStrike', label: 'Ghostly Strike', icon: GHOSTLY_STRIKE.icon, enabledId: ID.ghostlyStrike, optionIds: [], summary: [{ text: 'on cooldown' }] },
    {
      id: 'builder',
      label: 'Builder',
      icon: HEMORRHAGE.icon,
      optionIds: [ID.builder],
      summary: [{ option: ID.builder, text: '{}' }],
      help: 'Builds your combo points whenever you have the Energy. It has no switch: the rotation always builds.',
    },
  ],
  specWide: rogueSpecWide(ID),
  presets: [],
}

/**
 * The Subtlety priority list from the settings (rogue.md §6.3), its rows in `order` (SUBTLETY_APL;
 * absent: the default order). `talents` gates Premeditation, Hemorrhage, Cutthroat's Ambush and
 * Ghostly Strike and resolves every ability's talents; `context` gives the race, the on-use items,
 * the consumables selected in Buffs and the weapons (Backstab and Ambush need a dagger in the main
 * hand, and Ghostly Strike and Hemorrhage hit harder with one). The Hemorrhage row reads Rupture by
 * definition (`b.ability`), so it's the same wherever either sits.
 */
export function subtletyRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  context: Partial<ClassRotationContext> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx = { race: context.race ?? '', items: context.items ?? [], consumables: context.consumables ?? [] }
  const v = reader(SUBTLETY_OPTIONS, values, talents)
  const b = new RogueRotationBuilder(talents, context.profile?.id)
  const dagger = context.weaponTypes === undefined || context.weaponTypes[0] === 'dagger'
  const hemorrhage = { ...HEMORRHAGE, weaponPercent: dagger ? HEMORRHAGE_DAGGER_PCT : HEMORRHAGE.weaponPercent }
  const hasHemorrhage = talents.has('Hemorrhage')
  // Backstab builds from behind with a main-hand dagger, unless Hemorrhage is chosen (its talent).
  const backstab = dagger && !context.front && !(hasHemorrhage && v.str(ID.builder) === 'hemorrhage')
  // Cutthroat's window comes from Backstab.
  const ambush = backstab && talents.has('Cutthroat') && v.on(ID.ambush)

  compileAplRows(SUBTLETY_APL, order, {
    // Off the GCD (§6.3 row 1): the racial, then the on-use items with the consumables selected in Buffs.
    racial: () => racialLine(b, v, ID, ctx),
    onUseItems: () => onUseLines(b, v, ID, ctx),
    // Row 2: Premeditation with room for both its points.
    premeditation: () => {
      if (talents.has('Premeditation') && v.on(ID.premeditation)) b.add(PREMEDITATION, [maxComboPoints(3)])
    },
    // Row 3: Slice and Dice, down or about to run out, at its combo points.
    sliceAndDice: () => sliceAndDiceLine(b, v, ID),
    // Row 4: Expose Armor at 5 points when it's down.
    exposeArmor: () => exposeArmorLine(b, v, ID),
    // Row 5: Rupture when it's off the boss, at its points, with time for its ticks.
    rupture: () => {
      if (!v.on(ID.rupture)) return
      const rupture = b.ability(RUPTURE)
      b.add(RUPTURE, [minComboPoints(v.num(ID.ruptureCp)), refresh(rupture, 0), timeLeftAtLeast(seconds(v, ID.ruptureLeft))])
    },
    // Row 6: Eviscerate at its points.
    eviscerate: () => eviscerateLine(b, v, ID),
    // Row 7: Hemorrhage's debuff on the boss while Rupture bleeds.
    hemorrhage: () => {
      if (!hasHemorrhage || !v.on(ID.rupture) || !v.on(ID.hemorrhage)) return
      const rupture = b.ability(RUPTURE)
      const hemo = b.ability(hemorrhage)
      b.add(hemorrhage, [auraUp(rupture), refresh(hemo, 0)])
    },
    // Row 8: Ambush in Cutthroat's window (the window's condition comes with it), which a landed Backstab opens.
    ambush: () => {
      if (ambush) b.add(AMBUSH, [])
    },
    // Row 9: Ghostly Strike on cooldown.
    ghostlyStrike: () => {
      if (talents.has('Ghostly Strike') && v.on(ID.ghostlyStrike)) {
        b.add({ ...GHOSTLY_STRIKE, weaponPercent: dagger ? GHOSTLY_STRIKE_DAGGER_PCT : GHOSTLY_STRIKE.weaponPercent }, [])
      }
    },
    // Row 10, the builder: Backstab from behind with a dagger; otherwise Hemorrhage (Sinister Strike
    // without it). Only one of them, so a cheaper builder never takes the Energy Backstab waits for.
    builder: () => {
      if (backstab) {
        const cutthroat = talents.get('Cutthroat') ?? 0
        b.add(ambush && cutthroat > 0 ? { ...BACKSTAB, opensWindow: { aura: CUTTHROAT_WINDOW, chance: (CUTTHROAT_PCT_PER_RANK * cutthroat) / 100 } } : BACKSTAB, [])
      } else b.add(hasHemorrhage ? hemorrhage : SINISTER_STRIKE, [])
    },
  })
  return b.result(rogueOnUse(ctx))
}


/** Buff catalogue ids the Subtlety rogue keeps up itself with these settings: its Expose Armor. */
export function subtletyMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return reader(SUBTLETY_OPTIONS, values).on(ID.expose) ? ['exposeArmor'] : []
}

/**
 * Settings the builder leaves unused (docs/ux.md "Rotation"): with Hemorrhage building, no Backstab
 * opens Cutthroat's window, and its debuff line adds nothing to the Hemorrhages it builds with.
 */
export function subtletyUnusedSettings(values: Record<string, RotationValue>): Record<string, string> {
  if (reader(SUBTLETY_OPTIONS, values).str(ID.builder) !== 'hemorrhage') return {}
  return {
    [ID.ambush]: 'Not used: only Backstab opens Cutthroat’s Ambush, and Hemorrhage is your builder.',
    [ID.hemorrhage]: 'Not used: Hemorrhage is your builder, so its debuff stays up.',
  }
}
