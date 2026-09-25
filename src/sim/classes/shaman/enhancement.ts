// The Enhancement priority list and its settings (docs/classes/shaman.md "Enhancement priority").
//
// The weapon imbue (Windfury Weapon, or Rockbiter Weapon put on before the pull), the racial cooldown,
// Rage of the Farseer, on-use trinkets and Juju Flurry off the GCD on cooldown, then Stormstrike on
// cooldown, Lightning Bolt at 5 Maelstrom Weapon stacks (instant and free), a shock at or above a mana
// threshold, and the mana potion and rune when they fit. The rows are a priority list you reorder
// (ENHANCEMENT_APL, decision D31); the imbue and the consumables are spec-wide. Its totems are the
// Buffs tab's (their `selfCast`). Setting ids are `shaman.enhancement.<ability>.<param>`; mana
// thresholds are percentages of maximum mana. Abilities are resolved with the build's talents (talents.ts) before
// their costs or spells feed anything. The defaults are the common priority with a first-pass search
// (decision D27; shaman.md "First-pass defaults").
import type { OnUseSpec, ProcSpec } from '../../effects/types'
import { type AbilityDef, COND, NO_PREPULL, type RotationCondition, type RotationEntry } from '../../plan/types'
import type { AplDefinition, RotationOption, RotationValue } from '../../types'
import type { PaladinContext } from '../paladin/setup'
import { compileAplRows } from '../apl'
import { CASTER_RACIALS } from '../caster-racials'
import { NO_CONTEXT, reader, type ClassRotation } from '../warrior/shared'
import {
  EARTH_SHOCK,
  FROST_SHOCK,
  LIGHTNING_BOLT,
  MAELSTROM_AURA,
  RAGE_OF_THE_FARSEER,
  ROCKBITER_AP,
  rockbiterWeapon,
  SHAMAN,
  STORMSTRIKE,
  WINDFURY_WEAPON_AP,
  windfuryWeaponProc,
} from './abilities'
import { ELEMENTAL_WEAPONS_ROCKBITER, ELEMENTAL_WEAPONS_WINDFURY, rank, type TalentRanks, withTalents } from './talents'

const S = 'shaman.enhancement'
const ID = {
  imbue: `${S}.imbue`,
  racial: `${S}.racial.enabled`,
  farseer: `${S}.rageOfTheFarseer.enabled`,
  trinkets: `${S}.trinkets.enabled`,
  juju: `${S}.jujuFlurry.enabled`,
  stormstrike: `${S}.stormstrike.enabled`,
  bolt: `${S}.lightningBolt.enabled`,
  boltStacks: `${S}.lightningBolt.minStacks`,
  shock: `${S}.shock.spell`,
  shockMana: `${S}.shock.minManaPct`,
  manaPotion: `${S}.manaPotion.enabled`,
  manaPotionMissing: `${S}.manaPotion.missingMana`,
  rune: `${S}.rune.enabled`,
  runeMissing: `${S}.rune.missingMana`,
}
export const ENHANCEMENT_IDS = ID

/** Buff catalogue ids of the consumables the rotation uses (effects/buffs.ts). */
export const MANA_POTION = 'majorManaPotion'
export const MANA_RUNE = 'demonicRune'
export const JUJU_FLURRY = 'jujuFlurry'

/** Totem of Rage (22395): "Increases the damage of your Shock spells by 2%" (27859) [F] [client] (SpellEffect, 1.60.1.69913). */
export const TOTEM_OF_RAGE = 22395
export const TOTEM_OF_RAGE_PCT = 2
/**
 * Totem of the Storm (23199): "Increases damage done by Chain Lightning and Lightning Bolt by up to 33"
 * (28857) [F] [client] (SpellEffect, 1.60.1.69913), read as 33 spell damage for those spells [?]
 * (shaman.md#elemental-defaults).
 */
export const TOTEM_OF_THE_STORM = 23199
export const TOTEM_OF_THE_STORM_SP = 33

/**
 * Defaults from shaman.md's "Enhancement priority", in priority order: the Classic Era common
 * priority adapted to Forever, with the first-pass search of decision D27 (shaman.md "First-pass
 * defaults").
 */
