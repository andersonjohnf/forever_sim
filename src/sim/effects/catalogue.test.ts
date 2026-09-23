// The buff, consumable and enchant catalogue in both rule profiles
// (docs/mechanics/buffs-debuffs-consumables.md#classic-era-values): every entry's values per
// profile against the doc's table of client rows, what a plan with the default buffs and enchants
// gets in each profile, and Classic Era's Windfury Totem taking the main hand's stone slot.
//
// The committed client data (src/data/client) is Forever's only, so the Classic Era values are
// pinned by the table below, which cites each client row. When the raw client tables are cached
// locally (.cache/client/<build>/tables, from `npm run scrape:client`), the last test also checks
// every cited row in both clients; without the cache it's skipped.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { CLASSIC_ERA, FOREVER, type RulesProfile } from '../rules/profiles'
import type { SimConfig } from '../types'
import { BUFFS, BUFFS_BY_ID } from './buffs'
import { ENCHANTS } from './enchants'
import { type CatalogueEntry, catalogueEffects, catalogueSummary, type Effect } from './types'

const withRules = (c: SimConfig, profile: 'forever' | 'classicEra'): SimConfig => ({ ...c, rules: { ...c.rules, profile } })

type Line = [label: string, value: number]

/** An entry's effects as labelled numbers, one line per value (so a proc's internal cooldown or a stone's weapon filter doesn't matter here). */
function digest(effects: Effect[]): Line[] {
  const lines: Line[] = []
  for (const e of effects) {
    switch (e.kind) {
      case 'stat':
        lines.push([e.when?.zones ? `${e.stat} in ${e.when.zones.join('/')}` : e.stat, e.value])
        break
      case 'mult':
        lines.push([`mult ${e.stat}`, e.pct])
        break
      case 'haste':
        lines.push([e.when?.zones ? `haste in ${e.when.zones.join('/')}` : 'haste', e.pct])
        break
      case 'threat':
      case 'bossSlow':
        lines.push([e.kind, round(e.pct)])
        break
      case 'weaponDamage':
      case 'targetArmor':
      case 'bossAp':
        lines.push([e.kind, e.value])
        break
      case 'tempEnchant':
        if (e.weaponDamage) lines.push([`${e.id} weaponDamage`, e.weaponDamage])
        if (e.crit) lines.push([`${e.id} crit`, e.crit])
        break
      case 'proc': {
        const { id, chance, action } = e.proc
        lines.push('pct' in chance ? [`${id} chance %`, chance.pct] : [`${id} ppm`, chance.ppm])
        if (action.kind === 'extraAttacks') lines.push([`${id} bonusAp`, action.bonusAp ?? 0])
        else if (action.kind === 'aura') for (const [mod, v] of Object.entries(action.aura.mods)) lines.push([`${id} ${mod}`, v])
        else if (action.kind === 'spellDamage') lines.push([`${id} ${action.school}`, action.min], ...(action.max !== action.min ? [[`${id} ${action.school} max`, action.max] as Line] : []))
        else lines.push([`${id} ${action.kind}`, NaN])
        break
      }
      case 'onUse': {
        const use = e.use
        if (!use) {
          lines.push([`${e.id} (not simulated)`, 0])
          break
        }
        if (use.rageTenths || use.rageSpreadTenths) lines.push([`${e.id} rage tenths min`, use.rageTenths], [`${e.id} rage tenths max`, use.rageTenths + use.rageSpreadTenths])
        for (const [mod, v] of Object.entries(use.aura?.mods ?? {})) lines.push([`${e.id} ${mod}`, v])
        break
      }
      default:
        lines.push([e.kind, NaN])
    }
  }
  return lines
}

const round = (x: number) => Math.round(x * 1e6) / 1e6

/**
 * A client row a value comes from. `spell`: a SpellEffect row (Forever `EffectBasePointsF`;
 * Classic Era `EffectBasePoints` + 1 when `EffectDieSides` is 1, or the bounds of the roll),
 * times `times`. `enchant`: a SpellItemEnchantment row's `EffectPointsMin` for that slot, or its
 * equip spell's first effect; `via` is the spell whose enchant effect (53 or 54) applies it.
 * `null`: not in the client (a tooltip value, or a server-side rate).
 */
type Ref = { spell: number; effect?: number; times?: number; bound?: 'min' | 'max' } | { enchant: number; slot?: number; via?: number } | null

