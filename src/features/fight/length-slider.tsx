import { Slider as SliderPrimitive } from 'radix-ui'
import { durationText } from './duration'

/**
 * The fight length slider. It's the shadcn slider's Radix primitive composed here rather than
 * `components/ui/slider`, which can't name its thumb: the thumb carries the accessible name and a
 * spoken value ("3 minutes"), and both the track and the thumb are 44 px touch targets (docs/ux.md
 * "Accessibility").
 */
export function LengthSlider({
  value,
  onChange,
  min,
  max,
  step,
  labelledBy,
  id,
  describedBy,
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  labelledBy: string
  /** The thumb's id, which takes focus. */
  id?: string
  describedBy?: string
}) {
  return (
    <SliderPrimitive.Root
      min={min}
      max={max}
      step={step}
      value={[value]}
      onValueChange={([next]) => onChange(next)}
      className="relative flex h-11 w-full touch-none items-center select-none"
    >
      <SliderPrimitive.Track className="relative h-2 grow overflow-hidden rounded-full bg-muted-foreground/30">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        id={id}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-valuetext={durationText(value)}
        className="group/thumb flex size-11 items-center justify-center rounded-full outline-none"
      >
        <span className="size-6 rounded-full border-2 border-primary bg-background shadow-sm ring-ring/50 transition-[box-shadow] group-hover/thumb:ring-3 group-focus-visible/thumb:ring-3 group-active/thumb:ring-3" />
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  )
}
