export const TECHNIQUE_FAMILIES = [
  {
    id: "cryptanalysis",
    name: "Cryptanalysis",
    short: "Cryptanalysis",
    tags: [
      "ROT13",
      "Substitution",
      "Vigenere",
      "CaesarCipher",
      "Transposition",
      "Atbash",
      "RSA",
      "Mod",
      "XOR",
      "RailFence",
      "OneTimePad",
      "PWcrack",
      "MD5",
      "Hash",
      "OpenSSL",
      "aircrack-ng",
    ],
  },
  {
    id: "encoding",
    name: "Encoding & Decoding",
    short: "Encoding",
    tags: ["base64", "Hex", "Binary", "MorseCode", "Endianness", "ASCII", "Octal", "QRcode"],
  },
  {
    id: "network",
    name: "Network Analysis",
    short: "Network",
    tags: ["pcap", "Wireshark", "SSH", "Netcat", "aircrack-ng"],
  },
  {
    id: "artifacts",
    name: "File & Artifact Analysis",
    short: "Artifacts",
    tags: [
      "Sleuthkit",
      "filetypes",
      "Git",
      "Steganography",
      "strings",
      "zip",
      "binwalk",
      "grep",
      "tree",
      "metadata",
      "Checksum",
      "Steghide",
      "AudioForensics",
      "Image",
      "hexedit",
      "zsteg",
      "apk",
      "tar",
    ],
  },
  {
    id: "windows",
    name: "Windows & Active Directory Forensics",
    short: "Windows DFIR",
    tags: [
      "MFT",
      "EventLogs",
      "Prefetch",
      "NTDS",
      "ActiveDirectory",
      "Kerberoasting",
      "ASREProasting",
      "LLMNR",
      "NTLM",
    ],
  },
  {
    id: "exploitation",
    name: "Web & System Exploitation",
    short: "Exploitation",
    tags: [
      "DirectoryEnumeration",
      "FileUploadBypass",
      "GTFOBins",
      "ASREProasting",
      "PathTraversal",
      "SSTI",
      "NFS",
      "robots",
      "HTTPMethods",
    ],
  },
  {
    id: "scripting",
    name: "Programming & Scripting",
    short: "Scripting",
    tags: ["Python", "JavaScript"],
  },
  { id: "osint", name: "OSINT", short: "OSINT", tags: ["OSINT", "Geography"] },
] as const

const DIFFICULTY_TAGS = new Set(["beginner", "easy", "medium", "hard", "insane", "expert"])
/** Tags that name a post's category (the folder it sits in) rather than a technique. */
const CATEGORY_TAGS = new Set([
  "forensics",
  "generalskills",
  "cryptography",
  "challengecreation",
  "miscellaneous",
  "infrahacking",
  "webexploitation",
])
const METADATA_TAGS = new Set([...DIFFICULTY_TAGS, ...CATEGORY_TAGS])
// A product name alone does not establish an exploitation technique.
const UNCLASSIFIED_TAGS = new Set(["jenkins", "binarysearch"])

export function techniqueFamilies(tags: readonly string[]): string[] {
  const normalized = new Set(tags.map((tag) => tag.toLowerCase()))
  return TECHNIQUE_FAMILIES.filter((family) =>
    family.tags.some((tag) => normalized.has(tag.toLowerCase())),
  ).map((family) => family.id)
}

export function isTechniqueTag(tag: string): boolean {
  return techniqueFamilies([tag]).length > 0
}

export function unreviewedTags(tags: readonly string[]): string[] {
  return [...new Set(tags)].filter(
    (tag) =>
      !isTechniqueTag(tag) &&
      !METADATA_TAGS.has(tag.toLowerCase()) &&
      !UNCLASSIFIED_TAGS.has(tag.toLowerCase()),
  )
}

export function tagLabel(tag: string): string {
  const labels: Record<string, string> = {
    Vigenere: "Vigenère",
    // proper names that the camelCase / hyphen splitting below would mangle
    OpenSSL: "OpenSSL",
    "aircrack-ng": "aircrack-ng",
    PWcrack: "Password cracking",
    OneTimePad: "One-time pad",
    filetypes: "File types",
    pcap: "Packet capture",
    base64: "Base64",
    Mod: "Modular arithmetic",
    apk: "APK inspection",
  }
  return labels[tag] ?? tag.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/-/g, " ")
}

export type TagGroupId =
  | (typeof TECHNIQUE_FAMILIES)[number]["id"]
  | "difficulty"
  | "category"
  | "other"

export interface TagGroup<T> {
  id: TagGroupId
  name: string
  items: T[]
}

/** The first technique family a tag belongs to, if any. */
export function tagFamily(tag: string) {
  const id = techniqueFamilies([tag])[0]
  return TECHNIQUE_FAMILIES.find((family) => family.id === id)
}

/**
 * Sorts tags into the index's groups: each technique family in registry order (a tag listed under
 * two families appears under the first), then difficulty, category and everything else. Empty
 * groups are dropped.
 */
export function groupTags<T extends { tag: string }>(items: readonly T[]): TagGroup<T>[] {
  const groups: TagGroup<T>[] = [
    ...TECHNIQUE_FAMILIES.map((family) => ({ id: family.id, name: family.name, items: [] as T[] })),
    { id: "difficulty", name: "Difficulty", items: [] },
    { id: "category", name: "Category", items: [] },
    { id: "other", name: "Other", items: [] },
  ]
  const byId = new Map(groups.map((group) => [group.id, group]))
  for (const item of items) {
    const lower = item.tag.toLowerCase()
    const id: TagGroupId =
      tagFamily(item.tag)?.id ??
      (DIFFICULTY_TAGS.has(lower) ? "difficulty" : CATEGORY_TAGS.has(lower) ? "category" : "other")
    byId.get(id)!.items.push(item)
  }
  return groups.filter((group) => group.items.length > 0)
}
