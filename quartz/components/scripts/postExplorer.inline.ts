import {
  FacetName,
  ExplorerState,
  defaultState,
  stateFromURL,
  stateToQuery,
  cardMatches,
  fuzzySearchScore,
} from "../../util/postFilters"
import { SEVERITY_HUE, Severity } from "../../util/ratings"

function stateToURL(state: ExplorerState) {
  const query = stateToQuery(state)
  const url = window.location.pathname + (query ? `?${query}` : "") + window.location.hash
  if (url !== window.location.pathname + window.location.search + window.location.hash)
    history.pushState({}, "", url)
}

function sortCards(cards: HTMLElement[], sort: string): HTMLElement[] {
  const rank = (c: HTMLElement) => Number(c.dataset.ratingRank) || Infinity
  const date = (c: HTMLElement) => Number(c.dataset.date) || 0
  const title = (c: HTMLElement) => c.dataset.title ?? ""

  const sorted = [...cards]
  switch (sort) {
    case "oldest":
      sorted.sort((a, b) => date(a) - date(b))
      break
    case "name":
      sorted.sort((a, b) => title(a).localeCompare(title(b)))
      break
    case "rating":
    case "difficulty":
      sorted.sort((a, b) => rank(a) - rank(b) || title(a).localeCompare(title(b)))
      break
    case "newest":
    default:
      sorted.sort((a, b) => date(b) - date(a))
      break
  }
  return sorted
}

function setupDropdown(root: HTMLElement, onChange: (value: string) => void) {
  const trigger = root.querySelector<HTMLButtonElement>(".wc-select-trigger")
  const menu = root.querySelector<HTMLUListElement>(".wc-select-menu")
  const valueLabel = root.querySelector<HTMLElement>(".wc-select-value")
  const options = [...root.querySelectorAll<HTMLLIElement>('[role="option"]')]
  if (!trigger || !menu || !valueLabel || options.length === 0) {
    return { setValue: () => {} }
  }

  function isOpen() {
    return root.dataset.open === "true"
  }

  function focusableOptions() {
    return options
  }

  function open(focusSelected: boolean) {
    root.dataset.open = "true"
    menu!.inert = false
    menu!.hidden = false
    trigger!.setAttribute("aria-expanded", "true")
    if (focusSelected) {
      const current = options.find((o) => o.getAttribute("aria-selected") === "true") ?? options[0]
      current.focus()
    }
  }

  function close(returnFocus: boolean) {
    root.dataset.open = "false"
    menu!.inert = true
    menu!.hidden = true
    trigger!.setAttribute("aria-expanded", "false")
    if (returnFocus) trigger!.focus()
  }

  // `silent` skips onChange when syncing to state that changed elsewhere (e.g. Clear filters)
  function selectOption(option: HTMLLIElement, silent = false) {
    const value = option.dataset.value ?? ""
    for (const o of options) {
      const selected = o === option
      o.setAttribute("aria-selected", String(selected))
      o.tabIndex = selected ? 0 : -1
    }
    valueLabel!.textContent = option.textContent
    if (!silent) onChange(value)
  }

  function moveFocus(delta: number) {
    const opts = focusableOptions()
    const currentIndex = opts.indexOf(document.activeElement as HTMLLIElement)
    const nextIndex = (currentIndex + delta + opts.length) % opts.length
    opts[nextIndex]?.focus()
  }

  function onTriggerClick() {
    isOpen() ? close(false) : open(true)
  }

  function onTriggerKeydown(e: KeyboardEvent) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault()
      open(true)
    }
  }

  function onMenuKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        moveFocus(1)
        break
      case "ArrowUp":
        e.preventDefault()
        moveFocus(-1)
        break
      case "Home":
        e.preventDefault()
        options[0]?.focus()
        break
      case "End":
        e.preventDefault()
        options[options.length - 1]?.focus()
        break
      case "Enter":
      case " ":
        e.preventDefault()
        if (document.activeElement instanceof HTMLLIElement) {
          selectOption(document.activeElement)
          close(true)
        }
        break
      case "Escape":
        e.preventDefault()
        close(true)
        break
      case "Tab":
        close(false)
        break
    }
  }

  function onOptionClick(this: HTMLLIElement) {
    selectOption(this)
    close(true)
  }

  function onOutsideClick(e: MouseEvent) {
    if (isOpen() && !root.contains(e.target as Node)) close(false)
  }

  trigger.addEventListener("click", onTriggerClick)
  window.addCleanup(() => trigger.removeEventListener("click", onTriggerClick))
  trigger.addEventListener("keydown", onTriggerKeydown)
  window.addCleanup(() => trigger.removeEventListener("keydown", onTriggerKeydown))
  menu.addEventListener("keydown", onMenuKeydown)
  window.addCleanup(() => menu.removeEventListener("keydown", onMenuKeydown))
  document.addEventListener("click", onOutsideClick)
  window.addCleanup(() => document.removeEventListener("click", onOutsideClick))
  for (const option of options) {
    option.addEventListener("click", onOptionClick)
    window.addCleanup(() => option.removeEventListener("click", onOptionClick))
  }

  return {
    setValue(value: string) {
      const match = options.find((o) => o.dataset.value === value)
      if (match) selectOption(match, true)
    },
  }
}

