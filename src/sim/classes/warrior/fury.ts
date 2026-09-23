// The Fury priority list and its settings (docs/classes/warrior.md §5.1, §5.2).
//
// This covers the pre-pull (row 0), Battle Shout (row 1), the cooldowns (rows 2–5: Death Wish,
// the racial and on-use trinkets, Recklessness, Bloodrage), the execute phase (rows 6 and 7),
// Bloodthirst, Whirlwind, Heroic Strike and Hamstring (rows 8, 9, 11 and 12), Berserker Rage
// (row 13), the Mighty Rage Potion (row 16) and Juju Flurry (row 17). The Overpower dance, Sunder
// Armor and Slam (rows 10, 14 and 15, off by default) aren't simulated. Setting ids are
// `warrior.fury.<ability>.<param>` and every rage threshold is in absolute rage points (§5.1).
// Abilities are resolved with the build's talents (modifiers.ts) before their costs feed any
// condition.
import { GCD_MS, toTenths } from '../../core/formulas'
import type { OnUseSpec } from '../../effects/types'
import { COND, type PrepullPlan, type RotationCondition, type RotationEntry } from '../../plan/types'
import type { RotationOption } from '../../types'
import {
  type AbilityDef,
  BATTLE_SHOUT,
  BERSERKER_RAGE,
  BLOODRAGE,
  BLOODTHIRST,
  CHARGE_RAGE_TENTHS,
  DEATH_WISH,
  EXECUTE,
  executeBreakEvenAp,
  HAMSTRING,
  HEROIC_STRIKE,
  IMPROVED_CHARGE_TENTHS_PER_RANK,
  IMPROVED_TACTICAL_MASTERY_TENTHS_PER_RANK,
  onUseAbility,
  RACIAL_COOLDOWNS,
  RECKLESSNESS,
  TACTICAL_MASTERY_TENTHS,
  WHIRLWIND,
} from './abilities'
import { type TalentRanks, withTalents } from './modifiers'

const ID = {
  prepullShout: 'warrior.fury.prepull.battleShout',
  prepullBloodrage: 'warrior.fury.prepull.bloodrage',
  prepullCharge: 'warrior.fury.prepull.charge',
  bsEnabled: 'warrior.fury.battleShout.enabled',
  bsRefresh: 'warrior.fury.battleShout.refreshBelowSec',
  dwEnabled: 'warrior.fury.deathWish.enabled',
  dwAlign: 'warrior.fury.deathWish.alignToEnd',
  racialEnabled: 'warrior.fury.racial.enabled',
  trinketsEnabled: 'warrior.fury.trinkets.enabled',
  cdSync: 'warrior.fury.cooldowns.syncWithDeathWish',
  reckEnabled: 'warrior.fury.recklessness.enabled',
  reckLastSec: 'warrior.fury.recklessness.lastSec',
  brEnabled: 'warrior.fury.bloodrage.enabled',
  brMaxRage: 'warrior.fury.bloodrage.maxRage',
  bzEnabled: 'warrior.fury.berserkerRage.enabled',
  bzMaxRage: 'warrior.fury.berserkerRage.maxRage',
  exEnabled: 'warrior.fury.execute.enabled',
  exMinExtraRage: 'warrior.fury.execute.minExtraRage',
  exBtOverAp: 'warrior.fury.execute.btOverExecuteAp',
  exWhirlwind: 'warrior.fury.execute.whirlwindInExecute',
  exHeroicStrike: 'warrior.fury.execute.heroicStrikeInExecute',
  btEnabled: 'warrior.fury.bloodthirst.enabled',
  wwEnabled: 'warrior.fury.whirlwind.enabled',
  wwReserve: 'warrior.fury.whirlwind.reserve',
  wwBtCdMin: 'warrior.fury.whirlwind.btCdMinSec',
  hsEnabled: 'warrior.fury.heroicStrike.enabled',
  hsMinRage: 'warrior.fury.heroicStrike.minRage',
  hsUnqueue: 'warrior.fury.heroicStrike.unqueue',
  hsUnqueueBelow: 'warrior.fury.heroicStrike.unqueueBelow',
  hamEnabled: 'warrior.fury.hamstring.enabled',
  hamMinRage: 'warrior.fury.hamstring.minRage',
  hamFlurryDown: 'warrior.fury.hamstring.onlyWhenFlurryDown',
  potionEnabled: 'warrior.fury.ragePotion.enabled',
  potionMaxRage: 'warrior.fury.ragePotion.maxRage',
  jujuEnabled: 'warrior.fury.jujuFlurry.enabled',
} as const

