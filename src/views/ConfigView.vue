<template>
  <div class="config-view">
    <div class="content-header">
      <h1 class="content-title">设置</h1>
    </div>

    <div class="content-body">
      <div v-if="ollamaStatus" :class="ollamaStatus.available ? 'alert alert-success' : 'alert alert-warning'" style="margin-bottom:16px;">
        <strong>{{ ollamaStatus.available ? '✓ Ollama 运行中' : '⚠️ Ollama 未运行' }}</strong>
        <span v-if="!ollamaStatus.available"> — 语义检索不可用，将回退最近 3 轮对话。请确保 ollama serve 已启动。</span>
      </div>

      <div class="status-bar" style="margin-bottom:16px;">
        <div class="status-item">
          <div class="label">大模型服务</div>
          <div v-if="llmModels.length > 0">
            <div class="value" style="font-size:16px;color:#2b8a3e;">● 已配置</div>
            <div class="text-muted" style="font-size:11px;margin-top:2px;">{{ llmModels[0].name }} · {{ llmModels[0].model }}</div>
          </div>
          <div v-else>
            <div class="value" style="font-size:16px;color:#e03131;">● 未配置</div>
            <div class="text-muted" style="font-size:11px;margin-top:2px;">请在下方的 AI 模型卡片中配置</div>
          </div>
        </div>
        <div class="status-item">
          <div class="label">语义检索</div>
          <div class="value" style="font-size:16px;" :class="ollamaStatus?.available ? 'status-up' : 'status-down'">{{ ollamaStatus?.available ? '● 运行中' : '● 未连接' }}</div>
          <div class="text-muted" style="font-size:11px;margin-top:2px;">{{ embeddingModel?.provider || 'Ollama · BAAI/bge-m3' }}</div>
        </div>
      </div>

      <div class="card">
        <h2>🧠 AI 模型</h2>
        <div class="text-muted mb-2">配置 LLM 模型列表。第一个模型将自动设为默认，可在对话页面切换模型。</div>

        <div v-if="llmModels.length === 0" class="text-muted" style="font-size:13px;padding:12px 0;">暂无模型，请点击下方"添加模型"。</div>
        <div v-else>
          <table class="config-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>模型</th>
                <th>API 地址</th>
                <th>超时</th>
                <th>类型</th>
                <th>默认</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in llmModels" :key="m.id">
                <td><strong>{{ m.name }}</strong></td>
                <td><code>{{ m.model || '-' }}</code></td>
                <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;"><code>{{ m.baseUrl || '-' }}</code></td>
                <td>{{ m.timeout || 600 }}s</td>
                <td>
                  <span :style="{ background: getTypeColor(m.modelType) }" class="type-badge">{{ getTypeLabel(m.modelType) }}</span>
                </td>
                <td>{{ m.isDefault ? '✅ 默认' : '—' }}</td>
                <td>
                  <button class="btn btn-sm btn-secondary" @click="editLlmModel(m)">编辑</button>
                  <button v-if="!m.isDefault" class="btn btn-sm btn-secondary" @click="setDefaultModel(m.id)">设为默认</button>
                  <button class="btn btn-sm btn-danger" @click="deleteLlmModel(m.id)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px;">
          <h3 style="font-size:14px;margin:0 0 12px;">{{ editingModel ? '编辑模型: ' + editingModel.name : '添加模型' }}</h3>
          <div class="form-row" style="gap:8px;flex-wrap:wrap;">
            <div class="form-group" style="flex:1;min-width:120px;">
              <label style="font-size:12px;">名称</label>
              <input v-model="newModel.name" type="text" class="form-control" placeholder="如 DeepSeek">
            </div>
            <div class="form-group" style="flex:2;min-width:200px;">
              <label style="font-size:12px;">API Key</label>
              <input v-model="newModel.apiKey" type="password" class="form-control" placeholder="sk-xxxxxxxxxxxx">
            </div>
            <div class="form-group" style="flex:1;min-width:160px;">
              <label style="font-size:12px;">API 地址</label>
              <input v-model="newModel.baseUrl" type="text" class="form-control" placeholder="https://api.deepseek.com">
            </div>
            <div class="form-group" style="flex:0 0 100px;">
              <label style="font-size:12px;">模型名</label>
              <input v-model="newModel.model" type="text" class="form-control" placeholder="deepseek-chat">
            </div>
            <div class="form-group" style="flex:0 0 80px;">
              <label style="font-size:12px;">超时(秒)</label>
              <input v-model.number="newModel.timeout" type="number" class="form-control" min="10" max="900" value="600">
            </div>
            <div class="form-group" style="flex:0 0 130px;">
              <label style="font-size:12px;">模型类型</label>
              <select v-model="newModel.modelType" class="form-control">
                <option value="text">文本模型</option>
                <option value="multimodal">多模态</option>
                <option value="embedding">向量模型</option>
                <option value="image">生成图片</option>
              </select>
            </div>
          </div>
          <div class="flex" style="gap:8px;margin-top:8px;">
            <button class="btn btn-primary" @click="submitLlmModel">{{ editingModel ? '保存修改' : '添加模型' }}</button>
            <button v-if="editingModel" class="btn btn-secondary" @click="cancelEdit">取消</button>
            <span v-if="llmStatus" class="text-muted" :style="{ color: llmStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ llmStatus }}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>🔤 语义向量模型</h2>
        <div class="text-muted mb-2">配置用于语义检索的向量模型。填入 API Key 则使用 API 模式（如硅基流动），留空则使用 Ollama 本地模式。</div>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;">
          <div class="form-group" style="flex:1;min-width:160px;">
            <label style="font-size:12px;">API 地址</label>
            <input v-model="embeddingForm.baseUrl" type="text" class="form-control" placeholder="http://127.0.0.1:11434">
          </div>
          <div class="form-group" style="flex:0 0 200px;">
            <label style="font-size:12px;">模型名</label>
            <input v-model="embeddingForm.model" type="text" class="form-control" placeholder="bge-m3">
          </div>
          <div class="form-group" style="flex:1;min-width:200px;">
            <label style="font-size:12px;">API Key <span class="text-muted" style="font-weight:400;">(留空=Ollama)</span></label>
            <input v-model="embeddingForm.apiKey" type="password" class="form-control" placeholder="sk-...">
          </div>
          <div class="form-group" style="flex:0 0 160px;">
            <label style="font-size:12px;">供应商名称</label>
            <input v-model="embeddingForm.provider" type="text" class="form-control" placeholder="如 硅基流动">
          </div>
        </div>
        <div class="flex" style="gap:8px;">
          <button class="btn btn-primary" @click="saveEmbeddingModel">保存</button>
          <span v-if="embeddingStatus" class="text-muted" :style="{ color: embeddingStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ embeddingStatus }}</span>
        </div>
      </div>

      <div class="card">
        <h2>🔗 飞书 Webhook 配置</h2>
        <div class="text-muted mb-2">修改后自动保存到 config.json，下次推送生效。</div>
        <div class="flex" style="flex-wrap:wrap;gap:8px;">
          <input v-model="webhookUrl" type="text" class="form-control" style="flex:1;min-width:300px;" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/...">
          <button class="btn btn-primary" @click="saveWebhook">保存</button>
        </div>
        <span v-if="webhookStatus" class="text-muted" :style="{ color: webhookStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ webhookStatus }}</span>
      </div>

      <div class="card">
        <h2>📩 飞书消息接收（API 轮询）</h2>
        <div class="text-muted mb-2">配置飞书自建应用的凭据，AI助理将轮询指定群的未读消息并自动回复。</div>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;">
          <div class="form-group" style="flex:1;min-width:200px;">
            <label style="font-size:12px;">App ID</label>
            <input v-model="feishuForm.appId" type="text" class="form-control" placeholder="飞书自建应用的 App ID">
          </div>
          <div class="form-group" style="flex:1;min-width:200px;">
            <label style="font-size:12px;">App Secret</label>
            <input v-model="feishuForm.appSecret" type="password" class="form-control" placeholder="飞书自建应用的 App Secret">
          </div>
          <div class="form-group" style="flex:1;min-width:200px;">
            <label style="font-size:12px;">群 Chat ID</label>
            <div class="flex" style="gap:8px;">
              <input v-model="feishuForm.chatId" type="text" class="form-control" style="flex:1;" placeholder="群聊的 chat_id">
              <button class="btn btn-secondary" @click="fetchChats">获取群列表</button>
            </div>
          </div>
        </div>
        <div v-if="chatList.length > 0" class="chat-list" style="margin-top:8px;">
          <div v-for="chat in chatList" :key="chat.chat_id" @click="selectChat(chat)" class="chat-option">
            <strong>{{ chat.name }}</strong> <span class="text-muted" style="font-size:11px;">{{ chat.type }}</span>
            <div style="font-size:11px;color:var(--primary);word-break:break-all;">{{ chat.chat_id }}</div>
          </div>
        </div>
        <div class="form-group" style="margin-top:12px;">
          <label class="toggle-label">
            <input v-model="feishuForm.pollingEnabled" type="checkbox">
            <span class="toggle-slider"></span>
            <span>启用消息轮询（每15秒检查一次）</span>
          </label>
        </div>
        <div class="flex" style="gap:8px;">
          <button class="btn btn-primary" @click="saveFeishu">保存飞书配置</button>
          <button class="btn btn-secondary" @click="testFeishu">发送测试消息</button>
          <span v-if="feishuStatus" class="text-muted" :style="{ color: feishuStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ feishuStatus }}</span>
        </div>
      </div>

      <div class="card">
        <h2>🏷️ 字段标签配置</h2>
        <div class="text-muted mb-2">自定义数据表格中英文 key 显示为中文标签。未配置的 key 保持原始英文显示。</div>
        <div id="labels-container" style="margin-bottom:12px;">
          <div v-if="Object.keys(labels).length === 0" class="text-muted" style="font-size:13px;padding:12px 0;">暂无自定义标签，请在下方添加。</div>
          <table v-else class="config-table">
            <thead>
              <tr><th style="width:40%;">Key</th><th style="width:40%;">标签</th><th style="width:20%;">操作</th></tr>
            </thead>
            <tbody>
              <tr v-for="(value, key) in labels" :key="key">
                <td><code>{{ key }}</code></td>
                <td><input v-model="labels[key]" type="text" class="form-control" style="padding:6px 8px;font-size:13px;"></td>
                <td><button class="btn btn-sm btn-danger" @click="deleteLabel(key)">删除</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="form-row" style="gap:8px;margin-bottom:12px;align-items:end;">
          <div class="form-group" style="flex:1;">
            <label style="font-size:12px;">Key</label>
            <input v-model="newLabel.key" type="text" class="form-control" placeholder="如 fans">
          </div>
          <div class="form-group" style="flex:1;">
            <label style="font-size:12px;">标签</label>
            <input v-model="newLabel.value" type="text" class="form-control" placeholder="如 粉丝数">
          </div>
          <button class="btn btn-secondary" @click="addLabel">+ 添加</button>
        </div>
        <div class="flex" style="gap:8px;">
          <button class="btn btn-primary" @click="saveLabels">保存标签</button>
          <span v-if="labelsStatus" class="text-muted" :style="{ color: labelsStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ labelsStatus }}</span>
        </div>
      </div>

      <div class="card">
        <h2>💻 编程AI</h2>
        <div class="text-muted mb-2">开启后在导航栏显示编程AI页面，用于通过飞书机器人排查代码问题。</div>
        <div class="form-group">
          <label class="toggle-label">
            <input v-model="codingEnabled" type="checkbox" @change="saveCodingToggle">
            <span class="toggle-slider"></span>
            <span>启用编程AI</span>
          </label>
        </div>
        <span v-if="codingStatus" class="text-muted" :style="{ color: codingStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ codingStatus }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';

