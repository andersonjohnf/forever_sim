// Toasts with Undo (docs/ux.md#persistence-and-sharing). After a tap or click they stay up 10 s,
// and the clock stops while the toast is hovered, touched or holds focus, or the page is hidden.
// Sonner pauses its own timer on hover and touch but not on focus, so an undo toast runs its own
// timer instead. After a key press they say how to reach Undo and stay until dismissed.
//
// One Undo at a time, and never a stale one: a new undo toast replaces the one that's up, and any
// other change to the setup (another edit, a spec switch, a shared link) takes it away. Its Undo
// puts back the setup from before its own change, so offered any later it would also revert
// everything changed since, or switch spec back.
import { toast } from 'sonner'
import { useSetup } from './setup-store'
import { lastInputWasKeyboard, leaveToasts, TOAST_HOTKEY } from './toast-layer'

/** How long a toast with Undo stays up, not counting pauses. Also the Toaster's default. */
export const UNDO_TOAST_MS = 10_000

type Hold = 'pointer' | 'focus' | 'hidden'
let count = 0
/** Takes away the undo toast that's up, if there is one. */
let dismissCurrent: (() => void) | undefined

/**
 * Shows `title` with an Undo button that calls `onUndo`, e.g. undoToast('Setup loaded', undo).
 * Call it once the change is made: the toast lasts only while the setup stays as that change left
 * it. Returns the toast's id.
 *
 * A toast raised by a key press (choosing a menu item with Enter, a race with the arrow keys)
 * adds "Press Alt+T to reach Undo" and a Dismiss button, and waits for Undo, Dismiss or Escape:
 * a keyboard user may need many key presses to get to it.
 */
export function undoToast(title: string, onUndo: () => void, { description }: { description?: string } = {}) {
  dismissCurrent?.()
  // Sonner puts a toast's className on its <li>, which is how events are matched to this toast;
  // it's the toast's id too, so Escape can dismiss it (src/app/toast-layer.ts).
  const marker = `undo-toast-${++count}`
  const inside = (node: EventTarget | null) => node instanceof Element && node.closest(`.${marker}`) !== null
  const persistent = lastInputWasKeyboard()
  // The setup as this change left it: Undo is offered only while it's still exactly this.
  const { config: after, bySpec: afterBySpec } = useSetup.getState()

  let remaining = UNDO_TOAST_MS
  let startedAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const holds = new Set<Hold>()
  const run = () => {
    if (persistent) return
    startedAt = Date.now()
    timer = setTimeout(() => toast.dismiss(marker), remaining)
  }
  const hold = (reason: Hold) => {
    if (holds.size === 0) {
      clearTimeout(timer)
      remaining -= Date.now() - startedAt
    }
    holds.add(reason)
  }
  const release = (reason: Hold) => {
    if (holds.delete(reason) && holds.size === 0) run()
  }

  // Delegated, because the toast's element doesn't exist yet. Touch counts as a pointer: a
  // finger resting on the toast holds it. Focus is watched in the capture phase, because
  // src/app/toast-layer.ts stops a toast's focus events in the bubble phase.
  const listeners: [Document, string, (e: Event) => void, boolean][] = [
    [document, 'pointerover', (e) => inside(e.target) && hold('pointer'), false],
    [document, 'pointerout', (e) => inside(e.target) && !inside((e as PointerEvent).relatedTarget) && release('pointer'), false],
    [document, 'focusin', (e) => inside(e.target) && hold('focus'), true],
    [document, 'focusout', (e) => inside(e.target) && !inside((e as FocusEvent).relatedTarget) && release('focus'), true],
    [document, 'visibilitychange', () => (document.hidden ? hold('hidden') : release('hidden')), false],
  ]
  for (const [target, type, listener, capture] of listeners) target.addEventListener(type, listener, capture)
  // Any other change to the setup takes the toast away.
  const unsubscribe = useSetup.subscribe((state) => {
    if (state.config !== after || state.bySpec !== afterBySpec) dismiss()
  })
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    clearTimeout(timer)
    unsubscribe()
    for (const [target, type, listener, capture] of listeners) target.removeEventListener(type, listener, capture)
    if (dismissCurrent === dismiss) dismissCurrent = undefined
  }
  const dismiss = () => {
    // Focus in the toast goes back to where it was, rather than falling to the page with it.
    if (inside(document.activeElement)) leaveToasts()
    dispose()
    toast.dismiss(marker)
  }
  dismissCurrent = dismiss

  const hint = persistent ? `Press ${TOAST_HOTKEY} to reach Undo.` : undefined
  toast(title, {
    id: marker,
    description: [description, hint].filter(Boolean).join(' ') || undefined,
    className: marker,
    duration: Infinity,
    cancel: persistent
      ? {
          label: 'Dismiss',
          onClick: () => {
            dispose()
            leaveToasts()
          },
        }
      : undefined,
    action: {
      label: 'Undo',
      onClick: () => {
        // A toast on its way out (replaced, or the setup changed) no longer undoes anything.
        const current = !disposed && useSetup.getState().config === after
        dispose()
        leaveToasts()
        if (current) onUndo()
      },
    },
    onDismiss: dispose,
  })
  run()
  if (document.hidden) hold('hidden')
  return marker
}
