// Reads spell, item and enchant ids out of the project's research docs, so the client-data
// scraper extracts exactly what the docs talk about.
//
// parseBuffsDoc(markdown) reads the tables of docs/mechanics/buffs-debuffs-consumables.md:
//   §1 raid and party buffs      ID column = spell ids            ("25289", "17007 (aura 24932)")
//   §2 world buffs               skipped (excluded by directive, D8)
//   §3 consumables               ID column = item ids, then a chain of "→" steps: the item's
//                                spell, "enchant N" and the enchant's own spell
//                                ("13510 → 17626", "12662 / 20520 → 16666 / 27869",
//                                 "18262 → enchant 2506", "20750 → 25121 → enchant 2627 → 25111";
//                                 "13810 → 18124 → 18125" is the item's spell, then what it triggers)
//   §4 target debuffs            ID column = spell ids, or "item 12798 → 16928"
//   §5 enchants                  "IDs (spell / enchant)" = "20034 / 1900 → 20007";
//                                "Item → enchant" = "11645 / … / 11649 → 1506–1510"
// Removed talents ("talent (C: 12318)") and Classic-only ids ("(C: …)", "(Classic)") are
// skipped. Every entry keeps the doc's name and section, so the scraper can report ids the
// client lacks and doc mappings the client contradicts. A row's catalogue key ("Wizard Oil
// (`wizardOil`)") isn't part of its name. An ID cell the parser can't read goes to `problems`,
// and the scraper fails on it: a doc edit must never drop an id from the data without a word
// (docs/data/client.md#what-the-docs-decide).
//
// docSpellMentions(markdown, spellName) finds spell ids cited anywhere in a doc whose
// client spell name appears on the same line, before the id (name-verified, so stray
// numbers such as armor values are not picked up).

import fs from "node:fs";
import path from "node:path";

/** The doc whose tables name the buffs, consumables and enchants (parseBuffsDoc). */
export const BUFFS_DOC = "docs/mechanics/buffs-debuffs-consumables.md";

/** The docs whose spell citations join the interest set (docSpellMentions), repo-relative and sorted. */
export function citingDocs(repoRoot) {
  return [
    ...fs.readdirSync(path.join(repoRoot, "docs/classes")).map((f) => `docs/classes/${f}`),
    ...fs.readdirSync(path.join(repoRoot, "docs/mechanics")).map((f) => `docs/mechanics/${f}`),
    "docs/open-questions.md",
  ]
    .filter((f) => f.endsWith(".md"))
    .sort();
}

const clean = (s) =>
  s
    .replace(/\*\*/g, "")
    .replace(/‡/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\(C: [^)]*\)/g, "")
    .replace(/\(Classic\)/g, "")
    .replace(/\br\d+\s+(?=\d)/g, "")
    .trim();

const ids = (s) => [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));

function splitRow(line) {
  const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  return cells.map((c) => c.trim());
}

function rowName(cell) {
  return cell
    .replace(/\*\*/g, "")
    .replace(/\*\([^)]*\)\*/g, "")
    .replace(/\s*\(`\w+`\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @returns {{
 *   buffSpells: Array<{spellId: number, name: string, section: string}>,
 *   consumables: Array<{itemId: number, name: string, section: string, spellIds: number[], enchantIds: number[], enchantSpellIds: number[]}>,
 *   enchants: Array<{name: string, section: string, spellIds: number[], enchantIds: number[], itemIds: number[], procSpellIds: number[]}>,
 *   problems: string[],
 * }}
 */
export function parseBuffsDoc(markdown) {
  const buffSpells = [];
  const consumables = [];
  const enchants = [];
  const problems = [];
  let section = "";
  let top = 0;
  let header = null;
  let idCol = -1;
  let idKind = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      section = h[2].replace(/\s+/g, " ").trim();
      const num = /^(\d+)\./.exec(section);
      if (h[1] === "##") top = num ? Number(num[1]) : 0;
      header = null;
      continue;
    }
    if (!line.startsWith("|")) {
      header = null;
      continue;
    }
    const cells = splitRow(line);
    if (!header) {
      header = cells;
      idCol = cells.findIndex((c) => /^(ID|IDs|IDs \(spell \/ enchant\)|Item → enchant)$/.test(c));
      idKind = idCol < 0 ? null : cells[idCol];
      continue;
    }
    if (cells.every((c) => /^-+$/.test(c))) continue;
    if (idCol < 0 || top === 0 || top === 2 || top > 5) continue;
    const name = rowName(top === 5 && header[0] === "Slot" ? `${cells[0]} – ${cells[1]}` : cells[0]);
    const cell = clean(cells[idCol] ?? "");
    if (!cell || cell === "—" || /^talent\b/.test(cell)) continue;
    // Rows for spells Forever removed ("**Not in Forever**", "**Removed**") carry Classic ids.
    if (/\(Classic\)/.test(cells[idCol]) || cells.some((c) => /^(\*\*)?(Not in Forever|Removed)\b/.test(c))) continue;

    if (top === 1) {
      for (const id of ids(cell)) buffSpells.push({ spellId: id, name, section });
    } else if (top === 4) {
      const m = /^item (\d+) → (\d+)/.exec(cell);
      if (m) consumables.push({ itemId: Number(m[1]), name, section, spellIds: [Number(m[2])], enchantIds: [], enchantSpellIds: [] });
      else for (const id of ids(cell)) buffSpells.push({ spellId: id, name, section });
    } else if (top === 3) {
      const chain = consumableChain(cell);
      if (typeof chain === "string") {
        problems.push(`${section}, ${name}: ${chain} in "${cells[idCol]}"`);
        continue;
      }
      const { itemIds, spellIds, enchantIds, enchantSpellIds } = chain;
      itemIds.forEach((itemId, k) => {
        // "A / B → C / D" pairs index-wise; "A / B → C" gives both items C.
        const s = spellIds.length === itemIds.length ? [spellIds[k]] : spellIds;
        consumables.push({ itemId, name, section, spellIds: s, enchantIds, enchantSpellIds });
      });
    } else if (top === 5) {
      if (idKind === "Item → enchant") {
        const [left, right = ""] = cell.split("→").map((s) => s.trim());
        const range = /^(\d+)\s*[–-]\s*(\d+)$/.exec(right);
        const enchantIds = range
          ? Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, k) => Number(range[1]) + k)
          : ids(right);
        const itemIds = ids(left);
        enchants.push({ name, section, spellIds: [], enchantIds, itemIds, procSpellIds: [] });
      } else {
        // "spell / enchant" pairs, optionally "→ proc spell"; several pairs separated by ", ".
        for (const part of cell.split(/,\s*/)) {
          const [pair, proc = ""] = part.split("→").map((s) => s.trim());
          const [spell, enchant] = ids(pair);
          if (spell === undefined) continue;
          enchants.push({
            name,
            section,
            spellIds: [spell],
            enchantIds: enchant === undefined ? [] : [enchant],
            itemIds: [],
            procSpellIds: ids(proc),
          });
        }
      }
    }
  }
  return { buffSpells, consumables, enchants, problems };
}

