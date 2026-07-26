<template>
  <div class="insights-view">
    <div class="content-header">
      <h1 class="content-title">洞察</h1>
      <div class="kb-select-wrapper">
        <select class="kb-select" v-model="selectedKb" @change="onKbChange">
          <option value="">全部笔记库</option>
          <option v-for="kb in kbList" :key="kb.id" :value="kb.id">{{ kb.name }}</option>
        </select>
      </div>
    </div>
    
    <div class="content-body">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(99,102,241,0.1);color:#6366f1;">📚</div>
          <div class="stat-value">{{ stats.fileCount }}</div>
          <div class="stat-label">笔记文件数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background:rgba(34,197,94,0.1);color:#22c55e;">🔍</div>
          <div class="stat-value">{{ stats.chunkCount }}</div>
          <div class="stat-label">索引片段数</div>
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

      <!-- 搜索 -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🔍 智能搜索</h3>
        </div>
        <div class="search-box">
          <input
            v-model="searchQuery"
            class="search-input"
            placeholder="输入关键词搜索..."
            @keydown.enter="performSearch"
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
            <div class="search-score">匹配度: {{ result.score }}</div>
          </div>
        </div>
      </div>

      <!-- 综合日报 -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">📊 综合日报</h3>
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

      <!-- 子项目分析 -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">📂 子项目分析</h3>
          <span style="font-size:12px;color:#94a3b8;">共 {{ projects.length }} 个项目</span>
        </div>
        <div class="project-list">
          <div
            v-for="(project, index) in projects"
            :key="index"
            class="project-card"
            @click="toggleProject(index)"
          >
            <div class="project-header">
              <span class="project-name">{{ project.name }}</span>
              <span class="project-status" :class="project.hasAnalysis ? 'analyzed' : 'not-analyzed'">
                {{ project.hasAnalysis ? '已分析' : '未分析' }}
              </span>
            </div>
            <div class="project-info">
              <span>📄 {{ project.fileCount }} 文件</span>
              <span>📁 {{ formatSize(project.totalSize) }}</span>
            </div>
            <div class="project-detail" :class="{ active: expandedProject === index }">
              <div v-if="project.analysis" class="project-analysis" v-html="renderMarkdown(project.analysis)"></div>
              <button
                v-else
                class="project-btn primary"
                @click.stop="analyzeProject(project.name)"
              >
                🔍 AI分析
              </button>
            </div>
          </div>
        </div>
        <div v-if="projects.length === 0" class="empty-state">
          <div class="empty-icon">📂</div>
          <div class="empty-title">暂无子项目</div>
          <div class="empty-desc">在笔记库中创建文件夹即可作为子项目</div>
        </div>
      </div>

      <!-- 标签云 -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🏷️ 知识标签</h3>
        </div>
        <div class="tag-cloud">
          <span
            v-for="(tag, index) in tags"
            :key="index"
            class="tag-item"
            :style="getTagStyle(tag.count)"
            @click="searchQuery = tag.name; performSearch()"
          >
            {{ tag.name }}
          </span>
        </div>
        <div v-if="tags.length === 0" class="empty-state">
          <div class="empty-icon">🏷️</div>
          <div class="empty-title">暂无标签</div>
          <div class="empty-desc">标签将从笔记内容中自动提取</div>
        </div>
      </div>

      <!-- 热力图 -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🔥 活动热力图</h3>
        </div>
        <div class="heatmap-grid">
          <div
            v-for="(count, date) in heatmap"
            :key="date"
            class="heatmap-cell"
            :style="{ background: getHeatmapColor(count) }"
            :title="date + ': ' + count + '次修改'"
          ></div>
        </div>
        <div class="heatmap-legend">
          <span>少</span>
          <div class="heatmap-legend-cell" style="background:#ebedf0;"></div>
          <div class="heatmap-legend-cell" style="background:#c6e48b;"></div>
          <div class="heatmap-legend-cell" style="background:#7bc96f;"></div>
          <div class="heatmap-legend-cell" style="background:#239a3b;"></div>
          <div class="heatmap-legend-cell" style="background:#196127;"></div>
          <span>多</span>
        </div>
      </div>

      <!-- AI 快速操作 -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🎯 AI 学习助手</h3>
        </div>
        <div class="action-grid">
          <div class="action-card" @click="runQuickAction('summarize-week')">
            <div class="action-icon">📅</div>
            <div class="action-title">周总结</div>
            <div class="action-desc">自动生成本周学习总结</div>
            <div class="action-result" :class="{ active: quickActionResult['summarize-week'] }">
              <div v-html="renderMarkdown(quickActionResult['summarize-week'])"></div>
            </div>
          </div>
          <div class="action-card" @click="runQuickAction('extract-key-points')">
            <div class="action-icon">🔑</div>
            <div class="action-title">知识提取</div>
            <div class="action-desc">提取笔记中的关键知识点</div>
            <div class="action-result" :class="{ active: quickActionResult['extract-key-points'] }">
              <div v-html="renderMarkdown(quickActionResult['extract-key-points'])"></div>
            </div>
          </div>
          <div class="action-card" @click="runQuickAction('generate-review-plan')">
            <div class="action-icon">📋</div>
            <div class="action-title">复习计划</div>
            <div class="action-desc">生成个性化复习计划</div>
            <div class="action-result" :class="{ active: quickActionResult['generate-review-plan'] }">
              <div v-html="renderMarkdown(quickActionResult['generate-review-plan'])"></div>
            </div>
          </div>
          <div class="action-card" @click="runQuickAction('find-related')">
            <div class="action-icon">🔗</div>
            <div class="action-title">知识关联</div>
            <div class="action-desc">发现相关知识点和主题</div>
            <div class="action-result" :class="{ active: quickActionResult['find-related'] }">
              <div v-html="renderMarkdown(quickActionResult['find-related'])"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const API = window.electronAPI;

