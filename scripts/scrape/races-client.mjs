#!/usr/bin/env node
// The races, src/data/races/races.json, from the client files (milestone M1.5e, decision D17):
// the playable races of the Forever beta client (wow_classic_beta), the classes each can be
// (CharBaseInfo) and its racials (the racial skill lines of SkillLineAbility), next to the Classic
// Era client (wow_classic_era).
//
//   node scripts/scrape/races-client.mjs [--diff] [--against=<git ref>] [--accept-race-changes]
//        [--skip-committed-check] [--refresh] [--version=<Forever build>] [--baseline=<Classic Era build>]
//        [--dbdefs=<sha>]
//
//   (default)  derive the races and write src/data/races/races.json
//   --diff     then diff the written file against the committed one; report in
//              .cache/client/<build>/races-diff.md (+ .json)
//   --against  the git ref whose dataset is "committed" (default HEAD)
//   --check    from the cache alone, compare the races with the file in src/data and write
//              nothing; exits non-zero if it differs (lib/output.mjs)
//
// Saved setups and share links store race ids, so the run refuses to write if the race ids, a
// race's name or faction, or the classes each race can be in Forever and in Classic Era differ
// from the committed dataset's. A build that really changes them needs --accept-race-changes,
// after the app handles the change. Without a committed dataset to compare with (git missing, or
// no such file at --against) it refuses to write unless --skip-committed-check says so. The run
// also fails on a racial without a rendered tooltip or an icon.
//
// Downloads go through lib/wago.mjs (documented wago.tools API only, one request at a time,
// cached under .cache/client/, once per build). Zero dependencies (Node >= 22). See
// docs/data/races.md.

import path from "node:path";
import { describeRef, readCommitted } from "./lib/committed.mjs";
import { createFetcher } from "./lib/http.mjs";
import { compareText, stableStringify } from "./lib/json.mjs";
import { checkConflicts, createOutput } from "./lib/output.mjs";
import { RACE_TABLES, classSlugs, classesOfMask, groupByText, isHidden, raceNames, racialId, racialRows } from "./lib/race-data.mjs";
import { SPELL_TEXT_TABLES, createSpellTextContext, renderSpellText } from "./lib/spell-text.mjs";
import { SPELLBOOK_TABLES, castTimeOf, cooldownOf, costOf, createBookContext, norm, rangeOf } from "./lib/spellbook.mjs";
import { isPassive } from "./lib/talent-tree.mjs";
import { buildDate, createClientSource, latestBuild, wowDbDefsCommit } from "./lib/wago.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "client");
const SCRAPER = "scripts/scrape/races-client.mjs";
const OUT_FILE = "src/data/races/races.json";
const PRODUCT = "wow_classic_beta";
const BASELINE_PRODUCT = "wow_classic_era";
const DEFAULT_BASELINE = "1.15.9.69722";
const SIM_CLASSES = ["warrior", "druid", "paladin", "shaman", "rogue", "mage", "warlock", "priest", "hunter"];
/**
 * The client ships no race icon (character creation draws races from atlas textures). Icons follow
 * Wowhead's race_<ClientFileString>_male names (decision D14); the Skyborne, which have none there,
 * keep elf-head placeholders.
 */
const RACE_ICON_OVERRIDES = { 95: "inv_misc_head_elf_01", 96: "inv_misc_head_elf_02" };

const opts = { diff: false, "accept-race-changes": false, "skip-committed-check": false, refresh: false, check: false, version: null, baseline: DEFAULT_BASELINE, dbdefs: null, against: "HEAD" };
for (const arg of process.argv.slice(2)) {
  const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
  if (!m) usage(`Unknown argument: ${arg}`);
  const [, key, value] = m;
  if (["diff", "accept-race-changes", "skip-committed-check", "refresh", "check"].includes(key) && value === undefined) opts[key] = true;
  else if (["version", "baseline", "dbdefs", "against"].includes(key) && value) opts[key] = value;
  else usage(`Unknown argument: ${arg}`);
}
if (opts.check) for (const conflict of checkConflicts(opts)) usage(conflict);
function usage(msg) {
  console.error(`${msg}\nUsage: node ${SCRAPER} [--diff] [--against=<git ref>] [--accept-race-changes] [--skip-committed-check] [--refresh] [--check] [--version=<build>] [--baseline=<build>] [--dbdefs=<sha>]`);
  process.exit(2);
}
const output = createOutput({ repoRoot: REPO_ROOT, check: opts.check });

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const fetcher = createFetcher({ cacheDir: CACHE_DIR, refresh: opts.refresh, offline: opts.check });
const latest = await latestBuild(fetcher, PRODUCT);
const version = opts.version ?? latest.version;
/** The build's creation date on wago.tools, from its build list (lib/wago.mjs buildRecord). */
const foreverBuildDate = await buildDate(fetcher, PRODUCT, version);
const dbdefsSha = await wowDbDefsCommit(fetcher, opts.dbdefs);

