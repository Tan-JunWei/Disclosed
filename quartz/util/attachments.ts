import fs from "node:fs"
import path from "node:path"
import { glob } from "./glob"
import { FilePath, slugifyFilePath } from "./path"
import { MAX_FILE_BYTES, isLfsPointer } from "./deployChecks"

/** Where the Assets emitter writes a content file, relative to the output folder. */
export function attachmentOutputPath(relativePath: string): string {
  const ext = path.extname(relativePath)
  return slugifyFilePath(relativePath as FilePath, true) + ext
}

/**
 * A file that cannot be published: larger than the host accepts, or a Git LFS pointer because the
 * checkout did not fetch the real file. Such files are left out of the site and links to them are
 * shown as unavailable rather than leading to an error or a 130-byte text file.
 */
export function isUnpublishable(file: string): boolean {
  const { size } = fs.statSync(file)
  return size > MAX_FILE_BYTES || (size < 1024 && isLfsPointer(file))
}

const cache = new Map<string, Promise<Set<string>>>()

/**
 * Output paths (e.g. `Assets/Forensics/disk.img.gz`) of every unpublishable attachment. Computed once
 * per build, so a rebuild in `npm start` notices a file that was added or fetched since.
 */
export function unpublishableAttachments(
  buildId: string,
  contentDir: string,
  ignorePatterns: string[],
): Promise<Set<string>> {
  const key = `${buildId}\n${path.resolve(contentDir)}\n${ignorePatterns.join("\n")}`
  if (!cache.has(key)) cache.clear()
  let result = cache.get(key)
  if (!result) {
    result = glob("**", contentDir, ["**/*.md", ...ignorePatterns]).then(
      (files) =>
        new Set(
          files
            .filter((file) => isUnpublishable(path.join(contentDir, file)))
            .map(attachmentOutputPath),
        ),
    )
    cache.set(key, result)
  }
  return result
}
