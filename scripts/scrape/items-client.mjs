#!/usr/bin/env node
// The pre-raid item pool, src/data/items/pre-bis.json, from the client files (milestones
// M1.5c-1 and M1.5c-2, decision D17). Forever (wow_classic_beta) rows first; items the Forever
// client has no row for fall back to their Classic Era (wow_classic_era) row, flagged.
//
//   node scripts/scrape/items-client.mjs [--write] [--compare] [--diff] [--fixtures]
//        [--refresh] [--version=<Forever build>] [--baseline=<Classic Era build>] [--dbdefs=<sha>]
//        [--snapshot=<old pre-bis.json>]
//
//   --write     (default) derive the pool and write src/data/items/pre-bis.json
//   --compare   derive every item of the saved foreverchanges snapshot and compare it field by
//               field (the M1.5c-1 check); report in .cache/client/<build>/items-compare.md
//   --diff      old dataset (the snapshot) vs the written one: items added and removed, and
//               changed fields by class; report in .cache/client/<build>/items-diff.md
//   --fixtures  regenerate scripts/scrape/lib/__fixtures__/item-stats.json (unit-test rows)
//
// The snapshot is the last foreverchanges.pro dataset (git: b94a076:src/data/items/pre-bis.json).
// --write saves the current pre-bis.json there before overwriting it when it is still the
// foreverchanges one. Default path: .cache/client/items-foreverchanges-snapshot.json.
//
// Downloads go through lib/wago.mjs (documented wago.tools API only, one request at a time,
// cached under .cache/client/, once per build). Zero dependencies (Node >= 22). The derivation
// is lib/item-stats.mjs, the text renderer lib/spell-text.mjs and the pool lib/item-pool.mjs;
// see docs/data/items.md and docs/data/client.md#items-from-the-client.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createFetcher } from "./lib/http.mjs";
import { buildPool, measureRatingConversions } from "./lib/item-pool.mjs";
import { ITEM_GAMETABLES, ITEM_TABLES, createItemContext } from "./lib/item-stats.mjs";
import { stableStringify } from "./lib/json.mjs";
import { SPELL_TEXT_TABLES, createSpellTextContext } from "./lib/spell-text.mjs";
import { createClientSource, latestBuild, wowDbDefsCommit } from "./lib/wago.mjs";

// ---------------------------------------------------------------------------
// Filter: edit these to widen the dataset (e.g. QUALITIES = [3, 4] for epics).
// ---------------------------------------------------------------------------

// Kept: equippable AND quality in QUALITIES AND (REQ_LEVEL[0] <= required level <= REQ_LEVEL[1]
// OR item level >= MIN_ITEM_LEVEL), OR listed in PRE_RAID_BIS_FILE at any quality or level.
// Decided by the user, 2026-09-22 (decisions D10, D11; docs/data/items.md#filter).

/** Item qualities to keep: 2 Uncommon, 3 Rare, 4 Epic, 5 Legendary. */
const QUALITIES = [3];
/** Inclusive required-level range. */
const REQ_LEVEL = [55, 60];
/** Items at or above this item level are kept whatever their required level. null = off. */
const MIN_ITEM_LEVEL = 58;
/**
 * Season of Discovery guard. The Classic Era client also ships Season of Discovery items, so an
 * item is eligible only if it is an original Classic item (id below this) or new in Forever (a
 * Forever row and no Classic Era row). Original Classic ids end around 24300.
 */
const MAX_CLASSIC_ITEM_ID = 25000;
/** Items that pass the rule but can't be obtained. Each needs a reason (meta.filter). */
const EXCLUDED_ITEMS = new Map([
  [20368, "Bland Bow of Steadiness: Classic test weapon, not obtainable"],
  [24071, "Bland Dagger: Classic test weapon, not obtainable"],
]);
/** Client rows that are developer items, not loot: test, deprecated and monster items. */
const JUNK_NAME = /\b(?:test|deprecated)\b|^monster\b|\bplaceholder\b|\[dnt\]|\(dnt\)/i;
/** Hand-curated Classic Era pre-raid BiS lists (scraper input); every listed item joins the pool. */
const PRE_RAID_BIS_FILE = "scripts/scrape/pre-raid-bis.json";
/**
 * New Forever items that no client build carries yet (foreverchanges showed them from server
 * hotfixes, which the raw client files don't include). D17: flagged, never guessed. They join
 * the pool on their own once a build ships their rows; delete them here then.
 */
