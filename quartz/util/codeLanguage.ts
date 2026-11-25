import { LANGUAGE_ICONS } from "./languageIcons"

const LANGUAGE_NAMES: Record<string, string> = {
  python: "Python",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  zsh: "Zsh",
  console: "Terminal",
  shellsession: "Terminal",
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  http: "HTTP",
  groovy: "Groovy",
  c: "C",
  cpp: "C++",
  "c++": "C++",
  java: "Java",
  go: "Go",
  rust: "Rust",
  ruby: "Ruby",
  sql: "SQL",
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  markdown: "Markdown",
  md: "Markdown",
  powershell: "PowerShell",
  ps1: "PowerShell",
  dockerfile: "Dockerfile",
  docker: "Docker",
  makefile: "Makefile",
  perl: "Perl",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  scala: "Scala",
  lua: "Lua",
  r: "R",
  asm: "Assembly",
  assembly: "Assembly",
}

/** Languages without an entry (or whose brand icon Simple Icons no longer offers) get the generic icon. */
const ICON_SLUGS: Record<string, string> = {
  python: "python",
  bash: "gnubash",
  sh: "gnubash",
  shell: "gnubash",
  zsh: "gnubash",
  console: "gnubash",
  shellsession: "gnubash",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  groovy: "apachegroovy",
  go: "go",
  rust: "rust",
  ruby: "ruby",
  json: "json",
  yaml: "yaml",
  html: "html5",
  scss: "sass",
  c: "c",
  cpp: "cplusplus",
  "c++": "cplusplus",
  kotlin: "kotlin",
  swift: "swift",
  php: "php",
  scala: "scala",
  lua: "lua",
  perl: "perl",
  docker: "docker",
  dockerfile: "docker",
  markdown: "markdown",
  md: "markdown",
  toml: "toml",
  r: "r",
}

const UNLABELLED = new Set(["", "plaintext", "text", "txt", "plain"])

/** Whether a code block in this language gets a header at all. */
export function hasLanguageLabel(language: string): boolean {
  return !UNLABELLED.has(language.trim().toLowerCase())
}

export function languageDisplayName(language: string): string {
  const key = language.trim().toLowerCase()
  return LANGUAGE_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

export function languageIcon(language: string): { fill: string; d: string } | undefined {
  const slug = ICON_SLUGS[language.trim().toLowerCase()]
  return slug ? LANGUAGE_ICONS[slug] : undefined
}
