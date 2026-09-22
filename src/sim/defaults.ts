// Default setups per spec (docs/doctrine.md#5-defaults): the spec's popular Forever talent
// build, its pre-raid BiS gear (decision D11), a standard raid, and the fight defaults in
// docs/mechanics/encounter.md.
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData, PreRaidBisSlot } from '@/data/items/types'
import type { ClassSlug } from '@/data/races/types'
import druidTalents from '@/data/talents/druid.json'
import paladinTalents from '@/data/talents/paladin.json'
import type { TalentData } from '@/data/talents/types'
import warriorTalents from '@/data/talents/warrior.json'
import { SPEC_META } from './specs'
import type { ClassId, EquippedItem, GearSlot, SimConfig, SpecId } from './types'

const items = (itemJson as unknown as ItemData).items

export const TALENT_DATA: Record<ClassId, TalentData> = {
  warrior: warriorTalents as unknown as TalentData,
  druid: druidTalents as unknown as TalentData,
  paladin: paladinTalents as unknown as TalentData,
}

/**
 * Default talent codes. Popular builds come from foreverchanges; the rest are the documented
 * presets in the class docs (validated in src/data/data.test.ts).
 */
const DEFAULT_TALENTS: Record<SpecId, string> = {
  'warrior-fury': '30305013002-050530035150010051-', // popular Fury (docs/classes/warrior.md §6.1)
  'warrior-arms': '30305213132515201-05050103-', // popular Arms
  'warrior-protection': '05-05-552001233201210531', // popular Protection
  'druid-feral-cat': '050022-5520002123032213051-05', // popular Feral (docs/classes/druid.md)
  'druid-feral-bear': '050012-5523032120132210551-', // documented bear preset (docs/classes/druid.md)
  'paladin-retribution': '250003-503-052052310012330321', // docs/classes/paladin.md
  'paladin-protection': '2-4530513321301551-502', // docs/classes/paladin.md
}

/** Default race per class: the doc recommendations (class docs §Sensible defaults). */
const DEFAULT_RACE: Record<ClassId, string> = {
  warrior: 'alliance-human',
  druid: 'horde-tauren',
  paladin: 'alliance-human',
}

/** A 40-player raid with every class present (buffs follow composition, not faction). */
export const FULL_RAID: ClassSlug[] = [
  'warrior',
  'paladin',
  'hunter',
  'rogue',
  'priest',
  'shaman',
  'mage',
  'warlock',
  'druid',
]

const SINGLE_SLOTS: [PreRaidBisSlot, GearSlot][] = [
  ['head', 'head'],
  ['neck', 'neck'],
  ['shoulder', 'shoulder'],
  ['back', 'back'],
  ['chest', 'chest'],
  ['wrist', 'wrist'],
  ['hands', 'hands'],
  ['waist', 'waist'],
  ['legs', 'legs'],
  ['feet', 'feet'],
  ['ranged', 'ranged'],
]

function bisFor(spec: SpecId, slot: PreRaidBisSlot): Item[] {
  return items
    .filter((i) => i.preRaidBis.some((p) => p.spec === spec && p.slot === slot))
    .sort((a, b) => rank(a, spec, slot) - rank(b, spec, slot))
}

function rank(item: Item, spec: SpecId, slot: PreRaidBisSlot): number {
  return item.preRaidBis.find((p) => p.spec === spec && p.slot === slot)?.rank ?? Infinity
}

/** The top two distinct picks for a doubled slot, skipping a second copy of a unique item. */
function topTwo(spec: SpecId, slot: PreRaidBisSlot): [Item | undefined, Item | undefined] {
  const [first, ...rest] = bisFor(spec, slot)
  const second = rest.find((i) => i.id !== first?.id)
  return [first, second]
}

export function defaultGear(spec: SpecId): Partial<Record<GearSlot, EquippedItem>> {
  const gear: Partial<Record<GearSlot, EquippedItem>> = {}
  const put = (slot: GearSlot, item: Item | undefined) => {
    if (item) gear[slot] = { itemId: item.id }
  }
  for (const [bisSlot, gearSlot] of SINGLE_SLOTS) put(gearSlot, bisFor(spec, bisSlot)[0])
  const [ring1, ring2] = topTwo(spec, 'finger')
  put('finger1', ring1)
  put('finger2', ring2)
  const [trinket1, trinket2] = topTwo(spec, 'trinket')
  put('trinket1', trinket1)
  put('trinket2', trinket2)

  const twoHand = bisFor(spec, 'twoHand')[0]
  const mainHand = bisFor(spec, 'mainHand')[0]
  if (twoHand && !mainHand) {
    put('mainHand', twoHand)
  } else {
    put('mainHand', mainHand)
    put('offHand', bisFor(spec, 'offHand')[0])
  }
  // Paladins and druids equip a relic in the ranged slot.
  if (!gear.ranged) put('ranged', bisFor(spec, 'relic')[0])
  return gear
}

export function defaultConfig(spec: SpecId): SimConfig {
  const meta = SPEC_META[spec]
  const tank = meta.role === 'tank'
  return {
    version: 1,
    spec,
    race: DEFAULT_RACE[meta.classId],
    talents: DEFAULT_TALENTS[spec],
    gear: defaultGear(spec),
    // The engine fills `enabled` from the "raid" buff preset when it normalizes the config.
    buffs: { raid: [...FULL_RAID], enabled: [] },
    rotation: {},
    fight: {
      durationSec: 180,
      bossArmor: 3731,
      executePhase: true,
      targets: 1,
      position: tank ? 'front' : 'behind',
    },
    rules: { profile: 'forever', unmeasuredRatings: 'apply' },
    run: { iterations: 3000, seed: 1 },
  }
}
