// The Arms priority list and its settings (docs/classes/warrior.md §5.1, §5.3).
//
// This covers the base stance (Q24), the pre-pull (row 0), Battle Shout (row 1), Rend (row 2),
// Death Wish with the talent (row 16, whose row sits before row 3's by default), the racial and on-use
// trinkets (row 3), Recklessness (row 4), Bloodrage (row 5), the execute phase (rows 6 and 7),
// Mortal Strike, Overpower, Slam, Spearing Strike, the Whirlwind stance dance, Heroic Strike and
// Hamstring (rows 8–14), and the Mighty Rage Potion and Juju Flurry (rows 17 and 18, as Fury's 16
// and 17). Sweeping Strikes (row 15) waits for multi-target support. The rows are a priority list
// you reorder (ARMS_APL, decision D31), each with its own settings. Setting ids are
// `warrior.arms.<ability>.<param>` and every rage threshold is in absolute rage points (§5.1).
// Abilities are resolved with the build's talents (modifiers.ts) before their costs feed any
// condition.
import { toTenths } from '../../core/formulas'
import { COND, type RotationCondition, STANCE } from '../../plan/types'
import type { AplDefinition, RotationOption, RotationValue } from '../../types'
import { compileAplRows } from '../apl'
import {
  type AbilityDef,
  BLOODRAGE,
  DEATH_WISH,
  EXECUTE,
  HAMSTRING,
  HEROIC_STRIKE,
  MORTAL_STRIKE,
  OVERPOWER,
  overpowerWindowProcs,
  recklessness,
  REND,
  rend,
  SLAM,
  SPEARING_STRIKE,
  stanceSwapKeepTenths,
  WHIRLWIND,
} from './abilities'
import type { TalentRanks } from './modifiers'
import type { Stance } from './talents'
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
  minRage,
  NO_CONTEXT,
  NOT_IN_EXECUTE,
  onUseIds,
  prepullCasts,
  potionFallbackMaxRage,
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
} from './shared'

const ID = {
  ...sharedIds('arms'),
  baseStance: 'warrior.arms.baseStance',
  reckBeforeExecute: 'warrior.arms.recklessness.beforeExecuteSec',
  rendEnabled: 'warrior.arms.rend.enabled',
  rendRefresh: 'warrior.arms.rend.refreshBelowSec',
  exEnabled: 'warrior.arms.execute.enabled',
  exSlam: 'warrior.arms.execute.slamInExecute',
  exMortalStrike: 'warrior.arms.execute.mortalStrikeInExecute',
  msEnabled: 'warrior.arms.mortalStrike.enabled',
  opEnabled: 'warrior.arms.overpower.enabled',
  slamEnabled: 'warrior.arms.slam.enabled',
  slamReserve: 'warrior.arms.slam.reserve',
  ssEnabled: 'warrior.arms.spearingStrike.enabled',
  ssMinRage: 'warrior.arms.spearingStrike.minRageOtherTargets',
  wwEnabled: 'warrior.arms.whirlwind.enabled',
  wwMaxRage: 'warrior.arms.whirlwind.maxRage',
  hamEnabled: 'warrior.arms.hamstring.enabled',
  hamMinRage: 'warrior.arms.hamstring.minRage',
}

/**
 * In the execute phase, the potion's last chance: if an Execute hasn't emptied the bar by the phase's
 * last 4 s, it's drunk at up to the build's cap minus 75 (potionFallbackMaxRage), so a short phase
 * still gets it (§5.3 notes). Outside the phase (without one, or with Execute off) that limit applies
 * too; in the phase the setting's does, 0 by default: it waits for an Execute to empty the bar.
 */
const POTION_LAST_CHANCE_MS = 4000

/** The base-stance setting's id and values (warrior.md §5.3 notes, Q24). */
export const ARMS_BASE_STANCE_ID = ID.baseStance
const BERSERKER = { option: ID.baseStance, is: 'berserker' } as const

/**
 * Defaults from warrior.md §5.3's table (rows 0–14, 16–18), in priority order, the base stance
 * first. They're the best rotation found for the default setup (decision D23; §5.3 "Tuning the
 * defaults", measured with scripts/tune/rotation.mjs).
 */
