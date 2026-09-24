// The druid's rotation builder (docs/classes/druid.md §6.2, §6.3): the warrior's, with each ability
// resolved by the druid's talents (modifiers.ts) rather than the warrior's. The cat and the bear
// share it.
import { RotationBuilder } from '../warrior/shared'
import type { AbilityDef } from './abilities'
import { withDruidTalents } from './modifiers'

/** Resolves abilities with the druid's talents (modifiers.ts) rather than the warrior's. */
export class DruidRotationBuilder extends RotationBuilder {
  override ability(def: AbilityDef): number {
    const i = this.abilities.findIndex((a) => a.id === def.id)
    if (i >= 0) return i
    this.abilities.push(withDruidTalents(def, this.talents))
    return this.abilities.length - 1
  }
}
