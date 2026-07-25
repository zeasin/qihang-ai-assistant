const fs = require('fs');
const path = require('path');
const rag = require('./rag');

const CONFIG_DIR = path.join(require('os').homedir(), '.biling-ai');
const CONFIG_PATH = path.join(CONFIG_DIR, 'knowledge-bases.json');

function ensureConfig() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, '[]');
}

function list() {
  ensureConfig();
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  return raw.map(kb => ({
    ...kb,
    status: rag.getIndexStatus(kb.id),
  }));
}

function add(name, dirPath) {
  ensureConfig();
  const kbs = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const id = 'kb_' + Date.now();
  kbs.push({ id, name, path: dirPath, createdAt: new Date().toISOString() });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(kbs, null, 2));
  return { id, name, path: dirPath };
}

function remove(id) {
  ensureConfig();
  const kbs = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const filtered = kbs.filter(kb => kb.id !== id);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(filtered, null, 2));
  const indexPath = path.join(
    require('os').homedir(), '.biling-ai', 'rag', `${id}.json`
  );
  if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);
}

function getById(id) {
  ensureConfig();
  const kbs = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  return kbs.find(kb => kb.id === id) || null;
}

async function scan(id) {
  const kb = getById(id);
  if (!kb) throw new Error(`知识库 ${id} 不存在`);
  return await rag.indexKnowledgeBase(id, kb.path);
}

async function search(id, query) {
  return await rag.searchKnowledgeBase(id, query);
}

module.exports = { list, add, remove, getById, scan, search };