// The Fury priority list and its settings (docs/classes/warrior.md §5.1, §5.2).
//
// M2.1 covers Bloodthirst, Whirlwind, Heroic Strike and Hamstring (§5.2 rows 8, 9, 11 and 12);
// Execute, the cooldowns, Battle Shout and the rest of the list come in M2.2. Setting ids are
// `warrior.fury.<ability>.<param>` and every rage threshold is in absolute rage points (§5.1).
import { GCD_MS, toTenths } from '../../core/formulas'
import { COND, type RotationCondition, type RotationEntry } from '../../plan/types'
import type { RotationOption } from '../../types'
import { type AbilityDef, BLOODTHIRST, HAMSTRING, HEROIC_STRIKE, WHIRLWIND } from './abilities'

const ID = {
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

/** Defaults from warrior.md §5.2's table (rows 8, 9, 11, 12). */
export const FURY_OPTIONS: RotationOption[] = [
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

/**
 * The Fury priority list from the settings (warrior.md §5.2). `talents` gates talent abilities
 * (Bloodthirst); `auraIndex` resolves an aura id in the plan (−1 if the setup has none).
 */
export function furyRotation(
  values: Record<string, number | boolean>,
  talents: Map<string, number>,
  auraIndex: (id: string) => number,
): ClassRotation {
  const v = reader(FURY_OPTIONS, values)
  const abilities: AbilityDef[] = []
  const rotation: RotationEntry[] = []
  const add = (ability: AbilityDef, conditions: RotationCondition[], unqueueBelowTenths = 0) => {
    abilities.push(ability)
    rotation.push({ ability: abilities.length - 1, conditions, unqueueBelowTenths })
    return abilities.length - 1
  }

  // Row 8: Bloodthirst on cooldown, rage ≥ cost (the engine checks cost and cooldown).
  const bt = talents.has('Bloodthirst') && v.on(ID.btEnabled) ? add(BLOODTHIRST, []) : -1

  // Row 9: Whirlwind, rage ≥ cost + reserve, Bloodthirst cooldown ≥ btCdMinSec.
  let ww = -1
  if (v.on(ID.wwEnabled)) {
    const conditions: RotationCondition[] = [{ code: COND.minRage, a: WHIRLWIND.costTenths + toTenths(v.num(ID.wwReserve)), b: 0 }]
    if (bt >= 0) conditions.push({ code: COND.cooldownAtLeast, a: bt, b: Math.round(v.num(ID.wwBtCdMin) * 1000) })
    ww = add(WHIRLWIND, conditions)
  }

  // Row 11: Heroic Strike queue (off the GCD), rage ≥ minRage; optional unqueue below a threshold.
  if (v.on(ID.hsEnabled)) {
    add(
      HEROIC_STRIKE,
      [{ code: COND.minRage, a: toTenths(v.num(ID.hsMinRage)), b: 0 }],
      v.on(ID.hsUnqueue) ? toTenths(v.num(ID.hsUnqueueBelow)) : 0,
    )
  }

  // Row 12: Hamstring filler, rage ≥ minRage, Bloodthirst and Whirlwind GCD-safe, optionally Flurry down.
  if (v.on(ID.hamEnabled)) {
    const mask = (bt >= 0 ? 1 << bt : 0) | (ww >= 0 ? 1 << ww : 0)
    const conditions: RotationCondition[] = [{ code: COND.minRage, a: toTenths(v.num(ID.hamMinRage)), b: 0 }]
    if (mask) conditions.push({ code: COND.gcdSafe, a: mask, b: GCD_MS })
    if (v.on(ID.hamFlurryDown)) conditions.push({ code: COND.auraDown, a: auraIndex('flurry'), b: 0 })
    add(HAMSTRING, conditions)
  }

  return { abilities, rotation }
}
