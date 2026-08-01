import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import * as db from './database';
import * as rag from './rag';
import logger from './logger';

let cachedZ: any = null;
async function ensureZ() {
  if (!cachedZ) cachedZ = (await import('zod')).z;
  return cachedZ;
}

const IGNORED_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '__pycache__', '.cache', 'dist', 'build', 'target', '.idea', '.vscode', 'release', 'out', 'tmp', 'temp']);

function projectRoot(projectDir) {
  return projectDir || process.cwd();
}

function safePath(fullPath, projectDir) {
  const root = projectRoot(projectDir);
  const rootNorm = path.resolve(root);
  const fullNorm = path.resolve(fullPath);
  if (!fullNorm.startsWith(rootNorm) && !fullNorm.startsWith(os.homedir())) return null;
  return fullNorm;
}

function walkDir(dir, out, opts: any = {}) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      walkDir(full, out, opts);
    } else if (e.isFile() && !e.name.startsWith('.')) {
      if (opts.ext && !opts.ext.some(x => e.name.endsWith(x))) continue;
      out.push(full);
    }
  }
}

// ========== 外网工具 ==========

async function webSearchTool({ query, maxResults }) {
  const limit = Math.min(maxResults || 8, 15);
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return `搜索请求失败 (HTTP ${res.status})`;
    const html = await res.text();

    const results: any[] = [];
    const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const links: any[] = [];
    const snippets: any[] = [];
    let m;
    while ((m = linkRegex.exec(html)) !== null && links.length < limit) {
      links.push({ url: m[1].replace(/^\/\/?/, 'https://'), title: m[2].replace(/<[^>]+>/g, '').trim() });
    }
    while ((m = snippetRegex.exec(html)) !== null && snippets.length < limit) {
      snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
    }
    for (let i = 0; i < Math.min(links.length, limit); i++) {
      results.push(`[${i + 1}] ${links[i].title}\n    链接: ${links[i].url}\n    摘要: ${(snippets[i] || '(无摘要)').slice(0, 300)}`);
    }
    if (!results.length) {
      const fallback = html.match(/<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
      if (fallback) {
        for (const block of fallback.slice(0, limit)) {
          const titleMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
          const textMatch = block.replace(/<[^>]+>/g, '').trim().slice(0, 200);
          if (titleMatch) {
            results.push(`[${results.length + 1}] ${titleMatch[2].replace(/<[^>]+>/g, '').trim()}\n    链接: ${titleMatch[1].replace(/^\/\/?/, 'https://')}\n    摘要: ${textMatch.slice(0, 300)}`);
          }
        }
      }
    }
    return results.length
      ? results.join('\n\n')
      : `未找到 "${query}" 的相关结果，可尝试更换关键词。`;
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return '搜索超时，请稍后重试。';
    return `搜索失败: ${e.message}`;
  }
}

async function webFetchTool({ url, maxLength }) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return '仅支持 http/https 协议';
  const limit = Math.min(maxLength || 8000, 50000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
    const contentType = res.headers.get('content-type') || '';
    const isText = contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('javascript');
    if (!isText) return `不支持非文本内容: ${contentType}`;

    let text = await res.text();
    text = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > limit) text = text.slice(0, limit) + '\n\n...(内容已截断，全文过长)';
    return text || '(页面内容为空)';
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return '请求超时，请检查 URL 或稍后重试。';
    return `获取失败: ${e.message}`;
  }
}

// ========== 笔记库工具 ==========

function noteDirOf(projectId) {
  if (!projectId) return null;
  const p = db.project.get(projectId);
  if (!p || p.type !== 'note' || !p.dir || !fs.existsSync(p.dir)) return null;
  return p.dir;
}

function safeNotePath(noteDir, p) {
  const full = path.isAbsolute(p) ? p : path.join(noteDir, p);
  const norm = path.resolve(full);
  return norm.startsWith(path.resolve(noteDir)) ? norm : null;
}

