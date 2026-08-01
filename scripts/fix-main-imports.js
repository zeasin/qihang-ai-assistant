const fs = require('fs');

const file = 'electron/main.ts';
let src = fs.readFileSync(file, 'utf8');

const subs = [
  ["const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');", "import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron';"],
  ["const path = require('path');", "import * as path from 'path';"],
  ["const fs = require('fs');", "import * as fs from 'fs';"],
  ["const { Console } = require('console');", "import { Console } from 'console';"],
  ["const db = require('./services/database');", "import * as db from './services/database';"],
  ["const orchestrator = require('./services/orchestrator');", "import * as orchestrator from './services/orchestrator';"],
  ["const llm = require('./services/llm');", "import * as llm from './services/llm';"],
  ["const { runPi } = require('./services/pi-agent');", "import { runPi } from './services/pi-agent';"],
  ["const feishu = require('./services/feishu');", "import * as feishu from './services/feishu';"],
  ["const scheduler = require('./services/scheduler');", "import * as scheduler from './services/scheduler';"],
  ["const indexer = require('./services/indexer');", "import * as indexer from './services/indexer';"],
  ["const logger = require('./services/logger');", "import * as logger from './services/logger';"],
  ["const httpserver = require('./services/httpserver');", "import * as httpserver from './services/httpserver';"],
  ['const { createTrayIcon } = require("./icon");', "import { createTrayIcon } from './icon';"],
  ['const rag = require("./services/rag");', "import * as rag from './services/rag';"],
  ["const wt = require('worker_threads');", "import * as wt from 'worker_threads';"],
];
for (const [from, to] of subs) {
  if (!src.includes(from)) {
    console.error(`MISSING: ${from.slice(0, 60)}`);
  }
  src = src.replace(from, to);
}
fs.writeFileSync(file, src, 'utf8');
console.log('main.ts imports converted');
