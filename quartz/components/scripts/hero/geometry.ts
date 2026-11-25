import { BoxGeometry, EdgesGeometry } from "three"

type Point = [number, number, number]
export type Edge = [Point, Point] & {
  weight?: number
  channel?: number
  flow?: number
  span?: number
  /** Animation-only wire: drawn as a line but never sampled into particles or node markers. */
  anim?: boolean
}
export interface WireForm {
  name: string
  edges: Edge[]
  vertices: Float32Array
  lines: Float32Array
  cloud: Float32Array
}
const segment = (a: Point, b: Point): Edge => [a, b]
const line = (points: Point[]): Edge[] =>
  points.slice(1).map((point, i) => segment(points[i], point))
const loop = (points: Point[]): Edge[] => [
  ...line(points),
  segment(points[points.length - 1], points[0]),
]
/** Stroke hierarchy: bright outer silhouettes, quieter rear edges and fine hardware. */
function stroke(edges: Edge[], weight: number): Edge[] {
  return edges.map((edge) => Object.assign(edge, { weight }))
}
/** Continuous distance coordinates let light travel along real structural edges. */
function activity(edges: Edge[], channel: number): Edge[] {
  const lengths = edges.map(([a, b]) => Math.hypot(...a.map((v, i) => v - b[i])))
  const total = lengths.reduce((a, b) => a + b, 0)
  let offset = 0
  return edges.map((edge, i) => {
    Object.assign(edge, { channel, flow: offset / total, span: lengths[i] / total })
    offset += lengths[i]
    return edge
  })
}
/** Marks edges that only exist for an idle animation (see idlePosition in shaders.ts). */
function ghost(edges: Edge[]): Edge[] {
  return edges.map((edge) => Object.assign(edge, { anim: true }))
}
function copyStyle(edge: Edge) {
  return {
    weight: edge.weight,
    channel: edge.channel,
    flow: edge.flow,
    span: edge.span,
    anim: edge.anim,
  }
}
function chamfer(width: number, height: number, x = 0, y = 0, z = 0, bevel = 0.045): Point[] {
  const w = width / 2,
    h = height / 2,
    b = bevel
  return [
    [-w + b, -h],
    [w - b, -h],
    [w, -h + b],
    [w, h - b],
    [w - b, h],
    [-w + b, h],
    [-w, h - b],
    [-w, -h + b],
  ].map(([dx, dy]) => [x + dx, y + dy, z] as Point)
}
function bezier(a: Point, b: Point, c: Point, d: Point, steps = 16): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps,
      s = 1 - t
    return [0, 1, 2].map(
      (axis) =>
        s ** 3 * a[axis] + 3 * s * s * t * b[axis] + 3 * s * t * t * c[axis] + t ** 3 * d[axis],
    ) as Point
  })
}
function circle(rx: number, ry: number, cx = 0, cy = 0, z = 0, steps = 48): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a), z]
  })
}
function extrude(points: Point[], depth: number, joins = 6): Edge[] {
  const front = points.map(([x, y]) => [x, y, depth] as Point)
  const back = points.map(([x, y]) => [x, y, -depth] as Point)
  const edges = [...activity(stroke(loop(front), 1.15), 1), ...stroke(loop(back), 0.35)]
  for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / joins)))
    edges.push(...stroke([segment(front[i], back[i])], 0.65))
  return edges
}
function box(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
): Edge[] {
  const shape = new BoxGeometry(width, height, depth).translate(x, y, z)
  const geometry = new EdgesGeometry(shape)
  const p = geometry.getAttribute("position"),
    edges: Edge[] = []
  for (let i = 0; i < p.count; i += 2)
    edges.push([
      [p.getX(i), p.getY(i), p.getZ(i)],
      [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)],
    ])
  geometry.dispose()
  shape.dispose()
  return edges
}
function tilt(edges: Edge[], yaw = 0.28, pitch = 0.12): Edge[] {
  return edges.map((edge) =>
    Object.assign(
      edge.map(([x, y, z]) => {
        const x1 = x * Math.cos(yaw) + z * Math.sin(yaw)
        const z1 = z * Math.cos(yaw) - x * Math.sin(yaw)
        return [
          x1,
          y * Math.cos(pitch) - z1 * Math.sin(pitch),
          y * Math.sin(pitch) + z1 * Math.cos(pitch),
        ] as Point
      }) as Edge,
      copyStyle(edge),
    ),
  )
}
function lock(scale = 1, yOffset = 0, z = 0.24, embed = 0.16): Edge[] {
  const body = chamfer(0.66, 0.53, 0, -0.16, z, 0.055)
  const rear = body.map(([x, y]) => [x, y, z - 0.16] as Point)
  const shackle = (r: number, top: number) => [
    [-r, 0.105, z - 0.035] as Point,
    ...Array.from({ length: 33 }, (_, i) => {
      const a = Math.PI - (i / 32) * Math.PI
      return [Math.cos(a) * r, 0.27 + Math.sin(a) * top, z - 0.035] as Point
    }),
    [r, 0.105, z - 0.035] as Point,
  ]
  const edges = [
    ...stroke(loop(rear), 0.5),
    ...stroke(
      body.filter((_, i) => i % 2 === 0).map((point, i) => segment(point, rear[i * 2])),
      0.65,
    ),
    ...stroke(loop(body), 1.25),
    ...stroke(line(shackle(0.25, 0.29)), 1.05),
    ...stroke(line(shackle(0.17, 0.21)), 0.8),
    // Only the heel (right) leg stays seated in the body when the shackle pops up, so only that
    // leg continues down into it. It is hidden below the body's top face and revealed as the
    // shackle rises, while the toe (left) leg clears its hole and leaves a visible gap.
    ...ghost(
      stroke(
        [0.25, 0.17].map((r) =>
          segment([r, 0.105 - embed / scale, z - 0.035], [r, 0.105, z - 0.035]),
        ),
        0.9,
      ).map((edge) => Object.assign(edge, { channel: 17 })),
    ),
    // A proper keyhole cutout, including its tapered stem.
    ...activity(
      stroke(
        loop([
          ...Array.from({ length: 25 }, (_, i) => {
            const a = -Math.PI / 3 + ((i / 24) * Math.PI * 5) / 3
            return [Math.cos(a) * 0.064, -0.1 + Math.sin(a) * 0.068, z + 0.01] as Point
          }),
          [-0.045, -0.28, z + 0.01] as Point,
          [0.045, -0.28, z + 0.01] as Point,
        ]),
        0.65,
      ),
      2,
    ),
  ]
  return edges.map((edge) =>
    Object.assign(
      edge.map(([x, y, depth]) => [x * scale, y * scale + yOffset, depth] as Point) as Edge,
      copyStyle(edge),
    ),
  )
}
/**
 * A flat-bladed key with a thick oval bow, parked in front of the lock on the keyhole axis.
 * The idle animation flies it in along the axis, seats it, then turns it about that axis.
 */
