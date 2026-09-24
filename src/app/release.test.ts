import { describe, expect, it } from 'vitest'
import { formatReleaseTime, RELEASE, shortCommit } from './release'

describe('the release stamp (docs/architecture.md "Release stamp")', () => {
  it('reads as the viewer’s time with its zone, then the date', () => {
    const t = new Date('2026-09-25T00:05:00Z')
    expect(formatReleaseTime(t, 'en-US', 'America/New_York')).toBe('8:05 PM EDT · Sep 24, 2026')
    expect(formatReleaseTime(t, 'en-US', 'America/Los_Angeles')).toBe('5:05 PM PDT · Sep 24, 2026')
    // Eastern standard time once daylight saving ends (1 November 2026).
    expect(formatReleaseTime(new Date('2026-11-05T01:05:00Z'), 'en-US', 'America/New_York')).toBe('8:05 PM EST · Nov 4, 2026')
  })

  it('shortens the commit as GitHub does, and gives nothing for an unknown one', () => {
    expect(shortCommit('0123456789abcdef')).toBe('0123456')
    expect(shortCommit('')).toBeNull()
  })

  it('is stamped by the build', () => {
    expect(Number.isNaN(RELEASE.time.getTime())).toBe(false)
  })
})
