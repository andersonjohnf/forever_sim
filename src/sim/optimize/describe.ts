// How a build differs from another, in words (docs/optimizer.md#reading-the-results).
import { decodeTalentCode, type TalentData, talentsInCodeOrder } from '@/data/talents/types'

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