const API_BASE = 'http://localhost:6790/api';

const ollamaStatus = ref<{ available: boolean } | null>(null);
const llmModels = ref<any[]>([]);
const embeddingModel = ref<any>(null);
const embeddingForm = reactive({ model: '', baseUrl: '', apiKey: '', provider: '' });
const webhookUrl = ref('');
const feishuForm = reactive({ appId: '', appSecret: '', chatId: '', pollingEnabled: false });
const chatList = ref<any[]>([]);
const labels = reactive<Record<string, string>>({});
const newLabel = reactive({ key: '', value: '' });
const codingEnabled = ref(false);

const editingModel = ref<any>(null);
const newModel = reactive({ name: '', apiKey: '', baseUrl: '', model: '', timeout: 600, modelType: 'text' });

const llmStatus = ref('');
const embeddingStatus = ref('');
const webhookStatus = ref('');
const feishuStatus = ref('');
const labelsStatus = ref('');
const codingStatus = ref('');

const typeMap: Record<string, string> = { 'text': '文本模型', 'multimodal': '多模态', 'embedding': '向量模型', 'image': '生成图片' };
const typeColor: Record<string, string> = { 'text': '#6366f1', 'multimodal': '#10b981', 'embedding': '#f59e0b', 'image': '#ec4899' };