function key(): Edge[] {
  const cy = -0.125,
    z0 = 1.0
  const P = (x: number, y: number, z: number): Point => [x, cy + y, z]
  // Blade profile as (height, depth along the axis). The lower edge carries the bitting.
  const profile: [number, number][] = [
    [0.05, 0.624],
    [0.05, 0.06],
    [0.03, 0.0],
    [-0.02, 0.0],
    [-0.02, 0.072],
    [-0.05, 0.072],
    [-0.05, 0.144],
    [-0.015, 0.144],
    [-0.015, 0.228],
    [-0.05, 0.228],
    [-0.05, 0.312],
    [-0.025, 0.312],
    [-0.025, 0.384],
    [-0.05, 0.384],
    [-0.05, 0.624],
  ]
  const blade = (x: number) => profile.map(([y, dz]) => P(x, y, z0 + dz))
  const stadium = (z: number): Point[] => {
    const a = 0.2,
      b = 0.08,
      steps = 10,
      points: Point[] = []
    for (let i = 0; i <= steps; i++) {
      const t = -Math.PI / 2 + (i / steps) * Math.PI
      points.push(P(a - b + b * Math.cos(t), b * Math.sin(t), z))
    }
    for (let i = 0; i <= steps; i++) {
      const t = Math.PI / 2 + (i / steps) * Math.PI
      points.push(P(-(a - b) + b * Math.cos(t), b * Math.sin(t), z))
    }
    return points
  }
  const bowBack = stadium(z0 + 0.66),
    bowFront = stadium(z0 + 0.7)
  const bow = [
    ...stroke(loop(bowFront), 1.0),
    ...stroke(loop(bowBack), 0.6),
    ...stroke(
      bowFront.filter((_, i) => i % 3 === 0).map((point, i) => segment(point, bowBack[i * 3])),
      0.5,
    ),
  ]
  const hole = (z: number) =>
    circle(0.03, 0.03, 0.12, cy, z, 16).map(([x, y, depth]) => [x, y, depth] as Point)
  const ring = [
    ...stroke(loop(hole(z0 + 0.7)), 0.55),
    ...stroke(loop(hole(z0 + 0.66)), 0.35),
    ...stroke(
      [0, 4, 8, 12].map((i) => segment(hole(z0 + 0.7)[i], hole(z0 + 0.66)[i])),
      0.3,
    ),
  ]
  const collar = (z: number) => chamfer(0.1, 0.16, 0, cy, z, 0.02)
  const neck = [
    ...stroke(loop(collar(z0 + 0.62)), 0.7),
    ...stroke(loop(collar(z0 + 0.66)), 0.7),
    ...stroke(
      [0, 2, 4, 6].map((i) => segment(collar(z0 + 0.62)[i], collar(z0 + 0.66)[i])),
      0.5,
    ),
  ]
  const faces = [-0.012, 0.012].map((x) => blade(x))
  const body = [
    ...faces.flatMap((face) => stroke(loop(face), 0.9)),
    ...stroke(
      [0, 1, 5, 9, 14].map((i) => segment(faces[0][i], faces[1][i])),
      0.55,
    ),
  ]
  return ghost(activity([...bow, ...ring, ...neck, ...body], 12))
}
function shield(): Edge[] {
  const contour = [
    ...bezier([0, 1.1, 0], [-0.3, 0.85, 0], [-0.65, 0.78, 0], [-0.88, 0.74, 0]),
    ...bezier([-0.88, 0.74, 0], [-0.98, -0.25, 0], [-0.68, -0.8, 0], [0, -1.12, 0]),
    ...bezier([0, -1.12, 0], [0.68, -0.8, 0], [0.98, -0.25, 0], [0.88, 0.74, 0]),
    ...bezier([0.88, 0.74, 0], [0.65, 0.78, 0], [0.3, 0.85, 0], [0, 1.1, 0]),
  ]
  return [
    ...extrude(contour, 0.15, 4),
    ...stroke(loop(contour.map(([x, y]) => [x * 0.86, y * 0.86, 0.17])), 0.65),
    ...stroke(
      [segment([0, 0.93, 0.17], [0, 0.65, 0.23]), segment([0, -0.64, 0.23], [0, -0.96, 0.17])],
      0.45,
    ),
    ...lock(1.15, -0.01, 0.3, 0.16),
    ...key(),
  ]
}
function servers(): Edge[] {
  const edges: Edge[] = []
  for (const y of [-0.66, 0, 0.66]) {
    const front = chamfer(1.62, 0.47, 0, y, 0.5, 0.055)
    const rear = front.map(([x, cy]) => [x, cy, -0.5] as Point)
    edges.push(...stroke(loop(front), 1.2), ...stroke(loop(rear), 0.38))
    for (const i of [0, 2, 4, 6]) edges.push(...stroke([segment(front[i], rear[i])], 0.9))
    // Recessed drive bay, ventilation grille, power button and status LEDs.
    edges.push(...stroke(loop(chamfer(0.71, 0.25, -0.29, y, 0.515, 0.025)), 0.65))
    for (let i = 0; i < 5; i++)
      edges.push(
        ...stroke(
          [segment([-0.55 + i * 0.105, y - 0.065, 0.52], [-0.55 + i * 0.105, y + 0.065, 0.52])],
          0.45,
        ).map((edge) => Object.assign(edge, { channel: 5 })),
      )
    edges.push(...activity(stroke(loop(circle(0.055, 0.055, 0.57, y, 0.52, 20)), 0.8), 3))
    for (const dy of [-0.065, 0.065])
      edges.push(
        ...activity(stroke(loop(chamfer(0.065, 0.04, 0.31, y + dy, 0.52, 0.008)), 0.65), 3),
      )
    for (const x of [-0.73, 0.73])
      edges.push(...stroke(loop(circle(0.018, 0.018, x, y - 0.135, 0.515, 12)), 0.4))
    // Rack ears with screw holes, so each unit reads as mounted hardware.
    for (const sx of [-1, 1])
      edges.push(
        ...stroke(loop(chamfer(0.09, 0.4, sx * 0.855, y, 0.5, 0.02)), 0.7),
        ...stroke(loop(circle(0.014, 0.014, sx * 0.855, y + 0.12, 0.51, 10)), 0.4),
        ...stroke(loop(circle(0.014, 0.014, sx * 0.855, y - 0.12, 0.51, 10)), 0.4),
      )
    // Top-panel seam makes the depth of each chassis legible.
    edges.push(...stroke([segment([-0.64, y + 0.239, 0.26], [0.64, y + 0.239, 0.26])], 0.4))
  }
  return tilt(edges, -0.26, -0.17)
}
function database(): Edge[] {
  const edges: Edge[] = []
  const R = 0.58,
    levels = [-0.6, -0.2, 0.2, 0.6]
  const ring = (r: number, y: number, steps = 56) =>
    circle(r, r, 0, 0, 0, steps).map(([x, z]) => [x, y, z] as Point)
  const polar = (r: number, a: number, y: number): Point => [r * Math.cos(a), y, r * Math.sin(a)]
  levels.forEach((y, index) => {
    // Platter: bright top rim, quiet underside, track ring, hub and rim ticks that make spin legible.
    edges.push(
      ...(index === 3
        ? activity(stroke(loop(ring(R, y)), 1.05), 1)
        : stroke(loop(ring(R, y)), 1.0)),
      ...stroke(loop(ring(R, y - 0.06)), 0.32),
      ...stroke(loop(ring(0.46, y)), 0.35),
      ...stroke(loop(ring(0.11, y)), 0.55),
      ...stroke(loop(ring(0.055, y)), 0.5),
    )
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      edges.push(...stroke([segment(polar(R, a, y), polar(R, a, y - 0.06))], 0.3))
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2,
        major = i % 5 === 0
      edges.push(
        ...stroke(
          [segment(polar(major ? 0.49 : 0.51, a, y), polar(0.555, a, y))],
          major ? 0.4 : 0.22,
        ),
      )
    }
    // Two data-track arcs per platter, phase-shifted so each platter looks distinct.
    for (const [r, start, span] of [
      [0.37, index * 1.3, 1.25],
      [0.29, index * 1.3 + 3.4, 1.0],
    ]) {
      edges.push(
        ...stroke(
          line(Array.from({ length: 14 }, (_, i) => polar(r, start + (i / 13) * span, y))),
          0.55,
        ),
      )
    }
  })
  // Spindle through every platter.
  edges.push(...stroke([segment([0, -0.8, 0], [0, 0.72, 0])], 0.3))
  // Read arm over the top platter. It pivots about a post outside the platter.
  const armY = 0.645,
    pivot: Point = [0.54, armY, -0.38],
    tip: Point = [0.08, armY, 0.06]
  const dx = tip[0] - pivot[0],
    dz = tip[2] - pivot[2],
    len = Math.hypot(dx, dz),
    nx = -dz / len,
    nz = dx / len
  const side = (k: number, from: number, to: number): Edge =>
    segment(
      [pivot[0] + dx * from + nx * k, armY, pivot[2] + dz * from + nz * k],
      [pivot[0] + dx * to + nx * k, armY, pivot[2] + dz * to + nz * k],
    )
  edges.push(
    ...stroke(
      [
        side(0.016, 0.08, 0.96),
        side(-0.016, 0.08, 0.96),
        side(0.016, 0.96, 1),
        side(-0.016, 0.96, 1),
      ],
      0.8,
    ),
    ...stroke(
      loop(
        circle(0.04, 0.04, 0, 0, 0, 20).map(
          ([x, z]) => [pivot[0] + x, armY, pivot[2] + z] as Point,
        ),
      ),
      0.7,
    ),
    ...stroke(
      loop([
        [tip[0] - 0.035, armY, tip[2] - 0.02],
        [tip[0] + 0.035, armY, tip[2] - 0.02],
        [tip[0] + 0.035, armY, tip[2] + 0.025],
        [tip[0] - 0.035, armY, tip[2] + 0.025],
      ]),
      0.8,
    ),
  )
  // Static cage: top ring, base, four posts and status lights on the base.
  edges.push(
    ...activity(stroke(loop(ring(0.7, 0.8, 72)), 0.75), 1),
    ...stroke(loop(ring(0.72, -0.85, 72)), 0.95),
    ...stroke(loop(ring(0.78, -0.9, 72)), 0.4),
  )
  // Classic cylinder cues, kept light: the two silhouette sides and three front-facing band arcs.
  for (const sx of [-1, 1])
    edges.push(...stroke([segment([sx * 0.7, -0.85, 0], [sx * 0.7, 0.8, 0])], 0.5))
  for (const y of [-0.4, 0, 0.4])
    edges.push(
      ...stroke(line(Array.from({ length: 25 }, (_, i) => polar(0.7, (i / 24) * Math.PI, y))), 0.4),
    )
  for (const x of [-0.3, -0.2, -0.1])
    edges.push(...activity(stroke(loop(circle(0.018, 0.018, x, -0.87, 0.71, 12)), 0.5), 3))
  return tilt(edges, 0, 0.18)
}
/**
 * A dotted globe with live attacks. The grid is the solid form. The limb ring, land dots, attack
 * arcs and impact rings are ghost wires, and the idle animation (see idlePosition) turns the globe
 * and flies the attacks between regions.
 */
