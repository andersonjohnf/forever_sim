// The mage's rotations as priority lists (decision D31; docs/classes/mage.md "The priority lists"):
// the rows cover every setting, each spec's default order plays exactly as the mage played before the
// list, and the compiler follows the stored order.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { normalizeConfig } from '../../config/normalize'
import { rotationPreset } from '../../index'
import { buildPlan } from '../../plan/build'
import { COND, type Plan } from '../../plan/types'
import type { SimConfig } from '../../types'
import { aplPresets, DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder } from '../apl'
import { rotationApl } from '../rotation'
import { FIRE_WAIT_MS, MAGE_APL, MAGE_IDS, MAGE_OPTIONS } from './rotation'
import { fingerprint, mageCases, type MageSpecId, planJson } from './mage-apl-cases'
import { talentCode } from './test-helpers'

const SPECS: [MageSpecId, keyof typeof MAGE_OPTIONS][] = [
  ['mage-fire', 'fire'],
  ['mage-frost', 'frost'],
  ['mage-arcane', 'arcane'],
]

/** The plan's priority list as ability ids, line by line. */
const ids = (plan: Plan) => plan.rotation.map((e) => plan.abilities[e.ability].id)
/** The lines of one ability, with their conditions' ability and aura references read back as ids. */
const lines = (plan: Plan, id: string) => plan.rotation.filter((e) => plan.abilities[e.ability].id === id).map((e) => e.conditions)
const plan = (config: SimConfig) => buildPlan(config).plan
/** The spec's default setup with a potion and the rune selected, so every mana line is there. */
const withMana = (spec: MageSpecId, rest: Partial<SimConfig> = {}): SimConfig => {
  const d = defaultConfig(spec)
  return { ...d, buffs: { ...d.buffs, enabled: [...d.buffs.enabled.filter((b) => b !== 'demonicRune'), 'demonicRune'] }, ...rest }
}
/** An order with `id` moved to just before `before`. */
const moved = (spec: keyof typeof MAGE_APL, id: string, before: string) => {
  const def = MAGE_APL[spec]
  const order = defaultAplOrder(def)
  const to = order.indexOf(before) - (order.indexOf(id) < order.indexOf(before) ? 1 : 0)
  return moveAplRow(def, order, id, to)!
}

