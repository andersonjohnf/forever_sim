// Types for src/data/spells/<class>.json, written by scripts/scrape/spells-client.mjs from the
// Forever beta client's tables, compared with the Classic Era client's (decision D17). See
// docs/data/spells.md.
//
// Usage:
//   import warriorJson from "@/data/spells/warrior.json";
//   import type { SpellBook } from "@/data/spells/types";
//   const warrior = warriorJson as SpellBook;

export type SpellClass = "warrior" | "druid" | "paladin" | "shaman";
export type SpellResource = "rage" | "energy" | "mana" | "health";

/**
 * How a spell compares with Classic Era (docs/data/spells.md#status): "talent" (a talent in
 * Forever), "new" (no Classic Era spell of that name), "baseline" (a talent in Classic Era,
 * trained now), "earlier" (first trained at a lower level), "changed" (any rank field or tooltip
 * differs, or a rank exists on one side only), "same".
 */
export type SpellStatus = "same" | "changed" | "new" | "baseline" | "earlier" | "talent";

export interface SpellBook {
  meta: SpellBookMeta;
  class: SpellClass;
  /** Tallies of `spells` by status and of `missing`. */
  counts: SpellBookCounts;
  /** Spellbook tabs: the talent trees' skill lines in tree order, then the class's other lines (Mounts). */
  tabs: SpellBookTab[];
  /** Grouped by tab in `tabs` order, then by first trained level (talent-only spells last), then name. */
  spells: Spell[];
  /** Classic Era spellbook spells with no Forever counterpart. */
  missing: MissingSpell[];
}

export interface SpellBookMeta {
  /** "https://wago.tools/api/casc": raw client files by FileDataID (decision D16). */
  source: string;
  scraper: "scripts/scrape/spells-client.mjs";
  /** Latest download time of the client files read (ISO 8601, UTC). */
  scrapedAt: string;
  /** "wow_classic_beta". */
  product: string;
  /** WoW Forever beta client build, e.g. "1.60.1.69913". */
  foreverBuild: string;
  /** The build's creation date in wago.tools' build list (YYYY-MM-DD), whichever build is cached as latest; null only if the list lacks the build. */
  foreverBuildDate: string | null;
  /** "wow_classic_era". */
  classicProduct: string;
  /** Classic Era client build compared against, e.g. "1.15.9.69722". */
  classicBuild: string;
  /** Table name → FileDataID, per build. */
  tables: { forever: Record<string, number>; classic: Record<string, number> };
  wowDbDefs: { repository: string; commit: string };
  /**
   * The class's trainer rows (SkillLineAbility, taught or learned automatically) whose spell the
   * Forever client has no data for: no SpellName row, so no book entry. Possibly hotfix-only
   * (docs/data/spells.md#trainer-rows-with-no-client-data). Sorted by spell id.
   */
  noClientData: NoClientDataRow[];
  /**
   * Forever tooltip tokens the client files can't resolve, which don't fail the run: `$z` (the home
   * location only the game knows, which the text calls "your home location") and a token that
   * reads a spell the build doesn't have, which renders as nothing (docs/data/spells.md#caveats).
   */
  unresolvedTokens: { spellId: number; token: string; why: string }[];
}

export interface NoClientDataRow {
  spellId: number;
  /** The row's skill line, e.g. "Feral Combat". */
  skillLine: string;
  /** SkillLineAbility.AcquireMethod: 0 taught by a trainer, 2 learned automatically. */
  acquireMethod: number;
  /** The spell the row supersedes (SkillLineAbility.SupercedesSpell): the previous rank. */
  supersedes: number | null;
  /** Whether the Forever client lists the spell's SpellName row as encrypted. */
  encrypted: boolean;
  /** The Classic Era client's spell of that id; `talentRank` when it is a Classic talent's rank. */
  classic: { name: string; rank: number | null; talentRank: boolean } | null;
}

export interface SpellBookCounts {
  total: number;
  /** Status "new". */
  new: number;
  /** Every status other than "same", "new" and "talent". */
  changed: number;
  /** `missing.length`. */
  notInForever: number;
  /** new + changed. */
  differentFromClassic: number;
}

export interface SpellBookTab {
  name: string;
  slug: string;
  /** Icon file name (SkillLine.SpellIconFileID), e.g. "ability_rogue_eviscerate". */
  icon: string;
  spellCount: number;
}

