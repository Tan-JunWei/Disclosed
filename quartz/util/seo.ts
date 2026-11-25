import { GlobalConfiguration } from "../cfg"
import { QuartzPluginData } from "../plugins/vfile"
import { capitalize } from "./lang"
import { FullSlug } from "./path"
import { PostEntry, buildPostEntries, buildPostEntry } from "./posts"
import { Section, findSection } from "./sections"
import { SITE } from "./site"
import { absoluteAssetUrl, absoluteUrl } from "./siteUrl"

export const OG_IMAGE = { path: "static/og-image.png", width: 1200, height: 675 } as const
export const DESCRIPTION_LENGTH = 160

export type PageKind = "home" | "post" | "folder" | "tag" | "notFound" | "page"

export interface PageSeo {
  kind: PageKind
  title: string
  description: string
  canonical: string
  robots: string
  image: { url: string; width: number; height: number; alt: string }
  published?: Date
  modified?: Date
  section?: string
  tags: string[]
  jsonLd: object
}

const segmentName = (segment: string) => segment.replaceAll("-", " ")

export function pageKind(slug: FullSlug | undefined, post: PostEntry | undefined): PageKind {
  if (slug === "index") return "home"
  if (slug === "404") return "notFound"
  if (post) return "post"
  if (slug?.startsWith("tags/")) return "tag"
  if (slug?.endsWith("/index")) return "folder"
  return "page"
}

