// A class's spellbook from the client tables: the spells a trainer teaches or the game grants
// automatically (SkillLineAbility), the active talents' spells, and each rank's cost, cast time,
// cooldown, range, school, icon, forms, equipped-item requirement and rendered tooltip. The same
// code reads the Forever beta client and the Classic Era client, and pairs the two books spell by
// spell and rank by rank. Pure functions, zero dependencies: callers pass parsed tables (see
// SPELLBOOK_TABLES) and a spell-text context per build. scripts/scrape/spells-client.mjs writes
// src/data/spells/<class>.json from them; docs/data/spells.md documents the rules.

import { renderSpellText } from "./spell-text.mjs";
import { createTooltipContext, equippedRequirement } from "./talent-tree.mjs";

/** Tables this module reads in both builds (plus SPELL_TEXT_TABLES and the talent-tree tables). */
export const SPELLBOOK_TABLES = [
  "SkillLineAbility",
  "SkillLine",
  "SpellLevels",
  "SpellMisc",
  "SpellPower",
  "SpellCooldowns",
  "SpellCastTimes",
  "SpellRange",
  "SpellShapeshift",
  "SpellShapeshiftForm",
  "SpellEquippedItems",
  "ItemSubClass",
  "ChrClasses",
  "SpellClassOptions",
];

/** ChrClasses.Name_lang of each class slug. */
export const CLASS_NAME = { warrior: "Warrior", paladin: "Paladin", druid: "Druid", shaman: "Shaman", rogue: "Rogue", mage: "Mage" };
/** SpellClassOptions.SpellClassSet of each class (the spell family). */
const SPELL_FAMILY = { warrior: 4, paladin: 10, druid: 7, shaman: 11, rogue: 8, mage: 3 };

/** SkillLine.CategoryID of class skill lines (Arms, Feral Combat, Holy, Mounts, …). */
const CLASS_SKILL_CATEGORY = 7;
/**
 * Class-skill lines of Season of Discovery's rune engraving, which both clients still ship: the
 * rune-engraving spells (Engraving) and the rune-slot placeholders (Runes: Chest Rune Ability,
 * Soul Engraving). Neither holds a spell a trainer teaches.
 */
const ENGRAVING_LINES = new Set(["Engraving", "Runes"]);
/** SkillLineAbility.AcquireMethod: 0 taught by a trainer, 2 learned automatically (3 = granted by another spell). */
const LEARNED = new Set([0, 2]);
/**
 * Why a trainer row is left out when the build has no SpellName row for its spell: the client
 * carries no data for it (possibly a server hotfix). spells-client.mjs lists these rows in the
 * dataset's `meta.noClientData` (docs/data/spells.md#trainer-rows-with-no-client-data).
 */
export const NO_CLIENT_DATA = "no SpellName (encrypted or absent)";
/** SPELL_ATTR0_DO_NOT_DISPLAY: kept out of the spellbook (stance passives, talent effects). */
const ATTR0_HIDDEN = 0x80;
/** SPELL_ATTR1_CHANNELED_1 | SPELL_ATTR1_CHANNELED_2. */
const ATTR1_CHANNELED = 0x4 | 0x40;
/**
 * The Classic Era 1.15 client ships Season of Discovery's spells in the same tables (ids from
 * 400,000 up, added with 1.15.0). No original Classic class spell has an id that high, so the
 * Classic baseline stops below it (doctrine: never Season of Discovery values).
 */
export const CLASSIC_SPELL_ID_LIMIT = 400000;

const POWER = {
  0: { name: "Mana", resource: "mana", scale: 1 },
  1: { name: "Rage", resource: "rage", scale: 10 },
  3: { name: "Energy", resource: "energy", scale: 1 },
  [-2]: { name: "Health", resource: "health", scale: 1 },
};
const SCHOOLS = ["physical", "holy", "fire", "nature", "frost", "shadow", "arcane"];

const rowsOf = (t) => t?.rows ?? [];
export const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** Spell and tab ids: "Nature's Grasp" → "nature-s-grasp" (every run of other characters is one "-"). */
export const idSlug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const round = (x) => Math.round(x * 100) / 100;
const firstBySpell = (t) => {
  const m = new Map();
  for (const r of rowsOf(t)) if (!r.DifficultyID && !m.has(r.SpellID)) m.set(r.SpellID, r);
  return m;
};

