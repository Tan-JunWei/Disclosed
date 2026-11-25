import { QuartzEmitterPlugin } from "../types"
import { QuartzComponentProps } from "../../components/types"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { FullPageLayout } from "../../cfg"
import { FilePath, FullSlug } from "../../util/path"
import { sharedPageComponents, defaultContentPageLayout } from "../../../quartz.layout"
import { NotFound } from "../../components"
import { defaultProcessedContent } from "../vfile"
import { write } from "./helpers"
import { i18n } from "../../i18n"
import DepGraph from "../../depgraph"
import { basePath } from "../../util/siteUrl"

export const NotFoundPage: QuartzEmitterPlugin = () => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    pageBody: NotFound(),
    beforeBody: [],
    // the same sidebar as every other page, so the 404 page stays navigable
    left: defaultContentPageLayout.left,
    right: [],
  }

  const { head: Head, pageBody, left, footer: Footer } = opts
  const Body = BodyConstructor()

  return {
    name: "404Page",
    getQuartzComponents() {
      return [Head, Body, pageBody, ...left, Footer]
    },
    async getDependencyGraph(_ctx, _content, _resources) {
      return new DepGraph<FilePath>()
    },
    async emit(ctx, content, resources): Promise<FilePath[]> {
      const cfg = ctx.cfg.configuration
      const slug = "404" as FullSlug

      // served for any missing URL at any depth, so assets are linked from the site root
      const root = basePath(cfg.baseUrl) as FullSlug
      const externalResources = pageResources(root, resources, ctx.buildId)
      const notFound = i18n(cfg.locale).pages.error.title
      const [tree, vfile] = defaultProcessedContent({
        slug,
        text: notFound,
        description: notFound,
        frontmatter: { title: notFound, tags: [] },
      })
      const componentData: QuartzComponentProps = {
        ctx,
        fileData: vfile.data,
        externalResources,
        cfg,
        children: [],
        tree,
        // the page lists recently added posts, so it needs the real content index
        allFiles: content.map((c) => c[1].data),
      }

      return [
        await write({
          ctx,
          content: renderPage(cfg, slug, componentData, opts, externalResources),
          slug,
          ext: ".html",
        }),
      ]
    },
  }
}
