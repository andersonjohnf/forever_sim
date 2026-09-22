#!/usr/bin/env node
// Snapshot the Warrior, Druid and Paladin spellbooks from foreverchanges.pro
// into src/data/spells/<class>.json.
//
//   node scripts/scrape/spells.mjs [--refresh]
//
// Zero dependencies (Node >= 22). Raw HTML is cached under .cache/scrape/spells/
// and reused unless --refresh is passed. Only /spellbook/<class> and
// /class/<class> are fetched (robots.txt disallows /api/, /spell/, /search and
// /admin), sequentially and at least REQUEST_GAP_MS apart.
//
// Where the data comes from, per page:
//   * The page is a server-rendered Next.js App Router page. The structured data
//     lives in the React Server Components (RSC) "flight" stream embedded as
//     <script>self.__next_f.push([1,"..."])</script> chunks. We concatenate the
//     chunks, split the stream into rows (`<hex id>:<payload>`, with `T` rows
//     length-prefixed in UTF-8 bytes) and find the client component whose props
//     hold `book` (spellbook page) or `entries` (class changes page).
//   * RSC dedupes repeated objects as "$<row>:<prop>:<path>" strings; those
//     are resolved back into values.
//   * The one-line change summary and badge shown in the spell list are not in
//     the props (the client component derives them), so they are read from the
//     server-rendered HTML rows and joined to the payload by position + name.
//
// Output is deterministic: payload order is kept (it is the site's order),
// 2-space JSON, trailing newline, and scrapedAt comes from the cache metadata
// rather than the clock, so re-running from cache is a no-op diff.
//
// Exits non-zero when a count check fails, when an RSC reference survives, or
// when the visible list cannot be joined to the payload.

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "scrape", "spells");
const OUT_DIR = path.join(REPO_ROOT, "src", "data", "spells");
const BASE_URL = "https://foreverchanges.pro";
const USER_AGENT =
  "forever_sim-scraper/0.1 (+https://github.com/andersonjohnf/forever_sim; one-time data snapshot)";
const REQUEST_GAP_MS = 1500;
const CLASSES = ["warrior", "druid", "paladin"];
const SCRAPER = "scripts/scrape/spells.mjs";

const args = new Set(process.argv.slice(2));
const REFRESH = args.has("--refresh");
for (const a of args) {
  if (a !== "--refresh") {
    console.error(`Unknown argument: ${a}\nUsage: node ${SCRAPER} [--refresh]`);
    process.exit(2);
  }
}

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ---------------------------------------------------------------------------
// Fetching with an on-disk cache
// ---------------------------------------------------------------------------

let lastRequestAt = 0;

async function getPage(pagePath) {
  const url = `${BASE_URL}/${pagePath}`;
  if (/^\/?(api|spell|search|admin)(\/|$)/.test(pagePath)) {
    throw new Error(`Refusing to fetch ${url}: disallowed by robots.txt`);
  }
  const file = path.join(CACHE_DIR, `${pagePath.replaceAll("/", "_")}.html`);
  const metaFile = `${file}.meta.json`;
  if (!REFRESH && fs.existsSync(file) && fs.existsSync(metaFile)) {
    return { url, html: fs.readFileSync(file, "utf8"), meta: JSON.parse(fs.readFileSync(metaFile, "utf8")) };
  }
  const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  console.log(`GET ${url}`);
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" } });
  lastRequestAt = Date.now();
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  const html = await res.text();
  const meta = { url, status: res.status, fetchedAt: new Date().toISOString() };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, html);
  fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
  return { url, html, meta };
}

// ---------------------------------------------------------------------------
// RSC flight stream
// ---------------------------------------------------------------------------

/** Concatenate the self.__next_f.push chunks into the raw flight bytes. */
function extractFlight(html) {
  const re = /<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g;
  const parts = [];
  for (const m of html.matchAll(re)) {
    const chunk = JSON.parse(m[1]);
    if (chunk[0] === 1) parts.push(Buffer.from(chunk[1], "utf8"));
    else if (chunk[0] === 3) parts.push(Buffer.from(chunk[1], "base64"));
    // 0 = bootstrap, 2 = form state: no model data.
  }
  if (parts.length === 0) throw new Error("No self.__next_f.push chunks found");
  return Buffer.concat(parts);
}

