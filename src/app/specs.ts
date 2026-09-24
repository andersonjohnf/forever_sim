// Which specs the app offers (docs/ux.md principles 1 and 8). setup-store imports these while
// it's being created, and this module imports the store for useSpecMeta: the helpers are
// function declarations, so the import cycle is safe in either load order.
import { SPEC_META, specs, type ClassId, type SpecDefinition, type SpecId } from '@/sim'
import { previewSpecs } from './preview-specs'
import { useSetup } from './setup-store'

/**
 * A class's colour as text (docs/ux.md#visual-language): darker on light surfaces so it meets
 * AA, the class colour itself on dark ones (tokens in src/index.css).
 */
export const CLASS_TEXT: Record<ClassId, string> = {
  warrior: 'text-class-warrior',
  druid: 'text-class-druid',
  paladin: 'text-class-paladin',
  shaman: 'text-class-shaman',
  rogue: 'text-class-rogue',
  mage: 'text-class-mage',
  warlock: 'text-class-warlock',
  priest: 'text-class-priest',
  hunter: 'text-class-hunter',
}

const list = (words: string[]) => (words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

/**
 * What the app is, without naming specs, so it reads right as specs ship (docs/ux.md principle
 * 8): "A DPS simulator for World of Warcraft: Forever.", and "A DPS and TPS simulator…" once a
 * tank spec ships. It's About's first mention of the game, so it gives the full name; "WoW
 * Forever" is the short form after it (docs/ux.md#brand).
 */
export function appSentence(offered: readonly SpecDefinition[] = visibleSpecs()): string {
  const metrics = offered.some((s) => s.role === 'tank') ? 'DPS and TPS' : 'DPS'
  return `A ${metrics} simulator for World of Warcraft: Forever.`
}

/**
 * The specs it offers, from the switcher, one class at a time so the list stays readable as specs
 * ship: "Covers Warriors: Fury, Arms and Protection · Druids: Feral (Cat) and Feral (Bear) ·
 * Paladins: Retribution and Protection · Shamans: Enhancement." today.
 */
export function coverageSentence(offered: readonly SpecDefinition[] = visibleSpecs()): string {
  // Spec names per class, in the switcher's order: { Warrior: ['Fury', 'Arms'] }. A name never
  // breaks across lines ("Feral (Cat)"): its spaces are non-breaking.
  const byClass = new Map<string, string[]>()
  for (const spec of offered) {
    const { className, name } = SPEC_META[spec.id]
    byClass.set(className, [...(byClass.get(className) ?? []), name.replace(/ /g, '\u00a0')])
  }
  return `Covers ${[...byClass].map(([className, names]) => `${className}s: ${list(names)}`).join(' · ')}.`
}

/**
 * Specs shown in the spec switcher: only finished ones (docs/ux.md principle 8). Until the
 * first spec is finished there's nothing to hide behind, so every spec shows in development.
 */
export function visibleSpecs(): SpecDefinition[] {
  const finished = specs.filter((s) => s.available)
  if (finished.length === 0) return specs
  // A dev or e2e page can preview an unfinished spec (src/app/preview-specs.ts).
  const preview = previewSpecs()
  return preview.length > 0 ? specs.filter((s) => s.available || preview.includes(s.id)) : finished
}

/** The spec a first visit opens on: Fury, or the first finished spec if Fury isn't (docs/ux.md principle 1). */
export function defaultSpec(): SpecId {
  const visible = visibleSpecs()
  return visible.find((s) => s.id === 'warrior-fury')?.id ?? visible[0].id
}

/** Whether a saved or shared setup's spec can be shown: the switcher offers it. */
export function isVisibleSpec(spec: SpecId): boolean {
  return visibleSpecs().some((s) => s.id === spec)
}

export function useSpecMeta() {
  return SPEC_META[useSetup((s) => s.config.spec)]
}
