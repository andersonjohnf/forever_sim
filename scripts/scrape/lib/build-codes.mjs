// Talent build codes (docs/data/talents.md#build-codes): the order of a code's digits, decoding,
// the legality rules and the guard that keeps stored codes meaning the same build from one client
// build to the next. The same algorithm as src/data/talents/types.ts. Pure functions over a talent
// dataset (src/data/talents/<class>.json); scripts/scrape/talents-client.mjs runs the guard.

/** The talents of each tree in build-code order: Forever-tree talents by tier, then column. */
export const codeOrder = (data) => data.trees.map((tree) => tree.talents.filter((t) => t.inForeverTree).sort((a, b) => a.tier - b.tier || a.col - b.col));

/** A build code as ranks by talent name ("Tree/Name" → rank), or throws. */
export function decodeByName(data, code) {
  const order = codeOrder(data);
  const out = {};
  code.split("-").forEach((segment, i) => {
    if (segment.length > order[i].length) throw new Error(`segment ${i} has ${segment.length} digits for ${order[i].length} talents`);
    [...segment].forEach((digit, k) => {
      const t = order[i][k];
      if (Number(digit) > t.maxRank) throw new Error(`${t.name}: rank ${digit} > ${t.maxRank}`);
      if (Number(digit)) out[`${data.trees[i].name}/${t.name}`] = Number(digit);
    });
  });
  return out;
}

/** The same checks as validateTalentBuild in src/data/talents/types.ts. */
export function validate(data, code) {
  const order = codeOrder(data);
  const ranks = new Map();
  code.split("-").forEach((segment, i) => [...segment].forEach((d, k) => Number(d) && ranks.set(order[i][k].id, Number(d))));
  const all = data.trees.flatMap((tree) => tree.talents);
  const byId = new Map(all.map((t) => [t.id, t]));
  const problems = [];
  let total = 0;
  for (const [id, rank] of ranks) {
    const t = byId.get(id);
    total += rank;
    const below = all.filter((x) => x.tree === t.tree && x.tier < t.tier).reduce((n, x) => n + (ranks.get(x.id) ?? 0), 0);
    if (below < data.rules.pointsPerTier * t.tier) problems.push(`${t.name} needs ${data.rules.pointsPerTier * t.tier} points above, has ${below}`);
    if (t.prerequisite && (ranks.get(t.prerequisite.talentId) ?? 0) < t.prerequisite.rank) problems.push(`${t.name} requires ${byId.get(t.prerequisite.talentId).name} ${t.prerequisite.rank}`);
  }
  if (total > data.rules.maxPoints) problems.push(`${total} points`);
  return problems;
}

/** A build code as ranks by talent name per tree, in code order: "Name rank, Name rank" ("" for none). */
export function describeRanks(data, code) {
  const order = codeOrder(data);
  const segments = code.split("-");
  return order.map((talents, i) =>
    talents
      .map((t, k) => [t.name, Number(segments[i]?.[k] ?? 0)])
      .filter(([, r]) => r)
      .map(([name, r]) => `${name} ${r}`)
      .join(", "),
  );
}

/**
 * What changed in the build-code positions (each tree's talents in code order) from
 * `old` to `next`: positions whose talent or max rank differ or that are gone (`changed`), and
 * talents appended at the end of a tree (`appended`, harmless: old codes decode the same).
 */
export function codePositionChanges(old, next) {
  const changed = [];
  const appended = [];
  const a = codeOrder(old);
  const b = codeOrder(next);
  const treeNames = (d) => d.trees.map((t) => t.name).join(", ");
  if (treeNames(old) !== treeNames(next)) changed.push(`trees ${treeNames(old)} → ${treeNames(next)}`);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const tree = next.trees[i]?.name ?? old.trees[i]?.name;
    for (let k = 0; k < Math.max(a[i]?.length ?? 0, b[i]?.length ?? 0); k++) {
      const o = a[i]?.[k];
      const n = b[i]?.[k];
      const label = (t) => (t ? `${t.name} (max ${t.maxRank})` : "nothing");
      if (!o) appended.push(`${tree} position ${k + 1}: ${label(n)}`);
      else if (!n || o.name !== n.name || o.maxRank !== n.maxRank) changed.push(`${tree} position ${k + 1}: ${label(o)} → ${label(n)}`);
    }
  }
  return { changed, appended };
}
