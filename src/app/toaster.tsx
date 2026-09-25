import { useEffect, useRef } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { NOTICE_MS } from './load-notice'
import { setToastClearance } from './toast-layer'

/** How long a toast stays up, unless it says more (./load-notice.ts noticeDuration). */
const TOAST_MS = NOTICE_MS

/** Sonner's gap between stacked toasts, in px. */
const TOAST_GAP = 14

/**
 * Scrolls keyboard focus clear of the toasts when they've come up over it (docs/ux.md
 * #persistence-and-sharing). block: 'nearest', so the scroll padding keeps it clear of the toasts,
 * the sticky header and the phone's bar (src/index.css), and a control already clear of them
 * doesn't move. Focus stays where it is.
 *
 * Only keyboard focus, which :focus-visible marks: after a tap or click the page doesn't scroll by
 * itself.
 */
function revealFocus(toastsTop: number) {
  const focused = document.activeElement
  if (!(focused instanceof HTMLElement) || !focused.matches(':focus-visible') || focused.closest('[data-sonner-toaster]')) return
  const box = focused.getBoundingClientRect()
  if (box.bottom > toastsTop && box.top < window.innerHeight) focused.scrollIntoView({ block: 'nearest' })
}

/**
 * Keeps how far up from the bottom of the window the toasts reach, so keyboard focus scrolls clear
 * of them (WCAG 2.4.11). Measured again as toasts come, go and spread out, and as the window is
 * resized.
 *
 * - --toast-clearance, while any toast is up, sets the bottom scroll padding of the page and of
 *   each sheet (src/index.css), and toastClearance() the bottom collision padding of a select's
 *   list (src/components/select-content.tsx). While a toast is still sliding in, it counts where
 *   it will stop, so focus moving on at once clears it too.
 * - When the settled stack reaches higher than before (a toast came, or a taller one behind came
 *   to the front), keyboard focus it now covers scrolls clear of it. The mouse or Alt+T spreading
 *   the toasts out doesn't count, so hovering them scrolls nothing.
 */
function useToastClearance() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = ref.current
    if (!container) return
    const root = document.documentElement
    let frame = 0
    let resizeFrame = 0
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
          setToastClearance(0)
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
        setToastClearance(clearance)
        if (settled > reach) revealFocus(window.innerHeight - clearance)
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
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', resized)
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(resizeFrame)
      observer.disconnect()
      container.removeEventListener('transitionend', measure)
      window.removeEventListener('resize', resized)
      root.style.removeProperty('--toast-clearance')
      setToastClearance(0)
    }
  }, [])
  return ref
}

/**
 * Toasts (docs/ux.md#persistence-and-sharing) are plain notices that go after 10 s, or a longer one's reading time. They sit at
 * the bottom, clear of the header's controls: on phones and tablets just above the sticky bar,
 * whose height App keeps in --sim-bar-height. Sonner's Alt+T moves focus to them.
 */
export function AppToaster() {
  const ref = useToastClearance()
  return (
    <div ref={ref} className="contents">
      <Toaster
        position="bottom-center"
        duration={TOAST_MS}
        offset={{ bottom: 'calc(var(--sim-bar-height, 0px) + 1rem)' }}
        mobileOffset={{ bottom: 'calc(var(--sim-bar-height, 0px) + 0.75rem)' }}
      />
    </div>
  )
}