/** Split the flight stream into rows: Map<id, string payload>. */
function parseRows(buf) {
  const rows = new Map();
  let i = 0;
  while (i < buf.length) {
    const colon = buf.indexOf(0x3a /* : */, i);
    if (colon < 0) break;
    const id = buf.subarray(i, colon).toString("latin1");
    if (!/^[0-9a-f]*$/.test(id)) throw new Error(`Bad RSC row id ${JSON.stringify(id)} at byte ${i}`);
    let j = colon + 1;
    if (buf[j] === 0x54 /* T */) {
      // Text row: T<hex byte length>,<bytes>  (no trailing newline)
      const comma = buf.indexOf(0x2c /* , */, j);
      const len = Number.parseInt(buf.subarray(j + 1, comma).toString("latin1"), 16);
      if (!Number.isFinite(len)) throw new Error(`Bad T row length for row ${id}`);
      rows.set(id, { kind: "text", value: buf.subarray(comma + 1, comma + 1 + len).toString("utf8") });
      i = comma + 1 + len;
      continue;
    }
    let nl = buf.indexOf(0x0a /* \n */, j);
    if (nl < 0) nl = buf.length;
    const payload = buf.subarray(j, nl).toString("utf8");
    // Keep the first definition of an id; later duplicates are hints/markers.
    if (!rows.has(id) || rows.get(id).kind !== "json") {
      const first = payload[0];
      const isJson = first === "[" || first === "{" || first === '"' || /^(-?\d|null$|true$|false$)/.test(payload);
      rows.set(id, isJson ? { kind: "json", raw: payload } : { kind: "other", raw: payload });
    }
    i = nl + 1;
  }
  return rows;
}

function rowValue(rows, id) {
  const row = rows.get(id);
  if (!row) throw new Error(`RSC row ${id} not found`);
  if (row.kind === "text") return row.value;
  if (row.kind !== "json") throw new Error(`RSC row ${id} is not a model row`);
  row.parsed ??= JSON.parse(row.raw);
  return row.parsed;
}

const isElement = (v) => Array.isArray(v) && v.length === 4 && v[0] === "$" && typeof v[1] === "string";

/** Resolve every RSC "$..." string inside `value` (deep copy). */
function resolveDeep(value, rows, stack = []) {
  if (typeof value === "string") return resolveString(value, rows, stack);
  if (Array.isArray(value)) {
    if (isElement(value)) {
      return ["$", value[1], value[2], resolveDeep(value[3], rows, stack)];
    }
    return value.map((v) => resolveDeep(v, rows, stack));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const r = resolveDeep(v, rows, stack);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  return value;
}

function resolveString(s, rows, stack) {
  if (s[0] !== "$" || s === "$") return s;
  const tag = s[1];
  if (tag === "$") return s.slice(1); // escaped literal "$..."
  if (s === "$undefined") return undefined;
  if (tag === "D") return s.slice(2); // Date -> ISO string
  if (tag === "n") return Number(s.slice(2)); // BigInt
  if (/^[0-9a-f]$/.test(tag)) {
    if (stack.includes(s)) throw new Error(`Cyclic RSC reference ${s}`);
    const [id, ...pathParts] = s.slice(1).split(":");
    let cur = rowValue(rows, id);
    for (const key of pathParts) {
      if (typeof cur === "string" && cur[0] === "$") cur = resolveString(cur, rows, [...stack, s]);
      if (isElement(cur)) {
        cur = key === "props" ? cur[3] : key === "type" ? cur[1] : key === "key" ? cur[2] : undefined;
      } else if (cur && typeof cur === "object") {
        cur = cur[key];
      } else {
        cur = undefined;
      }
      if (cur === undefined) throw new Error(`Unresolvable RSC reference ${s} (at ${key})`);
    }
    return resolveDeep(cur, rows, [...stack, s]);
  }
  // $L (lazy element), $@ (promise), $S (symbol), $F (server ref), ... are
  // left as-is here; the "$" audit on the output reports them if they leak.
  return s;
}

/** Find the props object of the first element (in any row) matching `pred`. */
function findComponentProps(rows, pred) {
  for (const [id, row] of rows) {
    if (row.kind !== "json") continue;
    const found = walkForElement(rowValue(rows, id), pred);
    if (found) return { rowId: id, props: found };
  }
  return null;
}

function walkForElement(v, pred) {
  if (Array.isArray(v)) {
    if (isElement(v) && v[3] && typeof v[3] === "object" && pred(v[3])) return v[3];
    for (const x of v) {
      const f = walkForElement(x, pred);
      if (f) return f;
    }
  } else if (v && typeof v === "object") {
    for (const x of Object.values(v)) {
      const f = walkForElement(x, pred);
      if (f) return f;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Server-rendered HTML (visible list + header counts)
// ---------------------------------------------------------------------------

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}

/** Inner HTML -> plain text (drops tags and React's <!-- --> text separators). */
function htmlText(s) {
  return decodeEntities(s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "")).trim();
}

function stripScripts(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/g, "");
}

function parseVisibleRows(html) {
  const start = html.indexOf('<div class="v2-rows">');
  if (start < 0) throw new Error("Spell list (.v2-rows) not found in HTML");
  const out = [];
  const re = /<button class="v2-row\b[^"]*"[^>]*>([\s\S]*?)<\/button>/g;
  for (const m of html.slice(start).matchAll(re)) {
    const inner = m[1];
    const text = inner.match(/<span class="v2-row-text"><strong>([\s\S]*?)<\/strong>(?:<span>([\s\S]*?)<\/span>)?<\/span>/);
    const tag = inner.match(/<span class="v2-tag\b[^"]*">([\s\S]*?)<\/span>/);
    const small = inner.match(/<span class="v2-row-meta">[\s\S]*?<small>([\s\S]*?)<\/small>/);
    if (!text) throw new Error(`Unrecognised spell row: ${inner.slice(0, 200)}`);
    out.push({
      name: htmlText(text[1]),
      summary: text[2] != null ? htmlText(text[2]) || null : null,
      badge: tag ? htmlText(tag[1]) || null : null,
      meta: small ? htmlText(small[1]) : null,
    });
  }
  return out;
}

