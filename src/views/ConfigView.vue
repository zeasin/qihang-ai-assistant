<template>
  <div class="config-view">
    <div class="content-header">
      <h1 class="content-title">设置</h1>
    </div>

    <div class="content-body">
      <div class="card">
        <h2>🔑 AI API Key</h2>
        <div class="text-muted mb-2">配置 AI 模型的 API Key。pi agent 需要有效的 API Key 才能工作。</div>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:end;">
          <div class="form-group" style="flex:1;min-width:160px;">
            <label style="font-size:12px;">供应商</label>
            <select v-model="apiProvider" class="form-control">
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT)</option>
            </select>
          </div>
          <div class="form-group" style="flex:3;min-width:280px;">
            <label style="font-size:12px;">API Key</label>
            <div class="flex" style="gap:8px;">
              <input v-model="apiKeyInput" :type="showKey ? 'text' : 'password'" class="form-control" placeholder="sk-...">
              <button class="btn btn-sm btn-secondary" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
            </div>
          </div>
          <button class="btn btn-primary" @click="saveApiKey" style="margin-bottom:12px;">保存</button>
        </div>
        <div v-if="agentInfo" class="agent-info">
          <span v-if="agentInfo.installed" class="badge badge-success">pi agent ✓ {{ agentInfo.version }}</span>
          <span v-if="agentInfo.modelsAvailable > 0" class="badge badge-primary">{{ agentInfo.modelsAvailable }} 个模型可用</span>
          <span v-else class="badge badge-warning">无可用模型 — 请配置 API Key</span>
          <span v-if="agentInfo.firstModel" class="badge badge-gray">默认: {{ agentInfo.firstModel }}</span>
        </div>
        <span v-if="apiStatus" class="text-muted" :style="{ color: apiStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ apiStatus }}</span>
      </div>

      <div class="card">
        <h2>🔗 飞书 Webhook 配置</h2>
        <div class="text-muted mb-2">用于发送通知消息到飞书群（如日报、提醒等）。仅支持发送，不支持接收消息。</div>
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

      <div class="card">
        <h2>📩 飞书 Bot 配置（App ID + Secret）</h2>
        <div class="text-muted mb-2">配置飞书自建应用的凭据。AI 助理将连接到飞书事件订阅，实时接收和回复消息。</div>
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
          <span v-if="feishuRunning" class="badge badge-success">● 运行中</span>
          <span v-else class="badge badge-gray">○ 已停止</span>
        </div>
        <span v-if="feishuStatus" class="text-muted" :style="{ color: feishuStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ feishuStatus }}</span>
      </div>

      <div class="card">
        <h2>🏷️ 字段标签配置</h2>
        <div class="text-muted mb-2">自定义数据表格中英文 key 显示为中文标签。</div>
        <div id="labels-container" style="margin-bottom:12px;">
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';

const API = window.electronAPI;

const apiProvider = ref('anthropic');
const apiKeyInput = ref('');
const showKey = ref(false);
const apiStatus = ref('');
const agentInfo = ref<any>(null);

const webhookUrl = ref('');
const webhookStatus = ref('');

const feishuAppId = ref('');
const feishuAppSecret = ref('');
const feishuRunning = ref(false);
const feishuStatus = ref('');

const labels = reactive<Record<string, string>>({});
const newLabel = reactive({ key: '', value: '' });
const labelsStatus = ref('');

async function saveApiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiStatus.value = '❌ 请输入 API Key';
    return;
  }
  try {
    await API.config.set({ apiKey: key, apiProvider: apiProvider.value });
    apiStatus.value = '✅ 已保存';
    checkAgentStatus();
    setTimeout(() => apiStatus.value = '', 3000);
  } catch (e: any) {
    apiStatus.value = '❌ ' + (e.message || '保存失败');
  }
}

async function checkAgentStatus() {
  try {
    const s = await API.agent.status();
    agentInfo.value = s.pi;
  } catch { agentInfo.value = null; }
}

async function saveWebhook() {
  const url = webhookUrl.value.trim();
  if (!url.startsWith('https://')) {
    webhookStatus.value = '❌ URL 必须以 https:// 开头';
    return;
  }
  try {
    await API.feishu.setWebhook(url);
    webhookStatus.value = '✅ 已保存';
    setTimeout(() => webhookStatus.value = '', 3000);
  } catch (e: any) {
    webhookStatus.value = '❌ ' + (e.message || '保存失败');
  }
}

async function testWebhook() {
  const url = webhookUrl.value.trim();
  if (!url) {
    webhookStatus.value = '❌ 请先输入 Webhook URL';
    return;
  }
  try {
    const result = await API.feishu.testWebhook(url);
    webhookStatus.value = result.ok ? '✅ 测试消息已发送，请查看飞书！' : '❌ ' + (result.error || '发送失败');
  } catch (e: any) {
    webhookStatus.value = '❌ ' + (e.message || '请求失败');
  }
  setTimeout(() => webhookStatus.value = '', 5000);
}

async function startFeishuBot() {
  if (!feishuAppId.value || !feishuAppSecret.value) {
    feishuStatus.value = '❌ 请先填写 App ID 和 App Secret';
    return;
  }
  try {
    const ok = await API.service.startFeishu({ app_id: feishuAppId.value, app_secret: feishuAppSecret.value });
    feishuRunning.value = true;
    feishuStatus.value = ok ? '✅ Bot 已启动' : '❌ 启动失败，请检查配置';
    if (!ok) feishuRunning.value = false;
    setTimeout(() => feishuStatus.value = '', 5000);
  } catch (e: any) {
    feishuStatus.value = '❌ ' + (e.message || '启动失败');
  }
}

async function stopFeishuBot() {
  try {
    await API.service.stopFeishu();
    feishuRunning.value = false;
    feishuStatus.value = '✅ Bot 已停止';
    setTimeout(() => feishuStatus.value = '', 3000);
  } catch (e: any) {
    feishuStatus.value = '❌ ' + (e.message || '停止失败');
  }
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
    apiProvider.value = cfg.apiProvider || 'anthropic';
    webhookUrl.value = cfg.feishuWebhookUrl || '';
  } catch { console.warn('加载配置失败'); }
}

onMounted(async () => {
  await loadConfig();
  checkAgentStatus();
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
.agent-info { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; padding: 12px; background: #f8fafc; border-radius: 8px; }
</style>