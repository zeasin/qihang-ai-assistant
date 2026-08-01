/**
 * pi agent SDK 原生集成层
 *
 * 在 Electron main 进程内直接使用官方 SDK（@earendil-works/pi-coding-agent）：
 * - 不再 spawn pi CLI 子进程，消除每次约 4.5s 的启动开销
 * - createAgentSession + subscribe 事件流，取代 JSON 行解析
 * - SessionManager.open 精确控制会话续接（与 CLI --session <path> 同机制）
 * - 自定义工具（kb_search 等）通过 defineTool 原生注册，进程内直接访问项目服务
 */
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import logger from './logger';

// ---- SDK 动态导入 ----
// SDK 是 ESM-only（package.json "type": "module"），而 Electron main 是 CJS。
// TS 在 CommonJS 目标下会把 import() 编译成 require()，会因 ESM 包无法 require 而失败，
// 因此用 Function 构造器保留运行时真正的动态 import()。
let sdkModule: any = null;
let sdkLoading: Promise<any> | null = null;
function loadSdk(): Promise<any> {
  if (sdkModule) return Promise.resolve(sdkModule);
  if (!sdkLoading) {
    sdkLoading = new Function('spec', 'return import(spec)')('@earendil-works/pi-coding-agent')
      .then((mod: any) => { sdkModule = mod; return mod; })
      .catch((err: Error) => {
        sdkLoading = null;
        logger.error('[PiAgent] SDK load failed: %s', err.message);
        throw err;
      });
  }
  return sdkLoading!;
}

// ---- 运行时组件缓存（按 cwd 复用，避免每个会话重复建服务） ----
interface RuntimeBundle {
  authStorage: any;
  modelRegistry: any;
}
const runtimeCache = new Map<string, Promise<RuntimeBundle>>();
function getAgentDir(): string {
  return path.join(os.homedir(), '.pi', 'agent');
}
async function getRuntime(): Promise<RuntimeBundle> {
  const agentDir = getAgentDir();
  if (!runtimeCache.has(agentDir)) {
    const p = loadSdk().then((sdk) => {
      const authStorage = sdk.AuthStorage.create(path.join(agentDir, 'auth.json'));
      const modelRegistry = sdk.ModelRegistry.create(authStorage, path.join(agentDir, 'models.json'));
      return { authStorage, modelRegistry };
    });
    runtimeCache.set(agentDir, p);
    p.catch(() => runtimeCache.delete(agentDir));
  }
  return runtimeCache.get(agentDir)!;
}

// ---- 会话缓存：sessionId -> AgentSession ----
interface SessionHandle {
  session: any;
  modelRegistry: any;
  currentModelPattern?: string;
  tail: Promise<void>; // 同一会话内的串行链，保证 prompt 不并发
}
const sessions = new Map<string, SessionHandle>();

function sessionFilePath(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getAgentDir(), 'sessions', `assistant-v2-${safe}.jsonl`);
}

async function getSession(opts: {
  sessionId: string;
  cwd?: string;
  modelPattern?: string;
}): Promise<SessionHandle> {
  const sdk = await loadSdk();
  const { sessionId, cwd, modelPattern } = opts;
  let handle = sessions.get(sessionId);
  if (handle) return handle;

  const bundle = await getRuntime();
  const sm = sdk.SessionManager.open(sessionFilePath(sessionId));
  let model: any;
  let modelFallbackMessage: string | undefined;
  if (modelPattern) {
    const idx = modelPattern.indexOf('/');
    const provider = idx >= 0 ? modelPattern.slice(0, idx) : undefined;
    const modelId = idx >= 0 ? modelPattern.slice(idx + 1) : modelPattern;
    if (provider) model = bundle.modelRegistry.find(provider, modelId);
    if (!model) modelFallbackMessage = `model ${modelPattern} not found, using default`;
  }

  const { session } = await sdk.createAgentSession({
    cwd: cwd || process.cwd(),
    agentDir: getAgentDir(),
    authStorage: bundle.authStorage,
    modelRegistry: bundle.modelRegistry,
    model,
    sessionManager: sm,
    thinkingLevel: 'off',
    customTools: [kbSearchTool()],
    settingsManager: sdk.SettingsManager.create(cwd || process.cwd(), getAgentDir()),
  });
  if (modelFallbackMessage) logger.warn('[PiAgent] %s', modelFallbackMessage);

  handle = { session, modelRegistry: bundle.modelRegistry, tail: Promise.resolve() };
  sessions.set(sessionId, handle);
  return handle;
}

