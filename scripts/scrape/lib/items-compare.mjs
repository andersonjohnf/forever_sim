// The M1.5c-1 check: derive every item of the last foreverchanges.pro dataset from the client
// tables and compare each field. Forever-stat items are compared with the Forever
// (wow_classic_beta) client, `statsFrom: "classic"` items with the Classic Era
// (wow_classic_era) client; changed items' `classic` block is checked against the Classic Era
// row as a test of the Classic path. Writes <outDir>/items-compare.md and .json and returns
// false when an engine-read field has a mismatch without a stated reason.
// Run through `npm run compare:items` (scripts/scrape/items-client.mjs --compare).

import fs from "node:fs";
import path from "node:path";
import { deriveItem, deriveSet } from "./item-stats.mjs";


/** Stat keys the engine reads (src/sim/plan/build.ts ITEM_STAT and AP_VS, plus weaponDamage). */
const ENGINE_STATS = new Set([
  "strength", "agility", "stamina", "intellect", "spirit", "armor", "bonusArmor", "defense", "defenseRating",
  "dodge", "dodgeRating", "parry", "parryRating", "block", "blockRating", "blockValue", "attackPower", "hit",
  "crit", "meleeCrit", "spellHit", "spellCrit", "hitRating", "critRating", "hasteRating", "expertiseRating",
  "armorPenetration", "weaponDamage", "attackPowerVsBeasts", "attackPowerVsDemons", "attackPowerVsDragonkin",
  "attackPowerVsElementals", "attackPowerVsGiants", "attackPowerVsHumanoids", "attackPowerVsMechanical",
  "attackPowerVsUndead",
]);
const ENGINE_FIELDS = new Set(["weapon.min", "weapon.max", "weapon.speed", "weaponSkill", "set.bonusStats"]);
const isEngine = (field) => ENGINE_FIELDS.has(field) || ENGINE_STATS.has(field.replace(/^stats\./, ""));

/**
 * Mismatches explained item by item after checking the rows by hand. Every entry says why;
 * `class` is one of the report's mismatch classes. Keys are "<id>:<field>" or "<id>:*".
 */
const TRAILING_SENTENCE = "the tooltip line has a second sentence, so the old parser kept it as text; the client's aura is the stat";
const KNOWN = new Map([
  ["19120:stats.attackPower", { class: "parser", reason: `"+14 Attack Power. This effect is tripled in Forest and Grassland areas.": ${TRAILING_SENTENCE}; the tripling is a second spell (1287704) restricted to area group 9161, kept as a conditional effect` }],
  ["13209:stats.attackPowerVsUndead", { class: "parser", reason: `"+81 Attack Power when fighting Undead. It also allows the acquisition of Scourgestones…": ${TRAILING_SENTENCE}` }],
  ["13209:effects.otherEquip", { class: "parser", reason: "the same line: the client's spell 23930 is only the undead AP auras" }],
  ["19812:stats.spellDamageVsUndead", { class: "parser", reason: `"…damage done to Undead by magical spells and effects by up to 48. It also allows…": ${TRAILING_SENTENCE}` }],
  ["19812:effects.otherEquip", { class: "parser", reason: "the same line: the client's spell 24198 is only the undead spell-damage aura" }],
  ["15062:stats.rangedAttackPower", { class: "parser", reason: "Classic Era spell 15811 gives 46 melee and 48 ranged AP; the tooltip prints only \"+46 Attack Power\"" }],
  ["set 143:set.bonusStats", { class: "parser", reason: "Forever's bonus spell 460230 grants melee hit (aura 54) and spell hit (aura 55); the tooltip reads \"Improves your chance to hit by 2.0%\"" }],
  ["19947:effects.useCooldown", { class: "parser", reason: "the Classic Era item effect's cooldown is 75,000 ms; the site's tooltip prints \"(1 Min Cooldown)\"" }],
  ["22268:effects.useCooldown", { class: "parser", reason: "the Classic Era item effect's cooldown is 75,000 ms; the site's tooltip prints \"(1 Min Cooldown)\"" }],
  ...[272437, 272438, 272439].map((id) => [`${id}:effects.useCooldown`, { class: "hotfix", reason: "Undermine trinket: the raw ItemEffect says 90,000 ms (15,000 ms shared category 1141); the tooltip says 2 min" }]),
]);