/** The race mask columns: RaceMasks in Forever's layout, RaceMask in Classic Era's. */
export const raceMaskOf = (row) => row.RaceMasks ?? row.RaceMask ?? [0, 0];
/** Whether a [low, high] race mask includes a PlayableRaceBit (an all-zero mask means every race). */
export function maskHasRace(mask, bit) {
  if (!mask[0] && !mask[1]) return true;
  return bit < 32 ? ((mask[0] >>> 0) & 2 ** bit) !== 0 : ((mask[1] >>> 0) & 2 ** (bit - 32)) !== 0;
}

// ---------------------------------------------------------------------------
// Rank fields
// ---------------------------------------------------------------------------

/** Lookups for rank fields, one per build. `iconName(fdid)` names an icon file. */
export function createBookContext(tables, { text, iconName }) {
  const t = tables;
  const power = new Map();
  for (const r of [...rowsOf(t.SpellPower)].sort((a, b) => a.OrderIndex - b.OrderIndex || a.ID - b.ID)) if (!power.has(r.SpellID)) power.set(r.SpellID, r);
  return {
    tables: t,
    text,
    iconName,
    tooltip: createTooltipContext(t),
    misc: firstBySpell(t.SpellMisc),
    levels: firstBySpell(t.SpellLevels),
    cooldowns: firstBySpell(t.SpellCooldowns),
    shapeshift: new Map(rowsOf(t.SpellShapeshift).map((r) => [r.SpellID, r])),
    forms: t.SpellShapeshiftForm.byId,
    power,
    castTimes: t.SpellCastTimes.byId,
    ranges: t.SpellRange.byId,
    name: (id) => t.SpellName.byId.get(id)?.Name_lang ?? null,
    subtext: (id) => t.Spell.byId.get(id)?.NameSubtext_lang || null,
    family: new Map(rowsOf(t.SpellClassOptions).map((r) => [r.SpellID, r.SpellClassSet])),
  };
}

/** Training level of a spell: SpellLevels.BaseLevel, else SpellLevel; null when neither is set. */
export function trainedLevel(ctx, id) {
  const l = ctx.levels.get(id);
  return l?.BaseLevel || l?.SpellLevel || null;
}

const attr = (ctx, id, i) => (ctx.misc.get(id)?.Attributes?.[i] ?? 0) >>> 0;

/** "Rank 5" → 5; any other subtext (or none) → null. */
export function rankNumber(subtext) {
  const m = /^Rank (\d+)$/.exec(subtext ?? "");
  return m ? Number(m[1]) : null;
}

/** Formats a duration in whole units as the spellbook prints cooldowns: "6 sec", "2 min", "1 hr". */
export function formatCooldownSeconds(s) {
  if (s < 60) return `${round(s)} sec`;
  if (s < 3600) return `${round(s / 60)} min`;
  return `${round(s / 3600)} hr`;
}

export function costOf(ctx, id) {
  const p = ctx.power.get(id);
  if (!p) return null;
  const kind = POWER[p.PowerType];
  if (p.PowerCostPct) {
    const pct = round(p.PowerCostPct);
    return { raw: `${pct}% of base ${(kind?.name ?? "power").toLowerCase()}`, amount: null, resource: kind?.resource ?? null, percentOfBase: pct };
  }
  if (p.ManaCost) {
    const amount = round(p.ManaCost / (kind?.scale ?? 1));
    return { raw: `${amount} ${kind?.name ?? "Power"}`, amount, resource: kind?.resource ?? null };
  }
  return null;
}

export function castTimeOf(ctx, id) {
  if (attr(ctx, id, 1) & ATTR1_CHANNELED) return { raw: "Channeled", seconds: null, channeled: true };
  const index = ctx.misc.get(id)?.CastingTimeIndex;
  const ms = index ? (ctx.castTimes.get(index)?.Base ?? 0) : 0;
  return ms > 0 ? { raw: `${round(ms / 1000)} sec cast`, seconds: round(ms / 1000), channeled: false } : { raw: "Instant", seconds: 0, channeled: false };
}

