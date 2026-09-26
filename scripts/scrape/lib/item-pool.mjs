// Builds the pre-raid item pool (src/data/items/pre-bis.json) from the client tables of two
// builds: Forever (wow_classic_beta) first, Classic Era (wow_classic_era) for items the
// Forever client has no row for (decision D17), with their effects from Forever wherever it has
// them (createFallbackContext). Pure functions over the lookups the CLI
// (scripts/scrape/items-client.mjs) loads; no I/O. See docs/data/items.md.

import { AURA_STAT, NOT_IN_STATS, NOT_STAT_AURAS, SLOT, createFallbackContext, deriveItem, deriveSet, hasSpell, spellStats } from "./item-stats.mjs";
import { compareText } from "./json.mjs";
import { formatCooldown, renderSpellText } from "./spell-text.mjs";

/** Normalized slot → paperdoll slots it can occupy (finger and trinket stand for two). */
export const EQUIP_SLOTS = {
  head: ["head"],
  neck: ["neck"],
  shoulder: ["shoulder"],
  back: ["back"],
  chest: ["chest"],
  wrist: ["wrist"],
  hands: ["hands"],
  waist: ["waist"],
  legs: ["legs"],
  feet: ["feet"],
  finger: ["finger"],
  trinket: ["trinket"],
  twoHand: ["mainHand"],
  mainHand: ["mainHand"],
  oneHand: ["mainHand", "offHand"],
  offHand: ["offHand"],
  shield: ["offHand"],
  heldInOffHand: ["offHand"],
  ranged: ["ranged"],
  thrown: ["ranged"],
  relic: ["ranged"], // relics use the ranged slot in Classic
  // docs/data/items.md#ammo-and-quivers: a ranged weapon's ammo and a quiver or ammo pouch.
  ammo: ["ammo"],
  quiver: ["quiver"],
};
export const SLOT_ORDER = Object.keys(EQUIP_SLOTS);

const ARMOR_TYPES = { 1: "cloth", 2: "leather", 3: "mail", 4: "plate" };
/** Item.ClassID → `Item.itemClass`: weapons, armor, and the ranged supplies (Projectile 6, Quiver 11). */
const ITEM_CLASS = { 2: "Weapon", 4: "Armor", 6: "Projectile", 11: "Quiver" };
/** Weapon subclass → `WeaponType` (Item.SubclassID of class 2). */
const WEAPON_TYPES = {
  0: "axe",
  1: "axe",
  2: "bow",
  3: "gun",
  4: "mace",
  5: "mace",
  6: "polearm",
  7: "sword",
  8: "sword",
  10: "staff",
  13: "fist",
  15: "dagger",
  16: "thrown",
  18: "crossbow",
  19: "wand",
};
/** ItemSparse.Bonding → the tooltip's binding, abbreviated. */
const BINDING = { 1: "BoP", 2: "BoE", 3: "BoU", 4: "Quest", 5: "Quest" };
/** ItemSparse.MinReputation → standing name. */
const STANDING = ["Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted"];
/** ItemSparse.Flags[0]: "Unique-Equipped" without a limit category. */
const FLAG_UNIQUE_EQUIPPABLE = 0x80000;
/** ItemLimitCategory.Flags bit 0: the limit counts equipped items (Unique-Equipped). */
const LIMIT_EQUIPPED = 1;
/**
 * ItemSparse.RequiredPVPRank counts the four dishonorable ranks first: 5 is rank 1 (Private,
 * Scout), 14 rank 10 (Lieutenant Commander, Champion), 18 rank 14 (Grand Marshal, High Warlord).
 */
const PVP_RANK_OFFSET = 4;

/**
 * Is an Item row a ranged supply (docs/data/items.md#ammo-and-quivers)? Arrows and bullets
 * (Projectile, class 6, subclasses 2 and 3, InventoryType 24) and quivers and ammo pouches (Quiver,
 * class 11, subclasses 2 and 3, a bag: InventoryType 18).
 */
export function isRangedSupply(item, row) {
  if (!item || (item.SubclassID !== 2 && item.SubclassID !== 3)) return false;
  return (item.ClassID === 6 && row.InventoryType === 24) || (item.ClassID === 11 && row.InventoryType === 18);
}

/** Is an Item row an equippable piece the pool keeps? Weapons and armor with a paperdoll slot, and the ranged supplies. */
export function isEquippable(item, row) {
  if (isRangedSupply(item, row)) return true;
  if (!item || (item.ClassID !== 2 && item.ClassID !== 4)) return false;
  if (item.ClassID === 4 && item.SubclassID === 5) return false; // cosmetic
  if (item.ClassID === 2 && (item.SubclassID === 14 || item.SubclassID === 20)) return false; // misc, fishing poles
  return Boolean(SLOT[row.InventoryType]); // no shirts, tabards, ammo, quivers or bags
}

const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => compareText(a, b)));
const nonEmpty = (o) => (o && Object.keys(o).length ? sortKeys(o) : null);

