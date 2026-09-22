// Types for src/data/spells/<class>.json, written by scripts/scrape/spells.mjs
// from https://foreverchanges.pro/spellbook/<class> (plus /class/<class> for
// sources). See docs/data/spells.md.
//
// Usage:
//   import warriorJson from "@/data/spells/warrior.json";
//   import type { SpellBook } from "@/data/spells/types";
//   const warrior = warriorJson as SpellBook;

export type SpellClass = "warrior" | "druid" | "paladin";
export type SpellResource = "rage" | "energy" | "mana" | "health";

export interface SpellBook {
  meta: SpellBookMeta;
  class: SpellClass;
  /** The counts shown on the spellbook page; the scraper checks them against `spells`/`missing`. */
  counts: SpellBookCounts;
  /** Spellbook tabs in site order (`spells` is grouped by tab in this order). */
  tabs: SpellBookTab[];
  spells: Spell[];
  /** Classic spells with no Forever counterpart (the page's "Not in Forever" tab). */
  missing: MissingSpell[];
}

export interface SpellBookMeta {
  /** Spellbook page the data was read from. */
  source: string;
  /** Class changes page that `changelog` and `sources` were read from. */
  changesSource: string;
  /** When the spellbook page was fetched (ISO 8601, UTC, from the scrape cache). */
  scrapedAt: string;
  /** WoW Forever beta client build, e.g. "1.60.1.69913". */
  foreverBuild: string;
  /** Classic Era client build compared against, e.g. "1.15.9.69722". */
  classicBuild: string;
  scraper: "scripts/scrape/spells.mjs";
}

export interface SpellBookCounts {
  /** "All spells". */
  total: number;
  /** "New" / "New in Forever": status "new". */
  new: number;
  /** "Changed": status other than "same", "new" or "talent". */
  changed: number;
  /** "Not in Forever": `missing.length`. */
  notInForever: number;
  /** "Different from Classic": new + changed. */
  differentFromClassic: number;
}

export interface SpellBookTab {
  name: string;
  slug: string;
  icon: string;
  spellCount: number;
}

export interface Spell {
  /** Site slug, e.g. "warrior-thunder-clap" (talent spells: "calc-warrior-arms-spearing-strike"). */
  id: string;
  name: string;
  tab: string;
  /** Icon file name without extension, e.g. "spell_nature_thunderclap". */
  icon: string;
  /** Deep link to the spell on the spellbook page. */
  url: string;
  /** First trained level; null for spells that come only from a talent point (and a few oddities). */
  level: number | null;
  /**
   * Site status, verbatim. Seen values: "same", "changed", "new", "baseline"
   * (was a talent in Classic, trained now), "earlier" (trained at lower levels),
   * "talent" (a talent in Forever).
   */
  status: string;
  /** Badge text in the spell list: "Same as Classic", "Changed", "New", "Was a talent", "Talent", "Earlier". */
  badge: string | null;
  /** One-line change summary shown in the spell list, verbatim. */
  summary: string | null;
  /** Site `reasons`, verbatim (strings). */
  reasons: string[];
  /** Races that can learn it; null = every race of the class. */
  races: string[] | null;
  /** Highest numbered rank; null for spells without numbered ranks. */
  maxRank: number | null;
  /** The rank the site features in the list summary and detail pane (site `rank`); null when unranked. */
  featuredRank: number | null;
  /** A talent in Forever (site `talent`). */
  isTalent: boolean;
  /** Comes with the talent point; no trainer teaches it (site `talent_only`). */
  grantedByTalent: boolean;
  /** The matching entry on the class changes page. */
  changelog?: SpellChangelog;
  /** Evidence links from the class changes page. */
  sources?: SpellSource[];
  /** Rank-by-rank Forever vs Classic comparison, in site order. */
  ranks: SpellRankPair[];
}

export interface SpellChangelog {
  /** Entry id on the class changes page, e.g. "spellbook-warrior-thunder-clap". */
  id: string;
  kind: "spell" | "talent";
  /** Site `reported_change_kind`: "modified", "unchanged", "added", "baseline", "earlier", ... */
  changeKind: string | null;
  /** Full change summary (the list `summary` is cut to the first difference). */
  summary: string | null;
  /** Site `evidence_status`, e.g. "client_data". */
  evidenceStatus: string | null;
  /** YYYY-MM-DD the site first recorded the entry. */
  discoveredAt: string | null;
  /** Deep link to the entry on the class changes page. */
  url: string;
  /** Present only when the site lists open questions about the entry. */
  uncertainties?: unknown[];
}

export interface SpellSource {
  url: string;
  title?: string;
  /** e.g. "client_data" (Forever beta client), "classic_client_data". */
  type?: string;
}

export interface SpellRankPair {
  /** Numbered rank; null for unranked spells and for unnumbered variants. */
  rank: number | null;
  /** null when this rank does not exist in Forever. */
  forever: SpellRank | null;
  /** null when this rank does not exist in Classic. */
  classic: SpellRank | null;
  differences: SpellDifference[];
}

export interface SpellDifference {
  /** e.g. "cooldown", "cost", "value", "text", "form", "level". */
  field: string;
  text: string;
}

export interface SpellRank {
  /**
   * Client spell id. null only on the Classic side of talent spells, where the
   * site gives just the Classic talent tooltip (`text`); every other field is null then.
   */
  spellId: number | null;
  /** Client rank label when the site gives one: "Rank 5", "Shapeshift", "Passive", "Summon". */
  rankLabel: string | null;
  /** Level it is trained at; null for talent-granted ranks. */
  level: number | null;
  /** Tooltip text; may contain "\n". */
  text: string | null;
  cost: SpellCost | null;
  castTime: SpellCastTime | null;
  cooldown: SpellCooldown | null;
  range: SpellRange | null;
  /** Only on `MissingSpell.classic`. */
  name?: string;
}

export interface SpellCost {
  /** Verbatim, e.g. "20 Rage", "150 Mana", "55% of base mana". */
  raw: string;
  /** Flat amount; null for percentage costs. */
  amount: number | null;
  resource: SpellResource | null;
  /** For "N% of base mana". */
  percentOfBase?: number;
}

export interface SpellCastTime {
  /** Verbatim, e.g. "Instant", "1.5 sec cast", "Channeled". */
  raw: string;
  /** "Instant" -> 0; null for "Channeled" (duration is in the tooltip text). */
  seconds: number | null;
  channeled: boolean;
}

export interface SpellCooldown {
  /** Verbatim, e.g. "6 sec cooldown", "1 hr cooldown". */
  raw: string;
  seconds: number | null;
}

export interface SpellRange {
  /** Verbatim, e.g. "Melee range", "30 yd range". */
  raw: string;
  /** null for melee range. */
  yards: number | null;
  melee: boolean;
  /** For "min-max yd range" strings (none in the current snapshot). */
  minYards?: number;
}

export interface MissingSpell {
  name: string;
  tab: string;
  icon: string | null;
  /** First trained level in Classic. */
  level: number | null;
  /** Highest Classic rank. */
  rank: number | null;
  /** It was a talent in Classic (site `talent_then`). */
  wasTalent: boolean;
  /** Tooltip of the highest Classic rank. */
  classic: SpellRank | null;
}