// 在 rootDir 中按文件名相似度搜索，返回相对路径候选（用于读取失败时的纠错引导）
function findSimilarFiles(rootDir, relTarget, max = 5) {
  const target = String(relTarget || '').replace(/\\/g, '/').replace(/^\.?\//, '');
  const targetBase = path.basename(target, path.extname(target)).toLowerCase();
  const targetTokens = targetBase.replace(/[^\w\u4e00-\u9fa5]+/g, ' ').split(' ').filter(t => t.length >= 2);
  if (!targetTokens.length) return [];
  const hits: any[] = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        walk(full);
      } else {
        const rel = path.relative(rootDir, full).replace(/\\/g, '/');
        const relLower = rel.toLowerCase();
        let score = 0;
        for (const t of targetTokens) if (relLower.includes(t)) score += t.length;
        if (score > 0) hits.push({ rel, score });
      }
    }
  };
  walk(rootDir);
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, max).map(h => h.rel);
}

function notFoundHint(rootDir, relPath, listToolName) {
  const similar = findSimilarFiles(rootDir, relPath);
  const hint = similar.length
    ? ` 目录中相似的文件:\n${similar.map(s => '  - ' + s).join('\n')}\n`
    : '';
  return `文件不存在: ${relPath}。\n${hint}请先调用 ${listToolName} 查看目录结构，确认准确的文件路径后重试。`;
}

async function listNotesTool({ path: relPath, projectId }) {
  const noteDir = noteDirOf(projectId);
  if (!noteDir) return '未关联可用的笔记库，请先在会话中关联笔记库（note 类型项目）。';
  const target = safeNotePath(noteDir, relPath || '.');
  if (!target) return '路径越权，只能访问笔记库目录';
  if (!fs.existsSync(target)) return `目录不存在: ${relPath || '.'}。请用 list_notes 查看笔记库根目录结构。`;
  try {
    const items = fs.readdirSync(target, { withFileTypes: true });
    return items
      .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
      .map(e => (e.isDirectory() ? `[目录] ${e.name}/` : `[文件] ${e.name}`))
      .join('\n');
  } catch (e) {
    return `读取失败: ${e.message}`;
  }
}

async function readNoteTool({ path: relPath, projectId }) {
  const noteDir = noteDirOf(projectId);
  if (!noteDir) return '未关联可用的笔记库，请先在会话中关联笔记库（note 类型项目）。';
  const target = safeNotePath(noteDir, relPath);
  if (!target) return '路径越权，只能访问笔记库目录';
  if (!fs.existsSync(target)) return notFoundHint(noteDir, relPath, 'list_notes');
  try {
    const content = fs.readFileSync(target, 'utf-8');
    return content.length > 20000 ? content.slice(0, 20000) + '\n... (截断)' : content;
  } catch (e) {
    return `读取失败: ${e.message}`;
  }
}

async function writeNoteTool({ path: relPath, content, projectId }) {
  const noteDir = noteDirOf(projectId);
  if (!noteDir) return '未关联可用的笔记库，请先在会话中关联笔记库（note 类型项目）。';
  const target = safeNotePath(noteDir, relPath);
  if (!target) return '路径越权，只能访问笔记库目录';
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');
    return `已写入笔记 ${path.relative(noteDir, target)} (${content.length} 字符)`;
  } catch (e) {
    return `写入失败: ${e.message}`;
  }
}

async function editNoteTool({ path: relPath, oldString, newString, projectId }) {
  const noteDir = noteDirOf(projectId);
  if (!noteDir) return '未关联可用的笔记库，请先在会话中关联笔记库（note 类型项目）。';
  const target = safeNotePath(noteDir, relPath);
  if (!target) return '路径越权，只能访问笔记库目录';
  if (!fs.existsSync(target)) return '文件不存在';
  try {
    const content = fs.readFileSync(target, 'utf-8');
    const count = content.split(oldString).length - 1;
    if (count === 0) return '未找到要替换的内容';
    if (count > 1) return `找到 ${count} 处匹配，请提供更多上下文以唯一确定替换位置`;
    fs.writeFileSync(target, content.replace(oldString, newString), 'utf-8');
    return `已编辑笔记 ${path.relative(noteDir, target)}`;
  } catch (e) {
    return `编辑失败: ${e.message}`;
  }
}