export function cooldownOf(ctx, id) {
  const cd = ctx.cooldowns.get(id);
  const ms = Math.max(cd?.RecoveryTime ?? 0, cd?.CategoryRecoveryTime ?? 0);
  return ms > 0 ? { raw: `${formatCooldownSeconds(ms / 1000)} cooldown`, seconds: round(ms / 1000) } : null;
}

export function rangeOf(ctx, id) {
  const index = ctx.misc.get(id)?.RangeIndex;
  const r = index ? ctx.ranges.get(index) : null;
  const max = r?.RangeMax?.[0] ?? 0;
  if (!r || max <= 0) return null;
  if (r.Flags & 1) return { raw: "Melee range", yards: null, melee: true };
  const min = r.RangeMin?.[0] ?? 0;
  return min > 0 ? { raw: `${round(min)}-${round(max)} yd range`, yards: round(max), melee: false, minYards: round(min) } : { raw: `${round(max)} yd range`, yards: round(max), melee: false };
}

export function schoolOf(ctx, id) {
  const mask = ctx.misc.get(id)?.SchoolMask ?? 0;
  const names = SCHOOLS.filter((_, bit) => mask & (1 << bit));
  return names.length ? names.join("+") : null;
}

/** The stances or forms the spell may be used in (SpellShapeshift.ShapeshiftMask), or null. */
export function formsOf(ctx, id) {
  const mask = ctx.shapeshift.get(id)?.ShapeshiftMask ?? [0, 0];
  const names = [];
  for (let bit = 0; bit < 64; bit++) {
    const on = bit < 32 ? ((mask[0] >>> 0) & 2 ** bit) !== 0 : ((mask[1] >>> 0) & 2 ** (bit - 32)) !== 0;
    if (on) names.push(ctx.forms.get(bit + 1)?.Name_lang || `form ${bit + 1}`);
  }
  return names.length ? names : null;
}

/** Every field of one rank: the SpellRank shape of src/data/spells/types.ts. */
export function rankFields(ctx, id, { level }) {
  const out = renderSpellText(ctx.text, id, { conditions: "unmet", lines: true, wholeExpressions: true });
  const icon = ctx.misc.get(id)?.SpellIconFileDataID;
  return {
    rank: {
      spellId: id,
      rankLabel: ctx.subtext(id),
      level,
      text: out.text || null,
      cost: costOf(ctx, id),
      castTime: castTimeOf(ctx, id),
      cooldown: cooldownOf(ctx, id),
      range: rangeOf(ctx, id),
      school: schoolOf(ctx, id),
      icon: icon ? ctx.iconName(icon, `spell ${id}`) : null,
      forms: formsOf(ctx, id),
      requires: equippedRequirement(ctx.tooltip, id),
    },
    unrendered: out.unrendered,
  };
}

// ---------------------------------------------------------------------------
// The book of one build
// ---------------------------------------------------------------------------

/**
 * The spellbook of `cls` in one build. `talents` are the class's talents as
 * [{ name, tabName, spellIds, active }] (the Forever Trait tree or the Classic Era Talent table).
 * Returns { tabs: [{ name, skillLineId, iconFileDataId, talentTab }], spells: Map(norm name →
 * BookSpell), passiveTalents: Map(norm name → talent), excluded: [{ id, name, why }] } where
 *   BookSpell = { name, tab, isTalent, grantedByTalent, rows: [{ spellId, rank, level, raceMasks[], fromTalent }] }
 * `classic: true` applies the Season of Discovery id limit; `skip` (Map of spell id → reason)
 * leaves out rows no rule can tell apart (cut content).
 */
