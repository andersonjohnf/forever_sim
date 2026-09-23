#!/usr/bin/env node
// The talent trees, src/data/talents/{warrior,druid,paladin}.json, from the client files
// (milestone M1.5d, decision D17): the Forever tree from the Trait tables of the Forever beta
// client (wow_classic_beta), compared talent by talent with the Classic Era client's legacy
// Talent/TalentTab trees (wow_classic_era).
//
//   node scripts/scrape/talents-client.mjs [--write] [--diff] [--refresh]
//        [--version=<Forever build>] [--baseline=<Classic Era build>] [--dbdefs=<sha>]
//        [--snapshot=<dir of the old <class>.json files>]
//
//   --write  (default) derive the three trees and write src/data/talents/<class>.json
//   --diff   old dataset (the foreverchanges.pro snapshot) vs the written one, talent by talent;
//            report in .cache/client/<build>/talents-diff.md (+ .json)
//
// Every run also checks build-code compatibility: each build code in the repo (REPO_CODES) and
// each popular build of the snapshot must decode to the same ranks by talent name under the old
// and the new dataset, and be legal under the new one. The run exits non-zero and writes nothing
// if that or any other check fails.
//
// The snapshot is the last foreverchanges.pro dataset (git: SNAPSHOT_COMMIT). --write saves the
// current files there before overwriting them while they're still the foreverchanges ones.
// Default: .cache/client/talents-foreverchanges-snapshot/.
//
// Downloads go through lib/wago.mjs (documented wago.tools API only, one request at a time,
// cached under .cache/client/, once per build). Zero dependencies (Node >= 22). The tree
// derivation is lib/talent-tree.mjs and the text renderer lib/spell-text.mjs; see
// docs/data/talents.md.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createFetcher } from "./lib/http.mjs";
import { stableStringify } from "./lib/json.mjs";
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
import { createClientSource, latestBuild, wowDbDefsCommit } from "./lib/wago.mjs";

const CLASSES = ["warrior", "druid", "paladin"];
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "client");
const SCRAPER = "scripts/scrape/talents-client.mjs";
const OUT_DIR = "src/data/talents";
const PRODUCT = "wow_classic_beta";
const BASELINE_PRODUCT = "wow_classic_era";
const DEFAULT_BASELINE = "1.15.9.69722";
const DEFAULT_SNAPSHOT = ".cache/client/talents-foreverchanges-snapshot";
/** The last commit whose src/data/talents/*.json came from foreverchanges.pro. */
const SNAPSHOT_COMMIT = "403142e";

/**
 * Every build code the repo stores (defaults, presets, the class docs' builds, tests), by class.
 * They must decode to the same ranks by talent name as they did under the foreverchanges data.
 */
const REPO_CODES = {
  warrior: [
    "30305013002-050530035150010051-", // Fury default (warrior.md §6.1)
    "30305013-050520035150310051-", // Fury + Precision (warrior.md §6.1)
    "30305213132515201-05050103-", // Arms (warrior.md §6.1)
    "05-05-552001233201210531", // Protection (warrior.md §6.1)
    "32-05-552001233201210531", // Protection, TPS variant (warrior.md §6.1)
  ],
  druid: [
    "050022-5520002123032213051-05", // Feral cat (druid.md §7.1)
    "050012-5523032120132210551-", // Feral bear (druid.md §7.1)
    "5532220115501351-05-", // Balance (druid.md, Balance notes)
    "05302001-05-5050035103113251", // Restoration (the old site's popular build)
  ],
  paladin: [
    "250003-503-052052310012330321", // Retribution (paladin.md, Retribution defaults)
    "2-4530513321301551-502", // Protection (paladin.md, Protection defaults)
    "005320213225131051-5032-05", // Holy (paladin.md, Sources)
  ],
};

const CODE_FORMAT =
  'Wowhead-style string of three "-"-separated segments, one per tree in `trees` order. Each segment has one decimal digit per talent (its rank, 0..maxRank), in `order` = sorted by tier, then col (both 0-based). Trailing zeros in a segment are trimmed; empty segments are kept, so a full code always has two "-" (e.g. "30305213132515201-05050103-"). The same codes as the foreverchanges.pro calculator\'s ?b=<code>; every code the repo stores decodes to the same ranks by talent name.';

