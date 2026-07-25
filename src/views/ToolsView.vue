<template>
  <div class="tools-view">
    <div class="content-header">
      <h1 class="content-title">工具</h1>
    </div>
    
    <div class="content-body">
      <div class="tools-grid">
        <div 
          v-for="tool in tools" 
          :key="tool.id" 
          class="tool-card"
          @click="openTool(tool)"
        >
          <div class="tool-icon">{{ tool.icon }}</div>
          <div class="tool-name">{{ tool.name }}</div>
          <div class="tool-desc">{{ tool.description }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface Tool {
  id: number;
  name: string;
  description: string;
  icon: string;
  action: string;
}

const tools = ref<Tool[]>([]);

// ========== 默认工具列表 ==========
const defaultTools: Tool[] = [
  { id: 1, name: '通用识别', description: '上传图片，AI 自动识别内容并分析。支持多种场景。', icon: '🖼️', action: 'image/general' },
  { id: 2, name: '识题', description: '拍照上传题目，AI 给出详细解答过程和答案。', icon: '❓', action: 'image/solve' },
  { id: 3, name: '试卷识别', description: '识别整张试卷，自动提取题目、答案、解析。', icon: '📝', action: 'image/exam' },
  { id: 4, name: '数据导入', description: '从外部导入数据到笔记库，支持 JSON、CSV 等格式。', icon: '📥', action: 'data/import' },
  { id: 5, name: '数据采集', description: '从网页或 API 自动采集数据，定时执行。', icon: '🔧', action: 'data/collector' },
  { id: 6, name: '数据加工', description: '对采集的数据进行清洗、转换、标准化处理。', icon: '📋', action: 'data/processing' }
];

// ========== 加载工具列表 ==========
async function loadTools() {
  tools.value = defaultTools;
}

// ========== 打开工具 ==========
const openTool = (tool: Tool) => {
  // 使用路由导航或打开新窗口
  window.open(`/${tool.action}`, '_blank');
};

onMounted(() => {
  loadTools();
});
</script>

<style scoped>
.tools-view {
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

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.tool-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.tool-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.tool-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.tool-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.tool-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}
</style>
