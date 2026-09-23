// Integrity checks over the generated snapshot in src/data (docs/data/README.md).
// These guard against scraper regressions, not against beta balance changes: they check
// structure and internal consistency, and avoid hard-coding values a new build may change.
import { describe, expect, it } from 'vitest'
import { TALENT_EFFECTS } from '@/sim/classes/warrior/talents'
import { defaultConfig, talentPresets } from '@/sim/defaults'
import { SPEC_IDS, SPEC_META } from '@/sim/specs'
import itemJson from './items/pre-bis.json'
import type { ItemData } from './items/types'
import raceJson from './races/races.json'
import type { RaceData } from './races/types'
import druidSpellJson from './spells/druid.json'
import paladinSpellJson from './spells/paladin.json'
import type { SpellBook } from './spells/types'
import warriorSpellJson from './spells/warrior.json'
import druidTalentJson from './talents/druid.json'
import paladinTalentJson from './talents/paladin.json'
import {
  decodeTalentCode,
  encodeTalentCode,
  pointsPerTree,
  type TalentData,
  talentsInCodeOrder,
  validateTalentBuild,
} from './talents/types'
import warriorTalentJson from './talents/warrior.json'

const spellBooks = {
  warrior: warriorSpellJson as unknown as SpellBook,
  druid: druidSpellJson as unknown as SpellBook,
  paladin: paladinSpellJson as unknown as SpellBook,
}
const talentData = {
  warrior: warriorTalentJson as unknown as TalentData,
  druid: druidTalentJson as unknown as TalentData,
  paladin: paladinTalentJson as unknown as TalentData,
}
const races = raceJson as unknown as RaceData
const items = itemJson as unknown as ItemData

/** Next.js RSC back-references ("$1e:props:…", "$undefined", "$L1f") that a scraper failed to resolve. */
const RSC_REFERENCE = /^\$[$@A-Za-z0-9]/

function unresolvedReferences(value: unknown, path = '$root', found: string[] = []): string[] {
  if (typeof value === 'string') {
    if (RSC_REFERENCE.test(value)) found.push(`${path} = ${value}`)
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => unresolvedReferences(v, `${path}[${i}]`, found))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) unresolvedReferences(v, `${path}.${k}`, found)
  }
  return found
}

const allDatasets: Record<string, { meta: { source: string; scrapedAt: string; foreverBuild: string } }> = {
  ...Object.fromEntries(Object.entries(spellBooks).map(([c, d]) => [`spells/${c}`, d])),
  ...Object.fromEntries(Object.entries(talentData).map(([c, d]) => [`talents/${c}`, d])),
  races,
  items,
}

