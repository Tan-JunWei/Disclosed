import {
  SNAP_DELAY_MS,
  ZoomModel,
  anchoredScroll,
  atMaxZoom,
  atMinZoom,
  centreOffset,
  fitZoom,
  maxZoomFor,
  pointUnder,
  snapStop,
} from "../../util/zoom"

// Hovering a step in the diagram or in the list highlights that step, its traces and its entry in
// the other view, and dims the rest. Touch screens have no hover, so there a tap highlights a step
// and keeps it lit: tapping it again, or tapping anywhere else, clears it.
function linkHover(figure: HTMLElement) {
  const nodes = [...figure.querySelectorAll<SVGElement>(".ap-node")]
  const edges = [...figure.querySelectorAll<SVGElement>(".ap-edge")]
  const steps = [...figure.querySelectorAll<HTMLElement>(".ap-step")]
  const targets = [...nodes, ...steps]

  const show = (id: string) => {
    figure.classList.add("is-linked")
    for (const el of targets) el.classList.toggle("is-active", el.dataset.node === id)
    for (const edge of edges) {
      edge.classList.toggle("is-active", edge.dataset.from === id || edge.dataset.to === id)
    }
  }
  const clear = () => {
    figure.classList.remove("is-linked")
    for (const el of [...nodes, ...edges, ...steps]) el.classList.remove("is-active")
  }

  // the step a tap has pinned, if any
  let pinned: string | undefined
  // a click carries no pointer type in every browser, so remember the one that started it
  let lastPointer = "mouse"
  const onDown = (event: PointerEvent) => {
    lastPointer = event.pointerType
  }
  document.addEventListener("pointerdown", onDown, { capture: true })

  for (const el of targets) {
    const id = el.dataset.node!
    const enter = (event: Event) => {
      if ((event as PointerEvent).pointerType !== "touch") show(id)
    }
    const leave = (event: Event) => {
      if ((event as PointerEvent).pointerType === "touch") return
      if (pinned) show(pinned)
      else clear()
    }
    const tap = () => {
      if (lastPointer !== "touch") return
      pinned = pinned === id ? undefined : id
      if (pinned) show(pinned)
      else clear()
    }
    el.addEventListener("pointerenter", enter)
    el.addEventListener("pointerleave", leave)
    el.addEventListener("click", tap)
    window.addCleanup(() => {
      el.removeEventListener("pointerenter", enter)
      el.removeEventListener("pointerleave", leave)
      el.removeEventListener("click", tap)
    })
  }

  // a tap anywhere outside the steps lets go of the pinned one
  const onOutside = (event: Event) => {
    if (!pinned) return
    const target = event.target as Element | null
    if (target && targets.some((el) => el.contains(target))) return
    pinned = undefined
    clear()
  }
  document.addEventListener("click", onOutside)
  window.addCleanup(() => {
    document.removeEventListener("pointerdown", onDown, { capture: true })
    document.removeEventListener("click", onOutside)
  })
}