/** Bit `id - 1` of a class or race mask (race masks are two 32-bit words). */
function hasBit(mask, id) {
  const words = Array.isArray(mask) ? mask : [mask];
  const word = words[Math.floor((id - 1) / 32)] ?? 0;
  return ((word >>> (id - 1) % 32) & 1) === 1;
}

/** Names of the entries a mask allows, or null when it allows every one (or is -1). */
function maskNames(mask, entries) {
  const words = Array.isArray(mask) ? mask : [mask];
  if (words.every((w) => w === -1 || w === 0) && words.some((w) => w === -1)) return null;
  if (words.every((w) => w === 0)) return null;
  const allowed = entries.filter((e) => hasBit(mask, e.id));
  return allowed.length === entries.length || allowed.length === 0 ? null : allowed.map((e) => e.name);
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** `Stats` key → the label a plain description uses ("+14 Attack Power"). */
const STAT_LABEL = {
  strength: "Strength",
  agility: "Agility",
  stamina: "Stamina",
  intellect: "Intellect",
  spirit: "Spirit",
  armor: "Armor",
  bonusArmor: "Armor",
  attackPower: "Attack Power",
  rangedAttackPower: "Ranged Attack Power",
  rangedAttackSpeed: "% Ranged Attack Speed",
  hitRating: "Hit Rating",
  critRating: "Critical Strike Rating",
  defenseRating: "Defense Rating",
  dodgeRating: "Dodge Rating",
  spellPower: "Spell Power",
  spellDamage: "Spell Damage",
  healing: "Healing",
};
const statText = (stats) =>
  Object.entries(stats)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${STAT_LABEL[k] ?? k}`)
    .join(", ");

/**
 * A spell's text for a tooltip line: its rendered description, else (when a variable can't be
 * rendered) a plain description, its flat stats or its name. `hidden` when the description is
 * empty: the client doesn't show such spells.
 */
export function effectText(bundle, spellId, { condition = null } = {}) {
  const text = bundle.textFor ? bundle.textFor(spellId) : bundle.text;
  const r = renderSpellText(text, spellId);
  const name = text.spellName.get(spellId)?.Name_lang ?? `spell ${spellId}`;
  const stats = spellStats(bundle.ctx, spellId).stats;
  const plain = () => {
    const s = statText(stats);
    const where = condition?.requiredAreasId ? " in certain areas" : condition?.shapeshiftMask ? " in certain forms" : condition?.weaponSubclassMask ? " with certain weapons" : "";
    return s ? `${s}${where}.` : name;
  };
  if (!r.text && !r.unrendered.length) {
    // An empty description is hidden in game; a conditional stat bonus still matters.
    return condition && Object.keys(stats).length ? { text: plain(), how: "generated" } : { text: null, how: "hidden" };
  }
  if (r.unrendered.length) return { text: plain(), how: "fallback", unrendered: r.unrendered, name };
  return { text: r.text, how: "rendered" };
}

const PREFIX = { use: "Use: ", equip: "Equip: ", chanceOnHit: "Chance on hit: " };
/** ItemEffect.TriggerType of the tooltip effects: use, equip, chance on hit. */
const PREFIX_BY_TRIGGER = { 0: PREFIX.use, 1: PREFIX.equip, 2: PREFIX.chanceOnHit };
/** The build a spell's text and values come from ("forever" or "classic"). */
const buildOf = (bundle, spellId) => (bundle.buildOf ? bundle.buildOf(spellId) : bundle.key);

/**
 * The bundle fallback items are described with (decision D6): Classic Era item rows, effects from
 * the Forever client wherever it has them (lib/item-stats.mjs createFallbackContext), each spell's
 * text from its own client.
 */
export function createFallbackBundle(forever, classic) {
  const fromForever = (id) => hasSpell(forever.ctx, id);
  return {
    ...classic,
    ctx: createFallbackContext(classic.ctx, forever.ctx),
    textFor: (id) => (fromForever(id) ? forever.text : classic.text),
    buildOf: (id) => (fromForever(id) ? "forever" : "classic"),
  };
}

/**
 * Every aura on the equip spells (ItemEffect trigger 1) and set bonuses the pool uses that is
 * neither a stat (AURA_STAT) nor listed as not one (NOT_STAT_AURAS): { aura, spellId, build, usedBy }.
 * Empty when every aura is classified (docs/data/client.md#aura--stat).
 */
export function unclassifiedAuras(uses) {
  const out = new Map();
  for (const { ctx, spellId, build, where } of uses) {
    for (const e of ctx.spellEffects.get(spellId) ?? []) {
      if (e.Effect !== 6 || e.EffectAura in AURA_STAT || e.EffectAura in NOT_STAT_AURAS) continue;
      const key = `${build}:${spellId}:${e.EffectAura}`;
      const x = out.get(key) ?? { aura: e.EffectAura, spellId, build, usedBy: [] };
      if (!x.usedBy.includes(where)) x.usedBy.push(where);
      out.set(key, x);
    }
  }
  return [...out.values()];
}

/** Turn derived effect records into the dataset's procs / useEffects / otherEquip lines. */
function effectLines(bundle, derived, coverage, itemId) {
  const out = { procs: [], useEffects: [], otherEquip: [] };
  for (const e of derived.effects) {
    if (!(e.trigger in PREFIX)) continue; // learn, looted, soulstone: not tooltip effects of gear
    const t = effectText(bundle, e.spellId, { condition: e.condition ?? null });
    coverage.record(t, { spellId: e.spellId, itemId, build: buildOf(bundle, e.spellId) });
    if (t.text === null) continue;
    const raw = `${PREFIX[e.trigger]}${t.text}`;
    const { spellId } = e;
    // A generated line is the scraper's words for a spell the client describes with nothing:
    // flagged, so a tooltip that shows only the game's words can leave it out.
    const generated = t.how === "generated" ? { generated: true } : {};
    if (e.kind === "use") {
      const ms = e.cooldownMs ?? e.categoryCooldownMs ?? null;
      out.useEffects.push(ms ? { raw: `${raw} (${formatCooldown(ms)} Cooldown)`, spellId, cooldownSec: ms / 1000, ...generated } : { raw, spellId, ...generated });
    } else if (e.kind === "proc") out.procs.push({ raw, spellId, ...generated });
    else out.otherEquip.push({ raw, spellId, ...generated });
  }
  return out;
}

/**
 * The client's own Equip line for each of the item's stat spells (docs/data/items.md#stat-spell-text),
 * in the order the item lists its effects: the rendered description, with the stats and weapon
 * skill the spell adds to `stats` and `weaponSkill`, so a tooltip can show the line in place of its
 * own wording for them. A spell whose description is empty (the game shows nothing) or can't be
 * fully rendered has no entry: its stats keep a tooltip's wording.
 */
function statEquipLines(bundle, derived, itemId) {
  const stat = new Set(derived.statSpellIds);
  const order = [...new Set([...(bundle.ctx.itemEffects.get(itemId) ?? []).map((e) => e.SpellID).filter((id) => stat.has(id)), ...derived.statSpellIds])];
  const out = [];
  for (const spellId of order) {
    const t = effectText(bundle, spellId);
    if (t.how !== "rendered") continue;
    const s = spellStats(bundle.ctx, spellId);
    const stats = Object.fromEntries(Object.entries(s.stats).filter(([k, v]) => v && !NOT_IN_STATS.has(k)));
    const weaponSkill = nonEmpty(s.weaponSkill);
    out.push({ raw: `${PREFIX.equip}${t.text}`, spellId, stats: sortKeys(stats), ...(weaponSkill ? { weaponSkill } : {}) });
  }
  return out;
}

/** Tally of rendered, generated, fallback and hidden spell texts. */
export function createCoverage() {
  const c = { rendered: 0, generated: 0, fallback: 0, hidden: 0, fallbackSpells: new Map(), hiddenSpells: new Map() };
  c.record = (t, { spellId, itemId, setId, build }) => {
    c[t.how]++;
    const where = itemId ? `item ${itemId}` : `set ${setId}`;
    if (t.how === "fallback") {
      const key = `${build}:${spellId}`;
      const e = c.fallbackSpells.get(key) ?? { spellId, build, name: t.name, tokens: t.unrendered, usedBy: [] };
      e.usedBy.push(where);
      c.fallbackSpells.set(key, e);
    }
    if (t.how === "hidden") {
      const key = `${build}:${spellId}`;
      const e = c.hiddenSpells.get(key) ?? { spellId, build, usedBy: [] };
      e.usedBy.push(where);
      c.hiddenSpells.set(key, e);
    }
  };
  c.toJSON = () => ({
    rendered: c.rendered,
    generated: c.generated,
    fallback: c.fallback,
    hidden: c.hidden,
    fallbackSpells: [...c.fallbackSpells.values()],
    hiddenSpells: [...c.hiddenSpells.values()],
  });
  return c;
}

// ---------------------------------------------------------------------------
// Faction twins (docs/data/items.md#faction-twins)
// ---------------------------------------------------------------------------

/**
 * The ItemSparse columns a faction twin may differ in: its id and names, its price (SellPrice,
 * BuyPrice, and PriceRandomValue, the vendor price's random part, in which Forever's "Premier" PvP
 * pairs and its Theramore and Darkspear rewards differ: GV-2), and what binds it to a side (the
 * reputation it needs, the races and classes that may wear it, its item set, whose bonuses are
 * compared instead). Every other column must match.
 */
export const TWIN_FREE_COLUMNS = new Set([
  "ID",
  "Display_lang",
  "Display1_lang",
  "Display2_lang",
  "Display3_lang",
  "SellPrice",
  "BuyPrice",
  "PriceRandomValue",
  "MinFactionID",
  "MinReputation",
  "AllowableRace",
  "AllowableClass",
  "ItemSet",
]);
/** ItemSparse's per-stat columns, StatModifier_bonusStat first: Forever's allocations, Classic Era's amounts and allocations. */
const STAT_COLUMNS = ["StatModifier_bonusStat", "StatPercentEditor", "StatModifier_bonusAmount", "Field_1_15_3_55112_014", "StatPercentageOfSocket"];
/** ItemSparse.Flags[1] (ItemFlags2): 0x1 Horde only, 0x2 Alliance only. */
const FLAGS2_FACTION = 0x3;

/**
 * What two faction twins share: the item's ItemSparse row without TWIN_FREE_COLUMNS and the
 * faction flags, its Item class and subclass, its item effects (spell, trigger, cooldowns) and its
 * set's bonuses (pieces, spell). `ctx` is the context the item is described with (Forever's, or
 * the fallback's for an item with no Forever row), and `build` which one, so a Forever row never
 * matches a Classic Era one. With `{ sets: false }` the set's bonuses are left out too: the key of
 * the stat twins a race change swaps between (docs/data/items.md#faction-twins).
 */
export function twinKey(ctx, build, id, { sets = true } = {}) {
  const row = ctx.sparse.get(id);
  const item = ctx.item.get(id);
  if (!row || !item) return null;
  // The stats as (stat, allocation, amount) triples in stat order: Songstone of Ironforge lists
  // Spirit before Intellect, Eye of Orgrimmar the other way round.
  const perStat = STAT_COLUMNS.filter((k) => Array.isArray(row[k]) && row[k].length === row.StatModifier_bonusStat?.length);
  const stats = (row.StatModifier_bonusStat ?? [])
    .map((stat, i) => [stat, ...perStat.slice(1).map((k) => row[k][i])])
    .filter(([stat]) => stat !== -1)
    .map((t) => JSON.stringify(t))
    .sort(compareText);
  const fields = Object.keys(row)
    .filter((k) => !TWIN_FREE_COLUMNS.has(k) && !perStat.includes(k))
    .sort(compareText)
    .map((k) => [k, k === "Flags" && Array.isArray(row.Flags) ? row.Flags.map((f, i) => (i === 1 ? f & ~FLAGS2_FACTION : f)) : row[k]]);
  // A use's spell can name a faction's base (the Alterac Valley insignias return you to Dun Baldar
  // or Frostwolf Keep), so a use matches by its cooldowns and charges; every other effect by its spell.
  const effects = (ctx.itemEffects.get(id) ?? []).map((e) => [e.TriggerType === 0 ? "use" : e.SpellID, e.TriggerType, e.CoolDownMSec, e.CategoryCoolDownMSec, e.Charges]);
  const set = sets && row.ItemSet ? deriveSet(ctx, row.ItemSet) : null;
  const bonuses = !sets ? [] : set ? set.bonuses.map((b) => [b.pieces, b.spellId]) : row.ItemSet ? ["unknown set"] : [];
  return JSON.stringify([build, item.ClassID, item.SubclassID, fields, stats, effects, bonuses]);
}

/**
 * Faction twins among the given ids: items whose twinKey matches another's with a different name or
 * a different faction binding (MinFactionID, AllowableRace or the faction flags). Returns
 * Map<id, id[]>, each id's twins in id order. Which side each is on is the app's call (itemFaction
 * in src/sim/equip.ts), which picks the other faction's twin from these.
 */
export function findTwins(keyed) {
  const groups = new Map();
  for (const [id, key, row] of keyed) {
    if (key === null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id, row });
  }
  const binding = (r) => JSON.stringify([r.MinFactionID, r.AllowableRace, Array.isArray(r.Flags) ? (r.Flags[1] ?? 0) & FLAGS2_FACTION : 0]);
  const out = new Map();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    for (const a of members) {
      const twins = members.filter((b) => b.id !== a.id && (b.row.Display_lang !== a.row.Display_lang || binding(b.row) !== binding(a.row))).map((b) => b.id);
      if (twins.length) out.set(a.id, twins.sort((x, y) => x - y));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * Everything the dataset says about one client row: the derivation (lib/item-stats.mjs) plus
 * the tooltip fields. `bundle` is one build's { key, build, ctx, text, lookups }.
 */
export function describeRow(bundle, id, coverage) {
  const derived = deriveItem(bundle.ctx, id);
  if (!derived) return null;
  const row = bundle.ctx.sparse.get(id);
  const item = bundle.ctx.item.get(id) ?? null;
  const L = bundle.lookups;
  const requirements = [];
  if (row.MinFactionID > 0) {
    const faction = L.factionName(row.MinFactionID) ?? `faction ${row.MinFactionID}`;
    const standing = STANDING[row.MinReputation] ?? `standing ${row.MinReputation}`;
    requirements.push({ kind: "reputation", text: `Requires ${faction} - ${standing}`, faction, standing });
  }
  if (row.RequiredSkill > 0) {
    const skill = L.skillName(row.RequiredSkill) ?? `skill ${row.RequiredSkill}`;
    requirements.push({ kind: "skill", text: `Requires ${skill} (${row.RequiredSkillRank})`, skill, level: row.RequiredSkillRank });
  }
  if (row.RequiredAbility > 0) {
    const spell = bundle.text.spellName.get(row.RequiredAbility)?.Name_lang ?? `spell ${row.RequiredAbility}`;
    requirements.push({ kind: "other", text: `Requires ${spell}` });
  }
  if (row.RequiredPVPRank > PVP_RANK_OFFSET) {
    const rank = row.RequiredPVPRank - PVP_RANK_OFFSET;
    requirements.push({ kind: "pvpRank", text: `Requires PvP rank ${rank}`, level: rank });
  }

  let uniqueEquipped = null;
  if (row.LimitCategory > 0) {
    const limit = L.limitCategory(row.LimitCategory);
    if (limit && limit.Flags & LIMIT_EQUIPPED) uniqueEquipped = { group: limit.Name_lang || null, max: limit.Quantity };
  }
  if (!uniqueEquipped && (row.Flags?.[0] ?? 0) & FLAG_UNIQUE_EQUIPPABLE) uniqueEquipped = { group: null, max: 1 };
  const unique = row.MaxCount === 1 || uniqueEquipped !== null || (row.LimitCategory > 0 && !uniqueEquipped);

  const effects = effectLines(bundle, derived, coverage, id);
  // The set bonuses as this build's tooltip lists them (for the changed / unchanged tab).
  const set = derived.setId ? deriveSet(bundle.ctx, derived.setId) : null;
  const setBonuses = set?.bonuses.map((b) => [b.pieces, effectText(bundle, b.spellId).text, b.stats ?? null, b.weaponSkill ?? null]) ?? null;
  const { dpsSource: _, ...weapon } = derived.weapon ?? {};
  return {
    derived,
    row,
    item,
    name: row.Display_lang,
    quality: row.OverallQualityID,
    itemLevel: row.ItemLevel,
    reqLevel: row.RequiredLevel,
    slot: derived.slot,
    itemClass: ITEM_CLASS[item?.ClassID] ?? "Armor",
    itemSubclass: L.subclassName(item?.ClassID, item?.SubclassID) ?? `Subclass ${item?.SubclassID}`,
    armorType: item?.ClassID === 4 ? (ARMOR_TYPES[item.SubclassID] ?? null) : null,
    weaponType: item?.ClassID === 2 ? (WEAPON_TYPES[item.SubclassID] ?? null) : null,
    binding: BINDING[row.Bonding] ?? null,
    unique,
    uniqueEquipped,
    classes: maskNames(row.AllowableClass, L.classes),
    races: maskNames(row.AllowableRace, L.races),
    requirements,
    stats: sortKeys(derived.stats),
    weapon: derived.weapon ? weapon : null,
    weaponSkill: nonEmpty(derived.weaponSkill),
    statSpellIds: derived.statSpellIds,
    statEquip: statEquipLines(bundle, derived, id),
    ...effects,
    setId: derived.setId === null ? null : String(derived.setId),
    icon: L.iconName(id, item),
    sellPrice: row.SellPrice || null,
    flavor: row.Description_lang || null,
    shieldBlockValue: derived.shieldBlockValue,
    setBonuses,
  };
}

/**
 * What a tooltip comparison sees: every field a player or the sim reads, with Forever's base
 * and bonus armor summed as its white armor line shows them. Used for the changed / unchanged
 * tab of items both clients have.
 */
function signature(d) {
  // Forever splits armor into base + stat 50 and Classic Era stores the total: compare totals.
  const { armor = 0, bonusArmor = 0, ...stats } = d.stats;
  if (armor + bonusArmor) stats.armor = armor + bonusArmor;
  const weapon = d.weapon && { min: d.weapon.min, max: d.weapon.max, speed: d.weapon.speed, school: d.weapon.school, extra: d.weapon.extraDamage ?? null };
  // The tooltip lines, not the spells behind them.
  const lines = (list) => list.map((e) => [e.raw, e.cooldownSec ?? null]);
  return JSON.stringify([
    d.name, d.quality, d.itemLevel, d.reqLevel, d.slot, d.itemSubclass, d.binding, d.unique, d.uniqueEquipped, d.classes,
    d.races, d.requirements, sortKeys(stats), weapon, d.weaponSkill, lines(d.procs), lines(d.useEffects), lines(d.otherEquip), d.setId,
    d.setBonuses,
  ]);
}

/**
 * The committed pool's items a new pool would lose without a reason (docs/data/items.md#pre-raid-bis-lists,
 * "Kept items"): each id in `committedItems` that isn't in `poolIds` or named in `removed` (id → why it
 * may go). Saved setups and share links that wear one would lose it on load, so the scraper fails on any.
 */
export function itemsLeavingPool(committedItems, poolIds, removed) {
  return committedItems.filter((old) => !poolIds.has(old.id) && !removed.has(old.id)).map(({ id, name }) => ({ id, name }));
}

/**
 * An item's pre-raid list entries: its own, then each entry of a listed twin for a spec and slot
 * the item isn't listed in itself, when the spec's class can wear it (`classes` null: every class).
 * So a list names one side's item and the other side's twin takes the same rank
 * (docs/data/items.md#faction-twins).
 */
export function listEntries(bis, id, twins, classes) {
  const own = bis.byId.get(id) ?? [];
  const out = [...own];
  const specOrder = Object.keys(bis.specs);
  const classOf = (spec) => spec.split("-")[0];
  for (const t of twins)
    for (const e of bis.byId.get(t) ?? []) {
      if (out.some((o) => o.spec === e.spec && o.slot === e.slot)) continue;
      if (classes && !classes.some((c) => c.toLowerCase() === classOf(e.spec))) continue;
      out.push({ ...e });
    }
  return out.sort((a, b) => specOrder.indexOf(a.spec) - specOrder.indexOf(b.spec) || compareText(a.slot, b.slot) || a.rank - b.rank);
}

/**
 * Build the dataset.
 * @param {object} p
 * @param {object} p.forever, p.classic   build bundles { key, build, ctx, text, lookups }
 * @param {object} p.filter               { qualities, reqLevel, minItemLevel, maxClassicItemId, excludedItems: Map, junkName: RegExp }
 * @param {object} p.bis                  loadPreRaidBis() result
 * @param {Map<number, string>} p.watch   items known to exist in Forever that no client row carries yet
 * @returns {{ items, sets, counts, report }}
 */
export function buildPool({ forever, classic, filter, bis, watch }) {
  const coverage = createCoverage();
  const report = { excludedByName: [], excludedById: [], sod: [], notEquippable: [], missingItemRow: [], addedByList: [], unclassifiedAuras: [] };
  const fallback = createFallbackBundle(forever, classic);
  const fallbackEffects = { items: 0, effectsFromForever: 0, spells: 0, spellsFromForever: 0 };
  const auraUses = [];
  const levelOk = (r) =>
    (r.RequiredLevel >= filter.reqLevel[0] && r.RequiredLevel <= filter.reqLevel[1]) ||
    (filter.minItemLevel !== null && r.ItemLevel >= filter.minItemLevel);
  const byRule = (r) => filter.qualities.includes(r.OverallQualityID) && levelOk(r);
  // docs/data/items.md#ammo-and-quivers: the ranged supplies have their own quality and level rule.
  const supplyRule = (r, item) =>
    isRangedSupply(item, r) && filter.supplies.qualities.includes(r.OverallQualityID) && r.RequiredLevel >= filter.supplies.reqLevel[0] && r.RequiredLevel <= filter.supplies.reqLevel[1];

  const ids = [...new Set([...forever.ctx.sparse.keys(), ...classic.ctx.sparse.keys()])].sort((a, b) => a - b);
  const eligible = (id) => id < filter.maxClassicItemId || (forever.ctx.sparse.has(id) && !classic.ctx.sparse.has(id));

  // docs/data/items.md#faction-twins: every equippable, eligible row's twins, read from the client:
  // the lists' twins (set bonuses must match) and the race change's stat twins (set bonuses ignored).
  const keyed = [];
  const statKeyed = [];
  for (const id of ids) {
    const fRow = forever.ctx.sparse.get(id);
    const row = fRow ?? classic.ctx.sparse.get(id);
    const itemRow = (fRow ? forever : classic).ctx.item.get(id);
    if (!eligible(id) || !itemRow || !isEquippable(itemRow, row) || filter.junkName.test(row.Display_lang)) continue;
    const key = (o) => (fRow ? twinKey(forever.ctx, "forever", id, o) : twinKey(fallback.ctx, "classic", id, o));
    keyed.push([id, key(), row]);
    statKeyed.push([id, key({ sets: false }), row]);
  }
  const twinsOf = findTwins(keyed);
  const statTwinsOf = findTwins(statKeyed);
  // A listed item's twins join the pool and take its list entries (listedTwins).
  const listedIds = [...bis.byId.keys(), ...(bis.kept?.keys() ?? [])];
  const twinOfListed = new Set(listedIds.flatMap((id) => twinsOf.get(id) ?? []).filter((id) => !bis.byId.has(id) && !(bis.kept?.has(id) ?? false)));

  const items = [];
  for (const id of ids) {
    const fRow = forever.ctx.sparse.get(id);
    const cRow = classic.ctx.sparse.get(id);
    const bundle = fRow ? forever : classic;
    const row = fRow ?? cRow;
    // docs/data/items.md#pre-raid-bis-lists: a list's items, the items a list dropped (kept, no
    // rank), and their faction twins.
    const listed = bis.byId.has(id) || (bis.kept?.has(id) ?? false) || twinOfListed.has(id);
    if (!byRule(row) && !listed && !supplyRule(row, bundle.ctx.item.get(id))) continue;
    // Season of Discovery guard: an original Classic id, or an item only Forever has.
    if (!eligible(id)) {
      report.sod.push({ id, name: row.Display_lang });
      continue;
    }
    const itemRow = bundle.ctx.item.get(id);
    if (!itemRow) {
      report.missingItemRow.push({ id, name: row.Display_lang });
      continue;
    }
    if (!isEquippable(itemRow, row)) {
      if (listed) report.notEquippable.push({ id, name: row.Display_lang });
      continue;
    }
    if (filter.excludedItems.has(id)) {
      report.excludedById.push({ id, name: row.Display_lang, reason: filter.excludedItems.get(id) });
      continue;
    }
    if (filter.junkName.test(row.Display_lang)) {
      report.excludedByName.push({ id, name: row.Display_lang });
      continue;
    }
    const f = fRow ? describeRow(forever, id, coverage) : null;
    // The Classic Era row is described without counting it: only the stat source's text counts.
    // Without a Forever row it is the item's data, with its effects from Forever where it has them.
    const c = cRow ? describeRow(fRow ? classic : fallback, id, fRow ? createCoverage() : coverage) : null;
    const d = f ?? c;
    const dBundle = f ? forever : fallback;
    for (const e of d.derived.effects) if (e.trigger === "equip") auraUses.push({ ctx: dBundle.ctx, spellId: e.spellId, build: buildOf(dBundle, e.spellId), where: `item ${id}` });
    const tab = !f ? "missing" : !c ? "new" : signature(f) === signature(c) ? "unchanged" : "changed";
    const notes = [];
    if (d.derived.unknownStatTypes.length)
      notes.push(`Unknown stat types left out: ${d.derived.unknownStatTypes.map((u) => `${u.type} (${u.amount})`).join(", ")}.`);
    for (const [k, v] of Object.entries(d.derived.other)) notes.push(`Not a sim stat: ${k} ${v}.`);
    if (listed && !byRule(row)) report.addedByList.push(id);
    if (!f) {
      // docs/data/items.md#effects-of-fallback-items: which effects are the Forever client's.
      const rows = (fallback.ctx.itemEffects.get(id) ?? []).filter((e) => e.TriggerType in PREFIX_BY_TRIGGER);
      const from = fallback.ctx.effectsFrom(id);
      const spells = rows.map((e) => e.SpellID);
      const classicOnly = spells.filter((s) => fallback.buildOf(s) !== "forever");
      if (spells.length) {
        fallbackEffects.items++;
        if (from === "forever") fallbackEffects.effectsFromForever++;
        fallbackEffects.spells += spells.length;
        fallbackEffects.spellsFromForever += spells.length - classicOnly.length;
        const parts = [
          from === "forever" ? "effects are the Forever client's item effects" : from === "classic" ? "effects are Classic Era's item effects (the Forever client links none)" : null,
          `spell${spells.length > 1 ? "s" : ""} ${spells.join(", ")} read from the Forever client${classicOnly.length ? `, except ${classicOnly.join(", ")} (Classic Era: not in the Forever client)` : ""}`,
        ];
        notes.push(`Stats from Classic Era (no Forever ItemSparse row); ${parts.filter(Boolean).join("; ")}.`);
      }
    }
    const out = {
      id,
      name: d.name,
      icon: d.icon,
      quality: d.quality,
      itemLevel: d.itemLevel,
      reqLevel: d.reqLevel,
      tab,
      classicName: f && c && c.name !== f.name ? c.name : null,
      foreverData: Boolean(f),
      foreverSource: f ? "client" : null,
      statsFrom: f ? "forever" : "classic",
      slot: d.slot,
      equipSlots: EQUIP_SLOTS[d.slot],
      itemClass: d.itemClass,
      itemSubclass: d.itemSubclass,
      armorType: d.armorType,
      weaponType: d.weaponType,
      binding: d.binding,
      unique: d.unique,
      uniqueEquipped: d.uniqueEquipped,
      classes: d.classes,
      races: d.races,
      requirements: d.requirements,
      stats: d.stats,
      weapon: d.weapon,
      weaponSkill: d.weaponSkill,
      ...(d.derived.ammo ? { ammo: d.derived.ammo } : {}),
      // A Forever caster weapon's stats taken from its Classic Era item (docs/data/client.md#weapon-damage).
      ...(f && f.derived.classicStats ? { classicStats: f.derived.classicStats } : {}),
      statSpellIds: d.statSpellIds,
      statEquip: d.statEquip,
      procs: d.procs,
      useEffects: d.useEffects,
      otherEquip: d.otherEquip,
      setId: d.setId,
      source: null,
      preRaidBis: listEntries(bis, id, twinsOf.get(id) ?? [], d.classes),
      sellPrice: d.sellPrice,
      flavor: d.flavor,
      classic: tab === "changed" ? { stats: c.stats, weapon: c.weapon, weaponSkill: c.weaponSkill } : null,
      notes,
    };
    // Classic Era's innate shield block value (a game table Forever doesn't ship): kept apart
    // from stats.blockValue so a fallback shield doesn't outrank a Forever one on missing data.
    if (!f && d.shieldBlockValue) out.classicShieldBlockValue = d.shieldBlockValue;
    items.push(out);
  }
  items.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.id - b.id);

  // Sets: Forever's ItemSet and ItemSetSpell when Forever has the set, even for pieces that fall
  // back to Classic Era stats; else Classic Era's.
  const sets = {};
  const setIds = [...new Set(items.map((i) => i.setId).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  for (const setId of setIds) {
    const fromForever = deriveSet(forever.ctx, Number(setId));
    const bundle = fromForever ? forever : fallback;
    const set = fromForever ?? deriveSet(fallback.ctx, Number(setId));
    if (!set) {
      sets[setId] = { name: null, size: null, itemIds: [], bonuses: [], bonusesFrom: null };
      continue;
    }
    const bonuses = set.bonuses.map((b) => {
      const t = effectText(bundle, b.spellId);
      coverage.record(t, { spellId: b.spellId, setId, build: buildOf(bundle, b.spellId) });
      auraUses.push({ ctx: bundle.ctx, spellId: b.spellId, build: buildOf(bundle, b.spellId), where: `set ${setId}` });
      const out = { pieces: b.pieces, spellId: b.spellId, text: t.text ?? b.name ?? `spell ${b.spellId}` };
      if (b.stats && Object.keys(b.stats).length) out.parsed = sortKeys(b.stats);
      if (b.weaponSkill) out.weaponSkill = sortKeys(b.weaponSkill);
      return out;
    });
    sets[setId] = { name: set.name, size: set.itemIds.length, itemIds: [...set.itemIds].sort((a, b) => a - b), bonuses, bonusesFrom: fromForever ? "forever" : "classic" };
  }

  const inPool = new Set(items.map((i) => i.id));
  // Each item's faction twins and stat twins in the pool (docs/data/items.md#faction-twins).
  for (const item of items) {
    item.twins = (twinsOf.get(item.id) ?? []).filter((t) => inPool.has(t));
    item.statTwins = (statTwinsOf.get(item.id) ?? []).filter((t) => inPool.has(t));
  }
  report.twinsAddedByList = report.addedByList.filter((id) => twinOfListed.has(id)).length;
  const noClientRow = [...watch].filter(([id]) => !inPool.has(id) && !forever.ctx.sparse.has(id) && !classic.ctx.sparse.has(id)).map(([id, name]) => ({ id, name }));
  const byTab = { new: 0, changed: 0, unchanged: 0, missing: 0 };
  for (const i of items) byTab[i.tab]++;
  report.unclassifiedAuras = unclassifiedAuras(auraUses);
  return {
    items,
    sets,
    counts: { items: items.length, byTab, sets: Object.keys(sets).length },
    noClientRow,
    coverage: coverage.toJSON(),
    fallbackEffects,
    report,
  };
}

// ---------------------------------------------------------------------------
// Rating conversions
// ---------------------------------------------------------------------------

const RATING_PAIRS = [
  ["critRating", ["crit", "meleeCrit", "spellCrit"], "rating per 1% critical strike chance"],
  ["hitRating", ["hit", "spellHit"], "rating per 1% chance to hit"],
  ["dodgeRating", ["dodge"], "rating per 1% dodge"],
  ["parryRating", ["parry"], "rating per 1% parry"],
  ["blockRating", ["block"], "rating per 1% block"],
  ["defenseRating", ["defense"], "rating per point of Defense"],
];

/**
 * Forever's ratings against the Classic Era percentages they replaced: for every item both
 * clients have (original Classic ids), whose Classic Era row has exactly one of the old stats
 * and whose Forever row has the rating instead, tally rating ÷ old value.
 */
export function measureRatingConversions(forever, classic, maxClassicItemId) {
  const tallies = Object.fromEntries(RATING_PAIRS.map(([k]) => [k, new Map()]));
  for (const id of forever.ctx.sparse.keys()) {
    if (id >= maxClassicItemId || !classic.ctx.sparse.has(id)) continue;
    const f = deriveItem(forever.ctx, id)?.stats;
    const c = deriveItem(classic.ctx, id)?.stats;
    if (!f || !c) continue;
    for (const [rating, olds] of RATING_PAIRS) {
      const present = olds.filter((k) => c[k]);
      if (!f[rating] || c[rating] || present.length !== 1 || olds.some((k) => f[k])) continue;
      const ratio = Math.round((f[rating] / c[present[0]]) * 100) / 100;
      tallies[rating].set(ratio, (tallies[rating].get(ratio) ?? 0) + 1);
    }
  }
  const out = {};
  for (const [rating, olds, unit] of RATING_PAIRS) {
    const t = [...tallies[rating].entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    if (!t.length) continue;
    out[rating] = {
      replaces: olds,
      unit,
      ratingPerUnit: t[0][0],
      samples: t[0][1],
      otherRatios: Object.fromEntries(t.slice(1).map(([r, n]) => [String(r), n])),
    };
  }
  return out;
}
