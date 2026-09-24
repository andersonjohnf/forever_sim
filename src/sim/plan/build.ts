// Config → plan (decision D15: the config is resolved once into a flat, precomputed plan).
//
// Runs on the main thread, where the datasets are loaded: it sums gear and set bonuses, applies
// enchants, buffs, racials, talents and stance as effects, resolves every condition against this
// setup, derives the character sheet, and flattens procs and auras for the engine. Workers get
// only the resulting plain object.
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData, Stats, WeaponSkill, WeaponType } from '@/data/items/types'
import { averageResist, bossOutcomeShares, glanceRange, levelResistance, PLAYER_LEVEL } from '../core/attack-table'
import { CRIT_MULTIPLIER, negativeArmorFloor, NORMALIZED_SPEED, OFF_HAND_DAMAGE, ppmChance, slowedSwingSec, toTenths } from '../core/formulas'
import { classSetup } from '../classes'
import { DRUID_FORMS, FORM_INDEX, FORM_NAME, formWeapon } from '../classes/druid/forms'
import { IDOL_OF_BRUTALITY } from '../classes/druid/abilities'
import { druidPlan } from '../classes/druid/plan'
import { protectionAssumptions, swiftJudgementPlan } from '../classes/paladin/protection'
import { paladinAssumptions, paladinManaPlan } from '../classes/paladin/setup'
import { SHAMAN_WINDFURY_WEAPON, shamanAssumptions, shamanPlan } from '../classes/shaman/setup'
import { rogueAssumptions, rogueEnergy } from '../classes/rogue/setup'
import { balanceAssumptions } from '../classes/druid/balance'
import { mageAssumptions, mageFreeCast, mageManaPlan } from '../classes/mage/setup'
import { warlockAssumptions, warlockManaPlan } from '../classes/warlock/setup'
import { priestAssumptions, priestManaPlan, priestPlan } from '../classes/priest/setup'
import { hunterAssumptions, hunterManaPlan } from '../classes/hunter/setup'
import { classRotation, maintainedBuffs, othersKeepBleeding, rotationBaseStance } from '../classes/rotation'
import { STANCE_SWAP_COOLDOWN_MS, stanceSwapKeepTenths } from '../classes/warrior/abilities'
import { type Stance, stanceEffects } from '../classes/warrior/talents'
import { BUFFS_BY_ID } from '../effects/buffs'
import { ENCHANTS_BY_ID } from '../effects/enchants'
import { ITEM_EFFECTS, itemEffectsApply } from '../effects/items'
import { buffGroupFillers, buffProvided, buffUnusedReason, forSpecClass } from '../effects/presets'
import { COOLDOWN_RACIALS, racialEffects } from '../effects/racials'
import { type AuraSpec, catalogueEffects, type Condition, type DruidForm, type Effect, type FlatStat, type OnUseSpec, type ProcSpec } from '../effects/types'
import { isTwoHand, PROFICIENCY } from '../equip'
import { currentDamageTakenRageModel, PROFILES, type RulesProfile } from '../rules/profiles'
import { SPEC_META } from '../specs'
import { BASE_PLACEHOLDERS, CLASS_BASE } from '../stats/base-stats'
import { DerivedStats, deriveStats, StatBlock } from '../stats/stat-block'
import type { CharacterSheet, ClassId, GearSlot, SimConfig } from '../types'
import { Assumptions, BEAR_TEXT } from './assumptions'
import { PET_BUFFS, petInheritanceDetail, petPlan } from './pet'
import { firesAmmo, isRangedWeapon, noRangedMods, rangedPlan, type RangedMods } from './ranged'
import {
  type AbilityPlan,
  ACTION,
  type AuraPlan,
  type FormPlan,
  HAND,
  NO_PREPULL,
  type Plan,
  type PlanBundle,
  type ProcPlan,
  SCHOOL,
  SCHOOL_COUNT,
  type SchoolPlan,
  schoolMask,
  DEFENSE,
  type SourcePlan,
  type SpellDef,
  type SpellPlan,
  STANCE,
  STANCE_ANY,
  type StancePlan,
  TRIGGER,
  TRIGGER_COUNT,
  type WeaponPlan,
  weaponPercentVs,
} from './types'

const itemData = itemJson as unknown as ItemData
const ITEMS = new Map<number, Item>(itemData.items.map((i) => [i.id, i]))

/** Whether the gear blocks with a shield: one in the off hand, beside a one-hander (combat-tables §8), as the plan's `hasShield`. */
export function wieldsShield(gear: SimConfig['gear']): boolean {
  const mh = gear.mainHand && ITEMS.get(gear.mainHand.itemId)
  const oh = gear.offHand && ITEMS.get(gear.offHand.itemId)
  return !(mh && isTwoHand(mh)) && oh?.slot === 'shield'
}

/** Item stat → stat block field (character-stats.md#derived-stat-pipeline, step 2). */
const ITEM_STAT: Partial<Record<keyof Stats, FlatStat>> = {
  strength: 'str',
  agility: 'agi',
  stamina: 'sta',
  intellect: 'int',
  spirit: 'spi',
  // Item-armor % (Toughness) multiplies `armor` only: a Forever item's base armor, or a Classic
  // Era fallback item's whole stored armor, including any extra armor Forever would store as
  // stat 50; never Forever's stat-50 bonus armor [?] (character-stats.md#derived-stat-pipeline,
  // step 4, and OQ-15).
  armor: 'itemArmor',
  bonusArmor: 'bonusArmor',
  defense: 'defense',
  defenseRating: 'defenseRating',
  dodge: 'dodge',
  dodgeRating: 'dodgeRating',
  parry: 'parry',
  parryRating: 'parryRating',
  block: 'block',
  blockRating: 'blockRating',
  blockValue: 'blockValue',
  // Forever's "+x Attack Power" (ItemSparse stat 38) counts for melee and ranged: `addGearStat` adds
  // it to `rap` too (docs/mechanics/ranged-and-pets.md §3).
  attackPower: 'ap',
  // docs/mechanics/ranged-and-pets.md §3: ranged attack power beyond it, which only a plan with a ranged weapon reads.
  rangedAttackPower: 'rap',
  // Classic-form gear: melee (and ranged) percentages, each to its own pool (step 2).
  hit: 'hit',
  crit: 'crit',
  meleeCrit: 'crit',
  spellHit: 'spellHit',
  spellCrit: 'spellCrit',
  // Forever-form gear: ratings, converted by the profile.
  hitRating: 'hitRating',
  critRating: 'critRating',
  hasteRating: 'hasteRating',
  expertiseRating: 'expertiseRating',
  armorPenetration: 'armorPen',
  // Spell damage and mana regeneration (paladin.md#conventions-used-below: "SP" is all-schools
  // spell damage plus Holy; Forever's healing items carry their spell damage as its own line).
  spellPower: 'spellDamage',
  spellDamage: 'spellDamage',
  holySpellDamage: 'holySpellDamage',
  mp5: 'mp5',
  // The caster core (docs/mechanics/spells.md §3, §5): each school's own spell damage, and spell penetration.
  fireSpellDamage: 'fireSpellDamage',
  frostSpellDamage: 'frostSpellDamage',
  shadowSpellDamage: 'shadowSpellDamage',
  natureSpellDamage: 'natureSpellDamage',
  arcaneSpellDamage: 'arcaneSpellDamage',
  spellPenetration: 'spellPen',
}

/** "+X spell damage against <type>" item stats (encounter.md#6-creature-type-biome-and-zone-forever). */
const SPELL_DAMAGE_VS: Partial<Record<keyof Stats, SimConfig['fight']['creatureType']>> = {
  spellDamageVsBeasts: 'beast',
  spellDamageVsDemons: 'demon',
  spellDamageVsDragonkin: 'dragonkin',
  spellDamageVsElementals: 'elemental',
  spellDamageVsGiants: 'giant',
  spellDamageVsHumanoids: 'humanoid',
  spellDamageVsMechanical: 'mechanical',
  spellDamageVsUndead: 'undead',
}

/** "+X Attack Power against <type>" item stats (encounter.md#6-creature-type-biome-and-zone-forever). */
const AP_VS: Partial<Record<keyof Stats, SimConfig['fight']['creatureType']>> = {
  attackPowerVsBeasts: 'beast',
  attackPowerVsDemons: 'demon',
  attackPowerVsDragonkin: 'dragonkin',
  attackPowerVsElementals: 'elemental',
  attackPowerVsGiants: 'giant',
  attackPowerVsHumanoids: 'humanoid',
  attackPowerVsMechanical: 'mechanical',
  attackPowerVsUndead: 'undead',
}

/**
 * "+X Attack Power in Cat, Bear, and Dire Bear forms" (the item stat `feralAttackPower`): flat
 * attack power in the animal forms only, added 1:1, which no talent multiplies [?]
 * (docs/classes/druid.md#22-attack-power-in-forms, Q28). It goes into those forms' own stat blocks
 * (druidForms); any other class, or a druid in caster form, gets nothing from it.
 */
/**
 * Adds an item's or a set bonus's flat stat to the block (character-stats.md#derived-stat-pipeline,
 * step 2). "+x Attack Power", and "+x Attack Power against <type>" when the boss is that type, is the
 * item's melee and ranged attack power both (docs/mechanics/ranged-and-pets.md §3): the scraper
 * keeps only a ranged surplus as `rangedAttackPower`. False when the key isn't a flat stat here.
 */
function addGearStat(block: StatBlock, key: keyof Stats, value: number, creatureType: SimConfig['fight']['creatureType']): boolean {
  const stat = ITEM_STAT[key]
  if (stat) {
    block[stat] += value
    if (key === 'attackPower') block.rap += value
    return true
  }
  if (key in AP_VS) {
    if (AP_VS[key] === creatureType) {
      block.ap += value
      block.rap += value
    }
    return true
  }
  return false
}

const feralAp = (value: number): Effect => ({ kind: 'stat', stat: 'ap', value, when: { form: ['cat', 'bear'] } })

const ATTRIBUTE_MULT = { str: 'strMult', agi: 'agiMult', sta: 'staMult', int: 'intMult', spi: 'spiMult' } as const

/** Base rage cap (rage.md#rage-pool-cap-and-decay). */
const BASE_MAX_RAGE = 100


/**
 * Interval of the stand-in incoming hits for DPS specs (encounter §4, [?]). Each hit carries
 * `damageTakenPerSec` × 2 s of damage before your mitigation, the size Forever's rage from damage
 * taken reads (rage.md#forever-).
 */
const DPS_DAMAGE_INTERVAL_MS = 2000

interface Weapon {
  hand: 0 | 1
  /** The equipped item; null for a druid form's weapon with nothing equipped (druid.md §2.1). */
  item: Item | null
  /** The item's type ('fist' stands in for a form's weapon with nothing equipped). */
  type: WeaponType
  twoHand: boolean
  plan: WeaponPlan
  /** A druid form's weapon, which replaces the item's damage and speed (druid.md §2.1). */
  form?: boolean
}

interface Collected {
  block: StatBlock
  damageMult: number
  physicalMult: number
  damageTakenMult: number
  threatMult: number
  /** Righteous Fury's multiplier on Holy threat (threat.md#paladin-righteous-fury). */
  holyThreatMult: number
  maxRageFlat: number
  maxRageMult: number
  targetArmor: number
  /** The boss's static flat Holy damage taken: another paladin's Judgement of the Crusader (buffs doc §4.2). */
  holyTaken: number
  bossAp: number
  bossSlowPct: number
  offHand: { damagePct: number; hit: number; ragePct: number }
  tempEnchants: Extract<Effect, { kind: 'tempEnchant' }>[]
  /** The rogue's poisons' apply chance in points and damage % (Improved Poisons, Vile Poisons; rogue.md §4). */
  poisonChancePct: number
  poisonDamagePct: number
  procs: { spec: ProcSpec; origin: 0 | 1 | null }[]
  periodicRage: Extract<Effect, { kind: 'periodicRage' }>[]
  /** Selected on-use consumables; `use` when a rotation can press it (effects/types.ts). */
  onUse: { id: string; name: string; use?: OnUseSpec }[]
  zoneGatedUnmet: boolean
  /**
   * The schools' static numbers by SCHOOL code (docs/mechanics/spells.md §3, §5, §9): your damage
   * and the boss's damage taken (products), your crit (a sum) and the debuffs' resistance change.
   */
  schools: { damage: number[]; taken: number[]; crit: number[]; resistance: number[]; hit: number[] }
  /** The ranged weapon's mods (docs/mechanics/ranged-and-pets.md §2–§4): a scope, ammo, a quiver, a ranged talent. */
  ranged: RangedMods
}

/** Every school plain: ×1, ×1, +0, +0 (docs/mechanics/spells.md §9). */
const plainSchools = (): Collected['schools'] => ({
  damage: Array<number>(SCHOOL_COUNT).fill(1),
  taken: Array<number>(SCHOOL_COUNT).fill(1),
  crit: Array<number>(SCHOOL_COUNT).fill(0),
  resistance: Array<number>(SCHOOL_COUNT).fill(0),
  hit: Array<number>(SCHOOL_COUNT).fill(0),
})

/**
 * The set an item counts toward: its `setId`, if that set lists the item (docs/data/items.md#equipping-rules).
 * A Classic Era row can carry a set id that Forever reuses for another set (16526 and 361).
 */
export function setOf(item: Item): string | null {
  return item.setId && itemData.sets[item.setId]?.itemIds.includes(item.id) ? item.setId : null
}

/** Why a setup can't be simulated yet (the result explains it instead of simulating). */
export class UnsupportedSetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedSetupError'
  }
}