async function deleteNoteTool({ path: relPath, projectId }) {
  const noteDir = noteDirOf(projectId);
  if (!noteDir) return '未关联可用的笔记库，请先在会话中关联笔记库（note 类型项目）。';
  const target = safeNotePath(noteDir, relPath);
  if (!target) return '路径越权，只能访问笔记库目录';
  if (!fs.existsSync(target)) return '文件不存在';
  try {
    fs.unlinkSync(target);
    return `已删除笔记 ${path.relative(noteDir, target)}`;
  } catch (e) {
    return `删除失败: ${e.message}`;
  }
}

// ========== 本地数据工具 ==========

async function queryDatasetTool({ datasetName, conditions, limit }, projectDir) {
  const all = db.ds.list();
  const ds = all.find(d => d.name === datasetName || d.id === datasetName);
  if (!ds) {
    const names = all.map(d => d.name).join(', ');
    return `数据集 "${datasetName}" 不存在。可用数据集: ${names || '无'}`;
  }
  const rows = db.ds.query(ds.id, conditions || '');
  const limited = rows.slice(0, limit || 20);
  logger.info('[Tools] query_dataset: %s → %d records', datasetName, limited.length);
  return JSON.stringify(limited, null, 2);
}

async function searchKbTool({ query, kbName }, projectDir) {
  const noteProjects = db.project.list('note');
  let targetProjects = noteProjects;
  if (kbName && kbName !== 'None' && kbName !== 'null') {
    targetProjects = noteProjects.filter(p => p.name === kbName || p.name.includes(kbName));
  }
  if (!targetProjects.length) {
    const names = noteProjects.map(p => p.name).join(', ');
    return `知识库未找到。可用: ${names || '无'}`;
  }
  let results: any[] = [];
  for (const p of targetProjects) {
    try {
      const docs = await rag.hybridSearch(query, 5, db);
      results.push(...docs.map(d => ({ ...d, kbName: p.name })));
    } catch (e) {
      logger.warn('[Tools] KB search error for %s: %s', p.name, e.message);
    }
  }
  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, 5);
  if (!top.length) return '知识库中未找到相关内容';
  return top.map(d => `【${d.kbName || '知识库'}】\n${d.text}`).join('\n\n---\n\n');
}

async function listDatasetsTool() {
  const all = db.ds.list();
  return all.length ? all.map(d => `- ${d.name} (${d.id}): ${d.schema_json}`).join('\n') : '暂无数据集';
}

async function listScheduledTasksTool() {
  return '暂无定时任务（任务系统已移除）';
}

async function readProjectFileTool({ filePath }, projectDir) {
  const root = projectRoot(projectDir);
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const checked = safePath(fullPath, projectDir);
  if (!checked) return '无权访问该路径';
  try {
    const content = fs.readFileSync(checked, 'utf-8');
    return content.length > 10000 ? content.slice(0, 10000) + '\n... (截断)' : content;
  } catch (e) {
    if (e.code === 'ENOENT') return notFoundHint(root, filePath, 'list_directory');
    return `读取失败: ${e.message}`;
  }
}

// ========== 编码工具 ==========

async function listDirectoryTool({ path: dirPath }, projectDir) {
  const root = projectRoot(projectDir);
  const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(root, dirPath);
  const checked = safePath(fullPath, projectDir);
  if (!checked || !fs.existsSync(checked)) return '目录不存在或无权访问。请用 list_directory 传入 "." 查看根目录，或传入项目内存在的相对路径。';
  try {
    const items = fs.readdirSync(checked, { withFileTypes: true });
    return items
      .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
      .map(e => (e.isDirectory() ? `[目录] ${e.name}/` : `[文件] ${e.name}`))
      .join('\n');
  } catch (e) {
    return `读取失败: ${e.message}`;
  }
}

