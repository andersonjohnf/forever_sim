import { describe, expect, it } from 'vitest'
import { parseNumber, snapToStep } from './parse-number'

const WHOLE = { step: 1, max: 100 }
const COUNT = { step: 100, max: 100000 }
const SECONDS = { step: 0.1, max: 6 }

describe('parseNumber', () => {
  it('reads plain numbers', () => {
    expect(parseNumber('3000', COUNT)).toBe(3000)
    expect(parseNumber(' 42 ', WHOLE)).toBe(42)
    expect(parseNumber('1.5', SECONDS)).toBe(1.5)
    expect(parseNumber('-3', WHOLE)).toBe(-3)
    expect(parseNumber('+5', WHOLE)).toBe(5)
  })

  it('reads a decimal comma as the decimal point, in any field (PV2, QV3)', () => {
    expect(parseNumber('1,5', SECONDS)).toBe(1.5)
    expect(parseNumber('0,5', SECONDS)).toBe(0.5)
    expect(parseNumber(',5', SECONDS)).toBe(0.5)
    expect(parseNumber('-0,5', SECONDS)).toBe(-0.5)
    // Whole-number fields snap it to their step afterwards, as they do "2.5".
    expect(parseNumber('2,5', WHOLE)).toBe(2.5)
    expect(parseNumber('20,5', WHOLE)).toBe(20.5)
    expect(parseNumber('1,50', WHOLE)).toBe(1.5)
    expect(parseNumber('12345,000', WHOLE)).toBe(12345)
  })

  it('reads thousands separators (FV3)', () => {
    for (const typed of ['5.000', '5,000', '5 000', '5 000', '5 000', "5'000", '5’000']) {
      expect(parseNumber(typed, COUNT), typed).toBe(5000)
    }
    expect(parseNumber('12.500', COUNT)).toBe(12500)
    expect(parseNumber('100.000', COUNT)).toBe(100000)
    expect(parseNumber('4.294.967.295', WHOLE)).toBe(4294967295)
    expect(parseNumber('4,294,967,295', WHOLE)).toBe(4294967295)
  })

  it('reads the last of "." and "," as the decimal point when both are there', () => {
    expect(parseNumber('1,234.5', WHOLE)).toBe(1234.5)
    expect(parseNumber('1.234,5', WHOLE)).toBe(1234.5)
    expect(parseNumber('1.234.567,89', WHOLE)).toBe(1234567.89)
    expect(parseNumber('1,2.5', WHOLE)).toBeNull()
  })

  it('reads one separator before three digits by the field: a thousandth only where one can be meant (QV9)', () => {
    // A small fractional field, such as seconds.
    expect(parseNumber('1,500', SECONDS)).toBe(1.5)
    expect(parseNumber('1.500', SECONDS)).toBe(1.5)
    // A whole-number field, or a fractional one that reaches 1000.
    expect(parseNumber('1,500', WHOLE)).toBe(1500)
    expect(parseNumber('1,500', { step: 0.5, max: 5000 })).toBe(1500)
  })

  it('returns null for text that isn’t a number', () => {
    for (const typed of ['', '   ', ',', '.', 'abc', '1.2.3', '1,5,5', '1,2,3']) expect(parseNumber(typed, WHOLE), typed).toBeNull()
  })
})

describe('snapToStep', () => {
  it('leaves no float noise (QV2)', () => {
    expect(snapToStep(1.5 - 0.1, 0.1)).toBe(1.4)
    expect(snapToStep(0.30000000000000004, 0.1)).toBe(0.3)
    expect(snapToStep(0.7000000000000001, 0.1)).toBe(0.7)
    // Every value a 0.1 field reaches, stepping down from 6 and up from 0.
    let down = 6
    let up = 0
    for (let i = 0; i <= 60; i++) {
      expect(String(down)).toMatch(/^\d(\.\d)?$/)
      expect(String(up)).toMatch(/^\d(\.\d)?$/)
      down = snapToStep(down - 0.1, 0.1)
      up = snapToStep(up + 0.1, 0.1)
    }
  })

  it('snaps to whole steps', () => {
    expect(snapToStep(2.5, 1)).toBe(3)
    expect(snapToStep(12549, 100)).toBe(12500)
    expect(snapToStep(1.3, 0.5)).toBe(1.5)
  })
})
