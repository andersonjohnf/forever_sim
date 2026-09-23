// Share links, on the way in (docs/ux.md#persistence-and-sharing): a #s=… link loads its setup
// with Undo, both when the page opens and when a link is pasted into a tab that already has the
// app open (only the hash changes, so the page doesn't reload).
import { useEffect } from 'react'
import { toast } from 'sonner'
import { normalizeConfig, SPEC_META } from '@/sim'
import { useSetup } from './setup-store'
import { hasSharedSetup, readSharedSetup } from './share'
import { isVisibleSpec } from './specs'
import { undoToast } from './undo-toast'

/** Only the latest link applies, if two are pasted in quick succession. */
let latest = 0

function loadSharedLink() {
  // Reading a link takes it out of the URL before decoding it (src/app/share.ts), so a second
  // call for the same link (React's dev double effects) finds none, and doesn't count as a newer one.
  if (!hasSharedSetup()) return
  const attempt = ++latest
  readSharedSetup()
    .then((raw) => {
      if (raw === null || attempt !== latest) return
      apply(raw)
    })
    .catch(() => {
      if (attempt !== latest) return
      toast.error('That share link is broken', { description: 'Your own setup is unchanged.' })
    })
}

function apply(raw: unknown) {
  const { config, warnings } = normalizeConfig(raw)
  const { name, className } = SPEC_META[config.spec]
  if (!isVisibleSpec(config.spec)) {
    toast.error(`That link is for a ${name} ${className}`, { description: 'This sim doesn’t cover that spec, so your own setup is unchanged.' })
    return
  }
  const switched = config.spec !== useSetup.getState().config.spec
  const undo = useSetup.getState().replace(config)
  const outdated =
    warnings.length === 1
      ? 'One part was out of date and is back to its default.'
      : warnings.length > 1
        ? `${warnings.length} parts were out of date and are back to their defaults.`
        : ''
  const description = [switched ? `You’re on ${name} ${className} now.` : '', outdated].filter(Boolean).join(' ')
  undoToast('Loaded a shared setup', undo, { description: description || undefined })
}

/** Loads share links on open and on hashchange. Call once, from App. */
export function useSharedLink() {
  useEffect(() => {
    loadSharedLink()
    window.addEventListener('hashchange', loadSharedLink)
    return () => window.removeEventListener('hashchange', loadSharedLink)
  }, [])
}
