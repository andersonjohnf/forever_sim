// The warlock's priority lists and their settings (docs/classes/warlock.md §6), Destruction's and
// Affliction's: the Classic Era common priority adapted to Forever, with a first quick search (D27).
// Setting ids are `warlock.<spec>.<ability>.<param>`; mana thresholds are percentages of maximum mana.
// Abilities are resolved with the build's talents (talents.ts) before their costs or spells feed anything.
import type { ProcSpec } from '../../effects/types'
import { type AbilityDef, COND, NO_PREPULL, type RotationCondition, type RotationEntry } from '../../plan/types'
import type { RotationOption, RotationValue } from '../../types'
import type { PaladinContext } from '../paladin/setup'
import { NO_CONTEXT, reader, type ClassRotation } from '../warrior/shared'
import {
  BANE_OF_AGONY,
  BANE_OF_DOOM,
  CONFLAGRATE,
  consumable,
  CORRUPTION,
  CURSE_OF_THE_ELEMENTS,
  demonicSacrifice,
  IMMOLATE,
  improvedShadowBoltProc,
  INCINERATE,
  lifeTap,
  PREPULL_SACRIFICE_MS,
  type Sacrifice,
  SHADOW_BOLT,
  SHADOW_TRANCE,
  shadowAndFlameProcs,
  SHADOWBURN,
  SIPHON_LIFE,
  WARLOCK_RACIALS,
} from './abilities'
import { rank, type TalentRanks, withTalents } from './talents'

/** Buff catalogue ids of the consumables and caster buffs the rotations use (effects/buffs.ts). */
export const MANA_POTION = 'majorManaPotion'
export const MANA_RUNE = 'demonicRune'
export const POWER_INFUSION = 'powerInfusion'
export const CURSE_BUFF = 'curseOfTheElements'

export type WarlockSpec = 'destruction' | 'affliction'

/** The settings ids of a spec. */
export const warlockIds = (spec: WarlockSpec) => {
  const S = `warlock.${spec}`
  return {
    racial: `${S}.racial.enabled`,
    trinkets: `${S}.trinkets.enabled`,
    powerInfusion: `${S}.powerInfusion.enabled`,
    sacrifice: `${S}.demonicSacrifice.demon`,
    curse: `${S}.curseOfTheElements.enabled`,
    immolate: `${S}.immolate.enabled`,
    conflagrate: `${S}.conflagrate.enabled`,
    shadowburn: `${S}.shadowburn.enabled`,
    filler: `${S}.filler.spell`,
    corruption: `${S}.corruption.enabled`,
    bane: `${S}.bane.spell`,
    siphonLife: `${S}.siphonLife.enabled`,
    lifeTap: `${S}.lifeTap.maxManaPct`,
    manaPotion: `${S}.manaPotion.enabled`,
    manaPotionMissing: `${S}.manaPotion.missingMana`,
    rune: `${S}.rune.enabled`,
    runeMissing: `${S}.rune.missingMana`,
  }
}

/** The defaults each spec's search picked (warlock.md §6.3), the rest the common priority's. */
export interface WarlockDefaults {
  sacrifice: Sacrifice
  filler: 'shadowBolt' | 'incinerate'
  shadowburn: boolean
  lifeTapPct: number
  corruption: boolean
  bane: 'agony' | 'doom' | 'none'
}

