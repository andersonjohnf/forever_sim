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
import { presetBuffIds } from './effects/presets'
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

export interface TalentPreset {
  name: string
  code: string
}

/** Documented presets beyond the site's popular builds (class docs §Sensible defaults). */
const EXTRA_TALENT_PRESETS: Record<ClassId, TalentPreset[]> = {
  warrior: [{ name: 'Fury + Precision', code: '30305013-050520035150310051-' }],
  druid: [{ name: 'Feral (bear)', code: '050012-5523032120132210551-' }],
  paladin: [],
}

/** Popular builds for the trees this sim covers, relabelled for display. */
const POPULAR_TREES: Record<ClassId, Record<string, string>> = {
  warrior: { Arms: 'Arms', Fury: 'Fury', Protection: 'Protection' },
  druid: { 'Feral Combat': 'Feral (cat)' },
  paladin: { Retribution: 'Retribution', Protection: 'Protection' },
}

export function talentPresets(classId: ClassId): TalentPreset[] {
  const popular = TALENT_DATA[classId].popularBuilds
    .filter((b) => b.tree in POPULAR_TREES[classId])
    .map((b) => ({ name: `Popular ${POPULAR_TREES[classId][b.tree]}`, code: b.code }))
  return [...popular, ...EXTRA_TALENT_PRESETS[classId]]
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

/**
 * Default enchants per spec (docs/mechanics/buffs-debuffs-consumables.md#64-enchant-defaults-by-spec).
 * Shoulder enchants (Zandalar, Scourge) are defaults only if the guild confirms that content
 * exists in Forever, so their fallback, none, applies. Paladin and druid enchants come with
 * those specs.
 */
const WARRIOR_DPS_ENCHANTS: Partial<Record<GearSlot, string>> = {
  head: 'arcanumVoracityStrength',
  legs: 'arcanumVoracityStrength',
  back: 'cloakAgility',
  chest: 'chestGreaterStats',
  wrist: 'bracerSuperiorStrength',
  hands: 'gloveGreaterStrength',
  feet: 'bootsGreaterAgility',
  mainHand: 'crusader',
  offHand: 'crusader',
  neck: 'neckStrength',
}
const DEFAULT_ENCHANTS: Partial<Record<SpecId, Partial<Record<GearSlot, string>>>> = {
  'warrior-fury': WARRIOR_DPS_ENCHANTS,
  'warrior-arms': WARRIOR_DPS_ENCHANTS,
  'warrior-protection': {
    ...WARRIOR_DPS_ENCHANTS,
    hands: 'gloveThreat',
    offHand: 'shieldGreaterStamina',
  },
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
  for (const [slot, enchantId] of Object.entries(DEFAULT_ENCHANTS[spec] ?? {}) as [GearSlot, string][]) {
    const equipped = gear[slot]
    if (equipped) gear[slot] = { ...equipped, enchantId }
  }
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
    // docs/mechanics/buffs-debuffs-consumables.md#6-default-presets: "Standard raid" is the default.
    buffs: { raid: [...FULL_RAID], enabled: presetBuffIds('raid', spec, FULL_RAID) },
    rotation: {},
    // docs/mechanics/encounter.md#encounter-settings
    fight: {
      durationSec: 180,
      durationVariationPct: 10,
      bossLevel: 63,
      bossArmor: 3731,
      executePct: 20,
      extraTargets: 0,
      position: tank ? 'front' : 'behind',
      creatureType: 'none',
      zone: 'hyjal',
      damageTakenPerSec: 0,
      boss: {
        swingSpeedSec: 2,
        damageMin: 4500,
        damageMax: 5500,
        canDodge: true,
        canParry: true,
        canBlock: true,
        parryHaste: true,
        canCrush: true,
      },
    },
    rules: { profile: 'forever', unmeasuredRatings: 'apply' },
    // Decision D15: adaptive precision by default; `iterations` applies in fixed mode.
    run: { mode: 'adaptive', iterations: 3000, seed: 1 },
  }
}
