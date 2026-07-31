const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Suppress EPIPE errors from console (harmless when console pipe closes)
const { Console } = require('console');
['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
  const orig = Console.prototype[method];
  Console.prototype[method] = function(...args) {
    try { return orig.apply(this, args); } catch (e) { if (e && e.code !== 'EPIPE') throw e; }
  };
});
process.on('uncaughtException', (err) => {
  if (err && err.code === 'EPIPE') return;
});
process.on('unhandledRejection', (err) => {
  if (err && err.code === 'EPIPE') return;
});
// 流层面的 EPIPE 不会被 uncaughtException 捕获，需要直接绑定 error listener
for (const s of [process.stdout, process.stderr]) {
  if (s && typeof s.on === 'function') {
    s.on('error', (err) => { if (err && err.code === 'EPIPE') {} });
  }
}

// Polyfill for Electron: some deps expect worker_threads.markAsUncloneable
try {
  const wt = require('worker_threads');
  if (typeof wt.markAsUncloneable !== 'function') {
    wt.markAsUncloneable = () => {};
  }
} catch {} // worker_threads not available
const db = require('./services/database');
const orchestrator = require('./services/orchestrator');
const llm = require('./services/llm');
const feishu = require('./services/feishu');
const scheduler = require('./services/scheduler');
const indexer = require('./services/indexer');
const logger = require('./services/logger');
const httpserver = require('./services/httpserver');
const { createTrayIcon } = require("./icon");
const rag = require("./services/rag");

let mainWindow = null;
let tray = null;
let backgroundReady = false;

// ========== System Tray ==========

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('启航AI工作台 - 运行中');
  updateTrayMenu();
  tray.on('double-click', () => showWindow());
}

