// Resolves the doc citations in code ("docs/mechanics/rage.md#rage-from-damage-taken",
// "rage.md#forever-") against the docs' headings, the way GitHub renders them: a citation, and
// the app's links to the docs on GitHub, must open at their section rather than the page's top.
// Zero dependencies (CLAUDE.md, scrapers); the test next to it runs it over src/ and scripts/.
import fs from "node:fs";
import path from "node:path";

/**
 * The anchor GitHub gives a heading (github-slugger, which GitHub's renderer follows): the
 * rendered text lowercased, every character that isn't a letter, mark, number, connector
 * punctuation ("_"), hyphen or space dropped (emoji, "[", "’", "–", ":" and "."), then each
 * space turned into a hyphen. A trailing status emoji so leaves a trailing hyphen:
 * "M1: Engine core ✅" is "m1-engine-core-".
 */
export function githubSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]|\uFE0F/gu, "")
    .replace(/ /g, "-");
}

/** A heading's text as rendered: inline code, emphasis, links, images and HTML reduced to text. */
export function renderedHeading(raw) {
  return raw
    .replace(/\s+#+\s*$/, "") // closing hashes
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links and images
    .replace(/`([^`]*)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|\W)[*_](.+?)[*_](?=\W|$)/g, "$1$2")
    .trim();
}

/** Every anchor a Markdown doc has: its ATX headings' slugs (GitHub's "-1", "-2" for repeats) and explicit `<a id>`s. */
export function docAnchors(markdown) {
  const anchors = new Set();
  const seen = new Map();
  let fence = null;
  for (const line of markdown.split(/\r?\n/)) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    for (const m of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(m[1]);
    const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (!h) continue;
    const base = githubSlug(renderedHeading(h[1]));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

const ANCHOR = String.raw`[\p{L}\p{N}_-]+`;

/** The doc-path constants a module declares: `const DOC = 'docs/classes/warlock.md'`. */
export function docConstants(text) {
  const out = new Map();
  for (const m of text.matchAll(/\bconst\s+(\w+)\s*(?::\s*\w+\s*)?=\s*['"`]((?:docs\/)?[\w/-]+\.md)['"`]/g)) out.set(m[1], m[2]);
  return out;
}

/**
 * The doc citations with an anchor in a source file's text: a repo path ("docs/ux.md#layout",
 * also inside a github.com/…/blob/main/ URL), a doc's bare file name ("paladin.md#seals"), or a
 * doc-path constant in a template literal ("`${DOC}#seals`"), which `consts` resolves; one it
 * can't resolve comes back with `file: null`.
 */
export function citedAnchors(text, consts = new Map()) {
  const out = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(new RegExp(String.raw`(?<![\w\\/.-])((?:docs\/)?(?:[\w-]+\/)*[\w-]+\.md)#(${ANCHOR})`, "gu"))) {
      out.push({ file: m[1], anchor: m[2], line: i + 1 });
    }
    for (const m of line.matchAll(new RegExp(String.raw`github\.com\/[\w-]+\/forever_sim\/blob\/[\w-]+\/(docs\/[\w/-]+\.md)#(${ANCHOR})`, "gu"))) {
      out.push({ file: m[1], anchor: m[2], line: i + 1 });
    }
    for (const m of line.matchAll(new RegExp(String.raw`\$\{(\w+)\}#(${ANCHOR})`, "gu"))) {
      out.push({ file: consts.get(m[1]) ?? null, name: m[1], anchor: m[2], line: i + 1 });
    }
  });
  return out;
}

/** The doc-path constants a module declares or imports by name from a relative module. */
function moduleConstants(file, text) {
  const consts = docConstants(text);
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const base = path.resolve(path.dirname(file), m[2]);
    const target = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts"].map((ext) => base + ext).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
    if (!target) continue;
    const theirs = docConstants(fs.readFileSync(target, "utf8"));
    for (const spec of m[1].split(",")) {
      const [name, alias = name] = spec.trim().split(/\s+as\s+/);
      if (theirs.has(name) && !consts.has(alias)) consts.set(alias, theirs.get(name));
    }
  }
  return consts;
}

/** Every file under `dir` whose name matches `pattern`, skipping node_modules and dot directories. */
export function walk(dir, pattern, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, pattern, out);
    else if (pattern.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The citations in `sourceDirs` (relative to `root`) that don't resolve: an unknown doc, a bare
 * file name that names no doc or several, or an anchor the doc has no heading for.
 */
export function brokenCitations(root, sourceDirs, { sourcePattern = /\.(ts|tsx|mjs|js|css)$/, skip = () => false } = {}) {
  const docs = walk(path.join(root, "docs"), /\.md$/).map((f) => path.relative(root, f).split(path.sep).join("/"));
  const anchorsOf = new Map();
  const anchors = (doc) => {
    if (!anchorsOf.has(doc)) anchorsOf.set(doc, docAnchors(fs.readFileSync(path.join(root, doc), "utf8")));
    return anchorsOf.get(doc);
  };
  const broken = [];
  for (const dir of sourceDirs) {
    for (const file of walk(path.join(root, dir), sourcePattern)) {
      const where = path.relative(root, file).split(path.sep).join("/");
      if (skip(where)) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const c of citedAnchors(text, moduleConstants(file, text))) {
        if (c.file === null) {
          broken.push(`${where}:${c.line} \${${c.name}}#${c.anchor}: ${c.name} isn't a doc path this module declares or imports`);
          continue;
        }
        const matches = c.file.startsWith("docs/") ? docs.filter((d) => d === c.file) : docs.filter((d) => d.endsWith(`/${c.file}`));
        const at = `${where}:${c.line} ${c.file}#${c.anchor}`;
        if (matches.length === 0) broken.push(`${at}: no such doc`);
        else if (matches.length > 1) broken.push(`${at}: names ${matches.join(" and ")}; cite the path`);
        else if (!anchors(matches[0]).has(c.anchor)) broken.push(`${at}: no such heading in ${matches[0]}`);
      }
    }
  }
  return broken;
}