/**
 * Setting ids that were renamed, old → new; normalizeConfig carries saved values over. The
 * racial's sync with Death Wish now covers on-use trinkets too (M2.2c).
 */
export const FURY_RENAMED_OPTIONS: Readonly<Record<string, string>> = {
  'warrior.fury.racial.syncWithDeathWish': ID.cdSync,
}

/** Row 0: Battle Shout 3 s and Bloodrage 1 s before the pull (warrior.md §5.2). */
export const PREPULL_SHOUT_MS = -3000
export const PREPULL_BLOODRAGE_MS = -1000

/**
 * Row 16 without an execute phase: the potion goes in the last 20 s, as long as its +60 Strength
 * lasts, so its buff and rage fall where the execute phase would have been (warrior.md §5.2
 * notes; an engine choice).
 */
export const POTION_NO_EXECUTE_LAST_MS = 20000

/** Buff catalogue ids of the consumables rows 16 and 17 use (effects/buffs.ts). */
const RAGE_POTION = 'mightyRagePotion'
const JUJU_FLURRY = 'jujuFlurry'

/** Fury’s rage cap with the default build (Boundless Rage 3/3, warrior.md §5.2); rage thresholds are absolute (§5.1). */
const FURY_MAX_RAGE = 130

/** A rage threshold input: 0 to Fury's 130 cap (warrior.md §5.2, Boundless Rage 3/3). */
const rage = (id: string, label: string, help: string, def: number, dependsOn: string): RotationOption => ({
  kind: 'number',
  id,
  label,
  help,
  unit: 'rage',
  min: 0,
  max: FURY_MAX_RAGE,
  step: 1,
  default: def,
  dependsOn,
})

/**
 * Bloodthirst over Execute from this AP: W11's break-even at the default build's Execute cost
 * (15, no Improved Execute), 2220. A static default: the option framework has no per-build
 * defaults, so an Improved Execute build should set its own (2434 at cost 10; warrior.md §5.2).
 */
const BT_OVER_EXECUTE_AP = Math.round(executeBreakEvenAp(EXECUTE.costTenths / 10))

