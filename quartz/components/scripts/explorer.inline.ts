import { FolderState } from "../ExplorerNode"

type MaybeHTMLElement = HTMLElement | undefined
let currentExplorerState: FolderState[]

// every row the keyboard can land on: the pinned Explore link, folder rows and page links
const ROW_SELECTOR = ".explorer-pin, .folder-button, a.explorer-file"

function toggleExplorer(this: HTMLElement) {
  this.classList.toggle("collapsed")
  this.setAttribute(
    "aria-expanded",
    this.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )
  const content = this.nextElementSibling as MaybeHTMLElement
  if (!content) return

  content.classList.toggle("collapsed")
  content.inert = content.classList.contains("collapsed")
}

function toggleFolder(evt: MouseEvent) {
  evt.stopPropagation()
  const target = evt.target as MaybeHTMLElement
  if (!target) return

  const row = target.closest<HTMLElement>(".folder-container")
  const folder = row?.nextElementSibling as MaybeHTMLElement
  const path = row?.querySelector<HTMLElement>("[data-folderpath]")?.dataset.folderpath
  if (!folder || !path) return
  document
    .querySelectorAll(".explorer .folder-container.is-selected")
    .forEach((element) => element.classList.remove("is-selected"))
  row?.classList.add("is-selected")
  const collapsed = folder.classList.contains("open")
  setFolderState(folder, collapsed)
  const entry = currentExplorerState.find((entry) => entry.path === path)
  if (entry) entry.collapsed = collapsed
  if (document.getElementById("explorer")?.dataset.savestate === "true") {
    localStorage.setItem("fileTree", JSON.stringify(currentExplorerState))
  }
}

/**
 * The tree is one tab stop instead of one per row: Tab enters and leaves, the arrow keys move
 * between the rows that are currently visible, and Left/Right collapse, expand or step to the
 * parent. Without JavaScript every row simply stays tabbable.
 */
function setupRovingFocus(content: HTMLElement) {
  let current: HTMLElement | undefined

  const rows = () =>
    [...content.querySelectorAll<HTMLElement>(ROW_SELECTOR)].filter(
      (element) => !element.closest("[inert]") && element.getClientRects().length > 0,
    )

  function sync() {
    const visible = rows()
    if (!current || !visible.includes(current)) {
      current =
        visible.find((element) => element.getAttribute("aria-current") === "page") ?? visible[0]
    }
    content.querySelectorAll<HTMLElement>(ROW_SELECTOR).forEach((element) => {
      element.tabIndex = element === current ? 0 : -1
    })
  }

  function focusRow(element: HTMLElement | undefined) {
    if (!element) return
    current = element
    sync()
    element.focus()
  }

  function onKeyDown(event: KeyboardEvent) {
    const row = (event.target as HTMLElement).closest<HTMLElement>(ROW_SELECTOR)
    if (!row || event.altKey || event.ctrlKey || event.metaKey) return
    const visible = rows()
    const index = visible.indexOf(row)
    if (index === -1) return
    const isFolder = row.classList.contains("folder-button")
    const expanded = row.getAttribute("aria-expanded") === "true"

    switch (event.key) {
      case "ArrowDown":
        focusRow(visible[Math.min(index + 1, visible.length - 1)])
        break
      case "ArrowUp":
        focusRow(visible[Math.max(index - 1, 0)])
        break
      case "Home":
        focusRow(visible[0])
        break
      case "End":
        focusRow(visible.at(-1))
        break
      case "ArrowRight":
        if (!isFolder) return
        if (!expanded) {
          row.click()
          sync()
        } else focusRow(visible[index + 1])
        break
      case "ArrowLeft": {
        if (isFolder && expanded) {
          row.click()
          sync()
          break
        }
        // otherwise step out to the folder that contains this row
        const list = row.closest("ul[data-folderul]:not([data-folderul=''])")
        const parent = list
          ?.closest(".folder-outer")
          ?.previousElementSibling?.querySelector<HTMLElement>(".folder-button")
        if (!parent) return
        focusRow(parent)
        break
      }
      default:
        return
    }
    event.preventDefault()
  }

  function onFocusIn(event: FocusEvent) {
    const row = (event.target as HTMLElement).closest<HTMLElement>(ROW_SELECTOR)
    if (row && row !== current) {
      current = row
      sync()
    }
  }

  sync()
  content.addEventListener("keydown", onKeyDown)
  content.addEventListener("focusin", onFocusIn)

  // On small screens the explorer is a drawer that starts out inert, so there are no visible rows to
  // pick a tab stop from at setup time. Re-sync whenever the drawer opens or closes (or the window
  // crosses the breakpoint) so the current row is reachable by Tab as soon as it can be seen.
  const observer = new MutationObserver(sync)
  const drawer = content.closest<HTMLElement>(".explorer")
  if (drawer) observer.observe(drawer, { attributes: true, attributeFilter: ["inert", "class"] })
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] })
  window.addEventListener("resize", sync)

  window.addCleanup(() => {
    content.removeEventListener("keydown", onKeyDown)
    content.removeEventListener("focusin", onFocusIn)
    window.removeEventListener("resize", sync)
    observer.disconnect()
  })
}

