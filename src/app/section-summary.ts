// The section tabs' summary lines at wide widths (decision D34; docs/ux.md "Section tabs"): under
// each tab's name, what its section holds, in a player's words, so the whole setup reads at a
// glance. Each line reuses the rule its own tab uses to say the same thing, so a summary never
// disagrees with the tab it sits under. Short enough for a sixth of the setup pane at 12 px:
// SUMMARY_MAX_CHARS.
import raceJson from '@/data/races/races.json'
import type { RaceData } from '@/data/races/types'
import { decodeTalentCode, pointsPerTree, type TalentRanksById } from '@/data/talents/types'
import { activeBuffPreset } from '@/features/buffs/active-preset'
import { slotsOffDefault } from '@/features/gear/default-set'
import { formatDuration } from '@/features/fight/duration'
import { aplPresets, CUSTOM_APL_PRESET, getSpec, hasThreatSet, rotationPreset, SPEC_META, TALENT_DATA, type RuleProfileId, type SimConfig } from '@/sim'
import type { Section } from './setup-store'

const raceData = raceJson as unknown as RaceData

/**
 * The longest a summary gets: about what fits under a tab at 12 px in a sixth of the setup pane at
 * 1440 px (912 px, D34's proposal), with room for the tab's padding.
 */
export const SUMMARY_MAX_CHARS = 24

/** The level of a raid boss, the Fight tab's default (docs/mechanics/encounter.md#encounter-settings). */
const RAID_BOSS_LEVEL = 63

/** The rule profiles as the Character tab names them. */
const PROFILE_LABEL: Record<RuleProfileId, string> = { forever: 'Forever', classicEra: 'Classic Era' }

/** What a summary line says for a setup the tab's own rule can't place: none of its presets. */
const CUSTOM = 'Custom'

/**
 * Character: the race, and the rules if they aren't Forever's ("Orc · Classic Era"). A Skyborne
 * race's full name with the rules would run past the tab ("Skyborne (High Order) · Classic Era"),
 * so that one drops its faction variant ("Skyborne · Classic Era"); the Character tab shows which.
 */
function characterSummary(config: Pick<SimConfig, 'race' | 'rules'>): string {
  const race = raceData.races.find((r) => r.id === config.race)
  const profile = config.rules.profile
  if (profile === 'forever') return race?.name ?? config.race
  const rules = PROFILE_LABEL[profile]
  const full = `${race?.name ?? config.race} · ${rules}`
  return full.length <= SUMMARY_MAX_CHARS || !race ? full : `${race.baseName} · ${rules}`
}

/**
 * Talents: the points in each tree, in the class's tree order ("17/34/0"), as the Talents tab counts
 * them. A code that doesn't decode counts as no points, as the tab shows it.
 */
function talentsSummary(config: Pick<SimConfig, 'spec' | 'talents'>): string {
  const data = TALENT_DATA[SPEC_META[config.spec].classId]
  let ranks: TalentRanksById = {}
  try {
    ranks = decodeTalentCode(data, config.talents)
  } catch {
    // The Talents tab shows an unreadable code as an empty build (talents-section.tsx safeDecode).
  }
  return pointsPerTree(data, ranks).join('/')
}

/**
 * Gear: the default set's name while every slot holds it, else how many slots differ, by the Gear
 * tab's own comparison (slotsOffDefault). A tank's default is its threat set, as the tab says.
 */
function gearSummary(config: Pick<SimConfig, 'spec' | 'race' | 'gear'>): string {
  const off = slotsOffDefault(config).length
  if (off === 0) return hasThreatSet(config.spec) ? 'Threat set' : 'Pre-raid best in slot'
  return `${off} ${off === 1 ? 'slot' : 'slots'} changed`
}

/** Buffs: the preset the Buffs tab's picker shows, or Custom when it matches none. */
function buffsSummary(config: Pick<SimConfig, 'spec' | 'talents' | 'rotation' | 'buffs'>): string {
  return activeBuffPreset(config)?.name ?? CUSTOM
}

/** Rotation: the preset the Rotation tab's picker shows ("Default", "Balanced"), or Custom. */
function rotationSummary(config: Pick<SimConfig, 'spec' | 'talents' | 'rotation' | 'rotationOrder' | 'race'>): string {
  const apl = getSpec(config.spec).rotationApl
  const id = rotationPreset(config)
  if (!apl || id === undefined || id === CUSTOM_APL_PRESET) return CUSTOM
  return aplPresets(apl).find((p) => p.id === id)?.label ?? CUSTOM
}

/** Fight: the length as the Fight tab shows it ("3:00"), and the boss's level when it isn't a raid boss's. */
function fightSummary(config: Pick<SimConfig, 'fight'>): string {
  const { durationSec, bossLevel } = config.fight
  const length = formatDuration(durationSec)
  return bossLevel === RAID_BOSS_LEVEL ? length : `${length} · level ${bossLevel}`
}

/** Each section tab's summary line for a setup (decision D34). */
export function sectionSummaries(config: SimConfig): Record<Section, string> {
  return {
    character: characterSummary(config),
    talents: talentsSummary(config),
    gear: gearSummary(config),
    buffs: buffsSummary(config),
    rotation: rotationSummary(config),
    fight: fightSummary(config),
  }
}
