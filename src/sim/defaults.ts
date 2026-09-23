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
import { fitsFaction, uniqueConflicts } from './equip'
import { SPEC_META } from './specs'
import type { ClassId, EquippedItem, GearSlot, SimConfig, SpecId } from './types'

const items = (itemJson as unknown as ItemData).items

export const TALENT_DATA: Record<ClassId, TalentData> = {
  warrior: warriorTalents as unknown as TalentData,
  druid: druidTalents as unknown as TalentData,
  paladin: paladinTalents as unknown as TalentData,
}

/**
 * Default talent codes: the documented presets in the class docs, several of them the most popular
 * Forever builds of September 2026 (doctrine §5; validated in src/data/data.test.ts).
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

/**
 * Talent presets per class: the builds the class docs document for the specs this sim covers,
 * each spec's default first, then its documented alternatives. Validated in
 * src/data/data.test.ts (legal, round-trip, same ranks by name as when they were written).
 */
const TALENT_PRESETS: Record<ClassId, TalentPreset[]> = {
  warrior: [
    // docs/classes/warrior.md#61-talent-builds: Fury 17/34/0
    { name: 'Fury (default)', code: DEFAULT_TALENTS['warrior-fury'] },
    // docs/classes/warrior.md#61-talent-builds: "Fury + Precision" 15/36/0, the Fury alternative
    { name: 'Fury + Precision', code: '30305013-050520035150310051-' },
    // docs/classes/warrior.md#61-talent-builds: Arms 37/14/0
    { name: 'Arms (default)', code: DEFAULT_TALENTS['warrior-arms'] },
    // docs/classes/warrior.md#61-talent-builds: Protection 5/5/36
    { name: 'Protection (default)', code: DEFAULT_TALENTS['warrior-protection'] },
    // docs/classes/warrior.md#61-talent-builds: the Protection "TPS" variant, also 5/5/36
    { name: 'Protection (TPS)', code: '32-05-552001233201210531' },
  ],
  druid: [
    // docs/classes/druid.md#71-talents: Cat 9/37/5
    { name: 'Feral cat (default)', code: DEFAULT_TALENTS['druid-feral-cat'] },
    // docs/classes/druid.md#71-talents: Bear 8/43/0
    { name: 'Feral bear (default)', code: DEFAULT_TALENTS['druid-feral-bear'] },
  ],
  paladin: [
    // docs/classes/paladin.md#retribution-defaults: Holy 10 / Prot 8 / Ret 33
    { name: 'Retribution (default)', code: DEFAULT_TALENTS['paladin-retribution'] },
    // docs/classes/paladin.md#protection-defaults: Holy 2 / Prot 42 / Ret 7
    { name: 'Protection (default)', code: DEFAULT_TALENTS['paladin-protection'] },
  ],
}

