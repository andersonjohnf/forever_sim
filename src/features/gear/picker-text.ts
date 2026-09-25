import { SPEC_META, type GearSlot, type SpecId } from '@/sim'
import { SLOT_LABEL } from './slots'

/** The item picker's title and description, shared by the dialog, the drawer and the inline panel (docs/ux.md "Gear"). */
export const pickerTitle = (slot: GearSlot) => `Choose ${SLOT_LABEL[slot].toLowerCase()}`
export const pickerDescription = (spec: SpecId) => `Items a ${SPEC_META[spec].className.toLowerCase()} can equip here.`
