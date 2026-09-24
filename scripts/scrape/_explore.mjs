// Scratch exploration helper (not committed).
import path from "node:path";
import { createFetcher } from "./lib/http.mjs";
import { createClientSource, latestBuild, wowDbDefsCommit } from "./lib/wago.mjs";
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "client");
const fetcher = createFetcher({ cacheDir: CACHE_DIR, refresh: false });
export async function loadTables(names, version) {
  const latest = await latestBuild(fetcher, "wow_classic_beta");
  const v = version ?? latest.version;
  const dbdefsSha = await wowDbDefsCommit(fetcher, null);
  const source = createClientSource({ fetcher, cacheDir: CACHE_DIR, version: v, dbdefsSha });
  const t = {};
  for (const n of names) t[n] = await source.table(n);
  return { t, version: v };
}

const mode = process.argv[2];
if (mode === "trees") {
  const { t } = await loadTables(["TraitTree", "TraitNode", "TraitNodeEntry", "TraitNodeXTraitNodeEntry", "TraitDefinition", "SpellName", "TraitTreeXTraitCurrency", "TraitCond"]);
  for (const id of process.argv.slice(3).map(Number)) {
    const tree = t.TraitTree.byId.get(id);
    const nodes = t.TraitNode.rows.filter((n) => n.TraitTreeID === id);
    const names = [];
    for (const n of nodes)
      for (const l of t.TraitNodeXTraitNodeEntry.rows.filter((x) => x.TraitNodeID === n.ID)) {
        const e = t.TraitNodeEntry.byId.get(l.TraitNodeEntryID);
        const d = e && t.TraitDefinition.byId.get(e.TraitDefinitionID);
        if (d) names.push(t.SpellName.byId.get(d.SpellID)?.Name_lang ?? d.SpellID);
      }
    console.log(id, JSON.stringify(tree), nodes.length, names.join(", "));
    console.log(" currencies", t.TraitTreeXTraitCurrency.rows.filter((r) => r.TraitTreeID === id).length, "conds", t.TraitCond.rows.filter((r) => r.TraitTreeID === id).length);
  }
}

if (mode === "spell" || mode === "spellc") {
  const ver = mode === "spellc" ? "1.15.9.69722" : undefined;
  const { t } = await loadTables(["Spell", "SpellName", "SpellEffect", "SpellMisc", "SpellXDescriptionVariables", "SpellDescriptionVariables", "SpellPower", "SpellCooldowns", "SpellCastTimes", "SpellDuration", "SpellAuraOptions", "SpellClassOptions", "SpellCategories", "SpellLevels"], ver);
  const by = (tab, id) => t[tab].rows.filter((r) => r.SpellID === id);
  for (const id of process.argv.slice(3).map(Number)) {
    const s = t.Spell.byId.get(id);
    console.log(`== ${id} ${t.SpellName.byId.get(id)?.Name_lang} [${s?.NameSubtext_lang ?? ""}]`);
    console.log("  desc:", s?.Description_lang, "| aura:", s?.AuraDescription_lang);
    for (const x of by("SpellXDescriptionVariables", id)) console.log("  vars:", t.SpellDescriptionVariables.byId.get(x.SpellDescriptionVariablesID)?.Variables);
    for (const e of by("SpellEffect", id)) if (!e.DifficultyID) console.log(`  eff${e.EffectIndex}: effect ${e.Effect} aura ${e.EffectAura} bp ${e.EffectBasePointsF ?? e.EffectBasePoints} var ${e.Variance} rpl ${e.EffectRealPointsPerLevel} coef ${e.EffectBonusCoefficient} period ${e.EffectAuraPeriod} trig ${e.EffectTriggerSpell} misc ${JSON.stringify(e.EffectMiscValue)} mask ${JSON.stringify(e.EffectSpellClassMask)} chain ${e.EffectChainTargets} amp ${e.EffectAmplitude}`);
    for (const m of by("SpellMisc", id)) console.log(`  misc: castTime ${m.CastingTimeIndex} (${JSON.stringify(t.SpellCastTimes.byId.get(m.CastingTimeIndex))}) dur ${m.DurationIndex} (${JSON.stringify(t.SpellDuration.byId.get(m.DurationIndex))}) school ${m.SchoolMask} speed ${m.Speed} attr ${JSON.stringify(m.Attributes)}`);
    for (const p of by("SpellPower", id)) console.log(`  power: type ${p.PowerType} cost ${p.ManaCost} pct ${p.PowerCostPct} maxpct ${p.PowerCostMaxPct} perLevel ${p.ManaCostPerLevel}`);
    for (const c of by("SpellCooldowns", id)) console.log(`  cd: recovery ${c.RecoveryTime} cat ${c.CategoryRecoveryTime} gcd ${c.StartRecoveryTime} gcdcat ${c.StartRecoveryCategory}`);
    for (const c of by("SpellCategories", id)) console.log(`  cat: ${JSON.stringify(c)}`);
    for (const a of by("SpellAuraOptions", id)) console.log(`  auraopt: stacks ${a.CumulativeAura} chance ${a.ProcChance} charges ${a.ProcCharges} procmask ${JSON.stringify(a.ProcTypeMask)} recovery ${a.ProcCategoryRecovery}`);
    for (const c of by("SpellClassOptions", id)) console.log(`  class: set ${c.SpellClassSet} mask ${JSON.stringify(c.SpellClassMask)}`);
    for (const l of by("SpellLevels", id)) console.log(`  levels: base ${l.BaseLevel} spell ${l.SpellLevel} max ${l.MaxLevel}`);
  }
}
if (mode === "find" || mode === "findc") {
  const ver = mode === "findc" ? "1.15.9.69722" : undefined;
  const { t } = await loadTables(["SpellName"], ver);
  const re = new RegExp(process.argv[3], "i");
  console.log(t.SpellName.rows.filter((r) => re.test(r.Name_lang)).map((r) => `${r.ID} ${r.Name_lang}`).join("\n"));
}
