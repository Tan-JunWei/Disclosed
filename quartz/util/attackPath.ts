/**
 * Attack paths are written in a fenced block that is plain text first, so the source stays easy to
 * edit by hand and reads fine anywhere that does not render it:
 *
 *   ```attack-path
 *   Attacker
 *   -> Lure a user to a malicious page | Mitigation: URL filtering
 *      Free-form detail for this step, shown in the step list.
 *   -> Read and write memory in the renderer
 *   -> Escape the sandbox
 *
 *   Read and write memory in the renderer
 *   -> Persist on the endpoint
 *   ```
 *
 * Each line is a step. `->` continues a chain, a blank line starts a new one, and a step is
 * identified by its text, so naming an earlier step again branches or merges the path. `| text`
 * attaches the mitigation that breaks that step (`| Mitigation: text` reads better, and `Control:`
 * and `Fix:` mean the same), and indented lines are its description.
 */

import { mainRoute } from "./pathCut"
import { escapeHTML } from "./escape"

export interface PathNode {
  id: string
  label: string
  control?: string
  description: string[]
}

export interface PathGraph {
  nodes: PathNode[]
  edges: { from: string; to: string }[]
  warnings: string[]
}

export const MAX_PATH_NODES = 24

const ARROW = /\s*(?:->|→)\s*/
const nodeKey = (label: string) => label.toLowerCase().replace(/\s+/g, " ").trim()

export function parseAttackPath(source: string): PathGraph {
  const nodes = new Map<string, PathNode>()
  const edges: PathGraph["edges"] = []
  const warnings: string[] = []
  let previous: PathNode | undefined
  let last: PathNode | undefined

  const resolve = (segment: string, line: number): PathNode | undefined => {
    const [rawLabel, ...controls] = segment.split("|").map((part) => part.trim())
    const label = rawLabel.replace(/\s+/g, " ")
    if (!label) return undefined
    if (controls.length > 1) {
      warnings.push(`line ${line}: only one control per step is shown, extra ones were ignored`)
    }
    const control = controls[0]?.replace(/^(?:mitigation|control|fix):\s*/i, "").trim() || undefined
    const key = nodeKey(label)
    let node = nodes.get(key)
    if (!node) {
      if (nodes.size >= MAX_PATH_NODES) {
        warnings.push(`line ${line}: more than ${MAX_PATH_NODES} steps, the rest were ignored`)
        return undefined
      }
      node = { id: `n${nodes.size + 1}`, label, description: [] }
      nodes.set(key, node)
    }
    if (control) {
      if (node.control && node.control !== control) {
        warnings.push(`line ${line}: "${label}" already has a different control, kept the first`)
      } else {
        node.control = control
      }
    }
    return node
  }

  source.split("\n").forEach((raw, index) => {
    const line = index + 1
    if (!raw.trim()) {
      previous = undefined
      return
    }
    if (/^\s/.test(raw)) {
      if (last) last.description.push(raw.trim())
      else warnings.push(`line ${line}: a description needs a step above it`)
      return
    }
    const segments = raw.trim().split(ARROW)
    const continues = segments[0] === ""
    if (continues && !previous) {
      warnings.push(`line ${line}: "->" has no step before it, treated as a new chain`)
    }
    let from = continues ? previous : undefined
    for (const segment of continues ? segments.slice(1) : segments) {
      const node = resolve(segment, line)
      if (!node) continue
      if (from && from !== node && !edges.some((e) => e.from === from!.id && e.to === node.id)) {
        edges.push({ from: from.id, to: node.id })
      }
      from = node
      last = node
    }
    previous = from
  })

  const graph: PathGraph = { nodes: [...nodes.values()], edges, warnings }
  removeCycles(graph)
  return graph
}

