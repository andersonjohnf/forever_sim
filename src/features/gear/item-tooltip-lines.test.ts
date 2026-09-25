import { describe, expect, it } from 'vitest'
import type { Item, Stats } from '@/data/items/types'
import { itemData, itemsById } from '@/lib/items'
import { itemTooltipLines, TOOLTIP_PALETTE, tooltipText, type TooltipLine } from './item-tooltip-lines'

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
        'Equip: +62 Attack Power.',
      ].join('\n'),
    )
    expect(line(itemTooltipLines(byName('Arcanite Reaper'), { enchantId: 'crusader' }), 'Crusader')?.tone).toBe('green')
  })

  it('an enchant under Classic Era rules shows Classic Era’s number', () => {
    const cloak = itemData.items.find((i) => i.slot === 'back')!
    const lines = itemTooltipLines(cloak, { enchantId: 'cloakGreaterDefense', profile: 'classicEra' })
    expect(line(lines, '+50 armor')?.tone).toBe('green')
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
        'Equip: +20 Hit Rating.',
        'Equip: +28 Critical Strike Rating.',
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
        'Equip: +14 Critical Strike Rating.',
        'Equip: +46 Attack Power.',
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
    const both = itemTooltipLines(leggings, { worn: [leggings.id, gauntlets.id, 12640] })
    expect(line(both, 'Devilsaur Armor (2/2)')).toBeDefined()
    expect(line(both, '(2) Set: Improves your chance to hit by 2.0%.')?.tone).toBe('green')
    // Seen in the picker, not worn: nothing counts.
    expect(line(itemTooltipLines(leggings), 'Devilsaur Armor (0/2)')).toBeDefined()
  })

  it('a set with more bonuses: each lights at its own count', () => {
    const helm = byName('Helm of Valor')
    const set = itemData.sets[helm.setId!]
    const lines = itemTooltipLines(helm, { worn: set.itemIds.slice(0, 3) })
    const bonuses = lines.filter((l) => l.text.includes(') Set: '))
    expect(bonuses.map((l) => [l.text.slice(0, 3), l.tone])).toEqual([
      ['(2)', 'green'],
      ['(3)', 'green'],
      ['(4)', 'grey'],
      ['(5)', 'grey'],
      ['(6)', 'grey'],
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
    expect(tooltipText(lines)).toContain('Requires The Watchers - Friendly\nItem Level 63\nEquip: +10 Hit Rating.')
  })

  it('Classic Era equip stats keep their words; Forever’s healing and spell damage are stat lines', () => {
    expect(text(byName("Mugger's Belt"))).toContain(
      'Equip: Improves your chance to get a critical strike by 1%.\nEquip: Increased Daggers +5.',
    )
    expect(text(byName('Whitesoul Helm'))).toContain('629 Armor\n+15 Intellect\n+15 Spirit')
    expect(text(byName('Whitesoul Helm'))).toContain('Equip: +35 Healing.\nEquip: +12 Spell Damage.')
    expect(text(byName('Heavy Obsidian Belt'))).toContain('+25 Strength\n+5 Spell Resistance\n')
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

  it('shows every stat the item has, with its number', () => {
    const skip = new Set<keyof Stats>(['armor', 'bonusArmor'])
    for (const { item, lines } of all) {
      const shown = tooltipText(lines)
      for (const [key, value] of Object.entries(item.stats) as [keyof Stats, number][]) {
        if (!value || skip.has(key)) continue
        expect(shown, `${item.name} ${key}`).toContain(String(Math.abs(value)))
      }
      const armor = (item.stats.armor ?? 0) + (item.stats.bonusArmor ?? 0)
      if (armor) expect(shown, item.name).toContain(`${armor} Armor`)
    }
  })

  it('gives every weapon its damage, speed and damage per second, and two-column rows only to slot and damage', () => {
    for (const { item, lines } of all) {
      if (item.weapon) expect(lines.some((l) => l.right?.startsWith('Speed ')), item.name).toBe(true)
      for (const l of lines.filter((l) => l.right)) expect(l.right, item.name).toMatch(/^(Speed \d\.\d\d|[A-Z][a-z]+( [A-Z][a-z]+)?)$/)
    }
  })

  it('lists a set’s pieces that the pool names, and every bonus', () => {
    for (const { item, lines } of all.filter(({ item }) => item.setId)) {
      const set = itemData.sets[item.setId!]
      expect(lines.filter((l) => l.indent).length, item.name).toBe(set.itemIds.filter((id) => itemsById.has(id)).length)
      expect(lines.filter((l) => l.text.includes(') Set: ')).length, item.name).toBe(set.bonuses.length)
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
