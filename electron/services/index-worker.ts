import * as path from 'path';
import * as fs from 'fs';

const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '__pycache__', '.cache']);
let _pendingProjects: any[] = [];

function walkDir(dir, files, ignoreDirs: any[] = [], ignoreFiles: any[] = []) {
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
    const data: any = await res.json();
    if (data.data && data.data.length > 0) return data.data[0].embedding;
    if (data.embeddings && data.embeddings.length > 0) return data.embeddings[0];
    throw new Error('嵌入 API 返回格式异常');
  }
  const ollama = require('ollama');
  const client = new ollama.Ollama({ host: config.host });
  const res = await client.embed({ model: config.model, input: text });
  return res.embeddings[0];
}

async function scanProject(project) {
  const { id, dir, ignore_dirs, ignore_files } = project;
  console.log(`[IndexWorker] 开始扫描: ${project.name} (${dir})`);

  const ignoreDirs = ignore_dirs ? ignore_dirs.split(',').map(s => s.trim()) : [];
  const ignoreFiles = ignore_files ? ignore_files.split(',').map(s => s.trim()) : [];

  const files: any[] = [];
  walkDir(dir, files, ignoreDirs, ignoreFiles);
  console.log(`[IndexWorker] 扫描到 ${files.length} 个 .md 文件`);

  (process as any).send({ type: 'deleteOld', projectId: id });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const content = fs.readFileSync(file, 'utf-8');
    const stat = fs.statSync(file);
    const title = path.basename(file, '.md');
    const chunks = chunkText(content);

    (process as any).send({
      type: 'doc', projectId: id, path: file, content,
      fileMtime: stat.mtimeMs, title,
      chunks: chunks.map(c => ({ content: c })),
    });

    if (i === 0 || i === files.length - 1 || i % 5 === 0) {
      (process as any).send({ type: 'progress', phase: 'scan', current: i + 1, total: files.length, file: path.basename(file) });
    }
    console.log(`[IndexWorker]   [${i + 1}/${files.length}] ${path.basename(file)} → ${chunks.length} chunks`);
  }

  (process as any).send({ type: 'scanDone', projectId: id, fileCount: files.length });
}

async function embedChunks(msg) {
  const { projectId, chunks, config } = msg;
  const total = chunks.length;
  console.log(`[IndexWorker] 生成嵌入向量: ${total} 个 chunk, 模型=${config.model} @ ${config.host}`);

  let embedded = 0;
  for (const chunk of chunks) {
    try {
      const vector = await embed(chunk.content, config);
      (process as any).send({ type: 'embedding', projectId, chunkId: chunk.id, vector });
      embedded++;
      if (embedded === total || embedded % 10 === 0) {
        (process as any).send({ type: 'progress', phase: 'embed', current: embedded, total, file: '' });
      }
      if (embedded % 20 === 0) console.log(`[IndexWorker]   嵌入进度: ${embedded}/${total}`);
    } catch (e) {
      console.log(`[IndexWorker]   嵌入失败 chunk ${chunk.id}: ${e.message}`);
    }
  }

  console.log(`[IndexWorker] 嵌入完成: ${embedded}/${total}`);
  (process as any).send({ type: 'embedDone', projectId, embedded });
}

function startNextProject() {
  if (_pendingProjects.length === 0) {
    (process as any).send({ type: 'done' });
    return;
  }
  const project = _pendingProjects.shift();
  scanProject(project).catch(e => (process as any).send({ type: 'error', message: e.message }));
}

process.on('message', async (msg: any) => {
  if (msg.type === 'start') {
    _pendingProjects = msg.projects.slice();
    startNextProject();
  } else if (msg.type === 'embed') {
    await embedChunks(msg);
    startNextProject();
  }
});
