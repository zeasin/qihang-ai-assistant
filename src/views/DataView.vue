<template>
  <div class="data-view">
    <div class="content-header">
      <h1 class="content-title">数据</h1>
      <div class="header-actions">
        <button class="btn btn-sm btn-secondary" @click="showAddModule">+ 模块</button>
        <button class="btn btn-sm btn-primary" @click="showAddDataset">+ 数据集</button>
      </div>
    </div>

    <div class="content-body" v-if="modules.length > 0">
      <div class="module-tabs">
        <button
          v-for="mod in modules"
          :key="mod.id"
          class="module-tab"
          :class="{ active: activeModuleId === mod.id }"
          @click="switchModule(mod)"
        >
          <span class="tab-icon">{{ mod.icon || '📁' }}</span>
          <span class="tab-name">{{ mod.name }}</span>
          <span class="tab-count">{{ mod.totalRecords }}</span>
        </button>
      </div>

      <div v-if="activeModule" class="module-panel">
        <div class="panel-header">
          <div class="panel-title-area">
            <span class="panel-icon">{{ activeModule.icon || '📁' }}</span>
            <span class="panel-name">{{ activeModule.name }}</span>
            <span class="panel-desc" v-if="activeModule.description">{{ activeModule.description }}</span>
          </div>
          <div class="panel-actions">
            <span class="panel-meta">{{ activeModule.totalRecords }} 条记录 · {{ activeModule.datasets.length }} 个数据集</span>
            <button class="panel-btn" @click="showEditModule(activeModule)" title="编辑模块">✏️</button>
            <button class="panel-btn panel-btn-danger" @click="deleteModule(activeModule)" title="删除模块">🗑️</button>
          </div>
        </div>

        <div class="panel-subtabs">
          <button class="subtab" :class="{ active: moduleSubTab === 'ai' }" @click="moduleSubTab = 'ai'">🤖 AI 分析</button>
          <button class="subtab" :class="{ active: moduleSubTab === 'data' }" @click="moduleSubTab = 'data'">📋 数据</button>
        </div>

        <div v-if="moduleSubTab === 'ai'" class="panel-ai-section">
          <div class="ai-body">
            <div v-if="activeModule.aiLoading" class="ai-loading">
              <div class="spinner"></div>
              <span>AI 正在分析业务数据...</span>
            </div>
            <div v-else-if="activeModule.aiAnalysis" class="ai-content">
              <div class="ai-text" v-html="renderMarkdown(activeModule.aiAnalysis.content)"></div>
              <div class="ai-actions">
                <button class="btn btn-sm btn-secondary" @click="refreshAiAnalysis(activeModule, true)">🔄 刷新分析</button>
                <button class="btn btn-sm btn-secondary" @click="archiveAnalysis(activeModule)" :disabled="activeModule.saving">📥 存档到笔记库</button>
              </div>
            </div>
            <div v-else class="ai-empty">
              <span>AI 正在分析...</span>
            </div>
          </div>
        </div>

        <div v-if="moduleSubTab === 'data'" class="panel-datasets">
          <div v-for="ds in activeModule.datasets" :key="ds.datasetId" class="dataset-section">
            <div class="dataset-header">
              <div class="dataset-title-area">
                <span class="dataset-icon">📋</span>
                <span class="dataset-name">{{ ds.name }}</span>
                <span class="dataset-count">{{ ds.recordCount }} 条</span>
              </div>
              <div class="dataset-actions">
                <button class="ds-btn" @click="showEditDatasetPortal(activeModule, ds)" title="编辑数据集">✏️</button>
                <button class="ds-btn ds-btn-danger" @click="deleteDatasetPortal(activeModule, ds)" title="删除数据集">🗑️</button>
                <button class="btn btn-sm btn-secondary" @click="openFullView(activeModule, ds)">查看全部 →</button>
              </div>
            </div>
            <table class="preview-table" v-if="ds.recentRecords && ds.recentRecords.length > 0">
              <thead>
                <tr>
                  <th v-for="col in getPreviewColumns(ds)" :key="col">{{ col }}</th>
                  <th class="th-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rec in ds.recentRecords" :key="rec.id">
                  <td v-for="col in getPreviewColumns(ds)" :key="col" :title="rec[col] || ''">{{ truncateText(rec[col], 20) }}</td>
                  <td class="action-cell">
                    <button class="action-btn" @click="viewRecordPortal(rec)">👁️</button>
                    <button class="action-btn" @click="editRecordPortal(activeModule, ds, rec)">✏️</button>
                    <button class="action-btn danger" @click="deleteRecordPortal(rec)">🗑️</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-else class="dataset-empty">暂无记录</div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="content-empty">
      <div class="empty-icon">📋</div>
      <div class="empty-title">暂无数据模块</div>
      <div class="empty-desc">点击上方「+ 模块」创建第一个数据模块，然后添加数据集</div>
    </div>

    <!-- 全量数据查看模态框 -->
    <div v-if="fullViewVisible" class="modal-overlay" @click="closeFullView">
      <div class="modal-box modal-box-wide" @click.stop>
        <div class="modal-header">
          <h3>📋 {{ fullViewDs?.name || '数据集' }}</h3>
          <div class="modal-header-actions">
            <span class="modal-badge">{{ fullViewDs?.recordCount || 0 }} 条记录</span>
            <button class="btn btn-secondary" @click="closeFullView">✕</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="fullview-toolbar">
            <div class="search-box">
              <input type="text" v-model="fullViewKeyword" placeholder="搜索记录..." @keyup.enter="loadFullViewRecords()">
            </div>
            <button class="btn btn-sm btn-secondary" @click="loadFullViewRecords()">搜索</button>
            <button class="btn btn-sm btn-primary" @click="showAddRecord">+ 记录</button>
            <button class="btn btn-sm btn-secondary" @click="showImportModal">📥 导入</button>
          </div>
          <table class="data-table" v-if="fullViewRecords.length > 0">
            <thead>
              <tr>
                <th>状态</th>
                <th v-for="col in fullViewColumns" :key="col">{{ col }}</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="rec in fullViewRecords" :key="rec.id">
                <td><span class="badge badge-gray">{{ rec.status || '无' }}</span></td>
                <td v-for="col in fullViewColumns" :key="col">{{ rec[col] || '' }}</td>
                <td class="action-cell">
                  <button class="action-btn" @click="viewRecordPortal(rec)">👁️</button>
                  <button class="action-btn" @click="editRecordPortal(fullViewMod, fullViewDs, rec)">✏️</button>
                  <button class="action-btn danger" @click="deleteRecordPortal(rec)">🗑️</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="right-empty">
            <div class="empty-icon">📝</div>
            <div class="empty-title">暂无记录</div>
            <button class="btn btn-primary btn-sm" @click="showAddRecord">+ 新增记录</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 数据集模态框 -->
    <div v-if="showDsModal" class="modal-overlay">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>{{ editingDsId ? '编辑数据集' : '新建数据集' }}</h3>
          <button class="btn btn-secondary" @click="showDsModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名称 *</label>
            <input type="text" class="form-control" v-model="dsForm.name" placeholder="例如：客户信息、项目列表">
          </div>
          <div class="form-group">
            <label>所属模块</label>
            <select v-model="dsForm.moduleId" class="form-control">
              <option value="">（无模块）</option>
              <option v-for="mod in modules" :key="mod.id" :value="mod.id">{{ mod.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Schema 字段（每行一个字段名）</label>
            <textarea class="form-control" v-model="dsForm.schema" rows="6" placeholder="例如：&#10;姓名&#10;电话&#10;邮箱&#10;地址"></textarea>
          </div>
          <div class="form-group">
            <label>类型选项（每行一个，可选）</label>
            <textarea class="form-control" v-model="dsForm.typeOptions" rows="5" placeholder="例如：&#10;个人&#10;企业"></textarea>
          </div>
          <div class="form-group">
            <label>状态选项（每行一个，可选）</label>
            <textarea class="form-control" v-model="dsForm.statusOptions" rows="5" placeholder="例如：&#10;待办&#10;进行中&#10;已完成"></textarea>
          </div>
          <div class="form-group">
            <label>描述（可选）</label>
            <textarea class="form-control" v-model="dsForm.description" rows="2" placeholder="数据集的简要说明"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showDsModal = false">取消</button>
          <button class="btn btn-primary" @click="saveDataset">保存</button>
        </div>
      </div>
    </div>

    <!-- 模块模态框 -->
    <div v-if="showModuleModal" class="modal-overlay">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>{{ editingModuleId ? '编辑模块' : '新建模块' }}</h3>
          <button class="btn btn-secondary" @click="showModuleModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名称 *</label>
            <input type="text" class="form-control" v-model="moduleForm.name" placeholder="例如：客户管理、项目管理">
          </div>
          <div class="form-group">
            <label>图标（可选）</label>
            <input type="text" class="form-control" v-model="moduleForm.icon" placeholder="📁">
          </div>
          <div class="form-group">
            <label>描述（可选）</label>
            <textarea class="form-control" v-model="moduleForm.description" rows="3" placeholder="模块的简要说明"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showModuleModal = false">取消</button>
          <button class="btn btn-primary" @click="saveModule">保存</button>
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
              <option v-for="opt in recordStatusOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div class="form-group" v-if="recordTypeOptions.length">
            <label>类型</label>
            <select class="form-control" v-model="recordForm.type">
              <option v-for="opt in recordTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
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
          <div v-for="field in viewingRecordFields" :key="field" class="detail-row">
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
import { marked } from 'marked';

const API = (window as any).electronAPI;

interface ModuleData {
  id: string;
  name: string;
  description: string;
  icon: string;
  totalRecords: number;
  aiLoading: boolean;
  aiAnalysis: any;
  saving: boolean;
  datasets: DatasetData[];
}

interface DatasetData {
  datasetId: string;
  name: string;
  description: string;
  schema: any;
  recordCount: number;
  recentRecords: any[];
}

const modules = ref<ModuleData[]>([]);
const activeModuleId = ref<string | null>(null);
const moduleSubTab = ref<'ai' | 'data'>('ai');

const activeModule = computed(() => {
  if (!activeModuleId.value) return null;
  return modules.value.find(m => m.id === activeModuleId.value) || null;
});

// ========== 数据加载 ==========

async function loadAll() {
  if (!API) return;
  try {
    const modList = await API.dm.list();
    const overviews = await Promise.all(
      modList.map((m: any) => API.archive.moduleOverview(m.module_id || m.id).catch(() => null))
    );
    const result: ModuleData[] = [];
    for (let i = 0; i < modList.length; i++) {
      const m = modList[i];
      const ov = overviews[i];
      const mid = m.module_id || m.id;
      result.push({
        id: mid,
        name: m.name,
        description: m.description || '',
        icon: m.icon || '📁',
        totalRecords: ov?.datasets?.reduce((s: number, d: any) => s + (d.recordCount || 0), 0) || 0,
        aiLoading: false,
        aiAnalysis: ov?.analysis || null,
        saving: false,
        datasets: ov?.datasets || [],
      });
    }
    modules.value = result;
    if (result.length > 0) {
      activeModuleId.value = result[0].id;
      ensureAiAnalysis(result[0]);
    }
  } catch (e) { console.error('加载模块数据失败:', e); }
}

// ========== 模块管理 ==========

const showModuleModal = ref(false);
const editingModuleId = ref('');
const moduleForm = ref({ name: '', icon: '📁', description: '' });

function showAddModule() {
  editingModuleId.value = '';
  moduleForm.value = { name: '', icon: '📁', description: '' };
  showModuleModal.value = true;
}

function showEditModule(mod: ModuleData) {
  editingModuleId.value = mod.id;
  moduleForm.value = { name: mod.name, icon: mod.icon || '📁', description: mod.description };
  showModuleModal.value = true;
}

async function saveModule() {
  if (!moduleForm.value.name.trim()) { alert('请输入模块名称'); return; }
  if (!API) return;
  try {
    if (editingModuleId.value) {
      await API.dm.update(editingModuleId.value, {
        name: moduleForm.value.name,
        icon: moduleForm.value.icon,
        description: moduleForm.value.description,
      });
    } else {
      await API.dm.add(moduleForm.value.name, moduleForm.value.description, moduleForm.value.icon);
    }
    showModuleModal.value = false;
    await loadAll();
  } catch (e) { console.error('保存模块失败:', e); }
}

async function deleteModule(mod: ModuleData) {
  if (!confirm(`确定删除模块「${mod.name}」及其下所有数据集？`)) return;
  if (!API) return;
  try {
    await API.dm.remove(mod.id);
    await loadAll();
  } catch (e) { console.error('删除模块失败:', e); }
}

// ========== 数据集管理 ==========

const showDsModal = ref(false);
const editingDsId = ref('');
const dsForm = ref({ name: '', moduleId: '', description: '', schema: '', typeOptions: '', statusOptions: '' });

function showAddDataset() {
  editingDsId.value = '';
  dsForm.value = { name: '', moduleId: '', description: '', schema: '', typeOptions: '', statusOptions: '' };
  showDsModal.value = true;
}

function showEditDatasetPortal(mod: ModuleData, ds: DatasetData) {
  editingDsId.value = ds.datasetId;
  dsForm.value = {
    name: ds.name || '',
    moduleId: mod.id,
    description: ds.description || '',
    schema: (ds.schema && ds.schema.fields) ? ds.schema.fields.map((f: any) => f.name).join('\n') : '',
    typeOptions: (ds.schema && ds.schema.typeOptions) ? ds.schema.typeOptions.join('\n') : '',
    statusOptions: (ds.schema && ds.schema.statusOptions) ? ds.schema.statusOptions.join('\n') : '',
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
    statusOptions: dsForm.value.statusOptions.split('\n').filter(s => s.trim()),
  });
  try {
    const moduleId = dsForm.value.moduleId;
    if (editingDsId.value) {
      await API.ds.updateMeta(editingDsId.value, {
        name: dsForm.value.name, description: dsForm.value.description,
        schema_json: schemaJson, module_id: moduleId,
      });
    } else {
      await API.ds.add({ name: dsForm.value.name, description: dsForm.value.description, schemaJson, module_id: moduleId });
    }
    showDsModal.value = false;
    await loadAll();
  } catch (e) { console.error('保存数据集失败:', e); }
}

async function deleteDatasetPortal(mod: ModuleData, ds: DatasetData) {
  if (!confirm(`确定删除数据集「${ds.name}」及所有数据？`)) return;
  if (!API) return;
  try {
    await API.ds.remove(ds.datasetId);
    await loadAll();
  } catch (e) { console.error('删除数据集失败:', e); }
}

// ========== AI 分析 ==========

function isTodayAnalysis(analysis: any): boolean {
  if (!analysis || !analysis.created_at) return false;
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    const d = new Date(analysis.created_at);
    const dStr = new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    return dStr === today;
  } catch { return String(analysis.created_at).slice(0, 10) === today; }
}

