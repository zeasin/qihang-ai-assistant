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
import { ref, onMounted } from 'vue';
import { marked } from 'marked';

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
  try {
    return marked(text);
  } catch (e) {
    return text.replace(/\n/g, '<br>');
  }
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

// ========== AI 分析项目 ==========
async function analyzeProject(projectName: string) {
}

// ========== AI 快速操作 ==========
async function runQuickAction(action: string) {
  quickActionResult.value[action] = '功能不可用（后端未连接）';
}

onMounted(() => {
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