const GLOBE_R = 0.95
const LAND_DOTS = [
  -82.0, -152.3, -82.0, -124.6, -82.0, -96.9, -82.0, -69.2, -82.0, -41.5, -82.0, -13.8, -82.0, 13.8,
  -82.0, 41.5, -82.0, 69.2, -82.0, 96.9, -82.0, 124.6, -82.0, 152.3, -78.0, -151.6, -78.0, -132.6,
  -78.0, -113.7, -78.0, -94.7, -78.0, -75.8, -78.0, -18.9, -78.0, 0.0, -78.0, 18.9, -78.0, 37.9,
  -78.0, 56.8, -78.0, 75.8, -78.0, 94.7, -78.0, 113.7, -78.0, 132.6, -78.0, 151.6, -74.0, -93.6,
  -74.0, -79.2, -74.0, -64.8, -74.0, -7.2, -74.0, 7.2, -74.0, 21.6, -74.0, 36.0, -74.0, 50.4, -74.0,
  64.8, -74.0, 79.2, -74.0, 93.6, -74.0, 108.0, -74.0, 122.4, -74.0, 136.8, -74.0, 151.2, -74.0,
  165.6, -70.0, -69.7, -70.0, 34.8, -70.0, 46.5, -70.0, 58.1, -70.0, 81.3, -70.0, 92.9, -70.0,
  104.5, -70.0, 116.1, -70.0, 127.7, -70.0, 139.4, -70.0, 151.0, -66.0, -63.2, -66.0, 53.5, -66.0,
  102.2, -54.0, -67.9, -50.0, -74.5, -50.0, -68.3, -46.0, -74.3, -46.0, -68.6, -42.0, -72.5, -42.0,
  -67.2, -42.0, 147.8, -38.0, -71.0, -38.0, -65.9, -38.0, -60.8, -38.0, 142.0, -38.0, 147.0, -38.0,
  177.5, -34.0, -69.6, -34.0, -64.8, -34.0, -60.0, -34.0, -55.2, -34.0, 21.6, -34.0, 117.6, -34.0,
  141.6, -34.0, 146.4, -34.0, 151.2, -30.0, -66.9, -30.0, -62.3, -30.0, -57.7, -30.0, -53.1, -30.0,
  20.8, -30.0, 25.4, -30.0, 30.0, -30.0, 117.7, -30.0, 122.3, -30.0, 126.9, -30.0, 131.5, -30.0,
  136.2, -30.0, 140.8, -30.0, 145.4, -30.0, 150.0, -26.0, -68.9, -26.0, -64.4, -26.0, -60.0, -26.0,
  -55.6, -26.0, -51.1, -26.0, 15.6, -26.0, 20.0, -26.0, 24.4, -26.0, 28.9, -26.0, 117.8, -26.0,
  122.2, -26.0, 126.7, -26.0, 131.1, -26.0, 135.6, -26.0, 140.0, -26.0, 144.4, -26.0, 148.9, -22.0,
  -69.4, -22.0, -65.1, -22.0, -60.7, -22.0, -56.4, -22.0, -52.0, -22.0, -47.7, -22.0, -43.4, -22.0,
  17.3, -22.0, 21.7, -22.0, 26.0, -22.0, 30.4, -22.0, 34.7, -22.0, 43.4, -22.0, 47.7, -22.0, 117.1,
  -22.0, 121.4, -22.0, 125.8, -22.0, 130.1, -22.0, 134.5, -22.0, 138.8, -22.0, 143.1, -22.0, 147.5,
  -18.0, -67.0, -18.0, -62.8, -18.0, -58.6, -18.0, -54.4, -18.0, -50.2, -18.0, -46.0, -18.0, -41.9,
  -18.0, 12.6, -18.0, 16.7, -18.0, 20.9, -18.0, 25.1, -18.0, 29.3, -18.0, 33.5, -18.0, 46.0, -18.0,
  125.6, -18.0, 129.8, -18.0, 134.0, -18.0, 138.1, -18.0, 142.3, -14.0, -74.5, -14.0, -70.3, -14.0,
  -66.2, -14.0, -62.1, -14.0, -57.9, -14.0, -53.8, -14.0, -49.7, -14.0, -45.5, -14.0, -41.4, -14.0,
  12.4, -14.0, 16.6, -14.0, 20.7, -14.0, 24.8, -14.0, 29.0, -14.0, 33.1, -14.0, 37.2, -14.0, 49.7,
  -14.0, 132.4, -10.0, -74.8, -10.0, -70.8, -10.0, -66.7, -10.0, -62.7, -10.0, -58.7, -10.0, -54.6,
  -10.0, -50.6, -10.0, -46.5, -10.0, -42.5, -10.0, -38.4, -10.0, 14.2, -10.0, 18.2, -10.0, 22.2,
  -10.0, 26.3, -10.0, 30.3, -10.0, 34.4, -10.0, 38.4, -6.0, -78.0, -6.0, -74.0, -6.0, -70.0, -6.0,
  -66.0, -6.0, -62.0, -6.0, -58.0, -6.0, -54.0, -6.0, -50.0, -6.0, -46.0, -6.0, -42.0, -6.0, -38.0,
  -6.0, 14.0, -6.0, 18.0, -6.0, 22.0, -6.0, 26.0, -6.0, 30.0, -6.0, 34.0, -6.0, 38.0, -6.0, 106.0,
  -6.0, 142.0, -6.0, 146.0, -6.0, 150.0, -2.0, -80.0, -2.0, -76.0, -2.0, -72.0, -2.0, -68.0, -2.0,
  -64.0, -2.0, -60.0, -2.0, -56.0, -2.0, -52.0, -2.0, -48.0, -2.0, 12.0, -2.0, 16.0, -2.0, 20.0,
  -2.0, 24.0, -2.0, 28.0, -2.0, 32.0, -2.0, 36.0, -2.0, 40.0, -2.0, 104.0, -2.0, 112.0, -2.0, 116.0,
  -2.0, 120.0, 2.0, -78.0, 2.0, -74.0, 2.0, -70.0, 2.0, -66.0, 2.0, -62.0, 2.0, -58.0, 2.0, -54.0,
  2.0, 10.0, 2.0, 14.0, 2.0, 18.0, 2.0, 22.0, 2.0, 26.0, 2.0, 30.0, 2.0, 34.0, 2.0, 38.0, 2.0, 42.0,
  2.0, 114.0, 6.0, -76.0, 6.0, -72.0, 6.0, -68.0, 6.0, -64.0, 6.0, -60.0, 6.0, -8.0, 6.0, -4.0, 6.0,
  0.0, 6.0, 8.0, 6.0, 12.0, 6.0, 16.0, 6.0, 20.0, 6.0, 24.0, 6.0, 28.0, 6.0, 32.0, 6.0, 36.0, 6.0,
  40.0, 6.0, 44.0, 6.0, 48.0, 10.0, -72.8, 10.0, -68.8, 10.0, -64.7, 10.0, -12.1, 10.0, -8.1, 10.0,
  -4.0, 10.0, 0.0, 10.0, 4.0, 10.0, 8.1, 10.0, 12.1, 10.0, 16.2, 10.0, 20.2, 10.0, 24.3, 10.0, 28.3,
  10.0, 32.4, 10.0, 36.4, 10.0, 40.4, 10.0, 44.5, 10.0, 48.5, 10.0, 76.9, 10.0, 105.2, 14.0, -89.0,
  14.0, -84.8, 14.0, -14.5, 14.0, -10.3, 14.0, -6.2, 14.0, -2.1, 14.0, 2.1, 14.0, 6.2, 14.0, 10.3,
  14.0, 14.5, 14.0, 18.6, 14.0, 22.8, 14.0, 26.9, 14.0, 31.0, 14.0, 35.2, 14.0, 39.3, 14.0, 43.4,
  14.0, 47.6, 14.0, 76.6, 14.0, 101.4, 14.0, 105.5, 14.0, 122.1, 18.0, -98.4, 18.0, -94.2, 18.0,
  -90.0, 18.0, -77.4, 18.0, -14.7, 18.0, -10.5, 18.0, -6.3, 18.0, -2.1, 18.0, 2.1, 18.0, 6.3, 18.0,
  10.5, 18.0, 14.7, 18.0, 18.8, 18.0, 23.0, 18.0, 27.2, 18.0, 31.4, 18.0, 35.6, 18.0, 44.0, 18.0,
  48.1, 18.0, 52.3, 18.0, 73.3, 18.0, 77.4, 18.0, 81.6, 18.0, 98.4, 18.0, 102.6, 22.0, -101.9, 22.0,
  -84.6, 22.0, -80.2, 22.0, -15.2, 22.0, -10.8, 22.0, -6.5, 22.0, -2.2, 22.0, 2.2, 22.0, 6.5, 22.0,
  10.8, 22.0, 15.2, 22.0, 19.5, 22.0, 23.9, 22.0, 28.2, 22.0, 32.5, 22.0, 41.2, 22.0, 45.5, 22.0,
  49.9, 22.0, 54.2, 22.0, 58.6, 22.0, 71.6, 22.0, 75.9, 22.0, 80.2, 22.0, 84.6, 22.0, 88.9, 22.0,
  93.3, 22.0, 97.6, 22.0, 101.9, 22.0, 106.3, 22.0, 110.6, 26.0, -106.7, 26.0, -102.2, 26.0, -97.8,
  26.0, -13.3, 26.0, -8.9, 26.0, -4.4, 26.0, 0.0, 26.0, 4.4, 26.0, 8.9, 26.0, 13.3, 26.0, 17.8,
  26.0, 22.2, 26.0, 26.7, 26.0, 31.1, 26.0, 40.0, 26.0, 44.4, 26.0, 48.9, 26.0, 57.8, 26.0, 62.2,
  26.0, 66.7, 26.0, 71.1, 26.0, 75.6, 26.0, 80.0, 26.0, 84.4, 26.0, 88.9, 26.0, 93.3, 26.0, 97.8,
  26.0, 102.2, 26.0, 106.7, 26.0, 111.1, 26.0, 115.6, 30.0, -115.4, 30.0, -110.8, 30.0, -106.2,
  30.0, -101.5, 30.0, -96.9, 30.0, -92.3, 30.0, -83.1, 30.0, -9.2, 30.0, -4.6, 30.0, 0.0, 30.0, 4.6,
  30.0, 9.2, 30.0, 13.8, 30.0, 18.5, 30.0, 23.1, 30.0, 27.7, 30.0, 32.3, 30.0, 36.9, 30.0, 41.5,
  30.0, 46.2, 30.0, 50.8, 30.0, 55.4, 30.0, 60.0, 30.0, 64.6, 30.0, 69.2, 30.0, 73.8, 30.0, 78.5,
  30.0, 83.1, 30.0, 87.7, 30.0, 92.3, 30.0, 96.9, 30.0, 101.5, 30.0, 106.2, 30.0, 110.8, 30.0,
  115.4, 30.0, 120.0, 34.0, -115.2, 34.0, -110.4, 34.0, -105.6, 34.0, -100.8, 34.0, -96.0, 34.0,
  -91.2, 34.0, -86.4, 34.0, -81.6, 34.0, -4.8, 34.0, 0.0, 34.0, 4.8, 34.0, 9.6, 34.0, 38.4, 34.0,
  43.2, 34.0, 48.0, 34.0, 52.8, 34.0, 57.6, 34.0, 62.4, 34.0, 67.2, 34.0, 72.0, 34.0, 76.8, 34.0,
  81.6, 34.0, 86.4, 34.0, 91.2, 34.0, 96.0, 34.0, 100.8, 34.0, 105.6, 34.0, 110.4, 34.0, 115.2,
  34.0, 120.0, 34.0, 134.4, 38.0, -119.2, 38.0, -114.1, 38.0, -109.0, 38.0, -103.9, 38.0, -98.9,
  38.0, -93.8, 38.0, -88.7, 38.0, -83.7, 38.0, -78.6, 38.0, -7.6, 38.0, -2.5, 38.0, 12.7, 38.0,
  22.8, 38.0, 27.9, 38.0, 33.0, 38.0, 38.0, 38.0, 43.1, 38.0, 48.2, 38.0, 58.3, 38.0, 63.4, 38.0,
  68.5, 38.0, 73.5, 38.0, 78.6, 38.0, 83.7, 38.0, 88.7, 38.0, 93.8, 38.0, 98.9, 38.0, 103.9, 38.0,
  109.0, 38.0, 114.1, 38.0, 139.4, 42.0, -123.6, 42.0, -118.2, 42.0, -112.8, 42.0, -107.5, 42.0,
  -102.1, 42.0, -96.7, 42.0, -91.3, 42.0, -86.0, 42.0, -80.6, 42.0, -75.2, 42.0, -5.4, 42.0, 0.0,
  42.0, 21.5, 42.0, 26.9, 42.0, 43.0, 42.0, 48.4, 42.0, 59.1, 42.0, 64.5, 42.0, 69.9, 42.0, 75.2,
  42.0, 80.6, 42.0, 86.0, 42.0, 91.3, 42.0, 96.7, 42.0, 102.1, 42.0, 107.5, 42.0, 112.8, 42.0,
  118.2, 42.0, 123.6, 42.0, 129.0, 46.0, -122.9, 46.0, -117.1, 46.0, -111.4, 46.0, -105.7, 46.0,
  -100.0, 46.0, -94.3, 46.0, -88.6, 46.0, -82.9, 46.0, -77.1, 46.0, -71.4, 46.0, -65.7, 46.0, -60.0,
  46.0, 2.9, 46.0, 8.6, 46.0, 14.3, 46.0, 20.0, 46.0, 25.7, 46.0, 42.9, 46.0, 48.6, 46.0, 54.3,
  46.0, 60.0, 46.0, 65.7, 46.0, 71.4, 46.0, 77.1, 46.0, 82.9, 46.0, 88.6, 46.0, 94.3, 46.0, 100.0,
  46.0, 105.7, 46.0, 111.4, 46.0, 117.1, 46.0, 122.9, 46.0, 128.6, 46.0, 134.3, 50.0, -127.2, 50.0,
  -121.0, 50.0, -114.8, 50.0, -108.6, 50.0, -102.4, 50.0, -96.2, 50.0, -90.0, 50.0, -83.8, 50.0,
  -77.6, 50.0, -71.4, 50.0, 3.1, 50.0, 9.3, 50.0, 15.5, 50.0, 21.7, 50.0, 27.9, 50.0, 34.1, 50.0,
  40.3, 50.0, 46.6, 50.0, 52.8, 50.0, 59.0, 50.0, 65.2, 50.0, 71.4, 50.0, 77.6, 50.0, 83.8, 50.0,
  90.0, 50.0, 96.2, 50.0, 102.4, 50.0, 108.6, 50.0, 114.8, 50.0, 121.0, 50.0, 127.2, 50.0, 133.4,
  50.0, 139.7, 54.0, -132.5, 54.0, -125.7, 54.0, -118.9, 54.0, -112.1, 54.0, -105.3, 54.0, -98.5,
  54.0, -91.7, 54.0, -84.9, 54.0, -78.1, 54.0, -71.3, 54.0, -64.5, 54.0, -57.7, 54.0, 10.2, 54.0,
  17.0, 54.0, 23.8, 54.0, 30.6, 54.0, 37.4, 54.0, 44.2, 54.0, 50.9, 54.0, 57.7, 54.0, 64.5, 54.0,
  71.3, 54.0, 78.1, 54.0, 84.9, 54.0, 91.7, 54.0, 98.5, 54.0, 105.3, 54.0, 112.1, 54.0, 118.9, 54.0,
  125.7, 54.0, 132.5, 54.0, 139.2, 54.0, 159.6, 58.0, -131.2, 58.0, -123.8, 58.0, -116.2, 58.0,
  -108.8, 58.0, -101.2, 58.0, -93.8, 58.0, -71.2, 58.0, -63.8, 58.0, -3.8, 58.0, 26.2, 58.0, 33.8,
  58.0, 41.2, 58.0, 48.8, 58.0, 56.2, 58.0, 63.8, 58.0, 71.2, 58.0, 78.8, 58.0, 86.2, 58.0, 93.8,
  58.0, 101.2, 58.0, 108.8, 58.0, 116.2, 58.0, 123.8, 58.0, 131.2, 58.0, 138.8, 58.0, 161.2, 62.0,
  -162.9, 62.0, -154.3, 62.0, -145.7, 62.0, -137.1, 62.0, -128.6, 62.0, -120.0, 62.0, -111.4, 62.0,
  -102.9, 62.0, -94.3, 62.0, -77.1, 62.0, -42.9, 62.0, 8.6, 62.0, 17.1, 62.0, 25.7, 62.0, 34.3,
  62.0, 42.9, 62.0, 51.4, 62.0, 60.0, 62.0, 68.6, 62.0, 77.1, 62.0, 85.7, 62.0, 94.3, 62.0, 102.9,
  62.0, 111.4, 62.0, 120.0, 62.0, 128.6, 62.0, 137.1, 62.0, 145.7, 62.0, 154.3, 62.0, 162.9, 62.0,
  171.4, 66.0, -77.8, 66.0, -58.4, 66.0, -29.2, 66.0, -9.7, 66.0, 0.0, 66.0, 9.7, 66.0, 38.9, 70.0,
  -156.8, 70.0, -145.2, 70.0, -110.3, 70.0, -75.5, 70.0, -52.3, 70.0, -40.6, 70.0, -29.0, 70.0,
  29.0, 70.0, 75.5, 70.0, 87.1, 70.0, 98.7, 70.0, 110.3, 70.0, 121.9, 70.0, 133.5, 70.0, 145.2,
  70.0, 156.8, 74.0, -43.2, 74.0, -28.8, 74.0, 57.6, 74.0, 100.8, 78.0, -85.3, 78.0, -66.3, 78.0,
  -47.4, 78.0, -28.4, 82.0, -83.1, 82.0, -55.4, 82.0, -27.7,
]
const ATTACKS: [[number, number], [number, number]][] = [
  [
    [-23.5, -46.6],
    [40.7, -74],
  ],
  [
    [4.7, -74.1],
    [40.4, -3.7],
  ],
  [
    [6.5, 3.4],
    [50.1, 8.7],
  ],
  [
    [55.7, 37.6],
    [43.7, -79.4],
  ],
  [
    [-26.2, 28],
    [51.5, -0.1],
  ],
  [
    [25.2, 55.3],
    [38.9, -77],
  ],
  [
    [28.6, 77.2],
    [6.5, 3.4],
  ],
  [
    [24.7, 46.7],
    [40.7, -74],
  ],
]
function onSphere(lat: number, lon: number, r = GLOBE_R): Point {
  const p = (lat * Math.PI) / 180,
    l = (lon * Math.PI) / 180
  return [r * Math.cos(p) * Math.sin(l), r * Math.sin(p), r * Math.cos(p) * Math.cos(l)]
}
const unit = ([x, y, z]: Point): Point => {
  const m = Math.hypot(x, y, z)
  return [x / m, y / m, z / m]
}
/** Great-circle arc lifted off the surface, higher for longer hops. */
function arcPoints(a: Point, b: Point, steps = 28): Point[] {
  const ua = unit(a),
    ub = unit(b)
  const omega = Math.acos(Math.min(1, Math.max(-1, ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2])))
  const lift = 0.1 + 0.3 * (omega / Math.PI)
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const w1 = Math.sin((1 - t) * omega) / Math.sin(omega),
      w2 = Math.sin(t * omega) / Math.sin(omega)
    const r = GLOBE_R + lift * Math.sin(Math.PI * t)
    return [0, 1, 2].map((k) => (ua[k] * w1 + ub[k] * w2) * r) as Point
  })
}
function impactRing(centre: Point, radius: number): Point[] {
  const d = unit(centre)
  const helper: Point = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const u = unit([
    d[1] * helper[2] - d[2] * helper[1],
    d[2] * helper[0] - d[0] * helper[2],
    d[0] * helper[1] - d[1] * helper[0],
  ])
  const v: Point = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]
  return Array.from({ length: 20 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2
    const q = unit(
      [0, 1, 2].map((k) => d[k] + radius * (u[k] * Math.cos(a) + v[k] * Math.sin(a))) as Point,
    )
    return q.map((value) => value * GLOBE_R * 1.006) as Point
  })
}
function globe(): Edge[] {
  const tag = (edges: Edge[], channel: number) =>
    edges.map((edge) => Object.assign(edge, { channel }))
  const edges: Edge[] = []
  for (const lat of [-60, -30, 0, 30, 60])
    edges.push(
      ...tag(
        stroke(
          loop(Array.from({ length: 72 }, (_, i) => onSphere(lat, (i / 72) * 360 - 180))),
          lat === 0 ? 0.45 : 0.3,
        ),
        22,
      ),
    )
  for (let lon = 0; lon < 360; lon += 30)
    edges.push(
      ...tag(
        stroke(line(Array.from({ length: 37 }, (_, i) => onSphere(-90 + i * 5, lon))), 0.22),
        22,
      ),
    )
  // Camera-facing limb ring, placed in view space by the edge shader.
  edges.push(...ghost(tag(stroke(loop(circle(GLOBE_R, GLOBE_R, 0, 0, 0, 96)), 0.9), 21)))
  for (let i = 0; i < LAND_DOTS.length; i += 2) {
    const lat = LAND_DOTS[i],
      lon = LAND_DOTS[i + 1],
      l = (lon * Math.PI) / 180
    const p = onSphere(lat, lon, GLOBE_R * 1.003)
    edges.push(
      ...ghost(
        tag(
          stroke(
            [segment(p, [p[0] + Math.cos(l) * 0.004, p[1], p[2] - Math.sin(l) * 0.004])],
            0.85,
          ),
          23,
        ),
      ),
    )
  }
  ATTACKS.forEach(([from, to], i) => {
    const a = onSphere(from[0], from[1]),
      b = onSphere(to[0], to[1])
    edges.push(...ghost(activity(stroke(line(arcPoints(a, b)), 1.1), 24 + i)))
    for (let k = 0; k < 3; k++)
      edges.push(
        ...ghost(activity(stroke(loop(impactRing(b, 0.035 + 0.035 * k)), 0.8), 32 + i * 3 + k)),
      )
  })
  return edges
}
function hexagon(): Edge[] {
  return extrude(
    Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 2 + (i * Math.PI) / 3
      return [Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0]
    }),
    0.1,
  )
}
/**
 * Language badges for the code object. Each is a mini hexagon with a logo inside, floating outside
 * the main hexagon. They are ghost wires: the idle animation draws them on one after another.
 */
