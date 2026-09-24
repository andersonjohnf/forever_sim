// The Retribution priority list and its settings (docs/classes/paladin.md "Forever priority list
// (default)", rows 0–8 and the consumables).
//
// Rows: Judgement of the Crusader before the pull and whenever it's missing (rows 0 and 2), the
// main seal (row 1: Seal of Command, or Seal of Righteousness), its judgement (row 3), Hammer of
// Wrath in the execute phase (row 4), Holy Strike (row 5), Exorcism against Undead and Demons
// (row 6), Consecration rank 5 and rank 1 by mana (rows 7 and 8), and the mana potion and rune.
// Your own Blessing of Might is the Buffs tab's (its `selfCast`). Seal twisting (row 9) is off by
// default and not simulated yet, nor is Holy Wrath. Setting ids are `paladin.retribution.<ability>.<param>`;
// mana thresholds are percentages of maximum mana. Abilities are resolved with the build's talents
// (talents.ts) and the Judgement of the Crusader rule (spells.ts; Character → Advanced, OQ 5)
// before their costs or spells feed anything.
import type { OnUseSpec } from '../../effects/types'
import { type AbilityDef, COND, type RotationCondition, type RotationEntry } from '../../plan/types'
import type { CreatureType, RotationOption, RotationValue } from '../../types'
import { NO_CONTEXT, reader, seconds, type ClassRotation } from '../warrior/shared'
import {
  CONSECRATION,
  CONSECRATION_RANK1,
  EXORCISM_ABILITY,
  HAMMER_OF_WRATH_ABILITY,
  HOLY_STRIKE_ABILITY,
  JUDGE_CRUSADER,
  JUDGEMENT_OF,
  PALADIN,
  SEAL_OF_COMMAND,
  SEAL_OF_RIGHTEOUSNESS,
  SEAL_OF_THE_CRUSADER,
} from './abilities'
import { type PaladinContext, paladinProcs, PREPULL_SEAL_MS, SEAL_REFRESH_MS } from './setup'
import { type JotcRule, withJotcRule } from './spells'
import { type TalentRanks, withTalents } from './talents'

const P = 'paladin.retribution'
const ID = {
  seal: `${P}.seal.primary`,
  crusader: `${P}.judgementOfTheCrusader.enabled`,
  trinkets: `${P}.trinkets.enabled`,
  juju: `${P}.jujuFlurry.enabled`,
  sealRefresh: `${P}.seal.refreshBelowSec`,
  judgement: `${P}.judgement.enabled`,
  holyStrike: `${P}.holyStrike.enabled`,
  exorcism: `${P}.exorcism.enabled`,
  exorcismMana: `${P}.exorcism.minManaPct`,
  consecration: `${P}.consecration.enabled`,
  consecrationMana: `${P}.consecration.minManaPct`,
  consecrationRank1: `${P}.consecrationRank1.enabled`,
  consecrationRank1Mana: `${P}.consecrationRank1.minManaPct`,
  hammerOfWrath: `${P}.hammerOfWrath.enabled`,
  hammerOfWrathMana: `${P}.hammerOfWrath.minManaPct`,
  manaPotion: `${P}.manaPotion.enabled`,
  manaPotionMissing: `${P}.manaPotion.missingMana`,
  manaPotionEarly: `${P}.manaPotion.earlyMissingMana`,
  rune: `${P}.rune.enabled`,
  runeMissing: `${P}.rune.missingMana`,
  runeEarly: `${P}.rune.earlyMissingMana`,
}
export const RETRIBUTION_IDS = ID

/** Buff catalogue ids of the consumables the rotation uses (effects/buffs.ts): the mana potion and rune, and Juju Flurry. */
export const MANA_POTION = 'majorManaPotion'
export const MANA_RUNE = 'demonicRune'
export const JUJU_FLURRY = 'jujuFlurry'

/** The creature types Exorcism can be cast on (paladin.md#other-abilities). */
export const EXORCISM_TARGETS: readonly CreatureType[] = ['undead', 'demon']

/** A mana threshold input: 0 to 100% of maximum mana ("65% mana"), in its parent's group. */
const manaOption = (id: string, label: string, help: string, def: number, dependsOn: string, group: RotationOption['group']): RotationOption => ({
  kind: 'number',
  id,
  label,
  group,
  help,
  unit: '% mana',
  min: 0,
  max: 100,
  step: 5,
  default: def,
  dependsOn,
})

/**
 * Defaults from paladin.md's "Forever priority list (default)", in priority order, the seal first.
 * They're the best rotation found for the default setup (decision D23; paladin.md "Tuning the
 * defaults", measured with scripts/tune/rotation.mjs).
 */
