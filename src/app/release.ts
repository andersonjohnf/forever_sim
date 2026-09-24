/** Set by Vite at build time (vite.config.ts): the build's ISO time and its git commit ("" if unknown). */
declare const __BUILD_TIME__: string
declare const __BUILD_COMMIT__: string

/** This release: when it was built and from which commit (docs/architecture.md "Release stamp"). */
export const RELEASE = { time: new Date(__BUILD_TIME__), commit: __BUILD_COMMIT__ } as const

/**
 * "8:05 PM EDT · Sep 24, 2026": the time in the viewer's own time zone with its abbreviation, then
 * the date. `locale` and `timeZone` default to the viewer's; tests pin them.
 */
export function formatReleaseTime(time: Date, locale?: string, timeZone?: string): string {
  const clock = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone }).format(time)
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(time)
  return `${clock} · ${date}`
}

/** The commit's first seven characters, as GitHub shows it, or null when the build didn't know it. */
export const shortCommit = (commit: string): string | null => (commit ? commit.slice(0, 7) : null)
