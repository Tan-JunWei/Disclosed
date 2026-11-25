import { FullSlug, joinSegments, pathToRoot } from "../util/path"
import { JSResourceToScriptElement } from "../util/resources"
import { googleFontHref } from "../util/theme"
import { PRELOADED_FONTS } from "../util/fonts"
import { pageSeo, serializeJsonLd } from "../util/seo"
import { absoluteAssetUrl, basePath } from "../util/siteUrl"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

export default (() => {
  const Head: QuartzComponent = ({
    cfg,
    fileData,
    allFiles,
    externalResources,
  }: QuartzComponentProps) => {
    const seo = pageSeo(cfg, fileData, allFiles)
    const { css, js } = externalResources

    const root = basePath(cfg.baseUrl)
    const baseDir = fileData.slug === "404" ? (root as FullSlug) : pathToRoot(fileData.slug!)
    const iconPath = `${joinSegments(baseDir, "static/logo.svg")}?v=2`
    const isArticle = seo.kind === "post"

    return (
      <head>
        <title>{seo.title}</title>
        <meta charSet="utf-8" />
        {/* the 404 page is served at any depth, so its relative links (sidebar, logo) resolve from the site root */}
        {fileData.slug === "404" && <base href={root} />}
        {cfg.theme.cdnCaching && cfg.theme.fontOrigin === "googleFonts" && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={googleFontHref(cfg.theme)} />
          </>
        )}
        {cfg.theme.fontOrigin === "local" &&
          PRELOADED_FONTS.map((font) => (
            <link
              rel="preload"
              href={joinSegments(baseDir, font)}
              as="font"
              type="font/woff2"
              crossOrigin="anonymous"
            />
          ))}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={seo.description} />
        <meta name="robots" content={seo.robots} />
        {seo.kind !== "notFound" && <link rel="canonical" href={seo.canonical} />}
        <link
          rel="alternate"
          type="application/rss+xml"
          title={cfg.pageTitle}
          href={absoluteAssetUrl(cfg.baseUrl, "index.xml")}
        />

        <meta property="og:site_name" content={cfg.pageTitle} />
        <meta property="og:locale" content={cfg.locale.replace("-", "_")} />
        <meta property="og:type" content={isArticle ? "article" : "website"} />
        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
        {seo.kind !== "notFound" && <meta property="og:url" content={seo.canonical} />}
        <meta property="og:image" content={seo.image.url} />
        <meta property="og:image:width" content={String(seo.image.width)} />
        <meta property="og:image:height" content={String(seo.image.height)} />
        <meta property="og:image:alt" content={seo.image.alt} />
        {isArticle && seo.published && (
          <meta property="article:published_time" content={seo.published.toISOString()} />
        )}
        {isArticle && seo.modified && (
          <meta property="article:modified_time" content={seo.modified.toISOString()} />
        )}
        {isArticle && seo.section && <meta property="article:section" content={seo.section} />}
        {isArticle && seo.tags.map((tag) => <meta property="article:tag" content={tag} />)}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.title} />
        <meta name="twitter:description" content={seo.description} />
        <meta name="twitter:image" content={seo.image.url} />
        <meta name="twitter:image:alt" content={seo.image.alt} />

        <link rel="icon" type="image/svg+xml" sizes="any" href={iconPath} />
        <meta name="generator" content="Quartz" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(seo.jsonLd) }}
        />
        {css.map((href) => (
          <link key={href} href={href} rel="stylesheet" type="text/css" spa-preserve />
        ))}
        {js
          .filter((resource) => resource.loadTime === "beforeDOMReady")
          .map((res) => JSResourceToScriptElement(res, true))}
      </head>
    )
  }

  return Head
}) satisfies QuartzComponentConstructor
