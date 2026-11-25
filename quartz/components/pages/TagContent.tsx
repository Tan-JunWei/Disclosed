import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import style from "../styles/treeList.scss"
import { FileIcon, TagIcon } from "../treeIcons"
import { FullSlug, getAllSegmentPrefixes, resolveRelative, simplifySlug } from "../../util/path"
import { QuartzPluginData } from "../../plugins/vfile"
import { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { Date, getDate } from "../Date"
import { byDateAndAlphabetical } from "../PageList"
import { GlobalConfiguration } from "../../cfg"
import { tagColorVars } from "../../util/tagColor"
import { buildPostEntry, PostEntry } from "../../util/posts"
import { DIFFICULTY_ORDER, Difficulty } from "../../util/ratings"
import { groupTags, tagFamily, tagLabel } from "../../util/techniques"
import { PostCard } from "../PostCard"

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** "A", "A and B", "A, B and C" */
const listOf = (items: string[]) =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`

// A tagged page that is not a post (a landing page, say): a plain row with its date.
function FileRow({
  page,
  fileData,
  cfg,
}: {
  page: QuartzPluginData
  fileData: QuartzPluginData
  cfg: GlobalConfiguration
}) {
  const date = getDate(cfg, page)
  return (
    <li>
      <a href={resolveRelative(fileData.slug!, page.slug!)} class="internal tree-row">
        <FileIcon />
        <span class="tree-name">{page.frontmatter?.title}</span>
        {date && (
          <span class="tree-meta">
            <Date date={date} locale={cfg.locale} />
          </span>
        )}
      </a>
    </li>
  )
}

/**
 * The Explore page filtered to this tag. Explore keeps difficulty and category as their own
 * facets, so a difficulty tag maps to the difficulty filter, and a tag that Explore does not
 * list on any of these posts (a category tag) gets no link at all rather than an empty result.
 */
function exploreHref(fileData: QuartzPluginData, tag: string, entries: PostEntry[]) {
  const lower = tag.toLowerCase()
  const base = resolveRelative(fileData.slug!, "Explore" as FullSlug)
  if (DIFFICULTY_ORDER.includes(lower as Difficulty)) return `${base}?difficulty=${lower}`
  const listed = entries.some((entry) => entry.tags.some((t) => t.toLowerCase() === lower))
  return listed ? `${base}?tag=${encodeURIComponent(lower)}` : undefined
}

const TagContent: QuartzComponent = (props: QuartzComponentProps) => {
  const { tree, fileData, allFiles, cfg } = props
  const slug = fileData.slug

  if (!(slug?.startsWith("tags/") || slug === "tags")) {
    throw new Error(`Component "TagContent" tried to render a non-tag page: ${slug}`)
  }

  const tag = simplifySlug(slug.slice("tags/".length) as FullSlug)
  const sorter = byDateAndAlphabetical(cfg)
  const allPagesWithTag = (tag: string) =>
    allFiles
      .filter((file) => (file.frontmatter?.tags ?? []).flatMap(getAllSegmentPrefixes).includes(tag))
      .sort(sorter)

  // a tags/<name>.md note, if one exists, is shown above the listing
  const hasNote = (tree as Root).children.length > 0
  const note = hasNote ? <article>{htmlToJsx(fileData.filePath!, tree)}</article> : null
  const cssClasses: string[] = fileData.frontmatter?.cssclasses ?? []
  const classes = ["popover-hint", "tag-page", ...cssClasses].join(" ")

  if (tag === "/") {
    const tags = [
      ...new Set(
        allFiles.flatMap((data) => data.frontmatter?.tags ?? []).flatMap(getAllSegmentPrefixes),
      ),
    ].map((tag) => ({ tag, label: tagLabel(tag), count: allPagesWithTag(tag).length }))
    const groups = groupTags(tags).map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) =>
        group.id === "difficulty"
          ? DIFFICULTY_ORDER.indexOf(a.tag.toLowerCase() as Difficulty) -
            DIFFICULTY_ORDER.indexOf(b.tag.toLowerCase() as Difficulty)
          : a.label.localeCompare(b.label),
      ),
    }))

    return (
      <div class={classes}>
        {note}
        <p class="tag-index-intro">
          {plural(tags.length, "tag", "tags")}, grouped by the technique they describe. Each one
          lists every post that uses it.
        </p>
        {groups.map((group) => (
          <section class="tag-group" key={group.id} aria-labelledby={`tag-group-${group.id}`}>
            <h2 class="tag-group-title" id={`tag-group-${group.id}`}>
              {group.name}
              <span class="tag-group-count">{group.items.length}</span>
            </h2>
            <ul class="tag-grid">
              {group.items.map(({ tag, label, count }) => (
                <li key={tag}>
                  <a
                    href={resolveRelative(fileData.slug!, `tags/${tag}` as FullSlug)}
                    class="internal tag-card"
                    style={tagColorVars(tag)}
                  >
                    <span class="tag-card-icon">
                      <TagIcon />
                    </span>
                    <span class="tag-card-name">{label}</span>
                    <span class="tag-card-count">{plural(count, "post", "posts")}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    )
  }

  const pages = allPagesWithTag(tag)
  const entries: PostEntry[] = []
  const otherPages: QuartzPluginData[] = []
  for (const page of pages) {
    const entry = buildPostEntry(cfg, page)
    if (entry) entries.push(entry)
    else otherPages.push(page)
  }
  const sections = [...new Set(entries.map((entry) => entry.sectionLabel))]
  const explore = exploreHref(fileData, tag, entries)
  const family = tagFamily(tag)

  return (
    <div class={classes}>
      {note}
      <section class="tag-summary" style={tagColorVars(tag)}>
        <span class="tag-summary-icon">
          <TagIcon />
        </span>
        <div class="tag-summary-text">
          <p class="tag-summary-kicker">{family?.name ?? "Tag"}</p>
          <p class="tag-summary-line">
            <strong>{plural(pages.length, "post", "posts")}</strong>
            {sections.length > 0 && ` from ${listOf(sections)}`}
          </p>
        </div>
        <nav class="tag-summary-links" aria-label="More posts">
          {explore && (
            <a class="tag-summary-link" href={explore}>
              Filter in Explore
            </a>
          )}
          <a
            class="tag-summary-link"
            href={resolveRelative(fileData.slug!, "tags/index" as FullSlug)}
          >
            All tags
          </a>
        </nav>
      </section>
      {entries.length > 0 && (
        <div class="wc-grid tag-posts">
          {entries.map((entry) => (
            <PostCard key={entry.slug} entry={entry} fileData={fileData} />
          ))}
        </div>
      )}
      {otherPages.length > 0 && (
        <ul class="tree-root tag-other-pages">
          {otherPages.map((page) => (
            <FileRow key={page.slug} page={page} fileData={fileData} cfg={cfg} />
          ))}
        </ul>
      )}
    </div>
  )
}

TagContent.css = style

export default (() => TagContent) satisfies QuartzComponentConstructor