/** 按应用模型档案映射的 pattern 解析为 SDK Model；返回 null 表示用默认模型 */
export async function resolvePiModel(modelPattern: string | undefined): Promise<any | null> {
  if (!modelPattern) return null;
  const bundle = await getRuntime();
  const idx = modelPattern.indexOf('/');
  if (idx < 0) return null;
  return bundle.modelRegistry.find(modelPattern.slice(0, idx), modelPattern.slice(idx + 1)) || null;
}

export interface PiModelInfo {
  provider: string;
  providerLabel: string;
  id: string;
  name: string;
  pattern: string;
  configured: boolean;
}

/**
 * 列出 pi agent 可用的模型（来自 ~/.pi/agent 的 ModelRegistry）。
 * 优先返回已配置认证的模型（getAvailable），一个都没有时兜底列出全部内置模型。
 */
export async function listPiModels(): Promise<{ models: PiModelInfo[]; error?: string }> {
  try {
    const bundle = await getRuntime();
    const registry = bundle.modelRegistry;
    const available = (registry.getAvailable() || []) as any[];
    const configured = available.length > 0;
    const list = (configured ? available : (registry.getAll() || [])) as any[];
    const models: PiModelInfo[] = list.map((m: any) => {
      const provider: string = m.provider || '';
      const id: string = m.id || '';
      let providerLabel = provider;
      try { providerLabel = registry.getProviderDisplayName(provider) || provider; } catch {}
      return {
        provider,
        providerLabel,
        id,
        name: m.name || id,
        pattern: provider && id ? `${provider}/${id}` : id,
        configured,
      };
    });
    models.sort(
      (a, b) => a.providerLabel.localeCompare(b.providerLabel) || a.name.localeCompare(b.name),
    );
    return { models };
  } catch (e: any) {
    logger.warn('[PiAgent] listPiModels failed: %s', e && e.message ? e.message : e);
    return { models: [], error: (e && e.message) || String(e) };
  }
}

// ---- 自定义工具：笔记库搜索（进程内直接访问项目服务） ----
import * as db from './database';
import * as rag from './rag';

function kbSearchTool(): any {
  return {
    name: 'kb_search',
    label: '笔记库搜索',
    description:
      '在本地笔记库（知识库）中做语义+关键词混合检索，返回最相关的笔记片段。用于回答涉及用户笔记、文档内容的问题。',
    promptSnippet: 'kb_search(query, kbName?, topK?) - 检索本地笔记库',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词或问题描述' },
        kbName: { type: 'string', description: '指定的知识库名称（可选，留空则搜索全部）' },
        topK: { type: 'number', description: '返回片段数（默认5，最大10）' },
      },
      required: ['query'],
    },
    async execute(
      _toolCallId: unknown,
      params: { query: string; kbName?: string; topK?: number },
    ): Promise<{ content: { type: string; text: string }[]; details: Record<string, unknown> }> {
      try {
        await db.getDb();
        const noteProjects = db.project.list('note');
        let targetProjects = noteProjects;
        if (params.kbName && params.kbName !== 'None' && params.kbName !== 'null') {
          targetProjects = noteProjects.filter((p) => p.name === params.kbName || p.name.includes(params.kbName));
        }
        if (!targetProjects.length) {
          const names = noteProjects.map((p) => p.name).join(', ');
          return { content: [{ type: 'text', text: `知识库未找到。可用: ${names || '无'}` }], details: {} };
        }
        let results: any[] = [];
        const topK = Math.min(params.topK || 5, 10);
        for (const p of targetProjects) {
          try {
            const docs = await rag.hybridSearch(p.id, params.query, topK, db as any);
            results.push(...docs.map((d) => ({ ...d, kbName: p.name })));
          } catch (e: any) {
            logger.warn('[PiAgent] KB search error for %s: %s', p.name, e.message);
          }
        }
        results.sort((a, b) => b.score - a.score);
        const top = results.slice(0, topK);
        if (!top.length) return { content: [{ type: 'text', text: '知识库中未找到相关内容' }], details: {} };
        const text = top.map((d) => `【${d.kbName || '知识库'}】\n${d.text}`).join('\n\n---\n\n');
        return {
          content: [{ type: 'text', text }],
          details: { hits: top.length, projects: targetProjects.map((p) => p.name) },
        };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `笔记库检索失败: ${e.message}` }], details: {} };
      }
    },
  };
}

// ---- 事件回调类型 ----
export interface RunPiCallbacks {
  onDelta?: (text: string) => void;
  onThinking?: (text: string) => void;
  onTool?: (event: { type: 'start' | 'end' | 'thinking'; name?: string; args?: any; error?: boolean; text?: string }) => void;
  onDone?: (finalText: string) => void;
  onError?: (err: string) => void;
}

