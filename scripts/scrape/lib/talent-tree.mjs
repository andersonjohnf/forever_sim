// The talent trees of a class from the client tables: the Forever tree from the Trait tables
// (layout, arrows, tier gates, per-rank values and texts) and the Classic Era tree from the
// legacy Talent/TalentTab tables, for the comparison. Pure functions, zero dependencies:
// callers pass parsed tables (see FOREVER_TREE_TABLES, CLASSIC_TREE_TABLES) and a spell-text
// context per build. scripts/scrape/talents-client.mjs writes src/data/talents/<class>.json from
// them; docs/data/talents.md documents the derivation.
//
// Forever (TraitTree per class):
//   TraitNode (PosX, PosY) -> TraitNodeXTraitNodeEntry -> TraitNodeEntry (MaxRanks)
//   -> TraitDefinition (SpellID, OverrideName, OverrideIcon)
//   -> TraitDefinitionEffectPoints (EffectIndex, CurveID) -> CurvePoint (rank -> value)
//   TraitEdge (Left -> Right; Type 2 "sufficient for availability" is the usual arrow, 3
//   "required for availability" also gates, 0 is visual only)
//   TraitNodeGroupXTraitNode + TraitNodeGroupXTraitCond -> TraitCond (SpentAmountRequired
//   points of TraitCurrency, spent in the nodes of TraitCond.TraitNodeGroupID)
// The three tabs of a class are the three PosX clusters of its tree, left to right in TalentTab
// OrderIndex order; tier = (PosY − top) / 600 and column = (PosX − tab left) / 600.

import { renderSpellText, formatDuration } from "./spell-text.mjs";

export const GRID = 600;

/** Forever tables this module reads (plus lib/spell-text.mjs SPELL_TEXT_TABLES). */
export const FOREVER_TREE_TABLES = [
  "TraitTree",
  "TraitNode",
  "TraitNodeEntry",
  "TraitNodeXTraitNodeEntry",
  "TraitDefinition",
  "TraitDefinitionEffectPoints",
  "TraitEdge",
  "TraitNodeGroupXTraitNode",
  "TraitNodeGroupXTraitCond",
  "TraitNodeXTraitCond",
  "TraitCond",
  "TraitCurrency",
  "TraitTreeXTraitCurrency",
  "CurvePoint",
  "TalentTab",
  "ChrClasses",
  "SpellClassOptions",
  "SpellPower",
  "SpellCooldowns",
  "SpellCastTimes",
  "SpellEquippedItems",
  "ItemSubClass",
];

/** Classic Era tables this module reads (plus SPELL_TEXT_TABLES). */
export const CLASSIC_TREE_TABLES = ["Talent", "TalentTab", "ChrClasses"];

/** SpellClassOptions.SpellClassSet of each class (the spell family). */
const SPELL_FAMILY = { warrior: 4, paladin: 10, druid: 7 };
/** ChrClasses.Name_lang of each class slug. */
const CLASS_NAME = { warrior: "Warrior", paladin: "Paladin", druid: "Druid" };

const rowsOf = (t) => t?.rows ?? [];
const groupBy = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};
export const slug = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Values of a curve at ranks 1..maxRank (exact points; linear between neighbours otherwise). */
export function curveValues(points, maxRank) {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const values = [];
  for (let r = 1; r <= maxRank; r++) {
    const exact = pts.find((p) => p.x === r);
    if (exact) {
      values.push(exact.y);
      continue;
    }
    const lo = [...pts].reverse().find((p) => p.x < r);
    const hi = pts.find((p) => p.x > r);
    if (lo && hi) values.push(lo.y + ((hi.y - lo.y) * (r - lo.x)) / (hi.x - lo.x));
    else values.push(lo?.y ?? hi?.y ?? null);
  }
  return values;
}

// ---------------------------------------------------------------------------
// Forever: the Trait tree of a class
// ---------------------------------------------------------------------------

/**
 * Read the Forever talent tree of `cls` from the Trait tables. Returns
 *   { traitTreeId, currency: { id, max }, tabs: [{ id, name, iconFileDataId, orderIndex, left, right }],
 *     talents: [ForeverTalent], problems: [], notes: [] }
 * where `problems` must be empty for the data to be written and `notes` are facts worth
 * printing (off-grid nodes, visual-only edges, empty conditions, gates that count the talent's
 * own tier).
 */
