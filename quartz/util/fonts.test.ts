import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { PRELOADED_FONTS } from "./fonts"

const styles = fs.readFileSync(path.join("quartz", "styles", "fonts.scss"), "utf8")
const referenced = [...styles.matchAll(/url\("(static\/fonts\/[^"]+)"\)/g)].map((match) => match[1])

test("every font the stylesheet names is in quartz/static/fonts", () => {
  assert(referenced.length > 0)
  for (const file of referenced) {
    assert(fs.existsSync(path.join("quartz", file)), `missing ${file}`)
  }
})

test("no font files are left over that the stylesheet no longer uses", () => {
  const onDisk = fs.readdirSync(path.join("quartz", "static", "fonts"))
  const used = new Set(referenced.map((file) => path.basename(file)))
  assert.deepEqual(
    onDisk.filter((file) => !used.has(file)),
    [],
  )
})

test("preloaded fonts exist and are used by the stylesheet", () => {
  for (const file of PRELOADED_FONTS) {
    assert(referenced.includes(file), `${file} is not in fonts.scss`)
  }
})

test("pages never load fonts from a third party", () => {
  assert(!/fonts\.(googleapis|gstatic)\.com/.test(styles))
})
