#!/usr/bin/env node
// The talent trees, src/data/talents/{warrior,druid,paladin}.json, from the client files
// (milestone M1.5d, decision D17): the Forever tree from the Trait tables of the Forever beta
// client (wow_classic_beta), compared talent by talent with the Classic Era client's legacy
// Talent/TalentTab trees (wow_classic_era).
//
//   node scripts/scrape/talents-client.mjs [--diff] [--against=<git ref>] [--accept-code-changes]
//        [--skip-committed-check] [--refresh] [--version=<Forever build>] [--baseline=<Classic Era build>]
//        [--dbdefs=<sha>]
//
//   (default)  derive the three trees and write src/data/talents/<class>.json
//   --diff     then diff the written trees against the committed ones, talent by talent; report
//              in .cache/client/<build>/talents-diff.md (+ .json) and talents-changes.md
//   --against  the git ref whose dataset is "committed" (default HEAD)
//   --check    from the cache alone, compare the trees with the files in src/data, writing nothing
//              to src/data or the cache; exits non-zero if one differs. It regenerates the build
//              and WoWDBDefs commit the committed data records unless --version/--dbdefs
//              say otherwise; --fresh=<dir> also keeps the fresh generation under <dir>
//              (all.mjs --check; lib/output.mjs)
//
// Every run also checks build-code compatibility. Share links and saved setups store build
// codes, so every position of the code (tree, then talent in tier/column order) must hold the
// same talent with the same max rank as in the committed dataset; a talent may only be appended
// at the end of a tree. Each code the repo stores (STORED_BUILDS_FILE) must decode to the ranks
// it lists, and be legal. The run exits non-zero and writes nothing if that or any other check
// fails. A build that really moves talents needs --accept-code-changes, after the app and the
// stored codes handle the change. Without a committed dataset to compare with (git missing, or
// no such file at --against) the run refuses to write unless --skip-committed-check says so.
//
// Downloads go through lib/wago.mjs (documented wago.tools API only, one request at a time,
// cached under .cache/client/, once per build). Zero dependencies (Node >= 22). The tree
// derivation is lib/talent-tree.mjs and the text renderer lib/spell-text.mjs; see
// docs/data/talents.md.

import fs from "node:fs";
import path from "node:path";
import { describeRef, readCommitted } from "./lib/committed.mjs";
import { createFetcher } from "./lib/http.mjs";
import { compareText, stableStringify } from "./lib/json.mjs";
import { checkConflicts, createOutput, recordedSource } from "./lib/output.mjs";
import { SPELL_TEXT_TABLES, createSpellTextContext } from "./lib/spell-text.mjs";
import {
  CLASSIC_TREE_TABLES,
  FOREVER_TREE_TABLES,
  createTooltipContext,
  isPassive,
  matchClassic,
  readClassicTrees,
  readForeverTree,
  renderClassicRanks,
  renderForeverRanks,
  slug,
  tooltipHeader,
} from "./lib/talent-tree.mjs";
import { buildDate, createClientSource, latestBuild, wowDbDefsCommit } from "./lib/wago.mjs";
import { codeOrder, codePositionChanges, decodeByName, describeRanks, validate } from "./lib/build-codes.mjs";

const CLASSES = ["warrior", "druid", "paladin", "shaman", "rogue", "mage", "warlock", "priest", "hunter"];
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "client");
const SCRAPER = "scripts/scrape/talents-client.mjs";
const OUT_DIR = "src/data/talents";
const PRODUCT = "wow_classic_beta";
const BASELINE_PRODUCT = "wow_classic_era";
const DEFAULT_BASELINE = "1.15.9.69722";

/**
 * Every build code the repo stores (defaults, presets, the class docs' builds, tests), by class,
 * with the ranks by talent name each decoded to when it was written: the one list, which
 * src/data/data.test.ts reads too.
 */
/**
 * Player stats for talent tooltips that scale with them: a reader with no spell power and no bonus
 * healing, so the text depends on the client files alone (the warlock's Demonic Brand, "$<minDam> to
 * $<maxDam>", reads the higher of Shadow and Fire spell power; the priest's Prayer of Mending,
 * "${($m1+($bh*$bc))*$<mult>}", reads bonus healing), as the spellbook's Victory Rush does with no
 * attack power (spells-client.mjs).
 */
