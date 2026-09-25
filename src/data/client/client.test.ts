// Checks over the client-data snapshot in src/data/client (docs/data/client.md): values the
// docs state, and agreement with the spellbook, talent, race and item datasets, read back from
// the raw Forever client files.
// A failure here means a scraper regression or a new build that changed the value; in the
// latter case update the owning doc (and this test) in the same commit.
import { describe, expect, it } from 'vitest'
import raceJson from '../races/races.json'
import type { RaceData } from '../races/types'
import druidSpellJson from '../spells/druid.json'
import paladinSpellJson from '../spells/paladin.json'
import type { SpellBook } from '../spells/types'
import warriorSpellJson from '../spells/warrior.json'
import druidTalentJson from '../talents/druid.json'
import paladinTalentJson from '../talents/paladin.json'
import type { TalentData } from '../talents/types'
import warriorTalentJson from '../talents/warrior.json'
import itemJson from '../items/pre-bis.json'
import type { ItemData } from '../items/types'
import enchantsJson from './enchants.json'
import gametablesJson from './gametables.json'
import itemsJson from './items.json'
import spellsJson from './spells.json'
import talentsJson from './talents.json'
import type {
  ClientDataMeta,
  ClientEnchants,
  ClientGameTables,
  ClientItems,
  ClientSpell,
  ClientSpells,
  ClientTalents,
  SpellEffect,
} from './types'

const spells = spellsJson as unknown as ClientSpells
const talents = talentsJson as unknown as ClientTalents
const items = itemsJson as unknown as ClientItems
const enchants = enchantsJson as unknown as ClientEnchants
const gametables = gametablesJson as unknown as ClientGameTables
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
const preBis = itemJson as unknown as ItemData

// SpellEffectName / AuraType values used below.
const SCHOOL_DAMAGE = 2
const DUMMY = 3
const WEAPON_PERCENT_DAMAGE = 31
const WEAPON_DAMAGE = 58
const THREAT = 63
const AURA_MOD_THREAT = 10
const AURA_MOD_ATTACK_POWER = 99
const HOLY_SCHOOL_MASK = 2
const RAGE = 1

function spell(id: number): ClientSpell {
  const s = spells.spells[String(id)]
  if (!s) throw new Error(`spell ${id} is not in spells.json`)
  return s
}
const byEffect = (s: ClientSpell, effect: number): SpellEffect | undefined => s.effects.find((e) => e.effect === effect)
const byAura = (s: ClientSpell, aura: number): SpellEffect | undefined => s.effects.find((e) => e.effectAura === aura)
const points = (e: SpellEffect | undefined) => e?.effectBasePointsF ?? 0
const cooldownMs = (s: ClientSpell) => Math.max(s.cooldowns?.recoveryTime ?? 0, s.cooldowns?.categoryRecoveryTime ?? 0)

/** The Forever spell id of a spellbook rank. */
function rankId(cls: keyof typeof spellBooks, name: string, rank: number | null): number {
  const s = spellBooks[cls].spells.find((x) => x.name === name)
  const r = s?.ranks.find((x) => x.rank === rank)
  if (!r?.forever?.spellId) throw new Error(`${cls} ${name} rank ${rank} has no Forever spell id`)
  return r.forever.spellId
}

function talent(cls: keyof typeof talentData, name: string) {
  const t = talents.classes[cls].talents.find((x) => x.name === name)
  if (!t) throw new Error(`talent ${cls} ${name} not mapped`)
  return t
}

const metas: [string, ClientDataMeta][] = [
  ['spells', spells.meta],
  ['talents', talents.meta],
  ['items', items.meta],
  ['enchants', enchants.meta],
  ['gametables', gametables.meta],
]

