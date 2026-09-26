// The Retribution paladin's rotation as a priority list (decision D31; docs/classes/paladin.md
// "Forever priority list (default)"): the rows cover every setting, the default order gives the plans
// the rotation gave before the list, the compiler follows the stored order, a moved row keeps its
// own conditions, and the two Consecration rows say when the lower one is never used.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { normalizeConfig } from '../../config/normalize'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { rotationPreset, unusedRotationSettings } from '../../index'
import { buildPlan } from '../../plan/build'
import { activeAplPreset, aplPresets, CUSTOM_APL_PRESET, DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder } from '../apl'
import { fingerprint, planJson } from '../warrior/fury-apl-cases'
import { RETRIBUTION_APL, RETRIBUTION_IDS as ID, RETRIBUTION_OPTIONS, retributionRotation, retributionUnusedSettings } from './retribution'
import { retributionCases } from './retribution-apl-cases'

const RET = 'paladin-retribution'
const TALENTS = talentRanksByName(TALENT_DATA.paladin, defaultConfig(RET).talents)
const CONTEXT = { maxMana: 4000, executePhase: true, creatureType: 'undead' as const, mainHand: { speedSec: 3.5, twoHand: true, type: 'sword' as const } }
const noAura = () => -1
type Rot = ReturnType<typeof retributionRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const DEFAULT_ORDER = defaultAplOrder(RETRIBUTION_APL)
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string, from: readonly string[] = DEFAULT_ORDER) =>
  moveAplRow(RETRIBUTION_APL, from, id, from.indexOf(before) - (from.indexOf(id) < from.indexOf(before) ? 1 : 0))!