async function grepTool({ pattern, path: dirPath, ext }, projectDir) {
  const root = projectRoot(projectDir);
  const fullPath = dirPath ? (path.isAbsolute(dirPath) ? dirPath : path.join(root, dirPath)) : root;
  const checked = safePath(fullPath, projectDir);
  if (!checked || !fs.existsSync(checked)) return '路径不存在或无权访问';
  let re;
  try { re = new RegExp(pattern, 'i'); } catch { return `正则无效: ${pattern}`; }
  const files: any[] = [];
  walkDir(checked, files, { ext: ext && ext.split(',').map(s => '.' + s.trim().replace(/^\./, '')).filter(Boolean) });
  const matches: any[] = [];
  for (const f of files) {
    try {
      const lines = fs.readFileSync(f, 'utf-8').split('\n');
      for (let i = 0; i < lines.length && matches.length < 30; i++) {
        if (re.test(lines[i])) {
          const rel = path.relative(root, f);
          matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
        }
      }
    } catch {}
    if (matches.length >= 30) break;
  }
  return matches.length ? matches.join('\n') : '未找到匹配';
}

async function findFilesTool({ query, path: dirPath, ext }, projectDir) {
  const root = projectRoot(projectDir);
  const fullPath = dirPath ? (path.isAbsolute(dirPath) ? dirPath : path.join(root, dirPath)) : root;
  const checked = safePath(fullPath, projectDir);
  if (!checked || !fs.existsSync(checked)) return '路径不存在或无权访问';
  const files: any[] = [];
  walkDir(checked, files, { ext: ext && ext.split(',').map(s => '.' + s.trim().replace(/^\./, '')).filter(Boolean) });
  const q = (query || '').toLowerCase();
  const hits: any[] = [];
  for (const f of files) {
    if (hits.length >= 50) break;
    const rel = path.relative(root, f);
    if (!q || rel.toLowerCase().includes(q)) hits.push(rel);
  }
  return hits.length ? hits.join('\n') : '未找到匹配文件';
}

async function writeFileTool({ filePath, content }, projectDir) {
  const root = projectRoot(projectDir);
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const checked = safePath(fullPath, projectDir);
  if (!checked) return '无权访问该路径';
  try {
    fs.mkdirSync(path.dirname(checked), { recursive: true });
    fs.writeFileSync(checked, content, 'utf-8');
    return `已写入 ${path.relative(root, checked)} (${content.length} 字符)`;
  } catch (e) {
    return `写入失败: ${e.message}`;
  }
}

async function editFileTool({ filePath, oldString, newString }, projectDir) {
  const root = projectRoot(projectDir);
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const checked = safePath(fullPath, projectDir);
  if (!checked) return '无权访问该路径';
  try {
    const content = fs.readFileSync(checked, 'utf-8');
    const count = content.split(oldString).length - 1;
    if (count === 0) return '未找到要替换的内容';
    if (count > 1) return `找到 ${count} 处匹配，请提供更多上下文以唯一确定替换位置`;
    fs.writeFileSync(checked, content.replace(oldString, newString), 'utf-8');
    return `已编辑 ${path.relative(root, checked)}`;
  } catch (e) {
    return `编辑失败: ${e.message}`;
  }
}

