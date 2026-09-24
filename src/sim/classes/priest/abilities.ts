// Shadow Priest spells and abilities as data (docs/classes/priest.md §3).
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), written out
// here so the app bundle doesn't carry the client dataset; data.test.ts checks each against it.
// These are the base rows: the build's talents (Shadow Focus, Improved Shadow Word: Pain, Improved
// Mind Blast, Improved Mind Flay, Twin Disciplines, Mental Agility, Devouring Contagion) and
// Shadowform are applied by talents.ts. A rank learned below 60 grows by its per-level points, and a
// range is base × (1 ± variance / 2), as the paladin's (paladin.md#conventions-used-below).
import { CRIT_MULTIPLIER, GCD_MS } from '../../core/formulas'
import type { AuraSpec } from '../../effects/types'
import { type AbilityDef, CASTER_ROW, type SpellDef } from '../../plan/types'
import { atLevel60, spread } from '../paladin/spells'

/** Base mana at level 60 [F] (PlayerExpectedStat.BaseMana, 1.60.1.69913; docs/mechanics/spells.md §8). */
export const PRIEST_BASE_MANA = 1376

/** A mana cost as a row's `costTenths` (paid from mana: `resource: 'mana'`, in tenths). */
const mana = (cost: number) => ({ costTenths: 10 * cost })

/**
 * What every priest ability starts from: the caster core's row, mana, the 1.5 s GCD (category 133).
 * Any of them with a cost uses Inner Focus's charge (the plan's free-cast aura) and casts free.
 */
const PRIEST = {
  ...CASTER_ROW,
  resource: 'mana',
  clearcastable: true,
  costTenths: 0,
  cooldownMs: 0,
  gcdMs: GCD_MS,
  castMs: 0,
  offHand: false,
  aura: null,
} as const

/**
 * What every priest damage spell starts from: the magic class (DefenseType 1: the spell table,
 * combat-tables §9), spell crit ×1.5, triggering procs as a spell you cast does, no talents.
 */
const SPELL = {
  defense: 'magic',
  noActiveDefense: false,
  alwaysHit: false,
  triggersProcs: true,
  min: 0,
  max: 0,
  weaponPercent: 0,
  normalized: false,
  spCoefficient: 0,
  critMultiplier: CRIT_MULTIPLIER.spell,
  bonusCrit: 0,
  damageMult: 1,
  threatMult: 1,
  threatBonus: 0,
  takenScale: 0,
} as const

// --- Shadow Word: Pain (docs/classes/priest.md#31-shadow-word-pain-r8-10894) ------------------------

/**
 * Shadow Word: Pain r8 (10894) [F] [client] (SpellEffect, SpellMisc, SpellPower, SpellDuration,
 * 1.60.1.69913): a pure DoT, aura 3, 127 Shadow every 3 s for 18 s (6 ticks; Classic Era 142),
 * coefficient 0.2 a tick (Classic Era 0.167), and the periodic-crit flag (Attributes[8] 0x200). Its one
 * effect is damage, so it's partially resisted on each tick, not binary (docs/mechanics/spells.md §3).
 */
export const SHADOW_WORD_PAIN_SPELL: SpellDef = {
  ...SPELL,
  id: 'shadowWordPain',
  name: 'Shadow Word: Pain',
  icon: 'spell_shadow_shadowwordpain',
  school: 'shadow',
  dotTicks: 6,
  dotTickMs: 3000,
  dotTickDamage: 127,
  dotSpCoefficient: 0.2,
  dotCanCrit: true,
}

/** Its marker on the boss: up from the application until the last tick (docs/mechanics/spells.md §7). */
export const SHADOW_WORD_PAIN_AURA: AuraSpec = { id: 'shadowWordPain', name: 'Shadow Word: Pain', durationMs: 18000, mods: {} }

/** Shadow Word: Pain r8: 470 mana, instant, on the GCD [F] [client] (SpellPower, SpellCooldowns, 1.60.1.69913). */
export const SHADOW_WORD_PAIN: AbilityDef = {
  ...PRIEST,
  id: 'shadowWordPain',
  name: 'Shadow Word: Pain',
  icon: 'spell_shadow_shadowwordpain',
  kind: 'spell',
  ...mana(470),
  aura: SHADOW_WORD_PAIN_AURA,
  spellDef: SHADOW_WORD_PAIN_SPELL,
}

// --- Mind Blast (docs/classes/priest.md#32-mind-blast-r9-10947) ------------------------------------

/**
 * Mind Blast r9 (10947) [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913): 485 base points,
 * variance 0.054158606, +2.6 a level from 58 to 63, so 477.07–503.33 at 60 (the tooltip's 477 to 503;
 * Classic Era 508–536), coefficient 0.429, Shadow. Pure damage: partially resisted.
 */
