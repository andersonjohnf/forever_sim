// Where a generator's datasets go: written to src/data, or, with --check, compared byte for byte
// with the files already there and never written (docs/data/README.md#checking-the-committed-data).
// A check runs from the cache alone: the generator's fetcher is created `offline`, so a file the
// cache lacks fails the run instead of being downloaded.

import fs from "node:fs";
import path from "node:path";

/**
 * `write(file, text)` writes `file` (absolute), or under `check` records whether it matches.
 * `finish()` prints the check's verdict and sets a non-zero exit code when a file differs; call it
 * last (it does nothing without `check`).
 */
export function createOutput({ repoRoot, check = false }) {
  const stale = [];
  function write(file, text) {
    const rel = path.relative(repoRoot, file);
    if (!check) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      return;
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

/** The usage error for flags --check can't be combined with (it neither downloads nor writes). */
export function checkConflicts(opts) {
  return ["refresh", "diff", "fixtures"].filter((k) => opts[k]).map((k) => `--check can't be combined with --${k}`);
}
