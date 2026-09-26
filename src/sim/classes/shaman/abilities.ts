// Shaman abilities, spells and weapon imbues as data (docs/classes/shaman.md).
//
// Numbers are the Forever client's (src/data/client/spells.json and SpellItemEnchantment, build
// 1.60.1.69913), written out here so the app bundle doesn't carry the client dataset; data.test.ts
// checks each against it. These are the base rows: the build's talents (Convection, Concussion,
// Shamanistic Focus, Reverberation, Call of Thunder, Elemental Fury, Elemental Alacrity, Elemental
// Weapons, Maelstrom Weapon, Improved Stormstrike) are applied by talents.ts. A rank learned below 60
// grows by its per-level points, and a range is base × (1 ± variance / 2), as the paladin's
// (paladin.md#conventions-used-below).
import { CRIT_MULTIPLIER, GCD_MS } from '../../core/formulas'
import type { AuraSpec, ProcSpec } from '../../effects/types'
import { type AbilityDef, STANCE_ANY, type SpellDef } from '../../plan/types'
import { atLevel60, spread } from '../paladin/spells'

const DOC = 'docs/classes/shaman.md'

/** Base mana at level 60 [F] (PlayerExpectedStat.BaseMana and basemp.txt, 1.60.1.69913; shaman.md#base-stats). */
export const SHAMAN_BASE_MANA = 1520

/** A mana cost as a row's `costTenths` (paid from mana: `resource: 'mana'`, in tenths). */
const mana = (cost: number) => ({ costTenths: 10 * cost })

/**
 * The fields of a shaman ability that the warrior's use and it doesn't: no rage, no stance, no bleed,
 * no refund (an avoided attack costs its mana: mana has no refund rule, shaman.md#stormstrike [?]).
 */
export const SHAMAN = {
  resource: 'mana',
  costTenths: 0,
  cooldownMs: 0,
  gcdMs: GCD_MS,
  castMs: 0,
  castStopsSwings: false,
  twoHandOnly: false,
  unavoidable: false,
  stances: STANCE_ANY,
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 0,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: 0,
  threatMult: 0,
  threatBonus: 0,
  offHand: false,
  dotTickDamage: 0,
  dotTicks: 0,
  dotTickMs: 0,
  periodicCanCrit: false,
  rageTenths: 0,
  rageSpreadTenths: 0,
  rageTickTenths: 0,
  rageTicks: 0,
  rageTickMs: 0,
  usesPerFight: 0,
  aura: null,
} as const

// --- Stormstrike (shaman.md#stormstrike) --------------------------------------------------------

/**
 * Stormstrike's aura on the target (17364 #1): aura 271, +20% damage taken from the shaman's own next
 * Lightning Bolt, Chain Lightning or Earth Shock (class mask 0x100003), 12 s, one charge [F] [client]
 * (SpellEffect, SpellAuraOptions, SpellDuration, 1.60.1.69913). Only the shaman's spells read it, so
 * it's the shaman's own: no raid debuff (buffs doc §4.2).
 */
export const STORMSTRIKE_AURA: AuraSpec = { id: 'stormstrike', name: 'Stormstrike', durationMs: 12000, mods: {} }

/** The spells Stormstrike's aura boosts, and by how much (17364 #1: 20). */
export const STORMSTRIKE_BOOST = { aura: STORMSTRIKE_AURA.id, pct: 20 } as const

/**
 * Stormstrike (17364) [F] [client] (SpellEffect, SpellPower, SpellCooldowns, SpellCategories,
 * 1.60.1.69913): 125 mana, an 8 s cooldown (Classic Era: 21% of base mana, 20 s), on the GCD; effect
 * 121, 100% normalized weapon damage (Classic Era: effect 58, the weapon's own speed); melee class
 * (DefenseType 2) without No Active Defense or Always Hit, so one roll on the special-attack table
 * (combat-tables §3). A landed strike puts STORMSTRIKE_AURA on the target. Its threat is its damage.
 */
export const STORMSTRIKE: AbilityDef = {
  ...SHAMAN,
  id: 'stormstrike',
  name: 'Stormstrike',
  icon: 'ability_shaman_stormstrike',
  kind: 'weaponStrike',
  ...mana(125),
  cooldownMs: 8000,
  weaponPercent: 1,
  normalized: true,
  threatMult: 1,
  aura: STORMSTRIKE_AURA,
}

// --- Spells (shaman.md#shocks-and-lightning-bolt) ---------------------------------------------------

