// docs/doctrine.md §2, "The fallback order": the order is stated once, there (gate step 6,
// 2026-09-26). CLAUDE.md and the builder agent carry only its one-line sentence, copied verbatim,
// so the three can't drift apart; the other docs point to it instead of restating it.
import { describe, expect, it } from 'vitest'
import builderMd from '../../.claude/agents/builder.md?raw'
import reviewerMd from '../../.claude/agents/reviewer.md?raw'
import claudeMd from '../../CLAUDE.md?raw'
import decisionsMd from '../../docs/decisions.md?raw'
import doctrineMd from '../../docs/doctrine.md?raw'
import milestonesMd from '../../docs/milestones.md?raw'
import readmeMd from '../../README.md?raw'

/** Markdown with its line breaks and indentation folded to single spaces. */
const flat = (md: string) => md.replace(/\s+/g, ' ')

const MARKER = 'In one line, which CLAUDE.md and the builder agent copy verbatim: '

/** The doctrine's one-line sentence: from after the marker to the end of its sentence. */
function sentence(): string {
  const text = flat(doctrineMd)
  const at = text.indexOf(MARKER)
  expect(at, 'doctrine §2 marks its one-line sentence').toBeGreaterThan(-1)
  const rest = text.slice(at + MARKER.length)
  return rest.slice(0, rest.indexOf('assumptions.') + 'assumptions.'.length)
}

describe("doctrine §2's fallback order, stated once", () => {
  it('has a one-line sentence naming all five steps in order', () => {
    const s = sentence()
    const steps = ['an allowed source', "an outside player's in-game measurement", 'the closest similar value', "another sim's value", 'then zero']
    const at = steps.map((step) => s.indexOf(step))
    for (const [i, step] of steps.entries()) expect(at[i], step).toBeGreaterThan(-1)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('appears verbatim in CLAUDE.md and the builder agent', () => {
    const s = sentence()
    expect(flat(claudeMd)).toContain(s)
    expect(flat(builderMd)).toContain(s)
  })

  // The paraphrases the step 6 simplification cut: each doc now points to §2 instead.
  it('is not restated elsewhere', () => {
    const docs = { 'CLAUDE.md': claudeMd, 'builder.md': builderMd, 'reviewer.md': reviewerMd, 'decisions.md': decisionsMd, 'milestones.md': milestonesMd, 'README.md': readmeMd }
    for (const [name, md] of Object.entries(docs)) {
      const text = flat(md)
      expect(text, name).not.toMatch(/last resort before zero/i)
      expect(text, name).not.toMatch(/closest similar known value/i)
      expect(text, name).not.toMatch(/\(3\) the closest/i)
    }
  })
})
