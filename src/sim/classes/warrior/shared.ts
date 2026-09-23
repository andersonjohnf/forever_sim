// What the warrior DPS priority lists share (docs/classes/warrior.md §5.1–§5.3): the builder that
// resolves abilities with the build's talents, condition helpers, and the rows Fury and Arms
// both have, with their settings: the pre-pull, Battle Shout's upkeep, Death Wish, the racial and
// on-use trinkets synced with it, Recklessness, Bloodrage, the Heroic Strike queue, the Mighty
// Rage Potion and Juju Flurry. Setting ids are `warrior.<spec>.<ability>.<param>`, and every rage
// threshold is in absolute rage points (§5.1).
import { GCD_MS, toTenths } from '../../core/formulas'
import type { OnUseSpec, ProcSpec } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { COND, type PrepullPlan, type RotationCondition, type RotationEntry } from '../../plan/types'
import { FOREVER, type RulesProfile } from '../../rules/profiles'
import type { CreatureType, RotationGroup, RotationOption, RotationValue } from '../../types'
import { resolveRotationValues } from '../options'
import {
  type AbilityDef,
  battleShout,
  BLOODRAGE,
  CHARGE_RAGE_TENTHS,
  DEATH_WISH,
  HEROIC_STRIKE,
  IMPROVED_CHARGE_TENTHS_PER_RANK,
  onUseAbility,
  RACIAL_COOLDOWNS,
  recklessness,
  stanceSwapKeepTenths,
} from './abilities'
import { type TalentRanks, withTalents } from './modifiers'
import { TALENT_EFFECTS } from './talents'

export interface ClassRotation {
  abilities: AbilityDef[]
  rotation: RotationEntry[]
  prepull: PrepullPlan
  /** Ids of the on-use items and consumables it knows how to use, whether or not its settings use them. */
  onUse: string[]
  /** Procs the rotation needs: the Overpower window's openers when it uses Overpower (warrior.md §2.8). */
  procs: ProcSpec[]
  /**
   * [?] assumptions the rotation's settings rest on though no ability it uses shows them, with a
   * note why (Arms: Heroic Strike is off by default because its swing is reported to give no rage,
   * warrior.md §5.3 notes). The plan lists them.
   */
  assumes?: RotationAssumption[]
}

export interface RotationAssumption {
  id: AssumptionId
  detail?: string
}

/** What the rotation needs from the rest of the setup. */
export interface RotationContext {
  race: string
  /** Use effects of equipped items the sim models (effects/items.ts), e.g. on-use trinkets. */
  items: OnUseSpec[]
  /** Consumables selected in Buffs that the sim can use (the buff catalogue's `onUse` effects with a `use`). */
  consumables: OnUseSpec[]
  /** The fight has an execute phase (executePct > 0; encounter §3). */
  executePhase: boolean
  /** The rules profile: how much rage a stance swap keeps (warrior.md §2.1). */
  profile: RulesProfile
  /** The target's creature type (encounter §6): Spearing Strike's priority depends on it (warrior.md §5.3 row 11). */
  creatureType: CreatureType
}

export const NO_CONTEXT: RotationContext = { race: '', items: [], consumables: [], executePhase: true, profile: FOREVER, creatureType: 'none' }

/** Row 0: Battle Shout 3 s and Bloodrage 1 s before the pull (warrior.md §5.2, §5.3). */
export const PREPULL_SHOUT_MS = -3000
export const PREPULL_BLOODRAGE_MS = -1000

/**
 * The Mighty Rage Potion without an execute phase: it goes in the last 20 s, as long as its +60
 * Strength lasts, so its buff and rage fall where the execute phase would have been (warrior.md
 * §5.2 notes; an engine choice).
 */
export const POTION_NO_EXECUTE_LAST_MS = 20000

/** Buff catalogue ids of the consumables the rotations use (effects/buffs.ts). */
export const RAGE_POTION = 'mightyRagePotion'
export const JUJU_FLURRY = 'jujuFlurry'

/**
 * The rage cap of both DPS specs' default builds (Boundless Rage 3/3, warrior.md §5.2, §5.3); rage
 * thresholds are absolute (§5.1).
 */
