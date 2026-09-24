import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

const base = import.meta.env.BASE_URL

/**
 * The wago.tools logo, exactly as supplied on https://wago.tools/branding: the dark logo on
 * light backgrounds, the white logo on dark ones. Never recolor, stretch, rotate or add
 * effects; keep it legible (at least 24 px tall) with space around it. The link around it is a
 * 44 px target (docs/ux.md principle 4). `newTab` opens it in a new tab, as About's links do.
 */
export function WagoToolsLogo({ className, newTab = false }: { className?: string; newTab?: boolean }) {
  return (
    <a
      href="https://wago.tools"
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center rounded-sm px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
      aria-label={newTab ? 'wago.tools (opens in a new tab)' : 'wago.tools'}
      {...(newTab && { target: '_blank', rel: 'noopener' })}
    >
      <img src={`${base}attribution/wago-tools-dark.svg`} alt="" className="h-6 w-auto dark:hidden" />
      <img src={`${base}attribution/wago-tools-white.svg`} alt="" className="hidden h-6 w-auto dark:block" />
      {newTab && <ExternalLink className="ml-1 size-3.5 text-muted-foreground" aria-hidden />}
    </a>
  )
}

/** Credit for the game data, at the foot of the page and in the About sheet; both open it in a new tab, so a result isn't lost. */
export function DataAttribution({ className, newTab = false }: { className?: string; newTab?: boolean }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground', className)}>
      <span>Game data from</span>
      <WagoToolsLogo newTab={newTab} />
    </div>
  )
}