async function load(build) {
  const source = createClientSource({ fetcher, cacheDir: CACHE_DIR, version: build, dbdefsSha });
  const tables = {};
  const used = new Map();
  for (const name of [...new Set([...RACE_TABLES, ...SPELLBOOK_TABLES, ...SPELL_TEXT_TABLES])]) {
    const t = await source.table(name);
    if (!t.present) throw new Error(`${name}: not in build ${build}`);
    if (t.warnings?.length) throw new Error(`${name} (${build}): ${t.warnings.join("; ")}`);
    tables[name] = t;
    used.set(name, t.fdid);
  }
  return { build, source, tables, used, text: createSpellTextContext(tables) };
}

const forever = await load(version);
const classic = await load(opts.baseline);

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function createIconNamer() {
  const files = await forever.source.files();
  return (fdid, what) => {
    const m = fdid && /^interface\/icons\/(.+)\.blp$/i.exec(files[String(fdid)] ?? "");
    if (!m) fail(`${what}: no icon name for FileDataID ${fdid}`);
    return m ? m[1].toLowerCase().replaceAll(" ", "-") : null;
  };
}

/** race id (ChrRaces.ID) → Set of ChrClasses ids, from CharBaseInfo. */
function classPairs(t) {
  const out = new Map();
  for (const r of t.CharBaseInfo.rows) {
    if (!out.has(r.RaceID)) out.set(r.RaceID, new Set());
    out.get(r.RaceID).add(r.ClassID);
  }
  return out;
}

/** The tooltip header of an active racial: cast time, cooldown, range, cost (null when passive). */
function header(ctx, spellId) {
  if (isPassive(ctx.tooltip, spellId)) return null;
  const out = { castTime: castTimeOf(ctx, spellId).raw };
  const cd = cooldownOf(ctx, spellId);
  if (cd) out.cooldown = cd.raw;
  const range = rangeOf(ctx, spellId);
  if (range) out.range = range.raw;
  const cost = costOf(ctx, spellId);
  if (cost) out.resourceCost = cost.raw;
  return out;
}

/** Clauses left out because they read a spell the build doesn't ship: [{ spellId, clause, reads, encrypted }]. */
const droppedClauses = [];

/**
 * A racial's tooltip. A "for $<id>d" clause that reads the duration of a spell the build doesn't
 * ship is left out (Forever's Berserking 20554 reads its haste aura 26635, which the Forever client
 * lacks); any other unresolved token fails the run.
 */
function render(b, id) {
  const out = renderSpellText(b.text, id, { conditions: "unmet", lines: true, wholeExpressions: true });
  let text = out.text;
  const unrendered = [];
  for (const token of out.unrendered) {
    // The renderer leaves an unresolved token out, so the clause reads " for ." here.
    const m = /^\$(\d+)d$/.exec(token);
    const dangling = / for ?(?=[.,;])/;
    if (m && !b.text.spell.has(Number(m[1])) && dangling.test(text)) {
      text = text.replace(dangling, "");
      droppedClauses.push({ build: b.build, spellId: id, clause: `for ${token}`, reads: Number(m[1]), encrypted: !!b.tables.SpellName.encryptedIds?.has(Number(m[1])) });
    } else unrendered.push(token);
  }
  return { text, unrendered };
}
const normText = (s) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