export const WARRIOR_MAX_RAGE = 130

/** The base rage cap (rage.md#rage-pool-cap-and-decay), as the plan builder has it. */
const BASE_RAGE_CAP = 100

/**
 * The build's rage cap: 100, plus Boundless Rage's 10 a rank (130 at 3/3; rage.md#rage-pool-cap-and-decay,
 * talents.ts). A Gnome's Expansive Mind (+5%, [?] Q17) isn't counted, so a limit drawn from it
 * leaves a Gnome a few more points of room.
 */
export function rageCap(talents: TalentRanks): number {
  const effects = TALENT_EFFECTS['Boundless Rage'](talents.get('Boundless Rage') ?? 0)
  return BASE_RAGE_CAP + effects.reduce((sum, e) => sum + (e.kind === 'maxRage' ? e.value : 0), 0)
}

/** The most rage a Mighty Rage Potion gives: 45–75 (warrior.md §5.2 notes). */
const RAGE_POTION_MAX_RAGE = 75

/**
 * The Mighty Rage Potion's rage limit where the setting's doesn't apply (warrior.md §5.3 row 17):
 * the build's cap minus the potion's 75 at most, so none of its rage is lost. 55 with Boundless Rage
 * 3/3.
 */
export const potionFallbackMaxRage = (talents: TalentRanks): number => rageCap(talents) - RAGE_POTION_MAX_RAGE

/** A rage threshold input: 0 to the default build's 130 cap, in its parent's group. */
export const rageOption = (id: string, label: string, help: string, def: number, dependsOn: string, group: RotationGroup): RotationOption => ({
  kind: 'number',
  id,
  label,
  group,
  help,
  unit: 'rage',
  min: 0,
  max: WARRIOR_MAX_RAGE,
  step: 1,
  default: def,
  dependsOn,
})

/** Setting ids of the rows both specs have, for `warrior.<spec>`. */
export function sharedIds(spec: 'fury' | 'arms') {
  const p = `warrior.${spec}`
  return {
    prepullShout: `${p}.prepull.battleShout`,
    prepullBloodrage: `${p}.prepull.bloodrage`,
    prepullCharge: `${p}.prepull.charge`,
    bsEnabled: `${p}.battleShout.enabled`,
    bsRefresh: `${p}.battleShout.refreshBelowSec`,
    dwEnabled: `${p}.deathWish.enabled`,
    dwAlign: `${p}.deathWish.alignToEnd`,
    racialEnabled: `${p}.racial.enabled`,
    trinketsEnabled: `${p}.trinkets.enabled`,
    cdSync: `${p}.cooldowns.syncWithDeathWish`,
    reckEnabled: `${p}.recklessness.enabled`,
    reckLastSec: `${p}.recklessness.lastSec`,
    brEnabled: `${p}.bloodrage.enabled`,
    brMaxRage: `${p}.bloodrage.maxRage`,
    hsEnabled: `${p}.heroicStrike.enabled`,
    hsMinRage: `${p}.heroicStrike.minRage`,
    hsUnqueue: `${p}.heroicStrike.unqueue`,
    hsUnqueueBelow: `${p}.heroicStrike.unqueueBelow`,
    potionEnabled: `${p}.ragePotion.enabled`,
    potionMaxRage: `${p}.ragePotion.maxRage`,
    jujuEnabled: `${p}.jujuFlurry.enabled`,
  }
}
export type SharedIds = ReturnType<typeof sharedIds>

/** Row 0's settings: the pre-pull Battle Shout and Bloodrage, and Charge (whose help differs per spec). */
export const prepullOptions = (ids: SharedIds, chargeHelp: string): RotationOption[] => [
  {
    kind: 'toggle',
    id: ids.prepullShout,
    group: 'Before the pull',
    label: 'Battle Shout before the pull',
    help: 'Shout 3 s before the pull, so the fight starts with it up. Its rage comes from before the pull. Needs Battle Shout on.',
    default: true,
    dependsOn: ids.bsEnabled,
  },
  {
    kind: 'toggle',
    id: ids.prepullBloodrage,
    group: 'Before the pull',
    label: 'Bloodrage before the pull',
    help: 'Use Bloodrage 1 s before the pull: its 10 rage is there at the pull, and it’s ready again 59 s in.',
    default: true,
  },
  { kind: 'toggle', id: ids.prepullCharge, group: 'Before the pull', label: 'Charge in', help: chargeHelp, default: false },
]

