// Your setup's lines in the wide panel (decision D34; docs/ux.md "Your setup's lines",
// src/app/setup-summary.tsx): under each section's name, what it holds, in a player's words, so the
// whole setup reads at a glance. Each line reuses the rule its own tab uses to say the same thing,
// so a summary never disagrees with its section. Short enough for a line of Your setup at 1440 px:
// SUMMARY_MAX_CHARS.
import raceJson from '@/data/races/races.json'
import type { RaceData } from '@/data/races/types'
import { decodeTalentCode, pointsPerTree, type TalentRanksById } from '@/data/talents/types'
import { activeBuffPreset } from '@/features/buffs/active-preset'
import { slotsOffDefault } from '@/features/gear/default-set'
import { formatDuration } from '@/features/fight/duration'
import { aplPresets, CUSTOM_APL_PRESET, defaultConfig, getSpec, hasThreatSet, rotationPreset, SPEC_META, TALENT_DATA, type RuleProfileId, type SimConfig } from '@/sim'
import type { Section } from './setup-store'

const raceData = raceJson as unknown as RaceData

/**
 * The longest a summary gets: what fits on one line at 14 px in a column of Your setup at 1440 px
 * (half the 30 rem panel, less the line's padding), with a classic scrollbar. Measured: the column
 * holds 216 px, and the longest real lines, 30 characters ("Tauren · Classic Era · changed"), take
 * about 195 (e2e/wide-panel.spec.ts holds every real line to it).
 */
export const SUMMARY_MAX_CHARS = 30

/** The level of a raid boss, the Fight tab's default (docs/mechanics/encounter.md#encounter-settings). */
const RAID_BOSS_LEVEL = 63

/** The rule profiles as the Character tab names them. */
const PROFILE_LABEL: Record<RuleProfileId, string> = { forever: 'Forever', classicEra: 'Classic Era' }

/** What a summary line says for a setup the tab's own rule can't place: none of its presets. */
const CUSTOM = 'Custom'

/**
 * What a line adds when its tab has a setting changed from its default that the line doesn't name
 * (review finding DL2-6): "Human · changed", "3:00 · changed". It says there's more to see there,
 * as the tab's own "Changed. Default: …" hints do, without listing it.
 */
const CHANGED = 'changed'

/** The first of a line's forms, fullest first, that fits its line; the last, shortest, otherwise. */
function fit(forms: readonly string[]): string {
  return forms.find((form) => form.length <= SUMMARY_MAX_CHARS) ?? forms[forms.length - 1]
}

/** Each spec's default setup, whose Character and Fight settings the lines compare with, as their tabs do. */
const DEFAULTS = new Map<SimConfig['spec'], SimConfig>()
const defaultsOf = (spec: SimConfig['spec']): SimConfig => {
  let config = DEFAULTS.get(spec)
  if (!config) DEFAULTS.set(spec, (config = defaultConfig(spec)))
  return config
}

/**
 * Whether a Character setting the line doesn't name differs from the spec's default, by the
 * Character tab's own tests (src/features/character/character-section.tsx, its Advanced count less
 * the rules profile, which the line names): the untested ratings, a paladin's Judgement of the
 * Crusader rule and a Protection paladin's Hammer of the Righteous rule.
 */
function characterChanged(config: Pick<SimConfig, 'spec' | 'rules'>): boolean {
  const rules = config.rules
  const defaults = defaultsOf(config.spec).rules
  const paladin = SPEC_META[config.spec].classId === 'paladin'
  return (
    rules.unmeasuredRatings !== defaults.unmeasuredRatings ||
    (paladin && (rules.jotcBonus ?? 'coefficient') !== (defaults.jotcBonus ?? 'coefficient')) ||
    (config.spec === 'paladin-protection' && (rules.hotrWeaponDps ?? 'withAttackPower') !== (defaults.hotrWeaponDps ?? 'withAttackPower'))
  )
}

/**
 * Character: the race, and the rules if they aren't Forever's ("Orc · Classic Era"), and "changed"
 * when another of the tab's settings differs from its default ("Human · changed"). A Skyborne race's
 * full name with the rules would run past its line ("Skyborne (High Order) · Classic Era"), so that
 * one drops its faction variant ("Skyborne · Classic Era"); the Character tab shows which. Where
 * "changed" still doesn't fit, the rules give way to it: it's the one that says to look.
 */