const TOOLTIP_STATS = { SPS: 0, SPFI: 0, BH: 0, RAP: 0 };

const STORED_BUILDS_FILE = "scripts/scrape/stored-builds.json";
const STORED_BUILDS = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, STORED_BUILDS_FILE), "utf8"));
const storedCodes = (cls) => Object.keys(STORED_BUILDS[cls] ?? {});

const CODE_FORMAT =
  'Wowhead-style string of three "-"-separated segments, one per tree in `trees` order. Each segment has one decimal digit per talent (its rank, 0..maxRank), in `order` = sorted by tier, then col (both 0-based). Trailing zeros in a segment are trimmed; empty segments are kept, so a full code always has two "-" (e.g. "30305213132515201-05050103-"). Every position keeps its talent and max rank from build to build (new talents only at the end of a tree), so every code keeps its meaning.';

const opts = { diff: false, "accept-code-changes": false, "skip-committed-check": false, refresh: false, check: false, version: null, baseline: DEFAULT_BASELINE, dbdefs: null, against: "HEAD" };
for (const arg of process.argv.slice(2)) {
  const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
  if (!m) usage(`Unknown argument: ${arg}`);
  const [, key, value] = m;
  if (["diff", "accept-code-changes", "skip-committed-check", "refresh", "check"].includes(key) && value === undefined) opts[key] = true;
  else if (["version", "baseline", "dbdefs", "against", "fresh"].includes(key) && value) opts[key] = value;
  else usage(`Unknown argument: ${arg}`);
}
for (const conflict of checkConflicts(opts)) usage(conflict);
function usage(msg) {
  console.error(`${msg}\nUsage: node ${SCRAPER} [--diff] [--against=<git ref>] [--accept-code-changes] [--skip-committed-check] [--refresh] [--check [--fresh=<dir>]] [--version=<build>] [--baseline=<build>] [--dbdefs=<sha>]`);
  process.exit(2);
}
const output = createOutput({ repoRoot: REPO_ROOT, check: opts.check, fresh: opts.fresh });

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const fetcher = createFetcher({ cacheDir: CACHE_DIR, refresh: opts.refresh, offline: opts.check });
// --check regenerates the build the committed data records, not the cache's latest (lib/output.mjs).
const recorded = opts.check ? recordedSource(path.join(REPO_ROOT, OUT_DIR, "warrior.json")) : {};
const version = opts.version ?? recorded.version ?? (await latestBuild(fetcher, PRODUCT)).version;
/** The build's creation date on wago.tools, from its build list (lib/wago.mjs buildRecord). */
const foreverBuildDate = await buildDate(fetcher, PRODUCT, version);
const dbdefsSha = await wowDbDefsCommit(fetcher, opts.dbdefs ?? recorded.dbdefs);

