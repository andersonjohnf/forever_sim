import { useSyncExternalStore } from 'react'

/** True while the media query matches, e.g. useMediaQuery('(min-width: 1024px)'). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)')

/** The wide desktop layout, from 1440 px (docs/ux.md#layout; the `wide:` breakpoint in src/index.css). */
export const useIsWide = () => useMediaQuery('(min-width: 1440px)')
