// Derives an item's sim-ready stats from client tables: ItemSparse (+ Item) → the `Stats`
// amounts, the `Weapon` block, armor, bonus armor, block value, resistances, equip-spell
// stats, use/proc effect records and set membership. Pure functions, zero dependencies:
// callers pass parsed table rows (see ITEM_TABLES) and get plain objects back.
// See docs/data/client.md#items-from-the-client for the formulas and their evidence.
//
// Two layouts:
//   * Forever (wow_classic_beta 1.60.x): ItemSparse stores stat BUDGET ALLOCATIONS
//     (StatPercentEditor, 1/10000 of the item's budget) under retail-style stat types
//     (StatModifier_bonusStat), and no armor, damage or resistance columns. Amounts come from
//     RandPropPoints, armor from ItemArmorQuality/ItemArmorTotal/ArmorLocation/ItemArmorShield,
//     weapon damage from the ItemDamage* tables.
//   * Classic Era (wow_classic_era 1.15.x): ItemSparse stores amounts directly
//     (StatModifier_bonusAmount), armor and resistances in Resistances[7] and damage in
//     MinDamage/MaxDamage; secondary stats are equip spells.

/** Tables the derivation reads (both builds). */
export const ITEM_TABLES = [
  "ItemSparse",
  "Item",
  "ItemEffect",
  "ItemXItemEffect", // Forever only; Classic Era links through ItemEffect.ParentItemID
  "ItemSet",
  "ItemSetSpell",
  "RandPropPoints",
  "ItemArmorQuality",
  "ItemArmorTotal",
  "ItemArmorShield",
  "ArmorLocation",
  "ItemDamageOneHand",
  "ItemDamageOneHandCaster",
  "ItemDamageTwoHand",
  "ItemDamageTwoHandCaster",
  "ItemDamageRanged",
  "ItemDamageThrown",
  "ItemDamageWand",
  "SpellEffect",
  "SpellName",
  "SpellCooldowns",
  "SpellCastingRequirements", // RequiredAreasID: zone-restricted equip spells aren't flat stats
  "SpellShapeshift", // ShapeshiftMask: form-restricted equip spells aren't flat stats
  "SpellEquippedItems", // weapon-restricted equip spells ("hit with ranged weapons") aren't flat stats
];

/** Game tables the derivation reads when the build ships them (Classic Era only). */
export const ITEM_GAMETABLES = { shieldBlock: "gametables/shieldblockregular.txt" };

// ---------------------------------------------------------------------------
// Lookup tables
// ---------------------------------------------------------------------------

/** InventoryType → our `ItemSlot`. */
export const SLOT = {
  1: "head",
  2: "neck",
  3: "shoulder",
  5: "chest",
  6: "waist",
  7: "legs",
  8: "feet",
  9: "wrist",
  10: "hands",
  11: "finger",
  12: "trinket",
  13: "oneHand",
  14: "shield",
  15: "ranged",
  16: "back",
  17: "twoHand",
  20: "chest",
  21: "mainHand",
  22: "offHand",
  23: "heldInOffHand",
  25: "thrown",
  26: "ranged",
  28: "relic",
};

/**
 * InventoryType → RandPropPoints column index ("slot group"): 0 head, chest, legs, two-hand;
 * 1 shoulder, waist, feet, hands, trinket; 2 neck, wrist, finger, shield, back, held in off
 * hand; 3 one-hand, main hand, off hand weapons; 4 ranged, thrown, wands, relics.
 */
export const BUDGET_GROUP = {
  1: 0, 4: 0, 5: 0, 7: 0, 17: 0, 20: 0,
  3: 1, 6: 1, 8: 1, 10: 1, 12: 1,
  2: 2, 9: 2, 11: 2, 14: 2, 16: 2, 23: 2,
  13: 3, 21: 3, 22: 3,
  15: 4, 25: 4, 26: 4, 28: 4,
};

/** Weapon subclass → `WeaponSkill`. */
export const WEAPON_SKILL = {
  0: "Axes",
  1: "Two-Handed Axes",
  2: "Bows",
  3: "Guns",
  4: "Maces",
  5: "Two-Handed Maces",
  6: "Polearms",
  7: "Swords",
  8: "Two-Handed Swords",
  10: "Staves",
  13: "Fist Weapons",
  15: "Daggers",
  16: "Thrown",
  18: "Crossbows",
  19: "Wands",
};

/** SkillLine id → `WeaponSkill` (MOD_SKILL auras). Skill 95 is Defense. */
export const SKILL_LINE_WEAPON = {
  43: "Swords",
  44: "Axes",
  45: "Bows",
  46: "Guns",
  54: "Maces",
  55: "Two-Handed Swords",
  136: "Staves",
  160: "Two-Handed Maces",
  162: "Unarmed",
  172: "Two-Handed Axes",
  173: "Daggers",
  176: "Thrown",
  226: "Crossbows",
  228: "Wands",
  229: "Polearms",
  473: "Fist Weapons",
};
const SKILL_DEFENSE = 95;

/** ItemSparse.DamageType → `DamageSchool`. */
export const DAMAGE_SCHOOL = ["Physical", "Holy", "Fire", "Nature", "Frost", "Shadow", "Arcane"];

/** Classic Era Resistances[i] → stat (index 0 is armor; holy has no `Stats` key). */
const RESISTANCE_INDEX = [null, null, "fireResistance", "natureResistance", "frostResistance", "shadowResistance", "arcaneResistance"];
const ALL_RESISTANCES = ["fireResistance", "natureResistance", "frostResistance", "shadowResistance", "arcaneResistance"];

