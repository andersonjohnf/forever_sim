// Maps the scraped talent trees (src/data/talents/<class>.json) to the Forever client's
// talent data.
//
// Forever keeps its talents in the Trait tables, one TraitTree per class:
//   TraitNode (TraitTreeID, PosX, PosY) -> TraitNodeXTraitNodeEntry -> TraitNodeEntry
//   (MaxRanks, TraitDefinitionID) -> TraitDefinition (SpellID, OverrideName, VisibleSpellID)
//   -> TraitDefinitionEffectPoints (EffectIndex, CurveID) -> CurvePoint (rank -> value)
// A talent with N ranks is ONE spell whose effect values come from the curve per rank, so
// every rank shares the spell id and `rankEffects` holds the per-rank values. The legacy
// Talent/TalentTab tables are still in the client but describe the Classic Era trees.
//
// The three talent tabs of a class are the three PosX clusters of its tree (in TalentTab
// OrderIndex order); tier = (PosY - top) / 600 and column = (PosX - tab left) / 600.
// Talents are matched by name within their tab, then by tier and column for renamed ones.

const GRID = 600;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function curveValues(curvePoints, curveId, maxRank) {
  const pts = curvePoints.get(curveId) ?? [];
  const values = [];
  for (let r = 1; r <= maxRank; r++) {
    const exact = pts.find((p) => p.x === r);
    if (exact) {
      values.push(exact.y);
      continue;
    }
    // Linear interpolation between neighbours (curves in this client are exact per rank).
    const lo = [...pts].reverse().find((p) => p.x < r);
    const hi = pts.find((p) => p.x > r);
    if (lo && hi) values.push(lo.y + ((hi.y - lo.y) * (r - lo.x)) / (hi.x - lo.x));
    else values.push(lo?.y ?? hi?.y ?? null);
  }
  return values;
}

/**
 * @param {Record<string, object>} t        parsed tables (TraitTree, TraitNode, …, SpellName)
 * @param {Record<string, object>} scraped  class -> TalentData (src/data/talents/<class>.json)
 */
