const TAG_SEP = "|"

const FACETS = ["section", "category", "difficulty", "severity", "tag", "technique"] as const
export type FacetName = (typeof FACETS)[number]

/** Facets whose value is a single attribute on the card (the others hold lists). */
const SCALAR_FACETS = ["section", "category", "difficulty", "severity"] as const

export interface ExplorerState {
  q: string
  sort: string
  facets: Record<FacetName, Set<string>>
}

export function defaultState(): ExplorerState {
  return {
    q: "",
    sort: "newest",
    facets: Object.fromEntries(FACETS.map((facet) => [facet, new Set<string>()])) as Record<
      FacetName,
      Set<string>
    >,
  }
}

export function stateFromURL(search: string): ExplorerState {
  const params = new URLSearchParams(search)
  const state = defaultState()
  state.q = (params.get("q") ?? "").trim().toLowerCase()
  state.sort = params.get("sort") ?? "newest"
  for (const facet of FACETS) {
    // `platform` is what the section filter was called before the site covered more than CTFs
    const raw = params.get(facet) ?? (facet === "section" ? params.get("platform") : null)
    if (raw) {
      state.facets[facet] = new Set(
        raw
          .split(",")
          .filter(Boolean)
          .map((value) => (facet === "tag" ? value.toLowerCase() : value)),
      )
    }
  }
  return state
}

export function stateToQuery(state: ExplorerState) {
  const params = new URLSearchParams()
  if (state.q) params.set("q", state.q)
  if (state.sort !== "newest") params.set("sort", state.sort)
  for (const facet of FACETS) {
    if (state.facets[facet].size > 0) {
      params.set(facet, [...state.facets[facet]].join(","))
    }
  }
  return params.toString()
}

export function cardMatches(
  card: { dataset: Record<string, string | undefined> },
  state: ExplorerState,
): boolean {
  if (!Number.isFinite(fuzzySearchScore(state.q, card.dataset.search ?? ""))) return false

  for (const facet of SCALAR_FACETS) {
    const wanted = state.facets[facet]
    if (wanted.size > 0 && !wanted.has(card.dataset[facet] ?? "")) return false
  }
  if (state.facets.tag.size > 0) {
    const cardTags = (card.dataset.tags ?? "").split(TAG_SEP)
    const hasAny = [...state.facets.tag].some((tag) => cardTags.includes(tag))
    if (!hasAny) return false
  }
  if (
    state.facets.technique.size > 0 &&
    ![...state.facets.technique].some((family) =>
      (card.dataset.techniques ?? "").split(TAG_SEP).includes(family),
    )
  )
    return false
  return true
}

function searchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  let beforePrevious = previous
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]),
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j], beforePrevious[j - 2] + 1)
    }
    if (Math.min(...row) > limit) return limit + 1
    beforePrevious = previous
    previous = row
  }
  return previous[b.length]
}

export function fuzzySearchScore(query: string, text: string): number {
  const needle = searchText(query)
  const haystack = searchText(text)
  if (!needle || haystack.includes(needle)) return 0
  const words = haystack.split(" ")
  let score = 0
  for (const term of needle.split(" ")) {
    // a run of digits (a CVE number, a year) is an identifier, so one wrong digit is a different one
    const limit = /^\d+$/.test(term) ? 0 : term.length < 4 ? 0 : term.length < 8 ? 1 : 2
    let best = Infinity
    for (const word of words) {
      if (word.startsWith(term)) {
        best = 0.1
        break
      }
      if (limit && term.length <= 64 && word.length <= 64) {
        const distance = editDistance(term, word, limit)
        if (distance <= limit) best = Math.min(best, distance)
      }
    }
    if (!Number.isFinite(best)) return Infinity
    score += best
  }
  return score
}
