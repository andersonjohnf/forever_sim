// The mage's talents (docs/classes/mage.md#talents): the passives as effects and procs, and the
// changes the build makes to the spell and ability rows. Values are the Forever client's rank curves
// (TraitDefinitionEffectPoints, src/data/client/talents.json, build 1.60.1.69913), checked by
// data.test.ts. Talents that do nothing for a damage dealer on a boss (range, threat, armor, the
// Frost Nova, Blizzard, Cone of Cold and Flamestrike talents, Impact's stun) or that the sim doesn't
// model yet (Shatter, Fingers of Frost, Missile Barrage, Arcane Blast's stacks) have no entry:
// mage.md says which.
import { spellCritMultiplier } from '../../core/formulas'
import type { AuraSpec, Effect, ProcSpec } from '../../effects/types'
import { type AbilityDef, schoolMask, type SpellDef } from '../../plan/types'
import { FIRE_BLAST, FIREBALL, FROSTBOLT, PRESENCE_OF_MIND_AURA, PYROBLAST } from './abilities'

const DOC = 'docs/classes/mage.md'

/** Talent ranks by name (classes/index.ts talentRanksByName). */
export type TalentRanks = ReadonlyMap<string, number>

export const rank = (talents: TalentRanks, name: string) => talents.get(name) ?? 0

/** The mage's Fire spells, Frost spells and Arcane spells in the sim, by plan spell id. */
const FIRE = new Set(['fireball', 'scorch', 'fireBlast', 'pyroblast'])
const FROST = new Set(['frostbolt'])
const ARCANE = new Set(['arcaneMissiles', 'arcaneBlast'])

/**
 * Clearcasting (12536) [F] [client]: the next damage spell costs no mana (−100% cost), one charge, 15 s.
 * The plan makes it the free-cast aura (`Plan.freeCastAura`), which a mage's damage spells use up.
 */
export const CLEARCASTING: AuraSpec = { id: 'clearcasting', name: 'Clearcasting', durationMs: 15000, mods: {} }

/**
 * Improved Scorch's Fire Vulnerability (11095 → 22959) [F] [client] (SpellEffect, SpellAuraOptions,
 * 1.60.1.69913): +3% Fire damage the boss takes from you a stack (aura 270: the caster's own), up to 5,
 * 30 s; each landed Scorch has a 33 / 67 / 100% chance by rank to add one (Classic Era: anyone's Fire,
 * aura 87). It's read at each Ignite tick too (docs/classes/mage.md#improved-scorch).
 */
export const FIRE_VULNERABILITY: AuraSpec = {
  id: 'fireVulnerability',
  name: 'Fire Vulnerability',
  durationMs: 30000,
  maxStacks: 5,
  mods: { schoolMask: schoolMask(['fire']), schoolTaken: 3 },
}
const IMPROVED_SCORCH_CHANCE = [0, 33, 67, 100]

/**
 * Hot Streak (400624 → 400625) [F] [client]: a non-periodic crit of Fireball, Fire Blast or Scorch
 * (and Frostfire Bolt) adds a stack, up to 3, 15 s; each cuts Pyroblast's cast time by 25%, and
 * Pyroblast uses them all (charges 1) [?] (docs/classes/mage.md#hot-streak).
 */
export const HOT_STREAK: AuraSpec = { id: 'hotStreak', name: 'Hot Streak', durationMs: 15000, maxStacks: 3, mods: {} }
export const HOT_STREAK_CAST_PCT = 25

/**
 * Winter's Chill (11180 → 12579) [F] [client]: each landed Frost damage spell has a 20% chance a rank
 * to add a stack, up to 1 a rank (5 at 5/5), 15 s; each gives "your Ice Lance and Frostbolt" +2% crit
 * against the target (aura 308, class mask: those two only, the caster's own; Classic Era: every Frost
 * spell from anyone). Its crit is the spell's `critAura` (docs/classes/mage.md#winters-chill).
 */
export const wintersChill = (r: number): AuraSpec => ({ id: 'wintersChill', name: 'Winter’s Chill', durationMs: 15000, maxStacks: r, mods: {} })
export const WINTERS_CHILL_CRIT_PER_STACK = 2

