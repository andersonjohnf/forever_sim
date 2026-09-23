// The old (foreverchanges.pro) dataset against the new (client) one: items added and removed,
// and every changed field, sorted into classes. Writes <outDir>/items-diff.md and .json and
// prints a summary. Run through `node scripts/scrape/items-client.mjs --diff` after --write.
// docs/data/items.md#from-foreverchanges-to-the-client records the result.

import fs from "node:fs";
import path from "node:path";

/** Tooltip-parser errors in the old dataset that the client corrects (docs/data/client.md). */
const PARSER_FIXES = new Map([
  [19120, "Rune of the Guard Captain: +14 AP sat on a line with a second sentence and stayed text"],
  [13209, "Seal of the Dawn: +81 AP vs Undead sat on a line with a second sentence and stayed text"],
  [19812, "Rune of the Dawn: +48 spell damage vs Undead sat on a line with a second sentence and stayed text"],
  [15062, "Devilsaur Leggings: the tooltip prints +46 AP; spell 15811 also gives 48 ranged AP"],
]);

/** JSON with sorted object keys, so key order never counts as a change. */
const json = (v) => JSON.stringify(v ?? null, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

/** Every changed field of one item, as [field, old, new]. */
function fieldChanges(o, n) {
  const out = [];
  const cmp = (field, a, b) => {
    if (json(a) !== json(b)) out.push([field, a ?? null, b ?? null]);
  };
  for (const f of ["name", "quality", "itemLevel", "reqLevel", "tab", "foreverData", "statsFrom", "slot", "itemSubclass", "armorType", "weaponType", "binding", "unique", "uniqueEquipped", "classes", "setId", "icon"])
    cmp(f, o[f], n[f]);
  cmp("requirements", o.requirements.map((r) => r.text), n.requirements.map((r) => r.text));
  const keys = new Set([...Object.keys(o.stats), ...Object.keys(n.stats)]);
  for (const k of [...keys].sort()) cmp(`stats.${k}`, o.stats[k] ?? 0, n.stats[k] ?? 0);
  for (const k of ["min", "max", "speed", "dps", "school", "skill"]) cmp(`weapon.${k}`, o.weapon?.[k], n.weapon?.[k]);
  cmp("weapon.extraDamage", o.weapon?.extraDamage, n.weapon?.extraDamage);
  cmp("weaponSkill", o.weaponSkill, n.weaponSkill);
  for (const f of ["procs", "useEffects", "otherEquip"]) cmp(`${f}.count`, o[f].length, n[f].length);
  cmp("useEffects.cooldownSec", o.useEffects.map((u) => u.cooldownSec ?? null), n.useEffects.map((u) => u.cooldownSec ?? null));
  cmp("source", o.source ? "yes" : null, n.source ? "yes" : null);
  cmp("preRaidBis", o.preRaidBis, n.preRaidBis);
  return out;
}

/** Why a field changed. */
function classify(o, n, field, a, b) {
  if (field === "source") return "source: drop sources are gone (the client's Encounter Journal is empty)";
  if (o.statsFrom === "forever" && n.statsFrom === "classic")
    return o.foreverSource === "seenInGame"
      ? "fallback: seen-in-game item, the client has no Forever row, so Classic Era values"
      : "fallback: hotfix-only Forever row, the raw client has none, so Classic Era values";
  if (PARSER_FIXES.has(n.id) && /^(stats|otherEquip)/.test(field)) return "parser fix: the old tooltip parser was wrong or incomplete";
  if ((field === "stats.armor" || field === "stats.bonusArmor") && (o.stats.armor ?? 0) === (n.stats.armor ?? 0) + (n.stats.bonusArmor ?? 0) - (o.stats.bonusArmor ?? 0))
    return "armor split: Forever's stat 50 bonus armor is now bonusArmor, not part of armor";
  if (field === "tab") return `tab: ${a} → ${b}`;
  if (field === "requirements" && n.requirements.every((r) => r.kind === "pvpRank" || o.requirements.some((x) => x.text === r.text)))
    return "requirements: the PvP rank the client requires (the old tooltips didn't print it)";
  if (field === "icon") return "icon: the client's icon file name";
  if (field === "itemSubclass") return "subclass name: the client's ItemSubClass name";
  if (field.startsWith("procs") || field.startsWith("otherEquip") || field.startsWith("useEffects.count")) return "effects: sorted by the client's spell auras, hidden spells left out";
  if (field === "useEffects.cooldownSec") return "cooldown: the client's ItemEffect or spell cooldown";
  if (field === "stats.meleeCrit" || (field === "stats.crit" && (o.stats.meleeCrit ?? 0) === (n.stats.crit ?? 0) - (o.stats.crit ?? 0)))
    return "equivalent: aura 52 is crit (the tooltip's \"with melee attacks\" was meleeCrit)";
  return "other";
}

export function diff({ old, next, outDir, repoRoot }) {
  const oldById = new Map(old.items.map((i) => [i.id, i]));
  const newById = new Map(next.items.map((i) => [i.id, i]));
  const noRow = new Set((next.meta.noClientRow ?? []).map((x) => x.id));
  const removed = old.items.filter((i) => !newById.has(i.id)).map((i) => ({ id: i.id, name: i.name, tab: i.tab, why: noRow.has(i.id) ? "no row in either client (watched)" : "other" }));
  const added = next.items.filter((i) => !oldById.has(i.id)).map((i) => ({ id: i.id, name: i.name, tab: i.tab, statsFrom: i.statsFrom }));

  const byClass = new Map(); // class → [{ id, name, field, old, new }]
  const byField = new Map(); // field → count
  const changedItems = new Set();
  for (const n of next.items) {
    const o = oldById.get(n.id);
    if (!o) continue;
    for (const [field, a, b] of fieldChanges(o, n)) {
      const cls = classify(o, n, field, a, b);
      if (!byClass.has(cls)) byClass.set(cls, []);
      byClass.get(cls).push({ id: n.id, name: n.name, field, old: a, new: b });
      byField.set(field, (byField.get(field) ?? 0) + 1);
      if (field !== "source" && field !== "icon" && field !== "itemSubclass") changedItems.add(n.id);
    }
  }

  // Sets: bonuses (pieces, parsed stats) and where they come from.
  const setChanges = [];
  for (const [id, s] of Object.entries(next.sets)) {
    const o = old.sets[id];
    if (!o) {
      setChanges.push({ id, name: s.name, change: "new set" });
      continue;
    }
    const key = (set) => set.bonuses.map((b) => `${b.pieces}:${json(b.parsed ?? null)}${b.weaponSkill ? json(b.weaponSkill) : ""}`).join(" ");
    if (key(o) !== key(s)) setChanges.push({ id, name: s.name, change: `${o.bonusesFrom} → ${s.bonusesFrom}`, old: key(o), new: key(s) });
    if (json(o.itemIds) !== json(s.itemIds)) setChanges.push({ id, name: s.name, change: "pieces", old: json(o.itemIds), new: json(s.itemIds) });
  }
  for (const id of Object.keys(old.sets)) if (!next.sets[id]) setChanges.push({ id, name: old.sets[id].name, change: "set gone" });

  const lines = ["# Items: foreverchanges snapshot vs client dataset", ""];
  lines.push(`Old: ${old.meta.source} (${old.meta.scrapedAt}), ${old.items.length} items. New: ${next.meta.source} (${next.meta.foreverBuild} + ${next.meta.classicBuild}), ${next.items.length} items.`, "");
  lines.push(`## Removed (${removed.length})`, "", ...removed.map((r) => `- ${r.id} ${r.name} (${r.tab}): ${r.why}`), "");
  lines.push(`## Added (${added.length})`, "", ...added.map((a) => `- ${a.id} ${a.name} (${a.tab}, stats from ${a.statsFrom})`), "");
  lines.push(`## Changed fields (${changedItems.size} items with a field other than source, icon or subclass name)`, "");
  lines.push("| Field | Items |", "| --- | --: |", ...[...byField].sort((a, b) => b[1] - a[1]).map(([f, c]) => `| \`${f}\` | ${c} |`), "");
  for (const [cls, list] of [...byClass].sort((a, b) => b[1].length - a[1].length)) {
    const items = new Set(list.map((x) => x.id));
    lines.push(`### ${cls} (${list.length} fields, ${items.size} items)`, "");
    for (const x of list.slice(0, 400)) lines.push(`- ${x.id} ${x.name}: \`${x.field}\` ${json(x.old)} → ${json(x.new)}`);
    if (list.length > 400) lines.push(`- … ${list.length - 400} more (see the .json)`);
    lines.push("");
  }
  lines.push(`## Sets (${setChanges.length} changes)`, "", ...setChanges.map((s) => `- ${s.id} ${s.name}: ${s.change}${s.old ? ` — ${s.old} → ${s.new}` : ""}`), "");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "items-diff.md"), `${lines.join("\n")}\n`);
  fs.writeFileSync(path.join(outDir, "items-diff.json"), `${JSON.stringify({ removed, added, byClass: Object.fromEntries(byClass), setChanges }, null, 1)}\n`);

  console.log(`old ${old.items.length} → new ${next.items.length}: ${removed.length} removed, ${added.length} added, ${changedItems.size} items with changed fields`);
  for (const [cls, list] of [...byClass].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${String(list.length).padStart(5)} fields, ${String(new Set(list.map((x) => x.id)).size).padStart(4)} items  ${cls}`);
  console.log(`  sets: ${setChanges.length} changes`);
  console.log(`report: ${path.relative(repoRoot, path.join(outDir, "items-diff.md"))}`);
}
