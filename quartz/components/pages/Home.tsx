import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import {
  buildPostEntries,
  computePostStats,
  findUnregisteredSections,
  Difficulty,
} from "../../util/posts"
import { SEVERITY_HUE, Severity, ratingOf } from "../../util/ratings"
import { SECTIONS, findSection } from "../../util/sections"
import { SITE } from "../../util/site"
import { lazyModuleSrc } from "../../util/resources"
import { tagColorVars } from "../../util/tagColor"
import { FullSlug, joinSegments, pathToRoot, resolveRelative } from "../../util/path"
import chalk from "chalk"
import style from "../styles/home.scss"
// @ts-ignore
import tooltipScript from "../scripts/chartTooltip.inline"
// @ts-ignore
import homeMotionScript from "../scripts/homeMotion.inline"
// @ts-ignore
import heroSceneScript from "../scripts/heroScene.inline"
// @ts-ignore
import heroCursorScript from "../scripts/heroCursor.inline"

/** One rung of a rating scale as the charts need it: its colour, its label and where it filters to. */
interface RatingLevel {
  key: string
  scheme: "difficulty" | "severity"
  level: string
  hue: Difficulty
  count: number
}

function ratingLevels(stats: ReturnType<typeof computePostStats>): RatingLevel[] {
  return [
    ...stats.difficultyCounts.map(({ difficulty, count }) => ({
      key: `difficulty:${difficulty}`,
      scheme: "difficulty" as const,
      level: difficulty,
      hue: difficulty,
      count,
    })),
    ...stats.severityCounts.map(({ severity, count }) => ({
      key: `severity:${severity}`,
      scheme: "severity" as const,
      level: severity,
      hue: SEVERITY_HUE[severity as Severity],
      count,
    })),
  ]
}

function pct(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100)
}

function KpiArrow() {
  return (
    <svg
      class="hd-kpi-arrow"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  )
}

// angleDeg=0 points right, -90 points up, positive angles sweep clockwise
function polarPoint(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function sectorPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  const [ox0, oy0] = polarPoint(cx, cy, rOuter, startDeg)
  const [ox1, oy1] = polarPoint(cx, cy, rOuter, endDeg)
  const [ix1, iy1] = polarPoint(cx, cy, rInner, endDeg)
  const [ix0, iy0] = polarPoint(cx, cy, rInner, startDeg)
  return [
    `M ${ox0} ${oy0}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${ox1} ${oy1}`,
    `L ${ix1} ${iy1}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${ix0} ${iy0}`,
    "Z",
  ].join(" ")
}

function DonutChart({
  data,
  total,
  exploreHref,
}: {
  data: RatingLevel[]
  total: number
  exploreHref: string
}) {
  const cx = 60
  const cy = 60
  const R = 44
  const STROKE = 26
  const rOuter = R + STROKE / 2
  const rInner = R - STROKE / 2
  // constant angular gap between segments so spacing reads as even regardless of segment size
  const GAP_DEG = 1.8

  let angle = -90
  const segments = data.map((level) => {
    const sweep = total > 0 ? (level.count / total) * 360 : 0
    const start = angle
    const end = angle + sweep
    angle = end
    return { ...level, start, end }
  })

  return (
    <div class="hd-ring-wrap">
      <svg viewBox="0 0 120 120" class="hd-ring" aria-hidden="true">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--lightgray)" stroke-width={STROKE} />
        {segments.map(({ key, scheme, level, hue, start, end }) => {
          const half = GAP_DEG / 2
          const a0 = start + half
          const a1 = Math.max(end - half, a0 + 0.05)
          const d = sectorPath(cx, cy, rInner, rOuter, a0, a1)

          return (
            <a
              key={key}
              class="hd-ring-segment"
              href={`${exploreHref}?${scheme}=${level}`}
              tabindex={-1}
              data-rating={key}
            >
              {/* the path is the exact hit area, so hovering can't spill into a neighboring segment */}
              <path
                class="hd-ring-arc"
                d={d}
                fill={`var(--diff-${hue})`}
                style={{ color: `var(--diff-${hue})` }}
              />
            </a>
          )
        })}
      </svg>
    </div>
  )
}

