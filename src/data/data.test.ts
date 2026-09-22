// Integrity checks over the generated snapshot in src/data (docs/data/README.md).
// These guard against scraper regressions, not against beta balance changes: they check
// structure and internal consistency, and avoid hard-coding values a new build may change.
import { describe, expect, it } from 'vitest'
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

describe.each(Object.entries(allDatasets))('%s', (_name, data) => {
  it('has a meta envelope tied to a Forever build', () => {
    expect(data.meta.source).toMatch(/^https:\/\/foreverchanges\.pro\//)
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

// Talent builds the class docs recommend as defaults or presets. If a doc changes a build,
// change it here too: an invalid default build should fail CI, not confuse the guild.
const DOCUMENTED_BUILDS: Record<keyof typeof talentData, string[]> = {
  warrior: [
    '30305013-050520035150310051-', // Fury + Precision (docs/classes/warrior.md §6.1)
  ],
  druid: [
    '050012-5523032120132210551-', // Feral bear default (docs/classes/druid.md)
  ],
  paladin: [
    '250003-503-052052310012330321', // Retribution default (docs/classes/paladin.md)
    '2-4530513321301551-502', // Protection default (docs/classes/paladin.md)
  ],
}

describe.each(Object.entries(talentData))('talents/%s', (cls, data) => {
  it('places every talent in a unique tree cell', () => {
    for (const tree of data.trees) {
      const cells = tree.talents.map((t) => `${t.tier},${t.col}`)
      expect(new Set(cells).size, tree.name).toBe(cells.length)
    }
  })

  const builds = [
    ...data.popularBuilds.map((b) => ({ code: b.code, points: b.points as number[] })),
    ...DOCUMENTED_BUILDS[cls as keyof typeof talentData].map((code) => ({ code, points: null })),
  ]

  it.each(builds)('build $code is legal and round-trips', ({ code, points }) => {
    const ranks = decodeTalentCode(data, code)
    expect(validateTalentBuild(data, ranks)).toEqual([])
    const spent = pointsPerTree(data, ranks)
    expect(spent.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(51)
    if (points) expect(spent).toEqual(points)
    expect(encodeTalentCode(data, ranks)).toBe(code)
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
  it('is Rare, equippable gear with a slot', () => {
    for (const item of items.items) {
      expect(item.quality, item.name).toBe(3)
      expect(item.slot, item.name).toBeTruthy()
    }
  })

  it('matches its recorded filter (decisions D10)', () => {
    const { qualities, reqLevel, minItemLevel, excludedItemIds } = items.meta.filter
    for (const item of items.items) {
      const levelOk =
        (item.reqLevel >= reqLevel[0] && item.reqLevel <= reqLevel[1]) ||
        (minItemLevel !== null && item.itemLevel >= minItemLevel)
      expect(qualities, item.name).toContain(item.quality)
      expect(levelOk, `${item.name} ilvl ${item.itemLevel} req ${item.reqLevel}`).toBe(true)
      expect(excludedItemIds[String(item.id)], item.name).toBeUndefined()
    }
  })

  it('never contains Season of Discovery items (decisions D6)', () => {
    // Forever-only items live in the "new" tab; everything else must be an original Classic id.
    const suspicious = items.items.filter((i) => i.tab !== 'new' && i.id >= 25000)
    expect(suspicious.map((i) => `${i.id} ${i.name}`)).toEqual([])
  })

  it('flags items without Forever data as using Classic stats (decisions D6)', () => {
    for (const item of items.items) {
      expect(item.statsFrom, item.name).toBe(item.foreverData ? 'forever' : 'classic')
    }
  })

  it('resolves every set reference', () => {
    for (const item of items.items) {
      if (item.setId) expect(items.sets[item.setId], `${item.name} → ${item.setId}`).toBeDefined()
    }
  })
})
