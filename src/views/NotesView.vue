<template>
  <div class="notes-view">
    <div class="tab-bar">
      <button class="tab" :class="{ active: activeTab === 'files' }" @click="activeTab = 'files'">📁 文件浏览</button>
      <button class="tab" :class="{ active: activeTab === 'overview' }" @click="switchToOverview">📊 概览</button>
    </div>

    <!-- ========== Tab 1: 文件浏览 ========== -->
    <div v-if="activeTab === 'files'" class="notes-body">
      <div class="left-panel" :class="{ collapsed: leftCollapsed }">
        <div class="panel-header">
          <div class="panel-title">文件浏览</div>
          <button class="btn-icon" @click="leftCollapsed = !leftCollapsed" title="收起/展开侧栏">
            {{ leftCollapsed ? '▶' : '◀' }}
          </button>
        </div>
        <div class="project-bar">
          <span v-if="notesDir" class="proj-name">{{ notesDir }}</span>
          <span v-else class="proj-name text-muted">未配置笔记库</span>
          <button class="btn-icon" :disabled="indexing" @click="indexCurrentProject" :title="hasIndexed ? '重新索引' : '构建索引'">{{ indexing ? '⏳' : '📇' }}</button>
          <span class="index-status">{{ indexing ? progressText : (hasIndexed ? '已索引' : '') }}</span>
        </div>
        <div v-if="indexing" class="index-progress">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
          </div>
          <div v-if="progressFile" class="progress-file">{{ progressFile }}</div>
        </div>
        <div class="search-bar">
          <input v-model="searchQuery" class="search-input" placeholder="搜索当前项目..." @keydown.enter="doSearch" />
          <button class="btn-icon" @click="doSearch" title="搜索">🔍</button>
          <button v-if="searchActive" class="btn-icon" @click="clearSearch" title="返回文件树">✕</button>
        </div>
        <div class="tree-container">
          <div v-if="searchActive" class="search-results">
            <div v-if="searchResults.length === 0 && searched" class="tree-placeholder"><span class="placeholder-text">未找到结果</span></div>
            <div v-for="(r,i) in searchResults" :key="i" class="search-result-item" @click="openSearchResult(r)">
              <div class="search-result-name">{{ r.name }}</div>
              <div class="search-result-path">{{ r.path.replace(notesDir||"","") }}</div>
              <div v-if="r.match" class="search-result-match">{{ r.match }}</div>
            </div>
          </div>

          <template v-if="!searchActive">
          <div v-if="!notesDir" class="tree-placeholder">
            <div class="placeholder-text">未配置笔记库，请到设置页配置</div>
          </div>
          <div v-else-if="treeData.length === 0" class="tree-placeholder">
            <div class="placeholder-text">暂无文件</div>
          </div>
          <TreeNode
            v-else
            v-for="node in treeData"
            :key="node.path"
            :node="node"
            :depth="0"
            :kb-id="notesDir"
            @select="selectFile"
          />
          </template>
        </div>
      </div>

      <div class="right-panel">
        <div v-if="!selectedFile" class="empty-state">
          <div class="empty-icon">📄</div>
          <div class="empty-title">选择笔记文件</div>
          <div class="empty-desc">在左侧文件树中选择一个 Markdown 文件查看内容</div>
        </div>
        <template v-else>
          <div class="preview-header">
            <div class="preview-info">
              <div class="preview-title">{{ selectedFile.name }}</div>
              <div class="preview-path">{{ selectedFile.path }}</div>
            </div>
          </div>
          <div class="preview-content" v-html="renderedContent"></div>
        </template>
      </div>
    </div>

    <!-- ========== Tab 2: 概览 ========== -->
    <div v-if="activeTab === 'overview'" class="overview-body">
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-icon" style="background:rgba(59,130,246,0.1);color:#3b82f6;">💻</div><div class="stat-num">{{ stats.codeProjectCount }}</div><div class="stat-label">代码库</div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(34,197,94,0.1);color:#22c55e;">✅</div><div class="stat-num">{{ stats.todoPending }}</div><div class="stat-label">待办 {{ stats.todoOverdue ? '(' + stats.todoOverdue + ' 逾期)' : '' }}</div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(239,68,68,0.1);color:#ef4444;">🔔</div><div class="stat-num">{{ stats.remindersActive }}</div><div class="stat-label">提醒</div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(99,102,241,0.1);color:#6366f1;">💬</div><div class="stat-num">{{ stats.totalChats }}</div><div class="stat-label">对话</div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(251,146,60,0.1);color:#fb923c;">📊</div><div class="stat-num">{{ stats.todayDataRecords }}</div><div class="stat-label">今日数据</div></div>
      </div>

      <div class="index-info-card">
        <div class="index-info-header">
          <span class="index-info-title">🧠 向量模型</span>
          <span class="index-info-badge" :class="{ configured: indexerModel, unconfigured: !indexerModel }">
            {{ indexerModel ? '已配置' : '未配置' }}
          </span>
        </div>
        <div v-if="!indexerModel" class="index-info-warning">
          ⚠️ 未配置向量模型，笔记库无法索引，将影响语义搜索功能。请到「设置」页配置嵌入模型。
        </div>
        <div v-else class="index-info-details">
          <div class="index-info-row">
            <span class="info-label">模型</span>
            <span class="info-value">{{ indexerModel }}</span>
          </div>
          <div class="index-info-row">
            <span class="info-label">服务地址</span>
            <span class="info-value">{{ indexerHost }}</span>
          </div>
          <div class="index-info-row">
            <span class="info-label">运行状态</span>
            <span class="info-value" :class="{ running: indexerRunning, stopped: !indexerRunning }">
              {{ indexerRunning ? '● 运行中' : '○ 已停止' }}
            </span>
          </div>
          <div class="index-sub-stats">
            <div class="index-sub-card"><div class="index-sub-num">{{ indexerFileCount }}</div><div class="index-sub-label">文件</div></div>
            <div class="index-sub-card"><div class="index-sub-num">{{ indexerChunkCount }}</div><div class="index-sub-label">片段</div></div>
            <div class="index-sub-card"><div class="index-sub-num">{{ indexerEmbeddedCount }}/{{ indexerChunkCount }}</div><div class="index-sub-label">已嵌入</div></div>
          </div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="dashboard-left">
          <div class="section-header">📊 综合日报 <span class="report-schedule">{{ reportScheduleText }}</span></div>
          <div class="card" v-if="reportDetail">
            <div class="preview" v-html="renderMarkdown(reportDetail)"></div>
          </div>
          <div class="card">
            <div v-if="reports.length" class="report-list">
              <div v-for="(r, i) in reports" :key="r.id" class="report-item" :class="{ active: expandedReport === i }" @click="selectReport(i, r)">
                <div class="report-header">
                  <span class="report-date">{{ r.report_date || '日报' }}</span>
                  <span class="report-time" style="margin:0;">{{ r.created_at }}</span>
                </div>
                <div class="report-summary">{{ (r.summary || '').slice(0, 200) }}</div>
              </div>
            </div>
            <div v-else class="empty-state" style="padding:20px;">
              <div class="empty-icon">📊</div>
              <div class="empty-title">暂无日报</div>
            </div>
          </div>
        </div>

        <div class="dashboard-right">
          <div class="section-header">✅ 待办事项</div>
          <div class="card">
            <div v-if="todos.length" class="todo-list">
              <div v-for="t in todos" :key="t.id" class="todo-item" :class="{ overdue: t.due_date && t.due_date < todayStr && t.status !== 'done' }">
                <div class="todo-priority" :class="t.priority">{{ t.priority === 'high' ? '🔴' : t.priority === 'mid' ? '🟡' : '🟢' }}</div>
                <div class="todo-body">
                  <div class="todo-title">{{ t.title }}</div>
                  <div class="todo-meta" v-if="t.due_date">{{ t.due_date }}</div>
                </div>
                <button class="todo-done-btn" @click="toggleTodo(t)">{{ t.status === 'done' ? '↩' : '✓' }}</button>
              </div>
            </div>
            <div v-else class="empty-state" style="padding:20px;">
              <div class="empty-title" style="font-size:13px;">暂无待办</div>
            </div>
          </div>

          <div class="section-header">🔔 提醒</div>
          <div class="card">
            <div v-if="reminders.length" class="reminder-list">
              <div v-for="r in reminders" :key="r.id" class="reminder-item">
                <div class="reminder-name">{{ r.name }}</div>
                <div class="reminder-time">{{ r.time || '09:00' }}{{ r.date ? ' · ' + r.date : '' }}</div>
              </div>
            </div>
            <div v-else class="empty-state" style="padding:20px;">
              <div class="empty-title" style="font-size:13px;">暂无提醒</div>
            </div>
          </div>

          <div class="section-header">📋 待处理记录</div>
          <div class="card">
            <div v-if="pendingRecords.length" class="pending-list">
              <div v-for="group in pendingRecords" :key="group.datasetId" class="pending-group">
                <div class="pending-group-title">{{ group.datasetName }}</div>
                <div v-for="rec in group.records" :key="rec.id" class="pending-item">
                  <div class="pending-text">{{ Object.values(rec).filter(v => typeof v === 'string' && v.length < 80 && v !== rec._created_at).slice(0, 2).join(' · ') || '(无标题)' }}</div>
                  <div class="pending-time">{{ rec._created_at || '' }}</div>
                </div>
              </div>
            </div>
            <div v-else class="empty-state" style="padding:20px;">
              <div class="empty-title" style="font-size:13px;">暂无待处理记录</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import TreeNode from '@/components/TreeNode.vue';