/** A path that loops back on itself cannot be laid out left to right, so the closing edge is dropped. */
function removeCycles(graph: PathGraph) {
  const outgoing = new Map<string, string[]>()
  for (const edge of graph.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
  }
  const state = new Map<string, 1 | 2>()
  const drop = new Set<string>()
  const visit = (id: string) => {
    state.set(id, 1)
    for (const next of outgoing.get(id) ?? []) {
      if (state.get(next) === 1) drop.add(`${id}>${next}`)
      else if (!state.has(next)) visit(next)
    }
    state.set(id, 2)
  }
  for (const node of graph.nodes) if (!state.has(node.id)) visit(node.id)
  if (drop.size === 0) return
  graph.warnings.push("the path loops back on itself, so the closing arrow was ignored")
  graph.edges = graph.edges.filter((edge) => !drop.has(`${edge.from}>${edge.to}`))
}

// ---- layout ---------------------------------------------------------------------------------

export const GEOMETRY = {
  cardWidth: 128,
  colGap: 38,
  padX: 22,
  padY: 30,
  /** A card is a header strip, a title area and, when the step has one, a mitigation footer. */
  headHeight: 22,
  bodyHeight: 66,
  footHeight: 76,
  rowGap: 36,
  corner: 10,
  /** The start of the route is an icon with a name under it, not a card, so it is narrower. */
  entryWidth: 100,
  actorRadius: 44,
} as const

export type NodeKind = "entry" | "step" | "impact"

export interface PlacedNode {
  node: PathNode
  col: number
  row: number
  /** Left edge of the card. */
  x: number
  /** Fixed width. Text expands the card vertically. */
  width: number
  height: number
  bodyHeight: number
  footHeight: number
  labelLines: string[]
  controlLines: string[]
  /** Top edge of the card. */
  y: number
  /** Shared connector height near the top of each row, independent of card height. */
  anchorY: number
  kind: NodeKind
  /** Stage along the path (distance from the start), 0 for an entry. */
  step: number
  /** What the step is called on screen: "START", "02", or "03A" when branches share a stage. */
  tag: string
}

export interface PathLayout {
  nodes: PlacedNode[]
  edges: { from: PlacedNode; to: PlacedNode; viaY?: number }[]
  width: number
  height: number
  hasControls: boolean
}

