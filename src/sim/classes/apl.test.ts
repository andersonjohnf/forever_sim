import { describe, expect, it } from 'vitest'
import { SPEC_META } from '../specs'
import type { AplDefinition, RotationOption, SpecId } from '../types'
import {
  activeAplPreset,
  aplPresets,
  applyAplPreset,
  compileAplRows,
  CUSTOM_APL_PRESET,
  DEFAULT_APL_PRESET,
  defaultAplOrder,
  moveAplRow,
  normalizeAplOrder,
  storedAplOrder,
} from './apl'
import { rotationApl } from './rotation'

// The priority list's core (decision D31; docs/architecture.md "Rotation as a priority list"): a
// made-up spec with a pinned opener, a pinned duty in the middle, a spec-wide stance and a preset.
const toggle = (id: string, def = true): RotationOption => ({ kind: 'toggle', id, label: id, help: '', default: def })
const OPTIONS: RotationOption[] = [
  { kind: 'choice', id: 'stance', label: 'Stance', help: '', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a' },
  toggle('opener.on'),
  toggle('a.on'),
  { kind: 'number', id: 'a.min', label: 'A from', help: '', unit: 'rage', min: 0, max: 100, step: 1, default: 40, dependsOn: 'a.on' },
  toggle('b.on'),
  toggle('duty.on'),
  // C's default follows the stance, as Arms' Whirlwind does.
  { ...toggle('c.on', false), defaultWhen: [{ option: 'stance', is: 'b', default: true }] } as RotationOption,
  toggle('d.on', false),
]
const DEF: AplDefinition = {
  rows: [
    { id: 'opener', label: 'Opener', icon: '', optionIds: ['opener.on'], pinned: true },
    { id: 'a', label: 'A', icon: '', enabledId: 'a.on', optionIds: ['a.min'] },
    { id: 'b', label: 'B', icon: '', enabledId: 'b.on', optionIds: [] },
    { id: 'duty', label: 'Duty', icon: '', enabledId: 'duty.on', optionIds: [], pinned: true },
    { id: 'c', label: 'C', icon: '', enabledId: 'c.on', optionIds: [] },
    { id: 'd', label: 'D', icon: '', enabledId: 'd.on', optionIds: [] },
  ],
  specWide: ['stance'],
  presets: [{ id: 'fast', label: 'Fast', help: 'D first, A off.', order: ['opener', 'b', 'a', 'duty', 'd', 'c'], values: { 'a.on': false, 'd.on': true } }],
}
const NO_TALENTS = new Map<string, number>()

describe('the priority list’s order (decision D31)', () => {
  it('is the default order when nothing is stored', () => {
    expect(normalizeAplOrder(DEF, undefined)).toEqual(['opener', 'a', 'b', 'duty', 'c', 'd'])
    expect(normalizeAplOrder(DEF, [])).toEqual(defaultAplOrder(DEF))
    expect(storedAplOrder(DEF, defaultAplOrder(DEF))).toBeUndefined()
  })

  it('keeps a stored order, and stores it only while it isn’t the default', () => {
    const order = ['opener', 'b', 'a', 'duty', 'd', 'c']
    expect(normalizeAplOrder(DEF, order)).toEqual(order)
    expect(storedAplOrder(DEF, order)).toEqual(order)
  })

  it('drops unknown ids, repeats and anything that isn’t a string', () => {
    expect(normalizeAplOrder(DEF, ['nope', 'b', 3, 'b', null, 'a', 'd', 'c'])).toEqual(['opener', 'b', 'a', 'duty', 'd', 'c'])
  })

  it('puts a row the stored order doesn’t name back at its default place', () => {
    // A saved before B existed: B goes just after A, which precedes it by default.
    expect(normalizeAplOrder(DEF, ['a', 'd', 'c'])).toEqual(['opener', 'a', 'b', 'duty', 'd', 'c'])
    // Nothing before it by default is there: first in its stretch.
    expect(normalizeAplOrder(DEF, ['b', 'c'])).toEqual(['opener', 'a', 'b', 'duty', 'c', 'd'])
    expect(normalizeAplOrder(DEF, ['d'])).toEqual(['opener', 'a', 'b', 'duty', 'c', 'd'])
    // Two missing in a row keep their default order.
    expect(normalizeAplOrder(DEF, ['c'])).toEqual(['opener', 'a', 'b', 'duty', 'c', 'd'])
  })

  it('puts a missing row after the rows just after its predecessor that come before it by default too', () => {
    const rows = ['p', 'q', 'r', 's', 't'].map((id) => ({ id, label: id, icon: '', optionIds: [] }))
    const def: AplDefinition = { rows, specWide: [], presets: [] }
    // A hand-written ["r", "q"]: S and T follow Q, not R, since Q comes before them by default.
    expect(normalizeAplOrder(def, ['r', 'q'])).toEqual(['p', 'r', 'q', 's', 't'])
    // A new row S, with R moved first: after R, then past P and Q, so at its default place.
    expect(normalizeAplOrder(def, ['r', 'p', 'q', 't'])).toEqual(['r', 'p', 'q', 's', 't'])
    // With R moved last, S follows it there.
    expect(normalizeAplOrder(def, ['p', 'q', 't', 'r'])).toEqual(['p', 'q', 't', 'r', 's'])
  })

  it('keeps pinned rows where they belong, and no row crosses one', () => {
    // A stored order that moves the pinned rows, or a row past one, gets them back.
    expect(normalizeAplOrder(DEF, ['duty', 'c', 'opener', 'a', 'b', 'd'])).toEqual(['opener', 'a', 'b', 'duty', 'c', 'd'])
    expect(normalizeAplOrder(DEF, ['d', 'a', 'b', 'c'])).toEqual(['opener', 'a', 'b', 'duty', 'd', 'c'])
  })

  it('moves a row within its stretch, and refuses to move a pinned row or cross one', () => {
    const order = defaultAplOrder(DEF)
    expect(moveAplRow(DEF, order, 'b', 1)).toEqual(['opener', 'b', 'a', 'duty', 'c', 'd'])
    expect(moveAplRow(DEF, order, 'c', 5)).toEqual(['opener', 'a', 'b', 'duty', 'd', 'c'])
    expect(moveAplRow(DEF, order, 'opener', 1)).toBeNull()
    expect(moveAplRow(DEF, order, 'duty', 2)).toBeNull()
    // Onto a pinned row's place, or past it.
    expect(moveAplRow(DEF, order, 'a', 0)).toBeNull()
    expect(moveAplRow(DEF, order, 'b', 3)).toBeNull()
    expect(moveAplRow(DEF, order, 'b', 4)).toBeNull()
    expect(moveAplRow(DEF, order, 'c', 2)).toBeNull()
    // Off the list, or an unknown row.
    expect(moveAplRow(DEF, order, 'd', 6)).toBeNull()
    expect(moveAplRow(DEF, order, 'nope', 1)).toBeNull()
  })

  it('emits each row’s lines in the order, the pre-pull’s nowhere', () => {
    const seen: string[] = []
    const emit = Object.fromEntries(['a', 'b', 'duty', 'c', 'd'].map((id) => [id, () => seen.push(id)]))
    compileAplRows(DEF, ['d', 'b', 'a', 'c'], emit)
    expect(seen).toEqual(['b', 'a', 'duty', 'd', 'c'])
    seen.length = 0
    compileAplRows(DEF, undefined, emit)
    expect(seen).toEqual(['a', 'b', 'duty', 'c', 'd'])
  })
})

describe('the priority list’s presets and “Custom” (decision D31)', () => {
  const active = (saved: Record<string, string | number | boolean>, order?: string[]) => activeAplPreset(DEF, OPTIONS, saved, order, NO_TALENTS)

  it('lists the default first, then the spec’s', () => {
    expect(aplPresets(DEF).map((p) => p.id)).toEqual([DEFAULT_APL_PRESET, 'fast'])
  })

  it('is the default until you change a row’s setting or the order', () => {
    expect(active({})).toBe(DEFAULT_APL_PRESET)
    // A value you set that equals its default is still the default.
    expect(active({ 'a.min': 40 })).toBe(DEFAULT_APL_PRESET)
    expect(active({ 'a.min': 50 })).toBe(CUSTOM_APL_PRESET)
    expect(active({ 'b.on': false })).toBe(CUSTOM_APL_PRESET)
    expect(active({}, ['b', 'a'])).toBe(CUSTOM_APL_PRESET)
    // A spec-wide setting isn't part of the list: changing the stance keeps the preset, as long as
    // the rows' defaults it moves are compared as the sim uses them.
    expect(active({ stance: 'b' })).toBe(DEFAULT_APL_PRESET)
  })

  it('picks a preset: its order and row values, the list’s other settings at their defaults, spec-wide ones kept', () => {
    const picked = applyAplPreset(DEF, { 'a.min': 55, 'c.on': true, stance: 'b' }, 'fast')!
    expect(picked).toEqual({ rotation: { stance: 'b', 'a.on': false, 'd.on': true }, rotationOrder: ['opener', 'b', 'a', 'duty', 'd', 'c'] })
    expect(active(picked.rotation, picked.rotationOrder)).toBe('fast')
    // Editing it after makes it Custom.
    expect(active({ ...picked.rotation, 'b.on': false }, picked.rotationOrder)).toBe(CUSTOM_APL_PRESET)
    expect(active(picked.rotation, moveAplRow(DEF, picked.rotationOrder!, 'c', 4)!)).toBe(CUSTOM_APL_PRESET)
    // Back to the default: every row setting and the order reset, the stance kept.
    expect(applyAplPreset(DEF, picked.rotation, DEFAULT_APL_PRESET)).toEqual({ rotation: { stance: 'b' }, rotationOrder: undefined })
    expect(applyAplPreset(DEF, {}, 'nope')).toBeUndefined()
  })

  // D28's tank rotations: a spec-wide Priority choice the presets set, whose value moves rows'
  // defaults, and a default the spec names and places itself (Balanced, between the other two).
  const TANK_OPTIONS: RotationOption[] = [
    { kind: 'choice', id: 'priority', label: 'Priority', help: '', choices: ['safe', 'mid', 'max'].map((value) => ({ value, label: value })), default: 'mid' },
    { ...toggle('a.on'), defaultWhen: [{ option: 'priority', is: 'max', default: false }] } as RotationOption,
    { ...toggle('b.on', false), defaultWhen: [{ option: 'priority', is: 'safe', default: true }] } as RotationOption,
    { kind: 'number', id: 'potion', label: 'Potion', help: '', unit: 'mana', min: 0, max: 100, step: 1, default: 10 },
  ]
  const TANK: AplDefinition = {
    rows: [
      { id: 'a', label: 'A', icon: '', enabledId: 'a.on', optionIds: [] },
      { id: 'b', label: 'B', icon: '', enabledId: 'b.on', optionIds: [] },
    ],
    specWide: ['potion'],
    presets: [
      { id: 'safe', label: 'Safe', help: '', values: { priority: 'safe' } },
      { id: DEFAULT_APL_PRESET, label: 'Mid', help: '', values: {} },
      { id: 'max', label: 'Max', help: '', values: { priority: 'max' } },
    ],
  }
  const tank = (saved: Record<string, string | number | boolean>) => activeAplPreset(TANK, TANK_OPTIONS, saved, undefined, NO_TALENTS)

  it('lists a default the spec names in its own place, with its own label', () => {
    expect(aplPresets(TANK).map((p) => [p.id, p.label])).toEqual([
      ['safe', 'Safe'],
      [DEFAULT_APL_PRESET, 'Mid'],
      ['max', 'Max'],
    ])
    expect(aplPresets(DEF)[0].label).toBe('Default')
  })

  it('reads a spec-wide setting a preset names as the preset’s: each stored value is its own preset', () => {
    expect(tank({})).toBe(DEFAULT_APL_PRESET)
    expect(tank({ priority: 'safe' })).toBe('safe')
    // Not the default, though every row resolves the same as with the priority at its default.
    expect(tank({ priority: 'max' })).toBe('max')
    expect(tank({ priority: 'max', 'a.on': true })).toBe(CUSTOM_APL_PRESET)
    expect(tank({ priority: 'max', potion: 50 })).toBe('max')
    // Picking one sets it, and picking the default puts it back to its default; the potion stays.
    expect(applyAplPreset(TANK, { priority: 'safe', 'b.on': false, potion: 50 }, 'max')).toEqual({ rotation: { potion: 50, priority: 'max' }, rotationOrder: undefined })
    expect(applyAplPreset(TANK, { priority: 'max', potion: 50 }, DEFAULT_APL_PRESET)).toEqual({ rotation: { potion: 50 }, rotationOrder: undefined })
  })
})

describe('every spec’s presets (decision D28, docs/ux.md "Rotation")', () => {
  const specs = (Object.keys(SPEC_META) as SpecId[]).flatMap((spec) => {
    const apl = rotationApl(spec)
    return apl ? [[spec, apl] as const] : []
  })

  it('name the default with the `default` id, with no values or order, and keep the line under the picker short', () => {
    // The three tanks have named rotations; Fury has none, only "Default".
    expect(specs.filter(([, apl]) => apl.presets.length > 0).map(([spec]) => spec).sort()).toEqual(['druid-feral-bear', 'paladin-protection', 'warrior-protection'])
    expect(aplPresets(rotationApl('warrior-fury')!).map((p) => p.label)).toEqual(['Default'])
    for (const [spec, apl] of specs) {
      if (apl.presets.length === 0) continue
      // A spec with named rotations (the tanks) names and places its default itself.
      const own = apl.presets.find((p) => p.id === DEFAULT_APL_PRESET)
      expect(own, spec).toBeDefined()
      expect([own!.values, own!.order], spec).toEqual([{}, undefined])
      for (const p of apl.presets) {
        // Three lines at most at 390 px (about 45 characters a line in the tab's small text).
        expect(p.summary, `${spec} ${p.id}`).toBeDefined()
        expect(p.summary!.length, `${spec} ${p.id}`).toBeLessThanOrEqual(125)
        expect(p.help.length, `${spec} ${p.id}`).toBeGreaterThan(p.summary!.length)
      }
    }
  })
})