export function readBook(ctx, cls, { talents, talentTabs, classic = false, skip = new Map() }) {
  const t = ctx.tables;
  const classId = rowsOf(t.ChrClasses).find((c) => c.Name_lang === CLASS_NAME[cls])?.ID;
  if (!classId) throw new Error(`unknown class ${cls}`);
  const bit = 2 ** (classId - 1);
  const excluded = [];
  const byName = new Map();
  const lineName = (id) => t.SkillLine.byId.get(id)?.DisplayName_lang ?? `SkillLine ${id}`;

  // Candidate rows: SkillLineAbility rows of a class-skill line for the class. A row with no
  // class mask counts only in the class's own talent-tree lines and for a spell of the class's
  // family (Innervate, Omen of Clarity, Holy Light rank 5); elsewhere (Mounts) it means every
  // class, and the family-less ones are proc effects (Classic Sweeping Strikes 12723). The Season
  // of Discovery engraving lines hold rune slots, not spells.
  const tabNames = new Set(talentTabs.map((tab) => tab.name));
  const specLines = new Set();
  for (const r of rowsOf(t.SkillLineAbility))
    if (r.ClassMask && (r.ClassMask >>> 0) & bit && tabNames.has(lineName(r.SkillLine)) && t.SkillLine.byId.get(r.SkillLine)?.CategoryID === CLASS_SKILL_CATEGORY) specLines.add(r.SkillLine);
  const candidates = new Map(); // spell id → { id, name, lineId, raceMasks[] }
  for (const r of rowsOf(t.SkillLineAbility)) {
    const line = t.SkillLine.byId.get(r.SkillLine);
    if (line?.CategoryID !== CLASS_SKILL_CATEGORY || ENGRAVING_LINES.has(line.DisplayName_lang)) continue;
    if (r.ClassMask ? !((r.ClassMask >>> 0) & bit) : !specLines.has(r.SkillLine) || ctx.family.get(r.Spell) !== SPELL_FAMILY[cls]) continue;
    const id = r.Spell;
    const name = ctx.name(id);
    const why = !LEARNED.has(r.AcquireMethod)
      ? `acquire method ${r.AcquireMethod}`
      : !name
        ? NO_CLIENT_DATA
        : attr(ctx, id, 0) & ATTR0_HIDDEN
          ? "hidden from the spellbook"
          : !trainedLevel(ctx, id)
            ? "no training level"
            : !t.Spell.byId.get(id)?.Description_lang
              ? "no tooltip"
              : classic && id >= CLASSIC_SPELL_ID_LIMIT
                ? "Season of Discovery id range"
                : (skip.get(id) ?? null);
    if (why) {
      excluded.push({ id, name, line: lineName(r.SkillLine), why, acquireMethod: r.AcquireMethod, supersedes: r.SupercedesSpell || null });
      continue;
    }
    const c = candidates.get(id) ?? { id, name, lineId: r.SkillLine, raceMasks: [], supersedes: new Set() };
    c.raceMasks.push(raceMaskOf(r));
    if (r.SupercedesSpell) c.supersedes.add(r.SupercedesSpell);
    candidates.set(id, c);
  }

  // Components: a spell whose numbers another candidate's tooltip reads is part of that spell,
  // not a spellbook entry (Aquatic Form (Passive) 5421, read by Aquatic Form's "$5421s1").
  const readBy = new Map();
  for (const c of candidates.values())
    for (const m of (t.Spell.byId.get(c.id)?.Description_lang ?? "").matchAll(/\$(\d+)[a-zA-Z]/g)) if (Number(m[1]) !== c.id) readBy.set(Number(m[1]), c.name);
  for (const c of [...candidates.values()]) {
    if (!readBy.has(c.id)) continue;
    excluded.push({ id: c.id, name: c.name, line: lineName(c.lineId), why: `component: read by ${readBy.get(c.id)}'s tooltip` });
    candidates.delete(c.id);
  }

  for (const c of candidates.values()) {
    const key = norm(c.name);
    if (!byName.has(key)) byName.set(key, { name: c.name, lineId: c.lineId, rows: new Map() });
    byName.get(key).rows.set(c.id, { spellId: c.id, rank: rankNumber(ctx.subtext(c.id)), level: trainedLevel(ctx, c.id), raceMasks: c.raceMasks, fromTalent: false });
  }

  // Two spells under one rank number: the book keeps the first (lowest id). Seal of Righteousness
  // Rank 1 is 20154, learned automatically at level 1; 21084 is the trainer's copy that
  // supersedes it (SkillLineAbility.SupercedesSpell) with the same seal values.
  for (const entry of byName.values()) {
    const byRank = new Map();
    for (const x of entry.rows.values()) if (x.rank !== null) byRank.set(x.rank, [...(byRank.get(x.rank) ?? []), x]);
    for (const [n, rows] of byRank) {
      if (rows.length < 2) continue;
      const keep = rows.reduce((a, b) => (b.spellId < a.spellId ? b : a));
      for (const x of rows.filter((y) => y !== keep)) {
        const how = candidates.get(x.spellId)?.supersedes.has(keep.spellId) ? `supersedes ${keep.spellId}` : `duplicates ${keep.spellId}`;
        excluded.push({ id: x.spellId, name: entry.name, line: lineName(entry.lineId), why: `second rank ${n} (${how})` });
        entry.rows.delete(x.spellId);
      }
    }
  }

  // A spell with numbered ranks keeps only those: an unnumbered row under its name is a
  // component (Bloodthirst's heal 23880–23891 in Classic Era, Execute's damage spell 20647).
  for (const entry of byName.values()) {
    const rows = [...entry.rows.values()];
    if (rows.some((x) => x.rank !== null))
      for (const x of rows.filter((y) => y.rank === null)) {
        excluded.push({ id: x.spellId, name: entry.name, line: lineName(entry.lineId), why: "unnumbered component of a ranked spell" });
        entry.rows.delete(x.spellId);
      }
  }

  // Talents: an active talent is a spellbook spell; its spells are marked as coming from the
  // talent point. Passive talents are kept aside, for the Classic comparison ("was a talent").
  const passiveTalents = new Map();
  for (const tal of talents) {
    const key = norm(tal.name);
    if (!tal.active) {
      passiveTalents.set(key, tal);
      continue;
    }
    if (!byName.has(key)) byName.set(key, { name: tal.name, lineId: null, rows: new Map() });
    const entry = byName.get(key);
    entry.talentTab = tal.tabName;
    entry.isTalent = true;
    for (const id of tal.spellIds) {
      const row = entry.rows.get(id) ?? { spellId: id, rank: rankNumber(ctx.subtext(id)), level: trainedLevel(ctx, id), raceMasks: [[0, 0]], fromTalent: false };
      row.fromTalent = true;
      entry.rows.set(id, row);
    }
  }

  // Tabs: the talent trees' skill lines in tree order, then the class's other skill lines.
  const lineIds = [...new Set([...byName.values()].map((e) => e.lineId).filter((x) => x !== null))];
  const tabs = [];
  for (const tab of talentTabs) {
    const lineId = lineIds.find((id) => specLines.has(id) && lineName(id) === tab.name) ?? null;
    tabs.push({ name: tab.name, skillLineId: lineId, iconFileDataId: lineId ? t.SkillLine.byId.get(lineId).SpellIconFileID : tab.iconFileDataId, talentTab: true });
  }
  for (const id of lineIds.sort((a, b) => a - b))
    if (!tabs.some((x) => x.skillLineId === id)) tabs.push({ name: lineName(id), skillLineId: id, iconFileDataId: t.SkillLine.byId.get(id).SpellIconFileID, talentTab: false });

  const spells = new Map();
  for (const [key, e] of byName) {
    const rows = [...e.rows.values()].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || (a.rank === null) - (b.rank === null) || a.spellId - b.spellId);
    const grantedByTalent = !!e.isTalent && rows.every((x) => x.fromTalent);
    // A spell that only comes with a talent point has no training level (its SpellLevels row
    // holds the talent's tier level or 1).
    if (grantedByTalent) for (const x of rows) x.level = null;
    spells.set(key, { name: e.name, tab: e.lineId !== null ? lineName(e.lineId) : e.talentTab, isTalent: !!e.isTalent, grantedByTalent, rows });
  }
  return { tabs: tabs.filter((tab) => [...spells.values()].some((s) => s.tab === tab.name)), spells, passiveTalents, excluded };
}

