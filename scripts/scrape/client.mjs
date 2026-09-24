#!/usr/bin/env node
// Extract the WoW Forever client data the engine needs into src/data/client/*.json.
//
//   node scripts/scrape/client.mjs [--refresh] [--version=<build>] [--product=<product>]
//                                  [--dbdefs=<sha>] [--out=<dir>] [--claims[=<baseline build>]]
//
// Source: raw client files from the wago.tools API (https://wago.tools/apis), the only
// endpoints used being /api/builds/<product>/latest, /api/files?version=…&format=json and
// /api/casc/<fdid>?version=… (decision D16), parsed with WoWDBDefs definitions from GitHub.
// Requests go one at a time, >= 1.1 s apart, with our User-Agent, and every response is
// cached under .cache/client/ and never downloaded again unless --refresh is passed.
// Zero dependencies (Node >= 22). See docs/data/client.md.
//
// Outputs (2-space JSON, sorted keys and ids, trailing newline):
//   spells.json      one merged record per spell in the interest set
//   talents.json     Trait-table mapping of every talent in src/data/talents/<class>.json
//   items.json       ItemEffect rows and ItemSparse fields for src/data/items/pre-bis.json,
//                    plus the consumables named in the buffs doc
//   enchants.json    SpellItemEnchantment rows for the enchants in the buffs doc
//   gametables.json  level-60 rows of the combat-rating, base-mana, HP-per-Stamina,
//                    armor-mitigation and PlayerExpectedStat tables
//
// --check compares the five files with the ones in --out (default src/data/client) instead of
// writing them, from the cache alone, and exits non-zero if one differs (lib/output.mjs).
//
// --claims[=<build>] also checks the wago.tools values the docs marked for human
// confirmation against the raw files (Classic Era comparisons read <build>, default
// 1.15.9.69722) and writes the report to .cache/client/<version>/claims.md.
//
// Exits non-zero when a table fails to parse, a DB2 section can't be read for a reason
// other than a missing key, or a spell/talent/item check that must hold fails.

import fs from "node:fs";
import path from "node:path";
import { createFetcher } from "./lib/http.mjs";
import { buildRecord, createClientSource, latestBuild, wowDbDefsCommit } from "./lib/wago.mjs";
import { createSpellIndex, compactSpell, SPELL_TABLES, pick, camel } from "./lib/spells.mjs";
import { mapTalents, TALENT_TABLES } from "./lib/talents.mjs";
import { BUFFS_DOC, citingDocs, parseBuffsDoc, docSpellMentions } from "./lib/docrefs.mjs";
import { stableStringify } from "./lib/json.mjs";
import { checkConflicts, createOutput } from "./lib/output.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "client");
const SCRAPER = "scripts/scrape/client.mjs";
const CLASSES = ["warrior", "druid", "paladin", "shaman", "rogue", "mage", "warlock", "priest", "hunter"];
const DEFAULT_PRODUCT = "wow_classic_beta";
const DEFAULT_BASELINE = "1.15.9.69722";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const opts = { refresh: false, check: false, version: null, product: DEFAULT_PRODUCT, dbdefs: null, out: "src/data/client", claims: null };
for (const arg of process.argv.slice(2)) {
  const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
  if (!m) usage(`Unknown argument: ${arg}`);
  const [, key, value] = m;
  if (key === "refresh" && value === undefined) opts.refresh = true;
  else if (key === "check" && value === undefined) opts.check = true;
  else if (key === "version" && value) opts.version = value;
  else if (key === "product" && value) opts.product = value;
  else if (key === "dbdefs" && value) opts.dbdefs = value;
  else if (key === "out" && value) opts.out = value;
  else if (key === "claims") opts.claims = value || DEFAULT_BASELINE;
  else usage(`Unknown argument: ${arg}`);
}
if (opts.check) for (const conflict of checkConflicts(opts)) usage(conflict);
function usage(msg) {
  console.error(`${msg}\nUsage: node ${SCRAPER} [--refresh] [--check] [--version=<build>] [--product=<product>] [--dbdefs=<sha>] [--out=<dir>] [--claims[=<build>]]`);
  process.exit(2);
}
const output = createOutput({ repoRoot: REPO_ROOT, check: opts.check });

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"));
const byNumber = (a, b) => a - b;

