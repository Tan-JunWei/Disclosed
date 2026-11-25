import { SimpleSlug } from "../../../util/path"

const STORAGE_KEY = "graph-visited"

/** Pages this browser has opened, so the graph can mark them as visited. */
export function getVisited(): Set<SimpleSlug> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"))
  } catch {
    // storage can be blocked (private browsing) or hold a corrupt value: treat it as empty
    return new Set()
  }
}

export function addToVisited(slug: SimpleSlug) {
  const visited = getVisited()
  visited.add(slug)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]))
  } catch {
    // the visited marks are a nicety, so a page that cannot store them still works
  }
}
