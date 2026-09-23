// Druid forms at level 60 (docs/classes/druid.md §2.1, §2.2, §3.11, §4.7, §4.8;
// docs/mechanics/character-stats.md#druid-forms): the form's own weapon, attack power, armor,
// health and threat. The plan builder turns them into one stat block and one main hand per form
// (plan/types.ts FormPlan), and a shapeshift swaps them in.
import { glanceRange, PLAYER_LEVEL } from '../../core/attack-table'
import type { DruidForm, Effect } from '../../effects/types'
import type { WeaponPlan } from '../../plan/types'
import type { RulesProfile } from '../../rules/profiles'

const DOC = 'docs/classes/druid.md'

/** A druid's forms in `Plan.forms` order (the caster form first). */
export const DRUID_FORMS: readonly DruidForm[] = ['caster', 'cat', 'bear']

/** Index of each form in `Plan.forms` for a druid. */
export const FORM_INDEX: Record<DruidForm, number> = { caster: 0, cat: 1, bear: 2 }

/** A form's bit in an ability's or a proc's `forms` mask. */
export const formBit = (...forms: DruidForm[]) => forms.reduce((mask, f) => mask | (1 << FORM_INDEX[f]), 0)

export const FORM_NAME: Record<DruidForm, string> = { caster: 'Caster form', cat: 'Cat Form', bear: 'Dire Bear Form' }
export const FORM_ICON: Record<DruidForm, string> = { caster: 'spell_nature_regeneration', cat: 'ability_druid_catform', bear: 'ability_racial_bearform' }

/**
 * Swing time of the form's attacks, `SpellShapeshiftForm.CombatRoundTime`: cat 1000 ms, Bear and
 * Dire Bear 2500 ms [F] [C] (druid.md §2.1).
 */
export const FORM_SWING_MS = { cat: 1000, bear: 2500 } as const

/**
 * The form weapon's damage per second at level 60, 54.8 [?]: only a secondary source gives it
 * (druid.md §2.1, Q5). Its range is ±20% of the average, `DamageVariance` 0.40 [F] [C].
 */
export const FORM_DPS = 54.8
export const FORM_DAMAGE_VARIANCE = 0.4

/** The form weapon's damage range: cat 43.84–65.76, dire bear 109.6–164.4 [?] (druid.md §2.1, Q5). */
export function formWeaponRange(form: 'cat' | 'bear'): { min: number; max: number } {
  const average = (FORM_DPS * FORM_SWING_MS[form]) / 1000
  return { min: average * (1 - FORM_DAMAGE_VARIANCE / 2), max: average * (1 + FORM_DAMAGE_VARIANCE / 2) }
}

/**
 * Cat Form's attack power, 12 + 2 per level from level 6 (3025 effect 0), which is 120 at 60 [F]
 * (druid.md §2.2).
 */
export const catFormAp = (level: number) => 12 + 2 * (level - 6)

/** Dire Bear Form's attack power, 120 + 3 per level from level 40, capped at 70: 180 at 60 [F] [C] (druid.md §2.2). */
export const direBearAp = (level: number) => 120 + 3 * (Math.min(level, 70) - 40)

/** Dire Bear Form's health, 600 + 32 per level from level 40: 1,240 at 60 [F] [C] (character-stats.md#druid-forms). */
export const direBearHealth = (level: number) => 600 + 32 * (Math.min(level, 70) - 40)

/** Dire Bear Form's item armor bonus, +360% (aura 142) [F] [C] (druid.md §4.7). */
export const DIRE_BEAR_ITEM_ARMOR_PCT = 360

/**
 * Forever's second Dire Bear armor aura, 466 ("bonus armor" +360%), which the Classic Era client
 * doesn't have: whether it multiplies bonus armor is [?] (druid.md §4.7, character-stats.md OQ-8).
 */
export const DIRE_BEAR_BONUS_ARMOR_PCT = 360

/** Threat in the forms: Cat Form −29% (3025 effect 1), Bear Form +30% (21178) [F] (druid.md §3.11, §4.8). */
export const FORM_THREAT_PCT = { cat: -29, bear: 30 } as const

/**
 * The forms' own passives, each bound to its form (druid.md §2.2, §3.11, §4.7, §4.8): Cat Form's
 * attack power, 1 attack power per Agility (aura 598) and threat; Dire Bear Form's attack power,
 * armor, health and threat. The bonus-armor aura is Forever's; Classic Era's Dire Bear Form has
 * only the item-armor one.
 */
export function formEffects(profile: RulesProfile, level = PLAYER_LEVEL): Effect[] {
  const cat = { form: ['cat'] } as const
  const bear = { form: ['bear'] } as const
  return [
    { kind: 'stat', stat: 'ap', value: catFormAp(level), when: cat },
    { kind: 'stat', stat: 'apPerAgi', value: 1, when: cat },
    { kind: 'threat', pct: FORM_THREAT_PCT.cat, when: cat },
    { kind: 'stat', stat: 'ap', value: direBearAp(level), when: bear },
    { kind: 'itemArmorPct', pct: DIRE_BEAR_ITEM_ARMOR_PCT, when: bear },
    ...(profile.catalogue.column === 'classicEra' ? [] : [{ kind: 'bonusArmorPct', pct: DIRE_BEAR_BONUS_ARMOR_PCT, when: bear } as const]),
    { kind: 'stat', stat: 'health', value: direBearHealth(level), when: bear },
    { kind: 'threat', pct: FORM_THREAT_PCT.bear, when: bear },
  ]
}

/**
 * The main hand in an animal form (druid.md §2.1, §8 "Form swap"): the form's damage and speed
 * replace the weapon's, and its instant attacks use that speed, unnormalized [?]. What the
 * equipped weapon adds besides its damage (crit and hit from its enchants and effects) carries
 * over from `equipped`; flat weapon damage (a sharpening stone, Superior Striking) is weapon
 * damage, so it doesn't [?] (Q25). The attacks count as one-handed for Forever's normalized rage
 * (8.65 per landed bear swing [?], rage.md#bear-druid-rage), and use the level's base skill: items'
 * weapon skill doesn't apply in form [?] (Q28).
 */
export function formWeapon(form: 'cat' | 'bear', equipped: WeaponPlan | null, profile: RulesProfile, bossLevel: number): WeaponPlan {
  const { min, max } = formWeaponRange(form)
  const speedSec = FORM_SWING_MS[form] / 1000
  const skill = 5 * PLAYER_LEVEL
  const [glanceLow, glanceHigh] = glanceRange(profile, bossLevel, skill)
  return {
    name: 'Main hand',
    icon: FORM_ICON[form],
    min,
    max,
    speedSec,
    twoHand: false,
    flatDamage: 0,
    handMult: 1,
    skill,
    hitBonus: equipped?.hitBonus ?? 0,
    critBonus: equipped?.critBonus ?? 0,
    armorPenPct: equipped?.armorPenPct ?? 0,
    rageMult: 1,
    glanceLow,
    glanceHigh,
    normalizedSpeed: speedSec,
  }
}

export const FORMS_DOC = `${DOC}#21-form-attacks-swing-timer-and-damage`
