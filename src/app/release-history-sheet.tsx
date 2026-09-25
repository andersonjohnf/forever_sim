import { type MenuSheetProps, NotesSheet } from './notes-sheet'
import { ReleaseNotes } from './release-notes'
import { RELEASES } from './releases'

/**
 * Release history (docs/ux.md "What's new"): every release, newest first, with its time in the
 * viewer's zone and what it changed. A side sheet like About, full width on a phone; titleRef and
 * contentProps come from the header's useSheetFocus, which returns focus to its menu.
 */
export function ReleaseHistorySheet(props: MenuSheetProps) {
  return (
    <NotesSheet {...props} title="Release history" description="What each release changed, newest first, in your time zone.">
      <ReleaseNotes releases={RELEASES} markLatest />
    </NotesSheet>
  )
}
