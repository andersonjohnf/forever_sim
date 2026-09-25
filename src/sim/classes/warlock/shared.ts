// The warlock's priority lists and their settings (docs/classes/warlock.md §6), Destruction's and
// Affliction's: the Classic Era common priority adapted to Forever, with a first quick search (D27).
// Setting ids are `warlock.<spec>.<ability>.<param>`; mana thresholds are percentages of maximum mana.
// Abilities are resolved with the build's talents (talents.ts) before their costs or spells feed anything.
import type { ProcSpec } from '../../effects/types'
import { type AbilityDef, COND, NO_PREPULL, type RotationCondition, type RotationEntry } from '../../plan/types'
import type { AplDefinition, AplRow, AplSummaryPart, RotationOption, RotationValue } from '../../types'
import { compileAplRows } from '../apl'
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
  SEARING_PAIN,
  SHADOW_BOLT,
  SHADOW_TRANCE,
  shadowAndFlameProcs,
  SHADOWBURN,
  SIPHON_LIFE,
} from './abilities'
import { CASTER_RACIALS } from '../caster-racials'
import { eurekaFor } from '../eureka'
import { rank, type TalentRanks, withTalents } from './talents'
import {
  DECIMATION_BELOW_PCT,
  type Demon,
  DEMO_CURVE,
  demonicBrandAura,
  demonicBrandProc,
  demonicKnowledgeAura,
  demonPet,
  masterDemonologist,
  PREPULL_DEMON_MS,
  SOUL_FIRE,
  SOUL_LINK,
  talentValue,
} from './demons'

/** Buff catalogue ids of the consumables and caster buffs the rotations use (effects/buffs.ts). */
export const MANA_POTION = 'majorManaPotion'
export const MANA_RUNE = 'demonicRune'
export const POWER_INFUSION = 'powerInfusion'
export const CURSE_BUFF = 'curseOfTheElements'

export type WarlockSpec = 'destruction' | 'affliction' | 'demonology'

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
    // Demonology's (warlock.md §11.5).
    demon: `${S}.demon.summoned`,
    soulFire: `${S}.soulFire.enabled`,
    searingPain: `${S}.searingPain.enabled`,
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
  /** Demonology's (warlock.md §11.5): the demon you keep out, Immolate, and Decimation's Soul Fire. */
  demon?: Demon
  immolate?: boolean
  soulFire?: boolean
}

