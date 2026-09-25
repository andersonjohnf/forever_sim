// The Balance druid's spells, talents and procs as data (docs/classes/druid.md §11): Starfire, Wrath,
// Moonfire, Insect Swarm, Faerie Fire and Innervate on the caster core (docs/mechanics/spells.md §12),
// Moonkin Form's own effects, and the talents that change them.
//
// Numbers are the Forever client's (src/data/client/spells.json and talents.json, build 1.60.1.69913),
// written out here so the app bundle doesn't carry the client dataset; balance.test.ts checks each
// against it. These are the base rows: `withBalanceTalents` applies the build's talents (Improved
// Wrath, Improved Starfire, Moonglow, Improved Moonfire, Genesis, Nature's Splendor, Vengeance,
// Eclipse) when the plan resolves the rotation. A rank learned below 60 grows by its per-level points,
// and a range is base × (1 ± variance / 2), as the paladin's and shaman's (paladin.md#conventions-used-below).
import { CRIT_MULTIPLIER, GCD_MS, spellCritMultiplier } from '../../core/formulas'
import type { AuraSpec, Effect, ProcSpec } from '../../effects/types'
import { type AbilityDef, CASTER_ROW, type SpellDef } from '../../plan/types'
import type { RulesProfile } from '../../rules/profiles'
import { atLevel60, spread } from '../paladin/spells'
import { CLEARCASTING, DRUID_BASE_MANA, OMEN_OF_CLARITY_ICD_MS, OMEN_OF_CLARITY_PPM } from './abilities'
import type { TalentRanks } from './modifiers'

const DOC = 'docs/classes/druid.md'
const SPELLS_DOC = `${DOC}#112-spells`
const TALENTS_DOC = `${DOC}#113-talents-and-procs`

const rank = (talents: TalentRanks, name: string) => talents.get(name) ?? 0

// --- Spells (§11.2) ------------------------------------------------------------------------------

/** What every Balance damage spell starts from: the magic class (the spell table), spell crit ×1.5, triggering procs. */
const SPELL = {
  defense: 'magic',
  noActiveDefense: false,
  alwaysHit: false,
  triggersProcs: true,
  weaponPercent: 0,
  normalized: false,
  critMultiplier: CRIT_MULTIPLIER.spell,
  bonusCrit: 0,
  damageMult: 1,
  threatMult: 1,
  threatBonus: 0,
  takenScale: 0,
} as const

/** A rank's range at level 60: base × (1 ± variance / 2), plus its per-level points up to 60 (paladin.md#conventions-used-below). */
const range = (base: number, variance: number, perLevel: number, baseLevel: number, maxLevel: number) => {
  const grow = atLevel60(0, perLevel, baseLevel, maxLevel)
  const [min, max] = spread(base, variance)
  return { min: min + grow, max: max + grow }
}

/**
 * Starfire r7 (25298): 381 base points, variance 0.16296296, +2.4 a level from 60, so 349.96–412.04 at
 * 60; coefficient 1.0; Arcane (Classic Era: 496–584) [F] [client] (SpellEffect, SpellLevels,
 * 1.60.1.69913; §11.2).
 */
export const STARFIRE_SPELL: SpellDef = {
  ...SPELL,
  id: 'starfire',
  name: 'Starfire',
  icon: 'spell_arcane_starfire',
  school: 'arcane',
  ...range(381, 0.16296296, 2.4, 60, 66),
  spCoefficient: 1,
}

/**
 * Wrath r8 (9912): 91 base points, variance 0.112, +1 a level from 54 to 60, so 91.90–102.10 at 60;
 * coefficient 0.571; Nature (Classic Era: 236–264) [F] [client] (SpellEffect, SpellLevels, 1.60.1.70009;
 * §11.2). 1.60.1.70009 raised every rank about 50% (rank 8 was 61 + 0.7 a level, 61.78–68.62). Its
 * travel time (speed 20) isn't simulated (spells.md §4).
 */
