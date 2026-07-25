<template>
  <div class="data-view">
    <div class="content-header">
      <h1 class="content-title">数据中心</h1>
      <button class="btn btn-primary btn-sm" @click="createModule">+ 新建模块</button>
    </div>
    <div class="split-panel">
      <div class="left-panel">
        <div class="left-header">模块列表</div>
        <div class="left-body">
          <div v-for="mod in modules" :key="mod.id" class="mod-group">
            <div class="mod-header" @click="mod.expanded = !mod.expanded">
              <span class="mod-arrow">{{ mod.expanded ? '▾' : '▸' }}</span>
              <span class="mod-icon">{{ mod.icon }}</span>
              <span class="mod-name">{{ mod.name }}</span>
              <span class="mod-count">{{ mod.dsList.length }} 数据集</span>
            </div>
            <div v-if="mod.expanded" class="ds-list">
              <div
                v-for="ds in mod.dsList"
                :key="ds.id"
                class="ds-item"
                :class="{ active: selectedDs && selectedDs.id === ds.id }"
                @click="selectDataset(ds)"
              >
                <span class="ds-icon">📋</span>
                <span class="ds-name">{{ ds.name }}</span>
                <span class="ds-count">{{ ds.recordCount || 0 }}</span>
              </div>
            </div>
          </div>
          <div v-if="modules.length === 0" class="empty-hint">暂无模块，点击上方按钮创建</div>
        </div>
      </div>
      <div class="right-panel">
        <template v-if="selectedDs">
          <div class="right-toolbar">
            <div class="search-box">
              <input type="text" v-model="searchKeyword" placeholder="搜索记录..." @keyup.enter="loadRecords(0)">
            </div>
            <button class="btn btn-sm btn-secondary" @click="loadRecords(0)">搜索</button>
            <button class="btn btn-sm btn-primary" @click="showAddRecord">+ 新增</button>
            <button class="btn btn-sm btn-secondary" @click="showEditDataset(selectedDs)">✏️ 编辑</button>
            <button class="btn btn-sm btn-secondary" @click="showImportModal">📥 导入</button>
            <button class="btn btn-sm btn-danger" @click="deleteDataset(selectedDs)">🗑️ 删除</button>
          </div>
          <table class="data-table" v-if="records.length > 0">
            <thead>
              <tr>
                <th>状态</th>
                <th v-for="col in recordColumns" :key="col">{{ col }}</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rec in records" :key="rec._id || rec.id">
                <td><span class="badge badge-gray">{{ rec.status || '无' }}</span></td>
                <td v-for="col in recordColumns" :key="col">{{ rec[col] || '' }}</td>
                <td class="action-cell">
                  <button class="action-btn" @click="viewRecord(rec)">👁️</button>
                  <button class="action-btn" @click="editRecord(rec)">✏️</button>
                  <button class="action-btn danger" @click="deleteRecord(rec)">🗑️</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="right-empty">
            <div class="empty-icon">📝</div>
            <div class="empty-title">暂无记录</div>
            <button class="btn btn-primary btn-sm" @click="showAddRecord">+ 新增记录</button>
          </div>
        </template>
        <div v-else class="right-empty">
          <div class="empty-icon">📋</div>
          <div class="empty-title">从左侧选择一个数据集</div>
        </div>
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
            <input type="text" class="form-control" v-model="moduleForm.name">
          </div>
          <div class="form-group">
            <label>描述</label>
            <input type="text" class="form-control" v-model="moduleForm.description">
          </div>
          <div class="form-group">
            <label>图标</label>
            <input type="text" class="form-control" v-model="moduleForm.icon">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showModuleModal = false">取消</button>
          <button class="btn btn-primary" @click="saveModule">保存</button>
        </div>
      </div>
    </div>

    <!-- 数据集模态框 -->
    <div v-if="showDsModal" class="modal-overlay" @click="showDsModal = false">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>{{ editingDsId ? '编辑数据集' : '新建数据集' }}</h3>
          <button class="btn btn-secondary" @click="showDsModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名称 *</label>
            <input type="text" class="form-control" v-model="dsForm.name">
          </div>

