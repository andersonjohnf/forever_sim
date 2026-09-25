// The load's notices (docs/ux.md "Notices", "What's new"): the page's own share link's and the
// visit's that moved untouched parts to newer defaults.
//
// - They come one at a time: the next comes up once the one before has gone, so each gets its whole
//   reading time in front. Two at once would stack, and the one behind would run out its time
//   unread; a phone can't hover to spread the stack.
// - They wait for What's New: while it's open, a toast would sit over it, run out its time unread,
//   and not be heard, since the dialog hides the rest of the page from screen readers. So What's
//   New holds them from its first render, and lets them go once it has closed and the page can be
//   heard again.

/** Given to a load notice's toast (its onAutoClose and onDismiss), so the next comes up once it's gone. */
export interface NoticeClosed {
  onAutoClose: () => void
  onDismiss: () => void
}

/**
 * Raises a load's notice, spreading `closed` into the toast's options. Returns false when it raised
 * nothing after all (a newer link's notice has taken its place), so the next needn't wait.
 */
export type ShowNotice = (closed: NoticeClosed) => boolean

/** The notices waiting, in the order they were raised. */
const waiting: ShowNotice[] = []
/** Whether What's New holds them. */
let held = false
/** Whether one is up. */
let showing = false

/** Shows the next waiting notice, if nothing holds them and none is up. */
function next() {
  while (!held && !showing && waiting.length > 0) {
    const show = waiting.shift()!
    let done = false
    const closed = () => {
      if (done) return
      done = true
      showing = false
      next()
    }
    showing = true
    // A later toast with the same id takes this one's place and keeps these callbacks (sonner merges
    // its options), so the next still waits for it.
    if (!show({ onAutoClose: closed, onDismiss: closed })) {
      done = true
      showing = false
    }
  }
}

/** Shows a load's notice now, or once What's New has closed and the notice before it has gone. */
export function showWhenClear(show: ShowNotice) {
  waiting.push(show)
  next()
}

/** Holds the notices showWhenClear is given from now on. Safe to call twice. */
export function holdToasts() {
  held = true
}

/** Lets the notices held go, in order, one at a time. */
export function releaseToasts() {
  held = false
  next()
}
