// The pet, as the plan builder resolves it (docs/mechanics/ranged-and-pets.md §6–§8, §12).
//
// A class slice describes its pet as a `PetDef` (its base stats, melee, abilities, power and
// priority list; ClassRotation.pet), and `petPlan` turns it into the plan's `PetPlan`: its stats
// through the same derived-stat pipeline as yours, with the raid buffs that reach it, its table's
// glancing range at its skill, and a breakdown row per attack that names it.
import { glanceRange } from '../core/attack-table'
import { CRIT_MULTIPLIER } from '../core/formulas'
import type { AuraSpec, Effect } from '../effects/types'
import type { RulesProfile } from '../rules/profiles'
import { DerivedStats, deriveStats, StatBlock } from '../stats/stat-block'
import { type PetAbilityPlan, type PetPlan, type PetPowerPlan, type RotationCondition, SCHOOL, type SourcePlan } from './types'

/** One of the pet's abilities before the plan gives it a row and its aura an index (§7). */
export type PetAbilityDef = Omit<PetAbilityPlan, 'source' | 'aura' | 'school'> & {
  school: keyof typeof SCHOOL
  /** An aura it puts up when it lands (a howl's buff on you and the pet); the plan adds it to its auras. */
  aura?: AuraSpec
}

/**
 * A pet, as its class slice describes it (docs/mechanics/ranged-and-pets.md §6, §7). Its base stats
 * are the class doc's (the hunter's and the warlock's pets at 60); what isn't known stays [?] there.
 */
export interface PetDef {
  id: string
  name: string
  icon: string
  level: number
  /** Its melee, or null for a pet that only casts (the Imp). */
  weapon: { min: number; max: number; speedSec: number } | null
  /**
   * Its own stats, as a stat block's base values (Strength, Agility, base attack power and its
   * per-Strength and per-Agility rates, base crit and crit per Agility, hit, spell damage, spell crit
   * and hit). Anything left out is 0, with the stat block's own rates (2 attack power per Strength).
   */
  stats: Partial<Pick<StatBlock, 'baseStr' | 'baseAgi' | 'baseAp' | 'apPerStr' | 'apPerAgi' | 'baseCrit' | 'critPerAgi' | 'hit' | 'spellDamage' | 'baseSpellCrit' | 'spellHit'>>
  /** All its damage %, as a product: its family's, happiness's, your talents' (§6). 1: none. */
  damageMult: number
  /** Shares of your stats it gets, read as they change (§6): 0 in Classic Era [C]; Forever's are server-side [?]. */
  apFromOwnerAp?: number
  apFromOwnerRap?: number
  /** A share of the higher of your attack power and ranged attack power (§6: the hunter's pet) [?]. */
  apFromOwnerHigherAp?: number
  spellDamageFromOwner?: number
  /** Shares of your spell crit and spell hit it adds to its own crit and hit, melee and spells alike [?] (§6: a warlock's demon). */
  critFromOwnerSpellCrit?: number
  hitFromOwnerSpellHit?: number
  /** A share of your higher sheet crit, melee or ranged, it adds to its own crit [?] (§6: the hunter's pet). */
  critFromOwnerCrit?: number
  /** Its white swings can glance against a higher-level boss, as a player's do [?] (§6). */
  glances: boolean
  /** It attacks from in front of the boss (parried and blocked) rather than from behind [?] (§6). */
  front: boolean
  startMs?: number
  power: PetPowerPlan | null
  abilities: PetAbilityDef[]
  /** Its priority list: indices into `abilities`, each with its conditions (§7, §11). */
  rotation: { ability: number; conditions: RotationCondition[] }[]
}

/**
 * The static effects of the Buffs tab's entries that reach a pet (§8), by buff id: Battle Shout's
 * attack power reaches pets in the party [C] (Blizzard's Classic "Not a Bug" list). Which others do is
 * [?] (Forever testers report pets can't be buffed at all), so the core lists only this one; a class
 * slice adds the ones its doc sources.
 */
export const PET_BUFFS: ReadonlySet<string> = new Set(['battleShout'])

