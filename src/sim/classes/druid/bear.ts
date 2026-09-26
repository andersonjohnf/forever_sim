// The Feral bear's priority list and its settings (docs/classes/druid.md §6.3, §7.4).
//
// Three rotations, named presets of the list (decisions D28, D31). Defensive keeps both of the tank's
// duties first, Demoralizing Roar and Faerie Fire on the boss, timed by the duty rule, which is fixed
// and never tuned; around them, the threat abilities' settings are the best found on TPS, with DPS
// beside it (decision D23; §6.3 "Tuning the defaults"). Balanced, the default, drops the roar and
// keeps Faerie Fire, the raid's armor debuff (§6.3 "Balanced"); Max TPS drops the roar too, for threat
// (§6.3 "Max TPS"). Each duty is a setting of its own, so a preset drops the roar by moving its
// default. The rows are a priority list you reorder (BEAR_APL), each with its own settings.
//
// Off the GCD: Berserk, Enrage (before the pull, and in combat on cooldown), the racial cooldown
// (Night Elf), on-use items, the Mighty Rage Potion and Juju Flurry when they're selected in Buffs,
// and the Maul queue. On the GCD: Demoralizing Roar's and Faerie Fire's upkeep, Primal Bite,
// Lacerate's stacks, Swipe with spare rage, and Faerie Fire as a filler. The sim has one target, so
// Swipe's and Berserk's Primal Bite's extra targets don't count. Setting ids are
// `druid.bear.<ability>.<param>`; rage thresholds are absolute rage points. Primal Bite was Mangle
// until build 1.60.1.70009, and its setting and row keep the id `mangle`, so saved setups and links
// keep working.
import { toTenths } from '../../core/formulas'
import type { OnUseSpec } from '../../effects/types'
import { type AbilityDef, COND, type RotationCondition } from '../../plan/types'
import type { AplDefinition, RotationDefaultWhen, RotationGroup, RotationOption, RotationValue } from '../../types'
import { compileAplRows, DEFAULT_APL_PRESET } from '../apl'
import type { ClassRotationContext } from '../rotation'
import { ELUNES_LIGHT } from '../warrior/abilities'
import { type ClassRotation, JUJU_FLURRY, maxRage, minRage, NO_CONTEXT, RAGE_POTION, reader, seconds } from '../warrior/shared'
import { IDOL_OF_BRUTALITY, IDOL_OF_BRUTALITY_ABILITIES, IDOL_OF_BRUTALITY_RAGE_TENTHS, WOLFSHEAD_HELM } from './abilities'
import {
  BEAR_GCD_MS,
  demoralizingRoar,
  ENRAGE_RAGE_TENTHS,
  ENRAGE_TICK_TENTHS,
  ENRAGE_TICKS,
  enrage,
  FAERIE_FIRE_BEAR,
  LACERATE,
  LACERATE_MAX_STACKS,
  lacerate as lacerateFor,
  PRIMAL_BITE,
  MAUL,
  SWIPE,
} from './bear-abilities'
import { DruidRotationBuilder } from './builder'
import { BERSERK, onUseCast } from './cat-abilities'
import type { TalentRanks } from './modifiers'

const B = 'druid.bear'
export const BEAR_IDS = {
  priority: `${B}.priority`,
  berserk: `${B}.berserk.enabled`,
  enragePrepull: `${B}.enrage.prepull`,
  enrageInCombat: `${B}.enrage.inCombat`,
  enrageMaxRage: `${B}.enrage.maxRage`,
  racial: `${B}.racial.enabled`,
  items: `${B}.onUseItems.enabled`,
  ffEnabled: `${B}.faerieFire.enabled`,
  ffRefresh: `${B}.faerieFire.refreshBelowSec`,
  roarEnabled: `${B}.demoRoar.enabled`,
  roarRefresh: `${B}.demoRoar.refreshBelowSec`,
  maulEnabled: `${B}.maul.enabled`,
  maulMinRage: `${B}.maul.minRage`,
  mangleEnabled: `${B}.mangle.enabled`,
  lacerateEnabled: `${B}.lacerate.enabled`,
  lacerateAlone: `${B}.lacerate.onlyWithoutOtherBleeds`,
  lacerateRefresh: `${B}.lacerate.refreshBelowSec`,
  swipeEnabled: `${B}.swipe.enabled`,
  swipeMinRage: `${B}.swipe.minRage`,
  ffFiller: `${B}.faerieFire.filler`,
  potion: `${B}.ragePotion.enabled`,
  potionMaxRage: `${B}.ragePotion.maxRage`,
  juju: `${B}.jujuFlurry.enabled`,
}
const ID = BEAR_IDS