export const RETRIBUTION_OPTIONS: RotationOption[] = [
  {
    kind: 'choice',
    id: ID.seal,
    group: 'Core abilities',
    label: 'Seal',
    help: 'Seal of Command procs about 7 times a minute for 70% of a swing as Holy damage, and wins with any slow two-hander. Seal of Righteousness adds Holy damage to every swing, for fast or weak weapons.',
    choices: [
      { value: 'command', label: 'Command' },
      { value: 'righteousness', label: 'Righteousness' },
    ],
    default: 'command',
  },
  {
    kind: 'toggle',
    id: ID.crusader,
    // A debuff kept up all fight, like a cat's Faerie Fire, though it starts before the pull.
    group: 'Cooldowns and buffs',
    label: 'Judgement of the Crusader',
    help: 'Put Seal of the Crusader up before the pull and judge it at the pull, then your seal: the boss takes +161 Holy damage for 40 s, and your auto attacks keep it up. If it’s ever missing, it’s judged again.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.trinkets,
    group: 'Cooldowns and buffs',
    label: 'On-use trinkets',
    help: 'Use Weakness Analyzer on cooldown if you wear it: +5% crit and spell crit until your next crit, for up to 20 s. Other on-use trinkets aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.juju,
    group: 'Cooldowns and buffs',
    label: 'Juju Flurry',
    help: 'Use it on cooldown from the pull: +3% attack speed for 20 s, every minute. More swings are more Seal of Command procs.',
    default: true,
    requiresBuff: JUJU_FLURRY,
  },
  {
    kind: 'number',
    id: ID.sealRefresh,
    group: 'Core abilities',
    label: 'Seal again with',
    help: 'Recast your seal when this much of it is left, so Judgement always has one. It lasts 30 s.',
    unit: 's left',
    min: 0,
    max: 29,
    step: 0.5,
    default: SEAL_REFRESH_MS / 1000,
  },
  {
    kind: 'toggle',
    id: ID.judgement,
    group: 'Core abilities',
    label: 'Judgement',
    help: 'Judge your seal whenever Judgement is ready. It’s off the global cooldown and keeps the seal up, and with Sanctified Judgement it returns more mana than it costs.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.holyStrike,
    group: 'Core abilities',
    label: 'Holy Strike',
    help: 'Use Holy Strike whenever it’s ready: 40% of a normalized swing plus spell damage, all Holy, for 18 mana.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.exorcism,
    group: 'Core abilities',
    label: 'Exorcism',
    help: 'Against Undead and Demons (set under Fight), use Exorcism whenever it’s ready. It can’t be cast on anything else.',
    default: true,
    needsCreatureType: EXORCISM_TARGETS,
  },
  manaOption(ID.exorcismMana, 'Exorcism from', 'Use it only at or above this much of your maximum mana.', 20, ID.exorcism, 'Core abilities'),
  {
    kind: 'toggle',
    id: ID.consecration,
    group: 'Fillers',
    label: 'Consecration',
    help: 'Put down Consecration (rank 5, 508 mana) when you have the mana: 8 ticks of Holy damage over 8 s.',
    default: true,
  },
  manaOption(ID.consecrationMana, 'Consecration from', 'Use rank 5 only at or above this much of your maximum mana.', 60, ID.consecration, 'Fillers'),
  {
    kind: 'toggle',
    id: ID.consecrationRank1,
    group: 'Fillers',
    label: 'Consecration (Rank 1)',
    help: 'Below that, put down rank 1 (121 mana). Every rank has the full spell damage bonus, so it’s the most damage for the mana.',
    default: true,
  },
  manaOption(ID.consecrationRank1Mana, 'Consecration (Rank 1) from', 'Use rank 1 only at or above this much of your maximum mana.', 15, ID.consecrationRank1, 'Fillers'),
  {
    kind: 'toggle',
    id: ID.hammerOfWrath,
    group: 'Execute phase',
    label: 'Hammer of Wrath',
    help: 'In the execute phase, use Hammer of Wrath whenever it’s ready, ahead of Holy Strike. Instant with Instrument of Law 2/2. Needs an execute phase under Fight.',
    default: true,
    needsExecutePhase: true,
  },
  manaOption(ID.hammerOfWrathMana, 'Hammer of Wrath from', 'Use it only at or above this much of your maximum mana.', 0, ID.hammerOfWrath, 'Execute phase'),
  {
    kind: 'toggle',
    id: ID.manaPotion,
    group: 'Consumables',
    label: 'Major Mana Potion',
    help: 'Drink one every 2 minutes when you’re missing enough mana (under Advanced): a little early while another would still be ready before the fight ends, then only once all it can restore (up to 2,250) fits.',
    default: true,
    requiresBuff: MANA_POTION,
  },
  {
    kind: 'number',
    id: ID.manaPotionEarly,
    group: 'Consumables',
    label: 'Major Mana Potion early, when missing',
    help: 'While another would be ready before the fight ends, drink it once you’re missing this much mana, so you get one more. At 0, never early.',
    unit: 'mana',
    min: 0,
    max: 5000,
    step: 50,
    default: 1500,
    dependsOn: ID.manaPotion,
  },
  {
    kind: 'number',
    id: ID.manaPotionMissing,
    group: 'Consumables',
    label: 'Major Mana Potion when missing',
    help: 'Once the fight has less than 2 minutes left, or with early use off, drink it when you’re missing at least this much mana. 2,250 is the most it restores.',
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
    help: 'Use one every 2 minutes, apart from the potion’s cooldown, once all it can restore (up to 1,500 mana) fits. Early use while another would still be ready is off unless you set it under Advanced.',
    default: true,
    requiresBuff: MANA_RUNE,
  },
  {
    kind: 'number',
    id: ID.runeEarly,
    group: 'Consumables',
    label: 'Demonic Rune early, when missing',
    help: 'While another would be ready before the fight ends, use it once you’re missing this much mana, so you get one more. At 0, never early.',
    unit: 'mana',
    min: 0,
    max: 5000,
    step: 50,
    default: 0,
    dependsOn: ID.rune,
  },
  {
    kind: 'number',
    id: ID.runeMissing,
    group: 'Consumables',
    label: 'Demonic Rune when missing',
    help: 'Once the fight has less than 2 minutes left, or with early use off, use it when you’re missing at least this much mana. 1,500 is the most it restores.',
    unit: 'mana',
    min: 0,
    max: 5000,
    step: 50,
    default: 1500,
    dependsOn: ID.rune,
  },
]

