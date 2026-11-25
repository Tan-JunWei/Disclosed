/** Four independent telemetry traces per object, sampled for continuous GPU morphing. */
const PROFILES: { style: number; reach: number; lift: number; bend: number; inset?: number }[] = [
  { style: 0, reach: 1.4, lift: 0.72, bend: 0.12 }, // shield: angled callouts
  { style: 1, reach: 1.48, lift: 0.56, bend: 0.04 }, // rack: stepped circuit traces
  { style: 2, reach: 1.37, lift: 0.86, bend: 0.28 }, // database: elliptical sweeps
  { style: 2, reach: 1.3, lift: 0.48, bend: 0.17, inset: 0.42 }, // globe: soft links clear of the sphere
  { style: 0, reach: 1.39, lift: 0.92, bend: -0.1 }, // code: angular brackets
  { style: 2, reach: 1.43, lift: 0.82, bend: -0.32 }, // radar: curved scan traces
  { style: 1, reach: 1.3, lift: 0.62, bend: 0.14, inset: 0.6 }, // network: buses leave from outside the perimeter
  { style: 0, reach: 1.34, lift: 1.02, bend: 0.07, inset: 0.62 }, // fingerprint: traces start outside the bracket frame
  { style: 1, reach: 1.46, lift: 0.77, bend: -0.17 }, // malware: broken circuit paths
  { style: 0, reach: 1.5, lift: 0.53, bend: 0.22 }, // eye: wide acquisition frame
]
export const GUIDE_STEPS = 36
export function createGuidePaths(index: number) {
  const profile = PROFILES[index]
  const positions: number[] = [],
    along: number[] = [],
    lanes: number[] = []
  for (let lane = 0; lane < 4; lane++) {
    const sx = lane % 2 ? 1 : -1,
      sy = lane < 2 ? 1 : -1
    const asymmetry = Math.sin(index * 1.7 + lane * 2.1)
    const inset = profile.inset ?? 0
    const start = [
      sx * (0.65 + inset + 0.06 * Math.cos(index + lane)),
      sy * (0.38 + 0.1 * Math.sin(index * 0.8 + lane)),
      -0.24,
    ]
    const end = [
      sx * (profile.reach + inset + asymmetry * 0.07),
      sy * (profile.lift + asymmetry * 0.12),
      -0.28,
    ]
    const anchors = [
      start,
      [sx * (0.94 + inset + profile.bend), start[1] + sy * 0.02, -0.26],
      [sx * (1.12 + inset + profile.bend), end[1], -0.28],
      end,
    ]
    const point = (t: number) => {
      if (profile.style === 2) {
        const s = 1 - t
        return [0, 1, 2].map(
          (axis) =>
            s * s * s * anchors[0][axis] +
            3 * s * s * t * anchors[1][axis] +
            3 * s * t * t * anchors[2][axis] +
            t * t * t * anchors[3][axis],
        )
      }
      const step = Math.min(2, Math.floor(t * 3)),
        f = t * 3 - step
      return anchors[step].map((value, axis) => value + (anchors[step + 1][axis] - value) * f)
    }
    for (let step = 0; step < GUIDE_STEPS; step++) {
      for (const t of [step / GUIDE_STEPS, (step + 1) / GUIDE_STEPS]) {
        positions.push(...point(t))
        along.push(t)
        lanes.push(lane)
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    along: new Float32Array(along),
    lanes: new Float32Array(lanes),
    style: profile.style,
  }
}