export function layoutAttackPath(graph: PathGraph): PathLayout {
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  for (const { from, to } of graph.edges) {
    parents.set(to, [...(parents.get(to) ?? []), from])
    children.set(from, [...(children.get(from) ?? []), to])
  }

  // column = longest distance from an entry, so every arrow points right
  const column = new Map<string, number>()
  const depth = (id: string): number => {
    const known = column.get(id)
    if (known !== undefined) return known
    const value = Math.max(-1, ...(parents.get(id) ?? []).map(depth)) + 1
    column.set(id, value)
    return value
  }
  graph.nodes.forEach((node) => depth(node.id))

  const ordered = [...graph.nodes].sort(
    (a, b) =>
      column.get(a.id)! - column.get(b.id)! || graph.nodes.indexOf(a) - graph.nodes.indexOf(b),
  )

  // row = the first parent's row when free, otherwise the next free one, so branches fan downwards
  const rows = new Map<string, number>()
  const taken = new Set<string>()
  let nextEntryRow = 0
  for (const node of ordered) {
    const col = column.get(node.id)!
    const parent = (parents.get(node.id) ?? [])
      .map((id) => rows.get(id))
      .find((r) => r !== undefined)
    let row = parent ?? nextEntryRow
    while (taken.has(`${col},${row}`)) row++
    taken.add(`${col},${row}`)
    rows.set(node.id, row)
    if (parent === undefined) nextEntryRow = Math.max(nextEntryRow, row + 1)
  }
  const usedRows = [...new Set(rows.values())].sort((a, b) => a - b)

  const hasControls = graph.nodes.some((node) => node.control)
  const { cardWidth, colGap, padX, padY, headHeight, bodyHeight, footHeight, rowGap, entryWidth } =
    GEOMETRY
  const sizes = new Map<
    string,
    {
      width: number
      height: number
      bodyHeight: number
      footHeight: number
      labelLines: string[]
      controlLines: string[]
    }
  >()
  const rowHeights = new Map<number, number>()
  for (const node of ordered) {
    const entry = column.get(node.id) === 0
    const labelLines = completeLines(node.label, entry ? 11 : 16)
    const controlLines = node.control ? completeLines(node.control, 16) : []
    const body = Math.max(bodyHeight, 22 + labelLines.length * 15)
    const foot = node.control ? Math.max(footHeight, 28 + controlLines.length * 15 + 10) : 0
    const height = entry
      ? headHeight + bodyHeight / 2 + GEOMETRY.actorRadius + 17 + labelLines.length * 14
      : headHeight + body + foot
    sizes.set(node.id, {
      width: entry ? entryWidth : cardWidth,
      height,
      bodyHeight: body,
      footHeight: foot,
      labelLines,
      controlLines,
    })
    const row = usedRows.indexOf(rows.get(node.id)!)
    rowHeights.set(row, Math.max(rowHeights.get(row) ?? 0, height))
  }
  const rowAxis = new Map<number, number>()
  let nextY = padY
  for (let row = 0; row < usedRows.length; row++) {
    rowAxis.set(row, nextY + headHeight + bodyHeight / 2)
    nextY += rowHeights.get(row)! + rowGap
  }
  const placed = new Map<string, PlacedNode>()
  for (const node of ordered) {
    const isEntry = !parents.get(node.id)?.length
    const isImpact = !children.get(node.id)?.length && !isEntry
    const col = column.get(node.id)!
    const row = usedRows.indexOf(rows.get(node.id)!)
    const size = sizes.get(node.id)!
    const anchorY = rowAxis.get(row)!
    const y = anchorY - headHeight - bodyHeight / 2
    placed.set(node.id, {
      node,
      col,
      row,
      x: col === 0 ? padX : padX + entryWidth + colGap + (col - 1) * (cardWidth + colGap),
      ...size,
      y,
      anchorY,
      kind: isEntry ? "entry" : isImpact ? "impact" : "step",
      step: col,
      tag: "",
    })
  }
  // steps that share a stage (a fork, or two starting points) are told apart by a letter
  const byStage = new Map<number, PlacedNode[]>()
  for (const item of placed.values()) {
    byStage.set(item.step, [...(byStage.get(item.step) ?? []), item])
  }
  for (const [stage, group] of byStage) {
    group.sort((a, b) => a.row - b.row)
    group.forEach((item, index) => {
      const letter = group.length > 1 ? String.fromCharCode(65 + index) : ""
      item.tag =
        stage === 0
          ? `START${letter ? " " + letter : ""}`
          : `${String(stage).padStart(2, "0")}${letter}`
    })
  }

  // Connections that skip a stage must go around intervening cards, not through them.
  let bypasses = 0
  const bottom = Math.max(0, ...[...placed.values()].map((node) => node.y + node.height))
  const edges = graph.edges.map(({ from, to }) => {
    const source = placed.get(from)!
    const target = placed.get(to)!
    return {
      from: source,
      to: target,
      ...(target.col > source.col + 1 ? { viaY: bottom + ++bypasses * 18 } : {}),
    }
  })
  return {
    nodes: [...placed.values()],
    edges,
    width: padX * 2 + entryWidth + Math.max(0, ...column.values()) * (cardWidth + colGap),
    height: Math.max(padY * 2, nextY - rowGap + padY, bottom + bypasses * 18 + padY),
    hasControls,
  }
}

/**
 * A trace in the style of a circuit board: straight where it can be, and otherwise a horizontal run,
 * a vertical run and a horizontal run again, with rounded corners.
 */
export function tracePath(x1: number, y1: number, x2: number, y2: number, radius = 10): string {
  if (y1 === y2) return `M${x1} ${y1} H${x2}`
  const mid = (x1 + x2) / 2
  const dir = y2 > y1 ? 1 : -1
  const r = Math.min(radius, Math.abs(y2 - y1) / 2, (x2 - x1) / 2)
  return (
    `M${x1} ${y1} H${mid - r} Q${mid} ${y1} ${mid} ${y1 + dir * r} ` +
    `V${y2 - dir * r} Q${mid} ${y2} ${mid + r} ${y2} H${x2}`
  )
}