function ensureAiAnalysis(mod: ModuleData) {
  if (!isTodayAnalysis(mod.aiAnalysis)) {
    refreshAiAnalysis(mod);
  }
}

function switchModule(mod: ModuleData) {
  activeModuleId.value = mod.id;
  ensureAiAnalysis(mod);
}

async function refreshAiAnalysis(mod: ModuleData, force?: boolean) {
  if (!API) return;
  mod.aiLoading = true;
  try {
    const res = await API.archive.moduleAnalysis(mod.id, force);
    if (res.ok && res.content) {
      mod.aiAnalysis = { id: res.analysisId, content: res.content, created_at: new Date().toISOString() };
      if (res.fromCache) {
        mod.aiAnalysis.created_at = res.date || mod.aiAnalysis.created_at;
      }
    }
  } catch (e) {
    console.error('AI 分析失败:', e);
  }
  mod.aiLoading = false;
}

async function archiveAnalysis(mod: ModuleData) {
  if (!API || !mod.aiAnalysis) return;
  const analysisId = mod.aiAnalysis.id;
  if (!analysisId) {
    alert('请先保存分析结果');
    return;
  }
  mod.saving = true;
  try {
    const res = await API.archive.saveAnalysisToNotes(mod.id, analysisId);
    if (res.ok) {
      alert('已存档到笔记库: ' + res.filePath);
    } else {
      alert('存档失败: ' + (res.error || '未知错误'));
    }
  } catch (e) {
    alert('存档失败: ' + e);
  }
  mod.saving = false;
}

