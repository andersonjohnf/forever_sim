// Config → plan (decision D15: the config is resolved once into a flat, precomputed plan).
//
// Runs on the main thread, where the datasets are loaded: it sums gear and set bonuses, applies
// enchants, buffs, racials, talents and stance as effects, resolves every condition against this
// setup, derives the character sheet, and flattens procs and auras for the engine. Workers get
// only the resulting plain object.
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData, Stats, WeaponSkill, WeaponType } from '@/data/items/types'
import { glanceRange, PLAYER_LEVEL } from '../core/attack-table'
import { negativeArmorFloor, NORMALIZED_SPEED, OFF_HAND_DAMAGE, ppmChance, slowedSwingSec, toTenths } from '../core/formulas'
import { classSetup } from '../classes'
import { classRotation, maintainedBuffs, rotationBaseStance } from '../classes/rotation'
import { STANCE_SWAP_COOLDOWN_MS, stanceSwapKeepTenths } from '../classes/warrior/abilities'
import { type Stance, stanceEffects } from '../classes/warrior/talents'
import { BUFFS_BY_ID } from '../effects/buffs'
import { ENCHANTS_BY_ID } from '../effects/enchants'
import { ITEM_EFFECTS } from '../effects/items'
import { COOLDOWN_RACIALS, racialEffects } from '../effects/racials'
import { type AuraSpec, catalogueEffects, type Condition, type Effect, type FlatStat, type OnUseSpec, type ProcSpec } from '../effects/types'
import { isTwoHand } from '../equip'
import { currentDamageTakenRageModel, PROFILES } from '../rules/profiles'
import { SPEC_META } from '../specs'
import { CLASS_BASE } from '../stats/base-stats'
import { DerivedStats, deriveStats, StatBlock } from '../stats/stat-block'
import type { CharacterSheet, GearSlot, SimConfig } from '../types'
import { Assumptions } from './assumptions'
import {
  type AbilityPlan,
  ACTION,
  type AuraPlan,
  HAND,
  NO_PREPULL,
  type Plan,
  type PlanBundle,
  type ProcPlan,
  type SourcePlan,
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
  attackPower: 'ap',
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

const ATTRIBUTE_MULT = { str: 'strMult', agi: 'agiMult', sta: 'staMult', int: 'intMult', spi: 'spiMult' } as const

const SPELL_SCHOOL = { fire: 0, frost: 1, shadow: 2, nature: 3, arcane: 4, holy: 5 } as const

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
  item: Item
  type: WeaponType
  twoHand: boolean
  plan: WeaponPlan
}