export interface Spell {
  /** "<class>-<name slug>", e.g. "warrior-thunder-clap", "druid-nature-s-grasp". */
  id: string;
  name: string;
  tab: string;
  /** Icon file name of the first Forever rank, e.g. "spell_nature_thunderclap". */
  icon: string | null;
  /** First trained level; null for spells that come only with a talent point. */
  level: number | null;
  status: SpellStatus;
  /** Race names that can learn it (from SkillLineAbility race masks); null = every race of the class. */
  races: string[] | null;
  /** Highest "Rank N" of the Forever ranks; null for spells without numbered ranks. */
  maxRank: number | null;
  /** A Forever talent's spell (an active talent). */
  isTalent: boolean;
  /** Every Forever rank comes with the talent point; no trainer teaches one. */
  grantedByTalent: boolean;
  /** The Classic Era spell of the same name, if any: its tab and whether it came from a talent. */
  classic: { tab: string; wasTalent: boolean } | null;
  /** Rank-by-rank Forever vs Classic Era comparison (docs/data/spells.md#ranks). */
  ranks: SpellRankPair[];
}

export interface SpellRankPair {
  /** Numbered rank; null for unnumbered spells and variants. */
  rank: number | null;
  /** null for a Classic Era rank Forever dropped (Tiger's Fury ranks 2 to 4). */
  forever: SpellRank | null;
  /** null when this rank doesn't exist in Classic Era. */
  classic: SpellRank | null;
  /** Field-by-field differences when both sides exist. */
  differences: SpellDifference[];
}

export interface SpellDifference {
  /** "level", "cost", "castTime", "cooldown", "range", "school", "form", "requires", "value" (numbers) or "text". */
  field: string;
  text: string;
}

export interface SpellRank {
  /** Client spell id. */
  spellId: number;
  /** The client's rank subtext (Spell.NameSubtext_lang): "Rank 5", "Shapeshift", "Passive", "Summon". */
  rankLabel: string | null;
  /** Training level (SpellLevels); null for ranks that come only with a talent point. */
  level: number | null;
  /** Rendered tooltip; "\n" separates lines and "\n\n" paragraphs. */
  text: string | null;
  cost: SpellCost | null;
  castTime: SpellCastTime | null;
  cooldown: SpellCooldown | null;
  range: SpellRange | null;
  /** Lower-case school name(s), "+"-joined: "physical", "holy", "nature". */
  school: string | null;
  /** Icon file name (SpellMisc.SpellIconFileDataID). */
  icon: string | null;
  /** Stances or forms the spell can be used in (SpellShapeshift); null when it needs none. */
  forms: string[] | null;
  /** The item it needs equipped, as the tooltip names it: "Melee Weapon", "Shields". */
  requires: string | null;
  /** Only on `MissingSpell.classic`. */
  name?: string;
}

export interface SpellCost {
  /** As the tooltip prints it: "20 Rage", "150 Mana", "55% of base mana", "20% of base health". */
  raw: string;
  /** Flat amount; null for percentage costs. */
  amount: number | null;
  resource: SpellResource | null;
  /** For "N% of base …". */
  percentOfBase?: number;
}

export interface SpellCastTime {
  /** "Instant", "1.5 sec cast", "Channeled". */
  raw: string;
  /** "Instant" -> 0; null for "Channeled" (the channel duration is in the tooltip). */
  seconds: number | null;
  channeled: boolean;
}

export interface SpellCooldown {
  /** "6 sec cooldown", "1 hr cooldown" (the larger of the spell and category recovery). */
  raw: string;
  seconds: number;
}

export interface SpellRange {
  /** "Melee range", "30 yd range", "8-25 yd range". */
  raw: string;
  /** null for melee range. */
  yards: number | null;
  melee: boolean;
  /** Minimum range (Charge, Intercept, Feral Charge: 8). */
  minYards?: number;
}

export interface MissingSpell {
  name: string;
  /** Its Classic Era tab. */
  tab: string;
  icon: string | null;
  /** First trained level in Classic Era; null when only a talent gave it. */
  level: number | null;
  /** Highest Classic rank. */
  rank: number | null;
  /** It was a talent in Classic Era. */
  wasTalent: boolean;
  /** The highest Classic Era rank. */
  classic: SpellRank | null;
}
