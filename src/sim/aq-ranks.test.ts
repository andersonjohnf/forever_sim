// No class's defaults or the buff catalogue use a rank that an Ahn'Qiraj book teaches (decision D36:
// Ahn'Qiraj comes long after launch, so the ranks are what a trainer teaches, with no toggle). The
// books are items whose ItemEffect (trigger 6, learn spell) teaches the rank, read from the Forever
// client [F] (ItemSparse, ItemEffect, ItemXItemEffect, 1.60.1.70009); in Classic Era they drop only in
// the Ruins and the Temple of Ahn'Qiraj [C] (docs/mechanics/buffs-debuffs-consumables.md#11-attack-power-stats-and-crit).
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import type { ClientSpells } from '@/data/client/types'
import { EUREKA_ABILITIES } from './classes/eureka'

const spells = (spellsJson as unknown as ClientSpells).spells

/** Each Ahn'Qiraj book: its item, and the spell it teaches. */
export const AQ_BOOK_SPELLS: Readonly<Record<number, { item: number; book: string }>> = {
  25286: { item: 21297, book: 'Manual of Heroic Strike IX' },
  25289: { item: 21298, book: 'Manual of Battle Shout VII' },
  25288: { item: 21299, book: 'Manual of Revenge VI' },
  25300: { item: 21300, book: 'Handbook of Backstab IX' },
  25347: { item: 21302, book: 'Handbook of Deadly Poison V' },
  25302: { item: 21303, book: 'Handbook of Feint V' },
  25304: { item: 21214, book: 'Tome of Frostbolt XI' },
  25306: { item: 21279, book: 'Tome of Fireball XII' },
  25345: { item: 21280, book: 'Tome of Arcane Missiles VIII' },
  25307: { item: 21281, book: 'Grimoire of Shadow Bolt X' },
  25309: { item: 21282, book: 'Grimoire of Immolate VIII' },
  25311: { item: 21283, book: 'Grimoire of Corruption VII' },
  25314: { item: 21284, book: 'Codex of Greater Heal V' },
  25315: { item: 21285, book: 'Codex of Renew X' },
  25316: { item: 21287, book: 'Codex of Prayer of Healing V' },
  25290: { item: 21288, book: 'Libram: Blessing of Wisdom VI' },
  25291: { item: 21289, book: 'Libram: Blessing of Might VII' },
  25292: { item: 21290, book: 'Libram: Holy Light IX' },
  25357: { item: 21291, book: 'Tablet of Healing Wave X' },
  25361: { item: 21292, book: 'Tablet of Strength of Earth Totem V' },
  25359: { item: 21293, book: 'Tablet of Grace of Air Totem III' },
  25297: { item: 21294, book: 'Book of Healing Touch XI' },
  25298: { item: 21295, book: 'Book of Starfire VII' },
  25299: { item: 21296, book: 'Book of Rejuvenation XI' },
  25294: { item: 21304, book: 'Guide: Multi-Shot V' },
  25295: { item: 21306, book: 'Guide: Serpent Sting IX' },
  25296: { item: 21307, book: 'Guide: Aspect of the Hawk VII' },
}

/**
 * The spells that come with a book's rank: what its spell triggers (Arcane Missiles' missile, a
 * totem's aura), what Deadly Poison V's recipe makes (its item's spell and its stack), and the Greater
 * Blessings' rank 2, which carries the librams' values and is taken to come with them [?]
 * (buffs doc OQ 22).
 */
const WITH_A_BOOK: Readonly<Record<number, string>> = {
  25346: 'Arcane Missiles r8’s missile',
  25360: 'Grace of Air Totem r3’s aura',
  25362: 'Strength of Earth Totem r5’s aura',
  25351: 'Deadly Poison V, the item’s spell',
  25349: 'Deadly Poison V’s stack',
  25916: 'Greater Blessing of Might r2',
  25918: 'Greater Blessing of Wisdom r2',
}

const FORBIDDEN = [...Object.keys(AQ_BOOK_SPELLS), ...Object.keys(WITH_A_BOOK)].map(Number)

/** The engine's source, without its tests: every spell id a class, a buff or the plan looks up. */
const SOURCES = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts', '!./**/test-helpers.ts'], { query: '?raw', import: 'default', eager: true })

describe('no Ahn’Qiraj book’s rank (D36)', () => {
  it('lists each book’s spell as the client names it, a rank a trainer doesn’t teach', () => {
    for (const [id, { book }] of Object.entries(AQ_BOOK_SPELLS)) {
      const s = spells[id]
      // Multi-Shot V isn't in the Forever client at all; Deadly Poison V's recipe only in the spellbook data.
      if (!s) continue
      expect(book.replace(/^(Manual|Handbook|Tome|Grimoire|Codex|Libram|Tablet|Book|Guide):? (of )?/, '').startsWith(s.name), `${id} ${book}`).toBe(true)
    }
  })

  it('uses none of their spells in the engine’s code (src/sim, tests aside)', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    const found: string[] = []
    for (const [file, text] of Object.entries(SOURCES)) {
      // The code, not its comments (which may name a book's rank to say why it isn't used). A doc
      // anchor's slug ("#34-serpent-sting-r9-25295") isn't a spell lookup either.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      for (const id of FORBIDDEN) if (new RegExp(`(?<![0-9-])${id}(?![0-9])`).test(code)) found.push(`${file}: ${id}`)
    }
    expect(found).toEqual([])
  })

  it('gives Gnome Eureka! none of their spells', () => {
    const used = Object.values(EUREKA_ABILITIES).flatMap((table) => Object.values(table).flatMap((a) => [a.spell, a.damageSpell ?? a.spell]))
    for (const id of used) expect(FORBIDDEN, String(id)).not.toContain(id)
  })
})
