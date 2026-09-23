import { useEffect, useRef } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { focusNewestUndo, revealFocus } from './toast-layer'
import { UNDO_TOAST_MS, WAITING_TOAST } from './undo-toast'

/**
 * Sonner's hotkey, Alt+T (Option+T on a Mac). A constant, so sonner registers its listener once,
 * on mount, ahead of the one below.
 */
const HOTKEY = ['altKey', 'KeyT']

/** Sonner's gap between stacked toasts, in px. */
const TOAST_GAP = 14

/**
 * Keeps how far up from the bottom of the window the toasts reach, so keyboard focus scrolls clear
 * of them (WCAG 2.4.11): a toast raised from the keyboard waits until it's dismissed, and focus
 * moves on under it meanwhile. Measured again as toasts come, go and spread out, and as the
 * window is resized.
 *
 * - --toast-clearance, while any toast is up, sets the bottom scroll padding of the page and of
 *   each sheet (src/index.css). While a toast is still sliding in, it counts where it will stop, so
 *   focus moving on at once clears it too.
 * - --toast-wait-clearance, while a toast that waits for Dismiss is up, grows the bottom padding
 *   of the page and of each sheet, so the last control in them has room to scroll clear of it.
 *   It's that toast's own reach at the front of the stack, so a 10 s toast coming or going doesn't
 *   change it: content never moves by itself when one times out.
 * - When the settled stack reaches higher than before (one came, or one behind moved to the front
 *   at full size), keyboard focus the toasts now cover scrolls clear of them (revealFocus). The
 *   mouse or Alt+T spreading them out doesn't count, so hovering them scrolls nothing.
 */
function useToastClearance() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = ref.current
    if (!container) return
    const root = document.documentElement
    let frame = 0
    // How far up the settled stack reached when last measured.
    let reach = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const toasts = [...container.querySelectorAll<HTMLElement>("[data-sonner-toast][data-removed='false']")].filter(
          (toast) => toast.dataset.visible !== 'false',
        )
        const list = container.querySelector('[data-sonner-toaster]')
        if (toasts.length === 0 || !list) {
          root.style.removeProperty('--toast-clearance')
          root.style.removeProperty('--toast-wait-clearance')
          reach = 0
          return
        }
        // Where the stack settles: the front toast on the list's bottom edge, at its own height,
        // and each toast behind it a gap higher. The mouse or Alt+T spreads the stack out, but
        // that doesn't move where it settles.
        const edge = list.getBoundingClientRect()
        const front = toasts.find((toast) => toast.dataset.front === 'true') ?? toasts[0]
        const settled = Math.ceil(window.innerHeight - edge.bottom + front.offsetHeight + TOAST_GAP * (toasts.length - 1))
        // Where they are now: spread out, say.
        const now = Math.ceil(window.innerHeight - Math.min(...toasts.map((toast) => toast.getBoundingClientRect().top)))
        const clearance = Math.max(0, now, settled)
        root.style.setProperty('--toast-clearance', `${clearance}px`)

        // The waiting toast's own height: at the front of the stack, as it is now. A toast behind
        // the front one is cut to that one's height, so there it's sonner's --initial-height,
        // measured when the toast came, and stale after a resize until it's at the front.
        const waiting = toasts.filter((toast) => toast.classList.contains(WAITING_TOAST))
        if (waiting.length > 0) {
          const height = Math.max(
            ...waiting.map((toast) =>
              toast.dataset.front === 'true' ? toast.offsetHeight : Number.parseFloat(toast.style.getPropertyValue('--initial-height')) || toast.offsetHeight,
            ),
          )
          root.style.setProperty('--toast-wait-clearance', `${Math.max(0, Math.ceil(window.innerHeight - edge.bottom + height))}px`)
        } else {
          root.style.removeProperty('--toast-wait-clearance')
        }

        // Only when the settled stack reaches higher (a toast came, or one behind came to the front
        // at full size), not when it spreads out: hovering it scrolls nothing. Covered as the
        // scroll padding counts it: reaching into the band the toasts take across the bottom of
        // the window, so focus ends up where moving it would have put it.
        if (settled > reach) {
          const top = window.innerHeight - clearance
          revealFocus((box) => box.bottom > top && box.top < window.innerHeight)
        }
        reach = settled
      })
    }
    const observer = new MutationObserver(measure)
    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-mounted', 'data-removed', 'data-visible', 'data-expanded', 'data-front'],
    })
    container.addEventListener('transitionend', measure)
    // After a resize, a frame later: the toasts sit on the phone's bar, which comes, goes or
    // changes height with the window, and App's ResizeObserver moves them onto it only once the
    // frame's layout is done.
    const resized = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', resized)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      container.removeEventListener('transitionend', measure)
      window.removeEventListener('resize', resized)
      root.style.removeProperty('--toast-clearance')
      root.style.removeProperty('--toast-wait-clearance')
    }
  }, [])
  return ref
}

/**
 * Toasts (docs/ux.md#persistence-and-sharing) sit at the bottom, clear of the header's controls:
 * on phones and tablets just above the sticky bar, whose height App keeps in --sim-bar-height.
 * Any toast with Undo stays up 10 s (undoToast also pauses it while focused), or until dismissed
 * when a key press raised it.
 *
 * Alt+T is the keyboard's way to the toasts: sonner focuses the list and spreads the toasts out,
 * then this moves focus on to the newest toast's Undo, one keystroke from it.
 */
export function AppToaster() {
  const ref = useToastClearance()
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyT') focusNewestUndo()
    }
    // Effects run child first, so this comes after sonner's listener and runs after it.
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  return (
    <div ref={ref} className="contents">
      <Toaster
        position="bottom-center"
        hotkey={HOTKEY}
        duration={UNDO_TOAST_MS}
        offset={{ bottom: 'calc(var(--sim-bar-height, 0px) + 1rem)' }}
        mobileOffset={{ bottom: 'calc(var(--sim-bar-height, 0px) + 0.75rem)' }}
      />
    </div>
  )
}
