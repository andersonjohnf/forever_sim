// The Balance druid's priority list and its settings (docs/classes/druid.md §11.5): the Classic Era
// common priority adapted to Forever, with the first quick search of decision D27 (§11.5 "First-pass
// defaults").
//
// Off the GCD: the racial cooldown (Night Elf), on-use trinkets, Power Infusion when a priest gives
// it (Buffs), and the mana potion and rune once they fit. On the GCD: Innervate on yourself below a
// share of your mana, Faerie Fire's upkeep if it's your duty, Insect Swarm's and Moonfire's upkeep,
// Starfire with Clearcasting, Starfire on Eclipse's charges and Wrath to build them, and the filler.
// The rows are a priority list you reorder (BALANCE_APL, decision D31), each with its own settings.
// Setting ids are `druid.balance.<ability>.<param>`; mana thresholds are shares of maximum mana.
import { POWER_INFUSION } from '../../effects/buffs'
import type { OnUseSpec } from '../../effects/types'
import type { AssumptionId } from '../../plan/assumptions'
import { type AbilityDef, COND, type Plan, type RotationCondition } from '../../plan/types'
import type { AplDefinition, RotationOption, RotationValue } from '../../types'
import { belowRowNote, compileAplRows, normalizeAplOrder } from '../apl'
import type { ClassRotationContext } from '../rotation'
import { ELUNES_LIGHT } from '../warrior/abilities'
import { type ClassRotation, NO_CONTEXT, reader, RotationBuilder, timeLeftAtLeast } from '../warrior/shared'
import { ECLIPSE, ECLIPSE_AURA, FAERIE_FIRE_MOONKIN, INNERVATE, INSECT_SWARM, MOONFIRE, NATURES_GRACE, STARFIRE, withBalanceTalents, WRATH } from './balance-abilities'
import { CLEARCASTING, CLEARCASTING_ICON } from './abilities'
import { FORM_ICON } from './forms'
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
    help: 'Use a priest’s Power Infusion, cast on you once at the pull: +20% spell damage for 15 s. Turn it on in Buffs if a priest gives you one.',
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
    // 5, not 0: at 0% it would wait for a bar that never empties, and never be cast.
    min: 5,
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

/** The switched rows on the global cooldown, each with any talent it needs, which a row that casts on every one can starve. */
const GCD_SWITCH_ROWS: readonly { row: string; enabled: string; talent?: string }[] = [
  { row: 'innervate', enabled: ID.innervate },
  { row: 'faerieFire', enabled: ID.faerieFire },
  { row: 'insectSwarm', enabled: ID.insectSwarm, talent: 'Insect Swarm' },
  { row: 'moonfire', enabled: ID.moonfire },
  { row: 'eclipse', enabled: ID.eclipse, talent: 'Eclipse' },
]

/**
 * The Balance settings that do nothing in this setup, with why (docs/ux.md "Rotation"; druid.md §11.5
 * "Balance's priority list"). Wrath for Eclipse (with the talent) and the Filler each cast on every
 * global cooldown there's the mana for Wrath, so the higher of the two leaves the lower nothing: in
 * the default order, the filler, since Starfire and Wrath then alternate. A row on the global cooldown
 * moved below it gets one only when that row can't be cast: `belowRowNote`, the rule every filler's
 * rows share (docs/ux.md "Rotation").
 */
