import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import rehypeMathjax from "rehype-mathjax/svg"
import { QuartzTransformerPlugin } from "../types"
import { Root } from "hast"
import { visit, EXIT } from "unist-util-visit"

const KATEX_CSS = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css"
const KATEX_COPY = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/copy-tex.min.js"

/** Loaded only on pages that contain math (see `hasMath`), so other pages skip a render-blocking request. */
export const MATH_RESOURCES: ReadonlySet<string> = new Set([KATEX_CSS, KATEX_COPY])

function markMath() {
  return (tree: Root, file: { data: { hasMath?: boolean } }) => {
    visit(tree, "element", (node) => {
      const classes = node.properties?.className
      if (Array.isArray(classes) && (classes.includes("katex") || classes.includes("math"))) {
        file.data.hasMath = true
        return EXIT
      }
    })
  }
}

interface Options {
  renderEngine: "katex" | "mathjax"
  customMacros: MacroType
}

interface MacroType {
  [key: string]: string
}

export const Latex: QuartzTransformerPlugin<Partial<Options>> = (opts) => {
  const engine = opts?.renderEngine ?? "katex"
  const macros = opts?.customMacros ?? {}
  return {
    name: "Latex",
    markdownPlugins() {
      return [remarkMath]
    },
    htmlPlugins() {
      if (engine === "katex") {
        return [[rehypeKatex, { output: "html", macros }], markMath]
      } else {
        return [[rehypeMathjax, { macros }], markMath]
      }
    },
    externalResources() {
      if (engine === "katex") {
        return {
          css: [KATEX_CSS],
          js: [
            {
              // fix copy behaviour: https://github.com/KaTeX/KaTeX/blob/main/contrib/copy-tex/README.md
              src: KATEX_COPY,
              loadTime: "afterDOMReady",
              contentType: "external",
            },
          ],
        }
      } else {
        return {}
      }
    },
  }
}

declare module "vfile" {
  interface DataMap {
    hasMath: boolean
  }
}