function updateTrayMenu(servicesStatus) {
  const s = servicesStatus || {};
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => showWindow(),
    },
    { type: 'separator' },
    {
      label: `飞书机器人: ${s.feishu ? '● 运行中' : '○ 已停止'}`,
      click: () => mainWindow?.webContents.send('service:toggle', 'feishu'),
    },
    {
      label: `定时任务: ${s.scheduler ? '● 运行中' : '○ 已停止'}`,
      click: () => mainWindow?.webContents.send('service:toggle', 'scheduler'),
    },
    {
      label: `自动索引: ${s.indexer ? '● 运行中' : '○ 已停止'}`,
      click: () => mainWindow?.webContents.send('service:toggle', 'indexer'),
    },
    {
      label: `远程访问: ${s.httpserver ? '● 运行中' : '○ 已停止'}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '重新索引所有知识库',
      click: async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('service:status', { text: '开始重新索引...' });
        }
        await indexer.indexAll();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('service:status', { text: '索引完成' });
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        stopAllServices();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

function showWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

// ========== Window ==========

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1000,
    minHeight: 700,
    title: '启航AI工作台',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f8fafc',
    show: false,
  });

  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:15174');
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function stopAllServices() {
  feishu.stop();
  scheduler.stop();
  indexer.stop();
  httpserver.stop();
}

function getServicesStatus() {
  return {
    feishu: feishu.isRunning(),
    scheduler: scheduler.isRunning(),
    indexer: indexer.isRunning(),
    httpserver: httpserver.isRunning(),
  };
}

function listDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const items = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      items.push({ name: entry.name, path: full, type: 'folder' });
    } else if (entry.isFile()) {
      items.push({ name: entry.name, path: full, type: 'file' });
    }
  }
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return items;
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// ========== Feishu message handler (shared) ==========

function parseFeishuContext(text, db) {
  const projects = db.project.list();
  const noteProjects = projects.filter(p => p.type === 'note');
  let cleanText = text;
  let projectDir = '';
  const projectIds = [];
  let explicit = false;

  const projectMatch = text.match(/\/code\s*[：:]\s*(\S+)/);
  if (projectMatch) {
    const projectName = projectMatch[1];
    const found = projects.find(p => p.name.includes(projectName));
    if (found) { projectDir = found.dir; explicit = true; }
    cleanText = cleanText.replace(projectMatch[0], '').trim();
  }

  const bracketMatch = text.match(/\[笔记库\s*[：:]\s*([^\]]+)\]/);
  if (bracketMatch) {
    const projectName = bracketMatch[1].trim();
    const found = noteProjects.find(p => p.name.includes(projectName) || projectName.includes(p.name));
    if (found) { projectIds.push(found.id); explicit = true; }
    cleanText = cleanText.replace(bracketMatch[0], '').trim();
  }

  const colonMatch = cleanText.match(/笔记库\s*[：:]\s*(\S+)/);
  if (colonMatch && projectIds.length === 0) {
    const projectName = colonMatch[1];
    const found = noteProjects.find(p => p.name.includes(projectName) || projectName.includes(p.name));
    if (found) { projectIds.push(found.id); explicit = true; }
    cleanText = cleanText.replace(colonMatch[0], '').trim();
  }

  if (!explicit) {
    const idMatch = text.match(/^(\d+)\b/);
    if (idMatch) {
      const numId = parseInt(idMatch[1], 10);
      const found = projects.find(p => p.id === numId);
      if (found) {
        if (found.type === 'code') projectDir = found.dir;
        else projectIds.push(found.id);
        explicit = true;
        cleanText = cleanText.replace(idMatch[1], '').trim();
      }
    }
  }

  if (!explicit) {
    for (const p of projects) {
      if (text.startsWith(p.name)) {
        if (p.type === 'code') projectDir = p.dir;
        else projectIds.push(p.id);
        explicit = true;
        cleanText = cleanText.replace(p.name, '').trim();
        break;
      }
    }
  }

  return { projectDir, projectIds, cleanText: cleanText || text, explicit };
}

const feishuMessageHandler = async (msg) => {
  logger.info('═══════════════════════════════════════');
  logger.info(' 飞书消息已接收');
  logger.info(' 发送者: %s', msg.sender);
  logger.info(' 内容: %s', msg.text);
  logger.info(' ChatId: %s', msg.chatId);
  logger.info('═══════════════════════════════════════');

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('feishu:message', msg);
  }

  try {
    const context = parseFeishuContext(msg.text, db);

    if (!context.explicit) {
      const allProjects = db.project.list();
      if (allProjects.length === 0) {
        feishu.replyMessage(msg, '⚠️ 当前没有可用的项目。请先在系统中添加项目后再使用。');
        return;
      }
      let helpMsg = '📋 **请指定要使用的项目**\n\n';
      helpMsg += '在消息中包含项目名称或项目ID即可：\n\n';
      for (const p of allProjects) {
        const typeLabel = p.type === 'code' ? '代码' : '笔记';
        helpMsg += `  **${p.id}**: ${p.name} (${typeLabel}) — ${p.description || p.dir || ''}\n`;
      }
      helpMsg += '\n**示例：**\n';
      helpMsg += `  \`${allProjects[0].name} 帮我看看这个代码\`\n`;
      helpMsg += `  \`${allProjects[0].id} 查一下相关知识\`\n`;
      feishu.replyMessage(msg, helpMsg);
      return;
    }

    let feishuProjectId = null;
    if (context.projectIds.length > 0) {
      feishuProjectId = context.projectIds[0];
    } else if (context.projectDir) {
      const allProjects = db.project.list();
      const byDir = allProjects.find(p => p.dir === context.projectDir);
      if (byDir) feishuProjectId = byDir.id;
    }
    if (!feishuProjectId) {
      const def = db.project.getDefault();
      if (def) feishuProjectId = def.id;
    }
    if (!feishuProjectId) {
      const first = db.project.list();
      if (first.length > 0) feishuProjectId = first[0].id;
    }
    if (!feishuProjectId) {
      feishu.replyMessage(msg, '⚠️ 无法确定项目，请先添加项目后再使用。');
      return;
    }

    feishu.replyMessage(msg, '🤔 AI 正在思考，请稍后...');

    const sessionId = 'feishu_' + feishuProjectId + '_' + msg.sender;
    logger.info(' SessionId: %s', sessionId);

    db.chat.createSession(sessionId, feishuProjectId, msg.text.slice(0, 30), 'feishu', 'pi', 'feishu');
    db.chat.addMessage(sessionId, 'user', msg.text, 'general');

    const kbFallback = { hasResults: false, text: '' };
    const buildKBInjectedPrompt = async () => {
      if (context.projectIds.length === 0) return context.cleanText;
      const projectNames = context.projectIds.map(id => db.project.get(id)?.name).filter(Boolean).join(', ');
      try {
        const rag = require('./services/rag');
        let allResults = [];
        for (const projectId of context.projectIds) {
          const docs = await rag.hybridSearch(projectId, context.cleanText, 5, db);
          allResults.push(...docs);
        }
        allResults.sort((a, b) => b.score - a.score);
        const top = allResults.slice(0, 6);
        if (top.length === 0) {
          const projectDirs = context.projectIds.map(id => db.project.get(id)?.dir).filter(Boolean).join(', ');
          kbFallback.text = `📚 笔记库「${projectNames}」中未找到相关内容。请在笔记库目录中搜索：${projectDirs}`;
          return `笔记库「${projectNames}」的 RAG 索引未命中。请在以下目录中用 grep/find 搜索文件：${projectDirs}\n\n用户问题：${context.cleanText}`;
        }
        const contextText = top.map((d, i) => `【结果${i + 1}】${d.text}`).join('\n\n');
        kbFallback.hasResults = true;
        kbFallback.text = top.map((d, i) => `📄 **相关文档 ${i + 1}**\n${d.text}`).join('\n\n---\n\n');
        return `以下是知识库「${projectNames}」中与问题相关的内容：\n\n${contextText}\n\n请基于以上知识库内容回答用户问题，如果知识库内容不足以回答，请说明。\n\n用户问题：${context.cleanText}`;
      } catch (e) {
        logger.error('[Feishu] KB search error: %s', e.message);
        return context.cleanText;
      }
    };

    const setMode = (mode) => { try { db.run("UPDATE prj_sessions SET mode = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?", mode, sessionId); } catch {} };
    const questionText = await buildKBInjectedPrompt();
    const replyOrchestrator = async (cwd) => {
      const session = await orchestrator.createSession(cwd, sessionId);
      let reply = '';
      const sendReply = (text) => {
        if (text) {
          db.chat.addMessage(sessionId, 'assistant', text, 'general');
          feishu.replyMessage(msg, text);
        }
      };
      await orchestrator.chat(session, questionText,
        (d) => { reply += d; },
        () => {},
        () => {
          logger.info('[Feishu] Sending reply: "%s"', reply.slice(0, 200));
          if (reply) { sendReply(reply); }
          else if (kbFallback.text) { sendReply(kbFallback.text); }
        },
        (e) => {
          logger.error('[Feishu] Chat error: %s', e);
          if (kbFallback.text) { sendReply(kbFallback.text); }
          else { sendReply(`处理出错: ${e}`); }
        }
      );
    };

    if (context.projectDir) {
      setMode('code');
      await replyOrchestrator(context.projectDir);
    } else if (context.projectIds.length > 0) {
      setMode('kb');
      const projectCwd = db.project.get(context.projectIds[0])?.dir || '';
      await replyOrchestrator(projectCwd);
    } else {
      const feishuRouter = require('./services/feishu-router');
      const deps = { db, project: db.project, feishu, orchestrator };

      const intent = feishuRouter.classify(context.cleanText);
      let reply = await feishuRouter.route({
        sender: msg.sender,
        text: context.cleanText,
        chatId: msg.chatId,
        messageId: msg.messageId,
      }, deps);

      if (reply === null) {
        setMode('general');
        await replyOrchestrator('');
      } else {
        const modeMap = { QUERY_INFO: 'query', RECORD_LOG: 'record', CREATE_BUG: 'bug', UPDATE_BUG: 'bug', CODE_INVESTIGATE: 'code', DAILY_REPORT: 'report' };
        setMode(modeMap[intent] || 'general');
        db.chat.addMessage(sessionId, 'assistant', reply, 'general', 'feishu');
        feishu.replyMessage(msg, reply);
      }
    }
  } catch (e) {
    logger.error('[Feishu] Handler exception: %s', e.message);
    feishu.replyMessage(msg, `处理出错: ${e.message}`);
  }
};

