// The derived-stat pipeline (docs/mechanics/character-stats.md#derived-stat-pipeline).
//
// A StatBlock collects every source (race and class base, gear, enchants, buffs, talents,
// racials) as base values, flat additions and multipliers. `deriveStats` turns it into the
// numbers the character sheet shows and combat uses, in the documented order: flat adds, then %
// attribute multipliers, then floor, then conversions. The engine calls the same function when an
// aura that changes attributes starts or ends, so the sheet and combat can't disagree.
import { DEFENSE_PER_POINT } from '../core/attack-table'
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
  /** Mental Dexterity (docs/classes/shaman.md#talents): attack power per point of Intellect. */
  apPerInt = 0
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
  /**
   * Sum of bonus-armor % bonuses, as a fraction: it multiplies `bonusArmor` only (Forever's Dire
   * Bear Form aura 466, +360% [?]: docs/classes/druid.md §4.7, character-stats.md OQ-8).
   */
  bonusArmorPct = 0
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

  // Spell damage (paladin.md#conventions-used-below "SP"): all schools (gear's Spell Power and
  // Spell Damage lines, consumables), Holy only, and Champion of the Light's share of Intellect, %.
  spellDamage = 0
  holySpellDamage = 0
  spellDamagePerIntPct = 0
  // The other schools' own spell damage lines (docs/mechanics/spells.md §5), each added to the
  // all-schools one; spell penetration, and casting speed, a product like `haste` (§3, §4).
  fireSpellDamage = 0
  frostSpellDamage = 0
  shadowSpellDamage = 0
  natureSpellDamage = 0
  arcaneSpellDamage = 0
  spellPen = 0
  castHaste = 1

  // Pools.
  baseHealth = 0
  health = 0
  healthMult = 1
  hasMana = false
  baseMana = 0
  mana = 0
  /** Mana per 5 s from gear and buffs (character-stats.md#spirit-and-mana-regeneration). */
  mp5 = 0

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
  /**
   * How much defense above 5 × level lowers an attacker's crit chance, % (0.04 per point; negative
   * below it): the sheet's "−5.60% Critical Strike chance" at 440 (character-stats#defense-skill,
   * combat-tables §8).
   */
  critReduction = 0
  dodge = 0
  parry = 0
  block = 0
  blockValue = 0
  health = 0
  mana = 0
  /**
   * Holy spell damage ("SP" in paladin.md#conventions-used-below): all-schools spell damage, Holy
   * spell damage and Champion of the Light's share of Intellect.
   */
  holySpellDamage = 0
  /** Each other school's spell damage: all-schools spell damage plus its own (docs/mechanics/spells.md §5). */
  fireSpellDamage = 0
  frostSpellDamage = 0
  shadowSpellDamage = 0
  natureSpellDamage = 0
  arcaneSpellDamage = 0
  /**
   * Casting speed as a multiplier: Π(1 + casting speed) × (1 + haste rating's %), which divides the
   * cast time of the spells it hastens (docs/mechanics/spells.md §4). 1 without any.
   */
  castHasteMult = 1
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
    (b.baseAp + b.apPerStr * out.strength + b.apPerAgi * out.agility + b.apPerInt * out.intellect + b.ap) * b.apMult,
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

  // docs/mechanics/character-stats.md#defense-skill: 0.04% per point above 5 × level to being
  // missed, dodge, parry and block, and off the attacker's crit chance.
  const baseDefense = 5 * o.level
  out.defense = baseDefense + b.defenseRating / r.defense + b.defense
  const defenseBonus = (out.defense - baseDefense) * DEFENSE_PER_POINT
  out.critReduction = defenseBonus
  out.dodge = b.baseDodge + out.agility * b.dodgePerAgi + b.dodgeRating / r.dodge + b.dodge + defenseBonus
  out.parry = b.canParry ? b.baseParry + b.parryRating / r.parry + b.parry + defenseBonus : 0
  out.block = b.canBlock ? b.baseBlock + b.blockRating / r.block + b.block + defenseBonus : 0
  // Block value = (shield + flat + Str/20) × Π(1 + bv%) (character-stats §strength).
  out.blockValue = b.canBlock ? floorStat((b.blockValue + floorStat(out.strength / 20)) * b.blockValueMult) : 0
  // Armor = item armor × (1 + Toughness) + bonus armor × (1 + bonus armor %) + 2 × Agi (character-stats
  // step 4; OQ-15 [?]; the bonus armor % is the Dire Bear Form's, OQ-8 [?]).
  out.armor = floorStat(b.itemArmor * (1 + b.itemArmorPct) + b.bonusArmor * (1 + b.bonusArmorPct) + b.armorPerAgi * out.agility)

  out.health = floorStat((b.baseHealth + healthFromStamina(out.stamina) + b.health) * b.healthMult)
  out.mana = b.hasMana ? b.baseMana + manaFromIntellect(out.intellect) + b.mana : 0
  // docs/mechanics/spells.md §5: each school's own line adds to the all-schools one, and so does a
  // talent's share of Intellect: the paladin's Champion of the Light ("up to 100% of your Intellect";
  // the floor is [?], paladin.md#retribution-tree, #conventions-used-below: SP = all schools plus
  // Holy) and the shaman's Mental Quickness (30%, shaman.md#spell-damage).
  const allSchools = b.spellDamage + floorStat((out.intellect * b.spellDamagePerIntPct) / 100)
  out.holySpellDamage = allSchools + b.holySpellDamage
  out.fireSpellDamage = allSchools + b.fireSpellDamage
  out.frostSpellDamage = allSchools + b.frostSpellDamage
  out.shadowSpellDamage = allSchools + b.shadowSpellDamage
  out.natureSpellDamage = allSchools + b.natureSpellDamage
  out.arcaneSpellDamage = allSchools + b.arcaneSpellDamage
  // docs/mechanics/spells.md §4: casting speed, with haste rating's % where it applies (D12) [?].
  out.castHasteMult = b.castHaste * (1 + out.hasteRatingPct / 100)
  return out
}
