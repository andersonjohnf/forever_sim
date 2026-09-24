// The Feral cat's priority list and its settings (docs/classes/druid.md §6.2, §7.4).
//
// Off the GCD: Berserk, the racial cooldown (Night Elf), on-use items (Manual Crowd Pummeler,
// Weakness Analyzer), Tiger's Fury under the Energy cap, and the Mighty Rage Potion and Juju Flurry
// when they're selected in Buffs. On the GCD: Faerie Fire's upkeep, a Clearcasting Shred, the
// finishers (Rip, then Ferocious Bite, with a Shred first while there's Energy to spare), Rake, and
// Shred, or Claw from the front. No powershifting: in Forever it gains nothing (§2.8). Setting ids
// are `druid.cat.<ability>.<param>`; Energy thresholds are absolute Energy points.
import type { OnUseSpec } from '../../effects/types'
import { JUJU_FLURRY, MIGHTY_RAGE_POTION } from '../../effects/buffs'
import { COND, type RotationCondition } from '../../plan/types'
import type { RotationOption, RotationValue } from '../../types'
import type { ClassRotationContext } from '../rotation'
import { ELUNES_LIGHT } from '../warrior/abilities'
import { type ClassRotation, NO_CONTEXT, reader, seconds, timeLeftAtLeast, timeLeftAtMost } from '../warrior/shared'
import { MAX_ENERGY_TENTHS, WOLFSHEAD_HELM } from './abilities'
import {
  BERSERK,
  CLAW,
  FAERIE_FIRE_CAT,
  FEROCIOUS_BITE,
  onUseCast,
  RAKE,
  RIP,
  SHRED,
  tigersFury,
  tigersFuryEnergy,
} from './cat-abilities'
import { DruidRotationBuilder } from './builder'
import type { TalentRanks } from './modifiers'
import type { AbilityDef } from './abilities'

const ID = {
  berserk: 'druid.cat.berserk.enabled',
  racial: 'druid.cat.racial.enabled',
  items: 'druid.cat.onUseItems.enabled',
  tfEnabled: 'druid.cat.tigersFury.enabled',
  tfWaste: 'druid.cat.tigersFury.maxEnergyLost',
  ffEnabled: 'druid.cat.faerieFire.enabled',
  ffRefresh: 'druid.cat.faerieFire.refreshBelowSec',
  shred: 'druid.cat.shred.enabled',
  claw: 'druid.cat.claw.enabled',
  ripEnabled: 'druid.cat.rip.enabled',
  ripCp: 'druid.cat.rip.minComboPoints',
  ripLeft: 'druid.cat.rip.minFightLeftSec',
  ripRefresh: 'druid.cat.rip.refreshBelowSec',
  ripNoOtherBleeds: 'druid.cat.rip.onlyWithoutOtherBleeds',
  biteEnabled: 'druid.cat.ferociousBite.enabled',
  biteCp: 'druid.cat.ferociousBite.minComboPoints',
  biteShredFirst: 'druid.cat.ferociousBite.shredFirstFrom',
  biteRipUp: 'druid.cat.ferociousBite.onlyWhileRipUp',
  biteEnd: 'druid.cat.ferociousBite.anyEnergyLastSec',
  rakeEnabled: 'druid.cat.rake.enabled',
  rakeNoBleed: 'druid.cat.rake.onlyWithoutBleeds',
  potion: 'druid.cat.ragePotion.enabled',
  juju: 'druid.cat.jujuFlurry.enabled',
}

/** Rake is used only with at least its bleed's 9 s of the fight left (druid.md §6.2 row 9). */
const RAKE_MIN_FIGHT_LEFT_MS = 9000

/** An Energy threshold input, 0 to the 100 cap, in its parent's group. */
const energyOption = (id: string, label: string, help: string, def: number, dependsOn: string, group: 'Cooldowns and buffs' | 'Core abilities', min = 0): RotationOption => ({
  kind: 'number',
  id,
  label,
  group,
  help,
  unit: 'Energy',
  min,
  max: MAX_ENERGY_TENTHS / 10,
  step: 1,
  default: def,
  dependsOn,
})