/** The bear's rage cap, 100: no talent raises it (rage.md#rage-pool-cap-and-decay). Rage thresholds are absolute. */
const BEAR_MAX_RAGE = 100

/** Enrage 1.5 s before the pull (druid.md §6.3 row 2). */
export const PREPULL_ENRAGE_MS = -1500

/** A rage threshold input, 0 to the 100 cap, in its parent's group. */
const rageOption = (id: string, label: string, help: string, def: number, dependsOn: string, group: RotationGroup): Extract<RotationOption, { kind: 'number' }> => ({
  kind: 'number',
  id,
  label,
  group,
  help,
  unit: 'rage',
  min: 0,
  max: BEAR_MAX_RAGE,
  step: 1,
  default: def,
  dependsOn,
})

/** A debuff's refresh input, in seconds left; `defaultWhen` for a default that follows the priority. */
const refreshOption = (
  id: string,
  label: string,
  help: string,
  def: number,
  max: number,
  dependsOn: string,
  group: RotationGroup,
  defaultWhen?: RotationDefaultWhen<number>[],
): RotationOption => ({
  kind: 'number',
  id,
  label,
  group,
  help,
  unit: 's left',
  min: 0,
  max,
  step: 0.5,
  default: def,
  ...(defaultWhen ? { defaultWhen } : {}),
  dependsOn,
})

/**
 * The tank duties' refresh rule (druid.md §6.3, decision D26's amendment): a debuff, with or without
 * a cooldown, is refreshed as soon as a missed cast could still be tried again before it falls off,
 * so from its own cooldown, or from one global cooldown if it has none. It's a fixed rule, never
 * tuned: Faerie Fire from its 6 s cooldown, Demoralizing Roar, which has none, from the 1.5 s global
 * cooldown.
 */
export const FAERIE_FIRE_REFRESH_SEC = FAERIE_FIRE_BEAR.cooldownMs / 1000
export const DEMO_ROAR_REFRESH_SEC = BEAR_GCD_MS / 1000
/** A duty's refresh help, second sentence: where the default comes from, the duty rule (druid.md §6.3). */
const DUTY_RULE = (sec: number, why: string) =>
  ` The default, ${sec} s (${why}), follows the tank duties’ rule: refresh while a missed cast can still be tried again before it falls off.`

/**
 * The priority's values, the list's presets (druid.md §6.3, decisions D26 and D28): Defensive
 * (`duties`, "Tank duties first" before D28) keeps the tank's duties, Demoralizing Roar and Faerie
 * Fire; Balanced, the default, drops the roar and keeps Faerie Fire, the raid's armor debuff; Max TPS
 * drops the roar for threat. Both keep Faerie Fire, whose armor raises the bear's damage and so its
 * threat: dropping its upkeep costs 1% of TPS. A setup saved with `duties` loads as Defensive, and one
 * that kept the old default gets Balanced (D28).
 */
export const BEAR_PRIORITY = { duties: 'duties', balanced: 'balanced', maxTps: 'maxTps' } as const
const MAX_TPS = { option: ID.priority, is: BEAR_PRIORITY.maxTps } as const
/**
 * Max TPS's Maul threshold (druid.md §6.3 "Max TPS", T5): tuned on TPS alone (D26), 14 rage, where
 * Defensive and Balanced keep 20 (+0.19% TPS, 95% CI +0.16% to +0.21%, for −0.20% DPS; seed 28401,
 * 200,000 paired fights; 13 to 15 are level).
 */
const MAX_TPS_MAUL_MIN_RAGE = 14
const BALANCED = { option: ID.priority, is: BEAR_PRIORITY.balanced } as const

/** Lacerate's refresh, 12 s left, for every priority (§6.3 "T3's re-check of the defaults"). */
export const LACERATE_REFRESH_SEC = 12

/** Enrage's rage, 10 at once and 20 over 10 s: 30 (druid.md §4.5). */
const ENRAGE_RAGE = (ENRAGE_RAGE_TENTHS + ENRAGE_TICKS * ENRAGE_TICK_TENTHS) / 10

