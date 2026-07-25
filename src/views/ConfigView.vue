<template>
  <div class="config-view">
    <div class="content-header">
      <h1 class="content-title">设置</h1>
    </div>

    <div class="content-body">

      <!-- Scheduled Tasks -->
      <div class="card">
        <h2>⏰ 定时任务</h2>
        <div class="text-muted mb-2">管理系统内置的定时任务，可开启/关闭及设置是否发送飞书通知。</div>
        <div class="task-controls">
          <span v-if="schedulerRunning" class="badge badge-success">● 调度器运行中</span>
          <span v-else class="badge badge-gray">○ 调度器已停止</span>
        </div>
        <table v-if="tasks.length" class="config-table">
          <thead><tr><th style="width:30px">#</th><th>名称</th><th>类型</th><th>Cron</th><th style="width:60px">启用</th><th style="width:80px">飞书通知</th></tr></thead>
          <tbody>
            <tr v-for="(t, i) in tasks" :key="t.id">
              <td><code>{{ i + 1 }}</code></td>
              <td>{{ t.name }}</td>
              <td><span class="badge badge-gray">{{ t.task_type }}</span></td>
              <td><code>{{ t.cron_expression }}</code></td>
              <td><label class="toggle"><input type="checkbox" :checked="t.enabled" @change="toggleTask(t)"><span class="slider"></span></label></td>
              <td><label class="toggle"><input type="checkbox" :checked="t.notify_feishu" @change="toggleFeishu(t)"><span class="slider"></span></label></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="text-muted" style="padding:12px 0;">暂无定时任务。</div>
      </div>

      <!-- Agent Status -->
      <div class="card">
        <div class="card-title-row">
          <h2>🤖 Agent 状态</h2>
          <button class="btn btn-sm btn-secondary" @click="showHelp = true">帮助</button>
        </div>
        <div class="agent-grid">
          <div class="agent-card" :class="agentStatus.pi.installed ? 'installed' : 'missing'">
            <div class="agent-icon">🧠</div>
            <div class="agent-info">
              <div class="agent-name">pi agent</div>
              <div class="agent-version" v-if="agentStatus.pi.installed">v{{ agentStatus.pi.version }}</div>
              <div class="agent-version" v-else>未安装</div>
              <div class="agent-meta" v-if="agentStatus.pi.installed">
                <span v-if="agentStatus.pi.modelsAvailable > 0" class="badge badge-primary">{{ agentStatus.pi.modelsAvailable }} 模型</span>
                <span v-else class="badge badge-warning">未配置 API Key</span>
                <span v-if="agentStatus.pi.firstModel" class="badge badge-gray">{{ agentStatus.pi.firstModel }}</span>
              </div>
            </div>
          </div>
          <div class="agent-card" :class="agentStatus.opencode.installed ? 'installed' : 'missing'">
            <div class="agent-icon">🔧</div>
            <div class="agent-info">
              <div class="agent-name">opencode</div>
              <div class="agent-version" v-if="agentStatus.opencode.installed">v{{ agentStatus.opencode.version }}</div>
              <div class="agent-version" v-else>未安装</div>
              <div class="agent-meta" v-if="agentStatus.opencode.installed">
                <span class="badge badge-primary">{{ agentStatus.opencode.totalModels || 0 }} 模型</span>
                <span v-for="p in agentStatus.opencode.providers || []" :key="p.name" class="badge badge-gray">{{ p.name }}({{ p.models }})</span>
              </div>
              <div class="agent-meta" v-else>
                <span class="badge badge-gray">需要 npm install</span>
              </div>
            </div>
          </div>
        </div>
      </div>



      <!-- Feishu Webhook -->
      <div class="card">
        <h2>🔗 飞书 Webhook 配置</h2>
        <div class="text-muted mb-2">用于发送通知消息到飞书群（如日报、提醒等）。仅支持发送。</div>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:end;">
          <div class="form-group" style="flex:1;min-width:300px;">
            <label style="font-size:12px;">Webhook URL</label>
            <input v-model="webhookUrl" type="text" class="form-control" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/...">
          </div>
          <button class="btn btn-primary" @click="saveWebhook" style="margin-bottom:12px;">保存</button>
          <button class="btn btn-secondary" @click="testWebhook" style="margin-bottom:12px;">测试</button>
        </div>
        <span v-if="webhookStatus" class="text-muted" :style="{ color: webhookStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ webhookStatus }}</span>
      </div>

      <!-- Feishu Bot -->
      <div class="card">
        <h2>📩 飞书 Bot 配置（App ID + Secret）</h2>
        <div class="text-muted mb-2">配置飞书自建应用凭据，连接到飞书事件订阅，实时接收和回复消息。</div>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:end;">
          <div class="form-group" style="flex:1;min-width:200px;">
            <label style="font-size:12px;">App ID</label>
            <input v-model="feishuAppId" type="text" class="form-control" placeholder="飞书自建应用的 App ID">
          </div>
          <div class="form-group" style="flex:1;min-width:200px;">
            <label style="font-size:12px;">App Secret</label>
            <input v-model="feishuAppSecret" type="password" class="form-control" placeholder="飞书自建应用的 App Secret">
          </div>
        </div>
        <div class="flex" style="gap:8px;margin-top:8px;">
          <button class="btn btn-primary" @click="startFeishuBot">{{ feishuRunning ? '重启 Bot' : '启动 Bot' }}</button>
          <button v-if="feishuRunning" class="btn btn-danger" @click="stopFeishuBot">停止 Bot</button>
          <button class="btn btn-secondary" @click="testFeishuBot">测试</button>
          <span v-if="feishuRunning" class="badge badge-success">● 运行中</span>
          <span v-else class="badge badge-gray">○ 已停止</span>
        </div>
        <span v-if="feishuStatus" class="text-muted" :style="{ color: feishuStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ feishuStatus }}</span>
      </div>

      <!-- Labels -->
      <div class="card">
        <h2>🏷️ 字段标签配置</h2>
        <div class="text-muted mb-2">自定义数据表格中英文 key 显示为中文标签。</div>
        <div style="margin-bottom:12px;">
          <div v-if="Object.keys(labels).length === 0" class="text-muted" style="font-size:13px;padding:12px 0;">暂无自定义标签。</div>
          <table v-else class="config-table">
            <thead><tr><th>Key</th><th>标签</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="(value, key) in labels" :key="key">
                <td><code>{{ key }}</code></td>
                <td><input v-model="labels[key]" type="text" class="form-control" style="padding:6px 8px;font-size:13px;"></td>
                <td><button class="btn btn-sm btn-danger" @click="deleteLabel(key)">删除</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="form-row" style="gap:8px;align-items:end;">
          <div class="form-group" style="flex:1;"><label style="font-size:12px;">Key</label><input v-model="newLabel.key" type="text" class="form-control" placeholder="如 fans"></div>
          <div class="form-group" style="flex:1;"><label style="font-size:12px;">标签</label><input v-model="newLabel.value" type="text" class="form-control" placeholder="如 粉丝数"></div>
          <button class="btn btn-secondary" @click="addLabel" style="margin-bottom:12px;">+ 添加</button>
          <button class="btn btn-primary" @click="saveLabels" style="margin-bottom:12px;">保存</button>
        </div>
        <span v-if="labelsStatus" class="text-muted" :style="{ color: labelsStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ labelsStatus }}</span>
      </div>
    </div>

    <!-- Help Modal -->
    <div v-if="showHelp" class="modal-overlay" @click.self="showHelp = false">
      <div class="modal">
        <div class="modal-header">
          <h3>🤖 Agent 安装帮助</h3>
        </div>
        <div class="modal-body">
          <div class="help-section">
            <h4>🧠 pi agent</h4>
            <p>AI 代码编排 agent，负责工具调用和任务编排。</p>
            <div class="help-code">npm install @earendil-works/pi-coding-agent</div>
            <p class="text-muted" style="margin-top:8px;">已内置于项目依赖中。需要配置 API Key 才能使用。</p>
          </div>
          <div class="help-section">
            <h4>🔧 opencode</h4>
            <p>通用 AI agent SDK，适合通用对话任务。</p>
            <div class="help-code">npm install @opencode-ai/sdk</div>
            <p class="text-muted" style="margin-top:8px;">已内置于项目依赖中。使用 opencode 账号登录后即可使用。</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="showHelp = false">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';

