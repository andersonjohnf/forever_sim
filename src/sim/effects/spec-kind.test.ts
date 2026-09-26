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
  'giftOfArthas',
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
  'majorFrenzyPotion',
]

/** Stats that only attacks read: a caster's spells use none of them (character-stats.md, spells.md §3–§5). */
// Ranged attack power too: only a hunter's shots read it (Juju Might's; docs/classes/hunter.md).
const ATTACK_STATS: readonly FlatStat[] = ['ap', 'rap', 'str', 'agi', 'crit', 'hit', 'expertise', 'armorPen', 'apPerAgi', 'critRating', 'hitRating', 'expertiseRating']

/** Whether an effect changes only attacks (or the boss's swings, which a caster doesn't take). */
function attacksOnly(e: Effect): boolean {
  switch (e.kind) {
    case 'stat':
      return ATTACK_STATS.includes(e.stat)
    case 'mult':
      return e.stat === 'str' || e.stat === 'agi' || e.stat === 'ap'
    // A wizard oil's spell damage is a spell's too (buffs doc §3.6).
    case 'tempEnchant':
      return !e.spellDamage && !e.spellCrit
    case 'haste':
    case 'targetArmor':
    case 'physicalTaken':
    case 'bossAp':
    case 'weaponDamage':
    case 'weaponCrit':
      return true
    case 'proc':
      return e.proc.trigger === 'meleeLanded'
    case 'onUse':
      // An attack-speed, Strength or attack power buff, and rage (Juju Flurry, the Mighty Rage and
      // Major Frenzy Potions).
      return e.use !== undefined && !e.use.manaTenths && !e.use.spell && Object.keys(e.use.aura?.mods ?? {}).every((m) => m === 'haste' || m === 'str' || m === 'ap' || m === 'rap')
    default:
      return false
  }
}

const casters = SPEC_IDS.filter((s) => SPEC_META[s].caster)
/**
 * The melee's debuffs on the boss, which a caster whose pet swings keeps (SpecMeta.petMelee: Demonology,
 * docs/classes/warlock.md §11.2): the armor debuffs, and Gift of Arthas' +8 on each physical hit.
 */
const ARMOR = ['sunderArmor', 'exposeArmor', 'faerieFire', 'curseOfRecklessness', 'armorShatter', 'giftOfArthas']
/** The melee entries a caster doesn't get. */
const meleeFor = (spec: SpecId) => (SPEC_META[spec].petMelee ? MELEE.filter((id) => !ARMOR.includes(id)) : MELEE)
const melee = SPEC_IDS.filter((s) => !SPEC_META[s].caster)

describe('melee and caster entries (forSpecs)', () => {
  it('are these, and the caster specs are those whose SpecMeta sets caster', () => {
    expect(BUFFS.filter((b) => b.forSpecs === 'melee').map((b) => b.id)).toEqual(MELEE)
    expect(CASTER_SPECS).toEqual(casters)
    expect(casters).toEqual(['druid-balance', 'shaman-elemental', 'mage-fire', 'mage-frost', 'mage-arcane', 'warlock-destruction', 'warlock-affliction', 'warlock-demonology', 'priest-shadow'])
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
        for (const id of meleeFor(spec)) expect(presetBuffIds(preset, spec, FULL_RAID), `${spec} ${preset}`).not.toContain(id)
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

  it('give a Balance druid’s Standard raid the casters’ raid buffs: its own Moonkin Aura, and no Leader of the Pack (docs/classes/druid.md §11.6)', () => {
    expect(presetBuffIds('raid', 'druid-balance', FULL_RAID)).toEqual(presetBuffIds('raid', 'mage-fire', FULL_RAID))
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
    // The Mighty Rage Potion is a warrior's and a druid's: a Balance druid's class could drink it.
    for (const spec of casters) expect(hidden(spec), spec).toEqual(SPEC_META[spec].classId === 'druid' ? meleeFor(spec) : meleeFor(spec).filter((id) => id !== 'mightyRagePotion'))
  })

  it('give a caster whose pet swings the boss’s armor debuffs and Gift of Arthas, in its presets too: the Demonology warlock (ranged-and-pets.md §8)', () => {
    expect(casters.filter((s) => SPEC_META[s].petMelee)).toEqual(['warlock-demonology'])
    for (const id of ARMOR) expect(forSpecClass(BUFFS.find((b) => b.id === id)!, 'warlock-demonology'), id).toBe(true)
    expect(presetBuffIds('raid', 'warlock-demonology', FULL_RAID)).toEqual(expect.arrayContaining(['sunderArmor', 'faerieFire', 'curseOfRecklessness']))
    expect(presetBuffIds('raid', 'warlock-demonology', FULL_RAID)).not.toContain('battleShout')
    expect(presetBuffIds('max', 'warlock-demonology', FULL_RAID)).toContain('giftOfArthas')
  })
})
