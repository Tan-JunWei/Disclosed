import test from "node:test"
import assert from "node:assert/strict"
import { GlobalConfiguration } from "../cfg"
import { QuartzPluginData } from "../plugins/vfile"
import { FilePath, FullSlug, slugifyFilePath } from "./path"
import { absoluteAssetUrl, absoluteUrl, basePath, siteUrl } from "./siteUrl"
import { documentTitle, lastModified, pageSeo, serializeJsonLd, truncate } from "./seo"
import { imageSize } from "./imageSize"
import { altFromFileName } from "../plugins/transformers/images"
import { generateSiteMap, listingSlugs } from "../plugins/emitters/contentIndex"

const cfg = {
  pageTitle: "Disclosed",
  baseUrl: "disclosed.nepz.dev",
  locale: "en-US",
  defaultDateType: "created",
} as GlobalConfiguration

function page(relativePath: string, frontmatter: Record<string, unknown> = {}): QuartzPluginData {
  const filePath = `content/${relativePath}` as FilePath
  return {
    slug: slugifyFilePath(relativePath as FilePath),
    filePath,
    relativePath: relativePath as FilePath,
    frontmatter: {
      title: relativePath.split("/").pop()!.replace(/\.md$/, ""),
      tags: [],
      ...frontmatter,
    },
    description: "An excerpt of the page.",
    dates: {
      created: new Date("2024-08-01T00:00:00Z"),
      modified: new Date("2024-09-01T00:00:00Z"),
      published: new Date(),
    },
  } as QuartzPluginData
}

test("site URLs work for a bare host, a host with a path and a full URL", () => {
  assert.equal(siteUrl("disclosed.nepz.dev").href, "https://disclosed.nepz.dev/")
  assert.equal(siteUrl("example.com/blog").href, "https://example.com/blog/")
  assert.equal(siteUrl("http://localhost:8080/").href, "http://localhost:8080/")
  assert.equal(basePath("disclosed.nepz.dev"), "/")
  assert.equal(basePath("example.com/blog/"), "/blog/")
})

test("absolute URLs match the paths the static host serves", () => {
  const base = "disclosed.nepz.dev"
  assert.equal(absoluteUrl(base, "index" as FullSlug), "https://disclosed.nepz.dev/")
  assert.equal(absoluteUrl(base), "https://disclosed.nepz.dev/")
  assert.equal(
    absoluteUrl(base, "PicoCTF/Cryptography/index" as FullSlug),
    "https://disclosed.nepz.dev/PicoCTF/Cryptography/",
  )
  assert.equal(
    absoluteUrl(base, "Challenge-Creation/CTF-Challenges-I've-Created" as FullSlug),
    "https://disclosed.nepz.dev/Challenge-Creation/CTF-Challenges-I've-Created",
  )
  assert.equal(absoluteUrl("example.com/blog", "a/b" as FullSlug), "https://example.com/blog/a/b")
  assert.equal(absoluteUrl(base, "a b?c" as FullSlug), "https://disclosed.nepz.dev/a%20b%3Fc")
  assert.equal(absoluteAssetUrl(base, "/sitemap.xml"), "https://disclosed.nepz.dev/sitemap.xml")
})

test("descriptions are cut at a word boundary", () => {
  assert.equal(truncate("short text"), "short text")
  const long = "word ".repeat(60)
  const cut = truncate(long, 40)
  assert.ok(cut.length <= 40, cut)
  assert.ok(cut.endsWith("word…"), cut)
})

test("titles name the platform and category of CTF posts, and the CVE of research posts", () => {
  const ctf = page("PicoCTF/Cryptography/13.md", { tags: ["Cryptography", "easy"] })
  assert.equal(pageSeo(cfg, ctf, [ctf]).title, "13 | picoCTF Cryptography Writeup | Disclosed")
  const research = page("Vulnerability Research/XSS/Stored XSS in Foo.md", {
    title: "Stored XSS in Foo",
    cve: "CVE-2026-12345",
  })
  assert.equal(
    pageSeo(cfg, research, [research]).title,
    "Stored XSS in Foo (CVE-2026-12345) | Disclosed",
  )
  const home = page("index.md", { title: "Disclosed" })
  assert.match(documentTitle(cfg, home, []), /^Disclosed \| /)
})

test("folder and tag pages get distinct, descriptive titles", () => {
  const posts = [
    page("PicoCTF/Cryptography/13.md", { tags: ["Cryptography", "easy"] }),
    page("Challenge Creation/Cryptography/A.md", { tags: ["Cryptography", "easy"] }),
  ]
  const folder = (slug: string, title: string) =>
    ({ slug: slug as FullSlug, frontmatter: { title, tags: [] } }) as QuartzPluginData
  const pico = pageSeo(cfg, folder("PicoCTF/Cryptography/index", "Cryptography"), posts)
  const own = pageSeo(cfg, folder("Challenge-Creation/Cryptography/index", "Cryptography"), posts)
  assert.equal(pico.title, "picoCTF Cryptography Writeups | Disclosed")
  assert.equal(own.title, "Original CTF Cryptography Challenges | Disclosed")
  assert.equal(pico.canonical, "https://disclosed.nepz.dev/PicoCTF/Cryptography/")
  const tag = pageSeo(cfg, folder("tags/easy", "easy"), posts)
  assert.match(tag.description, /^2 posts tagged easy/)
})

