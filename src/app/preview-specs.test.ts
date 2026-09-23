import { describe, expect, it } from 'vitest'
import { previewSpecIds, previewSpecs } from './preview-specs'

describe('previewSpecIds', () => {
  it('reads the specs a page’s ?preview= names, repeated or comma-separated, in the switcher’s order', () => {
    expect(previewSpecIds('?preview=warrior-protection')).toEqual(['warrior-protection'])
    expect(previewSpecIds('?preview=paladin-protection&preview=warrior-protection')).toEqual(['warrior-protection', 'paladin-protection'])
    expect(previewSpecIds('?preview=druid-feral-bear,warrior-protection')).toEqual(['warrior-protection', 'druid-feral-bear'])
  })

  it('ignores anything that isn’t a spec id', () => {
    expect(previewSpecIds('')).toEqual([])
    expect(previewSpecIds('?preview=')).toEqual([])
    expect(previewSpecIds('?preview=protection&preview=all')).toEqual([])
    expect(previewSpecIds('?spec=warrior-protection')).toEqual([])
  })
})

describe('previewSpecs', () => {
  it('previews nothing without a page to read the parameter from', () => {
    expect(previewSpecs()).toEqual([])
  })
})
