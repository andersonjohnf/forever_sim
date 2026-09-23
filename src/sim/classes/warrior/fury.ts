// The Fury priority list and its settings (docs/classes/warrior.md §5.1, §5.2).
//
// This covers the execute phase (rows 6 and 7), Bloodthirst, Whirlwind, Heroic Strike and
// Hamstring (rows 8, 9, 11 and 12); the cooldowns, Battle Shout and the rest of the list come in
// M2.2b. Setting ids are `warrior.fury.<ability>.<param>` and every rage threshold is in absolute
// rage points (§5.1). Abilities are resolved with the build's talents (modifiers.ts) before
// their costs feed any condition.
import { GCD_MS, toTenths } from '../../core/formulas'
import { COND, type RotationCondition, type RotationEntry } from '../../plan/types'
import type { RotationOption } from '../../types'
import { type AbilityDef, BLOODTHIRST, EXECUTE, executeBreakEvenAp, HAMSTRING, HEROIC_STRIKE, WHIRLWIND } from './abilities'
import { type TalentRanks, withTalents } from './modifiers'

const ID = {
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
} as const

/** A rage threshold input: 0 to Fury's 130 cap (warrior.md §5.2, Boundless Rage 3/3). */
const rage = (id: string, label: string, help: string, def: number, dependsOn: string): RotationOption => ({
  kind: 'number',
  id,
  label,
  help,
  unit: 'rage',
  min: 0,
  max: 130,
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

/** Defaults from warrior.md §5.2's table (rows 6–9, 11, 12). */
export const FURY_OPTIONS: RotationOption[] = [
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
]

export interface ClassRotation {
  abilities: AbilityDef[]
  rotation: RotationEntry[]
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

/**
 * The Fury priority list from the settings (warrior.md §5.2). `talents` gates talent abilities
 * (Bloodthirst) and resolves costs, Impale and Raging Blows; `auraIndex` resolves an aura id in
 * the plan (−1 if the setup has none).
 */
export function furyRotation(
  values: Record<string, number | boolean>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
): ClassRotation {
  const v = reader(FURY_OPTIONS, values)
  const abilities: AbilityDef[] = []
  const rotation: RotationEntry[] = []
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

  return { abilities, rotation }
}