function getTypeLabel(type: string) { return typeMap[type] || typeMap['text']; }
function getTypeColor(type: string) { return typeColor[type] || '#909296'; }

async function fetchOllamaStatus() {
  try {
    const r = await fetch(`${API_BASE}/ollama/status`);
    const d = await r.json();
    ollamaStatus.value = { available: d.available };
  } catch (e) {
    ollamaStatus.value = { available: false };
  }
}

async function loadLlmModels() {
  try {
    const r = await fetch(`${API_BASE}/config/llm-profiles`);
    const d = await r.json();
    if (d.ok) {
      llmModels.value = d.profiles || [];
    }
  } catch (e) {
    console.warn('加载 LLM 模型失败:', e);
  }
}

async function loadEmbeddingModel() {
  try {
    const r = await fetch(`${API_BASE}/config/embedding-model`);
    const d = await r.json();
    if (d.ok) {
      embeddingModel.value = d;
      embeddingForm.model = d.model || 'bge-m3';
      embeddingForm.baseUrl = d.baseUrl || 'http://127.0.0.1:11434';
      embeddingForm.apiKey = d.apiKey || '';
      embeddingForm.provider = d.provider || '';
    }
  } catch (e) {
    console.warn('加载向量模型失败:', e);
  }
}

async function loadConfig() {
  try {
    const r = await fetch(`${API_BASE}/config`);
    const d = await r.json();
    if (d.feishuWebhookUrl) webhookUrl.value = d.feishuWebhookUrl;
    if (d.feishuAppId) feishuForm.appId = d.feishuAppId;
    if (d.feishuAppSecret) feishuForm.appSecret = d.feishuAppSecret;
    if (d.feishuChatId) feishuForm.chatId = d.feishuChatId;
    if (d.feishuPollingEnabled) feishuForm.pollingEnabled = d.feishuPollingEnabled;
    if (d.codingPiEnabled) codingEnabled.value = d.codingPiEnabled;
  } catch (e) {
    console.warn('加载配置失败:', e);
  }
}