const [MB_MIN, MB_MAX] = spread(485, 0.054158606)
const MB_GROWTH = atLevel60(0, 2.6, 58, 63)
export const MIND_BLAST_SPELL: SpellDef = {
  ...SPELL,
  id: 'mindBlast',
  name: 'Mind Blast',
  icon: 'spell_shadow_unholyfrenzy',
  school: 'shadow',
  min: MB_MIN + MB_GROWTH,
  max: MB_MAX + MB_GROWTH,
  spCoefficient: 0.429,
}

/**
 * Mind Blast r9: 350 mana, a 1.5 s cast that casting speed shortens, an 8 s cooldown (category 19's
 * `CategoryRecoveryTime`), on the GCD [F] [client] (SpellPower, SpellCastTimes, SpellCooldowns,
 * 1.60.1.69913). Improved Mind Blast cuts the cooldown (talents.ts).
 */
export const MIND_BLAST: AbilityDef = {
  ...PRIEST,
  id: 'mindBlast',
  name: 'Mind Blast',
  icon: 'spell_shadow_unholyfrenzy',
  kind: 'spell',
  ...mana(350),
  cooldownMs: 8000,
  castMs: 1500,
  castHasted: true,
  spellDef: MIND_BLAST_SPELL,
}

// --- Mind Flay (docs/classes/priest.md#33-mind-flay-r6-18807) --------------------------------------

/**
 * Mind Flay r6 (18807) [F] [client] (SpellEffect, SpellMisc, SpellDuration, 1.60.1.69913): a channel
 * (Attributes[1] 0x4) whose ticks are its own periodic damage, aura 3, 130 Shadow a second for 3 s
 * (Classic Era 142), coefficient 0.167 a tick (Classic Era 0.15), the periodic-crit flag, and a 50%
 * slow (aura 33): an effect besides damage, so it's binary (docs/mechanics/spells.md §3). One hit roll
 * as it starts (§6).
 */
export const MIND_FLAY_SPELL: SpellDef = {
  ...SPELL,
  id: 'mindFlay',
  name: 'Mind Flay',
  icon: 'spell_shadow_siphonmana',
  school: 'shadow',
  binary: true,
  dotTicks: 3,
  dotTickMs: 1000,
  dotTickDamage: 130,
  dotSpCoefficient: 0.167,
  dotCanCrit: true,
}

/** Its marker on the boss while it channels, so the results show its uptime (docs/mechanics/spells.md §7). */
export const MIND_FLAY_AURA: AuraSpec = { id: 'mindFlay', name: 'Mind Flay', durationMs: 3000, mods: {} }

/**
 * Mind Flay r6: 205 mana, paid as it starts, channeled for 3 s, holding the GCD and every other cast
 * [F] [client] (SpellPower, 1.60.1.69913; docs/mechanics/spells.md §6). Casting speed doesn't shorten
 * it [?]. The rotation may cut it off after fewer ticks (`channelTicks`).
 */
export const MIND_FLAY: AbilityDef = {
  ...PRIEST,
  id: 'mindFlay',
  name: 'Mind Flay',
  icon: 'spell_shadow_siphonmana',
  kind: 'channel',
  ...mana(205),
  aura: MIND_FLAY_AURA,
  spellDef: MIND_FLAY_SPELL,
}

// --- Devouring Plague (docs/classes/priest.md#34-devouring-plague-r6-19280) ------------------------

/**
 * Devouring Plague r6 (19280) [F] [client] (SpellEffect, SpellMisc, SpellDuration, 1.60.1.69913): a
 * pure DoT, aura 53 (its damage heals the caster, which the sim ignores), 106 Shadow every 3 s for
 * 24 s (8 ticks; Classic Era 113), coefficient 0.1 a tick, and **no** periodic-crit flag
 * (Attributes[8] 0). Every Forever priest has it: it's no longer the Undead's racial.
 */
export const DEVOURING_PLAGUE_SPELL: SpellDef = {
  ...SPELL,
  id: 'devouringPlague',
  name: 'Devouring Plague',
  icon: 'spell_shadow_devouringplague',
  school: 'shadow',
  dotTicks: 8,
  dotTickMs: 3000,
  dotTickDamage: 106,
  dotSpCoefficient: 0.1,
}

export const DEVOURING_PLAGUE_AURA: AuraSpec = { id: 'devouringPlague', name: 'Devouring Plague', durationMs: 24000, mods: {} }

/**
 * Devouring Plague r6: 985 mana, instant, a 1 min cooldown (category 691; Classic Era 3 min), on the
 * GCD [F] [client] (SpellPower, SpellCooldowns, 1.60.1.69913). Devouring Contagion halves the cost.
 */
export const DEVOURING_PLAGUE: AbilityDef = {
  ...PRIEST,
  id: 'devouringPlague',
  name: 'Devouring Plague',
  icon: 'spell_shadow_devouringplague',
  kind: 'spell',
  ...mana(985),
  cooldownMs: 60000,
  aura: DEVOURING_PLAGUE_AURA,
  spellDef: DEVOURING_PLAGUE_SPELL,
}

