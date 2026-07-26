const fs = require('fs');
const path = require('path');
const ollama = require('ollama').default;
const logger = require('./logger');

const RAG_DIR = path.join(require('os').homedir(), '.biling-ai', 'rag');

// 嵌入模型配置（可通过 configure() 修改）
let embedConfig = {
  model: 'nomic-embed-text',
  host: 'http://127.0.0.1:11434',
  apiKey: '',
};

/**
 * 配置嵌入模型参数
 * @param {Object} opts
 * @param {string} [opts.model] - 模型名，如 'nomic-embed-text', 'bge-m3'
 * @param {string} [opts.host] - 服务地址，如 'http://127.0.0.1:11434'
 * @param {string} [opts.apiKey] - API Key（用于非 Ollama 的兼容服务）
 */
function configure(opts = {}) {
  if (opts.model) embedConfig.model = opts.model;
  if (opts.host) embedConfig.host = opts.host;
  if (opts.apiKey !== undefined) embedConfig.apiKey = opts.apiKey;
  logger.info(`[RAG] 嵌入模型配置: ${embedConfig.model} @ ${embedConfig.host} ${embedConfig.apiKey ? '(已设置 API Key)' : '(无 API Key, 使用 Ollama)'}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getIndexPath(kbId) {
  ensureDir(RAG_DIR);
  return path.join(RAG_DIR, `${kbId}.json`);
}

function chunkText(text, maxLen = 512) {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    if ((current + '\n\n' + trimmed).length > maxLen && current) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current = current ? current + '\n\n' + trimmed : trimmed;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.trim()];
}

async function embed(text) {
  // 如果有 apiKey，使用 OpenAI 兼容接口
  if (embedConfig.apiKey) {
    const baseUrl = embedConfig.host.replace(/\/+$/, '');
    const basePath = baseUrl.includes('/v1') ? '' : '/v1';
    const url = baseUrl + basePath + '/embeddings';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + embedConfig.apiKey,
      },
      body: JSON.stringify({
        model: embedConfig.model,
        input: text,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`嵌入 API 错误: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.data && data.data.length > 0) return data.data[0].embedding;
    if (data.embeddings && data.embeddings.length > 0) return data.embeddings[0];
    throw new Error('嵌入 API 返回格式异常: 未找到 embedding 数据');
  }
  // 否则使用 Ollama
  const client = new ollama.Ollama({ host: embedConfig.host });
  const res = await client.embed({ model: embedConfig.model, input: text });
  return res.embeddings[0];
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function indexKnowledgeBase(kbId, kbPath) {
  const index = { chunks: [], embeddings: [] };
  const files = [];
  walkDir(kbPath, files);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const chunks = chunkText(content);
    for (const chunk of chunks) {
      try {
        const emb = await embed(chunk);
        index.chunks.push({ text: chunk, source: file });
        index.embeddings.push(emb);
      } catch (e) {
        logger.error(`[RAG] embed error: ${file}`, e.message);
      }
    }
  }
  fs.writeFileSync(getIndexPath(kbId), JSON.stringify(index));
  return { totalChunks: index.chunks.length, files: files.length };
}

async function searchKnowledgeBase(kbId, query, topK = 5) {
  const indexPath = getIndexPath(kbId);
  if (!fs.existsSync(indexPath)) return [];
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  if (!index.chunks.length) return [];
  const queryEmb = await embed(query);
  const scored = index.chunks.map((c, i) => ({
    ...c,
    score: cosineSimilarity(queryEmb, index.embeddings[i]),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).filter(c => c.score > 0.3);
}

function getIndexStatus(kbId) {
  const indexPath = getIndexPath(kbId);
  if (!fs.existsSync(indexPath)) return { indexed: false, chunks: 0 };
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  return { indexed: true, chunks: index.chunks.length };
}

function walkDir(dir, files) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, files);
    else if (entry.name.endsWith('.md')) files.push(full);
  }
}

/** 测试嵌入模型连接是否正常
 * @param {Object} [opts] - 可选，覆盖当前配置进行测试
 * @param {string} [opts.model]
 * @param {string} [opts.host]
 * @param {string} [opts.apiKey]
 * @returns {Promise<{ok: boolean, message: string, vectorSize?: number}>}
 */
async function testConnection(opts = {}) {
  const model = opts.model || embedConfig.model;
  const host = opts.host || embedConfig.host;
  const apiKey = opts.apiKey !== undefined ? opts.apiKey : embedConfig.apiKey;

  const testText = '测试连接 test connection';

  try {
    if (apiKey) {
      // 测试 OpenAI 兼容接口
      const baseUrl = host.replace(/\/+$/, '');
      const basePath = baseUrl.includes('/v1') ? '' : '/v1';
      const url = baseUrl + basePath + '/embeddings';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({ model, input: testText }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { ok: false, message: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
      }
      const data = await res.json();
      let emb;
      if (data.data && data.data.length > 0) emb = data.data[0].embedding;
      else if (data.embeddings && data.embeddings.length > 0) emb = data.embeddings[0];
      if (!emb) return { ok: false, message: 'API 返回格式异常：未找到 embedding 数据' };
      return { ok: true, message: `✅ 连接成功 (向量维度: ${emb.length})`, vectorSize: emb.length };
    } else {
      // 测试 Ollama
      const client = new ollama.Ollama({ host });
      const res = await client.embed({ model, input: testText });
      if (!res || !res.embeddings || !res.embeddings.length) {
        return { ok: false, message: 'Ollama 返回异常：未找到 embedding 数据' };
      }
      const emb = res.embeddings[0];
      return { ok: true, message: `✅ 连接成功 (向量维度: ${emb.length})`, vectorSize: emb.length };
    }
  } catch (e) {
    return { ok: false, message: `❌ 连接失败: ${e.message || e}` };
  }
}

module.exports = { configure, indexKnowledgeBase, searchKnowledgeBase, getIndexStatus, chunkText, embed, testConnection };
