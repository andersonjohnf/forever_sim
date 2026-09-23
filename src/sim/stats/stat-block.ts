// The derived-stat pipeline (docs/mechanics/character-stats.md#derived-stat-pipeline).
//
// A StatBlock collects every source (race and class base, gear, enchants, buffs, talents,
// racials) as base values, flat additions and multipliers. `deriveStats` turns it into the
// numbers the character sheet shows and combat uses, in the documented order: flat adds, then %
// attribute multipliers, then floor, then conversions. The engine calls the same function when an
// aura that changes attributes starts or ends, so the sheet and combat can't disagree.
import type { RulesProfile } from '../rules/profiles'

/** Floor with a tiny epsilon so exact products (1820 × 1.05) don't land on …999 (character-stats implementation notes). */
export const floorStat = (x: number) => Math.floor(x + 1e-9)

export class StatBlock {
  // Attributes: base (race + class row), flat additions, multipliers (products).
  baseStr = 0
  baseAgi = 0
  baseSta = 0
  baseInt = 0
  baseSpi = 0
  str = 0
  agi = 0
  sta = 0
  int = 0
  spi = 0
  strMult = 1
  agiMult = 1
  staMult = 1
  intMult = 1
  spiMult = 1

  // Attack power: class base + per-attribute + flat, then × multiplier.
  baseAp = 0
  apPerStr = 2
  apPerAgi = 0
  ap = 0
  apMult = 1

  // Crit and hit (percentage points; ratings converted by the profile).
  baseCrit = 0
  critPerAgi = 0
  /** Crit from auras: gear "+x% crit" lines, talents, buffs, stances, racials. */
  crit = 0
  critRating = 0
  hit = 0
  hitRating = 0
  baseSpellCrit = 0
  spellCritPerInt = 0
  spellCrit = 0
  spellHit = 0

  // Haste: flat multipliers (product) and rating.
  haste = 1
  hasteRating = 0

  // Forever's new stats (D12).
  expertise = 0
  expertiseRating = 0
  armorPen = 0

  // Defense.
  /** Item armor: a Forever item's base armor, or a Classic Era fallback item's stored armor. */
  itemArmor = 0
  /**
   * Sum of item-armor % bonuses (Toughness), as a fraction. It multiplies `itemArmor` only, not
   * `bonusArmor` (Forever's stat 50, enchants, buffs) [?] (character-stats.md#derived-stat-pipeline, OQ-15).
   */
  itemArmorPct = 0
  bonusArmor = 0
  armorPerAgi = 2
  defense = 0
  defenseRating = 0
  baseDodge = 0
  dodgePerAgi = 0.05
  dodge = 0
  dodgeRating = 0
  canParry = false
  baseParry = 0
  parry = 0
  parryRating = 0
  canBlock = false
  baseBlock = 0
  block = 0
  blockRating = 0
  blockValue = 0
  blockValueMult = 1

  // Pools.
  baseHealth = 0
  health = 0
  healthMult = 1
  hasMana = false
  baseMana = 0
  mana = 0

  copyFrom(o: StatBlock): this {
    Object.assign(this, o)
    return this
  }
}

/** Numbers derived from a StatBlock (character-stats step 4). */
export class DerivedStats {
  strength = 0
  agility = 0
  stamina = 0
  intellect = 0
  spirit = 0
  attackPower = 0
  /** Sheet melee crit %, without per-weapon bonuses. */
  crit = 0
  /** The part of `crit` that comes from auras (combat-tables §4.4). */
  auraCrit = 0
  hit = 0
  spellCrit = 0
  spellHit = 0
  /** Haste from rating, % (0 when D12's switch or the profile turns it off). */
  hasteRatingPct = 0
  /** Π(1 + haste) over static sources, including rating haste. */
  hasteMult = 1
  expertise = 0
  armorPen = 0
  armor = 0
  defense = 0
  dodge = 0
  parry = 0
  block = 0
  blockValue = 0
  health = 0
  mana = 0
}