export function buildPlan(config: SimConfig): PlanBundle & { blockers: string[] } {
  const meta = SPEC_META[config.spec]
  const classId = meta.classId
  const profile = PROFILES[config.rules.profile]
  const applyUnmeasured = config.rules.unmeasuredRatings === 'apply'
  const tank = meta.role === 'tank'
  const fight = config.fight
  const notes = new Assumptions()
  const blockers: string[] = []
  const unknown: string[] = []
  /** Base values that are D24's Classic-based placeholders or other unmeasured [?] values (character-stats OQ-2, OQ-5). */
  const placeholders: string[] = []

  // --- Gear ------------------------------------------------------------------------------------
  const equipped = new Map<GearSlot, Item>()
  for (const [slot, entry] of Object.entries(config.gear) as [GearSlot, { itemId: number }][]) {
    const item = entry && ITEMS.get(entry.itemId)
    if (item) equipped.set(slot, item)
  }
  const mhItem = equipped.get('mainHand')
  const ohItem = equipped.get('offHand')
  const twoHand = mhItem ? isTwoHand(mhItem) : false
  const hasShield = !twoHand && ohItem?.slot === 'shield'
  const weaponSkill: Partial<Record<WeaponSkill, number>> = {}

  const weapons: [Weapon | null, Weapon | null] = [null, null]
  const makeWeapon = (hand: 0 | 1, item: Item | undefined): Weapon | null => {
    const w = item?.weapon
    if (!item || item.itemClass !== 'Weapon' || !w || w.min === null || w.max === null || !item.weaponType) return null
    return {
      hand,
      item,
      type: item.weaponType,
      twoHand: isTwoHand(item),
      plan: {
        name: hand === HAND.main ? 'Main hand' : 'Off hand',
        icon: item.icon,
        min: w.min,
        max: w.max,
        speedSec: w.speed,
        twoHand: isTwoHand(item),
        flatDamage: 0,
        handMult: 1,
        skill: 0,
        hitBonus: 0,
        critBonus: 0,
        armorPenPct: 0,
        rageMult: 1,
        glanceLow: 0,
        glanceHigh: 0,
        // docs/mechanics/damage-and-timing.md#22-normalization-for-instant-attacks
        normalizedSpeed: isTwoHand(item)
          ? NORMALIZED_SPEED.twoHand
          : item.weaponType === 'dagger'
            ? NORMALIZED_SPEED.dagger
            : NORMALIZED_SPEED.oneHand,
      },
    }
  }
  weapons[HAND.main] = makeWeapon(HAND.main, mhItem)
  if (!twoHand) weapons[HAND.off] = makeWeapon(HAND.off, ohItem)
  // The weapon types in hand, a caster's too: a weapon racial's crit holds while one is equipped,
  // spells included, whether or not it swings (racials.ts; mage.md "Races": Sword Specialization).
  const heldTypes = weapons.map((w) => w?.type ?? null)
  // A caster fights from range with its spells (docs/mechanics/spells.md §12): it doesn't swing its
  // weapon, whose stats still count, and its weapon's procs and enchants' procs never fire.
  // A ranged spec shoots its ranged weapon the same way (docs/mechanics/ranged-and-pets.md §12).
  if (meta.caster || meta.ranged) {
    weapons[HAND.main] = null
    weapons[HAND.off] = null
  }
  /** A ranged spec's ranged weapon, when the ranged slot holds one Auto Shot fires (docs/mechanics/ranged-and-pets.md §1, §12). */
  const rangedSlot = meta.ranged ? equipped.get('ranged') : undefined
  const rangedItem = isRangedWeapon(rangedSlot) ? rangedSlot : undefined
  // A ranged spec shoots nothing without one: an empty slot or a wand is a blocker, not 0 DPS.
  if (meta.ranged && !rangedItem) blockers.push('Add a ranged weapon (a bow, gun, crossbow or thrown weapon) in Gear to simulate this spec.')

  // --- Stat block: base ----------------------------------------------------------------------
  const base = CLASS_BASE[classId]
  const block = new StatBlock()
  // Decision D24: an unmeasured base value takes its Classic-based placeholder, listed in the
  // assumptions (docs/mechanics/character-stats.md#other-base-values-at-level-60); the attribute
  // rows too (#paladin-and-druid-base-attributes: the druid's and the paladin's).
  const stand = BASE_PLACEHOLDERS[classId]
  const measuredRow = base.attributes(config.race)
  const attributes = measuredRow ?? stand.attributes?.[config.race] ?? null
  if (attributes) {
    if (!measuredRow) placeholders.push('base attributes')
    block.baseStr = attributes.str
    block.baseAgi = attributes.agi
    block.baseSta = attributes.sta
    block.baseInt = attributes.int
    block.baseSpi = attributes.spi
  } else {
    unknown.push('base attributes')
    notes.add('unknownBaseAttributes')
    // Every class is simulated, so a missing row is the race's: Skyborne's are unknown (OQ-1) for
    // the classes with no class-row placeholder (the warrior and the hunter).
    const cls = meta.className.toLowerCase()
    blockers.push(
      config.race.includes('skyborne')
        ? `Skyborne base stats at level 60 aren’t known yet, so a Skyborne ${cls} can’t be simulated. Pick another race.`
        : `This race’s base stats at level 60 aren’t known yet, so this ${cls} can’t be simulated. Pick another race.`,
    )
  }
  // Avoidance matters only when the boss attacks you, so only a tank lists its avoidance
  // placeholders: the sheet's footnote and the assumptions below name the same values.
  // A caster's spells read neither its attack power nor its melee crit (docs/classes/mage.md#what-the-sim-needs):
  // those are neither listed nor left out for it (`listed` false).
  const baseValue = (known: number | null, placeholder: number | undefined, name: string, listed = true) => {
    if (known !== null) return known
    if (placeholder !== undefined) {
      if (listed) placeholders.push(name)
      return placeholder
    }
    // Neither measured nor a placeholder: left out of the sheet, which says so.
    if (listed) unknown.push(name)
    return 0
  }
  block.baseAp = baseValue(base.baseAp, stand.baseAp, 'base attack power', !meta.caster)
  block.baseHealth = baseValue(base.baseHealth, stand.baseHealth, 'base health')
  block.baseDodge = baseValue(base.baseDodge, stand.baseDodge, 'base dodge', tank)
  // A player parries with a melee weapon in hand; druids can't parry (character-stats §other base values).
  block.canParry = base.baseParry > 0 && weapons[HAND.main] !== null
  block.baseParry = base.baseParry
  block.canBlock = hasShield
  block.baseBlock = base.baseBlock
  // Base parry and block, 5% [?], are unmeasured too (character-stats OQ-5): a tank's placeholders.
  if (tank && block.canParry) placeholders.push('base parry')
  if (tank && block.canBlock) placeholders.push('base block')
  block.baseCrit = baseValue(base.baseCrit, stand.baseCrit, 'base crit', !meta.caster)
  block.critPerAgi = base.critPerAgi
  block.spellCritPerInt = base.spellCritPerInt
  block.baseSpellCrit = baseValue(base.baseSpellCrit, stand.baseSpellCrit, 'base spell crit')
  block.hasMana = base.baseMana !== null
  block.baseMana = base.baseMana ?? 0
  // The rogue's 1 attack power per Strength and per Agility (docs/classes/rogue.md#76-base-values).
  if (base.apPerStr !== undefined) block.apPerStr = base.apPerStr
  if (base.apPerAgi !== undefined) block.apPerAgi = base.apPerAgi
  // The hunter's ranged attack power: 2 per Agility [F] and its base [?] (docs/classes/hunter.md#75-base-values).
  if (base.rapPerAgi !== undefined) block.rapPerAgi = base.rapPerAgi
  if (base.baseRap !== undefined) block.baseRap = baseValue(base.baseRap, stand.baseRap, 'base ranged attack power')

  // --- Effects -------------------------------------------------------------------------------
  const setup = classSetup(classId, config.spec, config.talents, profile, rotationBaseStance(config.spec, config.rotation))
  // The paladin uses mana, not rage (paladin.md#mana-model), and so does the shaman
  // (docs/classes/shaman.md#mana); the rogue uses Energy (rogue.md §2.1). None has a rage pool, and
  // their hits give none either (`rageFromHits`), so no rage assumption applies to them.
  const usesMana = classId === 'paladin' || classId === 'shaman' || classId === 'hunter' || meta.caster === true
  const usesRage = classId === 'warrior' || (classId === 'druid' && !meta.caster)
  if (!setup.simulated && attributes) blockers.push(`${meta.className} simulation isn’t available yet.`)
  // A druid in an animal form attacks with the form's weapon, whatever is equipped; the item's
  // other stats and effects still apply (druid.md §2.1, §8 "Form swap"). Its per-hand bonuses
  // collect on the form's weapon, and the other forms' main hands are made from it (druidForms).
  const equippedMain = weapons[HAND.main]
  if (setup.form === 'cat' || setup.form === 'bear') {
    weapons[HAND.main] = {
      hand: HAND.main,
      item: mhItem ?? null,
      type: equippedMain?.type ?? 'fist',
      twoHand: false,
      plan: formWeapon(setup.form, null, profile, fight.bossLevel),
      form: true,
    }
  }
  const c: Collected = {
    block,
    damageMult: 1,
    physicalMult: 1,
    damageTakenMult: 1,
    threatMult: 1,
    holyThreatMult: 1,
    maxRageFlat: 0,
    maxRageMult: 1,
    targetArmor: 0,
    holyTaken: 0,
    bossAp: 0,
    bossSlowPct: 0,
    offHand: { damagePct: 0, hit: 0, ragePct: 0 },
    tempEnchants: [],
    poisonChancePct: 0,
    poisonDamagePct: 0,
    procs: [],
    periodicRage: [],
    onUse: [],
    zoneGatedUnmet: false,
    schools: plainSchools(),
    ranged: noRangedMods(),
  }
  const holds = (when: Condition | undefined, stance = setup.stance): boolean => {
    if (!when) return true
    if (when.shield !== undefined && when.shield !== hasShield) return false
    if (when.twoHand !== undefined && when.twoHand !== twoHand) return false
    if (when.stance !== undefined && when.stance !== stance) return false
    if (when.creature && !when.creature.includes(fight.creatureType)) return false
    // A weapon of one of these types in either hand (warrior.md §2.7, §2.9, Q15).
    if (when.weapons && !heldTypes.some((t) => t !== null && when.weapons!.includes(t))) return false
    if (when.zones && !when.zones.includes(fight.zone)) {
      c.zoneGatedUnmet = true
      return false
    }
    return true
  }
  const apply = (effects: Effect[], origin: 0 | 1 | null) => {
    for (const e of effects) if (holds(e.when)) applyEffect(c, e, origin, weapons)
  }

  // Gear stats, set bonuses and item effects.
  const setCounts = new Map<string, number>()
  const classicItems: string[] = []
  const unmodelled: string[] = []
  /** Equipped on-use items the sim can't press, and the use effects it can (effects/items.ts). */
  const onUseItems: string[] = []
  const itemUses: OnUseSpec[] = []
  /** Item and set-bonus stats bound to a druid's forms (feral attack power). */
  const formItemEffects: Effect[] = []
  for (const [slot, item] of equipped) {
    if (slot === 'offHand' && twoHand) continue
    const origin = slot === 'mainHand' ? HAND.main : slot === 'offHand' ? HAND.off : null
    for (const [key, value] of Object.entries(item.stats) as [keyof Stats, number][]) {
      if (!value) continue
      if (addGearStat(block, key, value, fight.creatureType)) continue
      if (key === 'feralAttackPower') formItemEffects.push(feralAp(value))
      else if (key in SPELL_DAMAGE_VS && SPELL_DAMAGE_VS[key] === fight.creatureType) block.spellDamage += value
      else if (key === 'weaponDamage') {
        // A ranged item's "+x damage" is its own shots' (docs/mechanics/ranged-and-pets.md §3), never a melee weapon's.
        if (slot === 'ranged') c.ranged.flatDamage += value
        else for (const w of weapons) if (w && (origin === null || w.hand === origin)) w.plan.flatDamage += value
      }
      // docs/mechanics/ranged-and-pets.md §1: a quiver's or ammo pouch's ranged attack speed, multiplied.
      else if (key === 'rangedAttackSpeed') c.ranged.hasteMult *= 1 + value / 100
    }
    for (const [skill, value] of Object.entries(item.weaponSkill ?? {}) as [WeaponSkill, number][]) {
      weaponSkill[skill] = (weaponSkill[skill] ?? 0) + value
    }
    const setId = setOf(item)
    if (setId) setCounts.set(setId, (setCounts.get(setId) ?? 0) + 1)
    if (!item.foreverData) classicItems.push(item.name)
    const override = ITEM_EFFECTS[item.id]
    if (override) apply(typeof override.effects === 'function' ? override.effects(profile) : override.effects, origin)
    // An effect that names only another spec's abilities (Totem of Rebirth's Riptide for a damage
    // spec) does nothing here, so it isn't listed.
    else if ((item.procs.length > 0 || item.otherEquip.length > 0 || (item.weapon?.extraDamage?.length ?? 0) > 0) && itemEffectsApply(item.id, config.spec))
      unmodelled.push(item.name)
    if (override?.use) itemUses.push(override.use)
    else if (item.useEffects.length > 0) onUseItems.push(item.name)
  }
  // docs/mechanics/ranged-and-pets.md §1, §3: ammo adds its damage per second to the ranged weapon's
  // shots when it's the kind that weapon fires: arrows for bows and crossbows, bullets for guns.
  const ammoItem = equipped.get('ammo')
  const rangedWeapon = equipped.get('ranged')
  const ammoFired = !ammoItem?.ammo || !rangedWeapon?.weaponType || firesAmmo(rangedWeapon.weaponType, ammoItem.ammo.projectile)
  if (ammoItem?.ammo && rangedWeapon?.weaponType && ammoFired) c.ranged.ammoDps += ammoItem.ammo.dps
  // docs/data/items.md#stats-armor-and-block-value: the Forever client has no innate shield block
  // value. A shield with no Forever data uses its Classic Era stats (D6), and with them its Classic
  // Era block value, flagged [?] (character-stats.md#strength).
  const fallbackShieldBlockValue = hasShield ? (ohItem?.classicShieldBlockValue ?? 0) : 0
  block.blockValue += fallbackShieldBlockValue
  /** Active set bonuses the plan can't apply (not flat stats or a weapon skill), e.g. "The Gladiator (5)". */
  const unmodelledSetBonuses: string[] = []
  for (const [setId, count] of setCounts) {
    const set = itemData.sets[setId]
    for (const bonus of set.bonuses) {
      if (bonus.pieces > count) continue
      if (Object.keys(bonus.parsed ?? {}).length === 0 && Object.keys(bonus.weaponSkill ?? {}).length === 0) {
        unmodelledSetBonuses.push(`${set.name} (${bonus.pieces})`)
        continue
      }
      for (const [key, value] of Object.entries(bonus.parsed ?? {}) as [keyof Stats, number][]) {
        if (!value || addGearStat(block, key, value, fight.creatureType)) continue
        if (key === 'feralAttackPower') formItemEffects.push(feralAp(value))
      }
      for (const [skill, value] of Object.entries(bonus.weaponSkill ?? {}) as [WeaponSkill, number][]) {
        weaponSkill[skill] = (weaponSkill[skill] ?? 0) + value
      }
    }
  }

  // Enchants.
  for (const [slot, entry] of Object.entries(config.gear) as [GearSlot, { enchantId?: string }][]) {
    const enchant = entry?.enchantId ? ENCHANTS_BY_ID.get(entry.enchantId) : undefined
    if (!enchant || !equipped.has(slot)) continue
    const origin = slot === 'mainHand' ? HAND.main : slot === 'offHand' ? HAND.off : null
    apply(catalogueEffects(enchant, profile), origin)
  }

  // Racials, talents and stance. The weapon racials read the weapons in either hand (warrior.md §2.9).
  apply(racialEffects(config.race, classId), null)
  // A druid's form-bound effects go into each form's own stat block (druid.md §2.2; druidForms below).
  apply(setup.effects.filter((e) => !e.when?.form), null)
  // The base stance's effects are in the static numbers, as above; each stance's factors turn them
  // into its own, so a stance dance can switch them (warrior.md §2.1, §7 "Stances").
  const stances: StancePlan[] = setup.stance ? stancePlans(setup.stance, stanceEffects(profile), setup.effects, holds) : []

  // Buffs, debuffs and consumables. A buff the rotation keeps up itself (the warrior's own Battle
  // Shout, warrior.md §5.2 row 1) is its aura in the fight, not a static effect, so it counts once;
  // the sheet still shows it, since it's up for all but the first moments of the fight.
  const hasDebuffs = { armor: false, boss: false, slow: false }
  const maintained = setup.simulated ? maintainedBuffs(config.spec, config.rotation) : []
  const sheetOnly: Effect[] = []
  for (const id of maintained) {
    const buff = BUFFS_BY_ID.get(id)
    // The profile's column, as the fight's aura is the profile's class ability
    // (classes/warrior/abilities.ts `battleShout`: +139, `classicEra` +232), and the sheet shows that.
    if (buff) sheetOnly.push(...catalogueEffects(buff, profile))
  }
  /**
   * The exclusive groups the Buffs tab fills with a buff the rotation doesn't keep up, each with the
   * entry that fills it (Expose Armor's `armor-major`, Demoralizing Shout's `ap-reduction`).
   */
  /** The Buffs tab's effects that reach a pet (docs/mechanics/ranged-and-pets.md §8). */
  const petBuffs: Effect[] = []
  const filledGroups = buffGroupFillers(config.buffs.enabled, config.buffs.raid, config.spec, [...maintained, ...(setup.replacesBuffs ?? [])])
  // A buff the talents bring takes its exclusive group too: a Balance druid's own Moonkin Aura leaves a
  // Leader of the Pack out, as the game's "exclusive with" does (docs/classes/druid.md §11.1).
  const talentGroups = new Set((setup.replacesBuffs ?? []).flatMap((id) => BUFFS_BY_ID.get(id)?.exclusiveGroup ?? []))
  for (const id of config.buffs.enabled) {
    const buff = BUFFS_BY_ID.get(id)
    if (!buff || !forSpecClass(buff, config.spec) || !buffProvided(buff, config.buffs.raid, config.spec) || buffUnusedReason(buff, config.spec)) continue
    if (maintained.includes(id) || setup.replacesBuffs?.includes(id)) continue
    if (buff.exclusiveGroup !== undefined && talentGroups.has(buff.exclusiveGroup)) continue
    const effects = catalogueEffects(buff, profile)
    apply(effects, null)
    if (PET_BUFFS.has(id)) petBuffs.push(...effects.filter((e) => holds(e.when)))
    for (const e of effects) {
      if (e.kind === 'targetArmor') hasDebuffs.armor = true
      if (e.kind === 'bossAp' && e.value !== 0) hasDebuffs.boss = true
      if (e.kind === 'bossSlow') hasDebuffs.slow = true
    }
  }

  // Classic Era's Windfury Totem is itself a main-hand temporary enchant (564), so it takes that
  // weapon's slot from a stone (buffs doc, Windfury Totem); Forever's is a party aura.
  const windfuryHoldsMainHand = profile.catalogue.windfuryMainHandEnchant && c.procs.some((p) => p.spec.id === 'windfury')
  // Temporary weapon enchants: each weapon takes the highest-priority one that fits it (buffs doc §3.6).
  // A stone's crit is its own aura on the warrior, for every melee attack, so two stack [?].
  let elementalStones = 0
  /** A rogue's main-hand poison, beside Forever's Windfury Totem (the assumptions below). */
  let mainHandPoison = false
  /** The temporary enchant a weapon of this type in this hand takes: the highest priority that fits it. */
  const tempEnchantFor = (type: WeaponType, hand: 0 | 1) =>
    c.tempEnchants
      // A poison goes on its own hand only (docs/classes/rogue.md §4).
      .filter((t) => (!t.weapons || t.weapons.includes(type)) && (!t.hand || t.hand === (hand === HAND.main ? 'main' : 'off')))
      .sort((a, b) => b.priority - a.priority)[0]
  // A caster swings no weapon, but a wizard oil on the one it holds is still an aura on it (buffs doc §3.6).
  const casterMain = weapons[HAND.main] === null ? heldTypes[HAND.main] : null
  const casterOil = casterMain && !windfuryHoldsMainHand ? tempEnchantFor(casterMain, HAND.main) : undefined
  block.spellDamage += casterOil?.spellDamage ?? 0
  block.spellCrit += casterOil?.spellCrit ?? 0
  for (const w of weapons) {
    if (!w || !w.item) continue
    if (windfuryHoldsMainHand && w.hand === HAND.main) continue
    const best = tempEnchantFor(w.type, w.hand)
    if (!best) continue
    // A poison's proc comes from that weapon's hits (rogue.md §4).
    if (best.proc) {
      c.procs.push({ spec: best.proc, origin: w.hand })
      if (w.hand === HAND.main) mainHandPoison = true
    }
    w.plan.flatDamage += best.weaponDamage ?? 0
    // A wizard oil's spell damage and spell crit are its equip aura's, on you (buffs doc §3.6).
    block.spellDamage += best.spellDamage ?? 0
    block.spellCrit += best.spellCrit ?? 0
    if (best.crit) {
      block.crit += best.crit
      elementalStones++
    }
  }

  // --- Weapons: per-hand numbers ---------------------------------------------------------------
  const oh = c.offHand
  for (const w of weapons) {
    if (!w) continue
    // In a form, items' weapon skill doesn't apply [?] (druid.md §2.1, Q28).
    const skillName = w.form ? undefined : w.item?.weapon?.skill
    w.plan.skill = 5 * PLAYER_LEVEL + (skillName ? (weaponSkill[skillName] ?? 0) : 0)
    ;[w.plan.glanceLow, w.plan.glanceHigh] = glanceRange(profile, fight.bossLevel, w.plan.skill)
    if (w.hand === HAND.off) {
      // docs/mechanics/damage-and-timing.md#23-off-hand: 50% before talents; DWS adds 5% per rank (warrior W8)
      w.plan.handMult = OFF_HAND_DAMAGE * (1 + oh.damagePct / 100)
      w.plan.hitBonus += oh.hit
      w.plan.rageMult = 1 + oh.ragePct / 100
    }
    w.plan.armorPenPct = Math.min(1, w.plan.armorPenPct)
  }

  // --- Druid forms (docs/classes/druid.md §2.1, §2.2, §2.8) ----------------------------------------
  // One stat block, main hand and threat multiplier per form, from the shared block and each form's
  // own effects; the plan's static numbers become those of the form the spec fights in.
  const forms = setup.form
    ? druidForms(setup.form, [...setup.effects.filter((e) => e.when?.form), ...formItemEffects], c, weapons[HAND.main], equippedMain, weaponSkill, profile, fight.bossLevel)
    : undefined

  // --- Derived stats and the sheet -------------------------------------------------------------
  // docs/classes/shaman.md#spell-damage: the shaman's spells read their school's spell damage (the
  // caster core's, docs/mechanics/spells.md §5): all schools plus Mental Quickness's share, plus a
  // Nature, Frost or Fire line. Holy-only spell damage does nothing for it.
  if (classId === 'shaman') block.holySpellDamage = 0
  const deriveOptions = { profile, applyUnmeasured, level: PLAYER_LEVEL }
  const derived = deriveStats(block, deriveOptions, new DerivedStats())
  // The sheet counts the buffs the rotation keeps up (flat stats only: Battle Shout's AP).
  let shown = derived
  if (sheetOnly.length > 0) {
    const sheetBlock = new StatBlock().copyFrom(block)
    for (const e of sheetOnly) if (e.kind === 'stat') sheetBlock[e.stat] += e.value
    shown = deriveStats(sheetBlock, deriveOptions, new DerivedStats())
  }
  // docs/mechanics/spells.md §12: a caster spec (a mage, a warlock, an Elemental shaman, a Shadow
  // Priest, a Balance druid) casts from range and never swings its weapon (above), whose stats still
  // count: nothing melee applies to it.
  const melee = !meta.caster
  const mh = weapons[HAND.main]
  // docs/mechanics/ranged-and-pets.md §2–§4: a ranged spec's sheet shows its ranged weapon's numbers.
  const sheetRanged = meta.ranged ? equipped.get('ranged') : undefined
  const sheetRangedWeapon = sheetRanged?.weapon && sheetRanged.weaponType && sheetRanged.weaponType !== 'wand' ? sheetRanged.weapon : null
  const sheet: CharacterSheet = {
    strength: shown.strength,
    agility: shown.agility,
    stamina: shown.stamina,
    intellect: shown.intellect,
    spirit: shown.spirit,
    health: shown.health,
    mana: block.hasMana ? shown.mana : null,
    armor: shown.armor,
    attackPower: shown.attackPower,
    critPct: shown.crit + (mh?.plan.critBonus ?? 0),
    hitPct: shown.hit,
    hastePct: (shown.hasteMult - 1) * 100,
    expertise: shown.expertise,
    weaponSkill: { mainHand: mh?.plan.skill ?? 5 * PLAYER_LEVEL, offHand: weapons[HAND.off]?.plan.skill ?? null },
    dodgePct: shown.dodge,
    parryPct: shown.parry,
    blockPct: shown.block,
    blockValue: shown.blockValue,
    // A druid can't parry or use a shield (character-stats §other base values): its sheet leaves them out.
    ...(base.baseParry > 0 ? {} : { canParry: false }),
    ...(PROFICIENCY[classId].shield ? {} : { canBlock: false }),
    defense: shown.defense,
    critReductionPct: shown.critReduction,
    // docs/mechanics/combat-tables.md#8-boss--player-tanks: the boss's table against this sheet.
    bossTable: tank
      ? bossOutcomeShares({
          playerLevel: PLAYER_LEVEL,
          bossLevel: fight.bossLevel,
          defense: shown.defense,
          dodge: shown.dodge,
          parry: shown.parry,
          block: shown.block,
          canCrush: fight.boss.canCrush,
          front: true,
        })
      : null,
    unknown,
    placeholders,
    // docs/classes/paladin.md#mana-model, #conventions-used-below: the paladin's spell stats, as the
    // engine starts the fight with them (Holy spell damage with Champion of the Light's share).
    // The shaman's the same way: its spell damage for Nature and Frost (docs/classes/shaman.md#spell-damage).
    ...(usesMana && !meta.caster && !meta.ranged
      ? { spell: { holyDamage: shown.holySpellDamage, critPct: shown.spellCrit, hitPct: shown.spellHit, mp5: block.mp5 } }
      : {}),
    // docs/classes/hunter.md#9-implementation-notes: a ranged spec's ranged attack power, crit, hit,
    // attack speed and weapon skill with its ranged weapon, as the fight starts, and its mana per 5 s.
    ...(meta.ranged
      ? {
          ranged: {
            rangedAttackPower: shown.rangedAttackPower,
            critPct: shown.crit + c.ranged.crit,
            hitPct: shown.hit + c.ranged.hit,
            speedSec: sheetRangedWeapon ? sheetRangedWeapon.speed / (shown.hasteMult * c.ranged.hasteMult) : null,
            weaponSkill: 5 * PLAYER_LEVEL + (sheetRangedWeapon?.skill ? (weaponSkill[sheetRangedWeapon.skill] ?? 0) : 0),
            ammoDps: c.ranged.ammoDps,
            mp5: block.mp5,
          },
        }
      : {}),
    // docs/mechanics/spells.md §3–§5: a caster's spell stats, by school.
    ...(meta.caster ? { spell: casterSheet(shown, block, c.schools) } : {}),
  }

  // --- Procs, auras and breakdown rows ------------------------------------------------------------
  const sources: SourcePlan[] = [
    // In a form the swings are the form's own, not the weapon's: "Auto attack" (druid.md §3.10).
    { id: 'mainHand', name: mh?.form ? 'Auto attack' : 'Main hand', icon: (mh?.form ? mh.plan.icon : mh?.item?.icon) ?? 'inv_sword_04' },
    { id: 'offHand', name: 'Off hand', icon: weapons[HAND.off]?.item?.icon ?? 'inv_sword_04' },
  ]
  const sourceIndex = (id: string, name: string, icon: string) => {
    const i = sources.findIndex((s) => s.id === id)
    if (i >= 0) return i
    sources.push({ id, name, icon })
    return sources.length - 1
  }
  const auras: AuraPlan[] = []
  /** The plan aura for `spec` under `key`, added on first use with the icon of what applies it. */
  const auraIndex = (spec: AuraSpec, key: string, icon: string) => {
    const i = auras.findIndex((a) => a.id === key)
    if (i >= 0) return i
    auras.push({
      id: key,
      name: spec.name,
      icon,
      durationMs: spec.durationMs,
      maxStacks: spec.maxStacks ?? 1,
      whiteSwingCharges: spec.whiteSwingCharges ?? 0,
      // docs/classes/shaman.md#flurry: at most one charge used per 500 ms, only when set.
      ...(spec.whiteSwingChargeIcdMs ? { whiteSwingChargeIcdMs: spec.whiteSwingChargeIcdMs } : {}),
      critCharges: spec.critCharges ?? 0,
      str: spec.mods.str ?? 0,
      agi: spec.mods.agi ?? 0,
      ap: spec.mods.ap ?? 0,
      apPct: spec.mods.apPct ?? 0,
      crit: spec.mods.crit ?? 0,
      spellCrit: spec.mods.spellCrit ?? 0,
      haste: spec.mods.haste ?? 0,
      damage: spec.mods.damage ?? 0,
      // Defensive mods and block charges (combat-tables §8), only when set.
      ...(spec.mods.dodge ? { dodge: spec.mods.dodge } : {}),
      ...(spec.mods.parry ? { parry: spec.mods.parry } : {}),
      ...(spec.mods.block ? { block: spec.mods.block } : {}),
      ...(spec.mods.blockValue ? { blockValue: spec.mods.blockValue } : {}),
      ...(spec.mods.armor ? { armor: spec.mods.armor } : {}),
      ...(spec.mods.damageTaken ? { damageTaken: spec.mods.damageTaken } : {}),
      ...(spec.blockCharges ? { blockCharges: spec.blockCharges } : {}),
      ...(spec.takenCharges ? { takenCharges: spec.takenCharges } : {}),
      // paladin.md: Vengeance's Holy damage, JotC's Holy damage taken, one seal at a time.
      ...(spec.mods.holy ? { holy: spec.mods.holy } : {}),
      ...(spec.mods.holyTaken ? { holyTaken: spec.mods.holyTaken } : {}),
      ...(spec.group ? { group: spec.group } : {}),
      // Debuffs the player keeps on the boss (Faerie Fire, druid.md §3.8; warrior.md §7 "Debuffs on
      // the boss"), and an item-armor aura (Enrage, druid.md §4.5), only when set.
      ...(spec.mods.targetArmor ? { targetArmor: spec.mods.targetArmor } : {}),
      ...(spec.mods.bossSlow ? { bossSlow: spec.mods.bossSlow } : {}),
      ...(spec.mods.bossAp ? { bossAp: spec.mods.bossAp } : {}),
      ...(spec.mods.itemArmorPct ? { itemArmorPct: spec.mods.itemArmorPct } : {}),
      // The rogue's (rogue.md §3.7, §4.4), only when set.
      ...(spec.mods.energyRegen ? { energyRegen: spec.mods.energyRegen } : {}),
      ...(spec.mods.poisonDamage ? { poisonDamage: spec.mods.poisonDamage } : {}),
      ...(spec.mods.poisonChance ? { poisonChance: spec.mods.poisonChance } : {}),
      ...(spec.mods.bleedDamage ? { bleedDamage: spec.mods.bleedDamage } : {}),
      // The caster core's (docs/mechanics/spells.md §4, §5, §8, §9), only when set.
      ...(spec.mods.schoolMask ? { schoolMask: spec.mods.schoolMask } : {}),
      ...(spec.mods.schoolDamage ? { schoolDamage: spec.mods.schoolDamage } : {}),
      ...(spec.mods.schoolTaken ? { schoolTaken: spec.mods.schoolTaken } : {}),
      ...(spec.mods.schoolCrit ? { schoolCrit: spec.mods.schoolCrit } : {}),
      ...(spec.mods.castHaste ? { castHaste: spec.mods.castHaste } : {}),
      ...(spec.mods.spellDamage ? { spellDamage: spec.mods.spellDamage } : {}),
      ...(spec.mods.spellDamagePct ? { spellDamagePct: spec.mods.spellDamagePct } : {}),
      ...(spec.mods.spiritRegen ? { spiritRegen: spec.mods.spiritRegen } : {}),
      ...(spec.mods.castingRegen ? { castingRegen: spec.mods.castingRegen } : {}),
      // The mage's (docs/classes/mage.md#combustion, #arcane-power), only when set.
      ...(spec.critChargeSchools?.length ? { critChargeSchools: schoolMask(spec.critChargeSchools) } : {}),
      ...(spec.refreshKeepsCharges ? { refreshKeepsCharges: true } : {}),
      ...(spec.mods.manaCostPct ? { manaCostPct: spec.mods.manaCostPct } : {}),
      // The Balance druid's Nature's Grace (docs/classes/druid.md §11.3), only when set.
      ...(spec.mods.gcdPct ? { gcdPct: spec.mods.gcdPct } : {}),
      // The ranged and pet core's (docs/mechanics/ranged-and-pets.md §3, §4, §8), only when set.
      ...(spec.mods.rap ? { rap: spec.mods.rap } : {}),
      ...(spec.mods.rapPct ? { rapPct: spec.mods.rapPct } : {}),
      ...(spec.mods.rangedHaste ? { rangedHaste: spec.mods.rangedHaste } : {}),
      ...(spec.mods.petAp ? { petAp: spec.mods.petAp } : {}),
      ...(spec.mods.petCrit ? { petCrit: spec.mods.petCrit } : {}),
      ...(spec.mods.petHaste ? { petHaste: spec.mods.petHaste } : {}),
      ...(spec.mods.petDamage ? { petDamage: spec.mods.petDamage } : {}),
    })
    return auras.length - 1
  }
  const spells: SpellPlan[] = []
  /** The plan spell for `def` (paladin.md#conventions-used-below), added on first use with its breakdown row. */
  /** Spells boosted by an aura (Stormstrike's, shaman.md), resolved once every ability's aura is in. */
  const spellBoosts: { spell: number; boost: NonNullable<SpellDef['boost']> }[] = []
  /** Spells an aura's stacks give crit (Winter's Chill's Frostbolt, docs/classes/mage.md), resolved the same way. */
  const spellCritAuras: { spell: number; critAura: NonNullable<SpellDef['critAura']> }[] = []
  const spellIndex = (def: SpellDef) => {
    const source = sourceIndex(def.id, def.name, def.icon)
    const i = spells.findIndex((x) => x.source === source)
    if (i >= 0) return i
    const { name: _, icon: __, school, defense, boost, critAura, ...rest } = def
    // docs/mechanics/spells.md §7: a spell with a DoT. A pure DoT's row counts its applications and
    // ticks, as a bleed's does; a hybrid's ticks get a row of their own, "<name> (DoT)", after its hit.
    let dotSource: number | undefined
    if ((def.dotTicks ?? 0) > 0) {
      const ticksCanCrit = def.dotCanCrit === true && profile.combat.periodicCrits
      const direct = def.min > 0 || def.max > 0 || def.spCoefficient > 0 || def.weaponPercent > 0
      if (direct) {
        dotSource = sourceIndex(`${def.id}Dot`, `${def.name} (DoT)`, def.icon)
        sources[dotSource].bleed = { ticksCanCrit, avoidable: false }
      } else sources[source].bleed = { ticksCanCrit, avoidable: defense === 'magic' && !def.alwaysHit }
    }
    spells.push({ ...rest, school: SCHOOL[school], defense: DEFENSE[defense], source, ...(dotSource !== undefined ? { dotSource } : {}) })
    // One that always lands and never crits (Holy Shield's damage) shows no crit or avoided shares.
    if (def.cannotCrit && (defense === 'none' || (def.alwaysHit && def.noActiveDefense))) sources[source].certain = true
    if (boost) spellBoosts.push({ spell: spells.length - 1, boost })
    if (critAura) spellCritAuras.push({ spell: spells.length - 1, critAura })
    return spells.length - 1
  }
  /** The mage's rolling Ignite (docs/classes/mage.md#ignite): its numbers and row, from its one proc. */
  const rolling: { ignite?: Plan['ignite'] } = {}
  let procs: ProcPlan[] = []
  /** The aura id each proc needs to be up (Bloodthrill: your Rend), resolved once the abilities' auras are in. */
  const procNeeds: (string | undefined)[] = []
  /** The druid forms each proc is bound to (Primal Fury's rage: bear), resolved once the reachable forms are known. */
  const procForms: (readonly DruidForm[] | undefined)[] = []
  /** The spell id each spell proc names (Improved Scorch's Scorch), resolved once every spell is in (docs/mechanics/spells.md §10). */
  const procSpells: (string | undefined)[] = []
  const chainBits = new Map<string, number>()
  const addProc = (spec: ProcSpec, origin: 0 | 1 | null) => {
    const proc = resolveProc(spec, origin, weapons, rangedItem ? rangedItem.weapon.speed : null)
    if (!proc) return
    const { action } = spec
    /** Vile Poisons' factor on a rogue's poison damage; 1 on any other proc (rogue.md §4.3). */
    const poisonDamage = spec.poison ? 1 + c.poisonDamagePct / 100 : 1
    switch (action.kind) {
      case 'extraAttacks': {
        let bit = chainBits.get(spec.id)
        if (bit === undefined) {
          bit = 1 << chainBits.size
          chainBits.set(spec.id, bit)
        }
        proc.action = ACTION.extraAttacks
        proc.amount = action.count
        proc.a = action.bonusAp ?? 0
        proc.chainBit = bit
        proc.source = sourceIndex(spec.id, spec.name, spec.icon)
        break
      }
      case 'aura':
        proc.action = ACTION.aura
        proc.amount = auraIndex(action.aura, spec.from === 'weapon' && origin !== null ? `${action.aura.id}.${origin}` : action.aura.id, spec.icon)
        // Its own duration for this aura (the Overpower window: 6 s from Bloodthrill, warrior.md §2.8); 0 = the aura's.
        proc.b = action.durationMs ?? 0
        // Stacks it adds at once (Eclipse's 2 charges, docs/classes/druid.md §11.3), only when more than one.
        if ((action.stacks ?? 1) > 1) proc.a = action.stacks!
        break
      case 'rage':
        proc.action = ACTION.rage
        proc.amount = toTenths(action.amount)
        proc.source = sourceIndex(spec.id, spec.name, spec.icon)
        break
      case 'spellDamage':
        proc.action = ACTION.spellDamage
        // A rogue's poison takes Vile Poisons' damage (rogue.md §4.3).
        proc.a = action.min * poisonDamage
        proc.b = action.max * poisonDamage
        proc.school = SCHOOL[action.school]
        proc.source = sourceIndex(spec.id, spec.name, spec.icon)
        notes.add('magicProcs')
        break
      case 'weaponBleed':
        proc.action = ACTION.weaponBleed
        proc.amount = action.ticks
        proc.a = action.share
        proc.b = action.periodMs
        proc.source = sourceIndex(spec.id, spec.name, spec.icon)
        // Applications and ticks share the row; a proc's bleed can't crit or be avoided (warrior.md §2.5).
        sources[proc.source].bleed = { ticksCanCrit: false, avoidable: false }
        break
      case 'spell':
        // A seal's proc (paladin.md#seals): its spell's row counts its casts.
        proc.action = ACTION.spell
        proc.amount = spellIndex(action.spell)
        proc.source = spells[proc.amount].source
        break
      case 'mana':
        // Shield Specialization (paladin.md#protection-tree): the mana's threat goes on its row.
        proc.action = ACTION.mana
        proc.amount = action.pctOfMax
        proc.source = sourceIndex(spec.id, spec.name, spec.icon)
        break
      case 'manaFlat': {
        // Improved Seal of Fury (paladin.md#protection-tree): more for each level the boss is above you.
        const levelPct = Math.min(action.maxLevelPct, action.perLevelPct * Math.max(0, fight.bossLevel - PLAYER_LEVEL))
        proc.action = ACTION.manaFlat
        proc.amount = toTenths(action.amount * (1 + levelPct / 100))
        proc.source = sourceIndex(spec.id, spec.name, spec.icon)
        break
      }
      case 'stackingDot': {
        // Deadly Poison (rogue.md §4.2): its row counts applications (they can miss) and ticks.
        proc.action = ACTION.stackingDot
        proc.amount = action.maxStacks
        proc.a = action.tick * poisonDamage
        proc.b = action.periodMs
        proc.school = SCHOOL[action.school]
        proc.durationMs = action.durationMs
        proc.periodicCanCrit = action.periodicCanCrit
        proc.source = sourceIndex(spec.id, spec.name, spec.icon)
        sources[proc.source].bleed = { ticksCanCrit: action.periodicCanCrit && profile.combat.periodicCrits, avoidable: true }
        notes.add('magicProcs')
        break
      }
      case 'ignite': {
        // docs/classes/mage.md#ignite: one rolling DoT per plan, whose row counts the crits that fed it
        // and its ticks, and whose marker shows its uptime on the boss.
        proc.action = ACTION.ignite
        proc.source = sourceIndex(spec.id, spec.name, spec.icon)
        sources[proc.source].bleed = { ticksCanCrit: false, avoidable: false }
        const durationMs = action.ticks * action.tickMs
        rolling.ignite ??= {
          pct: action.pct,
          ticks: action.ticks,
          tickMs: action.tickMs,
          school: SCHOOL[action.school],
          source: proc.source,
          aura: auraIndex({ id: spec.id, name: spec.name, durationMs, mods: {} }, spec.id, spec.icon),
        }
        break
      }
      case 'manaOfCost':
        // docs/classes/mage.md#talents: Master of Elements, a share of the critting spell's cost.
        proc.action = ACTION.manaOfCost
        proc.amount = action.pct
        proc.source = sourceIndex(spec.id, spec.name, spec.icon)
        break
      case 'petPower':
        // docs/mechanics/ranged-and-pets.md §7: power for the pet, in tenths.
        proc.action = ACTION.petPower
        proc.amount = toTenths(action.amount)
        break
    }
    if (spec.poison) {
      // Improved Poisons' apply chance, in points on each hand's chance (rogue.md §4.3).
      proc.poison = true
      proc.chance = [proc.chance[0] + c.poisonChancePct / 100, proc.chance[1] + c.poisonChancePct / 100]
    }
    // What its breakdown row counts a fight: Reckoning's extra attacks, Holy Shield's blocks.
    if (spec.counts && proc.source >= 0) sources[proc.source].counts = spec.counts
    // docs/mechanics/spells.md §10: a spell proc's schools.
    if (spec.schools && spec.schools.length > 0) proc.schools = schoolMask(spec.schools)
    procs.push(proc)
    procNeeds.push(spec.requiresAura)
    procForms.push(spec.forms)
    procSpells.push(spec.fromSpell)
  }
  for (const { spec, origin } of c.procs) addProc(spec, origin)
  // A weapon's own proc aura (Crusader's Holy Strength) is one per hand; with both, each names its hand.
  for (const aura of auras) {
    const hand = /^(.+)\.([01])$/.exec(aura.id)
    if (hand && auras.some((a) => a.id === `${hand[1]}.${1 - Number(hand[2])}`)) {
      aura.name = `${aura.name} (${hand[2] === '0' ? 'main hand' : 'off hand'})`
    }
  }
  const periodicRage = c.periodicRage.map((p) => ({ periodMs: p.periodMs, tenths: toTenths(p.amount), source: -1 }))

  // --- Abilities and the priority list (docs/classes/warrior.md §5) ------------------------------
  // A raid with warriors keeps their Deep Wounds on the boss, so it bleeds from others all fight: an
  // assumption for Rend and Tear and the cat's Rip (druid.md §5.1, §6.2, Q9 [?]).
  const othersBleed = othersKeepBleeding(config.buffs.raid)
  const classRot = setup.simulated
    ? classRotation(config.spec, config.rotation, setup.talents, (id) => auras.findIndex((a) => a.id === id), {
        race: config.race,
        items: itemUses,
        consumables: c.onUse.flatMap((u) => (u.use ? [u.use] : [])),
        executePhase: fight.executePct > 0,
        profile,
        // paladin.md#protection-model-and-rotation: Holy Shield needs a shield.
        hasShield,
        creatureType: fight.creatureType,
        mainHand: mh ? { speedSec: mh.plan.speedSec, twoHand: mh.twoHand, type: mh.type } : null,
        equipped: new Set([...equipped.values()].map((i) => i.id)),
        othersBleed,
        front: fight.position === 'front',
        weaponTypes: [weapons[HAND.main]?.type ?? null, weapons[HAND.off]?.type ?? null],
        maxMana: block.hasMana ? derived.mana : 0,
        spellDamage: derived.natureSpellDamage,
        jotcRule: config.rules.jotcBonus ?? 'coefficient',
        hotrWeaponDps: config.rules.hotrWeaponDps ?? 'withAttackPower',
        buffGroups: new Set(filledGroups.keys()),
        spirit: derived.spirit,
      })
    : { abilities: [], rotation: [], prepull: NO_PREPULL, onUse: [], procs: [] }
  // Raging Blows' off-hand strike gets its own row next to the ability's (warrior.md §3.1), a
  // cast's buff or a bleed's marker joins the plan's auras (Death Wish, Recklessness, racial
  // cooldowns; Rend), and the encounter's creature type picks the weapon share (Spearing Strike).
  // A reactive ability's window is an aura too (the Overpower window, warrior.md §2.8, §7).
  // docs/ux.md#results: a Protection paladin whose rotation keeps Holy Shield up, most of the fight,
  // sees the boss's table with it up too (paladin.md "Protection: model and rotation").
  const blockBuff = tank && sheet.bossTable ? classRot.abilities.find((a) => a.id === 'holyShield' && (a.aura?.mods.block ?? 0) > 0) : undefined
  if (blockBuff?.aura) {
    const blockPct = blockBuff.aura.mods.block!
    sheet.bossTableUp = {
      name: blockBuff.name,
      auraId: blockBuff.aura.id,
      blockPct,
      table: bossOutcomeShares({
        playerLevel: PLAYER_LEVEL,
        bossLevel: fight.bossLevel,
        defense: shown.defense,
        dodge: shown.dodge,
        parry: shown.parry,
        block: shown.block + blockPct,
        canCrush: fight.boss.canCrush,
        front: true,
      }),
    }
  }
  const abilities: AbilityPlan[] = classRot.abilities.map((def) => {
    const {
      offHand,
      aura,
      vsCreature: _,
      window,
      spellDef,
      tickSpellDef,
      auraCrit: __,
      noCooldownWhile: ___,
      stackAuraId: ____,
      selfAuraSpec,
      tickAuraSpec,
      costStacks: _____,
      opensWindow,
      instantAuraId: ______,
      needsAuraId: _______,
      consumesDotOf: ________,
      chargeAuraId: _________,
      ...a
    } = def
    const source = sourceIndex(a.id, a.name, a.icon)
    // A bleed's row counts applications and ticks (Rend: its ticks crit only where periodic
    // effects can, damage-and-timing §4).
    const ticksCanCrit = a.periodicCanCrit && profile.combat.periodicCrits
    if (a.kind === 'bleed') sources[source].bleed = { ticksCanCrit, avoidable: true }
    // A spell on the boss that deals no damage (Faerie Fire, druid.md §3.8, §4.5; Demoralizing Roar and
    // Shout): it can't crit, and its only failure is a miss or a resist.
    const noDamage = a.weaponPercent === 0 && a.flatDamage === 0 && a.apCoefficient === 0 && a.damagePerExtraRage === 0 && !(a.blockValueCoefficient ?? 0)
    if (a.spellHit || (a.kind === 'spellTable' && noDamage)) sources[source].spell = true
    // An attack that also bleeds (Rake, druid.md §3.3; Lacerate, §4.3): its ticks get a row of their own, whose
    // applications come from landed hits, so they can't be avoided.
    let dotSource: number | undefined
    if (a.kind !== 'bleed' && a.dotTicks > 0) {
      dotSource = sourceIndex(`${a.id}Bleed`, `${a.name} (bleed)`, a.icon)
      sources[dotSource].bleed = { ticksCanCrit, avoidable: false }
    }
    return {
      ...a,
      weaponPercent: weaponPercentVs(def, fight.creatureType),
      source,
      offHandSource: offHand && weapons[HAND.off] ? sourceIndex(`${a.id}OffHand`, `${a.name} (off hand)`, a.icon) : -1,
      aura: aura ? auraIndex(aura, aura.id, a.icon) : -1,
      window: window ? auraIndex(window, window.id, a.icon) : -1,
      // A paladin ability's spells (paladin.md): its own shares its row.
      ...(spellDef ? { spell: spellIndex(spellDef) } : {}),
      ...(tickSpellDef ? { tickSpell: spellIndex(tickSpellDef) } : {}),
      ...(dotSource !== undefined ? { dotSource } : {}),
      // docs/classes/shaman.md: an aura it puts on the player when used (Improved Stormstrike's).
      ...(selfAuraSpec ? { selfAura: auraIndex(selfAuraSpec, selfAuraSpec.id, a.icon) } : {}),
      // Subtlety's (rogue.md §5.3): Thousand Cuts' stacks from Rupture's ticks, Cutthroat's Ambush window.
      ...(tickAuraSpec ? { tickAura: auraIndex(tickAuraSpec, tickAuraSpec.id, a.icon) } : {}),
      ...(opensWindow ? { opensAura: auraIndex(opensWindow.aura, opensWindow.aura.id, a.icon), opensAuraChance: opensWindow.chance } : {}),
    }
  })
  // docs/mechanics/spells.md §7: a caster's DoT is marked on the boss by the aura of the ability
  // that casts it (its `aura`), which rotation conditions read.
  for (const a of abilities) {
    if (a.aura < 0) continue
    for (const s of [a.spell, a.tickSpell]) {
      if (s !== undefined && s >= 0 && (spells[s].dotTicks ?? 0) > 0) spells[s].dotAura = a.aura
    }
  }
  // Crit an aura gives some abilities (Berserk's, druid.md §3.7), and the aura that suspends an
  // ability's cooldown (Berserk's Mangle, §4.6), once every ability's aura is in; without an ability
  // that puts it up, there's none.
  classRot.abilities.forEach((def, i) => {
    if (def.auraCrit) {
      const aura = auras.findIndex((x) => x.id === def.auraCrit!.aura)
      // Cold Blood's is used up by the strike that lands (docs/classes/rogue.md §3.8).
      if (aura >= 0) abilities[i].auraCrit = { aura, pct: def.auraCrit.pct, ...(def.auraCrit.consume ? { consume: true } : {}) }
    }
    if (def.noCooldownWhile) {
      const aura = auras.findIndex((x) => x.id === def.noCooldownWhile)
      if (aura >= 0) abilities[i].noCooldownAura = aura
    }
    // Thousand Cuts' stacks make Backstab and Hemorrhage cheaper (rogue.md §5.3), when Rupture puts them up.
    if (def.costStacks) {
      const aura = auras.findIndex((x) => x.id === def.costStacks!.aura)
      if (aura >= 0) Object.assign(abilities[i], { costAura: aura, costPerStackTenths: def.costStacks.tenthsPerStack })
    }
  })
  // The rotation's own procs (the Overpower window's openers, warrior.md §2.8). A proc that needs an
  // aura (Bloodthrill: your Rend on the target) is rolled only while it's up, and left out if the plan
  // has no such aura (no Rend in the rotation).
  for (const spec of classRot.procs) addProc(spec, null)
  // docs/classes/shaman.md: an ability whose cast time and cost an aura's stacks cut (Lightning Bolt and
  // Maelstrom Weapon), and a spell an aura boosts (Stormstrike's), once every proc's and ability's aura
  // is in; without that aura there's nothing to cut or boost.
  classRot.abilities.forEach((def, i) => {
    if (def.stackAuraId) {
      const aura = auras.findIndex((x) => x.id === def.stackAuraId)
      if (aura >= 0) abilities[i].stackAura = aura
    }
    // docs/classes/mage.md#presence-of-mind: the aura that makes its cast instant.
    if (def.instantAuraId) {
      const aura = auras.findIndex((x) => x.id === def.instantAuraId)
      if (aura >= 0) abilities[i].instantAura = aura
    }
  })
  // docs/classes/druid.md §11.3: the aura whose charges shorten an ability's cast (Eclipse's Starfire),
  // when a proc puts it up.
  classRot.abilities.forEach((def, i) => {
    if (!def.chargeAuraId) return
    const aura = auras.findIndex((x) => x.id === def.chargeAuraId)
    if (aura >= 0) abilities[i].chargeAura = aura
    else delete abilities[i].chargeCastMs
  })
  for (const { spell, boost } of spellBoosts) {
    const aura = auras.findIndex((x) => x.id === boost.aura)
    // docs/classes/warlock.md §3: Incinerate's boost reads Immolate's marker and keeps it up; so does Lava
    // Burst's on your Flame Shock (docs/classes/shaman.md#elemental-abilities).
    if (aura >= 0) Object.assign(spells[spell], { boostAura: aura, boostPct: boost.pct, ...(boost.keep ? { boostKeep: true } : {}) })
  }
  // docs/classes/mage.md#winters-chill: a spell an aura's stacks give crit, once the procs' auras are in.
  for (const { spell, critAura } of spellCritAuras) {
    const aura = auras.findIndex((x) => x.id === critAura.aura)
    if (aura >= 0) Object.assign(spells[spell], { critAura: aura, critAuraPct: critAura.pctPerStack })
  }
  // docs/classes/warlock.md §8: an ability that needs an aura up (Conflagrate: Immolate's marker) and
  // one whose landing ends another spell's DoT (Conflagrate consumes Immolate). Without the aura in the
  // plan it can never be used, so its lines are left out.
  const neverUsable = new Set<number>()
  classRot.abilities.forEach((def, i) => {
    if (def.needsAuraId !== undefined) {
      const aura = auras.findIndex((x) => x.id === def.needsAuraId)
      if (aura >= 0) abilities[i].needsAura = aura
      else neverUsable.add(i)
    }
    if (def.consumesDotOf) {
      const row = sources.findIndex((x) => x.id === def.consumesDotOf!.spell)
      const s = spells.findIndex((x) => x.source === row && (x.dotTicks ?? 0) > 0)
      if (s >= 0) Object.assign(abilities[i], { consumesDot: s, consumeChance: def.consumesDotOf.chance })
    }
  })
  // A druid's proc bound to forms rolls only in them: always if it holds in every form the fight can
  // be in (the starting one and those its shapeshifts enter), and left out if in none (druid.md §2.8).
  const reachable = forms
    ? classRot.abilities.reduce((mask, a) => (a.kind === 'shift' && a.shiftTo !== undefined ? mask | (1 << a.shiftTo) : mask), 1 << FORM_INDEX[setup.form!])
    : 0
  const hitsGiveRage = rageFromHits(classId, forms, reachable)
  procs = procs.flatMap((p, i) => {
    let resolved = p
    const need = procNeeds[i]
    if (need !== undefined) {
      const aura = auras.findIndex((a) => a.id === need)
      if (aura < 0) return []
      resolved = { ...resolved, requiresAura: aura }
    }
    // docs/mechanics/spells.md §10: a proc that names a spell the plan doesn't cast is left out.
    const fromSpell = procSpells[i]
    if (fromSpell !== undefined) {
      const row = sources.findIndex((x) => x.id === fromSpell)
      if (row < 0 || !spells.some((x) => x.source === row)) return []
      resolved = { ...resolved, fromSource: row }
    }
    const bound = procForms[i]
    if (bound && forms) {
      const mask = bound.reduce((m, f) => m | (1 << FORM_INDEX[f]), 0)
      if ((mask & reachable) === 0) return []
      if ((reachable & ~mask) !== 0) resolved = { ...resolved, forms: mask }
    }
    return [resolved]
  })
  // docs/classes/shaman.md#totems: "When applied to main hand, [Windfury Weapon] disables any benefit you
  // personally receive from Windfury Totem" [F] (16362's tooltip), so a shaman's own imbue leaves the totem out.
  if (procs.some((p) => p.id === SHAMAN_WINDFURY_WEAPON) && procs.some((p) => p.id === 'windfury')) {
    procs = procs.filter((p) => p.id !== 'windfury')
    notes.add('windfuryWeaponTotem')
  }
  // docs/classes/druid.md §11.3: a proc's rate per minute of casting reads each spell's cast time, its
  // ability's, at least the GCD; only a plan with such a proc has them.
  if (procs.some((p) => (p.ppmCast ?? 0) > 0)) {
    for (const a of abilities) {
      for (const s of [a.spell, a.tickSpell]) if (s !== undefined && s >= 0) spells[s].procCastMs = Math.max(a.gcdMs, a.castMs)
    }
  }
  const triggers: number[][] = Array.from({ length: TRIGGER_COUNT }, () => [])
  procs.forEach((p, i) => triggers[p.trigger].push(i))
  // A debuff the rotation keeps on the boss is the aura named after its Buffs entry (Protection's
  // Sunder Armor, Thunder Clap and Demoralizing Shout, warrior.md §5.4; the bear's Faerie Fire and
  // Demoralizing Roar, druid.md §6.3). When the Buffs tab fills its exclusive group with another
  // (Expose Armor for Sunder Armor, Demoralizing Shout for the roar), only one applies in game, and
  // the Buffs tab's stays: the rotation's changes nothing on the boss, and its threat still counts
  // (§7), though in Classic Era a Sunder Armor may fail to apply over a stronger Expose Armor [?] (Q35).
  for (const aura of auras) {
    const group = maintained.includes(aura.id) ? BUFFS_BY_ID.get(aura.id)?.exclusiveGroup : undefined
    const by = group === undefined ? undefined : filledGroups.get(group)
    if (by !== undefined) {
      delete aura.targetArmor
      delete aura.bossSlow
      delete aura.bossAp
      notes.add('replacedDebuff', `${by} (Buffs) takes the place of your ${aura.name}`)
    }
    if (aura.bossSlow) hasDebuffs.slow = true
    if (aura.bossAp) hasDebuffs.boss = true
  }

  // --- The ranged weapon and the pet (docs/mechanics/ranged-and-pets.md §12) ---------------------
  // A ranged spec's Auto Shot fires the Gear tab's ranged weapon, at its skill (5 × level plus its
  // type's bonuses), with the setup's ranged effects (a scope, ammo, a quiver, its talents).
  const rangedSkill = rangedItem?.weapon.skill
  const ranged = rangedItem ? rangedPlan(rangedItem, 5 * PLAYER_LEVEL + (rangedSkill ? (weaponSkill[rangedSkill] ?? 0) : 0), c.ranged, -1) : null
  if (ranged) ranged.source = sourceIndex('autoShot', 'Auto Shot', 'ability_whirlwind')
  // The class's pet, with the buffs that reach it, its rows named for it and its abilities' auras.
  const pet = classRot.pet ? petPlan(classRot.pet, petBuffs, profile, fight.bossLevel, sources, auraIndex) : undefined

  // --- Fight ------------------------------------------------------------------------------------
  const schools = schoolPlan(c.schools, block.spellPen, fight.bossLevel, profile)
  const front = fight.position === 'front'
  const targetArmor = fight.bossArmor - c.targetArmor
  const bossSwingBase = fight.boss.swingSpeedSec
  // docs/mechanics/encounter.md#5-boss-melee-tank-modeling: AP changes damage by AP / 14 × swing speed
  const bossApDamage = (c.bossAp / 14) * bossSwingBase
  const plan: Plan = {
    spec: config.spec,
    classId,
    role: meta.role,
    headline: tank ? 'tps' : 'dps',
    profile,
    applyUnmeasured,
    seed: config.run.seed >>> 0,
    playerLevel: PLAYER_LEVEL,
    stance: setup.stance ? STANCE[setup.stance] : STANCE_ANY,
    stances,
    stanceSwap: { cooldownMs: STANCE_SWAP_COOLDOWN_MS, keepTenths: stanceSwapKeepTenths(setup.talents, profile) },
    fight: {
      durationMs: Math.round(fight.durationSec * 1000),
      variation: fight.durationVariationPct / 100,
      executePct: fight.executePct,
      targetLevel: fight.bossLevel,
      front,
      bossCanDodge: fight.boss.canDodge,
      bossCanParry: fight.boss.canParry,
      bossCanBlock: fight.boss.canBlock,
      targetArmor,
      bossSwing: tank
        ? {
            // docs/mechanics/damage-and-timing.md#32-attack-speed-debuffs-on-the-boss-tank-modeling: base × (1 + slow)
            speedSec: slowedSwingSec(bossSwingBase, c.bossSlowPct / 100),
            unslowedSec: bossSwingBase,
            slow: c.bossSlowPct / 100,
            minDamage: Math.max(0, fight.boss.damageMin + bossApDamage),
            maxDamage: Math.max(0, fight.boss.damageMax + bossApDamage),
            canCrush: fight.boss.canCrush,
            parryHaste: fight.boss.parryHaste,
            // docs/mechanics/combat-tables.md#8-boss--player-tanks: a tank faces the boss it tanks.
            front: true,
          }
        : null,
      // A DPS paladin or rogue has nothing that reacts to a hit (no rage, no on-hit procs), so the
      // Fight tab leaves "Damage you take" out and a saved value goes unused (docs/ux.md "Fight").
      damageTakenPerHit:
        !tank && usesRage && fight.damageTakenPerSec > 0 ? (fight.damageTakenPerSec * DPS_DAMAGE_INTERVAL_MS) / 1000 : 0,
      damageTakenIntervalMs: DPS_DAMAGE_INTERVAL_MS,
      ...(abilities.some((a) => a.bleedingTargetPct) ? { othersBleed } : {}),
    },
    stats: block,
    // A caster casts and never swings its weapon, whose stats still count (above; docs/classes/mage.md#what-the-sim-needs).
    weapons: [weapons[0]?.plan ?? null, weapons[1]?.plan ?? null],
    hasShield,
    damageMult: c.damageMult,
    physicalMult: c.physicalMult,
    damageTakenMult: c.damageTakenMult,
    threatMult: c.threatMult,
    armor: derived.armor,
    rage: {
      // docs/mechanics/rage.md#rage-pool-cap-and-decay: 100 + Boundless Rage, × Gnome +5% [?] (warrior Q17)
      maxTenths: usesRage ? Math.round((BASE_MAX_RAGE + c.maxRageFlat) * c.maxRageMult * 10) : 0,
      // docs/mechanics/rage.md#rage-from-damage-taken; a legacy id maps to its new name
      damageTakenModel: currentDamageTakenRageModel(config.rules.damageTakenRage) ?? profile.rage.damageTaken,
      maxHealth: derived.health,
      // rage.md#rage-from-damage-taken, #bear-druid-rage: rage users only (`rageFromHits`).
      fromDamageTaken: hitsGiveRage,
    },
    periodicRage,
    auras,
    procs,
    triggers,
    sources,
    abilities,
    rotation: neverUsable.size > 0 ? classRot.rotation.filter((e) => !neverUsable.has(e.ability)) : classRot.rotation,
    prepull: classRot.prepull,
    ...(forms && setup.form ? druidPlan(forms, setup.form, setup.talents, derived, auras, block.mp5) : {}),
    ...(spells.length > 0 ? { spells } : {}),
    // docs/classes/paladin.md#mana-model: its mana, from the sheet's maximum and Spirit.
    ...(classId === 'paladin' ? { mana: paladinManaPlan(derived, block.mp5, setup.talents) } : {}),
    // paladin.md#protection-tree: Swift Judgement's free next Judgement is the free-cast aura.
    ...(classId === 'paladin' ? swiftJudgementPlan(auras) : {}),
    // docs/classes/shaman.md#mana: the same model, with Improved Stormstrike's regeneration while casting.
    ...(classId === 'shaman' ? shamanPlan(derived, block.mp5, setup.talents, auras) : {}),
    // docs/classes/rogue.md §2.1: its Energy, with Vigor's cap.
    ...(classId === 'rogue' ? { energy: rogueEnergy(setup.talents) } : {}),
    // docs/classes/mage.md#mana: the same model, with Mage Armor's and Arcane Meditation's regeneration while casting, and Clearcasting's free cast.
    ...(classId === 'mage' ? { mana: mageManaPlan(derived, block.mp5, setup.talents, profile), ...mageFreeCast(auras) } : {}),
    // docs/classes/warlock.md §5: the same mana model, with the warlock's Spirit regeneration.
    ...(classId === 'warlock' ? { mana: warlockManaPlan(derived, block.mp5) } : {}),
    // docs/classes/priest.md#5-mana: the same model, with Meditation's share while casting; Inner
    // Focus is the free-cast aura (#35-inner-focus-14751).
    ...(classId === 'priest' ? { mana: priestManaPlan(derived, block.mp5, setup.talents), ...priestPlan(auras) } : {}),
    // docs/classes/hunter.md#5-mana: the same model, with the hunter's Spirit regeneration and Bestial Discipline.
    ...(classId === 'hunter' ? { mana: hunterManaPlan(derived, block.mp5, setup.talents) } : {}),
    ...(c.holyThreatMult !== 1 ? { holyThreatMult: c.holyThreatMult } : {}),
    ...(c.holyTaken ? { holyTaken: c.holyTaken } : {}),
    // docs/mechanics/spells.md §3, §9: the schools' numbers, when any isn't plain.
    ...(schools ? { schools } : {}),
    // docs/classes/mage.md#ignite: the rolling Ignite, when a proc feeds it.
    ...(rolling.ignite && procs.some((p) => p.action === ACTION.ignite) ? { ignite: rolling.ignite } : {}),
    // docs/mechanics/ranged-and-pets.md: the ranged weapon and the pet, when the spec has them.
    ...(ranged ? { ranged } : {}),
    ...(pet ? { pet } : {}),
  }

  // --- Assumptions ---------------------------------------------------------------------------------
  if (setup.simulated && abilities.length === 0) notes.add('whiteSwingsOnly')
  // docs/mechanics/damage-and-timing.md#36-server-tick-and-spell-batching: the rotation reacts in 0 ms [?].
  // A cat's rotation waits on Energy and Clearcasting, and its GCD is 1 s (druid.md §2.4, §2.6); a
  // paladin's on mana.
  const energy = abilities.some((a) => a.resource === 'energy')
  if (classRot.rotation.length > 0)
    notes.add(
      classId === 'rogue'
        ? 'reactionTimeRogue'
        : energy
          ? 'reactionTimeEnergy'
          : classId === 'paladin' || classId === 'priest' || classId === 'hunter' || (classId === 'shaman' && !melee)
            ? 'reactionTimeMana'
            : classId === 'shaman'
              ? 'reactionTimeShaman'
              : classId === 'mage'
                ? 'reactionTimeMage'
                : classId === 'warlock'
                  ? 'reactionTimeWarlock'
                  : meta.caster
                    ? 'reactionTimeMage'
                    : 'reactionTime',
    )
  if (abilities.some((a) => a.gcdMs > 0)) notes.add(setup.form === 'cat' ? 'gcdHasteCat' : classId === 'rogue' ? 'gcdHasteRogue' : 'gcdHaste')
  // Rage refunds; a druid's Energy refunds are in `energyTicks`, and a bear's rage refunds and
  // Maul's swing in `bearRage` (druid.md §4.1).
  if (abilities.some((a) => a.costTenths > 0 && (a.resource ?? 'rage') === 'rage')) {
    const uses = (id: string) => abilities.some((a) => a.id === id)
    if (setup.form === 'bear') notes.addText('bearRage', BEAR_TEXT.rage({ maul: uses('maul'), swipe: uses('swipe'), normalizedRage: profile.rage.white === 'normalized' }))
    else notes.add('abilityRefunds')
  }
  const queues = abilities.some((a) => a.kind === 'onNextSwing')
  if (queues && mh && setup.form !== 'bear') notes.add('onNextSwingRage')
  // What the rotation's settings rest on without an ability that shows it (Arms' Heroic Strike off):
  // a warrior's rest on its swings, so only with a main hand. A paladin's rotation acts without one
  // too (Consecration, the mana potion), so its assumptions stand either way (knownFightEnd).
  if (mh || usesMana) for (const { id, detail } of classRot.assumes ?? []) notes.add(id, detail)
  if (queues && weapons[HAND.off]) notes.add('onNextSwingOffHand')
  if (setup.talents.has('Unbridled Wrath') && mh) notes.add('unbridledWrathSwings')
  // The rogue's off-hand strike (Mutilate) has its own note (rogueAssumptions, `mutilate`).
  if (classId !== 'rogue' && abilities.some((a) => a.offHandSource >= 0)) notes.add('ragingBlows')
  // A caster's spells need no weapon (docs/classes/mage.md, warlock.md, priest.md; the Balance druid's, druid.md §11.1), and it swings none: no note.
  // Nor a ranged spec's shots, which need its ranged weapon (docs/classes/hunter.md#9-implementation-notes).
  if (!mh && !meta.caster && !meta.ranged) {
    // warrior.md §7 "Without a main-hand weapon": the attacks that need none are still used: the
    // spell-table ones, and with a shield the ones that need it instead, which roll the main hand's
    // special-attack table at the base skill. Without a shield, nothing that needs one is named.
    const shieldAttacks = hasShield ? abilities.filter((a) => a.shieldOnly === true && a.kind !== 'cast') : []
    const weaponless = abilities.filter((a) => a.kind === 'spellTable' || shieldAttacks.includes(a))
    // A paladin's spells need no weapon either: its note says what's left out (seal procs, Holy Strike).
    notes.add(classId === 'paladin' ? 'noWeaponSpells' : classId === 'shaman' ? 'noWeaponShaman' : weaponless.length > 0 ? 'noWeaponSomeUsed' : 'noWeapon')
    if (weaponless.length > 0) {
      const names = (list: readonly { name: string }[]) =>
        list.length > 1 ? `${list.slice(0, -1).map((a) => a.name).join(', ')} and ${list.at(-1)!.name}` : list[0].name
      const table = shieldAttacks.length > 0 ? `. ${names(shieldAttacks)} ${shieldAttacks.length > 1 ? 'roll' : 'rolls'} on a special-attack table at your level’s base weapon skill` : ''
      notes.add('weaponlessAttacks', `${weaponless.length > 1 ? 'they need' : 'it needs'} no weapon: ${names(weaponless)}${table}`)
    }
  }
  // Thunder Clap and Demoralizing Shout roll the spell table (warrior.md §7 "Spell-table abilities", Q33).
  const spellTableRows = abilities.filter((a) => a.kind === 'spellTable')
  if (spellTableRows.length > 0) notes.add('spellTable', `${spellTableRows.map((a) => a.name).join(' and ')} ${spellTableRows.length > 1 ? 'roll' : 'rolls'}`)
  // Only the ones that deal damage can crit (Thunder Clap; Demoralizing Shout deals none, §7).
  const spellTableCrits = spellTableRows.filter((a) => a.flatDamage > 0 || a.weaponPercent > 0 || a.apCoefficient > 0)
  if (spellTableCrits.length > 0) notes.add('spellTableCrit', `${spellTableCrits.map((a) => a.name).join(' and ')} ${spellTableCrits.length > 1 ? 'crit' : 'crits'}`)
  if (profile.id === 'forever') {
    if (melee) notes.add('foreverHitTable')
    if (front && fight.boss.canParry) notes.add('foreverBossParry')
    if (mh && melee) notes.add('foreverGlancing')
  }
  if (fight.bossLevel - PLAYER_LEVEL >= 3 && mh && melee) notes.add('critSuppression')
  const gearRatings = [...equipped.values()].some((i) =>
    ['hitRating', 'critRating', 'dodgeRating', 'parryRating', 'blockRating', 'defenseRating'].some(
      (k) => (i.stats as Record<string, number | undefined>)[k],
    ),
  )
  if (gearRatings) notes.add('ratingsInCombat')
  if (derived.expertise > 0 && block.expertiseRating > 0) notes.add('expertise')
  if (derived.hasteRatingPct > 0) notes.add('hasteRating')
  if (derived.armorPen > 0) notes.add('armorPen')
  // docs/mechanics/damage-and-timing.md#11-formula: below −K/2 the engine holds armor at the floor [?].
  // A debuff the rotation keeps up (the cat's Faerie Fire, druid.md §3.8) is an aura in the fight,
  // not in the static armor, so it's taken off here too: it's up for all but the first moments.
  const maintainedArmor = auras.reduce((n, a) => n + (a.targetArmor ?? 0), 0)
  const effectiveArmor = targetArmor - maintainedArmor - derived.armorPen
  const armorFloor = negativeArmorFloor(PLAYER_LEVEL)
  if (profile.armor.allowNegative && effectiveArmor < 0) {
    const armorText = (a: number) => `−${Math.round(-a).toLocaleString('en-US')}`
    notes.add(
      'negativeArmor',
      effectiveArmor < armorFloor
        ? `below ${armorText(armorFloor)} (here ${armorText(effectiveArmor)}) the sim holds it at ${armorText(armorFloor)}, which doubles your physical damage`
        : undefined,
    )
  }
  if (weapons[HAND.off]) notes.add('offHandFirstSwing')
  if (melee && auras.some((a) => a.haste)) notes.add('hasteNextSwing')
  // White rage matters where hits give rage (`rageFromHits`): a warrior, or a druid that can be in
  // Bear Form; a cat's pool is Energy (druid.md §2.4).
  if (setup.simulated && profile.rage.white === 'normalized' && hitsGiveRage) {
    if (forms) notes.add('bearWhiteRage')
    else notes.add('foreverWhiteRage')
    if (weapons[HAND.off]) notes.add('foreverOffHandRage')
  }
  // docs/mechanics/rage.md#forever-: the damage-taken model, when you take damage. `classic` is [C].
  const takenModel = plan.rage.damageTakenModel
  const takesDamage = tank || plan.fight.damageTakenPerHit > 0
  if (takesDamage && plan.rage.fromDamageTaken) {
    if (takenModel === 'forever') notes.add('damageTakenRage')
    if (takenModel === 'foreverFlat') notes.add('damageTakenRageFlat')
    if (takenModel === 'foreverHealthLost') notes.add('damageTakenRageHealthLost')
  }
  // Decision D24: the Classic-based placeholders in this setup's numbers (character-stats OQ-2,
  // OQ-3, OQ-5). Avoidance matters only when the boss attacks you.
  const standIns: string[] = []
  if (placeholders.includes('base attributes')) {
    // The druid's Skyborne rows are the class row: Skyborne's race offsets are unknown (OQ-1).
    const neutral = config.race.includes('skyborne') ? ', the class row with no race adjustment, as Skyborne’s is unknown' : ''
    standIns.push(`base attributes Str ${block.baseStr}, Agi ${block.baseAgi}, Sta ${block.baseSta}, Int ${block.baseInt}, Spi ${block.baseSpi}${neutral}`)
  }
  if (placeholders.includes('base attack power')) standIns.push(`base attack power ${signed(block.baseAp)} before Strength`)
  if (placeholders.includes('base health')) {
    // The `forever` and `foreverHealthLost` models divide by max health.
    const dividesByHealth = takesDamage && plan.rage.fromDamageTaken && (takenModel === 'forever' || takenModel === 'foreverHealthLost')
    standIns.push(`base health ${block.baseHealth.toLocaleString('en-US')}${dividesByHealth ? ', which rage from damage taken divides by' : ''}`)
  }
  // Avoidance: a tank's only (the sheet's placeholders above).
  if (placeholders.includes('base dodge')) standIns.push(`base dodge ${block.baseDodge}% before Agility`)
  if (placeholders.includes('base parry')) standIns.push(`base parry ${block.baseParry}%`)
  if (placeholders.includes('base block')) standIns.push(`base block ${block.baseBlock}%`)
  if (placeholders.includes('base crit')) standIns.push(`base melee crit ${block.baseCrit}%`)
  if (placeholders.includes('base spell crit')) standIns.push(`base spell crit ${block.baseSpellCrit}%`)
  // docs/mechanics/ranged-and-pets.md OQ-1: the hunter's base ranged attack power.
  if (placeholders.includes('base ranged attack power')) standIns.push(`base ranged attack power ${block.baseRap} before Agility`)
  if (standIns.length > 0) notes.add('baseStatPlaceholders', standIns.join('; '))
  // A weapon racial with one matching weapon and one other: all attacks get it, as its tooltip reads;
  // Weaponmaster's axe or polearm with another weapon: only that weapon's attacks, as its tooltip
  // reads. Both are [?] (warrior.md §2.7, §2.9, Q15).
  const racialWeapons: Partial<Record<string, WeaponType>> = { 'alliance-human': 'sword', 'horde-orc': 'axe', 'alliance-dwarf': 'mace' }
  const mixed = (types: readonly WeaponType[]) => weapons.some((w) => w && types.includes(w.type)) && weapons.some((w) => w && !types.includes(w.type))
  const racialWeapon = racialWeapons[config.race]
  if ((racialWeapon && mixed([racialWeapon])) || (setup.talents.has('Weaponmaster') && mixed(['axe', 'polearm']))) notes.add('racialWeaponCrit')
  if (config.race === 'alliance-gnome' && c.maxRageFlat > 0) notes.add('gnomeRage')
  // A racial cooldown no rotation presses yet (Eureka!, warrior.md §7); specs without a rotation have `whiteSwingsOnly`.
  if (setup.simulated && COOLDOWN_RACIALS[config.race]?.simulated === false) notes.add('cooldownRacial')
  if (config.race === 'horde-undead') notes.add('touchOfTheGrave')
  if (classicItems.length) notes.add('classicItems', classicItems.join(', '))
  // docs/mechanics/ranged-and-pets.md §1: ammo the ranged weapon doesn't fire (arrows in a gun) adds nothing.
  if (meta.ranged && ammoItem && !ammoFired) notes.add('ammoNotFired', ammoItem.name)
  if (unmodelled.length) notes.add('unmodelledProcs', unmodelled.join(', '))
  if (unmodelledSetBonuses.length) notes.add('unmodelledSetBonuses', unmodelledSetBonuses.join(', '))
  const procIds = new Set(procs.map((p) => p.id))
  // PPM rates are server-side (damage-and-timing §5.1); Hand of Justice's and Ironfoe's flat chances are client data (§5.2).
  if (['crusader', 'fieryWeapon', 'flurryAxe'].some((id) => procIds.has(id))) notes.add('procRates')
  // Ironfoe's Forever chance is a reading of its equip aura, and its hands Classic Era's [?] (damage-and-timing §5.2, OQ 15).
  if (procIds.has('ironfoe') && 'pct' in profile.values.ironfoe.chance) notes.add('ironfoeChance')
  if (chainBits.size > 0) notes.add('extraAttackChains')
  if (procs.some((p) => p.id === 'windfury' && p.icdMs > 0)) notes.add('windfuryIcd')
  if (procIds.has('windfury') && weapons[HAND.main] && c.tempEnchants.length && !windfuryHoldsMainHand) notes.add(mainHandPoison ? 'windfuryPoison' : 'windfuryStone')
  // buffs doc §3.6: two stones stack, and one on either hand counts for both [?].
  if (elementalStones > 1 || (elementalStones === 1 && weapons[HAND.off])) notes.add('elementalStone')
  if (procIds.has('deepWounds')) notes.add('deepWounds')
  // buffs doc §1.2 (BR5): Thorns on the tank.
  if (procIds.has('thorns')) notes.add('thorns')
  if (setup.talents.has('Anger Management')) notes.add('angerManagement')
  if (weapons.some((w) => w && w.plan.armorPenPct > 0)) notes.add(classId === 'rogue' ? 'rogueArmorPen' : 'weaponmasterMace')
  // threat.md#warrior: in `forever` Sunder Armor's threat is the Forever client's, the rest Classic
  // Era's; in `classicEra` all are Classic Era's, Sunder's 261 too.
  // A paladin tank's note speaks paladin: mana and Righteous Fury, not rage and stances.
  if (tank && classId === 'paladin') notes.add('whiteThreatPaladin')
  else if (tank) {
    const sunder = abilities.find((a) => a.id === 'sunderArmor')
    notes.add(
      'whiteThreat',
      sunder && profile.id === 'forever'
        ? `Sunder Armor makes ${sunder.threatBonus.toLocaleString('en-US')} threat, the Forever client’s value, in place of Classic Era’s 261; the other abilities make Classic Era’s`
        : undefined,
    )
  }
  if (setup.stance === 'defensive' && setup.talents.has('Defiance') && hasShield) notes.add('defiance')
  if (tank) notes.add('bossMelee')
  if (front) notes.add('bossFlags')
  // docs/data/items.md#stats-armor-and-block-value: a Classic Era shield's own block value, or none.
  if (hasShield && tank) {
    if (fallbackShieldBlockValue > 0) notes.add('classicShieldBlockValue', `${ohItem!.name}, ${fallbackShieldBlockValue} block value`)
    else notes.add('shieldBlockValue')
  }
  if (tank && hasDebuffs.slow) notes.add('bossSlow')
  if (tank && hasDebuffs.boss) notes.add('bossApDebuff')
  if (plan.fight.damageTakenPerHit > 0) notes.add('dpsDamageTaken')
  if (procs.some((p) => p.id === 'enrage') && (tank || plan.fight.damageTakenPerHit > 0)) notes.add('enrageTrigger')
  // rage.md: Berserker Rage's damage-taken rage multiplier is ×1.0 [?] (warrior Q20).
  if (abilities.some((a) => a.id === 'berserkerRage') && (tank || plan.fight.damageTakenPerHit > 0)) notes.add('berserkerRageTaken')
  // On-use items and consumables no rotation presses (bombs, Counterattack Lodestone, …; warrior.md §7).
  const pressed = new Set(classRot.onUse)
  const notPressed = [
    ...c.onUse.filter((u) => !pressed.has(u.id)).map((u) => u.name),
    ...itemUses.filter((u) => !pressed.has(u.id)).map((u) => u.name),
    ...onUseItems,
  ]
  if (setup.simulated && notPressed.length) notes.add('onUseConsumables', notPressed.join(', '))
  if (abilities.some((a) => a.id === 'weaknessAnalyzer')) notes.add(classId === 'paladin' ? 'weaknessAnalyzerPaladin' : 'weaknessAnalyzer')
  // warrior.md §2.8: the reactive windows this rotation waits for, Q10 and Q12.
  const windows = new Set(abilities.filter((a) => a.window >= 0).map((a) => auras[a.window].id))
  if (windows.has('overpowerWindow')) notes.add('overpowerWindow')
  if (windows.has('revengeWindow')) notes.add('revengeWindow')
  if (procIds.has('bloodthrill')) notes.add('bloodthrill')
  // warrior.md §7 and Q3, Q13, Q32: Slam's cast, Spearing Strike's weapon share, Rend's tick crits and on-hit procs.
  // A paladin's cast (Hammer of Wrath) has its own note (paladinAssumptions), as the shaman's Lightning
  // Bolt does (`lightningBoltCast`, shaman.md).
  if (classId === 'warrior' && abilities.some((a) => a.castMs > 0)) notes.add('slamCast')
  if (abilities.some((a) => a.twoHandOnly) && weapons[HAND.main]?.plan.twoHand) notes.add('spearingStrike')
  // A warrior's Rend (a rage bleed); a druid's bleeds are in `catBleeds`.
  const bleeds = abilities.filter((a) => a.kind === 'bleed' && (a.resource ?? 'rage') === 'rage')
  if (bleeds.some((a) => a.periodicCanCrit) && profile.combat.periodicCrits) notes.add('rendTickCrits')
  if (bleeds.length > 0 && mh) notes.add('rendOnHit')
  // warrior.md §7 and Q28, Q29: Execute's rage tenths, and Improved Bloodrage 1/2's rounding.
  if (mh && fight.executePct > 0 && abilities.some((a) => a.damagePerExtraRage > 0 && (a.resource ?? 'rage') === 'rage')) notes.add('executeRageTenths')
  if (setup.talents.get('Improved Bloodrage') === 1 && abilities.some((a) => a.id === 'bloodrage')) notes.add('improvedBloodrageRounding')
  if (c.zoneGatedUnmet) notes.add('hyjalFlask')
  // docs/classes/druid.md §2, §8 "Uncertainty surfacing": the druid's [?] that this setup relies on
  // (its base values are D24 placeholders, in `baseStatPlaceholders` above).
  if (classId === 'druid') {
    // Each form's own figures (druid.md §2.1, §2.7); the cat also says why it never powershifts (§2.8).
    if (setup.form === 'cat') notes.add('formWeaponCat')
    if (setup.form === 'bear') notes.add('formWeapon')
    if (procIds.has('omenOfClarity')) notes.add(setup.form === 'cat' ? 'omenOfClarityCat' : 'omenOfClarity')
    if (setup.form === 'cat' && setup.simulated) notes.add('noPowershift')
    if (abilities.some((a) => a.resource === 'energy')) notes.add('energyTicks')
    if (abilities.some((a) => a.kind === 'shift')) notes.add('shapeshifts')
    // druid.md §3, §4, §8 "Uncertainty surfacing": the cat's and the bear's abilities. The bear's
    // texts name only what this setup uses, with the profile's numbers (BEAR_TEXT); the cat's are
    // the registry's.
    const has = (id: string) => abilities.some((a) => a.id === id)
    const bear = setup.form === 'bear'
    const uses = { maul: has('maul'), swipe: has('swipe'), mangle: has('mangle'), lacerate: has('lacerate'), faerieFire: has('faerieFire'), roar: has('demoralizingRoar') }
    if (bear && Object.values(uses).some(Boolean)) notes.addText('bearThreat', BEAR_TEXT.threat(uses))
    if (bear && uses.lacerate) notes.add('lacerate')
    if (has('shred') || has('claw')) notes.add('catShredFlat')
    if (has('rip') || has('ferociousBite')) notes.add('catFinisherAp')
    if (has('rip') || has('rake')) notes.add('catBleeds')
    if (has('rake') || has('ferociousBite')) notes.add('catTwoRolls')
    if (setup.talents.has('Predatory Instincts') && abilities.some((a) => a.critMultiplier > CRIT_MULTIPLIER.melee)) {
      if (bear) notes.addText('predatoryInstincts', BEAR_TEXT.predatoryInstincts(uses.lacerate))
      else notes.add('predatoryInstincts')
    }
    const rendAndTear = abilities.find((a) => a.bleedingTargetPct)?.bleedingTargetPct
    if (rendAndTear && bear) notes.addText('rendAndTear', BEAR_TEXT.rendAndTear({ pct: rendAndTear, othersBleed, lacerate: uses.lacerate }))
    else if (rendAndTear) notes.add('rendAndTear')
    if (setup.form === 'cat' && has('berserk') && setup.talents.has('Primal Fury')) notes.add('berserkCrits')
    if ((setup.form === 'cat' || bear) && (auras.some((a) => a.haste) || derived.hasteMult > 1)) notes.add('formHaste')
    if (bear) {
      if (uses.swipe) notes.add('bearTwoRolls')
      if (uses.roar || uses.faerieFire) {
        // combat-tables §9: a binary Nature spell's resist at the boss's level-based resistance, in %.
        const resist = abilities.some((a) => a.kind === 'spellTable' && a.spellSchool !== undefined) ? Math.round(100 * averageResist(levelResistance(fight.bossLevel, PLAYER_LEVEL), PLAYER_LEVEL)) : 0
        notes.addText(
          'demoralizingRoar',
          BEAR_TEXT.spells({ roar: uses.roar, faerieFire: uses.faerieFire, roarAp: profile.values.demoralizingRoarAp, classicEra: profile.id === 'classicEra', resistPct: resist }),
        )
      }
      if (abilities.some((a) => (a.noCooldownAura ?? -1) >= 0)) notes.addText('berserkMangle', BEAR_TEXT.berserkMangle(uses.swipe))
      if (auras.some((a) => a.itemArmorPct)) notes.add('enrageArmor')
    }
    if (setup.form === 'bear' && profile.catalogue.column === 'forever') notes.add('bearArmor')
    // druid.md §4.7 (Q19): Thick Hide's base armor under the form's multiplier.
    if (setup.form === 'bear' && setup.talents.has('Thick Hide')) notes.add('thickHide')
    // druid.md §4.1 (Q37): the idol's Mangle, while the rotation uses Mangle.
    if (bear && uses.mangle && Object.values(config.gear).some((e) => e?.itemId === IDOL_OF_BRUTALITY)) notes.add('idolOfBrutality')
  }
  // docs/classes/paladin.md#open-questions: what the paladin's seals, judgements and mana rely on.
  for (const id of paladinAssumptions(plan)) notes.add(id)
  for (const id of protectionAssumptions(plan)) notes.add(id)
  // docs/classes/shaman.md#open-questions: what the shaman's procs, spells and mana rely on.
  for (const id of shamanAssumptions(plan)) notes.add(id)
  // docs/classes/rogue.md#9-open-questions: what the rogue's Energy, abilities and poisons rely on.
  for (const id of rogueAssumptions(plan, setup.talents)) notes.add(id)
  // docs/classes/mage.md#open-questions: what the mage's spells, procs and mana rely on.
  for (const id of mageAssumptions(plan)) notes.add(id)
  // docs/classes/warlock.md §9: what the warlock's spells, mana and talents rely on.
  for (const { id, detail } of warlockAssumptions(plan)) notes.add(id, detail)
  // docs/classes/priest.md#9-open-questions: what the priest's spells, talents and mana rely on.
  for (const id of priestAssumptions(plan, setup.talents)) notes.add(id)
  // docs/classes/druid.md §11.8: what the Balance druid's spells, procs and mana rely on.
  for (const id of balanceAssumptions(plan)) notes.add(id)
  // docs/classes/hunter.md#11-open-questions: what the hunter's shots, pet, talents and mana rely on.
  for (const id of hunterAssumptions(plan, setup.talents)) notes.add(id)
  // docs/mechanics/ranged-and-pets.md §6.1: what every pet inherits, worded for this one.
  if (plan.pet) notes.add('petInheritance', petInheritanceDetail(plan.pet, plan.ranged !== undefined))

  return { plan, sheet, assumptions: notes.toArray(), blockers }
}

