/** Spaces (`\s` includes the no-break and thin spaces some locales group with) and apostrophes. */
const SPACES = /[\s'’]/g

/** Digits grouped in threes by "." or ",": "5.000", "12,500", "4.294.967.295". */
const GROUPED = /^-?\d{1,3}(?:[.,]\d{3})+$/

/**
 * Reads what someone typed into a number field in their own locale's style, or null if it isn't
 * a number (docs/ux.md, Sections, "Fight").
 * - Spaces and apostrophes are thousands separators everywhere ("5 000", "5'000").
 * - A field with a fractional step (none goes above 21) reads a lone comma as the decimal point,
 *   so "1,5" is 1.5, as a comma-decimal phone's decimal keypad types it. Any other comma is a
 *   thousands separator.
 * - A whole-number field reads "." or "," between groups of three digits as thousands
 *   separators, so "5.000" is 5000, not 5. Otherwise "." is the decimal point and commas are
 *   separators, and the field rounds the result to its step.
 */
export function parseNumber(text: string, step: number): number | null {
  let t = text.replace(SPACES, '')
  if (t === '') return null
  if (!Number.isInteger(step) && !t.includes('.') && t.split(',').length === 2) t = t.replace(',', '.')
  else if (Number.isInteger(step) && GROUPED.test(t)) t = t.replace(/[.,]/g, '')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  return t === '' || Number.isNaN(n) ? null : n
}
