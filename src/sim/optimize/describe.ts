// How a build differs from another, in words (docs/optimizer.md#reading-the-results).
import { decodeTalentCode, type TalentData, talentsInCodeOrder } from '@/data/talents/types'
import { ENCHANTS } from '../effects/enchants'
import type { EquippedItem, GearSlot } from '../types'
import { describeSource, type Gear, POOL } from './gear'

/**
 * The talents whose ranks differ between two builds, in code order: "Improved Thunder Clap 0→3",
 * "Deflection 5→0". An unreadable code counts as no talents.
 */
export function describeBuildChange(data: TalentData, from: string, to: string): string[] {
  const decode = (code: string) => {
    try {
      return decodeTalentCode(data, code)
    } catch {
      return {}
    }
  }
  const a = decode(from)
  const b = decode(to)
  return talentsInCodeOrder(data)
    .flat()
    .filter((t) => (a[t.id] ?? 0) !== (b[t.id] ?? 0))
    .map((t) => `${t.name} ${a[t.id] ?? 0}→${b[t.id] ?? 0}`)
}

/**
 * The slots whose item or enchant differ between two gear sets, in paper-doll order, with each new
 * piece's source when it's PvP, reputation or a profession's (D30's build plan: "each result says
 * which pieces are PvP rank or rare drops"): "Hands: Gauntlets of Might → Devilsaur Gauntlets
 * (+Greater Strength)". An item the pool lacks shows by its id.
 */
export function describeGearChange(from: Gear, to: Gear): string[] {
  const name = (entry: EquippedItem | undefined) => {
    if (!entry) return 'nothing'
    const item = POOL.get(entry.itemId)
    const enchant = entry.enchantId ? (ENCHANTS.find((e) => e.id === entry.enchantId)?.name ?? entry.enchantId) : null
    return `${item?.name ?? `item ${entry.itemId}`}${enchant ? ` (+${enchant})` : ''}`
  }
  const out: string[] = []
  for (const slot of GEAR_SLOT_ORDER) {
    const a = from[slot]
    const b = to[slot]
    if (a?.itemId === b?.itemId && (a?.enchantId ?? null) === (b?.enchantId ?? null)) continue
    const item = b ? POOL.get(b.itemId) : undefined
    const source = item && a?.itemId !== b?.itemId ? describeSource(item) : null
    out.push(`${SLOT_NAME[slot]}: ${name(a)} → ${name(b)}${source ? ` [${source}]` : ''}`)
  }
  return out
}

const GEAR_SLOT_ORDER: readonly GearSlot[] = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'mainHand', 'offHand', 'ranged', 'ammo', 'quiver']
const SLOT_NAME: Record<GearSlot, string> = {
  head: 'Head',
  neck: 'Neck',
  shoulder: 'Shoulder',
  back: 'Back',
  chest: 'Chest',
  wrist: 'Wrist',
  hands: 'Hands',
  waist: 'Waist',
  legs: 'Legs',
  feet: 'Feet',
  finger1: 'Finger 1',
  finger2: 'Finger 2',
  trinket1: 'Trinket 1',
  trinket2: 'Trinket 2',
  mainHand: 'Main hand',
  offHand: 'Off hand',
  ranged: 'Ranged',
  ammo: 'Ammo',
  quiver: 'Quiver',
}
