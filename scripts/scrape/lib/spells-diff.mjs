// The old (foreverchanges.pro) spellbooks against the new (client) ones, spell by spell and rank
// by rank: tab, level, status, ranks and every rank field on both sides. Differences are sorted
// into kinds so each kind is explained once in docs/data/spells.md#from-foreverchanges-to-the-client.
// Writes <outDir>/spells-diff.md and .json and prints a summary. Run through
// `node scripts/scrape/spells-client.mjs --diff` after a write.

import fs from "node:fs";
import path from "node:path";

/** Spell fields the site made up that the client dataset no longer carries. */
const DROPPED_SPELL = ["url", "badge", "summary", "reasons", "changelog", "sources", "featuredRank"];

const json = (v) => JSON.stringify(v ?? null, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const ws = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Renderer conventions that differ from the site's, applied one after another to both texts:
 * the site always printed the plural ("Awards 1 combo points"; the renderer follows the number),
 * wrote a one-hour duration "1 hr" (the renderer "1 hour", as in the talent and item datasets),
 * and printed `$/N;s1` scalings with one decimal (the renderer two).
 */
const both = (f) => (a, b) => [f(a), f(b)];
const CONVENTIONS = [
  [
    "plural after 1",
    (a, b) => {
      const wa = a.split(" ");
      const wb = b.split(" ");
      if (wa.length !== wb.length) return [a, b];
      return [wa.map((w, i) => (w !== wb[i] && (w === `${wb[i]}s` || wb[i] === `${w}s` || w.replace(/s([.,]?)$/, "$1") === wb[i]) ? wb[i] : w)).join(" "), b];
    },
  ],
  ["1 hr → 1 hour", both((s) => s.replace(/\b1 hr\b/g, "1 hour"))],
  [
    "decimals",
    (a, b) => {
      const na = a.match(/\d+(?:\.\d+)?/g) ?? [];
      const nb = b.match(/\d+(?:\.\d+)?/g) ?? [];
      const close = na.length === nb.length && na.every((x, i) => Math.abs(Number(x) - Number(nb[i])) < 0.06);
      return close && a.replace(/\d+(?:\.\d+)?/g, "#") === b.replace(/\d+(?:\.\d+)?/g, "#") ? [b, b] : [a, b];
    },
  ],
];

/** A site tooltip against the rendered client tooltip. */
function textKind(old, next, rank) {
  if ((old ?? null) === (next ?? null)) return null;
  if (old === null) return "text added (the site had none)";
  if (next === null) return "text dropped";
  if (ws(old) === ws(next)) return "whitespace";
  const kinds = [];
  let a = ws(old);
  const b0 = ws(next);
  // The site appended the tooltip's requirement line ("Requires Melee Weapon") to the text.
  const requires = /\n\nRequires ([^\n]+)$/.exec(old);
  if (requires) {
    a = ws(old.slice(0, requires.index));
    kinds.push(rank?.requires === requires[1] || rank?.forms?.join(", ") === requires[1] ? "requirement line moved to `requires`/`forms`" : "requirement line dropped");
  }
  let b = b0;
  for (const [name, f] of CONVENTIONS) {
    if (a === b) break;
    const [fa, fb] = f(a, b);
    if (fa !== a || fb !== b) kinds.push(name);
    a = fa;
    b = fb;
  }
  if (a !== b) kinds.push("wording or numbers");
  return kinds.join(" + ");
}

function rankChanges(o, n, side) {
  const out = [];
  if (!o && !n) return out;
  if (!o || !n) {
    out.push({ field: `${side}`, kind: o ? `${side} rank dropped` : `${side} rank added`, old: o?.spellId ?? null, new: n?.spellId ?? null });
    return out;
  }
  const cmp = (field, a, b, kind) => {
    if (json(a) !== json(b)) out.push({ field: `${side}.${field}`, kind: kind ?? field, old: a ?? null, new: b ?? null });
  };
  cmp("spellId", o.spellId, n.spellId);
  cmp("level", o.level, n.level);
  if ((o.rankLabel ?? null) !== (n.rankLabel ?? null)) out.push({ field: `${side}.rankLabel`, kind: o.rankLabel === null ? "rankLabel now always the client subtext" : "rankLabel", old: o.rankLabel, new: n.rankLabel });
  cmp("cost", o.cost, n.cost);
  cmp("castTime", o.castTime, n.castTime);
  cmp("cooldown", o.cooldown, n.cooldown);
  cmp("range", o.range, n.range);
  const tk = textKind(o.text, n.text, n);
  if (tk) out.push({ field: `${side}.text`, kind: `text: ${tk}`, old: o.text, new: n.text });
  return out;
}

/** Pair old and new rank rows: by Forever spell id, then Classic spell id, then rank number. */
function pairRanks(oldRanks, newRanks) {
  const pairs = [];
  const used = new Set();
  const key = (r) => [r.forever?.spellId ?? null, r.classic?.spellId ?? null];
  for (const o of oldRanks) {
    const [of, oc] = key(o);
    let n = newRanks.find((x) => !used.has(x) && of !== null && x.forever?.spellId === of);
    n ??= newRanks.find((x) => !used.has(x) && of === null && oc !== null && x.classic?.spellId === oc && !x.forever);
    n ??= newRanks.find((x) => !used.has(x) && o.rank !== null && x.rank === o.rank);
    if (n) used.add(n);
    pairs.push({ o, n: n ?? null });
  }
  for (const n of newRanks) if (!used.has(n)) pairs.push({ o: null, n });
  return pairs;
}

export function diffSpells({ pairs, outDir, repoRoot }) {
  const report = { classes: {}, kinds: {} };
  const md = ["# Spellbooks: foreverchanges.pro snapshot vs client dataset", "", "Generated by `node scripts/scrape/spells-client.mjs --diff`. Spells are paired by name, ranks by Forever spell id (then Classic spell id, then rank number).", ""];
  for (const { cls, old, next } of pairs) {
    const newByName = new Map(next.spells.map((s) => [norm(s.name), s]));
    const kinds = {};
    const count = (k) => {
      kinds[k] = (kinds[k] ?? 0) + 1;
      report.kinds[k] = (report.kinds[k] ?? 0) + 1;
    };
    const spells = [];
    const seen = new Set();
    for (const o of old.spells) {
      const n = newByName.get(norm(o.name));
      if (!n) {
        spells.push({ name: o.name, removed: true });
        count("spell removed");
        continue;
      }
      seen.add(n.id);
      const changes = [];
      const cmp = (field, a, b, kind) => {
        if (json(a) !== json(b)) changes.push({ field, kind: kind ?? field, old: a ?? null, new: b ?? null });
      };
      cmp("id", o.id, n.id);
      cmp("tab", o.tab, n.tab);
      cmp("icon", o.icon, n.icon);
      cmp("level", o.level, n.level);
      cmp("status", o.status, n.status);
      cmp("races", o.races, n.races);
      cmp("maxRank", o.maxRank, n.maxRank);
      cmp("isTalent", o.isTalent, n.isTalent);
      cmp("grantedByTalent", o.grantedByTalent, n.grantedByTalent);
      const rankPairs = pairRanks(o.ranks, n.ranks);
      for (const { o: or, n: nr } of rankPairs) {
        const label = `rank ${nr?.rank ?? or?.rank ?? "-"} (${nr?.forever?.spellId ?? or?.forever?.spellId ?? "x"}/${nr?.classic?.spellId ?? or?.classic?.spellId ?? "x"})`;
        if (!or) {
          changes.push({ field: label, kind: nr.forever ? "rank pair added (Forever)" : "rank pair added (Classic-only rank)", old: null, new: [nr.forever?.spellId ?? null, nr.classic?.spellId ?? null] });
          continue;
        }
        if (!nr) {
          changes.push({ field: label, kind: "rank pair dropped", old: [or.forever?.spellId ?? null, or.classic?.spellId ?? null], new: null });
          continue;
        }
        if ((or.rank ?? null) !== (nr.rank ?? null)) changes.push({ field: `${label} rank`, kind: "pair rank number", old: or.rank, new: nr.rank });
        for (const c of [...rankChanges(or.forever, nr.forever, "forever"), ...rankChanges(or.classic, nr.classic, "classic")]) changes.push({ ...c, field: `${label} ${c.field}` });
      }
      for (const c of changes) count(c.kind);
      if (changes.length) spells.push({ name: n.name, changes });
    }
    const added = next.spells.filter((s) => !seen.has(s.id)).map((s) => s.name);
    for (const _ of added) count("spell added");
    const missing = { old: old.missing.map((m) => m.name), new: next.missing.map((m) => m.name) };
    const dropped = DROPPED_SPELL.filter((f) => old.spells.some((s) => f in s) && !next.spells.some((s) => f in s));
    report.classes[cls] = {
      counts: { old: old.counts, new: next.counts },
      tabs: { old: old.tabs, new: next.tabs },
      statuses: { old: tally(old.spells.map((s) => s.status)), new: tally(next.spells.map((s) => s.status)) },
      kinds,
      dropped,
      added,
      missing,
      spells,
    };
    md.push(`## ${cls}`, "");
    md.push(`${old.spells.length} → ${next.spells.length} spells. Counts ${json(old.counts)} → ${json(next.counts)}.`, "");
    md.push(`Statuses: ${json(report.classes[cls].statuses.old)} → ${json(report.classes[cls].statuses.new)}`, "");
    md.push(`Tabs: ${json(old.tabs)} → ${json(next.tabs)}`, "");
    md.push(`Not in Forever: ${missing.old.join(", ") || "none"} → ${missing.new.join(", ") || "none"}`, "");
    md.push(`Dropped fields: ${dropped.join(", ") || "none"}; spells added: ${added.join(", ") || "none"}.`, "");
    md.push("Kinds: " + (Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join("; ") || "none"), "");
    for (const s of spells) {
      md.push(`### ${s.name}`, "");
      if (s.removed) md.push("- removed", "");
      for (const c of s.changes ?? []) md.push(`- ${c.field} [${c.kind}]: ${json(c.old)} → ${json(c.new)}`);
      md.push("");
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "spells-diff.md"), `${md.join("\n")}\n`);
  fs.writeFileSync(path.join(outDir, "spells-diff.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nSpellbooks diff (${path.relative(repoRoot, path.join(outDir, "spells-diff.md"))}):`);
  for (const [cls, r] of Object.entries(report.classes)) {
    console.log(`  ${cls}: ${r.counts.old.total} → ${r.counts.new.total} spells; statuses ${json(r.statuses.old)} → ${json(r.statuses.new)}`);
    console.log(`    ${Object.entries(r.kinds).map(([k, v]) => `${k} ${v}`).join("; ") || "no changes"}`);
  }
  return report;
}

function tally(xs) {
  const out = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}