const norm = (t) => t.replace(/\s+/g, " ").trim();

/**
 * The page's collapsed "N entries, as text" list: one <li> per spell (then
 * per missing spell) with the featured rank's Forever and Classic tooltips.
 */
function parseTextList(html) {
  const out = [];
  for (const m of html.matchAll(/<li class="xi-kind-[^"]*">([\s\S]*?)<\/li>/g)) {
    const li = m[1];
    const name = li.match(/<strong class="xi-name">([\s\S]*?)<\/strong>/);
    const spans = [...li.matchAll(/<span( class="xi-classic")?>([\s\S]*?)<\/span>/g)];
    out.push({
      name: name ? htmlText(name[1]) : null,
      forever: norm(htmlText(spans.find((x) => !x[1])?.[2] ?? "")),
      classic: norm(htmlText(spans.find((x) => x[1])?.[2] ?? "")),
    });
  }
  return out;
}

/** Numbers shown on the page: hero stats, tab menu and "Show" filter menu. */
function parseHeaderCounts(html) {
  const stats = {};
  const dl = html.match(/<dl class="v2-stats">([\s\S]*?)<\/dl>/);
  if (dl) {
    for (const m of dl[1].matchAll(/<dd>([\s\S]*?)<\/dd><dt>([\s\S]*?)<\/dt>/g)) {
      stats[htmlText(m[2])] = Number(htmlText(m[1]));
    }
  }
  const menu = (label) => {
    const nav = html.match(new RegExp(`<nav class="[^"]*" aria-label="${label}">([\\s\\S]*?)</nav>`));
    const items = [];
    if (nav) {
      for (const m of nav[1].matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)) {
        const [, label, count] = m[1].match(/^<span>([\s\S]*?)<\/span><small>([\s\S]*?)<\/small>$/) ?? [];
        if (label != null) items.push({ label: htmlText(label).replace(/^≡/, ""), count: Number(htmlText(count)) });
      }
    }
    return items;
  };
  return { stats, tabs: menu("Book tabs"), filters: menu("Show") };
}

// ---------------------------------------------------------------------------
// Field parsers
// ---------------------------------------------------------------------------

const unparsed = new Map(); // "field: raw" -> count

function noteUnparsed(field, raw) {
  const k = `${field}: ${raw}`;
  unparsed.set(k, (unparsed.get(k) ?? 0) + 1);
}