const PYTHON_OUTLINES: [number, number][][] = [
  [
    [0.094, 0.492],
    [0.131, 0.484],
    [0.186, 0.461],
    [0.219, 0.433],
    [0.24, 0.393],
    [0.243, 0.146],
    [0.235, 0.097],
    [0.226, 0.077],
    [0.189, 0.038],
    [0.134, 0.017],
    [-0.135, 0.015],
    [-0.163, 0.013],
    [-0.209, -0.002],
    [-0.251, -0.041],
    [-0.27, -0.086],
    [-0.275, -0.12],
    [-0.275, -0.247],
    [-0.368, -0.247],
    [-0.402, -0.238],
    [-0.431, -0.22],
    [-0.461, -0.185],
    [-0.486, -0.13],
    [-0.5, -0.05],
    [-0.5, 0.052],
    [-0.493, 0.095],
    [-0.47, 0.161],
    [-0.455, 0.185],
    [-0.421, 0.217],
    [-0.372, 0.238],
    [0.001, 0.24],
    [0.001, 0.275],
    [-0.243, 0.275],
    [-0.242, 0.419],
    [-0.23, 0.443],
    [-0.207, 0.464],
    [-0.151, 0.486],
    [-0.071, 0.498],
    [0.049, 0.498],
  ],
  [
    [-0.169, 0.41],
    [-0.178, 0.396],
    [-0.182, 0.379],
    [-0.178, 0.362],
    [-0.169, 0.348],
    [-0.155, 0.339],
    [-0.138, 0.335],
    [-0.121, 0.339],
    [-0.107, 0.348],
    [-0.097, 0.362],
    [-0.094, 0.379],
    [-0.097, 0.396],
    [-0.107, 0.41],
    [-0.121, 0.419],
    [-0.138, 0.423],
    [-0.155, 0.419],
  ],
  [
    [0.377, 0.245],
    [0.416, 0.23],
    [0.446, 0.205],
    [0.474, 0.16],
    [0.495, 0.093],
    [0.503, -0.001],
    [0.5, -0.053],
    [0.483, -0.132],
    [0.455, -0.185],
    [0.438, -0.204],
    [0.403, -0.227],
    [0.358, -0.24],
    [-0.001, -0.24],
    [-0.001, -0.275],
    [0.243, -0.275],
    [0.244, -0.405],
    [0.237, -0.432],
    [0.207, -0.464],
    [0.127, -0.491],
    [0.004, -0.5],
    [-0.094, -0.492],
    [-0.131, -0.484],
    [-0.186, -0.461],
    [-0.219, -0.433],
    [-0.24, -0.393],
    [-0.242, -0.146],
    [-0.24, -0.12],
    [-0.226, -0.078],
    [-0.189, -0.039],
    [-0.134, -0.018],
    [0.135, -0.015],
    [0.163, -0.013],
    [0.209, 0.002],
    [0.251, 0.041],
    [0.27, 0.086],
    [0.275, 0.12],
    [0.275, 0.247],
    [0.368, 0.247],
  ],
  [
    [0.107, -0.348],
    [0.097, -0.362],
    [0.094, -0.379],
    [0.097, -0.396],
    [0.107, -0.41],
    [0.121, -0.42],
    [0.138, -0.423],
    [0.155, -0.42],
    [0.169, -0.41],
    [0.178, -0.396],
    [0.182, -0.379],
    [0.178, -0.362],
    [0.169, -0.348],
    [0.155, -0.339],
    [0.138, -0.335],
    [0.121, -0.339],
  ],
]
function logoLayers(front: Point[], dz: number, joins: number[], weight: number): Edge[] {
  const back = front.map(([x, y, z]) => [x, y, z - dz] as Point)
  return [
    ...stroke(loop(front), weight),
    ...stroke(loop(back), weight * 0.45),
    ...stroke(
      joins.map((i) => segment(front[i], back[i])),
      weight * 0.4,
    ),
  ]
}
/** The official Python mark: two interlocked snakes, traced from the real outline. */
function pythonLogo(): Edge[] {
  const z = 0.19
  const edges: Edge[] = []
  PYTHON_OUTLINES.forEach((outline, index) => {
    const points = outline.map(([x, y]) => [x, y, z] as Point)
    if (index % 2 === 0) {
      const joins = points.map((_, i) => i).filter((i) => i % 6 === 0)
      edges.push(...logoLayers(points, 0.04, joins, 1.0))
    } else edges.push(...stroke(loop(points), 0.8))
  })
  return edges
}
function javascriptLogo(): Edge[] {
  const z = 0.19
  const frame = chamfer(1.04, 1.04, 0, 0, z, 0.07)
  const J: Point[] = [
    [0.18, -0.05, z],
    [0.18, -0.27, z],
    [0.14, -0.36, z],
    [0.06, -0.39, z],
    [0.0, -0.32, z],
  ]
  const S: Point[] = [
    [0.4, -0.1, z],
    [0.36, -0.05, z],
    [0.29, -0.04, z],
    [0.23, -0.09, z],
    [0.24, -0.17, z],
    [0.31, -0.21, z],
    [0.38, -0.25, z],
    [0.41, -0.31, z],
    [0.37, -0.37, z],
    [0.3, -0.39, z],
    [0.22, -0.35, z],
  ]
  return [
    ...logoLayers(frame, 0.05, [0, 2, 4, 6], 1.0),
    ...stroke(line(J), 1.1),
    ...stroke(line(S), 1.1),
  ]
}
function phpLogo(): Edge[] {
  const z = 0.19
  const outer = circle(0.52, 0.3, 0, 0, z, 40)
  const letters: Edge[] = []
  const stem = (x: number, y0: number, y1: number) => stroke([segment([x, y0, z], [x, y1, z])], 1.1)
  for (const c of [-0.28, 0.28]) {
    letters.push(
      ...stem(c - 0.07, -0.13, 0.09),
      ...stroke(loop(circle(0.07, 0.065, c + 0.005, 0.025, z, 16)), 1.1),
    )
  }
  letters.push(
    ...stem(-0.07, -0.07, 0.16),
    ...stroke(
      line([
        ...bezier([-0.07, 0.04, z], [-0.07, 0.12, z], [0.07, 0.12, z], [0.07, 0.02, z], 12),
        [0.07, 0.02, z],
        [0.07, -0.07, z],
      ]),
      1.1,
    ),
  )
  return [
    ...logoLayers(outer, 0.05, [0, 10, 20, 30], 1.0),
    ...stroke(loop(circle(0.46, 0.25, 0, 0, z, 36)), 0.4),
    ...letters,
  ]
}
function badge(logo: Edge[], cx: number, cy: number, scale: number, channel: number): Edge[] {
  const r = 0.36
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 2 + (i * Math.PI) / 3
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.17] as Point
  })
  const placed = logo.map((edge) =>
    Object.assign(
      edge.map(([x, y, z]) => [cx + x * scale, cy + y * scale, z] as Point) as Edge,
      copyStyle(edge),
    ),
  )
  return ghost(activity([...logoLayers(hex, 0.05, [0, 1, 2, 3, 4, 5], 1.0), ...placed], channel))
}
function languageBadges(): Edge[] {
  return [
    ...badge(pythonLogo(), -1.64, 0, 0.45, 18),
    ...badge(javascriptLogo(), 1.64, 0.44, 0.42, 19),
    ...badge(phpLogo(), 1.64, -0.44, 0.52, 20),
  ]
}
function code(): Edge[] {
  const glyphs = [
    ...line([
      [-0.29, 0.28, 0.15],
      [-0.59, 0, 0.15],
      [-0.29, -0.28, 0.15],
    ]),
    segment([-0.08, -0.35, 0.15], [0.11, 0.35, 0.15]),
    ...line([
      [0.3, 0.28, 0.15],
      [0.59, 0, 0.15],
      [0.3, -0.28, 0.15],
    ]),
  ]
  return [
    ...hexagon(),
    ...activity(stroke(glyphs, 1.1), 6),
    ...activity(stroke([segment([0.72, -0.14, 0.17], [0.72, 0.14, 0.17])], 0.7), 8),
    ...stroke(
      line([
        [-0.25, -0.62, 0.15],
        [-0.06, -0.62, 0.15],
      ]),
      0.35,
    ),
    ...stroke(
      line([
        [0.03, -0.62, 0.15],
        [0.25, -0.62, 0.15],
      ]),
      0.35,
    ),
    // Two lines type themselves out beneath the glyph, caret at the head.
    ...ghost(activity(stroke([segment([-0.28, -0.46, 0.15], [0.22, -0.46, 0.15])], 0.5), 60)),
    ...ghost(activity(stroke([segment([-0.18, -0.54, 0.15], [0.1, -0.54, 0.15])], 0.5), 61)),
    ...languageBadges(),
  ]
}
function radar(): Edge[] {
  const edges: Edge[] = []
  for (const [r, weight] of [
    [0.23, 0.45],
    [0.48, 0.5],
    [0.74, 0.55],
    [1, 1.05],
    [1.075, 0.35],
  ])
    edges.push(...stroke(loop(circle(r, r, 0, 0, 0.09, 96)), weight))
  for (const axis of [0, Math.PI / 2]) {
    const x = Math.cos(axis) * 1.18,
      y = Math.sin(axis) * 1.18
    edges.push(...stroke([segment([-x, -y, 0.1], [x, y, 0.1])], 0.55))
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2,
      major = i % 4 === 0,
      inner = major ? 1.01 : 1.045
    edges.push(
      ...stroke(
        [
          segment(
            [Math.cos(a) * inner, Math.sin(a) * inner, 0.1],
            [Math.cos(a) * 1.105, Math.sin(a) * 1.105, 0.1],
          ),
        ],
        major ? 0.65 : 0.3,
      ),
    )
  }
  // Each return carries its own channel (100-102) so the shader can give it a colour.
  ;[
    [0.3, 0.48],
    [-0.5, -0.23],
    [0.55, -0.39],
  ].forEach(([x, y], i) => {
    const blip = [
      ...stroke(loop(circle(0.04, 0.04, x, y, 0.13, 20)), 0.8),
      ...stroke(loop(circle(0.09, 0.09, x, y, 0.12, 24)), 0.28),
    ]
    edges.push(...blip.map((edge) => Object.assign(edge, { channel: 100 + i })))
  })
  edges.push(...stroke(loop(circle(0.055, 0.055, 0, 0, 0.15, 24)), 1.15))
  return edges
}
/** Outer silhouette of a flame icon, traced from the reference artwork: height 1, centred, y up. */
const FLAME_OUTLINE: [number, number][] = [
  [0.0113, -0.4948],
  [0.0465, -0.4929],
  [0.0813, -0.4879],
  [0.1149, -0.4802],
  [0.1474, -0.4697],
  [0.1784, -0.4558],
  [0.2082, -0.4388],
  [0.2369, -0.4191],
  [0.2634, -0.3958],
  [0.2881, -0.3703],
  [0.31, -0.3426],
  [0.3297, -0.3139],
  [0.3471, -0.2843],
  [0.3626, -0.2539],
  [0.3762, -0.2227],
  [0.3875, -0.1906],
  [0.3963, -0.1574],
  [0.4013, -0.1226],
  [0.4033, -0.0867],
  [0.4013, -0.0507],
  [0.3963, -0.0159],
  [0.3864, 0.0168],
  [0.3731, 0.0481],
  [0.3563, 0.078],
  [0.3357, 0.1063],
  [0.3112, 0.1318],
  [0.2844, 0.1458],
  [0.2633, 0.1402],
  [0.2499, 0.1156],
  [0.2429, 0.0817],
  [0.233, 0.049],
  [0.2149, 0.0296],
  [0.1991, 0.033],
  [0.1899, 0.058],
  [0.1878, 0.0923],
  [0.1817, 0.1258],
  [0.17, 0.1578],
  [0.1563, 0.1889],
  [0.1425, 0.22],
  [0.1302, 0.2517],
  [0.1211, 0.2848],
  [0.1161, 0.3187],
  [0.1156, 0.3537],
  [0.1195, 0.388],
  [0.1265, 0.422],
  [0.1341, 0.4554],
  [0.1291, 0.4814],
  [0.1105, 0.4926],
  [0.0796, 0.4883],
  [0.0484, 0.4749],
  [0.018, 0.4594],
  [-0.0115, 0.4415],
  [-0.0404, 0.4225],
  [-0.0688, 0.4021],
  [-0.0962, 0.3795],
  [-0.1223, 0.3546],
  [-0.1462, 0.3277],
  [-0.1674, 0.2997],
  [-0.1862, 0.2706],
  [-0.2017, 0.2402],
  [-0.2146, 0.2087],
  [-0.2235, 0.1756],
  [-0.2287, 0.1409],
  [-0.2297, 0.1054],
  [-0.2277, 0.0694],
  [-0.2329, 0.0386],
  [-0.2474, 0.028],
  [-0.2662, 0.0401],
  [-0.2806, 0.0704],
  [-0.2923, 0.1015],
  [-0.3101, 0.1149],
  [-0.3317, 0.1077],
  [-0.3536, 0.0814],
  [-0.3705, 0.0516],
  [-0.3839, 0.0204],
  [-0.3944, -0.0121],
  [-0.4013, -0.0461],
  [-0.4053, -0.0812],
  [-0.4053, -0.1172],
  [-0.4023, -0.1528],
  [-0.3969, -0.1874],
  [-0.3888, -0.2209],
  [-0.3779, -0.2532],
  [-0.3634, -0.284],
  [-0.3465, -0.3138],
  [-0.3263, -0.3423],
  [-0.3035, -0.3696],
  [-0.2774, -0.3942],
  [-0.2496, -0.416],
  [-0.2206, -0.4348],
  [-0.1907, -0.4517],
  [-0.1598, -0.4658],
  [-0.1275, -0.4767],
  [-0.0939, -0.4846],
  [-0.0594, -0.4901],
  [-0.0242, -0.494],
]
/**
 * Where each intruder packet strikes the perimeter, as a fraction of a turn. All three fall between
 * two devices. Their timings live in `networkTimeline` in shaders.ts, which must agree.
 */
