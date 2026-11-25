import { Element, Root } from "hast"
import { toString } from "hast-util-to-string"
import { visit } from "unist-util-visit"
import { classifyDiff } from "../../util/diff"

const DIFF_LANGUAGES = new Set(["diff", "patch"])

const isLine = (node: unknown): node is Element =>
  (node as Element)?.type === "element" &&
  ((node as Element).properties?.["data-line"] !== undefined ||
    (node as Element).properties?.dataLine !== undefined)

/**
 * Marks every line of a diff code block with `data-diff="add" | "del" | "hunk"`, so additions and
 * deletions can be coloured by default. It runs after the syntax highlighter, which has already
 * wrapped each line in its own element.
 */
export function markDiffLines() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "code") return
      const language = String(
        node.properties?.["data-language"] ?? node.properties?.dataLanguage ?? "",
      )
      if (!DIFF_LANGUAGES.has(language.toLowerCase())) return
      const lines = node.children.filter(isLine)
      const kinds = classifyDiff(lines.map((line) => toString(line)))
      lines.forEach((line, index) => {
        const kind = kinds[index]
        if (kind) line.properties = { ...line.properties, "data-diff": kind }
      })
    })
  }
}
