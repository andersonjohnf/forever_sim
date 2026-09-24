// The ranged weapon, as the plan builder resolves it (docs/mechanics/ranged-and-pets.md §2–§5, §12).
//
// A spec whose SpecMeta says `ranged` fights with the Gear tab's ranged weapon: `rangedPlan` turns
// the item, its weapon skill and the setup's ranged effects (a scope, ammo, a quiver, a ranged
// talent) into the plan's `RangedPlan`, the numbers Auto Shot and the shots read.
import type { Item } from '@/data/items/types'
import type { RangedPlan } from './types'

/**
 * Auto Shot's rules (docs/mechanics/ranged-and-pets.md §3, §4): the 0.5 s wind-up at the end of each
 * cycle [C], not shortened by ranged haste [?]; a cast or channel holds it back (Classic Era's
 * clipping) [C], though Forever testers report Auto Shot firing through casts [?]; normalized shots
 * use 2.8 s [?]; the first shot at the pull, as a melee swing's [?]; a crit ×2 [F].
 */
export const AUTO_SHOT = {
  windupMs: 500,
  windupHasted: false,
  castsHoldAutoShot: true,
  normalizedSpeed: 2.8,
  firstShotMs: 0,
  critMultiplier: 2,
} as const

/** The ranged weapon types Auto Shot fires (Auto Shot 75's SpellEquippedItems: bows, guns, crossbows; §2) [F]; thrown weapons too [?]. */
export const RANGED_WEAPONS = ['bow', 'gun', 'crossbow', 'thrown'] as const

/** Whether an item is a ranged weapon Auto Shot fires (§1): a bow, gun, crossbow or thrown weapon with damage. Not a wand. */
export function isRangedWeapon(item: Item | undefined): item is Item & { weapon: NonNullable<Item['weapon']> } {
  const w = item?.weapon
  return !!item && !!w && w.min !== null && w.max !== null && !!item.weaponType && (RANGED_WEAPONS as readonly string[]).includes(item.weaponType)
}

/**
 * What the setup's effects add to the ranged weapon (effects/types.ts `ranged`, summed): hit % and
 * crit % for its attacks only, damage % (multiplied), ranged haste % (multiplied: quivers and ammo
 * pouches, aura 557), flat damage per shot (a scope) and the ammo's damage per second (§3).
 */
export interface RangedMods {
  hit: number
  crit: number
  damageMult: number
  hasteMult: number
  flatDamage: number
  ammoDps: number
}

export const noRangedMods = (): RangedMods => ({ hit: 0, crit: 0, damageMult: 1, hasteMult: 1, flatDamage: 0, ammoDps: 0 })

/**
 * The plan's ranged weapon (docs/mechanics/ranged-and-pets.md §2–§4), or null when the item isn't a
 * ranged weapon with damage: its roll and speed, the ammo's DPS × its speed and a scope's damage
 * added to each shot [?], its skill (5 × level plus its type's bonuses), and the rules of AUTO_SHOT.
 */
export function rangedPlan(item: Item | undefined, skill: number, mods: RangedMods, source: number): RangedPlan | null {
  const w = item?.weapon
  if (!isRangedWeapon(item) || !w || w.min === null || w.max === null) return null
  return {
    name: item.name,
    icon: item.icon,
    min: w.min,
    max: w.max,
    speedSec: w.speed,
    // docs/mechanics/ranged-and-pets.md §3: ammo adds its DPS × the weapon's real speed to every shot [?].
    flatDamage: mods.flatDamage + mods.ammoDps * w.speed,
    skill,
    hitBonus: mods.hit,
    critBonus: mods.crit,
    damageMult: mods.damageMult,
    hasteMult: mods.hasteMult,
    normalizedSpeed: AUTO_SHOT.normalizedSpeed,
    windupMs: AUTO_SHOT.windupMs,
    windupHasted: AUTO_SHOT.windupHasted,
    castsHoldAutoShot: AUTO_SHOT.castsHoldAutoShot,
    critMultiplier: AUTO_SHOT.critMultiplier,
    firstShotMs: AUTO_SHOT.firstShotMs,
    source,
  }
}
