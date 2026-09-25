// Segmented choices: single-select toggle groups (docs/ux.md "Visual language"). The selected
// option is filled with the primary color, so which one is on reads at a glance in both themes
// (primary and its foreground are AA against each other and against the page). Call sites pass
// these to each ToggleGroupItem; the shadcn component itself stays as generated.

/** A choice option's className. */
export const CHOICE_ITEM =
  'data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground'

/**
 * A choice option whose setting can't apply (it depends on a switch that's off): its selected option
 * is dimmed by colour, like an inactive switch's track, never by opacity (docs/ux.md "Rotation").
 * Pass it after `CHOICE_ITEM`, which it overrides.
 */
export const CHOICE_ITEM_INACTIVE =
  'data-[state=on]:border-muted-foreground data-[state=on]:bg-muted-foreground data-[state=on]:text-background data-[state=on]:hover:bg-muted-foreground/90 data-[state=on]:hover:text-background'

/** Secondary text inside a choice option (Boss armor's "Most raid bosses"), readable on the selected fill. */
export const CHOICE_HINT = 'text-muted-foreground group-data-[state=on]/toggle:text-primary-foreground/80'

/*
 * In the wide layout a choice is never stretched across the setup pane (docs/ux.md principle 4, "Never
 * enlarge to fill"): the group is as wide as its options, left-aligned, and each option is as wide as
 * its name, at least 7 rem, so a pair reads as a pair ("Forever" and "Classic Era" side by side, not two
 * 570 px bars). By the `setup` container, which exists only from 1440 px (its pane is 53 rem or more),
 * so nothing changes under 1440. Pass the group's after its own width classes, and the option's after
 * its own flex classes, which they override there.
 */

/** A segmented choice's group className in the wide layout: as wide as its options. */
export const CHOICE_GROUP_WIDE = '@min-[53rem]/setup:w-fit'

/** A segmented choice's option className in the wide layout: sized by its name, 7 rem at least. */
export const CHOICE_ITEM_WIDE = '@min-[53rem]/setup:min-w-28 @min-[53rem]/setup:flex-none @min-[53rem]/setup:px-4'
