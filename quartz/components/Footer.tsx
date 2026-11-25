import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import script from "./scripts/footerScene.inline"
import style from "./styles/footer.scss"
import { SITE } from "../util/site"

interface Options {
  links: Record<string, string>
}

const ICONS: Record<string, string> = {
  github:
    "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
}

// Pixel props on the footer rule. Sprites are character grids rendered as SVG rects, and the
// colours and all motion live in footer.scss.
type Sprite = string[]

const TERMINAL: Sprite[] = [
  [
    "kkkkkkkkkkkkkkkk",
    "kwwwwwwwwwwwwwwk",
    "klSwwSSSSSSSSSlk",
    "klSgSSgggSSSSSlk",
    "klSSgSSSSSSSSSlk",
    "klSgSSiiiiiiSSlk",
    "klSSSSSSSSSSSSlk",
    "klSiiSSSSSSSSSlk",
    "klSSSSSSSSSSSSlk",
    "kssssssssssssssk",
    "kkkkkkkkkkkkkkkk",
    "......kmmk......",
    "......kmmk......",
    "...kkkkkkkkkk...",
    "...kkkkkkkkkk...",
  ],
  [
    "kkkkkkkkkkkkkkkk",
    "kwwwwwwwwwwwwwwk",
    "klSwwSSSSSSSSSlk",
    "klSgSSgggSSSSSlk",
    "klSSgSSSSSSSSSlk",
    "klSgSSiiiiiiSSlk",
    "klSSSSSSSSSSSSlk",
    "klSiiSggSSSSSSlk",
    "klSSSSSSSSSSSSlk",
    "kssssssssssssssk",
    "kkkkkkkkkkkkkkkk",
    "......kmmk......",
    "......kmmk......",
    "...kkkkkkkkkk...",
    "...kkkkkkkkkk...",
  ],
]

// the blue screen: white sad face on blue
const BSOD: Sprite[] = [
  [
    "BBBBBBBBBBBB",
    "BBBBFBBFBBBB",
    "BBBBFBBFBBBB",
    "BBBBBBBBBBBB",
    "BBBBBFFBBBBB",
    "BBBBFBBFBBBB",
    "BBBBBBBBBBBB",
  ],
]

// Screen overlays for the monitor's trick: code being typed, then the blue screen, then a boot bar
// (all 12x7, over the screen)
const CODE: Sprite[] = [
  [
    "gggSiiiiSSSS",
    "SSgggggSiiSS",
    "SSSSSSSSSSSS",
    "SSSSSSSSSSSS",
    "SSSSSSSSSSSS",
    "SSSSSSSSSSSS",
    "SSSSSSSSSSSS",
  ],
  [
    "gggSiiiiSSSS",
    "SSgggggSiiSS",
    "SSSSiiiiSggS",
    "gggggSiiSSSS",
    "SSSSSSSSSSSS",
    "SSSSSSSSSSSS",
    "SSSSSSSSSSSS",
  ],
  [
    "gggSiiiiSSSS",
    "SSgggggSiiSS",
    "SSSSiiiiSggS",
    "gggggSiiSSSS",
    "SSiiiiSgggSS",
    "SSSSgggSSSSS",
    "ggSSSSSSSSSS",
  ],
]

const BOOT: Sprite[] = [
  [
    "SSSSSSSSSSSS",
    "SSSSSggSSSSS",
    "SSSSSggSSSSS",
    "SSSSSSSSSSSS",
    "SSiiiiiiiiSS",
    "SSiiiiiiiiSS",
    "SSSSSSSSSSSS",
  ],
]

const BOOTBAR: Sprite[] = [
  [
    "............",
    "............",
    "............",
    "............",
    "..gggggggg..",
    "..gggggggg..",
    "............",
  ],
]

// the warning sign that pops up above the crashed monitor
const WARN: Sprite[] = [
  [
    "....A....",
    "...AaA...",
    "...AZA...",
    "..AaZaA..",
    "..AaZaA..",
    ".AaaaaaA.",
    ".AaaZaaA.",
    "AAAAAAAAA",
  ],
]

// a gold twinkle for the padlock
const SPARK: Sprite[] = [
  [".....", "..A..", ".AaA.", "..A..", "....."],
  ["..A..", "..A..", "AAaAA", "..A..", "..A.."],
]