const S = (spell: number, effect = 0, extra: { times?: number; bound?: 'min' | 'max' } = {}): Ref => ({ spell, effect, ...extra })
const E = (enchant: number, via?: number, slot = 0): Ref => ({ enchant, via, slot })

/**
 * Every catalogue entry, as in the doc's table ("Classic Era values"). `forever`/`classicEra`: the
 * expected values where the two differ (`classicEra` absent: the same in both). `rows`: the client
 * rows of the values, in `digest` order (both clients, or Forever's when `classicRows` is given).
 * `foreverOnly`: new in Forever (or only a Season of Discovery row in the 1.15 client), so there's
 * no Classic Era value and both profiles use Forever's.
 */
interface Row {
  forever?: Line[]
  classicEra?: Line[]
  rows: Ref[]
  classicRows?: Ref[]
  foreverOnly?: true
}

const ROWS: Record<string, Row> = {
  // Raid buffs
  battleShout: { forever: [['ap', 139]], classicEra: [['ap', 232]], rows: [S(25289)] },
  blessingOfMight: { forever: [['ap', 133]], classicEra: [['ap', 185]], rows: [S(25291)] },
  blessingOfKings: { rows: [S(20217)] },
  markOfTheWild: {
    forever: [['str', 16], ['agi', 16], ['sta', 16], ['int', 16], ['spi', 16], ['bonusArmor', 385]],
    classicEra: [['str', 12], ['agi', 12], ['sta', 12], ['int', 12], ['spi', 12], ['bonusArmor', 285]],
    rows: [S(21850, 1), S(21850, 1), S(21850, 1), S(21850, 1), S(21850, 1), S(21850, 0)],
  },
  powerWordFortitude: { forever: [['sta', 70]], classicEra: [['sta', 54]], rows: [S(21564)] },
  leaderOfThePack: { rows: [S(24932)] },
  windfuryTotem: {
    forever: [['windfury chance %', 20], ['windfury bonusAp', 246]],
    classicEra: [['windfury chance %', 20], ['windfury bonusAp', 315]],
    rows: [E(564), S(10610)],
  },
  graceOfAir: { forever: [['agi', 89]], classicEra: [['agi', 77]], rows: [S(25360)] },
  strengthOfEarth: { forever: [['str', 53]], classicEra: [['str', 77]], rows: [S(25362)] },
  blessingOfSalvation: { rows: [S(1038)] },
  devotionAura: { rows: [S(10293)] },
  // Target debuffs
  sunderArmor: { rows: [S(11597, 0, { times: 5 })] },
  // Both clients have 0 here (combo points scale it server-side): tooltip values.
  exposeArmor: { forever: [['targetArmor', 2250]], classicEra: [['targetArmor', 1700]], rows: [null] },
  faerieFire: { rows: [S(9907)] },
  // Forever's effect #0 is a dummy (no attack power for the target).
  curseOfRecklessness: {
    forever: [['targetArmor', 505], ['bossAp', 0]],
    classicEra: [['targetArmor', 640], ['bossAp', 90]],
    rows: [S(11717, 1), null],
    classicRows: [S(11717, 1), S(11717, 0)],
  },
  armorShatter: { forever: [['targetArmor', 495]], classicEra: [['targetArmor', 600]], rows: [S(16928, 0, { times: 3 })] },
  // The base points; the per-level term is OQ 19's.
  demoralizingShout: { forever: [['bossAp', -196]], classicEra: [['bossAp', -140]], rows: [S(11556)] },
  thunderClap: { forever: [['bossSlow', 20]], classicEra: [['bossSlow', 10]], rows: [S(11581, 1)] },
  // Consumables
  elixirOfTheMongoose: { rows: [S(17538, 0), S(17538, 1)] },
  elixirOfGreaterStrength: { rows: [S(11405)] },
  jujuPower: { rows: [S(16323)] },
  elixirOfGreaterDefense: { rows: [S(11348)] },
  elixirOfFortitude: { foreverOnly: true, rows: [S(1250928)] },
  flaskOfTheTitans: { rows: [S(17626)] },
  flaskOfNaturalAccuracy: { foreverOnly: true, rows: [S(1293740, 0), S(1293740, 1)] },
  flaskOfNaturalAggression: { foreverOnly: true, rows: [S(1293741, 0), S(1293741, 1)] },
  flaskOfNaturalPrecision: { foreverOnly: true, rows: [S(1293742, 0), S(1293742, 1)] },
  flaskOfNaturalSwiftness: { foreverOnly: true, rows: [S(1293743, 0), S(1293743, 1)] },
  winterfallFirewater: { rows: [S(17038)] },
  jujuMight: { rows: [S(16329)] },
  roids: { rows: [S(10667)] },
  groundScorpokAssay: { rows: [S(10669)] },
  rumseyRum: { rows: [S(25804)] },
  // Forever: Nutritious Food's aura 227 amount (the item's spell); Classic Era: the Well Fed buff.
  smokedDesertDumplings: { rows: [S(1248401, 1)], classicRows: [S(24799)] },
  mightfishSteak: { forever: [['ap', 40]], classicEra: [['sta', 10]], rows: [S(1249515, 1)], classicRows: [S(18191)] },
  grilledSquid: { forever: [['crit', 1]], classicEra: [['agi', 10]], rows: [S(1249522, 1)], classicRows: [S(18192)] },
  denseSharpeningStone: { rows: [E(1643, 16138)] },
  elementalSharpeningStone: { rows: [E(2506, 22756)] },
  mightyRagePotion: { rows: [S(17528, 0, { bound: 'min' }), S(17528, 0, { bound: 'max' }), S(17528, 1)] },
  jujuFlurry: { rows: [S(16322)] },
  ezThroDarkBomb: { foreverOnly: true, rows: [null] },
  greaterStoneshieldPotion: { rows: [null] },
  // Enchants
  crusader: { rows: [null, S(20007)] },
  weaponAgility: { rows: [E(2564, 23800)] },
  weaponStrength: { rows: [E(2563, 23799)] },
  superiorStriking: { rows: [E(1897, 20031)] },
  fieryWeapon: { rows: [null, S(13897)] },
  twoHandAgility: { rows: [E(2646, 27837)] },
  twoHandStrength: { foreverOnly: true, rows: [E(8215, 1248668)] },
  twoHandLesserStrength: { foreverOnly: true, rows: [E(2563, 1248511)] },
  superiorImpact: { rows: [E(1896, 20030)] },
  arcanumVoracityStrength: { rows: [E(1506)] },
  arcanumVoracityAgility: { rows: [E(1508)] },
  arcanumVoracityStamina: { rows: [E(1507)] },
  arcanumConstitution: { rows: [E(1503)] },
  arcanumTenacity: { rows: [E(1504)] },
  arcanumRapidity: { rows: [E(2543)] },
  arcanumProtection: { rows: [E(2545)] },
  presenceOfMight: { rows: [S(24148, 0), S(24148, 2), S(24148, 1)] },
  forcefulRuggedArmorKit: { foreverOnly: true, rows: [E(8491, 1254772, 1), E(8491, 1254772, 0)] },
  wildLeatherArmorKit: { foreverOnly: true, rows: [E(8719, 1306907, 0), E(8719, 1306907, 1)] },
  ruggedArmorKit: {
    forever: [['sta', 5], ['bonusArmor', 40]],
    classicEra: [['bonusArmor', 40]],
    rows: [E(8490, 19057, 1), E(8490, 19057, 0)],
    classicRows: [E(1843, 19057)],
  },
  coreArmorKit: { rows: [E(2503, 22725)] },
  zandalarSignetOfMight: { rows: [E(2606)] },
  mightOfTheScourge: { rows: [S(29482, 2), S(29482, 1)] },
  fortitudeOfTheScourge: { rows: [S(29481, 1), S(29481, 2)] },
  // The 1.15 client's rows for these are Season of Discovery's (a forbidden source).
  cloakAgility: { foreverOnly: true, rows: [E(7667, 1219587)] },
  cloakLesserAgility: { rows: [E(849, 13882)] },
  cloakSuperiorDefense: { rows: [E(1889, 20015)] },
  cloakGreaterDefense: { forever: [['bonusArmor', 60]], classicEra: [['bonusArmor', 50]], rows: [E(884, 13746)] },
  cloakDodge: { rows: [E(2622, 25086)] },
  cloakSubtlety: { rows: [E(2621, 25084)] },
  chestGreaterStats: { rows: Array(5).fill(E(1891, 20025)) },
  chestStats: { rows: Array(5).fill(E(928, 13941)) },
  chestMajorStamina: { forever: [['sta', 10]], classicEra: [['health', 100]], rows: [E(1892, 20026)] },
  bracerSuperiorStrength: { rows: [E(1885, 20010)] },
  bracerGreaterStrength: { rows: [E(927, 13939)] },
  bracerSuperiorAgility: { foreverOnly: true, rows: [E(7656, 1248599)] },
  bracerSuperiorStamina: { rows: [E(1886, 20011)] },
  bracerDeflection: { forever: [['defense', 7]], classicEra: [['defense', 3]], rows: [E(923, 13931)] },
  bracerSuperiorDeflection: { foreverOnly: true, rows: [E(8214, 1248665)] },
  gloveSuperiorStrength: { foreverOnly: true, rows: [E(2563, 1248640)] },
  gloveSuperiorAgility: { rows: [E(2564, 25080)] },
  // The enchanting spell applies another enchant in each client.
  gloveGreaterStrength: { forever: [['str', 10]], classicEra: [['str', 7]], rows: [E(8207, 20013)], classicRows: [E(927, 20013)] },
  gloveGreaterAgility: { forever: [['agi', 10]], classicEra: [['agi', 7]], rows: [E(8206, 20012)], classicRows: [E(1887, 20012)] },
  gloveStrength: { forever: [['str', 7]], classicEra: [['str', 5]], rows: [E(927, 13887)], classicRows: [E(856, 13887)] },
  gloveAgility: { forever: [['agi', 7]], classicEra: [['agi', 5]], rows: [E(1887, 13815)], classicRows: [E(904, 13815)] },
  gloveMinorHaste: { rows: [E(931, 13948)] },
  gloveThreat: { rows: [E(2613, 25072)] },
  bootsGreaterAgility: { rows: [E(1887, 20023)] },
  bootsAgility: { rows: [E(904, 13935)] },
  bootsGreaterStamina: { rows: [E(929, 20020)] },
  shieldGreaterStamina: { forever: [['sta', 9]], classicEra: [['sta', 7]], rows: [E(1886, 20017)], classicRows: [E(929, 20017)] },
  shieldExcellentStamina: { foreverOnly: true, rows: [E(7663, 1219581)] },
  shieldCriticalStrike: { foreverOnly: true, rows: [S(1220596, 0), S(1220596, 1)] },
  shieldLesserBlock: { rows: [E(863, 13689)] },
  neckStrength: { foreverOnly: true, rows: [E(856, 1249019)] },
  neckAgility: { foreverOnly: true, rows: [E(904, 1249059)] },
}

