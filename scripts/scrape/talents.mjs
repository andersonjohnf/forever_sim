#!/usr/bin/env node
// One-time snapshot of the WoW Forever talent trees from https://foreverchanges.pro.
//
//   node scripts/scrape/talents.mjs [--refresh]
//
// Fetches /talents/{warrior,druid,paladin} (cached under .cache/scrape/talents/),
// decodes the Next.js React Server Components (RSC) payload embedded in the HTML,
// and writes src/data/talents/<class>.json. Exits non-zero if validation fails.
// Node >= 22, no npm dependencies. See docs/data/talents.md.
//
// The RSC helpers below are exported so scripts/scrape/races.mjs can reuse them.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SITE = 'https://foreverchanges.pro';
export const USER_AGENT =
  'forever_sim-scraper/0.1 (+https://github.com/andersonjohnf/forever_sim; one-time data snapshot)';
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// robots.txt (checked 2026-09-22) disallows these prefixes; never fetch them.
const DISALLOWED_PREFIXES = ['/api/', '/spell/', '/search', '/admin'];
const MIN_REQUEST_GAP_MS = 1500;

// ---------------------------------------------------------------------------
// Polite, cached fetching
// ---------------------------------------------------------------------------

let lastRequestAt = 0;

/**
 * Returns `{ html, fetchedAt }` for a site path, reading from `cacheFile` unless
 * `refresh` is set. Requests are sequential and at least 1.5 s apart.
 */
export async function fetchCached(sitePath, cacheFile, { refresh = false } = {}) {
  if (DISALLOWED_PREFIXES.some((p) => sitePath.startsWith(p))) {
    throw new Error(`Refusing to fetch ${sitePath}: disallowed by robots.txt`);
  }
  const metaFile = `${cacheFile}.meta.json`;
  if (!refresh && existsSync(cacheFile) && existsSync(metaFile)) {
    const meta = JSON.parse(await readFile(metaFile, 'utf8'));
    return { html: await readFile(cacheFile, 'utf8'), fetchedAt: meta.fetchedAt, url: meta.url };
  }
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const url = new URL(sitePath, SITE).href;
  process.stderr.write(`GET ${url}\n`);
  lastRequestAt = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
  lastRequestAt = Date.now();
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  const html = await res.text();
  const fetchedAt = new Date().toISOString();
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, html);
  await writeFile(
    metaFile,
    `${JSON.stringify({ url, fetchedAt, status: res.status, bytes: Buffer.byteLength(html) }, null, 2)}\n`,
  );
  return { html, fetchedAt, url };
}

// ---------------------------------------------------------------------------
// Next.js RSC ("flight") payload decoding
// ---------------------------------------------------------------------------

/** Concatenates every `self.__next_f.push([1,"…"])` string literal in the HTML. */
export function extractFlightText(html) {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let out = '';
  let n = 0;
  for (const m of html.matchAll(re)) {
    out += JSON.parse(m[1]);
    n++;
  }
  if (n === 0) throw new Error('No self.__next_f.push([1,…]) chunks found in HTML');
  return out;
}

/**
 * Splits the flight stream into rows. Returns Map<id, { tag, value }> where tag
 * is '' for JSON rows, 'T' for text rows, 'I' for client-module rows, etc.
 * `T<hexlen>,` rows are length-prefixed in UTF-8 bytes and may contain newlines.
 */
