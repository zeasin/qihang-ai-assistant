<template>
  <div class="data-view">
    <div class="content-header">
      <h1 class="content-title">数据中心</h1>
      <button class="btn btn-primary" @click="createModule">+ 新建模块</button>
    </div>
    
    <div class="content-body">
      <div class="module-grid">
        <div 
          v-for="module in modules" 
          :key="module.id" 
          class="module-card"
          @click="selectModule(module)"
        >
          <div class="module-card-top">
            <div class="module-card-icon">{{ module.icon }}</div>
            <div class="module-card-info">
              <div class="module-card-name">{{ module.name }}</div>
              <div class="module-card-desc">{{ module.description }}</div>
            </div>
          </div>
          <div class="module-card-bottom">
            <div class="module-card-stat">
              <strong>{{ module.count }}</strong>
              <span>条数据</span>
            </div>
            <div class="module-card-actions">
              <button @click.stop="editModule(module)">✏️</button>
              <button @click.stop="deleteModule(module)">🗑️</button>
            </div>
          </div>
        </div>
      </div>
      
      <div v-if="modules.length === 0" class="empty-state">
        <div class="icon">📦</div>
        <div class="title">暂无数据模块</div>
        <button class="btn btn-primary" @click="createModule">创建模块</button>
      </div>
    </div>

    <!-- 模块编辑模态框 -->
    <div v-if="showModuleModal" class="modal-overlay" @click="showModuleModal = false">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>{{ editingModule ? '编辑模块' : '新建模块' }}</h3>
          <button class="btn btn-secondary" @click="showModuleModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>模块名称 *</label>
            <input type="text" class="form-control" v-model="moduleForm.name" placeholder="如：客户管理">
          </div>
          <div class="form-group">
            <label>描述</label>
            <input type="text" class="form-control" v-model="moduleForm.description" placeholder="模块用途说明">
          </div>
          <div class="form-group">
            <label>图标</label>
            <input type="text" class="form-control" v-model="moduleForm.icon" placeholder="📁">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showModuleModal = false">取消</button>
          <button class="btn btn-primary" @click="saveModule">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

interface Module {
  id: string;
  name: string;
  description: string;
  icon: string;
  count: number;
}

const modules = ref<Module[]>([]);
const router = useRouter();

// ========== 模块 CRUD ==========
const showModuleModal = ref(false);
const editingModule = ref<any>(null);
const moduleForm = ref({ name: '', description: '', icon: '📁' });

const selectModule = (module: Module) => {
  router.push(`/data-module?id=${module.id}&name=${encodeURIComponent(module.name)}`);
};

const editModule = (module: Module) => {
  editingModule.value = module;
  moduleForm.value = {
    name: module.name,
    description: module.description,
    icon: module.icon || '📁'
  };
  showModuleModal.value = true;
};

const deleteModule = async (module: Module) => {
};

const createModule = () => {
  editingModule.value = null;
  moduleForm.value = { name: '', description: '', icon: '📁' };
  showModuleModal.value = true;
};

const saveModule = async () => {
  if (!moduleForm.value.name.trim()) {
    alert('请输入模块名称');
    return;
  }
  showModuleModal.value = false;
  editingModule.value = null;
  moduleForm.value = { name: '', description: '', icon: '📁' };
};

onMounted(() => {
});
</script>

<style scoped>
.data-view {
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

.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 8px;
}

.module-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 18px;
  cursor: pointer;
  transition: all 0.2s;
}

.module-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.module-card-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.module-card-icon {
  font-size: 32px;
  flex-shrink: 0;
}

.module-card-info {
  flex: 1;
  min-width: 0;
}

.module-card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.module-card-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.module-card-bottom {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.module-card-stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.module-card-stat strong {
  color: var(--primary);
  font-size: 14px;
}

.module-card-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.module-card-actions button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
  padding: 2px 4px;
}

.module-card-actions button:hover {
  color: var(--primary);
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}

.empty-state .icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state .title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
  color: var(--text-secondary);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-box {
  background: white;
  border-radius: var(--radius-md);
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  width: 420px;
}

.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
</style>
