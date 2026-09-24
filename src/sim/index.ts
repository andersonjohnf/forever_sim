// The engine's public API: the only module the UI imports from src/sim
// (docs/architecture.md#data-flow). Keep these signatures stable.
import type { ClassSlug } from '@/data/races/types'
import { classSetup, talentRanksByName } from './classes'
import { resolveRotationValues } from './classes/options'
import { fixedRotationRows, maintainedBuffs, othersKeepBleeding, ROTATION_GROUPS, rotationDefaultsNote, rotationOptions, unusedSettings } from './classes/rotation'
import { raceName } from './equip'
import { normalizeConfig } from './config/normalize'
import { TALENT_DATA } from './defaults'
import { BUFFS } from './effects/buffs'
import { ENCHANTS } from './effects/enchants'
import { ITEM_EFFECTS, itemEffectsApply } from './effects/items'
import { filledBuffGroups, presetBuffIds } from './effects/presets'
import { catalogueEffects, catalogueSummary } from './effects/types'
import { buildPlan, UnsupportedSetupError, wieldsShield } from './plan/build'
import { toResult } from './run/aggregate'
import { type ChunkExecutor, drive } from './run/driver'
import { localExecutor } from './run/local'
import { WorkerPool } from './run/pool'
import { PROFILES } from './rules/profiles'
import { SPEC_IDS, SPEC_META } from './specs'
import type {
  BuffDefinition,
  BuffPreset,
  CharacterSheet,
  EnchantDefinition,
  RotationGroup,
  RotationRequirement,
  RotationValue,
  RuleProfileId,
  SimConfig,
  SimProgress,
  SimResult,
  SpecDefinition,
  SpecId,
} from './types'

export * from './types'
export { CLASS_COLOR, SPEC_IDS, SPEC_META } from './specs'
export { defaultConfig, FULL_RAID, TALENT_DATA, talentPresets, type TalentPreset } from './defaults'
export { canUse, fitsFaction, fitsSlot, isTwoHand, itemFaction, PROFICIENCY, uniqueConflicts, type UniqueConflict } from './equip'
export { normalizeConfig } from './config/normalize'
// The boss → player table's constants, for the results to explain it (docs/mechanics/combat-tables.md#8-boss--player-tanks).
export { CRUSH_MIN_LEVEL_GAP, DEFENSE_PER_POINT, mobSkill, PLAYER_LEVEL } from './core/attack-table'

/**
 * Specs whose sim and UI are complete (docs/ux.md principle 8): Fury from M2.2c, Arms from M2.3c,
 * Protection, the first tank, from P2, the Feral cat from B2, Retribution from C2, the Protection
 * paladin from C3, the Feral bear from B4, the Enhancement shaman from S1, the three rogues from R1, the
 * three mages from K2, the Destruction and Affliction warlocks from K3, and the Elemental shaman from K5.
 */
const AVAILABLE: ReadonlySet<SpecId> = new Set([
  'warrior-fury',
  'warrior-arms',
  'warrior-protection',
  'druid-feral-cat',
  'druid-feral-bear',
  'paladin-retribution',
  'paladin-protection',
  // docs/classes/shaman.md: landed under D27's first-pass defaults (S1, K5).
  'shaman-enhancement',
  'shaman-elemental',
  'rogue-combat',
  'rogue-assassination',
  'rogue-subtlety',
  // docs/classes/mage.md: landed under D27's first-pass defaults (K2).
  'mage-fire',
  'mage-frost',
  'mage-arcane',
  // docs/classes/warlock.md: landed under D27's first-pass defaults (K3).
  'warlock-destruction',
  'warlock-affliction',
])

/**
 * Every spec with its engine-declared options. `available` flips when the spec's sim and UI are
 * complete (docs/ux.md principle 8).
 */
export const specs: SpecDefinition[] = SPEC_IDS.map((id) => ({
  ...SPEC_META[id],
  available: AVAILABLE.has(id),
  rotationOptions: rotationOptions(id),
  rotationDefaults: rotationDefaultsNote(id),
  rotationFixed: fixedRotationRows(id),
}))

export function getSpec(id: SpecId): SpecDefinition {
  const spec = specs.find((s) => s.id === id)
  if (!spec) throw new Error(`Unknown spec ${id}`)
  return spec
}

/**
 * The Rotation tab's headings in the order it shows them; each spec's settings name theirs in
 * `RotationOption.group` (docs/ux.md "Rotation").
 */
export const rotationGroups: readonly RotationGroup[] = ROTATION_GROUPS

/**
 * Every rotation setting's value for a setup: the saved one, or the option's default for this
 * setup, which can follow the build's talents or another setting (Arms: Rend with Bloodthrill,
 * Whirlwind in Berserker Stance; docs/classes/warrior.md §5.3). The plan uses the same values.
 */
