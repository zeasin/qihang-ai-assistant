import * as path from 'path';
import * as fs from 'fs';
import logger from './logger';

const DB_DIR = path.join(require('os').homedir(), '.qihang-work-ai');
const DB_PATH = path.join(DB_DIR, 'qihang-work-ai.db');

let SQL: any = null;
let db: any = null;

async function getDb() {
  if (db) return db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!SQL) SQL = await require('sql.js')();
  const isNew = !fs.existsSync(DB_PATH);
  if (isNew) {
    db = new SQL.Database();
  } else {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  }
  initSchema();
  migrateLlmProfiles();
  if (isNew) initDefaultConfig();
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS sys_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS llm_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT DEFAULT 'deepseek',
      api_key TEXT,
      base_url TEXT,
      model TEXT,
      timeout INTEGER DEFAULT 600,
      model_type TEXT DEFAULT 'text',
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS prj_sessions (
      id TEXT PRIMARY KEY,
      source TEXT DEFAULT 'ui',
      title TEXT,
      chat_id TEXT,
      chat_type TEXT,
      mode TEXT DEFAULT 'general',
      project_id INTEGER,
      active_agent TEXT DEFAULT 'pi',
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS prj_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES prj_sessions(id),
      source TEXT DEFAULT 'ui',
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      mode TEXT DEFAULT 'general',
      images TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS prj_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'note',
      dir TEXT,
      description TEXT DEFAULT '',
      default_branch TEXT DEFAULT '',
      labels TEXT,
      sort_order INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      auto_report INTEGER DEFAULT 0,
      feishu_push INTEGER DEFAULT 0,
      dir_settings TEXT,
      ignore_dirs TEXT,
      ignore_files TEXT,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS kb_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES prj_projects(id),
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      indexed_at TEXT,
      file_mtime INTEGER,
      title TEXT DEFAULT '',
      UNIQUE(project_id, path)
    );

    CREATE TABLE IF NOT EXISTS kb_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL REFERENCES kb_documents(id),
      content TEXT NOT NULL,
      embedding TEXT
    );

    CREATE TABLE IF NOT EXISTS data_center_datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id TEXT,
      name TEXT,
      description TEXT,
      type TEXT,
      status TEXT,
      schema_json TEXT,
      import_configs_json TEXT,
      module_id TEXT,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS data_center_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id TEXT,
      dataset_id TEXT,
      data_json TEXT,
      source TEXT,
      content_hash TEXT,
      record_num TEXT,
      record_type TEXT,
      record_status TEXT,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS data_center_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id TEXT,
      name TEXT,
      description TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS ai_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES prj_projects(id),
      type TEXT,
      content TEXT,
      prompt TEXT,
      dir_path TEXT,
      report_date TEXT,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS sys_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT,
      name TEXT,
      task_type TEXT,
      prompt_key TEXT,
      url TEXT,
      cron_expression TEXT,
      enabled INTEGER DEFAULT 1,
      notify_feishu INTEGER DEFAULT 1,
      dataset_id TEXT,
      params_json TEXT,
      project_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS plan_reminders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      message TEXT DEFAULT '',
      type TEXT NOT NULL,
      time TEXT DEFAULT '09:00',
      date TEXT DEFAULT '',
      day_of_week INTEGER DEFAULT 0,
      day_of_month INTEGER DEFAULT 1,
      month_day TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      last_triggered TEXT DEFAULT '',
      project_id INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority TEXT DEFAULT 'mid',
      due_date TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

  `);

  const obsoleteKeys = ['projectDir', 'ollamaHost', 'labels', 'embedModel'];
  for (const key of obsoleteKeys) {
    run('DELETE FROM sys_config WHERE key = ?', key);
  }
  saveDb();
}

function initDefaultConfig() {
  const defaultConfig = {
    embeddingModel: 'bge-m3',
    embeddingProvider: 'Ollama',
    embeddingBaseUrl: 'http://127.0.0.1:11434',
    embeddingApiKey: '',
    feishuWebhookUrl: '',
    feishuAppId: '',
    feishuAppSecret: '',
    daily_report_retention_days: '30',
    daily_report_prompt: '请按以下格式生成日报：\n\n## 日报格式要求\n使用 Markdown 格式，包含以下板块：\n\n### 1️⃣ 今日概览\n- ✅ 完成任务数量、📋 待办数量、💬 对话次数、📝 笔记更新数、🗂️ 新增记录数\n\n### 2️⃣ 今日完成\n- 列出今日完成的任务，高优先级的用 ⭐ 标记\n\n### 3️⃣ 待办事项\n- 逾期的用 🔴 标记并注明逾期天数\n- 进行中的用 🔄 标记\n- 高优先级的用 🔴 标记\n\n### 4️⃣ 对话与沟通\n- 今日对话次数和简要摘要\n\n### 5️⃣ 笔记与记录\n- 更新的文档和新增的记录\n\n### 6️⃣ 今日提醒\n- 已启用的提醒（如有）\n\n### 7️⃣ 综合评估\n- 根据完成任务、待办处理、知识沉淀等维度给出今日效率评分（0-100分）\n- 给出具体的改进行动建议\n\n## 注意事项\n- 数据为空的部分可以略过，不要编造数据\n- 评分要合理，基于实际数据给出\n- 建议要具体、可执行\n- 语言简洁专业，使用中文',
    daily_report_template: '{{greetingLine}}\n\n📅 {{today}}\n\n{{overview}}\n\n{{doneSection}}\n{{overdueSection}}\n{{pendingSection}}\n{{reminderSection}}\n{{worklogSection}}\n{{chatSection}}\n{{recordSection}}\n{{docSection}}\n\n{{analysisSection}}\n\n{{footer}}',
  };
  for (const [key, value] of Object.entries(defaultConfig)) {
    run('INSERT INTO sys_config (key, value) VALUES (?, ?)', key, value);
  }
  saveDb();
}

// ========== Helpers ==========

function q(sql, ...params) {
  const stmt = db.prepare(sql);
  if (params && params.length) stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function qOne(sql, ...params) {
  const rows = q(sql, ...params);
  return rows.length ? rows[0] : null;
}

function run(sql, ...params) {
  try {
    db.run(sql, params);
    saveDb();
  } catch (e) {
    logger.error('[DB] SQL error: %s | SQL: %s', e.message, sql.slice(0, 200));
    throw e;
  }
}

function runMany(sqls) {
  for (const s of sqls) db.run(s.sql, s.params || []);
  saveDb();
}

function runRaw(sql, params) {
  db.run(sql, params || []);
}

function save() {
  saveDb();
}

// ========== Config ==========
function configGet(key) {
  const r = qOne('SELECT value FROM sys_config WHERE key = ?', key);
  return r ? r.value : null;
}
function configSet(key, value) {
  run('INSERT OR REPLACE INTO sys_config (key, value) VALUES (?, ?)', key, value);
}

// ========== Projects (unified: note + code) ==========
const project = {
  list: (type?) => {
    if (type) return q('SELECT * FROM prj_projects WHERE type = ? ORDER BY sort_order ASC, created_at DESC', type);
    return q("SELECT * FROM prj_projects ORDER BY CASE WHEN type = 'note' THEN 0 ELSE 1 END, sort_order ASC, created_at DESC");
  },
  get: (id) => qOne('SELECT * FROM prj_projects WHERE id = ?', id),
  getDefault: () => qOne('SELECT * FROM prj_projects WHERE is_default = 1'),
  setDefault: (id) => {
    run('UPDATE prj_projects SET is_default = 0 WHERE is_default = 1');
    if (id) run('UPDATE prj_projects SET is_default = 1 WHERE id = ?', id);
  },
  add: (name, type, dir, description, defaultBranch) => {
    const t = type || 'note';
    run('INSERT INTO prj_projects (name, type, dir, description, default_branch) VALUES (?, ?, ?, ?, ?)',
      name, t, dir || '', description || '', defaultBranch || '');
    const r = qOne('SELECT id FROM prj_projects WHERE name = ? AND type = ?', name, t);
    return { id: r.id, name, type: t };
  },
  update: (id, data) => {
    const fields: any[] = []; const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.type !== undefined) { fields.push('type = ?'); params.push(data.type); }
    if (data.dir !== undefined) { fields.push('dir = ?'); params.push(data.dir); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.default_branch !== undefined) { fields.push('default_branch = ?'); params.push(data.default_branch); }
    if (data.is_default !== undefined) { fields.push('is_default = ?'); params.push(data.is_default ? 1 : 0); }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(data.sort_order); }
    if (data.auto_report !== undefined) { fields.push('auto_report = ?'); params.push(data.auto_report ? 1 : 0); }
    if (data.labels !== undefined) { fields.push('labels = ?'); params.push(data.labels); }
    if (data.dir_settings !== undefined) { fields.push('dir_settings = ?'); params.push(data.dir_settings); }
    if (data.ignore_dirs !== undefined) { fields.push('ignore_dirs = ?'); params.push(data.ignore_dirs); }
    if (data.ignore_files !== undefined) { fields.push('ignore_files = ?'); params.push(data.ignore_files); }
    if (fields.length) {
      fields.push("updated_at = datetime('now', '+8 hours')");
      params.push(id);
      run(`UPDATE prj_projects SET ${fields.join(', ')} WHERE id = ?`, ...params);
    }
  },
  remove: (id) => {
    run('DELETE FROM kb_chunks WHERE doc_id IN (SELECT id FROM kb_documents WHERE project_id = ?)', id);
    run('DELETE FROM kb_documents WHERE project_id = ?', id);
    run('DELETE FROM ai_analysis WHERE project_id = ?', id);
    let sessions: any[] = [];
    try { sessions = q('SELECT id FROM prj_sessions WHERE project_id = ?', id); } catch {}
    for (const s of sessions) {
      run('DELETE FROM prj_messages WHERE session_id = ?', s.id);
    }
    run('DELETE FROM prj_sessions WHERE project_id = ?', id);
    run('DELETE FROM prj_projects WHERE id = ?', id);
  },
  // Document operations (for note-type projects)
  docCount: (projectId) => {
    try { const r = qOne('SELECT COUNT(*) as c FROM kb_documents WHERE project_id = ?', projectId); return r ? r.c : 0; } catch { return 0; }
  },
  insertDoc: (projectId, pathVal, content, fileMtime, title) => {
    run("INSERT OR REPLACE INTO kb_documents (project_id, path, content, indexed_at, file_mtime, title) VALUES (?, ?, ?, datetime('now', '+8 hours'), ?, ?)", projectId, pathVal, content, fileMtime || null, title || '');
    const r = qOne('SELECT id FROM kb_documents WHERE project_id = ? AND path = ?', projectId, pathVal);
    return r.id;
  },
  insertChunk: (docId, content, embedding) => {
    if (embedding) {
      run('INSERT INTO kb_chunks (doc_id, content, embedding) VALUES (?, ?, ?)', docId, content, JSON.stringify(embedding));
    } else {
      run('INSERT INTO kb_chunks (doc_id, content) VALUES (?, ?)', docId, content);
    }
  },
  getChunks: (projectId) => q('SELECT c.content FROM kb_chunks c JOIN kb_documents d ON c.doc_id = d.id WHERE d.project_id = ?', projectId).map(r => r.content),
  deleteDocs: (projectId) => {
    run('DELETE FROM kb_chunks WHERE doc_id IN (SELECT id FROM kb_documents WHERE project_id = ?)', projectId);
    run('DELETE FROM kb_documents WHERE project_id = ?', projectId);
  },
};

// ========== Sessions & Messages (unified: chat + coding) ==========
const chat = {
  sessions: (projectId) => {
    try {
      if (projectId) return q("SELECT s.*, (SELECT content FROM prj_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM prj_sessions s WHERE s.project_id = ? ORDER BY s.updated_at DESC", projectId);
      return q("SELECT s.*, (SELECT content FROM prj_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM prj_sessions s ORDER BY s.updated_at DESC");
    } catch { return []; }
  },
  sessionsBySource: (source, projectId) => {
    try {
      if (projectId) return q(`SELECT s.*, (SELECT COUNT(*) FROM prj_messages WHERE session_id = s.id) as msg_count, (SELECT content FROM prj_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM prj_sessions s WHERE s.source = ? AND s.project_id = ? ORDER BY updated_at DESC`, source, projectId);
      return q(`SELECT s.*, (SELECT COUNT(*) FROM prj_messages WHERE session_id = s.id) as msg_count, (SELECT content FROM prj_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM prj_sessions s WHERE s.source = ? ORDER BY updated_at DESC`, source);
    } catch { return []; }
  },
  createSession: (id, projectId, title, mode, agent, source) => {
    run("INSERT OR IGNORE INTO prj_sessions (id, source, title, mode, project_id, active_agent) VALUES (?, ?, ?, ?, ?, ?)",
      id, source || 'ui', title || '新对话', mode || 'general', projectId || null, agent || 'pi');
    return qOne('SELECT * FROM prj_sessions WHERE id = ?', id);
  },
  getSession: (id) => qOne('SELECT * FROM prj_sessions WHERE id = ?', id),
  deleteSession: (sessionId) => {
    run('DELETE FROM prj_messages WHERE session_id = ?', sessionId);
    run('DELETE FROM prj_sessions WHERE id = ?', sessionId);
  },
  updateSessionTitle: (id, title) => {
    run("UPDATE prj_sessions SET title = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?", title, id);
  },
  updateSessionAgent: (id, agent) => {
    run("UPDATE prj_sessions SET active_agent = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?", agent, id);
  },
  messages: (sessionId) => {
    const rows = q("SELECT * FROM prj_messages WHERE session_id = ? ORDER BY id", sessionId);
    return rows.map(r => ({ ...r, images: r.images ? JSON.parse(r.images) : null }));
  },
  addMessage: (sessionId, role, content, mode?, images?) => {
    const imagesJson = images?.length ? JSON.stringify(images) : null;
    run("INSERT INTO prj_messages (session_id, role, content, mode, images) VALUES (?, ?, ?, ?, ?)", sessionId, role, content, mode || 'general', imagesJson);
    run("UPDATE prj_sessions SET updated_at = datetime('now', '+8 hours') WHERE id = ?", sessionId);
  },
};

// ========== Modules ==========
const dm = {
  list: () => q('SELECT * FROM data_center_modules ORDER BY sort_order ASC, created_at DESC'),
  get: (id) => qOne('SELECT * FROM data_center_modules WHERE id = ? OR module_id = ?', id, id),
  add: (name, description, icon) => {
    const id = 'm_' + Date.now();
    run('INSERT INTO data_center_modules (module_id, name, description, icon) VALUES (?, ?, ?, ?)', id, name, description || '', icon || '📁');
    return { id };
  },
  update: (id, data) => {
    const fields: any[] = []; const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.icon !== undefined) { fields.push('icon = ?'); params.push(data.icon); }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(data.sort_order); }
    if (fields.length) { fields.push("updated_at = datetime('now', '+8 hours')"); params.push(id); run(`UPDATE data_center_modules SET ${fields.join(', ')} WHERE id = ?`, ...params); }
  },
  remove: (id) => {
    const dsList = q('SELECT dataset_id FROM data_center_datasets WHERE module_id = ?', id);
    for (const d of dsList) { run('DELETE FROM data_center_records WHERE dataset_id = ?', d.dataset_id); }
    run('DELETE FROM data_center_datasets WHERE module_id = ?', id);
    run('DELETE FROM data_center_modules WHERE id = ?', id);
  },
};

// ========== Datasets ==========
const ds = {
  list: () => {
    const rows = q('SELECT d.*, (SELECT COUNT(*) FROM data_center_records WHERE dataset_id = d.dataset_id) as record_count FROM data_center_datasets d ORDER BY d.created_at DESC');
    return rows.map(r => ({ ...r, recordCount: r.record_count, schema: r.schema_json ? JSON.parse(r.schema_json) : null }));
  },
  get: (id) => {
    const r = qOne('SELECT d.*, (SELECT COUNT(*) FROM data_center_records WHERE dataset_id = d.dataset_id) as record_count FROM data_center_datasets d WHERE d.id = ? OR d.dataset_id = ?', id, id);
    return r ? { ...r, recordCount: r.record_count, schema: r.schema_json ? JSON.parse(r.schema_json) : null } : null;
  },
  add: (params) => {
    const id = params.dataset_id || 'ds_' + Date.now();
    run('INSERT INTO data_center_datasets (dataset_id, name, description, type, status, schema_json, module_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, params.name, params.description || '', params.type || '', params.status || '', params.schemaJson || '{}', params.module_id || '');
    return { id };
  },
  updateMeta: (id, data) => {
    const fields: any[] = []; const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.type !== undefined) { fields.push('type = ?'); params.push(data.type); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.schema_json !== undefined) { fields.push('schema_json = ?'); params.push(data.schema_json); }
    if (data.module_id !== undefined) { fields.push('module_id = ?'); params.push(data.module_id); }
    if (fields.length) { fields.push("updated_at = datetime('now', '+8 hours')"); params.push(id); run(`UPDATE data_center_datasets SET ${fields.join(', ')} WHERE id = ? OR dataset_id = ?`, ...params, id); }
  },
  remove: (id) => {
    const dsRow = qOne('SELECT dataset_id FROM data_center_datasets WHERE id = ? OR dataset_id = ?', id, id);
    if (dsRow) { run('DELETE FROM data_center_records WHERE dataset_id = ?', dsRow.dataset_id); }
    run('DELETE FROM data_center_datasets WHERE id = ? OR dataset_id = ?', id, id);
  },
  query: (datasetId, conditions) => {
    let sql = "SELECT * FROM data_center_records WHERE dataset_id = ?";
    const params = [datasetId];
    if (conditions) { sql += ' AND data_json LIKE ?'; params.push(`%${conditions}%`); }
    sql += ' ORDER BY created_at DESC LIMIT 50';
    return q(sql, ...params).map(r => ({ id: r.id, ...JSON.parse(r.data_json || '{}'), _created_at: r.created_at }));
  },
  insert: (datasetId, dataObj) => run("INSERT INTO data_center_records (dataset_id, data_json) VALUES (?, ?)", datasetId, JSON.stringify(dataObj)),
  updateRecord: (id, dataObj) => run('UPDATE data_center_records SET data_json = ? WHERE id = ?', JSON.stringify(dataObj), id),
  deleteRecord: (id) => run('DELETE FROM data_center_records WHERE id = ?', id),
};

// ========== Collector Tasks ==========
const task = {
  list: () => q('SELECT * FROM sys_tasks ORDER BY created_at DESC'),
  get: (id) => qOne('SELECT * FROM sys_tasks WHERE id = ?', id),
  add: (name, cronExpr, taskType, params) => {
    const taskId = 't_' + Date.now();
    run('INSERT INTO sys_tasks (task_id, name, cron_expression, task_type, params_json, dataset_id, prompt_key, url, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      taskId, name, cronExpr, taskType, JSON.stringify(params || {}), (params && params.dataset_id) || '', (params && params.prompt_key) || '', (params && params.url) || '', (params && params.project_id) || null);
    const r = qOne('SELECT id FROM sys_tasks WHERE task_id = ?', taskId);
    return { id: r.id, task_id: taskId };
  },
  update: (id, data) => {
    const fields: any[] = []; const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.cron_expression !== undefined) { fields.push('cron_expression = ?'); params.push(data.cron_expression); }
    if (data.task_type !== undefined) { fields.push('task_type = ?'); params.push(data.task_type); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); params.push(data.enabled ? 1 : 0); }
    if (data.notify_feishu !== undefined) { fields.push('notify_feishu = ?'); params.push(data.notify_feishu ? 1 : 0); }
    if (data.params_json !== undefined) { fields.push('params_json = ?'); params.push(typeof data.params_json === 'string' ? data.params_json : JSON.stringify(data.params_json)); }
    if (data.dataset_id !== undefined) { fields.push('dataset_id = ?'); params.push(data.dataset_id); }
    if (data.prompt_key !== undefined) { fields.push('prompt_key = ?'); params.push(data.prompt_key); }
    if (data.url !== undefined) { fields.push('url = ?'); params.push(data.url); }
    if (data.project_id !== undefined) { fields.push('project_id = ?'); params.push(data.project_id); }
    if (fields.length) { fields.push("updated_at = datetime('now', '+8 hours')"); params.push(id); run(`UPDATE sys_tasks SET ${fields.join(', ')} WHERE id = ?`, ...params); }
  },
  remove: (id) => run('DELETE FROM sys_tasks WHERE id = ?', id),
  setEnabled: (id, enabled) => run('UPDATE sys_tasks SET enabled = ?, updated_at = datetime(\'now\') WHERE id = ?', enabled ? 1 : 0, id),
  getActive: () => q("SELECT * FROM sys_tasks WHERE enabled = 1"),
};

// ========== Reminders ==========
const reminder = {
  list: () => q('SELECT * FROM plan_reminders ORDER BY created_at DESC'),
  get: (id) => qOne('SELECT * FROM plan_reminders WHERE id = ?', id),
  add: (data) => {
    const id = data.id || 'R' + Date.now();
    run('INSERT OR IGNORE INTO plan_reminders (id, name, message, type, time, date, day_of_week, day_of_month, month_day, enabled, created_at, last_triggered, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, data.name, data.message || '', data.type, data.time || '09:00', data.date || '',
      data.day_of_week || 0, data.day_of_month || 1, data.month_day || '',
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
      data.created_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
      data.last_triggered || '', data.project_id || null);
    return { id };
  },
  update: (id, data) => {
    const fields: any[] = []; const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.message !== undefined) { fields.push('message = ?'); params.push(data.message); }
    if (data.type !== undefined) { fields.push('type = ?'); params.push(data.type); }
    if (data.time !== undefined) { fields.push('time = ?'); params.push(data.time); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); params.push(data.enabled ? 1 : 0); }
    if (fields.length) { params.push(id); run(`UPDATE plan_reminders SET ${fields.join(', ')} WHERE id = ?`, ...params); }
  },
  remove: (id) => run('DELETE FROM plan_reminders WHERE id = ?', id),
  setEnabled: (id, enabled) => run('UPDATE plan_reminders SET enabled = ? WHERE id = ?', enabled ? 1 : 0, id),
  getActive: () => q("SELECT * FROM plan_reminders WHERE enabled = 1"),
};

// ========== LLM Profiles (multi-model) ==========
const llmProfile = {
  list: () => q('SELECT * FROM llm_profiles ORDER BY is_default DESC, id ASC'),
  get: (id) => qOne('SELECT * FROM llm_profiles WHERE id = ?', id),
  getDefault: () => qOne('SELECT * FROM llm_profiles WHERE is_default = 1 ORDER BY id ASC') || qOne('SELECT * FROM llm_profiles ORDER BY id ASC LIMIT 1'),
  add: (data) => {
    const isFirst = qOne('SELECT COUNT(*) as c FROM llm_profiles').c === 0;
    run('INSERT INTO llm_profiles (name, provider, api_key, base_url, model, timeout, model_type, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      data.name, data.provider || 'deepseek', data.api_key ?? data.apiKey ?? '', data.base_url ?? data.baseUrl ?? '', data.model || '', data.timeout || 600, data.model_type ?? data.modelType ?? 'text', data.is_default || (isFirst ? 1 : 0));
    const r = qOne('SELECT * FROM llm_profiles WHERE name = ? ORDER BY id DESC', data.name);
    return r;
  },
  update: (id, data) => {
    const fields: any[] = []; const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.provider !== undefined) { fields.push('provider = ?'); params.push(data.provider); }
    if (data.api_key !== undefined || data.apiKey !== undefined) { fields.push('api_key = ?'); params.push(data.api_key !== undefined ? data.api_key : data.apiKey); }
    if (data.base_url !== undefined || data.baseUrl !== undefined) { fields.push('base_url = ?'); params.push(data.base_url !== undefined ? data.base_url : data.baseUrl); }
    if (data.model !== undefined) { fields.push('model = ?'); params.push(data.model); }
    if (data.timeout !== undefined) { fields.push('timeout = ?'); params.push(data.timeout); }
    if (data.model_type !== undefined || data.modelType !== undefined) { fields.push('model_type = ?'); params.push(data.model_type !== undefined ? data.model_type : data.modelType); }
    if (fields.length) { fields.push("updated_at = datetime('now', '+8 hours')"); params.push(id); run(`UPDATE llm_profiles SET ${fields.join(', ')} WHERE id = ?`, ...params); }
    return qOne('SELECT * FROM llm_profiles WHERE id = ?', id);
  },
  setDefault: (id) => {
    run('UPDATE llm_profiles SET is_default = 0 WHERE is_default = 1');
    run('UPDATE llm_profiles SET is_default = 1 WHERE id = ?', id);
  },
  remove: (id) => {
    const p = qOne('SELECT * FROM llm_profiles WHERE id = ?', id);
    if (!p) return;
    run('DELETE FROM llm_profiles WHERE id = ?', id);
    if (p.is_default) {
      const next = qOne('SELECT * FROM llm_profiles ORDER BY id ASC LIMIT 1');
      if (next) run('UPDATE llm_profiles SET is_default = 1 WHERE id = ?', next.id);
    }
  },
};

// ========== Todos ==========
const todo = {
  list: () => q('SELECT * FROM plan_todos ORDER BY sort_order ASC, created_at DESC'),
  get: (id) => qOne('SELECT * FROM plan_todos WHERE id = ?', id),
  add: (data) => {
    run('INSERT INTO plan_todos (title, description, priority, due_date, status) VALUES (?, ?, ?, ?, ?)',
      data.title, data.description || '', data.priority || 'mid', data.due_date || '', data.status || 'pending');
    const r = qOne('SELECT id FROM plan_todos WHERE title = ? ORDER BY id DESC', data.title);
    return { id: r.id };
  },
  update: (id, data) => {
    const fields: any[] = []; const params: any[] = [];
    if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.priority !== undefined) { fields.push('priority = ?'); params.push(data.priority); }
    if (data.due_date !== undefined) { fields.push('due_date = ?'); params.push(data.due_date); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(data.sort_order); }
    if (fields.length) { fields.push("updated_at = datetime('now', '+8 hours')"); params.push(id); run(`UPDATE plan_todos SET ${fields.join(', ')} WHERE id = ?`, ...params); }
  },
  remove: (id) => run('DELETE FROM plan_todos WHERE id = ?', id),
};

// 迁移旧版 sys_config 中的 LLM 配置到 llm_profiles（仅当 llm_profiles 为空时）
function migrateLlmProfiles() {
  try {
    const count = qOne('SELECT COUNT(*) as c FROM llm_profiles');
    if (!count || count.c > 0) return;
    const provider = configGet('llmProvider') || 'deepseek';
    const model = configGet('llmModel');
    const apiKey = configGet('llmApiKey') || '';
    const baseUrl = configGet('llmBaseUrl') || '';
    if (!model && !apiKey) return;
    run('INSERT INTO llm_profiles (name, provider, api_key, base_url, model, timeout, model_type, is_default) VALUES (?, ?, ?, ?, ?, 600, ?, 1)',
      '默认模型', provider, apiKey, baseUrl, model || 'deepseek-chat', provider === 'ollama' ? 'multimodal' : 'text');
    logger.info('[DB] migrated legacy LLM config to llm_profiles (model=%s)', model);
  } catch (e) {
    logger.warn('[DB] migrateLlmProfiles failed: %s', e.message);
  }
}

function close() {
  if (db) { saveDb(); db.close(); db = null; }
}

export { getDb, close, q, qOne, run, runMany, runRaw, save, configGet, configSet, project, chat, dm, ds, task, reminder, todo, llmProfile, migrateLlmProfiles };
