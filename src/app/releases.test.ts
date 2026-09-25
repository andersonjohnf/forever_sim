import { describe, expect, it } from 'vitest'
import { INTERNAL_ID, INTERNAL_WORD, PICTOGRAPH, SENTENCE_END } from './player-voice'
import { SAVED_SETUPS_KEY } from './saved-setups'
import { useSetup } from './setup-store'
import {
  checkReleases,
  compareReleaseIds,
  EARLIER_VISIT_KEYS,
  LAST_SEEN_RELEASE_KEY,
  RELEASES,
  releasesSince,
  type Release,
} from './releases'

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/** Every piece of text a release shows: its group labels and items. */
const texts = (r: Release) => r.groups.flatMap((g) => [g.label, ...g.items])

describe('the release notes (docs/architecture.md "Release notes")', () => {
  it('has unique, well-formed ids', () => {
    const ids = RELEASES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/)
  })

  // docs/architecture.md "Release notes": an id's date is its time's date in UTC, and a day's
  // numbers count up in the order its releases went out.
  it('dates each id by its time in UTC, and numbers a day’s releases in order', () => {
    for (const r of RELEASES) expect(r.id.split('.')[0], r.id).toBe(new Date(r.time).toISOString().slice(0, 10))
    for (let i = 1; i < RELEASES.length; i++) expect(compareReleaseIds(RELEASES[i - 1].id, RELEASES[i].id), RELEASES[i - 1].id).toBeGreaterThan(0)
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
    for (const r of RELEASES) {
      for (const text of texts(r)) {
        expect(text, r.id).not.toMatch(PICTOGRAPH)
        expect(text, r.id).not.toMatch(INTERNAL_WORD)
        expect(text, r.id).not.toMatch(INTERNAL_ID)
      }
      for (const g of r.groups) for (const item of g.items) expect(item, `${r.id} ${g.label}`).toMatch(SENTENCE_END)
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
  { id: '2026-01-02.10', time: '2026-01-02T20:00:00Z', groups: [] },
  { id: '2026-01-02.9', time: '2026-01-02T19:00:00Z', groups: [] },
  { id: '2026-01-01.1', time: '2026-01-01T00:00:00Z', groups: [] },
]
const [C, B, A] = list.map((r) => r.id)
const ids = (releases: Release[]) => releases.map((r) => r.id)

describe('compareReleaseIds', () => {
  it('orders by date, then by the day’s number as a number', () => {
    expect(compareReleaseIds('2026-01-02.10', '2026-01-02.9')).toBeGreaterThan(0)
    expect(compareReleaseIds('2026-01-02.9', '2026-01-02.10')).toBeLessThan(0)
    expect(compareReleaseIds('2026-01-02.1', '2026-01-01.12')).toBeGreaterThan(0)
    expect(compareReleaseIds('2025-12-31.3', '2026-01-01.1')).toBeLessThan(0)
    expect(compareReleaseIds('2026-01-02.3', '2026-01-02.3')).toBe(0)
  })

  it('can’t order what isn’t a release id', () => {
    for (const junk of ['', 'not-a-release', '2026-01-02', '2026-01-02.', '2026-1-2.1', '2026-01-02.1x', ' 2026-01-02.1'])
      expect(compareReleaseIds(junk, '2026-01-02.1'), junk).toBeNaN()
  })
})

describe('releasesSince', () => {
  it('lists every release newer than the one seen, newest first', () => {
    expect(ids(releasesSince(A, list))).toEqual([C, B])
    expect(ids(releasesSince(B, list))).toEqual([C])
  })

  it('lists nothing once the newest is seen, on a first visit, or for an id it doesn’t know', () => {
    expect(releasesSince(C, list)).toEqual([])
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
    const s = storage({ [LAST_SEEN_RELEASE_KEY]: A })
    expect(ids(checkReleases(s, list))).toEqual([C, B])
    expect(s.map.get(LAST_SEEN_RELEASE_KEY)).toBe(C)
    expect(checkReleases(s, list)).toEqual([])
  })

  it('shows a first visit nothing, and remembers the newest', () => {
    const s = storage()
    expect(checkReleases(s, list)).toEqual([])
    expect(s.map.get(LAST_SEEN_RELEASE_KEY)).toBe(C)
  })

  // A visitor from before What's New shipped has no id, but has an automatic save or named setups.
  it.each(EARLIER_VISIT_KEYS)('shows a visitor with %s and no id the newest release alone, once', (key) => {
    const s = storage({ [key]: '{}' })
    expect(ids(checkReleases(s, list))).toEqual([C])
    expect(s.map.get(LAST_SEEN_RELEASE_KEY)).toBe(C)
    expect(checkReleases(s, list)).toEqual([])
  })

  it('shows that visitor the newest alone with only one release, and nothing with a stored id', () => {
    expect(ids(checkReleases(storage({ 'forever-sim:setup': '{}' }), list.slice(-1)))).toEqual([A])
    expect(checkReleases(storage({ 'forever-sim:setup': '{}', [LAST_SEEN_RELEASE_KEY]: C }), list)).toEqual([])
  })

  it('treats other keys as a first visit', () => {
    expect(checkReleases(storage({ 'forever-sim:defaults-notice': 'x', theme: 'dark' }), list)).toEqual([])
  })

  it('shows nothing for an id it doesn’t know, and replaces it only when it sorts older or isn’t an id', () => {
    for (const older of ['2025-12-31.1', '2026-01-02.8', '2026-01-01.0']) {
      const s = storage({ [LAST_SEEN_RELEASE_KEY]: older })
      expect(checkReleases(s, list), older).toEqual([])
      expect(s.map.get(LAST_SEEN_RELEASE_KEY), older).toBe(C)
    }
    for (const junk of ['not-a-release', '', '2026-01-02']) {
      const s = storage({ [LAST_SEEN_RELEASE_KEY]: junk })
      expect(checkReleases(s, list), junk).toEqual([])
      expect(s.map.get(LAST_SEEN_RELEASE_KEY), junk).toBe(C)
    }
    // From a newer release (a later tab, then a rollback): kept, so going forward again shows nothing twice.
    for (const newer of ['2026-01-02.11', '2026-01-03.1']) {
      const s = storage({ [LAST_SEEN_RELEASE_KEY]: newer })
      expect(checkReleases(s, list), newer).toEqual([])
      expect(s.map.get(LAST_SEEN_RELEASE_KEY), newer).toBe(newer)
    }
  })

  it('works without storage: nothing when it can’t be read, what’s new when it can’t be written if an id was stored', () => {
    expect(checkReleases(null, list)).toEqual([])
    expect(checkReleases(storage({ [LAST_SEEN_RELEASE_KEY]: A }, { readFails: true }), list)).toEqual([])
    expect(checkReleases(storage({ 'forever-sim:setup': '{}' }, { readFails: true }), list)).toEqual([])
    expect(ids(checkReleases(storage({ [LAST_SEEN_RELEASE_KEY]: B }, { writeFails: true }), list))).toEqual([C])
    // An earlier visitor with no id sees nothing while the id can't be stored, or full storage would
    // show it on every load (WV-2).
    expect(ids(checkReleases(storage({ 'forever-sim:setup': '{}' }, { writeFails: true }), list))).toEqual([])
  })

  it('does nothing with no releases', () => {
    const s = storage()
    expect(checkReleases(s, [])).toEqual([])
    expect(s.map.size).toBe(0)
  })

  // The push that ships a release adds its entry at the top: a visitor on today's newest, or from
  // before What's New, sees that entry alone.
  it('shows a new top entry alone to a visitor on today’s newest or from before What’s New', () => {
    const next: Release = { id: '2099-01-01.1', time: '2099-01-01T00:00:00Z', groups: [] }
    const withNext = [next, ...RELEASES]
    expect(ids(checkReleases(storage({ [LAST_SEEN_RELEASE_KEY]: RELEASES[0].id }), withNext))).toEqual([next.id])
    expect(ids(checkReleases(storage({ 'forever-sim:saved-setups': '[]' }), withNext))).toEqual([next.id])
  })
})

describe('the keys an earlier visit leaves', () => {
  it('are the automatic save’s and the named setups’', () => {
    expect([...EARLIER_VISIT_KEYS].sort()).toEqual([useSetup.persist.getOptions().name, SAVED_SETUPS_KEY].sort())
  })
})