export interface DeriveOptions {
  profile: RulesProfile
  /** D12: apply haste rating, expertise and armor penetration by hypothesis. */
  applyUnmeasured: boolean
  level: number
}

/** Health from Stamina: the first 20 give 1 each, the rest 10 each (character-stats §stamina). */
export const healthFromStamina = (sta: number) => Math.min(sta, 20) + 10 * Math.max(sta - 20, 0)

/** Mana from Intellect: the first 20 give 1 each, the rest 15 each (character-stats §intellect). */
export const manaFromIntellect = (int: number) => Math.min(int, 20) + 15 * Math.max(int - 20, 0)

/** Runs the pipeline. Writes into `out` (no allocation), and returns it. */
export function deriveStats(b: StatBlock, o: DeriveOptions, out: DerivedStats = new DerivedStats()): DerivedStats {
  const r = o.profile.ratings
  const unmeasured = o.applyUnmeasured && r.unmeasuredStats

  // Step 3: attributes = floor((base + flat) × Π(1 + p)).
  out.strength = floorStat((b.baseStr + b.str) * b.strMult)
  out.agility = floorStat((b.baseAgi + b.agi) * b.agiMult)
  out.stamina = floorStat((b.baseSta + b.sta) * b.staMult)
  out.intellect = floorStat((b.baseInt + b.int) * b.intMult)
  out.spirit = floorStat((b.baseSpi + b.spi) * b.spiMult)

  // Step 4: conversions.
  out.attackPower = floorStat(
    (b.baseAp + b.apPerStr * out.strength + b.apPerAgi * out.agility + b.ap) * b.apMult,
  )
  const ratingCrit = b.critRating / r.crit
  out.auraCrit = b.crit + ratingCrit
  out.crit = b.baseCrit + out.agility * b.critPerAgi + out.auraCrit
  const ratingHit = b.hitRating / r.hit
  out.hit = b.hit + ratingHit
  out.spellHit = b.spellHit + ratingHit
  out.spellCrit = b.baseSpellCrit + out.intellect * b.spellCritPerInt + ratingCrit + b.spellCrit

  out.hasteRatingPct = unmeasured ? b.hasteRating / r.haste : 0
  out.hasteMult = b.haste * (1 + out.hasteRatingPct / 100)
  out.expertise = o.profile.combat.expertise ? b.expertise + (unmeasured ? b.expertiseRating / r.expertise : 0) : 0
  out.armorPen = unmeasured ? b.armorPen : 0

  const baseDefense = 5 * o.level
  out.defense = baseDefense + b.defenseRating / r.defense + b.defense
  const defenseBonus = (out.defense - baseDefense) * 0.04
  out.dodge = b.baseDodge + out.agility * b.dodgePerAgi + b.dodgeRating / r.dodge + b.dodge + defenseBonus
  out.parry = b.canParry ? b.baseParry + b.parryRating / r.parry + b.parry + defenseBonus : 0
  out.block = b.canBlock ? b.baseBlock + b.blockRating / r.block + b.block + defenseBonus : 0
  // Block value = (shield + flat + Str/20) × Π(1 + bv%) (character-stats §strength).
  out.blockValue = b.canBlock ? floorStat((b.blockValue + floorStat(out.strength / 20)) * b.blockValueMult) : 0
  // Armor = item armor × (1 + Toughness) + bonus armor + 2 × Agi (character-stats step 4; OQ-15 [?]).
  out.armor = floorStat(b.itemArmor * (1 + b.itemArmorPct) + b.bonusArmor + b.armorPerAgi * out.agility)

  out.health = floorStat((b.baseHealth + healthFromStamina(out.stamina) + b.health) * b.healthMult)
  out.mana = b.hasMana ? b.baseMana + manaFromIntellect(out.intellect) + b.mana : 0
  return out
}
