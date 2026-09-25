import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Sections" (Character, Buffs, Fight) and "Visual language" (segmented choices): in the
// wide layout (D34, as amended) these reflow by the setup pane's own width, with container queries
// on `setup`, and use the room to show more, never to stretch a control. Buffs' groups flow into 2
// columns from a 53 rem pane and 3 from 72 rem (a window of about 1,850 px), and its presets stop at
// 16 rem each; Character puts the racials beside the races, and Fight puts Advanced beside the fight,
// from 53 rem; both show Advanced open, with no disclosure; and every segmented choice is as wide as
// its options, left-aligned. A 1440 px window's pane is 55 rem, or 54 beside a scrollbar that takes
// room, so all of it applies from 1440. Under 1440 px the pane isn't a container, so nothing changes
// there (the rest of the suite runs at 1280).

const REM = 16

/** The setup pane's width, the container every query here measures. */
const setupWidth = (page: Page) => page.evaluate(() => document.querySelector('main')!.firstElementChild!.getBoundingClientRect().width)
/** The setup pane's left edge. */
const setupLeft = (page: Page) => page.evaluate(() => document.querySelector('main')!.firstElementChild!.getBoundingClientRect().left)

const noSidewaysScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)

async function openTab(page: Page, name: string): Promise<Locator> {
  await page.getByRole('tab', { name, exact: true }).click()
  return page.getByRole('tabpanel', { name })
}

/**
 * Every segmented choice's option in `scope` that's stretched: wider than its words and its padding
 * (1 rem a side and the border), or than the 7 rem floor a short name gets (CHOICE_ITEM_WIDE).
 */
