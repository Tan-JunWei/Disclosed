/**
 * Zoom is measured against the fitted view: 100% is the whole diagram fitted to its box, which is
 * also where it starts and where the fit button returns to. The diagram's own drawn size is a
 * different number (the fit scale, see fitZoom), so a wide diagram that has to be shrunk to fit
 * still reads 100%, not 77%.
 */
/** The fitted view already shows everything, so zooming out further only shrinks it into empty space. */
export const MIN_ZOOM = 0.7
/** The diagram normally zooms in no further than 150% of the fitted view (see maxZoomFor for phones). */
export const MAX_ZOOM = 1.5
/**
 * How the zoom feels. A wheel notch is a small, fixed step, the displayed zoom may never run far
 * ahead of the target (so it cannot coast on after the input stops), and a pause lets it settle
 * onto 100% or "fit" if it is already close.
 */
export const WHEEL_SENSITIVITY = 0.0014
/** Pinch gestures arrive as many tiny events, so they get a higher gain than a wheel notch. */
export const PINCH_SENSITIVITY = 0.003
/** The target may be at most this far (as a natural log, so 0.22 is about 1.25x) from what is shown. */
export const MAX_LEAD = 0.22
export const SETTLE_MS = 60
export const SNAP_WINDOW = 0.045
export const SNAP_DELAY_MS = 150

export const clampZoom = (zoom: number, max = MAX_ZOOM) => Math.min(max, Math.max(MIN_ZOOM, zoom))

/** A diagram shrunk a long way to fit (a phone) may zoom in further, but never past this. */
export const MAX_SHRUNK_ZOOM = 2

/**
 * The highest zoom for a diagram whose fitted view is drawn at `fit` of its natural size. It is
 * 150%, but a diagram shrunk so far that 150% would still be smaller than its natural size (on a
 * narrow screen) may go towards natural size, up to a hard cap of 200%.
 */
export const maxZoomFor = (fit: number) =>
  fit > 0 ? Math.min(MAX_SHRUNK_ZOOM, Math.max(MAX_ZOOM, 1 / fit)) : MAX_ZOOM

/** Whether a zoom is at one of its limits, so the matching button can say it is used up. */
export const atMaxZoom = (zoom: number, max = MAX_ZOOM) => zoom >= max - 0.0005
export const atMinZoom = (zoom: number) => zoom <= MIN_ZOOM + 0.0005

/**
 * The zoom a diagram starts at (its 100%): natural size if it fits, otherwise shrunk until the whole
 * diagram fits its box, however narrow the screen. The height limit is optional, for a box that
 * cannot grow taller than a fixed maximum.
 */
export function fitZoom(
  viewportWidth: number,
  contentWidth: number,
  maxHeight = Infinity,
  contentHeight = 0,
): number {
  if (!(viewportWidth > 0) || !(contentWidth > 0)) return 1
  const byHeight = maxHeight > 0 && contentHeight > 0 ? maxHeight / contentHeight : Infinity
  return Math.min(1, viewportWidth / contentWidth, byHeight)
}

/**
 * The zoom a wheel gesture asks for. The change is exponential in the wheel distance, so a notch is
 * always the same percentage whatever the current zoom, and the small steps of a trackpad pinch add
 * up smoothly. `deltaMode` is the WheelEvent one (0 pixels, 1 lines, 2 pages).
 */
export function wheelTarget(zoom: number, deltaY: number, deltaMode = 0, max = MAX_ZOOM): number {
  const pixels = deltaY * (deltaMode === 1 ? 33 : deltaMode === 2 ? 400 : 1)
  const limited = Math.max(-240, Math.min(240, pixels))
  // small events (a pinch) use the pinch gain, notch-sized ones the wheel gain, blended in between
  const blend = Math.min(1, Math.max(0, (Math.abs(limited) - 20) / 60))
  const gain = PINCH_SENSITIVITY + (WHEEL_SENSITIVITY - PINCH_SENSITIVITY) * blend
  return clampZoom(zoom * Math.exp(-limited * gain), max)
}

/**
 * Keeps a requested zoom within reach of the zoom that is currently shown. This is the resistance:
 * however fast the wheel spins, the display only ever has a short way left to travel, so it comes to
 * rest almost as soon as the input does.
 */
export function limitLead(shown: number, target: number, max = MAX_ZOOM): number {
  const lowest = shown * Math.exp(-MAX_LEAD)
  const highest = shown * Math.exp(MAX_LEAD)
  return clampZoom(Math.min(highest, Math.max(lowest, target)), max)
}

/** The stop (100%, the fitted view) a zoom is close enough to be pulled onto, if any. */
export function snapStop(zoom: number, stops: number[]): number | undefined {
  return stops.find((stop) => Math.abs(Math.log(zoom / stop)) < SNAP_WINDOW)
}

/** Space on each side when the content is smaller than its box and so is centred. */
export const centreOffset = (viewport: number, content: number, zoom: number) =>
  Math.max(0, (viewport - content * zoom) / 2)

/**
 * Scroll position that keeps one point of the diagram under the pointer while zooming: the point
 * (in diagram units) lands back at the same place in the box after the zoom changes.
 */
export const anchoredScroll = (
  point: number,
  pointer: number,
  zoom: number,
  offset: number,
): number => Math.max(0, point * zoom + offset - pointer)

/** The diagram point under a pointer position, for the current zoom and scroll. */
export const pointUnder = (pointer: number, scroll: number, zoom: number, offset: number) =>
  (scroll + pointer - offset) / zoom

/**
 * One frame of an exponential ease towards the target, independent of the frame rate (a slow frame
 * covers the same share of the remaining distance a fast one would over the same time).
 */
export function easeToward(
  current: number,
  target: number,
  elapsedMs: number,
  settleMs = SETTLE_MS,
) {
  const next = current + (target - current) * (1 - Math.exp(-elapsedMs / settleMs))
  return Math.abs(target - next) < 0.0008 ? target : next
}

/** The zoom state without any DOM, so how it behaves can be tested and tuned numerically. */
export class ZoomModel {
  constructor(
    public shown: number,
    public target = shown,
    public max = MAX_ZOOM,
  ) {}

  /** A wheel or pinch event. */
  push(deltaY: number, deltaMode = 0) {
    this.target = limitLead(
      this.shown,
      wheelTarget(this.target, deltaY, deltaMode, this.max),
      this.max,
    )
  }

  /** A button, a key or a snap: aim for a zoom directly. */
  aim(zoom: number) {
    this.target = clampZoom(zoom, this.max)
  }

  /** Advances by one frame and says whether it has come to rest. */
  step(elapsedMs: number): boolean {
    this.shown = easeToward(this.shown, this.target, elapsedMs)
    return this.shown === this.target
  }
}
