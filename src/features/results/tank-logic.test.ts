import { describe, expect, it } from 'vitest'
import { defaultConfig, normalizeConfig, type BossOutcomes, type FightConfig, type SimConfig } from '@/sim'
import { bossOutcomeShares, PLAYER_LEVEL } from '@/sim/core/attack-table'
import { buildPlan } from '@/sim/plan/build'
import {
  avoidanceOf,
  BOSS_OUTCOMES,
  bossSkillPenalty,
  bossTableIntro,
  CRIT_REDUCTION_LABEL,
  crushingState,
  crushingText,
  damageTakenText,
  FIGHT_ADVANCED,
  formatCritReduction,
  swingDamageText,
} from './tank-logic'

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
    expect(BOSS_OUTCOMES.map(([, label]) => label)).toEqual(['Miss', 'Dodge', 'Parry', 'Block', 'Crit', 'Crushing', 'Normal hit'])
  })

  it('keeps its labels apart from the character sheet’s Hit and Crit, your own chances (TU5)', () => {
    const labels = BOSS_OUTCOMES.map(([, label]) => label)
    // "Hit" on the sheet is your chance to hit; the boss's plain hits are "Normal hit".
    expect(labels).not.toContain('Hit')
    // Defense's cut to the boss's crits says whose crits it cuts.
    expect(CRIT_REDUCTION_LABEL).toBe('Crit reduction (boss’s crits)')
  })
})

