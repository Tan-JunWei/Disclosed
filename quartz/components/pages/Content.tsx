import { htmlToJsx } from "../../util/jsx"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import Home from "./Home"
import PostExplorer from "./PostExplorer"
import CtfHub from "./CtfHub"
import { SECTIONS } from "../../util/sections"
import { wrapScript } from "../../util/lang"

const HomeComponent = Home()
const ExploreComponent = PostExplorer()
const CtfHubComponent = CtfHub()

const overrides: Record<string, QuartzComponent> = {
  index: HomeComponent,
  Explore: ExploreComponent,
  "CTF-Writeups": CtfHubComponent,
  ...Object.fromEntries(
    SECTIONS.map((section) => [section.landing, PostExplorer({ lockedSection: section.folder })]),
  ),
}

const Content: QuartzComponent = (props: QuartzComponentProps) => {
  const { fileData, tree } = props
  const Override = fileData.slug ? overrides[fileData.slug] : undefined
  if (Override) {
    return <Override {...props} />
  }

  const content = htmlToJsx(fileData.filePath!, tree)
  const classes: string[] = fileData.frontmatter?.cssclasses ?? []
  const classString = ["popover-hint", ...classes].join(" ")
  return <article class={classString}>{content}</article>
}

Content.css = [HomeComponent.css, ExploreComponent.css].filter(Boolean).join("\n")
Content.afterDOMLoaded = [HomeComponent.afterDOMLoaded, ExploreComponent.afterDOMLoaded]
  .map(wrapScript)
  .join("\n")

export default (() => Content) satisfies QuartzComponentConstructor