<!--          <div class="form-group">-->
<!--            <label>类型</label>-->
<!--            <input type="text" class="form-control" v-model="dsForm.type">-->
<!--          </div>-->
          <div class="form-group">
            <label>Schema 字段（每行一个）</label>
            <textarea class="form-control" v-model="dsForm.schema" rows="6"></textarea>
          </div>
          <div class="form-group">
            <label>类型选项（每行一个）</label>
            <textarea class="form-control" v-model="dsForm.typeOptions" rows="5"></textarea>
          </div>
          <div class="form-group">
            <label>状态选项（每行一个）</label>
            <textarea class="form-control" v-model="dsForm.statusOptions" rows="5"></textarea>
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea class="form-control" v-model="dsForm.description" rows="2"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showDsModal = false">取消</button>
          <button class="btn btn-primary" @click="saveDataset">保存</button>
        </div>
      </div>
    </div>

    <!-- 记录模态框 -->
    <div v-if="showRecordModal" class="modal-overlay" @click="showRecordModal = false">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>{{ editingRecordId ? '编辑记录' : '新增记录' }}</h3>
          <button class="btn btn-secondary" @click="showRecordModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>状态</label>
            <select class="form-control" v-model="recordForm.status">
              <option v-for="opt in statusOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div class="form-group" v-if="typeOptions.length">
            <label>类型</label>
            <select class="form-control" v-model="recordForm.type">
              <option v-for="opt in typeOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div v-for="field in recordFormFields" :key="field" class="form-group">
            <label>{{ field }}</label>
            <input type="text" class="form-control" v-model="recordForm[field]">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showRecordModal = false">取消</button>
          <button class="btn btn-primary" @click="saveRecord">保存</button>
        </div>
      </div>
    </div>

    <!-- 详情模态框 -->
    <div v-if="showDetailModal" class="modal-overlay" @click="showDetailModal = false">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>记录详情</h3>
          <button class="btn btn-secondary" @click="showDetailModal = false">✕</button>
        </div>
        <div class="modal-body" v-if="viewingRecord">
          <div class="detail-row">
            <span class="label">状态</span>
            <span class="value"><span class="badge badge-gray">{{ viewingRecord.status || '无' }}</span></span>
          </div>
          <div v-for="field in recordColumns" :key="field" class="detail-row">
            <span class="label">{{ field }}</span>
            <span class="value">{{ viewingRecord[field] || '' }}</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger" @click="deleteFromDetail">🗑️ 删除</button>
          <button class="btn btn-primary" @click="editFromDetail">✏️ 编辑</button>
          <button class="btn btn-secondary" @click="showDetailModal = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 导入模态框 -->
    <div v-if="showImportModalFlag" class="modal-overlay" @click="showImportModalFlag = false">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>📥 数据导入</h3>
          <button class="btn btn-secondary" @click="showImportModalFlag = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>导入方式</label>
            <div class="import-type-btns">
              <button class="btn" :class="importType === 'json' ? 'btn-primary' : 'btn-secondary'" @click="importType = 'json'">📝 JSON</button>
              <button class="btn" :class="importType === 'url' ? 'btn-primary' : 'btn-secondary'" @click="importType = 'url'">🔗 URL</button>
            </div>
          </div>
          <div v-if="importType === 'json'" class="form-group">
            <label>JSON 数据</label>
            <textarea class="form-control" v-model="importJsonData" rows="8"></textarea>
          </div>
          <div v-if="importType === 'url'" class="form-group">
            <label>数据 URL</label>
            <input type="text" class="form-control" v-model="importUrl">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showImportModalFlag = false">取消</button>
          <button class="btn btn-primary" @click="doImport">开始导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const API = (window as any).electronAPI;

