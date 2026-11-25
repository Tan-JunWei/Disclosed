import { GlobalConfiguration } from "../cfg"
import { getDate } from "../components/Date"
import { QuartzPluginData } from "../plugins/vfile"
import { FullSlug } from "./path"
import {
  DIFFICULTY_ORDER,
  Rating,
  Difficulty,
  SEVERITY_ORDER,
  Severity,
  ratingOf,
  severityFromScore,
} from "./ratings"
import { SECTIONS, SectionKind, findSection } from "./sections"
import { techniqueFamilies } from "./techniques"

export type { Difficulty, Severity } from "./ratings"

export interface PostEntry {
  slug: FullSlug
  title: string
  section: string
  sectionLabel: string
  kind: SectionKind
  category: string
  categoryTag?: string
  difficulty?: Difficulty
  severity?: Severity
  cve: string[]
  cvss?: number
  /** Affected GitHub project as `owner/repo`. */
  project?: string
  /** Weakness identifiers such as `CWE-287`. */
  cwe: string[]
  /** Free text such as `< 1.4.2`. */
  affected?: string
  fixed?: string
  /** Links to the fix and to the vendor advisory (http or https only). */
  patch?: string
  advisory?: string
  techniques: string[]
  tags: string[]
  date?: Date
  description?: string
}

export function findDifficulty(tags: string[]): Difficulty | undefined {
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    if ((DIFFICULTY_ORDER as readonly string[]).includes(lower)) {
      return lower as Difficulty
    }
  }
  return undefined
}

// the category tag is the folder name with whitespace stripped (e.g. "General Skills" -> "GeneralSkills")
function findCategoryTag(tags: string[], category: string): string | undefined {
  const normalized = category.replace(/\s+/g, "").toLowerCase()
  return tags.find((tag) => tag.replace(/\s+/g, "").toLowerCase() === normalized)
}

// Quartz builds a description from the start of the page, so a leading heading such as "Summary" or
// "Challenge Description" and a trailing "Author: ..." line would otherwise show up as the excerpt.
const LEADING_HEADINGS = /^(?:(?:challenge description|summary|overview|abstract|description)\s*)+/i

function cleanExcerpt(desc: string | undefined): string | undefined {
  if (!desc) return undefined
  const cleaned = desc
    .replace(LEADING_HEADINGS, "")
    .split(/\s*Author:/)[0]
    .trim()
  return cleaned || undefined
}

function asList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return items.map((item) => String(item).trim()).filter(Boolean)
}

function findSeverity(frontmatter: Record<string, unknown>, cvss: number | undefined) {
  const explicit = String(frontmatter.severity ?? "").toLowerCase()
  if ((SEVERITY_ORDER as readonly string[]).includes(explicit)) return explicit as Severity
  return cvss === undefined ? undefined : severityFromScore(cvss)
}

/** The rating a page declares in its frontmatter: severity (or CVSS) if present, else a difficulty tag. */
export function ratingFromFrontmatter(
  frontmatter: QuartzPluginData["frontmatter"],
): Rating | undefined {
  const fm: Record<string, unknown> = frontmatter ?? {}
  const cvssValue = Number(fm.cvss)
  const cvss = Number.isFinite(cvssValue) && fm.cvss !== "" ? cvssValue : undefined
  return ratingOf({
    severity: findSeverity(fm, cvss),
    difficulty: findDifficulty(frontmatter?.tags ?? []),
  })
}

const CVE_ID = /^CVE-\d{4}-\d{4,}$/

/** `287` and `cwe-287` both become `CWE-287`. */
export function normalizeCwe(value: string): string | undefined {
  const id = value
    .trim()
    .toUpperCase()
    .replace(/^CWE[-\s]?/, "")
  return /^\d+$/.test(id) ? `CWE-${id}` : undefined
}

/** Only http(s) links are kept, so a typo or a pasted `javascript:` URL can never become a link. */
export function safeUrl(value: unknown): string | undefined {
  try {
    const url = new URL(String(value ?? "").trim())
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined
  } catch {
    return undefined
  }
}

const plainText = (value: unknown) => String(value ?? "").trim() || undefined

/** `https://github.com/owner/repo/` and `owner/repo` both become `owner/repo`. */
function normalizeProject(value: unknown): string | undefined {
  const project = String(value ?? "")
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
  return /^[\w.-]+\/[\w.-]+$/.test(project) ? project : undefined
}

/**
 * Derives a single post's metadata from its folder (`<Section>/<Category>/<file>.md`) and its
 * frontmatter. Returns undefined for anything that isn't a post: collection pages, the Explore page,
 * and notes outside the registered sections.
 */
