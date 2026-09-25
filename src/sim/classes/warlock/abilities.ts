// Warlock spells, curses and buffs as data (docs/classes/warlock.md §3).
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), written out here
// so the app bundle doesn't carry the client dataset; warlock.test.ts checks each against it. These are
// the base rows, the top rank a level-60 warlock learns: the build's talents are applied by talents.ts.
// A range is base × (1 ± variance / 2), plus a rank's per-level points up to 60 (paladin.md#conventions-used-below).
import { CRIT_MULTIPLIER, GCD_MS } from '../../core/formulas'
import type { AuraSpec, OnUseSpec, ProcSpec } from '../../effects/types'
import { type AbilityDef, CASTER_ROW, MAGIC_SCHOOLS, schoolMask, type SpellDef } from '../../plan/types'
import { atLevel60, spread } from '../paladin/spells'

export const DOC = 'docs/classes/warlock.md'

/** A mana cost as a row's `costTenths` (paid from mana, in tenths). */
const mana = (cost: number) => ({ costTenths: 10 * cost })

/** What every warlock ability starts from: the caster core's row, mana, the 1.5 s GCD, no aura (docs/mechanics/spells.md §12). */
export const WARLOCK = {
  ...CASTER_ROW,
  resource: 'mana',
  costTenths: 0,
  cooldownMs: 0,
  gcdMs: GCD_MS,
  castMs: 0,
  offHand: false,
  aura: null,
} as const

/**
 * What every warlock damage spell starts from: the magic class (DefenseType 1, the spell table,
 * combat-tables §9), spell crit ×1.5, triggering procs as a spell you cast does, no talents.
 */
const SPELL = {
  defense: 'magic',
  noActiveDefense: false,
  alwaysHit: false,
  triggersProcs: true,
  weaponPercent: 0,
  normalized: false,
  critMultiplier: CRIT_MULTIPLIER.spell,
  bonusCrit: 0,
  damageMult: 1,
  threatMult: 1,
  threatBonus: 0,
  takenScale: 0,
  min: 0,
  max: 0,
  spCoefficient: 0,
} as const

/** A rank's range at level 60: base × (1 ± variance / 2), plus its per-level points up to 60. */
const range = (base: number, variance: number, perLevel = 0, baseLevel = 60, maxLevel = 60) => {
  const grow = atLevel60(0, perLevel, baseLevel, maxLevel)
  const [min, max] = spread(base, variance)
  return { min: min + grow, max: max + grow }
}

// --- Destruction (warlock.md §3.1) ----------------------------------------------------------------

/**
 * Shadow Bolt r9 (11661), the trainer's top rank (r10 is an Ahn'Qiraj book, D36; warlock.md §3.1): 251
 * base points, variance 0.10810811, so 237.43–264.57 (the tooltip's 237–265; Classic Era's 455–507),
 * coefficient 0.857, Shadow; 370 mana, a 3 s cast [F] [client] (SpellEffect, SpellPower, SpellMisc,
 * 1.60.1.70009). Its travel time isn't simulated.
 */
export const SHADOW_BOLT_SPELL: SpellDef = {
  ...SPELL,
  id: 'shadowBolt',
  name: 'Shadow Bolt',
  icon: 'spell_shadow_shadowbolt',
  school: 'shadow',
  ...range(251, 0.10810811),
  spCoefficient: 0.857,
}
export const SHADOW_BOLT: AbilityDef = { ...WARLOCK, id: 'shadowBolt', name: 'Shadow Bolt', icon: 'spell_shadow_shadowbolt', kind: 'spell', ...mana(370), castMs: 3000, castHasted: true, spellDef: SHADOW_BOLT_SPELL }

/** Immolate's marker on the boss (its DoT's aura, docs/mechanics/spells.md §7): Conflagrate needs it, Incinerate reads it. */
export const IMMOLATE_AURA: AuraSpec = { id: 'immolate', name: 'Immolate', durationMs: 15000, mods: {} }