function applyEffect(c: Collected, e: Effect, origin: 0 | 1 | null, weapons: [Weapon | null, Weapon | null]): void {
  const b = c.block
  const matching = (types: WeaponType[] | undefined) =>
    weapons.filter((w): w is Weapon => w !== null && (!types || types.includes(w.type)))
  switch (e.kind) {
    case 'stat':
      b[e.stat] += e.value
      return
    case 'mult': {
      const m = 1 + e.pct / 100
      if (e.stat === 'allStats') {
        b.strMult *= m
        b.agiMult *= m
        b.staMult *= m
        b.intMult *= m
        b.spiMult *= m
      } else if (e.stat === 'ap') b.apMult *= m
      else if (e.stat === 'health') b.healthMult *= m
      else if (e.stat === 'blockValue') b.blockValueMult *= m
      else if (e.stat === 'mana') b.manaMult *= m
      else if (e.stat === 'rap') b.rapMult *= m
      else b[ATTRIBUTE_MULT[e.stat]] *= m
      return
    }
    case 'itemArmorPct':
      b.itemArmorPct += e.pct / 100
      return
    case 'bonusArmorPct':
      b.bonusArmorPct += e.pct / 100
      return
    case 'haste':
      b.haste *= 1 + e.pct / 100
      return
    case 'damage':
      if (e.physicalOnly) c.physicalMult *= 1 + e.pct / 100
      else c.damageMult *= 1 + e.pct / 100
      return
    case 'damageTaken':
      c.damageTakenMult *= 1 + e.pct / 100
      return
    case 'threat':
      if (e.holyOnly) c.holyThreatMult *= 1 + e.pct / 100
      else c.threatMult *= 1 + e.pct / 100
      return
    case 'maxRage':
      c.maxRageFlat += e.value
      return
    case 'maxRagePct':
      c.maxRageMult *= 1 + e.pct / 100
      return
    case 'weaponDamage':
      for (const w of matching(e.weapons)) if (origin === null || w.hand === origin) w.plan.flatDamage += e.value
      return
    case 'weaponCrit':
      for (const w of matching(e.weapons)) w.plan.critBonus += e.value
      return
    case 'weaponArmorPenPct':
      for (const w of matching(e.weapons)) w.plan.armorPenPct += e.pct / 100
      return
    case 'offHand':
      c.offHand.damagePct += e.damagePct ?? 0
      c.offHand.hit += e.hit ?? 0
      c.offHand.ragePct += e.ragePct ?? 0
      return
    case 'tempEnchant':
      c.tempEnchants.push(e)
      return
    case 'poisonChance':
      c.poisonChancePct += e.pct
      return
    case 'poisonDamage':
      c.poisonDamagePct += e.pct
      return
    case 'targetArmor':
      c.targetArmor += e.value
      return
    case 'holyTaken':
      c.holyTaken += e.value
      return
    case 'bossAp':
      c.bossAp += e.value
      return
    case 'bossSlow':
      c.bossSlowPct = Math.max(c.bossSlowPct, e.pct)
      return
    case 'proc':
      c.procs.push({ spec: e.proc, origin })
      return
    case 'periodicRage':
      c.periodicRage.push(e)
      return
    case 'onUse':
      c.onUse.push({ id: e.id, name: e.name, use: e.use })
      return
    // The caster core (docs/mechanics/spells.md §3, §4, §5, §9).
    case 'schoolDamage':
      for (const school of e.schools) c.schools.damage[SCHOOL[school]] *= 1 + e.pct / 100
      return
    case 'schoolTaken':
      for (const school of e.schools) c.schools.taken[SCHOOL[school]] *= 1 + e.pct / 100
      return
    case 'schoolCrit':
      for (const school of e.schools) c.schools.crit[SCHOOL[school]] += e.pct
      return
    case 'targetResistance':
      for (const school of e.schools) c.schools.resistance[SCHOOL[school]] += e.value
      return
    case 'schoolHit':
      for (const school of e.schools) c.schools.hit[SCHOOL[school]] += e.pct
      return
    case 'castHaste':
      b.castHaste *= 1 + e.pct / 100
      return
    // docs/mechanics/ranged-and-pets.md §2–§4: the ranged weapon's mods.
    case 'ranged': {
      const r = c.ranged
      r.hit += e.hit ?? 0
      r.crit += e.crit ?? 0
      r.damageMult *= 1 + (e.damagePct ?? 0) / 100
      r.hasteMult *= 1 + (e.hastePct ?? 0) / 100
      r.flatDamage += e.flatDamage ?? 0
      r.ammoDps += e.ammoDps ?? 0
      r.critDamagePct += e.critDamagePct ?? 0
      return
    }
  }
}