async function bashTool({ command }, projectDir) {
  const root = projectRoot(projectDir);
  try {
    const out = execSync(command, { cwd: root, timeout: 60000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8', windowsHide: true });
    return (out || '(无输出)').slice(0, 20000);
  } catch (e) {
    const stderr = (e.stderr ? e.stderr.toString() : '') || (e.stdout ? e.stdout.toString() : '') || e.message;
    return `命令执行失败 (exit ${e.status !== undefined ? e.status : '?'}):\n${stderr.slice(0, 5000)}`;
  }
}

// ========== 日报工具 ==========

function getChinaDate(offsetDays = 0) {
  const d = new Date();
  const china = new Date(d.getTime() + 8 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return china.toISOString().slice(0, 10);
}

async function queryTodosTool({ status, priority, date_from, date_to, limit }) {
  let sql = 'SELECT * FROM plan_todos WHERE 1=1';
  const p: any[] = [];
  if (status) { sql += ' AND status = ?'; p.push(status); }
  if (priority) { sql += ' AND priority = ?'; p.push(priority); }
  if (date_from) { sql += ' AND (created_at >= ? OR updated_at >= ?)'; p.push(date_from, date_from); }
  if (date_to) { sql += ' AND (created_at <= ? OR updated_at <= ?)'; p.push(date_to, date_to); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  p.push(limit || 30);
  const rows = db.q(sql, ...p);
  return rows.length ? JSON.stringify(rows, null, 2) : '暂无待办数据';
}

async function queryMessagesTool({ date_from, date_to, role, limit }) {
  let sql = "SELECT id, session_id, role, substr(content, 1, 200) as content, created_at FROM prj_messages WHERE 1=1";
  const p: any[] = [];
  if (role) { sql += ' AND role = ?'; p.push(role); }
  if (date_from) { sql += ' AND created_at >= ?'; p.push(date_from); }
  if (date_to) { sql += ' AND created_at <= ?'; p.push(date_to); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  p.push(limit || 20);
  const rows = db.q(sql, ...p);
  return rows.length ? JSON.stringify(rows, null, 2) : '暂无对话数据';
}

async function queryDocumentsTool({ date_from, date_to, limit }) {
  let sql = "SELECT id, path, substr(content, 1, 300) as content, file_mtime FROM kb_documents WHERE 1=1";
  const p: any[] = [];
  if (date_from) { sql += ' AND file_mtime >= ?'; p.push(date_from); }
  if (date_to) { sql += ' AND file_mtime <= ?'; p.push(date_to); }
  sql += " AND path NOT LIKE '%node_modules%' AND path NOT LIKE '%.git%' ORDER BY file_mtime DESC LIMIT ?";
  p.push(limit || 20);
  const rows = db.q(sql, ...p);
  return rows.length ? JSON.stringify(rows, null, 2) : '暂无文档更新';
}

async function queryDataRecordsTool({ dataset_name, date_from, date_to, limit }) {
  let sql = "SELECT r.*, d.name as dataset_name FROM data_center_records r LEFT JOIN data_center_datasets d ON r.dataset_id = d.dataset_id WHERE 1=1";
  const p: any[] = [];
  if (dataset_name) {
    sql += ' AND (d.name LIKE ? OR r.dataset_id IN (SELECT dataset_id FROM data_center_datasets WHERE name LIKE ?))';
    p.push('%' + dataset_name + '%', '%' + dataset_name + '%');
  }
  if (date_from) { sql += ' AND r.created_at >= ?'; p.push(date_from); }
  if (date_to) { sql += ' AND r.created_at <= ?'; p.push(date_to); }
  sql += ' ORDER BY r.created_at DESC LIMIT ?';
  p.push(limit || 20);
  const rows = db.q(sql, ...p);
  return rows.length ? JSON.stringify(rows, null, 2) : '暂无数据中心记录';
}

async function queryRemindersTool() {
  const rows = db.q("SELECT * FROM plan_reminders WHERE enabled = 1 ORDER BY created_at DESC");
  return rows.length ? JSON.stringify(rows, null, 2) : '暂无提醒';
}

async function getTodayInfoTool({}, kbId) {
  const projectName = kbId ? (db.qOne("SELECT name FROM prj_projects WHERE id = ?", kbId) || {}).name || '笔记库' : '笔记库';
  return JSON.stringify({ today: getChinaDate(), yesterday: getChinaDate(-1), weekAgo: getChinaDate(-7), projectId: kbId || null, projectName }, null, 2);
}

// ========== 组装 ==========

let cachedZodSchema: any = null;

const bindNote = (fn, projectId) => (args) => fn({ ...args, projectId });

async function buildNoteToolDefs(projectId) {
  const z = await ensureZ();
  return [
    { name: 'list_notes', description: '列出笔记库中的目录和笔记文件。读取笔记前应先调用本工具确认路径。', schema: z.object({ path: z.string().optional().nullable().describe('相对笔记库根目录的路径，默认根目录') }), func: bindNote(listNotesTool, projectId) },
    { name: 'read_note', description: '读取笔记库中笔记文件的完整内容。若文件不存在会返回相似文件名建议，可据此用 list_notes 确认路径。', schema: z.object({ path: z.string().describe('相对笔记库根目录的文件路径') }), func: bindNote(readNoteTool, projectId) },
    { name: 'write_note', description: '创建或覆盖写入笔记库中的笔记文件（可自动创建子目录，建议以 .md 结尾）。', schema: z.object({ path: z.string().describe('相对笔记库根目录的文件路径'), content: z.string().describe('笔记完整内容（Markdown 格式）') }), func: bindNote(writeNoteTool, projectId) },
    { name: 'edit_note', description: '编辑笔记库中的笔记文件：将 oldString 替换为 newString。', schema: z.object({ path: z.string().describe('相对笔记库根目录的文件路径'), oldString: z.string().describe('被替换的原文（须唯一）'), newString: z.string().describe('替换后的内容') }), func: bindNote(editNoteTool, projectId) },
    { name: 'delete_note', description: '删除笔记库中的笔记文件。', schema: z.object({ path: z.string().describe('相对笔记库根目录的文件路径') }), func: bindNote(deleteNoteTool, projectId) },
  ];
}

async function buildDataToolDefs(projectDir) {
  const z = await ensureZ();
  const bind = (fn) => (args) => fn(args, projectDir);
  return [
    { name: 'query_dataset', description: '查询本地数据集中的记录。数据集用于存储结构化信息，如代办事项、客户信息、项目、Bug等。', schema: z.object({ datasetName: z.string().describe('数据集名称，如 todos, customers, projects, bugs'), conditions: z.string().optional().nullable().describe('查询条件关键字'), limit: z.coerce.number().optional().nullable().describe('返回条数上限，默认20') }), func: (args) => queryDatasetTool(args, projectDir) },
    { name: 'search_knowledge_base', description: '在本地知识库中搜索相关笔记/文档。', schema: z.object({ query: z.string().describe('搜索关键词或问题'), kbName: z.string().optional().nullable().describe('知识库名称（可选）') }), func: (args) => searchKbTool(args, projectDir) },
    { name: 'list_datasets', description: '列出所有可用的数据集及其结构。', schema: z.object({}), func: () => listDatasetsTool() },
    { name: 'list_scheduled_tasks', description: '列出所有已配置的定时任务。', schema: z.object({}), func: () => listScheduledTasksTool() },
    { name: 'read_project_file', description: '读取项目目录下的文件内容。若文件不存在会返回相似文件名建议，可据此用 list_directory 确认准确路径。', schema: z.object({ filePath: z.string().describe('相对于项目根目录的文件路径，或绝对路径') }), func: bind(readProjectFileTool) },
    { name: 'web_search', description: '搜索外网资料，通过搜索引擎获取与查询词相关的网页标题、链接和摘要。适合查询最新资讯、技术文档、百科知识等。', schema: z.object({ query: z.string().describe('搜索关键词，尽量精确'), maxResults: z.coerce.number().optional().nullable().describe('返回结果条数上限，默认8，最大15') }), func: (args) => webSearchTool(args) },
    { name: 'web_fetch', description: '读取外部 URL 的文本内容，自动去除 HTML 标签和脚本，返回纯文本。适合阅读网页文章、API 文档、新闻等。', schema: z.object({ url: z.string().describe('要读取的完整 URL（须以 http:// 或 https:// 开头）'), maxLength: z.coerce.number().optional().nullable().describe('返回内容最大字符数，默认8000，最大50000') }), func: (args) => webFetchTool(args) },
  ];
}

async function buildCodingToolDefs(projectDir) {
  const z = await ensureZ();
  const bind = (fn) => (args) => fn(args, projectDir);
  const base = await buildDataToolDefs(projectDir);
  const coding = [
    { name: 'list_directory', description: '列出目录下的文件和子目录。读取或搜索文件前，若不确定路径应先调用本工具（传 "." 查看根目录）确认目录结构。', schema: z.object({ path: z.string().describe('目录路径，相对项目根目录或绝对路径') }), func: bind(listDirectoryTool) },
    { name: 'grep', description: '在项目文件中按正则表达式搜索文本，返回 文件:行号:内容。', schema: z.object({ pattern: z.string().describe('正则表达式'), path: z.string().optional().nullable().describe('搜索起始目录（可选）'), ext: z.string().optional().nullable().describe('扩展名过滤，逗号分隔，如 js,ts,vue') }), func: bind(grepTool) },
    { name: 'find', description: '按文件名查找项目中的文件。', schema: z.object({ query: z.string().describe('文件名包含的关键字'), path: z.string().optional().nullable().describe('查找起始目录（可选）'), ext: z.string().optional().nullable().describe('扩展名过滤，逗号分隔') }), func: bind(findFilesTool) },
    { name: 'write_file', description: '写入/创建项目文件（可自动创建目录）。', schema: z.object({ filePath: z.string().describe('相对于项目根目录的文件路径'), content: z.string().describe('文件完整内容') }), func: bind(writeFileTool) },
    { name: 'edit_file', description: '编辑项目文件：将 oldString 替换为 newString。', schema: z.object({ filePath: z.string().describe('相对于项目根目录的文件路径'), oldString: z.string().describe('被替换的原文（须唯一）'), newString: z.string().describe('替换后的内容') }), func: bind(editFileTool) },
    { name: 'bash', description: '在项目根目录执行 shell 命令（如 git status, npm test 等）。', schema: z.object({ command: z.string().describe('要执行的 shell 命令') }), func: bind(bashTool) },
  ];
  return projectDir ? [...coding, ...base] : base;
}

async function buildReportToolDefs(kbId) {
  const z = await ensureZ();
  return [
    { name: 'query_todos', description: '查询待办事项（plan_todos），可按状态( done / in_progress / pending )、优先级、日期范围过滤。不传参数则返回最近的待办。', schema: z.object({ status: z.string().optional().nullable().describe('过滤状态: done / in_progress / pending'), priority: z.string().optional().nullable().describe('过滤优先级: high / mid / low'), date_from: z.string().optional().nullable().describe('起始日期 YYYY-MM-DD'), date_to: z.string().optional().nullable().describe('结束日期 YYYY-MM-DD'), limit: z.coerce.number().optional().nullable().describe('返回条数上限，默认30') }), func: queryTodosTool },
    { name: 'query_messages', description: '查询聊天/对话记录（prj_messages）。可过滤日期范围、角色( user / assistant )。', schema: z.object({ date_from: z.string().optional().nullable(), date_to: z.string().optional().nullable(), role: z.string().optional().nullable().describe('角色: user / assistant'), limit: z.coerce.number().optional().nullable().describe('默认20') }), func: queryMessagesTool },
    { name: 'query_documents', description: '查询知识库中文档更新记录（kb_documents）。可过滤日期范围。', schema: z.object({ date_from: z.string().optional().nullable(), date_to: z.string().optional().nullable(), limit: z.coerce.number().optional().nullable().describe('默认20') }), func: queryDocumentsTool },
    { name: 'query_data_records', description: '查询数据中心记录（data_center_records）。可过滤数据集名称、日期范围。', schema: z.object({ dataset_name: z.string().optional().nullable().describe('数据集名称关键词（模糊匹配）'), date_from: z.string().optional().nullable(), date_to: z.string().optional().nullable(), limit: z.coerce.number().optional().nullable().describe('默认20') }), func: queryDataRecordsTool },
    { name: 'query_reminders', description: '查询已启用的提醒事项（plan_reminders）。', schema: z.object({}), func: queryRemindersTool },
    { name: 'get_today_info', description: '获取当前日期信息（今天的中国日期、项目/知识库名称等）。', schema: z.object({}), func: async (args, ctx) => getTodayInfoTool(args, kbId) },
  ];
}

export { buildDataToolDefs, buildCodingToolDefs, buildNoteToolDefs, buildReportToolDefs, getChinaDate };