async function load(build, names) {
  const source = createClientSource({ fetcher, cacheDir: CACHE_DIR, version: build, dbdefsSha, readOnly: opts.check });
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

const forever = await load(version, [...FOREVER_TREE_TABLES, ...SPELL_TEXT_TABLES]);
const classic = await load(opts.baseline, [...CLASSIC_TREE_TABLES, ...SPELL_TEXT_TABLES]);

/** The committed dataset of each class (git show <against>:src/data/talents/<class>.json): { data, error }. */
const committedReads = Object.fromEntries(CLASSES.map((cls) => [cls, readCommitted(REPO_ROOT, `${OUT_DIR}/${cls}.json`, opts.against)]));
const committed = Object.fromEntries(CLASSES.map((cls) => [cls, committedReads[cls].data]));
const againstLabel = describeRef(REPO_ROOT, opts.against);

// ---------------------------------------------------------------------------
// Build codes (the same algorithm as src/data/talents/types.ts)
// ---------------------------------------------------------------------------

/**
 * The build-code contract of a class: every position holds the committed dataset's talent and max
 * rank (`old`; null when it can't be read), and each stored code decodes to the ranks
 * STORED_BUILDS_FILE lists, under the committed and the new dataset. A change fails the run unless
 * --accept-code-changes; a code illegal under the new dataset always fails.
 */
function checkCodes(cls, old, next) {
  const changed = opts["accept-code-changes"] ? warn : fail;
  if (!old) {
    const why = `${cls}: can't read the committed dataset at ${againstLabel} (${committedReads[cls].error}), so build-code positions can't be checked`;
    if (opts["skip-committed-check"]) warn(`${why}; writing anyway (--skip-committed-check)`);
    else fail(`${why}. Not writing: pass --skip-committed-check to write without the check`);
  } else {
    const positions = codePositionChanges(old, next);
    for (const p of positions.changed) changed(`${cls} build-code position changed: ${p}`);
    for (const p of positions.appended) warn(`${cls} build-code position appended: ${p} (stored codes still decode the same)`);
  }
  const results = [];
  for (const code of storedCodes(cls)) {
    try {
      const got = describeRanks(next, code);
      const want = STORED_BUILDS[cls][code].ranks;
      if (JSON.stringify(got) !== JSON.stringify(want)) changed(`${cls} ${code} (${STORED_BUILDS[cls][code].note}): decodes to ${JSON.stringify(got)}, not the ${JSON.stringify(want)} of ${STORED_BUILDS_FILE}`);
    } catch (e) {
      fail(`${cls} ${code}: ${e.message}`);
    }
    let a = null;
    let b;
    if (old) {
      try {
        a = decodeByName(old, code);
      } catch (e) {
        changed(`${cls} ${code}: doesn't decode under the committed data (${e.message})`);
      }
    }
    try {
      b = decodeByName(next, code);
    } catch (e) {
      fail(`${cls} ${code}: doesn't decode under the new data (${e.message})`);
      continue;
    }
    const same = a !== null && JSON.stringify(a) === JSON.stringify(b);
    if (a !== null && !same) changed(`${cls} ${code}: decodes differently: committed ${JSON.stringify(a)}, new ${JSON.stringify(b)}`);
    const problems = validate(next, code);
    for (const p of problems) fail(`${cls} ${code}: illegal under the new data: ${p}`);
    results.push({ code, talents: Object.keys(b).length, points: Object.values(b).reduce((x, y) => x + y, 0), sameRanks: same, legal: problems.length === 0 });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Build a class
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

/** Text as compared for the change kind: case and whitespace don't count ("Armor" = "armor"). */
const normText = (s) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

function buildClass(cls, iconName) {
  const tree = readForeverTree(forever.tables, cls);
  for (const p of tree.problems) fail(p);
  const classicTalents = readClassicTrees(classic.tables, cls);
  const { matches, twice } = matchClassic(tree.talents, classicTalents);
  for (const x of twice) fail(`${cls}: Classic talent ${x.classicId} matches ${x.forever.join(" and ")}`);
  const tooltip = createTooltipContext(forever.tables);
  const report = { unrendered: [], assumed: [], notes: tree.notes };

  // Gates: every gate asks for pointsPerTier × tier points.
  const perTier = new Set(tree.talents.flatMap((t) => t.gates.map((g) => g.spent / t.tier)));
  if (perTier.size !== 1) fail(`${cls}: tier gates don't share one points-per-tier value: ${[...perTier].join(", ")}`);
  const pointsPerTier = [...perTier][0];

  const idOf = new Map(tree.talents.map((t) => [t.nodeId, `${cls}-${slug(tree.tabs[t.tab].name)}-${slug(t.name)}`]));
  const byNode = new Map(tree.talents.map((t) => [t.nodeId, t]));
  const trees = tree.tabs.map((tab, index) => {
    const talents = tree.talents
      .filter((t) => t.tab === index)
      .sort((a, b) => a.tier - b.tier || a.col - b.col)
      .map((t, order) => {
        const pre = t.prerequisiteNodeIds;
        if (pre.length > 1) fail(`${cls} ${t.name}: ${pre.length} prerequisites`);
        const preTalent = pre.length ? byNode.get(pre[0].nodeId) : null;
        if (pre.length && (!preTalent || preTalent.tab !== t.tab)) fail(`${cls} ${t.name}: prerequisite node ${pre[0].nodeId} is not in its tree`);
        if (preTalent && preTalent.tier > t.tier) fail(`${cls} ${t.name}: prerequisite ${preTalent.name} sits below it`);
        const rendered = renderForeverRanks(forever.text, t);
        for (const u of rendered.unrendered) report.unrendered.push(`${t.name} (Forever): ${u}`);
        for (const a of rendered.assumed) report.assumed.push(`${t.name} (Forever): ${a} taken as unmet`);
        const m = matches.get(t.nodeId);
        const c = m?.classic ?? null;
        let classicTexts = null;
        if (c) {
          const r = renderClassicRanks(classic.text, c);
          classicTexts = r.texts;
          for (const u of r.unrendered) report.unrendered.push(`${t.name} (Classic ${c.name}): ${u}`);
        }
        const preClassic = preTalent ? (matches.get(preTalent.nodeId)?.classic ?? null) : null;
        const icon = iconName(t.iconFileDataId ?? tooltip.misc.get(t.spellId)?.SpellIconFileDataID, `${cls} ${t.name}`);
        return {
          id: idOf.get(t.nodeId),
          name: t.name,
          icon,
          tree: tab.name,
          tier: t.tier,
          col: t.col,
          order,
          maxRank: t.maxRank,
          prerequisite: preTalent ? { talentId: idOf.get(preTalent.nodeId), rank: preTalent.maxRank } : null,
          inForeverTree: true,
          changeKind: changeKind({ t, tabName: tab.name, foreverTexts: rendered.texts, c, classicTexts, preClassic }),
          passive: isPassive(tooltip, t.spellId),
          tooltip: tooltipHeader(tooltip, t.spellId),
          previousName: c && c.name !== t.name ? c.name : null,
          spellId: t.spellId,
          classicSpellId: c?.spellIds[0] ?? null,
          ranks: { forever: rendered.texts, classic: classicTexts },
          classic: c
            ? {
                name: c.name,
                tree: c.tabName,
                tier: c.tier,
                col: c.col,
                maxRank: c.maxRank,
                matchStatus: c.name === t.name ? "same_name" : "same_spell",
                prerequisite: c.prerequisite?.name ?? null,
              }
            : null,
        };
      });
    return { id: tab.name, name: tab.name, icon: iconName(tab.iconFileDataId, `${cls} ${tab.name} tree`), index, clientTreeId: String(tab.id), talents };
  });

  // Structural checks.
  const all = trees.flatMap((tr) => tr.talents);
  if (new Set(all.map((t) => t.id)).size !== all.length) fail(`${cls}: duplicate talent ids`);
  for (const tr of trees) {
    const cells = tr.talents.map((t) => `${t.tier},${t.col}`);
    if (new Set(cells).size !== cells.length) fail(`${cls} ${tr.name}: two talents in one cell`);
    if (tr.talents.some((t) => t.col < 0 || t.col > 3 || t.tier < 0)) fail(`${cls} ${tr.name}: a talent off the 4-column grid`);
  }
  for (const t of all) {
    if (t.ranks.forever.length !== t.maxRank || t.ranks.forever.some((x) => !x)) fail(`${cls} ${t.name}: missing Forever rank text`);
    if (t.ranks.classic?.some((x) => !x)) fail(`${cls} ${t.name}: missing Classic rank text`);
  }
  for (const u of report.unrendered) fail(`${cls} ${u} not rendered`);
  const maxTier = Math.max(...all.map((t) => t.tier));
  return {
    data: {
      meta: null, // filled in by write()
      class: cls,
      rules: { maxPoints: tree.currency.max, pointsPerTier, maxTier, maxCol: 3 },
      codeFormat: CODE_FORMAT,
      trees,
    },
    tree,
    report,
    classicUnmatched: classicTalents.filter((c) => ![...matches.values()].some((m) => m.classic.id === c.id)),
  };
}

/**
 * How a talent differs from its Classic Era counterpart: "added" with no Classic talent, "unchanged" when name, ranks, texts (ignoring case and whitespace) and prerequisite
 * are the Classic ones in the same cell, "moved" when only the tree or cell differs, and
 * "modified" otherwise.
 */
function changeKind({ t, tabName, foreverTexts, c, classicTexts, preClassic }) {
  if (!c) return "added";
  const samePlace = c.tabName === tabName && c.tier === t.tier && c.col === t.col;
  const sameTexts = c.maxRank === t.maxRank && foreverTexts.every((x, i) => normText(x) === normText(classicTexts[i]));
  const samePrerequisite = (preClassic?.id ?? null) === (c.prerequisite?.talentId ?? null);
  if (c.name !== t.name || !sameTexts || !samePrerequisite) return "modified";
  return samePlace ? "unchanged" : "moved";
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
    built = CLASSES.map((cls) => buildClass(cls, iconName));
    for (const u of unresolved) fail(`${u.what}: no icon name for FileDataID ${u.fdid}`);
  }
  const tableMeta = (b) => Object.fromEntries([...b.used.entries()].sort(([a], [c]) => compareText(a, c)));
  const at = scrapedAt([forever, classic]);
  const codeResults = {};
  for (const b of built) {
    const cls = b.data.class;
    b.data.meta = {
      source: "https://wago.tools/api/casc",
      scraper: SCRAPER,
      scrapedAt: at,
      product: PRODUCT,
      foreverBuild: version,
      foreverBuildDate,
      classicProduct: BASELINE_PRODUCT,
      classicBuild: opts.baseline,
      traitTreeId: b.tree.traitTreeId,
      traitCurrencyId: b.tree.currency.id,
      tables: { forever: tableMeta(forever), classic: tableMeta(classic) },
      wowDbDefs: { repository: "https://github.com/wowdev/WoWDBDefs", commit: dbdefsSha },
    };
    codeResults[cls] = checkCodes(cls, committed[cls], b.data);
  }
  printSummary(built, codeResults);
  if (errors.length) {
    for (const e of errors) console.error(`ERROR: ${e}`);
    console.error(`\nNot writing ${OUT_DIR}: ${errors.length} check(s) failed.`);
    process.exitCode = 1;
    return;
  }
  for (const b of built) {
    const file = path.join(REPO_ROOT, OUT_DIR, `${b.data.class}.json`);
    const text = stableStringify(b.data);
    output.write(file, text);
    if (!opts.check) console.log(`Wrote ${path.relative(REPO_ROOT, file)} (${(text.length / 1024).toFixed(0)} KB)`);
  }
  output.finish();
}

function printSummary(built, codeResults) {
  for (const b of built) {
    const { data, tree, report, classicUnmatched } = b;
    const all = data.trees.flatMap((t) => t.talents);
    const kinds = {};
    for (const t of all) kinds[t.changeKind] = (kinds[t.changeKind] ?? 0) + 1;
    console.log(`\n${data.class}: Trait tree ${tree.traitTreeId}, ${data.rules.maxPoints} points (TraitCurrency ${tree.currency.id}), ${data.rules.pointsPerTier} per tier`);
    console.log(`  ${data.trees.map((t) => `${t.name} ${t.talents.length}`).join(", ")} = ${all.length}; ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    console.log(`  arrows: ${all.filter((t) => t.prerequisite).map((t) => `${all.find((x) => x.id === t.prerequisite.talentId).name} → ${t.name}`).join("; ")}`);
    console.log(`  Classic talents not in the Forever tree: ${classicUnmatched.map((c) => `${c.name} (${c.tabName})`).join(", ") || "none"}`);
    for (const n of report.notes) console.log(`  note: ${n}`);
    for (const a of report.assumed) console.log(`  assumed: ${a}`);
    for (const r of codeResults[data.class] ?? []) console.log(`  code ${r.code}: ${r.points} points in ${r.talents} talents, ${r.sameRanks ? `same ranks by name as ${againstLabel}` : "DIFFERENT ranks (or no committed dataset)"}, ${r.legal ? "legal" : "ILLEGAL"}`);
    console.log(`  build-code positions: ${data.trees.map((t, i) => `${t.name} ${codeOrder(data)[i].length}`).join(", ")}`);
  }
  for (const w of warnings) console.warn(`WARNING: ${w}`);
  console.log(`\nnetwork requests this run: ${fetcher.stats().requests}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

await write();
if (opts.diff && !errors.length) {
  const missing = CLASSES.filter((cls) => !committed[cls]);
  if (missing.length) {
    console.error(`No committed dataset at ${againstLabel} for ${missing.join(", ")}: nothing to diff against.`);
    process.exit(1);
  }
  const { diffTalents } = await import("./lib/talents-diff.mjs");
  const pairs = CLASSES.map((cls) => ({ cls, old: committed[cls], next: JSON.parse(fs.readFileSync(path.join(REPO_ROOT, OUT_DIR, `${cls}.json`), "utf8")) }));
  diffTalents({ pairs, against: againstLabel, outDir: path.join(CACHE_DIR, version), repoRoot: REPO_ROOT, decodeByName, repoCodes: Object.fromEntries(CLASSES.map((cls) => [cls, storedCodes(cls)])) });
}
