import { FullSlug, SimpleSlug, simplifySlug } from "./path"

/**
 * The one place that turns `baseUrl` from quartz.config.ts into URLs. Pages link to each other with
 * relative URLs, so only metadata that must be absolute (canonical, Open Graph, structured data,
 * the sitemap, RSS and robots.txt) goes through `absoluteUrl`. `baseUrl` may be a bare host
 * ("example.com"), a host with a path ("example.com/blog") or a full URL.
 */
export function siteUrl(baseUrl: string | undefined): URL {
  const raw = (baseUrl ?? "").trim() || "localhost"
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  url.search = ""
  url.hash = ""
  if (!url.pathname.endsWith("/")) url.pathname += "/"
  return url
}

/** Root-relative path the site is served from, always with a trailing slash ("/" at a domain root). */
export function basePath(baseUrl: string | undefined): string {
  return siteUrl(baseUrl).pathname
}

/** The public URL of a page. Folder pages keep their trailing slash, as static hosts serve them. */
export function absoluteUrl(
  baseUrl: string | undefined,
  slug: FullSlug | SimpleSlug | "" = "",
): string {
  const simple = slug === "" ? "" : simplifySlug(slug as FullSlug).replace(/^\/+/, "")
  return siteUrl(baseUrl).href + encodePath(simple)
}

/** Absolute URL of a file in the build output, such as `static/og-image.png` or `sitemap.xml`. */
export function absoluteAssetUrl(baseUrl: string | undefined, file: string): string {
  return siteUrl(baseUrl).href + encodePath(file.replace(/^\/+/, ""))
}

// encodeURI leaves `'`, `(` and `)` alone, which is valid in a URL. Keep that so the canonical URL
// matches the href a browser shows, but escape anything that is not a path character.
function encodePath(path: string): string {
  return encodeURI(path).replace(/[?#]/g, encodeURIComponent)
}
