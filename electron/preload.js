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
    setDefault: (id) => ipcRenderer.invoke('kb:setDefault', { id }),
    getDefault: () => ipcRenderer.invoke('kb:getDefault'),
  },

  // Module
  dm: {
    list: () => ipcRenderer.invoke('module:list'),
    get: (id) => ipcRenderer.invoke('module:get', { id }),
    add: (name, description, icon) => ipcRenderer.invoke('module:add', { name, description, icon }),
    update: (id, data) => ipcRenderer.invoke('module:update', { id, data }),
    remove: (id) => ipcRenderer.invoke('module:remove', { id }),
  },

  // Dataset
  ds: {
    list: () => ipcRenderer.invoke('ds:list'),
    get: (id) => ipcRenderer.invoke('ds:get', { id }),
    query: (datasetId, conditions) => ipcRenderer.invoke('ds:query', { datasetId, conditions }),
    add: (params) => ipcRenderer.invoke('ds:add', params),
    updateMeta: (id, data) => ipcRenderer.invoke('ds:updateMeta', { id, data }),
    insert: (datasetId, data) => ipcRenderer.invoke('ds:insert', { datasetId, data }),
    updateRecord: (id, data) => ipcRenderer.invoke('ds:updateRecord', { id, data }),
    deleteRecord: (id) => ipcRenderer.invoke('ds:deleteRecord', { id }),
    remove: (id) => ipcRenderer.invoke('ds:remove', { datasetId: id }),
  },

  // Chat
  chat: {
    send: (question, sessionId, projectDir, kbIds, images) =>
      ipcRenderer.invoke('chat:send', { question, sessionId, projectDir, kbIds, images }),
    createSession: (sessionId, title, mode, source) =>
      ipcRenderer.invoke('chat:session:create', { id: sessionId, title, mode, source }),
    getSessions: () => ipcRenderer.invoke('chat:session:list'),
    getSessionsBySource: (source) => ipcRenderer.invoke('chat:session:listBySource', { source }),
    getMessages: (sessionId) => ipcRenderer.invoke('chat:session:messages', { sessionId }),
    deleteSession: (sessionId) => ipcRenderer.invoke('chat:session:delete', { sessionId }),
    updateSessionTitle: (sessionId, title) => ipcRenderer.invoke('chat:session:updateTitle', { sessionId, title }),
  },

  // Projects
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    get: (id) => ipcRenderer.invoke('project:get', { id }),
    add: (name, dir, description, defaultBranch) =>
      ipcRenderer.invoke('project:add', { name, dir, description, defaultBranch }),
    update: (id, data) => ipcRenderer.invoke('project:update', { id, data }),
    delete: (id) => ipcRenderer.invoke('project:delete', { id }),
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
    reloadScheduler: () => ipcRenderer.invoke('service:reloadScheduler'),
    startIndexer: () => ipcRenderer.invoke('service:startIndexer'),
    stopIndexer: () => ipcRenderer.invoke('service:stopIndexer'),
    indexAll: () => ipcRenderer.invoke('service:indexAll'),
  },

  // Tasks
  task: {
    list: () => ipcRenderer.invoke('task:list'),
    add: (data) => ipcRenderer.invoke('task:add', data),
    update: (id, data) => ipcRenderer.invoke('task:update', id, data),
    remove: (id) => ipcRenderer.invoke('task:remove', id),
    setEnabled: (id, enabled) => ipcRenderer.invoke('task:setEnabled', id, enabled),
  },

  // Reminders
  reminder: {
    list: () => ipcRenderer.invoke('reminder:list'),
    add: (data) => ipcRenderer.invoke('reminder:add', data),
    update: (id, data) => ipcRenderer.invoke('reminder:update', id, data),
    remove: (id) => ipcRenderer.invoke('reminder:remove', id),
    setEnabled: (id, enabled) => ipcRenderer.invoke('reminder:setEnabled', id, enabled),
  },

  // Todos
  todo: {
    list: () => ipcRenderer.invoke('todo:list'),
    add: (data) => ipcRenderer.invoke('todo:add', data),
    update: (id, data) => ipcRenderer.invoke('todo:update', id, data),
    remove: (id) => ipcRenderer.invoke('todo:remove', id),
  },

  // Insights
  insights: {
    stats: () => ipcRenderer.invoke('insights:stats'),
    reports: () => ipcRenderer.invoke('insights:reports'),
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
