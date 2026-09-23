import { describe, expect, test } from 'vitest'
import { replacedDescription, resetTitle } from './load-notice'

// docs/ux.md#persistence-and-sharing: a shared link, an imported code or a saved setup says whose
// setup it replaced, which spec it switched you to, and how many parts were out of date.
describe('the notice for a setup that replaced yours', () => {
  test('says whose setup it replaced', () => {
    expect(replacedDescription('warrior-fury', false, [])).toBe('It replaced your Fury Warrior setup.')
  })

  test('says so when it switched spec', () => {
    expect(replacedDescription('warrior-arms', true, [])).toBe('It replaced your Arms Warrior setup, and you’re on Arms now.')
  })

  test('counts the parts that were out of date', () => {
    expect(replacedDescription('warrior-fury', false, ['a'])).toBe('It replaced your Fury Warrior setup. One part was out of date and is back to its default.')
    expect(replacedDescription('warrior-arms', true, ['a', 'b'])).toBe(
      'It replaced your Arms Warrior setup, and you’re on Arms now. 2 parts were out of date and are back to their defaults.',
    )
  })

  test('Reset setup says whose setup is back to its defaults', () => {
    expect(resetTitle('warrior-fury')).toBe('Your Fury Warrior setup is back to its defaults')
  })
})
