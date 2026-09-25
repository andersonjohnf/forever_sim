// Protection's rotation as a priority list (decisions D28, D31; docs/classes/warrior.md §5.4): the
// Defensive and Max TPS presets give the plans the rotation gave before the list, fight for fight;
// the rows cover every setting, only the pre-pull is pinned (the duties move, keeping their timing
// rule), the compiler follows the stored order, and the three presets and "Custom" read and apply as
// D28 says.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { MIGHTY_RAGE_POTION } from '../../effects/buffs'
import { buildPlan } from '../../plan/build'
import { COND } from '../../plan/types'
import type { SimConfig } from '../../types'
import { activeAplPreset, aplPresets, applyAplPreset, CUSTOM_APL_PRESET, DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder } from '../apl'
import { planJson } from './fury-apl-cases'
import { fingerprint, protectionCases } from './protection-apl-cases'
import { PROTECTION_APL, PROTECTION_OPTIONS, protectionRotation } from './protection'

const PRIORITY = 'warrior.protection.priority'
const noAura = () => -1
const CASES = protectionCases(200)

/** The case's settings with Priority forced, or left as drawn with a missing one as the old default, duties (Defensive). */
const withPriority = (values: Record<string, string | number | boolean>, priority?: string) => ({ ...values, [PRIORITY]: priority ?? values[PRIORITY] ?? 'duties' })

/** The whole setup's config for a case: the default Protection setup with its race, settings, phase, rules and consumables. */
function configOf(c: (typeof CASES)[number], priority?: string): SimConfig {
  const base = defaultConfig('warrior-protection')
  const buffs = base.buffs.enabled.filter((id) => id !== 'mightyRagePotion' && id !== 'jujuFlurry')
  return {
    ...base,
    race: c.race,
    rotation: withPriority(c.values, priority),
    buffs: { ...base.buffs, enabled: [...buffs, ...c.consumables] },
    fight: { ...base.fight, executePct: c.executePct },
    rules: { ...base.rules, profile: c.profile },
  }
}

describe('Protection’s priority list: Defensive and Max TPS as before the list (D28, D31)', () => {
  for (const [name, priority] of [
    ['as drawn, a missing Priority as Defensive', undefined],
    ['Defensive', 'duties'],
    ['Max TPS', 'maxTps'],
  ] as const) {
    it(`gives 200 random setups the rotation they had before the list: ${name}`, () => {
      // The snapshot is of the rotation before the priority list (ee171d2a): a change to it is a
      // change to what Protection plays. Re-taken once for Gnome Eureka! (engine issues EI-2, merged
      // onto main): 27 of the 200 cases moved, every one a Gnome's; no other case changed. Re-taken for
      // 1.60.1.70009 (warrior.md §1, threat.md#warrior): Sunder Armor's threat (206 + 5% of attack power,
      // 1,013 before) and Shield Slam's (dmg + 475, 254) are in every plan that uses either, and Max TPS
      // keeps Shield Block (D26's rule), so 191 to 196 of the 200 cases moved in each snapshot.
      const hashes = CASES.map(({ values, talents, context }) => {
        const none = protectionRotation(withPriority(values, priority), talents, noAura, context)
        expect(protectionRotation(withPriority(values, priority), talents, noAura, context, defaultAplOrder(PROTECTION_APL))).toEqual(none)
        return fingerprint(planJson(none))
      })
      expect(new Set(hashes).size).toBeGreaterThan(150)
      expect(hashes).toMatchSnapshot()
    })

    it(`gives 200 random whole setups the plan they had before the list: ${name}`, () => {
      const hashes = CASES.map((c) => fingerprint(planJson(buildPlan(configOf(c, priority)).plan)))
      expect(new Set(hashes).size).toBeGreaterThan(150)
      expect(hashes).toMatchSnapshot()
    })
  }
})

const TALENTS = talentRanksByName(TALENT_DATA.warrior, defaultConfig('warrior-protection').talents)
const CONTEXT = { consumables: [MIGHTY_RAGE_POTION], race: 'alliance-human' }
type Rot = ReturnType<typeof protectionRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const linesOf = (r: Rot, id: string) => r.rotation.filter((e) => r.abilities[e.ability].id === id)
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string) => {
  const order = defaultAplOrder(PROTECTION_APL)
  return moveAplRow(PROTECTION_APL, order, id, order.indexOf(before) - (order.indexOf(id) < order.indexOf(before) ? 1 : 0))!
}

