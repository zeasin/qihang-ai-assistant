<template>
  <div class="data-module-view">
    <div class="content-header">
      <h1 class="content-title">{{ moduleName }}</h1>
      <div class="content-actions">
        <button class="btn btn-secondary btn-sm" @click="goBack">← 返回</button>
        <button class="btn btn-primary btn-sm" @click="showCreateDataset">+ 新建数据集</button>
      </div>
    </div>

    <div class="content-body">
      <!-- 概览区域 -->
      <div class="module-header">
        <span class="module-icon">{{ moduleIcon }}</span>
        <div>
          <div class="module-title">{{ moduleName }}</div>
          <div class="module-desc">{{ moduleDesc }}</div>
        </div>
        <div class="module-stats">
          <div class="stat-item">
            <div class="stat-value">{{ datasets.length }}</div>
            <div class="stat-label">数据集</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ totalRecords }}</div>
            <div class="stat-label">总记录</div>
          </div>
        </div>
      </div>

      <!-- 数据集标签页 -->
      <div class="tabs-nav">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'overview' }"
          @click="switchTab('overview')"
        >
          📊 概览
        </button>
        <button
          v-for="ds in datasets"
          :key="ds.id"
          class="tab-btn"
          :class="{ active: activeTab === ds.id }"
          @click="switchTab(ds.id)"
        >
          📋 {{ ds.name }}
          <span class="tab-count">{{ ds.recordCount || 0 }}</span>
        </button>
      </div>

      <!-- 概览内容 -->
      <div v-if="activeTab === 'overview'" class="tab-content">
        <div class="overview-grid">
          <div
            v-for="ds in datasets"
            :key="ds.id"
            class="overview-card"
          >
            <h3>📋 {{ ds.name }}</h3>
            <div class="overview-card-desc">{{ ds.description || '' }}</div>
            <div class="overview-card-stat">
              <span>总记录</span>
              <strong>{{ ds.recordCount || 0 }}</strong>
            </div>
          </div>
          <div v-if="datasets.length === 0" class="overview-card overview-card-full">
            <div class="empty-state">
              <div class="icon">📋</div>
              <div class="title">暂无数据集</div>
              <button class="btn btn-primary" @click="showCreateDataset">+ 新建数据集</button>
            </div>
          </div>
        </div>

        <!-- AI 分析 -->
        <div class="ai-analysis">
          <div class="ai-analysis-header">
            <div class="ai-analysis-title">🤖 AI 分析</div>
            <button class="btn btn-secondary btn-sm" @click="generateAnalysis">生成分析</button>
          </div>
          <div class="ai-analysis-content" v-html="analysisContent"></div>
        </div>
      </div>

      <!-- 数据集详情 -->
      <div v-else class="tab-content">
        <div class="toolbar">
          <div class="search-box">
            <input type="text" v-model="searchKeyword" placeholder="搜索记录..." @keyup.enter="loadRecords(0)">
          </div>
          <button class="btn btn-sm btn-secondary" @click="loadRecords(0)">搜索</button>
          <button class="btn btn-sm btn-primary" @click="showAddRecord">+ 新增</button>
          <button class="btn btn-sm btn-secondary" @click="showEditDataset(currentDs)">✏️ 编辑</button>
          <button class="btn btn-sm btn-secondary" @click="showImportModal">📥 导入</button>
          <button class="btn btn-sm btn-danger" @click="deleteDataset(currentDs)">🗑️ 删除</button>
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
        <div v-else class="empty-state">
          <div class="icon">📝</div>
          <div class="title">暂无记录</div>
          <button class="btn btn-primary" @click="showAddRecord">+ 新增记录</button>
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
            <input type="text" class="form-control" v-model="dsForm.name" placeholder="如：客户信息">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea class="form-control" v-model="dsForm.description" rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>类型</label>
            <input type="text" class="form-control" v-model="dsForm.type" placeholder="如：项目管理">
          </div>
          <div class="form-group">
            <label>状态</label>
            <input type="text" class="form-control" v-model="dsForm.status" placeholder="如：启用">
          </div>
          <div class="form-group">
            <label>Schema 字段（每行一个）</label>
            <textarea class="form-control" v-model="dsForm.schema" rows="3" placeholder="编号&#10;项目&#10;负责人"></textarea>
          </div>
          <div class="form-group">
            <label>类型选项（每行一个）</label>
            <textarea class="form-control" v-model="dsForm.typeOptions" rows="2" placeholder="需求&#10;Bug&#10;优化"></textarea>
          </div>
          <div class="form-group">
            <label>状态选项（每行一个）</label>
            <textarea class="form-control" v-model="dsForm.statusOptions" rows="2" placeholder="待办&#10;进行中&#10;已完成"></textarea>
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
            <input type="text" class="form-control" v-model="recordForm.status" placeholder="进行中">
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
            <textarea class="form-control" v-model="importJsonData" rows="8" placeholder="JSON数组格式"></textarea>
          </div>
          <div v-if="importType === 'url'" class="form-group">
            <label>数据 URL</label>
            <input type="text" class="form-control" v-model="importUrl" placeholder="https://example.com/data.json">
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
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