/** A combo-point threshold input, 1 to 5. */
const comboPointOption = (id: string, label: string, help: string, def: number, dependsOn: string): RotationOption => ({
  kind: 'number',
  id,
  label,
  group: 'Core abilities',
  help,
  unit: 'combo points',
  min: 1,
  max: 5,
  step: 1,
  default: def,
  dependsOn,
})

/**
 * Defaults from druid.md §6.2's table, in priority order. They're the best rotation found for the
 * default setup (decision D23; §6.2 "Tuning the defaults", measured with scripts/tune/rotation.mjs).
 */
export const CAT_OPTIONS: RotationOption[] = [
  {
    kind: 'toggle',
    id: ID.berserk,
    group: 'Cooldowns and buffs',
    label: 'Berserk',
    help: 'Use Berserk on cooldown: for 15 s every Shred, Claw and Rake that lands is a crit, so each gives 2 combo points. Needs the Berserk talent.',
    default: true,
  },
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
    id: ID.items,
    group: 'Cooldowns and buffs',
    label: 'On-use items',
    help: 'Use the Manual Crowd Pummeler (+50% attack speed for 30 s, 3 charges) and Weakness Analyzer on cooldown, if you wear them.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.tfEnabled,
    group: 'Cooldowns and buffs',
    label: 'Tiger’s Fury',
    help: 'Use Tiger’s Fury every 30 s: +15% physical damage for 6 s, and 20 Energy per King of the Jungle rank, 20 more with Wolfshead Helm.',
    default: true,
  },
  energyOption(
    ID.tfWaste,
    'Tiger’s Fury losing up to',
    'Use it only when at most this much of its Energy would be lost at the 100 cap. At 0 it waits until all of it fits; a little sooner does more.',
    20,
    ID.tfEnabled,
    'Cooldowns and buffs',
  ),
  {
    kind: 'toggle',
    id: ID.ffEnabled,
    group: 'Cooldowns and buffs',
    label: 'Faerie Fire',
    help: 'Keep your Faerie Fire on the boss: −505 armor for 40 s, free in Cat Form, with a 1 s global cooldown and a 6 s cooldown. It can miss. The Buffs tab’s Faerie Fire is the same debuff, so it counts once; with this off, turn that one on if another druid keeps it up.',
    default: true,
    maintainsBuff: 'faerieFire',
  },
  {
    kind: 'number',
    id: ID.ffRefresh,
    group: 'Cooldowns and buffs',
    label: 'Faerie Fire again with',
    help: 'Refresh it when this much of it is left, while you wait for the Energy for your next Shred. At 0, only once it has run out.',
    unit: 's left',
    min: 0,
    max: 40,
    step: 1,
    default: 12,
    dependsOn: ID.ffEnabled,
  },
  {
    kind: 'toggle',
    id: ID.shred,
    group: 'Core abilities',
    label: 'Shred',
    help: 'Build combo points with Shred: 155% of (your weapon damage + 80), for 42 Energy with Shredding Attacks 3/3. It needs you behind the boss (set under Fight). With Clearcasting it comes first, since it’s free.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.claw,
    group: 'Core abilities',
    label: 'Claw when you can’t Shred',
    help: 'Build with Claw instead from the front, or with Shred off: 110% of (your weapon damage + 115), for 40 Energy with Ferocity 5/5.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.ripEnabled,
    group: 'Core abilities',
    label: 'Rip',
    help: 'Keep Rip on the boss: a bleed for 12 s that grows with your combo points and attack power and ignores armor.',
    default: true,
  },
  comboPointOption(ID.ripCp, 'Rip at', 'Use Rip at or above this many combo points.', 5, ID.ripEnabled),
  {
    kind: 'number',
    id: ID.ripLeft,
    group: 'Core abilities',
    label: 'Rip while the fight has',
    help: 'Use Rip only while at least this much of the fight is left, so enough of its ticks land. Its 6 ticks take 12 s.',
    unit: 's left',
    min: 0,
    max: 60,
    step: 1,
    default: 8,
    dependsOn: ID.ripEnabled,
  },
  {
    kind: 'number',
    id: ID.ripRefresh,
    group: 'Core abilities',
    label: 'Rip again with',
    help: 'Replace your Rip when this much of it is left; its remaining ticks are lost. At 0, only once it has run out.',
    unit: 's left',
    min: 0,
    max: 12,
    step: 0.5,
    default: 0,
    dependsOn: ID.ripEnabled,
  },
  {
    kind: 'toggle',
    id: ID.ripNoOtherBleeds,
    group: 'Core abilities',
    label: 'Rip only when nothing else bleeds',
    help: 'Leave Rip out while warriors in the raid (the Buffs tab) keep their Deep Wounds on the boss: Rend and Tear then applies without it, and Ferocious Bite takes the combo points. It does less, under Classic Era’s rules too.',
    default: false,
    dependsOn: ID.ripEnabled,
  },
  {
    kind: 'toggle',
    id: ID.biteEnabled,
    group: 'Core abilities',
    label: 'Ferocious Bite',
    help: 'Spend combo points on Ferocious Bite: 52–112 plus 147 per point, and 2.7 per point of Energy left after its 35, which it all spends.',
    default: true,
  },
  comboPointOption(ID.biteCp, 'Ferocious Bite at', 'Use it at or above this many combo points, when Rip doesn’t take them.', 5, ID.biteEnabled),
  energyOption(
    ID.biteShredFirst,
    'Shred before Ferocious Bite from',
    'With the combo points for a Bite, Shred first while you have at least this much Energy: Bite turns extra Energy into only 2.7 damage a point. At 35, you Bite only when there isn’t Energy for a Shred.',
    35,
    ID.biteEnabled,
    'Core abilities',
    35,
  ),
  {
    kind: 'number',
    id: ID.biteEnd,
    group: 'Core abilities',
    label: 'Ferocious Bite at any Energy in the last',
    help: 'This close to the end, Bite as soon as you have the combo points, without a Shred first: there’s no time left to turn the Energy into Shreds. At 0, never.',
    unit: 's',
    min: 0,
    max: 30,
    step: 1,
    default: 4,
    dependsOn: ID.biteEnabled,
  },
  {
    kind: 'toggle',
    id: ID.biteRipUp,
    group: 'Core abilities',
    label: 'Ferocious Bite only while Rip is up',
    help: 'While Rip is off the boss, save your combo points for it, unless too little of the fight is left for one. Needs Rip on.',
    default: false,
    dependsOn: ID.biteEnabled,
  },
  {
    kind: 'toggle',
    id: ID.rakeEnabled,
    group: 'Core abilities',
    label: 'Rake',
    help: 'Keep Rake on the boss: 61 plus 102 over 9 s, for 35 Energy with Ferocity 5/5. It does less than a Shred for its Energy.',
    default: false,
  },
  {
    kind: 'toggle',
    id: ID.rakeNoBleed,
    group: 'Core abilities',
    label: 'Rake only when nothing else bleeds',
    help: 'Use Rake only while neither your Rip nor warriors’ Deep Wounds (a raid with warriors, in Buffs) bleeds the boss, so Rend and Tear applies.',
    default: true,
    dependsOn: ID.rakeEnabled,
  },
  {
    kind: 'toggle',
    id: ID.potion,
    group: 'Consumables',
    label: 'Mighty Rage Potion',
    help: 'Drink it once, with Berserk (at the pull without it), for +60 Strength for 20 s. A cat has no use for its rage.',
    default: true,
    requiresBuff: 'mightyRagePotion',
  },
  {
    kind: 'toggle',
    id: ID.juju,
    group: 'Consumables',
    label: 'Juju Flurry',
    help: 'Use it on cooldown from the pull: +3% attack speed for 20 s, every minute.',
    default: true,
    requiresBuff: 'jujuFlurry',
  },
]

