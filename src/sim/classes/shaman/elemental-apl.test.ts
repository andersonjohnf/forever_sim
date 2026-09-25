// The Elemental shaman's rotation as a priority list (decision D31; docs/classes/shaman.md
// "Elemental priority" and "Elemental priority list (A2)"): the rows cover every setting, the list in
// its default order plays exactly as the rotation played before it, and the compiler follows the
// stored order, a moved row keeping its own conditions.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { DEMONIC_RUNE, MAJOR_MANA_POTION, POWER_INFUSION } from '../../effects/buffs'
import { ITEM_EFFECTS } from '../../effects/items'
import { normalizeConfig } from '../../config/normalize'
import { getSpec, rotationPreset } from '../../index'
import { buildPlan } from '../../plan/build'
import { runChunk } from '../../engine/chunk'
import { FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import { emptyAggregate, mergeChunk } from '../../run/aggregate'
import { COND } from '../../plan/types'
import { CUSTOM_APL_PRESET, DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder, storedAplOrder } from '../apl'
import { ELEMENTAL_APL, ELEMENTAL_IDS as ID, ELEMENTAL_OPTIONS, elementalRotation, elementalUnusedSettings } from './elemental'
import { elementalCases, fingerprint, planJson } from './elemental-apl-cases'

const SPEC = 'shaman-elemental'
const TALENTS = talentRanksByName(TALENT_DATA.shaman, defaultConfig(SPEC).talents)
const CONTEXT = { race: 'horde-orc', maxMana: 6000, items: [ITEM_EFFECTS[272438].use!], consumables: [POWER_INFUSION, MAJOR_MANA_POTION, DEMONIC_RUNE] }
/** Clearcasting is the plan's first aura. */
const auraIndex = (id: string) => (id === 'elementalClearcasting' ? 0 : -1)
type Rot = ReturnType<typeof elementalRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const conditionsOf = (r: Rot, id: string) => r.rotation.filter((e) => r.abilities[e.ability].id === id).map((e) => e.conditions)
/** The default order with `id` moved to just before `before` (or last). */
const moved = (id: string, before?: string) => {
  const order = defaultAplOrder(ELEMENTAL_APL)
  const to = before === undefined ? order.length - 1 : order.indexOf(before) - (order.indexOf(id) < order.indexOf(before) ? 1 : 0)
  return moveAplRow(ELEMENTAL_APL, order, id, to)!
}
const DEFAULT_IDS = [
  'bloodFury',
  'weaknessAnalyzer',
  'powerInfusion',
  'manaTideTotem',
  'majorManaPotion',
  'demonicRune',
  'flameShock',
  'lavaBurst',
  'chainLightning',
  'lightningBolt',
  'lightningBolt',
  'lightningBoltRank4',
]

describe('the Elemental shaman’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    const known = new Set(ELEMENTAL_OPTIONS.map((o) => o.id))
    const placed = new Set([...ELEMENTAL_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...ELEMENTAL_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    for (const row of ELEMENTAL_APL.rows) {
      if (row.enabledId) expect(ELEMENTAL_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      else expect(row.help, row.id).toBeTruthy()
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    }
    expect(new Set(ELEMENTAL_APL.rows.map((r) => r.id)).size).toBe(ELEMENTAL_APL.rows.length)
    expect(ELEMENTAL_APL.rows.filter((r) => r.pinned)).toEqual([])
    expect(ELEMENTAL_APL.presets).toEqual([])
    // Lightning Bolt, the filler, is a row of the list now, not a fixed row.
    expect(ELEMENTAL_APL.rows.at(-1)?.id).toBe('lightningBolt')
    expect(getSpec(SPEC).rotationFixed).toEqual([])
  })

  it('gives 200 random setups the plan they had before the list, in the default order', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Elemental plays.
    const plans = elementalCases(ELEMENTAL_OPTIONS, 200).map((config) => buildPlan({ ...config, rotationOrder: defaultAplOrder(ELEMENTAL_APL) }).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover Lava Burst, Mana Tide, rank 4 Lightning Bolt and Chain Lightning on and off.
    const count = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['lavaBurst', 'manaTideTotem', 'lightningBoltRank4', 'chainLightning', 'flameShock']) {
      expect(count(id), id).toBeGreaterThan(20)
      expect(count(id), id).toBeLessThan(195)
    }
    expect(hashes).toMatchSnapshot()
  })

  it('gives the same list in the default order as with none, in shaman.md’s order', () => {
    const none = elementalRotation({}, TALENTS, auraIndex, CONTEXT)
    expect(elementalRotation({}, TALENTS, auraIndex, CONTEXT, defaultAplOrder(ELEMENTAL_APL))).toEqual(none)
    expect(ids(none)).toEqual(DEFAULT_IDS)
  })

  it('builds the rows in the stored order, each with its own conditions', () => {
    const values = { [ID.lavaBurstFlameShock]: true }
    const none = elementalRotation(values, TALENTS, auraIndex, CONTEXT)
    // Lava Burst above Flame Shock still waits for your Flame Shock; Lightning Bolt above Chain Lightning keeps its three lines.
    const first = moved('lavaBurst', 'flameShock')
    const order = moveAplRow(ELEMENTAL_APL, first, 'chainLightning', first.length - 1)!
    const r = elementalRotation(values, TALENTS, auraIndex, CONTEXT, order)
    expect(ids(r)).toEqual([
      'bloodFury',
      'weaknessAnalyzer',
      'powerInfusion',
      'manaTideTotem',
      'majorManaPotion',
      'demonicRune',
      'lavaBurst',
      'flameShock',
      'lightningBolt',
      'lightningBolt',
      'lightningBoltRank4',
      'chainLightning',
    ])
    const flameShock = r.abilities.findIndex((a) => a.id === 'flameShock')
    expect(conditionsOf(r, 'lavaBurst')).toEqual([[{ code: COND.abilityAuraUp, a: flameShock, b: 0 }]])
    expect(conditionsOf(r, 'lightningBolt')).toEqual(conditionsOf(none, 'lightningBolt'))
    expect(conditionsOf(r, 'chainLightning')).toEqual(conditionsOf(none, 'chainLightning'))
    // The same abilities and the same Lightning Overload procs, only in another order.
    expect(new Set(r.abilities.map((a) => a.id))).toEqual(new Set(none.abilities.map((a) => a.id)))
    expect(r.procs.length).toBe(none.procs.length)
    expect(r.onUse).toEqual(none.onUse)
    // The mana potion and rune take their turn with Mana Tide Totem, wherever it sits.
    const tideLast = elementalRotation({}, TALENTS, auraIndex, CONTEXT, moved('manaTide'))
    expect(ids(tideLast).slice(-3)).toEqual(['manaTideTotem', 'majorManaPotion', 'demonicRune'])
    // A moved list is Custom; the default order is the Default preset.
    expect(rotationPreset({ spec: SPEC, talents: defaultConfig(SPEC).talents, rotation: {}, rotationOrder: order })).toBe(CUSTOM_APL_PRESET)
    expect(rotationPreset({ spec: SPEC, talents: defaultConfig(SPEC).talents, rotation: {} })).toBe(DEFAULT_APL_PRESET)
  })

  it('skips a row that’s turned off, wherever it sits', () => {
    const off = { [ID.flameShock]: false, [ID.lavaBurstFlameShock]: true, [ID.manaTide]: false, [ID.chainLightning]: 'never', [ID.boltDownrank]: false }
    const r = elementalRotation(off, TALENTS, auraIndex, CONTEXT, moved('flameShock', 'racial'))
    // Mana Tide's row off leaves the potion and rune, spec-wide, on; with Flame Shock off, Lava Burst doesn't wait for it.
    expect(ids(r)).toEqual(['bloodFury', 'weaknessAnalyzer', 'powerInfusion', 'majorManaPotion', 'demonicRune', 'lavaBurst', 'lightningBolt'])
    expect(conditionsOf(r, 'lavaBurst')).toEqual([[]])
  })

  it('places rows a stored order leaves out, and ignores what it doesn’t know', () => {
    expect(normalizeAplOrder(ELEMENTAL_APL, ['lightningBolt', 'lavaBurst'])).toEqual([
      'racial',
      'trinkets',
      'powerInfusion',
      'manaTide',
      'flameShock',
      'lightningBolt',
      'lavaBurst',
      'chainLightning',
      'earthShock',
    ])
    expect(normalizeAplOrder(ELEMENTAL_APL, ['bogus', 3, null])).toEqual(defaultAplOrder(ELEMENTAL_APL))
    expect(storedAplOrder(ELEMENTAL_APL, defaultAplOrder(ELEMENTAL_APL))).toBeUndefined()
  })

  it('loads a setup saved before the list byte-identical, and one with an order as it was stored', () => {
    const before = { ...defaultConfig(SPEC), rotation: { [ID.earthShock]: true, [ID.chainLightning]: 'cooldown', [ID.boltMaxRank]: 25 } }
    const { config, warnings } = normalizeConfig(JSON.parse(JSON.stringify(before)))
    expect(warnings).toEqual([])
    expect(JSON.stringify(config)).toBe(JSON.stringify(before))
    expect(config.rotationOrder).toBeUndefined()
    expect(fingerprint(planJson(buildPlan(config).plan))).toBe(fingerprint(planJson(buildPlan({ ...before, rotationOrder: defaultAplOrder(ELEMENTAL_APL) }).plan)))
    // A stored order survives a save and a load, and plays as stored.
    const order = moved('earthShock', 'flameShock')
    const saved = normalizeConfig(JSON.parse(JSON.stringify({ ...before, rotationOrder: order }))).config
    expect(saved.rotationOrder).toEqual(order)
    const plan = buildPlan(saved).plan
    const at = (id: string) => plan.rotation.findIndex((e) => plan.abilities[e.ability].id === id)
    expect(at('earthShock')).toBeLessThan(at('flameShock'))
  })
})

