// The mage's priority lists and their settings (docs/classes/mage.md "Fire priority", "Frost
// priority", "Arcane priority"): the Classic Era common priority adapted to Forever, with the first-pass
// search of decision D27 (mage.md "First-pass defaults"). Setting ids are `mage.<spec>.<ability>.<param>`;
// mana thresholds are shares of maximum mana. Abilities are resolved with the build's talents
// (talents.ts) before their costs or spells feed anything.
import type { OnUseSpec } from '../../effects/types'
import { type AbilityDef, COND, NO_PREPULL, type RotationCondition, type RotationEntry } from '../../plan/types'
import type { RotationOption, RotationValue, SpecId } from '../../types'
import type { PaladinContext } from '../paladin/setup'
import { CASTER_RACIALS } from '../caster-racials'
import { NO_CONTEXT, reader, type ClassRotation } from '../warrior/shared'
import {
  ARCANE_MISSILES,
  ARCANE_POWER,
  CASTER_ROW_CAST,
  COMBUSTION,
  EVOCATION,
  FIRE_BLAST,
  FIREBALL,
  FROSTBOLT,
  ICE_BARRIER,
  MANA_CITRINE,
  MANA_RUBY,
  GEM_CATEGORY,
  PRESENCE_OF_MIND,
  PYROBLAST,
  SCORCH,
} from './abilities'
import { FIRE_VULNERABILITY, HOT_STREAK, rank, type TalentRanks, withTalents } from './talents'

/** Buff catalogue ids of the consumables the rotations use (effects/buffs.ts). */
export const MANA_POTION = 'majorManaPotion'
export const MANA_RUNE = 'demonicRune'
export const POWER_INFUSION = 'powerInfusion'

type Spec = 'fire' | 'frost' | 'arcane'
const SPEC_OF: Partial<Record<SpecId, Spec>> = { 'mage-fire': 'fire', 'mage-frost': 'frost', 'mage-arcane': 'arcane' }

/** The setting ids of one spec. */
const ids = (spec: Spec) => {
  const S = `mage.${spec}`
  return {
    racial: `${S}.racial.enabled`,
    trinkets: `${S}.trinkets.enabled`,
    powerInfusion: `${S}.powerInfusion.enabled`,
    combustion: `${S}.combustion.enabled`,
    arcanePower: `${S}.arcanePower.enabled`,
    presenceOfMind: `${S}.presenceOfMind.enabled`,
    scorch: `${S}.scorch.enabled`,
    scorchRefresh: `${S}.scorch.refreshSec`,
    pyroblast: `${S}.pyroblast.enabled`,
    pyroblastStacks: `${S}.pyroblast.minStacks`,
    fireBlast: `${S}.fireBlast.enabled`,
    iceBarrier: `${S}.iceBarrier.enabled`,
    evocation: `${S}.evocation.enabled`,
    evocationMana: `${S}.evocation.maxManaPct`,
    gems: `${S}.manaGems.enabled`,
    manaPotion: `${S}.manaPotion.enabled`,
    manaPotionMissing: `${S}.manaPotion.missingMana`,
    rune: `${S}.rune.enabled`,
    runeMissing: `${S}.rune.missingMana`,
  }
}
export const MAGE_IDS = { fire: ids('fire'), frost: ids('frost'), arcane: ids('arcane') }

const COOLDOWNS = 'Cooldowns and buffs'
const CORE = 'Core abilities'
const MANA = 'Consumables'