// ========== 全量数据查看 ==========

const fullViewVisible = ref(false);
const fullViewMod = ref<ModuleData | null>(null);
const fullViewDs = ref<DatasetData | null>(null);
const fullViewRecords = ref<any[]>([]);
const fullViewColumns = ref<string[]>([]);
const fullViewKeyword = ref('');

function openFullView(mod: ModuleData, ds: DatasetData) {
  fullViewMod.value = mod;
  fullViewDs.value = ds;
  fullViewKeyword.value = '';
  fullViewVisible.value = true;
  loadFullViewRecords();
}

function closeFullView() {
  fullViewVisible.value = false;
  fullViewMod.value = null;
  fullViewDs.value = null;
  fullViewRecords.value = [];
  fullViewColumns.value = [];
}

async function loadFullViewRecords() {
  if (!fullViewDs.value || !API) return;
  try {
    const rows = await API.ds.query(fullViewDs.value.datasetId, fullViewKeyword.value || null);
    fullViewRecords.value = rows;
    fullViewColumns.value = buildRecordColumns(rows);
  } catch (e) { console.error('加载记录失败:', e); fullViewRecords.value = []; fullViewColumns.value = []; }
}

// ========== 记录 CRUD（复用） ==========

const showRecordModal = ref(false);
const editingRecordId = ref('');
const recordForm = ref<any>({ status: '进行中' });
const recordFormFields = ref<string[]>([]);
const recordStatusOptions = ref<string[]>(['待办', '进行中', '已完成']);
const recordTypeOptions = ref<string[]>([]);