export function buildPostEntry(
  cfg: GlobalConfiguration,
  file: QuartzPluginData,
): PostEntry | undefined {
  const frontmatter: Record<string, unknown> = file.frontmatter ?? {}
  const tags = file.frontmatter?.tags ?? []
  if (!file.slug || !file.filePath) return undefined

  const segments = (file.relativePath ?? file.filePath).split("/")
  if (segments.length !== 3 && file.relativePath) return undefined
  const folder = segments.at(-3)
  const category = segments.at(-2)
  const section = findSection(folder)
  if (!folder || !category || !section) return undefined

  const isResearch = section.kind === "research"
  const difficulty = section.kind === "ctf" ? findDifficulty(tags) : undefined
  const cvssValue = Number(frontmatter.cvss)
  const cvss = Number.isFinite(cvssValue) && frontmatter.cvss !== "" ? cvssValue : undefined
  const categoryTag = findCategoryTag(tags, category)
  const restTags = tags.filter(
    (tag) => tag !== categoryTag && tag.toLowerCase() !== difficulty && tag !== "ChallengeCreation",
  )

  return {
    slug: file.slug,
    title: file.frontmatter?.title ?? category,
    section: section.folder,
    sectionLabel: section.label,
    kind: section.kind,
    category,
    categoryTag,
    difficulty,
    severity: isResearch ? findSeverity(frontmatter, cvss) : undefined,
    cve: isResearch
      ? asList(frontmatter.cve)
          .map((id) => id.toUpperCase())
          .filter((id) => CVE_ID.test(id))
      : [],
    cvss: isResearch ? cvss : undefined,
    project: isResearch ? normalizeProject(frontmatter.project) : undefined,
    cwe: isResearch ? asList(frontmatter.cwe).flatMap((id) => normalizeCwe(id) ?? []) : [],
    affected: isResearch ? plainText(frontmatter.affected) : undefined,
    fixed: isResearch ? plainText(frontmatter.fixed) : undefined,
    patch: isResearch ? safeUrl(frontmatter.patch) : undefined,
    advisory: isResearch ? safeUrl(frontmatter.advisory) : undefined,
    techniques: techniqueFamilies(tags),
    tags: [...new Set(restTags)],
    date: getDate(cfg, file),
    description: cleanExcerpt(file.description),
  }
}

export function buildPostEntries(
  cfg: GlobalConfiguration,
  allFiles: QuartzPluginData[],
): PostEntry[] {
  return allFiles.flatMap((file) => buildPostEntry(cfg, file) ?? [])
}

/**
 * Tagged pages shaped like posts (<Folder>/<Category>/<file>.md) under a top-level folder that is
 * not a registered section. They are deliberately ignored (the registry keeps unrelated notes out of
 * the stats), so this reports them rather than letting them disappear silently.
 */
export function findUnregisteredSections(allFiles: QuartzPluginData[]): string[] {
  const folders = new Set<string>()
  for (const file of allFiles) {
    const segments = (file.relativePath ?? "").split("/")
    if (segments.length !== 3 || !(file.frontmatter?.tags ?? []).length) continue
    if (!findSection(segments[0])) folders.add(segments[0])
  }
  return [...folders].sort()
}

export interface Facets {
  sections: string[]
  categories: string[]
  difficulties: Difficulty[]
  severities: Severity[]
  tags: { tag: string; count: number }[]
}

export function computeFacets(entries: PostEntry[]): Facets {
  const present = new Set(entries.map((e) => e.section))
  const sections = [
    ...SECTIONS.map((section) => section.folder).filter((folder) => present.has(folder)),
    ...[...present].filter((folder) => !findSection(folder)).sort(),
  ]
  const categories = [...new Set(entries.map((e) => e.category))].sort()
  const difficulties = DIFFICULTY_ORDER.filter((d) =>
    entries.some((e) => e.difficulty === d),
  ) as Difficulty[]
  const severities = SEVERITY_ORDER.filter((s) =>
    entries.some((e) => e.severity === s),
  ) as Severity[]

  const tagCounts = new Map<string, number>()
  for (const entry of entries) {
    for (const tag of entry.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  const tags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))

  return { sections, categories, difficulties, severities, tags }
}

export interface PostStats {
  total: number
  difficultyCounts: { difficulty: Difficulty; count: number }[]
  severityCounts: { severity: Severity; count: number }[]
  categoriesTotal: number
  tagsTotal: number
  sectionsTotal: number
  /** Distinct CVE identifiers across all research posts. */
  cveTotal: number
}

export function computePostStats(entries: PostEntry[]): PostStats {
  const facets = computeFacets(entries)

  const difficultyCounts = facets.difficulties.map((difficulty) => ({
    difficulty,
    count: entries.filter((e) => e.difficulty === difficulty).length,
  }))

  const severityCounts = facets.severities.map((severity) => ({
    severity,
    count: entries.filter((e) => e.severity === severity).length,
  }))

  return {
    total: entries.length,
    difficultyCounts,
    severityCounts,
    categoriesTotal: facets.categories.length,
    tagsTotal: facets.tags.length,
    sectionsTotal: facets.sections.length,
    cveTotal: new Set(entries.flatMap((e) => e.cve)).size,
  }
}