/** Mismatch classes, in report order. */
const CLASSES = {
  "no-row": "No client row: the build has no ItemSparse row for the item",
  "formula-gap": "Formula gap: the derivation doesn't reproduce this yet",
  rounding: "Rounding: off by one",
  hotfix: "Likely hotfix: the raw row disagrees with the tooltip in a way no formula explains",
  parser: "Old tooltip or parser error: the snapshot's value is wrong or incomplete, the client's is right",
  equivalent: "Equivalent: a different key for the same engine stat",
  "effect-kind": "Effect bucket: tooltip wording and client aura sort the same effect differently",
  layout: "Client layout: the value isn't stored in this client's layout",
  "forever-differs": "Stale Classic bonus: Forever's own client data differs from the Classic Era value the snapshot uses",
  unclassified: "Unclassified",
};

/**
 * @param {object} p  { forever, classic (build bundles with .ctx), pool (the snapshot dataset),
 *                     version, baseline, dbdefsSha, outDir, repoRoot, bisFile }
 */
export function compare({ forever, classic, pool, version, baseline, dbdefsSha, outDir, repoRoot, bisFile }) {
  const bis = JSON.parse(fs.readFileSync(path.join(repoRoot, bisFile), "utf8"));
  const results = []; // { id, name, target, field, want, got, cls, reason, engine }
  const fieldTally = new Map(); // `${target}|${field}` -> { compared, matched, engine }

  function tally(target, field, ok) {
    const k = `${target}|${field}`;
    if (!fieldTally.has(k)) fieldTally.set(k, { target, field, compared: 0, matched: 0, engine: isEngine(field) });
    const t = fieldTally.get(k);
    t.compared++;
    if (ok) t.matched++;
  }

  function classify(target, item, field, want, got, derived) {
    const known = KNOWN.get(`${item.id}:${field}`) ?? KNOWN.get(`${item.id}:*`);
    if (known) return known;
    if (target === "set-classic-in-forever") return { class: "forever-differs", reason: "Forever's ItemSetSpell has other bonuses than the Classic Era ones the snapshot shows" };
    if (/^effects\.(use|proc|otherEquip)$/.test(field)) return { class: "effect-kind", reason: "counts differ between buckets; see the item's effects" };
    if (field === "set.bonusStats" && want.replaceAll('"meleeCrit"', '"crit"') === got) {
      return { class: "equivalent", reason: "aura 52 (melee and ranged crit); the tooltip says \"with melee attacks\" (`meleeCrit`), and the engine adds both keys to melee crit" };
    }
    if (typeof want === "number" && typeof got === "number" && Math.abs(want - got) === 1) return { class: "rounding", reason: "off by one" };
    if (field === "weapon.extraDamage.school") return { class: "layout", reason: "Classic Era ItemSparse has one DamageType; the extra damage's school isn't stored" };
    if (derived?.unknownStatTypes?.length) return { class: "formula-gap", reason: `unknown stat type(s) ${derived.unknownStatTypes.map((u) => u.type).join(", ")}` };
    return { class: "unclassified", reason: "" };
  }

  function compareValue(target, item, field, want, got, derived) {
    const ok = want === got || (want == null && got == null);
    tally(target, field, ok);
    if (ok) return;
    const c = classify(target, item, field, want, got, derived);
    results.push({ id: item.id, name: item.name, tab: item.tab, target, field, want, got, cls: c.class, reason: c.reason, engine: isEngine(field) });
  }

  /** Stats as the snapshot's tooltip reads them: Forever's tooltip adds bonus armor to armor. */
  function comparableStats(derived, build) {
    const s = { ...derived.stats };
    if (build === "forever" && s.bonusArmor) {
      s.armor = (s.armor ?? 0) + s.bonusArmor;
      delete s.bonusArmor;
    }
    return s;
  }

  function compareStats(target, item, want, derived, build) {
    const got = comparableStats(derived, build);
    const keys = new Set([...Object.keys(want), ...Object.keys(got)]);
    for (const k of [...keys].sort()) compareValue(target, item, `stats.${k}`, want[k] ?? 0, got[k] ?? 0, derived);
  }

  function compareWeapon(target, item, want, derived) {
    const got = derived.weapon;
    if (!want && !got) return;
    if (!want || !got) {
      compareValue(target, item, "weapon", want ? "weapon" : null, got ? "weapon" : null, derived);
      return;
    }
    for (const k of ["min", "max", "speed", "dps", "school", "skill"]) compareValue(target, item, `weapon.${k}`, want[k], got[k], derived);
    const we = want.extraDamage ?? [];
    const ge = got.extraDamage ?? [];
    if (we.length || ge.length) {
      compareValue(target, item, "weapon.extraDamage.min", we[0]?.min ?? null, ge[0]?.min ?? null, derived);
      compareValue(target, item, "weapon.extraDamage.max", we[0]?.max ?? null, ge[0]?.max ?? null, derived);
      compareValue(target, item, "weapon.extraDamage.school", we[0]?.school ?? null, ge[0]?.school ?? null, derived);
    }
  }

  const sortedJson = (o) => JSON.stringify(Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v).sort()));

  function compareEffects(target, item, derived) {
    const kinds = { use: 0, proc: 0, equip: 0 };
    for (const e of derived.effects) if (e.kind in kinds) kinds[e.kind]++;
    compareValue(target, item, "effects.use", item.useEffects.length, kinds.use, derived);
    compareValue(target, item, "effects.proc", item.procs.length, kinds.proc, derived);
    compareValue(target, item, "effects.otherEquip", item.otherEquip.length, kinds.equip, derived);
    const uses = derived.effects.filter((e) => e.kind === "use");
    item.useEffects.forEach((u, i) => {
      if (u.cooldownSec === undefined || !uses[i]) return;
      // The tooltip shows the item's own cooldown, else its category's (Stormpike Insignia).
      compareValue(target, item, "effects.useCooldown", u.cooldownSec, (uses[i].cooldownMs ?? uses[i].categoryCooldownMs ?? 0) / 1000, derived);
    });
  }

  /** Compare one item (or its `classic` block) with a derivation. */
  function compareItem(target, item, expected, derived, build) {
    compareStats(target, item, expected.stats, derived, build);
    compareWeapon(target, item, expected.weapon, derived);
    compareValue(target, item, "weaponSkill", sortedJson(expected.weaponSkill), sortedJson(derived.weaponSkill), derived);
    if (expected === item) {
      compareValue(target, item, "setId", item.setId, derived.setId === null ? null : String(derived.setId), derived);
      compareEffects(target, item, derived);
    }
  }

  const coverage = { noForeverRow: [], noRowAnywhere: [] };
  for (const item of pool.items) {
    const f = deriveItem(forever.ctx, item.id);
    const c = deriveItem(classic.ctx, item.id);
    if (!f) (c ? coverage.noForeverRow : coverage.noRowAnywhere).push(item);

    if (item.statsFrom === "forever") {
      if (f) compareItem("forever", item, item, f, "forever");
      else {
        tally("forever", "row", false);
        results.push({ id: item.id, name: item.name, tab: item.tab, target: "forever", field: "row", want: "row", got: null, cls: "no-row", reason: item.foreverSource === "seenInGame" ? "seen-in-game tooltip; the client has no row" : "hotfix-only row (docs/data/client.md#hotfix-caveat)", engine: true });
        // Unchanged items read the same as in Classic Era: check them against that row instead.
        if (item.tab === "unchanged" && c) compareItem("forever-via-classic", item, item, c, "classic");
      }
    } else if (c) compareItem("classic", item, item, c, "classic");
    else {
      tally("classic", "row", false);
      results.push({ id: item.id, name: item.name, tab: item.tab, target: "classic", field: "row", want: "row", got: null, cls: "no-row", reason: "no Classic Era row", engine: true });
    }
    // The Classic Era path, checked on every changed item's Classic tooltip.
    if (item.classic && c) compareItem("changed-classic", item, item.classic, c, "classic");
  }

  // Sets: the snapshot's bonuses (Forever tooltip, else Classic) against ItemSetSpell.
  for (const [setId, set] of Object.entries(pool.sets)) {
    const ctx = set.bonusesFrom === "classic" ? classic.ctx : forever.ctx;
    const target = set.bonusesFrom === "classic" ? "set-classic" : "set-forever";
    const derived = deriveSet(ctx, Number(setId));
    const pseudo = { id: `set ${setId}`, name: set.name, tab: set.bonusesFrom };
    if (!derived) {
      compareValue(target, pseudo, "set.row", "row", null, null);
      continue;
    }
    compareValue(target, pseudo, "set.name", set.name, derived.name, null);
    compareValue(target, pseudo, "set.pieces", set.bonuses.map((b) => b.pieces).join(","), derived.bonuses.map((b) => b.pieces).join(","), null);
    const wantStats = set.bonuses.map((b) => bonusKey(b.pieces, b.parsed, b.weaponSkill)).join(" ");
    compareValue(target, pseudo, "set.bonusStats", wantStats, derivedBonuses(derived), null);
    // Sets the snapshot took from Classic Era (no piece has a Forever tooltip) may still have
    // Forever rows: check what Forever's own ItemSetSpell says.
    if (set.bonusesFrom === "classic") {
      const f = deriveSet(forever.ctx, Number(setId));
      compareValue("set-classic-in-forever", pseudo, "set.bonusStats", derivedBonuses(derived, true), f ? derivedBonuses(f, true) : null, null);
    }
  }

  /** "pieces:{stats}" per bonus; `withText` marks bonuses that aren't flat stats. */
  function bonusKey(pieces, stats, weaponSkill, text = false) {
    return `${pieces}:${text ? "(text)" : sortedJson(stats)}${weaponSkill ? sortedJson(weaponSkill) : ""}`;
  }
  function derivedBonuses(set, withText = false) {
    return set.bonuses.map((b) => bonusKey(b.pieces, b.stats, b.weaponSkill, withText && Boolean(b.unmapped))).join(" ");
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  const bisIds = new Map();
  for (const [spec, s] of Object.entries(bis.specs)) {
    for (const [slot, list] of Object.entries(s.slots)) for (const e of list) {
      if (!bisIds.has(e.id)) bisIds.set(e.id, []);
      bisIds.get(e.id).push(`${spec} ${slot} #${e.rank}`);
    }
  }
  const bisNoRow = coverage.noRowAnywhere.filter((i) => bisIds.has(i.id));
  const bisNoForever = coverage.noForeverRow.filter((i) => bisIds.has(i.id));

  const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "–");
  /** [matched, compared] over the fields of items that have a row ("row" itself is coverage). */
  const totals = (rows, engineOnly = false) =>
    rows.filter((r) => r.field !== "row" && (!engineOnly || r.engine)).reduce((s, r) => [s[0] + r.matched, s[1] + r.compared], [0, 0]);
  const noRow = (rows) => {
    const n = rows.find((r) => r.field === "row")?.compared ?? 0;
    return n ? `; ${n} items without a row` : "";
  };
  const targets = ["forever", "forever-via-classic", "classic", "changed-classic", "set-forever", "set-classic", "set-classic-in-forever"];
  const TARGET_LABEL = {
    forever: "Forever-stat items vs the Forever row",
    "forever-via-classic": "Unchanged items with no Forever row vs the Classic Era row",
    classic: "`statsFrom: \"classic\"` items vs the Classic Era row",
    "changed-classic": "Changed items' `classic` block vs the Classic Era row",
    "set-forever": "Sets with Forever bonuses vs Forever ItemSetSpell",
    "set-classic": "Sets with Classic bonuses vs Classic Era ItemSetSpell",
    "set-classic-in-forever": "Sets with Classic bonuses: Classic Era vs Forever ItemSetSpell (informational)",
  };

  const lines = [];
  lines.push("# Items from the client: comparison with the foreverchanges snapshot", "");
  lines.push(`Forever \`${version}\`, Classic Era \`${baseline}\`, WoWDBDefs \`${dbdefsSha.slice(0, 12)}\`. Generated by \`scripts/scrape/items-client.mjs --compare\` against the last foreverchanges.pro dataset (\`git show b94a076:src/data/items/pre-bis.json\`).`, "");
  lines.push("## Match rate per field", "");
  for (const target of targets) {
    const rows = [...fieldTally.values()].filter((t) => t.target === target).sort((a, b) => (a.field < b.field ? -1 : 1));
    if (!rows.length) continue;
    const all = totals(rows);
    lines.push(`### ${TARGET_LABEL[target]} (${all[0]}/${all[1]}, ${pct(all[0], all[1])}${noRow(rows)})`, "");
    lines.push("| Field | Engine reads | Compared | Match | Rate |", "| --- | --- | --: | --: | --: |");
    for (const r of rows) lines.push(`| \`${r.field}\` | ${r.engine ? "yes" : ""} | ${r.compared} | ${r.matched} | ${pct(r.matched, r.compared)} |`);
    lines.push("");
  }
  lines.push("## Mismatches by class", "");
  const byClass = new Map();
  for (const r of results) {
    if (!byClass.has(r.cls)) byClass.set(r.cls, []);
    byClass.get(r.cls).push(r);
  }
  for (const cls of Object.keys(CLASSES)) {
    const list = byClass.get(cls);
    if (!list) continue;
    lines.push(`### ${CLASSES[cls]} (${list.length}; ${list.filter((r) => r.engine).length} engine-read)`, "");
    lines.push("| Item | Target | Field | Snapshot | Client | Reason |", "| --- | --- | --- | --- | --- | --- |");
    for (const r of list) lines.push(`| ${r.id} ${r.name} (${r.tab}) | ${r.target} | \`${r.field}\` | ${JSON.stringify(r.want)} | ${JSON.stringify(r.got)} | ${r.reason} |`);
    lines.push("");
  }
  lines.push("## Coverage", "");
  lines.push(`- Pool items: ${pool.items.length}; with a Forever ItemSparse row: ${pool.items.length - coverage.noForeverRow.length - coverage.noRowAnywhere.length}.`);
  lines.push(`- **No Forever row, Classic Era row present: ${coverage.noForeverRow.length}** (fall back to Classic stats, flagged, per D6/D17).`);
  lines.push(`- **No row in either client: ${coverage.noRowAnywhere.length}** (would leave the pool).`);
  lines.push(`- Pre-raid BiS items with no row in either client: **${bisNoRow.length}**${bisNoRow.length ? `: ${bisNoRow.map((i) => `${i.id} ${i.name} (${bisIds.get(i.id).join(", ")})`).join("; ")}` : ""}.`);
  lines.push(`- Pre-raid BiS items with no Forever row (Classic fallback): ${bisNoForever.length}.`, "");
  const listItems = (items) => items.map((i) => `${i.id} ${i.name} (${i.tab}${i.foreverSource === "seenInGame" ? ", seen in game" : ""})`).join("; ");
  lines.push("### No Forever row, Classic Era row present", "", listItems(coverage.noForeverRow) || "none", "");
  lines.push("### No row in either client", "", listItems(coverage.noRowAnywhere) || "none", "");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "items-compare.md"), `${lines.join("\n")}\n`);
  fs.writeFileSync(
    path.join(outDir, "items-compare.json"),
    `${JSON.stringify({ version, baseline, fields: [...fieldTally.values()], mismatches: results, coverage: { noForeverRow: coverage.noForeverRow.map((i) => i.id), noRowAnywhere: coverage.noRowAnywhere.map((i) => i.id) } }, null, 1)}\n`,
  );

  // Summary
  for (const target of targets) {
    const rows = [...fieldTally.values()].filter((t) => t.target === target);
    if (!rows.length) continue;
    const all = totals(rows);
    const eng = totals(rows, true);
    console.log(`${target.padEnd(22)} all fields ${all[0]}/${all[1]} (${pct(all[0], all[1])}), engine-read ${eng[0]}/${eng[1]} (${pct(eng[0], eng[1])})${noRow(rows)}`);
  }
  for (const cls of Object.keys(CLASSES)) {
    const list = byClass.get(cls);
    if (list) console.log(`  ${cls.padEnd(16)} ${list.length} mismatches (${list.filter((r) => r.engine).length} engine-read)`);
  }
  console.log(`coverage: ${coverage.noForeverRow.length} items fall back to Classic Era, ${coverage.noRowAnywhere.length} have no row anywhere (${bisNoRow.length} on the BiS lists)`);
  for (const i of bisNoRow) console.warn(`WARNING: pre-raid BiS item ${i.id} ${i.name} has no row in either client (${bisIds.get(i.id).join(", ")})`);
  console.log(`report: ${path.relative(repoRoot, path.join(outDir, "items-compare.md"))}`);

  const unexplained = results.filter((r) => r.engine && r.cls === "unclassified");
  if (unexplained.length) console.error(`${unexplained.length} engine-read mismatches have no stated reason (see the report)`);
  return unexplained.length === 0;
}
