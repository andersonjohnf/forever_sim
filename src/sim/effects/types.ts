// The effect model (docs/mechanics/buffs-debuffs-consumables.md#what-the-sim-needs).
//
// Buffs, debuffs, consumables, enchants, talents, racials, stances and item procs are all lists
// of these plain, serializable effects. The plan builder resolves them once per run against the
// setup (weapons, shield, stance, zone, creature type) into the stat block, damage and threat
// multipliers, target modifiers, and aura/proc definitions the engine runs. Nothing here is
// class-specific, so a new spec adds data, not engine branches.
import type { WeaponType } from '@/data/items/types'
import type { RulesProfile } from '../rules/profiles'
import type { CreatureType, FightConfig } from '../types'

/** Flat additive stats (fields of StatBlock). Percent stats are percentage points. */
export type FlatStat =
  | 'str'
  | 'agi'
  | 'sta'
  | 'int'
  | 'spi'
  | 'ap'
  | 'crit'
  | 'critRating'
  | 'hit'
  | 'hitRating'
  | 'spellHit'
  | 'spellCrit'
  | 'hasteRating'
  | 'expertise'
  | 'expertiseRating'
  | 'armorPen'
  | 'itemArmor'
  | 'bonusArmor'
  | 'defense'
  | 'defenseRating'
  | 'dodge'
  | 'dodgeRating'
  | 'parry'
  | 'parryRating'
  | 'block'
  | 'blockRating'
  | 'blockValue'
  | 'health'
  | 'mana'

/** Stats that % modifiers multiply (character-stats.md#derived-stat-pipeline, step 3 and 4). */
export type MultStat = 'str' | 'agi' | 'sta' | 'int' | 'spi' | 'allStats' | 'ap' | 'health' | 'blockValue'

/** Effects that depend on the rule profile (Classic Era spell values), resolved per run. */
export type EffectList = Effect[] | ((profile: RulesProfile) => Effect[])

/**
 * A catalogue entry's Classic Era values where they differ from Forever's (its own `summary` and
 * `effects`), from the Classic Era client (docs/mechanics/buffs-debuffs-consumables.md#classic-era-values).
 * A profile whose `catalogue.column` is `classicEra` reads them instead. `effects` is left out
 * where the entry's own effects already read the profile (`EffectList` as a function).
 */
export interface ClassicEraValues {
  summary: string
  effects?: Effect[]
}

/** A buff, consumable or enchant: its Forever values, and its Classic Era ones where they differ. */
export interface CatalogueEntry {
  summary: string
  effects: EffectList
  classicEra?: ClassicEraValues
}

/** The effects a catalogue entry has under a rule profile (buffs doc, Classic Era values). */
export function catalogueEffects(entry: CatalogueEntry, profile: RulesProfile): Effect[] {
  const list = (profile.catalogue.column === 'classicEra' && entry.classicEra?.effects) || entry.effects
  return typeof list === 'function' ? list(profile) : list
}

/** The one-line summary a catalogue entry shows under a rule profile. */
export function catalogueSummary(entry: CatalogueEntry, profile: RulesProfile): string {
  return (profile.catalogue.column === 'classicEra' && entry.classicEra?.summary) || entry.summary
}

export type Zone = FightConfig['zone']

/** When an effect applies. Everything here is known before the fight, so it resolves at plan time. */
export interface Condition {
  /** A shield is equipped. */
  shield?: boolean
  /** A two-handed weapon is equipped. */
  twoHand?: boolean
  /** The spec fights in this stance. */
  stance?: 'battle' | 'defensive' | 'berserker'
  /** The fight is in one of these zones (Forever zone-gated flasks). */
  zones?: Zone[]
  /** The boss is one of these creature types. */
  creature?: CreatureType[]
}

export type Effect = (
  | { kind: 'stat'; stat: FlatStat; value: number }
  | { kind: 'mult'; stat: MultStat; pct: number }
  /** Item armor % (Toughness), summed before multiplying (character-stats step 4). */
  | { kind: 'itemArmorPct'; pct: number }
  /** Attack speed, multiplicative with other haste (damage-and-timing §3.1). */
  | { kind: 'haste'; pct: number }
  /** Damage done (damage-and-timing §2.4); multiplicative. `physicalOnly` skips magic procs. */
  | { kind: 'damage'; pct: number; physicalOnly?: boolean }
  /** Damage taken (tanks); multiplicative. */
  | { kind: 'damageTaken'; pct: number }
  /** Global threat multiplier (threat.md#global-threat-modifiers); multiplicative. */
  | { kind: 'threat'; pct: number }
  /** Maximum rage, flat or % (rage.md#rage-pool-cap-and-decay). */
  | { kind: 'maxRage'; value: number }
  | { kind: 'maxRagePct'; pct: number }
  /** Per-weapon effects: only weapons of these types (all weapons when omitted). */
  | { kind: 'weaponDamage'; value: number; weapons?: WeaponType[] }
  | { kind: 'weaponCrit'; value: number; weapons?: WeaponType[] }
  /** Armor ignored by attacks with these weapons, as a fraction of the target's armor (Weaponmaster, maces). */
  | { kind: 'weaponArmorPenPct'; pct: number; weapons?: WeaponType[] }
  /** Off-hand modifiers (Dual Wield Specialization). */
  | { kind: 'offHand'; damagePct?: number; hit?: number; ragePct?: number }
  /**
   * A temporary weapon enchant (stone, oil): each weapon takes the highest-priority one that fits
   * it (docs/mechanics/buffs-debuffs-consumables.md#36-weapon-enhancements-temporary).
   */
  | { kind: 'tempEnchant'; id: string; priority: number; weapons?: WeaponType[]; weaponDamage?: number; crit?: number }
  /** Target armor reduction (docs/mechanics/buffs-debuffs-consumables.md#41-armor-reduction). */
  | { kind: 'targetArmor'; value: number }
  /** Boss attack power (+ raises it, − lowers it) and attack-speed slow (encounter.md#5-boss-melee-tank-modeling). */
  | { kind: 'bossAp'; value: number }
  | { kind: 'bossSlow'; pct: number }
  | { kind: 'proc'; proc: ProcSpec }
  /** Rage every `periodMs` from the pull (Anger Management: not an energize, so no threat). */
  | { kind: 'periodicRage'; periodMs: number; amount: number }
  /**
   * A consumable the rotation uses. `use` is the cast a rotation can press; without it, or for a
   * spec whose rotation doesn't press it, it's listed as not simulated.
   */
  | { kind: 'onUse'; id: string; name: string; use?: OnUseSpec }
) & { when?: Condition }

