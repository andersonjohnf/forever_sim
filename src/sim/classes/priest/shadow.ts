// The Shadow Priest's priority list and its settings (docs/classes/priest.md §6).
//
// Shadowform is up all fight (cast before the pull). Off the global cooldown: the racial cooldown,
// on-use trinkets, a raid priest's Power Infusion, Inner Focus just before Mind Blast, and the mana
// potion, rune and Dark Sacrifice when their mana fits. On it: Shadow Word: Pain whenever it's off the
// boss, Devouring Plague and Mind Blast on cooldown, Starshards (Night Elf), Vampiric Embrace if you
// keep it up, and Mind Flay as the filler. They're the rows of a priority list you reorder
// (SHADOW_APL, decision D31), each with its own settings. Setting ids are
// `priest.shadow.<ability>.<param>`. Abilities are resolved with the build's talents (talents.ts)
// before their costs or spells feed anything. The defaults are the Classic Era common priority
// adapted to Forever with a first quick search (decision D27; priest.md "First-pass defaults").
import type { OnUseSpec } from '../../effects/types'
import { type AbilityDef, COND, NO_PREPULL, type RotationCondition, type RotationEntry } from '../../plan/types'
import type { AplDefinition, RotationOption, RotationValue } from '../../types'
import type { PaladinContext } from '../paladin/setup'
import { belowRowNote, compileAplRows, normalizeAplOrder } from '../apl'
import { CASTER_RACIALS } from '../caster-racials'
import { eurekaFor } from '../eureka'
import { NO_CONTEXT, reader, timeLeftAtLeast, type ClassRotation } from '../warrior/shared'
import {
  darkSacrifice,
  DARK_SACRIFICE_TICK,
  DEVOURING_PLAGUE,
  INNER_FOCUS,
  MIND_BLAST,
  MIND_FLAY,
  SHADOW_WORD_PAIN,
  STARSHARDS,
  VAMPIRIC_EMBRACE,
} from './abilities'
import { hasShadowform, rank, type TalentRanks, withTalents } from './talents'

const S = 'priest.shadow'
const ID = {
  racial: `${S}.racial.enabled`,
  trinkets: `${S}.trinkets.enabled`,
  powerInfusion: `${S}.powerInfusion.enabled`,
  innerFocus: `${S}.innerFocus.enabled`,
  pain: `${S}.shadowWordPain.enabled`,
  plague: `${S}.devouringPlague.enabled`,
  dotsTimeLeft: `${S}.dots.minTimeLeftSec`,
  blast: `${S}.mindBlast.enabled`,
  starshards: `${S}.starshards.enabled`,
  embrace: `${S}.vampiricEmbrace.enabled`,
  flay: `${S}.mindFlay.enabled`,
  flayTicks: `${S}.mindFlay.ticks`,
  manaPotion: `${S}.manaPotion.enabled`,
  manaPotionMissing: `${S}.manaPotion.missingMana`,
  rune: `${S}.rune.enabled`,
  runeMissing: `${S}.rune.missingMana`,
  sacrifice: `${S}.darkSacrifice.enabled`,
  sacrificeMissing: `${S}.darkSacrifice.missingMana`,
}
export const SHADOW_IDS = ID

/** Buff catalogue ids of the consumables and raid buffs the rotation presses (effects/buffs.ts). */
export const MANA_POTION = 'majorManaPotion'
export const MANA_RUNE = 'demonicRune'
export const POWER_INFUSION = 'powerInfusion'

/** The Night Elf and the Undead: the races whose own priest spells the rotation uses (priest.md#72-race-and-weapons). */
export const STARSHARDS_RACE = 'alliance-night-elf'
export const DARK_SACRIFICE_RACE = 'horde-undead'

/**
 * Defaults from priest.md §6, in priority order: the Classic Era common priority adapted to Forever,
 * with the first quick search of decision D27 (priest.md "First-pass defaults").
 */