interface ModItem {
  id: string; name: string; description: string; icon: string;
  dsList: any[]; expanded: boolean;
}

const modules = ref<ModItem[]>([]);

async function loadModules() {
  if (!API) return;
  try {
    const list = await API.dm.list();
    const dsList = await API.ds.list();
    modules.value = list.map((m: any) => {
      const dsInModule = dsList.filter((d: any) => d.module_id === m.module_id);
      return {
        id: m.module_id || m.id, name: m.name, description: m.description || '',
        icon: m.icon || '📁', dsList: dsInModule, expanded: true
      };
    });
  } catch (e) { console.error('加载模块失败:', e); }
}

const showModuleModal = ref(false);
const editingModule = ref<any>(null);
const moduleForm = ref({ name: '', description: '', icon: '📁' });

const editModule = (mod: ModItem) => {
  editingModule.value = mod;
  moduleForm.value = { name: mod.name, description: mod.description, icon: mod.icon };
  showModuleModal.value = true;
};

const deleteModule = async (mod: ModItem) => {
  if (!confirm(`确定删除模块「${mod.name}」及所有数据？`)) return;
  try { await API.dm.remove(mod.id); await loadModules(); }
  catch (e) { console.error('删除模块失败:', e); }
};

const createModule = () => {
  editingModule.value = null;
  moduleForm.value = { name: '', description: '', icon: '📁' };
  showModuleModal.value = true;
};

const saveModule = async () => {
  if (!moduleForm.value.name.trim()) { alert('请输入模块名称'); return; }
  try {
    if (editingModule.value) {
      await API.dm.update(editingModule.value.id, moduleForm.value);
    } else {
      await API.dm.add(moduleForm.value.name, moduleForm.value.description, moduleForm.value.icon);
    }
    showModuleModal.value = false;
    editingModule.value = null;
    moduleForm.value = { name: '', description: '', icon: '📁' };
    await loadModules();
  } catch (e) { console.error('保存模块失败:', e); }
};

// ========== 数据集选择 ==========

const selectedDs = ref<any>(null);
const records = ref<any[]>([]);
const recordColumns = ref<string[]>([]);
const searchKeyword = ref('');
const currentPage = ref(0);
const pageSize = 20;

function selectDataset(ds: any) {
  selectedDs.value = ds;
  localStorage.setItem('lastDatasetId', ds.dataset_id || ds.id);
  loadRecords(0);
}

async function loadRecords(page: number) {
  if (!selectedDs.value || !API) return;
  currentPage.value = page;
  try {
    const rows = await API.ds.query(selectedDs.value.dataset_id, searchKeyword.value || null);
    records.value = rows;
    recordColumns.value = buildRecordColumns(rows);
  } catch (e) { console.error('加载记录失败:', e); records.value = []; recordColumns.value = []; }
}

function buildRecordColumns(recs: any[]): string[] {
  const cols = new Set<string>();
  recs.forEach((r: any) => { Object.keys(r).forEach(k => { if (k !== 'id' && k !== '_created_at' && !k.startsWith('_')) cols.add(k); }); });
  return Array.from(cols).slice(0, 8);
}

// ========== 数据集 CRUD ==========

const showDsModal = ref(false);
const editingDsId = ref('');
const dsForm = ref({ name: '', description: '', type: '', schema: '', typeOptions: '', statusOptions: '' });

function showEditDataset(ds: any) {
  if (!ds) return;
  editingDsId.value = ds.id || '';
  dsForm.value = {
    name: ds.name || '', description: ds.description || '', type: ds.type || '',
    schema: (ds.schema && ds.schema.fields) ? ds.schema.fields.map((f: any) => f.name).join('\n') : '',
    typeOptions: (ds.schema && ds.schema.typeOptions) ? ds.schema.typeOptions.join('\n') : '',
    statusOptions: (ds.schema && ds.schema.statusOptions) ? ds.schema.statusOptions.join('\n') : ''
  };
  showDsModal.value = true;
}