const NETWORK_STRIKES = [1 / 6, 1 / 2, 5 / 6]
const NETWORK_RING = 1.2

type Flat = [number, number]
type Device = { edges: Edge[]; w: number; h: number; led: [number, number, number] }
const FRONT = 0.034
const flat = (points: Flat[], z = FRONT): Point[] => points.map(([x, y]) => [x, y, z])
const outline2d = (points: Point[]): Flat[] => points.map(([x, y]) => [x, y])
/** A device body: bright front outline, faint back outline and a few depth joins, like extrude(). */
function slab(points: Flat[], joins: number[], depth = 0.03): Edge[] {
  const front = flat(points, depth),
    back = flat(points, -depth)
  return [
    ...stroke(loop(front), 0.95),
    ...stroke(loop(back), 0.3),
    ...joins.flatMap((k) => stroke([segment(front[k], back[k])], 0.5)),
  ]
}
const detail = (points: Flat[], weight = 0.45) => stroke(line(flat(points)), weight)
const ringAt = (r: number, x: number, y: number, weight = 0.45, steps = 14) =>
  stroke(loop(circle(r, r, x, y, FRONT, steps)), weight)

function serverDevice(): Device {
  return {
    edges: [
      ...slab(outline2d(chamfer(0.3, 0.2, 0, 0, 0, 0.025)), [0, 2, 4, 6]),
      ...detail(
        [
          [-0.15, 0],
          [0.15, 0],
        ],
        0.5,
      ),
      ...detail([
        [-0.115, 0.05],
        [-0.02, 0.05],
      ]),
      ...detail([
        [-0.115, -0.05],
        [-0.02, -0.05],
      ]),
      ...ringAt(0.014, 0.09, -0.05, 0.4),
    ],
    w: 0.15,
    h: 0.1,
    led: [0.09, 0.05, 0.016],
  }
}
function laptopDevice(): Device {
  return {
    edges: [
      ...slab(outline2d(chamfer(0.26, 0.16, 0, 0.035, 0, 0.02)), [0, 2, 4, 6]),
      ...stroke(loop(flat(outline2d(chamfer(0.22, 0.12, 0, 0.04, 0, 0.012)))), 0.4),
      ...slab(
        [
          [-0.13, -0.045],
          [0.13, -0.045],
          [0.165, -0.095],
          [-0.165, -0.095],
        ],
        [0, 1, 2, 3],
        0.02,
      ),
      ...detail(
        [
          [-0.1, -0.058],
          [0.1, -0.058],
        ],
        0.35,
      ),
    ],
    w: 0.165,
    h: 0.11,
    led: [0, -0.077, 0.012],
  }
}
function phoneDevice(): Device {
  return {
    edges: [
      ...slab(outline2d(chamfer(0.13, 0.24, 0, 0, 0, 0.03)), [0, 2, 4, 6]),
      ...stroke(loop(flat(outline2d(chamfer(0.106, 0.17, 0, 0.005, 0, 0.012)))), 0.4),
      ...detail(
        [
          [-0.02, 0.105],
          [0.02, 0.105],
        ],
        0.4,
      ),
    ],
    w: 0.065,
    h: 0.12,
    led: [0, -0.1, 0.012],
  }
}
function monitorDevice(): Device {
  return {
    edges: [
      ...slab(outline2d(chamfer(0.28, 0.17, 0, 0.035, 0, 0.02)), [0, 2, 4, 6]),
      ...stroke(loop(flat(outline2d(chamfer(0.25, 0.12, 0, 0.05, 0, 0.012)))), 0.4),
      ...detail(
        [
          [-0.015, -0.05],
          [-0.02, -0.1],
        ],
        0.55,
      ),
      ...detail(
        [
          [0.015, -0.05],
          [0.02, -0.1],
        ],
        0.55,
      ),
      ...detail(
        [
          [-0.07, -0.1],
          [0.07, -0.1],
        ],
        0.6,
      ),
    ],
    w: 0.14,
    h: 0.11,
    led: [0, -0.03, 0.013],
  }
}
function routerDevice(): Device {
  return {
    edges: [
      ...slab(outline2d(chamfer(0.28, 0.09, 0, -0.03, 0, 0.02)), [0, 2, 4, 6]),
      ...detail(
        [
          [-0.1, 0.015],
          [-0.125, 0.115],
        ],
        0.6,
      ),
      ...detail(
        [
          [0.1, 0.015],
          [0.125, 0.115],
        ],
        0.6,
      ),
      ...ringAt(0.01, -0.125, 0.115, 0.45, 10),
      ...ringAt(0.01, 0.125, 0.115, 0.45, 10),
      ...detail(
        [
          [-0.1, -0.03],
          [-0.075, -0.03],
        ],
        0.45,
      ),
      ...detail(
        [
          [-0.055, -0.03],
          [-0.03, -0.03],
        ],
        0.45,
      ),
    ],
    w: 0.14,
    h: 0.1,
    led: [0.09, -0.03, 0.014],
  }
}
function cameraDevice(): Device {
  // A ceiling dome camera: mounting plate, dome and lens. The lens centre is its recording light.
  const dome: Flat[] = Array.from({ length: 13 }, (_, i) => {
    const a = Math.PI + (i / 12) * Math.PI
    return [Math.cos(a) * 0.11, 0.0575 + Math.sin(a) * 0.12]
  })
  return {
    edges: [
      ...slab(outline2d(chamfer(0.26, 0.035, 0, 0.075, 0, 0.012)), [0, 2, 4, 6]),
      ...slab(dome, [0, 6, 12], 0.025),
      ...ringAt(0.042, 0, -0.012, 0.6, 18),
    ],
    w: 0.13,
    h: 0.1,
    led: [0, -0.012, 0.016],
  }
}

