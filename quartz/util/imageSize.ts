export interface ImageSize {
  width: number
  height: number
}

/** Reads the pixel size from the header of a PNG, JPEG, GIF, WebP or SVG file. */
export function imageSize(buf: Buffer): ImageSize | undefined {
  if (buf.length < 24) return svgSize(buf)
  // PNG: the IHDR chunk always comes first
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.toString("ascii", 12, 16) === "IHDR") {
    return valid(buf.readUInt32BE(16), buf.readUInt32BE(20))
  }
  if (buf.toString("ascii", 0, 3) === "GIF") {
    return valid(buf.readUInt16LE(6), buf.readUInt16LE(8))
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf)
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return webpSize(buf)
  }
  return svgSize(buf)
}

function valid(width: number, height: number): ImageSize | undefined {
  return width > 0 && height > 0 ? { width, height } : undefined
}

function jpegSize(buf: Buffer): ImageSize | undefined {
  let offset = 2
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buf[offset + 1]
    // markers without a length field
    if (
      marker === 0xff ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0x01
    ) {
      offset += marker === 0xff ? 1 : 2
      continue
    }
    // start of frame, excluding DHT (c4), JPG (c8) and DAC (cc)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return valid(buf.readUInt16BE(offset + 7), buf.readUInt16BE(offset + 5))
    }
    offset += 2 + buf.readUInt16BE(offset + 2)
  }
  return undefined
}

function webpSize(buf: Buffer): ImageSize | undefined {
  const chunk = buf.toString("ascii", 12, 16)
  if (chunk === "VP8 " && buf.length >= 30) {
    return valid(buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff)
  }
  if (chunk === "VP8L" && buf.length >= 25) {
    const bits = buf.readUInt32LE(21)
    return valid((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
  }
  if (chunk === "VP8X" && buf.length >= 30) {
    return valid(buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1)
  }
  return undefined
}

function svgSize(buf: Buffer): ImageSize | undefined {
  const head = buf.toString("utf8", 0, Math.min(buf.length, 4096))
  const tag = /<svg\b[^>]*>/i.exec(head)?.[0]
  if (!tag) return undefined
  const attr = (name: string) => new RegExp(`\\s${name}=["']([\\d.]+)(px)?["']`).exec(tag)?.[1]
  const width = Number(attr("width"))
  const height = Number(attr("height"))
  if (width > 0 && height > 0) return { width: Math.round(width), height: Math.round(height) }
  const box = /viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag)
  return box ? valid(Math.round(Number(box[1])), Math.round(Number(box[2]))) : undefined
}
