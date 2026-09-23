// Dimmed results (docs/ux.md#states: stale, or a re-run under way). A subtree marks itself with
// `group/dim` and `data-dimmed`; its text turns muted, which still meets AA contrast, and its
// bars, icons and colored changes fade to neutral.
export const DIM_ROOT = 'group/dim data-[dimmed=true]:text-muted-foreground'
export const DIM_TEXT = 'group-data-[dimmed=true]/dim:text-muted-foreground'
export const DIM_FILL = 'group-data-[dimmed=true]/dim:bg-muted-foreground/40'
export const DIM_ICON = 'group-data-[dimmed=true]/dim:opacity-50 group-data-[dimmed=true]/dim:grayscale'