/** A spell proc of the mage's (docs/mechanics/spells.md §10). */
const spellProc = (id: string, name: string, icon: string, trigger: 'spellLanded' | 'spellCrit', rest: Partial<ProcSpec> & Pick<ProcSpec, 'action'>): ProcSpec => ({
  id,
  name,
  icon,
  trigger,
  from: 'any',
  chance: { pct: 100 },
  docRef: `${DOC}#talents`,
  ...rest,
})

/**
 * The passives as effects, by talent name (mage.md#talents). Each value is its rank curve's at rank r
 * [F] [client] (TraitDefinitionEffectPoints, CurvePoint, SpellEffect, 1.60.1.69913).
 */
export const TALENT_EFFECTS: Record<string, (r: number) => Effect[]> = {
  // 11222: op 16, +1% hit a rank with Arcane spells (Classic Era: resist chance −2% a rank).
  'Arcane Focus': (r) => [{ kind: 'schoolHit', schools: ['arcane'], pct: r }],
  // 11210: aura 123, the target's resistance to all your spells −8 / −15 (spell penetration).
  'Arcane Subtlety': (r) => [{ kind: 'stat', stat: 'spellPen', value: [0, 8, 15][r] ?? 15 }],
  // 11213: a 2% chance a rank, when a damage spell hits, of Clearcasting; at most once a second (ProcCategoryRecovery 1000).
  'Arcane Concentration': (r) => [
    {
      kind: 'proc',
      proc: spellProc('arcaneConcentration', 'Clearcasting', 'spell_shadow_manaburn', 'spellLanded', {
        chance: { pct: 2 * r },
        icdMs: 1000,
        action: { kind: 'aura', aura: CLEARCASTING },
      }),
    },
  ],
  // 11232: aura 137, +2% Intellect a rank (Classic Era: +2% maximum mana a rank); its Arcane crit bonus is withSpellTalents'.
  'Arcane Mind': (r) => [{ kind: 'mult', stat: 'int', pct: 2 * r }],
  // 15058: aura 290 (all crit), +1% a rank; its damage is withSpellTalents'.
  'Arcane Instability': (r) => [
    { kind: 'stat', stat: 'crit', value: r },
    { kind: 'stat', stat: 'spellCrit', value: r },
  ],
  // 29438: op 16, +1% hit a rank with Fire and Frost spells (Classic Era: resist chance −2% a rank, 3 ranks).
  'Elemental Precision': (r) => [{ kind: 'schoolHit', schools: ['fire', 'frost'], pct: r }],
  // 11115: op 7, +2% crit a rank on the Fire spells.
  'Critical Mass': (r) => [{ kind: 'schoolCrit', schools: ['fire'], pct: 2 * r }],
  // 11119: 8% a rank of a Fire spell's crit, over 4 s: the rolling Ignite (mage.md#ignite).
  Ignite: (r) => [
    {
      kind: 'proc',
      proc: spellProc('ignite', 'Ignite', 'spell_fire_incinerate', 'spellCrit', {
        schools: ['fire'],
        action: { kind: 'ignite', pct: 8 * r, ticks: 2, tickMs: 2000, school: 'fire' },
        docRef: `${DOC}#ignite`,
      }),
    },
  ],
  'Improved Scorch': (r) => [
    {
      kind: 'proc',
      proc: spellProc('improvedScorch', 'Fire Vulnerability', 'spell_fire_soulburn', 'spellLanded', {
        fromSpell: 'scorch',
        chance: { pct: IMPROVED_SCORCH_CHANCE[r] ?? 100 },
        action: { kind: 'aura', aura: FIRE_VULNERABILITY },
        docRef: `${DOC}#improved-scorch`,
      }),
    },
  ],
  // 29074: 10% a rank of the spell's base mana cost back on a Fire or Frost crit (29077).
  'Master of Elements': (r) => [
    {
      kind: 'proc',
      proc: spellProc('masterOfElements', 'Master of Elements', 'spell_fire_masterofelements', 'spellCrit', {
        schools: ['fire', 'frost'],
        action: { kind: 'manaOfCost', pct: 10 * r },
      }),
    },
  ],
  'Hot Streak': () =>
    ['fireball', 'fireBlast', 'scorch'].map((spell) => ({
      kind: 'proc' as const,
      proc: spellProc(`hotStreak.${spell}`, 'Hot Streak', 'ability_mage_hotstreak', 'spellCrit', {
        fromSpell: spell,
        action: { kind: 'aura', aura: HOT_STREAK },
        docRef: `${DOC}#hot-streak`,
      }),
    })),
  "Winter's Chill": (r) => [
    {
      kind: 'proc',
      proc: spellProc('wintersChill', 'Winter’s Chill', 'spell_frost_chillingblast', 'spellLanded', {
        schools: ['frost'],
        chance: { pct: 20 * r },
        action: { kind: 'aura', aura: wintersChill(r) },
        docRef: `${DOC}#winters-chill`,
      }),
    },
  ],
}

