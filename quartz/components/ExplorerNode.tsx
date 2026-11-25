import { QuartzPluginData } from "../plugins/vfile"
import {
  joinSegments,
  resolveRelative,
  clone,
  simplifySlug,
  SimpleSlug,
  FilePath,
} from "../util/path"
import { ratingFromFrontmatter } from "../util/posts"

type OrderEntries = "sort" | "filter" | "map"

export interface Options {
  title?: string
  folderDefaultState: "collapsed" | "open"
  folderClickBehavior: "collapse" | "link"
  useSavedState: boolean
  sortFn: (a: FileNode, b: FileNode) => number
  filterFn: (node: FileNode) => boolean
  mapFn: (node: FileNode) => void
  order: OrderEntries[]
}

type DataWrapper = {
  file: QuartzPluginData
  path: string[]
}

export type FolderState = {
  path: string
  collapsed: boolean
}

function getPathSegment(fp: FilePath | undefined, idx: number): string | undefined {
  if (!fp) {
    return undefined
  }

  return fp.split("/").at(idx)
}

// Structure to add all files into a tree
export class FileNode {
  postCount = 0
  // a collection's landing page ("PicoCTF Writeups"), shown as "Overview" at the top of its folder
  overview = false
  children: Array<FileNode>
  name: string // this is the slug segment
  displayName: string
  file: QuartzPluginData | null
  depth: number

  constructor(slugSegment: string, displayName?: string, file?: QuartzPluginData, depth?: number) {
    this.children = []
    this.name = slugSegment
    this.displayName = displayName ?? file?.frontmatter?.title ?? slugSegment
    this.file = file ? clone(file) : null
    this.depth = depth ?? 0
  }

  private insert(fileData: DataWrapper) {
    if (fileData.path.length === 0) {
      return
    }

    const nextSegment = fileData.path[0]

    // base case, insert here
    if (fileData.path.length === 1) {
      if (nextSegment === "") {
        // index case (we are the root and we just found index.md), set our data appropriately
        const title = fileData.file.frontmatter?.title
        if (title && title !== "index") {
          this.displayName = title
        }
      } else {
        // direct child
        this.children.push(new FileNode(nextSegment, undefined, fileData.file, this.depth + 1))
      }

      return
    }

    // find the right child to insert into
    fileData.path = fileData.path.splice(1)
    const child = this.children.find((c) => c.name === nextSegment)
    if (child) {
      child.insert(fileData)
      return
    }

    const newChild = new FileNode(
      nextSegment,
      getPathSegment(fileData.file.relativePath, this.depth),
      undefined,
      this.depth + 1,
    )
    newChild.insert(fileData)
    this.children.push(newChild)
  }

  // Add new file to tree
  add(file: QuartzPluginData) {
    this.insert({ file: file, path: simplifySlug(file.slug!).split("/") })
  }

  /**
   * Filter FileNode tree. Behaves similar to `Array.prototype.filter()`, but modifies tree in place
   * @param filterFn function to filter tree with
   */
  filter(filterFn: (node: FileNode) => boolean) {
    this.children = this.children.filter(filterFn)
    this.children.forEach((child) => child.filter(filterFn))
  }

  /**
   * Filter FileNode tree. Behaves similar to `Array.prototype.map()`, but modifies tree in place
   * @param mapFn function to use for mapping over tree
   */
  map(mapFn: (node: FileNode) => void) {
    mapFn(this)
    this.children.forEach((child) => child.map(mapFn))
  }

  /**
   * Get folder representation with state of tree.
   * Intended to only be called on root node before changes to the tree are made
   * @param collapsed default state of folders (collapsed by default or not)
   * @returns array containing folder state for tree
   */
  getFolderPaths(collapsed: boolean): FolderState[] {
    const folderPaths: FolderState[] = []

    const traverse = (node: FileNode, currentPath: string) => {
      if (!node.file) {
        const folderPath = joinSegments(currentPath, node.name)
        if (folderPath !== "") {
          folderPaths.push({ path: folderPath, collapsed })
        }

        node.children.forEach((child) => traverse(child, folderPath))
      }
    }

    traverse(this, "")
    return folderPaths
  }

  // Sort order: folders first, then files. Sort folders and files alphabetically
  /**
   * Sorts tree according to sort/compare function
   * @param sortFn compare function used for `.sort()`, also used recursively for children
   */
  sort(sortFn: (a: FileNode, b: FileNode) => number) {
    this.children = this.children.sort(sortFn)
    this.children.forEach((e) => e.sort(sortFn))
  }
}

