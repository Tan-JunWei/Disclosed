import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/search.scss"
// @ts-ignore
import script from "./scripts/search.inline"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"
import { lazyModuleSrc } from "../util/resources"
import { FullSlug, resolveRelative } from "../util/path"

const suggestedTopics = ["Forensics", "Cryptography", "Web Exploitation", "CVE"]
const suggestedCollections = [
  {
    title: "Vulnerability Research",
    description: "Security advisories and CVEs",
    slug: "Vulnerability-Research/Vulnerability-Research",
    icon: "M12 22s7-3.5 7-10V5l-7-3-7 3v7c0 6.5 7 10 7 10ZM9 12l2 2 4-4",
  },
  {
    title: "HackTheBox Sherlocks",
    description: "Incident investigation writeups",
    slug: "HackTheBox/HackTheBox-Sherlocks",
    icon: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9",
  },
  {
    title: "PicoCTF Writeups",
    description: "picoCTF challenge solutions",
    slug: "PicoCTF/PicoCTF-Writeups",
    icon: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 4 3 3-3 3m6 0h4",
  },
  {
    title: "HNF26 Writeups",
    description: "HNF26 CTF challenge solutions",
    slug: "HNF26/HNF26-Writeups",
    icon: "M5 21V4c5-4 9 4 14 0v11c-5 4-9-4-14 0",
  },
]

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g class="search-path" fill="none" stroke="currentColor" stroke-linecap="round">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </g>
    </svg>
  )
}

export interface SearchOptions {
  enablePreview: boolean
}

const defaultOptions: SearchOptions = {
  enablePreview: true,
}

export default ((userOpts?: Partial<SearchOptions>) => {
  const Search: QuartzComponent = ({ displayClass, cfg, ctx, fileData }: QuartzComponentProps) => {
    const opts = { ...defaultOptions, ...userOpts }
    const searchPlaceholder = i18n(cfg.locale).components.search.searchBarPlaceholder
    return (
      <div class={classNames(displayClass, "search")}>
        <button
          type="button"
          class="search-button"
          id="search-button"
          aria-label={`${i18n(cfg.locale).components.search.title} Ctrl K`}
          aria-controls="search-container"
          aria-expanded="false"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <SearchIcon />
          <span class="search-label">{i18n(cfg.locale).components.search.title}</span>{" "}
          <kbd class="search-shortcut" aria-hidden="true">
            <span class="search-shortcut-mod">Ctrl</span> <span>K</span>
          </kbd>
        </button>
        <div
          id="search-container"
          data-module-src={lazyModuleSrc(fileData.slug!, ctx.buildId, "search-engine")}
        >
          <div id="search-space" role="dialog" aria-modal="true" aria-label="Site search">
            <div class="search-field">
              <SearchIcon />
              <input
                autocomplete="off"
                id="search-bar"
                name="search"
                type="text"
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
              />
              <button type="button" id="search-close" aria-label="Close search">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-linecap="round" />
                </svg>
              </button>
            </div>
            <div id="search-suggestions">
              <h2>Suggested searches</h2>
              <div class="search-topics">
                {suggestedTopics.map((topic) => (
                  <button key={topic} type="button" data-search-query={topic}>
                    {topic}
                  </button>
                ))}
              </div>
              <h2>Browse collections</h2>
              <div class="search-collections">
                {suggestedCollections.map(({ title, description, slug, icon }) => (
                  <a key={slug} href={resolveRelative(fileData.slug!, slug as FullSlug)}>
                    <span class="search-collection-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d={icon}
                          stroke="currentColor"
                          stroke-linejoin="round"
                          stroke-linecap="round"
                        />
                      </svg>
                    </span>
                    <span>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                  </a>
                ))}
              </div>
              <div class="search-keyboard-hints" aria-hidden="true">
                <span>
                  <kbd>↑</kbd> <kbd>↓</kbd> Move
                </span>
                <span>
                  <kbd>Enter</kbd> Select
                </span>
                <span>
                  <kbd>Esc</kbd> Close
                </span>
              </div>
            </div>
            <div id="search-layout" data-preview={opts.enablePreview}></div>
          </div>
        </div>
      </div>
    )
  }

  Search.afterDOMLoaded = script
  Search.css = style

  return Search
}) satisfies QuartzComponentConstructor
