// Warlock talents (docs/classes/warlock.md §4): the passives as effects, and the modifiers that
// change its spells (costs, cast times, damage, crit and crit bonus), applied to each row before its
// numbers feed anything. Values are the Forever client's per-rank curves (src/data/client/talents.json,
// TraitDefinitionEffectPoints, 1.60.1.69913), which the talents' tooltips read; warlock.test.ts ties
// them to it. Talents that name a spell by its class mask list the spells here by id.
import { spellCritMultiplier } from '../../core/formulas'
import type { Effect } from '../../effects/types'
import { nightfallProc } from './abilities'
import type { AbilityDef, SpellDef } from '../../plan/types'

export type TalentRanks = ReadonlyMap<string, number>
export const rank = (talents: TalentRanks, name: string) => talents.get(name) ?? 0

/** A per-rank curve's value at `r` (0 → 0). */
const at = (curve: readonly number[], r: number) => (r > 0 ? curve[Math.min(r, curve.length) - 1] : 0)

// The curves (TraitDefinitionEffectPoints), per rank.
export const CURVE = {
  improvedLifeTap: [10, 20],
  suppression: [1, 2, 3, 4, 5],
  improvedCorruptionCast: [400, 800, 1200, 1600, 2000],
  improvedCorruption: [2, 4, 6, 8, 10],
  malediction: [1, 2, 3, 4, 5],
  improvedBaneOfAgony: [5, 10],
  pandemic: [33, 67, 100],
  malevolence: [1, 2, 3, 4, 5],
  nightfall: [2, 4],
  shadowMastery: [1, 2, 3, 4, 5],
  demonicEmbrace: [3, 6, 9, 12, 15],
  felVitality: [5, 10, 15],
  improvedShadowBolt: [4, 8, 12, 16, 20],
  baneCast: [100, 200, 300, 400, 500],
  moltenSkin: [2, 4, 6, 8, 10],
  cataclysm: [3, 6, 10],
  aftermath: [10, 20, 30, 40, 50],
  ruin: [20, 40, 60, 80, 100],
  agonizingFlames: [3, 7, 10],
  fireAndBrimstone: [8, 17, 25],
  shadowAndFlame: [2, 4, 6, 8, 10],
  shadowAndFlameKeep: [20, 40, 60, 80, 100],
  // Demonology's that change your own spells (warlock.md §11.3): Bane #1 on Soul Fire, Decimation #0, #1, #3.
  baneSoulFireCast: [400, 800, 1200, 1600, 2000],
  decimationCast: [20, 40],
  decimationCooldown: [45, 90],
  decimationDamage: [3, 6],
} as const

/** The warlock's passive talents as effects (warlock.md §4). */
export function warlockTalentEffects(talents: TalentRanks): Effect[] {
  const out: Effect[] = []
  // Suppression (18174): +1% hit a rank with spells and attacks (auras 54, 55), −4% threat a rank [F].
  const suppression = at(CURVE.suppression, rank(talents, 'Suppression'))
  if (suppression > 0) {
    out.push({ kind: 'stat', stat: 'spellHit', value: suppression }, { kind: 'stat', stat: 'hit', value: suppression })
    out.push({ kind: 'threat', pct: -4 * rank(talents, 'Suppression') })
  }
  // Demonic Embrace (18697): +3% Stamina a rank (aura 137), as its tooltip reads; the client's second
  // effect, −1% Spirit, isn't in the tooltip [?] (warlock.md Q9).
  const embrace = at(CURVE.demonicEmbrace, rank(talents, 'Demonic Embrace'))
  if (embrace > 0) out.push({ kind: 'mult', stat: 'sta', pct: embrace })
  // Fel Vitality (18731): +5% maximum mana a rank (#1, aura 178) [F].
  const vitality = at(CURVE.felVitality, rank(talents, 'Fel Vitality'))
  if (vitality > 0) out.push({ kind: 'mult', stat: 'mana', pct: vitality })
  // Molten Skin (1225220): −2% damage taken a rank (aura 87) [F]; nothing a DPS result reads.
  const skin = at(CURVE.moltenSkin, rank(talents, 'Molten Skin'))
  if (skin > 0) out.push({ kind: 'damageTaken', pct: -skin })
  // Nightfall's Shadow Trance, a proc here so the rotation can read its aura (warlock.md §4.2); the
  // plan leaves it out without Corruption. Improved Shadow Bolt's and Shadow and Flame's procs come with
  // the rotation that casts their spells (shared.ts).
  const nightfall = rank(talents, 'Nightfall')
  if (nightfall > 0) out.push({ kind: 'proc', proc: nightfallProc(nightfall) })
  return out
}

