// Validation and migration of untrusted configs: localStorage, share links, old versions
// (docs/ux.md#persistence-and-sharing). It never throws: anything it can't use is repaired or
// reset to the spec default, with one plain-language warning per repair.
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData } from '@/data/items/types'
import raceJson from '@/data/races/races.json'
import type { ClassSlug, RaceData } from '@/data/races/types'
import { decodeTalentCode, validateTalentBuild } from '@/data/talents/types'
import { defaultConfig, FULL_RAID, TALENT_DATA } from '../defaults'
import { BUFFS_BY_ID } from '../effects/buffs'
import { ENCHANTS_BY_ID } from '../effects/enchants'
import { presetBuffIds } from '../effects/presets'
import { fitsSlot, isTwoHand } from '../equip'
import { SPEC_IDS, SPEC_META } from '../specs'
import { renamedRotationOptions, rotationOptions } from '../classes/rotation'
import type { ClassId, CreatureType, FightConfig, GearSlot, SimConfig, SpecId } from '../types'

const items = new Map<number, Item>((itemJson as unknown as ItemData).items.map((i) => [i.id, i]))
const raceData = raceJson as unknown as RaceData

export const GEAR_SLOTS: GearSlot[] = [
  'head',
  'neck',
  'shoulder',
  'back',
  'chest',
  'wrist',
  'hands',
  'waist',
  'legs',
  'feet',
  'finger1',
  'finger2',
  'trinket1',
  'trinket2',
  'mainHand',
  'offHand',
  'ranged',
]

const CLASS_SLUGS: ClassSlug[] = ['warrior', 'hunter', 'mage', 'rogue', 'priest', 'warlock', 'paladin', 'druid', 'shaman']
const CREATURE_TYPES: CreatureType[] = ['none', 'beast', 'demon', 'dragonkin', 'elemental', 'giant', 'humanoid', 'mechanical', 'undead']
const ZONES: FightConfig['zone'][] = ['hyjal', 'barrowDeeps', 'onyxia', 'other']
const DAMAGE_TAKEN_MODELS = ['forever', 'classic', 'foreverHp', 'foreverHpPreArmor'] as const

/**
 * Ranges for fight settings (docs/mechanics/encounter.md#encounter-settings). Boss armor has no
 * documented range; 0–20,000 covers every preset and the 75% cap point (17,265).
 */
export const FIGHT_LIMITS = {
  durationSec: [30, 900],
  durationVariationPct: [0, 25],
  bossLevel: [60, 63],
  bossArmor: [0, 20000],
  executePct: [0, 50],
  extraTargets: [0, 4],
  damageTakenPerSec: [0, 500],
  swingSpeedSec: [1, 4],
  bossDamage: [0, 20000],
} as const

/** Fixed-mode iteration bounds and the uint32 seed range (decision D15). */
export const RUN_LIMITS = { iterations: [100, 100000] } as const

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

class Repairs {
  readonly warnings: string[] = []
  add(message: string) {
    this.warnings.push(message)
  }
}

function num(
  value: unknown,
  fallback: number,
  [min, max]: readonly [number, number],
  label: string,
  r: Repairs,
  integer = false,
): number {
  if (value === undefined) return fallback
  if (!isNum(value)) {
    r.add(`${label} wasn't a number, so it was reset to ${fallback}.`)
    return fallback
  }
  let v = integer ? Math.round(value) : value
  if (v < min || v > max) {
    v = Math.min(max, Math.max(min, v))
    r.add(`${label} was out of range and was set to ${v}.`)
  }
  return v
}

function bool(value: unknown, fallback: boolean, label: string, r: Repairs): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    r.add(`${label} wasn't on or off, so it was reset.`)
    return fallback
  }
  return value
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T, label: string, r: Repairs): T {
  if (value === undefined) return fallback
  if (typeof value === 'string' && (options as readonly string[]).includes(value)) return value as T
  r.add(`${label} wasn't recognised, so it was reset.`)
  return fallback
}

export function normalizeConfig(input: unknown): { config: SimConfig; warnings: string[] } {
  try {
    return normalize(input)
  } catch {
    return { config: defaultConfig('warrior-fury'), warnings: ['The setup couldn’t be read, so it was reset to the defaults.'] }
  }
}