/** Battle Shout's upkeep (Fury row 1, Arms row 1); `refreshBelowSec` is the spec's default (Fury 3 s, Arms 0 s). */
export const battleShoutOptions = (ids: SharedIds, refreshBelowSec = 3): RotationOption[] => [
  {
    kind: 'toggle',
    id: ids.bsEnabled,
    group: 'Cooldowns and buffs',
    label: 'Battle Shout',
    // No number here: the options are the same in both rule profiles, and the shout isn't
    // (+139 in Forever, +232 in Classic Era; the Buffs tab shows the setup's).
    help: 'Keep your own Battle Shout up, for 10 rage a shout; the Buffs tab shows its attack power. While this is on, the Buffs tab’s Battle Shout adds nothing more, since it’s the same buff.',
    default: true,
    maintainsBuff: 'battleShout',
  },
  {
    kind: 'number',
    id: ids.bsRefresh,
    group: 'Cooldowns and buffs',
    label: 'Shout again with',
    help: 'Refresh it when this much of it is left, unless the fight ends first. At 0, it shouts again once it has run out.',
    unit: 's left',
    min: 0,
    max: 30,
    step: 1,
    default: refreshBelowSec,
    dependsOn: ids.bsEnabled,
  },
]

/**
 * Death Wish and its alignment with the fight's end (Fury row 2; Arms row 16, with the talent).
 * `enabled` overrides the switch's fields, `alignHelp` is the alignment's help, and `after` are the
 * spec's own settings after it (Fury: before the execute phase, §5.2 row 2).
 */
export const deathWishOptions = (
  ids: SharedIds,
  enabled: Partial<Extract<RotationOption, { kind: 'toggle' }>> = {},
  alignHelp = 'When no later Death Wish would fit in the fight, hold the last one until 30 s are left. Earlier ones go on cooldown.',
  ...after: RotationOption[]
): RotationOption[] => [
  {
    kind: 'toggle',
    id: ids.dwEnabled,
    group: 'Cooldowns and buffs',
    label: 'Death Wish',
    help: 'Use Death Wish for +20% physical damage for 30 s. Needs the Death Wish talent.',
    default: true,
    ...enabled,
  },
  {
    kind: 'toggle',
    id: ids.dwAlign,
    group: 'Cooldowns and buffs',
    label: 'Save the last Death Wish for the end',
    help: alignHelp,
    default: true,
    dependsOn: ids.dwEnabled,
  },
  ...after,
]

/** The racial cooldown and on-use trinkets, synced with Death Wish (Fury row 3, Arms row 3). */
export const cooldownOptions = (ids: SharedIds): RotationOption[] => [
  {
    kind: 'toggle',
    id: ids.racialEnabled,
    group: 'Cooldowns and buffs',
    label: 'Racial cooldown',
    help: 'Use your race’s cooldown: Blood Fury (Orc), Berserking (Troll) or Elune’s Light (Night Elf). Gnome Eureka! isn’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ids.trinketsEnabled,
    group: 'Cooldowns and buffs',
    label: 'On-use trinkets',
    help: 'Use Weakness Analyzer if you wear it: +5% crit until your next crit, for up to 20 s. Other on-use trinkets aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ids.cdSync,
    group: 'Cooldowns and buffs',
    label: 'Racial and trinkets with Death Wish',
    help: 'Save them for Death Wish, unless Death Wish is too far off for them to be ready again by then.',
    default: true,
    dependsOn: ids.dwEnabled,
  },
]

/**
 * Recklessness once near the end (row 4 of both); its help says how the spec gets to Berserker
 * Stance, and `lastSec` is the spec's default timing by the clock (Fury 16 s, Arms 15 s), whose help
 * both share. `before` is the spec's own timing setting ahead of it (before the execute phase,
 * §5.2 and §5.3 row 4).
 */
