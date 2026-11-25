/** Copy that describes the site as a whole. The page title itself lives in quartz.config.ts. */
export const SITE = {
  description:
    "My technical notes on cybersecurity: CTF challenges I have solved, HackTheBox incident investigations, and vulnerabilities I have found in open-source projects.",
  /** Appended to the home page title so search results say what the site covers. */
  tagline: "CTF Writeups and Vulnerability Research",
  /** Folder of the section featured by the hero's secondary button. */
  featuredSection: "Vulnerability Research",
  author: {
    name: "Jun Wei Tan",
    profiles: ["https://github.com/Tan-JunWei", "https://www.linkedin.com/in/jun-wei-tan"],
  },
  /** License of the written content, shown in the footer and declared in structured data. */
  license: "https://creativecommons.org/licenses/by-nc/4.0/",
} as const