const showDetailModal = ref(false);
const viewingRecord = ref<any>(null);
const viewingRecordFields = ref<string[]>([]);

const showImportModalFlag = ref(false);
const importType = ref('json');
const importJsonData = ref('');
const importUrl = ref('');

let currentRecordDs: any = null;

function getSchemaFields(ds: any) {
  if (!ds) return [];
  const schema = typeof ds.schema === 'string' ? JSON.parse(ds.schema) : ds.schema;
  return (schema && schema.fields) || [];
}

function getSchemaOptions(ds: any, key: string) {
  if (!ds) return [];
  const schema = typeof ds.schema === 'string' ? JSON.parse(ds.schema) : ds.schema;
  const opts = schema?.[key];
  return Array.isArray(opts) && opts.length ? opts : [];
}

function showAddRecord() {
  const ds = fullViewDs.value;
  if (!ds) return;
  currentRecordDs = ds;
  editingRecordId.value = '';
  const schemaFields = getSchemaFields(ds);
  recordFormFields.value = schemaFields.map((f: any) => f.name || f.displayName).filter((f: string) => f !== 'status' && f !== 'id' && f !== 'type' && f !== '类型');
  recordStatusOptions.value = [...getSchemaOptions(ds, 'statusOptions'), '待办', '进行中', '已完成'];
  recordTypeOptions.value = getSchemaOptions(ds, 'typeOptions');
  const form: any = { status: '进行中' };
  if (recordTypeOptions.value.length) form.type = recordTypeOptions.value[0];
  recordFormFields.value.forEach((f: string) => { form[f] = ''; });
  recordForm.value = form;
  showRecordModal.value = true;
}

