// The automatic save follows the defaults (docs/architecture.md "Following the defaults"; docs/ux.md
// #persistence-and-sharing): what the player never changed takes the current defaults when the app
// loads, and what they changed stays theirs.
//
// Gear and talents are kept as overrides of the defaults, as rotation settings are: a gear slot, or
// the talent build, that holds the spec's default for its race when the setup is saved isn't the
// player's. The save lists those parts (`Following`), and the next load puts the defaults of the
// day in them. Only the automatic save does this: a share link, an imported code and a saved setup
// keep exactly what they carry.
import { factionOf, factionTwin } from '@/features/character/faction-gear'
import { sameEntry, type Following } from '@/features/gear/default-set'
import { itemsById } from '@/lib/items'
import { GEAR_SLOTS, SPEC_META, type EquippedItem, type GearSlot, type SimConfig, type SpecId } from '@/sim'
import { LEGACY_DEFAULTS, type LegacyEntry } from './legacy-defaults'

export { followDefaults, following, type Following } from '@/features/gear/default-set'

/** A save's `following`, read back: untrusted, so anything malformed is left out (and that spec migrates). */
export function readFollowing(input: unknown): Partial<Record<SpecId, Following>> {
  const out: Partial<Record<SpecId, Following>> = {}
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return out
  for (const [spec, value] of Object.entries(input as Record<string, unknown>)) {
    if (!Object.hasOwn(SPEC_META, spec) || typeof value !== 'object' || value === null) continue
    const { gear, talents } = value as { gear?: unknown; talents?: unknown }
    if (!Array.isArray(gear) || typeof talents !== 'boolean') continue
    out[spec as SpecId] = { gear: GEAR_SLOTS.filter((slot) => gear.includes(slot)), talents }
  }
  return out
}

/**
 * The defaults before saves said what follows them (2026-09-24), frozen: nothing here reads today's
 * defaults, so a save holding one of these keeps migrating however the defaults change later. The
 * snapshot (./legacy-defaults.ts, generated from ee171d2a, the last build deployed before
 * `following`) holds each spec's default talents, and for every race its default gear and v1's pick.
 * These tables add what came before it, from git history: the talent builds each spec's default
 * was, and the items the interim tank sets (INTERIM_GEAR) put in each slot, in any version, for either
 * faction. A save from then with one of these in a slot counts it as the default's.
 */
const FORMER_TALENTS: Partial<Record<SpecId, readonly string[]>> = {
  // warrior.md §6.1: 5/5/36, until P2's review (scripts/scrape/stored-builds.json)
  'warrior-protection': ['05-05-552001233201210531'],
  // druid.md §7.1: Feral Charge, 8/43/0
  'druid-feral-bear': ['050012-5523032120132210551-'],
  // paladin.md "Protection defaults": v1's popular build, 2/42/7, then T2's interim 2/37/12, then
  // the fix round's 0/38/13, ee171d2a's default (the snapshot has it too; listed here as well, since
  // it's the build most saves hold)
  'paladin-protection': ['2-4530513321301551-502', '2-4530013321301551-50205', '-0530513321301551-50215'],
  // warlock.md §11.6: Demonology before H3's review
  'warlock-demonology': ['-0325003231120001351-0350305003'],
}

const FORMER_GEAR: Partial<Record<SpecId, Partial<Record<GearSlot, readonly number[]>>>> = {
  'paladin-protection': {
    head: [12640],
    neck: [19426],
    shoulder: [23277, 19695, 274233],
    back: [20697],
    chest: [23272, 13168],
    wrist: [12936],
    hands: [14622],
    waist: [22086],
    legs: [23273, 22673, 22873, 274232],
    feet: [23275, 272718, 274226],
    finger1: [20682],
    finger2: [19325],
    trinket1: [272438],
    trinket2: [12930],
    mainHand: [871],
    offHand: [22336],
  },
  'druid-feral-bear': {
    head: [22005],
    neck: [19491],
    shoulder: [23254, 23309],
    back: [20691],
    chest: [12757],
    wrist: [19587],
    hands: [19049],
    waist: [20190, 20045],
    legs: [22878, 23295],
    feet: [20715],
    finger1: [13098],
    finger2: [19325],
    trinket1: [21180],
    trinket2: [11815],
    mainHand: [9449],
  },
  'warrior-protection': {
    head: [12640],
    neck: [22340],
    shoulder: [19695],
    back: [21187],
    chest: [23300, 22872],
    wrist: [13400],
    hands: [18722],
    waist: [13142],
    legs: [23301, 22873],
    feet: [23287, 22858],
    finger1: [19325],
    finger2: [275971],
    trinket1: [272437],
    trinket2: [11815],
    mainHand: [2244],
    offHand: [18756],
  },
}

