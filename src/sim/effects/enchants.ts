// The enchant catalogue for the warrior specs (docs/mechanics/buffs-debuffs-consumables.md#5-enchants-and-item-enhancements).
// Forever values from the enchant scroll tooltips; proc rates are Classic Era's [C] or [?]. An
// enchant whose Classic Era value differs carries it in `classicEra`, from the Classic Era client
// (buffs doc, "Classic Era values"); resolve with `catalogueEffects`. Enchants new in Forever keep
// Forever's values in both profiles.
import type { EnchantDefinition, GearSlot } from '../types'
import type { ClassicEraValues, Effect } from './types'

const DOC = 'docs/mechanics/buffs-debuffs-consumables.md'

/** What the item in the slot must be for the enchant to apply. */
export type EnchantRequirement = 'weapon' | 'twoHand' | 'shield'

export interface EnchantSpec extends EnchantDefinition {
  effects: Effect[]
  /** Classic Era's values where they differ (buffs doc, Classic Era values). */
  classicEra?: ClassicEraValues
  requires?: EnchantRequirement
}

const WEAPON_SLOTS: GearSlot[] = ['mainHand', 'offHand']
const HEAD_LEGS: GearSlot[] = ['head', 'legs']
const KIT_SLOTS: GearSlot[] = ['chest', 'legs', 'hands', 'feet']

const stat = (s: Extract<Effect, { kind: 'stat' }>['stat'], value: number): Effect => ({ kind: 'stat', stat: s, value })

