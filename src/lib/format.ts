const nf = (digits: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const n0 = nf(0)
const n1 = nf(1)

export const formatInt = (n: number) => n0.format(n)
export const formatOne = (n: number) => n1.format(n)
export const formatPct = (n: number) => `${n1.format(n)}%`
export const formatSeconds = (ms: number) => `${n1.format(ms / 1000)} s`
