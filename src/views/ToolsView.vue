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
          <div class="tool-target">→ {{ tool.target }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

interface Tool {
  id: number;
  name: string;
  description: string;
  icon: string;
  target: string;
  action: string;
}

const tools = ref<Tool[]>([
  { id: 1, name: '通用识别', description: '上传图片，AI 自动识别内容并分析，支持多种场景。', icon: '🖼️', target: '打开 AI 对话', action: '/chat?prompt=请识别这张图片的内容并给出分析。' },
  { id: 2, name: '识题', description: '粘贴题目图片，AI 给出详细解答过程和答案。', icon: '❓', target: '打开 AI 对话', action: '/chat?prompt=请解答这道题目：' },
  { id: 3, name: '试卷识别', description: '上传整张试卷图片，AI 提取全部题目并逐一解答。', icon: '📝', target: '打开 AI 对话', action: '/chat?prompt=请识别这张试卷图片，提取所有题目并逐一给出解答。' },
  { id: 4, name: '数据导入', description: '从 JSON 粘贴或 URL 远程地址批量导入数据到数据集。', icon: '📥', target: '打开数据页导入', action: '/data?action=import' },
  { id: 5, name: '数据采集', description: '从网页/API 拉取 JSON 数据，自动写入数据集（URL 导入）。', icon: '🔧', target: '打开数据页导入', action: '/data?action=import' },
  { id: 6, name: '数据加工', description: '管理数据集：筛选、编辑、删除记录，自定义 Schema。', icon: '📋', target: '打开数据页', action: '/data' },
]);

const router = useRouter();

const openTool = (tool: Tool) => {
  const [path, query] = tool.action.split('?');
  const params: Record<string, string> = {};
  if (query) {
    for (const kv of query.split('&')) {
      const [k, v] = kv.split('=');
      if (k && v !== undefined) params[k] = decodeURIComponent(v);
    }
  }
  router.push({ path, query: Object.keys(params).length ? params : undefined });
};
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
  margin-bottom: 8px;
}

.tool-target {
  font-size: 12px;
  color: var(--primary);
}
</style>
