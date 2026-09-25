// The Feral bear's rotation as a priority list (decision D31; docs/classes/druid.md §6.3 "The
// priority list"): the rows cover every setting, Defensive and Max TPS play exactly as the bear
// played them before the list, the three presets (D28) load from what a setup stored, and the
// compiler follows the stored order.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { JUJU_FLURRY as JUJU, MIGHTY_RAGE_POTION } from '../../effects/buffs'
import { normalizeConfig } from '../../config/normalize'
import { rotationPreset } from '../../index'
import { buildPlan } from '../../plan/build'
import { activeAplPreset, applyAplPreset, CUSTOM_APL_PRESET, DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder } from '../apl'
import { BEAR_APL, BEAR_IDS, BEAR_OPTIONS, BEAR_PRIORITY, bearRotation } from './bear'
import { planJson } from '../warrior/fury-apl-cases'
import { bearCases, fingerprint } from './bear-apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.druid, defaultConfig('druid-feral-bear').talents)
const CONTEXT = { consumables: [MIGHTY_RAGE_POTION, JUJU] }
const noAura = () => -1
type Rot = ReturnType<typeof bearRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const active = (saved: Record<string, string | number | boolean>, order?: string[]) => activeAplPreset(BEAR_APL, BEAR_OPTIONS, saved, order, TALENTS)