/**
 * Defaults from druid.md §6.3's table, in priority order. Defensive's keep the tank's duties by D26's
 * fixed rule, and the rest is the best rotation found around them for the default setup (D23; §6.3
 * "Tuning the defaults", measured on TPS and DPS with scripts/tune/rotation.mjs). Balanced and Max
 * TPS move the roar's default (§6.3 "Balanced", "Max TPS").
 */
export const BEAR_OPTIONS: RotationOption[] = [
  {
    // The list's preset picker is its control (BEAR_APL's presets): its value is the preset.
    kind: 'choice',
    id: ID.priority,
    label: 'Priority',
    help: 'Which of the three rotations you play: Defensive keeps Demoralizing Roar and Faerie Fire on the boss; Balanced, the default, and Max TPS drop the roar and keep Faerie Fire. The priority list’s preset picker sets it.',
    choices: [
      { value: BEAR_PRIORITY.duties, label: 'Defensive' },
      { value: BEAR_PRIORITY.balanced, label: 'Balanced' },
      { value: BEAR_PRIORITY.maxTps, label: 'Max TPS' },
    ],
    default: BEAR_PRIORITY.balanced,
  },
  {
    kind: 'toggle',
    id: ID.berserk,
    group: 'Cooldowns and buffs',
    label: 'Berserk',
    help: 'Use Berserk on cooldown: for 15 s Primal Bite has no cooldown, so it can fill every global cooldown your rage pays for. Needs the Berserk talent.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.enragePrepull,
    group: 'Cooldowns and buffs',
    label: 'Enrage before the pull',
    help: `Enrage 1.5 s before the pull, so the fight starts with 12 rage and 2 more come each second until ${ENRAGE_RAGE} in all. Your armor from items is 16% lower for its first 8.5 s.`,
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.enrageInCombat,
    group: 'Cooldowns and buffs',
    label: 'Enrage in combat',
    help: `Use Enrage on cooldown in the fight too: ${ENRAGE_RAGE} rage over 10 s, 5 more at once with Wolfshead Helm. For those 10 s your armor from items is 16% lower, which costs the default bear under 0.2% more damage taken.`,
    default: true,
  },
  rageOption(
    ID.enrageMaxRage,
    'Enrage in combat up to',
    `Use it only at or below this much rage, so its rage isn’t lost at the cap. ${BEAR_MAX_RAGE - ENRAGE_RAGE} is the 100 cap minus its ${ENRAGE_RAGE}.`,
    BEAR_MAX_RAGE - ENRAGE_RAGE,
    ID.enrageInCombat,
    'Cooldowns and buffs',
  ),
  {
    kind: 'toggle',
    id: ID.racial,
    group: 'Cooldowns and buffs',
    label: 'Racial cooldown',
    help: 'Use Elune’s Light (Night Elf) on cooldown: +10% crit for 15 s. Tauren and Skyborne have no cooldown to use.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.items,
    group: 'Cooldowns and buffs',
    label: 'On-use items',
    help: 'Use the Manual Crowd Pummeler (+50% attack speed for 30 s, 3 charges), Weakness Analyzer and Earthstrike on cooldown if you wear them. Other on-use items, such as armor and health trinkets, aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.ffEnabled,
    group: 'Cooldowns and buffs',
    label: 'Faerie Fire',
    help: 'Keep your Faerie Fire on the boss: −505 armor for 40 s, free in Dire Bear Form with a 6 s cooldown. It can miss, or the boss can resist it. While this is on, the Buffs tab’s Faerie Fire adds nothing more, since it’s the same debuff. Every preset keeps it: it’s the raid’s armor debuff, and its armor makes your attacks, and so your threat, bigger.',
    default: true,
    maintainsBuff: 'faerieFire',
  },
  refreshOption(
    ID.ffRefresh,
    'Faerie Fire again with',
    `Refresh it when this much of it is left, unless it lasts to the end of the fight.${DUTY_RULE(FAERIE_FIRE_REFRESH_SEC, 'its cooldown')}`,
    FAERIE_FIRE_REFRESH_SEC,
    40,
    ID.ffEnabled,
    'Cooldowns and buffs',
  ),
  {
    kind: 'toggle',
    id: ID.roarEnabled,
    group: 'Cooldowns and buffs',
    label: 'Demoralizing Roar',
    help: 'Keep Demoralizing Roar on the boss: its attack power is 204 lower (138 in Classic Era rules), so it hits you for less. It costs 10 rage and can miss. While this is on, the Buffs tab’s Demoralizing Roar adds nothing more, and a Demoralizing Shout there takes its place. On with Defensive; off by default with Balanced and Max TPS.',
    default: true,
    defaultWhen: [
      { ...BALANCED, default: false },
      { ...MAX_TPS, default: false },
    ],
    maintainsBuff: 'demoralizingRoar',
  },
  refreshOption(
    ID.roarRefresh,
    'Demoralizing Roar again with',
    `Refresh it when this much of it is left, unless it lasts to the end of the fight.${DUTY_RULE(DEMO_ROAR_REFRESH_SEC, 'one global cooldown, as it has none')}`,
    DEMO_ROAR_REFRESH_SEC,
    30,
    ID.roarEnabled,
    'Cooldowns and buffs',
  ),
  {
    kind: 'toggle',
    id: ID.maulEnabled,
    group: 'Core abilities',
    label: 'Maul',
    help: 'Queue Maul on your next swing: your Dire Bear Form attack’s damage plus 128, 10% more with Savage Fury, for 10 rage with Ferocity 5/5 (8 with Idol of Brutality), at 1.75 threat per damage. The swing it replaces gives no rage.',
    default: true,
  },
  {
    ...rageOption(
      ID.maulMinRage,
      'Maul from',
      `Queue it at or above this much rage. It costs 10 with Ferocity 5/5, 8 with Idol of Brutality; from 20, rage stays for Primal Bite and Lacerate. In fights under a minute, 10 makes more threat. With Max TPS it’s ${MAX_TPS_MAUL_MIN_RAGE} by default: a little more threat for a little less damage.`,
      20,
      ID.maulEnabled,
      'Core abilities',
    ),
    // druid.md §6.3 "Max TPS": tuned on TPS alone (D26), 14 makes 0.19% more TPS than 20 for 0.20% of the DPS.
    defaultWhen: [{ ...MAX_TPS, default: MAX_TPS_MAUL_MIN_RAGE }],
  },
  {
    kind: 'toggle',
    id: ID.mangleEnabled,
    group: 'Core abilities',
    label: 'Primal Bite',
    help: 'Use Primal Bite whenever it’s ready: your Dire Bear Form attack’s damage plus 77, every 6 s, for 15 rage with Ferocity 5/5 (13 with Idol of Brutality). Needs the Primal Bite talent (formerly Mangle).',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.lacerateEnabled,
    group: 'Core abilities',
    label: 'Lacerate',
    help: `Build Lacerate to ${LACERATE_MAX_STACKS} stacks on the boss and keep them up: a bleed of 15 every 3 s per stack for 15 s, for 15 rage. Each one also hits for 10% of your Dire Bear Form attack’s damage per stack already there, and restarts the bleed.`,
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.lacerateAlone,
    group: 'Core abilities',
    label: 'Lacerate only when nothing else bleeds',
    help: 'Leave Lacerate out while warriors in the raid (the Buffs tab) keep their Deep Wounds on the boss, which turns on Rend and Tear without it. Its rage then goes to Maul: about 14% less threat and 16% less damage in the default setup, with Lacerate’s “high amount of threat” at 206 an application (untested). Off by default.',
    default: false,
    dependsOn: ID.lacerateEnabled,
  },
  refreshOption(
    ID.lacerateRefresh,
    'Lacerate again with',
    `At 5 stacks, refresh it when this much of its bleed is left; the tick under way is lost. At 0, once it has run out, when it starts again from 1 stack. From ${LACERATE_REFRESH_SEC} s, the global cooldowns Maul’s rage leaves free go to Lacerate, for its threat.`,
    LACERATE_REFRESH_SEC,
    15,
    ID.lacerateEnabled,
    'Core abilities',
  ),
  {
    kind: 'toggle',
    id: ID.swipeEnabled,
    group: 'Fillers',
    label: 'Swipe',
    help: 'Spend spare rage on Swipe: 83 damage, 30% more with Feral Instinct 3/3 and 10% with Savage Fury, for 15 rage with Ferocity 5/5 (13 with Idol of Brutality), at 1.75 threat per damage. It hits up to 3 targets; the sim has one.',
    default: false,
  },
  rageOption(ID.swipeMinRage, 'Swipe from', 'Use it only at or above this much rage, so Maul keeps the rage it needs.', 60, ID.swipeEnabled, 'Fillers'),
  {
    kind: 'toggle',
    id: ID.ffFiller,
    group: 'Fillers',
    label: 'Faerie Fire as a filler',
    help: 'Use Faerie Fire whenever it’s ready and nothing else is: it’s free, and makes 108 threat. While this is on, the Buffs tab’s Faerie Fire adds nothing more.',
    default: true,
    maintainsBuff: 'faerieFire',
  },
  {
    kind: 'toggle',
    id: ID.potion,
    group: 'Consumables',
    label: 'Mighty Rage Potion',
    help: 'Drink it once, the first time your rage is low enough: 45–75 rage and +60 Strength for 20 s.',
    default: true,
    requiresBuff: RAGE_POTION,
  },
  rageOption(
    ID.potionMaxRage,
    'Mighty Rage Potion up to',
    `Drink it only at or below this much rage, so none of its rage is lost at the cap. ${BEAR_MAX_RAGE - 75} is the 100 cap minus 75.`,
    BEAR_MAX_RAGE - 75,
    ID.potion,
    'Consumables',
  ),
  {
    kind: 'toggle',
    id: ID.juju,
    group: 'Consumables',
    label: 'Juju Flurry',
    help: 'Use it on cooldown from the pull: +3% attack speed for 20 s, every minute.',
    default: true,
    requiresBuff: JUJU_FLURRY,
  },
]

