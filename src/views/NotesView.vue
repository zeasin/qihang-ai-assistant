<template>
  <div class="notes-view">
    <div class="content-header">
      <h1 class="content-title">笔记库</h1>
      <div class="header-actions">
        <div class="kb-select-group">
          <select class="form-control" v-model="selectedKbId" @change="onKbChange">
            <option v-for="kb in kbList" :key="kb.id" :value="kb.id">
              {{ kb.name }}{{ kb.is_default ? ' ★' : '' }}
            </option>
          </select>
          <button class="btn btn-sm btn-secondary" @click="toggleDefaultKb" :disabled="!selectedKbId || isDefault(selectedKbId)" title="设为默认">
            ★ 设为默认
          </button>
          <button class="btn btn-sm btn-warning" v-if="isDefault(selectedKbId)" @click="clearDefaultKb" title="取消默认">☆</button>
          <button class="btn btn-sm btn-secondary" @click="startAddKb" title="添加笔记库">+</button>
          <button class="btn btn-sm btn-danger" @click="removeKb" :disabled="!selectedKbId" title="删除笔记库">−</button>
        </div>
        <button class="btn btn-secondary" @click="refreshTree">刷新</button>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ modalStep === 'folder' ? '选择文件夹' : '命名笔记库' }}</h3>
        </div>
        <div class="modal-body">
          <template v-if="modalStep === 'folder'">
            <p class="text-muted">选择一个包含 Markdown 文件的文件夹作为笔记库。</p>
            <div class="folder-picker">
              <input v-model="selectedPath" class="form-control" placeholder="文件夹路径" readonly>
              <button class="btn btn-primary" @click="pickFolder">选择文件夹</button>
            </div>
          </template>
          <template v-if="modalStep === 'name'">
            <p class="text-muted">为笔记库起一个名字：</p>
            <input v-model="newKbName" class="form-control" placeholder="例如：工作笔记、学习笔记..." @keyup.enter="confirmAddKb" autofocus>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button v-if="modalStep === 'folder'" class="btn btn-primary" :disabled="!selectedPath" @click="modalStep = 'name'">下一步</button>
          <button v-if="modalStep === 'name'" class="btn btn-primary" :disabled="!newKbName.trim()" @click="confirmAddKb">确认添加</button>
        </div>
      </div>
    </div>

    <div class="content-body">
      <div v-if="!selectedKbId" class="empty-state">
        <div style="font-size:48px;margin-bottom:16px;">📚</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">还没有笔记库</div>
        <div class="text-muted" style="margin-bottom:16px;">添加一个 Markdown 文件夹作为笔记库</div>
        <button class="btn btn-primary" @click="startAddKb">添加笔记库</button>
      </div>
      <div v-else class="notes-container">
        <div class="file-tree">
          <div class="tree-body">
            <div v-if="treeData.length === 0" class="tree-empty">暂无文件</div>
            <TreeNode v-else v-for="node in treeData" :key="node.path" :node="node" :depth="0" @select="selectFile" />
          </div>
        </div>

        <div class="note-preview">
          <div v-if="selectedFile" class="preview-header">
            <div>
              <div class="preview-title">{{ selectedFile.name }}</div>
              <div class="preview-path">{{ selectedFile.path }}</div>
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
import TreeNode from '@/components/TreeNode.vue';

const API = window.electronAPI;

const kbList = ref<any[]>([]);
const selectedKbId = ref('');
const treeData = ref<TreeNode[]>([]);
const selectedFile = ref<any>(null);
const fileContent = ref('');

const showModal = ref(false);
const modalStep = ref<'folder' | 'name'>('folder');
const selectedPath = ref('');
const newKbName = ref('');

const renderedContent = computed(() => {
  if (!fileContent.value) return '<div class="empty-state"><div style="font-size:48px;margin-bottom:16px;">📄</div><div style="font-size:15px;font-weight:600;">选择笔记文件</div><div class="text-muted">在左侧文件树中选择一个 Markdown 文件查看内容</div></div>';
  try {
    return marked(fileContent.value);
  } catch {
    return '<pre>' + escapeHtml(fileContent.value) + '</pre>';
  }
});

async function loadKbList() {
  try {
    const list = await API.kb.list();
    kbList.value = list;
    if (list.length > 0) {
      if (!selectedKbId.value || !list.find((k: any) => k.id === selectedKbId.value)) {
        selectedKbId.value = list[0].id;
      }
      await loadFileTree();
    } else {
      selectedKbId.value = '';
    }
  } catch (e) {
    console.warn('加载笔记库失败:', e);
  }
}

async function loadFileTree() {
  if (!selectedKbId.value) return;
  try {
    treeData.value = await API.notes.tree(selectedKbId.value);
  } catch (e) {
    console.warn('加载文件树失败:', e);
    treeData.value = [];
  }
}

async function selectFile(item: TreeNode) {
  if (item.type === 'folder') return;
  selectedFile.value = item;
  try {
    const result = await API.notes.read(selectedKbId.value, item.path);
    if (result.ok) {
      fileContent.value = result.content;
    } else {
      fileContent.value = '⚠️ 读取失败: ' + (result.error || '未知错误');
    }
  } catch (e: any) {
    fileContent.value = '⚠️ 读取失败: ' + e.message;
  }
}

