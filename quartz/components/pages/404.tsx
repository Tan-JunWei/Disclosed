import { i18n } from "../../i18n"
import { joinSegments } from "../../util/path"
import { basePath } from "../../util/siteUrl"
import { buildPostEntries } from "../../util/posts"
import { ratingOf } from "../../util/ratings"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import style from "../styles/notFound.scss"

const RECENT_COUNT = 5

const NotFound: QuartzComponent = ({ cfg, allFiles }: QuartzComponentProps) => {
  const baseDir = basePath(cfg.baseUrl)
  const exploreHref = joinSegments(baseDir, "Explore")

  const recent = buildPostEntries(cfg, allFiles)
    .filter((entry) => entry.date)
    .sort((a, b) => b.date!.getTime() - a.date!.getTime())
    .slice(0, RECENT_COUNT)

  return (
    <article class="popover-hint not-found">
      <section class="nf-hero">
        <div class="nf-hero-copy">
          <p class="nf-eyebrow">Error 404 · not found</p>
          <h1>404</h1>
          <p class="nf-message">{i18n(cfg.locale).pages.error.notFound}</p>
        </div>
        {/* the target scope from the section cards, with nothing in its sights */}
        <svg class="nf-scope" viewBox="0 0 64 64" aria-hidden="true">
          <circle class="nf-scope-fill" cx="32" cy="32" r="27" />
          <g fill="none" stroke="currentColor" stroke-linecap="round">
            <circle cx="32" cy="32" r="27" stroke-width="1.5" />
            <path stroke-width="2" d="M32 1v8M32 55v8M1 32h8M55 32h8" />
            <path
              stroke-width="1.5"
              opacity=".8"
              d="M11.5 11.5l3 3M52.5 11.5l-3 3M11.5 52.5l3-3M52.5 52.5l-3-3"
            />
          </g>
          <text
            x="32"
            y="33"
            text-anchor="middle"
            dominant-baseline="central"
            font-size="26"
            font-weight="700"
            fill="currentColor"
            style={{ fontFamily: "var(--headerFont)" }}
          >
            ?
          </text>
        </svg>
      </section>

      {recent.length > 0 && (
        <section class="nf-recent" aria-labelledby="nf-recent-title">
          <h2 id="nf-recent-title">Recently added</h2>
          <ul>
            {recent.map((entry) => {
              const rating = ratingOf(entry)
              return (
                <li key={entry.slug}>
                  <a href={joinSegments(baseDir, entry.slug)}>
                    <span class="nf-recent-title">{entry.title}</span>
                    <span class="nf-recent-meta">
                      {rating && (
                        <span class="nf-diff" data-diff={rating.hue}>
                          <i class="nf-diff-dot" aria-hidden="true" />
                          {rating.level}
                        </span>
                      )}
                      <span>{entry.category}</span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <p class="nf-links">
        <a href={baseDir}>{i18n(cfg.locale).pages.error.home}</a>
        <a href={exploreHref}>Browse all posts</a>
      </p>
    </article>
  )
}

NotFound.css = style

export default (() => NotFound) satisfies QuartzComponentConstructor