export const WRATH_SPELL: SpellDef = {
  ...SPELL,
  id: 'wrath',
  name: 'Wrath',
  icon: 'spell_nature_abolishmagic',
  school: 'nature',
  ...range(91, 0.112, 1, 54, 60),
  spCoefficient: 0.571,
}

/** Moonfire's DoT: 60 every 3 s for 12 s, 0.13 a tick (9835 #0) [F] [client] (SpellEffect, SpellDuration, 1.60.1.69913). */
export const MOONFIRE_TICK = 60
export const MOONFIRE_TICK_MS = 3000
export const MOONFIRE_TICKS = 4

/**
 * Moonfire r10 (9835): a hit of 135 base points, variance 0.15609756, +2.3 a level from 58 to 63, so
 * 129.06–150.14 at 60, coefficient 0.15; and a DoT of 60 every 3 s for 12 s at 0.13 a tick, whose
 * ticks carry the periodic-crit flag (SpellMisc Attributes[8] 0x200); Arcane [F] [client]
 * (SpellEffect, SpellMisc, SpellLevels, SpellDuration, 1.60.1.69913; §11.2). One hit roll for both
 * (spells.md §7). Not binary: its effects are damage only.
 */
export const MOONFIRE_SPELL: SpellDef = {
  ...SPELL,
  id: 'moonfire',
  name: 'Moonfire',
  icon: 'spell_nature_starfall',
  school: 'arcane',
  ...range(135, 0.15609756, 2.3, 58, 63),
  spCoefficient: 0.15,
  dotTicks: MOONFIRE_TICKS,
  dotTickMs: MOONFIRE_TICK_MS,
  dotTickDamage: MOONFIRE_TICK,
  dotSpCoefficient: 0.13,
  dotCanCrit: true,
}

/** Insect Swarm's DoT: 31 every 2 s for 12 s, 0.158 a tick (24977 #0) [F] [client] (SpellEffect, SpellDuration, 1.60.1.69913). */
export const INSECT_SWARM_TICK = 31
export const INSECT_SWARM_TICK_MS = 2000
export const INSECT_SWARM_TICKS = 6

/**
 * Insect Swarm r5 (24977), the talent's spell: a pure DoT of 31 every 2 s for 12 s at 0.158 a tick,
 * Nature, whose ticks carry the periodic-crit flag, and −2% hit on the target (#1, aura 54), which
 * makes it binary: resisted whole or not at all (spells.md §3) [F] [client] (SpellEffect, SpellMisc,
 * SpellDuration, 1.60.1.69913; §11.2). Classic Era's rank 5 is 66 × 6 [C].
 */
export const INSECT_SWARM_SPELL: SpellDef = {
  ...SPELL,
  id: 'insectSwarm',
  name: 'Insect Swarm',
  icon: 'spell_nature_insectswarm',
  school: 'nature',
  min: 0,
  max: 0,
  spCoefficient: 0,
  binary: true,
  dotTicks: INSECT_SWARM_TICKS,
  dotTickMs: INSECT_SWARM_TICK_MS,
  dotTickDamage: INSECT_SWARM_TICK,
  dotSpCoefficient: 0.158,
  dotCanCrit: true,
}

/** A mana cost as a row's `costTenths` (paid from mana, in tenths). */
const mana = (cost: number) => ({ costTenths: 10 * cost })

/**
 * The fields of a Balance spell cast as an ability: mana, the 1.5 s GCD (`StartRecoveryTime` 1500),
 * which Nature's Grace can cut (`gcdCut`: its class mask has every Balance spell, Faerie Fire
 * included, not Innervate), no cooldown [F] [client] (SpellCooldowns, 1.60.1.69913; §11.2).
 */
const BALANCE = {
  ...CASTER_ROW,
  resource: 'mana',
  cooldownMs: 0,
  gcdMs: GCD_MS,
  castMs: 0,
  offHand: false,
  aura: null,
  gcdCut: true,
} as const