const common = (spec: WarlockSpec, d: WarlockDefaults): { head: RotationOption[]; tail: RotationOption[] } => {
  const ID = warlockIds(spec)
  return {
    head: [
      {
        kind: 'choice',
        id: ID.sacrifice,
        // Spec-wide, above the priority list (warlockApl). Demonology's sits with its demon, before the
        // pull; on the other two it's their only spec-wide setting that isn't a consumable, so it has no
        // heading and comes first, as the few that shape the rest do (docs/ux.md "Rotation": a heading
        // holds at least two settings).
        ...(spec === 'demonology' ? { group: 'Before the pull' as const } : {}),
        label: 'Demonic Sacrifice',
        help:
          spec === 'demonology'
            ? 'The demon you sacrifice before the pull, for 2 hours: the Imp gives +15% Shadow damage, the Succubus +15% Fire damage, the Voidwalker 2% of your mana every 4 s. Needs the talent. With Demonic Pact you keep its buff when you then summon a different demon.'
            : 'The demon you sacrifice before the pull, for 2 hours: the Imp gives +15% Shadow damage, the Succubus +15% Fire damage, the Voidwalker 2% of your mana every 4 s. Needs the talent. This spec fights with no demon out; to keep one, see Demonology.',
        choices: [
          { value: 'imp', label: 'Imp' },
          { value: 'succubus', label: 'Succubus' },
          { value: 'voidwalker', label: 'Voidwalker' },
          { value: 'none', label: 'None' },
        ],
        default: d.sacrifice,
      },
      ...(spec === 'demonology' ? demonHead(d) : []),
      {
        kind: 'toggle',
        id: ID.racial,
        group: 'Cooldowns and buffs',
        label: 'Racial cooldown',
        help: 'Use Blood Fury (Orc: +10% spell power for 15 s), Berserking (Troll: +10% casting speed for 10 s) or Eureka! (Gnome: the next 3 of the spells it covers cost 10% less and deal 10% more) on cooldown from the pull.',
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
        // Under Fillers with the filler: Life Tap is what you cast when it can't be paid for.
        group: 'Fillers',
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
    filler('destruction', d),
    ...tail,
  ]
}

/**
 * The filler, every spec's (warlock.md §6.4): Shadow Bolt, or Incinerate with the talent. Each spec's
 * default is its measured one (§6.3, §6.4); without the talent Shadow Bolt is the filler whatever it says.
 */
function filler(spec: WarlockSpec, d: WarlockDefaults): RotationOption {
  return {
    kind: 'choice',
    id: warlockIds(spec).filler,
    group: 'Fillers',
    label: 'Filler',
    help:
      spec === 'affliction'
        ? 'Cast between the rest: Shadow Bolt, whose crits put Improved Shadow Bolt on the boss, or Incinerate (a talent), a shorter Fire cast. Its 25% more on a target with your Immolate needs an Immolate, which Affliction doesn’t cast.'
        : 'Cast between the rest: Shadow Bolt, whose crits put Improved Shadow Bolt on the boss, or Incinerate (a talent), a shorter Fire cast with 25% more damage on a target with your Immolate.',
    choices: [
      { value: 'shadowBolt', label: 'Shadow Bolt' },
      { value: 'incinerate', label: 'Incinerate' },
    ],
    default: d.filler,
  }
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
    filler('affliction', d),
    ...tail,
  ]
}

/** Demonology's demon (warlock.md §11.5): the one you keep out, after the sacrifice. */
function demonHead(d: WarlockDefaults): RotationOption[] {
  const ID = warlockIds('demonology')
  return [
    {
      kind: 'choice',
      id: ID.demon,
      group: 'Before the pull',
      label: 'Demon',
      help: 'The demon you keep out, fighting beside you: the Imp casts Firebolt, the Succubus attacks and casts Lash of Pain, the Felhunter attacks. With Master Demonologist the Imp gives you both +10% Fire damage and the Succubus +10% Shadow; Soul Link and Demonic Knowledge need one out.',
      choices: [
        { value: 'imp', label: 'Imp' },
        { value: 'succubus', label: 'Succubus' },
        { value: 'felhunter', label: 'Felhunter' },
        { value: 'none', label: 'None' },
      ],
      default: d.demon ?? 'none',
    },
  ]
}

/** Demonology's settings, in priority order (warlock.md §11.5). */
export function demonologyOptions(d: WarlockDefaults): RotationOption[] {
  const ID = warlockIds('demonology')
  const { head, tail } = common('demonology', d)
  return [
    ...head,
    {
      kind: 'toggle',
      id: ID.immolate,
      group: 'Core abilities',
      label: 'Immolate',
      help: 'Keep Immolate on the boss, recast as it runs out: a Fire hit and its burn, which Master Demonologist’s Imp and a sacrificed Succubus raise.',
      default: d.immolate ?? false,
    },
    ...dots('demonology', d),
    {
      kind: 'toggle',
      id: ID.soulFire,
      group: 'Core abilities',
      label: 'Soul Fire below 35%',
      help: 'Below 35% health, cast Soul Fire whenever it’s ready: Decimation makes it 40% faster, free of its Soul Shard, and its cooldown 6 s. Needs Decimation.',
      default: d.soulFire ?? true,
      requires: { talent: 'Decimation' },
    },
    {
      kind: 'toggle',
      id: ID.searingPain,
      group: 'Core abilities',
      label: 'Searing Pain for Demonic Brand',
      help: 'Cast Searing Pain whenever your brand is off the boss: Demonic Brand makes your demon’s next 6 attacks deal 65–68 Fire (the Imp) or Shadow more, plus a little of your spell damage. Needs Demonic Brand and a demon out.',
      default: true,
      requires: { talent: 'Demonic Brand' },
    },
    filler('demonology', d),
    ...tail,
  ]
}

/**
 * The spec’s rotation as a priority list (decision D31; warlock.md §6.4): its rows, in
 * the default order, each with its switch and its own settings. The demons (the sacrifice, and
 * Demonology's demon) and the consumables are spec-wide, above the list; the potion and the rune take
 * their turn with Power Infusion's row. Nothing is pinned: the pre-pull is the sacrifice and the
 * demon, both spec-wide. After the list, always last, Life Tap whenever nothing on it can be cast.
 * The same row ids on every spec, so a row a spec gains later (a filler choice) keeps its id.
 */
export function warlockApl(spec: WarlockSpec): AplDefinition {
  const ID = warlockIds(spec)
  const onCooldown: AplSummaryPart[] = [{ text: 'on cooldown' }]
  const recast: AplSummaryPart[] = [{ text: 'recast as it runs out' }]
  const row: Record<string, AplRow> = {
    racial: { id: 'racial', label: 'Racial cooldown', icon: 'racial_orc_berserkerstrength', enabledId: ID.racial, optionIds: [], summary: onCooldown },
    trinkets: { id: 'trinkets', label: 'On-use trinkets', icon: 'inv_jewelry_talisman_01', enabledId: ID.trinkets, optionIds: [], summary: onCooldown },
    powerInfusion: { id: 'powerInfusion', label: 'Power Infusion', icon: 'spell_holy_powerinfusion', enabledId: ID.powerInfusion, optionIds: [], summary: onCooldown },
    curse: { id: 'curse', label: 'Curse of the Elements', icon: CURSE_OF_THE_ELEMENTS.icon, enabledId: ID.curse, optionIds: [], summary: [{ text: 'kept up' }] },
    immolate: { id: 'immolate', label: 'Immolate', icon: IMMOLATE.icon, enabledId: ID.immolate, optionIds: [], summary: recast },
    conflagrate: { id: 'conflagrate', label: 'Conflagrate', icon: CONFLAGRATE.icon, enabledId: ID.conflagrate, optionIds: [], summary: [{ text: 'on cooldown, while Immolate is up' }] },
    shadowburn: { id: 'shadowburn', label: 'Shadowburn', icon: SHADOWBURN.icon, enabledId: ID.shadowburn, optionIds: [], summary: onCooldown },
    corruption: { id: 'corruption', label: 'Corruption', icon: CORRUPTION.icon, enabledId: ID.corruption, optionIds: [], summary: recast },
    bane: {
      id: 'bane',
      label: 'Bane',
      icon: BANE_OF_DOOM.icon,
      optionIds: [ID.bane],
      summary: [{ option: ID.bane, text: '{}' }],
      help: 'Your one Bane on the boss. Bane of Doom is cast while a minute is left, then Bane of Agony for the last minute.',
    },
    siphonLife: { id: 'siphonLife', label: 'Siphon Life', icon: SIPHON_LIFE.icon, enabledId: ID.siphonLife, optionIds: [], summary: recast },
    soulFire: { id: 'soulFire', label: 'Soul Fire', icon: SOUL_FIRE.icon, enabledId: ID.soulFire, optionIds: [], summary: [{ text: 'below 35% health, on cooldown' }] },
    searingPain: {
      id: 'searingPain',
      label: 'Searing Pain',
      icon: SEARING_PAIN.icon,
      enabledId: ID.searingPain,
      optionIds: [],
      summary: [{ text: 'when your Demonic Brand is off the boss' }],
      help: 'Searing Pain for Demonic Brand: it brands the boss, and your demon’s next 6 attacks deal extra damage. Needs the Demonic Brand talent and a demon out.',
    },
    shadowTrance: {
      id: 'shadowTrance',
      label: 'Shadow Bolt on Shadow Trance',
      icon: 'spell_shadow_twilight',
      optionIds: [],
      summary: [{ text: 'instant, with Nightfall' }],
      help: 'An instant Shadow Bolt while Nightfall’s Shadow Trance is up. Needs the Nightfall talent.',
    },
    lifeTap: {
      id: 'lifeTap',
      label: 'Life Tap',
      icon: 'spell_shadow_burningspirit',
      optionIds: [ID.lifeTap],
      summary: [{ option: ID.lifeTap, text: 'at or below {}', zeroText: 'only when nothing can be paid for' }],
    },
    // Every spec's filler is a choice: Incinerate with the talent, or Shadow Bolt (issue #17).
    filler: { id: 'filler', label: 'Filler', icon: spec === 'destruction' ? INCINERATE.icon : SHADOW_BOLT.icon, optionIds: [ID.filler], summary: [{ option: ID.filler, text: '{}', inactiveText: 'Shadow Bolt' }] },
  }
  const ids: Record<WarlockSpec, string[]> = {
    destruction: ['racial', 'trinkets', 'powerInfusion', 'curse', 'immolate', 'conflagrate', 'shadowburn', 'corruption', 'bane', 'lifeTap', 'filler'],
    affliction: ['racial', 'trinkets', 'powerInfusion', 'curse', 'corruption', 'bane', 'siphonLife', 'shadowTrance', 'lifeTap', 'filler'],
    demonology: ['racial', 'trinkets', 'powerInfusion', 'searingPain', 'curse', 'immolate', 'corruption', 'bane', 'soulFire', 'lifeTap', 'filler'],
  }
  return {
    rows: ids[spec].map((id) => row[id]),
    specWide: [ID.sacrifice, ...(spec === 'demonology' ? [ID.demon] : []), ID.manaPotion, ID.manaPotionMissing, ID.rune, ID.runeMissing],
    presets: [],
  }
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
  /** The rows' order (`SimConfig.rotationOrder`, `warlockApl`); absent: the default. */
  order?: readonly string[],
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

  // Before the pull: Demonic Sacrifice's buff, with no pet (warlock.md §3.4). Demonology keeps a demon
  // out (§11.5): summoning one cancels the buff, unless Demonic Pact keeps it for a different demon.
  const sacrifice = v.str(ID.sacrifice) as Sacrifice
  const demon: Demon = spec === 'demonology' ? (v.str(ID.demon) as Demon) : 'none'
  if (sacrifice !== 'none' && rank(talents, 'Demonic Sacrifice') > 0 && (demon === 'none' || (rank(talents, 'Demonic Pact') > 0 && sacrifice !== demon))) {
    prepull.casts.push({ ability: index(demonicSacrifice(sacrifice, maxMana)), atMs: PREPULL_SACRIFICE_MS })
  }
  // Your demon's passives on you, from before the pull (§11.4): Soul Link, Master Demonologist, Demonic Knowledge.
  const pet = demonPet(demon, talents)
  if (pet) {
    if (rank(talents, 'Soul Link') > 0) prepull.casts.push({ ability: index(SOUL_LINK), atMs: PREPULL_DEMON_MS })
    for (const passive of [masterDemonologist(demon, talents), demonicKnowledgeAura(talents)]) {
      if (passive) prepull.casts.push({ ability: index(passive), atMs: PREPULL_DEMON_MS })
    }
  }

  // Off the GCD, on cooldown from the pull: the racial, on-use trinkets and Power Infusion; then the
  // Major Mana Potion and Demonic Rune (off the GCD) once the most they restore fits. What the Buffs tab
  // selects is pressed (`onUse`), whether or not its row is on.
  const racial = eurekaFor(ctx.race, 'warlock') ?? CASTER_RACIALS[ctx.race]
  const infusion = ctx.consumables.find((c) => c.id === POWER_INFUSION)
  if (infusion) pressed.push(POWER_INFUSION)
  const potions = (
    [
      [MANA_POTION, ID.manaPotion, ID.manaPotionMissing],
      [MANA_RUNE, ID.rune, ID.runeMissing],
    ] as const
  ).flatMap(([id, setting, missing]) => {
    const use = ctx.consumables.find((c) => c.id === id)
    if (!use) return []
    pressed.push(id)
    return [{ use, setting, missing }]
  })

  const shadowBolt = () => index({ ...SHADOW_BOLT, ...(rank(talents, 'Nightfall') > 0 && spec === 'affliction' ? { stackAuraId: SHADOW_TRANCE.id, stackCastPct: 100, stackCostPct: 0 } : {}) })
  const trance = auraIndex(SHADOW_TRANCE.id)
  // Life Tap's mana (§3.3); with Demonic Energies (§11.3) your demon gains its share, if it has mana.
  const tapped = lifeTap(context.spirit ?? 0, rank(talents, 'Improved Life Tap'))
  const energies = pet?.power ? talentValue(talents, 'Demonic Energies', DEMO_CURVE.demonicEnergies) : 0
  const tap = energies > 0 ? { ...tapped, petPowerTenths: Math.floor(((tapped.manaTenths ?? 0) * energies) / 100 + 1e-9) } : tapped

  // The rows in the list's order (warlock.md §6.1, §6.2, §11.5; `warlockApl`). Each keeps its own
  // conditions wherever it sits: Conflagrate still needs Immolate's switch, and the Bane's row still
  // holds its Bane of Agony for the last minute behind the last Doom.
  compileAplRows(warlockApl(spec), order, {
    racial: () => {
      if (racial && v.on(ID.racial)) add(racial)
    },
    trinkets: () => {
      if (v.on(ID.trinkets)) for (const item of ctx.items) if (CASTER_TRINKETS.has(item.id)) add(consumable(item))
    },
    // Power Infusion, then the potion and the rune, which take their turn with it wherever it sits.
    powerInfusion: () => {
      if (infusion && v.on(ID.powerInfusion)) add(consumable(infusion))
      for (const { use, setting, missing } of potions) if (v.on(setting)) add(consumable(use), [{ code: COND.maxMana, a: maxManaTenths - 10 * v.num(missing), b: 0 }])
    },
    // Your curse and the DoTs, each recast as it runs out.
    curse: () => {
      if (v.on(ID.curse)) upkeep(CURSE_OF_THE_ELEMENTS)
    },
    immolate: () => {
      if (v.on(ID.immolate)) upkeep(IMMOLATE)
    },
    // Conflagrate needs your Immolate on the boss, so it needs Immolate's row on too.
    conflagrate: () => {
      if (v.on(ID.immolate) && v.on(ID.conflagrate) && rank(talents, 'Conflagrate') > 0) add(CONFLAGRATE)
    },
    shadowburn: () => {
      if (v.on(ID.shadowburn) && rank(talents, 'Shadowburn') > 0) add(SHADOWBURN)
    },
    corruption: () => {
      if (v.on(ID.corruption)) upkeep(CORRUPTION)
    },
    // The Bane: Doom while a minute is left, then Agony for the last minute; or Agony kept up.
    bane: () => {
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
    },
    siphonLife: () => {
      if (v.on(ID.siphonLife) && rank(talents, 'Siphon Life') > 0) upkeep(SIPHON_LIFE)
    },
    // Decimation's Soul Fire below 35% health (§11.3): 40% faster, no Soul Shard, a 6 s cooldown.
    soulFire: () => {
      if (v.on(ID.soulFire) && rank(talents, 'Decimation') > 0) add(SOUL_FIRE, [{ code: COND.healthAtMost, a: DECIMATION_BELOW_PCT, b: 0 }])
    },
    // Demonology's Searing Pain for Demonic Brand (§11.3): recast as its brand runs out (its charges, or its
    // 10 s), with the talent and a demon out to use it.
    searingPain: () => {
      const brand = demonicBrandAura(talents)
      if (spec === 'demonology' && pet && brand && v.on(ID.searingPain)) upkeep({ ...SEARING_PAIN, aura: brand })
    },
    // An instant Shadow Bolt on Nightfall's Shadow Trance (its talent's proc, talents.ts, puts the aura in the plan).
    shadowTrance: () => {
      if (trance >= 0) rotation.push({ ability: shadowBolt(), conditions: [{ code: COND.auraUp, a: trance, b: 0 }], unqueueBelowTenths: 0 })
    },
    // Life Tap at x% mana.
    lifeTap: () => {
      const tapPct = v.num(ID.lifeTap)
      if (tapPct > 0) add(tap, [{ code: COND.maxMana, a: Math.floor((tapPct / 100) * maxManaTenths), b: 0 }])
    },
    filler: () => {
      const filler = v.str(ID.filler) === 'incinerate' && rank(talents, 'Incinerate') > 0 ? index(INCINERATE) : shadowBolt()
      rotation.push({ ability: filler, conditions: [], unqueueBelowTenths: 0 })
    },
  })
  // After the list, always last: Life Tap whenever nothing on it can be cast, as when the filler can't be paid for.
  add(tap)

  // Improved Shadow Bolt's debuff and Shadow and Flame's buffs, with the spells that fire them (warlock.md §4.1).
  const used = (id: string) => abilities.some((a) => a.id === id)
  const isb = rank(talents, 'Improved Shadow Bolt')
  if (isb > 0 && used('shadowBolt')) procs.push(improvedShadowBoltProc(isb))
  // Demonic Brand's damage on your demon's attacks while Searing Pain's brand is up (§11.3).
  const brandProc = used('searingPain') ? demonicBrandProc(demon, talents) : null
  if (brandProc) procs.push(brandProc)
  const snf = rank(talents, 'Shadow and Flame')
  if (snf > 0) {
    const [shadow, fire] = shadowAndFlameProcs(snf)
    if (used('conflagrate')) procs.push(shadow)
    if (used('shadowburn')) procs.push(fire)
  }

  return { abilities, rotation, prepull, onUse: pressed, procs, ...(pet ? { pet } : {}) }
}

/** Setting ids a race or talent makes do nothing, each with the Rotation tab's note (docs/ux.md "Rotation"). */
export function warlockUnusedSettings(spec: WarlockSpec, values: Record<string, RotationValue>, talents: TalentRanks): Record<string, string> {
  const ID = warlockIds(spec)
  const out: Record<string, string> = {}
  if (rank(talents, 'Demonic Sacrifice') === 0) out[ID.sacrifice] = 'Not used: Demonic Sacrifice isn’t in your talents.'
  else if (spec === 'demonology' && values[ID.sacrifice] !== 'none') {
    // warlock.md §11.5: a summoned demon cancels the sacrifice, unless Demonic Pact keeps it for a different one.
    const demon = values[ID.demon]
    if (demon !== undefined && demon !== 'none') {
      if (rank(talents, 'Demonic Pact') === 0) out[ID.sacrifice] = 'Not used: summoning your demon cancels it without Demonic Pact.'
      else if (demon === values[ID.sacrifice]) out[ID.sacrifice] = 'Not used: summoning the demon you sacrificed cancels its buff.'
    }
  }
  // Demonology's Searing Pain for Demonic Brand needs a demon out to use its brand (§11.3); the talent's lock is its `requires`.
  if (spec === 'demonology' && rank(talents, 'Demonic Brand') > 0 && values[ID.demon] === 'none') out[ID.searingPain] = 'Not used: Demonic Brand needs your demon out.'
  // Every spec's filler choice (warlock.md §6.4): without the talent there's nothing to choose.
  if (rank(talents, 'Incinerate') === 0) out[ID.filler] = 'Not used: Incinerate isn’t in your talents, so Shadow Bolt is the filler.'
  return out
}