export const recklessnessOptions = (ids: SharedIds, help: string, lastSec = 15, ...before: RotationOption[]): RotationOption[] => [
  { kind: 'toggle', id: ids.reckEnabled, group: 'Cooldowns and buffs', label: 'Recklessness', help, default: true },
  ...before,
  {
    kind: 'number',
    id: ids.reckLastSec,
    group: 'Cooldowns and buffs',
    label: 'Recklessness in the last',
    help: 'Or once this much of the fight is left, if that comes first: in a short fight, without an execute phase, or with Execute off. Recklessness lasts 15 s, so at 15 or 16 s nearly all of it counts, even after a global cooldown in progress.',
    unit: 's',
    min: 1,
    max: 300,
    step: 1,
    default: lastSec,
    dependsOn: ids.reckEnabled,
  },
]

/** Bloodrage on cooldown, with room under the cap (row 5 of both). */
export const bloodrageOptions = (ids: SharedIds): RotationOption[] => [
  {
    kind: 'toggle',
    id: ids.brEnabled,
    group: 'Cooldowns and buffs',
    label: 'Bloodrage',
    help: 'Use Bloodrage on cooldown: 10 rage, then 10 more over 10 s (50% more with Improved Bloodrage 2/2).',
    default: true,
  },
  rageOption(
    ids.brMaxRage,
    'Bloodrage up to',
    `Use it only at or below this much rage, so its rage isn’t lost at the cap. ${WARRIOR_MAX_RAGE - 20} is the 130 cap minus 20.`,
    WARRIOR_MAX_RAGE - 20,
    ids.brEnabled,
    'Cooldowns and buffs',
  ),
]

/**
 * The Heroic Strike queue (Fury row 11, Arms row 13), from `minRage`. `enabled` is the toggle's
 * default and help: Fury's is on; Arms' is off (warrior.md §5.3 notes). `unqueue` is the cancel
 * switch's default: Fury's is on (§5.2), Arms' off.
 */
export const heroicStrikeOptions = (
  ids: SharedIds,
  minRage: number,
  enabled: { default: boolean; help: string } = { default: true, help: 'Queue Heroic Strike on the next main-hand swing when rage is high.' },
  unqueue = false,
): RotationOption[] => [
  {
    kind: 'toggle',
    id: ids.hsEnabled,
    group: 'Fillers',
    label: 'Heroic Strike',
    help: enabled.help,
    default: enabled.default,
  },
  rageOption(ids.hsMinRage, 'Heroic Strike from', 'Queue it at or above this much rage.', minRage, ids.hsEnabled, 'Fillers'),
  {
    kind: 'toggle',
    id: ids.hsUnqueue,
    group: 'Fillers',
    label: 'Cancel Heroic Strike on low rage',
    help: 'Unqueue Heroic Strike if rage drops below a threshold before the swing.',
    default: unqueue,
    dependsOn: ids.hsEnabled,
  },
  rageOption(ids.hsUnqueueBelow, 'Cancel Heroic Strike below', 'Unqueue it when rage falls below this.', 20, ids.hsUnqueue, 'Fillers'),
]

/**
 * The Mighty Rage Potion and Juju Flurry, when they're selected in Buffs (Fury rows 16 and 17, Arms
 * rows 17 and 18). `when` says when the potion is drunk, in and outside the execute phase; `potionMaxRage`
 * is the spec's rage limit for it: its default (Fury 55, the cap minus 75; Arms 0, in the phase) and
 * help.
 */