/** Cuts at a word boundary so a description never ends halfway through a word. */
export function truncate(text: string, max = DESCRIPTION_LENGTH): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, "")}…`
}

/** Strips the "..." Quartz appends to an excerpt it cut short. */
function excerpt(file: QuartzPluginData): string {
  return (file.description ?? "").replace(/\s*\.\.\.\s*$/, "").trim()
}

interface FolderInfo {
  section?: Section
  /** The category's folder name as written ("Cross-Site Scripting"), undefined for a section folder. */
  category?: string
  posts: PostEntry[]
}

function folderInfo(slug: FullSlug, entries: PostEntry[]): FolderInfo {
  const prefix = slug.slice(0, -"index".length)
  const posts = entries.filter((entry) => entry.slug.startsWith(prefix))
  const [top, category] = slug.split("/")
  const section = findSection(posts[0]?.section ?? segmentName(top))
  const isCategory = category !== undefined && category !== "index"
  return {
    section,
    category: isCategory ? (posts[0]?.category ?? segmentName(category)) : undefined,
    posts,
  }
}

/** Titles for posts in a CTF section name the platform and category, e.g. "picoCTF Cryptography Writeup". */
function postLabel(post: PostEntry): string | undefined {
  const section = findSection(post.section)
  if (!section?.searchLabel) return undefined
  return `${section.searchLabel} ${post.category} ${capitalize(section.noun.one)}`
}

// A section folder lists its categories. Its posts are listed by the section's landing page, which
// already carries the plain section name as its title.
function folderLabel({ section, category }: FolderInfo): string | undefined {
  if (!section) return undefined
  const plural = capitalize(section.noun.many)
  if (!category) {
    return `${section.searchLabel ? `${section.searchLabel} ${plural}` : section.label} by Category`
  }
  return [section.searchLabel, category, plural].filter(Boolean).join(" ")
}

export function documentTitle(
  cfg: GlobalConfiguration,
  file: QuartzPluginData,
  entries: PostEntry[],
  post?: PostEntry,
): string {
  const site = cfg.pageTitle
  const title = file.frontmatter?.title ?? site
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" | ")
  const slug = file.slug!
  switch (pageKind(slug, post)) {
    case "home":
      return join(site, SITE.tagline)
    case "notFound":
      return join("Page not found", site)
    case "post":
      if (post!.kind === "research") {
        return join(post!.cve.length ? `${title} (${post!.cve.join(", ")})` : title, site)
      }
      return join(title, postLabel(post!), site)
    case "folder":
      return join(folderLabel(folderInfo(slug, entries)) ?? title, site)
    case "tag":
      return slug === "tags/index" ? join("All Tags", site) : join(`Posts Tagged ${title}`, site)
    default:
      return title === site ? site : join(title, site)
  }
}

function filesTagged(files: QuartzPluginData[], tag: string): QuartzPluginData[] {
  const wanted = tag.toLowerCase()
  return files.filter((file) =>
    (file.frontmatter?.tags ?? []).some(
      (t) => t.toLowerCase() === wanted || t.toLowerCase().startsWith(`${wanted}/`),
    ),
  )
}

/** The most used technique tags in a list of posts, leaving out the category itself. */
function commonTags(entries: PostEntry[], category: string | undefined, count = 4): string[] {
  const skip = (category ?? "").replace(/[\s-]+/g, "").toLowerCase()
  const tally = new Map<string, number>()
  for (const entry of entries) {
    for (const tag of entry.techniques) {
      if (tag.replace(/[\s-]+/g, "").toLowerCase() === skip) continue
      tally.set(tag, (tally.get(tag) ?? 0) + 1)
    }
  }
  return [...tally]
    .filter(([, n]) => n > 1 || entries.length < 4)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([tag]) => tag)
}

function listOf(titles: string[], total: number): string {
  const shown = titles.slice(0, 3).join(", ")
  return total > 3 ? `${shown} and more` : shown
}

export function metaDescription(
  cfg: GlobalConfiguration,
  file: QuartzPluginData,
  allFiles: QuartzPluginData[],
  entries: PostEntry[],
  post?: PostEntry,
): string {
  const own = String(file.frontmatter?.description ?? "").trim()
  if (own) return truncate(own)
  const slug = file.slug!
  const text = excerpt(file)

  switch (pageKind(slug, post)) {
    case "home":
      return truncate(SITE.description)
    case "notFound":
      return truncate(`This page does not exist on ${cfg.pageTitle}.`)
    case "post": {
      if (post!.kind === "research") return truncate(text || post!.title)
      const section = findSection(post!.section)
      const label = [section?.searchLabel, post!.category, section?.noun.one ?? "post"]
      const rating = post!.difficulty ? ` (${post!.difficulty})` : ""
      return truncate(`${label.filter(Boolean).join(" ")} for "${post!.title}"${rating}. ${text}`)
    }
    case "folder": {
      if (text && text !== file.frontmatter?.title) return truncate(text)
      const info = folderInfo(slug, entries)
      const { section, category, posts } = info
      if (!posts.length) break
      const subject = category
        ? [section?.searchLabel, category].filter(Boolean).join(" ")
        : (section?.searchLabel ?? section?.label ?? "")
      const noun =
        posts.length === 1 ? (section?.noun.one ?? "post") : (section?.noun.many ?? "posts")
      const tags = commonTags(posts, category)
      const detail = tags.length
        ? `, covering ${tags.join(", ")}`
        : `: ${listOf(
            posts.map((entry) => entry.title),
            posts.length,
          )}`
      return truncate(`${posts.length} ${subject} ${noun}${detail}.`)
    }
    case "tag": {
      if (slug === "tags/index") return truncate(`Every tag used on ${cfg.pageTitle}.`)
      const tag = file.frontmatter?.title ?? slug.slice("tags/".length)
      const tagged = filesTagged(allFiles, tag)
      if (!tagged.length) break
      const titles = tagged.map((f) => f.frontmatter?.title ?? "").filter(Boolean)
      const noun = tagged.length === 1 ? "post" : "posts"
      return truncate(
        `${tagged.length} ${noun} tagged ${tag} on ${cfg.pageTitle}, including ${listOf(titles, tagged.length)}.`,
      )
    }
  }
  return truncate(text || SITE.description)
}

/**
 * The date a page was last changed. A file's latest edit can predate the date it is listed under,
 * because frontmatter `date:` wins over git for the published date, so never report an earlier one.
 */
export function lastModified(file: QuartzPluginData): Date | undefined {
  const created = validDate(file.dates?.created)
  const modified = validDate(file.dates?.modified)
  if (created && modified) return modified > created ? modified : created
  return modified ?? created
}

function validDate(date: Date | undefined): Date | undefined {
  return date && !isNaN(date.getTime()) && date.getTime() > 0 ? date : undefined
}

interface Crumb {
  name: string
  url: string
}

function breadcrumbs(cfg: GlobalConfiguration, file: QuartzPluginData): Crumb[] {
  const base = cfg.baseUrl
  const parts = file.slug!.split("/")
  const crumbs: Crumb[] = [{ name: "Home", url: absoluteUrl(base) }]
  for (let i = 0; i < parts.length - 1; i++) {
    crumbs.push({
      name: segmentName(parts[i]),
      url: absoluteUrl(base, `${parts.slice(0, i + 1).join("/")}/index` as FullSlug),
    })
  }
  if (parts.at(-1) !== "index") {
    crumbs.push({ name: file.frontmatter?.title ?? segmentName(parts.at(-1)!), url: "" })
  }
  crumbs[crumbs.length - 1].url = absoluteUrl(base, file.slug!)
  return crumbs
}

function structuredData(
  cfg: GlobalConfiguration,
  file: QuartzPluginData,
  seo: Omit<PageSeo, "jsonLd">,
) {
  const home = absoluteUrl(cfg.baseUrl)
  const authorId = `${home}#author`
  const websiteId = `${home}#website`
  const graph: object[] = [
    {
      "@type": "Person",
      "@id": authorId,
      name: SITE.author.name,
      url: home,
      sameAs: SITE.author.profiles,
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      url: home,
      name: cfg.pageTitle,
      description: SITE.description,
      inLanguage: cfg.locale,
      publisher: { "@id": authorId },
    },
  ]
  if (seo.kind === "home" || seo.kind === "notFound")
    return { "@context": "https://schema.org", "@graph": graph }

  const crumbs = breadcrumbs(cfg, file)
  graph.push({
    "@type": "BreadcrumbList",
    "@id": `${seo.canonical}#breadcrumb`,
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  })

  const name = file.frontmatter?.title ?? cfg.pageTitle
  const page = {
    "@id": seo.canonical,
    url: seo.canonical,
    name,
    description: seo.description,
    inLanguage: cfg.locale,
    isPartOf: { "@id": websiteId },
    breadcrumb: { "@id": `${seo.canonical}#breadcrumb` },
  }
  if (seo.kind === "post") {
    graph.push({
      ...page,
      "@type": "TechArticle",
      headline: name.length > 110 ? truncate(name, 110) : name,
      mainEntityOfPage: seo.canonical,
      author: { "@id": authorId },
      publisher: { "@id": authorId },
      image: seo.image.url,
      license: SITE.license,
      ...(seo.published && { datePublished: seo.published.toISOString() }),
      ...(seo.modified && { dateModified: seo.modified.toISOString() }),
      ...(seo.section && { articleSection: seo.section }),
      ...(seo.tags.length && { keywords: seo.tags.join(", ") }),
    })
  } else {
    graph.push({ ...page, "@type": seo.kind === "page" ? "WebPage" : "CollectionPage" })
  }
  return { "@context": "https://schema.org", "@graph": graph }
}