test("posts get TechArticle and BreadcrumbList structured data from real metadata", () => {
  const post = page("PicoCTF/Forensics/Some Challenge.md", {
    tags: ["Forensics", "medium", "pcap"],
  })
  const seo = pageSeo(cfg, post, [post])
  const graph = (seo.jsonLd as { "@graph": Record<string, unknown>[] })["@graph"]
  const article = graph.find((node) => node["@type"] === "TechArticle")!
  assert.equal(article.headline, "Some Challenge")
  assert.equal(article.datePublished, "2024-08-01T00:00:00.000Z")
  assert.equal(article.dateModified, "2024-09-01T00:00:00.000Z")
  assert.equal(article.url, "https://disclosed.nepz.dev/PicoCTF/Forensics/Some-Challenge")
  const crumbs = graph.find((node) => node["@type"] === "BreadcrumbList")!
  const items = crumbs.itemListElement as { item: string }[]
  assert.deepEqual(
    items.map((item) => item.item),
    [
      "https://disclosed.nepz.dev/",
      "https://disclosed.nepz.dev/PicoCTF/",
      "https://disclosed.nepz.dev/PicoCTF/Forensics/",
      "https://disclosed.nepz.dev/PicoCTF/Forensics/Some-Challenge",
    ],
  )
  assert.ok(!serializeJsonLd({ title: "</script><b>" }).includes("</script>"))
})

test("the 404 page is not indexed and has no canonical URL to a real page", () => {
  const notFound = { slug: "404" as FullSlug, frontmatter: { title: "Not Found", tags: [] } }
  const seo = pageSeo(cfg, notFound as QuartzPluginData, [])
  assert.equal(seo.kind, "notFound")
  assert.match(seo.robots, /noindex/)
})

test("last modified is never earlier than the published date", () => {
  const file = page("PicoCTF/Forensics/A.md")
  file.dates = {
    created: new Date("2025-01-02"),
    modified: new Date("2024-01-01"),
    published: new Date(),
  }
  assert.equal(lastModified(file)?.toISOString(), new Date("2025-01-02").toISOString())
})

test("the sitemap escapes URLs and lists folder and tag pages", () => {
  const files = [page("PicoCTF/Forensics/A.md", { tags: ["Forensics", "net/pcap"] })]
  const slugs = listingSlugs(files)
  for (const slug of [
    "PicoCTF/index",
    "PicoCTF/Forensics/index",
    "tags/index",
    "tags/net",
    "tags/net/pcap",
  ]) {
    assert.ok(slugs.includes(slug as FullSlug), slug)
  }
  // slugs never contain "&" today (Quartz writes "-and-"), but a "'" does occur and must stay valid XML
  const xml = generateSiteMap(cfg, [
    { slug: "a/It's-A&B" as FullSlug, lastmod: new Date("2024-08-01Z") },
  ])
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  assert.ok(xml.includes("<loc>https://disclosed.nepz.dev/a/It&apos;s-A&amp;B</loc>"), xml)
  assert.ok(xml.includes("<lastmod>2024-08-01T00:00:00.000Z</lastmod>"))
})

test("image sizes are read from file headers", () => {
  const png = Buffer.alloc(33)
  png.writeUInt32BE(0x89504e47, 0)
  png.write("IHDR", 12, "ascii")
  png.writeUInt32BE(640, 16)
  png.writeUInt32BE(480, 20)
  assert.deepEqual(imageSize(png), { width: 640, height: 480 })

  const gif = Buffer.alloc(24)
  gif.write("GIF89a", 0, "ascii")
  gif.writeUInt16LE(32, 6)
  gif.writeUInt16LE(16, 8)
  assert.deepEqual(imageSize(gif), { width: 32, height: 16 })

  // SOI, an APP0 segment, then SOF0 with height 300 and width 500
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01,
    0xf4, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ])
  assert.deepEqual(imageSize(jpeg), { width: 500, height: 300 })

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"></svg>')
  assert.deepEqual(imageSize(svg), { width: 24, height: 12 })
  assert.equal(imageSize(Buffer.from("not an image at all, just text")), undefined)
})

test("alt text falls back to a readable file name", () => {
  assert.equal(
    altFromFileName("../../Assets/Forensics/PicoCTF-file-types-2.png"),
    "PicoCTF file types 2",
  )
  assert.equal(altFromFileName("./Readme%20Stats.png?x=1"), "Readme Stats")
})
