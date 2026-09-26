// The Fury priority list and its settings (docs/classes/warrior.md §5.1, §5.2).
//
// This covers the pre-pull (row 0), Battle Shout (row 1), the cooldowns (rows 2–5: Death Wish,
// the racial and on-use trinkets, Recklessness, Bloodrage), the execute phase (rows 6 and 7),
// Bloodthirst, Whirlwind, the Overpower stance dance, the Rend stance dance (row 10b, since W4),
// Heroic Strike and Hamstring (rows 8–12), Berserker Rage (row 13), Slam (row 15), the Mighty Rage Potion (row 16) and Juju Flurry (row 17).
// Rows 12 and 15 are off by default; Sunder Armor (row 14) isn't simulated. The rows are a priority
// list you reorder (FURY_APL, decision D31), each with its own settings. Setting ids are
// `warrior.fury.<ability>.<param>` and every rage threshold is in absolute rage points (§5.1).
// Abilities are resolved with the build's talents (modifiers.ts) before their costs feed any
// condition.
import { toTenths } from '../../core/formulas'
import { COND, type RotationCondition, STANCE } from '../../plan/types'
import type { AplDefinition, RotationOption, RotationValue } from '../../types'
import { compileAplRows } from '../apl'
import {
  BERSERKER_RAGE,
  BLOODRAGE,
  BLOODTHIRST,
  DEATH_WISH,
  EXECUTE,
  executeBreakEvenAp,
  HAMSTRING,
  HEROIC_STRIKE,
  OVERPOWER,
  overpowerWindowProcs,
  recklessness,
  rend,
  REND,
  SLAM,
  WHIRLWIND,
} from './abilities'
import type { TalentRanks } from './modifiers'
import {
  battleShoutLine,
  battleShoutOptions,
  bit,
  bloodrageLine,
  bloodrageOptions,
  type ClassRotation,
  consumableLines,
  consumableOptions,
  cooldownOptions,
  deathWishLines,
  deathWishOptions,
  gcdSafe,
  heroicStrikeLine,
  heroicStrikeOptions,
  IN_EXECUTE,
  maxRage,
  NO_CONTEXT,
  NOT_IN_EXECUTE,
  onUseIds,
  potionFallbackMaxRage,
  prepullCasts,
  prepullOptions,
  racialLines,
  rageOption,
  reader,
  recklessnessLine,
  recklessnessOptions,
  RotationBuilder,
  type RotationContext,
  seconds,
  sharedIds,
  trinketLines,
  WARRIOR_MAX_RAGE,
} from './shared'

const ID = {
  ...sharedIds('fury'),
  dwBeforeExecute: 'warrior.fury.deathWish.beforeExecuteSec',
  reckBeforeExecute: 'warrior.fury.recklessness.beforeExecuteSec',
  bzEnabled: 'warrior.fury.berserkerRage.enabled',
  bzMaxRage: 'warrior.fury.berserkerRage.maxRage',
  exEnabled: 'warrior.fury.execute.enabled',
  exMinExtraRage: 'warrior.fury.execute.minExtraRage',
  exBtEnabled: 'warrior.fury.execute.bloodthirst',
  exBtOverAp: 'warrior.fury.execute.btOverExecuteAp',
  exWhirlwind: 'warrior.fury.execute.whirlwindInExecute',
  exHeroicStrike: 'warrior.fury.execute.heroicStrikeInExecute',
  btEnabled: 'warrior.fury.bloodthirst.enabled',
  wwEnabled: 'warrior.fury.whirlwind.enabled',
  wwReserve: 'warrior.fury.whirlwind.reserve',
  wwBtCdMin: 'warrior.fury.whirlwind.btCdMinSec',
  rendEnabled: 'warrior.fury.rend.enabled',
  rendRefresh: 'warrior.fury.rend.refreshBelowSec',
  rendMaxRage: 'warrior.fury.rend.maxRage',
  opEnabled: 'warrior.fury.overpower.enabled',
  opMaxRage: 'warrior.fury.overpower.maxRage',
  hamEnabled: 'warrior.fury.hamstring.enabled',
  hamMinRage: 'warrior.fury.hamstring.minRage',
  hamFlurryDown: 'warrior.fury.hamstring.onlyWhenFlurryDown',
  slamEnabled: 'warrior.fury.slam.enabled',
}

/**
 * Setting ids that were renamed, old → new; normalizeConfig carries saved values over. The
 * racial's sync with Death Wish now covers on-use trinkets too (M2.2c).
 */
export const FURY_RENAMED_OPTIONS: Readonly<Record<string, string>> = {
  'warrior.fury.racial.syncWithDeathWish': ID.cdSync,
}

/** Row 0's times, shared with Arms (shared.ts). */
export { PREPULL_BLOODRAGE_MS, PREPULL_SHOUT_MS } from './shared'