function startFeishu(configData) {
  db.configSet('feishuAppId', configData.app_id || '');
  db.configSet('feishuAppSecret', configData.app_secret || '');
  feishu.start(configData, feishuMessageHandler);
  updateTrayMenu(getServicesStatus());
}

// ========== IPC Handlers ==========

// --- Projects (Knowledge Base) ---
ipcMain.handle('kb:list', () => {
  const projects = db.project.list('note');
  return projects.map(p => ({ ...p, totalDocs: db.project.docCount(p.id) }));
});
ipcMain.handle('notes:tree', (_, { projectId }) => {
  const project = db.project.get(projectId);
  if (!project || !fs.existsSync(project.dir)) return [];
  return listDir(project.dir);
});
ipcMain.handle('notes:treeChildren', (_, { dirPath }) => {
  return listDir(dirPath);
});
ipcMain.handle('notes:read', (_, { projectId, filePath }) => {
  const project = db.project.get(projectId);
  if (!project) return { ok: false, error: '笔记库不存在' };
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(project.dir, filePath);
  if (!fullPath.startsWith(project.dir)) return { ok: false, error: '路径越权' };
  if (!fs.existsSync(fullPath)) return { ok: false, error: '文件不存在' };
  try {
    const buf = fs.readFileSync(fullPath);
    const header = buf.slice(0, 2048);
    if (header.includes(0)) return { ok: false, error: '二进制文件无法预览' };
    const content = buf.toString('utf-8');
    return { ok: true, content, filePath: fullPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});



ipcMain.handle('code:search', (_, { projectId, query }) => {
  try {
    if (!query || !projectId) return [];
    const project = db.project.get(projectId);
    if (!project || !project.dir) return [];

    const q = query.toLowerCase();
    const results = [];
    const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '__pycache__', '.cache', 'dist', 'build', 'target', '.idea', '.vscode']);
    const walkDir = (dir) => {
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
            walkDir(full);
          } else {
            if (e.name.startsWith('.')) continue;
            if (e.name.toLowerCase().includes(q) || full.toLowerCase().includes(q)) {
              results.push({ path: full, name: e.name, score: 1, match: '' });
            }
          }
        }
      } catch {}
    };
    walkDir(project.dir);
    return results.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 50);
  } catch { return []; }
});

ipcMain.handle('kb:add', (_, { name, path: dirPath }) => {
  return db.project.add(name, 'note', dirPath);
});
ipcMain.handle('kb:remove', (_, { id }) => db.project.remove(id));
let _indexingLock = false;

let _docBatchCount = 0;

function handleWorkerMessages(worker, sendProgress, resolve, track) {
  _docBatchCount = 0;
  worker.on('message', (msg) => {
    try {
      if (msg.type === 'progress') {
        sendProgress(msg);
      } else if (msg.type === 'deleteOld') {
        db.runRaw('DELETE FROM kb_chunks WHERE doc_id IN (SELECT id FROM kb_documents WHERE project_id = ?)', [msg.projectId]);
        db.runRaw('DELETE FROM kb_documents WHERE project_id = ?', [msg.projectId]);
        db.save();
      } else if (msg.type === 'doc') {
        db.runRaw("INSERT INTO kb_documents (project_id, path, content, indexed_at, file_mtime, title) VALUES (?, ?, ?, datetime('now', '+8 hours'), ?, ?)", [msg.projectId, msg.path, msg.content, msg.fileMtime || null, msg.title || '']);
        const docRow = db.qOne('SELECT id FROM kb_documents WHERE project_id = ? AND path = ?', msg.projectId, msg.path);
        if (docRow) {
          for (const c of msg.chunks) {
            db.runRaw('INSERT INTO kb_chunks (doc_id, content) VALUES (?, ?)', [docRow.id, c.content]);
          }
        }
        if (track) { track.fileCount++; track.chunkCount += msg.chunks.length; }
        if (++_docBatchCount % 10 === 0) db.save();
      } else if (msg.type === 'scanDone') {
        db.save();
        const embedConfig = {
          model: db.configGet('embedModel') || 'bge-m3',
          host: db.configGet('embeddingBaseUrl') || 'http://127.0.0.1:11434',
          apiKey: db.configGet('embeddingApiKey') || '',
        };
        const rows = db.q(`SELECT c.id, c.content FROM kb_chunks c JOIN kb_documents d ON c.doc_id = d.id WHERE d.project_id = ? AND c.embedding IS NULL`, msg.projectId);
        worker.send({ type: 'embed', projectId: msg.projectId, chunks: rows, config: embedConfig });
      } else if (msg.type === 'embedding') {
        db.runRaw('UPDATE kb_chunks SET embedding = ? WHERE id = ?', [JSON.stringify(msg.vector), msg.chunkId]);
        if (++_docBatchCount % 10 === 0) db.save();
      } else if (msg.type === 'embedDone') {
        db.save();
        if (track) track.embedded = msg.embedded;
      } else if (msg.type === 'done') {
        sendProgress({ phase: 'done', current: 0, total: 0, file: '' });
        worker.kill();
        _indexingLock = false;
        resolve(track ? { files: track.fileCount, totalChunks: track.chunkCount } : true);
      } else if (msg.type === 'error') {
        sendProgress({ phase: 'done', current: 0, total: 0, file: '' });
        worker.kill();
        _indexingLock = false;
        resolve({ error: msg.message });
      }
    } catch (e) {
      logger.error(`[IndexWorker] handler error: ${e.message}`);
    }
  });
  worker.on('error', () => { sendProgress({ phase: 'done' }); _indexingLock = false; resolve({ error: 'worker error' }); });
  worker.on('exit', () => { _indexingLock = false; resolve({}); });
}

