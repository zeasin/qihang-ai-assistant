/**
 * 应用级配置（config.json）
 * 笔记库等配置保存在项目根目录 config.json，不再写入数据库。
 */
import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

export const CONFIG_PATH =
  process.env.QIHANG_CONFIG_PATH || path.join(__dirname, '..', '..', '..', 'config.json');

let cached: any | null = null;

export function loadConfig(): any {
  if (cached) return cached;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      cached = raw ? JSON.parse(raw) : {};
    }
  } catch (e: any) {
    logger.warn('[AppConfig] 读取 config.json 失败: %s', e && e.message ? e.message : e);
  }
  cached = cached || {};
  return cached;
}

export function saveConfig(patch: Record<string, unknown>): void {
  const cfg = { ...loadConfig(), ...patch };
  cached = cfg;
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e: any) {
    logger.warn('[AppConfig] 写入 config.json 失败: %s', e && e.message ? e.message : e);
  }
}

/** 笔记库目录（唯一） */
export function getNotesDir(): string {
  const dir = loadConfig().notesDir;
  return typeof dir === 'string' ? dir : '';
}

export function setNotesDir(dir: string): void {
  saveConfig({ notesDir: dir || null });
}

/** 读取任意配置键（不存在时返回空串） */
export function getConfig(key: string): string {
  const v = loadConfig()[key];
  return v === undefined || v === null ? '' : String(v);
}

/** 配置键是否已在 config.json 中显式存在 */
export function hasConfigKey(key: string): boolean {
  return loadConfig()[key] !== undefined;
}
