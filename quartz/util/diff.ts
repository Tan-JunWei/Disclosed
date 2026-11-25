export type DiffKind = "add" | "del" | "hunk"

/**
 * What each line of a unified diff is: an addition, a deletion or a hunk header (`@@ ... @@`). File
 * headers (`--- a/x` followed by `+++ b/x`), `diff --git` lines and context lines have no kind.
 * Looking at the pair is what tells a `--- a/x` header from a deleted line that starts with `-- `.
 */
export function classifyDiff(lines: string[]): (DiffKind | undefined)[] {
  return lines.map((line, index) => {
    if (line.startsWith("--- ") && lines[index + 1]?.startsWith("+++ ")) return undefined
    if (line.startsWith("+++ ") && lines[index - 1]?.startsWith("--- ")) return undefined
    if (line.startsWith("@@")) return "hunk"
    if (line.startsWith("+")) return "add"
    if (line.startsWith("-")) return "del"
    return undefined
  })
}
