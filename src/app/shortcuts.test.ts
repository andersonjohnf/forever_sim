import { describe, expect, it, vi } from 'vitest'
import { commitField, formOpen, handleSimulateShortcut, isSimulateShortcut, isTextEntry, type ShortcutDocument, type ShortcutEvent } from './shortcuts'

// docs/ux.md#accessibility: Ctrl+Enter or ⌘+Enter runs Simulate from anywhere, a field included,
// committing the field first, but not while a form is open over the page. The unit tests run without
// a DOM, so the elements and the document here are stand-ins with just what the handler reads.

const key = (over: Partial<ShortcutEvent> = {}) => ({
  key: 'Enter',
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
  ...over,
  preventDefault: vi.fn<() => void>(),
  stopPropagation: vi.fn<() => void>(),
})

interface FakeElement {
  tagName: string
  type?: string
  isContentEditable?: boolean
  attrs?: Record<string, string>
  /** For a dialog: whether it holds a form control. */
  hasForm?: boolean
  log?: string[]
}

const element = (e: FakeElement) =>
  ({
    ...e,
    getAttribute: (name: string) => e.attrs?.[name] ?? null,
    querySelector: () => (e.hasForm ? {} : null),
    blur: () => e.log?.push('blur'),
    focus: (options?: FocusOptions) => e.log?.push(`focus ${JSON.stringify(options)}`),
  }) as unknown as Element

/** A document with a focused element, the open dialogs, and whether a menu or list is open. */
const doc = ({ active = null, dialogs = [], choosing = false }: { active?: Element | null; dialogs?: Element[]; choosing?: boolean } = {}) =>
  ({
    activeElement: active,
    querySelector: () => (choosing ? {} : null),
    querySelectorAll: () => dialogs,
  }) as unknown as ShortcutDocument

const target = (busy = false, log: string[] = []) => ({ busy: () => busy, run: vi.fn(() => log.push('run')) })

describe('isSimulateShortcut', () => {
  it('is Ctrl+Enter or ⌘+Enter', () => {
    expect(isSimulateShortcut(key())).toBe(true)
    expect(isSimulateShortcut(key({ ctrlKey: false, metaKey: true }))).toBe(true)
  })

  it('needs the modifier: Enter alone is the focused control’s (WCAG 2.1.4)', () => {
    expect(isSimulateShortcut(key({ ctrlKey: false }))).toBe(false)
    expect(isSimulateShortcut(key({ key: 'a' }))).toBe(false)
  })

  it('isn’t another chord, a key held down, or Enter ending an IME composition', () => {
    expect(isSimulateShortcut(key({ altKey: true }))).toBe(false)
    expect(isSimulateShortcut(key({ shiftKey: true }))).toBe(false)
    expect(isSimulateShortcut(key({ repeat: true }))).toBe(false)
    expect(isSimulateShortcut(key({ isComposing: true }))).toBe(false)
  })
})

describe('isTextEntry', () => {
  it('is a field you type in', () => {
    expect(isTextEntry(element({ tagName: 'INPUT', type: 'text' }))).toBe(true)
    expect(isTextEntry(element({ tagName: 'INPUT', type: 'number' }))).toBe(true)
    expect(isTextEntry(element({ tagName: 'INPUT', type: '' }))).toBe(true)
    expect(isTextEntry(element({ tagName: 'TEXTAREA' }))).toBe(true)
    expect(isTextEntry(element({ tagName: 'DIV', isContentEditable: true }))).toBe(true)
  })

  it('isn’t a button, a switch, a slider or nothing', () => {
    expect(isTextEntry(element({ tagName: 'BUTTON' }))).toBe(false)
    expect(isTextEntry(element({ tagName: 'INPUT', type: 'checkbox' }))).toBe(false)
    expect(isTextEntry(element({ tagName: 'INPUT', type: 'range' }))).toBe(false)
    expect(isTextEntry(element({ tagName: 'SPAN', isContentEditable: false }))).toBe(false)
    expect(isTextEntry(null)).toBe(false)
  })
})

describe('formOpen', () => {
  it('is false on the page alone, and with a sheet that has no form (the phone’s results)', () => {
    expect(formOpen(doc())).toBe(false)
    expect(formOpen(doc({ dialogs: [element({ tagName: 'DIV', attrs: { 'data-state': 'open' } })] }))).toBe(false)
  })

  it('is true with a sheet, dialog or popover holding a form, or a menu or list open', () => {
    expect(formOpen(doc({ dialogs: [element({ tagName: 'DIV', attrs: { 'data-state': 'open' }, hasForm: true })] }))).toBe(true)
    expect(formOpen(doc({ choosing: true }))).toBe(true)
  })

  it('ignores a dialog on its way out', () => {
    expect(formOpen(doc({ dialogs: [element({ tagName: 'DIV', attrs: { 'data-state': 'closed' }, hasForm: true })] }))).toBe(false)
  })
})

describe('commitField', () => {
  it('commits a field by leaving it, then gives it focus back without scrolling', () => {
    const log: string[] = []
    commitField(element({ tagName: 'INPUT', type: 'text', log }))
    expect(log).toEqual(['blur', 'focus {"preventScroll":true}'])
  })

  it('leaves a button’s focus alone', () => {
    const log: string[] = []
    commitField(element({ tagName: 'BUTTON', log }))
    expect(log).toEqual([])
  })
})

describe('handleSimulateShortcut', () => {
  it('commits the focused field, then runs, and takes the key', () => {
    const log: string[] = []
    const event = key()
    const sim = target(false, log)
    expect(handleSimulateShortcut(event, doc({ active: element({ tagName: 'INPUT', type: 'text', log }) }), sim)).toBe(true)
    expect(log).toEqual(['blur', 'focus {"preventScroll":true}', 'run'])
    expect(event.preventDefault).toHaveBeenCalledOnce()
    // Stopped, so a focused Select's trigger or drag handle doesn't also act on Enter (DL-3).
    expect(event.stopPropagation).toHaveBeenCalledOnce()
  })

  it('runs from a button or the page too', () => {
    const sim = target()
    expect(handleSimulateShortcut(key({ ctrlKey: false, metaKey: true }), doc({ active: element({ tagName: 'BUTTON' }) }), sim)).toBe(true)
    expect(handleSimulateShortcut(key(), doc(), sim)).toBe(true)
    expect(sim.run).toHaveBeenCalledTimes(2)
  })

  it('does nothing while a run is under way, over a form, for another key, or for a key already handled', () => {
    const form = [element({ tagName: 'DIV', attrs: { 'data-state': 'open' }, hasForm: true })]
    for (const [event, document, busy] of [
      [key(), doc(), true],
      [key(), doc({ dialogs: form }), false],
      [key(), doc({ choosing: true }), false],
      [key({ ctrlKey: false }), doc(), false],
      [key({ defaultPrevented: true }), doc(), false],
    ] as const) {
      const log: string[] = []
      const sim = target(busy, log)
      expect(handleSimulateShortcut(event, document, sim)).toBe(false)
      expect(sim.run).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(event.stopPropagation).not.toHaveBeenCalled()
    }
  })
})