/** Defaults from warrior.md §5.2's table (rows 0–9, 11–13, 16 and 17), in its priority order. */
export const FURY_OPTIONS: RotationOption[] = [
  {
    kind: 'toggle',
    id: ID.prepullShout,
    label: 'Battle Shout before the pull',
    help: 'Shout 3 s before the pull, so the fight starts with it up. Its rage comes from before the pull. Needs Battle Shout on.',
    default: true,
    dependsOn: ID.bsEnabled,
  },
  {
    kind: 'toggle',
    id: ID.prepullBloodrage,
    label: 'Bloodrage before the pull',
    help: 'Use Bloodrage 1 s before the pull: its 10 rage is there at the pull, and it’s ready again 59 s in.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.prepullCharge,
    label: 'Charge in',
    help: 'Open with Charge for 15 rage (+3 per Improved Charge rank). The swap to Berserker Stance then keeps at most 10 + 3 per Improved Tactical Mastery rank.',
    default: false,
  },
  {
    kind: 'toggle',
    id: ID.bsEnabled,
    label: 'Battle Shout',
    help: 'Keep your own Battle Shout up: +139 attack power for 10 rage a shout. While this is on, the Buffs tab’s Battle Shout adds nothing more, since it’s the same buff.',
    default: true,
    maintainsBuff: 'battleShout',
  },
  {
    kind: 'number',
    id: ID.bsRefresh,
    label: 'Shout again with',
    help: 'Refresh it when this much of it is left, unless the fight ends first.',
    unit: 's left',
    min: 0,
    max: 30,
    step: 1,
    default: 3,
    dependsOn: ID.bsEnabled,
  },
  {
    kind: 'toggle',
    id: ID.dwEnabled,
    label: 'Death Wish',
    help: 'Use Death Wish for +20% physical damage for 30 s. Needs the Death Wish talent.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.dwAlign,
    label: 'Save the last Death Wish for the end',
    help: 'When no later Death Wish would fit in the fight, hold the last one until 30 s are left. Earlier ones go on cooldown.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.racialEnabled,
    label: 'Racial cooldown',
    help: 'Use your race’s cooldown: Blood Fury (Orc), Berserking (Troll) or Elune’s Light (Night Elf). Gnome Eureka! isn’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.trinketsEnabled,
    label: 'On-use trinkets',
    help: 'Use Weakness Analyzer if you wear it: +5% crit until your next crit, for up to 20 s. Other on-use trinkets aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.cdSync,
    label: 'Racial and trinkets with Death Wish',
    help: 'Save them for Death Wish, unless Death Wish is too far off for them to be ready again by then.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.reckEnabled,
    label: 'Recklessness',
    help: 'Use Recklessness once, near the end of the fight, for +100% crit chance for 15 s.',
    default: true,
  },
  {
    kind: 'number',
    id: ID.reckLastSec,
    label: 'Recklessness in the last',
    help: 'Use it once this much of the fight is left.',
    unit: 's',
    min: 1,
    max: 300,
    step: 1,
    default: 15,
    dependsOn: ID.reckEnabled,
  },
  {
    kind: 'toggle',
    id: ID.brEnabled,
    label: 'Bloodrage',
    help: 'Use Bloodrage on cooldown: 10 rage, then 10 more over 10 s (50% more with Improved Bloodrage 2/2).',
    default: true,
  },
  rage(
    ID.brMaxRage,
    'Bloodrage up to',
    `Use it only at or below this much rage, so its rage isn’t lost at the cap. ${FURY_MAX_RAGE - 20} is the 130 cap minus 20.`,
    FURY_MAX_RAGE - 20,
    ID.brEnabled,
  ),
  {
    kind: 'toggle',
    id: ID.exEnabled,
    label: 'Execute',
    help: 'In the execute phase, use Execute on every global cooldown in place of the rest of the rotation.',
    default: true,
  },
  rage(
    ID.exMinExtraRage,
    'Execute: wait for extra rage',
    'Use Execute only with at least this much rage on top of its cost. Each extra rage adds 15 damage.',
    0,
    ID.exEnabled,
  ),
  {
    kind: 'number',
    id: ID.exBtOverAp,
    label: 'Bloodthirst over Execute from',
    help: `In the execute phase, keep using Bloodthirst at or above this attack power. ${BT_OVER_EXECUTE_AP} is the break-even at Execute’s 15 rage cost; use 2434 with Improved Execute 2/2.`,
    unit: 'AP',
    min: 0,
    max: 5000,
    step: 1,
    default: BT_OVER_EXECUTE_AP,
    dependsOn: ID.exEnabled,
  },
  {
    kind: 'toggle',
    id: ID.exWhirlwind,
    label: 'Whirlwind in the execute phase',
    help: 'Keep Whirlwind in the execute phase. It gets a global cooldown only while Execute waits for extra rage.',
    default: false,
  },
  {
    kind: 'toggle',
    id: ID.exHeroicStrike,
    label: 'Heroic Strike in the execute phase',
    help: 'Keep queueing Heroic Strike in the execute phase. Off: a queued one is cancelled when the phase starts.',
    default: false,
  },
  {
    kind: 'toggle',
    id: ID.btEnabled,
    label: 'Bloodthirst',
    help: 'Use Bloodthirst whenever it’s ready. Needs the Bloodthirst talent.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.wwEnabled,
    label: 'Whirlwind',
    help: 'Use Whirlwind whenever it’s ready and Bloodthirst isn’t about to be.',
    default: true,
  },
  rage(ID.wwReserve, 'Whirlwind rage reserve', 'Rage to keep on top of Whirlwind’s cost.', 0, ID.wwEnabled),
  {
    kind: 'number',
    id: ID.wwBtCdMin,
    label: 'Whirlwind: Bloodthirst cooldown left',
    help: 'Use Whirlwind only while Bloodthirst has at least this long left to wait.',
    unit: 's',
    min: 0,
    max: 6,
    step: 0.1,
    default: 1.5,
    dependsOn: ID.wwEnabled,
  },
  {
    kind: 'toggle',
    id: ID.hsEnabled,
    label: 'Heroic Strike',
    help: 'Queue Heroic Strike on the next main-hand swing when rage is high.',
    default: true,
  },
  rage(ID.hsMinRage, 'Heroic Strike from', 'Queue it at or above this much rage.', 42, ID.hsEnabled),
  {
    kind: 'toggle',
    id: ID.hsUnqueue,
    label: 'Cancel Heroic Strike on low rage',
    help: 'Unqueue Heroic Strike if rage drops below a threshold before the swing.',
    default: false,
  },
  rage(ID.hsUnqueueBelow, 'Cancel Heroic Strike below', 'Unqueue it when rage falls below this.', 20, ID.hsUnqueue),
  {
    kind: 'toggle',
    id: ID.hamEnabled,
    label: 'Hamstring filler',
    help: 'Use Hamstring to fish for procs while Bloodthirst and Whirlwind are cooling down.',
    default: true,
  },
  rage(ID.hamMinRage, 'Hamstring from', 'Use it at or above this much rage.', 60, ID.hamEnabled),
  {
    kind: 'toggle',
    id: ID.hamFlurryDown,
    label: 'Hamstring only without Flurry',
    help: 'Use Hamstring only while Flurry is down.',
    default: false,
  },
  {
    kind: 'toggle',
    id: ID.bzEnabled,
    label: 'Berserker Rage',
    help: 'Use Berserker Rage on cooldown for rage while Bloodthirst and Whirlwind are cooling down. Needs Improved Berserker Rage.',
    default: true,
  },
  rage(
    ID.bzMaxRage,
    'Berserker Rage up to',
    `Use it only at or below this much rage. ${FURY_MAX_RAGE - 10} is the 130 cap minus 10.`,
    FURY_MAX_RAGE - 10,
    ID.bzEnabled,
  ),
  {
    kind: 'toggle',
    id: ID.potionEnabled,
    label: 'Mighty Rage Potion',
    help: 'Drink it once, at the start of the execute phase (in the last 20 s if there’s none): 45–75 rage and +60 Strength for 20 s.',
    default: true,
    requiresBuff: RAGE_POTION,
  },
  rage(
    ID.potionMaxRage,
    'Mighty Rage Potion up to',
    `Drink it only at or below this much rage, so none of its rage is lost at the cap. ${FURY_MAX_RAGE - 75} is the 130 cap minus 75.`,
    FURY_MAX_RAGE - 75,
    ID.potionEnabled,
  ),
  {
    kind: 'toggle',
    id: ID.jujuEnabled,
    label: 'Juju Flurry',
    help: 'Use it on cooldown from the pull: +3% attack speed for 20 s, every minute.',
    default: true,
    requiresBuff: JUJU_FLURRY,
  },
]

