import { FilePath, FullSlug } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import { write } from "./helpers"
import DepGraph from "../../depgraph"
import { absoluteAssetUrl } from "../../util/siteUrl"

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

interface HostingOptions {
  /** Old path prefixes (e.g. a GitHub Pages project path) that should redirect to the same page here. */
  legacyPaths: string[]
  /** Additional path redirects in the host's _redirects format. */
  redirects: string[]
  /** Hostname patterns in `_headers` syntax whose copies of the site must not be indexed. */
  noindexHosts: string[]
}

const defaultOptions: HostingOptions = {
  legacyPaths: [],
  redirects: [],
  noindexHosts: [],
}

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
// Screenshots rarely change. Caching them for a day avoids a revalidation request for every image.
const IMAGES = "public, max-age=86400, stale-while-revalidate=604800"
// Baseline hardening for every response. There is no script-src policy: Quartz relies on inline
// scripts, and a static site with no forms or logins gains little from one.
const SECURITY = [
  "X-Content-Type-Options: nosniff",
  "Referrer-Policy: strict-origin-when-cross-origin",
  "X-Frame-Options: SAMEORIGIN",
  "Content-Security-Policy: frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
]

/**
 * `_headers` and `_redirects` in the format read by Cloudflare Pages (and Netlify). Other static
 * hosts ignore them, and nothing in the site depends on them to work.
 */
export const HostingRules: QuartzEmitterPlugin<Partial<HostingOptions>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "HostingRules",
    getQuartzComponents: () => [],
    async getDependencyGraph() {
      return new DepGraph<FilePath>()
    },
    async emit(ctx) {
      const rule = (path: string, ...headers: string[]) =>
        [path, ...headers.map((header) => `  ${header}`)].join("\n")
      const headers = [
        ...opts.noindexHosts.map((host) => rule(`https://${host}/*`, "X-Robots-Tag: noindex")),
        rule("/*", ...SECURITY),
        ...VERSIONED.map((path) => rule(path, `Cache-Control: ${IMMUTABLE}`)),
        // font file names carry the font's version, so a changed font is a new URL
        rule("/static/fonts/*", `Cache-Control: ${IMMUTABLE}`),
        rule("/Assets/*", `Cache-Control: ${IMAGES}`),
      ]

      // The blog already has a /CTF-Writeups landing page. Redirect only the old nested URLs.
      const legacyRedirects = opts.legacyPaths.map((legacy) => {
        const prefix = "/" + legacy.replace(/^\/+|\/+$/g, "")
        return `${prefix}/* /:splat 301`
      })
      const redirects = [...opts.redirects, ...legacyRedirects]

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
