// Entries for one kind of spec (`forSpecs`; docs/mechanics/buffs-debuffs-consumables.md "Class-only
// entries", docs/ux.md "Buffs"): what changes only attacks is the melee's, so a caster spec
// (SpecMeta.caster) never sees it in a preset, its Buffs tab, a saved setup or its plan; and the
// caster core's entries are the casters'. A melee or tank spec's presets don't change.
import { describe, expect, it } from 'vitest'
import { normalizeConfig } from '../config/normalize'
import { defaultConfig, FULL_RAID } from '../defaults'
import { buildPlan } from '../plan/build'
import { CLASSIC_ERA, FOREVER } from '../rules/profiles'
import { SPEC_IDS, SPEC_META } from '../specs'
import type { SpecId } from '../types'
import { BUFFS, CASTER_SPECS } from './buffs'
import { forSpecClass, presetBuffIds } from './presets'
import { catalogueEffects, type Effect, type FlatStat } from './types'

const MELEE = [
  'battleShout',
  'blessingOfMight',
  'leaderOfThePack',
  'windfuryTotem',
  'graceOfAir',
  'strengthOfEarth',
  'sunderArmor',
  'exposeArmor',
  'faerieFire',
  'curseOfRecklessness',
  'armorShatter',
  'elixirOfGreaterStrength',
  'jujuPower',
  'winterfallFirewater',
  'jujuMight',
  'roids',
  'groundScorpokAssay',
  'smokedDesertDumplings',
  'mightfishSteak',
  'flankAuPoivre',
  'denseSharpeningStone',
  'elementalSharpeningStone',
  'mightyRagePotion',
  'jujuFlurry',
]

/** Stats that only attacks read: a caster's spells use none of them (character-stats.md, spells.md §3–§5). */
const ATTACK_STATS: readonly FlatStat[] = ['ap', 'str', 'agi', 'crit', 'hit', 'expertise', 'armorPen', 'apPerAgi', 'critRating', 'hitRating', 'expertiseRating']

/** Whether an effect changes only attacks (or the boss's swings, which a caster doesn't take). */
function attacksOnly(e: Effect): boolean {
  switch (e.kind) {
    case 'stat':
      return ATTACK_STATS.includes(e.stat)
    case 'mult':
      return e.stat === 'str' || e.stat === 'agi' || e.stat === 'ap'
    case 'haste':
    case 'tempEnchant':
    case 'targetArmor':
    case 'bossAp':
    case 'weaponDamage':
    case 'weaponCrit':
      return true
    case 'proc':
      return e.proc.trigger === 'meleeLanded'
    case 'onUse':
      // An attack-speed or Strength buff, and rage (Juju Flurry, the Mighty Rage Potion).
      return e.use !== undefined && !e.use.manaTenths && Object.keys(e.use.aura?.mods ?? {}).every((m) => m === 'haste' || m === 'str')
    default:
      return false
  }
}

const casters = SPEC_IDS.filter((s) => SPEC_META[s].caster)
const melee = SPEC_IDS.filter((s) => !SPEC_META[s].caster)

