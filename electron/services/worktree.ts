/**
 * Git worktree 隔离执行服务
 *
 * 从 qihang-coding-assistant 移植（CJS 化 + 精简类型依赖）。
 * 用途：让 AI 编程任务在独立 worktree 里改代码（基于 fetch 后的最新远端代码），
 * 不碰你的原始项目目录；改动审阅通过后才合并回主分支。
 *
 * 非 git 项目自动降级为直接操作项目目录（isolated=false）。
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import logger from './logger';

/** 任务执行上下文（WorktreeService 只用这 4 个字段） */
export interface TaskRuntime {
  id: string;
  title: string;
  workspacePath: string | null;
  branchName: string | null;
}

export interface TaskWorkspace {
  path: string;
  branchName: string | null;
  isolated: boolean;
}

export interface TaskFileChange {
  path: string;
  indexStatus: string;
  workingTreeStatus: string;
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number | null;
  deletions: number | null;
  binary: boolean;
}

export interface TaskChangeSet {
  isolated: boolean;
  workspacePath: string;
  branchName: string | null;
  repositoryHead: string | null;
  latestCommit: { hash: string; message: string; author: string; date: string } | null;
  pendingCommits: number;
  integrationStatus: 'not_applied' | 'pending_review' | 'integrated';
  files: TaskFileChange[];
  diff: string;
}

interface GitStatusFile {
  path: string;
  index: string;
  working_dir: string;
}

interface FileStats {
  additions: number | null;
  deletions: number | null;
  binary: boolean;
}

const LOG = (message: string, ...args: any[]) => logger.info('[WORKTREE] ' + message, ...args);

export class WorktreeService {
  constructor(private readonly baseDirectory: string) {
    mkdirSync(baseDirectory, { recursive: true });
  }

  /** 确保任务有 worktree（从最新远端代码创建），返回 agent 执行目录 */
  async ensureWorkspace(task: TaskRuntime, project: { id: string; path: string }): Promise<TaskWorkspace> {
    const git = simpleGit(project.path);
    if (!(await git.checkIsRepo())) {
      return { path: project.path, branchName: null, isolated: false };
    }
    try {
      await git.revparse(['--verify', 'HEAD']);
    } catch {
      return { path: project.path, branchName: null, isolated: false };
    }

    // fetch 最新远端代码，让 worktree 基于最新代码
    let fetchOk = false;
    let upstreamRef = 'HEAD';
    try {
      await git.fetch();
      fetchOk = true;
      try {
        const currentBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
        if (currentBranch !== 'HEAD') {
          upstreamRef = `origin/${currentBranch}`;
          try { await git.revparse(['--verify', upstreamRef]); } catch { upstreamRef = 'HEAD'; }
        }
      } catch {
        // 无法确定上游分支，用本地 HEAD
      }
    } catch {
      LOG('fetch failed, using local HEAD for worktree');
    }

    const existingPath = task.workspacePath && existsSync(task.workspacePath) ? task.workspacePath : null;

    if (existingPath) {
      // 更新既有 worktree 到最新代码
      if (task.branchName && fetchOk) {
        try {
          const taskGit = simpleGit(existingPath);
          if (await taskGit.checkIsRepo()) {
            const status = await taskGit.status();
            if (status.isClean()) {
              await taskGit.raw(['rebase', upstreamRef]);
            } else {
              LOG('worktree has uncommitted changes, auto-saving before rebase:', existingPath);
              try {
                await taskGit.raw(['add', '-A']);
                await taskGit.raw([
                  '-c', 'user.name=Agent Workbench',
                  '-c', 'user.email=agent-workbench@local',
                  'commit', '-m', 'chore: auto-save prior work before rebase',
                ]);
                await taskGit.raw(['rebase', upstreamRef]);
              } catch (stashError) {
                LOG('worktree auto-commit + rebase failed, proceeding with existing state:', existingPath, stashError);
              }
            }
          }
        } catch (error) {
          LOG('worktree rebase failed, proceeding with existing state:', existingPath, error);
        }
      }
      return {
        path: existingPath,
        branchName: task.branchName,
        isolated: path.resolve(existingPath) !== path.resolve(project.path),
      };
    }

    const workspacePath = path.join(this.baseDirectory, project.id, task.id);
    const branchName = task.branchName || `agent-task/${task.id.slice(0, 12)}`;
    mkdirSync(path.dirname(workspacePath), { recursive: true });

    if (!existsSync(workspacePath)) {
      await git.raw(['worktree', 'prune']);
      const branches = await git.branchLocal();
      if (branches.all.includes(branchName)) {
        await git.raw(['worktree', 'add', workspacePath, branchName]);
      } else {
        await git.raw(['worktree', 'add', '-b', branchName, workspacePath, upstreamRef]);
      }
    }

    return { path: workspacePath, branchName, isolated: true };
  }

