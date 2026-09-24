// The consumables every rotation uses the same way (buffs doc "On-use items and cooldown categories"):
// Greater Stoneshield Potion and EZ-Thro Dark Bomb, each on its category's cooldown from the pull.
// No spec times them around anything of its own, so the plan builder adds their lines to any
// spec's priority list (plan/build.ts), ahead of the spec's own; a spec whose rotation already
// presses one (its `onUse`) keeps its own line.
import type { OnUseSpec } from '../effects/types'
import { STANCE_ANY, type AbilityDef, type RotationEntry } from '../plan/types'
import { NO_STRIKE } from './warrior/abilities'
import type { ClassRotation } from './warrior/shared'

/** Buff catalogue ids of the consumables every rotation uses on cooldown (effects/buffs.ts). */
export const SHARED_CONSUMABLES: readonly string[] = ['greaterStoneshieldPotion', 'ezThroDarkBomb']

/**
 * A consumable as an ability: a `cast` that puts its buff on you (Greater Stoneshield's armor), or,
 * with a spell, a `spell` that casts it on the boss after its cast time (the bomb's Fire damage).
 * No cost, any stance or form, its category's cooldown.
 */
export function sharedConsumableAbility(use: OnUseSpec): AbilityDef {
  return {
    ...NO_STRIKE,
    id: use.id,
    name: use.name,
    icon: use.icon,
    ...(use.spell ? { kind: 'spell' as const, spellDef: use.spell } : {}),
    costTenths: 0,
    cooldownMs: use.cooldownMs,
    gcdMs: use.gcdMs,
    castMs: use.castMs ?? 0,
    castStopsSwings: use.castStopsSwings ?? false,
    stances: STANCE_ANY,
    aura: use.aura,
    rageTenths: use.rageTenths,
    rageSpreadTenths: use.rageSpreadTenths,
    rageTickTenths: 0,
    rageTicks: 0,
    rageTickMs: 0,
    usesPerFight: 0,
  }
}

/**
 * The rotation with a line for each selected shared consumable it doesn't press itself, first in
 * its priority list with no conditions: used whenever it's ready, from the pull. Their abilities go
 * after the spec's own, so the spec's ability indices (its conditions', its pre-pull's) stay put.
 */
export function withSharedConsumables(rotation: ClassRotation, consumables: readonly OnUseSpec[]): ClassRotation {
  const pressed = new Set(rotation.onUse)
  const uses = consumables.filter((c) => SHARED_CONSUMABLES.includes(c.id) && !pressed.has(c.id))
  if (uses.length === 0) return rotation
  const abilities = [...rotation.abilities]
  const lines: RotationEntry[] = uses.map((use) => {
    abilities.push(sharedConsumableAbility(use))
    return { ability: abilities.length - 1, conditions: [], unqueueBelowTenths: 0 }
  })
  return { ...rotation, abilities, rotation: [...lines, ...rotation.rotation], onUse: [...rotation.onUse, ...uses.map((u) => u.id)] }
}
