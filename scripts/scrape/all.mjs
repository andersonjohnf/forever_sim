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
//
//   --version, --dbdefs  passed to every step (a new beta build, a WoWDBDefs pin)
//   --diff               passed to steps 1–4: each also diffs its fresh dataset against the
//                        committed one (.cache/client/<build>/<dataset>-diff.md)
//   --against            passed to steps 1–4: the git ref that counts as committed (default HEAD)
//
// A new build that changes a build-code position, a stored build code or a race's classes stops
// step 2 or 3; run that generator on its own with --accept-code-changes or --accept-race-changes
// once the app handles the change. Steps 2 and 3 also stop when git can't show the committed
// dataset; run them on their own with --skip-committed-check then (docs/data/README.md#refreshing).
//
// Stops at the first step that fails. Every download is cached under .cache/client/, so a run
// from a warm cache makes no network requests; the run ends with the count, read from
// .cache/client/requests.jsonl. Zero dependencies (Node >= 22). See docs/data/README.md.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const REQUEST_LOG = path.join(REPO_ROOT, ".cache", "client", "requests.jsonl");
const DATASETS = ["spells-client.mjs", "talents-client.mjs", "races-client.mjs", "items-client.mjs"];

const everyStep = [];
const datasetSteps = [];
for (const arg of process.argv.slice(2)) {
  if (/^--(version|dbdefs)=.+$/.test(arg)) everyStep.push(arg);
  else if (arg === "--diff" || /^--against=.+$/.test(arg)) datasetSteps.push(arg);
  else {
    console.error(`Unknown argument: ${arg}\nUsage: node scripts/scrape/all.mjs [--version=<build>] [--dbdefs=<sha>] [--diff] [--against=<git ref>]`);
    process.exit(2);
  }
}

const logged = () => (fs.existsSync(REQUEST_LOG) ? fs.readFileSync(REQUEST_LOG, "utf8").split("\n").filter(Boolean).length : 0);
const before = logged();

const steps = [...DATASETS.map((file) => [file, [...everyStep, ...datasetSteps]]), ["client.mjs", everyStep]];
for (const [file, args] of steps) {
  console.log(`\n=== ${file} ${args.join(" ")}`.trimEnd());
  const run = spawnSync(process.execPath, [path.join(import.meta.dirname, file), ...args], { cwd: REPO_ROOT, stdio: "inherit" });
  if (run.status !== 0) {
    console.error(`\n${file} failed (exit ${run.status ?? run.signal}); later steps not run.`);
    process.exit(run.status || 1);
  }
}
console.log(`\nAll datasets regenerated. Network requests: ${logged() - before}. Review them with git diff --stat src/data.`);
