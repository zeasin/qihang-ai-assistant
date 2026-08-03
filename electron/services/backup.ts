/**
 * 数据备份 / 恢复 / 自动备份
 *
 * 只备份 SQLite 数据库（含 WAL 中的未落盘数据）。
 * 使用 better-sqlite3 的 db.backup() 生成一致性快照，避免直接复制文件导致数据不一致。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getDb, close } from './database';
import logger from './logger';

const BACKUP_DIR = path.join(os.homedir(), '.qihang-ai-desktop', 'backups');
const DEFAULT_RETENTION = 30; // 默认保留最近 30 份
const AUTO_BACKUP_INTERVAL_MS = 24 * 3600 * 1000; // 距上次备份超过 24 小时则补一次
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 运行期间每 1 小时检查一次（仅读目录 mtime，开销极小）

let autoTimer: NodeJS.Timeout | null = null;
let autoEnabled = true;

/** 备份目录：优先读 config.json 的 backupDir，否则默认 ~/.qihang-ai-desktop/backups */
export function getBackupDir(): string {
  try {
    const cfg = require('./app-config');
    const d = cfg.getConfig('backupDir');
    if (d) return d;
  } catch {}
  return BACKUP_DIR;
}

/** 保存备份目录到 config.json */
export function setBackupDir(dir: string): void {
  try {
    const cfg = require('./app-config');
    cfg.saveConfig({ backupDir: dir || null });
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function dbPath(): string {
  const db = getDb();
  const name = db.name;
  return name && name !== ':memory:' ? name : path.join(os.homedir(), '.qihang-ai-desktop', 'qihang-ai-desktop.db');
}

/** 备份文件名：qihang-ai-desktop-backup-YYYYMMDD-HHmmss-fff.db（毫秒级，避免快速连续备份覆盖） */
export function backupFileName(d = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `qihang-ai-desktop-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}.db`;
}

/**
 * 生成一致性备份快照，返回备份文件路径。
 * @param targetDir 备份目录，默认 ~/.qihang-ai-desktop/backups
 */
export async function createBackup(targetDir?: string): Promise<{ path: string; size: number }> {
  const dir = targetDir || getBackupDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, backupFileName());
  const db = getDb();
  await db.backup(file);
  const size = fs.statSync(file).size;
  logger.info('[Backup] created %s (%d bytes)', file, size);
  return { path: file, size };
}

/** 列出备份目录中的备份文件（按时间倒序） */
export function listBackups(dir?: string): { path: string; name: string; size: number; createdAt: string }[] {
  const d = dir || getBackupDir();
  if (!fs.existsSync(d)) return [];
  try {
    return fs.readdirSync(d)
      .filter(f => f.endsWith('.db') && f.startsWith('qihang-ai-desktop-backup'))
      .map(f => {
        const p = path.join(d, f);
        const st = fs.statSync(p);
        return { path: p, name: f, size: st.size, createdAt: st.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (e: any) {
    logger.warn('[Backup] list failed: %s', e && e.message ? e.message : e);
    return [];
  }
}

/** 清理旧备份，仅保留最近 N 份 */
export function pruneBackups(retention: number, dir?: string): number {
  const d = dir || getBackupDir();
  const list = listBackups(d);
  if (list.length <= retention) return 0;
  let removed = 0;
  for (const b of list.slice(retention)) {
    try { fs.unlinkSync(b.path); removed++; } catch (e: any) { logger.warn('[Backup] prune %s failed: %s', b.name, e && e.message ? e.message : e); }
  }
  if (removed > 0) logger.info('[Backup] pruned %d old backup(s), keep %d', removed, retention);
  return removed;
}

/**
 * 从备份文件恢复。
 * 会关闭当前数据库连接、替换文件、重新打开。
 * 注意：调用方应在恢复完成后提示重启应用（内存中缓存、打开的会话等无法完整迁移）。
 */
export async function restoreFromBackup(file: string): Promise<{ ok: boolean; error?: string }> {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return { ok: false, error: '备份文件不存在: ' + file };
  }
  const dbFile = dbPath();
  const walFile = dbFile + '-wal';
  const shmFile = dbFile + '-shm';
  try {
    close();
    // 删除旧的 WAL/SHM，防止旧事务数据混入
    for (const f of [walFile, shmFile]) {
      if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch {} }
    }
    // 先备份当前库为 .pre-restore（如果存在），避免恢复失败后无法回退
    const preRestore = dbFile + '.pre-restore';
    if (fs.existsSync(dbFile) && !fs.existsSync(preRestore)) {
      fs.copyFileSync(dbFile, preRestore);
    }
    fs.copyFileSync(file, dbFile);
    getDb(); // 重新打开验证
    logger.info('[Backup] restored from %s', file);
    return { ok: true };
  } catch (e: any) {
    logger.error('[Backup] restore failed: %s', e && e.message ? e.message : e);
    try { close(); } catch {}
    // 回退到恢复前状态
    const preRestore = dbFile + '.pre-restore';
    if (fs.existsSync(preRestore)) {
      try { fs.copyFileSync(preRestore, dbFile); } catch {}
    }
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

// ========== 自动备份 ==========

export function setAutoBackupEnabled(enabled: boolean): void {
  autoEnabled = enabled;
  if (!enabled && autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
  if (enabled && !autoTimer) {
    scheduleNextAutoCheck();
  }
}

export function isAutoBackupEnabled(): boolean {
  return autoEnabled;
}

/** 备份目录中最新的备份时间（无备份返回 null） */
export function getLastBackupTime(): Date | null {
  const list = listBackups();
  return list.length ? new Date(list[0].createdAt) : null;
}

/**
 * 自动备份：运行期间每 1 小时检查一次，距上次备份超过 24 小时则补一次。
 * 只在应用运行期间工作（个人桌面应用，不做固定定时/开机自启备份）。
 */
function scheduleNextAutoCheck() {
  if (!autoEnabled) return;
  autoTimer = setTimeout(async () => {
    autoTimer = null;
    try {
      await maybeAutoBackup();
    } catch (e: any) {
      logger.error('[Backup] auto backup failed: %s', e && e.message ? e.message : e);
    }
    scheduleNextAutoCheck(); // 不管成败，继续下一轮
  }, CHECK_INTERVAL_MS);
}

async function maybeAutoBackup(): Promise<void> {
  const last = getLastBackupTime();
  if (last && Date.now() - last.getTime() < AUTO_BACKUP_INTERVAL_MS) {
    logger.info('[Backup] auto backup skipped, last backup within 24h (%s)', last.toISOString());
    return;
  }
  const retention = getAutoRetention();
  await createBackup();
  pruneBackups(retention);
  logger.info('[Backup] auto backup done, retention=%d', retention);
}

/** 读取保留份数（config.json: backupRetention），默认 30 */
export function getAutoRetention(): number {
  try {
    const cfg = require('./app-config');
    const v = Number(cfg.getConfig('backupRetention'));
    return v > 0 ? v : DEFAULT_RETENTION;
  } catch { return DEFAULT_RETENTION; }
}

/** 读取是否启用自动备份（config.json: autoBackupEnabled），默认开启 */
export function isAutoBackupConfigured(): boolean {
  try {
    const cfg = require('./app-config');
    return cfg.getConfig('autoBackupEnabled') === '1';
  } catch { return false; }
}

export function startAutoBackup(): void {
  setAutoBackupEnabled(isAutoBackupConfigured());
}

export function stopAutoBackup(): void {
  setAutoBackupEnabled(false);
}
