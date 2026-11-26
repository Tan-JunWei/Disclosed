import type FlexSearch from "flexsearch"
import type * as SearchEngine from "./search/engine"
import { fuzzySearchScore } from "../../util/postFilters"
import { ContentDetails } from "../../plugins/emitters/contentIndex"
import { registerEscapeHandler } from "./util"
import { FullSlug, normalizeRelativeURLs, resolveRelative } from "../../util/path"

type Item = SearchEngine.Item

type SearchType = "basic" | "tags"
let index: SearchEngine.SearchIndex | undefined

type SearchData = { [key: FullSlug]: ContentDetails }
let searchData: Promise<SearchData> | undefined

/**
 * The index is about as large as all posts' text combined, so it is fetched the first time someone
 * opens or uses search rather than on every page load, and the search index is built only once.
 */
function loadSearchData(currentSlug: FullSlug): Promise<SearchData> {
  if (!searchData) {
    const engineSrc = document.getElementById("search-container")?.dataset.moduleSrc
    const engine: Promise<typeof SearchEngine> = engineSrc
      ? import(/* @vite-ignore */ new URL(engineSrc, window.location.href).href)
      : Promise.reject(new Error("Search engine module is not configured"))
    const content = fetch(
      resolveRelative(currentSlug, "static/contentIndex.json" as FullSlug),
    ).then((response) => {
      if (!response.ok) throw new Error(`Search index: ${response.status}`)
      return response.json() as Promise<SearchData>
    })
    searchData = Promise.all([content, engine]).then(async ([data, { buildIndex }]) => {
      index = await buildIndex(data)
      return data
    })
    // a failed download is retried on the next search instead of breaking search until a reload
    searchData.catch(() => (searchData = undefined))
  }
  return searchData
}

const p = new DOMParser()
const fetchContentCache: Map<FullSlug, Element[]> = new Map()
const contextWindowWords = 30
const numTagResults = 5

const tokenizeTerm = (term: string) => {
  const tokens = term.split(/\s+/).filter((t) => t.trim() !== "")
  const tokenLen = tokens.length
  if (tokenLen > 1) {
    for (let i = 1; i < tokenLen; i++) {
      tokens.push(tokens.slice(0, i + 1).join(" "))
    }
  }

  return tokens.sort((a, b) => b.length - a.length) // always highlight longest terms first
}

function highlight(searchTerm: string, text: string, trim?: boolean) {
  const tokenizedTerms = tokenizeTerm(searchTerm)
  let tokenizedText = text.split(/\s+/).filter((t) => t !== "")

  let startIndex = 0
  let endIndex = tokenizedText.length - 1
  if (trim) {
    const includesCheck = (tok: string) =>
      tokenizedTerms.some((term) => tok.toLowerCase().startsWith(term.toLowerCase()))
    const occurrencesIndices = tokenizedText.map(includesCheck)

    let bestSum = 0
    let bestIndex = 0
    for (let i = 0; i < Math.max(tokenizedText.length - contextWindowWords, 0); i++) {
      const window = occurrencesIndices.slice(i, i + contextWindowWords)
      const windowSum = window.reduce((total, cur) => total + (cur ? 1 : 0), 0)
      if (windowSum >= bestSum) {
        bestSum = windowSum
        bestIndex = i
      }
    }

    startIndex = Math.max(bestIndex - contextWindowWords, 0)
    endIndex = Math.min(startIndex + 2 * contextWindowWords, tokenizedText.length - 1)
    tokenizedText = tokenizedText.slice(startIndex, endIndex)
  }

  const slice = tokenizedText
    .map((tok) => {
      // see if this tok is prefixed by any search terms
      for (const searchTok of tokenizedTerms) {
        if (tok.toLowerCase().includes(searchTok.toLowerCase())) {
          const regex = new RegExp(searchTok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
          return tok.replace(regex, `<span class="highlight">$&</span>`)
        }
      }
      return tok
    })
    .join(" ")

  return `${startIndex === 0 ? "" : "..."}${slice}${
    endIndex === tokenizedText.length - 1 ? "" : "..."
  }`
}

function highlightHTML(searchTerm: string, el: HTMLElement) {
  const p = new DOMParser()
  const tokenizedTerms = tokenizeTerm(searchTerm)
  const html = p.parseFromString(el.innerHTML, "text/html")

  const createHighlightSpan = (text: string) => {
    const span = document.createElement("span")
    span.className = "highlight"
    span.textContent = text
    return span
  }

  const highlightTextNodes = (node: Node, term: string) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeText = node.nodeValue ?? ""
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
      const matches = nodeText.match(regex)
      if (!matches || matches.length === 0) return
      const spanContainer = document.createElement("span")
      let lastIndex = 0
      for (const match of matches) {
        const matchIndex = nodeText.indexOf(match, lastIndex)
        spanContainer.appendChild(document.createTextNode(nodeText.slice(lastIndex, matchIndex)))
        spanContainer.appendChild(createHighlightSpan(match))
        lastIndex = matchIndex + match.length
      }
      spanContainer.appendChild(document.createTextNode(nodeText.slice(lastIndex)))
      node.parentNode?.replaceChild(spanContainer, node)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as HTMLElement).classList.contains("highlight")) return
      Array.from(node.childNodes).forEach((child) => highlightTextNodes(child, term))
    }
  }

  for (const term of tokenizedTerms) {
    highlightTextNodes(html.body, term)
  }

  return html.body
}

