// Config → plan (decision D15: the config is resolved once into a flat, precomputed plan).
//
// Runs on the main thread, where the datasets are loaded: it sums gear and set bonuses, applies
// enchants, buffs, racials, talents and stance as effects, resolves every condition against this
// setup, derives the character sheet, and flattens procs and auras for the engine. Workers get
// only the resulting plain object.
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData, Stats, WeaponSkill, WeaponType } from '@/data/items/types'
import { glanceRange, PLAYER_LEVEL } from '../core/attack-table'
import { NORMALIZED_SPEED, ppmChance, toTenths } from '../core/formulas'
import { classSetup } from '../classes'
import { classRotation } from '../classes/rotation'
import { BUFFS_BY_ID } from '../effects/buffs'
import { ENCHANTS_BY_ID } from '../effects/enchants'
import { ITEM_EFFECTS } from '../effects/items'
import { COOLDOWN_RACIALS, racialEffects } from '../effects/racials'
import type { AuraSpec, Condition, Effect, FlatStat, ProcSpec } from '../effects/types'
import { isTwoHand } from '../equip'
import { PROFILES } from '../rules/profiles'
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
  type Plan,
  type PlanBundle,
  type ProcPlan,
  type SourcePlan,
  STANCE,
  STANCE_ANY,
  TRIGGER,
  TRIGGER_COUNT,
  type WeaponPlan,
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