/**
 * Starfire r7: 340 mana, a 3.5 s cast that casting speed shortens [F] [client] (SpellPower,
 * SpellCastTimes, 1.60.1.69913). Clearcasting pays for it (16870's class mask). Eclipse's charges cut
 * its cast (`withBalanceTalents`).
 */
export const STARFIRE: AbilityDef = {
  ...BALANCE,
  id: 'starfire',
  name: 'Starfire',
  icon: 'spell_arcane_starfire',
  kind: 'spell',
  ...mana(340),
  castMs: 3500,
  castHasted: true,
  clearcastable: true,
  spellDef: STARFIRE_SPELL,
}

/**
 * Wrath r8: 120 mana (Classic Era 180), a 2 s cast [F] [client] (SpellPower, SpellCastTimes,
 * 1.60.1.69913). Clearcasting doesn't pay for it: 16870's class mask leaves it out [F].
 */
export const WRATH: AbilityDef = {
  ...BALANCE,
  id: 'wrath',
  name: 'Wrath',
  icon: 'spell_nature_abolishmagic',
  kind: 'spell',
  ...mana(120),
  castMs: 2000,
  castHasted: true,
  spellDef: WRATH_SPELL,
}

/**
 * A DoT's marker on the boss (spells.md §7), for the rotation's upkeep: up from the application until
 * the last tick. `withBalanceTalents` sets its duration from the ticks.
 */
const marker = (id: string, name: string, ms: number): AuraSpec => ({ id, name, durationMs: ms, mods: {} })

/** Moonfire r10: 375 mana, instant [F] [client] (SpellPower, 1.60.1.69913). Clearcasting pays for it. */
export const MOONFIRE: AbilityDef = {
  ...BALANCE,
  id: 'moonfire',
  name: 'Moonfire',
  icon: 'spell_nature_starfall',
  kind: 'spell',
  ...mana(375),
  clearcastable: true,
  aura: marker('moonfire', 'Moonfire', MOONFIRE_TICKS * MOONFIRE_TICK_MS),
  spellDef: MOONFIRE_SPELL,
}

/** Insect Swarm r5: 160 mana, instant [F] [client] (SpellPower, 1.60.1.69913). Clearcasting pays for it. */
export const INSECT_SWARM: AbilityDef = {
  ...BALANCE,
  id: 'insectSwarm',
  name: 'Insect Swarm',
  icon: 'spell_nature_insectswarm',
  kind: 'spell',
  ...mana(160),
  clearcastable: true,
  aura: marker('insectSwarm', 'Insect Swarm', INSECT_SWARM_TICKS * INSECT_SWARM_TICK_MS),
  spellDef: INSECT_SWARM_SPELL,
}

/** Faerie Fire's armor, −505 at rank 4 (9907 #0, aura 22) [F] (druid.md §3.8). */
const FAERIE_FIRE_ARMOR = 505

/**
 * Faerie Fire r4 (9907) in Moonkin Form: 115 mana, the 1.5 s GCD, −505 armor on the boss for 40 s; a
 * Nature spell that rolls spell hit (combat-tables §9) [F] [client] (SpellEffect, SpellPower,
 * SpellCooldowns, 1.60.1.69913; §11.2). Only the raid's attacks feel the armor: a moonkin's spells
 * ignore it, so it's a duty, not damage.
 */
export const FAERIE_FIRE_MOONKIN: AbilityDef = {
  ...BALANCE,
  id: 'faerieFire',
  name: 'Faerie Fire',
  icon: 'spell_nature_faeriefire',
  kind: 'cast',
  ...mana(115),
  spellHit: true,
  aura: { id: 'faerieFire', name: 'Faerie Fire', durationMs: 40000, mods: { targetArmor: FAERIE_FIRE_ARMOR } },
}

/** Innervate's mana: 5% of base mana, 62 (`PowerCostPct` 5, rounded down [?]) [F] [client] (SpellPower, 1.60.1.69913). */
export const INNERVATE_MANA = Math.floor((DRUID_BASE_MANA * 5) / 100)

