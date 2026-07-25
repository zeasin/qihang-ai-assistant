const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

let cachedIcon = null;

function createPngBuffer(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeB, data]);
    const crc = crc32(crcData);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc);
    return Buffer.concat([len, typeB, data, crcB]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = y * (1 + width * 4) + 1 + x * 4;
      raw[di] = pixels[si]; raw[di+1] = pixels[si+1];
      raw[di+2] = pixels[si+2]; raw[di+3] = pixels[si+3];
    }
  }
  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createTrayIcon() {
  if (cachedIcon) return cachedIcon;
  const { nativeImage } = require('electron');
  const s = 16;
  const pixels = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const dist = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2);
      if (dist <= 6) { pixels[i] = 99; pixels[i+1] = 102; pixels[i+2] = 241; pixels[i+3] = 255; }
      else if (dist <= 6.8) { pixels[i] = 99; pixels[i+1] = 102; pixels[i+2] = 241; pixels[i+3] = 120; }
    }
  }
  const pngBuf = createPngBuffer(s, s, pixels);
  const iconPath = path.join(require('os').homedir(), '.biling-ai', 'tray-icon.png');
  try {
    if (!fs.existsSync(path.dirname(iconPath))) fs.mkdirSync(path.dirname(iconPath), { recursive: true });
    fs.writeFileSync(iconPath, pngBuf);
    cachedIcon = nativeImage.createFromPath(iconPath);
  } catch { cachedIcon = nativeImage.createFromBuffer(pngBuf, { width: s, height: s }); }
  return cachedIcon;
}

module.exports = { createTrayIcon };