export interface ClassRotation {
  abilities: AbilityDef[]
  rotation: RotationEntry[]
  prepull: PrepullPlan
  /** Ids of the on-use items and consumables it knows how to use, whether or not its settings use them. */
  onUse: string[]
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
}

const NO_CONTEXT: RotationContext = { race: '', items: [], consumables: [], executePhase: true }

/**
 * Buff catalogue ids the rotation keeps up itself with these settings, so the plan drops the
 * Buffs switch's static version (Battle Shout, warrior.md §5.2 row 1 and notes).
 */
export function furyMaintainedBuffs(values: Record<string, number | boolean>): string[] {
  return reader(FURY_OPTIONS, values).on(ID.bsEnabled) ? ['battleShout'] : []
}

/** Reads a setting, falling back to its declared default. */
function reader(options: RotationOption[], values: Record<string, number | boolean>) {
  const byId = new Map(options.map((o) => [o.id, o]))
  return {
    on: (id: string) => Boolean(values[id] ?? byId.get(id)!.default),
    num: (id: string) => Number(values[id] ?? byId.get(id)!.default),
  }
}

const IN_EXECUTE: RotationCondition = { code: COND.executePhase, a: 1, b: 0 }
const NOT_IN_EXECUTE: RotationCondition = { code: COND.executePhase, a: 0, b: 0 }

const timeLeftAtMost = (ms: number): RotationCondition => ({ code: COND.timeLeftAtMost, a: ms, b: 0 })
const timeLeftAtLeast = (ms: number): RotationCondition => ({ code: COND.timeLeftAtLeast, a: ms, b: 0 })
const maxRage = (rage: number): RotationCondition => ({ code: COND.maxRage, a: toTenths(rage), b: 0 })
/** GCD-safe for the abilities in `mask` (warrior.md §5.1), or no condition when there are none. */
const gcdSafe = (mask: number): RotationCondition[] => (mask ? [{ code: COND.gcdSafe, a: mask, b: GCD_MS }] : [])
const bit = (ability: number) => (ability >= 0 ? 1 << ability : 0)