/**
 * Innervate (29166) on yourself: 62 mana, the 1.5 s GCD, a 6 min cooldown; for 20 s, +400% Spirit
 * regeneration (aura 110) and all of it inside the five-second rule (aura 134, 100) [F] [client]
 * (SpellEffect, SpellCooldowns, SpellDuration, SpellShapeshift, 1.60.1.69913; §11.4). Castable in
 * Moonkin Form (its shapeshift mask has form 31). Nature's Grace's class mask leaves it out.
 */
export const INNERVATE: AbilityDef = {
  ...BALANCE,
  id: 'innervate',
  name: 'Innervate',
  icon: 'spell_nature_lightning',
  kind: 'cast',
  gcdCut: false,
  ...mana(INNERVATE_MANA),
  cooldownMs: 360000,
  aura: { id: 'innervate', name: 'Innervate', durationMs: 20000, mods: { spiritRegen: 400, castingRegen: 100 } },
}

// --- Talents (§11.3) -------------------------------------------------------------------------------

/** Improved Wrath: −0.1 s cast (−100 ms) and −10% mana a rank on Wrath (16814's curves) [F] [client]. */
export const IMPROVED_WRATH_MS_PER_RANK = 100
export const IMPROVED_WRATH_COST_PCT_PER_RANK = 10
/** Improved Starfire: −0.1 s cast a rank on Starfire (16850's curve; its stun does nothing to a boss) [F] [client]. */
export const IMPROVED_STARFIRE_MS_PER_RANK = 100
/** Moonglow: −8/17/25% mana on Wrath, Moonfire, Starfire and Insect Swarm (16845's curve and class mask) [F] [client]. */
export const MOONGLOW_PCT = [0, 8, 17, 25] as const
/** Improved Moonfire: +5% crit and +5% damage a rank on Moonfire, its hit and its ticks (16821's curves) [F] [client]. */
export const IMPROVED_MOONFIRE_PCT_PER_RANK = 5
/** Genesis: +1% periodic damage a rank (1223081's curve), Moonfire's and Insect Swarm's ticks among them [F] [client]. */
export const GENESIS_PCT_PER_RANK = 1
/** Nature's Splendor: Moonfire +3 s (one tick more), Insect Swarm +2 s (one more) (1223083) [F] [client]. */
export const NATURES_SPLENDOR_MS = { moonfire: 3000, insectSwarm: 2000 } as const
/** Vengeance: +20% crit damage bonus a rank on the Arcane and Nature spells, so ×2.0 at 5/5 (16909's curve and class mask) [F] [client]. */
export const VENGEANCE_PCT_PER_RANK = 20
/** Eclipse: each charge takes 170/330/500 ms off Starfire's cast by rank (408248's curve) [F] [client]. */
export const ECLIPSE_MS = [0, 170, 330, 500] as const

/** The spells the Balance talents act on (their class masks: Wrath, Moonfire, Starfire, Insect Swarm). */
const BALANCE_SPELLS: ReadonlySet<string> = new Set(['starfire', 'wrath', 'moonfire', 'insectSwarm'])

/**
 * A spell's mana after its talents' percentages, which multiply [?] (druid.md §2.3's rule for spell
 * mods), in whole mana, rounded down [?] (§11.3): Wrath 120 × 0.5 × 0.75 = 45 at Improved Wrath 5/5
 * and Moonglow 3/3; Moonfire 375 × 0.75 = 281.
 */
export const balanceCost = (cost: number, pcts: readonly number[]) => Math.floor(pcts.reduce((c, pct) => c * (1 - pct / 100), cost) + 1e-9)

/**
 * The ability as this build casts it (§11.3): Improved Wrath's and Improved Starfire's cast times,
 * Improved Wrath's and Moonglow's mana, Improved Moonfire's damage and crit, Genesis on the ticks,
 * Nature's Splendor's longer DoTs, Vengeance's crit damage, and Eclipse's cut on Starfire. Any other
 * ability comes back unchanged.
 */