const selectedKb = ref('');
const kbList = ref<any[]>([]);
const searchQuery = ref('');
const searchResults = ref<any[]>([]);

const stats = ref({
  fileCount: 0,
  chunkCount: 0,
  todayModified: 0,
  totalChats: 0
});

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
      return `每日 ${hour}:${min} 自动生成综合日报`;
    }
  }
  return '每日自动生成综合日报';
});

// ========== 项目、标签、热力图 ==========
const projects = ref<any[]>([]);
const tags = ref<any[]>([]);
const heatmap = ref<any>({});
const expandedProject = ref<number | null>(null);

// ========== 快速操作 ==========
const quickActionResult = ref<Record<string, string>>({});

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

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getTagStyle(count: number) {
  const maxCount = tags.value.length > 0 ? Math.max(...tags.value.map(t => t.count)) : 1;
  const ratio = count / maxCount;
  const fontSize = `${12 + ratio * 6}px`;
  const hue = 250 + ratio * 30;
  const saturation = 40 + ratio * 20;
  const lightness = 90 - ratio * 15;
  return {
    fontSize,
    background: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    color: ratio > 0.5 ? '#6366f1' : '#64748b'
  };
}

function getHeatmapColor(count: number): string {
  if (count === 0) return '#ebedf0';
  if (count <= 2) return '#c6e48b';
  if (count <= 5) return '#7bc96f';
  if (count <= 10) return '#239a3b';
  return '#196127';
}

// ========== 搜索 ==========
const performSearch = async () => {
};

const openResult = (result: any) => {
};

// ========== 笔记库切换 ==========
const onKbChange = async () => {
  searchResults.value = [];
  expandedProject.value = null;
};

// ========== 项目折叠/展开 ==========
function toggleProject(index: number) {
  expandedProject.value = expandedProject.value === index ? null : index;
}

function toggleReport(i: number, r: any) {
  if (expandedReport.value === i) {
    expandedReport.value = null;
  } else {
    expandedReport.value = i;
    reportDetail.value = r.content || '无内容';
  }
}

// ========== AI 分析项目 ==========
async function analyzeProject(projectName: string) {
}

// ========== AI 快速操作 ==========
async function runQuickAction(action: string) {
  quickActionResult.value[action] = '功能不可用（后端未连接）';
}

onMounted(async () => {
  try {
    stats.value = await API.insights.stats();
  } catch {}
  try {
    const list = await API.kb.list();
    kbList.value = list;
  } catch {}
  try {
    reports.value = await API.insights.reports();
    if (reports.value.length) {
      expandedReport.value = 0;
      reportDetail.value = reports.value[0].content || '无内容';
    }
  } catch {}
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

/* 项目分析 */
.project-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
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

.project-card {
  background: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.project-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
}

.project-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.project-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.project-status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.project-status.analyzed {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.project-status.not-analyzed {
  background: rgba(148, 163, 184, 0.1);
  color: #94a3b8;
}

.project-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.project-detail {
  display: none;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.project-detail.active {
  display: block;
}

.project-analysis {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.project-btn {
  padding: 6px 12px;
  font-size: 12px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.project-btn.primary {
  background: var(--primary);
  color: white;
}

.project-btn.primary:hover {
  background: var(--primary-dark);
}

/* 标签云 */
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-item:hover {
  transform: scale(1.05);
}

/* 热力图 */
.heatmap-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.heatmap-cell {
  width: 14px;
  height: 14px;
  border-radius: 2px;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  font-size: 11px;
  color: var(--text-muted);
}

.heatmap-legend-cell {
  width: 14px;
  height: 14px;
  border-radius: 2px;
}

/* AI 快速操作 */
.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.action-card {
  background: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.action-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
}

.action-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.action-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.action-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.action-result {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-main);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  display: none;
}

.action-result.active {
  display: block;
}
</style>