export function rotationValues(config: Pick<SimConfig, 'spec' | 'talents' | 'rotation'>): Record<string, RotationValue> {
  const classId = SPEC_META[config.spec].classId
  return resolveRotationValues(rotationOptions(config.spec), config.rotation, talentRanksByName(TALENT_DATA[classId], config.talents))
}

/**
 * Rotation settings that can't do anything in this setup, each with the note the Rotation tab shows
 * under it, "Not used: …" (docs/ux.md "Rotation"): the racial cooldown for a race without one the
 * sim uses, the cat's Rake or Rip and the bear's Lacerate when "only when nothing else bleeds" meets
 * a raid whose warriors keep the boss bleeding, and the bear's Demoralizing Roar while the Buffs
 * tab's Demoralizing Shout takes its place. The Buffs tab is read as the plan reads it.
 */
export function unusedRotationSettings(config: Pick<SimConfig, 'spec' | 'talents' | 'rotation' | 'race' | 'buffs'>): Record<string, string> {
  const values = rotationValues(config)
  return unusedSettings(config.spec, values, {
    race: config.race,
    raceName: raceName(config.race),
    othersBleed: othersKeepBleeding(config.buffs.raid),
    buffGroups: filledBuffGroups(config.buffs.enabled, config.buffs.raid, config.spec, [...maintainedBuffs(config.spec, values), ...talentBuffs(config)]),
    talents: talentRanksByName(TALENT_DATA[SPEC_META[config.spec].classId], config.talents),
  })
}

/**
 * Buff catalogue ids the talent build provides itself (a druid's Leader of the Pack, druid.md §2.3):
 * the plan leaves the Buffs tab's copy out, so the tab shows it on and locked, as it does a buff the
 * rotation keeps up (docs/ux.md "Buffs").
 */
export function talentBuffs(config: Pick<SimConfig, 'spec' | 'talents'>): string[] {
  const classId = SPEC_META[config.spec].classId
  return classSetup(classId, config.spec, config.talents, PROFILES.forever).replacesBuffs ?? []
}

/**
 * What a rotation switch needs (`RotationOption.requires`) that the setup lacks: its talent, a
 * shield, or both; empty when it has them. The engine never uses such an ability (warrior.md §7),
 * and the Rotation tab says where to get it (docs/ux.md "Rotation").
 */
export function unmetRequirements(
  config: Pick<SimConfig, 'spec' | 'talents' | 'gear'>,
  requires: RotationRequirement,
): { talent?: string; shield?: boolean } {
  const unmet: { talent?: string; shield?: boolean } = {}
  const classId = SPEC_META[config.spec].classId
  if (requires.talent !== undefined && !((talentRanksByName(TALENT_DATA[classId], config.talents).get(requires.talent) ?? 0) > 0)) unmet.talent = requires.talent
  if (requires.shield && !wieldsShield(config.gear)) unmet.shield = true
  return unmet
}

/** A catalogue per rule profile: each entry's summary is the profile's (`catalogueSummary`). */
function perProfile<T>(build: (profile: RuleProfileId) => T): Record<RuleProfileId, T> {
  return { forever: build('forever'), classicEra: build('classicEra') }
}

/** Its effects act only on the boss's melee swings: an attack-power debuff or a slow (encounter.md §5). */
const onBossMeleeOnly = (b: (typeof BUFFS)[number]) => {
  const effects = catalogueEffects(b, PROFILES.forever)
  return effects.length > 0 && effects.every((e) => e.kind === 'bossAp' || e.kind === 'bossSlow')
}

const BUFF_CATALOGUES = perProfile((profile): BuffDefinition[] =>
  BUFFS.map((b) => ({
    id: b.id,
    name: b.name,
    icon: b.icon,
    category: b.category,
    group: b.group,
    summary: catalogueSummary(b, PROFILES[profile]),
    ...(b.providedBy ? { providedBy: b.providedBy } : {}),
    ...(b.selfCast ? { selfCast: true } : {}),
    ...(b.forClasses ? { forClasses: b.forClasses } : {}),
    ...(b.forSpecs ? { forSpecs: b.forSpecs } : {}),
    ...(b.exclusiveGroup ? { exclusiveGroup: b.exclusiveGroup } : {}),
    ...(onBossMeleeOnly(b) ? { bossMelee: true as const } : {}),
    docRef: b.docRef,
  })),
)

/**
 * Raid buffs, target debuffs and consumables (docs/mechanics/buffs-debuffs-consumables.md), with
 * Forever's summaries. To show a setup's numbers, use `buffCatalogueFor(config.rules.profile)`.
 */
