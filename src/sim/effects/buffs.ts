// The buff catalogue: raid buffs, target debuffs and consumables
// (docs/mechanics/buffs-debuffs-consumables.md). Entries that do something for one class only
// (mana and spell damage: the paladin's) say so in `forClasses`: the Buffs tab lists them for that
// class, and presets and the plan skip them for the others. What a druid's form makes useless is
// listed and locked off instead (presets.ts `buffUnusedReason`). World buffs never exist here
// (decision D8).
//
// Each entry is a UI-facing BuffDefinition plus its effects and the presets that include it
// (buffs doc §6.2 and §6.3). Values are Forever's. An entry whose Classic Era value differs
// carries it in `classicEra` (from the Classic Era client, buffs doc "Classic Era values"), or
// reads the rule profile's `values` where a worked example ties it to the profile; resolve them
// with `catalogueEffects`. Entries new in Forever have no Classic Era value and keep Forever's.
import type { BuffDefinition, BuffPreset, ClassId, SpecId } from '../types'
import { THISTLE_TEA } from '../classes/rogue/abilities'
import { MAGIC_SCHOOLS, schoolMask } from '../plan/types'
import type { ClassicEraValues, Effect, EffectList, OnUseSpec, ProcSpec } from './types'

const DOC = 'docs/mechanics/buffs-debuffs-consumables.md'

/**
 * Who a preset gives an entry to (buffs doc §6.2: `DPS`, `Tank`, `all`; §6.3 lists specs), or every
 * spec but some (`not`: Windfury Totem for all but the Enhancement shaman, whose Windfury Weapon
 * disables it, docs/classes/shaman.md#totems).
 */
export type Audience = 'all' | 'dps' | 'tank' | readonly SpecId[] | { not: readonly SpecId[] }

export interface BuffSpec extends BuffDefinition {
  effects: EffectList
  /** Classic Era's values where they differ (buffs doc, Classic Era values). */
  classicEra?: ClassicEraValues
  presets: Partial<Record<Exclude<BuffPreset['id'], 'self'>, Audience>>
}

const WARRIOR_DPS: SpecId[] = ['warrior-fury', 'warrior-arms']
const MELEE_TANKS: SpecId[] = ['warrior-protection', 'druid-feral-bear']
/** `Pal` in the buffs doc's presets (§6.2): the paladin specs only. */
const PALADINS: SpecId[] = ['paladin-retribution', 'paladin-protection']
const RETRIBUTION: SpecId[] = ['paladin-retribution']
const PROTECTION_PALADIN: SpecId[] = ['paladin-protection']
/** Mana and spell damage do something for the paladin only among the classes in scope. */
const PALADIN_ONLY: readonly ClassId[] = ['paladin']
/** The Enhancement shaman (docs/classes/shaman.md#defaults): mana and Nature and Frost spell damage matter to it too. */
const SHAMAN: SpecId[] = ['shaman-enhancement']
/** The classes that spend mana in their rotations: the paladin and the shaman (buffs doc, class-only entries). */
const MANA_USERS: readonly ClassId[] = ['paladin', 'shaman']
/** The rogue specs, and entries only a rogue can use (its poisons, docs/classes/rogue.md §4). */
const ROGUES: SpecId[] = ['rogue-combat', 'rogue-assassination', 'rogue-subtlety']
const ROGUE_ONLY: readonly ClassId[] = ['rogue']
const ROGUE_DOC = 'docs/classes/rogue.md'

/**
 * Instant Poison VI (item 8928 → 11340, enchant 625; docs/classes/rogue.md §4.1): each hit of the
 * weapon it's on has a 20% chance of 11337's 88 Nature damage with `Variance` 0.2769, 75.8–100.2,
 * whole numbers 76–100 as its tooltip shows them [F] [client] (SpellEffect, SpellItemEnchantment,
 * 1.60.1.69913). Classic Era's is 112–148 (111 + 1d37) [C].
 */
const instantPoison = (min: number, max: number): ProcSpec => ({
  id: 'instantPoison',
  name: 'Instant Poison',
  icon: 'ability_poisons',
  trigger: 'meleeLanded',
  from: 'weapon',
  chance: { pct: 20 },
  action: { kind: 'spellDamage', school: 'nature', min, max },
  poison: true,
  docRef: `${ROGUE_DOC}#41-instant-poison-vi`,
})
const INSTANT_POISON = instantPoison(76, 100)
const INSTANT_POISON_CLASSIC_ERA = instantPoison(112, 148)

/**
 * Deadly Poison V (item 20844 → 25351, enchant 2630; docs/classes/rogue.md §4.2): each hit of the
 * weapon it's on has a 30% chance of 25349, 23 Nature damage per stack every 3 s for 12 s, stacking
 * to 5, whose ticks carry the periodic-crit flag [F] [client] (SpellEffect, SpellAuraOptions,
 * SpellMisc, SpellItemEnchantment, 1.60.1.69913; Classic Era's 34 a tick).
 */
const deadlyPoison = (tick: number, periodicCanCrit: boolean): ProcSpec => ({
  id: 'deadlyPoison',
  name: 'Deadly Poison',
  icon: 'ability_rogue_dualweild',
  trigger: 'meleeLanded',
  from: 'weapon',
  chance: { pct: 30 },
  action: { kind: 'stackingDot', school: 'nature', tick, periodMs: 3000, durationMs: 12000, maxStacks: 5, periodicCanCrit },
  poison: true,
  docRef: `${ROGUE_DOC}#42-deadly-poison-v`,
})
const DEADLY_POISON = deadlyPoison(23, true)
/** Classic Era's 25349: 34 a tick, and no periodic-crit flag (SpellMisc Attributes[8] 0) [C]. */
const DEADLY_POISON_CLASSIC_ERA = deadlyPoison(34, false)

/** A poison on one hand: a temporary enchant that beats a stone there, with its proc (docs/classes/rogue.md §4). */
const poisonOn = (hand: 'main' | 'off', proc: ProcSpec): Effect[] => [{ kind: 'tempEnchant', id: `${proc.id}.${hand}`, priority: 10, hand, proc }]
/**
 * The caster classes and specs, as the caster class slices (K2–K6) land them (docs/mechanics/spells.md
 * §12): the entries for mana and spell damage, and the caster buffs and debuffs below, are theirs
 * too. The mage since K2 (docs/classes/mage.md); no warrior, druid, paladin or shaman setup changes: a
 * class slice adds its class here and its specs to CASTER_SPECS. A class whose other specs cast no
 * spells (the druid's Feral specs beside Balance) needs its entries gated per spec instead.
 */
