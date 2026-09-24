// The shaman's talents (docs/classes/shaman.md#talents): the passives as effects, and the changes the
// build makes to the ability and spell rows. Values are the Forever client's rank curves
// (TraitDefinitionEffectPoints, src/data/client/talents.json, build 1.60.1.69913), checked by
// data.test.ts. Talents that do nothing for a damage dealer (Toughness, Anticipation, the totem and
// healing talents) or that the sim doesn't model yet (Elemental Focus, Lightning Overload, Lava Burst)
// have no entry: shaman.md says which.
import type { Effect } from '../../effects/types'
import type { AbilityDef, SpellDef } from '../../plan/types'
import {
  EARTH_SHOCK,
  FROST_SHOCK,
  IMPROVED_STORMSTRIKE_AURA,
  LIGHTNING_BOLT,
  MAELSTROM_AURA,
  maelstromProc,
  STORMSTRIKE,
} from './abilities'

const DOC = 'docs/classes/shaman.md'

/** Talent ranks by name (classes/index.ts talentRanksByName). */
export type TalentRanks = ReadonlyMap<string, number>

export const rank = (talents: TalentRanks, name: string) => talents.get(name) ?? 0

/**
 * Flurry (16256 → 16257) [F] [client] (SpellAuraOptions, SpellEffect, SpellDuration, CurvePoint,
 * 1.60.1.69913): a melee crit (proc mask 0x14) gives 3 charges of +5% attack speed per rank (aura 319,
 * 25% at 5/5) for 15 s; white swings use the charges, at most one per 500 ms (16257's
 * `ProcCategoryRecovery`), so Windfury Weapon's two extra attacks use one between them [?]
 * (shaman.md#flurry). The Forever tree puts it under Mental Dexterity.
 */
const flurry = (r: number): Effect[] => [
  {
    kind: 'proc',
    proc: {
      id: 'shamanFlurry',
      name: 'Flurry',
      icon: 'ability_ghoulfrenzy',
      trigger: 'meleeCrit',
      from: 'any',
      chance: { pct: 100 },
      action: {
        kind: 'aura',
        aura: { id: 'shamanFlurry', name: 'Flurry', durationMs: 15000, whiteSwingCharges: 3, whiteSwingChargeIcdMs: 500, mods: { haste: 5 * r } },
      },
      docRef: `${DOC}#flurry`,
    },
  },
]

/**
 * Elemental Devastation (30160 → 30165) [F] [client] (SpellAuraOptions, SpellEffect, SpellDuration,
 * 1.60.1.69913): a harmful spell's crit (proc mask 0x10000) gives +3% melee crit per rank (aura 52,
 * melee only) for 10 s.
 */
const elementalDevastation = (r: number): Effect[] => [
  {
    kind: 'proc',
    proc: {
      id: 'elementalDevastation',
      name: 'Elemental Devastation',
      icon: 'spell_fire_elementaldevastation',
      trigger: 'spellCrit',
      from: 'any',
      chance: { pct: 100 },
      action: { kind: 'aura', aura: { id: 'elementalDevastation', name: 'Elemental Devastation', durationMs: 10000, mods: { crit: 3 * r } } },
      docRef: `${DOC}#talents`,
    },
  },
]

/**
 * The passives as effects, by talent name (shaman.md#talents). Each value is its rank curve's at rank
 * r [F] [client] (TraitDefinitionEffectPoints, CurvePoint, SpellEffect, 1.60.1.69913).
 */
export const TALENT_EFFECTS: Record<string, (r: number) => Effect[]> = {
  // 16255: aura 290 (all crit), +1% a rank to attacks and spells alike.
  'Thundering Strikes': (r) => [
    { kind: 'stat', stat: 'crit', value: r },
    { kind: 'stat', stat: 'spellCrit', value: r },
  ],
  // 17485: aura 137 (total stat %), Intellect, +2% a rank.
  'Ancestral Knowledge': (r) => [{ kind: 'mult', stat: 'int', pct: 2 * r }],
  // 415140: aura 598 (attack power from a stat), Intellect: 33 / 67 / 100%.
  'Mental Dexterity': (r) => [{ kind: 'stat', stat: 'apPerInt', value: [0, 0.33, 0.67, 1][r] ?? 1 }],
  // 30812: aura 174 (spell damage from a stat), Intellect: 15 / 30%.
  'Mental Quickness': (r) => [{ kind: 'stat', stat: 'spellDamagePerIntPct', value: 15 * r }],
  // 16179: auras 54 and 55, +1% melee and spell hit a rank.
  'Tidal Focus': (r) => [
    { kind: 'stat', stat: 'hit', value: r },
    { kind: 'stat', stat: 'spellHit', value: r },
  ],
  Flurry: flurry,
  'Elemental Devastation': elementalDevastation,
  // 408498: its stacks (MAELSTROM_AURA) from melee hits; Lightning Bolt spends them (withTalents).
  'Maelstrom Weapon': () => [{ kind: 'proc', proc: maelstromProc() }],
}

