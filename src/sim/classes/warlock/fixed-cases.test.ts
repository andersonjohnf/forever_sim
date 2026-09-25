// The warlock's second fingerprint set (LB-4; fixed-cases.ts): what the random sets of the three
// `<spec>-apl.test.ts` never reach, Incinerate talented on each spec, Demonic Brand at ranks 1–3
// with each demon, and on-use trinkets worn, each plan fingerprinted whole. Its settings come from
// frozen option lists, so a new setting or choice value can't reshuffle it. A change to the snapshot
// is a change to what these setups play.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { buildPlan } from '../../plan/build'
import { SCHOOL } from '../../plan/types'
import { defaultAplOrder } from '../apl'
import { AFFLICTION_APL, AFFLICTION_OPTIONS } from './affliction'
import { fingerprint, planJson } from './apl-cases'
import { DEMONOLOGY_APL, DEMONOLOGY_OPTIONS } from './demonology'
import { DESTRUCTION_APL, DESTRUCTION_OPTIONS } from './destruction'
import { frozenOptions, namedCases, randomCases, SPEC_ID } from './fixed-cases'
import type { WarlockSpec } from './shared'

const SPECS = ['destruction', 'affliction', 'demonology'] as const
const APL = { destruction: DESTRUCTION_APL, affliction: AFFLICTION_APL, demonology: DEMONOLOGY_APL }
const OPTIONS = { destruction: DESTRUCTION_OPTIONS, affliction: AFFLICTION_OPTIONS, demonology: DEMONOLOGY_OPTIONS }
const plan = (config: Parameters<typeof buildPlan>[0]) => buildPlan(config).plan

describe('the warlock’s fixed setups (LB-4)', () => {
  it('freezes options that still exist, with every choice value they had', () => {
    // The frozen lists may fall behind the live ones (that's the point), but never name what's gone.
    for (const spec of SPECS) {
      const live = new Map(OPTIONS[spec].map((o) => [o.id, o]))
      for (const o of frozenOptions(spec)) {
        const now = live.get(o.id)
        expect(now?.kind, o.id).toBe(o.kind)
        if (o.kind === 'choice' && now?.kind === 'choice') for (const value of o.choices) expect(now.choices.map((c) => c.value), o.id).toContain(value)
      }
    }
  })

  it('the named setups cover Incinerate on each spec, Demonic Brand 1–3 with each demon, and on-use trinkets', () => {
    const cases = namedCases()
    const byName = new Map(cases.map((c) => [c.name, plan(c.config)]))
    for (const spec of SPECS) {
      expect(byName.get(`${spec}: Incinerate talented and chosen`)!.abilities.some((a) => a.id === 'incinerate'), spec).toBe(true)
      expect(byName.get(`${spec}: Incinerate talented, Shadow Bolt chosen`)!.abilities.some((a) => a.id === 'incinerate'), spec).toBe(false)
      // The trinkets are worn: the gear differs from the default, so the plan does.
      const worn = byName.get(`${spec}: on-use trinkets, their row on`)!
      expect(planJson(worn)).not.toBe(planJson(plan(defaultConfig(SPEC_ID[spec]))))
    }
    for (let r = 1; r <= 3; r++) {
      for (const [demon, school] of [['imp', SCHOOL.fire], ['succubus', SCHOOL.shadow], ['felhunter', SCHOOL.shadow]] as const) {
        const p = byName.get(`demonology: Demonic Brand ${r}/3 with the ${demon}`)!
        expect(p.pet?.id).toBe(demon)
        expect(p.procs.find((x) => x.id === 'demonicBrand')?.school, `${r} ${demon}`).toBe(school)
        expect(p.auras.find((a) => a.id === 'demonicBrand')?.petLandedCharges).toBe(2 * r)
      }
    }
    expect(byName.get('demonology: Demonic Brand 3/3, Searing Pain off')!.procs.some((x) => x.id === 'demonicBrand')).toBe(false)
  })

  it('gives every setup the plan it had when the snapshot was taken, the same with the default order stored', () => {
    const configs = [...namedCases().map((c) => c.config), ...SPECS.flatMap((spec) => randomCases(spec, 40))]
    const specOf = (id: string) => (Object.keys(SPEC_ID) as WarlockSpec[]).find((s) => SPEC_ID[s] === id)!
    const plans = configs.map((config) => {
      const p = plan(config)
      expect(planJson(plan({ ...config, rotationOrder: defaultAplOrder(APL[specOf(config.spec)]) }))).toBe(planJson(p))
      return p
    })
    const hashes = plans.map((p) => fingerprint(planJson(p)))
    expect(new Set(hashes).size).toBeGreaterThan(0.9 * hashes.length)
    // The random ones reach Incinerate and the brand too.
    const random = plans.slice(namedCases().length)
    expect(random.filter((p) => p.abilities.some((a) => a.id === 'incinerate')).length).toBeGreaterThan(10)
    expect(random.filter((p) => p.procs.some((x) => x.id === 'demonicBrand')).length).toBeGreaterThan(3)
    expect(hashes).toMatchSnapshot()
  })
})