export const SHADOW_OPTIONS: RotationOption[] = [
  {
    kind: 'toggle',
    id: ID.racial,
    group: 'Cooldowns and buffs',
    label: 'Racial cooldown',
    help: 'Use Berserking (Troll: +10% casting speed for 10 s), Elune’s Light (Night Elf: +10% crit for 15 s) or Eureka! (Gnome: the next 3 of the spells it covers cost 10% less and deal 10% more) on cooldown from the pull.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.trinkets,
    group: 'Cooldowns and buffs',
    label: 'On-use trinkets',
    help: 'Use the on-use trinkets the sim models on cooldown if you wear them. Others aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.powerInfusion,
    group: 'Cooldowns and buffs',
    label: 'Power Infusion',
    help: 'Take another priest’s Power Infusion on cooldown from the pull: +20% spell damage for 15 s, every 3 minutes. Yours can’t reach it: it’s the Discipline tree’s last talent.',
    default: true,
    requiresBuff: POWER_INFUSION,
  },
  {
    kind: 'toggle',
    id: ID.innerFocus,
    group: 'Cooldowns and buffs',
    label: 'Inner Focus',
    help: 'Use it when Mind Blast is ready, every 3 minutes: the spell after it costs nothing and gets +25% crit, which is that Mind Blast while this sits just above it. It’s off the global cooldown. Needs Mind Blast on.',
    default: true,
    requires: { talent: 'Inner Focus' },
    // Without Mind Blast it's never used (shadowRotation), so the tab dims it.
    dependsOn: ID.blast,
  },
  {
    kind: 'toggle',
    id: ID.pain,
    group: 'Core abilities',
    label: 'Shadow Word: Pain',
    help: 'Cast it whenever it’s off the boss. Its ticks can crit in Forever, for double damage in Shadowform.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.plague,
    group: 'Core abilities',
    label: 'Devouring Plague',
    help: 'Cast it on cooldown, every minute: every Forever priest has it. Its healing isn’t counted.',
    default: true,
  },
  {
    kind: 'number',
    id: ID.dotsTimeLeft,
    group: 'Core abilities',
    label: 'Damage over time until',
    help: 'Cast Shadow Word: Pain and Devouring Plague only while at least this much of the fight is left; later, Mind Flay deals more.',
    unit: 's',
    min: 0,
    max: 30,
    step: 1,
    default: 6,
  },
  {
    kind: 'toggle',
    id: ID.blast,
    group: 'Core abilities',
    label: 'Mind Blast',
    help: 'Cast it whenever it’s ready: a 1.5 s cast, ready again 5.5 s after it lands with Improved Mind Blast.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.starshards,
    group: 'Core abilities',
    label: 'Starshards',
    help: 'Night Elf only: channel it on cooldown, every 30 s, for 1,800 Arcane damage over 6 s.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.embrace,
    group: 'Core abilities',
    label: 'Vampiric Embrace',
    help: 'Keep it on the boss (30 s, every minute) for your party’s healing. The sim doesn’t count healing, so here it only costs a global cooldown and a little mana.',
    default: false,
    requires: { talent: 'Vampiric Embrace' },
  },
  {
    kind: 'toggle',
    id: ID.flay,
    group: 'Fillers',
    label: 'Mind Flay',
    help: 'Channel it whenever nothing above is ready.',
    default: true,
    requires: { talent: 'Mind Flay' },
  },
  {
    kind: 'number',
    id: ID.flayTicks,
    group: 'Fillers',
    label: 'Mind Flay ticks',
    help: 'Stop the channel after this many of its 3 ticks (one a second), so Mind Blast isn’t kept waiting as long.',
    unit: 'ticks',
    min: 1,
    max: 3,
    step: 1,
    default: 3,
    dependsOn: ID.flay,
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
  {
    kind: 'toggle',
    id: ID.sacrifice,
    group: 'Consumables',
    label: 'Dark Sacrifice',
    help: 'Undead only: trade 1,600 health for 1,600 mana plus your Spirit over 15 s, every 10 minutes, once it fits. It takes a global cooldown.',
    default: true,
  },
  {
    kind: 'number',
    id: ID.sacrificeMissing,
    group: 'Consumables',
    label: 'Dark Sacrifice when missing',
    help: 'Use it when you’re missing at least this much mana. It restores 1,600 plus your Spirit.',
    unit: 'mana',
    min: 0,
    max: 5000,
    step: 50,
    default: 1600,
    dependsOn: ID.sacrifice,
  },
]

/**
 * The Shadow priority list's rows (decision D31; priest.md §6 "The priority list"), in the default
 * order. Shadowform before the pull is pinned first. Power Infusion is a row, as on Balance and
 * Elemental. The mana consumables are spec-wide, above the list, and take their turn just after
 * Power Infusion's row, wherever it sits: in the default order, and in any order saved before it was
 * a row, just where they were. Shadow has no named rotations: its one preset is the implicit Default.
 */
export const SHADOW_APL: AplDefinition = {
  rows: [
    {
      id: 'prepull',
      label: 'Before the pull',
      icon: 'spell_shadow_shadowform',
      optionIds: [],
      // Without the talent nothing is cast before the pull (priest.md §3.6), so the row reads "None".
      summary: [{ text: 'Shadowform', requires: { talent: 'Shadowform' } }],
      help: 'Cast Shadowform before the pull, with the talent; it’s up all fight: +10% Shadow damage, Shadow spells at half their mana, and their crits deal double damage. It always comes first.',
      pinned: true,
    },
    { id: 'racial', label: 'Racial cooldown', icon: 'racial_troll_berserk', enabledId: ID.racial, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'trinkets', label: 'On-use trinkets', icon: 'inv_jewelry_talisman_01', enabledId: ID.trinkets, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'powerInfusion', label: 'Power Infusion', icon: 'spell_holy_powerinfusion', enabledId: ID.powerInfusion, optionIds: [], summary: [{ text: 'on cooldown' }] },
    {
      id: 'darkSacrifice',
      label: 'Dark Sacrifice',
      icon: darkSacrifice(0).icon,
      enabledId: ID.sacrifice,
      optionIds: [ID.sacrificeMissing],
      summary: [{ option: ID.sacrificeMissing, text: 'when missing {}' }],
    },
    {
      id: 'shadowWordPain',
      label: 'Shadow Word: Pain',
      icon: SHADOW_WORD_PAIN.icon,
      enabledId: ID.pain,
      optionIds: [ID.dotsTimeLeft],
      summary: [{ text: 'when it’s off the boss' }, { option: ID.dotsTimeLeft, text: 'until {} left', hideWhen: 0 }],
    },
    {
      id: 'devouringPlague',
      label: 'Devouring Plague',
      icon: DEVOURING_PLAGUE.icon,
      enabledId: ID.plague,
      optionIds: [ID.dotsTimeLeft],
      summary: [{ text: 'on cooldown' }, { option: ID.dotsTimeLeft, text: 'until {} left', hideWhen: 0 }],
    },
    { id: 'innerFocus', label: 'Inner Focus', icon: INNER_FOCUS.icon, enabledId: ID.innerFocus, optionIds: [], summary: [{ text: 'when Mind Blast is ready' }] },
    { id: 'mindBlast', label: 'Mind Blast', icon: MIND_BLAST.icon, enabledId: ID.blast, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'starshards', label: 'Starshards', icon: STARSHARDS.icon, enabledId: ID.starshards, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'vampiricEmbrace', label: 'Vampiric Embrace', icon: VAMPIRIC_EMBRACE.icon, enabledId: ID.embrace, optionIds: [], summary: [{ text: 'kept on the boss' }] },
    {
      id: 'mindFlay',
      label: 'Mind Flay',
      icon: MIND_FLAY.icon,
      enabledId: ID.flay,
      optionIds: [ID.flayTicks],
      summary: [{ text: 'filler' }, { option: ID.flayTicks, text: '{}' }],
    },
  ],
  specWide: [ID.manaPotion, ID.manaPotionMissing, ID.rune, ID.runeMissing],
  presets: [],
}

/** The rows on the global cooldown with a switch, and any talent each needs: Mind Flay above them leaves them none (shadowUnusedSettings). */
const GCD_SWITCH_ROWS: readonly { row: string; enabled: string; talent?: string }[] = [
  { row: 'darkSacrifice', enabled: ID.sacrifice },
  { row: 'shadowWordPain', enabled: ID.pain },
  { row: 'devouringPlague', enabled: ID.plague },
  { row: 'mindBlast', enabled: ID.blast },
  { row: 'starshards', enabled: ID.starshards },
  { row: 'vampiricEmbrace', enabled: ID.embrace, talent: 'Vampiric Embrace' },
]

/**
 * The Shadow settings that do nothing in this setup, with why (docs/ux.md "Rotation"; priest.md §6
 * "The priority list"):
 * - Starshards and Dark Sacrifice are two races' own.
 * - Mind Flay, the filler, takes every global cooldown it can, so a row on the global cooldown
 *   moved below it gets one only when Mind Flay can't be cast, and so does Inner Focus, which waits
 *   for Mind Blast to be ready, the global cooldown included: `belowRowNote`, the rule every
 *   filler's rows share (docs/ux.md "Rotation").
 * - Inner Focus below Mind Blast finds it ready only when Mind Blast can't be cast: Mind Blast goes
 *   first the moment it's ready. The same note, of Mind Blast.
 * `values`, `talents` and `order` absent: the defaults, no talents and the default order.
 */
export function shadowUnusedSettings(
  race: string,
  raceName: string,
  values: Record<string, RotationValue> = {},
  talents: TalentRanks = new Map(),
  order?: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {}
  if (race !== STARSHARDS_RACE) out[ID.starshards] = `Not used: only Night Elf priests have Starshards, not ${raceName}.`
  if (race !== DARK_SACRIFICE_RACE) out[ID.sacrifice] = `Not used: only Undead priests have Dark Sacrifice, not ${raceName}.`
  const v = reader(SHADOW_OPTIONS, values, talents)
  const current = normalizeAplOrder(SHADOW_APL, order)
  const below = (row: string, above: string) => current.indexOf(row) > current.indexOf(above)
  const innerFocus = v.on(ID.innerFocus) && v.on(ID.blast) && rank(talents, 'Inner Focus') > 0
  if (innerFocus && below('innerFocus', 'mindBlast')) {
    // Not the below-filler rule: Inner Focus waits for Mind Blast to be ready and affordable, so below
    // it Mind Blast always goes first and Inner Focus is never cast (the fix round's quick check, QV-1).
    out[ID.innerFocus] = 'Not used: below Mind Blast, which it waits for, so Mind Blast always goes first. Move it above Mind Blast.'
  }
  if (!v.on(ID.flay) || rank(talents, 'Mind Flay') === 0) return out
  const note = belowRowNote('Mind Flay')
  for (const { row, enabled, talent } of GCD_SWITCH_ROWS) {
    if (out[enabled] !== undefined || !below(row, 'mindFlay') || !v.on(enabled) || (talent !== undefined && rank(talents, talent) === 0)) continue
    out[enabled] = note
  }
  if (innerFocus && out[ID.innerFocus] === undefined && below('innerFocus', 'mindFlay')) out[ID.innerFocus] = note
  return out
}

/** An on-use item, consumable or raid buff as a priest `cast`: no cost, its cooldown, GCD and buff, its mana at once. */
const consumable = (use: OnUseSpec): AbilityDef => ({
  ...INNER_FOCUS,
  id: use.id,
  name: use.name,
  icon: use.icon,
  cooldownMs: use.cooldownMs,
  gcdMs: use.gcdMs,
  aura: use.aura,
  manaTenths: use.manaTenths ?? 0,
  manaSpreadTenths: use.manaSpreadTenths ?? 0,
})

/**
 * The Shadow priority list from the settings (priest.md §6), its rows in `order` (SHADOW_APL;
 * absent: the default order). `context` gives the maximum mana (the mana thresholds), the race (its
 * racial spells), the equipped on-use items, the selected consumables and raid buffs, and the
 * sheet's Spirit at the pull (Dark Sacrifice's mana).
 *
 * A row's conditions are its own wherever it sits: Inner Focus still waits for Mind Blast to be
 * ready, so it refers to Mind Blast by definition (`index`), which in the default order gives the
 * index it had before the list.
 */
export function shadowRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  context: Partial<PaladinContext & { spirit: number }> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx = { ...NO_CONTEXT, ...context }
  const v = reader(SHADOW_OPTIONS, values, talents)
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
  const missing = (mana: number): RotationCondition => ({ code: COND.maxMana, a: maxManaTenths - 10 * mana, b: 0 })

  const racial = eurekaFor(ctx.race, 'priest') ?? CASTER_RACIALS[ctx.race]
  const infusion = ctx.consumables.find((c) => c.id === POWER_INFUSION)
  const manaUses = (
    [
      [MANA_POTION, ID.manaPotion, ID.manaPotionMissing],
      [MANA_RUNE, ID.rune, ID.runeMissing],
    ] as const
  ).flatMap(([id, setting, amount]) => {
    const use = ctx.consumables.find((c) => c.id === id)
    return use ? [{ use, setting, amount }] : []
  })
  // What the rotation presses, in this order whatever the list's: the on-use items, a raid priest's
  // Power Infusion, the mana potion and the rune.
  const pressed: string[] = [...ctx.items.map((i) => i.id), ...(infusion ? [POWER_INFUSION] : []), ...manaUses.map((m) => m.use.id)]
  /** Shadow Word: Pain and Devouring Plague only while enough of the fight is left for their ticks. */
  const dotsLeft = timeLeftAtLeast(1000 * v.num(ID.dotsTimeLeft))

  compileAplRows(SHADOW_APL, order, {
    // Off the GCD, on cooldown from the pull: the racial cooldown, on-use trinkets and a raid priest's
    // Power Infusion. Nothing in the list is worth saving them for (priest.md §6).
    racial: () => {
      if (racial && v.on(ID.racial)) add(racial)
    },
    trinkets: () => {
      if (v.on(ID.trinkets)) for (const item of ctx.items) add(consumable(item))
    },
    // The mana potion and rune (spec-wide) take their turn just after Power Infusion, once the most
    // they restore fits: in the default order, and in any order saved before Power Infusion was a row
    // (it's placed just after the trinkets), where they were with the trinkets before.
    powerInfusion: () => {
      if (infusion && v.on(ID.powerInfusion)) add(consumable(infusion))
      for (const { use, setting, amount } of manaUses) if (v.on(setting)) add(consumable(use), [missing(v.num(amount))])
    },
    darkSacrifice: () => {
      if (ctx.race === DARK_SACRIFICE_RACE && v.on(ID.sacrifice)) add(darkSacrifice(ctx.spirit ?? 0), [missing(v.num(ID.sacrificeMissing))])
    },
    // Shadow Word: Pain whenever it's off the boss, and Devouring Plague on cooldown.
    shadowWordPain: () => {
      if (!v.on(ID.pain)) return
      const pain = index(SHADOW_WORD_PAIN)
      rotation.push({ ability: pain, conditions: [{ code: COND.abilityAuraRefresh, a: pain, b: 0 }, dotsLeft], unqueueBelowTenths: 0 })
    },
    devouringPlague: () => {
      if (v.on(ID.plague)) add(DEVOURING_PLAGUE, [dotsLeft])
    },
    // Inner Focus once Mind Blast could start: in the default order just before it, so the Mind Blast
    // that follows uses its charge. Only with Mind Blast on.
    innerFocus: () => {
      if (!v.on(ID.blast) || !v.on(ID.innerFocus) || rank(talents, 'Inner Focus') === 0) return
      const blast = index(MIND_BLAST)
      add(INNER_FOCUS, [{ code: COND.abilityReady, a: blast, b: 0 }])
    },
    mindBlast: () => {
      if (v.on(ID.blast)) add(MIND_BLAST)
    },
    starshards: () => {
      if (ctx.race === STARSHARDS_RACE && v.on(ID.starshards)) add(STARSHARDS)
    },
    vampiricEmbrace: () => {
      if (!v.on(ID.embrace) || rank(talents, 'Vampiric Embrace') === 0) return
      const embrace = index(VAMPIRIC_EMBRACE)
      rotation.push({ ability: embrace, conditions: [{ code: COND.abilityAuraRefresh, a: embrace, b: 0 }], unqueueBelowTenths: 0 })
    },
    // Mind Flay as the filler, cut off after its setting's ticks.
    mindFlay: () => {
      if (!v.on(ID.flay) || rank(talents, 'Mind Flay') === 0) return
      const ticks = Math.max(1, Math.min(3, Math.round(v.num(ID.flayTicks))))
      add({ ...MIND_FLAY, ...(ticks < 3 ? { channelTicks: ticks } : {}) })
    },
  })

  return { abilities, rotation, prepull: NO_PREPULL, onUse: pressed, procs: [] }
}

/** Whether the build keeps Shadowform up (the sheet). */
export const shadowformUp = hasShadowform

/** Dark Sacrifice's mana in all before Spirit, for docs and tests: 5 ticks of its level-60 points. */
export const DARK_SACRIFICE_MANA = 5 * DARK_SACRIFICE_TICK