export const ENCHANTS: EnchantSpec[] = [
  // §5.1 Weapon
  {
    id: 'crusader',
    name: 'Crusader',
    slots: WEAPON_SLOTS,
    requires: 'weapon',
    summary: 'Chance on hit: +100 Strength for 15 s',
    docRef: `${DOC}#51-weapon`,
    effects: [
      {
        kind: 'proc',
        proc: {
          id: 'crusader',
          name: 'Holy Strength',
          icon: 'spell_holy_blessingofstrength',
          // 1 PPM [C] (damage-and-timing §5.2); the heal isn't simulated.
          trigger: 'meleeLanded',
          from: 'weapon',
          chance: { ppm: 1 },
          action: { kind: 'aura', aura: { id: 'crusader', name: 'Holy Strength', durationMs: 15000, mods: { str: 100 } } },
          docRef: `${DOC}#51-weapon`,
        },
      },
    ],
  },
  { id: 'weaponAgility', name: 'Agility', slots: WEAPON_SLOTS, requires: 'weapon', summary: '+15 Agility', docRef: `${DOC}#51-weapon`, effects: [stat('agi', 15)] },
  // 22749 → 2504 → 22747: +30 spell damage and healing (aura 13, all magic schools), the same in both clients.
  { id: 'weaponSpellPower', name: 'Spell Power', slots: ['mainHand'], requires: 'weapon', summary: '+30 spell damage', docRef: `${DOC}#51-weapon`, effects: [stat('spellDamage', 30)] },
  { id: 'weaponStrength', name: 'Strength', slots: WEAPON_SLOTS, requires: 'weapon', summary: '+15 Strength', docRef: `${DOC}#51-weapon`, effects: [stat('str', 15)] },
  {
    id: 'superiorStriking',
    name: 'Superior Striking',
    slots: WEAPON_SLOTS,
    requires: 'weapon',
    summary: '+5 weapon damage',
    docRef: `${DOC}#51-weapon`,
    effects: [{ kind: 'weaponDamage', value: 5 }],
  },
  {
    id: 'fieryWeapon',
    name: 'Fiery Weapon',
    slots: WEAPON_SLOTS,
    requires: 'weapon',
    summary: 'Chance on hit: 40 Fire damage',
    docRef: `${DOC}#51-weapon`,
    effects: [
      {
        kind: 'proc',
        proc: {
          id: 'fieryWeapon',
          name: 'Fiery Weapon',
          icon: 'spell_holy_greaterheal',
          // 6 PPM [C] (damage-and-timing §5.2)
          trigger: 'meleeLanded',
          from: 'weapon',
          chance: { ppm: 6 },
          action: { kind: 'spellDamage', school: 'fire', min: 40, max: 40 },
          docRef: `${DOC}#51-weapon`,
        },
      },
    ],
  },
  // §5.2 Two-handed weapon
  { id: 'twoHandAgility', name: 'Major Agility (2H)', slots: ['mainHand'], requires: 'twoHand', summary: '+25 Agility', docRef: `${DOC}#52-two-handed-weapon`, effects: [stat('agi', 25)] },
  { id: 'twoHandStrength', name: 'Strength (2H)', slots: ['mainHand'], requires: 'twoHand', summary: '+25 Strength', docRef: `${DOC}#52-two-handed-weapon`, effects: [stat('str', 25)] },
  { id: 'twoHandLesserStrength', name: 'Lesser Strength (2H)', slots: ['mainHand'], requires: 'twoHand', summary: '+15 Strength', docRef: `${DOC}#52-two-handed-weapon`, effects: [stat('str', 15)] },
  {
    id: 'superiorImpact',
    name: 'Superior Impact (2H)',
    slots: ['mainHand'],
    requires: 'twoHand',
    summary: '+9 weapon damage',
    docRef: `${DOC}#52-two-handed-weapon`,
    effects: [{ kind: 'weaponDamage', value: 9 }],
  },
  // §5.3 Head and legs
  { id: 'arcanumVoracityStrength', name: 'Lesser Arcanum of Voracity (Strength)', slots: HEAD_LEGS, summary: '+8 Strength', docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`, effects: [stat('str', 8)] },
  { id: 'arcanumVoracityAgility', name: 'Lesser Arcanum of Voracity (Agility)', slots: HEAD_LEGS, summary: '+8 Agility', docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`, effects: [stat('agi', 8)] },
  { id: 'arcanumVoracityStamina', name: 'Lesser Arcanum of Voracity (Stamina)', slots: HEAD_LEGS, summary: '+8 Stamina', docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`, effects: [stat('sta', 8)] },
  { id: 'arcanumConstitution', name: 'Lesser Arcanum of Constitution', slots: HEAD_LEGS, summary: '+100 health', docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`, effects: [stat('health', 100)] },
  { id: 'arcanumTenacity', name: 'Lesser Arcanum of Tenacity', slots: HEAD_LEGS, summary: '+125 armor', docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`, effects: [stat('bonusArmor', 125)] },
  { id: 'arcanumRapidity', name: 'Arcanum of Rapidity', slots: HEAD_LEGS, summary: '+1% attack speed', docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`, effects: [{ kind: 'haste', pct: 1 }] },
  // 18330 → 2544 → 22843: +8 spell damage and healing (aura 13, all magic schools), the same in both clients.
  { id: 'arcanumFocus', name: 'Arcanum of Focus', slots: HEAD_LEGS, summary: '+8 spell damage', docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`, effects: [stat('spellDamage', 8)] },
  { id: 'arcanumProtection', name: 'Arcanum of Protection', slots: HEAD_LEGS, summary: '+1% dodge', docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`, effects: [stat('dodge', 1)] },
  {
    id: 'presenceOfMight',
    name: 'Presence of Might',
    slots: HEAD_LEGS,
    summary: '+10 Stamina, +7 defense, +15 block value',
    docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`,
    effects: [stat('sta', 10), stat('defense', 7), stat('blockValue', 15)],
  },
  {
    id: 'forcefulRuggedArmorKit',
    name: 'Forceful Rugged Armor Kit',
    slots: KIT_SLOTS,
    summary: '+10 attack power, +40 armor',
    docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`,
    effects: [stat('ap', 10), stat('bonusArmor', 40)],
  },
  {
    id: 'wildLeatherArmorKit',
    name: 'Wild Leather Armor Kit',
    slots: KIT_SLOTS,
    summary: '+4 defense, +10 Stamina',
    docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`,
    effects: [stat('defense', 4), stat('sta', 10)],
  },
  {
    id: 'ruggedArmorKit',
    name: 'Rugged Armor Kit',
    slots: KIT_SLOTS,
    summary: '+5 Stamina, +40 armor',
    docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`,
    effects: [stat('sta', 5), stat('bonusArmor', 40)],
    // Classic's Rugged Armor Kit applies enchant 1843 instead (+40 armor only).
    classicEra: { summary: '+40 armor', effects: [stat('bonusArmor', 40)] },
  },
  { id: 'coreArmorKit', name: 'Core Armor Kit', slots: KIT_SLOTS, summary: '+3 defense', docRef: `${DOC}#53-head-and-legs-arcanums-zg-idols-armor-kits`, effects: [stat('defense', 3)] },
  // §5.4 Shoulders
  { id: 'zandalarSignetOfMight', name: 'Zandalar Signet of Might', slots: ['shoulder'], summary: '+30 attack power', docRef: `${DOC}#54-shoulders`, effects: [stat('ap', 30)] },
  {
    id: 'mightOfTheScourge',
    name: 'Might of the Scourge',
    slots: ['shoulder'],
    summary: '+26 attack power, +1% crit',
    docRef: `${DOC}#54-shoulders`,
    effects: [stat('ap', 26), stat('crit', 1)],
  },
  {
    id: 'fortitudeOfTheScourge',
    name: 'Fortitude of the Scourge',
    slots: ['shoulder'],
    summary: '+16 Stamina, +100 armor',
    docRef: `${DOC}#54-shoulders`,
    effects: [stat('sta', 16), stat('bonusArmor', 100)],
  },
  // §5.5 Armor slots
  { id: 'cloakAgility', name: 'Agility', slots: ['back'], summary: '+5 Agility', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('agi', 5)] },
  { id: 'cloakLesserAgility', name: 'Lesser Agility', slots: ['back'], summary: '+3 Agility', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('agi', 3)] },
  { id: 'cloakSuperiorDefense', name: 'Superior Defense', slots: ['back'], summary: '+70 armor', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('bonusArmor', 70)] },
  { id: 'cloakGreaterDefense', name: 'Greater Defense', slots: ['back'], summary: '+60 armor', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('bonusArmor', 60)], classicEra: { summary: '+50 armor', effects: [stat('bonusArmor', 50)] } },
  { id: 'cloakDodge', name: 'Dodge', slots: ['back'], summary: '+1% dodge', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('dodge', 1)] },
  { id: 'cloakSubtlety', name: 'Subtlety', slots: ['back'], summary: '−2% threat', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [{ kind: 'threat', pct: -2 }] },
  {
    id: 'chestGreaterStats',
    name: 'Greater Stats',
    slots: ['chest'],
    summary: '+4 all stats',
    docRef: `${DOC}#55-armor-slots-enchanting`,
    effects: [stat('str', 4), stat('agi', 4), stat('sta', 4), stat('int', 4), stat('spi', 4)],
  },
  {
    id: 'chestStats',
    name: 'Stats',
    slots: ['chest'],
    summary: '+3 all stats',
    docRef: `${DOC}#55-armor-slots-enchanting`,
    effects: [stat('str', 3), stat('agi', 3), stat('sta', 3), stat('int', 3), stat('spi', 3)],
  },
  { id: 'chestMajorStamina', name: 'Major Stamina', slots: ['chest'], summary: '+10 Stamina', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('sta', 10)], classicEra: { summary: '+100 health', effects: [stat('health', 100)] } },
  { id: 'bracerSuperiorStrength', name: 'Superior Strength', slots: ['wrist'], summary: '+9 Strength', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('str', 9)] },
  { id: 'bracerGreaterStrength', name: 'Greater Strength', slots: ['wrist'], summary: '+7 Strength', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('str', 7)] },
  { id: 'bracerSuperiorAgility', name: 'Superior Agility', slots: ['wrist'], summary: '+9 Agility', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('agi', 9)] },
  { id: 'bracerSuperiorStamina', name: 'Superior Stamina', slots: ['wrist'], summary: '+9 Stamina', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('sta', 9)] },
  { id: 'bracerDeflection', name: 'Deflection', slots: ['wrist'], summary: '+7 defense', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('defense', 7)], classicEra: { summary: '+3 defense', effects: [stat('defense', 3)] } },
  { id: 'bracerSuperiorDeflection', name: 'Superior Deflection', slots: ['wrist'], summary: '+9 defense', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('defense', 9)] },
  { id: 'gloveSuperiorStrength', name: 'Superior Strength', slots: ['hands'], summary: '+15 Strength', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('str', 15)] },
  { id: 'gloveSuperiorAgility', name: 'Superior Agility', slots: ['hands'], summary: '+15 Agility', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('agi', 15)] },
  { id: 'gloveGreaterStrength', name: 'Greater Strength', slots: ['hands'], summary: '+10 Strength', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('str', 10)], classicEra: { summary: '+7 Strength', effects: [stat('str', 7)] } },
  { id: 'gloveGreaterAgility', name: 'Greater Agility', slots: ['hands'], summary: '+10 Agility', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('agi', 10)], classicEra: { summary: '+7 Agility', effects: [stat('agi', 7)] } },
  { id: 'gloveStrength', name: 'Strength', slots: ['hands'], summary: '+7 Strength', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('str', 7)], classicEra: { summary: '+5 Strength', effects: [stat('str', 5)] } },
  { id: 'gloveAgility', name: 'Agility', slots: ['hands'], summary: '+7 Agility', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('agi', 7)], classicEra: { summary: '+5 Agility', effects: [stat('agi', 5)] } },
  // Forever's tooltip (13948): "+1% attack and casting speed"; Classic Era's attack speed only (docs/mechanics/spells.md §4).
  {
    id: 'gloveMinorHaste',
    name: 'Minor Haste',
    slots: ['hands'],
    summary: '+1% attack and casting speed',
    docRef: `${DOC}#55-armor-slots-enchanting`,
    effects: [
      { kind: 'haste', pct: 1 },
      { kind: 'castHaste', pct: 1 },
    ],
    classicEra: { summary: '+1% attack speed', effects: [{ kind: 'haste', pct: 1 }] },
  },
  { id: 'gloveThreat', name: 'Threat', slots: ['hands'], summary: '+2% threat', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [{ kind: 'threat', pct: 2 }] },
  { id: 'bootsGreaterAgility', name: 'Greater Agility', slots: ['feet'], summary: '+7 Agility', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('agi', 7)] },
  { id: 'bootsAgility', name: 'Agility', slots: ['feet'], summary: '+5 Agility', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('agi', 5)] },
  { id: 'bootsGreaterStamina', name: 'Greater Stamina', slots: ['feet'], summary: '+7 Stamina', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('sta', 7)] },
  { id: 'shieldGreaterStamina', name: 'Greater Stamina', slots: ['offHand'], requires: 'shield', summary: '+9 Stamina', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('sta', 9)], classicEra: { summary: '+7 Stamina', effects: [stat('sta', 7)] } },
  { id: 'shieldExcellentStamina', name: 'Excellent Stamina', slots: ['offHand'], requires: 'shield', summary: '+12 Stamina', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('sta', 12)] },
  { id: 'shieldCriticalStrike', name: 'Critical Strike', slots: ['offHand'], requires: 'shield', summary: '+1% crit', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('crit', 1), stat('spellCrit', 1)] },
  { id: 'shieldLesserBlock', name: 'Lesser Block', slots: ['offHand'], requires: 'shield', summary: '+2% block', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('block', 2)] },
  { id: 'neckStrength', name: 'Strength', slots: ['neck'], summary: '+5 Strength', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('str', 5)] },
  { id: 'neckAgility', name: 'Agility', slots: ['neck'], summary: '+5 Agility', docRef: `${DOC}#55-armor-slots-enchanting`, effects: [stat('agi', 5)] },
]

export const ENCHANTS_BY_ID = new Map(ENCHANTS.map((e) => [e.id, e]))