/**
 * The cat's settings that do nothing in this raid, with why (docs/ux.md "Rotation"): Rake and Rip
 * when their "only when nothing else bleeds" switch meets a raid whose warriors keep the boss
 * bleeding, where the priority list leaves them out (druid.md §6.2 rows 7 and 9).
 */
export function catUnusedSettings(values: Record<string, RotationValue>, othersBleed: boolean): Record<string, string> {
  if (!othersBleed) return {}
  const v = reader(CAT_OPTIONS, values)
  const out: Record<string, string> = {}
  const label = (id: string) => CAT_OPTIONS.find((o) => o.id === id)!.label
  const unused = (id: string) =>
    `Not used in this raid: its warriors keep the boss bleeding. Turn off “${label(id)}” to use it anyway.`
  if (v.on(ID.rakeNoBleed)) out[ID.rakeEnabled] = unused(ID.rakeNoBleed)
  if (v.on(ID.ripNoOtherBleeds)) out[ID.ripEnabled] = unused(ID.ripNoOtherBleeds)
  return out
}

/** Buff catalogue ids the cat keeps up itself with these settings: its Faerie Fire (druid.md §3.8). */
export function catMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return reader(CAT_OPTIONS, values).on(ID.ffEnabled) ? ['faerieFire'] : []
}

