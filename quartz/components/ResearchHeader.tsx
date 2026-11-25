import { ComponentChildren, JSX } from "preact"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { buildPostEntry } from "../util/posts"
import { describeLink } from "../util/describeLink"
import facts from "./styles/researchHeader.scss"
import attackPath from "./styles/attackPath.scss"
// @ts-ignore
import script from "./scripts/attackPath.inline"

interface Fact {
  label: string
  tone?: "fixed" | "advisory" | "rating" | "patch"
  value: JSX.Element[]
}

function ExternalLink({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <a class="rh-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span class="rh-sr"> (opens in a new tab)</span>
    </a>
  )
}

/**
 * The facts card for vulnerability research posts (weakness, affected and fixed versions, patch and
 * advisory). Renders nothing for any other page. The attack path diagram is produced from the post's
 * Markdown (see the AttackPath transformer), and this component only carries its styles and script.
 */
const ResearchHeader: QuartzComponent = ({ cfg, fileData, displayClass }: QuartzComponentProps) => {
  const entry = buildPostEntry(cfg, fileData)
  if (!entry || entry.kind !== "research") return null

  const items: Fact[] = []
  if (entry.advisory) {
    items.push({
      label: "Advisory",
      tone: "advisory",
      value: [
        <ExternalLink key="v" href={entry.advisory}>
          {describeLink(entry.advisory)}
        </ExternalLink>,
      ],
    })
  }
  if (entry.severity || entry.cvss !== undefined) {
    const version = fileData.frontmatter?.cvssVersion
    const versionLabel = version === "3.1" || version === "4.0" ? `CVSS v${version}` : "CVSS"
    items.push({
      label: "Severity / CVSS",
      tone: "rating",
      value: [
        ...(entry.severity
          ? [
              <span key="severity" class={`rh-severity rh-severity-${entry.severity}`}>
                {entry.severity}
              </span>,
            ]
          : []),
        ...(entry.cvss !== undefined
          ? [
              <span key="score" class="rh-score-value">
                {entry.cvss.toFixed(1)}
                <span class="rh-score-scale"> ({versionLabel})</span>
              </span>,
            ]
          : []),
      ],
    })
  }
  if (entry.cwe.length > 0) {
    items.push({
      label: "Weakness",
      value: entry.cwe.map((id) => (
        <ExternalLink key={id} href={`https://cwe.mitre.org/data/definitions/${id.slice(4)}.html`}>
          {id}
        </ExternalLink>
      )),
    })
  }
  if (entry.affected)
    items.push({ label: "Affected", value: [<code key="a">{entry.affected}</code>] })
  if (entry.fixed) {
    items.push({ label: "Fixed in", tone: "fixed", value: [<code key="f">{entry.fixed}</code>] })
  }
  if (entry.patch) {
    items.push({
      label: "Patch",
      tone: "patch",
      value: [
        <ExternalLink key="p" href={entry.patch}>
          {describeLink(entry.patch)}
        </ExternalLink>,
      ],
    })
  }

  return (
    <>
      {items.length > 0 && (
        <div
          class={classNames(displayClass, "research-facts")}
          role="group"
          aria-label="Vulnerability overview"
        >
          <h2 class="rh-title">Overview</h2>
          <dl class="rh-grid">
            {items.map((item) => (
              <div class={`rh-item${item.tone ? ` rh-${item.tone}` : ""}`} key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  )
}

ResearchHeader.css = `${facts}\n${attackPath}`
ResearchHeader.afterDOMLoaded = script

export default (() => ResearchHeader) satisfies QuartzComponentConstructor