/** Elemental Weapons (16266) a rank: Windfury Weapon's attack power 13 / 27 / 40%, Rockbiter's 7 / 13 / 20% [F]. */
export const ELEMENTAL_WEAPONS_WINDFURY = [0, 13, 27, 40]
export const ELEMENTAL_WEAPONS_ROCKBITER = [0, 7, 13, 20]

/** Maelstrom Weapon (408498): each stack cuts Lightning Bolt's cast time and cost by 4% a rank [F]. */
export const maelstromPctPerStack = (talents: TalentRanks) => 4 * rank(talents, 'Maelstrom Weapon')

/**
 * The build's changes to a spell (shaman.md#talents) [F] [client] (SpellEffect spell masks,
 * TraitDefinitionEffectPoints, 1.60.1.69913): Concussion +1% a rank to Lightning Bolt and Earth Shock
 * (mask 0x100003; not Frost Shock), Call of Thunder +3% crit to Lightning Bolt, Elemental Fury +20% a
 * rank to the crit bonus of Fire, Frost and Nature spells (so ×2.0 at 5/5), and Totem of Rage's +2%
 * to shocks (27859, a relic: `shockBonusPct`).
 */
export function withSpellTalents(spell: SpellDef, talents: TalentRanks, shockBonusPct = 0): SpellDef {
  const id = spell.id
  const bolt = id === 'lightningBolt'
  const shock = id === 'earthShock' || id === 'frostShock'
  let damageMult = spell.damageMult
  if (bolt || id === 'earthShock') damageMult *= 1 + rank(talents, 'Concussion') / 100
  if (shock && shockBonusPct > 0) damageMult *= 1 + shockBonusPct / 100
  const fury = rank(talents, 'Elemental Fury')
  return {
    ...spell,
    damageMult,
    bonusCrit: spell.bonusCrit + (bolt ? 3 * rank(talents, 'Call of Thunder') : 0),
    critMultiplier: 1 + (spell.critMultiplier - 1) * (1 + (20 * fury) / 100),
  }
}

/**
 * The build's changes to an ability row (shaman.md#talents): the mana cost cuts, added together as the
 * paladin's are [?] (Convection −2% a rank to shocks and Lightning Bolt; Shamanistic Focus −45% to
 * shocks), Reverberation's −0.2 s a rank to the shocks' cooldown, Elemental Alacrity's cut to Lightning
 * Bolt's cast (170 / 330 / 500 ms), Maelstrom Weapon's stacks on Lightning Bolt, and Improved
 * Stormstrike's regeneration aura on Stormstrike at 2/2 (1/2's 50% chance isn't simulated). A cost
 * rounds down to whole mana.
 */
export function withTalents(ability: AbilityDef, talents: TalentRanks, shockBonusPct = 0): AbilityDef {
  const shock = ability.id === EARTH_SHOCK.id || ability.id === FROST_SHOCK.id
  const bolt = ability.id === LIGHTNING_BOLT.id
  let costCut = 0
  if (shock || bolt) costCut += 2 * rank(talents, 'Convection')
  if (shock && rank(talents, 'Shamanistic Focus') > 0) costCut += 45
  const out: AbilityDef = {
    ...ability,
    costTenths: 10 * Math.floor((ability.costTenths / 10) * (1 - costCut / 100) + 1e-9),
    ...(ability.spellDef ? { spellDef: withSpellTalents(ability.spellDef, talents, shockBonusPct) } : {}),
  }
  if (shock) out.cooldownMs = ability.cooldownMs - 200 * rank(talents, 'Reverberation')
  if (bolt) {
    out.castMs = ability.castMs - ([0, 170, 330, 500][rank(talents, 'Elemental Alacrity')] ?? 500)
    const pct = maelstromPctPerStack(talents)
    if (pct > 0) Object.assign(out, { stackAuraId: MAELSTROM_AURA.id, stackCastPct: pct, stackCostPct: pct })
  }
  if (ability.id === STORMSTRIKE.id && rank(talents, 'Improved Stormstrike') >= 2) out.selfAuraSpec = IMPROVED_STORMSTRIKE_AURA
  return out
}
