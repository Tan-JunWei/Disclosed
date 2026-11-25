import { QuartzComponentProps } from "./types"
import { resolveRelative } from "../util/path"
import { PostEntry } from "../util/posts"
import { ratingOf, ratingRank } from "../util/ratings"
import { tagColorVars } from "../util/tagColor"
import { tagLabel } from "../util/techniques"

// A post as a card (styles in `quartz/styles/postCard.scss`). The data attributes are what the
// Explore page filters and sorts by.
function TagIcon() {
  return (
    <svg
      class="wc-tag-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

export function PostCard({
  entry,
  fileData,
}: {
  entry: PostEntry
  fileData: QuartzComponentProps["fileData"]
}) {
  const rating = ratingOf(entry)
  const shownTags = entry.tags.slice(0, 4)
  const moreTags = entry.tags.length - shownTags.length

  return (
    <a
      class="wc-card"
      data-hue={rating?.hue}
      style={tagColorVars(entry.categoryTag ?? entry.category)}
      href={resolveRelative(fileData.slug!, entry.slug)}
      data-title={entry.title.toLowerCase()}
      data-category={entry.category}
      data-difficulty={entry.difficulty ?? ""}
      data-severity={entry.severity ?? ""}
      data-rating-rank={ratingRank(entry)}
      data-section={entry.section}
      data-techniques={entry.techniques.join("|")}
      data-tags={entry.tags.join("|").toLowerCase()}
      data-date={entry.date ? entry.date.getTime() : 0}
      data-search={[
        entry.title,
        entry.category,
        entry.sectionLabel,
        ...entry.cve,
        ...entry.cwe,
        entry.project ?? "",
        ...entry.tags,
        ...entry.tags.map(tagLabel),
      ]
        .join(" ")
        .toLowerCase()}
    >
      <div class="wc-top">
        <span class="wc-category">{entry.category}</span>
        {rating && (
          <span class="wc-diff" data-diff={rating.hue}>
            <i class="wc-diff-dot" aria-hidden="true" />
            {rating.level}
          </span>
        )}
      </div>
      <h3 class="wc-title">{entry.title}</h3>
      {entry.description && <p class="wc-desc">{entry.description}</p>}
      <div class="wc-bottom">
        <ul class="wc-tags">
          {shownTags.map((tag) => (
            <li key={tag}>
              <TagIcon />
              {tagLabel(tag)}
            </li>
          ))}
          {moreTags > 0 && <li class="wc-more">+{moreTags}</li>}
        </ul>
        <span class="wc-meta">
          {entry.cve.length > 0 && (
            <span class="wc-cve">
              {entry.cve[0]}
              {entry.cve.length > 1 && ` +${entry.cve.length - 1}`}
            </span>
          )}
          {entry.date && (
            <time class="wc-date" dateTime={entry.date.toISOString()}>
              {entry.date.toLocaleDateString("en-US", { year: "numeric", month: "short" })}
            </time>
          )}
        </span>
      </div>
    </a>
  )
}