const WATCH_ITEMS = new Map([
  [272491, "Premier Chain Headguard"],
  [271907, "Expeditionary's Cape"],
  [272063, "Darkspear Raider's Cloak"],
  [272411, "Arcanoweave Cloak"],
  [272414, "Howler's Furs"],
  [272415, "Stalwart Cloak"],
  [284261, "Magically Fortified Legguards"],
  [271924, "Rebels' Rugged Reaper"],
  [272079, "Darkspear Raider's Reaper"],
  [284257, "Icesworn Decapitator"],
  [271928, "Clever Expeditionary's Spellblade"],
  [271936, "Guerilla's Jagged Mace"],
  [272083, "Darkspear Insurgent's Spellblade"],
  [272091, "Darkspear Skirmisher's Bludgeon"],
  [271932, "Insurgent's Manifesto"],
  [272087, "Tome of the Darkspear Prophecy"],
]);
const OUT_FILE = "src/data/items/pre-bis.json";

const FILTER_RULE =
  `equippable AND ((quality in [${QUALITIES.join(", ")}] AND ` +
  `(${REQ_LEVEL[0]} <= required level <= ${REQ_LEVEL[1]}` +
  `${MIN_ITEM_LEVEL === null ? "" : ` OR item level >= ${MIN_ITEM_LEVEL} (any required level, including none)`}))` +
  ` OR listed in ${PRE_RAID_BIS_FILE} (any quality or level))` +
  ` AND (id < ${MAX_CLASSIC_ITEM_ID} OR new in Forever: a Forever row and no Classic Era row)`;

// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "client");
const SCRAPER = "scripts/scrape/items-client.mjs";
const FIXTURE_FILE = "scripts/scrape/lib/__fixtures__/item-stats.json";
const DEFAULT_SNAPSHOT = ".cache/client/items-foreverchanges-snapshot.json";
/** The last commit whose pre-bis.json came from foreverchanges.pro. */
const SNAPSHOT_COMMIT = "b94a076";
const PRODUCT = "wow_classic_beta";
const BASELINE_PRODUCT = "wow_classic_era";
const DEFAULT_BASELINE = "1.15.9.69722";

const opts = { write: false, compare: false, diff: false, fixtures: false, refresh: false, version: null, baseline: DEFAULT_BASELINE, dbdefs: null, snapshot: DEFAULT_SNAPSHOT };
for (const arg of process.argv.slice(2)) {
  const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
  if (!m) usage(`Unknown argument: ${arg}`);
  const [, key, value] = m;
  if (["write", "compare", "diff", "fixtures", "refresh"].includes(key) && value === undefined) opts[key] = true;
  else if (["version", "baseline", "dbdefs", "snapshot"].includes(key) && value) opts[key] = value;
  else usage(`Unknown argument: ${arg}`);
}
if (!opts.compare && !opts.diff && !opts.fixtures) opts.write = true;
function usage(msg) {
  console.error(`${msg}\nUsage: node ${SCRAPER} [--write] [--compare] [--diff] [--fixtures] [--refresh] [--version=<build>] [--baseline=<build>] [--dbdefs=<sha>] [--snapshot=<file>]`);
  process.exit(2);
}

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const fetcher = createFetcher({ cacheDir: CACHE_DIR, refresh: opts.refresh });
const latest = await latestBuild(fetcher, PRODUCT);
const version = opts.version ?? latest.version;
const dbdefsSha = await wowDbDefsCommit(fetcher, opts.dbdefs);

/** Tables beyond the derivation and the text renderer: names, limits, icons, races. */
const LOOKUP_TABLES = ["ItemSubClass", "Faction", "SkillLine", "ItemLimitCategory", "ChrClasses", "ChrRaces", "CharBaseInfo", "ItemModifiedAppearance", "ItemAppearance"];