document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  const currentSlug = e.detail.url
  let data: SearchData = {}
  let idDataMap: FullSlug[] = []
  const ready = () =>
    loadSearchData(currentSlug).then((loaded) => {
      data = loaded
      idDataMap = Object.keys(loaded) as FullSlug[]
    })
  const container = document.getElementById("search-container")
  const sidebar = container?.closest(".sidebar") as HTMLElement
  const searchButton = document.getElementById("search-button")
  const searchBar = document.getElementById("search-bar") as HTMLInputElement | null
  const searchClose = document.getElementById("search-close")
  const suggestions = document.getElementById("search-suggestions")
  const searchLayout = document.getElementById("search-layout")

  const appendLayout = (el: HTMLElement) => {
    if (searchLayout?.querySelector(`#${el.id}`) === null) {
      searchLayout?.appendChild(el)
    }
  }

  const enablePreview = searchLayout?.dataset?.preview === "true"
  let preview: HTMLDivElement | undefined = undefined
  let previewRequest = 0
  let searchRequest = 0
  let previewTerm = ""
  let displayedQuery = ""
  const results = document.createElement("div")
  results.id = "results-container"
  appendLayout(results)

  if (enablePreview) {
    preview = document.createElement("div")
    preview.id = "preview-container"
    appendLayout(preview)
  }

  function showSuggestions() {
    previewRequest++
    if (suggestions) suggestions.hidden = false
    searchLayout?.classList.remove("display-results")
    results.replaceChildren()
    preview?.replaceChildren()
  }

  function hideSearch() {
    searchRequest++
    container?.classList.remove("active")
    searchButton?.setAttribute("aria-expanded", "false")
    if (searchBar) {
      searchBar.value = "" // clear the input when we dismiss the search
    }
    if (sidebar) {
      sidebar.style.zIndex = "unset"
    }
    showSuggestions()

    searchButton?.focus()
  }

  function showSearch(searchTypeNew: SearchType) {
    if (sidebar) {
      sidebar.style.zIndex = "1"
    }
    container?.classList.add("active")
    searchButton?.setAttribute("aria-expanded", "true")
    if (searchBar) {
      searchBar.value = searchTypeNew === "tags" ? "#" : ""
      searchBar.focus()
    }
    void ready().catch(() => {})
  }

  function shortcutHandler(e: HTMLElementEventMap["keydown"]) {
    if (e.key === "k" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      const searchBarOpen = container?.classList.contains("active")
      searchBarOpen ? hideSearch() : showSearch("basic")
      return
    } else if (e.shiftKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      // Hotkey to open tag search
      e.preventDefault()
      const searchBarOpen = container?.classList.contains("active")
      searchBarOpen ? hideSearch() : showSearch("tags")

      return
    }

    if (!container?.classList.contains("active") || e.isComposing) return
    const active = document.activeElement
    const choices = suggestions?.hidden
      ? Array.from(results.querySelectorAll<HTMLAnchorElement>("a.result-card"))
      : Array.from(suggestions?.querySelectorAll<HTMLElement>("button, a[href]") ?? [])
    const focusedChoice = choices.findIndex((choice) => choice === active)

    if (
      e.key === "Enter" &&
      active === searchBar &&
      suggestions?.hidden &&
      searchBar?.value.trim() === displayedQuery
    ) {
      choices[0]?.click()
    } else if (e.key === "ArrowDown" && (active === searchBar || focusedChoice >= 0)) {
      e.preventDefault()
      choices[focusedChoice + 1]?.focus()
    } else if (e.key === "ArrowUp" && focusedChoice >= 0) {
      e.preventDefault()
      const previous = choices[focusedChoice - 1] ?? searchBar
      previous?.focus()
    } else if (e.key === "Tab" && container) {
      const controls = Array.from(
        container.querySelectorAll<HTMLElement>("input, button, a[href]"),
      ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls.at(-1)
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first?.focus()
      }
    }
  }

  const formatForDisplay = (term: string, id: number, searchType: SearchType) => {
    const slug = idDataMap[id]
    return {
      id,
      slug,
      title: searchType === "tags" ? data[slug].title : highlight(term, data[slug].title ?? ""),
      content: highlight(term, data[slug].content ?? "", true),
      tags: searchType === "tags" ? highlightTags(term, data[slug].tags) : [],
    }
  }

  function highlightTags(term: string, tags: string[]) {
    if (!tags) {
      return []
    }

    return tags
      .map((tag) => {
        if (tag.toLowerCase().includes(term.toLowerCase())) {
          return `<li><p class="match-tag">#${tag}</p></li>`
        } else {
          return `<li><p>#${tag}</p></li>`
        }
      })
      .slice(0, numTagResults)
  }

  function resolveUrl(slug: FullSlug): URL {
    return new URL(resolveRelative(currentSlug, slug), location.toString())
  }

  const resultToHTML = ({ slug, title, content, tags }: Item) => {
    const htmlTags = tags.length > 0 ? `<ul class="tags">${tags.join("")}</ul>` : ``
    const itemTile = document.createElement("a")
    itemTile.classList.add("result-card")
    itemTile.id = slug
    itemTile.href = resolveUrl(slug).toString()
    itemTile.innerHTML = `<h3>${title}</h3>${htmlTags}<p class="preview">${content}</p>`

    const handler = (event: MouseEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      hideSearch()
    }

    itemTile.addEventListener("mouseenter", () => showResultPreview(itemTile))
    itemTile.addEventListener("focus", () => showResultPreview(itemTile))
    itemTile.addEventListener("click", handler)

    return itemTile
  }

  function showResults() {
    if (suggestions) suggestions.hidden = true
    searchLayout?.classList.add("display-results")
    preview?.replaceChildren()
  }

  function showSearchMessage(title: string, text: string) {
    const message = document.createElement("div")
    message.className = "result-card no-match"
    message.setAttribute("role", "status")
    const heading = document.createElement("h3")
    heading.textContent = title
    const body = document.createElement("p")
    body.textContent = text
    message.append(heading, body)
    results.replaceChildren(message)
    showResults()
  }

  function showResultPreview(result: HTMLElement) {
    results.querySelector(".focus")?.classList.remove("focus")
    result.classList.add("focus")
    void displayPreview(result)
  }

  function displayResults(finalResults: Item[]) {
    if (finalResults.length === 0) {
      showSearchMessage("No results", "Try another search term.")
      return
    }
    const cards = finalResults.map(resultToHTML)
    const count = document.createElement("p")
    count.className = "search-result-count"
    count.setAttribute("role", "status")
    count.textContent = `${cards.length} ${cards.length === 1 ? "result" : "results"}`
    results.replaceChildren(count, ...cards)
    results.scrollTop = 0
    showResults()
    showResultPreview(cards[0])
  }

  async function fetchContent(slug: FullSlug): Promise<Element[]> {
    if (fetchContentCache.has(slug)) {
      return fetchContentCache.get(slug) as Element[]
    }

    const targetUrl = resolveUrl(slug).toString()
    try {
      const response = await fetch(targetUrl)
      if (!response.ok) throw new Error(`${response.status} for ${targetUrl}`)
      const html = p.parseFromString(await response.text(), "text/html")
      normalizeRelativeURLs(html, targetUrl)
      const contents = [...html.getElementsByClassName("popover-hint")]
      fetchContentCache.set(slug, contents)
      return contents
    } catch (error) {
      // not cached, so hovering the result again retries
      console.warn("Search preview unavailable:", error)
      return []
    }
  }

  async function displayPreview(el: HTMLElement) {
    if (!preview || !preview.getClientRects().length) return
    const request = ++previewRequest
    const slug = el.id as FullSlug
    const term = previewTerm
    const innerDiv = await fetchContent(slug).then((contents) =>
      contents.flatMap((el) => [...highlightHTML(term, el as HTMLElement).children]),
    )
    if (request !== previewRequest || !container?.classList.contains("active")) return
    const previewInner = document.createElement("div")
    previewInner.classList.add("preview-inner")
    previewInner.append(...innerDiv)
    preview.replaceChildren(previewInner)

    // scroll to longest
    const highlights = [...preview.querySelectorAll(".highlight")].sort(
      (a, b) => b.innerHTML.length - a.innerHTML.length,
    )
    highlights[0]?.scrollIntoView({ block: "start" })
  }

  async function runSearch() {
    if (!searchBar || !searchLayout) return
    const request = ++searchRequest
    previewRequest++
    const term = searchBar.value.trim()
    if (term === "" || term === "#") {
      showSuggestions()
      return
    }
    try {
      await ready()
    } catch {
      if (request === searchRequest) {
        showSearchMessage("Search is unavailable", "Try entering your search again.")
      }
      return
    }
    if (request !== searchRequest || !index) return
    let currentSearchTerm = term
    let searchType: SearchType = term.startsWith("#") ? "tags" : "basic"
    const limit = idDataMap.length

    let tagConstraint: string | undefined
    let searchResults: FlexSearch.SimpleDocumentSearchResultSetUnit[]
    if (searchType === "tags") {
      currentSearchTerm = currentSearchTerm.substring(1).trim()
      const separatorIndex = currentSearchTerm.indexOf(" ")
      if (separatorIndex != -1) {
        // search by title and content index and then filter by tag (implemented in flexsearch)
        const tag = currentSearchTerm.substring(0, separatorIndex)
        tagConstraint = tag
        const query = currentSearchTerm.substring(separatorIndex + 1).trim()
        searchResults = await index.searchAsync({
          query: query,
          limit,
          index: ["title", "content"],
          tag: tag.toLowerCase(),
        })
        // Highlight only the text query after filtering by tag.
        searchType = "basic"
        currentSearchTerm = query
      } else {
        // default search by tags index
        searchResults = await index.searchAsync({
          query: currentSearchTerm,
          limit,
          index: ["tags"],
        })
      }
    } else if (searchType === "basic") {
      searchResults = await index.searchAsync({
        query: currentSearchTerm,
        limit,
        index: ["title", "content"],
      })
    }

    if (request !== searchRequest) return
    const getByField = (field: string): number[] => {
      const results = searchResults.filter((x) => x.field === field)
      return results.length === 0 ? [] : ([...results[0].result] as number[])
    }

    // order titles ahead of content
    const allIds: Set<number> = new Set([
      ...getByField("title"),
      ...getByField("content"),
      ...getByField("tags"),
    ])
    const fuzzyIds = idDataMap
      .map((slug, id) => {
        const item: ContentDetails = data[slug]
        if (
          tagConstraint &&
          !item.tags.some((tag) => Number.isFinite(fuzzySearchScore(tagConstraint!, tag)))
        )
          return { id, score: Infinity }
        const text =
          searchType === "tags" ? item.tags.join(" ") : `${item.title} ${item.tags.join(" ")}`
        return { id, score: fuzzySearchScore(currentSearchTerm, text) }
      })
      .filter((match) => Number.isFinite(match.score))
      .sort((a, b) => a.score - b.score)
    const rankedIds = new Set([
      ...getByField("title"),
      ...fuzzyIds.map((match) => match.id),
      ...allIds,
    ])
    const finalResults = [...rankedIds].map((id) =>
      formatForDisplay(currentSearchTerm, id, searchType),
    )
    displayedQuery = term
    previewTerm = currentSearchTerm
    displayResults(finalResults)
  }

  document.addEventListener("keydown", shortcutHandler)
  window.addCleanup(() => document.removeEventListener("keydown", shortcutHandler))
  const shortcutModifier = searchButton?.querySelector(".search-shortcut-mod")
  if (shortcutModifier && /Mac|iPhone|iPad/.test(navigator.platform)) {
    shortcutModifier.textContent = "⌘"
    searchButton?.setAttribute(
      "aria-label",
      `${searchButton.querySelector(".search-label")?.textContent} ⌘ K`,
    )
  }
  searchClose?.addEventListener("click", hideSearch)
  window.addCleanup(() => searchClose?.removeEventListener("click", hideSearch))
  const openSearch = () => showSearch("basic")
  searchButton?.addEventListener("click", openSearch)
  window.addCleanup(() => searchButton?.removeEventListener("click", openSearch))
  searchBar?.addEventListener("input", runSearch)
  window.addCleanup(() => searchBar?.removeEventListener("input", runSearch))
  function useSuggestedTopic(event: MouseEvent) {
    const topic = (event.target as Element).closest<HTMLElement>("[data-search-query]")
    if (!searchBar || !topic?.dataset.searchQuery) return
    searchBar.value = topic.dataset.searchQuery
    searchBar.focus()
    void runSearch()
  }
  suggestions?.addEventListener("click", useSuggestedTopic)
  window.addCleanup(() => suggestions?.removeEventListener("click", useSuggestedTopic))
  window.addCleanup(() => {
    searchRequest++
    previewRequest++
  })

  registerEscapeHandler(container, () => {
    if (container?.classList.contains("active")) hideSearch()
  })
  // start the download as soon as someone shows interest, so results are ready when they type
  const warmUp = () => void ready().catch(() => {})
  searchButton?.addEventListener("pointerenter", warmUp, { once: true })
  searchButton?.addEventListener("focus", warmUp, { once: true })
  window.addCleanup(() => {
    searchButton?.removeEventListener("pointerenter", warmUp)
    searchButton?.removeEventListener("focus", warmUp)
  })
})
