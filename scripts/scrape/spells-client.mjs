#!/usr/bin/env node
// The class spellbooks, src/data/spells/{warrior,druid,paladin}.json, from the client files
// (milestone M1.5e, decision D17): the spells each class learns in the Forever beta client
// (wow_classic_beta), rank by rank, next to the same spell in the Classic Era client
// (wow_classic_era).
//
//   node scripts/scrape/spells-client.mjs [--diff] [--against=<git ref>] [--refresh]
//        [--version=<Forever build>] [--baseline=<Classic Era build>] [--dbdefs=<sha>]
//
//   (default)  derive the three books and write src/data/spells/<class>.json
//   --diff     then diff the written books against the committed ones, spell by spell; report in
//              .cache/client/<build>/spells-diff.md (+ .json)
//   --against  the git ref whose dataset is "committed" (default HEAD)
//
// The run exits non-zero and writes nothing if a check fails: a Forever rank whose tooltip
// doesn't render, an icon without a name, a talent spell missing from the book, duplicate ids,
// or counts that don't add up.
//
// Downloads go through lib/wago.mjs (documented wago.tools API only, one request at a time,
// cached under .cache/client/, once per build). Zero dependencies (Node >= 22). The book
// derivation is lib/spellbook.mjs and the text renderer lib/spell-text.mjs; see
// docs/data/spells.md.

import fs from "node:fs";
import path from "node:path";
import { committedJson, describeRef } from "./lib/committed.mjs";
import { createFetcher } from "./lib/http.mjs";
import { compareText, stableStringify } from "./lib/json.mjs";
import { SPELL_TEXT_TABLES, createSpellTextContext } from "./lib/spell-text.mjs";
import {
  CLASS_NAME,
  SPELLBOOK_TABLES,
  createBookContext,
  idSlug,
  learnableBy,
  NO_CLIENT_DATA,
  norm,
  pairRows,
  rankDifferences,
  rankFields,
  rankNumber,
  readBook,
} from "./lib/spellbook.mjs";
import { CLASSIC_TREE_TABLES, FOREVER_TREE_TABLES, createTooltipContext, isPassive, readClassicTrees, readForeverTree } from "./lib/talent-tree.mjs";
import { buildDate, createClientSource, latestBuild, wowDbDefsCommit } from "./lib/wago.mjs";

const CLASSES = ["warrior", "druid", "paladin", "shaman", "rogue", "mage", "warlock", "priest", "hunter"];
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "client");
const SCRAPER = "scripts/scrape/spells-client.mjs";
const OUT_DIR = "src/data/spells";
const PRODUCT = "wow_classic_beta";
const BASELINE_PRODUCT = "wow_classic_era";
const DEFAULT_BASELINE = "1.15.9.69722";
const RACE_TABLES = ["ChrRaces", "CharBaseInfo"];
/**
 * Player stats for tooltips that scale with them (Victory Rush: "${1+$AP*$m3/100} damage"; Forever's
 * Life Tap: "${($m1+$SPI*1)*…} mana"): a reader with no attack power, no Spirit and no bonus healing
 * ($bh), so the text depends on the client files alone.
 * docs/data/spells.md#caveats.
 */
const TOOLTIP_STATS = { AP: 0, RAP: 0, SPI: 0, BH: 0 };
/**
 * Classic Era rows that pass every rule but that no trainer teaches: cut content left in the
 * client's skill lines. Classic Era 22570 "Mangle" is a Feral finishing move (level 6, icon
 * "ability_druid_mangle.tga") that never shipped; the Forever client dropped its row.
 */
const CLASSIC_CUT_CONTENT = new Map([[22570, "cut content: no trainer teaches it"]]);
/**
 * Why a Forever tooltip token the client files can't resolve doesn't fail the run: `$z` is the
 * player's home location (Astral Recall), which only the game knows, and a token that reads a spell
 * the build doesn't have can't be read from the files at all (Windfury Totem's "within $10611a1
 * yards" reads the radius of the Classic enchant spell 10611, which Forever removed:
 * docs/mechanics/buffs-debuffs-consumables.md#windfury-totem). Such tokens are listed in the book's
 * `meta.unresolvedTokens` (docs/data/spells.md); any other unrendered Forever token fails the run.
 * `$z` reads HOME in the text; a token that reads a missing spell renders as nothing.
 */