const API = window.electronAPI;

const activeTab = ref('files');

// ========== 文件浏览 ==========
const notesDir = ref('');
const treeData = ref<TreeNode[]>([]);
const selectedFile = ref<any>(null);
const fileContent = ref('');
const leftCollapsed = ref(false);
const searchQuery = ref('');
const searchActive = ref(false);
const searched = ref(false);
const searchResults = ref<any[]>([]);
const indexing = ref(false);
const indexedState = ref<Record<string, boolean>>({});
const hasIndexed = computed(() => indexedState.value[notesDir.value] ?? false);
const progressPhase = ref('');
const progressCurrent = ref(0);
const progressTotal = ref(0);
const progressFile = ref('');

const progressText = computed(() => {
  const phase = progressPhase.value === 'embed' ? '生成嵌入' : '扫描文件';
  return progressTotal.value > 0
    ? `${phase} ${progressCurrent.value}/${progressTotal.value}`
    : phase;
});
const progressPct = computed(() => {
  if (!progressTotal.value) return 0;
  return Math.round((progressCurrent.value / progressTotal.value) * 100);
});

const renderedContent = computed(() => {
  if (!fileContent.value) return '';
  const name = selectedFile.value?.name || '';
  if (name.endsWith('.md')) {
    try { return marked(fileContent.value); } catch { return '<pre>' + escapeHtml(fileContent.value) + '</pre>'; }
  }
  const ext = name.includes('.') ? name.split('.').pop() || '' : '';
  const lang = hljs.getLanguage(ext) ? ext : '';
  const highlighted = lang ? hljs.highlight(fileContent.value, { language: lang }).value : escapeHtml(fileContent.value);
  return '<pre><code class="hljs ' + (lang ? 'language-' + lang : '') + '">' + highlighted + '</code></pre>';
});

