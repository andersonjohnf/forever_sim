// The Protection paladin's rotation as a priority list (decisions D28, D31; docs/classes/paladin.md
// "Forever priority list (default)", "Priority: Defensive, Balanced or Max TPS"): the rows cover every
// setting, D28's three rotations are its presets, the compiler follows the stored order, a moved row
// keeps its own conditions, and Defensive and Max TPS give the plans they gave before the list.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { normalizeConfig } from '../../config/normalize'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { rotationPreset } from '../../index'
import { buildPlan } from '../../plan/build'
import { COND } from '../../plan/types'
import { activeAplPreset, aplPresets, applyAplPreset, CUSTOM_APL_PRESET, DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder } from '../apl'
import { fingerprint, planJson } from '../warrior/fury-apl-cases'
import { PROTECTION_APL, PROTECTION_IDS as ID, PROTECTION_OPTIONS, protectionRotation } from './protection'
import { PRE_LIST_ORDER, protectionCases } from './protection-apl-cases'

const PROT = 'paladin-protection'
const TALENTS = talentRanksByName(TALENT_DATA.paladin, defaultConfig(PROT).talents)
const CONTEXT = { hasShield: true, maxMana: 4000, executePhase: true, mainHand: { speedSec: 1.5, twoHand: false, type: 'axe' as const } }
const noAura = () => -1
type Rot = ReturnType<typeof protectionRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string) => {
  const order = defaultAplOrder(PROTECTION_APL)
  return moveAplRow(PROTECTION_APL, order, id, order.indexOf(before) - (order.indexOf(id) < order.indexOf(before) ? 1 : 0))!
}
const preset = (rotation: Record<string, string | number | boolean>, order?: string[]) => activeAplPreset(PROTECTION_APL, PROTECTION_OPTIONS, rotation, order, TALENTS)

