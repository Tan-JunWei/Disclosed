import { joinSegments, pathToRoot } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"
import style from "./styles/pagetitle.scss"

const PageTitle: QuartzComponent = ({ fileData, cfg, displayClass }: QuartzComponentProps) => {
  const title = cfg?.pageTitle ?? i18n(cfg.locale).propertyDefaults.title
  const baseDir = pathToRoot(fileData.slug!)
  return (
    <div class={classNames(displayClass, "page-title")}>
      <a href={baseDir}>
        <img
          class="site-logo"
          src={joinSegments(baseDir, "static/logo.svg")}
          width="36"
          height="36"
          alt=""
          aria-hidden="true"
        />
        <span>{title}</span>
      </a>
    </div>
  )
}

PageTitle.css = style

export default (() => PageTitle) satisfies QuartzComponentConstructor