/**
 * Races (PlayableRaceBit → name) of `races` that can learn a spell whose rows carry these race
 * masks, or null when every one of them can.
 */
export function learnableBy(rows, races) {
  const masks = rows.flatMap((r) => r.raceMasks);
  const can = races.filter((race) => masks.some((m) => maskHasRace(m, race.bit)));
  return can.length === races.length ? null : can.map((r) => r.name).sort();
}

// ---------------------------------------------------------------------------
// Forever vs Classic Era
// ---------------------------------------------------------------------------

/**
 * Pair a spell's Forever rows with its Classic rows: numbered ranks by rank number; an
 * unnumbered Forever row with the Classic row of the same spell id; a lone unnumbered Forever
 * row with the highest remaining Classic rank (Tactical Mastery 1310185 with the Classic talent's
 * rank 5); Classic ranks left over stand alone (Tiger's Fury ranks 2 to 4).
 * Returns [{ rank, forever: row | null, classic: row | null }].
 */
export function pairRows(forever, classic) {
  const pairs = [];
  const used = new Set();
  const classicByRank = new Map(classic.filter((c) => c.rank !== null).map((c) => [c.rank, c]));
  for (const f of forever) {
    let c = null;
    if (f.rank !== null) c = classicByRank.get(f.rank) ?? null;
    if (f.rank === null) c = classic.find((x) => x.spellId === f.spellId && !used.has(x)) ?? null;
    if (c) used.add(c);
    pairs.push({ rank: f.rank, forever: f, classic: c });
  }
  const loose = forever.length === 1 && forever[0].rank === null && !pairs[0].classic ? classic.filter((c) => !used.has(c)) : [];
  if (loose.length) {
    const c = loose.reduce((a, b) => ((b.rank ?? 0) > (a.rank ?? 0) ? b : a));
    pairs[0].classic = c;
    used.add(c);
  }
  for (const c of classic) if (!used.has(c)) pairs.push({ rank: c.rank, forever: null, classic: c });
  return pairs.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || (a.rank === null) - (b.rank === null));
}

