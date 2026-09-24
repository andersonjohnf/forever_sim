import { describe, expect, it } from 'vitest'
import { checkReleases, LAST_SEEN_RELEASE_KEY, RELEASES, releasesSince, type Release } from './releases'

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/** Every piece of text a release shows: its group labels and items. */
const texts = (r: Release) => r.groups.flatMap((g) => [g.label, ...g.items])

describe('the release notes (docs/architecture.md "Release notes")', () => {
  it('has unique, well-formed ids', () => {
    const ids = RELEASES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/)
  })

  it('has valid ISO times with an offset, strictly newest first', () => {
    for (const r of RELEASES) {
      expect(r.time, r.id).toMatch(ISO_WITH_OFFSET)
      expect(Number.isNaN(new Date(r.time).getTime()), r.id).toBe(false)
    }
    for (let i = 1; i < RELEASES.length; i++) {
      expect(new Date(RELEASES[i - 1].time).getTime(), `${RELEASES[i - 1].id} after ${RELEASES[i].id}`).toBeGreaterThan(
        new Date(RELEASES[i].time).getTime(),
      )
    }
  })

  it('has no empty release, group or item', () => {
    for (const r of RELEASES) {
      expect(r.groups.length, r.id).toBeGreaterThan(0)
      for (const g of r.groups) {
        expect(g.label.trim(), r.id).not.toBe('')
        expect(g.items.length, `${r.id} ${g.label}`).toBeGreaterThan(0)
        for (const item of g.items) expect(item.trim(), `${r.id} ${g.label}`).not.toBe('')
      }
      // One label once per release.
      const labels = r.groups.map((g) => g.label)
      expect(new Set(labels).size, r.id).toBe(labels.length)
    }
  })

  // CLAUDE.md "Release updates": plain text a player reads, and a Discord post is made from it.
  it('is written for players: no emoji, no internals, whole sentences', () => {
    const banned = /\b(finding|findings|worker|workers|CSP|scraper|scrapers|review|reviews|reviewer|branch|commit|golden|goldens|e2e|milestone|slice)\b/i
    // Decision, finding and milestone ids: D29, T2R-1, BR5, M2.4.
    const internalId = /\b[A-Z]{1,3}\d+(\.\d+)?(-\d+)?\b/
    for (const r of RELEASES) {
      for (const text of texts(r)) {
        expect(text, r.id).not.toMatch(/\p{Extended_Pictographic}/u)
        expect(text, r.id).not.toMatch(banned)
        expect(text, r.id).not.toMatch(internalId)
      }
      for (const g of r.groups) for (const item of g.items) expect(item, `${r.id} ${g.label}`).toMatch(/[.!?]$/)
    }
  })

  it('keeps each release well under a Discord post’s 2,000 characters', () => {
    for (const r of RELEASES) {
      const post = r.groups.map((g) => `**${g.label}**\n${g.items.map((i) => `• ${i}`).join('\n')}`).join('\n\n')
      expect(post.length, r.id).toBeLessThan(1800)
    }
  })
})

const list: Release[] = [
  { id: 'c', time: '2026-01-03T00:00:00Z', groups: [] },
  { id: 'b', time: '2026-01-02T00:00:00Z', groups: [] },
  { id: 'a', time: '2026-01-01T00:00:00Z', groups: [] },
]

describe('releasesSince', () => {
  it('lists every release newer than the one seen, newest first', () => {
    expect(releasesSince('a', list).map((r) => r.id)).toEqual(['c', 'b'])
    expect(releasesSince('b', list).map((r) => r.id)).toEqual(['c'])
  })

  it('lists nothing once the newest is seen, on a first visit, or for an id it doesn’t know', () => {
    expect(releasesSince('c', list)).toEqual([])
    expect(releasesSince(null, list)).toEqual([])
    expect(releasesSince('gone', list)).toEqual([])
  })
})

/** A Storage stand-in over a Map, whose reads and writes can be made to throw. */
function storage(initial: Record<string, string> = {}, { readFails = false, writeFails = false } = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k: string) => {
      if (readFails) throw new Error('blocked')
      return map.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (writeFails) throw new Error('full')
      map.set(k, v)
    },
  }
}

describe('checkReleases', () => {
  it('shows a returning visitor what’s new, once', () => {
    const s = storage({ [LAST_SEEN_RELEASE_KEY]: 'a' })
    expect(checkReleases(s, list).map((r) => r.id)).toEqual(['c', 'b'])
    expect(s.map.get(LAST_SEEN_RELEASE_KEY)).toBe('c')
    expect(checkReleases(s, list)).toEqual([])
  })

  it('shows a first visit nothing, and remembers the newest', () => {
    const s = storage()
    expect(checkReleases(s, list)).toEqual([])
    expect(s.map.get(LAST_SEEN_RELEASE_KEY)).toBe('c')
  })

  it('treats an id it doesn’t know as a first visit', () => {
    const s = storage({ [LAST_SEEN_RELEASE_KEY]: 'from-the-future' })
    expect(checkReleases(s, list)).toEqual([])
    expect(s.map.get(LAST_SEEN_RELEASE_KEY)).toBe('c')
  })

  it('works without storage: nothing when it can’t be read, what’s new when it can’t be written', () => {
    expect(checkReleases(null, list)).toEqual([])
    expect(checkReleases(storage({ [LAST_SEEN_RELEASE_KEY]: 'a' }, { readFails: true }), list)).toEqual([])
    expect(checkReleases(storage({ [LAST_SEEN_RELEASE_KEY]: 'b' }, { writeFails: true }), list).map((r) => r.id)).toEqual(['c'])
  })

  it('does nothing with no releases', () => {
    const s = storage()
    expect(checkReleases(s, [])).toEqual([])
    expect(s.map.size).toBe(0)
  })
})
