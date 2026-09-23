import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Delta } from './delta'

/** Delta as markup, and what a screen reader hears of it (its visually hidden text). */
function render(value: number, previous: number | null, lowerIsBetter?: boolean) {
  const html = renderToStaticMarkup(createElement(Delta, { value, previous, lowerIsBetter }))
  return {
    html,
    color: /text-(positive|negative)/.exec(html)?.[1] ?? null,
    shown: /<span aria-hidden="true">([^<]*)<\/span>/.exec(html)?.[1] ?? null,
    heard: /<span class="sr-only">([^<]*)<\/span>/.exec(html)?.[1] ?? null,
  }
}

describe('Delta', () => {
  it('shows nothing without a previous run, or for a change that rounds to 0.0', () => {
    expect(render(100, null).html).toBe('')
    expect(render(100.04, 100).html).toBe('')
    expect(render(100, 100.04, true).html).toBe('')
  })

  it('TPS and DPS: a rise is green and better, a drop red and worse', () => {
    expect(render(712.3, 700)).toMatchObject({ color: 'positive', shown: '+12.3', heard: 'up 12.3 from the last run, better' })
    expect(render(687.7, 700)).toMatchObject({ color: 'negative', shown: '−12.3', heard: 'down 12.3 from the last run, worse' })
  })

  it('damage taken (lowerIsBetter): a drop is green and better, a rise red and worse (TU3, TU7)', () => {
    expect(render(639.8, 912.9, true)).toMatchObject({ color: 'positive', shown: '−273.1', heard: 'down 273.1 from the last run, better' })
    expect(render(912.9, 673.9, true)).toMatchObject({ color: 'negative', shown: '+239.0', heard: 'up 239.0 from the last run, worse' })
  })

  it('says which way it went with an arrow as well as the sign and color', () => {
    expect(render(639.8, 912.9, true).html).toContain('lucide-arrow-down')
    expect(render(912.9, 673.9, true).html).toContain('lucide-arrow-up')
  })
})
