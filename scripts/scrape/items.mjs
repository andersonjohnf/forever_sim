#!/usr/bin/env node
// Snapshot the pre-raid item pool (Rare, equippable, required level 55-60 or item
// level 58+) from foreverchanges.pro into src/data/items/pre-bis.json.
//
//   node scripts/scrape/items.mjs [--refresh]
//
// Zero dependencies (Node >= 22). Raw responses are cached under
// .cache/scrape/items/ and reused unless --refresh is passed. Requests are
// sequential and at least REQUEST_GAP_MS apart; robots.txt disallows /api/,
// /spell/, /search and /admin, and getCached() refuses those paths.
//
// Where the data comes from:
//   * The /items page is client-rendered. Its component fetches one static JSON
//     file per tab: /items/new.json ("New in Forever"), /items/changed.json
//     ("Changed"), /items/same.json ("Unchanged") and /items/missing.json ("No
//     Forever data yet"). Each file is
//       { forever_build, classic_build, forever_build_date, shard,
//         sub: { <classId>: { <subclassId>: name } }, items: [...] }
//     with compact item keys: i id, n name, q quality, l item level, r required
//     level, s slot label, c class id, u subclass id, t tab ("new", "rebuilt",
//     "changed", "same", "missing"), k icon, x tooltip lines, y Classic tooltip
//     lines (changed items; rebuilt items' old Classic row), p weapon speed,
//     d weapon dps, o class restriction, e item set id, m name in Classic,
//     z old Classic id of a rebuilt item, g "row removed" flag. `shard` is not
//     used by the page.
//   * x holds the Forever tooltip for new/changed items and the *Classic Era*
//     tooltip for missing items (their Forever row is empty). same.json has no
//     tooltips at all, so unchanged items' lines come from their /item/<id> page.
//   * Every kept item's /item/<id> page is fetched (cached) for its "Where it
//     comes from" section (dungeon/boss/drop chance, as recorded for Classic)
//     and, for unchanged items, both tooltips. For new/changed/missing items the
//     page tooltips are cross-checked against the JSON lines.
//
// Doctrine (docs/doctrine.md section 2): Forever values where they exist,
// Classic Era values otherwise. Items without Forever data keep foreverData:
// false and statsFrom: "classic".
//
// Output is deterministic: items sorted by slot then id, 2-space JSON, trailing
// newline, and scrapedAt comes from the cache metadata rather than the clock.
// Exits non-zero when a consistency check fails.

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Filter: edit these to widen the dataset (e.g. QUALITIES = [3, 4] for epics).
// ---------------------------------------------------------------------------

// Kept: quality in QUALITIES AND equippable AND
//       (REQ_LEVEL[0] <= required level <= REQ_LEVEL[1] OR item level >= MIN_ITEM_LEVEL).
// The item-level branch also keeps items with no required level (the site's r = 0), which
// is how Classic quest rewards and boss drops such as Hand of Justice (requires 53),
// Blackhand's Breadth and Mark of Fordring (no requirement) get in. Decided by the user,
// 2026-09-22 (docs/data/items.md#filter).

/** Item qualities to keep: 2 Uncommon, 3 Rare, 4 Epic, 5 Legendary. */
const QUALITIES = [3];
/** Inclusive required-level range (the list page's `req=55-60`). */
const REQ_LEVEL = [55, 60];
/** Items at or above this item level are kept whatever their required level. null = off. */
const MIN_ITEM_LEVEL = 58;
/**
 * SoD guard: every kept item outside the "new" tab must have an id below this. Items only
 * Forever has are in "new" (ids 249385+ in this pool); the other tabs hold Classic Era client
 * rows, and that client also carries Season of Discovery items (ids 122270-191666 in the
 * same tab, mostly 19xxxx), which must never enter the pool. Original Classic ids end
 * around 24300.
 */
const MAX_CLASSIC_ITEM_ID = 25000;
/**
 * Items that pass the filter but can't be obtained, so they never enter the pool. Each
 * needs a reason. Recorded in meta.filter.excludedItemIds.
 */
const EXCLUDED_ITEMS = new Map([
  [20368, "Bland Bow of Steadiness: Classic test weapon, not obtainable"],
  [24071, "Bland Dagger: Classic test weapon, not obtainable"],
]);
/** Where the dataset is written, relative to the repo root. */
const OUT_FILE = "src/data/items/pre-bis.json";

const FILTER_RULE =
  `quality in [${QUALITIES.join(", ")}] AND equippable AND ` +
  `(${REQ_LEVEL[0]} <= required level <= ${REQ_LEVEL[1]}` +
  `${MIN_ITEM_LEVEL === null ? "" : ` OR item level >= ${MIN_ITEM_LEVEL} (any required level, including none)`})`;

// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "scrape", "items");
const BASE_URL = "https://foreverchanges.pro";
const USER_AGENT =
  "forever_sim-scraper/0.1 (+https://github.com/andersonjohnf/forever_sim; one-time data snapshot)";
const REQUEST_GAP_MS = 600;
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000];
const SCRAPER = "scripts/scrape/items.mjs";

/** [site tab key (JSON file name), our tab name] */
const TABS = [
  ["new", "new"],
  ["changed", "changed"],
  ["same", "unchanged"],
  ["missing", "missing"],
];

const IS_MAIN = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === import.meta.filename;
const REFRESH = IS_MAIN && process.argv.includes("--refresh");
if (IS_MAIN) {
  for (const a of process.argv.slice(2)) {
    if (a !== "--refresh") {
      console.error(`Unknown argument: ${a}\nUsage: node ${SCRAPER} [--refresh]`);
      process.exit(2);
    }
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
let requestCount = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET BASE_URL/<pagePath>, cached as .cache/scrape/items/<pagePath with / -> _>
 * (+ ".html" unless it already has an extension) plus a .meta.json sidecar.
 * Returns { status, body, meta }. 404s are cached too.
 */
async function getCached(pagePath) {
  const url = `${BASE_URL}/${pagePath}`;
  if (/^\/?(api|spell|search|admin)(\/|$)/.test(pagePath)) {
    throw new Error(`Refusing to fetch ${url}: disallowed by robots.txt`);
  }
  const base = pagePath.replaceAll("/", "_");
  const file = path.join(CACHE_DIR, /\.\w+$/.test(base) ? base : `${base}.html`);
  const metaFile = `${file}.meta.json`;
  if (!REFRESH && fs.existsSync(file) && fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    return { status: meta.status, body: fs.readFileSync(file, "utf8"), meta };
  }
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    requestCount++;
    let res;
    let error;
    try {
      res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    } catch (e) {
      error = e;
    }
    lastRequestAt = Date.now();
    const retryable = error || res.status === 429 || res.status >= 500;
    if (retryable && attempt < RETRY_DELAYS_MS.length) {
      const why = error ? error.message : `HTTP ${res.status}`;
      console.warn(`GET ${url} -> ${why}; retrying in ${RETRY_DELAYS_MS[attempt] / 1000}s`);
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (error) throw new Error(`GET ${url} -> ${error.message}`);
    if (!res.ok && res.status !== 404) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    const body = res.ok ? await res.text() : "";
    const meta = {
      url,
      status: res.status,
      fetchedAt: new Date().toISOString(),
      date: res.headers.get("date"),
    };
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, body);
    fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
    return { status: res.status, body, meta };
  }
}

// ---------------------------------------------------------------------------
// A small tolerant HTML parser (enough for the site's server-rendered markup)
// ---------------------------------------------------------------------------

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);
const RAW_TEXT_TAGS = new Set(["script", "style"]);

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return String.fromCodePoint(code);
    }
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return named[e.toLowerCase()] ?? m;
  });
}