describe.each(SPECS)('the %s priority list (D31)', (spec, key) => {
  const apl = MAGE_APL[key]
  const options = MAGE_OPTIONS[key]

  it('is the spec’s list, with a row or a spec-wide place for every setting, and nothing pinned', () => {
    expect(rotationApl(spec)).toBe(apl)
    const known = new Set(options.map((o) => o.id))
    const placed = [...apl.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...apl.specWide]
    expect([...known].filter((id) => !placed.includes(id))).toEqual([])
    expect(placed.filter((id) => !known.has(id))).toEqual([])
    // Each setting has one place.
    expect(new Set(placed).size).toBe(placed.length)
    for (const row of apl.rows) {
      if (row.enabledId) expect(options.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
      // A row without a switch says what it does.
      if (!row.enabledId) expect(row.help, row.id).toBeDefined()
    }
    expect(new Set(apl.rows.map((r) => r.id)).size).toBe(apl.rows.length)
    // No pre-pull: nothing is pinned. The consumables are spec-wide; no named rotations, so only "Default".
    expect(apl.rows.filter((r) => r.pinned)).toEqual([])
    expect(apl.specWide).toEqual([MAGE_IDS[key].manaPotion, MAGE_IDS[key].manaPotionMissing, MAGE_IDS[key].rune, MAGE_IDS[key].runeMissing])
    expect(aplPresets(apl).map((p) => p.id)).toEqual([DEFAULT_APL_PRESET])
  })

  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before
    // it: a change to it is a change to what the default order plays. Each case is built with no
    // order and with the default order stored, which must be the same plan.
    const cases = mageCases(spec, options, 200)
    const plans = cases.map((config) => plan(config))
    const hashes = plans.map((p) => fingerprint(planJson(p)))
    expect(cases.map((config) => fingerprint(planJson(plan({ ...config, rotationOrder: defaultAplOrder(apl) }))))).toEqual(hashes)
    expect(new Set(hashes).size).toBeGreaterThan(150)
    for (const p of plans) expect(p.rotation.length).toBeGreaterThan(0)
    // They cover Evocation on and off, and the mana gems on and off.
    const has = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['evocation', 'manaRuby']) {
      expect(has(id), id).toBeGreaterThan(40)
      expect(has(id), id).toBeLessThan(180)
    }
    expect(hashes).toMatchSnapshot()
  })

  it('loads an old setup without an order byte-identical, as the default preset', () => {
    // A setup saved before the list: its settings changed, no order.
    const config: SimConfig = { ...defaultConfig(spec), rotation: { [MAGE_IDS[key].evocationMana]: 20, [MAGE_IDS[key].gems]: false } }
    const loaded = normalizeConfig(config).config
    expect('rotationOrder' in loaded).toBe(false)
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(config))
    expect(planJson(plan(loaded))).toBe(planJson(plan(config)))
    expect(rotationPreset(normalizeConfig(defaultConfig(spec)).config)).toBe(DEFAULT_APL_PRESET)
    // A stored default order isn't kept: it's the default.
    expect('rotationOrder' in normalizeConfig({ ...config, rotationOrder: defaultAplOrder(apl) }).config).toBe(false)
  })

  it('puts a row a stored order doesn’t name back at its default place', () => {
    const order = defaultAplOrder(apl)
    // Missing the racial: it goes back after the row before it by default.
    expect(normalizeAplOrder(apl, order.filter((id) => id !== 'racial'))).toEqual(order)
    // Unknown ids are dropped.
    expect(normalizeAplOrder(apl, ['nope', ...order, 7])).toEqual(order)
    // Only the filler named, then Evocation: every row before the filler by default goes before it.
    const filler = order.at(-1)!
    expect(normalizeAplOrder(apl, [filler, 'evocation'])).toEqual([...order.filter((id) => id !== filler && id !== 'evocation' && order.indexOf(id) < order.indexOf('evocation')), filler, 'evocation', ...order.slice(order.indexOf('evocation') + 1, -1)])
  })
})

