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
