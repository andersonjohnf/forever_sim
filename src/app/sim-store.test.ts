// A spec switch cancels the run under way (docs/ux.md#states "Running", a user decision on #5):
// there's never a run going on out of sight, and a result never lands under another spec.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defaultConfig, normalizeConfig, type SimConfig, type SpecId } from '@/sim'

// The setup store persists to localStorage, which Node doesn't have.
const memory = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
})
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const { useSetup } = await import('./setup-store')
const { useSim } = await import('./sim-store')

const quick = (spec: SpecId): SimConfig => ({ ...normalizeConfig(defaultConfig(spec)).config, run: { mode: 'fixed', iterations: 2000, seed: 1 } })

beforeEach(() => {
  useSetup.setState({ config: quick('warrior-fury'), bySpec: {} })
  useSim.setState({ status: 'idle', progress: null, result: null, bySpec: {}, runKey: null, error: null, errorKey: null })
})

describe('a spec switch mid-run', () => {
  test('cancels it at once, and its result never lands', async () => {
    const run = useSim.getState().run(useSetup.getState().config)
    expect(useSim.getState().status).toBe('running')
    useSetup.getState().setSpec('warrior-arms')
    // At once: nothing renders the run as under way under Arms.
    expect(useSim.getState()).toMatchObject({ status: 'idle', progress: null, runKey: null })
    await run
    expect(useSim.getState().status).toBe('idle')
    expect(useSim.getState().bySpec).toEqual({})
  })

  test('keeps each spec’s last result: the cancelled spec’s, and the one switched to', async () => {
    await useSim.getState().run(useSetup.getState().config)
    const fury = useSim.getState().bySpec['warrior-fury']!.result
    useSetup.getState().setSpec('warrior-arms')
    await useSim.getState().run(useSetup.getState().config)
    const arms = useSim.getState().bySpec['warrior-arms']!.result
    useSetup.getState().setSpec('warrior-fury')

    const rerun = useSim.getState().run(useSetup.getState().config)
    useSetup.getState().setSpec('warrior-arms')
    expect(useSim.getState().status).toBe('done')
    await rerun
    expect(useSim.getState().bySpec['warrior-fury']!.result).toBe(fury)
    expect(useSim.getState().bySpec['warrior-arms']!.result).toBe(arms)
  })

  test('leaves a run alone when the setup changes but the spec doesn’t', async () => {
    const run = useSim.getState().run(useSetup.getState().config)
    useSetup.getState().update((c) => ({ ...c, race: 'horde-orc' }))
    expect(useSim.getState().status).toBe('running')
    await run
    expect(useSim.getState().bySpec['warrior-fury']).toBeDefined()
  })
})
