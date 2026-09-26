// The popular warrior builds that were the defaults until W4 (warrior.md §6.1): Fury 17/34/0, Arms
// 37/14/0 and Protection 8/5/38. Many of the worked examples (W1, W10, W18, W20, W21, W24, W26) and the
// mechanics tests were written for them, so those tests pin them rather than follow today's defaults.
import type { SimConfig, SpecId } from '../../types'

export const POPULAR_WARRIOR_TALENTS = {
  'warrior-fury': '30305013002-050530035150010051-',
  'warrior-arms': '30305213132515201-05050103-',
  'warrior-protection': '35-05-552101233301210531',
} as const satisfies Partial<Record<SpecId, string>>

/** A config with a warrior spec's popular build in place of today's default talents; other specs as they are. */
export function withPopularTalents<C extends Pick<SimConfig, 'spec' | 'talents'>>(config: C): C {
  const code = (POPULAR_WARRIOR_TALENTS as Partial<Record<SpecId, string>>)[config.spec]
  return code === undefined ? config : { ...config, talents: code }
}