const minEnergy = (energy: number): RotationCondition => ({ code: COND.minEnergy, a: 10 * energy, b: 0 })
const maxEnergyTenths = (tenths: number): RotationCondition => ({ code: COND.maxEnergy, a: tenths, b: 0 })
const minComboPoints = (cp: number): RotationCondition => ({ code: COND.minComboPoints, a: cp, b: 0 })
/** Ability a's aura, or its bleed on the target, is down, or has at most `ms` left before the fight's end (the upkeep condition). */
const refresh = (a: number, ms: number): RotationCondition => ({ code: COND.abilityAuraRefresh, a, b: ms })
const auraUp = (a: number): RotationCondition => ({ code: COND.abilityAuraUp, a, b: 0 })
const auraDown = (a: number): RotationCondition => ({ code: COND.abilityAuraDown, a, b: 0 })

/**
 * The cat priority list from the settings (druid.md §6.2). `talents` gates Berserk and resolves
 * costs, Savage Fury, Genesis, Predatory Instincts, Rend and Tear, Primal Fury and King of the
 * Jungle; `auraIndex` finds Clearcasting's aura; `context` gives the race (Elune's Light), the
 * equipped on-use items and Wolfshead Helm, the selected consumables, whether others keep the
 * boss bleeding (a raid with warriors), and whether you stand in front of the boss (no Shred).
 */
