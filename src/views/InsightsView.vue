<template>
  <div class="insights-view">
    <div class="content-header">
      <h1 class="content-title">洞察</h1>
    </div>
    <div class="content-body">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(139,92,246,0.1);color:#8b5cf6;">📦</div>
          <div class="stat-value">{{ stats.projectCount }}</div>
          <div class="stat-label">笔记库数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(59,130,246,0.1);color:#3b82f6;">💬</div>
          <div class="stat-value">{{ stats.totalChats }}</div>
          <div class="stat-label">对话消息数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(251,146,60,0.1);color:#fb923c;">📅</div>
          <div class="stat-value">{{ stats.todayModified }}</div>
          <div class="stat-label">今日修改</div>
        </div>
      </div>

      <!-- 索引状态 -->
      <div class="indexer-card">
        <div class="indexer-row">
          <span class="indexer-label">嵌入模型</span>
          <span class="indexer-value">{{ indexerInfo.model }} @ {{ indexerInfo.host }}</span>
        </div>
        <div class="indexer-row">
          <span class="indexer-label">索引状态</span>
          <span class="indexer-value">
            <span v-if="indexing">
              <span class="badge badge-running">{{ indexPhase === 'scan' ? '📄 扫描中' : '🧠 向量化' }}</span>
              <span class="indexer-stats">{{ indexProgress }}</span>
            </span>
            <span v-else class="badge badge-idle">就绪</span>
            <span class="indexer-stats">{{ indexerInfo.docCount }} 文件 / {{ indexerInfo.chunkCount }} 片段</span>
          </span>
        </div>
        <button class="indexer-btn" :disabled="indexing" @click="startIndex">
          {{ indexing ? '⏳ 索引中...' : '🔄 手动索引' }}
        </button>
      </div>

      <!-- 标签页切换 -->
      <div class="tabs">
        <div
          class="tab"
          :class="{ active: activeTab === 'search' }"
          @click="activeTab = 'search'"
        >🔍 搜索</div>
        <div
          class="tab"
          :class="{ active: activeTab === 'daily' }"
          @click="activeTab = 'daily'"
        >📊 日报</div>
        <div
          class="tab"
          :class="{ active: activeTab === 'weekly' }"
          @click="activeTab = 'weekly'"
        >📅 周报</div>
      </div>

      <!-- 搜索 -->
      <div v-show="activeTab === 'search'" class="card">
        <div class="search-box">
          <input
            v-model="searchQuery"
            class="search-input"
            placeholder="输入关键词搜索笔记..."
            
          >
          <button class="search-btn" @click="performSearch">搜索</button>
        </div>
        <div class="search-results">
          <div v-if="searchResults.length === 0 && searchQuery" class="empty-state">
            未找到相关结果
          </div>
          <div
            v-for="result in searchResults"
            :key="result.id"
            class="search-item"
            @click="openResult(result)"
          >
            <div class="search-item-title">{{ result.title }}</div>
            <div class="search-item-path">{{ result.path }}</div>
            <div class="search-item-preview">{{ result.preview }}</div>
          </div>
        </div>
      </div>

      <!-- 日报 -->
      <div v-show="activeTab === 'daily'" class="card">
        <div class="report-header-bar">
          <h3 class="card-title">📊 综合日报</h3>
          <span class="report-schedule">{{ reportScheduleText }}</span>
        </div>
        <div v-if="reports.length" class="report-list">
          <div
            v-for="(r, i) in reports"
            :key="r.id"
            class="report-item"
            :class="{ active: expandedReport === i }"
            @click="toggleReport(i, r)"
          >
            <div class="report-header">
              <span class="report-date">{{ r.report_date || '日报' }}</span>
              <span class="report-toggle">{{ expandedReport === i ? '▾' : '▸' }}</span>
            </div>
            <div class="report-summary">{{ (r.summary || '').slice(0, 100) }}</div>
            <div class="report-time">{{ r.created_at }}</div>
            <div v-if="expandedReport === i" class="report-detail">
              <div class="preview" v-html="renderMarkdown(reportDetail)"></div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-icon">📊</div>
          <div class="empty-title">暂无日报</div>
          <div class="empty-desc">{{ reportScheduleText }}</div>
        </div>
      </div>

      <!-- 周报 -->
      <div v-show="activeTab === 'weekly'" class="card">
        <div class="report-header-bar">
          <h3 class="card-title">📅 综合周报</h3>
        </div>
        <div v-if="weeklyReports.length" class="report-list">
          <div
            v-for="(r, i) in weeklyReports"
            :key="r.id"
            class="report-item"
            :class="{ active: expandedWeeklyReport === i }"
            @click="toggleWeeklyReport(i, r)"
          >
            <div class="report-header">
              <span class="report-date">{{ r.report_date || '周报' }}</span>
              <span class="report-toggle">{{ expandedWeeklyReport === i ? '▾' : '▸' }}</span>
            </div>
            <div class="report-summary">{{ (r.summary || '').slice(0, 100) }}</div>
            <div class="report-time">{{ r.created_at }}</div>
            <div v-if="expandedWeeklyReport === i" class="report-detail">
              <div class="preview" v-html="renderMarkdown(weeklyReportDetail)"></div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-icon">📅</div>
          <div class="empty-title">暂无周报</div>
          <div class="empty-desc">周报功能待启用</div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const API = window.electronAPI;

