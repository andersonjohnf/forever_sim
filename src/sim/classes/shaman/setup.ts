// What the shaman adds to a plan (docs/classes/shaman.md "What the sim needs"): its passive talents,
// its mana model and the [?] assumptions its plan relies on. Its totems are the Buffs tab's (their
// `selfCast`), and its rotation is enhancement.ts.
import { FIVE_SECOND_RULE_MS, mp5TickTenths, spiritRegenTickTenths } from '../../core/formulas'
import type { Effect } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { COND, type ManaPlan, type Plan, POWER_TICK_MS } from '../../plan/types'
import type { DerivedStats } from '../../stats/stat-block'
import { ELEMENTAL_CLEARCASTING, WINDFURY_WEAPON_ID } from './abilities'
import { TALENT_EFFECTS, type TalentRanks } from './talents'

/** The Windfury Weapon proc's id, for the plan's rule that it leaves Windfury Totem out (build.ts). */
export const SHAMAN_WINDFURY_WEAPON = WINDFURY_WEAPON_ID

/** The shaman's passives for the build: its talents (shaman.md#talents). */
export function shamanEffects(talents: TalentRanks): Effect[] {
  const effects: Effect[] = []
  for (const [name, r] of talents) {
    const f = TALENT_EFFECTS[name]
    if (f) effects.push(...f(r))
  }
  return effects
}

/** Mindfulness (1223033) a rank: the share of mana regeneration that continues while casting, 17 / 33 / 50% [F] (aura 134, its rank curve). */
export const MINDFULNESS_PCT = [0, 17, 33, 50]

/**
 * The shaman's mana, in tenths (shaman.md#mana; character-stats.md#spirit-and-mana-regeneration): the
 * engine's one mana model, as the paladin's (paladin.md#mana-model): the sheet's maximum, spirit
 * regeneration `15 + Spirit / 5` a tick outside the five-second rule, and mp5 every tick. Mindfulness
 * lets its share of the spirit regeneration continue inside the rule (the plan's `inFsrShare`, as
 * Reverence's), and Improved Stormstrike's aura half of it while it's up: its own `castingRegen`
 * (abilities.ts IMPROVED_STORMSTRIKE_AURA), the caster core's mana hook, added to it.
 */
export function shamanManaPlan(derived: Pick<DerivedStats, 'mana' | 'spirit'>, mp5: number, talents: TalentRanks = new Map()): ManaPlan {
  const mindfulness = MINDFULNESS_PCT[talents.get('Mindfulness') ?? 0] ?? 50
  return {
    maxTenths: 10 * derived.mana,
    regenTickTenths: spiritRegenTickTenths(derived.spirit),
    fiveSecondRuleMs: FIVE_SECOND_RULE_MS,
    mp5TickTenths: mp5TickTenths(mp5, POWER_TICK_MS),
    ...(mindfulness > 0 ? { inFsrShare: mindfulness / 100 } : {}),
  }
}

/**
 * What the shaman adds to the plan: its mana, and Elemental Focus's Clearcasting as the free-cast aura
 * the damage spells spend (abilities.ts ELEMENTAL_CLEARCASTING; the druid's Omen of Clarity is the same
 * hook, druid.md §2.7), when the build has it.
 */
export function shamanPlan(
  derived: Pick<DerivedStats, 'mana' | 'spirit'>,
  mp5: number,
  talents: TalentRanks,
  auras: readonly { id: string }[],
): Pick<Plan, 'mana' | 'freeCastAura'> {
  const clearcasting = auras.findIndex((a) => a.id === ELEMENTAL_CLEARCASTING.id)
  return { mana: shamanManaPlan(derived, mp5, talents), ...(clearcasting >= 0 ? { freeCastAura: clearcasting } : {}) }
}

/**
 * The [?] assumptions a shaman plan relies on (shaman.md#open-questions), by what it has: mana, its
 * imbue's procs, Maelstrom Weapon, Flurry's charges, Stormstrike's boost and a Lightning Bolt with a
 * cast time.
 */
export function shamanAssumptions(plan: Plan): AssumptionId[] {
  if (plan.classId !== 'shaman') return []
  // An Elemental shaman casts from range (no weapon in the plan): its own notes.
  if (plan.weapons[0] === null && plan.weapons[1] === null && plan.spec === 'shaman-elemental') return elementalAssumptions(plan)
  const ids: AssumptionId[] = []
  if (plan.mana) ids.push('manaRegenShaman')
  const procs = new Set(plan.procs.map((p) => p.id))
  const abilities = new Map(plan.abilities.map((a) => [a.id, a]))
  if (procs.has(WINDFURY_WEAPON_ID)) ids.push('windfuryWeapon')
  if (procs.has('maelstromWeapon')) ids.push('maelstromWeapon')
  if (procs.has('shamanFlurry')) ids.push('shamanFlurry')
  if (abilities.has('stormstrike') && (abilities.has('earthShock') || abilities.has('lightningBolt'))) ids.push('stormstrikeBoost')
  // A Lightning Bolt with a cast time: one its line's Maelstrom Weapon stacks don't make instant.
  const boltIndex = plan.abilities.findIndex((a) => a.id === 'lightningBolt')
  const bolt = plan.abilities[boltIndex]
  if (bolt && bolt.castMs > 0) {
    const stacks = (e: (typeof plan.rotation)[number]) => e.conditions.find((c) => c.code === COND.auraStacksAtLeast)?.b ?? 0
    const cast = plan.rotation.some((e) => e.ability === boltIndex && (bolt.stackAura === undefined || stacks(e) * (bolt.stackCastPct ?? 0) < 100))
    if (cast) ids.push('lightningBoltCast')
  }
  if ((plan.spells ?? []).length > 0) ids.push('shamanSpellDamage')
  ids.push('shamanTotems')
  return ids
}

/** The [?] assumptions an Elemental plan relies on (shaman.md#elemental-open-questions), by what it has. */
function elementalAssumptions(plan: Plan): AssumptionId[] {
  const ids: AssumptionId[] = ['elementalSpells']
  if (plan.mana) ids.push('manaRegenElemental')
  const procs = new Set(plan.procs.map((p) => p.id))
  const abilities = new Set(plan.abilities.map((a) => a.id))
  if (procs.has('elementalFocus')) ids.push('elementalFocus')
  if ([...procs].some((id) => id.startsWith('lightningOverload'))) ids.push('lightningOverload')
  if (abilities.has('manaTideTotem')) ids.push('manaTideTotem')
  if (abilities.has('lightningBoltRank4')) ids.push('lightningBoltDownrank')
  if (abilities.has('bloodFury')) ids.push('bloodFurySpellPower')
  ids.push('elementalTotems')
  return ids
}
