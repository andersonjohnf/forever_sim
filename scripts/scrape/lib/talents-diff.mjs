// The old (foreverchanges.pro) talent datasets against the new (client) ones, talent by talent:
// position, max rank, prerequisite, icon, per-rank Forever and Classic texts, the Classic match,
// change kind, passive flag and tooltip header. Writes <outDir>/talents-diff.md and .json and
// prints a summary. Also writes <outDir>/talents-changes.md, the new dataset's own Forever-vs-
// Classic tables. Run through `node scripts/scrape/talents-client.mjs --diff` after a write.
// docs/data/talents.md#from-foreverchanges-to-the-client records the result.

import fs from "node:fs";
import path from "node:path";

/** Fields the site made up that the client dataset no longer carries. */
const DROPPED = ["summary", "changes", "evidenceStatus", "comparisonStatus", "discoveredAt", "sources"];

const json = (v) => JSON.stringify(v ?? null, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const ws = (s) => (s ?? "").replace(/\s+/g, " ").trim();

/** How two lists of rank texts differ: "same", "whitespace", or "text". */
function textDiff(a, b) {
  if (json(a) === json(b)) return "same";
  if (a && b && a.length === b.length && a.every((x, i) => ws(x) === ws(b[i]))) return "whitespace";
  return "text";
}

function talentChanges(o, n, oldById, newById) {
  const out = [];
  const cmp = (field, a, b) => {
    if (json(a) !== json(b)) out.push({ field, old: a ?? null, new: b ?? null });
  };
  for (const f of ["name", "tree", "tier", "col", "order", "maxRank", "icon", "changeKind", "passive", "previousName", "classicSpellId"]) cmp(f, o[f], n[f]);
  const pre = (t, byId) => (t.prerequisite ? `${byId.get(t.prerequisite.talentId)?.name} ${t.prerequisite.rank}` : null);
  cmp("prerequisite", pre(o, oldById), pre(n, newById));
  for (const k of ["resourceCost", "range", "castTime", "cooldown", "requirements"]) cmp(`tooltip.${k}`, o.tooltip?.[k], n.tooltip?.[k]);
  for (const k of ["name", "maxRank", "tier", "matchStatus", "prerequisite"]) cmp(`classic.${k}`, o.classic?.[k], n.classic?.[k]);
  for (const k of ["forever", "classic"]) {
    const kind = textDiff(o.ranks[k], n.ranks[k]);
    if (kind !== "same") out.push({ field: `ranks.${k}`, kind, old: o.ranks[k], new: n.ranks[k] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// "Changes at a glance": the client dataset's own Forever-vs-Classic comparison, as the
// markdown tables docs/data/talents.md#changes-at-a-glance carries.
// ---------------------------------------------------------------------------

const cell = (t) => `${t.tier + 1}·${t.col + 1}`;
const oneLine = (s) => ws(s).replace(/\|/g, "\\|");
const clip = (s, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const NUMBER = /\d+(?:\.\d+)?/g;

/**
 * What differs between a talent's Forever and Classic texts (same max rank), in a few words,
 * judged at the highest rank whose texts differ (case and whitespace don't count).
 */
function textChange(t) {
  const norm = (s) => ws(s).toLowerCase();
  const differing = t.ranks.forever.map((x, i) => (norm(x) !== norm(t.ranks.classic[i]) ? i : -1)).filter((i) => i >= 0);
  if (!differing.length) return null;
  const r = differing.at(-1);
  const f = norm(t.ranks.forever[r]);
  const c = norm(t.ranks.classic[r]);
  const fn = f.match(NUMBER) ?? [];
  const cn = c.match(NUMBER) ?? [];
  if (fn.join() === cn.join()) return "Same numbers, reworded";
  if (fn.length !== cn.length) return "Effect rewritten";
  const diffs = fn.map((x, i) => (x === cn[i] ? null : `${x} instead of ${cn[i]}`)).filter(Boolean);
  const reworded = f.replace(NUMBER, "#") !== c.replace(NUMBER, "#") ? ", reworded" : "";
  return `${t.maxRank > 1 ? `Rank ${r + 1}: ` : ""}${diffs.join(", ")}${reworded}`;
}

/** Markdown tables of one class's new, changed and unchanged talents. */
export function changesAtAGlance(data) {
  const all = data.trees.flatMap((tr) => tr.talents);
  const byId = new Map(all.map((t) => [t.id, t]));
  const kinds = (k) => all.filter((t) => t.changeKind === k);
  const out = [];
  out.push(
    `${data.trees.map((t) => `${t.name} ${t.talents.length}`).join(", ")} (${all.length} talents): ${kinds("added").length} new, ${kinds("modified").length} changed, ${kinds("moved").length} moved only, ${kinds("unchanged").length} same as Classic.`,
    "",
    "**New in Forever**",
    "",
    "| Tree | Tier·Col | Talent | Ranks | Effect at max rank |",
    "|---|---|---|---|---|",
  );
  for (const t of kinds("added")) {
    const pre = t.prerequisite ? ` (needs ${byId.get(t.prerequisite.talentId).name})` : "";
    out.push(`| ${t.tree} | ${cell(t)} | ${t.name}${pre} | ${t.maxRank} | ${clip(oneLine(t.ranks.forever.at(-1)))} |`);
  }
  out.push("", "**Changed or moved** (from the client comparison; tiers and columns are 1-based)", "", "| Tree | Tier·Col | Talent | What changed |", "|---|---|---|---|");
  for (const t of all.filter((x) => x.changeKind === "modified" || x.changeKind === "moved")) {
    const c = t.classic;
    const notes = [];
    if (t.previousName) notes.push(`Renamed from ${t.previousName}`);
    if (c.maxRank !== t.maxRank) notes.push(`${t.maxRank} ranks (Classic: ${c.maxRank})`);
    if (c.tree !== t.tree) notes.push(`Moved from ${c.tree} (${c.tier + 1}·${c.col + 1})`);
    else if (c.tier !== t.tier) notes.push(`Moved from tier ${c.tier + 1} to tier ${t.tier + 1}`);
    else if (c.col !== t.col) notes.push(`Moved from column ${c.col + 1} to column ${t.col + 1}`);
    const pre = t.prerequisite ? byId.get(t.prerequisite.talentId).name : null;
    const preClassic = pre ? (byId.get(t.prerequisite.talentId).classic?.name ?? pre) : null;
    if (!pre && c.prerequisite) notes.push(`No longer requires ${c.prerequisite}`);
    else if (pre && !c.prerequisite) notes.push(`Requires ${pre}`);
    else if (pre && preClassic !== c.prerequisite) notes.push(`Requires ${pre} (Classic: ${c.prerequisite})`);
    if (c.maxRank === t.maxRank) {
      const change = textChange(t);
      if (change) notes.push(change);
    } else if (ws(t.ranks.forever.at(-1)).toLowerCase() !== ws(t.ranks.classic.at(-1)).toLowerCase()) notes.push("Effect changed");
    out.push(`| ${t.tree} | ${cell(t)} | ${t.name} | ${notes.join(". ")}. |`);
  }
  out.push("", `**Same as Classic:** ${kinds("unchanged").map((t) => t.name).join(", ") || "none"}.`);
  return out.join("\n");
}

export function diffTalents({ pairs, outDir, repoRoot, decodeByName, repoCodes }) {
  const report = { classes: {}, byField: {} };
  const md = [
    "# Talents: foreverchanges.pro snapshot vs client dataset",
    "",
    "Generated by `node scripts/scrape/talents-client.mjs --diff`. Talents are paired by tree and name, then by cell. Ids aren't compared (the client dataset derives its own).",
    "",
  ];
  for (const { cls, old, next } of pairs) {
    const oldAll = old.trees.flatMap((t) => t.talents);
    const newAll = next.trees.flatMap((t) => t.talents);
    const oldById = new Map(oldAll.map((t) => [t.id, t]));
    const newById = new Map(newAll.map((t) => [t.id, t]));
    const key = (t) => `${t.tree}/${t.name}`;
    const newByKey = new Map(newAll.map((t) => [key(t), t]));
    const newByCell = new Map(newAll.map((t) => [`${t.tree}/${t.tier}/${t.col}`, t]));
    const paired = [];
    const removed = [];
    const seen = new Set();
    for (const o of oldAll) {
      const n = newByKey.get(key(o)) ?? newByCell.get(`${o.tree}/${o.tier}/${o.col}`);
      if (!n) {
        removed.push(o);
        continue;
      }
      seen.add(n.id);
      paired.push({ o, n, changes: talentChanges(o, n, oldById, newById) });
    }
    const added = newAll.filter((n) => !seen.has(n.id));
    const trees = old.trees.map((t, i) => ({
      old: { id: t.id, name: t.name, icon: t.icon, index: t.index, clientTreeId: t.clientTreeId, talents: t.talents.length },
      new: { id: next.trees[i]?.id, name: next.trees[i]?.name, icon: next.trees[i]?.icon, index: next.trees[i]?.index, clientTreeId: next.trees[i]?.clientTreeId, talents: next.trees[i]?.talents.length },
    }));
    const codes = [...new Set([...(repoCodes[cls] ?? []), ...(old.popularBuilds ?? []).map((b) => b.code)])].map((code) => {
      const a = decodeByName(old, code);
      const b = decodeByName(next, code);
      return { code, same: json(a) === json(b), ranks: b };
    });
    const dropped = DROPPED.filter((f) => oldAll.some((t) => f in t) && !newAll.some((t) => f in t));
    const byField = {};
    for (const p of paired)
      for (const c of p.changes) {
        const f = c.kind ? `${c.field} (${c.kind})` : c.field;
        byField[f] = (byField[f] ?? 0) + 1;
        report.byField[f] = (report.byField[f] ?? 0) + 1;
      }
    report.classes[cls] = {
      counts: { old: oldAll.length, new: newAll.length, paired: paired.length, changed: paired.filter((p) => p.changes.length).length, added: added.length, removed: removed.length },
      rules: { old: old.rules, new: next.rules },
      trees,
      byField,
      dropped,
      popularBuildsDropped: (old.popularBuilds ?? []).length,
      codes,
      talents: paired.filter((p) => p.changes.length).map((p) => ({ tree: p.n.tree, name: p.n.name, changes: p.changes })),
      added: added.map((t) => ({ tree: t.tree, name: t.name })),
      removed: removed.map((t) => ({ tree: t.tree, name: t.name })),
    };
    md.push(`## ${cls}`, "");
    md.push(`${oldAll.length} → ${newAll.length} talents; ${paired.length} paired, ${report.classes[cls].counts.changed} with a changed field, ${added.length} added, ${removed.length} removed.`, "");
    md.push(`Rules: ${json(old.rules)} → ${json(next.rules)}`, "");
    md.push("| Tree | Old | New |", "| --- | --- | --- |");
    for (const t of trees) md.push(`| ${t.old.name} | ${json(t.old)} | ${json(t.new)} |`);
    md.push("", `Dropped fields: ${dropped.join(", ") || "none"}; popular builds dropped: ${report.classes[cls].popularBuildsDropped}.`, "");
    md.push("Changed fields: " + (Object.entries(byField).map(([f, v]) => `${f} ${v}`).join(", ") || "none"), "");
    md.push("| Code | Same ranks by name |", "| --- | --- |");
    for (const c of codes) md.push(`| \`${c.code}\` | ${c.same ? "yes" : "**no**"} |`);
    md.push("");
    for (const p of paired.filter((x) => x.changes.length)) {
      md.push(`### ${p.n.tree}: ${p.n.name}`, "");
      for (const c of p.changes) {
        if (c.field.startsWith("ranks.")) {
          md.push(`- ${c.field} (${c.kind}):`);
          const len = Math.max(c.old?.length ?? 0, c.new?.length ?? 0);
          for (let i = 0; i < len; i++) {
            if ((c.old?.[i] ?? null) === (c.new?.[i] ?? null)) continue;
            md.push(`  - rank ${i + 1} old: ${json(c.old?.[i] ?? null)}`, `  - rank ${i + 1} new: ${json(c.new?.[i] ?? null)}`);
          }
        } else md.push(`- ${c.field}: ${json(c.old)} → ${json(c.new)}`);
      }
      md.push("");
    }
    if (added.length) md.push(`Added: ${added.map((t) => `${t.tree}/${t.name}`).join(", ")}`, "");
    if (removed.length) md.push(`Removed: ${removed.map((t) => `${t.tree}/${t.name}`).join(", ")}`, "");
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "talents-diff.md"), `${md.join("\n")}\n`);
  fs.writeFileSync(path.join(outDir, "talents-diff.json"), `${JSON.stringify(report, null, 2)}\n`);
  // The client dataset's own Forever-vs-Classic tables, for docs/data/talents.md#changes-at-a-glance.
  const glance = pairs.map(({ cls, next }) => `### ${cls[0].toUpperCase()}${cls.slice(1)}\n\n${changesAtAGlance(next)}\n`);
  fs.writeFileSync(path.join(outDir, "talents-changes.md"), `${glance.join("\n")}`);
  console.log(`\nTalents diff (${path.relative(repoRoot, path.join(outDir, "talents-diff.md"))}):`);
  for (const [cls, r] of Object.entries(report.classes)) {
    console.log(`  ${cls}: ${r.counts.old} → ${r.counts.new} talents, ${r.counts.changed} changed, ${r.counts.added} added, ${r.counts.removed} removed; codes ${r.codes.filter((c) => c.same).length}/${r.codes.length} same`);
    console.log(`    ${Object.entries(r.byField).map(([f, v]) => `${f} ${v}`).join(", ") || "no field changes"}`);
  }
  return report;
}