/** First point where a ray from the origin leaves a closed outline. */
function rayExit(points: Flat[], dx: number, dy: number): Flat {
  let best = Infinity
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i],
      [bx, by] = points[(i + 1) % points.length]
    const ex = bx - ax,
      ey = by - ay
    const denom = dx * ey - dy * ex
    if (Math.abs(denom) < 1e-9) continue
    const t = (ax * ey - ay * ex) / denom,
      u = (ax * dy - ay * dx) / denom
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t)
  }
  return [dx * best, dy * best]
}

function network(): Edge[] {
  // A protected network: a firewall at the centre, different devices around it, all inside a
  // segmented perimeter. Everything is laid out flat and tilted once at the end, so every part
  // shares one viewpoint.
  const edges: Edge[] = []
  const tag = (list: Edge[], channel: number, flow = 0) =>
    list.map((edge) => Object.assign(edge, { channel, flow, span: 0 }))

  // Firewall: the flame outline, extruded like the shield, carrying a shield-and-check emblem.
  const FLAME_SCALE = 0.9,
    FLAME_DEPTH = 0.08
  const flame: Flat[] = FLAME_OUTLINE.map(([x, y]) => [x * FLAME_SCALE, y * FLAME_SCALE])
  const flameFront = flat(flame, FLAME_DEPTH),
    flameBack = flat(flame, -FLAME_DEPTH)
  edges.push(...activity(stroke(loop(flameFront), 1.15), 108))
  edges.push(...tag(stroke(loop(flameBack), 0.35), 108, 0))
  for (let i = 0; i < flame.length; i += 16)
    edges.push(...tag(stroke([segment(flameFront[i], flameBack[i])], 0.6), 108, 0))
  const ez = FLAME_DEPTH + 0.01
  const emblem = [
    ...bezier([0, 0.2, 0], [-0.05, 0.17, 0], [-0.11, 0.165, 0], [-0.15, 0.155, 0], 6),
    ...bezier([-0.15, 0.155, 0], [-0.16, -0.05, 0], [-0.11, -0.15, 0], [0, -0.2, 0], 8),
    ...bezier([0, -0.2, 0], [0.11, -0.15, 0], [0.16, -0.05, 0], [0.15, 0.155, 0], 8),
    ...bezier([0.15, 0.155, 0], [0.11, 0.165, 0], [0.05, 0.17, 0], [0, 0.2, 0], 6),
  ].map(([x, y]) => [x * 0.78, y * 0.78 - 0.11, ez] as Point)
  edges.push(...tag(stroke(loop(emblem), 0.9), 106, 0))
  const check = ([x, y]: Flat): Point => [x * 0.78, y * 0.78 - 0.11, ez + 0.002]
  // The check has its own channel and runs 0..1 along its stroke, so it can turn green from one
  // end to the other each time a packet is blocked.
  edges.push(
    ...activity(
      stroke(line([check([-0.065, 0]), check([-0.018, -0.05]), check([0.07, 0.065])]), 0.85),
      105,
    ),
  )

  // Devices: a different one at each position, each with a status light, linked to the firewall.
  const devices = [
    serverDevice,
    laptopDevice,
    routerDevice,
    monitorDevice,
    phoneDevice,
    cameraDevice,
  ]
  const NODE_R = 0.9
  devices.forEach((make, i) => {
    const a = Math.PI / 2 + (i / 6) * Math.PI * 2
    const dx = Math.cos(a),
      dy = Math.sin(a)
    const cx = dx * NODE_R,
      cy = dy * NODE_R
    const device = make()
    const move = ([x, y, z]: Point): Point => [x + cx, y + cy, z]
    edges.push(
      ...device.edges.map((edge) =>
        Object.assign(segment(move(edge[0]), move(edge[1])), copyStyle(edge)),
      ),
    )
    const [lx, ly, lr] = device.led
    edges.push(
      ...tag(stroke(loop(circle(lr, lr, cx + lx, cy + ly, FRONT + 0.004, 12)), 0.8), 103, i / 6),
    )
    // The spoke runs from the device's inner edge to the flame, so packets head inwards.
    const reach = Math.min(
      device.w / Math.max(Math.abs(dx), 1e-3),
      device.h / Math.max(Math.abs(dy), 1e-3),
    )
    const [fx, fy] = rayExit(flame, dx, dy)
    const sx = cx - dx * reach,
      sy = cy - dy * reach
    edges.push(...tag(stroke([segment([sx, sy, 0], [fx, fy, 0])], 0.55), 107, i / 6))
    // Traffic: an animation-only packet that shuttles along the spoke, a request in and a reply out.
    // It is built at the device end. The length it travels is stored in its z (hundredths, so it
    // stays invisible) and the shader slides it along the spoke.
    const travel = Math.hypot(sx, sy) - Math.hypot(fx, fy)
    const at = (along: number, across: number): Point => [
      sx - dx * along - dy * across,
      sy - dy * along + dx * across,
      travel * 0.01,
    ]
    edges.push(
      ...tag(
        ghost(stroke(loop([at(-0.026, 0), at(0, 0.017), at(0.026, 0), at(0, -0.017)]), 0.7)),
        116,
        i / 6,
      ),
    )
  })

  // Inspection rings around the firewall: three arcs that turn slowly and spin up when a threat
  // comes in, inside a finer ring of ticks turning the other way. Animation-only.
  const HUD_R = 0.6
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2
    const arc = Array.from({ length: 13 }, (_, j) => {
      const a = a0 + (j / 12) * Math.PI * 0.42
      return [Math.cos(a) * HUD_R, Math.sin(a) * HUD_R, 0] as Point
    })
    edges.push(...tag(ghost(stroke(line(arc), 0.6)), 117, 0))
  }
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2,
      long = k % 3 === 0
    const r0 = HUD_R - 0.045,
      r1 = r0 - (long ? 0.035 : 0.018)
    edges.push(
      ...tag(
        ghost(
          stroke(
            [
              segment(
                [Math.cos(a) * r0, Math.sin(a) * r0, 0],
                [Math.cos(a) * r1, Math.sin(a) * r1, 0],
              ),
            ],
            long ? 0.45 : 0.35,
          ),
        ),
        117,
        1,
      ),
    )
  }

  // Perimeter: a segmented boundary. Each dash knows its angle, so a strike can find it.
  const DASHES = 30
  for (let d = 0; d < DASHES; d++) {
    const a0 = (d / DASHES) * Math.PI * 2,
      a1 = a0 + (0.62 * Math.PI * 2) / DASHES
    const arc = Array.from({ length: 4 }, (_, k) => {
      const a = a0 + ((a1 - a0) * k) / 3
      return [Math.cos(a) * NETWORK_RING, Math.sin(a) * NETWORK_RING, 0] as Point
    })
    edges.push(...tag(stroke(line(arc), 0.55), 104, (a0 + a1) / 2 / (Math.PI * 2)))
  }

  // Intruders: animation-only amber packets that run at the perimeter and burn up on it. Each has
  // its own ash: tiny flakes hidden until the strike. A flake's index is stored in its z (a few
  // thousandths, invisible) so the shader can scatter each flake as one rigid piece.
  NETWORK_STRIKES.forEach((turn, k) => {
    const ia = turn * Math.PI * 2
    const ix = Math.cos(ia),
      iy = Math.sin(ia)
    const at = (along: number, across: number, z = 0): Point => [
      ix * (NETWORK_RING + 0.085 + along) - iy * across,
      iy * (NETWORK_RING + 0.085 + along) + ix * across,
      z,
    ]
    edges.push(
      ...tag(
        ghost(
          stroke(
            [
              ...loop([at(-0.05, 0), at(0, 0.04), at(0.05, 0), at(0, -0.04)]),
              segment(at(0.07, 0), at(0.2, 0)),
              segment(at(0.08, 0.025), at(0.15, 0.025)),
              segment(at(0.08, -0.025), at(0.15, -0.025)),
            ],
            0.85,
          ),
        ),
        110 + k,
      ),
    )
    const FLAKES = 16
    for (let j = 0; j < FLAKES; j++) {
      const h1 = ((Math.imul(j + 31 * k + 7, 2654435761) >>> 0) % 1000) / 1000
      const h2 = ((Math.imul(j + 17 * k + 3, 2246822519) >>> 0) % 1000) / 1000
      // spread over the packet's body and the start of its tail
      const along = -0.05 + 0.17 * h1,
        across = (h2 - 0.5) * 0.08
      const spin = h1 * 9.7 + h2 * 4.1,
        len = 0.007 + 0.006 * h2
      const z = (j + 1) * 0.0006
      const centre = at(along, across, z)
      const tip = (s: number): Point => [
        centre[0] + Math.cos(spin) * len * s,
        centre[1] + Math.sin(spin) * len * s,
        z,
      ]
      edges.push(...tag(ghost(stroke([segment(tip(-1), tip(1))], 0.7)), 113 + k))
    }
  })
  return tilt(edges, 0.28, 0.16)
}
function brackets(): Edge[] {
  const edges: Edge[] = []
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      edges.push(
        ...line([
          [sx * 0.74, sy, 0.06],
          [sx, sy, 0.06],
          [sx, sy * 0.74, 0.06],
        ]),
      )
  return edges
}
function fingerprint(): Edge[] {
  const edges = stroke(brackets(), 0.75)
  const sites: Point[][] = []
  const ridge = (start: Point, curves: Point[][], weight = 0.78) => {
    let p = start
    const points: Point[] = []
    for (const [a, b, end] of curves) {
      points.push(...bezier(p, a, b, end, 24))
      p = end
    }
    points.push(p)
    sites.push(points)
    edges.push(...activity(stroke(line(points), weight), 9))
  }
  const p = (x: number, y: number): Point => [x, y, 0.17]
  // Separate open shoulders establish a rounded fingertip, rather than a solid nested dome.
  ridge(p(-0.31, 0.88), [[p(-0.12, 0.98), p(0.12, 0.98), p(0.31, 0.88)]], 0.62)
  ridge(p(-0.54, 0.65), [[p(-0.29, 0.9), p(0.29, 0.9), p(0.54, 0.65)]], 0.69)
  ridge(
    p(-0.73, 0.12),
    [
      [p(-0.73, 0.48), p(-0.39, 0.7), p(0, 0.7)],
      [p(0.39, 0.7), p(0.72, 0.46), p(0.72, 0.1)],
    ],
    0.75,
  )
  // Ridges turn into independent, spaced lower tails. No shared convergence point.
  ridge(p(-0.72, -0.4), [
    [p(-0.53, -0.18), p(-0.66, 0.07), p(-0.51, 0.33)],
    [p(-0.3, 0.67), p(0.27, 0.66), p(0.49, 0.32)],
    [p(0.65, 0.06), p(0.45, -0.13), p(0.6, -0.35)],
  ])
  ridge(p(-0.59, -0.62), [
    [p(-0.37, -0.39), p(-0.51, -0.06), p(-0.38, 0.18)],
    [p(-0.22, 0.48), p(0.2, 0.5), p(0.35, 0.2)],
    [p(0.47, -0.06), p(0.27, -0.32), p(0.45, -0.55)],
  ])
  ridge(p(-0.4, -0.77), [
    [p(-0.2, -0.52), p(-0.33, -0.15), p(-0.25, 0.1)],
    [p(-0.16, 0.33), p(0.12, 0.33), p(0.22, 0.11)],
    [p(0.31, -0.13), p(0.11, -0.46), p(0.27, -0.73)],
  ])
  ridge(
    p(-0.19, -0.82),
    [
      [p(-0.04, -0.54), p(-0.17, -0.18), p(-0.11, 0.01)],
      [p(-0.07, 0.14), p(0.04, 0.16), p(0.08, 0.02)],
      [p(0.14, -0.17), p(0.01, -0.51), p(0.07, -0.84)],
    ],
    0.8,
  )
  // Minutiae pop as the scan finds them, a confidence bar fills, and a check confirms the match.
  const marks: [number, number][] = [
    [1, 0.28],
    [2, 0.22],
    [2, 0.78],
    [3, 0.35],
    [3, 0.7],
    [4, 0.5],
    [5, 0.42],
    [6, 0.6],
  ]
  marks.forEach(([ridgeIndex, fraction], i) => {
    const site = sites[ridgeIndex]
    const [x, y] = site[Math.floor(fraction * (site.length - 1))]
    const ticks = [0, 1, 2, 3].map((k) => {
      const a = (k * Math.PI) / 2 + Math.PI / 4
      return segment(
        [x + Math.cos(a) * 0.05, y + Math.sin(a) * 0.05, 0.2],
        [x + Math.cos(a) * 0.085, y + Math.sin(a) * 0.085, 0.2],
      )
    })
    edges.push(
      ...ghost(
        activity(
          [...stroke(loop(circle(0.032, 0.032, x, y, 0.2, 12)), 0.8), ...stroke(ticks, 0.6)],
          80 + i,
        ),
      ),
    )
  })
  edges.push(
    ...ghost(
      activity(
        stroke(
          Array.from({ length: 10 }, (_, i) =>
            segment([-0.45 + i * 0.1, -1.2, 0.12], [-0.45 + i * 0.1, -1.12, 0.12]),
          ),
          0.6,
        ),
        79,
      ),
    ),
    ...ghost(
      activity(
        [
          ...stroke(loop(circle(0.13, 0.13, 0, 1.2, 0.15, 24)), 0.8),
          ...stroke(
            line([
              [-0.065, 1.2, 0.15],
              [-0.02, 1.15, 0.15],
              [0.07, 1.26, 0.15],
            ]),
            1.1,
          ),
        ],
        78,
      ),
    ),
  )
  return edges
}
function malware(): Edge[] {
  // Raised shell, recessed underside and jointed limbs are separate depth layers.
  const shell: Point[] = [
    ...bezier([0, 0.3, 0.42], [-0.18, 0.32, 0.43], [-0.31, 0.12, 0.43], [-0.29, -0.14, 0.4], 24),
    ...bezier(
      [-0.29, -0.14, 0.4],
      [-0.27, -0.38, 0.39],
      [-0.15, -0.51, 0.36],
      [0, -0.52, 0.35],
      24,
    ),
    ...bezier([0, -0.52, 0.35], [0.15, -0.51, 0.36], [0.27, -0.38, 0.39], [0.29, -0.14, 0.4], 24),
    ...bezier([0.29, -0.14, 0.4], [0.31, 0.12, 0.43], [0.18, 0.32, 0.43], [0, 0.3, 0.42], 24),
  ]
  const bug: Edge[] = [
    ...stroke(loop(shell), 1.1),
    ...stroke(loop(shell.map(([x, y]) => [x * 0.9, y, 0.34] as Point)), 0.32),
  ]
  for (const index of [0, 24, 48, 72]) {
    const [x, y, z] = shell[index]
    bug.push(...stroke([segment([x, y, z], [x * 0.9, y, 0.34])], 0.35))
  }
  // Curving meridians and the lifted centre seam show the convex wing cases.
  for (const side of [-1, 1]) {
    bug.push(
      ...stroke(
        line([
          ...bezier(
            [side * 0.025, 0.27, 0.57],
            [side * 0.2, 0.23, 0.61],
            [side * 0.27, -0.13, 0.54],
            [side * 0.035, -0.47, 0.39],
            32,
          ),
          [side * 0.035, -0.47, 0.39],
        ]),
        0.58,
      ),
    )
  }
  bug.push(
    ...stroke(
      line([
        ...bezier([0, 0.28, 0.59], [0, 0.04, 0.64], [0, -0.27, 0.55], [0, -0.49, 0.39], 32),
        [0, -0.49, 0.39],
      ]),
      0.73,
    ),
  )
  for (const y of [-0.28, -0.39]) {
    const width = y < -0.3 ? 0.13 : 0.2
    bug.push(
      ...stroke(
        line([
          ...bezier(
            [-width, y, 0.41],
            [-width * 0.5, y - 0.035, 0.47],
            [width * 0.5, y - 0.035, 0.47],
            [width, y, 0.41],
            20,
          ),
          [width, y, 0.41],
        ]),
        0.28,
      ),
    )
  }
  const head = [
    ...bezier([-0.19, 0.3, 0.4], [-0.24, 0.64, 0.49], [0.21, 0.65, 0.49], [0.2, 0.3, 0.4], 32),
    [0.2, 0.3, 0.4] as Point,
  ]
  bug.push(...stroke(loop(head), 0.95))
  bug.push(
    ...stroke(
      line([
        ...bezier(
          [-0.17, 0.29, 0.42],
          [-0.08, 0.36, 0.51],
          [0.08, 0.36, 0.51],
          [0.17, 0.29, 0.42],
          20,
        ),
        [0.17, 0.29, 0.42],
      ]),
      0.48,
    ),
  )
  // A fine latitude/longitude lattice follows the actual convex casing, never a flat fill.
  const centre = [
    ...bezier([0, 0.28, 0.59], [0, 0.04, 0.64], [0, -0.27, 0.55], [0, -0.49, 0.39], 48),
    [0, -0.49, 0.39] as Point,
  ]
  const boundary = (y: number, side: number): Point => {
    const hits: Point[] = []
    for (let i = 0; i < shell.length; i++) {
      const a = shell[i],
        b = shell[(i + 1) % shell.length]
      if ((a[1] - y) * (b[1] - y) > 0 || Math.abs(b[1] - a[1]) < 1e-8) continue
      const t = (y - a[1]) / (b[1] - a[1])
      hits.push(a.map((value, axis) => value + (b[axis] - value) * t) as Point)
    }
    return hits.reduce((best, point) => (point[0] * side > best[0] * side ? point : best))
  }
  const surface = (u: number, t: number): Point => {
    const y = 0.25 - t * 0.72
    const rim = boundary(y, u < 0 ? -1 : 1)
    let crown = centre[centre.length - 1][2]
    for (let i = 1; i < centre.length; i++) {
      const a = centre[i - 1],
        b = centre[i]
      if (y <= a[1] && y >= b[1]) {
        crown = a[2] + ((b[2] - a[2]) * (y - a[1])) / (b[1] - a[1])
        break
      }
    }
    return [Math.abs(u) * rim[0], y, rim[2] + (crown - rim[2]) * Math.sqrt(1 - u * u)]
  }
  for (const u of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75])
    bug.push(...stroke(line(Array.from({ length: 41 }, (_, i) => surface(u, i / 40))), 0.24))
  for (let row = 0; row < 9; row++)
    bug.push(
      ...stroke(
        line(Array.from({ length: 33 }, (_, i) => surface(-0.94 + (i / 32) * 1.88, row / 8))),
        0.24,
      ),
    )
  // Only the body breathes, while the rigid limbs and containment mark keep a steady light.
  activity(bug, 11)
  for (const side of [-1, 1]) {
    bug.push(
      ...stroke(
        line([
          [side * 0.08, 0.56, 0.43],
          [side * 0.13, 0.72, 0.38],
          [side * 0.24, 0.78, 0.35],
        ]),
        0.68,
      ),
    )
    // Distinct coxa, knee and crooked tarsus. The middle pair is deliberately kinked.
    const legs: Point[][] = [
      [
        [side * 0.23, 0.18, 0.35],
        [side * 0.4, 0.3, 0.28],
        [side * 0.43, 0.48, 0.27],
        [side * 0.61, 0.54, 0.26],
      ],
      [
        [side * 0.29, -0.03, 0.35],
        [side * 0.48, 0.01, 0.28],
        [side * 0.56, -0.1, 0.27],
        [side * 0.71, -0.04, 0.26],
      ],
      [
        [side * 0.23, -0.28, 0.35],
        [side * 0.42, -0.38, 0.28],
        [side * 0.44, -0.57, 0.27],
        [side * 0.61, -0.65, 0.26],
      ],
    ]
    for (const leg of legs) bug.push(...stroke(line(leg), 0.82))
  }
  // A slight lean makes the beetle less diagrammatic, and the containment badge stays square.
  const angle = -0.1,
    c = Math.cos(angle),
    sn = Math.sin(angle)
  const leaning = bug.map((edge) =>
    Object.assign(
      edge.map(([x, y, z]) => [x * c - y * sn, x * sn + y * c, z] as Point) as Edge,
      copyStyle(edge),
    ),
  )
  return [
    ...hexagon(),
    ...leaning,
    // The containment strike only exists while the animation ignites it.
    ...ghost(activity(stroke([segment([-0.62, -0.63, 0.65], [0.62, 0.63, 0.65])], 1.5), 14)),
  ]
}
function monitoring(): Edge[] {
  const z = 0.15
  const outline = [
    ...bezier([-1, 0, z], [-0.4, 0.77, z], [0.37, 0.77, z], [1, 0, z], 32),
    ...bezier([1, 0, z], [0.39, -0.72, z], [-0.38, -0.72, z], [-1, 0, z], 32),
  ]
  const edges = [
    ...stroke(brackets(), 0.9),
    ...stroke(loop(outline), 1.18),
    ...stroke(loop(outline.map(([x, y]) => [x * 0.96, y * 0.89, z - 0.1] as Point)), 0.38),
    ...stroke(loop(circle(0.39, 0.39, 0, 0, z + 0.03, 80)), 1.0),
    ...stroke(loop(circle(0.325, 0.325, 0, 0, z + 0.04, 72)), 0.4),
    ...stroke(loop(circle(0.125, 0.125, 0, 0, z + 0.075, 40)), 1.15),
    ...stroke(loop(circle(0.058, 0.058, 0, 0, z + 0.08, 24)), 0.65),
  ]
  // Iris fibres remain fine enough to read as detail within the stronger eye silhouette.
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2,
      inner = 0.19 + 0.025 * Math.sin(i * 2.3),
      outer = 0.31
    edges.push(
      ...stroke(
        [
          segment(
            [Math.cos(angle) * inner, Math.sin(angle) * inner, z + 0.05],
            [Math.cos(angle + 0.035) * outer, Math.sin(angle + 0.035) * outer, z + 0.045],
          ),
        ],
        0.18,
      ),
    )
  }
  // A targeting reticle locks onto the iris.
  for (let q = 0; q < 4; q++) {
    const start = (q * Math.PI) / 2 + 0.25
    edges.push(
      ...ghost(
        activity(
          stroke(
            line(
              Array.from(
                { length: 10 },
                (_, i) =>
                  [
                    Math.cos(start + (i / 9) * 0.9) * 0.46,
                    Math.sin(start + (i / 9) * 0.9) * 0.46,
                    0.215,
                  ] as Point,
              ),
            ),
            0.8,
          ),
          70,
        ),
      ),
    )
  }
  return edges
}