function normalize(input: unknown): { config: SimConfig; warnings: string[] } {
  const r = new Repairs()
  if (!isObj(input)) {
    r.add('The setup couldn’t be read, so it was reset to the defaults.')
    return { config: defaultConfig('warrior-fury'), warnings: r.warnings }
  }

  // Version: 1 is the only version so far. A newer one comes from a newer app.
  if (input.version !== undefined && input.version !== 1) {
    r.add('The setup comes from a different version of the app, so it was reset to the defaults.')
    const spec = SPEC_IDS.includes(input.spec as SpecId) ? (input.spec as SpecId) : 'warrior-fury'
    return { config: defaultConfig(spec), warnings: r.warnings }
  }

  let spec: SpecId = 'warrior-fury'
  if (typeof input.spec === 'string' && SPEC_IDS.includes(input.spec as SpecId)) spec = input.spec as SpecId
  else r.add('The spec wasn’t recognised, so a Fury warrior was loaded.')
  const meta = SPEC_META[spec]
  const d = defaultConfig(spec)

  // Race: legal for the class in Forever (docs/mechanics/character-stats.md#legal-races-for-the-sims-classes).
  let race = d.race
  if (input.race !== undefined) {
    if (typeof input.race === 'string' && raceData.simClassAvailability[meta.classId].forever.includes(input.race)) race = input.race
    else r.add(`That race can’t be a ${meta.className.toLowerCase()} in Forever, so the default race was used.`)
  }

  // Talents: a legal build code for the class (docs/data/talents.md).
  let talents = d.talents
  if (input.talents !== undefined) {
    const data = TALENT_DATA[meta.classId]
    let ok = typeof input.talents === 'string'
    if (ok) {
      try {
        ok = validateTalentBuild(data, decodeTalentCode(data, input.talents as string)).length === 0
      } catch {
        ok = false
      }
    }
    if (ok) talents = input.talents as string
    else r.add('The talent build wasn’t valid, so the default build was used.')
  }

  const gear = normalizeGear(input.gear, d, meta.classId, r)
  const buffs = normalizeBuffs(input.buffs, spec, isObj(input.run) && input.run.mode === undefined, r)
  const rotation = normalizeRotation(input.rotation, spec, r)
  const fight = normalizeFight(input.fight, d.fight, r)

  const rulesIn = isObj(input.rules) ? input.rules : {}
  if (input.rules !== undefined && !isObj(input.rules)) r.add('The rule settings couldn’t be read, so they were reset.')
  const rules: SimConfig['rules'] = {
    profile: oneOf(rulesIn.profile, ['forever', 'classicEra'] as const, d.rules.profile, 'The rule profile', r),
    unmeasuredRatings: oneOf(rulesIn.unmeasuredRatings, ['apply', 'ignore'] as const, d.rules.unmeasuredRatings, 'The untested-ratings switch', r),
  }
  if (rulesIn.damageTakenRage !== undefined) {
    const model = rulesIn.damageTakenRage as (typeof DAMAGE_TAKEN_MODELS)[number]
    if (DAMAGE_TAKEN_MODELS.includes(model)) rules.damageTakenRage = model
    else r.add('The damage-taken rage model wasn’t recognised, so the profile’s default is used.')
  }

  const runIn = isObj(input.run) ? input.run : {}
  if (input.run !== undefined && !isObj(input.run)) r.add('The run settings couldn’t be read, so they were reset.')
  let seed = d.run.seed
  if (runIn.seed !== undefined) {
    if (isNum(runIn.seed) && Number.isInteger(runIn.seed) && runIn.seed >= 0 && runIn.seed <= 0xffffffff) seed = runIn.seed
    else if (isNum(runIn.seed)) {
      seed = Math.floor(Math.abs(runIn.seed)) >>> 0
      r.add(`The seed must be a whole number from 0 to 4,294,967,295, so it was set to ${seed}.`)
    } else r.add('The seed wasn’t a number, so it was reset.')
  }
  const run: SimConfig['run'] = {
    // Configs saved before adaptive runs existed have no mode; they get the adaptive default.
    mode: oneOf(runIn.mode, ['adaptive', 'fixed'] as const, 'adaptive', 'The run mode', r),
    iterations: num(runIn.iterations, d.run.iterations, RUN_LIMITS.iterations, 'The number of fights', r, true),
    seed,
  }

  return { config: { version: 1, spec, race, talents, gear, buffs, rotation, fight, rules, run }, warnings: r.warnings }
}

