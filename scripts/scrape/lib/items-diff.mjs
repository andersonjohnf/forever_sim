// The committed item pool against a freshly generated one (usually a new client build): items
// added and removed, and every changed field, sorted into kinds, plus set changes. Writes
// <outDir>/items-diff.md and .json and prints a summary. Run through `npm run diff:items`
// (scripts/scrape/items-client.mjs --diff).

import fs from "node:fs";
import path from "node:path";
import { compareText } from "./json.mjs";

/** JSON with sorted object keys, so key order never counts as a change. */
const json = (v) => JSON.stringify(v ?? null, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => compareText(a, b))) : x));

/** Top-level fields compared as a whole. `classic`, the Classic Era comparison, is compared too. */
const FIELDS = [
  "name", "icon", "quality", "itemLevel", "reqLevel", "tab", "classicName", "foreverData", "foreverSource", "statsFrom",
  "slot", "equipSlots", "itemClass", "itemSubclass", "armorType", "weaponType", "binding", "unique", "uniqueEquipped",
  "classes", "races", "setId", "source", "preRaidBis", "sellPrice", "flavor", "classic", "classicShieldBlockValue", "notes",
];

/** Every changed field of one item, as [field, old, new]. */
function fieldChanges(o, n) {
  const out = [];
  const cmp = (field, a, b) => {
    if (json(a) !== json(b)) out.push([field, a ?? null, b ?? null]);
  };
  for (const f of FIELDS) cmp(f, o[f], n[f]);
  cmp("requirements", (o.requirements ?? []).map((r) => r.text), (n.requirements ?? []).map((r) => r.text));
  const keys = new Set([...Object.keys(o.stats ?? {}), ...Object.keys(n.stats ?? {})]);
  for (const k of [...keys].sort()) cmp(`stats.${k}`, o.stats?.[k] ?? 0, n.stats?.[k] ?? 0);
  for (const k of ["min", "max", "speed", "dps", "school", "skill", "extraDamage"]) cmp(`weapon.${k}`, o.weapon?.[k], n.weapon?.[k]);
  cmp("weaponSkill", o.weaponSkill, n.weaponSkill);
  for (const f of ["procs", "useEffects", "otherEquip"]) cmp(`${f}.text`, (o[f] ?? []).map((e) => e.raw), (n[f] ?? []).map((e) => e.raw));
  cmp("useEffects.cooldownSec", (o.useEffects ?? []).map((u) => u.cooldownSec ?? null), (n.useEffects ?? []).map((u) => u.cooldownSec ?? null));
  return out;
}

/** The kind of a change, for grouping. Fallback changes come first: they move whole items. */
function classify(o, n, field) {
  if (field === "statsFrom" || field === "foreverData" || field === "foreverSource")
    return o.statsFrom === "classic" && n.statsFrom === "forever" ? "Forever row: the item now has one (Classic Era fallback ended)" : "Forever row: the item lost it (now falls back to Classic Era)";
  if (field.startsWith("stats.")) return "stats";
  if (field.startsWith("weapon")) return "weapon";
  if (/^(procs|useEffects|otherEquip)\./.test(field)) return "effects";
  if (field === "classic" || field === "classicName" || field === "classicShieldBlockValue") return "Classic Era comparison";
  if (field === "preRaidBis") return "pre-raid BiS lists";
  if (["name", "icon", "itemSubclass", "flavor", "sellPrice", "notes"].includes(field)) return "names, icons and text";
  if (field === "tab") return "tab (Forever vs Classic status)";
  return "item fields";
}

const build = (d) => `${d.meta?.foreverBuild ?? "?"} + Classic Era ${d.meta?.classicBuild ?? "?"}`;