// Morton ordering keeps corresponding particles in nearby spatial regions.
function spread(value: number) {
  let n = value & 1023
  n = (n | (n << 16)) & 0x030000ff
  n = (n | (n << 8)) & 0x0300f00f
  n = (n | (n << 4)) & 0x030c30c3
  return (n | (n << 2)) & 0x09249249
}

function morton(point: Point) {
  const quantize = (v: number) => Math.max(0, Math.min(1023, Math.round(((v + 1.5) / 3) * 1023)))
  return (
    (spread(quantize(point[0])) |
      (spread(quantize(point[1])) << 1) |
      (spread(quantize(point[2])) << 2)) >>>
    0
  )
}

function sampleEdges(edges: Edge[], count: number): Float32Array {
  const lengths = edges.map(([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  let edgeIndex = 0,
    offset = 0
  const points: Point[] = []
  for (let i = 0; i < count; i++) {
    const distance = ((i + 0.5) / count) * total
    while (edgeIndex < edges.length - 1 && distance > offset + lengths[edgeIndex]) {
      offset += lengths[edgeIndex++]
    }
    const [a, b] = edges[edgeIndex]
    const t = (distance - offset) / lengths[edgeIndex]
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
  }
  const ordered = points.map((point) => ({ point, code: morton(point) }))
  ordered.sort((a, b) => a.code - b.code)
  return new Float32Array(ordered.flatMap(({ point }) => point))
}

export function createWireForms(count: number): WireForm[] {
  const definitions: [string, Edge[]][] = [
    ["Threat protection", shield()],
    ["Secure infrastructure", servers()],
    ["Data security", database()],
    ["Global threats", globe()],
    ["Secure development", code()],
    ["Threat detection", radar()],
    ["Network security", network()],
    ["Identity access", fingerprint()],
    ["Malware defence", malware()],
    ["Security monitoring", monitoring()],
  ]
  return definitions.map(([name, edges]) => {
    const solid = edges.filter((edge) => !edge.anim)
    const unique = new Map<string, Point>()
    for (const edge of solid) for (const point of edge) unique.set(point.join(","), point)
    const vertices = [...unique.values()]
    // Curved rings have many sampling vertices, whereas technical markers need only a few.
    const markerVertices = vertices
      .filter((_, i) => i % Math.max(1, Math.floor(vertices.length / 18)) === 0)
      .slice(0, 24)
    return {
      name,
      edges,
      vertices: new Float32Array(markerVertices.flat()),
      lines: new Float32Array(edges.flat(2)),
      cloud: sampleEdges(solid, count),
    }
  })
}

// Refine the spatial ordering with local nearest-neighbour assignment. This runs once per
// transition, never per frame. Each target is used exactly once, retaining exact wire geometry.
export function matchCloud(source: Float32Array, target: Float32Array): Float32Array {
  if (source.length !== target.length) throw new Error("Particle clouds must have equal sizes")
  const count = source.length / 3
  const order = Array.from({ length: count }, (_, i) => i)
  const keys = Uint32Array.from(order, (i) =>
    morton([source[i * 3], source[i * 3 + 1], source[i * 3 + 2]]),
  )
  order.sort((a, b) => keys[a] - keys[b])
  const result = new Float32Array(target.length)
  const block = 32
  for (let start = 0; start < count; start += block) {
    const available = Array.from({ length: Math.min(block, count - start) }, (_, i) => start + i)
    for (let j = start; j < Math.min(start + block, count); j++) {
      const sourceIndex = order[j]
      let best = 0,
        distance = Infinity
      for (let k = 0; k < available.length; k++) {
        const at = available[k] * 3,
          from = sourceIndex * 3
        const candidate =
          (source[from] - target[at]) ** 2 +
          (source[from + 1] - target[at + 1]) ** 2 +
          (source[from + 2] - target[at + 2]) ** 2
        if (candidate < distance) {
          distance = candidate
          best = k
        }
      }
      const targetIndex = available.splice(best, 1)[0]
      result.set(target.subarray(targetIndex * 3, targetIndex * 3 + 3), sourceIndex * 3)
    }
  }
  return result
}