/**
 * An ability with Idol of Brutality equipped: 2 rage off Maul, Swipe and Primal Bite (abilities.ts
 * `IDOL_OF_BRUTALITY`; druid.md §4.1), before Ferocity's, which the plan takes off after.
 */
export const withIdolOfBrutality = (def: AbilityDef, equipped: ReadonlySet<number>): AbilityDef =>
  equipped.has(IDOL_OF_BRUTALITY) && IDOL_OF_BRUTALITY_ABILITIES.has(def.id) ? { ...def, costTenths: def.costTenths - IDOL_OF_BRUTALITY_RAGE_TENTHS } : def

/** The Buffs tab's exclusive group of attack-power debuffs on the boss (buffs doc §4.2), where a Demoralizing Shout takes the roar's place. */
const AP_REDUCTION = 'ap-reduction'
/** A Demoralizing Shout in the Buffs tab fills the roar's group: only one applies in game, so the roar isn't used (druid.md §6.3 row 5). */
const roarDisplaced = (setup: { buffGroups?: ReadonlySet<string> }) => setup.buffGroups?.has(AP_REDUCTION) === true
/** Lacerate waits for no other bleeds (`onlyWithoutOtherBleeds`), and the raid's warriors keep the boss bleeding (druid.md §6.3 row 8). */
const lacerateWaits = (alone: boolean, setup: { othersBleed: boolean }) => alone && setup.othersBleed

