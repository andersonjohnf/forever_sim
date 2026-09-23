/**
 * Types for the WoW Forever races in this folder (races.json), written by
 * scripts/scrape/races-client.mjs from the Forever beta client's tables and compared with the
 * Classic Era client's (decision D17). See docs/data/races.md.
 *
 * Usage:
 *   import racesJson from './races.json';
 *   const races = racesJson as RaceData;
 */

export type ClassSlug =
  | 'warrior'
  | 'hunter'
  | 'mage'
  | 'rogue'
  | 'priest'
  | 'warlock'
  | 'paladin'
  | 'druid'
  | 'shaman';

/** The classes this simulator models. */
export type SimClass = 'warrior' | 'druid' | 'paladin';

export type Faction = 'Horde' | 'Alliance';

/**
 * How a racial compares with Classic Era: "added" (no Classic racial of that name), "moved" (another
 * race had it in Classic: Mace Specialization, Human → Dwarf), "modified" (the tooltip or its
 * cast time or cooldown differs) or "unchanged".
 */
export type RacialChangeKind = 'added' | 'moved' | 'modified' | 'unchanged';

export interface RaceSnapshotMeta {
  /** "https://wago.tools/api/casc": raw client files by FileDataID (decision D16). */
  source: string;
  scraper: string;
  /** Latest download time of the client files read (ISO 8601, UTC). */
  scrapedAt: string;
  product: string;
  /** WoW Forever beta client build the data was read from, e.g. "1.60.1.69913". */
  foreverBuild: string;
  /** The build's creation date in wago.tools' build list (YYYY-MM-DD), whichever build is cached as latest; null only if the list lacks the build. */
  foreverBuildDate: string | null;
  classicProduct: string;
  /** Classic Era client build compared against, e.g. "1.15.9.69722". */
  classicBuild: string;
  /** Table name → FileDataID, per build. */
  tables: { forever: Record<string, number>; classic: Record<string, number> };
  wowDbDefs: { repository: string; commit: string };
}

export interface RaceClasses {
  /** Classes the race can be in Forever (CharBaseInfo), in ChrClasses id order. */
  forever: ClassSlug[];
  /** Classes the race could be in Classic Era; null for races new in Forever. */
  classic: ClassSlug[] | null;
  /** Forever classes that Classic Era did not allow (all of them for new races). */
  addedInForever: ClassSlug[];
  /** Classic Era classes that Forever no longer allows. */
  removedInForever: ClassSlug[];
}

/** An active racial's tooltip header. */
export interface RacialTooltip {
  resourceCost?: string;
  range?: string;
  castTime?: string;
  cooldown?: string;
}

export interface RacialClassic {
  /** "verified" (the race had it in Classic Era), "not_listed" (it didn't) or "absent" (the race is new). */
  status: 'verified' | 'not_listed' | 'absent';
  name: string | null;
  /** Classic Era tooltip when verified. */
  text: string | null;
  /** Classic Era tooltip header when verified and active. */
  tooltip: RacialTooltip | null;
  /** Other races that had this racial in Classic Era. */
  otherRaces: { race: string; text: string }[];
}

export interface Racial {
  /** "racial-<race>-<name>", or "racial-<race>-both-factions-<name>" when both faction variants share it. */
  id: string;
  name: string;
  icon: string;
  /** Forever spell ids: one per class variant (Eureka! has five). */
  spellIds: number[];
  changeKind: RacialChangeKind;
  /** "New" (added or moved), "Changed" or "Unchanged". */
  changeLabel: 'New' | 'Changed' | 'Unchanged';
  passive: boolean;
  tooltip: RacialTooltip | null;
  /** Forever tooltip; per-class variants as "Warrior, Paladin, Rogue: …" lines separated by "\n". */
  forever: string;
  /** Per-class Forever tooltip when the variants differ by class. */
  foreverByClass: Partial<Record<ClassSlug, string>> | null;
  classic: RacialClassic;
  /** Classic Era spell id of the race's racial of that name, when it had one. */
  classicSpellId: number | null;
  /** Race ids that have this racial (the two Skyborne share three). */
  races: string[];
}

/** A Classic Era racial the race lost in Forever. */
export interface RemovedRacial {
  name: string;
  classicSpellId: number;
  text: string | null;
}

export interface Race {
  /** e.g. "horde-orc", "alliance-skyborne-high-order". Saved setups and share links store it. */
  id: string;
  /** Display name, e.g. "Skyborne (High Order)". */
  name: string;
  /** Name without the faction variant, e.g. "Skyborne". */
  baseName: string;
  faction: Faction;
  icon: string;
  /** ChrRaces id. */
  chrRacesId: number;
  /** True for races that don't exist in Classic Era (Skyborne). */
  newInForever: boolean;
  classes: RaceClasses;
  racials: Racial[];
  removedRacials: RemovedRacial[];
}

export interface NewCombo {
  raceId: string;
  race: string;
  faction: Faction;
  class: ClassSlug;
}

export interface RaceData {
  meta: RaceSnapshotMeta;
  /** ChrClasses id order. */
  classOrder: ClassSlug[];
  /** Race ids that can play each simulated class, in Forever and in Classic Era. */
  simClassAvailability: Record<SimClass, { forever: string[]; classic: string[] }>;
  /** Existing races' race/class pairs that are new in Forever (Skyborne excluded). */
  newCombos: NewCombo[];
  /** Horde first, then by ChrRaces id. */
  races: Race[];
}

/** Races that can be `cls` in Forever. */
export function racesForClass(data: RaceData, cls: ClassSlug): Race[] {
  return data.races.filter((r) => r.classes.forever.includes(cls));
}

/** The Forever tooltip of a racial as it applies to `cls`. */
export function racialEffectForClass(racial: Racial, cls: ClassSlug): string | null {
  return racial.foreverByClass?.[cls] ?? racial.forever;
}