  /** 汇总任务 worktree 的变更（供审阅） */
  async collectChanges(task: TaskRuntime, project: { path: string }): Promise<TaskChangeSet> {
    const workspacePath = task.workspacePath || project.path;
    const git = simpleGit(workspacePath);
    if (!(await git.checkIsRepo())) {
      return {
        isolated: false,
        workspacePath,
        branchName: task.branchName,
        repositoryHead: null,
        latestCommit: null,
        pendingCommits: 0,
        integrationStatus: 'not_applied',
        files: [],
        diff: '',
      };
    }

    const [status, unstagedDiff, stagedDiff, numstat, repositoryHead, log] = await Promise.all([
      git.status(),
      git.diff(),
      git.diff(['--cached']),
      git.raw(['diff', '--numstat', 'HEAD']),
      git.revparse(['HEAD']),
      git.log({ maxCount: 1 }),
    ]);
    const fileStats = this.parseNumstat(numstat);
    const untrackedDiff = status.files
      .filter((file) => file.index === '?' && file.working_dir === '?')
      .map((file) => this.buildUntrackedDiff(workspacePath, file.path))
      .filter(Boolean)
      .join('\n\n');
    const diffParts = [
      stagedDiff && '# Staged\n' + stagedDiff,
      unstagedDiff && '# Working tree\n' + unstagedDiff,
      untrackedDiff && '# Untracked\n' + untrackedDiff,
    ].filter(Boolean);
    const isolated = path.resolve(workspacePath) !== path.resolve(project.path);
    let pendingCommits = 0;
    let integrationStatus: TaskChangeSet['integrationStatus'] = 'not_applied';
    let files = this.mapStatusFiles(workspacePath, status.files, fileStats);
    let diff = diffParts.join('\n\n');
    if (isolated && task.branchName) {
      try {
        const projectGit = simpleGit(project.path);
        const targetHead = (await projectGit.revparse(['HEAD'])).trim();
        pendingCommits = Number((await git.raw(['rev-list', '--count', `${targetHead}..HEAD`])).trim() || 0);
        let mergeHead = '';
        try { mergeHead = (await projectGit.raw(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).trim(); }
        catch { /* 项目不在合并状态 */ }
        integrationStatus = mergeHead === repositoryHead.trim()
          ? 'pending_review'
          : pendingCommits === 0 && status.isClean()
            ? 'integrated'
            : 'not_applied';
        if (integrationStatus === 'pending_review') {
          const [projectStatus, projectDiff, projectNumstat] = await Promise.all([
            projectGit.status(),
            projectGit.diff(['--cached']),
            projectGit.raw(['diff', '--numstat', '--cached']),
          ]);
          files = this.mapStatusFiles(project.path, projectStatus.files, this.parseNumstat(projectNumstat));
          diff = projectDiff ? `# Staged in project (not committed)\n${projectDiff}` : '';
        } else if (pendingCommits > 0) {
          // worktree 已有提交但尚未合入：把 targetHead..HEAD 的差异并进来，
          // 让审查/回传能看到 Agent 实际改动（即使其工作区是干净的）
          try {
            const [committedDiff, committedNumstat, committedFiles] = await Promise.all([
              git.raw(['diff', `${targetHead}..HEAD`]),
              git.raw(['diff', '--numstat', `${targetHead}..HEAD`]),
              git.raw(['diff', '--name-only', `${targetHead}..HEAD`]),
            ]);
            const committedStats = this.parseNumstat(committedNumstat);
            const committedFileList = committedFiles
              .split(/\r?\n/)
              .map((f) => f.trim())
              .filter(Boolean);
            const committedFileMap = new Map(
              committedFileList.map((f) => {
                const match = f.match(/^(.+?)\s*->\s*(.+)$/);
                return [match ? match[2] : f, { isRename: !!match, from: match ? match[1] : null, to: match ? match[2] : f }];
              }),
            );
            const committedChanges: TaskFileChange[] = committedFileList.map((f) => {
              const stats = committedStats.get(f);
              const renameInfo = committedFileMap.get(f);
              const changeType: TaskFileChange['changeType'] = (renameInfo && renameInfo.isRename)
                ? 'renamed'
                : (stats?.additions === 0 && stats?.deletions === 0)
                  ? 'added'
                  : 'modified';
              return {
                path: f,
                indexStatus: 'A',
                workingTreeStatus: ' ',
                changeType,
                additions: stats?.additions ?? 0,
                deletions: stats?.deletions ?? 0,
                binary: stats?.binary ?? false,
              };
            });
            files = [...committedChanges, ...files];
            if (committedDiff) diff = (diff ? diff + '\n\n' : '') + `# Committed in worktree (${pendingCommits} commits)\n${committedDiff}`;
          } catch (committedError) {
            LOG('collectChanges: could not compute committed diff: %s', (committedError as Error)?.message);
          }
        }
      } catch {
        pendingCommits = 0;
      }
    }
    return {
      isolated,
      workspacePath,
      branchName: task.branchName,
      repositoryHead: repositoryHead.trim(),
      latestCommit: log.latest ? {
        hash: log.latest.hash,
        message: log.latest.message,
        author: log.latest.author_name,
        date: log.latest.date,
      } : null,
      pendingCommits,
      integrationStatus,
      files,
      diff: diff.slice(0, 2_000_000),
    };
  }

  /** 把 worktree 分支合并进主仓库（staged，不提交） */
  async applyChanges(task: TaskRuntime, project: { path: string }): Promise<{
    sourceBranch: string;
    targetBranch: string;
    commitHash: string;
    changedFiles: string[];
  }> {
    if (!task.workspacePath || !task.branchName
      || path.resolve(task.workspacePath) === path.resolve(project.path)) {
      throw new Error('Task does not use an isolated Git worktree');
    }
    if (!existsSync(task.workspacePath)) throw new Error(`Task worktree not found: ${task.workspacePath}`);

    const projectGit = simpleGit(project.path);
    const taskGit = simpleGit(task.workspacePath);
    const targetStatus = await projectGit.status();
    if (!targetStatus.isClean()) {
      throw new Error('The project working tree is not clean. Commit or stash its changes before applying this Task.');
    }
    if (!targetStatus.current) throw new Error('The project is in detached HEAD state');

    const taskStatus = await taskGit.status();
    const changedFiles = taskStatus.files.map((file) => file.path);
    if (!taskStatus.isClean()) {
      await taskGit.add(['-A']);
      await taskGit.raw([
        '-c', 'user.name=Agent Workbench',
        '-c', 'user.email=agent-workbench@local',
        'commit', '-m', `task: ${task.title}`,
      ]);
    }

    const targetHead = (await projectGit.revparse(['HEAD'])).trim();
    const pendingCommits = Number((await taskGit.raw([
      'rev-list', '--count', `${targetHead}..${task.branchName}`,
    ])).trim() || 0);
    if (!pendingCommits) throw new Error('Task branch has no unapplied commits');

    try {
      await projectGit.raw([
        '-c', 'user.name=Agent Workbench',
        '-c', 'user.email=agent-workbench@local',
        'merge', '--no-ff', '--no-commit', task.branchName,
      ]);
    } catch (error) {
      try { await projectGit.raw(['merge', '--abort']); } catch { /* 合并可能尚未开始 */ }
      throw new Error(`Unable to apply Task changes cleanly: ${String(error)}`);
    }

    const sourceCommit = (await taskGit.revparse(['HEAD'])).trim();
    const appliedStatus = await projectGit.status();
    const appliedFiles = appliedStatus.files.map((file) => file.path);
    return {
      sourceBranch: task.branchName,
      targetBranch: targetStatus.current,
      commitHash: sourceCommit,
      changedFiles: appliedFiles.length ? appliedFiles : changedFiles,
    };
  }

  /** 提交项目中的 pending 合并（由 applyChanges 产生），可选推送远端 */
  async commitAppliedChanges(
    task: TaskRuntime,
    project: { path: string },
    message?: string,
    push = false,
  ): Promise<{ commit: string; branch: string | null; pushed: boolean }> {
    if (!task.workspacePath || !task.branchName
      || path.resolve(task.workspacePath) === path.resolve(project.path)) {
      throw new Error('Task does not use an isolated Git worktree');
    }
    if (!existsSync(task.workspacePath)) throw new Error(`Task worktree not found: ${task.workspacePath}`);

    const projectGit = simpleGit(project.path);
    const taskGit = simpleGit(task.workspacePath);
    let mergeHead = '';
    try {
      mergeHead = (await projectGit.raw(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).trim();
    } catch {
      throw new Error('The project has no pending merge to commit');
    }
    const branchHead = (await taskGit.revparse(['HEAD'])).trim();
    if (mergeHead !== branchHead) {
      throw new Error('The pending project merge does not belong to this Task');
    }

    const commitMessage = message?.trim() || `task: ${task.title}`;
    const commit = (await projectGit.raw([
      '-c', 'user.name=Agent Workbench',
      '-c', 'user.email=agent-workbench@local',
      'commit', '-m', commitMessage,
    ])).trim();
    LOG('committed applied merge %s (%s)', task.id.slice(0, 12), commit.split('\n')[0]);

    let pushed = false;
    let branch: string | null = null;
    if (push) {
      branch = (await projectGit.revparse(['--abbrev-ref', 'HEAD'])).trim();
      if (branch === 'HEAD') throw new Error('The project is in detached HEAD state');
      await projectGit.push('origin', branch);
      pushed = true;
      LOG('pushed to origin/%s', branch);
    }
    return { commit, branch, pushed };
  }

  /** 撤销主仓库中的 pending 合并 */
  async abortAppliedChanges(task: TaskRuntime, project: { path: string }): Promise<{
    sourceBranch: string;
    targetBranch: string;
    sourceCommit: string;
  }> {
    if (!task.workspacePath || !task.branchName
      || path.resolve(task.workspacePath) === path.resolve(project.path)) {
      throw new Error('Task does not use an isolated Git worktree');
    }
    if (!existsSync(task.workspacePath)) throw new Error(`Task worktree not found: ${task.workspacePath}`);

    const projectGit = simpleGit(project.path);
    const taskGit = simpleGit(task.workspacePath);
    const targetStatus = await projectGit.status();
    if (!targetStatus.current) throw new Error('The project is in detached HEAD state');

    let mergeHead = '';
    try {
      mergeHead = (await projectGit.raw(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).trim();
    } catch {
      throw new Error('The project has no pending Task application to abort');
    }
    const sourceCommit = (await taskGit.revparse(['HEAD'])).trim();
    if (mergeHead !== sourceCommit) {
      throw new Error('The pending project merge does not belong to this Task');
    }

    await projectGit.raw(['merge', '--abort']);
    return {
      sourceBranch: task.branchName,
      targetBranch: targetStatus.current,
      sourceCommit,
    };
  }

  /** 丢弃 worktree 的全部改动（reset --hard + clean） */
  async discardChanges(task: TaskRuntime, project: { path: string }): Promise<{
    targetHead: string;
    discardedFiles: string[];
    discardedCommits: number;
  }> {
    if (!task.workspacePath || !task.branchName
      || path.resolve(task.workspacePath) === path.resolve(project.path)) {
      throw new Error('Task does not use an isolated Git worktree');
    }
    if (!existsSync(task.workspacePath)) throw new Error(`Task worktree not found: ${task.workspacePath}`);

    const projectGit = simpleGit(project.path);
    const taskGit = simpleGit(task.workspacePath);
    let mergeHead = '';
    try { mergeHead = (await projectGit.raw(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).trim(); }
    catch { /* 项目不在合并状态 */ }
    const taskHead = (await taskGit.revparse(['HEAD'])).trim();
    if (mergeHead === taskHead) {
      throw new Error('Abort the pending project application before discarding Task changes');
    }
    const targetHead = (await projectGit.revparse(['HEAD'])).trim();
    const status = await taskGit.status();
    const committedFiles = (await taskGit.diff(['--name-only', `${targetHead}..HEAD`]))
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter(Boolean);
    const discardedFiles = [...new Set([
      ...status.files.map((file) => file.path),
      ...committedFiles,
    ])];
    const discardedCommits = Number((await taskGit.raw([
      'rev-list', '--count', `${targetHead}..HEAD`,
    ])).trim() || 0);
    if (!discardedFiles.length && !discardedCommits) throw new Error('Task has no changes to discard');

    await taskGit.raw(['reset', '--hard', targetHead]);
    await taskGit.raw(['clean', '-fd']);
    return { targetHead, discardedFiles, discardedCommits };
  }

  private buildUntrackedDiff(workspacePath: string, relativePath: string): string {
    const workspaceRoot = path.resolve(workspacePath);
    const filePath = path.resolve(workspaceRoot, relativePath);
    if (!filePath.startsWith(workspaceRoot + path.sep) || !existsSync(filePath)) return '';
    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) return '';
      if (stat.size > 512 * 1024) return `diff --git a/${relativePath} b/${relativePath}\nBinary or large file omitted`;
      const content = readFileSync(filePath);
      if (content.includes(0)) return `diff --git a/${relativePath} b/${relativePath}\nBinary file omitted`;
      const lines = content.toString('utf8').split(/\r?\n/);
      if (lines.at(-1) === '') lines.pop();
      return [
        `diff --git a/${relativePath} b/${relativePath}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${relativePath}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((line) => `+${line}`),
      ].join('\n');
    } catch {
      return `diff --git a/${relativePath} b/${relativePath}\nUnable to preview file`;
    }
  }

  private readUntrackedStats(
    workspacePath: string,
    relativePath: string,
  ): { additions: number | null; deletions: number | null; binary: boolean } {
    const workspaceRoot = path.resolve(workspacePath);
    const filePath = path.resolve(workspaceRoot, relativePath);
    if (!filePath.startsWith(workspaceRoot + path.sep) || !existsSync(filePath)) {
      return { additions: 0, deletions: 0, binary: false };
    }
    try {
      const content = readFileSync(filePath);
      if (content.includes(0)) return { additions: null, deletions: null, binary: true };
      const text = content.toString('utf8');
      const additions = text ? text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0) : 0;
      return { additions, deletions: 0, binary: false };
    } catch {
      return { additions: null, deletions: null, binary: true };
    }
  }

  private parseNumstat(output: string): Map<string, FileStats> {
    const result = new Map<string, FileStats>();
    for (const line of output.split(/\r?\n/).filter(Boolean)) {
      const [added = '0', deleted = '0', ...pathParts] = line.split('\t');
      const filePath = pathParts.at(-1);
      if (!filePath) continue;
      const binary = added === '-' || deleted === '-';
      result.set(filePath, {
        additions: binary ? null : Number(added),
        deletions: binary ? null : Number(deleted),
        binary,
      });
    }
    return result;
  }

  private mapStatusFiles(
    workspacePath: string,
    files: GitStatusFile[],
    fileStats: Map<string, FileStats>,
  ): TaskChangeSet['files'] {
    return files.map((file) => {
      const codes = `${file.index}${file.working_dir}`;
      let stats = fileStats.get(file.path);
      if (!stats && codes.includes('?')) stats = this.readUntrackedStats(workspacePath, file.path);
      const changeType = codes.includes('?') || codes.includes('A')
        ? 'added'
        : codes.includes('D')
          ? 'deleted'
          : codes.includes('R')
            ? 'renamed'
            : 'modified';
      return {
        path: file.path,
        indexStatus: file.index,
        workingTreeStatus: file.working_dir,
        changeType,
        additions: stats?.additions ?? 0,
        deletions: stats?.deletions ?? 0,
        binary: stats?.binary ?? false,
      };
    });
  }
}
