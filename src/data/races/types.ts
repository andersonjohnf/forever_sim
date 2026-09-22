/**
 * Types for the WoW Forever race/racial snapshot in this folder (races.json),
 * scraped from https://foreverchanges.pro/racials by scripts/scrape/races.mjs.
 * See docs/data/races.md for provenance and caveats.
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

/** reported_change_kind as the site reports it ("reported" = new per community reports). */
export type RacialChangeKind = 'added' | 'modified' | 'unchanged' | 'reported' | (string & {});

/** The site's display classification (null when it shows no tag). */
export type RacialDisplayKind = 'added' | 'modified' | 'moved' | 'unchanged' | null;

export interface RaceSnapshotMeta {
  source: string;
  /** ISO timestamp of the HTTP fetch (from the scraper's cache). */
  scrapedAt: string;
  /** WoW Forever beta client build the racial texts were read from. */
  foreverBuild: string;
  /** Null: the Classic baseline is Wowhead Classic, not a specific client build. */
  classicBuild: string | null;
  scraper: string;
}

export interface ResearchSource {
  id: string;
  url: string;
  label: string;
  status: string;
}

/** The site's research block: provenance for class lists and removals. */
export interface RaceResearch {
  updatedAt: string | null;
  sources: ResearchSource[];
  coverage: {
    profiles: number | null;
    uniqueAbilities: number | null;
    preservedRaceClassPairs: number | null;
    conflictingAdditionalPair: number | null;
  };
  notes: string[];
}

export interface RaceClasses {
  /** Classes the race can be in Forever. */
  forever: ClassSlug[];
  /** Classes the race could be in Classic Era; null for races new in Forever. */
  classic: ClassSlug[] | null;
  /** Forever classes that Classic did not allow (all of them for new races). */
  addedInForever: ClassSlug[];
  /** Classic classes that Forever no longer allows. */
  removedInForever: ClassSlug[];
}

export interface RacialTooltip {
  resourceCost?: string;
  range?: string;
  castTime?: string;
  cooldown?: string;
}

export interface RacialClassic {
  /** "verified" (Classic text known), "not_listed" (not this race's racial in Classic) or "absent" (race is new). */
  status: string | null;
  name: string | null;
  /** Classic Era effect text when verified. */
  text: string | null;
  /** Other races that had this racial in Classic. */
  otherRaces: { race: string; text: string }[];
}

export interface RacialNote {
  /** "conflict" or "additional_report". */
  type: string;
  /** What a secondary source reports. */
  reported: string;
  /** For conflicts: what the site's own data says. */
  existing?: string;
  /** Source URLs. */
  sources: string[];
}

export interface RacialSource {
  url: string;
  type?: string;
  title?: string;
  label?: string;
  author?: string;
  videoTimestamp?: string;
  retrievedAt?: string;
}

export interface Racial {
  id: string;
  name: string;
  icon: string;
  changeKind: RacialChangeKind;
  displayKind: RacialDisplayKind;
  /** The tag the site shows ("New", "Changed", "Unchanged"). */
  changeLabel: string | null;
  passive: boolean | null;
  tooltip: RacialTooltip | null;
  /** Forever effect text (may contain per-class lines separated by "\n"). */
  forever: string | null;
  /** Per-class Forever effect when the text is written per class. */
  foreverByClass: Partial<Record<ClassSlug, string>> | null;
  classic: RacialClassic;
  /** Classic Era spell id (from the Wowhead Classic source link), when the racial existed. */
  classicSpellId: number | null;
  /** Race ids that have this racial (Skyborne share three). */
  races: string[];
  evidenceStatus: string;
  comparisonStatus: string;
  discoveredAt: string | null;
  notes: RacialNote[];
  sources: RacialSource[];
}

export interface ReportedRemoval {
  /** Name of the Classic racial reported as removed. */
  name: string;
  status: string | null;
  sources: string[];
}

export interface Race {
  /** e.g. "horde-orc", "alliance-skyborne-high-order". */
  id: string;
  /** Display name, e.g. "Skyborne (High Order)". */
  name: string;
  /** Name without the faction variant, e.g. "Skyborne". */
  baseName: string;
  faction: Faction;
  icon: string;
  /** True for races that do not exist in Classic (Skyborne). */
  newInForever: boolean;
  classes: RaceClasses;
  /** The site's status for the class list (e.g. "reported_compatibility"). */
  classAvailabilityStatus: string;
  compatibilityConflicts: { class: string; sources: string[] }[];
  racials: Racial[];
  /** Classic racials reported (by secondary sources) as removed in Forever. */
  reportedRemovals: ReportedRemoval[];
  sources: RacialSource[];
}

export interface NewCombo {
  raceId: string | null;
  race: string;
  faction: Faction;
  class: ClassSlug;
}

export interface RaceData {
  meta: RaceSnapshotMeta;
  research: RaceResearch;
  /** The site's class ordering. */
  classOrder: ClassSlug[];
  /** Race ids that can play each simulated class, in Forever and in Classic. */
  simClassAvailability: Record<SimClass, { forever: string[]; classic: string[] }>;
  /** Existing races' race/class pairs that are new in Forever (Skyborne excluded). */
  newCombos: NewCombo[];
  races: Race[];
}

/** Races that can be `cls` in Forever. */
export function racesForClass(data: RaceData, cls: ClassSlug): Race[] {
  return data.races.filter((r) => r.classes.forever.includes(cls));
}

/** The Forever effect text of a racial as it applies to `cls`. */
export function racialEffectForClass(racial: Racial, cls: ClassSlug): string | null {
  return racial.foreverByClass?.[cls] ?? racial.forever;
}
