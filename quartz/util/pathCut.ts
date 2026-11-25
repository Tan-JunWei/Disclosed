/** Which links make up the main route of an attack path. */

export interface Link {
  from: string
  to: string
}

/**
 * The main route: from the first deepest step, back through the first parent one stage earlier. The
 * rest of the diagram hangs off it as side branches. `depth` is each step's stage.
 */
export function mainRoute(links: Link[], depth: Map<string, number>, order: string[]): Set<string> {
  const edges = new Set<string>()
  const deepest = Math.max(0, ...depth.values())
  let current = order.find((id) => depth.get(id) === deepest)
  while (current !== undefined && (depth.get(current) ?? 0) > 0) {
    const parent: string | undefined = links.find(
      ({ from, to }) => to === current && depth.get(from) === depth.get(current!)! - 1,
    )?.from
    if (parent === undefined) break
    edges.add(`${parent}>${current}`)
    current = parent
  }
  return edges
}