/**
 * An on-use consumable or item as a `cast` a rotation can press (plan/types.ts AbilityPlan):
 * no cost, any stance, its cooldown and GCD from the client, a buff, and rage at once (an
 * energize). Numbers from src/data/client, checked by effects/on-use.test.ts.
 */
export interface OnUseSpec {
  id: string
  name: string
  icon: string
  /** Its own cooldown (the item's, or the category's when that's longer). */
  cooldownMs: number
  /** 0 = off the GCD. */
  gcdMs: number
  aura: AuraSpec | null
  /** Rage at once: `rageTenths` plus a uniform whole number of tenths from 0 to `rageSpreadTenths`. */
  rageTenths: number
  rageSpreadTenths: number
}

/** Timed buff applied by a proc or a `cast` ability (plan/types.ts AbilityPlan). Mods apply per stack. */
export interface AuraSpec {
  id: string
  name: string
  durationMs: number
  maxStacks?: number
  /** Charges consumed by white swings (Flurry: 3); the aura drops when they run out. */
  whiteSwingCharges?: number
  /** Charges consumed by crits dealt, white or special (Weakness Analyzer: 1); the aura drops when they run out. */
  critCharges?: number
  mods: {
    str?: number
    agi?: number
    ap?: number
    /** Attack power %, multiplicative (Blood Fury). */
    apPct?: number
    crit?: number
    /** Attack speed %, multiplicative. */
    haste?: number
    /** Physical damage done %, multiplicative. */
    damage?: number
  }
}

export type ProcTrigger =
  /** A white or special melee attack that landed: hit, crit, glance or block (damage-and-timing §5.3). */
  | 'meleeLanded'
  /** A white swing (including extra attacks) that landed. */
  | 'whiteLanded'
  /** A landed swing: a white swing, an extra attack, or an on-next-swing ability's replaced swing (warrior.md §2.4 item 3). */
  | 'swingLanded'
  /** Any melee crit. */
  | 'meleeCrit'
  /** The player is hit by a damaging attack (not avoided). */
  | 'damageTaken'
  /** The player blocks. */
  | 'block'
  /** The player dodges or parries. */
  | 'dodgeParry'
  /** The target dodges one of the player's attacks, white or special, either hand (the Overpower window, warrior.md §2.8). */
  | 'targetDodge'

export type ProcAction =
  /** Extra main-hand swings, immediately (damage-and-timing §5.4); `bonusAp` applies to them only. */
  | { kind: 'extraAttacks'; count: number; bonusAp?: number }
  /**
   * Puts the aura on the player; `durationMs` overrides its duration for this proc (the Overpower
   * window: 5 s from a dodge, 6 s from Bloodthrill, warrior.md §2.8). A refresh never shortens it.
   */
  | { kind: 'aura'; aura: AuraSpec; durationMs?: number }
  /** Magic damage on the spell table with an average partial resist (combat-tables §9). */
  | { kind: 'spellDamage'; school: 'fire' | 'frost' | 'shadow' | 'nature' | 'arcane' | 'holy'; min: number; max: number }
  /** Rage from a spell effect (an energize: it makes threat, threat.md). */
  | { kind: 'rage'; amount: number }
  /** A bleed of `share` × the main hand's average swing, recomputed each tick (Deep Wounds, warrior.md §2.5). */
  | { kind: 'weaponBleed'; share: number; ticks: number; periodMs: number }

export interface ProcSpec {
  id: string
  name: string
  icon: string
  trigger: ProcTrigger
  /**
   * Which attacks can trigger it: `weapon` = only the weapon the item or enchant is on (resolved
   * per hand at plan time), `mainHand`/`offHand`, or `any`.
   */
  from: 'weapon' | 'mainHand' | 'offHand' | 'any'
  /** Only attacks made with these weapon types (Weaponmaster swords). */
  weapons?: WeaponType[]
  chance: { ppm: number } | { pct: number }
  icdMs?: number
  action: ProcAction
  /**
   * Only while this aura is up (an aura id of the plan: a buff, or a bleed's marker on the target,
   * e.g. `rend` for Bloodthrill, warrior.md §2.8). A proc whose aura the plan doesn't have is left
   * out; while the aura is down, the proc isn't rolled.
   */
  requiresAura?: string
  /** Doc section that owns the numbers. */
  docRef: string
}
