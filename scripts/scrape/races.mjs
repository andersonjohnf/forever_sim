#!/usr/bin/env node
// One-time snapshot of WoW Forever races, race/class availability and racials
// from https://foreverchanges.pro/racials.
//
//   node scripts/scrape/races.mjs [--refresh]
//
// Fetches /racials (cached under .cache/scrape/races/), decodes the Next.js RSC
// payload and writes src/data/races/races.json. Exits non-zero if validation
// fails. Node >= 22, no npm dependencies. See docs/data/races.md.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  REPO_ROOT,
  SITE,
  assertKnownKeys,
  createChecker,
  decodeRscPage,
  fetchCached,
  findAll,
  hasFlag,
  rankArray,
  textContent,
  walkElements,
  writeJson,
} from './talents.mjs';

const SITE_PATH = '/racials';
const OUT_FILE = path.join(REPO_ROOT, 'src/data/races/races.json');
const SCRAPER = 'scripts/scrape/races.mjs';

// Class order and labels used by the site.
const CLASS_ORDER = ['warrior', 'hunter', 'mage', 'rogue', 'priest', 'warlock', 'paladin', 'druid', 'shaman'];
const CLASS_LABELS = {
  warrior: 'Warrior', hunter: 'Hunter', mage: 'Mage', rogue: 'Rogue', priest: 'Priest',
  warlock: 'Warlock', paladin: 'Paladin', druid: 'Druid', shaman: 'Shaman',
};
const SIM_CLASSES = ['warrior', 'druid', 'paladin'];

// Classic Era (1.15.x / 1.12) race-class availability, used only to cross-check
// the site's "added in Forever" markers and to detect removals.
const CLASSIC_REFERENCE = {
  'horde-orc': ['warrior', 'hunter', 'rogue', 'warlock', 'shaman'],
  'horde-undead': ['warrior', 'mage', 'rogue', 'priest', 'warlock'],
  'horde-tauren': ['warrior', 'hunter', 'druid', 'shaman'],
  'horde-troll': ['warrior', 'hunter', 'mage', 'rogue', 'priest', 'shaman'],
  'alliance-human': ['warrior', 'mage', 'rogue', 'priest', 'warlock', 'paladin'],
  'alliance-dwarf': ['warrior', 'hunter', 'rogue', 'priest', 'paladin'],
  'alliance-night-elf': ['warrior', 'hunter', 'rogue', 'priest', 'druid'],
  'alliance-gnome': ['warrior', 'mage', 'rogue', 'warlock'],
};

// The site's display classification (function o() in its racials chunk) and labels.
const DISPLAY_KINDS = ['added', 'modified', 'moved', 'unchanged'];
const RACE_KEYS = [
  'id', 'race', 'faction', 'icon', 'classes', 'ability_ids', 'sources', 'status',
  'compatibility_conflicts', 'abilities', 'reported_removals',
];
const ABILITY_KEYS = [
  'id', 'name', 'kind', 'icon', 'reported_change_kind', 'evidence_status', 'rank_texts',
  'estimated_rank_texts', 'unranked_effect', 'race_profiles', 'discovered_at', 'calculator_eligible',
  'context_only', 'comparison_status', 'classic', 'structure', 'tooltip_metadata', 'sources', 'reference_notes',
];
const ABILITY_CLASSIC_KEYS = ['status', 'rank_texts', 'description', 'name', 'other_races'];
const TOOLTIP_KEYS = { passive: 'passive', resource_cost: 'resourceCost', range: 'range', cast_time: 'castTime', cooldown: 'cooldown' };
const SOURCE_KEYS = { url: 'url', type: 'type', title: 'title', label: 'label', author: 'author', video_timestamp: 'videoTimestamp', retrieved_at: 'retrievedAt' };

const sortClasses = (list) => [...list].sort((a, b) => CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b));

function convertSource(s, where) {
  assertKnownKeys(s, Object.keys(SOURCE_KEYS), where);
  const out = {};
  for (const [k, v] of Object.entries(SOURCE_KEYS)) if (s[k] !== undefined) out[v] = s[k];
  return out;
}

/**
 * Splits class-specific effect text ("Warrior, Paladin: …\nPriest: …") into a
 * map keyed by class slug; null when the text is not written per class.
 */
function splitByClass(text) {
  const lines = text.split('\n');
  const names = Object.values(CLASS_LABELS).join('|');
  const re = new RegExp(`^((?:${names})(?:, (?:${names}))*): (.+)$`);
  if (lines.length < 2 || !lines.every((l) => re.test(l))) return null;
  const out = {};
  for (const line of lines) {
    const [, who, effect] = re.exec(line);
    for (const label of who.split(', ')) {
      const slug = Object.keys(CLASS_LABELS).find((k) => CLASS_LABELS[k] === label);
      out[slug] = effect;
    }
  }
  return Object.fromEntries(sortClasses(Object.keys(out)).map((k) => [k, out[k]]));
}