// ---------------------------------------------------------------------------
// Build, definitions and tables
// ---------------------------------------------------------------------------

const fetcher = createFetcher({ cacheDir: CACHE_DIR, refresh: opts.refresh, offline: opts.check });
const latest = await latestBuild(fetcher, opts.product);
const version = opts.version ?? latest.version;
if (opts.version && opts.version !== latest.version) {
  warn(`--version=${opts.version} is not the latest ${opts.product} build (${latest.version})`);
}
const dbdefsSha = await wowDbDefsCommit(fetcher, opts.dbdefs);
/** The build's creation time on wago.tools, from its build list (lib/wago.mjs buildRecord). */
const buildCreatedAt = (await buildRecord(fetcher, opts.product, version))?.created_at ?? null;
const source = createClientSource({ fetcher, cacheDir: CACHE_DIR, version, dbdefsSha });

const TABLES = [
  ...new Set([
    ...SPELL_TABLES,
    ...TALENT_TABLES,
    "SpellItemEnchantment",
    "ItemSparse",
    "Item",
    "ItemEffect",
    "ItemXItemEffect",
    "SkillLineAbility",
    "ChrRaces",
    "ChrClasses",
    "PlayerExpectedStat",
  ]),
];
const t = {};
const usedFdids = new Map(); // table/file name -> fdid
for (const name of TABLES) {
  try {
    t[name] = await source.table(name);
  } catch (e) {
    fail(`${name}: ${e.message}`);
    continue;
  }
  usedFdids.set(name, t[name].fdid);
  if (!t[name].present) {
    if (name === "ItemXItemEffect") continue; // older clients link items through ItemEffect.ParentItemID
    fail(`${name}: not in build ${version}`);
  }
  for (const w of t[name].warnings) fail(`${name}: ${w}`);
}

// Tables a mechanics doc cites that no dataset writes yet, read at the builds the doc cites them from,
// so a run reproduces the doc's sources from the cache (docs/data/client.md#tables-the-docs-cite).
// docs/mechanics/ranged-and-pets.md §1, §6: ammo damage per second by item level and quality, and
// the pet families, from Forever 1.60.1.69977 and Classic Era 1.15.9.69722.
const DOC_TABLES = [
  { build: "1.60.1.69977", tables: ["ItemDamageAmmo", "CreatureFamily"] },
  { build: DEFAULT_BASELINE, tables: ["ItemDamageAmmo", "CreatureFamily"] },
];
for (const { build, tables } of DOC_TABLES) {
  const docSource = build === version ? source : createClientSource({ fetcher, cacheDir: CACHE_DIR, version: build, dbdefsSha });
  for (const name of tables) {
    try {
      const table = await docSource.table(name);
      if (!table.present) fail(`${name}: not in build ${build}`);
      for (const w of table.warnings) fail(`${name} (${build}): ${w}`);
    } catch (e) {
      fail(`${name} (${build}): ${e.message}`);
    }
  }
}
if (errors.length) finish();

const GAMETABLES = {
  combatRatings: "gametables/combatratings.txt",
  baseMana: "gametables/basemp.txt",
  hpPerStamina: "gametables/hppersta.txt",
  armorMitigation: "gametables/armormitigationbylvl.txt",
};
const gt = {};
for (const [key, file] of Object.entries(GAMETABLES)) {
  gt[key] = await source.gameTable(file);
  if (!gt[key].present) warn(`${file}: not in build ${version}`);
  else usedFdids.set(file, gt[key].fdid);
}

const spells = createSpellIndex(t);

// ---------------------------------------------------------------------------
// Inputs: scraped datasets and the buffs doc
// ---------------------------------------------------------------------------

const spellBooks = Object.fromEntries(CLASSES.map((c) => [c, readJson(`src/data/spells/${c}.json`)]));
const talentData = Object.fromEntries(CLASSES.map((c) => [c, readJson(`src/data/talents/${c}.json`)]));
const raceData = readJson("src/data/races/races.json");
const itemData = readJson("src/data/items/pre-bis.json");
const buffsDoc = parseBuffsDoc(fs.readFileSync(path.join(REPO_ROOT, BUFFS_DOC), "utf8"));
for (const p of buffsDoc.problems) fail(`${BUFFS_DOC}: ${p}`);

