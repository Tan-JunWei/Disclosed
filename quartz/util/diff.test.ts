import test from "node:test"
import assert from "node:assert/strict"
import { Element, Root } from "hast"
import { classifyDiff } from "./diff"
import { markDiffLines } from "../plugins/transformers/diffLines"

test("additions, deletions and hunk headers are told apart from context", () => {
  assert.deepEqual(classifyDiff(["@@ -1,3 +1,4 @@", " keep", "-old", "+new", "+", "-"]), [
    "hunk",
    undefined,
    "del",
    "add",
    "add",
    "del",
  ])
})

test("file headers are not additions or deletions, but a deleted '-- ' line still is", () => {
  const header = [
    "diff --git a/x b/x",
    "index 1..2 100644",
    "--- a/x",
    "+++ b/x",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ]
  assert.deepEqual(classifyDiff(header), [
    undefined,
    undefined,
    undefined,
    undefined,
    "hunk",
    "del",
    "add",
  ])
  assert.deepEqual(classifyDiff(["--- a SQL comment", "+kept"]), ["del", "add"])
})

const span = (text: string, key: "data-line" | "dataLine"): Element => ({
  type: "element",
  tagName: "span",
  properties: { [key]: "" },
  children: [
    { type: "element", tagName: "span", properties: {}, children: [{ type: "text", value: text }] },
  ],
})

const block = (
  language: string,
  lines: string[],
  key: "data-line" | "dataLine" = "data-line",
): Root => ({
  type: "root",
  children: [
    {
      type: "element",
      tagName: "pre",
      properties: {},
      children: [
        {
          type: "element",
          tagName: "code",
          properties: { "data-language": language },
          children: lines.flatMap((line) => [
            span(line, key),
            { type: "text", value: "\n" } as const,
          ]),
        },
      ],
    },
  ],
})

const kinds = (tree: Root) => {
  const found: (string | undefined)[] = []
  const code = (tree.children[0] as Element).children[0] as Element
  for (const child of code.children) {
    if (child.type === "element") found.push(child.properties?.["data-diff"] as string | undefined)
  }
  return found
}

test("every line of a diff block is marked, whichever way the highlighter spells its property", () => {
  for (const key of ["data-line", "dataLine"] as const) {
    const tree = block("diff", ["@@ -1 +1 @@", " context", "-gone", "+added"], key)
    markDiffLines()(tree)
    assert.deepEqual(kinds(tree), ["hunk", undefined, "del", "add"])
  }
})

test("patch blocks count as diffs, and other languages are never touched", () => {
  const patch = block("patch", ["-a", "+b"])
  markDiffLines()(patch)
  assert.deepEqual(kinds(patch), ["del", "add"])
  const python = block("python", ["-x = 1", "+y = 2"])
  markDiffLines()(python)
  assert.deepEqual(kinds(python), [undefined, undefined])
})

test("the text of the lines is left exactly as it was", () => {
  const tree = block("diff", ["+one", "-two"])
  markDiffLines()(tree)
  const code = (tree.children[0] as Element).children[0] as Element
  const text = code.children.map((c) =>
    c.type === "element" ? (c.children[0] as Element).children[0] : c,
  )
  assert.equal(JSON.stringify(text).includes("+one") && JSON.stringify(text).includes("-two"), true)
})
