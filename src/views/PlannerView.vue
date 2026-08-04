<template>
  <div class="planner-view">
    <div class="content-header">
      <h1 class="content-title">任务</h1>
      <div class="header-actions">
        <router-link to="/reminders" class="btn btn-secondary btn-sm">⏰ 提醒</router-link>
        <button class="btn btn-primary btn-sm" @click="createTask">新建待办</button>
        <button class="btn btn-primary btn-sm" @click="createAiTask">+ 新建 AI 任务</button>
      </div>
    </div>

    <div class="content-body">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">待办</h3>
          <span class="card-subtitle">{{ doneTasks.length }}/{{ tasks.length }} 已完成</span>
        </div>

        <div class="task-board">
          <div class="task-column column-pending">
            <div class="column-header">
              <span class="column-title">待处理</span>
              <span class="column-count">{{ pendingTasks.length }}</span>
            </div>
            <div
              v-for="task in pendingTasks"
              :key="task.id"
              class="task-card"
              @click="editTask(task)"
            >
              <div class="task-title">{{ task.title }}</div>
              <div class="task-meta">
                <span :class="'priority-' + task.priority">{{ task.priority }}</span>
                <span class="task-due">📅 {{ task.dueDate }}</span>
              </div>
            </div>
          </div>

          <div class="task-column column-progress">
            <div class="column-header">
              <span class="column-title">进行中</span>
              <span class="column-count">{{ progressTasks.length }}</span>
            </div>
            <div
              v-for="task in progressTasks"
              :key="task.id"
              class="task-card"
              @click="editTask(task)"
            >
              <div class="task-title">{{ task.title }}</div>
              <div class="task-meta">
                <span :class="'priority-' + task.priority">{{ task.priority }}</span>
                <span class="task-due">📅 {{ task.dueDate }}</span>
              </div>
            </div>
          </div>

          <div class="task-column column-done">
            <div class="column-header">
              <span class="column-title">已完成</span>
              <span class="column-count">{{ doneTasks.length }}</span>
            </div>
            <div
              v-for="task in doneTasks"
              :key="task.id"
              class="task-card"
              @click="editTask(task)"
            >
              <div class="task-title">{{ task.title }}</div>
              <div class="task-meta">
                <span :class="'priority-' + task.priority">{{ task.priority }}</span>
                <span class="task-due">📅 {{ task.dueDate }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- AI 自执行任务 -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🤖 AI 自执行任务</h3>
          <span class="card-subtitle">AI 按设定的触发条件自动执行，完成后通知你并保存结果</span>
        </div>

        <div v-if="aiTasks.length === 0" class="empty-state">
          <div class="empty-icon">🤖</div>
          <div class="empty-text">还没有 AI 任务。例如：「每天早上 9 点帮我总结昨天的数据」「每周五生成周报并推送飞书」</div>
        </div>

        <div v-else class="ai-task-list">
          <div v-for="task in aiTasks" :key="task.id" class="ai-task-card">
            <div class="ai-task-main">
              <div class="ai-task-head">
                <span class="ai-task-title">{{ task.title }}</span>
                <span :class="['status-badge', 'status-' + task.status]">{{ statusText(task.status) }}</span>
                <span v-if="task.last_status === 'FAILED'" class="status-badge status-FAILED">执行失败</span>
              </div>
              <div class="ai-task-desc">{{ getTriggerText(task) }}</div>
              <div v-if="task.last_result" class="ai-task-result">
                <span class="result-label">最近结果：</span>{{ truncate(task.last_result, 120) }}
              </div>
              <div v-if="task.last_run_at" class="ai-task-run">
                最近执行：{{ task.last_run_at }}（{{ task.last_status === 'SUCCESS' ? '成功' : task.last_status === 'FAILED' ? '失败' : task.last_status || '未执行' }}）
              </div>
            </div>
            <div class="ai-task-actions">
              <button
                class="btn btn-primary btn-xs"
                :disabled="task.status === 'in_progress'"
                @click="runAiTask(task)"
              >{{ task.status === 'in_progress' ? '执行中…' : '▶ 立即执行' }}</button>
              <button class="btn btn-secondary btn-xs" @click="toggleHistory(task)">{{ task.showHistory ? '收起记录' : '执行记录' }}</button>
              <button class="btn btn-secondary btn-xs" @click="editAiTask(task)">编辑</button>
              <button class="btn btn-danger btn-xs" @click="openDeleteModal(task.id, 'ai_task')">删除</button>
            </div>
            <div v-if="task.showHistory" class="ai-task-history">
              <div v-if="!task.executions || task.executions.length === 0" class="history-empty">暂无执行记录</div>
              <div v-for="ex in task.executions" :key="ex.id" class="history-item">
                <span :class="['status-badge', 'status-' + ex.status]">{{ ex.status }}</span>
                <span class="history-trigger">{{ triggerLabel(ex.trigger_type) }}</span>
                <span class="history-time">{{ ex.start_time }}</span>
                <div v-if="ex.error_message" class="history-error">❌ {{ ex.error_message }}</div>
                <div v-if="ex.result_text" class="history-result">{{ truncate(ex.result_text, 200) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 待办编辑模态框 -->
    <div v-if="showTaskModal" class="modal-overlay" @click="showTaskModal = false">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>{{ isEditingTask ? '编辑任务' : '新建任务' }}</h3>
          <button class="btn btn-secondary" @click="showTaskModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>标题 *</label>
            <input type="text" class="form-control" v-model="editingTask.title" placeholder="任务标题">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea class="form-control" v-model="editingTask.description" rows="3" placeholder="任务描述（可选）"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>优先级</label>
              <select class="form-control" v-model="editingTask.priority">
                <option value="high">🔴 高优先级</option>
                <option value="mid">🟡 中优先级</option>
                <option value="low">🟢 低优先级</option>
              </select>
            </div>
            <div class="form-group">
              <label>截止日期</label>
              <input type="date" class="form-control" v-model="editingTask.dueDate">
            </div>
          </div>
          <div class="form-group" v-if="isEditingTask">
            <label>状态</label>
            <select class="form-control" v-model="editingTask.status">
              <option value="pending">📋 待办</option>
              <option value="in_progress">🔄 进行中</option>
              <option value="done">✅ 已完成</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showTaskModal = false">取消</button>
          <button class="btn btn-danger" v-if="isEditingTask" @click="openDeleteModal(editingTask.id, 'task')">🗑️ 删除</button>
          <button class="btn btn-primary" @click="saveTask">保存</button>
        </div>
      </div>
    </div>

    <!-- AI 任务编辑模态框 -->
    <div v-if="showAiTaskModal" class="modal-overlay" @click="showAiTaskModal = false">
      <div class="modal-box modal-box-lg" @click.stop>
        <div class="modal-header">
          <h3>{{ isEditingAiTask ? '编辑 AI 任务' : '新建 AI 任务' }}</h3>
          <button class="btn btn-secondary" @click="showAiTaskModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>任务标题 *</label>
            <input type="text" class="form-control" v-model="editingAiTask.title" placeholder="例如：每日数据总结">
          </div>
          <div class="form-group">
            <label>任务指令（AI 将据此自主执行）</label>
            <textarea class="form-control" v-model="editingAiTask.prompt" rows="5" placeholder="例如：查询今天的数据中心记录和待办，生成一份工作总结并保存到笔记"></textarea>
          </div>
          <div class="form-group">
            <label>触发方式</label>
            <select class="form-control" v-model="editingAiTask.trigger_type">
              <option value="manual">👆 手动 - 只在我点击「立即执行」时运行</option>
              <option value="once">⏰ 一次性 - 到指定时间执行一次</option>
              <option value="cycle">🔁 循环 - 按周期自动执行</option>
            </select>
          </div>

          <div class="form-row" v-if="editingAiTask.trigger_type === 'once'">
            <div class="form-group">
              <label>执行时间 *</label>
              <input type="datetime-local" class="form-control" v-model="editingAiTask.scheduled_start">
            </div>
          </div>

          <template v-if="editingAiTask.trigger_type === 'cycle'">
            <div class="form-row">
              <div class="form-group">
                <label>循环类型</label>
                <select class="form-control" v-model="editingAiTask.cycle_type">
                  <option value="daily">📅 每天</option>
                  <option value="weekly">📆 每周</option>
                  <option value="monthly">🗓️ 每月</option>
                  <option value="cron">⚙️ Cron 表达式</option>
                </select>
              </div>
              <div class="form-group" v-if="editingAiTask.cycle_type !== 'cron'">
                <label>执行时间</label>
                <input type="time" class="form-control" v-model="editingAiTask.cycle_time">
              </div>
            </div>
            <div class="form-group" v-if="editingAiTask.cycle_type === 'weekly'">
              <label>星期几（可多选）</label>
              <div class="week-select">
                <label v-for="d in weekDays" :key="d.value" class="week-chip">
                  <input type="checkbox" :value="d.value" v-model="editingWeekDays">
                  {{ d.label }}
                </label>
              </div>
            </div>
            <div class="form-group" v-if="editingAiTask.cycle_type === 'monthly'">
              <label>每月几号</label>
              <input type="number" class="form-control" v-model.number="editingMonthDays" min="1" max="31" placeholder="如 1 或 1,15">
            </div>
            <div class="form-group" v-if="editingAiTask.cycle_type === 'cron'">
              <label>Cron 表达式</label>
              <input type="text" class="form-control" v-model="editingAiTask.cycle_value" placeholder="如 0 9 * * *（每天早上 9 点）">
            </div>
          </template>

          <div class="form-row">
            <div class="form-group">
              <label>结果保存位置（相对笔记库，留空自动保存）</label>
              <input type="text" class="form-control" v-model="editingAiTask.output_target" placeholder="如 任务输出/日报.md">
            </div>
            <div class="form-group">
              <label>&nbsp;</label>
              <label class="check-item">
                <input type="checkbox" v-model="editingAiTask.notify_feishu">
                完成后推送飞书
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showAiTaskModal = false">取消</button>
          <button class="btn btn-danger" v-if="isEditingAiTask" @click="openDeleteModal(editingAiTask.id, 'ai_task')">🗑️ 删除</button>
          <button class="btn btn-primary" @click="saveAiTask">保存</button>
        </div>
      </div>
    </div>

    <!-- 删除确认模态框 -->
    <div v-if="showDeleteModal" class="modal-overlay" @click="showDeleteModal = false">
      <div class="modal-box" style="width:400px;" @click.stop>
        <div class="modal-header">
          <h3>确认删除</h3>
          <button class="btn btn-secondary" @click="showDeleteModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p style="color:#94a3b8;font-size:13px;">确定要删除吗？此操作不可撤销。</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showDeleteModal = false">取消</button>
          <button class="btn btn-danger" @click="confirmDelete">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const API = window.electronAPI;

interface Task {
  id: number;
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  status: string;
}

interface AiTask {
  id: number;
  title: string;
  prompt: string;
  description: string;
  priority: string;
  status: string;
  trigger_type: string;
  scheduled_start: string;
  cycle_type: string;
  cycle_value: string;
  cycle_time: string;
  cycle_end: string;
  output_type: string;
  output_target: string;
  notify_feishu: boolean;
  dataset_id: string;
  record_id: string;
  project_id: number | null;
  last_result: string;
  last_run_at: string;
  last_status: string;
  executions?: any[];
  showHistory?: boolean;
}

const tasks = ref<Task[]>([]);
const aiTasks = ref<AiTask[]>([]);

const pendingTasks = computed(() => tasks.value.filter(t => t.status === 'pending'));
const progressTasks = computed(() => tasks.value.filter(t => t.status === 'in_progress'));
const doneTasks = computed(() => tasks.value.filter(t => t.status === 'done'));

// ========== 模态框状态 ==========
const showTaskModal = ref(false);
const isEditingTask = ref(false);
const editingTask = ref<Task>({
  id: 0, title: '', description: '', priority: 'mid', dueDate: '', status: 'pending'
});

const showAiTaskModal = ref(false);
const isEditingAiTask = ref(false);
const editingAiTask = ref<AiTask>({
  id: 0, title: '', prompt: '', description: '', priority: 'mid', status: 'pending',
  trigger_type: 'manual', scheduled_start: '', cycle_type: 'daily', cycle_value: '',
  cycle_time: '09:00', cycle_end: '', output_type: '', output_target: '',
  notify_feishu: false, dataset_id: '', record_id: '', project_id: null,
  last_result: '', last_run_at: '', last_status: ''
});
const editingWeekDays = ref<number[]>([]);
const editingMonthDays = ref<number | string>(1);

const showDeleteModal = ref(false);
const deleteId = ref('');
const deleteType = ref('');

const weekDays = [
  { label: '周一', value: 1 }, { label: '周二', value: 2 }, { label: '周三', value: 3 },
  { label: '周四', value: 4 }, { label: '周五', value: 5 }, { label: '周六', value: 6 },
  { label: '周日', value: 0 },
];

// ========== 待办 CRUD ==========
async function loadTodos() {
  try {
    const list = await API.todo.list();
    tasks.value = list.map((t: any) => ({
      id: t.id, title: t.title, description: t.description || '',
      priority: t.priority || 'mid', dueDate: t.due_date || '', status: t.status || 'pending'
    }));
  } catch { tasks.value = []; }
}

function createTask() {
  isEditingTask.value = false;
  editingTask.value = { id: 0, title: '', description: '', priority: 'mid', dueDate: '', status: 'pending' };
  showTaskModal.value = true;
}

function editTask(task: Task) {
  isEditingTask.value = true;
  editingTask.value = { ...task };
  showTaskModal.value = true;
}

async function saveTask() {
  if (!editingTask.value.title.trim()) {
    alert('请输入任务标题');
    return;
  }
  const data = {
    title: editingTask.value.title,
    description: editingTask.value.description,
    priority: editingTask.value.priority,
    due_date: editingTask.value.dueDate,
    status: editingTask.value.status,
  };
  try {
    if (isEditingTask.value) {
      await API.todo.update(editingTask.value.id, data);
    } else {
      await API.todo.add(data);
    }
    showTaskModal.value = false;
    await loadTodos();
  } catch (e: any) { alert('操作失败: ' + (e.message || e)); }
}

// ========== AI 任务 CRUD ==========
async function loadAiTasks() {
  try {
    aiTasks.value = (await API.task.list()).map((t: any) => ({
      ...t,
      notify_feishu: !!t.notify_feishu,
      showHistory: false,
    }));
  } catch { aiTasks.value = []; }
}

function emptyAiTask(): AiTask {
  return {
    id: 0, title: '', prompt: '', description: '', priority: 'mid', status: 'pending',
    trigger_type: 'manual', scheduled_start: '', cycle_type: 'daily', cycle_value: '',
    cycle_time: '09:00', cycle_end: '', output_type: '', output_target: '',
    notify_feishu: false, dataset_id: '', record_id: '', project_id: null,
    last_result: '', last_run_at: '', last_status: ''
  };
}

function createAiTask() {
  isEditingAiTask.value = false;
  editingAiTask.value = emptyAiTask();
  editingWeekDays.value = [];
  editingMonthDays.value = 1;
  showAiTaskModal.value = true;
}

function editAiTask(task: AiTask) {
  isEditingAiTask.value = true;
  editingAiTask.value = { ...task };
  editingWeekDays.value = String(task.cycle_value || '').split(',').filter(Boolean).map(Number);
  editingMonthDays.value = task.cycle_value || 1;
  showAiTaskModal.value = true;
}

async function saveAiTask() {
  if (!editingAiTask.value.title.trim()) {
    alert('请输入任务标题');
    return;
  }
  if (editingAiTask.value.trigger_type === 'once' && !editingAiTask.value.scheduled_start) {
    alert('一次性任务请选择执行时间');
    return;
  }
  const t = editingAiTask.value;
  let cycleValue = t.cycle_value || '';
  if (t.cycle_type === 'weekly') cycleValue = editingWeekDays.value.join(',');
  if (t.cycle_type === 'monthly') cycleValue = String(editingMonthDays.value || 1);
  const data = {
    title: t.title,
    prompt: t.prompt,
    description: t.description,
    priority: t.priority,
    trigger_type: t.trigger_type,
    scheduled_start: t.trigger_type === 'once' ? t.scheduled_start : '',
    cycle_type: t.trigger_type === 'cycle' ? t.cycle_type : '',
    cycle_value: t.trigger_type === 'cycle' ? cycleValue : '',
    cycle_time: t.trigger_type === 'cycle' ? t.cycle_time : '',
    output_target: t.output_target,
    notify_feishu: t.notify_feishu ? 1 : 0,
    status: 'pending',
  };
  try {
    if (isEditingAiTask.value) {
      await API.task.update(t.id, data);
    } else {
      await API.task.add(data);
    }
    showAiTaskModal.value = false;
    await loadAiTasks();
  } catch (e: any) { alert('操作失败: ' + (e.message || e)); }
}

async function runAiTask(task: AiTask) {
  try {
    await API.task.execute(task.id);
    await loadAiTasks();
  } catch (e: any) { alert('执行失败: ' + (e.message || e)); }
}

async function toggleHistory(task: AiTask) {
  task.showHistory = !task.showHistory;
  if (task.showHistory && !task.executions) {
    try {
      task.executions = await API.task.executions(task.id);
    } catch { task.executions = []; }
  }
}

// ========== 删除确认 ==========
function openDeleteModal(id: string | number, type: string) {
  deleteId.value = String(id);
  deleteType.value = type;
  showDeleteModal.value = true;
}

async function confirmDelete() {
  try {
    if (deleteType.value === 'reminder') {
      await API.reminder.remove(deleteId.value);
    } else if (deleteType.value === 'task') {
      await API.todo.remove(parseInt(deleteId.value));
      await loadTodos();
    } else if (deleteType.value === 'ai_task') {
      await API.task.remove(parseInt(deleteId.value));
      await loadAiTasks();
    }
  } catch {}
  showDeleteModal.value = false;
}

// ========== 工具函数 ==========
function statusText(status: string): string {
  switch (status) {
    case 'pending': return '待执行';
    case 'in_progress': return '执行中';
    case 'done': return '已完成';
    default: return status;
  }
}

function getTriggerText(task: AiTask): string {
  if (task.trigger_type === 'once') return '⏰ 一次性：' + (task.scheduled_start || '未设置');
  if (task.trigger_type === 'cycle') {
    switch (task.cycle_type) {
      case 'weekly': return '🔁 每周' + (task.cycle_value || '') + ' ' + (task.cycle_time || '');
      case 'monthly': return '🔁 每月' + (task.cycle_value || '') + '号 ' + (task.cycle_time || '');
      case 'cron': return '🔁 Cron：' + (task.cycle_value || '');
      default: return '🔁 每天 ' + (task.cycle_time || '');
    }
  }
  return '👆 手动执行';
}

function triggerLabel(type: string): string {
  switch (type) {
    case 'manual': return '手动';
    case 'scheduled': return '定时';
    default: return type;
  }
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function onTaskChanged() {
  loadAiTasks();
}

onMounted(async () => {
  await loadTodos();
  await loadAiTasks();
  window.electronAPI?.on?.('task:changed', onTaskChanged);
});

onBeforeUnmount(() => {
  window.electronAPI?.removeAllListeners?.('task:changed');
});
</script>

<style scoped>
.planner-view {
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

.header-actions {
  display: flex;
  gap: 8px;
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.card {
  background: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  padding: 24px;
  margin-bottom: 24px;
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

.card-subtitle {
  font-size: 12px;
  color: var(--text-muted);
}

.task-board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.task-column {
  background: #f8fafc;
  border-radius: var(--radius-md);
  padding: 16px;
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.column-title {
  font-size: 14px;
  font-weight: 600;
}

.column-count {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
}

.column-pending .column-count {
  background: rgba(251, 146, 60, 0.1);
  color: #fb923c;
}

.column-progress .column-count {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.column-done .column-count {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.task-card {
  background: white;
  border-radius: var(--radius-sm);
  padding: 14px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--border);
}

.task-card:hover {
  box-shadow: var(--shadow-md);
}

.task-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.priority-high {
  color: #ef4444;
}

.priority-mid {
  color: #fb923c;
}

.priority-low {
  color: #22c55e;
}

.task-due {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* AI 任务 */
.empty-state {
  text-align: center;
  padding: 40px 0;
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 14px;
  color: var(--text-muted);
  max-width: 480px;
  margin: 0 auto;
}

.ai-task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-task-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  transition: all 0.2s;
}

.ai-task-card:hover {
  box-shadow: var(--shadow-sm);
}

.ai-task-main {
  flex: 1;
}

.ai-task-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.ai-task-title {
  font-size: 15px;
  font-weight: 600;
}

.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.status-pending { background: rgba(251, 146, 60, 0.1); color: #fb923c; }
.status-in_progress { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.status-done { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
.status-SUCCESS { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
.status-FAILED { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
.status-RUNNING { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }

.ai-task-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.ai-task-result {
  font-size: 13px;
  color: var(--text-secondary);
  background: #f8fafc;
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-bottom: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}

.result-label {
  font-weight: 500;
}

.ai-task-run {
  font-size: 12px;
  color: var(--text-muted);
}

.ai-task-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.btn-xs {
  padding: 4px 10px;
  font-size: 12px;
}

.ai-task-history {
  margin-top: 12px;
  border-top: 1px dashed var(--border);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  font-size: 12px;
  color: var(--text-secondary);
  background: #f8fafc;
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.history-empty {
  font-size: 12px;
  color: var(--text-muted);
}

.history-trigger, .history-time {
  color: var(--text-muted);
}

.history-error {
  width: 100%;
  color: #ef4444;
}

.history-result {
  width: 100%;
  white-space: pre-wrap;
  word-break: break-all;
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

.modal-box-lg {
  width: 640px;
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
  margin-bottom: 16px;
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
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  outline: none;
  background: white;
}

.form-control:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

textarea.form-control {
  resize: vertical;
  min-height: 80px;
}

select.form-control {
  cursor: pointer;
}

.check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 10px 0;
  cursor: pointer;
}

.week-select {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.week-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
}

.week-chip:hover {
  border-color: var(--primary);
}
</style>