function startAddKb() {
  showModal.value = true;
  modalStep.value = 'folder';
  selectedPath.value = '';
  newKbName.value = '';
}

async function pickFolder() {
  const dir = await API.dialog.openDirectory();
  if (dir) selectedPath.value = dir;
}

async function confirmAddKb() {
  if (!selectedPath.value || !newKbName.value.trim()) return;
  try {
    await API.kb.add(newKbName.value.trim(), selectedPath.value);
    closeModal();
    await loadKbList();
  } catch (e: any) {
    console.warn('添加失败:', e);
  }
}

function closeModal() {
  showModal.value = false;
  modalStep.value = 'folder';
  selectedPath.value = '';
  newKbName.value = '';
}

async function removeKb() {
  if (!selectedKbId.value) return;
  try {
    await API.kb.remove(selectedKbId.value);
    selectedKbId.value = '';
    selectedFile.value = null;
    fileContent.value = '';
    await loadKbList();
  } catch (e: any) {
    console.warn('删除失败:', e);
  }
}

function isDefault(kbId: string) {
  const kb = kbList.value.find((k: any) => k.id === kbId);
  return kb?.is_default === 1 || kb?.is_default === true;
}

async function toggleDefaultKb() {
  if (!selectedKbId.value) return;
  await API.kb.setDefault(selectedKbId.value);
  await loadKbList();
}

async function clearDefaultKb() {
  await API.kb.setDefault(null);
  await loadKbList();
}

const onKbChange = async () => {
  selectedFile.value = null;
  fileContent.value = '';
  treeData.value = [];
  await loadFileTree();
};

const refreshTree = async () => {
  await loadFileTree();
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
.notes-view { display: flex; flex-direction: column; height: 100%; }
.content-header { padding: 12px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; background: white; }
.content-title { font-size: 18px; font-weight: 600; color: var(--text-primary); }
.header-actions { display: flex; align-items: center; gap: 8px; }
.kb-select-group { display: flex; align-items: center; gap: 4px; }
.content-body { flex: 1; overflow: hidden; display: flex; justify-content: center; align-items: flex-start; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); padding: 40px; }
.notes-container { display: flex; flex: 1; height: 100%; overflow: hidden; }
.file-tree { width: 300px; background: white; border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto; }
.tree-body { padding: 8px 0; }
.tree-empty { text-align: center; padding: 40px 16px; color: var(--text-muted); font-size: 13px; }
.note-preview { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-main); }
.preview-header { padding: 12px 24px; border-bottom: 1px solid var(--border); background: white; flex-shrink: 0; }
.preview-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.preview-path { font-size: 12px; color: var(--text-muted); margin-top: 2px; word-break: break-all; }
.preview-content { flex: 1; overflow-y: auto; padding: 32px 48px; font-size: 14px; line-height: 1.85; color: var(--text-primary); background: white; }
.preview-content :deep(h1) { font-size: 28px; font-weight: 700; margin: 0 0 20px; padding-bottom: 12px; border-bottom: 2px solid var(--border); }
.preview-content :deep(h2) { font-size: 22px; font-weight: 600; margin: 32px 0 16px; padding-left: 12px; border-left: 4px solid var(--primary); }
.preview-content :deep(h3) { font-size: 18px; font-weight: 600; margin: 24px 0 12px; }
.preview-content :deep(p) { margin-bottom: 16px; }
.preview-content :deep(code) { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: "SF Mono", "Fira Code", monospace; font-size: 13px; color: var(--primary-dark); }
.preview-content :deep(pre) { background: #1e293b; color: #e2e8f0; padding: 16px 20px; border-radius: var(--radius-sm); overflow-x: auto; margin: 16px 0; font-size: 13px; line-height: 1.6; }
.preview-content :deep(pre code) { background: none; color: inherit; padding: 0; font-size: inherit; }
.text-muted { color: var(--text-muted); font-size: 13px; }
.form-control { padding: 4px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; background: white; color: var(--text-primary); width: 100%; box-sizing: border-box; }
.btn { padding: 4px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; cursor: pointer; background: white; color: var(--text-primary); }
.btn-sm { padding: 2px 8px; font-size: 12px; }
.btn-primary { background: var(--primary); color: white; border-color: var(--primary); }
.btn-secondary { background: #f5f5f7; }
.btn-danger { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-warning { background: #fffbeb; border-color: #fde68a; color: #b45309; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal { background: white; border-radius: 12px; width: 480px; max-width: 90vw; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }
.modal-header { padding: 20px 24px 0; }
.modal-header h3 { font-size: 16px; font-weight: 600; margin: 0; }
.modal-body { padding: 16px 24px; }
.modal-footer { padding: 12px 24px 20px; display: flex; gap: 8px; justify-content: flex-end; }
.folder-picker { display: flex; gap: 8px; }
.folder-picker input { flex: 1; }
</style>