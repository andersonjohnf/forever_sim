#!/usr/bin/env node
// `npm run scrape`: regenerate every dataset in src/data from the client files, in order.
//
//   1. spells-client.mjs   src/data/spells/<class>.json
//   2. talents-client.mjs  src/data/talents/<class>.json
//   3. races-client.mjs    src/data/races/races.json
//   4. items-client.mjs    src/data/items/pre-bis.json (also reads scripts/scrape/pre-raid-bis.json)
//   5. client.mjs          src/data/client/*.json
//
// Steps 1–4 read only client tables, so their order doesn't matter. Step 5 comes last: its
// interest set reads the four datasets above (and the docs), so it must see their new versions.
//
//   node scripts/scrape/all.mjs [--version=<Forever build>] [--dbdefs=<sha>] [--diff] [--against=<git ref>]
//   node scripts/scrape/all.mjs --check [--if-cached] [--version=<Forever build>] [--dbdefs=<sha>]
//
//   --version, --dbdefs  passed to every step (a new beta build, a WoWDBDefs pin)
//   --diff               passed to steps 1–4: each also diffs its fresh dataset against the
//                        committed one (.cache/client/<build>/<dataset>-diff.md)
//   --against            passed to steps 1–4: the git ref that counts as committed (default HEAD)
//   --check              `npm run scrape:check`: passed to every step, which generates from the
//                        cache alone (no requests) and compares with the files in src/data instead
//                        of writing them, writing nothing to src/data or the cache. Each step
//                        regenerates the build and WoWDBDefs commit its committed dataset records,
//                        unless --version/--dbdefs say otherwise. Steps 1–4 leave their fresh
//                        generation in a temporary directory (--fresh), which step 5 reads instead
//                        of the committed datasets, so it checks what a regeneration would write.
//                        Every step runs, and the run fails if any file differs
//                        (docs/data/README.md#checking-the-committed-data).
//   --if-cached          with --check (npm run test:full): skip, and exit 0, when the cache has no
//                        directory for the Forever build or WoWDBDefs commit the committed data
//                        records, for the Classic Era baseline, or for the Forever build the client
//                        scraper reads the doc-cited tables from (lib/wago.mjs CHECK_BUILDS; CI has
//                        no cache). Without it, a check with one of them absent stops (exit 1) and
//                        says it isn't in the cache, rather than reporting the committed data as
//                        stale
//
// A new build that changes a build-code position, a stored build code or a race's classes stops
// step 2 or 3; run that generator on its own with --accept-code-changes or --accept-race-changes
// once the app handles the change. Steps 2 and 3 also stop when git can't show the committed
// dataset; run them on their own with --skip-committed-check then (docs/data/README.md#refreshing).
//
// Stops at the first step that fails (except under --check). Every download is cached under
// .cache/client/, so a run from a warm cache makes no network requests; the run ends with the
// count, read from .cache/client/requests.jsonl. Zero dependencies (Node >= 22). See
// docs/data/README.md.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkNeeds, inWords, recordedSource } from "./lib/output.mjs";
import { dbdefsProblems } from "./lib/wago.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "client");
const REQUEST_LOG = path.join(CACHE_DIR, "requests.jsonl");
/** A dataset of each step, whose meta records the build it was generated from (lib/output.mjs recordedSource). */
const RECORDED = ["src/data/spells/warrior.json", "src/data/talents/warrior.json", "src/data/races/races.json", "src/data/items/pre-bis.json", "src/data/client/spells.json"];
const DATASETS = ["spells-client.mjs", "talents-client.mjs", "races-client.mjs", "items-client.mjs"];

const everyStep = [];
const datasetSteps = [];
let check = false;
let ifCached = false;
let version = null;
for (const arg of process.argv.slice(2)) {
  if (/^--(version|dbdefs)=.+$/.test(arg)) everyStep.push(arg);
  else if (arg === "--check") check = true;
  else if (arg === "--if-cached") ifCached = true;
  else if (arg === "--diff" || /^--against=.+$/.test(arg)) datasetSteps.push(arg);
  else usage(`Unknown argument: ${arg}`);
}
let dbdefs = null;
for (const arg of everyStep) {
  if (arg.startsWith("--version=")) version = arg.slice("--version=".length);
  if (arg.startsWith("--dbdefs=")) dbdefs = arg.slice("--dbdefs=".length);
}
if (check && datasetSteps.length) usage(`--check can't be combined with ${datasetSteps.join(" ")}`);
if (ifCached && !check) usage("--if-cached needs --check");
function usage(msg) {
  console.error(`${msg}\nUsage: node scripts/scrape/all.mjs [--version=<build>] [--dbdefs=<sha>] [--diff] [--against=<git ref>] [--check [--if-cached]]`);
  process.exit(2);
}

for (const problem of dbdefsProblems({ dbdefs })) usage(problem);

// What a check reads from the cache: the Forever build and WoWDBDefs commit the committed data
// records (or --version/--dbdefs), the Classic Era baseline, and the Forever build the client
// scraper reads the doc-cited tables from (lib/output.mjs checkNeeds). One that's absent means there's
// nothing to check against, which is said as such rather than as stale data: --if-cached skips
// (CI has no cache), and a plain --check stops before any generator runs.
if (check) {
  const recorded = RECORDED.map((f) => recordedSource(path.join(REPO_ROOT, f)));
  const needed = checkNeeds({ recorded, version, dbdefs, cacheDir: CACHE_DIR });
  const absent = needed.filter(([, dir]) => !fs.existsSync(dir)).map(([what]) => what);
  if (absent.length) {
    const said = `${inWords(absent)} ${absent.length === 1 ? "isn't" : "aren't"} in the cache (.cache/client; npm run scrape fills it)`;
    if (ifCached) {
      console.log(`scrape:check skipped: ${said}. CI has no cache.`);
      process.exit(0);
    }
    console.error(`--check can't run: ${said}. The committed data wasn't compared, so this says nothing about whether it's stale.`);
    process.exit(1);
  }
}
const fresh = check ? fs.mkdtempSync(path.join(os.tmpdir(), "forever-sim-check-")) : null;
if (check) everyStep.push("--check", `--fresh=${fresh}`);

const logged = () => (fs.existsSync(REQUEST_LOG) ? fs.readFileSync(REQUEST_LOG, "utf8").split("\n").filter(Boolean).length : 0);
const before = logged();

const steps = [...DATASETS.map((file) => [file, [...everyStep, ...datasetSteps]]), ["client.mjs", everyStep]];
const failed = [];
for (const [file, args] of steps) {
  console.log(`\n=== ${file} ${args.join(" ")}`.trimEnd());
  const run = spawnSync(process.execPath, [path.join(import.meta.dirname, file), ...args], { cwd: REPO_ROOT, stdio: "inherit" });
  if (run.status === 0) continue;
  if (!check) {
    console.error(`\n${file} failed (exit ${run.status ?? run.signal}); later steps not run.`);
    process.exit(run.status || 1);
  }
  failed.push(file);
}
if (fresh) fs.rmSync(fresh, { recursive: true, force: true });
if (check) {
  if (failed.length) {
    console.error(`\n--check failed in ${failed.join(", ")}: the committed data isn't what the generators write from the cache (see above).`);
    process.exit(1);
  }
  console.log("\n--check: every dataset in src/data matches a fresh generation from the cache (no requests).");
} else {
  console.log(`\nAll datasets regenerated. Network requests: ${logged() - before}. Review them with git diff --stat src/data.`);
}
