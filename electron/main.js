const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Polyfill for Electron: undici v6 (bundled with pi-agent) expects worker_threads.markAsUncloneable
try {
  const wt = require('worker_threads');
  if (typeof wt.markAsUncloneable !== 'function') {
    wt.markAsUncloneable = () => {};
  }
} catch {} // worker_threads not available
const db = require('./services/database');
const orchestrator = require('./services/orchestrator');
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
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
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

/**
 * 构建编程对话上下文（从历史消息中提取）
 */
function buildCodingContext(history) {
  if (!history || !history.length) return '';
  const lines = history.map(m => {
    if (m.role === 'user') return `【用户】${m.content}`;
    if (m.role === 'assistant') return `【助手】${m.content}`;
    return '';
  }).filter(Boolean);
  return '以下是之前的对话历史，请基于此上下文继续对话：\n\n' + lines.join('\n\n');
}

// ========== Feishu message handler (shared) ==========

function parseFeishuContext(text, db) {
  const projects = db.project.list();
  const kbs = db.kb.list();
  let cleanText = text;
  let projectDir = '';
  const kbIds = [];

  const projectMatch = text.match(/\/code\s*[：:]\s*(\S+)/);
  if (projectMatch) {
    const projectName = projectMatch[1];
    const found = projects.find(p => p.name.includes(projectName));
    if (found) projectDir = found.dir;
    cleanText = cleanText.replace(projectMatch[0], '').trim();
  }

  const bracketMatch = text.match(/\[笔记库\s*[：:]\s*([^\]]+)\]/);
  if (bracketMatch) {
    const kbName = bracketMatch[1].trim();
    const found = kbs.find(k => k.name.includes(kbName) || kbName.includes(k.name));
    if (found) kbIds.push(found.id);
    cleanText = cleanText.replace(bracketMatch[0], '').trim();
  }

  const colonMatch = cleanText.match(/笔记库\s*[：:]\s*(\S+)/);
  if (colonMatch && kbIds.length === 0) {
    const kbName = colonMatch[1];
    const found = kbs.find(k => k.name.includes(kbName) || kbName.includes(k.name));
    if (found) kbIds.push(found.id);
    cleanText = cleanText.replace(colonMatch[0], '').trim();
  }

  if (kbIds.length === 0) {
    for (const kb of kbs) {
      if (text.includes(kb.name)) {
        kbIds.push(kb.id);
        cleanText = cleanText.replace(kb.name, '').trim();
        break;
      }
    }
  }

  if (!projectDir && kbIds.length === 0) {
    const defaultKb = db.kb.getDefault();
    if (defaultKb) kbIds.push(defaultKb.id);
  }

  return { projectDir, kbIds, cleanText: cleanText || text };
}

