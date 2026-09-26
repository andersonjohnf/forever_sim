import { Check, ChevronDown, ChevronRight, History, Info, MoreHorizontal } from 'lucide-react'
import { useMemo, useRef, useState, type HTMLAttributes, type ReactElement, type ReactNode } from 'react'
import { announce } from '@/app/announce'
import { useSetup } from '@/app/setup-store'
import { useSpecMeta } from '@/app/specs'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { WowIcon } from '@/components/wow-icon'
import type { Item } from '@/data/items/types'
import { ClassicEraNote, RULE_PROFILE_ID } from '@/features/character/classic-era-note'
import { changeAndFocus, selectedOption } from '@/features/refocus'
import { useFocusAcrossPlaces } from '@/features/rotation/layout'
import { SectionHeader } from '@/features/section'
import { useIsWide, useMediaQuery } from '@/hooks/use-media-query'
import { itemsById } from '@/lib/items'
import { cn } from '@/lib/utils'
import { hasThreatSet, isTwoHand, matchSupplies, uniqueConflicts, type GearSlot, type SimConfig } from '@/sim'
import { defaultGearFor, equipEffect, slotsOffDefault } from './default-set'
import { EnchantPicker } from './enchant-picker'
import { enchantsFor } from './enchants'
import { ItemPicker } from './item-picker'
import { classicFlag, itemDescription, unsimulatedEffects } from './item-flags'
import { ItemFlags, ItemSummary } from './item-row'
import { ItemTooltip, ItemTooltipInfoButton, ItemTooltipTrigger } from './item-tooltip'
import { WIDE_TOOLTIP_ANCHOR, WideSlot, WideSlotGrid } from './wide-slots'
import { ammoNote, bisRank, EMPTY_SLOT_ICON, SLOT_LABEL, slotGroups } from './slots'

/** The items equipped in each slot. */
function wornItems(gear: SimConfig['gear']): Partial<Record<GearSlot, Item>> {
  const worn: Partial<Record<GearSlot, Item>> = {}
  for (const [slot, entry] of Object.entries(gear) as [GearSlot, { itemId: number } | undefined][]) {
    const item = entry && itemsById.get(entry.itemId)
    if (item) worn[slot] = item
  }
  return worn
}

function equip(config: SimConfig, slot: GearSlot, item: Item | null): SimConfig {
  const gear = { ...config.gear }
  if (!item) {
    delete gear[slot]
    return { ...config, gear }
  }
  // A unique item moves rather than being duplicated. The picker doesn't offer an item that
  // breaks a Unique-Equipped group, so this only ever clears another copy of the same item.
  for (const conflict of uniqueConflicts(wornItems(gear), slot, item)) delete gear[conflict.slot]
  // Keep the slot's enchant if it still applies to the new item.
  const enchantId = gear[slot]?.enchantId
  const keep = enchantId && enchantsFor(slot, item, config.rules.profile).some((e) => e.id === enchantId)
  gear[slot] = keep ? { itemId: item.id, enchantId } : { itemId: item.id }
  if (slot === 'mainHand' && isTwoHand(item)) delete gear.offHand
  // A new ranged weapon takes ammo it fires, and the quiver or pouch that holds it (hunter.md §7.3).
  if (slot === 'ranged') return { ...config, gear: matchSupplies(gear, item) }
  return { ...config, gear }
}

/** What a ranged pick swapped in the ammo and quiver slots, for screen readers: the rows change in view. */
function suppliesSwapped(before: SimConfig['gear'], after: SimConfig['gear']): string | null {
  const swapped = (['ammo', 'quiver'] as const)
    .filter((slot) => after[slot] && before[slot]?.itemId !== after[slot]?.itemId)
    .map((slot) => itemsById.get(after[slot]!.itemId)?.name)
    .filter(Boolean)
  return swapped.length ? `Swapped in ${swapped.join(' and ')} to match the ranged weapon.` : null
}

