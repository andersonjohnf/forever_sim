// The committed version of a dataset: what a fresh generation is checked and diffed against
// (`npm run diff:<dataset>`, docs/data/README.md#refreshing). Reads the git object store, not the
// working tree, so it doesn't matter whether the fresh file was written yet.

import { execFileSync } from "node:child_process";

/**
 * The JSON file `file` (repo-relative) as committed at `ref` (a commit, branch or tag; default
 * HEAD): `{ data, error }`, with `data` null and `error` saying why when git isn't available, has no
 * such file at `ref`, or the file isn't JSON. The storage guards fail closed on an error
 * (talents-client.mjs, races-client.mjs).
 */
export function readCommitted(repoRoot, file, ref = "HEAD") {
  let body;
  try {
    body = execFileSync("git", ["show", `${ref}:${file}`], { cwd: repoRoot, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const detail = e.code === "ENOENT" ? "git is not available" : (e.stderr?.toString("utf8").trim().split("\n")[0] ?? e.message);
    return { data: null, error: `git show ${ref}:${file} failed: ${detail}` };
  }
  try {
    return { data: JSON.parse(body.toString("utf8")), error: null };
  } catch (e) {
    return { data: null, error: `${ref}:${file} is not JSON: ${e.message}` };
  }
}

/** The committed JSON file (see readCommitted), or null when it can't be read. */
export function committedJson(repoRoot, file, ref = "HEAD") {
  return readCommitted(repoRoot, file, ref).data;
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