const common = (spec: WarlockSpec, d: WarlockDefaults): { head: RotationOption[]; tail: RotationOption[] } => {
  const ID = warlockIds(spec)
  return {
    head: [
      {
        kind: 'choice',
        id: ID.sacrifice,
        group: 'Cooldowns and buffs',
        label: 'Demonic Sacrifice',
        help: 'The demon you sacrifice before the pull, for 2 hours: the Imp gives +15% Shadow damage, the Succubus +15% Fire damage, the Voidwalker 2% of your mana every 4 s. Needs the talent. Your pet itself isn’t simulated yet.',
        choices: [
          { value: 'imp', label: 'Imp' },
          { value: 'succubus', label: 'Succubus' },
          { value: 'voidwalker', label: 'Voidwalker' },
          { value: 'none', label: 'None' },
        ],
        default: d.sacrifice,
      },
      {
        kind: 'toggle',
        id: ID.racial,
        group: 'Cooldowns and buffs',
        label: 'Racial cooldown',
        help: 'Use Blood Fury (Orc: +10% spell power for 15 s) or Berserking (Troll: +10% casting speed for 10 s) on cooldown from the pull.',
        default: true,
      },
      {
        kind: 'toggle',
        id: ID.trinkets,
        group: 'Cooldowns and buffs',
        label: 'On-use trinkets',
        help: 'Use the on-use trinkets the sim models on cooldown, if you wear them. Others are listed as not simulated.',
        default: true,
      },
      {
        kind: 'toggle',
        id: ID.powerInfusion,
        group: 'Cooldowns and buffs',
        label: 'Power Infusion',
        help: 'Take a priest’s Power Infusion on cooldown from the pull: +20% spell damage for 15 s, every 3 minutes.',
        default: true,
        requiresBuff: POWER_INFUSION,
      },
      {
        kind: 'toggle',
        id: ID.curse,
        group: 'Core abilities',
        label: 'Curse of the Elements',
        help: 'Keep your own Curse of the Elements on the boss: +10% damage taken from every magic school. Off: another warlock’s, if you turn it on in Buffs.',
        default: true,
        maintainsBuff: CURSE_BUFF,
      },
    ],
    tail: [
      {
        kind: 'number',
        id: ID.lifeTap,
        // Destruction's filler is a choice, under Fillers with it; Affliction's is always Shadow Bolt.
        group: spec === 'destruction' ? 'Fillers' : 'Core abilities',
        label: 'Life Tap at',
        help: 'Life Tap when your mana is at or below this share of your maximum: 424 mana plus your Spirit, more with Improved Life Tap. You also Life Tap whenever you can’t pay for your filler.',
        unit: '% mana',
        min: 0,
        max: 100,
        step: 5,
        default: d.lifeTapPct,
      },
      {
        kind: 'toggle',
        id: ID.manaPotion,
        group: 'Consumables',
        label: 'Major Mana Potion',
        help: 'Drink one every 2 minutes, once all it can restore (up to 2,250 mana) fits.',
        default: true,
        requiresBuff: MANA_POTION,
      },
      {
        kind: 'number',
        id: ID.manaPotionMissing,
        group: 'Consumables',
        label: 'Major Mana Potion when missing',
        help: 'Drink it when you’re missing at least this much mana. 2,250 is the most it restores.',
        unit: 'mana',
        min: 0,
        max: 5000,
        step: 50,
        default: 2250,
        dependsOn: ID.manaPotion,
      },
      {
        kind: 'toggle',
        id: ID.rune,
        group: 'Consumables',
        label: 'Demonic Rune',
        help: 'Use one every 2 minutes, apart from the potion’s cooldown, once all it can restore (up to 1,500 mana) fits.',
        default: true,
        requiresBuff: MANA_RUNE,
      },
      {
        kind: 'number',
        id: ID.runeMissing,
        group: 'Consumables',
        label: 'Demonic Rune when missing',
        help: 'Use it when you’re missing at least this much mana. 1,500 is the most it restores.',
        unit: 'mana',
        min: 0,
        max: 5000,
        step: 50,
        default: 1500,
        dependsOn: ID.rune,
      },
    ],
  }
}

