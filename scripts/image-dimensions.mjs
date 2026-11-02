import fs from "node:fs";

const cache = new Map();

// Read dimensions from the archived image itself, without image conversion,
// external tools, or network requests. JPEG orientation matches browser display.
function jpegOrientation(bytes, offset, end) {
  if (bytes.toString("ascii", offset, offset + 6) !== "Exif\0\0") return 1;
  const start = offset + 6;
  if (start + 8 > end) return 1;
  const littleEndian = bytes.toString("ascii", start, start + 2) === "II";
  const read16 = (position) =>
    littleEndian ? bytes.readUInt16LE(position) : bytes.readUInt16BE(position);
  const read32 = (position) =>
    littleEndian ? bytes.readUInt32LE(position) : bytes.readUInt32BE(position);
  if (read16(start + 2) !== 42) return 1;
  const directory = start + read32(start + 4);
  if (directory + 2 > end) return 1;
  const count = read16(directory);
  for (let index = 0; index < count; index++) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > end) break;
    if (
      read16(entry) === 0x0112 &&
      read16(entry + 2) === 3 &&
      read32(entry + 4) === 1
    )
      return read16(entry + 8);
  }
  return 1;
}

export function imageDimensions(file) {
  if (!file) return null;
  if (cache.has(file)) return cache.get(file);
  const bytes = fs.readFileSync(file);
  let size = null;
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    size = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } else if (
    bytes.length >= 10 &&
    /^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))
  ) {
    size = { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  } else if (
    bytes.length >= 20 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = bytes.toString("ascii", offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      const start = offset + 8;
      if (start + length > bytes.length) break;
      if (chunk === "VP8X" && length >= 10) {
        size = { width: bytes.readUIntLE(start + 4, 3) + 1, height: bytes.readUIntLE(start + 7, 3) + 1 };
      } else if (chunk === "VP8 " && length >= 10 && bytes.toString("hex", start + 3, start + 6) === "9d012a") {
        size = { width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff };
      } else if (chunk === "VP8L" && length >= 5 && bytes[start] === 0x2f) {
        const packed = bytes.readUInt32LE(start + 1);
        size = { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 };
      }
      if (size) break;
      offset = start + length + (length % 2);
    }
  } else if (bytes.length >= 4 && bytes.readUInt16BE(0) === 0xffd8) {
    let offset = 2,
      orientation = 1;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (marker === 0xe1)
        orientation = jpegOrientation(bytes, offset + 2, offset + length);
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 7
      )
        size = {
          height: bytes.readUInt16BE(offset + 3),
          width: bytes.readUInt16BE(offset + 5),
        };
      offset += length;
    }
    if (size && orientation >= 5 && orientation <= 8)
      size = { width: size.height, height: size.width };
  }
  if (size && (!size.width || !size.height)) size = null;
  cache.set(file, size);
  return size;
}
