// The Elemental priority list and its settings (docs/classes/shaman.md "Elemental priority").
//
// The racial cooldown, on-use trinkets and Mana Tide Totem when its mana fits, then Flame Shock kept on
// the boss for Lava Burst, Lava Burst on cooldown, Chain Lightning with Clearcasting, Earth Shock above
// a mana threshold, and Lightning Bolt as the filler: rank 10 while Clearcasting makes it free or mana
// is above a threshold, rank 4 below it, the Classic Era downrank. The mana potion and rune go when all
// they restore fits. The rows are a priority list you reorder (ELEMENTAL_APL, decision D31); the
// consumables are spec-wide. The shaman casts from range: no swings (docs/mechanics/spells.md §12).
// Its totems are the Buffs tab's (their `selfCast`). Setting ids are
// `shaman.elemental.<ability>.<param>`; mana thresholds are percentages of maximum mana. Abilities are resolved with the build's talents
// (talents.ts) before their costs or spells feed anything. The defaults are the common priority with a
// first-pass search (decision D27; shaman.md "Elemental first-pass defaults").
import type { OnUseSpec, ProcSpec } from '../../effects/types'
import { type AbilityDef, COND, NO_PREPULL, type RotationCondition, type RotationEntry } from '../../plan/types'
import type { AplDefinition, RotationOption, RotationValue } from '../../types'
import type { PaladinContext } from '../paladin/setup'
import { compileAplRows, normalizeAplOrder } from '../apl'
import { CASTER_RACIALS } from '../caster-racials'
import { NO_CONTEXT, reader, type ClassRotation } from '../warrior/shared'
import {
  CHAIN_LIGHTNING,
  EARTH_SHOCK,
  ELEMENTAL_CLEARCASTING,
  FLAME_SHOCK,
  LAVA_BURST,
  LIGHTNING_BOLT,
  LIGHTNING_BOLT_R4,
  LIGHTNING_OVERLOAD_PCT,
  lightningOverloadProc,
  MANA_TIDE_TOTEM,
  SHAMAN,
} from './abilities'
import { MANA_POTION, MANA_RUNE, TOTEM_OF_RAGE, TOTEM_OF_RAGE_PCT, TOTEM_OF_THE_STORM, TOTEM_OF_THE_STORM_SP } from './enhancement'
import { rank, type TalentRanks, withTalents } from './talents'

const S = 'shaman.elemental'
const ID = {
  racial: `${S}.racial.enabled`,
  trinkets: `${S}.trinkets.enabled`,
  powerInfusion: `${S}.powerInfusion.enabled`,
  manaTide: `${S}.manaTide.enabled`,
  manaTideMissing: `${S}.manaTide.missingMana`,
  flameShock: `${S}.flameShock.enabled`,
  lavaBurst: `${S}.lavaBurst.enabled`,
  lavaBurstFlameShock: `${S}.lavaBurst.withFlameShock`,
  chainLightning: `${S}.chainLightning.use`,
  earthShock: `${S}.earthShock.enabled`,
  earthShockMana: `${S}.earthShock.minManaPct`,
  boltDownrank: `${S}.lightningBolt.downrank`,
  boltMaxRank: `${S}.lightningBolt.maxRankFromPct`,
  manaPotion: `${S}.manaPotion.enabled`,
  manaPotionMissing: `${S}.manaPotion.missingMana`,
  rune: `${S}.rune.enabled`,
  runeMissing: `${S}.rune.missingMana`,
}
export const ELEMENTAL_IDS = ID

/** Buff catalogue id of Power Infusion, a priest's, which the rotation presses (effects/buffs.ts). */
export const POWER_INFUSION_ID = 'powerInfusion'

/** Mana Tide Totem's mana: 4 ticks of 290 (abilities.ts MANA_TIDE_TOTEM). */
export const MANA_TIDE_MANA = 4 * 290

/**
 * Defaults from shaman.md's "Elemental priority", in priority order: the Classic Era common priority
 * adapted to Forever, with the first-pass search of decision D27 (shaman.md "Elemental first-pass
 * defaults").
 */
