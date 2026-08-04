/**
 * 编程任务引擎（融合自 qihang-coding-assistant）
 *
 * 让飞书消息能触发"编程任务"：识别代码项目 → worktree 隔离 → pi agent 在
 * worktree 里执行（可改代码）→ 结果回传。原始项目目录永不被动。
 *
 * 会话按 (项目, 飞书用户) 稳定复用：pi 会话文件提供上下文，worktree 提供隔离执行。
 * worktree 路径由 sessionId 确定性派生，重启后可继续复用。
 */
import * as path from 'path';
import * as os from 'os';
import { WorktreeService } from './worktree';
import { runPi } from './pi-agent';
import { buildCodingToolDefs } from './tools';
import logger from './logger';
import * as appConfig from './app-config';

export interface CodingDeps {
  db: any;
  feishu: any;
  appConfig: any;
}

export interface CodingTaskResult {
  handled: boolean;
  reply?: string;
}

const WORKTREE_BASE = () => path.join(os.homedir(), '.qihang-ai-desktop', 'worktrees');

let worktreeService: WorktreeService | null = null;

export function initCodingTasks(): void {
  worktreeService = new WorktreeService(WORKTREE_BASE());
  logger.info('[CodingTask] worktree base: %s', WORKTREE_BASE());
}

export function getWorktreeService(): WorktreeService | null {
  return worktreeService;
}

// ========== 项目识别 ==========

export function listCodingProjects(db: any): any[] {
  try {
    const projects = db.project.list('code') || [];
    return projects.filter((p: any) => p && p.dir);
  } catch (e: any) {
    logger.warn('[CodingTask] listCodingProjects failed: %s', e?.message);
    return [];
  }
}

/** 从消息中识别代码项目（序号 或 项目名，从长到短匹配） */
export function detectCodingProject(text: string, db: any): any | null {
  const projects = listCodingProjects(db);
  if (!projects.length) return null;

  const numMatch = text.match(/^(\d+)\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10);
    if (idx >= 1 && idx <= projects.length) return projects[idx - 1];
  }

  const sorted = [...projects].sort((a, b) => (b.name || '').length - (a.name || '').length);
  for (const p of sorted) {
    if (p.name && text.includes(p.name)) return p;
  }
  return null;
}

/** 判断是否为编程消息：识别到代码项目、命中编程关键词，或命中编程指令 */
export function isCodingMessage(text: string, db: any): boolean {
  const t = text.trim();
  if (detectCodingProject(text, db)) return true;
  // /code：项目名 任务  或  code：项目名 任务   → 明确编程指令
  if (/^(?:code|\/code)\s*[：:]\s*\S/.test(t)) return true;
  if (/^(列出项目|所有项目|项目列表|可用项目|有哪些项目)$/.test(t)) return true;
  const hasCodingProjects = listCodingProjects(db).length > 0;
  if (hasCodingProjects && /^(切换|切换到|切换项目|使用|用|选择|选定|绑定)/.test(t)) return true;
  return /^(查代码|排查代码|看源码|让pi看|让 pi 看|检查代码|代码排查|看下代码|看看代码)/.test(t);
}

/** 从 /code：项目名 任务 或 code：项目名 任务 中解析项目引用与任务内容 */
function parseCodeDirective(text: string): { projectRef: string; taskText: string } | null {
  const m = text.trim().match(/^(?:code|\/code)\s*[：:]\s*(\S+)\s*(.*)$/);
  if (!m) return null;
  return { projectRef: m[1], taskText: m[2] || '' };
}

function buildProjectListMessage(projects: any[]): string {
  if (!projects.length) return '当前没有可用的代码项目。请先在「设置」中把项目类型设为「代码项目」。';
  const list = projects.map((p, i) => `  ${i + 1}. ${p.name}（${p.dir}）`).join('\n');
  return `可用代码项目：\n${list}\n\n回复"切换到 项目名或序号" 来指定项目，或直接在消息里带上项目名。`;
}

// ========== 任务执行 ==========