const NUMBER = /\d+(?:\.\d+)?/g;
const ws = (s) => (s ?? "").replace(/\s+/g, " ").trim();

/** What differs between two tooltip texts, in a few words, or null. */
export function textChange(forever, classic) {
  const f = ws(forever).toLowerCase();
  const c = ws(classic).toLowerCase();
  if (f === c) return null;
  const fn = f.match(NUMBER) ?? [];
  const cn = c.match(NUMBER) ?? [];
  if (fn.join() === cn.join()) return { field: "text", text: "Same numbers, reworded" };
  if (fn.length !== cn.length) return { field: "text", text: "Tooltip rewritten" };
  const diffs = fn.map((x, i) => (x === cn[i] ? null : `${x} instead of ${cn[i]}`)).filter(Boolean);
  const reworded = f.replace(NUMBER, "#") !== c.replace(NUMBER, "#") ? ", reworded" : "";
  return { field: "value", text: `${diffs.join(", ")}${reworded}` };
}

const list = (xs) => (xs?.length ? xs.join(", ") : null);

/** Field-by-field differences of one rank pair (both sides present). */
export function rankDifferences(f, c) {
  const out = [];
  const cmp = (field, a, b, say) => {
    if ((a ?? null) !== (b ?? null)) out.push({ field, text: say(a, b) });
  };
  cmp("level", f.level, c.level, (a, b) => `Trained at level ${a ?? "—"} instead of ${b ?? "—"}`);
  cmp("cost", f.cost?.raw, c.cost?.raw, (a, b) => (a ? `Costs ${a} instead of ${b ?? "nothing"}` : `Costs nothing instead of ${b}`));
  cmp("castTime", f.castTime?.raw, c.castTime?.raw, (a, b) => `${a ?? "No cast time"} instead of ${b ?? "none"}`);
  cmp("cooldown", f.cooldown?.raw, c.cooldown?.raw, (a, b) => (a ? `${a[0].toUpperCase()}${a.slice(1)} instead of ${b ?? "none"}` : `No cooldown instead of ${b}`));
  cmp("range", f.range?.raw, c.range?.raw, (a, b) => `${a ?? "No range"} instead of ${b ?? "none"}`);
  cmp("school", f.school, c.school, (a, b) => `${a ?? "no"} school instead of ${b ?? "none"}`);
  cmp("form", list(f.forms), list(c.forms), (a, b) => (a ? `Usable in ${a}${b ? ` (Classic: ${b})` : " (Classic: no form needed)"}` : `No form needed (Classic: ${b})`));
  cmp("requires", f.requires, c.requires, (a, b) => (a ? `Requires ${a}${b ? ` (Classic: ${b})` : " (Classic: nothing)"}` : `Requires nothing (Classic: ${b})`));
  const tc = textChange(f.text, c.text);
  if (tc) out.push(tc);
  return out;
}