/**
 * A caster's spell block on the character sheet (docs/mechanics/spells.md §3–§5; docs/ux.md#results):
 * spell damage by school, crit, hit, mana per 5 s, casting speed and spell penetration.
 */
/**
 * A caster's spell stats for the sheet (docs/mechanics/spells.md §3–§5): spell damage, crit and hit
 * per school, each the all-schools figure plus the school's own static lines (`schools`: a talent's
 * Critical Mass on Fire crit, Elemental Precision on Fire and Frost hit), as the engine starts the
 * fight with them. A spell's own crit (Incinerate's) and an aura's are the spell's and the fight's.
 */
export function casterSheet(d: DerivedStats, block: StatBlock, schools?: Pick<Collected['schools'], 'crit' | 'hit'>): NonNullable<CharacterSheet['spell']> {
  const perSchool = (all: number, extra?: number[]) =>
    Object.fromEntries(CASTER_SHEET_SCHOOLS.map((k) => [k, all + (extra?.[SCHOOL[k]] ?? 0)])) as Record<(typeof CASTER_SHEET_SCHOOLS)[number], number>
  return {
    holyDamage: d.holySpellDamage,
    critPct: d.spellCrit,
    hitPct: d.spellHit,
    mp5: block.mp5,
    caster: {
      schoolDamage: {
        arcane: d.arcaneSpellDamage,
        fire: d.fireSpellDamage,
        frost: d.frostSpellDamage,
        holy: d.holySpellDamage,
        nature: d.natureSpellDamage,
        shadow: d.shadowSpellDamage,
      },
      schoolCrit: perSchool(d.spellCrit, schools?.crit),
      schoolHit: perSchool(d.spellHit, schools?.hit),
      castSpeedPct: (d.castHasteMult - 1) * 100,
      spellPen: block.spellPen,
    },
  }
}

