const ollama = require('ollama');
const logger = require('./logger');

// 嵌入模型配置（可通过 configure() 修改）
let embedConfig = {
  model: 'bge-m3',
  host: 'http://127.0.0.1:11434',
  apiKey: '',
};

/**
 * 配置嵌入模型参数
 * @param {Object} opts
 * @param {string} [opts.model] - 模型名，如 'bge-m3'
 * @param {string} [opts.host] - 服务地址，如 'http://127.0.0.1:11434'
 * @param {string} [opts.apiKey] - API Key（用于非 Ollama 的兼容服务）
 */
function configure(opts = {}) {
  if (opts.model) embedConfig.model = opts.model;
  if (opts.host) embedConfig.host = opts.host;
  if (opts.apiKey !== undefined) embedConfig.apiKey = opts.apiKey;
  logger.info(`[RAG] 嵌入模型配置: ${embedConfig.model} @ ${embedConfig.host} ${embedConfig.apiKey ? '(已设置 API Key)' : '(无 API Key, 使用 Ollama)'}`);
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
      body: JSON.stringify({ model: embedConfig.model, input: text }),
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
  const client = new ollama.Ollama({ host: embedConfig.host });
  const res = await client.embed({ model: embedConfig.model, input: text });
  return res.embeddings[0];
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 为指定项目的所有未嵌入 kb_chunks 生成向量并存储
 * @param {number} projectId
 * @param {object} db - database module（内部 require，避免循环依赖）
 * @returns {Promise<number>} 嵌入的 chunk 数量
 */
async function indexProjectChunks(projectId, db, onProgress) {
  const rows = db.q('SELECT id, content FROM kb_chunks WHERE doc_id IN (SELECT id FROM kb_documents WHERE project_id = ?) AND embedding IS NULL', projectId);
  if (!rows.length) return 0;

  let embedded = 0;
  const total = rows.length;
  for (const row of rows) {
    try {
      const emb = await embed(row.content);
      db.run('UPDATE kb_chunks SET embedding = ? WHERE id = ?', JSON.stringify(emb), row.id);
      embedded++;
      if (onProgress) onProgress({ phase: 'embed', current: embedded, total, file: '' });
    } catch (e) {
      logger.error(`[RAG] embed error for chunk ${row.id}:`, e.message);
    }
  }
  logger.info(`[RAG] embedded ${embedded}/${total} chunks for project ${projectId}`);
  return embedded;
}

const CACHED_SEGMENTER = (() => {
  try { return new Intl.Segmenter('zh', { granularity: 'word' }); } catch { return null; }
})();

function tokenize(text) {
  const words = [];

  // 1. 标准分词（句意分词器）
  if (CACHED_SEGMENTER) {
    for (const s of CACHED_SEGMENTER.segment(text)) {
      if (s.isWordLike && s.segment.length >= 2) words.push(s.segment.toLowerCase());
    }
  }

  const cleaned = text.replace(/[^\u4e00-\u9fff\w]/g, '').toLowerCase();

  // 2. 中文 2-gram：覆盖公司名、简称等分词器不认识的组合词
  const cjkChars = cleaned.replace(/[^\u4e00-\u9fff]/g, '');
  for (let i = 0; i < cjkChars.length - 1; i++) {
    words.push(cjkChars.substring(i, i + 2));
  }

  // 3. 极端回退：逐字切分
  if (words.length === 0) {
    for (const ch of text) {
      if (/[\u4e00-\u9fff\w]/.test(ch)) words.push(ch.toLowerCase());
    }
  }

  return { words: [...new Set(words)], phrase: cleaned };
}

function computeBM25(termFreq, docLen, avgDocLen, totalDocs, docFreq) {
  const k1 = 1.2, b = 0.75;
  const idf = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
  const tf = (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (docLen / avgDocLen)));
  return idf * tf;
}

