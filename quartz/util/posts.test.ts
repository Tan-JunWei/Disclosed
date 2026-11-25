import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { QuartzPluginData } from "../plugins/vfile"
import { GlobalConfiguration } from "../cfg"
import { FilePath, FullSlug, SimpleSlug, slugifyFilePath, slugTag, simplifySlug } from "./path"
import { TECHNIQUE_FAMILIES, techniqueFamilies, tagLabel, unreviewedTags } from "./techniques"
import {
  buildPostEntries,
  buildPostEntry,
  computeFacets,
  computePostStats,
  findUnregisteredSections,
  normalizeCwe,
  ratingFromFrontmatter,
  safeUrl,
} from "./posts"
import { SEVERITY_HUE, ratingOf, ratingRank, severityFromScore } from "./ratings"
import { SECTIONS, findSection } from "./sections"
import { buildGraphRelationships } from "./graphRelationships"
import { cardMatches, stateFromURL, stateToQuery, fuzzySearchScore } from "./postFilters"

const cfg = { defaultDateType: "created" } as GlobalConfiguration
function fixture(
  relativePath: string,
  tags: string[] = [],
  links: string[] = [],
): QuartzPluginData {
  return {
    slug: slugifyFilePath(relativePath as FilePath),
    relativePath: relativePath as FilePath,
    filePath: `content/${relativePath}` as FilePath,
    frontmatter: { title: path.basename(relativePath, ".md"), tags },
    links: links as SimpleSlug[],
  }
}
function markdownFiles(directory: string): QuartzPluginData[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return markdownFiles(full)
    if (!entry.name.endsWith(".md")) return []
    const { data } = matter(fs.readFileSync(full, "utf8"))
    return [fixture(path.relative("content", full), (data.tags ?? []).map(slugTag))]
  })
}

test("explicit tags classify across families without category or difficulty inference", () => {
  assert.deepEqual(
    techniqueFamilies(["Cryptography", "Forensics", "easy", "ChallengeCreation", "Jenkins"]),
    [],
  )
  assert.deepEqual(techniqueFamilies(["Vigenere", "Python", "base64", "PYTHON"]), [
    "cryptanalysis",
    "encoding",
    "scripting",
  ])
  assert.deepEqual(techniqueFamilies(["aircrack-ng"]), ["cryptanalysis", "network"])
  assert.deepEqual(unreviewedTags(["NewTool", "Forensics", "Jenkins"]), ["NewTool"])
  assert.equal(
    new Set(TECHNIQUE_FAMILIES.flatMap((family) => family.id)).size,
    TECHNIQUE_FAMILIES.length,
  )
})

test("tag labels split camelCase words but keep proper names intact", () => {
  assert.equal(tagLabel("FileUploadBypass"), "File Upload Bypass")
  assert.equal(tagLabel("pcap"), "Packet capture")
  assert.equal(tagLabel("OpenSSL"), "OpenSSL")
  assert.equal(tagLabel("aircrack-ng"), "aircrack-ng")
})

test("tagged pages under an unregistered section folder are reported, not silently dropped", () => {
  const files = [
    fixture("PicoCTF/Forensics/A.md", ["Forensics", "easy", "pcap"]),
    fixture("TryHackMe/Web/B.md", ["Web", "easy"]),
    fixture("Notes/Other/C.md", ["Python"]),
    fixture("TryHackMe/Web/Untagged.md", []),
    fixture("PicoCTF/PicoCTF Writeups.md", ["Python"]),
  ]
  assert.deepEqual(findUnregisteredSections(files), ["Notes", "TryHackMe"])
  assert.deepEqual(findUnregisteredSections([files[0], files[4]]), [])
})

