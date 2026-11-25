/**
 * The full-text search index. FlexSearch is only needed once someone searches, so this is built as
 * its own module (see the LazyModules emitter) and fetched together with the content index.
 */
import FlexSearch from "flexsearch"
import type { ContentDetails } from "../../../plugins/emitters/contentIndex"
import type { FullSlug } from "../../../util/path"

export interface Item {
  id: number
  slug: FullSlug
  title: string
  content: string
  tags: string[]
}

export type SearchIndex = FlexSearch.Document<Item>

const encoder = (str: string) => str.toLowerCase().split(/([^a-z]|[^\x00-\x7F])/)

/** Indexes every page. A page's id is its position in `Object.keys(data)`. */
export async function buildIndex(data: Record<FullSlug, ContentDetails>): Promise<SearchIndex> {
  const index = new FlexSearch.Document<Item>({
    charset: "latin:extra",
    encode: encoder,
    document: {
      id: "id",
      tag: "tags",
      index: [
        { field: "title", tokenize: "forward" },
        { field: "content", tokenize: "forward" },
        { field: "tags", tokenize: "forward" },
      ],
    },
  })
  await Promise.all(
    Object.entries(data).map(([slug, details], id) =>
      index.addAsync(id, {
        id,
        slug: slug as FullSlug,
        title: details.title,
        content: details.content,
        tags: details.tags,
      }),
    ),
  )
  return index
}