/**
 * The bear's settings that do nothing in this setup, with why (docs/ux.md "Rotation"), from the same
 * rules as `bearRotation`: its roar while a Demoralizing Shout in the Buffs tab takes its place, and
 * Lacerate while "only when nothing else bleeds" meets a raid whose warriors keep the boss bleeding,
 * as the cat's Rake and Rip say it.
 */
export function bearUnusedSettings(values: Record<string, RotationValue>, setup: { othersBleed: boolean; buffGroups?: ReadonlySet<string> }): Record<string, string> {
  const v = reader(BEAR_OPTIONS, values)
  const out: Record<string, string> = {}
  const label = (id: string) => BEAR_OPTIONS.find((o) => o.id === id)!.label
  // Only while the rotation keeps its roar up: the roar is then the bear's own, left out of the Buffs
  // tab's fillers, so what fills its group is a Demoralizing Shout. With the roar off (Max TPS), the
  // Buffs tab's roar may fill it, another druid's (BF1).
  if (v.on(ID.roarEnabled) && roarDisplaced(setup)) out[ID.roarEnabled] = 'Not used: the Demoralizing Shout in Buffs is on the boss instead, so you don’t cast the roar.'
  if (lacerateWaits(v.on(ID.lacerateAlone), setup)) {
    out[ID.lacerateEnabled] = `Not used in this raid: its warriors keep the boss bleeding. Turn off “${label(ID.lacerateAlone)}” to use it anyway.`
  }
  return out
}

/** Buff catalogue ids the bear keeps up itself with these settings: its Faerie Fire and Demoralizing Roar (druid.md §6.3). */
export function bearMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  const v = reader(BEAR_OPTIONS, values)
  return [...(v.on(ID.ffEnabled) || v.on(ID.ffFiller) ? ['faerieFire'] : []), ...(v.on(ID.roarEnabled) ? ['demoralizingRoar'] : [])]
}