ipcMain.handle('kb:scan', async (_, { id }) => {
  if (_indexingLock) return { error: '正在索引中，请稍后再试' };
  try {
    const project = db.project.get(id);
    if (!project || project.type !== 'note') return { error: '只有笔记库类型可以使用此接口' };
    _indexingLock = true;
    const sendProgress = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kb:scan-progress', { id, ...data });
      }
    };
    sendProgress({ phase: 'scan', current: 0, total: 0, file: '' });

    const { fork } = require('child_process');
    const worker = fork(path.join(__dirname, 'services', 'index-worker.js'));

    return new Promise((resolve) => {
      const track = { fileCount: 0, chunkCount: 0, embedded: 0 };
      handleWorkerMessages(worker, sendProgress, resolve, track);
      worker.send({ type: 'start', projects: [{ id: project.id, name: project.name, dir: project.dir, ignore_dirs: project.ignore_dirs, ignore_files: project.ignore_files }] });
    });
  } catch (e) {
    _indexingLock = false;
    return { error: e.message };
  }
});
ipcMain.handle('kb:setDefault', (_, { id }) => db.project.setDefault(id));
ipcMain.handle('kb:getDefault', () => db.project.getDefault());
ipcMain.handle('kb:search', async (_, { id, query }) => {
  try {
    if (!query) return [];
    const rag = require('./services/rag');
    const results = await rag.hybridSearch(id, query, 10, db);
    return results;
  } catch {
    return [];
  }
});
ipcMain.handle('kb:status', (_, { id }) => {
  const total = (db.qOne("SELECT COUNT(*) as c FROM kb_chunks WHERE doc_id IN (SELECT id FROM kb_documents WHERE project_id = ?)", id) || {}).c || 0;
  const embedded = (db.qOne("SELECT COUNT(*) as c FROM kb_chunks WHERE embedding IS NOT NULL AND doc_id IN (SELECT id FROM kb_documents WHERE project_id = ?)", id) || {}).c || 0;
  return { indexed: total > 0, chunks: total, embedded };
});

// --- Module ---
ipcMain.handle('module:list', () => db.dm.list());
ipcMain.handle('module:get', (_, { id }) => db.dm.get(id));
ipcMain.handle('module:add', (_, { name, description, icon }) => db.dm.add(name, description, icon));
ipcMain.handle('module:update', (_, { id, data }) => db.dm.update(id, data));
ipcMain.handle('module:remove', (_, { id }) => db.dm.remove(id));

// --- Dataset ---
ipcMain.handle('ds:list', () => db.ds.list());
ipcMain.handle('ds:get', (_, { id }) => db.ds.get(id));
ipcMain.handle('ds:query', (_, { datasetId, conditions }) => db.ds.query(datasetId, conditions));
ipcMain.handle('ds:add', (_, params) => db.ds.add(params));
ipcMain.handle('ds:updateMeta', (_, { id, data }) => db.ds.updateMeta(id, data));
ipcMain.handle('ds:insert', (_, { datasetId, data }) => db.ds.insert(datasetId, data));
ipcMain.handle('ds:updateRecord', (_, { id, data }) => db.ds.updateRecord(id, data));
ipcMain.handle('ds:deleteRecord', (_, { id }) => db.ds.deleteRecord(id));
ipcMain.handle('ds:remove', (_, { datasetId }) => db.ds.remove(datasetId));
ipcMain.handle('ds:pendingRecords', () => {
  const datasets = db.q("SELECT dataset_id, name FROM data_center_datasets ORDER BY name");
  const result = [];
  for (const ds of datasets) {
    const records = db.q("SELECT id, data_json, created_at FROM data_center_records WHERE dataset_id = ? AND (record_status IS NULL OR record_status = '' OR record_status = 'pending') ORDER BY created_at DESC LIMIT 5", ds.dataset_id);
    if (records.length) {
      result.push({
        datasetName: ds.name,
        datasetId: ds.dataset_id,
        records: records.map(r => ({ id: r.id, ...JSON.parse(r.data_json || '{}'), _created_at: r.created_at })),
      });
    }
  }
  return result;
});

