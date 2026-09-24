// A breakdown row's outcomes line (docs/ux.md#results "Breakdown"): its count a fight, named for what
// it counts, its shares, and its average damage per landed hit on the Damage metric.
import { describe, expect, it } from 'vitest'
import type { AbilityResult } from '@/sim'
import { outcomeLines } from './outcomes'

const row = (over: Partial<AbilityResult>): AbilityResult => ({
  id: 'x',
  name: 'X',
  icon: 'x',
  damage: 0,
  threat: 0,
  casts: 0,
  hits: 0,
  crits: 0,
  misses: 0,
  dodges: 0,
  parries: 0,
  glances: 0,
  blocks: 0,
  ...over,
})

const line = (a: AbilityResult, fights = 10, damage = true) => {
  const { parts, average } = outcomeLines(a, fights, damage)
  return [...parts, ...(average ? [`${average.value} avg ${average.per}`] : [])].join(' · ')
}

describe('outcomeLines', () => {
  it('starts with the casts a fight and ends with the average per landed hit, misses left out of it', () => {
    // 100 casts: 60 hits, 25 crits, 15 avoided; 85 landed for 102,000 damage.
    const a = row({ unit: 'casts', casts: 100, hits: 60, crits: 25, misses: 5, dodges: 10, damage: 102_000 })
    expect(line(a)).toBe('10.0 casts a fight · 25.0% crit · 15.0% avoided · 1,200 avg hit')
  })

  it('names white swings, and counts glances and blocks among the landed hits', () => {
    const a = row({ unit: 'swings', casts: 200, hits: 100, crits: 40, glances: 40, blocks: 10, misses: 10, damage: 95_000 })
    expect(line(a)).toBe('20.0 swings a fight · 20.0% crit · 5.0% avoided · 20.0% glancing · 500 avg hit')
  })

  it('leaves the average out on the Threat metric', () => {
    const a = row({ unit: 'procs', casts: 30, hits: 30, damage: 3000, threat: 6000 })
    expect(line(a, 10, false)).toBe('3.0 procs a fight · 0.0% crit · 0.0% avoided')
  })

  it('gives a bleed its applications, and its average per landed tick', () => {
    const a = row({
      unit: 'applications',
      casts: 20,
      misses: 2,
      hits: 90,
      crits: 10,
      damage: 5000,
      bleed: { ticksCanCrit: true, avoidable: true, uptimePct: 88 },
    })
    expect(line(a)).toBe('2.0 applications a fight · 10.0% tick crit · 10.0% avoided · 50 avg tick')
    expect(outcomeLines(a, 10, true).uptime).toBe('88.0% uptime on the boss')
  })

  it('gives a proc’s bleed its procs, one count and no ticks a fight', () => {
    const dw = row({ unit: 'procs', casts: 100, hits: 40, damage: 2000, bleed: { ticksCanCrit: false, avoidable: false, uptimePct: null } })
    expect(line(dw)).toBe('10.0 procs a fight · 50 avg tick')
    const poison = row({ unit: 'procs', casts: 50, misses: 5, hits: 60, damage: 6000, bleed: { ticksCanCrit: false, avoidable: true, uptimePct: 70 } })
    expect(line(poison)).toBe('5.0 procs a fight · 10.0% avoided · 100 avg tick')
  })

  // Review finding PC-1: Windfury Weapon's two extra swings a proc are one proc.
  it('counts an extra-attacks proc’s fires, and its shares over the swings they gave', () => {
    const a = row({ unit: 'procs', procs: 100, casts: 200, hits: 120, crits: 40, glances: 20, misses: 20, damage: 180_000 })
    expect(line(a)).toBe('10.0 procs a fight · 20.0% crit · 10.0% avoided · 10.0% glancing · 1,000 avg hit')
  })

  // Review finding PC-2: the count is casts, the average per landing.
  it('averages a cast that lands more than once per tick or per missile', () => {
    // Consecration: 20 casts, 8 ticks each, 150 landed and 10 resisted.
    const consecration = row({ unit: 'casts', landing: 'tick', casts: 20, hits: 140, crits: 10, misses: 10, damage: 15_000 })
    expect(line(consecration)).toBe('2.0 casts a fight · 6.3% tick crit · 6.3% of ticks avoided · 100 avg tick')
    // Arcane Missiles: 30 casts, 5 missiles each, 140 landed and 10 resisted.
    const missiles = row({ unit: 'casts', landing: 'missile', casts: 30, hits: 110, crits: 30, misses: 10, damage: 56_000 })
    expect(line(missiles)).toBe('3.0 casts a fight · 20.0% missile crit · 6.7% of missiles avoided · 400 avg missile')
    // On a tank's Threat view there's no average, so the shares carry the unit on their own (PV-3).
    expect(line(consecration, 10, false)).toBe('2.0 casts a fight · 6.3% tick crit · 6.3% of ticks avoided')
  })

  // Review finding PC-3: a channel you press (Mind Flay) counts its casts, its ticks a DoT's.
  it('gives a channel’s DoT row its casts and its share of casts avoided', () => {
    const a = row({ unit: 'casts', casts: 50, misses: 5, hits: 110, crits: 15, damage: 50_000, bleed: { ticksCanCrit: true, avoidable: true, uptimePct: 68 } })
    expect(line(a)).toBe('5.0 casts a fight · 12.0% tick crit · 10.0% avoided · 400 avg tick')
  })

  // Review finding PC-4: a potion or rune is used, and its mana follows.
  it('counts a consumable’s uses', () => {
    expect(line(row({ unit: 'uses', casts: 15, mana: 26_000, threat: 13_000 }), 10, false)).toBe('1.5 uses a fight · from 2,600 mana a fight')
  })

  it('counts a periodic effect’s ticks from its attempts', () => {
    const a = row({ unit: 'ticks', casts: 0, hits: 45, crits: 5, misses: 10, damage: 5000 })
    expect(line(a)).toBe('6.0 ticks a fight · 8.3% crit · 16.7% avoided · 100 avg tick')
  })

  it('keeps a row’s own count, once, and a certain row’s average', () => {
    const holyShield = row({ counts: 'blocks', certain: true, casts: 300, hits: 300, damage: 60_000 })
    expect(line(holyShield)).toBe('30.0 blocks a fight · 200 avg hit')
    expect(line(holyShield, 10, false)).toBe('30.0 blocks a fight')
  })

  it('gives a mana row its mana and no average, and a spell on the boss only its misses', () => {
    expect(line(row({ mana: 44_000, threat: 22_000 }))).toBe('from 4,400 mana a fight')
    expect(line(row({ unit: 'casts', spell: true, casts: 20, misses: 3, hits: 17, threat: 1000 }), 10, false)).toBe('2.0 casts a fight · 15.0% missed')
  })

  it('says nothing for a row with nothing to count', () => {
    expect(outcomeLines(row({ threat: 100 }), 10, true)).toEqual({ parts: [], average: null, uptime: null })
  })
})
