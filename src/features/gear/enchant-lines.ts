import { enchantCatalogueFor, type RuleProfileId } from '@/sim'

/**
 * An enchant's green tooltip line as the game prints it: the client's SpellItemEnchantment name
 * (`src/data/client/enchants.json`), with its `$kN` tokens read from the row's `EffectPointsMin`
 * and `$<spell>M<n>` from that spell's effect (docs/ux.md "Item tooltips"). The line is kept here,
 * not read from the client file at run time, so the page doesn't load the client tables;
 * `enchant-lines.test.ts` renders every name from the client and holds each line to it.
 *
 * Keyed by the catalogue's enchant id (`src/sim/effects/enchants.ts`); `client` is the enchant row
 * the Forever profile's values come from (the rows `src/sim/effects/catalogue.test.ts` cites).
 */
export const ENCHANT_LINES: Record<string, { client: number; line: string }> = {
  // §5.1 Weapon
  crusader: { client: 1900, line: 'Crusader' },
  fieryWeapon: { client: 803, line: 'Fiery Weapon' },
  weaponAgility: { client: 2564, line: 'Agility +15' },
  weaponSpellPower: { client: 2504, line: 'Spell Power +30' },
  weaponStrength: { client: 2563, line: 'Strength +15' },
  superiorStriking: { client: 1897, line: 'Weapon Damage +5' },
  // §5.2 Two-handed weapon
  twoHandAgility: { client: 2646, line: 'Agility +25' },
  twoHandStrength: { client: 8215, line: 'Strength +25' },
  twoHandLesserStrength: { client: 2563, line: 'Strength +15' },
  superiorImpact: { client: 1896, line: 'Weapon Damage +9' },
  // §5.3 Head and legs
  arcanumVoracityStrength: { client: 1506, line: 'Strength +8' },
  arcanumVoracityAgility: { client: 1508, line: 'Agility +8' },
  arcanumVoracityStamina: { client: 1507, line: 'Stamina +8' },
  arcanumConstitution: { client: 1503, line: 'HP +100' },
  arcanumTenacity: { client: 1504, line: 'Armor +125' },
  arcanumRapidity: { client: 2543, line: 'Attack Speed +1%' },
  arcanumFocus: { client: 2544, line: 'Healing and Spell Damage +8' },
  arcanumProtection: { client: 2545, line: 'Dodge +1%' },
  presenceOfMight: { client: 2583, line: 'Defense +7/Stamina +10/Block Value +15' },
  forcefulRuggedArmorKit: { client: 8491, line: 'Attack Power +10 and Armor +40' },
  wildLeatherArmorKit: { client: 8719, line: 'Defense +4 and Stamina +10' },
  ruggedArmorKit: { client: 8490, line: 'Stamina +5 and Armor +40' },
  coreArmorKit: { client: 2503, line: 'Defense +3' },
  // §5.4 Shoulders
  zandalarSignetOfMight: { client: 2606, line: '+30 Attack Power' },
  mightOfTheScourge: { client: 2717, line: 'Attack Power +26 and +1% Critical Strike' },
  fortitudeOfTheScourge: { client: 2716, line: 'Stamina +16 and Armor +100' },
  // §5.5 Armor slots
  cloakAgility: { client: 7667, line: '+5 Agility' },
  cloakLesserAgility: { client: 849, line: 'Agility +3' },
  cloakSuperiorDefense: { client: 1889, line: 'Armor +70' },
  cloakGreaterDefense: { client: 884, line: 'Armor +60' },
  cloakDodge: { client: 2622, line: 'Dodge +1%' },
  cloakSubtlety: { client: 2621, line: 'Subtlety' },
  chestGreaterStats: { client: 1891, line: 'All Stats +4' },
  chestStats: { client: 928, line: 'All Stats +3' },
  chestMajorStamina: { client: 1892, line: '+10 Stamina' },
  bracerSuperiorStrength: { client: 1885, line: 'Strength +9' },
  bracerGreaterStrength: { client: 927, line: 'Strength +7' },
  bracerSuperiorAgility: { client: 7656, line: '+9 Agility' },
  bracerSuperiorStamina: { client: 1886, line: 'Stamina +9' },
  bracerDeflection: { client: 923, line: 'Defense +7' },
  // The name reads `Defense +$k2`, whose second slot is an unused 6; the enchant's one effect, slot 1,
  // is the 9 the catalogue simulates, so the line shows 9 (see ENCHANT_LINE_EXCEPTIONS in the test).
  bracerSuperiorDeflection: { client: 8214, line: 'Defense +9' },
  gloveSuperiorStrength: { client: 2563, line: 'Strength +15' },
  gloveSuperiorAgility: { client: 2564, line: 'Agility +15' },
  gloveGreaterStrength: { client: 8207, line: 'Strength +10' },
  gloveGreaterAgility: { client: 8206, line: 'Agility +10' },
  gloveStrength: { client: 927, line: 'Strength +7' },
  gloveAgility: { client: 1887, line: 'Agility +7' },
  gloveMinorHaste: { client: 931, line: 'Haste +1%' },
  gloveThreat: { client: 2613, line: 'Threat +2%' },
  bootsGreaterAgility: { client: 1887, line: 'Agility +7' },
  bootsAgility: { client: 904, line: 'Agility +5' },
  bootsGreaterStamina: { client: 929, line: 'Stamina +7' },
  shieldGreaterStamina: { client: 1886, line: 'Stamina +9' },
  shieldExcellentStamina: { client: 7663, line: '+12 Stamina' },
  shieldCriticalStrike: { client: 7664, line: '+1% Critical Strike Chance' },
  shieldLesserBlock: { client: 863, line: 'Blocking +2%' },
  neckStrength: { client: 856, line: 'Strength +5' },
  neckAgility: { client: 904, line: 'Agility +5' },
}

const summaries = (profile: RuleProfileId) => new Map(enchantCatalogueFor(profile).map((e) => [e.id, e.summary]))
const FOREVER_SUMMARY = summaries('forever')
const CLASSIC_SUMMARY = summaries('classicEra')

/**
 * The enchant's green line, or null for no enchant (or an id the catalogue doesn't have). Under
 * Classic Era rules an enchant whose Classic Era value differs (Greater Defense's +50 armor, not
 * Forever's +60) shows the catalogue's Classic Era summary instead, since the Forever client's name
 * would print Forever's number; so does an enchant this table doesn't know yet.
 */
export function enchantTooltipLine(enchantId: string | null | undefined, profile: RuleProfileId = 'forever'): string | null {
  if (!enchantId) return null
  const forever = FOREVER_SUMMARY.get(enchantId)
  if (forever === undefined) return null
  const own = profile === 'classicEra' ? (CLASSIC_SUMMARY.get(enchantId) ?? forever) : forever
  const known = ENCHANT_LINES[enchantId]
  return known && own === forever ? known.line : own
}