/** Interval of the stand-in incoming hits for DPS specs (encounter §4, [?]). */
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
  onUse: string[]
  zoneGatedUnmet: boolean
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
  const setup = classSetup(classId, config.spec, config.talents)
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
  const holds = (when: Condition | undefined): boolean => {
    if (!when) return true
    if (when.shield !== undefined && when.shield !== hasShield) return false
    if (when.twoHand !== undefined && when.twoHand !== twoHand) return false
    if (when.stance !== undefined && when.stance !== setup.stance) return false
    if (when.creature && !when.creature.includes(fight.creatureType)) return false
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
  const onUseItems: string[] = []
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
    if (item.setId) setCounts.set(item.setId, (setCounts.get(item.setId) ?? 0) + 1)
    if (!item.foreverData) classicItems.push(item.name)
    const override = ITEM_EFFECTS[item.id]
    if (override) apply(override.effects, origin)
    else if (item.procs.length > 0 || item.otherEquip.length > 0 || (item.weapon?.extraDamage?.length ?? 0) > 0)
      unmodelled.push(item.name)
    if (item.useEffects.length > 0) onUseItems.push(item.name)
  }
  for (const [setId, count] of setCounts) {
    for (const bonus of itemData.sets[setId]?.bonuses ?? []) {
      if (bonus.pieces > count) continue
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
    apply(enchant.effects, origin)
  }

  // Racials, talents and stance.
  apply(racialEffects(config.race, classId), null)
  apply(setup.effects, null)

  // Buffs, debuffs and consumables.
  const hasDebuffs = { armor: false, boss: false, slow: false }
  for (const id of config.buffs.enabled) {
    const buff = BUFFS_BY_ID.get(id)
    if (!buff || (buff.providedBy && !config.buffs.raid.includes(buff.providedBy))) continue
    const effects = typeof buff.effects === 'function' ? buff.effects(profile) : buff.effects
    apply(effects, null)
    for (const e of effects) {
      if (e.kind === 'targetArmor') hasDebuffs.armor = true
      if (e.kind === 'bossAp' && e.value !== 0) hasDebuffs.boss = true
      if (e.kind === 'bossSlow') hasDebuffs.slow = true
    }
  }

  // Temporary weapon enchants: each weapon takes the highest-priority one that fits it (buffs doc §3.6).
  let elementalStones = 0
  for (const w of weapons) {
    if (!w) continue
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
      w.plan.handMult = 0.5 * (1 + oh.damagePct / 100)
      w.plan.hitBonus += oh.hit
      w.plan.rageMult = 1 + oh.ragePct / 100
    }
    w.plan.armorPenPct = Math.min(1, w.plan.armorPenPct)
  }

  // --- Derived stats and the sheet -------------------------------------------------------------
  const derived = deriveStats(block, { profile, applyUnmeasured, level: PLAYER_LEVEL }, new DerivedStats())
  const mh = weapons[HAND.main]
  const sheet: CharacterSheet = {
    strength: derived.strength,
    agility: derived.agility,
    stamina: derived.stamina,
    intellect: derived.intellect,
    spirit: derived.spirit,
    health: derived.health,
    mana: block.hasMana ? derived.mana : null,
    armor: derived.armor,
    attackPower: derived.attackPower,
    critPct: derived.crit + (mh?.plan.critBonus ?? 0),
    hitPct: derived.hit,
    hastePct: (derived.hasteMult - 1) * 100,
    expertise: derived.expertise,
    weaponSkill: { mainHand: mh?.plan.skill ?? 5 * PLAYER_LEVEL, offHand: weapons[HAND.off]?.plan.skill ?? null },
    dodgePct: derived.dodge,
    parryPct: derived.parry,
    blockPct: derived.block,
    blockValue: derived.blockValue,
    defense: derived.defense,
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
  const auraIndex = (spec: AuraSpec, key: string) => {
    const i = auras.findIndex((a) => a.id === key)
    if (i >= 0) return i
    auras.push({
      id: key,
      name: spec.name,
      durationMs: spec.durationMs,
      maxStacks: spec.maxStacks ?? 1,
      whiteSwingCharges: spec.whiteSwingCharges ?? 0,
      str: spec.mods.str ?? 0,
      agi: spec.mods.agi ?? 0,
      ap: spec.mods.ap ?? 0,
      crit: spec.mods.crit ?? 0,
      haste: spec.mods.haste ?? 0,
      damage: spec.mods.damage ?? 0,
    })
    return auras.length - 1
  }
  const procs: ProcPlan[] = []
  const chainBits = new Map<string, number>()
  for (const { spec, origin } of c.procs) {
    const proc = resolveProc(spec, origin, weapons)
    if (!proc) continue
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
        proc.amount = auraIndex(action.aura, spec.from === 'weapon' && origin !== null ? `${action.aura.id}.${origin}` : action.aura.id)
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
        break
    }
    procs.push(proc)
  }
  const triggers: number[][] = Array.from({ length: TRIGGER_COUNT }, () => [])
  procs.forEach((p, i) => triggers[p.trigger].push(i))
  const periodicRage = c.periodicRage.map((p) => ({ periodMs: p.periodMs, tenths: toTenths(p.amount), source: -1 }))

  // --- Abilities and the priority list (docs/classes/warrior.md §5) ------------------------------
  const classRot = setup.simulated
    ? classRotation(config.spec, config.rotation, setup.talents, (id) => auras.findIndex((a) => a.id === id))
    : { abilities: [], rotation: [] }
  // Raging Blows' off-hand strike gets its own row next to the ability's (warrior.md §3.1).
  const abilities: AbilityPlan[] = classRot.abilities.map(({ offHand, ...a }) => ({
    ...a,
    source: sourceIndex(a.id, a.name, a.icon),
    offHandSource: offHand && weapons[HAND.off] ? sourceIndex(`${a.id}OffHand`, `${a.name} (off hand)`, a.icon) : -1,
  }))

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
            speedSec: bossSwingBase * (1 + c.bossSlowPct / 100),
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
      damageTakenModel: config.rules.damageTakenRage ?? profile.rage.damageTaken,
      maxHealth: derived.health,
    },
    periodicRage,
    auras,
    procs,
    triggers,
    sources,
    abilities,
    rotation: classRot.rotation,
  }

  // --- Assumptions ---------------------------------------------------------------------------------
  if (setup.simulated) notes.add(abilities.length > 0 ? 'partialRotation' : 'whiteSwingsOnly')
  if (abilities.some((a) => a.gcdMs > 0)) notes.add('gcdHaste')
  if (abilities.some((a) => a.costTenths > 0)) notes.add('abilityRefunds')
  const queues = abilities.some((a) => a.kind === 'onNextSwing')
  if (queues && mh) notes.add('onNextSwingRage')
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
  if (profile.armor.allowNegative && targetArmor - derived.armorPen < 0) notes.add('negativeArmor')
  if (weapons[HAND.off]) notes.add('offHandFirstSwing')
  if (auras.some((a) => a.haste)) notes.add('hasteNextSwing')
  if (setup.simulated && profile.rage.white === 'normalized') {
    notes.add('foreverWhiteRage')
    if (weapons[HAND.off]) notes.add('foreverOffHandRage')
  }
  const takenModel = plan.rage.damageTakenModel
  if (tank || plan.fight.damageTakenPerHit > 0) {
    if (takenModel === 'forever') notes.add('damageTakenRage')
    if (takenModel === 'foreverHp' || takenModel === 'foreverHpPreArmor') notes.add('damageTakenRageHp')
  }
  if (unknown.includes('base health')) notes.add('unknownBaseHealth')
  if (unknown.includes('base dodge') && (tank || front)) notes.add('unknownBaseDodge')
  const racialWeapons: Partial<Record<string, WeaponType>> = { 'alliance-human': 'sword', 'horde-orc': 'axe', 'alliance-dwarf': 'mace' }
  const racialWeapon = racialWeapons[config.race]
  if (racialWeapon && weapons.some((w) => w?.type === racialWeapon) && weapons.some((w) => w && w.type !== racialWeapon))
    notes.add('racialWeaponCrit')
  if (config.race === 'alliance-gnome' && c.maxRageFlat > 0) notes.add('gnomeRage')
  if (setup.simulated && COOLDOWN_RACIALS[config.race]) notes.add('cooldownRacial')
  if (config.race === 'horde-undead') notes.add('touchOfTheGrave')
  if (classicItems.length) notes.add('classicItems', classicItems.join(', '))
  if (unmodelled.length) notes.add('unmodelledProcs', unmodelled.join(', '))
  const procIds = new Set(procs.map((p) => p.id))
  if (['crusader', 'fieryWeapon', 'handOfJustice', 'ironfoe', 'flurryAxe'].some((id) => procIds.has(id))) notes.add('procRates')
  if (chainBits.size > 0) notes.add('extraAttackChains')
  if (procIds.has('windfury') && weapons[HAND.main] && c.tempEnchants.length) notes.add('windfuryStone')
  if (elementalStones > 1) notes.add('elementalStone')
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
  const onUse = [...c.onUse, ...onUseItems]
  if (setup.simulated && onUse.length) notes.add('onUseConsumables', onUse.join(', '))
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
      c.onUse.push(e.name)
      return
  }
}

const TRIGGER_CODE: Record<ProcSpec['trigger'], number> = TRIGGER

/** Resolves hands and chances for a proc; null when nothing can trigger it in this setup. */
function resolveProc(spec: ProcSpec, origin: 0 | 1 | null, weapons: [Weapon | null, Weapon | null]): ProcPlan | null {
  const trigger = TRIGGER_CODE[spec.trigger]
  const onAttack =
    trigger === TRIGGER.meleeLanded || trigger === TRIGGER.whiteLanded || trigger === TRIGGER.swingLanded || trigger === TRIGGER.meleeCrit
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