/** worktree 任务上下文：路径确定性派生（baseDir/项目id/sessionId），重启可复用 */
function taskRuntime(sessionId: string, project: any, text: string) {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
  const shortId = (hash >>> 0).toString(36);
  return {
    id: sessionId,
    title: text.slice(0, 40),
    workspacePath: path.join(WORKTREE_BASE(), String(project.id), sessionId),
    branchName: `agent-task/${shortId}`,
  };
}

async function ensureWorkspace(runtime: any, project: any): Promise<{ path: string; isolated: boolean }> {
  if (!worktreeService) throw new Error('Coding task service not initialized');
  const ws = await worktreeService.ensureWorkspace(runtime, { id: String(project.id), path: project.dir });
  return { path: ws.path, isolated: ws.isolated };
}

/**
 * 处理一条飞书编程消息（独立任务模型，但同一用户同一项目的 pi 会话会续接上下文）
 */
export async function handleFeishuCodingMessage(
  msg: { text: string; sender: string; chatId: string; chatType: string; messageId: string },
  deps: CodingDeps,
): Promise<CodingTaskResult> {
  const { db, feishu } = deps;
  const text = msg.text.trim();
  const projects = listCodingProjects(db);

  // 特殊指令：列出项目
  if (/^(列出项目|所有项目|项目列表|可用项目)$/.test(text)) {
    await feishu.replyMessage(msg, buildProjectListMessage(projects));
    return { handled: true };
  }

  // 切换项目指令
  const switchMatch = text.match(/^(?:切换到?|切换项目|切换|使用|用|选择|选定)\s+(.+)/);
  if (switchMatch) {
    const target = switchMatch[1].trim();
    const num = parseInt(target, 10);
    const project = !isNaN(num)
      ? (num >= 1 && num <= projects.length ? projects[num - 1] : null)
      : projects.find((p: any) => p.name && (p.name.includes(target) || target.includes(p.name)));
    if (project) {
      appConfig.saveConfig({ ['feishu_bind_' + msg.sender]: String(project.id) });
      await feishu.replyMessage(msg, `✅ 已切换到代码项目：**${project.name}**\n你可以直接提问了。`);
    } else {
      await feishu.replyMessage(msg, `未找到项目"${target}"\n${buildProjectListMessage(projects)}`);
    }
    return { handled: true };
  }

  // 识别当前项目：指令引用 > 已绑定 > 消息内识别
  const directive = parseCodeDirective(text);
  let project: any = null;
  let cleanText = text;
  if (directive) {
    const ref = directive.projectRef;
    const num = parseInt(ref, 10);
    project = !isNaN(num)
      ? (num >= 1 && num <= projects.length ? projects[num - 1] : null)
      : projects.find((p: any) => p.name && (p.name.includes(ref) || ref.includes(p.name)));
    if (!project) {
      await feishu.replyMessage(msg, `未找到项目"${ref}"\n${buildProjectListMessage(projects)}`);
      return { handled: true };
    }
    cleanText = directive.taskText;
  } else {
    const boundId = appConfig.getConfig('feishu_bind_' + msg.sender);
    if (boundId) {
      const found = projects.find((p: any) => String(p.id) === boundId);
      if (found) project = found;
    }
    if (!project) project = detectCodingProject(text, db);
    if (!project) {
      await feishu.replyMessage(msg, buildProjectListMessage(projects));
      return { handled: true };
    }
    cleanText = text.replace(project.name || '', '').trim() || text;
  }
  if (!cleanText) {
    await feishu.replyMessage(msg, `请在 **${project.name}** 后面跟上要处理的任务，例如：\n\`/code：${project.name} 修复登录超时\``);
    return { handled: true };
  }
  await feishu.replyMessage(msg, `🔧 正在项目 **${project.name}** 中处理，请稍后...`);

  // 先落任务记录，再按任务 id 创建独立 session
  const { taskId, execId } = recordFeishuTask(db, project, cleanText, '', 'coding');
  const sessionId = 'task_' + taskId;
  if (taskId != null) db.task.update(taskId, { session_id: sessionId });
  db.chat.createSession(sessionId, project.id, cleanText.slice(0, 30), 'coding', 'pi', 'feishu');
  db.chat.addMessage(sessionId, 'user', cleanText, 'general');

  try {
    const runtime = taskRuntime(sessionId, project, cleanText);
    const ws = await ensureWorkspace(runtime, project);

    let reply = '';
    const prompt = ws.isolated
      ? `以下代码项目已为你准备了隔离工作目录（基于最新远端代码）：
项目名称：${project.name}
工作目录：${ws.path}

请在该目录下处理任务：${cleanText}
提示：如果任务需要修改代码，直接在工作目录中修改；完成后简要说明改动了哪些文件。`
      : `请在项目 ${project.name}（${project.dir}）中处理任务：${cleanText}`;

    await runPi({
      prompt,
      sessionId,
      cwd: ws.path,
      customTools: await buildCodingToolDefs(ws.path),
      onDelta: (delta) => { reply += delta; },
      onTool: (toolEvent) => {
        logger.info('[CodingTask] tool %s %s', toolEvent.name, toolEvent.type);
      },
      onDone: (finalText) => {
        if (finalText) reply = finalText;
        db.chat.addMessage(sessionId, 'assistant', reply, 'general');
        if (execId != null) {
          db.taskExecution.update(execId, { status: 'SUCCESS', end_time: nowString(), result_text: reply });
        }
        if (taskId != null) {
          db.task.update(taskId, { last_result: reply.slice(0, 3000), last_status: 'SUCCESS', last_run_at: nowString(), status: 'done' });
        }
        notifyTaskChanged();
      },
      onError: (err) => {
        db.chat.addMessage(sessionId, 'assistant', `❌ ${err}`, 'general');
        if (execId != null) {
          db.taskExecution.update(execId, { status: 'FAILED', end_time: nowString(), error_message: String(err) });
        }
        if (taskId != null) {
          db.task.update(taskId, { last_status: 'FAILED', last_run_at: nowString(), status: 'pending' });
        }
        notifyTaskChanged();
      },
    });

    const footer = ws.isolated
      ? `\n\n— 本任务在隔离 worktree 中执行（未改动你的原目录）。若 Agent 修改了代码，可到工作台「编程」页审查并合并。`
      : `\n\n— 该目录非 git 项目，直接在原目录中执行。`;
    return { handled: true, reply: (reply || '✅ 处理完成。') + footer };
  } catch (e: any) {
    logger.error('[CodingTask] execution failed: %s', e?.message);
    if (execId != null) {
      db.taskExecution.update(execId, { status: 'FAILED', end_time: nowString(), error_message: (e && e.message) || String(e) });
    }
    if (taskId != null) {
      db.task.update(taskId, { last_status: 'FAILED', last_run_at: nowString(), status: 'pending' });
      notifyTaskChanged();
    }
    return { handled: true, reply: `❌ 处理出错: ${e?.message}` };
  }
}

