import { describe, expect, it } from 'vitest'
import type { Item, Stats } from '@/data/items/types'
import { itemData, itemsById } from '@/lib/items'
import { setOf } from '@/sim/plan/build'
import { CLASSIC_ERA_EFFECT_NOTE, equipStatText, itemTooltipLines, TOOLTIP_PALETTE, tooltipText, type TooltipLine } from './item-tooltip-lines'

const byName = (name: string): Item => {
  const item = itemData.items.find((i) => i.name === name)
  if (!item) throw new Error(`No ${name} in the pool`)
  return item
}
const text = (item: Item, options?: Parameters<typeof itemTooltipLines>[1]) => tooltipText(itemTooltipLines(item, options))
const line = (lines: TooltipLine[], text: string) => lines.find((l) => l.text === text)

describe('item tooltip lines, against the client data (docs/ux.md "Item tooltips")', () => {
  it('a Forever two-hander with a proc: Arcanite Champion', () => {
    const lines = itemTooltipLines(byName('Arcanite Champion'))
    expect(lines).toEqual([
      { text: 'Arcanite Champion', tone: 'white', quality: 3 },
      { text: 'Binds when equipped', tone: 'white' },
      { text: 'Two-Hand', right: 'Sword', tone: 'white' },
      { text: '146 - 220 Damage', right: 'Speed 3.40', tone: 'white' },
      { text: '(53.8 damage per second)', tone: 'white' },
      { text: 'Requires Level 58', tone: 'white' },
      { text: 'Item Level 63', tone: 'gold' },
      { text: 'Chance on hit: Heal yourself for 270 to 450 and increase your Strength by 120 for 30 sec.', tone: 'green' },
    ])
  })

  it('an enchanted two-hander: Arcanite Reaper with Crusader, the enchant in green after the white stats', () => {
    expect(text(byName('Arcanite Reaper'), { enchantId: 'crusader' })).toBe(
      [
        'Arcanite Reaper',
        'Binds when equipped',
        'Two-Hand\tAxe',
        '153 - 256 Damage\tSpeed 3.80',
        '(53.8 damage per second)',
        '+13 Stamina',
        'Crusader',
        'Requires Level 58',
        'Item Level 63',
        'Equip: Increases attack power by 62.',
      ].join('\n'),
    )
    expect(line(itemTooltipLines(byName('Arcanite Reaper'), { enchantId: 'crusader' }), 'Crusader')?.tone).toBe('green')
  })

  it('an enchant under Classic Era rules shows the Classic Era client’s name and number', () => {
    const cloak = itemData.items.find((i) => i.slot === 'back')!
    const lines = itemTooltipLines(cloak, { enchantId: 'cloakGreaterDefense', profile: 'classicEra' })
    expect(line(lines, 'Armor +50')?.tone).toBe('green')
    expect(tooltipText(itemTooltipLines(cloak, { enchantId: 'cloakGreaterDefense' }))).toContain('\nArmor +60\n')
  })

  it('plate with stats and ratings: Lionheart Helm', () => {
    expect(text(byName('Lionheart Helm'))).toBe(
      [
        'Lionheart Helm',
        'Binds when equipped',
        'Head\tPlate',
        '565 Armor',
        '+18 Strength',
        'Requires Level 56',
        'Item Level 61',
        'Equip: Increases your hit by 20.',
        'Equip: Increases your critical strike by 28.',
      ].join('\n'),
    )
    expect(itemTooltipLines(byName('Lionheart Helm'))[0]).toEqual({ text: 'Lionheart Helm', tone: 'white', quality: 4 })
  })

  it('a set piece: its set, pieces and bonus, lit by the pieces worn', () => {
    const leggings = byName('Devilsaur Leggings')
    const gauntlets = byName('Devilsaur Gauntlets')
    const alone = itemTooltipLines(leggings, { worn: [leggings.id] })
    expect(tooltipText(alone)).toBe(
      [
        'Devilsaur Leggings',
        'Binds when equipped',
        'Legs\tLeather',
        '148 Armor',
        '+12 Stamina',
        'Requires Level 55',
        'Item Level 60',
        'Equip: Increases your critical strike by 14.',
        'Equip: Increases attack power by 46.',
        'Devilsaur Armor (1/2)',
        'Devilsaur Leggings',
        'Devilsaur Gauntlets',
        '(2) Set: Improves your chance to hit by 2.0%.',
      ].join('\n'),
    )
    expect(alone.slice(-4)).toEqual([
      { text: 'Devilsaur Armor (1/2)', tone: 'gold', gapBefore: true },
      { text: 'Devilsaur Leggings', tone: 'worn', indent: true },
      { text: 'Devilsaur Gauntlets', tone: 'grey', indent: true },
      { text: '(2) Set: Improves your chance to hit by 2.0%.', tone: 'grey', gapBefore: true },
    ])
    // A bonus reached reads "Set: …", as the client's ITEM_SET_BONUS; "(2) Set: …" is ITEM_SET_BONUS_GRAY's.
    const both = itemTooltipLines(leggings, { worn: [leggings.id, gauntlets.id, 12640] })
    expect(line(both, 'Devilsaur Armor (2/2)')).toBeDefined()
    expect(line(both, 'Set: Improves your chance to hit by 2.0%.')?.tone).toBe('green')
    expect(line(both, '(2) Set: Improves your chance to hit by 2.0%.')).toBeUndefined()
    // Seen in the picker, not worn: nothing counts.
    expect(line(itemTooltipLines(leggings), 'Devilsaur Armor (0/2)')).toBeDefined()
  })

  it('a set with more bonuses: each lights at its own count', () => {
    const helm = byName('Helm of Valor')
    const set = itemData.sets[helm.setId!]
    const lines = itemTooltipLines(helm, { worn: set.itemIds.slice(0, 3) })
    const bonuses = lines.filter((l) => /^(\(\d\) )?Set: /.test(l.text))
    expect(bonuses.map((l) => [l.text, l.tone])).toEqual([
      ['Set: +8 All Resistances.', 'green'],
      ['Set: +15 Strength.', 'green'],
      [`(4) Set: ${set.bonuses[2].text}`, 'grey'],
      [`(5) Set: ${set.bonuses[3].text}`, 'grey'],
      ['(6) Set: Restores 15 health per 5 sec.', 'grey'],
    ])
    expect(line(lines, 'Battlegear of Valor (3/8)')).toBeDefined()
  })

  it('a trinket with a Use: Earthstrike', () => {
    expect(text(byName('Earthstrike'))).toBe(
      [
        'Earthstrike',
        'Binds when picked up',
        'Unique',
        'Trinket',
        'Item Level 66',
        'Use: Increases your melee and ranged attack power by 280. Effect lasts for 20 sec. (2 Min Cooldown)',
      ].join('\n'),
    )
  })

  it('a Classic Era shield: its block, and its equip spells in their Classic Era words', () => {
    expect(text(byName('Barrier Shield'))).toBe(
      [
        'Barrier Shield',
        'Binds when picked up',
        'Off Hand\tShield',
        '2121 Armor',
        '39 Block',
        'Requires Level 57',
        'Item Level 62',
        'Equip: Increases your chance to block attacks with a shield by 2%.',
        'Equip: Increases the block value of your shield by 18.',
      ].join('\n'),
    )
  })

  it('a ring: Unique-Equipped with its group, a reputation requirement and ratings', () => {
    const lines = itemTooltipLines(byName("Ferocious Watcher's Signet"))
    expect(tooltipText(lines)).toContain("Unique-Equipped: Watcher's Signet (1)")
    expect(tooltipText(lines)).toContain('\nFinger\n')
    expect(tooltipText(lines)).toContain('Requires The Watchers - Friendly\nItem Level 63\nEquip: Increases your hit by 10.')
  })

  it('equip spells in their client’s words; Forever’s stat columns in its ITEM_MOD strings', () => {
    // The Forever client's 7597, not a template: its crit is melee only.
    expect(text(byName("Mugger's Belt"))).toContain(
      'Equip: Improves your chance to get a critical strike with melee attacks by 1.0%.\nEquip: Increased Daggers +5.',
    )
    expect(text(byName('Whitesoul Helm'))).toContain('629 Armor\n+15 Intellect\n+15 Spirit')
    expect(text(byName('Whitesoul Helm'))).toContain(
      'Equip: Increases healing done by magical spells and effects by up to 35.\nEquip: Increases damage done by magical spells and effects by up to 12.',
    )
    // Stat 124, all five resistances as one stat: ITEM_MOD_SPELL_RESISTANCE_ALL_SCHOOLS.
    expect(text(byName('Heavy Obsidian Belt'))).toContain('+25 Strength\nRequires Level 60\nItem Level 68\nEquip: Increases spell resistance by 5.')
  })

  it('a stat spell’s client line keeps its scope, decimals and condition (review finding TL-1)', () => {
    expect(text(byName('Mask of the Unforgiven'))).toContain(
      'Equip: Improves your chance to hit by 2.0%.\nEquip: Improves your chance to get a critical strike with melee attacks by 1.0%.',
    )
    expect(text(byName("Halycon's Spiked Collar"))).toContain('Equip: +48 Attack Power against Beasts.')
    // One line for one spell, as the client has it, not two stat lines.
    const lodestone = text(byName('Counterattack Lodestone'))
    expect(lodestone).toContain('Equip: +30 Attack Power, doubled against Mechanical units.')
    expect(lodestone).not.toMatch(/Mechanical\.$/m)
    // The area condition is the client's words; the scraper's "in certain areas" line isn't shown.
    const reed = text(byName('Briarwood Reed'))
    expect(reed).toContain('Equip: Increases damage and healing done by magical spells and effects by up to 15. This effect is doubled in Marsh and Swamp areas.')
    expect(reed).not.toContain('certain areas')
    expect(text(byName('Rune of the Guard Captain'))).toContain(
      'Equip: Increases your hit by 7.\nEquip: +14 Attack Power. This effect is tripled in Forest and Grassland areas.',
    )
  })

  it('an equip spell’s armor is its own Equip line, not the white armor (Royal Seal of Eldre’Thalas)', () => {
    const seal = itemsById.get(18466)!
    expect(text(seal)).toContain('Equip: +200 Armor.')
    expect(text(seal)).not.toMatch(/^\d+ Armor$/m)
  })

  it('a set id a Classic Era row carries for another set shows no set (Champion’s Chain Headguard, review finding TL-3)', () => {
    const headguard = itemsById.get(16526)!
    expect(headguard.setId).toBe('361')
    expect(setOf(headguard)).toBeNull()
    const lines = itemTooltipLines(headguard, { worn: [16526] })
    expect(tooltipText(lines)).not.toContain(itemData.sets['361'].name)
    expect(lines.some((l) => l.indent || /Set: /.test(l.text))).toBe(false)
    // The set that id names now still shows on its own pieces.
    expect(tooltipText(itemTooltipLines(itemsById.get(272490)!))).toContain(`${itemData.sets['361'].name} (0/`)
  })

  it('names a PvP rank by its title for the faction that wears the item', () => {
    expect(text(itemsById.get(16416)!)).toContain('Requires Level 58\nRequires Lieutenant Commander\nItem Level 63')
    expect(text(itemsById.get(16489)!)).toContain('Requires Champion\n')
    expect(text(byName("Senior Sergeant's Insignia"))).toContain('Requires Senior Sergeant\n')
  })

  it('keeps the Forever client’s lines under Classic Era rules, with a note where that profile simulates the effect differently (review finding TL-4)', () => {
    for (const name of ['Hand of Justice', 'Ironfoe']) {
      const item = byName(name)
      const forever = itemTooltipLines(item)
      const classic = itemTooltipLines(item, { profile: 'classicEra' })
      expect(line(forever, CLASSIC_ERA_EFFECT_NOTE), name).toBeUndefined()
      expect(classic.slice(0, -1), name).toEqual(forever)
      expect(classic.at(-1), name).toEqual({ text: CLASSIC_ERA_EFFECT_NOTE, tone: 'grey' })
    }
    expect(text(byName('Hand of Justice'), { profile: 'classicEra' })).toContain('Equip: 1% chance on Melee hit to gain 1 extra attack.')
    // An item whose effects are the same in both profiles has no note.
    expect(line(itemTooltipLines(byName('Arcanite Champion'), { profile: 'classicEra' }), CLASSIC_ERA_EFFECT_NOTE)).toBeUndefined()
  })

  it('weapons’ extra damage and ammo’s damage per second', () => {
    expect(text(byName('Warblade of Caer Darrow'))).toContain('142 - 214 Damage\tSpeed 3.30\n+1 - 22 Frost Damage\n(57.4 damage per second)')
    expect(text(byName('Mithril Gyro-Shot'))).toBe(
      ['Mithril Gyro-Shot', 'Projectile\tBullet', 'Adds 15.2 damage per second', 'Requires Level 44', 'Item Level 49'].join('\n'),
    )
    expect(text(byName("Ribbly's Quiver"))).toContain('Unique\nQuiver\nRequires Level 50')
  })

  it('class restrictions', () => {
    expect(text(byName('Wolfshead Helm'))).toContain('Classes: Druid\nRequires Level 40')
  })
})

