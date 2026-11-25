import test from "node:test"
import assert from "node:assert/strict"
import { describeLink } from "./describeLink"

test("well-known links get a short readable name", () => {
  assert.equal(describeLink("https://github.com/o/r/commit/0123456789abcdef"), "commit 0123456")
  assert.equal(describeLink("https://github.com/o/r/pull/412"), "pull request #412")
  assert.equal(
    describeLink("https://github.com/o/r/security/advisories/GHSA-abcd-efgh-ijkl"),
    "GHSA-ABCD-EFGH-IJKL",
  )
})

test("other links show host and path, shortened when long", () => {
  assert.equal(describeLink("https://www.example.com/a/b/"), "example.com/a/b")
  const long = describeLink("https://example.com/" + "x".repeat(80))
  assert.equal(long.length, 42)
  assert(long.endsWith("…"))
})