export function balanceUnusedSettings(values: Record<string, RotationValue>, talents: ReadonlyMap<string, number>, order?: readonly string[]): Record<string, string> {
  const v = reader(BALANCE_OPTIONS, values, talents)
  const current = normalizeAplOrder(BALANCE_APL, order)
  const eclipseOn = v.on(ID.eclipse) && talents.has('Eclipse')
  const stopper = eclipseOn && current.indexOf('eclipse') < current.indexOf('filler') ? 'eclipse' : 'filler'
  const at = current.indexOf(stopper)
  const out: Record<string, string> = {}
  if (stopper === 'eclipse') {
    out[ID.filler] = 'Not used: Wrath for Eclipse is on. Starfire and Wrath already take turns. Turn Wrath for Eclipse off to cast only the filler.'
  }
  const note = belowRowNote(stopper === 'eclipse' ? 'Wrath for Eclipse' : 'the Filler')
  for (const { row, enabled, talent } of GCD_SWITCH_ROWS) {
    if (row === stopper || current.indexOf(row) < at || !v.on(enabled) || (talent !== undefined && !talents.has(talent))) continue
    out[enabled] = note
  }
  return out
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
 * Balance's rotation as a priority list (decision D31; druid.md §11.5 "Balance's priority list"):
 * §11.5's rows in its order, each with its switch and its own settings. Moonkin Form before the pull
 * (row 0) is pinned first; it has nothing to set. Starfire with Clearcasting (row 7), a step the
 * priority always had, and the Filler (row 9) are rows without a switch. The mana potion and rune are
 * spec-wide, above the list; they take their turn just before the first row on the global cooldown,
 * wherever it sits (after Power Infusion in the default order, as before the list).
 */
export const BALANCE_APL: AplDefinition = {
  rows: [
    {
      id: 'prepull',
      label: 'Before the pull',
      icon: FORM_ICON.moonkin,
      optionIds: [],
      summary: [{ text: 'Moonkin Form' }],
      help: 'You’re in Moonkin Form from before the pull. It always comes first.',
      pinned: true,
    },
    { id: 'racial', label: 'Racial cooldown', icon: ELUNES_LIGHT.icon, enabledId: ID.racial, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'trinkets', label: 'On-use trinkets', icon: 'inv_jewelry_talisman_01', enabledId: ID.trinkets, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'powerInfusion', label: 'Power Infusion', icon: POWER_INFUSION.icon, enabledId: ID.powerInfusion, optionIds: [], summary: [{ text: 'once, at the pull' }] },
    {
      id: 'innervate',
      label: 'Innervate yourself',
      icon: INNERVATE.icon,
      enabledId: ID.innervate,
      optionIds: [ID.innervateMana],
      summary: [{ option: ID.innervateMana, text: 'at or below {}' }],
    },
    { id: 'faerieFire', label: 'Faerie Fire', icon: FAERIE_FIRE_MOONKIN.icon, enabledId: ID.faerieFire, optionIds: [], summary: [{ text: 'when it’s off the boss' }] },
    {
      id: 'insectSwarm',
      label: 'Insect Swarm',
      icon: INSECT_SWARM.icon,
      enabledId: ID.insectSwarm,
      optionIds: [ID.dotsLeft],
      summary: [{ text: 'when it’s off the boss' }, { option: ID.dotsLeft, text: 'while the fight has {}' }],
    },
    {
      id: 'moonfire',
      label: 'Moonfire',
      icon: MOONFIRE.icon,
      enabledId: ID.moonfire,
      optionIds: [ID.dotsLeft],
      summary: [{ text: 'when it’s off the boss' }, { option: ID.dotsLeft, text: 'while the fight has {}' }],
    },
    {
      id: 'clearcasting',
      label: 'Clearcasting',
      icon: CLEARCASTING_ICON,
      optionIds: [],
      summary: [{ text: 'Starfire first: it’s free' }],
      help: 'With Clearcasting up, your next Starfire costs nothing, so it comes here: the most mana Clearcasting can save.',
    },
    {
      id: 'eclipse',
      label: 'Wrath for Eclipse',
      icon: ECLIPSE.icon,
      enabledId: ID.eclipse,
      optionIds: [],
      summary: [{ text: 'Starfire on its charges, Wrath to build them' }],
    },
    {
      id: 'filler',
      label: 'Filler',
      icon: STARFIRE.icon,
      optionIds: [ID.filler],
      // While Wrath for Eclipse above it is on, the filler is never reached: the row says so in
      // place of this, from its setting's note (balanceUnusedSettings), dimmed.
      summary: [{ option: ID.filler, text: '{}' }],
      help: 'What you cast the rest of the time, and Wrath when there isn’t the mana for Starfire.',
    },
  ],
  specWide: [ID.manaPotion, ID.manaPotionMissing, ID.rune, ID.runeMissing],
  presets: [],
}

/**
 * The Balance priority list from the settings (druid.md §11.5), its rows in `order` (BALANCE_APL;
 * absent: the default order). `talents` resolves the spells and gates Insect Swarm and Eclipse;
 * `auraIndex` finds Clearcasting's and Eclipse's auras; `context` gives the race (Elune's Light), the
 * equipped on-use trinkets, the selected consumables and Power Infusion, and the maximum mana the
 * thresholds are shares of. No row reads another's ability, so a row's lines are the same wherever it
 * sits.
 */
export function balanceRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  context: Partial<ClassRotationContext> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx: ClassRotationContext = { ...NO_CONTEXT, equipped: new Set(), othersBleed: false, front: false, ...context }
  const v = reader(BALANCE_OPTIONS, values, talents)
  const b = new BalanceRotationBuilder(talents)
  const maxManaTenths = 10 * (ctx.maxMana ?? 0)
  const pi = ctx.consumables.find((c) => c.id === POWER_INFUSION.id)
  const manaConsumables = [
    [MANA_POTION, ID.manaPotion, ID.manaPotionMissing],
    [MANA_RUNE, ID.rune, ID.runeMissing],
  ] as const
  // What the rotation can press: the on-use trinkets, Power Infusion and the mana consumables selected in Buffs.
  const pressed: string[] = [
    ...ctx.items.map((i) => i.id),
    ...(pi ? [pi.id] : []),
    ...manaConsumables.map(([id]) => id).filter((id) => ctx.consumables.some((c) => c.id === id)),
  ]

  /**
   * Before the first row on the GCD, wherever it sits (after Power Infusion in the default order): row
   * 2, the mana potion and rune (off the GCD) when selected in Buffs, spec-wide settings that take
   * their turn here, each once you're missing its mana.
   */
  let gcdStarted = false
  const onGcd = (emit: () => void) => () => {
    if (!gcdStarted) {
      gcdStarted = true
      for (const [id, setting, missing] of manaConsumables) {
        const use = ctx.consumables.find((c) => c.id === id)
        if (use && v.on(setting)) b.add(consumable(use), [{ code: COND.maxMana, a: maxManaTenths - 10 * v.num(missing), b: 0 }])
      }
    }
    emit()
  }
  // The DoTs' upkeep: back on once they're off the boss, while the fight has time for their ticks.
  const left = timeLeftAtLeast(1000 * v.num(ID.dotsLeft))

  compileAplRows(BALANCE_APL, order, {
    // --- Off the GCD, on cooldown from the pull: nothing in the list is worth saving them for (row 1) --
    racial: () => {
      if (ctx.race === 'alliance-night-elf' && v.on(ID.racial)) b.add(ELUNES_LIGHT, [])
    },
    trinkets: () => {
      if (v.on(ID.trinkets)) for (const item of ctx.items) b.add(consumable(item), [])
    },
    powerInfusion: () => {
      if (pi && v.on(ID.powerInfusion)) b.add(consumable(pi), [])
    },
    // --- On the GCD --------------------------------------------------------------------------------------
    // Row 3: Innervate on yourself at or below x% mana.
    innervate: onGcd(() => {
      if (v.on(ID.innervate)) b.add(INNERVATE, [{ code: COND.maxMana, a: Math.round((v.num(ID.innervateMana) / 100) * maxManaTenths), b: 0 }])
    }),
    // Row 4: Faerie Fire's upkeep, when it's your duty.
    faerieFire: onGcd(() => {
      if (v.on(ID.faerieFire)) b.add(FAERIE_FIRE_MOONKIN, [refresh(b.ability(FAERIE_FIRE_MOONKIN))])
    }),
    // Rows 5 and 6: Insect Swarm (with the talent) and Moonfire once they're off the boss.
    insectSwarm: onGcd(() => {
      if (v.on(ID.insectSwarm) && talents.has('Insect Swarm')) b.add(INSECT_SWARM, [refresh(b.ability(INSECT_SWARM)), left])
    }),
    moonfire: onGcd(() => {
      if (v.on(ID.moonfire)) b.add(MOONFIRE, [refresh(b.ability(MOONFIRE)), left])
    }),
    // Row 7: Starfire with Clearcasting: the most mana it can save.
    clearcasting: onGcd(() => {
      const clearcasting = auraIndex(CLEARCASTING.id)
      if (clearcasting >= 0) b.add(STARFIRE, [{ code: COND.auraUp, a: clearcasting, b: 0 }])
    }),
    // Row 8: Eclipse: Starfire on its charges, and Wrath to build them when there are none.
    eclipse: onGcd(() => {
      const eclipse = auraIndex(ECLIPSE_AURA.id)
      if (!v.on(ID.eclipse) || eclipse < 0) return
      b.add(STARFIRE, [{ code: COND.auraStacksAtLeast, a: eclipse, b: 1 }])
      b.add(WRATH, [])
    }),
    // Row 9: the filler, and Wrath when there isn't the mana for Starfire.
    filler: onGcd(() => {
      if (v.str(ID.filler) === 'wrath') b.add(WRATH, [])
      else {
        b.add(STARFIRE, [])
        b.add(WRATH, [])
      }
    }),
  })
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
