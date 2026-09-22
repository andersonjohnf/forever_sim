/**
 * Types and build-code helpers for the WoW Forever talent snapshots in this
 * folder (warrior.json, druid.json, paladin.json), scraped from
 * https://foreverchanges.pro by scripts/scrape/talents.mjs.
 * See docs/data/talents.md for provenance and caveats.
 *
 * Usage:
 *   import warriorJson from './warrior.json';
 *   const warrior = warriorJson as TalentData;
 *   const ranks = decodeTalentCode(warrior, warrior.popularBuilds[0].code);
 *
 * Tiers and columns are 0-based (tier 0 is the top row; tier N needs
 * N * rules.pointsPerTier points spent in lower tiers of the same tree).
 */

export type TalentClass = 'warrior' | 'druid' | 'paladin';

/** reported_change_kind as the site reports it (known values; kept open). */
export type TalentChangeKind = 'added' | 'modified' | 'moved' | 'unchanged' | (string & {});

export interface TalentSnapshotMeta {
  /** Page the snapshot was taken from. */
  source: string;
  /** ISO timestamp of the HTTP fetch (from the scraper's cache). */
  scrapedAt: string;
  /** WoW Forever beta client build the site read the talents from. */
  foreverBuild: string;
  /** Classic Era client build used for the Classic comparison. */
  classicBuild: string;
  /** Script that produced the file. */
  scraper: string;
}

export interface TalentRules {
  /** Talent points available at level 60 (the site caps at 51 even with the Talented legacy perk). */
  maxPoints: number;
  /** Points that must be spent in lower tiers of a tree per tier. */
  pointsPerTier: number;
  /** Deepest tier index (0-based). */
  maxTier: number;
  /** Rightmost column index (0-based). */
  maxCol: number;
}

export interface PopularBuild {
  /** Id of the tree the build is named after. */
  tree: string;
  /** Points per tree, in `trees` order. */
  points: [number, number, number];
  /** Build code; see `TalentData.codeFormat` and `decodeTalentCode`. */
  code: string;
}

export interface TalentPrerequisite {
  /** Id of the talent the arrow starts from (same tree). */
  talentId: string;
  /** Rank required in that talent: always its max rank. */
  rank: number;
}

/** Tooltip header for active talents (null on the talent when passive). */
export interface TalentTooltip {
  resourceCost?: string;
  range?: string;
  castTime?: string;
  cooldown?: string;
  requirements?: string;
}

export interface TalentRanks {
  /** Forever tooltip text per rank; index 0 = rank 1. */
  forever: string[];
  /** Classic Era tooltip text per rank, or null when there is no Classic counterpart. */
  classic: string[] | null;
  /** Site-estimated Forever texts, present only when the site has any. */
  foreverEstimated?: string[];
}

/** The Classic Era talent this Forever talent was matched to. */
export interface ClassicTalent {
  name: string;
  maxRank: number;
  /** 0-based tier in the Classic tree. */
  tier: number | null;
  /** "same_name" or "same_spell" (renamed; see Talent.previousName). */
  matchStatus: string;
  /** Name of the Classic prerequisite, if Classic had an arrow into it. */
  prerequisite: string | null;
}

export interface TalentSource {
  url: string;
  title?: string;
  type?: string;
}

export interface Talent {
  /** Site id, e.g. "calc-warrior-arms-mortal-strike" (not always "calc-" prefixed). */
  id: string;
  name: string;
  /** Icon file name (Blizzard icon, lower case, no extension). */
  icon: string;
  /** Id of the tree the talent belongs to. */
  tree: string;
  /** 0-based row; -1 only if unknown and not in the Forever tree. */
  tier: number;
  /** 0-based column (0..3); -1 only if unknown and not in the Forever tree. */
  col: number;
  /** Index within the tree used by build codes; -1 if not in the Forever tree. */
  order: number;
  maxRank: number;
  /** The arrow into this talent (may come from the same tier), or null. */
  prerequisite: TalentPrerequisite | null;
  /** False for context-only records (e.g. Classic talents removed in Forever). */
  inForeverTree: boolean;
  changeKind: TalentChangeKind;
  /** The site's one-line change summary. */
  summary: string | null;
  /** The site's change bullet points (1-based tiers in the prose). */
  changes: string[];
  passive: boolean | null;
  tooltip: TalentTooltip | null;
  /** Classic name when the talent was renamed. */
  previousName: string | null;
  ranks: TalentRanks;
  classic: ClassicTalent | null;
  /** Classic Era spell id of rank 1 (from the Wowhead Classic source link). */
  classicSpellId: number | null;
  evidenceStatus: string;
  comparisonStatus: string;
  discoveredAt: string | null;
  sources: TalentSource[];
}