export const ARMS_OPTIONS: RotationOption[] = [
  {
    kind: 'choice',
    id: ID.baseStance,
    label: 'Stance',
    help: 'Battle Stance has Rend, Overpower and Bloodthrill. Berserker Stance has +3% crit and Whirlwind. Either one can swap to the other for its abilities: turn them on below.',
    choices: [
      { value: 'battle', label: 'Battle' },
      { value: 'berserker', label: 'Berserker' },
    ],
    default: 'battle',
  },
  ...prepullOptions(
    ID,
    'Open with Charge for 15 rage (+3 per Improved Charge rank). In Berserker Stance, the swap after it keeps at most 10 + 3 per Improved Tactical Mastery rank.',
  ),
  ...battleShoutOptions(ID, 0),
  {
    kind: 'toggle',
    id: ID.rendEnabled,
    group: 'Core abilities',
    label: 'Rend',
    help: 'Keep your Rend on the boss: Bloodthrill needs it. On by default with Bloodthrill in Battle Stance. In Berserker Stance, swap to Battle Stance for it and back, at or below the rage a swap keeps.',
    default: false,
    defaultWhen: [
      { ...BERSERKER, default: false },
      { talent: 'Bloodthrill', default: true },
    ],
  },
  {
    kind: 'number',
    id: ID.rendRefresh,
    group: 'Core abilities',
    label: 'Rend again with',
    help: 'Refresh it when this much of it is left, unless it lasts to the end of the fight.',
    unit: 's left',
    min: 0,
    max: 21,
    step: 0.5,
    default: 3,
    dependsOn: ID.rendEnabled,
  },
  ...deathWishOptions(ID, {
    help: 'Use Death Wish for +20% physical damage for 30 s. Needs the Death Wish talent, and is on by default with it.',
    default: false,
    defaultWhen: [{ talent: 'Death Wish', default: true }],
  }),
  ...cooldownOptions(ID),
  ...recklessnessOptions(
    ID,
    'Use Recklessness once, for +100% crit chance for 15 s: just before the execute phase, or near the end without one. It needs Berserker Stance: from Battle Stance you swap and stay there, keeping at most 10 rage plus 3 per Improved Tactical Mastery rank.',
    15,
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
    help: 'In the execute phase, use Execute whenever you have the rage, in place of Mortal Strike, Slam and the fillers. Needs an execute phase under Fight.',
    default: true,
    needsExecutePhase: true,
  },
  {
    kind: 'toggle',
    id: ID.exSlam,
    group: 'Execute phase',
    label: 'Slam in the execute phase',
    help: 'Keep using Slam in the execute phase while you have rage for it and an Execute after it. It hits harder than an Execute for the same rage.',
    default: true,
    dependsOn: ID.exEnabled,
  },
  {
    kind: 'toggle',
    id: ID.exMortalStrike,
    group: 'Execute phase',
    label: 'Mortal Strike in the execute phase',
    help: 'Keep using Mortal Strike in the execute phase, ahead of Execute. With rage to spare, 30 rage does more as a Mortal Strike than as extra damage on an Execute.',
    default: true,
    dependsOn: ID.exEnabled,
  },
  {
    kind: 'toggle',
    id: ID.msEnabled,
    group: 'Core abilities',
    label: 'Mortal Strike',
    help: 'Use Mortal Strike whenever it’s ready. Needs the Mortal Strike talent.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.opEnabled,
    group: 'Core abilities',
    label: 'Overpower',
    help: 'Use Overpower after the boss dodges or Bloodthrill opens it, unless Mortal Strike is about to be ready and there isn’t rage for both. In Berserker Stance, swap to Battle Stance for it and back, at or below the rage a swap keeps.',
    default: true,
    defaultWhen: [{ ...BERSERKER, default: false }],
  },
  {
    kind: 'toggle',
    id: ID.slamEnabled,
    group: 'Core abilities',
    label: 'Slam',
    help: 'Use Slam whenever it’s ready and Mortal Strike isn’t about to be. Without Improved Slam its 1.5 s cast stops your swings and resets the swing timer.',
    default: true,
  },
  rageOption(ID.slamReserve, 'Slam rage reserve', 'Rage to keep on top of Slam’s cost.', 5, ID.slamEnabled, 'Core abilities'),
  {
    kind: 'toggle',
    id: ID.ssEnabled,
    group: 'Core abilities',
    label: 'Spearing Strike',
    help: 'Against Giants and Dragonkin (set under Fight) it deals 120% weapon damage, so use it on cooldown; against anything else, 40%. Needs the talent and a two-hander.',
    default: true,
  },
  rageOption(
    ID.ssMinRage,
    'Spearing Strike from',
    'Against other targets, use it only at or above this much rage, when Mortal Strike isn’t about to be ready.',
    35,
    ID.ssEnabled,
    'Core abilities',
  ),
  {
    kind: 'toggle',
    id: ID.wwEnabled,
    group: 'Core abilities',
    label: 'Whirlwind',
    help: 'Use Whirlwind when Mortal Strike isn’t about to be ready. It needs Berserker Stance: from Battle Stance, swap for it and back. On by default in Berserker Stance.',
    default: false,
    defaultWhen: [{ ...BERSERKER, default: true }],
  },
  rageOption(
    ID.wwMaxRage,
    'Whirlwind swap up to',
    'From Battle Stance, swap for it only at or below this much rage. The swap keeps at most 25 with Improved Tactical Mastery 5/5, and Whirlwind costs 25.',
    30,
    ID.wwEnabled,
    'Core abilities',
  ),
  ...heroicStrikeOptions(
    ID,
    125,
    {
      default: false,
      help: 'Queue Heroic Strike on the next main-hand swing. Off by default: its swing is reported to give no rage (unmeasured), so the rage does more in Slam, Mortal Strike, Hamstring and Execute. If you turn it on, keep “Heroic Strike from” (under Advanced) at 125 or more, so it only spends rage the cap would waste.',
    },
    { default: false, spenders: 'Mortal Strike or Slam' },
  ),
  {
    kind: 'toggle',
    id: ID.hamEnabled,
    group: 'Fillers',
    label: 'Hamstring filler',
    help: 'Use Hamstring to fish for procs, such as Weaponmaster’s extra attacks with a sword or Windfury, while the rest of the rotation is cooling down.',
    default: true,
  },
  rageOption(ID.hamMinRage, 'Hamstring from', 'Use it at or above this much rage.', 30, ID.hamEnabled, 'Fillers'),
  ...consumableOptions(
    ID,
    'Drink it once: 45–75 rage and +60 Strength for 20 s. Early in the execute phase; without a phase, or with Execute off, in the last 20 s, and from Battle Stance after Recklessness’s swap, which caps your rage.',
    {
      default: 0,
      help: 'In the execute phase, drink it only at or below this much rage: at 0, once an Execute has emptied your bar. Needs Execute on, and an execute phase under Fight. In the phase’s last 4 s, and outside it, the limit is your rage cap minus 75 (55 with Boundless Rage 3/3).',
    },
    ID.exEnabled,
  ),
]