async function saveDataset() {
  if (!dsForm.value.name.trim()) { alert('请输入数据集名称'); return; }
  if (!API) return;
  const fields = dsForm.value.schema.split('\n').filter(s => s.trim()).map(s => ({ name: s.trim(), type: 'text' }));
  const schemaJson = JSON.stringify({
    fields,
    typeOptions: dsForm.value.typeOptions.split('\n').filter(s => s.trim()),
    statusOptions: dsForm.value.statusOptions.split('\n').filter(s => s.trim())
  });
  try {
    if (editingDsId.value) {
      await API.ds.updateMeta(editingDsId.value, {
        name: dsForm.value.name, description: dsForm.value.description,
        type: dsForm.value.type, schema_json: schemaJson,
      });
    } else {
      await API.ds.add({ name: dsForm.value.name, description: dsForm.value.description, type: dsForm.value.type, schemaJson, module_id: selectedDs.value?.module_id || '' });
    }
    showDsModal.value = false;
    await loadModules();
  } catch (e) { console.error('保存数据集失败:', e); }
}

async function deleteDataset(ds: any) {
  if (!ds || !confirm(`确定删除数据集「${ds.name}」及所有数据？`)) return;
  try {
    await API.ds.remove(ds.dataset_id || ds.id);
    selectedDs.value = null; records.value = [];
    await loadModules();
  } catch (e) { console.error('删除数据集失败:', e); }
}

// ========== 记录 CRUD ==========

const showRecordModal = ref(false);
const editingRecordId = ref('');
const recordForm = ref<any>({ status: '进行中' });
const recordFormFields = ref<string[]>([]);

const showDetailModal = ref(false);
const viewingRecord = ref<any>(null);

const showImportModalFlag = ref(false);
const importType = ref('json');
const importJsonData = ref('');
const importUrl = ref('');

const statusOptions = computed(() => {
  const ds = selectedDs.value;
  if (!ds) return ['待办', '进行中', '已完成'];
  const schema = typeof ds.schema === 'string' ? JSON.parse(ds.schema) : ds.schema;
  const opts = schema?.statusOptions;
  return Array.isArray(opts) && opts.length ? opts : ['待办', '进行中', '已完成'];
});

const typeOptions = computed(() => {
  const ds = selectedDs.value;
  if (!ds) return [];
  const schema = typeof ds.schema === 'string' ? JSON.parse(ds.schema) : ds.schema;
  const opts = schema?.typeOptions;
  return Array.isArray(opts) && opts.length ? opts : [];
});

function getSchemaFields(ds: any) {
  if (!ds) return [];
  const schema = typeof ds.schema === 'string' ? JSON.parse(ds.schema) : ds.schema;
  return (schema && schema.fields) || [];
}

function showAddRecord() {
  if (!selectedDs.value) return;
  editingRecordId.value = '';
  const schemaFields = getSchemaFields(selectedDs.value);
  recordFormFields.value = schemaFields.map((f: any) => f.name || f.displayName).filter((f: string) => f !== 'status' && f !== 'id' && f !== 'type' && f !== '类型');
  const form: any = { status: '进行中' };
  if (typeOptions.value.length) form.type = typeOptions.value[0];
  recordFormFields.value.forEach((f: string) => { form[f] = ''; });
  recordForm.value = form;
  showRecordModal.value = true;
}

function editRecord(rec: any) {
  if (!selectedDs.value) return;
  editingRecordId.value = rec.id;
  const schemaFields = getSchemaFields(selectedDs.value);
  recordFormFields.value = schemaFields.map((f: any) => f.name || f.displayName).filter((f: string) => f !== 'status' && f !== 'id' && f !== 'type' && f !== '类型');
  const form: any = { status: rec.status || '', type: rec.type || '' };
  recordFormFields.value.forEach((f: string) => { form[f] = rec[f] || ''; });
  recordForm.value = form;
  showRecordModal.value = true;
}