async function load(key, build, { lookups = false } = {}) {
  const source = createClientSource({ fetcher, cacheDir: CACHE_DIR, version: build, dbdefsSha });
  const tables = {};
  const used = new Map(); // table → FileDataID
  const names = [...new Set([...ITEM_TABLES, ...SPELL_TEXT_TABLES, ...(lookups ? LOOKUP_TABLES : ["ChrClasses"])])];
  for (const name of names) {
    const t = await source.table(name);
    if (!t.present && name !== "ItemXItemEffect") throw new Error(`${name}: not in build ${build}`);
    if (t.warnings?.length) throw new Error(`${name} (${build}): ${t.warnings.join("; ")}`);
    tables[name] = t;
    if (t.present) used.set(name, t.fdid);
  }
  const gameTables = {};
  for (const [k, file] of Object.entries(ITEM_GAMETABLES)) {
    const fdid = await source.fdidByName(file);
    if (!fdid) continue; // Forever doesn't ship shieldblockregular.txt
    gameTables[k] = (await source.gameTable(file)).rows;
    used.set(file, fdid);
  }
  return { key, build, source, tables, gameTables, used, ctx: createItemContext(tables, gameTables), text: createSpellTextContext(tables) };
}

const forever = await load("forever", version, { lookups: true });
const classic = await load("classic", opts.baseline);

// ---------------------------------------------------------------------------
// Pre-raid BiS lists
// ---------------------------------------------------------------------------

/** Read PRE_RAID_BIS_FILE: { specs, byId: Map<id, [{ spec, slot, rank }]>, names: Map<id, name> }. */
function loadPreRaidBis() {
  const data = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, PRE_RAID_BIS_FILE), "utf8"));
  const out = { specs: {}, byId: new Map(), names: new Map() };
  const specOrder = Object.keys(data.specs);
  for (const [spec, s] of Object.entries(data.specs)) {
    if (!s.name || !s.source?.url) fail(`${PRE_RAID_BIS_FILE}: spec ${spec} needs a name and source.url`);
    out.specs[spec] = { name: s.name, source: s.source, ...(s.note ? { note: s.note } : {}) };
    for (const [slot, entries] of Object.entries(s.slots)) {
      for (const e of entries) {
        if (!Number.isInteger(e.id) || !Number.isInteger(e.rank) || e.rank < 1 || !e.name) {
          fail(`${PRE_RAID_BIS_FILE}: bad entry in ${spec}.${slot}: ${JSON.stringify(e)}`);
          continue;
        }
        if (out.names.has(e.id) && out.names.get(e.id) !== e.name) fail(`${PRE_RAID_BIS_FILE}: ${e.id} is named both "${out.names.get(e.id)}" and "${e.name}"`);
        out.names.set(e.id, e.name);
        if (!out.byId.has(e.id)) out.byId.set(e.id, []);
        out.byId.get(e.id).push({ spec, slot, rank: e.rank });
      }
    }
  }
  for (const list of out.byId.values())
    list.sort((a, b) => specOrder.indexOf(a.spec) - specOrder.indexOf(b.spec) || a.slot.localeCompare(b.slot) || a.rank - b.rank);
  return out;
}

// ---------------------------------------------------------------------------
// Lookups: names, limit categories, classes, races and icons
// ---------------------------------------------------------------------------

let classicFiles = null;
/**
 * Icon name of a FileDataID from the build's own file list ("interface/icons/inv_helmet_36.blp"
 * → "inv_helmet_36"). FileDataIDs are global, so the Forever list serves Classic Era rows too;
 * the Classic Era list is read only for an id Forever's lacks.
 */
async function createIconNamer() {
  const files = await forever.source.files();
  const appearance = forever.tables.ItemAppearance.byId;
  const byItem = new Map();
  for (const r of [...forever.tables.ItemModifiedAppearance.rows].sort((a, b) => a.OrderIndex - b.OrderIndex || a.ID - b.ID))
    if (!byItem.has(r.ItemID)) byItem.set(r.ItemID, r.ItemAppearanceID);
  const unresolved = [];
  const name = (fdid) => {
    let n = files[String(fdid)];
    if (!n && classicFiles) n = classicFiles[String(fdid)];
    const m = n && /^interface\/icons\/(.+)\.blp$/i.exec(n);
    // Icon CDNs (Wowhead's, decision D14) spell a space in a file name as "-".
    return m ? m[1].toLowerCase().replaceAll(" ", "-") : null;
  };
  const iconName = (id, item) => {
    // Item.IconFileDataID, else the default icon of the item's first appearance.
    const fdid = item?.IconFileDataID || appearance.get(byItem.get(id))?.DefaultIconFileDataID || null;
    const n = fdid ? name(fdid) : null;
    if (!n) unresolved.push({ id, fdid });
    return n;
  };
  return { iconName, unresolved };
}

