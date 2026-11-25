import { Root } from "hast"
import { GlobalConfiguration } from "../../cfg"
import { getDate } from "../../components/Date"
import { escapeHTML } from "../../util/escape"
import { FilePath, FullSlug, SimpleSlug, joinSegments } from "../../util/path"
import { absoluteAssetUrl, absoluteUrl } from "../../util/siteUrl"
import { lastModified } from "../../util/seo"
import { SITE } from "../../util/site"
import { QuartzPluginData } from "../vfile"
import { QuartzEmitterPlugin } from "../types"
import { toHtml } from "hast-util-to-html"
import { write } from "./helpers"
import DepGraph from "../../depgraph"
import { buildPostEntries } from "../../util/posts"
import { buildGraphRelationships } from "../../util/graphRelationships"
import { unreviewedTags } from "../../util/techniques"

export type ContentIndex = Map<FullSlug, ContentDetails>
export type ContentDetails = {
  title: string
  links: SimpleSlug[]
  tags: string[]
  content: string
  richContent?: string
  date?: Date
  description?: string
}

interface Options {
  enableSiteMap: boolean
  enableRSS: boolean
  rssLimit?: number
  rssFullHtml: boolean
  includeEmptyFiles: boolean
}

const defaultOptions: Options = {
  enableSiteMap: true,
  enableRSS: true,
  rssLimit: 10,
  rssFullHtml: false,
  includeEmptyFiles: true,
}

const xml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

export interface SitemapEntry {
  slug: FullSlug
  lastmod?: Date
}

/** Folder and tag listing pages, which have no source file of their own. */
export function listingSlugs(files: QuartzPluginData[]): FullSlug[] {
  const slugs = new Set<FullSlug>()
  for (const file of files) {
    const parts = file.slug?.split("/") ?? []
    for (let i = 1; i < parts.length; i++) {
      slugs.add(`${parts.slice(0, i).join("/")}/index` as FullSlug)
    }
    const tags = file.frontmatter?.tags ?? []
    if (tags.length) slugs.add("tags/index" as FullSlug)
    for (const tag of tags) {
      const segments = tag.split("/")
      for (let i = 1; i <= segments.length; i++) {
        slugs.add(`tags/${segments.slice(0, i).join("/")}` as FullSlug)
      }
    }
  }
  return [...slugs]
}

export function generateSiteMap(cfg: GlobalConfiguration, entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      ({ slug, lastmod }) =>
        `<url><loc>${xml(absoluteUrl(cfg.baseUrl, slug))}</loc>${
          lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ""
        }</url>`,
    )
    .join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