function convertAbility(raw, c, researchSource) {
  const where = `racial ${raw.id}`;
  assertKnownKeys(raw, ABILITY_KEYS, where);
  assertKnownKeys(raw.classic ?? {}, ABILITY_CLASSIC_KEYS, `${where}.classic`);
  assertKnownKeys(raw.tooltip_metadata ?? {}, Object.keys(TOOLTIP_KEYS), `${where}.tooltip_metadata`);
  c.check(raw.kind === 'racial', `${raw.id}: kind ${raw.kind}`);

  // Same selection as the site: the unranked effect, else the lowest rank's text.
  const foreverRanks = rankArray(raw.rank_texts, `${where}.rank_texts`);
  const forever = raw.unranked_effect || foreverRanks[0] || null;
  const classicStatus = raw.classic?.status ?? null;
  const classicText =
    classicStatus === 'verified'
      ? (raw.unranked_effect ? raw.classic.description : rankArray(raw.classic.rank_texts, where)[0]) ?? null
      : null;
  const displayKind = DISPLAY_KINDS.includes(raw.reported_change_kind)
    ? raw.reported_change_kind
    : ['absent', 'not_listed'].includes(classicStatus)
      ? 'added'
      : null;

  const tooltip = {};
  for (const [k, v] of Object.entries(raw.tooltip_metadata ?? {})) if (k !== 'passive') tooltip[TOOLTIP_KEYS[k]] = v;
  const classicBaseline = (raw.sources ?? []).find((s) => s.type === 'classic_baseline');
  const classicSpellId = Number(/wowhead\.com\/classic\/spell=(\d+)/.exec(classicBaseline?.url ?? '')?.[1]) || null;

  return {
    id: raw.id,
    name: raw.name,
    icon: raw.icon,
    changeKind: raw.reported_change_kind,
    displayKind,
    changeLabel: null, // filled from the page's text index
    passive: typeof raw.tooltip_metadata?.passive === 'boolean' ? raw.tooltip_metadata.passive : null,
    tooltip: Object.keys(tooltip).length ? tooltip : null,
    forever,
    foreverByClass: forever ? splitByClass(forever) : null,
    classic: {
      status: classicStatus,
      name: raw.classic?.name ?? null,
      text: classicText,
      otherRaces: (raw.classic?.other_races ?? []).map((o) => ({ race: o.race, text: o.description })),
    },
    classicSpellId,
    races: [...raw.race_profiles],
    evidenceStatus: raw.evidence_status,
    comparisonStatus: raw.comparison_status,
    discoveredAt: raw.discovered_at ?? null,
    notes: (raw.reference_notes ?? []).map((n) => {
      assertKnownKeys(n, ['id', 'type', 'reported', 'existing', 'sources'], `${where}.reference_notes`);
      const out = { type: n.type, reported: n.reported };
      if (n.existing !== undefined) out.existing = n.existing;
      out.sources = (n.sources ?? []).map(researchSource);
      return out;
    }),
    sources: (raw.sources ?? []).map((s) => convertSource(s, `${where}.sources`)),
  };
}

/** The server-rendered text index: one section per race, one <li> per racial. */
function extractTextIndex(resolved, deref) {
  const races = new Map();
  walkElements([...resolved.values()], deref, (el) => {
    const props = el[3] ?? {};
    if (el[1] !== 'section' || props.className !== 'xi-group') return true;
    const entry = { heading: null, faction: null, items: [] };
    walkElements(props.children, deref, (child) => {
      const p = child[3] ?? {};
      if (child[1] === 'h3') {
        entry.heading = textContent(p.children, deref);
        walkElements(p.children, deref, (s) => {
          if (s[1] === 'small') entry.faction = textContent(s[3]?.children, deref);
          return true;
        });
      }
      if (child[1] === 'li') {
        const item = { id: child[2], className: p.className, spans: [] };
        walkElements(p.children, deref, (x) => {
          const xp = x[3] ?? {};
          if (x[1] === 'strong') item.name = textContent(xp.children, deref);
          if (x[1] === 'em') item.label = textContent(xp.children, deref);
          if (x[1] === 'span') item.spans.push({ className: xp.className ?? null, text: textContent(xp.children, deref) });
          return false;
        });
        entry.items.push(item);
        return false;
      }
      return true;
    });
    races.set(el[2], entry);
    return false;
  });
  return races;
}