/**
 * Immolate r7 (11668), the trainer's top rank (r8 is an Ahn'Qiraj book, D36): 146 Fire at coefficient
 * 0.2 (#1), then 52 every 3 s for 15 s at 0.13 a tick (#0; Classic Era 258 and 97), with the
 * periodic-crit flag (SpellMisc Attributes[8] 0x200); 370 mana, a 2 s cast [F] [client] (SpellEffect,
 * SpellMisc, SpellDuration, 1.60.1.70009).
 */
export const IMMOLATE_SPELL: SpellDef = {
  ...SPELL,
  id: 'immolate',
  name: 'Immolate',
  icon: 'spell_fire_immolation',
  school: 'fire',
  min: 146,
  max: 146,
  spCoefficient: 0.2,
  dotTicks: 5,
  dotTickMs: 3000,
  dotTickDamage: 52,
  dotSpCoefficient: 0.13,
  dotCanCrit: true,
}
export const IMMOLATE: AbilityDef = {
  ...WARLOCK,
  id: 'immolate',
  name: 'Immolate',
  icon: 'spell_fire_immolation',
  kind: 'spell',
  ...mana(370),
  castMs: 2000,
  castHasted: true,
  spellDef: IMMOLATE_SPELL,
  aura: IMMOLATE_AURA,
}

/**
 * Conflagrate r6 (18932): 282 base points, variance 0.21912351, so 251.10–312.90 (the tooltip's
 * 251–313), coefficient 0.429, Fire; 255 mana, a 10 s cooldown (category 672), instant; usable only on
 * a target with your Immolate (`targetAuraSpell` 1282590), which it consumes [F] [client] (SpellEffect,
 * SpellCooldowns, SpellAuraRestrictions, 1.60.1.69913). A talent (Classic Era's 18932 is its rank 4, 447–557).
 */
export const CONFLAGRATE_SPELL: SpellDef = {
  ...SPELL,
  id: 'conflagrate',
  name: 'Conflagrate',
  icon: 'spell_fire_fireball',
  school: 'fire',
  ...range(282, 0.21912351),
  spCoefficient: 0.429,
}
export const CONFLAGRATE: AbilityDef = {
  ...WARLOCK,
  id: 'conflagrate',
  name: 'Conflagrate',
  icon: 'spell_fire_fireball',
  kind: 'spell',
  ...mana(255),
  cooldownMs: 10000,
  spellDef: CONFLAGRATE_SPELL,
  needsAuraId: IMMOLATE_AURA.id,
  consumesDotOf: { spell: IMMOLATE_SPELL.id, chance: 1 },
}

/**
 * Incinerate r3 (1293813), new in Forever: 217 base points, variance 0.15, so 200.73–233.28 (the
 * tooltip's 201–233), coefficient 0.714, Fire, "an additional 25% damage if the target is afflicted by
 * Immolate" (#1, a dummy of 25) [?] (warlock.md Q3); 325 mana, a 2.5 s cast [F] [client] (SpellEffect,
 * SpellPower, SpellMisc, 1.60.1.69913).
 */
export const INCINERATE_SPELL: SpellDef = {
  ...SPELL,
  id: 'incinerate',
  name: 'Incinerate',
  icon: 'spell_fire_burnout',
  school: 'fire',
  ...range(217, 0.15),
  spCoefficient: 0.714,
  boost: { aura: IMMOLATE_AURA.id, pct: 25, keep: true },
}
export const INCINERATE: AbilityDef = { ...WARLOCK, id: 'incinerate', name: 'Incinerate', icon: 'spell_fire_burnout', kind: 'spell', ...mana(325), castMs: 2500, castHasted: true, spellDef: INCINERATE_SPELL }

/**
 * Searing Pain r6 (17923): 114 base points, variance 0.16216215, +1.2 a level from 58, so 107.16–125.64
 * at 60 (the tooltip's 107–125 at 58), coefficient 0.429, Fire; 168 mana, a 1.5 s cast [F] [client]
 * (SpellEffect, SpellPower, SpellMisc, SpellLevels, 1.60.1.69913). "Causes a high amount of threat":
 * the warlock's threat isn't a DPS result, so its damage makes plain damage threat (warlock.md §11.3).
 * The sim casts it for Demonic Brand, Demonology's row (§6.4); its brand is `demonicBrand` (demons.ts).
 */