function nowString(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function notifyTaskChanged() {
  try {
    const { BrowserWindow } = require('electron') as typeof import('electron');
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('task:changed');
    }
  } catch {}
}

/** 创建任务记录（挂到项目下），返回 { 任务id, 执行记录id } */
export function recordFeishuTask(db: any, project: any, text: string, sessionId?: string, taskType = 'coding'): { taskId: number | null; execId: number | null } {
  try {
    const r = db.task.add({
      title: text.slice(0, 100),
      prompt: text,
      task_type: taskType,
      project_id: project && project.id && Number.isFinite(Number(project.id)) ? Number(project.id) : null,
      source: 'feishu',
      trigger_type: 'now',
      status: 'in_progress',
      session_id: sessionId || '',
    });
    const execId = db.taskExecution.add({
      task_id: r.id, task_title: r.title, status: 'RUNNING',
      trigger_type: 'manual', start_time: nowString(),
    });
    notifyTaskChanged();
    return { taskId: r.id, execId };
  } catch (e) {
    logger.error('[CodingTask] record task failed: %s', e.message);
    return { taskId: null, execId: null };
  }
}

// ========== 任务追问（复用原 session，流式回传） ==========

function emitFollowup(type: string, payload: any) {
  try {
    const { BrowserWindow } = require('electron') as typeof import('electron');
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('task:followup:' + type, payload);
    }
  } catch {}
}