/** The settings every spec shares, first its cooldowns, then its mana (mage.md "Mana"). */
function sharedOptions(spec: Spec): { cooldowns: RotationOption[]; mana: RotationOption[] } {
  const ID = ids(spec)
  return {
    cooldowns: [
      {
        kind: 'toggle',
        id: ID.racial,
        group: COOLDOWNS,
        label: 'Racial cooldown',
        help: 'Use Berserking (Troll: +10% casting speed for 10 s) or Blood Fury (Orc: +10% spell power for 15 s) on cooldown from the pull.',
        default: true,
      },
      {
        kind: 'toggle',
        id: ID.trinkets,
        group: COOLDOWNS,
        label: 'On-use trinkets',
        help: 'Use the on-use trinkets the sim models on cooldown if you wear them. Others aren’t simulated.',
        default: true,
      },
      {
        kind: 'toggle',
        id: ID.powerInfusion,
        group: COOLDOWNS,
        label: 'Power Infusion',
        help: 'Take a priest’s Power Infusion whenever it’s ready: +20% spell damage for 15 s, every 3 minutes.',
        default: true,
        requiresBuff: POWER_INFUSION,
      },
      {
        kind: 'toggle',
        id: ID.evocation,
        group: COOLDOWNS,
        label: 'Evocation',
        help: 'Channel Evocation (8 s: your mana regeneration ×16, all of it while casting; every 8 minutes) when you can’t pay for your next main spell, or earlier at the level below.',
        default: true,
      },
      {
        kind: 'number',
        id: ID.evocationMana,
        group: COOLDOWNS,
        label: 'Evocation at',
        help: 'Also channel it when your mana is at or below this much of your maximum. At 0%, only when your next main spell costs more than you have.',
        unit: '% mana',
        min: 0,
        max: 100,
        step: 5,
        default: 0,
        dependsOn: ID.evocation,
      },
    ],
    mana: [
      {
        kind: 'toggle',
        id: ID.gems,
        group: MANA,
        label: 'Mana gems',
        help: 'Use a Mana Ruby (1,000–1,200 mana) and a Mana Citrine (775–925), conjured before the pull, each once all it restores fits: whichever fits first, the Ruby if both do. They share a 2-minute cooldown with each other and the Demonic Rune.',
        default: true,
      },
      {
        kind: 'toggle',
        id: ID.manaPotion,
        group: MANA,
        label: 'Major Mana Potion',
        help: 'Drink one every 2 minutes, once all it can restore (up to 2,250 mana) fits.',
        default: true,
        requiresBuff: MANA_POTION,
      },
      {
        kind: 'number',
        id: ID.manaPotionMissing,
        group: MANA,
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
        group: MANA,
        label: 'Demonic Rune',
        help: 'Use one once all it can restore (up to 1,500 mana) fits, after your mana gems: they share a 2-minute cooldown.',
        default: true,
        requiresBuff: MANA_RUNE,
      },
      {
        kind: 'number',
        id: ID.runeMissing,
        group: MANA,
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

/** Fire: Combustion, Scorch for Improved Scorch's stacks, Pyroblast on Hot Streak, Fire Blast, Fireball (mage.md "Fire priority"). */
function fireOptions(): RotationOption[] {
  const ID = ids('fire')
  const { cooldowns, mana } = sharedOptions('fire')
  return [
    {
      kind: 'toggle',
      id: ID.combustion,
      group: COOLDOWNS,
      label: 'Combustion',
      help: 'Use it on cooldown from the pull: each Fire spell that hits adds +10% Fire crit until 4 Fire crits end it. Its 3-minute cooldown starts as it ends.',
      default: true,
      requires: { talent: 'Combustion' },
    },
    ...cooldowns,
    {
      kind: 'toggle',
      id: ID.scorch,
      group: CORE,
      label: 'Scorch for Fire Vulnerability',
      help: 'Cast Scorch until Improved Scorch has 5 stacks (+15% Fire damage from you for 30 s), and again before they run out.',
      default: true,
      requires: { talent: 'Improved Scorch' },
    },
    {
      kind: 'number',
      id: ID.scorchRefresh,
      group: CORE,
      label: 'Scorch again with',
      help: 'Refresh the stacks when they have at most this long left. Scorch lands 1.5 s after you start it.',
      unit: 's left',
      min: 2,
      max: 25,
      step: 1,
      default: 5,
      dependsOn: ID.scorch,
    },
    {
      kind: 'toggle',
      id: ID.pyroblast,
      group: CORE,
      label: 'Pyroblast on Hot Streak',
      help: 'Cast Pyroblast once Hot Streak has enough stacks: each cuts its 6 s cast by 25%, and Pyroblast uses them all.',
      default: true,
      requires: { talent: 'Hot Streak' },
    },
    {
      kind: 'number',
      id: ID.pyroblastStacks,
      group: CORE,
      label: 'Pyroblast at',
      help: 'Wait for at least this many Hot Streak stacks. Each cuts its 6 s cast by 1.5 s; at 3 it casts in 1.5 s.',
      unit: 'stacks',
      min: 1,
      max: 3,
      step: 1,
      default: 1,
      dependsOn: ID.pyroblast,
    },
    {
      kind: 'toggle',
      id: ID.fireBlast,
      group: CORE,
      label: 'Fire Blast',
      help: 'Cast Fire Blast whenever it’s ready: instant, for 340 mana. Off, you cast it only while moving, which the sim doesn’t model.',
      default: true,
    },
    ...mana,
  ]
}

/** Frost: Frostbolt, with Presence of Mind and Ice Barrier when talented (mage.md "Frost priority"). */
function frostOptions(): RotationOption[] {
  const ID = ids('frost')
  const { cooldowns, mana } = sharedOptions('frost')
  return [
    {
      kind: 'toggle',
      id: ID.presenceOfMind,
      group: COOLDOWNS,
      label: 'Presence of Mind',
      help: 'Use it on cooldown: your next Frostbolt is instant. Every 3 minutes.',
      default: true,
      requires: { talent: 'Presence of Mind' },
    },
    ...cooldowns,
    {
      kind: 'toggle',
      id: ID.iceBarrier,
      group: COOLDOWNS,
      label: 'Ice Barrier',
      help: 'Keep Ice Barrier up (480 mana, every 30 s). The sim deals no damage to you, so its shield only costs you a global cooldown and mana here; in a raid it stops pushback.',
      default: false,
      requires: { talent: 'Ice Barrier' },
    },
    ...mana,
  ]
}

/** Arcane: Arcane Power and Presence of Mind on cooldown, Pyroblast on Presence of Mind, Arcane Missiles (mage.md "Arcane priority"). */
function arcaneOptions(): RotationOption[] {
  const ID = ids('arcane')
  const { cooldowns, mana } = sharedOptions('arcane')
  return [
    {
      kind: 'toggle',
      id: ID.arcanePower,
      group: COOLDOWNS,
      label: 'Arcane Power',
      help: 'Use it on cooldown from the pull: +30% spell damage and +30% mana cost for 15 s, every 3 minutes.',
      default: true,
      requires: { talent: 'Arcane Power' },
    },
    {
      kind: 'toggle',
      id: ID.presenceOfMind,
      group: COOLDOWNS,
      label: 'Presence of Mind',
      help: 'Use it on cooldown: your next spell with a cast time is instant, a Pyroblast if you have it. Every 3 minutes.',
      default: true,
      requires: { talent: 'Presence of Mind' },
    },
    ...cooldowns,
    ...mana,
  ]
}

export const FIRE_OPTIONS = fireOptions()
export const FROST_OPTIONS = frostOptions()
export const ARCANE_OPTIONS = arcaneOptions()
export const MAGE_OPTIONS: Record<Spec, RotationOption[]> = { fire: FIRE_OPTIONS, frost: FROST_OPTIONS, arcane: ARCANE_OPTIONS }

/** A spec's options, or none for another spec. */
export const mageOptions = (spec: SpecId): RotationOption[] => (SPEC_OF[spec] ? MAGE_OPTIONS[SPEC_OF[spec]] : [])

/** An on-use item or consumable as a mage `cast`: no cost, its cooldown, GCD and buff, its mana at once (buffs doc §3.5). */
const consumable = (use: OnUseSpec, rest: Partial<AbilityDef> = {}): AbilityDef => ({
  ...CASTER_ROW_CAST,
  id: use.id,
  name: use.name,
  icon: use.icon,
  cooldownMs: use.cooldownMs,
  gcdMs: use.gcdMs,
  aura: use.aura,
  manaTenths: use.manaTenths ?? 0,
  manaSpreadTenths: use.manaSpreadTenths ?? 0,
  ...rest,
})

/**
 * A mage priority list from the settings (mage.md "Fire priority", "Frost priority", "Arcane
 * priority"). `context` gives the maximum mana (the thresholds are shares of it), the race, the
 * equipped on-use items and the selected consumables.
 */
export function mageRotation(
  specId: SpecId,
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  context: Partial<PaladinContext> = {},
): ClassRotation {
  const spec = SPEC_OF[specId] ?? 'fire'
  const ID = ids(spec)
  const ctx = { ...NO_CONTEXT, ...context }
  const v = reader(MAGE_OPTIONS[spec], values, talents)
  const abilities: AbilityDef[] = []
  const rotation: RotationEntry[] = []
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
  const maxManaTenths = 10 * (ctx.maxMana ?? 0)
  const pressed: string[] = ctx.items.map((i) => i.id)
  const has = (talent: string) => rank(talents, talent) > 0

  // Off the GCD, on cooldown from the pull: Combustion, Arcane Power, Presence of Mind, the racial,
  // trinkets and Power Infusion (mage.md "Cooldowns").
  if (spec === 'fire' && v.on(ID.combustion) && has('Combustion')) add(COMBUSTION)
  if (spec === 'arcane' && v.on(ID.arcanePower) && has('Arcane Power')) add(ARCANE_POWER)
  if (spec !== 'fire' && v.on(ID.presenceOfMind) && has('Presence of Mind')) add(PRESENCE_OF_MIND)
  const racial = CASTER_RACIALS[ctx.race]
  if (racial && v.on(ID.racial)) add(racial)
  if (v.on(ID.trinkets)) for (const item of ctx.items) add(consumable(item))
  const pi = ctx.consumables.find((c) => c.id === POWER_INFUSION)
  if (pi) {
    pressed.push(POWER_INFUSION)
    if (v.on(ID.powerInfusion)) add(consumable(pi))
  }

  // Mana (mage.md "Mana"), off the GCD, before the spells so a gem or potion goes as soon as it fits:
  // the gems, then the rune (they share category 1153), and the potion on its own cooldown.
  const missing = (mana: number): RotationCondition => ({ code: COND.maxMana, a: maxManaTenths - 10 * mana, b: 0 })
  // Each gem once all it restores fits (mage.md "Mana gems"): the Citrine's smaller restore usually
  // fits first; the Ruby, listed first, goes when both do.
  if (v.on(ID.gems)) {
    add(MANA_RUBY, [missing(1200)])
    add(MANA_CITRINE, [missing(925)])
  }
  for (const [id, setting, need] of [
    [MANA_POTION, ID.manaPotion, ID.manaPotionMissing],
    [MANA_RUNE, ID.rune, ID.runeMissing],
  ] as const) {
    const use = ctx.consumables.find((c) => c.id === id)
    if (!use) continue
    pressed.push(id)
    if (v.on(setting)) add(consumable(use, id === MANA_RUNE ? { category: GEM_CATEGORY } : {}), [missing(v.num(need))])
  }
  // Evocation at mana ≤ x% (on the GCD, a channel), before any spell, or once the spec's filler
  // (Fireball, Frostbolt, Arcane Missiles) costs more than you have, so a low threshold never leaves
  // you waiting for regeneration with Evocation ready.
  if (v.on(ID.evocation)) {
    add(EVOCATION, [{ code: COND.maxMana, a: Math.round((v.num(ID.evocationMana) / 100) * maxManaTenths), b: 0 }])
    const filler = withTalents(spec === 'fire' ? FIREBALL : spec === 'frost' ? FROSTBOLT : ARCANE_MISSILES, talents)
    add(EVOCATION, [{ code: COND.maxMana, a: filler.costTenths - 1, b: 0 }])
  }

  if (spec === 'fire') {
    // Scorch until Fire Vulnerability has 5 stacks, or when it has at most x s left.
    if (v.on(ID.scorch) && has('Improved Scorch')) {
      const scorch = index(SCORCH)
      const fv = auraIndex(FIRE_VULNERABILITY.id)
      if (fv >= 0) {
        rotation.push({ ability: scorch, conditions: [{ code: COND.auraStacksBelow, a: fv, b: 5 }], unqueueBelowTenths: 0 })
        rotation.push({ ability: scorch, conditions: [{ code: COND.auraEndsWithin, a: fv, b: 1000 * v.num(ID.scorchRefresh) }], unqueueBelowTenths: 0 })
      }
    }
    // Pyroblast at x Hot Streak stacks.
    if (v.on(ID.pyroblast) && has('Hot Streak') && has('Pyroblast')) {
      const pyro = index(PYROBLAST)
      const hs = auraIndex(HOT_STREAK.id)
      const stacks = Math.max(1, Math.min(3, Math.round(v.num(ID.pyroblastStacks))))
      if (hs >= 0) rotation.push({ ability: pyro, conditions: [{ code: COND.auraStacksAtLeast, a: hs, b: stacks }], unqueueBelowTenths: 0 })
    }
    if (v.on(ID.fireBlast)) add(FIRE_BLAST)
    add(FIREBALL)
  } else if (spec === 'frost') {
    if (v.on(ID.iceBarrier) && has('Ice Barrier')) add(ICE_BARRIER)
    add(FROSTBOLT)
  } else {
    // Presence of Mind's instant spell: a Pyroblast if you have it (Classic Era's AP/PoM), else the next Arcane Missiles' turn.
    if (v.on(ID.presenceOfMind) && has('Presence of Mind') && has('Pyroblast')) {
      add(PYROBLAST, [{ code: COND.abilityAuraUp, a: index(PRESENCE_OF_MIND), b: 0 }])
    }
    add(ARCANE_MISSILES)
  }

  return { abilities, rotation, prepull: NO_PREPULL, onUse: pressed, procs: [] }
}
