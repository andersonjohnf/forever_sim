import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Sections" (Character, Buffs, Fight): in the wide layout (D34) these three reflow by
// the setup pane's own width, with container queries on `setup`. Buffs' groups flow into 2 columns
// from a 53 rem pane and 3 from 84 rem (a window of about 2,140 px); Character puts the racials beside the races, and Fight puts
// Advanced beside the fight, from 53 rem. A 1440 px window's pane is 55 rem, or 54 beside a
// scrollbar that takes room, so all three apply from 1440. Under 1440 px the pane isn't a
// container, so nothing changes there (the rest of the suite runs at 1280).

const REM = 16

/** The setup pane's width, the container every query here measures. */
const setupWidth = (page: Page) => page.evaluate(() => document.querySelector('main')!.firstElementChild!.getBoundingClientRect().width)

const noSidewaysScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)

async function openTab(page: Page, name: string): Promise<Locator> {
  await page.getByRole('tab', { name, exact: true }).click()
  return page.getByRole('tabpanel', { name })
}

/** Each buff category's group cards: their boxes, and their switches' boxes. */
const buffGroups = (panel: Locator) =>
  panel.evaluate((root) =>
    [...root.querySelectorAll('section')].map((section) => {
      const heading = section.querySelector('h3')!
      const cards = [...section.lastElementChild!.children]
      return {
        category: heading.textContent,
        heading: heading.getBoundingClientRect().width,
        cards: cards.map((card) => {
          const r = card.getBoundingClientRect()
          return {
            name: card.firstElementChild!.textContent,
            left: Math.round(r.left),
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            switches: [...card.querySelectorAll('[role="switch"]')].map((s) => {
              const b = s.getBoundingClientRect()
              return { left: b.left, right: b.right, height: b.height }
            }),
            rows: [...card.querySelectorAll('label')].map((l) => l.getBoundingClientRect().height),
          }
        }),
      }
    }),
  )

