import { Element, ElementContent, Root } from "hast"
import { visit } from "unist-util-visit"
import { hasLanguageLabel, languageDisplayName, languageIcon } from "../../util/codeLanguage"

const svg = (properties: Element["properties"], children: ElementContent[]): Element => ({
  type: "element",
  tagName: "svg",
  properties: {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    ariaHidden: "true",
    ...properties,
  },
  children,
})

const node = (
  tagName: string,
  properties: Element["properties"],
  children: ElementContent[],
): Element => ({
  type: "element",
  tagName,
  properties,
  children,
})

function icon(language: string): Element {
  const brand = languageIcon(language)
  if (brand) return svg({ fill: brand.fill }, [node("path", { d: brand.d }, [])])
  return svg(
    {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    [
      node("polyline", { points: "16 18 22 12 16 6" }, []),
      node("polyline", { points: "8 6 2 12 8 18" }, []),
    ],
  )
}

/**
 * Puts a header with the language's icon and name above each highlighted code block. It is part of
 * the HTML, so it costs no request, needs no script and does not shift the page as it loads.
 */
export function addLanguageHeaders() {
  return (tree: Root) => {
    visit(tree, "element", (figure) => {
      if (figure.tagName !== "figure") return
      const index = figure.children.findIndex(
        (child) => child.type === "element" && child.tagName === "pre",
      )
      if (index === -1) return
      const pre = figure.children[index] as Element
      const language = String(
        pre.properties?.["data-language"] ?? pre.properties?.dataLanguage ?? "",
      )
      if (!hasLanguageLabel(language)) return
      const previous = figure.children[index - 1]
      if (
        previous?.type === "element" &&
        previous.properties?.className?.toString().includes("code-language-header")
      )
        return

      figure.properties = {
        ...figure.properties,
        className: [...((figure.properties?.className as string[]) ?? []), "has-language-header"],
      }
      figure.children.splice(
        index,
        0,
        node("div", { className: ["code-language-header"] }, [
          node("span", { className: ["code-lang-icon-wrap"] }, [icon(language)]),
          node("span", { className: ["code-language-name"] }, [
            { type: "text", value: languageDisplayName(language) },
          ]),
        ]),
      )
    })
  }
}
