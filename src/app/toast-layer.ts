// Toasts sit above everything else (docs/ux.md#persistence-and-sharing), an open sheet, dialog or
// menu included, and what has to keep clear of them can read how far up they reach.

const TOASTER = '[data-sonner-toaster]'

let clearance = 0
const clearanceListeners = new Set<() => void>()

/**
 * How far up from the bottom of the window the toasts reach, in px, or 0 with none up: what
 * --toast-clearance holds. For what keeps clear of the toasts itself rather than through the
 * scroll padding, like a select's list (src/components/select-content.tsx).
 */
export const toastClearance = () => clearance

/** Calls `listener` whenever toastClearance changes. Returns what stops it. */
export function onToastClearance(listener: () => void) {
  clearanceListeners.add(listener)
  return () => {
    clearanceListeners.delete(listener)
  }
}

/** Sets toastClearance: the toaster's, which measures it (src/app/toaster.tsx). */
export function setToastClearance(px: number) {
  if (px === clearance) return
  clearance = px
  for (const listener of clearanceListeners) listener()
}

let installed = false

/**
 * Keeps a tap on a toast from closing the sheet, dialog or menu under it, say a swipe to send it
 * away. Call it once, before the app renders.
 *
 * Radix treats a pointer down outside a sheet as a reason to close it, and listens for it on the
 * document, in the bubble phase. This listener comes first and stops a toast's pointerdown there.
 * React's own handlers, sonner's swipe among them, on the app's root below the document, have
 * already run by then. (Pointer events reach the toast at all through src/index.css; the rest of
 * the page has them off while a sheet is open.)
 */
export function installToastLayer() {
  if (installed) return
  installed = true
  document.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest(TOASTER)) e.stopImmediatePropagation()
  })
}