function normalizeGear(input: unknown, d: SimConfig, classId: ClassId, r: Repairs): SimConfig['gear'] {
  if (input === undefined) return d.gear
  if (!isObj(input)) {
    r.add('The gear couldn’t be read, so the default gear was equipped.')
    return d.gear
  }
  const gear: SimConfig['gear'] = {}
  for (const [slot, entry] of Object.entries(input)) {
    if (!GEAR_SLOTS.includes(slot as GearSlot)) {
      r.add(`An unknown gear slot (${slot.slice(0, 20)}) was removed.`)
      continue
    }
    const s = slot as GearSlot
    if (entry === undefined || entry === null) continue
    if (!isObj(entry) || !isNum(entry.itemId)) {
      r.add(`The ${s} slot couldn’t be read, so it was emptied.`)
      continue
    }
    const item = items.get(entry.itemId)
    if (!item) {
      r.add(`An unknown item in the ${s} slot was removed.`)
      continue
    }
    if (!fitsSlot(classId, s, item)) {
      r.add(`${item.name} can’t go in that slot for this class, so it was removed.`)
      continue
    }
    gear[s] = { itemId: item.id }
    if (entry.enchantId !== undefined) {
      const enchant = typeof entry.enchantId === 'string' ? ENCHANTS_BY_ID.get(entry.enchantId) : undefined
      const fits =
        enchant !== undefined &&
        enchant.slots.includes(s) &&
        (enchant.requires !== 'weapon' || item.itemClass === 'Weapon') &&
        (enchant.requires !== 'twoHand' || isTwoHand(item)) &&
        (enchant.requires !== 'shield' || item.slot === 'shield')
      if (fits) gear[s] = { itemId: item.id, enchantId: enchant.id }
      else r.add(`An enchant on ${item.name} doesn’t fit it, so it was removed.`)
    }
  }
  const mainHand = gear.mainHand && items.get(gear.mainHand.itemId)
  if (mainHand && isTwoHand(mainHand) && gear.offHand) {
    delete gear.offHand
    r.add('A two-handed weapon uses both hands, so the off-hand item was removed.')
  }
  for (const [a, b] of [
    ['finger1', 'finger2'],
    ['trinket1', 'trinket2'],
  ] as const) {
    const x = gear[a]
    const y = gear[b]
    if (x && y && x.itemId === y.itemId && items.get(x.itemId)?.unique) {
      delete gear[b]
      r.add(`${items.get(x.itemId)!.name} is unique, so the second copy was removed.`)
    }
  }
  return gear
}

function normalizeBuffs(input: unknown, spec: SpecId, legacy: boolean, r: Repairs): SimConfig['buffs'] {
  if (input === undefined) return { raid: [...FULL_RAID], enabled: presetBuffIds('raid', spec, FULL_RAID) }
  if (!isObj(input)) {
    r.add('The buffs couldn’t be read, so the Standard raid preset was used.')
    return { raid: [...FULL_RAID], enabled: presetBuffIds('raid', spec, FULL_RAID) }
  }
  let raid: ClassSlug[] = [...FULL_RAID]
  if (input.raid !== undefined) {
    if (Array.isArray(input.raid)) {
      raid = [...new Set(input.raid.filter((c): c is ClassSlug => CLASS_SLUGS.includes(c as ClassSlug)))]
      if (raid.length !== input.raid.length) r.add('Unknown classes were removed from the raid.')
    } else r.add('The raid composition couldn’t be read, so every class was included.')
  }
  if (!Array.isArray(input.enabled)) {
    if (input.enabled !== undefined) r.add('The buff list couldn’t be read, so the Standard raid preset was used.')
    return { raid, enabled: presetBuffIds('raid', spec, raid) }
  }
  // Setups saved before the buff catalogue existed (no run mode) have an empty list that meant
  // "nothing to choose from"; they get the default preset.
  if (legacy && input.enabled.length === 0) return { raid, enabled: presetBuffIds('raid', spec, raid) }
  const enabled: string[] = []
  const groups = new Set<string>()
  for (const id of input.enabled) {
    const buff = typeof id === 'string' ? BUFFS_BY_ID.get(id) : undefined
    if (!buff) {
      r.add('An unknown buff was removed.')
      continue
    }
    if (enabled.includes(buff.id)) continue
    if (buff.providedBy && !raid.includes(buff.providedBy)) {
      r.add(`${buff.name} needs a ${buff.providedBy} in the raid, so it was turned off.`)
      continue
    }
    if (buff.exclusiveGroup) {
      if (groups.has(buff.exclusiveGroup)) {
        r.add(`${buff.name} doesn’t stack with another selected buff, so it was turned off.`)
        continue
      }
      groups.add(buff.exclusiveGroup)
    }
    enabled.push(buff.id)
  }
  return { raid, enabled }
}

