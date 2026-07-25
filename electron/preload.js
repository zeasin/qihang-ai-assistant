const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },
  notes: {
    tree: (kbId) => ipcRenderer.invoke('notes:tree', { kbId }),
    treeChildren: (dirPath) => ipcRenderer.invoke('notes:treeChildren', { dirPath }),
    read: (kbId, filePath) => ipcRenderer.invoke('notes:read', { kbId, filePath }),
  },
  log: {
    lines: (options) => ipcRenderer.invoke('log:lines', options),
    files: () => ipcRenderer.invoke('log:files'),
    readFile: (fileName, options) => ipcRenderer.invoke('log:readFile', { fileName, options }),
    dir: () => ipcRenderer.invoke('log:dir'),
  },
  feishu: {
    setWebhook: (url) => ipcRenderer.invoke('feishu:webhook:set', { url }),
    testWebhook: (url) => ipcRenderer.invoke('feishu:webhook:test', { url }),
    send: (message) => ipcRenderer.invoke('feishu:send', { message }),
    testBot: (app_id, app_secret) => ipcRenderer.invoke('feishu:testBot', { app_id, app_secret }),
  },
  kb: {
    list: () => ipcRenderer.invoke('kb:list'),
    add: (name, path) => ipcRenderer.invoke('kb:add', { name, path }),
    remove: (id) => ipcRenderer.invoke('kb:remove', { id }),
    scan: (id) => ipcRenderer.invoke('kb:scan', { id }),
    search: (id, query) => ipcRenderer.invoke('kb:search', { id, query }),
    status: (id) => ipcRenderer.invoke('kb:status', { id }),
  },

  // Dataset
  ds: {
    list: () => ipcRenderer.invoke('ds:list'),
    query: (datasetId, conditions) => ipcRenderer.invoke('ds:query', { datasetId, conditions }),
    add: (name, schemaJson) => ipcRenderer.invoke('ds:add', { name, schemaJson }),
    insert: (datasetId, data) => ipcRenderer.invoke('ds:insert', { datasetId, data }),
    update: (id, data) => ipcRenderer.invoke('ds:update', { id, data }),
    delete: (id) => ipcRenderer.invoke('ds:delete', { id }),
    remove: (datasetId) => ipcRenderer.invoke('ds:remove', { datasetId }),
  },

  // Chat
  chat: {
    send: (question, sessionId, projectDir, kbIds, images) =>
      ipcRenderer.invoke('chat:send', { question, sessionId, projectDir, kbIds, images }),
    createSession: (sessionId, title, agentType) =>
      ipcRenderer.invoke('chat:session:create', { id: sessionId, title, agentType }),
    getSessions: () => ipcRenderer.invoke('chat:session:list'),
    getMessages: (sessionId) => ipcRenderer.invoke('chat:session:messages', { sessionId }),
    deleteSession: (sessionId) => ipcRenderer.invoke('chat:session:delete', { sessionId }),
    updateSessionTitle: (sessionId, title) => ipcRenderer.invoke('chat:session:updateTitle', { sessionId, title }),
  },

  // Agent
  agent: {
    status: () => ipcRenderer.invoke('agent:status'),
  },

  // Service Management
  service: {
    status: () => ipcRenderer.invoke('service:status'),
    startFeishu: (config) => ipcRenderer.invoke('service:startFeishu', config),
    stopFeishu: () => ipcRenderer.invoke('service:stopFeishu'),
    startScheduler: () => ipcRenderer.invoke('service:startScheduler'),
    stopScheduler: () => ipcRenderer.invoke('service:stopScheduler'),
    startIndexer: () => ipcRenderer.invoke('service:startIndexer'),
    stopIndexer: () => ipcRenderer.invoke('service:stopIndexer'),
    indexAll: () => ipcRenderer.invoke('service:indexAll'),
  },

  // Config
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (cfg) => ipcRenderer.invoke('config:set', cfg),
  },

  // Event listeners (streaming)
  on: (channel, callback) => {
    const validChannels = [
      'chat:delta', 'chat:status', 'chat:tool', 'chat:done', 'chat:error',
      'kb:scan-progress', 'service:status', 'service:toggle', 'feishu:message',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});