function editRecordPortal(mod: ModuleData, ds: DatasetData, rec: any) {
  currentRecordDs = ds;
  editingRecordId.value = rec.id;
  const schemaFields = getSchemaFields(ds);
  recordFormFields.value = schemaFields.map((f: any) => f.name || f.displayName).filter((f: string) => f !== 'status' && f !== 'id' && f !== 'type' && f !== '类型');
  recordStatusOptions.value = [...getSchemaOptions(ds, 'statusOptions'), '待办', '进行中', '已完成'];
  recordTypeOptions.value = getSchemaOptions(ds, 'typeOptions');
  const form: any = { status: rec.status || '', type: rec.type || '' };
  recordFormFields.value.forEach((f: string) => { form[f] = rec[f] || ''; });
  recordForm.value = form;
  showRecordModal.value = true;
}

async function saveRecord() {
  const ds = currentRecordDs || fullViewDs.value;
  if (!ds || !API) return;
  const record: any = {};
  recordFormFields.value.forEach(f => { record[f] = recordForm.value[f] || ''; });
  if (recordForm.value.status) record.status = recordForm.value.status;
  if (recordForm.value.type) record.type = recordForm.value.type;
  try {
    if (editingRecordId.value) {
      await API.ds.updateRecord(editingRecordId.value, record);
    } else {
      await API.ds.insert(ds.datasetId, record);
    }
    showRecordModal.value = false;
    if (fullViewVisible.value) {
      await loadFullViewRecords();
    }
    await loadAll();
  } catch (e) { console.error('保存记录失败:', e); }
}