/**
 * Bloodthirst over Execute from this AP: W11's break-even at the default build's Execute cost, 10
 * with its Improved Execute 2/2 (warrior.md §6.1), 2434. A static default: the option framework has
 * no per-build defaults, so a build without Improved Execute should set its own (2220 at cost 15;
 * warrior.md §5.2).
 */
const BT_OVER_EXECUTE_AP = Math.round(executeBreakEvenAp(EXECUTE.costTenths / 10 - 5))
/** The break-even without Improved Execute, which the setting's help names. */
const BT_OVER_EXECUTE_AP_UNTALENTED = Math.round(executeBreakEvenAp(EXECUTE.costTenths / 10))

/**
 * In the execute phase, the potion's last chance: if it hasn't been drunk by the phase's last 2 s,
 * it's drunk then at up to the build's cap minus 75, so a short phase still gets it (§5.2 notes).
 */
const POTION_LAST_CHANCE_MS = 2000

/**
 * Defaults from warrior.md §5.2's table (rows 0–13 and 15–17), in its priority order. They're the
 * best rotation found for the default setup (decision D23; §5.2 "Tuning the defaults", measured with
 * scripts/tune/rotation.mjs).
 */
export const FURY_OPTIONS: RotationOption[] = [
  ...prepullOptions(
    ID,
    'Open with Charge for 15 rage (+3 per Improved Charge rank). The swap to Berserker Stance then keeps at most 10 + 3 per Improved Tactical Mastery rank.',
  ),
  ...battleShoutOptions(ID),
  ...deathWishOptions(
    ID,
    { requires: { talent: 'Death Wish' } },
    {
      label: 'Save the last Death Wish for the execute phase or the end',
      help: 'When no later Death Wish would fit in the fight, hold the last one for the execute phase, or until 30 s are left. Earlier ones go on cooldown.',
    },
    {
      kind: 'number',
      id: ID.dwBeforeExecute,
      group: 'Cooldowns and buffs',
      label: 'Last Death Wish before the execute phase',
      help: 'Use the last one this long before the execute phase starts, or once 30 s are left if that comes first. Needs Execute on, and an execute phase under Fight.',
      unit: 's',
      min: 0,
      max: 60,
      step: 0.5,
      default: 3,
      dependsOn: ID.dwAlign,
      alsoDependsOn: ID.exEnabled,
    },
  ),
  ...cooldownOptions(ID),
  ...recklessnessOptions(
    ID,
    'Use Recklessness once, for +100% crit chance for 15 s: just before the execute phase, or near the end without one.',
    16,
    {
      kind: 'number',
      id: ID.reckBeforeExecute,
      group: 'Cooldowns and buffs',
      label: 'Recklessness before the execute phase',
      help: 'Use it this long before the execute phase starts, so its crits land on the first Executes. Needs Execute on, and an execute phase under Fight.',
      unit: 's',
      min: 0,
      max: 60,
      step: 0.5,
      default: 1.5,
      dependsOn: ID.reckEnabled,
      alsoDependsOn: ID.exEnabled,
    },
  ),
  ...bloodrageOptions(ID),
  {
    kind: 'toggle',
    id: ID.exEnabled,
    group: 'Execute phase',
    label: 'Execute',
    help: 'In the execute phase, use Execute on every global cooldown in place of Bloodthirst, Whirlwind and Hamstring. Needs an execute phase under Fight.',
    default: true,
    needsExecutePhase: true,
  },
  rageOption(
    ID.exMinExtraRage,
    'Execute: wait for extra rage',
    'Use Execute only with at least this much rage on top of its cost. Each extra rage adds 15 damage.',
    0,
    ID.exEnabled,
    'Execute phase',
  ),
  {
    kind: 'toggle',
    id: ID.exBtEnabled,
    group: 'Execute phase',
    label: 'Bloodthirst in the execute phase',
    help: 'In the execute phase, keep using Bloodthirst at high attack power (“Bloodthirst over Execute from”). Needs Bloodthirst and Execute on, and an execute phase under Fight.',
    default: true,
    requires: { talent: 'Bloodthirst' },
    dependsOn: ID.exEnabled,
    // With Bloodthirst off it does nothing (btExec in furyRotation), so the tab dims it.
    alsoDependsOn: ID.btEnabled,
  },
  {
    kind: 'number',
    id: ID.exBtOverAp,
    group: 'Execute phase',
    label: 'Bloodthirst over Execute from',
    // Its field groups thousands ("2,220 AP"), so the help writes them the same way.
    help: `In the execute phase, keep using Bloodthirst at or above this attack power. ${BT_OVER_EXECUTE_AP.toLocaleString('en-US')} is the break-even at Execute’s 10 rage cost with Improved Execute 2/2, as the default talents have; use ${BT_OVER_EXECUTE_AP_UNTALENTED.toLocaleString('en-US')} without Improved Execute.`,
    unit: 'AP',
    min: 0,
    max: 5000,
    step: 1,
    default: BT_OVER_EXECUTE_AP,
    dependsOn: ID.exBtEnabled,
  },
  {
    kind: 'toggle',
    id: ID.exWhirlwind,
    group: 'Execute phase',
    label: 'Whirlwind in the execute phase',
    help: 'Keep Whirlwind in the execute phase. It gets a global cooldown only while Execute waits for extra rage.',
    default: false,
    dependsOn: ID.exEnabled,
  },
  {
    kind: 'toggle',
    id: ID.exHeroicStrike,
    group: 'Execute phase',
    label: 'Heroic Strike in the execute phase',
    help: 'Keep queueing Heroic Strike in the execute phase, from the same rage as outside it (“Heroic Strike from”, and its cancel). Off, a queued one is cancelled when the phase starts.',
    default: true,
    dependsOn: ID.exEnabled,
  },
  {
    kind: 'toggle',
    id: ID.btEnabled,
    group: 'Core abilities',
    label: 'Bloodthirst',
    help: 'Use Bloodthirst whenever it’s ready. Needs the Bloodthirst talent.',
    default: true,
    requires: { talent: 'Bloodthirst' },
  },
  {
    kind: 'toggle',
    id: ID.wwEnabled,
    group: 'Core abilities',
    label: 'Whirlwind',
    help: 'Use Whirlwind whenever it’s ready and Bloodthirst isn’t about to be.',
    default: true,
  },
  rageOption(ID.wwReserve, 'Whirlwind rage reserve', 'Rage to keep on top of Whirlwind’s cost.', 0, ID.wwEnabled, 'Core abilities'),
  {
    kind: 'number',
    id: ID.wwBtCdMin,
    group: 'Core abilities',
    label: 'Whirlwind: Bloodthirst cooldown left',
    help: 'Use Whirlwind only while Bloodthirst has at least this long left to wait.',
    unit: 's',
    min: 0,
    max: 6,
    step: 0.1,
    default: 0.5,
    dependsOn: ID.wwEnabled,
  },
  {
    kind: 'toggle',
    id: ID.opEnabled,
    group: 'Fillers',
    label: 'Overpower (stance dance)',
    help: 'After the boss dodges, swap to Battle Stance for Overpower and back while Bloodthirst and Whirlwind are cooling down. Each swap keeps at most 10 rage, plus 3 per Improved Tactical Mastery rank.',
    default: true,
  },
  rageOption(
    ID.opMaxRage,
    'Overpower up to',
    'Dance only at or below this much rage. A swap keeps at most 10 rage, plus 3 per Improved Tactical Mastery rank (19 with the default talents), so at 45 a dance can lose up to 26, which an Overpower sooner is worth.',
    45,
    ID.opEnabled,
    'Fillers',
  ),
  {
    kind: 'toggle',
    id: ID.rendEnabled,
    group: 'Fillers',
    label: 'Rend (stance dance)',
    help: 'Keep your Rend on the boss: swap to Battle Stance for it and back while Bloodthirst and Whirlwind are cooling down, outside the execute phase. Each swap keeps at most 10 rage, plus 3 per Improved Tactical Mastery rank.',
    default: true,
  },
  {
    kind: 'number',
    id: ID.rendRefresh,
    group: 'Fillers',
    label: 'Rend again with',
    help: 'Refresh it when this much of it is left, unless it lasts to the end of the fight.',
    unit: 's left',
    min: 0,
    max: 21,
    step: 0.5,
    default: 3,
    dependsOn: ID.rendEnabled,
  },
  rageOption(
    ID.rendMaxRage,
    'Rend up to',
    'Dance for Rend only at or below this much rage. At 25, with the default talents’ 19 kept on a swap, a dance can lose up to 6.',
    25,
    ID.rendEnabled,
    'Fillers',
  ),
  ...heroicStrikeOptions(
    ID,
    40,
    { default: true, help: 'Queue Heroic Strike on the next main-hand swing when rage is high.' },
    { default: true, spenders: 'Bloodthirst or Whirlwind', underAdvanced: false },
  ),
  {
    kind: 'toggle',
    id: ID.hamEnabled,
    group: 'Fillers',
    label: 'Hamstring filler',
    help: 'Use Hamstring to fish for procs while Bloodthirst and Whirlwind are cooling down. The Overpower dance and Heroic Strike usually do more with that rage and those global cooldowns.',
    default: false,
  },
  rageOption(ID.hamMinRage, 'Hamstring from', 'Use it at or above this much rage.', 60, ID.hamEnabled, 'Fillers'),
  {
    kind: 'toggle',
    id: ID.hamFlurryDown,
    group: 'Fillers',
    label: 'Hamstring only without Flurry',
    help: 'Use Hamstring only while Flurry is down.',
    default: false,
    dependsOn: ID.hamEnabled,
  },
  {
    kind: 'toggle',
    id: ID.bzEnabled,
    group: 'Cooldowns and buffs',
    label: 'Berserker Rage',
    help: 'Use Berserker Rage on cooldown for rage while Bloodthirst and Whirlwind are cooling down. Needs Improved Berserker Rage.',
    default: true,
    requires: { talent: 'Improved Berserker Rage' },
  },
  rageOption(
    ID.bzMaxRage,
    'Berserker Rage up to',
    `Use it only at or below this much rage. ${WARRIOR_MAX_RAGE - 10} is the 130 cap minus 10.`,
    WARRIOR_MAX_RAGE - 10,
    ID.bzEnabled,
    'Cooldowns and buffs',
  ),
  {
    kind: 'toggle',
    id: ID.slamEnabled,
    group: 'Fillers',
    label: 'Slam',
    help: 'Use Slam while Bloodthirst and Whirlwind are cooling down. Without Improved Slam (an Arms talent), its 1.5 s cast stops your swings and resets both swing timers, which usually costs a dual wielder damage.',
    default: false,
  },
  ...consumableOptions(
    ID,
    'Drink it once: 45–75 rage and +60 Strength for 20 s. Early in the execute phase; or, when “Recklessness in the last” comes first (a short phase), without a phase, or with Execute off, in the last 20 s once Recklessness is used.',
    {
      default: 0,
      help: 'In the execute phase, drink it only at or below this much rage: at 0, once an Execute has emptied your bar. Needs Execute on, and an execute phase under Fight. In the phase’s last 2 s, and outside it, the limit is your rage cap minus 75 (55 with Boundless Rage 3/3).',
    },
    ID.exEnabled,
  ),
]