function normalizeRotation(input: unknown, spec: SpecId, r: Repairs): SimConfig['rotation'] {
  if (input === undefined) return {}
  if (!isObj(input)) {
    r.add('The rotation settings couldn’t be read, so they were reset.')
    return {}
  }
  const options = rotationOptions(spec)
  const renamed = renamedRotationOptions(spec)
  const rotation: SimConfig['rotation'] = {}
  let dropped = false
  for (const [savedId, value] of Object.entries(input)) {
    // A renamed setting keeps its saved value under the new id, unless the new id is saved too.
    const id = renamed[savedId] ?? savedId
    if (id !== savedId && id in input) continue
    const option = options.find((o) => o.id === id)
    if (!option) {
      dropped = true
      continue
    }
    if (option.kind === 'toggle') {
      if (typeof value === 'boolean') rotation[id] = value
      else dropped = true
    } else if (isNum(value)) {
      rotation[id] = Math.min(option.max, Math.max(option.min, value))
      if (rotation[id] !== value) r.add(`${option.label} was out of range and was set to ${rotation[id]}.`)
    } else dropped = true
  }
  if (dropped) r.add('Rotation settings that don’t apply to this spec were reset.')
  return rotation
}

function normalizeFight(input: unknown, d: FightConfig, r: Repairs): FightConfig {
  if (input === undefined) return d
  if (!isObj(input)) {
    r.add('The fight settings couldn’t be read, so they were reset.')
    return d
  }
  const L = FIGHT_LIMITS
  const bossIn = isObj(input.boss) ? input.boss : {}
  if (input.boss !== undefined && !isObj(input.boss)) r.add('The boss melee settings couldn’t be read, so they were reset.')
  let damageMin = num(bossIn.damageMin, d.boss.damageMin, L.bossDamage, 'Boss minimum damage', r)
  let damageMax = num(bossIn.damageMax, d.boss.damageMax, L.bossDamage, 'Boss maximum damage', r)
  if (damageMin > damageMax) {
    ;[damageMin, damageMax] = [damageMax, damageMin]
    r.add('Boss minimum damage was above the maximum, so they were swapped.')
  }
  return {
    durationSec: num(input.durationSec, d.durationSec, L.durationSec, 'Fight length', r, true),
    durationVariationPct: num(input.durationVariationPct, d.durationVariationPct, L.durationVariationPct, 'Length variation', r),
    bossLevel: num(input.bossLevel, d.bossLevel, L.bossLevel, 'Boss level', r, true),
    bossArmor: num(input.bossArmor, d.bossArmor, L.bossArmor, 'Boss armor', r, true),
    executePct: num(input.executePct, d.executePct, L.executePct, 'Execute phase', r),
    extraTargets: num(input.extraTargets, d.extraTargets, L.extraTargets, 'Extra enemies', r, true),
    position: oneOf(input.position, ['behind', 'front'] as const, d.position, 'Position', r),
    creatureType: oneOf(input.creatureType, CREATURE_TYPES, d.creatureType, 'Creature type', r),
    zone: oneOf(input.zone, ZONES, d.zone, 'Zone', r),
    damageTakenPerSec: num(input.damageTakenPerSec, d.damageTakenPerSec, L.damageTakenPerSec, 'Damage taken', r),
    boss: {
      swingSpeedSec: num(bossIn.swingSpeedSec, d.boss.swingSpeedSec, L.swingSpeedSec, 'Boss swing speed', r),
      damageMin,
      damageMax,
      canDodge: bool(bossIn.canDodge, d.boss.canDodge, 'Boss can dodge', r),
      canParry: bool(bossIn.canParry, d.boss.canParry, 'Boss can parry', r),
      canBlock: bool(bossIn.canBlock, d.boss.canBlock, 'Boss can block', r),
      parryHaste: bool(bossIn.parryHaste, d.boss.parryHaste, 'Parry haste', r),
      canCrush: bool(bossIn.canCrush, d.boss.canCrush, 'Crushing blows', r),
    },
  }
}