export const SEARING_PAIN_SPELL: SpellDef = {
  ...SPELL,
  id: 'searingPain',
  name: 'Searing Pain',
  icon: 'spell_fire_soulburn',
  school: 'fire',
  ...range(114, 0.16216215, 1.2, 58, 64),
  spCoefficient: 0.429,
}
export const SEARING_PAIN: AbilityDef = { ...WARLOCK, id: 'searingPain', name: 'Searing Pain', icon: 'spell_fire_soulburn', kind: 'spell', ...mana(168), castMs: 1500, castHasted: true, spellDef: SEARING_PAIN_SPELL }

/**
 * Shadowburn r6 (18871), a talent: 266 base points, variance 0.1092437, +1.8 a level from 56, so
 * 258.67–288.33 at 60 (the tooltip's 258–288), coefficient 0.429, Shadow; 365 mana, a 15 s cooldown
 * (category 651), instant [F] [client] (SpellEffect, SpellLevels, SpellCooldowns, 1.60.1.69913). Its
 * Soul Shard isn't tracked (warlock.md Q6).
 */
export const SHADOWBURN_SPELL: SpellDef = {
  ...SPELL,
  id: 'shadowburn',
  name: 'Shadowburn',
  icon: 'spell_shadow_scourgebuild',
  school: 'shadow',
  ...range(266, 0.1092437, 1.8, 56, 62),
  spCoefficient: 0.429,
}
export const SHADOWBURN: AbilityDef = { ...WARLOCK, id: 'shadowburn', name: 'Shadowburn', icon: 'spell_shadow_scourgebuild', kind: 'spell', ...mana(365), cooldownMs: 15000, spellDef: SHADOWBURN_SPELL }

// --- Affliction (warlock.md §3.2) -----------------------------------------------------------------

export const CORRUPTION_AURA: AuraSpec = { id: 'corruption', name: 'Corruption', durationMs: 18000, mods: {} }

/**
 * Corruption r6 (11672), the trainer's top rank (r7 is an Ahn'Qiraj book, D36): 57 Shadow every 3 s for
 * 18 s at 0.2 a tick (Classic Era 111 at 0.167), with the periodic-crit flag; 290 mana, a 2 s cast (Improved Corruption's −2 s makes it instant) [F]
 * [client] (SpellEffect, SpellMisc, SpellDuration, 1.60.1.70009).
 */
export const CORRUPTION_SPELL: SpellDef = {
  ...SPELL,
  id: 'corruption',
  name: 'Corruption',
  icon: 'spell_shadow_abominationexplosion',
  school: 'shadow',
  dotTicks: 6,
  dotTickMs: 3000,
  dotTickDamage: 57,
  dotSpCoefficient: 0.2,
  dotCanCrit: true,
}
export const CORRUPTION: AbilityDef = {
  ...WARLOCK,
  id: 'corruption',
  name: 'Corruption',
  icon: 'spell_shadow_abominationexplosion',
  kind: 'spell',
  ...mana(290),
  castMs: 2000,
  castHasted: true,
  spellDef: CORRUPTION_SPELL,
  aura: CORRUPTION_AURA,
}

export const BANE_OF_AGONY_AURA: AuraSpec = { id: 'baneOfAgony', name: 'Bane of Agony', durationMs: 24000, mods: {} }

/**
 * Bane of Agony r6 (11713), Forever's Curse of Agony, now a Bane beside your curse: 46 Shadow every 2 s
 * for 24 s at 0.133 a tick (Classic Era's Curse of Agony: 87 at 0.083), 552 in all, with the
 * periodic-crit flag; 215 mana, instant [F] [client] (SpellEffect, SpellMisc, SpellDuration,
 * 1.60.1.69913). Its ramp (weak early ticks, strong late ones) is server-side: the sim deals the
 * average each tick [?] (warlock.md Q4).
 */
