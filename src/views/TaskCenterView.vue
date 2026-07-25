<template>
  <div class="task-center">
    <div class="content-body">
      <div class="task-list-header">
        <span class="task-list-title">待办</span>
        <button class="btn btn-sm btn-secondary" @click="loadTasks">刷新</button>
      </div>
      <div v-if="!tasks.length" class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">暂无任务</div>
        <div class="empty-desc">飞书机器人收到消息后，任务记录会显示在这里</div>
      </div>
      <div v-else class="task-list">
        <div
          v-for="t in tasks"
          :key="t.id"
          class="task-card"
          :class="{ active: selectedTaskId === t.id }"
          @click="selectTask(t)"
        >
          <div class="task-header">
            <span class="task-type-badge" :class="'type-' + (t.mode || 'general')">{{ typeLabel(t.mode) }}</span>
            <span class="task-time">{{ formatDate(t.created_at) }}</span>
          </div>
          <div class="task-question">{{ truncate(t.first_message, 80) }}</div>
          <div class="task-footer">
            <span class="task-reply-count">{{ t.msg_count - 1 }} 条回复</span>
          </div>
        </div>
      </div>
    </div>
    <div v-if="selectedTask" class="task-detail-panel">
      <div class="detail-header">
        <h3>任务详情</h3>
        <button class="btn btn-sm btn-secondary" @click="selectedTask = null; selectedTaskId = ''">×</button>
      </div>
      <div class="detail-messages">
        <div v-for="(m, i) in taskMessages" :key="i" class="detail-msg" :class="m.role">
          <div class="detail-msg-label">{{ m.role === 'user' ? '指令' : '回复' }}</div>
          <div class="detail-msg-content">{{ m.content }}</div>
          <div class="detail-msg-time">{{ formatDate(m.created_at) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const API = window.electronAPI;

const tasks = ref<any[]>([]);
const selectedTaskId = ref('');
const selectedTask = ref<any>(null);
const taskMessages = ref<any[]>([]);

async function loadTasks() {
  try {
    tasks.value = (await API.chat.getSessionsBySource('feishu')) || [];
  } catch {
    tasks.value = [];
  }
}

async function selectTask(t: any) {
  selectedTaskId.value = t.id;
  selectedTask.value = t;
  try {
    taskMessages.value = (await API.chat.getMessages(t.id)) || [];
  } catch {
    taskMessages.value = [];
  }
}

function typeLabel(mode: string) {
  const labels: Record<string, string> = {
    code: '编程',
    kb: '笔记库',
    query: '查询',
    record: '记录',
    bug: 'Bug',
    report: '日报',
    general: '通用对话',
  };
  return labels[mode] || mode || '通用对话';
}

function truncate(text: string, len: number) {
  if (!text) return '';
  return text.length > len ? text.slice(0, len) + '...' : text;
}

function formatDate(d: string) {
  if (!d) return '';
  const date = new Date(d.replace(' ', 'T') + '+00:00');
  date.setHours(date.getHours() + 8);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

onMounted(loadTasks);
</script>

<style scoped>
.task-center { display: flex; height: 100%; overflow: hidden; }
.content-body { width: 340px; overflow-y: auto; border-right: 1px solid var(--border); background: #fafafa; flex-shrink: 0; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 40px; color: var(--text-muted); }
.empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.4; }
.empty-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; color: #1e293b; }
.empty-desc { font-size: 13px; text-align: center; line-height: 1.5; }
.task-list { padding: 4px 0; }
.task-list-header { padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); background: white; }
.task-list-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.task-card { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.15s; }
.task-card:hover { background: #f0f0f0; }
.task-card.active { background: rgba(99,102,241,0.08); border-left: 3px solid #6366f1; }
.task-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.task-time { font-size: 11px; color: #94a3b8; }
.task-type-badge { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; }
.type-code { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
.type-kb { background: #eef2ff; color: #6366f1; border: 1px solid #c7d2fe; }
.type-query { background: #fefce8; color: #ca8a04; border: 1px solid #fef08a; }
.type-record { background: #f5f3ff; color: #9333ea; border: 1px solid #ddd6fe; }
.type-bug { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
.type-report { background: #fff7ed; color: #ea580c; border: 1px solid #fed7aa; }
.type-general { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
.task-question { font-size: 13px; color: #1e293b; line-height: 1.4; margin-bottom: 6px; }
.task-footer { display: flex; align-items: center; gap: 8px; }
.task-reply-count { font-size: 11px; color: #94a3b8; }
.task-detail-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: white; }
.detail-header { padding: 12px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.detail-header h3 { font-size: 15px; font-weight: 600; margin: 0; }
.detail-messages { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.detail-msg { padding: 10px 14px; border-radius: 8px; background: #f8f9fa; border: 1px solid #e9ecef; }
.detail-msg.user { background: #eef2ff; border-color: #c7d2fe; }
.detail-msg-label { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
.detail-msg.user .detail-msg-label { color: #6366f1; }
.detail-msg-content { font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap; }
.detail-msg-time { font-size: 11px; color: #94a3b8; margin-top: 6px; }
</style>