const ENTRIES: [string, CatalogueEntry][] = [...BUFFS.map((b) => [b.id, b] as [string, CatalogueEntry]), ...ENCHANTS.map((e) => [e.id, e] as [string, CatalogueEntry])]

describe('the catalogue in both profiles (buffs doc, Classic Era values)', () => {
  it('lists every entry once in the table, as the doc does', () => {
    expect(Object.keys(ROWS).sort()).toEqual(ENTRIES.map(([id]) => id).sort())
    expect(ENTRIES).toHaveLength(98)
  })

  it.each(ENTRIES)('%s: Forever’s values, and Classic Era’s where they differ', (id, entry) => {
    const row = ROWS[id]
    const forever = digest(catalogueEffects(entry, FOREVER))
    const classic = digest(catalogueEffects(entry, CLASSIC_ERA))
    if (row.forever) expect(forever).toEqual(row.forever)
    expect(classic).toEqual(row.classicEra ?? forever)
    // An entry is in the table as differing exactly when its values differ.
    expect(row.classicEra !== undefined, 'differs').toBe(JSON.stringify(classic) !== JSON.stringify(forever))
    expect(row.rows, 'one client row per value').toHaveLength(forever.length)
    if (row.classicRows) expect(row.classicRows).toHaveLength(classic.length)
    // Forever-only entries have no Classic Era values of their own.
    if (row.foreverOnly) expect(entry.classicEra).toBeUndefined()
  })

  it('shows each profile’s own numbers in the summaries of the entries that differ', () => {
    const numbers = (text: string) => [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replaceAll(',', '')))
    for (const [id, entry] of ENTRIES) {
      if (!entry.classicEra) continue
      for (const profile of [FOREVER, CLASSIC_ERA]) {
        const values = digest(catalogueEffects(entry, profile)).map(([, v]) => Math.abs(round(v)))
        const summary = catalogueSummary(entry, profile)
        for (const n of numbers(summary)) expect(values, `${id} (${profile.id}): “${summary}”`).toContain(n)
      }
    }
    expect(catalogueSummary(BUFFS_BY_ID.get('battleShout')!, FOREVER)).toBe('+139 attack power')
    expect(catalogueSummary(BUFFS_BY_ID.get('battleShout')!, CLASSIC_ERA)).toBe('+232 attack power')
    expect(catalogueSummary(BUFFS_BY_ID.get('blessingOfKings')!, CLASSIC_ERA)).toBe('+10% all stats')
  })
})