async function loadNotesDir() {
  try {
    notesDir.value = await API.kb.getDir();
    if (notesDir.value) {
      await loadFileTree();
      await loadIndexedState();
    }
  } catch (e) {
    console.warn('加载笔记库失败:', e);
  }
}

async function loadFileTree() {
  if (!notesDir.value) return;
  try {
    treeData.value = await API.notes.tree(notesDir.value);
  } catch (e) {
    console.warn('加载文件树失败:', e);
    treeData.value = [];
  }
}

async function selectFile(item: TreeNode) {
  if (item.type === 'folder') return;
  selectedFile.value = item;
  try {
    const result = await API.notes.read(notesDir.value, item.path);
    if (result.ok) {
      fileContent.value = result.content;
    } else {
      fileContent.value = '⚠️ 读取失败: ' + (result.error || '未知错误');
    }
  } catch (e: any) {
    fileContent.value = '⚠️ 读取失败: ' + e.message;
  }
}

async function loadIndexedState() {
  if (!notesDir.value) return;
  try {
    const status = await API.kb.status(notesDir.value);
    indexedState.value[notesDir.value] = status?.indexed ?? false;
  } catch {
    indexedState.value[notesDir.value] = false;
  }
}

function escapeHtml(text: string): string {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = String(text);
  return d.innerHTML;
}

