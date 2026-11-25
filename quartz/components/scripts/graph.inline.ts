import type * as GraphView from "./graph/view"
import { addToVisited } from "./graph/visited"
import { FullSlug, getFullSlug, simplifySlug } from "../../util/path"

// The renderer (and d3 with it) is a separate module, fetched the first time a graph is shown.
let view: Promise<typeof GraphView> | undefined
function loadView(): Promise<typeof GraphView> | undefined {
  const src = document.querySelector<HTMLElement>(".graph[data-module-src]")?.dataset.moduleSrc
  if (!src) return undefined
  if (!view) {
    view = import(/* @vite-ignore */ new URL(src, window.location.href).href)
    // a failed download is retried next time instead of leaving the graph broken until a reload
    view.catch(() => (view = undefined))
  }
  return view
}

async function showGraph(container: string, slug: FullSlug) {
  try {
    const module = await loadView()
    await module?.renderGraph(container, slug)
  } catch (error) {
    console.warn("Graph unavailable:", error)
  }
}

function renderGlobalGraph() {
  const slug = getFullSlug(window)
  const container = document.getElementById("global-graph-outer")
  const sidebar = container?.closest(".sidebar") as HTMLElement
  container?.classList.add("active")
  if (sidebar) {
    sidebar.style.zIndex = "1"
  }

  void showGraph("global-graph-container", slug)
  const closeButton = document.getElementById("global-graph-close") as HTMLButtonElement | null
  closeButton?.focus()
  function handleKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault()
      hideGlobalGraph()
    } else if (event.key === "Tab") {
      const focusable = [...container!.querySelectorAll<HTMLElement>("button, [tabindex='0']")]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  }
  function handleBackdrop(event: MouseEvent) {
    if (event.target === container) hideGlobalGraph()
  }
  function hideGlobalGraph() {
    container?.classList.remove("active")
    document.removeEventListener("keydown", handleKey)
    container?.removeEventListener("click", handleBackdrop)
    const graph = document.getElementById("global-graph-container")
    if (sidebar) sidebar.style.zIndex = "unset"
    if (graph) void view?.then((module) => module.clearGraph(graph))
    document.getElementById("global-graph-icon")?.focus()
  }

  document.addEventListener("keydown", handleKey)
  container?.addEventListener("click", handleBackdrop)
  if (closeButton) closeButton.onclick = hideGlobalGraph
  window.addCleanup(() => {
    document.removeEventListener("keydown", handleKey)
    container?.removeEventListener("click", handleBackdrop)
  })
}

document.addEventListener("nav", (e: CustomEventMap["nav"]) => {
  const slug = e.detail.url
  addToVisited(simplifySlug(slug))

  // The layout is a force simulation, so it only starts once the graph is on screen. Where the
  // sidebar is hidden (narrow screens) it never runs, and below the article it waits for a scroll.
  const local = document.getElementById("graph-container")
  if (local) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void showGraph("graph-container", slug)
      },
      { rootMargin: "200px" },
    )
    observer.observe(local)
    window.addCleanup(() => observer.disconnect())
  }

  const containerIcon = document.getElementById("global-graph-icon")
  containerIcon?.addEventListener("click", renderGlobalGraph)
  window.addCleanup(() => containerIcon?.removeEventListener("click", renderGlobalGraph))
})
