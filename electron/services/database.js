const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(require('os').homedir(), '.biling-ai');
const DB_PATH = path.join(DB_DIR, 'biling.db');

let SQL = null;
let db = null;

async function getDb() {
  if (db) return db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!SQL) SQL = await require('sql.js')();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  initSchema();
  migrate();
  ensureColumns();
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function schemaVersion() {
  const r = qOne("SELECT value FROM config WHERE key = 'schema_version'");
  return r ? parseInt(r.value, 10) : 0;
}
function setSchemaVersion(v) {
  run("INSERT OR REPLACE INTO config (key, value) VALUES ('schema_version', ?)", String(v));
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS sessions (
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

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      source TEXT DEFAULT 'ui',
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      mode TEXT DEFAULT 'general',
      images TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS projects (
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

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      indexed_at TEXT,
      file_mtime INTEGER,
      UNIQUE(project_id, path)
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL REFERENCES documents(id),
      content TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id),
      file_path TEXT,
      chunk_index INTEGER,
      path_context TEXT,
      content TEXT,
      embedding TEXT,
      content_hash TEXT,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS file_index_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      file_path TEXT,
      last_modified INTEGER,
      file_size INTEGER,
      content_hash TEXT,
      last_indexed_at TEXT,
      created_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS turn_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES sessions(id),
      turn_order INTEGER,
      embedding TEXT,
      created_at TEXT DEFAULT (datetime('now', '+8 hours'))
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
      project_id INTEGER REFERENCES projects(id),
      type TEXT,
      content TEXT,
      prompt TEXT,
      dir_path TEXT,
      report_date TEXT,
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS collector_tasks (
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
      created_at TEXT DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS reminders (
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

    CREATE TABLE IF NOT EXISTS todos (
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
  saveDb();
}

function migrate() {
  const version = schemaVersion();

  if (version < 1) {
    setSchemaVersion(1);

  const hasLegacySessions = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_sessions'");
  if (hasLegacySessions) {
    const legacySessions = q('SELECT * FROM chat_sessions');
    for (const s of legacySessions) {
      if (!s.id) continue;
      db.run("INSERT OR IGNORE INTO sessions (id, source, title, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        s.id, s.source || 'ui', s.title || '新对话', s.agent_type || 'general', s.created_at, s.updated_at);
    }
  }

  const hasLegacyMessages = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'");
  if (hasLegacyMessages) {
    const legacyMessages = q('SELECT * FROM chat_messages');
    for (const m of legacyMessages) {
      if (!m.session_id) continue;
      db.run("INSERT INTO messages (session_id, role, content, source, created_at) VALUES (?, ?, ?, ?, ?)",
        m.session_id, m.role, m.content, 'ui', m.created_at);
    }
  }

  const hasOldDs = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='dataset_schemas'");
  if (hasOldDs) {
    const old = q('SELECT * FROM dataset_schemas');
    for (const d of old) {
      db.run("INSERT INTO data_center_datasets (dataset_id, name, schema_json, created_at) VALUES (?, ?, ?, ?)",
        d.id, d.name, d.schema_json, d.created_at);
    }
  }

  const hasOldDsRec = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='dataset_records'");
  if (hasOldDsRec) {
    const old = q('SELECT * FROM dataset_records');
    for (const r of old) {
      db.run("INSERT INTO data_center_records (dataset_id, data_json, created_at) VALUES (?, ?, ?)",
        r.dataset_id, r.data_json, r.created_at);
    }
  }

  const hasOldTasks = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_tasks'");
  if (hasOldTasks) {
    const old = q('SELECT * FROM scheduled_tasks');
    for (const t of old) {
      db.run("INSERT INTO collector_tasks (task_id, name, cron_expression, task_type, params_json, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        t.id, t.name, t.cron_expr, t.task_type, t.config_json, t.enabled, t.created_at);
    }
  }

  try { db.run("ALTER TABLE documents ADD COLUMN kb_id INTEGER"); } catch {}
  try { db.run("ALTER TABLE collector_tasks ADD COLUMN notify_feishu INTEGER DEFAULT 1"); } catch {}
  }

  if (version < 3) {
    try { db.run("ALTER TABLE documents ADD COLUMN file_mtime INTEGER"); } catch {}
    setSchemaVersion(3);
  }

  if (version < 4) {
    try { db.run("ALTER TABLE messages ADD COLUMN images TEXT DEFAULT NULL"); } catch {}
    setSchemaVersion(4);
  }

  if (version < 5) {
    // Ensure projects table has columns needed for migration
    try { db.run("ALTER TABLE projects ADD COLUMN type TEXT NOT NULL DEFAULT 'note'"); } catch {}
    try { db.run("ALTER TABLE projects ADD COLUMN labels TEXT"); } catch {}
    try { db.run("ALTER TABLE projects ADD COLUMN sort_order INTEGER DEFAULT 0"); } catch {}
    try { db.run("ALTER TABLE projects ADD COLUMN auto_report INTEGER DEFAULT 0"); } catch {}
    try { db.run("ALTER TABLE projects ADD COLUMN feishu_push INTEGER DEFAULT 0"); } catch {}
    try { db.run("ALTER TABLE projects ADD COLUMN dir_settings TEXT"); } catch {}
    try { db.run("ALTER TABLE projects ADD COLUMN ignore_dirs TEXT"); } catch {}
    try { db.run("ALTER TABLE projects ADD COLUMN ignore_files TEXT"); } catch {}

    // Ensure sessions table has project_id + active_agent columns
    try { db.run("ALTER TABLE sessions ADD COLUMN project_id INTEGER"); } catch (e) { logger.error('[DB] ALTER sessions project_id:', e.message); }
    try { db.run("ALTER TABLE sessions ADD COLUMN active_agent TEXT DEFAULT 'pi'"); } catch (e) { logger.error('[DB] ALTER sessions active_agent:', e.message); }

    // Migrate kb_id → project_id in dependent tables (if old schema with kb_id)
    try {
      const docHasKb = qOne("SELECT kb_id FROM documents LIMIT 1");
      if (docHasKb !== undefined) {
        try { db.run("ALTER TABLE documents ADD COLUMN project_id INTEGER"); } catch {}
        db.run("UPDATE documents SET project_id = kb_id WHERE project_id IS NULL");
      }
    } catch {}
    try { db.run("ALTER TABLE note_embeddings ADD COLUMN project_id INTEGER"); } catch {}
    try { db.run("UPDATE note_embeddings SET project_id = kb_id WHERE project_id IS NULL AND kb_id IS NOT NULL"); } catch {}
    try { db.run("ALTER TABLE file_index_meta ADD COLUMN project_id INTEGER"); } catch {}
    try { db.run("UPDATE file_index_meta SET project_id = kb_id WHERE project_id IS NULL AND kb_id IS NOT NULL"); } catch {}
    try { db.run("ALTER TABLE ai_analysis ADD COLUMN project_id INTEGER"); } catch {}
    try { db.run("UPDATE ai_analysis SET project_id = kb_id WHERE project_id IS NULL AND kb_id IS NOT NULL"); } catch {}
    try { db.run("ALTER TABLE reminders ADD COLUMN project_id INTEGER"); } catch {}
    try { db.run("UPDATE reminders SET project_id = kb_id WHERE project_id IS NULL AND kb_id IS NOT NULL"); } catch {}

    // Update seed task params: kb_id → project_ids
    const tasks = q("SELECT id, params_json FROM collector_tasks WHERE task_type = 'daily_report' OR task_type = 'auto_index'");
    for (const t of tasks) {
      try {
        const params = JSON.parse(t.params_json || '{}');
        if (params.kb_id && !params.project_ids) {
          params.project_ids = [params.kb_id];
          delete params.kb_id;
          run('UPDATE collector_tasks SET params_json = ? WHERE id = ?', JSON.stringify(params), t.id);
        }
      } catch {}
    }

    setSchemaVersion(5);
  }

  try { db.run("ALTER TABLE collector_tasks ADD COLUMN notify_feishu INTEGER DEFAULT 1"); } catch {}

  try {
    const existing = qOne("SELECT id FROM collector_tasks WHERE task_type = 'daily_report'");
    if (!existing) {
      db.run("INSERT INTO collector_tasks (task_id, name, cron_expression, task_type, params_json, enabled, notify_feishu) VALUES ('sys_daily_report', '综合日报', '56 9 * * *', 'daily_report', '{}', 1, 1)");
    }
  } catch (e) { console.error('[DB] seed task error:', e); }

  try {
    const existing = qOne("SELECT id FROM collector_tasks WHERE task_type = 'auto_index'");
    if (!existing) {
      db.run("INSERT INTO collector_tasks (task_id, name, cron_expression, task_type, params_json, enabled, notify_feishu) VALUES ('sys_auto_index', '自动索引笔记库', '0 */2 * * *', 'auto_index', '{}', 1, 0)");
    }
  } catch (e) { console.error('[DB] seed auto_index error:', e); }

  saveDb();
}

function ensureColumns() {
  try { db.run("ALTER TABLE sessions ADD COLUMN project_id INTEGER"); } catch {}
  try { db.run("ALTER TABLE sessions ADD COLUMN active_agent TEXT DEFAULT 'pi'"); } catch {}
  try { db.run("ALTER TABLE documents ADD COLUMN project_id INTEGER"); } catch {}
  try { db.run("ALTER TABLE note_embeddings ADD COLUMN project_id INTEGER"); } catch {}
  try { db.run("ALTER TABLE file_index_meta ADD COLUMN project_id INTEGER"); } catch {}
  try { db.run("ALTER TABLE ai_analysis ADD COLUMN project_id INTEGER"); } catch {}
  try { db.run("ALTER TABLE reminders ADD COLUMN project_id INTEGER"); } catch {}
  saveDb();
}

// ========== Helpers ==========

function q(sql, ...params) {
  const stmt = db.prepare(sql);
  if (params && params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function qOne(sql, ...params) {
  const rows = q(sql, ...params);
  return rows.length ? rows[0] : null;
}

function run(sql, ...params) {
  db.run(sql, params);
  saveDb();
}

function runMany(sqls) {
  for (const s of sqls) db.run(s.sql, s.params || []);
  saveDb();
}

// ========== Config ==========
function configGet(key) {
  const r = qOne('SELECT value FROM config WHERE key = ?', key);
  return r ? r.value : null;
}
function configSet(key, value) {
  run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', key, value);
}

// ========== Projects (unified: note + code) ==========
const project = {
  list: (type) => {
    if (type) return q('SELECT * FROM projects WHERE type = ? ORDER BY sort_order ASC, created_at DESC', type);
    return q('SELECT * FROM projects ORDER BY sort_order ASC, created_at DESC');
  },
  get: (id) => qOne('SELECT * FROM projects WHERE id = ?', id),
  getDefault: () => qOne('SELECT * FROM projects WHERE is_default = 1'),
  setDefault: (id) => {
    run('UPDATE projects SET is_default = 0 WHERE is_default = 1');
    if (id) run('UPDATE projects SET is_default = 1 WHERE id = ?', id);
  },
  add: (name, type, dir, description, defaultBranch) => {
    const t = type || 'note';
    run('INSERT INTO projects (name, type, dir, description, default_branch) VALUES (?, ?, ?, ?, ?)',
      name, t, dir || '', description || '', defaultBranch || '');
    const r = qOne('SELECT id FROM projects WHERE name = ? AND type = ?', name, t);
    return { id: r.id, name, type: t };
  },
  update: (id, data) => {
    const fields = []; const params = [];
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
      run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, ...params);
    }
  },
  remove: (id) => {
    run('DELETE FROM chunks WHERE doc_id IN (SELECT id FROM documents WHERE project_id = ?)', id);
    run('DELETE FROM documents WHERE project_id = ?', id);
    run('DELETE FROM note_embeddings WHERE project_id = ?', id);
    run('DELETE FROM file_index_meta WHERE project_id = ?', id);
    run('DELETE FROM ai_analysis WHERE project_id = ?', id);
    const sessions = q('SELECT id FROM sessions WHERE project_id = ?', id);
    for (const s of sessions) {
      run('DELETE FROM messages WHERE session_id = ?', s.id);
      run('DELETE FROM turn_embeddings WHERE session_id = ?', s.id);
    }
    run('DELETE FROM sessions WHERE project_id = ?', id);
    run('DELETE FROM projects WHERE id = ?', id);
  },
  // Document operations (for note-type projects)
  docCount: (projectId) => {
    try { const r = qOne('SELECT COUNT(*) as c FROM documents WHERE project_id = ?', projectId); return r ? r.c : 0; } catch { return 0; }
  },
  insertDoc: (projectId, pathVal, content, fileMtime) => {
    run("INSERT OR REPLACE INTO documents (project_id, path, content, indexed_at, file_mtime) VALUES (?, ?, ?, datetime('now', '+8 hours'), ?)", projectId, pathVal, content, fileMtime || null);
    const r = qOne('SELECT id FROM documents WHERE project_id = ? AND path = ?', projectId, pathVal);
    return r.id;
  },
  insertChunk: (docId, content) => run('INSERT INTO chunks (doc_id, content) VALUES (?, ?)', docId, content),
  getChunks: (projectId) => q('SELECT c.content FROM chunks c JOIN documents d ON c.doc_id = d.id WHERE d.project_id = ?', projectId).map(r => r.content),
  deleteDocs: (projectId) => {
    run('DELETE FROM chunks WHERE doc_id IN (SELECT id FROM documents WHERE project_id = ?)', projectId);
    run('DELETE FROM documents WHERE project_id = ?', projectId);
  },
};

// ========== Sessions & Messages (unified: chat + coding) ==========
const chat = {
  sessions: (projectId) => {
    try {
      if (projectId) return q("SELECT s.*, (SELECT content FROM messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM sessions s WHERE s.project_id = ? ORDER BY s.updated_at DESC", projectId);
      return q("SELECT s.*, (SELECT content FROM messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM sessions s ORDER BY s.updated_at DESC");
    } catch { return []; }
  },
  sessionsBySource: (source, projectId) => {
    if (projectId) return q(`SELECT s.*, (SELECT COUNT(*) FROM messages WHERE session_id = s.id) as msg_count, (SELECT content FROM messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM sessions s WHERE s.source = ? AND s.project_id = ? ORDER BY updated_at DESC`, source, projectId);
    return q(`SELECT s.*, (SELECT COUNT(*) FROM messages WHERE session_id = s.id) as msg_count, (SELECT content FROM messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM sessions s WHERE s.source = ? ORDER BY updated_at DESC`, source);
  },
  createSession: (id, projectId, title, mode, agent, source) => {
    run("INSERT OR IGNORE INTO sessions (id, source, title, mode, project_id, active_agent) VALUES (?, ?, ?, ?, ?, ?)",
      id, source || 'ui', title || '新对话', mode || 'general', projectId || null, agent || 'pi');
    return qOne('SELECT * FROM sessions WHERE id = ?', id);
  },
  getSession: (id) => qOne('SELECT * FROM sessions WHERE id = ?', id),
  deleteSession: (sessionId) => {
    run('DELETE FROM turn_embeddings WHERE session_id = ?', sessionId);
    run('DELETE FROM messages WHERE session_id = ?', sessionId);
    run('DELETE FROM sessions WHERE id = ?', sessionId);
  },
  updateSessionTitle: (id, title) => {
    run("UPDATE sessions SET title = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?", title, id);
  },
  updateSessionAgent: (id, agent) => {
    run("UPDATE sessions SET active_agent = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?", agent, id);
  },
  messages: (sessionId) => {
    const rows = q("SELECT * FROM messages WHERE session_id = ? ORDER BY id", sessionId);
    return rows.map(r => ({ ...r, images: r.images ? JSON.parse(r.images) : null }));
  },
  addMessage: (sessionId, role, content, mode, images) => {
    const imagesJson = images?.length ? JSON.stringify(images) : null;
    run("INSERT INTO messages (session_id, role, content, mode, images) VALUES (?, ?, ?, ?, ?)", sessionId, role, content, mode || 'general', imagesJson);
    run("UPDATE sessions SET updated_at = datetime('now', '+8 hours') WHERE id = ?", sessionId);
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
    const fields = []; const params = [];
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
    const fields = []; const params = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.type !== undefined) { fields.push('type = ?'); params.push(data.type); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.schema_json !== undefined) { fields.push('schema_json = ?'); params.push(data.schema_json); }
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
  list: () => q('SELECT * FROM collector_tasks ORDER BY created_at DESC'),
  get: (id) => qOne('SELECT * FROM collector_tasks WHERE id = ?', id),
  add: (name, cronExpr, taskType, params) => {
    const taskId = 't_' + Date.now();
    run('INSERT INTO collector_tasks (task_id, name, cron_expression, task_type, params_json, dataset_id, prompt_key, url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      taskId, name, cronExpr, taskType, JSON.stringify(params || {}), (params && params.dataset_id) || '', (params && params.prompt_key) || '', (params && params.url) || '');
    const r = qOne('SELECT id FROM collector_tasks WHERE task_id = ?', taskId);
    return { id: r.id, task_id: taskId };
  },
  update: (id, data) => {
    const fields = []; const params = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.cron_expression !== undefined) { fields.push('cron_expression = ?'); params.push(data.cron_expression); }
    if (data.task_type !== undefined) { fields.push('task_type = ?'); params.push(data.task_type); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); params.push(data.enabled ? 1 : 0); }
    if (data.notify_feishu !== undefined) { fields.push('notify_feishu = ?'); params.push(data.notify_feishu ? 1 : 0); }
    if (data.params_json !== undefined) { fields.push('params_json = ?'); params.push(typeof data.params_json === 'string' ? data.params_json : JSON.stringify(data.params_json)); }
    if (data.dataset_id !== undefined) { fields.push('dataset_id = ?'); params.push(data.dataset_id); }
    if (data.prompt_key !== undefined) { fields.push('prompt_key = ?'); params.push(data.prompt_key); }
    if (data.url !== undefined) { fields.push('url = ?'); params.push(data.url); }
    if (fields.length) { fields.push("updated_at = datetime('now', '+8 hours')"); params.push(id); run(`UPDATE collector_tasks SET ${fields.join(', ')} WHERE id = ?`, ...params); }
  },
  remove: (id) => run('DELETE FROM collector_tasks WHERE id = ?', id),
  setEnabled: (id, enabled) => run('UPDATE collector_tasks SET enabled = ?, updated_at = datetime(\'now\') WHERE id = ?', enabled ? 1 : 0, id),
  getActive: () => q("SELECT * FROM collector_tasks WHERE enabled = 1"),
};

// ========== Reminders ==========
const reminder = {
  list: () => q('SELECT * FROM reminders ORDER BY created_at DESC'),
  get: (id) => qOne('SELECT * FROM reminders WHERE id = ?', id),
  add: (data) => {
    const id = data.id || 'R' + Date.now();
    run('INSERT OR IGNORE INTO reminders (id, name, message, type, time, date, day_of_week, day_of_month, month_day, enabled, created_at, last_triggered, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, data.name, data.message || '', data.type, data.time || '09:00', data.date || '',
      data.day_of_week || 0, data.day_of_month || 1, data.month_day || '',
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
      data.created_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
      data.last_triggered || '', data.project_id || null);
    return { id };
  },
  update: (id, data) => {
    const fields = []; const params = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.message !== undefined) { fields.push('message = ?'); params.push(data.message); }
    if (data.type !== undefined) { fields.push('type = ?'); params.push(data.type); }
    if (data.time !== undefined) { fields.push('time = ?'); params.push(data.time); }
    if (data.enabled !== undefined) { fields.push('enabled = ?'); params.push(data.enabled ? 1 : 0); }
    if (fields.length) { params.push(id); run(`UPDATE reminders SET ${fields.join(', ')} WHERE id = ?`, ...params); }
  },
  remove: (id) => run('DELETE FROM reminders WHERE id = ?', id),
  setEnabled: (id, enabled) => run('UPDATE reminders SET enabled = ? WHERE id = ?', enabled ? 1 : 0, id),
  getActive: () => q("SELECT * FROM reminders WHERE enabled = 1"),
};

// ========== Todos ==========
const todo = {
  list: () => q('SELECT * FROM todos ORDER BY sort_order ASC, created_at DESC'),
  get: (id) => qOne('SELECT * FROM todos WHERE id = ?', id),
  add: (data) => {
    run('INSERT INTO todos (title, description, priority, due_date, status) VALUES (?, ?, ?, ?, ?)',
      data.title, data.description || '', data.priority || 'mid', data.due_date || '', data.status || 'pending');
    const r = qOne('SELECT id FROM todos WHERE title = ? ORDER BY id DESC', data.title);
    return { id: r.id };
  },
  update: (id, data) => {
    const fields = []; const params = [];
    if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.priority !== undefined) { fields.push('priority = ?'); params.push(data.priority); }
    if (data.due_date !== undefined) { fields.push('due_date = ?'); params.push(data.due_date); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(data.sort_order); }
    if (fields.length) { fields.push("updated_at = datetime('now', '+8 hours')"); params.push(id); run(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`, ...params); }
  },
  remove: (id) => run('DELETE FROM todos WHERE id = ?', id),
};

function close() {
  if (db) { saveDb(); db.close(); db = null; }
}

module.exports = { getDb, close, q, qOne, run, runMany, configGet, configSet, project, chat, dm, ds, task, reminder, todo };