const CASTER_SHEET_SCHOOLS = ['arcane', 'fire', 'frost', 'holy', 'nature', 'shadow'] as const

/**
 * The plan's school numbers (docs/mechanics/spells.md §3, §9; plan/types.ts SchoolPlan), or none
 * when every school is plain and nothing penetrates: the boss's resistance per school is its
 * level-based resistance, plus its own (0) changed by the debuffs, never below 0, less your spell
 * penetration; below 0 only where the profile allows it. Holy and physical have none.
 */
export function schoolPlan(schools: Omit<Collected['schools'], 'hit'> & { hit?: number[] }, spellPen: number, bossLevel: number, profile: RulesProfile): SchoolPlan | undefined {
  const plain = plainSchools()
  const same = (a: number[], b: number[]) => a.every((x, i) => x === b[i])
  const hit = schools.hit ?? plain.hit
  const plainHit = same(hit, plain.hit)
  if (spellPen === 0 && same(schools.damage, plain.damage) && same(schools.taken, plain.taken) && same(schools.crit, plain.crit) && same(schools.resistance, plain.resistance) && plainHit) {
    return undefined
  }
  const level = levelResistance(bossLevel, PLAYER_LEVEL)
  const resistance = schools.resistance.map((change, k) => {
    if (k === SCHOOL.holy || k === SCHOOL.physical) return 0
    const r = level + Math.max(0, change) - spellPen
    return profile.combat.negativeResistance ? r : Math.max(0, r)
  })
  // docs/classes/mage.md#talents: a school's own spell hit (Elemental Precision's Fire and Frost), only when set.
  return { damage: [...schools.damage], taken: [...schools.taken], crit: [...schools.crit], resistance, ...(plainHit ? {} : { hit: [...hit] }) }
}

