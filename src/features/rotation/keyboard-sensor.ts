// The priority list's keyboard sensor (docs/ux.md "Rotation"): dnd-kit's KeyboardSensor, listening
// for the arrow keys from the moment a row is picked up.
//
// dnd-kit's sensor adds its keydown listener in a `setTimeout` after the pick-up, so the Space or
// Enter that picked the row up doesn't reach it and drop the row at once. The browser runs input
// ahead of timers, so an arrow key pressed right after the pick-up could arrive before that timer
// and be lost. This sensor adds the same listener at once and skips the pick-up's own event
// instead. The timer later adds the same function again, which the DOM ignores; once the drag has
// ended, the listener does nothing, in case the timer adds it after the drag was already dropped.
import { KeyboardSensor, type KeyboardSensorProps } from '@dnd-kit/core'

/** The parts of dnd-kit's KeyboardSensor this reaches: private in its types, own properties at run time. */
type Internals = {
  listeners: { add(eventName: 'keydown', handler: (event: Event) => void): void }
  handleKeyDown: (event: Event) => void
  detach: () => void
}

export class ImmediateKeyboardSensor extends KeyboardSensor {
  constructor(props: KeyboardSensorProps) {
    super(props)
    const sensor = this as unknown as Internals
    const handleKeyDown = sensor.handleKeyDown
    const detach = sensor.detach.bind(this)
    let ended = false
    sensor.handleKeyDown = (event) => {
      if (ended) detach()
      else if (event !== props.event) handleKeyDown(event)
    }
    sensor.detach = () => {
      ended = true
      detach()
    }
    sensor.listeners.add('keydown', sensor.handleKeyDown)
  }
}