export const ENHANCEMENT_OPTIONS: RotationOption[] = [
  {
    kind: 'choice',
    id: ID.imbue,
    group: 'Cooldowns and buffs',
    label: 'Weapon imbue',
    help: 'Windfury Weapon: each hit has a 20% chance, at most every 1.5 s, of 2 extra attacks with more attack power. Rockbiter Weapon: +653 attack power all fight. Either takes your main hand’s temporary enchant, and Windfury Weapon turns off Windfury Totem for you.',
    choices: [
      { value: 'windfury', label: 'Windfury' },
      { value: 'rockbiter', label: 'Rockbiter' },
    ],
    default: 'windfury',
  },
  {
    kind: 'toggle',
    id: ID.racial,
    group: 'Cooldowns and buffs',
    label: 'Racial cooldown',
    help: 'Use Blood Fury (Orc: +10% attack power for 15 s) or Berserking (Troll: +10% attack speed for 10 s) on cooldown from the pull.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.farseer,
    group: 'Cooldowns and buffs',
    label: 'Rage of the Farseer',
    help: 'Use it on cooldown from the pull: +30% attack speed for 25 s, every 3 minutes. It’s off the global cooldown.',
    default: true,
    requires: { talent: 'Rage of the Farseer' },
  },
  {
    kind: 'toggle',
    id: ID.trinkets,
    group: 'Cooldowns and buffs',
    label: 'On-use trinkets',
    help: 'Use Earthstrike (+280 attack power for 20 s) and Weakness Analyzer (+5% crit until your next crit, for up to 20 s) on cooldown if you wear them. Other on-use trinkets aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.juju,
    group: 'Consumables',
    label: 'Juju Flurry',
    help: 'Use it on cooldown from the pull: +3% attack speed for 20 s, every minute.',
    default: true,
    requiresBuff: JUJU_FLURRY,
  },
  {
    kind: 'toggle',
    id: ID.stormstrike,
    group: 'Core abilities',
    label: 'Stormstrike',
    help: 'Use Stormstrike whenever it’s ready: a normalized swing for 125 mana every 8 s, and your next Lightning Bolt or Earth Shock within 12 s deals 20% more.',
    default: true,
    requires: { talent: 'Stormstrike' },
  },
  {
    kind: 'toggle',
    id: ID.bolt,
    group: 'Core abilities',
    label: 'Lightning Bolt',
    help: 'Cast Lightning Bolt once you have enough Maelstrom Weapon stacks. At 5 it’s instant and free; with fewer it has a cast time, which pauses your swings.',
    default: true,
    requires: { talent: 'Maelstrom Weapon' },
  },
  {
    kind: 'number',
    id: ID.boltStacks,
    group: 'Core abilities',
    label: 'Lightning Bolt at',
    help: 'Wait for at least this many Maelstrom Weapon stacks. Each cuts its cast time and cost by 20%.',
    unit: 'stacks',
    min: 1,
    max: 5,
    step: 1,
    default: 5,
    dependsOn: ID.bolt,
  },
  {
    kind: 'choice',
    id: ID.shock,
    group: 'Core abilities',
    label: 'Shock',
    help: 'Earth Shock: Nature damage that Stormstrike and Concussion boost. Frost Shock: a little less Frost damage that neither boosts. The shocks share one cooldown.',
    choices: [
      { value: 'earth', label: 'Earth Shock' },
      { value: 'frost', label: 'Frost Shock' },
      { value: 'none', label: 'None' },
    ],
    default: 'earth',
  },
  {
    kind: 'number',
    id: ID.shockMana,
    group: 'Core abilities',
    label: 'Shock from',
    help: 'Shock whenever it’s ready, but only at or above this much of your maximum mana, so Stormstrike always has its mana.',
    unit: '% mana',
    min: 0,
    max: 100,
    step: 5,
    default: 10,
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
]

/**
 * The Enhancement priority list (decision D31; shaman.md "Enhancement priority"): the rows of its
 * table, 1–7, in their default order, each with its switch and its own settings. None is pinned: the
 * imbue goes on before the pull whatever the order, and it's spec-wide, above the list, with the
 * consumables. Juju Flurry takes its turn with the on-use trinkets' row, wherever that sits, as it
 * did before the list; the mana potion and rune come after the list (off the GCD, once they fit).
 */
export const ENHANCEMENT_APL: AplDefinition = {
  rows: [
    { id: 'racial', label: 'Racial cooldown', icon: 'racial_orc_berserkerstrength', enabledId: ID.racial, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'rageOfTheFarseer', label: 'Rage of the Farseer', icon: RAGE_OF_THE_FARSEER.icon, enabledId: ID.farseer, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'trinkets', label: 'On-use trinkets', icon: 'inv_jewelry_talisman_01', enabledId: ID.trinkets, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'stormstrike', label: 'Stormstrike', icon: STORMSTRIKE.icon, enabledId: ID.stormstrike, optionIds: [], summary: [{ text: 'on cooldown' }] },
    {
      id: 'lightningBolt',
      label: 'Lightning Bolt',
      icon: LIGHTNING_BOLT.icon,
      enabledId: ID.bolt,
      optionIds: [ID.boltStacks],
      summary: [{ option: ID.boltStacks, text: 'at {} of Maelstrom Weapon' }],
    },
    {
      id: 'shock',
      label: 'Shock',
      icon: EARTH_SHOCK.icon,
      optionIds: [ID.shock, ID.shockMana],
      summary: [
        { option: ID.shock, text: '{}' },
        { option: ID.shockMana, text: 'from {}', hideWhen: 0, choiceIsNot: { option: ID.shock, values: ['none'] } },
      ],
      help: 'Earth Shock or Frost Shock, whenever the shocks’ cooldown is ready.',
    },
  ],
  specWide: [ID.imbue, ID.juju, ID.manaPotion, ID.manaPotionMissing, ID.rune, ID.runeMissing],
  presets: [],
}

/** An on-use item or consumable as a shaman `cast`: no cost, its cooldown, GCD and buff, its mana at once (buffs doc §3.5). */
const consumable = (use: OnUseSpec): AbilityDef => ({
  ...SHAMAN,
  id: use.id,
  name: use.name,
  icon: use.icon,
  kind: 'cast',
  cooldownMs: use.cooldownMs,
  gcdMs: use.gcdMs,
  aura: use.aura,
  manaTenths: use.manaTenths ?? 0,
  manaSpreadTenths: use.manaSpreadTenths ?? 0,
})

/** The imbue goes on before the pull (it lasts an hour): Rockbiter's buff is up from the pull (shaman.md#weapon-imbues). */
export const PREPULL_IMBUE_MS = -3000

/**
 * The Enhancement priority list from the settings (shaman.md "Enhancement priority"), its rows in
 * `order` (ENHANCEMENT_APL; absent: the default order). `context` gives the maximum mana (the mana
 * thresholds are shares of it), the race (its racial cooldown), the equipped items (Totem of Rage,
 * on-use trinkets) and the selected consumables.
 */
export function enhancementRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  context: Partial<PaladinContext & { equipped: ReadonlySet<number> }> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx = { ...NO_CONTEXT, ...context }
  const v = reader(ENHANCEMENT_OPTIONS, values, talents)
  const shockBonus = ctx.equipped?.has(TOTEM_OF_RAGE) ? TOTEM_OF_RAGE_PCT : 0
  const lightningSp = ctx.equipped?.has(TOTEM_OF_THE_STORM) ? TOTEM_OF_THE_STORM_SP : 0
  const abilities: AbilityDef[] = []
  const rotation: RotationEntry[] = []
  const procs: ProcSpec[] = []
  const index = (def: AbilityDef): number => {
    const i = abilities.findIndex((a) => a.id === def.id)
    if (i >= 0) return i
    abilities.push(withTalents(def, talents, shockBonus, lightningSp))
    return abilities.length - 1
  }
  const add = (def: AbilityDef, conditions: RotationCondition[] = []) => {
    const a = index(def)
    rotation.push({ ability: a, conditions, unqueueBelowTenths: 0 })
    return a
  }
  const maxManaTenths = 10 * (ctx.maxMana ?? 0)
  const prepull: ClassRotation['prepull'] = { ...NO_PREPULL, casts: [] }

  // The imbue (shaman.md#weapon-imbues): Windfury Weapon's procs, or Rockbiter Weapon's buff from before
  // the pull. Elemental Weapons raises either's attack power.
  const weapons = rank(talents, 'Elemental Weapons')
  if (v.str(ID.imbue) === 'rockbiter') {
    const ap = ROCKBITER_AP * (1 + (ELEMENTAL_WEAPONS_ROCKBITER[weapons] ?? 20) / 100)
    prepull.casts.push({ ability: index(rockbiterWeapon(ap)), atMs: PREPULL_IMBUE_MS })
  } else {
    procs.push(windfuryWeaponProc(WINDFURY_WEAPON_AP * (1 + (ELEMENTAL_WEAPONS_WINDFURY[weapons] ?? 40) / 100)))
  }

  // The on-use items and Juju Flurry, when selected, are the rotation's to press (its `onUse`), switch on or off.
  const pressed: string[] = ctx.items.map((i) => i.id)
  const juju = ctx.consumables.find((c) => c.id === JUJU_FLURRY)
  if (juju) pressed.push(JUJU_FLURRY)

  // The rows in `order` (ENHANCEMENT_APL): each row's conditions are its own wherever it sits.
  compileAplRows(ENHANCEMENT_APL, order, {
    // Rows 1–4 are off the GCD, on cooldown from the pull: the racial cooldown, Rage of the Farseer,
    // on-use trinkets and Juju Flurry. Nothing in the list is worth saving them for (shaman.md
    // "Enhancement priority"). The shaman's racials are the casters' (caster-racials.ts):
    // Berserking's casting speed and Blood Fury's spell power too.
    racial: () => {
      const racial = CASTER_RACIALS[ctx.race]
      if (racial && v.on(ID.racial)) add(racial)
    },
    rageOfTheFarseer: () => {
      if (v.on(ID.farseer) && rank(talents, 'Rage of the Farseer') > 0) add(RAGE_OF_THE_FARSEER)
    },
    // Row 3, and Juju Flurry (row 4, spec-wide) with it, as before the list.
    trinkets: () => {
      if (v.on(ID.trinkets)) for (const item of ctx.items) add(consumable(item))
      if (juju && v.on(ID.juju)) add(consumable(juju))
    },
    // Row 5: Stormstrike on cooldown.
    stormstrike: () => {
      if (v.on(ID.stormstrike) && rank(talents, 'Stormstrike') > 0) add(STORMSTRIKE)
    },
    // Row 6: Lightning Bolt at x Maelstrom Weapon stacks (5: instant and free), which Maelstrom Weapon's procs give.
    lightningBolt: () => {
      if (!v.on(ID.bolt) || rank(talents, 'Maelstrom Weapon') <= 0) return
      const bolt = index(LIGHTNING_BOLT)
      const stacks = Math.max(1, Math.min(5, Math.round(v.num(ID.boltStacks))))
      // The talent's proc puts the stacks up (talents.ts), so its aura is in the plan already.
      const aura = auraIndex(MAELSTROM_AURA.id)
      if (aura >= 0) rotation.push({ ability: bolt, conditions: [{ code: COND.auraStacksAtLeast, a: aura, b: stacks }], unqueueBelowTenths: 0 })
    },
    // Row 7: the shock on cooldown, at mana ≥ x%.
    shock: () => {
      const shock = v.str(ID.shock)
      if (shock === 'none') return
      const pct = v.num(ID.shockMana)
      add(shock === 'frost' ? FROST_SHOCK : EARTH_SHOCK, pct > 0 ? [{ code: COND.minMana, a: Math.round((pct / 100) * maxManaTenths), b: 0 }] : [])
    },
  })

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

  // Totem of the Storm's 33 (shaman.md#elemental-defaults), when the list casts Lightning Bolt.
  const assumes: ClassRotation['assumes'] = lightningSp > 0 && abilities.some((a) => a.id === LIGHTNING_BOLT.id) ? [{ id: 'totemOfTheStorm' }] : []
  return { abilities, rotation, prepull, onUse: pressed, procs, assumes }
}