/** The stance Arms fights in with these settings (warrior.md §5.3, Q24): Battle unless set to Berserker. */
export function armsBaseStance(values: Record<string, RotationValue>): Stance {
  return reader(ARMS_OPTIONS, values).str(ID.baseStance) === 'berserker' ? 'berserker' : 'battle'
}

/**
 * Buff catalogue ids the rotation keeps up itself with these settings, so the plan drops the
 * Buffs switch's static version (Battle Shout, warrior.md §5.3 row 1).
 */
export function armsMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return reader(ARMS_OPTIONS, values).on(ID.bsEnabled) ? ['battleShout'] : []
}

/** A row that stops in the execute phase says so while Execute applies (rows 8 and 10–14). */
const NOT_IN_PHASE = { text: 'not in the execute phase', alsoOn: [ID.exEnabled] }
/** A row that stays GCD-safe for Mortal Strike wherever it sits (rows 10 and 12), while it's on. */
const AFTER_MS = { text: 'while Mortal Strike cools down', alsoOn: [ID.msEnabled] }

/**
 * Arms' rotation as a priority list (decision D31; warrior.md §5.3 "The priority list"): §5.3's
 * rows 0–14 and 16 in the order the rotation has always built them, Death Wish (row 16) before the
 * racial and trinkets (row 3), each with its switch and its own settings. Row 3 is two rows, the
 * racial and the trinkets, which share the sync with Death Wish; rows 6 and 7 are three, Slam and
 * Mortal Strike in the execute phase with their own switches, then Execute. The pre-pull is pinned
 * first. The base stance and the consumables (rows 17 and 18) are spec-wide, above the list; the
 * consumables always come after it (they're off the GCD).
 */
