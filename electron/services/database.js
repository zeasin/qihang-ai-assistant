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
      dataset_id TEXT,
      params_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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
  }

  if (version < 2) {
    try { db.run("ALTER TABLE knowledge_bases ADD COLUMN is_default INTEGER DEFAULT 0"); } catch {}
    setSchemaVersion(2);
  }

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
  insertDoc: (kbId, pathVal, content) => {
    run('INSERT OR REPLACE INTO documents (kb_id, path, content, indexed_at) VALUES (?, ?, ?, datetime(\'now\'))', kbId, pathVal, content);
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

// ========== Datasets ==========
const ds = {
  list: () => q('SELECT * FROM data_center_datasets ORDER BY created_at DESC'),
  get: (id) => qOne('SELECT * FROM data_center_datasets WHERE id = ?', id),
  add: (name, schemaJson) => {
    const id = 'ds_' + Date.now();
    run('INSERT INTO data_center_datasets (dataset_id, name, schema_json) VALUES (?, ?, ?)', id, name, schemaJson);
    return { id };
  },
  remove: (id) => { run('DELETE FROM data_center_records WHERE dataset_id = ?', id); run('DELETE FROM data_center_datasets WHERE id = ?', id); },
  query: (datasetId, conditions) => {
    let sql = "SELECT * FROM data_center_records WHERE dataset_id = ?";
    const params = [datasetId];
    if (conditions) { sql += ' AND data_json LIKE ?'; params.push(`%${conditions}%`); }
    sql += ' ORDER BY created_at DESC LIMIT 50';
    return q(sql, ...params).map(r => ({ id: r.id, ...JSON.parse(r.data_json), _created_at: r.created_at }));
  },
  insert: (datasetId, dataObj) => run("INSERT INTO data_center_records (dataset_id, data_json) VALUES (?, ?)", datasetId, JSON.stringify(dataObj)),
  update: (id, dataObj) => run('UPDATE data_center_records SET data_json = ? WHERE id = ?', JSON.stringify(dataObj), id),
  delete: (id) => run('DELETE FROM data_center_records WHERE id = ?', id),
};

// ========== Sessions & Messages ==========
const chat = {
  sessions: () => q("SELECT s.*, (SELECT content FROM messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM sessions s ORDER BY updated_at DESC"),
  sessionsBySource: (source) => q("SELECT s.*, (SELECT content FROM messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM sessions s WHERE source = ? ORDER BY updated_at DESC", source),
  createSession: (id, title, mode, source) => {
    run("INSERT OR IGNORE INTO sessions (id, source, title, mode) VALUES (?, ?, ?, ?)", id, source || 'ui', title || '新对话', mode || 'general');
    return { id };
  },
  addMessage: (sessionId, role, content, mode, source) => {
    run("INSERT INTO messages (session_id, role, content, mode, source) VALUES (?, ?, ?, ?, ?)", sessionId, role, content, mode || 'general', source || 'ui');
    run("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?", sessionId);
  },
  messages: (sessionId) => q("SELECT * FROM messages WHERE session_id = ? ORDER BY id", sessionId),
  deleteSession: (sessionId) => { run("DELETE FROM turn_embeddings WHERE session_id = ?", sessionId); run('DELETE FROM messages WHERE session_id = ?', sessionId); run('DELETE FROM sessions WHERE id = ?', sessionId); },
  updateSessionTitle: (id, title) => { run("UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?", title, id); },
  updateSessionMode: (id, mode) => { run("UPDATE sessions SET mode = ?, updated_at = datetime('now') WHERE id = ?", mode, id); },
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
  add: (id, name, cronExpr, taskType, configJson) => {
    run('INSERT INTO collector_tasks (task_id, name, cron_expression, task_type, params_json) VALUES (?, ?, ?, ?, ?)', id, name, cronExpr, taskType, configJson || '{}');
    return { id };
  },
  remove: (id) => run('DELETE FROM collector_tasks WHERE id = ?', id),
  setEnabled: (id, enabled) => run('UPDATE collector_tasks SET enabled = ? WHERE id = ?', enabled ? 1 : 0, id),
  getActive: () => q("SELECT * FROM collector_tasks WHERE enabled = 1"),
};

function close() {
  if (db) { saveDb(); db.close(); db = null; }
}

module.exports = { getDb, close, configGet, configSet, kb, ds, chat, task, project };