async function loadLabels() {
  try {
    const r = await fetch(`${API_BASE}/config/labels`);
    const d = await r.json();
    if (d.ok && d.labels) {
      Object.assign(labels, d.labels);
    }
  } catch (e) {
    console.warn('加载标签失败:', e);
  }
}

async function submitLlmModel() {
  if (!newModel.name.trim()) {
    llmStatus.value = '❌ 请输入模型名称';
    return;
  }

  const payload = { ...newModel };
  if (editingModel.value) {
    payload.id = editingModel.value.id;
    payload.isDefault = editingModel.value.isDefault;
  } else {
    payload.isDefault = llmModels.value.length === 0;
  }

  try {
    const r = await fetch(`${API_BASE}/config/llm-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (d.ok) {
      llmStatus.value = editingModel.value ? '✅ 已更新' : '✅ 已添加';
      cancelEdit();
      loadLlmModels();
      setTimeout(() => llmStatus.value = '', 3000);
    } else {
      llmStatus.value = '❌ ' + (d.error || '保存失败');
    }
  } catch (e) {
    llmStatus.value = '❌ 请求失败';
  }
}

function editLlmModel(model: any) {
  editingModel.value = model;
  newModel.name = model.name;
  newModel.apiKey = model.apiKey || '';
  newModel.baseUrl = model.baseUrl || '';
  newModel.model = model.model || '';
  newModel.timeout = model.timeout || 600;
  newModel.modelType = model.modelType || 'text';
}

function cancelEdit() {
  editingModel.value = null;
  newModel.name = '';
  newModel.apiKey = '';
  newModel.baseUrl = '';
  newModel.model = '';
  newModel.timeout = 600;
  newModel.modelType = 'text';
  llmStatus.value = '';
}

async function deleteLlmModel(id: number) {
  if (!confirm('确定删除该模型？')) return;
  try {
    const r = await fetch(`${API_BASE}/config/llm-profiles/${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) {
      llmStatus.value = '✅ 已删除';
      if (editingModel.value?.id === id) cancelEdit();
      loadLlmModels();
      setTimeout(() => llmStatus.value = '', 3000);
    } else {
      llmStatus.value = '❌ ' + (d.error || '删除失败');
    }
  } catch (e) {
    llmStatus.value = '❌ 请求失败';
  }
}

async function setDefaultModel(id: number) {
  try {
    const r = await fetch(`${API_BASE}/config/llm-profiles/${id}/default`, { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      llmStatus.value = '✅ 默认模型已切换';
      loadLlmModels();
      setTimeout(() => llmStatus.value = '', 3000);
    } else {
      llmStatus.value = '❌ ' + (d.error || '设置失败');
    }
  } catch (e) {
    llmStatus.value = '❌ 请求失败';
  }
}

async function saveEmbeddingModel() {
  try {
    const r = await fetch(`${API_BASE}/config/embedding-model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embeddingForm),
    });
    const d = await r.json();
    if (d.ok) {
      embeddingStatus.value = '✅ 已保存';
      loadEmbeddingModel();
      fetchOllamaStatus();
      setTimeout(() => embeddingStatus.value = '', 3000);
    } else {
      embeddingStatus.value = '❌ ' + (d.error || '保存失败');
    }
  } catch (e) {
    embeddingStatus.value = '❌ 请求失败';
  }
}

async function saveWebhook() {
  const url = webhookUrl.value.trim();
  if (!url.startsWith('https://')) {
    webhookStatus.value = '❌ URL 必须以 https:// 开头';
    return;
  }
  try {
    const form = new FormData();
    form.append('url', url);
    const r = await fetch(`${API_BASE}/config/webhook`, { method: 'POST', body: form });
    const d = await r.json();
    if (d.ok) {
      webhookStatus.value = '✅ 已保存';
      setTimeout(() => webhookStatus.value = '', 3000);
    } else {
      webhookStatus.value = '❌ ' + (d.error || '保存失败');
    }
  } catch (e) {
    webhookStatus.value = '❌ 请求失败';
  }
}

async function saveFeishu() {
  try {
    const form = new FormData();
    form.append('appId', feishuForm.appId);
    form.append('appSecret', feishuForm.appSecret);
    form.append('chatId', feishuForm.chatId);
    form.append('pollingEnabled', feishuForm.pollingEnabled ? 'on' : 'off');
    const r = await fetch(`${API_BASE}/config/feishu`, { method: 'POST', body: form });
    const d = await r.json();
    if (d.ok) {
      feishuStatus.value = '✅ 已保存';
      setTimeout(() => feishuStatus.value = '', 3000);
    } else {
      feishuStatus.value = '❌ ' + (d.error || '保存失败');
    }
  } catch (e) {
    feishuStatus.value = '❌ 请求失败';
  }
}

async function fetchChats() {
  if (!feishuForm.appId || !feishuForm.appSecret) {
    feishuStatus.value = '❌ 请先填写 App ID 和 App Secret';
    return;
  }
  try {
    const form = new FormData();
    form.append('appId', feishuForm.appId);
    form.append('appSecret', feishuForm.appSecret);
    const r = await fetch(`${API_BASE}/config/feishu/chats`, { method: 'POST', body: form });
    const d = await r.json();
    if (d.ok) {
      chatList.value = d.chats || [];
    } else {
      feishuStatus.value = '❌ ' + (d.error || '查询失败');
    }
  } catch (e) {
    feishuStatus.value = '❌ 请求失败';
  }
}

function selectChat(chat: any) {
  feishuForm.chatId = chat.chat_id;
  chatList.value = [];
}

async function testFeishu() {
  if (!feishuForm.appId || !feishuForm.appSecret || !feishuForm.chatId) {
    feishuStatus.value = '❌ 请先填完 App ID、App Secret 和 Chat ID';
    return;
  }
  try {
    const form = new FormData();
    form.append('appId', feishuForm.appId);
    form.append('appSecret', feishuForm.appSecret);
    form.append('chatId', feishuForm.chatId);
    const r = await fetch(`${API_BASE}/config/feishu/test`, { method: 'POST', body: form });
    const d = await r.json();
    if (d.ok) {
      feishuStatus.value = '✅ 测试消息已发送到群，请查看飞书！';
    } else {
      feishuStatus.value = '❌ ' + (d.error || '发送失败');
    }
  } catch (e) {
    feishuStatus.value = '❌ 请求失败';
  }
}

function addLabel() {
  const key = newLabel.key.trim();
  if (!key) {
    labelsStatus.value = '❌ 请输入 Key';
    return;
  }
  labels[key] = newLabel.value.trim() || key;
  newLabel.key = '';
  newLabel.value = '';
  labelsStatus.value = '';
}

function deleteLabel(key: string) {
  delete labels[key];
}

async function saveLabels() {
  try {
    const r = await fetch(`${API_BASE}/config/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(labels),
    });
    const d = await r.json();
    if (d.ok) {
      labelsStatus.value = '✅ 已保存';
      setTimeout(() => labelsStatus.value = '', 3000);
    } else {
      labelsStatus.value = '❌ ' + (d.error || '保存失败');
    }
  } catch (e) {
    labelsStatus.value = '❌ 请求失败';
  }
}

async function saveCodingToggle() {
  try {
    const form = new FormData();
    form.append('enabled', codingEnabled.value ? 'on' : 'off');
    form.append('timeout', '300');
    const r = await fetch(`${API_BASE}/config/coding`, { method: 'POST', body: form });
    const d = await r.json();
    if (d.ok) {
      codingStatus.value = '✅ 已保存';
      setTimeout(() => codingStatus.value = '', 3000);
    } else {
      codingStatus.value = '❌ ' + (d.error || '保存失败');
    }
  } catch (e) {
    codingStatus.value = '❌ 请求失败';
  }
}

onMounted(() => {
  fetchOllamaStatus();
  loadLlmModels();
  loadEmbeddingModel();
  loadConfig();
  loadLabels();
});
</script>

<style scoped>
.config-view {
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
  margin-bottom: 16px;
}

.card h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text-primary);
}

