// Default setups per spec (docs/doctrine.md#5-defaults): the spec's popular Forever talent
// build, its pre-raid BiS gear (decision D11), a standard raid, and the fight defaults in
// docs/mechanics/encounter.md.
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData, PreRaidBisSlot } from '@/data/items/types'
import type { ClassSlug } from '@/data/races/types'
import druidTalents from '@/data/talents/druid.json'
import paladinTalents from '@/data/talents/paladin.json'
import shamanTalents from '@/data/talents/shaman.json'
import rogueTalents from '@/data/talents/rogue.json'
import mageTalents from '@/data/talents/mage.json'
import warlockTalents from '@/data/talents/warlock.json'
import priestTalents from '@/data/talents/priest.json'
import hunterTalents from '@/data/talents/hunter.json'
import type { TalentData } from '@/data/talents/types'
import warriorTalents from '@/data/talents/warrior.json'
import { presetBuffIds } from './effects/presets'
import { fitsFaction, uniqueConflicts, usesSupplies } from './equip'
import { firesAmmo } from './plan/ranged'
import { SPEC_META } from './specs'
import type { ClassId, EquippedItem, GearSlot, SimConfig, SpecId } from './types'

const items = (itemJson as unknown as ItemData).items

export const TALENT_DATA: Record<ClassId, TalentData> = {
  warrior: warriorTalents as unknown as TalentData,
  druid: druidTalents as unknown as TalentData,
  paladin: paladinTalents as unknown as TalentData,
  shaman: shamanTalents as unknown as TalentData,
  rogue: rogueTalents as unknown as TalentData,
  mage: mageTalents as unknown as TalentData,
  warlock: warlockTalents as unknown as TalentData,
  priest: priestTalents as unknown as TalentData,
  hunter: hunterTalents as unknown as TalentData,
}

/**
 * Default talent codes: the documented presets in the class docs, several of them the most popular
 * Forever builds of September 2026 (doctrine §5; validated in src/data/data.test.ts).
 */
const DEFAULT_TALENTS: Record<SpecId, string> = {
  'warrior-fury': '30305013002-050530035150010051-', // popular Fury (docs/classes/warrior.md §6.1)
  'warrior-arms': '30305213132515201-05050103-', // popular Arms
  'warrior-protection': '35-05-552101233301210531', // Protection 8/5/38 (docs/classes/warrior.md §6.1)
  'druid-feral-cat': '050022-5520002123032213051-05', // popular Feral (docs/classes/druid.md)
  'druid-feral-bear': '050012-5523032120132210551-', // documented bear preset (docs/classes/druid.md)
  'druid-balance': '5532220115501351-05-', // popular Balance 41/5/0 (docs/classes/druid.md §11.6)
  'paladin-retribution': '250003-503-052052310012330321', // docs/classes/paladin.md
  'paladin-protection': '2-4530513321301551-502', // docs/classes/paladin.md
  'shaman-enhancement': '050003-055030031005102251-05005', // docs/classes/shaman.md#talents
  'shaman-elemental': '5504301500103031-04-053250000001', // docs/classes/shaman.md#elemental-defaults
  // docs/classes/rogue.md#71-talents: Combat swords 18/33/0, Assassination daggers 38/11/2, Subtlety daggers 15/0/36
  'rogue-combat': '005303105001-32502300001515231-',
  'rogue-assassination': '00531310551521051-302303-002',
  'rogue-subtlety': '005303103--0322003311213211551',
  'mage-fire': '230225-23550000130133051-005', // docs/classes/mage.md#talents
  'mage-frost': '230225200100301--055510033002000105', // docs/classes/mage.md#talents
  'mage-arcane': '050225003100301531-2355001010003-', // docs/classes/mage.md#talents
  // docs/classes/warlock.md#71-talents: Destruction 7/11/33 (Fire, Demonic Sacrifice), Affliction 35/11/5
  'warlock-destruction': '25-0050203001-0050355103101351',
  'warlock-affliction': '2555002003520105-0050203001-005',
  // docs/classes/priest.md#71-talents: Shadow 20/0/31, Shadowform with Twin Disciplines, Inner Focus and Meditation
  'priest-shadow': '025300031303--500320501201312051',
  // docs/classes/hunter.md#71-talents: Marksmanship 10/41/0 with Lone Wolf, Beast Mastery 31/20/0 with
  // Bestial Wrath, Survival 0/21/30 with Lightning Reflexes and Surefooted
  'hunter-marksmanship': '55-0053552511503051-',
  'hunter-beast-mastery': '5023001505011251-00505505-',
  'hunter-survival': '-00505515-55005003124000005',
}