/**
 * What each warrior stance changes relative to the base stance (warrior.md §2.1, §7 "Stances"):
 * its own effects (the rule profile's: `stanceEffects`) and the talents' stance-bound ones (Defiance)
 * that hold in it, as factors on the base stance's damage, threat and damage taken and crit and
 * spell crit deltas, so the base stance's are exactly 1, 1, 1, 0 and 0 and its static numbers are
 * untouched.
 */
function stancePlans(
  base: Stance,
  own: Record<Stance, Effect[]>,
  effects: Effect[],
  holds: (when: Condition | undefined, stance: Stance) => boolean,
): StancePlan[] {
  const bound = effects.filter((e) => e.when?.stance !== undefined)
  const mods = (stance: Stance) => {
    const m = { damage: 1, threat: 1, damageTaken: 1, crit: 0, spellCrit: 0 }
    for (const e of [...own[stance], ...bound]) {
      if (!holds(e.when, stance)) continue
      if (e.kind === 'damage' && !e.physicalOnly) m.damage *= 1 + e.pct / 100
      else if (e.kind === 'threat') m.threat *= 1 + e.pct / 100
      else if (e.kind === 'damageTaken') m.damageTaken *= 1 + e.pct / 100
      else if (e.kind === 'stat' && e.stat === 'crit') m.crit += e.value
      else if (e.kind === 'stat' && e.stat === 'spellCrit') m.spellCrit += e.value
      else throw new Error(`A stance effect the engine can't switch: ${e.kind}`)
    }
    return m
  }
  const b = mods(base)
  return (['battle', 'defensive', 'berserker'] as const).map((stance) => {
    const m = mods(stance)
    return {
      stance: STANCE[stance],
      damage: m.damage / b.damage,
      threat: m.threat / b.threat,
      damageTaken: m.damageTaken / b.damageTaken,
      crit: m.crit - b.crit,
      spellCrit: m.spellCrit - b.spellCrit,
    }
  })
}

