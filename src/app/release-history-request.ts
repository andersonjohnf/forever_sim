// What's New's "All releases" opens Release history, which the header owns (src/app/header.tsx).

let listener: (() => void) | null = null

/** Opens Release history. Does nothing before the header is up. */
export function openReleaseHistory() {
  listener?.()
}

/** The header's: what opens Release history. Returns what stops it. */
export function onOpenReleaseHistory(open: () => void) {
  listener = open
  return () => {
    if (listener === open) listener = null
  }
}
