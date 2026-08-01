import * as db from './database';
import logger from './logger';

// 运行时补丁：部分 OpenAI 兼容端点（如 SenseNova）的流式帧不携带 role 字段，
// LangChain 会因 role 缺失把帧转成 ChatMessageChunk 而丢弃 tool_calls。
// 此处为流式响应帧补齐 role="assistant"，使工具调用解析正常。
let chatOpenAIPatched = false;
async function patchChatOpenAIStreamRole() {
  if (chatOpenAIPatched) return;
  chatOpenAIPatched = true;
  try {
    const mod = await import('@langchain/openai');
    const ChatOpenAI = mod.ChatOpenAI;
    if (!ChatOpenAI || !ChatOpenAI.prototype || typeof ChatOpenAI.prototype.completionWithRetry !== 'function') {
      logger.warn('[LLM] ChatOpenAI patch skipped: completionWithRetry not found');
      return;
    }
    const orig: any = ChatOpenAI.prototype.completionWithRetry;
    (ChatOpenAI.prototype as any).completionWithRetry = async function (...args: any[]) {
      const result = await orig.apply(this, args);
      if (result && typeof result[Symbol.asyncIterator] === 'function') {
        const self = this;
        return (async function* () {
          for await (const data of result) {
            if (data && data.choices && Array.isArray(data.choices)) {
              for (const choice of data.choices) {
                if (choice.delta && choice.delta.role === undefined) choice.delta.role = 'assistant';
              }
            }
            yield data;
          }
        })();
      }
      return result;
    };
    logger.info('[LLM] patched ChatOpenAI stream role for compatible endpoints');
  } catch (e) {
    logger.warn('[LLM] patch ChatOpenAI stream role failed: %s', e.message);
  }
}

const DEFAULTS = {
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  temperature: 0.7,
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'qwen2.5',
};

function getLlmConfig() {
  return {
    provider: db.configGet('llmProvider') || DEFAULTS.provider,
    model: db.configGet('llmModel') || '',
    apiKey: db.configGet('llmApiKey') || '',
    baseUrl: db.configGet('llmBaseUrl') || '',
    temperature: parseFloat(db.configGet('llmTemperature') || String(DEFAULTS.temperature)),
  };
}

// ========== LLM Profiles (multi-model) ==========

/**
 * 按名称或 ID 解析模型配置档案。
 * @param {number|string|null} ref - profile id 或 name；为空时返回默认档案
 * @returns {Object|null} { id, name, provider, apiKey, baseUrl, model, timeout, modelType }
 */
function resolveProfile(ref) {
  let profile: any = null;
  if (ref !== undefined && ref !== null && ref !== '') {
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
      profile = db.llmProfile.get(Number(ref));
    } else {
      profile = db.llmProfile.list().find(p => p.name === ref) || null;
    }
  }
  if (!profile) profile = db.llmProfile.getDefault();
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider || DEFAULTS.provider,
    apiKey: profile.api_key || '',
    baseUrl: profile.base_url || '',
    model: profile.model || '',
    timeout: profile.timeout || 600,
    modelType: profile.model_type || 'text',
  };
}

/**
 * 合并出最终使用的模型配置。profileRef 优先，否则退回 sys_config（兼容旧配置）。
 */
function resolveConfig(opts: any = {}) {
  const cfg = getLlmConfig();
  const merged = { ...cfg, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined && v !== null && v !== '')) };

  let profile: any = null;
  if (opts.profileRef !== undefined) profile = resolveProfile(opts.profileRef);
  else if (opts.profileName !== undefined) profile = resolveProfile(opts.profileName);
  else profile = resolveProfile(null);
  if (profile) {
    merged.provider = profile.provider;
    merged.model = profile.model || merged.model;
    merged.apiKey = profile.apiKey || merged.apiKey;
    merged.baseUrl = profile.baseUrl || merged.baseUrl;
    (merged as any).profileName = profile.name;
  }

  if (merged.provider === 'ollama') {
    merged.model = merged.model || DEFAULTS.ollamaModel;
    merged.baseUrl = merged.baseUrl || DEFAULTS.ollamaBaseUrl;
  } else {
    merged.model = merged.model || DEFAULTS.model;
    merged.baseUrl = merged.baseUrl || DEFAULTS.baseUrl;
  }
  return merged;
}

async function getChatModel(opts = {}) {
  const cfg = resolveConfig(opts);
  if (cfg.provider === 'ollama') {
    const { ChatOllama } = await import('@langchain/ollama');
    return new ChatOllama({
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      temperature: cfg.temperature,
    });
  }
  const { ChatOpenAI } = await import('@langchain/openai');
  await patchChatOpenAIStreamRole();
  return new ChatOpenAI({
    apiKey: cfg.apiKey || 'sk-placeholder',
    model: cfg.model,
    configuration: { baseURL: cfg.baseUrl },
    temperature: cfg.temperature,
  });
}

async function testConnection(opts = {}) {
  const cfg = resolveConfig(opts);
  try {
    if (cfg.provider === 'ollama') {
      const { ChatOllama } = await import('@langchain/ollama');
      const model = new ChatOllama({ baseUrl: cfg.baseUrl, model: cfg.model, temperature: 0 });
      const res = await model.invoke('你好，请回复"OK"');
      return { ok: true, message: `✅ 连接成功 (Ollama: ${cfg.model} @ ${cfg.baseUrl})`, response: (res.content || '').toString().slice(0, 50) };
    }
    const { ChatOpenAI } = await import('@langchain/openai');
    if (!cfg.apiKey) return { ok: false, message: '❌ 未配置 API Key' };
    const model = new ChatOpenAI({
      apiKey: cfg.apiKey,
      model: cfg.model,
      configuration: { baseURL: cfg.baseUrl },
      temperature: 0,
    });
    const res = await model.invoke('你好，请回复"OK"');
    return { ok: true, message: `✅ 连接成功 (${cfg.model} @ ${cfg.baseUrl})`, response: (res.content || '').toString().slice(0, 50) };
  } catch (e) {
    logger.error('[LLM] test connection failed: %s', e.message);
    return { ok: false, message: `❌ 连接失败: ${e.message || e}` };
  }
}

export { getLlmConfig, resolveConfig, resolveProfile, getChatModel, testConnection, DEFAULTS };