/** Route a stage-skipping edge through a clear lane below the cards. */
export function bypassPath(from: PlacedNode, to: PlacedNode, viaY: number): string {
  const start = from.x + from.width
  const end = to.x - 3
  const points = [
    [start, from.anchorY],
    [start + GEOMETRY.colGap / 2, from.anchorY],
    [start + GEOMETRY.colGap / 2, viaY],
    [to.x - GEOMETRY.colGap / 2, viaY],
    [to.x - GEOMETRY.colGap / 2, to.anchorY],
    [end, to.anchorY],
  ]
  let path = `M${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const [previous, corner, next] = [points[i - 1], points[i], points[i + 1]]
    const before = Math.hypot(corner[0] - previous[0], corner[1] - previous[1])
    const after = Math.hypot(next[0] - corner[0], next[1] - corner[1])
    const radius = Math.min(8, before / 2, after / 2)
    const entry = corner.map((v, axis) => v + ((previous[axis] - v) * radius) / before)
    const exit = corner.map((v, axis) => v + ((next[axis] - v) * radius) / after)
    path += ` L${entry.join(" ")} Q${corner.join(" ")} ${exit.join(" ")}`
  }
  return path + ` L${end} ${to.anchorY}`
}

// ---- rendering ------------------------------------------------------------------------------

/** Text for the SVG, which cannot show code spans, so the backticks are dropped. */
const plain = (text: string) => text.replace(/`/g, "")