describe.each(metas)('%s.json meta', (_name, meta) => {
  it('records the wago.tools source, the build, the files read and the WoWDBDefs commit', () => {
    expect(meta.source).toBe('https://wago.tools/api/casc')
    expect(meta.product).toBe('wow_classic_beta')
    expect(meta.build).toMatch(/^1\.60\.\d+\.\d+$/)
    expect(Object.keys(meta.tables).length).toBeGreaterThan(0)
    for (const fdid of Object.values(meta.tables)) expect(fdid).toBeGreaterThan(0)
    expect(meta.wowDbDefs.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(Number.isNaN(Date.parse(meta.scrapedAt))).toBe(false)
    expect(meta.scraper).toBe('scripts/scrape/client.mjs')
  })

  it('is the same build as the spellbook, talent, race and item datasets', () => {
    const datasets = [...Object.values(spellBooks), ...Object.values(talentData), races, preBis]
    for (const d of datasets) expect(meta.build).toBe(d.meta.foreverBuild)
  })
})

describe('values the docs state, read from the raw client', () => {
  it('Thunder Clap rank 6 has a 6 s cooldown (docs/mechanics/buffs-debuffs-consumables.md §4.2)', () => {
    const tc = spell(rankId('warrior', 'Thunder Clap', 6))
    expect(tc.nameSubtext).toBe('Rank 6')
    expect(cooldownMs(tc)).toBe(6000)
  })

  it('Battle Shout rank 7 gives 139 attack power (buffs §1.1)', () => {
    const bs = spell(rankId('warrior', 'Battle Shout', 7))
    expect(points(byAura(bs, AURA_MOD_ATTACK_POWER))).toBe(139)
  })

  it('Bloodthirst deals 0.35 × AP + 48 (docs/classes/warrior.md §2)', () => {
    const bt = spell(23894)
    expect(points(byEffect(bt, SCHOOL_DAMAGE))).toBe(48)
    expect(points(byEffect(bt, DUMMY))).toBe(35) // % of attack power
  })

  it('Execute converts rage at EffectChainAmplitude × 10 per point: 3 … 15 by rank, in the client (docs/classes/warrior.md §3.1)', () => {
    const ranks = [1, 2, 3, 4, 5].map((r) => spell(rankId('warrior', 'Execute', r)))
    expect(ranks.map((s) => s.id)).toEqual([5308, 20658, 20660, 20661, 20662])
    expect(ranks.map((s) => points(byEffect(s, DUMMY)))).toEqual([125, 200, 325, 450, 600])
    expect(ranks.map((s) => byEffect(s, DUMMY)?.effectChainAmplitude)).toEqual([0.3, 0.6, 0.9, 1.2, 1.5])
    // The tooltip's "$*10;F1", rendered by the spellbook: 15 per extra rage at rank 5.
    const text = spellBooks.warrior.spells.find((s) => s.name === 'Execute')?.ranks.at(-1)?.forever?.text
    expect(text).toContain('600 damage and converting each extra point of rage into 15 additional damage')
  })

  it('Demoralizing Shout rank 5 is −204 at level 60: −196 − 1.4 per level above 54 (buffs §2, warrior Q22)', () => {
    const shout = spell(rankId('warrior', 'Demoralizing Shout', 5))
    const ap = byAura(shout, AURA_MOD_ATTACK_POWER)!
    expect([points(ap), ap.effectRealPointsPerLevel]).toEqual([-196, -1.4])
    expect(shout.levels).toMatchObject({ spellLevel: 54, maxLevel: 64 })
    expect(Math.trunc(points(ap) + ap.effectRealPointsPerLevel! * (60 - shout.levels!.spellLevel!))).toBe(-204)
    const text = spellBooks.warrior.spells.find((s) => s.name === 'Demoralizing Shout')?.ranks.find((r) => r.rank === 5)?.forever?.text
    expect(text).toContain('by 204 for 45 sec')
  })

  it('Shred deals 155% weapon damage plus 80 (docs/classes/druid.md)', () => {
    const shred = spell(rankId('druid', 'Shred', 5))
    expect(points(byEffect(shred, WEAPON_PERCENT_DAMAGE))).toBe(155)
    expect(points(byEffect(shred, WEAPON_DAMAGE))).toBe(80)
  })

  it('Righteous Fury multiplies Holy threat by 1.9 (docs/mechanics/threat.md)', () => {
    const rf = byAura(spell(25780), AURA_MOD_THREAT)
    expect(points(rf)).toBe(90)
    expect(rf?.effectMiscValue?.[0]).toBe(HOLY_SCHOOL_MASK)
    expect(1 + points(rf) / 100).toBe(1.9)
  })

  it('Sunder Armor carries a THREAT effect of 34 / 75 / 117 / 158 / 206 by rank, with no attack power coefficient (docs/mechanics/threat.md)', () => {
    const ranks = [1, 2, 3, 4, 5].map((r) => byEffect(spell(rankId('warrior', 'Sunder Armor', r)), THREAT))
    expect(ranks.map(points)).toEqual([34, 75, 117, 158, 206])
    // The notes' attack power term isn't in the client: no bonus coefficient on the effect, for
    // spell power or attack power (BonusCoefficientFromAP, written as bonusCoefficientFromAp).
    for (const e of ranks) expect([e?.effectBonusCoefficient ?? 0, e?.bonusCoefficientFromAp ?? 0]).toEqual([0, 0])
    expect(points(byAura(spell(rankId('warrior', 'Sunder Armor', 5)), 22))).toBe(-450)
  })

  it('Flurry gives 25% attack speed at 5/5 (warrior §2)', () => {
    const flurry = talent('warrior', 'Flurry')
    expect(flurry.maxRank).toBe(5)
    expect(flurry.rankEffects[0].values).toEqual([5, 10, 15, 20, 25])
  })

  it('14 crit rating = 1% crit at level 60 (docs/data/items.md, "Forever\'s ratings")', () => {
    const cr = gametables.combatRatings.level60
    expect(cr.critMelee).toBe(14)
    expect(cr.critMelee).toBe(preBis.meta.ratingConversions.critRating?.ratingPerUnit)
    expect(cr.hitMelee).toBe(preBis.meta.ratingConversions.hitRating?.ratingPerUnit)
    expect(cr.dodge).toBe(preBis.meta.ratingConversions.dodgeRating?.ratingPerUnit)
    expect(cr.parry).toBe(preBis.meta.ratingConversions.parryRating?.ratingPerUnit)
    expect(cr.block).toBe(preBis.meta.ratingConversions.blockRating?.ratingPerUnit)
    expect(cr.defenseSkill).toBe(preBis.meta.ratingConversions.defenseRating?.ratingPerUnit)
    expect(gametables.combatRatings.sameAtEveryLevel).toBe(true)
  })

  it('base mana and crit per Agility match docs/mechanics/character-stats.md', () => {
    const pes = gametables.playerExpectedStat.level60
    expect(pes.paladin.baseMana).toBe(1512)
    expect(pes.druid.baseMana).toBe(1244)
    expect(gametables.baseMana.level60.paladin).toBe(1512)
    expect(pes.warrior.critPerAgility).toBe(0.0005)
    expect(pes.paladin.critPerAgility).toBe(0.000506)
  })
})

describe('agreement with the spellbook, talent and race datasets', () => {
  const ranks = Object.entries(spellBooks).flatMap(([cls, book]) =>
    book.spells.flatMap((s) =>
      s.ranks.filter((r) => r.forever?.spellId).map((r) => ({ label: `${cls} ${s.name} ${r.rank ?? ''} (${r.forever!.spellId})`, rank: r.forever! })),
    ),
  )

  it('has every Forever spellbook rank', () => {
    for (const { label, rank } of ranks) expect(spells.spells[String(rank.spellId)], label).toBeDefined()
  })

  it('gives every rank the cooldown, cost, cast time and range its spellbook shows', () => {
    for (const { label, rank } of ranks) {
      const s = spell(rank.spellId!)
      if (rank.cooldown?.seconds != null) expect(cooldownMs(s) / 1000, `${label} cooldown`).toBe(rank.cooldown.seconds)
      if (rank.cost?.amount != null) {
        const p = s.power?.[0]
        const tenths = p?.powerType === RAGE ? 10 : 1
        expect((p?.manaCost ?? 0) / tenths, `${label} cost`).toBe(rank.cost.amount)
      }
      if (rank.cost?.percentOfBase != null) expect(s.power?.[0]?.powerCostPct ?? 0, `${label} cost`).toBe(rank.cost.percentOfBase)
      if (rank.castTime?.seconds != null && !rank.castTime.channeled) expect((s.castTime?.base ?? 0) / 1000, `${label} cast`).toBe(rank.castTime.seconds)
      if (rank.range && !rank.range.melee) expect(s.range?.rangeMax?.[0] ?? 0, `${label} range`).toBe(rank.range.yards)
    }
  })

  it('maps every Forever talent to a Trait node, in the same cell and with the same max rank', () => {
    expect(talents.unmapped).toEqual([])
    for (const [cls, data] of Object.entries(talentData)) {
      const forever = data.trees.flatMap((t) => t.talents.filter((x) => x.inForeverTree))
      const mapped = talents.classes[cls as keyof typeof talentData].talents
      expect(mapped.map((t) => t.id).sort(), cls).toEqual(forever.map((t) => t.id).sort())
      for (const t of mapped) {
        const src = forever.find((x) => x.id === t.id)!
        expect([t.client.tier, t.client.col, t.maxRank], t.name).toEqual([src.tier, src.col, src.maxRank])
        expect(t.rankSpellIds, t.name).toHaveLength(t.maxRank)
        expect(spells.spells[String(t.spellId)], t.name).toBeDefined()
      }
    }
  })

  // Talents whose per-rank curve values don't appear in the rank tooltip: hidden effects the
  // tooltip doesn't print, or values the tooltip converts (ms → min). Checked in data, not text.
  const HIDDEN_OR_CONVERTED = new Set([
    'Last Stand', // curve 5 on a 30% max-health effect
    'Improved Shield Wall', // −330,000 ms per rank; tooltip "11.0 min" at 2/2
    'Eclipse', // curve values 0
    'Feral Instinct', // hidden 5/10/15
    'King of the Jungle', // hidden 5/10/15 (docs/open-questions.md D17)
    'Illumination',
    'Holy Power',
    'Redoubt',
    "Guardian's Favor", // −60,000 ms per rank; tooltip "2 min"
  ])

  it('gives talent curves the per-rank numbers the Forever tooltips show', () => {
    for (const [cls, data] of Object.entries(talentData)) {
      const byId = new Map(data.trees.flatMap((t) => t.talents.map((x) => [x.id, x])))
      for (const t of talents.classes[cls as keyof typeof talentData].talents) {
        if (HIDDEN_OR_CONVERTED.has(t.name)) continue
        const texts = byId.get(t.id)!.ranks.forever
        for (const e of t.rankEffects) {
          e.values.forEach((v, r) => {
            const nums = new Set([...(texts[r] ?? '').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])))
            const a = Math.abs(v)
            expect([a, a / 10, a / 100, a / 1000].some((x) => nums.has(x)), `${cls} ${t.name} rank ${r + 1} effect ${e.effectIndex} = ${v}`).toBe(true)
          })
        }
      }
    }
  })

  it('resolves every racial to a Forever spell', () => {
    for (const race of races.races) {
      const resolved = spells.racials[race.id]
      expect(resolved, race.id).toBeDefined()
      for (const r of race.racials) {
        const found = resolved.racials.find((x) => x.id === r.id)
        expect(found?.spells.length, `${race.id} ${r.name}`).toBeGreaterThan(0)
        for (const s of found!.spells) expect(spells.spells[String(s.spellId)]?.name, `${race.id} ${r.name}`).toBeDefined()
        if (r.classicSpellId) expect(found!.spells.map((s) => s.spellId), `${race.id} ${r.name}`).toContain(r.classicSpellId)
      }
    }
  })
})