/**
 * What every shaman damage spell starts from: the magic class (DefenseType 1: the spell table,
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
} as const

/**
 * Earth Shock's threat: 2 × its damage [?] (shaman.md#shocks-and-lightning-bolt, open question 8). No client value or
 * measurement exists; every Classic Era and Season of Discovery threat tool carries ×2 (LibThreatClassic2's
 * shaman module, wowsims' classic and sod Earth Shock), the lineage Maul's ×1.75 has (threat.md), and
 * Classic Era's shaman tanks leaned on it. Never measured on Classic Era or Forever.
 */
export const EARTH_SHOCK_THREAT_MULT = 2

/** A rank's range at level 60: base × (1 ± variance / 2), plus its per-level points up to 60, truncated (docs/data/items.md#per-level-values). */
const range = (base: number, variance: number, perLevel: number, baseLevel: number, maxLevel: number) => {
  const grow = atLevel60(0, perLevel, baseLevel, maxLevel)
  const [min, max] = spread(base, variance)
  return { min: min + grow, max: max + grow }
}

/**
 * Earth Shock r7 (10414): 301 base points, variance 0.0527307, +1.9 a level from 60, so 293.06–308.94
 * at 60; coefficient 0.386; Nature [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913). Classic
 * Era's rank 7 is 517–545 [C]. Stormstrike's aura boosts it. Its threat is twice its damage [?]
 * (EARTH_SHOCK_THREAT_MULT).
 */
export const EARTH_SHOCK_SPELL: SpellDef = {
  ...SPELL,
  id: 'earthShock',
  name: 'Earth Shock',
  icon: 'spell_nature_earthshock',
  school: 'nature',
  ...range(301, 0.0527307, 1.9, 60, 65),
  spCoefficient: 0.386,
  boost: STORMSTRIKE_BOOST,
  threatMult: EARTH_SHOCK_THREAT_MULT,
}

/**
 * Frost Shock r4 (10473): 283 base points, variance 0.056, + trunc(1.8 a level from 58) = 3, so 278.08–293.92
 * at 60; coefficient 0.386; Frost [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913). Its slow does
 * nothing to a boss's damage in this sim. Stormstrike's aura doesn't boost it.
 */
export const FROST_SHOCK_SPELL: SpellDef = {
  ...SPELL,
  id: 'frostShock',
  name: 'Frost Shock',
  icon: 'spell_frost_frostshock',
  school: 'frost',
  ...range(283, 0.056, 1.8, 58, 63),
  spCoefficient: 0.386,
}

/**
 * Lightning Bolt r10 (15208): 196 base points, variance 0.10835215, + trunc(1.2 a level from 56 to 61) = 4,
 * so 189.38–210.62 at 60; coefficient 0.714; Nature (Classic Era: 428–476 at 0.857) [F] [client]
 * (SpellEffect, SpellLevels, 1.60.1.69913). Stormstrike's aura boosts it. Its travel time (speed 20)
 * isn't simulated.
 */
export const LIGHTNING_BOLT_SPELL: SpellDef = {
  ...SPELL,
  id: 'lightningBolt',
  name: 'Lightning Bolt',
  icon: 'spell_nature_lightning',
  school: 'nature',
  ...range(196, 0.10835215, 1.2, 56, 61),
  spCoefficient: 0.714,
  boost: STORMSTRIKE_BOOST,
}

/** The shocks' shared cooldown: category 19, 6 s (`CategoryRecoveryTime`) [F] [client] (SpellCategories, SpellCooldowns, 1.60.1.69913). */
export const SHOCK_CATEGORY = 'shock'
export const SHOCK_COOLDOWN_MS = 6000

/** A spell cast as an ability: its mana, its GCD, its spell (shaman.md). */
const spellAbility = (spell: SpellDef, manaCost: number, rest: Partial<AbilityDef> = {}): AbilityDef => ({
  ...SHAMAN,
  id: spell.id,
  name: spell.name,
  icon: spell.icon,
  kind: 'spell',
  ...mana(manaCost),
  spellDef: spell,
  ...rest,
})

/** Earth Shock r7: 450 mana, the shocks' 6 s cooldown, on the GCD (1.5 s) [F] [client] (SpellPower, 1.60.1.69913). */
export const EARTH_SHOCK = spellAbility(EARTH_SHOCK_SPELL, 450, { cooldownMs: SHOCK_COOLDOWN_MS, category: SHOCK_CATEGORY })