const HOME = "your home location";
function unresolvable(token) {
  if (token === "$z") return `the player's home location, which only the game knows: the text reads "${HOME}"`;
  const ref = /^\$(\d+)[a-zA-Z]\d*$/.exec(token);
  if (ref && !forever.tables.SpellName.byId.has(Number(ref[1]))) return `reads spell ${ref[1]}, which the build doesn't have`;
  return null;
}

const opts = { diff: false, refresh: false, version: null, baseline: DEFAULT_BASELINE, dbdefs: null, against: "HEAD" };
for (const arg of process.argv.slice(2)) {
  const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
  if (!m) usage(`Unknown argument: ${arg}`);
  const [, key, value] = m;
  if (["diff", "refresh"].includes(key) && value === undefined) opts[key] = true;
  else if (["version", "baseline", "dbdefs", "against"].includes(key) && value) opts[key] = value;
  else usage(`Unknown argument: ${arg}`);
}
function usage(msg) {
  console.error(`${msg}\nUsage: node ${SCRAPER} [--diff] [--against=<git ref>] [--refresh] [--version=<build>] [--baseline=<build>] [--dbdefs=<sha>]`);
  process.exit(2);
}

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const fetcher = createFetcher({ cacheDir: CACHE_DIR, refresh: opts.refresh });
const latest = await latestBuild(fetcher, PRODUCT);
const version = opts.version ?? latest.version;
/** The build's creation date on wago.tools, from its build list (lib/wago.mjs buildRecord). */
const foreverBuildDate = await buildDate(fetcher, PRODUCT, version);
const dbdefsSha = await wowDbDefsCommit(fetcher, opts.dbdefs);

async function load(build, names) {
  const source = createClientSource({ fetcher, cacheDir: CACHE_DIR, version: build, dbdefsSha });
  const tables = {};
  const used = new Map(); // table → FileDataID
  for (const name of [...new Set(names)]) {
    const t = await source.table(name);
    if (!t.present) throw new Error(`${name}: not in build ${build}`);
    if (t.warnings?.length) throw new Error(`${name} (${build}): ${t.warnings.join("; ")}`);
    tables[name] = t;
    used.set(name, t.fdid);
  }
  return { build, source, tables, used, text: createSpellTextContext(tables, { stats: TOOLTIP_STATS }) };
}

const forever = await load(version, [...SPELLBOOK_TABLES, ...FOREVER_TREE_TABLES, ...SPELL_TEXT_TABLES, ...RACE_TABLES]);
const classic = await load(opts.baseline, [...SPELLBOOK_TABLES, ...CLASSIC_TREE_TABLES, ...SPELL_TEXT_TABLES]);

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

let classicFiles = null;
async function createIconNamer() {
  const files = await forever.source.files();
  const unresolved = [];
  const name = (fdid) => {
    let n = files[String(fdid)];
    if (!n && classicFiles) n = classicFiles[String(fdid)];
    const m = n && /^interface\/icons\/(.+)\.blp$/i.exec(n);
    // Icon CDNs (Wowhead's, decision D14) spell a space in a file name as "-".
    return m ? m[1].toLowerCase().replaceAll(" ", "-") : null;
  };
  return {
    iconName: (fdid, what) => {
      const n = fdid ? name(fdid) : null;
      if (!n) unresolved.push({ what, fdid });
      return n;
    },
    unresolved,
  };
}

// ---------------------------------------------------------------------------
// Build a class
// ---------------------------------------------------------------------------

/** Status vocabulary (docs/data/spells.md#status). */
function statusOf(f, c, pairs) {
  if (f.isTalent) return "talent";
  if (!c) return "new";
  if (c.isTalent || c.passiveTalent) return "baseline";
  const first = (rows) => Math.min(...rows.map((x) => x.level ?? Infinity));
  if (first(f.rows) < first(c.rows)) return "earlier";
  if (pairs.some((p) => !p.forever || !p.classic || p.differences.length)) return "changed";
  return "same";
}