/** Creature-type bit (CreatureType id − 1) → `Stats` suffix; critters (bit 7) have none. */
const CREATURE_TYPE = ["Beasts", "Dragonkin", "Demons", "Elementals", "Giants", "Undead", "Humanoids", null, "Mechanical"];

/** Spell school bit → `Stats` prefix for school spell damage (bit 0 physical, 1 holy, …). */
const SCHOOL_SPELL_DAMAGE = [null, "holySpellDamage", "fireSpellDamage", "natureSpellDamage", "frostSpellDamage", "shadowSpellDamage", "arcaneSpellDamage"];
const MAGIC_SCHOOLS = 126; // holy | fire | nature | frost | shadow | arcane

/**
 * StatModifier_bonusStat (ItemModType) → `Stats` key, or `{ all: [...] }` for a stat that
 * adds to several keys, or `{ weaponSkill }`. Types 0–56 are the retail enum; 83+ are
 * Forever's own, identified from pool tooltips (`[F]`) or, where no pool item carries them,
 * from the Classic Era row of the same item (`[?]`, kept for completeness).
 */
export const STAT_TYPE = {
  0: "mana", // not in Stats; reported
  1: "health", // not in Stats; reported
  3: "agility",
  4: "strength",
  5: "intellect",
  6: "spirit",
  7: "stamina",
  12: "defenseRating",
  13: "dodgeRating",
  14: "parryRating",
  15: "blockRating",
  31: "hitRating",
  32: "critRating",
  36: "hasteRating",
  37: "expertiseRating",
  38: "attackPower",
  39: "rangedAttackPower",
  41: "healing",
  42: "spellDamage",
  43: "mp5",
  44: "armorPenetration",
  45: "spellPower",
  46: "healthRegen",
  47: "spellPenetration",
  48: "blockValue",
  50: "bonusArmor", // the Forever tooltip adds it to the white armor line
  51: "fireResistance",
  52: "frostResistance",
  53: "holyResistance", // not in Stats; reported
  54: "shadowResistance",
  55: "natureResistance",
  56: "arcaneResistance",
  // Forever-specific [F]: seen on pool items.
  85: "fireSpellDamage",
  87: "frostSpellDamage",
  88: "shadowSpellDamage",
  89: "arcaneSpellDamage",
  124: { all: ALL_RESISTANCES }, // "+N Spell Resistance"
  128: "attackPowerVsUndead",
  136: "spellDamageVsUndead",
  // Forever-specific [?]: no pool item has them; meaning inferred from the Classic Era row.
  83: "weaponDamage", // Might of Cenarius: Classic aura 13 (physical) +4, Forever 4
  84: "holySpellDamage",
  86: "natureSpellDamage", // Stormcloth Boots, Pridemail Leggings: Classic nature damage, same amounts
  90: { weaponSkill: "Two-Handed Axes" },
  91: { weaponSkill: "Two-Handed Maces" },
  96: { weaponSkill: "Daggers" },
  127: "attackPowerVsDemons",
  131: "attackPowerVsBeasts",
  135: "spellDamageVsDemons",
};

/** Keys STAT_TYPE may produce that `Stats` has no field for (reported, not summed). */
const NOT_IN_STATS = new Set(["mana", "health", "holyResistance"]);

/**
 * Equip-spell aura → stat, for SpellEffect rows with Effect 6 (APPLY_AURA). One documented
 * table (docs/data/client.md#aura--stat). `misc` is EffectMiscValue[0]. Returns a list of
 * [key, amount] pairs, `{ weaponSkill: [skill, amount] }`, or null when the aura isn't a
 * flat stat. Classic Era 1.15 numbers some auras differently from Forever (552, 564 there; 274
 * for block value here); no Classic Era spell of the pool uses 274 or 290.
 */
export const AURA_STAT = {
  13: (v, misc) => spellDamageByMask(v, misc), // MOD_DAMAGE_DONE (school mask; 1 = physical → weapon damage)
  22: (v, misc) => resistanceByMask(v, misc), // MOD_RESISTANCE (school mask; 1 = armor → bonus armor)
  29: (v, misc) => (misc === -1 ? PRIMARY.map((k) => [k, v]) : PRIMARY[misc] ? [[PRIMARY[misc], v]] : null), // MOD_STAT (-1 = all)
  30: (v, misc) => (misc === SKILL_DEFENSE ? [["defense", v]] : SKILL_LINE_WEAPON[misc] ? { weaponSkill: [SKILL_LINE_WEAPON[misc], v] } : null), // MOD_SKILL
  47: (v) => [["parry", v]], // MOD_PARRY_PERCENT
  49: (v) => [["dodge", v]], // MOD_DODGE_PERCENT
  51: (v) => [["block", v]], // MOD_BLOCK_PERCENT
  52: (v) => [["crit", v]], // MOD_WEAPON_CRIT_PERCENT (melee and ranged)
  290: (v) => [["crit", v], ["spellCrit", v]], // MOD_CRIT_PCT: all crit, attacks and spells (The Gladiator 5-piece)
  54: (v) => [["hit", v]], // MOD_HIT_CHANCE
  55: (v) => [["spellHit", v]], // MOD_SPELL_HIT_CHANCE
  57: (v) => [["spellCrit", v]], // MOD_SPELL_CRIT_CHANCE
  71: (v, misc) => (misc === MAGIC_SCHOOLS ? [["spellCrit", v]] : null), // MOD_SPELL_CRIT_CHANCE_SCHOOL
  552: (v, misc) => (misc === MAGIC_SCHOOLS ? [["spellCrit", v]] : null), // Classic Era 1.15: spell crit, school mask
  84: (v) => [["hp5", v]], // MOD_REGEN
  161: (v) => [["hp5", v]], // MOD_HEALTH_REGEN_IN_COMBAT: "Restores N health per 5 sec"
  85: (v, misc) => (misc === 0 ? [["mp5", v]] : null), // MOD_POWER_REGEN (0 = mana)
  99: (v) => [["attackPower", v]], // MOD_ATTACK_POWER (melee)
  124: (v) => [["rangedAttackPower", v]], // MOD_RANGED_ATTACK_POWER
  102: (v, misc) => byCreatureMask(v, misc, "attackPowerVs"), // MOD_MELEE_ATTACK_POWER_VERSUS
  131: (v, misc) => byCreatureMask(v, misc, "rangedAttackPowerVs"), // MOD_RANGED_ATTACK_POWER_VERSUS (merged below)
  180: (v, misc) => byCreatureMask(v, misc, "spellDamageVs"), // MOD_FLAT_SPELL_DAMAGE_VERSUS
  123: (v, misc) => (misc & MAGIC_SCHOOLS ? [["spellPenetration", -v]] : null), // MOD_TARGET_RESISTANCE (negative)
  135: (v) => [["healing", v]], // MOD_HEALING_DONE
  158: (v) => [["blockValue", v]], // MOD_SHIELD_BLOCKVALUE
  564: (v) => [["blockValue", v]], // Classic Era 1.15: shield block value
  274: (v) => [["blockValue", v]], // Forever: shield block value ("Increases the block value of your shield by N")
  189: (v, misc) => ratingsByMask(v, misc), // MOD_RATING (combat-rating mask)
};

