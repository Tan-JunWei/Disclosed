import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4.0 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "Disclosed",
    enableSPA: true,
    enablePopovers: true,
    analytics: null,
    locale: "en-US",
    // Production address, used only where a URL must be absolute: canonical links, social metadata,
    // structured data, the sitemap, RSS and robots.txt. Pages link to each other with relative URLs,
    // so the build works unchanged on any host, preview deployment or local server.
    baseUrl: "disclosed.nepz.dev",
    ignorePatterns: ["private", "templates", ".obsidian"],
    // `modified` in frontmatter only records the last edit, and bulk edits reset it for every file.
    // Lists, sorting and the dashboard use the date a post was first added instead.
    defaultDateType: "created",
    theme: {
      fontOrigin: "local",
      cdnCaching: true,
      typography: {
        header: "Tomorrow",
        body: "Source Sans 3",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#f4f3ef",
          lightgray: "#d9dddE",
          gray: "#58636b",
          darkgray: "#354149",
          dark: "#202d35",
          secondary: "#285773",
          tertiary: "#614b91",
          highlight: "rgba(66, 103, 123, 0.10)",
          textHighlight: "#fff23688",
          lighterLight: "rgba(244, 243, 239, 0.9)", // For image zoom background
          border: "#bcc6c9", // divider/frame color, lightgray is too subtle for borders
        },
        darkMode: {
          light: "#0e1319",
          lightgray: "#474547",
          gray: "#8a8a8a",
          darkgray: "#d4d4d4",
          dark: "#ebebec",
          secondary: "#76a1c4",
          tertiary: "#ada1ed",
          highlight: "rgba(143, 159, 169, 0.08)",
          textHighlight: "#b3aa0288",
          lighterLight: "rgba(14, 19, 25, 0.8)", // For image zoom background
          border: "#474547", // matches lightgray
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "light-plus",
          dark: "dark-plus",
        },
        keepBackground: false,
      }),
      Plugin.AttackPath(),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.UnavailableAttachments(),
      Plugin.ImageAttributes(),
      Plugin.Description(),
      Plugin.MediumZoom(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.LazyModules(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.NotFoundPage(),
      Plugin.RobotsTxt(),
      Plugin.HostingRules({
        // old GitHub Pages paths (tan-junwei.github.io/CTF-Writeups/), in case a link or bookmark reaches the new domain
        legacyPaths: ["/CTF-Writeups"],
        redirects: [
          "/HackTheBox/Forensics /HackTheBox/Sherlocks/ 301",
          "/HackTheBox/Forensics/* /HackTheBox/Sherlocks/:splat 301",
          "/CTF-Writeups/HackTheBox/Forensics /HackTheBox/Sherlocks/ 301",
          "/CTF-Writeups/HackTheBox/Forensics/* /HackTheBox/Sherlocks/:splat 301",
        ],
        // Cloudflare Pages copies: the production alias and every preview deployment
        noindexHosts: [":project.pages.dev", ":version.:project.pages.dev"],
      }),
    ],
  },
}

export default config
