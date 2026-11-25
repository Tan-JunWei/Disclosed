import { matchCloud } from "./geometry"

self.onmessage = (
  event: MessageEvent<{ id: number; source: ArrayBuffer; target: ArrayBuffer }>,
) => {
  const { id, source, target } = event.data
  const result = matchCloud(new Float32Array(source), new Float32Array(target))
  self.postMessage({ id, result: result.buffer }, { transfer: [result.buffer] })
}
