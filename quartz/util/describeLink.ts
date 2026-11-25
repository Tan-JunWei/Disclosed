/** `https://github.com/o/r/commit/abc1234def` becomes "commit abc1234", other links their host and path. */
export function describeLink(href: string): string {
  const url = new URL(href)
  const path = url.pathname.replace(/\/+$/, "")
  const commit = path.match(/\/commit\/([0-9a-f]{7,40})$/i)
  if (commit) return `commit ${commit[1].slice(0, 7)}`
  const pull = path.match(/\/pull\/(\d+)$/)
  if (pull) return `pull request #${pull[1]}`
  const advisory = path.match(/\/advisories\/(GHSA-[\w-]+)$/i)
  if (advisory) return advisory[1].toUpperCase()
  const shown = url.host.replace(/^www\./, "") + path
  return shown.length > 42 ? shown.slice(0, 41) + "…" : shown
}
