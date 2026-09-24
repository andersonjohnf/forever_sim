/**
 * Types and build-code helpers for the WoW Forever talent trees in this folder (warrior.json,
 * druid.json, paladin.json), generated from the Forever beta client's Trait tables and compared
 * with the Classic Era client's Talent tables by scripts/scrape/talents-client.mjs.
 * See docs/data/talents.md for provenance and caveats.
 *
 * Usage:
 *   import warriorJson from './warrior.json';
 *   const warrior = warriorJson as TalentData;
 *   const ranks = decodeTalentCode(warrior, '30305013002-050530035150010051-');
 *
 * Tiers and columns are 0-based (tier 0 is the top row; tier N needs
 * N * rules.pointsPerTier points spent in lower tiers of the same tree).
 */

export type TalentClass = 'warrior' | 'druid' | 'paladin' | 'shaman' | 'rogue' | 'mage' | 'warlock' | 'priest' | 'hunter';

/**
 * How the talent compares with Classic Era (known values; kept open): "added" (no Classic
 * talent), "unchanged" (same name, ranks, texts and prerequisite in the same cell), "moved"
 * (only the tree or cell differs) or "modified".
 */
export type TalentChangeKind = 'added' | 'modified' | 'moved' | 'unchanged' | (string & {});

export interface TalentSnapshotMeta {
  /** Where the client files came from (the wago.tools API). */
  source: string;
  /** ISO timestamp of the latest download among the client files read. */
  scrapedAt: string;
  /** WoW Forever beta client build the trees come from. */
  foreverBuild: string;
  /** The build's creation date in wago.tools' build list (YYYY-MM-DD), whichever build is cached as latest; null only if the list lacks the build. */
  foreverBuildDate: string | null;
  /** Classic Era client build used for the Classic comparison. */
  classicBuild: string;
  /** wago.tools products of the two builds. */
  product: string;
  classicProduct: string;
  /** The class's TraitTree id and the TraitCurrency its points come from. */
  traitTreeId: number;
  traitCurrencyId: number;
  /** Table (DB2) name → FileDataID, per build. */
  tables: { forever: Record<string, number>; classic: Record<string, number> };
  /** WoWDBDefs commit the tables were parsed with. */
  wowDbDefs: { repository: string; commit: string };
  /** Script that produced the file. */
  scraper: string;
}

export interface TalentRules {
  /** Talent points available at level 60 (TraitCurrency.SourcedMax). */
  maxPoints: number;
  /** Points that must be spent in lower tiers of a tree per tier (TraitCond). */
  pointsPerTier: number;
  /** Deepest tier index (0-based). */
  maxTier: number;
  /** Rightmost column index (0-based). */
  maxCol: number;
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
}

/** The Classic Era talent this Forever talent was matched to. */
export interface ClassicTalent {
  name: string;
  /** Classic tree name (differs from `Talent.tree` when the talent moved trees). */
  tree: string;
  /** 0-based tier and column in the Classic tree. */
  tier: number;
  col: number;
  maxRank: number;
  /** "same_name", or "same_spell" when it was renamed (see Talent.previousName). */
  matchStatus: string;
  /** Name of the Classic prerequisite, if Classic had an arrow into it. */
  prerequisite: string | null;
}

export interface Talent {
  /** "<class>-<tree>-<name>", e.g. "warrior-arms-mortal-strike". Opaque; build codes don't store it. */
  id: string;
  name: string;
  /** Icon file name (Blizzard icon, lower case, no extension). */
  icon: string;
  /** Id of the tree the talent belongs to. */
  tree: string;
  /** 0-based row. */
  tier: number;
  /** 0-based column (0..3). */
  col: number;
  /** Index within the tree used by build codes (tier, then column). */
  order: number;
  maxRank: number;
  /** The arrow into this talent (may come from the same tier), or null. */
  prerequisite: TalentPrerequisite | null;
  /** Always true: every talent of the client's Trait tree is in the Forever tree. */
  inForeverTree: boolean;
  changeKind: TalentChangeKind;
  passive: boolean;
  tooltip: TalentTooltip | null;
  /** Classic name when the talent was renamed. */
  previousName: string | null;
  /** Forever talent spell id (one spell for every rank; the ranks' values come from curves). */
  spellId: number;
  /** Classic Era spell id of rank 1. */
  classicSpellId: number | null;
  ranks: TalentRanks;
  classic: ClassicTalent | null;
}

export interface TalentTree {
  /** Tree id used by talents, e.g. "Arms", "Feral Combat". */
  id: string;
  name: string;
  icon: string;
  /** Position of the tree (0..2): the build-code segment it owns. */
  index: number;
  /** Client TalentTab id. */
  clientTreeId: string | null;
  /** Talents in `order`. */
  talents: Talent[];
}

