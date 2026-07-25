/// <reference types="vite/client" />

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface ElectronAPI {
  dialog: {
    openDirectory: () => Promise<string | null>;
  };
  notes: {
    tree: (kbId: string) => Promise<TreeNode[]>;
    treeChildren: (dirPath: string) => Promise<TreeNode[]>;
    read: (kbId: string, filePath: string) => Promise<{ ok: boolean; content?: string; error?: string; filePath?: string }>;
  };
  log: {
    lines: (options?: { count?: number; tail?: boolean }) => Promise<string[]>;
    files: () => Promise<{ name: string; size: number; mtime: string }[]>;
    readFile: (fileName: string, options?: { count?: number; tail?: boolean }) => Promise<string[]>;
    dir: () => Promise<string>;
  };
  feishu: {
    setWebhook: (url: string) => Promise<{ ok: boolean }>;
    testWebhook: (url: string) => Promise<{ ok: boolean; error?: string }>;
    send: (message: string) => Promise<{ ok: boolean; error?: string }>;
  };
  kb: {
    list: () => Promise<any[]>;
    add: (name: string, path: string) => Promise<any>;
    remove: (id: string) => Promise<void>;
    scan: (id: string) => Promise<any>;
    search: (id: string, query: string) => Promise<any[]>;
    status: (id: string) => Promise<any>;
  };
  ds: {
    list: () => Promise<any[]>;
    query: (datasetId: string, conditions?: string) => Promise<any[]>;
    add: (name: string, schemaJson: string) => Promise<any>;
    insert: (datasetId: string, data: any) => Promise<void>;
    update: (id: number, data: any) => Promise<void>;
    delete: (id: number) => Promise<void>;
    remove: (datasetId: string) => Promise<void>;
  };
  chat: {
    send: (question: string, sessionId?: string, projectDir?: string) => Promise<void>;
    createSession: (title?: string, agentType?: string) => Promise<any>;
    getSessions: () => Promise<any[]>;
    getMessages: (sessionId: string) => Promise<any[]>;
    deleteSession: (sessionId: string) => Promise<void>;
  };
  agent: {
    status: () => Promise<{ pi: any }>;
  };
  service: {
    status: () => Promise<{ feishu: boolean; scheduler: boolean; indexer: boolean }>;
    startFeishu: (config: any) => Promise<boolean>;
    stopFeishu: () => Promise<boolean>;
    startScheduler: () => Promise<boolean>;
    stopScheduler: () => Promise<boolean>;
    startIndexer: () => Promise<boolean>;
    stopIndexer: () => Promise<boolean>;
    indexAll: () => Promise<boolean>;
  };
  config: {
    get: () => Promise<any>;
    set: (config: any) => Promise<boolean>;
  };
  on: (channel: string, callback: (...args: any[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}