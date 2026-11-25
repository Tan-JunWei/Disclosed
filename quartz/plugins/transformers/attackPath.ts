import chalk from "chalk"
import { Code, Root } from "mdast"
import { visit } from "unist-util-visit"
import { QuartzTransformerPlugin } from "../types"
import { parseAttackPath, renderAttackPath } from "../../util/attackPath"
import { ratingFromFrontmatter } from "../../util/posts"

/**
 * Turns an ```attack-path fence into the attack path diagram and step list. The styles and the hover
 * behaviour ship with the ResearchHeader component. A block that cannot be read at all is left as an
 * ordinary code block, so a typo never costs the page.
 */
export const AttackPath: QuartzTransformerPlugin = () => ({
  name: "AttackPath",
  markdownPlugins() {
    return [
      () => (tree: Root, file) => {
        let count = 0
        // the route is drawn in the colour of the post's severity, red unless it says otherwise
        const hue = ratingFromFrontmatter(file.data.frontmatter)?.hue ?? "hard"
        visit(tree, "code", (node: Code, index, parent) => {
          if (node.lang !== "attack-path" || index === undefined || !parent) return
          const graph = parseAttackPath(node.value)
          const where = file.data.relativePath ?? file.path
          for (const warning of graph.warnings) {
            console.warn(chalk.yellow(`\nattack-path in ${where}: ${warning}`))
          }
          if (graph.nodes.length === 0) return
          parent.children[index] = {
            type: "html",
            value: renderAttackPath(graph, `ap${++count}`, hue),
          }
        })
      },
    ]
  },
})