describe('melee and caster entries (forSpecs)', () => {
  it('are these, and the caster specs are those whose SpecMeta sets caster', () => {
    expect(BUFFS.filter((b) => b.forSpecs === 'melee').map((b) => b.id)).toEqual(MELEE)
    expect(CASTER_SPECS).toEqual(casters)
    expect(casters).toEqual(['shaman-elemental', 'mage-fire', 'mage-frost', 'mage-arcane', 'warlock-destruction', 'warlock-affliction'])
  })

  it('mark as melee exactly the entries whose Forever effects change only attacks, and Classic Era’s nothing a spell reads', () => {
    for (const b of BUFFS) {
      const effects = catalogueEffects(b, FOREVER)
      // The boss's swings only a tank takes: listed for every DPS spec, casters too, with a note
      // (Demoralizing Shout and Roar, Thunder Clap; docs/ux.md "Buffs").
      if (effects.every((e) => e.kind === 'bossAp' || e.kind === 'bossSlow')) continue
      // A class-only entry for classes that aren't casters (a rogue's poisons) needs no tag.
      if (b.forClasses && !b.forClasses.some((c) => casters.some((s) => SPEC_META[s].classId === c))) continue
      // Leader of the Pack is the melee's party crit aura, as Moonkin Aura is the casters' (buffs doc
      // §6.2): in `forever` both are all crit, so each is one kind of spec's, never both.
      const only = b.id === 'leaderOfThePack' || effects.every(attacksOnly)
      expect(b.forSpecs === 'melee', b.id).toBe(only)
      // Classic Era's item differs at most by what attacks read, or Stamina (Mightfish Steak's +10).
      // Mongoose's and Grilled Squid's melee crit there stay listed: the Forever item reaches spells.
      if (only) for (const e of catalogueEffects(b, CLASSIC_ERA)) expect(attacksOnly(e) || (e.kind === 'stat' && e.stat === 'sta'), `${b.id} classicEra`).toBe(true)
    }
  })

  it('never reach a caster’s preset, and every melee and tank spec keeps them', () => {
    for (const preset of ['self', 'dungeon', 'raid', 'max'] as const) {
      for (const spec of casters) {
        for (const id of MELEE) expect(presetBuffIds(preset, spec, FULL_RAID), `${spec} ${preset}`).not.toContain(id)
      }
    }
    for (const spec of melee) for (const b of BUFFS) if (b.forSpecs === 'melee') expect(forSpecClass(b, spec), `${spec} ${b.id}`).toBe(forSpecClass({ forClasses: b.forClasses }, spec))
    // The Standard raid a Fury warrior brings is still every attack-power buff and armor debuff.
    expect(presetBuffIds('raid', 'warrior-fury', FULL_RAID)).toEqual(
      expect.arrayContaining(['battleShout', 'blessingOfMight', 'leaderOfThePack', 'windfuryTotem', 'strengthOfEarth', 'sunderArmor', 'faerieFire', 'curseOfRecklessness']),
    )
  })

  it('give a mage’s Standard raid its raid buffs and nothing for attacks', () => {
    expect(presetBuffIds('raid', 'mage-fire', FULL_RAID)).toEqual([
      'blessingOfKings',
      'markOfTheWild',
      'powerWordFortitude',
      'prayerOfSpirit',
      'arcaneBrilliance',
      'blessingOfSalvation',
      'blessingOfWisdom',
      'manaSpringTotem',
      'moonkinAura',
      'curseOfTheElements',
      'greaterArcaneElixir',
      'majorManaPotion',
    ])
  })

  it('are turned off in a saved setup of the other kind, with a note, and do nothing in its plan', () => {
    const fire = defaultConfig('mage-fire')
    const saved = { ...fire, buffs: { ...fire.buffs, enabled: [...fire.buffs.enabled, 'battleShout', 'sunderArmor', 'elixirOfGreaterStrength'] } }
    const { config, warnings } = normalizeConfig(saved)
    expect(config.buffs.enabled).toEqual(fire.buffs.enabled)
    expect(warnings).toEqual([
      'Battle Shout does nothing for a caster, so it was turned off.',
      'Sunder Armor ×5 does nothing for a caster, so it was turned off.',
      'Elixir of Greater Strength does nothing for a caster, so it was turned off.',
    ])
    expect(buildPlan(saved).plan).toEqual(buildPlan(fire).plan)

    const fury = defaultConfig('warrior-fury')
    const withMoonkin = normalizeConfig({ ...fury, buffs: { ...fury.buffs, enabled: [...fury.buffs.enabled, 'moonkinAura'] } })
    expect(withMoonkin.warnings).toEqual(['Moonkin Aura is for casters only, so it was turned off.'])
  })

  it('leave every melee and tank spec’s Buffs list as it was: only the caster core’s entries are hidden from them', () => {
    const hidden = (spec: SpecId) => BUFFS.filter((b) => !forSpecClass(b, spec) && !(b.forClasses && !b.forClasses.includes(SPEC_META[spec].classId))).map((b) => b.id)
    for (const spec of melee) expect(hidden(spec), spec).toEqual(['moonkinAura', 'powerInfusion', 'curseOfTheElements'])
    for (const spec of casters) expect(hidden(spec), spec).toEqual(MELEE.filter((id) => id !== 'mightyRagePotion'))
  })
})
