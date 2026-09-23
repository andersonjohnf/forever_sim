// The Feral bear's priority list and its settings (docs/classes/druid.md §6.3, §7.4).
//
// A tank's default keeps its duties first (decision D26): Demoralizing Roar and Faerie Fire on the
// boss, and no Enrage in combat, whose armor loss is a survival cost. Within that, the settings are
// the best found on TPS (decision D23; §6.3 "Tuning the defaults"). Each duty is a setting of its
// own, so a rotation that drops them (Max TPS) is a matter of setting them.
//
// Off the GCD: Berserk, Enrage (before the pull; in combat only when set), the racial cooldown
// (Night Elf), on-use items, the Mighty Rage Potion and Juju Flurry when they're selected in Buffs,
// and the Maul queue. On the GCD: Demoralizing Roar's and Faerie Fire's upkeep, Mangle, Lacerate's
// stacks, Swipe with spare rage, and Faerie Fire as a filler. The sim has one target, so Swipe's
// and Berserk's Mangle's extra targets don't count. Setting ids are `druid.bear.<ability>.<param>`;
// rage thresholds are absolute rage points.
import { toTenths } from '../../core/formulas'
import type { OnUseSpec } from '../../effects/types'
import { COND, type RotationCondition } from '../../plan/types'
import type { RotationGroup, RotationOption, RotationValue } from '../../types'
import type { ClassRotationContext } from '../rotation'
import { ELUNES_LIGHT } from '../warrior/abilities'
import { type ClassRotation, JUJU_FLURRY, maxRage, minRage, NO_CONTEXT, RAGE_POTION, reader, seconds } from '../warrior/shared'
import { WOLFSHEAD_HELM } from './abilities'
import {
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

/** A debuff's refresh input, in seconds left. */
const refreshOption = (id: string, label: string, help: string, def: number, max: number, dependsOn: string, group: RotationGroup): RotationOption => ({
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
  dependsOn,
})

/** Enrage's rage, 10 at once and 20 over 10 s: 30 (druid.md §4.5). */
const ENRAGE_RAGE = (ENRAGE_RAGE_TENTHS + ENRAGE_TICKS * ENRAGE_TICK_TENTHS) / 10

/**
 * Defaults from druid.md §6.3's table, in priority order. They keep the tank's duties (D26) and are
 * the best rotation found for the default setup within them (D23; §6.3 "Tuning the defaults",
 * measured on TPS with scripts/tune/rotation.mjs).
 */
export const BEAR_OPTIONS: RotationOption[] = [
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
    help: `Use Enrage on cooldown in the fight too: ${ENRAGE_RAGE} rage over 10 s, 5 more at once with Wolfshead Helm. Off by default: for those 10 s your armor from items is 16% lower, so you take more damage.`,
    default: false,
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
    help: 'Use Weakness Analyzer on cooldown if you wear it. Other on-use items, such as armor and health trinkets, aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.ffEnabled,
    group: 'Cooldowns and buffs',
    label: 'Faerie Fire',
    help: 'Keep your Faerie Fire on the boss: −505 armor for 40 s, free in Dire Bear Form with a 6 s cooldown. It can miss. While this is on, the Buffs tab’s Faerie Fire adds nothing more, since it’s the same debuff.',
    default: true,
    maintainsBuff: 'faerieFire',
  },
  refreshOption(
    ID.ffRefresh,
    'Faerie Fire again with',
    'Refresh it when this much of it is left, unless it lasts to the end of the fight. At 0, once it has run out.',
    3,
    40,
    ID.ffEnabled,
    'Cooldowns and buffs',
  ),
  {
    kind: 'toggle',
    id: ID.roarEnabled,
    group: 'Cooldowns and buffs',
    label: 'Demoralizing Roar',
    help: 'Keep Demoralizing Roar on the boss: its attack power is 204 lower (138 in Classic Era rules), so it hits you for less. It costs 10 rage and can miss. While this is on, the Buffs tab’s Demoralizing Roar adds nothing more, and a Demoralizing Shout there takes its place.',
    default: true,
    maintainsBuff: 'demoralizingRoar',
  },
  refreshOption(
    ID.roarRefresh,
    'Demoralizing Roar again with',
    'Refresh it when this much of it is left, unless it lasts to the end of the fight. At 0, once it has run out.',
    3,
    30,
    ID.roarEnabled,
    'Cooldowns and buffs',
  ),
  {
    kind: 'toggle',
    id: ID.maulEnabled,
    group: 'Core abilities',
    label: 'Maul',
    help: 'Queue Maul on your next swing: your weapon damage plus 128, 10% more with Savage Fury, for 10 rage with Ferocity 5/5, at 1.75 threat per damage. The swing it replaces gives no rage.',
    default: true,
  },
  rageOption(ID.maulMinRage, 'Maul from', 'Queue it at or above this much rage. It costs 10 with Ferocity 5/5.', 10, ID.maulEnabled, 'Core abilities'),
  {
    kind: 'toggle',
    id: ID.mangleEnabled,
    group: 'Core abilities',
    label: 'Mangle',
    help: 'Use Mangle whenever it’s ready: your weapon damage plus 77, every 6 s, for 15 rage with Ferocity 5/5. Needs the Mangle talent.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.lacerateEnabled,
    group: 'Core abilities',
    label: 'Lacerate',
    help: `Build Lacerate to ${LACERATE_MAX_STACKS} stacks on the boss and keep them up: a bleed of 15 every 3 s per stack for 15 s, for 15 rage. Each one also hits for 10% of your weapon damage per stack already there, and restarts the bleed.`,
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.lacerateAlone,
    group: 'Core abilities',
    label: 'Lacerate only when nothing else bleeds',
    help: 'Leave Lacerate out while warriors in the raid (the Buffs tab) keep their Deep Wounds on the boss: Rend and Tear then applies without it, and Maul makes more threat for the rage.',
    default: true,
    dependsOn: ID.lacerateEnabled,
  },
  refreshOption(
    ID.lacerateRefresh,
    'Lacerate again with',
    'At 5 stacks, refresh it when this much of its bleed is left; the tick under way is lost. At 0, once it has run out, when it starts again from 1 stack.',
    6,
    15,
    ID.lacerateEnabled,
    'Core abilities',
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
  // Row 2: Enrage before the pull (below), and in combat when set, at rage ≤ maxRage.
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
  // Row 4: the duties first (D26): Demoralizing Roar and Faerie Fire, when down or with ≤ refreshBelowSec left.
  if (v.on(ID.roarEnabled)) {
    const def = demoralizingRoar(ctx.profile)
    b.add(def, [refresh(b.ability(def), seconds(v, ID.roarRefresh))])
  }
  if (v.on(ID.ffEnabled)) b.add(FAERIE_FIRE_BEAR, [refresh(b.ability(FAERIE_FIRE_BEAR), seconds(v, ID.ffRefresh))])
  // Row 5: Mangle (the talent) whenever it's ready.
  if (talents.has('Mangle') && v.on(ID.mangleEnabled)) b.add(MANGLE, [])
  // Row 6: Lacerate while it has fewer than 5 stacks, or they have ≤ refreshBelowSec left and would
  // run out before the fight does; with onlyWithoutOtherBleeds, not at all while others keep the
  // boss bleeding (a raid with warriors: Rend and Tear applies without it).
  if (v.on(ID.lacerateEnabled) && !(v.on(ID.lacerateAlone) && ctx.othersBleed)) {
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