export const consumableOptions = (
  ids: SharedIds,
  when = 'at the start of the execute phase (in the last 20 s if there’s none)',
  potionMaxRage: { default: number; help: string } = {
    default: WARRIOR_MAX_RAGE - 75,
    help: `Drink it only at or below this much rage, so none of its rage is lost at the cap. ${WARRIOR_MAX_RAGE - 75} is the 130 cap minus 75.`,
  },
): RotationOption[] => [
  {
    kind: 'toggle',
    id: ids.potionEnabled,
    group: 'Consumables',
    label: 'Mighty Rage Potion',
    help: `Drink it once, ${when}: 45–75 rage and +60 Strength for 20 s.`,
    default: true,
    requiresBuff: RAGE_POTION,
  },
  rageOption(ids.potionMaxRage, 'Mighty Rage Potion up to', potionMaxRage.help, potionMaxRage.default, ids.potionEnabled, 'Consumables'),
  {
    kind: 'toggle',
    id: ids.jujuEnabled,
    group: 'Consumables',
    label: 'Juju Flurry',
    help: 'Use it on cooldown from the pull: +3% attack speed for 20 s, every minute.',
    default: true,
    requiresBuff: JUJU_FLURRY,
  },
]

/**
 * Reads a setting: its saved value, or its default for this setup (classes/options.ts: a default
 * can follow the build's talents or another setting).
 */
export function reader(options: RotationOption[], values: Record<string, RotationValue>, talents: TalentRanks = new Map()) {
  const resolved = resolveRotationValues(options, values, talents)
  return {
    on: (id: string) => Boolean(resolved[id]),
    num: (id: string) => Number(resolved[id]),
    str: (id: string) => String(resolved[id]),
  }
}
export type Reader = ReturnType<typeof reader>

export const IN_EXECUTE: RotationCondition = { code: COND.executePhase, a: 1, b: 0 }
export const NOT_IN_EXECUTE: RotationCondition = { code: COND.executePhase, a: 0, b: 0 }

export const timeLeftAtMost = (ms: number): RotationCondition => ({ code: COND.timeLeftAtMost, a: ms, b: 0 })
export const timeLeftAtLeast = (ms: number): RotationCondition => ({ code: COND.timeLeftAtLeast, a: ms, b: 0 })
/** The execute phase starts within `ms`, or has started (never true without one). */
export const executeWithin = (ms: number): RotationCondition => ({ code: COND.executeWithin, a: ms, b: 0 })
/** The execute phase starts in more than `ms` (always true without one): `executeWithin`'s opposite. */
export const executeNotWithin = (ms: number): RotationCondition => ({ code: COND.executeNotWithin, a: ms, b: 0 })
export const minRage = (tenths: number): RotationCondition => ({ code: COND.minRage, a: tenths, b: 0 })
export const maxRage = (rage: number): RotationCondition => ({ code: COND.maxRage, a: toTenths(rage), b: 0 })
/** GCD-safe for the abilities in `mask` over `gcdMs` (warrior.md §5.1), or no condition when there are none. */
export const gcdSafe = (mask: number, gcdMs = GCD_MS): RotationCondition[] => (mask ? [{ code: COND.gcdSafe, a: mask, b: gcdMs }] : [])
export const bit = (ability: number) => (ability >= 0 ? 1 << ability : 0)
/** The ability has been used this fight: its cooldown is running (Recklessness's 30 min outlasts any fight), or no condition for −1. */
export const usedAlready = (ability: number): RotationCondition[] => (ability >= 0 ? [{ code: COND.cooldownAtLeast, a: ability, b: 1 }] : [])
export const seconds = (v: Reader, id: string) => Math.round(v.num(id) * 1000)

/**
 * Builds a priority list: abilities are resolved with the build's talents (modifiers.ts) the first
 * time a line uses them, so their costs feed the conditions; the pre-pull and the procs the
 * rotation needs are collected alongside.
 */
export class RotationBuilder {
  readonly abilities: AbilityDef[] = []
  readonly rotation: RotationEntry[] = []
  readonly prepull: PrepullPlan = { casts: [], chargeTenths: 0, keepTenths: -1 }
  readonly procs: ProcSpec[] = []
  readonly assumes: RotationAssumption[] = []
  readonly talents: TalentRanks

  constructor(talents: TalentRanks) {
    this.talents = talents
  }

  /** The ability's index in `abilities`, resolved with the build's talents on first use. */
  ability(def: AbilityDef): number {
    const i = this.abilities.findIndex((a) => a.id === def.id)
    if (i >= 0) return i
    this.abilities.push(withTalents(def, this.talents))
    return this.abilities.length - 1
  }

