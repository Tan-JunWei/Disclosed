import { Root as HTMLRoot, Element, Parent } from "hast"
import { toString } from "hast-util-to-string"
import { QuartzTransformerPlugin } from "../types"
import { escapeHTML } from "../../util/escape"

export interface Options {
  descriptionLength: number
  replaceExternalLinks: boolean
}

const defaultOptions: Options = {
  descriptionLength: 150,
  replaceExternalLinks: true,
}

const urlRegex = new RegExp(
  /(https?:\/\/)?(?<domain>([\da-z\.-]+)\.([a-z\.]{2,6})(:\d+)?)(?<path>[\/\w\.-]*)(\?[\/\w\.=&;-]*)?/,
  "g",
)

// Headings, callout titles and code read as noise at the start of a search result snippet
const SKIPPED_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "pre", "svg", "script", "style"])
const BLOCK_TAGS = new Set([
  "p",
  "li",
  "div",
  "blockquote",
  "td",
  "th",
  "tr",
  "figure",
  "br",
  "dt",
  "dd",
])
const SKIPPED_CLASSES = ["callout-title", "katex-mathml", "code-language-header"]

function isSkipped(node: Element): boolean {
  if (SKIPPED_TAGS.has(node.tagName)) return true
  const classes = node.properties?.className
  return Array.isArray(classes) && classes.some((c) => SKIPPED_CLASSES.includes(String(c)))
}

/** The page's prose, in order, leaving out the parts listed above. */
function proseText(node: HTMLRoot | Parent): string {
  const parts: string[] = []
  for (const child of node.children) {
    if (child.type === "text") parts.push(child.value)
    else if (child.type === "element" && !isSkipped(child)) {
      const gap = BLOCK_TAGS.has(child.tagName) ? " " : ""
      parts.push(gap, proseText(child), gap)
    }
  }
  return parts.join("")
}

export const Description: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "Description",
    htmlPlugins() {
      return [
        () => {
          return async (tree: HTMLRoot, file) => {
            let frontMatterDescription = file.data.frontmatter?.description
            let text = escapeHTML(toString(tree))
            let prose = escapeHTML(proseText(tree))

            if (opts.replaceExternalLinks) {
              frontMatterDescription = frontMatterDescription?.replace(
                urlRegex,
                "$<domain>" + "$<path>",
              )
              text = text.replace(urlRegex, "$<domain>" + "$<path>")
              prose = prose.replace(urlRegex, "$<domain>" + "$<path>")
            }

            prose = prose.replace(/\s+/g, " ").trim()
            const desc = frontMatterDescription ?? (prose ? prose : text)
            const sentences = desc.replace(/\s+/g, " ").trim().split(/\.\s/)
            const finalDesc: string[] = []
            const len = opts.descriptionLength
            let sentenceIdx = 0
            let currentDescriptionLength = 0

            if (sentences[0] !== undefined && sentences[0].length >= len) {
              const firstSentence = sentences[0].split(" ")
              while (currentDescriptionLength < len) {
                const sentence = firstSentence[sentenceIdx]
                if (!sentence) break
                finalDesc.push(sentence)
                currentDescriptionLength += sentence.length
                sentenceIdx++
              }
              finalDesc.push("...")
            } else {
              while (currentDescriptionLength < len) {
                const sentence = sentences[sentenceIdx]
                if (!sentence) break
                const currentSentence = sentence.endsWith(".") ? sentence : sentence + "."
                finalDesc.push(currentSentence)
                currentDescriptionLength += currentSentence.length
                sentenceIdx++
              }
            }

            file.data.description = finalDesc.join(" ")
            file.data.text = text
          }
        },
      ]
    },
  }
}

declare module "vfile" {
  interface DataMap {
    description: string
    text: string
  }
}