function parseCost(raw) {
  if (raw == null) return null;
  let m = raw.match(/^(\d+(?:\.\d+)?) (Rage|Energy|Mana|Health)$/i);
  if (m) return { raw, amount: Number(m[1]), resource: m[2].toLowerCase() };
  m = raw.match(/^(\d+(?:\.\d+)?)% of base (mana|health)$/i);
  if (m) return { raw, amount: null, resource: m[2].toLowerCase(), percentOfBase: Number(m[1]) };
  noteUnparsed("cost", raw);
  return { raw, amount: null, resource: null };
}

function parseCast(raw) {
  if (raw == null) return null;
  if (/^instant( cast)?$/i.test(raw)) return { raw, seconds: 0, channeled: false };
  let m = raw.match(/^(\d+(?:\.\d+)?) sec cast$/i);
  if (m) return { raw, seconds: Number(m[1]), channeled: false };
  if (/^channeled$/i.test(raw)) return { raw, seconds: null, channeled: true };
  m = raw.match(/^channeled \((\d+(?:\.\d+)?) sec\)$/i);
  if (m) return { raw, seconds: Number(m[1]), channeled: true };
  noteUnparsed("cast", raw);
  return { raw, seconds: null, channeled: false };
}

const UNIT_SECONDS = { sec: 1, min: 60, hr: 3600, hour: 3600, hours: 3600 };

function parseCooldown(raw) {
  if (raw == null) return null;
  const m = raw.match(/^(\d+(?:\.\d+)?) (sec|min|hr|hour|hours)(?: cooldown)?$/i);
  if (m) return { raw, seconds: Number(m[1]) * UNIT_SECONDS[m[2].toLowerCase()] };
  noteUnparsed("cooldown", raw);
  return { raw, seconds: null };
}

function parseRange(raw) {
  if (raw == null) return null;
  if (/^melee range$/i.test(raw)) return { raw, yards: null, melee: true };
  let m = raw.match(/^(\d+(?:\.\d+)?) yd range$/i);
  if (m) return { raw, yards: Number(m[1]), melee: false };
  m = raw.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?) yd range$/i);
  if (m) return { raw, yards: Number(m[2]), melee: false, minYards: Number(m[1]) };
  noteUnparsed("range", raw);
  return { raw, yards: null, melee: false };
}

const RANK_KEYS = new Set(["spell_id", "rank", "name", "cost", "range", "cast", "cooldown", "text", "level"]);

function mapRank(r, where) {
  if (r == null) return null;
  for (const k of Object.keys(r)) if (!RANK_KEYS.has(k)) fail(`${where}: unexpected rank field "${k}"`);
  const out = {
    spellId: r.spell_id ?? null,
    rankLabel: r.rank ?? null,
    level: r.level ?? null,
    text: r.text ?? null,
    cost: parseCost(r.cost ?? null),
    castTime: parseCast(r.cast ?? null),
    cooldown: parseCooldown(r.cooldown ?? null),
    range: parseRange(r.range ?? null),
  };
  if (r.name != null) out.name = r.name;
  return out;
}

// ---------------------------------------------------------------------------
// Building one class
// ---------------------------------------------------------------------------

const SPELL_KEYS = new Set([
  "id", "name", "tab", "icon", "level", "status", "reasons", "races", "rank", "max_rank", "ranks",
  "talent", "talent_only", "sub", "forever", "classic", "differences",
]);