// --- Chat / Orchestrator ---
ipcMain.handle('chat:send', async (event, { question, sessionId, projectDir, kbIds, images, agent, modelName }) => {
  const sid = sessionId || 'session_' + Date.now();
  const activeAgent = agent || 'pi';
  try {
    db.chat.createSession(sid, null, null, 'general', activeAgent, 'ui');

    const existing = db.chat.messages(sid);
    if (existing.length === 0) {
      const title = question.length > 30 ? question.slice(0, 30) + '...' : question;
      db.chat.updateSessionTitle(sid, title);
    }

    db.chat.addMessage(sid, 'user', question, activeAgent, images);

    // ===== LangChain 统一助理 =====
    const session = await orchestrator.createSession(projectDir || '', sid);
    sendToRenderer('chat:status', { sessionId: sid, text: 'AI 正在分析问题...' });

    const augmentedQuestion = kbIds?.length
      ? `[笔记库: ${(await Promise.all(kbIds.map(id => db.project.get(id)))).filter(Boolean).map(k => k.name).join(', ')}]\n${question}`
      : question;

    let reply = '';
    await orchestrator.chat(session, augmentedQuestion,
      (delta) => {
        reply += delta;
        sendToRenderer('chat:delta', { sessionId: sid, text: delta });
      },
      (toolEvent) => sendToRenderer('chat:tool', { sessionId: sid, ...toolEvent }),
      () => {
        if (reply) db.chat.addMessage(sid, 'assistant', reply, 'pi');
        sendToRenderer('chat:done', { sessionId: sid });
      },
      (err) => sendToRenderer('chat:error', { sessionId: sid, text: err }),
      images,
      modelName
    );
  } catch (err) {
    sendToRenderer('chat:error', { sessionId: sid, text: err.message });
  }
});
ipcMain.handle('chat:session:create', (_, { id, projectId, title, mode, source, agent }) => {
  const sid = id || 'chat_' + Date.now();
  return db.chat.createSession(sid, projectId, title, mode || 'general', agent, source || 'ui');
});
ipcMain.handle('chat:session:list', (_, { projectId } = {}) => db.chat.sessions(projectId));
ipcMain.handle('chat:session:listByProject', (_, { projectId }) => db.chat.sessions(projectId));
ipcMain.handle('chat:session:listBySource', (_, { source, projectId }) => db.chat.sessionsBySource(source, projectId));
ipcMain.handle('chat:session:updateAgent', (_, { sessionId, agent }) => db.chat.updateSessionAgent(sessionId, agent));
ipcMain.handle('chat:session:messages', (_, { sessionId }) => db.chat.messages(sessionId));
ipcMain.handle('chat:session:delete', (_, { sessionId }) => db.chat.deleteSession(sessionId));
ipcMain.handle('chat:session:updateTitle', (_, { sessionId, title }) => db.chat.updateSessionTitle(sessionId, title));

// ========== Coding Workbench ==========
ipcMain.handle('coding:session:create', (_, { id, projectId, title, agent }) => {
  return db.chat.createSession(id || ('coding_' + Date.now()), projectId, title, 'coding', agent, 'ui');
});
ipcMain.handle('coding:session:listByProject', (_, { projectId }) => {
  return db.chat.sessions(projectId);
});
ipcMain.handle('coding:session:messages', (_, { sessionId }) => db.chat.messages(sessionId));
ipcMain.handle('coding:session:delete', (_, { sessionId }) => db.chat.deleteSession(sessionId));
ipcMain.handle('coding:session:updateTitle', (_, { sessionId, title }) => db.chat.updateSessionTitle(sessionId, title));
ipcMain.handle('coding:switchAgent', (_, { sessionId, agent }) => {
  db.chat.updateSessionAgent(sessionId, agent);
  return db.chat.getSession(sessionId);
});
ipcMain.handle('coding:send', async (event, { question, sessionId, projectDir, agent, images, modelName }) => {
  const sid = sessionId || ('coding_' + Date.now());
  try {
    let session = db.chat.getSession(sid);
    if (!session) {
      session = db.chat.createSession(sid, null, null, 'coding', 'pi', 'ui');
    }

    // 首条消息自动设置标题
    const existing = db.chat.messages(sid);
    if (existing.length === 0) {
      const title = question.length > 30 ? question.slice(0, 30) + '...' : question;
      db.chat.updateSessionTitle(sid, title);
    }

    // 保存用户消息（含图片）
    db.chat.addMessage(sid, 'user', question, 'pi', images);

    let reply = '';
    sendToRenderer('coding:status', { sessionId: sid, text: 'AI 正在处理...' });

    const onDelta = (delta) => {
      reply += delta;
      sendToRenderer('coding:delta', { sessionId: sid, text: delta });
    };
    const onDone = () => {
      if (reply) db.chat.addMessage(sid, 'assistant', reply, 'pi');
      sendToRenderer('coding:done', { sessionId: sid });
    };
    const onError = (err) => {
      sendToRenderer('coding:error', { sessionId: sid, text: err });
    };
    const onTool = (toolEvent) => {
      sendToRenderer('coding:tool', { sessionId: sid, ...toolEvent });
    };

    // LangChain 统一助理（历史消息由会话加载，工具含数据集/知识库/文件操作）
    const piSession = await orchestrator.createSession(projectDir || '', sid);
    await orchestrator.chat(piSession, question, onDelta, onTool, onDone, onError, images, modelName);
  } catch (err) {
    sendToRenderer('coding:error', { sessionId: sid, text: err.message });
  }
});

// --- Projects ---
ipcMain.handle('project:list', (_, { type } = {}) => db.project.list(type));
ipcMain.handle('project:get', (_, { id }) => db.project.get(id));
ipcMain.handle('project:add', (_, { name, type, dir, description, defaultBranch }) => {
  const result = db.project.add(name, type || 'code', dir, description, defaultBranch);
  if ((type || 'note') === 'note') {
    const taskData = { name: `${name} 综合日报`, cron_expression: '0 7 * * *', task_type: 'daily_report', enabled: 1, notify_feishu: 1, project_id: result.id };
    try {
      const r = db.task.add(taskData.name, taskData.cron_expression, taskData.task_type, taskData);
      const task = db.task.get(r.id);
      if (task && task.enabled && scheduler.isRunning()) scheduler.addTask(task);
    } catch (e) {
      logger.warn('[Project] auto-create daily_report task failed:', e.message);
    }
  }
  return result;
});
ipcMain.handle('project:update', (_, { id, data }) => db.project.update(id, data));
ipcMain.handle('project:delete', (_, { id }) => db.project.delete(id));

// --- Agent Status ---
ipcMain.handle('agent:status', async () => {
  const status = await orchestrator.checkStatus();
  return { pi: status, langchain: status };
});

