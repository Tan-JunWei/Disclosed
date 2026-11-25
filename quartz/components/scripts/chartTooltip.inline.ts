import { escapeHTML } from "../../util/escape"
import { tooltipPosition } from "../../util/tooltipPosition"

let tooltipEl: HTMLDivElement | null = null

function ensureTooltip(): HTMLDivElement {
  // SPA nav morphs document.body and detaches this, but the module-level reference survives
  if (!tooltipEl || !tooltipEl.isConnected) {
    tooltipEl = document.createElement("div")
    tooltipEl.className = "chart-tooltip"
    tooltipEl.setAttribute("role", "tooltip")
    document.body.appendChild(tooltipEl)
  }
  return tooltipEl
}

function showTooltipContent(target: Element, html: string) {
  const tip = ensureTooltip()
  tip.innerHTML = html
  tip.classList.add("visible")

  // the tooltip is absolutely positioned in the document, so viewport coordinates gain the scroll
  const { x, y } = tooltipPosition(
    target.getBoundingClientRect(),
    { width: tip.offsetWidth, height: tip.offsetHeight },
    { width: document.documentElement.clientWidth, height: window.innerHeight },
  )
  Object.assign(tip.style, { left: `${x + window.scrollX}px`, top: `${y + window.scrollY}px` })
}

function hideTooltip() {
  tooltipEl?.classList.remove("visible")
}

function setupChartTooltips() {
  const targets = document.querySelectorAll<HTMLElement>("[data-tooltip], [data-tooltip-html]")
  for (const target of targets) {
    const onEnter = () => {
      const html = target.dataset.tooltipHtml
      if (html) {
        showTooltipContent(target, html)
      } else if (target.dataset.tooltip) {
        showTooltipContent(target, escapeHTML(target.dataset.tooltip))
      }
    }
    target.addEventListener("mouseenter", onEnter)
    target.addEventListener("focus", onEnter)
    target.addEventListener("mouseleave", hideTooltip)
    target.addEventListener("blur", hideTooltip)
    window.addCleanup(() => {
      target.removeEventListener("mouseenter", onEnter)
      target.removeEventListener("focus", onEnter)
      target.removeEventListener("mouseleave", hideTooltip)
      target.removeEventListener("blur", hideTooltip)
    })
  }

  window.addCleanup(hideTooltip)
}

function setupRatingLinking() {
  const allEls = [...document.querySelectorAll<HTMLElement>("[data-rating]")]
  if (allEls.length === 0) return

  function activate(key: string) {
    for (const el of allEls) {
      const match = el.dataset.rating === key
      el.classList.toggle("hd-diff-active", match)
      el.classList.toggle("hd-diff-dim", !match)
    }
  }
  function clear() {
    for (const el of allEls) {
      el.classList.remove("hd-diff-active", "hd-diff-dim")
    }
  }

  for (const el of allEls) {
    const key = el.dataset.rating!
    const onEnter = () => activate(key)
    el.addEventListener("mouseenter", onEnter)
    el.addEventListener("focus", onEnter)
    el.addEventListener("mouseleave", clear)
    el.addEventListener("blur", clear)
    window.addCleanup(() => {
      el.removeEventListener("mouseenter", onEnter)
      el.removeEventListener("focus", onEnter)
      el.removeEventListener("mouseleave", clear)
      el.removeEventListener("blur", clear)
    })
  }
  window.addCleanup(clear)
}

document.addEventListener("nav", () => {
  setupChartTooltips()
  setupRatingLinking()
})