// ---------------------------------------------------------------------------
// Interest set
// ---------------------------------------------------------------------------

// World buffs are excluded from the sim (doctrine §1, decision D8), so their spells are
// never extracted even when a doc or an item mentions them.
const WORLD_BUFF = /^(Rallying Cry of the Dragonslayer|Spirit of Zandalar|Songflower Serenade|Warchief's Blessing|Fengus' Ferocity|Mol'dar's Moxie|Slip'kik's Savvy|Sayge's Dark Fortune of .*|Traces of Silithyst)$/;
const excludedWorldBuffs = new Map();

/** spell id -> Set of reasons it is included */
const interest = new Map();
const missing = new Map(); // id -> Set of reasons (not in the client)
function want(id, reason) {
  if (!id) return;
  if (WORLD_BUFF.test(spells.name(id) ?? "")) {
    excludedWorldBuffs.set(id, spells.name(id));
    return;
  }
  const target = spells.exists(id) ? interest : missing;
  if (!target.has(id)) target.set(id, new Set());
  target.get(id).add(reason);
}

// 1. Spellbook ranks.
for (const book of Object.values(spellBooks)) {
  for (const spell of book.spells) for (const rank of spell.ranks) want(rank.forever?.spellId, "spellbook");
}

// 2. Talents (Trait tables).
const talentMap = mapTalents(t, talentData);
for (const cls of Object.values(talentMap.classes)) {
  for (const tal of cls.talents) {
    want(tal.spellId, "talent");
    want(tal.visibleSpellId, "talent");
    want(tal.overridesSpellId, "talent");
  }
}

// 3. Racials: SkillLineAbility rows of the race whose spell has the racial's name.
const RACE_IDS = {
  "horde-orc": 2,
  "horde-undead": 5,
  "horde-tauren": 6,
  "horde-troll": 8,
  "horde-skyborne-windshaper": 96,
  "alliance-human": 1,
  "alliance-dwarf": 3,
  "alliance-night-elf": 4,
  "alliance-gnome": 7,
  "alliance-skyborne-high-order": 95,
};
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const hasRaceBit = (masks, bit) => (bit < 32 ? ((masks[0] >>> 0) & 2 ** bit) !== 0 : ((masks[1] >>> 0) & 2 ** (bit - 32)) !== 0);
const racials = {};
const racialsUnresolved = [];
for (const race of raceData.races) {
  const chr = t.ChrRaces.byId.get(RACE_IDS[race.id]);
  if (!chr) {
    fail(`race ${race.id}: no ChrRaces row`);
    continue;
  }
  const rows = t.SkillLineAbility.rows.filter((r) => hasRaceBit(r.RaceMasks, chr.PlayableRaceBit));
  racials[race.id] = { chrRacesId: chr.ID, playableRaceBit: chr.PlayableRaceBit, racials: [] };
  for (const racial of race.racials) {
    const found = rows
      .filter((r) => norm(spells.name(r.Spell) ?? "") === norm(racial.name))
      .map((r) => ({ spellId: r.Spell, classMask: r.ClassMask, skillLine: r.SkillLine, acquireMethod: r.AcquireMethod }))
      .sort((a, b) => a.spellId - b.spellId);
    if (found.length === 0) racialsUnresolved.push(`${race.id}: ${racial.name}`);
    for (const f of found) want(f.spellId, "racial");
    racials[race.id].racials.push({ id: racial.id, name: racial.name, classicSpellId: racial.classicSpellId, spells: found });
  }
}
for (const r of racialsUnresolved) warn(`racial not found in SkillLineAbility: ${r}`);

// 4. Item effects: pre-raid items and the consumables named in the buffs doc.
const itemEffectsByItem = new Map();
if (t.ItemXItemEffect.present) {
  for (const x of t.ItemXItemEffect.rows) {
    const e = t.ItemEffect.byId.get(x.ItemEffectID);
    if (!e) continue;
    if (!itemEffectsByItem.has(x.ItemID)) itemEffectsByItem.set(x.ItemID, []);
    itemEffectsByItem.get(x.ItemID).push(e);
  }
} else {
  for (const e of t.ItemEffect.rows) {
    if (!itemEffectsByItem.has(e.ParentItemID)) itemEffectsByItem.set(e.ParentItemID, []);
    itemEffectsByItem.get(e.ParentItemID).push(e);
  }
}
for (const list of itemEffectsByItem.values()) list.sort((a, b) => a.LegacySlotIndex - b.LegacySlotIndex || a.ID - b.ID);
const ITEM_EFFECT_COLUMNS = ["LegacySlotIndex", "TriggerType", "SpellID", "Charges", "CoolDownMSec", "CategoryCoolDownMSec", "SpellCategoryID", "ChrSpecializationID", "PlayerConditionID"];
const itemEffects = (itemId) => (itemEffectsByItem.get(itemId) ?? []).map((e) => ({ id: e.ID, ...pick(e, ITEM_EFFECT_COLUMNS) }));

for (const item of itemData.items) for (const e of itemEffectsByItem.get(item.id) ?? []) want(e.SpellID, "item");
// The spells the pool's effect lines and set bonuses read (a fallback item's Classic Era effects
// resolve to Forever spells its Forever item effects don't list; docs/data/items.md).
for (const item of itemData.items) {
  for (const e of [...item.procs, ...item.useEffects, ...item.otherEquip]) want(e.spellId, "item");
  for (const id of item.statSpellIds) want(id, "item");
}
for (const set of Object.values(itemData.sets)) for (const b of set.bonuses) want(b.spellId, "item");
for (const c of buffsDoc.consumables) {
  for (const e of itemEffectsByItem.get(c.itemId) ?? []) want(e.SpellID, "consumable");
  for (const s of c.spellIds) want(s, "consumable");
}

// 5. Enchants: the enchanting spells, the spells each enchant casts, and proc spells.
const ENCHANT_EFFECTS = new Set([53, 54, 92]); // ENCHANT_ITEM, ENCHANT_ITEM_TEMPORARY, ENCHANT_HELD_ITEM
const spellsApplyingEnchant = new Map();
const enchantsAppliedBySpell = new Map();
for (const e of t.SpellEffect.rows) {
  if (!ENCHANT_EFFECTS.has(e.Effect) || e.DifficultyID !== 0) continue;
  const ench = e.EffectMiscValue[0];
  if (!spellsApplyingEnchant.has(ench)) spellsApplyingEnchant.set(ench, new Set());
  spellsApplyingEnchant.get(ench).add(e.SpellID);
  if (!enchantsAppliedBySpell.has(e.SpellID)) enchantsAppliedBySpell.set(e.SpellID, new Set());
  enchantsAppliedBySpell.get(e.SpellID).add(ench);
}
const itemsUsingSpell = new Map();
for (const [itemId, list] of itemEffectsByItem) {
  for (const e of list) {
    if (!itemsUsingSpell.has(e.SpellID)) itemsUsingSpell.set(e.SpellID, new Set());
    itemsUsingSpell.get(e.SpellID).add(itemId);
  }
}
const ENCHANT_SPELL_EFFECT_TYPES = new Set([1, 3, 7]); // combat spell (proc), equip spell, use spell
const docEnchantIds = new Set();
for (const en of buffsDoc.enchants) {
  for (const id of en.enchantIds) docEnchantIds.add(id);
  for (const s of en.spellIds) want(s, "enchant");
  for (const s of en.procSpellIds) want(s, "enchant");
}
for (const c of buffsDoc.consumables) for (const id of c.enchantIds) docEnchantIds.add(id);
for (const id of docEnchantIds) {
  const row = t.SpellItemEnchantment.byId.get(id);
  if (!row) continue;
  row.Effect.forEach((type, k) => {
    if (ENCHANT_SPELL_EFFECT_TYPES.has(type)) want(row.EffectArg[k], "enchant");
  });
}

// 6. Buff and debuff spells named in the buffs doc.
for (const b of buffsDoc.buffSpells) want(b.spellId, "buffsDoc");

// 7. Spells cited by id in the class and mechanics docs and the open questions (explicit
//    "spell N"-style markers, or the spell's name earlier on the same line).
for (const f of citingDocs(REPO_ROOT)) {
  const found = docSpellMentions(fs.readFileSync(path.join(REPO_ROOT, f), "utf8"), (id) => spells.name(id));
  for (const id of found.keys()) want(id, "docs");
}

// 8. Transitive closure over EffectTriggerSpell.
/** The spells `ids` trigger, directly or through other triggered spells (not `ids` themselves). */
function triggerClosure(ids) {
  const found = new Set();
  const queue = [...ids];
  while (queue.length) {
    for (const e of spells.effects(queue.pop())) {
      if (e.DifficultyID !== 0 || !e.EffectTriggerSpell || found.has(e.EffectTriggerSpell)) continue;
      found.add(e.EffectTriggerSpell);
      queue.push(e.EffectTriggerSpell);
    }
  }
  return found;
}
const seedCount = interest.size;
for (let changed = true; changed; ) {
  changed = false;
  for (const id of [...interest.keys()]) {
    for (const e of spells.effects(id)) {
      if (e.DifficultyID !== 0 || !e.EffectTriggerSpell) continue;
      const before = interest.size + missing.size;
      want(e.EffectTriggerSpell, "trigger");
      if (interest.size + missing.size !== before) changed = true;
    }
  }
}

// ---------------------------------------------------------------------------
// spells.json
// ---------------------------------------------------------------------------

const encryptedSpellIds = t.SpellName.encryptedIds;
const spellRecords = {};
for (const id of [...interest.keys()].sort(byNumber)) {
  const rec = spells.get(id);
  rec.sources = [...interest.get(id)].sort();
  spellRecords[id] = compactSpell(rec);
}
const reasonCounts = {};
for (const reasons of interest.values()) for (const r of reasons) reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
const missingList = [...missing.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([id, reasons]) => ({ id, sources: [...reasons].sort(), encrypted: encryptedSpellIds.has(id) }));
for (const m of missingList) {
  if (m.sources.includes("spellbook") || m.sources.includes("talent")) fail(`spell ${m.id} (${m.sources.join(", ")}) is not in the client`);
}

// ---------------------------------------------------------------------------
// talents.json
// ---------------------------------------------------------------------------

for (const u of talentMap.unmapped) warn(`talent not mapped: ${u.class} ${u.tree} ${u.name}`);

// ---------------------------------------------------------------------------
// items.json
// ---------------------------------------------------------------------------

const ITEM_SPARSE_COLUMNS = [
  "Display_lang",
  "ItemLevel",
  "RequiredLevel",
  "OverallQualityID",
  "InventoryType",
  "Bonding",
  "ItemDelay",
  "DamageType",
  "DmgVariance",
  "ItemRange",
  "SheatheType",
  "Material",
  "ItemSet",
  "AllowableClass",
  "AllowableRace",
  "RequiredSkill",
  "RequiredSkillRank",
  "MaxCount",
  "StatModifier_bonusStat",
  "StatPercentEditor",
  "Flags",
];
const ITEM_COLUMNS = ["ClassID", "SubclassID", "InventoryType", "Material", "SheatheType", "IconFileDataID"];
function itemRecord(id) {
  const sparse = t.ItemSparse.byId.get(id);
  const item = t.Item.byId.get(id);
  return {
    id,
    item: pick(item, ITEM_COLUMNS),
    itemSparse: pick(sparse, ITEM_SPARSE_COLUMNS),
    effects: itemEffects(id),
  };
}
const itemRecords = {};
for (const item of itemData.items) itemRecords[item.id] = itemRecord(item.id);
const consumableRecords = {};
for (const c of buffsDoc.consumables) {
  const rec = itemRecord(c.itemId);
  rec.doc = { name: c.name, section: c.section, spellIds: c.spellIds, enchantIds: c.enchantIds };
  rec.appliesEnchantIds = [...new Set(rec.effects.flatMap((e) => [...(enchantsAppliedBySpell.get(e.spellId) ?? [])]))].sort(byNumber);
  rec.docMismatches = [];
  const clientSpells = rec.effects.map((e) => e.spellId);
  for (const s of c.spellIds) {
    if (!clientSpells.includes(s)) rec.docMismatches.push(`doc says item ${c.itemId} → spell ${s}; client item effects: ${clientSpells.join(", ") || "none"}`);
  }
  // The chain's later spell steps ("13810 → 18124 → 18125") must be reached from the item's spell.
  const reached = triggerClosure(c.spellIds);
  for (const s of c.triggeredSpellIds) {
    if (!reached.has(s)) rec.docMismatches.push(`doc says spell ${s} follows item ${c.itemId}'s spell ${c.spellIds.join(" / ")}; client: its triggers don't reach ${s}`);
  }
  for (const en of c.enchantIds) {
    if (!rec.appliesEnchantIds.includes(en)) rec.docMismatches.push(`doc says item ${c.itemId} → enchant ${en}; client: ${rec.appliesEnchantIds.join(", ") || "none"}`);
    const row = t.SpellItemEnchantment.byId.get(en);
    const enchantSpells = row ? row.Effect.flatMap((type, k) => (ENCHANT_SPELL_EFFECT_TYPES.has(type) ? [row.EffectArg[k]] : [])) : [];
    for (const s of c.enchantSpellIds) {
      if (!enchantSpells.includes(s)) rec.docMismatches.push(`doc says enchant ${en} → spell ${s}; client enchant spells: ${enchantSpells.join(", ") || "none"}`);
    }
  }
  consumableRecords[c.itemId] = rec;
}
const itemCounts = {
  items: itemData.items.length,
  withItemRow: itemData.items.filter((i) => t.Item.byId.has(i.id)).length,
  withItemSparseRow: itemData.items.filter((i) => t.ItemSparse.byId.has(i.id)).length,
  withEffects: itemData.items.filter((i) => (itemEffectsByItem.get(i.id) ?? []).length > 0).length,
  foreverDataFalseWithItemSparseRow: itemData.items.filter((i) => !i.foreverData && t.ItemSparse.byId.has(i.id)).length,
  foreverDataTrueWithoutItemSparseRow: itemData.items.filter((i) => i.foreverData && !t.ItemSparse.byId.has(i.id)).length,
  consumables: buffsDoc.consumables.length,
  consumablesWithEffects: buffsDoc.consumables.filter((c) => (itemEffectsByItem.get(c.itemId) ?? []).length > 0).length,
};

// ---------------------------------------------------------------------------
// enchants.json
// ---------------------------------------------------------------------------

const ENCHANT_COLUMNS = [
  "Name_lang",
  "Duration",
  "Charges",
  "Effect",
  "EffectPointsMin",
  "EffectArg",
  "EffectScalingPoints",
  "ScalingClass",
  "Flags",
  "RequiredSkillID",
  "RequiredSkillRank",
  "MinLevel",
  "MaxLevel",
  "ItemLevel",
  "ItemLevelMin",
  "ItemLevelMax",
];
const enchantRecords = {};
const enchantMissing = [];
const enchantDocMismatches = [];
for (const id of [...docEnchantIds].sort(byNumber)) {
  const row = t.SpellItemEnchantment.byId.get(id);
  if (!row) {
    enchantMissing.push(id);
    continue;
  }
  const bySpells = [...(spellsApplyingEnchant.get(id) ?? [])].sort(byNumber);
  const byItems = [...new Set(bySpells.flatMap((s) => [...(itemsUsingSpell.get(s) ?? [])]))].sort(byNumber);
  enchantRecords[id] = {
    id,
    ...pick(row, ENCHANT_COLUMNS),
    spellIds: row.Effect.map((type, k) => (ENCHANT_SPELL_EFFECT_TYPES.has(type) ? row.EffectArg[k] : 0)).filter(Boolean),
    appliedBySpellIds: bySpells,
    appliedByItemIds: byItems,
    doc: [],
  };
}
for (const en of buffsDoc.enchants) {
  for (const [k, id] of en.enchantIds.entries()) {
    const rec = enchantRecords[id];
    if (!rec) continue;
    rec.doc.push({ name: en.name, section: en.section });
    for (const s of en.spellIds) {
      if (!rec.appliedBySpellIds.includes(s)) {
        const actual = [...(enchantsAppliedBySpell.get(s) ?? [])];
        enchantDocMismatches.push(`${en.name}: doc says spell ${s} applies enchant ${id}; client spell ${s} applies ${actual.join(", ") || "no enchant"}`);
      }
    }
    const itemId = en.itemIds.length === en.enchantIds.length ? en.itemIds[k] : null;
    for (const item of itemId ? [itemId] : en.itemIds) {
      if (!rec.appliedByItemIds.includes(item)) enchantDocMismatches.push(`${en.name}: doc says item ${item} applies enchant ${id}; client doesn't`);
    }
    for (const p of en.procSpellIds) {
      if (!rec.spellIds.includes(p)) enchantDocMismatches.push(`${en.name}: doc says enchant ${id} procs ${p}; client enchant spells ${rec.spellIds.join(", ") || "none"}`);
    }
  }
}
for (const rec of Object.values(enchantRecords)) rec.doc.sort((a, b) => (a.section + a.name < b.section + b.name ? -1 : 1));

// ---------------------------------------------------------------------------
// gametables.json
// ---------------------------------------------------------------------------

const LEVEL = 60;
const classNames = new Map(t.ChrClasses.rows.map((r) => [r.ID, r.Filename.toLowerCase()]));
const rowAt = (table, level, key = "Level") => table.rows?.find((r) => r[key] === level) ?? null;
function camelRow(row, drop = []) {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (drop.includes(k)) continue;
    out[camel(k.replace(/ - /g, " ").replace(/[^A-Za-z0-9 ]/g, "").replace(/ (\w)/g, (_, c) => c.toUpperCase()))] = v;
  }
  return out;
}
const crRows = gt.combatRatings.rows ?? [];
const cr60 = rowAt(gt.combatRatings, LEVEL);
const crConstant = crRows.every((r) => Object.keys(r).every((k) => k === "Level" || r[k] === cr60[k]));
const pes = {};
for (const r of t.PlayerExpectedStat.rows.filter((r) => r.Level === LEVEL && r.ContentSetID === 0)) {
  pes[classNames.get(r.ClassID) ?? String(r.ClassID)] = {
    classId: r.ClassID,
    baseMana: r.BaseMana,
    critPerAgility: r.CritPerAgility,
    spellCritPerIntellect: r.SpellCritPerIntellect,
    // Unnamed in WoWDBDefs; the stats doc records them as "two unnamed columns".
    field5: r.Field_1_60_1_69876_005,
    field6: r.Field_1_60_1_69876_006,
  };
}
const armorRows = {};
for (const lvl of [60, 61, 62, 63]) armorRows[lvl] = rowAt(gt.armorMitigation, lvl)?.Constant ?? null;
const gametables = {
  level: LEVEL,
  combatRatings: {
    level60: camelRow(cr60, ["Level"]),
    sameAtEveryLevel: crConstant,
    levels: crRows.length,
  },
  baseMana: { level60: camelRow(rowAt(gt.baseMana, LEVEL), ["Level"]) },
  hpPerStamina: { level60: rowAt(gt.hpPerStamina, LEVEL)?.Health ?? null },
  armorMitigation: { byLevel: armorRows },
  playerExpectedStat: { level60: pes },
};
if (!cr60 || cr60["Crit - Melee"] !== 14) fail(`combatratings.txt level 60 "Crit - Melee" is ${cr60?.["Crit - Melee"]}, expected 14`);

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function scrapedAt(names) {
  let latestAt = "";
  for (const n of names) {
    const fdid = usedFdids.get(n);
    const meta = fdid && source.cascMeta(fdid);
    if (meta?.fetchedAt && meta.fetchedAt > latestAt) latestAt = meta.fetchedAt;
  }
  return latestAt.replace(/\.\d+Z$/, "Z");
}
function meta(names) {
  const tables = {};
  for (const n of [...names].sort()) tables[n] = usedFdids.get(n);
  return {
    source: "https://wago.tools/api/casc",
    product: opts.product,
    build: version,
    buildCreatedAt,
    tables,
    wowDbDefs: { repository: "https://github.com/wowdev/WoWDBDefs", commit: dbdefsSha },
    scrapedAt: scrapedAt(names),
    scraper: SCRAPER,
  };
}