// --- LLM Profiles (multi-model) ---
ipcMain.handle('llm:profiles:list', () => {
  return db.llmProfile.list().map(p => ({
    id: p.id,
    name: p.name,
    provider: p.provider,
    apiKey: p.api_key ? '****' : '',
    hasApiKey: !!p.api_key,
    baseUrl: p.base_url,
    model: p.model,
    timeout: p.timeout,
    modelType: p.model_type,
    isDefault: !!p.is_default,
  }));
});
ipcMain.handle('llm:profiles:add', (_, data) => {
  const p = db.llmProfile.add(data);
  return p ? { id: p.id, name: p.name, isDefault: !!p.is_default } : null;
});
ipcMain.handle('llm:profiles:update', (_, { id, data }) => {
  const p = db.llmProfile.update(id, data);
  return p ? { id: p.id, name: p.name, isDefault: !!p.is_default } : null;
});
ipcMain.handle('llm:profiles:setDefault', (_, { id }) => {
  db.llmProfile.setDefault(id);
  return { ok: true };
});
ipcMain.handle('llm:profiles:delete', (_, { id }) => {
  db.llmProfile.remove(id);
  return { ok: true };
});
ipcMain.handle('llm:profiles:test', async (_, data) => {
  return llm.testConnection({
    profileRef: data.profileRef,
    provider: data.provider,
    model: data.model,
    apiKey: data.apiKey,
    baseUrl: data.baseUrl,
  });
});

