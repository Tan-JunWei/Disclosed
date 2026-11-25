import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [Component.PrevNextNav(), Component.BackToTop(), Component.DynamicDate()],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/Tan-JunWei/Disclosed",
      LinkedIn: "https://www.linkedin.com/in/jun-wei-tan",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ReadingProgress(),
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    // post metadata, shown only on posts
    Component.CaseHeader(),
    // banner and remediation facts for vulnerability research posts, nothing elsewhere
    Component.ResearchHeader(),
  ],
  left: [
    Component.ExplorerToggle(),
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({ components: [Component.Darkmode(), Component.Search()] }),
    Component.Explorer(),
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

// Keep the home page free of note metadata while preserving the compact site layout.
export const homePageLayout: PageLayout = {
  ...defaultContentPageLayout,
  beforeBody: [],
  right: [Component.Graph()],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle()],
  left: [
    Component.ExplorerToggle(),
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({ components: [Component.Darkmode(), Component.Search()] }),
    Component.Explorer(),
  ],
  right: [],
}
