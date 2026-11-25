import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { MAX_FILE_BYTES, findDeployProblems } from "./deployChecks"

function site(files: Record<string, string | Buffer>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-checks-"))
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), content)
  }
  return dir
}

test("a normal site has no problems", () => {
  const dir = site({ "index.html": "<html></html>", "Assets/a.png": Buffer.alloc(2048) })
  assert.deepEqual(findDeployProblems(dir), [])
})

test("a file over the size limit is reported with its path", () => {
  const dir = site({ "Assets/big.img.gz": Buffer.alloc(0) })
  fs.truncateSync(path.join(dir, "Assets/big.img.gz"), MAX_FILE_BYTES + 1)
  const problems = findDeployProblems(dir)
  assert.equal(problems.length, 1)
  assert.equal(problems[0].file, "Assets/big.img.gz")
  assert.match(problems[0].problem, /25 MiB/)
})

test("a file exactly at the limit is allowed", () => {
  const dir = site({ "edge.bin": Buffer.alloc(0) })
  fs.truncateSync(path.join(dir, "edge.bin"), MAX_FILE_BYTES)
  assert.deepEqual(findDeployProblems(dir), [])
})

test("a Git LFS pointer in place of a real file is reported", () => {
  const pointer = "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n"
  const dir = site({ "Assets/song.wav": pointer, "Assets/notes.txt": "version 1 of my notes" })
  const problems = findDeployProblems(dir)
  assert.deepEqual(
    problems.map((p) => p.file),
    ["Assets/song.wav"],
  )
})
