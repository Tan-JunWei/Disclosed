import { joinSegments, pathToRoot } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { assetVersion } from "../util/resources"
import style from "./styles/pagetitle.scss"

const PageTitle: QuartzComponent = ({ fileData, cfg, ctx, displayClass }: QuartzComponentProps) => {
  const baseDir = pathToRoot(fileData.slug!)
  const logo = `${joinSegments(baseDir, "static/logo.svg")}?v=${assetVersion(ctx.buildId)}`
  return (
    <div class={classNames(displayClass, "page-title")}>
      <a href={`${baseDir}/`} aria-label={`${cfg.pageTitle} home`}>
        <img class="site-logo" src={logo} width="325" height="64" alt={cfg.pageTitle} />
      </a>
    </div>
  )
}

PageTitle.css = style

export default (() => PageTitle) satisfies QuartzComponentConstructor
