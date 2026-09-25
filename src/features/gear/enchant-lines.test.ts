import { describe, expect, it } from 'vitest'
import enchantsJson from '@/data/client/enchants.json'
import spellsJson from '@/data/client/spells.json'
import type { ClientEnchant, ClientEnchants, ClientSpells } from '@/data/client/types'
import { enchantCatalogueFor } from '@/sim'
import { ENCHANT_LINES, enchantTooltipLine } from './enchant-lines'

const enchants = (enchantsJson as unknown as ClientEnchants).enchants
const spells = (spellsJson as unknown as ClientSpells).spells

/** The client's name as the game prints it: `$kN` is the row's Nth EffectPointsMin, `$<spell>M<n>` that spell's effect n. */
function render(enchant: ClientEnchant): string {
  return enchant.name
    .replace(/\$k(\d)/g, (_, n: string) => String(enchant.effectPointsMin[Number(n) - 1]))
    .replace(/\$(\d+)[Mm](\d)/g, (_, spell: string, n: string) => {
      const effect = spells[spell]?.effects.find((e) => e.effectIndex === Number(n) - 1)
      return String(effect?.effectBasePointsF ?? 0)
    })
}

/** Lines that differ from the client's rendered name on purpose, with why. */
const ENCHANT_LINE_EXCEPTIONS: Record<string, string> = {
  // "Defense +$k2" reads slot 2's EffectPointsMin, an unused 6: the row's one effect (slot 1) is 9,
  // the value the catalogue simulates (catalogue.test.ts: E(8214, 1248665)).
  bracerSuperiorDeflection: 'Defense +6',
}

const numbers = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).map(Number).sort((a, b) => a - b)

describe('the enchant’s green tooltip line (docs/ux.md "Item tooltips")', () => {
  const catalogue = enchantCatalogueFor('forever')

  it('has a line for every enchant in the catalogue', () => {
    expect(catalogue.filter((e) => !ENCHANT_LINES[e.id]).map((e) => e.id)).toEqual([])
    expect(Object.keys(ENCHANT_LINES).filter((id) => !catalogue.some((e) => e.id === id))).toEqual([])
  })

  it('is the client’s enchant name, its tokens rendered', () => {
    for (const [id, { client, line }] of Object.entries(ENCHANT_LINES)) {
      const row = enchants[client]
      expect(row, `${id}: client enchant ${client}`).toBeDefined()
      expect(render(row), id).toBe(ENCHANT_LINE_EXCEPTIONS[id] ?? line)
    }
  })

  it('names the enchant row the buffs doc lists for the catalogue’s section', () => {
    for (const enchant of catalogue) {
      const section = enchant.docRef.match(/#5(\d)-/)?.[1]
      const docs = enchants[ENCHANT_LINES[enchant.id].client].doc
      expect(
        docs.some((d) => d.section.startsWith(`5.${section} `)),
        `${enchant.id}: ${JSON.stringify(docs)}`,
      ).toBe(true)
    }
  })

  it('carries the numbers the sim simulates (the Forever summary’s)', () => {
    for (const enchant of catalogue) {
      const line = ENCHANT_LINES[enchant.id].line
      if (numbers(line).length) expect(numbers(line), `${enchant.id}: ${line} / ${enchant.summary}`).toEqual(numbers(enchant.summary))
    }
  })

  it('shows the Classic Era summary where Classic Era’s number differs, and the client’s name where it doesn’t', () => {
    expect(enchantTooltipLine('cloakGreaterDefense', 'forever')).toBe('Armor +60')
    expect(enchantTooltipLine('cloakGreaterDefense', 'classicEra')).toBe('+50 armor')
    expect(enchantTooltipLine('crusader', 'classicEra')).toBe('Crusader')
    expect(enchantTooltipLine('gloveMinorHaste', 'forever')).toBe('Haste +1%')
    expect(enchantTooltipLine('gloveMinorHaste', 'classicEra')).toBe('+1% attack speed')
  })

  it('is null for no enchant and an unknown id', () => {
    expect(enchantTooltipLine(undefined)).toBeNull()
    expect(enchantTooltipLine('')).toBeNull()
    expect(enchantTooltipLine('noSuchEnchant')).toBeNull()
  })
})