/**
 * The build's changes to a spell (mage.md#talents) [F] [client] (SpellEffect class masks,
 * TraitDefinitionEffectPoints, 1.60.1.69913): Fire Power +2% a rank to the Fire spells and their DoTs;
 * Piercing Ice +2% a rank to Frostbolt; Arcane Instability +1% a rank to every damage spell;
 * Incineration +2% crit a rank to Scorch, Fire Blast and Arcane Blast; Arcane Impact +2% crit a rank
 * to Arcane Missiles and Arcane Blast; Ice Shards and Arcane Mind +20% a rank to the crit bonus of the
 * Frost and the Arcane spells (×2.0 at 5/5); Winter's Chill's stacks on Frostbolt.
 */
export function withSpellTalents(spell: SpellDef, talents: TalentRanks): SpellDef {
  const id = spell.id
  const fire = FIRE.has(id)
  const frost = FROST.has(id)
  const arcane = ARCANE.has(id)
  let damageMult = spell.damageMult * (1 + rank(talents, 'Arcane Instability') / 100)
  if (fire) damageMult *= 1 + (2 * rank(talents, 'Fire Power')) / 100
  if (frost) damageMult *= 1 + (2 * rank(talents, 'Piercing Ice')) / 100
  let bonusCrit = spell.bonusCrit
  if (id === 'scorch' || id === 'fireBlast' || id === 'arcaneBlast') bonusCrit += 2 * rank(talents, 'Incineration')
  if (arcane) bonusCrit += 2 * rank(talents, 'Arcane Impact')
  const critBonusPct = frost ? 20 * rank(talents, 'Ice Shards') : arcane ? 20 * rank(talents, 'Arcane Mind') : 0
  const chill = rank(talents, "Winter's Chill")
  return {
    ...spell,
    damageMult,
    bonusCrit,
    critMultiplier: spellCritMultiplier(critBonusPct),
    ...(id === 'frostbolt' && chill > 0 ? { critAura: { aura: 'wintersChill', pctPerStack: WINTERS_CHILL_CRIT_PER_STACK } } : {}),
  }
}

/**
 * The build's changes to an ability row (mage.md#talents) [F] [client]: Improved Fireball and Improved
 * Frostbolt −0.1 s cast a rank; Wake of Fire −1 s a rank off Fire Blast's cooldown; Frost Channeling
 * −5% a rank off Frostbolt's cost, rounded down to whole mana; Hot Streak's stacks on Pyroblast;
 * Presence of Mind on every spell with a cast time; and the spell's own changes.
 */
export function withTalents(ability: AbilityDef, talents: TalentRanks): AbilityDef {
  const out: AbilityDef = {
    ...ability,
    ...(ability.spellDef ? { spellDef: withSpellTalents(ability.spellDef, talents) } : {}),
    ...(ability.tickSpellDef ? { tickSpellDef: withSpellTalents(ability.tickSpellDef, talents) } : {}),
  }
  if (ability.id === FIREBALL.id) out.castMs = ability.castMs - 100 * rank(talents, 'Improved Fireball')
  if (ability.id === FROSTBOLT.id) {
    out.castMs = ability.castMs - 100 * rank(talents, 'Improved Frostbolt')
    out.costTenths = 10 * Math.floor((ability.costTenths / 10) * (1 - (5 * rank(talents, 'Frost Channeling')) / 100) + 1e-9)
  }
  if (ability.id === FIRE_BLAST.id) out.cooldownMs = ability.cooldownMs - 1000 * rank(talents, 'Wake of Fire')
  if (ability.id === PYROBLAST.id && rank(talents, 'Hot Streak') > 0) Object.assign(out, { stackAuraId: HOT_STREAK.id, stackCastPct: HOT_STREAK_CAST_PCT, stackCostPct: 0 })
  if (ability.castMs > 0 && rank(talents, 'Presence of Mind') > 0) out.instantAuraId = PRESENCE_OF_MIND_AURA.id
  return out
}