/** A number with a true minus sign (−20), as the docs and assumptions write it. */
const signed = (n: number) => (n < 0 ? `−${-n}` : `${n}`)

/**
 * Whether white hits and hits taken can give the plan rage (rage.md#bear-druid-rage; druid.md §8
 * "Rage from hits"): only in a form whose power is rage. A warrior always; a druid if its fight can
 * be in Bear Form, `reachable` being the bit mask of the forms it can be in (its starting form and
 * those its shapeshifts enter); other classes never. It sets `plan.rage.fromDamageTaken`; in the
 * fight, a druid gains that rage only while in such a form (`FormPlan.rage`).
 */
export function rageFromHits(classId: ClassId, forms: readonly FormPlan[] | undefined, reachable: number): boolean {
  if (forms) return forms.some((f, i) => f.rage && (reachable & (1 << i)) !== 0)
  return classId === 'warrior'
}

/** The effect kinds a druid form can bind (druid.md §2.2): anything else can't be switched by a shapeshift. */
const FORM_EFFECT_KINDS: ReadonlySet<Effect['kind']> = new Set(['stat', 'mult', 'itemArmorPct', 'bonusArmorPct', 'threat'])

/**
 * A druid's forms, in FORM_INDEX order (druid.md §2.1, §2.2, §2.8; plan/types.ts FormPlan): each
 * the shared stat block plus its own bound effects, its main hand, and the threat multiplier in it.
 * The per-hand bonuses the effects gave the starting form's main hand (crit, hit, armor
 * penetration) go on every form's; the flat weapon damage goes only on the equipped weapon's, used
 * in caster form, since a form ignores the weapon's damage [?] (Q25). Then the plan's static block,
 * main hand and threat multiplier (`c`, `main`) become the starting form's.
 */