// ========== 模块信息 ==========
const moduleId = ref('');
const moduleName = ref('数据模块');
const moduleIcon = ref('📁');
const moduleDesc = ref('');

// ========== 数据集 ==========
const datasets = ref<any[]>([]);
const currentDs = ref<any>(null);
const activeTab = ref('overview');
const totalRecords = ref(0);

// ========== 记录 ==========
const records = ref<any[]>([]);
const recordColumns = ref<string[]>([]);
const searchKeyword = ref('');
const currentPage = ref(0);
const pageSize = 20;

// ========== 模态框状态 ==========
const showDsModal = ref(false);
const editingDsId = ref('');
const dsForm = ref({
  name: '', description: '', type: '', status: '',
  schema: '', typeOptions: '', statusOptions: ''
});

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

// ========== 加载数据 ==========
async function loadModuleData() {
  moduleId.value = route.query.id as string || '';
  moduleName.value = (route.query.name as string) || '数据模块';
  if (!moduleId.value) return;
}

// ========== 切换标签页 ==========
function switchTab(tabId: string) {
  activeTab.value = tabId;
  if (tabId !== 'overview') {
    currentDs.value = datasets.value.find((d: any) => d.id === tabId);
  }
}

// ========== 加载记录 ==========
async function loadRecords(page: number) {
  if (!currentDs.value) return;
  currentPage.value = page;
  records.value = [];
  recordColumns.value = [];
}

function buildRecordColumns(ds: any, recs: any[]): string[] {
  return [];
}

// ========== AI 分析 ==========
const analysisContent = ref('点击生成分析按钮，让 AI 帮您分析数据');

async function generateAnalysis() {
  analysisContent.value = '分析功能不可用（后端未连接）';
}

// ========== 数据集 CRUD ==========
function showCreateDataset() {
  editingDsId.value = '';
  dsForm.value = { name: '', description: '', type: '', status: '', schema: '', typeOptions: '', statusOptions: '' };
  showDsModal.value = true;
}

function showEditDataset(ds: any) {
  if (!ds) return;
  editingDsId.value = ds.id || '';
  dsForm.value = {
    name: ds.name || '',
    description: ds.description || '',
    type: ds.type || '',
    status: ds.status || '',
    schema: (ds.schema && ds.schema.fields) ? ds.schema.fields.map((f: any) => f.name).join('\n') : '',
    typeOptions: (ds.schema && ds.schema.typeOptions) ? ds.schema.typeOptions.join('\n') : '',
    statusOptions: (ds.schema && ds.schema.statusOptions) ? ds.schema.statusOptions.join('\n') : ''
  };
  showDsModal.value = true;
}

async function saveDataset() {
  if (!dsForm.value.name.trim()) {
    alert('请输入数据集名称');
    return;
  }
  showDsModal.value = false;
}

async function deleteDataset(ds: any) {
}

// ========== 记录 CRUD ==========
function showAddRecord() {
  if (!currentDs.value) return;
  editingRecordId.value = '';

  const schemaFields = (currentDs.value.schema && currentDs.value.schema.fields) || [];
  recordFormFields.value = schemaFields.map((f: any) => f.name || f.displayName).filter((f: string) => f !== 'status' && f !== 'id');

  const form: any = { status: currentDs.value.status || '进行中' };
  recordFormFields.value.forEach((f: string) => { form[f] = ''; });
  recordForm.value = form;

  showRecordModal.value = true;
}