type ExplorerNodeProps = {
  node: FileNode
  opts: Options
  fileData: QuartzPluginData
  fullPath?: string
}

/**
 * Marks each collection's landing page as that folder's "Overview" and moves it to the top, instead
 * of leaving it as a stray item at the bottom that reads like another category.
 */
export function arrangeOverviews(root: FileNode, overviewSlugs: ReadonlySet<string>) {
  root.map((node) => {
    for (const child of node.children) {
      if (child.file?.slug && overviewSlugs.has(child.file.slug)) child.overview = true
    }
    // Array#sort is stable, so everything else keeps its existing order
    node.children.sort((a, b) => Number(b.overview) - Number(a.overview))
  })
}

export function ExplorerNode({ node, opts, fullPath, fileData }: ExplorerNodeProps) {
  // Get options
  const folderBehavior = opts.folderClickBehavior
  const isDefaultOpen = opts.folderDefaultState === "open"

  // Calculate current folderPath
  const folderPath = node.name !== "" ? joinSegments(fullPath ?? "", node.name) : ""
  const href = resolveRelative(fileData.slug!, folderPath as SimpleSlug) + "/"

  const current = simplifySlug(fileData.slug!)
  const active = current === folderPath || current === `${folderPath}/`
  const ancestor = current.startsWith(`${folderPath}/`)
  const open = node.depth === 0 || isDefaultOpen || ancestor || active

  if (node.file) {
    const isCurrent = simplifySlug(node.file.slug!) === current
    const rating = node.overview ? undefined : ratingFromFrontmatter(node.file.frontmatter)
    return (
      <li key={node.file.slug}>
        <a
          class={`explorer-file${isCurrent ? " active" : ""}${node.overview ? " explorer-overview" : ""}`}
          aria-current={isCurrent ? "page" : undefined}
          href={resolveRelative(fileData.slug!, node.file.slug!)}
          data-for={node.file.slug}
          title={node.overview ? node.displayName : undefined}
        >
          {node.overview && <OverviewIcon />}
          <span class="explorer-line" data-diff={rating?.hue ?? "none"} aria-hidden="true" />
          <span class="explorer-name">{node.overview ? "Overview" : node.displayName}</span>
          {node.overview && <span class="explorer-sr"> {node.displayName}</span>}
          {rating && <span class="explorer-sr">, {rating.level}</span>}
        </a>
      </li>
    )
  }

  const count = node.postCount > 0 && (
    <span class="folder-count" title={`${node.postCount} posts in this folder and its subfolders`}>
      {node.postCount}
      <span class="explorer-sr"> posts</span>
    </span>
  )
  const label = (
    <>
      <Chevron />
      <FolderIcon />
      <span class="folder-title">{node.displayName}</span>
    </>
  )

  return (
    <li>
      {node.name !== "" && (
        <div
          class={`folder-container${active ? " active" : ancestor ? " is-current-path" : ""}`}
          data-depth={node.depth}
          style={{ "--depth": node.depth - 1 }}
        >
          {folderBehavior === "collapse" ? (
            // the whole row is one control: chevron, icon, name and count toggle the folder together
            <button
              type="button"
              class="folder-button"
              aria-expanded={open}
              data-folderpath={folderPath}
            >
              {label}
              {count}
            </button>
          ) : (
            <>
              <button
                type="button"
                class="folder-toggle"
                aria-label={`Toggle ${node.displayName}`}
                aria-expanded={open}
              >
                <Chevron />
              </button>
              <div data-folderpath={folderPath}>
                <a
                  href={href}
                  aria-current={active ? "page" : undefined}
                  data-folder-open={open}
                  class="folder-link"
                >
                  <FolderIcon />
                  <span class="folder-title">{node.displayName}</span>
                </a>
              </div>
              {count}
            </>
          )}
        </div>
      )}
      <div class={`folder-outer ${open ? "open" : ""}`} inert={!open}>
        <ul class={`content${ancestor || active ? " on-path" : ""}`} data-folderul={folderPath}>
          {node.children.map((childNode, i) => (
            <ExplorerNode
              node={childNode}
              key={i}
              opts={opts}
              fullPath={folderPath}
              fileData={fileData}
            />
          ))}
        </ul>
      </div>
    </li>
  )
}

function Chevron() {
  return (
    <svg
      class="folder-chevron"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

function OverviewIcon() {
  return (
    <svg
      class="explorer-overview-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg
      class="tree-icon folder-symbol"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path
        class="folder-closed"
        d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
      />
      <path
        class="folder-open"
        d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
      />
    </svg>
  )
}