/**
 * Auras that equip spells and set bonuses of the pool carry but that aren't flat `Stats`, each
 * with why. Every aura on an equip or set-bonus spell must be in AURA_STAT or here: the pool
 * generator warns about any other, and scripts/scrape/lib/item-pool.test.mjs fails
 * (docs/data/client.md#aura--stat).
 */
export const NOT_STAT_AURAS = {
  4: "dummy: scripted, or no effect",
  10: "MOD_THREAT: threat done %, not a Stats key",
  15: "DAMAGE_SHIELD: damage to attackers (a proc)",
  17: "MOD_STEALTH_DETECT",
  23: "PERIODIC_TRIGGER_SPELL (a pet's mana regeneration)",
  31: "MOD_INCREASE_SPEED: run speed",
  42: "PROC_TRIGGER_SPELL (a proc)",
  43: "PROC_TRIGGER_DAMAGE (a proc)",
  58: "MOD_INCREASE_SWIM_SPEED",
  77: "MECHANIC_IMMUNITY",
  107: "ADD_FLAT_MODIFIER: a class ability tweak",
  108: "ADD_PCT_MODIFIER: a class ability tweak",
  112: "OVERRIDE_CLASS_SCRIPTS: a class ability tweak",
  117: "MOD_MECHANIC_RESISTANCE",
  120: "UNTRACKABLE",
  129: "MOD_SPEED_ALWAYS: movement speed",
  154: "MOD_STEALTH_LEVEL",
  168: "MOD_DAMAGE_DONE_VERSUS: damage % against a creature type, not a Stats key",
  232: "MECHANIC_DURATION_MOD",
  255: "MOD_MECHANIC_DAMAGE_TAKEN_PERCENT",
  593: "chance for your attacks to be dodged or parried (Deathbone Guardian 5-piece), not a Stats key",
};

const PRIMARY = ["strength", "agility", "stamina", "intellect", "spirit"];

/**
 * CombatRating bit → `Stats` key for MOD_RATING auras (the melee bit of each rating; retail
 * enum). Two Forever set bonuses use aura 189, and their tooltips agree at the item ratings:
 * Necropile Raiment's 2-piece, mask 224 (hit) 5 → "0.5%" at 10 per 1%; Bloodmail Regalia's
 * 5-piece, mask 1792 (crit) 21 → "1.5%" at 14 per 1%. The other bits are unverified `[?]`.
 */
const RATING_BIT = { 1: "defenseRating", 2: "dodgeRating", 3: "parryRating", 4: "blockRating", 5: "hitRating", 8: "critRating", 17: "hasteRating", 23: "expertiseRating", 24: "armorPenetration" };

function spellDamageByMask(v, misc) {
  if (misc === 1) return [["weaponDamage", v]];
  if ((misc & MAGIC_SCHOOLS) === MAGIC_SCHOOLS) return [["spellDamage", v]];
  const out = [];
  for (let bit = 1; bit < SCHOOL_SPELL_DAMAGE.length; bit++) if (misc & (1 << bit)) out.push([SCHOOL_SPELL_DAMAGE[bit], v]);
  return out.length ? out : null;
}

function resistanceByMask(v, misc) {
  const out = [];
  if (misc & 1) out.push(["bonusArmor", v]);
  for (let bit = 2; bit < RESISTANCE_INDEX.length; bit++) if (misc & (1 << bit)) out.push([RESISTANCE_INDEX[bit], v]);
  return out.length ? out : null;
}

function byCreatureMask(v, misc, prefix) {
  const out = [];
  for (let bit = 0; bit < CREATURE_TYPE.length; bit++) if (misc & (1 << bit) && CREATURE_TYPE[bit]) out.push([`${prefix}${CREATURE_TYPE[bit]}`, v]);
  return out.length ? out : null;
}

function ratingsByMask(v, misc) {
  const out = Object.entries(RATING_BIT)
    .filter(([bit]) => misc & (1 << Number(bit)))
    .map(([, key]) => [key, v]);
  return out.length ? out : null;
}

/** ItemEffect.TriggerType → our trigger name. */
export const TRIGGER = { 0: "use", 1: "equip", 2: "chanceOnHit", 4: "soulstone", 5: "learn", 6: "looted" };