async function build() {
  const iconName = await createIconNamer();
  const fctx = createBookContext(forever.tables, { text: forever.text, iconName });
  const cctx = createBookContext(classic.tables, { text: classic.text, iconName });
  const slugOf = classSlugs(forever.tables);
  const classIds = [...slugOf.keys()].sort((a, b) => a - b);
  const className = new Map(forever.tables.ChrClasses.rows.map((c) => [c.ID, c.Name_lang]));
  const fPairs = classPairs(forever.tables);
  const cPairs = classPairs(classic.tables);

  // Playable races: those CharBaseInfo pairs with a class. Horde first, then by ChrRaces id
  // (the order the race picker has always shown).
  const factionOrder = { Horde: 0, Alliance: 1 };
  const chr = forever.tables.ChrRaces.rows
    .filter((r) => fPairs.has(r.ID))
    .map((row) => ({ row, ...raceNames(row) }))
    .sort((a, b) => factionOrder[a.faction] - factionOrder[b.faction] || a.row.ID - b.row.ID);
  for (const r of chr) if (!r.faction) fail(`${r.row.Name_lang}: ChrRaces.Alliance ${r.row.Alliance} is neither faction`);

  /** name → [{ spellId, classMask }] of a race's racials in one build, in SkillLineAbility order. */
  const racialsOf = (b, ctx, row) => {
    const groups = new Map();
    for (const x of racialRows(b.tables, row, ctx.name)) {
      if (!x.name || isHidden(ctx.misc, x.spellId)) continue;
      const key = norm(x.name);
      if (!groups.has(key)) groups.set(key, { name: x.name, rows: [] });
      if (!groups.get(key).rows.some((y) => y.spellId === x.spellId)) groups.get(key).rows.push(x);
    }
    return groups;
  };
  const classicRaces = classic.tables.ChrRaces.rows.filter((r) => cPairs.has(r.ID));
  const classicRacials = new Map(classicRaces.map((r) => [r.ID, racialsOf(classic, cctx, r)]));

  // Which races share each racial (by name), for ids and `races`.
  const foreverRacials = new Map(chr.map((r) => [r.row.ID, racialsOf(forever, fctx, r.row)]));
  const holders = new Map();
  for (const r of chr) for (const key of foreverRacials.get(r.row.ID).keys()) holders.set(key, [...(holders.get(key) ?? []), r]);

  const races = chr.map((r) => {
    const fClassIds = [...fPairs.get(r.row.ID)].sort((a, b) => a - b);
    const cClassIds = cPairs.has(r.row.ID) ? [...cPairs.get(r.row.ID)].sort((a, b) => a - b) : null;
    const newInForever = cClassIds === null;
    const cGroups = classicRacials.get(r.row.ID) ?? new Map();
    const racials = [...foreverRacials.get(r.row.ID).entries()].map(([key, g]) => {
      const variants = g.rows.map((x) => {
        const out = render(forever, x.spellId);
        if (!out.text || out.unrendered.length) fail(`${r.id} ${g.name} ${x.spellId}: tooltip ${out.unrendered.join(", ") || "empty"}`);
        return { spellId: x.spellId, classIds: classesOfMask(x.classMask, classIds).filter((id) => fClassIds.includes(id)), text: out.text };
      });
      const groups = groupByText(variants.filter((v) => v.classIds.length));
      const perClass = groups.length > 1;
      const foreverText = perClass ? groups.map((x) => `${x.classIds.map((id) => className.get(id)).join(", ")}: ${x.text}`).join("\n") : variants[0].text;
      const first = g.rows[0].spellId;
      const spellIds = g.rows.map((x) => x.spellId).sort((a, b) => a - b);
      const tooltip = header(fctx, first);

      // Classic Era: the same racial of the same race, else of other races.
      const cg = cGroups.get(key);
      let classicSide;
      let classicSpellId = null;
      if (newInForever) classicSide = { status: "absent", name: null, text: null, tooltip: null, otherRaces: [] };
      else if (cg) {
        const ids = cg.rows.map((x) => x.spellId).sort((a, b) => a - b);
        classicSpellId = ids.find((id) => spellIds.includes(id)) ?? ids[0];
        classicSide = { status: "verified", name: cg.name, text: render(classic, classicSpellId).text || null, tooltip: header(cctx, classicSpellId), otherRaces: [] };
      } else {
        const otherRaces = classicRaces
          .filter((cr) => cr.ID !== r.row.ID && classicRacials.get(cr.ID).has(key))
          .map((cr) => ({ race: raceNames(cr).name, text: render(classic, classicRacials.get(cr.ID).get(key).rows[0].spellId).text }));
        classicSide = { status: "not_listed", name: null, text: null, tooltip: null, otherRaces };
      }
      let changeKind;
      if (classicSide.status !== "verified") changeKind = classicSide.otherRaces.length ? "moved" : "added";
      else changeKind = normText(foreverText) === normText(classicSide.text) && JSON.stringify(tooltip) === JSON.stringify(classicSide.tooltip) ? "unchanged" : "modified";

      const icon = iconName(fctx.misc.get(first)?.SpellIconFileDataID, `${r.id} ${g.name}`);
      return {
        id: racialId(g.name, holders.get(key).map((h) => h.row)),
        name: g.name,
        icon,
        spellIds,
        changeKind,
        changeLabel: { added: "New", moved: "New", modified: "Changed", unchanged: "Unchanged" }[changeKind],
        passive: isPassive(fctx.tooltip, first),
        tooltip,
        forever: foreverText,
        foreverByClass: perClass ? Object.fromEntries(groups.flatMap((x) => x.classIds.map((id) => [slugOf.get(id), x.text]))) : null,
        classic: classicSide,
        classicSpellId,
        races: holders.get(key).map((h) => h.id),
      };
    });
    const removedRacials = [...cGroups.entries()]
      .filter(([key]) => !foreverRacials.get(r.row.ID).has(key))
      .map(([, g]) => {
        const id = Math.min(...g.rows.map((x) => x.spellId));
        return { name: g.name, classicSpellId: id, text: render(classic, id).text || null };
      });
    const fSlugs = fClassIds.map((id) => slugOf.get(id));
    const cSlugs = cClassIds?.map((id) => slugOf.get(id)) ?? null;
    return {
      id: r.id,
      name: r.name,
      baseName: r.baseName,
      faction: r.faction,
      icon: RACE_ICON_OVERRIDES[r.row.ID] ?? `race_${r.row.ClientFileString.toLowerCase()}_male`,
      chrRacesId: r.row.ID,
      newInForever,
      classes: {
        forever: fSlugs,
        classic: cSlugs,
        addedInForever: fSlugs.filter((c) => !cSlugs?.includes(c)),
        removedInForever: (cSlugs ?? []).filter((c) => !fSlugs.includes(c)),
      },
      racials,
      removedRacials,
    };
  });

  const simClassAvailability = Object.fromEntries(
    SIM_CLASSES.map((cls) => [cls, { forever: races.filter((r) => r.classes.forever.includes(cls)).map((r) => r.id), classic: races.filter((r) => r.classes.classic?.includes(cls)).map((r) => r.id) }]),
  );
  const newCombos = races.filter((r) => !r.newInForever).flatMap((r) => r.classes.addedInForever.map((c) => ({ raceId: r.id, race: r.name, faction: r.faction, class: c })));
  const tableMeta = (b) => Object.fromEntries([...b.used.entries()].sort(([a], [c]) => compareText(a, c)));
  let at = "";
  for (const b of [forever, classic])
    for (const fdid of b.used.values()) {
      const meta = b.source.cascMeta(fdid);
      if (meta?.fetchedAt && meta.fetchedAt > at) at = meta.fetchedAt;
    }
  return {
    meta: {
      source: "https://wago.tools/api/casc",
      scraper: SCRAPER,
      scrapedAt: at.replace(/\.\d+Z$/, "Z"),
      product: PRODUCT,
      foreverBuild: version,
      foreverBuildDate,
      classicProduct: BASELINE_PRODUCT,
      classicBuild: opts.baseline,
      tables: { forever: tableMeta(forever), classic: tableMeta(classic) },
      wowDbDefs: { repository: "https://github.com/wowdev/WoWDBDefs", commit: dbdefsSha },
    },
    classOrder: classIds.map((id) => slugOf.get(id)),
    simClassAvailability,
    newCombos,
    races,
  };
}