export function parseFlightRows(text) {
  const buf = Buffer.from(text, 'utf8');
  const rows = new Map();
  let i = 0;
  while (i < buf.length) {
    if (buf[i] === 0x0a) {
      i++;
      continue;
    }
    const colon = buf.indexOf(0x3a, i); // ':'
    if (colon < 0) throw new Error(`Malformed flight row at byte ${i}`);
    const id = buf.toString('utf8', i, colon);
    if (!/^[0-9a-f]*$/.test(id)) throw new Error(`Malformed flight row id ${JSON.stringify(id)}`);
    let j = colon + 1;
    let tag = '';
    // Row tags are a single capital letter (or two, e.g. HL) before the payload.
    while (j < buf.length && buf[j] >= 0x41 && buf[j] <= 0x5a) {
      tag += String.fromCharCode(buf[j]);
      j++;
    }
    if (tag === 'T') {
      const comma = buf.indexOf(0x2c, j);
      const len = parseInt(buf.toString('utf8', j, comma), 16);
      const start = comma + 1;
      rows.set(id, { tag, value: buf.toString('utf8', start, start + len) });
      i = start + len;
      continue;
    }
    let end = buf.indexOf(0x0a, j);
    if (end < 0) end = buf.length;
    const raw = buf.toString('utf8', j, end);
    i = end + 1;
    if (id === '') continue; // hints (HL etc.) carry no data
    if (tag !== '' && tag !== 'I') {
      // Stream-control rows (X/C: async iterable open/close, E: error, D: debug, …)
      // are not data. Keep the raw payload for diagnostics only.
      if (!rows.has(id)) rows.set(id, { tag, value: raw });
      continue;
    }
    // Later JSON rows under a stream's id are its items; the stream stays opaque.
    if (rows.has(id) && !['', 'I'].includes(rows.get(id).tag)) continue;
    let value;
    try {
      value = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Flight row ${id}${tag} is not JSON: ${err.message}`);
    }
    rows.set(id, { tag, value });
  }
  return rows;
}

/** Marker for client-component references (an I row); never serialised. */
export const CLIENT_REF = Symbol('clientRef');
/** Marker for a non-data row (stream, error, debug); never serialised. */
export const OPAQUE_REF = Symbol('opaqueRef');
/** Marker for an unfollowed lazy reference ("$L<id>" to a JSON row, e.g. children). */
export const LAZY_REF = Symbol('lazyRef');

/**
 * Resolves RSC reference strings against the flight rows, returning plain
 * JSON-like data:
 *   "$$x"                  -> "$x" (escaped literal)
 *   "$undefined" etc.      -> the corresponding JS value (undefined keys are dropped)
 *   "$<id>"                -> the resolved row
 *   "$<id>:a:b:0"          -> a sub-value of a row (the stream's de-duplication);
 *                             "props"/"type"/"key" step into ["$",type,key,props]
 *   "$L<id>"               -> { [LAZY_REF]: id } (rendered children; follow with
 *                             deref()), or { [CLIENT_REF]: … } for a client module
 * Path references walk the raw row, so a child that points back into its
 * parent's props does not create a cycle.
 */
export function createResolver(rows) {
  const cache = new Map();
  const inProgress = new Set();

  function rowOf(id) {
    const row = rows.get(id);
    if (!row) throw new Error(`Unresolvable RSC reference to missing row ${id}`);
    return row;
  }

  function resolveRow(id) {
    if (cache.has(id)) return cache.get(id);
    const row = rowOf(id);
    if (row.tag === 'I') return { [CLIENT_REF]: row.value };
    if (row.tag === 'T') return row.value;
    // Streams (X/R/r…), errors and debug rows are opaque: render plumbing, not data.
    if (row.tag !== '') return { [OPAQUE_REF]: `${row.tag}${id}` };
    if (inProgress.has(id)) throw new Error(`Cyclic RSC reference through row ${id}`);
    inProgress.add(id);
    const value = resolve(row.value);
    inProgress.delete(id);
    cache.set(id, value);
    return value;
  }

  function step(cur, seg, ref) {
    if (Array.isArray(cur) && cur[0] === '$' && cur.length === 4 && seg in { type: 1, key: 2, props: 3 }) {
      return cur[{ type: 1, key: 2, props: 3 }[seg]]; // React element tuple ["$", type, key, props]
    }
    if (cur !== null && typeof cur === 'object' && Object.hasOwn(cur, seg)) return cur[seg];
    throw new Error(`RSC reference ${ref} does not resolve (at segment ${seg})`);
  }

  function resolvePath(id, segments, ref) {
    const row = rowOf(id);
    if (row.tag !== '') return segments.length ? step(resolveRow(id), segments[0], ref) : resolveRow(id);
    let cur = row.value;
    let raw = true; // still inside the unresolved row JSON?
    for (const seg of segments) {
      if (raw && typeof cur === 'string' && cur[0] === '$' && cur !== '$') {
        cur = deref(resolveString(cur));
        raw = false;
      }
      cur = step(cur, seg, ref);
    }
    return raw ? resolve(cur) : cur;
  }

  function deref(v) {
    return v !== null && typeof v === 'object' && LAZY_REF in v ? resolveRow(v[LAZY_REF]) : v;
  }

  function resolveString(s) {
    if (s[0] !== '$' || s === '$') return s; // "$" alone marks an element tuple
    if (s[1] === '$') return s.slice(1);
    if (s === '$undefined') return undefined;
    if (s === '$NaN') return NaN;
    if (s === '$Infinity') return Infinity;
    if (s === '$-Infinity') return -Infinity;
    if (s === '$-0') return -0;
    const kind = s[1];
    if (kind === 'S') return s; // React symbols such as $Sreact.fragment (render-only)
    if (kind === 'D') return s.slice(2); // Date, kept as its ISO string
    if (kind === 'n') return s.slice(2); // BigInt, kept as a decimal string
    if (kind === 'L' || kind === '@') {
      const id = s.slice(2);
      if (!/^[0-9a-f]+$/.test(id)) throw new Error(`Unsupported RSC reference ${s}`);
      const row = rowOf(id);
      return row.tag === 'I' ? { [CLIENT_REF]: row.value } : { [LAZY_REF]: id };
    }
    const body = s.slice(1);
    if (!/^[0-9a-f]+(:|$)/.test(body)) throw new Error(`Unsupported RSC reference ${s}`);
    const [id, ...segments] = body.split(':');
    return resolvePath(id, segments, s);
  }

  function resolve(value) {
    if (typeof value === 'string') return resolveString(value);
    if (Array.isArray(value)) return value.map(resolve);
    if (value !== null && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        const r = resolve(v);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }
    return value;
  }

  return { resolve, resolveRow, deref };
}

/**
 * Parses the HTML and resolves every JSON row. Returns { rows, resolved, deref }
 * where resolved is Map<id, value> and deref follows a LAZY_REF marker.
 */
export function decodeRscPage(html) {
  const rows = parseFlightRows(extractFlightText(html));
  const { resolveRow, deref } = createResolver(rows);
  const resolved = new Map();
  for (const [id, row] of rows) if (row.tag === '') resolved.set(id, resolveRow(id));
  return { rows, resolved, deref };
}

/** Depth-first search for values satisfying `pred` inside `root`. */
export function findAll(root, pred, out = [], seen = new Set()) {
  if (root === null || typeof root !== 'object') return out;
  if (seen.has(root)) return out;
  seen.add(root);
  if (pred(root)) out.push(root);
  for (const v of Array.isArray(root) ? root : Object.values(root)) findAll(v, pred, out, seen);
  return out;
}

/** Throws if any string in `value` still looks like an unresolved RSC reference. */
export function assertNoRscRefs(value, where) {
  const bad = [];
  (function walk(v, p) {
    if (typeof v === 'string') {
      if (/^\$/.test(v)) bad.push(`${p}: ${v.slice(0, 60)}`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v !== null && typeof v === 'object') {
      if (CLIENT_REF in v) bad.push(`${p}: <client component reference>`);
      if (OPAQUE_REF in v) bad.push(`${p}: <opaque row ${v[OPAQUE_REF]}>`);
      if (LAZY_REF in v) bad.push(`${p}: <lazy reference to row ${v[LAZY_REF]}>`);
      for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`);
    }
  })(value, where);
  if (bad.length) throw new Error(`Unresolved RSC references in ${where}:\n  ${bad.slice(0, 10).join('\n  ')}`);
}

