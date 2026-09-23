import type { Section } from './setup-store'

/**
 * Focus for a control that opens a setup tab, such as "Open Gear" in a result with no damage
 * (docs/ux.md#accessibility): it lands in the tab it opened, never on <body>. Gear focuses its main
 * hand, the weapon such a result asks for; any other tab focuses its panel. Call it once the tab
 * has rendered.
 */
export function focusSection(section: Section) {
  const target =
    section === 'gear'
      ? document.querySelector<HTMLElement>('[data-gear-slot="mainHand"]')
      : document.querySelector<HTMLElement>(`[data-section="${section}"]`)
  target?.focus()
}