/** Up to three slots by name, then how many more: "Head, Neck, Shoulders and 13 more". */
function slotList(slots: readonly GearSlot[]): string {
  const names = slots.map((slot) => SLOT_LABEL[slot])
  if (names.length > 3) return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** An empty slot's icon and name, or why a two-hander leaves the off hand empty. */
function EmptySlot({ slot, locked }: { slot: GearSlot; locked: boolean }) {
  return (
    <div aria-hidden className="flex min-w-0 flex-1 items-center gap-3">
      <WowIcon icon={EMPTY_SLOT_ICON[slot]} size="lg" grayscale />
      <div className="flex flex-col">
        <span className="text-sm font-medium text-muted-foreground">{SLOT_LABEL[slot]}</span>
        <span className="text-xs text-muted-foreground">{locked ? 'Your two-handed weapon uses both hands' : 'Empty'}</span>
      </div>
    </div>
  )
}

export function GearSection() {
  const meta = useSpecMeta()
  const config = useSetup((s) => s.config)
  const update = useSetup((s) => s.update)
  const [picking, setPicking] = useState<GearSlot | null>(null)
  // Each slot's button, which takes focus back when the picker closes (docs/ux.md#accessibility).
  const slotButtons = useRef(new Map<GearSlot, HTMLButtonElement>())
  const statusRef = useRef<HTMLParagraphElement>(null)
  const slotsRef = useRef<HTMLDivElement>(null)

  const mainHand = config.gear.mainHand ? itemsById.get(config.gear.mainHand.itemId) : undefined
  const twoHanded = mainHand ? isTwoHand(mainHand) : false
  const ranged = config.gear.ranged ? itemsById.get(config.gear.ranged.itemId) : undefined

  // A tank's default is the sim's measured threat set, not a guide's pre-raid list, and the tab says
  // so (docs/ux.md "Gear").
  const threatSet = hasThreatSet(config.spec)
  const defaultSet = threatSet ? `the ${meta.name} ${meta.className} threat set` : `${meta.name} ${meta.className} pre-raid best in slot`
  // The default set's button sits at the top, stronger while the gear differs from it (docs/ux.md "Gear").
  const offSlots = slotsOffDefault(config)
  const offDefault = offSlots.length
  const setName = threatSet ? 'the threat set' : 'pre-raid best in slot'

  // No visible notice for these: the slots change in front of you. Screen readers hear them
  // (src/app/announce.ts).
  // The button goes once the gear matches, so focus moves to the line that says so.
  const loadBis = () => {
    changeAndFocus(
      () => update((c) => ({ ...c, gear: { ...defaultGearFor(c.spec, c.race) } })),
      () => statusRef.current,
    )
    announce(`Equipped ${defaultSet}.`)
  }
  const clearAll = () => {
    update((c) => ({ ...c, gear: {} }))
    announce('Removed all gear.')
  }
  const setSection = useSetup((s) => s.setSection)
  const profile = useSetup((s) => s.config.rules.profile)
  // The items worn, for a tooltip's set count (docs/ux.md "Item tooltips"): an off-hand a two-hander
  // locks doesn't count, as the engine skips it (src/sim/plan/build.ts).
  const wornIds = useMemo(
    () =>
      (Object.entries(config.gear) as [GearSlot, { itemId: number } | undefined][]).flatMap(([slot, entry]) =>
        entry && !(slot === 'offHand' && twoHanded) ? [entry.itemId] : [],
      ),
    [config.gear, twoHanded],
  )
  // Where a mouse or pen hovers, hover and keyboard focus open an item's tooltip, so the info control
  // shows only where nothing hovers: a touch screen, at any width (docs/ux.md "Item tooltips").
  const hovers = useMediaQuery('(hover: hover) and (pointer: fine)')

  // From 1440 px the slots are a grid that shows them all at once (docs/ux.md "Gear", D34).
  const wide = useIsWide()
  const groups = slotGroups(meta.classId)
  const slotCount = groups.reduce((n, group) => n + group.slots.length, 0)
  // Crossing 1440 px swaps the cards for the grid: focus stays on the same control (docs/ux.md "Gear").
  const keepFocus = useFocusAcrossPlaces(
    wide ? 'wide' : 'narrow',
    () => slotsRef.current,
    () => null,
  )

  // The intro, and the line on how the gear compares with the default set, as the page says them
  // below 1440 px; from 1440 px each is one line, in shorter words (docs/ux.md "Gear").
  const intro = threatSet
    ? `Starts as ${defaultSet}: pre-raid items measured for threat, keeping an effective-health floor. Choose a slot to change its item.`
    : `Starts as ${defaultSet}. Choose a slot to change its item.`
  const wideIntro = threatSet ? `Starts as ${defaultSet}, measured for threat with an effective-health floor.` : intro
  const effect = offDefault > 0 ? equipEffect(config.gear, offSlots, defaultGearFor(config.spec, config.race)) : ''
  const differ = `${offDefault} ${offDefault === 1 ? 'slot differs' : 'slots differ'}`
  const status = offDefault === 0 ? `Wearing ${setName}.` : `${differ} from ${setName}: ${slotList(offSlots)}. Equipping it ${effect}.`
  // A long list of names would push what equipping does off the line: past three, the count alone.
  const wideStatus = offDefault === 0 ? status : `${differ}${offDefault <= 3 ? `: ${slotList(offSlots)}` : ''}. Equipping ${effect}.`

  const pick = (slot: GearSlot, item: Item | null) => {
    const swapped = slot === 'ranged' ? suppliesSwapped(config.gear, equip(config, slot, item).gear) : null
    update((c) => equip(c, slot, item))
    if (swapped) announce(swapped)
    setPicking(null)
  }

  /** What a slot holds, and how its row shows it. */
  const slotState = (slot: GearSlot) => {
    const equipped = config.gear[slot]
    const item = equipped ? itemsById.get(equipped.itemId) : undefined
    return {
      equipped,
      item,
      lockedByTwoHand: slot === 'offHand' && twoHanded,
      bis: item ? bisRank(item, config.spec, slot) : null,
      // Ammo the ranged weapon doesn't fire adds nothing: dimmed, with the reason, as in the picker.
      unused: item ? ammoNote(item, ranged) : null,
      enchantable: Boolean(item && enchantsFor(slot, item, config.rules.profile).length > 0),
    }
  }

  const slotButton = (slot: GearSlot, item: Item | undefined, locked: boolean, bis: number | null, unused: string | null, className: string) => (
    <button
      ref={(el) => {
        if (el) slotButtons.current.set(slot, el)
        else slotButtons.current.delete(slot)
      }}
      id={`gear-${slot}`}
      type="button"
      // "Open Gear" in a result with no weapon focuses the main hand (src/app/section-focus.ts).
      data-gear-slot={slot}
      disabled={locked}
      onClick={() => setPicking(slot)}
      className={className}
      aria-label={`${SLOT_LABEL[slot]}: ${item?.name ?? (locked ? 'two-handed weapon equipped' : 'empty')}`}
      aria-describedby={item ? `slot-${slot}-description` : undefined}
    >
      {item && (
        <span id={`slot-${slot}-description`} className="sr-only">
          {itemDescription(item, { bis, spec: meta.id, note: unused })}
        </span>
      )}
    </button>
  )

  const unusedNote = (unused: string | null) =>
    unused && (
      <>
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        {unused}
      </>
    )

  /**
   * A slot's row inside its item's tooltip (docs/ux.md "Item tooltips"): `trigger` wraps the slot's
   * button, which the tooltip describes and sits beside (in the wide grid, `wide`, beside its icon and
   * name), and `info` is the info control where nothing hovers. An empty slot has neither.
   */
  const withTooltip = (
    slot: GearSlot,
    item: Item | undefined,
    row: (tooltip: { trigger: (button: ReactElement<HTMLAttributes<HTMLElement>>) => ReactNode; info: ReactNode }) => ReactNode,
    wide?: { mirrored: boolean },
  ) =>
    item ? (
      <ItemTooltip
        key={slot}
        item={item}
        enchantId={config.gear[slot]?.enchantId}
        profile={profile}
        worn={wornIds}
        // In the wide grid it opens beside the slot's icon and name, the mirrored right side's to their left.
        side={wide?.mirrored ? 'left' : undefined}
        anchorParts={wide ? `.${WIDE_TOOLTIP_ANCHOR}` : undefined}
      >
        {row({
          trigger: (button) => <ItemTooltipTrigger>{button}</ItemTooltipTrigger>,
          info: hovers ? null : <ItemTooltipInfoButton className="relative z-10" />,
        })}
      </ItemTooltip>
    ) : (
      row({ trigger: (button) => button, info: null })
    )

  const enchantPicker = (slot: GearSlot, item: Item, enchantId: string | undefined, className?: string) => (
    <EnchantPicker
      slot={slot}
      item={item}
      enchantId={enchantId}
      whole={wide}
      className={className}
      // The slot's button, or the main hand's if a two-hander now locks this slot.
      fallbackFocus={() => {
        const button = slotButtons.current.get(slot)
        return button && !button.disabled ? button : slotButtons.current.get('mainHand')
      }}
      onChange={(enchantId) =>
        update((c) => ({
          ...c,
          gear: { ...c.gear, [slot]: enchantId ? { itemId: item.id, enchantId } : { itemId: item.id } },
        }))
      }
    />
  )

  return (
    <div className="flex flex-col gap-6 wide:gap-4">
      <SectionHeader
        title="Gear"
        description={
          // From 1440 px one line, whatever the spec: cut short, with the whole on hover, should it ever not fit.
          wide ? (
            <span title={intro} className="block truncate">
              {wideIntro}
            </span>
          ) : (
            intro
          )
        }
        action={
          // From 1440 px the action is in view rather than in a menu (docs/ux.md principle 4), sized to
          // its label. It empties every slot with no undo, so, like the header's Reset setup, it opens a
          // one-item menu that takes a second, deliberate click (decision D21).
          wide ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-11 gap-2 px-4">
                  Remove all gear
                  <ChevronDown className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="min-h-11" onSelect={clearAll}>
                  Empty all {slotCount} slots
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label="Gear options">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="min-h-11" onSelect={clearAll}>
                  Remove all gear
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />
      <div
        className={cn(
          'flex flex-col gap-2 rounded-xl border bg-surface shadow-surface px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4',
          offDefault > 0 && 'bg-muted/50',
          // From 1440 px it's a line under the intro rather than a box, leaving the height to the slots.
          'wide:-mt-2 wide:border-0 wide:bg-transparent wide:p-0 wide:shadow-none',
        )}
      >
        {/* Focus lands here when the button that equipped the set goes away (docs/ux.md#accessibility). */}
        <p
          ref={statusRef}
          id="gear-default-status"
          tabIndex={-1}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {offDefault > 0 ? (
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
          ) : (
            <Check aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          )}
          {/* From 1440 px one line in shorter words, cut short with the whole sentence on hover should
              a long list of slots not fit. */}
          <span title={wide ? status : undefined} className={cn(offDefault === 0 && 'text-muted-foreground', 'wide:truncate')}>
            {wide ? wideStatus : status}
          </span>
        </p>
        {/* From 1440 px Classic Era's enchant note is a link on this line rather than a box above the
            slots, which would push the last row out of the window (review finding DL2-2). */}
        {wide && profile === 'classicEra' && (
          <button
            type="button"
            aria-describedby="gear-classic-era"
            className="relative flex shrink-0 items-center gap-1.5 rounded-sm text-xs font-medium underline underline-offset-2 outline-none after:absolute after:-inset-x-2 after:-inset-y-3.5 focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() =>
              changeAndFocus(
                () => setSection('character'),
                () => selectedOption(RULE_PROFILE_ID),
              )
            }
          >
            <History aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            Classic Era enchants
            <span id="gear-classic-era" className="sr-only">
              Enchants use Classic Era’s numbers, as set in Character → Advanced.
            </span>
          </button>
        )}
        {/* Only while there's something to equip: once the gear matches, the line says so and nothing waits to be pressed. */}
        {offDefault > 0 && (
          <Button
            // From 1440 px it takes the line's height: 32 px, with a 44 px hit area (from inside its
            // border) into the space above and below.
            className="h-11 w-full px-4 sm:w-auto wide:relative wide:-my-1.5 wide:h-8 wide:px-3 wide:after:absolute wide:after:inset-x-0 wide:after:-inset-y-[7px]"
            aria-describedby="gear-default-status"
            onClick={loadBis}
          >
            {threatSet ? 'Equip the threat set' : 'Equip pre-raid best in slot'}
          </Button>
        )}
      </div>
      {!wide && <ClassicEraNote what="Enchants" />}

      {/* Under 1440 px the groups stack, each a list of cards. From 1440 px (docs/ux.md "Gear", D34)
          they're one grid in the game's character-pane order that shows every slot without scrolling
          at 1440×900. The two are different elements in a different order, so focus follows the
          control that had it (a slot, its enchant chip or a flag, by id) as the window crosses 1440 px. */}
      <div className="flex flex-col gap-6" ref={slotsRef} onFocus={keepFocus.onFocus} onBlur={keepFocus.onBlur}>
        {wide ? (
          <WideSlotGrid
            classId={meta.classId}
            renderSlot={(slot, place) => {
              const { equipped, item, lockedByTwoHand, bis, unused, enchantable } = slotState(slot)
              const flags = item && (
                <ItemFlags
                  item={item}
                  idPrefix={`gear-${slot}`}
                  // Mirrored, the flags run leftward from the chip or the text, as Tab takes them
                  // (review finding V4-3: Tab zig-zagged).
                  className={place.mirrored ? 'flex-row-reverse' : undefined}
                  fit={place.enchantLine ? `${item.id}:${equipped?.enchantId ?? ''}:${config.rules.profile}` : undefined}
                />
              )
              return withTooltip(
                slot,
                item,
                ({ trigger, info }) => (
                  <WideSlot
                    key={slot}
                    slot={slot}
                    place={place}
                    item={item}
                    locked={lockedByTwoHand}
                    bis={bis}
                    note={unused}
                    button={trigger(
                      slotButton(
                        slot,
                        item,
                        lockedByTwoHand,
                        bis,
                        unused,
                        // Its ring inset, so the list's rounded edge doesn't clip it.
                        'absolute inset-0 z-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:cursor-not-allowed',
                      ),
                    )}
                    // The chip's text lines up with the name above it: its focus ring's 4 px of room goes outside.
                    chip={item && enchantable && enchantPicker(slot, item, equipped?.enchantId, place.mirrored ? '-mr-1' : '-ml-1')}
                    flags={flags}
                    flagged={Boolean(item && (classicFlag(item) || unsimulatedEffects(item, meta.id).length > 0))}
                    info={info}
                  />
                ),
                { mirrored: place.mirrored },
              )
            }}
          />
        ) : (
          groups.map((group) => (
            <section key={group.label} className="flex min-w-0 flex-col gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</h3>
              {/* minmax(0, 1fr) columns: a long enchant or item name truncates instead of widening the page. */}
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-[repeat(2,minmax(0,1fr))]">
                {group.slots.map((slot) => {
                  const { equipped, item, lockedByTwoHand, bis, unused, enchantable } = slotState(slot)
                  return (
                    <li key={slot} className="flex min-w-0 flex-col rounded-xl border bg-surface shadow-surface">
                      {withTooltip(slot, item, ({ trigger, info }) => (
                        // The slot's button covers the row; the flag badges, the info control and the enchant chip
                        // sit above it, so a tap on one does its own thing rather than opening the picker
                        // (docs/ux.md "Gear"). Its z-1 keeps it over faded content too (an empty slot's icon),
                        // which opacity would lift above it.
                        <div
                          className={cn(
                            'relative flex min-h-16 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                            lockedByTwoHand ? 'opacity-60' : 'hover:bg-muted',
                            enchantable && 'rounded-b-none',
                          )}
                        >
                          {trigger(
                            slotButton(
                              slot,
                              item,
                              lockedByTwoHand,
                              bis,
                              unused,
                              'absolute inset-0 z-1 rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed',
                            ),
                          )}
                          {item ? (
                            <ItemSummary
                              item={item}
                              bis={bis}
                              meta={SLOT_LABEL[slot]}
                              dimmed={Boolean(unused)}
                              note={unusedNote(unused)}
                              idPrefix={`gear-${slot}`}
                              // On the name's line, as on a picker row, so the stats line keeps the row's width: its
                              // 44 px target reaches over the gap to the chevron and past the name's line above and below.
                              nameEnd={info && <div className="-my-3 -mr-3 flex shrink-0">{info}</div>}
                            />
                          ) : (
                            <EmptySlot slot={slot} locked={lockedByTwoHand} />
                          )}
                          {!lockedByTwoHand && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                        </div>
                      ))}
                      {item && enchantable && <div className="border-t">{enchantPicker(slot, item, equipped?.enchantId)}</div>}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {picking && (
        <ItemPicker
          open
          onOpenChange={(open) => !open && setPicking(null)}
          spec={config.spec}
          race={config.race}
          slot={picking}
          equippedId={config.gear[picking]?.itemId ?? null}
          worn={wornItems(config.gear)}
          onPick={(item) => pick(picking, item)}
          returnTo={() => slotButtons.current.get(picking)}
        />
      )}
    </div>
  )
}
