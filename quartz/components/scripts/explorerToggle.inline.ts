function isExplorerOpen(): boolean {
  return document.body.classList.contains("explorer-open")
}

function setToggleState(toggle: HTMLElement, open: boolean) {
  document.body.classList.toggle("explorer-open", open)
  toggle.setAttribute("aria-expanded", open ? "true" : "false")
}

function setupExplorerToggle() {
  const toggle = document.getElementById("explorer-toggle")
  const backdrop = document.getElementById("explorer-backdrop")
  const closeButton = document.getElementById("explorer-close")
  const explorerContent = document.getElementById("explorer-content")
  const drawer = document.querySelector<HTMLElement>(".explorer")
  if (!toggle || !drawer) return
  const mobile = () => getComputedStyle(drawer!).position === "fixed"
  function syncDrawer() {
    drawer!.inert = mobile() && !isExplorerOpen()
  }
  function change(open: boolean, focus = true) {
    setToggleState(toggle!, open)
    syncDrawer()
    if (focus) (open ? closeButton : toggle)?.focus()
  }

  change(false, false)

  function handleToggleClick(evt: MouseEvent) {
    evt.stopPropagation()
    change(!isExplorerOpen())
  }

  function handleBackdropClick() {
    change(false)
  }

  function handleCloseClick(evt: MouseEvent) {
    evt.stopPropagation()
    change(false)
  }

  function handleKeydown(evt: KeyboardEvent) {
    if (!isExplorerOpen()) return
    if (evt.key === "Escape") change(false)
    if (evt.key === "Tab" && mobile()) {
      const elements = [...drawer!.querySelectorAll<HTMLElement>("a[href], button")].filter(
        (element) =>
          !element.closest("[inert]") &&
          element.getClientRects().length > 0 &&
          element.tabIndex >= 0,
      )
      const first = elements[0]
      const last = elements.at(-1)
      if (evt.shiftKey && document.activeElement === first) {
        evt.preventDefault()
        last?.focus()
      } else if (!evt.shiftKey && document.activeElement === last) {
        evt.preventDefault()
        first?.focus()
      }
    }
  }

  function handleContentClick(evt: MouseEvent) {
    const target = evt.target as HTMLElement
    if (target.closest("a")) {
      change(false)
    }
  }

  window.addEventListener("resize", syncDrawer)
  toggle.addEventListener("click", handleToggleClick)
  backdrop?.addEventListener("click", handleBackdropClick)
  closeButton?.addEventListener("click", handleCloseClick)
  document.addEventListener("keydown", handleKeydown)
  explorerContent?.addEventListener("click", handleContentClick)

  window.addCleanup(() => {
    window.removeEventListener("resize", syncDrawer)
    toggle.removeEventListener("click", handleToggleClick)
    backdrop?.removeEventListener("click", handleBackdropClick)
    closeButton?.removeEventListener("click", handleCloseClick)
    document.removeEventListener("keydown", handleKeydown)
    explorerContent?.removeEventListener("click", handleContentClick)
  })
}

document.addEventListener("nav", setupExplorerToggle)
