/**
 * Types for the WoW Forever client-data snapshot in this folder, written by
 * scripts/scrape/client.mjs from raw client files (wago.tools API, decision D16) parsed with
 * WoWDBDefs. See docs/data/client.md for provenance, caveats and the hotfix warning.
 *
 * Usage:
 *   import spellsJson from '@/data/client/spells.json'
 *   import type { ClientSpells } from '@/data/client/types'
 *   const spells = spellsJson as unknown as ClientSpells
 *   const bloodthirst = spells.spells['23894']
 *
 * Field names are the WoWDBDefs column names in camelCase (RecoveryTime → recoveryTime,
 * EffectBasePointsF → effectBasePointsF, …ID → …Id, Name_lang → name).
 *
 * Units are the client's: times in milliseconds, ranges and radii in yards, costs in the
 * power's own unit (rage and runic power in tenths: 300 = 30 rage), percentages as whole
 * numbers (35 = 35%), proc chance 0–100 (101 = always), bit masks as signed 32-bit ints.
 *
 * **spells.json omits zero values** to stay small: a field that is absent is 0 (numbers), all
 * zeros (arrays) or "no row in that table" (objects). `id`, `name`, `effects` and `sources`
 * are always present, and so are each effect's `effectIndex` and `effect`. The one exception is
 * `effectChainAmplitude`, whose default is 1: absent means 1, and a 0 is written.
 */

/** The `meta` envelope every file in this folder starts with. */
export interface ClientDataMeta {
  source: 'https://wago.tools/api/casc'
  /** wago.tools product, e.g. "wow_classic_beta" (WoW Forever beta). */
  product: string
  /** Client build, e.g. "1.60.1.69913". */
  build: string
  /**
   * When wago.tools recorded the build ("YYYY-MM-DD hh:mm:ss"), from its build list, whichever
   * build is cached as latest; null only if the list lacks the build.
   */
  buildCreatedAt: string | null
  /** Tables and game-table files read → their FileDataID. */
  tables: Record<string, number>
  wowDbDefs: { repository: 'https://github.com/wowdev/WoWDBDefs'; commit: string }
  /** Latest download time of the files read (ISO 8601, UTC, from the cache metadata). */
  scrapedAt: string
  scraper: 'scripts/scrape/client.mjs'
}

// ---------------------------------------------------------------------------
// spells.json
// ---------------------------------------------------------------------------

/** Why a spell is in the extracted set. */
export type SpellSource =
  | 'spellbook' // a Forever rank in src/data/spells/<class>.json
  | 'talent' // a talent's TraitDefinition spell
  | 'racial' // a racial of src/data/races/races.json
  | 'item' // an ItemEffect spell of src/data/items/pre-bis.json
  | 'consumable' // an ItemEffect spell of a consumable named in the buffs doc
  | 'enchant' // an enchanting spell, or a spell an enchant casts
  | 'buffsDoc' // a buff or debuff spell id in docs/mechanics/buffs-debuffs-consumables.md
  | 'docs' // cited by id in docs/classes, docs/mechanics or docs/open-questions.md
  | 'trigger' // reached through another extracted spell's effectTriggerSpell

/** SpellMisc. */
export interface SpellMisc {
  /** Attributes[0..16] (the SPELL_ATTR bit sets). */
  attributes?: number[]
  /** Damage school bit mask: 1 Physical, 2 Holy, 4 Fire, 8 Nature, 16 Frost, 32 Shadow, 64 Arcane. */
  schoolMask?: number
  /** Projectile speed, yards per second. */
  speed?: number
  minDuration?: number
  spellIconFileDataId?: number
}

