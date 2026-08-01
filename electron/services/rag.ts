import * as ollama from 'ollama';
import logger from './logger';

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
function configure(opts: any = {}) {
  if (opts.model) embedConfig.model = opts.model;
  if (opts.host) embedConfig.host = opts.host;
  if (opts.apiKey !== undefined) embedConfig.apiKey = opts.apiKey;
  logger.info(`[RAG] 嵌入模型配置: ${embedConfig.model} @ ${embedConfig.host} ${embedConfig.apiKey ? '(已设置 API Key)' : '(无 API Key, 使用 Ollama)'}`);
}

function chunkText(text, maxLen = 512) {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: any[] = [];
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
    const data: any = await res.json();
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
  const segmenterWords: any[] = [];
  const ngramWords: any[] = [];
  const wordPositions: any = {}; // word -> first position in query

  // 1. 标准分词（基于句意），生成有语义的词
  if (CACHED_SEGMENTER) {
    for (const s of CACHED_SEGMENTER.segment(text)) {
      if (s.isWordLike && s.segment.length >= 2) {
        const w = s.segment.toLowerCase();
        segmenterWords.push(w);
        if (wordPositions[w] === undefined) wordPositions[w] = s.index;
      }
    }
  }

  const cleaned = text.replace(/[^一-鿿\w]/g, "").toLowerCase();
  const cjkChars = cleaned.replace(/[^一-鿿]/g, "");

  // 2. n-gram：2-gram + 3-gram，覆盖分词器不识别的公司名等组合
  for (let i = 0; i < cjkChars.length; i++) {
    if (i + 2 <= cjkChars.length) {
      const g = cjkChars.substring(i, i + 2);
      ngramWords.push(g);
      if (wordPositions[g] === undefined) wordPositions[g] = i;
    }
    if (i + 3 <= cjkChars.length) {
      const g = cjkChars.substring(i, i + 3);
      ngramWords.push(g);
      if (wordPositions[g] === undefined) wordPositions[g] = i;
    }
  }

  const allWords = [...new Set([...segmenterWords, ...ngramWords])];

  // 3. 极端回退：逐字切分
  if (allWords.length === 0) {
    for (const ch of text) {
      if (/[一-鿿\w]/.test(ch)) allWords.push(ch.toLowerCase());
    }
  }

  const queryCharSet = new Set();
  for (const ch of cleaned) {
    if (/[一-鿿\w]/.test(ch)) queryCharSet.add(ch);
  }

  return {
    words: allWords,
    phrase: cleaned,
    segmenterWords: new Set(segmenterWords),
    queryChars: cleaned,
    queryCharSet,
    wordPositions,
  };
}

function computeBM25(termFreq, docLen, avgDocLen, totalDocs, docFreq) {
  const k1 = 1.2, b = 0.75;
  const idf = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
  const tf = (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (docLen / avgDocLen)));
  return idf * tf;
}


