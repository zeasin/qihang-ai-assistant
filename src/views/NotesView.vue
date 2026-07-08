<template>
  <div class="notes-view">
    <div class="content-header">
      <h1 class="content-title">笔记</h1>
      <div class="content-actions">
        <select class="kb-select" v-model="selectedKb" @change="onKbChange">
          <option v-for="kb in kbList" :key="kb.id" :value="kb.id">{{ kb.name }}</option>
        </select>
      </div>
    </div>
    
    <div class="content-body">
      <div class="notes-container">
        <div class="file-tree">
          <div class="tree-header">
            <div class="tree-header-row">
              <span class="tree-title">文件</span>
              <button class="refresh-btn" @click="refreshTree">🔄</button>
            </div>
          </div>
          <div class="tree-body">
            <div v-if="fileTree.length === 0" class="tree-empty">暂无笔记</div>
            <div v-else>
              <div 
                v-for="item in fileTree" 
                :key="item.path" 
                class="tree-item"
                :class="{ active: selectedFile?.path === item.path }"
                @click="selectFile(item)"
              >
                <span class="tree-icon">{{ item.type === 'folder' ? '📁' : '📄' }}</span>
                <span class="tree-name">{{ item.name }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="note-preview">
          <div v-if="selectedFile" class="preview-header">
            <div>
              <div class="preview-title">{{ selectedFile.name }}</div>
              <div class="preview-path">{{ selectedFile.path }}</div>
            </div>
            <div class="preview-actions">
              <button class="btn btn-secondary btn-sm" @click="copyPath">复制路径</button>
              <button class="btn btn-primary btn-sm" @click="openInEditor">在编辑器中打开</button>
            </div>
          </div>
          <div class="preview-content" v-html="renderedContent"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { marked } from 'marked';

const selectedKb = ref<number | null>(null);
const kbList = ref<any[]>([]);
const fileTree = ref<any[]>([]);
const selectedFile = ref<any>(null);
const fileContent = ref('');
const hasKb = ref(true);

const renderedContent = computed(() => {
  if (!fileContent.value) return '<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">选择笔记文件</div><div class="empty-desc">在左侧文件树中选择一个 Markdown 文件查看内容</div></div>';
  try {
    return marked(fileContent.value);
  } catch (e) {
    return '<pre>' + escapeHtml(fileContent.value) + '</pre>';
  }
});

// ========== 加载笔记库 ==========
async function loadKbList() {
  try {
    const r = await fetch(`/api/chat/kbs`);
    const d = await r.json();
    if (d.ok && d.data && d.data.length > 0) {
      kbList.value = d.data;
      hasKb.value = true;
      selectedKb.value = d.data[0].id;
      await loadFileTree();
    } else {
      hasKb.value = false;
    }
  } catch (e) {
    console.error('加载笔记库失败:', e);
    hasKb.value = false;
  }
}

// ========== 加载文件树 ==========
async function loadFileTree() {
  if (!selectedKb.value) return;
  try {
    const r = await fetch(`/v3/api/notes/tree?kbId=${selectedKb.value}`);
    const d = await r.json();
    if (d.ok && d.tree) {
      fileTree.value = flattenTree(d.tree);
    } else {
      fileTree.value = [];
    }
  } catch (e) {
    console.error('加载文件树失败:', e);
    fileTree.value = [];
  }
}

function flattenTree(tree: any): any[] {
  const items: any[] = [];
  function walk(node: any, path: string) {
    if (node.dirs) {
      node.dirs.forEach((dir: any) => {
        items.push({ name: dir.name, path: path + '/' + dir.name, type: 'folder' });
        if (dir.children) {
          walk(dir.children, path + '/' + dir.name);
        }
      });
    }
    if (node.files) {
      node.files.forEach((file: any) => {
        items.push({ name: file.name, path: file.path || path + '/' + file.name, type: 'file' });
      });
    }
  }
  walk(tree, '');
  return items;
}

// ========== 加载文件内容 ==========
async function selectFile(item: any) {
  if (item.type === 'folder') return;
  selectedFile.value = item;
  try {
    const r = await fetch(`/v3/api/notes/read?kbId=${selectedKb.value}&path=${encodeURIComponent(item.path)}`);
    const d = await r.json();
    if (d.ok && d.content) {
      fileContent.value = d.content;
    } else {
      fileContent.value = '⚠️ 读取失败: ' + (d.error || '未知错误');
    }
  } catch (e: any) {
    fileContent.value = '⚠️ 读取失败: ' + e.message;
  }
}

// ========== 刷新 ==========
const onKbChange = async () => {
  selectedFile.value = null;
  fileContent.value = '';
  fileTree.value = [];
  await loadFileTree();
};

const refreshTree = async () => {
  await loadFileTree();
};

const copyPath = () => {
  if (selectedFile.value) {
    navigator.clipboard.writeText(selectedFile.value.path);
  }
};

const openInEditor = () => {
  if (selectedFile.value && selectedKb.value) {
    // 可以在这里触发 Electron 打开文件
    console.log('Open in editor:', selectedFile.value.path);
  }
};

function escapeHtml(text: string): string {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = String(text);
  return d.innerHTML;
}

onMounted(() => {
  loadKbList();
});
</script>

<style scoped>
.notes-view {
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
  overflow: hidden;
  display: flex;
}

.notes-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.file-tree {
  width: 320px;
  background: white;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.tree-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tree-header-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tree-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}

.kb-select {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  outline: none;
  background: white;
  color: var(--text-primary);
  cursor: pointer;
}

.kb-select:focus {
  border-color: var(--primary);
}

.refresh-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--text-muted);
  padding: 2px;
}

.refresh-btn:hover {
  color: var(--primary);
}

.tree-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-item:hover {
  background: var(--hover);
}

.tree-item.active {
  background: rgba(99, 102, 241, 0.1);
  color: var(--primary);
}

.tree-icon {
  font-size: 14px;
  flex-shrink: 0;
  width: 18px;
  text-align: center;
}

.tree-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.note-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-main);
}

.preview-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: white;
  flex-shrink: 0;
}

.preview-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.preview-path {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.preview-actions {
  display: flex;
  gap: 6px;
}

.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 32px 48px;
  font-size: 14px;
  line-height: 1.85;
  color: var(--text-primary);
  background: white;
}

.preview-content :deep(h1) {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border);
}

.preview-content :deep(h2) {
  font-size: 22px;
  font-weight: 600;
  margin: 32px 0 16px;
  padding-left: 12px;
  border-left: 4px solid var(--primary);
}

.preview-content :deep(h3) {
  font-size: 18px;
  font-weight: 600;
  margin: 24px 0 12px;
}

.preview-content :deep(p) {
  margin-bottom: 16px;
}

.preview-content :deep(code) {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: "SF Mono", "Fira Code", monospace;
  font-size: 13px;
  color: var(--primary-dark);
}

.preview-content :deep(pre) {
  background: #1e293b;
  color: #e2e8f0;
  padding: 16px 20px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  margin: 16px 0;
  font-size: 13px;
  line-height: 1.6;
}

.preview-content :deep(pre code) {
  background: none;
  color: inherit;
  padding: 0;
  font-size: inherit;
}
</style>
