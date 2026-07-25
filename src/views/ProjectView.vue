<template>
  <div class="projects-view">
    <div class="content-header">
      <h1 class="content-title">项目</h1>
      <button class="btn btn-primary btn-sm" @click="openAddModal">+ 新建项目</button>
    </div>

    <div class="content-body">
      <div v-if="!projects.length" class="empty-state">
        <div class="empty-icon">📁</div>
        <div class="empty-title">还没有项目</div>
        <div class="empty-desc">添加一个项目，关联代码目录和技术栈，飞书可自动识别项目上下文。</div>
        <button class="btn btn-primary" @click="openAddModal">新建项目</button>
      </div>

      <div v-else class="project-grid">
        <div v-for="p in projects" :key="p.id" class="project-card" @click="openEditModal(p)">
          <div class="card-header">
            <span class="card-name">{{ p.name }}</span>
            <span v-if="p.is_default" class="card-status default">默认</span>
          </div>
          <div class="card-body">
            <div v-if="p.description" class="card-desc">{{ p.description }}</div>
            <div v-if="p.dir" class="card-meta">📂 {{ p.dir }}</div>
            <div v-if="p.default_branch" class="card-meta">🌿 {{ p.default_branch }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>{{ editing ? '编辑项目' : '新建项目' }}</h3>
          <button class="modal-close" @click="closeModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>项目名称 *</label>
            <input v-model="form.name" class="form-control" placeholder="例如: CRM系统">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea v-model="form.description" class="form-control" rows="2" placeholder="项目描述"></textarea>
          </div>
          <div class="form-group">
            <label>代码目录</label>
            <div class="input-with-btn">
              <input v-model="form.dir" class="form-control" placeholder="D:/projects/myapp" readonly>
              <button class="btn btn-secondary" @click="pickFolder">选择</button>
            </div>
          </div>
          <div class="form-group">
            <label>默认分支</label>
            <input v-model="form.default_branch" class="form-control" placeholder="例如: main">
          </div>
          <div v-if="editing" class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.is_default">
              <span>设为默认项目</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeModal">取消</button>
          <button class="btn btn-danger" v-if="editing" @click="deleteProject">删除</button>
          <button class="btn btn-primary" :disabled="!form.name.trim()" @click="saveProject">
            {{ editing ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const API = window.electronAPI;

const projects = ref<any[]>([]);
const showModal = ref(false);
const editing = ref(false);
const editingId = ref('');
const form = ref({
  name: '',
  description: '',
  dir: '',
  default_branch: '',
  is_default: false,
});

async function loadProjects() {
  try {
    projects.value = await API.project.list();
  } catch {
    projects.value = [];
  }
}

function openAddModal() {
  editing.value = false;
  editingId.value = '';
  form.value = { name: '', description: '', dir: '', default_branch: '', is_default: false };
  showModal.value = true;
}

function openEditModal(p: any) {
  editing.value = true;
  editingId.value = p.id;
  form.value = {
    name: p.name || '',
    description: p.description || '',
    dir: p.dir || '',
    default_branch: p.default_branch || '',
    is_default: !!p.is_default,
  };
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
}

async function pickFolder() {
  try {
    const dir = await API.dialog.openDirectory();
    if (dir) form.value.dir = dir;
  } catch {}
}

async function saveProject() {
  if (!form.value.name.trim()) return;
  try {
    if (editing.value) {
      await API.project.update(editingId.value, form.value);
    } else {
      await API.project.add(form.value.name, form.value.dir, form.value.description, form.value.default_branch);
    }
    closeModal();
    await loadProjects();
  } catch (e: any) {
    alert('保存失败: ' + (e.message || '未知错误'));
  }
}

async function deleteProject() {
  if (!confirm('确定删除项目「' + form.value.name + '」？')) return;
  try {
    await API.project.delete(editingId.value);
    closeModal();
    await loadProjects();
  } catch (e: any) {
    alert('删除失败: ' + (e.message || '未知错误'));
  }
}

onMounted(loadProjects);
</script>

<style scoped>
.projects-view { display: flex; flex-direction: column; height: 100%; }
.content-header { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; background: white; }
.content-title { font-size: 18px; font-weight: 600; color: var(--text-primary); }
.content-body { flex: 1; overflow-y: auto; padding: 24px; }

.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 80px 20px; }
.empty-icon { font-size: 64px; margin-bottom: 16px; opacity: 0.3; }
.empty-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary); }
.empty-desc { font-size: 14px; line-height: 1.6; color: var(--text-secondary); margin-bottom: 16px; max-width: 400px; }

.project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.project-card { background: white; border-radius: var(--radius-md); border: 1px solid var(--border); padding: 16px; cursor: pointer; transition: all 0.15s; }
.project-card:hover { border-color: var(--primary); box-shadow: 0 2px 8px rgba(99,102,241,0.12); }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.card-name { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.card-status { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 500; }
.card-status.default { background: #dbeafe; color: #1e40af; }
.card-body { display: flex; flex-direction: column; gap: 6px; }
.card-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
.card-meta { font-size: 12px; color: var(--text-muted); }

.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 13px; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px; }
.checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.checkbox-label input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; }
.checkbox-label span { font-size: 14px; color: var(--text-primary); }

.input-with-btn { display: flex; gap: 8px; }
.input-with-btn .form-control { flex: 1; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-box { background: white; border-radius: var(--radius-md); box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 480px; max-width: 90vw; max-height: 80vh; display: flex; flex-direction: column; }
.modal-header { padding: 20px 24px 0; display: flex; align-items: center; justify-content: space-between; }
.modal-header h3 { font-size: 16px; font-weight: 600; margin: 0; }
.modal-close { background: none; border: none; font-size: 24px; color: var(--text-muted); cursor: pointer; padding: 0; line-height: 1; }
.modal-close:hover { color: var(--text-primary); }
.modal-body { padding: 20px 24px; overflow-y: auto; }
.modal-footer { padding: 0 24px 20px; display: flex; gap: 8px; justify-content: flex-end; }
</style>