/** Corruption and the Bane, both specs' (warlock.md §6.1, §6.2). */
const dots = (spec: WarlockSpec, d: WarlockDefaults): RotationOption[] => {
  const ID = warlockIds(spec)
  return [
    {
      kind: 'toggle',
      id: ID.corruption,
      group: 'Core abilities',
      label: 'Corruption',
      help:
        spec === 'affliction'
          ? 'Keep Corruption on the boss, recast as it runs out. Its ticks give Nightfall’s Shadow Trance: an instant Shadow Bolt.'
          : 'Keep Corruption on the boss, recast as it runs out: a 2 s cast, instant with Improved Corruption.',
      default: d.corruption,
    },
    {
      kind: 'choice',
      id: ID.bane,
      group: 'Core abilities',
      label: 'Bane',
      help: 'Your one Bane on the boss, beside your curse: Bane of Agony, kept up, or Bane of Doom, a big hit a minute after it lands, cast only while a minute is left (then Agony for the rest).',
      choices: [
        { value: 'agony', label: 'Agony' },
        { value: 'doom', label: 'Doom' },
        { value: 'none', label: 'None' },
      ],
      default: d.bane,
    },
  ]
}

/** Destruction's settings, in priority order (warlock.md §6.1). */
export function destructionOptions(d: WarlockDefaults): RotationOption[] {
  const ID = warlockIds('destruction')
  const { head, tail } = common('destruction', d)
  return [
    ...head,
    {
      kind: 'toggle',
      id: ID.immolate,
      group: 'Core abilities',
      label: 'Immolate',
      help: 'Keep Immolate on the boss, recast as it runs out. Conflagrate needs it, and Incinerate deals 25% more to it.',
      default: true,
    },
    {
      kind: 'toggle',
      id: ID.conflagrate,
      group: 'Core abilities',
      label: 'Conflagrate',
      help: 'Use Conflagrate whenever it’s ready and your Immolate is on the boss. It consumes the Immolate, unless Shadow and Flame keeps it.',
      default: true,
      requires: { talent: 'Conflagrate' },
      dependsOn: ID.immolate,
    },
    {
      kind: 'toggle',
      id: ID.shadowburn,
      group: 'Core abilities',
      label: 'Shadowburn',
      help: 'Use Shadowburn whenever it’s ready: an instant Shadow hit every 15 s. Its Soul Shard isn’t tracked: you’re taken to have enough.',
      default: d.shadowburn,
      requires: { talent: 'Shadowburn' },
    },
    ...dots('destruction', d),
    {
      kind: 'choice',
      id: ID.filler,
      group: 'Fillers',
      label: 'Filler',
      help: 'Cast between the rest: Shadow Bolt, whose crits put Improved Shadow Bolt on the boss, or Incinerate (a talent), a shorter Fire cast with 25% more damage on a target with your Immolate.',
      choices: [
        { value: 'shadowBolt', label: 'Shadow Bolt' },
        { value: 'incinerate', label: 'Incinerate' },
      ],
      default: d.filler,
    },
    ...tail,
  ]
}

/** Affliction's settings, in priority order (warlock.md §6.2). */
export function afflictionOptions(d: WarlockDefaults): RotationOption[] {
  const ID = warlockIds('affliction')
  const { head, tail } = common('affliction', d)
  return [
    ...head,
    ...dots('affliction', d),
    {
      kind: 'toggle',
      id: ID.siphonLife,
      group: 'Core abilities',
      label: 'Siphon Life',
      help: 'Keep Siphon Life on the boss, recast as it runs out. Its ticks never crit, and its healing isn’t simulated.',
      default: true,
      requires: { talent: 'Siphon Life' },
    },
    ...tail,
  ]
}

/** The on-use trinkets the warlock presses: none of the modelled ones are a caster's yet (effects/items.ts). */
const CASTER_TRINKETS = new Set<string>()

/** A fight's last moment a Bane of Doom is worth casting: its one tick lands 60 s later, before the fight ends. */
export const DOOM_MIN_LEFT_MS = 61000