export function catRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  context: Partial<ClassRotationContext> = {},
): ClassRotation {
  const ctx: ClassRotationContext = { ...NO_CONTEXT, equipped: new Set(), othersBleed: false, front: false, ...context }
  const v = reader(CAT_OPTIONS, values, talents)
  const b = new DruidRotationBuilder(talents)
  const index = (def: AbilityDef) => b.ability(def)

  // --- Off the GCD (§6.2 rows 1–4) ----------------------------------------------------------------
  // Row 1: Berserk on cooldown, with the talent.
  const berserk = talents.has('Berserk') && v.on(ID.berserk) ? b.add(BERSERK, []) : -1
  // Row 2: the racial cooldown (Elune's Light, §7.2) and on-use items (§7.3) on cooldown: all 3 min
  // cooldowns, so they line up with Berserk from the pull.
  if (ctx.race === 'alliance-night-elf' && v.on(ID.racial)) b.add(ELUNES_LIGHT, [])
  if (v.on(ID.items)) for (const item of ctx.items) b.add(onUseCast(item), [])
  // Row 3: Tiger's Fury at Energy ≤ the cap − its Energy + what may be lost (W8).
  if (v.on(ID.tfEnabled)) {
    const gain = tigersFuryEnergy(talents.get('King of the Jungle') ?? 0, ctx.equipped.has(WOLFSHEAD_HELM))
    const tf = tigersFury(talents.get('King of the Jungle') ?? 0, ctx.equipped.has(WOLFSHEAD_HELM))
    b.add(tf, [maxEnergyTenths(MAX_ENERGY_TENTHS - 10 * gain + 10 * v.num(ID.tfWaste))])
  }
  // Row 4: consumables selected in Buffs: the potion once, with Berserk (at the pull without it);
  // Juju Flurry on cooldown.
  const consumable = (id: string): OnUseSpec | undefined => ctx.consumables.find((c) => c.id === id)
  const potion = consumable(MIGHTY_RAGE_POTION.id)
  if (potion && v.on(ID.potion)) b.add({ ...onUseCast(potion), usesPerFight: 1 }, berserk >= 0 ? [auraUp(berserk)] : [])
  const juju = consumable(JUJU_FLURRY.id)
  if (juju && v.on(ID.juju)) b.add(onUseCast(juju), [])

  // --- On the GCD -----------------------------------------------------------------------------------
  // The builder: Shred from behind (the engine never uses it from the front), Claw where it can't.
  const shredOn = v.on(ID.shred)
  const shred = shredOn ? index(SHRED) : -1
  const clawOn = v.on(ID.claw)
  /** Claw only while Shred is off or can never be used (from the front: no cooldown ever ends). */
  const clawWhen: RotationCondition[] = shred >= 0 ? [{ code: COND.cooldownAtLeast, a: shred, b: 1 }] : []
  const builderLines = (conditions: RotationCondition[]) => {
    if (shredOn) b.add(SHRED, conditions)
    if (clawOn) b.add(CLAW, [...clawWhen, ...conditions])
  }
  // What the builder costs where you stand: Shred's from behind, Claw's where Shred can't be used
  // (from the front, or with Shred off).
  const builderCost = shredOn && !ctx.front ? b.cost(shred) : clawOn ? b.cost(index(CLAW)) : Infinity

  // Row 5: Faerie Fire when it's down, and from refreshBelowSec left while there's no Energy for the
  // builder, so the GCD comes out of waiting time.
  if (v.on(ID.ffEnabled)) {
    const ff = b.add(FAERIE_FIRE_CAT, [refresh(index(FAERIE_FIRE_CAT), 0)])
    const early = seconds(v, ID.ffRefresh)
    if (early > 0 && builderCost !== Infinity) b.add(FAERIE_FIRE_CAT, [refresh(ff, early), maxEnergyTenths(builderCost - 1)])
  }

  // Row 6: with Clearcasting up, the builder first: it's free (§2.7).
  const clearcasting = auraIndex('clearcasting')
  if (clearcasting >= 0) builderLines([{ code: COND.windowOpen, a: clearcasting, b: 0 }])

  // Row 7: Rip at ≥ ripMinCP when it's off the boss (or has ≤ refreshBelowSec left) and at least
  // minFightLeftSec of the fight is left; not at all with onlyWithoutOtherBleeds while others keep
  // the boss bleeding. Row 8: at ≥ biteMinCP, Ferocious Bite in the last anyEnergyLastSec, then a
  // Shred first while Energy ≥ shredFirstFrom, and Ferocious Bite (only while Rip is up, or too
  // late for one, with onlyWhileRipUp).
  const ripLeft = seconds(v, ID.ripLeft)
  let rip = -1
  if (v.on(ID.ripEnabled) && !(v.on(ID.ripNoOtherBleeds) && ctx.othersBleed)) {
    rip = index(RIP)
    b.add(RIP, [minComboPoints(v.num(ID.ripCp)), refresh(rip, seconds(v, ID.ripRefresh)), timeLeftAtLeast(ripLeft)])
  }
  if (v.on(ID.biteEnabled)) {
    const cp = minComboPoints(v.num(ID.biteCp))
    // In the last anyEnergyLastSec, Bite ahead of the Shred first: its Energy has no time to become Shreds.
    const endMs = seconds(v, ID.biteEnd)
    if (endMs > 0) b.add(FEROCIOUS_BITE, [cp, timeLeftAtMost(endMs)])
    builderLines([cp, minEnergy(v.num(ID.biteShredFirst))])
    if (rip >= 0 && v.on(ID.biteRipUp)) {
      b.add(FEROCIOUS_BITE, [cp, auraUp(rip)])
      b.add(FEROCIOUS_BITE, [cp, timeLeftAtMost(ripLeft)])
    } else b.add(FEROCIOUS_BITE, [cp])
  }

  // Row 9: Rake when it's off the boss and its bleed has time to run; with onlyWithoutBleeds, only
  // while nothing else bleeds the boss (not your Rip, and no warriors' Deep Wounds).
  if (v.on(ID.rakeEnabled)) {
    const alone = v.on(ID.rakeNoBleed)
    if (!(alone && ctx.othersBleed)) {
      const rake = index(RAKE)
      b.add(RAKE, [refresh(rake, 0), timeLeftAtLeast(RAKE_MIN_FIGHT_LEFT_MS), ...(alone && rip >= 0 ? [auraDown(rip)] : [])])
    }
  }

  // Row 10: the builder whenever it's affordable.
  builderLines([])

  return b.result([
    ...ctx.items.map((i) => i.id),
    ...ctx.consumables.filter((c) => c.id === MIGHTY_RAGE_POTION.id || c.id === JUJU_FLURRY.id).map((c) => c.id),
  ])
}
