const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(require('os').homedir(), '.qihang-work-ai', 'logs');

const MAX_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 5;
const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

let currentLogLevel = 'DEBUG';
let currentFile = null;
let currentSize = 0;

// 防止 stdout/stderr pipe 断裂时触发未捕获异常
function setupPipeErrorHandler() {
  for (const stream of [process.stdout, process.stderr]) {
    if (stream && typeof stream.on === 'function' && stream.listenerCount('error') === 0) {
      stream.on('error', (err) => {
        if (err && err.code === 'EPIPE') { /* pipe broken, silently ignore */ }
      });
    }
  }
}
setupPipeErrorHandler();

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getLogPath() {
  return path.join(LOG_DIR, 'app.log');
}

function getArchivedPath(index) {
  return path.join(LOG_DIR, `app.${index}.log`);
}

function rotateIfNeeded() {
  ensureDir();
  const logPath = getLogPath();
  if (!fs.existsSync(logPath)) return;
  const stat = fs.statSync(logPath);
  if (stat.size < MAX_SIZE) {
    currentSize = stat.size;
    return;
  }
  for (let i = MAX_FILES - 1; i >= 1; i--) {
    const oldPath = getArchivedPath(i);
    const newPath = getArchivedPath(i + 1);
    if (fs.existsSync(oldPath)) {
      try { fs.renameSync(oldPath, newPath); } catch {}
    }
  }
  const firstArchive = getArchivedPath(1);
  if (fs.existsSync(firstArchive)) {
    try { fs.unlinkSync(firstArchive); } catch {}
  }
  try { fs.renameSync(logPath, firstArchive); } catch {}
  currentSize = 0;
}

function append(line) {
  ensureDir();
  rotateIfNeeded();
  const logPath = getLogPath();
  try {
    fs.appendFileSync(logPath, line + '\n');
    currentSize += Buffer.byteLength(line, 'utf-8') + 1;
  } catch (e) {
    try { console.error('[Logger] Write error:', e.message); } catch {}
  }
}

function format(level, message, ...args) {
  const now = new Date();
  const ts = now.toISOString();
  let msg = message;
  if (args.length > 0) {
    msg = args.reduce((acc, arg) => {
      if (typeof arg === 'object') return acc.replace(/%[sojd]/i, JSON.stringify(arg));
      return acc.replace(/%[sojd]/i, String(arg));
    }, message);
  }
  return `${ts} [${level}] ${msg}`;
}

const logger = {
  setLevel(level) {
    if (LEVELS[level] !== undefined) currentLogLevel = level;
  },

  debug(message, ...args) {
    if (LEVELS['DEBUG'] < LEVELS[currentLogLevel]) return;
    const line = format('DEBUG', message, ...args);
    append(line);
  },

  info(message, ...args) {
    if (LEVELS['INFO'] < LEVELS[currentLogLevel]) return;
    const line = format('INFO', message, ...args);
    append(line);
    try { console.log(line); } catch (e) { if (e && e.code !== 'EPIPE') throw e; }
  },

  warn(message, ...args) {
    if (LEVELS['WARN'] < LEVELS[currentLogLevel]) return;
    const line = format('WARN', message, ...args);
    append(line);
    try { console.warn(line); } catch (e) { if (e && e.code !== 'EPIPE') throw e; }
  },

  error(message, ...args) {
    if (LEVELS['ERROR'] < LEVELS[currentLogLevel]) return;
    const line = format('ERROR', message, ...args);
    append(line);
    try { console.error(line); } catch (e) { if (e && e.code !== 'EPIPE') throw e; }
  },

  clearLog() {
    ensureDir();
    const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
    for (const f of files) {
      try { fs.unlinkSync(path.join(LOG_DIR, f)); } catch {}
    }
    currentSize = 0;
  },

  getLogDir() {
    return LOG_DIR;
  },

  readLines(options = {}) {
    ensureDir();
    const logPath = getLogPath();
    if (!fs.existsSync(logPath)) return [];
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
    const count = options.count || 50;
    const tail = options.tail !== false;
    return tail ? lines.slice(-count) : lines.slice(0, count);
  },

  listFiles() {
    ensureDir();
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith('app') && f.endsWith('.log'))
      .sort()
      .reverse();
    return files.map(f => {
      const fullPath = path.join(LOG_DIR, f);
      try {
        const stat = fs.statSync(fullPath);
        return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
      } catch {
        return { name: f, size: 0, mtime: '' };
      }
    });
  },

  readFile(fileName, options = {}) {
    ensureDir();
    const filePath = path.join(LOG_DIR, fileName);
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    const count = options.count || 200;
    const tail = options.tail !== false;
    return tail ? lines.slice(-count) : lines.slice(0, count);
  },
};

module.exports = logger;
