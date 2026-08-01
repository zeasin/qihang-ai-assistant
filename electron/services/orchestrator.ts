import * as db from './database';
import logger from './logger';
import { runAgent, historyToMessages, buildUserContent } from './agent';
import * as llm from './llm';
import { buildCodingToolDefs, buildReportToolDefs, buildNoteToolDefs, buildDataToolDefs } from './tools';

// ========== Agent 定义（单对话多模式，类似 opencode 的 plan/build） ==========

const GENERAL_PROMPT = `你是一位个人本地知识库助理，将「数据集（数据中心）」与「本地笔记库」融为一体，帮助用户查询、分析和整理信息。

## 你的能力

你有一个统一的工具集，可跨两类数据工作：

### 1. 数据查询
- query_dataset — 查询本地数据集（结构化数据，如：待办事项、客户、项目、Bug 等）
- search_knowledge_base — 语义搜索知识库（非结构化笔记/文档）
- list_datasets — 查看可用的数据集
- list_scheduled_tasks — 查看定时任务

### 2. 外网搜索
- web_search — 搜索外网资料，获取与查询词相关的网页标题、链接和摘要
- web_fetch — 读取外部 URL 的文本内容（自动去除 HTML 标签）

### 3. 文件/代码操作（仅在关联了代码项目目录时可用）
- read_project_file, list_directory, grep, find — 阅读和搜索文件/代码
- write_file, edit_file, bash — 修改文件和执行命令（仅代码项目；笔记库项目为只读）

## 工作流程

1. **理解意图**：判断问题涉及结构化数据、笔记文档、还是文件操作
2. **查询数据集**：涉及待办、客户、项目等结构化数据时，先用 query_dataset 查询
3. **搜索知识库**：涉及笔记、文档等非结构化信息时，用 search_knowledge_base 搜索（即使数据集查询无结果，也必须继续搜索知识库）
4. **读取文件前先浏览**：不确定文件是否存在时，先调用 list_directory 或 search_knowledge_base 确认准确的目录结构和文件名，**禁止凭记忆猜测文件路径**；若读取返回"文件不存在 + 相似文件名"，按建议的准确路径重试
5. **综合分析**：可将两类数据交叉比对（例如：查某项目的待办 + 查相关笔记），给出完整答案
6. **如需操作文件**：使用文件/代码工具

回答保持简洁、准确；数据来源不确定时说明推测而非编造。

**重要：面对用户的问题，你必须调用工具获取数据后再回答，不得仅凭已知知识回复。如果数据集查询为空，继续搜索知识库**。`;

const NOTE_PROMPT = `你是一位笔记库创作与整理助手，负责在用户的本地笔记库中创作、整理和维护 Markdown 笔记。

## 你的能力

- list_notes — 查看笔记库目录结构
- read_note — 读取笔记内容
- write_note — 创建/覆盖笔记（支持自动建子目录）
- edit_note — 精准编辑已有笔记（oldString → newString）
- delete_note — 删除笔记
- search_knowledge_base — 检索知识库已有内容（写作前先查重/参考）
- web_search / web_fetch — 搜集外网资料作为创作素材

## 工作流程

1. **先检索**：动笔前先 search_knowledge_base，确认主题是否已有笔记，避免重复或冲突
2. **先浏览再读写**：读写笔记前先 list_notes 确认目录结构和准确文件名，禁止凭记忆猜测路径；若 read_note 返回"文件不存在 + 相似文件名"，按建议路径重试
3. **规划结构**：明确笔记标题、章节结构（用 Markdown 标题层级），内容详实、条理清晰
3. **创作/修改**：用 write_note 新建、edit_note 修改已有内容
4. **尊重现有内容**：修改前先 read_note 了解全文；用户要求重写时才整体覆盖
5. **路径规范**：文件路径用相对笔记库根目录的路径，建议以 .md 结尾；可按主题放入子目录

创作风格：结构清晰、语言精炼、重点突出。如用户有特定格式要求，按用户要求执行。`;

const DATA_PROMPT = `你是一位业务数据查询与分析助手，专注处理「数据中心」中的结构化业务数据。

## 你的能力

- query_dataset — 查询本地数据集（结构化数据，如：待办事项、客户、项目、Bug 等），支持条件过滤
- list_datasets — 查看所有可用的数据集及其字段结构
- list_scheduled_tasks — 查看定时任务
- search_knowledge_base — 检索知识库（如需结合背景知识）
- web_search / web_fetch — 查询外网资料辅助分析
- get_today_info — 获取当前日期

## 工作流程

1. **先看结构**：不确定数据集时先 list_datasets 了解有哪些数据集和字段
2. **查询数据**：用 query_dataset 查询，可用条件关键字过滤、限制返回条数
3. **分析总结**：对查询结果做统计、对比、归纳，给出有业务价值的结论
4. **数据为空**：如实说明，不要编造数据

回答保持简洁、准确，用数字说话；不确定时说明推测而非编造。`;

