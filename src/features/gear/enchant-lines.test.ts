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

  it('shows the Classic Era client’s name where Classic Era’s number differs, and the Forever client’s where it doesn’t', () => {
    expect(enchantTooltipLine('cloakGreaterDefense', 'forever')).toBe('Armor +60')
    expect(enchantTooltipLine('cloakGreaterDefense', 'classicEra')).toBe('Armor +50')
    expect(enchantTooltipLine('crusader', 'classicEra')).toBe('Crusader')
    expect(enchantTooltipLine('gloveMinorHaste', 'forever')).toBe('Haste +1%')
    expect(enchantTooltipLine('gloveMinorHaste', 'classicEra')).toBe('Attack Speed +1%')
    expect(enchantTooltipLine('chestMajorStamina', 'classicEra')).toBe('Health +100')
    expect(enchantTooltipLine('ruggedArmorKit', 'classicEra')).toBe('Reinforced Armor +40')
  })

  it('has a Classic Era line for exactly the enchants whose Classic Era number differs, carrying that number', () => {
    const classic = new Map(enchantCatalogueFor('classicEra').map((e) => [e.id, e.summary]))
    for (const enchant of catalogue) {
      const own = classic.get(enchant.id)!
      const known = ENCHANT_LINES[enchant.id]
      expect(Boolean(known.classic), `${enchant.id}: ${enchant.summary} / ${own}`).toBe(own !== enchant.summary)
      if (known.classic) {
        expect(enchantTooltipLine(enchant.id, 'classicEra'), enchant.id).toBe(known.classic.line)
        if (numbers(own).length) expect(numbers(known.classic.line), `${enchant.id}: ${known.classic.line} / ${own}`).toEqual(numbers(own))
      }
    }
  })

  // The Classic Era client's SpellItemEnchantment and SpellEffect, where they're cached locally
  // (.cache/client/1.15.9.69722/tables, from `npm run scrape:client`).
  const CLASSIC_TABLES = import.meta.glob<string>('/.cache/client/1.15.9.69722/tables/{SpellItemEnchantment,SpellEffect}.ndjson', {
    query: '?raw',
    import: 'default',
  })
  it.skipIf(Object.keys(CLASSIC_TABLES).length !== 2)('names each Classic Era line’s row as the Classic Era client does, the row its enchanting spell applies (1.15.9.69722, cached locally)', async () => {
    const rows = async (table: string) =>
      (await CLASSIC_TABLES[`/.cache/client/1.15.9.69722/tables/${table}.ndjson`]())
        .split('\n')
        .slice(1)
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>)
    const enchantRows = new Map((await rows('SpellItemEnchantment')).map((r) => [r.ID as number, r]))
    /** Enchant ids each Classic Era spell applies (effect 53, ENCHANT_ITEM). */
    const applies = new Map<number, number[]>()
    for (const e of await rows('SpellEffect')) {
      if (e.Effect !== 53) continue
      const list = applies.get(e.SpellID as number) ?? []
      list.push((e.EffectMiscValue as number[])[0])
      applies.set(e.SpellID as number, list)
    }
    /** The Forever rows' enchanting spells (src/data/client/enchants.json), for the spell that applies each Classic Era row. */
    const foreverSpells = (id: number) => enchants[id].appliedBySpellIds
    for (const [id, known] of Object.entries(ENCHANT_LINES)) {
      if (!known.classic) continue
      const row = enchantRows.get(known.classic.client)
      expect(row, `${id}: Classic Era enchant ${known.classic.client}`).toBeDefined()
      const points = row!.EffectPointsMin as number[]
      const name = (row!.Name_lang as string).replace(/\$k(\d)/g, (_, n: string) => String(points[Number(n) - 1]))
      expect(name, id).toBe(known.classic.line)
      // One of the Forever row's enchanting spells applies this row in Classic Era.
      expect(
        foreverSpells(known.client).some((spell) => applies.get(spell)?.includes(known.classic!.client)),
        `${id}: spells ${foreverSpells(known.client).join(', ')}`,
      ).toBe(true)
    }
  })

  it('is null for no enchant and an unknown id', () => {
    expect(enchantTooltipLine(undefined)).toBeNull()
    expect(enchantTooltipLine('')).toBeNull()
    expect(enchantTooltipLine('noSuchEnchant')).toBeNull()
  })
})