const PADLOCK: Sprite[] = [
  [
    "............",
    "...kkkkkk...",
    "..kyyyyyyk..",
    "..kakkkkak..",
    "..ka....ak..",
    "..ka....ak..",
    "kkkkkkkkkkkk",
    "kyyyyyyyyyyk",
    "kyaaaaaaaaAk",
    "kyaaakkaaaAk",
    "kaaakkkkaaAk",
    "kaaaakkaaaAk",
    "kaaaakkaaaAk",
    "kAAAAAAAAAAk",
    "kkkkkkkkkkkk",
  ],
  [
    "...kkkkkk...",
    "..kyyyyyyk..",
    "..kakkkkak..",
    "..ka........",
    "..ka........",
    "..ka........",
    "kkkkkkkkkkkk",
    "kyyyyyyyyyyk",
    "kyaaaaaaaaAk",
    "kyaaakkaaaAk",
    "kaaakkkkaaAk",
    "kaaaakkaaaAk",
    "kaaaakkaaaAk",
    "kAAAAAAAAAAk",
    "kkkkkkkkkkkk",
  ],
]

const SPIDER: Sprite[] = [
  [
    ".................",
    ".................",
    ".......ZZZ.......",
    "...zz.ZeWeZ.zz...",
    "..z..zZWWWZz..z..",
    "..zz..ZZWZZ..zz..",
    ".z..zZWWUUUZz..z.",
    ".z...ZWUUUUZ...z.",
    "...zzZUUZUUZzz...",
    "..z..ZUZUZUZ..z..",
    ".z...zZZZZZz...z.",
    ".z.zz...Z...zz.z.",
    "..z...........z..",
  ],
  [
    ".................",
    ".................",
    ".......ZZZ.......",
    "...zz.ZeWeZ.zz...",
    "..z..zZWWWZz..z..",
    "..zz..ZZWZZ..zz..",
    ".zz.zZWWUUUZz..z.",
    ".z...ZWUUUUZ.....",
    "...zzZUUZUUZzz.z.",
    "..z..ZUZUZUZ..z..",
    ".....zZZZZZz...z.",
    ".z.zz...Z...zz.z.",
    ".zz..............",
  ],
]

// A pixel orb web, drawn once and revealed outward from its hub by footer.scss. Its strands are
// finer than the other props, so it is drawn at WEB_PIXEL
const WEB: Sprite[] = [
  [
    ".........z.........",
    "........zzz........",
    ".....zzz.z.zzz.....",
    "...zz....z....zz...",
    "...zz....z....zz...",
    "..z..z..zzz..z..z..",
    "..z...zz.z.zz...z..",
    "..z...zz.z.zz...z..",
    ".z...z..zzz..z...z.",
    "zzzzzzzzzzzzzzzzzzz",
    ".z...z..zzz..z...z.",
    "..z...zz.z.zz...z..",
    "..z...zz.z.zz...z..",
    "..z..z..zzz..z..z..",
    "...zz....z....zz...",
    "...zz....z....zz...",
    ".....zzz.z.zzz.....",
    "........zzz........",
    ".........z.........",
  ],
]

// Three rays fanning out above the flag, one step further out per frame
const BURST: Sprite[] = [
  [
    ".................",
    ".................",
    ".................",
    ".................",
    ".................",
    ".................",
    ".....c..c..c.....",
    "......c.c.c......",
    ".......ccc.......",
    ".................",
  ],
  [
    ".................",
    ".................",
    ".................",
    "..c.....c.....c..",
    "...c....c....c...",
    "....c...c...c....",
    ".................",
    ".................",
    ".................",
    ".................",
  ],
  [
    ".................",
    "c.......c.......c",
    ".c......c......c.",
    "..c.....c.....c..",
    ".................",
    ".................",
    ".................",
    ".................",
    ".................",
    ".................",
  ],
]