function druidForms(
  start: DruidForm,
  bound: Effect[],
  c: Collected,
  main: Weapon | null,
  equipped: Weapon | null,
  weaponSkill: Partial<Record<WeaponSkill, number>>,
  profile: RulesProfile,
  bossLevel: number,
): FormPlan[] {
  const shared = new StatBlock().copyFrom(c.block)
  const bonuses = main?.plan ?? null
  let caster: WeaponPlan | null = start === 'caster' ? (main?.plan ?? null) : null
  if (start !== 'caster' && equipped) {
    const skillName = equipped.item?.weapon?.skill
    const skill = 5 * PLAYER_LEVEL + (skillName ? (weaponSkill[skillName] ?? 0) : 0)
    const [glanceLow, glanceHigh] = glanceRange(profile, bossLevel, skill)
    caster = {
      ...equipped.plan,
      skill,
      glanceLow,
      glanceHigh,
      flatDamage: bonuses?.flatDamage ?? 0,
      hitBonus: bonuses?.hitBonus ?? 0,
      critBonus: bonuses?.critBonus ?? 0,
      armorPenPct: bonuses?.armorPenPct ?? 0,
    }
  }
  if (main?.form) main.plan.flatDamage = 0
  // Moonkin Form only in a plan that fights in it (docs/classes/druid.md §11.1), so a feral's forms keep theirs.
  const forms = DRUID_FORMS.filter((f) => f !== 'moonkin' || start === 'moonkin').map((f): FormPlan => {
    const fc: Collected = { ...c, block: new StatBlock().copyFrom(shared), procs: [], periodicRage: [], onUse: [], tempEnchants: [] }
    for (const e of bound) {
      if (!e.when?.form?.includes(f)) continue
      if (!FORM_EFFECT_KINDS.has(e.kind)) throw new Error(`A form effect a shapeshift can't switch: ${e.kind}`)
      applyEffect(fc, e, null, [null, null])
    }
    // A moonkin casts and never swings (§11.1).
    const mainHand = f === 'moonkin' ? null : f === start ? (main?.plan ?? null) : f === 'caster' ? caster : formWeapon(f, bonuses, profile, bossLevel)
    return { id: f, name: FORM_NAME[f], stats: fc.block, mainHand, threatMult: fc.threatMult, rage: f === 'bear' }
  })
  // The starting form's block is the plan's own (one object), so a change to `plan.stats` is its too.
  const own = forms[FORM_INDEX[start]]
  c.block.copyFrom(own.stats)
  own.stats = c.block
  c.threatMult = own.threatMult
  return forms
}

const TRIGGER_CODE: Record<ProcSpec['trigger'], number> = TRIGGER

/**
 * Resolves hands and chances for a proc; null when nothing can trigger it in this setup.
 * `rangedSpeedSec`: the ranged weapon's speed, for a PPM proc on a ranged trigger (null: none).
 * Exported for its tests.
 */
export function resolveProc(spec: ProcSpec, origin: 0 | 1 | null, weapons: [Weapon | null, Weapon | null], rangedSpeedSec: number | null): ProcPlan | null {
  const trigger = TRIGGER_CODE[spec.trigger]
  // docs/mechanics/ranged-and-pets.md §9: a ranged trigger's PPM reads the ranged weapon's speed.
  const onRanged = trigger === TRIGGER.rangedLanded || trigger === TRIGGER.autoShotLanded || trigger === TRIGGER.rangedCrit
  const onAttack =
    trigger === TRIGGER.meleeLanded ||
    trigger === TRIGGER.whiteLanded ||
    trigger === TRIGGER.swingLanded ||
    trigger === TRIGGER.meleeCrit ||
    trigger === TRIGGER.targetDodge ||
    trigger === TRIGGER.whiteResolved
  let hands = 0
  if (onAttack) {
    for (const w of weapons) {
      if (!w) continue
      if (spec.from === 'weapon' && w.hand !== origin) continue
      if (spec.from === 'mainHand' && w.hand !== HAND.main) continue
      if (spec.from === 'offHand' && w.hand !== HAND.off) continue
      if (spec.weapons && !spec.weapons.includes(w.type)) continue
      hands |= 1 << w.hand
    }
    if (hands === 0) return null
  }
  const chance: [number, number] = [0, 0]
  for (const h of [HAND.main, HAND.off] as const) {
    if ('ppm' in spec.chance) {
      const w = weapons[h]
      // docs/mechanics/damage-and-timing.md#51-ppm-formula: PPM × base weapon speed / 60; a ranged
      // trigger fires with no hand (−1), so its chance is slot 0's, from the ranged weapon.
      const speed = onRanged ? (h === HAND.main ? rangedSpeedSec : null) : w ? w.plan.speedSec : null
      chance[h] = speed !== null ? ppmChance(spec.chance.ppm, speed) : 0
    } else if ('pct' in spec.chance) {
      chance[h] = spec.chance.pct / 100
    }
  }
  return {
    id: spec.id,
    name: spec.name,
    trigger,
    chance,
    ...('ppm' in spec.chance ? { ppm: spec.chance.ppm } : {}),
    // docs/classes/druid.md §11.3: a rate per minute of casting (Omen of Clarity's spells [?]).
    ...('ppmCast' in spec.chance ? { ppmCast: spec.chance.ppmCast } : {}),
    hands,
    icdMs: spec.icdMs ?? 0,
    action: 0,
    amount: 0,
    a: 0,
    b: 0,
    school: 0,
    source: -1,
    chainBit: 0,
  }
}