export const BANE_OF_AGONY_SPELL: SpellDef = {
  ...SPELL,
  id: 'baneOfAgony',
  name: 'Bane of Agony',
  icon: 'spell_shadow_curseofsargeras',
  school: 'shadow',
  dotTicks: 12,
  dotTickMs: 2000,
  dotTickDamage: 46,
  dotSpCoefficient: 0.133,
  dotCanCrit: true,
}
export const BANE_OF_AGONY: AbilityDef = {
  ...WARLOCK,
  id: 'baneOfAgony',
  name: 'Bane of Agony',
  icon: 'spell_shadow_curseofsargeras',
  kind: 'spell',
  ...mana(215),
  spellDef: BANE_OF_AGONY_SPELL,
  aura: BANE_OF_AGONY_AURA,
}

export const BANE_OF_DOOM_AURA: AuraSpec = { id: 'baneOfDoom', name: 'Bane of Doom', durationMs: 60000, mods: {} }

/**
 * Bane of Doom (603), Forever's Curse of Doom: 1742 Shadow after 1 min at coefficient 4 (one periodic
 * tick at 60 s; Classic Era's Curse of Doom 3200 at 1), with the periodic-crit flag; 300 mana, a 1 min
 * cooldown, instant [F] [client] (SpellEffect, SpellMisc, SpellCooldowns, 1.60.1.69913). Only one Bane
 * per warlock: a rotation casts one or the other.
 */
export const BANE_OF_DOOM_SPELL: SpellDef = {
  ...SPELL,
  id: 'baneOfDoom',
  name: 'Bane of Doom',
  icon: 'spell_shadow_auraofdarkness',
  school: 'shadow',
  dotTicks: 1,
  dotTickMs: 60000,
  dotTickDamage: 1742,
  dotSpCoefficient: 4,
  dotCanCrit: true,
}
export const BANE_OF_DOOM: AbilityDef = {
  ...WARLOCK,
  id: 'baneOfDoom',
  name: 'Bane of Doom',
  icon: 'spell_shadow_auraofdarkness',
  kind: 'spell',
  ...mana(300),
  cooldownMs: 60000,
  spellDef: BANE_OF_DOOM_SPELL,
  aura: BANE_OF_DOOM_AURA,
}

export const SIPHON_LIFE_AURA: AuraSpec = { id: 'siphonLife', name: 'Siphon Life', durationMs: 30000, mods: {} }

/**
 * Siphon Life r4 (18881), a talent: 41 Shadow every 3 s for 30 s at 0.05 a tick (Classic Era 45), and
 * no periodic-crit flag, so its ticks never crit; 365 mana, instant [F] [client] (SpellEffect,
 * SpellMisc, 1.60.1.69913). Its healing isn't simulated.
 */
export const SIPHON_LIFE_SPELL: SpellDef = {
  ...SPELL,
  id: 'siphonLife',
  name: 'Siphon Life',
  icon: 'spell_shadow_requiem',
  school: 'shadow',
  dotTicks: 10,
  dotTickMs: 3000,
  dotTickDamage: 41,
  dotSpCoefficient: 0.05,
}
export const SIPHON_LIFE: AbilityDef = {
  ...WARLOCK,
  id: 'siphonLife',
  name: 'Siphon Life',
  icon: 'spell_shadow_requiem',
  kind: 'spell',
  ...mana(365),
  spellDef: SIPHON_LIFE_SPELL,
  aura: SIPHON_LIFE_AURA,
}

// --- Curses, Life Tap and buffs (warlock.md §3.3) ---------------------------------------------------

/**
 * Curse of the Elements r4 (1311680), your own debuff: +10% damage taken from every magic school,
 * Holy included (#1, aura 87, mask 126), −75 magic resistance (#0, which changes nothing on a boss,
 * docs/mechanics/spells.md §3); 5 min; 200 mana, instant [F] [client] (SpellEffect, SpellPower,
 * SpellDuration, 1.60.1.69913). It rolls spell hit; a resist isn't rolled [?] (warlock.md Q7).
 */
export const CURSE_OF_THE_ELEMENTS_AURA: AuraSpec = {
  id: 'curseOfTheElements',
  name: 'Curse of the Elements',
  durationMs: 300000,
  mods: { schoolMask: schoolMask(MAGIC_SCHOOLS), schoolTaken: 10 },
}
export const CURSE_OF_THE_ELEMENTS: AbilityDef = {
  ...WARLOCK,
  id: 'curseOfTheElements',
  name: 'Curse of the Elements',
  icon: 'spell_shadow_chilltouch',
  kind: 'cast',
  ...mana(200),
  spellHit: true,
  aura: CURSE_OF_THE_ELEMENTS_AURA,
}