test.describe('the wide sections', () => {
  for (const width of [1440, 1600, 1920, 2560]) {
    test(`at ${width} px, Buffs' groups flow into columns by the setup pane's width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const panel = await openTab(page, 'Buffs')
      const pane = await setupWidth(page)
      const columns = pane >= 84 * REM ? 3 : pane >= 53 * REM ? 2 : 1
      // The wide layout's reflow starts with the wide layout itself.
      expect(columns).toBeGreaterThanOrEqual(2)
      await noSidewaysScroll(page)

      // The presets and "In your raid" stay full width above the groups.
      const presets = await panel.getByRole('radiogroup', { name: 'Preset' }).boundingBox()
      expect(presets!.width).toBeGreaterThan(pane - 4)

      const categories = await buffGroups(panel)
      expect(categories.map((c) => c.category)).toEqual(['Raid buffs', 'Debuffs on the boss', 'Consumables'])
      for (const { heading, cards } of categories) {
        // Each category's heading spans the pane, above its cards.
        expect(heading).toBeGreaterThan(pane - 4)
        // As many columns as the pane has room for (fewer only when there are fewer groups), each
        // card no wider than its share: a card split across two columns would measure wider.
        const lefts = [...new Set(cards.map((c) => c.left))]
        expect(lefts.length).toBe(Math.min(columns, cards.length))
        for (const card of cards) expect(card.right - card.left).toBeLessThanOrEqual(pane / columns + 1)
        // Reading order runs top to bottom, then on to the next column: never back up the same one.
        for (let i = 1; i < cards.length; i++) {
          const [prev, next] = [cards[i - 1], cards[i]]
          if (next.left === prev.left) expect(next.top).toBeGreaterThan(prev.bottom)
          else expect(next.left).toBeGreaterThan(prev.left)
        }
        for (const card of cards) {
          // Every row, the switch's label, stays a target of 56 px or more.
          expect(card.rows.every((h) => h >= 56)).toBe(true)
          // Each switch sits at the end of its own card, not across the pane from its label.
          for (const s of card.switches) {
            expect(s.right).toBeLessThanOrEqual(card.right)
            expect(card.right - s.right).toBeLessThan(24)
          }
        }
      }
    })

    test(`at ${width} px, Character puts the racials beside the races from a 53 rem pane`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const panel = await openTab(page, 'Character')
      const pane = await setupWidth(page)
      const beside = pane >= 53 * REM
      expect(beside).toBe(true)
      await noSidewaysScroll(page)

      const races = (await panel.getByRole('radiogroup', { name: 'Race' }).boundingBox())!
      const racials = (await panel.getByRole('heading', { name: 'Human racials' }).boundingBox())!
      const advanced = (await panel.getByRole('button', { name: 'Advanced' }).boundingBox())!
      // The race tiles keep 3 to a row, on the left or across the pane.
      const human = (await panel.getByRole('radio', { name: 'Human' }).boundingBox())!
      const nightElf = (await panel.getByRole('radio', { name: 'Night Elf' }).boundingBox())!
      expect(nightElf.y).toBeCloseTo(human.y, 0)
      if (beside) {
        expect(racials.x).toBeGreaterThan(races.x + races.width)
        expect(racials.y).toBeLessThan(races.y)
        expect(races.width).toBeLessThan(pane * 0.7)
      } else {
        expect(racials.y).toBeGreaterThan(races.y + races.height)
      }
      // Advanced spans the pane below both, either way.
      expect(advanced.width).toBeGreaterThan(pane - 4)
      expect(advanced.y).toBeGreaterThan(races.y + races.height)
    })

    test(`at ${width} px, Fight puts Advanced beside the fight from a 53 rem pane`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const panel = await openTab(page, 'Fight')
      const pane = await setupWidth(page)
      const beside = pane >= 53 * REM
      expect(beside).toBe(true)
      const advanced = panel.getByRole('button', { name: 'Advanced' })
      const position = panel.getByRole('radiogroup', { name: 'Position' })
      const length = (await panel.getByRole('slider', { name: 'Fight length' }).boundingBox())!
      const before = (await position.boundingBox())!
      const trigger = (await advanced.boundingBox())!
      if (beside) {
        expect(trigger.x).toBeGreaterThan(length.x + length.width)
        expect(trigger.width).toBeLessThan(pane / 2)
      } else {
        expect(trigger.y).toBeGreaterThan(before.y + before.height)
        expect(trigger.width).toBeGreaterThan(pane - 4)
      }

      // Still a disclosure: closed by default, and opening it pushes nothing on the left down.
      await expect(advanced).toHaveAttribute('aria-expanded', 'false')
      await advanced.click()
      await expect(advanced).toHaveAttribute('aria-expanded', 'true')
      const precision = (await panel.getByRole('radiogroup', { name: 'Precision' }).boundingBox())!
      if (beside) {
        expect((await position.boundingBox())!.y).toBe(before.y)
        expect(precision.x).toBeGreaterThan(length.x + length.width)
      }
      await noSidewaysScroll(page)
    })
  }

  test('under 1440 px the three sections stay one column', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('./')
    const pane = await setupWidth(page)

    const buffs = await openTab(page, 'Buffs')
    for (const { cards } of await buffGroups(buffs)) {
      expect(new Set(cards.map((c) => c.left)).size).toBe(1)
      for (const card of cards) expect(card.right - card.left).toBeGreaterThan(pane - 4)
    }

    const character = await openTab(page, 'Character')
    const races = (await character.getByRole('radiogroup', { name: 'Race' }).boundingBox())!
    const racials = (await character.getByRole('heading', { name: 'Human racials' }).boundingBox())!
    expect(racials.y).toBeGreaterThan(races.y + races.height)

    const fight = await openTab(page, 'Fight')
    const trigger = (await fight.getByRole('button', { name: 'Advanced' }).boundingBox())!
    expect(trigger.width).toBeGreaterThan(pane - 4)
  })
})