/** SpellEffect (DifficultyID 0 rows), ordered by effectIndex. */
export interface SpellEffect {
  effectIndex: number
  /** SpellEffectName: 2 SCHOOL_DAMAGE, 3 DUMMY, 6 APPLY_AURA, 17 WEAPON_DAMAGE_NOSCHOOL, 31 WEAPON_PERCENT_DAMAGE, 58 WEAPON_DAMAGE, 63 THREAT, 121 NORMALIZED_WEAPON_DMG, … */
  effect: number
  /** AuraType when effect is an aura (6 APPLY_AURA, 35 AREA_AURA_PARTY, …). */
  effectAura?: number
  /** Base points. Unlike old clients there is no "+1": the value is the value. */
  effectBasePointsF?: number
  /** Random spread as a fraction of the base (this client has no DieSides column). */
  variance?: number
  effectRealPointsPerLevel?: number
  /** Extra points per combo point (finishers). */
  effectPointsPerResource?: number
  /** Spell power coefficient. */
  effectBonusCoefficient?: number
  /** Attack power coefficient (zero for every extracted spell in 1.60.1.69913; AP scaling sits in dummy effects). */
  bonusCoefficientFromAp?: number
  effectTriggerSpell?: number
  effectMiscValue?: number[]
  /** SpellRadius ids for the two implicit targets; see `ClientSpells.radii`. */
  effectRadiusIndex?: number[]
  effectAmplitude?: number
  /** Periodic tick interval, ms. */
  effectAuraPeriod?: number
  effectChainTargets?: number
  /**
   * EffectChainAmplitude, written only when it isn't the client's default 1 (so absent means 1,
   * and a 0 is kept): a chain spell's falloff, and Execute's rage-to-damage factor (20662: 1.5;
   * its tooltip's `$*10;F1` is 15 damage per extra rage; docs/classes/warrior.md §3.1).
   */
  effectChainAmplitude?: number
  effectMechanic?: number
  /** SpellClassMask of the spells this effect modifies (talents, set bonuses). */
  effectSpellClassMask?: number[]
  implicitTarget?: number[]
}

/** SpellProcsPerMinute (+ SpellProcsPerMinuteMod rows, of which this client ships none). */
export interface SpellPpm {
  baseProcRate?: number
  flags?: number
  mods?: { type?: number; param?: number; coeff?: number }[]
}

/** SpellAuraOptions. */
export interface SpellAuraOptions {
  /** 0–100; 101 means "always". */
  procChance?: number
  procCharges?: number
  /** Proc trigger flags (PROC_FLAG_*), two words. */
  procTypeMask?: number[]
  /** Internal cooldown between procs, ms. */
  procCategoryRecovery?: number
  /** Maximum stacks. */
  cumulativeAura?: number
  spellProcsPerMinuteId?: number
  ppm?: SpellPpm
}

/** SpellCooldowns. */
export interface SpellCooldowns {
  recoveryTime?: number
  categoryRecoveryTime?: number
  /** Global cooldown triggered, ms. */
  startRecoveryTime?: number
}

/** SpellCategories; `category` and `startRecoveryCategory` resolve in `ClientSpells.spellCategories`. */
export interface SpellCategories {
  category?: number
  /** GCD category (133 = the standard GCD). */
  startRecoveryCategory?: number
  /** 0 none, 1 magic, 2 melee, 3 ranged. */
  defenseType?: number
  dispelType?: number
  mechanic?: number
  preventionType?: number
  diminishType?: number
}

/** SpellPower row. */
export interface SpellPower {
  /** 0 mana, 1 rage, 2 focus, 3 energy, … */
  powerType?: number
  /** Cost in the power's unit (rage in tenths). */
  manaCost?: number
  /** Cost as % of base mana. */
  powerCostPct?: number
  optionalCost?: number
}

export interface SpellLevels {
  baseLevel?: number
  spellLevel?: number
  /** Level at which per-level scaling stops (0 = no cap recorded). */
  maxLevel?: number
}

/** SpellShapeshift: forms/stances required (mask) or forbidden (exclude), bit = form id − 1. */
export interface SpellShapeshift {
  shapeshiftMask?: number[]
  shapeshiftExclude?: number[]
}

/** SpellClassOptions: the class family and mask talents use to modify spells. */
export interface SpellClassOptions {
  spellClassSet?: number
  spellClassMask?: number[]
}

export interface SpellEquippedItems {
  equippedItemClass?: number
  equippedItemSubclass?: number
  equippedItemInvTypes?: number
}

export interface SpellTargetRestrictions {
  maxTargets?: number
  maxTargetLevel?: number
  targetCreatureType?: number
  targets?: number
  coneDegrees?: number
}

export interface SpellAuraRestrictions {
  casterAuraState?: number
  targetAuraState?: number
  excludeCasterAuraState?: number
  excludeTargetAuraState?: number
  casterAuraSpell?: number
  targetAuraSpell?: number
  excludeCasterAuraSpell?: number
  excludeTargetAuraSpell?: number
}

export interface ClientSpell {
  id: number
  /** SpellName. */
  name: string
  /** Spell.NameSubtext ("Rank 5", "Passive"). */
  nameSubtext?: string
  misc?: SpellMisc
  /** SpellCastTimes row of misc's castingTimeIndex, ms. */
  castTime?: { base?: number; minimum?: number }
  /** SpellDuration row of misc's durationIndex, ms (−1 = until cancelled). */
  duration?: { duration?: number; maxDuration?: number }
  /** SpellRange row of misc's rangeIndex: [hostile, friendly] yards. */
  range?: { rangeMin?: number[]; rangeMax?: number[]; flags?: number }
  effects: SpellEffect[]
  auraOptions?: SpellAuraOptions
  cooldowns?: SpellCooldowns
  categories?: SpellCategories
  power?: SpellPower[]
  levels?: SpellLevels
  shapeshift?: SpellShapeshift
  classOptions?: SpellClassOptions
  equippedItems?: SpellEquippedItems
  targetRestrictions?: SpellTargetRestrictions
  auraRestrictions?: SpellAuraRestrictions
  sources: SpellSource[]
}

