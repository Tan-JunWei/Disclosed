import { randomUUID } from "crypto"
import { JSX } from "preact/jsx-runtime"
import { FullSlug, joinSegments, pathToRoot } from "./path"

export type JSResource = {
  loadTime: "beforeDOMReady" | "afterDOMReady"
  moduleType?: "module"
  spaPreserve?: boolean
} & (
  | {
      src: string
      contentType: "external"
    }
  | {
      script: string
      contentType: "inline"
    }
)

export function JSResourceToScriptElement(resource: JSResource, preserve?: boolean): JSX.Element {
  const scriptType = resource.moduleType ?? "application/javascript"
  const spaPreserve = preserve ?? resource.spaPreserve
  if (resource.contentType === "external") {
    return (
      <script key={resource.src} src={resource.src} type={scriptType} spa-preserve={spaPreserve} />
    )
  } else {
    const content = resource.script
    return (
      <script
        key={randomUUID()}
        type={scriptType}
        spa-preserve={spaPreserve}
        dangerouslySetInnerHTML={{ __html: content }}
      ></script>
    )
  }
}

export interface StaticResources {
  css: string[]
  js: JSResource[]
}

/** A build id ("2026-11-14T10:00:00.000Z") as a short query value. */
export function assetVersion(buildId: string): string {
  return buildId.replace(/\D/g, "")
}

/** Modules built by the LazyModules emitter, which pages import only when they need them. */
export type LazyModule = "hero-scene" | "graph-view" | "search-engine"

/** The URL a page at `slug` imports a lazy module from, versioned so a new build is never stale. */
export function lazyModuleSrc(slug: FullSlug, buildId: string, module: LazyModule): string {
  return `${joinSegments(pathToRoot(slug), "static", `${module}.js`)}?v=${assetVersion(buildId)}`
}