function editRecord(rec: any) {
  if (!currentDs.value) return;
  editingRecordId.value = rec._id || rec.id;

  const schemaFields = (currentDs.value.schema && currentDs.value.schema.fields) || [];
  recordFormFields.value = schemaFields.map((f: any) => f.name || f.displayName).filter((f: string) => f !== 'status' && f !== 'id');

  const form: any = { status: rec.status || '' };
  recordFormFields.value.forEach((f: string) => { form[f] = rec[f] || ''; });
  recordForm.value = form;

  showRecordModal.value = true;
}

async function saveRecord() {
  if (!currentDs.value) return;
  showRecordModal.value = false;
}

async function deleteRecord(rec: any) {
}

// ========== 详情查看 ==========
function viewRecord(rec: any) {
  viewingRecord.value = rec;
  showDetailModal.value = true;
}

function editFromDetail() {
  if (viewingRecord.value) {
    showDetailModal.value = false;
    editRecord(viewingRecord.value);
  }
}

function deleteFromDetail() {
  if (viewingRecord.value) {
    showDetailModal.value = false;
    deleteRecord(viewingRecord.value);
  }
}

// ========== 导入 ==========
function showImportModal() {
  importType.value = 'json';
  importJsonData.value = '';
  importUrl.value = '';
  showImportModalFlag.value = true;
}

async function doImport() {
  if (!currentDs.value) {
    alert('请先选择数据集');
    return;
  }
  showImportModalFlag.value = false;
}

// ========== 导航 ==========
const goBack = () => {
  router.push('/data');
};

onMounted(() => {
  loadModuleData();
});
</script>

<style scoped>
.data-module-view {
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

.content-actions {
  display: flex;
  gap: 8px;
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* 模块头部 */
.module-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.module-icon {
  font-size: 32px;
}

.module-title {
  font-size: 20px;
  font-weight: 600;
}

.module-desc {
  font-size: 13px;
  color: var(--text-muted);
}

.module-stats {
  display: flex;
  gap: 24px;
  margin-left: auto;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

/* 标签页 */
.tabs-nav {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}

.tab-btn {
  padding: 8px 16px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: var(--hover);
  color: var(--text-primary);
}

.tab-btn.active {
  background: rgba(99, 102, 241, 0.1);
  color: var(--primary);
}

.tab-count {
  background: var(--border);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: 4px;
}

/* 概览网格 */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.overview-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px;
}

.overview-card-full {
  grid-column: 1 / -1;
}

.overview-card h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.overview-card-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.overview-card-stat {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
}

.overview-card-stat strong {
  color: var(--primary);
  font-weight: 600;
}

/* AI 分析 */
.ai-analysis {
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px;
  margin-top: 16px;
}

.ai-analysis-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ai-analysis-title {
  font-size: 14px;
  font-weight: 600;
}

.ai-analysis-content {
  font-size: 13px;
  line-height: 1.7;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: 300px;
}

.search-box input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.search-box input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  outline: none;
}

/* 数据表格 */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  background: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  overflow: hidden;
}

.data-table th {
  text-align: left;
  padding: 10px 12px;
  background: #f8fafc;
  border-bottom: 2px solid var(--border);
  font-weight: 600;
  color: var(--text-secondary);
}

.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.data-table tr:hover {
  background: var(--hover);
}

.action-cell {
  white-space: nowrap;
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted);
  padding: 2px 6px;
}

.action-btn:hover {
  color: var(--primary);
}

.action-btn.danger:hover {
  color: var(--danger);
}

/* 详情行 */
.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row .label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.detail-row .value {
  font-size: 13px;
  color: var(--text-primary);
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.empty-state .icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-state .title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 12px;
  color: var(--text-secondary);
}

/* 模态框 */
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
  width: 520px;
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

.form-control {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  outline: none;
  transition: all 0.2s;
  background: white;
}

.form-control:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

textarea.form-control {
  resize: vertical;
  font-family: inherit;
}

/* 导入方式按钮 */
.import-type-btns {
  display: flex;
  gap: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.badge-gray {
  background: #f5f5f7;
  color: #909296;
}
</style>
