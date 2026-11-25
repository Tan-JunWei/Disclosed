/**
 * The graph renderer. It pulls in d3, so it is built as its own module (see the LazyModules
 * emitter) and only downloaded once a graph is about to be shown.
 */
import type { RelationshipIndex } from "../../../util/graphRelationships"
import * as d3 from "d3"
import { removeAllChildren } from "../util"
import { FullSlug, SimpleSlug, resolveRelative, simplifySlug } from "../../../util/path"
import { getVisited } from "./visited"
import { SECTIONS } from "../../../util/sections"

type NodeData = {
  id: SimpleSlug
  text: string
  tags: string[]
} & d3.SimulationNodeDatum

type LinkData = {
  source: SimpleSlug
  target: SimpleSlug
}

/** Section colour key of each top-level folder slug (posts' ids start with it), from the registry. */
const SECTION_COLOURS: Record<string, string> = Object.fromEntries(
  SECTIONS.flatMap((section) =>
    section.graphColour ? [[section.landing.split("/")[0], section.graphColour]] : [],
  ),
)
/** How long the pointer must rest on a node before the rest of the graph fades back (ms). */
const HOVER_DELAY = 140
/** How long the pointer must rest on another node before the highlight moves to it (ms). */
const SWITCH_DELAY = 90
/** Grace period after leaving a node, so moving to a neighbour does not flash the graph (ms). */
const LEAVE_DELAY = 180
const HOVER_FADE = 280

let relationshipIndex: Promise<RelationshipIndex> | undefined
const graphRenderVersions = new WeakMap<HTMLElement, number>()

/** Stops any render in flight for `graph` and empties it. */
export function clearGraph(graph: HTMLElement) {
  graphRenderVersions.set(graph, (graphRenderVersions.get(graph) ?? 0) + 1)
  removeAllChildren(graph)
}

