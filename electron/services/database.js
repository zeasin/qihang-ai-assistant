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
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/** Version tracking for migrations */
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      source TEXT DEFAULT 'ui',
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      mode TEXT DEFAULT 'general',
      kb_id TEXT,
      images TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coding_sessions (
      id TEXT PRIMARY KEY,
      project_id INTEGER REFERENCES coding_projects(id) ON DELETE SET NULL,
      title TEXT,
      active_agent TEXT DEFAULT 'pi',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coding_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES coding_sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      mode TEXT DEFAULT 'pi',
      images TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      notes_dir TEXT,
      labels TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      dir_settings TEXT,
      ignore_dirs TEXT,
      ignore_files TEXT,
      auto_report INTEGER DEFAULT 0,
      feishu_push INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS file_index_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kb_id INTEGER NOT NULL REFERENCES knowledge_bases(id),
      file_path TEXT,
      last_modified INTEGER,
      file_size INTEGER,
      content_hash TEXT,
      last_indexed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS note_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kb_id INTEGER REFERENCES knowledge_bases(id),
      file_path TEXT,
      chunk_index INTEGER,
      path_context TEXT,
      content TEXT,
      embedding TEXT,
      content_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS turn_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES sessions(id),
      turn_order INTEGER,
      embedding TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS llm_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      api_key TEXT,
      base_url TEXT,
      model TEXT,
      timeout INTEGER,
      is_default INTEGER DEFAULT 0,
      model_type TEXT DEFAULT 'text',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coding_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      dir TEXT,
      description TEXT,
      default_branch TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS data_center_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id TEXT,
      name TEXT,
      description TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ai_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kb_id INTEGER REFERENCES knowledge_bases(id),
      type TEXT,
      content TEXT,
      prompt TEXT,
      dir_path TEXT,
      report_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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
      kb_id INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kb_id INTEGER NOT NULL REFERENCES knowledge_bases(id),
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      indexed_at TEXT,
      UNIQUE(kb_id, path)
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL REFERENCES documents(id),
      content TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority TEXT DEFAULT 'mid',
      due_date TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  saveDb();
}