export const ELEMENTAL_OPTIONS: RotationOption[] = [
  {
    kind: 'toggle',
    id: ID.racial,
    group: 'Cooldowns and buffs',
    label: 'Racial cooldown',
    help: 'Use Berserking (Troll: +10% casting speed for 10 s) or Blood Fury (Orc: +10% spell damage for 15 s) on cooldown from the pull.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.trinkets,
    group: 'Cooldowns and buffs',
    label: 'On-use trinkets',
    help: 'Use Weakness Analyzer (+5% crit until your next crit, for up to 20 s) on cooldown if you wear it. Other on-use trinkets, Eye of the Beast’s included, aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.powerInfusion,
    group: 'Cooldowns and buffs',
    label: 'Power Infusion',
    help: 'Use it on cooldown from the pull, as a priest would cast it on you: +20% spell damage for 15 s, every 3 minutes.',
    default: true,
    requiresBuff: POWER_INFUSION_ID,
  },
  {
    kind: 'toggle',
    id: ID.manaTide,
    group: 'Cooldowns and buffs',
    label: 'Mana Tide Totem',
    help: 'Drop it when you’re low on mana: it restores 290 every 3 s for 12 s, every 5 minutes.',
    default: true,
    requires: { talent: 'Mana Tide Totem' },
  },
  {
    kind: 'number',
    id: ID.manaTideMissing,
    group: 'Cooldowns and buffs',
    label: 'Mana Tide Totem when missing',
    help: 'Drop it when you’re missing at least this much mana. It restores 1,160 over 12 s, while you keep casting.',
    unit: 'mana',
    min: 0,
    max: 5000,
    step: 50,
    default: 3000,
    dependsOn: ID.manaTide,
  },
  {
    kind: 'toggle',
    id: ID.flameShock,
    group: 'Core abilities',
    label: 'Flame Shock',
    help: 'Keep it on the boss: recast it once its 12 s run out. Lava Burst deals 20% more while it’s up. It shares the shocks’ cooldown.',
    default: false,
    defaultWhen: [{ talent: 'Lava Burst', default: true }],
  },
  {
    kind: 'toggle',
    id: ID.lavaBurst,
    group: 'Core abilities',
    label: 'Lava Burst',
    help: 'Cast it whenever it’s ready: Fire damage every 10 s, 20% more while your Flame Shock is on the boss.',
    default: true,
    requires: { talent: 'Lava Burst' },
  },
  {
    kind: 'toggle',
    id: ID.lavaBurstFlameShock,
    group: 'Core abilities',
    label: 'Lava Burst only with Flame Shock',
    help: 'Wait for your Flame Shock to be on the boss, so every Lava Burst gets its 20%.',
    default: false,
    dependsOn: ID.lavaBurst,
  },
  {
    kind: 'choice',
    id: ID.chainLightning,
    group: 'Core abilities',
    label: 'Chain Lightning',
    help: 'Clearcasting: only when Clearcasting makes its 485 mana free. On cooldown: whenever it’s ready, every 6 s. Against one boss it deals less than Lightning Bolt for far more mana.',
    choices: [
      { value: 'clearcasting', label: 'Clearcasting' },
      { value: 'cooldown', label: 'On cooldown' },
      { value: 'never', label: 'Never' },
    ],
    default: 'clearcasting',
  },
  {
    kind: 'toggle',
    id: ID.earthShock,
    group: 'Core abilities',
    label: 'Earth Shock',
    help: 'Shock whenever the shocks’ cooldown is ready and Flame Shock doesn’t need it.',
    default: false,
  },
  {
    kind: 'number',
    id: ID.earthShockMana,
    group: 'Core abilities',
    label: 'Earth Shock from',
    help: 'Only at or above this much of your maximum mana: it costs twice what a Lightning Bolt does.',
    unit: '% mana',
    min: 0,
    max: 100,
    step: 5,
    default: 50,
    dependsOn: ID.earthShock,
  },
  {
    kind: 'toggle',
    id: ID.boltDownrank,
    group: 'Fillers',
    label: 'Rank 4 Lightning Bolt',
    help: 'Low on mana, cast rank 4 instead of rank 10: about 70% of the damage for a quarter of the mana. With Clearcasting it’s always rank 10.',
    default: true,
  },
  {
    kind: 'number',
    id: ID.boltMaxRank,
    group: 'Fillers',
    label: 'Rank 10 from',
    help: 'Cast rank 10 at or above this much of your maximum mana, and rank 4 below it.',
    unit: '% mana',
    min: 0,
    max: 100,
    step: 5,
    default: 10,
    dependsOn: ID.boltDownrank,
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
 * The Elemental priority list (decision D31; shaman.md "Elemental priority"): the rows of its table in
 * their default order, each with its switch and its own settings. Lightning Bolt, the filler, was a
 * fixed row before the list; it's a row without a switch now, which you can move like any other.
 * Nothing is pinned. The mana potion and rune are spec-wide, above the list, and take their turn with
 * Mana Tide Totem's row, wherever it sits, as they did before the list.
 */
export const ELEMENTAL_APL: AplDefinition = {
  rows: [
    { id: 'racial', label: 'Racial cooldown', icon: 'racial_orc_berserkerstrength', enabledId: ID.racial, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'trinkets', label: 'On-use trinkets', icon: 'inv_jewelry_talisman_01', enabledId: ID.trinkets, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'powerInfusion', label: 'Power Infusion', icon: 'spell_holy_powerinfusion', enabledId: ID.powerInfusion, optionIds: [], summary: [{ text: 'on cooldown' }] },
    {
      id: 'manaTide',
      label: 'Mana Tide Totem',
      icon: MANA_TIDE_TOTEM.icon,
      enabledId: ID.manaTide,
      optionIds: [ID.manaTideMissing],
      summary: [{ option: ID.manaTideMissing, text: 'when missing {}' }],
    },
    { id: 'flameShock', label: 'Flame Shock', icon: FLAME_SHOCK.icon, enabledId: ID.flameShock, optionIds: [], summary: [{ text: 'when it’s off the boss' }] },
    {
      id: 'lavaBurst',
      label: 'Lava Burst',
      icon: LAVA_BURST.icon,
      enabledId: ID.lavaBurst,
      optionIds: [ID.lavaBurstFlameShock],
      summary: [{ text: 'on cooldown' }, { option: ID.lavaBurstFlameShock, text: 'only with Flame Shock', alsoOn: [ID.flameShock] }],
    },
    {
      id: 'chainLightning',
      label: 'Chain Lightning',
      icon: CHAIN_LIGHTNING.icon,
      optionIds: [ID.chainLightning],
      // Clearcasting comes only from Elemental Focus: without it the row never casts, and reads
      // "None"; its setting says why (elementalUnusedSettings). Below Lightning Bolt, it reads "Not
      // used", and its setting says why.
      summary: [
        {
          option: ID.chainLightning,
          text: 'with Clearcasting',
          choiceIs: { option: ID.chainLightning, values: ['clearcasting'] },
          requires: { talent: 'Elemental Focus' },
          inactiveText: 'not used',
        },
        { option: ID.chainLightning, text: '{}', choiceIsNot: { option: ID.chainLightning, values: ['clearcasting'] }, inactiveText: 'not used' },
      ],
      help: 'Chain Lightning with Clearcasting, on cooldown, or never.',
    },
    {
      id: 'earthShock',
      label: 'Earth Shock',
      icon: EARTH_SHOCK.icon,
      enabledId: ID.earthShock,
      optionIds: [ID.earthShockMana],
      summary: [{ option: ID.earthShockMana, text: 'from {}', hideWhen: 0 }],
    },
    {
      id: 'lightningBolt',
      label: 'Lightning Bolt',
      icon: LIGHTNING_BOLT.icon,
      optionIds: [ID.boltDownrank, ID.boltMaxRank],
      summary: [{ text: 'rank 10' }, { option: ID.boltMaxRank, text: 'rank 4 below {}', hideWhen: 0 }],
      help: 'The filler: cast whenever nothing above is ready. You cast from range, so you never swing your weapon.',
    },
  ],
  specWide: [ID.manaPotion, ID.manaPotionMissing, ID.rune, ID.runeMissing],
  presets: [],
}

/** The rows on the global cooldown with a switch, and any talent each needs: Lightning Bolt above them leaves them none (elementalUnusedSettings). */
const GCD_SWITCH_ROWS: readonly { row: string; enabled: string; talent?: string }[] = [
  { row: 'manaTide', enabled: ID.manaTide, talent: 'Mana Tide Totem' },
  { row: 'flameShock', enabled: ID.flameShock },
  { row: 'lavaBurst', enabled: ID.lavaBurst, talent: 'Lava Burst' },
  { row: 'earthShock', enabled: ID.earthShock },
]

/**
 * The Elemental settings that do nothing in this setup, with why (docs/ux.md "Rotation"; shaman.md
 * "Elemental priority list (A2)"):
 * - Chain Lightning with Clearcasting needs Elemental Focus, the only source of Clearcasting.
 * - Lightning Bolt, the filler, has a line with no condition but its mana (rank 4, or rank 10
 *   without the downrank), so a row on the global cooldown moved below it gets one only without that
 *   mana. The rows off the GCD (the racial, trinkets, Power Infusion and the consumables) are pressed
 *   wherever they sit.
 * `order` absent: the default order.
 */
export function elementalUnusedSettings(values: Record<string, RotationValue>, talents: TalentRanks, order?: readonly string[]): Record<string, string> {
  const v = reader(ELEMENTAL_OPTIONS, values, talents)
  const current = normalizeAplOrder(ELEMENTAL_APL, order)
  const belowBolt = (row: string) => current.indexOf(row) > current.indexOf('lightningBolt')
  const note = 'Below Lightning Bolt: used only while you haven’t the mana for Lightning Bolt.'
  const out: Record<string, string> = {}
  const chain = v.str(ID.chainLightning)
  if (chain === 'clearcasting' && rank(talents, 'Elemental Focus') === 0) out[ID.chainLightning] = 'Not used: Clearcasting needs the Elemental Focus talent.'
  else if (chain !== 'never' && belowBolt('chainLightning')) out[ID.chainLightning] = note
  for (const { row, enabled, talent } of GCD_SWITCH_ROWS) {
    if (!belowBolt(row) || !v.on(enabled) || (talent !== undefined && rank(talents, talent) === 0)) continue
    out[enabled] = note
  }
  return out
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


/**
 * The Elemental priority list from the settings (shaman.md "Elemental priority"), its rows in `order`
 * (ELEMENTAL_APL; absent: the default order). `context` gives the maximum mana (the mana thresholds are
 * shares of it), the race (its racial cooldown), the equipped items (the relics, on-use trinkets) and
 * the selected consumables.
 */
export function elementalRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  context: Partial<PaladinContext & { equipped: ReadonlySet<number> }> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx = { ...NO_CONTEXT, ...context }
  const v = reader(ELEMENTAL_OPTIONS, values, talents)
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
  const pct = (p: number): RotationCondition => ({ code: COND.minMana, a: Math.round((p / 100) * maxManaTenths), b: 0 })
  const missing = (mana: number): RotationCondition => ({ code: COND.maxMana, a: maxManaTenths - 10 * mana, b: 0 })

  // The on-use items and consumables, when selected, are the rotation's to press (its `onUse`), switch on or off.
  const pressed: string[] = ctx.items.map((i) => i.id)
  const infusion = ctx.consumables.find((c) => c.id === POWER_INFUSION_ID)
  if (infusion) pressed.push(POWER_INFUSION_ID)
  const mana = ([
    [MANA_POTION, ID.manaPotion, ID.manaPotionMissing],
    [MANA_RUNE, ID.rune, ID.runeMissing],
  ] as const).flatMap(([id, setting, need]) => {
    const use = ctx.consumables.find((c) => c.id === id)
    return use ? [{ use, setting, need }] : []
  })
  pressed.push(...mana.map((m) => m.use.id))

  // Clearcasting (Elemental Focus's) is the plan's free-cast aura, when the build has it.
  const clearcasting = auraIndex(ELEMENTAL_CLEARCASTING.id)
  const withClearcasting: RotationCondition[] = clearcasting >= 0 ? [{ code: COND.auraUp, a: clearcasting, b: 0 }] : []

  // The rows in `order` (ELEMENTAL_APL): each row's conditions are its own wherever it sits.
  compileAplRows(ELEMENTAL_APL, order, {
    // Rows 1–3, off the GCD, on cooldown from the pull: the racial cooldown (the caster's:
    // Berserking's casting speed, Blood Fury's spell power), on-use trinkets and Power Infusion.
    racial: () => {
      const racial = CASTER_RACIALS[ctx.race]
      if (racial && v.on(ID.racial)) add(racial)
    },
    trinkets: () => {
      if (v.on(ID.trinkets)) for (const item of ctx.items) add(consumable(item))
    },
    powerInfusion: () => {
      if (infusion && v.on(ID.powerInfusion)) add(consumable(infusion))
    },
    // Row 4: Mana Tide Totem once all its mana fits (a 1 s GCD). Row 5, the mana potion and rune (off the
    // GCD, spec-wide), take their turn with it, once the most they restore fits.
    manaTide: () => {
      if (v.on(ID.manaTide) && rank(talents, 'Mana Tide Totem') > 0) add(MANA_TIDE_TOTEM, [missing(v.num(ID.manaTideMissing))])
      for (const { use, setting, need } of mana) if (v.on(setting)) add(consumable(use), [missing(v.num(need))])
    },
    // Row 6: Flame Shock kept on the boss, for Lava Burst's +20%.
    flameShock: () => {
      if (!v.on(ID.flameShock)) return
      const flameShock = index(FLAME_SHOCK)
      rotation.push({ ability: flameShock, conditions: [{ code: COND.abilityAuraDown, a: flameShock, b: 0 }], unqueueBelowTenths: 0 })
    },
    // Row 7: Lava Burst on cooldown, or only while Flame Shock (row 6, on) is up.
    lavaBurst: () => {
      if (!v.on(ID.lavaBurst) || rank(talents, 'Lava Burst') <= 0) return
      const onlyWithShock = v.on(ID.lavaBurstFlameShock) && v.on(ID.flameShock)
      add(LAVA_BURST, onlyWithShock ? [{ code: COND.abilityAuraUp, a: index(FLAME_SHOCK), b: 0 }] : [])
    },
    // Row 8: Chain Lightning with Clearcasting, or on cooldown.
    chainLightning: () => {
      const chain = v.str(ID.chainLightning)
      if (chain === 'cooldown') add(CHAIN_LIGHTNING)
      else if (chain === 'clearcasting' && clearcasting >= 0) add(CHAIN_LIGHTNING, withClearcasting)
    },
    // Row 9: Earth Shock at mana ≥ x%.
    earthShock: () => {
      if (!v.on(ID.earthShock)) return
      const p = v.num(ID.earthShockMana)
      add(EARTH_SHOCK, p > 0 ? [pct(p)] : [])
    },
    // Rows 10 and 11: Lightning Bolt, rank 10 with Clearcasting or at mana ≥ x%, rank 4 below it.
    lightningBolt: () => {
      const maxRankFrom = v.on(ID.boltDownrank) ? v.num(ID.boltMaxRank) : 0
      if (maxRankFrom > 0) {
        if (clearcasting >= 0) add(LIGHTNING_BOLT, withClearcasting)
        add(LIGHTNING_BOLT, [pct(maxRankFrom)])
        add(LIGHTNING_BOLT_R4)
      } else add(LIGHTNING_BOLT)
    },
  })

  // Lightning Overload: a half-damage copy of each Lightning Bolt and Chain Lightning the list casts.
  const overload = LIGHTNING_OVERLOAD_PCT[rank(talents, 'Lightning Overload')] ?? 10
  if (overload > 0) {
    for (const a of abilities) {
      if (a.spellDef && (a.id === LIGHTNING_BOLT.id || a.id === LIGHTNING_BOLT_R4.id || a.id === CHAIN_LIGHTNING.id)) procs.push(lightningOverloadProc(a.spellDef, overload))
    }
  }

  // Totem of the Storm's 33 (shaman.md#elemental-defaults), when a Lightning Bolt or Chain Lightning reads it.
  const assumes: ClassRotation['assumes'] = lightningSp > 0 && abilities.some((a) => a.id === LIGHTNING_BOLT.id || a.id === LIGHTNING_BOLT_R4.id || a.id === CHAIN_LIGHTNING.id) ? [{ id: 'totemOfTheStorm' }] : []
  return { abilities, rotation, prepull: { ...NO_PREPULL, casts: [] }, onUse: pressed, procs, assumes }
}