export interface TalentData {
  meta: TalentSnapshotMeta;
  class: TalentClass;
  rules: TalentRules;
  /** Prose description of the build-code format. */
  codeFormat: string;
  trees: TalentTree[];
}

/**
 * A tree of a frozen build's code order (frozen.json): its talents in code order, each as
 * [name, maxRank, spellId, tier, col, prerequisite] (the prerequisite's name, needed at its max
 * rank, or null) (docs/data/talents.md#tree-versions).
 */
export interface FrozenTree {
  name: string;
  talents: [name: string, maxRank: number, spellId: number, tier: number, col: number, prerequisite: string | null][];
}

/**
 * frozen.json: the build-code order of each older Forever build whose codes the app still reads
 * (a setup saved on it), generated by scripts/scrape/talents-client.mjs from that build's Trait
 * tables (docs/data/talents.md#tree-versions).
 */
export interface FrozenTalentOrders {
  meta: {
    source: string;
    scraper: string;
    product: string;
    wowDbDefs: { repository: string; commit: string };
    talentFields: string[];
    note: string;
  };
  builds: Record<string, { tables: Record<string, number>; classes: Record<TalentClass, FrozenTree[]> }>;
}

/**
 * Decodes a build code written on a frozen build into ranks by talent name, with the same rules as
 * `decodeTalentCode`: throws on a malformed code, too many digits or a rank above a talent's max.
 */
export function decodeFrozenCode(trees: FrozenTree[], code: string): Record<string, number> {
  if (!/^[0-9]*(-[0-9]*){0,2}$/.test(code)) throw new Error(`Malformed talent code ${JSON.stringify(code)}`);
  const ranks: Record<string, number> = {};
  code.split('-').forEach((segment, treeIndex) => {
    const talents = trees[treeIndex].talents;
    if (segment.length > talents.length) {
      throw new Error(`Talent code segment ${treeIndex} has ${segment.length} digits; tree has ${talents.length} talents`);
    }
    [...segment].forEach((digit, i) => {
      const [name, maxRank] = talents[i];
      const rank = Number(digit);
      if (rank > maxRank) throw new Error(`${name}: rank ${rank} exceeds max rank ${maxRank}`);
      if (rank) ranks[name] = rank;
    });
  });
  return ranks;
}

/**
 * The rule violations of a build on a frozen build's trees, ranks by talent name (decodeFrozenCode):
 * the same rules as `validateTalentBuild` (tier gates counted in lower tiers, prerequisites at max
 * rank, the point cap), with `rules` today's, which every frozen build shares.
 */
export function frozenBuildProblems(trees: FrozenTree[], ranks: Record<string, number>, rules: Pick<TalentRules, 'maxPoints' | 'pointsPerTier'>): string[] {
  const problems: string[] = [];
  const maxRank = new Map(trees.flatMap((tree) => tree.talents.map(([name, max]) => [name, max] as const)));
  let total = 0;
  for (const tree of trees) {
    for (const [name, , , tier, , prerequisite] of tree.talents) {
      const rank = ranks[name] ?? 0;
      total += rank;
      if (!rank) continue;
      const above = tree.talents.filter((t) => t[3] < tier).reduce((n, t) => n + (ranks[t[0]] ?? 0), 0);
      if (above < rules.pointsPerTier * tier) problems.push(`${name} (tier ${tier + 1}) needs ${rules.pointsPerTier * tier} points in lower tiers, has ${above}`);
      if (prerequisite !== null && (ranks[prerequisite] ?? 0) < (maxRank.get(prerequisite) ?? 0)) problems.push(`${name} requires ${prerequisite} at rank ${maxRank.get(prerequisite)}`);
    }
  }
  if (total > rules.maxPoints) problems.push(`${total} points exceeds the ${rules.maxPoints}-point cap`);
  return problems;
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
 * Encodes ranks by talent id as a build code in canonical form: always three
 * segments, trailing zeros trimmed ("05050103-" style). Ids that are unknown or
 * not in the Forever tree are ignored.
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
 * Checks a finished build against the talent rules: known Forever-tree talents,
 * ranks within 0..maxRank, total <= rules.maxPoints, tier gates (pointsPerTier
 * per tier, counted in lower tiers of the same tree) and prerequisites at their
 * required rank. Returns human-readable problems; empty means valid.
 *
 * The client's tier-7 gates count the whole tree, the tier-7 talent included; this
 * check counts only lower tiers, the stricter Classic rule
 * (docs/data/talents.md#tier-gates).
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