async function deleteRecordPortal(rec: any) {
  if (!confirm('确定删除这条记录？') || !API) return;
  try {
    await API.ds.deleteRecord(rec.id);
    if (fullViewVisible.value) {
      await loadFullViewRecords();
    }
    await loadAll();
  } catch (e) { console.error('删除记录失败:', e); }
}

function viewRecordPortal(rec: any) {
  viewingRecord.value = rec;
  viewingRecordFields.value = Object.keys(rec).filter(k => k !== 'id' && !k.startsWith('_'));
  showDetailModal.value = true;
}

function editFromDetail() {
  if (viewingRecord.value) {
    const ds = fullViewDs.value;
    if (ds) {
      showDetailModal.value = false;
      editRecordPortal(fullViewMod.value!, ds, viewingRecord.value);
    }
  }
}

function deleteFromDetail() {
  if (viewingRecord.value) { showDetailModal.value = false; deleteRecordPortal(viewingRecord.value); }
}

// ========== 导入 ==========

function showImportModal() {
  importType.value = 'json';
  importJsonData.value = '';
  importUrl.value = '';
  showImportModalFlag.value = true;
}

async function doImport() {
  const ds = fullViewDs.value;
  if (!ds || !API) { alert('请先选择数据集'); return; }
  try {
    if (importType.value === 'json') {
      if (!importJsonData.value.trim()) { alert('请输入JSON数据'); return; }
      let arr;
      try { arr = JSON.parse(importJsonData.value); if (!Array.isArray(arr)) throw 0; }
      catch (e) { alert('JSON格式错误，需要数组'); return; }
      for (const item of arr) await API.ds.insert(ds.datasetId, item);
    } else {
      if (!importUrl.value.trim()) { alert('请输入URL'); return; }
      const r = await fetch(importUrl.value.trim());
      const data = await r.json();
      const arr = Array.isArray(data) ? data : [data];
      for (const item of arr) await API.ds.insert(ds.datasetId, item);
    }
    showImportModalFlag.value = false;
    alert('导入完成');
    if (fullViewVisible.value) await loadFullViewRecords();
    await loadAll();
  } catch (e) { console.error('导入失败:', e); alert('导入失败: ' + e); }
}

