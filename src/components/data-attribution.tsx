import { cn } from '@/lib/utils'

const base = import.meta.env.BASE_URL

/**
 * The wago.tools logo, exactly as supplied on https://wago.tools/branding: the dark logo on
 * light backgrounds, the white logo on dark ones. Never recolor, stretch, rotate or add
 * effects; keep it legible (at least 24 px tall) with space around it.
 */
export function WagoToolsLogo({ className }: { className?: string }) {
  return (
    <a
      href="https://wago.tools"
      className={cn('inline-flex shrink-0 rounded-sm p-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}
      aria-label="wago.tools"
    >
      <img src={`${base}attribution/wago-tools-dark.svg`} alt="" className="h-6 w-auto dark:hidden" />
      <img src={`${base}attribution/wago-tools-white.svg`} alt="" className="hidden h-6 w-auto dark:block" />
    </a>
  )
}

/** Credit for the game data, shown at the foot of the page and in the About sheet. */
export function DataAttribution({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground', className)}>
      <span>Game data from</span>
      <WagoToolsLogo />
      <span>
        and{' '}
        <a className="underline underline-offset-2 hover:text-foreground" href="https://foreverchanges.pro">
          foreverchanges.pro
        </a>
      </span>
    </div>
  )
}
