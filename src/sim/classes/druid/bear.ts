// The Feral bear's priority list and its settings (docs/classes/druid.md §6.3, §7.4).
//
// A tank's default keeps its duties first (decision D26 as amended): Demoralizing Roar and Faerie
// Fire on the boss, timed by the duty rule, which is fixed and never tuned. Around them, the threat
// abilities' settings are the best found on TPS, with DPS beside it (decision D23; §6.3 "Tuning the
// defaults"). Each duty is a setting of its own, so the Max TPS priority drops the roar by moving
// its default, and keeps Faerie Fire, whose armor makes the bear's threat (§6.3 "Max TPS").
//
// Off the GCD: Berserk, Enrage (before the pull, and in combat on cooldown), the racial cooldown
// (Night Elf), on-use items, the Mighty Rage Potion and Juju Flurry when they're selected in Buffs,
// and the Maul queue. On the GCD: Demoralizing Roar's and Faerie Fire's upkeep, Mangle, Lacerate's
// stacks, Swipe with spare rage, and Faerie Fire as a filler. The sim has one target, so Swipe's
// and Berserk's Mangle's extra targets don't count. Setting ids are `druid.bear.<ability>.<param>`;
// rage thresholds are absolute rage points.
import { toTenths } from '../../core/formulas'
import type { OnUseSpec } from '../../effects/types'
import { COND, type RotationCondition } from '../../plan/types'
import type { RotationDefaultWhen, RotationGroup, RotationOption, RotationValue } from '../../types'
import type { ClassRotationContext } from '../rotation'
import { ELUNES_LIGHT } from '../warrior/abilities'
import { type ClassRotation, JUJU_FLURRY, maxRage, minRage, NO_CONTEXT, RAGE_POTION, reader, seconds } from '../warrior/shared'
import { WOLFSHEAD_HELM } from './abilities'
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
  MANGLE,
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
const rageOption = (id: string, label: string, help: string, def: number, dependsOn: string, group: RotationGroup): RotationOption => ({
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
 * The priority choice's values (druid.md §6.3 "Max TPS", decision D26): the default keeps the tank's
 * duties, Demoralizing Roar and Faerie Fire; Max TPS drops the roar for threat. It keeps Faerie Fire,
 * whose armor raises the bear's damage and so its threat: dropping its upkeep costs 1% of TPS.
 */
export const BEAR_PRIORITY = { duties: 'duties', maxTps: 'maxTps' } as const
const MAX_TPS = { option: ID.priority, is: BEAR_PRIORITY.maxTps } as const
/** Max TPS's Lacerate refresh (§6.3 "Max TPS"): 4.5 s left, where the duties' default is 6 s. */
export const MAX_TPS_LACERATE_REFRESH_SEC = 4.5

/** Enrage's rage, 10 at once and 20 over 10 s: 30 (druid.md §4.5). */
const ENRAGE_RAGE = (ENRAGE_RAGE_TENTHS + ENRAGE_TICKS * ENRAGE_TICK_TENTHS) / 10

/**
 * Defaults from druid.md §6.3's table, in priority order. They keep the tank's duties by D26's fixed
 * rule, and the rest is the best rotation found around them for the default setup (D23; §6.3
 * "Tuning the defaults", measured on TPS and DPS with scripts/tune/rotation.mjs).
 */
export const BEAR_OPTIONS: RotationOption[] = [
  {
    kind: 'choice',
    id: ID.priority,
    label: 'Priority',
    help: 'Tank duties first keeps Demoralizing Roar and Faerie Fire on the boss, so you take less damage. Max TPS drops the roar for threat: about 4% more TPS and 3% more DPS, for 0.5% more damage taken in the default setup. It keeps Faerie Fire, whose armor makes your attacks, and so your threat, bigger. Pick it when another tank or the raid covers your survival. The Buffs tab’s Demoralizing Roar stays off unless you turn it on there for another druid’s.',
    choices: [
      { value: BEAR_PRIORITY.duties, label: 'Tank duties first' },
      { value: BEAR_PRIORITY.maxTps, label: 'Max TPS' },
    ],
    default: BEAR_PRIORITY.duties,
  },
  {
    kind: 'toggle',
    id: ID.berserk,
    group: 'Cooldowns and buffs',
    label: 'Berserk',
    help: 'Use Berserk on cooldown: for 15 s Mangle has no cooldown, so it can fill every global cooldown your rage pays for. Needs the Berserk talent.',
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
    help: 'Use Weakness Analyzer and Earthstrike on cooldown if you wear them. Other on-use items, such as armor and health trinkets, aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.ffEnabled,
    group: 'Cooldowns and buffs',
    label: 'Faerie Fire',
    help: 'Keep your Faerie Fire on the boss: −505 armor for 40 s, free in Dire Bear Form with a 6 s cooldown. It can miss, or the boss can resist it. While this is on, the Buffs tab’s Faerie Fire adds nothing more, since it’s the same debuff. It stays on with Max TPS: its armor makes your attacks, and so your threat, bigger.',
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
    help: 'Keep Demoralizing Roar on the boss: its attack power is 204 lower (138 in Classic Era rules), so it hits you for less. It costs 10 rage and can miss. While this is on, the Buffs tab’s Demoralizing Roar adds nothing more, and a Demoralizing Shout there takes its place. Off by default with Max TPS.',
    default: true,
    defaultWhen: [{ ...MAX_TPS, default: false }],
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
    help: 'Queue Maul on your next swing: your Dire Bear Form attack’s damage plus 128, 10% more with Savage Fury, for 10 rage with Ferocity 5/5, at 1.75 threat per damage. The swing it replaces gives no rage.',
    default: true,
  },
  rageOption(
    ID.maulMinRage,
    'Maul from',
    'Queue it at or above this much rage. It costs 10 with Ferocity 5/5; from 20, rage stays for Mangle and Lacerate. In fights under a minute, 10 makes more threat.',
    20,
    ID.maulEnabled,
    'Core abilities',
  ),
  {
    kind: 'toggle',
    id: ID.mangleEnabled,
    group: 'Core abilities',
    label: 'Mangle',
    help: 'Use Mangle whenever it’s ready: your Dire Bear Form attack’s damage plus 77, every 6 s, for 15 rage with Ferocity 5/5. Needs the Mangle talent.',
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
    help: 'Leave Lacerate out while warriors in the raid (the Buffs tab) keep their Deep Wounds on the boss, which turns on Rend and Tear without it. Its rage then goes to Maul: about 4% less threat and 7% less damage in the default setup, with Lacerate’s “high amount of threat” at 261 an application (untested). Off by default.',
    default: false,
    dependsOn: ID.lacerateEnabled,
  },
  refreshOption(
    ID.lacerateRefresh,
    'Lacerate again with',
    `At 5 stacks, refresh it when this much of its bleed is left; the tick under way is lost. At 0, once it has run out, when it starts again from 1 stack. With Max TPS it’s ${MAX_TPS_LACERATE_REFRESH_SEC} s by default, for a little more threat and a little less damage.`,
    6,
    15,
    ID.lacerateEnabled,
    'Core abilities',
    [{ ...MAX_TPS, default: MAX_TPS_LACERATE_REFRESH_SEC }],
  ),
  {
    kind: 'toggle',
    id: ID.swipeEnabled,
    group: 'Fillers',
    label: 'Swipe',
    help: 'Spend spare rage on Swipe: 83 damage, 30% more with Feral Instinct 3/3 and 10% with Savage Fury, for 15 rage with Ferocity 5/5, at 1.75 threat per damage. It hits up to 3 targets; the sim has one.',
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
 * The bear priority list from the settings (druid.md §6.3). `talents` gates Mangle and Berserk and
 * resolves costs, Savage Fury, Feral Instinct, Genesis, Predatory Instincts and Rend and Tear;
 * `context` gives the race (Elune's Light), the equipped on-use items and Wolfshead Helm, the
 * selected consumables and the profile (Demoralizing Roar's attack power). `_auraIndex` is unused:
 * no bear line reads a plan aura by id.
 */
export function bearRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  _auraIndex: (id: string) => number,
  context: Partial<ClassRotationContext> = {},
): ClassRotation {
  const ctx: ClassRotationContext = { ...NO_CONTEXT, equipped: new Set(), othersBleed: false, front: true, ...context }
  const v = reader(BEAR_OPTIONS, values, talents)
  const b = new DruidRotationBuilder(talents)

  // --- Off the GCD (§6.3 rows 1–3) ------------------------------------------------------------------
  // Row 1: Berserk on cooldown, with the talent.
  if (talents.has('Berserk') && v.on(ID.berserk)) b.add(BERSERK, [])
  // Row 2: Enrage before the pull (below), and in combat on cooldown, at rage ≤ maxRage.
  const enrageDef = enrage(ctx.equipped.has(WOLFSHEAD_HELM))
  if (v.on(ID.enrageInCombat)) b.add(enrageDef, [maxRage(v.num(ID.enrageMaxRage))])
  // The racial cooldown (Elune's Light, §7.2) and on-use items on cooldown.
  if (ctx.race === 'alliance-night-elf' && v.on(ID.racial)) b.add(ELUNES_LIGHT, [])
  if (v.on(ID.items)) for (const item of ctx.items) b.add(onUseCast(item), [])
  // Consumables selected in Buffs: the potion once, the first time rage ≤ maxRage; Juju Flurry on cooldown.
  const consumable = (id: string): OnUseSpec | undefined => ctx.consumables.find((c) => c.id === id)
  const potion = consumable(RAGE_POTION)
  if (potion && v.on(ID.potion)) b.add({ ...onUseCast(potion), usesPerFight: 1 }, [maxRage(v.num(ID.potionMaxRage))])
  const juju = consumable(JUJU_FLURRY)
  if (juju && v.on(ID.juju)) b.add(onUseCast(juju), [])
  // Row 3: the Maul queue at rage ≥ minRage; rage is checked and spent when the swing lands (§8).
  if (v.on(ID.maulEnabled)) b.add(MAUL, [minRage(toTenths(v.num(ID.maulMinRage)))])

  // --- On the GCD -----------------------------------------------------------------------------------
  // Row 4: the duties first, before any threat ability on the GCD (D26's rule): Demoralizing Roar and
  // Faerie Fire, when down or with ≤ refreshBelowSec left (the rule's 1.5 s and 6 s by default).
  // A Demoralizing Shout in the Buffs tab takes the roar's place on the boss, so then it isn't used.
  if (v.on(ID.roarEnabled) && !roarDisplaced(ctx)) {
    const def = demoralizingRoar(ctx.profile)
    b.add(def, [refresh(b.ability(def), seconds(v, ID.roarRefresh))])
  }
  if (v.on(ID.ffEnabled)) b.add(FAERIE_FIRE_BEAR, [refresh(b.ability(FAERIE_FIRE_BEAR), seconds(v, ID.ffRefresh))])
  // Row 5: Mangle (the talent) whenever it's ready.
  if (talents.has('Mangle') && v.on(ID.mangleEnabled)) b.add(MANGLE, [])
  // Row 6: Lacerate while it has fewer than 5 stacks, or they have ≤ refreshBelowSec left and would
  // run out before the fight does; with onlyWithoutOtherBleeds (off by default), not at all while
  // others keep the boss bleeding (a raid with warriors: Rend and Tear applies without it).
  if (v.on(ID.lacerateEnabled) && !lacerateWaits(v.on(ID.lacerateAlone), ctx)) {
    const lacerate = b.ability(LACERATE)
    b.add(LACERATE, [stacksBelow(lacerate, LACERATE_MAX_STACKS)])
    b.add(LACERATE, [refresh(lacerate, seconds(v, ID.lacerateRefresh))])
  }
  // Row 7: Swipe with spare rage (the sim has one target: §6.3's target count never applies).
  if (v.on(ID.swipeEnabled)) b.add(SWIPE, [minRage(toTenths(v.num(ID.swipeMinRage)))])
  // Row 8: Faerie Fire whenever it's ready, as a free filler.
  if (v.on(ID.ffFiller)) b.add(FAERIE_FIRE_BEAR, [])

  // Before the pull: Enrage 1.5 s early, so its rage at once and its first tick are there at the pull.
  if (v.on(ID.enragePrepull)) b.prepull.casts.push({ ability: b.ability(enrageDef), atMs: PREPULL_ENRAGE_MS })

  return b.result([...ctx.items.map((i) => i.id), ...ctx.consumables.filter((c) => c.id === RAGE_POTION || c.id === JUJU_FLURRY).map((c) => c.id)])
}