async function saveRecord() {
  if (!selectedDs.value || !API) return;
  const record: any = {};
  recordFormFields.value.forEach(f => { record[f] = recordForm.value[f] || ''; });
  if (recordForm.value.status) record.status = recordForm.value.status;
  if (recordForm.value.type) record.type = recordForm.value.type;
  try {
    if (editingRecordId.value) {
      await API.ds.updateRecord(editingRecordId.value, record);
    } else {
      await API.ds.insert(selectedDs.value.dataset_id, record);
    }
    showRecordModal.value = false;
    await loadRecords(currentPage.value);
    await loadModules();
  } catch (e) { console.error('保存记录失败:', e); }
}

async function deleteRecord(rec: any) {
  if (!selectedDs.value || !confirm('确定删除这条记录？') || !API) return;
  try { await API.ds.deleteRecord(rec.id); await loadRecords(currentPage.value); await loadModules(); }
  catch (e) { console.error('删除记录失败:', e); }
}

function viewRecord(rec: any) {
  viewingRecord.value = rec;
  showDetailModal.value = true;
}

function editFromDetail() {
  if (viewingRecord.value) { showDetailModal.value = false; editRecord(viewingRecord.value); }
}

function deleteFromDetail() {
  if (viewingRecord.value) { showDetailModal.value = false; deleteRecord(viewingRecord.value); }
}

// ========== 导入 ==========

function showImportModal() {
  importType.value = 'json';
  importJsonData.value = '';
  importUrl.value = '';
  showImportModalFlag.value = true;
}

async function doImport() {
  if (!selectedDs.value || !API) { alert('请先选择数据集'); return; }
  try {
    if (importType.value === 'json') {
      if (!importJsonData.value.trim()) { alert('请输入JSON数据'); return; }
      let arr;
      try { arr = JSON.parse(importJsonData.value); if (!Array.isArray(arr)) throw 0; }
      catch (e) { alert('JSON格式错误，需要数组'); return; }
      for (const item of arr) await API.ds.insert(selectedDs.value.dataset_id, item);
    } else {
      if (!importUrl.value.trim()) { alert('请输入URL'); return; }
      const r = await fetch(importUrl.value.trim());
      const data = await r.json();
      const arr = Array.isArray(data) ? data : [data];
      for (const item of arr) await API.ds.insert(selectedDs.value.dataset_id, item);
    }
    showImportModalFlag.value = false;
    alert('导入完成');
    await loadRecords(0);
    await loadModules();
  } catch (e) { console.error('导入失败:', e); alert('导入失败: ' + e); }
}

// ========== 持久化 ==========

async function restoreLastDataset(dsList: any[]) {
  const lastId = localStorage.getItem('lastDatasetId');
  if (!lastId) return;
  const found = dsList.find((d: any) => (d.dataset_id || d.id) === lastId);
  if (found) selectDataset(found);
}

onMounted(async () => {
  await loadModules();
  if (modules.value.length) {
    const allDs = modules.value.flatMap(m => m.dsList);
    await restoreLastDataset(allDs);
  }
});
</script>