describe('a plan per profile', () => {
  const fury = defaultConfig('warrior-fury')
  const noBuffs: SimConfig = { ...fury, buffs: { ...fury.buffs, enabled: [] } }
  const FLAT = ['str', 'agi', 'sta', 'int', 'spi', 'ap', 'crit', 'bonusArmor', 'health'] as const
  const numbers = (config: SimConfig) => {
    const { plan } = buildPlan(config)
    return {
      ...Object.fromEntries(FLAT.map((k) => [k, plan.stats[k]])),
      targetArmor: plan.fight.targetArmor,
      mainHandStone: plan.weapons[0]!.flatDamage,
      offHandStone: plan.weapons[1]!.flatDamage,
    }
  }
  const delta = (a: Record<string, number>, b: Record<string, number>) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] - b[k]]))

  it('gets the expected stats from the default (Standard raid) buffs in each profile', () => {
    expect(fury.buffs.enabled).toEqual([
      'battleShout',
      'blessingOfMight',
      'blessingOfKings',
      'markOfTheWild',
      'powerWordFortitude',
      'leaderOfThePack',
      'windfuryTotem',
      'strengthOfEarth',
      'blessingOfSalvation',
      'sunderArmor',
      'faerieFire',
      'curseOfRecklessness',
      'elixirOfTheMongoose',
      'elixirOfGreaterStrength',
      'winterfallFirewater',
      'smokedDesertDumplings',
      'denseSharpeningStone',
      'mightyRagePotion',
    ])
    const buffs = (profile: 'forever' | 'classicEra') => delta(numbers(withRules(fury, profile)), numbers(withRules(noBuffs, profile)))
    // Battle Shout is the rotation's own (an aura in the fight), Kings a multiplier and the potion a cast,
    // so none of them is here. Forever: Strength of Earth 53 + Gift of the Wild 16 + Giants 25 +
    // Dumplings 20; Mongoose 25; Prayer of Fortitude 70; Might 133 + Firewater 35; Leader of the Pack
    // 3 + Mongoose 2; Sunder 2250 + Faerie Fire 505 + Recklessness 505; the stone on each weapon.
    expect(buffs('forever')).toEqual({
      str: 114,
      agi: 41,
      sta: 86,
      int: 16,
      spi: 16,
      ap: 168,
      crit: 5,
      bonusArmor: 385,
      health: 0,
      targetArmor: -3260,
      mainHandStone: 8,
      offHandStone: 8,
    })
    // Classic Era: Strength of Earth 77, Gift of the Wild 12 and 285, Fortitude 54, Might 185,
    // Recklessness 640, and Windfury Totem holds the main hand's temporary-enchant slot.
    expect(buffs('classicEra')).toEqual({
      str: 134,
      agi: 37,
      sta: 66,
      int: 12,
      spi: 12,
      ap: 220,
      crit: 5,
      bonusArmor: 285,
      health: 0,
      targetArmor: -3395,
      mainHandStone: 0,
      offHandStone: 8,
    })
  })

  it('gets Classic Era’s glove enchant, and nothing else changes, from the default enchants', () => {
    const forever = buildPlan(withRules(noBuffs, 'forever')).plan.stats
    const classic = buildPlan(withRules(noBuffs, 'classicEra')).plan.stats
    const changed = Object.fromEntries(
      Object.entries(classic)
        .filter(([k, v]) => typeof v === 'number' && v !== (forever as unknown as Record<string, number>)[k])
        .map(([k, v]) => [k, (v as number) - (forever as unknown as Record<string, number>)[k]]),
    )
    // Gloves – Greater Strength: +10 in Forever, +7 in Classic Era (the cloak and necklace enchants are Forever's in both).
    expect(fury.gear.hands?.enchantId).toBe('gloveGreaterStrength')
    expect(changed).toEqual({ str: -3 })
  })

  it('buffs doc example 5 in Classic Era: another warrior’s Battle Shout and Blessing of Might, untalented, add 417', () => {
    const rotation = { 'warrior.fury.battleShout.enabled': false }
    const bare: SimConfig = { ...noBuffs, gear: {}, talents: '', rotation }
    const ap = (profile: 'forever' | 'classicEra', enabled: string[]) =>
      buildPlan(withRules({ ...bare, buffs: { raid: ['warrior', 'paladin'], enabled } }, profile)).sheet.attackPower
    expect(ap('forever', ['battleShout', 'blessingOfMight']) - ap('forever', [])).toBe(272)
    expect(ap('classicEra', ['battleShout', 'blessingOfMight']) - ap('classicEra', [])).toBe(232 + 185)
  })

  it('counts the rotation’s own Battle Shout on the sheet at the value the fight uses, in both profiles', () => {
    for (const profile of ['forever', 'classicEra'] as const) {
      const own = buildPlan(withRules(fury, profile))
      const none = buildPlan(
        withRules({ ...fury, rotation: { 'warrior.fury.battleShout.enabled': false }, buffs: { ...fury.buffs, enabled: fury.buffs.enabled.filter((id) => id !== 'battleShout') } }, profile),
      )
      const aura = own.plan.auras.find((a) => a.id === 'battleShout')!
      expect(own.plan.stats.apMult).toBe(1)
      expect(own.sheet.attackPower - none.sheet.attackPower, profile).toBe(aura.ap)
    }
  })
})