const FLAG: Sprite[] = [
  [
    "..a............",
    "..a............",
    "..kqqqqqqqqC...",
    "..kcccccccccC..",
    "..kccccccccccC.",
    "..kccccccccccC.",
    "..kcccccccccC..",
    "..kCCCCCCCCC...",
    "..kCCCCCCCC....",
    "..k............",
    "..k............",
    "..k............",
    "..k............",
    "..k............",
    "..k............",
    ".mmmmm.........",
    "mmmmmmm........",
  ],
  [
    "..a............",
    "..a............",
    "..kqqqqqqqqqC..",
    "..kccccccccccC.",
    "..kcccccccccC..",
    "..kccccccccC...",
    "..kcccccccccC..",
    "..kCCCCCCCCCCC.",
    "..kCCCCCCCCCC..",
    "..k............",
    "..k............",
    "..k............",
    "..k............",
    "..k............",
    "..k............",
    ".mmmmm.........",
    "mmmmmmm........",
  ],
  [
    "..a............",
    "..a............",
    "..kqqqqqqqC....",
    "..kccccccccC...",
    "..kcccccccccC..",
    "..kccccccccccC.",
    "..kccccccccccC.",
    "..kCCCCCCCCCC..",
    "..kCCCCCCCCC...",
    "..k............",
    "..k............",
    "..k............",
    "..k............",
    "..k............",
    "..k............",
    ".mmmmm.........",
    "mmmmmmm........",
  ],
]

// One sprite pixel is 1.5px
const PIXEL = 0.09375
const WEB_PIXEL = 0.0625

/** One <svg> holding every frame of a sprite. footer.scss decides which one is visible. */
function Pixels({
  frames,
  class: cls,
  pixel = PIXEL,
}: {
  frames: Sprite[]
  class: string
  pixel?: number
}) {
  const w = frames[0][0].length
  const h = frames[0].length
  return (
    <svg
      class={`pixels ${cls}`}
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: `${w * pixel}rem`, height: `${h * pixel}rem` }}
      shape-rendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {frames.map((rows, i) => (
        <g
          class={`frame n${frames.length} i${i}`}
          key={i}
          style={{ "--i": i, "--n": frames.length }}
        >
          {rows.flatMap((row, y) =>
            // merge horizontal runs of one colour into a single rect
            Array.from(row.matchAll(/([^.])\1*/g)).map((run) => (
              <rect class={`px-${run[1]}`} x={run.index} y={y} width={run[0].length} height={1} />
            )),
          )}
        </g>
      ))}
    </svg>
  )
}

export default ((opts?: Options) => {
  const Footer: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
    const year = new Date().getFullYear()
    const links = Object.entries(opts?.links ?? {})

    return (
      <footer class={`${displayClass ?? ""}`}>
        <div class="footer-scene" aria-hidden="true">
          {/* hover (or tap) any prop and it does a small trick (footerScene.inline.ts) */}
          <span class="prop prop-terminal" data-ms="4000">
            <Pixels frames={TERMINAL} class="sprite" />
            <Pixels frames={CODE} class="fx typing" />
            <Pixels frames={BSOD} class="fx bsod" />
            <Pixels frames={BOOT} class="fx boot" />
            <Pixels frames={BOOTBAR} class="fx bootbar" />
            <Pixels frames={WARN} class="warn" />
          </span>
          <span class="prop prop-lock" data-ms="3000">
            <Pixels frames={PADLOCK} class="sprite" />
            <Pixels frames={SPARK} class="spark s1" />
            <Pixels frames={SPARK} class="spark s2" />
            <Pixels frames={SPARK} class="spark s3" />
            <Pixels frames={SPARK} class="spark s4" />
          </span>
          {/* shoots a thread up, spins a web at its end, climbs into it, and drops back down */}
          <span class="prop prop-spider" data-ms="2900">
            <i class="web" />
            <Pixels frames={WEB} class="web-orb" pixel={WEB_PIXEL} />
            <Pixels frames={SPIDER} class="sprite" />
          </span>
          <span class="prop prop-flag" data-ms="2400">
            <Pixels frames={BURST} class="burst" />
            <Pixels frames={FLAG} class="sprite" />
          </span>
        </div>
        <p class="footer-meta">
          <span>
            © {year} {SITE.author.name}
          </span>
          <span aria-hidden="true">·</span>
          <a class="footer-link" href={SITE.license} rel="license">
            CC BY-NC 4.0
          </a>
        </p>
        <ul class="footer-links" aria-label="Elsewhere">
          {links.map(([text, link]) => {
            const icon = ICONS[text.toLowerCase()]
            return (
              <li>
                <a class="footer-link" href={link} target="_blank" rel="noopener noreferrer">
                  {icon && (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d={icon} />
                    </svg>
                  )}
                  <span>{text}</span>
                  <span class="footer-sr"> (opens in a new tab)</span>
                </a>
              </li>
            )
          })}
        </ul>
      </footer>
    )
  }

  Footer.css = style
  Footer.afterDOMLoaded = script
  return Footer
}) satisfies QuartzComponentConstructor
