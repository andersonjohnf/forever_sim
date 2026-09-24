// Where a generator's datasets go: written to src/data, or, with --check, compared byte for byte
// with the files already there and never written (docs/data/README.md#checking-the-committed-data).
// A check runs from the cache alone and writes nothing to src/data or the cache: the generator's
// fetcher is created `offline`, so a file the cache lacks fails the run instead of being
// downloaded, and its client source `readOnly`, so the parsed-table and game-table copies the
// cache keeps aren't rewritten. It regenerates the build and WoWDBDefs commit the committed
// dataset records (recordedSource), not the cache's "latest", so refreshing the cache for a newer
// build doesn't fail the check of the data committed for the old one.
//
// `--fresh=<dir>` (all.mjs --check passes it to every step) keeps a copy of each fresh generation
// under <dir>, at its repo-relative path, so the client scraper's check reads the four datasets it
// builds on as they are generated rather than as committed.

import fs from "node:fs";
import path from "node:path";

/**
 * `write(file, text)` writes `file` (absolute), or under `check` records whether it matches (and
 * copies `text` under `fresh`, when given).
 * `finish()` prints the check's verdict and sets a non-zero exit code when a file differs; call it
 * last (it does nothing without `check`).
 */
export function createOutput({ repoRoot, check = false, fresh = null }) {
  const stale = [];
  function write(file, text) {
    const rel = path.relative(repoRoot, file);
    if (!check) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      return;
    }
    if (fresh) {
      const copy = path.join(fresh, rel);
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.writeFileSync(copy, text);
    }
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (current === text) {
      console.log(`check: ${rel} is up to date`);
      return;
    }
    stale.push(rel);
    console.error(`check: ${rel} ${current === null ? "is missing" : "differs from a fresh generation"}`);
  }
  function finish() {
    if (!check || !stale.length) return;
    console.error(`\n--check: ${stale.length} file(s) differ from what the generator writes from the cache: ${stale.join(", ")}.`);
    console.error("Regenerate them (npm run scrape) and commit the result with the change that moved them.");
    process.exitCode = 1;
  }
  return { check, write, finish, stale };
}

/**
 * The usage errors of a generator's --check flags: what --check can't be combined with (it neither
 * downloads nor writes, and --claims writes a report), and --fresh without --check.
 */
export function checkConflicts(opts) {
  if (!opts.check) return opts.fresh ? ["--fresh needs --check"] : [];
  return ["refresh", "diff", "fixtures", "claims"].filter((k) => opts[k]).map((k) => `--check can't be combined with --${k}`);
}

/**
 * The Forever build and WoWDBDefs commit a committed dataset (absolute path) records in its meta,
 * which a --check regenerates by default; nulls when the file or its meta doesn't say.
 */
export function recordedSource(file) {
  if (!fs.existsSync(file)) return { version: null, dbdefs: null };
  const meta = JSON.parse(fs.readFileSync(file, "utf8")).meta ?? {};
  return { version: meta.foreverBuild ?? meta.build ?? null, dbdefs: meta.wowDbDefs?.commit ?? null };
}
