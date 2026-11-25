import test from "node:test"
import assert from "node:assert/strict"
import {
  MAX_LEAD,
  MAX_ZOOM,
  MIN_ZOOM,
  atMaxZoom,
  atMinZoom,
  ZoomModel,
  anchoredScroll,
  centreOffset,
  clampZoom,
  easeToward,
  fitZoom,
  limitLead,
  maxZoomFor,
  MAX_SHRUNK_ZOOM,
  pointUnder,
  snapStop,
  wheelTarget,
} from "./zoom"

test("zoom is always kept inside its limits", () => {
  assert.equal(clampZoom(10), MAX_ZOOM)
  assert.equal(clampZoom(0.01), MIN_ZOOM)
  assert.equal(clampZoom(1.3), 1.3)
  assert.equal(wheelTarget(MAX_ZOOM, -500), MAX_ZOOM)
  assert.equal(wheelTarget(MIN_ZOOM, 500), MIN_ZOOM)
})

test("a diagram starts at natural size, or shrinks until the whole diagram fits its box", () => {
  assert.equal(fitZoom(900, 700), 1)
  assert.equal(fitZoom(700, 1000), 0.7)
  assert.equal(fitZoom(200, 2000), 0.1, "a narrow screen shrinks the diagram until it all fits")
  assert.equal(fitZoom(900, 700, 300, 600), 0.5, "a tall diagram is fitted to the height limit")
  assert.equal(fitZoom(350, 700, 500, 400), 0.5, "the tighter of width and height wins")
  assert.equal(fitZoom(0, 1000), 1, "a hidden box falls back to natural size")
})

test("scrolling up zooms in, scrolling down zooms out, and a notch is the same percentage anywhere", () => {
  assert(wheelTarget(1, -100) > 1)
  assert(wheelTarget(1, 100) < 1)
  const inAt1 = wheelTarget(1, -100) / 1
  const inAt2 = wheelTarget(1.2, -100) / 1.2
  assert(Math.abs(inAt1 - inAt2) < 1e-9)
  assert(Math.abs(wheelTarget(wheelTarget(1, -100), 100) - 1) < 1e-9, "zooming in then out returns")
})

test("one big wheel jump is limited, and line or page units are scaled to pixels", () => {
  assert.equal(wheelTarget(1, -100000), wheelTarget(1, -240))
  assert(Math.abs(wheelTarget(1, -3, 1) - wheelTarget(1, -99, 0)) < 1e-9)
  assert(wheelTarget(1, -1, 2) > wheelTarget(1, -1, 1))
})

test("the point under the pointer stays under the pointer through a zoom", () => {
  const viewport = 700
  const content = 1000
  for (const [from, to] of [
    [1, 1.8],
    [1, 0.5],
    [0.7, 2.2],
  ]) {
    const pointer = 240
    const scroll = 130
    const point = pointUnder(pointer, scroll, from, centreOffset(viewport, content, from))
    const next = anchoredScroll(point, pointer, to, centreOffset(viewport, content, to))
    const after = pointUnder(pointer, next, to, centreOffset(viewport, content, to))
    assert(Math.abs(after - point) < 1e-9, `moved when zooming ${from} to ${to}`)
  }
})

test("content smaller than its box is centred, larger content is not offset", () => {
  assert.equal(centreOffset(800, 400, 1), 200)
  assert.equal(centreOffset(800, 400, 0.5), 300)
  assert.equal(centreOffset(800, 1000, 1), 0)
})

test("easing approaches the target without overshooting and settles exactly", () => {
  let value = 1
  let previous = value
  for (let i = 0; i < 80; i++) {
    value = easeToward(value, 2, 16)
    assert(value >= previous && value <= 2, "monotonic, never past the target")
    previous = value
  }
  assert.equal(value, 2)
  assert.equal(easeToward(2, 1, 16) < 2, true)
})

test("easing covers the same share of the distance whatever the frame rate", () => {
  let fast = 1
  for (let i = 0; i < 12; i++) fast = easeToward(fast, 3, 10)
  const slow = easeToward(1, 3, 120)
  assert(Math.abs(fast - slow) < 1e-6)
})

/** Plays a series of wheel events (time in ms, deltaY) at 60fps and reports how the zoom behaved. */
function play(start: number, events: [number, number][], settleAfter = 1500) {
  const model = new ZoomModel(start)
  const frame = 16
  const last = events.at(-1)![0]
  let next = 0
  let maxLead = 0
  let maxSpeed = 0
  let restedAt: number | undefined
  let previous = start
  for (let t = 0; t <= last + settleAfter; t += frame) {
    while (next < events.length && events[next][0] <= t) model.push(events[next++][1])
    model.step(frame)
    // visually still: within 0.4% of where it is going
    const rested = Math.abs(model.shown / model.target - 1) < 0.004
    maxLead = Math.max(maxLead, Math.abs(Math.log(model.target / model.shown)))
    maxSpeed = Math.max(maxSpeed, Math.abs(Math.log(model.shown / previous)) / (frame / 1000))
    previous = model.shown
    if (t >= last && rested && restedAt === undefined) restedAt = t - last
  }
  return { model, maxLead, maxSpeed, tail: restedAt ?? Infinity }
}

const notches = (count: number, every: number): [number, number][] =>
  Array.from({ length: count }, (_, i) => [i * every, -100])