/** Hairline when scrolled away from the top, fade at the bottom only while more content is below. */
function setupScrollCues(list: HTMLElement) {
  const update = () => {
    list.classList.toggle("is-scrolled", list.scrollTop > 2)
    list.classList.toggle(
      "can-scroll-more",
      list.scrollTop + list.clientHeight < list.scrollHeight - 2,
    )
  }
  update()
  list.addEventListener("scroll", update, { passive: true })
  // folders opening and closing change the scroll height without a scroll event
  list.addEventListener("transitionend", update)
  const observer = new ResizeObserver(update)
  observer.observe(list)
  if (list.firstElementChild) observer.observe(list.firstElementChild)
  window.addCleanup(() => {
    list.removeEventListener("scroll", update)
    list.removeEventListener("transitionend", update)
    observer.disconnect()
  })
}

function setupExplorer() {
  const explorer = document.getElementById("explorer")
  if (!explorer) return

  if (explorer.dataset.behavior === "collapse") {
    for (const item of document.getElementsByClassName(
      "folder-button",
    ) as HTMLCollectionOf<HTMLElement>) {
      item.addEventListener("click", toggleFolder)
      window.addCleanup(() => item.removeEventListener("click", toggleFolder))
    }
  }

  explorer.addEventListener("click", toggleExplorer)
  window.addCleanup(() => explorer.removeEventListener("click", toggleExplorer))

  // Set up click handlers for each folder (click handler on the separate chevron, "link" mode only)
  for (const item of document.getElementsByClassName(
    "folder-toggle",
  ) as HTMLCollectionOf<HTMLElement>) {
    item.addEventListener("click", toggleFolder)
    window.addCleanup(() => item.removeEventListener("click", toggleFolder))
  }

  // Get folder state from local storage
  const storageTree = localStorage.getItem("fileTree")
  const useSavedFolderState = explorer?.dataset.savestate === "true"
  let oldExplorerState: FolderState[] = []
  try {
    const parsed = storageTree && useSavedFolderState ? JSON.parse(storageTree) : []
    if (Array.isArray(parsed))
      oldExplorerState = parsed.filter(
        (entry) => entry && typeof entry.path === "string" && typeof entry.collapsed === "boolean",
      )
  } catch {
    /* Ignore stale browser state. */
  }
  const oldIndex = new Map(oldExplorerState.map((entry) => [entry.path, entry.collapsed]))
  const newExplorerState: FolderState[] = explorer.dataset.tree
    ? JSON.parse(explorer.dataset.tree)
    : []
  currentExplorerState = []
  for (const { path, collapsed } of newExplorerState) {
    currentExplorerState.push({ path, collapsed: oldIndex.get(path) ?? collapsed })
  }

  currentExplorerState.forEach((folderState) => {
    const folderLi = [...document.querySelectorAll<HTMLElement>("[data-folderpath]")].find(
      (element) => element.dataset.folderpath === folderState.path,
    )
    const folderUl = folderLi?.parentElement?.nextElementSibling as MaybeHTMLElement
    if (folderUl) {
      const active = document.querySelector(".explorer [aria-current='page']")
      const ancestor = active && folderUl.contains(active)
      const currentFolder = folderLi?.parentElement?.classList.contains("active")
      setFolderState(folderUl, ancestor || currentFolder ? false : folderState.collapsed)
    }
  })

  const list = document.getElementById("explorer-ul")
  const content = document.getElementById("explorer-content")
  if (list) setupScrollCues(list)
  if (content) setupRovingFocus(content)

  // Keep the user's position when the selected row is already visible.
  const frame = requestAnimationFrame(() => {
    const active = list?.querySelector<HTMLElement>(
      "[aria-current='page'], .folder-container.active",
    )
    if (!list?.clientHeight || !active) return
    const row = active.getBoundingClientRect()
    const viewport = list.getBoundingClientRect()
    if (row.top < viewport.top) list.scrollTop += row.top - viewport.top
    else if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom
  })
  window.addCleanup(() => cancelAnimationFrame(frame))
}

document.addEventListener("nav", setupExplorer)

/**
 * Toggles the state of a given folder
 * @param folderElement <div class="folder-outer"> Element of folder (parent)
 * @param collapsed if folder should be set to collapsed or not
 */
function setFolderState(folderElement: HTMLElement, collapsed: boolean) {
  folderElement.classList.toggle("open", !collapsed)
  folderElement.inert = collapsed
  const row = folderElement.previousElementSibling
  row
    ?.querySelectorAll("button")
    .forEach((button) => button.setAttribute("aria-expanded", String(!collapsed)))
}