function RatingLegend({
  data,
  total,
  exploreHref,
}: {
  data: RatingLevel[]
  total: number
  exploreHref: string
}) {
  return (
    <ul class="hd-legend">
      {data.map(({ key, scheme, level, hue, count }) => (
        <li key={key}>
          <a href={`${exploreHref}?${scheme}=${level}`} data-rating={key}>
            <i class="hd-legend-dot" style={{ backgroundColor: `var(--diff-${hue})` }} />
            <span class="hd-legend-label">{level}</span>
            <span class="hd-legend-count" style={{ color: `var(--diff-${hue}-ink)` }}>
              {count} <span class="hd-legend-pct">({pct(count, total)}%)</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/** The newest posts as cards: a tinted category chip, the rating, the title and an excerpt. */
function LatestCard({
  entry,
  fromSlug,
}: {
  entry: ReturnType<typeof buildPostEntries>[number]
  fromSlug: FullSlug
}) {
  const rating = ratingOf(entry)
  return (
    <a
      class="hd-latest-card"
      data-hue={rating?.hue}
      style={tagColorVars(entry.categoryTag ?? entry.category)}
      href={resolveRelative(fromSlug, entry.slug)}
    >
      <div class="hd-latest-top">
        <span class="hd-latest-chip">{entry.category}</span>
        {rating && (
          <span class="hd-latest-rating" data-diff={rating.hue}>
            <i aria-hidden="true" />
            {rating.level}
          </span>
        )}
      </div>
      <h3 class="hd-latest-title">{entry.title}</h3>
      {entry.description && <p class="hd-latest-desc">{entry.description}</p>}
      <div class="hd-latest-foot">
        <span class="hd-latest-section">{entry.sectionLabel}</span>
        {entry.date && (
          <time dateTime={entry.date.toISOString()}>
            {entry.date.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </time>
        )}
      </div>
    </a>
  )
}

type RouteIcon = "flag" | "sword" | "bug" | "compass" | "lens"

/**
 * One drawn illustration per section: a soft accent-filled shape behind, crisp outline strokes in
 * front, and a small spark. They are 64px drawings, so they stay sharp at any size.
 */
function RouteArt({ icon }: { icon: RouteIcon }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.2",
    "stroke-linecap": "round" as const,
    "stroke-linejoin": "round" as const,
  }
  return (
    <svg class="lab-route-art" viewBox="0 0 64 64" aria-hidden="true">
      {icon === "flag" && (
        <g>
          <defs>
            <mask id="flag-code" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
              <rect width="64" height="64" fill="#fff" />
              <g
                fill="none"
                stroke="#000"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M29.5 18L26.5 21.5L29.5 25" />
                <path d="M36 17.5L33.5 25.5" />
                <path d="M37.8 18.5L40.8 21.5L37.8 24.5" />
              </g>
            </mask>
          </defs>
          <g transform="translate(32 32) scale(1.22) translate(-32 -32)">
            {/* ground: two clean half-ellipses and a baseline */}
            <path fill="currentColor" opacity=".3" d="M10 51A22 8 0 0 1 54 51Z" />
            <path fill="currentColor" d="M17 51A15 5.5 0 0 1 47 51Z" />
            <path {...stroke} stroke-width="2" d="M9 51.5H55" />
            {/* pole: one bar, with a pale strip along the lit side */}
            <rect x="21" y="12" width="3" height="39" rx="1.5" fill="currentColor" />
            <rect x="21" y="12" width="1.2" height="39" rx="0.6" fill="#fff" fill-opacity=".3" />
            <circle cx="22.5" cy="11.4" r="2.4" fill="currentColor" />
            {/* cloth: two exact halves, the upper one paler */}
            <g mask="url(#flag-code)">
              <path fill="currentColor" opacity=".62" d="M24 14H47L42 21.5H24Z" />
              <path fill="currentColor" d="M24 21.5H42L47 29H24Z" />
            </g>
          </g>
        </g>
      )}
      {icon === "sword" && (
        <g>
          <defs>
            {/* the sword leaves a clear gap where it crosses the shield: black strokes are the cut */}
            <mask id="sword-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
              <rect width="64" height="64" fill="#fff" />
              <g
                transform="rotate(30.8 32 32)"
                fill="#000"
                stroke="#000"
                stroke-width="4"
                stroke-linejoin="round"
              >
                <circle cx="32" cy="3.6" r="2.8" />
                <rect x="30.8" y="6" width="2.4" height="9" />
                <path d="M24.6 13.6H39.4V17.6H24.6Z" />
                <path d="M29.2 17.6H34.8L32 62.2Z" />
              </g>
            </mask>
          </defs>
          <defs>
            <clipPath id="shield-lit">
              <rect x="0" y="0" width="32" height="64" />
            </clipPath>
          </defs>
          <g mask="url(#sword-gap)">
            {/* the outline, its rim and its face are offsets of one shape, so every edge is parallel */}
            <path
              fill="currentColor"
              fill-rule="evenodd"
              opacity=".62"
              d="M32.00 5.00L54.50 12.50L54.50 30.00L54.48 31.11L54.42 32.21L54.32 33.28L54.17 34.34L53.99 35.37L53.77 36.38L53.51 37.38L53.22 38.36L52.88 39.31L52.51 40.25L52.11 41.17L51.67 42.07L51.19 42.96L50.68 43.83L50.14 44.68L49.56 45.51L48.95 46.33L48.31 47.12L47.64 47.91L46.94 48.68L46.21 49.43L45.44 50.16L44.65 50.89L43.83 51.59L42.99 52.28L42.11 52.96L41.21 53.62L40.28 54.27L39.33 54.91L38.35 55.53L37.35 56.14L36.33 56.74L35.28 57.32L34.21 57.89L33.11 58.45L32.00 59.00L30.89 58.45L29.79 57.89L28.72 57.32L27.67 56.74L26.65 56.14L25.65 55.53L24.67 54.91L23.72 54.27L22.79 53.62L21.89 52.96L21.01 52.28L20.17 51.59L19.35 50.89L18.56 50.16L17.79 49.43L17.06 48.68L16.36 47.91L15.69 47.12L15.05 46.33L14.44 45.51L13.86 44.68L13.32 43.83L12.81 42.96L12.33 42.07L11.89 41.17L11.49 40.25L11.12 39.31L10.78 38.36L10.49 37.38L10.23 36.38L10.01 35.37L9.83 34.34L9.68 33.28L9.58 32.21L9.52 31.11L9.50 30.00L9.50 12.50ZM32.00 8.58L51.10 14.95L51.10 29.97L51.08 30.99L51.03 31.95L50.94 32.89L50.81 33.81L50.65 34.71L50.46 35.60L50.24 36.46L49.98 37.30L49.69 38.13L49.37 38.94L49.02 39.74L48.64 40.52L48.23 41.29L47.78 42.05L47.31 42.79L46.80 43.52L46.26 44.25L45.69 44.96L45.10 45.65L44.47 46.34L43.81 47.02L43.12 47.69L42.40 48.34L41.65 48.99L40.87 49.62L40.06 50.25L39.23 50.86L38.36 51.47L37.47 52.06L36.56 52.65L35.61 53.22L34.65 53.78L33.65 54.34L32.63 54.88L31.59 55.41L32.00 55.21L32.41 55.41L31.37 54.88L30.35 54.34L29.35 53.78L28.39 53.22L27.44 52.65L26.53 52.06L25.64 51.47L24.77 50.86L23.94 50.25L23.13 49.62L22.35 48.99L21.60 48.34L20.88 47.69L20.19 47.02L19.53 46.34L18.90 45.65L18.31 44.96L17.74 44.25L17.20 43.52L16.69 42.79L16.22 42.05L15.77 41.29L15.36 40.52L14.98 39.74L14.63 38.94L14.31 38.13L14.02 37.30L13.76 36.46L13.54 35.60L13.35 34.71L13.19 33.81L13.06 32.89L12.97 31.95L12.92 30.99L12.90 29.97L12.90 14.95Z"
            />
            <path
              fill="currentColor"
              d="M32.00 11.96L47.90 17.26L47.90 29.94L47.88 30.87L47.84 31.71L47.76 32.53L47.65 33.32L47.51 34.10L47.35 34.85L47.16 35.59L46.94 36.31L46.69 37.02L46.42 37.71L46.12 38.39L45.79 39.06L45.44 39.72L45.05 40.38L44.64 41.02L44.20 41.66L43.73 42.29L43.23 42.91L42.70 43.53L42.14 44.14L41.55 44.75L40.93 45.35L40.27 45.95L39.59 46.54L38.88 47.12L38.13 47.69L37.36 48.26L36.56 48.83L35.73 49.38L34.87 49.93L33.98 50.47L33.06 51.00L32.12 51.53L31.15 52.04L30.16 52.55L32.00 51.65L33.84 52.55L32.85 52.04L31.88 51.53L30.94 51.00L30.02 50.47L29.13 49.93L28.27 49.38L27.44 48.83L26.64 48.26L25.87 47.69L25.12 47.12L24.41 46.54L23.73 45.95L23.07 45.35L22.45 44.75L21.86 44.14L21.30 43.53L20.77 42.91L20.27 42.29L19.80 41.66L19.36 41.02L18.95 40.38L18.56 39.72L18.21 39.06L17.88 38.39L17.58 37.71L17.31 37.02L17.06 36.31L16.84 35.59L16.65 34.85L16.49 34.10L16.35 33.32L16.24 32.53L16.16 31.71L16.12 30.87L16.10 29.94L16.10 17.26Z"
            />
            {/* light from the left: a pale wash over the left half only */}
            <g clip-path="url(#shield-lit)" fill="#fff" fill-opacity=".3">
              <path
                fill-rule="evenodd"
                d="M32.00 5.00L54.50 12.50L54.50 30.00L54.48 31.11L54.42 32.21L54.32 33.28L54.17 34.34L53.99 35.37L53.77 36.38L53.51 37.38L53.22 38.36L52.88 39.31L52.51 40.25L52.11 41.17L51.67 42.07L51.19 42.96L50.68 43.83L50.14 44.68L49.56 45.51L48.95 46.33L48.31 47.12L47.64 47.91L46.94 48.68L46.21 49.43L45.44 50.16L44.65 50.89L43.83 51.59L42.99 52.28L42.11 52.96L41.21 53.62L40.28 54.27L39.33 54.91L38.35 55.53L37.35 56.14L36.33 56.74L35.28 57.32L34.21 57.89L33.11 58.45L32.00 59.00L30.89 58.45L29.79 57.89L28.72 57.32L27.67 56.74L26.65 56.14L25.65 55.53L24.67 54.91L23.72 54.27L22.79 53.62L21.89 52.96L21.01 52.28L20.17 51.59L19.35 50.89L18.56 50.16L17.79 49.43L17.06 48.68L16.36 47.91L15.69 47.12L15.05 46.33L14.44 45.51L13.86 44.68L13.32 43.83L12.81 42.96L12.33 42.07L11.89 41.17L11.49 40.25L11.12 39.31L10.78 38.36L10.49 37.38L10.23 36.38L10.01 35.37L9.83 34.34L9.68 33.28L9.58 32.21L9.52 31.11L9.50 30.00L9.50 12.50ZM32.00 8.58L51.10 14.95L51.10 29.97L51.08 30.99L51.03 31.95L50.94 32.89L50.81 33.81L50.65 34.71L50.46 35.60L50.24 36.46L49.98 37.30L49.69 38.13L49.37 38.94L49.02 39.74L48.64 40.52L48.23 41.29L47.78 42.05L47.31 42.79L46.80 43.52L46.26 44.25L45.69 44.96L45.10 45.65L44.47 46.34L43.81 47.02L43.12 47.69L42.40 48.34L41.65 48.99L40.87 49.62L40.06 50.25L39.23 50.86L38.36 51.47L37.47 52.06L36.56 52.65L35.61 53.22L34.65 53.78L33.65 54.34L32.63 54.88L31.59 55.41L32.00 55.21L32.41 55.41L31.37 54.88L30.35 54.34L29.35 53.78L28.39 53.22L27.44 52.65L26.53 52.06L25.64 51.47L24.77 50.86L23.94 50.25L23.13 49.62L22.35 48.99L21.60 48.34L20.88 47.69L20.19 47.02L19.53 46.34L18.90 45.65L18.31 44.96L17.74 44.25L17.20 43.52L16.69 42.79L16.22 42.05L15.77 41.29L15.36 40.52L14.98 39.74L14.63 38.94L14.31 38.13L14.02 37.30L13.76 36.46L13.54 35.60L13.35 34.71L13.19 33.81L13.06 32.89L12.97 31.95L12.92 30.99L12.90 29.97L12.90 14.95Z"
              />
              <path d="M32.00 11.96L47.90 17.26L47.90 29.94L47.88 30.87L47.84 31.71L47.76 32.53L47.65 33.32L47.51 34.10L47.35 34.85L47.16 35.59L46.94 36.31L46.69 37.02L46.42 37.71L46.12 38.39L45.79 39.06L45.44 39.72L45.05 40.38L44.64 41.02L44.20 41.66L43.73 42.29L43.23 42.91L42.70 43.53L42.14 44.14L41.55 44.75L40.93 45.35L40.27 45.95L39.59 46.54L38.88 47.12L38.13 47.69L37.36 48.26L36.56 48.83L35.73 49.38L34.87 49.93L33.98 50.47L33.06 51.00L32.12 51.53L31.15 52.04L30.16 52.55L32.00 51.65L33.84 52.55L32.85 52.04L31.88 51.53L30.94 51.00L30.02 50.47L29.13 49.93L28.27 49.38L27.44 48.83L26.64 48.26L25.87 47.69L25.12 47.12L24.41 46.54L23.73 45.95L23.07 45.35L22.45 44.75L21.86 44.14L21.30 43.53L20.77 42.91L20.27 42.29L19.80 41.66L19.36 41.02L18.95 40.38L18.56 39.72L18.21 39.06L17.88 38.39L17.58 37.71L17.31 37.02L17.06 36.31L16.84 35.59L16.65 34.85L16.49 34.10L16.35 33.32L16.24 32.53L16.16 31.71L16.12 30.87L16.10 29.94L16.10 17.26Z" />
            </g>
          </g>
          <g transform="rotate(30.8 32 32)" fill="currentColor">
            <circle cx="32" cy="3.6" r="2.8" />
            <path opacity=".45" d="M32 0.8A2.8 2.8 0 0 0 32 6.4Z" />
            <rect x="30.8" y="6" width="2.4" height="8" />
            <path opacity=".6" d="M24.6 13.6H39.4V15.6H24.6Z" />
            <path d="M24.6 15.6H39.4V17.6H24.6Z" />
            <path opacity=".6" d="M29.2 17.6H32V62.2Z" />
            <path d="M32 17.6H34.8L32 62.2Z" />
          </g>
        </g>
      )}
      {icon === "bug" && (
        <g>
          <circle class="fill" cx="32" cy="32" r="27" />
          <g {...stroke} stroke-width="1.5">
            <circle cx="32" cy="32" r="27" />
            {/* crosshair arms centred on the ring, half inside and half outside */}
            <path stroke-width="2" d="M32 1v8M32 55v8M1 32h8M55 32h8" />
            {/* minor ticks on the diagonals */}
            <path
              stroke-width="1.5"
              opacity=".8"
              d="M11.5 11.5l3 3M52.5 11.5l-3 3M11.5 52.5l3-3M52.5 52.5l-3-3"
            />
          </g>
          <defs>
            {/* the circuit is cut out of the body: white keeps the shape, black strokes are the holes */}
            <mask id="bug-circuit" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
              <rect width="64" height="64" fill="#fff" />
              <g
                fill="none"
                stroke="#000"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="26.5" cy="32" r="2.1" />
                <path d="M26.5 34.1V40.5L29 43V56" />
                <circle cx="32" cy="38" r="2.1" />
                <path d="M32 40.1V56" />
                <circle cx="37.5" cy="32" r="2.1" />
                <path d="M37.5 34.1V40.5L35 43V56" />
              </g>
            </mask>
          </defs>
          <g
            transform="translate(32 32) scale(0.68) rotate(45) translate(-32 -32)"
            fill="currentColor"
          >
            <g
              fill="none"
              stroke="currentColor"
              stroke-width="2.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M29 12.5Q28.5 7.5 24 5M35 12.5Q35.5 7.5 40 5" />
              <path d="M22 28L15.5 26L12.5 20M22 35.5L14 35.5L10.5 41M23 43.5L17 46.5L16 53" />
              <path d="M42 28L48.5 26L51.5 20M42 35.5L50 35.5L53.5 41M41 43.5L47 46.5L48 53" />
            </g>
            <path d="M22.5 22A9.5 10 0 0 1 41.5 22Z" />
            <path
              mask="url(#bug-circuit)"
              d="M22 25H42V36C42 46.5 38 54 32 54C26 54 22 46.5 22 36Z"
            />
          </g>
        </g>
      )}
      {icon === "compass" && (
        <g>
          <defs>
            <linearGradient
              id="compass-hue"
              gradientUnits="userSpaceOnUse"
              x1="4"
              y1="4"
              x2="60"
              y2="60"
            >
              <stop offset="0" />
              <stop offset=".33" />
              <stop offset=".67" />
              <stop offset="1" />
            </linearGradient>
          </defs>
          <g transform="translate(32 32) scale(0.86) translate(-32 -32)">
            <circle class="fill" cx="32" cy="32" r="27" />
            <circle {...stroke} cx="32" cy="32" r="27" stroke-width="1.5" />
            <path
              {...stroke}
              stroke-width="1.4"
              opacity=".8"
              d="M42.75 13.38L44.25 10.78M50.62 21.25L53.22 19.75M50.62 42.75L53.22 44.25M42.75 50.62L44.25 53.22M21.25 50.62L19.75 53.22M13.38 42.75L10.78 44.25M13.38 21.25L10.78 19.75M21.25 13.38L19.75 10.78"
            />
            <path
              {...stroke}
              stroke-width="2.2"
              d="M52.50 32.00L57.00 32.00M32.00 52.50L32.00 57.00M11.50 32.00L7.00 32.00"
            />
            <defs>
              <mask
                id="compass-pivot"
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width="64"
                height="64"
              >
                <rect width="64" height="64" fill="#fff" />
                <circle cx="32" cy="32" r="2.4" fill="#000" />
              </mask>
            </defs>
            <g transform="rotate(40 32 32)" mask="url(#compass-pivot)" stroke-linejoin="round">
              <path fill="currentColor" d="M32 13L38.5 32H25.5Z" />
              <path
                class="fill strong"
                stroke="currentColor"
                stroke-width="1.8"
                d="M32 51L38.5 32H25.5Z"
              />
            </g>
          </g>
          <g
            fill="currentColor"
            font-size="7"
            font-weight="700"
            text-anchor="middle"
            dominant-baseline="central"
            style={{ fontFamily: "var(--headerFont)" }}
          >
            <text x="32" y="4.6">
              N
            </text>
            <text x="32" y="59.6">
              S
            </text>
            <text x="59.6" y="32">
              E
            </text>
            <text x="4.4" y="32">
              W
            </text>
          </g>
        </g>
      )}
      {icon === "lens" && (
        <g>
          <defs>
            {/* the lens and handle cut a clean gap out of the sheet behind them */}
            <mask id="lens-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
              <rect width="64" height="64" fill="#fff" />
              <circle cx="40" cy="38" r="13.6" fill="#000" />
              <path d="M49 47L57 55" stroke="#000" stroke-width="9.5" stroke-linecap="round" />
            </mask>
          </defs>
          {/* the evidence: a log sheet with one flagged line */}
          <g mask="url(#lens-gap)">
            <rect x="8" y="5" width="34" height="46" rx="4.5" fill="currentColor" opacity=".3" />
            <rect {...stroke} x="8" y="5" width="34" height="46" rx="4.5" stroke-width="2" />
            <g {...stroke} stroke-width="2.4" opacity=".7">
              <path d="M15 14H35M15 21H29M15 35H25M15 42H31" />
            </g>
            <path {...stroke} stroke-width="3.4" d="M15 28H35" />
          </g>
          {/* the lens: pale glass, a solid rim lit from the left, and a handle */}
          <circle cx="40" cy="38" r="10.5" fill="currentColor" opacity=".18" />
          <path {...stroke} stroke-width="2.6" d="M33.5 38H44" opacity=".85" />
          <circle cx="40" cy="38" r="10.5" fill="none" stroke="currentColor" stroke-width="3.4" />
          <path
            d="M33.2 33.4A8 8 0 0 1 37.4 30.4"
            fill="none"
            stroke="#fff"
            stroke-opacity=".45"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <path
            d="M48.2 46.2L56 54"
            stroke="currentColor"
            stroke-width="5.6"
            stroke-linecap="round"
          />
        </g>
      )}
    </svg>
  )
}

// the home page renders once per build, but a dev server rebuilds often, so warn once per build id
let lastWarnedBuild: string | undefined

const Home: QuartzComponent = (props: QuartzComponentProps) => {
  const { fileData, allFiles, cfg } = props
  if (props.ctx.buildId !== lastWarnedBuild) {
    lastWarnedBuild = props.ctx.buildId
    const folders = findUnregisteredSections(allFiles)
    if (folders.length > 0) {
      console.warn(
        chalk.yellow(
          `\nWarning: tagged pages under unregistered section folder(s): ${folders.join(", ")}. ` +
            `They are not counted in any chart until the folder is added to SECTIONS ` +
            `(quartz/util/sections.ts).`,
        ),
      )
    }
  }
  const entries = buildPostEntries(cfg, allFiles)
  const stats = computePostStats(entries)
  const levels = ratingLevels(stats)
  // hardest or most severe first
  const ratingPanels = [
    { title: "Difficulty Distribution", scheme: "difficulty" },
    { title: "Severity Distribution", scheme: "severity" },
  ]
    .map((panel) => {
      const own = levels.filter((level) => level.scheme === panel.scheme)
      return { ...panel, levels: [...own].reverse(), total: own.reduce((n, l) => n + l.count, 0) }
    })
    .filter((panel) => panel.levels.length > 0)
  const latest = entries
    .filter((entry) => entry.date)
    .sort((a, b) => b.date!.getTime() - a.date!.getTime())
    .slice(0, 6)
  const research = SECTIONS.find((section) => section.kind === "research")
  const featured = findSection(SITE.featuredSection)

  const exploreHref = resolveRelative(fileData.slug!, "Explore" as FullSlug)
  const tagsHref = resolveRelative(fileData.slug!, "tags/index" as FullSlug)

  const topCategories = (list: typeof entries) =>
    [
      ...list.reduce(
        (m, e) => m.set(e.category, (m.get(e.category) ?? 0) + 1),
        new Map<string, number>(),
      ),
    ]
      .sort((x, y) => y[1] - x[1])
      .map(([category]) => category)
  const sectionRoute = (section: (typeof SECTIONS)[number]) => {
    const inSection = entries.filter((entry) => entry.section === section.folder)
    const icon: RouteIcon = section.art ?? (section.kind === "research" ? "bug" : "sword")
    return {
      key: section.folder,
      icon,
      label: section.label,
      blurb: section.blurb,
      count: inSection.length,
      noun: inSection.length === 1 ? section.noun.one : section.noun.many,
      categories: topCategories(inSection),
      href: resolveRelative(fileData.slug!, section.landing),
      cta: "Open section",
      accent: icon,
    }
  }
  const listOf = (items: string[]) =>
    items.length < 2
      ? items.join("")
      : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
  // every CTF shares one card, which opens a page that routes to each of them
  const competitions = SECTIONS.filter((section) => section.competition)
  const competitionEntries = entries.filter((entry) =>
    competitions.some((section) => section.folder === entry.section),
  )
  const competitionRoute = {
    key: "ctf-writeups",
    icon: "flag" as RouteIcon,
    label: "CTF Writeups",
    blurb: `Writeups for the CTFs I have taken part in: ${listOf(competitions.map((section) => section.label))}.`,
    count: competitionEntries.length,
    noun: competitionEntries.length === 1 ? "writeup" : "writeups",
    categories: topCategories(competitionEntries),
    href: resolveRelative(fileData.slug!, "CTF-Writeups" as FullSlug),
    cta: "Open section",
    accent: "flag",
  }
  const routes = [
    ...SECTIONS.flatMap((section) => {
      if (!section.competition) return [sectionRoute(section)]
      return section === competitions[0] ? [competitionRoute] : []
    }),
    {
      key: "all",
      icon: "compass" as RouteIcon,
      label: "All writeups",
      blurb: "Search and filter everything by category, difficulty, severity or tag.",
      count: entries.length,
      noun: "posts",
      categories: topCategories(entries),
      href: exploreHref,
      cta: "Open Explore",
      accent: "compass",
    },
  ]

  const heroModule = lazyModuleSrc(fileData.slug!, props.ctx.buildId, "hero-scene")

  return (
    <div class="home-page popover-hint">
      <section class="lab-hero" aria-labelledby="lab-title">
        <div class="lab-hero-copy">
          <a
            class="lab-owner"
            href="https://www.linkedin.com/in/jun-wei-tan"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Jun Wei Tan on LinkedIn (opens in a new tab)"
          >
            <img
              class="lab-avatar"
              src={joinSegments(pathToRoot(fileData.slug!), "static/avatar.jpg")}
              width="40"
              height="40"
              alt=""
            />
            <span class="lab-owner-text">
              <span class="lab-owner-name">Jun Wei Tan</span>
              <span class="lab-owner-role">
                LinkedIn <span aria-hidden="true">↗</span>
              </span>
            </span>
          </a>
          <h1 id="lab-title">{cfg.pageTitle}</h1>
          <p class="lab-description">{SITE.description}</p>
          <div class="lab-hero-links">
            <a class="lab-explore" href={exploreHref}>
              Browse posts <KpiArrow />
            </a>
            {featured && (
              <a class="lab-created" href={resolveRelative(fileData.slug!, featured.landing)}>
                {featured.label}{" "}
                <span class="lab-created-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            )}
          </div>
        </div>
        <div class="lab-visual" aria-hidden="true">
          {/* fetched while the HTML is still parsing, instead of after the scripts have run */}
          <link rel="modulepreload" href={heroModule} />
          <canvas class="lab-canvas" data-module-src={heroModule} />
          <svg class="lab-scene-fallback" viewBox="0 0 260 260" fill="none">
            <g stroke="#9bc7ed" stroke-width="1.2" stroke-linejoin="round">
              <path d="M130 25C104 47 71 60 43 62c-8 89 18 141 87 173 69-32 95-84 87-173-28-2-61-15-87-37Z" />
              <path
                d="M130 45c-23 18-47 27-68 30-4 70 16 111 68 139 52-28 72-69 68-139-21-3-45-12-68-30Z"
                opacity=".55"
              />
              <path d="M102 120V99a28 28 0 0 1 56 0v21m-37 24h18m-9 0v15M96 120h68v61H96z" />
            </g>
          </svg>
        </div>
        <figure class="lab-motto">
          <blockquote lang="zh">书山有路勤为径，学海无涯苦作舟</blockquote>
          <figcaption lang="en">
            Diligence is the path through the insurmountable mountain of books, and hard work is the
            boat across the boundless sea of learning.
          </figcaption>
        </figure>
      </section>
      <section class="hd-dashboard" aria-label="Site statistics">
        <div class="hd-kpis">
          <a class="hd-kpi" href={exploreHref} data-tooltip="Browse every post">
            <KpiArrow />
            <span class="hd-kpi-num">{stats.total}</span>
            <span class="hd-kpi-label">Total posts</span>
          </a>
          <a class="hd-kpi" href={exploreHref} data-tooltip="Filter writeups by category">
            <KpiArrow />
            <span class="hd-kpi-num">{stats.categoriesTotal}</span>
            <span class="hd-kpi-label">Categories</span>
          </a>
          <a class="hd-kpi" href={tagsHref} data-tooltip="Browse every tag">
            <KpiArrow />
            <span class="hd-kpi-num">{stats.tagsTotal}</span>
            <span class="hd-kpi-label">Distinct tags</span>
          </a>
          {research && stats.cveTotal > 0 ? (
            <a
              class="hd-kpi"
              href={`${exploreHref}?section=${encodeURIComponent(research.folder)}`}
              data-tooltip="Browse the vulnerabilities I have reported"
            >
              <KpiArrow />
              <span class="hd-kpi-num">{stats.cveTotal}</span>
              <span class="hd-kpi-label">CVEs</span>
            </a>
          ) : (
            <a class="hd-kpi" href="#collections" data-tooltip="Jump to the sections">
              <KpiArrow />
              <span class="hd-kpi-num">{stats.sectionsTotal}</span>
              <span class="hd-kpi-label">Sections</span>
            </a>
          )}
        </div>

        <div class="hd-row hd-row-equal">
          {ratingPanels.map((panel) => (
            <div class="hd-panel" key={panel.scheme}>
              <h2 class="hd-panel-title">{panel.title}</h2>
              <div class="hd-diff-body">
                <DonutChart data={panel.levels} total={panel.total} exploreHref={exploreHref} />
                <RatingLegend data={panel.levels} total={panel.total} exploreHref={exploreHref} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <nav class="lab-archive" id="collections" aria-labelledby="lab-archive-title">
        <div class="lab-archive-heading">
          <h2 id="lab-archive-title">Collections</h2>
          <a href={exploreHref}>
            View all posts <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div class="lab-routes">
          {routes.map((route) => (
            <a class="lab-route" key={route.key} data-accent={route.accent} href={route.href}>
              <RouteArt icon={route.icon} />
              <div class="lab-route-stat">
                <span class="lab-route-num">{route.count}</span>
                <span class="lab-route-noun">{route.noun}</span>
              </div>
              <h3>{route.label}</h3>
              <p>{route.blurb}</p>
              {route.categories.length > 0 && (
                <ul class="lab-route-tags" aria-label="Main categories">
                  {route.categories.slice(0, 2).map((category) => (
                    <li key={category}>{category}</li>
                  ))}
                  {route.categories.length > 2 && (
                    <li class="lab-route-more">+{route.categories.length - 2}</li>
                  )}
                </ul>
              )}
              <span class="lab-route-cta">
                {route.cta} <span aria-hidden="true">→</span>
              </span>
            </a>
          ))}
        </div>
      </nav>

      {latest.length > 0 && (
        <section class="hd-latest hd-latest-home" aria-label="Latest writeups">
          <div class="lab-archive-heading">
            <h2>Latest writeups</h2>
            <a href={exploreHref}>
              View all <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div class="hd-latest-grid">
            {latest.map((entry) => (
              <LatestCard entry={entry} fromSlug={fileData.slug!} key={entry.slug} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

Home.css = style
Home.afterDOMLoaded = [tooltipScript, homeMotionScript, heroSceneScript, heroCursorScript]
  .map((script) => `;(function(){${script}})();`)
  .join("\n")
export default (() => Home) satisfies QuartzComponentConstructor