/** Life Tap r6's mana before Spirit: 420 base points, +1 a level from 56, so 424 at 60 [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913). */
export const LIFE_TAP_BASE = atLevel60(420, 1, 56, 66)

/**
 * Life Tap r6 (11689): "Converts 424 health into 424 Mana … Mana gained is increased by your Spirit",
 * `${($m1+$SPI*1)*(1+$18182m1/100)}`: 424 + Spirit, × Improved Life Tap's 10% a rank [F] [client]
 * (Spell, SpellEffect, 1.60.1.69913). Instant, on the GCD, no mana cost. Its health cost, and the
 * threat of its mana, aren't simulated (warlock.md §3.3). Spirit is the sheet's at the pull.
 */
export const lifeTap = (spirit: number, improvedRank: number): AbilityDef => ({
  ...WARLOCK,
  id: 'lifeTap',
  name: 'Life Tap',
  icon: 'spell_shadow_burningspirit',
  kind: 'cast',
  manaTenths: Math.floor(10 * (LIFE_TAP_BASE + spirit) * (1 + (10 * improvedRank) / 100) + 1e-9),
  noThreat: true,
})

/** Demonic Sacrifice's buff (warlock.md §3.4): the demon given up, and what it grants for 2 h. */
export type Sacrifice = 'imp' | 'succubus' | 'voidwalker' | 'none'

/**
 * Demonic Sacrifice (18788) sacrifices your demon for a buff that lasts 2 h [F] [client] (SpellEffect,
 * SpellDuration, 1.60.1.69913), Forever's swapped from Classic Era's: the Imp's Burning Shadow (18789)
 * is +15% Shadow damage (aura 79, mask 32; Classic Era Fire), the Succubus's Touch of Fire (18791) +15%
 * Fire (mask 4; Classic Era Shadow), the Voidwalker's Fel Energy (18792) 2% of maximum mana every 4 s
 * (aura 21; Classic Era the Felhunter's). It's cast before the pull, with no pet (the pet core comes later).
 */
export function demonicSacrifice(sacrifice: Exclude<Sacrifice, 'none'>, maxMana: number): AbilityDef {
  const base = { ...WARLOCK, kind: 'cast' as const, gcdMs: 0, noThreat: true, icon: 'spell_shadow_psychicscream' }
  if (sacrifice === 'voidwalker') {
    return {
      ...base,
      id: 'demonicSacrifice',
      name: 'Demonic Sacrifice',
      aura: { id: 'felEnergy', name: 'Fel Energy', durationMs: 7200000, mods: {} },
      // 2% of maximum mana every 4 s, in whole tenths, for the buff's 2 h (its ticks after the fight never run).
      rageTickTenths: Math.floor(10 * 0.02 * maxMana + 1e-9),
      rageTicks: 1800,
      rageTickMs: 4000,
    }
  }
  const school = sacrifice === 'imp' ? 'shadow' : 'fire'
  return {
    ...base,
    id: 'demonicSacrifice',
    name: 'Demonic Sacrifice',
    aura: {
      id: sacrifice === 'imp' ? 'burningShadow' : 'touchOfFire',
      name: sacrifice === 'imp' ? 'Burning Shadow' : 'Touch of Fire',
      durationMs: 7200000,
      mods: { schoolMask: schoolMask([school]), schoolDamage: 15 },
    },
  }
}

/** Demonic Sacrifice goes up before the pull (warlock.md §6). */
export const PREPULL_SACRIFICE_MS = -3000

/**
 * Improved Shadow Bolt's debuff, Shadow Vulnerability (17794), your own: +4% a rank Shadow damage taken
 * from you (aura 270, the caster's own, as Forever's Shadow Weaving), 12 s, with no charges (Classic
 * Era's 17800: +20% for anyone, 4 charges) [F] [client] (SpellEffect, SpellAuraOptions, 1.60.1.69913).
 */
