// The results' assumptions, grouped (docs/ux.md#results). The sim can't yet say how much each
// assumption moves a result, so the list is grouped by what you can do about it: your own
// choices first (gear, consumables, race), then how the sim plays your class, then the combat
// rules every setup shares. Inside a group, the likely bigger ones come first (ASSUMPTION_GROUP).
import type { Assumption, ClassId } from '@/sim'

export type AssumptionGroup = 'gear' | 'character' | 'class' | 'combat'

export const GROUP_ORDER: readonly AssumptionGroup[] = ['gear', 'character', 'class', 'combat']

const CLASS_NAME: Record<ClassId, string> = { warrior: 'Warrior', druid: 'Druid', paladin: 'Paladin' }

export function groupTitle(group: AssumptionGroup, classId: ClassId): string {
  switch (group) {
    case 'gear':
      return 'Your gear and consumables'
    case 'character':
      return 'Your race and stats'
    case 'class':
      return `${CLASS_NAME[classId]} mechanics`
    case 'combat':
      return 'Combat rules'
  }
}

/**
 * Each engine assumption id (src/sim/plan/assumptions.ts) and its group. A unit test keeps this
 * in step with the engine's list; an id missing here goes last under "Combat rules". Inside a
 * group the list follows this order: the ones likely to move a result most first, by judgment,
 * since the sim can't measure that yet (every hit rolls on the attack table, while a proc rate
 * touches one item).
 */
export const ASSUMPTION_GROUP = {
  // Your gear and consumables: items, enchants, consumables and the ratings on your gear.
  noWeapon: 'gear',
  noWeaponSpells: 'gear',
  classicItems: 'gear',
  unmodelledProcs: 'gear',
  unmodelledSetBonuses: 'gear',
  onUseConsumables: 'gear',
  hyjalFlask: 'gear',
  procRates: 'gear',
  ironfoeChance: 'gear',
  ratingsInCombat: 'gear',
  extraAttackChains: 'gear',
  elementalStone: 'gear',
  windfuryStone: 'gear',
  windfuryIcd: 'gear',
  magicProcs: 'gear',
  weaknessAnalyzer: 'gear',
  formHaste: 'gear',
  weaknessAnalyzerPaladin: 'gear',
  expertise: 'gear',
  hasteRating: 'gear',
  armorPen: 'gear',
  shieldBlockValue: 'gear',
  classicShieldBlockValue: 'gear',
  // Your race and stats.
  unknownBaseAttributes: 'character',
  racialWeaponCrit: 'character',
  gnomeRage: 'character',
  cooldownRacial: 'character',
  touchOfTheGrave: 'character',
  baseStatPlaceholders: 'character',
  // How the sim plays the class: rage, abilities and talents.
  whiteSwingsOnly: 'class',
  formWeapon: 'class',
  formWeaponCat: 'class',
  omenOfClarity: 'class',
  omenOfClarityCat: 'class',
  noPowershift: 'class',
  energyTicks: 'class',
  rendAndTear: 'class',
  catFinisherAp: 'class',
  catShredFlat: 'class',
  predatoryInstincts: 'class',
  catBleeds: 'class',
  catTwoRolls: 'class',
  berserkCrits: 'class',
  bearWhiteRage: 'class',
  bearArmor: 'class',
  shapeshifts: 'class',
  jotcBonus: 'class',
  jotcBonusFlat: 'class',
  holyStrike: 'class',
  consecrationTicks: 'class',
  hammerOfWrath: 'class',
  sealOfCommandRate: 'class',
  sealOfCommandScaling: 'class',
  meleeSpellProcs: 'class',
  judgementOfCommand: 'class',
  sealOfRighteousness: 'class',
  sealOfFury: 'class',
  sanctifiedJudgement: 'class',
  vindication: 'class',
  manaRegen: 'class',
  foreverWhiteRage: 'class',
  foreverOffHandRage: 'class',
  onNextSwingRage: 'class',
  onNextSwingOffHand: 'class',
  abilityRefunds: 'class',
  executeRageTenths: 'class',
  unbridledWrathSwings: 'class',
  deepWounds: 'class',
  rendTickCrits: 'class',
  overpowerWindow: 'class',
  bloodthrill: 'class',
  slamCast: 'class',
  ragingBlows: 'class',
  spearingStrike: 'class',
  angerManagement: 'class',
  improvedBloodrageRounding: 'class',
  weaponmasterMace: 'class',
  rendOnHit: 'class',
  knownFightTimings: 'class',
  // Damage taken, together: the rage a hit gives, then a DPS spec's hits themselves (Fight →
  // Advanced → "Damage you take", the one you set), then what they trigger.
  damageTakenRage: 'class',
  damageTakenRageFlat: 'class',
  damageTakenRageHealthLost: 'class',
  dpsDamageTaken: 'class',
  enrageTrigger: 'class',
  berserkerRageTaken: 'class',
  defiance: 'class',
  // Combat rules every setup shares: the attack table, timing, threat and the boss.
  foreverHitTable: 'combat',
  foreverGlancing: 'combat',
  critSuppression: 'combat',
  foreverBossParry: 'combat',
  bossFlags: 'combat',
  gcdHaste: 'combat',
  gcdHasteCat: 'combat',
  reactionTime: 'combat',
  reactionTimeEnergy: 'combat',
  reactionTimeMana: 'combat',
  negativeArmor: 'combat',
  offHandFirstSwing: 'combat',
  hasteNextSwing: 'combat',
  whiteThreat: 'combat',
  bossMelee: 'combat',
  bossSlow: 'combat',
  bossApDebuff: 'combat',
} as const satisfies Record<string, AssumptionGroup>

const GROUPS: Record<string, AssumptionGroup> = ASSUMPTION_GROUP
const RANK = new Map(Object.keys(ASSUMPTION_GROUP).map((id, i) => [id, i]))

/**
 * The assumptions in their groups, in GROUP_ORDER, and in ASSUMPTION_GROUP's order inside each.
 * Empty groups are left out.
 */
export function groupAssumptions(assumptions: readonly Assumption[]): { group: AssumptionGroup; items: Assumption[] }[] {
  const rank = (a: Assumption) => RANK.get(a.id) ?? Number.MAX_SAFE_INTEGER
  return GROUP_ORDER.map((group) => ({
    group,
    items: assumptions.filter((a) => (GROUPS[a.id] ?? 'combat') === group).sort((a, b) => rank(a) - rank(b)),
  })).filter((g) => g.items.length > 0)
}
