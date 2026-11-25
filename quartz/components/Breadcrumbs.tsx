import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import breadcrumbsStyle from "./styles/breadcrumbs.scss"
import { FullSlug, SimpleSlug, joinSegments, resolveRelative } from "../util/path"
import { QuartzPluginData } from "../plugins/vfile"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"

type CrumbData = {
  displayName: string
  path: string
}

interface BreadcrumbOptions {
  /**
   * Name of first crumb
   */
  rootName: string
  /**
   * Whether to look up frontmatter title for folders (could cause performance problems with big vaults)
   */
  resolveFrontmatterTitle: boolean
  /**
   * Whether to display breadcrumbs on root `index.md`
   */
  hideOnRoot: boolean
  /**
   * Whether to display the current page in the breadcrumbs.
   */
  showCurrentPage: boolean
}

const defaultOptions: BreadcrumbOptions = {
  rootName: "Home",
  resolveFrontmatterTitle: true,
  hideOnRoot: true,
  showCurrentPage: true,
}

// the chevrons share one gradient, defined once per trail so ids stay unique on the page
const chevronGradientId = "breadcrumb-chevron-gradient"

const chevronDefs = (
  <svg class="breadcrumb-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={chevronGradientId} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" class="breadcrumb-stop-start" />
        <stop offset="100%" class="breadcrumb-stop-end" />
      </linearGradient>
    </defs>
  </svg>
)

// a solid chevron trailed by a faint echo, which gives the separator a sense of forward motion
const spacerIcon = (
  <svg
    viewBox="0 0 28 24"
    width="21"
    height="18"
    fill="none"
    stroke-width="3.25"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path class="breadcrumb-sep-echo" d="m5 5.5 6.5 6.5L5 18.5" stroke="currentColor" />
    <path d="m13.5 5.5 6.5 6.5-6.5 6.5" stroke={`url(#${chevronGradientId})`} />
  </svg>
)

function formatCrumb(displayName: string, baseSlug: FullSlug, currentSlug: SimpleSlug): CrumbData {
  return {
    displayName: displayName.replaceAll("-", " "),
    path: resolveRelative(baseSlug, currentSlug),
  }
}

export default ((opts?: Partial<BreadcrumbOptions>) => {
  // Merge options with defaults
  const options: BreadcrumbOptions = { ...defaultOptions, ...opts }

  // computed index of folder name to its associated file data
  let folderIndex: Map<string, QuartzPluginData> | undefined

  const Breadcrumbs: QuartzComponent = ({
    fileData,
    allFiles,
    displayClass,
    cfg,
  }: QuartzComponentProps) => {
    // Hide crumbs on root if enabled
    if (options.hideOnRoot && fileData.slug === "index") {
      return <></>
    }

    // Format entry for root element
    const firstEntry = formatCrumb(options.rootName, fileData.slug!, "/" as SimpleSlug)
    const crumbs: CrumbData[] = [firstEntry]

    if (!folderIndex && options.resolveFrontmatterTitle) {
      folderIndex = new Map()
      // construct the index for the first time
      for (const file of allFiles) {
        const folderParts = file.slug?.split("/")
        if (folderParts?.at(-1) === "index") {
          folderIndex.set(folderParts.slice(0, -1).join("/"), file)
        }
      }
    }

    // Split slug into hierarchy/parts
    const slugParts = fileData.slug?.split("/")
    if (slugParts) {
      // is tag breadcrumb?
      const isTagPath = slugParts[0] === "tags"

      // full path until current part
      let currentPath = ""

      for (let i = 0; i < slugParts.length - 1; i++) {
        let curPathSegment = slugParts[i]

        // Try to resolve frontmatter folder title
        const currentFile = folderIndex?.get(slugParts.slice(0, i + 1).join("/"))
        if (currentFile) {
          const title = currentFile.frontmatter!.title
          if (title !== "index") {
            curPathSegment = title
          }
        }

        // the tags folder has no note of its own, so its crumb uses the tag index's title
        if (isTagPath && i === 0) {
          curPathSegment = i18n(cfg.locale).pages.tagContent.tagIndex
        }

        // Add current slug to full path
        currentPath = joinSegments(currentPath, slugParts[i])
        const includeTrailingSlash = !isTagPath || i < 1

        // Format and add current crumb
        const crumb = formatCrumb(
          curPathSegment,
          fileData.slug!,
          (currentPath + (includeTrailingSlash ? "/" : "")) as SimpleSlug,
        )
        crumbs.push(crumb)
      }

      // Add current file to crumb (can directly use frontmatter title)
      if (options.showCurrentPage && slugParts.at(-1) !== "index") {
        crumbs.push({
          displayName: fileData.frontmatter!.title,
          path: "",
        })
      }
    }

    const last = crumbs.length - 1
    // on a folder's index page the last folder crumb is the page itself
    const lastIsSelf = crumbs[last].path === "" || (last > 0 && fileData.slug!.endsWith("/index"))
    return (
      <nav class={classNames(displayClass, "breadcrumb-container")} aria-label="breadcrumbs">
        {chevronDefs}
        {crumbs.map((crumb, index) => (
          <div class="breadcrumb-element">
            {index === last && lastIsSelf ? (
              <span class="breadcrumb-current" aria-current="page">
                {crumb.displayName}
              </span>
            ) : (
              <a href={crumb.path}>{crumb.displayName}</a>
            )}
            {index !== last && (
              <p class="breadcrumb-sep" aria-hidden="true">
                {spacerIcon}
              </p>
            )}
          </div>
        ))}
      </nav>
    )
  }
  Breadcrumbs.css = breadcrumbsStyle

  return Breadcrumbs
}) satisfies QuartzComponentConstructor