/**
 * A priority list from the settings (warlock.md §6). `context` gives the maximum mana (the mana
 * thresholds are shares of it, and the Voidwalker's Fel Energy 2% of it), the Spirit (Life Tap's
 * mana), the race (its racial cooldown), the equipped items and the selected consumables.
 */
export function warlockRotation(
  spec: WarlockSpec,
  options: RotationOption[],
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  context: Partial<PaladinContext & { spirit: number }> = {},
): ClassRotation {
  const ctx = { ...NO_CONTEXT, ...context }
  const ID = warlockIds(spec)
  const v = reader(options, values, talents)
  const abilities: AbilityDef[] = []
  const rotation: RotationEntry[] = []
  const procs: ProcSpec[] = []
  const index = (def: AbilityDef): number => {
    const i = abilities.findIndex((a) => a.id === def.id)
    if (i >= 0) return i
    abilities.push(withTalents(def, talents))
    return abilities.length - 1
  }
  const add = (def: AbilityDef, conditions: RotationCondition[] = []) => {
    const a = index(def)
    rotation.push({ ability: a, conditions, unqueueBelowTenths: 0 })
    return a
  }
  /** Recast a DoT or curse as it runs out: down, or with at most its cast time left, so the new one lands as the old one ends. */
  const upkeep = (def: AbilityDef, extra: RotationCondition[] = []) => {
    const a = index(def)
    rotation.push({ ability: a, conditions: [{ code: COND.abilityAuraRefresh, a, b: abilities[a].castMs }, ...extra], unqueueBelowTenths: 0 })
    return a
  }
  const maxMana = ctx.maxMana ?? 0
  const maxManaTenths = 10 * maxMana
  const prepull: ClassRotation['prepull'] = { ...NO_PREPULL, casts: [] }
  const pressed: string[] = ctx.items.map((i) => i.id)

  // Before the pull: Demonic Sacrifice's buff, with no pet (warlock.md §3.4).
  const sacrifice = v.str(ID.sacrifice) as Sacrifice
  if (sacrifice !== 'none' && rank(talents, 'Demonic Sacrifice') > 0) {
    prepull.casts.push({ ability: index(demonicSacrifice(sacrifice, maxMana)), atMs: PREPULL_SACRIFICE_MS })
  }

  // Off the GCD, on cooldown from the pull: the racial, on-use trinkets and Power Infusion.
  const racial = WARLOCK_RACIALS[ctx.race]
  if (racial && v.on(ID.racial)) add(racial)
  if (v.on(ID.trinkets)) for (const item of ctx.items) if (CASTER_TRINKETS.has(item.id)) add(consumable(item))
  const infusion = ctx.consumables.find((c) => c.id === POWER_INFUSION)
  if (infusion) {
    pressed.push(POWER_INFUSION)
    if (v.on(ID.powerInfusion)) add(consumable(infusion))
  }
  // The mana potion and rune (off the GCD), when selected in Buffs: once the most they restore fits.
  for (const [id, setting, missing] of [
    [MANA_POTION, ID.manaPotion, ID.manaPotionMissing],
    [MANA_RUNE, ID.rune, ID.runeMissing],
  ] as const) {
    const use = ctx.consumables.find((c) => c.id === id)
    if (!use) continue
    pressed.push(id)
    if (v.on(setting)) add(consumable(use), [{ code: COND.maxMana, a: maxManaTenths - 10 * v.num(missing), b: 0 }])
  }

  // Your curse, then the DoTs, each recast as it runs out.
  if (v.on(ID.curse)) upkeep(CURSE_OF_THE_ELEMENTS)
  const shadowBolt = () => index({ ...SHADOW_BOLT, ...(rank(talents, 'Nightfall') > 0 && spec === 'affliction' ? { stackAuraId: SHADOW_TRANCE.id, stackCastPct: 100, stackCostPct: 0 } : {}) })
  /** Corruption, then the Bane: Doom while a minute is left, then Agony for the last minute; or Agony kept up. */
  const dotsAndBane = () => {
    if (v.on(ID.corruption)) upkeep(CORRUPTION)
    const bane = v.str(ID.bane)
    if (bane === 'agony') upkeep(BANE_OF_AGONY)
    if (bane === 'doom') {
      const doom = upkeep(BANE_OF_DOOM, [{ code: COND.timeLeftAtLeast, a: DOOM_MIN_LEFT_MS, b: 0 }])
      // Then Agony for the last minute, once the last Doom has landed.
      upkeep(BANE_OF_AGONY, [
        { code: COND.timeLeftAtMost, a: DOOM_MIN_LEFT_MS, b: 0 },
        { code: COND.abilityAuraDown, a: doom, b: 0 },
      ])
    }
  }
  if (spec === 'destruction') {
    const immolate = v.on(ID.immolate)
    if (immolate) upkeep(IMMOLATE)
    if (immolate && v.on(ID.conflagrate) && rank(talents, 'Conflagrate') > 0) add(CONFLAGRATE)
    if (v.on(ID.shadowburn) && rank(talents, 'Shadowburn') > 0) add(SHADOWBURN)
    dotsAndBane()
  } else {
    dotsAndBane()
    if (v.on(ID.siphonLife) && rank(talents, 'Siphon Life') > 0) upkeep(SIPHON_LIFE)
  }

  // An instant Shadow Bolt on Nightfall's Shadow Trance (its talent's proc, talents.ts, puts the aura
  // in the plan) comes before the rest of the fillers.
  const trance = auraIndex(SHADOW_TRANCE.id)
  if (spec === 'affliction' && trance >= 0) rotation.push({ ability: shadowBolt(), conditions: [{ code: COND.auraUp, a: trance, b: 0 }], unqueueBelowTenths: 0 })

  // Life Tap at x% mana, then the filler, then Life Tap whenever the filler can't be paid for.
  const tap = lifeTap(context.spirit ?? 0, rank(talents, 'Improved Life Tap'))
  const tapPct = v.num(ID.lifeTap)
  if (tapPct > 0) add(tap, [{ code: COND.maxMana, a: Math.floor((tapPct / 100) * maxManaTenths), b: 0 }])
  const filler = spec === 'destruction' && v.str(ID.filler) === 'incinerate' && rank(talents, 'Incinerate') > 0 ? index(INCINERATE) : shadowBolt()
  rotation.push({ ability: filler, conditions: [], unqueueBelowTenths: 0 })
  add(tap)

  // Improved Shadow Bolt's debuff and Shadow and Flame's buffs, with the spells that fire them (warlock.md §4.1).
  const used = (id: string) => abilities.some((a) => a.id === id)
  const isb = rank(talents, 'Improved Shadow Bolt')
  if (isb > 0 && used('shadowBolt')) procs.push(improvedShadowBoltProc(isb))
  const snf = rank(talents, 'Shadow and Flame')
  if (snf > 0) {
    const [shadow, fire] = shadowAndFlameProcs(snf)
    if (used('conflagrate')) procs.push(shadow)
    if (used('shadowburn')) procs.push(fire)
  }

  return { abilities, rotation, prepull, onUse: pressed, procs }
}

/** Setting ids a race or talent makes do nothing, each with the Rotation tab's note (docs/ux.md "Rotation"). */
export function warlockUnusedSettings(spec: WarlockSpec, values: Record<string, RotationValue>, talents: TalentRanks): Record<string, string> {
  const ID = warlockIds(spec)
  const out: Record<string, string> = {}
  if (rank(talents, 'Demonic Sacrifice') === 0) out[ID.sacrifice] = 'Not used: Demonic Sacrifice isn’t in your talents.'
  if (spec === 'destruction' && rank(talents, 'Incinerate') === 0 && values[ID.filler] === 'incinerate') out[ID.filler] = 'Incinerate isn’t in your talents, so Shadow Bolt is the filler.'
  return out
}
