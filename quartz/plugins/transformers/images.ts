import fs from "fs"
import path from "path"
import { Root } from "hast"
import { visit } from "unist-util-visit"
import { QuartzTransformerPlugin } from "../types"
import { FilePath, slugifyFilePath } from "../../util/path"
import { imageSize } from "../../util/imageSize"

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i
const filesByDirectory = new Map<string, Map<string, string>>()

/** Every image under the content folder, keyed by the slug pages link it with. */
function imageFiles(directory: string): Map<string, string> {
  let files = filesByDirectory.get(directory)
  if (files) return files
  files = new Map()
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (IMAGE_EXT.test(entry.name)) {
        const relative = path.relative(directory, full).split(path.sep).join("/")
        files.set(slugifyFilePath(relative as FilePath), full)
      }
    }
  }
  walk(directory)
  filesByDirectory.set(directory, files)
  return files
}

/** "PicoCTF-file-types-2.png" -> "PicoCTF file types 2" */
export function altFromFileName(src: string): string {
  const name = decodeURIComponent(src.split(/[?#]/)[0].split("/").pop() ?? "")
  return name.replace(IMAGE_EXT, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Gives content images their real width and height so the browser reserves space before they load
 * (no layout shift), decodes them off the main thread, lazy-loads all but the first, and falls back
 * to the file name for alt text when the author did not write any. Image files are only read.
 */
export const ImageAttributes: QuartzTransformerPlugin = () => ({
  name: "ImageAttributes",
  htmlPlugins(ctx) {
    return [
      () => (tree: Root, file) => {
        const files = imageFiles(ctx.argv.directory)
        const slug = file.data.slug ?? ""
        let seen = 0
        visit(tree, "element", (node) => {
          if (node.tagName !== "img") return
          const props = node.properties ?? (node.properties = {})
          const src = String(props.src ?? "")
          props.decoding = "async"
          if (seen++ > 0) props.loading = "lazy"
          else delete props.loading
          if (!props.alt && src) props.alt = altFromFileName(src)
          if (!src || /^[a-z]+:/i.test(src)) return

          const target = decodeURIComponent(new URL(src, `https://site/${slug}`).pathname).slice(1)
          const source = files.get(target)
          if (!source) return
          let size
          try {
            size = imageSize(fs.readFileSync(source))
          } catch {
            return
          }
          if (!size) return
          const width = Number(props.width)
          const height = Number(props.height)
          if (width > 0 && !(height > 0)) {
            props.height = Math.round((width * size.height) / size.width)
          } else if (!(width > 0)) {
            props.width = size.width
            props.height = size.height
          }
        })
      },
    ]
  },
})