describe('Windfury Totem and a main-hand stone (buffs doc, Windfury Totem)', () => {
  const fury = defaultConfig('warrior-fury')
  const setup = (profile: 'forever' | 'classicEra', enabled: string[]) =>
    buildPlan(withRules({ ...fury, buffs: { raid: fury.buffs.raid, enabled } }, profile))
  const stones = (bundle: ReturnType<typeof buildPlan>) => bundle.plan.weapons.map((w) => w?.flatDamage)
  const notes = (bundle: ReturnType<typeof buildPlan>) => bundle.assumptions.map((a) => a.id)

  it('Forever: the totem is a party aura, so both hands keep their stone, and the result says so [?]', () => {
    const both = setup('forever', ['windfuryTotem', 'denseSharpeningStone'])
    expect(stones(both)).toEqual([8, 8])
    expect(notes(both)).toContain('windfuryStone')
    expect(both.plan.procs.some((p) => p.id === 'windfury')).toBe(true)
  })

  it('Classic Era: the totem’s enchant takes the main hand’s slot; the off hand keeps its stone [C]', () => {
    const both = setup('classicEra', ['windfuryTotem', 'denseSharpeningStone'])
    expect(stones(both)).toEqual([0, 8])
    expect(notes(both)).not.toContain('windfuryStone')
    expect(both.plan.procs.find((p) => p.id === 'windfury')!.a).toBe(315)
    // Without the totem, or without a shaman to drop it, the main hand keeps its stone.
    expect(stones(setup('classicEra', ['denseSharpeningStone']))).toEqual([8, 8])
    const noShaman = buildPlan(
      withRules({ ...fury, buffs: { raid: fury.buffs.raid.filter((c) => c !== 'shaman'), enabled: ['windfuryTotem', 'denseSharpeningStone'] } }, 'classicEra'),
    )
    expect(stones(noShaman)).toEqual([8, 8])
  })

  it('Classic Era with a two-hander: no stone at all under the totem', () => {
    const arms = defaultConfig('warrior-arms')
    const plan = (profile: 'forever' | 'classicEra') => buildPlan(withRules(arms, profile)).plan
    expect(arms.buffs.enabled).toEqual(expect.arrayContaining(['windfuryTotem', 'denseSharpeningStone']))
    expect(plan('forever').weapons[0]!.flatDamage).toBe(8)
    expect(plan('classicEra').weapons[0]!.flatDamage).toBe(0)
  })
})