describe('Protection’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting but the Priority, which the presets set', () => {
    const known = new Set(PROTECTION_OPTIONS.map((o) => o.id))
    const placed = new Set([...PROTECTION_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...PROTECTION_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([PRIORITY])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    for (const row of PROTECTION_APL.rows) {
      if (row.enabledId) expect(PROTECTION_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
    }
    expect(new Set(PROTECTION_APL.rows.map((r) => r.id)).size).toBe(PROTECTION_APL.rows.length)
    // Only the pre-pull is pinned (D31); the duties come before any threat ability on the GCD by
    // default, and their timing rule is their own wherever they sit.
    expect(PROTECTION_APL.rows.filter((r) => r.pinned).map((r) => r.id)).toEqual(['prepull'])
    expect(defaultAplOrder(PROTECTION_APL).indexOf('demoShout')).toBeLessThan(defaultAplOrder(PROTECTION_APL).indexOf('shieldSlam'))
    // The Priority choice has no control but the preset picker, which sets it.
    expect(PROTECTION_APL.specWide).not.toContain(PRIORITY)
    expect(PROTECTION_APL.presets.map((p) => Object.keys(p.values))).toEqual([[PRIORITY], [], [PRIORITY]])
  })

  it('moves a duty with its timing rule, and nothing moves past the pre-pull', () => {
    const order = defaultAplOrder(PROTECTION_APL)
    const tcBelowSlam = moveAplRow(PROTECTION_APL, order, 'thunderClap', order.indexOf('shieldSlam'))!
    expect(tcBelowSlam.indexOf('thunderClap')).toBeGreaterThan(tcBelowSlam.indexOf('shieldSlam'))
    const r = protectionRotation({ [PRIORITY]: 'duties' }, TALENTS, noAura, CONTEXT, tcBelowSlam)
    const before = protectionRotation({ [PRIORITY]: 'duties' }, TALENTS, noAura, CONTEXT)
    expect(ids(r).indexOf('thunderClap')).toBeGreaterThan(ids(r).indexOf('shieldSlam'))
    // Its line is the same, the duty rule's refresh from its 6 s cooldown, only later in the list.
    const tc = (x: Rot) => x.rotation.findIndex((e) => x.abilities[e.ability].id === 'thunderClap')
    const refresh = (x: Rot) => x.rotation[tc(x)].conditions.map((c) => ({ ...c, a: x.abilities[c.a].id }))
    expect(refresh(r)).toEqual(refresh(before))
    expect(refresh(r)).toEqual([{ code: COND.abilityAuraRefresh, a: 'thunderClap', b: 6000 }])
    expect(moveAplRow(PROTECTION_APL, order, 'shieldBlock', 0)).toBeNull()
    expect(normalizeAplOrder(PROTECTION_APL, ['shieldSlam', 'prepull'])[0]).toBe('prepull')
  })

  it('builds the list in the stored order; the consumables ride with the trinkets', () => {
    const order = moveAplRow(PROTECTION_APL, moved('sunder', 'shieldSlam'), 'trinkets', 2)!
    const r = protectionRotation({ [PRIORITY]: 'duties' }, TALENTS, noAura, CONTEXT, order)
    expect(ids(r)).toEqual([
      'shieldBlock',
      'mightyRagePotion',
      'bloodrage',
      'thunderClap',
      'demoralizingShout',
      'sunderArmor',
      'sunderArmor',
      'shieldSlam',
      'revenge',
      'battleShout',
      'sunderArmor',
      'heroicStrike',
      'heroicStrike',
    ])
  })

  it('keeps a moved row’s own conditions: the filler above Shield Slam still waits for it', () => {
    const values = { [PRIORITY]: 'duties', 'warrior.protection.sunderFiller.waitForShieldSlam': true, 'warrior.protection.thunderClap.maintainOnly': false }
    const r = protectionRotation(values, TALENTS, noAura, CONTEXT, moved('sunderFiller', 'shieldSlam'))
    const slam = r.abilities.findIndex((a) => a.id === 'shieldSlam')
    // Thunder Clap on cooldown goes with the filler, and both stay GCD-safe for Shield Slam.
    expect(ids(r).slice(3, 8)).toEqual(['thunderClap', 'demoralizingShout', 'thunderClap', 'sunderArmor', 'shieldSlam'])
    expect(linesOf(r, 'thunderClap')[1].conditions).toEqual([{ code: COND.gcdSafe, a: 1 << slam, b: 1500 }])
    expect(linesOf(r, 'sunderArmor')[0].conditions.at(-1)).toEqual({ code: COND.gcdSafe, a: 1 << slam, b: 1500 })
  })
})

describe('Protection’s presets: Defensive, Balanced and Max TPS (D28)', () => {
  const active = (saved: Record<string, string | number | boolean>, order?: string[]) => activeAplPreset(PROTECTION_APL, PROTECTION_OPTIONS, saved, order, TALENTS)

  it('lists the three, and no separate Default: Balanced is the default', () => {
    expect(aplPresets(PROTECTION_APL).map((p) => [p.id, p.label])).toEqual([
      ['defensive', 'Defensive'],
      [DEFAULT_APL_PRESET, 'Balanced'],
      ['maxTps', 'Max TPS'],
    ])
    expect(active({})).toBe(DEFAULT_APL_PRESET)
    // A saved setup that chose the old default, "duties", loads as Defensive; Max TPS as Max TPS.
    expect(active({ [PRIORITY]: 'duties' })).toBe('defensive')
    expect(active({ [PRIORITY]: 'maxTps' })).toBe('maxTps')
    // A spec-wide setting (the potion's limit) doesn't make it Custom.
    expect(active({ [PRIORITY]: 'maxTps', 'warrior.protection.ragePotion.maxRage': 40 })).toBe('maxTps')
  })

  it('reads Custom once you edit the list: a row’s setting, its switch, or the order', () => {
    expect(active({ 'warrior.protection.heroicStrike.minRage': 60 })).toBe(CUSTOM_APL_PRESET)
    expect(active({ [PRIORITY]: 'duties', 'warrior.protection.thunderClap.enabled': false })).toBe(CUSTOM_APL_PRESET)
    // Turning on by hand what another preset has on doesn't make it that preset.
    expect(active({ 'warrior.protection.thunderClap.enabled': true, 'warrior.protection.demoShout.enabled': true })).toBe(CUSTOM_APL_PRESET)
    expect(active({}, moved('battleShout', 'shieldSlam'))).toBe(CUSTOM_APL_PRESET)
  })

  it('picking one sets its Priority and resets the list’s settings, keeping the spec-wide ones you set', () => {
    const saved = { [PRIORITY]: 'maxTps', 'warrior.protection.heroicStrike.minRage': 60, 'warrior.protection.ragePotion.maxRage': 40 }
    expect(applyAplPreset(PROTECTION_APL, saved, 'defensive')).toEqual({
      rotation: { 'warrior.protection.ragePotion.maxRage': 40, [PRIORITY]: 'duties' },
      rotationOrder: undefined,
    })
    const balanced = applyAplPreset(PROTECTION_APL, saved, DEFAULT_APL_PRESET)!
    expect(balanced.rotation).toEqual({ 'warrior.protection.ragePotion.maxRage': 40 })
    expect(activeAplPreset(PROTECTION_APL, PROTECTION_OPTIONS, balanced.rotation, balanced.rotationOrder, TALENTS)).toBe(DEFAULT_APL_PRESET)
    expect(applyAplPreset(PROTECTION_APL, saved, 'balanced')).toBeUndefined()
  })

  it('runs Balanced by default, and Defensive for a setup that chose it, as the presets', () => {
    const base = defaultConfig('warrior-protection')
    const plan = (c: SimConfig) => buildPlan(c).plan
    expect(plan(base)).toEqual(plan({ ...base, rotation: applyAplPreset(PROTECTION_APL, {}, DEFAULT_APL_PRESET)!.rotation }))
    expect(plan({ ...base, rotation: { [PRIORITY]: 'duties' } })).toEqual(plan({ ...base, rotation: applyAplPreset(PROTECTION_APL, {}, 'defensive')!.rotation }))
    expect(plan(base)).not.toEqual(plan({ ...base, rotation: { [PRIORITY]: 'duties' } }))
  })
})