describe('Retribution’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    const known = new Set(RETRIBUTION_OPTIONS.map((o) => o.id))
    const placed = [...RETRIBUTION_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...RETRIBUTION_APL.specWide]
    expect([...known].filter((id) => !placed.includes(id))).toEqual([])
    expect(placed.filter((id) => !known.has(id))).toEqual([])
    // Each setting in one place: the seal choice in the seal's row, as the Protection paladin's.
    expect(new Set(placed).size).toBe(placed.length)
    expect(RETRIBUTION_APL.rows.find((r) => r.id === 'seal')?.optionIds).toEqual([ID.seal, ID.sealRefresh])
    for (const row of RETRIBUTION_APL.rows) {
      if (row.enabledId) expect(RETRIBUTION_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
      if (!row.enabledId) expect(row.help, row.id).toBeTruthy()
    }
    // paladin.md's order: the opener pinned first (rows 0 and 2), then rows 1 and 3–8, then the on-use
    // trinkets, last, where their lines were before they had a row (UA-6), so the plan didn't move.
    expect(DEFAULT_ORDER).toEqual(['prepull', 'seal', 'judgement', 'hammerOfWrath', 'holyStrike', 'exorcism', 'consecration', 'consecrationRank1', 'trinkets'])
    // Juju Flurry and the mana consumables above the list, as every spec's.
    expect(RETRIBUTION_APL.specWide).toEqual([ID.juju, ID.manaPotion, ID.manaPotionEarly, ID.manaPotionMissing, ID.rune, ID.runeEarly, ID.runeMissing])
    expect(RETRIBUTION_APL.rows.filter((r) => r.pinned).map((r) => r.id)).toEqual(['prepull'])
    // No named rotations: the implicit Default only (D27's common priority, as Fury's).
    expect(aplPresets(RETRIBUTION_APL).map((p) => p.label)).toEqual(['Default'])
  })

  it('gives 200 random setups the plan they had before the list', () => {
    // Settings, talents, race, weapons, trinkets, consumables, phase, creature type and the JotC rule
    // at random, none with a stored order. The snapshot is of the plans before the priority list (A2),
    // taken on that code: a change to it is a change to what the default order plays. Re-taken for
    // the beta-log check (paladin.md#the-beta-log-check-2026-09-26), each step that moves a spell's
    // numbers: Seal of Righteousness (its proc's base points gone) moved every case with it.
    const plans = retributionCases(200).map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover both seals, the opener on and off, Exorcism and Hammer of Wrath in and out.
    const has = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['sealOfCommand', 'sealOfRighteousness', 'sealOfTheCrusader', 'exorcism', 'hammerOfWrath', 'consecrationRank1']) {
      expect(has(id), id).toBeGreaterThan(20)
      expect(has(id), id).toBeLessThan(190)
    }
    expect(hashes).toMatchSnapshot()
    // The default order stored explicitly is the same plan as none.
    for (const config of retributionCases(20)) {
      expect(fingerprint(planJson(buildPlan({ ...config, rotationOrder: DEFAULT_ORDER }).plan))).toBe(fingerprint(planJson(buildPlan(config).plan)))
    }
  })

  it('gives the same list in the default order as with none', () => {
    for (const values of [{}, { [ID.crusader]: false }, { [ID.seal]: 'righteousness' }, { [ID.consecrationRank1]: false }]) {
      const none = retributionRotation(values, TALENTS, noAura, CONTEXT)
      expect(retributionRotation(values, TALENTS, noAura, CONTEXT, DEFAULT_ORDER)).toEqual(none)
    }
    expect(ids(retributionRotation({}, TALENTS, noAura, CONTEXT))).toEqual([
      'judgementOfTheCrusader',
      'sealOfTheCrusader',
      'sealOfCommand',
      'sealOfCommand',
      'judgementOfCommand',
      'hammerOfWrath',
      'holyStrike',
      'exorcism',
      'consecration',
      'consecrationRank1',
    ])
  })

  it('builds the list in the stored order, the opener and the pre-pull where they were, each row with its own conditions', () => {
    const none = retributionRotation({}, TALENTS, noAura, CONTEXT)
    const order = moved('consecration', 'seal', moved('holyStrike', 'hammerOfWrath'))
    expect(order).toEqual(['prepull', 'consecration', 'seal', 'judgement', 'holyStrike', 'hammerOfWrath', 'exorcism', 'consecrationRank1', 'trinkets'])
    const r = retributionRotation({}, TALENTS, noAura, CONTEXT, order)
    expect(ids(r)).toEqual([
      'judgementOfTheCrusader',
      'sealOfTheCrusader',
      'consecration',
      'sealOfCommand',
      'sealOfCommand',
      'judgementOfCommand',
      'holyStrike',
      'hammerOfWrath',
      'exorcism',
      'consecrationRank1',
    ])
    // Abilities 0 and 1 are still the seal and its judgement, then the opener's; the pre-pull is the same.
    expect(r.abilities.slice(0, 4).map((a) => a.id)).toEqual(['sealOfCommand', 'judgementOfCommand', 'sealOfTheCrusader', 'judgementOfTheCrusader'])
    expect(r.prepull).toEqual(none.prepull)
    // A moved row keeps its conditions: Consecration's mana threshold, the seal's refresh and the
    // opener's guard, the judgement's seal (which refer to abilities 0–3, the same in both).
    const lines = (rot: Rot, id: string) => rot.rotation.filter((e) => rot.abilities[e.ability].id === id).map((e) => e.conditions)
    for (const id of ['consecration', 'sealOfCommand', 'judgementOfCommand', 'hammerOfWrath', 'holyStrike']) expect(lines(r, id), id).toEqual(lines(none, id))
    // The pinned opener can't move, and nothing passes it.
    expect(moveAplRow(RETRIBUTION_APL, order, 'prepull', 3)).toBeNull()
    expect(moveAplRow(RETRIBUTION_APL, order, 'seal', 0)).toBeNull()
  })

  it('skips a row that’s off, wherever it sits', () => {
    const order = moved('holyStrike', 'seal')
    const r = retributionRotation({ [ID.holyStrike]: false, [ID.exorcism]: false }, TALENTS, noAura, CONTEXT, order)
    expect(ids(r)).not.toContain('holyStrike')
    expect(ids(r)).not.toContain('exorcism')
    expect(ids(r).slice(0, 3)).toEqual(['judgementOfTheCrusader', 'sealOfTheCrusader', 'sealOfCommand'])
  })

  it('puts rows a stored order doesn’t name at their default place', () => {
    // A hand-written order naming two rows: the rest follow their default neighbours. Rank 1 goes
    // after Consecration, then past Holy Strike and Exorcism, which come before it by default.
    expect(normalizeAplOrder(RETRIBUTION_APL, ['consecration', 'holyStrike'])).toEqual([
      'prepull',
      'seal',
      'judgement',
      'hammerOfWrath',
      'consecration',
      'holyStrike',
      'exorcism',
      'consecrationRank1',
      'trinkets',
    ])
    // A setup saved without a row (here Exorcism, with Holy Strike moved first): it follows Holy Strike,
    // its default predecessor, and the rows after it that come before Exorcism by default too.
    const withoutExorcism = DEFAULT_ORDER.filter((id) => id !== 'exorcism')
    expect(normalizeAplOrder(RETRIBUTION_APL, moved('holyStrike', 'seal', withoutExorcism))).toEqual([
      'prepull',
      'holyStrike',
      'seal',
      'judgement',
      'hammerOfWrath',
      'exorcism',
      'consecration',
      'consecrationRank1',
      'trinkets',
    ])
    // A setup saved before the trinkets had a row: they go last, where their lines were.
    expect(normalizeAplOrder(RETRIBUTION_APL, moved('consecration', 'seal', DEFAULT_ORDER.filter((id) => id !== 'trinkets'))).at(-1)).toBe('trinkets')
    // Unknown ids dropped; the pinned opener stays first; one row named alone keeps its default place.
    expect(normalizeAplOrder(RETRIBUTION_APL, ['nope', 'exorcism', 'prepull'])).toEqual(DEFAULT_ORDER)
  })

  it('loads an old setup without an order byte-identical, and reads a moved row as Custom', () => {
    const d = defaultConfig(RET)
    const saved = { ...d, rotation: { [ID.consecrationMana]: 40 } }
    const loaded = normalizeConfig(saved)
    expect(loaded.config.rotationOrder).toBeUndefined()
    expect(loaded.warnings).toEqual([])
    expect(fingerprint(planJson(buildPlan(loaded.config).plan))).toBe(fingerprint(planJson(buildPlan(saved).plan)))
    // A stored default order isn't kept; a moved one is, and it's Custom.
    expect(normalizeConfig({ ...d, rotationOrder: DEFAULT_ORDER }).config.rotationOrder).toBeUndefined()
    const order = moved('holyStrike', 'judgement')
    expect(normalizeConfig({ ...d, rotationOrder: order }).config.rotationOrder).toEqual(order)
    expect(rotationPreset(d)).toBe(DEFAULT_APL_PRESET)
    expect(rotationPreset({ ...d, rotationOrder: order })).toBe(CUSTOM_APL_PRESET)
    expect(activeAplPreset(RETRIBUTION_APL, RETRIBUTION_OPTIONS, { [ID.manaPotionEarly]: 1000 }, undefined, TALENTS)).toBe(DEFAULT_APL_PRESET)
    expect(activeAplPreset(RETRIBUTION_APL, RETRIBUTION_OPTIONS, { [ID.seal]: 'righteousness' }, undefined, TALENTS)).toBe(CUSTOM_APL_PRESET)
    // And a moved row changes the plan the sim runs.
    expect(fingerprint(planJson(buildPlan({ ...d, rotationOrder: order }).plan))).not.toBe(fingerprint(planJson(buildPlan(d).plan)))
  })
})

