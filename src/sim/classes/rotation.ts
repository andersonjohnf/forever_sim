// Rotation options and priority lists per spec (docs/classes/warrior.md#51-conventions-for-rotation-settings).
//
// The rotation section of the UI renders the options generically; the plan builder turns the
// config's values (or the options' defaults for the setup, classes/options.ts) into the spec's
// abilities, priority list and pre-pull. Specs without a rotation yet simulate white swings only.
import type { WeaponType } from '@/data/items/types'
import { NO_PREPULL } from '../plan/types'
import type { FixedRotationRow, RotationGroup, RotationOption, RotationValue, SpecId } from '../types'
import { CAT_OPTIONS, catMaintainedBuffs, catRotation, catUnusedSettings } from './druid/cat'
import { BEAR_OPTIONS, bearMaintainedBuffs, bearRotation, bearUnusedSettings } from './druid/bear'
import { ARMS_OPTIONS, armsBaseStance, armsMaintainedBuffs, armsRotation } from './warrior/arms'
import { RETRIBUTION_OPTIONS, retributionRotation } from './paladin/retribution'
import {
  PROTECTION_FIXED_ROWS,
  PROTECTION_OPTIONS as PALADIN_PROTECTION_OPTIONS,
  protectionMaintainedBuffs as paladinProtectionMaintainedBuffs,
  protectionRotation as paladinProtectionRotation,
} from './paladin/protection'
import type { PaladinContext } from './paladin/setup'
import { ENHANCEMENT_OPTIONS, enhancementRotation } from './shaman/enhancement'
import { FURY_OPTIONS, FURY_RENAMED_OPTIONS, furyMaintainedBuffs, furyRotation } from './warrior/fury'
import { RACIAL_COOLDOWNS } from './warrior/abilities'
import { PROTECTION_OPTIONS, protectionMaintainedBuffs, protectionRotation } from './warrior/protection'
import { COMBAT_OPTIONS, combatMaintainedBuffs, combatRotation } from './rogue/combat'
import { ASSASSINATION_OPTIONS, assassinationMaintainedBuffs, assassinationRotation } from './rogue/assassination'
import type { TalentRanks } from './warrior/modifiers'
import type { ClassRotation } from './warrior/shared'
import type { Stance } from './warrior/talents'

export type { ClassRotation, RotationContext } from './warrior/shared'
export type { PaladinContext } from './paladin/setup'

/** What a rotation needs from the rest of the setup: the warrior's and paladin's context, and what the druid's reads. */
export interface ClassRotationContext extends PaladinContext {
  /** Ids of the equipped items (Wolfshead Helm's Energy on Tiger's Fury, druid.md §3.6, and rage on Enrage, §4.5). */
  equipped: ReadonlySet<number>
  /** Others keep the target bleeding all fight: a raid with warriors (Rip's and Rake's settings, druid.md §6.2). */
  othersBleed: boolean
  /** You attack from in front of the boss (the Fight tab's position), where a cat can't Shred (druid.md §3.1). */
  front: boolean
  /**
   * The exclusive groups the Buffs tab fills (effects/presets.ts `filledBuffGroups`): a Demoralizing
   * Shout there takes `ap-reduction`, so the bear's own roar isn't used (druid.md §6.3). Absent: none.
   */
  buffGroups?: ReadonlySet<string>
  /**
   * The weapon types in [main hand, off hand], or null for an empty hand: the rogue's Backstab and
   * Mutilate need daggers, and Hemorrhage and Ghostly Strike hit harder with one (rogue.md §3).
   * Absent: not known (a test's context).
   */
  weaponTypes?: readonly [WeaponType | null, WeaponType | null]
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
  if (spec === 'warrior-protection') return PROTECTION_OPTIONS
  if (spec === 'druid-feral-cat') return CAT_OPTIONS
  if (spec === 'paladin-retribution') return RETRIBUTION_OPTIONS
  if (spec === 'paladin-protection') return PALADIN_PROTECTION_OPTIONS
  if (spec === 'druid-feral-bear') return BEAR_OPTIONS
  if (spec === 'shaman-enhancement') return ENHANCEMENT_OPTIONS
  if (spec === 'rogue-combat') return COMBAT_OPTIONS
  if (spec === 'rogue-assassination') return ASSASSINATION_OPTIONS
  return []
}

/** What the spec always does, shown on the Rotation tab without a control (a Protection paladin's Righteous Fury). */
export function fixedRotationRows(spec: SpecId): FixedRotationRow[] {
  if (spec === 'paladin-protection') return PROTECTION_FIXED_ROWS
  return []
}

/**
 * What the Rotation tab's intro says about the spec's defaults (docs/ux.md "Rotation"): tuned for
 * the default setup once a paired search has tuned them (decision D23; Arms since M2.5a, Fury since
 * M2.5b, the Feral cat since B2, Protection since P1, Retribution since C2, the Feral bear since B3,
 * Protection paladins since C3), the common priority until then. A tank's priority choice, first on
 * the tab, names its duties (D26). None for a spec without rotation settings. The cat's also says
 * why there's no powershifting, which a Classic Era feral would look for (druid.md §2.8).
 */