const API = window.electronAPI;

const agentStatus = ref({ pi: { installed: false, version: null, modelsAvailable: 0, firstModel: null }, opencode: { installed: false, version: null, providers: [], totalModels: 0 } });
const showHelp = ref(false);

const webhookUrl = ref('');
const webhookStatus = ref('');

const feishuAppId = ref('');
const feishuAppSecret = ref('');
const feishuRunning = ref(false);
const feishuStatus = ref('');

const labels = reactive<Record<string, string>>({});
const newLabel = reactive({ key: '', value: '' });
const labelsStatus = ref('');

// Scheduled tasks
const schedulerRunning = ref(false);
const tasks = ref<any[]>([]);

async function loadTasks() {
  try { tasks.value = await API.task.list(); } catch { tasks.value = []; }
}
async function loadSchedulerStatus() {
  try { const s = await API.service.status(); schedulerRunning.value = s.scheduler; } catch {}
}

async function toggleTask(t: any) {
  try {
    await API.task.setEnabled(t.id, !t.enabled);
    await loadTasks();
  } catch {}
}
async function toggleFeishu(t: any) {
  try {
    await API.task.update(t.id, { notify_feishu: !t.notify_feishu });
    t.notify_feishu = !t.notify_feishu;
  } catch {}
}

async function checkAgentStatus() {
  try {
    const s = await API.agent.status();
    agentStatus.value = s;
  } catch { agentStatus.value = { pi: { installed: false, version: null, modelsAvailable: 0, firstModel: null }, opencode: { installed: false, version: null, providers: [], totalModels: 0 } }; }
}

