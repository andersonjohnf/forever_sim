import type { GearSlot } from '@/sim'
import type { Section } from './setup-store'

/**
 * Focus for a control that opens a setup tab, such as "Open Gear" in a result with no damage
 * (docs/ux.md#accessibility): it lands in the tab it opened, never on <body>. Gear focuses the slot
 * such a result asks for, its main hand unless `gearSlot` names another (a refused hunter's Ranged);
 * any other tab focuses its panel. Call it once the tab has rendered.
 */
export function focusSection(section: Section, gearSlot: GearSlot = 'mainHand') {
  const target =
    section === 'gear'
      ? document.querySelector<HTMLElement>(`[data-gear-slot="${gearSlot}"]`)
      : document.querySelector<HTMLElement>(`[data-section="${section}"]`)
  target?.focus()
}