export function withBalanceTalents(def: AbilityDef, talents: TalentRanks): AbilityDef {
  if (!BALANCE_SPELLS.has(def.id) || !def.spellDef) return def
  const spell: SpellDef = { ...def.spellDef }
  const out: AbilityDef = { ...def }
  const pcts: number[] = []
  const moonglow = MOONGLOW_PCT[Math.min(3, rank(talents, 'Moonglow'))]
  if (def.id === 'wrath') {
    const r = rank(talents, 'Improved Wrath')
    out.castMs = def.castMs - IMPROVED_WRATH_MS_PER_RANK * r
    pcts.push(IMPROVED_WRATH_COST_PCT_PER_RANK * r)
  }
  if (def.id === 'starfire') {
    out.castMs = def.castMs - IMPROVED_STARFIRE_MS_PER_RANK * rank(talents, 'Improved Starfire')
    const eclipse = ECLIPSE_MS[Math.min(3, rank(talents, 'Eclipse'))]
    if (eclipse > 0) Object.assign(out, { chargeAuraId: ECLIPSE_AURA.id, chargeCastMs: eclipse })
  }
  pcts.push(moonglow)
  out.costTenths = 10 * balanceCost(def.costTenths / 10, pcts)
  if (def.id === 'moonfire') {
    const r = rank(talents, "Improved Moonfire")
    spell.bonusCrit += IMPROVED_MOONFIRE_PCT_PER_RANK * r
    spell.damageMult *= 1 + (IMPROVED_MOONFIRE_PCT_PER_RANK * r) / 100
  }
  // Genesis on the ticks, folded into their base and coefficient: the same product (spells.md §5).
  const genesis = 1 + (GENESIS_PCT_PER_RANK * rank(talents, 'Genesis')) / 100
  if ((spell.dotTicks ?? 0) > 0) {
    spell.dotTickDamage = (spell.dotTickDamage ?? 0) * genesis
    spell.dotSpCoefficient = (spell.dotSpCoefficient ?? 0) * genesis
    if (rank(talents, "Nature's Splendor") > 0 && (def.id === 'moonfire' || def.id === 'insectSwarm')) {
      spell.dotTicks = spell.dotTicks! + NATURES_SPLENDOR_MS[def.id] / spell.dotTickMs!
    }
    if (def.aura) out.aura = { ...def.aura, durationMs: spell.dotTicks! * spell.dotTickMs! }
  }
  spell.critMultiplier = spellCritMultiplier(VENGEANCE_PCT_PER_RANK * rank(talents, 'Vengeance'))
  out.spellDef = spell
  return out
}

// --- Procs (§11.3) --------------------------------------------------------------------------------

/**
 * Nature's Grace's blessing (16886): +10% casting speed (aura 65) and a 10% shorter GCD for the
 * Balance spells (aura 108, `StartRecoveryTime`, class mask with Faerie Fire) for 3 s [F] [client]
 * (SpellEffect, SpellDuration, 1.60.1.69913). Classic Era's took 0.5 s off the next cast [C].
 */
export const NATURES_GRACE_AURA: AuraSpec = { id: 'naturesGrace', name: 'Nature’s Grace', durationMs: 3000, mods: { castHaste: 10, gcdPct: 10 } }

/**
 * Nature's Grace (16880): every non-periodic spell crit (the `spellCrit` trigger, which ticks never
 * fire) puts its blessing up, at 100% (`ProcChance` 100) [F] [client] (SpellAuraOptions, 1.60.1.69913).
 */
export const NATURES_GRACE: ProcSpec = {
  id: 'naturesGrace',
  name: 'Nature’s Grace',
  icon: 'spell_nature_naturesblessing',
  trigger: 'spellCrit',
  from: 'any',
  chance: { pct: 100 },
  action: { kind: 'aura', aura: NATURES_GRACE_AURA },
  docRef: TALENTS_DOC,
}