/** Slots whose former default had no enchant: the Protection paladin's head, legs and weapon, until 85d6bc64. */
const FORMER_UNENCHANTED: Partial<Record<SpecId, readonly GearSlot[]>> = {
  'paladin-protection': ['head', 'legs', 'mainHand'],
}

const toEntry = ([itemId, enchantId]: LegacyEntry): EquippedItem => (enchantId === undefined ? { itemId } : { itemId, enchantId })

/** The snapshot's default gear and v1's pick for a race, as a loaded setup holds them: none for a race it hasn't. */
function frozenGear(spec: SpecId, race: string): SimConfig['gear'][] {
  const frozen = LEGACY_DEFAULTS[spec]
  const picks = frozen?.races[race]
  if (!picks) return []
  return [...new Set(picks)].map((i) => {
    const gear: SimConfig['gear'] = {}
    for (const [slot, entry] of Object.entries(frozen.sets[i]) as [GearSlot, LegacyEntry][]) gear[slot] = toEntry(entry)
    return gear
  })
}

/**
 * The parts of a setup saved before saves said what follows the defaults that held a default then,
 * by the frozen tables alone, never today's defaults: a slot with the snapshot's default, its v1
 * pick or a former interim item (with one of the slot's frozen enchants, or none where the former
 * default had none), for the setup's race or the class's default race, or a race change's twin of
 * one of those; and a talent build that was the spec's default. Everything else is the player's.
 */
export function legacyFollowing(config: SimConfig): Following {
  const { spec, race } = config
  const { classId } = SPEC_META[spec]
  const faction = factionOf(race)
  const frozen = LEGACY_DEFAULTS[spec]
  const races = [...new Set([race, frozen?.race ?? race])]
  const defaults = races.flatMap((r) => frozenGear(spec, r))
  const gear = GEAR_SLOTS.filter((slot) => {
    const entry = config.gear[slot]
    if (defaults.some((d) => sameEntry(entry, d[slot]))) return true
    if (!entry) return false
    const ids = new Set<number>([...defaults.flatMap((d) => d[slot]?.itemId ?? []), ...(FORMER_GEAR[spec]?.[slot] ?? [])])
    // A race change swapped a faction's item for its twin (src/features/character/faction-gear.ts).
    for (const id of [...ids]) {
      const item = itemsById.get(id)
      const twin = item && faction ? factionTwin(item, faction, classId) : null
      if (twin) ids.add(twin.id)
    }
    const enchants = new Set<string | undefined>(defaults.flatMap((d) => (d[slot] ? [d[slot].enchantId] : [])))
    if (FORMER_UNENCHANTED[spec]?.includes(slot)) enchants.add(undefined)
    return ids.has(entry.itemId) && enchants.has(entry.enchantId)
  })
  const talents = config.talents === frozen?.talents || (FORMER_TALENTS[spec] ?? []).includes(config.talents)
  return { gear, talents }
}

/** What a load changed to newer defaults, for one spec. */
export interface DefaultsUpdate {
  spec: SpecId
  gear: boolean
  talents: boolean
}

const specName = (spec: SpecId) => `${SPEC_META[spec].name} ${SPEC_META[spec].className}`

/**
 * The notice after a load moved parts of the setup to newer defaults, the current spec first:
 * "Updated to the new default gear and talents for Protection Paladin". Null when nothing moved.
 */
export function defaultsUpdateNotice(updates: readonly DefaultsUpdate[], current: SpecId): { title: string; description: string } | null {
  if (updates.length === 0) return null
  const ordered = [...updates].sort((a, b) => Number(b.spec === current) - Number(a.spec === current))
  const gear = ordered.some((u) => u.gear)
  const talents = ordered.some((u) => u.talents)
  const what = gear && talents ? 'gear and talents' : gear ? 'gear' : 'talents'
  const names = ordered.map((u) => specName(u.spec))
  const whose =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names[0]} and ${names.length - 1} other specs`
  return { title: `Updated to the new default ${what} for ${whose}`, description: 'Gear and talents you changed yourself are kept.' }
}
