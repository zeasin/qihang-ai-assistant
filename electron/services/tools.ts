import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import * as db from './database';
import logger from './logger';

// typebox 是 ESM-only 包，而本文件编译为 CJS，用 Function 构造器保留运行时真正的动态 import()
let cachedType: any = null;
async function ensureT() {
  if (!cachedType) cachedType = await new Function('spec', 'return import(spec)')('typebox');
  return cachedType;
}

// LLM 可能传数字或字符串，统一转换为数字
const toNumber = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

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

async function listDatasetsTool() {
  const all = db.ds.list();
  return all.length ? all.map(d => `- ${d.name} (${d.id}): ${d.schema_json}`).join('\n') : '暂无数据集';
}

function resolveDataset(datasetName) {
  const all = db.ds.list();
  return all.find(d => d.name === datasetName || d.id === datasetName) || null;
}

function parseJsonArg(raw, label) {
  try { return JSON.parse(raw); } catch { return { error: `${label} 不是合法 JSON 对象` }; }
}

async function createDatasetTool({ name, description, schemaJson }) {
  if (!name || !name.trim()) return '请提供数据集名称（name）';
  db.ds.add({ name: name.trim(), description: description || '', schemaJson: schemaJson || '{}' });
  const ds = resolveDataset(name.trim());
  return `已创建数据集 "${name.trim()}" (id: ${ds ? ds.id : '?'})。可用 insert_dataset_record 写入记录。`;
}

async function insertDatasetRecordTool({ datasetName, data }) {
  const ds = resolveDataset(datasetName);
  if (!ds) {
    const names = db.ds.list().map(d => d.name).join(', ');
    return `数据集 "${datasetName}" 不存在。可用数据集: ${names || '无'}。`;
  }
  const obj = parseJsonArg(data, 'data');
  if (obj.error) return obj.error;
  db.ds.insert(ds.id, obj);
  const r = db.qOne("SELECT id FROM data_center_records WHERE dataset_id = ? ORDER BY id DESC LIMIT 1", ds.id);
  logger.info('[Tools] insert_dataset_record: %s → id %s', datasetName, r ? r.id : '?');
  return `已向数据集 "${ds.name}" 插入一条记录 (id: ${r ? r.id : '?'})`;
}

