import { describe, expect, it } from 'vitest'
import { INTERNAL_ID, INTERNAL_WORD, PICTOGRAPH, SENTENCE_END } from './player-voice'
import { ROADMAP, type RoadmapWhen } from './roadmap'

// docs/ux.md "Coming soon": the agreed milestones for players, in the order they're coming.
describe('the roadmap (docs/ux.md "Coming soon")', () => {
  it('has unique ids', () => {
    const ids = ROADMAP.map((e) => e.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id.trim(), id).not.toBe('')
  })

  it('has no entry without a title or items, and no empty item', () => {
    for (const e of ROADMAP) {
      expect(e.title.trim(), e.id).not.toBe('')
      expect(e.items.length, e.id).toBeGreaterThan(0)
      for (const item of e.items) expect(item.trim(), e.id).not.toBe('')
      // One line once per entry: it's the list's key.
      expect(new Set(e.items).size, e.id).toBe(e.items.length)
    }
  })

  it('lists the next update first, then what’s planned, then what’s later', () => {
    const order: RoadmapWhen[] = ['Next update', 'Planned', 'Later']
    for (let i = 1; i < ROADMAP.length; i++) {
      expect(order.indexOf(ROADMAP[i].when), `${ROADMAP[i - 1].id} before ${ROADMAP[i].id}`).toBeGreaterThanOrEqual(order.indexOf(ROADMAP[i - 1].when))
    }
    for (const e of ROADMAP) expect(order, e.id).toContain(e.when)
  })

  // docs/milestones.md: the next update (M5.668, M5.669), then the audit fixes (M5.671), then
  // multi-target (M6), then the optimizer's remaining steps (user decisions 2026-09-26: D30's
  // amendment, D38).
  it('lists the next update, then the audit fixes, then multi-target, then the Optimizer', () => {
    const ids = ROADMAP.map((e) => e.id)
    const order = ['sharper-numbers', 'audit-fixes', 'multi-target', 'optimizer']
    for (const id of order) expect(ids).toContain(id)
    expect(order.map((id) => ids.indexOf(id))).toEqual([0, 1, 2, 3])
    expect(ROADMAP[0].when).toBe('Next update')
    expect(ROADMAP.filter((e) => e.when === 'Next update').map((e) => e.id)).toEqual(['sharper-numbers'])
  })

  // CLAUDE.md "Release updates": plain text a player reads, as the release notes are.
  it('is written for players: no emoji, no internals, whole sentences', () => {
    for (const e of ROADMAP) {
      for (const text of [e.title, ...e.items]) {
        expect(text, e.id).not.toMatch(PICTOGRAPH)
        expect(text, e.id).not.toMatch(INTERNAL_WORD)
        expect(text, e.id).not.toMatch(INTERNAL_ID)
      }
      for (const item of e.items) expect(item, e.id).toMatch(SENTENCE_END)
    }
  })
})