describe('avoidanceOf', () => {
  it('names the avoidance a sheet has, in the table’s order', () => {
    expect(avoidanceOf({ dodgePct: 12.6, parryPct: 11.9, blockPct: 11.9 })).toEqual(['dodge', 'parry', 'block'])
    // A bear dodges only; a warrior with no shield doesn't block.
    expect(avoidanceOf({ dodgePct: 20, parryPct: 0, blockPct: 0 })).toEqual(['dodge'])
    expect(avoidanceOf({ dodgePct: 10, parryPct: 8, blockPct: 0 })).toEqual(['dodge', 'parry'])
    expect(avoidanceOf({ dodgePct: 0, parryPct: 0, blockPct: 0 })).toEqual([])
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
    // Points, not a relative increase, and miss counts too (TU2).
    expect(crushingText(state)).toBe(`Another ${state.short.toFixed(1)} points of miss, dodge, parry or block would push crushing blows off the table.`)
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
    expect(crushingText(crushingState(u, null))).toBe('Another 0.1 points of miss, dodge, parry or block would push crushing blows off the table.')
  })

  it('names only the avoidance you have: miss and dodge for a bear, no block without a shield', () => {
    const state = { kind: 'crushable', short: 61.2 } as const
    expect(crushingText(state, ['dodge'])).toBe('Another 61.2 points of miss or dodge would push crushing blows off the table.')
    expect(crushingText(state, ['dodge', 'parry'])).toBe('Another 61.2 points of miss, dodge or parry would push crushing blows off the table.')
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
    expect(crushingText(state)).toBe('Crushing blows are off for this fight (Fight\u00a0→\u00a0Advanced).')
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

  it('checks the boss’s level before the table: a level 62 boss can’t crush a tank with no room for hits (TU10)', () => {
    const config = withFight({ bossLevel: 62 })
    // Enough avoidance that nothing is left for hits either.
    const t = bossOutcomeShares({ playerLevel: PLAYER_LEVEL, bossLevel: 62, defense: 440, dodge: 40, parry: 30, block: 40, canCrush: true, front: true })
    expect(t.crush).toBe(0)
    expect(t.hit).toBe(0)
    expect(crushingState(t, config.fight)).toEqual({ kind: 'cannot', bossLevel: 62 })
    // Every level under 63 can't; 63 can.
    for (const bossLevel of [60, 61, 62]) expect(crushingState(t, withFight({ bossLevel }).fight)).toEqual({ kind: 'cannot', bossLevel })
    expect(crushingState(t, withFight({ bossLevel: 63 }).fight)).toEqual({ kind: 'uncrushable' })
    // Without the fight, the level is unknown, and a full table reads as uncrushable.
    expect(crushingState(t, null)).toEqual({ kind: 'uncrushable' })
  })
})

describe('bossSkillPenalty', () => {
  it('takes 0.04 points a point of the boss’s skill above 300 off dodge, parry and block (combat-tables §8)', () => {
    expect(bossSkillPenalty(63)).toEqual({ skill: 315, points: expect.closeTo(0.6, 9) })
    expect(bossSkillPenalty(61)).toEqual({ skill: 305, points: expect.closeTo(0.2, 9) })
    expect(bossSkillPenalty(60)).toEqual({ skill: 300, points: 0 })
  })

  it('is the gap between the sheet and the table the engine builds', () => {
    const sheet = buildPlan(protection()).sheet
    const t = sheet.bossTable!
    const { points } = bossSkillPenalty(protection().fight.bossLevel)
    expect(sheet.dodgePct - t.dodge).toBeCloseTo(points, 9)
    expect(sheet.parryPct - t.parry).toBeCloseTo(points, 9)
    expect(sheet.blockPct - t.block).toBeCloseTo(points, 9)
  })
})

describe('bossTableIntro', () => {
  const chances = 'Its chances on each swing at you as the fight starts, from the stats above.'
  const landed = 'The swings that landed can differ, by chance and as cooldowns and procs change your stats in the fight.'

  it('says why its dodge, parry and block are lower than the sheet’s, and why the swings that landed differ (TU1)', () => {
    expect(bossTableIntro(63, ['dodge', 'parry', 'block'])).toBe(
      `${chances} Its 315 weapon skill takes 0.6 points off your dodge, parry and block. ${landed}`,
    )
    expect(bossTableIntro(62, ['dodge'])).toBe(`${chances} Its 310 weapon skill takes 0.4 points off your dodge. ${landed}`)
  })

  it('leaves the boss’s skill out when it takes nothing off, or when the fight can’t be read', () => {
    expect(bossTableIntro(60, ['dodge', 'parry', 'block'])).toBe(`${chances} ${landed}`)
    expect(bossTableIntro(63, [])).toBe(`${chances} ${landed}`)
    expect(bossTableIntro(null, ['dodge', 'parry', 'block'])).toBe(`${chances} ${landed}`)
  })

  it('with the block buff the rotation keeps up (Holy Shield), says the table has it up, and for how much of the fight (QU2)', () => {
    const up = { name: 'Holy Shield', blockPct: 20, uptimePct: 95.93 }
    const skill = 'Its 315 weapon skill takes 0.6 points off your dodge, parry and block.'
    expect(bossTableIntro(63, ['dodge', 'parry', 'block'], up)).toBe(
      `Its chances on each swing at you with Holy Shield up, from the stats above and its 20.0% more block. Your rotation kept it up 95.9% of the fight. ${skill} ${landed}`,
    )
    expect(bossTableIntro(63, ['dodge', 'parry', 'block'], { ...up, uptimePct: null })).toContain('Your rotation keeps Holy Shield up most of the fight.')
  })

  it('in the wide panel is brief: what the table is, and the block buff with its uptime (D34)', () => {
    const up = { name: 'Holy Shield', blockPct: 20, uptimePct: 95.93 }
    expect(bossTableIntro(63, ['dodge', 'parry', 'block'], null, true)).toBe('Its chances on each swing at you as the fight starts.')
    expect(bossTableIntro(63, ['dodge', 'parry', 'block'], up, true)).toBe(
      'Its chances with Holy Shield up, its 20.0% more block included. Your rotation kept it up 95.9% of the fight.',
    )
    expect(bossTableIntro(63, ['dodge', 'parry', 'block'], { ...up, uptimePct: null }, true)).toBe(
      'Its chances with Holy Shield up, its 20.0% more block included. Your rotation keeps Holy Shield up most of the fight.',
    )
  })
})

describe('damageTakenText', () => {
  it('says it counts the boss’s melee after avoidance, how often it swung, its swing size and the debuffs on it (TU4)', () => {
    expect(damageTakenText(80.46, protection().fight.boss, 'warrior-protection')).toBe(
      'The health the boss’s melee swings cost you, after avoidance, armor, block and other reductions. ' +
        'It swung 80.5 times a fight on average, set to 4,500 to 5,500 a swing before armor (Fight\u00a0→\u00a0Advanced). ' +
        'Debuffs on it, such as Demoralizing Shout and Thunder Clap, lower its damage and slow its swings, whether yours (Rotation) or the raid’s (Buffs).',
    )
  })

  it('names those debuffs as a warrior tank’s, in Buffs, for another tank, whose rotation never uses them (D26)', () => {
    const text = damageTakenText(80.46, protection().fight.boss, 'paladin-protection')
    expect(text).toMatch(/ Debuffs on it, such as a warrior tank’s Demoralizing Shout and Thunder Clap \(Buffs\), lower its damage and slow its swings\.$/)
    expect(text).not.toContain('yours')
  })

  it('gives a tank’s own attack-power debuff as yours or another player’s: the bear’s roar, which only Defensive keeps, beside a warrior tank’s Thunder Clap (BU7, D28)', () => {
    expect(damageTakenText(80.46, protection().fight.boss, 'druid-feral-bear')).toMatch(
      / Debuffs on it, such as Demoralizing Roar \(yours in Rotation, or another druid’s in Buffs\) and a warrior tank’s Thunder Clap \(Buffs\), lower its damage and slow its swings\.$/,
    )
    expect(damageTakenText(80.46, protection().fight.boss, 'warrior-protection')).toContain('Debuffs on it, such as Demoralizing Shout and Thunder Clap')
  })

  it('leaves the swing size out when the fight can’t be read', () => {
    expect(damageTakenText(80.46, null, 'warrior-protection')).toContain('It swung 80.5 times a fight on average. Debuffs')
  })

  it('keeps "(Fight → Advanced)" on one line, with non-breaking spaces around the arrow (TU10)', () => {
    expect(FIGHT_ADVANCED).toBe('(Fight\u00a0→\u00a0Advanced)')
    expect(damageTakenText(80, protection().fight.boss, 'warrior-protection')).toContain(FIGHT_ADVANCED)
    expect(crushingText({ kind: 'off' })).toContain(FIGHT_ADVANCED)
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