test("a single writeup entry is derived from its own path and frontmatter", () => {
  const entry = buildPostEntry(
    cfg,
    fixture("PicoCTF/Forensics/Operation Orchid.md", [
      "Forensics",
      "medium",
      "Sleuthkit",
      "OpenSSL",
    ]),
  )
  assert.equal(entry?.sectionLabel, "picoCTF")
  assert.equal(entry?.category, "Forensics")
  assert.equal(entry?.difficulty, "medium")
  assert.deepEqual(entry?.tags, ["Sleuthkit", "OpenSSL"])
  // collection pages, the Explore page and unrelated notes are not writeups
  assert.equal(buildPostEntry(cfg, fixture("PicoCTF/PicoCTF Writeups.md", ["Python"])), undefined)
  assert.equal(buildPostEntry(cfg, fixture("Explore.md")), undefined)
  assert.equal(buildPostEntry(cfg, fixture("Notes/Other/A.md", ["Python"])), undefined)
})

test("writeup metadata excludes collections and unrelated tagged pages", () => {
  const entries = buildPostEntries(cfg, [
    fixture("PicoCTF/Forensics/A.md", ["Forensics", "easy", "pcap", "pcap"]),
    fixture("PicoCTF/Collection.md", ["Python"]),
    fixture("Notes/Other/A.md", ["Python"]),
  ])
  assert.equal(entries.length, 1)
  assert.deepEqual(entries[0].tags, ["pcap"])
  assert.deepEqual(entries[0].techniques, ["network"])
  assert.equal(computeFacets(entries).tags[0].count, 1)
})

test("graph resolves authored and structural relationships with unique valid identities", () => {
  const note = fixture(
    "Challenge Creation/Cryptography/French Frenzy.md",
    ["Cryptography", "Vigenere", "easy"],
    ["PicoCTF/Forensics/Packets-Primer", "missing"],
  )
  const files = [
    fixture("Challenge Creation/CTF Challenges I've Created.md"),
    note,
    fixture("PicoCTF/PicoCTF Writeups.md"),
    fixture("PicoCTF/Forensics/Packets Primer.md", ["Forensics", "pcap"]),
  ]
  const graph = buildGraphRelationships(files, buildPostEntries(cfg, files))
  const ids = new Set(graph.nodes.map((node) => node.id))
  assert.equal(ids.size, graph.nodes.length)
  assert(
    graph.relationships.every(
      (edge) => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target,
    ),
  )
  assert.equal(
    new Set(graph.relationships.map((edge) => JSON.stringify(edge))).size,
    graph.relationships.length,
  )
  assert(
    graph.relationships.some(
      (edge) =>
        edge.type === "collection" &&
        edge.source === "Challenge-Creation/CTF-Challenges-I've-Created" &&
        edge.target === simplifySlug(note.slug!),
    ),
  )
  assert(
    graph.relationships.some(
      (edge) => edge.type === "technique" && edge.target === "tags/Vigenere",
    ),
  )
  assert(
    graph.relationships.some(
      (edge) => edge.type === "category" && edge.target === "tags/Cryptography",
    ),
  )
  assert(
    graph.relationships.some(
      (edge) => edge.type === "section" && edge.target === "PicoCTF/PicoCTF-Writeups",
    ),
  )
  assert.equal(graph.relationships.filter((edge) => edge.type === "authored").length, 1)
  assert.deepEqual(note.links, ["PicoCTF/Forensics/Packets-Primer", "missing"])
  const renamed = {
    ...note,
    slug: "Challenge-Creation/Cryptography/Renamed" as FullSlug,
    relativePath: "Challenge Creation/Cryptography/Renamed.md" as FilePath,
  }
  const updated = [files[0], renamed, ...files.slice(2)]
  const next = buildGraphRelationships(updated, buildPostEntries(cfg, updated))
  assert(!next.nodes.some((node) => node.id === simplifySlug(note.slug!)))
  assert(next.relationships.some((edge) => edge.target === simplifySlug(renamed.slug!)))
})

test("facet fallback destinations use Explore with encoded values", () => {
  const files = [fixture("PicoCTF/General Skills/A.md", ["Python"])]
  const graph = buildGraphRelationships(files, buildPostEntries(cfg, files))
  assert(graph.nodes.some((node) => node.destination === "Explore?category=General%20Skills"))
  assert(graph.nodes.some((node) => node.destination === "Explore?section=PicoCTF"))
  assert(graph.nodes.some((node) => node.destination === "tags/Python"))
})