/** Frost Shock r4: 430 mana, the shocks' cooldown [F] [client] (SpellPower, 1.60.1.69913). */
export const FROST_SHOCK = spellAbility(FROST_SHOCK_SPELL, 430, { cooldownMs: SHOCK_COOLDOWN_MS, category: SHOCK_CATEGORY })

/**
 * Lightning Bolt r10: 220 mana, a 2.5 s cast (Classic Era: 265 mana, 3 s) [F] [client] (SpellPower,
 * SpellCastTimes, 1.60.1.69913). A cast stops white swings and restarts both timers when it completes,
 * as Slam without Improved Slam does (damage-and-timing §3.3 "Other casts": [?]); one Maelstrom Weapon
 * makes instant starts and stops nothing. Casting speed shortens the cast (docs/mechanics/spells.md §4),
 * after Maelstrom Weapon's cut.
 */
export const LIGHTNING_BOLT = spellAbility(LIGHTNING_BOLT_SPELL, 220, { castMs: 2500, castStopsSwings: true, castHasted: true })

// --- Weapon imbues (shaman.md#weapon-imbues) ----------------------------------------------------------

/** The Windfury Weapon proc's id: the plan leaves Windfury Totem out when it's there (build.ts). */
export const WINDFURY_WEAPON_ID = 'windfuryWeapon'

/**
 * Windfury Weapon r4 (16362 → enchant 1669 → 439431 and 16361) [F] [client] (SpellItemEnchantment,
 * SpellAuraOptions, SpellEffect, SpellLevels, 1.60.1.69913; the same rows in Classic Era 1.15.9):
 * each hit with the imbued weapon, white or special (proc mask 0x14), has a 20% chance, at most once
 * every 1.5 s (439431's `ProcCategoryRecovery` 1500), to grant 2 extra attacks (16361 #1: effect 19,
 * 2) with +333 attack power (16361 #0: aura 99, 333 at 60), Elemental Weapons' +40% at 3/3 included by
 * talents.ts. An extra attack can't proc it again (its chain and the 1.5 s cooldown;
 * damage-and-timing §5.4). The attack-power aura's third charge would reach a white swing within
 * 1.5 s, which a two-hander's next swing never is: not simulated.
 */
export function windfuryWeaponProc(bonusAp: number): ProcSpec {
  return {
    id: WINDFURY_WEAPON_ID,
    name: 'Windfury Weapon',
    icon: 'spell_nature_cyclone',
    trigger: 'meleeLanded',
    from: 'mainHand',
    chance: { pct: 20 },
    icdMs: 1500,
    action: { kind: 'extraAttacks', count: 2, bonusAp },
    docRef: `${DOC}#weapon-imbues`,
  }
}

/** Windfury Weapon's attack power on its extra attacks before Elemental Weapons: 16361 #0, 333 at 60 [F]. */
export const WINDFURY_WEAPON_AP = 333

/**
 * Rockbiter Weapon r7 (16316 → enchant 1664 → 16313) [F] [client] (SpellItemEnchantment, SpellEffect,
 * SpellLevels, 1.60.1.69913): +554 attack power and 16.5 a level from 54 to 62, so 653 at 60 (aura 99),
 * while the imbued weapon is in hand; Elemental Weapons adds 20% at 3/3 (talents.ts). The imbue lasts
 * an hour, so it's put on before the pull, a cast with a buff that outlasts any fight.
 */
export const ROCKBITER_AP = atLevel60(554, 16.5, 54, 62)
export const rockbiterWeapon = (ap: number): AbilityDef => ({
  ...SHAMAN,
  id: 'rockbiterWeapon',
  name: 'Rockbiter Weapon',
  icon: 'spell_nature_rockbiter',
  kind: 'cast',
  gcdMs: 0,
  aura: { id: 'rockbiterWeapon', name: 'Rockbiter Weapon', durationMs: 3600000, mods: { ap } },
})

// --- Cooldowns and procs from talents (shaman.md#talents) --------------------------------------------

/**
 * Rage of the Farseer (425336) [F] [client] (SpellEffect, SpellDuration, SpellCooldowns, 1.60.1.70009):
 * +30% attack speed (aura 342) for 25 s, a 3 min cooldown, off the GCD (no `StartRecoveryTime`), no
 * cost. Until 1.60.1.70009 it also gave +30% casting speed (aura 65); the build removed it ("no longer
 * increases the Shaman's Spell Casting Speed"). Its other effect, aura 61, scales the model.
 */
