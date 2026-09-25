// Rotation options and priority lists per spec (docs/classes/warrior.md#51-conventions-for-rotation-settings).
//
// The rotation section of the UI renders the options generically; the plan builder turns the
// config's values (or the options' defaults for the setup, classes/options.ts) into the spec's
// abilities, priority list and pre-pull. Specs without a rotation yet simulate white swings only.
import type { WeaponType } from '@/data/items/types'
import { NO_PREPULL } from '../plan/types'
import type { AplDefinition, FixedRotationRow, RotationGroup, RotationOption, RotationValue, SpecId } from '../types'
import { CAT_OPTIONS, catMaintainedBuffs, catRotation, catUnusedSettings } from './druid/cat'
import { BEAR_APL, BEAR_OPTIONS, bearMaintainedBuffs, bearRotation, bearUnusedSettings } from './druid/bear'
import { BALANCE_OPTIONS, balanceMaintainedBuffs, balanceRotation, balanceUnusedSettings } from './druid/balance'
import { ARMS_APL, ARMS_OPTIONS, armsBaseStance, armsMaintainedBuffs, armsRotation } from './warrior/arms'
import { RETRIBUTION_OPTIONS, retributionMaintainedBuffs, retributionRotation, RETRIBUTION_APL, retributionUnusedSettings } from './paladin/retribution'
import {
  PROTECTION_APL as PALADIN_PROTECTION_APL,
  PROTECTION_FIXED_ROWS,
  PROTECTION_OPTIONS as PALADIN_PROTECTION_OPTIONS,
  protectionMaintainedBuffs as paladinProtectionMaintainedBuffs,
  protectionRotation as paladinProtectionRotation,
  protectionUnusedSettings as paladinProtectionUnusedSettings,
} from './paladin/protection'
import type { PaladinContext } from './paladin/setup'
import { ENHANCEMENT_APL, ENHANCEMENT_OPTIONS, enhancementRotation } from './shaman/enhancement'
import { mageOptions, mageRotation } from './mage/rotation'
import { SPEC_META } from '../specs'
import { ELEMENTAL_APL, ELEMENTAL_OPTIONS, elementalRotation } from './shaman/elemental'
import { FURY_APL, FURY_OPTIONS, FURY_RENAMED_OPTIONS, furyMaintainedBuffs, furyRotation } from './warrior/fury'
import { RACIAL_COOLDOWNS } from './warrior/abilities'
import { PROTECTION_APL, PROTECTION_OPTIONS, protectionMaintainedBuffs, protectionRotation, protectionUnusedSettings } from './warrior/protection'
import { COMBAT_OPTIONS, combatMaintainedBuffs, combatRotation } from './rogue/combat'
import { ASSASSINATION_OPTIONS, assassinationMaintainedBuffs, assassinationRotation } from './rogue/assassination'
import { SUBTLETY_OPTIONS, subtletyMaintainedBuffs, subtletyRotation, subtletyUnusedSettings } from './rogue/subtlety'
import { DESTRUCTION_OPTIONS, destructionMaintainedBuffs, destructionRotation, destructionUnusedSettings } from './warlock/destruction'
import { AFFLICTION_OPTIONS, afflictionMaintainedBuffs, afflictionRotation, afflictionUnusedSettings } from './warlock/affliction'
import { DEMONOLOGY_OPTIONS, demonologyMaintainedBuffs, demonologyRotation, demonologyUnusedSettings } from './warlock/demonology'
import { SHADOW_APL, SHADOW_OPTIONS, shadowRotation, shadowUnusedSettings } from './priest/shadow'
import { HUNTER_APL, hunterFixedRows, hunterOptions, hunterRotation, hunterUnusedSettings, isHunterSpec } from './hunter/rotation'
import type { TalentRanks } from './warrior/modifiers'
import { type ClassRotation, maxRageOf } from './warrior/shared'
import type { RotationSetup } from './options'
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
  /** The sheet's Spirit at the pull: the warlock's Life Tap reads it (docs/classes/warlock.md §3.3). Absent: 0. */
  spirit?: number
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
  if (spec === 'druid-balance') return BALANCE_OPTIONS
  if (spec === 'shaman-enhancement') return ENHANCEMENT_OPTIONS
  if (spec === 'shaman-elemental') return ELEMENTAL_OPTIONS
  if (spec === 'rogue-combat') return COMBAT_OPTIONS
  if (spec === 'rogue-assassination') return ASSASSINATION_OPTIONS
  if (spec === 'rogue-subtlety') return SUBTLETY_OPTIONS
  // docs/classes/mage.md: Fire, Frost and Arcane.
  if (SPEC_META[spec].classId === 'mage') return mageOptions(spec)
  if (spec === 'warlock-destruction') return DESTRUCTION_OPTIONS
  if (spec === 'warlock-affliction') return AFFLICTION_OPTIONS
  if (spec === 'warlock-demonology') return DEMONOLOGY_OPTIONS
  if (spec === 'priest-shadow') return SHADOW_OPTIONS
  // docs/classes/hunter.md §8: the three hunter specs share one list of settings.
  if (isHunterSpec(spec)) return hunterOptions(spec)
  return []
}

