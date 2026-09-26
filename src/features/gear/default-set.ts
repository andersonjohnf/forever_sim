// The spec's default gear and talents, and how a setup compares with them (docs/ux.md "Gear";
// docs/architecture.md "Following the defaults"). A gear slot, or the talent build, that holds the
// spec's default for its race is the default's, not the player's: it follows the default when that
// changes (a newer default on load, the other faction's on a race change).
import type { Item } from '@/data/items/types'
import { itemsById } from '@/lib/items'
import {
  defaultConfig,
  defaultOffHand,
  defaultTalents,
  GEAR_SLOTS,
  isTwoHand,
  matchSupplies,
  normalizeConfig,
  uniqueConflicts,
  type EquippedItem,
  type GearSlot,
  type SimConfig,
  type SpecId,
} from '@/sim'
import { SLOT_LABEL } from './slots'

const cache = new Map<string, Readonly<SimConfig['gear']>>()

/**
 * The spec's default gear for a character of this race, as a loaded setup holds it: normalized, so
 * it compares equal to the gear of a setup that was never changed. Cached; don't change it.
 */
export function defaultGearFor(spec: SpecId, race: string): Readonly<SimConfig['gear']> {
  const key = `${spec}|${race}`
  let gear = cache.get(key)
  if (!gear) {
    gear = normalizeConfig(defaultConfig(spec, race)).config.gear
    cache.set(key, gear)
  }
  return gear
}

const offHands = new Map<string, EquippedItem | undefined>()

/**
 * The off hand that follows the defaults beside this main hand, the default's or the player's own
 * (`defaultOffHand`: none beside a two-hander, else the spec's best off hand for the race), as a
 * loaded setup holds it: normalized. One rule, so a race change or a new default never empties an
 * off hand beside a one-hander because the default set's main hand is a two-hander (gate step 6,
 * review finding EV2-1).
 */
export function defaultOffHandBeside(spec: SpecId, race: string, mainHand: EquippedItem | undefined): EquippedItem | undefined {
  const item = mainHand && itemsById.get(mainHand.itemId)
  if (item && isTwoHand(item)) return undefined
  const key = `${spec}|${race}`
  if (!offHands.has(key)) {
    const offHand = defaultOffHand(spec, race, null)
    offHands.set(key, offHand && normalizeConfig({ ...defaultConfig(spec, race), gear: { offHand } }).config.gear.offHand)
  }
  return offHands.get(key)
}

/** Whether two slots hold the same thing: the same item with the same enchant, or both nothing. */
export function sameEntry(a: EquippedItem | undefined, b: EquippedItem | undefined): boolean {
  return a?.itemId === b?.itemId && a?.enchantId === b?.enchantId
}

/** The slots, in paper-doll order, whose item or enchant isn't the spec's default for the race. */
export function slotsOffDefault(config: Pick<SimConfig, 'spec' | 'race' | 'gear'>): GearSlot[] {
  const defaults = defaultGearFor(config.spec, config.race)
  return GEAR_SLOTS.filter((slot) => !sameEntry(config.gear[slot], defaults[slot]))
}

/**
 * What equipping the default set (`defaults`) does to the slots that differ from it, for the Gear
 * tab's line (docs/ux.md "Gear"): an empty slot is filled, one holding something is replaced, and
 * one the default leaves empty is cleared, by name (a Fury warrior's ammo, an Arms off hand, a
 * Balance druid's ranged slot). "replaces that slot", "replaces both", "fills all 17", for a mix
 * "fills 2 empty slots and replaces the other 3", and with a slot cleared "replaces 3 slots and
 * clears Off hand" or "fills 15 empty slots, replaces 1 and clears Ammo and Quiver".
 */