function buildClass(cls, iconName) {
  const report = { unrendered: [], excluded: { forever: [], classic: [] } };
  const fctx = createBookContext(forever.tables, { text: forever.text, iconName });
  const cctx = createBookContext(classic.tables, { text: classic.text, iconName });

  // Forever: the Trait tree's talents (active ones are spellbook spells).
  const tree = readForeverTree(forever.tables, cls);
  const ftc = createTooltipContext(forever.tables);
  const foreverTalents = tree.talents.map((t) => ({ name: t.name, tabName: tree.tabs[t.tab].name, spellIds: [t.spellId], active: !isPassive(ftc, t.spellId) }));
  const bookF = readBook(fctx, cls, { talents: foreverTalents, talentTabs: tree.tabs });

  // Classic Era: the legacy Talent table.
  const classicTrees = readClassicTrees(classic.tables, cls);
  const ctc = createTooltipContext(classic.tables);
  const classicTalents = classicTrees.map((c) => ({ name: c.name, tabName: c.tabName, spellIds: c.spellIds, active: !isPassive(ctc, c.spellIds[0]) }));
  const classicTabs = [...new Map(classicTrees.map((c) => [c.tab, { name: c.tabName, order: c.tabOrder, iconFileDataId: classic.tables.TalentTab.byId.get(c.tab).SpellIconID }])).values()].sort((a, b) => a.order - b.order);
  const bookC = readBook(cctx, cls, { talents: classicTalents, talentTabs: classicTabs, classic: true, skip: CLASSIC_CUT_CONTENT });
  report.excluded.forever = bookF.excluded;
  // Trainer rows whose spell the Forever client has no data for (possibly hotfix-only; docs/data/spells.md).
  const classicTalentRanks = new Set(classicTrees.flatMap((c) => c.spellIds));
  const encrypted = forever.tables.SpellName.encryptedIds ?? new Set();
  report.noClientData = bookF.excluded
    .filter((x) => x.why === NO_CLIENT_DATA)
    .map((x) => ({
      spellId: x.id,
      skillLine: x.line,
      acquireMethod: x.acquireMethod,
      supersedes: x.supersedes,
      encrypted: encrypted.has(x.id),
      classic: cctx.name(x.id) ? { name: cctx.name(x.id), rank: rankNumber(cctx.subtext(x.id)), talentRank: classicTalentRanks.has(x.id) } : null,
    }))
    .sort((a, b) => a.spellId - b.spellId);
  report.excluded.classic = bookC.excluded;

  // Races that can be the class in Forever (CharBaseInfo), for per-race spells.
  const classId = forever.tables.ChrClasses.rows.find((c) => c.Name_lang === CLASS_NAME[cls]).ID;
  const races = forever.tables.CharBaseInfo.rows
    .filter((r) => r.ClassID === classId)
    .map((r) => forever.tables.ChrRaces.byId.get(r.RaceID))
    .map((r) => ({ bit: r.PlayableRaceBit, name: r.Name_lang }));

  // A Classic passive talent that Forever trains (Tactical Mastery) is its Classic counterpart.
  const classicOf = (key) => {
    const c = bookC.spells.get(key);
    if (c) return c;
    const tal = bookC.passiveTalents.get(key);
    if (!tal) return null;
    // The talent at its top rank (Tactical Mastery 5/5, 12679) is what Forever's trained spell replaces.
    const top = tal.spellIds.at(-1);
    const rows = [{ spellId: top, rank: tal.spellIds.length > 1 ? tal.spellIds.length : null, level: null, raceMasks: [[0, 0]], fromTalent: true }];
    return { name: tal.name, tab: tal.tabName, isTalent: true, passiveTalent: true, grantedByTalent: true, rows };
  };

  const rank = (ctx, row, side, spell) => {
    const r = rankFields(ctx, row.spellId, { level: row.level });
    for (const u of r.unrendered) report.unrendered.push({ side, spell, spellId: row.spellId, token: u });
    // `$z`, the home location only the game knows, reads HOME (unresolvable above).
    if (r.rank.text && r.unrendered.includes("$z")) r.rank.text = r.rank.text.replaceAll("$z", HOME);
    return r.rank;
  };

  const tabOrder = new Map(bookF.tabs.map((t, i) => [t.name, i]));
  const spells = [];
  for (const [key, f] of bookF.spells) {
    const c = classicOf(key);
    const pairs = pairRows(f.rows, c?.rows ?? []).map((p) => {
      const fr = p.forever ? rank(fctx, p.forever, "Forever", f.name) : null;
      const cr = p.classic ? rank(cctx, p.classic, "Classic", f.name) : null;
      return { rank: p.rank, forever: fr, classic: cr, differences: fr && cr ? rankDifferences(fr, cr) : [] };
    });
    const numbered = f.rows.filter((x) => x.rank !== null).map((x) => x.rank);
    const levels = f.rows.map((x) => x.level).filter((x) => x !== null);
    const firstForever = pairs.find((p) => p.forever)?.forever;
    spells.push({
      id: `${cls}-${idSlug(f.name)}`,
      name: f.name,
      tab: f.tab,
      icon: firstForever?.icon ?? null,
      level: levels.length ? Math.min(...levels) : null,
      status: statusOf(f, c, pairs),
      races: learnableBy(f.rows, races),
      maxRank: numbered.length ? Math.max(...numbered) : null,
      isTalent: f.isTalent,
      grantedByTalent: f.grantedByTalent,
      classic: c ? { tab: c.tab, wasTalent: !!c.isTalent } : null,
      ranks: pairs,
    });
  }
  spells.sort((a, b) => tabOrder.get(a.tab) - tabOrder.get(b.tab) || (a.level ?? Infinity) - (b.level ?? Infinity) || compareText(a.name, b.name));

  const missing = [];
  for (const [key, c] of bookC.spells) {
    if (bookF.spells.has(key)) continue;
    const top = c.rows.reduce((a, b) => ((b.rank ?? 0) >= (a.rank ?? 0) ? b : a));
    const levels = c.rows.map((x) => x.level).filter((x) => x !== null);
    const numbered = c.rows.filter((x) => x.rank !== null).map((x) => x.rank);
    const cr = rank(cctx, top, "Classic", c.name);
    missing.push({
      name: c.name,
      tab: c.tab,
      icon: cr.icon,
      level: levels.length ? Math.min(...levels) : null,
      rank: numbered.length ? Math.max(...numbered) : null,
      wasTalent: c.isTalent,
      classic: { ...cr, name: c.name },
    });
  }
  missing.sort((a, b) => compareText(a.tab, b.tab) || (a.level ?? Infinity) - (b.level ?? Infinity) || compareText(a.name, b.name));

  const tabs = bookF.tabs.map((t) => ({
    name: t.name,
    slug: idSlug(t.name),
    icon: iconName(t.iconFileDataId, `${cls} ${t.name} tab`),
    spellCount: spells.filter((s) => s.tab === t.name).length,
  }));
  const by = (st) => spells.filter((s) => s.status === st).length;
  const changed = spells.filter((s) => !["same", "new", "talent"].includes(s.status)).length;
  const counts = { total: spells.length, new: by("new"), changed, notInForever: missing.length, differentFromClassic: by("new") + changed };

  // Checks.
  if (new Set(spells.map((s) => s.id)).size !== spells.length) fail(`${cls}: duplicate spell ids`);
  for (const t of foreverTalents.filter((x) => x.active)) if (!bookF.spells.has(norm(t.name))) fail(`${cls}: active talent ${t.name} is not in the book`);
  for (const s of spells) {
    if (!s.ranks.some((p) => p.forever)) fail(`${cls} ${s.name}: no Forever rank`);
    for (const p of s.ranks) if (p.forever && !p.forever.text) fail(`${cls} ${s.name} ${p.forever.spellId}: no Forever tooltip`);
  }
  report.unresolvedTokens = [];
  for (const u of report.unrendered.filter((x) => x.side === "Forever")) {
    const why = unresolvable(u.token);
    if (why) report.unresolvedTokens.push({ spellId: u.spellId, token: u.token, why });
    else fail(`${cls} ${u.spell} ${u.spellId}: ${u.token} not rendered`);
  }
  report.unresolvedTokens.sort((a, b) => a.spellId - b.spellId || compareText(a.token, b.token));
  if (tabs.reduce((n, t) => n + t.spellCount, 0) !== spells.length) fail(`${cls}: a spell sits outside the tabs`);

  return { data: { meta: null, class: cls, counts, tabs, spells, missing }, report };
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
  const { iconName, unresolved } = await createIconNamer();
  let built = CLASSES.map((cls) => buildClass(cls, iconName));
  if (unresolved.length) {
    // Rare: an icon only the Classic Era file list names. Read it and build again.
    classicFiles = await classic.source.files();
    unresolved.length = 0;
    errors.length = 0;
    built = CLASSES.map((cls) => buildClass(cls, iconName));
    for (const u of unresolved) fail(`${u.what}: no icon name for FileDataID ${u.fdid}`);
  }
  const tableMeta = (b) => Object.fromEntries([...b.used.entries()].sort(([a], [c]) => compareText(a, c)));
  const at = scrapedAt([forever, classic]);
  for (const b of built) {
    b.data.meta = {
      source: "https://wago.tools/api/casc",
      scraper: SCRAPER,
      scrapedAt: at,
      product: PRODUCT,
      foreverBuild: version,
      foreverBuildDate,
      classicProduct: BASELINE_PRODUCT,
      classicBuild: opts.baseline,
      tables: { forever: tableMeta(forever), classic: tableMeta(classic) },
      wowDbDefs: { repository: "https://github.com/wowdev/WoWDBDefs", commit: dbdefsSha },
      noClientData: b.report.noClientData,
      unresolvedTokens: b.report.unresolvedTokens,
    };
  }
  printSummary(built);
  // Every SkillLineAbility row left out, with the rule that left it out (for docs/data/spells.md).
  const leftOut = Object.fromEntries(built.map((b) => [b.data.class, b.report.excluded]));
  fs.mkdirSync(path.join(CACHE_DIR, version), { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, version, "spells-left-out.json"), `${JSON.stringify(leftOut, null, 1)}\n`);
  if (errors.length) {
    for (const e of errors) console.error(`ERROR: ${e}`);
    console.error(`\nNot writing ${OUT_DIR}: ${errors.length} check(s) failed.`);
    process.exitCode = 1;
    return;
  }
  for (const b of built) {
    const file = path.join(REPO_ROOT, OUT_DIR, `${b.data.class}.json`);
    const text = stableStringify(b.data);
    fs.writeFileSync(file, text);
    console.log(`Wrote ${path.relative(REPO_ROOT, file)} (${(text.length / 1024).toFixed(0)} KB)`);
  }
}