/** The seal the settings choose (paladin.md "Forever priority list" notes: `sealPrimary`). */
export const retributionSeal = (values: Record<string, RotationValue>): AbilityDef =>
  reader(RETRIBUTION_OPTIONS, values).str(ID.seal) === 'righteousness' ? SEAL_OF_RIGHTEOUSNESS : SEAL_OF_COMMAND

/**
 * What misjudging the fight's end costs the early potion line, measured with the default setup
 * (paladin.md "Tuning the defaults (C2)"): its "another will be ready" judged 10 or 20 s off.
 */
export const KNOWN_FIGHT_END = 'with the default setup, judging it 10 to 20 s off costs up to 0.37%'

/** An on-use item or consumable as a paladin `cast`: no cost, its cooldown, GCD and buff, its mana at once (buffs doc §3.5). */
const consumable = (use: OnUseSpec): AbilityDef => ({
  ...PALADIN,
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
 * The Retribution priority list from the settings (paladin.md "Forever priority list (default)").
 * `context` gives the main hand (Seal of Righteousness), the maximum mana (the mana thresholds are
 * shares of it), the creature type (Exorcism), and the selected consumables (the potion and rune).
 * Abilities 0 and 1 are the seal and its judgement, as in `paladinCore`.
 */
export function retributionRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  _auraIndex: (id: string) => number,
  context: Partial<PaladinContext> = {},
): ClassRotation {
  const ctx: PaladinContext = { ...NO_CONTEXT, ...context }
  const v = reader(RETRIBUTION_OPTIONS, values, talents)
  const rule: JotcRule = ctx.jotcRule ?? 'coefficient'
  const abilities: AbilityDef[] = []
  const rotation: RotationEntry[] = []
  /** The ability's index, resolved with the build's talents and the JotC rule on first use. */
  const index = (def: AbilityDef): number => {
    const i = abilities.findIndex((a) => a.id === def.id)
    if (i >= 0) return i
    const a = withTalents(def, talents)
    abilities.push({
      ...a,
      ...(a.spellDef ? { spellDef: withJotcRule(a.spellDef, rule) } : {}),
      ...(a.tickSpellDef ? { tickSpellDef: withJotcRule(a.tickSpellDef, rule) } : {}),
    })
    return abilities.length - 1
  }
  const add = (def: AbilityDef, conditions: RotationCondition[]) => {
    const a = index(def)
    rotation.push({ ability: a, conditions, unqueueBelowTenths: 0 })
    return a
  }
  const maxManaTenths = 10 * (ctx.maxMana ?? 0)
  /** Mana ≥ the setting's share of the maximum. */
  const manaFrom = (id: string): RotationCondition[] => {
    const pct = v.num(id)
    return pct > 0 ? [{ code: COND.minMana, a: Math.round((pct / 100) * maxManaTenths), b: 0 }] : []
  }
  const auraUp = (a: number): RotationCondition => ({ code: COND.abilityAuraUp, a, b: 0 })
  const auraDown = (a: number): RotationCondition => ({ code: COND.abilityAuraDown, a, b: 0 })

  // Abilities 0 and 1: the seal and its judgement.
  const sealDef = retributionSeal(values)
  const seal = index(sealDef)
  const judge = index(JUDGEMENT_OF[sealDef.id])
  const refresh: RotationCondition = { code: COND.abilityAuraRefresh, a: seal, b: seconds(v, ID.sealRefresh) }
  let prepullSeal = seal

  if (v.on(ID.crusader)) {
    // Rows 0 and 2: Seal of the Crusader goes up 1.5 s before the pull; while it's up and Judgement
    // of the Crusader is missing, judge it (at the pull, then only if the debuff ever drops: your
    // landed auto attacks restart its 40 s). If it's missing without the seal, cast the seal first.
    const sotc = index(SEAL_OF_THE_CRUSADER)
    const jotc = index(JUDGE_CRUSADER)
    add(JUDGE_CRUSADER, [auraUp(sotc), auraDown(jotc)])
    add(SEAL_OF_THE_CRUSADER, [auraDown(jotc), auraDown(sotc)])
    // Row 1: the main seal when it's missing or about to end, but not over Seal of the Crusader
    // before its judgement has landed.
    add(sealDef, [refresh, auraDown(sotc)])
    add(sealDef, [refresh, auraUp(jotc)])
    prepullSeal = sotc
  } else {
    // Row 1.
    add(sealDef, [refresh])
  }

  // Row 3: the seal's judgement whenever Judgement is ready, while the seal is up (it stays up).
  if (v.on(ID.judgement)) rotation.push({ ability: judge, conditions: [auraUp(seal)], unqueueBelowTenths: 0 })

  // Row 4: Hammer of Wrath, only in the execute phase (the ability says so), at mana ≥ x%.
  if (v.on(ID.hammerOfWrath) && ctx.executePhase) add(HAMMER_OF_WRATH_ABILITY, manaFrom(ID.hammerOfWrathMana))

  // Row 5: Holy Strike on cooldown.
  if (v.on(ID.holyStrike)) add(HOLY_STRIKE_ABILITY, [])

  // Row 6: Exorcism on cooldown against Undead and Demons, at mana ≥ x%.
  if (v.on(ID.exorcism) && EXORCISM_TARGETS.includes(ctx.creatureType)) add(EXORCISM_ABILITY, manaFrom(ID.exorcismMana))

  // Rows 7 and 8: Consecration rank 5 at mana ≥ x%, else rank 1 at mana ≥ y%. The ranks share
  // one cooldown.
  if (v.on(ID.consecration)) add(CONSECRATION, manaFrom(ID.consecrationMana))
  if (v.on(ID.consecrationRank1)) add(CONSECRATION_RANK1, manaFrom(ID.consecrationRank1Mana))

  // On-use trinkets (Weakness Analyzer) and Juju Flurry (off the GCD), on cooldown from the pull:
  // nothing in the rotation is worth saving them for (paladin.md "Forever priority list (default)").
  const pressed: string[] = ctx.items.map((i) => i.id)
  if (v.on(ID.trinkets)) for (const item of ctx.items) add(consumable(item), [])
  const juju = ctx.consumables.find((c) => c.id === JUJU_FLURRY)
  if (juju) {
    pressed.push(JUJU_FLURRY)
    if (v.on(ID.juju)) add(consumable(juju), [])
  }

  // The mana potion and rune (off the GCD), when selected in Buffs: whenever the most they restore
  // fits under the maximum.
  for (const [id, setting, missing, early] of [
    [MANA_POTION, ID.manaPotion, ID.manaPotionMissing, ID.manaPotionEarly],
    [MANA_RUNE, ID.rune, ID.runeMissing, ID.runeEarly],
  ] as const) {
    const use = ctx.consumables.find((c) => c.id === id)
    if (!use) continue
    pressed.push(id)
    if (!v.on(setting)) continue
    const missingAtLeast = (mana: number): RotationCondition => ({ code: COND.maxMana, a: maxManaTenths - 10 * mana, b: 0 })
    // Early, while another would be ready before the fight ends: one more use in the fight.
    if (v.num(early) > 0) add(consumable(use), [missingAtLeast(v.num(early)), { code: COND.timeLeftAtLeast, a: use.cooldownMs, b: 0 }])
    add(consumable(use), [missingAtLeast(v.num(missing))])
  }

  // The early lines rest on knowing when the fight ends (paladin.md "Tuning the defaults (C2)").
  const timed = rotation.some((e) => e.conditions.some((c) => c.code === COND.timeLeftAtLeast))
  return {
    abilities,
    rotation,
    prepull: { casts: [{ ability: prepullSeal, atMs: PREPULL_SEAL_MS }], chargeTenths: 0, keepTenths: -1 },
    onUse: pressed,
    procs: paladinProcs(abilities, talents, ctx, rule),
    ...(timed ? { assumes: [{ id: 'knownFightEnd' as const, detail: KNOWN_FIGHT_END }] } : {}),
  }
}