/** Deterministic JSON: 2-space indent, trailing newline. */
export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

/** Writes `value` as deterministic JSON, creating the directory if needed. */
export async function writeJson(file, value) {
  assertNoRscRefs(value, path.relative(REPO_ROOT, file));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, stableJson(value));
}

/** True for a React element tuple ["$", type, key, props]. */
export function isElement(v) {
  return Array.isArray(v) && v.length === 4 && v[0] === '$';
}

/** Visits every React element under `root`, following lazy row references. */
export function walkElements(root, deref, visit) {
  const seen = new Set();
  (function walk(v) {
    v = deref(v);
    if (v === null || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (isElement(v)) {
      if (visit(v) !== false) walk(v[3]?.children);
      return;
    }
    for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x);
  })(root);
}

/** Concatenated text of an element subtree (client components contribute nothing). */
export function textContent(v, deref) {
  v = deref(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (!Array.isArray(v)) return '';
  if (isElement(v)) return typeof v[1] === 'string' ? textContent(v[3]?.children, deref) : '';
  return v.map((x) => textContent(x, deref)).join('');
}

/** Collects validation problems; `report()` prints them and returns the count. */
export function createChecker(label) {
  const problems = [];
  return {
    check(cond, msg) {
      if (!cond) problems.push(msg);
      return !!cond;
    },
    fail(msg) {
      problems.push(msg);
    },
    get count() {
      return problems.length;
    },
    report() {
      if (problems.length) {
        console.error(`\n${label}: ${problems.length} validation problem(s):`);
        for (const p of problems) console.error(`  - ${p}`);
      }
      return problems.length;
    },
  };
}

/** Throws if `obj` has keys outside `known`, so a changed site schema is noticed. */
export function assertKnownKeys(obj, known, where) {
  const extra = Object.keys(obj).filter((k) => !known.includes(k));
  if (extra.length) throw new Error(`${where}: unexpected field(s) ${extra.join(', ')} — update the scraper`);
}

/** Sorts rank texts keyed "1".."n" into an array (index 0 = rank 1). */
export function rankArray(obj, where) {
  const keys = Object.keys(obj ?? {});
  const nums = keys.map(Number).sort((a, b) => a - b);
  nums.forEach((n, i) => {
    if (n !== i + 1) throw new Error(`${where}: rank keys are not 1..n (${keys.join(',')})`);
  });
  return nums.map((n) => obj[String(n)]);
}

/** Extracts the build number from a source URL/title ("build=1.60.1.69913"). */
function buildOf(text) {
  return /build[= ](\d+\.\d+\.\d+\.\d+)/.exec(text ?? '')?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Talent scraping
// ---------------------------------------------------------------------------

const CLASSES = ['warrior', 'druid', 'paladin'];
const OUT_DIR = path.join(REPO_ROOT, 'src/data/talents');
const SCRAPER = 'scripts/scrape/talents.mjs';
const MAX_POINTS = 51; // Math.min(51, level - 9 + talented) in the site's calculator
const POINTS_PER_TIER = 5;
const MAX_TIER = 6;
const MAX_COL = 3;

const TALENT_KEYS = [
  'id', 'name', 'class', 'kind', 'tree_name', 'tree_id', 'tree_index', 'icon',
  'reported_change_kind', 'evidence_status', 'rank_texts', 'estimated_rank_texts', 'max_rank',
  'discovered_at', 'calculator_eligible', 'context_only', 'comparison_status', 'summary', 'changes',
  'classic', 'structure', 'tooltip_metadata', 'sources', 'reported_previous_name',
];
const STRUCTURE_KEYS = [
  'tier', 'col', 'prerequisite_status', 'position_status', 'max_rank_status', 'reported_prerequisite',
];
const CLASSIC_KEYS = [
  'status', 'rank_texts', 'name', 'match_status', 'max_rank', 'source', 'build', 'tree_name', 'tier',
  'prerequisite',
];
const TOOLTIP_KEYS = {
  passive: 'passive',
  resource_cost: 'resourceCost',
  range: 'range',
  cast_time: 'castTime',
  cooldown: 'cooldown',
  requirements: 'requirements',
};
const INDEX_LABELS = { added: 'New', modified: 'Changed', moved: 'Moved', unchanged: 'Same as Classic' };

/** The talent calculator component's props (the only object with classSlug + trees + popular). */
function extractCalculatorProps(resolved, cls) {
  const found = findAll(
    [...resolved.values()],
    (v) => !Array.isArray(v) && typeof v.classSlug === 'string' && Array.isArray(v.trees) && Array.isArray(v.popular),
  );
  if (found.length !== 1) throw new Error(`${cls}: expected 1 talent calculator payload, found ${found.length}`);
  if (found[0].classSlug !== cls) throw new Error(`${cls}: payload is for ${found[0].classSlug}`);
  return found[0];
}

/** The server-rendered text index ("Arms (17 talents)" + one <li> per talent). */
function extractTextIndex(resolved, deref) {
  const trees = new Map();
  walkElements([...resolved.values()], deref, (el) => {
    const props = el[3] ?? {};
    if (el[1] !== 'div' || props.className !== 't-index-tree') return true;
    const entry = { heading: null, items: [] };
    walkElements(props.children, deref, (child) => {
      const p = child[3] ?? {};
      if (child[1] === 'h3') entry.heading = textContent(p.children, deref);
      if (child[1] === 'li') {
        const parts = {};
        walkElements(p.children, deref, (c) => {
          if (typeof c[1] === 'string') parts[c[1]] = parts[c[1]] ?? textContent(c[3]?.children, deref);
          return true;
        });
        entry.items.push({ id: child[2], className: p.className, ...parts });
        return false;
      }
      return true;
    });
    trees.set(el[2], entry);
    return false;
  });
  return trees;
}

function convertTalent(raw, treeId, cls) {
  const where = `${cls}/${raw.id}`;
  assertKnownKeys(raw, TALENT_KEYS, where);
  assertKnownKeys(raw.structure ?? {}, STRUCTURE_KEYS, `${where}.structure`);
  if (raw.classic) assertKnownKeys(raw.classic, CLASSIC_KEYS, `${where}.classic`);
  const tooltipRaw = raw.tooltip_metadata ?? {};
  assertKnownKeys(tooltipRaw, Object.keys(TOOLTIP_KEYS), `${where}.tooltip_metadata`);

  const tooltip = {};
  for (const [k, v] of Object.entries(tooltipRaw)) if (k !== 'passive') tooltip[TOOLTIP_KEYS[k]] = v;

  const classicVerified = raw.classic?.status === 'verified';
  const classicSource = raw.sources?.find((s) => s.type === 'classic_client_data');
  const classicSpellId = Number(/wowhead\.com\/classic\/spell=(\d+)/.exec(classicSource?.url ?? '')?.[1]) || null;
  const ranks = {
    forever: rankArray(raw.rank_texts, `${where}.rank_texts`),
    classic: classicVerified ? rankArray(raw.classic.rank_texts, `${where}.classic.rank_texts`) : null,
  };
  const estimated = rankArray(raw.estimated_rank_texts, `${where}.estimated_rank_texts`);
  if (estimated.length) ranks.foreverEstimated = estimated;

  const inForeverTree = raw.calculator_eligible === true && raw.context_only !== true;
  const tier = Number.isInteger(raw.structure?.tier) ? raw.structure.tier : -1;
  const col = Number.isInteger(raw.structure?.col) ? raw.structure.col : -1;

  return {
    talent: {
      id: raw.id,
      name: raw.name,
      icon: raw.icon,
      tree: treeId,
      tier,
      col,
      order: -1, // assigned per tree below
      maxRank: raw.max_rank,
      prerequisite: null, // resolved per tree below
      inForeverTree,
      changeKind: raw.reported_change_kind,
      summary: raw.summary ?? null,
      changes: raw.changes ?? [],
      passive: typeof tooltipRaw.passive === 'boolean' ? tooltipRaw.passive : null,
      tooltip: Object.keys(tooltip).length ? tooltip : null,
      previousName: raw.reported_previous_name ?? null,
      ranks,
      classic: classicVerified
        ? {
            name: raw.classic.name,
            maxRank: raw.classic.max_rank,
            tier: Number.isInteger(raw.classic.tier) ? raw.classic.tier : null,
            matchStatus: raw.classic.match_status,
            prerequisite: raw.classic.prerequisite ?? null,
          }
        : null,
      classicSpellId,
      evidenceStatus: raw.evidence_status,
      comparisonStatus: raw.comparison_status,
      discoveredAt: raw.discovered_at ?? null,
      sources: (raw.sources ?? []).map((s) => {
        const out = { url: s.url };
        if (s.title !== undefined) out.title = s.title;
        if (s.type !== undefined) out.type = s.type;
        return out;
      }),
    },
    prerequisiteName: raw.structure?.reported_prerequisite ?? null,
    siteEligible: null,
  };
}

// --- Build codes (mirrors src/data/talents/types.ts) ------------------------

/** Talents of each tree in build-code order: Forever-tree talents sorted by tier, then col. */
export function codeOrder(data) {
  return data.trees.map((tree) =>
    tree.talents.filter((t) => t.inForeverTree).sort((a, b) => a.tier - b.tier || a.col - b.col),
  );
}

export function decodeTalentCode(data, code, order = codeOrder(data)) {
  if (typeof code !== 'string' || !/^[0-9]*(-[0-9]*){0,2}$/.test(code)) {
    throw new Error(`Malformed talent code ${JSON.stringify(code)}`);
  }
  const ranks = {};
  code.split('-').forEach((segment, treeIndex) => {
    const talents = order[treeIndex];
    if (segment.length > talents.length) {
      throw new Error(`Talent code segment ${treeIndex} has ${segment.length} digits; tree has ${talents.length} talents`);
    }
    [...segment].forEach((digit, i) => {
      const rank = Number(digit);
      if (rank > talents[i].maxRank) {
        throw new Error(`${talents[i].name}: rank ${rank} exceeds max rank ${talents[i].maxRank}`);
      }
      if (rank) ranks[talents[i].id] = rank;
    });
  });
  return ranks;
}

export function encodeTalentCode(data, ranksById) {
  return codeOrder(data)
    .map((talents) => talents.map((t) => ranksById[t.id] ?? 0).join('').replace(/0+$/, ''))
    .join('-');
}

/** Returns rule violations (points cap, tier gates, prerequisites) for a set of ranks. */
export function validateTalentBuild(data, ranksById) {
  const problems = [];
  const byId = new Map(data.trees.flatMap((t) => t.talents).map((t) => [t.id, t]));
  let total = 0;
  for (const [id, rank] of Object.entries(ranksById)) {
    const t = byId.get(id);
    if (!t) {
      problems.push(`unknown talent ${id}`);
      continue;
    }
    total += rank;
    if (!t.inForeverTree) problems.push(`${t.name} is not in the Forever tree`);
    if (!Number.isInteger(rank) || rank < 0 || rank > t.maxRank) problems.push(`${t.name}: bad rank ${rank}`);
    if (!rank) continue;
    const tree = data.trees.find((tr) => tr.id === t.tree);
    const below = tree.talents.filter((x) => x.tier < t.tier).reduce((n, x) => n + (ranksById[x.id] ?? 0), 0);
    if (below < data.rules.pointsPerTier * t.tier) {
      problems.push(`${t.name} (tier ${t.tier + 1}) needs ${data.rules.pointsPerTier * t.tier} points in lower tiers, has ${below}`);
    }
    if (t.prerequisite && (ranksById[t.prerequisite.talentId] ?? 0) < t.prerequisite.rank) {
      problems.push(`${t.name} requires ${byId.get(t.prerequisite.talentId).name} at rank ${t.prerequisite.rank}`);
    }
  }
  if (total > data.rules.maxPoints) problems.push(`${total} points exceeds ${data.rules.maxPoints}`);
  return problems;
}

function pointsPerTree(data, ranks) {
  return data.trees.map((tree) => tree.talents.reduce((n, t) => n + (ranks[t.id] ?? 0), 0));
}

/** Decodes a popular build under a candidate order; returns the problems found. */
function checkBuildUnderOrder(data, build, order) {
  let ranks;
  try {
    ranks = decodeTalentCode(data, build.code, order);
  } catch (err) {
    return [err.message];
  }
  const problems = validateTalentBuild(data, ranks);
  const pts = pointsPerTree(data, ranks);
  if (pts.join('/') !== build.points.join('/')) problems.push(`points ${pts.join('/')} != ${build.points.join('/')}`);
  const main = data.trees.find((t) => t.id === build.tree);
  const capstones = main.talents.filter((t) => t.inForeverTree && t.tier === MAX_TIER);
  if (!capstones.some((t) => ranks[t.id])) problems.push(`no ${build.tree} tier-7 talent taken`);
  return problems;
}

async function scrapeClass(cls, refresh) {
  const sitePath = `/talents/${cls}`;
  const cacheFile = path.join(REPO_ROOT, '.cache/scrape/talents', `${cls}.html`);
  const { html, fetchedAt } = await fetchCached(sitePath, cacheFile, { refresh });
  const { resolved, deref } = decodeRscPage(html);
  const props = extractCalculatorProps(resolved, cls);
  const index = extractTextIndex(resolved, deref);
  const c = createChecker(cls);

  // --- Trees and talents ---------------------------------------------------
  const foreverBuilds = new Set();
  const classicBuilds = new Set();
  const trees = props.trees.map((rawTree, treeIndex) => {
    c.check(rawTree.tree_index === treeIndex, `${rawTree.id}: tree_index ${rawTree.tree_index} != position ${treeIndex}`);
    const converted = rawTree.talents.map((raw) => {
      c.check(raw.class === cls, `${raw.id}: class ${raw.class}`);
      c.check(raw.kind === 'talent', `${raw.id}: kind ${raw.kind}`);
      c.check(raw.tree_name === rawTree.name && raw.tree_index === treeIndex, `${raw.id}: tree mismatch`);
      for (const s of raw.sources ?? []) {
        if (s.type === 'client_data') foreverBuilds.add(buildOf(s.url) ?? buildOf(s.title));
      }
      if (raw.classic?.build) classicBuilds.add(raw.classic.build);
      return convertTalent(raw, rawTree.id, cls);
    });

    // The site's calculator eligibility: tier 0..6, col 0..3, max rank > 0, first talent at a cell.
    const cells = new Set();
    for (const x of converted) {
      const t = x.talent;
      const validCell = t.tier >= 0 && t.tier <= MAX_TIER && t.col >= 0 && t.col <= MAX_COL;
      x.siteEligible = validCell && Number.isInteger(t.maxRank) && t.maxRank > 0 && !cells.has(`${t.tier}:${t.col}`);
      if (validCell) cells.add(`${t.tier}:${t.col}`);
      c.check(
        !t.inForeverTree || x.siteEligible,
        `${t.id}: flagged calculator-eligible but has no valid unique cell (${t.tier},${t.col}) / max rank`,
      );
      c.check(t.ranks.forever.length === t.maxRank || !t.inForeverTree, `${t.id}: ${t.ranks.forever.length} rank texts for max rank ${t.maxRank}`);
      if (t.classic && t.ranks.classic) {
        c.check(t.ranks.classic.length === t.classic.maxRank, `${t.id}: classic rank texts != classic max rank`);
      }
      c.check(t.changes.every((ch) => typeof ch === 'string'), `${t.id}: non-string change entry`);
    }

    // Prerequisites: the talent in the same tree whose name matches, needed at its max rank.
    for (const x of converted) {
      if (!x.prerequisiteName) continue;
      const matches = converted.filter((y) => y.talent.name === x.prerequisiteName);
      if (!c.check(matches.length === 1, `${x.talent.id}: prerequisite "${x.prerequisiteName}" matches ${matches.length} talents`)) continue;
      const pre = matches[0].talent;
      x.talent.prerequisite = { talentId: pre.id, rank: pre.maxRank };
      if (x.talent.inForeverTree) {
        c.check(pre.inForeverTree, `${x.talent.id}: prerequisite ${pre.id} is not in the Forever tree`);
        // Usually a lower tier; Forever also has same-tier (horizontal) arrows.
        c.check(pre.id !== x.talent.id && pre.tier <= x.talent.tier, `${x.talent.id}: prerequisite ${pre.id} is in a higher tier`);
      }
    }

    const talents = converted.map((x) => x.talent);
    talents.sort((a, b) => Number(b.inForeverTree) - Number(a.inForeverTree) || a.tier - b.tier || a.col - b.col || a.id.localeCompare(b.id));
    talents.filter((t) => t.inForeverTree).forEach((t, i) => (t.order = i));

    return {
      id: rawTree.id,
      name: rawTree.name,
      icon: rawTree.icon,
      index: treeIndex,
      clientTreeId: rawTree.talents[0]?.tree_id ?? null,
      talents,
    };
  });

  // --- Cross-checks against the page ---------------------------------------
  for (const tree of trees) {
    const ids = tree.talents.map((t) => t.id);
    c.check(new Set(ids).size === ids.length, `${tree.id}: duplicate talent ids`);
    c.check(new Set(tree.talents.map((t) => t.tree)).size === 1, `${tree.id}: mixed tree ids`);
    const clientIds = new Set(props.trees[tree.index].talents.map((t) => t.tree_id));
    c.check(clientIds.size === 1, `${tree.id}: talents carry ${clientIds.size} client tree ids`);
    const cells = tree.talents.filter((t) => t.inForeverTree).map((t) => `${t.tier}:${t.col}`);
    c.check(new Set(cells).size === cells.length, `${tree.id}: two talents share a (tier, col)`);
    for (const t of tree.talents.filter((x) => x.inForeverTree)) {
      c.check(t.tier >= 0 && t.col >= 0 && t.order >= 0, `${t.id}: missing tier/col/order`);
    }

    const idx = index.get(tree.name);
    if (!c.check(idx, `${tree.id}: no text index section on the page`)) continue;
    const m = /^(.*) \((\d+) talents?\)$/.exec(idx.heading ?? '');
    c.check(m && m[1] === tree.name, `${tree.id}: index heading ${JSON.stringify(idx.heading)}`);
    c.check(m && Number(m[2]) === tree.talents.length, `${tree.id}: page says ${m?.[2]} talents, payload has ${tree.talents.length}`);
    c.check(idx.items.length === tree.talents.length, `${tree.id}: index lists ${idx.items.length} talents`);
    for (const item of idx.items) {
      const t = tree.talents.find((x) => x.id === item.id);
      if (!c.check(t, `${tree.id}: index lists unknown talent ${item.id}`)) continue;
      const small = /(\d+) ranks? · tier (\d+)/.exec(item.small ?? '');
      c.check(small && Number(small[1]) === t.maxRank && Number(small[2]) === t.tier + 1, `${t.id}: index says "${item.small}"`);
      c.check(item.className === `t-index-${t.changeKind}`, `${t.id}: index class ${item.className}`);
      if (INDEX_LABELS[t.changeKind]) c.check(item.em === INDEX_LABELS[t.changeKind], `${t.id}: index label ${item.em}`);
      c.check(item.strong?.trim() === t.name, `${t.id}: index name ${item.strong}`);
    }
  }

  c.check(foreverBuilds.size === 1 && !foreverBuilds.has(null), `Forever build ambiguous: ${[...foreverBuilds]}`);
  c.check(classicBuilds.size === 1, `Classic build ambiguous: ${[...classicBuilds]}`);

  const data = {
    meta: {
      source: new URL(sitePath, SITE).href,
      scrapedAt: fetchedAt,
      foreverBuild: [...foreverBuilds][0],
      classicBuild: [...classicBuilds][0],
      scraper: SCRAPER,
    },
    class: cls,
    rules: { maxPoints: MAX_POINTS, pointsPerTier: POINTS_PER_TIER, maxTier: MAX_TIER, maxCol: MAX_COL },
    codeFormat:
      'Wowhead-style string of three "-"-separated segments, one per tree in `trees` order. Each segment ' +
      'has one decimal digit per talent (its rank, 0..maxRank) for the talents with inForeverTree=true, in ' +
      '`order` = sorted by tier, then col (both 0-based); talents with order -1 are not encoded. Trailing ' +
      'zeros in a segment are trimmed; empty segments are kept, so a full code always has two "-" ' +
      '(e.g. "30305213132515201-05050103-"). Matches the site calculator, which reads it from ?b=<code>. ' +
      'Verified by decoding every popular build: per-tree points match, total <= 51, 5 points per tier, ' +
      'prerequisites at max rank, the main tree\'s tier-7 talent is taken, and re-encoding reproduces the code.',
    popularBuilds: props.popular.map((b) => ({ tree: b.tree, points: [...b.points], code: b.code })),
    trees,
  };

  // --- Build-code verification ---------------------------------------------
  const decodes = [];
  for (const build of data.popularBuilds) {
    c.check(trees.some((t) => t.id === build.tree), `popular build names unknown tree ${build.tree}`);
    const problems = checkBuildUnderOrder(data, build, codeOrder(data));
    for (const p of problems) c.fail(`popular ${build.tree} build ${build.code}: ${p}`);
    if (!problems.length) {
      const ranks = decodeTalentCode(data, build.code);
      c.check(encodeTalentCode(data, ranks) === build.code, `popular ${build.tree}: re-encode mismatch`);
      decodes.push({ build, ranks });
    }
  }
  // Negative controls: other plausible orders must not also explain every build.
  const alternatives = {
    'column-major (col, then tier)': data.trees.map((tree) =>
      tree.talents.filter((t) => t.inForeverTree).sort((a, b) => a.col - b.col || a.tier - b.tier),
    ),
    'alphabetical by name': data.trees.map((tree) =>
      tree.talents.filter((t) => t.inForeverTree).sort((a, b) => a.name.localeCompare(b.name)),
    ),
  };
  const controls = {};
  for (const [name, order] of Object.entries(alternatives)) {
    controls[name] = data.popularBuilds.filter((b) => checkBuildUnderOrder(data, b, order).length).length;
  }

  return { data, checker: c, decodes, controls };
}

async function main() {
  const refresh = hasFlag('--refresh');
  let failures = 0;
  for (const cls of CLASSES) {
    const { data, checker, decodes, controls } = await scrapeClass(cls, refresh);
    failures += checker.report();
    const file = path.join(OUT_DIR, `${cls}.json`);
    await writeJson(file, data);
    const counts = data.trees.map((t) => `${t.id} ${t.talents.filter((x) => x.inForeverTree).length}/${t.talents.length}`);
    console.log(`${cls}: ${counts.join(', ')} -> ${path.relative(REPO_ROOT, file)}`);
    for (const { build, ranks } of decodes) {
      const pts = pointsPerTree(data, ranks).join('/');
      console.log(`  popular ${build.tree} ${build.code} -> ${pts}, ${Object.keys(ranks).length} talents, OK`);
    }
    for (const [name, failed] of Object.entries(controls)) {
      console.log(`  control: ${name} order breaks ${failed}/${data.popularBuilds.length} popular builds`);
    }
  }
  if (failures) {
    console.error(`\n${failures} validation problem(s); JSON was written for inspection but is not trustworthy.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