// ========== 工具函数 ==========

function buildRecordColumns(recs: any[]): string[] {
  const cols = new Set<string>();
  recs.forEach((r: any) => { Object.keys(r).forEach(k => { if (k !== 'id' && k !== '_created_at' && !k.startsWith('_')) cols.add(k); }); });
  return Array.from(cols).slice(0, 8);
}

function getPreviewColumns(ds: DatasetData): string[] {
  if (!ds.recentRecords || ds.recentRecords.length === 0) return [];
  return buildRecordColumns(ds.recentRecords);
}

function truncateText(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toISOString().slice(0, 10);
  } catch { return dateStr.slice(0, 10); }
}

function renderMarkdown(text: string): string {
  if (!text) return '';
  try { return marked(text); } catch { return text; }
}

onMounted(async () => {
  await loadAll();
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
.header-actions { display: flex; gap: 8px; }
.content-body {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column;
}
.content-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; color: var(--text-muted);
}
.empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.4; }
.empty-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
.empty-desc { font-size: 13px; }

/* Module Tabs */
.module-tabs {
  display: flex; gap: 0; padding: 0 20px; border-bottom: 1px solid var(--border);
  background: white; flex-shrink: 0; overflow-x: auto;
}
.module-tab {
  display: flex; align-items: center; gap: 6px; padding: 10px 16px;
  font-size: 13px; font-weight: 500; cursor: pointer; border: none;
  background: none; color: var(--text-secondary); white-space: nowrap;
  border-bottom: 2px solid transparent; transition: all 0.2s;
}
.module-tab:hover { color: var(--text-primary); background: var(--hover); }
.module-tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.tab-icon { font-size: 15px; }
.tab-count {
  font-size: 11px; background: rgba(0,0,0,0.06); padding: 0 6px;
  border-radius: 8px; color: var(--text-muted);
}
.module-tab.active .tab-count { background: rgba(99,102,241,0.1); color: var(--primary); }

