import test from "node:test"
import assert from "node:assert/strict"
import { groupTags, tagFamily, tagLabel } from "./techniques"

const ids = (tags: string[]) =>
  Object.fromEntries(
    groupTags(tags.map((tag) => ({ tag }))).map((g) => [g.id, g.items.map((i) => i.tag)]),
  )

test("groups tags by technique family, then difficulty, category and other", () => {
  const groups = ids(["MorseCode", "easy", "Forensics", "Jenkins", "Wireshark", "beginner"])
  assert.deepEqual(groups, {
    encoding: ["MorseCode"],
    network: ["Wireshark"],
    difficulty: ["easy", "beginner"],
    category: ["Forensics"],
    other: ["Jenkins"],
  })
})

test("a tag in two families appears once, under the first", () => {
  const groups = groupTags([{ tag: "aircrack-ng" }, { tag: "ASREProasting" }])
  assert.deepEqual(
    groups.map((g) => [g.id, g.items.map((i) => i.tag)]),
    [
      ["cryptanalysis", ["aircrack-ng"]],
      ["windows", ["ASREProasting"]],
    ],
  )
})

test("group order follows the registry and drops empty groups", () => {
  const order = groupTags([{ tag: "other-thing" }, { tag: "Python" }, { tag: "RSA" }]).map(
    (g) => g.id,
  )
  assert.deepEqual(order, ["cryptanalysis", "scripting", "other"])
})

test("tagFamily and tagLabel", () => {
  assert.equal(tagFamily("MorseCode")?.name, "Encoding & Decoding")
  assert.equal(tagFamily("Jenkins"), undefined)
  assert.equal(tagLabel("MorseCode"), "Morse Code")
})
