const path = require('path');
const fs = require('fs');
const db = require('./database');
const rag = require('./rag');
const logger = require('./logger');

let piSdk = null;
let activeSession = null;

async function ensurePi() {
  if (!piSdk) {
    logger.info('[Orchestrator] Loading pi agent SDK...');
    piSdk = await import('@earendil-works/pi-coding-agent');
    logger.info('[Orchestrator] pi agent SDK loaded');
  }
  return piSdk;
}

// ========== Model Runtime Setup ==========

// ========== Custom Tool Definitions ==========

let TypeBox = null;
async function ensureTypeBox() {
  if (!TypeBox) TypeBox = await import('typebox');
  return TypeBox;
}

async function createTools(dbRef) {
  const sdk = piSdk;
  await ensureTypeBox();
  const { Type } = TypeBox;

  const queryDataset = sdk.defineTool({
    name: 'query_dataset',
    label: 'Query Dataset',
    description: '查询本地数据集中的记录。数据集用于存储结构化信息，如代办事项、客户信息、项目、Bug等。',
    parameters: Type.Object({
      datasetName: Type.String({ description: '数据集名称，如 todos, customers, projects, bugs' }),
      conditions: Type.Optional(Type.String({ description: '查询条件关键字' })),
      limit: Type.Optional(Type.Number({ description: '返回条数上限，默认20' })),
    }),
    execute: async (callId, params) => {
      logger.info(`[Orchestrator] Tool: query_dataset(${params.datasetName})`);
      const all = dbRef.ds.list();
      const ds = all.find(d => d.name === params.datasetName || d.id === params.datasetName);
      if (!ds) {
        const names = all.map(d => d.name).join(', ');
        return { content: [{ type: 'text', text: `数据集 "${params.datasetName}" 不存在。可用数据集: ${names || '无'}` }], details: {} };
      }
      const rows = dbRef.ds.query(ds.id, params.conditions || '');
      const limited = rows.slice(0, params.limit || 20);
      logger.info(`[Orchestrator] Tool result: ${limited.length} records`);
      return { content: [{ type: 'text', text: JSON.stringify(limited, null, 2) }], details: { count: rows.length } };
    },
  });

  const searchKb = sdk.defineTool({
    name: 'search_knowledge_base',
    label: 'Search Knowledge Base',
    description: '在本地知识库中搜索相关笔记/文档。',
    parameters: Type.Object({
      query: Type.String({ description: '搜索关键词或问题' }),
      kbName: Type.Optional(Type.String({ description: '知识库名称（可选）' })),
    }),
    execute: async (callId, params) => {
      logger.info(`[Orchestrator] Tool: search_knowledge_base("${params.query}")`);
      const kbs = dbRef.kb.list();
      let targetKbs = kbs;
      if (params.kbName) targetKbs = kbs.filter(k => k.name === params.kbName || k.name.includes(params.kbName));
      if (!targetKbs.length) {
        const names = kbs.map(k => k.name).join(', ');
        return { content: [{ type: 'text', text: `知识库未找到。可用: ${names || '无'}` }], details: {} };
      }
      let results = [];
      for (const kb of targetKbs) {
        try {
          const docs = await rag.searchKnowledgeBase(kb.id, params.query);
          results.push(...docs.map(d => ({ ...d, kbName: kb.name })));
        } catch (e) {
          logger.warn(`[Orchestrator] KB search error for ${kb.name}: ${e.message}`);
        }
      }
      results.sort((a, b) => b.score - a.score);
      const top = results.slice(0, 5);
      if (!top.length) return { content: [{ type: 'text', text: '知识库中未找到相关内容' }], details: {} };
      const text = top.map(d => `【${d.kbName || '知识库'}】\n${d.text}`).join('\n\n---\n\n');
      return { content: [{ type: 'text', text }], details: { count: top.length } };
    },
  });

  const listDatasets = sdk.defineTool({
    name: 'list_datasets',
    label: 'List Datasets',
    description: '列出所有可用的数据集及其结构。',
    parameters: Type.Object({}),
    execute: async () => {
      const all = dbRef.ds.list();
      return { content: [{ type: 'text', text: all.length ? all.map(d => `- ${d.name} (${d.id}): ${d.schema_json}`).join('\n') : '暂无数据集' }], details: {} };
    },
  });

  const getScheduled = sdk.defineTool({
    name: 'list_scheduled_tasks',
    label: 'List Scheduled Tasks',
    description: '列出所有已配置的定时任务。',
    parameters: Type.Object({}),
    execute: async () => {
      const tasks = dbRef.task.list();
      return { content: [{ type: 'text', text: tasks.length ? tasks.map(t => `- ${t.name} (${t.task_type}) ${t.enabled ? '✓启用' : '✗停用'} cron: ${t.cron_expr || '无'}`).join('\n') : '暂无定时任务' }], details: {} };
    },
  });

  const readProjectFile = sdk.defineTool({
    name: 'read_project_file',
    label: 'Read Project File',
    description: '读取项目目录下的文件内容。',
    parameters: Type.Object({
      filePath: Type.String({ description: '相对于项目根目录的文件路径，或绝对路径' }),
    }),
    execute: async (callId, params) => {
      const projectDir = dbRef.configGet('projectDir') || process.cwd();
      const fullPath = path.isAbsolute(params.filePath) ? params.filePath : path.join(projectDir, params.filePath);
      if (!fullPath.startsWith(projectDir) && !fullPath.startsWith(require('os').homedir())) {
        return { content: [{ type: 'text', text: '无权访问该路径' }], details: {} };
      }
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        return { content: [{ type: 'text', text: content.length > 10000 ? content.slice(0, 10000) + '\n... (截断)' : content }], details: {} };
      } catch (e) {
        return { content: [{ type: 'text', text: `读取失败: ${e.message}` }], details: {} };
      }
    },
  });

  return [queryDataset, searchKb, listDatasets, getScheduled, readProjectFile];
}