/**
 * 任务追问：复用任务的原始会话继续对话（coding → worktree 中继续；note → 笔记库中继续）。
 * 结果以 task:followup:delta / done / error 事件流式回传。
 */
export async function followUpTask(taskId: number, question: string, db: any): Promise<boolean> {
  const task = db.task.get(taskId);
  if (!task) return false;
  if (task.status === 'in_progress') return false;
  const project: any = task.project_id && Number.isFinite(Number(task.project_id)) ? db.project.get(Number(task.project_id)) : null;

  let sessionId = task.session_id || '';
  if (!sessionId) {
    sessionId = 'task_' + taskId;
    db.chat.createSession(sessionId, project ? project.id : null, (task.title || '').slice(0, 30), task.task_type === 'coding' ? 'coding' : 'kb', 'pi', 'ui');
    db.task.update(taskId, { session_id: sessionId });
  }
  db.chat.addMessage(sessionId, 'user', question, 'general');
  db.task.update(taskId, { status: 'in_progress' });
  const execId = db.taskExecution.add({
    task_id: taskId, task_title: task.title, status: 'RUNNING',
    trigger_type: 'followup', start_time: nowString(),
  });
  notifyTaskChanged();

  const finish = (status: string, extra: { error?: string; result?: string } = {}) => {
    const end = nowString();
    if (execId != null) db.taskExecution.update(execId, { status, end_time: end, ...(extra.error ? { error_message: extra.error } : {}), ...(extra.result ? { result_text: extra.result } : {}) });
    db.task.update(taskId, {
      last_status: status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      last_run_at: end,
      status: status === 'SUCCESS' ? 'done' : 'pending',
      ...(extra.result ? { last_result: extra.result.slice(0, 3000) } : {}),
    });
    notifyTaskChanged();
  };

  (async () => {
    try {
      const { buildReportToolDefs, buildDataToolDefs, buildNoteToolDefs, buildCodingToolDefs } = require('./tools');
      const customTools: any[] = [];
      let cwd = '';
      let prompt = '';

      if (task.task_type === 'coding' && project && project.dir) {
        const runtime = taskRuntime(sessionId, project, task.prompt || task.title || 'coding task');
        const ws = await ensureWorkspace(runtime, project);
        cwd = ws.path;
        customTools.push(...(await buildReportToolDefs(undefined)));
        customTools.push(...(await buildCodingToolDefs(ws.path)));
        prompt = `以下是代码项目 ${project.name} 的任务「${task.title}」的后续工作，项目工作目录：${ws.path}（若需修改代码，直接在此目录修改）。
原始任务：${task.prompt || ''}
用户追问：${question}
请继续完成，直接输出结果。`;
      } else {
        const notesDir = appConfig.getConfig('notesDir') || (project ? project.dir : '') || '';
        cwd = notesDir;
        customTools.push(...(await buildReportToolDefs(undefined)));
        if (notesDir) customTools.push(...(await buildDataToolDefs(notesDir)));
        const noteProj: any = project || db.qOne("SELECT * FROM prj_projects WHERE type = 'note' ORDER BY is_default DESC, id ASC LIMIT 1");
        if (noteProj) customTools.push(...(await buildNoteToolDefs(noteProj.id)));
        prompt = `以下是笔记库目录，请用 grep/find 等工具自行搜索相关文件后回答：\n笔记库路径：${notesDir || '（未配置）'}\n\n原始任务：${task.prompt || task.title || ''}\n用户追问：${question}`;
      }

      let reply = '';
      await runPi({
        prompt,
        sessionId,
        cwd: cwd || undefined,
        customTools,
        onDelta: (delta) => {
          reply += delta;
          emitFollowup('delta', { taskId, delta });
        },
        onTool: (t: any) => logger.info('[Followup] tool %s %s', t.name, t.type),
        onDone: (finalText) => {
          if (finalText) reply = finalText;
          db.chat.addMessage(sessionId, 'assistant', reply, 'general');
          finish('SUCCESS', { result: reply });
          emitFollowup('done', { taskId, text: reply });
        },
        onError: (err) => {
          db.chat.addMessage(sessionId, 'assistant', `❌ ${err}`, 'general');
          finish('FAILED', { error: String(err) });
          emitFollowup('error', { taskId, error: String(err) });
        },
      });
    } catch (e: any) {
      logger.error('[Followup] execution failed: %s', e?.message);
      finish('FAILED', { error: (e && e.message) || String(e) });
      emitFollowup('error', { taskId, error: (e && e.message) || String(e) });
    }
  })();

  return true;
}

