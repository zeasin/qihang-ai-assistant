/**
 * 云端 MySQL 数据库（cloud-db）
 *
 * 主业务数据（会话、项目、待办、提醒、数据中心、AI 分析、工具历史）存储在云端 MySQL，
 * 知识库索引（kb_documents / kb_chunks）仍保留在本地 SQLite。
 *
 * 连接配置从 config.json 读取：
 *   dbHost / dbPort / dbUser / dbPassword / dbName / dbSsl(0|1)
 */
import * as mysql from 'mysql2/promise';
import logger from './logger';

export interface CloudDbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
}

export interface CloudDbResult {
  rows: any[];
  affectedRows?: number;
  insertId?: number;
}

/** 中国时区时间戳默认值表达式（MySQL 8.0.13+ 表达式默认值，数字时区无需加载 tz 表） */
export const TS_DEFAULT = "DEFAULT (DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'), '%Y-%m-%d %H:%i:%s'))";

/** 云端 MySQL 表结构（与本地 SQLite 的表结构/字段名保持一致，方便迁移与回退） */
export const MYSQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS prj_sessions (
  id VARCHAR(64) PRIMARY KEY,
  source VARCHAR(32) DEFAULT 'ui',
  title VARCHAR(512),
  chat_id VARCHAR(64),
  chat_type VARCHAR(32),
  mode VARCHAR(32) DEFAULT 'general',
  project_id INT NULL,
  active_agent VARCHAR(64) DEFAULT 'pi',
  created_at VARCHAR(32) ${TS_DEFAULT},
  updated_at VARCHAR(32) ${TS_DEFAULT}
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prj_messages (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  source VARCHAR(32) DEFAULT 'ui',
  role VARCHAR(16) NOT NULL,
  content LONGTEXT NOT NULL,
  mode VARCHAR(32) DEFAULT 'general',
  images LONGTEXT NULL,
  created_at VARCHAR(32) ${TS_DEFAULT},
  KEY idx_messages_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prj_projects (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'note',
  dir VARCHAR(1024),
  description TEXT,
  default_branch VARCHAR(255) DEFAULT '',
  labels TEXT,
  sort_order INT DEFAULT 0,
  is_default INT DEFAULT 0,
  auto_report INT DEFAULT 0,
  feishu_push INT DEFAULT 0,
  dir_settings LONGTEXT,
  ignore_dirs TEXT,
  ignore_files TEXT,
  created_at VARCHAR(32) ${TS_DEFAULT},
  updated_at VARCHAR(32) ${TS_DEFAULT}
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS data_center_datasets (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dataset_id VARCHAR(64),
  name VARCHAR(255),
  description TEXT,
  type VARCHAR(64),
  status VARCHAR(32),
  schema_json LONGTEXT,
  import_configs_json LONGTEXT,
  module_id VARCHAR(64),
  created_at VARCHAR(32) ${TS_DEFAULT},
  updated_at VARCHAR(32) ${TS_DEFAULT}
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS data_center_records (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  record_id VARCHAR(64),
  dataset_id VARCHAR(64),
  data_json LONGTEXT,
  source VARCHAR(64),
  content_hash VARCHAR(64),
  record_num VARCHAR(64),
  record_type VARCHAR(64),
  record_status VARCHAR(64),
  created_at VARCHAR(32) ${TS_DEFAULT},
  updated_at VARCHAR(32) ${TS_DEFAULT},
  KEY idx_records_dataset (dataset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS data_center_modules (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module_id VARCHAR(64),
  name VARCHAR(255),
  description TEXT,
  icon VARCHAR(32),
  sort_order INT DEFAULT 0,
  created_at VARCHAR(32) ${TS_DEFAULT},
  updated_at VARCHAR(32) ${TS_DEFAULT}
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_analysis (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id INT NULL,
  module_id VARCHAR(64),
  type VARCHAR(64),
  content LONGTEXT,
  prompt LONGTEXT,
  dir_path VARCHAR(1024),
  report_date VARCHAR(32),
  created_at VARCHAR(32) ${TS_DEFAULT},
  updated_at VARCHAR(32) ${TS_DEFAULT},
  KEY idx_analysis_module (module_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plan_reminders (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  message TEXT,
  type VARCHAR(32) NOT NULL,
  time VARCHAR(16) DEFAULT '09:00',
  date VARCHAR(32) DEFAULT '',
  day_of_week INT DEFAULT 0,
  day_of_month INT DEFAULT 1,
  month_day VARCHAR(32) DEFAULT '',
  enabled INT DEFAULT 1,
  created_at VARCHAR(32) NOT NULL,
  last_triggered VARCHAR(32) DEFAULT '',
  project_id INT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plan_todos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(512) NOT NULL,
  description TEXT,
  priority VARCHAR(16) DEFAULT 'mid',
  due_date VARCHAR(32) DEFAULT '',
  status VARCHAR(32) DEFAULT 'pending',
  sort_order INT DEFAULT 0,
  created_at VARCHAR(32) ${TS_DEFAULT},
  updated_at VARCHAR(32) ${TS_DEFAULT}
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_tools_history (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tool VARCHAR(128) NOT NULL,
  name VARCHAR(255) DEFAULT '',
  params LONGTEXT,
  result LONGTEXT,
  result_type VARCHAR(32) DEFAULT 'text',
  created_at VARCHAR(32) ${TS_DEFAULT}
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

/** MySQL 5.7 及以下不支持表达式默认值时使用的降级 DDL（时间戳列默认 NULL） */
export const MYSQL_SCHEMA_FALLBACK = MYSQL_SCHEMA.split(TS_DEFAULT).join('DEFAULT NULL');

/** 云端数据库总开关（config.json 的 dbEnabled，'0' 表示停用并回退本地 SQLite；默认启用） */
export function isCloudEnabled(): boolean {
  try {
    const cfg = require('./app-config').loadConfig();
    return String(cfg.dbEnabled ?? '1') !== '0';
  } catch {
    return true;
  }
}

/** 是否已填写云端 MySQL 连接信息（仅判断凭据是否齐全，不关心开关状态） */
export function hasCloudCredentials(): boolean {
  try {
    const cfg = require('./app-config').loadConfig();
    return !!(String(cfg.dbHost || '').trim() && String(cfg.dbUser || '').trim() && String(cfg.dbName || '').trim());
  } catch {
    return false;
  }
}

/** 读取云端 MySQL 连接配置（config.json），未配置或开关停用时返回 null */
export function getCloudDbConfig(): CloudDbConfig | null {
  try {
    if (!isCloudEnabled()) return null;
    const cfg = require('./app-config').loadConfig();
    const host = String(cfg.dbHost || '').trim();
    const user = String(cfg.dbUser || '').trim();
    const database = String(cfg.dbName || '').trim();
    if (!host || !user || !database) return null;
    const port = parseInt(String(cfg.dbPort || '3306'), 10);
    return {
      host,
      port: isNaN(port) ? 3306 : port,
      user,
      password: String(cfg.dbPassword || ''),
      database,
      ssl: String(cfg.dbSsl || '0') === '1',
    };
  } catch {
    return null;
  }
}

/** 创建连接池（纯 JS 驱动，无需编译原生模块） */
export function createCloudPool(cfg: CloudDbConfig): mysql.Pool {
  return mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectionLimit: 4,
    connectTimeout: 10000,
    waitForConnections: true,
    idleTimeout: 60000,
    enableKeepAlive: true,
    charset: 'utf8mb4',
    ...(cfg.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

/** 把 DDL 按语句拆分逐条执行（mysql2 不支持多语句字符串） */
function schemaStatements(ddl: string): string[] {
  return ddl.split(';').map(s => s.trim()).filter(s => s.length > 0);
}

/** 创建表结构（8.0 表达式默认值失败时自动降级到 5.7 兼容版本） */
export async function ensureCloudSchema(pool: mysql.Pool): Promise<void> {
  try {
    for (const stmt of schemaStatements(MYSQL_SCHEMA)) {
      await pool.query(stmt);
    }
    return;
  } catch (e: any) {
    logger.warn('[CloudDB] 8.0 表达式默认值不受支持，尝试兼容模式: %s', e && e.message);
  }
  try {
    for (const stmt of schemaStatements(MYSQL_SCHEMA_FALLBACK)) {
      await pool.query(stmt);
    }
  } catch (e: any) {
    logger.error('[CloudDB] 创建表结构失败: %s', e && e.message);
    throw e;
  }
}

/** 异步查询（供迁移等非同步桥场景使用） */
export async function cloudQuery(pool: mysql.Pool, sql: string, params: any[] = []): Promise<CloudDbResult> {
  const [res] = await pool.query(sql, params);
  if (Array.isArray(res)) return { rows: res as any[] };
  return { rows: [], affectedRows: (res as any).affectedRows, insertId: (res as any).insertId };
}
