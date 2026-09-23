import { describe, expect, it } from 'vitest'
import { durationText, formatDuration } from './duration'

describe('fight length text', () => {
  it('shows minutes and seconds, and says them in words', () => {
    expect(formatDuration(180)).toBe('3:00')
    expect(formatDuration(45)).toBe('0:45')
    expect(durationText(180)).toBe('3 minutes')
    expect(durationText(195)).toBe('3 minutes 15 seconds')
    expect(durationText(60)).toBe('1 minute')
    expect(durationText(45)).toBe('45 seconds')
    expect(durationText(61)).toBe('1 minute 1 second')
  })
})
