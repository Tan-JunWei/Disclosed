import test from "node:test"
import assert from "node:assert/strict"
import {
  GEOMETRY,
  MAX_PATH_NODES,
  layoutAttackPath,
  parseAttackPath,
  renderAttackPath,
  tracePath,
  bypassPath,
} from "./attackPath"
import { mainRoute } from "./pathCut"

const labels = (source: string) => parseAttackPath(source).nodes.map((node) => node.label)

test("arrows on separate lines build one chain", () => {
  const graph = parseAttackPath("Attacker\n-> Lure a user\n-> Read memory\n-> Escape sandbox")
  assert.deepEqual(
    graph.nodes.map((n) => n.label),
    ["Attacker", "Lure a user", "Read memory", "Escape sandbox"],
  )
  assert.equal(graph.edges.length, 3)
  assert.deepEqual(graph.warnings, [])
})

test("a whole chain can be written on one line, and arrows may be unicode", () => {
  assert.deepEqual(labels("A -> B → C"), ["A", "B", "C"])
  assert.equal(parseAttackPath("A -> B -> C").edges.length, 2)
})

test("controls attach to a step, with or without the Control: prefix", () => {
  const graph = parseAttackPath("A\n-> B | Control: URL filtering\n-> C | Patch quickly")
  assert.equal(graph.nodes[1].control, "URL filtering")
  assert.equal(graph.nodes[2].control, "Patch quickly")
  assert.equal(graph.nodes[0].control, undefined)
})

test("indented lines are the description of the step above", () => {
  const graph = parseAttackPath("A\n-> B\n   First detail.\n   Second detail.\n-> C")
  assert.deepEqual(graph.nodes[1].description, ["First detail.", "Second detail."])
  assert.deepEqual(graph.nodes[2].description, [])
})

test("naming a step again branches or merges instead of duplicating it", () => {
  const graph = parseAttackPath("A\n-> B\n-> C\n\nB\n-> D\n\nD\n-> C")
  assert.deepEqual(
    labels("A\n-> B\n\nb\n-> C"),
    ["A", "B", "C"],
    "matching ignores case and spacing",
  )
  assert.equal(graph.nodes.length, 4)
  const id = (label: string) => graph.nodes.find((n) => n.label === label)!.id
  assert(graph.edges.some((e) => e.from === id("B") && e.to === id("D")))
  assert(graph.edges.some((e) => e.from === id("D") && e.to === id("C")))
  assert.equal(graph.edges.filter((e) => e.to === id("C")).length, 2)
})

test("a loop is reported and its closing arrow dropped", () => {
  const graph = parseAttackPath("A -> B -> C -> A")
  assert.equal(graph.edges.length, 2)
  assert(graph.warnings.some((w) => w.includes("loops back")))
})

test("mistakes produce warnings and never throw", () => {
  assert.deepEqual(parseAttackPath("").nodes, [])
  assert(parseAttackPath("-> Orphan").warnings.some((w) => w.includes("no step before")))
  assert(parseAttackPath("  stray detail").warnings.some((w) => w.includes("needs a step")))
  assert(parseAttackPath("A -> B | one | two").warnings.some((w) => w.includes("only one control")))
  const many = Array.from({ length: MAX_PATH_NODES + 3 }, (_, i) => `S${i}`).join(" -> ")
  const graph = parseAttackPath(many)
  assert.equal(graph.nodes.length, MAX_PATH_NODES)
  assert(graph.warnings.length > 0)
})

test("layout puts every arrow left to right and gives each step its own cell", () => {
  const graph = parseAttackPath("A -> B -> C\n\nB -> D\n\nD -> C")
  const layout = layoutAttackPath(graph)
  for (const { from, to } of layout.edges) assert(to.col > from.col, "arrows point right")
  const cells = layout.nodes.map((n) => `${n.col},${n.row}`)
  assert.equal(new Set(cells).size, cells.length, "no two steps share a cell")
  assert.equal(layout.nodes.find((n) => n.node.label === "A")?.kind, "entry")
  assert.equal(layout.nodes.find((n) => n.node.label === "C")?.kind, "impact")
  assert(layout.width > 0 && layout.height > 0)
})