// --- The cited client rows, when the raw client tables are cached locally -------------------------

const FOREVER_BUILD = '1.60.1.69913'
const CLASSIC_BUILD = '1.15.9.69722'
const TABLES = import.meta.glob<string>(
  [
    '/.cache/client/1.60.1.69913/tables/{SpellEffect,SpellItemEnchantment}.ndjson',
    '/.cache/client/1.15.9.69722/tables/{SpellEffect,SpellItemEnchantment}.ndjson',
  ],
  { query: '?raw', import: 'default' },
)
type ClientRow = Record<string, number | number[]>

async function load(build: string, table: string): Promise<ClientRow[]> {
  const raw = await TABLES[`/.cache/client/${build}/tables/${table}.ndjson`]()
  // The first line is the parser's header, then one row per line.
  return raw.split('\n').slice(1).filter(Boolean).map((line) => JSON.parse(line) as ClientRow)
}

class Client {
  readonly build: string
  private readonly effects = new Map<number, ClientRow[]>()
  private readonly enchants = new Map<number, ClientRow>()

  private constructor(build: string) {
    this.build = build
  }

  static async open(build: string): Promise<Client> {
    const client = new Client(build)
    for (const r of await load(build, 'SpellEffect')) {
      if (r.DifficultyID !== 0) continue
      const list = client.effects.get(r.SpellID as number) ?? []
      list.push(r)
      client.effects.set(r.SpellID as number, list)
    }
    for (const r of await load(build, 'SpellItemEnchantment')) client.enchants.set(r.ID as number, r)
    return client
  }