/** Parse HTML into { tag, attrs, children } nodes; text nodes are strings. */
function parseHtml(html) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
  let last = 0;
  for (let m; (m = re.exec(html)); ) {
    if (m.index > last) stack.at(-1).children.push(decodeEntities(html.slice(last, m.index)));
    last = re.lastIndex;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      const idx = stack.findLastIndex((n) => n.tag === tag);
      if (idx > 0) stack.length = idx;
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const attrs = {};
      for (const a of m[3].matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
        attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
      }
      const node = { tag, attrs, children: [] };
      stack.at(-1).children.push(node);
      if (RAW_TEXT_TAGS.has(tag)) {
        const end = html.indexOf(`</${tag}`, last);
        const stop = end < 0 ? html.length : end;
        node.children.push(html.slice(last, stop));
        re.lastIndex = last = stop;
      } else if (!VOID_TAGS.has(tag) && !m[4]) {
        stack.push(node);
      }
    }
  }
  if (last < html.length) stack.at(-1).children.push(decodeEntities(html.slice(last)));
  return root;
}

const hasClass = (node, cls) => typeof node === "object" && (node.attrs.class ?? "").split(/\s+/).includes(cls);

function findAll(node, pred, out = []) {
  if (typeof node !== "object") return out;
  for (const c of node.children) {
    if (typeof c === "object") {
      if (pred(c)) out.push(c);
      findAll(c, pred, out);
    }
  }
  return out;
}
const findFirst = (node, pred) => findAll(node, pred)[0] ?? null;

function textOf(node) {
  if (typeof node === "string") return node;
  if (RAW_TEXT_TAGS.has(node.tag)) return "";
  return node.children.map(textOf).join("");
}
const clean = (s) => s.replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// /item/<id> page
// ---------------------------------------------------------------------------

/** One tooltip line: two top-level <span>s are joined with a tab, as in the JSON. */
function lineText(div) {
  const kids = div.children.filter((c) => typeof c === "object" || c.trim() !== "");
  if (kids.length >= 2 && kids.every((c) => typeof c === "object" && c.tag === "span")) {
    return kids.map((c) => clean(textOf(c))).join("\t");
  }
  return clean(textOf(div));
}

function parseItemPage(html) {
  const root = parseHtml(html);
  const tips = {};
  const labels = {};
  for (const tip of findAll(root, (n) => hasClass(n, "it-tip") && hasClass(n, "it-labelled"))) {
    const label = clean(textOf(findFirst(tip, (n) => hasClass(n, "it-label")) ?? ""));
    const side = /^Classic/.test(label) ? "classic" : /^Forever/.test(label) ? "forever" : null;
    if (!side) continue;
    labels[side] = label;
    if (hasClass(tip, "it-empty")) {
      tips[side] = null;
      continue;
    }
    const body = findFirst(tip, (n) => hasClass(n, "it-body"));
    tips[side] = body ? findAll(body, (n) => hasClass(n, "it-line")).map(lineText) : [];
  }
  let source = null;
  // "Where it comes from" (the page also has an "it-from it-near" section listing
  // other items of the same level, which is not a source).
  const from = findFirst(root, (n) => n.tag === "section" && hasClass(n, "it-from") && !hasClass(n, "it-near"));
  if (from) {
    source = findAll(from, (n) => hasClass(n, "it-from-group")).map((g) => {
      const h3 = findFirst(g, (n) => n.tag === "h3");
      const entries = findAll(g, (n) => n.tag === "li").map((li) => {
        const a = findFirst(li, (n) => n.tag === "a");
        const em = findFirst(li, (n) => n.tag === "em");
        const details = li.children
          .filter((c) => typeof c === "object" && c.tag === "span")
          .map((c) => clean(textOf(c)))
          .filter(Boolean);
        const chanceText = em ? clean(textOf(em)) : null;
        const pct = chanceText && /^([\d.]+)%$/.exec(chanceText);
        const name = a
          ? clean(textOf(a))
          : clean(li.children.filter((c) => typeof c === "string").join(" ")) || details.shift() || "";
        return {
          name,
          url: a?.attrs.href ? new URL(a.attrs.href, BASE_URL).href : null,
          details,
          chance: pct ? Number(pct[1]) : null,
          chanceText: chanceText && !pct ? chanceText : null,
          chanceLabel: em?.attrs.title ?? null,
        };
      });
      return { label: h3 ? clean(textOf(h3)) : "", entries };
    });
  }
  return { tips, labels, source };
}

// ---------------------------------------------------------------------------
// Tooltip line parser
// ---------------------------------------------------------------------------

const SCHOOLS = ["Arcane", "Fire", "Frost", "Holy", "Nature", "Shadow"];
const RESIST_SCHOOLS = ["Arcane", "Fire", "Frost", "Nature", "Shadow"];
const PRIMARY = { Strength: "strength", Agility: "agility", Stamina: "stamina", Intellect: "intellect", Spirit: "spirit" };
const lc = (s) => s[0].toLowerCase() + s.slice(1);
/** Creature types in "+N Attack Power Vs Undead" / "... when fighting Undead" lines. */
const CREATURE_TYPES = ["Beasts", "Demons", "Dragonkin", "Elementals", "Giants", "Humanoids", "Mechanical", "Undead"];
const creature = (s) => CREATURE_TYPES.find((t) => t.toLowerCase() === s.toLowerCase()) ?? null;

/** Weapon skill names as they appear in tooltips -> canonical key. */
const WEAPON_SKILLS = {
  swords: "Swords",
  "one-handed swords": "Swords",
  axes: "Axes",
  "one-handed axes": "Axes",
  maces: "Maces",
  "one-handed maces": "Maces",
  daggers: "Daggers",
  "fist weapons": "Fist Weapons",
  polearms: "Polearms",
  staves: "Staves",
  "two-handed swords": "Two-Handed Swords",
  "two-handed axes": "Two-Handed Axes",
  "two-handed maces": "Two-Handed Maces",
  bows: "Bows",
  guns: "Guns",
  crossbows: "Crossbows",
  thrown: "Thrown",
  wands: "Wands",
  unarmed: "Unarmed",
};