async function doSearch() {
  const q = searchQuery.value.trim();
  if (!q) { searchActive.value = false; return; }
  searchActive.value = true;
  searched.value = true;
  try {
    if (notesDir.value) {
      const results = await API.kb.search(notesDir.value, q);
      searchResults.value = results.map((r: any) => ({
        path: r.source, name: r.title, score: r.score, match: (r.text || '').slice(0, 200),
      }));
    } else {
      searchResults.value = [];
    }
  } catch { searchResults.value = []; }
}

function onScanProgress(data: any) {
  if (data.phase === 'done') {
    indexedState.value[notesDir.value] = true;
    indexing.value = false;
    return;
  }
  progressPhase.value = data.phase || '';
  progressCurrent.value = data.current || 0;
  progressTotal.value = data.total || 0;
  progressFile.value = data.file || '';
}

async function indexCurrentProject() {
  if (!notesDir.value || indexing.value) return;
  indexing.value = true;
  progressPhase.value = 'scan';
  progressCurrent.value = 0;
  progressTotal.value = 0;
  progressFile.value = '';

  API.on('kb:scan-progress', onScanProgress);

  try {
    await API.kb.scan(notesDir.value);
  } catch { indexing.value = false; }
  API.removeAllListeners('kb:scan-progress');
}

function clearSearch() {
  searchActive.value = false;
  searchQuery.value = '';
  searchResults.value = [];
  searched.value = false;
}

function openSearchResult(r: any) {
  selectFile({ name: r.name, path: r.path, type: 'file' });
}

// ========== 概览 ==========
const stats = ref({
  fileCount: 0, chunkCount: 0, todayModified: 0, projectCount: 0, codeProjectCount: 0, totalChats: 0, todoPending: 0, todoOverdue: 0, remindersActive: 0, todayDataRecords: 0
});

const indexerModel = ref('');
const indexerHost = ref('');
const indexerRunning = ref(false);
const indexerFileCount = ref(0);
const indexerChunkCount = ref(0);
const indexerEmbeddedCount = ref(0);

const reports = ref<any[]>([]);
const expandedReport = ref<number | null>(null);
const reportDetail = ref('');
const reportCron = ref('');

const reportScheduleText = computed(() => {
  if (reportCron.value) {
    const parts = reportCron.value.split(' ');
    if (parts.length >= 2) {
      const hour = parts[1].padStart(2, '0');
      const min = parts[0].padStart(2, '0');
      return `每日 ${hour}:${min} 自动生成`;
    }
  }
  return '每日自动生成综合日报';
});

const todos = ref<any[]>([]);
const reminders = ref<any[]>([]);
const pendingRecords = ref<any[]>([]);
const todayStr = ref('');

