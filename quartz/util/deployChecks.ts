import fs from "node:fs"
import path from "node:path"

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_FILES = 20_000

const LFS_POINTER = "version https://git-lfs.github.com/spec/v1"

export interface DeployProblem {
  file?: string
  problem: string
}

/**
 * Problems in a built site that would fail the upload or publish broken files: a file over the
 * host's size limit, too many files, or a Git LFS pointer left where the real file should be
 * (a checkout that did not fetch LFS objects).
 */
export function findDeployProblems(outputDir: string): DeployProblem[] {
  const problems: DeployProblem[] = []
  let count = 0
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      count++
      const file = path.relative(outputDir, full).split(path.sep).join("/")
      const { size } = fs.statSync(full)
      if (size > MAX_FILE_BYTES) {
        const mib = (size / 1024 / 1024).toFixed(1)
        problems.push({ file, problem: `${mib} MiB is over the 25 MiB per-file limit` })
      } else if (size < 1024 && isLfsPointer(full)) {
        problems.push({ file, problem: "is a Git LFS pointer, not the real file" })
      }
    }
  }
  walk(outputDir)
  if (count > MAX_FILES) {
    problems.push({ problem: `${count} files is over the ${MAX_FILES} file limit` })
  }
  return problems
}

export function isLfsPointer(file: string): boolean {
  const handle = fs.openSync(file, "r")
  try {
    const buffer = Buffer.alloc(LFS_POINTER.length)
    fs.readSync(handle, buffer, 0, buffer.length, 0)
    return buffer.toString("utf8") === LFS_POINTER
  } finally {
    fs.closeSync(handle)
  }
}
