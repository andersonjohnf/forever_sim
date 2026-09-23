/** Spaces (`\s` includes the no-break and thin spaces some locales group with) and apostrophes. */
const SPACES = /[\s'’]/g

/** Digits grouped in threes by "." or ",": "5.000", "12,500", "4.294.967.295". */
const GROUPED = /^[-+]?\d{1,3}(?:[.,]\d{3})+$/

/**
 * Reads what someone typed into a number field in their own locale's style, or null if it isn't
 * a number (docs/ux.md, Sections, "Fight"). The field then snaps it to its step.
 * - Spaces and apostrophes group thousands ("5 000", "5'000").
 * - With both "." and ",", the last is the decimal point and the other groups thousands
 *   ("1,234.5", "1.234,5").
 * - One kind more than once groups thousands ("4.294.967.295").
 * - Once, before exactly three digits ("5.000", "1,500"), it groups thousands in a whole-number
 *   field or one that reaches 1000, where a thousandth can't be meant. In a smaller fractional
 *   field it's the decimal point: "1,500" in seconds is 1.5.
 * - Otherwise it's the decimal point, so "2,5" is 2.5, as a comma-decimal phone's keypad types it.
 */
export function parseNumber(text: string, { step, max }: { step: number; max: number }): number | null {
  const t = text.replace(SPACES, '')
  const separators = t.match(/[.,]/g) ?? []
  let normal: string
  if (new Set(separators).size === 2) {
    const point = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','))
    const whole = t.slice(0, point)
    if (!/^[-+]?\d*$/.test(whole) && !GROUPED.test(whole)) return null
    normal = `${whole.replace(/[.,]/g, '')}.${t.slice(point + 1)}`
  } else if (GROUPED.test(t) && (separators.length > 1 || Number.isInteger(step) || max >= 1000)) {
    normal = t.replace(/[.,]/g, '')
  } else if (separators.length > 1) {
    return null
  } else {
    normal = t.replace(',', '.')
  }
  const n = Number(normal)
  return normal === '' || normal === '.' || Number.isNaN(n) ? null : n
}

/**
 * Snaps a number to a multiple of `step`, with no float noise: 1.5 − 0.1 is 1.4, not
 * 1.4000000000000001, which a field would show and a saved setup would keep.
 */
export function snapToStep(n: number, step: number): number {
  const decimals = String(step).split('.')[1]?.length ?? 0
  return Number((Math.round(n / step) * step).toFixed(decimals))
}
