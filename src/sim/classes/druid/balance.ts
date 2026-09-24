// The Balance druid's priority list and its settings (docs/classes/druid.md §11.5): the Classic Era
// common priority adapted to Forever, with the first quick search of decision D27 (§11.5 "First-pass
// defaults").
//
// Off the GCD: the racial cooldown (Night Elf), on-use trinkets, Power Infusion when a priest gives
// it (Buffs), and the mana potion and rune once they fit. On the GCD: Innervate on yourself below a
// share of your mana, Faerie Fire's upkeep if it's your duty, Insect Swarm's and Moonfire's upkeep,
// Starfire with Clearcasting, Starfire on Eclipse's charges and Wrath to build them, and the filler.
// Setting ids are `druid.balance.<ability>.<param>`; mana thresholds are shares of maximum mana.
import { POWER_INFUSION } from '../../effects/buffs'
import type { OnUseSpec } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { type AbilityDef, COND, type Plan, type RotationCondition } from '../../plan/types'
import type { RotationOption, RotationValue } from '../../types'
import type { ClassRotationContext } from '../rotation'
import { ELUNES_LIGHT } from '../warrior/abilities'
import { type ClassRotation, NO_CONTEXT, reader, RotationBuilder, timeLeftAtLeast } from '../warrior/shared'
import { ECLIPSE, ECLIPSE_AURA, FAERIE_FIRE_MOONKIN, INNERVATE, INSECT_SWARM, MOONFIRE, NATURES_GRACE, STARFIRE, withBalanceTalents, WRATH } from './balance-abilities'
import { CLEARCASTING } from './abilities'
import { onUseCast } from './cat-abilities'
import type { TalentRanks } from './modifiers'

const B = 'druid.balance'
export const BALANCE_IDS = {
  racial: `${B}.racial.enabled`,
  trinkets: `${B}.trinkets.enabled`,
  powerInfusion: `${B}.powerInfusion.enabled`,
  innervate: `${B}.innervate.enabled`,
  innervateMana: `${B}.innervate.maxManaPct`,
  faerieFire: `${B}.faerieFire.enabled`,
  insectSwarm: `${B}.insectSwarm.enabled`,
  moonfire: `${B}.moonfire.enabled`,
  dotsLeft: `${B}.dots.minFightLeftSec`,
  eclipse: `${B}.eclipse.enabled`,
  filler: `${B}.filler.spell`,
  manaPotion: `${B}.manaPotion.enabled`,
  manaPotionMissing: `${B}.manaPotion.missingMana`,
  rune: `${B}.rune.enabled`,
  runeMissing: `${B}.rune.missingMana`,
}
const ID = BALANCE_IDS

/** Buff catalogue ids of the consumables the rotation uses (effects/buffs.ts). */
export const MANA_POTION = 'majorManaPotion'
export const MANA_RUNE = 'demonicRune'

/** A "when missing" mana input for a potion or rune: 0 to 5,000 mana. */
const missingOption = (id: string, label: string, help: string, def: number, dependsOn: string): RotationOption => ({
  kind: 'number',
  id,
  label,
  group: 'Consumables',
  help,
  unit: 'mana',
  min: 0,
  max: 5000,
  step: 50,
  default: def,
  dependsOn,
})

/**
 * Defaults from druid.md §11.5, in priority order: the Classic Era common priority adapted to Forever,
 * with the first quick search of decision D27.
 */