async function saveWebhook() {
  const url = webhookUrl.value.trim();
  if (!url.startsWith('https://')) { webhookStatus.value = '❌ URL 必须以 https:// 开头'; return; }
  try {
    await API.feishu.setWebhook(url);
    webhookStatus.value = '✅ 已保存';
    setTimeout(() => webhookStatus.value = '', 3000);
  } catch (e: any) { webhookStatus.value = '❌ ' + (e.message || '保存失败'); }
}

async function testWebhook() {
  const url = webhookUrl.value.trim();
  if (!url) { webhookStatus.value = '❌ 请先输入 Webhook URL'; return; }
  try {
    const result = await API.feishu.testWebhook(url);
    webhookStatus.value = result.ok ? '✅ 测试消息已发送，请查看飞书！' : '❌ ' + (result.error || '发送失败');
  } catch (e: any) { webhookStatus.value = '❌ ' + (e.message || '请求失败'); }
  setTimeout(() => webhookStatus.value = '', 5000);
}

async function startFeishuBot() {
  if (!feishuAppId.value || !feishuAppSecret.value) { feishuStatus.value = '❌ 请先填写 App ID 和 App Secret'; return; }
  try {
    const ok = await API.service.startFeishu({ app_id: feishuAppId.value, app_secret: feishuAppSecret.value });
    feishuRunning.value = true;
    feishuStatus.value = ok ? '✅ Bot 已启动' : '❌ 启动失败，请检查配置';
    if (!ok) feishuRunning.value = false;
    setTimeout(() => feishuStatus.value = '', 5000);
  } catch (e: any) { feishuStatus.value = '❌ ' + (e.message || '启动失败'); }
}

async function stopFeishuBot() {
  try {
    await API.service.stopFeishu();
    feishuRunning.value = false;
    feishuStatus.value = '✅ Bot 已停止';
    setTimeout(() => feishuStatus.value = '', 3000);
  } catch (e: any) { feishuStatus.value = '❌ ' + (e.message || '停止失败'); }
}

async function testFeishuBot() {
  if (!feishuAppId.value || !feishuAppSecret.value) { feishuStatus.value = '❌ 请先填写 App ID 和 App Secret'; return; }
  feishuStatus.value = '⏳ 正在验证...';
  try {
    const result = await API.feishu.testBot(feishuAppId.value, feishuAppSecret.value);
    if (result.ok) {
      feishuStatus.value = result.botName ? `✅ 验证成功，Bot: ${result.botName}` : '✅ 验证成功';
    } else {
      feishuStatus.value = '❌ ' + (result.error || '验证失败');
    }
  } catch (e: any) { feishuStatus.value = '❌ ' + (e.message || '请求失败'); }
  setTimeout(() => { if (feishuStatus.value.startsWith('⏳')) feishuStatus.value = ''; }, 5000);
}

function addLabel() {
  const key = newLabel.key.trim();
  if (!key) { labelsStatus.value = '❌ 请输入 Key'; return; }
  labels[key] = newLabel.value.trim() || key;
  newLabel.key = '';
  newLabel.value = '';
}

function deleteLabel(key: string) { delete labels[key]; }