/**
 * Stat rules, applied to the text of an "Equip: ..." line or "(N) Set: ..."
 * bonus (prefix, trailing period and a stray "(N Min Cooldown)" removed).
 * Each rule returns a stats object, or { weaponSkill: [name, n] }.
 * Both the Classic Era wording and the Forever client's rating wording appear.
 */
const n = Number;
const STAT_RULES = [
  // Forever wording
  [/^\+(\d+) Spell Power$/, (m) => ({ spellPower: n(m[1]) })],
  [/^\+(\d+) Healing$/, (m) => ({ healing: n(m[1]) })],
  [/^\+(\d+) Spell Damage$/, (m) => ({ spellDamage: n(m[1]) })],
  [new RegExp(`^\\+(\\d+) (${SCHOOLS.join("|")}) Spell Damage$`), (m) => ({ [`${lc(m[2])}SpellDamage`]: n(m[1]) })],
  [/^\+(\d+) Spell Damage Vs (\w+)$/, (m) => creature(m[2]) && { [`spellDamageVs${creature(m[2])}`]: n(m[1]) }],
  [/^\+(\d+) Critical Strike Rating$/, (m) => ({ critRating: n(m[1]) })],
  [/^\+(\d+) Hit Rating$/, (m) => ({ hitRating: n(m[1]) })],
  [/^\+(\d+) Haste Rating$/, (m) => ({ hasteRating: n(m[1]) })],
  [/^\+(\d+) Expertise Rating$/, (m) => ({ expertiseRating: n(m[1]) })],
  [/^\+(\d+) Defense Rating$/, (m) => ({ defenseRating: n(m[1]) })],
  [/^\+(\d+) Dodge Rating$/, (m) => ({ dodgeRating: n(m[1]) })],
  [/^\+(\d+) Parry Rating$/, (m) => ({ parryRating: n(m[1]) })],
  [/^\+(\d+) Block Rating$/, (m) => ({ blockRating: n(m[1]) })],
  [/^\+(\d+) Block Value$/, (m) => ({ blockValue: n(m[1]) })],
  [/^\+(\d+) Armor Penetration$/, (m) => ({ armorPenetration: n(m[1]) })],
  [/^\+(\d+) Attack Power$/, (m) => ({ attackPower: n(m[1]) })],
  [/^\+(\d+) [Rr]anged Attack Power$/, (m) => ({ rangedAttackPower: n(m[1]) })],
  [/^\+(\d+) Attack Power in Cat, Bear, and Dire Bear forms only$/, (m) => ({ feralAttackPower: n(m[1]) })],
  [/^\+(\d+) Attack Power (?:Vs|when fighting) (\w+)$/, (m) => creature(m[2]) && { [`attackPowerVs${creature(m[2])}`]: n(m[1]) }],
  [/^\+(\d+) Mana Regeneration$/, (m) => ({ mp5: n(m[1]) })],
  [/^\+(\d+) Health Regeneration$/, (m) => ({ healthRegen: n(m[1]) })],
  [/^\+(\d+) Spell Penetration$/, (m) => ({ spellPenetration: n(m[1]) })],
  [/^\+(\d+) (?:Spell Resistance|All Resistances)$/, (m) => allResist(n(m[1]))],
  [/^\+(\d+) Weapon Damage$/, (m) => ({ weaponDamage: n(m[1]) })],
  [/^\+(\d+) Armor$/, (m) => ({ bonusArmor: n(m[1]) })],
  [/^([+-]\d+) (Strength|Agility|Stamina|Intellect|Spirit)$/, (m) => ({ [PRIMARY[m[2]]]: n(m[1]) })],
  [new RegExp(`^\\+(\\d+) (${RESIST_SCHOOLS.join("|")}) Resistance$`), (m) => ({ [`${lc(m[2])}Resistance`]: n(m[1]) })],
  [/^\+(\d+) (.+) Skill$/, (m) => weaponSkillRule(m[2], m[1])],
  // Classic Era wording
  [/^Increases damage and healing done by magical spells and effects by up to (\d+)$/, (m) => ({ spellPower: n(m[1]) })],
  [/^Increases healing done by spells and effects by up to (\d+)$/, (m) => ({ healing: n(m[1]) })],
  [
    /^Increases healing done by up to (\d+) and damage done by up to (\d+) for all magical spells and effects$/,
    (m) => ({ healing: n(m[1]), spellDamage: n(m[2]) }),
  ],
  [
    new RegExp(`^Increases damage done by (${SCHOOLS.join("|")}) spells and effects by up to (\\d+)$`),
    (m) => ({ [`${lc(m[1])}SpellDamage`]: n(m[2]) }),
  ],
  [
    /^Increases damage done to (\w+) by magical spells and effects by up to (\d+)$/,
    (m) => creature(m[1]) && { [`spellDamageVs${creature(m[1])}`]: n(m[2]) },
  ],
  [/^Improves your chance to get a critical strike by ([\d.]+)%$/, (m) => ({ crit: n(m[1]) })],
  [/^Improves your chance to get a critical strike with melee attacks by ([\d.]+)%$/, (m) => ({ meleeCrit: n(m[1]) })],
  [/^Improves your chance to get a critical strike with spells by ([\d.]+)%$/, (m) => ({ spellCrit: n(m[1]) })],
  [/^Improves your chance to hit by ([\d.]+)%$/, (m) => ({ hit: n(m[1]) })],
  [/^Improves your chance to hit with spells by ([\d.]+)%$/, (m) => ({ spellHit: n(m[1]) })],
  [/^Increases your chance to dodge an attack by ([\d.]+)%$/, (m) => ({ dodge: n(m[1]) })],
  [/^Increases your chance to parry an attack by ([\d.]+)%$/, (m) => ({ parry: n(m[1]) })],
  [/^Increases your chance to block attacks with a shield by ([\d.]+)%$/, (m) => ({ block: n(m[1]) })],
  [/^Increases the block value of your shield by (\d+)$/, (m) => ({ blockValue: n(m[1]) })],
  [/^Increased Defense \+(\d+)$/, (m) => ({ defense: n(m[1]) })],
  [/^Restores (\d+) mana per 5 sec$/, (m) => ({ mp5: n(m[1]) })],
  [/^Restores (\d+) health per 5 sec$/, (m) => ({ hp5: n(m[1]) })],
  [/^Decreases the magical resistances of your spell targets by (\d+)$/, (m) => ({ spellPenetration: n(m[1]) })],
  [/^Increased ([A-Za-z -]+) \+(\d+)$/, (m) => weaponSkillRule(m[1], m[2])],
];