export const buffCatalogue: BuffDefinition[] = BUFF_CATALOGUES.forever

/**
 * The buff catalogue with each entry's summary under a rule profile: Classic Era's numbers where
 * they differ (buffs doc, Classic Era values). The same array for a profile every time.
 */
export function buffCatalogueFor(profile: RuleProfileId): BuffDefinition[] {
  return BUFF_CATALOGUES[profile]
}

export const buffPresets: BuffPreset[] = [
  { id: 'self', name: 'Self only', description: 'Your own buffs, no group.' },
  { id: 'dungeon', name: 'Dungeon group', description: 'A five-player group and basic consumables.' },
  { id: 'raid', name: 'Standard raid', description: 'Raid buffs and common consumables.' },
  { id: 'max', name: 'Max consumables', description: 'Raid buffs and every consumable that helps.' },
]

export { buffProvided, forSpecClass, unusedBuffs } from './effects/presets'

/** The buff ids a preset enables for a spec, given the raid composition (buffs doc §6). */
export function presetBuffs(preset: BuffPreset['id'], spec: SpecId, raid: ClassSlug[]): string[] {
  return presetBuffIds(preset, spec, raid)
}

const ENCHANT_CATALOGUES = perProfile((profile): EnchantDefinition[] =>
  ENCHANTS.map((e) => ({ id: e.id, name: e.name, slots: e.slots, requires: e.requires, summary: catalogueSummary(e, PROFILES[profile]), docRef: e.docRef })),
)

/**
 * Enchants per slot (docs/mechanics/buffs-debuffs-consumables.md#5-enchants-and-item-enhancements),
 * with Forever's summaries. To show a setup's numbers, use `enchantCatalogueFor(config.rules.profile)`.
 */
export const enchantCatalogue: EnchantDefinition[] = ENCHANT_CATALOGUES.forever

/** The enchant catalogue with each summary under a rule profile, as `buffCatalogueFor`. */
export function enchantCatalogueFor(profile: RuleProfileId): EnchantDefinition[] {
  return ENCHANT_CATALOGUES[profile]
}

/**
 * Which of an item's effects the engine models, read the way the plan builder reads its item-effect
 * overrides (`sim/effects/items.ts`): `equip`, its equip and chance-on-hit effects and extra weapon
 * damage (an override replaces what the tooltip says); `use`, its use effect, as a cast a rotation
 * can press. The plan lists every other effect as not simulated. With a spec, an equip effect that
 * names only other specs' abilities (Idol of Brutality's Maul and Swipe, for a cat) counts as
 * modelled: there's nothing in it to simulate.
 */
export function modelledItemEffects(itemId: number, spec?: SpecId): { equip: boolean; use: boolean } {
  const override = ITEM_EFFECTS[itemId]
  // An equip effect that names only another spec's abilities has nothing to simulate for this one.
  const irrelevant = spec !== undefined && !itemEffectsApply(itemId, spec)
  return { equip: override !== undefined || irrelevant, use: override?.use !== undefined }
}

/** Final character stats for a config, synchronously (docs/mechanics/character-stats.md). */
export function computeSheet(config: SimConfig): CharacterSheet | null {
  try {
    return buildPlan(normalizeConfig(config).config).sheet
  } catch {
    return null
  }
}

let pool: WorkerPool | null = null

function executorFor(plan: Parameters<typeof localExecutor>[0]): ChunkExecutor {
  if (WorkerPool.supported()) {
    try {
      pool ??= new WorkerPool(WorkerPool.defaultSize())
      return pool.executor(plan)
    } catch {
      pool = null
    }
  }
  return localExecutor(plan)
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0)

/**
 * Runs the simulation in Web Workers (or on this thread where there are none). Adaptive by
 * default: it stops once every headline metric's 95% CI is within 0.25% of its mean: DPS, or TPS
 * and DPS for tank specs (decisions D15, D18).
 * Rejects with an AbortError if the signal aborts, and with a plain message if the setup can't be
 * simulated yet.
 */
export async function simulate(
  config: SimConfig,
  options: { onProgress?: (progress: SimProgress) => void; signal?: AbortSignal } = {},
): Promise<SimResult> {
  const start = now()
  const normalized = normalizeConfig(config).config
  const bundle = buildPlan(normalized)
  if (bundle.blockers.length > 0) throw new UnsupportedSetupError(bundle.blockers[0])
  const agg = await drive(bundle.plan, executorFor(bundle.plan), {
    mode: normalized.run.mode,
    iterations: normalized.run.iterations,
    onProgress: options.onProgress,
    signal: options.signal,
  })
  return toResult(bundle, agg, now() - start)
}