export const BALANCE_OPTIONS: RotationOption[] = [
  {
    kind: 'toggle',
    id: ID.racial,
    group: 'Cooldowns and buffs',
    label: 'Racial cooldown',
    help: 'Use Elune’s Light (Night Elf) on cooldown: +10% crit for 15 s. Tauren and Skyborne have no cooldown to use.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.trinkets,
    group: 'Cooldowns and buffs',
    label: 'On-use trinkets',
    help: 'Use the on-use trinkets the sim knows on cooldown from the pull, if you wear them. Other on-use trinkets aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.powerInfusion,
    group: 'Cooldowns and buffs',
    label: 'Power Infusion',
    help: 'Use a priest’s Power Infusion on cooldown from the pull: +20% spell damage for 15 s, every 3 minutes. Turn it on in Buffs if a priest gives you one.',
    default: true,
    requiresBuff: POWER_INFUSION.id,
  },
  {
    kind: 'toggle',
    id: ID.innervate,
    group: 'Cooldowns and buffs',
    label: 'Innervate yourself',
    help: 'Cast Innervate on yourself once your mana is down to the share set under Advanced: five times your Spirit regeneration for 20 s, all of it while casting, every 6 minutes.',
    default: true,
  },
  {
    kind: 'number',
    id: ID.innervateMana,
    group: 'Cooldowns and buffs',
    label: 'Innervate at or below',
    help: 'Cast it once your mana is at or below this share of your maximum. Lower wastes less of its regeneration on a full bar; too low and you run dry first.',
    unit: '% mana',
    min: 0,
    max: 100,
    step: 5,
    default: 40,
    dependsOn: ID.innervate,
  },
  {
    kind: 'toggle',
    id: ID.faerieFire,
    group: 'Cooldowns and buffs',
    label: 'Faerie Fire',
    help: 'Keep your Faerie Fire on the boss: −505 armor for 40 s, for 115 mana and a global cooldown. It helps the raid’s attacks, not your spells, so it costs you damage. Turn it on if it’s your duty.',
    default: false,
    maintainsBuff: 'faerieFire',
  },
  {
    kind: 'toggle',
    id: ID.insectSwarm,
    group: 'Core abilities',
    label: 'Insect Swarm',
    help: 'Keep Insect Swarm on the boss: Nature damage every 2 s for 14 s with Nature’s Splendor, whose ticks can crit. It’s resisted whole or not at all.',
    default: true,
    requires: { talent: 'Insect Swarm' },
  },
  {
    kind: 'toggle',
    id: ID.moonfire,
    group: 'Core abilities',
    label: 'Moonfire',
    help: 'Keep Moonfire on the boss: an Arcane hit, then damage every 3 s for 15 s with Nature’s Splendor, whose ticks can crit.',
    default: true,
  },
  {
    kind: 'number',
    id: ID.dotsLeft,
    group: 'Core abilities',
    label: 'Damage over time while the fight has',
    help: 'Put Insect Swarm or Moonfire back on only while at least this much of the fight is left, so enough of its ticks land.',
    unit: 's left',
    min: 0,
    max: 30,
    step: 1,
    default: 10,
  },
  {
    kind: 'toggle',
    id: ID.eclipse,
    group: 'Core abilities',
    label: 'Wrath for Eclipse',
    help: 'Cast Wrath whenever you have no Eclipse charges: each Wrath that lands gives 2, and each takes 0.5 s off a Starfire’s cast.',
    default: true,
    requires: { talent: 'Eclipse' },
  },
  {
    kind: 'choice',
    id: ID.filler,
    group: 'Core abilities',
    label: 'Filler',
    help: 'What you cast the rest of the time. Starfire hits harder for its time; Wrath costs far less mana. With too little mana for Starfire, you cast Wrath.',
    choices: [
      { value: 'starfire', label: 'Starfire' },
      { value: 'wrath', label: 'Wrath' },
    ],
    default: 'starfire',
  },
  {
    kind: 'toggle',
    id: ID.manaPotion,
    group: 'Consumables',
    label: 'Major Mana Potion',
    help: 'Drink one every 2 minutes, once you’re missing the mana set below.',
    default: true,
    requiresBuff: MANA_POTION,
  },
  missingOption(ID.manaPotionMissing, 'Major Mana Potion when missing', 'Drink it when you’re missing at least this much mana. It restores 1,350 to 2,250.', 2000, ID.manaPotion),
  {
    kind: 'toggle',
    id: ID.rune,
    group: 'Consumables',
    label: 'Demonic Rune',
    help: 'Use one every 2 minutes, apart from the potion’s cooldown, once you’re missing the mana set below.',
    default: true,
    requiresBuff: MANA_RUNE,
  },
  missingOption(ID.runeMissing, 'Demonic Rune when missing', 'Use it when you’re missing at least this much mana. 1,500 is the most it restores.', 1500, ID.rune),
]

/**
 * The Balance settings that do nothing in this setup, with why (docs/ux.md "Rotation"): the filler
 * while Wrath for Eclipse is on, since Starfire and Wrath then alternate and the filler is never
 * reached (druid.md §11.5).
 */
export function balanceUnusedSettings(values: Record<string, RotationValue>, talents: ReadonlyMap<string, number>): Record<string, string> {
  const v = reader(BALANCE_OPTIONS, values, talents)
  if (!v.on(ID.eclipse) || !talents.has('Eclipse')) return {}
  return { [ID.filler]: 'Not used while “Wrath for Eclipse” is on: Starfire and Wrath already take turns. Turn it off to cast only the filler.' }
}

/** Buff catalogue ids the Balance druid keeps up itself with these settings: its Faerie Fire, if it's its duty. */
export function balanceMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return reader(BALANCE_OPTIONS, values).on(ID.faerieFire) ? ['faerieFire'] : []
}

/** Resolves abilities with the Balance talents (balance-abilities.ts) rather than the warrior's. */
class BalanceRotationBuilder extends RotationBuilder {
  override ability(def: AbilityDef): number {
    const i = this.abilities.findIndex((a) => a.id === def.id)
    if (i >= 0) return i
    this.abilities.push(withBalanceTalents(def, this.talents))
    return this.abilities.length - 1
  }
}

/** An on-use consumable as a Balance `cast`: free, its cooldown, GCD and buff, its mana at once (buffs doc §3.5). */
const consumable = (use: OnUseSpec): AbilityDef => ({ ...onUseCast(use), resource: 'mana', manaTenths: use.manaTenths ?? 0, manaSpreadTenths: use.manaSpreadTenths ?? 0 })

const refresh = (a: number): RotationCondition => ({ code: COND.abilityAuraRefresh, a, b: 0 })