export const RAGE_OF_THE_FARSEER: AbilityDef = {
  ...SHAMAN,
  id: 'rageOfTheFarseer',
  name: 'Rage of the Farseer',
  icon: 'spell_nature_bloodlust',
  kind: 'cast',
  cooldownMs: 180000,
  gcdMs: 0,
  aura: { id: 'rageOfTheFarseer', name: 'Rage of the Farseer', durationMs: 25000, mods: { haste: 30 } },
}

/**
 * Maelstrom Weapon's stacks (408498 → 408505) [F] [client] (SpellEffect, SpellAuraOptions,
 * SpellDuration, 1.60.1.69913): up to 5, 30 s, each cutting Lightning Bolt's cast time and mana cost
 * by 4% per talent rank (20% at 5/5), all spent by the next Lightning Bolt. How often a melee hit gives
 * one is server-side: MAELSTROM_CHANCE_PCT [?].
 */
export const MAELSTROM_AURA: AuraSpec = { id: 'maelstromWeapon', name: 'Maelstrom Weapon', durationMs: 30000, maxStacks: 5, mods: {} }

/**
 * Maelstrom Weapon's chance per landed melee hit, white, special or extra attack ("When you deal damage
 * with a melee attack, you have a chance"): [?] no source states it. The talent's aura carries three
 * dummy values, 20 (the stack's cut, which its rank curve sets), 50 and 5 (the stacks), and the sim
 * reads the 50 as this chance [?] (shaman.md#maelstrom-weapon, open question 1). Season of Discovery's
 * client (the same rune) has the same values and no procs-per-minute row, and Blizzard's SoD notes give
 * only changes to its rate (Windfury Weapon, a two-hander), never the base, so the 50 stays as is.
 */
export const MAELSTROM_CHANCE_PCT = 50

export const maelstromProc = (): ProcSpec => ({
  id: 'maelstromWeapon',
  name: 'Maelstrom Weapon',
  icon: 'spell_shaman_maelstromweapon',
  trigger: 'meleeLanded',
  from: 'any',
  chance: { pct: MAELSTROM_CHANCE_PCT },
  action: { kind: 'aura', aura: MAELSTROM_AURA },
  docRef: `${DOC}#maelstrom-weapon`,
})

/**
 * Improved Stormstrike's regeneration (1223031 → 1238931) [F] [client] (SpellEffect, SpellDuration,
 * 1.60.1.69913): 50% of your mana regeneration continues while casting (aura 134) for 15 s after a
 * Stormstrike, at a 50% chance per talent rank (100% at 2/2). The caster core's mana hook carries it
 * (`castingRegen`, docs/mechanics/spells.md §8).
 */
export const IMPROVED_STORMSTRIKE_SHARE = 0.5
export const IMPROVED_STORMSTRIKE_AURA: AuraSpec = {
  id: 'improvedStormstrike',
  name: 'Improved Stormstrike',
  durationMs: 15000,
  mods: { castingRegen: 100 * IMPROVED_STORMSTRIKE_SHARE },
}

// --- Elemental (shaman.md#elemental) ------------------------------------------------------------------

/**
 * Lightning Bolt r4 (915), the Classic Era downrank: 56 base points (50 until 1.60.1.70009), variance
 * 0.13483146, +0.6 a level from 20 to 25, so 55.22–62.78 at 60; coefficient 0.714, the same as rank
 * 10's (the client gives every rank from 3 up 0.714, and rank 4 is learned at 20, so no low-level
 * penalty applies); 60 mana, a 2.5 s cast [F] [client] (SpellEffect, SpellLevels, SpellPower,
 * SpellCastTimes, 1.60.1.70009). Whether Forever charges a downranking penalty the client doesn't
 * show is [?] (shaman.md, open questions).
 */
export const LIGHTNING_BOLT_R4_SPELL: SpellDef = {
  ...LIGHTNING_BOLT_SPELL,
  id: 'lightningBoltRank4',
  name: 'Lightning Bolt (Rank 4)',
  ...range(56, 0.13483146, 0.6, 20, 25),
}
export const LIGHTNING_BOLT_R4 = spellAbility(LIGHTNING_BOLT_R4_SPELL, 60, { castMs: 2500, castHasted: true })

/**
 * Chain Lightning r4 (10605): 123 base points, variance 0.11111111, + trunc(0.8 a level from 56 to 61) = 3,
 * so 119.17–132.83 at 60; coefficient 0.571; Nature; 3 targets, each jump −30%, of which one boss takes
 * the first [F] [client] (SpellEffect, SpellLevels, 1.60.1.69913). Classic Era's rank 4 is 505–564
 * [C]. Stormstrike's aura boosts it.
 */