// ========== Orchestration ==========

const SYSTEM_PROMPT = `你是一位智能办公助理，可以帮助用户处理各种任务。

## 你的能力

你有两类工具可以使用：

### 1. 内置工具 (built-in)
- read, edit, write, bash, grep, find, ls — 用于阅读和操作文件/代码

### 2. 自定义工具 (local data)
- query_dataset — 查询本地数据集（结构化数据，如：代办事项、客户、项目、Bug等）
- search_knowledge_base — 搜索知识库（非结构化笔记/文档）
- list_datasets — 查看可用的数据集
- list_scheduled_tasks — 查看定时任务
- read_project_file — 读取项目文件

## 工作流程

当用户提问时，请遵循以下步骤：

1. **理解意图**：判断用户需要查询什么类型的数据
2. **查询数据集**：如果问题涉及代办、客户、项目等结构化数据，先用 query_dataset 查询
3. **搜索知识库**：如果问题涉及笔记、文档等非结构化信息，用 search_knowledge_base 搜索
4. **综合分析**：结合所有获取到的信息，给出完整答案
5. **如需操作文件**：使用内置的 read/edit/write/bash 工具

保持回答简洁、准确。`;

async function createSession(projectDir) {
  const sdk = await ensurePi();
  logger.info('[Orchestrator] createSession: cwd=%s', projectDir || process.cwd());

  logger.info('[Orchestrator] Creating tools...');
  const tools = await createTools(db);
  logger.info('[Orchestrator] Custom tools: %d', tools.length);

  const builtinTools = ['read', 'bash', 'grep', 'find', 'ls'];
  logger.info('[Orchestrator] Built-in tools: %s', builtinTools.join(', '));

  const sessionOptions = {
    cwd: projectDir || process.cwd(),
    tools: builtinTools,
    customTools: tools,
    sessionManager: sdk.SessionManager.inMemory(),
  };

  try {
    logger.info('[Orchestrator] Calling createAgentSession...');
    const result = await sdk.createAgentSession(sessionOptions);
    logger.info('[Orchestrator] Session created: id=%s', result.session?.sessionId || 'unknown');
    if (result.modelFallbackMessage) {
      logger.warn('[Orchestrator] Model fallback: %s', result.modelFallbackMessage);
    }
    activeSession = result.session;
    logger.info('[Orchestrator] Session ready');
    return result.session;
  } catch (e) {
    logger.error('[Orchestrator] Session creation FAILED: %s', e.message);
    logger.error('[Orchestrator] Session creation stack: %s', e.stack);
    throw e;
  }
}

