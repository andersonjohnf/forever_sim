import { describe, expect, it } from 'vitest'
import { isApplePlatform, simulateShortcutLabel } from './shortcut-label'

// docs/ux.md#results: the Simulate tooltip names only this platform's key (review finding DA-5).
describe('simulateShortcutLabel', () => {
  it('names ⌘ on a Mac, an iPhone and an iPad', () => {
    expect(simulateShortcutLabel({ platform: 'MacIntel' })).toBe('⌘+Enter')
    expect(simulateShortcutLabel({ platform: 'iPhone' })).toBe('⌘+Enter')
    expect(simulateShortcutLabel({ platform: 'iPad' })).toBe('⌘+Enter')
    expect(simulateShortcutLabel({ userAgentData: { platform: 'macOS' }, platform: '' })).toBe('⌘+Enter')
  })

  it('names Ctrl on Windows, Linux, ChromeOS and Android', () => {
    expect(simulateShortcutLabel({ platform: 'Win32' })).toBe('Ctrl+Enter')
    expect(simulateShortcutLabel({ platform: 'Linux x86_64' })).toBe('Ctrl+Enter')
    expect(simulateShortcutLabel({ userAgentData: { platform: 'Chrome OS' } })).toBe('Ctrl+Enter')
    expect(simulateShortcutLabel({ userAgentData: { platform: 'Android' }, platform: 'Linux armv8l' })).toBe('Ctrl+Enter')
  })

  it('prefers the client hint, and falls back to the user agent', () => {
    expect(isApplePlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(false)
    expect(isApplePlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe(true)
  })

  it('names Ctrl when it can’t tell', () => {
    expect(simulateShortcutLabel(undefined)).toBe('Ctrl+Enter')
    expect(simulateShortcutLabel({})).toBe('Ctrl+Enter')
  })
})