async function main() {
  const refresh = hasFlag('--refresh');
  const cacheFile = path.join(REPO_ROOT, '.cache/scrape/races', 'racials.html');
  const { html, fetchedAt } = await fetchCached(SITE_PATH, cacheFile, { refresh });
  const { resolved, deref } = decodeRscPage(html);
  const c = createChecker('races');

  const found = findAll(
    [...resolved.values()],
    (v) => !Array.isArray(v) && Array.isArray(v.races) && Array.isArray(v.matrix) && v.research,
  );
  if (found.length !== 1) throw new Error(`Expected 1 racials payload, found ${found.length}`);
  const props = found[0];
  const { research } = props;
  const index = extractTextIndex(resolved, deref);

  const foreverBuilds = new Set();
  const matrixById = new Map(props.matrix.map((m) => [m.id, m]));
  const removalsByRace = new Map((research.reported_removals ?? []).map((r) => [r.race, r]));
  const researchSource = (id) => research.sources.find((s) => s.id === id)?.url ?? id;

  const races = props.races.map((raw) => {
    assertKnownKeys(raw, RACE_KEYS, `race ${raw.id}`);
    const m = matrixById.get(raw.id);
    if (!c.check(m, `${raw.id}: missing from the class matrix`)) return null;
    c.check(m.race === raw.race && m.faction === raw.faction, `${raw.id}: matrix name/faction mismatch`);
    c.check(m.classes.join() === raw.classes.join(), `${raw.id}: matrix classes differ from race classes`);
    c.check(['Horde', 'Alliance'].includes(raw.faction), `${raw.id}: faction ${raw.faction}`);
    c.check(raw.classes.every((k) => CLASS_ORDER.includes(k)), `${raw.id}: unknown class in ${raw.classes}`);

    const forever = sortClasses(raw.classes);
    const added = sortClasses(m.added ?? []);
    const newRace = m.skyborne === true;
    let classic = null;
    let removed = [];
    if (newRace) {
      c.check(added.join() === forever.join(), `${raw.id}: new race but not every class marked added`);
      c.check(!CLASSIC_REFERENCE[raw.id], `${raw.id}: marked new but exists in Classic`);
    } else {
      classic = forever.filter((k) => !added.includes(k));
      const reference = CLASSIC_REFERENCE[raw.id];
      if (c.check(reference, `${raw.id}: no Classic reference class list`)) {
        c.check(
          sortClasses(reference).join() === classic.join(),
          `${raw.id}: Classic classes derived from the site (${classic}) differ from the Classic reference (${reference})`,
        );
        removed = sortClasses(reference.filter((k) => !forever.includes(k)));
        classic = sortClasses(reference);
      }
    }

    const racials = raw.abilities.map((a) => convertAbility(a, c, researchSource));
    c.check(
      [...raw.ability_ids].sort().join() === racials.map((a) => a.id).sort().join(),
      `${raw.id}: ability_ids differ from abilities`,
    );
    for (const a of raw.abilities) {
      c.check(a.race_profiles.includes(raw.id), `${a.id}: race_profiles lacks ${raw.id}`);
      for (const s of a.sources ?? []) if (s.type === 'client_data') foreverBuilds.add(/build=([\d.]+)/.exec(s.url)?.[1] ?? null);
    }
    for (const a of racials) {
      if (a.foreverByClass) {
        const covered = Object.keys(a.foreverByClass);
        c.check(covered.every((k) => forever.includes(k)), `${a.id}: per-class text names a class ${raw.race} cannot be`);
      }
    }

    // Cross-check against the page's text index and take its labels.
    const idx = index.get(raw.id);
    if (c.check(idx, `${raw.id}: no text index section`)) {
      c.check(idx.heading === `${raw.race}${raw.faction}`, `${raw.id}: index heading ${idx.heading}`);
      c.check(idx.items.map((i) => i.id).join() === racials.map((a) => a.id).join(), `${raw.id}: index racial order differs`);
      for (const item of idx.items) {
        const a = racials.find((x) => x.id === item.id);
        if (!a) continue;
        a.changeLabel = item.label ?? null;
        c.check(item.name === a.name, `${a.id}: index name ${item.name}`);
        c.check(item.className === `xi-kind-${a.displayKind}`, `${a.id}: index class ${item.className} vs ${a.displayKind}`);
        const text = item.spans.find((s) => !s.className)?.text;
        c.check(text === (a.forever ?? a.classic.text), `${a.id}: index effect text differs`);
        const classicSpan = item.spans.find((s) => s.className === 'xi-classic')?.text ?? null;
        // The index omits the Classic line when it is identical to the Forever text.
        const expectClassic = a.classic.text && a.classic.text !== a.forever ? `Classic: ${a.classic.text}` : null;
        c.check(classicSpan === expectClassic, `${a.id}: index Classic text differs`);
      }
    }

    const siteRemovals = removalsByRace.get(raw.race);
    c.check(
      (siteRemovals?.names ?? []).join() === raw.reported_removals.join(),
      `${raw.id}: reported removals differ between race and research blocks`,
    );

    return {
      id: raw.id,
      name: raw.race,
      baseName: m.name,
      faction: raw.faction,
      icon: raw.icon,
      newInForever: newRace,
      classes: { forever, classic, addedInForever: added, removedInForever: removed },
      classAvailabilityStatus: raw.status,
      compatibilityConflicts: raw.compatibility_conflicts.map((x) => ({
        class: x.class,
        sources: (x.sources ?? []).map(researchSource),
      })),
      racials,
      reportedRemovals: raw.reported_removals.map((name) => ({
        name,
        status: siteRemovals?.status ?? null,
        sources: (siteRemovals?.sources ?? []).map(researchSource),
      })),
      sources: raw.sources.map((s) => convertSource(s, `race ${raw.id}.sources`)),
    };
  }).filter(Boolean);

  // Shared racials (Skyborne) must be identical wherever they appear.
  const byId = new Map();
  for (const r of races) {
    for (const a of r.racials) {
      const prev = byId.get(a.id);
      if (prev) c.check(JSON.stringify(prev) === JSON.stringify(a), `${a.id}: differs between races`);
      else byId.set(a.id, a);
      c.check(a.races.every((id) => races.some((x) => x.id === id)), `${a.id}: unknown race profile`);
    }
  }

  // New race/class combinations reported by the site vs the per-race markers.
  const newCombos = props.newCombos.map((n) => {
    const race = races.find((r) => r.name === n.race && r.faction === n.faction);
    c.check(race && race.classes.addedInForever.includes(n.class), `newCombos ${n.race}/${n.class} not marked added`);
    return { raceId: race?.id ?? null, race: n.race, faction: n.faction, class: n.class };
  });
  const markedAdded = races.filter((r) => !r.newInForever).flatMap((r) => r.classes.addedInForever.map((k) => `${r.id}/${k}`));
  c.check(markedAdded.length === newCombos.length, `newCombos (${newCombos.length}) != added markers (${markedAdded.length})`);

  c.check(races.length === 10, `expected 10 races (page says "All 10 races"), got ${races.length}`);
  c.check(research.coverage?.unique_abilities === byId.size, `research says ${research.coverage?.unique_abilities} unique racials, found ${byId.size}`);
  c.check(foreverBuilds.size === 1 && !foreverBuilds.has(null), `Forever build ambiguous: ${[...foreverBuilds]}`);

  const simClassAvailability = Object.fromEntries(
    SIM_CLASSES.map((k) => [
      k,
      {
        forever: races.filter((r) => r.classes.forever.includes(k)).map((r) => r.id),
        classic: races.filter((r) => r.classes.classic?.includes(k)).map((r) => r.id),
      },
    ]),
  );

  const data = {
    meta: {
      source: new URL(SITE_PATH, SITE).href,
      scrapedAt: fetchedAt,
      foreverBuild: [...foreverBuilds][0],
      classicBuild: null,
      scraper: SCRAPER,
    },
    research: {
      updatedAt: research.updated_at ?? null,
      sources: research.sources.map((s) => ({ id: s.id, url: s.url, label: s.label, status: s.status })),
      coverage: {
        profiles: research.coverage?.profiles ?? null,
        uniqueAbilities: research.coverage?.unique_abilities ?? null,
        preservedRaceClassPairs: research.coverage?.preserved_race_class_pairs ?? null,
        conflictingAdditionalPair: research.coverage?.conflicting_additional_pair ?? null,
      },
      notes: [...(research.notes ?? [])],
    },
    classOrder: CLASS_ORDER,
    simClassAvailability,
    newCombos,
    races,
  };

  const problems = c.report();
  await writeJson(OUT_FILE, data);
  const pairs = races.reduce((n, r) => n + r.classes.forever.length, 0);
  console.log(`races: ${races.length} races, ${byId.size} unique racials, ${pairs} race/class pairs -> ${path.relative(REPO_ROOT, OUT_FILE)}`);
  for (const k of SIM_CLASSES) {
    const a = simClassAvailability[k];
    const gained = a.forever.filter((id) => !a.classic.includes(id));
    const lost = a.classic.filter((id) => !a.forever.includes(id));
    console.log(`  ${k}: ${a.forever.length} races in Forever (${a.classic.length} in Classic); new: ${gained.join(', ') || 'none'}; lost: ${lost.join(', ') || 'none'}`);
  }
  if (problems) {
    console.error(`\n${problems} validation problem(s); JSON was written for inspection but is not trustworthy.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