describe('the two Consecration rows, which share a cooldown', () => {
  const rank5 = 'Not used: Consecration (Rank 1), above it, takes their shared cooldown from 10% mana, and this starts from 20%. Set this below 10%, or move it above Consecration (Rank 1).'
  const rank1 = 'Not used: Consecration, above it, takes their shared cooldown from 20% mana, and this starts from 30%. Set this below 20%, or move it above Consecration.'

  it('say nothing in the default order and settings', () => {
    expect(retributionUnusedSettings({})).toEqual({})
    expect(unusedRotationSettings(defaultConfig(RET))).toEqual({})
  })

  it('say when the lower row is never cast: from as much mana as the higher, and rank 1 from enough to pay rank 5 (consecration-rows.test.ts)', () => {
    const rank1First = moveAplRow(RETRIBUTION_APL, DEFAULT_ORDER, 'consecrationRank1', DEFAULT_ORDER.indexOf('consecration'))!
    expect(rank1First.indexOf('consecrationRank1')).toBe(rank1First.indexOf('consecration') - 1)
    // Rank 1 (from 10%) above rank 5 (from 20%): rank 5 is never cast.
    expect(retributionUnusedSettings({}, rank1First)).toEqual({ [ID.consecration]: rank5 })
    // …unless rank 1 needs more mana than rank 5.
    expect(retributionUnusedSettings({ [ID.consecrationRank1Mana]: 30 }, rank1First)).toEqual({})
    // In the default order, rank 1 from as much mana as rank 5 is still cast whenever the mana is there
    // for it and not for rank 5 (15.76 a fight from 0% each, the review measured), so the note waits
    // until rank 1 starts from more than rank 5's most cost on any paladin's mana: just over 25%.
    expect(retributionUnusedSettings({ [ID.consecrationMana]: 0, [ID.consecrationRank1Mana]: 0 })).toEqual({})
    expect(retributionUnusedSettings({ [ID.consecrationRank1Mana]: 20 })).toEqual({})
    expect(retributionUnusedSettings({ [ID.consecrationRank1Mana]: 25 })).toEqual({})
    expect(retributionUnusedSettings({ [ID.consecrationRank1Mana]: 30 })).toEqual({ [ID.consecrationRank1]: rank1 })
    // With either off, nothing to say.
    expect(retributionUnusedSettings({ [ID.consecrationRank1]: false }, rank1First)).toEqual({})
    // The Rotation tab reads it through the config's order.
    expect(unusedRotationSettings({ ...defaultConfig(RET), rotationOrder: rank1First })).toEqual({ [ID.consecration]: rank5 })
  })
})
