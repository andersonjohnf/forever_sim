import { useEffect, useRef } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { focusNewestUndo } from './toast-layer'
import { UNDO_TOAST_MS } from './undo-toast'

/**
 * Sonner's hotkey, Alt+T (Option+T on a Mac). A constant, so sonner registers its listener once,
 * on mount, ahead of the one below.
 */
const HOTKEY = ['altKey', 'KeyT']

/** Sonner's gap between stacked toasts, in px. */
const TOAST_GAP = 14

/**
 * Keeps how far up from the bottom of the window the toasts reach in --toast-clearance, while any
 * are up, so keyboard focus scrolls clear of them (the page's scroll padding, src/index.css; WCAG
 * 2.4.11). A toast raised from the keyboard waits until it's dismissed, and focus moves on under
 * it meanwhile. Measured again as toasts come, go and spread out; while one is still sliding in,
 * it counts where it will stop, so focus moving on at once clears it too.
 */
function useToastClearance() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = ref.current
    if (!container) return
    const root = document.documentElement
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const toasts = [...container.querySelectorAll<HTMLElement>("[data-sonner-toast][data-removed='false']")].filter(
          (toast) => toast.dataset.visible !== 'false',
        )
        const list = container.querySelector('[data-sonner-toaster]')
        if (toasts.length === 0 || !list) {
          root.style.removeProperty('--toast-clearance')
          return
        }
        // Where they are now (spread out, say), and where they settle: the front toast on the
        // list's bottom edge, the rest a gap above it each.
        const now = Math.min(...toasts.map((toast) => toast.getBoundingClientRect().top))
        const settled = list.getBoundingClientRect().bottom - Math.max(...toasts.map((toast) => toast.offsetHeight)) - TOAST_GAP * (toasts.length - 1)
        root.style.setProperty('--toast-clearance', `${Math.max(0, Math.ceil(window.innerHeight - Math.min(now, settled)))}px`)
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
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      container.removeEventListener('transitionend', measure)
      window.removeEventListener('resize', measure)
      root.style.removeProperty('--toast-clearance')
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
