/** "3:00": the fight length as the Fight tab shows it. */
export const formatDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

/** "3 minutes", "3 minutes 15 seconds", "45 seconds": the fight length as a screen reader says it. */
export function durationText(sec: number): string {
  const min = Math.floor(sec / 60)
  const rest = sec % 60
  const parts = [min ? `${min} ${min === 1 ? 'minute' : 'minutes'}` : null, rest ? `${rest} ${rest === 1 ? 'second' : 'seconds'}` : null]
  return parts.filter(Boolean).join(' ') || '0 seconds'
}
