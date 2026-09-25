// The Shadow Priest's rotation as a priority list (decision D31; docs/classes/priest.md §6 "The
// priority list"): the rows cover every setting, the default order gives the plan the rotation gave
// before the list (200 random setups, fingerprinted on the code before it), the compiler follows the
// stored order with each row's own conditions, a row turned off is skipped, and an old setup loads
// byte-identical.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { normalizeConfig } from '../../config/normalize'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { MAJOR_MANA_POTION, POWER_INFUSION as POWER_INFUSION_USE } from '../../effects/buffs'
import { ITEM_EFFECTS } from '../../effects/items'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { COND, type Plan } from '../../plan/types'
import { emptyAggregate, mergeChunk } from '../../run/aggregate'
import { aplPresets, defaultAplOrder, DEFAULT_APL_PRESET, moveAplRow, normalizeAplOrder, storedAplOrder } from '../apl'
import { SHADOW_APL, SHADOW_IDS as ID, SHADOW_OPTIONS, shadowRotation, shadowUnusedSettings } from './shadow'
import { fingerprint, planJson, shadowCases } from './shadow-apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.priest, defaultConfig('priest-shadow').talents)
const CONTEXT = { race: 'horde-troll', consumables: [POWER_INFUSION_USE, MAJOR_MANA_POTION], maxMana: 6000 }
type Rot = ReturnType<typeof shadowRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const DEFAULT = defaultAplOrder(SHADOW_APL)
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string, from = DEFAULT) =>
  moveAplRow(SHADOW_APL, from, id, from.indexOf(before) - (from.indexOf(id) < from.indexOf(before) ? 1 : 0))!