export const ARMS_APL: AplDefinition = {
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
      id: 'overpower',
      label: 'Overpower',
      icon: OVERPOWER.icon,
      enabledId: ID.opEnabled,
      optionIds: [],
      summary: [{ text: 'after a dodge or Bloodthrill' }],
    },
    {
      id: 'rend',
      label: 'Rend',
      icon: REND.icon,
      enabledId: ID.rendEnabled,
      optionIds: [ID.rendRefresh],
      summary: [{ option: ID.rendRefresh, text: 'again with {}' }],
    },
    {
      id: 'deathWish',
      label: 'Death Wish',
      icon: DEATH_WISH.icon,
      enabledId: ID.dwEnabled,
      optionIds: [ID.dwAlign],
      summary: [{ option: ID.dwAlign, text: 'last one held for the end' }],
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
      id: 'executeSlam',
      label: 'Slam in the execute phase',
      icon: SLAM.icon,
      enabledId: ID.exSlam,
      optionIds: [],
      summary: [{ text: 'with rage for an Execute after it' }],
    },
    {
      id: 'executeMortalStrike',
      label: 'Mortal Strike in the execute phase',
      icon: MORTAL_STRIKE.icon,
      enabledId: ID.exMortalStrike,
      optionIds: [],
      summary: [{ text: 'on cooldown' }],
    },
    { id: 'execute', label: 'Execute', icon: EXECUTE.icon, enabledId: ID.exEnabled, optionIds: [], summary: [{ text: 'execute phase' }] },
    {
      id: 'mortalStrike',
      label: 'Mortal Strike',
      icon: MORTAL_STRIKE.icon,
      enabledId: ID.msEnabled,
      optionIds: [],
      // Outside the execute phase: row 7 has it in the phase.
      summary: [{ text: 'on cooldown' }, NOT_IN_PHASE],
    },
    {
      id: 'slam',
      label: 'Slam',
      icon: SLAM.icon,
      enabledId: ID.slamEnabled,
      optionIds: [ID.slamReserve],
      summary: [{ option: ID.slamReserve, text: '{} reserve', hideWhen: 0 }, NOT_IN_PHASE, AFTER_MS],
    },
    {
      id: 'spearingStrike',
      label: 'Spearing Strike',
      icon: SPEARING_STRIKE.icon,
      enabledId: ID.ssEnabled,
      optionIds: [ID.ssMinRage],
      summary: [{ text: 'on cooldown vs Giants and Dragonkin' }, { option: ID.ssMinRage, text: 'others from {}' }, NOT_IN_PHASE],
    },
    {
      id: 'whirlwind',
      label: 'Whirlwind',
      icon: WHIRLWIND.icon,
      enabledId: ID.wwEnabled,
      optionIds: [ID.wwMaxRage],
      summary: [{ option: ID.wwMaxRage, text: 'from Battle Stance up to {}' }, NOT_IN_PHASE, AFTER_MS],
    },
    {
      id: 'heroicStrike',
      label: 'Heroic Strike',
      icon: HEROIC_STRIKE.icon,
      enabledId: ID.hsEnabled,
      optionIds: [ID.hsMinRage, ID.hsUnqueue, ID.hsUnqueueBelow],
      summary: [{ option: ID.hsMinRage, text: 'from {}' }, { option: ID.hsUnqueueBelow, text: 'cancel below {}' }, NOT_IN_PHASE],
    },
    {
      id: 'hamstring',
      label: 'Hamstring filler',
      icon: HAMSTRING.icon,
      enabledId: ID.hamEnabled,
      optionIds: [ID.hamMinRage],
      summary: [{ option: ID.hamMinRage, text: 'from {}' }, NOT_IN_PHASE, { text: 'while your strikes cool down' }],
    },
  ],
  specWide: [ID.baseStance, ID.potionEnabled, ID.potionMaxRage, ID.jujuEnabled],
  presets: [],
}

