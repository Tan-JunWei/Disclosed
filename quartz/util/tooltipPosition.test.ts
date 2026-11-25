import test from "node:test"
import assert from "node:assert/strict"
import { tooltipPosition } from "./tooltipPosition"

const viewport = { width: 1000, height: 800 }
const tip = { width: 100, height: 40 }

test("centres the tooltip above its anchor", () => {
  const anchor = { left: 400, top: 300, width: 50, height: 20 }
  assert.deepEqual(tooltipPosition(anchor, tip, viewport), { x: 375, y: 251, placement: "top" })
})

test("flips below when there is no room above", () => {
  const anchor = { left: 400, top: 20, width: 50, height: 20 }
  assert.deepEqual(tooltipPosition(anchor, tip, viewport), { x: 375, y: 49, placement: "bottom" })
})

test("stays above when neither side fits", () => {
  const anchor = { left: 400, top: 20, width: 50, height: 20 }
  const tall = { width: 100, height: 790 }
  assert.equal(tooltipPosition(anchor, tall, viewport).placement, "top")
})

test("keeps the padding from both sides of the viewport", () => {
  const nearLeft = { left: 0, top: 300, width: 10, height: 10 }
  assert.equal(tooltipPosition(nearLeft, tip, viewport).x, 8)
  const nearRight = { left: 995, top: 300, width: 5, height: 10 }
  assert.equal(tooltipPosition(nearRight, tip, viewport).x, 892)
})

test("a tooltip wider than the viewport keeps its left edge in view", () => {
  const anchor = { left: 400, top: 300, width: 50, height: 20 }
  assert.equal(tooltipPosition(anchor, { width: 1200, height: 40 }, viewport).x, 8)
})