export async function renderGraph(container: string, fullSlug: FullSlug) {
  const slug = simplifySlug(fullSlug)
  const visited = getVisited()
  const graph = document.getElementById(container)
  if (!graph) return
  const renderVersion = (graphRenderVersions.get(graph) ?? 0) + 1
  graphRenderVersions.set(graph, renderVersion)
  removeAllChildren(graph)

  let {
    drag: enableDrag,
    zoom: enableZoom,
    depth,
    scale,
    repelForce,
    centerForce,
    linkDistance,
    fontSize,
    opacityScale,
    removeTags,
    showTags,
    focusOnHover,
  } = JSON.parse(graph.dataset["cfg"]!)

  if (!relationshipIndex) {
    relationshipIndex = fetch(resolveRelative(fullSlug, "static/graphIndex.json" as FullSlug)).then(
      (response) => {
        if (!response.ok) throw new Error(`Graph index: ${response.status}`)
        return response.json()
      },
    )
    // a failed download is retried on the next render instead of breaking the graph until reload
    relationshipIndex.catch(() => (relationshipIndex = undefined))
  }
  let index: RelationshipIndex
  try {
    index = await relationshipIndex
  } catch (error) {
    console.warn("Graph unavailable:", error)
    return
  }
  if (!graph.isConnected || graphRenderVersions.get(graph) !== renderVersion) return
  const data = new Map(index.nodes.map((node) => [node.id, node]))
  const validLinks = new Set(
    index.nodes
      .filter(
        (node) =>
          !node.id.startsWith("tags/") || (showTags && !removeTags.includes(node.id.substring(5))),
      )
      .map((node) => node.id),
  )
  const pairs = new Map<string, LinkData>()
  for (const relationship of index.relationships) {
    const { source, target, type } = relationship
    if (type !== "authored" && (source.startsWith("tags/") || target.startsWith("tags/"))) {
      if (!showTags || removeTags.includes(target.substring(5))) continue
    }
    const key = [source, target].sort().join("\0")
    if (!pairs.has(key)) pairs.set(key, { source, target })
  }
  const links = [...pairs.values()]

  const neighbourhood = new Set<SimpleSlug>()
  const wl: (SimpleSlug | "__SENTINEL")[] = [slug, "__SENTINEL"]
  const expanded = new Set<SimpleSlug>()
  if (depth >= 0) {
    while (depth >= 0 && wl.length > 0) {
      // compute neighbours
      const cur = wl.shift()!
      if (cur === "__SENTINEL") {
        depth--
        wl.push("__SENTINEL")
      } else {
        if (expanded.has(cur)) continue
        expanded.add(cur)
        neighbourhood.add(cur)
        if (
          cur !== slug &&
          links.filter((link) => link.source === cur || link.target === cur).length > 40
        )
          continue
        const outgoing = links.filter((l) => l.source === cur)
        const incoming = links.filter((l) => l.target === cur)
        wl.push(...outgoing.map((l) => l.target), ...incoming.map((l) => l.source))
      }
    }
  } else {
    validLinks.forEach((id) => neighbourhood.add(id))
  }

  const graphData: { nodes: NodeData[]; links: LinkData[] } = {
    nodes: [...neighbourhood].map((url) => {
      const text = data.get(url)?.title ?? url
      return {
        id: url,
        text: text,
        tags: data.get(url)?.tags ?? [],
      }
    }),
    links: links.filter((l) => neighbourhood.has(l.source) && neighbourhood.has(l.target)),
  }

  const simulation: d3.Simulation<NodeData, LinkData> = d3
    .forceSimulation(graphData.nodes)
    .force("charge", d3.forceManyBody().strength(-100 * repelForce))
    .force(
      "link",
      d3
        .forceLink(graphData.links)
        .id((d: any) => d.id)
        .distance(linkDistance),
    )
    .force("center", d3.forceCenter().strength(centerForce))

  const height = Math.max(graph.offsetHeight, 250)
  const width = graph.offsetWidth

  const svg = d3
    .select<HTMLElement, NodeData>("#" + container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("role", "group")
    .attr(
      "aria-label",
      "Graph links. Use arrow keys to move between nodes and Enter to open a page.",
    )
    .attr("viewBox", [-width / 2 / scale, -height / 2 / scale, width / scale, height / scale])

  // draw links between nodes
  const link = svg
    .append("g")
    .selectAll("line")
    .data(graphData.links)
    .join("line")
    .attr("class", "link")
    .attr("stroke", "var(--graph-edge)")
    .attr("stroke-width", 1)

  // svg groups
  const graphNode = svg.append("g").selectAll("g").data(graphData.nodes).enter().append("g")

  // Each post takes its section's colour (the same accents as the home page cards), so the graph
  // shows at a glance which collection a page belongs to. Landing and tag pages stay neutral. A page
  // you have not opened yet is drawn paler (see graph.scss), and the page you are on gets a halo.
  const isTag = (d: NodeData) => d.id.startsWith("tags/")
  const color = (d: NodeData) => {
    if (isTag(d)) return "var(--graph-node-tag)"
    const key = SECTION_COLOURS[d.id.split("/")[0]]
    return key ? `var(--graph-node-${key})` : "var(--graph-node)"
  }
  // a thin outline in the panel colour keeps nodes crisp where lines run under them. The current
  // page gets a soft halo in its own colour instead, and tags are hollow rings
  const restingStroke = (d: NodeData) =>
    isTag(d)
      ? color(d)
      : d.id === slug
        ? `color-mix(in srgb, ${color(d)} 38%, transparent)`
        : "var(--graph-bg)"
  const restingStrokeWidth = (d: NodeData) => (isTag(d) ? 1.5 : d.id === slug ? 6 : 1.5)

  type NodeDragEvent = d3.D3DragEvent<SVGCircleElement, NodeData, NodeData>
  const drag = (simulation: d3.Simulation<NodeData, LinkData>) => {
    function dragstarted(event: NodeDragEvent, d: NodeData) {
      if (!event.active) simulation.alphaTarget(1).restart()
      d.fx = d.x
      d.fy = d.y
    }

    function dragged(event: NodeDragEvent, d: NodeData) {
      d.fx = event.x
      d.fy = event.y
    }

    function dragended(event: NodeDragEvent, d: NodeData) {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
    }

    const noop = () => {}
    return d3
      .drag<SVGCircleElement, NodeData>()
      .on("start", enableDrag ? dragstarted : noop)
      .on("drag", enableDrag ? dragged : noop)
      .on("end", enableDrag ? dragended : noop)
  }

  function nodeRadius(d: NodeData) {
    const numLinks = links.filter((l: any) => l.source.id === d.id || l.target.id === d.id).length
    return 2 + Math.sqrt(numLinks)
  }

  let connectedNodes: SimpleSlug[] = []
  // current zoom level, so a hovered label can be kept inside the panel
  let zoomK = 1

  let hovered: { el: SVGCircleElement; d: NodeData } | undefined
  let enterTimer = 0
  let leaveTimer = 0
  const fade = <T extends d3.BaseType, D>(selection: d3.Selection<T, D, d3.BaseType, unknown>) =>
    selection.transition().duration(HOVER_FADE).ease(d3.easeCubicOut)
  const linksOf = (id: SimpleSlug) =>
    d3
      .selectAll<SVGLineElement, LinkData>(".link")
      .filter((l: any) => l.source.id === id || l.target.id === id)

  function highlight(el: SVGCircleElement, d: NodeData) {
    if (hovered && hovered.el !== el) unhighlight(hovered.el, hovered.d, false)
    hovered = { el, d }
    const currentId = d.id
    const linkNodes = linksOf(currentId)

    if (focusOnHover) {
      // fade out everything that is not the hovered node or one of its neighbours
      connectedNodes = linkNodes.data().flatMap((l: any) => [l.source.id, l.target.id])
      fade(
        d3
          .selectAll<SVGLineElement, LinkData>(".link")
          .filter((l: any) => l.source.id !== currentId && l.target.id !== currentId),
      ).style("opacity", 0.1)
      const isNear = (n: NodeData) => n.id === currentId || connectedNodes.includes(n.id)
      fade(d3.selectAll<SVGCircleElement, NodeData>(".node")).style("opacity", (n) =>
        isNear(n) ? 1 : 0.18,
      )
      fade(labels).style("opacity", (n) =>
        isNear(n) ? labelOpacity(zoomK) : Math.min(labelOpacity(zoomK), 0.18),
      )
    }

    // ring the hovered node, and draw its links in its own colour at full strength
    if (currentId !== slug) {
      d3.select(el).attr("stroke", color(d)).attr("stroke-width", 2)
    }
    linkNodes.raise()
    const sectionColour = !isTag(d) && SECTION_COLOURS[d.id.split("/")[0]]
    fade(linkNodes)
      .attr(
        "stroke",
        `color-mix(in srgb, ${sectionColour ? color(d) : "var(--graph-edge-active)"} 80%, transparent)`,
      )
      .attr("stroke-width", 1.4)
      .style("opacity", 1)

    // Show the label of the node you are pointing at: full strength, a touch bigger and bolder, in
    // the strongest text colour, and slid back inside the panel if it would be cut off.
    const label = d3.select<SVGTextElement, NodeData>(labelById.get(d.id)!)
    label
      .interrupt()
      .attr("dx", 0)
      .style("font-size", fontSize * 1.5 + "em")
      .style("font-weight", 600)
      .style("fill", "var(--dark)")
    const area = (svg.node() as SVGSVGElement).getBoundingClientRect()
    const box = (label.node() as SVGTextElement).getBoundingClientRect()
    const margin = 4
    const shift =
      box.left < area.left + margin
        ? area.left + margin - box.left
        : box.right > area.right - margin
          ? area.right - margin - box.right
          : 0
    label.attr("dx", shift / (zoomK * scale))
    fade(label).style("opacity", 1)
  }

  // `restore` brings the rest of the graph back. It is skipped when another node takes over at once
  function unhighlight(el: SVGCircleElement, d: NodeData, restore: boolean) {
    if (focusOnHover && restore) {
      fade(d3.selectAll<SVGLineElement, LinkData>(".link")).style("opacity", 1)
      fade(d3.selectAll<SVGCircleElement, NodeData>(".node")).style("opacity", 1)
      fade(labels).style("opacity", labelOpacity(zoomK))
    }
    fade(linksOf(d.id)).attr("stroke", "var(--graph-edge)").attr("stroke-width", 1)
    d3.select(el).attr("stroke", restingStroke(d)).attr("stroke-width", restingStrokeWidth(d))

    const label = d3.select<SVGTextElement, NodeData>(labelById.get(d.id)!)
    label
      .interrupt()
      .attr("dx", 0)
      .style("font-size", fontSize + "em")
      .style("font-weight", null)
      .style("fill", null)
    if (restore || !focusOnHover) fade(label).style("opacity", labelOpacity(zoomK))
  }

  // draw individual nodes
  const node = graphNode
    .append("circle")
    .attr("class", "node")
    .attr("tabindex", (_, index) => (index === 0 ? 0 : -1))
    .attr("role", "link")
    .attr("aria-label", (d) => d.text)
    .attr("r", nodeRadius)
    .attr("fill", color)
    .classed("is-unvisited", (d) => d.id !== slug && !isTag(d) && !visited.has(d.id))
    .style("cursor", "pointer")
    .on("click", (_, d) => {
      const destination = data.get(d.id)?.destination ?? d.id
      const [path, query] = destination.split("?")
      const targ = resolveRelative(fullSlug, path as FullSlug) + (query ? `?${query}` : "")
      window.spaNavigate(new URL(targ, window.location.toString()))
    })
    .on("keydown", function (event: KeyboardEvent) {
      if (event.key === "Enter") {
        event.preventDefault()
        this.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      } else if (
        ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)
      ) {
        event.preventDefault()
        const nodes = node.nodes()
        const index = nodes.indexOf(this)
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? nodes.length - 1
              : (index +
                  (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) +
                  nodes.length) %
                nodes.length
        node.attr("tabindex", (_, i) => (i === next ? 0 : -1))
        nodes[next]?.focus()
      }
    })
    .on("focus", function () {
      this.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    })
    .on("blur", function () {
      this.dispatchEvent(new MouseEvent("mouseleave"))
    })
    .on("mouseover", function (event, d) {
      clearTimeout(leaveTimer)
      clearTimeout(enterTimer)
      // Keyboard focus switches at once. The pointer has to rest for a moment first, so sweeping
      // across the graph (or over other nodes on the way to a neighbour) does not set it flashing.
      // Moving on from a highlighted node needs a shorter rest than starting from nothing.
      if (event.isTrusted === false) highlight(this, d)
      else
        enterTimer = window.setTimeout(
          () => highlight(this, d),
          hovered ? SWITCH_DELAY : HOVER_DELAY,
        )
    })
    .on("mouseleave", function () {
      clearTimeout(enterTimer)
      if (!hovered) return
      // a short grace period, so sliding onto a neighbouring node does not flash the whole graph
      leaveTimer = window.setTimeout(() => {
        if (hovered) unhighlight(hovered.el, hovered.d, true)
        hovered = undefined
      }, LEAVE_DELAY)
    })
    .call(drag(simulation))

  node.attr("stroke", restingStroke).attr("stroke-width", restingStrokeWidth)
  // current page: paint the halo underneath the fill so it reads as a ring around the node
  node.filter((d) => d.id === slug && !isTag(d)).style("paint-order", "stroke")
  // make tags hollow circles
  node.filter(isTag).attr("fill", "var(--graph-bg)")

  // Draw labels. They stay hidden while the graph is idle and fade in as you zoom or point at a
  // node. The halo keeps a constant thickness on screen instead of growing with the zoom.
  const labelOpacity = (k: number) => Math.min(Math.max((k * opacityScale - 1) / 3, 0), 1)
  const haloWidth = (k: number) => 3 / (k * scale) + "px"
  // Labels live in their own layer, drawn after every node, so a neighbouring node's circle never
  // covers one.
  const labelLayer = svg.append("g").attr("class", "labels")
  const labels = labelLayer
    .selectAll("text")
    .data(graphData.nodes)
    .enter()
    .append("text")
    .attr("dx", 0)
    .attr("dy", (d) => -nodeRadius(d) + "px")
    .attr("text-anchor", "middle")
    .text((d) => d.text)
    .style("opacity", labelOpacity(1))
    .style("pointer-events", "none")
    .style("font-size", fontSize + "em")
    .style("stroke-width", haloWidth(1))
  const labelById = new Map<SimpleSlug, SVGTextElement>()
  labels.each(function (d) {
    labelById.set(d.id, this as SVGTextElement)
  })

  // set panning
  if (enableZoom) {
    svg.call(
      d3
        .zoom<SVGSVGElement, NodeData>()
        .extent([
          [0, 0],
          [width, height],
        ])
        .scaleExtent([0.25, 4])
        .on("zoom", ({ transform }) => {
          link.attr("transform", transform)
          node.attr("transform", transform)
          zoomK = transform.k
          labels
            .attr("transform", transform)
            .style("opacity", labelOpacity(transform.k))
            .style("stroke-width", haloWidth(transform.k))
        }),
    )
  }

  // progress the simulation
  simulation.on("tick", () => {
    link
      .attr("x1", (d: any) => d.source.x)
      .attr("y1", (d: any) => d.source.y)
      .attr("x2", (d: any) => d.target.x)
      .attr("y2", (d: any) => d.target.y)
    node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y)
    labels.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y)
  })
}