/**
 * The Fury priority list from the settings (warrior.md §5.2). `talents` gates talent abilities
 * (Death Wish, Bloodthirst, Improved Berserker Rage) and resolves costs, Impale, Raging Blows and
 * the talented rage of Bloodrage, Berserker Rage and Charge; `auraIndex` resolves an aura id in
 * the plan (−1 if the setup has none); `context` gives the race (its racial cooldown), the
 * equipped on-use items, the selected consumables and whether there's an execute phase.
 */
export function furyRotation(
  values: Record<string, number | boolean>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  context: Partial<RotationContext> = {},
): ClassRotation {
  const ctx = { ...NO_CONTEXT, ...context }
  const v = reader(FURY_OPTIONS, values)
  const abilities: AbilityDef[] = []
  const rotation: RotationEntry[] = []
  const prepull: PrepullPlan = { casts: [], chargeTenths: 0, keepTenths: -1 }
  /** The ability's index in `abilities`, resolved with the build's talents on first use. */
  const ability = (def: AbilityDef) => {
    const i = abilities.findIndex((a) => a.id === def.id)
    if (i >= 0) return i
    abilities.push(withTalents(def, talents))
    return abilities.length - 1
  }
  const add = (def: AbilityDef, conditions: RotationCondition[], unqueueBelowTenths = 0) => {
    const a = ability(def)
    rotation.push({ ability: a, conditions, unqueueBelowTenths })
    return a
  }
  const cost = (a: number) => abilities[a].costTenths

  const execute = v.on(ID.exEnabled)
  const useBt = talents.has('Bloodthirst') && v.on(ID.btEnabled)
  const btOverAp = v.num(ID.exBtOverAp)
  /** Lines that stop in the execute phase get this condition while Execute is on. */
  const outsideExecute = (keep: boolean): RotationCondition[] => (execute && !keep ? [NOT_IN_EXECUTE] : [])

  // Rows 1–5, 13, 16 and 17 apply in both phases (§5.2 notes). Their GCD-safe and time
  // conditions are checked by the engine, which wakes the rotation when a time-left condition
  // becomes true.

  // Row 1: Battle Shout when it's down, or has at most refreshBelowSec left and would end before
  // the fight does (the engine wakes the rotation then). With it on, the plan leaves out the
  // Buffs switch's static +139, so the buff counts once (§5.2 notes).
  const shout = v.on(ID.bsEnabled)
  if (shout) {
    const bs = ability(BATTLE_SHOUT)
    rotation.push({ ability: bs, conditions: [{ code: COND.abilityAuraRefresh, a: bs, b: Math.round(v.num(ID.bsRefresh) * 1000) }], unqueueBelowTenths: 0 })
  }

  // Row 2: Death Wish on cooldown. With alignToEnd, a use is the final one when no further use
  // could start before the fight ends (time left ≤ cooldown); the final use waits until the time
  // left is at most its duration, so it lasts to the end (§5.2 notes). Two lines, either of which
  // may fire: not the final use, or the final one at ≤ 30 s left.
  let dw = -1
  const align = v.on(ID.dwAlign)
  const dwDurationMs = DEATH_WISH.aura!.durationMs
  if (talents.has('Death Wish') && v.on(ID.dwEnabled)) {
    if (align) {
      dw = add(DEATH_WISH, [timeLeftAtLeast(DEATH_WISH.cooldownMs + 1)])
      add(DEATH_WISH, [timeLeftAtMost(dwDurationMs)])
    } else {
      dw = add(DEATH_WISH, [])
    }
  }

  // Row 3: the racial cooldown and on-use trinkets (off the GCD). Synced with Death Wish: while
  // Death Wish is up, or whenever Death Wish's next use is at least the cooldown away, so waiting
  // would cost a use: its cooldown left, or, for a final use held by alignToEnd, the time until
  // 30 s are left (§5.2 notes).
  const sync = dw >= 0 && v.on(ID.cdSync)
  const withDeathWish = (def: AbilityDef) => {
    if (sync) {
      add(def, [{ code: COND.abilityAuraUp, a: dw, b: 0 }])
      add(def, [{ code: COND.cooldownAtLeast, a: dw, b: def.cooldownMs }])
      if (align) add(def, [timeLeftAtMost(DEATH_WISH.cooldownMs), timeLeftAtLeast(dwDurationMs + def.cooldownMs)])
    } else {
      add(def, [])
    }
  }
  const racial = RACIAL_COOLDOWNS[ctx.race]
  if (racial && v.on(ID.racialEnabled)) withDeathWish(racial)
  if (v.on(ID.trinketsEnabled)) for (const item of ctx.items) withDeathWish(onUseAbility(item))

  // Row 4: Recklessness once, at ≤ lastSec left (its 30 min cooldown outlasts any fight; Berserker
  // Stance only, which the engine checks).
  if (v.on(ID.reckEnabled)) add(RECKLESSNESS, [timeLeftAtMost(Math.round(v.num(ID.reckLastSec) * 1000))])

  // Row 5: Bloodrage on cooldown (off the GCD) at rage ≤ maxRage.
  if (v.on(ID.brEnabled)) add(BLOODRAGE, [maxRage(v.num(ID.brMaxRage))])

  // Row 6: in the execute phase, Bloodthirst only at AP ≥ btOverExecuteAp (the engine checks its cost).
  let bt = -1
  if (execute && useBt) bt = add(BLOODTHIRST, [IN_EXECUTE, { code: COND.apAtLeast, a: btOverAp, b: 0 }])

  // Row 7: Execute on every GCD at rage ≥ cost + minExtraRage (the engine allows it only in the phase).
  if (execute) add(EXECUTE, [{ code: COND.minRage, a: cost(ability(EXECUTE)) + toTenths(v.num(ID.exMinExtraRage)), b: 0 }])

  // Row 8: Bloodthirst on cooldown outside the execute phase.
  if (useBt) bt = add(BLOODTHIRST, outsideExecute(false))

  // Row 9: Whirlwind, rage ≥ cost + reserve, Bloodthirst cooldown ≥ btCdMinSec. In the execute
  // phase (if allowed) the Bloodthirst wait applies only while row 6 uses Bloodthirst (AP ≥ btOverExecuteAp).
  let ww = -1
  if (v.on(ID.wwEnabled)) {
    const minRage: RotationCondition = { code: COND.minRage, a: cost(ability(WHIRLWIND)) + toTenths(v.num(ID.wwReserve)), b: 0 }
    const btWait: RotationCondition[] = bt >= 0 ? [{ code: COND.cooldownAtLeast, a: bt, b: Math.round(v.num(ID.wwBtCdMin) * 1000) }] : []
    const inExecute = execute && v.on(ID.exWhirlwind)
    if (inExecute && bt >= 0) {
      ww = add(WHIRLWIND, [NOT_IN_EXECUTE, minRage, ...btWait])
      add(WHIRLWIND, [IN_EXECUTE, { code: COND.apAtLeast, a: btOverAp, b: 0 }, minRage, ...btWait])
      add(WHIRLWIND, [IN_EXECUTE, { code: COND.apBelow, a: btOverAp, b: 0 }, minRage])
    } else {
      ww = add(WHIRLWIND, [...outsideExecute(inExecute), minRage, ...btWait])
    }
  }

  // Row 11: Heroic Strike queue (off the GCD), rage ≥ minRage; optional unqueue below a threshold.
  if (v.on(ID.hsEnabled)) {
    add(
      HEROIC_STRIKE,
      [...outsideExecute(v.on(ID.exHeroicStrike)), { code: COND.minRage, a: toTenths(v.num(ID.hsMinRage)), b: 0 }],
      v.on(ID.hsUnqueue) ? toTenths(v.num(ID.hsUnqueueBelow)) : 0,
    )
  }

  // Row 12: Hamstring filler, rage ≥ minRage, Bloodthirst and Whirlwind GCD-safe, optionally Flurry
  // down; never in the execute phase, where the GCDs are Execute's.
  if (v.on(ID.hamEnabled)) {
    const mask = (bt >= 0 ? 1 << bt : 0) | (ww >= 0 ? 1 << ww : 0)
    const conditions: RotationCondition[] = [...outsideExecute(false), { code: COND.minRage, a: toTenths(v.num(ID.hamMinRage)), b: 0 }]
    if (mask) conditions.push({ code: COND.gcdSafe, a: mask, b: GCD_MS })
    if (v.on(ID.hamFlurryDown)) conditions.push({ code: COND.auraDown, a: auraIndex('flurry'), b: 0 })
    add(HAMSTRING, conditions)
  }

  // Row 13: Berserker Rage, only with Improved Berserker Rage (without it the sim has nothing for
  // it to do): on cooldown at rage ≤ maxRage, GCD-safe for Bloodthirst and Whirlwind. In the
  // execute phase it's GCD-safe for what the phase uses, as Whirlwind's wait is (row 9): Bloodthirst
  // only at AP ≥ btOverExecuteAp, Whirlwind only with whirlwindInExecute. Execute has no cooldown,
  // so it isn't part of it; Berserker Rage gets a GCD there only while Execute waits for rage.
  if (talents.has('Improved Berserker Rage') && v.on(ID.bzEnabled)) {
    const limit = maxRage(v.num(ID.bzMaxRage))
    if (!execute) {
      add(BERSERKER_RAGE, [...gcdSafe(bit(bt) | bit(ww)), limit])
    } else {
      add(BERSERKER_RAGE, [NOT_IN_EXECUTE, ...gcdSafe(bit(bt) | bit(ww)), limit])
      const wwIn = v.on(ID.wwEnabled) && v.on(ID.exWhirlwind) ? bit(ww) : 0
      if (bt >= 0) {
        add(BERSERKER_RAGE, [IN_EXECUTE, { code: COND.apAtLeast, a: btOverAp, b: 0 }, ...gcdSafe(bit(bt) | wwIn), limit])
        add(BERSERKER_RAGE, [IN_EXECUTE, { code: COND.apBelow, a: btOverAp, b: 0 }, ...gcdSafe(wwIn), limit])
      } else {
        add(BERSERKER_RAGE, [IN_EXECUTE, ...gcdSafe(wwIn), limit])
      }
    }
  }

  // Row 16: the Mighty Rage Potion (off the GCD), once a fight, from the start of the execute
  // phase (or in the last 20 s without one), at rage ≤ maxRage so its 45–75 rage fits under the
  // cap. Only when it's selected in Buffs.
  const potion = ctx.consumables.find((c) => c.id === RAGE_POTION)
  if (potion && v.on(ID.potionEnabled)) {
    const when = ctx.executePhase ? IN_EXECUTE : timeLeftAtMost(POTION_NO_EXECUTE_LAST_MS)
    add({ ...onUseAbility(potion), usesPerFight: 1 }, [when, maxRage(v.num(ID.potionMaxRage))])
  }

  // Row 17: Juju Flurry (off the GCD) on cooldown from the pull, when it's selected in Buffs.
  const juju = ctx.consumables.find((c) => c.id === JUJU_FLURRY)
  if (juju && v.on(ID.jujuEnabled)) add(onUseAbility(juju), [])

  // Row 0: the pre-pull, in time order. The shout's rage came before the pull; Bloodrage's rage
  // at once is there at the pull and its ticks keep their phase. Charge's rage comes at the pull,
  // and the swap to Berserker Stance keeps at most 10 + 3 per Improved Tactical Mastery rank
  // (§2.1, §2.3).
  if (shout && v.on(ID.prepullShout)) prepull.casts.push({ ability: ability(BATTLE_SHOUT), atMs: PREPULL_SHOUT_MS })
  if (v.on(ID.prepullBloodrage)) prepull.casts.push({ ability: ability(BLOODRAGE), atMs: PREPULL_BLOODRAGE_MS })
  if (v.on(ID.prepullCharge)) {
    prepull.chargeTenths = CHARGE_RAGE_TENTHS + IMPROVED_CHARGE_TENTHS_PER_RANK * (talents.get('Improved Charge') ?? 0)
    prepull.keepTenths = TACTICAL_MASTERY_TENTHS + IMPROVED_TACTICAL_MASTERY_TENTHS_PER_RANK * (talents.get('Improved Tactical Mastery') ?? 0)
  }

  const onUse = [...ctx.items.map((i) => i.id), ...ctx.consumables.filter((c) => c.id === RAGE_POTION || c.id === JUJU_FLURRY).map((c) => c.id)]
  return { abilities, rotation, prepull, onUse }
}