/* Module Panel */
.module-panel {
  flex: 1; overflow: hidden; padding: 0;
  display: flex; flex-direction: column;
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--border);
  background: white; flex-shrink: 0;
}
.panel-title-area { display: flex; align-items: center; gap: 8px; }
.panel-icon { font-size: 18px; }
.panel-name { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.panel-desc { font-size: 12px; color: var(--text-muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panel-actions { display: flex; align-items: center; gap: 8px; }
.panel-meta { font-size: 12px; color: var(--text-muted); }
.panel-btn {
  background: none; border: none; cursor: pointer; font-size: 13px;
  padding: 2px 5px; border-radius: 3px; color: var(--text-muted); line-height: 1;
}
.panel-btn:hover { background: var(--hover); color: var(--text-primary); }
.panel-btn-danger:hover { color: #dc2626; }

/* Sub Tabs */
.panel-subtabs {
  display: flex; gap: 0; padding: 0 20px; border-bottom: 1px solid var(--border);
  background: white; flex-shrink: 0;
}
.subtab {
  padding: 10px 16px; font-size: 13px; font-weight: 500; cursor: pointer;
  border: none; background: none; color: var(--text-secondary);
  border-bottom: 2px solid transparent; transition: all 0.2s;
}
.subtab:hover { color: var(--text-primary); background: var(--hover); }
.subtab.active { color: var(--primary); border-bottom-color: var(--primary); }

/* AI Section */
.panel-ai-section { flex: 1; overflow-y: auto; }
.ai-body { padding: 16px 20px; background: #f8faff; min-height: 200px; }
.ai-loading { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 13px; }
.ai-text { font-size: 13px; line-height: 1.7; color: var(--text-primary); }
.ai-text :deep(pre) { background: #f1f5f9; padding: 8px 12px; border-radius: var(--radius-sm); overflow-x: auto; font-size: 12px; }
.ai-text :deep(code) { font-size: 12px; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
.ai-text :deep(h1) { font-size: 15px; margin: 12px 0 6px; }
.ai-text :deep(h2) { font-size: 14px; margin: 10px 0 5px; }
.ai-text :deep(h3) { font-size: 13px; margin: 8px 0 4px; }
.ai-text :deep(p) { margin: 4px 0; }
.ai-text :deep(ul) { padding-left: 18px; margin: 4px 0; }
.ai-text :deep(li) { margin: 2px 0; }
.ai-actions { display: flex; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border); }
.ai-empty { display: flex; align-items: center; gap: 12px; color: var(--text-muted); font-size: 13px; }

/* Dataset Section */
.panel-datasets { flex: 1; overflow-y: auto; }
.dataset-section { border-bottom: 1px solid var(--border); }
.dataset-section:last-child { border-bottom: none; }
.dataset-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; background: white;
}
.dataset-title-area { display: flex; align-items: center; gap: 6px; }
.dataset-icon { font-size: 14px; }
.dataset-name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.dataset-count { font-size: 11px; color: var(--text-muted); }
.dataset-actions { display: flex; align-items: center; gap: 6px; }
.ds-btn {
  background: none; border: none; cursor: pointer; font-size: 12px;
  padding: 1px 4px; border-radius: 3px; color: var(--text-muted); line-height: 1;
}
.ds-btn:hover { color: var(--text-primary); }
.ds-btn-danger:hover { color: #dc2626; }

/* Preview Table */
.preview-table {
  width: 100%; border-collapse: collapse; font-size: 12px;
  margin: 0 16px 8px; width: calc(100% - 32px);
}
.preview-table th {
  text-align: left; padding: 6px 10px; background: #f8fafc;
  border-bottom: 1px solid var(--border); font-weight: 600;
  color: var(--text-secondary); font-size: 11px;
}
.preview-table td { padding: 6px 10px; border-bottom: 1px solid var(--border); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview-table tr:hover { background: var(--hover); }
.th-actions { width: 60px; }
.action-cell { white-space: nowrap; }
.action-btn {
  background: none; border: none; cursor: pointer; font-size: 11px;
  color: var(--text-muted); padding: 1px 4px;
}
.action-btn:hover { color: var(--primary); }
.action-btn.danger:hover { color: var(--danger); }
.dataset-empty { padding: 8px 16px; font-size: 12px; color: var(--text-muted); }

/* Full View Modal */
.modal-box-wide { width: 90%; max-width: 1000px; }
.modal-header-actions { display: flex; align-items: center; gap: 8px; }
.modal-badge { font-size: 12px; color: var(--text-muted); background: #f5f5f7; padding: 2px 8px; border-radius: 10px; }
.fullview-toolbar {
  display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;
}
.search-box { position: relative; flex: 1; min-width: 160px; max-width: 260px; }
.search-box input {
  width: 100%; padding: 6px 10px; border: 1px solid var(--border);
  border-radius: var(--radius-sm); font-size: 13px; outline: none;
}
.search-box input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }

/* Data Table (full view) */
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

/* Modals */
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
.detail-row {
  display: flex; justify-content: space-between; padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.detail-row:last-child { border-bottom: none; }
.detail-row .label { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.detail-row .value { font-size: 13px; color: var(--text-primary); }
.import-type-btns { display: flex; gap: 8px; }
.right-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; color: var(--text-muted);
  padding: 40px 0;
}
.badge {
  display: inline-flex; align-items: center; padding: 2px 8px;
  border-radius: 20px; font-size: 12px; font-weight: 500;
}
.badge-gray { background: #f5f5f7; color: #909296; }

.spinner {
  width: 16px; height: 16px; border: 2px solid var(--border);
  border-top-color: var(--primary); border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>