// The character sheet's rows and the wide panel's groups (docs/ux.md#results "Character sheet").
import { describe, expect, it } from 'vitest'
import { computeSheet, defaultConfig, SPEC_IDS } from '@/sim'
import { isKnownRow, KEY_STAT_COUNT, keyStats, sheetGroups, sheetRows, weaponSkillValue } from './sheet-groups'
import { CRIT_REDUCTION_LABEL } from './tank-logic'

const sheetOf = (spec: (typeof SPEC_IDS)[number]) => computeSheet(defaultConfig(spec))!

const shape = (spec: (typeof SPEC_IDS)[number]) => sheetGroups(sheetRows(sheetOf(spec))).map((g) => [g.title, g.rows.map(([label]) => label)])

describe('weaponSkillValue', () => {
  it('is one number with one weapon, a two-hander or both hands equal', () => {
    expect(weaponSkillValue({ mainHand: 300, offHand: null })).toEqual({ text: '300', spoken: null, title: null })
    expect(weaponSkillValue({ mainHand: 305, offHand: 0 })).toEqual({ text: '305', spoken: null, title: null })
    expect(weaponSkillValue({ mainHand: 300, offHand: 300 })).toEqual({ text: '300', spoken: null, title: null })
  })

  it('shows both hands compactly when they differ, main hand first, and names them for a screen reader and the tooltip', () => {
    expect(weaponSkillValue({ mainHand: 305, offHand: 300 })).toEqual({
      text: '305 · 300',
      spoken: '305 main hand, 300 off hand',
      title: 'Main hand 305, off hand 300',
    })
  })
})

describe('sheetGroups', () => {
  it('knows every row of every spec’s default sheet, so none falls into the wrong group', () => {
    for (const spec of SPEC_IDS) {
      for (const [label] of sheetRows(sheetOf(spec))) expect(isKnownRow(label), `${spec}: ${label}`).toBe(true)
    }
  })

  it('keeps every row, once, in the sheet’s order within each group', () => {
    for (const spec of SPEC_IDS) {
      const rows = sheetRows(sheetOf(spec))
      const grouped = sheetGroups(rows).flatMap((g) => g.rows)
      expect(grouped.toSorted(), spec).toEqual(rows.toSorted())
      for (const g of sheetGroups(rows)) {
        const at = g.rows.map((r) => rows.indexOf(r))
        expect(at, `${spec} ${g.title}`).toEqual(at.toSorted((a, b) => a - b))
      }
    }
  })

  it('groups a melee spec’s sheet as Offense, Attributes and Defense', () => {
    expect(shape('warrior-fury')).toEqual([
      ['Offense', ['Attack power', 'Crit', 'Hit', 'Haste', 'Weapon skill', 'Expertise']],
      ['Attributes', ['Strength', 'Agility', 'Stamina']],
      ['Defense', ['Health', 'Armor']],
    ])
  })

  it('groups a caster’s as Spells, Mana, Attributes and Defense', () => {
    const groups = shape('shaman-elemental')
    expect(groups.map(([title]) => title)).toEqual(['Spells', 'Mana', 'Attributes', 'Defense'])
    expect(groups[0][1]).toEqual(expect.arrayContaining(['Spell damage', 'Spell crit', 'Spell hit', 'Casting speed']))
    expect(groups[1][1]).toEqual(['Mana', 'Mana per 5 s'])
    expect(groups[2][1]).toEqual(['Intellect', 'Spirit', 'Stamina'])
  })

  it('gives a paladin Melee beside Spells, and a tank its defensive rows under Defense', () => {
    expect(shape('paladin-protection')).toEqual([
      ['Melee', ['Attack power', 'Crit', 'Hit', 'Weapon skill', 'Expertise', 'Haste']],
      ['Spells', ['Spell damage', 'Spell crit', 'Spell hit']],
      ['Mana', ['Mana', 'Mana per 5 s']],
      ['Attributes', ['Strength', 'Agility', 'Stamina', 'Intellect', 'Spirit']],
      ['Defense', ['Health', 'Armor', 'Defense', CRIT_REDUCTION_LABEL, 'Dodge', 'Parry', 'Block', 'Block value']],
    ])
  })

  it('leaves out what a bear can’t do, and puts a hunter’s ranged rows under Offense', () => {
    const bear = shape('druid-feral-bear').find(([title]) => title === 'Defense')![1]
    expect(bear).not.toContain('Parry')
    expect(bear).not.toContain('Block')
    const hunter = shape('hunter-beast-mastery')
    expect(hunter[0]).toEqual(['Offense', expect.arrayContaining(['Ranged attack power', 'Ranged weapon skill', 'Shot speed'])])
  })
})

describe('keyStats', () => {
  type Spec = (typeof SPEC_IDS)[number]
  const keys = (spec: Spec) => {
    const sheet = sheetOf(spec)
    return keyStats(sheetRows(sheet), (sheet.bossTable ?? null) !== null)
  }
  const shorts = (spec: Spec) => keys(spec).map((k) => k.short)
  const numeric = (value: string) => Number.parseFloat(value.replace(/,/g, ''))

  it('gives every spec three key stats, each a row of its sheet with the same value', () => {
    for (const spec of SPEC_IDS) {
      const rows = sheetRows(sheetOf(spec))
      const stats = keys(spec)
      expect(stats, spec).toHaveLength(KEY_STAT_COUNT)
      for (const k of stats) expect(rows, `${spec}: ${k.label}`).toContainEqual([k.label, k.value])
    }
  })

  it('is a melee or ranged spec’s attack power, crit and hit, as players write them', () => {
    expect(shorts('warrior-fury')).toEqual(['AP', 'Crit', 'Hit'])
    expect(shorts('rogue-combat')).toEqual(['AP', 'Crit', 'Hit'])
    // A Retribution paladin's first group is its Melee.
    expect(shorts('paladin-retribution')).toEqual(['AP', 'Crit', 'Hit'])
    expect(shorts('hunter-marksmanship')).toEqual(['Ranged AP', 'Ranged crit', 'Ranged hit'])
  })

  it('is a tank’s health, armor and defense', () => {
    for (const spec of ['warrior-protection', 'paladin-protection', 'druid-feral-bear'] as const) expect(shorts(spec), spec).toEqual(['Health', 'Armor', 'Defense'])
  })

  it('is a caster’s spell damage, crit and hit, its best school’s where one is higher', () => {
    const casters = SPEC_IDS.filter((id) => sheetGroups(sheetRows(sheetOf(id)))[0].id === 'spells')
    expect(casters.length).toBeGreaterThan(5)
    for (const spec of casters) {
      const stats = keys(spec)
      const rows = sheetRows(sheetOf(spec))
      expect(stats.map((k) => k.label.split(' ')[1]), spec).toEqual(['damage', 'crit', 'hit'])
      for (const k of stats) {
        const kind = k.label.split(' ')[1]
        const best = Math.max(...rows.filter(([label]) => /^(Spell|Arcane|Fire|Frost|Holy|Nature|Shadow) /.test(label) && label.endsWith(` ${kind}`)).map(([, v]) => numeric(v)))
        expect(numeric(k.value), `${spec} ${k.label}`).toBe(best)
      }
    }
  })
})
