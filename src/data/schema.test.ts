// A light schema check of the generated JSON in src/data against the interfaces in each folder's
// types.ts (docs/data/README.md: "a types.ts with TypeScript interfaces that match the JSON
// exactly"). Each key list below `satisfies` a Record over the interface's keys, so typecheck fails
// when a list and its interface drift apart; the tests fail when a generated record has a key the
// interface doesn't declare, or lacks a required one (true = required, false = optional).
import { describe, expect, it } from 'vitest'
import itemJson from './items/pre-bis.json'
import type { Item, ItemData, ItemDataMeta, ItemSet, SetBonus, UseEffect, Weapon } from './items/types'
import raceJson from './races/races.json'
import type { Race, RaceData, RaceSnapshotMeta, Racial } from './races/types'
import druidSpellJson from './spells/druid.json'
import paladinSpellJson from './spells/paladin.json'
import type { NoClientDataRow, Spell, SpellBook, SpellBookMeta, SpellRank, SpellRankPair } from './spells/types'
import warriorSpellJson from './spells/warrior.json'
import druidTalentJson from './talents/druid.json'
import paladinTalentJson from './talents/paladin.json'
import type { Talent, TalentData, TalentSnapshotMeta, TalentTree } from './talents/types'
import warriorTalentJson from './talents/warrior.json'

type Shape<T> = Record<keyof T, boolean>