/**
 * The contract with saved setups and share links: race ids, names, factions and classes as the
 * committed dataset has them. A change fails the run unless --accept-race-changes. Without a
 * committed dataset (`old` null, `error` why) the run fails unless --skip-committed-check.
 */
function checkAgainstCommitted(next, old, against, error) {
  if (!old) {
    const why = `can't read the committed dataset at ${against} (${error}), so race ids and classes can't be checked`;
    if (opts["skip-committed-check"]) warn(`${why}; writing anyway (--skip-committed-check)`);
    else fail(`${why}. Not writing: pass --skip-committed-check to write without the check`);
    return;
  }
  const changed = opts["accept-race-changes"] ? warn : fail;
  const ids = (d) => d.races.map((r) => r.id).sort();
  if (JSON.stringify(ids(next)) !== JSON.stringify(ids(old))) changed(`race ids differ from ${against}: ${ids(old).join(", ")} → ${ids(next).join(", ")}`);
  const set = (xs) => JSON.stringify([...(xs ?? [])].sort());
  for (const o of old.races) {
    const n = next.races.find((r) => r.id === o.id);
    if (!n) continue;
    if (set(n.classes.forever) !== set(o.classes.forever)) changed(`${o.id}: Forever classes ${set(o.classes.forever)} → ${set(n.classes.forever)}`);
    if (set(n.classes.classic) !== set(o.classes.classic)) changed(`${o.id}: Classic classes ${set(o.classes.classic)} → ${set(n.classes.classic)}`);
    if (n.name !== o.name || n.faction !== o.faction) changed(`${o.id}: ${o.name} (${o.faction}) → ${n.name} (${n.faction})`);
  }
  for (const cls of SIM_CLASSES)
    for (const side of ["forever", "classic"])
      if (set(next.simClassAvailability[cls][side]) !== set(old.simClassAvailability[cls]?.[side])) changed(`${cls} ${side} races differ from ${against}`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const against = describeRef(REPO_ROOT, opts.against);
const { data: old, error: oldError } = readCommitted(REPO_ROOT, OUT_FILE, opts.against);
const next = await build();
checkAgainstCommitted(next, old, against, oldError);
console.log(`${next.races.length} races (${next.races.filter((r) => r.faction === "Horde").length} Horde), ${new Set(next.races.flatMap((r) => r.racials.map((x) => x.id))).size} racials, ${next.races.reduce((n, r) => n + r.classes.forever.length, 0)} race/class pairs (Classic Era ${next.races.reduce((n, r) => n + (r.classes.classic?.length ?? 0), 0)})`);
for (const cls of SIM_CLASSES) console.log(`  ${cls}: Forever ${next.simClassAvailability[cls].forever.join(", ")}; Classic ${next.simClassAvailability[cls].classic.join(", ")}`);
console.log(`  new pairs: ${next.newCombos.map((c) => `${c.race} ${c.class}`).join(", ")}`);
for (const r of next.races) console.log(`  ${r.name}: ${r.racials.map((x) => `${x.name} [${x.changeKind}]`).join(", ")}${r.removedRacials.length ? `; removed: ${r.removedRacials.map((x) => x.name).join(", ")}` : ""}`);
for (const d of droppedClauses) console.log(`  left out of ${d.spellId}'s tooltip (${d.build}): "${d.clause}" (spell ${d.reads} is not in the client${d.encrypted ? ", encrypted" : ""})`);
for (const w of warnings) console.warn(`WARNING: ${w}`);
console.log(`network requests this run: ${fetcher.stats().requests}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(`\nNot writing ${OUT_FILE}: ${errors.length} check(s) failed.`);
  process.exit(1);
}
const text = stableStringify(next);
output.write(path.join(REPO_ROOT, OUT_FILE), text);
if (!opts.check) console.log(`Wrote ${OUT_FILE} (${(text.length / 1024).toFixed(0)} KB)`);
output.finish();
if (opts.diff) {
  if (!old) {
    console.error(`No committed dataset at ${against}: nothing to diff against.`);
    process.exit(1);
  }
  const { diffRaces } = await import("./lib/races-diff.mjs");
  diffRaces({ old, next: JSON.parse(text), against, outDir: path.join(CACHE_DIR, version), repoRoot: REPO_ROOT });
}
