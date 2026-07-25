<template>
  <div class="planner-view">
    <div class="content-header">
      <h1 class="content-title">任务提醒</h1>
    </div>
    
    <div class="content-body">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">任务看板</h3>
          <button class="btn btn-primary btn-sm" @click="createTask">新建任务</button>
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
      
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">定时提醒</h3>
          <button class="btn btn-primary btn-sm" @click="createReminder">新建提醒</button>
        </div>
        
        <div class="reminder-grid">
          <div 
            v-for="reminder in reminders" 
            :key="reminder.id" 
            class="reminder-card"
            @click="editReminder(reminder)"
          >
            <div class="reminder-header">
              <span class="reminder-name">{{ reminder.name }}</span>
              <div 
                class="reminder-toggle" 
                :class="{ on: reminder.enabled }"
                @click.stop="toggleReminder(reminder)"
              ></div>
            </div>
            <div class="reminder-message">{{ reminder.message }}</div>
            <div class="reminder-schedule">⏰ {{ reminder.schedule || getScheduleText(reminder) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 任务编辑模态框 -->
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

    <!-- 提醒编辑模态框 -->
    <div v-if="showReminderModal" class="modal-overlay" @click="showReminderModal = false">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>{{ isEditingReminder ? '编辑提醒' : '新建提醒' }}</h3>
          <button class="btn btn-secondary" @click="showReminderModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>提醒名称 *</label>
            <input type="text" class="form-control" v-model="editingReminder.name" placeholder="例如：下班日报提醒">
          </div>
          <div class="form-group">
            <label>提醒消息</label>
            <textarea class="form-control" v-model="editingReminder.message" rows="3" placeholder="提醒内容（可选）"></textarea>
          </div>
          <div class="form-group">
            <label>提醒类型 *</label>
            <select class="form-control" v-model="editingReminder.type">
              <option value="daily">📅 每天 - 每天定时提醒</option>
              <option value="once">🔔 一次 - 指定日期提醒</option>
              <option value="weekly">📆 每周 - 每周特定星期几提醒</option>
              <option value="monthly">📅 每月 - 每月特定几号提醒</option>
              <option value="yearly">🎂 每年 - 每年特定日期提醒</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>提醒时间 *</label>
              <input type="time" class="form-control" v-model="editingReminder.time" value="09:00">
            </div>
            <div class="form-group" v-if="editingReminder.type === 'weekly'">
              <label>星期几</label>
              <select class="form-control" v-model="editingReminder.dayOfWeek">
                <option value="1">周一</option>
                <option value="2">周二</option>
                <option value="3">周三</option>
                <option value="4">周四</option>
                <option value="5">周五</option>
                <option value="6">周六</option>
                <option value="7">周日</option>
              </select>
            </div>
            <div class="form-group" v-if="editingReminder.type === 'once'">
              <label>日期</label>
              <input type="date" class="form-control" v-model="editingReminder.date">
            </div>
            <div class="form-group" v-if="editingReminder.type === 'monthly'">
              <label>几号</label>
              <input type="number" class="form-control" v-model="editingReminder.dayOfMonth" min="1" max="31" placeholder="1-31">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showReminderModal = false">取消</button>
          <button class="btn btn-danger" v-if="isEditingReminder" @click="openDeleteModal(editingReminder.id, 'reminder')">🗑️ 删除</button>
          <button class="btn btn-primary" @click="saveReminder">保存</button>
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
import { ref, computed, onMounted } from 'vue';

interface Task {
  id: number;
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  status: string;
}

interface Reminder {
  id: number;
  name: string;
  message: string;
  schedule: string;
  type: string;
  time: string;
  date: string;
  dayOfWeek: string;
  dayOfMonth: string;
  monthDay: string;
  enabled: boolean;
}

const tasks = ref<Task[]>([]);
const reminders = ref<Reminder[]>([]);

const pendingTasks = computed(() => tasks.value.filter(t => t.status === 'pending'));
const progressTasks = computed(() => tasks.value.filter(t => t.status === 'in_progress'));
const doneTasks = computed(() => tasks.value.filter(t => t.status === 'done'));

// ========== 模态框状态 ==========
const showTaskModal = ref(false);
const isEditingTask = ref(false);
const editingTask = ref<Task>({
  id: 0, title: '', description: '', priority: 'mid', dueDate: '', status: 'pending'
});

const showReminderModal = ref(false);
const isEditingReminder = ref(false);
const editingReminder = ref<Reminder>({
  id: 0, name: '', message: '', type: 'daily', time: '09:00',
  date: '', dayOfWeek: '1', dayOfMonth: '',
  monthDay: '', schedule: '', enabled: true
});

const showDeleteModal = ref(false);
const deleteId = ref(0);
const deleteType = ref('');

// ========== 任务 CRUD ==========
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
  showTaskModal.value = false;
}

// ========== 提醒 CRUD ==========
function createReminder() {
  isEditingReminder.value = false;
  editingReminder.value = {
    id: 0, name: '', message: '', type: 'daily', time: '09:00',
    date: '', dayOfWeek: '1', dayOfMonth: '',
    monthDay: '', schedule: '', enabled: true
  };
  showReminderModal.value = true;
}

function editReminder(reminder: Reminder) {
  isEditingReminder.value = true;
  editingReminder.value = { ...reminder };
  showReminderModal.value = true;
}

async function saveReminder() {
  if (!editingReminder.value.name.trim()) {
    alert('请输入提醒名称');
    return;
  }
  showReminderModal.value = false;
}

async function toggleReminder(reminder: Reminder) {
  reminder.enabled = !reminder.enabled;
}

// ========== 删除确认 ==========
function openDeleteModal(id: number, type: string) {
  deleteId.value = id;
  deleteType.value = type;
  showDeleteModal.value = true;
}

async function confirmDelete() {
  showDeleteModal.value = false;
}

// ========== 工具函数 ==========
function getScheduleText(reminder: Reminder): string {
  const time = reminder.time || '09:00';
  switch (reminder.type) {
    case 'daily': return '每天 ' + time;
    case 'once': return '一次 ' + (reminder.date || '') + ' ' + time;
    case 'weekly':
      const days = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      return '每周' + (days[parseInt(reminder.dayOfWeek) || 1]) + ' ' + time;
    case 'monthly': return '每月' + (reminder.dayOfMonth || 1) + '号 ' + time;
    case 'yearly': return '每年 ' + (reminder.monthDay || '1月1日') + ' ' + time;
    default: return time;
  }
}

onMounted(() => {
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

.reminder-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.reminder-card {
  background: white;
  border-radius: var(--radius-md);
  padding: 16px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s;
}

.reminder-card:hover {
  box-shadow: var(--shadow-md);
}

.reminder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.reminder-name {
  font-size: 14px;
  font-weight: 600;
}

.reminder-toggle {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: #e2e8f0;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

.reminder-toggle.on {
  background: var(--primary);
}

.reminder-toggle::after {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  top: 2px;
  left: 2px;
  transition: all 0.2s;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.reminder-toggle.on::after {
  left: 20px;
}

.reminder-message {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.reminder-schedule {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
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
</style>
