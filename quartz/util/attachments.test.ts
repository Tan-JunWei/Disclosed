import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { attachmentOutputPath, isUnpublishable, unpublishableAttachments } from "./attachments"
import { MAX_FILE_BYTES } from "./deployChecks"
import { linkedOutputPath } from "../plugins/transformers/unavailableAttachments"

const POINTER = "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 69000000\n"

function content(files: Record<string, string | number>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attachments-"))
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(dir, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (typeof value === "number") {
      fs.writeFileSync(file, "")
      fs.truncateSync(file, value)
    } else fs.writeFileSync(file, value)
  }
  return dir
}

test("large files and unfetched LFS pointers are unpublishable, normal files are not", () => {
  const dir = content({
    "big.img.gz": MAX_FILE_BYTES + 1,
    "limit.bin": MAX_FILE_BYTES,
    "pointer.wav": POINTER,
    "notes.txt": "version 2 of the notes",
    "empty.txt": "",
  })
  assert.equal(isUnpublishable(path.join(dir, "big.img.gz")), true)
  assert.equal(isUnpublishable(path.join(dir, "pointer.wav")), true)
  assert.equal(isUnpublishable(path.join(dir, "limit.bin")), false)
  assert.equal(isUnpublishable(path.join(dir, "notes.txt")), false)
  assert.equal(isUnpublishable(path.join(dir, "empty.txt")), false)
})

test("unpublishable attachments are listed by their output path, Markdown is ignored", async () => {
  const dir = content({
    "Assets/Creation/Forensics/disk.img.gz": POINTER,
    "Assets/Creation/Forensics/song file.wav": 2048,
    "Notes/huge.md": MAX_FILE_BYTES + 1,
    "private/secret.bin": MAX_FILE_BYTES + 1,
  })
  const found = await unpublishableAttachments("test-build", dir, ["private"])
  assert.deepEqual([...found], ["Assets/Creation/Forensics/disk.img.gz"])
})

test("output paths match the names the Assets emitter writes", () => {
  assert.equal(
    attachmentOutputPath("Assets/Creation/Forensics/disk.img.gz"),
    "Assets/Creation/Forensics/disk.img.gz",
  )
  assert.equal(
    attachmentOutputPath("Assets/General Skills/my file.png"),
    "Assets/General-Skills/my-file.png",
  )
})

test("relative links resolve against the page, external links are ignored", () => {
  const page = "Challenge-Creation/Forensics/YCEP-2025---Stealth-Mode-Activated"
  assert.equal(
    linkedOutputPath(page, "../../Assets/Creation/Forensics/disk.img.gz"),
    "Assets/Creation/Forensics/disk.img.gz",
  )
  assert.equal(linkedOutputPath("PicoCTF/index", "../Assets/a%20b.png"), "Assets/a b.png")
  assert.equal(linkedOutputPath(page, "https://example.com/disk.img.gz"), undefined)
  assert.equal(linkedOutputPath(page, "#flag"), undefined)
  assert.equal(linkedOutputPath(page, "mailto:a@b.c"), undefined)
})
