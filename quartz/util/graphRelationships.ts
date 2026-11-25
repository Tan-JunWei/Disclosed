import { QuartzPluginData } from "../plugins/vfile"
import { SimpleSlug, simplifySlug, slugTag } from "./path"
import { PostEntry } from "./posts"
import { SECTIONS, findSection } from "./sections"
import { isTechniqueTag, tagLabel } from "./techniques"

export type RelationshipType =
  | "authored"
  | "collection"
  | "category"
  | "technique"
  | "section"
  | "navigation"
export interface GraphNode {
  id: SimpleSlug
  title: string
  destination: string
  tags: string[]
}
export interface GraphRelationship {
  source: SimpleSlug
  target: SimpleSlug
  type: RelationshipType
}
export interface RelationshipIndex {
  nodes: GraphNode[]
  relationships: GraphRelationship[]
}

export function buildGraphRelationships(
  files: QuartzPluginData[],
  entries: PostEntry[],
): RelationshipIndex {
  const filesBySlug = new Map(files.map((file) => [file.slug, file]))
  const nodes = new Map<SimpleSlug, GraphNode>()
  const relationships = new Map<string, GraphRelationship>()
  for (const file of files) {
    if (!file.slug) continue
    const id = simplifySlug(file.slug)
    nodes.set(id, {
      id,
      title: file.frontmatter?.title ?? id,
      destination: id,
      tags: file.frontmatter?.tags ?? [],
    })
  }
  function connect(source: SimpleSlug, target: SimpleSlug, type: RelationshipType) {
    if (source !== target && nodes.has(source) && nodes.has(target)) {
      relationships.set(`${source}\0${target}\0${type}`, { source, target, type })
    }
  }
  function facet(kind: string, value: string, title: string, tag?: string): SimpleSlug {
    const id = (
      tag ? `tags/${slugTag(tag)}` : `_graph/${kind}/${encodeURIComponent(value)}`
    ) as SimpleSlug
    if (!nodes.has(id))
      nodes.set(id, {
        id,
        title,
        destination: tag ? id : `Explore?${kind}=${encodeURIComponent(value)}`,
        tags: [],
      })
    return id
  }
  for (const file of files) {
    if (!file.slug) continue
    for (const link of file.links ?? []) connect(simplifySlug(file.slug), link, "authored")
  }
  const home = files.find((file) => file.slug === "index")?.slug
  const explore = files.find((file) => file.slug === "Explore")?.slug
  if (home) {
    if (explore) connect(simplifySlug(home), simplifySlug(explore), "navigation")
    for (const section of SECTIONS) {
      connect(simplifySlug(home), simplifySlug(section.landing), "navigation")
    }
  }
  for (const entry of entries) {
    const source = simplifySlug(entry.slug)
    if (explore) connect(simplifySlug(explore), source, "collection")
    const collectionSlug = findSection(entry.section)?.landing
    const collection = collectionSlug ? simplifySlug(collectionSlug) : undefined
    if (collection && nodes.has(collection)) connect(collection, source, "collection")
    const section =
      collection && nodes.has(collection)
        ? collection
        : facet("section", entry.section, entry.sectionLabel)
    connect(source, section, "section")
    connect(
      source,
      facet("category", entry.category, entry.category, entry.categoryTag),
      "category",
    )
    const tags = filesBySlug.get(entry.slug)?.frontmatter?.tags ?? entry.tags
    for (const tag of tags.filter(isTechniqueTag))
      connect(source, facet("tag", tag, tagLabel(tag), tag), "technique")
  }
  return { nodes: [...nodes.values()], relationships: [...relationships.values()] }
}