function printSummary(built) {
  for (const { data, report } of built) {
    const kinds = {};
    for (const s of data.spells) kinds[s.status] = (kinds[s.status] ?? 0) + 1;
    console.log(`\n${data.class}: ${data.tabs.map((t) => `${t.name} ${t.spellCount}`).join(", ")} = ${data.spells.length} spells; ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    console.log(`  not in Forever: ${data.missing.map((m) => `${m.name} (${m.tab}${m.wasTalent ? ", a Classic talent" : ""})`).join(", ") || "none"}`);
    const classicUnrendered = report.unrendered.filter((u) => u.side === "Classic");
    if (classicUnrendered.length) console.log(`  Classic tokens not rendered: ${classicUnrendered.map((u) => `${u.spell} ${u.spellId} ${u.token}`).join("; ")}`);
    const why = (list) => Object.entries(list.reduce((m, x) => ((m[x.why] = (m[x.why] ?? 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`  left out (Forever): ${why(report.excluded.forever)}`);
    console.log(`  left out (Classic Era): ${why(report.excluded.classic)}`);
    const trainer = report.noClientData.filter((x) => !x.classic?.talentRank);
    console.log(`  trainer rows with no Forever client data: ${trainer.map((x) => `${x.spellId}${x.classic ? ` ${x.classic.name}${x.classic.rank ? ` ${x.classic.rank}` : ""}` : ""}`).join(", ") || "none"} (+ ${report.noClientData.length - trainer.length} Classic Era talent ranks)`);
  }
  for (const w of warnings) console.warn(`WARNING: ${w}`);
  console.log(`\nnetwork requests this run: ${fetcher.stats().requests}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

await write();
if (opts.diff && !errors.length) {
  const against = describeRef(REPO_ROOT, opts.against);
  const old = Object.fromEntries(CLASSES.map((cls) => [cls, committedJson(REPO_ROOT, `${OUT_DIR}/${cls}.json`, opts.against)]));
  const missing = CLASSES.filter((cls) => !old[cls]);
  if (missing.length) {
    console.error(`No committed dataset at ${against} for ${missing.join(", ")}: nothing to diff against.`);
    process.exit(1);
  }
  const { diffSpells } = await import("./lib/spells-diff.mjs");
  const pairs = CLASSES.map((cls) => ({ cls, old: old[cls], next: JSON.parse(fs.readFileSync(path.join(REPO_ROOT, OUT_DIR, `${cls}.json`), "utf8")) }));
  diffSpells({ pairs, against, outDir: path.join(CACHE_DIR, version), repoRoot: REPO_ROOT });
}
