import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { app, nativeImage } from 'electron';

let cachedTray: Electron.NativeImage | null = null;
let cachedWindowIcon: Electron.NativeImage | null = null;

/** 定位打包/开发环境下的 resources 资源文件 */
function resourcesPath(file: string): string {
  const candidates = [
    path.join(app.getAppPath(), 'resources', file),
    path.join(__dirname, '..', '..', 'resources', file),
  ];
  return candidates.find(p => fs.existsSync(p)) || candidates[0];
}

function loadFromFile(file: string): Electron.NativeImage | null {
  try {
    const img = nativeImage.createFromPath(resourcesPath(file));
    return img.isEmpty() ? null : img;
  } catch { return null; }
}

function createPngBuffer(width: number, height: number, pixels: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type: string, data: Buffer): Buffer {
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

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** 兜底：资源缺失时生成蓝色圆点图标 */
function fallbackIcon(size: number): Electron.NativeImage {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const c = (size - 1) / 2;
      const dist = Math.sqrt((x - c) ** 2 + (y - c) ** 2);
      if (dist <= c * 0.75) { pixels[i] = 99; pixels[i+1] = 102; pixels[i+2] = 241; pixels[i+3] = 255; }
      else if (dist <= c * 0.85) { pixels[i] = 99; pixels[i+1] = 102; pixels[i+2] = 241; pixels[i+3] = 120; }
    }
  }
  return nativeImage.createFromBuffer(createPngBuffer(size, size, pixels), { width: size, height: size });
}

/** 主窗口图标（256x256） */
export function getWindowIcon(): Electron.NativeImage {
  if (cachedWindowIcon) return cachedWindowIcon;
  cachedWindowIcon = loadFromFile('icon.png') || fallbackIcon(256);
  return cachedWindowIcon;
}

/** 系统托盘图标（macOS 16x16，其余 32x32） */
export function createTrayIcon(): Electron.NativeImage {
  if (cachedTray) return cachedTray;
  const file = process.platform === 'darwin' ? 'tray-16.png' : 'tray-32.png';
  cachedTray = loadFromFile(file) || fallbackIcon(32);
  return cachedTray;
}