const activeTab = ref('search');
const selectedKb = ref('');
const kbList = ref<any[]>([]);
const searchQuery = ref('');
const searchResults = ref<any[]>([]);
const indexing = ref(false);
const indexProgress = ref('就绪');
const indexPhase = ref('idle');
const indexerInfo = ref({ model: '', host: '', docCount: 0, chunkCount: 0, running: false });

const stats = ref({
  fileCount: 0,
  chunkCount: 0,
  todayModified: 0,
  projectCount: 0,
  totalChats: 0
});

const reports = ref<any[]>([]);
const expandedReport = ref<number | null>(null);
const reportDetail = ref('');
const reportCron = ref('');

const weeklyReports = ref<any[]>([]);
const expandedWeeklyReport = ref<number | null>(null);
const weeklyReportDetail = ref('');

const reportScheduleText = computed(() => {
  if (reportCron.value) {
    const parts = reportCron.value.split(' ');
    if (parts.length >= 2) {
      const hour = parts[1].padStart(2, '0');
      const min = parts[0].padStart(2, '0');
      return `每日 ${hour}:${min} 自动生成综合日报`;
    }
  }
  return '每日自动生成综合日报';
});

// ========== 工具函数 ==========
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

// ========== 搜索 ==========
const performSearch = async () => {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = [];
    return;
  }
  try {
    const results = await API.kb.search("", query);
    searchResults.value = results.map((r: any, i: number) => ({
      id: i,
      title: r.source ? r.source.split(/[\\/]/).pop() : '未知',
      path: r.source || '',
      preview: (r.text || '').slice(0, 200),
      score: r.score ? (r.score * 100).toFixed(1) + '%' : '0%'
    }));
  } catch {
    searchResults.value = [];
  }
};

const openResult = (result: any) => {
};

// ========== 笔记库切换 ==========
const onKbChange = async () => {
  searchResults.value = [];
  await loadDailyReports();
  await loadWeeklyReports();
};

// ========== 日报折叠/展开 ==========
function toggleReport(i: number, r: any) {
  if (expandedReport.value === i) {
    expandedReport.value = null;
  } else {
    expandedReport.value = i;
    reportDetail.value = r.content || '无内容';
  }
}

// ========== 周报折叠/展开 ==========
function toggleWeeklyReport(i: number, r: any) {
  if (expandedWeeklyReport.value === i) {
    expandedWeeklyReport.value = null;
  } else {
    expandedWeeklyReport.value = i;
    weeklyReportDetail.value = r.content || '无内容';
  }
}

// ========== 加载数据 ==========
async function loadDailyReports() {
  try {
    reports.value = await API.insights.reports();
    if (reports.value.length && expandedReport.value === null) {
      expandedReport.value = 0;
      reportDetail.value = reports.value[0].content || '无内容';
    }
  } catch { reports.value = []; }
}

async function loadWeeklyReports() {
  try {
    weeklyReports.value = await API.insights.weeklyReports();
  } catch { weeklyReports.value = []; }
}

async function clearIndex() {
  if (!confirm('确定清空所有索引数据？')) return;
  try {
    await API.insights.clearIndex();
    stats.value = { fileCount: 0, chunkCount: 0, projectCount: stats.value.projectCount, totalChats: stats.value.totalChats, todayModified: 0 };
    indexerInfo.value.docCount = 0;
    indexerInfo.value.chunkCount = 0;
  } catch {}
}

async function loadIndexerInfo() {
  try {
    indexerInfo.value = await API.insights.indexerInfo();
  } catch {}
}

