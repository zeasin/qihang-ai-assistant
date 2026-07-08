<template>
  <div class="log-view">
    <div class="content-header">
      <h1 class="content-title">操作日志</h1>
      <button class="btn btn-secondary" @click="loadLogs">刷新</button>
    </div>

    <div class="content-body">
      <div class="card">
        <div class="text-muted mb-2">最近 100 条操作记录。</div>

        <div v-if="logs.length > 0">
          <table class="log-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作</th>
                <th>状态</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(log, index) in logs" :key="index">
                <td style="white-space:nowrap;">{{ log.time }}</td>
                <td>{{ log.action }}</td>
                <td>
                  <span v-if="log.status === '成功'" class="badge badge-success">✓ 成功</span>
                  <span v-else-if="log.status === '失败'" class="badge badge-danger">✗ 失败</span>
                  <span v-else class="badge badge-gray">ℹ {{ log.status }}</span>
                </td>
                <td class="text-muted">{{ log.detail }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="text-muted" style="padding: 40px 0; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
          <div>暂无日志记录。</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const API_BASE = 'http://localhost:6790/api';

interface LogEntry {
  time: string;
  action: string;
  status: string;
  detail: string;
}

const logs = ref<LogEntry[]>([]);

async function loadLogs() {
  try {
    const r = await fetch(`${API_BASE}/logs`);
    const d = await r.json();
    if (d.ok && d.logs) {
      logs.value = d.logs;
    } else {
      logs.value = [];
    }
  } catch (e) {
    console.warn('加载日志失败:', e);
    logs.value = [];
  }
}

onMounted(() => {
  loadLogs();
});
</script>

<style scoped>
.log-view {
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
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px;
}

.text-muted {
  color: var(--text-muted);
  font-size: 13px;
}

.mb-2 {
  margin-bottom: 8px;
}

.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-top: 8px;
}

.log-table th, .log-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.log-table th {
  background: var(--hover);
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 12px;
}

.log-table tr:hover {
  background: var(--hover);
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

.badge-success {
  background: rgba(34, 197, 94, 0.1);
  color: #2b8a3e;
}

.badge-danger {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
</style>