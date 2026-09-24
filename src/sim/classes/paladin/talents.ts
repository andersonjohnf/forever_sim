// Paladin talents (docs/classes/paladin.md#talents): passives as effects, and the talents that
// modify abilities and spells, applied when the plan resolves the rotation's abilities.
//
// Talents are keyed by name and read their rank from the build code (classes/index.ts
// talentRanksByName), as the warrior's are. Rank values are the Forever client's rank tooltips
// (src/data/talents/paladin.json); talents.test.ts checks them. The tank talents Redoubt and
// Reckoning are procs on the boss's swings (the Protection slice); Iron Creed's damage reduction and
// Eye for an Eye aren't modelled (paladin.md#implementation-notes), and Twist of Light comes with
// seal twisting.
import type { Effect } from '../../effects/types'
import type { AbilityDef, SpellDef } from '../../plan/types'
import {
  CONSECRATION,
  CONSECRATION_RANK1,
  EXORCISM_ABILITY,
  HAMMER_OF_WRATH_ABILITY,
  HOLY_STRIKE_ABILITY,
  JUDGEMENT_CATEGORY,
  JUDGEMENT_OF,
  manaCostOf,
  SEAL_BASE_COST,
} from './abilities'

export type TalentRanks = ReadonlyMap<string, number>

const DOC = 'docs/classes/paladin.md'
const rank = (talents: TalentRanks, name: string) => talents.get(name) ?? 0