// Ctrl + scroll (which is also how browsers report a trackpad pinch) zooms the diagram around the
// pointer, with the buttons and the + - 0 keys as alternatives and dragging to pan. A plain scroll
// is never captured, so the page keeps scrolling past the diagram. How the zoom feels (step size,
// resistance, settling) is all in ZoomModel, which is tested without a browser.
function setupZoom(figure: HTMLElement) {
  const viewport = figure.querySelector<HTMLElement>(".ap-viewport")
  const sizer = figure.querySelector<HTMLElement>(".ap-sizer")
  const canvas = figure.querySelector<HTMLElement>(".ap-canvas")
  const svg = figure.querySelector<SVGSVGElement>(".ap-svg")
  const tools = figure.querySelector<HTMLElement>(".ap-tools")
  const level = figure.querySelector<HTMLElement>(".ap-zoom-level")
  const zoomIn = figure.querySelector<HTMLElement>('[data-zoom="in"]')
  const zoomOut = figure.querySelector<HTMLElement>('[data-zoom="out"]')
  if (!viewport || !sizer || !canvas || !svg || !tools || !level || !zoomIn || !zoomOut) return

  const natural = { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height }
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
  // The model's zoom is relative to the fitted view (100% is the whole diagram fitted to its box).
  // `scale` is what that means in drawn size: 1 would be the diagram's natural size.
  // the box never grows past this height, so a tall diagram is fitted to it as well as to the width
  const maxBoxHeight = 544
  const boxPadding = 8
  const fitNow = () =>
    fitZoom(viewport.clientWidth, natural.width, maxBoxHeight - boxPadding, natural.height)
  const scale = (zoom: number) => zoom * fitNow()

  const model = new ZoomModel(1, 1, maxZoomFor(fitNow()))
  let anchor: { px: number; py: number; cx: number; cy: number } | undefined
  let frame = 0
  let last = 0
  let snapTimer = 0

  const offsets = (z: number) => ({
    x: centreOffset(viewport.clientWidth, natural.width, z),
    y: centreOffset(viewport.clientHeight, natural.height, z),
  })

  const render = () => {
    const zoom = scale(model.shown)
    const { x, y } = offsets(zoom)
    sizer.style.width = `${natural.width * zoom}px`
    sizer.style.height = `${natural.height * zoom}px`
    sizer.style.marginTop = `${y}px`
    // Resize the SVG itself rather than scaling it with a CSS transform: a transformed SVG is rasterised
    // once and stretched (or re-rasterised in steps) and blurs, while a resized one is redrawn as
    // vectors at exactly the size shown.
    svg.style.width = `${natural.width * zoom}px`
    svg.style.height = `${natural.height * zoom}px`
    level.textContent = `${Math.round(model.shown * 100)}%`
    // a button whose limit has been reached says so (aria-disabled, so it keeps keyboard focus)
    zoomIn.setAttribute("aria-disabled", String(atMaxZoom(model.shown, model.max)))
    zoomOut.setAttribute("aria-disabled", String(atMinZoom(model.shown)))
    // the dot grid belongs to the diagram, so it scales and shifts with it
    viewport.style.setProperty("--ap-zoom", String(zoom))
    viewport.style.backgroundPosition = `${x}px ${y}px, 0 0`
    if (anchor) {
      viewport.scrollLeft = anchoredScroll(anchor.cx, anchor.px, zoom, x)
      viewport.scrollTop = anchoredScroll(anchor.cy, anchor.py, zoom, y)
    }
    viewport.classList.toggle(
      "can-pan",
      natural.width * zoom > viewport.clientWidth || natural.height * zoom > viewport.clientHeight,
    )
  }

  const tick = (now: number) => {
    const resting = model.step(Math.min(now - last, 64))
    last = now
    render()
    if (resting) {
      frame = 0
      anchor = undefined
    } else {
      frame = requestAnimationFrame(tick)
    }
  }

  const run = () => {
    if (reducedMotion.matches) {
      model.shown = model.target
      render()
      anchor = undefined
    } else if (!frame) {
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }
  }

  // keep the diagram point at (px, py) of the viewport where it is while the zoom changes
  const holdPoint = (px: number, py: number) => {
    const zoom = scale(model.shown)
    const { x, y } = offsets(zoom)
    anchor = {
      px,
      py,
      cx: pointUnder(px, viewport.scrollLeft, zoom, x),
      cy: pointUnder(py, viewport.scrollTop, zoom, y),
    }
  }

  const centre = () => ({ px: viewport.clientWidth / 2, py: viewport.clientHeight / 2 })
  const step = (factor: number) => {
    holdPoint(centre().px, centre().py)
    model.aim(model.target * factor)
    run()
  }
  const fit = () => {
    holdPoint(centre().px, centre().py)
    model.aim(1)
    viewport.scrollTo({ left: 0, top: 0 })
    run()
  }

  // after a pause, a zoom that is already close to 100% or to "fit" settles onto it
  const settleSoon = () => {
    window.clearTimeout(snapTimer)
    snapTimer = window.setTimeout(() => {
      const stop = snapStop(model.target, [1])
      if (stop === undefined || stop === model.target) return
      model.aim(stop)
      run()
    }, SNAP_DELAY_MS)
  }

  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return
    event.preventDefault()
    const box = viewport.getBoundingClientRect()
    holdPoint(event.clientX - box.left, event.clientY - box.top)
    model.push(event.deltaY, event.deltaMode)
    run()
    settleSoon()
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === "+" || event.key === "=") step(1.25)
    else if (event.key === "-" || event.key === "_") step(0.8)
    else if (event.key === "0") fit()
    else return
    event.preventDefault()
  }

  const onTool = (event: Event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>("[data-zoom]")?.dataset.zoom
    if (action === "in") step(1.25)
    else if (action === "out") step(0.8)
    else if (action === "fit") fit()
  }

  // drag to pan with a mouse (touch already scrolls natively)
  let drag: { x: number; y: number; left: number; top: number } | undefined
  const onDown = (event: PointerEvent) => {
    if (
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      !viewport.classList.contains("can-pan")
    )
      return
    drag = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    }
    viewport.setPointerCapture(event.pointerId)
    viewport.classList.add("is-panning")
  }
  const onMove = (event: PointerEvent) => {
    if (!drag) return
    viewport.scrollLeft = drag.left - (event.clientX - drag.x)
    viewport.scrollTop = drag.top - (event.clientY - drag.y)
  }
  const onUp = (event: PointerEvent) => {
    if (!drag) return
    drag = undefined
    viewport.releasePointerCapture(event.pointerId)
    viewport.classList.remove("is-panning")
  }

  // the box takes the fitted diagram's height and keeps it while zooming, so zooming never moves the
  // rest of the page. Only a change of width (a rotated phone, a resized window) refits it.
  const sizeBox = () =>
    viewport.style.setProperty(
      "--ap-height",
      `${Math.min(natural.height * fitNow() + boxPadding, maxBoxHeight)}px`,
    )
  sizeBox()
  tools.hidden = false
  render()

  // Chrome can keep a stale or half-painted copy of the diagram from its very first paint (fonts and
  // images arrive after it) until something forces a repaint, which is what pressing the 100% button
  // does. Do the same once the page has settled, if the diagram has not been touched since.
  const refresh = () => {
    if (model.target !== 1 || drag) return
    fit()
  }
  const refreshSoon = () => requestAnimationFrame(() => requestAnimationFrame(refresh))
  document.fonts?.ready.then(refreshSoon)
  if (document.readyState !== "complete")
    window.addEventListener("load", refreshSoon, { once: true })

  // the zoom stays where it is relative to the fitted view, so a resize rescales the diagram with it
  let boxWidth = viewport.clientWidth
  const resize = new ResizeObserver(() => {
    if (viewport.clientWidth !== boxWidth) {
      boxWidth = viewport.clientWidth
      sizeBox()
    }
    model.max = maxZoomFor(fitNow())
    render()
  })
  resize.observe(viewport)

  viewport.addEventListener("wheel", onWheel, { passive: false })
  viewport.addEventListener("keydown", onKey)
  viewport.addEventListener("pointerdown", onDown)
  viewport.addEventListener("pointermove", onMove)
  viewport.addEventListener("pointerup", onUp)
  viewport.addEventListener("pointercancel", onUp)
  tools.addEventListener("click", onTool)
  window.addCleanup(() => {
    cancelAnimationFrame(frame)
    window.clearTimeout(snapTimer)
    resize.disconnect()
    viewport.removeEventListener("wheel", onWheel)
    viewport.removeEventListener("keydown", onKey)
    viewport.removeEventListener("pointerdown", onDown)
    viewport.removeEventListener("pointermove", onMove)
    viewport.removeEventListener("pointerup", onUp)
    viewport.removeEventListener("pointercancel", onUp)
    tools.removeEventListener("click", onTool)
  })
}

function setupAttackPaths() {
  for (const figure of document.querySelectorAll<HTMLElement>("[data-attack-path]")) {
    linkHover(figure)
    setupZoom(figure)
  }
}

document.addEventListener("nav", setupAttackPaths)