const outDir = path.resolve(REPO_ROOT, opts.out);
const written = {};
function emit(file, data) {
  const text = stableStringify(data);
  output.write(path.join(outDir, file), text);
  written[file] = text.length;
}

const spellIds = Object.keys(spellRecords).map(Number);
for (const col of spells.droppedColumnsInUse(spellIds)) warn(`${col} is not written to spells.json but is non-zero for an extracted spell`);
emit("spells.json", {
  meta: meta(SPELL_TABLES),
  radii: spells.radii(spellIds),
  spellCategories: spells.spellCategories(spellIds),
  counts: {
    spells: Object.keys(spellRecords).length,
    seeds: seedCount,
    bySource: reasonCounts,
    notInClient: missingList.length,
    encryptedSpellNameRecords: encryptedSpellIds.size,
  },
  excludedWorldBuffs: Object.fromEntries(excludedWorldBuffs),
  notInClient: missingList,
  racials,
  spells: spellRecords,
});
emit("talents.json", {
  meta: meta(TALENT_TABLES),
  counts: talentMap.counts,
  unmapped: talentMap.unmapped,
  classes: talentMap.classes,
});
emit("items.json", {
  meta: meta(["Item", "ItemSparse", "ItemEffect", ...(t.ItemXItemEffect.present ? ["ItemXItemEffect"] : []), "SpellEffect"]),
  counts: itemCounts,
  items: itemRecords,
  consumables: consumableRecords,
});
emit("enchants.json", {
  meta: meta(["SpellItemEnchantment", "SpellEffect", "ItemEffect", ...(t.ItemXItemEffect.present ? ["ItemXItemEffect"] : [])]),
  counts: { docEnchants: docEnchantIds.size, inClient: Object.keys(enchantRecords).length, notInClient: enchantMissing.length },
  notInClient: enchantMissing,
  docMismatches: enchantDocMismatches.sort(),
  enchants: enchantRecords,
});
emit("gametables.json", {
  meta: meta([...Object.values(GAMETABLES).filter((f) => usedFdids.has(f)), "PlayerExpectedStat", "ChrClasses"]),
  ...gametables,
});