/** Escapes text, then turns `code` spans into <code>. */
const inline = (text: string) => escapeHTML(text).replace(/`([^`]+)`/g, "<code>$1</code>")

/** Full labels wrap downwards. Long identifiers split instead of escaping the card. */
function completeLines(text: string, maxChars: number): string[] {
  const words = plain(text)
    .split(/\s+/)
    .flatMap((word) => {
      const chars = Array.from(word)
      const parts: string[] = []
      while (chars.length) parts.push(chars.splice(0, maxChars).join(""))
      return parts
    })
  const result: string[] = []
  for (const word of words) {
    const last = result.length - 1
    if (last >= 0 && result[last].length + word.length + 1 <= maxChars) result[last] += " " + word
    else result.push(word)
  }
  return result
}

// 24x24 line icons
const ICONS = {
  step: '<path d="M5 8h14M5 12h14M5 16h9" />',
  target: '<circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" />',
  shield:
    '<path d="M12 4.5 6 7v4.6c0 3.6 2.4 6.2 6 7.4 3.6-1.2 6-3.8 6-7.4V7z" /><path d="m9.4 12 1.9 1.9 3.3-3.4" />',
} as const

// The attacker: a hooded hacker drawn as bold flat shapes with black outlines. A pointed coral hood
// marked </>, a black face inside a pink-rimmed opening with a lightning tuft, angry white eyes and a
// masked jaw, a hoodie with drawstrings, and a laptop with a pixel skull, on a pale badge inside a
// dashed ring. It is drawn on a 100x100 grid (the ring is r=54) and `id` keeps the clip path unique
// when a diagram has several starting points. Colours come from classes in attackPath.scss.
// A rounded cranium, hollow eyes, triangular nose and separated teeth, sized for the laptop lid.
const SKULL =
  "M50 78C44.8 78 41.5 81 41.5 85.2C41.5 88 43 89.6 45.5 90.2V93H54.5V90.2C57 89.6 58.5 88 58.5 85.2C58.5 81 55.2 78 50 78Z " +
  "M44 84.5C44 82.8 47.8 82.8 47.8 84.5V86.2C47.8 88 44 88 44 86.2Z " +
  "M52.2 84.5C52.2 82.8 56 82.8 56 84.5V86.2C56 88 52.2 88 52.2 86.2Z " +
  "M50 86.8L48.4 89.2H51.6Z M47.5 90H48.5V93H47.5Z M51.5 90H52.5V93H51.5Z"

const HOOD =
  "M50 6.8 40.5 13.2 34.5 21.5 30.5 27.5 25.5 33.5 21.4 43 19.6 50 24 57.5 33 64 43.5 69.5 50 71.2 56.5 69.5 67 64 76 57.5 80.4 50 78.6 43 74.5 33.5 69.5 27.5 65.5 21.5 59.5 13.2Z"
const OPENING =
  "M35.5 31.5 42 28 50 26.8 58 28 64.5 31.5 70.5 40 72.5 49 70 57 62 64 50 69.5 38 64 30 57 27.5 49 29.5 40Z"

const actorGlyph = (id: string) =>
  `<clipPath id="${id}-badge"><circle cx="50" cy="50" r="44" /></clipPath>` +
  `<circle class="ap-s-red" cx="50" cy="50" r="54" fill="none" stroke-width="2.2" stroke-dasharray="9 6" />` +
  `<circle class="ap-s-ring" cx="50" cy="50" r="49" fill="none" stroke-width="5" />` +
  `<circle class="ap-f-pale" cx="50" cy="50" r="46.5" />` +
  `<g clip-path="url(#${id}-badge)">` +
  // circuit traces
  `<path class="ap-s-red" fill="none" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" d="M14 40V31L19.5 25.5 23.5 22M86 40V31L80.5 25.5 76.5 22" />` +
  `<circle class="ap-s-red ap-f-pale" cx="25.2" cy="20.8" r="2" stroke-width="1" /><circle class="ap-s-red ap-f-pale" cx="74.8" cy="20.8" r="2" stroke-width="1" />` +
  // hoodie
  `<path class="ap-f-black ap-s-black" stroke-width="2" stroke-linejoin="round" d="M26 58 12 66 8 101H92L88 66 74 58 64 68 50 73 36 68Z" />` +
  `<path class="ap-f-red" d="M14 70 30 61 38 67 17 80ZM86 70 70 61 62 67 83 80ZM8 90 13 82 17 94 11 101ZM92 90 87 82 83 94 89 101Z" />` +
  `<path class="ap-s-pink" fill="none" stroke-width="1.4" d="M39.7 66V69.6M60.3 66V69.6" /><rect class="ap-f-red" x="37.9" y="69.6" width="3.6" height="2.4" /><rect class="ap-f-red" x="58.5" y="69.6" width="3.6" height="2.4" />` +
  // hood
  `<path class="ap-f-red ap-s-black" stroke-width="2.4" stroke-linejoin="round" d="${HOOD}" />` +
  `<path class="ap-s-black" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M45.4 15.2 42.4 18.6 45.4 22M54.6 15.2 57.6 18.6 54.6 22M52.8 14.4 47.2 22.8" />` +
  // face
  `<path class="ap-f-black ap-s-black" stroke-width="3.2" stroke-linejoin="round" d="${OPENING}" />` +
  `<path class="ap-f-black ap-s-pink" stroke-width="1.1" stroke-linejoin="round" d="${OPENING}" />` +
  `<path class="ap-f-red ap-s-black" stroke-width=".6" stroke-linejoin="round" d="M33.8 41 49.2 31.2 47.4 36.8 64 33.2 51 40.6 49.6 38 41.8 41.6Z" />` +
  `<path class="ap-f-white" d="M33.8 43.2 48.4 47.6 47.4 50.2 36.6 47ZM66.2 43.2 51.6 47.6 52.6 50.2 63.4 47Z" />` +
  `<path class="ap-f-red ap-s-black" stroke-width="1.3" stroke-linejoin="round" d="M34 51.6 50 53.8 66 51.6 63 58.6 50 64.4 37 58.6Z" />` +
  `<path class="ap-s-black" fill="none" stroke-width="1.3" stroke-linecap="round" d="M37.6 55 45.6 56.8M38.2 58 45.2 59.5M62.4 55 54.4 56.8M61.8 58 54.8 59.5" />` +
  `<path class="ap-f-red ap-s-black" stroke-width="1.4" stroke-linejoin="round" d="M43.4 64.6 50 72.6 56.6 64.6Z" />` +
  // laptop
  `<path class="ap-f-black ap-s-pink" stroke-width="1.6" stroke-linejoin="round" d="M22 101 26.5 77.6Q27.5 75.4 30 75.4H70Q72.5 75.4 73.5 77.6L78 101Z" />` +
  `<path class="ap-f-pink" fill-rule="evenodd" d="${SKULL}" />` +
  `</g>`

