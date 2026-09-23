// Rotation options and priority lists per spec (docs/classes/warrior.md#51-conventions-for-rotation-settings).
//
// The rotation section of the UI renders the options generically; the plan builder turns the
// config's values (or the options' defaults for the setup, classes/options.ts) into the spec's
// abilities, priority list and pre-pull. Specs without a rotation yet simulate white swings only.
import { NO_PREPULL } from '../plan/types'
import type { RotationGroup, RotationOption, RotationValue, SpecId } from '../types'
import { CAT_OPTIONS, catMaintainedBuffs, catRotation, catUnusedSettings } from './druid/cat'
import { ARMS_OPTIONS, armsBaseStance, armsMaintainedBuffs, armsRotation } from './warrior/arms'
import { paladinCore, type PaladinContext } from './paladin/setup'
import { FURY_OPTIONS, FURY_RENAMED_OPTIONS, furyMaintainedBuffs, furyRotation } from './warrior/fury'
import { RACIAL_COOLDOWNS } from './warrior/abilities'
import type { TalentRanks } from './warrior/modifiers'
import type { ClassRotation } from './warrior/shared'
import type { Stance } from './warrior/talents'

export type { ClassRotation, RotationContext } from './warrior/shared'
export type { PaladinContext } from './paladin/setup'

/** What a rotation needs from the rest of the setup: the warrior's and paladin's context, and what the druid's reads. */
export interface ClassRotationContext extends PaladinContext {
  /** Ids of the equipped items (Wolfshead Helm's Energy on Tiger's Fury, druid.md §3.6). */
  equipped: ReadonlySet<number>
  /** Others keep the target bleeding all fight: a raid with warriors (Rip's and Rake's settings, druid.md §6.2). */
  othersBleed: boolean
  /** You attack from in front of the boss (the Fight tab's position), where a cat can't Shred (druid.md §3.1). */
  front: boolean
}

/**
 * The Rotation tab's headings, in the order it shows them (docs/ux.md "Rotation"): the pre-pull,
 * what runs all fight, the normal phase, the execute phase and consumables. Settings without one
 * (Arms' stance) come first.
 */
export const ROTATION_GROUPS: readonly RotationGroup[] = [
  'Before the pull',
  'Cooldowns and buffs',
  'Core abilities',
  'Fillers',
  'Execute phase',
  'Consumables',
]

export function rotationOptions(spec: SpecId): RotationOption[] {
  if (spec === 'warrior-fury') return FURY_OPTIONS
  if (spec === 'warrior-arms') return ARMS_OPTIONS
  if (spec === 'druid-feral-cat') return CAT_OPTIONS
  return []
}

/**
 * What the Rotation tab's intro says about the spec's defaults (docs/ux.md "Rotation"): tuned for
 * the default setup once a paired search has tuned them (decision D23; Arms since M2.5a, Fury since
 * M2.5b, the Feral cat since B2), the common priority until then. None for a spec without rotation
 * settings. The cat's also says why there's no powershifting, which a Classic Era feral would look
 * for (druid.md §2.8).
 */
export function rotationDefaultsNote(spec: SpecId): string | undefined {
  if (spec === 'warrior-arms' || spec === 'warrior-fury') return 'The defaults are tuned for the default setup.'
  if (spec === 'druid-feral-cat') {
    return 'The defaults are tuned for the default setup. There’s no powershifting: in Forever, Furor keeps your Energy through a shift, so it gains nothing.'
  }
  return undefined
}

/** Setting ids a spec renamed, old → new (normalizeConfig carries saved values over). */
export function renamedRotationOptions(spec: SpecId): Readonly<Record<string, string>> {
  return spec === 'warrior-fury' ? FURY_RENAMED_OPTIONS : {}
}

/**
 * Buff catalogue ids the spec's rotation keeps up itself with these settings: the plan leaves
 * their static Buffs effects out, so each counts once (Battle Shout, warrior.md §5.2 and §5.3 row 1).
 */
/**
 * A raid with warriors keeps the boss bleeding all fight from their Deep Wounds [?]: Rend and Tear,
 * and the cat's "only when nothing else bleeds" settings, read it (druid.md §5.1, §6.2, Q9).
 */
export const othersKeepBleeding = (raid: readonly string[]) => raid.includes('warrior')

/** Each spec's racial cooldown setting (warrior.md §5.2 row 3, druid.md §6.2 row 2). */
export const RACIAL_SETTING: Partial<Record<SpecId, string>> = {
  'warrior-fury': 'warrior.fury.racial.enabled',
  'warrior-arms': 'warrior.arms.racial.enabled',
  'druid-feral-cat': 'druid.cat.racial.enabled',
}

/** What the setup around a rotation decides about its settings: the race (and its name) and the raid. */
export interface UnusedSetup {
  race: string
  raceName: string
  othersBleed: boolean
}

/**
 * Settings that can't do anything in this setup, each with the note the Rotation tab shows under
 * it (docs/ux.md "Rotation"): the racial cooldown for a race without one the sim uses (Orc, Troll
 * and Night Elf have one; Gnome's Eureka! isn't simulated), and the cat's Rake and Rip when "only
 * when nothing else bleeds" meets a raid with warriors.
 */
export function unusedSettings(spec: SpecId, values: Record<string, RotationValue>, setup: UnusedSetup): Record<string, string> {
  const out: Record<string, string> = {}
  const racial = RACIAL_SETTING[spec]
  if (racial && !RACIAL_COOLDOWNS[setup.race]) {
    out[racial] =
      setup.race === 'alliance-gnome'
        ? 'Not used: the Gnome’s Eureka! isn’t simulated.'
        : `Not used: ${setup.raceName} has no racial cooldown that adds damage.`
  }
  if (spec === 'druid-feral-cat') Object.assign(out, catUnusedSettings(values, setup.othersBleed))
  return out
}

export function maintainedBuffs(spec: SpecId, values: Record<string, RotationValue>): string[] {
  if (spec === 'warrior-fury') return furyMaintainedBuffs(values)
  if (spec === 'warrior-arms') return armsMaintainedBuffs(values)
  if (spec === 'druid-feral-cat') return catMaintainedBuffs(values)
  return []
}

/**
 * The stance the spec's settings make it fight in, or undefined for the spec's own (warrior.md
 * §5; Arms can fight in Berserker Stance, §5.3 notes, Q24).
 */
export function rotationBaseStance(spec: SpecId, values: Record<string, RotationValue>): Stance | undefined {
  return spec === 'warrior-arms' ? armsBaseStance(values) : undefined
}

/** The spec's abilities, priority list and pre-pull for these settings; empty for specs without one yet. */
export function classRotation(
  spec: SpecId,
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  auraIndex: (id: string) => number,
  /** RotationContext, for the paladin its main-hand weapon (Seal of Righteousness scales with it), and for the druid what its rotation reads. */
  context: ClassRotationContext,
): ClassRotation {
  if (spec === 'warrior-fury') return furyRotation(values, talents, auraIndex, context)
  if (spec === 'warrior-arms') return armsRotation(values, talents, auraIndex, context)
  if (spec === 'druid-feral-cat') return catRotation(values, talents, auraIndex, context)
  // docs/classes/paladin.md: the seal and its judgement both specs share; the specs' rows come with C2 and the Protection slice.
  if (spec === 'paladin-retribution' || spec === 'paladin-protection') return paladinCore(spec, talents, context)
  return { abilities: [], rotation: [], prepull: NO_PREPULL, onUse: [], procs: [] }
}