describe('the Elemental settings the setup leaves unused (docs/ux.md "Rotation"; shaman.md "Elemental priority list (A2)")', () => {
  const BELOW_BOLT = 'Below Lightning Bolt: cast only when Lightning Bolt can’t be.'
  const noFocus = new Map([...TALENTS].filter(([name]) => name !== 'Elemental Focus'))

  it('has none in the default setup and order', () => {
    expect(elementalUnusedSettings({}, TALENTS)).toEqual({})
    expect(elementalUnusedSettings({}, TALENTS, defaultAplOrder(ELEMENTAL_APL))).toEqual({})
  })

  it('notes Chain Lightning with Clearcasting without Elemental Focus (UA-2), where its row reads "None"', () => {
    expect(elementalUnusedSettings({}, noFocus)).toEqual({ [ID.chainLightning]: 'Not used: Clearcasting needs the Elemental Focus talent.' })
    // On cooldown or never, it needs no Clearcasting.
    expect(elementalUnusedSettings({ [ID.chainLightning]: 'cooldown' }, noFocus)).toEqual({})
    expect(elementalUnusedSettings({ [ID.chainLightning]: 'never' }, noFocus)).toEqual({})
    // Its summary's parts have an `inactiveText`, which keeps this note off the row; without
    // Elemental Focus the Clearcasting part is left out, so it reads "None". Below Lightning Bolt
    // the row shows its note instead, dimmed (VA-3; the Rotation tab's aplRowIdle).
    const row = ELEMENTAL_APL.rows.find((r) => r.id === 'chainLightning')!
    expect(row.summary!.map((p) => p.inactiveText)).toEqual(['not used', 'not used'])
    expect(row.summary![0].requires).toEqual({ talent: 'Elemental Focus' })
    // The plan has no Chain Lightning then, as the note says.
    const auraless = () => -1
    expect(ids(elementalRotation({}, noFocus, auraless, CONTEXT))).not.toContain('chainLightning')
  })

  it('notes each row on the global cooldown below Lightning Bolt, but not the rows off it (LA-2)', () => {
    const order = moved('lightningBolt', 'racial')
    const notes = elementalUnusedSettings({}, TALENTS, order)
    expect(notes).toEqual({ [ID.manaTide]: BELOW_BOLT, [ID.flameShock]: BELOW_BOLT, [ID.lavaBurst]: BELOW_BOLT, [ID.chainLightning]: BELOW_BOLT })
    // Earth Shock turned on gets it too; Chain Lightning set to never doesn't.
    expect(elementalUnusedSettings({ [ID.earthShock]: true, [ID.chainLightning]: 'never' }, TALENTS, order)).toEqual({
      [ID.manaTide]: BELOW_BOLT,
      [ID.flameShock]: BELOW_BOLT,
      [ID.lavaBurst]: BELOW_BOLT,
      [ID.earthShock]: BELOW_BOLT,
    })
    // Only the rows below it: Lightning Bolt just above Chain Lightning.
    expect(elementalUnusedSettings({}, TALENTS, moved('lightningBolt', 'chainLightning'))).toEqual({ [ID.chainLightning]: BELOW_BOLT })
    // Without Elemental Focus, Chain Lightning's own note wins.
    expect(elementalUnusedSettings({}, noFocus, order)[ID.chainLightning]).toBe('Not used: Clearcasting needs the Elemental Focus talent.')
  })

  it('says what the fights show: the noted rows are never cast in the default setup, the racial still is', () => {
    const plan = buildPlan({ ...defaultConfig(SPEC), run: { mode: 'fixed' as const, iterations: 100, seed: 1 }, rotationOrder: moved('lightningBolt', 'racial') }).plan
    const sim = new Sim(plan)
    const agg = mergeChunk(emptyAggregate(plan.sources.length, plan.auras.length), runChunk(plan, 0, 100, sim))
    const casts = (id: string) => agg.counters[plan.abilities.find((a) => a.id === id)!.source * FIELD_COUNT + FIELD.casts]
    for (const id of ['manaTideTotem', 'flameShock', 'lavaBurst', 'chainLightning']) expect(casts(id), id).toBe(0)
    expect(casts('bloodFury')).toBeGreaterThan(0)
  })
})