function keywordSearch(projectId, query, topK = 10, db) {
  const { words, phrase } = tokenize(query);
  if (words.length === 0 && !phrase) return [];
  logger.info(`[RAG] keywordSearch query="${query}" → words=[${words.join(', ')}] phrase="${phrase}"`);

  // 1. 获取所有文档（含标题），计算文件名/文件夹/标题得分
  let docs;
  if (projectId) {
    docs = db.q(`SELECT id, path, COALESCE(title, '') as title, project_id
      FROM kb_documents WHERE project_id = ?`, projectId);
  } else {
    docs = db.q(`SELECT id, path, COALESCE(title, '') as title, project_id
      FROM kb_documents`);
  }
  if (!docs.length) return [];

  const docFileScores = new Map();
  for (const doc of docs) {
    const pathLower = doc.path.toLowerCase();
    const basename = pathLower.split(/[\\/]/).pop().replace(/\.md$/, '');
    const folderParts = pathLower.split(/[\\/]/).filter(p => {
      const f = p.replace(/\.md$/, '');
      return f && f !== basename;
    });
    const titleLower = doc.title.toLowerCase();

    let fileNameScore = 0;
    let folderScore = 0;
    let titleScore = 0;

    for (const term of words) {
      if (basename.includes(term)) fileNameScore += 5;
      for (const part of folderParts) {
        if (part.includes(term)) folderScore += 3;
      }
      if (titleLower.includes(term)) titleScore += 3;
    }

    if (phrase.length >= 2) {
      if (basename.includes(phrase)) fileNameScore += 15;
      for (const part of folderParts) {
        if (part.includes(phrase)) folderScore += 8;
      }
      if (titleLower.includes(phrase)) titleScore += 8;
    }

    const displayTitle = doc.title || basename;
    docFileScores.set(doc.id, {
      path: doc.path, title: displayTitle, project_id: doc.project_id,
      fileNameScore, folderScore, titleScore, contentScore: 0, bestChunk: '',
    });
  }

  // 2. 获取所有 chunk，计算 BM25 内容得分
  let rows;
  if (projectId) {
    rows = db.q(`SELECT c.id, c.content, d.id as doc_id
      FROM kb_chunks c JOIN kb_documents d ON c.doc_id = d.id
      WHERE d.project_id = ?`, projectId);
  } else {
    rows = db.q(`SELECT c.id, c.content, d.id as doc_id
      FROM kb_chunks c JOIN kb_documents d ON c.doc_id = d.id`);
  }

  if (rows.length) {
    const docLenList = rows.map(r => r.content.length);
    const avgDocLen = docLenList.reduce((a, b) => a + b, 0) / docLenList.length;
    const totalDocs = docs.length;

    const termDocFreq = {};
    for (const term of words) {
      termDocFreq[term] = rows.filter(r => r.content.toLowerCase().includes(term)).length;
    }

    for (const r of rows) {
      const content = r.content.toLowerCase();
      let contentScore = 0;
      for (const term of words) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const termFreq = (content.match(new RegExp(escaped, 'g')) || []).length;
        if (termFreq > 0) {
          contentScore += computeBM25(termFreq, r.content.length, avgDocLen, totalDocs, Math.max(1, termDocFreq[term]));
        }
      }
      if (contentScore > 0 && phrase.length >= 2 && content.includes(phrase)) {
        contentScore *= 1.8;
      }
      if (contentScore > 0) {
        const fs = docFileScores.get(r.doc_id);
        if (fs && contentScore > fs.contentScore) {
          fs.contentScore = contentScore;
          fs.bestChunk = r.content;
        }
      }
    }
  }

  // 3. 计算综合得分并排序
  const results = [];
  for (const [docId, fs] of docFileScores) {
    const totalScore = fs.fileNameScore * 3 + fs.folderScore * 2 + fs.titleScore * 1.5 + fs.contentScore;
    if (totalScore === 0) continue;
    results.push({
      text: fs.bestChunk || '',
      source: fs.path,
      score: totalScore,
      title: fs.title,
      project_id: fs.project_id,
      fileNameScore: fs.fileNameScore,
      folderScore: fs.folderScore,
      titleScore: fs.titleScore,
      contentScore: fs.contentScore,
    });
  }

  results.sort((a, b) => b.score - a.score);
  const maxScore = results.length > 0 ? results[0].score : 1;
  for (const s of results) s.score = s.score / maxScore;
  const top = results.slice(0, topK).filter(c => c.score > 0.01);
  if (top.length) {
    logger.info(`[RAG] keywordSearch top${top.length}:`);
    for (const r of top.slice(0, 5)) {
      logger.info(`[RAG]   ${(r.score * 100).toFixed(0)}% file=${(r.fileNameScore || 0)} folder=${(r.folderScore || 0)} title=${(r.titleScore || 0)} content=${(r.contentScore || 0).toFixed(2)} | ${r.source.split(/[\\/]/).pop()}`);
    }
  }
  return top;
}