interface Collected {
  block: StatBlock
  damageMult: number
  physicalMult: number
  damageTakenMult: number
  threatMult: number
  maxRageFlat: number
  maxRageMult: number
  targetArmor: number
  bossAp: number
  bossSlowPct: number
  offHand: { damagePct: number; hit: number; ragePct: number }
  tempEnchants: Extract<Effect, { kind: 'tempEnchant' }>[]
  procs: { spec: ProcSpec; origin: 0 | 1 | null }[]
  periodicRage: Extract<Effect, { kind: 'periodicRage' }>[]
  /** Selected on-use consumables; `use` when a rotation can press it (effects/types.ts). */
  onUse: { id: string; name: string; use?: OnUseSpec }[]
  zoneGatedUnmet: boolean
}

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

  // --- Stat block: base ----------------------------------------------------------------------
  const base = CLASS_BASE[classId]
  const block = new StatBlock()
  const attributes = base.attributes(config.race)
  if (attributes) {
    block.baseStr = attributes.str
    block.baseAgi = attributes.agi
    block.baseSta = attributes.sta
    block.baseInt = attributes.int
    block.baseSpi = attributes.spi
  } else {
    unknown.push('base attributes')
    notes.add('unknownBaseAttributes')
    blockers.push(
      classId === 'warrior'
        ? 'Skyborne base stats at level 60 aren’t known yet, so a Skyborne warrior can’t be simulated. Pick another race.'
        : `${meta.className} simulation isn’t available yet.`,
    )
  }
  block.baseAp = base.baseAp
  block.baseCrit = base.baseCrit ?? 0
  if (base.baseCrit === null) unknown.push('base crit')
  block.critPerAgi = base.critPerAgi
  block.spellCritPerInt = base.spellCritPerInt
  block.baseSpellCrit = base.baseSpellCrit ?? 0
  block.baseDodge = base.baseDodge ?? 0
  if (base.baseDodge === null) unknown.push('base dodge')
  block.canParry = base.baseParry > 0 && weapons[HAND.main] !== null
  block.baseParry = base.baseParry
  block.canBlock = hasShield
  block.baseBlock = base.baseBlock
  block.baseHealth = base.baseHealth ?? 0
  if (base.baseHealth === null) unknown.push('base health')
  block.hasMana = base.baseMana !== null
  block.baseMana = base.baseMana ?? 0

  // --- Effects -------------------------------------------------------------------------------
  const setup = classSetup(classId, config.spec, config.talents, profile, rotationBaseStance(config.spec, config.rotation))
  if (!setup.simulated && attributes) blockers.push(`${meta.className} simulation isn’t available yet.`)
  const c: Collected = {
    block,
    damageMult: 1,
    physicalMult: 1,
    damageTakenMult: 1,
    threatMult: 1,
    maxRageFlat: 0,
    maxRageMult: 1,
    targetArmor: 0,
    bossAp: 0,
    bossSlowPct: 0,
    offHand: { damagePct: 0, hit: 0, ragePct: 0 },
    tempEnchants: [],
    procs: [],
    periodicRage: [],
    onUse: [],
    zoneGatedUnmet: false,
  }
  const holds = (when: Condition | undefined, stance = setup.stance): boolean => {
    if (!when) return true
    if (when.shield !== undefined && when.shield !== hasShield) return false
    if (when.twoHand !== undefined && when.twoHand !== twoHand) return false
    if (when.stance !== undefined && when.stance !== stance) return false
    if (when.creature && !when.creature.includes(fight.creatureType)) return false
    // A weapon of one of these types in either hand (warrior.md §2.7, §2.9, Q15).
    if (when.weapons && !weapons.some((w) => w !== null && when.weapons!.includes(w.type))) return false
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
  for (const [slot, item] of equipped) {
    if (slot === 'offHand' && twoHand) continue
    const origin = slot === 'mainHand' ? HAND.main : slot === 'offHand' ? HAND.off : null
    for (const [key, value] of Object.entries(item.stats) as [keyof Stats, number][]) {
      if (!value) continue
      const stat = ITEM_STAT[key]
      if (stat) block[stat] += value
      else if (key in AP_VS && AP_VS[key] === fight.creatureType) block.ap += value
      else if (key === 'weaponDamage') {
        for (const w of weapons) if (w && (origin === null || w.hand === origin)) w.plan.flatDamage += value
      }
    }
    for (const [skill, value] of Object.entries(item.weaponSkill ?? {}) as [WeaponSkill, number][]) {
      weaponSkill[skill] = (weaponSkill[skill] ?? 0) + value
    }
    const setId = setOf(item)
    if (setId) setCounts.set(setId, (setCounts.get(setId) ?? 0) + 1)
    if (!item.foreverData) classicItems.push(item.name)
    const override = ITEM_EFFECTS[item.id]
    if (override) apply(typeof override.effects === 'function' ? override.effects(profile) : override.effects, origin)
    else if (item.procs.length > 0 || item.otherEquip.length > 0 || (item.weapon?.extraDamage?.length ?? 0) > 0)
      unmodelled.push(item.name)
    if (override?.use) itemUses.push(override.use)
    else if (item.useEffects.length > 0) onUseItems.push(item.name)
  }
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
        const stat = ITEM_STAT[key]
        if (stat && value) block[stat] += value
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
  apply(setup.effects, null)
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
  for (const id of config.buffs.enabled) {
    const buff = BUFFS_BY_ID.get(id)
    if (!buff || (buff.providedBy && !config.buffs.raid.includes(buff.providedBy))) continue
    if (maintained.includes(id)) continue
    const effects = catalogueEffects(buff, profile)
    apply(effects, null)
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
  for (const w of weapons) {
    if (!w) continue
    if (windfuryHoldsMainHand && w.hand === HAND.main) continue
    const best = c.tempEnchants
      .filter((t) => !t.weapons || t.weapons.includes(w.type))
      .sort((a, b) => b.priority - a.priority)[0]
    if (!best) continue
    w.plan.flatDamage += best.weaponDamage ?? 0
    if (best.crit) {
      block.crit += best.crit
      elementalStones++
    }
  }

  // --- Weapons: per-hand numbers ---------------------------------------------------------------
  const oh = c.offHand
  for (const w of weapons) {
    if (!w) continue
    const skillName = w.item.weapon?.skill
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

  // --- Derived stats and the sheet -------------------------------------------------------------
  const deriveOptions = { profile, applyUnmeasured, level: PLAYER_LEVEL }
  const derived = deriveStats(block, deriveOptions, new DerivedStats())
  // The sheet counts the buffs the rotation keeps up (flat stats only: Battle Shout's AP).
  let shown = derived
  if (sheetOnly.length > 0) {
    const sheetBlock = new StatBlock().copyFrom(block)
    for (const e of sheetOnly) if (e.kind === 'stat') sheetBlock[e.stat] += e.value
    shown = deriveStats(sheetBlock, deriveOptions, new DerivedStats())
  }
  const mh = weapons[HAND.main]
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
    defense: shown.defense,
    unknown,
  }

  // --- Procs, auras and breakdown rows ------------------------------------------------------------
  const sources: SourcePlan[] = [
    { id: 'mainHand', name: 'Main hand', icon: mh?.item.icon ?? 'inv_sword_04' },
    { id: 'offHand', name: 'Off hand', icon: weapons[HAND.off]?.item.icon ?? 'inv_sword_04' },
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
      critCharges: spec.critCharges ?? 0,
      str: spec.mods.str ?? 0,
      agi: spec.mods.agi ?? 0,
      ap: spec.mods.ap ?? 0,
      apPct: spec.mods.apPct ?? 0,
      crit: spec.mods.crit ?? 0,
      spellCrit: spec.mods.spellCrit ?? 0,
      haste: spec.mods.haste ?? 0,
      damage: spec.mods.damage ?? 0,
    })
    return auras.length - 1
  }
  let procs: ProcPlan[] = []
  /** The aura id each proc needs to be up (Bloodthrill: your Rend), resolved once the abilities' auras are in. */
  const procNeeds: (string | undefined)[] = []
  const chainBits = new Map<string, number>()
  const addProc = (spec: ProcSpec, origin: 0 | 1 | null) => {
    const proc = resolveProc(spec, origin, weapons)
    if (!proc) return
    const { action } = spec
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
        break
      case 'rage':
        proc.action = ACTION.rage
        proc.amount = toTenths(action.amount)
        proc.source = sourceIndex(spec.id, spec.name, spec.icon)
        break
      case 'spellDamage':
        proc.action = ACTION.spellDamage
        proc.a = action.min
        proc.b = action.max
        proc.school = SPELL_SCHOOL[action.school]
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
    }
    procs.push(proc)
    procNeeds.push(spec.requiresAura)
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
  const classRot = setup.simulated
    ? classRotation(config.spec, config.rotation, setup.talents, (id) => auras.findIndex((a) => a.id === id), {
        race: config.race,
        items: itemUses,
        consumables: c.onUse.flatMap((u) => (u.use ? [u.use] : [])),
        executePhase: fight.executePct > 0,
        profile,
        creatureType: fight.creatureType,
      })
    : { abilities: [], rotation: [], prepull: NO_PREPULL, onUse: [], procs: [] }
  // Raging Blows' off-hand strike gets its own row next to the ability's (warrior.md §3.1), a
  // cast's buff or a bleed's marker joins the plan's auras (Death Wish, Recklessness, racial
  // cooldowns; Rend), and the encounter's creature type picks the weapon share (Spearing Strike).
  // A reactive ability's window is an aura too (the Overpower window, warrior.md §2.8, §7).
  const abilities: AbilityPlan[] = classRot.abilities.map((def) => {
    const { offHand, aura, vsCreature: _, window, ...a } = def
    const source = sourceIndex(a.id, a.name, a.icon)
    // A bleed's row counts applications and ticks (Rend: its ticks crit only where periodic
    // effects can, damage-and-timing §4).
    if (a.kind === 'bleed') sources[source].bleed = { ticksCanCrit: a.periodicCanCrit && profile.combat.periodicCrits, avoidable: true }
    return {
      ...a,
      weaponPercent: weaponPercentVs(def, fight.creatureType),
      source,
      offHandSource: offHand && weapons[HAND.off] ? sourceIndex(`${a.id}OffHand`, `${a.name} (off hand)`, a.icon) : -1,
      aura: aura ? auraIndex(aura, aura.id, a.icon) : -1,
      window: window ? auraIndex(window, window.id, a.icon) : -1,
    }
  })
  // The rotation's own procs (the Overpower window's openers, warrior.md §2.8). A proc that needs an
  // aura (Bloodthrill: your Rend on the target) is rolled only while it's up, and left out if the plan
  // has no such aura (no Rend in the rotation).
  for (const spec of classRot.procs) addProc(spec, null)
  procs = procs.flatMap((p, i) => {
    const need = procNeeds[i]
    if (need === undefined) return [p]
    const aura = auras.findIndex((a) => a.id === need)
    return aura < 0 ? [] : [{ ...p, requiresAura: aura }]
  })
  const triggers: number[][] = Array.from({ length: TRIGGER_COUNT }, () => [])
  procs.forEach((p, i) => triggers[p.trigger].push(i))

  // --- Fight ------------------------------------------------------------------------------------
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
            minDamage: Math.max(0, fight.boss.damageMin + bossApDamage),
            maxDamage: Math.max(0, fight.boss.damageMax + bossApDamage),
            canCrush: fight.boss.canCrush,
            parryHaste: fight.boss.parryHaste,
          }
        : null,
      damageTakenPerHit: !tank && fight.damageTakenPerSec > 0 ? (fight.damageTakenPerSec * DPS_DAMAGE_INTERVAL_MS) / 1000 : 0,
      damageTakenIntervalMs: DPS_DAMAGE_INTERVAL_MS,
    },
    stats: block,
    weapons: [weapons[0]?.plan ?? null, weapons[1]?.plan ?? null],
    hasShield,
    damageMult: c.damageMult,
    physicalMult: c.physicalMult,
    damageTakenMult: c.damageTakenMult,
    threatMult: c.threatMult,
    armor: derived.armor,
    rage: {
      // docs/mechanics/rage.md#rage-pool-cap-and-decay: 100 + Boundless Rage, × Gnome +5% [?] (warrior Q17)
      maxTenths: Math.round((BASE_MAX_RAGE + c.maxRageFlat) * c.maxRageMult * 10),
      // docs/mechanics/rage.md#rage-from-damage-taken; a legacy id maps to its new name
      damageTakenModel: currentDamageTakenRageModel(config.rules.damageTakenRage) ?? profile.rage.damageTaken,
      maxHealth: derived.health,
    },
    periodicRage,
    auras,
    procs,
    triggers,
    sources,
    abilities,
    rotation: classRot.rotation,
    prepull: classRot.prepull,
  }

  // --- Assumptions ---------------------------------------------------------------------------------
  if (setup.simulated && abilities.length === 0) notes.add('whiteSwingsOnly')
  // docs/mechanics/damage-and-timing.md#36-server-tick-and-spell-batching: the rotation reacts in 0 ms [?].
  if (classRot.rotation.length > 0) notes.add('reactionTime')
  if (abilities.some((a) => a.gcdMs > 0)) notes.add('gcdHaste')
  if (abilities.some((a) => a.costTenths > 0)) notes.add('abilityRefunds')
  const queues = abilities.some((a) => a.kind === 'onNextSwing')
  if (queues && mh) notes.add('onNextSwingRage')
  // What the rotation's settings rest on without an ability that shows it (Arms' Heroic Strike off).
  if (mh) for (const { id, detail } of classRot.assumes ?? []) notes.add(id, detail)
  if (queues && weapons[HAND.off]) notes.add('onNextSwingOffHand')
  if (setup.talents.has('Unbridled Wrath') && mh) notes.add('unbridledWrathSwings')
  if (abilities.some((a) => a.offHandSource >= 0)) notes.add('ragingBlows')
  if (!mh) notes.add('noWeapon')
  if (profile.id === 'forever') {
    notes.add('foreverHitTable')
    if (front && fight.boss.canParry) notes.add('foreverBossParry')
    if (mh) notes.add('foreverGlancing')
  }
  if (fight.bossLevel - PLAYER_LEVEL >= 3 && mh) notes.add('critSuppression')
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
  const effectiveArmor = targetArmor - derived.armorPen
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
  if (auras.some((a) => a.haste)) notes.add('hasteNextSwing')
  if (setup.simulated && profile.rage.white === 'normalized') {
    notes.add('foreverWhiteRage')
    if (weapons[HAND.off]) notes.add('foreverOffHandRage')
  }
  // docs/mechanics/rage.md#forever-: the damage-taken model, when you take damage. `classic` is [C].
  const takenModel = plan.rage.damageTakenModel
  const takesDamage = tank || plan.fight.damageTakenPerHit > 0
  if (takesDamage) {
    if (takenModel === 'forever') notes.add('damageTakenRage')
    if (takenModel === 'foreverFlat') notes.add('damageTakenRageFlat')
    if (takenModel === 'foreverHealthLost') notes.add('damageTakenRageHealthLost')
  }
  if (unknown.includes('base health')) {
    // The `forever` and `foreverHealthLost` models divide by max health, so its missing base raises their rage.
    const dividesByHealth = takesDamage && (takenModel === 'forever' || takenModel === 'foreverHealthLost')
    notes.add('unknownBaseHealth', dividesByHealth ? 'rage from damage taken divides by it, so that rage comes out high' : undefined)
  }
  if (unknown.includes('base dodge') && (tank || front)) notes.add('unknownBaseDodge')
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
  if (unmodelled.length) notes.add('unmodelledProcs', unmodelled.join(', '))
  if (unmodelledSetBonuses.length) notes.add('unmodelledSetBonuses', unmodelledSetBonuses.join(', '))
  const procIds = new Set(procs.map((p) => p.id))
  // PPM rates are server-side (damage-and-timing §5.1); Hand of Justice's and Ironfoe's flat chances are client data (§5.2).
  if (['crusader', 'fieryWeapon', 'flurryAxe'].some((id) => procIds.has(id))) notes.add('procRates')
  // Ironfoe's Forever chance is a reading of its equip aura, and its hands Classic Era's [?] (damage-and-timing §5.2, OQ 15).
  if (procIds.has('ironfoe') && 'pct' in profile.values.ironfoe.chance) notes.add('ironfoeChance')
  if (chainBits.size > 0) notes.add('extraAttackChains')
  if (procs.some((p) => p.id === 'windfury' && p.icdMs > 0)) notes.add('windfuryIcd')
  if (procIds.has('windfury') && weapons[HAND.main] && c.tempEnchants.length && !windfuryHoldsMainHand) notes.add('windfuryStone')
  // buffs doc §3.6: two stones stack, and one on either hand counts for both [?].
  if (elementalStones > 1 || (elementalStones === 1 && weapons[HAND.off])) notes.add('elementalStone')
  if (procIds.has('deepWounds')) notes.add('deepWounds')
  if (setup.talents.has('Anger Management')) notes.add('angerManagement')
  if (weapons.some((w) => w && w.plan.armorPenPct > 0)) notes.add('weaponmasterMace')
  if (tank) notes.add('whiteThreat')
  if (setup.stance === 'defensive' && setup.talents.has('Defiance') && hasShield) notes.add('defiance')
  if (tank) notes.add('bossMelee')
  if (front) notes.add('bossFlags')
  if (hasShield && tank) notes.add('shieldBlockValue')
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
  if (abilities.some((a) => a.id === 'weaknessAnalyzer')) notes.add('weaknessAnalyzer')
  if (abilities.some((a) => a.window >= 0)) notes.add('overpowerWindow')
  if (procIds.has('bloodthrill')) notes.add('bloodthrill')
  // warrior.md §7 and Q3, Q13, Q32: Slam's cast, Spearing Strike's weapon share, Rend's tick crits and on-hit procs.
  if (abilities.some((a) => a.castMs > 0)) notes.add('slamCast')
  if (abilities.some((a) => a.twoHandOnly) && weapons[HAND.main]?.plan.twoHand) notes.add('spearingStrike')
  const bleeds = abilities.filter((a) => a.kind === 'bleed')
  if (bleeds.some((a) => a.periodicCanCrit) && profile.combat.periodicCrits) notes.add('rendTickCrits')
  if (bleeds.length > 0 && mh) notes.add('rendOnHit')
  // warrior.md §7 and Q28, Q29: Execute's rage tenths, and Improved Bloodrage 1/2's rounding.
  if (mh && fight.executePct > 0 && abilities.some((a) => a.damagePerExtraRage > 0)) notes.add('executeRageTenths')
  if (setup.talents.get('Improved Bloodrage') === 1 && abilities.some((a) => a.id === 'bloodrage')) notes.add('improvedBloodrageRounding')
  if (c.zoneGatedUnmet) notes.add('hyjalFlask')

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
      else b[ATTRIBUTE_MULT[e.stat]] *= m
      return
    }
    case 'itemArmorPct':
      b.itemArmorPct += e.pct / 100
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
      c.threatMult *= 1 + e.pct / 100
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
    case 'targetArmor':
      c.targetArmor += e.value
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
  }
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

const TRIGGER_CODE: Record<ProcSpec['trigger'], number> = TRIGGER

/** Resolves hands and chances for a proc; null when nothing can trigger it in this setup. */
function resolveProc(spec: ProcSpec, origin: 0 | 1 | null, weapons: [Weapon | null, Weapon | null]): ProcPlan | null {
  const trigger = TRIGGER_CODE[spec.trigger]
  const onAttack =
    trigger === TRIGGER.meleeLanded ||
    trigger === TRIGGER.whiteLanded ||
    trigger === TRIGGER.swingLanded ||
    trigger === TRIGGER.meleeCrit ||
    trigger === TRIGGER.targetDodge
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
      // docs/mechanics/damage-and-timing.md#51-ppm-formula: PPM × base weapon speed / 60
      chance[h] = w ? ppmChance(spec.chance.ppm, w.plan.speedSec) : 0
    } else {
      chance[h] = spec.chance.pct / 100
    }
  }
  return {
    id: spec.id,
    name: spec.name,
    trigger,
    chance,
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