function createLookups(bundle, iconName) {
  const t = forever.tables;
  const subclass = new Map(t.ItemSubClass.rows.map((r) => [`${r.ClassID}:${r.SubClassID}`, r]));
  const shared = new Set();
  const seen = new Set();
  for (const r of t.ItemSubClass.rows) {
    const k = `${r.ClassID}:${r.DisplayName_lang}`;
    if (seen.has(k)) shared.add(k);
    seen.add(k);
  }
  const limit = t.ItemLimitCategory.byId;
  const playableRaces = new Set(t.CharBaseInfo.rows.map((r) => r.RaceID));
  return {
    // The display name ("Plate", "Dagger", "Idol"), or the verbose one where two subclasses
    // share it ("One-Handed Swords" / "Two-Handed Swords" for "Sword").
    subclassName: (classId, subclassId) => {
      const r = subclass.get(`${classId}:${subclassId}`);
      if (!r) return null;
      return shared.has(`${classId}:${r.DisplayName_lang}`) && r.VerboseName_lang ? r.VerboseName_lang : r.DisplayName_lang;
    },
    factionName: (id) => t.Faction.byId.get(id)?.Name_lang ?? null,
    skillName: (id) => t.SkillLine.byId.get(id)?.DisplayName_lang ?? null,
    limitCategory: (id) => limit.get(id) ?? null,
    classes: bundle.tables.ChrClasses.rows.map((r) => ({ id: r.ID, name: r.Name_lang })),
    races: t.ChrRaces.rows.filter((r) => playableRaces.has(r.ID)).map((r) => ({ id: r.ID, name: r.Name_lang })),
    iconName,
  };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function scrapedAt(bundles) {
  let latestAt = "";
  for (const b of bundles)
    for (const fdid of b.used.values()) {
      const meta = b.source.cascMeta(fdid);
      if (meta?.fetchedAt && meta.fetchedAt > latestAt) latestAt = meta.fetchedAt;
    }
  return latestAt.replace(/\.\d+Z$/, "Z");
}

async function write() {
  const outPath = path.join(REPO_ROOT, OUT_FILE);
  const snapshotPath = path.resolve(REPO_ROOT, opts.snapshot);
  if (fs.existsSync(outPath) && !fs.existsSync(snapshotPath)) {
    const current = JSON.parse(fs.readFileSync(outPath, "utf8"));
    if (/foreverchanges\.pro/.test(current.meta?.source ?? "")) {
      fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
      fs.copyFileSync(outPath, snapshotPath);
      console.log(`Saved the foreverchanges snapshot to ${path.relative(REPO_ROOT, snapshotPath)}`);
    }
  }

  const bis = loadPreRaidBis();
  const { iconName, unresolved } = await createIconNamer();
  forever.lookups = createLookups(forever, iconName);
  classic.lookups = createLookups(classic, iconName);
  const filter = { qualities: QUALITIES, reqLevel: REQ_LEVEL, minItemLevel: MIN_ITEM_LEVEL, maxClassicItemId: MAX_CLASSIC_ITEM_ID, excludedItems: EXCLUDED_ITEMS, junkName: JUNK_NAME };
  let pool = buildPool({ forever, classic, filter, bis, watch: WATCH_ITEMS });
  if (unresolved.length) {
    // Rare: an icon only the Classic Era file list names. Read it and build again.
    classicFiles = await classic.source.files();
    unresolved.length = 0;
    pool = buildPool({ forever, classic, filter, bis, watch: WATCH_ITEMS });
    for (const u of unresolved) warn(`item ${u.id}: no icon name for FileDataID ${u.fdid}`);
  }
  const { items, sets, counts, noClientRow, coverage, report } = pool;

  // Checks: the pre-raid BiS lists, names, SoD and the statsFrom flags.
  const byId = new Map(items.map((i) => [i.id, i]));
  const notInData = [];
  for (const [id, name] of bis.names) {
    const item = byId.get(id);
    const row = forever.ctx.sparse.get(id) ?? classic.ctx.sparse.get(id);
    if (!row) notInData.push({ id, name });
    else if (row.Display_lang !== name) fail(`${PRE_RAID_BIS_FILE}: ${id} is "${row.Display_lang}" in the client, not "${name}"`);
    else if (!item) warn(`${PRE_RAID_BIS_FILE}: ${id} ${name} is listed but not in the pool (not equippable, excluded or not eligible)`);
  }
  for (const i of items) {
    if (i.tab !== "new" && i.id >= MAX_CLASSIC_ITEM_ID) fail(`SoD guard: ${i.id} ${i.name} (${i.tab}) has a Classic Era row and id >= ${MAX_CLASSIC_ITEM_ID}`);
    if (!i.icon) warn(`${i.id} ${i.name}: no icon`);
    if (i.weapon && (i.weapon.min === null || i.weapon.max === null)) fail(`${i.id} ${i.name}: weapon without damage`);
  }
  for (const [id, s] of Object.entries(sets)) if (!s.name) fail(`set ${id}: no ItemSet row in either client`);
  for (const w of noClientRow) console.log(`  still no client row: ${w.id} ${w.name}`);
  for (const [id, name] of WATCH_ITEMS)
    if (byId.has(id)) console.log(`NOTE: watched item ${id} ${name} now has a client row and is in the pool; remove it from WATCH_ITEMS`);

  const ratingConversions = measureRatingConversions(forever, classic, MAX_CLASSIC_ITEM_ID);
  const tableMeta = (b) => Object.fromEntries([...b.used.entries()].sort(([a], [c]) => a.localeCompare(c)));
  const out = {
    meta: {
      source: "https://wago.tools/api/casc",
      scraper: SCRAPER,
      product: PRODUCT,
      foreverBuild: version,
      foreverBuildDate: latest.version === version ? latest.created_at.slice(0, 10) : null,
      classicProduct: BASELINE_PRODUCT,
      classicBuild: opts.baseline,
      tables: { forever: tableMeta(forever), classic: tableMeta(classic) },
      wowDbDefs: { repository: "https://github.com/wowdev/WoWDBDefs", commit: dbdefsSha },
      scrapedAt: scrapedAt([forever, classic]),
      filter: {
        rule: FILTER_RULE,
        qualities: QUALITIES,
        reqLevel: REQ_LEVEL,
        minItemLevel: MIN_ITEM_LEVEL,
        equippableOnly: true,
        maxClassicItemId: MAX_CLASSIC_ITEM_ID,
        excludedItemIds: Object.fromEntries(EXCLUDED_ITEMS),
        excludedNamePattern: JUNK_NAME.source,
        includeList: PRE_RAID_BIS_FILE,
      },
      counts: { ...counts, statsFrom: { forever: items.filter((i) => i.statsFrom === "forever").length, classic: items.filter((i) => i.statsFrom === "classic").length } },
      noClientRow,
      preRaidBis: {
        file: PRE_RAID_BIS_FILE,
        specs: bis.specs,
        listedItems: bis.names.size,
        inPool: items.filter((i) => i.preRaidBis.length).length,
        addedByList: report.addedByList.length,
        notInData,
      },
      descriptionCoverage: coverage,
      ratingConversions,
    },
    sets,
    items,
  };

  printSummary(out, report);
  if (errors.length) {
    for (const e of errors) console.error(`ERROR: ${e}`);
    console.error(`\nNot writing ${OUT_FILE}: ${errors.length} check(s) failed.`);
    process.exitCode = 1;
    return;
  }
  const text = stableStringify(out);
  fs.writeFileSync(outPath, text);
  console.log(`\nWrote ${OUT_FILE}: ${items.length} items, ${Object.keys(sets).length} sets (${(text.length / 1024).toFixed(0)} KB)`);
}

function printSummary(out, report) {
  const { counts, descriptionCoverage: dc, preRaidBis, noClientRow } = out.meta;
  const tally = (f) => {
    const m = new Map();
    for (const i of out.items) m.set(f(i), (m.get(f(i)) ?? 0) + 1);
    return [...m].map(([k, v]) => `${k} ${v}`).join(", ");
  };
  console.log(`Filter: ${FILTER_RULE}`);
  console.log(`items ${counts.items}: ${Object.entries(counts.byTab).map(([k, v]) => `${k} ${v}`).join(", ")}; stats from forever ${counts.statsFrom.forever}, classic ${counts.statsFrom.classic}; sets ${counts.sets}`);
  console.log(`by slot: ${tally((i) => i.slot)}`);
  console.log(`by quality: ${tally((i) => i.quality)}`);
  console.log(`excluded by name ${report.excludedByName.length}, by id ${report.excludedById.length}, SoD guard ${report.sod.length}, no Item row ${report.missingItemRow.length}`);
  for (const x of report.missingItemRow) warn(`${x.id} ${x.name}: an ItemSparse row but no Item row; left out`);
  console.log(`pre-raid BiS: ${preRaidBis.listedItems} listed, ${preRaidBis.inPool} in the pool, ${preRaidBis.addedByList} only because listed, ${preRaidBis.notInData.length} with no row`);
  console.log(`no client row (watched): ${noClientRow.length}`);
  console.log(`descriptions: ${dc.rendered} rendered, ${dc.generated} generated, ${dc.fallback} fallback, ${dc.hidden} hidden`);
  for (const f of dc.fallbackSpells) console.log(`  fallback ${f.build} spell ${f.spellId} ${f.name}: ${f.tokens.join(" ")} (${f.usedBy.join(", ")})`);
  for (const w of warnings) console.warn(`WARNING: ${w}`);
  const { requests } = fetcher.stats();
  console.log(`network requests this run: ${requests}`);
}

// ---------------------------------------------------------------------------
// Snapshot (the last foreverchanges dataset)
// ---------------------------------------------------------------------------

function readSnapshot() {
  const file = path.resolve(REPO_ROOT, opts.snapshot);
  if (!fs.existsSync(file)) {
    // Recreate it from git history when the cache was cleared.
    try {
      const body = execFileSync("git", ["show", `${SNAPSHOT_COMMIT}:${OUT_FILE}`], { cwd: REPO_ROOT, maxBuffer: 1 << 28 });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      console.log(`Restored the foreverchanges snapshot from git (${SNAPSHOT_COMMIT}) to ${path.relative(REPO_ROOT, file)}`);
    } catch {
      console.error(`No snapshot at ${path.relative(REPO_ROOT, file)} and git show ${SNAPSHOT_COMMIT}:${OUT_FILE} failed.`);
      process.exit(2);
    }
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!/foreverchanges\.pro/.test(data.meta?.source ?? "")) console.warn(`WARNING: ${opts.snapshot} is not a foreverchanges dataset (meta.source ${data.meta?.source})`);
  return data;
}


// ---------------------------------------------------------------------------
// Test fixtures: the real rows behind the unit tests
// ---------------------------------------------------------------------------

/** The rows behind scripts/scrape/lib/item-stats.test.mjs, by build. */
const FIXTURES = {
  // Lionheart Helm, Annihilator (1H + chance on hit), Arcanite Reaper (2H), Whiteout and
  // Crackling Staff (caster weapons), Burrow Barricade (shield + bonus armor), Rune of the Guard
  // Captain (equip AP + area-restricted AP), Stormpike Insignia Rank 4 (category cooldown).
  forever: { items: [12640, 12798, 12784, 19101, 19102, 274418, 19120, 17902], sets: [281] },
  // Lionheart Helm (equip crit/hit), Barrier Shield (block chance and value, innate block),
  // Hand of Justice (Classic Era only: AP + proc), Warblade of Caer Darrow (extra damage),
  // Devilsaur Leggings (46 melee / 48 ranged AP).
  classic: { items: [12640, 18499, 11815, 13982, 15062], sets: [1] },
};

function writeFixtures() {
  const out = { $comment: `Real client rows for scripts/scrape/lib/item-stats.test.mjs. Generated by scripts/scrape/items-client.mjs --fixtures from Forever ${version} and Classic Era ${opts.baseline}; don't edit by hand.` };
  for (const [key, { tables, gameTables, ctx }] of Object.entries({ forever, classic })) {
    const { items, sets } = FIXTURES[key];
    const rowsOf = (name) => tables[name]?.rows ?? [];
    const pick = (name, pred) => rowsOf(name).filter(pred);
    const sparse = pick("ItemSparse", (r) => items.includes(r.ID));
    const levels = new Set(sparse.map((r) => r.ItemLevel));
    const effectIds = new Set(items.flatMap((id) => (ctx.itemEffects.get(id) ?? []).map((e) => e.ID)));
    const setRows = pick("ItemSet", (r) => sets.includes(r.ID));
    const setSpells = pick("ItemSetSpell", (r) => sets.includes(r.ItemSetID));
    const spellIds = new Set([...pick("ItemEffect", (r) => effectIds.has(r.ID)).map((r) => r.SpellID), ...setSpells.map((r) => r.SpellID)]);
    const bySpell = (name) => pick(name, (r) => spellIds.has(r.SpellID));
    out[key] = {
      build: key === "forever" ? version : opts.baseline,
      tables: {
        ItemSparse: sparse,
        Item: pick("Item", (r) => items.includes(r.ID)),
        ItemEffect: pick("ItemEffect", (r) => effectIds.has(r.ID)),
        ItemXItemEffect: pick("ItemXItemEffect", (r) => effectIds.has(r.ItemEffectID)),
        ItemSet: setRows,
        ItemSetSpell: setSpells,
        RandPropPoints: pick("RandPropPoints", (r) => levels.has(r.ID)),
        ItemArmorQuality: pick("ItemArmorQuality", (r) => levels.has(r.ID)),
        ItemArmorTotal: pick("ItemArmorTotal", (r) => levels.has(r.ID)),
        ItemArmorShield: pick("ItemArmorShield", (r) => levels.has(r.ID)),
        ArmorLocation: rowsOf("ArmorLocation"),
        ...Object.fromEntries(ITEM_TABLES.filter((n) => n.startsWith("ItemDamage")).map((n) => [n, pick(n, (r) => levels.has(r.ID))])),
        SpellEffect: bySpell("SpellEffect"),
        SpellName: pick("SpellName", (r) => spellIds.has(r.ID)),
        SpellCooldowns: bySpell("SpellCooldowns"),
        SpellCastingRequirements: bySpell("SpellCastingRequirements"),
        SpellShapeshift: bySpell("SpellShapeshift"),
      },
      gameTables: Object.fromEntries(Object.entries(gameTables).map(([k, rows]) => [k, rows.filter((r) => levels.has(r.Level))])),
    };
  }
  const file = path.join(REPO_ROOT, FIXTURE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // One row per line keeps the file small and its diffs readable.
  const tableLines = (rows) => (rows.length ? `[\n${rows.map((r) => `        ${JSON.stringify(r)}`).join(",\n")}\n      ]` : "[]");
  const build = (b) =>
    `{\n    "build": ${JSON.stringify(b.build)},\n    "tables": {\n${Object.entries(b.tables)
      .map(([n, rows]) => `      ${JSON.stringify(n)}: ${tableLines(rows)}`)
      .join(",\n")}\n    },\n    "gameTables": ${JSON.stringify(b.gameTables)}\n  }`;
  fs.writeFileSync(file, `{\n  "$comment": ${JSON.stringify(out.$comment)},\n  "forever": ${build(out.forever)},\n  "classic": ${build(out.classic)}\n}\n`);
  JSON.parse(fs.readFileSync(file, "utf8")); // stays valid JSON
  console.log(`fixtures: ${FIXTURE_FILE} (${fs.statSync(file).size} bytes)`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

if (opts.write) await write();
if (opts.compare) {
  const { compare } = await import("./lib/items-compare.mjs");
  const ok = compare({ forever, classic, pool: readSnapshot(), version, baseline: opts.baseline, dbdefsSha, outDir: path.join(CACHE_DIR, version), repoRoot: REPO_ROOT, bisFile: PRE_RAID_BIS_FILE });
  if (!ok) process.exitCode = 1;
}
if (opts.diff) {
  const { diff } = await import("./lib/items-diff.mjs");
  diff({ old: readSnapshot(), next: JSON.parse(fs.readFileSync(path.join(REPO_ROOT, OUT_FILE), "utf8")), outDir: path.join(CACHE_DIR, version), repoRoot: REPO_ROOT });
}
if (opts.fixtures) writeFixtures();
if (!opts.write) console.log(`network requests this run: ${fetcher.stats().requests}`);