describe('the Feral bear’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting but the priority, which the presets set', () => {
    const known = new Set(BEAR_OPTIONS.map((o) => o.id))
    const placed = new Set([...BEAR_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...BEAR_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([BEAR_IDS.priority])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    expect(BEAR_APL.presets.map((p) => Object.keys(p.values))).toEqual([[BEAR_IDS.priority], [], [BEAR_IDS.priority]])
    for (const row of BEAR_APL.rows) {
      if (row.enabledId) expect(BEAR_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    }
    expect(new Set(BEAR_APL.rows.map((r) => r.id)).size).toBe(BEAR_APL.rows.length)
    // Only the pre-pull is pinned, first; the duties keep their timing rule wherever they sit.
    expect(BEAR_APL.rows.filter((r) => r.pinned).map((r) => r.id)).toEqual(['prepull'])
    expect(BEAR_APL.rows[0].id).toBe('prepull')
  })

  it('gives 200 random setups the plan they had before the list, with Defensive or Max TPS', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before it:
    // a change to it is a change to what Defensive or Max TPS plays. A setup that kept the old
    // default, tank duties first, is Defensive now. T5 then tuned Max TPS's Maul threshold, 20 → 14
    // (druid.md §6.3 "Max TPS"), a change to what it plays on purpose, so the cases that leave it
    // unset keep the old 20: the list itself changes nothing.
    // Build 1.60.1.70009 renamed Mangle to Primal Bite and Primal Fury to Blood Frenzy, with new
    // icons (druid.md §4.2): re-snapshotted, since the plans carry names and icons. Mapping the four
    // strings back gives all 200 of the old fingerprints: nothing the rotation plays moved. Then
    // Lacerate's "high amount of threat" became Forever's Sunder Armor's, 206 + 0.05 × AP (threat.md's
    // wording table): the `forever` cases' Lacerate row carries it, so they're re-taken again; the
    // rotation's lines are the same. The 70009 integration re-took it for the paladin slice's Thorns
    // (22 + 0.08 × a raid druid's 389, dealt as 53; buffs doc §1.2), which every case with Thorns in
    // its buffs carries: with Thorns set back to its flat 22, the druid slice's snapshot reproduces
    // exactly.
    const cases = bearCases(BEAR_OPTIONS, 200)
    const plans = cases.map((config) =>
      buildPlan({
        ...config,
        rotation: { [BEAR_IDS.priority]: BEAR_PRIORITY.duties, [BEAR_IDS.maulMinRage]: 20, ...config.rotation },
        rotationOrder: defaultAplOrder(BEAR_APL),
      }).plan,
    )
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover the roar on and off, and a rotation each.
    const roars = plans.filter((p) => p.abilities.some((a) => a.id === 'demoralizingRoar')).length
    expect(roars).toBeGreaterThan(40)
    expect(roars).toBeLessThan(160)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })

  it('plays Defensive and Max TPS picked from the preset menu as the old defaults and Max TPS', () => {
    const [before, maxBefore] = bearCases(BEAR_OPTIONS, 2)
    const fp = (config: typeof before) => fingerprint(planJson(buildPlan(config).plan))
    const pick = (id: string, saved = {}) => {
      const picked = applyAplPreset(BEAR_APL, saved, id)!
      return { ...before, rotation: picked.rotation, ...(picked.rotationOrder ? { rotationOrder: picked.rotationOrder } : {}) }
    }
    const beforeDefensive = fp({ ...before, rotation: { [BEAR_IDS.priority]: BEAR_PRIORITY.duties } })
    expect(fp(pick('defensive'))).toBe(beforeDefensive)
    expect(fp(pick('maxTps', { [BEAR_IDS.maulMinRage]: 30 }))).toBe(fp(maxBefore))
    // Balanced is the default now: the roar off, Faerie Fire kept.
    const balanced = buildPlan(pick(DEFAULT_APL_PRESET)).plan
    expect(balanced.abilities.some((a) => a.id === 'demoralizingRoar')).toBe(false)
    expect(balanced.abilities.some((a) => a.id === 'faerieFire')).toBe(true)
    expect(fingerprint(planJson(balanced))).toBe(fp(defaultConfig('druid-feral-bear')))
  })

  it('loads what a setup stored as its preset (D28): the old default as Balanced, “duties” as Defensive', () => {
    expect(active({})).toBe(DEFAULT_APL_PRESET)
    expect(active({ [BEAR_IDS.priority]: BEAR_PRIORITY.balanced })).toBe(DEFAULT_APL_PRESET)
    expect(active({ [BEAR_IDS.priority]: BEAR_PRIORITY.duties })).toBe('defensive')
    // Balanced and Max TPS set the same rows; the priority tells them apart.
    expect(active({ [BEAR_IDS.priority]: BEAR_PRIORITY.maxTps })).toBe('maxTps')
    // A setting the preset didn't set, or a moved row, is Custom; the potion, spec-wide, isn't the list's.
    expect(active({ [BEAR_IDS.priority]: BEAR_PRIORITY.duties, [BEAR_IDS.roarEnabled]: false })).toBe(CUSTOM_APL_PRESET)
    expect(active({ [BEAR_IDS.roarEnabled]: true })).toBe(CUSTOM_APL_PRESET)
    expect(active({}, moveAplRow(BEAR_APL, defaultAplOrder(BEAR_APL), 'maul', 8)!)).toBe(CUSTOM_APL_PRESET)
    expect(active({ [BEAR_IDS.potionMaxRage]: 10 })).toBe(DEFAULT_APL_PRESET)
    // A saved setup or link, read as the app reads it.
    const saved = (rotation: Record<string, string>) => rotationPreset(normalizeConfig({ ...defaultConfig('druid-feral-bear'), rotation }).config)
    expect([saved({}), saved({ [BEAR_IDS.priority]: 'duties' }), saved({ [BEAR_IDS.priority]: 'maxTps' })]).toEqual([DEFAULT_APL_PRESET, 'defensive', 'maxTps'])
    // Picking Balanced after Defensive clears the stored priority, and keeps the potion's limit.
    expect(applyAplPreset(BEAR_APL, { [BEAR_IDS.priority]: BEAR_PRIORITY.duties, [BEAR_IDS.maulMinRage]: 30, [BEAR_IDS.potionMaxRage]: 10 }, DEFAULT_APL_PRESET)).toEqual({
      rotation: { [BEAR_IDS.potionMaxRage]: 10 },
      rotationOrder: undefined,
    })
  })

  it('gives the same list in the default order as with none, and builds it in the stored order', () => {
    const values = { [BEAR_IDS.priority]: BEAR_PRIORITY.duties, [BEAR_IDS.swipeEnabled]: true }
    const none = bearRotation(values, TALENTS, noAura, CONTEXT)
    expect(bearRotation(values, TALENTS, noAura, CONTEXT, defaultAplOrder(BEAR_APL))).toEqual(none)
    // druid.md §6.3's order: Berserk, Enrage, the consumables with the on-use items, Maul, the duties,
    // Primal Bite (row `mangle`), Lacerate (two lines), Swipe and the filler.
    expect(ids(none)).toEqual(['berserk', 'enrage', 'mightyRagePotion', 'jujuFlurry', 'maul', 'demoralizingRoar', 'faerieFire', 'mangle', 'lacerate', 'lacerate', 'swipe', 'faerieFire'])
    // Maul after Lacerate, and Primal Bite above the duties: each keeps its own lines.
    let order = moveAplRow(BEAR_APL, defaultAplOrder(BEAR_APL), 'maul', defaultAplOrder(BEAR_APL).indexOf('lacerate'))!
    order = moveAplRow(BEAR_APL, order, 'mangle', order.indexOf('demoRoar'))!
    const r = bearRotation(values, TALENTS, noAura, CONTEXT, order)
    expect(ids(r)).toEqual(['berserk', 'enrage', 'mightyRagePotion', 'jujuFlurry', 'mangle', 'demoralizingRoar', 'faerieFire', 'lacerate', 'lacerate', 'maul', 'swipe', 'faerieFire'])
    // Maul's rage threshold reads no other ability, so its line is the same.
    const conditions = (rot: Rot, id: string) => rot.rotation.filter((e) => rot.abilities[e.ability].id === id).map((e) => e.conditions)
    expect(conditions(r, 'maul')).toEqual(conditions(none, 'maul'))
    // The pre-pull is the same, and the pinned row can't move.
    expect(r.prepull.casts.map((c) => [r.abilities[c.ability].id, c.atMs])).toEqual(none.prepull.casts.map((c) => [none.abilities[c.ability].id, c.atMs]))
    expect(moveAplRow(BEAR_APL, order, 'prepull', 3)).toBeNull()
    expect(normalizeAplOrder(BEAR_APL, ['swipe', 'prepull'])[0]).toBe('prepull')
  })
})
