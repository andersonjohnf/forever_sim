// What localStorage throws when a write doesn't fit: this site's storage is full. Browsers name
// it differently (Firefox's NS_ERROR_DOM_QUOTA_REACHED), and older ones give only a code.

/** Whether a localStorage error means this site's storage is full. */
export function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22 || error.code === 1014)
  )
}