const feishuMessageHandler = async (msg) => {
  const sessionId = 'feishu_' + msg.chatId + '_' + new Date().toISOString().slice(0, 10);
  logger.info('═══════════════════════════════════════');
  logger.info(' 飞书消息已接收');
  logger.info(' 发送者: %s', msg.sender);
  logger.info(' 内容: %s', msg.text);
  logger.info(' ChatId: %s', msg.chatId);
  logger.info(' SessionId: %s', sessionId);
  logger.info('═══════════════════════════════════════');

  db.chat.createSession(sessionId, '飞书-' + msg.chatId.slice(0, 8), 'general', 'feishu');
  db.chat.addMessage(sessionId, 'user', msg.text, 'general', 'feishu');

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('feishu:message', msg);
  }

  feishu.replyMessage(msg, '🤔 AI 正在思考，请稍后...');

  try {
    const context = parseFeishuContext(msg.text, db);

    const kbFallback = { hasResults: false, text: '' };
    const buildKBInjectedPrompt = async () => {
      if (context.kbIds.length === 0) return context.cleanText;
      const kbNames = context.kbIds.map(id => db.kb.get(id)?.name).filter(Boolean).join(', ');
      try {
        const rag = require('./services/rag');
        let allResults = [];
        for (const kbId of context.kbIds) {
          const docs = await rag.searchKnowledgeBase(kbId, context.cleanText);
          allResults.push(...docs);
        }
        allResults.sort((a, b) => b.score - a.score);
        const top = allResults.slice(0, 6);
        if (top.length === 0) {
          const kbPaths = context.kbIds.map(id => db.kb.get(id)?.path).filter(Boolean).join(', ');
          kbFallback.text = `📚 笔记库「${kbNames}」中未找到相关内容。请在笔记库目录中搜索：${kbPaths}`;
          return `笔记库「${kbNames}」的 RAG 索引未命中。请在以下目录中用 grep/find 搜索文件：${kbPaths}\n\n用户问题：${context.cleanText}`;
        }
        const contextText = top.map((d, i) => `【结果${i + 1}】${d.text}`).join('\n\n');
        kbFallback.hasResults = true;
        kbFallback.text = top.map((d, i) => `📄 **相关文档 ${i + 1}**\n${d.text}`).join('\n\n---\n\n');
        return `以下是知识库「${kbNames}」中与问题相关的内容：\n\n${contextText}\n\n请基于以上知识库内容回答用户问题，如果知识库内容不足以回答，请说明。\n\n用户问题：${context.cleanText}`;
      } catch (e) {
        logger.error('[Feishu] KB search error: %s', e.message);
        return context.cleanText;
      }
    };

    const setMode = (mode) => { try { db.chat.updateSessionMode(sessionId, mode); } catch {} };
    const questionText = await buildKBInjectedPrompt();
    const replyOrchestrator = async (cwd) => {
      const session = await orchestrator.createSession(cwd);
      let reply = '';
      const sendReply = (text) => {
        if (text) {
          db.chat.addMessage(sessionId, 'assistant', text, 'general', 'feishu');
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
    } else if (context.kbIds.length > 0) {
      setMode('kb');
      const kbCwd = db.kb.get(context.kbIds[0])?.path || '';
      await replyOrchestrator(kbCwd);
    } else {
      const feishuRouter = require('./services/feishu-router');
      const deps = {
        db,
        kb: require('./services/knowledge-base'),
        project: db.project,
        feishu,
        orchestrator,
      };

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
  return db.kb.add(name, dirPath);
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
ipcMain.handle('kb:setDefault', (_, { id }) => db.kb.setDefault(id));
ipcMain.handle('kb:getDefault', () => db.kb.getDefault());
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

// --- Chat / Orchestrator ---
ipcMain.handle('chat:send', async (event, { question, sessionId, projectDir, kbIds, images }) => {
  const sid = sessionId || 'session_' + Date.now();
  try {
    db.chat.createSession(sid, null, 'pi', 'ui');

    const existing = db.chat.messages(sid);
    if (existing.length === 0) {
      const title = question.length > 30 ? question.slice(0, 30) + '...' : question;
      db.chat.updateSessionTitle(sid, title);
    }

    const session = await orchestrator.createSession(projectDir || '');
    sendToRenderer('chat:status', { sessionId: sid, text: 'AI 正在分析问题...' });

    const augmentedQuestion = kbIds?.length
      ? `[笔记库: ${(await Promise.all(kbIds.map(id => db.kb.get(id)))).filter(Boolean).map(k => k.name).join(', ')}]\n${question}`
      : question;

    db.chat.addMessage(sid, 'user', question, 'pi', 'ui', images);
    let reply = '';
    await orchestrator.chat(session, augmentedQuestion,
      (delta) => {
        reply += delta;
        sendToRenderer('chat:delta', { sessionId: sid, text: delta });
      },
      (toolEvent) => sendToRenderer('chat:tool', { sessionId: sid, ...toolEvent }),
      () => {
        if (reply) db.chat.addMessage(sid, 'assistant', reply, 'pi', 'ui');
        sendToRenderer('chat:done', { sessionId: sid });
      },
      (err) => sendToRenderer('chat:error', { sessionId: sid, text: err }),
      images
    );
  } catch (err) {
    sendToRenderer('chat:error', { sessionId: sid, text: err.message });
  }
});
ipcMain.handle('chat:session:create', (_, { id, title, mode, source }) => {
  const sid = id || 'chat_' + Date.now();
  return db.chat.createSession(sid, title, mode || 'general', source || 'ui');
});
ipcMain.handle('chat:session:list', () => db.chat.sessions());
ipcMain.handle('chat:session:listBySource', (_, { source }) => db.chat.sessionsBySource(source));
ipcMain.handle('chat:session:messages', (_, { sessionId }) => db.chat.messages(sessionId));
ipcMain.handle('chat:session:delete', (_, { sessionId }) => db.chat.deleteSession(sessionId));
ipcMain.handle('chat:session:updateTitle', (_, { sessionId, title }) => db.chat.updateSessionTitle(sessionId, title));

// ========== Coding Workbench ==========
ipcMain.handle('coding:session:create', (_, { id, projectId, title, agent }) => {
  return db.coding.createSession(id || ('coding_' + Date.now()), projectId, title, agent);
});
ipcMain.handle('coding:session:listByProject', (_, { projectId }) => {
  return db.coding.sessionsByProject(projectId);
});
ipcMain.handle('coding:session:messages', (_, { sessionId }) => db.coding.messages(sessionId));
ipcMain.handle('coding:session:delete', (_, { sessionId }) => db.coding.deleteSession(sessionId));
ipcMain.handle('coding:session:updateTitle', (_, { sessionId, title }) => db.coding.updateSessionTitle(sessionId, title));
ipcMain.handle('coding:switchAgent', (_, { sessionId, agent }) => {
  db.coding.updateSessionAgent(sessionId, agent);
  return db.coding.getSession(sessionId);
});
ipcMain.handle('coding:send', async (event, { question, sessionId, projectDir, agent, images }) => {
  const sid = sessionId || ('coding_' + Date.now());
  try {
    let session = db.coding.getSession(sid);
    if (!session) {
      session = db.coding.createSession(sid, null, null, agent || 'pi');
    }
    const agentName = agent || session.active_agent || 'pi';

    // 如果 agent 变了，更新数据库
    if (session.active_agent !== agentName) {
      db.coding.updateSessionAgent(sid, agentName);
    }

    // 首条消息自动设置标题
    const existing = db.coding.messages(sid);
    if (existing.length === 0) {
      const title = question.length > 30 ? question.slice(0, 30) + '...' : question;
      db.coding.updateSessionTitle(sid, title);
    }

    // 构建上下文（从历史消息中提取，实现跨 Agent 上下文保持）
    const context = buildCodingContext(existing);

    // 保存用户消息（含图片）
    db.coding.addMessage(sid, 'user', question, agentName, images);

    let reply = '';
    const agentLabel = agentName === 'pi' ? 'pi agent' : agentName === 'opencode' ? 'opencode' : 'Claude Code';
    sendToRenderer('coding:status', { sessionId: sid, text: `${agentLabel} 正在处理...` });

    const onDelta = (delta) => {
      reply += delta;
      sendToRenderer('coding:delta', { sessionId: sid, text: delta });
    };
    const onDone = () => {
      if (reply) db.coding.addMessage(sid, 'assistant', reply, agentName);
      sendToRenderer('coding:done', { sessionId: sid });
    };
    const onError = (err) => {
      sendToRenderer('coding:error', { sessionId: sid, text: err });
    };
    const onTool = (toolEvent) => {
      sendToRenderer('coding:tool', { sessionId: sid, ...toolEvent });
    };

    if (agentName === 'opencode') {
      const oc = require('./services/opencode');
      await oc.prompt(context, question, onDelta, onDone);
    } else if (agentName === 'claude') {
      const cc = require('./services/claude-code');
      await cc.prompt(context, question, projectDir || '', onDelta, onDone, onError);
    } else {
      // pi agent
      const fullPrompt = context ? `${context}

---

用户的新问题：${question}` : question;
      const piSession = await orchestrator.createSession(projectDir || '');
      await orchestrator.chat(piSession, fullPrompt, onDelta, onTool, onDone, onError, images);
    }
  } catch (err) {
    sendToRenderer('coding:error', { sessionId: sid, text: err.message });
  }
});

// --- Projects ---
ipcMain.handle('project:list', () => db.project.list());
ipcMain.handle('project:get', (_, { id }) => db.project.get(id));
ipcMain.handle('project:add', (_, { name, dir, description, defaultBranch }) => {
  return db.project.add(name, dir, description, defaultBranch);
});
ipcMain.handle('project:update', (_, { id, data }) => db.project.update(id, data));
ipcMain.handle('project:delete', (_, { id }) => db.project.delete(id));

// --- Agent Status ---
ipcMain.handle('agent:status', async () => {
  const piStatus = await orchestrator.checkStatus();
  let opencodeStatus = { installed: false, version: null };
  let claudeStatus = { installed: false, version: null };
  try {
    const oc = require('./services/opencode');
    opencodeStatus = await oc.checkStatus();
  } catch {}
  try {
    const cc = require('./services/claude-code');
    claudeStatus = await cc.checkStatus();
  } catch {}
  return { pi: piStatus, opencode: opencodeStatus, claude: claudeStatus };
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
  const fileCount = (db.qOne("SELECT COUNT(*) as c FROM documents") || {}).c || 0;
  const chunkCount = (db.qOne("SELECT COUNT(*) as c FROM chunks") || {}).c || 0;
  const totalChats = (db.qOne("SELECT COUNT(*) as c FROM messages") || {}).c || 0;
  const todayModified = (db.qOne("SELECT COUNT(*) as c FROM documents WHERE indexed_at >= date('now')") || {}).c || 0;
  return { fileCount, chunkCount, totalChats, todayModified };
});
ipcMain.handle('insights:reports', () => {
  return db.q("SELECT id, type, report_date, content, substr(content, 1, 100) as summary, created_at FROM ai_analysis WHERE type = 'daily_report' ORDER BY created_at DESC LIMIT 10");
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
    feishuAppId: db.configGet('feishuAppId') || '',
    feishuAppSecret: db.configGet('feishuAppSecret') || '',
    dailyReportRetentionDays: db.configGet('daily_report_retention_days') || '30',
    dailyReportPrompt: db.configGet('daily_report_prompt') || '',
    dailyReportTemplate: db.configGet('daily_report_template') || scheduler.DEFAULT_REPORT_TEMPLATE || '',
    labels,
  };
});
ipcMain.handle('config:set', (_, cfg) => {
  Object.entries(cfg).forEach(([k, v]) => db.configSet(k, String(v)));
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

  // 配置嵌入模型（从数据库读取）
  rag.configure({
    model: db.configGet("embedModel") || "nomic-embed-text",
    host: db.configGet("embeddingBaseUrl") || "http://127.0.0.1:11434",
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