test("filters round trip URLs, OR within facets and AND across facets", () => {
  const state = stateFromURL(
    "?q=PACKET&section=PicoCTF&category=Forensics&tag=Wireshark,pcap&technique=network&difficulty=easy&sort=name",
  )
  assert.equal(state.q, "packet")
  assert.equal(stateToQuery(stateFromURL(`?${stateToQuery(state)}`)), stateToQuery(state))
  const card = {
    dataset: {
      search: "packet primer",
      section: "PicoCTF",
      category: "Forensics",
      difficulty: "easy",
      tags: "pcap",
      techniques: "network",
    },
  }
  assert(cardMatches(card, state))
  assert(!cardMatches({ dataset: { ...card.dataset, category: "Cryptography" } }, state))
  assert(!cardMatches({ dataset: { ...card.dataset, tags: "python" } }, state))
  assert(cardMatches(card, stateFromURL("")))
  assert(!cardMatches(card, stateFromURL("?technique=unknown")))
})

test("current repository metadata is reviewed and all graph destinations resolve", () => {
  const files = markdownFiles("content")
  const entries = buildPostEntries(cfg, files)
  assert(entries.length > 100)
  assert.deepEqual(unreviewedTags(entries.flatMap((entry) => entry.tags)), [])
  const graph = buildGraphRelationships(files, entries)
  const actual = new Set(files.map((file) => simplifySlug(file.slug!)))
  const tags = new Set(
    files.flatMap((file) => (file.frontmatter?.tags ?? []).map((tag) => `tags/${tag}`)),
  )
  for (const node of graph.nodes)
    assert(
      actual.has(node.destination as SimpleSlug) ||
        tags.has(node.destination) ||
        node.destination.startsWith("Explore?"),
      node.destination,
    )
  for (const collection of ["CTF-Challenges-I've-Created", "PicoCTF-Writeups"]) {
    assert(
      graph.relationships.filter(
        (edge) => edge.type === "collection" && edge.source.endsWith(collection),
      ).length > 20,
    )
  }
})

test("untagged writeups retain structural relationships without technique guesses", () => {
  const files = [
    fixture("PicoCTF/PicoCTF Writeups.md"),
    fixture("PicoCTF/Cryptography/New Note.md"),
  ]
  const entries = buildPostEntries(cfg, files)
  assert.equal(entries.length, 1)
  assert.deepEqual(entries[0].techniques, [])
  const graph = buildGraphRelationships(files, entries)
  assert(graph.relationships.some((edge) => edge.type === "collection"))
  assert(!graph.relationships.some((edge) => edge.type === "technique"))
})

test("a tag can identify both a category and a technique without duplicate nodes", () => {
  const files = [fixture("Challenge Creation/OSINT/Note.md", ["OSINT", "easy"])]
  const graph = buildGraphRelationships(files, buildPostEntries(cfg, files))
  const edges = graph.relationships.filter((edge) => edge.target === "tags/OSINT")
  assert.deepEqual(
    edges.map((edge) => edge.type),
    ["category", "technique"],
  )
  assert.equal(graph.nodes.filter((node) => node.id === "tags/OSINT").length, 1)
})