/** Ability a's aura, or its bleed on the target, is down, or has at most `ms` left before the fight's end (the upkeep condition). */
const refresh = (a: number, ms: number): RotationCondition => ({ code: COND.abilityAuraRefresh, a, b: ms })
/** Ability a's bleed has fewer than `n` stacks on the target. */
const stacksBelow = (a: number, n: number): RotationCondition => ({ code: COND.abilityAuraStacksBelow, a, b: n })

/**
 * The bear's rotation as a priority list (decision D31; druid.md §6.3 "The priority list"): §6.3's
 * rows in its order, each with its switch and its own settings. Enrage before the pull is its own
 * row, pinned first. The duties, Demoralizing Roar and Faerie Fire, aren't pinned: the presets put
 * them first on the global cooldown (D26's rule), and their refresh keeps the duty rule wherever you
 * move them. The priority is the preset picker, and the consumables are spec-wide, above the list;
 * they take their turn with the on-use items (row 3), wherever that row sits.
 *
 * Presets (D28): Balanced is the default; Defensive and Max TPS set the priority, which moves the
 * roar's default and, for Max TPS, Maul's threshold. None moves a row: every preset keeps the
 * duties first.
 */
export const BEAR_APL: AplDefinition = {
  rows: [
    {
      id: 'prepull',
      label: 'Before the pull',
      icon: 'ability_druid_enrage',
      optionIds: [ID.enragePrepull],
      summary: [{ option: ID.enragePrepull, text: 'Enrage' }],
      help: 'What you do before the pull. It always comes first.',
      pinned: true,
    },
    { id: 'berserk', label: 'Berserk', icon: BERSERK.icon, enabledId: ID.berserk, optionIds: [], summary: [{ text: 'on cooldown' }] },
    {
      id: 'enrage',
      label: 'Enrage',
      icon: 'ability_druid_enrage',
      enabledId: ID.enrageInCombat,
      optionIds: [ID.enrageMaxRage],
      summary: [{ option: ID.enrageMaxRage, text: 'up to {}' }],
    },
    { id: 'racial', label: 'Racial cooldown', icon: ELUNES_LIGHT.icon, enabledId: ID.racial, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'onUseItems', label: 'On-use items', icon: 'inv_jewelry_talisman_01', enabledId: ID.items, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'maul', label: 'Maul', icon: MAUL.icon, enabledId: ID.maulEnabled, optionIds: [ID.maulMinRage], summary: [{ option: ID.maulMinRage, text: 'from {}' }] },
    {
      id: 'demoRoar',
      label: 'Demoralizing Roar',
      icon: 'ability_druid_demoralizingroar',
      enabledId: ID.roarEnabled,
      optionIds: [ID.roarRefresh],
      summary: [{ option: ID.roarRefresh, text: 'again with {}' }],
    },
    {
      id: 'faerieFire',
      label: 'Faerie Fire',
      icon: FAERIE_FIRE_BEAR.icon,
      enabledId: ID.ffEnabled,
      optionIds: [ID.ffRefresh],
      summary: [{ option: ID.ffRefresh, text: 'again with {}' }],
    },
    { id: 'mangle', label: 'Primal Bite', icon: PRIMAL_BITE.icon, enabledId: ID.mangleEnabled, optionIds: [], summary: [{ text: 'on cooldown' }] },
    {
      id: 'lacerate',
      label: 'Lacerate',
      icon: LACERATE.icon,
      enabledId: ID.lacerateEnabled,
      optionIds: [ID.lacerateRefresh, ID.lacerateAlone],
      summary: [
        { text: `${LACERATE_MAX_STACKS} stacks` },
        { option: ID.lacerateRefresh, text: 'again with {}' },
        { option: ID.lacerateAlone, text: 'only when nothing else bleeds' },
      ],
    },
    { id: 'swipe', label: 'Swipe', icon: SWIPE.icon, enabledId: ID.swipeEnabled, optionIds: [ID.swipeMinRage], summary: [{ option: ID.swipeMinRage, text: 'from {}' }] },
    {
      id: 'faerieFireFiller',
      label: 'Faerie Fire filler',
      icon: FAERIE_FIRE_BEAR.icon,
      enabledId: ID.ffFiller,
      optionIds: [],
      summary: [{ text: 'whenever it’s ready' }],
    },
  ],
  specWide: [ID.potion, ID.potionMaxRage, ID.juju],
  // Their numbers are measured in the default setup against Defensive (druid.md §6.3 "Balanced",
  // "Max TPS"; seed 28401, 200,000 paired fights): Defensive 1,081.8 TPS, 532.4 DPS and 629.1
  // damage taken a second; Balanced +3.12%, +2.83% and +0.71%; Max TPS +3.31%, +2.62% and +0.69%.
  presets: [
    {
      id: 'defensive',
      label: 'Defensive',
      summary: 'Demoralizing Roar and Faerie Fire kept on the boss: the least damage taken. Tuned on threat.',
      help: 'Keeps both tank duties first, Demoralizing Roar and Faerie Fire on the boss, and is tuned on threat. The roar’s −204 attack power means 0.7% less damage taken than Balanced, for 3% less TPS and 3% less DPS in the default setup. Pick it for progression fights.',
      values: { [ID.priority]: BEAR_PRIORITY.duties },
    },
    {
      id: DEFAULT_APL_PRESET,
      label: 'Balanced',
      summary: 'Faerie Fire kept, Demoralizing Roar dropped: +3.1% TPS, +2.8% DPS and 0.7% more damage taken than Defensive.',
      help: 'The default, as most tanks play fights short of progression. Drops Demoralizing Roar and keeps Faerie Fire, the raid’s armor debuff: 3.1% more TPS and 2.8% more DPS than Defensive in the default setup, for 0.7% more damage taken. The Buffs tab’s Demoralizing Roar stays off unless you turn it on there for another druid’s.',
      values: {},
    },
    {
      id: 'maxTps',
      label: 'Max TPS',
      summary: 'Balanced, but Mauls from 14 rage: +0.2% TPS, −0.2% DPS, the same damage taken (0.7% more than Defensive).',
      help: 'Tuned on threat alone: drops Demoralizing Roar, keeps Faerie Fire, whose armor makes your attacks, and so your threat, bigger, and Mauls from 14 rage rather than Balanced’s 20. Against Balanced in the default setup that’s 0.2% more TPS for 0.2% less DPS, and the same damage taken; against Defensive, 3.3% more TPS, 2.6% more DPS and 0.7% more damage taken. Pick it when threat is all that matters and another tank or the raid covers your survival. The Buffs tab’s Demoralizing Roar stays off unless you turn it on there for another druid’s.',
      values: { [ID.priority]: BEAR_PRIORITY.maxTps },
    },
  ],
}