/**
 * Buff catalogue ids the rotation keeps up itself with these settings, so the plan drops the
 * Buffs switch's static version (Battle Shout, warrior.md §5.2 row 1 and notes).
 */
export function furyMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return reader(FURY_OPTIONS, values).on(ID.bsEnabled) ? ['battleShout'] : []
}


/** A row that stops in the execute phase says so while Execute applies (rows 8, 12 and 15). */
const NOT_IN_PHASE = { text: 'not in the execute phase', alsoOn: [ID.exEnabled] }
/** A row that stays GCD-safe for Bloodthirst and Whirlwind wherever it sits (rows 10, 12 and 15), while both are on. */
const AFTER_BT_WW = { text: 'while Bloodthirst and Whirlwind cool down', alsoOn: [ID.btEnabled, ID.wwEnabled] }

/**
 * Fury's rotation as a priority list (decision D31; warrior.md §5.2 "The priority list"): §5.2's
 * rows 0–13 and 15 in its order, each with its switch and its own settings. Row 3 is two rows here,
 * the racial and the trinkets, each with the sync with Death Wish they share; row 6, Bloodthirst in
 * the execute phase, has a switch of its own. The pre-pull is pinned first. The consumables (rows 16
 * and 17) are spec-wide, above the list, and always come after it (they're off the GCD).
 */
