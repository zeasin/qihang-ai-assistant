const fs = require('fs');
const path = require('path');
const db = require('./database');
const rag = require('./rag');
const logger = require('./logger');

let watchers = new Map();
let running = false;

async function indexSingle(projectId) {
  const project = db.project.get(projectId);
  if (!project) throw new Error(`项目 ${projectId} 不存在`);
  if (project.type !== 'note') throw new Error(`项目 ${project.name} 不是笔记库类型`);
  logger.info(`[Indexer] indexing: ${project.name} (${project.dir})`);
  const result = await rag.indexKnowledgeBase(projectId, project.dir);
  db.project.deleteDocs(projectId);

  const files = [];
  walkDir(project.dir, files);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const stat = fs.statSync(file);
    const docId = db.project.insertDoc(projectId, file, content, stat.mtimeMs);
    const chunks = rag.chunkText(content);
    for (const chunk of chunks) {
      db.project.insertChunk(docId, chunk);
    }
  }
  logger.info(`[Indexer] indexed ${result.totalChunks} chunks from ${files.length} files`);
  return result;
}

async function indexAll() {
  const noteProjects = db.project.list('note');
  for (const p of noteProjects) {
    try {
      await indexSingle(p.id);
    } catch (e) {
      logger.error(`[Indexer] error indexing ${p.name}:`, e.message);
    }
  }
}

function watchAll() {
  stopWatching();
  const noteProjects = db.project.list('note');
  for (const p of noteProjects) {
    if (!fs.existsSync(p.dir)) continue;
    try {
      const watcher = fs.watch(p.dir, { recursive: true }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.md')) return;
        logger.info(`[Indexer] change detected: ${filename}`);
        debounceIndex(p.id);
      });
      watchers.set(p.id, watcher);
    } catch (e) {
      logger.error(`[Indexer] watch error for ${p.name}:`, e.message);
    }
  }
}

const debounceTimers = new Map();
function debounceIndex(projectId) {
  if (debounceTimers.has(projectId)) clearTimeout(debounceTimers.get(projectId));
  debounceTimers.set(projectId, setTimeout(async () => {
    debounceTimers.delete(projectId);
    try {
      await indexSingle(projectId);
    } catch (e) {
      logger.error(`[Indexer] debounce index error:`, e.message);
    }
  }, 10000));
}

function stopWatching() {
  for (const watcher of watchers.values()) {
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

const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '.opencode', '__pycache__', '.cache']);

function walkDir(dir, files) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walkDir(path.join(dir, entry.name), files);
    } else if (entry.name.endsWith('.md')) {
      files.push(path.join(dir, entry.name));
    }
  }
}

module.exports = { start, stop, isRunning, indexSingle, indexAll, watchAll };
