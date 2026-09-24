// Merges the client's per-spell DB2 tables into one record per spell id.
//
// Field names are the WoWDBDefs column names in camelCase (RecoveryTime -> recoveryTime,
// EffectBasePointsF -> effectBasePointsF, SpellProcsPerMinuteID -> spellProcsPerMinuteId,
// Name_lang -> name). SpellMisc's lookup indexes are replaced by the rows they point at
// (castTime, duration, range) and aura options carry their PPM row; radius and category rows
// are returned separately by radii() and spellCategories(). Only DifficultyID 0 rows are used.
// Unnamed WoWDBDefs columns (Field_*), bookkeeping columns (ID, SpellID, DifficultyID) and
// the DROPPED columns below are left out.

/** WoWDBDefs column name -> camelCase key. */
export function camel(name) {
  let n = name.replace(/_lang$/, "").replace(/PvP/g, "Pvp");
  n = n.replace(/_+([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());
  n = n.replace(/ID(?=[A-Z0-9]|$)/g, "Id").replace(/AP(?=[A-Z0-9]|$)/g, "Ap");
  if (/^[A-Z]{2,}[a-z]/.test(n)) n = n.replace(/^([A-Z]+)(?=[A-Z][a-z])/, (m) => m.toLowerCase());
  return n[0].toLowerCase() + n.slice(1);
}

/**
 * Pick raw columns (in the given order) into a camelCase object. A column the row lacks is an
 * error, unless `lenient` (other builds' layouts may not have every column; it is left out).
 */
export function pick(row, columns, lenient = false) {
  return pickColumns(row, columns, lenient);
}
function pickColumns(row, columns, lenient) {
  if (!row) return null;
  const out = {};
  for (const c of columns) {
    if (!(c in row)) {
      if (lenient) continue;
      throw new Error(`column ${c} missing (have ${Object.keys(row).join(", ")})`);
    }
    out[camel(c)] = row[c];
  }
  return out;
}

// Columns written per section. Columns left out are either resolved next to their index
// (castingTimeIndex -> castTime, …) or were zero for every spell the scraper extracts in
// 1.60.1.69913; DROPPED lists them, and the scraper warns if one of them gains a value.
const MISC = ["Attributes", "SchoolMask", "Speed", "MinDuration", "SpellIconFileDataID"];
const EFFECT = [
  "EffectIndex",
  "Effect",
  "EffectAura",
  "EffectBasePointsF",
  "Variance",
  "EffectRealPointsPerLevel",
  "EffectPointsPerResource",
  "EffectBonusCoefficient",
  "BonusCoefficientFromAP",
  "EffectTriggerSpell",
  "EffectMiscValue",
  "EffectRadiusIndex",
  "EffectAmplitude",
  "EffectAuraPeriod",
  "EffectChainTargets",
  "EffectChainAmplitude",
  "EffectMechanic",
  "EffectSpellClassMask",
  "ImplicitTarget",
];
// Older layouts (Classic Era 1.15.9) keep the value in the integer EffectBasePoints with the
// old convention (min = EffectBasePoints + 1, max = EffectBasePoints + EffectDieSides).
// Forever's layout has neither column: EffectBasePointsF is the value. Picked when present.
const EFFECT_OLD_LAYOUT = ["EffectBasePoints", "EffectDieSides"];
const AURA_OPTIONS = ["ProcChance", "ProcCharges", "ProcTypeMask", "ProcCategoryRecovery", "CumulativeAura", "SpellProcsPerMinuteID"];
const COOLDOWNS = ["RecoveryTime", "CategoryRecoveryTime", "StartRecoveryTime"];
const CATEGORIES = ["Category", "StartRecoveryCategory", "DefenseType", "DispelType", "Mechanic", "PreventionType", "DiminishType"];
const POWER = ["PowerType", "ManaCost", "PowerCostPct", "OptionalCost"];
const LEVELS = ["BaseLevel", "SpellLevel", "MaxLevel"];
const SHAPESHIFT = ["ShapeshiftMask", "ShapeshiftExclude"];
const CLASS_OPTIONS = ["SpellClassSet", "SpellClassMask"];
const EQUIPPED = ["EquippedItemClass", "EquippedItemSubclass", "EquippedItemInvTypes"];
const TARGETS = ["MaxTargets", "MaxTargetLevel", "TargetCreatureType", "Targets", "ConeDegrees"];
const AURA_RESTRICTIONS = [
  "CasterAuraState",
  "TargetAuraState",
  "ExcludeCasterAuraState",
  "ExcludeTargetAuraState",
  "CasterAuraSpell",
  "TargetAuraSpell",
  "ExcludeCasterAuraSpell",
  "ExcludeTargetAuraSpell",
];
/** Columns not written (table -> columns), checked by `droppedColumnsInUse`. */
export const DROPPED = {
  SpellMisc: ["LaunchDelay", "PvPDurationIndex", "ActiveIconFileDataID", "ContentTuningID", "ShowFutureSpellPlayerConditionID", "SpellVisualScript", "ActiveSpellVisualScript"],
  SpellEffect: ["Coefficient", "ResourceCoefficient", "EffectAttributes", "EffectItemType", "PvpMultiplier", "GroupSizeBasePointsCoefficient", "EffectPos_facing", "ScalingClass"],
  SpellCooldowns: ["AuraSpellID"],
  SpellCategories: ["ChargeCategory"],
  SpellPower: ["ManaCostPerLevel", "ManaPerSecond", "PowerCostMaxPct", "PowerPctPerSecond", "OptionalCostPct", "RequiredAuraSpellID", "PowerDisplayID", "AltPowerBarID"],
  SpellLevels: ["MaxPassiveAuraLevel"],
  SpellShapeshift: ["StanceBarOrder"],
  SpellClassOptions: ["ModalNextSpell"],
  SpellTargetRestrictions: ["Width"],
  SpellAuraRestrictions: ["CasterAuraType", "TargetAuraType", "ExcludeCasterAuraType", "ExcludeTargetAuraType"],
};
/** Dropped columns that are informational only (never numeric game rules). */
const DROPPED_UNCHECKED = new Set(["ActiveIconFileDataID", "ContentTuningID", "ShowFutureSpellPlayerConditionID", "SpellVisualScript", "ActiveSpellVisualScript", "PvpMultiplier", "GroupSizeBasePointsCoefficient", "EffectPos_facing", "PowerDisplayID", "AltPowerBarID", "StanceBarOrder", "EffectItemType"]);

function groupBySpell(table, { difficultyZero = true } = {}) {
  const map = new Map();
  for (const row of table.rows) {
    if (difficultyZero && "DifficultyID" in row && row.DifficultyID !== 0) continue;
    const id = row.SpellID;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

/**
 * @param {Record<string, {rows: object[], byId: Map}>} t  parsed tables by name
 * @param {{ lenient?: boolean }} [options]  lenient: tolerate layouts without some columns
 * @returns {{ get(id: number): object|null, name(id: number): string|null, exists(id: number): boolean }}
 */
export function createSpellIndex(t, { lenient = false } = {}) {
  const pick = (row, columns) => pickColumns(row, columns, lenient);
  const g = (name) => groupBySpell(t[name]);
  const misc = g("SpellMisc");
  const effects = g("SpellEffect");
  const auraOptions = g("SpellAuraOptions");
  const cooldowns = g("SpellCooldowns");
  const categories = g("SpellCategories");
  const power = g("SpellPower");
  const levels = g("SpellLevels");
  const shapeshift = g("SpellShapeshift");
  const classOptions = g("SpellClassOptions");
  const equipped = g("SpellEquippedItems");
  const targets = g("SpellTargetRestrictions");
  const auraRestrictions = g("SpellAuraRestrictions");
  const ppmMods = new Map();
  for (const row of t.SpellProcsPerMinuteMod.rows) {
    const id = row.SpellProcsPerMinuteID;
    if (!ppmMods.has(id)) ppmMods.set(id, []);
    ppmMods.get(id).push(row);
  }

  const one = (map, id) => map.get(id)?.[0] ?? null;

  function get(id) {
    const nameRow = t.SpellName.byId.get(id);
    if (!nameRow) return null;
    const spellRow = t.Spell.byId.get(id);
    const m = one(misc, id);
    const miscOut = pick(m, MISC);
    const castTime = m && m.CastingTimeIndex ? pick(t.SpellCastTimes.byId.get(m.CastingTimeIndex), ["Base", "Minimum"]) : null;
    const duration = m && m.DurationIndex ? pick(t.SpellDuration.byId.get(m.DurationIndex), ["Duration", "MaxDuration", "DurationPerResource"]) : null;
    const range = m && m.RangeIndex ? pick(t.SpellRange.byId.get(m.RangeIndex), ["RangeMin", "RangeMax", "Flags"]) : null;

    const effs = (effects.get(id) ?? [])
      .slice()
      .sort((a, b) => a.EffectIndex - b.EffectIndex)
      .map((e) => ({ ...pick(e, EFFECT), ...pickColumns(e, EFFECT_OLD_LAYOUT, true) }));

    const ao = one(auraOptions, id);
    let aoOut = null;
    if (ao) {
      aoOut = pick(ao, AURA_OPTIONS);
      const ppm = ao.SpellProcsPerMinuteID ? t.SpellProcsPerMinute.byId.get(ao.SpellProcsPerMinuteID) : null;
      aoOut.ppm = ppm
        ? {
            ...pick(ppm, ["BaseProcRate", "Flags"]),
            mods: (ppmMods.get(ppm.ID) ?? []).map((r) => pick(r, ["Type", "Param", "Coeff"])),
          }
        : null;
    }

    const catOut = pick(one(categories, id), CATEGORIES);

    return {
      id,
      name: nameRow.Name_lang,
      nameSubtext: spellRow?.NameSubtext_lang ?? "",
      misc: miscOut,
      castTime,
      duration,
      range,
      effects: effs,
      auraOptions: aoOut,
      cooldowns: pick(one(cooldowns, id), COOLDOWNS),
      categories: catOut,
      power: (power.get(id) ?? []).slice().sort((a, b) => a.OrderIndex - b.OrderIndex).map((r) => pick(r, POWER)),
      levels: pick(one(levels, id), LEVELS),
      shapeshift: pick(one(shapeshift, id), SHAPESHIFT),
      classOptions: pick(one(classOptions, id), CLASS_OPTIONS),
      equippedItems: pick(one(equipped, id), EQUIPPED),
      targetRestrictions: pick(one(targets, id), TARGETS),
      auraRestrictions: pick(one(auraRestrictions, id), AURA_RESTRICTIONS),
    };
  }

  /** Radius rows by SpellRadius id, for the radius indexes the given spells use. */
  function radii(ids) {
    const out = {};
    for (const id of ids) {
      for (const e of effects.get(id) ?? []) {
        for (const index of e.EffectRadiusIndex) {
          const r = index && t.SpellRadius.byId.get(index);
          if (r) out[index] = pick(r, ["Radius", "RadiusMin", "RadiusMax", "RadiusPerLevel"]);
        }
      }
    }
    return out;
  }

  /** SpellCategory rows for the categories (cooldown and GCD) the given spells use. */
  function spellCategories(ids) {
    const out = {};
    for (const id of ids) {
      const c = one(categories, id);
      for (const cid of c ? [c.Category, c.StartRecoveryCategory] : []) {
        const r = cid && t.SpellCategory.byId.get(cid);
        if (r) out[cid] = pick(r, ["Name_lang", "Flags", "MaxCharges", "ChargeRecoveryTime", "TypeMask"]);
      }
    }
    return out;
  }

  /** Dropped columns that hold a non-zero value for any of the given spells. */
  function droppedColumnsInUse(ids) {
    const byTable = { SpellMisc: misc, SpellEffect: effects, SpellCooldowns: cooldowns, SpellCategories: categories, SpellPower: power, SpellLevels: levels, SpellShapeshift: shapeshift, SpellClassOptions: classOptions, SpellTargetRestrictions: targets, SpellAuraRestrictions: auraRestrictions };
    const inUse = [];
    for (const [table, columns] of Object.entries(DROPPED)) {
      for (const col of columns) {
        if (DROPPED_UNCHECKED.has(col)) continue;
        let used = false;
        for (const id of ids) {
          let rows;
          if (table === "SpellDuration") {
            const m = one(misc, id);
            rows = m?.DurationIndex ? [t.SpellDuration.byId.get(m.DurationIndex)].filter(Boolean) : [];
          } else rows = byTable[table].get(id) ?? [];
          if (rows.some((r) => col in r && r[col] !== 0)) {
            used = true;
            break;
          }
        }
        if (used) inUse.push(`${table}.${col}`);
      }
    }
    return inUse;
  }

  return {
    get,
    radii,
    spellCategories,
    droppedColumnsInUse,
    name: (id) => t.SpellName.byId.get(id)?.Name_lang ?? null,
    exists: (id) => t.SpellName.byId.has(id),
    effects: (id) => effects.get(id) ?? [],
  };
}

/**
 * An effect's points in either layout: EffectBasePointsF (Forever), else the old integer
 * base points with the "+1" convention when there are die sides (Classic Era 1.15.9).
 */
export function effectPoints(e) {
  if (e.effectBasePointsF) return e.effectBasePointsF;
  if (e.effectBasePoints === undefined) return e.effectBasePointsF ?? 0;
  return e.effectBasePoints + (e.effectDieSides > 0 ? 1 : 0);
}

const KEEP_ALWAYS = new Set(["id", "name", "effects", "sources", "effectIndex", "effect"]);
/**
 * Fields whose client default is 1, not 0: written only when they differ from 1, a 0 included.
 * EffectChainAmplitude is a chain spell's falloff, and Execute's rage-to-damage factor (5308 0.3 …
 * 20662 1.5: "$*10;F1" = 3 … 15 damage per extra rage; docs/classes/warrior.md §3.1).
 */
const DEFAULT_ONE = new Set(["effectChainAmplitude"]);
const isZero = (v) => v === 0 || v === "" || v === null || v === false || (Array.isArray(v) && v.every((x) => x === 0));

/**
 * Drop zero-valued fields from a spell record to keep spells.json small: a number that is 0,
 * an empty array or an array of zeros, "", null, and objects left empty. Absent means zero
 * (or "no row"), except for the DEFAULT_ONE fields, where absent means 1.
 * `id`, `name`, `effects`, `sources`, and each effect's `effectIndex` and `effect` stay.
 */
export function compactSpell(value) {
  if (Array.isArray(value)) return value.map((v) => compactSpell(v));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (DEFAULT_ONE.has(k)) {
        if (v !== 1 && v !== undefined) out[k] = v;
        continue;
      }
      if (KEEP_ALWAYS.has(k)) {
        out[k] = compactSpell(v);
        continue;
      }
      if (isZero(v)) continue;
      const c = compactSpell(v);
      if (c && typeof c === "object" && !Array.isArray(c) && Object.keys(c).length === 0) continue;
      out[k] = c;
    }
    return out;
  }
  return value;
}

/** Tables createSpellIndex needs. */
export const SPELL_TABLES = [
  "SpellName",
  "Spell",
  "SpellMisc",
  "SpellEffect",
  "SpellAuraOptions",
  "SpellProcsPerMinute",
  "SpellProcsPerMinuteMod",
  "SpellCooldowns",
  "SpellCategories",
  "SpellCategory",
  "SpellPower",
  "SpellLevels",
  "SpellShapeshift",
  "SpellClassOptions",
  "SpellCastTimes",
  "SpellDuration",
  "SpellRange",
  "SpellRadius",
  "SpellEquippedItems",
  "SpellTargetRestrictions",
  "SpellAuraRestrictions",
];