/** Proc auras: an equip spell carrying one is a proc (it fires on an event), not a stat. */
const PROC_AURAS = new Set([15, 42, 43]); // DAMAGE_SHIELD ("when struck"), PROC_TRIGGER_SPELL, PROC_TRIGGER_DAMAGE

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const rowsOf = (t) => (Array.isArray(t) ? t : (t?.rows ?? []));
const indexById = (t) => new Map(rowsOf(t).map((r) => [r.ID, r]));
function groupBy(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

/**
 * Build the lookups the derivation needs.
 * @param {Record<string, object[] | {rows: object[]}>} tables  ITEM_TABLES by name (rows or parsed table)
 * @param {{ shieldBlock?: Array<Record<string, number>> }} [gameTables]  rows of ITEM_GAMETABLES
 */
export function createItemContext(tables, gameTables = {}) {
  const t = (name) => tables[name];
  const itemEffects = new Map();
  const effects = indexById(t("ItemEffect"));
  if (rowsOf(t("ItemXItemEffect")).length) {
    for (const x of rowsOf(t("ItemXItemEffect"))) {
      const e = effects.get(x.ItemEffectID);
      if (!e) continue;
      if (!itemEffects.has(x.ItemID)) itemEffects.set(x.ItemID, []);
      itemEffects.get(x.ItemID).push(e);
    }
  } else {
    for (const e of effects.values()) {
      if (!e.ParentItemID) continue;
      if (!itemEffects.has(e.ParentItemID)) itemEffects.set(e.ParentItemID, []);
      itemEffects.get(e.ParentItemID).push(e);
    }
  }
  for (const list of itemEffects.values()) list.sort((a, b) => a.LegacySlotIndex - b.LegacySlotIndex || a.ID - b.ID);
  const spellEffects = groupBy(
    rowsOf(t("SpellEffect")).filter((e) => !e.DifficultyID),
    "SpellID",
  );
  for (const list of spellEffects.values()) list.sort((a, b) => a.EffectIndex - b.EffectIndex);
  const damage = {};
  for (const name of ["OneHand", "OneHandCaster", "TwoHand", "TwoHandCaster", "Ranged", "Thrown", "Wand"]) damage[name] = indexById(t(`ItemDamage${name}`));
  const shieldBlock = new Map((gameTables.shieldBlock ?? []).map((r) => [r.Level, r]));
  return {
    sparse: indexById(t("ItemSparse")),
    item: indexById(t("Item")),
    itemEffects,
    spellEffects,
    spellName: indexById(t("SpellName")),
    spellCooldowns: groupBy(rowsOf(t("SpellCooldowns")).filter((r) => !r.DifficultyID), "SpellID"),
    castingRequirements: groupBy(rowsOf(t("SpellCastingRequirements")), "SpellID"),
    shapeshift: groupBy(rowsOf(t("SpellShapeshift")).filter((r) => !r.DifficultyID), "SpellID"),
    equippedItems: groupBy(rowsOf(t("SpellEquippedItems")), "SpellID"),
    itemSet: indexById(t("ItemSet")),
    itemSetSpells: groupBy(rowsOf(t("ItemSetSpell")), "ItemSetID"),
    randPropPoints: indexById(t("RandPropPoints")),
    armorQuality: indexById(t("ItemArmorQuality")),
    armorTotal: indexById(t("ItemArmorTotal")),
    armorShield: indexById(t("ItemArmorShield")),
    armorLocation: indexById(t("ArmorLocation")),
    damage,
    shieldBlock,
  };
}

/** Whether a build's tables have a spell: a SpellName or SpellEffect row. */
export const hasSpell = (ctx, spellId) => ctx.spellName.has(spellId) || ctx.spellEffects.has(spellId);

/**
 * The context a fallback item (no Forever ItemSparse row, decision D6) is derived with: its Classic
 * Era item row (stats, armor, weapon, set), with its item effects the Forever client's wherever
 * Forever has them (tier 1, docs/data/items.md#effects-of-fallback-items):
 *   - every spell Forever has is read from Forever's tables (auras, cooldown, conditions, name,
 *     and in lib/item-pool.mjs its text): Seal of the Dawn's 23930 is +78 Attack Power against
 *     Undead, not Classic Era's 81.
 *   - when Forever links item effects to the item (ItemXItemEffect), they are the item's effects,
 *     equip stat spells included: Forever's redesigns (Diamond Flask's use casts 363881 "CHUG!
 *     CHUG! CHUG! CHUG!", Ironfoe's proc is an equip spell, 1301046) and Forever's own stat spells
 *     (Blackhand's Breadth's +1% crit, 1318954, and its new use, 1318944).
 *   - a Classic Era equip spell whose every aura is a stat (statEquip) stays, unless Forever's
 *     effects give one of its stats: Forever moved most such bonuses into ItemSparse stats, which
 *     the client doesn't carry for these items (Hand of Justice's +20 Attack Power, 9331, stays;
 *     Blackhand's Breadth's +2% crit, 7598, gives way to Forever's +1%).
 *   - without Forever links, the Classic Era row's item effects, their spells read from Forever.
 * `spellFrom(spellId)` says which build a spell is read from, and `effectsFrom(itemId)` whose
 * item effects the item has ("forever", "classic", or null with none).
 */
export function createFallbackContext(classic, forever) {
  const fromForever = (id) => hasSpell(forever, id);
  const bySpell = (name) => ({
    get: (id) => (fromForever(id) ? forever : classic)[name].get(id),
    has: (id) => (fromForever(id) ? forever : classic)[name].has(id),
  });
  const spells = {
    spellEffects: bySpell("spellEffects"),
    spellName: bySpell("spellName"),
    spellCooldowns: bySpell("spellCooldowns"),
    castingRequirements: bySpell("castingRequirements"),
    shapeshift: bySpell("shapeshift"),
    equippedItems: bySpell("equippedItems"),
  };
  const merged = { ...classic, ...spells };
  /** The stats an equip spell adds to the item (none for a proc or a conditional spell). */
  const statKeys = (e) => {
    if (TRIGGER[e.TriggerType] !== "equip" || spellCondition(merged, e.SpellID)) return [];
    if ((merged.spellEffects.get(e.SpellID) ?? []).some((x) => x.Effect === 6 && PROC_AURAS.has(x.EffectAura))) return [];
    const s = spellStats(merged, e.SpellID);
    return [...Object.keys(s.stats), ...Object.keys(s.weaponSkill).map((k) => `weaponSkill:${k}`)];
  };
  const effectsFrom = (itemId) => ((forever.itemEffects.get(itemId) ?? []).length ? "forever" : (classic.itemEffects.get(itemId) ?? []).length ? "classic" : null);
  const itemEffects = {
    get(itemId) {
      const own = classic.itemEffects.get(itemId) ?? [];
      const linked = forever.itemEffects.get(itemId) ?? [];
      if (!linked.length) return own.length ? own : undefined;
      const given = new Set(linked.flatMap(statKeys));
      const kept = own.filter((e) => statEquip(merged, e) && !statKeys(e).some((k) => given.has(k)));
      return [...kept, ...linked];
    },
    has: (itemId) => classic.itemEffects.has(itemId) || forever.itemEffects.has(itemId),
  };
  return {
    ...merged,
    itemEffects,
    spellFrom: (id) => (fromForever(id) ? "forever" : "classic"),
    effectsFrom,
  };
}

/**
 * Whether an item effect row is an equip spell that becomes plain stats (itemEffects below): no
 * condition (area, form or weapon type), no proc aura, and every aura a stat.
 */
export function statEquip(ctx, e) {
  if (TRIGGER[e.TriggerType] !== "equip") return false;
  const auras = ctx.spellEffects.get(e.SpellID) ?? [];
  if (!auras.length || spellCondition(ctx, e.SpellID)) return false;
  if (auras.some((x) => x.Effect === 6 && PROC_AURAS.has(x.EffectAura))) return false;
  return spellStats(ctx, e.SpellID).unmapped.length === 0;
}

/** True for the Classic Era layout (amounts stored), false for Forever (allocations). */
export const storesAmounts = (row) => Array.isArray(row.StatModifier_bonusAmount);

/** Round half up, as the client does (floor(x + 0.5)). */
const round = (x) => Math.floor(x + 0.5);

// ---------------------------------------------------------------------------
// Budget, armor, weapon
// ---------------------------------------------------------------------------

/** RandPropPoints column for a quality: Uncommon and below "Good", Rare "Superior", Epic+ "Epic". */
export const budgetColumn = (quality) => (quality >= 4 ? "EpicF" : quality === 3 ? "SuperiorF" : "GoodF");

/**
 * The item's stat budget: RandPropPoints[ItemLevel].<quality column>[slot group]. Null when
 * the slot has no budget group or the table has no row.
 */
export function statBudget(ctx, row) {
  const group = BUDGET_GROUP[row.InventoryType];
  const rpp = ctx.randPropPoints.get(row.ItemLevel);
  if (group === undefined || !rpp) return null;
  return rpp[budgetColumn(row.OverallQualityID)]?.[group] ?? null;
}

/** Amount of stat slot i: round(StatPercentEditor × budget / 10000) (Forever), or the stored amount. */
export function statAmount(ctx, row, i) {
  if (storesAmounts(row)) return row.StatModifier_bonusAmount[i];
  const budget = statBudget(ctx, row);
  return budget === null ? null : round((row.StatPercentEditor[i] * budget) / 10000);
}

/**
 * White armor. Forever: cloth–plate = round(ItemArmorQuality.Qualitymod[quality] ×
 * ItemArmorTotal.<type> × ArmorLocation.<type>modifier) (robes use the chest row); shields =
 * round(ItemArmorShield.Quality[quality]). Classic Era: Resistances[0].
 */
export function baseArmor(ctx, row, item) {
  if (storesAmounts(row)) return row.Resistances?.[0] ?? 0;
  if (!item || item.ClassID !== 4) return 0;
  const q = row.OverallQualityID;
  if (item.SubclassID === 6) {
    const shield = ctx.armorShield.get(row.ItemLevel);
    return shield ? round(shield.Quality[q]) : 0;
  }
  if (item.SubclassID < 1 || item.SubclassID > 4) return 0;
  const quality = ctx.armorQuality.get(row.ItemLevel);
  const total = ctx.armorTotal.get(row.ItemLevel);
  const location = ctx.armorLocation.get(row.InventoryType === 20 ? 5 : row.InventoryType);
  if (!quality || !total || !location) return 0;
  const [armorTotal, modifier] = [
    [total.Cloth, location.Clothmodifier],
    [total.Leather, location.Leathermodifier],
    [total.Mail, location.Chainmodifier],
    [total.Plate, location.Platemodifier],
  ][item.SubclassID - 1];
  return round(quality.Qualitymod[q] * armorTotal * modifier);
}

/** Forever caster weapons: ItemSparse.Flags[4] bits (see docs, "Caster weapons"). */
export const CASTER_WEAPON = 0x100;
const CASTER_SPELL_POWER = 0x200;
const CASTER_HEALING = 0x400;
/** DPS given up per point of caster-weapon spell power (fit to the 7 pool items, [?]). */
export const CASTER_DPS_PER_SPELL_POWER = 0.195;

/** The ItemDamage* table a weapon reads, by inventory type and subclass. */
export function damageTable(row, item) {
  const caster = (row.Flags?.[1] ?? 0) & 0x200; // ITEM_FLAG2_CASTER_WEAPON
  switch (row.InventoryType) {
    case 17:
      return caster ? "TwoHandCaster" : "TwoHand";
    case 13:
    case 21:
    case 22:
      return caster ? "OneHandCaster" : "OneHand";
    case 15:
    case 25:
    case 26:
      return item?.SubclassID === 19 ? "Wand" : item?.SubclassID === 16 ? "Thrown" : "Ranged";
    default:
      return null;
  }
}

/**
 * Forever caster weapons (Flags[4] & 0x100, with 0x200 spell power or 0x400 healing): the
 * weapon trades DPS for spell power worth 2 × the group-0 budget of its quality at its item
 * level, whatever its slot (healing weapons: 3.75 × healing + 1.25 × spell damage). A weapon
 * whose stats already carry spell power, healing or spell damage keeps those instead (Crackling
 * Staff: +25 Spell Power from its stats, and the DPS cut all the same). Returns null for other
 * items. `spellPower` is the spell-power equivalent the DPS cut is based on.
 */
export function casterWeapon(ctx, row) {
  const flags = row.Flags?.[4] ?? 0;
  if (storesAmounts(row) || !(flags & CASTER_WEAPON) || !(flags & (CASTER_SPELL_POWER | CASTER_HEALING))) return null;
  const p0 = ctx.randPropPoints.get(row.ItemLevel)?.[budgetColumn(row.OverallQualityID)]?.[0];
  if (!p0) return null;
  const hasSpellStats = row.StatModifier_bonusStat.some((type, i) => SPELL_STAT_TYPES.has(type) && row.StatPercentEditor[i]);
  const stats = hasSpellStats ? [] : flags & CASTER_HEALING ? [["healing", round(3.75 * p0)], ["spellDamage", round(1.25 * p0)]] : [["spellPower", 2 * p0]];
  return { spellPower: 2 * p0, stats };
}
const SPELL_STAT_TYPES = new Set([41, 42, 45]); // healing, spell damage, spell power

/**
 * The `Weapon` block. Forever: DPS = ItemDamage<table>[ItemLevel].Quality[quality] (minus
 * CASTER_DPS_PER_SPELL_POWER per caster spell power); average = DPS × speed; min =
 * floor(average × (1 − DmgVariance/2)); max = floor(average × (1 + DmgVariance/2) + 0.5).
 * Classic Era: MinDamage[0]/MaxDamage[0] (MinDamage[1]/MaxDamage[1] = extra damage, its school
 * in Item.DamageType[1]). `dps` is rounded to 0.1 like the tooltip.
 */
export function weapon(ctx, row, item) {
  if (!item || item.ClassID !== 2 || !row.ItemDelay) return null;
  const speed = row.ItemDelay / 1000;
  const school = DAMAGE_SCHOOL[row.DamageType] ?? "Physical";
  const skill = WEAPON_SKILL[item.SubclassID] ?? null;
  let min;
  let max;
  let extraDamage;
  let dpsSource;
  if (storesAmounts(row)) {
    min = row.MinDamage[0];
    max = row.MaxDamage[0];
    // The extra damage's school is Item.DamageType[1] (Classic Era's Item table keeps one
    // school per damage range; ItemSparse.DamageType is only the first).
    if (row.MaxDamage[1]) extraDamage = [{ min: row.MinDamage[1], max: row.MaxDamage[1], school: DAMAGE_SCHOOL[item.DamageType?.[1]] ?? null }];
    dpsSource = "stored";
  } else {
    const table = damageTable(row, item);
    const entry = table && ctx.damage[table].get(row.ItemLevel);
    if (!entry) return { min: null, max: null, speed, dps: null, school, skill, dpsSource: null };
    const caster = casterWeapon(ctx, row);
    const dps = entry.Quality[row.OverallQualityID] - (caster ? CASTER_DPS_PER_SPELL_POWER * caster.spellPower : 0);
    const average = dps * speed;
    min = Math.floor(average * (1 - row.DmgVariance / 2));
    max = Math.floor(average * (1 + row.DmgVariance / 2) + 0.5);
    dpsSource = caster ? `ItemDamage${table} (caster)` : `ItemDamage${table}`;
  }
  // The tooltip's DPS counts the extra damage too (Warblade of Caer Darrow: 142–214 + 1–22).
  const total = min + max + (extraDamage ?? []).reduce((s, x) => s + x.min + x.max, 0);
  const out = { min, max, speed, dps: Math.round((total / 2 / speed) * 10) / 10, school, skill, dpsSource };
  if (extraDamage) out.extraDamage = extraDamage;
  return out;
}

/**
 * Innate shield block value. Only Classic Era ships gametables/shieldblockregular.txt (by
 * item level, one column per quality); Forever's client has no such table, so this is null.
 */
export function shieldBlockValue(ctx, row, item) {
  if (!item || item.ClassID !== 4 || item.SubclassID !== 6) return null;
  const entry = ctx.shieldBlock.get(row.ItemLevel);
  if (!entry) return null;
  const column = ["Poor", "Standard", "Good", "Superior", "Epic", "Legendary", "Artifact"][row.OverallQualityID];
  return entry[column] === undefined ? null : round(entry[column]);
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

/** A raw SpellEffect row's points in either layout (see lib/spells.mjs effectPoints). */
export function rawEffectPoints(e) {
  if (e.EffectBasePoints === undefined) return e.EffectBasePointsF ?? 0;
  if (e.EffectBasePointsF) return e.EffectBasePointsF;
  return e.EffectBasePoints + (e.EffectDieSides > 0 ? 1 : 0);
}

/**
 * Turn a spell's auras into stats. Paired auras merge the way the tooltip reads them:
 * melee + ranged AP (99 + 124) → `attackPower`; damage + healing (13 + 135, all schools) →
 * `spellPower`; melee + ranged AP versus a creature type → `attackPowerVs<Type>`.
 * @returns {{ stats: Record<string, number>, weaponSkill: Record<string, number>, unmapped: {effect, aura, misc, points}[] }}
 */
export function spellStats(ctx, spellId) {
  const stats = {};
  const weaponSkill = {};
  const unmapped = [];
  const pairs = [];
  for (const e of ctx.spellEffects.get(spellId) ?? []) {
    const points = rawEffectPoints(e);
    const misc = e.EffectMiscValue?.[0] ?? 0;
    const mapper = e.Effect === 6 ? AURA_STAT[e.EffectAura] : undefined;
    const mapped = mapper ? mapper(points, misc) : null;
    if (!mapped) {
      unmapped.push({ effect: e.Effect, aura: e.EffectAura, misc, points });
      continue;
    }
    if (!Array.isArray(mapped)) {
      const [skill, v] = mapped.weaponSkill;
      weaponSkill[skill] = (weaponSkill[skill] ?? 0) + v;
      continue;
    }
    pairs.push(...mapped);
  }
  const get = (k) => pairs.filter(([key]) => key === k).reduce((s, [, v]) => s + v, 0);
  const has = (k) => pairs.some(([key]) => key === k);
  const done = new Set();
  // Melee + ranged attack power is the tooltip's "+N Attack Power" (the melee value); any
  // extra ranged AP stays `rangedAttackPower` (Devilsaur Leggings: 46 melee, 48 ranged).
  if (has("attackPower") && has("rangedAttackPower")) {
    stats.attackPower = get("attackPower");
    const extraRanged = get("rangedAttackPower") - get("attackPower");
    if (extraRanged > 0) stats.rangedAttackPower = extraRanged;
    done.add("attackPower").add("rangedAttackPower");
  }
  // Spell damage + healing of equal size is "damage and healing" (spell power).
  if (has("spellDamage") && has("healing") && get("spellDamage") === get("healing")) {
    stats.spellPower = get("spellDamage");
    done.add("spellDamage").add("healing");
  }
  for (const [key, v] of pairs) {
    if (done.has(key)) continue;
    // Ranged AP versus a type duplicates the melee aura; the tooltip shows one line.
    if (key.startsWith("rangedAttackPowerVs")) {
      const melee = key.replace("rangedAttackPowerVs", "attackPowerVs");
      if (pairs.some(([k]) => k === melee)) continue;
    }
    stats[key] = (stats[key] ?? 0) + v;
  }
  return { stats, weaponSkill, unmapped };
}

/**
 * Why an equip spell isn't always on: it needs an area (SpellCastingRequirements.
 * RequiredAreasID, e.g. Rune of the Guard Captain's "tripled in Forest and Grassland
 * areas"), a shapeshift form (SpellShapeshift.ShapeshiftMask) or a type of weapon
 * (SpellEquippedItems of item class 2: Forever's "Improves your chance to hit with ranged
 * weapons", 1294769, is bows, guns and crossbows only). Null when unconditional.
 */
export function spellCondition(ctx, spellId) {
  const area = ctx.castingRequirements.get(spellId)?.find((r) => r.RequiredAreasID)?.RequiredAreasID;
  if (area) return { requiredAreasId: area };
  const forms = ctx.shapeshift.get(spellId)?.find((r) => r.ShapeshiftMask?.some?.((m) => m))?.ShapeshiftMask;
  if (forms) return { shapeshiftMask: forms };
  const weapons = ctx.equippedItems?.get(spellId)?.find((r) => r.EquippedItemClass === WEAPON_CLASS && r.EquippedItemSubclass > 0);
  if (weapons) return { weaponSubclassMask: weapons.EquippedItemSubclass };
  return null;
}
/** Item.ClassID of weapons. */
const WEAPON_CLASS = 2;

const addStats = (into, stats) => {
  for (const [k, v] of Object.entries(stats)) if (v) into[k] = (into[k] ?? 0) + v;
};

/** Cooldown of an item effect: the item's own, else the spell's recovery (ms, null if none). */
function effectCooldown(ctx, e) {
  const spell = ctx.spellCooldowns.get(e.SpellID)?.[0];
  const own = e.CoolDownMSec > 0 ? e.CoolDownMSec : null;
  const category = e.CategoryCoolDownMSec > 0 ? e.CategoryCoolDownMSec : null;
  return {
    cooldownMs: own ?? (spell?.RecoveryTime > 0 ? spell.RecoveryTime : null),
    categoryCooldownMs: category ?? (spell?.CategoryRecoveryTime > 0 ? spell.CategoryRecoveryTime : null),
  };
}

/**
 * An item's effects. Equip spells whose every aura maps to a stat become stats; the rest are
 * effect records { trigger, kind, spellId, name, cooldownMs, categoryCooldownMs, categoryId,
 * charges, unmapped? } with kind "use", "proc" (chance on hit, or an equip proc aura) or
 * "equip" (other equip effects). Text isn't rendered.
 */
export function itemEffects(ctx, itemId) {
  const stats = {};
  const weaponSkill = {};
  const effects = [];
  const statSpellIds = [];
  for (const e of ctx.itemEffects.get(itemId) ?? []) {
    const trigger = TRIGGER[e.TriggerType] ?? `trigger${e.TriggerType}`;
    const base = {
      trigger,
      spellId: e.SpellID,
      name: ctx.spellName.get(e.SpellID)?.Name_lang ?? null,
      ...effectCooldown(ctx, e),
      categoryId: e.SpellCategoryID || null,
      charges: e.Charges || null,
    };
    if (trigger === "equip") {
      const s = spellStats(ctx, e.SpellID);
      const auras = ctx.spellEffects.get(e.SpellID) ?? [];
      const isProc = auras.some((x) => x.Effect === 6 && PROC_AURAS.has(x.EffectAura));
      const condition = spellCondition(ctx, e.SpellID);
      if (condition) {
        effects.push({ ...base, kind: "equip", condition, stats: s.stats });
        continue;
      }
      if (!isProc && s.unmapped.length === 0 && auras.length > 0) {
        addStats(stats, s.stats);
        addStats(weaponSkill, s.weaponSkill);
        statSpellIds.push(e.SpellID);
        continue;
      }
      // Keep what does map (e.g. a stat riding along a class tweak), and record the rest.
      if (!isProc && Object.keys(s.stats).length + Object.keys(s.weaponSkill).length > 0) {
        addStats(stats, s.stats);
        addStats(weaponSkill, s.weaponSkill);
        statSpellIds.push(e.SpellID);
      }
      effects.push({ ...base, kind: isProc ? "proc" : "equip", unmapped: s.unmapped });
      continue;
    }
    effects.push({ ...base, kind: trigger === "chanceOnHit" ? "proc" : trigger === "use" ? "use" : trigger });
  }
  return { stats, weaponSkill, effects, statSpellIds };
}

// ---------------------------------------------------------------------------
// Items and sets
// ---------------------------------------------------------------------------

/**
 * Derive one item. Returns null when the build has no ItemSparse row for it.
 * `stats` holds only non-zero `Stats` keys; `armor` is the white armor (without bonus
 * armor; Forever's tooltip adds `bonusArmor` to its armor line). `other` lists stat types
 * that aren't `Stats` fields (mana, health, holy resistance) and `unknownStatTypes` any type
 * STAT_TYPE doesn't know.
 */
export function deriveItem(ctx, id) {
  const row = ctx.sparse.get(id);
  if (!row) return null;
  const item = ctx.item.get(id) ?? null;
  const stats = {};
  const weaponSkill = {};
  const other = {};
  const unknownStatTypes = [];
  const add = (k, v) => {
    if (!v) return;
    if (NOT_IN_STATS.has(k)) other[k] = (other[k] ?? 0) + v;
    else stats[k] = (stats[k] ?? 0) + v;
  };

  row.StatModifier_bonusStat.forEach((type, i) => {
    if (type < 0) return;
    const amount = statAmount(ctx, row, i);
    if (!amount) return;
    const key = STAT_TYPE[type];
    if (key === undefined) unknownStatTypes.push({ type, amount });
    else if (typeof key === "string") add(key, amount);
    else if (key.all) for (const k of key.all) add(k, amount);
    else if (key.weaponSkill) weaponSkill[key.weaponSkill] = (weaponSkill[key.weaponSkill] ?? 0) + amount;
  });

  add("armor", baseArmor(ctx, row, item));
  if (storesAmounts(row)) row.Resistances.forEach((v, i) => RESISTANCE_INDEX[i] && add(RESISTANCE_INDEX[i], v));
  for (const [k, v] of casterWeapon(ctx, row)?.stats ?? []) add(k, v);

  const fx = itemEffects(ctx, id);
  for (const [k, v] of Object.entries(fx.stats)) add(k, v);
  for (const [k, v] of Object.entries(fx.weaponSkill)) weaponSkill[k] = (weaponSkill[k] ?? 0) + v;

  const setId = row.ItemSet || null;
  return {
    id,
    name: row.Display_lang,
    quality: row.OverallQualityID,
    itemLevel: row.ItemLevel,
    requiredLevel: row.RequiredLevel,
    inventoryType: row.InventoryType,
    slot: SLOT[row.InventoryType] ?? null,
    classId: item?.ClassID ?? null,
    subclassId: item?.SubclassID ?? null,
    layout: storesAmounts(row) ? "amounts" : "budget",
    budget: storesAmounts(row) ? null : statBudget(ctx, row),
    stats,
    weapon: weapon(ctx, row, item),
    weaponSkill: Object.keys(weaponSkill).length ? weaponSkill : null,
    shieldBlockValue: shieldBlockValue(ctx, row, item),
    effects: fx.effects,
    statSpellIds: [...new Set(fx.statSpellIds)].sort((a, b) => a - b),
    setId,
    other,
    unknownStatTypes,
  };
}

/**
 * An item set: name, member item ids and bonuses { pieces, spellId, stats?, weaponSkill?,
 * unmapped? }. A bonus gets `stats` when every aura of its spell is a flat stat.
 * `chrSpecId` is kept when a bonus is specialization-specific.
 */
export function deriveSet(ctx, setId) {
  const set = ctx.itemSet.get(setId);
  if (!set) return null;
  const bonuses = (ctx.itemSetSpells.get(setId) ?? [])
    .slice()
    .sort((a, b) => a.Threshold - b.Threshold || a.ID - b.ID)
    .map((b) => {
      const s = spellStats(ctx, b.SpellID);
      const out = { pieces: b.Threshold, spellId: b.SpellID, name: ctx.spellName.get(b.SpellID)?.Name_lang ?? null };
      if (b.ChrSpecID) out.chrSpecId = b.ChrSpecID;
      if (s.unmapped.length === 0 && (ctx.spellEffects.get(b.SpellID) ?? []).length > 0) {
        if (Object.keys(s.stats).length) out.stats = s.stats;
        if (Object.keys(s.weaponSkill).length) out.weaponSkill = s.weaponSkill;
      } else out.unmapped = s.unmapped;
      return out;
    });
  return { id: setId, name: set.Name_lang, itemIds: set.ItemID.filter((x) => x > 0), bonuses };
}