test("fuzzy search handles typos, transpositions, accents and unordered query words", () => {
  for (const [query, text] of [
    ["packts primer", "Packets Primer"],
    ["wiershark", "Wireshark"],
    ["vigenere", "Vigenère"],
    ["primer packts", "Packets Primer"],
    ["pythn", "Python"],
    ["caesar cipher", "CaesarCipher"],
  ]) {
    assert(Number.isFinite(fuzzySearchScore(query, text)), `${query}: ${text}`)
  }
  assert(fuzzySearchScore("packet", "Packet capture") < fuzzySearchScore("packt", "Packet capture"))
  assert.equal(fuzzySearchScore("xyz", "RSA"), Infinity)
  assert.equal(fuzzySearchScore("cryptography", "Geography"), Infinity)
  assert.equal(fuzzySearchScore("unfindable-no-such-note", "Packets Primer"), Infinity)
  assert.equal(fuzzySearchScore("", "anything"), 0)
  assert.equal(fuzzySearchScore("x".repeat(200), "Python"), Infinity)
  const state = stateFromURL("?q=packts&section=PicoCTF")
  assert(cardMatches({ dataset: { search: "Packets Primer", section: "PicoCTF" } }, state))
  assert(
    !cardMatches({ dataset: { search: "Packets Primer", section: "Challenge Creation" } }, state),
  )
  // links from before the site covered more than CTFs used ?platform=
  assert.deepEqual([...stateFromURL("?platform=PicoCTF").facets.section], ["PicoCTF"])
})

test("Explore indexes all posts and the homepage connects to archive hubs", () => {
  const files = [
    fixture("index.md"),
    fixture("Explore.md"),
    fixture("PicoCTF/PicoCTF Writeups.md"),
    fixture("Challenge Creation/CTF Challenges I've Created.md"),
    fixture("PicoCTF/Forensics/A.md", ["Forensics", "pcap"], ["/"]),
    fixture("Challenge Creation/Cryptography/B.md", ["Cryptography", "Vigenere"]),
  ]
  const entries = buildPostEntries(cfg, files)
  const graph = buildGraphRelationships(files, entries)
  const targets = graph.relationships
    .filter((edge) => edge.source === "Explore" && edge.type === "collection")
    .map((edge) => edge.target)
    .sort()
  assert.deepEqual(targets, entries.map((entry) => simplifySlug(entry.slug)).sort())
  assert.deepEqual(
    graph.relationships
      .filter((edge) => edge.source === simplifySlug(files[0].slug!) && edge.type === "navigation")
      .map((edge) => edge.target)
      .sort(),
    ["Challenge-Creation/CTF-Challenges-I've-Created", "Explore", "PicoCTF/PicoCTF-Writeups"],
  )
  assert(
    graph.relationships.some(
      (edge) => edge.type === "authored" && edge.target === simplifySlug(files[0].slug!),
    ),
  )
  const updated = [...files, fixture("PicoCTF/General Skills/New.md", ["Python"])]
  const rebuilt = buildGraphRelationships(updated, buildPostEntries(cfg, updated))
  assert(
    rebuilt.relationships.some(
      (edge) => edge.source === "Explore" && edge.target === "PicoCTF/General-Skills/New",
    ),
  )
  const withoutHubs = files.filter((file) => file.slug !== "index" && file.slug !== "Explore")
  const partial = buildGraphRelationships(withoutHubs, buildPostEntries(cfg, withoutHubs))
  assert(
    !partial.relationships.some((edge) => edge.type === "navigation" || edge.source === "Explore"),
  )
})

function research(
  relativePath: string,
  extra: Record<string, unknown>,
  tags: string[] = [],
): QuartzPluginData {
  const file = fixture(relativePath, tags)
  file.frontmatter = { ...file.frontmatter!, ...extra }
  return file
}

test("every registered section has a landing page slug and a unique folder", () => {
  assert.equal(new Set(SECTIONS.map((section) => section.folder)).size, SECTIONS.length)
  assert.equal(new Set(SECTIONS.map((section) => section.landing)).size, SECTIONS.length)
  assert.equal(findSection("Vulnerability Research")?.kind, "research")
  assert.equal(findSection("PicoCTF")?.kind, "ctf")
  assert.equal(findSection("Nope"), undefined)
})

test("CVSS scores map onto the standard severity bands", () => {
  assert.equal(severityFromScore(0), undefined)
  assert.equal(severityFromScore(11), undefined)
  assert.equal(severityFromScore(3.9), "low")
  assert.equal(severityFromScore(4), "medium")
  assert.equal(severityFromScore(6.9), "medium")
  assert.equal(severityFromScore(7), "high")
  assert.equal(severityFromScore(8.8), "high")
  assert.equal(severityFromScore(9), "critical")
  assert.equal(severityFromScore(10), "critical")
})