/** Effects of one passive talent at a rank (paladin.md#talents "Model"). */
export const TALENT_EFFECTS: Record<string, (rank: number) => Effect[]> = {
  // Holy: +2% Strength and +2% total Intellect per rank
  'Divine Strength': (r) => [{ kind: 'mult', stat: 'str', pct: 2 * r }],
  'Divine Intellect': (r) => [{ kind: 'mult', stat: 'int', pct: 2 * r }],
  // Holy: +1% crit with spells per rank (Holy Shock's extra isn't modelled)
  'Holy Power': (r) => [{ kind: 'stat', stat: 'spellCrit', value: r }],
  // Holy: +6% hit with Holy spells per rank; every damaging paladin spell is Holy
  'Divine Precision': (r) => [{ kind: 'stat', stat: 'spellHit', value: 6 * r }],
  // Protection: +1% melee and +1% spell hit per rank (two auras, 54 and 55)
  Precision: (r) => [
    { kind: 'stat', stat: 'hit', value: r },
    { kind: 'stat', stat: 'spellHit', value: r },
  ],
  // Protection: +2% armor from items, +4 defense, +2% total Stamina per rank
  Toughness: (r) => [{ kind: 'itemArmorPct', pct: 2 * r }],
  Anticipation: (r) => [{ kind: 'stat', stat: 'defense', value: 4 * r }],
  'Sacred Duty': (r) => [{ kind: 'mult', stat: 'sta', pct: 2 * r }],
  // Protection: 3 / 7 / 10% Physical damage with a one-hander (school mask 1)
  'One-Handed Weapon Specialization': (r) => [{ kind: 'damage', pct: [0, 3, 7, 10][r], physicalOnly: true, when: { twoHand: false } }],
  // Protection: +10% block value per rank, and a 33 / 66 / 100% chance on a block to restore 6% of
  // maximum mana, at most every 3 s (paladin.md#mana-model)
  'Shield Specialization': (r) => [
    { kind: 'mult', stat: 'blockValue', pct: 10 * r, when: { shield: true } },
    {
      kind: 'proc',
      when: { shield: true },
      proc: {
        id: 'shieldSpecialization',
        name: 'Shield Specialization',
        icon: 'inv_shield_06',
        trigger: 'block',
        from: 'any',
        chance: { pct: [0, 33, 66, 100][r] },
        icdMs: 3000,
        action: { kind: 'mana', pctOfMax: 6 },
        docRef: `${DOC}#protection-tree`,
      },
    },
  ],
  // Protection (the tank talents, with the Protection rotation): each damaging melee swing that lands
  // on you has a 10% chance at every rank (the rank texts; the community's read of the trait curve
  // is 2% a rank [?], OQ 8) to give +6% block per rank for 10 s or 5 blocks (20127 → 20128)
  Redoubt: (r) => [
    {
      kind: 'proc',
      when: { shield: true },
      proc: {
        id: 'redoubt',
        name: 'Redoubt',
        icon: 'ability_defend',
        trigger: 'meleeTaken',
        from: 'any',
        chance: { pct: 10 },
        action: { kind: 'aura', aura: { id: 'redoubt', name: 'Redoubt', durationMs: 10000, blockCharges: 5, mods: { block: 6 * r } } },
        docRef: `${DOC}#protection-tree`,
      },
    },
  ],
  // Protection: when Seal of Fury's absorb is used up, 60 mana (0 + 1 per level), 15% more per level
  // the boss is above you, up to 45% more: 87 against a level-63 boss (1314103, the rank text) [F].
  // The absorb's rules are the sim's (protection.ts `SEAL_OF_FURY_SHIELD_AURA`) [?] (OQ 10)
  'Improved Seal of Fury': () => [
    {
      kind: 'proc',
      proc: {
        id: 'improvedSealOfFury',
        name: 'Improved Seal of Fury',
        icon: 'spell_holy_righteousnessaura',
        trigger: 'damageTaken',
        from: 'any',
        chance: { pct: 100 },
        action: { kind: 'manaFlat', amount: 60, perLevelPct: 15, maxLevelPct: 45 },
        requiresAura: 'sealOfFuryShield',
        docRef: `${DOC}#protection-tree`,
      },
    },
  ],
  // Protection: an extra main-hand attack at once after 8% per rank of your blocks and 20% per rank
  // of the crits you take (the rank texts; 20177 → 20178, `ADD_EXTRA_ATTACKS` 1). In combat it swings
  // at once, so how many Classic could store doesn't arise [?] (OQ 9)
  Reckoning: (r) =>
    (
      [
        ['block', 8],
        ['critTaken', 20],
      ] as const
    ).map(
      ([trigger, pct]): Effect => ({
        kind: 'proc',
        proc: {
          id: 'reckoning',
          name: 'Reckoning',
          icon: 'spell_holy_blessingofstrength',
          trigger,
          from: 'any',
          chance: { pct: pct * r },
          action: { kind: 'extraAttacks', count: 1 },
          counts: 'extraAttacks',
          docRef: `${DOC}#protection-tree`,
        },
      }),
    ),
  // Retribution: +1% parry per rank; +1% melee crit per rank (aura 52: melee only, which covers the
  // melee-class seal procs, judgements and Holy Strike)
  Deflection: (r) => [{ kind: 'stat', stat: 'parry', value: r }],
  Conviction: (r) => [{ kind: 'stat', stat: 'crit', value: r }],
  // Retribution: +1% all damage per rank, and +1% more against Demons and Undead (a separate aura, 168)
  Crusade: (r) => [
    { kind: 'damage', pct: r },
    { kind: 'damage', pct: r, when: { creature: ['demon', 'undead'] } },
  ],
  // Retribution: +3% Physical damage per rank with a two-hander (school mask 1: not Holy)
  'Two-Handed Weapon Specialization': (r) => [{ kind: 'damage', pct: 3 * r, physicalOnly: true, when: { twoHand: true } }],
  // Retribution: 33 / 66 / 100% of Intellect as spell damage
  'Champion of the Light': (r) => [{ kind: 'stat', stat: 'spellDamagePerIntPct', value: [0, 33, 66, 100][r] }],
  // Retribution: a crit (melee, special, seal proc, judgement or spell) gives a stack of +1% Physical
  // and Holy damage per rank for 30 s, up to 5 stacks (20050: aura 79, school mask 3, 5 stacks)
  Vengeance: (r) =>
    (['meleeCrit', 'spellCrit'] as const).map(
      (trigger): Effect => ({
        kind: 'proc',
        proc: {
          id: 'vengeance',
          name: 'Vengeance',
          icon: 'ability_racial_avatar',
          trigger,
          from: 'any',
          chance: { pct: 100 },
          action: { kind: 'aura', aura: { id: 'vengeance', name: 'Vengeance', durationMs: 30000, maxStacks: 5, mods: { damage: r, holy: r } } },
          docRef: `${DOC}#retribution-tree`,
        },
      }),
    ),
  // Retribution: a landed damaging melee attack gives +1% attack power per rank for 30 s; the data's
  // chance is 100% [?] (OQ 20)
  Vindication: (r) => [
    {
      kind: 'proc',
      proc: {
        id: 'vindication',
        name: 'Vindication',
        icon: 'spell_holy_vindication',
        trigger: 'meleeLanded',
        from: 'any',
        chance: { pct: 100 },
        action: { kind: 'aura', aura: { id: 'vindication', name: 'Vindication', durationMs: 30000, mods: { apPct: r } } },
        docRef: `${DOC}#retribution-tree`,
      },
    },
  ],
}

/**
 * Righteous Fury (25780, paladin.md#threat-paladin-specific): +90% threat from Holy damage [F], and
 * with Improved Righteous Fury −2% damage taken per rank while it's up. Without it, Instrument of
 * Law cuts all threat by 10% per rank. The rotation decides whether it's up for the fight.
 */
export function righteousFuryEffects(on: boolean, talents: TalentRanks): Effect[] {
  if (!on) {
    const law = rank(talents, 'Instrument of Law')
    return law > 0 ? [{ kind: 'threat', pct: -10 * law }] : []
  }
  const improved = rank(talents, 'Improved Righteous Fury')
  return [{ kind: 'threat', pct: 90, holyOnly: true }, ...(improved > 0 ? [{ kind: 'damageTaken', pct: -2 * improved } as Effect] : [])]
}

/** Reverence: 10% of Spirit regen per rank continues inside the five-second rule (paladin.md#mana-model). */
export const reverenceShare = (talents: TalentRanks) => 0.1 * rank(talents, 'Reverence')