// 根据词在查询中的位置计算权重：越靠前的词权重越高
function positionalWeight(term, queryLen, wordPositions) {
  const pos = wordPositions[term];
  if (pos === undefined || queryLen <= 1) return 1.0;
  // 位置0权重1.0，线性递减到末尾0.5
  const weight = 1.0 - (pos / (queryLen - 1)) * 0.5;
  return Math.max(weight, 0.5);
}
function keywordSearch(projectId, query, topK = 10, db) {
  const { words, phrase, segmenterWords, queryChars, queryCharSet, wordPositions } = tokenize(query);
  if (words.length === 0 && !phrase) return [];
  logger.info(`[RAG] keywordSearch query="${query}" → words=[${words.join(', ')}]`);

  // 1. 获取所有文档，计算文件名/文件夹/标题得分
  let docs;
  if (projectId) {
    docs = db.q(`SELECT id, path, COALESCE(title, '') as title, project_id
      FROM kb_documents WHERE project_id = ?`, projectId);
  } else {
    docs = db.q(`SELECT id, path, COALESCE(title, '') as title, project_id
      FROM kb_documents`);
  }
  if (!docs.length) return [];

  const docData = new Map();
  const queryCharCount = queryCharSet.size || 1;

  for (const doc of docs) {
    const pathLower = doc.path.toLowerCase();
    const basename = pathLower.split(/[\\\/]/).pop().replace(/\.md$/, '');
    const folderParts = pathLower.split(/[\\\/]/).filter((p, idx, arr) => {
      const f = p.replace(/\.md$/, '');
      return f && (idx < arr.length - 1 || f !== basename);
    });
    const titleLower = doc.title.toLowerCase();

    let fileNameScore = 0, folderScore = 0, titleScore = 0;
    const matchedChars = new Set();
    let phraseMatched = false;

    for (const term of words) {
      // 主要词（来自分词器或长度>=3的3-gram）权重高，纯2-gram噪声权重低
      const isSignificant = segmenterWords.has(term) || term.length >= 3;
      const posWeight = positionalWeight(term, queryChars.length, wordPositions);
      const weight = (isSignificant ? 1.0 : 0.25) * posWeight;
      const termChars = [...term].filter(ch => /[一-鿿\w]/.test(ch));

      if (basename.includes(term)) {
        fileNameScore += 5 * weight;
        termChars.forEach(ch => matchedChars.add(ch));
      }
      for (const part of folderParts) {
        if (part.includes(term)) {
          folderScore += 3 * weight;
          termChars.forEach(ch => matchedChars.add(ch));
          break;
        }
      }
      if (titleLower.includes(term)) {
        titleScore += 3 * weight;
        termChars.forEach(ch => matchedChars.add(ch));
      }
    }

    // 完整短语匹配
    if (phrase.length >= 2) {
      if (basename.includes(phrase)) { fileNameScore += 10; phraseMatched = true; }
      for (const part of folderParts) {
        if (part.includes(phrase)) { folderScore += 5; phraseMatched = true; break; }
      }
      if (titleLower.includes(phrase)) { titleScore += 5; phraseMatched = true; }
    }
    if (phraseMatched) queryCharSet.forEach(ch => matchedChars.add(ch));

    const displayTitle = doc.title || basename;
    docData.set(doc.id, {
      path: doc.path, title: displayTitle, project_id: doc.project_id,
      fileNameScore, folderScore, titleScore, contentScore: 0, bestChunk: "",
      matchedChars, phraseMatched, contentMatchedChars: new Set(),
    });
  }

  // 2. BM25 内容评分
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

    const termDocFreq: any = {};
    for (const term of words) {
      termDocFreq[term] = rows.filter(r => r.content.toLowerCase().includes(term)).length;
    }

    for (const r of rows) {
      const content = r.content.toLowerCase();
      let contentScore = 0;
      const matchedTermChars = new Set();

      for (const term of words) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const termFreq = (content.match(new RegExp(escaped, 'g')) || []).length;
        if (termFreq > 0) {
          const isSignificant = segmenterWords.has(term) || term.length >= 3;
          const posWeight = positionalWeight(term, queryChars.length, wordPositions);
          const weight = (isSignificant ? 1.0 : 0.25) * posWeight;
          contentScore += computeBM25(termFreq, r.content.length, avgDocLen, totalDocs, Math.max(1, termDocFreq[term])) * weight;
          [...term].filter(c => /[一-鿿\w]/.test(c)).forEach(c => matchedTermChars.add(c));
        }
      }

      if (phrase.length >= 2 && content.includes(phrase)) {
        contentScore *= 2.0;
        queryCharSet.forEach(ch => matchedTermChars.add(ch));
      }

      if (contentScore > 0) {
        const fs = docData.get(r.doc_id);
        if (fs && contentScore > fs.contentScore) {
          fs.contentScore = contentScore;
          fs.bestChunk = r.content;
          matchedTermChars.forEach(ch => fs.contentMatchedChars.add(ch));
        }
      }
    }
  }

  // 3. 综合评分：覆盖度 × 基础分 + 首词加分
  const results: any[] = [];
  const segWordArray = [...segmenterWords]; // 有序的分词词列表
  for (const [docId, fs] of docData) {
    const structCoverage = fs.matchedChars.size / queryCharCount;
    const allMatched = new Set([...fs.matchedChars, ...fs.contentMatchedChars]);
    const totalCoverage = Math.max(structCoverage, allMatched.size / queryCharCount);

    const hasStructMatch = fs.fileNameScore > 0 || fs.folderScore > 0 || fs.titleScore > 0;
    if (!hasStructMatch && fs.contentScore === 0) continue;

    const contentNorm = Math.min(fs.contentScore, 10);
    // 权重顺序：文件名(4) > 全路径(2.5) > markdown标题(1.5) > 内容(1)
    let baseScore = fs.fileNameScore * 4 + fs.folderScore * 2.5 + fs.titleScore * 1.5 + contentNorm;
    if (baseScore === 0) continue;

    // === 分词词覆盖度（按位置加权） ===
    // 匹配第1个分词词远比匹配第2个重要
    let segWeightedScore = 0;
    let segWeightedMax = 0;
    for (let wi = 0; wi < segWordArray.length; wi++) {
      const sw = segWordArray[wi];
      const swChars = [...sw].filter(ch => /[一-鿿\w]/.test(ch));
      const wordWeight = wi === 0 ? 2.0 : 1.0; // 首词权重2倍
      segWeightedMax += wordWeight;
      if (swChars.every(ch => fs.matchedChars.has(ch))) {
        segWeightedScore += wordWeight;
      }
    }
    const segWordCoverage = segWeightedMax > 0 ? segWeightedScore / segWeightedMax : 0;

    // === 首词匹配加分 ===
    let firstWordBonus = 0;
    let firstWordMatched = false;
    if (segWordArray.length >= 2) {
      const firstWord = segWordArray[0];
      const firstWordChars = [...firstWord].filter(ch => /[一-鿿\w]/.test(ch));
      const firstInStruct = firstWordChars.every(ch => fs.matchedChars.has(ch));
      const firstInContent = firstWordChars.every(ch => fs.contentMatchedChars.has(ch));
      if (firstInStruct) {
        firstWordBonus = 40; // 首词在结构中匹配 → 大加分
        firstWordMatched = true;
      } else if (firstInContent) {
        firstWordBonus = 20; // 首词只在内容中匹配 → 中加分
        firstWordMatched = true;
      }
    }

    // === 未匹配首词惩罚 ===
    // 如果第一个分词词根本没匹配到，内容相关性再高也不相关，直接打两折
    let noFirstWordPenalty = 1.0;
    if (segWordArray.length >= 2) {
      const firstWord = segWordArray[0];
      const firstWordChars = [...firstWord].filter(ch => /[一-鿿w]/.test(ch));
      const firstMatched = firstWordChars.every(ch =>
        fs.matchedChars.has(ch) || fs.contentMatchedChars.has(ch)
      );
      if (!firstMatched) noFirstWordPenalty = 0.05;
    }

    // 覆盖度乘数：用分词词覆盖度代替纯字符覆盖度
    const coverageMultiplier = 0.3 + structCoverage * 0.5 + segWordCoverage * 1.2 + (hasStructMatch ? 0.4 : 0);

    const phraseBonus = fs.phraseMatched ? 12 : 0;

    // 多维度加分
    let dimCount = 0;
    if (fs.fileNameScore > 0) dimCount++;
    if (fs.folderScore > 0) dimCount++;
    if (fs.titleScore > 0) dimCount++;
    if (fs.contentScore > 0 && fs.matchedChars.size > 0) dimCount++;
    const dimBonus = dimCount >= 2 ? dimCount * 2.5 : 0;

    const totalScore = (baseScore * coverageMultiplier + phraseBonus + dimBonus) * noFirstWordPenalty + firstWordBonus;
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
      coverage: structCoverage,
      dimCount,
      firstWordMatched,
    });
  }

  results.sort((a, b) => b.score - a.score);
  const maxScore = results.length > 0 ? results[0].score : 1;
  for (const s of results) s.score = s.score / maxScore;
  let top = results.slice(0, topK * 2).filter(c => c.score > 0.01);
  // 首词匹配过滤：如果首词命中的结果够多，不显示只匹配后面词的结果
  if (segWordArray.length >= 2) {
    const fwResults = top.filter(r => r.firstWordMatched);
    if (fwResults.length >= Math.min(topK, 5)) {
      top = fwResults.slice(0, topK);
    } else {
      // 首词结果不够时，用其他结果补齐
      const otherResults = top.filter(r => !r.firstWordMatched);
      top = [...fwResults, ...otherResults].slice(0, topK);
    }
  } else {
    top = top.slice(0, topK);
  }
  if (top.length) {
    logger.info(`[RAG] keywordSearch top${top.length}:`);
    for (const r of top.slice(0, 5)) {
      logger.info(`[RAG]   ${(r.score * 100).toFixed(0)}% file=${r.fileNameScore} folder=${r.folderScore} title=${r.titleScore} content=${r.contentScore.toFixed(2)} cov=${(r.coverage * 100).toFixed(0)}% dims=${r.dimCount} | ${r.source.split(/[\\\/]/).pop()}`);
    }
  }
  return top;
}

