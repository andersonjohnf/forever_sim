// What the shaman adds to a plan (docs/classes/shaman.md "What the sim needs"): its passive talents,
// its mana model and the [?] assumptions its plan relies on. Its totems are the Buffs tab's (their
// `selfCast`), and its rotation is enhancement.ts.
import { FIVE_SECOND_RULE_MS, mp5TickTenths, spiritRegenTickTenths } from '../../core/formulas'
import type { Effect } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { type AuraPlan, COND, type ManaPlan, type Plan, POWER_TICK_MS } from '../../plan/types'
import type { DerivedStats } from '../../stats/stat-block'
import { IMPROVED_STORMSTRIKE_AURA, IMPROVED_STORMSTRIKE_SHARE, WINDFURY_WEAPON_ID } from './abilities'
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

/**
 * The shaman's mana, in tenths (shaman.md#mana; character-stats.md#spirit-and-mana-regeneration): the
 * engine's one mana model, as the paladin's (paladin.md#mana-model): the sheet's maximum, spirit
 * regeneration `15 + Spirit / 5` a tick outside the five-second rule, and mp5 every tick. Improved
 * Stormstrike's aura lets half the spirit regeneration continue inside the rule while it's up.
 */
export function shamanManaPlan(derived: Pick<DerivedStats, 'mana' | 'spirit'>, mp5: number, auras: readonly AuraPlan[]): ManaPlan {
  const improved = auras.findIndex((a) => a.id === IMPROVED_STORMSTRIKE_AURA.id)
  return {
    maxTenths: 10 * derived.mana,
    regenTickTenths: spiritRegenTickTenths(derived.spirit),
    fiveSecondRuleMs: FIVE_SECOND_RULE_MS,
    mp5TickTenths: mp5TickTenths(mp5, POWER_TICK_MS),
    ...(improved >= 0 ? { inFsrShareAura: improved, inFsrShareAuraShare: IMPROVED_STORMSTRIKE_SHARE } : {}),
  }
}

/**
 * The [?] assumptions a shaman plan relies on (shaman.md#open-questions), by what it has: mana, its
 * imbue's procs, Maelstrom Weapon, Flurry's charges, Stormstrike's boost and a Lightning Bolt with a
 * cast time.
 */
export function shamanAssumptions(plan: Plan): AssumptionId[] {
  if (plan.classId !== 'shaman') return []
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
