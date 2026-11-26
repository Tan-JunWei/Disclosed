import { Root } from "hast"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import { buildPostEntries } from "../../util/posts"
import { SECTIONS } from "../../util/sections"
import { htmlToJsx } from "../../util/jsx"
import { joinSegments, pathToRoot, resolveRelative } from "../../util/path"

/**
 * The "CTF Writeups" page: one card per CTF, each opening its own writeup list.
 * It reuses the home page's route card, with the CTF's own logo in place of the illustration.
 */
const CtfHub: QuartzComponent = (props: QuartzComponentProps) => {
  const { allFiles, fileData, cfg, tree } = props
  const entries = buildPostEntries(cfg, allFiles)
  const competitions = SECTIONS.filter((section) => section.competition)

  const cards = competitions.map((section) => {
    const posts = entries.filter((entry) => entry.section === section.folder)
    const categories = [
      ...posts.reduce(
        (m, e) => m.set(e.category, (m.get(e.category) ?? 0) + 1),
        new Map<string, number>(),
      ),
    ]
      .sort((x, y) => y[1] - x[1])
      .map(([category]) => category)
    return {
      section,
      count: posts.length,
      categories,
      href: resolveRelative(fileData.slug!, section.landing),
    }
  })

  const hasIntro = (tree as Root).children.length > 0
  return (
    <div class="ctf-hub popover-hint">
      {hasIntro && <article class="ctf-hub-intro">{htmlToJsx(fileData.filePath!, tree)}</article>}
      <div class="lab-routes ctf-hub-routes">
        {cards.map((card) => (
          <a
            class="lab-route"
            key={card.section.folder}
            style={card.section.brand ? { "--route-accent": card.section.brand.color } : undefined}
            href={card.href}
          >
            {card.section.brand ? (
              <span class="ctf-hub-logo-slot">
                {[
                  { file: card.section.brand.logo, theme: "light" },
                  ...(card.section.brand.logoDark
                    ? [{ file: card.section.brand.logoDark, theme: "dark" }]
                    : []),
                ].map(({ file, theme }) => (
                  <img
                    class={`ctf-hub-logo${card.section.brand?.logoDark ? ` for-${theme}` : ""}`}
                    key={theme}
                    src={joinSegments(pathToRoot(fileData.slug!), "static/logos", file)}
                    alt=""
                    style={{ height: `${card.section.brand?.size ?? 5}rem` }}
                  />
                ))}
              </span>
            ) : (
              <span class="ctf-hub-logo" aria-hidden="true" />
            )}
            <div class="lab-route-stat">
              <span class="lab-route-num">{card.count}</span>
              <span class="lab-route-noun">
                {card.count === 1 ? card.section.noun.one : card.section.noun.many}
              </span>
            </div>
            <h3>{card.section.label}</h3>
            <p>{card.section.summary ?? card.section.blurb}</p>
            {card.categories.length > 0 && (
              <ul class="lab-route-tags ctf-hub-tags" aria-label="Categories">
                {card.categories.map((category) => (
                  <li key={category}>{category}</li>
                ))}
              </ul>
            )}
            <span class="lab-route-cta">Open writeups</span>
          </a>
        ))}
      </div>
    </div>
  )
}

export default (() => CtfHub) satisfies QuartzComponentConstructor
