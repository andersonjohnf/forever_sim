import { History } from 'lucide-react'
import { useSetup } from '@/app/setup-store'
import { LINK_HIT_AREA } from '@/features/changed-hint'
import { changeAndFocus, selectedOption } from '@/features/refocus'
import { cn } from '@/lib/utils'

/** The id of the Character tab's rule profile control (a segmented control). */
export const RULE_PROFILE_ID = 'rule-profile'

/**
 * Says that Classic Era rules are on where their values show (docs/ux.md "Buffs", "Gear"), with a
 * link to where they're set: it opens Character on the rule profile, whose Advanced disclosure
 * opens by itself while it differs from its default. Renders nothing under Forever rules.
 */
export function ClassicEraNote({ what, className }: { what: string; className?: string }) {
  const profile = useSetup((s) => s.config.rules.profile)
  const setSection = useSetup((s) => s.setSection)
  if (profile !== 'classicEra') return null
  return (
    <p className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground', className)}>
      <History aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">Classic Era values.</span> {what} use Classic Era’s numbers, as set in{' '}
        <button
          type="button"
          // A small link with a 44 px hit area around it, like a setting's Reset: whatever follows
          // the note leaves room for it (LINK_HIT_AREA).
          className={cn('rounded-sm font-medium text-foreground underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50', LINK_HIT_AREA)}
          onClick={() =>
            changeAndFocus(
              () => setSection('character'),
              () => selectedOption(RULE_PROFILE_ID),
            )
          }
        >
          Character → Advanced
        </button>
        .
      </span>
    </p>
  )
}