/**
 * The spells each talent names (their class masks, warlock.md §4): Ruin's and Cataclysm's mask 997 covers
 * Soul Fire (64) and Searing Pain (256) too (§11.3).
 */
const DESTRUCTION = new Set(['shadowBolt', 'immolate', 'conflagrate', 'incinerate', 'shadowburn', 'soulFire', 'searingPain'])
/**
 * Agonizing Flames' damage: its #1 mask (Shadow Bolt, Immolate's hit, Shadowburn, Searing Pain, Incinerate,
 * Conflagrate, Soul Fire's: [421, 8388800]); #2 Immolate's ticks. Its #0 is Searing Pain's crit (mask 256).
 */
const AGONIZING = new Set(['shadowBolt', 'immolate', 'conflagrate', 'incinerate', 'shadowburn', 'soulFire', 'searingPain'])
/** Malediction's periodic damage (#0): Corruption, Immolate's ticks, the Banes, Siphon Life. */
const MALEDICTION = new Set(['corruption', 'immolate', 'baneOfAgony', 'baneOfDoom', 'siphonLife'])
/** Shadow Mastery: direct damage (#0: Shadow Bolt, Shadowburn) and periodic (#1: Corruption, the Banes, Siphon Life). */
const SHADOW_MASTERY_DIRECT = new Set(['shadowBolt', 'shadowburn'])
const SHADOW_MASTERY_DOT = new Set(['corruption', 'baneOfAgony', 'baneOfDoom', 'siphonLife'])
/** Pandemic's crit bonus and Malevolence's crit (their masks): the Affliction DoTs; Malevolence also Shadow Bolt and Shadowburn. */
const PANDEMIC = new Set(['corruption', 'baneOfAgony', 'baneOfDoom', 'siphonLife'])
const MALEVOLENCE = new Set(['shadowBolt', 'shadowburn', 'corruption', 'baneOfAgony', 'baneOfDoom', 'siphonLife'])

/**
 * A spell with the build's talents (warlock.md §4): its own damage (direct and DoT) multiplied by each
 * talent that names it, as the druid's modifiers do [?] (warlock.md Q10), its crit and crit bonus.
 */
