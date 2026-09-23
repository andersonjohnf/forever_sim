import { useEffect, useState } from 'react'
import { onAnnounce } from './announce'

/**
 * The polite live region that announce() speaks through (src/app/announce.ts), mounted once in the
 * app shell, at every width. Each message goes in as a new node, so the same words said twice
 * (Clear, then Clear again after a preset) are read twice.
 */
export function Announcer() {
  const [said, setSaid] = useState<{ id: number; message: string } | null>(null)
  useEffect(() => {
    let id = 0
    return onAnnounce((message) => setSaid({ id: ++id, message }))
  }, [])
  return (
    <div role="status" aria-live="polite" aria-atomic="true" aria-label="Announcements" data-announcer className="sr-only">
      {said && <span key={said.id}>{said.message}</span>}
    </div>
  )
}