/**
 * A §3 ID cell: "items → the item's spell(s) → … → enchant N → the enchant's spell(s)", each step
 * after the items optional. The item's spell is the first step unless that step is the enchant;
 * later spell steps before the enchant, or with no enchant, are spells it triggers, which the
 * scraper's trigger closure reaches on its own. Returns the reason when the cell has another shape.
 */
function consumableChain(cell) {
  const steps = cell.split("→").map((s) => s.trim());
  const itemIds = ids(steps[0]);
  if (itemIds.length === 0) return "no item id";
  if (steps.slice(1).some((s) => ids(s).length === 0)) return "a step with no id";
  const enchantSteps = steps.flatMap((s, k) => (k > 0 && /^enchant\b/.test(s) ? [k] : []));
  if (enchantSteps.length > 1) return "more than one enchant";
  if (steps.some((s, k) => !enchantSteps.includes(k) && /\benchant\b/.test(s))) return "an enchant that doesn't start its step";
  const e = enchantSteps[0] ?? -1;
  return {
    itemIds,
    spellIds: steps.length > 1 && e !== 1 ? ids(steps[1]) : [],
    enchantIds: e > 0 ? ids(steps[e]) : [],
    enchantSpellIds: e > 0 ? steps.slice(e + 1).flatMap(ids) : [],
  };
}

// Explicit spell markers: "spell 12966", "spells 1310196", "[F 20128]", "proc 25713",
// "DB2 21184", "aura 24932" (4+ digits: aura *types* are below 1000), "passive 1306459",
// backticked ids, and parenthesised id lists "(3025, 1178, 9635)".
const MARKERS = [
  /\bspells?,? (?:id )?(\d{3,7})\b/gi,
  /\[[Ff] (\d{3,7})\]/g,
  /\bprocs? (?:into )?(\d{3,7})\b/gi,
  /\bDB2 (\d{3,7})\b/g,
  /\baura (\d{4,7})\b/gi,
  /\bpassive (\d{4,7})\b/gi,
  /\btriggers? (\d{4,7})\b/gi,
  /`(\d{4,7})`/g,
];
const RANGE = /\bspells? (\d{4,7})[–-](\d{4,7})\b/gi;
const LIST = /\((\d{4,7}(?:,\s*\d{4,7})+)\)/g;

/**
 * Spell ids cited in a doc: ids with an explicit spell marker (see MARKERS), and ids whose
 * client spell name appears on the same line within 80 characters before them
 * (case-insensitive). Only ids the client knows (`spellName(id)` not null) are returned.
 * @returns {Map<number, string>} id -> name
 */
export function docSpellMentions(markdown, spellName) {
  const found = new Map();
  const add = (id) => {
    const name = spellName(id);
    if (name) found.set(id, name);
  };
  for (const raw of markdown.split(/\r?\n/)) {
    if (/^\[[^\]]+\]:\s*<?https?:/.test(raw.trim())) continue; // link reference definitions
    // Classic Era ids ("(C: 12318)", "Classic 23602") are not Forever spells.
    const line = raw.replace(/\(C:[^)]*\)/g, "").replace(/\bClassic:? \d+/g, "");
    for (const re of MARKERS) for (const m of line.matchAll(re)) add(Number(m[1]));
    for (const m of line.matchAll(RANGE)) {
      const [lo, hi] = [Number(m[1]), Number(m[2])];
      if (hi > lo && hi - lo <= 20) for (let id = lo; id <= hi; id++) add(id);
    }
    for (const m of line.matchAll(LIST)) for (const id of m[1].split(/,\s*/)) add(Number(id));
    const lower = line.toLowerCase();
    for (const m of line.matchAll(/(?<![\w.%-])(\d{3,7})(?![\w.%])/g)) {
      const id = Number(m[1]);
      const name = spellName(id);
      if (!name || name.length < 4) continue;
      const at = lower.lastIndexOf(name.toLowerCase(), m.index);
      if (at >= 0 && m.index - at <= 80) found.set(id, name);
    }
  }
  return found;
}
