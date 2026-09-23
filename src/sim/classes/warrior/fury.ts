// The Fury priority list and its settings (docs/classes/warrior.md §5.1, §5.2).
//
// This covers the pre-pull (row 0), Battle Shout (row 1), the cooldowns (rows 2–5: Death Wish,
// the racial and on-use trinkets, Recklessness, Bloodrage), the execute phase (rows 6 and 7),
// Bloodthirst, Whirlwind, the Overpower stance dance, Heroic Strike and Hamstring (rows 8–12),
// Berserker Rage (row 13), Slam (row 15), the Mighty Rage Potion (row 16) and Juju Flurry (row 17).
// Rows 10 and 15 are off by default; Sunder Armor (row 14) isn't simulated. Setting ids are
// `warrior.fury.<ability>.<param>` and every rage threshold is in absolute rage points (§5.1).
// Abilities are resolved with the build's talents (modifiers.ts) before their costs feed any
// condition.
import { toTenths } from '../../core/formulas'
import { COND, type RotationCondition, STANCE } from '../../plan/types'
import type { RotationOption, RotationValue } from '../../types'
import {
  BERSERKER_RAGE,
  BLOODTHIRST,
  EXECUTE,
  executeBreakEvenAp,
  HAMSTRING,
  OVERPOWER,
  overpowerWindowProcs,
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
  cooldownLines,
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
  prepullCasts,
  prepullOptions,
  rageOption,
  reader,
  recklessnessLine,
  recklessnessOptions,
  RotationBuilder,
  type RotationContext,
  sharedIds,
  WARRIOR_MAX_RAGE,
} from './shared'