const renderMarkdown = (text: string) => {
  if (!text) return '';
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^> /.test(line)) {
      let cnt = line.slice(2)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
        .replace(/`(.+?)`/g,'<code>$1</code>')
        .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>');
      out.push('<blockquote style="border-left:3px solid #6366f1;padding:6px 12px;margin:8px 0;background:#f8fafc;border-radius:4px;color:#475569">' + cnt + '</blockquote>');
      continue;
    }
    if (/^\|/.test(line)) {
      const trows: string[] = [line];
      while (i + 1 < lines.length && /^\|/.test(lines[i + 1])) { i++; trows.push(lines[i]); }
      let thtml = '';
      if (trows.length > 1 && /^\|[-:| ]+\|$/.test(trows[1])) {
        thtml += '<thead><tr>';
        const hcells = trows[0].split('|').filter(c => c.trim() !== '');
        for (const hc of hcells) {
          const hv = hc.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          thtml += '<th style="padding:6px 10px;border:1px solid #d0d5dd;background:#f0f0f5;font-weight:600;text-align:left;font-size:13px">' + hv + '</th>';
        }
        thtml += '</tr></thead><tbody>';
        for (let tj = 2; tj < trows.length; tj++) {
          const dcells = trows[tj].split('|').filter(c => c.trim() !== '');
          thtml += '<tr>';
          for (const dc of dcells) {
            const dv = dc.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            thtml += '<td style="padding:6px 10px;border:1px solid #d0d5dd;font-size:13px">' + dv + '</td>';
          }
          thtml += '</tr>';
        }
        thtml += '</tbody>';
      } else {
        thtml += '<tbody>';
        for (const row of trows) {
          const dcells = row.split('|').filter(c => c.trim() !== '');
          thtml += '<tr>';
          for (const dc of dcells) {
            const dv = dc.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            thtml += '<td style="padding:6px 10px;border:1px solid #d0d5dd;font-size:13px">' + dv + '</td>';
          }
          thtml += '</tr>';
        }
        thtml += '</tbody>';
      }
      out.push('<table style="width:100%;border-collapse:collapse;margin:8px 0">' + thtml + '</table>');
      continue;
    }
    const esc = line
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/`(.+?)`/g,'<code>$1</code>')
      .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>');
    if (/^### /.test(line)) { out.push('<h3>' + esc.slice(4) + '</h3>'); continue; }
    if (/^## /.test(line)) { out.push('<h2 style="font-size:16px;margin:12px 0 6px">' + esc.slice(3) + '</h2>'); continue; }
    if (/^# /.test(line)) { out.push('<h1 style="font-size:18px;margin:16px 0 8px">' + esc.slice(2) + '</h1>'); continue; }
    if (/^---$/.test(line)) { out.push('<hr>'); continue; }
    if (/^☀️ /.test(line)) { out.push('<div style="font-size:20px;font-weight:700;margin:16px 0 8px">' + esc + '</div>'); continue; }
    if (/^📅 /.test(line)) { out.push('<div style="font-size:14px;color:#64748b;margin-bottom:16px">' + esc + '</div>'); continue; }
    if (/^✅ /.test(line)) { out.push('<div style="font-size:15px;font-weight:600;margin:12px 0 6px;color:#16a34a">' + esc + '</div>'); continue; }
    if (/^⚠️ /.test(line)) { out.push('<div style="font-size:15px;font-weight:600;margin:12px 0 6px;color:#ef4444">' + esc + '</div>'); continue; }
    if (/^📋 /.test(line)) { out.push('<div style="font-size:15px;font-weight:600;margin:12px 0 6px">' + esc + '</div>'); continue; }
    if (/^⏰ /.test(line)) { out.push('<div style="font-size:15px;font-weight:600;margin:12px 0 6px">' + esc + '</div>'); continue; }
    if (/^💬 /.test(line)) { out.push('<div style="font-size:15px;font-weight:600;margin:12px 0 6px">' + esc + '</div>'); continue; }
    if (/^📝 /.test(line)) { out.push('<div style="font-size:15px;font-weight:600;margin:12px 0 6px">' + esc + '</div>'); continue; }
    if (/^🗂️ /.test(line)) { out.push('<div style="font-size:15px;font-weight:600;margin:12px 0 6px">' + esc + '</div>'); continue; }
    if (/^📊 /.test(line)) { out.push('<div style="font-size:15px;font-weight:600;margin:12px 0 6px">' + esc + '</div>'); continue; }
    if (/^🌅 /.test(line)) { out.push('<div style="font-size:14px;color:#6366f1;margin:8px 0">' + esc + '</div>'); continue; }
    if (/^🌤️ /.test(line)) { out.push('<div style="font-size:14px;color:#6366f1;margin:8px 0">' + esc + '</div>'); continue; }
    if (/^🌇 /.test(line)) { out.push('<div style="font-size:14px;color:#6366f1;margin:8px 0">' + esc + '</div>'); continue; }
    if (/^🌙 /.test(line)) { out.push('<div style="font-size:14px;color:#6366f1;margin:8px 0">' + esc + '</div>'); continue; }
    if (/^💡 /.test(line)) { out.push('<div style="font-size:13px;color:#94a3b8;margin-top:8px">' + esc + '</div>'); continue; }
    if (/^  - 🔴 /.test(line)) { out.push('<div style="padding:2px 0 2px 16px;color:#ef4444">' + esc.slice(6) + '</div>'); continue; }
    if (/^  - /.test(line)) { out.push('<div style="padding:2px 0 2px 16px">' + esc.slice(4) + '</div>'); continue; }
    if (line === '') { out.push('<br>'); continue; }
    out.push('<div>' + esc + '</div>');
  }
  return out.join('\n');
};

function selectReport(i: number, r: any) {
  expandedReport.value = i;
  reportDetail.value = r.content || '无内容';
}

async function toggleTodo(t: any) {
  const newStatus = t.status === 'done' ? 'pending' : 'done';
  await API.todo.update(t.id, { status: newStatus });
  t.status = newStatus;
}

async function loadOverviewData() {
  const d = new Date();
  todayStr.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  try { stats.value = await API.insights.stats(); } catch {}
  try {
    const info = await API.insights.indexerInfo();
    indexerModel.value = info.model || '';
    indexerHost.value = info.host || '';
    indexerRunning.value = info.running || false;
    indexerFileCount.value = info.docCount || 0;
    indexerChunkCount.value = info.chunkCount || 0;
    indexerEmbeddedCount.value = info.embeddedCount || 0;
  } catch {}
  try { reports.value = await API.insights.reports(); } catch {}
  if (reports.value.length && expandedReport.value === null) {
    expandedReport.value = 0;
    reportDetail.value = reports.value[0].content || '无内容';
  }
  try { todos.value = (await API.todo.list()).filter((t: any) => t.status !== 'done').slice(0, 10); } catch {}
  try { reminders.value = await API.reminder.list(); } catch {}
  try { pendingRecords.value = await API.ds.pendingRecords(); } catch {}
  try {
    const tasks = await API.task.list();
    const dailyReport = tasks.find((t: any) => t.task_type === 'daily_report');
    if (dailyReport && dailyReport.cron_expression) reportCron.value = dailyReport.cron_expression;
  } catch {}
}

function switchToOverview() {
  activeTab.value = 'overview';
  loadOverviewData();
}

onMounted(() => {
  loadNotesDir();
});
onUnmounted(() => {
  API.removeAllListeners('kb:scan-progress');
});
</script>

<style scoped>
.notes-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-main);
}