/** Every key the parser can put in a stats object (mirrors `Stats` in src/data/items/types.ts). */
const STAT_KEYS = new Set([
  "strength", "agility", "stamina", "intellect", "spirit",
  "armor", "bonusArmor", "defense", "defenseRating", "dodge", "dodgeRating", "parry", "parryRating",
  "block", "blockRating", "blockValue",
  "arcaneResistance", "fireResistance", "frostResistance", "natureResistance", "shadowResistance",
  "attackPower", "rangedAttackPower", "feralAttackPower", ...CREATURE_TYPES.map((t) => `attackPowerVs${t}`),
  "hit", "crit", "meleeCrit", "hitRating", "critRating", "hasteRating", "expertiseRating", "armorPenetration",
  "weaponDamage",
  "spellPower", "spellDamage", "healing", ...SCHOOLS.map((s) => `${lc(s)}SpellDamage`),
  ...CREATURE_TYPES.map((t) => `spellDamageVs${t}`), "spellHit", "spellCrit", "spellPenetration",
  "mp5", "hp5", "healthRegen",
]);

function allResist(v) {
  return Object.fromEntries(RESIST_SCHOOLS.map((s) => [`${lc(s)}Resistance`, v]));
}
function weaponSkillRule(name, value) {
  const key = WEAPON_SKILLS[name.toLowerCase()];
  return key ? { weaponSkill: [key, n(value)] } : null;
}

/** Try to read a stat bonus from an Equip/Set text. Returns { stats?, weaponSkill? } or null. */
function parseStatText(text) {
  const t = text
    .replace(/\s*\(\d+ (?:Min|Sec|Hour|Hours|Min\.|Mins) Cooldown\)$/, "")
    .replace(/\.$/, "")
    .trim();
  for (const [re, fn] of STAT_RULES) {
    const m = re.exec(t);
    if (!m) continue;
    const r = fn(m);
    if (!r) continue;
    if (r.weaponSkill) return { weaponSkill: r.weaponSkill };
    return { stats: r };
  }
  return null;
}

function addStats(into, stats) {
  for (const [k, v] of Object.entries(stats)) into[k] = round2((into[k] ?? 0) + v);
}
const round2 = (x) => Math.round(x * 100) / 100;

/** Tooltip slot labels (first half of the "Slot\tType" line). */
const SLOT_LABELS = new Set([
  "Head", "Neck", "Shoulder", "Back", "Chest", "Shirt", "Tabard", "Wrist", "Hands", "Waist", "Legs", "Feet",
  "Finger", "Trinket", "One-Hand", "Main Hand", "Off Hand", "Held In Off-hand", "Two-Hand", "Ranged", "Thrown",
  "Relic", "Ammo", "Projectile",
]);
const STANDINGS = "Hated|Hostile|Unfriendly|Neutral|Friendly|Honored|Revered|Exalted";

function parseCooldown(text) {
  const m = /\((\d+(?:\.\d+)?) (Min|Sec|Hour|Hours|Day|Days) Cooldown\)/.exec(text);
  if (!m) return null;
  const mult = { Sec: 1, Min: 60, Hour: 3600, Hours: 3600, Day: 86400, Days: 86400 }[m[2]];
  return n(m[1]) * mult;
}

function parseCopper(text) {
  let c = 0;
  for (const m of text.matchAll(/(\d+)([gsc])/g)) c += n(m[1]) * { g: 10000, s: 100, c: 1 }[m[2]];
  return c;
}

/**
 * Parse tooltip lines. Every line is classified as "structured" (turned into a
 * field or stat), "verbatim" (kept as text in procs/useEffects/otherEquip or a
 * set bonus without stats) or "unparsed".
 */
function parseTooltip(lines) {
  const r = {
    binding: null,
    unique: false,
    uniqueEquipped: null,
    slotLabel: null,
    typeLabel: null,
    stats: {},
    weapon: null,
    dps: null,
    extraDamage: [],
    weaponSkill: {},
    procs: [],
    useEffects: [],
    otherEquip: [],
    setName: null,
    setSize: null,
    setBonuses: [],
    classes: null,
    races: null,
    reqLevel: null,
    requirements: [],
    sellPrice: null,
    durability: null,
    flavor: null,
    unparsed: [],
    coverage: { structured: 0, verbatim: 0, unparsed: 0 },
  };
  for (const line of lines) {
    let kind = "unparsed";
    for (const [re, handle] of LINE_RULES) {
      const m = re.exec(line);
      if (!m) continue;
      const k = handle(r, m, line);
      if (k) {
        kind = k;
        break;
      }
    }
    if (kind === "unparsed") r.unparsed.push(line);
    r.coverage[kind]++;
  }
  return r;
}

/**
 * Equip effects that trigger on an event are procs, not passive effects: "Chance on hit to
 * ...", "Chance to bathe your melee target ...", "2% chance on melee hit to gain 1 extra
 * attack" (Hand of Justice), "When struck in combat ...", "... has a 1% chance when struck",
 * "Deals N to N damage every time you block", "... when you are the victim of a critical
 * melee strike". "Gives you a 50% chance to avoid interruption ..." stays in otherEquip.
 */
const EQUIP_PROC = /^Chance\b|\bchance on\b|\bwhen struck\b|\bevery time you\b|\bwhen you are the victim\b/i;

/**
 * Tooltip line rules, tried in order: [regex, (result, match, line) => kind].
 * A handler returns "structured" or "verbatim", or null to let later rules try.
 */
