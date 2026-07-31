const { getChatModel } = require('./llm');
const logger = require('./logger');

let cachedMessages = null;
let cachedTool = null;
let Zod = null;

async function ensureDeps() {
  if (cachedMessages && cachedTool && Zod) return;
  const [messages, tools, zod] = await Promise.all([
    import('@langchain/core/messages'),
    import('@langchain/core/tools'),
    import('zod'),
  ]);
  cachedMessages = messages;
  cachedTool = tools;
  Zod = zod;
  return { messages, tool: tools.tool, z: zod.z };
}

function textFromContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(b => b && (typeof b.text === 'string' ? b.text : b.content || '')).join('');
  }
  return String(content);
}

function imagesToContent(images) {
  if (!images || !images.length) return null;
  return images.map(img => ({
    type: 'image_url',
    image_url: { url: `data:${img.mimeType || 'image/png'};base64,${img.data}` },
  }));
}

function buildUserContent(text, images) {
  const imgBlocks = imagesToContent(images);
  if (!imgBlocks) return text;
  return [{ type: 'text', text }, ...imgBlocks];
}

/**
 * 将数据库消息记录转换为 LangChain 消息数组
 * @param {Array<{role:string, content:string, images?:Array}>} history
 */
async function historyToMessages(history) {
  await ensureDeps();
  const { HumanMessage, AIMessage, SystemMessage } = cachedMessages;
  const msgs = [];
  for (const m of history || []) {
    if (!m || !m.content) continue;
    if (m.role === 'user') {
      msgs.push(new HumanMessage({ content: buildUserContent(m.content, m.images) }));
    } else if (m.role === 'assistant') {
      msgs.push(new AIMessage(m.content));
    } else if (m.role === 'system') {
      msgs.push(new SystemMessage(m.content));
    }
  }
  return msgs;
}

/**
 * 执行一轮 agent 对话
 * @param {Object} opts
 * @param {Array} opts.messages - LangChain 消息数组
 * @param {Array<{name,description,schema,func}>} opts.toolDefs - 工具定义
 * @param {Function} [opts.onDelta] - (text: string) => void
 * @param {Function} [opts.onTool] - (event) => void
 * @param {Function} [opts.onError] - (err: string) => void
 * @param {number} [opts.maxIterations=12] - 最大工具调用轮次
 * @param {number|string} [opts.modelName] - 模型档案 id 或名称（多模型）
 * @returns {Promise<{text:string, usedTools:boolean}>}
 */
async function runAgent({ messages, toolDefs = [], onDelta, onTool, onError, maxIterations = 12, modelName }) {
  await ensureDeps();
  const model = await getChatModel({ profileName: modelName });
  const tools = [];
  const toolMap = new Map();
  if (toolDefs.length) {
    for (const def of toolDefs) {
      const t = cachedTool.tool(def.func, { name: def.name, description: def.description, schema: def.schema });
      tools.push(t);
      toolMap.set(def.name, t);
    }
  }
  const bound = tools.length ? model.bindTools(tools) : model;

  let current = messages;
  let usedTools = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    const chunks = [];
    let streamedText = '';
    try {
      const stream = bound.streamEvents(current, { version: 'v2' });
      for await (const ev of stream) {
        switch (ev.event) {
          case 'on_chat_model_stream': {
            const chunk = ev.data && ev.data.chunk;
            if (chunk) {
              chunks.push(chunk);
              const text = textFromContent(chunk.content);
              if (text) {
                streamedText += text;
                onDelta?.(text);
              }
            }
            break;
          }
          case 'on_llm_error': {
            const err = ev.data && ev.data.err;
            logger.error('[Agent] llm_error: %s', err && err.message);
            onError?.(err && err.message ? err.message : '模型调用失败');
            return { text: streamedText, usedTools };
          }
          default:
            break;
        }
      }
    } catch (e) {
      logger.error('[Agent] stream error: %s', e.message);
      throw e;
    }

    let full = null;
    try {
      const aggregated = chunks.reduce((a, b) => a.concat(b));
      // 工具调用跨多个流式帧（name/id 在第一帧，arguments 分片在后续帧），按 index 聚合并拼接。
      // 注意：不能依赖 aggregated.tool_call_chunks，因为 AIMessageChunk.concat 合并时用
      // `...right` 覆盖 left 字段，导致后续帧的 name="" 覆盖了首帧的真实 name。
      // 改为遍历原始 chunks 的 tool_call_chunks 自行聚合。
      const accByIndex = new Map();
      const collectTcc = (tcc) => {
        if (!Array.isArray(tcc)) return;
        for (const tc of tcc) {
          if (!tc) continue;
          const idx = tc.index ?? 0;
          const acc = accByIndex.get(idx) || { name: '', args: '', id: '' };
          if (tc.name) acc.name += tc.name;
          if (tc.args) acc.args += tc.args;
          if (tc.id) acc.id = tc.id;
          accByIndex.set(idx, acc);
        }
      };
      for (const c of chunks) {
        collectTcc(c.tool_call_chunks);
      }
      // 若 tool_call_chunks 空（如某些兼容端点未生成），回退到原始 delta
      if (!accByIndex.size) {
        for (const c of chunks) {
          collectTcc(c.additional_kwargs && c.additional_kwargs.tool_calls);
        }
      }
      const toolCalls = [];
      for (const acc of accByIndex.values()) {
        if (!acc.name) continue;
        let args = {};
        try { args = JSON.parse(acc.args); } catch {}
        toolCalls.push({ name: acc.name, args, id: acc.id || `${acc.name}_${iter}`, type: 'tool_call' });
      }
      full = new cachedMessages.AIMessage({ content: aggregated.content || '', tool_calls: toolCalls });
    } catch (e) {
      logger.warn('[Agent] failed to aggregate chunks: %s', e.message);
    }
    const toolCalls = (full && full.tool_calls) || [];
    if (!toolCalls.length) {
      const text = streamedText || (full ? textFromContent(full.content) : '');
      return { text, usedTools };
    }

    // 执行工具调用
    const toolMessages = [];
    for (const call of toolCalls) {
      usedTools = true;
      logger.info('[Agent] tool_start: %s args=%s', call.name, JSON.stringify(call.args || {}).substring(0, 200));
      onTool?.({ type: 'start', name: call.name, args: call.args });
      let result;
      let failed = false;
      const t = toolMap.get(call.name);
      if (!t) {
        result = `未知工具: ${call.name}`;
        failed = true;
      } else {
        try {
          const r = await t.invoke(call.args || {});
          result = typeof r === 'string' ? r : JSON.stringify(r);
        } catch (e) {
          logger.error('[Agent] tool %s execution error: %s', call.name, e.message);
          result = `工具执行错误: ${e.message}`;
          failed = true;
        }
      }
      logger.info('[Agent] tool_end: %s error=%s result=%s', call.name, failed, JSON.stringify(result).substring(0, 200));
      onTool?.({ type: 'end', name: call.name, error: failed });
      toolMessages.push(new cachedMessages.ToolMessage(result, call.id || `${call.name}_${iter}`));
    }
    current = [...current, full, ...toolMessages];
    // 若工具结果已附加，继续下一轮
  }

  const err = `工具调用轮次超过上限(${maxIterations}轮),请简化问题或检查工具是否异常`;
  logger.error('[Agent] %s', err);
  throw new Error(err);
}

module.exports = { runAgent, historyToMessages, buildUserContent, textFromContent, ensureDeps };
