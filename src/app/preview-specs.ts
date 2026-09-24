// Seeing and testing a spec before it ships. The switcher offers only finished specs (docs/ux.md
// principle 8), so `?preview=druid-feral-bear` in the page's URL adds that spec to the ones the
// app offers, but only in a dev build or in a browser driven by automation: the e2e suite and
// `npm run snap`, whose Chromium reports `navigator.webdriver`. A visitor's browser doesn't, so
// the deployed app ignores the parameter, and the e2e suite still tests the exact bundle that's
// deployed. A spec's share link, saved setup or setup code is refused as usual without it.
import { SPEC_IDS, type SpecId } from '@/sim'

/** The known spec ids a query string's `preview` parameters name (repeated or comma-separated). */
export function previewSpecIds(search: string): SpecId[] {
  const named = new URLSearchParams(search).getAll('preview').flatMap((v) => v.split(','))
  return SPEC_IDS.filter((id) => named.includes(id))
}

/** Whether this page may preview specs: a dev build, or a browser under automation. */
function previewAllowed(): boolean {
  return import.meta.env.DEV || (typeof navigator !== 'undefined' && navigator.webdriver === true)
}

/** The unfinished specs this page previews: none unless `previewAllowed` and the URL names some. */
export function previewSpecs(): SpecId[] {
  if (typeof window === 'undefined' || !previewAllowed()) return []
  return previewSpecIds(window.location.search)
}