async function startIndex() {
  indexing.value = true;
  indexPhase.value = 'scan';
  indexProgress.value = '准备开始...';

  const onProgress = (data: any) => {
    if (data.phase === 'scan') {
      indexPhase.value = 'scan';
      indexProgress.value = `扫描文件 ${data.current}/${data.total}: ${data.file}`;
      stats.value.fileCount = data.total;
      indexerInfo.value.docCount = data.total;
    } else if (data.phase === 'embed') {
      indexPhase.value = 'embed';
      indexProgress.value = `向量化 ${data.current}/${data.total} 片段`;
      stats.value.chunkCount = data.total;
    } else if (data.phase === 'done') {
      indexPhase.value = 'idle';
      indexProgress.value = '索引完成 ✓';
    }
  };
  API.on('indexer:progress', onProgress);

  try {
    await API.service.indexAll();
    await loadIndexerInfo();
  } catch {}
  indexing.value = false;
  API.removeAllListeners('indexer:progress');
  setTimeout(() => { indexProgress.value = '就绪'; }, 3000);
}

onMounted(async () => {
  try {
    stats.value = await API.insights.stats();
  } catch {}
  try {
    const list = await API.kb.list();
    kbList.value = list;
  } catch {}
  await loadDailyReports();
  await loadWeeklyReports();
  await loadIndexerInfo();
  // Load task list to get daily report schedule time
  try {
    const tasks = await API.task.list();
    const dailyReport = tasks.find((t: any) => t.task_type === 'daily_report');
    if (dailyReport && dailyReport.cron_expression) {
      reportCron.value = dailyReport.cron_expression;
    }
  } catch {}
});
</script>

<style scoped>
.insights-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.content-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  background: white;
}

.content-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.kb-select-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-select {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  outline: none;
  background: white;
  color: var(--text-primary);
  cursor: pointer;
}

.kb-select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  padding: 20px;
  display: flex;
  flex-direction: column;
  transition: all 0.2s;
}

.stat-card:hover {
  box-shadow: var(--shadow-md);
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin-bottom: 12px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.card {
  background: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  padding: 24px;
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.search-box {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 14px;
  outline: none;
  background: white;
}

.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.search-btn {
  padding: 10px 20px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.search-btn:hover {
  background: var(--primary-dark);
}

.search-btn:active {
  transform: scale(0.98);
}

.search-results {
  max-height: 300px;
  overflow-y: auto;
}

.search-item {
  padding: 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.search-item:hover {
  background: var(--hover);
  border-color: var(--primary);
}

.search-item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.search-item-path {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

/* 标签页 */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--bg-main);
  border-radius: var(--radius-md);
  padding: 4px;
  border: 1px solid var(--border);
}
.tab {
  flex: 1;
  text-align: center;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}
.tab:hover { color: var(--text-primary); background: rgba(0,0,0,0.03); }
.tab.active { background: white; color: var(--primary); box-shadow: var(--shadow-sm); }

/* 报告头部 */
.report-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.report-schedule {
  font-size: 12px;
  color: var(--text-muted);
}

/* 索引信息 */
.indexer-card {
  background: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  padding: 16px 20px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 20px;
}
.indexer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.indexer-label {
  font-size: 12px;
  color: var(--text-muted);
}
.indexer-value {
  font-size: 13px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.indexer-stats {
  font-size: 12px;
  color: var(--text-muted);
}
.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
}
.badge-running {
  background: rgba(251, 191, 36, 0.15);
  color: #d97706;
}
.badge-gray { background: rgba(148,163,184,0.1); color: #94a3b8; }
.badge-idle {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}
.indexer-btn {
  margin-left: auto;
  padding: 8px 16px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.indexer-btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}
.indexer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-item-preview {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.search-score {
  font-size: 11px;
  color: var(--text-muted);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.empty-desc {
  font-size: 13px;
  color: var(--text-muted);
}

/* 日报列表 */
.report-list { display: flex; flex-direction: column; gap: 6px; }
.report-item { padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; transition: all 0.15s; }
.report-item:hover { border-color: var(--primary); }
.report-item.active { border-color: var(--primary); background: rgba(99,102,241,0.03); }
.report-header { display: flex; align-items: center; justify-content: space-between; }
.report-date { font-size: 14px; font-weight: 600; color: var(--primary); }
.report-toggle { font-size: 12px; color: var(--text-muted); }
.report-summary { font-size: 13px; color: var(--text-secondary); margin-top: 4px; line-height: 1.4; }
.report-time { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.report-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.report-detail .preview { font-size: 13px; line-height: 1.8; }

</style>
