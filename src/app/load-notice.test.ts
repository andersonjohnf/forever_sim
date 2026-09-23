import { describe, expect, test } from 'vitest'
import { loadedDescription } from './load-notice'

// docs/ux.md#persistence-and-sharing: a shared link or a saved setup says which spec it switched
// you to, and how many parts were out of date.
describe('loaded setup notice', () => {
  test('says nothing more when it stayed on your spec and nothing was out of date', () => {
    expect(loadedDescription(null, [])).toBeUndefined()
  })

  test('names the spec it switched to', () => {
    expect(loadedDescription('warrior-arms', [])).toBe('You’re on Arms Warrior now.')
  })

  test('counts the parts that were out of date', () => {
    expect(loadedDescription(null, ['a'])).toBe('One part was out of date and is back to its default.')
    expect(loadedDescription('warrior-fury', ['a', 'b'])).toBe('You’re on Fury Warrior now. 2 parts were out of date and are back to their defaults.')
  })
})
