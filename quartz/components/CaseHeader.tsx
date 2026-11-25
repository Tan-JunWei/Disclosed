import readingTime from "reading-time"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { FullSlug, pathToRoot, resolveRelative, slugTag } from "../util/path"
import { buildPostEntry, PostEntry } from "../util/posts"
import { ratingOf } from "../util/ratings"
import { tagLabel } from "../util/techniques"
import { tagColorVars } from "../util/tagColor"
import style from "./styles/caseHeader.scss"

function Icon({ class: cls, children }: { class: string; children: any }) {
  return (
    <svg
      class={cls}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const TagIcon = () => (
  <Icon class="case-tag-icon">
    <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </Icon>
)
const FlagIcon = () => (
  <Icon class="case-icon">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </Icon>
)
const ShieldIcon = () => (
  <Icon class="case-icon">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </Icon>
)
const CodeIcon = () => (
  <Icon class="case-icon">
    <path d="m18 16 4-4-4-4" />
    <path d="m6 8-4 4 4 4" />
    <path d="m14.5 4-5 16" />
  </Icon>
)
const CalendarIcon = () => (
  <Icon class="case-icon">
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icon>
)
const ClockIcon = () => (
  <Icon class="case-icon">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </Icon>
)

// Rough rendered widths (px) at the reading-page size. When the tag chips would crowd the facts
// out of one row they get a row of their own inside the same bar.
const BAR_WIDTH = 750
const textWidth = (text: string, perChar = 7) => text.length * perChar
const tagsWidth = (labels: string[]) =>
  labels.reduce((sum, label) => sum + 34 + textWidth(label, 6.4), 0) + (labels.length - 1) * 5

function factsWidth(entry: PostEntry, minutes: number | undefined): number {
  const rating = ratingOf(entry)
  const items = [
    22 + textWidth(entry.category, 6.8),
    rating ? 24 + textWidth(rating.level) + (entry.cvss !== undefined ? 62 : 0) : 0,
    entry.kind === "research" ? 0 : 24 + textWidth(entry.sectionLabel),
    ...entry.cve.map((id) => 24 + textWidth(id, 7.4)),
    entry.project ? 24 + textWidth(entry.project) : 0,
    entry.date ? 100 : 0,
    minutes !== undefined ? 90 : 0,
  ].filter((width) => width > 0)
  return items.reduce((sum, width) => sum + width, 0) + (items.length - 1) * 16
}

/** The reading-page header for a post. Renders nothing for pages that are not posts. */
const CaseHeader: QuartzComponent = ({ cfg, fileData, displayClass }: QuartzComponentProps) => {
  const entry = buildPostEntry(cfg, fileData)
  if (!entry) return null

  const slug = fileData.slug!
  const exploreHref = resolveRelative(slug, "Explore" as FullSlug)
  const tagsRoot = pathToRoot(slug)
  const minutes = fileData.text
    ? Math.max(1, Math.ceil(readingTime(fileData.text).minutes))
    : undefined
  const showTags = fileData.frontmatter?.showTags !== false && entry.tags.length > 0

  const tags = showTags ? entry.tags.map((tag) => ({ tag, label: tagLabel(tag) })) : []
  const tagsOwnRow =
    tags.length > 0 &&
    tagsWidth(tags.map((t) => t.label)) > BAR_WIDTH - factsWidth(entry, minutes) - 16
  const rating = ratingOf(entry)
  const isResearch = entry.kind === "research"

  return (
    // a <div>, not <header>: quartz styles every <header> as a centred flex row
    <div
      class={classNames(displayClass, "case-header", tagsOwnRow ? "tags-own-row" : "")}
      role="group"
      aria-label="Writeup details"
    >
      <a
        class="case-category"
        style={tagColorVars(entry.categoryTag ?? entry.category)}
        href={`${exploreHref}?category=${encodeURIComponent(entry.category)}`}
      >
        {entry.category}
      </a>
      {rating && (
        <a
          class="case-diff"
          data-diff={rating.hue}
          href={`${exploreHref}?${rating.scheme}=${rating.level}`}
        >
          <i class="case-diff-dot" aria-hidden="true" />
          {rating.level}
          {entry.cvss !== undefined && <span class="case-cvss">CVSS {entry.cvss.toFixed(1)}</span>}
        </a>
      )}
      {!isResearch && (
        <a
          class="case-item case-link"
          href={`${exploreHref}?section=${encodeURIComponent(entry.section)}`}
        >
          <FlagIcon />
          {entry.sectionLabel}
        </a>
      )}
      {entry.cve.map((id) => (
        <a
          class="case-item case-link case-mono"
          key={id}
          href={`https://nvd.nist.gov/vuln/detail/${id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ShieldIcon />
          {id}
          <span class="case-sr"> (opens in a new tab)</span>
        </a>
      ))}
      {entry.project && (
        <a
          class="case-item case-link case-mono"
          href={`https://github.com/${entry.project}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <CodeIcon />
          {entry.project}
          <span class="case-sr"> (opens in a new tab)</span>
        </a>
      )}
      {entry.date && (
        <span class="case-item">
          <CalendarIcon />
          <time dateTime={entry.date.toISOString()}>
            {entry.date.toLocaleDateString(cfg.locale, {
              year: "numeric",
              month: "short",
              timeZone: "UTC",
            })}
          </time>
        </span>
      )}
      {minutes !== undefined && (
        <span class="case-item">
          <ClockIcon />
          {minutes} min read
        </span>
      )}
      {tags.length > 0 && (
        <ul class="case-tags" aria-label="Tools and techniques">
          {tags.map(({ tag, label }) => (
            <li key={tag}>
              <a class="case-tag" href={`${tagsRoot}/tags/${slugTag(tag)}`}>
                <TagIcon />
                {label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

CaseHeader.css = style

export default (() => CaseHeader) satisfies QuartzComponentConstructor
