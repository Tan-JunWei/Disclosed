import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import explorerStyle from "./styles/explorer.scss"

// @ts-ignore
import script from "./scripts/explorer.inline"
import { arrangeOverviews, ExplorerNode, FileNode, Options } from "./ExplorerNode"
import { QuartzPluginData } from "../plugins/vfile"
import { classNames } from "../util/lang"
import { buildPostEntries } from "../util/posts"
import { SECTION_LANDINGS } from "../util/sections"
import { FullSlug, resolveRelative, simplifySlug } from "../util/path"
import { GlobalConfiguration } from "../cfg"
import { i18n } from "../i18n"

// Options interface defined in `ExplorerNode` to avoid circular dependency
const defaultOptions = {
  folderClickBehavior: "collapse",
  folderDefaultState: "collapsed",
  useSavedState: true,
  mapFn: (node) => {
    return node
  },
  sortFn: (a, b) => {
    // Sort order: folders first, then files. Sort folders and files alphabetically
    if ((!a.file && !b.file) || (a.file && b.file)) {
      // numeric: true: Whether numeric collation should be used, such that "1" < "2" < "10"
      // sensitivity: "base": Only strings that differ in base letters compare as unequal. Examples: a ≠ b, a = á, a = A
      return a.displayName.localeCompare(b.displayName, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    }

    if (a.file && !b.file) {
      return 1
    } else {
      return -1
    }
  },
  filterFn: (node) => node.name !== "tags",
  order: ["filter", "map", "sort"],
} satisfies Options

export default ((userOpts?: Partial<Options>) => {
  // Parse config
  const opts: Options = { ...defaultOptions, ...userOpts }

  // memoized
  let fileTree: FileNode
  let jsonTree: string
  let totalPosts = 0
  let lastBuildId: string = ""

  function constructFileTree(allFiles: QuartzPluginData[], cfg: GlobalConfiguration) {
    // Construct tree from allFiles
    fileTree = new FileNode("")
    allFiles.forEach((file) => fileTree.add(file))
    // "Explore posts" is the main discovery tool, so it is pinned above the tree instead of
    // sitting in it as if it were one more post
    fileTree.children = fileTree.children.filter((child) => child.file?.slug !== "Explore")

    // Execute all functions (sort, filter, map) that were provided (if none were provided, only default "sort" is applied)
    if (opts.order) {
      // Order is important, use loop with index instead of order.map()
      for (let i = 0; i < opts.order.length; i++) {
        const functionName = opts.order[i]
        if (functionName === "map") {
          fileTree.map(opts.mapFn)
        } else if (functionName === "sort") {
          fileTree.sort(opts.sortFn)
        } else if (functionName === "filter") {
          fileTree.filter(opts.filterFn)
        }
      }
    }

    arrangeOverviews(fileTree, new Set<string>(SECTION_LANDINGS))

    const postEntries = buildPostEntries(cfg, allFiles)
    totalPosts = postEntries.length
    const postSlugs = new Set(postEntries.map((entry) => entry.slug))
    function count(node: FileNode): number {
      node.postCount =
        (node.file?.slug && postSlugs.has(node.file.slug) ? 1 : 0) +
        node.children.reduce((sum, child) => sum + count(child), 0)
      return node.postCount
    }
    count(fileTree)

    // Get all folders of tree. Initialize with collapsed state
    // Stringify to pass json tree as data attribute ([data-tree])
    const folders = fileTree.getFolderPaths(opts.folderDefaultState === "collapsed")
    jsonTree = JSON.stringify(folders)
  }

  const Explorer: QuartzComponent = ({
    ctx,
    cfg,
    allFiles,
    displayClass,
    fileData,
  }: QuartzComponentProps) => {
    if (ctx.buildId !== lastBuildId) {
      lastBuildId = ctx.buildId
      constructFileTree(allFiles, cfg)
    }

    const onExplore = simplifySlug(fileData.slug!) === "Explore"
    return (
      <nav aria-label="Posts" class={classNames(displayClass, "explorer")}>
        <button type="button" id="explorer-close" aria-label="Close file explorer">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <button
          type="button"
          id="explorer"
          data-behavior={opts.folderClickBehavior}
          data-collapsed={opts.folderDefaultState}
          data-savestate={opts.useSavedState}
          data-tree={jsonTree}
          aria-controls="explorer-content"
          aria-expanded="true"
        >
          <span class="explorer-title">
            {opts.title ?? i18n(cfg.locale).components.explorer.title}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="5 8 14 8"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="fold"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div id="explorer-content">
          <div class="explorer-body">
            <a
              class={`explorer-pin${onExplore ? " active" : ""}`}
              href={resolveRelative(fileData.slug!, "Explore" as FullSlug)}
              aria-current={onExplore ? "page" : undefined}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
              </svg>
              <span class="explorer-name">Explore posts</span>
              <span class="folder-count">
                {totalPosts}
                <span class="explorer-sr"> posts</span>
              </span>
            </a>
            <ul class="overflow" id="explorer-ul">
              <ExplorerNode node={fileTree} opts={opts} fileData={fileData} />
            </ul>
          </div>
        </div>
      </nav>
    )
  }

  Explorer.css = explorerStyle
  Explorer.afterDOMLoaded = script
  return Explorer
}) satisfies QuartzComponentConstructor