async function saveLabels() {
  try {
    await API.config.set({ labels: JSON.stringify(labels) });
    labelsStatus.value = '✅ 已保存';
    setTimeout(() => labelsStatus.value = '', 3000);
  } catch { labelsStatus.value = '❌ 保存失败'; }
}

async function loadConfig() {
  try {
    const cfg = await API.config.get();
    webhookUrl.value = cfg.feishuWebhookUrl || '';
    feishuAppId.value = cfg.feishuAppId || '';
    feishuAppSecret.value = cfg.feishuAppSecret || '';
  } catch { console.warn('加载配置失败'); }
}

onMounted(async () => {
  await loadConfig();
  checkAgentStatus();
  await loadTasks();
  await loadSchedulerStatus();
  try {
    const svc = await API.service.status();
    feishuRunning.value = svc.feishu;
  } catch {}
});

onBeforeUnmount(() => {});
</script>

<style scoped>
.config-view { display: flex; flex-direction: column; height: 100%; }
.content-header { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; background: white; }
.content-title { font-size: 18px; font-weight: 600; color: var(--text-primary); }
.content-body { flex: 1; overflow-y: auto; padding: 24px; }
.card { background: white; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 20px; margin-bottom: 16px; }
.card h2 { font-size: 16px; font-weight: 600; margin: 0 0 8px; color: var(--text-primary); }
.card-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.card-title-row h2 { margin: 0; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 13px; font-weight: 500; color: #5c5f66; margin-bottom: 4px; }
.form-row { display: flex; gap: 8px; flex-wrap: wrap; }
.flex { display: flex; align-items: center; }
.text-muted { color: var(--text-muted); font-size: 13px; }
.mb-2 { margin-bottom: 8px; }
.config-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
.config-table th, .config-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); }
.config-table th { background: var(--hover); font-weight: 600; color: var(--text-secondary); font-size: 12px; }
.config-table td code { font-size: 12px; background: #f5f5f7; padding: 2px 6px; border-radius: 4px; }
.badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 12px; font-weight: 500; margin-right: 6px; }
.badge-gray { background: #f5f5f7; color: #909296; }
.badge-primary { background: rgba(99, 102, 241, 0.1); color: var(--primary); }
.badge-success { background: rgba(34, 197, 94, 0.1); color: var(--success); }
.badge-warning { background: rgba(251, 146, 60, 0.1); color: var(--warning); }

/* Agent grid */
.agent-grid { display: flex; gap: 12px; }
.agent-card { flex: 1; display: flex; align-items: center; gap: 12px; padding: 16px; border-radius: 10px; border: 1px solid var(--border); }
.agent-card.installed { background: #f0fdf4; border-color: #bbf7d0; }
.agent-card.missing { background: #fef2f2; border-color: #fecaca; }
.agent-icon { font-size: 28px; }
.agent-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.agent-version { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.agent-meta { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal { background: white; border-radius: 12px; width: 520px; max-width: 90vw; box-shadow: 0 20px 60px rgba(0,0,0,0.15); max-height: 80vh; display: flex; flex-direction: column; }
.modal-header { padding: 20px 24px 0; }
.modal-header h3 { font-size: 16px; font-weight: 600; margin: 0; }
.modal-body { padding: 16px 24px; overflow-y: auto; }
.modal-footer { padding: 12px 24px 20px; display: flex; gap: 8px; justify-content: flex-end; }
.help-section { margin-bottom: 20px; }
.help-section h4 { font-size: 14px; font-weight: 600; margin: 0 0 6px; color: var(--text-primary); }
.help-section p { font-size: 13px; color: var(--text-muted); margin: 0 0 8px; line-height: 1.5; }
.help-code { background: #1e293b; color: #e2e8f0; padding: 10px 14px; border-radius: 8px; font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 13px; }

.btn { padding: 4px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; cursor: pointer; background: white; color: var(--text-primary); }
.btn-sm { padding: 2px 8px; font-size: 12px; }
.btn-primary { background: var(--primary); color: white; border-color: var(--primary); }
.btn-secondary { background: #f5f5f7; }
.btn-danger { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

/* Toggle switch */
.toggle { position: relative; display: inline-block; width: 36px; height: 20px; cursor: pointer; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle .slider { position: absolute; inset: 0; background: #d1d5db; border-radius: 20px; transition: 0.2s; }
.toggle .slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: 0.2s; }
.toggle input:checked + .slider { background: var(--primary); }
.toggle input:checked + .slider::before { transform: translateX(16px); }

.task-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
</style>