/* ===== Tab 栏 ===== */
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: white;
  flex-shrink: 0;
  padding: 0 16px;
}
.tab {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  border: none;
  background: none;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.tab:hover {
  color: var(--text-primary);
  background: var(--hover);
}
.tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

/* ===== 文件浏览 ===== */
.notes-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.left-panel {
  width: 280px;
  min-width: 200px;
  max-width: 400px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease, min-width 0.2s ease;
  flex-shrink: 0;
  overflow: hidden;
}

.left-panel.collapsed {
  width: 0;
  min-width: 0;
  border-right: none;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.project-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.project-bar .proj-select {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  outline: none;
}
.project-bar .proj-select:focus {
  border-color: var(--primary);
}

.project-bar .proj-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-icon:hover {
  background: var(--hover);
  color: var(--text-primary);
}
.btn-icon:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.tree-container {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.tree-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
}
.placeholder-text {
  font-size: 13px;
  color: var(--text-muted);
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: white;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}
.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.empty-desc {
  font-size: 13px;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  border-bottom: 1px solid var(--border);
  background: white;
  flex-shrink: 0;
}
.preview-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.preview-path {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  word-break: break-all;
}

.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 36px 52px;
  font-size: 14px;
  line-height: 1.85;
  color: var(--text-primary);
}
.preview-content:deep(h1) {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border);
}
.preview-content:deep(h2) {
  font-size: 22px;
  font-weight: 600;
  margin: 32px 0 16px;
  padding-left: 12px;
  border-left: 4px solid var(--primary);
}
.preview-content:deep(h3) {
  font-size: 18px;
  font-weight: 600;
  margin: 24px 0 12px;
}
.preview-content:deep(h4) {
  font-size: 16px;
  font-weight: 600;
  margin: 20px 0 10px;
}
.preview-content:deep(p) {
  margin-bottom: 16px;
}
.preview-content:deep(ul),
.preview-content:deep(ol) {
  margin-bottom: 16px;
  padding-left: 24px;
}
.preview-content:deep(li) {
  margin-bottom: 6px;
}
.preview-content:deep(blockquote) {
  margin: 16px 0;
  padding: 8px 16px;
  border-left: 4px solid var(--primary-light);
  background: #f8fafc;
  color: var(--text-secondary);
  border-radius: 0 6px 6px 0;
}
.preview-content:deep(code) {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: 13px;
  color: var(--primary-dark);
}
.preview-content:deep(pre) {
  background: #1e293b;
  color: #e2e8f0;
  padding: 16px 20px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 16px 0;
  font-size: 13px;
  line-height: 1.6;
}
.preview-content:deep(pre code) {
  background: none;
  color: inherit;
  padding: 0;
  font-size: inherit;
}
.preview-content:deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}
.preview-content:deep(th),
.preview-content:deep(td) {
  padding: 8px 12px;
  border: 1px solid var(--border);
  text-align: left;
  font-size: 13px;
}
.preview-content:deep(th) {
  background: var(--hover);
  font-weight: 600;
}
.preview-content:deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 16px 0;
}
.preview-content:deep(a) {
  color: var(--primary);
  text-decoration: none;
}
.preview-content:deep(a:hover) {
  text-decoration: underline;
}
.preview-content:deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 24px 0;
}

