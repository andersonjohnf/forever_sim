// Races, their classes and their racials from the client tables: ChrRaces (names, faction,
// PlayableRaceBit), CharBaseInfo (race/class pairs) and the racial skill lines of
// SkillLineAbility. Pure functions, zero dependencies; scripts/scrape/races-client.mjs writes
// src/data/races/races.json from them and docs/data/races.md documents the rules.

import { idSlug, maskHasRace, raceMaskOf } from "./spellbook.mjs";

/** Tables this module reads in both builds (plus the spellbook and spell-text tables). */
export const RACE_TABLES = ["ChrRaces", "CharBaseInfo", "ChrClasses", "SkillLine", "SkillLineAbility"];

/** SPELL_ATTR0_DO_NOT_DISPLAY: hidden helper spells (Night Elf "Quickness Passive" 21009). */
const ATTR0_HIDDEN = 0x80;
/** Racial skill lines are named for it: "Orc Racial", "Racial - Undead", "Skyborne Racial". */
const RACIAL_LINE = /\bRacial\b/;

const rowsOf = (t) => t?.rows ?? [];

/**
 * The display parts of a ChrRaces row. A faction variant is named "<variant> <base>" with the
 * base as its ClientFileString ("Windshaper Skyborne", "Skyborne"): its display name is
 * "Skyborne (Windshaper)" and its id "horde-skyborne-windshaper". Other races keep their name
 * ("Night Elf" → "alliance-night-elf"; Undead's ClientFileString is "Scourge").
 */
export function raceNames(row) {
  const faction = row.Alliance === 0 ? "Alliance" : row.Alliance === 1 ? "Horde" : null;
  const base = row.ClientFileString;
  const variant = row.Name_lang.endsWith(` ${base}`) ? row.Name_lang.slice(0, -base.length - 1) : null;
  const baseName = variant ? base : row.Name_lang;
  return {
    faction,
    baseName,
    variant,
    name: variant ? `${baseName} (${variant})` : baseName,
    id: `${faction?.toLowerCase()}-${idSlug(baseName)}${variant ? `-${idSlug(variant)}` : ""}`,
  };
}

/** Class slugs by ChrClasses id: 1 → "warrior". */
export function classSlugs(t) {
  return new Map(rowsOf(t.ChrClasses).map((c) => [c.ID, c.Filename.toLowerCase()]));
}

/** ChrClasses ids a ClassMask covers, in id order (0 and -1 mean every class). */
export function classesOfMask(mask, classIds) {
  if (mask === 0 || mask === -1) return [...classIds];
  return classIds.filter((id) => ((mask >>> 0) & 2 ** (id - 1)) !== 0);
}

/**
 * The racial rows of a race: SkillLineAbility rows of a racial skill line whose race mask holds
 * the race's PlayableRaceBit. Returns [{ spellId, name, classMask, slaId, line }] in
 * SkillLineAbility order; the caller drops hidden helper spells (isHidden).
 */
export function racialRows(t, race, name) {
  const out = [];
  for (const r of rowsOf(t.SkillLineAbility)) {
    const line = t.SkillLine.byId.get(r.SkillLine);
    if (!line || !RACIAL_LINE.test(line.DisplayName_lang)) continue;
    const mask = raceMaskOf(r);
    if ((!mask[0] && !mask[1]) || !maskHasRace(mask, race.PlayableRaceBit)) continue;
    out.push({ slaId: r.ID, spellId: r.Spell, name: name(r.Spell), classMask: r.ClassMask, line: line.DisplayName_lang });
  }
  return out.sort((a, b) => a.slaId - b.slaId);
}

/** Whether a spell is hidden from the spellbook (SPELL_ATTR0_DO_NOT_DISPLAY). */
export const isHidden = (misc, spellId) => ((misc.get(spellId)?.Attributes?.[0] ?? 0) & ATTR0_HIDDEN) !== 0;

/**
 * Group a racial's per-class texts: [{ classIds, text }] in the order the variants first appear,
 * identical texts merged ("Warlock, Mage: …"). `variants` are [{ classIds, text }] in
 * SkillLineAbility order.
 */
export function groupByText(variants) {
  const groups = [];
  for (const v of variants) {
    const g = groups.find((x) => x.text === v.text);
    if (g) g.classIds.push(...v.classIds.filter((id) => !g.classIds.includes(id)));
    else groups.push({ classIds: [...v.classIds], text: v.text });
  }
  return groups;
}

/**
 * A racial's id: `racial-<race>-<name>` for one race ("racial-night-elf-elune-s-light",
 * "racial-windshaper-skyborne-skysight"), `racial-<base>-both-factions-<name>` when both faction
 * variants of a race share it ("racial-skyborne-both-factions-walk-on-air").
 */
export function racialId(name, races) {
  if (races.length === 1) return `racial-${idSlug(races[0].Name_lang)}-${idSlug(name)}`;
  const bases = [...new Set(races.map((r) => r.ClientFileString))];
  if (bases.length === 1) return `racial-${idSlug(bases[0])}-both-factions-${idSlug(name)}`;
  return `racial-${idSlug(name)}`;
}