/**
 * What a spec's defaults can follow besides the talents and the settings (options.ts): a warrior's
 * max rage, which Protection's Balanced thresholds are shares of (warrior.md §5.4 "Balanced").
 */
export function rotationSetup(spec: SpecId, talents: TalentRanks, race: string | undefined): RotationSetup {
  return SPEC_META[spec].classId === 'warrior' ? { maxRage: maxRageOf(talents, race ?? '') } : {}
}

/**
 * The spec's rotation as a priority list you reorder (decision D31), or undefined for a spec still
 * on switches (M5.65 A2 moves the rest): Fury, the pilot, and the three tanks, whose D28 rotations are its presets.
 */
export function rotationApl(spec: SpecId): AplDefinition | undefined {
  if (spec === 'warrior-fury') return FURY_APL
  if (spec === 'warrior-arms') return ARMS_APL
  if (spec === 'warrior-protection') return PROTECTION_APL
  if (spec === 'druid-feral-bear') return BEAR_APL
  // docs/classes/paladin.md "Forever priority list (default)", with D28's rotations as its presets.
  if (spec === 'paladin-protection') return PALADIN_PROTECTION_APL
  // docs/classes/hunter.md §8.3: the three hunter specs, each its own list of the same rows.
  if (isHunterSpec(spec)) return HUNTER_APL[spec]
  // docs/classes/priest.md §6 "The priority list".
  if (spec === 'priest-shadow') return SHADOW_APL
  // docs/classes/paladin.md "Forever priority list (default)", Retribution's.
  if (spec === 'paladin-retribution') return RETRIBUTION_APL
  // docs/classes/shaman.md "Enhancement priority".
  if (spec === 'shaman-enhancement') return ENHANCEMENT_APL
  // docs/classes/shaman.md "Elemental priority".
  if (spec === 'shaman-elemental') return ELEMENTAL_APL
  return undefined
}

/** What the spec always does, shown on the Rotation tab without a control (a Protection paladin's Righteous Fury). */
export function fixedRotationRows(spec: SpecId): FixedRotationRow[] {
  if (spec === 'paladin-protection') return PROTECTION_FIXED_ROWS
  // docs/classes/hunter.md §8: Aspect of the Hawk, Trueshot Aura, the pet and Auto Shot.
  if (isHunterSpec(spec)) return hunterFixedRows(spec)
  return []
}

/**
 * What the Rotation tab's intro says about the spec's defaults (docs/ux.md "Rotation"): tuned for
 * the default setup once a paired search has tuned them (decision D23; Arms since M2.5a, Fury since
 * M2.5b, the Feral cat since B2, Protection since P1, Retribution since C2, Protection paladins since
 * C3), the common priority until then. A tank's says which of its presets (D28) are tuned and which
 * are a first pass (D27): the warrior's and the bear's Balanced, and the bear's Max TPS since T5's
 * Maul threshold; a paladin's Balanced plays as its Defensive. None for a spec without rotation
 * settings. The cat's also says why there's no powershifting, which a Classic Era feral would look
 * for (druid.md §2.8).
 */