// ========== 变更审查（供「编程」页 IPC） ==========

/** 从会话/项目解析任务运行时（确定性路径派生，跨重启复用） */
export function resolveTaskRuntime(sessionId: string, project: any): any {
  const text = project.description || project.name || 'coding task';
  return taskRuntime(sessionId, project, text);
}

/** 收集某个编程会话在 worktree 中的变更集 */
export async function collectSessionChanges(
  sessionId: string,
  project: { id: string; path: string; dir?: string },
): Promise<import('./worktree').TaskChangeSet> {
  if (!worktreeService) throw new Error('Coding task service not initialized');
  const runtime = resolveTaskRuntime(sessionId, project);
  return worktreeService.collectChanges(runtime, { path: project.path || project.dir || '' });
}

/** 把 worktree 变更合入主项目（staged，待提交） */
export async function applySessionChanges(
  sessionId: string,
  project: { id: string; path: string; dir?: string },
): Promise<{ sourceBranch: string; targetBranch: string; commitHash: string; changedFiles: string[] }> {
  if (!worktreeService) throw new Error('Coding task service not initialized');
  const runtime = resolveTaskRuntime(sessionId, project);
  return worktreeService.applyChanges(runtime, { path: project.path || project.dir || '' });
}

/** 提交已合入的变更（可选推送远端） */
export async function commitSessionChanges(
  sessionId: string,
  project: { id: string; path: string; dir?: string },
  message?: string,
  push = false,
): Promise<{ commit: string; branch: string | null; pushed: boolean }> {
  if (!worktreeService) throw new Error('Coding task service not initialized');
  const runtime = resolveTaskRuntime(sessionId, project);
  return worktreeService.commitAppliedChanges(runtime, { path: project.path || project.dir || '' }, message, push);
}

/** 撤销主项目中的 pending 合并 */
export async function abortSessionChanges(
  sessionId: string,
  project: { id: string; path: string; dir?: string },
): Promise<{ sourceBranch: string; targetBranch: string; sourceCommit: string }> {
  if (!worktreeService) throw new Error('Coding task service not initialized');
  const runtime = resolveTaskRuntime(sessionId, project);
  return worktreeService.abortAppliedChanges(runtime, { path: project.path || project.dir || '' });
}

/** 丢弃 worktree 中的全部改动 */
export async function discardSessionChanges(
  sessionId: string,
  project: { id: string; path: string; dir?: string },
): Promise<{ targetHead: string; discardedFiles: string[]; discardedCommits: number }> {
  if (!worktreeService) throw new Error('Coding task service not initialized');
  const runtime = resolveTaskRuntime(sessionId, project);
  return worktreeService.discardChanges(runtime, { path: project.path || project.dir || '' });
}

/** 找出某项目最近的编程会话 */
export function latestCodingSessions(db: any, limit = 10): any[] {
  return db.q(
    `SELECT s.*, p.name as project_name, p.dir as project_dir
     FROM prj_sessions s LEFT JOIN prj_projects p ON s.project_id = p.id
     WHERE s.mode = 'coding' ORDER BY s.updated_at DESC LIMIT ?`,
    limit,
  );
}