export function mapTalents(t, scraped) {
  const entriesByNode = new Map();
  for (const x of t.TraitNodeXTraitNodeEntry.rows) {
    if (!entriesByNode.has(x.TraitNodeID)) entriesByNode.set(x.TraitNodeID, []);
    entriesByNode.get(x.TraitNodeID).push(x);
  }
  const pointsByDef = new Map();
  for (const p of t.TraitDefinitionEffectPoints.rows) {
    if (!pointsByDef.has(p.TraitDefinitionID)) pointsByDef.set(p.TraitDefinitionID, []);
    pointsByDef.get(p.TraitDefinitionID).push(p);
  }
  const curvePoints = new Map();
  for (const c of t.CurvePoint.rows) {
    if (!curvePoints.has(c.CurveID)) curvePoints.set(c.CurveID, []);
    curvePoints.get(c.CurveID).push({ x: c.Pos[0], y: c.Pos[1], order: c.OrderIndex });
  }
  for (const pts of curvePoints.values()) pts.sort((a, b) => a.order - b.order || a.x - b.x);
  // TraitEdge.Type as in the retail client: 0 visual only, 2 "sufficient for availability"
  // (the usual arrow), 3 "required for availability". Only 2 and 3 gate a talent.
  const edgesInto = new Map();
  for (const e of t.TraitEdge.rows) {
    if (e.Type !== 2 && e.Type !== 3) continue;
    if (!edgesInto.has(e.RightTraitNodeID)) edgesInto.set(e.RightTraitNodeID, []);
    edgesInto.get(e.RightTraitNodeID).push(e.LeftTraitNodeID);
  }

  /** Client nodes of a tree with their definitions. */
  function clientNodes(treeId) {
    return t.TraitNode.rows
      .filter((n) => n.TraitTreeID === treeId)
      .map((n) => {
        const links = (entriesByNode.get(n.ID) ?? []).slice().sort((a, b) => a.Index - b.Index);
        const entries = links.map((l) => {
          const entry = t.TraitNodeEntry.byId.get(l.TraitNodeEntryID);
          const def = entry && t.TraitDefinition.byId.get(entry.TraitDefinitionID);
          const name = def ? def.OverrideName_lang || t.SpellName.byId.get(def.SpellID)?.Name_lang || "" : "";
          return { entry, def, name };
        });
        return { node: n, entries };
      })
      .filter((n) => n.entries.some((e) => e.def));
  }

  const trees = t.TraitTree.rows.map((tr) => ({ id: tr.ID, nodes: clientNodes(tr.ID) }));
  const result = { classes: {}, unmapped: [], counts: { talents: 0, mapped: 0, byName: 0, byPosition: 0, unmapped: 0 } };

  for (const [cls, data] of Object.entries(scraped)) {
    const wanted = data.trees.flatMap((tree) => tree.talents.filter((x) => x.inForeverTree).map((x) => norm(x.name)));
    // The class tree is the one whose node names cover most of the scraped talents.
    let best = null;
    for (const tr of trees) {
      const names = new Set(tr.nodes.flatMap((n) => n.entries.map((e) => norm(e.name))));
      const score = wanted.filter((w) => names.has(w)).length;
      if (!best || score > best.score) best = { tree: tr, score };
    }
    const tree = best.tree;
    // Tabs: PosX clusters, left to right.
    const xs = [...new Set(tree.nodes.map((n) => n.node.PosX))].sort((a, b) => a - b);
    const clusters = [];
    for (const x of xs) {
      const last = clusters.at(-1);
      if (last && x - last.at(-1) <= GRID * 2) last.push(x);
      else clusters.push([x]);
    }
    const top = Math.min(...tree.nodes.map((n) => n.node.PosY));
    const tabOf = (x) => clusters.findIndex((c) => c.includes(x));
    const place = (n) => {
      const tab = tabOf(n.node.PosX);
      return { tab, tier: Math.round((n.node.PosY - top) / GRID), col: Math.round((n.node.PosX - clusters[tab][0]) / GRID) };
    };
    const talentByNode = new Map();
    const out = { traitTreeId: tree.id, tabs: [], talents: [] };
    for (const scrapedTree of data.trees) {
      const tab = scrapedTree.index;
      out.tabs.push({ tree: scrapedTree.id, index: tab, posX: clusters[tab] ? [clusters[tab][0], clusters[tab].at(-1)] : null });
      const tabNodes = tree.nodes.filter((n) => tabOf(n.node.PosX) === tab);
      for (const talent of scrapedTree.talents) {
        if (!talent.inForeverTree) continue;
        result.counts.talents++;
        let match = tabNodes.find((n) => n.entries.some((e) => norm(e.name) === norm(talent.name)));
        let matchedBy = "name";
        if (!match) {
          match = tabNodes.find((n) => {
            const p = place(n);
            return p.tier === talent.tier && p.col === talent.col;
          });
          matchedBy = "position";
        }
        if (!match) {
          result.unmapped.push({ class: cls, tree: scrapedTree.id, talentId: talent.id, name: talent.name, reason: "no Trait node with this name or position in the tab" });
          result.counts.unmapped++;
          continue;
        }
        const e = match.entries.find((x) => norm(x.name) === norm(talent.name)) ?? match.entries[0];
        const p = place(match);
        const maxRank = e.entry.MaxRanks;
        const rankEffects = (pointsByDef.get(e.def.ID) ?? [])
          .slice()
          .sort((a, b) => a.EffectIndex - b.EffectIndex || a.ID - b.ID)
          .map((pt) => ({
            effectIndex: pt.EffectIndex,
            operationType: pt.OperationType,
            curveId: pt.CurveID,
            values: curveValues(curvePoints, pt.CurveID, maxRank),
          }));
        const mismatches = [];
        if (p.tier !== talent.tier) mismatches.push(`tier: scraped ${talent.tier}, client ${p.tier}`);
        if (p.col !== talent.col) mismatches.push(`col: scraped ${talent.col}, client ${p.col}`);
        if (maxRank !== talent.maxRank) mismatches.push(`maxRank: scraped ${talent.maxRank}, client ${maxRank}`);
        if (matchedBy === "position") mismatches.push(`name: scraped "${talent.name}", client "${e.name}"`);
        const rec = {
          id: talent.id,
          name: talent.name,
          clientName: e.name,
          tree: scrapedTree.id,
          tier: talent.tier,
          col: talent.col,
          maxRank,
          matchedBy,
          traitNodeId: match.node.ID,
          traitNodeEntryId: e.entry.ID,
          traitDefinitionId: e.def.ID,
          spellId: e.def.SpellID,
          visibleSpellId: e.def.VisibleSpellID,
          overridesSpellId: e.def.OverridesSpellID,
          rankSpellIds: Array.from({ length: maxRank }, () => e.def.SpellID),
          rankEffects,
          client: { tier: p.tier, col: p.col, prerequisiteNodeIds: (edgesInto.get(match.node.ID) ?? []).slice().sort((a, b) => a - b) },
          mismatches,
        };
        talentByNode.set(match.node.ID, rec);
        out.talents.push(rec);
        result.counts.mapped++;
        if (matchedBy === "name") result.counts.byName++;
        else result.counts.byPosition++;
      }
    }
    // Prerequisites as talent ids, checked against the scraped arrows.
    const scrapedById = new Map(data.trees.flatMap((tr) => tr.talents.map((x) => [x.id, x])));
    for (const rec of out.talents) {
      rec.client.prerequisiteTalentIds = rec.client.prerequisiteNodeIds.map((id) => talentByNode.get(id)?.id ?? null);
      const want = scrapedById.get(rec.id)?.prerequisite?.talentId ?? null;
      const have = rec.client.prerequisiteTalentIds;
      if ((want ?? null) !== (have[0] ?? null) || have.length > 1) {
        rec.mismatches.push(`prerequisite: scraped ${want ?? "none"}, client ${have.length ? have.join(", ") : "none"}`);
      }
    }
    out.talents.sort((a, b) => a.tree.localeCompare(b.tree) || a.tier - b.tier || a.col - b.col);
    result.classes[cls] = out;
  }
  return result;
}

export const TALENT_TABLES = [
  "TraitTree",
  "TraitNode",
  "TraitNodeEntry",
  "TraitNodeXTraitNodeEntry",
  "TraitDefinition",
  "TraitDefinitionEffectPoints",
  "TraitEdge",
  "CurvePoint",
  "SpellName",
];