const opts = { write: false, diff: false, refresh: false, version: null, baseline: DEFAULT_BASELINE, dbdefs: null, snapshot: DEFAULT_SNAPSHOT };
for (const arg of process.argv.slice(2)) {
  const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
  if (!m) usage(`Unknown argument: ${arg}`);
  const [, key, value] = m;
  if (["write", "diff", "refresh"].includes(key) && value === undefined) opts[key] = true;
  else if (["version", "baseline", "dbdefs", "snapshot"].includes(key) && value) opts[key] = value;
  else usage(`Unknown argument: ${arg}`);
}
if (!opts.diff) opts.write = true;
function usage(msg) {
  console.error(`${msg}\nUsage: node ${SCRAPER} [--write] [--diff] [--refresh] [--version=<build>] [--baseline=<build>] [--dbdefs=<sha>] [--snapshot=<dir>]`);
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
  return { build, source, tables, used, text: createSpellTextContext(tables) };
}

const forever = await load(version, [...FOREVER_TREE_TABLES, ...SPELL_TEXT_TABLES]);
const classic = await load(opts.baseline, [...CLASSIC_TREE_TABLES, ...SPELL_TEXT_TABLES]);

// ---------------------------------------------------------------------------
// Snapshot (the last foreverchanges dataset)
// ---------------------------------------------------------------------------

const snapshotDir = path.resolve(REPO_ROOT, opts.snapshot);

function saveSnapshotIfForeverchanges() {
  for (const cls of CLASSES) {
    const current = path.join(REPO_ROOT, OUT_DIR, `${cls}.json`);
    const saved = path.join(snapshotDir, `${cls}.json`);
    if (!fs.existsSync(current) || fs.existsSync(saved)) continue;
    const data = JSON.parse(fs.readFileSync(current, "utf8"));
    if (!/foreverchanges\.pro/.test(data.meta?.source ?? "")) continue;
    fs.mkdirSync(snapshotDir, { recursive: true });
    fs.copyFileSync(current, saved);
    console.log(`Saved the foreverchanges snapshot of ${cls} to ${path.relative(REPO_ROOT, saved)}`);
  }
}

function readSnapshot(cls) {
  const file = path.join(snapshotDir, `${cls}.json`);
  if (!fs.existsSync(file)) {
    // Recreate it from git history when the cache was cleared.
    try {
      const body = execFileSync("git", ["show", `${SNAPSHOT_COMMIT}:${OUT_DIR}/${cls}.json`], { cwd: REPO_ROOT, maxBuffer: 1 << 26 });
      fs.mkdirSync(snapshotDir, { recursive: true });
      fs.writeFileSync(file, body);
      console.log(`Restored the foreverchanges snapshot of ${cls} from git (${SNAPSHOT_COMMIT}) to ${path.relative(REPO_ROOT, file)}`);
    } catch {
      console.error(`No snapshot at ${path.relative(REPO_ROOT, file)} and git show ${SNAPSHOT_COMMIT}:${OUT_DIR}/${cls}.json failed.`);
      process.exit(2);
    }
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!/foreverchanges\.pro/.test(data.meta?.source ?? "")) warn(`${path.relative(REPO_ROOT, file)} is not a foreverchanges dataset (meta.source ${data.meta?.source})`);
  return data;
}

// ---------------------------------------------------------------------------
// Build codes (the same algorithm as src/data/talents/types.ts)
// ---------------------------------------------------------------------------

const codeOrder = (data) => data.trees.map((tree) => tree.talents.filter((t) => t.inForeverTree).sort((a, b) => a.tier - b.tier || a.col - b.col));

/** A build code as ranks by talent name ("Tree/Name" → rank), or throws. */
function decodeByName(data, code) {
  const order = codeOrder(data);
  const out = {};
  code.split("-").forEach((segment, i) => {
    if (segment.length > order[i].length) throw new Error(`segment ${i} has ${segment.length} digits for ${order[i].length} talents`);
    [...segment].forEach((digit, k) => {
      const t = order[i][k];
      if (Number(digit) > t.maxRank) throw new Error(`${t.name}: rank ${digit} > ${t.maxRank}`);
      if (Number(digit)) out[`${data.trees[i].name}/${t.name}`] = Number(digit);
    });
  });
  return out;
}

