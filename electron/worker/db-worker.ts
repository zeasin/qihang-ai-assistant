/**
 * 云端 MySQL 查询工作线程（db-worker）
 *
 * 主进程通过 SharedArrayBuffer + Atomics.wait 实现同步桥调用本线程，
 * 以保持既有同步 DB API（better-sqlite3 风格）不变。
 *
 * 协议（消息）：
 *   { type: 'query', id, sql, params, sab }  → 查询；结果写入 sab，flag[0]=1 成功 / 2 失败
 *   { type: 'close' }                        → 关闭连接池并退出
 * 通知：
 *   { type: 'ready' } / { type: 'error', message }  → 启动时连接与建表结果
 */
import { parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import type * as mysql from 'mysql2/promise';
import type { CloudDbConfig } from '../services/cloud-db';

// 打包后本文件被 asarUnpack 解包到 app.asar.unpacked 下运行，
// 但 services 目录仍在 app.asar 内，普通相对 require 找不到模块；
// 这里把当前目录从 app.asar.unpacked 映射回 app.asar 再加载 cloud-db，
// 其内部的 mysql2 等依赖也会在 asar 内正常解析。
function requireCloudDb() {
  const base = __dirname.includes('app.asar.unpacked')
    ? __dirname.replace('app.asar.unpacked', 'app.asar')
    : __dirname;
  return require(path.join(base, '..', 'services', 'cloud-db'));
}
const { createCloudPool, ensureCloudSchema } = requireCloudDb() as typeof import('../services/cloud-db');

const HEADER_BYTES = 8;

const cfg: CloudDbConfig = workerData && workerData.config;

let pool: mysql.Pool | null = null;
let initDone = false;
let pending: any[] = [];

const RETRYABLE_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'ECONNRESET',
  'ETIMEDOUT',
  'ER_CONNECTION_KILLED',
  'ER_SERVER_SHUTDOWN',
  'ER_CONNECTION_COUNT_ERROR',
]);

async function getPool(): Promise<mysql.Pool> {
  if (pool) return pool;
  pool = createCloudPool(cfg);
  return pool;
}

async function doQuery(sql: string, params: any[]): Promise<any> {
  const p = await getPool();
  try {
    const [rows] = await p.query(sql, params);
    return rows;
  } catch (e: any) {
    if (!e || !RETRYABLE_CODES.has(e.code)) throw e;
    // 连接失效：重建连接池并重试一次
    try { await p.end(); } catch {}
    pool = null;
    const p2 = await getPool();
    const [rows] = await p2.query(sql, params);
    return rows;
  }
}

function writeResult(sab: SharedArrayBuffer, json: string) {
  const flag = new Int32Array(sab, 0, 2);
  const payload = new Uint8Array(sab, HEADER_BYTES);
  const maxLen = sab.byteLength - HEADER_BYTES;
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > maxLen) {
    const err = JSON.stringify({ ok: false, error: '查询结果过大（' + bytes.length + ' 字节），请联系管理员调整缓冲' });
    const eb = new TextEncoder().encode(err);
    payload.set(eb);
    Atomics.store(flag, 1, eb.length);
    Atomics.store(flag, 0, 2);
  } else {
    payload.set(bytes);
    Atomics.store(flag, 1, bytes.length);
    Atomics.store(flag, 0, 1);
  }
  // 必须显式 notify，Atomics.store 不会唤醒等待中的主线程
  Atomics.notify(flag, 0, 1);
}

async function dispatch(msg: any) {
  if (msg.type === 'close') {
    try { if (pool) await pool.end(); } catch {}
    process.exit(0);
    return;
  }
  if (msg.type === 'query') {
    try {
      const rows = await doQuery(msg.sql, msg.params);
      writeResult(msg.sab, JSON.stringify({ ok: true, id: msg.id, rows }));
    } catch (e: any) {
      writeResult(msg.sab, JSON.stringify({ ok: false, id: msg.id, error: (e && e.message) || String(e) }));
    }
  }
}

parentPort!.on('message', (msg: any) => {
  if (!msg) return;
  if (!initDone) {
    pending.push(msg); // 初始化完成前暂存查询
    return;
  }
  dispatch(msg);
});

// 启动时：连接 + 建表，向主进程报告状态；完成后执行暂存查询
(async () => {
  try {
    if (!cfg || !cfg.host) throw new Error('云端数据库未配置');
    await getPool();
    await ensureCloudSchema(pool!);
    parentPort!.postMessage({ type: 'ready' });
    initDone = true;
    for (const m of pending.splice(0)) dispatch(m);
  } catch (e: any) {
    const msg = (e && e.message) || String(e);
    parentPort!.postMessage({ type: 'error', message: msg });
    initDone = true;
    for (const m of pending.splice(0)) {
      if (m.type === 'query') writeResult(m.sab, JSON.stringify({ ok: false, id: m.id, error: msg }));
    }
  }
})();
