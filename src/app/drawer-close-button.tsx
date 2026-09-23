import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DrawerClose } from '@/components/ui/drawer'

/**
 * A phone sheet's close button (the results, the item picker): a 44 px target in the header's
 * top-right corner, which is `relative` with room on the right (docs/ux.md#accessibility). Escape,
 * a swipe down and a tap outside close the sheet too, but none of them is visible.
 */
export function DrawerCloseButton() {
  return (
    <DrawerClose asChild>
      <Button variant="ghost" size="icon" className="absolute top-1.5 right-1.5 size-11" aria-label="Close">
        <X />
      </Button>
    </DrawerClose>
  )
}
