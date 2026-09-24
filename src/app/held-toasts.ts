// The load's notices wait for What's New (docs/ux.md "What's new"): while it's open, a toast would
// sit over it, run out its time unread, and not be heard, since the dialog hides the rest of the
// page from screen readers. So What's New holds them from its first render, and lets them go once it
// has closed and the page can be heard again.

/** The toasts waiting, in the order they were raised; null while nothing holds them. */
let held: (() => void)[] | null = null

/** Shows a load's toast now, or once the dialog holding toasts has closed. */
export function showWhenClear(show: () => void) {
  if (held) held.push(show)
  else show()
}

/** Holds the toasts showWhenClear is given from now on. Safe to call twice. */
export function holdToasts() {
  held ??= []
}

/** Shows the toasts held, in order (a later one with the same id replaces an earlier one, as it would have). */
export function releaseToasts() {
  const waiting = held
  held = null
  for (const show of waiting ?? []) show()
}
