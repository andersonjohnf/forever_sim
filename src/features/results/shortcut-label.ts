// How the Simulate button's tooltip names its shortcut (docs/ux.md#results, review finding DA-5):
// only the key this platform uses, ⌘ on Apple's, Ctrl everywhere else. The shortcut itself takes
// either key on every platform (src/app/shortcuts.ts).

/** The parts of `navigator` the platform check reads. */
export interface PlatformHints {
  platform?: string
  userAgent?: string
  userAgentData?: { platform?: string }
}

/** A Mac, iPhone or iPad, whose keyboards run the shortcut with ⌘. */
export function isApplePlatform(nav: PlatformHints | undefined): boolean {
  if (!nav) return false
  // Chromium's client hint, then the older `platform`, then the user agent (an iPad asking for the
  // desktop site calls itself a Mac there).
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** "⌘+Enter" on Apple's platforms, "Ctrl+Enter" elsewhere. */
export function simulateShortcutLabel(nav: PlatformHints | undefined): string {
  return isApplePlatform(nav) ? '⌘+Enter' : 'Ctrl+Enter'
}