describe('internal consistency', () => {
  it('covers every pre-raid item, with its effect spells extracted', () => {
    expect(Object.keys(items.items)).toHaveLength(preBis.items.length)
    for (const item of preBis.items) {
      const rec = items.items[String(item.id)]
      expect(rec, item.name).toBeDefined()
      for (const e of rec.effects) if (e.spellId) expect(spells.spells[String(e.spellId)], `${item.name} → ${e.spellId}`).toBeDefined()
    }
  })

  it('has an ItemSparse row for exactly the pool items with Forever data (items.md, D17)', () => {
    for (const i of preBis.items) {
      const rec = items.items[String(i.id)]
      if (i.foreverData) expect(rec.itemSparse, i.name).not.toBeNull()
      else expect(rec.itemSparse, i.name).toBeNull()
    }
  })

  it('has every enchant the buffs doc names, applied by the spells and items the doc says', () => {
    expect(enchants.notInClient).toEqual([])
    expect(enchants.docMismatches).toEqual([])
    for (const e of Object.values(enchants.enchants)) {
      for (const id of e.spellIds) expect(spells.spells[String(id)], `${e.name} → ${id}`).toBeDefined()
    }
  })

  it('maps the buffs doc consumables to the doc\'s spells', () => {
    const mismatched = Object.values(items.consumables).filter((c) => c.docMismatches.length > 0)
    expect(mismatched.map((c) => c.id)).toEqual([])
    // Blessed Sunfruit casts 18124, which triggers the buff 18125 (the doc names both since M1.5b).
    expect(spell(18124).effects.some((e) => e.effectTriggerSpell === 18125)).toBe(true)
  })

  it('is closed over effectTriggerSpell', () => {
    for (const s of Object.values(spells.spells)) {
      for (const e of s.effects) {
        if (!e.effectTriggerSpell) continue
        const inSet = String(e.effectTriggerSpell) in spells.spells
        const excluded = String(e.effectTriggerSpell) in spells.excludedWorldBuffs
        const absent = spells.notInClient.some((m) => m.id === e.effectTriggerSpell)
        expect(inSet || excluded || absent, `${s.name} ${s.id} → ${e.effectTriggerSpell}`).toBe(true)
      }
    }
  })

  it('never extracts world buffs (decisions D8)', () => {
    for (const id of Object.keys(spells.excludedWorldBuffs)) expect(spells.spells[id]).toBeUndefined()
    for (const s of Object.values(spells.spells)) expect(s.name).not.toMatch(/Rallying Cry|Songflower|Warchief's Blessing|Spirit of Zandalar/)
  })

  it('writes spells without zero values, as types.ts documents (and effectChainAmplitude only when it isn’t 1)', () => {
    for (const s of Object.values(spells.spells)) {
      for (const e of s.effects) {
        for (const [k, v] of Object.entries(e)) {
          if (k === 'effectChainAmplitude') expect(v, `${s.id} ${k}`).not.toBe(1)
          else if (k !== 'effectIndex' && k !== 'effect') expect(v === 0 || (Array.isArray(v) && v.every((x) => x === 0)), `${s.id} ${k}`).toBe(false)
        }
      }
    }
  })
})