test("a research post carries CVE, project, CVSS and a derived severity", () => {
  const file = research("Vulnerability Research/SSRF/Example.md", {
    cve: ["cve-2025-12345", "CVE-2025-54321", "not-a-cve"],
    cvss: 8.8,
    project: "https://github.com/owner/repo/",
  })
  const entry = buildPostEntry(cfg, file)
  assert.equal(entry?.kind, "research")
  assert.equal(entry?.section, "Vulnerability Research")
  assert.equal(entry?.category, "SSRF")
  assert.deepEqual(entry?.cve, ["CVE-2025-12345", "CVE-2025-54321"])
  assert.equal(entry?.cvss, 8.8)
  assert.equal(entry?.severity, "high")
  assert.equal(entry?.project, "owner/repo")
  assert.equal(entry?.difficulty, undefined)
})

test("an explicit severity wins over the CVSS band, and a single CVE may be a plain string", () => {
  const entry = buildPostEntry(
    cfg,
    research("Vulnerability Research/XSS/A.md", {
      cve: "CVE-2024-0001",
      cvss: 5.0,
      severity: "Critical",
    }),
  )
  assert.equal(entry?.severity, "critical")
  assert.deepEqual(entry?.cve, ["CVE-2024-0001"])
})

test("difficulty words are only difficulty in CTF sections, and CVE fields are ignored there", () => {
  const ctf = buildPostEntry(
    cfg,
    research("PicoCTF/Web/A.md", { cve: "CVE-2024-0001", cvss: 9.8 }, ["easy"]),
  )
  assert.equal(ctf?.difficulty, "easy")
  assert.equal(ctf?.severity, undefined)
  assert.deepEqual(ctf?.cve, [])
  const advisory = buildPostEntry(
    cfg,
    research("Vulnerability Research/Web/A.md", {}, ["easy", "SSRF"]),
  )
  assert.equal(advisory?.difficulty, undefined)
  assert.deepEqual(advisory?.tags, ["easy", "SSRF"])
})

test("ratings use one scale per post and share the difficulty colours", () => {
  assert.deepEqual(ratingOf({ difficulty: "hard" }), {
    scheme: "difficulty",
    level: "hard",
    hue: "hard",
  })
  assert.deepEqual(ratingOf({ severity: "critical" }), {
    scheme: "severity",
    level: "critical",
    hue: "insane",
  })
  assert.equal(ratingOf({}), undefined)
  assert.equal(ratingRank({}), 0)
  assert(ratingRank({ severity: "critical" }) > ratingRank({ severity: "low" }))
  assert.deepEqual(Object.keys(SEVERITY_HUE), ["low", "medium", "high", "critical"])
  assert.equal(ratingFromFrontmatter({ title: "x", tags: [], cvss: 9.1 })?.level, "critical")
  assert.equal(ratingFromFrontmatter({ title: "x", tags: ["Hard"] })?.level, "hard")
})

test("facets and stats cover CTF and research posts together", () => {
  const files = [
    fixture("PicoCTF/Web/A.md", ["easy", "Python"]),
    research("Vulnerability Research/SSRF/B.md", { cve: "CVE-2025-1111", cvss: 7.5 }, ["Burp"]),
    research("Vulnerability Research/XSS/C.md", {
      cve: ["CVE-2025-1111", "CVE-2025-2222"],
      severity: "low",
    }),
  ]
  const entries = buildPostEntries(cfg, files)
  const facets = computeFacets(entries)
  assert.deepEqual(facets.sections, ["PicoCTF", "Vulnerability Research"])
  assert.deepEqual(facets.difficulties, ["easy"])
  assert.deepEqual(facets.severities, ["low", "high"])

  const stats = computePostStats(entries)
  assert.equal(stats.total, 3)
  assert.equal(stats.sectionsTotal, 2)
  assert.equal(stats.cveTotal, 2)
  assert.deepEqual(stats.severityCounts, [
    { severity: "low", count: 1 },
    { severity: "high", count: 1 },
  ])
})