export const CASTER_CLASSES: readonly ClassId[] = ['mage']
export const CASTER_SPECS: readonly SpecId[] = ['mage-fire', 'mage-frost', 'mage-arcane']
/** The classes that spend mana on spells: the paladin, the shaman and the casters (once each: K5 adds the shaman here too). */
const MANA_CLASSES: readonly ClassId[] = [...new Set([...MANA_USERS, ...CASTER_CLASSES])]
/** `Pal` in the presets (§6.2), the Enhancement shaman, and the casters. */
const MANA_SPECS: readonly SpecId[] = [...new Set([...PALADINS, ...SHAMAN, ...CASTER_SPECS])]
/**
 * A tank's duties are in no preset (buffs doc §6.2; D26's amendment): a warrior tank's Thunder Clap
 * and Demoralizing Shout, a Protection warrior's own (SpecMeta.ownBuffs), so a bear's or a Protection
 * paladin's raid has none unless you add them in Buffs; and a bear's Demoralizing Roar, its own.
 */
const NOT_IN_PRESETS: BuffSpec['presets'] = {}
/**
 * The weapons an Elemental Sharpening Stone fits: 22756 and its enchant's aura 22755 need a weapon
 * (item class 2) of subclass mask 42483, which is one- and two-handed axes, maces and swords,
 * polearms, staves, fist weapons and daggers [F] [C] (SpellEquippedItems, 1.60.1.69913 and
 * 1.15.9.69722; buffs doc §3.6). effects/client-values.test.ts ties this list to the client data.
 */
export const ELEMENTAL_STONE_WEAPONS = ['axe', 'mace', 'polearm', 'sword', 'staff', 'fist', 'dagger'] as const

/**
 * Mighty Rage Potion (item 13442 → spell 17528; buffs doc §3.5): an energize of 600 tenths with
 * variance 0.5, so 45–75 rage, drawn as 450 + a whole 0…300 tenths (Classic Era's 449 + 1d301),
 * and +60 Strength (aura 29) for 20 s. No GCD on the spell; the potion category's 2 min cooldown
 * is on the item [F] [client] (SpellEffect, SpellDuration, ItemEffect, 1.60.1.69913).
 */
export const MIGHTY_RAGE_POTION: OnUseSpec = {
  id: 'mightyRagePotion',
  name: 'Mighty Rage Potion',
  icon: 'inv_potion_41',
  cooldownMs: 120000,
  gcdMs: 0,
  aura: { id: 'mightyRage', name: 'Mighty Rage', durationMs: 20000, mods: { str: 60 } },
  rageTenths: 450,
  rageSpreadTenths: 300,
}

/**
 * Juju Flurry (item 12450 → spell 16322; buffs doc §3.3): +3% attack speed (aura 9) for 20 s,
 * the item's own 60 s cooldown, no GCD [F] [client] (SpellEffect, SpellDuration, ItemEffect,
 * 1.60.1.69913).
 */
export const JUJU_FLURRY: OnUseSpec = {
  id: 'jujuFlurry',
  name: 'Juju Flurry',
  icon: 'inv_misc_monsterscales_17',
  cooldownMs: 60000,
  gcdMs: 0,
  aura: { id: 'jujuFlurry', name: 'Juju Flurry', durationMs: 20000, mods: { haste: 3 } },
  rageTenths: 0,
  rageSpreadTenths: 0,
}

/**
 * Major Mana Potion (item 13444 → spell 17531; buffs doc §3.5): an energize of 1800 mana with
 * variance 0.5, so 1350–2250, drawn as 1350 + a whole 0…900 (in tenths, Classic Era's 1349 + 1d901).
 * No GCD; the potion category's 2 min cooldown is on the item [F] [client] (SpellEffect,
 * ItemEffect, 1.60.1.69913).
 */
export const MAJOR_MANA_POTION: OnUseSpec = {
  id: 'majorManaPotion',
  name: 'Major Mana Potion',
  icon: 'inv_potion_76',
  cooldownMs: 120000,
  gcdMs: 0,
  aura: null,
  rageTenths: 0,
  rageSpreadTenths: 0,
  manaTenths: 13500,
  manaSpreadTenths: 9000,
}

/**
 * Demonic Rune and Dark Rune (items 12662 / 20520 → spells 16666 / 27869; buffs doc §3.5): 900–1500
 * mana (1200, variance 0.5), and 600–1000 health lost, which a DPS sim doesn't track. No GCD; the
 * rune category's 2 min cooldown, apart from the potions' [F] [client] (SpellEffect, ItemEffect,
 * 1.60.1.69913).
 */
export const DEMONIC_RUNE: OnUseSpec = {
  id: 'demonicRune',
  name: 'Demonic Rune',
  icon: 'inv_misc_rune_04',
  cooldownMs: 120000,
  gcdMs: 0,
  aura: null,
  rageTenths: 0,
  rageSpreadTenths: 0,
  manaTenths: 9000,
  manaSpreadTenths: 6000,
}

/**
 * Power Infusion (10060; docs/mechanics/spells.md §9): a priest's +20% spell damage (aura 79, misc
 * 126: every magic school) for 15 s, every 3 min, off the GCD, in both clients [F] [C] [client]
 * (SpellEffect, SpellCooldowns, 1.60.1.69913 and 1.15.9.69722). Its 20% of the priest's base mana
 * is the priest's. A caster's rotation presses it, as the priest would cast it on them.
 */
export const POWER_INFUSION: OnUseSpec = {
  id: 'powerInfusion',
  name: 'Power Infusion',
  icon: 'spell_holy_powerinfusion',
  cooldownMs: 180000,
  gcdMs: 0,
  aura: { id: 'powerInfusion', name: 'Power Infusion', durationMs: 15000, mods: { schoolMask: schoolMask(MAGIC_SCHOOLS), schoolDamage: 20 } },
  rageTenths: 0,
  rageSpreadTenths: 0,
}