// --- Inner Focus and Vampiric Embrace (docs/classes/priest.md §3.5, §3.6) -------------------------

/**
 * Inner Focus (14751) [F] [client] (SpellEffect, SpellCooldowns, SpellAuraOptions, 1.60.1.69913): an
 * aura with one charge (`ProcCharges` 1) that makes the next spell cost nothing (aura 108, cost −100%)
 * and gives it +25% crit (aura 107, crit chance), a 3 min cooldown, off the GCD (no
 * `StartRecoveryTime`), no cost. It lasts until used; the aura's 3 min here is its cooldown's. The plan
 * makes it the free-cast aura (setup.ts `priestPlan`).
 */
export const INNER_FOCUS_AURA: AuraSpec = { id: 'innerFocus', name: 'Inner Focus', durationMs: 180000, mods: {} }
export const INNER_FOCUS_CRIT_PCT = 25
export const INNER_FOCUS: AbilityDef = {
  ...PRIEST,
  id: 'innerFocus',
  name: 'Inner Focus',
  icon: 'spell_frost_windwalkon',
  kind: 'cast',
  gcdMs: 0,
  cooldownMs: 180000,
  aura: INNER_FOCUS_AURA,
}

/**
 * Vampiric Embrace (15286) [F] [client] (SpellEffect, SpellCooldowns, SpellDuration, 1.60.1.69913): a
 * debuff on the boss for 30 s (Classic Era 1 min) that heals your party for 20% of your Shadow damage,
 * which a DPS sim ignores, 40 mana, a 1 min cooldown (Classic Era 10 s), on the GCD. It rolls spell hit.
 * It deals no damage, so it costs a GCD and gains nothing here.
 */
export const VAMPIRIC_EMBRACE: AbilityDef = {
  ...PRIEST,
  id: 'vampiricEmbrace',
  name: 'Vampiric Embrace',
  icon: 'spell_shadow_unsummonbuilding',
  kind: 'cast',
  ...mana(40),
  cooldownMs: 60000,
  spellHit: true,
  aura: { id: 'vampiricEmbrace', name: 'Vampiric Embrace', durationMs: 30000, mods: {} },
}

// --- Racials (docs/classes/priest.md#72-race-and-weapons) ------------------------------------------

/**
 * Starshards r7 (19305), the Night Elf priest's [F] [client] (SpellEffect, SpellMisc, SpellPower,
 * SpellCooldowns, SpellDuration, 1.60.1.69913): a channel, aura 3, 300 Arcane a second for 6 s (6 ticks;
 * Classic Era 936 in all, no cooldown), coefficient 0.167 a tick, the periodic-crit flag, 350 mana, a
 * 30 s cooldown, on the GCD. Pure damage: partially resisted on each tick.
 */
export const STARSHARDS_SPELL: SpellDef = {
  ...SPELL,
  id: 'starshards',
  name: 'Starshards',
  icon: 'spell_arcane_starfire',
  school: 'arcane',
  dotTicks: 6,
  dotTickMs: 1000,
  dotTickDamage: 300,
  dotSpCoefficient: 0.167,
  dotCanCrit: true,
}
export const STARSHARDS: AbilityDef = {
  ...PRIEST,
  id: 'starshards',
  name: 'Starshards',
  icon: 'spell_arcane_starfire',
  kind: 'channel',
  ...mana(350),
  cooldownMs: 30000,
  aura: { id: 'starshards', name: 'Starshards', durationMs: 6000, mods: {} },
  spellDef: STARSHARDS_SPELL,
}

/**
 * Dark Sacrifice r5 (1277328), the Undead priest's, new in Forever [F] [client] (SpellEffect,
 * SpellCooldowns, SpellDuration, 1.60.1.69913): 320 mana every 3 s for 15 s (aura 24 at 320 + 1 a level
 * from 60), 1,600 in all, paid with the same health (aura 3), which the sim doesn't track; a 10 min
 * cooldown, on the GCD, no mana cost. Its mana comes as the cast's ticks (`rageTicks` into mana).
 */
export const DARK_SACRIFICE_TICK = atLevel60(320, 1, 60, 68)
export const DARK_SACRIFICE: AbilityDef = {
  ...PRIEST,
  id: 'darkSacrifice',
  name: 'Dark Sacrifice',
  icon: 'spell_holy_powerinfusion_shadow',
  kind: 'cast',
  cooldownMs: 600000,
  rageTickTenths: 10 * DARK_SACRIFICE_TICK,
  rageTicks: 5,
  rageTickMs: 3000,
  aura: { id: 'darkSacrifice', name: 'Dark Sacrifice', durationMs: 15000, mods: {} },
}