async function hybridSearch(projectId, query, topK = 10, db) {
  let vectorResults: any[] = [];
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

  // 关键词结果按文件路径建立提升映射
  const kwMap = new Map();
  for (const r of keywordResults) {
    kwMap.set(r.source, r.score);
  }

  // 以向量 chunk 为主体，融合关键词得分
  const combined = vectorResults.map(r => {
    const kScore = kwMap.get(r.source) || 0;
    const best = Math.max(r.score, kScore);
    const avg = (r.score + kScore) / 2;
    return { ...r, kScore, score: best * 0.35 + avg * 0.65 };
  });

  // 补充关键词有但向量未覆盖的文件（取 bestChunk）
  for (const r of keywordResults) {
    if (!combined.some(c => c.source === r.source)) {
      combined.push({
        text: r.text,
        source: r.source,
        title: r.title,
        score: r.score * 0.35,
        kScore: r.score,
        vScore: 0,
      });
    }
  }

  combined.sort((a, b) => b.score - a.score);

  // 去重：每文件最多 2 条，避免单一文件垄断 topK
  const fileCount = new Map();
  const deduped: any[] = [];
  for (const r of combined) {
    const cnt = fileCount.get(r.source) || 0;
    if (cnt >= 2) continue;
    fileCount.set(r.source, cnt + 1);
    deduped.push(r);
  }

  return deduped.slice(0, topK).filter(c => c.score > 0.01);
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
async function testConnection(opts: any = {}) {
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
      const data: any = await res.json();
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

export { configure, chunkText, embed, cosineSimilarity, indexProjectChunks, searchByVector, hybridSearch, keywordSearch, tokenize, extractTitle, testConnection };
