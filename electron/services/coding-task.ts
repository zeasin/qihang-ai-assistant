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

function sessionIdFor(project: any, sender: string): string {
  return `coding_feishu_${project.id}_${sender.slice(-12)}`;
}

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

  const sessionId = sessionIdFor(project, msg.sender);
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
      },
      onError: (err) => {
        db.chat.addMessage(sessionId, 'assistant', `❌ ${err}`, 'general');
      },
    });

    const footer = ws.isolated
      ? `\n\n— 本任务在隔离 worktree 中执行（未改动你的原目录）。若 Agent 修改了代码，可到工作台「编程」页审查并合并。`
      : `\n\n— 该目录非 git 项目，直接在原目录中执行。`;
    return { handled: true, reply: (reply || '✅ 处理完成。') + footer };
  } catch (e: any) {
    logger.error('[CodingTask] execution failed: %s', e?.message);
    return { handled: true, reply: `❌ 处理出错: ${e?.message}` };
  }
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