/** The same checks as validateTalentBuild in src/data/talents/types.ts. */
function validate(data, code) {
  const order = codeOrder(data);
  const ranks = new Map();
  code.split("-").forEach((segment, i) => [...segment].forEach((d, k) => Number(d) && ranks.set(order[i][k].id, Number(d))));
  const all = data.trees.flatMap((tree) => tree.talents);
  const byId = new Map(all.map((t) => [t.id, t]));
  const problems = [];
  let total = 0;
  for (const [id, rank] of ranks) {
    const t = byId.get(id);
    total += rank;
    const below = all.filter((x) => x.tree === t.tree && x.tier < t.tier).reduce((n, x) => n + (ranks.get(x.id) ?? 0), 0);
    if (below < data.rules.pointsPerTier * t.tier) problems.push(`${t.name} needs ${data.rules.pointsPerTier * t.tier} points above, has ${below}`);
    if (t.prerequisite && (ranks.get(t.prerequisite.talentId) ?? 0) < t.prerequisite.rank) problems.push(`${t.name} requires ${byId.get(t.prerequisite.talentId).name} ${t.prerequisite.rank}`);
  }
  if (total > data.rules.maxPoints) problems.push(`${total} points`);
  return problems;
}

function checkCodes(cls, old, next) {
  const codes = [...new Set([...REPO_CODES[cls], ...(old.popularBuilds ?? []).map((b) => b.code)])];
  const results = [];
  for (const code of codes) {
    let a;
    let b;
    try {
      a = decodeByName(old, code);
    } catch (e) {
      fail(`${cls} ${code}: doesn't decode under the old data (${e.message})`);
      continue;
    }
    try {
      b = decodeByName(next, code);
    } catch (e) {
      fail(`${cls} ${code}: doesn't decode under the new data (${e.message})`);
      continue;
    }
    const same = JSON.stringify(a) === JSON.stringify(b);
    if (!same) fail(`${cls} ${code}: decodes differently: old ${JSON.stringify(a)}, new ${JSON.stringify(b)}`);
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
 * The nearest client equivalent of the site's reported_change_kind: "added" with no Classic
 * talent, "unchanged" when name, ranks, texts (ignoring case and whitespace) and prerequisite
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
  saveSnapshotIfForeverchanges();
  const { iconName, unresolved } = await createIconNamer();
  let built = CLASSES.map((cls) => buildClass(cls, iconName));
  if (unresolved.length) {
    // Rare: an icon only the Classic Era file list names. Read it and build again.
    classicFiles = await classic.source.files();
    unresolved.length = 0;
    built = CLASSES.map((cls) => buildClass(cls, iconName));
    for (const u of unresolved) fail(`${u.what}: no icon name for FileDataID ${u.fdid}`);
  }
  const tableMeta = (b) => Object.fromEntries([...b.used.entries()].sort(([a], [c]) => a.localeCompare(c)));
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
      foreverBuildDate: latest.version === version ? latest.created_at.slice(0, 10) : null,
      classicProduct: BASELINE_PRODUCT,
      classicBuild: opts.baseline,
      traitTreeId: b.tree.traitTreeId,
      traitCurrencyId: b.tree.currency.id,
      tables: { forever: tableMeta(forever), classic: tableMeta(classic) },
      wowDbDefs: { repository: "https://github.com/wowdev/WoWDBDefs", commit: dbdefsSha },
    };
    codeResults[cls] = checkCodes(cls, readSnapshot(cls), b.data);
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
    fs.writeFileSync(file, text);
    console.log(`Wrote ${path.relative(REPO_ROOT, file)} (${(text.length / 1024).toFixed(0)} KB)`);
  }
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
    for (const r of codeResults[data.class] ?? []) console.log(`  code ${r.code}: ${r.points} points in ${r.talents} talents, ${r.sameRanks ? "same ranks by name" : "DIFFERENT ranks"}, ${r.legal ? "legal" : "ILLEGAL"}`);
  }
  for (const w of warnings) console.warn(`WARNING: ${w}`);
  console.log(`\nnetwork requests this run: ${fetcher.stats().requests}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

if (opts.write) await write();
if (opts.diff) {
  const { diffTalents } = await import("./lib/talents-diff.mjs");
  const pairs = CLASSES.map((cls) => ({ cls, old: readSnapshot(cls), next: JSON.parse(fs.readFileSync(path.join(REPO_ROOT, OUT_DIR, `${cls}.json`), "utf8")) }));
  diffTalents({ pairs, outDir: path.join(CACHE_DIR, version), repoRoot: REPO_ROOT, decodeByName, repoCodes: REPO_CODES });
  if (!opts.write) console.log(`network requests this run: ${fetcher.stats().requests}`);
}
