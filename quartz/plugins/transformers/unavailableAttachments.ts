import { Element, ElementContent, Root } from "hast"
import { visit } from "unist-util-visit"
import { QuartzTransformerPlugin } from "../types"
import { unpublishableAttachments } from "../../util/attachments"

const MEDIA = new Set(["img", "audio", "video", "iframe", "embed", "object"])
export const UNAVAILABLE_NOTE = "Not available for download"

/** The output path a relative link on `pageSlug` points to, or undefined for external links. */
export function linkedOutputPath(pageSlug: string, href: string): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#")) return
  try {
    const url = new URL(href, `https://site.invalid/${pageSlug}`)
    return decodeURIComponent(url.pathname).replace(/^\/+/, "")
  } catch {
    return
  }
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path
}

function indicator(label: ElementContent[]): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["attachment-unavailable"], title: UNAVAILABLE_NOTE },
    children: [
      {
        type: "element",
        tagName: "svg",
        properties: {
          xmlns: "http://www.w3.org/2000/svg",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          ariaHidden: "true",
        },
        children: [
          {
            type: "element",
            tagName: "rect",
            properties: { x: "4", y: "11", width: "16", height: "10", rx: "2" },
            children: [],
          },
          {
            type: "element",
            tagName: "path",
            properties: { d: "M8 11V7a4 4 0 0 1 8 0v4" },
            children: [],
          },
        ],
      },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["attachment-name"] },
        children: label,
      },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["attachment-note"] },
        children: [{ type: "text", value: UNAVAILABLE_NOTE }],
      },
    ],
  }
}

/**
 * Attachments that cannot be published (see util/attachments.ts) are left out of the site. Links to
 * them become a label saying the file is not available, and embeds of them are replaced by the same
 * label, so readers never follow a link to a missing file.
 */
export const UnavailableAttachments: QuartzTransformerPlugin = () => ({
  name: "UnavailableAttachments",
  htmlPlugins(ctx) {
    return [
      () => async (tree: Root, file) => {
        const unavailable = await unpublishableAttachments(
          ctx.buildId,
          ctx.argv.directory,
          ctx.cfg.configuration.ignorePatterns,
        )
        if (unavailable.size === 0) return
        const slug = String(file.data.slug ?? "")
        const target = (value: unknown) => {
          if (typeof value !== "string") return
          const output = linkedOutputPath(slug, value)
          return output && unavailable.has(output) ? output : undefined
        }

        visit(tree, "element", (node, index, parent) => {
          if (!parent || index === undefined) return
          if (node.tagName === "a") {
            if (!target(node.properties?.href)) return
            parent.children[index] = indicator(node.children)
            return
          }
          if (!MEDIA.has(node.tagName)) return
          const sources = [
            node.properties?.src,
            node.properties?.data,
            ...node.children.flatMap((child) =>
              child.type === "element" && child.tagName === "source" ? [child.properties?.src] : [],
            ),
          ]
          const missing = sources.map(target).find(Boolean)
          if (!missing) return
          parent.children[index] = indicator([{ type: "text", value: fileName(missing) }])
        })
      },
    ]
  },
})
