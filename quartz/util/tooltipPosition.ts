export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/**
 * Where to put a tooltip for `anchor`, in viewport coordinates: centred above it, or below it when
 * there is no room above, and kept at least `padding` away from the viewport's sides.
 */
export function tooltipPosition(
  anchor: Rect,
  tip: Size,
  viewport: Size,
  gap = 9,
  padding = 8,
): { x: number; y: number; placement: "top" | "bottom" } {
  const centred = anchor.left + anchor.width / 2 - tip.width / 2
  const maxX = viewport.width - padding - tip.width
  // a tooltip wider than the viewport keeps its left edge in view
  const x = Math.max(padding, Math.min(centred, maxX))

  const above = anchor.top - gap - tip.height
  const below = anchor.top + anchor.height + gap
  const fitsAbove = above >= padding
  const fitsBelow = below + tip.height <= viewport.height - padding
  // stay above unless only the space below fits it
  const placement = fitsAbove || !fitsBelow ? "top" : "bottom"
  return { x, y: placement === "top" ? above : below, placement }
}