function characterSummary(config: Pick<SimConfig, 'spec' | 'race' | 'rules'>): string {
  const race = raceData.races.find((r) => r.id === config.race)
  const name = race?.name ?? config.race
  const base = race?.baseName ?? name
  const profile = config.rules.profile
  const rules = profile === 'forever' ? [] : [PROFILE_LABEL[profile]]
  const changed = characterChanged(config) ? [CHANGED] : []
  const line = (...parts: string[]) => parts.join(' · ')
  return fit([line(name, ...rules, ...changed), line(base, ...rules, ...changed), ...(changed.length > 0 ? [line(name, CHANGED), line(base, CHANGED)] : [])])
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
 * Gear: the default set's name while every slot holds it, "No gear" with every slot empty (as after
 * Remove all gear), else how many slots differ, by the Gear tab's own comparison (slotsOffDefault).
 * A tank's default is its threat set, as the tab says.
 */
function gearSummary(config: Pick<SimConfig, 'spec' | 'race' | 'gear'>): string {
  const off = slotsOffDefault(config).length
  if (off === 0) return hasThreatSet(config.spec) ? 'Threat set' : 'Pre-raid best in slot'
  if (Object.values(config.gear).every((item) => !item)) return 'No gear'
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

/** The classes whose Fight tab has the execute phase: those with an ability it unlocks (fight-section.tsx EXECUTE_ABILITY). */
const EXECUTE_CLASSES: ReadonlySet<string> = new Set(['warrior', 'paladin'])

/**
 * Whether a Fight setting the line doesn't name differs from the spec's default, by the Fight tab's
 * own tests (its `changed` in src/features/fight/fight-section.tsx, less the length and the boss's
 * level, which the line names), each only where the tab shows it: the execute phase for a warrior or
 * paladin, the damage a DPS warrior takes, and the boss's swings for a tank.
 */
function fightChanged(config: Pick<SimConfig, 'spec' | 'fight' | 'run'>): boolean {
  const meta = SPEC_META[config.spec]
  const { fight, run } = config
  const defaults = defaultsOf(config.spec)
  const def = defaults.fight
  const tank = meta.role === 'tank'
  const execute = EXECUTE_CLASSES.has(meta.classId)
  const boss = fight.boss
  return (
    fight.bossArmor !== def.bossArmor ||
    fight.position !== def.position ||
    (execute && fight.executePct > 0 !== def.executePct > 0) ||
    (execute && fight.executePct > 0 && fight.executePct !== def.executePct) ||
    run.mode !== defaults.run.mode ||
    (run.mode === 'fixed' && run.iterations !== defaults.run.iterations) ||
    run.seed !== defaults.run.seed ||
    fight.durationVariationPct !== def.durationVariationPct ||
    fight.creatureType !== def.creatureType ||
    fight.zone !== def.zone ||
    (!tank && meta.classId === 'warrior' && fight.damageTakenPerSec !== def.damageTakenPerSec) ||
    (tank &&
      (boss.swingSpeedSec !== def.boss.swingSpeedSec ||
        boss.damageMin !== def.boss.damageMin ||
        boss.damageMax !== def.boss.damageMax ||
        (['canCrush', 'parryHaste', 'canDodge', 'canParry', 'canBlock'] as const).some((key) => boss[key] !== def.boss[key])))
  )
}

/**
 * Fight: the length as the Fight tab shows it ("3:00"), the boss's level when it isn't a raid boss's
 * ("3:00 · level 62"), and "changed" when another of the tab's settings differs from its default
 * ("3:00 · changed"). Where both don't fit, the level gives way to "changed", which it's one of.
 */
function fightSummary(config: Pick<SimConfig, 'spec' | 'fight' | 'run'>): string {
  const { durationSec, bossLevel } = config.fight
  const length = formatDuration(durationSec)
  const level = bossLevel === RAID_BOSS_LEVEL ? [] : [`level ${bossLevel}`]
  const line = (...parts: string[]) => parts.join(' · ')
  if (!fightChanged(config)) return line(length, ...level)
  return fit([line(length, ...level, CHANGED), line(length, CHANGED)])
}

/** Each section's line in Your setup, for a setup (decision D34). */
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
