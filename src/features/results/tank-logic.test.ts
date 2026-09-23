import { describe, expect, it } from 'vitest'
import { defaultConfig, normalizeConfig, type BossOutcomes, type FightConfig, type SimConfig } from '@/sim'
import { bossOutcomeShares, PLAYER_LEVEL } from '@/sim/core/attack-table'
import { buildPlan } from '@/sim/plan/build'
import { BOSS_OUTCOMES, crushingState, crushingText, formatCritReduction, swingDamageText } from './tank-logic'

const protection = (change: (c: SimConfig) => SimConfig = (c) => c) => normalizeConfig(change(defaultConfig('warrior-protection'))).config
const withFight = (patch: Partial<FightConfig>, boss: Partial<FightConfig['boss']> = {}) =>
  protection((c) => ({ ...c, fight: { ...c.fight, ...patch, boss: { ...c.fight.boss, ...boss } } }))
/** The sheet's table against a Protection warrior's default setup, with any changes to it. */
const sheetTable = (config: SimConfig) => buildPlan(config).sheet.bossTable!

/** The boss's table (combat-tables §8) against a level-60 tank facing a level-63 boss. */
const table = (defense: number, dodge: number, parry: number, block: number, canCrush = true) =>
  bossOutcomeShares({ playerLevel: PLAYER_LEVEL, bossLevel: 63, defense, dodge, parry, block, canCrush, front: true })

describe('BOSS_OUTCOMES', () => {
  it('lists every outcome of the engine’s table once, in its roll order', () => {
    const engine = Object.keys(sheetTable(protection())) as (keyof BossOutcomes)[]
    expect(BOSS_OUTCOMES.map(([key]) => key)).toEqual(engine)
    expect(BOSS_OUTCOMES.map(([, label]) => label)).toEqual(['Miss', 'Dodge', 'Parry', 'Block', 'Crit', 'Crushing', 'Hit'])
  })
})

describe('crushingState', () => {
  it('says how much more avoidance or block pushes crushing blows off: the crushing and hit slices together', () => {
    const config = protection()
    const t = sheetTable(config)
    // The default Protection warrior is crushable: a full 15% slice (combat-tables §8) with hits after it.
    expect(t.crush).toBeCloseTo(15, 9)
    expect(t.hit).toBeGreaterThan(0)
    const state = crushingState(t, config.fight)
    expect(state.kind).toBe('crushable')
    if (state.kind !== 'crushable') return
    expect(state.short).toBeCloseTo(t.crush + t.hit, 1)
    expect(crushingText(state)).toBe(`${state.short.toFixed(1)}% more avoidance or block would make you uncrushable.`)
  })

  it('checks the closed form: at 300 defense, 20, 15 and 25 against the boss leave 15% crushing and 15% hits', () => {
    // Each sheet value loses 0.6% to the boss's 315 skill; at 300 defense it misses 4.4% and crits 5.6%.
    const t = table(300, 20.6, 15.6, 25.6)
    expect(t.miss).toBeCloseTo(4.4, 9)
    expect(t.crit).toBeCloseTo(5.6, 9)
    expect(t.crush).toBeCloseTo(15, 9)
    expect(t.hit).toBeCloseTo(15, 9)
    expect(crushingState(t, null)).toEqual({ kind: 'crushable', short: 30 })
  })

  it('counts a crushing slice that the table has already cut short', () => {
    // 440 defense: 10% miss and no crits, and 30, 20 and 30 against the boss leave 10% for crushing.
    const t = table(440, 30.6, 20.6, 30.6)
    expect(t.crit).toBe(0)
    expect(t.crush).toBeCloseTo(10, 9)
    expect(t.hit).toBeCloseTo(0, 9)
    expect(crushingState(t, null)).toEqual({ kind: 'crushable', short: 10 })
  })

  it('rounds the shortfall to the tenth the table shows, but never down to 0.0', () => {
    // 15.0% crushing and 40.4% hits read as 55.4% more, not 55.5%.
    const t: BossOutcomes = { miss: 6.3, dodge: 12, parry: 11.3, block: 11.3, crit: 3.67, crush: 15, hit: 40.43 }
    expect(crushingState(t, null)).toEqual({ kind: 'crushable', short: 55.4 })
    // A sliver of a crushing slice still says what's left, as 0.1%.
    const u: BossOutcomes = { miss: 5, dodge: 30, parry: 30, block: 29.97, crit: 5, crush: 0.03, hit: 0 }
    expect(crushingState(u, null)).toEqual({ kind: 'crushable', short: 0.1 })
    expect(crushingText(crushingState(u, null))).toBe('0.1% more avoidance or block would make you uncrushable.')
  })

  it('calls you uncrushable once miss, dodge, parry, block and crit fill the table', () => {
    const t = table(440, 40, 30, 40)
    expect(t.crush).toBe(0)
    expect(t.hit).toBe(0)
    const state = crushingState(t, protection().fight)
    expect(state).toEqual({ kind: 'uncrushable' })
    expect(crushingText(state)).toBe('You’re uncrushable: there’s no room left on its table for crushing blows.')
  })

  it('says when Fight → Advanced has turned crushing blows off, whatever the table', () => {
    const config = withFight({}, { canCrush: false })
    const t = sheetTable(config)
    expect(t.crush).toBe(0)
    const state = crushingState(t, config.fight)
    expect(state).toEqual({ kind: 'off' })
    expect(crushingText(state)).toBe('Crushing blows are off for this fight (Fight → Advanced).')
  })

  it('says a boss under level 63 never crushes, rather than calling you uncrushable', () => {
    const config = withFight({ bossLevel: 62 })
    const t = sheetTable(config)
    expect(t.crush).toBe(0)
    expect(t.hit).toBeGreaterThan(0)
    const state = crushingState(t, config.fight)
    expect(state).toEqual({ kind: 'cannot', bossLevel: 62 })
    expect(crushingText(state)).toBe('A level 62 boss can’t land crushing blows.')
    expect(crushingText(crushingState(t, null))).toBe('This boss can’t land crushing blows.')
  })
})

describe('formatCritReduction', () => {
  it('shows defense’s cut to the boss’s crit chance, with a minus sign when it raises it', () => {
    expect(formatCritReduction(5.6)).toBe('5.6%')
    expect(formatCritReduction(4.44)).toBe('4.4%')
    expect(formatCritReduction(0)).toBe('0.0%')
    expect(formatCritReduction(-0.4)).toBe('−0.4%')
    // Rounds to 0.0 with no sign.
    expect(formatCritReduction(-0.04)).toBe('0.0%')
  })

  it('matches the sheet’s defense: 0.04% a point above 300', () => {
    const sheet = buildPlan(protection()).sheet
    expect(sheet.defense).toBeGreaterThan(300)
    expect(formatCritReduction(sheet.critReductionPct)).toBe(`${(Math.round((sheet.defense - 300) * 0.4) / 10).toFixed(1)}%`)
  })
})

describe('swingDamageText', () => {
  it('gives the boss’s swing range as the Fight tab does, or one value when it’s fixed', () => {
    expect(swingDamageText(protection().fight.boss)).toBe('4,500 to 5,500')
    expect(swingDamageText({ damageMin: 5000, damageMax: 5000 })).toBe('5,000')
    expect(swingDamageText({ damageMin: 0, damageMax: 0 })).toBe('0')
  })
})
