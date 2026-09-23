// Toasts with Undo (docs/ux.md#persistence-and-sharing). They stay up 10 s, and the clock stops
// while the toast is hovered, touched or holds focus, or the page is hidden. Sonner pauses its
// own timer on hover and touch but not on focus, so an undo toast runs its own timer instead.
import { toast } from 'sonner'

/** How long a toast with Undo stays up, not counting pauses. Also the Toaster's default. */
export const UNDO_TOAST_MS = 10_000

type Hold = 'pointer' | 'focus' | 'hidden'
let count = 0

/**
 * Shows `title` with an Undo button that calls `onUndo`, e.g. undoToast('Setup loaded', undo).
 * Returns the toast's id.
 */
export function undoToast(title: string, onUndo: () => void, { description }: { description?: string } = {}) {
  // Sonner puts a toast's className on its <li>, which is how events are matched to this toast.
  const marker = `undo-toast-${++count}`
  const inside = (node: EventTarget | null) => node instanceof Element && node.closest(`.${marker}`) !== null

  let remaining = UNDO_TOAST_MS
  let startedAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const holds = new Set<Hold>()
  const run = () => {
    startedAt = Date.now()
    timer = setTimeout(() => toast.dismiss(id), remaining)
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
  // finger resting on the toast holds it.
  const listeners: [Document, string, (e: Event) => void][] = [
    [document, 'pointerover', (e) => inside(e.target) && hold('pointer')],
    [document, 'pointerout', (e) => inside(e.target) && !inside((e as PointerEvent).relatedTarget) && release('pointer')],
    [document, 'focusin', (e) => inside(e.target) && hold('focus')],
    [document, 'focusout', (e) => inside(e.target) && !inside((e as FocusEvent).relatedTarget) && release('focus')],
    [document, 'visibilitychange', () => (document.hidden ? hold('hidden') : release('hidden'))],
  ]
  for (const [target, type, listener] of listeners) target.addEventListener(type, listener)
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    clearTimeout(timer)
    for (const [target, type, listener] of listeners) target.removeEventListener(type, listener)
  }

  const id = toast(title, {
    description,
    className: marker,
    duration: Infinity,
    action: {
      label: 'Undo',
      onClick: () => {
        dispose()
        onUndo()
      },
    },
    onDismiss: dispose,
  })
  run()
  if (document.hidden) hold('hidden')
  return id
}