.index-status { font-size: 11px; color: var(--text-muted); margin-left: 4px; }
.index-progress { padding: 6px 14px 8px; border-bottom: 1px solid var(--border); }
.progress-track { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--primary); border-radius: 2px; transition: width 0.2s ease; }
.progress-file { font-size: 11px; color: var(--text-muted); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.text-muted { color: var(--text-muted); font-size: 13px; }

.search-bar { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
.search-bar .search-input { flex:1; padding:5px 8px; border:1px solid var(--border); border-radius:6px; font-size:13px; outline:none; background:white; }
.search-bar .search-input:focus { border-color:var(--primary); }
.search-result-item { padding: 8px 14px; border-bottom: 1px solid var(--border); cursor: pointer; }
.search-result-item:hover { background: var(--hover); }
.search-result-name { font-size:13px; font-weight:500; color:var(--text-primary); }
.search-result-path { font-size:11px; color:var(--text-muted); margin-top:2px; word-break:break-all; }
.search-result-match { font-size:12px; color:var(--text-secondary); margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: white;
  border-radius: 12px;
  width: 480px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.modal-header { padding: 20px 24px 0; }
.modal-header h3 { font-size: 16px; font-weight: 600; margin: 0; }
.modal-body { padding: 16px 24px; }
.modal-footer { padding: 12px 24px 20px; display: flex; gap: 8px; justify-content: flex-end; }
.folder-picker { display: flex; gap: 8px; }
.folder-picker input { flex: 1; }

:deep(.btn) {
  padding: 8px 16px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
:deep(.btn-primary) { background: var(--primary); color: white; }
:deep(.btn-primary:hover) { background: var(--primary-dark); }
:deep(.btn-secondary) { background: white; color: var(--text-secondary); border: 1px solid var(--border); }
:deep(.btn-secondary:hover) { background: var(--hover); }
:deep(.form-control) {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
  background: white;
}
:deep(.form-control:focus) {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

/* ========== 概览 ========== */
.overview-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.stats-grid {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.stat-card {
  flex: 1;
  min-width: 0;
  background: white;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
}
.stat-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.stat-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}
.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.index-info-card {
  background: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  padding: 16px 20px;
  margin-bottom: 14px;
}
.index-info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.index-info-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.index-info-badge {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 500;
}
.index-info-badge.configured {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}
.index-info-badge.unconfigured {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
.index-info-warning {
  font-size: 13px;
  color: #ef4444;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  line-height: 1.5;
}
.index-info-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.index-info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.index-info-row .info-label {
  color: var(--text-muted);
  min-width: 64px;
}
.index-info-row .info-value {
  color: var(--text-primary);
}
.index-info-row .info-value.running {
  color: #16a34a;
}
.index-info-row .info-value.stopped {
  color: var(--text-muted);
}
.index-sub-stats {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.index-sub-card {
  flex: 1;
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
}
.index-sub-card .index-sub-num {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}
.index-sub-card .index-sub-label {
  font-size: 11px;
  color: var(--text-muted);
}

.card {
  background: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  padding: 20px;
  margin-bottom: 16px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
.dashboard-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dashboard-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-header .report-schedule {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: auto;
}

.todo-list { display: flex; flex-direction: column; gap: 4px; }
.todo-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.todo-item.overdue { border-color: #fca5a5; background: #fef2f2; }
.todo-item:hover { border-color: var(--primary); }
.todo-priority { flex-shrink: 0; font-size: 12px; }
.todo-body { flex: 1; min-width: 0; }
.todo-title { font-size: 13px; font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.todo-done-btn { flex-shrink: 0; width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 50%; background: white; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
.todo-done-btn:hover { border-color: var(--primary); color: var(--primary); }

.reminder-list { display: flex; flex-direction: column; gap: 4px; }
.reminder-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.reminder-name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.reminder-time { font-size: 11px; color: var(--text-muted); }

.pending-list { display: flex; flex-direction: column; gap: 8px; }
.pending-group-title { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; padding: 4px 0; border-bottom: 1px solid var(--border); }
.pending-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: var(--radius-sm); }
.pending-item:hover { background: var(--hover); }
.pending-text { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.pending-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; margin-left: 8px; }

.report-list { display: flex; flex-direction: column; gap: 4px; }
.report-item { padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; }
.report-item:hover { border-color: var(--primary); }
.report-item.active { border-color: var(--primary); background: rgba(99,102,241,0.03); }
.report-header { display: flex; align-items: center; justify-content: space-between; }
.report-date { font-size: 13px; font-weight: 600; color: var(--primary); }
.report-summary { font-size: 12px; color: var(--text-secondary); margin-top: 3px; line-height: 1.4; }
.report-time { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
</style>