// Which talent the wide Talents tab's detail panel shows (talent-detail-panel.tsx, docs/ux.md "Talents").
import { useState } from 'react'

/**
 * Which talent the panel shows. The talents report the pointer and focus here, and only the panel
 * listens, so pointing at a talent re-renders the panel alone, not the trees.
 */
export interface TalentTracker {
  enter: (id: string) => void
  leave: (id: string) => void
  focus: (id: string) => void
  blur: (id: string) => void
  subscribe: (listener: () => void) => () => void
  /** The talent under the pointer, or else the focused one, or else the last one shown; null before any. */
  shown: () => string | null
}

export function createTracker(): TalentTracker {
  let hovered: string | null = null
  let focused: string | null = null
  let last: string | null = null
  let shown: string | null = null
  const listeners = new Set<() => void>()
  const set = (change: () => void) => {
    change()
    const next = hovered ?? focused ?? last
    if (next === shown) return
    shown = next
    last = next
    for (const listener of listeners) listener()
  }
  return {
    enter: (id) => set(() => (hovered = id)),
    leave: (id) => set(() => hovered === id && (hovered = null)),
    focus: (id) => set(() => (focused = id)),
    blur: (id) => set(() => focused === id && (focused = null)),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    shown: () => shown,
  }
}

/** One tracker for the tab's lifetime. */
export const useTalentTracker = (): TalentTracker => useState(createTracker)[0]