test("a single wheel notch is a small step that comes to rest quickly", () => {
  const { model, tail } = play(1, notches(1, 0))
  assert(Math.abs(model.shown / 1 - 1.15) < 0.01, `a notch is about 15%, got ${model.shown}`)
  assert(tail <= 260, `it settles within a quarter of a second, took ${tail}ms`)
})

test("spinning the wheel fast cannot run away, and stops almost as soon as the input does", () => {
  const { model, maxLead, tail } = play(0.8, notches(8, 30))
  assert(
    maxLead <= MAX_LEAD + 1e-9,
    `the target never got more than the lead limit ahead, got ${maxLead}`,
  )
  assert(
    tail <= 260,
    `it rests within about a quarter of a second of the last notch, took ${tail}ms`,
  )
  assert(model.shown > 0.8 * 1.15 * 1.15, "but it does still move a good way")
})

test("zooming never travels faster than a comfortable speed", () => {
  const { maxSpeed } = play(0.8, notches(14, 20))
  assert(
    maxSpeed < 4,
    `the very fastest it ever moves is about doubling in 0.17s, got ${maxSpeed.toFixed(2)}`,
  )
})

test("a trackpad pinch (many small events) is followed smoothly and rests quickly", () => {
  const pinch: [number, number][] = Array.from({ length: 40 }, (_, i) => [i * 8, -4])
  const { model, tail, maxLead } = play(0.8, pinch)
  assert(
    model.shown > 0.8 * 1.4 && model.shown < 0.8 * 1.7,
    `a deliberate pinch is worth about 1.6x, got ${model.shown / 0.8}x`,
  )
  assert(maxLead < MAX_LEAD)
  assert(tail <= 260)
})

test("the limit also holds when the zoom is pushed against its ends", () => {
  const model = new ZoomModel(MAX_ZOOM)
  for (let i = 0; i < 30; i++) model.push(-240)
  assert.equal(model.target, MAX_ZOOM)
  assert.equal(limitLead(1, 100), Math.exp(MAX_LEAD))
  assert.equal(limitLead(1, 0.0001), Math.exp(-MAX_LEAD))
})

test("a zoom that pauses close to 100% or fit settles onto it, and others are left alone", () => {
  assert.equal(snapStop(0.97, [1, 0.74]), 1)
  assert.equal(snapStop(1.03, [1, 0.74]), 1)
  assert.equal(snapStop(0.75, [1, 0.74]), 0.74)
  assert.equal(snapStop(0.9, [1, 0.74]), undefined)
  assert.equal(snapStop(1.5, [1, 0.74]), undefined)
})

test("a pinch and a wheel notch are tuned separately", () => {
  const notch = Math.log(wheelTarget(1, -100))
  const tiny = Math.log(wheelTarget(1, -4)) / 4
  assert(tiny > (notch / 100) * 1.8, "small events count for more, pixel for pixel")
  assert(
    Math.abs(Math.log(wheelTarget(1, -4)) + Math.log(wheelTarget(1, 4))) < 1e-12,
    "and are symmetric",
  )
})

test("the maximum is 150% and cannot be passed by any input", () => {
  assert.equal(MAX_ZOOM, 1.5)
  const model = new ZoomModel(1.4)
  for (let i = 0; i < 40; i++) {
    model.push(-240)
    model.step(16)
    assert(model.shown <= 1.5 + 1e-9 && model.target <= 1.5 + 1e-9, "never above 150%")
  }
  for (let i = 0; i < 80; i++) model.step(16)
  assert.equal(model.shown, 1.5)
  model.aim(3)
  assert.equal(model.target, 1.5, "buttons and keys are limited too")
})

test("the limits can be told apart from the zoom in between", () => {
  assert(atMaxZoom(1.5) && !atMaxZoom(1.49))
  assert(atMinZoom(MIN_ZOOM) && !atMinZoom(MIN_ZOOM + 0.01))
  assert(!atMaxZoom(1) && !atMinZoom(1))
})

test("100% is the fitted view, however far the diagram had to shrink to get there", () => {
  // a diagram 930 wide in a 715 box is drawn at 77% of its natural size, but its zoom reads 100%
  const fit = fitZoom(715, 930)
  assert(Math.abs(fit - 0.769) < 0.001)
  assert.equal(new ZoomModel(1).shown, 1, "it starts at 100%")
  const model = new ZoomModel(1.5, 1.5, maxZoomFor(fit))
  model.aim(1)
  assert.equal(model.target, 1, "the fit button goes back to 100%")
})

test("the highest zoom is 150% of the fitted view, or up to 200% for a diagram shrunk a long way", () => {
  assert.equal(maxZoomFor(1), 1.5)
  assert.equal(maxZoomFor(0.77), 1.5)
  assert(Math.abs(maxZoomFor(0.6) - 1 / 0.6) < 1e-9, "a shrunk diagram can reach natural size")
  assert.equal(maxZoomFor(0.3), 2, "on a phone the cap is 200%, even below natural size")
  assert.equal(maxZoomFor(0.05), MAX_SHRUNK_ZOOM)
  const model = new ZoomModel(1, 1, maxZoomFor(0.3))
  model.aim(10)
  assert.equal(model.target, 2)
  assert(atMaxZoom(maxZoomFor(0.3), maxZoomFor(0.3)))
  assert(!atMaxZoom(1.5, maxZoomFor(0.3)))
})
