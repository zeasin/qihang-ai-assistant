import * as fs from 'fs';
import * as path from 'path';
import * as db from './database';
import * as rag from './rag';
import logger from './logger';

let watchers = new Map();
let running = false;

async function indexSingle(dir, onProgress?) {
  logger.info(`[Indexer] indexing: ${dir}`);

  // 清空旧索引
  db.project.deleteDocs();

  // 扫描文件，写入 kb_documents 和 kb_chunks（纯文本）
  const files: any[] = [];
  walkDir(dir, files, [], []);
  const total = files.length;
  for (let i = 0; i < total; i++) {
    const file = files[i];
    if (onProgress) onProgress({ phase: 'scan', current: i + 1, total, file: path.basename(file) });
    const content = fs.readFileSync(file, 'utf-8');
    const stat = fs.statSync(file);
    const title = rag.extractTitle(content) || path.basename(file, '.md');
    const docId = db.project.insertDoc(file, content, stat.mtimeMs, title);
    const chunks = rag.chunkText(content);
    for (const chunk of chunks) {
      db.project.insertChunk(docId, chunk, null);
    }
  }
  logger.info(`[Indexer] indexed ${total} files, generating embeddings...`);

  // 为所有新 chunk 生成向量嵌入
  if (onProgress) onProgress({ phase: 'embed', current: 0, total: 0, file: '' });
  const embedded = await rag.indexProjectChunks(db, onProgress);
  logger.info(`[Indexer] done: ${total} files, ${embedded} chunks embedded`);
  return { totalChunks: embedded, files: total };
}

async function indexAll(onProgress?) {
  const noteProjects = db.project.list('note');
  for (const p of noteProjects) {
    try {
      await indexSingle(p.dir, onProgress);
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
        debounceIndex(p.dir);
      });
      watchers.set(p.dir, watcher);
    } catch (e) {
      logger.error(`[Indexer] watch error for ${p.name}:`, e.message);
    }
  }
}

const debounceTimers = new Map();
function debounceIndex(dir) {
  if (debounceTimers.has(dir)) clearTimeout(debounceTimers.get(dir));
  debounceTimers.set(dir, setTimeout(async () => {
    debounceTimers.delete(dir);
    try {
      await indexSingle(dir);
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

const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '__pycache__', '.cache']);

function walkDir(dir, files, ignoreDirs: any[] = [], ignoreFiles: any[] = []) {
  if (!fs.existsSync(dir)) return;
  const skipDirs = new Set([...IGNORED_DIRS, ...ignoreDirs.map(d => d.trim()).filter(Boolean)]);
  const skipFilePatterns = ignoreFiles.map(f => f.trim()).filter(Boolean).map(f => new RegExp(f.replace(/\*/g, '.*').replace(/\?/g, '.')));
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name) || entry.name.startsWith('.')) continue;
      walkDir(path.join(dir, entry.name), files, ignoreDirs, ignoreFiles);
    } else if (entry.name.endsWith('.md')) {
      if (skipFilePatterns.some(p => p.test(entry.name))) continue;
      files.push(path.join(dir, entry.name));
    }
  }
}

export { start, stop, isRunning, indexSingle, indexAll, watchAll };
