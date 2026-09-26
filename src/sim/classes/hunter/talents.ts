// The hunter's talents (docs/classes/hunter.md §4): the passives as effects, the procs, and the
// changes the build makes to the ability and spell rows and to the pet. Values are the Forever
// client's rank curves (TraitDefinitionEffectPoints, src/data/client/talents.json, build
// 1.60.1.69913), checked by data.test.ts. Talents that do nothing for a damage dealer on one boss
// (traps, stings the sim doesn't use, movement, pet survival, melee abilities) have no entry:
// hunter.md §4 says which.
import type { AuraSpec, Effect, ProcSpec } from '../../effects/types'
import type { AbilityDef, SpellDef } from '../../plan/types'
import type { CreatureType } from '../../types'
import { AIMED_SHOT, ARCANE_SHOT, MULTI_SHOT, QUICK_SHOTS_AURA, RAPID_FIRE, SERPENT_STING } from './abilities'

const DOC = 'docs/classes/hunter.md'

/** Talent ranks by name (classes/index.ts talentRanksByName). */
export type TalentRanks = ReadonlyMap<string, number>

export const rank = (talents: TalentRanks, name: string) => talents.get(name) ?? 0

/**
 * Lone Wolf (415370): +20% to all your damage (aura 79, all schools) while you have no active pet
 * [F]. A build with it fights without its pet; one without it keeps its pet out
 * (docs/classes/hunter.md#6-pets).
 */
export const LONE_WOLF_PCT = 20
export const hasPet = (talents: TalentRanks) => rank(talents, 'Lone Wolf') === 0

/**
 * Improved Tracking (24293): +1% a rank to all damage against the creature type you track (aura 107
 * misc 12 on the tracking spells) [F]; you track the boss's type whenever it's one of these seven.
 */
export const TRACKABLE: readonly CreatureType[] = ['beast', 'demon', 'dragonkin', 'elemental', 'giant', 'humanoid', 'undead']

/**
 * Deadly Aspects (19552): +2% a rank (curve 82832: 2 … 10) to the chance of Aspect of the Hawk's
 * proc (aura 107 misc 18 on its class mask), Quick Shots on an Auto Shot that lands [F]. Classic
 * Era's Improved Aspect of the Hawk gave 1% a rank.
 */
export const DEADLY_ASPECTS_CHANCE = [0, 2, 4, 6, 8, 10]
const quickShots = (r: number): ProcSpec => ({
  id: 'quickShots',
  name: 'Quick Shots',
  icon: 'ability_warrior_innerrage',
  trigger: 'autoShotLanded',
  from: 'any',
  chance: { pct: DEADLY_ASPECTS_CHANCE[r] ?? 10 },
  action: { kind: 'aura', aura: QUICK_SHOTS_AURA },
  docRef: `${DOC}#4-talents`,
})

/**
 * Frenzy (19621): the pet's crits have a 20% a rank chance to give it +30% attack speed for 8 s [F]
 * (the talent's curve and text; the aura, 19615, isn't in the extracted rows).
 */
export const FRENZY_AURA: AuraSpec = { id: 'frenzy', name: 'Frenzy', durationMs: 8000, mods: { petHaste: 30 } }
const frenzy = (r: number): ProcSpec => ({
  id: 'frenzy',
  name: 'Frenzy',
  icon: 'inv_misc_monsterclaw_03',
  trigger: 'petCrit',
  from: 'any',
  chance: { pct: 20 * r },
  action: { kind: 'aura', aura: FRENZY_AURA },
  docRef: `${DOC}#4-talents`,
})

/**
 * The passives as effects, by talent name (hunter.md §4). Each value is its rank curve's at rank r
 * [F] [client] (TraitDefinitionEffectPoints, CurvePoint, SpellEffect, 1.60.1.69913).
 */
export const TALENT_EFFECTS: Record<string, (r: number) => Effect[]> = {
  // 19426: aura 290, +1% crit a rank with every attack and spell.
  'Lethal Attacks': (r) => [
    { kind: 'stat', stat: 'crit', value: r },
    { kind: 'stat', stat: 'spellCrit', value: r },
  ],
  // 1223984: auras 580 and 598 (misc 3, Intellect), melee and ranged attack power +20% of your
  // Intellect a rank ("Increases your Attack Power by 100% of your Intellect" at 5/5) [F]; which aura
  // is which is [?], and the sim gives both.
  'Careful Aim': (r) => [
    { kind: 'stat', stat: 'apPerInt', value: 0.2 * r },
    { kind: 'stat', stat: 'rapPerInt', value: 0.2 * r },
  ],
  // 19507: aura 79, +1% damage a rank, with a ranged weapon: the ranged weapon's attacks (Auto Shot and
  // the physical shots) [?].
  'Ranged Weapon Specialization': (r) => [{ kind: 'ranged', damagePct: r }],
  // 19485: aura 108 misc 15, +6% a rank to the crit damage bonus of the ranged abilities it names:
  // Auto Shot, Aimed Shot, Multi-Shot, Arcane Shot, Serpent Sting (not Sniper Shot). Auto Shot's here;
  // the shots' in withSpellTalents.
  'Mortal Shots': (r) => [{ kind: 'ranged', critDamagePct: 6 * r }],
  // 19290: +1% hit and spell hit a rank (auras 54, 55).
  Surefooted: (r) => [
    { kind: 'stat', stat: 'hit', value: r },
    { kind: 'stat', stat: 'spellHit', value: r },
  ],
  // 19168: Agility +2% a rank (aura 137; its misc value names no single stat, the text says Agility) [F].
  'Lightning Reflexes': (r) => [{ kind: 'mult', stat: 'agi', pct: 2 * r }],
  'Improved Tracking': (r) => [{ kind: 'damage', pct: r, when: { creature: [...TRACKABLE] } }],
  // 1299346 talent, taught at 60 as rank 5 (20906): +50 ranged attack power to the party (area aura
  // 124), 30 min: cast before the pull, up all fight.
  'Trueshot Aura': () => [{ kind: 'stat', stat: 'rap', value: TRUESHOT_AURA_RAP }],
  'Deadly Aspects': (r) => [{ kind: 'proc', proc: quickShots(r) }],
  Frenzy: (r) => [{ kind: 'proc', proc: frenzy(r) }],
  'Lone Wolf': () => [{ kind: 'damage', pct: LONE_WOLF_PCT }],
  // 1223755: +1% a rank to all damage you and your pet deal while your pet is active (aura 4, a
  // server script) [F] by its text; with Lone Wolf there's no pet, so nothing.
  'Focused Fire': (r) => (r > 0 ? [{ kind: 'damage', pct: r }] : []),
}