describe('Protection paladin’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own; the Priority choice is the preset picker', () => {
    const known = new Set(PROTECTION_OPTIONS.map((o) => o.id))
    const placed = new Set([...PROTECTION_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...PROTECTION_APL.specWide])
    // The Priority choice isn't a control of its own: the presets set it (D28).
    expect([...known].filter((id) => !placed.has(id))).toEqual([ID.priority])
    expect(PROTECTION_APL.presets.flatMap((p) => Object.keys(p.values))).toEqual([ID.priority, ID.priority])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    for (const row of PROTECTION_APL.rows) {
      if (row.enabledId) expect(PROTECTION_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
      // A row without a switch says what it does.
      if (!row.enabledId) expect(row.help, row.id).toBeTruthy()
    }
    expect(new Set(PROTECTION_APL.rows.map((r) => r.id)).size).toBe(PROTECTION_APL.rows.length)
    // paladin.md's order: the pre-pull and opener pinned first (rows 0–0c), then rows 1–8, with
    // Exorcism, Hammer of Wrath and Consecration above Holy Strike since the paladin review's PR-1, and
    // Hammer of the Righteous (5b, off) just above Holy Strike (5), so turning it on puts it in Holy
    // Strike's place.
    expect(defaultAplOrder(PROTECTION_APL)).toEqual([
      'prepull',
      'seal',
      'holyShield',
      'judgement',
      'swiftJudgement',
      'exorcism',
      'hammerOfWrath',
      'consecration',
      'consecrationRank1',
      'hammerOfTheRighteous',
      'holyStrike',
      'trinkets',
    ])
    // The on-use trinkets are a row, last, where their lines were before it (UA-6), so no plan moved; a
    // stored order from before it, such as PRE_LIST_ORDER, puts it last too.
    expect(normalizeAplOrder(PROTECTION_APL, [...PRE_LIST_ORDER]).at(-1)).toBe('trinkets')
    expect(PROTECTION_APL.specWide).toEqual([ID.juju, ID.manaPotion, ID.manaPotionEarly, ID.manaPotionMissing, ID.rune, ID.runeEarly, ID.runeMissing])
    expect(PROTECTION_APL.rows.filter((r) => r.pinned).map((r) => r.id)).toEqual(['prepull'])
  })

  it('gives the same list in the default order as with none', () => {
    for (const values of [{}, { [ID.priority]: 'duties' }, { [ID.priority]: 'maxTps' }, { [ID.crusader]: false }]) {
      const none = protectionRotation(values, TALENTS, noAura, CONTEXT)
      expect(protectionRotation(values, TALENTS, noAura, CONTEXT, defaultAplOrder(PROTECTION_APL))).toEqual(none)
    }
  })

  it('gives 200 random Defensive and Max TPS setups the plan they had before the list', () => {
    // Settings, talents, race, weapons, shield, trinkets, consumables, phase, creature type and
    // rules at random, the priority always set to one of the two rotations there were. The snapshot
    // is of the plans before the priority list (A2), taken on that code: a change to it is a change
    // to what Defensive or Max TPS plays. Re-taken for 1.60.1.70009's Wizard Oil (+24 spell damage,
    // was 30), which every case's Standard raid brings: all 200 moved, and with the oil at 30 again
    // all 200 match the old snapshot. Re-snapshotted for 1.60.1.70009's paladin values (Righteous
    // Fury +60%, Holy Strike 50% every 10 s, Retribution Aura and Thorns with spell damage, Improved
    // Holy Strike's and Crusade's points refunded): each plan's values moved with them. The 70009
    // integration re-took it on the merge of the two: with Wizard Oil back at 30, the paladin slice's
    // own snapshot reproduces exactly. Re-taken for the paladin review's PR-4: a raid's Thorns is a
    // Restoration druid's, 22 + 0.08 × 200 = 38 unrounded (buffs doc §1.2); with it set back to 53,
    // the snapshot before it reproduces exactly. PR-1 then moved the default order; each case keeps the
    // order from before it (protection-apl-cases.ts PRE_LIST_ORDER), so the snapshot didn't move.
    // Re-taken for Touch of the Grave (character-stats.md#touch-of-the-grave): every plan carries one
    // more trigger list (`damageLanded`), and an Undead's its proc and row. With the lists held at the
    // 27 codes before it, exactly the 49 Undead cases move, and the other 151 reproduce the snapshot.
    // Re-taken for the Feral bear slice (2026-09-26, CL-4): a raid druid's Thorns is 22 + 0.08 × 313 =
    // 47.04, a pre-raid Restoration druid's spell damage (buffs doc §1.2), was 38; with it set back to
    // 38, main's snapshot reproduces exactly.
    const hashes = protectionCases(200).map((config) => fingerprint(planJson(buildPlan(config).plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    expect(hashes).toMatchSnapshot()
  })

  it('builds the list in the stored order, the opener and the pre-pull where they were', () => {
    const r = protectionRotation({}, TALENTS, noAura, CONTEXT, moved('consecration', 'holyShield'))
    expect(ids(r)).toEqual([
      'judgementOfTheCrusader',
      'sealOfTheCrusader',
      'sealOfFury',
      'sealOfFury',
      'consecration',
      'holyShield',
      'judgementOfFury',
      'swiftJudgement',
      'hammerOfWrath',
      'consecrationRank1',
      'holyStrike',
    ])
    expect(r.prepull.casts.map((c) => r.abilities[c.ability].id)).toEqual(['devotionAura', 'righteousFury', 'sealOfTheCrusader'])
    // Abilities 0 and 1 are still the seal and its judgement.
    expect(r.abilities.slice(0, 2).map((a) => a.id)).toEqual(['sealOfFury', 'judgementOfFury'])
  })

  it('keeps a moved row’s own conditions: Hammer of the Righteous, on, still sits above Holy Strike, which shares its cooldown; Swift Judgement still frees Judgement', () => {
    const order = moveAplRow(PROTECTION_APL, moved('hammerOfTheRighteous', 'seal'), 'swiftJudgement', 1)!
    expect(order.slice(0, 4)).toEqual(['prepull', 'swiftJudgement', 'hammerOfTheRighteous', 'seal'])
    const hammerOn = { [ID.hammerOfTheRighteous]: true }
    const r = protectionRotation(hammerOn, TALENTS, noAura, CONTEXT, order)
    // Both rows, in the list's order: the shared cooldown decides (TI-5), so Holy Strike is the fallback
    // when Hammer's 90 mana isn't there.
    expect(ids(r).filter((id) => id === 'holyStrike' || id === 'hammerOfTheRighteous')).toEqual(['hammerOfTheRighteous', 'holyStrike'])
    // Off, as in every preset, Holy Strike.
    expect(ids(protectionRotation({}, TALENTS, noAura, CONTEXT, order)).filter((id) => id === 'holyStrike' || id === 'hammerOfTheRighteous')).toEqual(['holyStrike'])
    // On but below Holy Strike, which shares its cooldown and costs less, so always takes it: Holy
    // Strike alone, and Hammer of the Righteous, never cast, is left out (TV-2).
    const below = moveAplRow(PROTECTION_APL, defaultAplOrder(PROTECTION_APL), 'hammerOfTheRighteous', defaultAplOrder(PROTECTION_APL).indexOf('holyStrike'))!
    expect(below.indexOf('hammerOfTheRighteous')).toBeGreaterThan(below.indexOf('holyStrike'))
    expect(ids(protectionRotation(hammerOn, TALENTS, noAura, CONTEXT, below)).filter((id) => id === 'holyStrike' || id === 'hammerOfTheRighteous')).toEqual(['holyStrike'])
    // …and Hammer of the Righteous there once Holy Strike is off.
    expect(
      ids(protectionRotation({ ...hammerOn, [ID.holyStrike]: false }, TALENTS, noAura, CONTEXT, below)).filter((id) => id === 'holyStrike' || id === 'hammerOfTheRighteous'),
    ).toEqual(['hammerOfTheRighteous'])
    const judge = r.abilities.findIndex((a) => a.id === 'judgementOfFury')
    const swift = r.rotation.find((e) => r.abilities[e.ability].id === 'swiftJudgement')!
    expect(swift.conditions[0]).toEqual({ code: COND.cooldownAtLeast, a: judge, b: 4500 })
    expect(r.abilities[swift.ability].endsCooldownOf).toBe(judge)
    expect(r.abilities[judge].clearcastable).toBe(true)
    // With a two-hander, Holy Strike in its own place.
    const two = protectionRotation(hammerOn, TALENTS, noAura, { ...CONTEXT, mainHand: { speedSec: 3.5, twoHand: true, type: 'axe' } }, order)
    expect(ids(two).filter((id) => id === 'holyStrike' || id === 'hammerOfTheRighteous')).toEqual(['holyStrike'])
  })
})

describe('Defensive, Balanced and Max TPS as the list’s presets (D28)', () => {
  it('lists Defensive, Balanced (the default) and Max TPS, each with measured help', () => {
    expect(aplPresets(PROTECTION_APL).map((p) => [p.id, p.label])).toEqual([
      ['defensive', 'Defensive'],
      [DEFAULT_APL_PRESET, 'Balanced'],
      ['maxTps', 'Max TPS'],
    ])
    for (const p of aplPresets(PROTECTION_APL)) expect(p.help, p.id).toMatch(/\d/)
  })

  it('reads a stored priority as its rotation, and the old default as Balanced (D28)', () => {
    expect(preset({})).toBe(DEFAULT_APL_PRESET)
    // A setup that chose D26's "Tank duties first" loads it as Defensive; Max TPS as Max TPS.
    expect(preset({ [ID.priority]: 'duties' })).toBe('defensive')
    expect(preset({ [ID.priority]: 'maxTps' })).toBe('maxTps')
    expect(preset({ [ID.priority]: 'balanced' })).toBe(DEFAULT_APL_PRESET)
    // A spec-wide setting you set keeps the preset.
    expect(preset({ [ID.priority]: 'duties', [ID.manaPotionEarly]: 1000 })).toBe('defensive')
    // Editing the list after picking one makes it Custom.
    expect(preset({ [ID.priority]: 'duties', [ID.consecrationMana]: 40 })).toBe(CUSTOM_APL_PRESET)
    expect(preset({ [ID.priority]: 'duties', [ID.hammerOfTheRighteous]: true })).toBe(CUSTOM_APL_PRESET)
    expect(preset({ [ID.priority]: 'maxTps', [ID.devotionAura]: true })).toBe(CUSTOM_APL_PRESET)
    expect(preset({}, moved('consecration', 'holyShield'))).toBe(CUSTOM_APL_PRESET)
    // Through the config, as the Rotation tab reads it; a stored value survives normalizeConfig.
    const d = defaultConfig(PROT)
    expect(rotationPreset({ ...d, rotation: { [ID.priority]: 'duties' } })).toBe('defensive')
    const loaded = normalizeConfig({ ...d, rotation: { [ID.priority]: 'duties' } })
    expect(loaded.config.rotation).toEqual({ [ID.priority]: 'duties' })
    expect(loaded.warnings).toEqual([])
  })

  it('picks one: its priority, the list’s settings at their defaults for it, the order reset, the consumables kept', () => {
    const saved = { [ID.priority]: 'maxTps', [ID.consecrationMana]: 40, [ID.manaPotionEarly]: 1000 }
    expect(applyAplPreset(PROTECTION_APL, saved, 'defensive')).toEqual({ rotation: { [ID.manaPotionEarly]: 1000, [ID.priority]: 'duties' }, rotationOrder: undefined })
    // Balanced, the default, puts the priority back to its default.
    expect(applyAplPreset(PROTECTION_APL, saved, DEFAULT_APL_PRESET)).toEqual({ rotation: { [ID.manaPotionEarly]: 1000 }, rotationOrder: undefined })
    // Defensive plays the rotation that was the default before Balanced; Balanced plays it too,
    // keeping Holy Strike (user decision in D28).
    const d = defaultConfig(PROT)
    const defensive = applyAplPreset(PROTECTION_APL, {}, 'defensive')!.rotation
    expect(buildPlan({ ...d, rotation: defensive }).plan).toEqual(buildPlan({ ...d, rotation: { [ID.priority]: 'duties', [ID.hammerOfTheRighteous]: false } }).plan)
    expect(buildPlan({ ...d, rotation: defensive }).plan).toEqual(buildPlan(d).plan)
  })
})