/** The effect kinds a buff can give a pet: its stats, attack speed and damage (§8). Anything else stays yours. */
const PET_EFFECT_KINDS: ReadonlySet<Effect['kind']> = new Set(['stat', 'mult', 'haste', 'damage'])

/**
 * The plan's pet (docs/mechanics/ranged-and-pets.md §6–§8): its stats derived from its own and the
 * buffs that reach it (`buffs`: static effects, filtered to its kinds), its glancing range at its
 * skill, a breakdown row for its swings and one per ability (each naming the pet), and its abilities'
 * auras by `auraIndex`. `sources` gains its rows.
 */
export function petPlan(
  def: PetDef,
  buffs: readonly Effect[],
  profile: RulesProfile,
  bossLevel: number,
  sources: SourcePlan[],
  auraIndex: (spec: AuraSpec, key: string, icon: string) => number,
): PetPlan {
  const block = new StatBlock()
  Object.assign(block, def.stats)
  let damageMult = def.damageMult
  for (const e of buffs) {
    if (!PET_EFFECT_KINDS.has(e.kind)) continue
    if (e.kind === 'stat') block[e.stat] += e.value
    else if (e.kind === 'mult') {
      const m = 1 + e.pct / 100
      if (e.stat === 'allStats') {
        block.strMult *= m
        block.agiMult *= m
        block.staMult *= m
        block.intMult *= m
        block.spiMult *= m
      } else if (e.stat === 'ap') block.apMult *= m
      else if (e.stat === 'str') block.strMult *= m
      else if (e.stat === 'agi') block.agiMult *= m
    } else if (e.kind === 'haste') block.haste *= 1 + e.pct / 100
    else if (e.kind === 'damage') damageMult *= 1 + e.pct / 100
  }
  const d = deriveStats(block, { profile, applyUnmeasured: false, level: def.level }, new DerivedStats())
  // Its all-schools spell damage (docs/mechanics/spells.md §5): the pipeline derives it only inside each
  // school's total (all schools + that school's own line), so take one school's and drop its own line.
  // The engine adds a share of yours in the spell's school (PetPlan.spellDamageFromOwner).
  const allSchoolsSpellDamage = d.holySpellDamage - block.holySpellDamage
  const skill = 5 * def.level
  const [glanceLow, glanceHigh] = def.glances ? glanceRange(profile, bossLevel, skill) : [1, 1]
  const row = (id: string, name: string, icon: string) => {
    sources.push({ id, name, icon, pet: def.name })
    return sources.length - 1
  }
  const source = row(`${def.id}.melee`, 'Auto attack', def.icon)
  const abilities: PetAbilityPlan[] = def.abilities.map((a) => {
    const { aura, school, ...rest } = a
    return { ...rest, school: SCHOOL[school], aura: aura ? auraIndex(aura, aura.id, a.icon) : -1, source: row(`${def.id}.${a.id}`, a.name, a.icon) }
  })
  return {
    id: def.id,
    name: def.name,
    icon: def.icon,
    level: def.level,
    weapon: def.weapon,
    skill,
    ap: d.attackPower,
    crit: d.crit,
    auraCrit: d.auraCrit,
    hit: d.hit,
    spellDamage: allSchoolsSpellDamage,
    spellCrit: d.spellCrit,
    spellHit: d.spellHit,
    apFromOwnerAp: def.apFromOwnerAp ?? 0,
    apFromOwnerRap: def.apFromOwnerRap ?? 0,
    spellDamageFromOwner: def.spellDamageFromOwner ?? 0,
    apFromOwnerHigherAp: def.apFromOwnerHigherAp ?? 0,
    critFromOwnerSpellCrit: def.critFromOwnerSpellCrit ?? 0,
    hitFromOwnerSpellHit: def.hitFromOwnerSpellHit ?? 0,
    critFromOwnerCrit: def.critFromOwnerCrit ?? 0,
    damageMult,
    hasteMult: d.hasteMult,
    critMultiplier: CRIT_MULTIPLIER.melee,
    glances: def.glances,
    glanceLow,
    glanceHigh,
    front: def.front,
    startMs: def.startMs ?? 0,
    power: def.power,
    abilities,
    rotation: def.rotation,
    source,
  }
}