<style scoped>
.data-view {
  display: flex; flex-direction: column; height: 100%;
}
.content-header {
  padding: 12px 20px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0; background: white;
}
.content-title { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.split-panel { flex: 1; display: flex; overflow: hidden; }

.left-panel {
  width: 260px; min-width: 260px; border-right: 1px solid var(--border);
  display: flex; flex-direction: column; background: #fafbfc;
}
.left-header {
  padding: 12px 16px; font-size: 12px; font-weight: 600;
  color: var(--text-muted); text-transform: uppercase;
  border-bottom: 1px solid var(--border); background: white;
}
.left-body { flex: 1; overflow-y: auto; padding: 8px 0; }
.mod-group { margin-bottom: 2px; }
.mod-header {
  display: flex; align-items: center; gap: 6px; padding: 8px 16px;
  cursor: pointer; font-size: 13px; user-select: none;
}
.mod-header:hover { background: var(--hover); }
.mod-arrow { font-size: 10px; color: var(--text-muted); width: 12px; flex-shrink: 0; }
.mod-icon { font-size: 16px; flex-shrink: 0; }
.mod-name { flex: 1; font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mod-count { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.ds-list { padding: 0 0 4px 34px; }
.ds-item {
  display: flex; align-items: center; gap: 6px; padding: 6px 12px;
  border-radius: 6px; cursor: pointer; font-size: 13px; margin-bottom: 1px;
}
.ds-item:hover { background: #e8eaed; }
.ds-item.active { background: var(--primary); color: white; }
.ds-item.active .ds-name { color: white; }
.ds-item.active .ds-count { color: rgba(255,255,255,0.7); }
.ds-icon { font-size: 14px; flex-shrink: 0; }
.ds-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-count { font-size: 11px; background: rgba(0,0,0,0.08); padding: 0 6px; border-radius: 8px; }
.ds-item.active .ds-count { background: rgba(255,255,255,0.2); }
.empty-hint { text-align: center; padding: 24px; font-size: 13px; color: var(--text-muted); }

.right-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.right-toolbar {
  display: flex; align-items: center; gap: 8px; padding: 12px 20px;
  border-bottom: 1px solid var(--border); flex-wrap: wrap; background: white;
}
.search-box { position: relative; flex: 1; min-width: 160px; max-width: 260px; }
.search-box input {
  width: 100%; padding: 6px 10px; border: 1px solid var(--border);
  border-radius: var(--radius-sm); font-size: 13px; outline: none;
}
.search-box input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
.data-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
  background: white; border-spacing: 0;
}
.data-table th {
  text-align: left; padding: 10px 14px; background: #f8fafc;
  border-bottom: 2px solid var(--border); font-weight: 600;
  color: var(--text-secondary); position: sticky; top: 0; z-index: 1;
}
.data-table td { padding: 10px 14px; border-bottom: 1px solid var(--border); }
.data-table tr:hover { background: var(--hover); }
.action-cell { white-space: nowrap; }
.action-btn {
  background: none; border: none; cursor: pointer; font-size: 12px;
  color: var(--text-muted); padding: 2px 6px;
}
.action-btn:hover { color: var(--primary); }
.action-btn.danger:hover { color: var(--danger); }
.right-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; color: var(--text-muted);
}
.empty-icon { font-size: 40px; margin-bottom: 8px; opacity: 0.4; }
.empty-title { font-size: 14px; margin-bottom: 12px; }

.detail-row {
  display: flex; justify-content: space-between; padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.detail-row:last-child { border-bottom: none; }
.detail-row .label { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.detail-row .value { font-size: 13px; color: var(--text-primary); }

.import-type-btns { display: flex; gap: 8px; }

.empty-hint { text-align: center; padding: 24px; font-size: 13px; color: var(--text-muted); }

.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); display: flex;
  justify-content: center; align-items: center; z-index: 1000;
}
.modal-box {
  background: white; border-radius: var(--radius-md);
  box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 90%;
  max-height: 90vh; overflow-y: auto; width: 480px;
}
.modal-header {
  padding: 14px 20px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
}
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-body { padding: 18px 20px; }
.modal-footer {
  padding: 14px 20px; border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
}
.form-group { margin-bottom: 12px; }
.form-group label {
  display: block; font-size: 12px; font-weight: 500;
  color: var(--text-secondary); margin-bottom: 5px;
}
.form-control {
  width: 100%; padding: 7px 10px; border: 1px solid var(--border);
  border-radius: var(--radius-sm); font-size: 13px; outline: none;
  transition: all 0.2s; background: white; box-sizing: border-box;
}
.form-control:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
textarea.form-control { resize: vertical; font-family: inherit; }

.badge {
  display: inline-flex; align-items: center; padding: 2px 8px;
  border-radius: 20px; font-size: 12px; font-weight: 500;
}
.badge-gray { background: #f5f5f7; color: #909296; }
</style>