test("a branch fans out onto a second row, and controls make rows taller", () => {
  const plain = layoutAttackPath(parseAttackPath("A -> B -> C\nB -> D"))
  assert.equal(new Set(plain.nodes.map((n) => n.row)).size, 2)
  const withControl = layoutAttackPath(parseAttackPath("A -> B | fix -> C\nB -> D"))
  assert(withControl.height > plain.height)
  assert(withControl.hasControls && !plain.hasControls)
})

test("separate starting points each get their own row", () => {
  const layout = layoutAttackPath(
    parseAttackPath("Insider -> Exfiltrate\n\nOutsider -> Exfiltrate"),
  )
  assert.equal(layout.nodes.filter((n) => n.kind === "entry").length, 2)
  assert.equal(new Set(layout.nodes.filter((n) => n.kind === "entry").map((n) => n.row)).size, 2)
})

test("rendering escapes user text, keeps ids unique per block and lists every step", () => {
  const graph = parseAttackPath(
    "Attacker\n-> <script>alert(1)</script> | Control: `waf` & more\n   Detail with `code`.",
  )
  const html = renderAttackPath(graph, "ap7")
  assert(!html.includes("<script>"))
  assert(html.includes("&lt;script&gt;"))
  assert(html.includes("<code>waf</code>"))
  assert(!/<text[^>]*>[^<]*`/.test(html), "no backticks inside the drawing")
  assert(html.includes("<code>code</code>"))
  assert(html.includes('id="ap7-arrow"') && html.includes("url(#ap7-arrow)"))
  assert.equal((html.match(/<li class="ap-step/g) ?? []).length, 2)
  assert(html.includes("START") && html.includes("STEP 01"))
  assert(
    html.includes('aria-hidden="true"'),
    "the drawing is decorative, the list is the accessible version",
  )
})

test("steps are numbered by stage, and branches that share a stage get a letter", () => {
  const layout = layoutAttackPath(parseAttackPath("A -> B -> C -> D\n\nB -> E -> F"))
  const tag = (label: string) => layout.nodes.find((n) => n.node.label === label)!.tag
  assert.equal(tag("A"), "START")
  assert.equal(tag("B"), "01")
  assert.equal(tag("C"), "02A")
  assert.equal(tag("E"), "02B")
  assert.equal(tag("D"), "03A")
  assert.equal(tag("F"), "03B")
  const html = renderAttackPath(parseAttackPath("A -> B -> C\nB -> D"), "ap1")
  assert(html.includes("STEP 02A") && html.includes("STEP 02B"))
})

test("cards never overlap, even when paths fork and merge", () => {
  const layout = layoutAttackPath(
    parseAttackPath("A -> B -> C -> D\n\nB -> E -> F -> D\n\nB -> G | fix\nG -> D"),
  )
  const boxes = layout.nodes.map((n) => ({
    left: n.x,
    right: n.x + n.width,
    top: n.y,
    bottom: n.y + n.height,
  }))
  boxes.forEach((a, i) =>
    boxes.slice(i + 1).forEach((b) => {
      const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
      assert(apart, "two cards occupy the same space")
    }),
  )
})

test("a trace leaves the right edge of a card and meets the left edge of the next", () => {
  const layout = layoutAttackPath(parseAttackPath("A -> B -> C\nB -> D"))
  for (const { from, to } of layout.edges) {
    const width = from.width
    assert(to.x > from.x + width, "there is room for a trace between columns")
  }
  assert.equal(tracePath(10, 50, 90, 50), "M10 50 H90")
  const bent = tracePath(10, 50, 110, 150)
  assert(
    bent.startsWith("M10 50 H") && bent.endsWith("H110"),
    "a bend starts and ends horizontally",
  )
  assert(bent.includes("V"), "and runs vertically in between")
  assert(tracePath(10, 150, 110, 50).includes("V"), "upwards as well as downwards")
})

test("the route is drawn in the colour it is given, and falls back to red", () => {
  const graph = parseAttackPath("A -> B")
  assert(renderAttackPath(graph, "ap1").includes("ap-hue-hard"))
  assert(renderAttackPath(graph, "ap1", "insane").includes("ap-hue-insane"))
  assert(
    !renderAttackPath(graph, "ap1", '"><script>').includes("<script>"),
    "the colour is escaped",
  )
})

test("Mitigation, Control and Fix all name the mitigation of a step", () => {
  for (const word of ["Mitigation", "mitigation", "Control", "Fix"]) {
    assert.equal(parseAttackPath(`A -> B | ${word}: patch it`).nodes[1].control, "patch it")
  }
  assert.equal(parseAttackPath("A -> B | patch it").nodes[1].control, "patch it")
})

test("the header omits counts and the zoom controls start hidden", () => {
  const html = renderAttackPath(parseAttackPath("A -> B | fix one -> C | fix two -> D"), "ap1")
  assert(!html.includes("ap-count"))
  assert(!renderAttackPath(parseAttackPath("A -> B"), "ap1").includes("1 step<"))
  assert(/<div class="ap-tools" hidden>/.test(html), "without JavaScript there are no dead buttons")
  assert(
    html.includes('data-zoom="in"') &&
      html.includes('data-zoom="out"') &&
      html.includes('data-zoom="fit"'),
  )
  assert(/class="ap-viewport" tabindex="0"/.test(html), "the box can be focused for keyboard zoom")
})

test("diagram nodes and list entries never share a class, so one cannot be styled as the other", () => {
  const html = renderAttackPath(parseAttackPath("A -> B -> C"), "ap1")
  const start = html.indexOf('<svg class="ap-svg"')
  const svg = html.slice(start, html.indexOf("</svg>", start))
  assert(!/class="[^"]*\bap-step\b/.test(svg), "no node carries the list-entry class")
  assert(svg.includes("ap-hit"), "each step has a generous hover area")
})

test("a mitigation of fifty-odd characters is drawn on its card in full, and every one is in the tooltip", () => {
  const text = "Only accept archives from signed-in, trusted users"
  const html = renderAttackPath(parseAttackPath(`A -> B | Mitigation: ${text}`), "ap1")
  const drawn = [...html.matchAll(/<text class="ap-mitigation-text"[^>]*>(.*?)<\/text>/g)][0][1]
  const words = [...drawn.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map((m) => m[1]).join(" ")
  assert.equal(words, text, "the card shows the whole sentence, with no ellipsis")
  assert(html.includes(`<title>B. Mitigation: ${text}</title>`))
})

test("every card is drawn in the same colour, with no per-step tint", () => {
  const html = renderAttackPath(parseAttackPath("A -> B -> C -> D -> E"), "ap1")
  assert(!html.includes("--heat"), "nothing varies along the route")
  assert(!/class="ap-head-fill"[^>]*style=/.test(html))
})

test("only the longest chain is drawn as the main route", () => {
  const html = renderAttackPath(parseAttackPath("A -> B -> C -> D\nB -> X"), "ap1")
  assert.equal((html.match(/class="ap-edge ap-main"/g) ?? []).length, 3)
  assert.equal((html.match(/class="ap-edge"/g) ?? []).length, 1)
})

test("a card's hover area is exactly the card, so empty space under a short card does nothing", () => {
  const html = renderAttackPath(parseAttackPath("A -> B | Mitigation: patch it -> C"), "ap1")
  const cards = html
    .split('<g class="ap-node')
    .filter((part) => part.includes('class="ap-card"'))
    .map((part) => ({
      hit: part.match(/class="ap-hit" ([^>]*)\/>/)![1].trim(),
      card: part.match(/class="ap-card" ([^>]*)rx=/)![1].trim(),
    }))
  assert.equal(cards.length, 2)
  for (const { hit, card } of cards) assert.equal(hit, card, "same position and size")
  assert.notEqual(cards[0].card, cards[1].card, "a card with a mitigation is taller")
})

test("every trace starts at a pad and is drawn twice, once as the wire and once for the moving signal", () => {
  const html = renderAttackPath(parseAttackPath("A -> B -> C"), "ap1")
  assert.equal((html.match(/class="ap-pad"/g) ?? []).length, 2)
  assert.equal((html.match(/class="ap-trace"/g) ?? []).length, 2)
  assert.equal((html.match(/class="ap-packet"/g) ?? []).length, 2)
})

const route = [
  { from: "a", to: "b" },
  { from: "b", to: "c" },
  { from: "c", to: "d" },
  { from: "c", to: "e" },
]

test("the main route follows the longest chain and leaves the other branches aside", () => {
  const depth = new Map([
    ["a", 0],
    ["b", 1],
    ["c", 2],
    ["d", 3],
    ["e", 3],
  ])
  assert.deepEqual([...mainRoute(route, depth, ["a", "b", "c", "d", "e"])].sort(), [
    "a>b",
    "b>c",
    "c>d",
  ])
})

test("long labels expand cards downward without truncation or overlapping rows", () => {
  const label = "Authorization rule matches the wrong management endpoint"
  const control = "Normalize the management root before constructing permission paths"
  const graph = parseAttackPath(
    `Attacker -> ${label} | Mitigation: ${control} -> Protected data\nAttacker -> Other branch`,
  )
  const layout = layoutAttackPath(graph)
  const card = layout.nodes.find((n) => n.node.label === label)!
  assert.equal(card.width, GEOMETRY.cardWidth)
  assert(card.height > GEOMETRY.headHeight + GEOMETRY.bodyHeight + GEOMETRY.footHeight)
  assert.equal(card.labelLines.join(" "), label)
  assert.equal(card.controlLines.join(" "), control)
  for (const { from, to } of layout.edges) assert(to.x > from.x + from.width)
  for (const node of layout.nodes) {
    assert(node.y + node.height <= layout.height)
    for (const other of layout.nodes) {
      if (node.row < other.row) assert(node.y + node.height < other.y)
    }
  }
  const html = renderAttackPath(graph, "long")
  assert(!html.includes("…"))
  assert(!html.includes("ap-count"))
})

test("unequal cards align at the top and share a stable connector height", () => {
  const graph = parseAttackPath(
    "Attacker with a long label that continues below the badge -> Short -> A much longer route label that wraps across multiple lines | Mitigation: A long mitigation that grows the card downward and must not move the connecting arrows -> Impact",
  )
  const layout = layoutAttackPath(graph)
  assert(new Set(layout.nodes.map((n) => n.height)).size > 1)
  assert.equal(new Set(layout.nodes.map((n) => n.anchorY)).size, 1)
  assert.equal(new Set(layout.nodes.map((n) => n.y)).size, 1)
  for (const node of layout.nodes) {
    assert(node.y >= GEOMETRY.padY)
    assert(node.y + node.height <= layout.height - GEOMETRY.padY)
    assert.equal(node.anchorY, node.y + GEOMETRY.headHeight + GEOMETRY.bodyHeight / 2)
  }
  for (const { from, to } of layout.edges) {
    assert(!tracePath(from.x + from.width, from.anchorY, to.x - 3, to.anchorY).includes("V"))
  }
})

test("tall forked cards remain separated and arrows bend only between columns", () => {
  const graph = parseAttackPath(
    "Attacker -> First -> Final\nFirst -> A branch with a long wrapping title | Mitigation: Keep this much taller branch clear of the main route and all other cards\nA branch with a long wrapping title -> Final",
  )
  const layout = layoutAttackPath(graph)
  for (const node of layout.nodes) {
    assert.equal(node.anchorY, node.y + GEOMETRY.headHeight + GEOMETRY.bodyHeight / 2)
    for (const other of layout.nodes) {
      if (node.row < other.row) assert(node.y + node.height + GEOMETRY.rowGap <= other.y)
    }
  }
  for (const { from, to } of layout.edges) {
    assert(from.x + from.width < to.x - 3)
    if (from.row === to.row) assert.equal(from.anchorY, to.anchorY)
  }
})

test("connections that skip taller cards get a clear lane outside all card bounds", () => {
  const layout = layoutAttackPath(
    parseAttackPath(
      "A -> B -> D\nB -> C | Mitigation: A very long mitigation to make this intermediate card tall\nC -> D",
    ),
  )
  const bypass = layout.edges.find((edge) => edge.to.col > edge.from.col + 1)!
  assert(bypass.viaY !== undefined)
  for (const node of layout.nodes) assert(bypass.viaY > node.y + node.height)
  assert(bypass.viaY < layout.height)
  const path = bypassPath(bypass.from, bypass.to, bypass.viaY)
  assert(path.includes(` ${bypass.viaY}`))
  assert(!path.includes("NaN"))
})
