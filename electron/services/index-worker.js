/**
 * 索引工作进程 - 在子进程中执行索引，不阻塞主线程
 */
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(require('os').homedir(), '.biling-ai', 'biling.db');
const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '.opencode', '__pycache__', '.cache']);

let db = null;

async function initDb() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(DB_PATH);
  db = new SQL.Database(buf);
}

function saveDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

// sql.js 的 db.run() 需要参数数组，包装一下
function runSql(sql, params = []) {
  db.run(sql, params);
}

function q(sql) {
  return db.exec(sql);
}

function walkDir(dir, files, ignoreDirs = [], ignoreFiles = []) {
  if (!fs.existsSync(dir)) return;
  const skipDirs = new Set([...IGNORED_DIRS, ...ignoreDirs.map(d => d.trim()).filter(Boolean)]);
  const skipFilePatterns = ignoreFiles.map(f => f.trim()).filter(Boolean).map(f => new RegExp(f.replace(/\*/g, '.*').replace(/\?/g, '.')));
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name) || entry.name.startsWith('.')) continue;
      walkDir(path.join(dir, entry.name), files, ignoreDirs, ignoreFiles);
    } else if (entry.name.endsWith('.md')) {
      if (skipFilePatterns.some(p => p.test(entry.name))) continue;
      files.push(path.join(dir, entry.name));
    }
  }
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

async function embed(text, config) {
  if (config.apiKey) {
    const baseUrl = config.host.replace(/\/+$/, '');
    const basePath = baseUrl.includes('/v1') ? '' : '/v1';
    const url = baseUrl + basePath + '/embeddings';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey },
      body: JSON.stringify({ model: config.model, input: text }),
    });
    if (!res.ok) throw new Error(`嵌入 API 错误: ${res.status}`);
    const data = await res.json();
    if (data.data && data.data.length > 0) return data.data[0].embedding;
    if (data.embeddings && data.embeddings.length > 0) return data.embeddings[0];
    throw new Error('嵌入 API 返回格式异常');
  }
  const ollama = require('ollama').default;
  const client = new ollama.Ollama({ host: config.host });
  const res = await client.embed({ model: config.model, input: text });
  return res.embeddings[0];
}

async function indexProject(projectId) {
  // 读取项目信息
  const proj = q(`SELECT id, name, dir, ignore_dirs, ignore_files FROM prj_projects WHERE id = ${projectId}`);
  if (!proj.length || !proj[0].values.length) throw new Error(`项目 ${projectId} 不存在`);
  const cols = proj[0].values[0];
  const p = { id: cols[0], name: cols[1], dir: cols[2],
    ignore_dirs: cols[3] || '', ignore_files: cols[4] || '' };

  // 读取嵌入配置
  const cfgRows = q("SELECT key, value FROM sys_config WHERE key IN ('embedModel','embeddingBaseUrl','embeddingApiKey')");
  const config = { model: 'bge-m3', host: 'http://127.0.0.1:11434', apiKey: '' };
  if (cfgRows.length && cfgRows[0].values) {
    for (const r of cfgRows[0].values) {
      if (r[0] === 'embedModel') config.model = r[1];
      if (r[0] === 'embeddingBaseUrl') config.host = r[1];
      if (r[0] === 'embeddingApiKey') config.apiKey = r[1];
    }
  }

  const ignoreDirs = p.ignore_dirs ? p.ignore_dirs.split(',').map(s => s.trim()) : [];
  const ignoreFiles = p.ignore_files ? p.ignore_files.split(',').map(s => s.trim()) : [];

  // 清空旧索引
  console.log(`[IndexWorker] 开始索引项目: ${p.name} (${p.dir})`);
  runSql('DELETE FROM kb_chunks WHERE doc_id IN (SELECT id FROM kb_documents WHERE project_id = ?)', [projectId]);
  runSql('DELETE FROM kb_documents WHERE project_id = ?', [projectId]);
  saveDb();

  // 扫描文件
  const files = [];
  walkDir(p.dir, files, ignoreDirs, ignoreFiles);
  const total = files.length;
  console.log(`[IndexWorker] 扫描到 ${total} 个 .md 文件`);

  // 写入文档和 chunk
  const startTime = Date.now();
  for (let i = 0; i < total; i++) {
    const file = files[i];
    if (i === 0 || i === total - 1 || i % 5 === 0) {
      process.send({ type: 'progress', phase: 'scan', current: i + 1, total, file: path.basename(file) });
    }
    const content = fs.readFileSync(file, 'utf-8');
    const stat = fs.statSync(file);
    const title = path.basename(file, '.md');
    console.log(`[IndexWorker]   [${i + 1}/${total}] ${path.basename(file)}`);
    const escPath = file.replace(/'/g, "''");
    runSql('INSERT INTO kb_documents (project_id, path, content, indexed_at, file_mtime, title) VALUES (?, ?, ?, datetime(\'now\', \'+8 hours\'), ?, ?)',
      [projectId, file, content, stat.mtimeMs, title]);
    const docRows = q(`SELECT id FROM kb_documents WHERE project_id = ${projectId} AND path = '${escPath}'`);
    if (!docRows.length || !docRows[0].values.length) continue;
    const docId = docRows[0].values[0][0];
    const chunks = chunkText(content);
    console.log(`[IndexWorker]   → ${chunks.length} chunks`);
    for (const chunk of chunks) {
      runSql('INSERT INTO kb_chunks (doc_id, content) VALUES (?, ?)', [docId, chunk]);
    }
    if (i % 5 === 0) saveDb();
  }
  saveDb();

  // 获取所有未嵌入的 chunk
  const chunkRows = q(`SELECT id, content FROM kb_chunks WHERE doc_id IN (SELECT id FROM kb_documents WHERE project_id = ${projectId}) AND embedding IS NULL`);
  const allChunks = chunkRows.length && chunkRows[0].values ? chunkRows[0].values : [];
  const chunkTotal = allChunks.length;
  console.log(`[IndexWorker] 生成嵌入向量: 共 ${chunkTotal} 个 chunk, 模型=${config.model} @ ${config.host}`);
  if (chunkTotal === 0) console.log(`[IndexWorker] 无新 chunk 需嵌入，跳过`);

  // 生成向量嵌入
  let embedded = 0;
  for (const row of allChunks) {
    try {
      const emb = await embed(row[1], config);
      runSql('UPDATE kb_chunks SET embedding = ? WHERE id = ?', [JSON.stringify(emb), row[0]]);
      embedded++;
      if (embedded === chunkTotal || embedded % 10 === 0) {
        process.send({ type: 'progress', phase: 'embed', current: embedded, total: chunkTotal, file: '' });
      }
      if (embedded % 20 === 0) console.log(`[IndexWorker]   嵌入进度: ${embedded}/${chunkTotal}`);
    } catch (e) {
      console.log(`[IndexWorker]   嵌入失败 chunk ${row[0]}: ${e.message}`);
    }
    if (embedded % 10 === 0) saveDb();
  }
  saveDb();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[IndexWorker] 完成: ${total} 文件, ${embedded} 嵌入 (耗时 ${elapsed}s)`);

  return { projectId: p.id, name: p.name, files: total, chunks: chunkTotal, embedded };
}

process.on('message', async (msg) => {
  if (msg.type === 'start') {
    try {
      await initDb();
      const results = [];
      for (const pid of msg.projectIds) {
        const r = await indexProject(pid);
        results.push(r);
      }
      process.send({ type: 'done', results });
    } catch (e) {
      process.send({ type: 'error', message: e.message });
    }
  }
});