export const FURY_APL: AplDefinition = {
  rows: [
    {
      id: 'prepull',
      label: 'Before the pull',
      icon: 'ability_warrior_charge',
      optionIds: [ID.prepullShout, ID.prepullBloodrage, ID.prepullCharge],
      summary: [
        { option: ID.prepullShout, text: 'Battle Shout' },
        { option: ID.prepullBloodrage, text: 'Bloodrage' },
        { option: ID.prepullCharge, text: 'Charge' },
      ],
      help: 'What you do before the pull. It always comes first.',
      pinned: true,
    },
    {
      id: 'battleShout',
      label: 'Battle Shout',
      icon: 'ability_warrior_battleshout',
      enabledId: ID.bsEnabled,
      optionIds: [ID.bsRefresh],
      summary: [{ option: ID.bsRefresh, text: 'again with {}', zeroText: 'again once it runs out' }],
    },
    {
      id: 'deathWish',
      label: 'Death Wish',
      icon: DEATH_WISH.icon,
      enabledId: ID.dwEnabled,
      optionIds: [ID.dwAlign, ID.dwBeforeExecute],
      summary: [
        { option: ID.dwAlign, text: 'last one held' },
        { option: ID.dwBeforeExecute, text: '{} before the execute phase' },
      ],
    },
    {
      id: 'racial',
      label: 'Racial cooldown',
      icon: 'racial_orc_berserkerstrength',
      enabledId: ID.racialEnabled,
      optionIds: [ID.cdSync],
      // On cooldown without the sync, as the trinkets row reads (UA-4's pair).
      summary: [
        { option: ID.cdSync, text: 'with Death Wish', inactiveText: 'on cooldown' },
        { option: ID.cdSync, text: 'on cooldown', when: false },
      ],
    },
    {
      id: 'trinkets',
      label: 'On-use trinkets',
      icon: 'inv_jewelry_talisman_01',
      enabledId: ID.trinketsEnabled,
      optionIds: [ID.cdSync],
      // On cooldown without the sync: its switch off, or Death Wish off or untalented (the default Arms build's).
      summary: [
        { option: ID.cdSync, text: 'with Death Wish', inactiveText: 'on cooldown' },
        { option: ID.cdSync, text: 'on cooldown', when: false },
      ],
    },
    {
      id: 'recklessness',
      label: 'Recklessness',
      icon: 'ability_criticalstrike',
      enabledId: ID.reckEnabled,
      optionIds: [ID.reckBeforeExecute, ID.reckLastSec],
      summary: [
        { option: ID.reckBeforeExecute, text: '{} before the execute phase' },
        { option: ID.reckLastSec, text: 'or in the last {}' },
      ],
    },
    {
      id: 'bloodrage',
      label: 'Bloodrage',
      icon: BLOODRAGE.icon,
      enabledId: ID.brEnabled,
      optionIds: [ID.brMaxRage],
      summary: [{ option: ID.brMaxRage, text: 'up to {}' }],
    },
    {
      id: 'executeBloodthirst',
      label: 'Bloodthirst in the execute phase',
      icon: BLOODTHIRST.icon,
      enabledId: ID.exBtEnabled,
      optionIds: [ID.exBtOverAp],
      summary: [{ option: ID.exBtOverAp, text: 'from {}' }],
    },
    {
      id: 'execute',
      label: 'Execute',
      icon: EXECUTE.icon,
      enabledId: ID.exEnabled,
      optionIds: [ID.exMinExtraRage],
      summary: [{ text: 'execute phase' }, { option: ID.exMinExtraRage, text: '{} extra', hideWhen: 0 }],
    },
    {
      id: 'bloodthirst',
      label: 'Bloodthirst',
      icon: BLOODTHIRST.icon,
      enabledId: ID.btEnabled,
      optionIds: [],
      // Outside the execute phase: row 6 is Bloodthirst in it.
      summary: [{ text: 'on cooldown' }, NOT_IN_PHASE],
    },
    {
      id: 'whirlwind',
      label: 'Whirlwind',
      icon: WHIRLWIND.icon,
      enabledId: ID.wwEnabled,
      optionIds: [ID.wwReserve, ID.wwBtCdMin, ID.exWhirlwind],
      summary: [
        { option: ID.wwReserve, text: '{} reserve', hideWhen: 0 },
        { option: ID.wwBtCdMin, text: 'Bloodthirst {} away', alsoOn: [ID.btEnabled] },
        { option: ID.exWhirlwind, text: 'in the execute phase too' },
      ],
    },
    {
      id: 'overpower',
      label: 'Overpower (stance dance)',
      icon: OVERPOWER.icon,
      enabledId: ID.opEnabled,
      optionIds: [ID.opMaxRage],
      summary: [{ option: ID.opMaxRage, text: 'up to {}' }, AFTER_BT_WW],
    },
    {
      id: 'rend',
      label: 'Rend (stance dance)',
      icon: REND.icon,
      enabledId: ID.rendEnabled,
      optionIds: [ID.rendRefresh, ID.rendMaxRage],
      summary: [{ option: ID.rendRefresh, text: 'again with {}' }, { option: ID.rendMaxRage, text: 'up to {}' }, NOT_IN_PHASE, AFTER_BT_WW],
    },
    {
      id: 'heroicStrike',
      label: 'Heroic Strike',
      icon: HEROIC_STRIKE.icon,
      enabledId: ID.hsEnabled,
      optionIds: [ID.hsMinRage, ID.hsUnqueue, ID.hsUnqueueBelow, ID.exHeroicStrike],
      summary: [
        { option: ID.hsMinRage, text: 'from {}' },
        { option: ID.hsUnqueueBelow, text: 'cancel below {}' },
        { option: ID.exHeroicStrike, text: 'not in the execute phase', when: false },
      ],
    },
    {
      id: 'hamstring',
      label: 'Hamstring filler',
      icon: HAMSTRING.icon,
      enabledId: ID.hamEnabled,
      optionIds: [ID.hamMinRage, ID.hamFlurryDown],
      summary: [
        { option: ID.hamMinRage, text: 'from {}' },
        { option: ID.hamFlurryDown, text: 'without Flurry' },
        NOT_IN_PHASE,
        AFTER_BT_WW,
      ],
    },
    {
      id: 'berserkerRage',
      label: 'Berserker Rage',
      icon: BERSERKER_RAGE.icon,
      enabledId: ID.bzEnabled,
      optionIds: [ID.bzMaxRage],
      summary: [{ option: ID.bzMaxRage, text: 'up to {}' }, AFTER_BT_WW],
    },
    { id: 'slam', label: 'Slam', icon: SLAM.icon, enabledId: ID.slamEnabled, optionIds: [], summary: [NOT_IN_PHASE, AFTER_BT_WW] },
  ],
  specWide: [ID.potionEnabled, ID.potionMaxRage, ID.jujuEnabled],
  presets: [],
}