/** Improved Seals' spell mask: the damage seals' procs and the damage judgements (paladin.md#holy-tree). */
export const IMPROVED_SEALS: ReadonlySet<string> = new Set([
  'sealOfCommandProc',
  'sealOfRighteousnessProc',
  'sealOfFuryProc',
  'judgementOfCommand',
  'judgementOfRighteousness',
  'judgementOfFury',
])

/**
 * A spell with the build's talents (paladin.md#talents): Improved Seals +5% per rank on the seals'
 * procs and damage judgements; Sacred Arbiter +10% Holy Strike damage; Iron Creed +5% Holy Strike
 * threat per rank. Percent spell modifiers on the same spell add (paladin.md#conventions-used-below).
 */
export function withSpellTalents(spell: SpellDef, talents: TalentRanks): SpellDef {
  let damagePct = 0
  let threatPct = 0
  if (IMPROVED_SEALS.has(spell.id)) damagePct += 5 * rank(talents, 'Improved Seals')
  if (spell.id === 'holyStrike') {
    damagePct += 10 * rank(talents, 'Sacred Arbiter')
    threatPct += 5 * rank(talents, 'Iron Creed')
  }
  if (damagePct === 0 && threatPct === 0) return spell
  return { ...spell, damageMult: spell.damageMult * (1 + damagePct / 100), threatMult: spell.threatMult * (1 + threatPct / 100) }
}

/** Benediction's mask: every instant spell and ability (paladin.md#retribution-tree), so HoW only when instant. */
const INSTANT = (a: AbilityDef) => a.castMs === 0
/** Holy Conduit's mask: Consecration, Holy Wrath, Exorcism and Hammer of Wrath (paladin.md#retribution-tree). */
export const HOLY_CONDUIT: ReadonlySet<string> = new Set([
  CONSECRATION.id,
  CONSECRATION_RANK1.id,
  EXORCISM_ABILITY.id,
  HAMMER_OF_WRATH_ABILITY.id,
  'holyWrath',
])

/**
 * An ability with the build's talents (paladin.md#talents), after `withSpellTalents` on its spells:
 * - Instrument of Law: Hammer of Wrath's cast −0.5 s per rank (instant at 2/2, when it no longer
 *   stops swings or holds Judgement; its GCD stays 1 s)
 * - Benediction −2% per rank on instant abilities and Holy Conduit −20% per rank on its four, added
 *   together [?] (OQ 19), then rounded down (paladin.md#mana-model: SoC 189, Consecration 508)
 * - Improved Judgement −1 s per rank on Judgement; Improved Holy Strike −1 s per rank; Purifying
 *   Power −17% / −33% on Exorcism's cooldown
 * - Sanctified Judgement: a judgement returns 20% per rank of its seal's base cost when it lands,
 *   at a 33 / 66 / 100% chance (paladin.md#judgement; base cost [?], OQ 12)
 */
export function withTalents(def: AbilityDef, talents: TalentRanks): AbilityDef {
  const out: AbilityDef = {
    ...def,
    ...(def.spellDef ? { spellDef: withSpellTalents(def.spellDef, talents) } : {}),
    ...(def.tickSpellDef ? { tickSpellDef: withSpellTalents(def.tickSpellDef, talents) } : {}),
  }
  if (def.id === HAMMER_OF_WRATH_ABILITY.id) {
    out.castMs = Math.max(0, def.castMs - 500 * rank(talents, 'Instrument of Law'))
    // Instant at 2/2: no cast to stop swings or hold Judgement.
    if (out.castMs === 0) {
      out.castStopsSwings = false
      out.castHoldsOffGcd = false
    }
  }
  const cut = (INSTANT(out) ? 2 * rank(talents, 'Benediction') : 0) + (HOLY_CONDUIT.has(def.id) ? 20 * rank(talents, 'Holy Conduit') : 0)
  if (def.resource === 'mana' && def.costTenths > 0 && cut > 0) out.costTenths = 10 * Math.floor((manaCostOf(def) * (100 - cut)) / 100 + 1e-9)
  if (def.category === JUDGEMENT_CATEGORY) {
    out.cooldownMs = def.cooldownMs - 1000 * rank(talents, 'Improved Judgement')
    const sanctified = rank(talents, 'Sanctified Judgement')
    const seal = Object.entries(JUDGEMENT_OF).find(([, j]) => j.id === def.id)?.[0]
    if (sanctified > 0 && seal) {
      out.manaReturnTenths = (10 * SEAL_BASE_COST[seal] * 20 * sanctified) / 100
      out.manaReturnChance = [0, 0.33, 0.66, 1][sanctified]
    }
  }
  if (def.id === HOLY_STRIKE_ABILITY.id) out.cooldownMs = def.cooldownMs - 1000 * rank(talents, 'Improved Holy Strike')
  if (def.id === EXORCISM_ABILITY.id) out.cooldownMs = Math.round(def.cooldownMs * (1 - [0, 0.17, 0.33][rank(talents, 'Purifying Power')]))
  return out
}