/** The documented talent presets of a class (TALENT_PRESETS). */
export function talentPresets(classId: ClassId): TalentPreset[] {
  return TALENT_PRESETS[classId]
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

/**
 * Default enchants per spec (docs/mechanics/buffs-debuffs-consumables.md#64-enchant-defaults-by-spec).
 * Shoulder enchants (Zandalar, Scourge) are defaults only if the guild confirms that content
 * exists in Forever, so their fallback, none, applies. The Protection paladin's Arcanum of Focus
 * and +30 Spell Power weapon aren't in the enchant catalogue yet, so those slots fall back to none.
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
/**
 * The feral enchants (buffs doc §6.4; docs/classes/druid.md §7): Agility everywhere it's offered,
 * the two-hander's +25 Agility, and the bear's threat gloves. Shoulders stay empty ([none]).
 */
const FERAL_ENCHANTS: Partial<Record<GearSlot, string>> = {
  head: 'arcanumVoracityAgility',
  legs: 'arcanumVoracityAgility',
  back: 'cloakAgility',
  chest: 'chestGreaterStats',
  wrist: 'bracerSuperiorAgility',
  hands: 'gloveGreaterAgility',
  feet: 'bootsGreaterAgility',
  mainHand: 'twoHandAgility',
}
const DEFAULT_ENCHANTS: Partial<Record<SpecId, Partial<Record<GearSlot, string>>>> = {
  'warrior-fury': WARRIOR_DPS_ENCHANTS,
  'warrior-arms': WARRIOR_DPS_ENCHANTS,
  'warrior-protection': {
    ...WARRIOR_DPS_ENCHANTS,
    hands: 'gloveThreat',
    offHand: 'shieldGreaterStamina',
  },
  'druid-feral-cat': FERAL_ENCHANTS,
  'druid-feral-bear': { ...FERAL_ENCHANTS, hands: 'gloveThreat' },
  // §6.4 Retribution: the warrior DPS column with a two-hander (no off hand).
  'paladin-retribution': { ...WARRIOR_DPS_ENCHANTS, offHand: undefined },
  // §6.4 Prot paladin: Superior Defense cloak, Greater Stats, Superior Stamina bracers, Threat
  // gloves, Greater Agility boots and Greater Stamina shield.
  'paladin-protection': {
    back: 'cloakSuperiorDefense',
    chest: 'chestGreaterStats',
    wrist: 'bracerSuperiorStamina',
    hands: 'gloveThreat',
    feet: 'bootsGreaterAgility',
    offHand: 'shieldGreaterStamina',
  },
}

/**
 * Specs whose default weapon is the two-hander even when the lists also rank a one-hander: a
 * feral's weapon damage does nothing in form, and the two-hander's enchant is the bigger one
 * (docs/classes/druid.md §7.3).
 */
const TWO_HAND_SPECS: ReadonlySet<SpecId> = new Set(['druid-feral-cat', 'druid-feral-bear'])

/**
 * The spec's pre-raid BiS gear for a character of this race: each slot takes its best-ranked item
 * that the race's faction can wear and that breaks no Unique or Unique-Equipped rule with the
 * slots filled before it (docs/data/items.md#equipping-rules). So faction twins listed at the same
 * rank resolve to the race's own, and the second ring or trinket is the next distinct one.
 */
export function defaultGear(spec: SpecId, race = DEFAULT_RACE[SPEC_META[spec].classId]): Partial<Record<GearSlot, EquippedItem>> {
  const gear: Partial<Record<GearSlot, EquippedItem>> = {}
  const worn: Partial<Record<GearSlot, Item>> = {}
  const put = (slot: GearSlot, candidates: Item[]) => {
    const item = candidates.find((i) => fitsFaction(race, i) && uniqueConflicts(worn, slot, i).length === 0)
    if (!item) return
    worn[slot] = item
    gear[slot] = { itemId: item.id }
  }
  for (const [bisSlot, gearSlot] of SINGLE_SLOTS) put(gearSlot, bisFor(spec, bisSlot))
  // Doubled slots take two distinct items: the guides' top two, not two copies of the first.
  for (const [bisSlot, first, second] of [
    ['finger', 'finger1', 'finger2'],
    ['trinket', 'trinket1', 'trinket2'],
  ] as const) {
    const candidates = bisFor(spec, bisSlot)
    put(first, candidates)
    put(second, candidates.filter((i) => i.id !== worn[first]?.id))
  }

  const twoHands = bisFor(spec, 'twoHand')
  const mainHands = bisFor(spec, 'mainHand')
  if (twoHands.length > 0 && (mainHands.length === 0 || TWO_HAND_SPECS.has(spec))) {
    put('mainHand', twoHands)
  } else {
    put('mainHand', mainHands)
    put('offHand', bisFor(spec, 'offHand'))
  }
  // Paladins and druids equip a relic in the ranged slot.
  if (!gear.ranged) put('ranged', bisFor(spec, 'relic'))
  for (const [slot, enchantId] of Object.entries(DEFAULT_ENCHANTS[spec] ?? {}) as [GearSlot, string | undefined][]) {
    const equipped = gear[slot]
    if (equipped && enchantId) gear[slot] = { ...equipped, enchantId }
  }
  return gear
}

/** The spec's default setup; `race` (legal for the class) changes the race and its faction's gear. */
export function defaultConfig(spec: SpecId, race = DEFAULT_RACE[SPEC_META[spec].classId]): SimConfig {
  const meta = SPEC_META[spec]
  const tank = meta.role === 'tank'
  return {
    version: 1,
    spec,
    race,
    talents: DEFAULT_TALENTS[spec],
    gear: defaultGear(spec, race),
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