/**
 * Eclipse's charges: up to 4, for 15 s; each takes Eclipse's ms off one Starfire's cast (408248's
 * tooltip; its effects are server-side dummies) [F] tooltip, mechanics [?] (§11.3, OQ-B3).
 */
export const ECLIPSE_AURA: AuraSpec = { id: 'eclipse', name: 'Eclipse', durationMs: 15000, maxStacks: 4, mods: {} }

/**
 * Eclipse: a Wrath that lands adds 2 charges ("your next 2 Starfire spells"), refreshing their 15 s
 * [F] tooltip; that the landing (not the cast) does it, and the refresh, are [?] (§11.3, OQ-B3).
 */
export const ECLIPSE: ProcSpec = {
  id: 'eclipse',
  name: 'Eclipse',
  icon: 'ability_druid_eclipse',
  trigger: 'spellLanded',
  from: 'any',
  chance: { pct: 100 },
  fromSpell: 'wrath',
  action: { kind: 'aura', aura: ECLIPSE_AURA, stacks: 2 },
  docRef: TALENTS_DOC,
}

/**
 * Omen of Clarity on spells (16864: "Your spells and attacks"; §11.3): Clearcasting from a landed
 * spell at 2 procs per minute of casting [?] (the melee rate, §2.7, OQ-B1), so a 3 s Starfire's chance
 * is 10%. Moonkin Form doubles the chance (24858 #4: +100% `ProcChance`) and halves the 10 s
 * `ProcCategoryRecovery` (#5: −50% proc cooldown) [F] [client] (SpellEffect, SpellAuraOptions,
 * 1.60.1.69913).
 */
export function omenOfClaritySpells(moonkin: boolean): ProcSpec {
  return {
    id: 'omenOfClaritySpells',
    name: 'Omen of Clarity',
    icon: 'spell_nature_crystalball',
    trigger: 'spellLanded',
    from: 'any',
    chance: { ppmCast: OMEN_OF_CLARITY_PPM * (moonkin ? 2 : 1) },
    icdMs: OMEN_OF_CLARITY_ICD_MS * (moonkin ? 0.5 : 1),
    action: { kind: 'aura', aura: CLEARCASTING },
    docRef: TALENTS_DOC,
  }
}

// --- Moonkin Form (§11.1) ---------------------------------------------------------------------------

/** Moonkin Aura (24907, which Moonkin Form casts): +3% crit to the party, the druid included [F] (spells.md §9). */
export const MOONKIN_AURA_CRIT = 3
/** Moonkin Form's item armor, +360% (the tooltip; no client row found) [F] tooltip; it does nothing to a caster's damage. */
export const MOONKIN_ITEM_ARMOR_PCT = 360

/** Buff catalogue id of Moonkin Aura, which a druid in Moonkin Form provides itself. */
export const MOONKIN_AURA_BUFF = 'moonkinAura'

/**
 * Moonkin Form's own effects, bound to it (§11.1): Moonkin Aura's +3% crit, all crit (aura 290) in
 * `forever`, spell crit only in `classicEra` (aura 57), as the buff catalogue's columns; and its
 * item armor.
 */
export function moonkinFormEffects(profile: RulesProfile): Effect[] {
  const moonkin = { form: ['moonkin'] } as const
  return [
    ...(profile.catalogue.column === 'classicEra' ? [] : [{ kind: 'stat', stat: 'crit', value: MOONKIN_AURA_CRIT, when: moonkin } as const]),
    { kind: 'stat', stat: 'spellCrit', value: MOONKIN_AURA_CRIT, when: moonkin },
    { kind: 'itemArmorPct', pct: MOONKIN_ITEM_ARMOR_PCT, when: moonkin },
  ]
}

export const BALANCE_DOC = { spells: SPELLS_DOC, talents: TALENTS_DOC }