export const CHAIN_LIGHTNING_SPELL: SpellDef = {
  ...SPELL,
  id: 'chainLightning',
  name: 'Chain Lightning',
  icon: 'spell_nature_chainlightning',
  school: 'nature',
  ...range(123, 0.11111111, 0.8, 56, 61),
  spCoefficient: 0.571,
  boost: STORMSTRIKE_BOOST,
}

/**
 * Chain Lightning r4: 485 mana, a 2.0 s cast, its own 6 s cooldown (category 85,
 * `CategoryRecoveryTime` 6000), on the GCD [F] [client] (SpellPower, SpellCastTimes, SpellCooldowns,
 * SpellCategories, 1.60.1.69913). Casting speed shortens it (docs/mechanics/spells.md §4).
 */
export const CHAIN_LIGHTNING = spellAbility(CHAIN_LIGHTNING_SPELL, 485, { castMs: 2000, castHasted: true, cooldownMs: 6000 })

/** Flame Shock's marker on the boss: up from its application until its last tick (docs/mechanics/spells.md §7). */
export const FLAME_SHOCK_AURA: AuraSpec = { id: 'flameShock', name: 'Flame Shock', durationMs: 12000, mods: {} }

/**
 * Flame Shock r6 (29228): 166 Fire at once (+2.1 a level from 60, so 166 at 60, no variance;
 * coefficient 0.214) and 4 ticks of 44 every 3 s (aura 3, coefficient 0.1 a tick) over 12 s; the
 * periodic-crit flag (SpellMisc Attributes[8] 0x200), so its ticks crit in `forever` [F] [client]
 * (SpellEffect, SpellMisc, SpellDuration, SpellLevels, 1.60.1.69913). Classic Era's rank 6 is 292 +
 * 320 over 12 s [C]. A pure damage spell (its third effect is a dummy that Lava Burst reads), so
 * partially resisted on average (docs/mechanics/spells.md §3).
 */
export const FLAME_SHOCK_SPELL: SpellDef = {
  ...SPELL,
  id: 'flameShock',
  name: 'Flame Shock',
  icon: 'spell_fire_flameshock',
  school: 'fire',
  min: atLevel60(166, 2.1, 60, 67),
  max: atLevel60(166, 2.1, 60, 67),
  spCoefficient: 0.214,
  dotTicks: 4,
  dotTickMs: 3000,
  dotTickDamage: 44,
  dotSpCoefficient: 0.1,
  dotCanCrit: true,
}

/** Flame Shock r6: 410 mana, the shocks' 6 s cooldown, on the GCD [F] [client] (SpellPower, SpellCategories, 1.60.1.69913). */
export const FLAME_SHOCK = spellAbility(FLAME_SHOCK_SPELL, 410, { cooldownMs: SHOCK_COOLDOWN_MS, category: SHOCK_CATEGORY, aura: FLAME_SHOCK_AURA })

/** Lava Burst's +20% while your Flame Shock is on the target (1238300 #1, a dummy of 20), which it doesn't use up [F]. */
export const LAVA_BURST_FLAME_SHOCK_PCT = 20

/**
 * Lava Burst r3 (1238300), the Elemental tree's tier-7 talent (408490 is its rank 1): 220 base points,
 * variance 0.25325885, +1.3 a level from 60, so 192.14–247.86 at 60; coefficient 0.714; Fire; "If
 * your Flame Shock is on the target, Lava Burst deals 20% increased damage" [F] [client] (SpellEffect,
 * SpellLevels, 1.60.1.70009; tooltip "192 to 248"). 1.60.1.70009 raised ranks 1 and 2, not this one.
 * New in Forever: Classic Era has no Lava Burst. Its travel time (speed 20) isn't simulated.
 */
export const LAVA_BURST_SPELL: SpellDef = {
  ...SPELL,
  id: 'lavaBurst',
  name: 'Lava Burst',
  icon: 'spell_shaman_lavaburst',
  school: 'fire',
  ...range(220, 0.25325885, 1.3, 60, 68),
  spCoefficient: 0.714,
  boost: { aura: FLAME_SHOCK_AURA.id, pct: LAVA_BURST_FLAME_SHOCK_PCT, keep: true },
}