export function readForeverTree(t, cls) {
  const problems = [];
  const notes = [];
  const family = SPELL_FAMILY[cls];
  const classId = rowsOf(t.ChrClasses).find((c) => c.Name_lang === CLASS_NAME[cls])?.ID;
  if (!family || !classId) throw new Error(`unknown class ${cls}`);

  const entry = t.TraitNodeEntry.byId;
  const def = t.TraitDefinition.byId;
  const spellFamily = new Map(rowsOf(t.SpellClassOptions).map((r) => [r.SpellID, r.SpellClassSet]));
  const linksByNode = groupBy(rowsOf(t.TraitNodeXTraitNodeEntry), "TraitNodeID");
  const nodeEntries = (nodeId) =>
    (linksByNode.get(nodeId) ?? [])
      .slice()
      .sort((a, b) => a.Index - b.Index || a.ID - b.ID)
      .map((l) => {
        const e = entry.get(l.TraitNodeEntryID);
        const d = e && def.get(e.TraitDefinitionID);
        return e && d ? { entry: e, def: d } : null;
      })
      .filter(Boolean);
  const currencyOf = groupBy(rowsOf(t.TraitTreeXTraitCurrency), "TraitTreeID");
  const condsOfTree = groupBy(rowsOf(t.TraitCond), "TraitTreeID");
  const nodesOfTree = groupBy(rowsOf(t.TraitNode), "TraitTreeID");

  // The class tree: a talent tree (spends a currency and has tier conditions) whose node spells
  // are mostly of the class's spell family. The client also ships an older druid tree (1083)
  // with no conditions or currency.
  const candidates = [];
  for (const tree of rowsOf(t.TraitTree)) {
    const nodes = nodesOfTree.get(tree.ID) ?? [];
    if (!nodes.length || !(currencyOf.get(tree.ID) ?? []).length || !(condsOfTree.get(tree.ID) ?? []).length) continue;
    const families = new Map();
    for (const n of nodes)
      for (const { def: d } of nodeEntries(n.ID)) {
        const f = spellFamily.get(d.SpellID);
        if (f) families.set(f, (families.get(f) ?? 0) + 1);
      }
    const top = [...families].sort((a, b) => b[1] - a[1])[0];
    if (top?.[0] === family) candidates.push(tree.ID);
  }
  if (candidates.length !== 1) throw new Error(`${cls}: expected one Trait tree of spell family ${family}, found ${candidates.join(", ") || "none"}`);
  const traitTreeId = candidates[0];

  const currencies = (currencyOf.get(traitTreeId) ?? []).map((x) => t.TraitCurrency.byId.get(x.TraitCurrencyID));
  if (currencies.length !== 1 || !currencies[0]) problems.push(`${cls}: Trait tree ${traitTreeId} spends ${currencies.length} currencies`);
  const currency = { id: currencies[0]?.ID ?? null, max: currencies[0]?.SourcedMax ?? null };

  // Nodes with a definition, placed on the grid.
  const nodes = (nodesOfTree.get(traitTreeId) ?? []).filter((n) => nodeEntries(n.ID).length);
  for (const n of nodes) if (nodeEntries(n.ID).length > 1) problems.push(`${cls}: node ${n.ID} has ${nodeEntries(n.ID).length} entries (a choice node)`);
  const xs = [...new Set(nodes.map((n) => n.PosX))].sort((a, b) => a - b);
  const clusters = [];
  for (const x of xs) {
    const last = clusters.at(-1);
    if (last && x - last.at(-1) <= GRID * 2) last.push(x);
    else clusters.push([x]);
  }
  const tabRows = rowsOf(t.TalentTab)
    .filter((r) => r.ClassMask === 1 << (classId - 1))
    .sort((a, b) => a.OrderIndex - b.OrderIndex);
  if (clusters.length !== 3 || tabRows.length !== 3) problems.push(`${cls}: ${clusters.length} node columns clusters and ${tabRows.length} TalentTab rows (want 3 and 3)`);
  const tabs = tabRows.map((r, i) => ({
    id: r.ID,
    name: r.Name_lang,
    iconFileDataId: r.SpellIconID,
    orderIndex: r.OrderIndex,
    left: clusters[i]?.[0] ?? null,
    right: clusters[i]?.at(-1) ?? null,
  }));
  for (const tab of tabs) {
    const width = Math.round((tab.right - tab.left) / GRID);
    if (width !== 3) problems.push(`${cls} ${tab.name}: nodes span ${width + 1} columns (want 4), so the left edge is unknown`);
  }
  const top = Math.min(...nodes.map((n) => n.PosY));
  const place = (n) => {
    const tab = clusters.findIndex((c) => c.includes(n.PosX));
    const tierF = (n.PosY - top) / GRID;
    const colF = (n.PosX - clusters[tab][0]) / GRID;
    const tier = Math.round(tierF);
    const col = Math.round(colF);
    const off = [Math.round((tierF - tier) * GRID), Math.round((colF - col) * GRID)];
    return { tab, tier, col, off };
  };

  // Arrows and gates.
  const edgesInto = groupBy(rowsOf(t.TraitEdge), "RightTraitNodeID");
  const groupsOfNode = groupBy(rowsOf(t.TraitNodeGroupXTraitNode), "TraitNodeID");
  const nodesOfGroup = groupBy(rowsOf(t.TraitNodeGroupXTraitNode), "TraitNodeGroupID");
  const condsOfGroup = groupBy(rowsOf(t.TraitNodeGroupXTraitCond), "TraitNodeGroupID");
  const condsOfNode = groupBy(rowsOf(t.TraitNodeXTraitCond), "TraitNodeID");
  const cond = t.TraitCond.byId;

  // Per-rank values.
  const pointsByDef = groupBy(rowsOf(t.TraitDefinitionEffectPoints), "TraitDefinitionID");
  const curve = new Map();
  for (const c of rowsOf(t.CurvePoint)) {
    if (!curve.has(c.CurveID)) curve.set(c.CurveID, []);
    curve.get(c.CurveID).push({ x: c.Pos[0], y: c.Pos[1] });
  }

  const talents = nodes.map((n) => {
    const [{ entry: e, def: d }] = nodeEntries(n.ID);
    const p = place(n);
    if (p.off[0] || p.off[1]) notes.push(`${cls}: node ${n.ID} sits ${p.off[0]} / ${p.off[1]} off the ${GRID} grid (tier / column); rounded`);
    const name = d.OverrideName_lang || t.SpellName.byId.get(d.SpellID)?.Name_lang || "";
    if (!name) problems.push(`${cls}: node ${n.ID} (spell ${d.SpellID}) has no name`);
    const into = edgesInto.get(n.ID) ?? [];
    for (const x of into.filter((x) => ![0, 2, 3].includes(x.Type))) problems.push(`${cls} ${name}: TraitEdge ${x.ID} has unknown type ${x.Type}`);
    // Conditions on the node's groups (and on the node itself): points spent in a group.
    const condIds = [
      ...(groupsOfNode.get(n.ID) ?? []).flatMap((g) => (condsOfGroup.get(g.TraitNodeGroupID) ?? []).map((x) => x.TraitCondID)),
      ...(condsOfNode.get(n.ID) ?? []).map((x) => x.TraitCondID),
    ];
    const gates = [];
    for (const id of condIds) {
      const c = cond.get(id);
      if (!c) {
        problems.push(`${cls} ${name}: TraitCond ${id} missing`);
        continue;
      }
      const empty = !c.SpentAmountRequired && !c.TraitCurrencyID && !c.TraitNodeGroupID && !c.TraitNodeID && !c.TraitNodeEntryID && !c.QuestID && !c.AchievementID && !c.SpecSetID && !c.RequiredLevel && !c.GrantedRanks;
      if (empty) {
        notes.push(`${cls} ${name}: TraitCond ${c.ID} has no requirement (ignored)`);
        continue;
      }
      if (c.CondType !== 0 || c.TraitCurrencyID !== currency.id || !c.TraitNodeGroupID || c.TraitNodeID || c.TraitNodeEntryID || c.QuestID || c.AchievementID || c.SpecSetID || c.RequiredLevel || c.GrantedRanks) {
        problems.push(`${cls} ${name}: TraitCond ${c.ID} isn't a points-spent gate: ${JSON.stringify(c)}`);
        continue;
      }
      gates.push({ condId: c.ID, spent: c.SpentAmountRequired, groupId: c.TraitNodeGroupID, nodeIds: (nodesOfGroup.get(c.TraitNodeGroupID) ?? []).map((x) => x.TraitNodeID) });
    }
    const rankEffects = (pointsByDef.get(d.ID) ?? [])
      .slice()
      .sort((a, b) => a.EffectIndex - b.EffectIndex || a.ID - b.ID)
      .map((pt) => {
        if (pt.OperationType !== 0) problems.push(`${cls} ${name}: effect ${pt.EffectIndex} curve operation ${pt.OperationType} (only 0, set, is known)`);
        return { effectIndex: pt.EffectIndex, curveId: pt.CurveID, values: curveValues(curve.get(pt.CurveID) ?? [], e.MaxRanks) };
      });
    for (const r of rankEffects) if (r.values.some((v) => v === null)) problems.push(`${cls} ${name}: curve ${r.curveId} has no points`);
    return {
      nodeId: n.ID,
      nodeFlags: n.Flags,
      entryId: e.ID,
      definitionId: d.ID,
      spellId: d.SpellID,
      name,
      iconFileDataId: d.OverrideIcon || null,
      tab: p.tab,
      tier: p.tier,
      col: p.col,
      maxRank: e.MaxRanks,
      prerequisiteNodeIds: into.filter((x) => x.Type === 2 || x.Type === 3).map((x) => ({ nodeId: x.LeftTraitNodeID, type: x.Type })),
      visualEdgeNodeIds: into.filter((x) => x.Type === 0).map((x) => x.LeftTraitNodeID),
      gates,
      rankEffects,
    };
  });

  // Gates against the classic rule: tier N needs 5·N points in lower tiers of the same tree.
  const byNode = new Map(talents.map((x) => [x.nodeId, x]));
  for (const x of talents) {
    if (x.tier === 0) {
      if (x.gates.length) problems.push(`${cls} ${x.name}: a tier-1 talent with a gate`);
      continue;
    }
    if (x.gates.length !== 1) {
      problems.push(`${cls} ${x.name}: ${x.gates.length} tier gates`);
      continue;
    }
    const [g] = x.gates;
    const counted = g.nodeIds.map((id) => byNode.get(id));
    if (counted.some((c) => !c || c.tab !== x.tab)) problems.push(`${cls} ${x.name}: TraitCond ${g.condId} counts nodes outside its tree`);
    const lowerTiers = talents.filter((o) => o.tab === x.tab && o.tier < x.tier).map((o) => o.nodeId);
    const tiersCounted = [...new Set(counted.filter(Boolean).map((c) => c.tier))].sort((a, b) => a - b);
    const same = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
    g.counts = same(g.nodeIds, lowerTiers) ? "lower tiers" : same(g.nodeIds, talents.filter((o) => o.tab === x.tab).map((o) => o.nodeId)) ? "whole tree" : `tiers ${tiersCounted.map((v) => v + 1).join(", ")}`;
    if (g.counts !== "lower tiers") notes.push(`${cls} ${x.name} (tier ${x.tier + 1}): TraitCond ${g.condId} counts the ${g.counts}, not only the lower tiers`);
    if (g.counts !== "lower tiers" && g.counts !== "whole tree") problems.push(`${cls} ${x.name}: TraitCond ${g.condId} counts ${g.counts}`);
  }
  return { traitTreeId, currency, tabs, talents, problems, notes };
}