export function rotationDefaultsNote(spec: SpecId): string | undefined {
  // D28, D27: Balanced, the Protection warrior's default since T5, is a first pass; Defensive and Max TPS were
  // tuned on 1.60.1.69913 and had D27's first-pass check on 1.60.1.70009 (warrior.md §5.4 "Build 1.60.1.70009").
  if (spec === 'warrior-protection') return 'Defensive and Max TPS were tuned on an earlier game build and had a quick check on this one; Balanced, the default, hasn’t been fully tuned yet.'
  if (spec === 'warrior-arms' || spec === 'warrior-fury') return 'The defaults are tuned for the default setup.'
  // D27 (the paladin review's PR-6, the warrior's WR-11 wording): Retribution was tuned on 1.60.1.69913 and had a
  // first-pass search with its talents on 1.60.1.70009 (paladin.md "The 1.60.1.70009 re-check").
  if (spec === 'paladin-retribution') return 'The defaults were tuned on an earlier game build and had a quick search on this one.'
  // D28 (user decision): a paladin's Balanced keeps Holy Strike, so it plays as Defensive; both, and Max TPS,
  // had a first-pass search on 1.60.1.70009 (paladin.md "Priority: Defensive, Balanced or Max TPS").
  if (spec === 'paladin-protection') return 'Defensive and Max TPS were tuned on an earlier game build and had a quick search on this one; Balanced, the default, plays as Defensive.'
  if (spec === 'druid-feral-cat') {
    return 'The defaults are tuned for the default setup. There’s no powershifting: in Forever, Furor keeps your Energy through a shift, so it gains nothing.'
  }
  // docs/classes/druid.md §6.3 "Balanced", "Max TPS": D28's default and Max TPS's Maul, a first pass (D27) around Defensive's tuned settings.
  if (spec === 'druid-feral-bear') return 'Defensive is tuned for the default setup; Balanced, the default, and Max TPS haven’t been fully tuned yet.'
  // Decision D27: a spec landed in the 90/10 mode starts from the common priority until the tuning milestone.
  if (spec === 'shaman-enhancement') {
    return 'The defaults are the common priority. There’s no totem twisting: in Forever, Windfury Totem is an aura that ends with the totem.'
  }
  if (spec === 'shaman-elemental') {
    return 'The defaults are the common priority, with a first quick search; they aren’t tuned yet. Flame Shock is there for Lava Burst, which Classic Era didn’t have.'
  }
  // Decision D27: specs landed before the tuning milestone start from the common priority.
  if (spec === 'rogue-combat' || spec === 'rogue-assassination' || spec === 'rogue-subtlety') return 'The defaults are the common priority, with a first quick search; they aren’t tuned yet.'
  // docs/classes/mage.md "First-pass defaults" (D27).
  if (SPEC_META[spec].classId === 'mage') return 'The defaults are the common priority.'
  // docs/classes/warlock.md §6.3: the same for the warlock.
  if (spec === 'warlock-destruction' || spec === 'warlock-affliction' || spec === 'warlock-demonology') return 'The defaults are the common priority, with a first quick search; they aren’t tuned yet.'
  if (spec === 'priest-shadow') return 'The defaults are the common priority, with a first quick search; they aren’t tuned yet.'
  // docs/classes/hunter.md "First-pass defaults" (D27).
  if (isHunterSpec(spec)) return 'The defaults are the common priority, with a first quick search; they aren’t tuned yet.'
  // docs/classes/druid.md §11.5: landed under D27's first-pass defaults (K6).
  if (spec === 'druid-balance') return 'The defaults are the common priority, with a first quick search; they aren’t tuned yet.'
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
  'druid-balance': 'druid.balance.racial.enabled',
  'shaman-enhancement': 'shaman.enhancement.racial.enabled',
  'shaman-elemental': 'shaman.elemental.racial.enabled',
  'rogue-combat': 'rogue.combat.racial.enabled',
  'rogue-assassination': 'rogue.assassination.racial.enabled',
  'rogue-subtlety': 'rogue.subtlety.racial.enabled',
  'mage-fire': 'mage.fire.racial.enabled',
  'mage-frost': 'mage.frost.racial.enabled',
  'mage-arcane': 'mage.arcane.racial.enabled',
  'warlock-destruction': 'warlock.destruction.racial.enabled',
  'warlock-affliction': 'warlock.affliction.racial.enabled',
  'warlock-demonology': 'warlock.demonology.racial.enabled',
  'priest-shadow': 'priest.shadow.racial.enabled',
  'hunter-marksmanship': 'hunter.marksmanship.racial.enabled',
  'hunter-beast-mastery': 'hunter.beastMastery.racial.enabled',
  'hunter-survival': 'hunter.survival.racial.enabled',
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
  /** Talent ranks by name: the warlock's Demonic Sacrifice and Incinerate settings need their talents, and the Balance filler Eclipse overrides. Absent: none. */
  talents?: ReadonlyMap<string, number>
  /** The main hand, whether it's a two-hander and its type, or null for none: a Protection paladin's Hammer of the Righteous needs a one-handed axe, mace or sword. Absent: not known. */
  mainHand?: { twoHand: boolean; type?: WeaponType } | null
  /** The stored priority-list order (D31): which of two rows sharing a cooldown sits higher (a Protection paladin's Hammer of the Righteous and Holy Strike). Absent: the default order. */
  order?: readonly string[]
}