/** A racial resolved to its Forever spell(s) through SkillLineAbility. */
export interface ClientRacial {
  /** Racial id in src/data/races/races.json. */
  id: string
  name: string
  classicSpellId: number | null
  /** Per-class variants carry a classMask (bit = 1 << (classId − 1)); 0 or −1 = every class. */
  spells: { spellId: number; classMask: number; skillLine: number; acquireMethod: number }[]
}

export interface ClientSpells {
  meta: ClientDataMeta
  counts: {
    spells: number
    /** Spells before the effectTriggerSpell closure. */
    seeds: number
    bySource: Partial<Record<SpellSource, number>>
    notInClient: number
    /** SpellName records in encrypted sections the client can't read (key not shipped). */
    encryptedSpellNameRecords: number
  }
  /** Ids an input names that the client doesn't have. */
  notInClient: { id: number; sources: SpellSource[]; encrypted: boolean }[]
  /** World-buff spells left out on purpose (decision D8), id → name. */
  excludedWorldBuffs: Record<string, string>
  /** Race id (races.json) → its ChrRaces row and resolved racials. */
  racials: Record<string, { chrRacesId: number; playableRaceBit: number; racials: ClientRacial[] }>
  /** SpellRadius rows by id, yards. */
  radii: Record<string, { radius: number; radiusMin: number; radiusMax: number; radiusPerLevel: number }>
  /** SpellCategory rows by id. */
  spellCategories: Record<string, { name: string; flags: number; maxCharges: number; chargeRecoveryTime: number; typeMask: number }>
  /** Spell id → record. */
  spells: Record<string, ClientSpell>
}

// ---------------------------------------------------------------------------
// talents.json
// ---------------------------------------------------------------------------

export interface ClientTalentRankEffect {
  /** SpellEffect index of the talent spell this curve sets. */
  effectIndex: number
  /** TraitDefinitionEffectPoints.OperationType (0 = set the effect's points). */
  operationType: number
  curveId: number
  /** Value at rank 1..maxRank (index 0 = rank 1). */
  values: number[]
}

export interface ClientTalent {
  /** Talent id in src/data/talents/<class>.json. */
  id: string
  name: string
  /** Name in the client (TraitDefinition override or SpellName). */
  clientName: string
  tree: string
  tier: number
  col: number
  maxRank: number
  matchedBy: 'name' | 'position'
  traitNodeId: number
  traitNodeEntryId: number
  traitDefinitionId: number
  /** The talent's spell. Every rank uses it; per-rank values are in `rankEffects`. */
  spellId: number
  visibleSpellId: number
  overridesSpellId: number
  /** Spell id per rank (index 0 = rank 1). */
  rankSpellIds: number[]
  rankEffects: ClientTalentRankEffect[]
  /** Position and prerequisites as the client lays them out. */
  client: { tier: number; col: number; prerequisiteNodeIds: number[]; prerequisiteTalentIds: (string | null)[] }
  /** Differences from the scraped talent (position, max rank, prerequisite). */
  mismatches: string[]
}

export interface ClientTalents {
  meta: ClientDataMeta
  counts: { talents: number; mapped: number; byName: number; byPosition: number; unmapped: number }
  unmapped: { class: string; tree: string; talentId: string; name: string; reason: string }[]
  classes: Record<
    'warrior' | 'druid' | 'paladin' | 'shaman' | 'rogue',
    { traitTreeId: number; tabs: { tree: string; index: number; posX: [number, number] | null }[]; talents: ClientTalent[] }
  >
}

// ---------------------------------------------------------------------------
// items.json
// ---------------------------------------------------------------------------

/** ItemEffect row. */
export interface ClientItemEffect {
  id: number
  legacySlotIndex: number
  /** 0 on use, 1 on equip, 2 chance on hit, … */
  triggerType: number
  spellId: number
  /** −1 = unlimited. */
  charges: number
  /** Own cooldown, ms (−1 = none). */
  coolDownMSec: number
  /** Shared category cooldown, ms (−1 = none). */
  categoryCoolDownMSec: number
  /** Shared cooldown category (SpellCategory id). */
  spellCategoryId: number
  chrSpecializationId: number
  playerConditionId: number
}

