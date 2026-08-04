/**
 * 本地 SQLite → 云端 MySQL 数据迁移
 *
 * 仅迁移业务数据表（会话、项目、任务、提醒、数据中心、AI 分析、工具历史）。
 * 知识库索引（kb_documents / kb_chunks，含向量）体积大且机器相关，留在本地。
 *
 * 迁移方式：读取本地 SQLite（与运行中的应用共用连接），逐表清空云端后重新导入，
 * 幂等可重复执行。可在设置页触发，或命令行：electron . --migrate-cloud
 */
import { getDb } from './database';
import { getCloudDbConfig, createCloudPool, ensureCloudSchema } from './cloud-db';
import logger from './logger';

const MIGRATE_TABLES = [
  'prj_projects',
  'prj_sessions',
  'prj_messages',
  'data_center_modules',
  'data_center_datasets',
  'data_center_records',
  'ai_analysis',
  'plan_reminders',
  'plan_tasks',
  'task_executions',
  'ai_tools_history',
];

const BATCH_SIZE = 20;

export async function migrateLocalToCloud(
  onProgress?: (msg: string, current: number, total: number) => void
): Promise<{ ok: boolean; counts?: Record<string, number>; error?: string }> {
  const cfg = getCloudDbConfig();
  if (!cfg) {
    return { ok: false, error: '未配置云端数据库：请先在设置页填写 MySQL 连接信息' };
  }
  const pool = createCloudPool(cfg);
  const total = MIGRATE_TABLES.length;
  try {
    await ensureCloudSchema(pool);
    const local = getDb();
    const counts: Record<string, number> = {};
    for (let i = 0; i < total; i++) {
      const table = MIGRATE_TABLES[i];
      if (onProgress) onProgress(`正在迁移 ${table}...`, i, total);

      const cols: { name: string; type: string }[] = (local.prepare(`PRAGMA table_info(${table})`).all() as any[])
        .map((c: any) => ({ name: c.name, type: String(c.type || '').toUpperCase() }));
      if (!cols.length) continue;
      const names = cols.map(c => c.name);
      const colSql = names.map(c => `\`${c}\``).join(', ');
      const ph = cols.map(() => '?').join(', ');

      // SQLite 动态类型可能混入非数字字符串（如 prj_sessions.project_id='notesdir'），按列类型强制转换
      const coerce = (col: { name: string; type: string }, v: any): any => {
        if (v === undefined || v === null) return null;
        if (col.type === 'INTEGER' || col.type === 'INT') {
          const n = Number(v);
          return Number.isFinite(n) ? Math.trunc(n) : null;
        }
        if (col.type === 'REAL') {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        }
        return v;
      };

      // 清空云端该表（保证可重复迁移）
      await pool.query(`DELETE FROM ${table}`);

      const rows = local.prepare(`SELECT * FROM ${table}`).all() as any[];
      let maxId = 0;
      for (let j = 0; j < rows.length; j += BATCH_SIZE) {
        const batch = rows.slice(j, j + BATCH_SIZE);
        const values: any[] = [];
        const rowsPh: string[] = [];
        for (const row of batch) {
          rowsPh.push(`(${ph})`);
          for (const c of cols) {
            values.push(coerce(c, row[c.name]));
          }
          if (names.includes('id')) {
            const n = Number(row.id);
            if (!isNaN(n) && n > maxId) maxId = n;
          }
        }
        const sql = `INSERT INTO ${table} (${colSql}) VALUES ${rowsPh.join(', ')}`;
        try {
          await pool.query(sql, values);
        } catch (e: any) {
          if (e && e.code === 'ER_NET_PACKET_TOO_LARGE' && batch.length > 1) {
            // 单行导入（大字段场景）
            for (const row of batch) {
              await pool.query(`INSERT INTO ${table} (${colSql}) VALUES (${ph})`, cols.map(c => coerce(c, row[c.name])));
            }
          } else {
            throw e;
          }
        }
      }
      counts[table] = rows.length;
      if (names.includes('id') && maxId > 0) {
        await pool.query(`ALTER TABLE ${table} AUTO_INCREMENT = ${maxId + 1}`);
      }
      if (onProgress) onProgress(`迁移 ${table} 完成：${rows.length} 条`, i + 1, total);
    }
    logger.info('[Migrate] 迁移完成: %j', counts);
    return { ok: true, counts };
  } catch (e: any) {
    logger.error('[Migrate] 迁移失败: %s', e && e.message);
    return { ok: false, error: (e && e.message) || String(e) };
  } finally {
    try { await pool.end(); } catch {}
  }
}
