// The on-use items and consumables a paladin rotation presses, both specs' (docs/classes/paladin.md
// "Forever priority list (default)", the consumables rows; buffs doc §3.5): on-use trinkets and
// Juju Flurry on cooldown from the pull, and the mana potion and rune whenever the most they
// restore fits, a little early while another would still be ready before the fight ends.
import type { OnUseSpec } from '../../effects/types'
import { type AbilityDef, COND, type RotationCondition } from '../../plan/types'
import type { Reader } from '../warrior/shared'
import { PALADIN } from './abilities'
import type { PaladinContext } from './setup'

/** Buff catalogue ids of the consumables a paladin rotation uses (effects/buffs.ts): the mana potion and rune, and Juju Flurry. */
export const MANA_POTION = 'majorManaPotion'
export const MANA_RUNE = 'demonicRune'
export const JUJU_FLURRY = 'jujuFlurry'

/** An on-use item or consumable as a paladin `cast`: no cost, its cooldown, GCD and buff, its mana at once (buffs doc §3.5). */
export const consumable = (use: OnUseSpec): AbilityDef => ({
  ...PALADIN,
  id: use.id,
  name: use.name,
  icon: use.icon,
  kind: 'cast',
  cooldownMs: use.cooldownMs,
  gcdMs: use.gcdMs,
  aura: use.aura,
  manaTenths: use.manaTenths ?? 0,
  manaSpreadTenths: use.manaSpreadTenths ?? 0,
})

/** A spec's setting ids for them: a switch each, and the potion's and rune's "when missing" and "early, when missing" mana. */
export interface ConsumableSettings {
  trinkets: string
  juju: string
  manaPotion: string
  manaPotionMissing: string
  manaPotionEarly: string
  rune: string
  runeMissing: string
  runeEarly: string
}

/**
 * Adds the consumables' lines (`add`, in priority order, after the spec's own): each on-use trinket,
 * then Juju Flurry, off the GCD on cooldown from the pull (nothing in either rotation is worth
 * saving them for); then the mana potion and the rune, off the GCD, each once you're missing its
 * "when missing" mana, and before that once you're missing its "early" mana while another would be
 * ready before the fight ends (one more use in the fight). Returns what the rotation presses: the
 * on-use items and the selected consumables it has a line for, so the assumptions don't list them
 * as not simulated.
 */
export function paladinConsumables(
  v: Reader,
  ids: ConsumableSettings,
  ctx: PaladinContext,
  maxManaTenths: number,
  add: (def: AbilityDef, conditions: RotationCondition[]) => number,
): string[] {
  const pressed: string[] = ctx.items.map((i) => i.id)
  if (v.on(ids.trinkets)) for (const item of ctx.items) add(consumable(item), [])
  const juju = ctx.consumables.find((c) => c.id === JUJU_FLURRY)
  if (juju) {
    pressed.push(JUJU_FLURRY)
    if (v.on(ids.juju)) add(consumable(juju), [])
  }
  for (const [id, setting, missing, early] of [
    [MANA_POTION, ids.manaPotion, ids.manaPotionMissing, ids.manaPotionEarly],
    [MANA_RUNE, ids.rune, ids.runeMissing, ids.runeEarly],
  ] as const) {
    const use = ctx.consumables.find((c) => c.id === id)
    if (!use) continue
    pressed.push(id)
    if (!v.on(setting)) continue
    const missingAtLeast = (mana: number): RotationCondition => ({ code: COND.maxMana, a: maxManaTenths - 10 * mana, b: 0 })
    // Early, while another would be ready before the fight ends: one more use in the fight.
    if (v.num(early) > 0) add(consumable(use), [missingAtLeast(v.num(early)), { code: COND.timeLeftAtLeast, a: use.cooldownMs, b: 0 }])
    add(consumable(use), [missingAtLeast(v.num(missing))])
  }
  return pressed
}
