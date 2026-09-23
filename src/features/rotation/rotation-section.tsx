import { RotateCcw } from 'lucide-react'
import { useMemo } from 'react'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { NumberField } from '@/components/number-field'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { EmptyState } from '@/features/empty-state'
import { SectionHeader } from '@/features/section'
import { cn } from '@/lib/utils'
import { buffCatalogue, getSpec, rotationValues, type RotationValue } from '@/sim'

export function RotationSection() {
  const meta = useSpecMeta()
  const rotation = useSetup((s) => s.config.rotation)
  const talents = useSetup((s) => s.config.talents)
  const enabledBuffs = useSetup((s) => s.config.buffs.enabled)
  const update = useSetup((s) => s.update)
  const options = getSpec(meta.id).rotationOptions
  // Each setting's saved value, or its default for this setup: a default can follow the talents
  // or another setting (docs/ux.md "Rotation").
  const values = useMemo(() => rotationValues({ spec: meta.id, talents, rotation }), [meta.id, talents, rotation])
  const set = (id: string, v: RotationValue) => update((c) => ({ ...c, rotation: { ...c.rotation, [id]: v } }))
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
            // A consumable the rotation uses only when it's selected in Buffs (Mighty Rage Potion, Juju Flurry).
            const needs = option.kind === 'toggle' && option.requiresBuff ? buffCatalogue.find((b) => b.id === option.requiresBuff) : undefined
            const missing = needs !== undefined && !enabledBuffs.includes(needs.id)
            const inactive = (option.dependsOn !== undefined && !values[option.dependsOn]) || missing
            const labelId = `rot-${option.id}-label`
            return (
              <li key={option.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between', inactive && 'opacity-60')}>
                <div className="flex flex-col gap-1">
                  <label id={labelId} htmlFor={option.kind === 'choice' ? undefined : `rot-${option.id}`} className="text-sm font-medium">
                    {option.label}
                  </label>
                  <p className="text-xs text-muted-foreground">{option.help}</p>
                  {missing && (
                    <p className="text-xs text-muted-foreground">
                      Not used: turn on {needs.name} in <span className="font-medium text-foreground">Buffs</span> first.
                    </p>
                  )}
                </div>
                {option.kind === 'toggle' ? (
                  <Switch id={`rot-${option.id}`} checked={Boolean(values[option.id])} onCheckedChange={(on) => set(option.id, on)} />
                ) : option.kind === 'choice' ? (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    aria-labelledby={labelId}
                    value={String(values[option.id])}
                    onValueChange={(v) => v && set(option.id, v)}
                    className="w-full shrink-0 sm:w-auto"
                  >
                    {option.choices.map((choice) => (
                      <ToggleGroupItem key={choice.value} value={choice.value} className="h-11 flex-1 px-4 sm:flex-none">
                        {choice.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                ) : (
                  <NumberField
                    id={`rot-${option.id}`}
                    value={Number(values[option.id])}
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