/** `record`'s keys are all declared by `shape`, and every required one is there. */
function expectShape(record: object, shape: Record<string, boolean>, label: string) {
  const declared = new Set(Object.keys(shape))
  expect(Object.keys(record).filter((k) => !declared.has(k)), `${label}: keys types.ts doesn't declare`).toEqual([])
  expect(Object.entries(shape).filter(([k, required]) => required && !(k in record)).map(([k]) => k), `${label}: required keys missing`).toEqual([])
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const ITEM_DATA = { meta: true, sets: true, items: true } satisfies Shape<ItemData>
const ITEM_META = {
  source: true,
  scraper: true,
  product: true,
  foreverBuild: true,
  foreverBuildDate: true,
  classicProduct: true,
  classicBuild: true,
  tables: true,
  wowDbDefs: true,
  scrapedAt: true,
  filter: true,
  counts: true,
  noClientRow: true,
  preRaidBis: true,
  descriptionCoverage: true,
  ratingConversions: true,
  fallbackEffects: true,
} satisfies Shape<ItemDataMeta>
const ITEM = {
  id: true,
  name: true,
  icon: true,
  quality: true,
  itemLevel: true,
  reqLevel: true,
  tab: true,
  classicName: true,
  foreverData: true,
  foreverSource: true,
  statsFrom: true,
  slot: true,
  equipSlots: true,
  itemClass: true,
  itemSubclass: true,
  armorType: true,
  weaponType: true,
  binding: true,
  unique: true,
  uniqueEquipped: true,
  classes: true,
  races: true,
  requirements: true,
  stats: true,
  weapon: true,
  weaponSkill: true,
  statSpellIds: true,
  procs: true,
  useEffects: true,
  otherEquip: true,
  setId: true,
  source: true,
  preRaidBis: true,
  sellPrice: true,
  flavor: true,
  classic: true,
  classicShieldBlockValue: false,
  notes: true,
} satisfies Shape<Item>
const WEAPON = { min: true, max: true, speed: true, dps: true, school: true, skill: true, extraDamage: false } satisfies Shape<Weapon>
const EFFECT = { raw: true, spellId: true, cooldownSec: false } satisfies Shape<UseEffect>
const ITEM_SET = { name: true, size: true, itemIds: true, bonuses: true, bonusesFrom: true } satisfies Shape<ItemSet>
const SET_BONUS = { pieces: true, spellId: true, text: true, parsed: false, weaponSkill: false } satisfies Shape<SetBonus>

describe('items/pre-bis.json matches src/data/items/types.ts', () => {
  const data = itemJson as unknown as ItemData
  it('in its envelope and every item, effect line, set and bonus', () => {
    expectShape(data, ITEM_DATA, 'ItemData')
    expectShape(data.meta, ITEM_META, 'ItemDataMeta')
    for (const item of data.items) {
      expectShape(item, ITEM, `item ${item.id}`)
      if (item.weapon) expectShape(item.weapon, WEAPON, `item ${item.id} weapon`)
      for (const e of [...item.procs, ...item.useEffects, ...item.otherEquip]) expectShape(e, EFFECT, `item ${item.id} effect`)
    }
    for (const [id, set] of Object.entries(data.sets)) {
      expectShape(set, ITEM_SET, `set ${id}`)
      for (const b of set.bonuses) expectShape(b, SET_BONUS, `set ${id} bonus ${b.pieces}`)
    }
  })
})

// ---------------------------------------------------------------------------
// Spellbooks
// ---------------------------------------------------------------------------

const BOOK = { meta: true, class: true, counts: true, tabs: true, spells: true, missing: true } satisfies Shape<SpellBook>
const BOOK_META = {
  source: true,
  scraper: true,
  scrapedAt: true,
  product: true,
  foreverBuild: true,
  foreverBuildDate: true,
  classicProduct: true,
  classicBuild: true,
  tables: true,
  wowDbDefs: true,
  noClientData: true,
} satisfies Shape<SpellBookMeta>
const NO_CLIENT_DATA = { spellId: true, skillLine: true, acquireMethod: true, supersedes: true, encrypted: true, classic: true } satisfies Shape<NoClientDataRow>
const SPELL = {
  id: true,
  name: true,
  tab: true,
  icon: true,
  level: true,
  status: true,
  races: true,
  maxRank: true,
  isTalent: true,
  grantedByTalent: true,
  classic: true,
  ranks: true,
} satisfies Shape<Spell>
const RANK_PAIR = { rank: true, forever: true, classic: true, differences: true } satisfies Shape<SpellRankPair>
const RANK = {
  spellId: true,
  rankLabel: true,
  level: true,
  text: true,
  cost: true,
  castTime: true,
  cooldown: true,
  range: true,
  school: true,
  icon: true,
  forms: true,
  requires: true,
  name: false,
} satisfies Shape<SpellRank>

describe.each([
  ['warrior', warriorSpellJson],
  ['druid', druidSpellJson],
  ['paladin', paladinSpellJson],
])('spells/%s.json matches src/data/spells/types.ts', (cls, json) => {
  const book = json as unknown as SpellBook
  it('in its envelope and every spell and rank', () => {
    expectShape(book, BOOK, `${cls} SpellBook`)
    expectShape(book.meta, BOOK_META, `${cls} SpellBookMeta`)
    for (const row of book.meta.noClientData) expectShape(row, NO_CLIENT_DATA, `${cls} noClientData ${row.spellId}`)
    for (const s of book.spells) {
      expectShape(s, SPELL, `${cls} ${s.name}`)
      for (const p of s.ranks) {
        expectShape(p, RANK_PAIR, `${cls} ${s.name} rank ${p.rank}`)
        for (const r of [p.forever, p.classic]) if (r) expectShape(r, RANK, `${cls} ${s.name} ${r.spellId}`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Talents
// ---------------------------------------------------------------------------

const TALENT_DATA = { meta: true, class: true, rules: true, codeFormat: true, trees: true } satisfies Shape<TalentData>
const TALENT_META = {
  source: true,
  scrapedAt: true,
  foreverBuild: true,
  foreverBuildDate: true,
  classicBuild: true,
  product: true,
  classicProduct: true,
  traitTreeId: true,
  traitCurrencyId: true,
  tables: true,
  wowDbDefs: true,
  scraper: true,
} satisfies Shape<TalentSnapshotMeta>
const TREE = { id: true, name: true, icon: true, index: true, clientTreeId: true, talents: true } satisfies Shape<TalentTree>
const TALENT = {
  id: true,
  name: true,
  icon: true,
  tree: true,
  tier: true,
  col: true,
  order: true,
  maxRank: true,
  prerequisite: true,
  inForeverTree: true,
  changeKind: true,
  passive: true,
  tooltip: true,
  previousName: true,
  spellId: true,
  classicSpellId: true,
  ranks: true,
  classic: true,
} satisfies Shape<Talent>

describe.each([
  ['warrior', warriorTalentJson],
  ['druid', druidTalentJson],
  ['paladin', paladinTalentJson],
])('talents/%s.json matches src/data/talents/types.ts', (cls, json) => {
  const data = json as unknown as TalentData
  it('in its envelope and every tree and talent', () => {
    expectShape(data, TALENT_DATA, `${cls} TalentData`)
    expectShape(data.meta, TALENT_META, `${cls} TalentSnapshotMeta`)
    for (const tree of data.trees) {
      expectShape(tree, TREE, `${cls} ${tree.name}`)
      for (const t of tree.talents) expectShape(t, TALENT, `${cls} ${t.name}`)
    }
  })
})

// ---------------------------------------------------------------------------
// Races
// ---------------------------------------------------------------------------

const RACE_DATA = { meta: true, classOrder: true, simClassAvailability: true, newCombos: true, races: true } satisfies Shape<RaceData>
const RACE_META = {
  source: true,
  scraper: true,
  scrapedAt: true,
  product: true,
  foreverBuild: true,
  foreverBuildDate: true,
  classicProduct: true,
  classicBuild: true,
  tables: true,
  wowDbDefs: true,
} satisfies Shape<RaceSnapshotMeta>
const RACE = {
  id: true,
  name: true,
  baseName: true,
  faction: true,
  icon: true,
  chrRacesId: true,
  newInForever: true,
  classes: true,
  racials: true,
  removedRacials: true,
} satisfies Shape<Race>
const RACIAL = {
  id: true,
  name: true,
  icon: true,
  spellIds: true,
  changeKind: true,
  changeLabel: true,
  passive: true,
  tooltip: true,
  forever: true,
  foreverByClass: true,
  classic: true,
  classicSpellId: true,
  races: true,
} satisfies Shape<Racial>

describe('races/races.json matches src/data/races/types.ts', () => {
  const data = raceJson as unknown as RaceData
  it('in its envelope and every race and racial', () => {
    expectShape(data, RACE_DATA, 'RaceData')
    expectShape(data.meta, RACE_META, 'RaceSnapshotMeta')
    for (const race of data.races) {
      expectShape(race, RACE, race.id)
      for (const r of race.racials) expectShape(r, RACIAL, `${race.id} ${r.id}`)
    }
  })
})
