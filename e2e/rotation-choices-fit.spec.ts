import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Rotation tab's segmented choices fit wherever they show (docs/ux.md "Rotation" and
// "Layout"): no option's name runs past its button, and no button past its setting, on the
// narrowest phones (320 and 360 px), at 390 and 440 px, and in the desktop panel beside the list at
// 1024 px, its narrowest. Every spec with a choice: the spec-wide ones above the list (a warlock's
// Demonic Sacrifice, four names) and each list row's own (opened in its sheet, or the panel).

const SPECS: readonly { cls: string; spec: string; rows: readonly string[] }[] = [
  { cls: 'Warrior', spec: 'Arms', rows: [] },
  { cls: 'Druid', spec: 'Balance', rows: ['filler'] },
  { cls: 'Paladin', spec: 'Retribution', rows: ['seal'] },
  { cls: 'Paladin', spec: 'Protection', rows: ['seal'] },
  { cls: 'Shaman', spec: 'Enhancement', rows: ['shock'] },
  { cls: 'Shaman', spec: 'Elemental', rows: ['chainLightning'] },
  { cls: 'Rogue', spec: 'Subtlety', rows: ['builder'] },
  { cls: 'Warlock', spec: 'Destruction', rows: ['bane', 'filler'] },
  { cls: 'Warlock', spec: 'Affliction', rows: ['bane', 'filler'] },
  { cls: 'Warlock', spec: 'Demonology', rows: ['bane', 'filler'] },
  { cls: 'Hunter', spec: 'Marksmanship', rows: ['sharedShot'] },
  { cls: 'Hunter', spec: 'Beast Mastery', rows: ['sharedShot'] },
  { cls: 'Hunter', spec: 'Survival', rows: ['sharedShot'] },
]

// 440 px: just past the phone's two-to-a-line rule (27rem), where four share one line or wrap.
const WIDTHS = [320, 360, 390, 440, 1024]

/** Every option of the segmented choices in `scope` that its name overflows, or that runs past its setting's box. */
const overflowing = (scope: Locator) =>
  scope.locator('[data-slot="toggle-group-item"]').evaluateAll((items) =>
    items.flatMap((item) => {
      const box = item.getBoundingClientRect()
      // The setting's row: the group's parent, which the group must stay inside.
      const outer = item.parentElement!.parentElement!.getBoundingClientRect()
      const clipped = item.scrollWidth > item.clientWidth + 0.5
      const outside = box.left < outer.left - 0.5 || box.right > outer.right + 0.5
      return clipped || outside ? [`${item.textContent} (${Math.round(box.width)} px${clipped ? ', clipped' : ''}${outside ? ', outside its setting' : ''})`] : []
    }),
  )

/** How many options each four-option choice in `scope` puts on each line: [2, 2] or [4], never three and one. */
const fourLines = (scope: Locator) =>
  scope.locator('[data-slot="toggle-group"]').evaluateAll((groups) =>
    groups
      .filter((g) => g.children.length === 4)
      .map((g) => {
        const tops = [...g.children].map((c) => Math.round(c.getBoundingClientRect().top))
        return [...new Set(tops)].map((top) => tops.filter((t) => t === top).length)
      }),
  )

async function openRotation(page: Page, cls: string, spec: string) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: cls }).getByRole('menuitem', { name: new RegExp(`^${spec}`) }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${spec} ${cls}`) })).toBeVisible()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('tabpanel', { name: 'Rotation' })
}

for (const { cls, spec, rows } of SPECS) {
  test(`${spec} ${cls}: every segmented choice fits at 320, 360, 390, 440 and 1024 px`, async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 })
      const panel = await openRotation(page, cls, spec)
      expect(await overflowing(panel), `${width} px, above the list`).toEqual([])
      for (const lines of await fourLines(panel)) expect([[2, 2], [4]], `${width} px, four options`).toContainEqual(lines)
      for (const row of rows) {
        await page.locator(`#apl-${row}-select`).click()
        // A phone's sheet, or the desktop panel beside the list.
        const settings = width >= 1024 ? page.getByRole('complementary') : page.getByRole('dialog')
        await expect(settings.locator('[data-slot="toggle-group-item"]').first()).toBeVisible()
        expect(await overflowing(settings), `${width} px, ${row}`).toEqual([])
        if (width < 1024) {
          await page.keyboard.press('Escape')
          await expect(page.getByRole('dialog')).toHaveCount(0)
        }
      }
    }
  })
}