describe('item tooltip lines over the whole pool', () => {
  const all = itemData.items.map((item) => ({ item, lines: itemTooltipLines(item) }))

  it('starts every tooltip with the name in its quality and the slot, and ends the facts with the item level', () => {
    for (const { item, lines } of all) {
      expect(lines[0]).toEqual({ text: item.name, tone: 'white', quality: item.quality })
      expect(lines.some((l) => l.text === `Item Level ${item.itemLevel}`)).toBe(true)
    }
  })

  it('leaves no token, placeholder or missing value in any line', () => {
    for (const { item, lines } of all) {
      for (const l of lines) {
        expect(`${l.text} ${l.right ?? ''}`, item.name).not.toMatch(/\$|undefined|NaN|null|\[object/)
        expect(l.text.trim(), item.name).not.toBe('')
      }
    }
  })

  it('shows every stat the item has on its own line: a stat spell’s client line, or the stat’s line', () => {
    const white: Partial<Record<keyof Stats, string>> = {
      strength: 'Strength',
      agility: 'Agility',
      stamina: 'Stamina',
      intellect: 'Intellect',
      spirit: 'Spirit',
      fireResistance: 'Fire Resistance',
      natureResistance: 'Nature Resistance',
      frostResistance: 'Frost Resistance',
      shadowResistance: 'Shadow Resistance',
      arcaneResistance: 'Arcane Resistance',
    }
    const resistances = ['fireResistance', 'natureResistance', 'frostResistance', 'shadowResistance', 'arcaneResistance'] as const
    for (const { item, lines } of all) {
      const texts = new Set(lines.map((l) => l.text))
      const left: Partial<Record<keyof Stats, number>> = { ...item.stats }
      for (const spell of item.statEquip) {
        for (const [key, value] of Object.entries(spell.stats) as [keyof Stats, number][]) left[key] = (left[key] ?? 0) - value
      }
      const allFive = item.statsFrom === 'forever' && left.fireResistance && resistances.every((k) => left[k] === left.fireResistance)
      if (allFive) expect(texts, item.name).toContain(`Equip: Increases spell resistance by ${left.fireResistance}.`)
      const armor = (left.armor ?? 0) + (left.bonusArmor ?? 0)
      if (armor) expect(texts, item.name).toContain(`${armor} Armor`)
      for (const [key, value] of Object.entries(left) as [keyof Stats, number][]) {
        if (!value || key === 'armor' || key === 'bonusArmor' || (allFive && key.endsWith('Resistance'))) continue
        const expected = white[key] ? `${value < 0 ? '−' : '+'}${Math.abs(value)} ${white[key]}` : `Equip: ${equipStatText(key, value)}`
        expect(texts, `${item.name} ${key}`).toContain(expected)
      }
    }
  })

  it('shows every stat spell’s client line (review finding TL-1): all of them, pool-wide', () => {
    let count = 0
    for (const { item, lines } of all) {
      const texts = new Set(lines.map((l) => l.text))
      expect(item.statEquip.map((e) => e.spellId), item.name).toEqual(expect.arrayContaining(item.statSpellIds))
      for (const spell of item.statEquip) {
        expect(texts, `${item.name}: spell ${spell.spellId}`).toContain(spell.raw)
        count++
      }
    }
    expect(count).toBeGreaterThan(500)
  })

  it('words no stat that only equip spells give: each has its spell’s client line', () => {
    const spellOnly: (keyof Stats)[] = ['defense', 'dodge', 'parry', 'block', 'hit', 'spellHit', 'crit', 'meleeCrit', 'spellCrit', 'hp5', 'rangedAttackSpeed']
    for (const { item } of all) {
      for (const key of spellOnly) {
        const fromSpells = item.statEquip.reduce((sum, spell) => sum + (spell.stats[key] ?? 0), 0)
        expect(fromSpells, `${item.name} ${key}`).toBe(item.stats[key] ?? 0)
      }
      // A Classic Era row has no stat columns past the primary stats: every Equip line is the client's.
      if (item.statsFrom === 'classic') {
        const own = new Set([...item.statEquip, ...item.otherEquip, ...item.procs, ...item.useEffects].map((e) => e.raw))
        for (const l of itemTooltipLines(item)) if (l.text.startsWith('Equip: ')) expect(own, `${item.name}: ${l.text}`).toContain(l.text)
      }
    }
  })

  it('leaves out the scraper’s generated lines, which the game doesn’t show', () => {
    const generated = itemData.items.flatMap((item) => [...item.otherEquip, ...item.procs, ...item.useEffects].filter((e) => e.generated).map((e) => ({ item, e })))
    expect(generated.length).toBeGreaterThan(0)
    for (const { item, e } of generated) expect(tooltipText(itemTooltipLines(item)), item.name).not.toContain(e.raw)
  })

  it('names every PvP rank requirement by its title', () => {
    for (const { item, lines } of all) {
      if (item.requirements.some((r) => r.kind === 'pvpRank')) expect(tooltipText(lines), item.name).not.toContain('PvP rank')
    }
  })

  it('gives every weapon its damage, speed and damage per second, and two-column rows only to slot and damage', () => {
    for (const { item, lines } of all) {
      if (item.weapon) expect(lines.some((l) => l.right?.startsWith('Speed ')), item.name).toBe(true)
      for (const l of lines.filter((l) => l.right)) expect(l.right, item.name).toMatch(/^(Speed \d\.\d\d|[A-Z][a-z]+( [A-Z][a-z]+)?)$/)
    }
  })

  it('lists the pieces the pool names and every bonus of the set the item counts toward (setOf), and no set otherwise', () => {
    for (const { item, lines } of all) {
      const setId = setOf(item)
      const set = setId ? itemData.sets[setId] : undefined
      expect(lines.filter((l) => l.indent).length, item.name).toBe(set ? set.itemIds.filter((id) => itemsById.has(id)).length : 0)
      expect(lines.filter((l) => /^\(\d\) Set: /.test(l.text)).length, item.name).toBe(set?.bonuses.length ?? 0)
    }
  })
})

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('the tooltip panel’s colours', () => {
  it('keep every text colour at 4.5:1 or more on the panel, in both themes (the panel is dark in both)', () => {
    const colours = { ...TOOLTIP_PALETTE.tone, ...Object.fromEntries(Object.entries(TOOLTIP_PALETTE.quality).map(([q, c]) => [`quality ${q}`, c])) }
    for (const [name, colour] of Object.entries(colours)) {
      expect(contrast(colour, TOOLTIP_PALETTE.panel), name).toBeGreaterThanOrEqual(4.5)
    }
  })
})
