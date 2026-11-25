import { FullSlug } from "./path"

export type SectionKind = "ctf" | "research" | "article"

export interface Section {
  /** Top-level content folder. Also the value used by the `section` filter. */
  folder: string
  label: string
  /** How page titles name the section, e.g. "picoCTF Cryptography Writeups". Omitted for research. */
  searchLabel?: string
  /** Decides which metadata a post carries: ctf posts have a difficulty, research posts a severity. */
  kind: SectionKind
  /** Slug of the section's landing page, which lists its posts. */
  landing: FullSlug
  /** A CTF whose writeups are grouped under one "CTF Writeups" card on the home page. */
  competition?: boolean
  /** Longer description shown on the CTF Writeups page. */
  summary?: string
  /** The CTF's own logo, a file in `quartz/static/logos`, and the colour its card is accented with. `logoDark` replaces the logo in the dark theme, for a logo whose lettering is light. `size` is its height in rem (default 5), so a round mark can sit smaller than a tall one. */
  brand?: { logo: string; logoDark?: string; color: string; size?: number }
  /** The illustration on the section's home page card. Defaults to one chosen by `kind`. */
  art?: "lens"
  /** Colour of the section's posts in the graph: the `<key>` of `--graph-node-<key>` in graph.scss. */
  graphColour?: string
  blurb: string
  noun: { one: string; many: string }
}

/**
 * Every top-level content folder that holds posts. To add a section, create the folder (posts live
 * at `<folder>/<Category>/<file>.md`), add a landing page, and register it here. Folders that are not
 * registered are ignored by the stats and the Explore page, and the build warns about them.
 */
export const SECTIONS: readonly Section[] = [
  {
    folder: "PicoCTF",
    graphColour: "pico",
    competition: true,
    brand: { logo: "picoctf.png", color: "hsl(348 78% 45%)", size: 3.6 },
    summary:
      "Challenges from the picoCTF platform, built by Carnegie Mellon University. Each one is worked through step by step, with links to similar challenges.",
    label: "picoCTF",
    searchLabel: "picoCTF",
    kind: "ctf",
    landing: "PicoCTF/PicoCTF-Writeups" as FullSlug,
    blurb: "Writeups for picoCTF challenges.",
    noun: { one: "writeup", many: "writeups" },
  },
  {
    folder: "HNF26",
    graphColour: "hnf",
    competition: true,
    brand: { logo: "hnf-light.png", logoDark: "hnf-dark.png", color: "hsl(203 100% 45%)" },
    summary:
      "My solves from the HNF26 CTF, covering cryptography, web exploitation, forensics, OSINT and infrastructure challenges, with reproducible scripts for the longer ones.",
    label: "HNF26",
    searchLabel: "HNF26",
    kind: "ctf",
    landing: "HNF26/HNF26-Writeups" as FullSlug,
    blurb: "Writeups for the HNF26 CTF.",
    noun: { one: "writeup", many: "writeups" },
  },
  {
    folder: "HackTheBox",
    graphColour: "htb",
    label: "HackTheBox Sherlocks",
    searchLabel: "HackTheBox Sherlock",
    kind: "ctf",
    art: "lens",
    landing: "HackTheBox/HackTheBox-Sherlocks" as FullSlug,
    blurb:
      "Incident investigations from retired HackTheBox Sherlocks, using event logs, file system records and packet captures.",
    noun: { one: "writeup", many: "writeups" },
  },
  {
    folder: "Challenge Creation",
    graphColour: "creation",
    label: "Self-Created",
    searchLabel: "Original CTF",
    kind: "ctf",
    landing: "Challenge-Creation/CTF-Challenges-I've-Created" as FullSlug,
    blurb: "Descriptions and solutions for challenges I've created.",
    noun: { one: "challenge", many: "challenges" },
  },
  {
    folder: "Vulnerability Research",
    graphColour: "research",
    label: "Vulnerability Research",
    kind: "research",
    landing: "Vulnerability-Research/Vulnerability-Research" as FullSlug,
    blurb: "Vulnerabilities I have found in open-source projects, and how they were disclosed.",
    noun: { one: "advisory", many: "advisories" },
  },
]

export function findSection(folder: string | undefined): Section | undefined {
  return SECTIONS.find((section) => section.folder === folder)
}

export const SECTION_LANDINGS: ReadonlySet<FullSlug> = new Set(
  SECTIONS.map((section) => section.landing),
)