const stretchedChoices = (scope: Locator) =>
  scope.locator('[data-slot="toggle-group-item"]').evaluateAll((items) =>
    items.flatMap((item) => {
      // The words' own width: the widest line of its text, whatever box holds it.
      const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT)
      let words = 0
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of range.getClientRects()) words = Math.max(words, rect.width)
      }
      const width = item.getBoundingClientRect().width
      return width > Math.max(7 * 16, words + 2 * 16 + 2) + 1 ? [`${item.textContent} (${Math.round(width)} px for ${Math.round(words)} px of words)`] : []
    }),
  )

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
    test(`at ${width} px, Buffs' groups flow into columns by the setup pane's width, and the presets aren't stretched`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const panel = await openTab(page, 'Buffs')
      const pane = await setupWidth(page)
      const columns = pane >= 72 * REM ? 3 : pane >= 53 * REM ? 2 : 1
      // The wide layout's reflow starts with the wide layout itself; three columns by 1920 px.
      expect(columns).toBeGreaterThanOrEqual(2)
      if (width >= 1920) expect(columns).toBe(3)
      await noSidewaysScroll(page)

      // The presets sit at the pane's left, each 16 rem at most, however wide the pane.
      const presets = panel.getByRole('radiogroup', { name: 'Preset' })
      expect((await presets.boundingBox())!.x).toBeCloseTo(await setupLeft(page), 0)
      for (const preset of await presets.getByRole('radio').all()) expect((await preset.boundingBox())!.width).toBeLessThanOrEqual(16 * REM + 0.5)

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
          // A column is still wide enough for a buff's words: 23 rem or more.
          expect(card.right - card.left).toBeGreaterThanOrEqual(23 * REM)
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

    test(`at ${width} px, Character puts the racials beside the races and shows Advanced open, its choices unstretched`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const panel = await openTab(page, 'Character')
      const pane = await setupWidth(page)
      expect(pane).toBeGreaterThanOrEqual(53 * REM)
      await noSidewaysScroll(page)

      const races = (await panel.getByRole('radiogroup', { name: 'Race' }).boundingBox())!
      const racials = (await panel.getByRole('heading', { name: 'Human racials' }).boundingBox())!
      // The race tiles keep 3 to a row, on the left.
      const human = (await panel.getByRole('radio', { name: 'Human' }).boundingBox())!
      const nightElf = (await panel.getByRole('radio', { name: 'Night Elf' }).boundingBox())!
      expect(nightElf.y).toBeCloseTo(human.y, 0)
      expect(racials.x).toBeGreaterThan(races.x + races.width)
      expect(racials.y).toBeLessThan(races.y)
      expect(races.width).toBeLessThan(pane * 0.7)

      // Advanced is shown, not a disclosure: a heading over its settings, across the pane below both.
      await expect(panel.getByRole('button', { name: /^Advanced/ })).toHaveCount(0)
      const advanced = panel.getByRole('region', { name: 'Advanced' })
      const box = (await advanced.boundingBox())!
      expect(box.width).toBeGreaterThan(pane - 4)
      expect(box.y).toBeGreaterThan(races.y + races.height)
      const rules = advanced.getByRole('radiogroup', { name: 'Rules' })
      await expect(rules).toBeVisible()
      await expect(advanced.getByRole('switch', { name: 'Count untested ratings' })).toBeVisible()
      // The rule profile is two buttons as wide as their names, at the pane's left, not two halves of it.
      expect(await stretchedChoices(panel)).toEqual([])
      const rulesBox = (await rules.boundingBox())!
      expect(rulesBox.width).toBeLessThan(20 * REM)
    })

    test(`at ${width} px, Fight shows Advanced open beside the fight, and no choice is stretched`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const panel = await openTab(page, 'Fight')
      const pane = await setupWidth(page)
      expect(pane).toBeGreaterThanOrEqual(53 * REM)
      const length = (await panel.getByRole('slider', { name: 'Fight length' }).boundingBox())!

      // No disclosure to press: Advanced's settings are in view, in the right-hand column.
      await expect(panel.getByRole('button', { name: /^Advanced/ })).toHaveCount(0)
      const advanced = panel.getByRole('region', { name: 'Advanced' })
      const box = (await advanced.boundingBox())!
      expect(box.x).toBeGreaterThan(length.x + length.width)
      expect(box.width).toBeLessThan(pane / 2)
      const precision = (await advanced.getByRole('radiogroup', { name: 'Precision' }).boundingBox())!
      expect(precision.x).toBeGreaterThan(length.x + length.width)
      await expect(advanced.getByRole('combobox', { name: 'Creature type' })).toBeVisible()
      await expect(advanced.getByRole('textbox', { name: 'Random seed' })).toBeVisible()

      // Boss armor, position and precision are as wide as their options, not the column.
      expect(await stretchedChoices(panel)).toEqual([])
      const position = (await panel.getByRole('radiogroup', { name: 'Position' }).boundingBox())!
      expect(position.width).toBeLessThan(20 * REM)
      await noSidewaysScroll(page)
    })
  }

  test('at 1920 px, a tank’s Fight tab shows its boss melee settings in Advanced, with none stretched', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('./')
    await page.evaluate(() =>
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { config: { version: 1, spec: 'warrior-protection' }, bySpec: {}, section: 'fight' }, version: 1 })),
    )
    await page.reload()
    const panel = page.getByRole('tabpanel', { name: 'Fight' })
    const advanced = panel.getByRole('region', { name: 'Advanced' })
    await expect(advanced.getByRole('heading', { name: 'Boss melee' })).toBeVisible()
    await expect(advanced.getByRole('switch', { name: 'Crushing blows' })).toBeVisible()
    expect(await stretchedChoices(panel)).toEqual([])
    await noSidewaysScroll(page)
  })

  test('at 1440 px, Rotation’s “set Creature type” link lands on the creature type, with no disclosure to open', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('./')
    await page.evaluate(() =>
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { config: { version: 1, spec: 'paladin-retribution' }, bySpec: {}, section: 'rotation' }, version: 1 })),
    )
    await page.reload()
    const rotation = page.getByRole('tabpanel', { name: 'Rotation' })
    await rotation.locator('[data-apl-row="exorcism"]').click()
    const note = rotation.getByText(/Not used: set Creature type to Undead or Demon in/)
    await note.getByRole('button', { name: 'Fight' }).click()
    const creature = page.getByRole('tabpanel', { name: 'Fight' }).getByRole('combobox', { name: 'Creature type' })
    await expect(creature).toBeFocused()
  })

  test('under 1440 px the three sections stay one column, with Advanced a disclosure and the choices sharing the width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('./')
    const pane = await setupWidth(page)

    const buffs = await openTab(page, 'Buffs')
    for (const { cards } of await buffGroups(buffs)) {
      expect(new Set(cards.map((c) => c.left)).size).toBe(1)
      for (const card of cards) expect(card.right - card.left).toBeGreaterThan(pane - 4)
    }
    // The four presets share the pane's width.
    expect((await buffs.getByRole('radiogroup', { name: 'Preset' }).boundingBox())!.width).toBeGreaterThan(pane - 4)

    const character = await openTab(page, 'Character')
    const races = (await character.getByRole('radiogroup', { name: 'Race' }).boundingBox())!
    const racials = (await character.getByRole('heading', { name: 'Human racials' }).boundingBox())!
    expect(racials.y).toBeGreaterThan(races.y + races.height)
    const characterAdvanced = character.getByRole('button', { name: 'Advanced' })
    await expect(characterAdvanced).toHaveAttribute('aria-expanded', 'false')
    await characterAdvanced.click()
    // The rule profile's two options share the pane, as they always have here.
    expect((await character.getByRole('radiogroup', { name: 'Rules' }).boundingBox())!.width).toBeGreaterThan(pane - 4 - 2 * REM)

    const fight = await openTab(page, 'Fight')
    const trigger = fight.getByRole('button', { name: 'Advanced' })
    expect((await trigger.boundingBox())!.width).toBeGreaterThan(pane - 4)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await expect(fight.getByRole('combobox', { name: 'Creature type' })).toHaveCount(0)
    expect((await fight.getByRole('radiogroup', { name: 'Position' }).boundingBox())!.width).toBeGreaterThan(pane - 4)
    // Here the options share the width, so the wide tests' check finds them wider than their words.
    expect(await stretchedChoices(fight)).toEqual(expect.arrayContaining([expect.stringMatching(/^Behind /), expect.stringMatching(/^In front /)]))
  })
})