/**
 * The Balance priority list from the settings (druid.md §11.5). `talents` resolves the spells and
 * gates Insect Swarm and Eclipse; `auraIndex` finds Clearcasting's and Eclipse's auras; `context`
 * gives the race (Elune's Light), the equipped on-use trinkets, the selected consumables and Power
 * Infusion, and the maximum mana the thresholds are shares of.
 */
export function balanceRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  context: Partial<ClassRotationContext> = {},
): ClassRotation {
  const ctx: ClassRotationContext = { ...NO_CONTEXT, equipped: new Set(), othersBleed: false, front: false, ...context }
  const v = reader(BALANCE_OPTIONS, values, talents)
  const b = new BalanceRotationBuilder(talents)
  const maxManaTenths = 10 * (ctx.maxMana ?? 0)
  const pressed: string[] = ctx.items.map((i) => i.id)

  // --- Off the GCD, on cooldown from the pull: nothing in the list is worth saving them for ----------
  if (ctx.race === 'alliance-night-elf' && v.on(ID.racial)) b.add(ELUNES_LIGHT, [])
  if (v.on(ID.trinkets)) for (const item of ctx.items) b.add(consumable(item), [])
  const pi = ctx.consumables.find((c) => c.id === POWER_INFUSION.id)
  if (pi) {
    pressed.push(pi.id)
    if (v.on(ID.powerInfusion)) b.add(consumable(pi), [])
  }
  // The mana potion and rune (off the GCD), when selected in Buffs: once you're missing their mana.
  for (const [id, setting, missing] of [
    [MANA_POTION, ID.manaPotion, ID.manaPotionMissing],
    [MANA_RUNE, ID.rune, ID.runeMissing],
  ] as const) {
    const use = ctx.consumables.find((c) => c.id === id)
    if (!use) continue
    pressed.push(id)
    if (v.on(setting)) b.add(consumable(use), [{ code: COND.maxMana, a: maxManaTenths - 10 * v.num(missing), b: 0 }])
  }

  // --- On the GCD --------------------------------------------------------------------------------------
  // Innervate on yourself at or below x% mana.
  if (v.on(ID.innervate)) b.add(INNERVATE, [{ code: COND.maxMana, a: Math.round((v.num(ID.innervateMana) / 100) * maxManaTenths), b: 0 }])
  // Faerie Fire's upkeep, when it's your duty.
  if (v.on(ID.faerieFire)) b.add(FAERIE_FIRE_MOONKIN, [refresh(b.ability(FAERIE_FIRE_MOONKIN))])
  // The DoTs' upkeep: back on once they're off the boss, while the fight has time for their ticks.
  const left = timeLeftAtLeast(1000 * v.num(ID.dotsLeft))
  if (v.on(ID.insectSwarm) && talents.has('Insect Swarm')) b.add(INSECT_SWARM, [refresh(b.ability(INSECT_SWARM)), left])
  if (v.on(ID.moonfire)) b.add(MOONFIRE, [refresh(b.ability(MOONFIRE)), left])
  // Starfire with Clearcasting: the most mana it can save.
  const clearcasting = auraIndex(CLEARCASTING.id)
  if (clearcasting >= 0) b.add(STARFIRE, [{ code: COND.auraUp, a: clearcasting, b: 0 }])
  // Eclipse: Starfire on its charges, and Wrath to build them when there are none.
  const eclipse = auraIndex(ECLIPSE_AURA.id)
  if (v.on(ID.eclipse) && eclipse >= 0) {
    b.add(STARFIRE, [{ code: COND.auraStacksAtLeast, a: eclipse, b: 1 }])
    b.add(WRATH, [])
  }
  // The filler, and Wrath when there isn't the mana for Starfire.
  if (v.str(ID.filler) === 'wrath') b.add(WRATH, [])
  else {
    b.add(STARFIRE, [])
    b.add(WRATH, [])
  }
  return b.result(pressed)
}

/**
 * The [?] assumptions a Balance plan relies on (druid.md §11.8), by what it has: its spells, the DoTs'
 * tick crits where periodic effects can crit, Nature's Grace, Eclipse, Omen of Clarity on spells, and
 * its mana.
 */
export function balanceAssumptions(plan: Plan): AssumptionId[] {
  if (plan.spec !== 'druid-balance') return []
  const ids: AssumptionId[] = []
  const procs = new Set(plan.procs.map((p) => p.id))
  const abilities = new Set(plan.abilities.map((a) => a.id))
  if ((plan.spells ?? []).length > 0) ids.push('balanceSpells')
  if (plan.profile.combat.periodicCrits && (plan.spells ?? []).some((s) => s.dotCanCrit)) ids.push('balanceDotCrits')
  if (procs.has(NATURES_GRACE.id)) ids.push('balanceNaturesGrace')
  if (procs.has(ECLIPSE.id) && abilities.has('starfire')) ids.push('balanceEclipse')
  if (procs.has('omenOfClaritySpells')) ids.push('balanceOmenOfClarity')
  if (plan.mana) ids.push('manaRegenBalance')
  return ids
}
