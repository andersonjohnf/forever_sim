// The builds that succeed the codes the sim itself shipped on older talent trees
// (docs/data/talents.md#tree-versions). Mapping by name refunds what a new build's trees have no
// place for, which is right for a player's own build but cripples one of the sim's defaults (the old
// Retribution default lost 16 points). So a code the sim shipped, a default or a preset frozen in
// scripts/scrape/stored-builds.json's `legacy`, reads as its current version instead: today's
// default, today's preset of that name, or the same digits on today's trees. Only those exact codes:
// a player's own build keeps the name mapping and its refunds.
import { decodeTalentCode, encodeTalentCode, validateTalentBuild, type TalentData } from '@/data/talents/types'
import { defaultTalents, talentPresets } from '../defaults'
import { SPEC_META } from '../specs'
import type { ClassId, SpecId } from '../types'
import { canonicalFrozenCode, migrateTalentCode, TALENT_TREES_OF_VERSION, type TalentMigration } from './talent-trees'

/**
 * What a shipped code became: a spec's default (read from today's defaults, so a later default
 * change carries through), a class preset by name (likewise), the same digits on today's trees (a
 * former default no preset keeps), or its mapping by name, which already keeps every point.
 * `label` names the old build in the notice ("the Protection popular build").
 */
export type Successor = { default: SpecId } | { preset: string; label: string } | { same: string } | { byName: string }

/** By frozen build, class and exact code: every code in stored-builds.json's `legacy` (a unit test checks it's all of them). */
export const TALENT_SUCCESSORS: Readonly<Record<string, Partial<Record<ClassId, Readonly<Record<string, Successor>>>>>> = {
  '1.60.1.69913': {
    warrior: {
      '30305013002-050530035150010051-': { default: 'warrior-fury' },
      '30305013-050520035150310051-': { preset: 'Fury + Precision', label: 'the Fury + Precision build' },
      '30305213132515201-05050103-': { default: 'warrior-arms' },
      '35-05-552101233301210531': { default: 'warrior-protection' },
      '05-05-552131233301210531': { preset: 'Protection + Improved Thunder Clap', label: 'the Protection + Improved Thunder Clap build' },
      '05-05-552001233201210531': { same: 'a former Protection default' },
      '32-05-552001233201210531': { same: 'a former Protection preset' },
    },
    druid: {
      '050022-5520002123032213051-05': { default: 'druid-feral-cat' },
      '050022-5520032023132210551-': { default: 'druid-feral-bear' },
      '050012-5523032120132210551-': { same: 'a former Feral bear default' },
      '5532220115501351-05-': { default: 'druid-balance' },
      '05302001-05-5050035103113251': { same: 'the Restoration build' },
    },
    paladin: {
      '250003-503-052052310012330321': { default: 'paladin-retribution' },
      '240003-0530213321301551-502': { default: 'paladin-protection' },
      '-0530513321301551-50215': { same: 'a former Protection default' },
      '2-4530013321301551-50205': { same: 'a former Protection default' },
      '2-4530513321301551-502': { preset: 'Protection popular build', label: 'the Protection popular build' },
      '005320213225131051-5032-05': { byName: 'the Holy build' },
    },
    shaman: {
      '050003-055030031005102251-05005': { default: 'shaman-enhancement' },
      '5504301500103031-04-053250000001': { default: 'shaman-elemental' },
    },
    rogue: {
      '005303105001-32502300001515231-': { default: 'rogue-combat' },
      '00531310551521051-302303-002': { default: 'rogue-assassination' },
      '005303103--0322003311213211551': { default: 'rogue-subtlety' },
    },
    mage: {
      '230225-23550000130133051-005': { default: 'mage-fire' },
      '230225200100301--055510033002000105': { default: 'mage-frost' },
      '050225003100301531-2355001010003-': { default: 'mage-arcane' },
    },
    warlock: {
      '25-0050203001-0050355103101351': { default: 'warlock-destruction' },
      '2555002003520105-0050203001-005': { default: 'warlock-affliction' },
      '-0325003231120001351-0350305003': { same: 'a former Demonology default' },
      '-0325003221120001351-0450305003': { default: 'warlock-demonology' },
    },
    priest: {
      '025300031303--500320501201312051': { default: 'priest-shadow' },
    },
    hunter: {
      '55-0053552511503051-': { default: 'hunter-marksmanship' },
      '5023-1053552501503051-': { preset: 'Marksmanship with a pet', label: 'the Marksmanship with a pet build' },
      '5023001505011251-00505505-': { default: 'hunter-beast-mastery' },
      '-00505515-55005003124000005': { default: 'hunter-survival' },
    },
  },
}

/** A code's canonical form on today's trees, or null when it isn't a legal build there. */
function legalToday(data: TalentData, code: string): string | null {
  try {
    const ranks = decodeTalentCode(data, code)
    return validateTalentBuild(data, ranks).length === 0 ? encodeTalentCode(data, ranks) : null
  } catch {
    return null
  }
}

/**
 * The current version of a shipped code on older trees, and how the notice names it (`spec`: the
 * spec whose default it was); null for a code the sim didn't ship, or one whose mapping by name is
 * its current version. The code is looked up in canonical form on its own trees, so one written
 * with trailing zeros ("2500030-5030-…") is still the shipped code (review TMV-1).
 */
export function successorOf(data: TalentData, fromBuild: string, code: string): { code: string; label: string; now: string; spec?: SpecId } | null {
  const canonical = canonicalFrozenCode(data, fromBuild, code)
  const successor = canonical === null ? undefined : TALENT_SUCCESSORS[fromBuild]?.[data.class as ClassId]?.[canonical]
  if (!successor || 'byName' in successor) return null
  const [now, label, words] =
    'default' in successor
      ? [defaultTalents(successor.default), `the ${SPEC_META[successor.default].name} default`, 'today’s default']
      : 'preset' in successor
        ? [talentPresets(data.class as ClassId).find((p) => p.name === successor.preset)?.code, successor.label, 'its version for today’s trees']
        : [code, successor.same, 'its version for today’s trees']
  const legal = now === undefined ? null : legalToday(data, now)
  if (!legal) return null
  return 'default' in successor ? { code: legal, label, now: words, spec: successor.default } : { code: legal, label, now: words }
}

/**
 * A code written on a frozen build's trees, read on today's (docs/data/talents.md#tree-versions): a
 * code the sim shipped as its successor (successorOf), any other by talent name, with its refunds.
 * A successor the name mapping already gives needs no word, so it comes back as that mapping.
 * Throws if the code isn't a legal build on that build's trees.
 */
export function migrateOlderCode(data: TalentData, fromBuild: string, code: string): TalentMigration {
  const successor = successorOf(data, fromBuild, code)
  const mapped = migrateTalentCode(data, fromBuild, code)
  if (!successor || successor.code === mapped.code) return mapped
  const { code: now, ...words } = successor
  return { code: now, refunds: [], successor: words }
}

/**
 * A pasted code read on the older trees it may have been written on, newest first, when it isn't a
 * legal build on today's (src/features/talents/logic.ts readBuildCode); null if it's legal on none.
 */
export function readOnOlderTrees(data: TalentData, code: string): TalentMigration | null {
  const builds = [...new Set(Object.entries(TALENT_TREES_OF_VERSION).sort(([a], [b]) => Number(b) - Number(a)).map(([, build]) => build))]
  for (const build of builds) {
    try {
      return migrateOlderCode(data, build, code)
    } catch {
      // Not a legal build on this build's trees: try an older one.
    }
  }
  return null
}
