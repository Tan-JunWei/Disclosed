import { build } from "esbuild"
import { QuartzEmitterPlugin } from "../types"
import { FullSlug, QUARTZ, joinSegments } from "../../util/path"
import type { LazyModule } from "../../util/resources"
import { write } from "./helpers"

const SCRIPTS = joinSegments(QUARTZ, "components/scripts")

/**
 * Heavy scripts that only some pages use, built as separate ES modules under `static/` so they stay
 * out of the shared postscript every page downloads. A page imports one on demand from the URL that
 * `lazyModuleSrc` gives it.
 */
const MODULES: Record<LazyModule, string> = {
  // Three.js scene for the home page hero
  "hero-scene": joinSegments(SCRIPTS, "hero/scene.ts"),
  // d3 force graph, fetched when a graph scrolls into view or the global graph opens
  "graph-view": joinSegments(SCRIPTS, "graph/view.ts"),
  // FlexSearch index, fetched with the content index the first time someone searches
  "search-engine": joinSegments(SCRIPTS, "search/engine.ts"),
}

// A worker the hero scene starts by URL, so it is built alongside it.
const WORKERS = {
  "hero-correspondence": joinSegments(SCRIPTS, "hero/correspondence.worker.ts"),
}

export const LazyModules: QuartzEmitterPlugin = () => ({
  name: "LazyModules",
  getQuartzComponents: () => [],
  async emit(ctx, content) {
    const hasHome = content.some(([, file]) => file.data.slug === "index")
    const entryPoints: Record<string, string> = {
      "graph-view": MODULES["graph-view"],
      "search-engine": MODULES["search-engine"],
    }
    if (hasHome) Object.assign(entryPoints, { "hero-scene": MODULES["hero-scene"] }, WORKERS)

    const result = await build({
      entryPoints,
      outdir: "lazy-modules",
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      minify: true,
      write: false,
      legalComments: "none",
    })
    return Promise.all(
      result.outputFiles.map((file) =>
        write({
          ctx,
          slug: joinSegments(
            "static",
            file.path.split("/").pop()!.replace(/\.js$/, ""),
          ) as FullSlug,
          ext: ".js",
          content: file.text,
        }),
      ),
    )
  },
})