/** Migrate from old app branch schema to plan branch schema */
function migrate() {
  const version = schemaVersion();

  if (version < 1) {
    setSchemaVersion(1);

  // 1) knowledge_bases: old schema uses TEXT id + path; new uses INTEGER id + notes_dir
  const hasOldKb = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_bases' AND sql LIKE '%TEXT%id%'");
  if (!hasOldKb) {
    // new-style kb table exists; just add missing columns
    try { db.run("ALTER TABLE knowledge_bases ADD COLUMN notes_dir TEXT"); } catch {}
    try { db.run("ALTER TABLE knowledge_bases ADD COLUMN labels TEXT"); } catch {}
    try { db.run("ALTER TABLE knowledge_bases ADD COLUMN sort_order INTEGER DEFAULT 0"); } catch {}
    try { db.run("ALTER TABLE knowledge_bases ADD COLUMN dir_settings TEXT"); } catch {}
    try { db.run("ALTER TABLE knowledge_bases ADD COLUMN ignore_dirs TEXT"); } catch {}
    try { db.run("ALTER TABLE knowledge_bases ADD COLUMN ignore_files TEXT"); } catch {}
    try { db.run("ALTER TABLE knowledge_bases ADD COLUMN auto_report INTEGER DEFAULT 0"); } catch {}
    try { db.run("ALTER TABLE knowledge_bases ADD COLUMN feishu_push INTEGER DEFAULT 0"); } catch {}
  } else {
    // old-style kb table: copy to new table, drop old
    const oldKbs = q('SELECT * FROM knowledge_bases');
    db.run("DROP TABLE IF EXISTS knowledge_bases");
    db.run(`
      CREATE TABLE knowledge_bases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        notes_dir TEXT,
        labels TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        dir_settings TEXT,
        ignore_dirs TEXT,
        ignore_files TEXT,
        auto_report INTEGER DEFAULT 0,
        feishu_push INTEGER DEFAULT 0
      )
    `);
    for (const kb of oldKbs) {
      db.run("INSERT INTO knowledge_bases (name, notes_dir, created_at) VALUES (?, ?, ?)",
        kb.name, kb.path || kb.notes_dir || '', kb.created_at);
    }
  }

  // 2) chat_sessions → sessions
  const hasLegacySessions = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_sessions'");
  if (hasLegacySessions) {
    const legacySessions = q('SELECT * FROM chat_sessions');
    for (const s of legacySessions) {
      if (!s.id) continue;
      db.run("INSERT OR IGNORE INTO sessions (id, source, title, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        s.id, s.source || 'ui', s.title || '新对话', s.agent_type || 'general', s.created_at, s.updated_at);
    }
  }

  // 3) chat_messages → messages
  const hasLegacyMessages = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'");
  if (hasLegacyMessages) {
    const legacyMessages = q('SELECT * FROM chat_messages');
    for (const m of legacyMessages) {
      if (!m.session_id) continue;
      db.run("INSERT INTO messages (session_id, role, content, source, created_at) VALUES (?, ?, ?, ?, ?)",
        m.session_id, m.role, m.content, 'ui', m.created_at);
    }
  }

  // 4) old projects → coding_projects
  const hasOldProjects = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'");
  if (hasOldProjects) {
    const old = q('SELECT * FROM projects');
    for (const p of old) {
      db.run("INSERT INTO coding_projects (name, dir, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        p.name, p.code_directory || '', p.description || '', p.created_at, p.updated_at);
    }
  }

  // 5) old dataset_schemas → data_center_datasets
  const hasOldDs = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='dataset_schemas'");
  if (hasOldDs) {
    const old = q('SELECT * FROM dataset_schemas');
    for (const d of old) {
      db.run("INSERT INTO data_center_datasets (dataset_id, name, schema_json, created_at) VALUES (?, ?, ?, ?)",
        d.id, d.name, d.schema_json, d.created_at);
    }
  }

  // 6) old dataset_records → data_center_records
  const hasOldDsRec = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='dataset_records'");
  if (hasOldDsRec) {
    const old = q('SELECT * FROM dataset_records');
    for (const r of old) {
      db.run("INSERT INTO data_center_records (dataset_id, data_json, created_at) VALUES (?, ?, ?)",
        r.dataset_id, r.data_json, r.created_at);
    }
  }

  // 7) old scheduled_tasks → collector_tasks
  const hasOldTasks = qOne("SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_tasks'");
  if (hasOldTasks) {
    const old = q('SELECT * FROM scheduled_tasks');
    for (const t of old) {
      db.run("INSERT INTO collector_tasks (task_id, name, cron_expression, task_type, params_json, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        t.id, t.name, t.cron_expr, t.task_type, t.config_json, t.enabled, t.created_at);
    }
  }

  // 8) documents table: old uses TEXT kb_id; new uses INTEGER
  // If old documents table had TEXT kb_id referencing old kb, it still works
  // Just add missing columns if needed
  try { db.run("ALTER TABLE documents ADD COLUMN kb_id INTEGER"); } catch {}

  // 9) Add notify_feishu column to existing collector_tasks
  try { db.run("ALTER TABLE collector_tasks ADD COLUMN notify_feishu INTEGER DEFAULT 1"); } catch {}
  }

  if (version < 2) {
    try { db.run("ALTER TABLE knowledge_bases ADD COLUMN is_default INTEGER DEFAULT 0"); } catch {}
    setSchemaVersion(2);
  }

  if (version < 3) {
    try { db.run("ALTER TABLE documents ADD COLUMN file_mtime INTEGER"); } catch {}
    setSchemaVersion(3);
  }

  if (version < 4) {
    try { db.run("ALTER TABLE coding_messages ADD COLUMN images TEXT DEFAULT NULL"); } catch {}
    try { db.run("ALTER TABLE messages ADD COLUMN images TEXT DEFAULT NULL"); } catch {}
    setSchemaVersion(4);
  }

  // Ensure notify_feishu column exists (for tables created before the column was added)
  try { db.run("ALTER TABLE collector_tasks ADD COLUMN notify_feishu INTEGER DEFAULT 1"); } catch {}

  // Seed default system tasks
  try {
    const existing = qOne("SELECT id FROM collector_tasks WHERE task_type = 'daily_report'");
    if (!existing) {
      db.run("INSERT INTO collector_tasks (task_id, name, cron_expression, task_type, params_json, enabled, notify_feishu) VALUES ('sys_daily_report', '综合日报', '56 9 * * *', 'daily_report', '{\"kb_id\":1}', 1, 1)");
    }
  } catch (e) { console.error('[DB] seed task error:', e); }

  try {
    const existing = qOne("SELECT id FROM collector_tasks WHERE task_type = 'auto_index'");
    if (!existing) {
      db.run("INSERT INTO collector_tasks (task_id, name, cron_expression, task_type, params_json, enabled, notify_feishu) VALUES ('sys_auto_index', '自动索引笔记库', '0 */2 * * *', 'auto_index', '{\"kb_id\":1}', 1, 0)");
    }
  } catch (e) { console.error('[DB] seed auto_index error:', e); }

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

// ========== Knowledge Bases ==========
const kb = {
  list: () => q('SELECT * FROM knowledge_bases ORDER BY sort_order ASC, created_at DESC').map(kb => ({ ...kb, path: kb.notes_dir })),
  get: (id) => { const r = qOne('SELECT * FROM knowledge_bases WHERE id = ?', id); return r ? { ...r, path: r.notes_dir } : null; },
  add: (name, notesDir) => {
    run('INSERT INTO knowledge_bases (name, notes_dir) VALUES (?, ?)', name, notesDir || '');
    const r = qOne('SELECT id FROM knowledge_bases WHERE name = ? AND notes_dir = ?', name, notesDir || '');
    return { id: r.id, name, path: notesDir, notes_dir: notesDir };
  },
  remove: (id) => {
    run('DELETE FROM chunks WHERE doc_id IN (SELECT id FROM documents WHERE kb_id = ?)', id);
    run('DELETE FROM documents WHERE kb_id = ?', id);
    run('DELETE FROM note_embeddings WHERE kb_id = ?', id);
    run('DELETE FROM knowledge_bases WHERE id = ?', id);
  },
  docCount: (kbId) => { const r = qOne('SELECT COUNT(*) as c FROM documents WHERE kb_id = ?', kbId); return r ? r.c : 0; },
  insertDoc: (kbId, pathVal, content, fileMtime) => {
    run("INSERT OR REPLACE INTO documents (kb_id, path, content, indexed_at, file_mtime) VALUES (?, ?, ?, datetime('now'), ?)", kbId, pathVal, content, fileMtime || null);
    const r = qOne('SELECT id FROM documents WHERE kb_id = ? AND path = ?', kbId, pathVal);
    return r.id;
  },
  insertChunk: (docId, content) => run('INSERT INTO chunks (doc_id, content) VALUES (?, ?)', docId, content),
  getChunks: (kbId) => q('SELECT c.content FROM chunks c JOIN documents d ON c.doc_id = d.id WHERE d.kb_id = ?', kbId).map(r => r.content),
  deleteDocs: (kbId) => { run('DELETE FROM chunks WHERE doc_id IN (SELECT id FROM documents WHERE kb_id = ?)', kbId); run('DELETE FROM documents WHERE kb_id = ?', kbId); },
  setDefault: (id) => {
    run('UPDATE knowledge_bases SET is_default = 0 WHERE is_default = 1');
    if (id) run('UPDATE knowledge_bases SET is_default = 1 WHERE id = ?', id);
  },
  getDefault: () => {
    const r = qOne('SELECT * FROM knowledge_bases WHERE is_default = 1');
    return r ? { ...r, path: r.notes_dir } : null;
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
    if (fields.length) { fields.push("updated_at = datetime('now')"); params.push(id); run(`UPDATE data_center_modules SET ${fields.join(', ')} WHERE id = ?`, ...params); }
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
    if (fields.length) { fields.push("updated_at = datetime('now')"); params.push(id); run(`UPDATE data_center_datasets SET ${fields.join(', ')} WHERE id = ? OR dataset_id = ?`, ...params, id); }
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

// ========== Sessions & Messages ==========
const chat = {
  sessions: () => q("SELECT s.*, (SELECT content FROM messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM sessions s ORDER BY updated_at DESC"),
  sessionsBySource: (source) => q(`SELECT s.*, (SELECT COUNT(*) FROM messages WHERE session_id = s.id) as msg_count, (SELECT content FROM messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM sessions s WHERE source = ? ORDER BY updated_at DESC`, source),
  createSession: (id, title, mode, source) => {
    run("INSERT OR IGNORE INTO sessions (id, source, title, mode) VALUES (?, ?, ?, ?)", id, source || 'ui', title || '新对话', mode || 'general');
    return { id };
  },
  addMessage: (sessionId, role, content, mode, source, images) => {
    const imagesJson = images?.length ? JSON.stringify(images) : null;
    run("INSERT INTO messages (session_id, role, content, mode, source, images) VALUES (?, ?, ?, ?, ?, ?)", sessionId, role, content, mode || 'general', source || 'ui', imagesJson);
    run("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?", sessionId);
  },
  messages: (sessionId) => {
    const rows = q("SELECT * FROM messages WHERE session_id = ? ORDER BY id", sessionId);
    return rows.map(r => ({ ...r, images: r.images ? JSON.parse(r.images) : null }));
  },
  deleteSession: (sessionId) => { run("DELETE FROM turn_embeddings WHERE session_id = ?", sessionId); run('DELETE FROM messages WHERE session_id = ?', sessionId); run('DELETE FROM sessions WHERE id = ?', sessionId); },
  updateSessionTitle: (id, title) => { run("UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?", title, id); },
  updateSessionMode: (id, mode) => { run("UPDATE sessions SET mode = ?, updated_at = datetime('now') WHERE id = ?", mode, id); },
  sessionsByProject: (projectId) => q("SELECT s.*, (SELECT content FROM messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM sessions s WHERE s.project_id = ? ORDER BY s.updated_at DESC", projectId),
  createCodingSession: (id, projectId, title, agent) => {
    run("INSERT OR IGNORE INTO sessions (id, source, title, mode, project_id, active_agent) VALUES (?, 'ui', ?, 'coding', ?, ?)", id, title || '新对话', projectId, agent || 'pi');
    return qOne('SELECT * FROM sessions WHERE id = ?', id);
  },
  updateSessionAgent: (id, agent) => { run("UPDATE sessions SET active_agent = ?, updated_at = datetime('now') WHERE id = ?", agent, id); },
  getSession: (id) => qOne('SELECT * FROM sessions WHERE id = ?', id),
};

// ========== Projects ==========
const project = {
  list: () => q('SELECT * FROM coding_projects ORDER BY updated_at DESC, created_at DESC'),
  get: (id) => qOne('SELECT * FROM coding_projects WHERE id = ?', id),
  add: (name, dir, description, defaultBranch) => {
    run('INSERT INTO coding_projects (name, dir, description, default_branch) VALUES (?, ?, ?, ?)', name, dir || '', description || '', defaultBranch || '');
    const r = qOne('SELECT id FROM coding_projects WHERE name = ?', name);
    return { id: r.id, name };
  },
  update: (id, data) => {
    const fields = []; const params = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.dir !== undefined) { fields.push('dir = ?'); params.push(data.dir); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.default_branch !== undefined) { fields.push('default_branch = ?'); params.push(data.default_branch); }
    if (data.is_default !== undefined) { fields.push('is_default = ?'); params.push(data.is_default ? 1 : 0); }
    if (fields.length) {
      fields.push("updated_at = datetime('now')");
      params.push(id);
      run(`UPDATE coding_projects SET ${fields.join(', ')} WHERE id = ?`, ...params);
    }
  },
  delete: (id) => run('DELETE FROM coding_projects WHERE id = ?', id),
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
    if (fields.length) { fields.push("updated_at = datetime('now')"); params.push(id); run(`UPDATE collector_tasks SET ${fields.join(', ')} WHERE id = ?`, ...params); }
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
    run('INSERT OR IGNORE INTO reminders (id, name, message, type, time, date, day_of_week, day_of_month, month_day, enabled, created_at, last_triggered, kb_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, data.name, data.message || '', data.type, data.time || '09:00', data.date || '',
      data.day_of_week || 0, data.day_of_month || 1, data.month_day || '',
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1,
      data.created_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
      data.last_triggered || '', data.kb_id || null);
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
    if (fields.length) { fields.push("updated_at = datetime('now')"); params.push(id); run(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`, ...params); }
  },
  remove: (id) => run('DELETE FROM todos WHERE id = ?', id),
};

function close() {
  if (db) { saveDb(); db.close(); db = null; }
}

// ========== Coding Workbench ==========
const coding = {
  createSession: (id, projectId, title, agent) => {
    run("INSERT OR IGNORE INTO coding_sessions (id, project_id, title, active_agent) VALUES (?, ?, ?, ?)", id, projectId, title || '新对话', agent || 'pi');
    return qOne('SELECT * FROM coding_sessions WHERE id = ?', id);
  },
  sessionsByProject: (projectId) => q("SELECT s.*, (SELECT content FROM coding_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM coding_sessions s WHERE s.project_id = ? ORDER BY s.updated_at DESC", projectId),
  getSession: (id) => qOne('SELECT * FROM coding_sessions WHERE id = ?', id),
  updateSessionTitle: (id, title) => { run("UPDATE coding_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?", title, id); },
  updateSessionAgent: (id, agent) => { run("UPDATE coding_sessions SET active_agent = ?, updated_at = datetime('now') WHERE id = ?", agent, id); },
  deleteSession: (sessionId) => { run('DELETE FROM coding_messages WHERE session_id = ?', sessionId); run('DELETE FROM coding_sessions WHERE id = ?', sessionId); },
  addMessage: (sessionId, role, content, mode, images) => {
    const imagesJson = images?.length ? JSON.stringify(images) : null;
    run("INSERT INTO coding_messages (session_id, role, content, mode, images) VALUES (?, ?, ?, ?, ?)", sessionId, role, content, mode || 'pi', imagesJson);
    run("UPDATE coding_sessions SET updated_at = datetime('now') WHERE id = ?", sessionId);
  },
  messages: (sessionId) => {
    const rows = q("SELECT * FROM coding_messages WHERE session_id = ? ORDER BY id", sessionId);
    return rows.map(r => ({ ...r, images: r.images ? JSON.parse(r.images) : null }));
  },
};

module.exports = { getDb, close, q, qOne, run, runMany, configGet, configSet, kb, dm, ds, chat, task, reminder, todo, project, coding };