export const BUFFS: BuffSpec[] = [
  // --- Raid buffs (§1.1, §1.2) ---------------------------------------------------------------
  {
    id: 'battleShout',
    name: 'Battle Shout',
    icon: 'ability_warrior_battleshout',
    category: 'raidBuff',
    group: 'Attack power',
    summary: '+139 attack power',
    providedBy: 'warrior',
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    effects: [{ kind: 'stat', stat: 'ap', value: 139 }],
    classicEra: { summary: '+232 attack power', effects: [{ kind: 'stat', stat: 'ap', value: 232 }] },
    presets: { dungeon: 'all', raid: 'all', max: 'all' },
  },
  {
    id: 'blessingOfMight',
    name: 'Blessing of Might',
    icon: 'spell_holy_fistofjustice',
    category: 'raidBuff',
    group: 'Attack power',
    summary: '+133 attack power',
    providedBy: 'paladin',
    // A paladin blesses itself with Might, so for one the raid needs no other; its other blessings
    // are another paladin's (one blessing per paladin on a player; buffs doc §6.1).
    selfCast: true,
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    effects: [{ kind: 'stat', stat: 'ap', value: 133 }],
    classicEra: { summary: '+185 attack power', effects: [{ kind: 'stat', stat: 'ap', value: 185 }] },
    presets: { dungeon: 'dps', raid: 'all', max: 'all' },
  },
  {
    id: 'blessingOfKings',
    name: 'Blessing of Kings',
    icon: 'spell_magic_magearmor',
    category: 'raidBuff',
    group: 'Stats',
    summary: '+10% all stats',
    providedBy: 'paladin',
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    effects: [{ kind: 'mult', stat: 'allStats', pct: 10 }],
    presets: { dungeon: 'tank', raid: 'all', max: 'all' },
  },
  {
    id: 'markOfTheWild',
    name: 'Gift of the Wild',
    icon: 'spell_nature_regeneration',
    category: 'raidBuff',
    group: 'Stats',
    summary: '+16 all stats, +385 armor',
    providedBy: 'druid',
    selfCast: true,
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    effects: [
      { kind: 'stat', stat: 'str', value: 16 },
      { kind: 'stat', stat: 'agi', value: 16 },
      { kind: 'stat', stat: 'sta', value: 16 },
      { kind: 'stat', stat: 'int', value: 16 },
      { kind: 'stat', stat: 'spi', value: 16 },
      { kind: 'stat', stat: 'bonusArmor', value: 385 },
    ],
    classicEra: {
      summary: '+12 all stats, +285 armor',
      effects: [
        { kind: 'stat', stat: 'str', value: 12 },
        { kind: 'stat', stat: 'agi', value: 12 },
        { kind: 'stat', stat: 'sta', value: 12 },
        { kind: 'stat', stat: 'int', value: 12 },
        { kind: 'stat', stat: 'spi', value: 12 },
        { kind: 'stat', stat: 'bonusArmor', value: 285 },
      ],
    },
    presets: { dungeon: 'all', raid: 'all', max: 'all' },
  },
  {
    id: 'powerWordFortitude',
    name: 'Prayer of Fortitude',
    icon: 'spell_holy_wordfortitude',
    category: 'raidBuff',
    group: 'Stats',
    summary: '+70 Stamina',
    providedBy: 'priest',
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    effects: [{ kind: 'stat', stat: 'sta', value: 70 }],
    classicEra: { summary: '+54 Stamina', effects: [{ kind: 'stat', stat: 'sta', value: 54 }] },
    presets: { dungeon: 'all', raid: 'all', max: 'all' },
  },
  {
    id: 'prayerOfSpirit',
    name: 'Prayer of Spirit',
    icon: 'spell_holy_prayerofspirit',
    category: 'raidBuff',
    group: 'Stats',
    summary: '+40 Spirit',
    providedBy: 'priest',
    // Spirit regenerates mana, which the paladin and the shaman spend in combat.
    forClasses: MANA_CLASSES,
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    // 27681 #0 (Divine Spirit 27841 the same): aura 29, misc 4 (Spirit), 40; Classic Era's 39 + 1.
    effects: [{ kind: 'stat', stat: 'spi', value: 40 }],
    presets: { raid: MANA_SPECS, max: MANA_SPECS },
  },
  {
    id: 'arcaneBrilliance',
    name: 'Arcane Brilliance',
    icon: 'spell_holy_arcaneintellect',
    category: 'raidBuff',
    group: 'Stats',
    summary: '+31 Intellect',
    providedBy: 'mage',
    // Intellect is mana, spell crit and (Champion of the Light) spell damage: the paladin's alone.
    forClasses: MANA_CLASSES,
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    // 23028 #0 (Arcane Intellect 10157 the same): aura 29, misc 3 (Intellect), 31; Classic Era's 30 + 1.
    effects: [{ kind: 'stat', stat: 'int', value: 31 }],
    presets: { raid: MANA_SPECS, max: MANA_SPECS },
  },
  {
    id: 'leaderOfThePack',
    name: 'Leader of the Pack',
    icon: 'spell_nature_unyeildingstamina',
    category: 'raidBuff',
    group: 'Crit',
    summary: '+3% crit (feral druid in your party)',
    providedBy: 'druid',
    exclusiveGroup: 'party-crit-aura',
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    // 24932: all crit (aura 290), so spells too; Classic Era's is aura 52, melee and ranged only.
    effects: [
      { kind: 'stat', stat: 'crit', value: 3 },
      { kind: 'stat', stat: 'spellCrit', value: 3 },
    ],
    classicEra: { summary: '+3% melee crit (feral druid in your party)', effects: [{ kind: 'stat', stat: 'crit', value: 3 }] },
    presets: { raid: 'dps', max: 'dps' },
  },
  {
    id: 'windfuryTotem',
    name: 'Windfury Totem',
    icon: 'spell_nature_windfury',
    category: 'raidBuff',
    group: 'Shaman totems',
    summary: '20% chance on a main-hand hit for an extra attack with +246 attack power',
    providedBy: 'shaman',
    exclusiveGroup: 'totem:air',
    docRef: `${DOC}#windfury-totem`,
    effects: (p) => [
      {
        kind: 'proc',
        proc: {
          id: 'windfury',
          name: 'Windfury Attack',
          icon: 'spell_nature_windfury',
          // Each main-hand hit, white or special, 20%; can't proc from its own chain (buffs doc, Windfury Totem).
          trigger: 'meleeLanded',
          from: 'mainHand',
          chance: { pct: 20 },
          // docs/mechanics/damage-and-timing.md#54-extra-attacks-and-chaining: 100 ms in `forever`, none in `classicEra`
          icdMs: p.values.windfuryIcdMs,
          action: { kind: 'extraAttacks', count: 1, bonusAp: p.values.windfuryAp },
          docRef: `${DOC}#windfury-totem`,
        },
      },
    ],
    classicEra: { summary: '20% chance on a main-hand hit for an extra attack with +315 attack power; replaces a main-hand stone' },
    // Not for the Enhancement shaman: its Windfury Weapon disables the totem's benefit for it, so its
    // own air totem is Grace of Air (docs/classes/shaman.md#totems).
    presets: { raid: { not: SHAMAN }, max: { not: SHAMAN } },
  },
  {
    id: 'graceOfAir',
    name: 'Grace of Air Totem',
    icon: 'spell_nature_invisibilitytotem',
    category: 'raidBuff',
    group: 'Shaman totems',
    summary: '+89 Agility',
    providedBy: 'shaman',
    // A shaman drops its own totems: one air, one earth and one water (docs/classes/shaman.md#totems).
    selfCast: true,
    exclusiveGroup: 'totem:air',
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    effects: [{ kind: 'stat', stat: 'agi', value: 89 }],
    classicEra: { summary: '+77 Agility', effects: [{ kind: 'stat', stat: 'agi', value: 77 }] },
    presets: { dungeon: SHAMAN, raid: SHAMAN, max: SHAMAN },
  },
  {
    id: 'strengthOfEarth',
    name: 'Strength of Earth Totem',
    icon: 'spell_nature_earthbindtotem',
    category: 'raidBuff',
    group: 'Shaman totems',
    summary: '+53 Strength',
    providedBy: 'shaman',
    selfCast: true,
    exclusiveGroup: 'totem:earth',
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    effects: [{ kind: 'stat', stat: 'str', value: 53 }],
    classicEra: { summary: '+77 Strength', effects: [{ kind: 'stat', stat: 'str', value: 77 }] },
    presets: { dungeon: SHAMAN, raid: 'all', max: 'all' },
  },
  {
    id: 'blessingOfSalvation',
    name: 'Blessing of Salvation',
    icon: 'spell_holy_sealofsalvation',
    category: 'raidBuff',
    group: 'Threat and defense',
    summary: '−30% threat',
    providedBy: 'paladin',
    docRef: `${DOC}#12-threat-defense-and-mana`,
    effects: [{ kind: 'threat', pct: -30 }],
    presets: { raid: 'dps', max: 'dps' },
  },
  {
    id: 'devotionAura',
    name: 'Devotion Aura',
    icon: 'spell_holy_devotionaura',
    category: 'raidBuff',
    group: 'Threat and defense',
    summary: '+735 armor',
    providedBy: 'paladin',
    docRef: `${DOC}#12-threat-defense-and-mana`,
    effects: [{ kind: 'stat', stat: 'bonusArmor', value: 735 }],
    // A Protection paladin's is its own duty, which its rotation keeps up (SpecMeta.ownBuffs;
    // paladin.md "Priority", D26): no preset adds it for the paladin. A warrior's or bear's preset
    // keeps it, since any paladin in the raid runs an aura (buffs doc §6.2).
    presets: { raid: 'tank', max: 'tank' },
  },
  {
    id: 'blessingOfWisdom',
    name: 'Blessing of Wisdom',
    icon: 'spell_holy_sealofwisdom',
    category: 'raidBuff',
    group: 'Mana',
    summary: '+40 mana every 5 s',
    providedBy: 'paladin',
    forClasses: MANA_CLASSES,
    docRef: `${DOC}#12-threat-defense-and-mana`,
    // 25290 #0: aura 24, 40 every 5 s; the sim's mana ticks every 2 s, so 16 a tick.
    effects: [{ kind: 'stat', stat: 'mp5', value: 40 }],
    classicEra: { summary: '+33 mana every 5 s', effects: [{ kind: 'stat', stat: 'mp5', value: 33 }] },
    presets: { raid: MANA_SPECS, max: MANA_SPECS },
  },
  {
    id: 'manaSpringTotem',
    name: 'Mana Spring Totem',
    icon: 'spell_nature_manaregentotem',
    category: 'raidBuff',
    group: 'Mana',
    summary: '+10 mana every 2 s',
    providedBy: 'shaman',
    selfCast: true,
    forClasses: MANA_CLASSES,
    docRef: `${DOC}#12-threat-defense-and-mana`,
    // The totem's Mana Spring 10494 #0: aura 24, 10 every 2 s, which is 25 mana per 5 s.
    effects: [{ kind: 'stat', stat: 'mp5', value: 25 }],
    presets: { dungeon: SHAMAN, raid: MANA_SPECS, max: MANA_SPECS },
  },

  // The caster core's raid buffs (docs/mechanics/spells.md §9, §12; buffs doc §1.1): the casters' only.
  {
    id: 'moonkinAura',
    name: 'Moonkin Aura',
    icon: 'spell_nature_moonglow',
    category: 'raidBuff',
    group: 'Crit',
    summary: '+3% crit (moonkin druid in your party)',
    providedBy: 'druid',
    exclusiveGroup: 'party-crit-aura',
    forClasses: CASTER_CLASSES,
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    // 24907 #0: party aura 290 (all crit) 3 [F]; Classic Era's is aura 57, spell crit only [C]
    // [client] (SpellEffect, 1.60.1.69913 and 1.15.9.69722).
    effects: [
      { kind: 'stat', stat: 'crit', value: 3 },
      { kind: 'stat', stat: 'spellCrit', value: 3 },
    ],
    classicEra: { summary: '+3% spell crit (moonkin druid in your party)', effects: [{ kind: 'stat', stat: 'spellCrit', value: 3 }] },
    presets: { raid: CASTER_SPECS, max: CASTER_SPECS },
  },
  {
    id: 'powerInfusion',
    name: 'Power Infusion',
    icon: 'spell_holy_powerinfusion',
    category: 'raidBuff',
    group: 'Spell damage',
    summary: '+20% spell damage for 15 s, every 3 min (a priest’s)',
    providedBy: 'priest',
    forClasses: CASTER_CLASSES,
    docRef: `${DOC}#11-attack-power-stats-and-crit`,
    effects: [{ kind: 'onUse', id: 'powerInfusion', name: 'Power Infusion', use: POWER_INFUSION }],
    presets: {},
  },

  // --- Target debuffs (§4) -------------------------------------------------------------------
  {
    id: 'sunderArmor',
    name: 'Sunder Armor ×5',
    icon: 'ability_warrior_sunder',
    category: 'targetDebuff',
    group: 'Armor',
    summary: '−2,250 armor',
    providedBy: 'warrior',
    exclusiveGroup: 'armor-major',
    docRef: `${DOC}#41-armor-reduction`,
    effects: [{ kind: 'targetArmor', value: 2250 }],
    presets: { dungeon: 'dps', raid: 'all', max: 'all' },
  },
  {
    id: 'exposeArmor',
    name: 'Expose Armor',
    icon: 'ability_warrior_riposte',
    category: 'targetDebuff',
    group: 'Armor',
    summary: '−2,250 armor (instead of Sunder Armor)',
    providedBy: 'rogue',
    exclusiveGroup: 'armor-major',
    docRef: `${DOC}#41-armor-reduction`,
    effects: (p) => [{ kind: 'targetArmor', value: p.values.exposeArmor }],
    classicEra: { summary: '−1,700 armor (instead of Sunder Armor)' },
    presets: {},
  },
  {
    id: 'faerieFire',
    name: 'Faerie Fire',
    icon: 'spell_nature_faeriefire',
    category: 'targetDebuff',
    group: 'Armor',
    summary: '−505 armor',
    providedBy: 'druid',
    docRef: `${DOC}#41-armor-reduction`,
    effects: [{ kind: 'targetArmor', value: 505 }],
    presets: { raid: 'all', max: 'all' },
  },
  {
    id: 'curseOfRecklessness',
    name: 'Curse of Recklessness',
    icon: 'spell_shadow_unholystrength',
    category: 'targetDebuff',
    group: 'Armor',
    summary: '−505 armor',
    providedBy: 'warlock',
    docRef: `${DOC}#41-armor-reduction`,
    effects: (p) => [
      { kind: 'targetArmor', value: p.values.curseOfRecklessnessArmor },
      { kind: 'bossAp', value: p.values.curseOfRecklessnessBossAp },
    ],
    classicEra: { summary: '−640 armor, +90 boss attack power' },
    presets: { raid: 'all', max: 'all' },
  },
  {
    id: 'armorShatter',
    name: 'Annihilator ×3',
    icon: 'inv_axe_12',
    category: 'targetDebuff',
    group: 'Armor',
    summary: '−495 armor (Armor Shatter from a raid member’s Annihilator)',
    docRef: `${DOC}#41-armor-reduction`,
    effects: (p) => [{ kind: 'targetArmor', value: 3 * p.values.armorShatterPerStack }],
    classicEra: { summary: '−600 armor (Armor Shatter from a raid member’s Annihilator)' },
    presets: { max: 'all' },
  },
  // The caster core's (docs/mechanics/spells.md §9): Curse of the Elements, the casters' only.
  {
    id: 'curseOfTheElements',
    name: 'Curse of the Elements',
    icon: 'spell_shadow_chilltouch',
    category: 'targetDebuff',
    group: 'Spell damage',
    summary: '+10% magic damage taken, −75 magic resistance',
    providedBy: 'warlock',
    forClasses: CASTER_CLASSES,
    docRef: `${DOC}#42-other-debuffs`,
    // 1311680 (rank 4, new at 50) #0 aura 22 −75, #1 aura 87 +10, both misc 126: every magic school,
    // Holy included [F]; Classic Era's rank 3 (11722) is Fire and Frost only (misc 20) [C]
    // [client] (SpellEffect, 1.60.1.69913 and 1.15.9.69722). The −75 can't take a boss below its
    // own 0 (spells.md §3).
    effects: [
      { kind: 'schoolTaken', schools: MAGIC_SCHOOLS, pct: 10 },
      { kind: 'targetResistance', schools: MAGIC_SCHOOLS, value: -75 },
    ],
    classicEra: {
      summary: '+10% Fire and Frost damage taken, −75 Fire and Frost resistance',
      effects: [
        { kind: 'schoolTaken', schools: ['fire', 'frost'], pct: 10 },
        { kind: 'targetResistance', schools: ['fire', 'frost'], value: -75 },
      ],
    },
    presets: { raid: CASTER_SPECS, max: CASTER_SPECS },
  },
  // A Feral bear's duty (docs/classes/druid.md §6.3), which it keeps up itself (SpecMeta.ownBuffs), so
  // no preset has it; turned on here, it's another druid's.
  {
    id: 'demoralizingRoar',
    name: 'Demoralizing Roar',
    icon: 'ability_druid_demoralizingroar',
    category: 'targetDebuff',
    group: 'Boss damage',
    // Each names the other: only one attack-power debuff applies (`ap-reduction`), and both read −204.
    summary: '−204 boss attack power (instead of Demoralizing Shout)',
    providedBy: 'druid',
    exclusiveGroup: 'ap-reduction',
    docRef: `${DOC}#42-other-debuffs`,
    effects: (p) => [{ kind: 'bossAp', value: -p.values.demoralizingRoarAp }],
    classicEra: { summary: '−138 boss attack power (instead of Demoralizing Shout)' },
    presets: NOT_IN_PRESETS,
  },
  {
    id: 'demoralizingShout',
    name: 'Demoralizing Shout',
    icon: 'ability_warrior_warcry',
    category: 'targetDebuff',
    group: 'Boss damage',
    summary: '−204 boss attack power (instead of Demoralizing Roar)',
    providedBy: 'warrior',
    exclusiveGroup: 'ap-reduction',
    docRef: `${DOC}#42-other-debuffs`,
    effects: (p) => [{ kind: 'bossAp', value: -p.values.demoralizingShoutAp }],
    classicEra: { summary: '−146 boss attack power (instead of Demoralizing Roar)' },
    presets: NOT_IN_PRESETS,
  },
  {
    id: 'thunderClap',
    name: 'Thunder Clap',
    icon: 'spell_nature_thunderclap',
    category: 'targetDebuff',
    group: 'Boss damage',
    summary: 'Boss attacks 20% slower',
    providedBy: 'warrior',
    docRef: `${DOC}#42-other-debuffs`,
    effects: (p) => [{ kind: 'bossSlow', pct: 100 * p.values.thunderClapSlow }],
    classicEra: { summary: 'Boss attacks 10% slower' },
    presets: NOT_IN_PRESETS,
  },

  // --- Consumables (§3) ----------------------------------------------------------------------
  {
    id: 'elixirOfTheMongoose',
    name: 'Elixir of the Mongoose',
    icon: 'inv_potion_32',
    category: 'consumable',
    group: 'Elixirs',
    summary: '+25 Agility, +2% crit',
    exclusiveGroup: 'elixir:agility',
    docRef: `${DOC}#32-elixirs`,
    // 17538 #1: all crit (aura 290), so spells too; Classic Era's is aura 52, melee and ranged only.
    effects: [
      { kind: 'stat', stat: 'agi', value: 25 },
      { kind: 'stat', stat: 'crit', value: 2 },
      { kind: 'stat', stat: 'spellCrit', value: 2 },
    ],
    classicEra: {
      summary: '+25 Agility, +2% melee crit',
      effects: [
        { kind: 'stat', stat: 'agi', value: 25 },
        { kind: 'stat', stat: 'crit', value: 2 },
      ],
    },
    presets: {
      raid: [...WARRIOR_DPS, 'warrior-protection', 'druid-feral-cat', 'druid-feral-bear', 'paladin-retribution', ...SHAMAN, ...ROGUES],
      max: [...WARRIOR_DPS, 'warrior-protection', 'druid-feral-cat', 'druid-feral-bear', 'paladin-retribution', ...SHAMAN, ...ROGUES],
    },
  },
  {
    id: 'elixirOfGreaterStrength',
    name: 'Elixir of Greater Strength',
    icon: 'inv_potion_61',
    category: 'consumable',
    group: 'Elixirs',
    summary: '+25 Strength',
    exclusiveGroup: 'elixir:strength',
    docRef: `${DOC}#32-elixirs`,
    effects: [{ kind: 'stat', stat: 'str', value: 25 }],
    presets: { raid: [...WARRIOR_DPS, 'warrior-protection', 'druid-feral-cat', 'druid-feral-bear', 'paladin-retribution', ...SHAMAN] },
  },
  {
    id: 'jujuPower',
    name: 'Juju Power',
    icon: 'inv_misc_monsterscales_11',
    category: 'consumable',
    group: 'Elixirs',
    summary: '+30 Strength',
    exclusiveGroup: 'elixir:strength',
    docRef: `${DOC}#33-juju-firewater-blasted-lands-and-other-buffs`,
    effects: [{ kind: 'stat', stat: 'str', value: 30 }],
    presets: { max: [...WARRIOR_DPS, 'warrior-protection', 'druid-feral-cat', 'druid-feral-bear', 'paladin-retribution', ...SHAMAN, ...ROGUES] },
  },
  {
    id: 'elixirOfGreaterDefense',
    name: 'Elixir of Greater Defense',
    icon: 'inv_potion_66',
    category: 'consumable',
    group: 'Elixirs',
    summary: '+450 armor',
    docRef: `${DOC}#32-elixirs`,
    effects: [{ kind: 'stat', stat: 'bonusArmor', value: 450 }],
    presets: { raid: [...MELEE_TANKS, 'paladin-protection'], max: [...MELEE_TANKS, 'paladin-protection'] },
  },
  {
    id: 'elixirOfFortitude',
    name: 'Elixir of Fortitude',
    icon: 'inv_potion_43',
    category: 'consumable',
    group: 'Elixirs',
    summary: '+200 health',
    exclusiveGroup: 'health-elixir',
    docRef: `${DOC}#32-elixirs`,
    effects: [{ kind: 'stat', stat: 'health', value: 200 }],
    presets: { raid: [...MELEE_TANKS, 'paladin-protection'], max: [...MELEE_TANKS, 'paladin-protection'] },
  },
  {
    id: 'greaterArcaneElixir',
    name: 'Greater Arcane Elixir',
    icon: 'inv_potion_25',
    category: 'consumable',
    group: 'Elixirs',
    summary: '+35 spell damage',
    forClasses: MANA_CLASSES,
    docRef: `${DOC}#32-elixirs`,
    // 17539 #0: aura 13, school mask 126, all magic schools, so Holy too.
    effects: [{ kind: 'stat', stat: 'spellDamage', value: 35 }],
    presets: { raid: [...RETRIBUTION, ...CASTER_SPECS], max: [...PALADINS, ...SHAMAN, ...CASTER_SPECS] },
  },
  {
    id: 'elixirOfHolyPower',
    name: 'Elixir of Holy Power',
    icon: 'inv_potion_60',
    category: 'consumable',
    group: 'Elixirs',
    summary: '+40 Holy spell damage',
    forClasses: PALADIN_ONLY,
    docRef: `${DOC}#32-elixirs`,
    // 1310077 #0: aura 13, school mask 2 (Holy). Classic Era's item is Elixir of Greater Firepower
    // (26276: Fire, mask 4), which does nothing for a paladin.
    effects: [{ kind: 'stat', stat: 'holySpellDamage', value: 40 }],
    classicEra: { summary: 'Fire spell damage (Classic Era’s Elixir of Greater Firepower), nothing for Holy', effects: [] },
    presets: { raid: PROTECTION_PALADIN, max: PALADINS },
  },
  {
    id: 'flaskOfTheTitans',
    name: 'Flask of the Titans',
    icon: 'inv_potion_62',
    category: 'consumable',
    group: 'Flasks',
    summary: '+1,200 health',
    exclusiveGroup: 'flask',
    docRef: `${DOC}#31-flasks`,
    effects: [{ kind: 'stat', stat: 'health', value: 1200 }],
    presets: { max: MELEE_TANKS },
  },
  {
    id: 'flaskOfSupremePower',
    name: 'Flask of Supreme Power',
    icon: 'inv_potion_41',
    category: 'consumable',
    group: 'Flasks',
    summary: '+150 spell damage',
    exclusiveGroup: 'flask',
    forClasses: MANA_CLASSES,
    docRef: `${DOC}#31-flasks`,
    // 17628 #0: aura 13, school mask 126, all magic schools, so Holy too.
    effects: [{ kind: 'stat', stat: 'spellDamage', value: 150 }],
    presets: { max: [...PALADINS, ...SHAMAN, ...CASTER_SPECS] },
  },
  {
    id: 'flaskOfNaturalAccuracy',
    name: 'Flask of Natural Accuracy',
    icon: 'inv_potion_97',
    category: 'consumable',
    group: 'Flasks',
    summary: '+60 Stamina; +5% hit in Hyjal and the Barrow Deeps',
    exclusiveGroup: 'flask',
    docRef: `${DOC}#31-flasks`,
    effects: [
      { kind: 'stat', stat: 'sta', value: 60 },
      { kind: 'stat', stat: 'hit', value: 5, when: { zones: ['hyjal', 'barrowDeeps'] } },
    ],
    presets: {},
  },
  {
    id: 'flaskOfNaturalAggression',
    name: 'Flask of Natural Aggression',
    icon: 'inv_potion_93',
    category: 'consumable',
    group: 'Flasks',
    summary: '+60 Stamina; +4% crit in Hyjal and the Barrow Deeps',
    exclusiveGroup: 'flask',
    docRef: `${DOC}#31-flasks`,
    // 1293741: the dummy's 4 sets an all-crit aura (290) in the zones, so spells too [?].
    effects: [
      { kind: 'stat', stat: 'sta', value: 60 },
      { kind: 'stat', stat: 'crit', value: 4, when: { zones: ['hyjal', 'barrowDeeps'] } },
      { kind: 'stat', stat: 'spellCrit', value: 4, when: { zones: ['hyjal', 'barrowDeeps'] } },
    ],
    presets: {},
  },
  {
    id: 'flaskOfNaturalPrecision',
    name: 'Flask of Natural Precision',
    icon: 'inv_potion_91',
    category: 'consumable',
    group: 'Flasks',
    summary: '+60 Stamina; 5% less chance to be dodged or parried in Hyjal and the Barrow Deeps',
    exclusiveGroup: 'flask',
    docRef: `${DOC}#31-flasks`,
    effects: [
      { kind: 'stat', stat: 'sta', value: 60 },
      { kind: 'stat', stat: 'expertise', value: 5, when: { zones: ['hyjal', 'barrowDeeps'] } },
    ],
    presets: {},
  },
  {
    id: 'flaskOfNaturalSwiftness',
    name: 'Flask of Natural Swiftness',
    icon: 'inv_potion_95',
    category: 'consumable',
    group: 'Flasks',
    summary: '+60 Stamina; +5% haste in Hyjal and the Barrow Deeps',
    exclusiveGroup: 'flask',
    docRef: `${DOC}#31-flasks`,
    effects: [
      { kind: 'stat', stat: 'sta', value: 60 },
      { kind: 'haste', pct: 5, when: { zones: ['hyjal', 'barrowDeeps'] } },
    ],
    presets: {},
  },
  {
    id: 'winterfallFirewater',
    name: 'Winterfall Firewater',
    icon: 'inv_potion_92',
    category: 'consumable',
    group: 'Other buffs',
    summary: '+35 attack power',
    exclusiveGroup: 'buff:ap-drink',
    docRef: `${DOC}#33-juju-firewater-blasted-lands-and-other-buffs`,
    effects: [{ kind: 'stat', stat: 'ap', value: 35 }],
    presets: { raid: WARRIOR_DPS },
  },
  {
    id: 'jujuMight',
    name: 'Juju Might',
    icon: 'inv_misc_monsterscales_07',
    category: 'consumable',
    group: 'Other buffs',
    summary: '+40 attack power',
    exclusiveGroup: 'buff:ap-drink',
    docRef: `${DOC}#33-juju-firewater-blasted-lands-and-other-buffs`,
    effects: [{ kind: 'stat', stat: 'ap', value: 40 }],
    presets: { max: [...WARRIOR_DPS, 'warrior-protection', 'druid-feral-cat', 'druid-feral-bear', 'paladin-retribution', ...SHAMAN, ...ROGUES] },
  },
  {
    id: 'roids',
    name: 'R.O.I.D.S.',
    icon: 'inv_stone_15',
    category: 'consumable',
    group: 'Other buffs',
    summary: '+25 Strength',
    exclusiveGroup: 'blasted-lands',
    docRef: `${DOC}#33-juju-firewater-blasted-lands-and-other-buffs`,
    effects: [{ kind: 'stat', stat: 'str', value: 25 }],
    presets: { max: [...WARRIOR_DPS, 'warrior-protection', 'druid-feral-bear', 'paladin-retribution', ...SHAMAN] },
  },
  {
    id: 'groundScorpokAssay',
    name: 'Ground Scorpok Assay',
    icon: 'inv_misc_dust_02',
    category: 'consumable',
    group: 'Other buffs',
    summary: '+25 Agility',
    exclusiveGroup: 'blasted-lands',
    docRef: `${DOC}#33-juju-firewater-blasted-lands-and-other-buffs`,
    effects: [{ kind: 'stat', stat: 'agi', value: 25 }],
    presets: { max: ['druid-feral-cat', ...ROGUES] },
  },
  {
    id: 'rumseyRum',
    name: 'Rumsey Rum Black Label',
    icon: 'inv_drink_04',
    category: 'consumable',
    group: 'Other buffs',
    summary: '+15 Stamina',
    docRef: `${DOC}#33-juju-firewater-blasted-lands-and-other-buffs`,
    effects: [{ kind: 'stat', stat: 'sta', value: 15 }],
    presets: { max: MELEE_TANKS },
  },
  {
    id: 'smokedDesertDumplings',
    name: 'Smoked Desert Dumplings',
    icon: 'inv_misc_food_64',
    category: 'consumable',
    group: 'Food',
    summary: '+20 Strength',
    exclusiveGroup: 'food',
    docRef: `${DOC}#34-food`,
    effects: [{ kind: 'stat', stat: 'str', value: 20 }],
    presets: {
      dungeon: [...WARRIOR_DPS, 'warrior-protection', 'druid-feral-bear', 'paladin-retribution', ...SHAMAN],
      raid: [...WARRIOR_DPS, 'warrior-protection', 'druid-feral-bear', 'paladin-retribution', ...SHAMAN],
      max: [...WARRIOR_DPS, 'warrior-protection', 'druid-feral-bear', 'paladin-retribution', ...SHAMAN],
    },
  },
  {
    id: 'mightfishSteak',
    name: 'Mightfish Steak',
    icon: 'inv_misc_fish_27',
    category: 'consumable',
    group: 'Food',
    summary: '+40 attack power',
    exclusiveGroup: 'food',
    docRef: `${DOC}#34-food`,
    effects: [{ kind: 'stat', stat: 'ap', value: 40 }],
    classicEra: { summary: '+10 Stamina', effects: [{ kind: 'stat', stat: 'sta', value: 10 }] },
    presets: {},
  },
  {
    id: 'grilledSquid',
    name: 'Grilled Squid',
    icon: 'inv_misc_fish_13',
    category: 'consumable',
    group: 'Food',
    summary: '+1% crit',
    exclusiveGroup: 'food',
    docRef: `${DOC}#34-food`,
    // Well Fed 1249523: all crit (aura 290), so spells too.
    effects: [
      { kind: 'stat', stat: 'crit', value: 1 },
      { kind: 'stat', stat: 'spellCrit', value: 1 },
    ],
    classicEra: { summary: '+10 Agility', effects: [{ kind: 'stat', stat: 'agi', value: 10 }] },
    presets: {},
  },
  {
    id: 'flankAuPoivre',
    name: 'Flank au Poivre',
    icon: 'inv_misc_food_48',
    category: 'consumable',
    group: 'Food',
    summary: '+20 Agility',
    exclusiveGroup: 'food',
    docRef: `${DOC}#34-food`,
    // New in Forever (item 250069, Well Fed +20 Agility), so both profiles use it; the feral cat's food (buffs doc §6.3).
    effects: [{ kind: 'stat', stat: 'agi', value: 20 }],
    presets: { dungeon: ['druid-feral-cat', ...ROGUES], raid: ['druid-feral-cat', ...ROGUES], max: ['druid-feral-cat', ...ROGUES] },
  },
  {
    id: 'denseSharpeningStone',
    name: 'Dense Sharpening Stone / Weightstone',
    icon: 'inv_stone_sharpeningstone_05',
    category: 'consumable',
    group: 'Weapon',
    summary: '+8 weapon damage on each weapon',
    docRef: `${DOC}#36-weapon-enhancements-temporary`,
    effects: [{ kind: 'tempEnchant', id: 'denseStone', priority: 1, weaponDamage: 8 }],
    presets: {
      dungeon: [...WARRIOR_DPS, 'paladin-retribution'],
      raid: [...WARRIOR_DPS, 'warrior-protection', 'paladin-retribution'],
      max: [...WARRIOR_DPS, 'warrior-protection', 'paladin-retribution'],
    },
  },
  {
    id: 'elementalSharpeningStone',
    name: 'Elemental Sharpening Stone',
    icon: 'inv_stone_02',
    category: 'consumable',
    group: 'Weapon',
    summary: '+2% crit for each weapon it’s on (replaces the dense stone there)',
    docRef: `${DOC}#36-weapon-enhancements-temporary`,
    // Each stone is its own +2% melee crit aura on the warrior, so two stack [?] (buffs doc §3.6).
    effects: [{ kind: 'tempEnchant', id: 'elementalStone', priority: 2, weapons: [...ELEMENTAL_STONE_WEAPONS], crit: 2 }],
    presets: { max: [...WARRIOR_DPS, 'warrior-protection', 'paladin-retribution'] },
  },
  // The rogue's poisons (buffs doc §3.6; docs/classes/rogue.md §4): one per weapon, in place of a stone there.
  {
    id: 'instantPoisonMainHand',
    name: 'Instant Poison VI (main hand)',
    icon: 'ability_poisons',
    category: 'consumable',
    group: 'Weapon',
    summary: '20% of main-hand hits: 76–100 Nature damage',
    forClasses: ROGUE_ONLY,
    exclusiveGroup: 'poison:mainHand',
    docRef: `${DOC}#36-weapon-enhancements-temporary`,
    effects: poisonOn('main', INSTANT_POISON),
    classicEra: { summary: '20% of main-hand hits: 112–148 Nature damage', effects: poisonOn('main', INSTANT_POISON_CLASSIC_ERA) },
    presets: {},
  },
  {
    id: 'deadlyPoisonMainHand',
    name: 'Deadly Poison V (main hand)',
    icon: 'ability_rogue_dualweild',
    category: 'consumable',
    group: 'Weapon',
    summary: '30% of main-hand hits: 23 Nature damage every 3 s, stacking 5 times',
    forClasses: ROGUE_ONLY,
    exclusiveGroup: 'poison:mainHand',
    docRef: `${DOC}#36-weapon-enhancements-temporary`,
    effects: poisonOn('main', DEADLY_POISON),
    classicEra: { summary: '30% of main-hand hits: 34 Nature damage every 3 s, stacking 5 times', effects: poisonOn('main', DEADLY_POISON_CLASSIC_ERA) },
    // Deadly on the main hand, Instant on the off hand: the rogue's best pair in the first-pass search (docs/classes/rogue.md §4.4).
    presets: { dungeon: ROGUES, raid: ROGUES, max: ROGUES },
  },
  {
    id: 'instantPoisonOffHand',
    name: 'Instant Poison VI (off hand)',
    icon: 'ability_poisons',
    category: 'consumable',
    group: 'Weapon',
    summary: '20% of off-hand hits: 76–100 Nature damage',
    forClasses: ROGUE_ONLY,
    exclusiveGroup: 'poison:offHand',
    docRef: `${DOC}#36-weapon-enhancements-temporary`,
    effects: poisonOn('off', INSTANT_POISON),
    classicEra: { summary: '20% of off-hand hits: 112–148 Nature damage', effects: poisonOn('off', INSTANT_POISON_CLASSIC_ERA) },
    presets: { dungeon: ROGUES, raid: ROGUES, max: ROGUES },
  },
  {
    id: 'deadlyPoisonOffHand',
    name: 'Deadly Poison V (off hand)',
    icon: 'ability_rogue_dualweild',
    category: 'consumable',
    group: 'Weapon',
    summary: '30% of off-hand hits: 23 Nature damage every 3 s, stacking 5 times',
    forClasses: ROGUE_ONLY,
    exclusiveGroup: 'poison:offHand',
    docRef: `${DOC}#36-weapon-enhancements-temporary`,
    effects: poisonOn('off', DEADLY_POISON),
    classicEra: { summary: '30% of off-hand hits: 34 Nature damage every 3 s, stacking 5 times', effects: poisonOn('off', DEADLY_POISON_CLASSIC_ERA) },
    presets: {},
  },
  {
    id: 'mightyRagePotion',
    name: 'Mighty Rage Potion',
    icon: 'inv_potion_41',
    category: 'consumable',
    group: 'Potions and bombs',
    // When it's drunk, if at all, is the spec's Rotation setting (a warrior's execute phase, a cat's
    // Berserk); a spec whose rotation has no potion setting doesn't drink it.
    summary: '45–75 rage and +60 Strength for 20 s, once a fight, if your rotation uses it (see Rotation)',
    // Forever lets warriors and druids drink it (buffs doc §3.5), no one else.
    forClasses: ['warrior', 'druid'],
    docRef: `${DOC}#35-potions-and-runes`,
    effects: [{ kind: 'onUse', id: 'mightyRagePotion', name: 'Mighty Rage Potion', use: MIGHTY_RAGE_POTION }],
    presets: {
      raid: [...WARRIOR_DPS, 'warrior-protection', 'druid-feral-bear'],
      max: [...WARRIOR_DPS, 'warrior-protection', 'druid-feral-cat', 'druid-feral-bear'],
    },
  },
  {
    id: 'majorManaPotion',
    name: 'Major Mana Potion',
    icon: 'inv_potion_76',
    category: 'consumable',
    group: 'Potions and bombs',
    summary: '1,350–2,250 mana, every 2 min; the Rotation tab says when',
    forClasses: MANA_CLASSES,
    docRef: `${DOC}#35-potions-and-runes`,
    effects: [{ kind: 'onUse', id: 'majorManaPotion', name: 'Major Mana Potion', use: MAJOR_MANA_POTION }],
    presets: { raid: [...PALADINS, ...SHAMAN], max: [...PALADINS, ...SHAMAN] },
  },
  {
    id: 'demonicRune',
    name: 'Demonic Rune',
    icon: 'inv_misc_rune_04',
    category: 'consumable',
    group: 'Potions and bombs',
    // A Dark Rune is the same, on the same cooldown, so one entry stands for both.
    summary: '900–1,500 mana (a Dark Rune is the same), every 2 min apart from potions; the Rotation tab says when',
    forClasses: MANA_CLASSES,
    docRef: `${DOC}#35-potions-and-runes`,
    effects: [{ kind: 'onUse', id: 'demonicRune', name: 'Demonic Rune', use: DEMONIC_RUNE }],
    presets: { max: [...PALADINS, ...SHAMAN, ...CASTER_SPECS] },
  },
  {
    id: 'thistleTea',
    name: 'Thistle Tea',
    icon: 'inv_drink_milk_05',
    category: 'consumable',
    group: 'Potions and bombs',
    summary: '+100 Energy, every 5 min; the Rotation tab says when',
    // Forever lets druids use it too (AllowableClass 1032), but only the rogue's rotation drinks it.
    forClasses: ROGUE_ONLY,
    docRef: `${DOC}#35-potions-and-runes`,
    effects: [{ kind: 'onUse', id: 'thistleTea', name: 'Thistle Tea', use: THISTLE_TEA }],
    presets: { raid: ROGUES, max: ROGUES },
  },
  {
    id: 'jujuFlurry',
    name: 'Juju Flurry',
    icon: 'inv_misc_monsterscales_17',
    category: 'consumable',
    group: 'Potions and bombs',
    summary: '+3% attack speed for 20 s, every minute',
    docRef: `${DOC}#33-juju-firewater-blasted-lands-and-other-buffs`,
    effects: [{ kind: 'onUse', id: 'jujuFlurry', name: 'Juju Flurry', use: JUJU_FLURRY }],
    // Retribution uses it on cooldown too: more swings, more Seal of Command procs (buffs doc §6.3).
    presets: { max: [...WARRIOR_DPS, ...RETRIBUTION, ...SHAMAN, ...ROGUES] },
  },
  {
    id: 'ezThroDarkBomb',
    name: 'EZ-Thro Dark Bomb',
    icon: 'inv_misc_bomb_05',
    category: 'consumable',
    group: 'Potions and bombs',
    summary: '225–675 Fire damage, every minute',
    docRef: `${DOC}#37-engineering-and-explosives`,
    effects: [{ kind: 'onUse', id: 'ezThroDarkBomb', name: 'EZ-Thro Dark Bomb' }],
    presets: { max: WARRIOR_DPS },
  },
  {
    id: 'greaterStoneshieldPotion',
    name: 'Greater Stoneshield Potion',
    icon: 'inv_potion_69',
    category: 'consumable',
    group: 'Potions and bombs',
    summary: '+2,000 armor for 2 min',
    docRef: `${DOC}#35-potions-and-runes`,
    effects: [{ kind: 'onUse', id: 'greaterStoneshieldPotion', name: 'Greater Stoneshield Potion' }],
    presets: { max: MELEE_TANKS },
  },
]

export const BUFFS_BY_ID = new Map(BUFFS.map((b) => [b.id, b]))
