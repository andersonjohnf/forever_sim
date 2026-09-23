import { useEffect, useState } from 'react'
import { useSim } from '@/app/sim-store'
import { headlineText } from './run-logic'

/**
 * A polite live region for runs (docs/ux.md#states): "Simulating…" when a run starts, then
 * "Done: 682.5 DPS", "Simulation cancelled", or why it couldn't run. It's mounted once, at every
 * width. On desktop the results panel's alert already reads out a failure, so it isn't repeated.
 */
export function RunAnnouncer() {
  const [message, setMessage] = useState('')
  useEffect(
    () =>
      useSim.subscribe((state, previous) => {
        if (state.status === previous.status) return
        if (state.status === 'running') setMessage('Simulating…')
        else if (state.status === 'error') {
          const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
          setMessage(desktop ? '' : `Couldn’t simulate: ${state.error ?? ''} Open the results for details.`)
        } else if (previous.status === 'running') {
          // A finished run brings a new result; a cancelled one keeps the old.
          setMessage(state.result && state.result !== previous.result ? `Done: ${headlineText(state.result)}` : 'Simulation cancelled.')
        }
      }),
    [],
  )
  return (
    <div role="status" aria-live="polite" aria-atomic="true" aria-label="Simulation status" className="sr-only">
      {message}
    </div>
  )
}