/**
 * Settings that can't do anything in this setup, each with the note the Rotation tab shows under
 * it (docs/ux.md "Rotation"): the racial cooldown for a race without one the sim uses (Orc, Troll
 * and Night Elf have one, and a Gnome its class's Eureka!, classes/eureka.ts), the cat's Rake and Rip when "only
 * when nothing else bleeds" meets a raid with warriors, the bear's Lacerate the same way and its
 * Demoralizing Roar while the Buffs tab's Demoralizing Shout takes its place, and the Subtlety
 * rogue's Ambush and Hemorrhage upkeep while Hemorrhage builds.
 */
export function unusedSettings(spec: SpecId, values: Record<string, RotationValue>, setup: UnusedSetup): Record<string, string> {
  const out: Record<string, string> = {}
  const racial = RACIAL_SETTING[spec]
  // Every class's racial cooldowns are for the same races (a caster's are caster-racials.ts's).
  // Every class a Gnome can be has its Eureka! (classes/eureka.ts).
  if (racial && !RACIAL_COOLDOWNS[setup.race] && setup.race !== 'alliance-gnome') {
    out[racial] = `Not used: ${setup.raceName} has no racial cooldown that adds damage.`
  }
  if (spec === 'druid-feral-cat') Object.assign(out, catUnusedSettings(values, setup.othersBleed))
  if (spec === 'druid-feral-bear') Object.assign(out, bearUnusedSettings(values, setup))
  if (spec === 'rogue-subtlety') Object.assign(out, subtletyUnusedSettings(values))
  if (spec === 'warlock-destruction') Object.assign(out, destructionUnusedSettings(values, setup.talents ?? new Map()))
  if (spec === 'warlock-affliction') Object.assign(out, afflictionUnusedSettings(values, setup.talents ?? new Map()))
  if (spec === 'warlock-demonology') Object.assign(out, demonologyUnusedSettings(values, setup.talents ?? new Map()))
  // docs/classes/priest.md §6: Starshards and Dark Sacrifice are the Night Elf's and the Undead's.
  if (spec === 'priest-shadow') Object.assign(out, shadowUnusedSettings(setup.race, setup.raceName))
  if (spec === 'druid-balance') Object.assign(out, balanceUnusedSettings(values, setup.talents ?? new Map()))
  // docs/classes/warrior.md §5.4 "The priority list": a duty moved below the Sunder Armor filler, which takes every global cooldown it can pay for.
  if (spec === 'warrior-protection') Object.assign(out, protectionUnusedSettings(values, setup.talents ?? new Map(), setup.order))
  // docs/classes/paladin.md rows 5b and 7b: Hammer of the Righteous or Holy Strike, whichever sits higher, with the weapon for it; the lower Consecration row, when it never has the shared cooldown.
  if (spec === 'paladin-protection') Object.assign(out, paladinProtectionUnusedSettings(values, setup.mainHand, setup.order))
  // docs/classes/paladin.md rows 7 and 8: the lower of the two Consecration rows, when it never has the shared cooldown.
  if (spec === 'paladin-retribution') Object.assign(out, retributionUnusedSettings(values, setup.order))
  // docs/classes/hunter.md §8: the pet's settings with Lone Wolf.
  if (isHunterSpec(spec)) Object.assign(out, hunterUnusedSettings(spec, setup.talents ?? new Map()))
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
  // docs/classes/paladin.md "Retribution defaults": its own Judgement of the Crusader.
  if (spec === 'paladin-retribution') return retributionMaintainedBuffs(values)
  if (spec === 'druid-feral-bear') return bearMaintainedBuffs(values)
  if (spec === 'druid-balance') return balanceMaintainedBuffs(values)
  if (spec === 'rogue-combat') return combatMaintainedBuffs(values)
  if (spec === 'rogue-assassination') return assassinationMaintainedBuffs(values)
  if (spec === 'rogue-subtlety') return subtletyMaintainedBuffs(values)
  // docs/classes/warlock.md §6: its own Curse of the Elements.
  if (spec === 'warlock-destruction') return destructionMaintainedBuffs(values)
  if (spec === 'warlock-affliction') return afflictionMaintainedBuffs(values)
  if (spec === 'warlock-demonology') return demonologyMaintainedBuffs(values)
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
  /** A priority-list spec's order of rows (`SimConfig.rotationOrder`, rotationApl); absent: its default. */
  order?: readonly string[],
): ClassRotation {
  if (spec === 'warrior-fury') return furyRotation(values, talents, auraIndex, context, order)
  if (spec === 'warrior-arms') return armsRotation(values, talents, auraIndex, context, order)
  if (spec === 'warrior-protection') return protectionRotation(values, talents, auraIndex, context, order)
  if (spec === 'druid-feral-cat') return catRotation(values, talents, auraIndex, context)
  // docs/classes/paladin.md "Retribution: model and rotation".
  if (spec === 'paladin-retribution') return retributionRotation(values, talents, auraIndex, context, order)
  // docs/classes/paladin.md "Protection: model and rotation".
  if (spec === 'paladin-protection') return paladinProtectionRotation(values, talents, auraIndex, context, order)
  if (spec === 'druid-feral-bear') return bearRotation(values, talents, auraIndex, context, order)
  // docs/classes/druid.md §11.5.
  if (spec === 'druid-balance') return balanceRotation(values, talents, auraIndex, context)
  // docs/classes/shaman.md "Enhancement priority".
  if (spec === 'shaman-enhancement') return enhancementRotation(values, talents, auraIndex, context, order)
  // docs/classes/shaman.md "Elemental priority".
  if (spec === 'shaman-elemental') return elementalRotation(values, talents, auraIndex, context, order)
  // docs/classes/rogue.md §6.
  if (spec === 'rogue-combat') return combatRotation(values, talents, context)
  if (spec === 'rogue-assassination') return assassinationRotation(values, talents, context)
  if (spec === 'rogue-subtlety') return subtletyRotation(values, talents, context)
  // docs/classes/mage.md "Fire priority", "Frost priority", "Arcane priority".
  if (SPEC_META[spec].classId === 'mage') return mageRotation(spec, values, talents, auraIndex, context)
  // docs/classes/warlock.md §6.
  if (spec === 'warlock-destruction') return destructionRotation(values, talents, auraIndex, context)
  if (spec === 'warlock-affliction') return afflictionRotation(values, talents, auraIndex, context)
  // docs/classes/warlock.md §11.5.
  if (spec === 'warlock-demonology') return demonologyRotation(values, talents, auraIndex, context)
  // docs/classes/priest.md §6.
  if (spec === 'priest-shadow') return shadowRotation(values, talents, context, order)
  // docs/classes/hunter.md §7.
  if (isHunterSpec(spec)) return hunterRotation(spec, values, talents, context, order)
  return { abilities: [], rotation: [], prepull: NO_PREPULL, onUse: [], procs: [] }
}