/** Item row (present for every item the client knows). */
export interface ClientItemRow {
  classId: number
  subclassId: number
  inventoryType: number
  material: number
  sheatheType: number
  iconFileDataId: number
}

/** ItemSparse row (null when the client has no row: see docs/data/client.md). */
export interface ClientItemSparse {
  display: string
  itemLevel: number
  requiredLevel: number
  overallQualityId: number
  inventoryType: number
  bonding: number
  /** Weapon speed, ms. */
  itemDelay: number
  /** Weapon damage school (0 physical). */
  damageType: number
  dmgVariance: number
  itemRange: number
  sheatheType: number
  material: number
  itemSet: number
  allowableClass: number
  allowableRace: number[]
  requiredSkill: number
  requiredSkillRank: number
  maxCount: number
  /** Stat types (ItemModType, −1 = none) … */
  statModifierBonusStat: number[]
  /** … and their budget allocations (not flat amounts; the scraped tooltips carry the amounts). */
  statPercentEditor: number[]
  flags: number[]
}

export interface ClientItem {
  id: number
  item: ClientItemRow | null
  itemSparse: ClientItemSparse | null
  effects: ClientItemEffect[]
}

export interface ClientConsumable extends ClientItem {
  doc: { name: string; section: string; spellIds: number[]; enchantIds: number[] }
  /** Enchants the item's spells apply (weapon stones and oils). */
  appliesEnchantIds: number[]
  /** Where the client disagrees with the buffs doc's item → spell / enchant mapping. */
  docMismatches: string[]
}

export interface ClientItems {
  meta: ClientDataMeta
  counts: Record<string, number>
  /** Every item of src/data/items/pre-bis.json, by id. */
  items: Record<string, ClientItem>
  /** Consumables named in the buffs doc, by item id. */
  consumables: Record<string, ClientConsumable>
}

// ---------------------------------------------------------------------------
// enchants.json
// ---------------------------------------------------------------------------

export interface ClientEnchant {
  id: number
  name: string
  /** Temporary enchant duration, seconds (0 = permanent). */
  duration: number
  charges: number
  /** Effect type per slot: 1 combat spell (proc), 2 damage, 3 equip spell, 4 resistance, 5 stat, 7 use spell. */
  effect: number[]
  effectPointsMin: number[]
  /** Spell id (types 1, 3, 7), stat type (5) or resistance school (4) per slot. */
  effectArg: number[]
  effectScalingPoints: number[]
  scalingClass: number
  flags: number
  requiredSkillId: number
  requiredSkillRank: number
  minLevel: number
  maxLevel: number
  itemLevel: number
  itemLevelMin: number
  itemLevelMax: number
  /** The spells the enchant casts (effect types 1, 3, 7). */
  spellIds: number[]
  /** Spells that apply this enchant (ENCHANT_ITEM, ENCHANT_ITEM_TEMPORARY, ENCHANT_HELD_ITEM). */
  appliedBySpellIds: number[]
  /** Items whose ItemEffect spell applies it (scrolls, stones, arcanums). */
  appliedByItemIds: number[]
  /** Where the buffs doc lists it. */
  doc: { name: string; section: string }[]
}

export interface ClientEnchants {
  meta: ClientDataMeta
  counts: { docEnchants: number; inClient: number; notInClient: number }
  notInClient: number[]
  docMismatches: string[]
  enchants: Record<string, ClientEnchant>
}

// ---------------------------------------------------------------------------
// gametables.json
// ---------------------------------------------------------------------------

export interface ClientPlayerExpectedStat {
  classId: number
  baseMana: number
  /** Crit chance per point of Agility, as a fraction (0.0005 = 0.05%, i.e. 20 Agi per 1%). */
  critPerAgility: number
  spellCritPerIntellect: number
  /** Unnamed WoWDBDefs columns (Field_1_60_1_69876_005 / _006). */
  field5: number
  field6: number
}

export interface ClientGameTables {
  meta: ClientDataMeta
  level: 60
  /** gametables/combatratings.txt: rating per 1% (Defense Skill: per point). */
  combatRatings: { level60: Record<string, number>; sameAtEveryLevel: boolean; levels: number }
  /** gametables/basemp.txt, by class. */
  baseMana: { level60: Record<string, number> }
  /** gametables/hppersta.txt. */
  hpPerStamina: { level60: number | null }
  /** gametables/armormitigationbylvl.txt "Constant", by attacker level (a retail leftover per the damage doc). */
  armorMitigation: { byLevel: Record<string, number | null> }
  /** PlayerExpectedStat (DB2), by class. */
  playerExpectedStat: { level60: Record<string, ClientPlayerExpectedStat> }
}