  private effect(spell: number, index: number): ClientRow {
    const row = this.effects.get(spell)?.find((r) => r.EffectIndex === index)
    if (!row) throw new Error(`${this.build}: no SpellEffect ${spell} #${index}`)
    return row
  }

  /** The value a row gives at level 60 before any per-level term (see `Ref`). */
  value(ref: Exclude<Ref, null>): number {
    if ('spell' in ref) {
      const r = this.effect(ref.spell, ref.effect ?? 0)
      let v: number
      if (this.build === FOREVER_BUILD) {
        const spread = ((r.Variance as number) ?? 0) / 2
        const bpf = r.EffectBasePointsF as number
        v = ref.bound === 'min' ? bpf * (1 - spread) : ref.bound === 'max' ? bpf * (1 + spread) : bpf
      } else {
        const bp = r.EffectBasePoints as number
        const die = r.EffectDieSides as number
        if (!ref.bound && die > 1) throw new Error(`${this.build}: SpellEffect ${ref.spell} is a roll`)
        v = ref.bound === 'max' ? bp + die : die > 0 ? bp + 1 : bp
      }
      return v * (ref.times ?? 1)
    }
    const row = this.enchants.get(ref.enchant)
    if (!row) throw new Error(`${this.build}: no SpellItemEnchantment ${ref.enchant}`)
    if (ref.via !== undefined) {
      const applies = (this.effects.get(ref.via) ?? []).some((r) => [53, 54].includes(r.Effect as number) && (r.EffectMiscValue as number[])[0] === ref.enchant)
      expect(applies, `${this.build}: spell ${ref.via} applies enchant ${ref.enchant}`).toBe(true)
    }
    const slot = ref.slot ?? 0
    const type = (row.Effect as number[])[slot]
    // 3: an equip spell; 1 (a proc: its chance), 2 (weapon damage), 4 (armor), 5 (a stat): the points.
    return type === 3 ? this.value({ spell: (row.EffectArg as number[])[slot] }) : (row.EffectPointsMin as number[])[slot]
  }
}

describe('the cited client rows', () => {
  const cached = Object.keys(TABLES).length === 4
  it.skipIf(!cached)(`match the raw client tables (${FOREVER_BUILD} and ${CLASSIC_BUILD}, cached locally)`, async () => {
    const [forever, classic] = await Promise.all([Client.open(FOREVER_BUILD), Client.open(CLASSIC_BUILD)])
    const check = (client: Client, profile: RulesProfile, id: string, entry: CatalogueEntry, refs: Ref[]) => {
      const lines = digest(catalogueEffects(entry, profile))
      refs.forEach((ref, i) => {
        if (ref) expect(Math.abs(round(client.value(ref))), `${id} ${lines[i][0]} (${client.build})`).toBe(Math.abs(round(lines[i][1])))
      })
    }
    for (const [id, entry] of ENTRIES) {
      const row = ROWS[id]
      check(forever, FOREVER, id, entry, row.rows)
      if (!row.foreverOnly) check(classic, CLASSIC_ERA, id, entry, row.classicRows ?? row.rows)
    }
  })
})
