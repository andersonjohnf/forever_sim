import { describe, expect, test } from 'vitest'
import { defaultConfig } from '@/sim/defaults'
import { normalizeConfig } from '@/sim/config/normalize'
import { presetBuffIds } from '@/sim/effects/presets'
import { replacedDescription, resetTitle } from './load-notice'

// docs/ux.md#persistence-and-sharing: a shared link, an imported code or a saved setup says whose
// setup it replaced, which spec it switched you to, and what loading it changed.
describe('the notice for a setup that replaced yours', () => {
  test('says whose setup it replaced', () => {
    expect(replacedDescription('warrior-fury', false, [])).toBe('It replaced your Fury Warrior setup.')
  })

  test('says so when it switched spec', () => {
    expect(replacedDescription('warrior-arms', true, [])).toBe('It replaced your Arms Warrior setup, and you’re on Arms now.')
  })

  test('says what changed, in the repair’s own words', () => {
    expect(replacedDescription('warrior-fury', false, ['Rotation settings that don’t apply to this spec were reset.'])).toBe(
      'It replaced your Fury Warrior setup. Rotation settings that don’t apply to this spec were reset.',
    )
    expect(replacedDescription('warrior-arms', true, ['A.', 'B.', 'C.'])).toBe('It replaced your Arms Warrior setup, and you’re on Arms now. A. B. C.')
  })

  test('past three changes, names the first two and counts the rest', () => {
    expect(replacedDescription('warrior-fury', false, ['A.', 'B.', 'C.', 'D.'])).toBe('It replaced your Fury Warrior setup. A. B. 2 other parts changed too.')
  })

  // Review CR-3: an old Max consumables link with both a potion and Stoneshield, and both stones.
  test('says an old link’s rival consumables were turned off, not reset', () => {
    const prot = defaultConfig('warrior-protection')
    const enabled = [...presetBuffIds('max', 'warrior-protection', prot.buffs.raid), 'greaterStoneshieldPotion', 'denseSharpeningStone']
    const { warnings } = normalizeConfig({ ...prot, buffs: { raid: prot.buffs.raid, enabled } })
    expect(replacedDescription('warrior-protection', false, warnings)).toBe(
      'It replaced your Protection Warrior setup. Greater Stoneshield Potion shares a cooldown with Mighty Rage Potion, so it was turned off. Dense Sharpening Stone / Weightstone takes the same weapon as Elemental Sharpening Stone, so it was turned off.',
    )
  })

  test('Reset setup says whose setup is back to its defaults', () => {
    expect(resetTitle('warrior-fury')).toBe('Your Fury Warrior setup is back to its defaults')
  })
})
