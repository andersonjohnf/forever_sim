import { expect, test } from './fixtures.ts'

// The Character tab (docs/ux.md "Character"): races grouped by faction in one radio group, the
// Skyborne tiles that can't be simulated yet, and faction gear on a race change.

test.describe('race picker', () => {
  test('groups races by faction, moves with the arrow keys, and is one tab stop', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    const races = page.getByRole('radiogroup', { name: 'Race' })
    await expect(races.getByRole('radio')).toHaveCount(10)
    const human = races.getByRole('radio', { name: 'Human' })
    await expect(human).toHaveAttribute('aria-checked', 'true')
    await expect(human).toHaveAccessibleDescription('Alliance')
    await expect(races.getByRole('radio', { name: 'Orc' })).toHaveAccessibleDescription('Horde')
    // Only the selected race is in the tab order.
    await expect(races.locator('[tabindex="0"]')).toHaveCount(1)
    await expect(human).toHaveAttribute('tabindex', '0')

    await human.focus()
    await page.keyboard.press('ArrowRight')
    const dwarf = races.getByRole('radio', { name: 'Dwarf' })
    await expect(dwarf).toBeFocused()
    await expect(dwarf).toHaveAttribute('aria-checked', 'true')
    await expect(dwarf).toHaveAttribute('tabindex', '0')
    await page.keyboard.press('ArrowLeft')
    await expect(human).toBeFocused()
    await expect(human).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('ArrowLeft')
    // Wraps around to the last race, Horde's Skyborne.
    await expect(races.getByRole('radio', { name: 'Skyborne (Windshaper)' })).toBeFocused()
  })

  test('marks the Skyborne tiles as not simulatable yet, with the reason in view', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    for (const [name, faction] of [
      ['Skyborne (High Order)', 'Alliance'],
      ['Skyborne (Windshaper)', 'Horde'],
    ]) {
      const tile = page.getByRole('radio', { name })
      await expect(tile).toContainText('Can’t be simulated yet: its base stats at level 60 aren’t known.')
      await expect(tile).toHaveAccessibleDescription(`${faction} Can’t be simulated yet: its base stats at level 60 aren’t known.`)
    }
    await expect(page.getByRole('radio', { name: 'Human' })).not.toContainText('Can’t be simulated')
  })
})

test.describe('faction gear on a race change', () => {
  test('swaps PvP twins for the new faction’s, and a notice says which', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('button', { name: 'Shoulders: Lieutenant Commander\'s Plate Shoulders' })).toBeVisible()
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: 'Orc' }).click()
    const notice = page.locator('[data-sonner-toast]').filter({ hasText: 'Swapped 2 items for their Horde versions' })
    await expect(notice).toContainText('Champion\'s Plate Shoulders and Blood Guard\'s Plate Greaves, with the same stats.')

    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Shoulders: Champion\'s Plate Shoulders' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Feet: Blood Guard\'s Plate Greaves' })).toBeVisible()
  })

  test('swaps pieces whose set differs too, and the notice says so (GV-1)', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('group', { name: 'Mage' }).getByRole('menuitem', { name: /^Frost/ }).click()
    await expect(page.getByRole('button', { name: /^Spec: Frost Mage/ })).toBeVisible()
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: 'Human' }).click()
    // The Alliance's Rank 7 to 10 silk has the Horde pieces' stats but no item set.
    const notice = page.locator('[data-sonner-toast]').filter({ hasText: 'Swapped 3 items for their Alliance versions' })
    await expect(notice).toContainText('Sageclaw, with the same stats.')
    await expect(notice).toContainText("Knight-Captain's Silk Legguards and Knight-Lieutenant's Silk Walkers, with the same stats but no set bonus.")

    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await expect(page.getByRole('button', { name: "Legs: Knight-Captain's Silk Legguards" })).toBeVisible()
  })

  test('a race on the same side changes no gear and shows no toast', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: 'Gnome' }).click()
    await expect(page.getByRole('radio', { name: 'Gnome' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  })
})

test('Advanced: the whole row of a switch is its label', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Character', exact: true }).click()
  await page.getByRole('button', { name: 'Advanced' }).click()
  const ratings = page.getByRole('switch', { name: 'Count untested ratings' })
  await expect(ratings).toBeChecked()
  await expect(ratings).toHaveAccessibleDescription(/^Expertise, haste and armor penetration/)
  await page.getByText('Expertise, haste and armor penetration are new in Forever').click()
  await expect(ratings).not.toBeChecked()
})