  add(def: AbilityDef, conditions: RotationCondition[], unqueueBelowTenths = 0): number {
    const a = this.ability(def)
    this.rotation.push({ ability: a, conditions, unqueueBelowTenths })
    return a
  }

  /**
   * A stance-dance line: swap to `stance` for the ability, then back (warrior.md §7 "Stance
   * dancing"); with `stay`, the stance it's used in becomes the base stance for the rest of the
   * fight (Arms Recklessness, §5.3 row 4).
   */
  dance(def: AbilityDef, stance: number, conditions: RotationCondition[], stay = false): number {
    const a = this.ability(def)
    this.rotation.push({ ability: a, conditions, unqueueBelowTenths: 0, danceTo: stance, ...(stay ? { stay: true } : {}) })
    return a
  }

  /** A line that dances to `stance` when it's given, a plain line otherwise. */
  line(def: AbilityDef, stance: number, conditions: RotationCondition[]): number {
    return stance ? this.dance(def, stance, conditions) : this.add(def, conditions)
  }

  cost(a: number): number {
    return this.abilities[a].costTenths
  }

  /**
   * Lists `knownFightTimings` when a line is timed to the fight's end or its execute phase (Death
   * Wish, the racial synced with it, Recklessness, the potion; warrior.md §5.2 notes), with the
   * spec's measured `detail`: each fight's phase start and end are exact, where a player judges them.
   */
  assumeKnownTimings(detail: string): void {
    const timed = new Set<number>([COND.timeLeftAtMost, COND.timeLeftAtLeast, COND.executeWithin, COND.executeNotWithin])
    if (this.rotation.some((e) => e.conditions.some((c) => timed.has(c.code)))) this.assumes.push({ id: 'knownFightTimings', detail })
  }

  result(onUse: string[]): ClassRotation {
    return { abilities: this.abilities, rotation: this.rotation, prepull: this.prepull, onUse, procs: this.procs, assumes: this.assumes }
  }
}

/**
 * Battle Shout's upkeep line: when it's down, or has at most `refreshBelowSec` left and would end
 * before the fight does (the engine wakes the rotation then). With it on, the plan leaves out the
 * Buffs switch's static +139 (`classicEra`: +232), so the buff counts once (warrior.md §5.2
 * notes). The shout is the profile's (`battleShout`). True when it's on.
 */
export function battleShoutLine(b: RotationBuilder, v: Reader, ids: SharedIds, ctx: RotationContext): boolean {
  if (!v.on(ids.bsEnabled)) return false
  const bs = b.ability(battleShout(ctx.profile))
  b.rotation.push({ ability: bs, conditions: [{ code: COND.abilityAuraRefresh, a: bs, b: seconds(v, ids.bsRefresh) }], unqueueBelowTenths: 0 })
  return true
}

/**
 * Death Wish on cooldown (Fury row 2), only with the talent. With alignToEnd, a use is the final
 * one when no further use could start before the fight ends (time left ≤ cooldown); the final use
 * waits until the time left is at most its duration, so it lasts to the end (§5.2 notes). Lines
 * that any one of may fire: not the final use, or the final one at ≤ 30 s left, or (Fury, with
 * `beforeExecuteMs`) `beforeExecuteMs` before the execute phase starts, whichever comes first.
 * Returns Death Wish's index (−1 without it) and whether it's aligned.
 */
export function deathWishLines(b: RotationBuilder, v: Reader, ids: SharedIds, beforeExecuteMs?: number): { dw: number; align: boolean } {
  let dw = -1
  const align = v.on(ids.dwAlign)
  if (b.talents.has('Death Wish') && v.on(ids.dwEnabled)) {
    if (align) {
      dw = b.add(DEATH_WISH, [timeLeftAtLeast(DEATH_WISH.cooldownMs + 1)])
      b.add(DEATH_WISH, [timeLeftAtMost(DEATH_WISH.aura!.durationMs)])
      if (beforeExecuteMs !== undefined) b.add(DEATH_WISH, [executeWithin(beforeExecuteMs), timeLeftAtMost(DEATH_WISH.cooldownMs)])
    } else {
      dw = b.add(DEATH_WISH, [])
    }
  }
  return { dw, align }
}