export interface RunPiOptions extends RunPiCallbacks {
  prompt: string;
  sessionId: string;
  cwd?: string;
  modelPattern?: string;
  images?: Array<{ data: string; mimeType: string }>;
  timeoutMs?: number;
}

/**
 * 使用官方 SDK 执行一轮 pi agent 对话。
 * 事件与旧的 CLI JSON 流语义保持一致（start/end/thinking），前端无需改动。
 */
export async function runPi(opts: RunPiOptions): Promise<void> {
  const {
    prompt,
    sessionId,
    cwd,
    modelPattern,
    images,
    timeoutMs = 300000,
    onDelta = () => {},
    onThinking = () => {},
    onTool = () => {},
    onDone = () => {},
    onError = () => {},
  } = opts;

  let handle: SessionHandle;
  try {
    handle = await getSession({ sessionId, cwd, modelPattern });
  } catch (e: any) {
    onError(`pi 会话初始化失败: ${e.message}`);
    return;
  }
  const { session } = handle;

  // 模型切换：与上次不同的 pattern 才 setModel
  try {
    if (modelPattern && modelPattern !== handle.currentModelPattern) {
      const model = await resolvePiModel(modelPattern);
      if (model) {
        await session.setModel(model);
        handle.currentModelPattern = modelPattern;
      }
    }
  } catch (e: any) {
    logger.warn('[PiAgent] setModel failed: %s', e.message);
  }

  let finalText = '';
  let settled = false;
  const settle = () => { settled = true; };

  const unsubscribe = session.subscribe((evt: any) => {
    if (settled) return;
    switch (evt.type) {
      case 'message_update': {
        const aev = evt.assistantMessageEvent;
        if (!aev) break;
        if (aev.type === 'text_delta' && aev.delta) {
          finalText += aev.delta;
          onDelta(aev.delta);
        } else if (aev.type === 'thinking_delta' && aev.delta) {
          onThinking(aev.delta);
        }
        break;
      }
      case 'tool_execution_start':
        onTool({ type: 'start', name: evt.toolName, args: evt.args });
        break;
      case 'tool_execution_end':
        onTool({ type: 'end', name: evt.toolName, args: evt.args, error: !!evt.isError });
        break;
      default:
        break;
    }
  });

  let hardTimeout: NodeJS.Timeout | null = null;
  if (timeoutMs > 0) {
    hardTimeout = setTimeout(() => {
      logger.warn('[PiAgent] timeout %sms, aborting session %s', timeoutMs, sessionId);
      settle();
      void session.abort().catch(() => {});
      if (finalText) onDone(finalText);
      else onError('pi 处理超时');
    }, timeoutMs);
  }

  try {
    const promptOptions: any = {
      expandPromptTemplates: false,
      source: 'interactive',
    };
    if (images && images.length) {
      promptOptions.images = images.map((img) => ({
        type: 'image',
        source: { type: 'base64', mediaType: img.mimeType || 'image/png', data: img.data },
      }));
    }
    await handle.tail; // 等上一个 prompt 完成（串行化）
    handle.tail = session.prompt(prompt, promptOptions).then(
      () => {},
      (err: Error) => {
        if (settled) return; // 超时/中止已处理
        logger.error('[PiAgent] prompt error: %s', err.message);
        onError(`pi 调用出错: ${err.message}`);
      },
    );
    await handle.tail;
    // prompt 正常结束（含工具调用链）
    if (!settled) {
      settle();
      const msgs = session.agent?.state?.messages || [];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant' && last.stopReason === 'error') {
        onError(last.errorMessage || 'pi 处理出错');
      } else if (!finalText && last && last.role === 'assistant') {
        const textParts = (last.content || [])
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('');
        if (textParts) finalText = textParts;
        onDelta(finalText);
      }
      onDone(finalText);
    }
  } catch (e: any) {
    if (!settled) {
      settle();
      onError(`pi 调用出错: ${e.message}`);
    }
  } finally {
    if (hardTimeout) clearTimeout(hardTimeout);
    unsubscribe();
  }
}

/** 中止指定会话的当前运行 */
export async function abortSession(sessionId: string): Promise<void> {
  const handle = sessions.get(sessionId);
  if (!handle) return;
  try {
    await handle.session.abort();
  } catch (e: any) {
    logger.warn('[PiAgent] abort failed for %s: %s', sessionId, e.message);
  }
}

/** 释放全部会话（应用退出时调用） */
export async function disposeAll(): Promise<void> {
  for (const [, handle] of sessions) {
    try { handle.session.dispose(); } catch {}
  }
  sessions.clear();
}