export function spellWithTalents(spell: SpellDef, talents: TalentRanks): SpellDef {
  const id = spell.id
  const pct = (curve: readonly number[], name: string) => 1 + at(curve, rank(talents, name)) / 100
  let direct = spell.damageMult
  let dot = spell.dotDamageMult ?? spell.damageMult
  if (AGONIZING.has(id)) direct *= pct(CURVE.agonizingFlames, 'Agonizing Flames')
  // Agonizing Flames #2: Immolate's ticks.
  if (id === 'immolate') dot *= pct(CURVE.agonizingFlames, 'Agonizing Flames')
  // Aftermath #1: Immolate's initial damage.
  if (id === 'immolate') direct *= pct(CURVE.aftermath, 'Aftermath')
  if (SHADOW_MASTERY_DIRECT.has(id)) direct *= pct(CURVE.shadowMastery, 'Shadow Mastery')
  if (SHADOW_MASTERY_DOT.has(id)) dot *= pct(CURVE.shadowMastery, 'Shadow Mastery')
  if (MALEDICTION.has(id)) dot *= pct(CURVE.malediction, 'Malediction')
  if (id === 'corruption') dot *= pct(CURVE.improvedCorruption, 'Improved Corruption')
  if (id === 'baneOfAgony') dot *= pct(CURVE.improvedBaneOfAgony, 'Improved Bane of Agony')
  let critBonusPct = 0
  if (DESTRUCTION.has(id)) critBonusPct += at(CURVE.ruin, rank(talents, 'Ruin'))
  if (PANDEMIC.has(id)) critBonusPct += at(CURVE.pandemic, rank(talents, 'Pandemic'))
  let bonusCrit = spell.bonusCrit
  if (MALEVOLENCE.has(id)) bonusCrit += at(CURVE.malevolence, rank(talents, 'Malevolence'))
  if (id === 'conflagrate') bonusCrit += at(CURVE.fireAndBrimstone, rank(talents, 'Fire and Brimstone'))
  // Agonizing Flames #0 (aura 107, mask 256): +3/7/10% crit with Searing Pain, Improved Searing Pain's old part.
  if (id === 'searingPain') bonusCrit += at(CURVE.agonizingFlames, rank(talents, 'Agonizing Flames'))
  const hasDot = (spell.dotTicks ?? 0) > 0
  // Decimation #3 (mask 257: Shadow Bolt, Searing Pain): +3% a rank below 35% health (warlock.md §11.3).
  const decimation = id === 'shadowBolt' || id === 'searingPain' ? at(CURVE.decimationDamage, rank(talents, 'Decimation')) : 0
  return {
    ...spell,
    ...(decimation > 0 ? { lowHealthPct: decimation, lowHealthBelowPct: 35 } : {}),
    damageMult: direct,
    ...(hasDot && dot !== direct ? { dotDamageMult: dot } : {}),
    bonusCrit,
    critMultiplier: critBonusPct > 0 ? spellCritMultiplier(critBonusPct) : spell.critMultiplier,
  }
}

/**
 * An ability with the build's talents (warlock.md §4): Cataclysm's cost on the Destruction spells,
 * Bane's and Improved Corruption's cast times, and its spell's damage and crit (`spellWithTalents`).
 * A cost cut rounds down to whole mana [?].
 */
export function withTalents(def: AbilityDef, talents: TalentRanks): AbilityDef {
  let costTenths = def.costTenths
  let castMs = def.castMs
  if (DESTRUCTION.has(def.id)) costTenths = 10 * Math.floor((costTenths * (1 - at(CURVE.cataclysm, rank(talents, 'Cataclysm')) / 100)) / 10 + 1e-9)
  // Bane (17788): −0.1 s a rank on Shadow Bolt, Immolate and Incinerate (#0).
  if (def.id === 'shadowBolt' || def.id === 'immolate' || def.id === 'incinerate') castMs -= at(CURVE.baneCast, rank(talents, 'Bane'))
  if (def.id === 'corruption') castMs -= at(CURVE.improvedCorruptionCast, rank(talents, 'Improved Corruption'))
  let cooldownMs = def.cooldownMs
  if (def.id === 'soulFire') {
    // Bane #1: −0.4 s a rank; Decimation: −20% a rank with its buff, which the sim's Soul Fire is only
    // cast under (below 35%), and −45% a rank off its cooldown (warlock.md §11.3).
    castMs = Math.round((castMs - at(CURVE.baneSoulFireCast, rank(talents, 'Bane'))) * (1 - at(CURVE.decimationCast, rank(talents, 'Decimation')) / 100))
    cooldownMs = Math.round(cooldownMs * (1 - at(CURVE.decimationCooldown, rank(talents, 'Decimation')) / 100))
  }
  castMs = Math.max(0, castMs)
  return {
    ...def,
    costTenths,
    castMs,
    cooldownMs,
    ...(def.spellDef ? { spellDef: spellWithTalents(def.spellDef, talents) } : {}),
    // Shadow and Flame keeps your Immolate with 20% a rank when Conflagrate lands (warlock.md §4.1).
    ...(def.consumesDotOf ? { consumesDotOf: { ...def.consumesDotOf, chance: 1 - at(CURVE.shadowAndFlameKeep, rank(talents, 'Shadow and Flame')) / 100 } } : {}),
  }
}