/**
 * Lava Burst r3: 265 mana, a 2.5 s cast, a 10 s cooldown (category 1224), on the GCD [F] [client]
 * (SpellPower, SpellCastTimes, SpellCooldowns, SpellCategories, 1.60.1.69913).
 */
export const LAVA_BURST = spellAbility(LAVA_BURST_SPELL, 265, { castMs: 2500, castHasted: true, cooldownMs: 10000 })

/**
 * Clearcasting (16246), from Elemental Focus (16164) [F] [client] (SpellAuraOptions, SpellEffect,
 * SpellDuration, 1.60.1.69913): one charge for 15 s, −100% mana cost (aura 108, misc 14) for the
 * next damage spell: Lightning Bolt, Chain Lightning, the shocks and Lava Burst. The plan's
 * `freeCastAura`, as the druid's Omen of Clarity (druid.md §2.7).
 */
export const ELEMENTAL_CLEARCASTING: AuraSpec = { id: 'elementalClearcasting', name: 'Clearcasting', durationMs: 15000, mods: {} }

/**
 * Elemental Focus (16164): a 10% chance after a Fire, Frost or Nature damage spell (proc mask
 * 0x15550) of Clearcasting [F] [client] (SpellAuraOptions, 1.60.1.69913). "After casting" is read
 * as the spell landing, as the core's spell procs are (docs/mechanics/spells.md §10) [?].
 */
export const elementalFocusProc = (): ProcSpec => ({
  id: 'elementalFocus',
  name: 'Elemental Focus',
  icon: 'spell_shadow_manaburn',
  trigger: 'spellLanded',
  from: 'any',
  schools: ['fire', 'frost', 'nature'],
  chance: { pct: 10 },
  action: { kind: 'aura', aura: ELEMENTAL_CLEARCASTING },
  docRef: `${DOC}#elemental-talents`,
})

/**
 * Lightning Overload (408438): its chance a rank, 3 / 7 / 10% (TraitDefinitionEffectPoints), that a
 * Lightning Bolt or Chain Lightning casts "a second, similar spell on the same target at no
 * additional cost that causes half damage and no threat" [F] [client] (SpellEffect, CurvePoint,
 * 1.60.1.69913; tooltip). The sim rolls it when the spell lands, and the second spell rolls its own
 * hit and crit, with the first one's talents, and triggers no procs [?] (shaman.md, open questions).
 */
export const LIGHTNING_OVERLOAD_PCT = [0, 3, 7, 10]
const OVERLOAD_OF: Record<string, { id: string; name: string }> = {
  lightningBolt: { id: 'lightningOverload', name: 'Lightning Overload' },
  lightningBoltRank4: { id: 'lightningOverloadRank4', name: 'Lightning Overload (Rank 4)' },
  chainLightning: { id: 'lightningOverloadChain', name: 'Lightning Overload (Chain Lightning)' },
}
export function lightningOverloadProc(spell: SpellDef, pct: number): ProcSpec {
  const { id, name } = OVERLOAD_OF[spell.id] ?? { id: `${spell.id}Overload`, name: `Lightning Overload (${spell.name})` }
  const { boost: _, ...rest } = spell
  return {
    id,
    name,
    icon: 'spell_nature_lightningoverload',
    trigger: 'spellLanded',
    from: 'any',
    fromSpell: spell.id,
    chance: { pct },
    action: {
      kind: 'spell',
      spell: { ...rest, id, name, icon: 'spell_nature_lightningoverload', damageMult: spell.damageMult * 0.5, threatMult: 0, triggersProcs: false },
    },
    docRef: `${DOC}#elemental-talents`,
  }
}

/**
 * Mana Tide Totem r3 (17359), a Restoration talent: 60 mana, a 5 min cooldown (category 591), a 1 s
 * GCD [F] [client] (SpellPower, SpellCooldowns, 1.60.1.69913); "restores 290 mana every 3 seconds"
 * for 12 s to the party [F] tooltip, which the sim gives as 4 ticks of 290 from 3 s after it's
 * dropped [?]. Classic Era's rank 3 is the same [C].
 */
export const MANA_TIDE_TOTEM: AbilityDef = {
  ...SHAMAN,
  id: 'manaTideTotem',
  name: 'Mana Tide Totem',
  icon: 'spell_frost_summonwaterelemental',
  kind: 'cast',
  ...mana(60),
  cooldownMs: 300000,
  gcdMs: 1000,
  rageTickTenths: 2900,
  rageTicks: 4,
  rageTickMs: 3000,
}
