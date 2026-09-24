// The consumables every rotation uses the same way (buffs doc "On-use items and cooldown categories"):
// Greater Stoneshield Potion and EZ-Thro Dark Bomb, each on its category's cooldown from the pull
// (the bomb, for a spec that swings, from its first main-hand swing: §3.7).
// No spec times them around anything of its own, so the plan builder adds their lines to any
// spec's priority list (plan/build.ts), ahead of the spec's own; a spec whose rotation already
// presses one (its `onUse`) keeps its own line.
import type { OnUseSpec } from '../effects/types'
import { COND, STANCE_ANY, type AbilityDef, type RotationEntry } from '../plan/types'
import { SPEC_META } from '../specs'
import type { SpecId } from '../types'
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
    ...(use.castHoldsOffGcd ? { castHoldsOffGcd: true } : {}),
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

/** Whether the spec swings in melee: not a caster, not a hunter (whose melee weapons never swing). */
export const swingsInMelee = (spec: SpecId): boolean => !SPEC_META[spec].caster && !SPEC_META[spec].ranged

/**
 * What a throw that stops your swings holds for this spec, as the Buffs tab and the results say it
 * (buffs doc §3.7, review CV-2): a melee spec's swings, a caster's next cast, a hunter's Auto Shot.
 */
export function throwHolds(spec: SpecId): string {
  if (SPEC_META[spec].ranged) return 'holds your Auto Shot'
  return SPEC_META[spec].caster ? 'holds your next cast' : 'stops your melee swings'
}

/**
 * The start of the results' `explosiveThrow` assumption for this spec (buffs doc §3.7): when it's
 * thrown and what its throw holds; a caster or hunter is assumed within its 15 yd range.
 */
export function explosiveThrowDetail(spec: SpecId): string {
  if (swingsInMelee(spec))
    return `EZ-Thro Dark Bomb is thrown on cooldown: the first just after your first main-hand swing, the rest as it’s ready, wherever the swing timer is. Its 1 s throw ${throwHolds(spec)}, which start again from a full swing when it lands, and holds your other abilities until then. So the melee it costs here is an upper bound: a throw right after a swing costs less.`
  return `EZ-Thro Dark Bomb is thrown on cooldown from the pull, from within its 15 yd range. Its 1 s throw ${throwHolds(spec)} and your other abilities until it lands.`
}

/**
 * The rotation with a line for each selected shared consumable it doesn't press itself, first in
 * its priority list: used whenever it's ready, from the pull. For a spec that swings (`swings`), one
 * whose cast stops the swings (the bomb) waits for the fight's first main-hand swing, so the first
 * throw doesn't cancel the pull's swing (`COND.mainHandSwung`, review CV-5); later throws go on
 * cooldown, ignoring the swing timer (step 6 of review QC-1). Otherwise the line has no
 * conditions. Their abilities go after the spec's own, so the spec's ability indices (its
 * conditions', its pre-pull's) stay put.
 */
export function withSharedConsumables(rotation: ClassRotation, consumables: readonly OnUseSpec[], swings: boolean): ClassRotation {
  const pressed = new Set(rotation.onUse)
  const uses = consumables.filter((c) => SHARED_CONSUMABLES.includes(c.id) && !pressed.has(c.id))
  if (uses.length === 0) return rotation
  const abilities = [...rotation.abilities]
  const lines: RotationEntry[] = uses.map((use) => {
    abilities.push(sharedConsumableAbility(use))
    const afterFirstSwing = swings && use.castStopsSwings === true
    return { ability: abilities.length - 1, conditions: afterFirstSwing ? [{ code: COND.mainHandSwung, a: 0, b: 0 }] : [], unqueueBelowTenths: 0 }
  })
  return { ...rotation, abilities, rotation: [...lines, ...rotation.rotation], onUse: [...rotation.onUse, ...uses.map((u) => u.id)] }
}
