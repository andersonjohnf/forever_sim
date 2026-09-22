import { RotateCcw } from 'lucide-react'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { NumberField } from '@/components/number-field'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/features/empty-state'
import { SectionHeader } from '@/features/section'
import { cn } from '@/lib/utils'
import { getSpec } from '@/sim'

export function RotationSection() {
  const meta = useSpecMeta()
  const rotation = useSetup((s) => s.config.rotation)
  const update = useSetup((s) => s.update)
  const options = getSpec(meta.id).rotationOptions
  const value = (id: string, fallback: number | boolean) => rotation[id] ?? fallback
  const set = (id: string, v: number | boolean) => update((c) => ({ ...c, rotation: { ...c.rotation, [id]: v } }))
  const changed = Object.keys(rotation).length > 0

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Rotation"
        description="Which abilities the sim uses, and when. The defaults follow the community priority."
        action={
          <Button variant="ghost" className="h-11" disabled={!changed} onClick={() => update((c) => ({ ...c, rotation: {} }))}>
            <RotateCcw /> Defaults
          </Button>
        }
      />
      {options.length === 0 ? (
        <EmptyState title="No rotation options yet">{meta.name} options come with its simulation.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {options.map((option) => {
            const inactive = option.kind === 'number' && option.dependsOn !== undefined && !value(option.dependsOn, true)
            return (
              <li key={option.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between', inactive && 'opacity-60')}>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`rot-${option.id}`} className="text-sm font-medium">
                    {option.label}
                  </label>
                  <p className="text-xs text-muted-foreground">{option.help}</p>
                </div>
                {option.kind === 'toggle' ? (
                  <Switch
                    id={`rot-${option.id}`}
                    checked={Boolean(value(option.id, option.default))}
                    onCheckedChange={(on) => set(option.id, on)}
                  />
                ) : (
                  <NumberField
                    id={`rot-${option.id}`}
                    value={Number(value(option.id, option.default))}
                    onChange={(v) => set(option.id, v)}
                    min={option.min}
                    max={option.max}
                    step={option.step}
                    unit={option.unit}
                    aria-label={option.label}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