export function rotationDefaultsNote(spec: SpecId): string | undefined {
  if (
    spec === 'warrior-arms' ||
    spec === 'warrior-fury' ||
    spec === 'warrior-protection' ||
    spec === 'druid-feral-bear' ||
    spec === 'paladin-retribution' ||
    spec === 'paladin-protection'
  ) {
    return 'The defaults are tuned for the default setup.'
  }
  if (spec === 'druid-feral-cat') {
    return 'The defaults are tuned for the default setup. There’s no powershifting: in Forever, Furor keeps your Energy through a shift, so it gains nothing.'
  }
  // Decision D27: a spec landed in the 90/10 mode starts from the common priority until the tuning milestone.
  if (spec === 'shaman-enhancement') {
    return 'The defaults are the common priority. There’s no totem twisting: in Forever, Windfury Totem is an aura that ends with the totem.'
  }
  // Decision D27: specs landed before the tuning milestone start from the common priority.
  if (spec === 'rogue-combat' || spec === 'rogue-assassination') return 'The defaults are the common priority, with a first quick search; they aren’t tuned yet.'
  return undefined
}

/** Setting ids a spec renamed, old → new (normalizeConfig carries saved values over). */
export function renamedRotationOptions(spec: SpecId): Readonly<Record<string, string>> {
  return spec === 'warrior-fury' ? FURY_RENAMED_OPTIONS : {}
}

/**
 * A raid with warriors keeps the boss bleeding all fight from their Deep Wounds [?]: Rend and Tear,
 * and the cat's and the bear's "only when nothing else bleeds" settings, read it (druid.md §5.1,
 * §6.2, §6.3, Q9).
 */
export const othersKeepBleeding = (raid: readonly string[]) => raid.includes('warrior')

/** Each spec's racial cooldown setting (warrior.md §5.2 row 3, §5.4 row 3, druid.md §6.2 row 2, §6.3). */
export const RACIAL_SETTING: Partial<Record<SpecId, string>> = {
  'warrior-fury': 'warrior.fury.racial.enabled',
  'warrior-arms': 'warrior.arms.racial.enabled',
  'warrior-protection': 'warrior.protection.racial.enabled',
  'druid-feral-cat': 'druid.cat.racial.enabled',
  'druid-feral-bear': 'druid.bear.racial.enabled',
  'shaman-enhancement': 'shaman.enhancement.racial.enabled',
  'rogue-combat': 'rogue.combat.racial.enabled',
  'rogue-assassination': 'rogue.assassination.racial.enabled',
}

/**
 * What the setup around a rotation decides about its settings: the race (and its name), the raid,
 * and the exclusive groups the Buffs tab fills (`filledBuffGroups`).
 */
export interface UnusedSetup {
  race: string
  raceName: string
  othersBleed: boolean
  buffGroups: ReadonlySet<string>
}

/**
 * Settings that can't do anything in this setup, each with the note the Rotation tab shows under
 * it (docs/ux.md "Rotation"): the racial cooldown for a race without one the sim uses (Orc, Troll
 * and Night Elf have one; Gnome's Eureka! isn't simulated), the cat's Rake and Rip when "only
 * when nothing else bleeds" meets a raid with warriors, and the bear's Lacerate the same way and
 * its Demoralizing Roar while the Buffs tab's Demoralizing Shout takes its place.
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
  if (spec === 'druid-feral-bear') Object.assign(out, bearUnusedSettings(values, setup))
  return out
}

/**
 * Buff catalogue ids the spec's rotation keeps up itself with these settings: the plan leaves
 * their static Buffs effects out, so each counts once (Battle Shout, warrior.md §5.2 and §5.3 row 1;
 * Protection's Sunder Armor, Thunder Clap and Demoralizing Shout on the boss, §5.4).
 */
export function maintainedBuffs(spec: SpecId, values: Record<string, RotationValue>): string[] {
  if (spec === 'warrior-fury') return furyMaintainedBuffs(values)
  if (spec === 'warrior-arms') return armsMaintainedBuffs(values)
  if (spec === 'warrior-protection') return protectionMaintainedBuffs(values)
  if (spec === 'druid-feral-cat') return catMaintainedBuffs(values)
  // docs/classes/paladin.md "Priority": a Protection paladin's own Devotion Aura.
  if (spec === 'paladin-protection') return paladinProtectionMaintainedBuffs(values)
  if (spec === 'druid-feral-bear') return bearMaintainedBuffs(values)
  if (spec === 'rogue-combat') return combatMaintainedBuffs(values)
  if (spec === 'rogue-assassination') return assassinationMaintainedBuffs(values)
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
  if (spec === 'warrior-protection') return protectionRotation(values, talents, auraIndex, context)
  if (spec === 'druid-feral-cat') return catRotation(values, talents, auraIndex, context)
  // docs/classes/paladin.md "Retribution: model and rotation".
  if (spec === 'paladin-retribution') return retributionRotation(values, talents, auraIndex, context)
  // docs/classes/paladin.md "Protection: model and rotation".
  if (spec === 'paladin-protection') return paladinProtectionRotation(values, talents, auraIndex, context)
  if (spec === 'druid-feral-bear') return bearRotation(values, talents, auraIndex, context)
  // docs/classes/shaman.md "Enhancement priority".
  if (spec === 'shaman-enhancement') return enhancementRotation(values, talents, auraIndex, context)
  // docs/classes/rogue.md §6.
  if (spec === 'rogue-combat') return combatRotation(values, talents, context)
  if (spec === 'rogue-assassination') return assassinationRotation(values, talents, context)
  return { abilities: [], rotation: [], prepull: NO_PREPULL, onUse: [], procs: [] }
}