function generateRSSFeed(cfg: GlobalConfiguration, idx: ContentIndex, limit?: number): string {
  const home = absoluteUrl(cfg.baseUrl)
  const feedUrl = absoluteAssetUrl(cfg.baseUrl, "index.xml")

  const createURLEntry = (slug: FullSlug, content: ContentDetails): string => {
    const link = xml(absoluteUrl(cfg.baseUrl, slug))
    return `<item>
    <title>${xml(content.title)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <description>${content.richContent ?? content.description}</description>
    ${content.date ? `<pubDate>${content.date.toUTCString()}</pubDate>` : ""}
  </item>`
  }

  const items = Array.from(idx)
    .sort(([_, f1], [__, f2]) => {
      if (f1.date && f2.date) {
        return f2.date.getTime() - f1.date.getTime()
      } else if (f1.date && !f2.date) {
        return -1
      } else if (!f1.date && f2.date) {
        return 1
      }

      return f1.title.localeCompare(f2.title)
    })
    .map(([slug, content]) => createURLEntry(slug, content))
    .slice(0, limit ?? idx.size)
    .join("")

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
      <title>${xml(cfg.pageTitle)}</title>
      <link>${xml(home)}</link>
      <atom:link href="${xml(feedUrl)}" rel="self" type="application/rss+xml" />
      <description>${xml(SITE.description)}</description>
      <language>${cfg.locale}</language>
      <generator>Quartz -- quartz.jzhao.xyz</generator>
      ${items}
    </channel>
  </rss>`
}

export const ContentIndex: QuartzEmitterPlugin<Partial<Options>> = (opts) => {
  opts = { ...defaultOptions, ...opts }
  return {
    name: "ContentIndex",
    async getDependencyGraph(ctx, content, _resources) {
      const graph = new DepGraph<FilePath>()

      for (const [_tree, file] of content) {
        const sourcePath = file.data.filePath!

        graph.addEdge(
          sourcePath,
          joinSegments(ctx.argv.output, "static/contentIndex.json") as FilePath,
        )
        graph.addEdge(
          sourcePath,
          joinSegments(ctx.argv.output, "static/graphIndex.json") as FilePath,
        )
        if (opts?.enableSiteMap) {
          graph.addEdge(sourcePath, joinSegments(ctx.argv.output, "sitemap.xml") as FilePath)
        }
        if (opts?.enableRSS) {
          graph.addEdge(sourcePath, joinSegments(ctx.argv.output, "index.xml") as FilePath)
        }
      }

      return graph
    },
    async emit(ctx, content, _resources) {
      const cfg = ctx.cfg.configuration
      const emitted: FilePath[] = []
      const linkIndex: ContentIndex = new Map()
      for (const [tree, file] of content) {
        const slug = file.data.slug!
        const date = getDate(ctx.cfg.configuration, file.data)
        if (opts?.includeEmptyFiles || (file.data.text && file.data.text !== "")) {
          linkIndex.set(slug, {
            title: file.data.frontmatter?.title!,
            links: file.data.links ?? [],
            tags: file.data.frontmatter?.tags ?? [],
            content: file.data.text ?? "",
            richContent: opts?.rssFullHtml
              ? escapeHTML(toHtml(tree as Root, { allowDangerousHtml: true }))
              : undefined,
            date: date,
            description: file.data.description ?? "",
          })
        }
      }

      const files = content.map(([, file]) => file.data)
      const entries = buildPostEntries(cfg, files)
      const postSlugs = new Set(entries.map((entry) => entry.slug))

      if (opts?.enableSiteMap) {
        emitted.push(
          await write({
            ctx,
            content: generateSiteMap(cfg, [
              ...content.map(([, file]) => ({
                slug: file.data.slug!,
                lastmod: lastModified(file.data),
              })),
              ...listingSlugs(files).map((slug) => ({ slug })),
            ]),
            slug: "sitemap" as FullSlug,
            ext: ".xml",
          }),
        )
      }

      if (opts?.enableRSS) {
        emitted.push(
          await write({
            ctx,
            // posts only: the home, landing and Explore pages are not news
            content: generateRSSFeed(
              cfg,
              new Map([...linkIndex].filter(([slug]) => postSlugs.has(slug))),
              opts.rssLimit,
            ),
            slug: "index" as FullSlug,
            ext: ".xml",
          }),
        )
      }

      const unknown = unreviewedTags(entries.flatMap((entry) => entry.tags))
      if (unknown.length)
        console.warn(
          `Unreviewed technique tags (left unclassified): ${unknown.join(", ")}. They appear in the ` +
            `homepage heatmap's "Unsorted" column until added to TECHNIQUE_FAMILIES (quartz/util/techniques.ts).`,
        )
      emitted.push(
        await write({
          ctx,
          content: JSON.stringify(buildGraphRelationships(files, entries)),
          slug: "static/graphIndex" as FullSlug,
          ext: ".json",
        }),
      )

      const fp = joinSegments("static", "contentIndex") as FullSlug
      const simplifiedIndex = Object.fromEntries(
        Array.from(linkIndex).map(([slug, content]) => {
          // remove description and from content index as nothing downstream
          // actually uses it. we only keep it in the index as we need it
          // for the RSS feed
          delete content.description
          delete content.date
          return [slug, content]
        }),
      )

      emitted.push(
        await write({
          ctx,
          content: JSON.stringify(simplifiedIndex),
          slug: fp,
          ext: ".json",
        }),
      )

      return emitted
    },
    getQuartzComponents: () => [],
  }
}
