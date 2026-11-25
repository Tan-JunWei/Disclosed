export const DIFFICULTY_ORDER = ["beginner", "easy", "medium", "hard", "insane", "expert"] as const
export type Difficulty = (typeof DIFFICULTY_ORDER)[number]

export const SEVERITY_ORDER = ["low", "medium", "high", "critical"] as const
export type Severity = (typeof SEVERITY_ORDER)[number]

/**
 * A post is rated on one scale, chosen by its section: difficulty for CTF posts, severity for
 * research posts. Severity borrows the difficulty colours (`hue`), so every chart, card and sidebar
 * line can colour a rating without knowing which scale it came from.
 */
export interface Rating {
  scheme: "difficulty" | "severity"
  level: string
  hue: Difficulty
}

export const SEVERITY_HUE: Record<Severity, Difficulty> = {
  low: "beginner",
  medium: "medium",
  high: "hard",
  critical: "insane",
}

export function ratingOf(entry: {
  difficulty?: Difficulty
  severity?: Severity
}): Rating | undefined {
  if (entry.severity) {
    return { scheme: "severity", level: entry.severity, hue: SEVERITY_HUE[entry.severity] }
  }
  if (entry.difficulty) {
    return { scheme: "difficulty", level: entry.difficulty, hue: entry.difficulty }
  }
  return undefined
}

/** Position on its own scale, used to sort by rating. Unrated sorts last. */
export function ratingRank(entry: { difficulty?: Difficulty; severity?: Severity }): number {
  if (entry.severity) return SEVERITY_ORDER.indexOf(entry.severity) + 1
  if (entry.difficulty) return DIFFICULTY_ORDER.indexOf(entry.difficulty) + 1
  return 0
}

/** CVSS v3 qualitative bands: 0.1-3.9 low, 4.0-6.9 medium, 7.0-8.9 high, 9.0-10.0 critical. */
export function severityFromScore(score: number): Severity | undefined {
  if (!(score > 0 && score <= 10)) return undefined
  if (score < 4) return "low"
  if (score < 7) return "medium"
  if (score < 9) return "high"
  return "critical"
}