/**
 * The Arms priority list from the settings (warrior.md §5.3), its rows in `order` (ARMS_APL; absent:
 * the default order). `talents` gates talent abilities (Mortal Strike, Spearing Strike, Death Wish),
 * follows them for defaults (Rend with Bloodthrill) and resolves costs, Impale, Improved Rend,
 * Improved Slam, Improved Overpower and the talented rage of Bloodrage and Charge; `context` gives
 * the race (its racial cooldown), the equipped on-use items, the selected consumables, whether
 * there's an execute phase, the profile (the rage a stance swap keeps) and the target's creature
 * type (Spearing Strike). `_auraIndex` is unused: no Arms line reads a plan aura by id.
 *
 * A row's conditions are its own wherever it sits: the rows after Mortal Strike stay GCD-safe for
 * it, Hamstring for every strike with a cooldown, and the racial and trinkets wait for Death Wish, if
 * you move them above those. So rows refer to each other's abilities by definition (`b.ability`),
 * which in the default order resolves to the index the earlier row gave it, as before the list.
 */
export function armsRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  _auraIndex: (id: string) => number,
  context: Partial<RotationContext> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx = { ...NO_CONTEXT, ...context }
  const v = reader(ARMS_OPTIONS, values, talents)
  const b = new RotationBuilder(talents)
  const index = (def: AbilityDef) => b.ability(def)
  /** Its GCD with the build's talents: Slam's is 1 s with Improved Slam 2/2 (§3.1). */
  const gcdOf = (def: AbilityDef) => b.abilities[index(def)].gcdMs

  // The base stance (§5.3 notes, Q24). A line whose ability the base stance refuses dances to the
  // stance it needs (§7 "Stance dancing"): from Battle, Whirlwind; from Berserker, Rend and
  // Overpower. Those two swap in only at rage ≤ what a swap keeps, so it loses none (§5.1).
  const home = armsBaseStance(values) === 'berserker' ? STANCE.berserker : STANCE.battle
  const danceTo = (def: AbilityDef, stance: number) => ((def.stances & home) === 0 ? stance : 0)
  const swapCap = maxRage(stanceSwapKeepTenths(talents, ctx.profile) / 10)

  const execute = v.on(ID.exEnabled)
  /** Lines that stop in the execute phase get this condition while Execute is on (§5.3 notes). */
  const outside: RotationCondition[] = execute ? [NOT_IN_EXECUTE] : []
  const phase = execute && ctx.executePhase

  // Mortal Strike needs its talent. Outside the phase it's row 8; in it, only with
  // mortalStrikeInExecute (row 7).
  const msTalent = talents.has('Mortal Strike')
  const msOut = msTalent && v.on(ID.msEnabled)
  const msIn = execute && msTalent && v.on(ID.exMortalStrike)
  /** GCD-safe for Mortal Strike over `def`'s own GCD, in the phase(s) where it's used (§5.1). */
  const msSafe = (def: AbilityDef, used: boolean) => gcdSafe(used ? bit(index(MORTAL_STRIKE)) : 0, gcdOf(def))
  const slamOut = v.on(ID.slamEnabled)
  /** Spearing Strike's and Whirlwind's indexes, −1 when they aren't used (Hamstring's mask, row 14). */
  const ssIndex = () => (talents.has('Spearing Strike') && v.on(ID.ssEnabled) ? index(SPEARING_STRIKE) : -1)
  const wwIndex = () => (v.on(ID.wwEnabled) ? index(WHIRLWIND) : -1)
  /** Death Wish's index (−1 without it) and whether it's aligned, for the cooldowns synced with it (row 3). */
  const deathWish = () => ({ dw: talents.has('Death Wish') && v.on(ID.dwEnabled) ? index(DEATH_WISH) : -1, align: v.on(ID.dwAlign) })

  // Rows 1–5, 9 and 16 apply in both phases, Rend included (§5.3 notes).
  compileAplRows(ARMS_APL, order, {
    // Row 1: Battle Shout (shared.ts).
    battleShout: () => battleShoutLine(b, v, ID, ctx),
    // Row 2: Rend when your Rend is missing or has at most refreshBelowSec of ticks left, unless it
    // lasts to the end of the fight (the upkeep condition, §7 "Rend is a bleed ability"). On by
    // default with Bloodthrill, whose proc needs it.
    rend: () => {
      if (!v.on(ID.rendEnabled)) return
      const def = rend(ctx.profile)
      const at = index(def)
      const to = danceTo(def, STANCE.battle)
      b.line(def, to, [{ code: COND.abilityAuraRefresh, a: at, b: seconds(v, ID.rendRefresh) }, ...(to ? [swapCap] : [])])
    },
    // Row 16, with the talent: Death Wish, as Fury's row 2. By default it comes before row 3, whose
    // racial and trinkets wait for it wherever they sit (shared.ts).
    deathWish: () => deathWishLines(b, v, ID),
    // Row 3: the racial and on-use trinkets, synced with Death Wish when it's used, on cooldown
    // otherwise.
    racial: () => racialLines(b, v, ID, ctx, deathWish()),
    trinkets: () => trinketLines(b, v, ID, ctx, deathWish()),
    // Row 4: Recklessness once, beforeExecuteSec before the execute phase starts or at ≤ lastSec
    // left, whichever comes first; by the clock alone without the phase or with Execute off. From
    // Battle Stance it swaps to Berserker Stance (keeping at most the swap's cap) and stays there for
    // the rest of the fight.
    recklessness: () => recklessnessLine(b, v, ID, ctx, home === STANCE.battle ? STANCE.berserker : 0, phase ? seconds(v, ID.reckBeforeExecute) : undefined),
    // Row 5: Bloodrage on cooldown (off the GCD) at rage ≤ maxRage.
    bloodrage: () => bloodrageLine(b, v, ID),
    // Row 6: in the execute phase, Slam off cooldown at rage ≥ its cost + Execute's, so an Execute
    // can follow it.
    executeSlam: () => {
      if (execute && v.on(ID.exSlam)) b.add(SLAM, [IN_EXECUTE, minRage(b.cost(index(SLAM)) + b.cost(index(EXECUTE)))])
    },
    // Row 7: with mortalStrikeInExecute, Mortal Strike in the execute phase, by default just ahead of
    // Execute; then Execute whenever it can pay (the engine checks its cost, and allows it only in
    // the phase).
    executeMortalStrike: () => {
      if (msIn) b.add(MORTAL_STRIKE, [IN_EXECUTE])
    },
    execute: () => {
      if (execute) b.add(EXECUTE, [])
    },
    // Row 8: Mortal Strike on cooldown, outside the execute phase.
    mortalStrike: () => {
      if (msOut) b.add(MORTAL_STRIKE, outside)
    },
    // Row 9: Overpower while its window is open (a dodge, or Bloodthrill), when Mortal Strike is
    // GCD-safe or there's rage for both (its cost + Overpower's: 35). It applies in both phases; in
    // the execute phase Mortal Strike counts only while it's used there, and, below Execute,
    // Overpower gets a GCD only while Execute waits for rage. From Berserker Stance it's a dance at
    // rage ≤ the swap's cap, which leaves no room for the rage-for-both line. The window's openers
    // come with it (§2.8).
    overpower: () => {
      if (!v.on(ID.opEnabled)) return
      const op = index(OVERPOWER)
      const to = danceTo(OVERPOWER, STANCE.battle)
      const dance = to ? [swapCap] : []
      const phases: [RotationCondition[], boolean][] = execute ? [[[NOT_IN_EXECUTE], msOut], [[IN_EXECUTE], msIn]] : [[[], msOut]]
      for (const [when, msUsed] of phases) {
        if (!msUsed) {
          b.line(OVERPOWER, to, [...when, ...dance])
          continue
        }
        b.line(OVERPOWER, to, [...when, ...msSafe(OVERPOWER, true), ...dance])
        const both = b.cost(index(MORTAL_STRIKE)) + b.cost(op)
        if (!to || both <= swapCap.a) b.line(OVERPOWER, to, [...when, minRage(both), ...dance])
      }
      b.procs.push(...overpowerWindowProcs(talents))
    },
    // Row 10: Slam off cooldown at rage ≥ its cost + reserve, Mortal Strike GCD-safe over Slam's own
    // GCD (1 s with Improved Slam 2/2); outside the execute phase, where row 6 has it.
    slam: () => {
      if (slamOut) b.add(SLAM, [...outside, minRage(b.cost(index(SLAM)) + toTenths(v.num(ID.slamReserve))), ...msSafe(SLAM, msOut)])
    },
    // Row 11: Spearing Strike (the talent; the engine skips it without a two-hander). Against Giants
    // and Dragonkin (1.20 of weapon damage, §3.1) on cooldown; against anything else (0.40) at rage ≥
    // minRageOtherTargets with Mortal Strike GCD-safe. Outside the execute phase.
    spearingStrike: () => {
      if (ssIndex() < 0) return
      const strong = SPEARING_STRIKE.vsCreature!.types.includes(ctx.creatureType)
      b.add(SPEARING_STRIKE, strong ? outside : [...outside, minRage(toTenths(v.num(ID.ssMinRage))), ...msSafe(SPEARING_STRIKE, msOut)])
    },
    // Row 12: Whirlwind, Mortal Strike GCD-safe, outside the execute phase. From Battle Stance it's a
    // dance to Berserker Stance at rage ≤ maxRage (30: the swap keeps 25 and Whirlwind costs 25); in
    // Berserker Stance it needs no dance. The limit is the dance's: once Recklessness leaves the
    // warrior in Berserker Stance (row 4), a plain line uses it at any rage, as from a Berserker base.
    whirlwind: () => {
      if (!v.on(ID.wwEnabled)) return
      const to = danceTo(WHIRLWIND, STANCE.berserker)
      const conditions = [...outside, ...msSafe(WHIRLWIND, msOut)]
      b.line(WHIRLWIND, to, [...conditions, ...(to ? [maxRage(v.num(ID.wwMaxRage))] : [])])
      if (to) b.add(WHIRLWIND, conditions)
    },
    // Row 13: the Heroic Strike queue (off the GCD) at rage ≥ minRage, outside the execute phase; a
    // queued one is cancelled when the phase starts (shared.ts). Off, as by default, the result still
    // lists the [?] that its swing gives no rage: the default rests on it (§5.3 notes).
    heroicStrike: () => {
      if (v.on(ID.hsEnabled)) heroicStrikeLine(b, v, ID, outside)
      else b.assumes.push({ id: 'onNextSwingRage', detail: 'it’s why Arms leaves Heroic Strike off by default' })
    },
    // Row 14: Hamstring (on by default, from 40) at rage ≥ minRage, GCD-safe for every strike with a
    // cooldown that's used (Mortal Strike, Slam, Spearing Strike, Whirlwind), wherever it sits;
    // outside the execute phase.
    hamstring: () => {
      if (!v.on(ID.hamEnabled)) return
      const mask = (msOut ? bit(index(MORTAL_STRIKE)) : 0) | (slamOut ? bit(index(SLAM)) : 0) | bit(ssIndex()) | bit(wwIndex())
      b.add(HAMSTRING, [...outside, minRage(toTenths(v.num(ID.hamMinRage))), ...gcdSafe(mask, gcdOf(HAMSTRING))])
    },
  })

  // Rows 17 and 18, after the list: the Mighty Rage Potion and Juju Flurry, when they're selected in
  // Buffs (shared.ts). With Execute in an execute phase, the potion is drunk there at rage ≤ maxRage,
  // or in the phase's last 4 s at ≤ the build's cap − 75 (55 at 3/3 Boundless Rage) if it hasn't
  // been. Otherwise, in the last 20 s at ≤ that limit, after Recklessness's swap from Battle Stance,
  // which would cap its rage at 25 (§5.3 notes). Juju Flurry on cooldown.
  const reckSwap = v.on(ID.reckEnabled) && home === STANCE.battle ? index(recklessness(ctx.profile)) : -1
  consumableLines(b, v, ID, ctx, { inPhase: phase, fallbackMaxRage: potionFallbackMaxRage(talents), lastChanceMs: POTION_LAST_CHANCE_MS, after: reckSwap })

  // Row 0: the pre-pull (shared.ts), built last so the abilities keep their indexes. Charge is a
  // Battle Stance ability: fighting in Berserker Stance, the swap after it keeps at most the swap's cap.
  prepullCasts(b, v, ID, ctx, v.on(ID.bsEnabled), home !== STANCE.battle)

  // What the timings above rest on (§5.2 notes, "The rotation knows the fight's timing"; §5.3 row 4 notes).
  b.assumeKnownTimings('with the default setup, using Recklessness 1–3 s early or late around the phase costs 0.02–0.28%')
  return b.result(onUseIds(ctx))
}