export interface TalentTree {
  /** Tree id used by talents and popular builds, e.g. "Arms", "Feral Combat". */
  id: string;
  name: string;
  icon: string;
  /** Position of the tree (0..2): the build-code segment it owns. */
  index: number;
  /** Client TalentTab id. */
  clientTreeId: string | null;
  /** Forever-tree talents in `order`, then any context-only records. */
  talents: Talent[];
}

export interface TalentData {
  meta: TalentSnapshotMeta;
  class: TalentClass;
  rules: TalentRules;
  /** Prose description of the verified build-code format. */
  codeFormat: string;
  popularBuilds: PopularBuild[];
  trees: TalentTree[];
}

/** Ranks keyed by talent id; talents with 0 points are omitted. */
export type TalentRanksById = Record<string, number>;

/** Forever-tree talents of each tree in build-code order (tier, then column). */
export function talentsInCodeOrder(data: TalentData): Talent[][] {
  return data.trees.map((tree) =>
    tree.talents.filter((t) => t.inForeverTree).sort((a, b) => a.tier - b.tier || a.col - b.col),
  );
}

/**
 * Decodes a build code ("30305213132515201-05050103-") into ranks by talent id.
 * One segment per tree ("-"-separated, missing trailing segments = empty), one
 * digit per talent in code order, trailing zeros optional. Throws on malformed
 * codes, too many digits or ranks above a talent's max rank. Does not check
 * tier gates or prerequisites; use `validateTalentBuild` for that.
 */
export function decodeTalentCode(data: TalentData, code: string): TalentRanksById {
  if (!/^[0-9]*(-[0-9]*){0,2}$/.test(code)) {
    throw new Error(`Malformed talent code ${JSON.stringify(code)}`);
  }
  const order = talentsInCodeOrder(data);
  const ranks: TalentRanksById = {};
  code.split('-').forEach((segment, treeIndex) => {
    const talents = order[treeIndex];
    if (segment.length > talents.length) {
      throw new Error(`Talent code segment ${treeIndex} has ${segment.length} digits; tree has ${talents.length} talents`);
    }
    [...segment].forEach((digit, i) => {
      const rank = Number(digit);
      if (rank > talents[i].maxRank) {
        throw new Error(`${talents[i].name}: rank ${rank} exceeds max rank ${talents[i].maxRank}`);
      }
      if (rank) ranks[talents[i].id] = rank;
    });
  });
  return ranks;
}

/**
 * Encodes ranks by talent id as a build code, in the site's canonical form:
 * always three segments, trailing zeros trimmed ("05050103-" style).
 * Ids that are unknown or not in the Forever tree are ignored.
 */
export function encodeTalentCode(data: TalentData, ranksById: TalentRanksById): string {
  return talentsInCodeOrder(data)
    .map((talents) => talents.map((t) => ranksById[t.id] ?? 0).join('').replace(/0+$/, ''))
    .join('-');
}

/** Points spent per tree, in `trees` order. */
export function pointsPerTree(data: TalentData, ranksById: TalentRanksById): number[] {
  return data.trees.map((tree) => tree.talents.reduce((n, t) => n + (ranksById[t.id] ?? 0), 0));
}

/**
 * Checks a finished build against the calculator's rules: known Forever-tree
 * talents, ranks within 0..maxRank, total <= rules.maxPoints, tier gates
 * (pointsPerTier per tier, counted in the same tree) and prerequisites at their
 * required rank. Returns human-readable problems; empty means valid.
 */
export function validateTalentBuild(data: TalentData, ranksById: TalentRanksById): string[] {
  const problems: string[] = [];
  const byId = new Map(data.trees.flatMap((tree) => tree.talents).map((t) => [t.id, t] as const));
  let total = 0;
  for (const [id, rank] of Object.entries(ranksById)) {
    const t = byId.get(id);
    if (!t) {
      problems.push(`Unknown talent ${id}`);
      continue;
    }
    total += rank;
    if (!t.inForeverTree) problems.push(`${t.name} is not in the Forever tree`);
    if (!Number.isInteger(rank) || rank < 0 || rank > t.maxRank) problems.push(`${t.name}: bad rank ${rank}`);
    if (!rank) continue;
    const tree = data.trees.find((tr) => tr.id === t.tree);
    const below = (tree?.talents ?? [])
      .filter((x) => x.tier < t.tier)
      .reduce((n, x) => n + (ranksById[x.id] ?? 0), 0);
    const needed = data.rules.pointsPerTier * t.tier;
    if (below < needed) problems.push(`${t.name} (tier ${t.tier + 1}) needs ${needed} points in lower tiers, has ${below}`);
    const pre = t.prerequisite;
    if (pre && (ranksById[pre.talentId] ?? 0) < pre.rank) {
      problems.push(`${t.name} requires ${byId.get(pre.talentId)?.name ?? pre.talentId} at rank ${pre.rank}`);
    }
  }
  if (total > data.rules.maxPoints) problems.push(`${total} points exceeds the ${data.rules.maxPoints}-point cap`);
  return problems;
}