test("sections without any posts yet produce empty stats instead of errors", () => {
  const entries = buildPostEntries(cfg, [fixture("PicoCTF/Web/A.md", ["easy"])])
  const stats = computePostStats(entries)
  assert.equal(stats.cveTotal, 0)
  assert.deepEqual(stats.severityCounts, [])
  assert.deepEqual(computeFacets(entries).severities, [])
  assert.equal(computePostStats([]).total, 0)
})

test("the severity filter matches cards by their severity attribute", () => {
  const state = stateFromURL("?severity=high,critical")
  assert(cardMatches({ dataset: { search: "x", severity: "high" } }, state))
  assert(!cardMatches({ dataset: { search: "x", severity: "low" } }, state))
  assert(!cardMatches({ dataset: { search: "x" } }, state))
})

test("excerpts drop a leading heading word and a trailing author line", () => {
  const withDescription = (description: string) => {
    const file = research("Vulnerability Research/XSS/A.md", {})
    file.description = description
    return buildPostEntry(cfg, file)?.description
  }
  assert.equal(
    withDescription("Summary The parser trusts its input."),
    "The parser trusts its input.",
  )
  assert.equal(
    withDescription("Challenge Description Find the flag. Author: someone"),
    "Find the flag.",
  )
  assert.equal(withDescription("Summary"), undefined)
})

test("search tolerates typos in words but never in numbers such as CVE ids", () => {
  const text = "Unsafe deserialization CVE-2025-00004 octo-org/demo-framework"
  assert.equal(fuzzySearchScore("CVE-2025-00004", text), 0)
  assert.equal(fuzzySearchScore("CVE-2025-00001", text), Infinity)
  assert.equal(fuzzySearchScore("2024", text), Infinity)
  assert.notEqual(fuzzySearchScore("deserialisation", text), Infinity)
})

test("a research post carries weakness and remediation details", () => {
  const entry = buildPostEntry(
    cfg,
    research("Vulnerability Research/Auth/A.md", {
      cwe: ["cwe-287", 918, "nonsense"],
      affected: "< 17.5",
      fixed: 17.5,
      patch: "https://github.com/o/r/commit/0123456",
      advisory: "https://example.com/advisory",
    }),
  )
  assert.deepEqual(entry?.cwe, ["CWE-287", "CWE-918"])
  assert.equal(entry?.affected, "< 17.5")
  assert.equal(entry?.fixed, "17.5")
  assert.equal(entry?.patch, "https://github.com/o/r/commit/0123456")
  assert.equal(entry?.advisory, "https://example.com/advisory")
})

test("only http and https links are ever kept", () => {
  assert.equal(safeUrl("javascript:alert(1)"), undefined)
  assert.equal(safeUrl("data:text/html,x"), undefined)
  assert.equal(safeUrl("not a url"), undefined)
  assert.equal(safeUrl(undefined), undefined)
  assert.equal(safeUrl(" https://example.com/a "), "https://example.com/a")
  const entry = buildPostEntry(
    cfg,
    research("Vulnerability Research/Auth/B.md", { patch: "javascript:alert(1)" }),
  )
  assert.equal(entry?.patch, undefined)
})

test("weakness ids are normalised and CTF posts ignore research metadata", () => {
  assert.equal(normalizeCwe("287"), "CWE-287")
  assert.equal(normalizeCwe("CWE 79"), "CWE-79")
  assert.equal(normalizeCwe("abc"), undefined)
  const ctf = buildPostEntry(cfg, research("PicoCTF/Web/A.md", { cwe: "CWE-79", fixed: "1.0" }))
  assert.deepEqual(ctf?.cwe, [])
  assert.equal(ctf?.fixed, undefined)
})