/**
 * Per-rank Forever texts of a talent: the rank spell's description with the curve value of
 * each rank in place of the effect's base points. `$?` conditions are taken as unmet (a reader
 * with no auras or talents), and a blank line in the client text is kept as one "\n" (the UI
 * shows it as a paragraph break). Returns { texts, unrendered, assumed }.
 */
export function renderForeverRanks(ctx, talent) {
  const texts = [];
  const unrendered = new Set();
  const assumed = new Set();
  for (let r = 1; r <= talent.maxRank; r++) {
    const own = new Map(ctx.effects.get(talent.spellId) ?? []);
    for (const e of talent.rankEffects) {
      const row = own.get(e.effectIndex);
      if (row) own.set(e.effectIndex, { ...row, EffectBasePointsF: e.values[r - 1] });
    }
    const effects = new Map(ctx.effects);
    effects.set(talent.spellId, own);
    const out = renderSpellText({ ...ctx, effects }, talent.spellId, { conditions: "unmet", paragraphs: true });
    texts.push(out.text);
    for (const u of out.unrendered) unrendered.add(u);
    for (const a of out.assumed) assumed.add(a);
  }
  return { texts, unrendered: [...unrendered], assumed: [...assumed] };
}

// ---------------------------------------------------------------------------
// Tooltip header of an active talent: cost, range, cast time, cooldown, requirements
// ---------------------------------------------------------------------------

