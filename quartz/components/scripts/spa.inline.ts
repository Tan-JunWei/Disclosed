import micromorph from "micromorph"
import { FullSlug, RelativeURL, getFullSlug, normalizeRelativeURLs } from "../../util/path"

// adapted from `micromorph`
// https://github.com/natemoo-re/micromorph
const NODE_TYPE_ELEMENT = 1
let announcer = document.createElement("route-announcer")
const isElement = (target: EventTarget | null): target is Element =>
  (target as Node)?.nodeType === NODE_TYPE_ELEMENT
const isLocalUrl = (href: string) => {
  try {
    const url = new URL(href, document.baseURI)
    if (window.location.origin === url.origin) {
      return true
    }
  } catch (e) {}
  return false
}

const isSamePage = (url: URL): boolean => {
  const sameOrigin = url.origin === window.location.origin
  const samePath = url.pathname === window.location.pathname
  return sameOrigin && samePath
}

const getOpts = ({ target }: Event): { url: URL; scroll?: boolean } | undefined => {
  if (!isElement(target)) return
  if (target.attributes.getNamedItem("target")?.value === "_blank") return
  const a = target.closest("a")
  if (!a) return
  if ("routerIgnore" in a.dataset) return
  // SVGAElement.href is an SVGAnimatedString, not a plain string like HTMLAnchorElement.href
  const href = a instanceof SVGAElement ? a.href.baseVal : a.href
  if (!isLocalUrl(href) || a.hasAttribute("download")) return
  // attachments (images, archives, audio) are left to the browser, which can stream or save them
  const url = new URL(href, document.baseURI)
  if (/\/(Assets|static)\//.test(url.pathname)) return
  return {
    url,
    scroll: "routerNoscroll" in a.dataset ? false : undefined,
  }
}

function notifyNav(url: FullSlug) {
  const event: CustomEventMap["nav"] = new CustomEvent("nav", { detail: { url } })
  document.dispatchEvent(event)
}

const cleanupFns: Set<(...args: any[]) => void> = new Set()
window.addCleanup = (fn) => cleanupFns.add(fn)

/** The build version in the asset URLs, so a tab opened before a deploy can tell it is stale. */
const buildVersion = (doc: Document) =>
  doc.querySelector<HTMLScriptElement>('script[src*="postscript.js"]')?.src.split("?v=")[1]

let p: DOMParser
let latestNavigation = 0
async function navigate(url: URL, isBack: boolean = false) {
  const fullLoad = () => (isBack ? window.location.reload() : window.location.assign(url))
  try {
    await swapPage(url, isBack, ++latestNavigation, fullLoad)
  } catch (error) {
    console.error("Navigation failed, loading the page normally:", error)
    fullLoad()
  }
}

async function swapPage(url: URL, isBack: boolean, navigation: number, fullLoad: () => void) {
  p = p || new DOMParser()
  let contents: string | undefined
  try {
    const res = await fetch(`${url}`)
    if (res.headers.get("content-type")?.startsWith("text/html")) {
      contents = await res.text()
    } else {
      void res.body?.cancel().catch(() => {})
      return fullLoad()
    }
  } catch {
    return fullLoad()
  }

  // a later click won the race, so this page is no longer wanted
  if (navigation !== latestNavigation) return

  // cleanup old
  cleanupFns.forEach((fn) => fn())
  cleanupFns.clear()

  const html = p.parseFromString(contents, "text/html")
  // after a deploy the new page may need scripts and styles this tab does not have
  const nextVersion = buildVersion(html)
  if (nextVersion && nextVersion !== buildVersion(document)) return fullLoad()
  normalizeRelativeURLs(html, url)

  let title = html.querySelector("title")?.textContent
  if (title) {
    document.title = title
  } else {
    const h1 = document.querySelector("h1")
    title = h1?.innerText ?? h1?.textContent ?? url.pathname
  }
  if (announcer.textContent !== title) {
    announcer.textContent = title
  }
  announcer.dataset.persist = ""
  html.body.appendChild(announcer)

  // morph body
  micromorph(document.body, html.body)

  // scroll into place and add history
  if (!isBack) {
    if (url.hash) {
      const el = document.getElementById(decodeURIComponent(url.hash.substring(1)))
      el?.scrollIntoView()
    } else {
      window.scrollTo({ top: 0 })
    }
  }

  // now, patch head
  const elementsToRemove = document.head.querySelectorAll(":not([spa-preserve])")
  elementsToRemove.forEach((el) => el.remove())
  const elementsToAdd = html.head.querySelectorAll(":not([spa-preserve])")
  elementsToAdd.forEach((el) => document.head.appendChild(el))
  // preserved stylesheets stay for the whole visit, but a page can need one the first page did not
  // (KaTeX is only linked from pages with math). The query string is a build version, so ignore it.
  const withoutQuery = (href: string) => href.split("?")[0]
  const loaded = new Set(
    [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((link) =>
      withoutQuery(link.href),
    ),
  )
  html.head
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][spa-preserve]')
    .forEach((link) => {
      if (!loaded.has(withoutQuery(link.href))) document.head.appendChild(link)
    })

  // delay setting the url until now
  // at this point everything is loaded so changing the url should resolve to the correct addresses
  if (!isBack) {
    history.pushState({}, "", url)
  }
  notifyNav(getFullSlug(window))
  delete announcer.dataset.persist
}

window.spaNavigate = navigate

function createRouter() {
  if (typeof window !== "undefined") {
    window.addEventListener("click", async (event) => {
      const { url } = getOpts(event) ?? {}
      // dont hijack behaviour, just let browser act normally
      if (
        !url ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      event.preventDefault()

      if (isSamePage(url) && url.hash) {
        const el = document.getElementById(decodeURIComponent(url.hash.substring(1)))
        el?.scrollIntoView()
        history.pushState({}, "", url)
        return
      }

      void navigate(url, false)
    })

    window.addEventListener("popstate", (event) => {
      const { url } = getOpts(event) ?? {}
      if (window.location.hash && window.location.pathname === url?.pathname) return
      void navigate(new URL(window.location.toString()), true)
    })
  }

  return new (class Router {
    go(pathname: RelativeURL) {
      const url = new URL(pathname, window.location.toString())
      return navigate(url, false)
    }

    back() {
      return window.history.back()
    }

    forward() {
      return window.history.forward()
    }
  })()
}

createRouter()
notifyNav(getFullSlug(window))

if (!customElements.get("route-announcer")) {
  const attrs = {
    "aria-live": "assertive",
    "aria-atomic": "true",
    style:
      "position: absolute; left: 0; top: 0; clip: rect(0 0 0 0); clip-path: inset(50%); overflow: hidden; white-space: nowrap; width: 1px; height: 1px",
  }

  customElements.define(
    "route-announcer",
    class RouteAnnouncer extends HTMLElement {
      constructor() {
        super()
      }
      connectedCallback() {
        for (const [key, value] of Object.entries(attrs)) {
          this.setAttribute(key, value)
        }
      }
    },
  )
}