.card h3 {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 8px;
  color: var(--text-secondary);
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #5c5f66;
  margin-bottom: 4px;
}

.form-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.flex {
  display: flex;
  align-items: center;
}

.text-muted {
  color: var(--text-muted);
  font-size: 13px;
}

.mb-2 {
  margin-bottom: 8px;
}

.alert {
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.alert-success {
  background: rgba(34, 197, 94, 0.1);
  color: #2b8a3e;
}

.alert-warning {
  background: rgba(251, 146, 60, 0.1);
  color: #d97706;
}

.status-bar {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.status-item {
  flex: 1;
  min-width: 180px;
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
}

.status-item .label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.status-item .value {
  font-size: 14px;
  font-weight: 600;
}

.status-up { color: #2b8a3e; }
.status-down { color: #e03131; }

.config-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-top: 8px;
}

.config-table th, .config-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.config-table th {
  background: var(--hover);
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 12px;
}

.config-table td code {
  font-size: 12px;
  background: #f5f5f7;
  padding: 2px 6px;
  border-radius: 4px;
}

.type-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  color: #fff;
}

.chat-option {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-bottom: 4px;
  cursor: pointer;
  font-size: 13px;
}

.chat-option:hover {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.05);
}

.toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  font-size: 14px;
}

.toggle-label input[type="checkbox"] {
  display: none;
}

.toggle-slider {
  width: 44px;
  height: 24px;
  background: #ccc;
  border-radius: 12px;
  position: relative;
  transition: background 0.2s;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-label input:checked + .toggle-slider {
  background: var(--primary);
}

.toggle-label input:checked + .toggle-slider::after {
  transform: translateX(20px);
}
</style>