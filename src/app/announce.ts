// Announcements for screen readers (docs/ux.md#accessibility, WCAG 4.1.3): a change with no
// visible notice, because you watch it happen, still gets confirmed out loud. Gear's "Equip pre-raid
// best in slot", a talent preset or Reset rotation change a whole tab at once, and a toast for
// each would be noise for sighted users.
//
// <Announcer /> (src/app/announcer.tsx) is the polite live region, mounted once in the app shell.
// It stays exposed while a sheet or dialog is open: Radix hides everything else from screen
// readers then, but leaves live regions alone.

type Listener = (message: string) => void

let listener: Listener | null = null

/** Says `message` to screen readers, politely: after what they're reading now. */
export function announce(message: string) {
  listener?.(message)
}

/** Connects the live region. Returns what disconnects it. */
export function onAnnounce(next: Listener) {
  listener = next
  return () => {
    if (listener === next) listener = null
  }
}