// ========== 模式级工具约束 ==========
// 会写入磁盘的修改类工具（白名单，供模式约束使用）
const WRITE_TOOLS = ['write_file', 'edit_file', 'bash'];

const AGENTS = {
  general: {
    label: '通用对话',
    icon: '💬',
    systemPrompt: GENERAL_PROMPT,
    buildTools: async (ctx) => buildCodingToolDefs(ctx.projectDir),
    // 模式约束：通用模式在笔记库（note 类型项目）下禁止写文件，笔记写入只归 note 模式
    readOnlyOnNoteProject: true,
  },
  note: {
    label: '笔记创作',
    icon: '📝',
    systemPrompt: NOTE_PROMPT,
    buildTools: async (ctx) => {
      const noteTools = await buildNoteToolDefs(ctx.projectId);
      const base = await buildDataToolDefs(ctx.projectDir);
      return [...noteTools, ...base];
    },
  },
  data: {
    label: '业务数据',
    icon: '📊',
    systemPrompt: DATA_PROMPT,
    buildTools: async (ctx) => buildDataToolDefs(ctx.projectDir),
  },
};

const SYSTEM_PROMPT = GENERAL_PROMPT; // 兼容旧引用

/**
 * 创建一个对话会话。
 * @param {string} projectDir - 项目根目录（代码项目时传入）
 * @param {string} [sessionId] - 数据库会话 ID，用于加载历史消息（多轮记忆）
 */
function createSession(projectDir, sessionId) {
  let history: any[] = [];
  if (sessionId) {
    try {
      history = db.chat.messages(sessionId);
      logger.info('[Orchestrator] createSession: projectDir=%s, sessionId=%s, history=%d msgs', projectDir || '(none)', sessionId, history.length);
    } catch (e) {
      logger.warn('[Orchestrator] failed to load history for %s: %s', sessionId, e.message);
    }
  }
  return { projectDir: projectDir || '', sessionId: sessionId || null, messages: history };
}

/**
 * 执行一次对话。
 * @param {Object} session - createSession 的返回值
 * @param {string} text - 用户输入
 * @param {Function} onDelta - (delta: string) => void
 * @param {Function} onTool - (event: object) => void
 * @param {Function} onDone - () => void
 * @param {Function} onError - (err: string) => void
 * @param {Array} [images] - [{ data, mimeType }]
 * @param {number|string} [modelName] - 模型档案 id 或名称（多模型选择）
 */
async function chat(session, text, onDelta, onTool, onDone, onError?, images?, modelName?) {
  logger.info('[Orchestrator] chat() text length=%d, projectDir=%s, model=%s', text.length, session.projectDir || '(none)', modelName || 'default');

  let history = session.messages || [];
  const last = history[history.length - 1];
  // 最后一条用户消息若与本次输入相同，或本次输入是其增强版(如 RAG 注入提示词)，视为已持久化
  const alreadyPersisted = last && last.role === 'user'
    && (last.content === text || (text.includes(last.content) && text.length > last.content.length));

  const { SystemMessage, HumanMessage } = await import('@langchain/core/messages');
  const msgs = await historyToMessages(history);
  if (alreadyPersisted) {
    msgs[msgs.length - 1] = new HumanMessage({ content: buildUserContent(text, images) });
  } else {
    msgs.push(new HumanMessage({ content: buildUserContent(text, images) }));
  }

  // 按会话的 active_agent 分发到对应 Agent（单对话多模式）
  let agentName = 'general';
  let projectId: any = null;
  try {
    const sess = session.sessionId ? db.chat.getSession(session.sessionId) : null;
    if (sess) {
      agentName = sess.active_agent || 'general';
      projectId = sess.project_id || null;
    }
  } catch (e) {
    logger.warn('[Orchestrator] failed to read active_agent: %s', e.message);
  }
  const agentCfg = AGENTS[agentName] || AGENTS.general;
  let toolDefs = await agentCfg.buildTools({ projectDir: session.projectDir, projectId });
  // 模式级约束：笔记库项目 + 声明 readOnlyOnNoteProject 的模式 → 移除写文件类工具
  let projectType: any = null;
  try {
    const p = projectId ? db.project.get(projectId) : null;
    if (p) projectType = p.type;
  } catch (e) { logger.warn('[Orchestrator] failed to read project type: %s', e.message); }
  if (agentCfg.readOnlyOnNoteProject && projectType === 'note') {
    toolDefs = toolDefs.filter(t => !WRITE_TOOLS.includes(t.name));
    logger.info('[Orchestrator] agent=%s read-only on note project, write tools removed', agentName);
  }
  const systemPrompt = agentCfg.systemPrompt;
  logger.info('[Orchestrator] agent=%s (%s), tools=%d', agentName, agentCfg.label, toolDefs.length);

  let reply = '';
  try {
    const { text: result, usedTools } = await runAgent({
      messages: [new SystemMessage(systemPrompt), ...msgs],
      toolDefs,
      onDelta,
      onTool,
      onError,
      maxIterations: 12,
      modelName,
    });
    reply = result;
    if (!reply) {
      logger.warn('[Orchestrator] empty reply (usedTools=%s)', usedTools);
      onError?.('模型未返回有效回复，请检查模型配置或重试。可能原因：模型连接失败、API Key 未配置、或模型未正确响应。');
      return;
    }
    // 追加到会话内存（持久化由调用方负责）
    session.messages = session.messages || [];
    if (!alreadyPersisted) session.messages.push({ role: 'user', content: text, images: images || null });
    session.messages.push({ role: 'assistant', content: reply, images: null });
    onDone?.();
  } catch (e) {
    logger.error('[Orchestrator] chat error: %s', e.message);
    onError?.(e.message);
  }
}