export function diff({ old, next, against, outDir, repoRoot }) {
  const oldById = new Map(old.items.map((i) => [i.id, i]));
  const newById = new Map(next.items.map((i) => [i.id, i]));
  const removed = old.items.filter((i) => !newById.has(i.id)).map((i) => ({ id: i.id, name: i.name, tab: i.tab }));
  const added = next.items.filter((i) => !oldById.has(i.id)).map((i) => ({ id: i.id, name: i.name, tab: i.tab, statsFrom: i.statsFrom }));
  const watched = { old: (old.meta.noClientRow ?? []).map((x) => x.id), new: (next.meta.noClientRow ?? []).map((x) => x.id) };
  const nowShipped = watched.old.filter((id) => !watched.new.includes(id));

  const byKind = new Map(); // kind → [{ id, name, field, old, new }]
  const byField = new Map(); // field → count
  const changedItems = new Set();
  for (const n of next.items) {
    const o = oldById.get(n.id);
    if (!o) continue;
    for (const [field, a, b] of fieldChanges(o, n)) {
      const kind = classify(o, n, field);
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push({ id: n.id, name: n.name, field, old: a, new: b });
      byField.set(field, (byField.get(field) ?? 0) + 1);
      changedItems.add(n.id);
    }
  }

  // Sets: bonuses (pieces, text, parsed stats), pieces, and where the bonuses come from.
  const setChanges = [];
  for (const [id, s] of Object.entries(next.sets)) {
    const o = old.sets[id];
    if (!o) {
      setChanges.push({ id, name: s.name, change: "new set" });
      continue;
    }
    const key = (set) => set.bonuses.map((b) => `${b.pieces}:${b.text}:${json(b.parsed ?? null)}${b.weaponSkill ? json(b.weaponSkill) : ""}`).join(" | ");
    if (key(o) !== key(s) || o.bonusesFrom !== s.bonusesFrom) setChanges.push({ id, name: s.name, change: `bonuses (${o.bonusesFrom} → ${s.bonusesFrom})`, old: key(o), new: key(s) });
    if (json(o.itemIds) !== json(s.itemIds) || o.size !== s.size || o.name !== s.name) setChanges.push({ id, name: s.name, change: "name or pieces", old: json([o.name, o.size, o.itemIds]), new: json([s.name, s.size, s.itemIds]) });
  }
  for (const id of Object.keys(old.sets)) if (!next.sets[id]) setChanges.push({ id, name: old.sets[id].name, change: "set gone" });

  const lines = ["# Items: committed dataset vs fresh generation", ""];
  lines.push(`Generated by \`npm run diff:items\` against ${against}. Build ${build(old)} → ${build(next)}; ${old.items.length} → ${next.items.length} items.`, "");
  lines.push(`Filter: ${json(old.meta.filter?.rule) === json(next.meta.filter?.rule) ? "unchanged" : `${old.meta.filter?.rule} → ${next.meta.filter?.rule}`}.`, "");
  lines.push(`Watched items with no client row: ${watched.old.length} → ${watched.new.length}${nowShipped.length ? `; now shipped: ${nowShipped.join(", ")} (remove them from WATCH_ITEMS)` : ""}.`, "");
  lines.push(`## Removed (${removed.length})`, "", ...removed.map((r) => `- ${r.id} ${r.name} (${r.tab})`), "");
  lines.push(`## Added (${added.length})`, "", ...added.map((a) => `- ${a.id} ${a.name} (${a.tab}, stats from ${a.statsFrom})`), "");
  lines.push(`## Changed fields (${changedItems.size} items)`, "");
  if (byField.size) lines.push("| Field | Items |", "| --- | --: |", ...[...byField].sort((a, b) => b[1] - a[1]).map(([f, c]) => `| \`${f}\` | ${c} |`), "");
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    const items = new Set(list.map((x) => x.id));
    lines.push(`### ${kind} (${list.length} fields, ${items.size} items)`, "");
    for (const x of list.slice(0, 400)) lines.push(`- ${x.id} ${x.name}: \`${x.field}\` ${json(x.old)} → ${json(x.new)}`);
    if (list.length > 400) lines.push(`- … ${list.length - 400} more (see the .json)`);
    lines.push("");
  }
  lines.push(`## Sets (${setChanges.length} changes)`, "", ...setChanges.map((s) => `- ${s.id} ${s.name}: ${s.change}${s.old ? ` — ${s.old} → ${s.new}` : ""}`), "");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "items-diff.md"), `${lines.join("\n")}\n`);
  fs.writeFileSync(path.join(outDir, "items-diff.json"), `${JSON.stringify({ against, builds: { old: build(old), new: build(next) }, removed, added, nowShipped, byKind: Object.fromEntries(byKind), setChanges }, null, 1)}\n`);

  console.log(`\nItems diff against ${against} (${path.relative(repoRoot, path.join(outDir, "items-diff.md"))}):`);
  console.log(`  ${old.items.length} → ${next.items.length} items: ${removed.length} removed, ${added.length} added, ${changedItems.size} with changed fields; sets: ${setChanges.length} changes`);
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${String(list.length).padStart(5)} fields, ${String(new Set(list.map((x) => x.id)).size).padStart(4)} items  ${kind}`);
  if (nowShipped.length) console.log(`  watched items now in a client build: ${nowShipped.join(", ")}`);
}
