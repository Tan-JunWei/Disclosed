import { autoUpdate, computePosition, flip, inline, shift } from "@floating-ui/dom"
import { normalizeRelativeURLs } from "../../util/path"

const parser = new DOMParser()
let pending: AbortController | undefined
let currentLink: HTMLAnchorElement | undefined
let preview: HTMLElement | undefined
let stopPositioning: (() => void) | undefined
let openTimer: number | undefined
let closeTimer: number | undefined

function closePreview() {
  window.clearTimeout(openTimer)
  window.clearTimeout(closeTimer)
  pending?.abort()
  stopPositioning?.()
  preview?.remove()
  pending = undefined
  stopPositioning = undefined
  preview = undefined
  currentLink = undefined
}

function closeSoon() {
  window.clearTimeout(closeTimer)
  closeTimer = window.setTimeout(closePreview, 120)
}

async function showPreview(link: HTMLAnchorElement, { clientX, clientY }: PointerEvent) {
  const target = new URL(link.href)
  if (target.origin !== location.origin) return
  const hash = target.hash.slice(1)
  target.hash = ""
  target.search = ""

  const request = new AbortController()
  pending = request
  const { signal } = request
  try {
    const response = await fetch(target, { signal })
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase()
    const isHtml = contentType === "text/html"
    const isImage = contentType.startsWith("image/")
    const isPdf = contentType === "application/pdf"
    if (!response.ok || !(isHtml || isImage || isPdf)) {
      void response.body?.cancel().catch(() => {})
      return
    }

    const inner = document.createElement("div")
    inner.className = "popover-inner"
    inner.dataset.contentType = contentType
    if (isHtml) {
      const html = parser.parseFromString(await response.text(), "text/html")
      normalizeRelativeURLs(html, response.url || target)
      inner.append(...html.querySelectorAll(".popover-hint"))
      if (!inner.childElementCount) return
    } else {
      void response.body?.cancel().catch(() => {})
      if (isImage) {
        const image = document.createElement("img")
        image.src = target.href
        image.alt = target.pathname
        inner.append(image)
      } else {
        const pdf = document.createElement("iframe")
        pdf.src = target.href
        pdf.title = "PDF preview"
        inner.append(pdf)
      }
    }

    if (signal.aborted || !link.isConnected) return
    const element = document.createElement("div")
    element.className = "popover"
    element.append(inner)
    // The preview lives outside the article so copying a paragraph only copies the link text.
    document.body.append(element)
    preview = element
    element.addEventListener("pointerenter", () => window.clearTimeout(closeTimer))
    element.addEventListener("pointerleave", closeSoon)
    stopPositioning = autoUpdate(link, element, () => {
      void computePosition(link, element, {
        strategy: "fixed",
        middleware: [inline({ x: clientX, y: clientY }), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        if (signal.aborted) return
        element.style.left = `${x}px`
        element.style.top = `${y}px`
        element.classList.add("is-open")
      })
    })

    if (hash) {
      const heading = inner.querySelector<HTMLElement>(`#${CSS.escape(decodeURIComponent(hash))}`)
      if (heading) inner.scrollTop = Math.max(0, heading.offsetTop - 12)
    }
  } catch (error) {
    if (!signal.aborted) console.debug("Link preview unavailable", error)
  }
}

function onEnter(this: HTMLAnchorElement, event: PointerEvent) {
  if (event.pointerType === "touch" || event.buttons || this.dataset.noPopover === "true") return
  if (currentLink === this) {
    window.clearTimeout(closeTimer)
    return
  }
  closePreview()
  currentLink = this
  openTimer = window.setTimeout(() => void showPreview(this, event), 180)
}

function onLeave() {
  if (preview) closeSoon()
  else closePreview()
}

document.addEventListener("nav", () => {
  if (!matchMedia("(any-hover: hover)").matches) return
  const links = document.querySelectorAll<HTMLAnchorElement>("a.internal")
  for (const link of links) {
    link.addEventListener("pointerenter", onEnter)
    link.addEventListener("pointerleave", onLeave)
  }
  window.addCleanup(() => {
    closePreview()
    for (const link of links) {
      link.removeEventListener("pointerenter", onEnter)
      link.removeEventListener("pointerleave", onLeave)
    }
  })
})