describe('the Shadow Priest’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    const known = new Set(SHADOW_OPTIONS.map((o) => o.id))
    const placed = new Set([...SHADOW_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...SHADOW_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    for (const row of SHADOW_APL.rows) {
      if (row.enabledId) expect(SHADOW_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    }
    expect(new Set(SHADOW_APL.rows.map((r) => r.id)).size).toBe(SHADOW_APL.rows.length)
    // Only Shadowform before the pull is pinned, first; the implicit Default is the one preset.
    expect(SHADOW_APL.rows.filter((r) => r.pinned).map((r) => r.id)).toEqual(['prepull'])
    expect(DEFAULT).toEqual(['prepull', 'racial', 'trinkets', 'powerInfusion', 'darkSacrifice', 'shadowWordPain', 'devouringPlague', 'innerFocus', 'mindBlast', 'starshards', 'vampiricEmbrace', 'mindFlay'])
    expect(aplPresets(SHADOW_APL).map((p) => p.id)).toEqual([DEFAULT_APL_PRESET])
  })

  it('gives 200 random setups the plan they had before the list, in the default order', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what Shadow plays. With the default order stored or none,
    // each plan is the same.
    const cases = shadowCases(SHADOW_OPTIONS, 200)
    const plans = cases.map((config) => buildPlan({ ...config, rotationOrder: DEFAULT }).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(cases.slice(0, 20).map((config) => fingerprint(planJson(buildPlan(config).plan)))).toEqual(hashes.slice(0, 20))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover each race's own spells and the mana consumables, on and off.
    const using = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['starshards', 'darkSacrifice', 'majorManaPotion', 'demonicRune', 'powerInfusion', 'vampiricEmbrace', 'innerFocus']) {
      expect(using(id), id).toBeGreaterThan(5)
      expect(using(id), id).toBeLessThan(195)
    }
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })

  it('gives the same list in the default order as with none, and builds it in the stored order', () => {
    const none = shadowRotation({}, TALENTS, CONTEXT)
    expect(shadowRotation({}, TALENTS, CONTEXT, DEFAULT)).toEqual(none)
    // priest.md §6's order: Berserking, the (no) trinkets, then Power Infusion and the potion after
    // it, the DoTs, Inner Focus, Mind Blast and Mind Flay.
    expect(ids(none)).toEqual(['berserking', 'powerInfusion', 'majorManaPotion', 'shadowWordPain', 'devouringPlague', 'innerFocus', 'mindBlast', 'mindFlay'])
    // Mind Blast above the DoTs, and Power Infusion's row (the consumables after it) last.
    let order = moved('mindBlast', 'shadowWordPain')
    order = moveAplRow(SHADOW_APL, order, 'powerInfusion', order.length - 1)!
    const r = shadowRotation({}, TALENTS, CONTEXT, order)
    expect(ids(r)).toEqual(['berserking', 'mindBlast', 'shadowWordPain', 'devouringPlague', 'innerFocus', 'mindFlay', 'powerInfusion', 'majorManaPotion'])
    // What the rotation presses is the same, whatever the order.
    expect(r.onUse).toEqual(none.onUse)
    // Shadowform can't move, and nothing passes it.
    expect(moveAplRow(SHADOW_APL, DEFAULT, 'prepull', 3)).toBeNull()
    expect(moveAplRow(SHADOW_APL, DEFAULT, 'racial', 0)).toBeNull()
  })

  it('keeps a moved row’s own conditions: Inner Focus still waits for Mind Blast, and the DoTs for the fight’s end', () => {
    const none = shadowRotation({}, TALENTS, CONTEXT)
    const order = moved('mindBlast', 'racial', moved('innerFocus', 'racial'))
    const r = shadowRotation({}, TALENTS, CONTEXT, order)
    expect(ids(r).slice(0, 3)).toEqual(['innerFocus', 'mindBlast', 'berserking'])
    const conditionsOf = (rot: Rot, id: string) =>
      rot.rotation
        .filter((e) => rot.abilities[e.ability].id === id)
        .map((e) => e.conditions.map((c) => (c.code === COND.abilityReady || c.code === COND.abilityAuraRefresh ? { ...c, a: rot.abilities[c.a].id } : c)))
    for (const id of ['innerFocus', 'shadowWordPain', 'devouringPlague', 'majorManaPotion']) expect(conditionsOf(r, id), id).toEqual(conditionsOf(none, id))
    expect(conditionsOf(r, 'innerFocus')).toEqual([[{ code: COND.abilityReady, a: 'mindBlast', b: 0 }]])
  })

  it('skips a row that’s off: Devouring Plague, or Inner Focus with Mind Blast off', () => {
    expect(ids(shadowRotation({ [ID.plague]: false }, TALENTS, CONTEXT))).not.toContain('devouringPlague')
    const noBlast = ids(shadowRotation({ [ID.blast]: false }, TALENTS, CONTEXT))
    expect(noBlast).not.toContain('mindBlast')
    expect(noBlast).not.toContain('innerFocus')
    // The trinkets' row off changes nothing without trinkets; Power Infusion's row off still presses
    // the spec-wide consumables in its turn.
    expect(ids(shadowRotation({ [ID.trinkets]: false }, TALENTS, CONTEXT))).toEqual(ids(shadowRotation({}, TALENTS, CONTEXT)))
    expect(ids(shadowRotation({ [ID.powerInfusion]: false }, TALENTS, CONTEXT))).toEqual(ids(shadowRotation({}, TALENTS, CONTEXT)).filter((id) => id !== 'powerInfusion'))
  })

  it('places what a stored order leaves out, and keeps the pinned row first', () => {
    // An order saved before a row existed, or edited by hand: Mind Flay above the DoTs, the rest where they fit.
    expect(normalizeAplOrder(SHADOW_APL, ['mindFlay', 'shadowWordPain'])).toEqual([
      'prepull',
      'racial',
      'trinkets',
      'powerInfusion',
      'darkSacrifice',
      'mindFlay',
      'shadowWordPain',
      'devouringPlague',
      'innerFocus',
      'mindBlast',
      'starshards',
      'vampiricEmbrace',
    ])
    expect(normalizeAplOrder(SHADOW_APL, ['vampiricEmbrace', 'prepull', 'nope', 3, 'vampiricEmbrace'])[0]).toBe('prepull')
    expect(normalizeAplOrder(SHADOW_APL, undefined)).toEqual(DEFAULT)
    expect(storedAplOrder(SHADOW_APL, DEFAULT)).toBeUndefined()
  })

  it('plays an order saved before Power Infusion was a row as it did: Power Infusion and the consumables just after the trinkets', () => {
    // Saved when Power Infusion and the consumables took their turn with the trinkets' row: the
    // trinkets below Mind Blast.
    const saved = moved('trinkets', 'starshards').filter((id) => id !== 'powerInfusion')
    const order = normalizeAplOrder(SHADOW_APL, saved)
    expect(order.indexOf('powerInfusion')).toBe(order.indexOf('trinkets') + 1)
    const trinket = ITEM_EFFECTS[272438].use!
    const r = shadowRotation({}, TALENTS, { ...CONTEXT, items: [trinket] }, saved)
    expect(ids(r)).toEqual(['berserking', 'shadowWordPain', 'devouringPlague', 'innerFocus', 'mindBlast', trinket.id, 'powerInfusion', 'majorManaPotion', 'mindFlay'])
  })

  it('loads a setup saved before the list byte-identical, and plays the same fights with the default order as with none', () => {
    const d = defaultConfig('priest-shadow')
    const old = { ...d, rotation: { [ID.plague]: false, [ID.flayTicks]: 2 } }
    const { config } = normalizeConfig(JSON.parse(JSON.stringify(old)))
    expect(config.rotationOrder).toBeUndefined()
    expect(JSON.stringify(config)).toBe(JSON.stringify(normalizeConfig(old).config))
    expect(fingerprint(planJson(buildPlan(config).plan))).toBe(fingerprint(planJson(buildPlan(old).plan)))

    const run = (plan: Plan) => {
      const sim = new Sim(plan)
      return mergeChunk(emptyAggregate(plan.sources.length, plan.auras.length), runChunk(plan, 0, Math.min(CHUNK_SIZE, 200), sim)).dps.mean
    }
    const fixed = { ...d, run: { mode: 'fixed' as const, iterations: 200, seed: 99 } }
    const none = buildPlan(fixed).plan
    expect(buildPlan({ ...fixed, rotationOrder: DEFAULT }).plan).toEqual(none)
    // Vampiric Embrace is off by default, so moving it changes nothing it plays…
    expect(run(buildPlan({ ...fixed, rotationOrder: moved('vampiricEmbrace', 'shadowWordPain') }).plan)).toBe(run(none))
    // …while Mind Flay above Mind Blast does: the filler takes every global cooldown.
    const flayFirst = buildPlan({ ...fixed, rotationOrder: moved('mindFlay', 'shadowWordPain') }).plan
    expect(run(flayFirst)).toBeLessThan(run(none))
  })
})