async function chat(session, text, onDelta, onTool, onDone, onError, images) {
  logger.info(`[Orchestrator] chat() called, text length: ${text.length}${images?.length ? `, images: ${images.length}` : ''}`);

  session.subscribe((event) => {
    switch (event.type) {
      case 'message_update': {
        const msg = event.assistantMessageEvent;
        if (!msg) { logger.debug('[Orchestrator] message_update without assistantMessageEvent'); break; }
        if (msg.type === 'text_delta') {
          const delta = msg.delta;
          logger.info(`[Orchestrator] text_delta: ${delta.substring(0, 120)}`);
          onDelta?.(delta);
        } else if (msg.type === 'thinking_delta') {
          logger.info(`[Orchestrator] thinking_delta: ${(msg.delta || '').substring(0, 120)}`);
          onTool?.({ type: 'thinking', text: msg.delta });
        } else {
          logger.info(`[Orchestrator] message_update type=${msg.type}`);
        }
        break;
      }
      case 'tool_execution_start':
        logger.info(`[Orchestrator] tool_start: ${event.toolName} args=${JSON.stringify(event.args || {}).substring(0, 200)}`);
        onTool?.({ type: 'start', name: event.toolName, args: event.args });
        break;
      case 'tool_execution_end':
        logger.info(`[Orchestrator] tool_end: ${event.toolName} error=${event.isError} result=${JSON.stringify(event.result || {}).substring(0, 200)}`);
        onTool?.({ type: 'end', name: event.toolName, error: event.isError });
        break;
      case 'agent_start':
        logger.info('[Orchestrator] agent_start — pi agent 开始处理');
        break;
      case 'agent_end':
        logger.info('[Orchestrator] agent_end — pi agent 处理完成');
        onDone?.();
        break;
      case 'turn_start':
        logger.info('[Orchestrator] turn_start — 新的一轮 LLM 调用');
        break;
      case 'turn_end':
        logger.info('[Orchestrator] turn_end — 本轮 LLM 调用结束');
        break;
      case 'message_start':
        logger.info('[Orchestrator] message_start — 新消息开始');
        break;
      case 'message_end':
        logger.info('[Orchestrator] message_end — 消息完成');
        break;
      default:
        logger.info(`[Orchestrator] event: ${event.type} data=${JSON.stringify(event).substring(0, 300)}`);
    }
  });

  const startTime = Date.now();
  try {
    logger.info('[Orchestrator] Calling session.prompt()...');
    const promptOptions = images?.length ? { images } : undefined;
    logger.info('[Orchestrator] prompt input length: %d, images: %d', text.length, images?.length || 0);

    await session.prompt(text, promptOptions);
    const elapsed = Date.now() - startTime;
    logger.info('[Orchestrator] session.prompt() completed in %dms', elapsed);
  } catch (e) {
    const elapsed = Date.now() - startTime;
    logger.error('[Orchestrator] session.prompt() FAILED after %dms: %s', elapsed, e.message);
    logger.error('[Orchestrator] Error stack: %s', e.stack);
    onError?.(e.message);
  } finally {
    setTimeout(() => {
      if (activeSession === session) {
        session.dispose();
        activeSession = null;
        logger.info('[Orchestrator] Session disposed');
      }
    }, 1000);
  }
}

async function checkStatus() {
  try {
    await ensurePi();
    return {
      installed: true,
      version: '0.82.0',
      modelsAvailable: -1,
      firstModel: 'default',
    };
  } catch (e) {
    return { installed: false, version: null, modelsAvailable: 0, firstModel: null, error: e.message };
  }
}

module.exports = { createSession, chat, checkStatus, createTools };