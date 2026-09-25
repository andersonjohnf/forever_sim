// The hunters' rotation as a priority list (decision D31; docs/classes/hunter.md §8.3 "The priority
// list"): the rows cover every setting, each spec plays exactly as it played before the list in the
// default order, the compiler follows the stored order with each row's own conditions, a row turned
// off is skipped, and an old setup without an order loads as it was.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { DEMONIC_RUNE, MAJOR_MANA_POTION } from '../../effects/buffs'
import { normalizeConfig } from '../../config/normalize'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import type { Plan } from '../../plan/types'
import { emptyAggregate, mergeChunk } from '../../run/aggregate'
import { defaultAplOrder, moveAplRow, normalizeAplOrder, storedAplOrder } from '../apl'
import { fingerprint, hunterCases, planJson } from './hunter-apl-cases'
import { HUNTER_APL, HUNTER_SPECS, hunterIds, hunterOptions, hunterRotation, type HunterSpec } from './rotation'

const talentsOf = (spec: HunterSpec) => talentRanksByName(TALENT_DATA.hunter, defaultConfig(spec).talents)
const CONTEXT = { race: 'horde-orc', maxMana: 6000, consumables: [MAJOR_MANA_POTION, DEMONIC_RUNE] }
type Rot = ReturnType<typeof hunterRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
/** The default order with `id` moved to just before `before`. */
const moved = (spec: HunterSpec, id: string, before: string, from = defaultAplOrder(HUNTER_APL[spec])) =>
  moveAplRow(HUNTER_APL[spec], from, id, from.indexOf(before) - (from.indexOf(id) < from.indexOf(before) ? 1 : 0))!
/** The default order with `id` moved last. */
const last = (spec: HunterSpec, id: string) => moveAplRow(HUNTER_APL[spec], defaultAplOrder(HUNTER_APL[spec]), id, HUNTER_APL[spec].rows.length - 1)!

