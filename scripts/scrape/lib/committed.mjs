// The committed version of a dataset: what a fresh generation is checked and diffed against
// (`npm run diff:<dataset>`, docs/data/README.md#refreshing). Reads the git object store, not the
// working tree, so it doesn't matter whether the fresh file was written yet.

import { execFileSync } from "node:child_process";

/**
 * The JSON file `file` (repo-relative) as committed at `ref` (a commit, branch or tag; default
 * HEAD), or null when git isn't available or has no such file there.
 */
export function committedJson(repoRoot, file, ref = "HEAD") {
  try {
    const body = execFileSync("git", ["show", `${ref}:${file}`], { cwd: repoRoot, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(body.toString("utf8"));
  } catch {
    return null;
  }
}

/** A short label for a ref, for reports ("HEAD (b5972d8)"). */
export function describeRef(repoRoot, ref = "HEAD") {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", ref], { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim();
    return sha && sha !== ref ? `${ref} (${sha})` : ref;
  } catch {
    return ref;
  }
}