const LINE_RULES = [
  [/^Binds when (picked up|equipped|used)$/, (r, m) => ((r.binding = { "picked up": "BoP", equipped: "BoE", used: "BoU" }[m[1]]), "structured")],
  [/^Soulbound$/, (r) => ((r.binding = "Soulbound"), "structured")],
  [/^Quest Item$/, (r) => ((r.binding = "Quest"), "structured")],
  [/^Unique$/, (r) => ((r.unique = true), "structured")],
  [
    /^Unique-Equipped(?:: (.+) \((\d+)\))?$/,
    (r, m) => {
      r.unique = true;
      r.uniqueEquipped = { group: m[1] ?? null, max: m[2] ? n(m[2]) : 1 };
      return "structured";
    },
  ],
  [
    /^([^\t]+)(?:\t(.+))?$/,
    (r, m) => {
      if (!SLOT_LABELS.has(m[1]) || r.slotLabel) return null;
      r.slotLabel = m[1];
      r.typeLabel = m[2] ?? null;
      return "structured";
    },
  ],
  [
    /^(\d+) - (\d+)(?: (\w+))? Damage\tSpeed (\d+\.\d+)$/,
    (r, m) => ((r.weapon = { min: n(m[1]), max: n(m[2]), school: m[3] ?? "Physical", speed: n(m[4]) }), "structured"),
  ],
  [
    /^Damage set by hand\tSpeed (\d+\.\d+)$/,
    (r, m) => ((r.weapon = { min: null, max: null, school: "Physical", speed: n(m[1]), setByHand: true }), "structured"),
  ],
  [/^\(([\d.]+) damage per second\)$/, (r, m) => ((r.dps = n(m[1])), "structured")],
  [/^\+(\d+) - (\d+) (\w+) Damage$/, (r, m) => (r.extraDamage.push({ min: n(m[1]), max: n(m[2]), school: m[3] }), "structured")],
  [/^(\d+) Armor$/, (r, m) => (addStats(r.stats, { armor: n(m[1]) }), "structured")],
  [/^(\d+) Block$/, (r, m) => (addStats(r.stats, { blockValue: n(m[1]) }), "structured")],
  [/^([+-]\d+) (Strength|Agility|Stamina|Intellect|Spirit)$/, (r, m) => (addStats(r.stats, { [PRIMARY[m[2]]]: n(m[1]) }), "structured")],
  [
    new RegExp(`^\\+(\\d+) (${RESIST_SCHOOLS.join("|")}) Resistance$`),
    (r, m) => (addStats(r.stats, { [`${lc(m[2])}Resistance`]: n(m[1]) }), "structured"),
  ],
  [/^Classes: (.+)$/, (r, m) => ((r.classes = m[1].split(/,\s*/)), "structured")],
  [/^Races: (.+)$/, (r, m) => ((r.races = m[1].split(/,\s*/)), "structured")],
  [/^Requires Level (\d+)$/, (r, m) => ((r.reqLevel = n(m[1])), "structured")],
  [
    new RegExp(`^Requires (.+) - (${STANDINGS})$`),
    (r, m, line) => (r.requirements.push({ kind: "reputation", text: line, faction: m[1], standing: m[2] }), "structured"),
  ],
  [
    /^Requires ([A-Za-z' ]+) \((\d+)\)$/,
    (r, m, line) => (r.requirements.push({ kind: "skill", text: line, skill: m[1], level: n(m[2]) }), "structured"),
  ],
  [/^Requires (.+)$/, (r, _m, line) => (r.requirements.push({ kind: "other", text: line }), "structured")],
  [/^Durability (\d+) \/ (\d+)$/, (r, m) => ((r.durability = n(m[2])), "structured")],
  [/^Sell Price: (.+)$/, (r, m) => ((r.sellPrice = parseCopper(m[1])), "structured")],
  [
    /^\((\d+)\) Set: (.+)$/,
    (r, m) => {
      const bonus = { pieces: n(m[1]), text: m[2] };
      const p = parseStatText(m[2]);
      if (p?.stats) bonus.parsed = sortKeys(p.stats);
      if (p?.weaponSkill) bonus.weaponSkill = Object.fromEntries([p.weaponSkill]);
      r.setBonuses.push(bonus);
      return p ? "structured" : "verbatim";
    },
  ],
  [
    /^(.+) \((\d+)\/(\d+)\)$/,
    (r, m) => {
      if (r.setName) return null;
      r.setName = m[1];
      r.setSize = n(m[3]);
      return "structured";
    },
  ],
  [/^"(.*)"$/, (r, m) => ((r.flavor = m[1]), "structured")],
  [
    /^Equip: (.+)$/,
    (r, m, line) => {
      const p = parseStatText(m[1]);
      if (p?.stats) {
        addStats(r.stats, p.stats);
        return "structured";
      }
      if (p?.weaponSkill) {
        const [k, v] = p.weaponSkill;
        r.weaponSkill[k] = (r.weaponSkill[k] ?? 0) + v;
        return "structured";
      }
      (EQUIP_PROC.test(m[1]) ? r.procs : r.otherEquip).push({ raw: line });
      return "verbatim";
    },
  ],
  [
    /^Use: (.+)$/,
    (r, m, line) => {
      const cd = parseCooldown(m[1]);
      r.useEffects.push(cd === null ? { raw: line } : { raw: line, cooldownSec: cd });
      return "verbatim";
    },
  ],
  [/^Chance on hit: /i, (r, _m, line) => (r.procs.push({ raw: line }), "verbatim")],
];

// ---------------------------------------------------------------------------
// Item normalization
// ---------------------------------------------------------------------------

const ITEM_CLASS = { 2: "Weapon", 4: "Armor" };
/** JSON slot label -> [normalized slot, paperdoll slots it can occupy]. */
const SLOTS = {
  Head: ["head", ["head"]],
  Neck: ["neck", ["neck"]],
  Shoulder: ["shoulder", ["shoulder"]],
  Back: ["back", ["back"]],
  Chest: ["chest", ["chest"]],
  Wrist: ["wrist", ["wrist"]],
  Hands: ["hands", ["hands"]],
  Waist: ["waist", ["waist"]],
  Legs: ["legs", ["legs"]],
  Feet: ["feet", ["feet"]],
  Finger: ["finger", ["finger"]],
  Trinket: ["trinket", ["trinket"]],
  "Two-Hand": ["twoHand", ["mainHand"]],
  "Main Hand": ["mainHand", ["mainHand"]],
  "One-Hand": ["oneHand", ["mainHand", "offHand"]],
  "Off Hand": ["offHand", ["offHand"]],
  Shield: ["shield", ["offHand"]],
  "Held In Off-hand": ["heldInOffHand", ["offHand"]],
  Ranged: ["ranged", ["ranged"]],
  Thrown: ["thrown", ["ranged"]],
  Relic: ["relic", ["ranged"]],
};
const SLOT_ORDER = [
  "head", "neck", "shoulder", "back", "chest", "wrist", "hands", "waist", "legs", "feet", "finger", "trinket",
  "twoHand", "mainHand", "oneHand", "offHand", "shield", "heldInOffHand", "ranged", "thrown", "relic",
];
const ARMOR_TYPES = { 1: "cloth", 2: "leather", 3: "mail", 4: "plate" };
/** Weapon subclass -> [weapon type, weapon skill it uses]. */
const WEAPON_TYPES = {
  0: ["axe", "Axes"],
  1: ["axe", "Two-Handed Axes"],
  2: ["bow", "Bows"],
  3: ["gun", "Guns"],
  4: ["mace", "Maces"],
  5: ["mace", "Two-Handed Maces"],
  6: ["polearm", "Polearms"],
  7: ["sword", "Swords"],
  8: ["sword", "Two-Handed Swords"],
  10: ["staff", "Staves"],
  13: ["fist", "Fist Weapons"],
  14: ["misc", null],
  15: ["dagger", "Daggers"],
  16: ["thrown", "Thrown"],
  17: ["spear", null],
  18: ["crossbow", "Crossbows"],
  19: ["wand", "Wands"],
  20: ["fishingPole", null],
};

/** Is this JSON row an equippable weapon/armor piece we keep? */
function isEquippable(it) {
  if (it.c !== 2 && it.c !== 4) return false; // weapons and armor only
  if (it.c === 4 && it.u === 5) return false; // cosmetic
  if (it.c === 2 && (it.u === 14 || it.u === 20)) return false; // misc weapons, fishing poles
  return Boolean(it.s && SLOTS[it.s]); // no shirts, tabards, ammo, bags or slotless rows
}

function buildWeapon(p, fallback, it, skill) {
  if (!p.weapon && !fallback?.weapon) return null;
  const notes = [];
  let src = p;
  if (!p.weapon || p.weapon.setByHand) {
    if (fallback?.weapon && !fallback.weapon.setByHand) {
      src = fallback;
      notes.push("The Forever tooltip gives no damage range (\"Damage set by hand\"); min/max/dps are Classic Era's.");
    } else if (!p.weapon) return null;
  }
  const w = src.weapon;
  const dps = src.dps ?? (w.min !== null ? round2((w.min + w.max) / 2 / w.speed) : it.d ?? null);
  const out = { min: w.min, max: w.max, speed: w.speed, dps, school: w.school, skill };
  if (src.extraDamage.length) out.extraDamage = src.extraDamage;
  return { weapon: out, notes };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Filter: ${FILTER_RULE}`);

  // 1. Tab JSON files -------------------------------------------------------
  const tabData = {};
  const usedMeta = [];
  for (const [key, tab] of TABS) {
    const { status, body, meta } = await getCached(`items/${key}.json`);
    if (status !== 200) throw new Error(`/items/${key}.json -> HTTP ${status}`);
    tabData[tab] = JSON.parse(body);
    usedMeta.push(meta);
  }
  const builds = new Set(TABS.map(([, t]) => `${tabData[t].forever_build}|${tabData[t].classic_build}|${tabData[t].forever_build_date}`));
  if (builds.size !== 1) fail(`Tab files disagree on builds: ${[...builds].join(", ")}`);
  const { forever_build: foreverBuild, classic_build: classicBuild, forever_build_date: foreverBuildDate } =
    tabData.new;

  // 2. Filter ----------------------------------------------------------------
  const allRows = TABS.flatMap(([, t]) => tabData[t].items.map((it) => ({ ...it, tab: t, sub: tabData[t].sub })));
  const seen = new Map();
  for (const it of allRows) {
    if (seen.has(it.i)) fail(`Item ${it.i} appears in both ${seen.get(it.i)} and ${it.tab}`);
    seen.set(it.i, it.tab);
  }
  // r is 0 (occasionally null) when an item has no required level.
  const levelOk = (it) =>
    ((it.r ?? 0) >= REQ_LEVEL[0] && (it.r ?? 0) <= REQ_LEVEL[1]) || (MIN_ITEM_LEVEL !== null && it.l >= MIN_ITEM_LEVEL);
  const inRange = allRows.filter((it) => QUALITIES.includes(it.q) && levelOk(it));
  const kept = inRange.filter((it) => isEquippable(it) && !EXCLUDED_ITEMS.has(it.i));
  // SoD guard (see MAX_CLASSIC_ITEM_ID): refuse to write anything if it trips.
  const suspect = kept.filter((it) => it.tab !== "new" && it.i >= MAX_CLASSIC_ITEM_ID);
  if (suspect.length) {
    throw new Error(
      `SoD guard: ${suspect.length} non-"new" item(s) with id >= ${MAX_CLASSIC_ITEM_ID} ` +
        `(not an original Classic id, possibly Season of Discovery): ` +
        suspect.map((it) => `${it.i} ${it.n} (${it.tab})`).join(", "),
    );
  }
  const dropped = inRange.filter((it) => !isEquippable(it) || EXCLUDED_ITEMS.has(it.i));
  console.log(`${allRows.length} rows; ${inRange.length} match quality/level; ${kept.length} equippable kept`);

  // 3. Item pages ------------------------------------------------------------
  const pages = new Map();
  let fetched = 0;
  const before = requestCount;
  for (const it of kept) {
    const res = await getCached(`item/${it.i}`);
    usedMeta.push(res.meta);
    pages.set(it.i, res);
    if (res.status !== 200) warn(`/item/${it.i} -> HTTP ${res.status}`);
    if (requestCount > before && ++fetched % 50 === 0) console.log(`  fetched ${fetched} item pages…`);
  }
  if (requestCount > before) console.log(`Fetched ${requestCount - before} item pages`);

  // 4. Parse -------------------------------------------------------------------
  const setMembers = new Map();
  const setNamesSeen = new Map();
  for (const it of allRows) {
    if (!it.e) continue;
    if (!setMembers.has(it.e)) setMembers.set(it.e, new Set());
    setMembers.get(it.e).add(it.i);
    const nameLine = (it.x ?? []).map((l) => /^(.+) \(\d+\/(\d+)\)$/.exec(l)).find(Boolean);
    if (nameLine && !setNamesSeen.has(it.e)) setNamesSeen.set(it.e, nameLine[1]);
  }

  const items = [];
  const sets = new Map();
  const coverage = { lines: 0, structured: 0, verbatim: 0, unparsed: 0 };
  const unparsedLines = new Map();
  const mismatches = [];

  for (const it of kept) {
    const page = pages.get(it.i);
    const { tips, labels, source } =
      page.status === 200 ? parseItemPage(page.body) : { tips: {}, labels: {}, source: null };
    // "Forever beta, seen in game": the beta client has no stats for the item and the
    // site shows what players recorded in game (Dungeon Set 1 pieces in this snapshot).
    const seenInGame = /seen in game/i.test(labels.forever ?? "");

    // Which lines are Forever's and which are Classic's.
    let forever;
    let classic;
    if (it.tab === "new") [forever, classic] = [it.x, it.y ?? null];
    else if (it.tab === "changed") [forever, classic] = [it.x, it.y];
    else if (it.tab === "unchanged") [forever, classic] = [tips.forever ?? null, tips.classic ?? null];
    else [forever, classic] = [null, it.x];
    if (!forever && !classic) {
      fail(`${it.i} ${it.n}: no tooltip lines (tab ${it.tab})`);
      continue;
    }
    // Cross-check the JSON lines against the item page. The page renders "seen in game"
    // tooltips without "Equip: " prefixes, sell price or (for some robes) armor and in
    // another order, so those are compared loosely.
    const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const loose = (ls) =>
      (ls ?? [])
        .filter((l) => !/^(Sell Price: |\d+ Armor$)/.test(l))
        .map((l) => l.replace(/^Equip: /, "").replace(/\.$/, ""))
        .sort();
    const notes = [];
    if (page.status === 200) {
      if (seenInGame) {
        if (!same(loose(tips.forever), loose(forever))) mismatches.push([it.i, "forever", tips.forever, forever]);
        const armor = forever.find((l) => /^\d+ Armor$/.test(l));
        if (armor && !tips.forever.includes(armor))
          notes.push(`The item page's seen-in-game tooltip has no armor line; "${armor}" is from the site's item data.`);
      } else if (it.tab !== "unchanged" && !same(tips.forever, forever)) mismatches.push([it.i, "forever", tips.forever, forever]);
      if (it.tab !== "unchanged" && it.t !== "rebuilt" && !same(tips.classic, classic))
        mismatches.push([it.i, "classic", tips.classic, classic]);
      if (it.tab === "unchanged" && !same(tips.forever, tips.classic))
        mismatches.push([it.i, "unchanged-differs", tips.classic, tips.forever]);
    }

    const foreverData = forever !== null;
    const statsFrom = foreverData ? "forever" : "classic";
    const p = parseTooltip(foreverData ? forever : classic);
    const pc = foreverData && classic && it.tab !== "unchanged" ? parseTooltip(classic) : null;
    for (const k of [...Object.keys(p.stats), ...p.setBonuses.flatMap((b) => Object.keys(b.parsed ?? {}))])
      if (!STAT_KEYS.has(k)) fail(`${it.i} ${it.n}: stat key "${k}" is missing from STAT_KEYS / types.ts`);
    coverage.lines += p.coverage.structured + p.coverage.verbatim + p.coverage.unparsed;
    for (const k of ["structured", "verbatim", "unparsed"]) coverage[k] += p.coverage[k];
    for (const l of p.unparsed) {
      const shape = l.replace(/\d+(\.\d+)?/g, "N");
      const e = unparsedLines.get(shape) ?? { count: 0, example: l, id: it.i };
      e.count++;
      unparsedLines.set(shape, e);
    }

    // Consistency checks against the JSON row.
    if (p.reqLevel !== null && p.reqLevel !== it.r) warn(`${it.i} ${it.n}: tooltip level ${p.reqLevel} vs row ${it.r}`);
    const expectedSlotLabel = it.s === "Shield" ? "Off Hand" : it.s;
    if (p.slotLabel !== expectedSlotLabel) warn(`${it.i} ${it.n}: tooltip slot "${p.slotLabel}" vs row "${it.s}"`);
    if (it.o && !(p.classes ?? []).includes(it.o)) warn(`${it.i} ${it.n}: row class ${it.o} vs tooltip ${p.classes}`);
    if (Boolean(it.e) !== Boolean(p.setName)) {
      if (it.e) notes.push(`Part of item set ${it.e}, but this tooltip shows no set lines.`);
      else warn(`${it.i} ${it.n}: set line "${p.setName}" but no set id`);
    }

    const [slot, equipSlots] = SLOTS[it.s];
    const sub = it.sub?.[it.c]?.[it.u] ?? `Subclass ${it.u}`;
    const wt = it.c === 2 ? WEAPON_TYPES[it.u] ?? [sub.toLowerCase(), null] : null;
    const built = it.c === 2 ? buildWeapon(p, pc, it, wt[1]) : null;
    if (it.c === 2 && !built) fail(`${it.i} ${it.n}: weapon without a damage line`);
    if (built) {
      notes.push(...built.notes);
      if (it.p && Math.abs(built.weapon.speed - it.p) > 0.001) warn(`${it.i}: speed ${built.weapon.speed} vs row ${it.p}`);
      if (it.d && built.weapon.dps !== null && Math.abs(built.weapon.dps - it.d) > 0.051)
        warn(`${it.i}: dps ${built.weapon.dps} vs row ${it.d}`);
    }
    const classicSide =
      pc && (it.tab === "changed" || it.t === "rebuilt")
        ? {
            stats: sortKeys(pc.stats),
            weapon: it.c === 2 ? buildWeapon(pc, null, it, wt[1])?.weapon ?? null : null,
            weaponSkill: Object.keys(pc.weaponSkill).length ? sortKeys(pc.weaponSkill) : null,
          }
        : null;

    const setId = it.e ? String(it.e) : null;
    if (setId) {
      let s = sets.get(setId);
      if (!s) {
        s = {
          name: p.setName ?? setNamesSeen.get(it.e) ?? null,
          itemIds: [...setMembers.get(it.e)].sort((a, b) => a - b),
          bonuses: [],
          bonusesFrom: null,
          sizes: new Set(),
        };
        sets.set(setId, s);
      }
      if (p.setName && s.name !== p.setName) {
        if (s.name && statsFrom === "classic") warn(`set ${setId}: name "${p.setName}" vs "${s.name}"`);
        else s.name = p.setName;
      }
      if (p.setSize) s.sizes.add(p.setSize);
      if (p.setBonuses.length) {
        const better = s.bonusesFrom === null || (s.bonusesFrom === "classic" && statsFrom === "forever");
        if (better) {
          s.bonuses = p.setBonuses;
          s.bonusesFrom = statsFrom;
        } else if (s.bonusesFrom === statsFrom && JSON.stringify(s.bonuses) !== JSON.stringify(p.setBonuses)) {
          warn(`set ${setId} ${s.name}: pieces disagree on bonuses (${it.i})`);
        }
      }
    }

    items.push({
      id: it.i,
      name: it.n,
      icon: it.k,
      quality: it.q,
      itemLevel: it.l,
      reqLevel: it.r,
      tab: it.tab,
      rebuiltFromId: it.z ?? null,
      classicName: it.m ?? null,
      foreverData,
      foreverSource: foreverData ? (seenInGame ? "seenInGame" : "client") : null,
      statsFrom,
      slot,
      equipSlots,
      itemClass: ITEM_CLASS[it.c],
      itemSubclass: sub,
      armorType: it.c === 4 ? ARMOR_TYPES[it.u] ?? null : null,
      weaponType: wt ? wt[0] : null,
      binding: p.binding,
      unique: p.unique,
      uniqueEquipped: p.uniqueEquipped,
      classes: p.classes,
      requirements: p.requirements,
      stats: sortKeys(p.stats),
      weapon: built?.weapon ?? null,
      weaponSkill: Object.keys(p.weaponSkill).length ? sortKeys(p.weaponSkill) : null,
      procs: p.procs,
      useEffects: p.useEffects,
      otherEquip: p.otherEquip,
      setId,
      source: source && source.length ? source : null,
      sellPrice: p.sellPrice,
      flavor: p.flavor,
      classic: classicSide,
      notes,
      unparsed: p.unparsed,
      tooltip: { forever, classic },
    });
  }

  // Page vs JSON cross-check: a difference means the site changed its data or markup.
  if (mismatches.length) {
    fail(`${mismatches.length} tooltip(s) differ between the item page and the JSON; first few:`);
    for (const [id, side, a, b] of mismatches.slice(0, 5)) fail(`  ${id} ${side}: page ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }

  items.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.id - b.id);

  // Rating conversions seen on changed items (all qualities and levels).
  const ratingConversions = measureRatingConversions(tabData.changed.items);

  const setsOut = {};
  for (const [id, s] of [...sets.entries()].sort(([a], [b]) => Number(a) - Number(b))) {
    if (!s.name) fail(`set ${id} has no name`);
    const sizes = [...s.sizes];
    if (sizes.length > 1) warn(`set ${id} ${s.name}: tooltips disagree on its size (${sizes.join(", ")})`);
    const size = sizes.length ? Math.max(...sizes) : null;
    if (size !== null && size !== s.itemIds.length)
      warn(`set ${id} ${s.name}: tooltip says ${size} pieces, the site's item rows have ${s.itemIds.length}`);
    setsOut[id] = { name: s.name, size, itemIds: s.itemIds, bonuses: s.bonuses, bonusesFrom: s.bonusesFrom };
  }

  const byTab = Object.fromEntries(TABS.map(([, t]) => [t, items.filter((i) => i.tab === t).length]));
  const scrapedAt = usedMeta.map((m) => m.fetchedAt).sort().at(-1);
  const out = {
    meta: {
      source: `${BASE_URL}/items?quality=${QUALITIES.join(",")}`,
      dataFiles: TABS.map(([key]) => `${BASE_URL}/items/${key}.json`),
      scrapedAt,
      foreverBuild,
      classicBuild,
      foreverBuildDate,
      scraper: SCRAPER,
      filter: {
        rule: FILTER_RULE,
        qualities: QUALITIES,
        reqLevel: REQ_LEVEL,
        minItemLevel: MIN_ITEM_LEVEL,
        equippableOnly: true,
        maxClassicItemId: MAX_CLASSIC_ITEM_ID,
        excludedItemIds: Object.fromEntries(EXCLUDED_ITEMS),
      },
      counts: { items: items.length, byTab, sets: Object.keys(setsOut).length },
      parseCoverage: coverage,
      ratingConversions,
    },
    sets: setsOut,
    items,
  };

  report({ items, dropped, coverage, unparsedLines, ratingConversions, setsOut });
  if (errors.length) {
    console.error(`\nNot writing ${OUT_FILE}: ${errors.length} check(s) failed.`);
    return;
  }
  const outPath = path.join(REPO_ROOT, OUT_FILE);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nWrote ${OUT_FILE}: ${items.length} items, ${Object.keys(setsOut).length} sets`);
}

/** Sort an object's keys so the JSON is stable regardless of parse order. */
function sortKeys(o) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * For each Forever rating, look at changed items whose Classic tooltip has
 * exactly one of the stats it replaced and whose Forever tooltip has the rating
 * instead, and tally rating / old value.
 */
function measureRatingConversions(rows) {
  const PAIRS = [
    ["critRating", ["crit", "meleeCrit", "spellCrit"], "rating per 1% critical strike chance"],
    ["hitRating", ["hit", "spellHit"], "rating per 1% chance to hit"],
    ["dodgeRating", ["dodge"], "rating per 1% dodge"],
    ["parryRating", ["parry"], "rating per 1% parry"],
    ["blockRating", ["block"], "rating per 1% block"],
    ["defenseRating", ["defense"], "rating per point of Defense"],
  ];
  const tallies = Object.fromEntries(PAIRS.map(([k]) => [k, new Map()]));
  for (const row of rows) {
    if (!row.x || !row.y) continue;
    const f = parseTooltip(row.x).stats;
    const c = parseTooltip(row.y).stats;
    for (const [rating, olds] of PAIRS) {
      const present = olds.filter((k) => c[k]);
      if (!f[rating] || c[rating] || present.length !== 1 || olds.some((k) => f[k])) continue;
      const ratio = round2(f[rating] / c[present[0]]);
      tallies[rating].set(ratio, (tallies[rating].get(ratio) ?? 0) + 1);
    }
  }
  const out = {};
  for (const [rating, olds, unit] of PAIRS) {
    const t = [...tallies[rating].entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    if (!t.length) continue;
    out[rating] = {
      replaces: olds,
      unit,
      ratingPerUnit: t[0][0],
      samples: t[0][1],
      otherRatios: Object.fromEntries(t.slice(1).map(([r, c]) => [String(r), c])),
    };
  }
  return out;
}

function report({ items, dropped, coverage, unparsedLines, ratingConversions, setsOut }) {
  const tally = (f) => {
    const m = new Map();
    for (const i of items) {
      const k = f(i);
      if (k !== null && k !== undefined) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  };
  const show = (title, rows) => console.log(`\n${title}\n${rows.map(([k, v]) => `  ${k}: ${v}`).join("\n")}`);
  show("By tab", tally((i) => i.tab));
  show("By slot", tally((i) => i.slot));
  show("By armor type", tally((i) => i.armorType));
  show("By weapon type", tally((i) => (i.weaponType ? `${i.weaponType} (${i.slot})` : null)));
  show("By item subclass", tally((i) => `${i.itemClass}/${i.itemSubclass}`));
  show("Stats from", tally((i) => i.statsFrom));
  show("Source labels", tally((i) => (i.source ? i.source.map((g) => g.label).join(" + ") : "(none)")));
  show(
    "Dropped (in quality/level range but not equippable)",
    (() => {
      const m = new Map();
      for (const d of dropped) {
        const k = `${d.sub?.[d.c]?.[d.u] ?? d.c}${d.s ? ` (${d.s})` : ""}`;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    })(),
  );
  const pct = (x) => `${((100 * x) / coverage.lines).toFixed(1)}%`;
  console.log(
    `\nParse coverage over ${coverage.lines} lines: structured ${coverage.structured} (${pct(coverage.structured)}), ` +
      `verbatim ${coverage.verbatim} (${pct(coverage.verbatim)}), unparsed ${coverage.unparsed} (${pct(coverage.unparsed)})`,
  );
  const up = [...unparsedLines.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [shape, e] of up.slice(0, 25)) console.log(`  ${e.count}x ${JSON.stringify(shape)} e.g. ${e.id}`);
  const oe = new Map();
  for (const i of items) for (const o of i.otherEquip) {
    const s = o.raw.replace(/\d+(\.\d+)?/g, "N");
    oe.set(s, (oe.get(s) ?? 0) + 1);
  }
  console.log("\nMost common verbatim Equip lines");
  for (const [s, c] of [...oe.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${c}x ${s}`);
  const sb = new Map();
  for (const s of Object.values(setsOut)) for (const b of s.bonuses) if (!b.parsed) {
    const k = b.text.replace(/\d+(\.\d+)?/g, "N");
    sb.set(k, (sb.get(k) ?? 0) + 1);
  }
  console.log(`\nSet bonuses without stats: ${[...sb.values()].reduce((a, b) => a + b, 0)}`);
  console.log("\nRating conversions (changed items)");
  for (const [k, v] of Object.entries(ratingConversions))
    console.log(`  ${k}: ${v.ratingPerUnit} ${v.unit} (${v.samples} samples; others ${JSON.stringify(v.otherRatios)})`);
  const statKeys = new Set();
  for (const i of items) for (const k of Object.keys(i.stats)) statKeys.add(k);
  for (const s of Object.values(setsOut)) for (const b of s.bonuses) for (const k of Object.keys(b.parsed ?? {})) statKeys.add(k);
  console.log(`\nStat keys emitted (${statKeys.size}): ${[...statKeys].sort().join(", ")}`);
}

// The parsers are exported for ad-hoc checks (`import { parseTooltip } from ...`);
// importing the module does not run the scrape.
export { parseHtml, parseItemPage, parseTooltip, parseStatText };

if (IS_MAIN) {
  main()
    .then(() => {
      for (const w of warnings) console.warn(`warning: ${w}`);
      if (errors.length) {
        for (const e of errors) console.error(`error: ${e}`);
        process.exit(1);
      }
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