/**
 * The bear priority list from the settings (druid.md §6.3), its rows in `order` (BEAR_APL; absent:
 * the default order). `talents` gates Primal Bite and Berserk and resolves costs, Savage Fury, Feral
 * Instinct, Genesis, Predatory Instincts and Rend and Tear; `context` gives the race (Elune's Light),
 * the equipped on-use items, Wolfshead Helm and Idol of Brutality, the selected consumables and the
 * profile (Demoralizing Roar's attack power). `_auraIndex` is unused: no bear line reads a plan aura
 * by id. No row reads another's ability, so a row's lines are the same wherever it sits.
 */
export function bearRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  _auraIndex: (id: string) => number,
  context: Partial<ClassRotationContext> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx: ClassRotationContext = { ...NO_CONTEXT, equipped: new Set(), othersBleed: false, front: true, ...context }
  const v = reader(BEAR_OPTIONS, values, talents)
  const b = new DruidRotationBuilder(talents)
  // Idol of Brutality: 2 rage off Maul, Swipe and Primal Bite (druid.md §4.1).
  const maul = withIdolOfBrutality(MAUL, ctx.equipped)
  const swipe = withIdolOfBrutality(SWIPE, ctx.equipped)
  const mangle = withIdolOfBrutality(PRIMAL_BITE, ctx.equipped)
  const enrageDef = enrage(ctx.equipped.has(WOLFSHEAD_HELM))
  const consumable = (id: string): OnUseSpec | undefined => ctx.consumables.find((c) => c.id === id)

  compileAplRows(BEAR_APL, order, {
    // --- Off the GCD (§6.3 rows 1–4) ----------------------------------------------------------------
    // Row 1: Berserk on cooldown, with the talent.
    berserk: () => {
      if (talents.has('Berserk') && v.on(ID.berserk)) b.add(BERSERK, [])
    },
    // Row 2: Enrage in combat on cooldown, at rage ≤ maxRage (before the pull: the pinned row, below).
    enrage: () => {
      if (v.on(ID.enrageInCombat)) b.add(enrageDef, [maxRage(v.num(ID.enrageMaxRage))])
    },
    // Row 3: the racial cooldown (Elune's Light, §7.2) and on-use items on cooldown; then the
    // consumables selected in Buffs, spec-wide settings that take their turn here: the potion once,
    // the first time rage ≤ maxRage, and Juju Flurry on cooldown.
    racial: () => {
      if (ctx.race === 'alliance-night-elf' && v.on(ID.racial)) b.add(ELUNES_LIGHT, [])
    },
    onUseItems: () => {
      if (v.on(ID.items)) for (const item of ctx.items) b.add(onUseCast(item), [])
      const potion = consumable(RAGE_POTION)
      if (potion && v.on(ID.potion)) b.add({ ...onUseCast(potion), usesPerFight: 1 }, [maxRage(v.num(ID.potionMaxRage))])
      const juju = consumable(JUJU_FLURRY)
      if (juju && v.on(ID.juju)) b.add(onUseCast(juju), [])
    },
    // Row 4: the Maul queue at rage ≥ minRage; rage is checked and spent when the swing lands (§8).
    maul: () => {
      if (v.on(ID.maulEnabled)) b.add(maul, [minRage(toTenths(v.num(ID.maulMinRage)))])
    },
    // --- On the GCD ---------------------------------------------------------------------------------
    // Rows 5 and 6: the duties, first on the GCD in every preset (D26's rule): Demoralizing Roar
    // (Defensive only) and Faerie Fire, when down or with ≤ refreshBelowSec left (the rule's 1.5 s and
    // 6 s by default). A Demoralizing Shout in the Buffs tab takes the roar's place on the boss, so
    // then it isn't used.
    demoRoar: () => {
      if (!v.on(ID.roarEnabled) || roarDisplaced(ctx)) return
      const def = demoralizingRoar(ctx.profile)
      b.add(def, [refresh(b.ability(def), seconds(v, ID.roarRefresh))])
    },
    faerieFire: () => {
      if (v.on(ID.ffEnabled)) b.add(FAERIE_FIRE_BEAR, [refresh(b.ability(FAERIE_FIRE_BEAR), seconds(v, ID.ffRefresh))])
    },
    // Row 7: Primal Bite (the talent; Mangle until 1.60.1.70009, docs/data/talents.md#tree-versions)
    // whenever it's ready. The row keeps the id `mangle` that saved orders store.
    mangle: () => {
      if (talents.has('Primal Bite') && v.on(ID.mangleEnabled)) b.add(mangle, [])
    },
    // Row 8: Lacerate while it has fewer than 5 stacks, or they have ≤ refreshBelowSec left and would
    // run out before the fight does; with onlyWithoutOtherBleeds (off by default), not at all while
    // others keep the boss bleeding (a raid with warriors: Rend and Tear applies without it).
    lacerate: () => {
      if (!v.on(ID.lacerateEnabled) || lacerateWaits(v.on(ID.lacerateAlone), ctx)) return
      // Its "high amount of threat" is the profile's (bear-abilities.ts `LACERATE_THREAT`).
      const def = lacerateFor(ctx.profile)
      const lacerate = b.ability(def)
      b.add(def, [stacksBelow(lacerate, LACERATE_MAX_STACKS)])
      b.add(def, [refresh(lacerate, seconds(v, ID.lacerateRefresh))])
    },
    // Row 9: Swipe with spare rage (the sim has one target: §6.3's target count never applies).
    swipe: () => {
      if (v.on(ID.swipeEnabled)) b.add(swipe, [minRage(toTenths(v.num(ID.swipeMinRage)))])
    },
    // Row 10: Faerie Fire whenever it's ready, as a free filler.
    faerieFireFiller: () => {
      if (v.on(ID.ffFiller)) b.add(FAERIE_FIRE_BEAR, [])
    },
  })

  // Row 0, before the pull, built after the list so the abilities keep their indexes: Enrage 1.5 s
  // early, so its rage at once and its first tick are there at the pull.
  if (v.on(ID.enragePrepull)) b.prepull.casts.push({ ability: b.ability(enrageDef), atMs: PREPULL_ENRAGE_MS })

  return b.result([...ctx.items.map((i) => i.id), ...ctx.consumables.filter((c) => c.id === RAGE_POTION || c.id === JUJU_FLURRY).map((c) => c.id)])
}
