// Protection's rotation as a priority list (decisions D28, D31; docs/classes/warrior.md §5.4): the
// Defensive and Max TPS presets give the plans the rotation gave before the list, fight for fight.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { buildPlan } from '../../plan/build'
import type { SimConfig } from '../../types'
import { fingerprint, protectionCases } from './protection-apl-cases'
import { protectionRotation } from './protection'

const PRIORITY = 'warrior.protection.priority'
const noAura = () => -1
const CASES = protectionCases(200)

/** The case's settings with Priority forced, or left as drawn with a missing one as the old default, duties (Defensive). */
const withPriority = (values: Record<string, string | number | boolean>, priority?: string) => ({ ...values, [PRIORITY]: priority ?? values[PRIORITY] ?? 'duties' })

/** The whole setup's config for a case: the default Protection setup with its race, settings, phase, rules and consumables. */
function configOf(c: (typeof CASES)[number], priority?: string): SimConfig {
  const base = defaultConfig('warrior-protection')
  const buffs = base.buffs.enabled.filter((id) => id !== 'mightyRagePotion' && id !== 'jujuFlurry')
  return {
    ...base,
    race: c.race,
    rotation: withPriority(c.values, priority),
    buffs: { ...base.buffs, enabled: [...buffs, ...c.consumables] },
    fight: { ...base.fight, executePct: c.executePct },
    rules: { ...base.rules, profile: c.profile },
  }
}

describe('Protection’s priority list: Defensive and Max TPS as before the list (D28, D31)', () => {
  for (const [name, priority] of [
    ['as drawn, a missing Priority as Defensive', undefined],
    ['Defensive', 'duties'],
    ['Max TPS', 'maxTps'],
  ] as const) {
    it(`gives 200 random setups the rotation they had before the list: ${name}`, () => {
      // The snapshot is of the rotation before the priority list (ee171d2a): a change to it is a
      // change to what Protection plays.
      const hashes = CASES.map(({ values, talents, context }) => fingerprint(JSON.stringify(protectionRotation(withPriority(values, priority), talents, noAura, context))))
      expect(new Set(hashes).size).toBeGreaterThan(150)
      expect(hashes).toMatchSnapshot()
    })

    it(`gives 200 random whole setups the plan they had before the list: ${name}`, () => {
      const hashes = CASES.map((c) => fingerprint(JSON.stringify(buildPlan(configOf(c, priority)).plan)))
      expect(new Set(hashes).size).toBeGreaterThan(150)
      expect(hashes).toMatchSnapshot()
    })
  }
})