/** SPELL_ATTR0_PASSIVE. */
const ATTR0_PASSIVE = 0x40;
/** SPELL_ATTR1_CHANNELED_1 | SPELL_ATTR1_CHANNELED_2. */
const ATTR1_CHANNELED = 0x4 | 0x40;
const POWER_NAME = { 0: "Mana", 1: "Rage", 2: "Focus", 3: "Energy" };
/** Rage and focus costs are stored in tenths. */
const POWER_SCALE = { 1: 10, 2: 10 };
/** Weapon subclass masks the tooltip names as a group (ItemSubClass bits). */
const WEAPON_MASKS = new Map([
  [173555, "Melee Weapon"], // axes, maces, swords (1H and 2H), polearms, staves, fist weapons, daggers, spears
  [1378, "Two-Handed Melee Weapon"], // 2H axes, 2H maces, polearms, 2H swords, staves
]);

export function createTooltipContext(t) {
  const first = (name) => {
    const m = new Map();
    for (const r of rowsOf(t[name])) if (!r.DifficultyID && !m.has(r.SpellID)) m.set(r.SpellID, r);
    return m;
  };
  const power = new Map();
  for (const r of [...rowsOf(t.SpellPower)].sort((a, b) => a.OrderIndex - b.OrderIndex)) if (!power.has(r.SpellID)) power.set(r.SpellID, r);
  return {
    misc: first("SpellMisc"),
    power,
    cooldowns: first("SpellCooldowns"),
    castTimes: t.SpellCastTimes.byId,
    ranges: t.SpellRange.byId,
    equipped: new Map(rowsOf(t.SpellEquippedItems).map((r) => [r.SpellID, r])),
    subclass: new Map(rowsOf(t.ItemSubClass).map((r) => [`${r.ClassID}:${r.SubClassID}`, r])),
  };
}