async function checkStatus() {
  try {
    const cfg = llm.resolveConfig();
    const profile = llm.resolveProfile(null);
    const ready = cfg.provider === 'ollama' || !!cfg.apiKey;
    return {
      installed: true,
      version: 'langchain',
      modelsAvailable: ready ? 1 : 0,
      firstModel: profile ? `${profile.name} · ${cfg.model}` : cfg.model,
      model: cfg.model,
      provider: cfg.provider,
      profileName: profile ? profile.name : null,
      error: ready ? null : '未配置 API Key',
    };
  } catch (e) {
    return { installed: false, version: null, modelsAvailable: 0, firstModel: null, error: e.message };
  }
}

/**
 * 兼容旧接口：返回工具定义（新版内部使用）
 * @param {Object} dbRef - 数据库模块
 */
async function createTools(dbRef) {
  return buildCodingToolDefs(null);
}

// ========== 日报生成 (AI-driven) ==========

const REPORT_SYSTEM_PROMPT = `你是一位日报生成助手。请使用提供的工具查询今日数据，然后生成一份完整的综合日报。

## 可用工具
- query_todos — 查询待办事项（plan_todos，按状态、优先级、日期）
- query_messages — 查询今日对话记录
- query_documents — 查询今日更新的文档/笔记（可指定 project_id 过滤）
- query_data_records — 查询数据中心记录
- query_reminders — 查询已启用的提醒
- get_today_info — 获取当前日期、项目信息

## 要求
1. 先调用 get_today_info 了解当前日期和项目
2. 调用各查询工具获取今日数据
3. 按用户要求的格式生成日报
4. 数据为空的部分略过，不要编造
5. 评分要合理，基于实际数据`;

/**
 * 生成日报（供定时任务调用）
 * @param {string} promptText - 完整提示词（系统要求 + 用户格式要求）
 * @param {number} kbId - 知识库/项目 ID
 * @returns {Promise<string>} 日报文本
 */
async function generateDailyReport(promptText, kbId) {
  logger.info('[Orchestrator] generateDailyReport: kbId=%s', kbId);
  const toolDefs = await buildReportToolDefs(kbId);
  const marker = '=== 用户格式要求 ===';
  let systemPrompt = REPORT_SYSTEM_PROMPT;
  let userPrompt = promptText;
  const idx = promptText.indexOf(marker);
  if (idx >= 0) {
    userPrompt = promptText.slice(idx + marker.length).trim();
  }
  const { SystemMessage, HumanMessage } = await import('@langchain/core/messages');
  const { text } = await runAgent({
    messages: [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)],
    toolDefs,
    maxIterations: 15,
  });
  logger.info('[Orchestrator] report generated, length=%d', text.length);
  return text;
}

/**
 * 项目分析（供洞察页面调用）
 * @param {string} projectName
 * @param {number} kbId
 * @param {Array} files - [{ path, content }]
 * @returns {Promise<string>}
 */
async function generateProjectAnalysis(projectName, kbId, files) {
  logger.info('[Orchestrator] generateProjectAnalysis: project=%s', projectName);
  const fileList = (files || []).map(f => `- ${f.path}\n\`\`\`\n${(f.content || '').slice(0, 2000)}\n\`\`\``).join('\n\n');
  const promptText = `请对以下项目"${projectName}"进行详细分析，包括：
1. 项目概述：该项目的主要内容和目的
2. 技术/主题分析：涉及的技术栈、知识领域、核心概念
3. 内容质量评估：文件数量、内容深度、完整性
4. 改进建议：如何优化或扩展该项目

项目文件列表（共 ${(files || []).length} 个文件）：
${fileList}

请用中文回答，使用 Markdown 格式。`;

  const { SystemMessage, HumanMessage } = await import('@langchain/core/messages');
  const { text } = await runAgent({
    messages: [
      new SystemMessage('你是一位项目分析专家，擅长从文件内容中总结项目全貌并给出改进建议。'),
      new HumanMessage(promptText),
    ],
    toolDefs: [],
    maxIterations: 1,
  });
  return text;
}

export { createSession, chat, checkStatus, createTools, generateDailyReport, generateProjectAnalysis, AGENTS };
