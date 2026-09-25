// What player-facing text mustn't carry (CLAUDE.md "Release updates"): the release notes and Coming
// soon are read by players, and Discord posts are made from them. Their tests hold them to these.

/** An emoji or pictograph. */
export const PICTOGRAPH = /\p{Extended_Pictographic}/u
/** Words about how the sim is made, not what it does. */
export const INTERNAL_WORD =
  /\b(finding|findings|worker|workers|CSP|scraper|scrapers|review|reviews|reviewer|branch|commit|golden|goldens|e2e|milestone|slice)\b/i
/** Decision, finding and milestone ids: D29, T2R-1, BR5, M2.4. */
export const INTERNAL_ID = /\b[A-Z]{1,3}\d+(\.\d+)?(-\d+)?\b/
/** A whole sentence ends in punctuation. */
export const SENTENCE_END = /[.!?]$/
