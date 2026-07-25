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
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS knowledge_bases (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY AUTOINCREMENT, kb_id TEXT NOT NULL REFERENCES knowledge_bases(id), path TEXT NOT NULL, content TEXT NOT NULL, indexed_at TEXT, UNIQUE(kb_id, path));
    CREATE TABLE IF NOT EXISTS chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER NOT NULL REFERENCES documents(id), content TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dataset_schemas (id TEXT PRIMARY KEY, name TEXT NOT NULL, schema_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS dataset_records (id INTEGER PRIMARY KEY AUTOINCREMENT, dataset_id TEXT NOT NULL REFERENCES dataset_schemas(id), data_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS chat_sessions (id TEXT PRIMARY KEY, title TEXT, agent_type TEXT NOT NULL DEFAULT 'pi', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES chat_sessions(id), role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS scheduled_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, cron_expr TEXT, task_type TEXT NOT NULL, config_json TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
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
  list: () => q('SELECT * FROM knowledge_bases ORDER BY created_at DESC'),
  get: (id) => qOne('SELECT * FROM knowledge_bases WHERE id = ?', id),
  add: (id, name, pathVal) => { run('INSERT INTO knowledge_bases (id, name, path) VALUES (?, ?, ?)', id, name, pathVal); return { id, name, path: pathVal }; },
  remove: (id) => { run('DELETE FROM chunks WHERE doc_id IN (SELECT id FROM documents WHERE kb_id = ?)', id); run('DELETE FROM documents WHERE kb_id = ?', id); run('DELETE FROM knowledge_bases WHERE id = ?', id); },
  docCount: (kbId) => { const r = qOne('SELECT COUNT(*) as c FROM documents WHERE kb_id = ?', kbId); return r ? r.c : 0; },
  insertDoc: (kbId, pathVal, content) => {
    run('INSERT OR REPLACE INTO documents (kb_id, path, content, indexed_at) VALUES (?, ?, ?, datetime(\'now\'))', kbId, pathVal, content);
    const r = qOne('SELECT id FROM documents WHERE kb_id = ? AND path = ?', kbId, pathVal);
    return r.id;
  },
  insertChunk: (docId, content) => run('INSERT INTO chunks (doc_id, content) VALUES (?, ?)', docId, content),
  getChunks: (kbId) => q('SELECT c.content FROM chunks c JOIN documents d ON c.doc_id = d.id WHERE d.kb_id = ?', kbId).map(r => r.content),
  deleteDocs: (kbId) => { run('DELETE FROM chunks WHERE doc_id IN (SELECT id FROM documents WHERE kb_id = ?)', kbId); run('DELETE FROM documents WHERE kb_id = ?', kbId); },
};

// ========== Datasets ==========
const ds = {
  list: () => q('SELECT * FROM dataset_schemas ORDER BY created_at DESC'),
  get: (id) => qOne('SELECT * FROM dataset_schemas WHERE id = ?', id),
  add: (id, name, schemaJson) => { run('INSERT INTO dataset_schemas (id, name, schema_json) VALUES (?, ?, ?)', id, name, schemaJson); return { id, name }; },
  remove: (id) => { run('DELETE FROM dataset_records WHERE dataset_id = ?', id); run('DELETE FROM dataset_schemas WHERE id = ?', id); },
  query: (datasetId, conditions) => {
    let sql = 'SELECT * FROM dataset_records WHERE dataset_id = ?';
    const params = [datasetId];
    if (conditions) { sql += ' AND data_json LIKE ?'; params.push(`%${conditions}%`); }
    sql += ' ORDER BY created_at DESC LIMIT 50';
    return q(sql, ...params).map(r => ({ id: r.id, ...JSON.parse(r.data_json), _created_at: r.created_at }));
  },
  insert: (datasetId, dataObj) => run('INSERT INTO dataset_records (dataset_id, data_json) VALUES (?, ?)', datasetId, JSON.stringify(dataObj)),
  update: (id, dataObj) => run('UPDATE dataset_records SET data_json = ? WHERE id = ?', JSON.stringify(dataObj), id),
  delete: (id) => run('DELETE FROM dataset_records WHERE id = ?', id),
};

// ========== Chat Sessions ==========
const chat = {
  sessions: () => q('SELECT s.*, (SELECT content FROM chat_messages WHERE session_id = s.id ORDER BY id DESC LIMIT 1) as last_message FROM chat_sessions s ORDER BY updated_at DESC'),
  createSession: (id, title, agentType) => { run('INSERT INTO chat_sessions (id, title, agent_type) VALUES (?, ?, ?)', id, title || '新对话', agentType || 'pi'); return { id }; },
  addMessage: (sessionId, role, content) => { run('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)', sessionId, role, content); run("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?", sessionId); },
  messages: (sessionId) => q('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id', sessionId),
  deleteSession: (sessionId) => { run('DELETE FROM chat_messages WHERE session_id = ?', sessionId); run('DELETE FROM chat_sessions WHERE id = ?', sessionId); },
};

// ========== Scheduled Tasks ==========
const task = {
  list: () => q('SELECT * FROM scheduled_tasks ORDER BY created_at DESC'),
  add: (id, name, cronExpr, taskType, configJson) => { run('INSERT INTO scheduled_tasks (id, name, cron_expr, task_type, config_json) VALUES (?, ?, ?, ?, ?)', id, name, cronExpr, taskType, configJson || '{}'); return { id }; },
  remove: (id) => run('DELETE FROM scheduled_tasks WHERE id = ?', id),
  setEnabled: (id, enabled) => run('UPDATE scheduled_tasks SET enabled = ? WHERE id = ?', enabled ? 1 : 0, id),
  getActive: () => q('SELECT * FROM scheduled_tasks WHERE enabled = 1'),
};

function close() {
  if (db) { saveDb(); db.close(); db = null; }
}

module.exports = { getDb, close, configGet, configSet, kb, ds, chat, task };