describe('the hunters’ priority list (D31)', () => {
  for (const spec of HUNTER_SPECS) {
    it(`${spec}: has a row or a spec-wide place for every setting, and only its own`, () => {
      const apl = HUNTER_APL[spec]
      const options = hunterOptions(spec)
      const known = new Set(options.map((o) => o.id))
      const placed = new Set([...apl.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...apl.specWide])
      expect([...known].filter((id) => !placed.has(id))).toEqual([])
      expect([...placed].filter((id) => !known.has(id))).toEqual([])
      for (const row of apl.rows) {
        if (row.enabledId) expect(options.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
        for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
        // A row without a switch says what it does itself.
        if (!row.enabledId) expect(row.help, row.id).toBeTruthy()
      }
      expect(new Set(apl.rows.map((r) => r.id)).size).toBe(apl.rows.length)
      // Only the pre-pull (Aspect of the Hawk, Trueshot Aura) is pinned, first; the pet and the mana consumables are spec-wide.
      expect(apl.rows.filter((r) => r.pinned).map((r) => r.id)).toEqual(['prepull'])
      expect(defaultAplOrder(apl)).toEqual(['prepull', 'racial', 'trinkets', 'rapidFire', 'bestialWrath', 'huntersMark', 'sharedShot', 'arcaneShot', 'serpentSting', 'sniperShot'])
      const ID = hunterIds(spec)
      expect(apl.specWide).toEqual([ID.clawFocus, ID.manaPotion, ID.manaPotionMissing, ID.rune, ID.runeMissing])
      // No named rotations: the implicit Default only (D27's common priority).
      expect(apl.presets).toEqual([])
    })

    // Named as when the snapshot was taken (the commit before the list), so it's compared with that one.
    it(`gives 200 random ${spec} setups the plan they had before the list`, () => {
      // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
      // it: a change to it is a change to what the spec plays. Each is built twice, with no order and
      // with the default order stored, which must be the same plan.
      const plans = hunterCases(spec, 200).map((config) => {
        const plan = buildPlan(config).plan
        expect(buildPlan({ ...config, rotationOrder: defaultAplOrder(HUNTER_APL[spec]) }).plan).toEqual(plan)
        return plan
      })
      const hashes = plans.map((plan) => fingerprint(planJson(plan)))
      expect(new Set(hashes).size).toBeGreaterThan(150)
      // They cover a pet and none, each shot on the shared cooldown, the mana consumables and a rotation each.
      const pets = plans.filter((p) => p.pet !== undefined).length
      expect(pets).toBeGreaterThan(20)
      expect(pets).toBeLessThan(180)
      for (const id of ['aimedShot', 'multiShot', 'arcaneShot', 'serpentSting', 'rapidFire', 'majorManaPotion', 'demonicRune']) {
        expect(plans.filter((p) => p.abilities.some((a) => a.id === id)).length, id).toBeGreaterThan(10)
      }
      for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
      expect(hashes).toMatchSnapshot()
    }, 30_000)
  }

  it('gives the same list in the default order as with none: hunter.md §8.1’s lines', () => {
    for (const spec of HUNTER_SPECS) {
      const values = { [hunterIds(spec).arcane]: true, [hunterIds(spec).sniper]: true }
      const none = hunterRotation(spec, values, talentsOf(spec), CONTEXT)
      expect(hunterRotation(spec, values, talentsOf(spec), CONTEXT, defaultAplOrder(HUNTER_APL[spec])), spec).toEqual(none)
    }
    // Beast Mastery: Blood Fury, Rapid Fire, Bestial Wrath, the potion and the rune, Hunter's Mark,
    // Multi-Shot, Arcane Shot and Serpent Sting (no Sniper Shot talent).
    const bm = hunterRotation('hunter-beast-mastery', {}, talentsOf('hunter-beast-mastery'), CONTEXT)
    expect(ids(bm)).toEqual(['bloodFury', 'rapidFire', 'bestialWrath', 'majorManaPotion', 'demonicRune', 'huntersMark', 'multiShot', 'arcaneShot', 'serpentSting'])
  })

  it('builds the list in the stored order, each row keeping its own conditions', () => {
    const spec = 'hunter-beast-mastery'
    const talents = talentsOf(spec)
    const none = hunterRotation(spec, {}, talents, CONTEXT)
    // Serpent Sting above the shared shot, and Arcane Shot above both.
    let order = moved(spec, 'serpentSting', 'sharedShot')
    order = moved(spec, 'arcaneShot', 'serpentSting', order)
    const r = hunterRotation(spec, {}, talents, CONTEXT, order)
    expect(ids(r)).toEqual(['bloodFury', 'rapidFire', 'bestialWrath', 'majorManaPotion', 'demonicRune', 'huntersMark', 'arcaneShot', 'serpentSting', 'multiShot'])
    // The same lines, by ability: a row's conditions read only its own ability (the refresh, the wait for Auto Shot).
    const conditionsOf = (rot: Rot, id: string) =>
      rot.rotation.filter((e) => rot.abilities[e.ability].id === id).map((e) => e.conditions.map((c) => (c.a === e.ability ? { ...c, a: 'self' } : c)))
    for (const id of ['serpentSting', 'multiShot', 'huntersMark', 'arcaneShot', 'majorManaPotion']) expect(conditionsOf(r, id), id).toEqual(conditionsOf(none, id))
    // The pet and what the plan presses don't move.
    expect(r.pet).toEqual(none.pet)
    expect(r.onUse).toEqual(none.onUse)
  })

  it('keeps the mana consumables just before the first row on the global cooldown, wherever it sits', () => {
    const spec = 'hunter-beast-mastery'
    const talents = talentsOf(spec)
    // Rapid Fire last: the consumables stay ahead of Hunter's Mark, and Rapid Fire comes after Serpent Sting.
    const rapidLast = hunterRotation(spec, {}, talents, CONTEXT, last(spec, 'rapidFire'))
    expect(ids(rapidLast)).toEqual(['bloodFury', 'bestialWrath', 'majorManaPotion', 'demonicRune', 'huntersMark', 'multiShot', 'arcaneShot', 'serpentSting', 'rapidFire'])
    // Hunter's Mark first: the consumables come first with it, ahead of the cooldowns.
    const markFirst = hunterRotation(spec, {}, talents, CONTEXT, moved(spec, 'huntersMark', 'racial'))
    expect(ids(markFirst)).toEqual(['majorManaPotion', 'demonicRune', 'huntersMark', 'bloodFury', 'rapidFire', 'bestialWrath', 'multiShot', 'arcaneShot', 'serpentSting'])
    // A first row that's off still gives them their turn there.
    const markOff = hunterRotation(spec, { [hunterIds(spec).mark]: false }, talents, CONTEXT, moved(spec, 'huntersMark', 'racial'))
    expect(ids(markOff)).toEqual(['majorManaPotion', 'demonicRune', 'bloodFury', 'rapidFire', 'bestialWrath', 'multiShot', 'arcaneShot', 'serpentSting'])
  })

  it('skips a row turned off, and the shared shot set to neither', () => {
    const spec = 'hunter-marksmanship'
    const ID = hunterIds(spec)
    const values = { [ID.rapidFire]: false, [ID.sting]: false, [ID.sharedShot]: 'none', [ID.arcane]: true }
    const r = hunterRotation(spec, values, talentsOf(spec), CONTEXT, moved(spec, 'serpentSting', 'racial'))
    // Serpent Sting, moved first, is off, but the consumables still take their turn at its place.
    expect(ids(r)).toEqual(['majorManaPotion', 'demonicRune', 'bloodFury', 'huntersMark', 'arcaneShot'])
    // Sniper Shot switched on: with its talent it's used, without it it isn't; Bestial Wrath needs its talent too.
    const withSniper = ids(hunterRotation(spec, { [ID.sniper]: true }, talentsOf(spec), CONTEXT))
    expect(withSniper).toContain('sniperShot')
    expect(withSniper).not.toContain('bestialWrath')
    const noTalent = new Map([...talentsOf(spec)].filter(([name]) => name !== 'Sniper Shot'))
    expect(ids(hunterRotation(spec, { [ID.sniper]: true }, noTalent, CONTEXT))).not.toContain('sniperShot')
  })

  it('places what a stored order leaves out between its default neighbours, and keeps the pre-pull first', () => {
    const apl = HUNTER_APL['hunter-survival']
    // Serpent Sting then the racial: the rows after the racial follow it, and Sniper Shot, after Serpent Sting by default, goes last.
    expect(normalizeAplOrder(apl, ['serpentSting', 'racial'])).toEqual([
      'prepull',
      'serpentSting',
      'racial',
      'trinkets',
      'rapidFire',
      'bestialWrath',
      'huntersMark',
      'sharedShot',
      'arcaneShot',
      'sniperShot',
    ])
    // Unknown ids, repeats and a moved pre-pull are dropped or put back; one row named alone pulls none around it.
    expect(normalizeAplOrder(apl, ['nope', 'arcaneShot', 'arcaneShot', 'prepull', 7])).toEqual(defaultAplOrder(apl))
    expect(normalizeAplOrder(apl, undefined)).toEqual(defaultAplOrder(apl))
    expect(storedAplOrder(apl, defaultAplOrder(apl))).toBeUndefined()
    expect(moveAplRow(apl, defaultAplOrder(apl), 'prepull', 3)).toBeNull()
    expect(moveAplRow(apl, defaultAplOrder(apl), 'racial', 0)).toBeNull()
  })

  it('loads an old setup saved without an order as it was, byte for byte, and plays it the same', () => {
    for (const spec of HUNTER_SPECS) {
      const ID = hunterIds(spec)
      const old = { ...defaultConfig(spec), rotation: { [ID.arcane]: true, [ID.stingTimeLeft]: 9, [ID.sharedShot]: 'multi' } }
      const loaded = normalizeConfig(JSON.parse(JSON.stringify(old))).config
      expect(JSON.stringify(loaded), spec).toBe(JSON.stringify(old))
      expect('rotationOrder' in loaded).toBe(false)
      expect(fingerprint(planJson(buildPlan(loaded).plan))).toBe(fingerprint(planJson(buildPlan(old).plan)))
      // A stored order survives the load, and a default one is dropped.
      const order = moved(spec, 'serpentSting', 'huntersMark')
      expect(normalizeConfig({ ...old, rotationOrder: order }).config.rotationOrder).toEqual(order)
      expect('rotationOrder' in normalizeConfig({ ...old, rotationOrder: defaultAplOrder(HUNTER_APL[spec]) }).config).toBe(false)
    }
  })

  it('plays the same fights with the default order stored as with none, and different ones reordered', () => {
    const spec = 'hunter-beast-mastery'
    const config = { ...defaultConfig(spec), run: { mode: 'fixed' as const, iterations: 200, seed: 99 } }
    const run = (plan: Plan) => mergeChunk(emptyAggregate(plan.sources.length, plan.auras.length), runChunk(plan, 0, Math.min(CHUNK_SIZE, 200), new Sim(plan))).dps.mean
    const none = buildPlan(config).plan
    expect(buildPlan({ ...config, rotationOrder: defaultAplOrder(HUNTER_APL[spec]) }).plan).toEqual(none)
    // Sniper Shot needs a talent Beast Mastery doesn't take, so moving it changes nothing it plays…
    expect(run(buildPlan({ ...config, rotationOrder: moved(spec, 'sniperShot', 'huntersMark') }).plan)).toBe(run(none))
    // …while Arcane Shot ahead of Multi-Shot does.
    expect(run(buildPlan({ ...config, rotationOrder: moved(spec, 'arcaneShot', 'sharedShot') }).plan)).not.toBe(run(none))
  })
})