function setupPostExplorer() {
  const root = document.querySelector(".wc-root") as HTMLElement | null
  if (!root) return

  const grid = root.querySelector("#wc-grid") as HTMLElement | null
  const empty = root.querySelector("#wc-empty") as HTMLElement | null
  const searchInput = root.querySelector("#wc-search-input") as HTMLInputElement | null
  const sortRoot = root.querySelector("#wc-sort") as HTMLElement | null
  const countNum = root.querySelector("#wc-count-num") as HTMLElement | null
  const clearBtn = root.querySelector("#wc-clear") as HTMLButtonElement | null
  const emptyClearBtn = root.querySelector("#wc-empty-clear") as HTMLButtonElement | null
  if (!grid) return

  const allCards = [...grid.querySelectorAll<HTMLElement>(".wc-card")]
  let state = stateFromURL(window.location.search)

  const sortDropdown = sortRoot
    ? setupDropdown(sortRoot, (value) => {
        state.sort = value
        render()
        stateToURL(state)
      })
    : { setValue: (_value: string) => {} }

  function syncControlsFromState() {
    if (searchInput) searchInput.value = state.q
    sortDropdown.setValue(state.sort)
    for (const chip of root!.querySelectorAll<HTMLButtonElement>(".wc-chip")) {
      const facet = chip.closest<HTMLElement>("[data-facet]")?.dataset.facet as
        | FacetName
        | undefined
      const value = chip.dataset.value ?? ""
      const active = !!facet && state.facets[facet].has(value)
      chip.classList.toggle("active", active)
      chip.setAttribute("aria-pressed", String(active))
    }
    for (const group of root!.querySelectorAll<HTMLElement>("[data-facet]")) {
      const count = state.facets[group.dataset.facet as FacetName].size
      group.querySelector<HTMLElement>(".wc-facet-summary")!.textContent = count
        ? `${count} selected`
        : "Any"
      group.classList.toggle("has-selection", count > 0)
    }
  }

  function render() {
    const visible = allCards.filter((card) => cardMatches(card, state))
    const sorted = sortCards(visible, state.sort)
    const hiddenSet = new Set(sorted)

    for (const card of allCards) {
      card.hidden = !hiddenSet.has(card)
    }
    for (const card of sorted) grid!.appendChild(card)

    renderSelected()
    const panelResults = root!.querySelector<HTMLElement>("#wc-panel-results")
    if (panelResults)
      panelResults.textContent = `${visible.length} ${root!.dataset.noun ?? "posts"}`
    if (countNum) countNum.textContent = String(visible.length)
    if (empty) empty.hidden = visible.length > 0
    if (grid) grid.hidden = visible.length === 0
  }

  function update() {
    syncControlsFromState()
    render()
    stateToURL(state)
  }

  function onSearch(e: Event) {
    state.q = (e.target as HTMLInputElement).value.trim().toLowerCase()
    render()
    stateToURL(state)
  }

  function onChipClick(e: MouseEvent) {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>(".wc-chip")
    if (!chip) return
    const facet = chip.closest<HTMLElement>("[data-facet]")?.dataset.facet as FacetName | undefined
    const value = chip.dataset.value
    if (!facet || value === undefined) return

    const set = state.facets[facet]
    if (set.has(value)) set.delete(value)
    else set.add(value)

    update()
  }

  function onClear() {
    state = defaultState()
    if (tagSearch) tagSearch.value = ""
    for (const chip of root!.querySelectorAll<HTMLButtonElement>('[data-facet="tag"] .wc-chip'))
      chip.hidden = false
    const tagsEmpty = root!.querySelector<HTMLElement>("#wc-tags-empty")
    if (tagsEmpty) tagsEmpty.hidden = true
    update()
  }

  const panel = root.querySelector<HTMLElement>("#wc-filter-panel")!
  const trigger = root.querySelector<HTMLButtonElement>("#wc-filter-trigger")!
  const selected = root.querySelector<HTMLElement>("#wc-selected")!
  const total = root.querySelector<HTMLElement>("#wc-filter-total")!
  // absent when there are no tags to filter by
  const tagSearch = root.querySelector<HTMLInputElement>("#wc-tag-search")
  function listen(target: EventTarget | Document, name: string, handler: EventListener) {
    target.addEventListener(name, handler)
    window.addCleanup(() => target.removeEventListener(name, handler))
  }
  function closePanel(focus = false) {
    panel.inert = true
    panel.hidden = true
    trigger.setAttribute("aria-expanded", "false")
    if (focus) trigger.focus()
  }
  function renderSelected() {
    selected.replaceChildren()
    let count = 0
    for (const [facet, values] of Object.entries(state.facets)) {
      for (const value of values) {
        count++
        const option = [
          ...root!.querySelectorAll<HTMLButtonElement>(`[data-facet="${facet}"] .wc-chip`),
        ].find((chip) => chip.dataset.value === value)
        const label = option?.dataset.label || value
        const button = document.createElement("button")
        button.type = "button"
        button.className = "wc-chip active wc-pill"
        // not `data-facet`/`data-value`: the explorer treats those as filter groups and chips
        button.dataset.pillFacet = facet
        button.dataset.pillValue = value
        // rating pills get a colour dot, and every pill gets a close icon
        const hue =
          facet === "difficulty"
            ? value
            : facet === "severity"
              ? SEVERITY_HUE[value as Severity]
              : undefined
        if (hue) {
          button.dataset.pillHue = hue
          const dot = document.createElement("i")
          dot.className = "wc-pill-dot"
          dot.setAttribute("aria-hidden", "true")
          button.append(dot)
        }
        const text = document.createElement("span")
        text.className = "wc-pill-label"
        text.textContent = label
        const close = document.createElement("span")
        close.className = "wc-pill-x"
        close.setAttribute("aria-hidden", "true")
        close.innerHTML =
          '<svg viewBox="0 0 10 10" focusable="false"><path d="M2 2l6 6M8 2l-6 6" /></svg>'
        button.append(text, close)
        button.setAttribute("aria-label", `Remove ${label} filter`)
        button.onclick = () => {
          state.facets[facet as FacetName].delete(value)
          update()
          const next = selected.querySelector<HTMLButtonElement>("button")
          ;(next ?? trigger).focus()
        }
        selected.append(button)
      }
    }
    selected.hidden = count === 0
    total.textContent = String(count)
    total.hidden = count === 0
    if (clearBtn) clearBtn.hidden = count === 0 && !state.q && state.sort === "newest"
  }
  listen(trigger, "click", () => {
    const opening = panel.hidden
    panel.inert = !opening
    panel.hidden = !opening
    trigger.setAttribute("aria-expanded", String(opening))
    if (opening) panel.querySelector<HTMLButtonElement>("button")?.focus()
  })
  listen(root.querySelector("#wc-panel-clear")!, "click", onClear)
  listen(root.querySelector("#wc-filter-close")!, "click", () => closePanel(true))
  listen(document, "pointerdown", (event) => {
    if (
      !panel.hidden &&
      !panel.contains(event.target as Node) &&
      !trigger.contains(event.target as Node)
    )
      closePanel()
  })
  listen(document, "keydown", (event) => {
    if ((event as KeyboardEvent).key === "Escape" && !panel.hidden) closePanel(true)
  })
  listen(root, "focusout", (event) => {
    const next = (event as FocusEvent).relatedTarget
    if (next instanceof Node && !root!.contains(next)) closePanel()
  })
  if (tagSearch) {
    listen(tagSearch, "input", () => {
      let visible = 0
      for (const chip of root!.querySelectorAll<HTMLButtonElement>('[data-facet="tag"] .wc-chip')) {
        chip.hidden = !Number.isFinite(
          fuzzySearchScore(tagSearch.value, `${chip.dataset.label} ${chip.dataset.value}`),
        )
        if (!chip.hidden) visible++
      }
      root!.querySelector<HTMLElement>("#wc-tags-empty")!.hidden = visible > 0
    })
  }
  listen(window, "popstate", () => {
    state = stateFromURL(window.location.search)
    syncControlsFromState()
    render()
  })

  searchInput?.addEventListener("input", onSearch)
  window.addCleanup(() => searchInput?.removeEventListener("input", onSearch))
  root.addEventListener("click", onChipClick)
  window.addCleanup(() => root.removeEventListener("click", onChipClick))
  clearBtn?.addEventListener("click", onClear)
  window.addCleanup(() => clearBtn?.removeEventListener("click", onClear))
  emptyClearBtn?.addEventListener("click", onClear)
  window.addCleanup(() => emptyClearBtn?.removeEventListener("click", onClear))

  syncControlsFromState()
  render()
}

document.addEventListener("nav", setupPostExplorer)