/**
 * The Fury priority list from the settings (warrior.md §5.2), its rows in `order` (FURY_APL; absent:
 * the default order). `talents` gates talent abilities (Death Wish, Bloodthirst, Improved Berserker
 * Rage) and resolves costs, Impale, Raging Blows and the talented rage of Bloodrage, Berserker Rage
 * and Charge; `auraIndex` resolves an aura id in the plan (−1 if the setup has none); `context`
 * gives the race (its racial cooldown), the equipped on-use items, the selected consumables and
 * whether there's an execute phase.
 *
 * A row's conditions are its own wherever it sits: Whirlwind still waits on Bloodthirst's cooldown,
 * and the fillers stay GCD-safe for Bloodthirst and Whirlwind, if you move them above those. So
 * rows refer to each other's abilities by definition (`b.ability`), which in the default order
 * resolves to the index the earlier row gave it, as before the list.
 */
export function furyRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  context: Partial<RotationContext> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx = { ...NO_CONTEXT, ...context }
  const v = reader(FURY_OPTIONS, values, talents)
  const b = new RotationBuilder(talents)
  const cost = (a: number) => b.cost(a)

  const execute = v.on(ID.exEnabled)
  /** The rows that follow the execute phase (Recklessness, the potion) need Execute and a phase. */
  const phase = execute && ctx.executePhase
  const useBt = talents.has('Bloodthirst') && v.on(ID.btEnabled)
  /** Row 6: Bloodthirst in the execute phase, at AP ≥ btOverExecuteAp. */
  const btExec = execute && useBt && v.on(ID.exBtEnabled)
  const useWw = v.on(ID.wwEnabled)
  const btOverAp = v.num(ID.exBtOverAp)
  /** Lines that stop in the execute phase get this condition while Execute is on. */
  const outsideExecute = (keep: boolean): RotationCondition[] => (execute && !keep ? [NOT_IN_EXECUTE] : [])
  /** Bloodthirst's and Whirlwind's indexes, −1 when they aren't used. */
  const btIndex = () => (useBt ? b.ability(BLOODTHIRST) : -1)
  const wwIndex = () => (useWw ? b.ability(WHIRLWIND) : -1)

  /**
   * Lines for an ability that must leave Bloodthirst and Whirlwind GCD-safe (rows 10 and 13), with
   * `tail` after the GCD-safe condition. In the execute phase it stays GCD-safe for what the phase
   * uses, as Whirlwind's wait does (row 9): Bloodthirst only at AP ≥ btOverExecuteAp (row 6),
   * Whirlwind only with whirlwindInExecute (§5.2 notes). Execute has no cooldown, so it isn't part of it.
   */
  const safeInBothPhases = (tail: RotationCondition[]): RotationCondition[][] => {
    const bt = btIndex()
    const ww = wwIndex()
    if (!execute) return [[...gcdSafe(bit(bt) | bit(ww)), ...tail]]
    const wwIn = useWw && v.on(ID.exWhirlwind) ? bit(ww) : 0
    const lines = [[NOT_IN_EXECUTE, ...gcdSafe(bit(bt) | bit(ww)), ...tail]]
    if (btExec) {
      lines.push(
        [IN_EXECUTE, { code: COND.apAtLeast, a: btOverAp, b: 0 }, ...gcdSafe(bit(bt) | wwIn), ...tail],
        [IN_EXECUTE, { code: COND.apBelow, a: btOverAp, b: 0 }, ...gcdSafe(wwIn), ...tail],
      )
    } else {
      lines.push([IN_EXECUTE, ...gcdSafe(wwIn), ...tail])
    }
    return lines
  }

  // Rows 1–5, 13, 16 and 17 apply in both phases (§5.2 notes). Their GCD-safe and time
  // conditions are checked by the engine, which wakes the rotation when a time-left condition
  // becomes true.
  /** Death Wish's index (−1 without it) and whether it's aligned, for the cooldowns synced with it (row 3). */
  const deathWish = () => ({ dw: talents.has('Death Wish') && v.on(ID.dwEnabled) ? b.ability(DEATH_WISH) : -1, align: v.on(ID.dwAlign) })
  compileAplRows(FURY_APL, order, {
    // Row 1: Battle Shout (shared.ts).
    battleShout: () => battleShoutLine(b, v, ID, ctx),
    // Row 2: Death Wish (shared.ts).
    deathWish: () => deathWishLines(b, v, ID, phase ? seconds(v, ID.dwBeforeExecute) : undefined),
    // Row 3: the racial and on-use trinkets synced with Death Wish (shared.ts).
    racial: () => racialLines(b, v, ID, ctx, deathWish()),
    trinkets: () => trinketLines(b, v, ID, ctx, deathWish()),
    // Row 4: Recklessness once, beforeExecuteSec before the execute phase starts or at ≤ lastSec
    // left, whichever comes first; by the clock alone without the phase or with Execute off
    // (Berserker Stance only, Fury's base stance). When it comes by the clock, the potion follows
    // it (row 16).
    recklessness: () => recklessnessLine(b, v, ID, ctx, 0, phase ? seconds(v, ID.reckBeforeExecute) : undefined),
    // Row 5: Bloodrage on cooldown (off the GCD) at rage ≤ maxRage.
    bloodrage: () => bloodrageLine(b, v, ID),
    // Row 6: in the execute phase, Bloodthirst only at AP ≥ btOverExecuteAp (the engine checks its cost).
    executeBloodthirst: () => {
      if (btExec) b.add(BLOODTHIRST, [IN_EXECUTE, { code: COND.apAtLeast, a: btOverAp, b: 0 }])
    },
    // Row 7: Execute on every GCD at rage ≥ cost + minExtraRage (the engine allows it only in the phase).
    execute: () => {
      if (execute) b.add(EXECUTE, [{ code: COND.minRage, a: cost(b.ability(EXECUTE)) + toTenths(v.num(ID.exMinExtraRage)), b: 0 }])
    },
    // Row 8: Bloodthirst on cooldown outside the execute phase.
    bloodthirst: () => {
      if (useBt) b.add(BLOODTHIRST, outsideExecute(false))
    },
    // Row 9: Whirlwind, rage ≥ cost + reserve, Bloodthirst cooldown ≥ btCdMinSec. In the execute
    // phase (if allowed) the Bloodthirst wait applies only while row 6 uses Bloodthirst (AP ≥ btOverExecuteAp).
    whirlwind: () => {
      if (!useWw) return
      const bt = btIndex()
      const minRage: RotationCondition = { code: COND.minRage, a: cost(b.ability(WHIRLWIND)) + toTenths(v.num(ID.wwReserve)), b: 0 }
      const btWait: RotationCondition[] = bt >= 0 ? [{ code: COND.cooldownAtLeast, a: bt, b: Math.round(v.num(ID.wwBtCdMin) * 1000) }] : []
      const inExecute = execute && v.on(ID.exWhirlwind)
      if (inExecute && btExec) {
        b.add(WHIRLWIND, [NOT_IN_EXECUTE, minRage, ...btWait])
        b.add(WHIRLWIND, [IN_EXECUTE, { code: COND.apAtLeast, a: btOverAp, b: 0 }, minRage, ...btWait])
        b.add(WHIRLWIND, [IN_EXECUTE, { code: COND.apBelow, a: btOverAp, b: 0 }, minRage])
      } else if (inExecute && bt >= 0) {
        // Bloodthirst isn't used in the phase (row 6 off), so Whirlwind doesn't wait for it there.
        b.add(WHIRLWIND, [NOT_IN_EXECUTE, minRage, ...btWait])
        b.add(WHIRLWIND, [IN_EXECUTE, minRage])
      } else {
        b.add(WHIRLWIND, [...outsideExecute(inExecute), minRage, ...btWait])
      }
    },
    // Row 10b (warrior.md §5.2, W4): a dance to Battle Stance for Rend and back, when your Rend is missing or has
    // at most refreshBelowSec of ticks left (unless it lasts to the end of the fight), at rage ≤
    // maxRage, Bloodthirst and Whirlwind GCD-safe, and never in the execute phase, where the GCDs are
    // Execute's. Its ticks add 0.02 × AP in forever (D36, §3.1).
    rend: () => {
      if (!v.on(ID.rendEnabled)) return
      const def = rend(ctx.profile)
      b.dance(def, STANCE.battle, [
        ...outsideExecute(false),
        { code: COND.abilityAuraRefresh, a: b.ability(def), b: seconds(v, ID.rendRefresh) },
        maxRage(v.num(ID.rendMaxRage)),
        ...gcdSafe(bit(btIndex()) | bit(wwIndex())),
      ])
    },
    // Row 10: the Overpower stance dance (on by default since M2.5b): while the window a dodge opened
    // is up, Bloodthirst and Whirlwind are GCD-safe and rage ≤ maxRage (40 by default: the swap in
    // keeps at most 25, and an Overpower sooner is worth the rest), swap to Battle Stance, Overpower,
    // and swap back when the swap cooldown allows (§2.1, §2.8, §7). It applies in both phases,
    // GCD-safe as row 13 is; in the execute phase it gets a GCD only while Execute waits for rage.
    // The window's openers come with it.
    overpower: () => {
      if (!v.on(ID.opEnabled)) return
      for (const conditions of safeInBothPhases([maxRage(v.num(ID.opMaxRage))])) b.dance(OVERPOWER, STANCE.battle, conditions)
      b.procs.push(...overpowerWindowProcs(talents))
    },
    // Row 11: Heroic Strike queue (off the GCD), rage ≥ minRage; optional unqueue below a threshold (on
    // by default). In both phases unless heroicStrikeInExecute is off.
    heroicStrike: () => heroicStrikeLine(b, v, ID, outsideExecute(v.on(ID.exHeroicStrike))),
    // Row 12: Hamstring filler, rage ≥ minRage, Bloodthirst and Whirlwind GCD-safe, optionally Flurry
    // down; never in the execute phase, where the GCDs are Execute's.
    hamstring: () => {
      if (!v.on(ID.hamEnabled)) return
      const conditions: RotationCondition[] = [...outsideExecute(false), { code: COND.minRage, a: toTenths(v.num(ID.hamMinRage)), b: 0 }]
      conditions.push(...gcdSafe(bit(btIndex()) | bit(wwIndex())))
      if (v.on(ID.hamFlurryDown)) conditions.push({ code: COND.auraDown, a: auraIndex('flurry'), b: 0 })
      b.add(HAMSTRING, conditions)
    },
    // Row 13: Berserker Rage, only with Improved Berserker Rage (without it the sim has nothing for
    // it to do): on cooldown at rage ≤ maxRage, GCD-safe for Bloodthirst and Whirlwind. In the
    // execute phase it's GCD-safe for what the phase uses, as Whirlwind's wait is (row 9): Bloodthirst
    // only at AP ≥ btOverExecuteAp, Whirlwind only with whirlwindInExecute. Execute has no cooldown,
    // so it isn't part of it; Berserker Rage gets a GCD there only while Execute waits for rage.
    berserkerRage: () => {
      if (!talents.has('Improved Berserker Rage') || !v.on(ID.bzEnabled)) return
      for (const conditions of safeInBothPhases([maxRage(v.num(ID.bzMaxRage))])) b.add(BERSERKER_RAGE, conditions)
    },
    // Row 15: Slam (off by default), a filler like Hamstring: Bloodthirst and Whirlwind GCD-safe, and
    // never in the execute phase, where the GCDs are Execute's. Without Improved Slam its cast stops
    // the swings and resets both timers (§3.1 "Slam"); the engine checks its cost.
    slam: () => {
      if (v.on(ID.slamEnabled)) b.add(SLAM, [...outsideExecute(false), ...gcdSafe(bit(btIndex()) | bit(wwIndex()))])
    },
  })

  // Rows 16 and 17, after the list: the Mighty Rage Potion and Juju Flurry, when they're selected in
  // Buffs (shared.ts). With Execute in an execute phase, the potion is drunk there at rage ≤ maxRage,
  // or in the phase's last 2 s at ≤ the build's cap − 75 if it hasn't been; but when Recklessness
  // came by its clock (the phase was still more than beforeExecuteSec away), it goes with
  // Recklessness, as without a phase. Otherwise, in the last 20 s at ≤ that limit, once
  // Recklessness has been used, so its rage joins Recklessness's crits (§5.2 notes). Juju Flurry on
  // cooldown.
  consumableLines(b, v, ID, ctx, {
    inPhase: phase,
    fallbackMaxRage: potionFallbackMaxRage(talents),
    lastChanceMs: POTION_LAST_CHANCE_MS,
    after: v.on(ID.reckEnabled) ? b.ability(recklessness(ctx.profile)) : -1,
    afterLeadMs: seconds(v, ID.reckBeforeExecute),
  })

  // Row 0: the pre-pull (shared.ts), built last so the abilities keep their indexes. Fury fights in
  // Berserker Stance, so Charge's swap keeps at most 10 + 3 per Improved Tactical Mastery rank (§2.1, §2.3).
  prepullCasts(b, v, ID, ctx, v.on(ID.bsEnabled), true)

  // What the timings above rest on (§5.2 notes, "The rotation knows the fight's timing").
  b.assumeKnownTimings(
    'with the default setup, timing Death Wish and Recklessness to the phase is worth about 1.4%, and using them 1–3 s early or late costs 0.05–0.33%; without a phase, Recklessness 3 s late is cut short by the fight’s end, costing 0.8% in a 3-minute fight and 4% in a 30 s one',
  )
  return b.result(onUseIds(ctx))
}
