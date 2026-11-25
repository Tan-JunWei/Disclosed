/**
 * Font files fetched early, before the stylesheet that names them has downloaded: the Latin subsets
 * of the body text and the bold headings, which every page uses above the fold.
 * fonts.test.ts checks that each one exists and is still referenced by styles/fonts.scss.
 */
export const PRELOADED_FONTS = [
  "static/fonts/sourcesans3-v20-nwpStKy2OAdR1K-IwhWudF-R3w8aZQ.woff2",
  "static/fonts/tomorrow-v19-WBLhrETNbFtZCeGqgR1pXnXPDMU.woff2",
] as const