/**
 * The racial cooldown and on-use trinkets (off the GCD; Fury row 3). Synced with Death Wish: while
 * Death Wish is up, or whenever Death Wish's next use is at least the cooldown away, so waiting
 * would cost a use: its cooldown left, or, for a final use held by alignToEnd, the time until 30 s
 * are left. That's so even when Fury's final Death Wish comes earlier, before the execute phase:
 * holding the racial for it as well measured worse (§5.2 notes). Without Death Wish (or the sync),
 * on cooldown.
 */
export function cooldownLines(b: RotationBuilder, v: Reader, ids: SharedIds, ctx: RotationContext, { dw, align }: { dw: number; align: boolean }): void {
  const sync = dw >= 0 && v.on(ids.cdSync)
  const dwDurationMs = DEATH_WISH.aura!.durationMs
  const withDeathWish = (def: AbilityDef) => {
    if (sync) {
      b.add(def, [{ code: COND.abilityAuraUp, a: dw, b: 0 }])
      b.add(def, [{ code: COND.cooldownAtLeast, a: dw, b: def.cooldownMs }])
      if (align) b.add(def, [timeLeftAtMost(DEATH_WISH.cooldownMs), timeLeftAtLeast(dwDurationMs + def.cooldownMs)])
    } else {
      b.add(def, [])
    }
  }
  const racial = RACIAL_COOLDOWNS[ctx.race]
  if (racial && v.on(ids.racialEnabled)) withDeathWish(racial)
  if (v.on(ids.trinketsEnabled)) for (const item of ctx.items) withDeathWish(onUseAbility(item))
}

/**
 * Recklessness once, at ≤ lastSec left (row 4; its 30 min cooldown outlasts any fight; Berserker
 * Stance only, which the engine checks). With `beforeExecuteMs` (Arms, §5.3 row 4), also that long
 * before the execute phase starts, whichever comes first: two lines, the first to hold uses it. From
 * another stance it's a dance to Berserker Stance that stays there for the rest of the fight (Arms).
 * Returns that dance's ability, whose swap caps rage (the Mighty Rage Potion waits for it,
 * `consumableLines`), or −1 without one. The ability is the profile's (`recklessness`).
 */
export function recklessnessLine(b: RotationBuilder, v: Reader, ids: SharedIds, ctx: RotationContext, danceAndStay = 0, beforeExecuteMs?: number): number {
  if (!v.on(ids.reckEnabled)) return -1
  const reck = recklessness(ctx.profile)
  const whens = [...(beforeExecuteMs === undefined ? [] : [[executeWithin(beforeExecuteMs)]]), [timeLeftAtMost(seconds(v, ids.reckLastSec))]]
  let a = -1
  for (const when of whens) a = danceAndStay ? b.dance(reck, danceAndStay, when, true) : b.add(reck, when)
  return danceAndStay ? a : -1
}

/** Bloodrage on cooldown (off the GCD) at rage ≤ maxRage (row 5). */
export function bloodrageLine(b: RotationBuilder, v: Reader, ids: SharedIds): void {
  if (v.on(ids.brEnabled)) b.add(BLOODRAGE, [maxRage(v.num(ids.brMaxRage))])
}

/** The Heroic Strike queue (off the GCD) at rage ≥ minRage, after `phase`; optional unqueue below a threshold. */
export function heroicStrikeLine(b: RotationBuilder, v: Reader, ids: SharedIds, phase: RotationCondition[]): void {
  if (!v.on(ids.hsEnabled)) return
  b.add(HEROIC_STRIKE, [...phase, minRage(toTenths(v.num(ids.hsMinRage)))], v.on(ids.hsUnqueue) ? toTenths(v.num(ids.hsUnqueueBelow)) : 0)
}