async function updateDatasetRecordTool({ id, data }) {
  const exists = db.qOne("SELECT id FROM data_center_records WHERE id = ?", id);
  if (!exists) return `记录 id=${id} 不存在。可先用 query_dataset 查询记录 id。`;
  const obj = parseJsonArg(data, 'data');
  if (obj.error) return obj.error;
  db.ds.updateRecord(id, obj);
  return `已更新数据集记录 id=${id}`;
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

async function addTodoTool({ title, description, priority, due_date, status }) {
  if (!title || !title.trim()) return '请提供待办标题（title）';
  const r = db.todo.add({
    title: title.trim(),
    description: description || '',
    priority: priority || 'mid',
    due_date: due_date || '',
    status: status || 'pending',
  });
  logger.info('[Tools] add_todo: %s → id %s', title, r.id);
  return `已创建待办 "${title}" (id: ${r.id}, 优先级: ${priority || 'mid'}, 状态: ${status || 'pending'})`;
}

async function updateTodoTool({ id, title, description, priority, due_date, status }) {
  const exists = db.todo.get(id);
  if (!exists) return `待办 id=${id} 不存在。可先用 query_todos 查询待办 id。`;
  const patch: any = {};
  if (title !== undefined && title !== null) patch.title = title;
  if (description !== undefined && description !== null) patch.description = description;
  if (priority !== undefined && priority !== null) patch.priority = priority;
  if (due_date !== undefined && due_date !== null) patch.due_date = due_date;
  if (status !== undefined && status !== null) patch.status = status;
  if (!Object.keys(patch).length) return '没有需要更新的字段';
  db.todo.update(id, patch);
  return `已更新待办 id=${id}：${Object.keys(patch).join(', ')}`;
}

async function addReminderTool({ name, message, type, time, day_of_week, day_of_month, date }) {
  if (!name || !name.trim()) return '请提供提醒名称（name）';
  const r = db.reminder.add({
    name: name.trim(),
    message: message || '',
    type: type || 'daily',
    time: time || '09:00',
    day_of_week: day_of_week || 0,
    day_of_month: day_of_month || 1,
    date: date || '',
  });
  logger.info('[Tools] add_reminder: %s → id %s', name, r.id);
  return `已创建提醒 "${name}" (id: ${r.id}, 类型: ${type || 'daily'}, 时间: ${time || '09:00'})`;
}

async function updateReminderTool({ id, name, message, time, enabled, type, day_of_week, day_of_month, date }) {
  const exists = db.reminder.get(id);
  if (!exists) return `提醒 id=${id} 不存在。可先用 query_reminders 查询提醒 id。`;
  const patch: any = {};
  if (name !== undefined && name !== null) patch.name = name;
  if (message !== undefined && message !== null) patch.message = message;
  if (time !== undefined && time !== null) patch.time = time;
  if (enabled !== undefined && enabled !== null) patch.enabled = enabled === 'true' || enabled === true;
  if (type !== undefined && type !== null) patch.type = type;
  if (day_of_week !== undefined && day_of_week !== null) patch.day_of_week = Number(day_of_week);
  if (day_of_month !== undefined && day_of_month !== null) patch.day_of_month = Number(day_of_month);
  if (date !== undefined && date !== null) patch.date = date;
  if (!Object.keys(patch).length) return '没有需要更新的字段';
  db.reminder.update(id, patch);
  return `已更新提醒 id=${id}：${Object.keys(patch).join(', ')}`;
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
// 输出格式与 pi SDK 的 ToolDefinition 兼容：{ name, label, description, parameters, execute }
// execute 返回 AgentToolResult：{ content: [{ type: 'text', text }], details: {} }

const bindNote = (fn, projectId) => (args) => fn({ ...args, projectId });

const exec = (fn) => async (_toolCallId, params) => ({
  content: [{ type: 'text', text: String(await fn(params) ?? '') }],
  details: {},
});

async function buildNoteToolDefs(projectId) {
  const { Type } = await ensureT();
  const optStr = (description?: string) => Type.Optional(Type.Union([Type.String({ description }), Type.Null()]));
  const wrap = (fn) => exec(bindNote(fn, projectId));
  return [
    { name: 'list_notes', label: 'list_notes', description: '列出笔记库中的目录和笔记文件。读取笔记前应先调用本工具确认路径。', parameters: Type.Object({ path: optStr('相对笔记库根目录的路径，默认根目录') }), execute: wrap(listNotesTool) },
    { name: 'read_note', label: 'read_note', description: '读取笔记库中笔记文件的完整内容。若文件不存在会返回相似文件名建议，可据此用 list_notes 确认路径。', parameters: Type.Object({ path: Type.String({ description: '相对笔记库根目录的文件路径' }) }), execute: wrap(readNoteTool) },
    { name: 'write_note', label: 'write_note', description: '创建或覆盖写入笔记库中的笔记文件（可自动创建子目录，建议以 .md 结尾）。', parameters: Type.Object({ path: Type.String({ description: '相对笔记库根目录的文件路径' }), content: Type.String({ description: '笔记完整内容（Markdown 格式）' }) }), execute: wrap(writeNoteTool) },
    { name: 'edit_note', label: 'edit_note', description: '编辑笔记库中的笔记文件：将 oldString 替换为 newString。', parameters: Type.Object({ path: Type.String({ description: '相对笔记库根目录的文件路径' }), oldString: Type.String({ description: '被替换的原文（须唯一）' }), newString: Type.String({ description: '替换后的内容' }) }), execute: wrap(editNoteTool) },
    { name: 'delete_note', label: 'delete_note', description: '删除笔记库中的笔记文件。', parameters: Type.Object({ path: Type.String({ description: '相对笔记库根目录的文件路径' }) }), execute: wrap(deleteNoteTool) },
  ];
}

async function buildDataToolDefs(projectDir, opts: { noWeb?: boolean } = {}) {
  const { Type } = await ensureT();
  const optStr = (description?: string) => Type.Optional(Type.Union([Type.String({ description }), Type.Null()]));
  const optNum = (description?: string) => Type.Optional(Type.Union([Type.Number({ description }), Type.String(), Type.Null()]));
  const bind = (fn) => (args) => fn(args, projectDir);
  const defs = [
    { name: 'query_dataset', label: 'query_dataset', description: '查询本地数据集中的记录。数据集用于存储结构化信息，如代办事项、客户信息、项目、Bug等。', parameters: Type.Object({ datasetName: Type.String({ description: '数据集名称，如 todos, customers, projects, bugs' }), conditions: optStr('查询条件关键字'), limit: optNum('返回条数上限，默认20') }), execute: exec((args) => queryDatasetTool({ ...args, limit: toNumber(args.limit, 20) }, projectDir)) },
    { name: 'list_datasets', label: 'list_datasets', description: '列出所有可用的数据集及其结构。', parameters: Type.Object({}), execute: exec(() => listDatasetsTool()) },
    { name: 'create_dataset', label: 'create_dataset', description: '创建一个新的数据集，用于存储结构化信息（如待办、客户、项目、Bug 等）。创建后可用 insert_dataset_record 写入记录。', parameters: Type.Object({ name: Type.String({ description: '数据集名称，如 todos, customers' }), description: Type.Optional(Type.String({ description: '数据集说明' })), schemaJson: Type.Optional(Type.String({ description: '可选的 Schema JSON 字符串，如 {"fields":[{"name":"title"}]}' })) }), execute: exec(createDatasetTool) },
    { name: 'insert_dataset_record', label: 'insert_dataset_record', description: '向数据集插入一条记录。data 参数为 JSON 对象字符串，字段须与数据集 schema 匹配。', parameters: Type.Object({ datasetName: Type.String({ description: '数据集名称或 id' }), data: Type.String({ description: '记录内容 JSON 对象，如 {"title":"季度总结","status":"进行中"}' }) }), execute: exec(insertDatasetRecordTool) },
    { name: 'update_dataset_record', label: 'update_dataset_record', description: '更新数据集中的一条记录（整体替换 data_json）。先调用 query_dataset 获取记录 id。', parameters: Type.Object({ id: Type.Number({ description: '记录 id（query_dataset 返回结果中的 id 字段）' }), data: Type.String({ description: '更新后的完整记录 JSON 对象' }) }), execute: exec(updateDatasetRecordTool) },
    { name: 'read_project_file', label: 'read_project_file', description: '读取项目目录下的文件内容。若文件不存在会返回相似文件名建议，可据此用 list_directory 确认准确路径。', parameters: Type.Object({ filePath: Type.String({ description: '相对于项目根目录的文件路径，或绝对路径' }) }), execute: exec(bind(readProjectFileTool)) },
    { name: 'web_search', label: 'web_search', description: '搜索外网资料，通过搜索引擎获取与查询词相关的网页标题、链接和摘要。适合查询最新资讯、技术文档、百科知识等。', parameters: Type.Object({ query: Type.String({ description: '搜索关键词，尽量精确' }), maxResults: optNum('返回结果条数上限，默认8，最大15') }), execute: exec((args) => webSearchTool({ ...args, maxResults: toNumber(args.maxResults, 8) })) },
    { name: 'web_fetch', label: 'web_fetch', description: '读取外部 URL 的文本内容，自动去除 HTML 标签和脚本，返回纯文本。适合阅读网页文章、API 文档、新闻等。', parameters: Type.Object({ url: Type.String({ description: '要读取的完整 URL（须以 http:// 或 https:// 开头）' }), maxLength: optNum('返回内容最大字符数，默认8000，最大50000') }), execute: exec((args) => webFetchTool({ ...args, maxLength: toNumber(args.maxLength, 8000) })) },
  ];
  return opts.noWeb ? defs.filter(d => d.name !== 'web_search' && d.name !== 'web_fetch') : defs;
}

async function buildCodingToolDefs(projectDir) {
  const { Type } = await ensureT();
  const optStr = (description?: string) => Type.Optional(Type.Union([Type.String({ description }), Type.Null()]));
  const bind = (fn) => (args) => fn(args, projectDir);
  const base = await buildDataToolDefs(projectDir);
  const coding = [
    { name: 'list_directory', label: 'list_directory', description: '列出目录下的文件和子目录。读取或搜索文件前，若不确定路径应先调用本工具（传 "." 查看根目录）确认目录结构。', parameters: Type.Object({ path: Type.String({ description: '目录路径，相对项目根目录或绝对路径' }) }), execute: exec(bind(listDirectoryTool)) },
    { name: 'grep', label: 'grep', description: '在项目文件中按正则表达式搜索文本，返回 文件:行号:内容。', parameters: Type.Object({ pattern: Type.String({ description: '正则表达式' }), path: optStr('搜索起始目录（可选）'), ext: optStr('扩展名过滤，逗号分隔，如 js,ts,vue') }), execute: exec(bind(grepTool)) },
    { name: 'find', label: 'find', description: '按文件名查找项目中的文件。', parameters: Type.Object({ query: Type.String({ description: '文件名包含的关键字' }), path: optStr('查找起始目录（可选）'), ext: optStr('扩展名过滤，逗号分隔') }), execute: exec(bind(findFilesTool)) },
    { name: 'write_file', label: 'write_file', description: '写入/创建项目文件（可自动创建目录）。', parameters: Type.Object({ filePath: Type.String({ description: '相对于项目根目录的文件路径' }), content: Type.String({ description: '文件完整内容' }) }), execute: exec(bind(writeFileTool)) },
    { name: 'edit_file', label: 'edit_file', description: '编辑项目文件：将 oldString 替换为 newString。', parameters: Type.Object({ filePath: Type.String({ description: '相对于项目根目录的文件路径' }), oldString: Type.String({ description: '被替换的原文（须唯一）' }), newString: Type.String({ description: '替换后的内容' }) }), execute: exec(bind(editFileTool)) },
    { name: 'bash', label: 'bash', description: '在项目根目录执行 shell 命令（如 git status, npm test 等）。', parameters: Type.Object({ command: Type.String({ description: '要执行的 shell 命令' }) }), execute: exec(bind(bashTool)) },
  ];
  return projectDir ? [...coding, ...base] : base;
}

async function buildReportToolDefs(kbId) {
  const { Type } = await ensureT();
  const optStr = (description?: string) => Type.Optional(Type.Union([Type.String({ description }), Type.Null()]));
  const optNum = (description?: string) => Type.Optional(Type.Union([Type.Number({ description }), Type.String(), Type.Null()]));
  return [
    { name: 'query_todos', label: 'query_todos', description: '查询待办事项（plan_todos），可按状态( done / in_progress / pending )、优先级、日期范围过滤。不传参数则返回最近的待办。', parameters: Type.Object({ status: optStr('过滤状态: done / in_progress / pending'), priority: optStr('过滤优先级: high / mid / low'), date_from: optStr('起始日期 YYYY-MM-DD'), date_to: optStr('结束日期 YYYY-MM-DD'), limit: optNum('返回条数上限，默认30') }), execute: exec((args) => queryTodosTool({ ...args, limit: toNumber(args.limit, 30) })) },
    { name: 'add_todo', label: 'add_todo', description: '创建一条待办事项。AI 从对话中识别出用户要执行的事项时应调用本工具落成待办。', parameters: Type.Object({ title: Type.String({ description: '待办标题' }), description: optStr('详细说明'), priority: optStr('优先级: high / mid / low，默认 mid'), due_date: optStr('截止日期 YYYY-MM-DD，可选'), status: optStr('状态: pending / in_progress / done，默认 pending') }), execute: exec(addTodoTool) },
    { name: 'update_todo', label: 'update_todo', description: '更新待办事项（标题、描述、优先级、截止日期、状态）。先调用 query_todos 获取待办 id。', parameters: Type.Object({ id: Type.Number({ description: '待办 id' }), title: optStr('新标题'), description: optStr('新描述'), priority: optStr('优先级: high / mid / low'), due_date: optStr('截止日期 YYYY-MM-DD'), status: optStr('状态: pending / in_progress / done') }), execute: exec(updateTodoTool) },
    { name: 'query_messages', label: 'query_messages', description: '查询聊天/对话记录（prj_messages）。可过滤日期范围、角色( user / assistant )。', parameters: Type.Object({ date_from: optStr('起始日期 YYYY-MM-DD'), date_to: optStr('结束日期 YYYY-MM-DD'), role: optStr('角色: user / assistant'), limit: optNum('返回条数上限，默认20') }), execute: exec((args) => queryMessagesTool({ ...args, limit: toNumber(args.limit, 20) })) },
    { name: 'query_documents', label: 'query_documents', description: '查询知识库中文档更新记录（kb_documents）。可过滤日期范围。', parameters: Type.Object({ date_from: optStr('起始日期 YYYY-MM-DD'), date_to: optStr('结束日期 YYYY-MM-DD'), limit: optNum('返回条数上限，默认20') }), execute: exec((args) => queryDocumentsTool({ ...args, limit: toNumber(args.limit, 20) })) },
    { name: 'query_data_records', label: 'query_data_records', description: '查询数据中心记录（data_center_records）。可过滤数据集名称、日期范围。', parameters: Type.Object({ dataset_name: optStr('数据集名称关键词（模糊匹配）'), date_from: optStr('起始日期 YYYY-MM-DD'), date_to: optStr('结束日期 YYYY-MM-DD'), limit: optNum('返回条数上限，默认20') }), execute: exec((args) => queryDataRecordsTool({ ...args, limit: toNumber(args.limit, 20) })) },
    { name: 'query_reminders', label: 'query_reminders', description: '查询已启用的提醒事项（plan_reminders）。', parameters: Type.Object({}), execute: exec(() => queryRemindersTool()) },
    { name: 'add_reminder', label: 'add_reminder', description: '创建一条定时提醒。类型: daily(每天)/weekly(每周，需 day_of_week 0=周日)/monthly(每月，需 day_of_month)/once(一次性，需 date YYYY-MM-DD)。', parameters: Type.Object({ name: Type.String({ description: '提醒名称，如 "喝水"' }), message: optStr('提醒内容'), type: optStr('类型: daily / weekly / monthly / once，默认 daily'), time: optStr('时间 HH:MM，默认 09:00'), day_of_week: optNum('weekly 用: 0-6，0=周日'), day_of_month: optNum('monthly 用: 1-31'), date: optStr('once 用: 日期 YYYY-MM-DD') }), execute: exec(addReminderTool) },
    { name: 'update_reminder', label: 'update_reminder', description: '更新提醒（名称、内容、时间、启用状态等）。先调用 query_reminders 获取提醒 id。', parameters: Type.Object({ id: Type.String({ description: '提醒 id（如 R1712345678901）' }), name: optStr('新名称'), message: optStr('新内容'), time: optStr('时间 HH:MM'), enabled: optStr('是否启用: true / false'), type: optStr('类型: daily / weekly / monthly / once'), day_of_week: optNum('weekly 用: 0-6'), day_of_month: optNum('monthly 用: 1-31'), date: optStr('once 用: YYYY-MM-DD') }), execute: exec(updateReminderTool) },
    { name: 'get_today_info', label: 'get_today_info', description: '获取当前日期信息（今天的中国日期、项目/知识库名称等）。', parameters: Type.Object({}), execute: exec((args) => getTodayInfoTool(args, kbId)) },
  ];
}

export { buildDataToolDefs, buildCodingToolDefs, buildNoteToolDefs, buildReportToolDefs, getChinaDate };