describe('reordering the mage’s rows', () => {
  it('Fire: Fire Blast above Scorch casts it first; Scorch keeps its own lines, which still read Fireball', () => {
    const before = plan(withMana('mage-fire'))
    expect(ids(before)).toEqual([
      'combustion',
      'berserking',
      'manaRuby',
      'manaCitrine',
      'majorManaPotion',
      'demonicRune',
      'evocation',
      'evocation',
      'scorch',
      'scorch',
      'scorch',
      'scorch',
      'pyroblast',
      'fireBlast',
      'fireball',
    ])
    const after = plan(withMana('mage-fire', { rotationOrder: moved('fire', 'fireBlast', 'scorch') }))
    expect(ids(after)).toEqual([
      'combustion',
      'berserking',
      'manaRuby',
      'manaCitrine',
      'majorManaPotion',
      'demonicRune',
      'evocation',
      'evocation',
      'fireBlast',
      'scorch',
      'scorch',
      'scorch',
      'scorch',
      'pyroblast',
      'fireball',
    ])
    // Scorch's refresh for the Fireball after it reads Fireball, wherever the rows sit; Fireball still
    // waits for Fire Blast.
    const fireball = (p: Plan) => p.abilities.findIndex((a) => a.id === 'fireball')
    const fireBlast = (p: Plan) => p.abilities.findIndex((a) => a.id === 'fireBlast')
    expect(lines(after, 'scorch').at(-1)).toEqual([{ code: COND.auraEndsBeforeCasts, a: expect.any(Number), b: fireball(after) }])
    expect(lines(after, 'fireball')).toEqual([[{ code: COND.cooldownAtLeast, a: fireBlast(after), b: FIRE_WAIT_MS }]])
    // Nothing else moved: the same abilities, the same lines.
    expect(after.abilities).toEqual(before.abilities)
    expect([...after.rotation].sort((a, b) => a.ability - b.ability)).toEqual([...before.rotation].sort((a, b) => a.ability - b.ability))
  })

  it('Fire: the mana gems below the spells go after them, with the potion and the rune', () => {
    const after = plan(withMana('mage-fire', { rotationOrder: moved('fire', 'manaGems', 'fireball') }))
    expect(ids(after).slice(-6)).toEqual(['fireBlast', 'manaRuby', 'manaCitrine', 'majorManaPotion', 'demonicRune', 'fireball'])
  })

  it('Frost: Ice Barrier above Evocation, when it’s on; Evocation before the gems', () => {
    // The default Frost build has no Ice Barrier: a build with it and Presence of Mind.
    const on = { rotation: { [MAGE_IDS.frost.iceBarrier]: true } }
    const talents = talentCode({ 'Presence of Mind': 1, 'Ice Barrier': 1 })
    const before = plan(withMana('mage-frost', { ...on, talents }))
    expect(ids(before)).toEqual(['presenceOfMind', 'berserking', 'manaRuby', 'manaCitrine', 'majorManaPotion', 'demonicRune', 'evocation', 'evocation', 'iceBarrier', 'frostbolt'])
    let order = moved('frost', 'iceBarrier', 'evocation')
    order = moveAplRow(MAGE_APL.frost, order, 'evocation', order.indexOf('manaGems'))!
    expect(ids(plan(withMana('mage-frost', { ...on, talents, rotationOrder: order })))).toEqual([
      'presenceOfMind',
      'berserking',
      'evocation',
      'evocation',
      'manaRuby',
      'manaCitrine',
      'majorManaPotion',
      'demonicRune',
      'iceBarrier',
      'frostbolt',
    ])
  })

  it('Arcane: the Pyroblast row above Presence of Mind still waits for its aura', () => {
    const before = plan(withMana('mage-arcane'))
    expect(ids(before)).toEqual(['arcanePower', 'presenceOfMind', 'berserking', 'manaRuby', 'manaCitrine', 'majorManaPotion', 'demonicRune', 'evocation', 'evocation', 'pyroblast', 'arcaneMissiles'])
    const after = plan(withMana('mage-arcane', { rotationOrder: moved('arcane', 'pyroblast', 'arcanePower') }))
    expect(ids(after)).toEqual(['pyroblast', 'arcanePower', 'presenceOfMind', 'berserking', 'manaRuby', 'manaCitrine', 'majorManaPotion', 'demonicRune', 'evocation', 'evocation', 'arcaneMissiles'])
    const pom = after.abilities.findIndex((a) => a.id === 'presenceOfMind')
    expect(lines(after, 'pyroblast')).toEqual([[{ code: COND.abilityAuraUp, a: pom, b: 0 }]])
    // Arcane Missiles at the top takes every global cooldown: the filler's place is yours to choose.
    expect(ids(plan(withMana('mage-arcane', { rotationOrder: moved('arcane', 'arcaneMissiles', 'arcanePower') })))[0]).toBe('arcaneMissiles')
  })

  it('skips a row that’s off, wherever it sits', () => {
    // Fire Blast off: no line, and Fireball no longer waits for it.
    const fire = plan(withMana('mage-fire', { rotation: { [MAGE_IDS.fire.fireBlast]: false }, rotationOrder: moved('fire', 'fireBlast', 'combustion') }))
    expect(ids(fire)).not.toContain('fireBlast')
    expect(lines(fire, 'fireball')).toEqual([[]])
    // Presence of Mind off: neither it nor its Pyroblast.
    const arcane = plan(withMana('mage-arcane', { rotation: { [MAGE_IDS.arcane.presenceOfMind]: false } }))
    expect(ids(arcane)).not.toContain('presenceOfMind')
    expect(ids(arcane)).not.toContain('pyroblast')
    // The mana gems off: the potion and the rune, spec-wide, still take their turn in the gems' place.
    const frost = plan(withMana('mage-frost', { rotation: { [MAGE_IDS.frost.gems]: false } }))
    expect(ids(frost)).toEqual(['presenceOfMind', 'berserking', 'majorManaPotion', 'demonicRune', 'evocation', 'evocation', 'frostbolt'])
  })
})