export function equipEffect(gear: SimConfig['gear'], offSlots: readonly GearSlot[], defaults: Readonly<SimConfig['gear']>): string {
  const cleared = offSlots.filter((slot) => !defaults[slot])
  const rest = offSlots.filter((slot) => defaults[slot])
  const empty = rest.filter((slot) => !gear[slot]).length
  const held = rest.length - empty
  // A no-break space before each count keeps it with the word before it, so a wrapped line never
  // ends on "all", "fills", "replaces" or "the other" (docs/ux.md "Gear").
  const slots = (n: number) => (n === 1 ? 'slot' : 'slots')
  if (cleared.length) {
    const names = cleared.map((slot) => SLOT_LABEL[slot])
    const clears = `clears ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`}`
    if (rest.length === 0) return clears
    if (empty === 0) return `replaces\u00a0${held} ${slots(held)} and ${clears}`
    if (held === 0) return `fills\u00a0${empty} empty ${slots(empty)} and ${clears}`
    return `fills\u00a0${empty} empty ${slots(empty)}, replaces\u00a0${held} and ${clears}`
  }
  const count = (n: number) => (n === 1 ? 'that slot' : n === 2 ? 'both' : `all\u00a0${n}`)
  if (empty === 0) return `replaces ${count(held)}`
  if (held === 0) return `fills ${count(empty)}`
  return `fills\u00a0${empty} empty ${slots(empty)} and replaces the other${held === 1 ? '' : `\u00a0${held}`}`
}

/** The parts of a spec's setup that follow its defaults: gear slots, and whether the talent build. */
export interface Following {
  gear: GearSlot[]
  talents: boolean
}

/**
 * The parts of the setup that hold the spec's defaults for its race, so follow them. The off hand
 * follows while it holds the default beside the main hand worn (`defaultOffHandBeside`).
 */
export function following(config: SimConfig): Following {
  const offDefault = new Set(slotsOffDefault(config))
  const offHand = sameEntry(config.gear.offHand, defaultOffHandBeside(config.spec, config.race, config.gear.mainHand))
  return {
    gear: GEAR_SLOTS.filter((slot) => (slot === 'offHand' ? offHand : !offDefault.has(slot))),
    talents: config.talents === defaultTalents(config.spec),
  }
}

/**
 * The setup with the parts that follow the defaults set to the spec's current defaults for its race,
 * normalized, and whether that changed its gear or talents (when neither, the setup itself). The off
 * hand takes the default beside the main hand worn once the main hand is settled
 * (`defaultOffHandBeside`): none beside a two-hander, the spec's best off hand beside a one-hander. A
 * default item that can't go in beside the player's own (a Unique rule, or a two-hander with their
 * off hand) leaves that slot as it was, and `blocked` lists it: it still follows the default, so the
 * next load tries again (setup-store.ts keeps it in the save's `following` until the player changes it).
 */
export function followDefaults(
  config: SimConfig,
  follow: Following,
): { config: SimConfig; gear: boolean; talents: boolean; blocked: GearSlot[] } {
  const defaults = defaultGearFor(config.spec, config.race)
  const followed = new Set(follow.gear)
  const gear: SimConfig['gear'] = {}
  const worn: Partial<Record<GearSlot, Item>> = {}
  const put = (slot: GearSlot, entry: EquippedItem | undefined) => {
    const item = entry && itemsById.get(entry.itemId)
    if (!entry || !item) return
    gear[slot] = entry
    worn[slot] = item
  }
  // The player's own slots first: a default never displaces them.
  for (const slot of GEAR_SLOTS) if (!followed.has(slot)) put(slot, config.gear[slot])
  const blocked: GearSlot[] = []
  for (const slot of GEAR_SLOTS) {
    if (!followed.has(slot)) continue
    // GEAR_SLOTS puts the main hand before the off hand, so `gear.mainHand` is settled here.
    const next = slot === 'offHand' ? defaultOffHandBeside(config.spec, config.race, gear.mainHand) : defaults[slot]
    const item = next && itemsById.get(next.itemId)
    if (!next || !item) continue
    const isBlocked =
      uniqueConflicts(worn, slot, item).length > 0 ||
      (slot === 'mainHand' && isTwoHand(item) && !followed.has('offHand') && worn.offHand !== undefined)
    if (isBlocked) blocked.push(slot)
    put(slot, isBlocked ? config.gear[slot] : next)
  }
  // A hunter's own ranged weapon keeps the ammo, and the quiver or pouch, it fires (hunter.md §7.3).
  if (!followed.has('ranged') && (followed.has('ammo') || followed.has('quiver'))) {
    const matched = matchSupplies(gear, worn.ranged)
    for (const slot of ['ammo', 'quiver'] as const) if (followed.has(slot) && matched[slot]) gear[slot] = matched[slot]
  }
  const talents = follow.talents ? defaultTalents(config.spec) : config.talents
  const next = normalizeConfig({ ...config, gear, talents }).config
  const moved = { gear: GEAR_SLOTS.some((slot) => !sameEntry(next.gear[slot], config.gear[slot])), talents: next.talents !== config.talents }
  // Nothing moved: the same setup, so it saves and shares exactly as before.
  return { config: moved.gear || moved.talents ? next : config, ...moved, blocked }
}