async function buildClass(cls) {
  const book = await getPage(`spellbook/${cls}`);
  const changes = await getPage(`class/${cls}`);

  // --- spellbook payload ---
  const rows = parseRows(extractFlight(book.html));
  const found = findComponentProps(rows, (p) => p.book && Array.isArray(p.book.tabs));
  if (!found) throw new Error(`${cls}: no component with a "book" prop`);
  const props = resolveDeep(found.props, rows);
  const { foreverBuild, classicBuild, changeIds = {} } = props;
  if (props.classSlug !== cls) fail(`${cls}: payload classSlug is ${props.classSlug}`);

  // --- visible list + header counts ---
  const html = stripScripts(book.html);
  const visible = parseVisibleRows(html);
  const header = parseHeaderCounts(html);
  const textList = parseTextList(html);

  // --- class changes page (sources) ---
  const cRows = parseRows(extractFlight(changes.html));
  const cFound = findComponentProps(cRows, (p) => Array.isArray(p.entries) && p.initialClass === cls);
  const entries = cFound ? resolveDeep(cFound.props.entries, cRows) : [];
  if (!cFound) warn(`${cls}: class changes page has no "entries" prop; no sources merged`);
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const findEntry = (s) =>
    entryById.get(changeIds[s.name]) ??
    entryById.get(s.id) ??
    entryById.get(`spellbook-${s.id}`) ??
    entries.find((e) => e.name === s.name && e.tree_name === s.tab) ??
    null;

  const flat = props.book.tabs.flatMap((t) => t.spells);
  if (visible.length !== flat.length) {
    fail(`${cls}: ${visible.length} visible rows vs ${flat.length} payload spells`);
  }

  const spells = flat.map((s, i) => {
    const where = `${cls}/${s.id}`;
    for (const k of Object.keys(s)) if (!SPELL_KEYS.has(k)) fail(`${where}: unexpected spell field "${k}"`);
    const v = visible[i];
    if (!v || v.name !== s.name) fail(`${where}: visible row ${i} is "${v?.name}", expected "${s.name}"`);
    if (v?.meta && v.meta !== s.tab && !v.meta.startsWith(`${s.tab} ·`)) fail(`${where}: visible row tab "${v.meta}" != ${s.tab}`);

    const ranks = s.ranks.map((r, ri) => ({
      rank: r.rank ?? null,
      forever: mapRank(r.forever, `${where} rank[${ri}].forever`),
      classic: mapRank(r.classic, `${where} rank[${ri}].classic`),
      differences: (r.differences ?? []).map((d) => ({ field: d.field, text: d.text })),
    }));

    const spell = {
      id: s.id,
      name: s.name,
      tab: s.tab,
      icon: s.icon,
      url: `${book.url}#s=${s.id}`,
      level: s.level ?? null,
      status: s.status,
      badge: v?.badge ?? null,
      summary: v?.summary ?? null,
      reasons: s.reasons ?? [],
      races: s.races ?? null,
      maxRank: s.max_rank ?? null,
      featuredRank: s.rank ?? null,
      isTalent: s.talent === true,
      grantedByTalent: s.talent_only === true,
    };

    const e = findEntry(s);
    if (e) {
      spell.changelog = {
        id: e.id,
        kind: e.kind,
        changeKind: e.reported_change_kind ?? null,
        summary: e.summary ?? null,
        evidenceStatus: e.evidence_status ?? null,
        discoveredAt: e.discovered_at ?? null,
        url: `${changes.url}#e=${e.id}`,
      };
      if (Array.isArray(e.uncertainties) && e.uncertainties.length) spell.changelog.uncertainties = e.uncertainties;
      spell.sources = (e.sources ?? []).map((src) => {
        const o = { url: src.url };
        if (src.title != null) o.title = src.title;
        if (src.type != null) o.type = src.type;
        return o;
      });
    } else {
      warn(`${where}: no entry on /class/${cls}`);
    }
    spell.ranks = ranks;

    // Cross-check reference resolution against the page's plain-text list,
    // which prints the featured rank's Forever and Classic tooltips.
    const t = textList[i];
    if (!t || t.name !== s.name) {
      fail(`${where}: text-list entry ${i} is "${t?.name}", expected "${s.name}"`);
    } else {
      if (s.forever?.text && t.forever !== norm(s.forever.text)) {
        fail(`${where}: featured Forever text differs from the page text list`);
      }
      // The list omits the Classic line when the tooltip did not change.
      const classicText = s.classic?.text && norm(s.classic.text) !== norm(s.forever?.text ?? "") ? s.classic.text : null;
      if (t.classic !== (classicText ? norm(`Classic: ${classicText}`) : "")) {
        fail(`${where}: featured Classic text differs from the page text list: ${JSON.stringify(t.classic)} vs ${JSON.stringify(classicText)}`);
      }
    }
    return spell;
  });

  const missing = (props.book.missing ?? []).map((m) => ({
    name: m.name,
    tab: m.tab,
    icon: m.icon ?? null,
    level: m.level ?? null,
    rank: m.rank ?? null,
    wasTalent: m.talent_then === true,
    classic: mapRank(m.classic, `${cls}/missing/${m.name}`),
  }));

  if (textList.length !== spells.length + missing.length) {
    fail(`${cls}: page text list has ${textList.length} entries, expected ${spells.length} spells + ${missing.length} missing`);
  }
  missing.forEach((m, k) => {
    const t = textList[spells.length + k];
    if (t?.name !== m.name) fail(`${cls}: text-list entry for missing spell ${k} is "${t?.name}", expected "${m.name}"`);
  });

  const tabs = props.book.tabs.map((t) => ({ name: t.name, slug: t.slug, icon: t.icon, spellCount: t.spells.length }));

  // --- counts shown on the page, validated against the payload ---
  const count = (pred) => spells.filter(pred).length;
  const counts = {
    total: spells.length,
    new: count((s) => s.status === "new"),
    changed: count((s) => !["same", "new", "talent"].includes(s.status)),
    notInForever: missing.length,
  };
  counts.differentFromClassic = counts.new + counts.changed;

  const check = (label, shown, actual) => {
    if (shown === undefined) fail(`${cls}: page shows no "${label}" count`);
    else if (shown !== actual) fail(`${cls}: page says ${label} = ${shown}, payload gives ${actual}`);
  };
  check("New", header.stats.New, counts.new);
  check("Changed", header.stats.Changed, counts.changed);
  check("Not in Forever", header.stats["Not in Forever"], counts.notInForever);
  const filter = (l) => header.filters.find((f) => f.label === l)?.count;
  check("All spells", filter("All spells"), counts.total);
  check("Different from Classic", filter("Different from Classic"), counts.differentFromClassic);
  check("New in Forever", filter("New in Forever"), counts.new);
  // The tab menu lists "All tabs", each book tab, and "Not in Forever" when
  // some Classic spells are gone.
  check("All tabs", header.tabs.find((t) => t.label === "All tabs")?.count, counts.total);
  const missingTab = header.tabs.find((t) => t.label === "Not in Forever");
  if (missingTab || counts.notInForever) check("Not in Forever tab", missingTab?.count, counts.notInForever);
  const tabMenu = header.tabs.filter((t) => t.label !== "All tabs" && t.label !== "Not in Forever");
  if (tabMenu.map((t) => t.label).join("|") !== tabs.map((t) => t.name).join("|")) {
    fail(`${cls}: tab menu [${tabMenu.map((t) => t.label)}] != payload tabs [${tabs.map((t) => t.name)}]`);
  }
  for (const t of tabs) check(`tab ${t.name}`, tabMenu.find((x) => x.label === t.name)?.count, t.spellCount);

  const scrapedAt = book.meta.fetchedAt.replace(/\.\d{3}Z$/, "Z");
  return {
    meta: {
      source: book.url,
      changesSource: changes.url,
      scrapedAt,
      foreverBuild,
      classicBuild,
      scraper: SCRAPER,
    },
    class: cls,
    counts,
    tabs,
    spells,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Every string that still looks like an RSC reference. */
function findDollarStrings(v, at = "$", out = []) {
  if (typeof v === "string") {
    if (v.startsWith("$")) out.push(`${at} = ${JSON.stringify(v)}`);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => findDollarStrings(x, `${at}[${i}]`, out));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) findDollarStrings(x, `${at}.${k}`, out);
  }
  return out;
}

const results = [];
for (const cls of CLASSES) {
  try {
    results.push(await buildClass(cls));
  } catch (err) {
    fail(`${cls}: ${err.stack ?? err}`);
  }
}

for (const book of results) {
  const leaks = findDollarStrings(book);
  for (const l of leaks) fail(`${book.class}: unresolved RSC reference ${l}`);
}

if (errors.length === 0) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const book of results) {
    const file = path.join(OUT_DIR, `${book.class}.json`);
    fs.writeFileSync(file, `${JSON.stringify(book, null, 2)}\n`);
    const tabs = book.tabs.map((t) => `${t.name} ${t.spellCount}`).join(" / ");
    console.log(
      `${book.class}: ${book.counts.total} spells (${tabs}); ${book.counts.new} new, ${book.counts.changed} changed, ` +
        `${book.counts.notInForever} not in Forever -> ${path.relative(REPO_ROOT, file)}`,
    );
  }
}

if (unparsed.size) {
  console.log("\nStrings left unparsed (raw kept, numbers null):");
  for (const [k, n] of [...unparsed].sort()) console.log(`  ${k}  (x${n})`);
}
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} error(s); nothing written.`);
  process.exit(1);
}
