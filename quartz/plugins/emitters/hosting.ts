import { FilePath, FullSlug } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import { write } from "./helpers"
import DepGraph from "../../depgraph"
import { absoluteAssetUrl, siteUrl } from "../../util/siteUrl"

export const RobotsTxt: QuartzEmitterPlugin = () => ({
  name: "RobotsTxt",
  getQuartzComponents: () => [],
  async getDependencyGraph() {
    return new DepGraph<FilePath>()
  },
  async emit(ctx) {
    const sitemap = absoluteAssetUrl(ctx.cfg.configuration.baseUrl, "sitemap.xml")
    const content = `User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`
    return [await write({ ctx, slug: "robots" as FullSlug, ext: ".txt", content })]
  },
})

// Requested with a `?v=<build id>` query (see pageResources), so a new build always gets new URLs.
const VERSIONED = [
  "/index.css",
  "/prescript.js",
  "/postscript.js",
  "/static/hero-scene.js",
  "/static/graph-view.js",
  "/static/search-engine.js",
]
const IMMUTABLE = "public, max-age=31536000, immutable"
const IMAGES = "public, max-age=86400, stale-while-revalidate=604800"
const SECURITY = [
  "X-Content-Type-Options: nosniff",
  "Referrer-Policy: strict-origin-when-cross-origin",
  "X-Frame-Options: SAMEORIGIN",
  "Content-Security-Policy: frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
]

export const HostingRules: QuartzEmitterPlugin<{ redirects?: string[] }> = ({
  redirects = [],
} = {}) => {
  return {
    name: "HostingRules",
    getQuartzComponents: () => [],
    async getDependencyGraph() {
      return new DepGraph<FilePath>()
    },
    async emit(ctx) {
      const rule = (path: string, ...headers: string[]) =>
        [path, ...headers.map((header) => `  ${header}`)].join("\n")
      const baseUrl = ctx.cfg.configuration.baseUrl
      const headers = [
        rule("/*", ...SECURITY, ...(baseUrl ? ["X-Robots-Tag: noindex"] : [])),
        ...VERSIONED.map((path) => rule(path, `Cache-Control: ${IMMUTABLE}`)),
        rule("/static/fonts/*", `Cache-Control: ${IMMUTABLE}`),
        rule("/Assets/*", `Cache-Control: ${IMAGES}`),
      ]
      if (baseUrl) headers.push(rule(`https://${siteUrl(baseUrl).hostname}/*`, "! X-Robots-Tag"))

      const emitted = [
        await write({
          ctx,
          slug: "_headers" as FullSlug,
          ext: "",
          content: headers.join("\n\n") + "\n",
        }),
      ]
      if (redirects.length) {
        emitted.push(
          await write({
            ctx,
            slug: "_redirects" as FullSlug,
            ext: "",
            content: redirects.join("\n") + "\n",
          }),
        )
      }
      return emitted
    },
  }
}