// --- Service Management ---
ipcMain.handle('service:status', () => getServicesStatus());
ipcMain.handle('service:startFeishu', async (_, configData) => {
  startFeishu(configData);
  return true;
});
ipcMain.handle('service:stopFeishu', () => {
  feishu.stop();
  updateTrayMenu(getServicesStatus());
  return true;
});
ipcMain.handle('service:startScheduler', () => {
  scheduler.start();
  updateTrayMenu(getServicesStatus());
  return true;
});
ipcMain.handle('service:stopScheduler', () => {
  scheduler.stop();
  updateTrayMenu(getServicesStatus());
  return true;
});
ipcMain.handle('service:reloadScheduler', () => {
  scheduler.reload();
  return true;
});
ipcMain.handle('task:list', () => db.task.list());
ipcMain.handle('task:add', (_, data) => {
  const r = db.task.add(data.name, data.cron_expression, data.task_type, data);
  const task = db.task.get(r.id);
  if (task && task.enabled) scheduler.addTask(task);
  return r;
});
ipcMain.handle('task:update', (_, id, data) => {
  db.task.update(id, data);
  scheduler.removeTask(id);
  const task = db.task.get(id);
  if (task && task.enabled) scheduler.addTask(task);
  return true;
});
ipcMain.handle('task:remove', (_, id) => {
  db.task.remove(id);
  scheduler.removeTask(id);
  return true;
});
ipcMain.handle('task:setEnabled', (_, id, enabled) => {
  db.task.setEnabled(id, enabled);
  scheduler.reload();
  return true;
});
ipcMain.handle('reminder:list', () => db.reminder.list());
ipcMain.handle('reminder:add', (_, data) => {
  const r = db.reminder.add(data);
  const rem = db.reminder.get(r.id);
  if (rem && rem.enabled) scheduler.addReminder(rem);
  return r;
});
ipcMain.handle('reminder:update', (_, id, data) => {
  db.reminder.update(id, data);
  scheduler.removeReminder(id);
  const rem = db.reminder.get(id);
  if (rem && rem.enabled) scheduler.addReminder(rem);
  return true;
});
ipcMain.handle('reminder:remove', (_, id) => {
  db.reminder.remove(id);
  scheduler.removeReminder(id);
  return true;
});
ipcMain.handle('reminder:setEnabled', (_, id, enabled) => {
  db.reminder.setEnabled(id, enabled);
  scheduler.reload();
  return true;
});
ipcMain.handle('todo:list', () => db.todo.list());
ipcMain.handle('todo:add', (_, data) => db.todo.add(data));
ipcMain.handle('todo:update', (_, id, data) => { db.todo.update(id, data); return true; });
ipcMain.handle('todo:remove', (_, id) => { db.todo.remove(id); return true; });
ipcMain.handle('insights:stats', () => {
  const fileCount = (db.qOne("SELECT COUNT(*) as c FROM kb_documents") || {}).c || 0;
  const chunkCount = (db.qOne("SELECT COUNT(*) as c FROM kb_chunks") || {}).c || 0;
  const totalChats = (db.qOne("SELECT COUNT(*) as c FROM prj_messages") || {}).c || 0;
  const todayModified = (db.qOne("SELECT COUNT(*) as c FROM kb_documents WHERE indexed_at >= date('now')") || {}).c || 0;
  const projectCount = (db.qOne("SELECT COUNT(*) as c FROM prj_projects WHERE type = 'note'") || {}).c || 0;
  const codeProjectCount = (db.qOne("SELECT COUNT(*) as c FROM prj_projects WHERE type = 'code'") || {}).c || 0;
  const todoPending = (db.qOne("SELECT COUNT(*) as c FROM plan_todos WHERE status IN ('pending','in_progress')") || {}).c || 0;
  const todoOverdue = (db.qOne("SELECT COUNT(*) as c FROM plan_todos WHERE due_date != '' AND due_date < date('now','+8 hours') AND status IN ('pending','in_progress')") || {}).c || 0;
  const remindersActive = (db.qOne("SELECT COUNT(*) as c FROM plan_reminders WHERE enabled = 1") || {}).c || 0;
  const todayDataRecords = (db.qOne("SELECT COUNT(*) as c FROM data_center_records WHERE created_at >= datetime('now', '+8 hours', 'start of day')") || {}).c || 0;
  return { fileCount, chunkCount, totalChats, todayModified, projectCount, codeProjectCount, todoPending, todoOverdue, remindersActive, todayDataRecords };
});
ipcMain.handle('insights:reports', () => {
  return db.q("SELECT id, type, report_date, content, substr(content, 1, 100) as summary, created_at FROM ai_analysis WHERE type = 'daily_report' ORDER BY created_at DESC LIMIT 10");
});
ipcMain.handle('insights:weeklyReports', () => {
  return db.q("SELECT id, type, report_date, content, substr(content, 1, 100) as summary, created_at FROM ai_analysis WHERE type = 'weekly_report' ORDER BY created_at DESC LIMIT 10");
});
ipcMain.handle('insights:subProjects', (_, { projectId }) => {
  const rows = db.q("SELECT path, content, file_mtime FROM kb_documents WHERE project_id = ?", projectId);
  const dirMap = {};
  for (const row of rows) {
    const dir = row.path ? row.path.split(/[\\/]/).slice(-2, -1)[0] || '根目录' : '根目录';
    if (!dirMap[dir]) dirMap[dir] = { name: dir, fileCount: 0, totalSize: 0, files: [] };
    dirMap[dir].fileCount++;
    dirMap[dir].totalSize += (row.content || '').length;
    dirMap[dir].files.push(row.path);
  }
  const result = Object.values(dirMap);
  const analyses = db.q("SELECT dir_path, content FROM ai_analysis WHERE type = 'project_analysis' AND project_id = ?", projectId);
  for (const p of result) {
    const a = analyses.find(a => a.dir_path === p.name);
    if (a) p.analysis = a.content;
    p.hasAnalysis = !!a;
  }
  return result;
});
ipcMain.handle('insights:tags', (_, { projectId }) => {
  const rows = db.q("SELECT content FROM kb_documents WHERE project_id = ?", projectId);
  const tagCount = {};
  for (const row of rows) {
    const content = row.content || '';
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatter) {
      const tagsMatch = frontmatter[1].match(/tags\s*:\s*\[([^\]]*)\]/);
      if (tagsMatch) {
        tagsMatch[1].split(',').forEach(t => {
          const tag = t.trim().replace(/['"]/g, '');
          if (tag) tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
      }
    }
    const hashtags = content.match(/#([\p{L}\p{N}_\-\u4e00-\u9fff]+)/gu);
    if (hashtags) {
      hashtags.forEach(t => {
        const tag = t.slice(1);
        if (tag) tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    }
  }
  return Object.entries(tagCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
});
ipcMain.handle('insights:heatmap', (_, { projectId }) => {
  const rows = db.q("SELECT file_mtime FROM kb_documents WHERE project_id = ? AND file_mtime IS NOT NULL", projectId);
  const dateCount = {};
  const now = Date.now();
  for (const row of rows) {
    const d = new Date(row.file_mtime);
    const key = d.toISOString().slice(0, 10);
    dateCount[key] = (dateCount[key] || 0) + 1;
  }
  const heatmap = {};
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    heatmap[key] = dateCount[key] || 0;
  }
  return heatmap;
});
ipcMain.handle('insights:analyzeProject', async (_, { projectId, projectName }) => {
  const rows = db.q("SELECT path, content FROM kb_documents WHERE project_id = ? AND path LIKE ?", projectId, `%${projectName}%`);
  if (!rows.length) return { error: '该项目没有可分析的文件' };
  try {
    const text = await orchestrator.generateProjectAnalysis(projectName, projectId, rows);
    db.run("INSERT INTO ai_analysis (project_id, type, content, dir_path, created_at, updated_at) VALUES (?, 'project_analysis', ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))",
      projectId, text, projectName);
    return { text };
  } catch (e) {
    const fileList = rows.map((r, i) => `${i + 1}. ${r.path.split(/[\\/]/).pop()} (${(r.content || '').length} 字符)`).join('\n');
    const totalSize = rows.reduce((s, r) => s + (r.content || '').length, 0);
    const text = `## ${projectName} 分析报告\n\n由于 AI 服务不可用，以下为基于文件元数据的统计：\n\n- 文件数量: ${rows.length}\n- 总大小: ${(totalSize / 1024).toFixed(1)} KB\n\n### 文件列表\n\n${fileList}`;
    db.run("INSERT INTO ai_analysis (project_id, type, content, dir_path, created_at, updated_at) VALUES (?, 'project_analysis', ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))",
      projectId, text, projectName);
    return { text };
  }
});
ipcMain.handle('service:startIndexer', () => {
  indexer.start();
  updateTrayMenu(getServicesStatus());
  return true;
});
ipcMain.handle('service:stopIndexer', () => {
  indexer.stop();
  updateTrayMenu(getServicesStatus());
  return true;
});
ipcMain.handle('service:indexAll', async () => {
  if (_indexingLock) return { error: '正在索引中，请稍后再试' };
  _indexingLock = true;
  const sendProgress = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('indexer:progress', data);
    }
  };
  sendProgress({ phase: 'scan', current: 0, total: 0, file: '' });

  const { fork } = require('child_process');
  const worker = fork(path.join(__dirname, 'services', 'index-worker.js'));

  const noteProjects = db.project.list('note');
  const projects = noteProjects.map(p => ({ id: p.id, name: p.name, dir: p.dir, ignore_dirs: p.ignore_dirs, ignore_files: p.ignore_files }));

  return new Promise((resolve) => {
    handleWorkerMessages(worker, sendProgress, resolve, null);
    worker.send({ type: 'start', projects });
  });
});
ipcMain.handle('insights:clearIndex', () => {
  db.run('DELETE FROM kb_chunks');
  db.run('DELETE FROM kb_documents');
  return true;
});

ipcMain.handle('insights:indexerInfo', () => {
  return {
    running: indexer.isRunning(),
    model: db.configGet('embedModel') || 'bge-m3',
    host: db.configGet('embeddingBaseUrl') || 'http://127.0.0.1:11434',
    docCount: (db.qOne("SELECT COUNT(*) as c FROM kb_documents") || {}).c || 0,
    chunkCount: (db.qOne("SELECT COUNT(*) as c FROM kb_chunks") || {}).c || 0,
    embeddedCount: (db.qOne("SELECT COUNT(*) as c FROM kb_chunks WHERE embedding IS NOT NULL") || {}).c || 0,
  };
});

ipcMain.handle('insights:libraryStats', () => {
  const projects = db.project.list('note');
  return projects.map(p => {
    const docCount = (db.qOne("SELECT COUNT(*) as c FROM kb_documents WHERE project_id = ?", p.id) || {}).c || 0;
    const chunkCount = (db.qOne("SELECT COUNT(*) as c FROM kb_chunks WHERE doc_id IN (SELECT id FROM kb_documents WHERE project_id = ?)", p.id) || {}).c || 0;
    const embeddedCount = (db.qOne("SELECT COUNT(*) as c FROM kb_chunks WHERE embedding IS NOT NULL AND doc_id IN (SELECT id FROM kb_documents WHERE project_id = ?)", p.id) || {}).c || 0;
    return { projectId: p.id, name: p.name, docCount, chunkCount, embeddedCount };
  });
});

// --- Dialog ---
ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// --- Feishu ---
ipcMain.handle('feishu:testBot', async (_, { app_id, app_secret }) => {
  try {
    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id, app_secret }),
    });
    const data = await res.json();
    if (data.code === 0 && data.tenant_access_token) {
      return { ok: true, botName: '' };
    }
    return { ok: false, error: data.msg || '获取 token 失败' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('feishu:webhook:set', (_, { url }) => {
  feishu.setWebhook(url);
  db.configSet('feishuWebhookUrl', url);
  logger.info('[Feishu] Webhook saved: %s', url);
  return { ok: true };
});
ipcMain.handle('feishu:webhook:test', async (_, { url }) => {
  const result = await feishu.sendViaWebhook(url, '🔔 启航AI工作台 桌面端连接测试成功！');
  return result;
});
ipcMain.handle('feishu:send', async (_, { message }) => {
  const url = db.configGet('feishuWebhookUrl');
  if (!url) return { ok: false, error: 'Webhook URL 未配置' };
  return await feishu.sendViaWebhook(url, message);
});

// --- Logs ---
ipcMain.handle('log:lines', (_, options) => {
  return logger.readLines(options || {});
});
ipcMain.handle('log:files', () => {
  return logger.listFiles();
});
ipcMain.handle('log:readFile', (_, { fileName, options }) => {
  return logger.readFile(fileName, options || {});
});
ipcMain.handle('log:clear', () => {
  logger.clearLog();
  return true;
});
ipcMain.handle('log:dir', () => {
  return logger.getLogDir();
});

// --- Config ---
ipcMain.handle('config:get', () => {
  return {
    llmProvider: db.configGet('llmProvider') || 'deepseek',
    llmModel: db.configGet('llmModel') || '',
    llmApiKey: db.configGet('llmApiKey') || '',
    llmBaseUrl: db.configGet('llmBaseUrl') || '',
    embedModel: db.configGet('embedModel') || 'bge-m3',
    embeddingBaseUrl: db.configGet('embeddingBaseUrl') || 'http://127.0.0.1:11434',
    embeddingApiKey: db.configGet('embeddingApiKey') || '',
    feishuWebhookUrl: db.configGet('feishuWebhookUrl') || '',
    feishuAppId: db.configGet('feishuAppId') || '',
    feishuAppSecret: db.configGet('feishuAppSecret') || '',
    dailyReportRetentionDays: db.configGet('daily_report_retention_days') || '30',
    dailyReportPrompt: db.configGet('daily_report_prompt') || '',
    dailyReportTemplate: db.configGet('daily_report_template') || scheduler.DEFAULT_REPORT_TEMPLATE || '',
    httpPort: db.configGet('httpPort') || '15173',
  };
});
ipcMain.handle('config:set', (_, cfg) => {
  Object.entries(cfg).forEach(([k, v]) => db.configSet(k, String(v)));
  return true;
});

ipcMain.handle("llm:test", async (_, { provider, model, apiKey, baseUrl }) => {
  try {
    const llm = require('./services/llm');
    const result = await llm.testConnection({ provider, model, apiKey, baseUrl });
    return result;
  } catch (e) {
    return { ok: false, message: "❌ 测试异常: " + (e.message || e) };
  }
});

ipcMain.handle("embedding:test", async (_, { model, host, apiKey }) => {
  try {
    const result = await rag.testConnection({ model, host, apiKey });
    return result;
  } catch (e) {
    return { ok: false, message: "❌ 测试异常: " + (e.message || e) };
  }
});

// ========== App Lifecycle ==========

app.isQuitting = false;

app.whenReady().then(async () => {
  try {
    await db.getDb();
  } catch (e) {
    logger.error('DB init error: %s', e);
  }
  createTray();

  // 配置嵌入模型（从数据库读取）
  rag.configure({
    model: db.configGet("embedModel") || "bge-m3",
    host: db.configGet("embeddingBaseUrl") || "http://127.0.0.1:11434",
    apiKey: db.configGet("embeddingApiKey") || '',
  });
  createWindow();

  const savedAppId = db.configGet('feishuAppId');
  const savedAppSecret = db.configGet('feishuAppSecret');
  if (savedAppId && savedAppSecret) {
    logger.info('Auto-starting Feishu bot from saved config...');
    startFeishu({ app_id: savedAppId, app_secret: savedAppSecret });
  }

  const port = parseInt(db.configGet('httpPort') || '15173', 10);
  httpserver.start(port, db);
  logger.info('[HttpServer] Started on port %d', port);

  scheduler.start();
  logger.info('[Scheduler] auto-started');

  updateTrayMenu(getServicesStatus());

  backgroundReady = true;
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopAllServices();
  db.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit - keep running in tray
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
  else showWindow();
});