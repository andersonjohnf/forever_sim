import { useState } from 'react'
import { cn } from '@/lib/utils'

const SIZES = { xs: 'size-5', sm: 'size-7', md: 'size-9', lg: 'size-11' } as const

/**
 * A WoW icon from Wowhead's CDN by icon name (decision D14). Purely decorative: it has a
 * neutral placeholder and nothing depends on it loading.
 */
export function WowIcon({
  icon,
  size = 'md',
  className,
  grayscale = false,
}: {
  icon: string | null | undefined
  size?: keyof typeof SIZES
  className?: string
  grayscale?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const classes = cn(
    'shrink-0 rounded-md border border-border bg-muted object-cover',
    SIZES[size],
    grayscale && 'grayscale opacity-60',
    className,
  )
  if (!icon || failed) return <span aria-hidden className={classes} />
  return (
    <img
      src={`https://wow.zamimg.com/images/wow/icons/${size === 'lg' ? 'large' : 'medium'}/${icon}.jpg`}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={classes}
    />
  )
}