export const shadowVulnerability = (rank: number): AuraSpec => ({
  id: 'shadowVulnerability',
  name: 'Shadow Vulnerability',
  durationMs: 12000,
  mods: { schoolMask: schoolMask(['shadow']), schoolTaken: 4 * rank },
})

/** Improved Shadow Bolt (17793): a Shadow Bolt crit puts Shadow Vulnerability on the boss, 100% (ProcChance 100) [F]. */
export const improvedShadowBoltProc = (rank: number): ProcSpec => ({
  id: 'improvedShadowBolt',
  name: 'Improved Shadow Bolt',
  icon: 'spell_shadow_shadowbolt',
  trigger: 'spellCrit',
  from: 'any',
  chance: { pct: 100 },
  fromSpell: SHADOW_BOLT_SPELL.id,
  action: { kind: 'aura', aura: shadowVulnerability(rank) },
  docRef: `${DOC}#41-destruction`,
})

/** Shadow Trance (17941): the next Shadow Bolt's cast time −100% (aura 108, mask 1), 10 s [F] [client] (SpellEffect, SpellDuration, 1.60.1.69913). */
export const SHADOW_TRANCE: AuraSpec = { id: 'shadowTrance', name: 'Shadow Trance', durationMs: 10000, mods: {} }

/**
 * Nightfall (18094): each Corruption tick has a 2% chance a rank to put up Shadow Trance [F] (its
 * tooltip; the rate per tick is Classic Era's rule [C], warlock.md Q5). Drain Life, Drain Soul and
 * Wrack would too; the sim casts none of them.
 */
export const nightfallProc = (rank: number): ProcSpec => ({
  id: 'nightfall',
  name: 'Nightfall',
  icon: 'spell_shadow_twilight',
  trigger: 'spellTick',
  from: 'any',
  chance: { pct: 2 * rank },
  fromSpell: CORRUPTION_SPELL.id,
  action: { kind: 'aura', aura: SHADOW_TRANCE },
  docRef: `${DOC}#42-affliction`,
})

/**
 * Shadow and Flame (426316): a Conflagrate that lands gives +2% a rank Shadow damage for 20 s (1293816,
 * aura 79, mask 32), and a Shadowburn +2% a rank Fire damage for 20 s [F] (its tooltip; the Fire buff's
 * spell isn't in the client files, warlock.md Q8).
 */
export const shadowAndFlameProcs = (rank: number): ProcSpec[] => [
  {
    id: 'shadowAndFlameShadow',
    name: 'Shadow and Flame',
    icon: 'spell_shadow_shadowandflame',
    trigger: 'spellLanded',
    from: 'any',
    chance: { pct: 100 },
    fromSpell: CONFLAGRATE_SPELL.id,
    action: { kind: 'aura', aura: { id: 'shadowAndFlameShadow', name: 'Shadow and Flame (Shadow)', durationMs: 20000, mods: { schoolMask: schoolMask(['shadow']), schoolDamage: 2 * rank } } },
    docRef: `${DOC}#41-destruction`,
  },
  {
    id: 'shadowAndFlameFire',
    name: 'Shadow and Flame',
    icon: 'spell_shadow_shadowandflame',
    trigger: 'spellLanded',
    from: 'any',
    chance: { pct: 100 },
    fromSpell: SHADOWBURN_SPELL.id,
    action: { kind: 'aura', aura: { id: 'shadowAndFlameFire', name: 'Shadow and Flame (Fire)', durationMs: 20000, mods: { schoolMask: schoolMask(['fire']), schoolDamage: 2 * rank } } },
    docRef: `${DOC}#41-destruction`,
  },
]

/** An on-use item or consumable as a warlock `cast`: no cost, its cooldown, GCD and buff, its mana at once (buffs doc §3.5). */
export const consumable = (use: OnUseSpec): AbilityDef => ({
  ...WARLOCK,
  id: use.id,
  name: use.name,
  icon: use.icon,
  kind: 'cast',
  cooldownMs: use.cooldownMs,
  gcdMs: use.gcdMs,
  aura: use.aura,
  manaTenths: use.manaTenths ?? 0,
  manaSpreadTenths: use.manaSpreadTenths ?? 0,
})