// ---------------------------------------------------------------------------
// Claims report (optional)
// ---------------------------------------------------------------------------

if (opts.claims) {
  const { checkClaims } = await import("./lib/claims.mjs");
  const baseline = createClientSource({ fetcher, cacheDir: CACHE_DIR, version: opts.claims, dbdefsSha });
  const report = await checkClaims({ t, gt, spells, source, baseline, talents: talentMap, consumables: consumableRecords, enchants: enchantRecords, spellsApplyingEnchant, itemEffectsByItem, version, baselineVersion: opts.claims });
  const file = path.join(CACHE_DIR, version, "claims.md");
  fs.writeFileSync(file, report.markdown);
  console.log(`claims: ${report.summary}  -> ${path.relative(REPO_ROOT, file)}`);
}

finish();

function finish() {
  const { requests, cacheHits } = fetcher.stats();
  let total = 0;
  const log = path.join(CACHE_DIR, "requests.jsonl");
  if (fs.existsSync(log)) total = fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).length;
  console.log(`build ${opts.product} ${version}; WoWDBDefs ${dbdefsSha}`);
  console.log(`requests this run: ${requests} (cache hits ${cacheHits}); all-time requests logged: ${total}`);
  if (Object.keys(written).length) {
    for (const [f, n] of Object.entries(written)) console.log(`  ${path.join(opts.out, f)}  ${(n / 1024).toFixed(0)} KiB`);
    console.log(`interest set: ${interest.size} spells (${seedCount} before trigger closure); ${JSON.stringify(reasonCounts)}; not in client: ${missing.size}`);
    console.log(`talents: ${JSON.stringify(talentMap.counts)}`);
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  output.finish();
  process.exit(errors.length ? 1 : (process.exitCode ?? 0));
}
