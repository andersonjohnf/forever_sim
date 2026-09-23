import { describe, expect, it } from 'vitest'
import { parseNumber } from './parse-number'

describe('parseNumber', () => {
  it('reads plain numbers', () => {
    expect(parseNumber('3000', 100)).toBe(3000)
    expect(parseNumber(' 42 ', 1)).toBe(42)
    expect(parseNumber('1.5', 0.5)).toBe(1.5)
    expect(parseNumber('-3', 1)).toBe(-3)
  })

  it('reads a lone comma as the decimal point in a fractional field (PV2)', () => {
    expect(parseNumber('1,5', 0.5)).toBe(1.5)
    expect(parseNumber('0,5', 0.1)).toBe(0.5)
    expect(parseNumber('2,5', 0.5)).toBe(2.5)
    expect(parseNumber(',5', 0.1)).toBe(0.5)
  })

  it('reads thousands separators in a whole-number field (FV3)', () => {
    expect(parseNumber('5.000', 100)).toBe(5000)
    expect(parseNumber('5,000', 100)).toBe(5000)
    expect(parseNumber('5 000', 100)).toBe(5000)
    expect(parseNumber('5\u202f000', 100)).toBe(5000)
    expect(parseNumber('5\u00a0000', 100)).toBe(5000)
    expect(parseNumber("5'000", 100)).toBe(5000)
    expect(parseNumber('12.500', 100)).toBe(12500)
    expect(parseNumber('4.294.967.295', 1)).toBe(4294967295)
    expect(parseNumber('100.000', 100)).toBe(100000)
  })

  it('keeps "." as the decimal point in a whole-number field unless it groups threes', () => {
    expect(parseNumber('1.5', 1)).toBe(1.5)
    expect(parseNumber('12.50', 1)).toBe(12.5)
    expect(parseNumber('1,234.5', 1)).toBe(1234.5)
  })

  it('returns null for text that isn’t a number', () => {
    expect(parseNumber('', 1)).toBeNull()
    expect(parseNumber('   ', 1)).toBeNull()
    expect(parseNumber(',', 1)).toBeNull()
    expect(parseNumber('abc', 1)).toBeNull()
    expect(parseNumber('1.2.3', 1)).toBeNull()
  })
})
