import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/search.scss"
// @ts-ignore
import script from "./scripts/search.inline"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"
import { lazyModuleSrc } from "../util/resources"

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
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
            <g class="search-path" fill="none" stroke-linecap="round">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </g>
          </svg>
          <span class="search-label">{i18n(cfg.locale).components.search.title}</span>{" "}
          <kbd class="search-shortcut" aria-hidden="true">
            <span class="search-shortcut-mod">Ctrl</span> <span>K</span>
          </kbd>
        </button>
        <div
          id="search-container"
          data-module-src={lazyModuleSrc(fileData.slug!, ctx.buildId, "search-engine")}
        >
          <div id="search-space">
            <input
              autocomplete="off"
              id="search-bar"
              name="search"
              type="text"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
            />
            <button type="button" id="search-close" aria-label="Close search">
              ×
            </button>
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