function icon(name: keyof typeof ICONS, x: number, y: number, size: number, cls: string): string {
  return `<g class="${cls}" transform="translate(${x} ${y}) scale(${size / 24})">${ICONS[name]}</g>`
}

function lines(rows: string[], x: number, y: number, step: number, cls: string): string {
  const spans = rows
    .map((row, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : step}">${escapeHTML(row)}</tspan>`)
    .join("")
  return `<text class="${cls}" x="${x}" y="${y}">${spans}</text>`
}

/** Where traces leave a node: the right edge of a card, or of the start's icon. */
const right = (p: PlacedNode) => p.x + p.width

function renderNode(p: PlacedNode, uid: string): string {
  const { headHeight: HEAD, corner: C } = GEOMETRY
  const { width: W, bodyHeight: BODY } = p
  const id = `${uid}-${p.node.id}`
  const full = [
    p.node.label,
    ...p.node.description,
    ...(p.node.control ? [`Mitigation: ${p.node.control}`] : []),
  ].join(". ")
  const open = `<g class="ap-node ap-is-${p.kind}" data-node="${id}"><title>${escapeHTML(full)}</title>`

  if (p.kind === "entry") {
    const r = GEOMETRY.actorRadius
    const cx = p.x + p.width / 2
    const cy = p.anchorY
    const name = p.labelLines
    return (
      open +
      `<rect class="ap-hit" x="${cx - r - 4}" y="${cy - r - 2}" width="${r * 2 + 8}" height="${r * 2 + 8 + name.length * 14 + 6}" />` +
      `<g transform="translate(${cx - r} ${cy - r}) scale(${(r * 2) / 108})"><g transform="translate(4 4)">${actorGlyph(id)}</g></g>` +
      lines(name, cx, cy + r + 17, 14, "ap-title ap-actor-name") +
      `</g>`
    )
  }

  const hasControl = Boolean(p.node.control)
  const height = p.height
  const x = p.x
  const y = p.y
  const header = `M${x} ${y + HEAD} V${y + C} a${C} ${C} 0 0 1 ${C} ${-C} H${x + W - C} a${C} ${C} 0 0 1 ${C} ${C} V${y + HEAD} Z`
  const footerTop = y + HEAD + BODY
  const footer = hasControl
    ? `<path class="ap-foot-fill" d="M${x} ${footerTop} H${x + W} V${y + height - C} a${C} ${C} 0 0 1 ${-C} ${C} H${x + C} a${C} ${C} 0 0 1 ${-C} ${-C} Z" />` +
      `<path class="ap-foot-rule" d="M${x} ${footerTop} H${x + W}" />` +
      `<text class="ap-foot-tag" x="${x + 10}" y="${footerTop + 15}">MITIGATION</text>` +
      icon("shield", x + W - 24, footerTop + 4, 15, "ap-icon ap-icon-safe") +
      lines(p.controlLines, x + 10, footerTop + 33, 15, "ap-mitigation-text")
    : ""

  return (
    open +
    `<rect class="ap-hit" x="${x}" y="${y}" width="${W}" height="${height}" />` +
    `<rect class="ap-card" x="${x}" y="${y}" width="${W}" height="${height}" rx="${C}" />` +
    `<path class="ap-head-fill" d="${header}" />` +
    `<text class="ap-tag" x="${x + 10}" y="${y + 15}">${escapeHTML(p.tag)}</text>` +
    icon(p.kind === "impact" ? "target" : "step", x + W - 23, y + 4, 14, "ap-icon ap-icon-head") +
    lines(p.labelLines, x + 10, y + HEAD + 22, 15, "ap-title") +
    footer +
    `</g>`
  )
}

export function renderAttackPath(graph: PathGraph, uid: string, hue = "hard"): string {
  const layout = layoutAttackPath(graph)
  const mitigations = layout.nodes.filter((p) => p.node.control).length

  // the longest chain is drawn heavier than the branches that hang off it, so the eye has a spine
  const main = mainRoute(
    layout.edges.map(({ from, to }) => ({ from: from.node.id, to: to.node.id })),
    new Map(layout.nodes.map((p) => [p.node.id, p.col])),
    layout.nodes.map((p) => p.node.id),
  )
  const edges = layout.edges
    .map(({ from, to, viaY }) => {
      const startX = right(from)
      const d =
        viaY === undefined
          ? tracePath(startX, from.anchorY, to.x - 3, to.anchorY)
          : bypassPath(from, to, viaY)
      const spine = main.has(`${from.node.id}>${to.node.id}`) ? " ap-main" : ""
      return (
        `<g class="ap-edge${spine}" data-from="${uid}-${from.node.id}" data-to="${uid}-${to.node.id}">` +
        `<path class="ap-trace" d="${d}" marker-end="url(#${uid}-arrow)" />` +
        `<circle class="ap-pad" cx="${startX}" cy="${from.anchorY}" r="3.6" />` +
        `<path class="ap-packet-glow" d="${d}" pathLength="100" />` +
        `<path class="ap-packet" d="${d}" pathLength="100" />` +
        `</g>`
      )
    })
    .join("")

  const nodes = layout.nodes.map((p) => renderNode(p, uid)).join("")

  const list = [...layout.nodes]
    .sort((a, b) => a.step - b.step || a.row - b.row)
    .map((p) => {
      const detail = p.node.description.map((line) => `<p>${inline(line)}</p>`).join("")
      const mitigation = p.node.control
        ? `<p class="ap-mitigation"><span>MITIGATION</span> ${inline(p.node.control)}</p>`
        : ""
      const tag = p.kind === "entry" ? p.tag : `STEP ${p.tag}`
      return (
        `<li class="ap-step ap-is-${p.kind}" data-node="${uid}-${p.node.id}">` +
        `<span class="ap-step-no">${tag}</span>` +
        `<div class="ap-step-body"><strong>${inline(p.node.label)}</strong>${detail}${mitigation}</div></li>`
      )
    })
    .join("")

  const button = (action: string, label: string, body: string) =>
    `<button type="button" class="ap-tool" data-zoom="${action}" aria-label="${label}">${body}</button>`
  return (
    `<figure class="attack-path ap-hue-${escapeHTML(hue)}" data-attack-path>` +
    `<div class="ap-head"><span class="ap-name"><i class="ap-glyph"></i>Attack route</span>` +
    `<div class="ap-tools" hidden>` +
    button("out", "Zoom out", '<svg viewBox="0 0 16 16"><path d="M4 8h8" /></svg>') +
    button("fit", "Fit to width", '<span class="ap-zoom-level">100%</span>') +
    button("in", "Zoom in", '<svg viewBox="0 0 16 16"><path d="M4 8h8M8 4v8" /></svg>') +
    `</div></div>` +
    `<div class="ap-viewport" tabindex="0" role="group" aria-label="Attack path diagram. Hold Control and scroll, or press plus, minus or zero, to zoom.">` +
    `<div class="ap-sizer"><div class="ap-canvas">` +
    `<svg class="ap-svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" aria-hidden="true" focusable="false">` +
    `<defs><marker id="${uid}-arrow" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="ap-arrowhead" d="M0.8 1 L9.2 5 L0.8 9 L2.8 5 z" /></marker></defs>` +
    edges +
    nodes +
    `</svg></div></div></div>` +
    `<div class="ap-foot"><span class="ap-key ap-key-attack">Attacker route</span>` +
    (mitigations ? `<span class="ap-key ap-key-safe">Mitigation</span>` : "") +
    `<span class="ap-hint">Ctrl + scroll to zoom</span></div>` +
    `<ol class="ap-steps">${list}</ol>` +
    `</figure>`
  )
}