const entriesCache = new WeakMap<QuartzPluginData[], PostEntry[]>()

export function pageSeo(
  cfg: GlobalConfiguration,
  file: QuartzPluginData,
  allFiles: QuartzPluginData[],
): PageSeo {
  let entries = entriesCache.get(allFiles)
  if (!entries) {
    entries = buildPostEntries(cfg, allFiles)
    entriesCache.set(allFiles, entries)
  }
  const post = buildPostEntry(cfg, file)
  const kind = pageKind(file.slug, post)
  const title = documentTitle(cfg, file, entries, post)
  const isPost = kind === "post"
  const seo: Omit<PageSeo, "jsonLd"> = {
    kind,
    title,
    description: metaDescription(cfg, file, allFiles, entries, post),
    canonical: absoluteUrl(cfg.baseUrl, file.slug!),
    robots: kind === "notFound" ? "noindex, follow" : "index, follow, max-image-preview:large",
    image: {
      url: absoluteAssetUrl(cfg.baseUrl, OG_IMAGE.path),
      width: OG_IMAGE.width,
      height: OG_IMAGE.height,
      alt: `${cfg.pageTitle}: ${SITE.tagline}`,
    },
    published: isPost ? validDate(post!.date) : undefined,
    modified: isPost ? lastModified(file) : undefined,
    section: post?.category,
    tags: post ? [post.categoryTag, ...post.tags].filter((t): t is string => !!t) : [],
  }
  return { ...seo, jsonLd: structuredData(cfg, file, seo) }
}

/** JSON for an inline `<script>`: `<` is escaped so text in a title can never close the element. */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