describe('the Shadow settings a reordered list leaves unused (docs/ux.md "Rotation"; priest.md §6)', () => {
  const TROLL = ['horde-troll', 'Troll'] as const
  const RACE_NOTES = ['priest.shadow.starshards.enabled', 'priest.shadow.darkSacrifice.enabled']
  const BELOW_FLAY = 'Below Mind Flay: used only while you haven’t the mana for Mind Flay.'

  it('in the default order, has only the race notes', () => {
    expect(Object.keys(shadowUnusedSettings(...TROLL, {}, TALENTS))).toEqual(RACE_NOTES)
    expect(Object.keys(shadowUnusedSettings(...TROLL, {}, TALENTS, DEFAULT))).toEqual(RACE_NOTES)
    expect(shadowUnusedSettings('horde-undead', 'Undead', {}, TALENTS)[ID.sacrifice]).toBeUndefined()
  })

  it('notes each row on the global cooldown below Mind Flay, and Inner Focus with them, but not the rows off it', () => {
    const order = moved('mindFlay', 'racial')
    const notes = shadowUnusedSettings(...TROLL, {}, TALENTS, order)
    for (const id of [ID.pain, ID.plague, ID.blast, ID.innerFocus]) expect(notes[id], id).toBe(BELOW_FLAY)
    for (const id of [ID.racial, ID.trinkets, ID.powerInfusion]) expect(notes[id], id).toBeUndefined()
    // A race note wins over the order's; Vampiric Embrace is off by default.
    expect(notes[ID.starshards]).toMatch(/^Not used: only Night Elf/)
    expect(notes[ID.embrace]).toBeUndefined()
    // Undead's own Dark Sacrifice, and Vampiric Embrace turned on with its talent, get the note too.
    const undead = shadowUnusedSettings('horde-undead', 'Undead', { [ID.embrace]: true }, new Map([...TALENTS, ['Vampiric Embrace', 1]]), order)
    expect(undead[ID.sacrifice]).toBe(BELOW_FLAY)
    expect(undead[ID.embrace]).toBe(BELOW_FLAY)
    // Only the rows below it: Mind Flay just above Starshards leaves the DoTs and Mind Blast alone.
    const low = shadowUnusedSettings('alliance-night-elf', 'Night Elf', {}, TALENTS, moved('mindFlay', 'starshards'))
    expect(Object.keys(low).filter((id) => low[id] === BELOW_FLAY)).toEqual([ID.starshards])
  })

  it('has no Mind Flay notes with Mind Flay off or without its talent, or for a row that’s off', () => {
    const order = moved('mindFlay', 'racial')
    expect(Object.keys(shadowUnusedSettings(...TROLL, { [ID.flay]: false }, TALENTS, order))).toEqual(RACE_NOTES)
    const noFlay = new Map([...TALENTS].filter(([name]) => name !== 'Mind Flay'))
    expect(Object.keys(shadowUnusedSettings(...TROLL, {}, noFlay, order))).toEqual(RACE_NOTES)
    expect(shadowUnusedSettings(...TROLL, { [ID.plague]: false }, TALENTS, order)[ID.plague]).toBeUndefined()
  })

  it('notes Inner Focus below Mind Blast (LA-3), and not without its talent or with Mind Blast off', () => {
    const order = moved('innerFocus', 'starshards')
    expect(shadowUnusedSettings(...TROLL, {}, TALENTS, order)[ID.innerFocus]).toBe('Below Mind Blast: used only while you haven’t the mana for Mind Blast, which goes first the moment it’s ready.')
    expect(shadowUnusedSettings(...TROLL, { [ID.blast]: false }, TALENTS, order)[ID.innerFocus]).toBeUndefined()
    const noFocus = new Map([...TALENTS].filter(([name]) => name !== 'Inner Focus'))
    expect(shadowUnusedSettings(...TROLL, {}, noFocus, order)[ID.innerFocus]).toBeUndefined()
    // Below both, the Mind Blast note is the one: Mind Blast comes first either way.
    expect(shadowUnusedSettings(...TROLL, {}, TALENTS, moveAplRow(SHADOW_APL, DEFAULT, 'innerFocus', DEFAULT.length - 1)!)[ID.innerFocus]).toMatch(/^Below Mind Blast/)
  })

  it('says what the fights show: the noted rows are never cast in the default setup', () => {
    const casts = (order: string[]) => {
      const plan = buildPlan({ ...defaultConfig('priest-shadow'), run: { mode: 'fixed' as const, iterations: 100, seed: 1 }, rotationOrder: order }).plan
      const sim = new Sim(plan)
      const agg = mergeChunk(emptyAggregate(plan.sources.length, plan.auras.length), runChunk(plan, 0, 100, sim))
      return (id: string) => agg.counters[plan.abilities.find((a) => a.id === id)!.source * FIELD_COUNT + FIELD.casts]
    }
    const flayFirst = casts(moved('mindFlay', 'racial'))
    for (const id of ['shadowWordPain', 'devouringPlague', 'mindBlast', 'innerFocus']) expect(flayFirst(id), id).toBe(0)
    expect(flayFirst('berserking')).toBeGreaterThan(0)
    const focusLow = casts(moved('innerFocus', 'starshards'))
    expect(focusLow('innerFocus')).toBe(0)
    expect(focusLow('mindBlast')).toBeGreaterThan(0)
  })

  it('reads "None" before the pull without Shadowform (LA-4)', () => {
    expect(SHADOW_APL.rows[0].summary).toEqual([{ text: 'Shadowform', requires: { talent: 'Shadowform' } }])
  })
})