const ID = {
  ...sharedIds('fury'),
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
 * Bloodthirst over Execute from this AP: W11's break-even at the default build's Execute cost
 * (15, no Improved Execute), 2220. A static default: the option framework has no per-build
 * defaults, so an Improved Execute build should set its own (2434 at cost 10; warrior.md §5.2).
 */
const BT_OVER_EXECUTE_AP = Math.round(executeBreakEvenAp(EXECUTE.costTenths / 10))

/** Defaults from warrior.md §5.2's table (rows 0–13 and 15–17), in its priority order. */
export const FURY_OPTIONS: RotationOption[] = [
  ...prepullOptions(
    ID,
    'Open with Charge for 15 rage (+3 per Improved Charge rank). The swap to Berserker Stance then keeps at most 10 + 3 per Improved Tactical Mastery rank.',
  ),
  ...battleShoutOptions(ID),
  ...deathWishOptions(ID),
  ...cooldownOptions(ID),
  ...recklessnessOptions(ID, 'Use Recklessness once, near the end of the fight, for +100% crit chance for 15 s.'),
  ...bloodrageOptions(ID),
  {
    kind: 'toggle',
    id: ID.exEnabled,
    group: 'Execute phase',
    label: 'Execute',
    help: 'In the execute phase, use Execute on every global cooldown in place of the rest of the rotation.',
    default: true,
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
    kind: 'number',
    id: ID.exBtOverAp,
    group: 'Execute phase',
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
    help: 'Keep queueing Heroic Strike in the execute phase. Off: a queued one is cancelled when the phase starts.',
    default: false,
    dependsOn: ID.exEnabled,
  },
  {
    kind: 'toggle',
    id: ID.btEnabled,
    group: 'Core abilities',
    label: 'Bloodthirst',
    help: 'Use Bloodthirst whenever it’s ready. Needs the Bloodthirst talent.',
    default: true,
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
    default: 1.5,
    dependsOn: ID.wwEnabled,
  },
  {
    kind: 'toggle',
    id: ID.opEnabled,
    group: 'Fillers',
    label: 'Overpower (stance dance)',
    help: 'After the boss dodges, swap to Battle Stance for Overpower and back while Bloodthirst and Whirlwind are cooling down. Each swap keeps at most 10 rage, plus 3 per Improved Tactical Mastery rank.',
    default: false,
  },
  rageOption(
    ID.opMaxRage,
    'Overpower up to',
    'Dance only at or below this much rage, so the swap loses none. 25 is what a swap keeps with Improved Tactical Mastery 5/5.',
    25,
    ID.opEnabled,
    'Fillers',
  ),
  ...heroicStrikeOptions(ID, 42),
  {
    kind: 'toggle',
    id: ID.hamEnabled,
    group: 'Fillers',
    label: 'Hamstring filler',
    help: 'Use Hamstring to fish for procs while Bloodthirst and Whirlwind are cooling down.',
    default: true,
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
  ...consumableOptions(ID),
]

/**
 * Buff catalogue ids the rotation keeps up itself with these settings, so the plan drops the
 * Buffs switch's static version (Battle Shout, warrior.md §5.2 row 1 and notes).
 */
export function furyMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return reader(FURY_OPTIONS, values).on(ID.bsEnabled) ? ['battleShout'] : []
}

/**
 * The Fury priority list from the settings (warrior.md §5.2). `talents` gates talent abilities
 * (Death Wish, Bloodthirst, Improved Berserker Rage) and resolves costs, Impale, Raging Blows and
 * the talented rage of Bloodrage, Berserker Rage and Charge; `auraIndex` resolves an aura id in
 * the plan (−1 if the setup has none); `context` gives the race (its racial cooldown), the
 * equipped on-use items, the selected consumables and whether there's an execute phase.
 */
export function furyRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  context: Partial<RotationContext> = {},
): ClassRotation {
  const ctx = { ...NO_CONTEXT, ...context }
  const v = reader(FURY_OPTIONS, values, talents)
  const b = new RotationBuilder(talents)
  const cost = (a: number) => b.cost(a)

  const execute = v.on(ID.exEnabled)
  const useBt = talents.has('Bloodthirst') && v.on(ID.btEnabled)
  const btOverAp = v.num(ID.exBtOverAp)
  /** Lines that stop in the execute phase get this condition while Execute is on. */
  const outsideExecute = (keep: boolean): RotationCondition[] => (execute && !keep ? [NOT_IN_EXECUTE] : [])

  // Rows 1–5, 13, 16 and 17 apply in both phases (§5.2 notes). Their GCD-safe and time
  // conditions are checked by the engine, which wakes the rotation when a time-left condition
  // becomes true.

  // Row 1: Battle Shout (shared.ts).
  const shout = battleShoutLine(b, v, ID, ctx)

  // Row 2: Death Wish, and row 3: the racial and on-use trinkets synced with it (shared.ts).
  cooldownLines(b, v, ID, ctx, deathWishLines(b, v, ID))

  // Row 4: Recklessness once, at ≤ lastSec left (Berserker Stance only, Fury's base stance).
  recklessnessLine(b, v, ID)

  // Row 5: Bloodrage on cooldown (off the GCD) at rage ≤ maxRage.
  bloodrageLine(b, v, ID)

  // Row 6: in the execute phase, Bloodthirst only at AP ≥ btOverExecuteAp (the engine checks its cost).
  let bt = -1
  if (execute && useBt) bt = b.add(BLOODTHIRST, [IN_EXECUTE, { code: COND.apAtLeast, a: btOverAp, b: 0 }])

  // Row 7: Execute on every GCD at rage ≥ cost + minExtraRage (the engine allows it only in the phase).
  if (execute) b.add(EXECUTE, [{ code: COND.minRage, a: cost(b.ability(EXECUTE)) + toTenths(v.num(ID.exMinExtraRage)), b: 0 }])

  // Row 8: Bloodthirst on cooldown outside the execute phase.
  if (useBt) bt = b.add(BLOODTHIRST, outsideExecute(false))

  // Row 9: Whirlwind, rage ≥ cost + reserve, Bloodthirst cooldown ≥ btCdMinSec. In the execute
  // phase (if allowed) the Bloodthirst wait applies only while row 6 uses Bloodthirst (AP ≥ btOverExecuteAp).
  let ww = -1
  if (v.on(ID.wwEnabled)) {
    const minRage: RotationCondition = { code: COND.minRage, a: cost(b.ability(WHIRLWIND)) + toTenths(v.num(ID.wwReserve)), b: 0 }
    const btWait: RotationCondition[] = bt >= 0 ? [{ code: COND.cooldownAtLeast, a: bt, b: Math.round(v.num(ID.wwBtCdMin) * 1000) }] : []
    const inExecute = execute && v.on(ID.exWhirlwind)
    if (inExecute && bt >= 0) {
      ww = b.add(WHIRLWIND, [NOT_IN_EXECUTE, minRage, ...btWait])
      b.add(WHIRLWIND, [IN_EXECUTE, { code: COND.apAtLeast, a: btOverAp, b: 0 }, minRage, ...btWait])
      b.add(WHIRLWIND, [IN_EXECUTE, { code: COND.apBelow, a: btOverAp, b: 0 }, minRage])
    } else {
      ww = b.add(WHIRLWIND, [...outsideExecute(inExecute), minRage, ...btWait])
    }
  }

  /**
   * Lines for an ability that must leave Bloodthirst and Whirlwind GCD-safe (rows 10 and 13), with
   * `tail` after the GCD-safe condition. In the execute phase it stays GCD-safe for what the phase
   * uses, as Whirlwind's wait does (row 9): Bloodthirst only at AP ≥ btOverExecuteAp, Whirlwind only
   * with whirlwindInExecute (§5.2 notes). Execute has no cooldown, so it isn't part of it.
   */
  const safeInBothPhases = (tail: RotationCondition[]): RotationCondition[][] => {
    if (!execute) return [[...gcdSafe(bit(bt) | bit(ww)), ...tail]]
    const wwIn = v.on(ID.wwEnabled) && v.on(ID.exWhirlwind) ? bit(ww) : 0
    const lines = [[NOT_IN_EXECUTE, ...gcdSafe(bit(bt) | bit(ww)), ...tail]]
    if (bt >= 0) {
      lines.push(
        [IN_EXECUTE, { code: COND.apAtLeast, a: btOverAp, b: 0 }, ...gcdSafe(bit(bt) | wwIn), ...tail],
        [IN_EXECUTE, { code: COND.apBelow, a: btOverAp, b: 0 }, ...gcdSafe(wwIn), ...tail],
      )
    } else {
      lines.push([IN_EXECUTE, ...gcdSafe(wwIn), ...tail])
    }
    return lines
  }

  // Row 10: the Overpower stance dance (off by default): while the window a dodge opened is up,
  // Bloodthirst and Whirlwind are GCD-safe and rage ≤ maxRage (so the swap in loses none), swap to
  // Battle Stance, Overpower, and swap back when the swap cooldown allows (§2.1, §2.8, §7). It
  // applies in both phases, GCD-safe as row 13 is; in the execute phase it gets a GCD only while
  // Execute waits for rage. The window's openers come with it.
  if (v.on(ID.opEnabled)) {
    for (const conditions of safeInBothPhases([maxRage(v.num(ID.opMaxRage))])) b.dance(OVERPOWER, STANCE.battle, conditions)
    b.procs.push(...overpowerWindowProcs(talents))
  }

  // Row 11: Heroic Strike queue (off the GCD), rage ≥ minRage; optional unqueue below a threshold.
  heroicStrikeLine(b, v, ID, outsideExecute(v.on(ID.exHeroicStrike)))

  // Row 12: Hamstring filler, rage ≥ minRage, Bloodthirst and Whirlwind GCD-safe, optionally Flurry
  // down; never in the execute phase, where the GCDs are Execute's.
  if (v.on(ID.hamEnabled)) {
    const conditions: RotationCondition[] = [...outsideExecute(false), { code: COND.minRage, a: toTenths(v.num(ID.hamMinRage)), b: 0 }]
    conditions.push(...gcdSafe(bit(bt) | bit(ww)))
    if (v.on(ID.hamFlurryDown)) conditions.push({ code: COND.auraDown, a: auraIndex('flurry'), b: 0 })
    b.add(HAMSTRING, conditions)
  }

  // Row 13: Berserker Rage, only with Improved Berserker Rage (without it the sim has nothing for
  // it to do): on cooldown at rage ≤ maxRage, GCD-safe for Bloodthirst and Whirlwind. In the
  // execute phase it's GCD-safe for what the phase uses, as Whirlwind's wait is (row 9): Bloodthirst
  // only at AP ≥ btOverExecuteAp, Whirlwind only with whirlwindInExecute. Execute has no cooldown,
  // so it isn't part of it; Berserker Rage gets a GCD there only while Execute waits for rage.
  if (talents.has('Improved Berserker Rage') && v.on(ID.bzEnabled)) {
    for (const conditions of safeInBothPhases([maxRage(v.num(ID.bzMaxRage))])) b.add(BERSERKER_RAGE, conditions)
  }

  // Row 15: Slam (off by default), a filler like Hamstring: Bloodthirst and Whirlwind GCD-safe, and
  // never in the execute phase, where the GCDs are Execute's. Without Improved Slam its cast stops
  // the swings and resets both timers (§3.1 "Slam"); the engine checks its cost.
  if (v.on(ID.slamEnabled)) b.add(SLAM, [...outsideExecute(false), ...gcdSafe(bit(bt) | bit(ww))])

  // Rows 16 and 17: the Mighty Rage Potion from the start of the execute phase, and Juju Flurry on
  // cooldown, when they're selected in Buffs (shared.ts).
  consumableLines(b, v, ID, ctx)

  // Row 0: the pre-pull (shared.ts). Fury fights in Berserker Stance, so Charge's swap keeps at most
  // 10 + 3 per Improved Tactical Mastery rank (§2.1, §2.3).
  prepullCasts(b, v, ID, ctx, shout, true)

  return b.result(onUseIds(ctx))
}