/**
 * Trueshot Aura: the talent (1299346) teaches rank 1's +30; the trainer's rank 5 (20906, level 60) is
 * +50 [F] [client] (SpellEffect, SkillLineAbility, 1.60.1.69913). Rank 4 (+75) above rank 5 looks like
 * a data slip (docs/classes/hunter.md#11-open-questions, OQ-H3).
 */
export const TRUESHOT_AURA_RAP = 50

/** The talents' effects for the build (hunter.md §4); Focused Fire only with a pet. */
export function talentEffects(talents: TalentRanks): Effect[] {
  const out: Effect[] = []
  for (const [name, r] of talents) {
    if (name === 'Focused Fire' && !hasPet(talents)) continue
    const f = TALENT_EFFECTS[name]
    if (f) out.push(...f(r))
  }
  return out
}

/** Efficiency (19416): −3% a rank mana cost of the shots and stings its class mask names [F] (not Hunter's Mark or Sniper Shot). */
const EFFICIENCY = new Set([AIMED_SHOT.id, MULTI_SHOT.id, ARCANE_SHOT.id, SERPENT_STING.id])
/** Mortal Shots' shots (19485's class mask): its crit bonus on the spells. */
const MORTAL_SHOTS = new Set([AIMED_SHOT.id, MULTI_SHOT.id, ARCANE_SHOT.id, SERPENT_STING.id])
/** Improved Stings (1310661): Serpent Sting's periodic damage +6 / 13 / 20% [F]. */
export const IMPROVED_STINGS = [0, 6, 13, 20]
/** Barrage (19461): +3 / 7 / 10% damage to Aimed Shot and Multi-Shot (and Volley) [F]. */
export const BARRAGE = [0, 3, 7, 10]

/** A crit multiplier with its crit damage bonus raised by `pct`% (Mortal Shots 5/5: ×2 → ×2.3, Serpent Sting's tick crits included, hunter.md §3.4) [C]. */
export const withCritBonus = (multiplier: number, pct: number) => 1 + (multiplier - 1) * (1 + pct / 100)

/** The build's changes to a shot's spell (hunter.md §4): Improved Stings, Barrage, Mortal Shots. */
export function withSpellTalents(spell: SpellDef, talents: TalentRanks): SpellDef {
  const id = spell.id
  const out: SpellDef = { ...spell }
  if (id === SERPENT_STING.id) out.dotDamageMult = (spell.dotDamageMult ?? 1) * (1 + (IMPROVED_STINGS[rank(talents, 'Improved Stings')] ?? 20) / 100)
  if (id === AIMED_SHOT.id || id === MULTI_SHOT.id) out.damageMult *= 1 + (BARRAGE[rank(talents, 'Barrage')] ?? 10) / 100
  if (MORTAL_SHOTS.has(id)) out.critMultiplier = withCritBonus(spell.critMultiplier, 6 * rank(talents, 'Mortal Shots'))
  return out
}

/**
 * The build's changes to an ability row (hunter.md §4): Efficiency's mana, rounded down to whole
 * mana [?]; Improved Arcane Shot's −0.3 s a rank; Rapid Killing's −1 min a rank on Rapid Fire.
 */
export function withTalents(ability: AbilityDef, talents: TalentRanks): AbilityDef {
  const id = ability.id
  const out: AbilityDef = { ...ability, ...(ability.spellDef ? { spellDef: withSpellTalents(ability.spellDef, talents) } : {}) }
  if (EFFICIENCY.has(id)) out.costTenths = 10 * Math.floor((ability.costTenths / 10) * (1 - (3 * rank(talents, 'Efficiency')) / 100) + 1e-9)
  if (id === ARCANE_SHOT.id) out.cooldownMs = ability.cooldownMs - 300 * rank(talents, 'Improved Arcane Shot')
  if (id === RAPID_FIRE.id) out.cooldownMs = ability.cooldownMs - 60000 * rank(talents, 'Rapid Killing')
  return out
}