/** docs/classes/hunter.md#71-talents: Marksmanship 10/41/0 without Lone Wolf, fighting with its cat. */
const HUNTER_MARKSMANSHIP_PET = '5023-1053552501503051-'

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
    // docs/classes/warrior.md#61-talent-builds: Protection 8/5/38
    { name: 'Protection (default)', code: DEFAULT_TALENTS['warrior-protection'] },
    // docs/classes/warrior.md#61-talent-builds: Protection 5/5/41, Improved Thunder Clap 3 for Improved Heroic Strike 3
    { name: 'Protection + Improved Thunder Clap', code: '05-05-552131233301210531' },
  ],
  druid: [
    // docs/classes/druid.md#71-talents: Cat 9/37/5
    { name: 'Feral cat (default)', code: DEFAULT_TALENTS['druid-feral-cat'] },
    // docs/classes/druid.md#71-talents: Bear 8/43/0
    { name: 'Feral bear (default)', code: DEFAULT_TALENTS['druid-feral-bear'] },
    // docs/classes/druid.md#116-defaults: Balance 41/5/0
    { name: 'Balance (default)', code: DEFAULT_TALENTS['druid-balance'] },
  ],
  paladin: [
    // docs/classes/paladin.md#retribution-defaults: Holy 10 / Prot 8 / Ret 33
    { name: 'Retribution (default)', code: DEFAULT_TALENTS['paladin-retribution'] },
    // docs/classes/paladin.md#protection-defaults: Holy 2 / Prot 42 / Ret 7
    { name: 'Protection (default)', code: DEFAULT_TALENTS['paladin-protection'] },
  ],
  shaman: [
    // docs/classes/shaman.md#talents: Elemental 8 / Enhancement 33 / Restoration 10
    { name: 'Enhancement (default)', code: DEFAULT_TALENTS['shaman-enhancement'] },
    // docs/classes/shaman.md#elemental-defaults: Elemental 31 / Enhancement 4 / Restoration 16
    { name: 'Elemental (default)', code: DEFAULT_TALENTS['shaman-elemental'] },
  ],
  rogue: [
    // docs/classes/rogue.md#71-talents: Combat swords 18/33/0
    { name: 'Combat (default)', code: DEFAULT_TALENTS['rogue-combat'] },
    // docs/classes/rogue.md#71-talents: Assassination daggers 38/11/2
    { name: 'Assassination (default)', code: DEFAULT_TALENTS['rogue-assassination'] },
    // docs/classes/rogue.md#71-talents: Subtlety daggers 15/0/36
    { name: 'Subtlety (default)', code: DEFAULT_TALENTS['rogue-subtlety'] },
  ],
  mage: [
    // docs/classes/mage.md#talents: Arcane 14 / Fire 32 / Frost 5, 21 / 0 / 30 and 31 / 20 / 0
    { name: 'Fire (default)', code: DEFAULT_TALENTS['mage-fire'] },
    { name: 'Frost (default)', code: DEFAULT_TALENTS['mage-frost'] },
    { name: 'Arcane (default)', code: DEFAULT_TALENTS['mage-arcane'] },
  ],
  warlock: [
    // docs/classes/warlock.md#71-talents: Destruction 7/11/33, Fire, with Demonic Sacrifice
    { name: 'Destruction (default)', code: DEFAULT_TALENTS['warlock-destruction'] },
    // docs/classes/warlock.md#71-talents: Affliction 35/11/5 with Demonic Sacrifice
    { name: 'Affliction (default)', code: DEFAULT_TALENTS['warlock-affliction'] },
  ],
  priest: [
    // docs/classes/priest.md#71-talents: Discipline 20 / Holy 0 / Shadow 31
    { name: 'Shadow (default)', code: DEFAULT_TALENTS['priest-shadow'] },
  ],
  hunter: [
    // docs/classes/hunter.md#71-talents
    { name: 'Marksmanship (default)', code: DEFAULT_TALENTS['hunter-marksmanship'] },
    { name: 'Marksmanship with a pet', code: HUNTER_MARKSMANSHIP_PET },
    { name: 'Beast Mastery (default)', code: DEFAULT_TALENTS['hunter-beast-mastery'] },
    { name: 'Survival (default)', code: DEFAULT_TALENTS['hunter-survival'] },
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
  shaman: 'horde-orc',
  // docs/classes/rogue.md#72-race: Human, for its sword crit
  rogue: 'alliance-human',
  // docs/classes/mage.md#defaults: Berserking's casting speed.
  mage: 'horde-troll',
  // docs/classes/warlock.md#72-race: Orc, for Forever's Blood Fury (+10% spell power for 15 s)
  warlock: 'horde-orc',
  // docs/classes/priest.md#72-race-and-weapons: Troll, for Berserking's casting speed
  priest: 'horde-troll',
  // docs/classes/hunter.md#72-race: Orc, for Forever's Blood Fury (+10% ranged attack power for 15 s)
  hunter: 'horde-orc',
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
/**
 * The rogue's enchants (buffs doc §6.4; docs/classes/rogue.md#75-enchants-and-consumables): the feral
 * column's Agility everywhere it's offered, with Crusader on each weapon and the new +5 Agility
 * necklace. Shoulders stay empty ([none]).
 */
const ROGUE_ENCHANTS: Partial<Record<GearSlot, string>> = {
  head: 'arcanumVoracityAgility',
  legs: 'arcanumVoracityAgility',
  back: 'cloakAgility',
  chest: 'chestGreaterStats',
  wrist: 'bracerSuperiorAgility',
  hands: 'gloveGreaterAgility',
  feet: 'bootsGreaterAgility',
  mainHand: 'crusader',
  offHand: 'crusader',
  neck: 'neckAgility',
}
/**
 * The warlock's enchants (buffs doc §6.4; docs/classes/warlock.md#74-enchants-and-consumables): spell
 * damage where the catalogue offers it (Arcanum of Focus, the weapon's Spell Power), Greater Stats,
 * and Forever's Minor Haste gloves for their casting speed. Its other slots have no caster enchant in
 * the catalogue yet, so they stay empty.
 */
const WARLOCK_ENCHANTS: Partial<Record<GearSlot, string>> = {
  head: 'arcanumFocus',
  legs: 'arcanumFocus',
  chest: 'chestGreaterStats',
  hands: 'gloveMinorHaste',
  mainHand: 'weaponSpellPower',
}
/**
 * The hunter's enchants (buffs doc §6.4; docs/classes/hunter.md#74-enchants-and-consumables): the
 * rogue's Agility column without weapon enchants, whose melee weapons never swing. The catalogue has
 * no scope yet.
 */
const HUNTER_ENCHANTS: Partial<Record<GearSlot, string>> = {
  head: 'arcanumVoracityAgility',
  legs: 'arcanumVoracityAgility',
  back: 'cloakAgility',
  chest: 'chestGreaterStats',
  wrist: 'bracerSuperiorAgility',
  hands: 'gloveGreaterAgility',
  feet: 'bootsGreaterAgility',
  neck: 'neckAgility',
}
const DEFAULT_ENCHANTS: Partial<Record<SpecId, Partial<Record<GearSlot, string>>>> = {
  'hunter-marksmanship': HUNTER_ENCHANTS,
  'hunter-beast-mastery': HUNTER_ENCHANTS,
  'hunter-survival': HUNTER_ENCHANTS,
  'warlock-destruction': WARLOCK_ENCHANTS,
  'warlock-affliction': WARLOCK_ENCHANTS,
  // docs/classes/priest.md#74-enchants-and-consumables: Greater Stats on the chest and Forever's Minor
  // Haste gloves, which cast faster. The warlock's spell damage enchants (Arcanum of Focus, the
  // weapon's Spell Power) aren't in its defaults yet, a known gap.
  'priest-shadow': { chest: 'chestGreaterStats', hands: 'gloveMinorHaste' },
  'rogue-combat': ROGUE_ENCHANTS,
  'rogue-assassination': ROGUE_ENCHANTS,
  'rogue-subtlety': ROGUE_ENCHANTS,
  'warrior-fury': WARRIOR_DPS_ENCHANTS,
  'warrior-arms': WARRIOR_DPS_ENCHANTS,
  'warrior-protection': {
    ...WARRIOR_DPS_ENCHANTS,
    hands: 'gloveThreat',
    offHand: 'shieldGreaterStamina',
  },
  'druid-feral-cat': FERAL_ENCHANTS,
  'druid-feral-bear': { ...FERAL_ENCHANTS, hands: 'gloveThreat' },
  // docs/classes/druid.md §11.6: Greater Stats on the chest, the one caster enchant the catalogue has.
  'druid-balance': { chest: 'chestGreaterStats' },
  // §6.4 Retribution: the warrior DPS column with a two-hander (no off hand).
  'paladin-retribution': { ...WARRIOR_DPS_ENCHANTS, offHand: undefined },
  // §6.4 Prot paladin: Superior Defense cloak, Greater Stats, Superior Stamina bracers, Threat
  // gloves, Greater Agility boots and Greater Stamina shield.
  // §6.4 Enhancement shaman (docs/classes/shaman.md#defaults): the Retribution column; the main hand
  // is imbued and enchanted with Crusader.
  'shaman-enhancement': { ...WARRIOR_DPS_ENCHANTS, offHand: undefined },
  // docs/classes/mage.md#defaults: Greater Stats on the chest, the one caster enchant the catalogue has yet.
  'mage-fire': { chest: 'chestGreaterStats' },
  'mage-frost': { chest: 'chestGreaterStats' },
  'mage-arcane': { chest: 'chestGreaterStats' },
  // Elemental shaman (docs/classes/shaman.md#elemental-defaults): Greater Stats on the chest.
  'shaman-elemental': { chest: 'chestGreaterStats' },
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
 * (docs/classes/druid.md §7.3); an Enhancement shaman's Windfury Weapon and Stormstrike favour a
 * slow two-hander (docs/classes/shaman.md#defaults).
 */
const TWO_HAND_SPECS: ReadonlySet<SpecId> = new Set(['druid-feral-cat', 'druid-feral-bear', 'shaman-enhancement'])

/**
 * The hunter's default ammo and quiver (docs/classes/hunter.md#73-gear): Thorium Headed Arrows or
 * Thorium Shells (17.715 damage per second, crafted), and the 15% Harpy Hide Quiver or Gnoll Skin
 * Bandolier (required level 55), by what the ranged weapon fires.
 */
export const DEFAULT_SUPPLIES = { arrows: 18042, bullets: 15997, quiver: 19319, pouch: 19320 } as const

/**
 * The ammo a ranged weapon fires (docs/mechanics/ranged-and-pets.md §1): arrows from bows and
 * crossbows, bullets from guns; none from a thrown weapon, or from no weapon.
 */
export function ammoKind(ranged: Item | null | undefined): 'arrow' | 'bullet' | null {
  const type = ranged?.weaponType
  if (!type) return null
  return firesAmmo(type, 'arrow') ? 'arrow' : firesAmmo(type, 'bullet') ? 'bullet' : null
}

/** What a quiver or ammo pouch holds: a quiver arrows, an ammo pouch bullets (ranged-and-pets.md §1). */
const holds = (item: Item) => (item.itemSubclass === 'Ammo Pouch' ? 'bullet' : 'arrow')

/**
 * The gear after its ranged weapon changed to `ranged` (a hunter's; docs/classes/hunter.md#73-gear):
 * ammo the new weapon can't fire becomes the default ammo it can, as `defaultGear` picks; a quiver
 * or ammo pouch of the other kind becomes the one of this kind with the same ranged attack speed
 * (the default when there's a choice), so the setup's haste doesn't change. A thrown weapon fires
 * no ammo and leaves both alone. Returns the same object when nothing changes.
 */
export function matchSupplies(
  gear: Partial<Record<GearSlot, EquippedItem>>,
  ranged: Item | null | undefined,
): Partial<Record<GearSlot, EquippedItem>> {
  const kind = ammoKind(ranged)
  if (!kind) return gear
  const byId = (id: number | undefined) => (id === undefined ? undefined : items.find((i) => i.id === id))
  let next = gear
  const ammo = byId(gear.ammo?.itemId)
  if (ammo?.ammo && ammo.ammo.projectile !== kind) {
    next = { ...next, ammo: { itemId: kind === 'arrow' ? DEFAULT_SUPPLIES.arrows : DEFAULT_SUPPLIES.bullets } }
  }
  const quiver = byId(gear.quiver?.itemId)
  if (quiver && quiver.slot === 'quiver' && holds(quiver) !== kind) {
    const preferred = kind === 'arrow' ? DEFAULT_SUPPLIES.quiver : DEFAULT_SUPPLIES.pouch
    const haste = quiver.stats.rangedAttackSpeed
    const twins = items.filter((i) => i.slot === 'quiver' && holds(i) === kind && i.stats.rangedAttackSpeed === haste)
    const twin = twins.find((i) => i.id === preferred) ?? twins[0]
    next = { ...next, quiver: { itemId: twin?.id ?? preferred } }
  }
  return next
}

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
  // docs/classes/hunter.md#73-gear: the ammo the ranged weapon fires and the quiver or ammo pouch that
  // holds it: the best non-epic ammo with a Forever row, and a 15% quiver (the guide lists neither).
  if (usesSupplies(SPEC_META[spec].classId)) {
    const gun = ammoKind(worn.ranged) === 'bullet'
    for (const [slot, id] of [
      ['ammo', gun ? DEFAULT_SUPPLIES.bullets : DEFAULT_SUPPLIES.arrows],
      ['quiver', gun ? DEFAULT_SUPPLIES.pouch : DEFAULT_SUPPLIES.quiver],
    ] as const) {
      const item = items.find((i) => i.id === id)
      if (item) put(slot, [item])
    }
  }
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