describe.each(Object.entries(allDatasets))('%s', (name, data) => {
  it('has a meta envelope tied to a Forever build', () => {
    // Items and talents come from the client files (decision D17); the rest still from foreverchanges.pro.
    const fromClient = name === 'items' || name.startsWith('talents/')
    expect(data.meta.source).toMatch(fromClient ? /^https:\/\/wago\.tools\/api\// : /^https:\/\/foreverchanges\.pro\//)
    expect(Number.isNaN(Date.parse(data.meta.scrapedAt))).toBe(false)
    expect(data.meta.foreverBuild).toMatch(/^1\.60\.\d+\.\d+$/)
  })

  it('contains no unresolved RSC references', () => {
    expect(unresolvedReferences(data)).toEqual([])
  })
})

describe.each(Object.entries(spellBooks))('spells/%s', (cls, book) => {
  it('matches its own page counts', () => {
    expect(book.class).toBe(cls)
    expect(book.spells).toHaveLength(book.counts.total)
    expect(book.missing).toHaveLength(book.counts.notInForever)
    expect(book.tabs.reduce((n, t) => n + t.spellCount, 0)).toBe(book.spells.length)
  })

  it('gives every spell unique id and at least one rank from either client', () => {
    expect(new Set(book.spells.map((s) => s.id)).size).toBe(book.spells.length)
    for (const spell of book.spells) {
      expect(spell.ranks.length, spell.name).toBeGreaterThan(0)
      for (const rank of spell.ranks) expect(rank.forever ?? rank.classic, spell.name).toBeTruthy()
    }
  })
})

// Every build code the repo stores or documents: defaults and presets (src/sim/defaults.ts), the
// class docs' builds (warrior.md §6.1, druid.md §7.1, paladin.md), the old site's popular builds
// and the codes in tests. Share links and saved setups store codes, so a code must keep meaning
// the same build: each entry lists, per tree, the ranks by talent name it decoded to when it was
// written (under the foreverchanges.pro dataset). If a doc changes a build, change it here too.
const STORED_BUILDS: Record<keyof typeof talentData, Record<string, [string, string, string]>> = {
  warrior: {
    // Fury default (17/34/0)
    '30305013002-050530035150010051-': [
      'Improved Heroic Strike 3, Improved Rend 3, Improved Tactical Mastery 5, Anger Management 1, Deep Wounds 3, Impale 2',
      'Cruelty 5, Unbridled Wrath 5, Improved Cleave 3, Boundless Rage 3, Dual Wield Specialization 5, Raging Blows 1, Enrage 5, Death Wish 1, Flurry 5, Bloodthirst 1',
      '',
    ],
    // Fury + Precision (15/36/0)
    '30305013-050520035150310051-': [
      'Improved Heroic Strike 3, Improved Rend 3, Improved Tactical Mastery 5, Anger Management 1, Deep Wounds 3',
      'Cruelty 5, Unbridled Wrath 5, Improved Cleave 2, Boundless Rage 3, Dual Wield Specialization 5, Raging Blows 1, Enrage 5, Precision 3, Death Wish 1, Flurry 5, Bloodthirst 1',
      '',
    ],
    // Arms default (37/14/0)
    '30305213132515201-05050103-': [
      'Improved Heroic Strike 3, Improved Rend 3, Improved Tactical Mastery 5, Improved Overpower 2, Anger Management 1, Deep Wounds 3, Spearing Strike 1, Two-Handed Weapon Specialization 3, Impale 2, Bloodthrill 5, Sweeping Strikes 1, Weaponmaster 5, Improved Slam 2, Mortal Strike 1',
      'Cruelty 5, Unbridled Wrath 5, Piercing Howl 1, Boundless Rage 3',
      '',
    ],
    // Protection default (5/5/36)
    '05-05-552001233201210531': [
      'Deflection 5',
      'Cruelty 5',
      'Shield Specialization 5, Anticipation 5, Improved Bloodrage 2, Last Stand 1, Master of Defense 2, Improved Revenge 3, Defiance 3, Improved Sunder Armor 2, Vanguard 1, Improved Shield Wall 2, Concussion Blow 1, Bastion 5, Focused Rage 3, Shield Slam 1',
    ],
    // Protection "TPS" variant (5/5/36)
    '32-05-552001233201210531': [
      'Improved Heroic Strike 3, Deflection 2',
      'Cruelty 5',
      'Shield Specialization 5, Anticipation 5, Improved Bloodrage 2, Last Stand 1, Master of Defense 2, Improved Revenge 3, Defiance 3, Improved Sunder Armor 2, Vanguard 1, Improved Shield Wall 2, Concussion Blow 1, Bastion 5, Focused Rage 3, Shield Slam 1',
    ],
  },
  druid: {
    // Feral cat default (9/37/5)
    '050022-5520002123032213051-05': [
      "Genesis 5, Nature's Majesty 2, Nature's Reach 2",
      'Ferocity 5, Heart of the Wild 5, Feral Swiftness 2, Savage Fury 2, Feral Charge 1, Sharpened Claws 2, Shredding Attacks 3, Predatory Strikes 3, Primal Fury 2, Predatory Instincts 2, Leader of the Pack 1, King of the Jungle 3, Rend and Tear 5, Berserk 1',
      'Furor 5',
    ],
    // Feral bear default (8/43/0)
    '050012-5523032120132210551-': [
      "Genesis 5, Nature's Majesty 1, Nature's Reach 2",
      'Ferocity 5, Heart of the Wild 5, Feral Swiftness 2, Feral Instinct 3, Thick Hide 3, Savage Fury 2, Feral Charge 1, Sharpened Claws 2, Mangle 1, Predatory Strikes 3, Primal Fury 2, Predatory Instincts 2, Leader of the Pack 1, Natural Reaction 5, Rend and Tear 5, Berserk 1',
      '',
    ],
    // Balance (41/5/0), druid.md
    '5532220115501351-05-': [
      "Improved Wrath 5, Genesis 5, Moonglow 3, Improved Moonfire 2, Nature's Majesty 2, Nature's Reach 2, Nature's Splendor 1, Insect Swarm 1, Vengeance 5, Improved Starfire 5, Nature's Grace 1, Eclipse 3, Moonfury 5, Moonkin Form 1",
      'Heart of the Wild 5',
      '',
    ],
    // Restoration (11/5/35), the old site's popular build
    '05302001-05-5050035103113251': [
      "Genesis 5, Moonglow 3, Nature's Majesty 2, Nature's Splendor 1",
      'Heart of the Wild 5',
      "Nature's Focus 5, Naturalist 5, Reflection 3, Gift of Nature 5, Gift of the Earthmother 1, Improved Rejuvenation 3, Swiftmend 1, Nature's Swiftness 1, Living Spirit 3, Improved Tranquility 2, Improved Regrowth 5, Wild Growth 1",
    ],
  },
  paladin: {
    // Retribution default (10/8/33)
    '250003-503-052052310012330321': [
      'Improved Holy Strike 2, Divine Strength 5, Improved Seals 3',
      'Toughness 5, Precision 3',
      'Benediction 5, Improved Judgement 2, Conviction 5, Vindication 2, Sanctified Judgement 3, Seal of Command 1, Sacred Arbiter 1, Crusade 2, Two-Handed Weapon Specialization 3, Vengeance 3, Champion of the Light 3, Instrument of Law 2, Twist of Light 1',
    ],
    // Protection default (2/42/7)
    '2-4530513321301551-502': [
      'Improved Holy Strike 2',
      "Toughness 4, Redoubt 5, Precision 3, Anticipation 5, Improved Seal of Fury 1, Improved Righteous Fury 3, Shield Specialization 3, Sacred Duty 2, Swift Judgement 1, One-Handed Weapon Specialization 3, Templar's Bulwark 1, Reckoning 5, Iron Creed 5, Holy Shield 1",
      'Deflection 5, Improved Judgement 2',
    ],
    // Holy (36/10/5), paladin.md Sources
    '005320213225131051-5032-05': [
      "Divine Intellect 5, Healing Light 3, Spiritual Focus 2, Unyielding Faith 2, Voice of Truth 1, Reverence 3, Purifying Power 2, Infusion of Light 2, Illumination 5, Divine Favor 1, Divine Precision 3, Holy Shock 1, Holy Power 5, Light's Vigil 1",
      "Toughness 5, Precision 3, Guardian's Favor 2",
      'Benediction 5',
    ],
  },
}

/** Ranks by talent name, per tree, in code order: "Name rank, Name rank". */
function describeBuild(data: TalentData, code: string): string[] {
  const ranks = decodeTalentCode(data, code)
  return talentsInCodeOrder(data).map((talents) =>
    talents
      .filter((t) => ranks[t.id])
      .map((t) => `${t.name} ${ranks[t.id]}`)
      .join(', '),
  )
}

describe.each(Object.entries(talentData))('talents/%s', (cls, data) => {
  const all = data.trees.flatMap((t) => t.talents)
  const byId = new Map(all.map((t) => [t.id, t]))

  it('places every talent in a unique tree cell on the 4-column grid', () => {
    for (const tree of data.trees) {
      const cells = tree.talents.map((t) => `${t.tier},${t.col}`)
      expect(new Set(cells).size, tree.name).toBe(cells.length)
      for (const t of tree.talents) {
        expect(t.col, t.name).toBeGreaterThanOrEqual(0)
        expect(t.col, t.name).toBeLessThanOrEqual(data.rules.maxCol)
        expect(t.tier, t.name).toBeLessThanOrEqual(data.rules.maxTier)
      }
    }
  })

  it('names every talent once per class (the engine keys on names)', () => {
    expect(new Set(all.map((t) => t.name)).size).toBe(all.length)
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length)
  })

  it('gives every rank a Forever text and points arrows at max ranks in the same tree', () => {
    for (const t of all) {
      expect(t.ranks.forever, t.name).toHaveLength(t.maxRank)
      for (const text of t.ranks.forever) expect(text, t.name).toMatch(/\w/)
      if (t.ranks.classic) expect(t.ranks.classic.length, t.name).toBe(t.classic?.maxRank)
      if (!t.prerequisite) continue
      const pre = byId.get(t.prerequisite.talentId)
      expect(pre?.tree, t.name).toBe(t.tree)
      expect(t.prerequisite.rank, t.name).toBe(pre?.maxRank)
      expect(pre!.tier, t.name).toBeLessThanOrEqual(t.tier)
    }
  })

  it('keeps `order` equal to the build-code position', () => {
    for (const talents of talentsInCodeOrder(data)) talents.forEach((t, i) => expect(t.order, t.name).toBe(i))
  })

  it.each(Object.entries(STORED_BUILDS[cls as keyof typeof talentData]))(
    'build %s is legal, round-trips and decodes to the ranks it was written with',
    (code, expected) => {
      const ranks = decodeTalentCode(data, code)
      expect(validateTalentBuild(data, ranks)).toEqual([])
      expect(pointsPerTree(data, ranks).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(data.rules.maxPoints)
      expect(encodeTalentCode(data, ranks)).toBe(code)
      expect(describeBuild(data, code)).toEqual(expected)
    },
  )
})

describe('talent presets and defaults', () => {
  it('are all stored builds, so their meaning is pinned above', () => {
    for (const spec of SPEC_IDS) {
      const { classId } = SPEC_META[spec]
      expect(Object.keys(STORED_BUILDS[classId]), spec).toContain(defaultConfig(spec).talents)
    }
    for (const classId of ['warrior', 'druid', 'paladin'] as const) {
      const presets = talentPresets(classId)
      expect(presets.length, classId).toBeGreaterThan(0)
      expect(new Set(presets.map((p) => p.name)).size, classId).toBe(presets.length)
      expect(new Set(presets.map((p) => p.code)).size, classId).toBe(presets.length)
      for (const p of presets) expect(Object.keys(STORED_BUILDS[classId]), p.name).toContain(p.code)
    }
  })
})

// Talent names are an engine contract: src/sim keys talent effects and rules on names
// ('Unbridled Wrath', 'Improved Execute'), so every name it uses must exist in the class's data.
// Names are read from TALENT_EFFECTS and from the source of src/sim: `talents.has('…')`,
// `talents.get('…')` and `rank(talents, '…')`. Files under src/sim/classes/<class>/ belong to
// that class; any other file's names must exist in some class.
const SIM_SOURCES = import.meta.glob<string>(['../sim/**/*.ts', '!../sim/**/*.test.ts'], { query: '?raw', import: 'default', eager: true })
const NAME_USES = [/\btalents\.(?:has|get)\(\s*(['"])(.+?)\1/g, /\brank\(\s*talents\s*,\s*(['"])(.+?)\1/g]

describe('talent names the engine keys on', () => {
  const uses: { file: string; cls: keyof typeof talentData | null; name: string }[] = []
  for (const [file, source] of Object.entries(SIM_SOURCES)) {
    const cls = (/\/classes\/(warrior|druid|paladin)\//.exec(file)?.[1] ?? null) as keyof typeof talentData | null
    for (const re of NAME_USES) for (const m of source.matchAll(re)) uses.push({ file, cls, name: m[2] })
  }
  for (const name of Object.keys(TALENT_EFFECTS)) uses.push({ file: '../sim/classes/warrior/talents.ts (TALENT_EFFECTS)', cls: 'warrior', name })

  it('finds the names (guards the scan itself)', () => {
    const names = new Set(uses.map((u) => u.name))
    for (const name of ['Unbridled Wrath', 'Improved Execute', 'Flurry', 'Bloodthirst', 'Anger Management']) expect(names).toContain(name)
  })

  it('exist in the talent data', () => {
    const namesOf = (cls: keyof typeof talentData) => new Set(talentData[cls].trees.flatMap((t) => t.talents.map((x) => x.name)))
    const missing = uses.filter((u) =>
      u.cls ? !namesOf(u.cls).has(u.name) : !(['warrior', 'druid', 'paladin'] as const).some((c) => namesOf(c).has(u.name)),
    )
    expect(missing).toEqual([])
  })
})

describe('races', () => {
  it('offers every simulated class to at least one race per faction', () => {
    for (const cls of ['warrior', 'druid', 'paladin']) {
      const factions = new Set(
        races.races.filter((r) => r.classes.forever.includes(cls as never)).map((r) => r.faction),
      )
      expect([...factions].sort(), cls).toEqual(['Alliance', 'Horde'])
    }
  })
})

describe('items/pre-bis', () => {
  const { meta } = items
  const byId = new Map(items.items.map((i) => [i.id, i]))

  it('matches its recorded counts', () => {
    expect(items.items).toHaveLength(meta.counts.items)
    expect(new Set(items.items.map((i) => i.id)).size).toBe(items.items.length)
    for (const tab of ['new', 'changed', 'unchanged', 'missing'] as const)
      expect(items.items.filter((i) => i.tab === tab), tab).toHaveLength(meta.counts.byTab[tab])
    expect(Object.keys(items.sets)).toHaveLength(meta.counts.sets)
    expect(items.items.filter((i) => i.statsFrom === 'forever')).toHaveLength(meta.counts.statsFrom.forever)
  })

  it('is Rare equippable gear, apart from listed pre-raid BiS items (decisions D11)', () => {
    for (const item of items.items) {
      if (item.preRaidBis.length === 0) expect(item.quality, item.name).toBe(3)
      expect(item.slot, item.name).toBeTruthy()
      expect(item.equipSlots.length, item.name).toBeGreaterThan(0)
      expect(item.icon, item.name).toMatch(/^[a-z0-9_-]+$/)
    }
  })

  it('contains every item on the curated pre-raid BiS list (decisions D11)', () => {
    const bis = meta.preRaidBis
    expect(bis.notInData).toEqual([])
    expect(bis.inPool).toBe(bis.listedItems)
    const tagged = items.items.filter((i) => i.preRaidBis.length > 0)
    expect(tagged).toHaveLength(bis.listedItems)
  })

  it('matches its recorded filter (decisions D10)', () => {
    const { qualities, reqLevel, minItemLevel, excludedItemIds, excludedNamePattern } = meta.filter
    const junk = new RegExp(excludedNamePattern, 'i')
    for (const item of items.items) {
      expect(excludedItemIds[String(item.id)], item.name).toBeUndefined()
      expect(junk.test(item.name), item.name).toBe(false)
      if (item.preRaidBis.length > 0) continue // listed items join at any quality or level
      const levelOk =
        (item.reqLevel >= reqLevel[0] && item.reqLevel <= reqLevel[1]) ||
        (minItemLevel !== null && item.itemLevel >= minItemLevel)
      expect(qualities, item.name).toContain(item.quality)
      expect(levelOk, `${item.name} ilvl ${item.itemLevel} req ${item.reqLevel}`).toBe(true)
    }
  })

  it('never contains Season of Discovery items (decisions D6)', () => {
    // Only Forever-new items (a Forever row, no Classic Era row) may have ids past original Classic.
    const suspicious = items.items.filter((i) => i.tab !== 'new' && i.id >= meta.filter.maxClassicItemId)
    expect(suspicious.map((i) => `${i.id} ${i.name}`)).toEqual([])
    expect(meta.filter.maxClassicItemId).toBe(25000)
  })

  it('flags items without a Forever row as using Classic Era stats (decisions D6, D17)', () => {
    for (const item of items.items) {
      expect(item.statsFrom, item.name).toBe(item.foreverData ? 'forever' : 'classic')
      expect(item.foreverSource, item.name).toBe(item.foreverData ? 'client' : null)
      expect(item.tab === 'missing', item.name).toBe(!item.foreverData)
      expect(item.classic !== null, item.name).toBe(item.tab === 'changed')
      if (item.classicShieldBlockValue !== undefined) {
        expect(item.slot, item.name).toBe('shield')
        expect(item.statsFrom, item.name).toBe('classic')
      }
    }
  })

  it('leaves out the items no client build has a row for, and lists them', () => {
    expect(meta.noClientRow.length).toBeGreaterThan(0)
    for (const { id, name } of meta.noClientRow) expect(byId.has(id), name).toBe(false)
  })

  it('has no drop sources (the client Encounter Journal is empty)', () => {
    for (const item of items.items) expect(item.source, item.name).toBeNull()
  })

  it('resolves every set and its bonuses', () => {
    for (const item of items.items) {
      if (item.setId) expect(items.sets[item.setId], `${item.name} → ${item.setId}`).toBeDefined()
    }
    for (const [id, set] of Object.entries(items.sets)) {
      expect(set.name, id).toBeTruthy()
      expect(set.bonusesFrom, set.name).not.toBeNull()
      expect(set.size, set.name).toBe(set.itemIds.length)
      expect(set.bonuses.length, set.name).toBeGreaterThan(0)
      for (const b of set.bonuses) {
        expect(b.text, `${set.name} (${b.pieces})`).toBeTruthy()
        expect(b.text, `${set.name} (${b.pieces})`).not.toMatch(/\$/)
      }
    }
  })

  it('renders every effect line without leftover variables', () => {
    for (const item of items.items) {
      for (const e of [...item.procs, ...item.useEffects, ...item.otherEquip]) {
        expect(e.raw, item.name).toMatch(/^(Use|Equip|Chance on hit): \S/)
        expect(e.raw, item.name).not.toMatch(/\$/)
      }
    }
    const { fallback, fallbackSpells } = meta.descriptionCoverage
    expect(fallbackSpells.reduce((n, s) => n + s.usedBy.length, 0)).toBe(fallback)
  })
})
