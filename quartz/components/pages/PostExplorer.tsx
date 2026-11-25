import { Root } from "hast"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import { htmlToJsx } from "../../util/jsx"
import { buildPostEntries, computeFacets } from "../../util/posts"
import { findSection } from "../../util/sections"
import { TECHNIQUE_FAMILIES, tagLabel } from "../../util/techniques"
import { PostCard } from "../PostCard"
import style from "../styles/postExplorer.scss"
// @ts-ignore
import script from "../scripts/postExplorer.inline"

interface PostExplorerOptions {
  /** Restrict the dataset to a single section folder (e.g. "PicoCTF"). */
  lockedSection?: string
}

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name (A-Z)" },
  { value: "rating", label: "Difficulty / severity" },
]

function SortDropdown() {
  return (
    <div class="wc-select" id="wc-sort">
      <button
        type="button"
        class="wc-select-trigger"
        id="wc-sort-trigger"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-controls="wc-sort-listbox"
      >
        <span class="wc-select-value" id="wc-sort-value">
          {SORT_OPTIONS[0].label}
        </span>
        <svg
          class="wc-select-chevron"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <ul
        class="wc-select-menu"
        role="listbox"
        id="wc-sort-listbox"
        aria-labelledby="wc-sort-trigger"
        hidden
      >
        {SORT_OPTIONS.map((opt, i) => (
          <li
            key={opt.value}
            role="option"
            data-value={opt.value}
            aria-selected={i === 0}
            tabindex={i === 0 ? 0 : -1}
          >
            {opt.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChipGroup({
  name,
  label,
  options,
}: {
  name: string
  label: string
  options: { value: string; display: string; count?: number }[]
}) {
  if (options.length === 0) return null
  return (
    <details class="wc-facet" data-facet={name} name="post-filters">
      <summary>
        <span class="wc-facet-label">{label}</span>
        <span class="wc-facet-summary">Any</span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="m9 5 7 7-7 7" />
        </svg>
      </summary>
      {name === "tag" && (
        <label class="wc-tag-search">
          <input
            aria-label="Search tags"
            id="wc-tag-search"
            type="search"
            placeholder="Find a tag, e.g. Python…"
          />
        </label>
      )}
      <div class="wc-chips" role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            type="button"
            class="wc-chip"
            data-value={opt.value}
            data-label={opt.display}
            aria-pressed="false"
          >
            <span class="wc-option-check" aria-hidden="true">
              <svg
                viewBox="0 0 16 16"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="m3 8 3 3 7-7" />
              </svg>
            </span>
            <span class="wc-option-label">{opt.display}</span>
            {opt.count !== undefined && <span class="wc-chip-count">{opt.count}</span>}
          </button>
        ))}
      </div>
      {name === "tag" && (
        <p id="wc-tags-empty" hidden>
          No matching tags. Try another spelling.
        </p>
      )}
    </details>
  )
}

export default ((opts?: PostExplorerOptions) => {
  const PostExplorer: QuartzComponent = (props: QuartzComponentProps) => {
    const { allFiles, fileData, cfg, tree } = props
    const allEntries = buildPostEntries(cfg, allFiles)
    const entries = opts?.lockedSection
      ? allEntries.filter((e) => e.section === opts.lockedSection)
      : allEntries
    const facets = computeFacets(entries)
    // what this list is called: "advisories" inside the research section, "posts" everywhere else
    const noun = findSection(opts?.lockedSection)?.noun.many ?? "posts"

    const sorted = [...entries].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))

    const hasIntro = (tree as Root).children.length > 0
    const introJsx = hasIntro ? htmlToJsx(fileData.filePath!, tree) : null

    if (entries.length === 0) {
      return (
        <div class="wc-root popover-hint">
          {introJsx && <article class="wc-intro">{introJsx}</article>}
          <p class="wc-none">Nothing has been published here yet.</p>
        </div>
      )
    }

    return (
      <div class="wc-root popover-hint" data-noun={noun}>
        {introJsx && <article class="wc-intro">{introJsx}</article>}
        <div class="wc-controls">
          <div class="wc-search-row">
            <div class="wc-search">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 19.9 19.7"
                aria-hidden="true"
                class="wc-search-icon"
              >
                <g fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="square" d="M18.5 18.3l-5.4-5.4" />
                  <circle cx="8" cy="8" r="7" />
                </g>
              </svg>
              <input
                type="search"
                id="wc-search-input"
                placeholder={`Search ${noun} by title, CVE, category, or tag…`}
                aria-label={`Search ${noun}`}
                autocomplete="off"
              />
            </div>
            <SortDropdown />
            <button
              type="button"
              id="wc-filter-trigger"
              class="wc-select-trigger wc-filter-trigger"
              aria-expanded="false"
              aria-controls="wc-filter-panel"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="M4 7h16M7 12h10M10 17h4" />
              </svg>
              Filters{" "}
              <span id="wc-filter-total" hidden>
                0
              </span>
            </button>
          </div>
          <div
            class="wc-filter-panel"
            id="wc-filter-panel"
            role="region"
            aria-label="Filters"
            hidden
          >
            <div class="wc-panel-heading">
              <strong>Filter {noun}</strong>
              <button
                type="button"
                id="wc-filter-close"
                class="wc-clear"
                aria-label="Done, close filters"
              >
                Done
              </button>
            </div>
            <div class="wc-facets">
              {!opts?.lockedSection && (
                <ChipGroup
                  name="section"
                  label="Section"
                  options={facets.sections.map((section) => ({
                    value: section,
                    display: entries.find((e) => e.section === section)?.sectionLabel ?? section,
                    count: entries.filter((entry) => entry.section === section).length,
                  }))}
                />
              )}
              <ChipGroup
                name="category"
                label="Category"
                options={facets.categories.map((c) => ({
                  value: c,
                  display: c,
                  count: entries.filter((entry) => entry.category === c).length,
                }))}
              />
              <ChipGroup
                name="difficulty"
                label="Difficulty"
                options={facets.difficulties.map((d) => ({
                  value: d,
                  display: d,
                  count: entries.filter((entry) => entry.difficulty === d).length,
                }))}
              />
              <ChipGroup
                name="severity"
                label="Severity"
                options={facets.severities.map((severity) => ({
                  value: severity,
                  display: severity,
                  count: entries.filter((entry) => entry.severity === severity).length,
                }))}
              />
              <ChipGroup
                name="technique"
                label="Techniques"
                options={TECHNIQUE_FAMILIES.map((family) => ({
                  value: family.id,
                  display: family.name,
                  count: entries.filter((entry) => entry.techniques.includes(family.id)).length,
                })).filter((option) => option.count > 0)}
              />
              <ChipGroup
                name="tag"
                label="Tags"
                options={facets.tags.map((t) => ({
                  value: t.tag.toLowerCase(),
                  display: tagLabel(t.tag),
                  count: t.count,
                }))}
              />
            </div>
            <div class="wc-panel-footer">
              <span id="wc-panel-results" aria-live="polite">
                {entries.length} {noun}
              </span>
              <button type="button" id="wc-panel-clear" class="wc-clear">
                Reset
              </button>
            </div>
          </div>
          <div class="wc-selected" id="wc-selected" aria-label="Selected filters" hidden />
          <div class="wc-status-row">
            <p class="wc-count" id="wc-count" aria-live="polite">
              Showing <strong id="wc-count-num">{entries.length}</strong> of {entries.length} {noun}
            </p>
            <button type="button" id="wc-clear" class="wc-clear">
              Clear filters
            </button>
          </div>
        </div>

        <div class="wc-grid" id="wc-grid">
          {sorted.map((entry) => (
            <PostCard key={entry.slug} entry={entry} fileData={fileData} />
          ))}
        </div>
        <div class="wc-empty" id="wc-empty" hidden>
          <p>Nothing matches your filters.</p>
          <button type="button" class="wc-clear" id="wc-empty-clear">
            Clear filters
          </button>
        </div>
      </div>
    )
  }

  PostExplorer.css = style
  PostExplorer.afterDOMLoaded = script
  return PostExplorer
}) satisfies QuartzComponentConstructor