async function hybridSearch(projectId, query, topK = 10, db) {
  let vectorResults = [];
  try {
    const queryEmb = await embed(query);
    let rows;
    if (projectId) {
      rows = db.q(`SELECT c.id, c.content, c.embedding, d.path, d.project_id
        FROM kb_chunks c JOIN kb_documents d ON c.doc_id = d.id
        WHERE d.project_id = ? AND c.embedding IS NOT NULL`, projectId);
    } else {
      rows = db.q(`SELECT c.id, c.content, c.embedding, d.path, d.project_id
        FROM kb_chunks c JOIN kb_documents d ON c.doc_id = d.id
        WHERE c.embedding IS NOT NULL`);
    }
    if (rows.length) {
      vectorResults = rows.map(r => ({
        text: r.content, source: r.path, project_id: r.project_id,
        score: cosineSimilarity(queryEmb, JSON.parse(r.embedding)),
        title: r.path ? r.path.split(/[\\/]/).pop() : '未知',
        _type: 'vector',
      }));
      const maxVS = Math.max(...vectorResults.map(r => r.score), 0.01);
      for (const r of vectorResults) r.score = r.score / maxVS;
    }
  } catch {}

  const keywordResults = keywordSearch(projectId, query, topK * 3, db);
  for (const r of keywordResults) r._type = 'keyword';

  if (!vectorResults.length) return keywordResults.slice(0, topK);
  if (!keywordResults.length) return vectorResults.slice(0, topK);

  const merged = new Map();
  for (const r of vectorResults) {
    const key = r.source;
    if (merged.has(key)) {
      const existing = merged.get(key);
      if (r.score > existing.vScore) existing.vScore = r.score;
    } else {
      merged.set(key, { source: r.source, text: r.text, title: r.title, vScore: r.score, kScore: 0 });
    }
  }
  for (const r of keywordResults) {
    const key = r.source;
    if (merged.has(key)) {
      merged.get(key).kScore = Math.max(merged.get(key).kScore, r.score);
    } else {
      merged.set(key, { source: r.source, text: r.text, title: r.title, vScore: 0, kScore: r.score });
    }
  }

  for (const [k, v] of merged) {
    const rankV = 1 / (2 + (1 - v.vScore) * 100);
    const rankK = 1 / (2 + (1 - v.kScore) * 100);
    v.score = rankV * 0.6 + rankK * 0.4;
  }

  const finalResults = [...merged.values()];
  finalResults.sort((a, b) => b.score - a.score);
  return finalResults.slice(0, topK).filter(c => c.score > 0.01);
}

/**
 * 在指定项目中按向量相似度搜索
 * @param {number} projectId
 * @param {string} query
 * @param {number} topK
 * @param {object} db - database module
 * @returns {Promise<Array>} [{ text, source, score, title }]
 */
async function searchByVector(projectId, query, topK = 5, db) {
  const queryEmb = await embed(query);

  let rows;
  if (projectId) {
    rows = db.q(`SELECT c.id, c.content, c.embedding, d.path
      FROM kb_chunks c JOIN kb_documents d ON c.doc_id = d.id
      WHERE d.project_id = ? AND c.embedding IS NOT NULL`, projectId);
  } else {
    rows = db.q(`SELECT c.id, c.content, c.embedding, d.path
      FROM kb_chunks c JOIN kb_documents d ON c.doc_id = d.id
      WHERE c.embedding IS NOT NULL`);
  }

  if (!rows.length) return [];

  const scored = rows.map(r => ({
    text: r.content,
    source: r.path,
    score: cosineSimilarity(queryEmb, JSON.parse(r.embedding)),
    title: r.path ? r.path.split(/[\\/]/).pop() : '未知',
  }));

  scored.sort((a, b) => b.score - a.score);
  const maxScore = scored.length > 0 ? scored[0].score : 1;
  for (const s of scored) s.score = s.score / maxScore;
  return scored.slice(0, topK).filter(c => c.score > 0.2);
}

/**
 * 从 markdown 内容中提取第一个标题（#、## 等）
 */
function extractTitle(content) {
  if (!content) return '';
  const match = content.match(/^#{1,6}\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

/** 测试嵌入模型连接是否正常 */
async function testConnection(opts = {}) {
  const model = opts.model || embedConfig.model;
  const host = opts.host || embedConfig.host;
  const apiKey = opts.apiKey !== undefined ? opts.apiKey : embedConfig.apiKey;
  const testText = '测试连接 test connection';

  try {
    if (apiKey) {
      const baseUrl = host.replace(/\/+$/, '');
      const basePath = baseUrl.includes('/v1') ? '' : '/v1';
      const url = baseUrl + basePath + '/embeddings';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
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
      const client = new ollama.Ollama({ host });
      const res = await client.embed({ model, input: testText });
      if (!res || !res.embeddings || !res.embeddings.length) {
        return { ok: false, message: 'Ollama 返回异常：未找到 embedding 数据' };
      }
      return { ok: true, message: `✅ 连接成功 (向量维度: ${res.embeddings[0].length})`, vectorSize: res.embeddings[0].length };
    }
  } catch (e) {
    return { ok: false, message: `❌ 连接失败: ${e.message || e}` };
  }
}

module.exports = { configure, chunkText, embed, cosineSimilarity, indexProjectChunks, searchByVector, hybridSearch, keywordSearch, tokenize, extractTitle, testConnection };
