const fs = require('fs');
const path = require('path');
const db = require('./database');
const rag = require('./rag');
const logger = require('./logger');

let watchers = new Map();
let running = false;

async function indexSingle(kbId) {
  const kb = db.kb.get(kbId);
  if (!kb) throw new Error(`知识库 ${kbId} 不存在`);
  logger.info(`[Indexer] indexing: ${kb.name} (${kb.path})`);
  const result = await rag.indexKnowledgeBase(kbId, kb.path);
  db.kb.deleteDocs(kbId);

  // Walk directory and store documents
  const files = [];
  walkDir(kb.path, files);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const docId = db.kb.insertDoc(kbId, file, content);
    const chunks = rag.chunkText(content);
    for (const chunk of chunks) {
      db.kb.insertChunk(docId, chunk);
    }
  }
  logger.info(`[Indexer] indexed ${result.totalChunks} chunks from ${files.length} files`);
  return result;
}

async function indexAll() {
  const kbs = db.kb.list();
  for (const kb of kbs) {
    try {
      await indexSingle(kb.id);
    } catch (e) {
      logger.error(`[Indexer] error indexing ${kb.name}:`, e.message);
    }
  }
}

function watchAll() {
  stopWatching();
  const kbs = db.kb.list();
  for (const kb of kbs) {
    if (!fs.existsSync(kb.path)) continue;
    try {
      const watcher = fs.watch(kb.path, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return;
        logger.info(`[Indexer] change detected: ${filename}`);
        debounceIndex(kb.id);
      });
      watchers.set(kb.id, watcher);
    } catch (e) {
      logger.error(`[Indexer] watch error for ${kb.name}:`, e.message);
    }
  }
}

const debounceTimers = new Map();
function debounceIndex(kbId) {
  if (debounceTimers.has(kbId)) clearTimeout(debounceTimers.get(kbId));
  debounceTimers.set(kbId, setTimeout(async () => {
    debounceTimers.delete(kbId);
    try {
      await indexSingle(kbId);
    } catch (e) {
      logger.error(`[Indexer] debounce index error:`, e.message);
    }
  }, 10000));
}

function stopWatching() {
  for (const [id, watcher] of watchers) {
    watcher.close();
  }
  watchers.clear();
}

function start() {
  if (running) return;
  running = true;
  watchAll();
  logger.info('[Indexer] started');
}

function stop() {
  running = false;
  stopWatching();
  for (const t of debounceTimers.values()) clearTimeout(t);
  debounceTimers.clear();
  logger.info('[Indexer] stopped');
}

function isRunning() { return running; }

function walkDir(dir, files) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, files);
    else if (entry.name.endsWith('.md')) files.push(full);
  }
}

module.exports = { start, stop, isRunning, indexSingle, indexAll, watchAll };