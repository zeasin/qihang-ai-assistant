const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./services/database');
const orchestrator = require('./services/orchestrator');
const feishu = require('./services/feishu');
const scheduler = require('./services/scheduler');
const indexer = require('./services/indexer');
const logger = require('./services/logger');
const { createTrayIcon } = require('./icon');

let mainWindow = null;
let tray = null;
let backgroundReady = false;

// ========== System Tray ==========

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('笔灵 AI - 运行中');
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
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
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
    mainWindow.loadURL('http://localhost:15173');
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
}

function getServicesStatus() {
  return {
    feishu: feishu.isRunning(),
    scheduler: scheduler.isRunning(),
    indexer: indexer.isRunning(),
  };
}

function listDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const items = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      items.push({ name: entry.name, path: full, type: 'folder' });
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.txt') || entry.name.endsWith('.json')) {
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

// ========== IPC Handlers ==========

// --- Knowledge Base ---
ipcMain.handle('kb:list', () => {
  const kbs = db.kb.list();
  return kbs.map(kb => ({ ...kb, totalDocs: db.kb.docCount(kb.id) }));
});
ipcMain.handle('notes:tree', (_, { kbId }) => {
  const kb = db.kb.get(kbId);
  if (!kb || !fs.existsSync(kb.path)) return [];
  return listDir(kb.path);
});
ipcMain.handle('notes:treeChildren', (_, { dirPath }) => {
  return listDir(dirPath);
});
ipcMain.handle('notes:read', (_, { kbId, filePath }) => {
  const kb = db.kb.get(kbId);
  if (!kb) return { ok: false, error: '笔记库不存在' };
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(kb.path, filePath);
  if (!fullPath.startsWith(kb.path)) return { ok: false, error: '路径越权' };
  if (!fs.existsSync(fullPath)) return { ok: false, error: '文件不存在' };
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    return { ok: true, content, filePath: fullPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('kb:add', (_, { name, path: dirPath }) => {
  const id = 'kb_' + Date.now();
  return db.kb.add(id, name, dirPath);
});
ipcMain.handle('kb:remove', (_, { id }) => db.kb.remove(id));
ipcMain.handle('kb:scan', async (_, { id }) => {
  try {
    const result = await indexer.indexSingle(id);
    sendToRenderer('kb:scan-progress', { id, ...result });
    return result;
  } catch (e) {
    return { error: e.message };
  }
});
ipcMain.handle('kb:search', async (_, { id, query }) => {
  try {
    const rag = require('./services/rag');
    return await rag.searchKnowledgeBase(id, query);
  } catch (e) {
    return [];
  }
});
ipcMain.handle('kb:status', (_, { id }) => {
  const rag = require('./services/rag');
  return rag.getIndexStatus(id);
});

// --- Dataset ---
ipcMain.handle('ds:list', () => db.ds.list());
ipcMain.handle('ds:query', (_, { datasetId, conditions }) => db.ds.query(datasetId, conditions));
ipcMain.handle('ds:add', (_, { name, schemaJson }) => {
  const id = 'ds_' + Date.now();
  return db.ds.add(id, name, schemaJson);
});
ipcMain.handle('ds:insert', (_, { datasetId, data }) => db.ds.insert(datasetId, data));
ipcMain.handle('ds:update', (_, { id, data }) => db.ds.update(id, data));
ipcMain.handle('ds:delete', (_, { id }) => db.ds.delete(id));
ipcMain.handle('ds:remove', (_, { datasetId }) => db.ds.remove(datasetId));

// --- Chat / Orchestrator ---
ipcMain.handle('chat:send', async (event, { question, sessionId, projectDir }) => {
  const sid = sessionId || 'session_' + Date.now();
  try {
    const session = await orchestrator.createSession(projectDir || '');
    sendToRenderer('chat:status', { sessionId: sid, text: 'AI 正在分析问题...' });

    await orchestrator.chat(session, question,
      (delta) => sendToRenderer('chat:delta', { sessionId: sid, text: delta }),
      (toolEvent) => sendToRenderer('chat:tool', { sessionId: sid, ...toolEvent }),
      () => {
        sendToRenderer('chat:done', { sessionId: sid });
        db.chat.addMessage(sid, 'user', question);
      },
      (err) => sendToRenderer('chat:error', { sessionId: sid, text: err })
    );
  } catch (err) {
    sendToRenderer('chat:error', { sessionId: sid, text: err.message });
  }
});
ipcMain.handle('chat:session:create', (_, { title, agentType }) => {
  const id = 'chat_' + Date.now();
  return db.chat.createSession(id, title, agentType);
});
ipcMain.handle('chat:session:list', () => db.chat.sessions());
ipcMain.handle('chat:session:messages', (_, { sessionId }) => db.chat.messages(sessionId));
ipcMain.handle('chat:session:delete', (_, { sessionId }) => db.chat.deleteSession(sessionId));

// --- Agent Status ---
ipcMain.handle('agent:status', async () => {
  const piStatus = await orchestrator.checkStatus();
  return { pi: piStatus };
});

// --- Service Management ---
ipcMain.handle('service:status', () => getServicesStatus());
ipcMain.handle('service:startFeishu', async (_, configData) => {
  feishu.start(configData, async (msg) => {
    // Handle incoming feishu message via orchestrator
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('feishu:message', msg);
    }
    try {
      const session = await orchestrator.createSession('');
      let reply = '';
      await orchestrator.chat(session, msg.text,
        (d) => { reply += d; },
        () => {},
        () => {
          if (reply) feishu.sendMessage(msg.sender, reply);
        },
        (e) => feishu.sendMessage(msg.sender, `处理出错: ${e}`)
      );
    } catch (e) {
      feishu.sendMessage(msg.sender, `处理出错: ${e.message}`);
    }
  });
  updateTrayMenu(getServicesStatus());
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
  await indexer.indexAll();
  return true;
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
ipcMain.handle('feishu:webhook:set', (_, { url }) => {
  feishu.setWebhook(url);
  db.configSet('feishuWebhookUrl', url);
  logger.info('[Feishu] Webhook saved: %s', url);
  return { ok: true };
});
ipcMain.handle('feishu:webhook:test', async (_, { url }) => {
  const result = await feishu.sendViaWebhook(url, '🔔 笔灵 AI 桌面端连接测试成功！');
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
ipcMain.handle('log:dir', () => {
  return logger.getLogDir();
});

// --- Config ---
ipcMain.handle('config:get', () => {
  let labels = {};
  try { labels = JSON.parse(db.configGet('labels') || '{}'); } catch {}
  return {
    projectDir: db.configGet('projectDir') || '',
    ollamaHost: db.configGet('ollamaHost') || 'http://127.0.0.1:11434',
    embedModel: db.configGet('embedModel') || 'nomic-embed-text',
    feishuWebhookUrl: db.configGet('feishuWebhookUrl') || '',
    apiProvider: db.configGet('apiProvider') || 'anthropic',
    apiKey: db.configGet('apiKey') ? '***' : '',
    labels,
  };
});
ipcMain.handle('config:set', (_, cfg) => {
  const safeCfg = { ...cfg };
  if (safeCfg.apiKey === '***') delete safeCfg.apiKey;
  Object.entries(safeCfg).forEach(([k, v]) => db.configSet(k, String(v)));
  return true;
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
  createWindow();
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