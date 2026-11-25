import { computePosition, flip, inline, shift } from "@floating-ui/dom"
import { normalizeRelativeURLs } from "../../util/path"

const p = new DOMParser()
async function mouseEnterHandler(
  this: HTMLAnchorElement,
  { clientX, clientY }: { clientX: number; clientY: number },
) {
  const link = this
  if (link.dataset.noPopover === "true") {
    return
  }

  async function setPosition(popoverElement: HTMLElement) {
    const { x, y } = await computePosition(link, popoverElement, {
      middleware: [inline({ x: clientX, y: clientY }), shift(), flip()],
    })
    Object.assign(popoverElement.style, {
      left: `${x}px`,
      top: `${y}px`,
    })
  }

  const hasAlreadyBeenFetched = () =>
    [...link.children].some((child) => child.classList.contains("popover"))

  // dont refetch if there's already a popover
  if (hasAlreadyBeenFetched()) {
    return setPosition(link.lastChild as HTMLElement)
  }

  const thisUrl = new URL(document.location.href)
  thisUrl.hash = ""
  thisUrl.search = ""
  const targetUrl = new URL(link.href)
  const hash = decodeURIComponent(targetUrl.hash)
  targetUrl.hash = ""
  targetUrl.search = ""

  const response = await fetch(`${targetUrl}`).catch((err) => {
    console.error(err)
  })
  // Stops the download once the headers say there is nothing to preview, so hovering a link to a
  // large file (a disk image, an audio clip) does not fetch the whole file.
  const discard = () => void response?.body?.cancel().catch(() => {})

  // bailout if another popover exists
  if (hasAlreadyBeenFetched()) return discard()
  if (!response) return

  const contentType = (response.headers.get("Content-Type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase()
  const isHtml = contentType === "text/html"
  const isImage = contentType.startsWith("image/")
  const isPdf = contentType === "application/pdf"
  if (!response.ok || !(isHtml || isImage || isPdf)) return discard()

  const popoverElement = document.createElement("div")
  popoverElement.classList.add("popover")
  const popoverInner = document.createElement("div")
  popoverInner.classList.add("popover-inner")
  popoverElement.appendChild(popoverInner)
  popoverInner.dataset.contentType = contentType

  if (isImage) {
    discard()
    const img = document.createElement("img")
    img.src = targetUrl.toString()
    img.alt = targetUrl.pathname
    popoverInner.appendChild(img)
  } else if (isPdf) {
    discard()
    const pdf = document.createElement("iframe")
    pdf.src = targetUrl.toString()
    popoverInner.appendChild(pdf)
  } else {
    const html = p.parseFromString(await response.text(), "text/html")
    normalizeRelativeURLs(html, targetUrl)
    const elts = [...html.getElementsByClassName("popover-hint")]
    if (elts.length === 0 || hasAlreadyBeenFetched()) return
    elts.forEach((elt) => popoverInner.appendChild(elt))
  }

  setPosition(popoverElement)
  link.appendChild(popoverElement)

  if (hash !== "") {
    const heading = popoverInner.querySelector(hash) as HTMLElement | null
    if (heading) {
      // leave ~12px of buffer when scrolling to a heading
      popoverInner.scroll({ top: heading.offsetTop - 12, behavior: "instant" })
    }
  }
}

document.addEventListener("nav", () => {
  const links = [...document.getElementsByClassName("internal")] as HTMLAnchorElement[]
  for (const link of links) {
    link.addEventListener("mouseenter", mouseEnterHandler)
    window.addCleanup(() => link.removeEventListener("mouseenter", mouseEnterHandler))
  }
})