/**
 * The Mighty Rage Potion (off the GCD), once a fight, then Juju Flurry (off the GCD) on cooldown from
 * the pull. Each only when it's selected in Buffs.
 *
 * `potion` says how the spec times the potion (warrior.md §5.2 row 16, §5.3 row 17):
 * - `inPhase` (an execute phase, with the spec's Execute on): it's drunk in the phase at rage ≤
 *   maxRage, so its 45–75 rage fits under the cap; and in the phase's last `lastChanceMs` at rage ≤
 *   `fallbackMaxRage` (the build's cap minus 75), if it hasn't been drunk by then.
 * - Otherwise it's drunk in the last 20 s at rage ≤ `fallbackMaxRage`, and once `after` has been used
 *   if it's given: Recklessness, whose crits it joins (Fury) or whose swap from Battle Stance would
 *   cap its rage at 25 (Arms).
 * - With `inPhase` and `afterLeadMs` (Fury), `after` is timed that long before the phase or by its
 *   clock, whichever comes first. When the clock comes first (the phase is too short), the phase is
 *   still more than `afterLeadMs` away when `after` is used, and the potion goes with it, as without
 *   a phase; otherwise it stays in the phase (§5.2 row 16 and notes).
 * Its lines share one use a fight: the first whose conditions hold drinks it.
 */
export function consumableLines(
  b: RotationBuilder,
  v: Reader,
  ids: SharedIds,
  ctx: RotationContext,
  potion: { inPhase: boolean; fallbackMaxRage: number; lastChanceMs: number; after: number; afterLeadMs?: number },
): void {
  const use = ctx.consumables.find((c) => c.id === RAGE_POTION)
  if (use && v.on(ids.potionEnabled)) {
    const def = { ...onUseAbility(use), usesPerFight: 1 }
    const fallback = maxRage(potion.fallbackMaxRage)
    const withAfter = [timeLeftAtMost(POTION_NO_EXECUTE_LAST_MS), ...usedAlready(potion.after), fallback]
    if (potion.inPhase) {
      if (potion.afterLeadMs !== undefined && potion.after >= 0) b.add(def, [...withAfter, executeNotWithin(potion.afterLeadMs)])
      b.add(def, [IN_EXECUTE, maxRage(v.num(ids.potionMaxRage))])
      b.add(def, [IN_EXECUTE, timeLeftAtMost(potion.lastChanceMs), fallback])
    } else {
      b.add(def, withAfter)
    }
  }
  const juju = ctx.consumables.find((c) => c.id === JUJU_FLURRY)
  if (juju && v.on(ids.jujuEnabled)) b.add(onUseAbility(juju), [])
}

/**
 * Row 0: the pre-pull, in time order. The shout's rage came before the pull; Bloodrage's rage at
 * once is there at the pull and its ticks keep their phase. Charge's rage comes at the pull (15, +3
 * per Improved Charge rank); with `swapAfterCharge` (a spec that doesn't fight in Battle Stance,
 * where Charge is used), the swap to its stance keeps at most 10 + 3 per Improved Tactical Mastery
 * rank (§2.1, §2.3).
 */
export function prepullCasts(b: RotationBuilder, v: Reader, ids: SharedIds, ctx: RotationContext, shout: boolean, swapAfterCharge: boolean): void {
  if (shout && v.on(ids.prepullShout)) b.prepull.casts.push({ ability: b.ability(battleShout(ctx.profile)), atMs: PREPULL_SHOUT_MS })
  if (v.on(ids.prepullBloodrage)) b.prepull.casts.push({ ability: b.ability(BLOODRAGE), atMs: PREPULL_BLOODRAGE_MS })
  if (v.on(ids.prepullCharge)) {
    b.prepull.chargeTenths = CHARGE_RAGE_TENTHS + IMPROVED_CHARGE_TENTHS_PER_RANK * (b.talents.get('Improved Charge') ?? 0)
    if (swapAfterCharge) b.prepull.keepTenths = stanceSwapKeepTenths(b.talents, ctx.profile)
  }
}

/** Ids of the on-use items and consumables the rotations know how to use. */
export const onUseIds = (ctx: RotationContext): string[] => [
  ...ctx.items.map((i) => i.id),
  ...ctx.consumables.filter((c) => c.id === RAGE_POTION || c.id === JUJU_FLURRY).map((c) => c.id),
]