/** Whether the spell is passive (SPELL_ATTR0_PASSIVE). */
export function isPassive(tc, spellId) {
  return ((tc.misc.get(spellId)?.Attributes?.[0] ?? 0) & ATTR0_PASSIVE) !== 0;
}

/** The tooltip header of an active spell, or null for a passive one. */
export function tooltipHeader(tc, spellId) {
  if (isPassive(tc, spellId)) return null;
  const misc = tc.misc.get(spellId);
  const out = {};
  const p = tc.power.get(spellId);
  if (p?.PowerCostPct) out.resourceCost = `${p.PowerCostPct}% of base ${(POWER_NAME[p.PowerType] ?? "power").toLowerCase()}`;
  else if (p?.ManaCost) out.resourceCost = `${p.ManaCost / (POWER_SCALE[p.PowerType] ?? 1)} ${POWER_NAME[p.PowerType] ?? "power"}`;
  const range = misc?.RangeIndex ? tc.ranges.get(misc.RangeIndex) : null;
  if (range && range.RangeMax?.[0] > 0) out.range = range.Flags & 1 ? "Melee range" : `${range.RangeMax[0]} yd range`;
  const channeled = ((misc?.Attributes?.[1] ?? 0) & ATTR1_CHANNELED) !== 0;
  const cast = misc?.CastingTimeIndex ? (tc.castTimes.get(misc.CastingTimeIndex)?.Base ?? 0) : 0;
  out.castTime = channeled ? "Channeled" : cast > 0 ? `${cast / 1000} sec cast` : "Instant";
  const cd = tc.cooldowns.get(spellId);
  const cdMs = Math.max(cd?.RecoveryTime ?? 0, cd?.CategoryRecoveryTime ?? 0);
  if (cdMs > 0) out.cooldown = `${formatDuration(cdMs)} cooldown`;
  const eq = tc.equipped.get(spellId);
  if (eq && eq.EquippedItemClass >= 0 && eq.EquippedItemSubclass > 0) {
    const named = eq.EquippedItemClass === 2 ? WEAPON_MASKS.get(eq.EquippedItemSubclass) : null;
    const names = [];
    for (let bit = 0; bit < 32; bit++)
      if (eq.EquippedItemSubclass & (1 << bit)) {
        const r = tc.subclass.get(`${eq.EquippedItemClass}:${bit}`);
        names.push(r?.VerboseName_lang || r?.DisplayName_lang || `subclass ${bit}`);
      }
    out.requirements = `Requires ${named ?? (eq.EquippedItemClass === 4 && eq.EquippedItemSubclass === 64 ? "Shields" : names.join(", "))}`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classic Era: the legacy Talent/TalentTab trees of a class
// ---------------------------------------------------------------------------

/**
 * Read the Classic Era talent trees of `cls`. Returns [{ id, tab, tabName, tier, col, maxRank,
 * spellIds, name, prerequisite: { talentId, name, rank } | null }] (0-based tier and column).
 */
export function readClassicTrees(t, cls) {
  const classId = rowsOf(t.ChrClasses).find((c) => c.Name_lang === CLASS_NAME[cls])?.ID;
  const tabs = new Map(rowsOf(t.TalentTab).filter((r) => r.ClassMask === 1 << (classId - 1)).map((r) => [r.ID, r]));
  const rows = rowsOf(t.Talent).filter((r) => tabs.has(r.TabID));
  const byId = new Map(rows.map((r) => [r.ID, r]));
  const nameOf = (r) => t.SpellName.byId.get(r.SpellRank[0])?.Name_lang ?? null;
  return rows
    .map((r) => {
      const spellIds = r.SpellRank.filter((x) => x > 0);
      const pre = r.PrereqTalent[0] ? byId.get(r.PrereqTalent[0]) : null;
      return {
        id: r.ID,
        tab: r.TabID,
        tabName: tabs.get(r.TabID).Name_lang,
        tabOrder: tabs.get(r.TabID).OrderIndex,
        tier: r.TierID,
        col: r.ColumnIndex,
        maxRank: spellIds.length,
        spellIds,
        name: nameOf(r),
        // PrereqRank is 0-based (0 = rank 1).
        prerequisite: pre ? { talentId: pre.ID, name: nameOf(pre), rank: r.PrereqRank[0] + 1 } : null,
      };
    })
    .sort((a, b) => a.tabOrder - b.tabOrder || a.tier - b.tier || a.col - b.col);
}

/** Classic Era rank texts: each rank spell's description. */
export function renderClassicRanks(ctx, classic) {
  const unrendered = new Set();
  const texts = classic.spellIds.map((id) => {
    const out = renderSpellText(ctx, id, { conditions: "unmet", paragraphs: true });
    for (const u of out.unrendered) unrendered.add(u);
    return out.text;
  });
  return { texts, unrendered: [...unrendered] };
}

/**
 * Match each Forever talent to a Classic Era talent of the class: first by spell (the Forever
 * talent's spell is one of the Classic ranks), then by name. Returns Map(nodeId → { classic,
 * matchedBy: "spell" | "name" }) and the list of Classic talents matched twice.
 */
export function matchClassic(forever, classic) {
  const bySpell = new Map();
  for (const c of classic) for (const id of c.spellIds) bySpell.set(id, c);
  const byName = new Map(classic.map((c) => [norm(c.name ?? ""), c]));
  const out = new Map();
  const used = new Map();
  for (const f of forever) {
    let c = bySpell.get(f.spellId);
    let matchedBy = "spell";
    if (!c) {
      c = byName.get(norm(f.name));
      matchedBy = "name";
    }
    if (!c) continue;
    out.set(f.nodeId, { classic: c, matchedBy });
    used.set(c.id, [...(used.get(c.id) ?? []), f.name]);
  }
  const twice = [...used].filter(([, names]) => names.length > 1).map(([id, names]) => ({ classicId: id, forever: names }));
  return { matches: out, twice };
}
