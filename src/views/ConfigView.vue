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
          <thead><tr><th style="width:30px">#</th><th>名称</th><th>类型</th><th>项目</th><th>Cron</th><th style="width:60px">启用</th><th style="width:80px">飞书通知</th></tr></thead>
          <tbody>
            <tr v-for="(t, i) in tasks" :key="t.id">
              <td><code>{{ i + 1 }}</code></td>
              <td>{{ t.name }}</td>
              <td><span class="badge badge-gray">{{ t.task_type }}</span></td>
              <td><span class="task-project-name">{{ projectName(t.project_id) }}</span></td>
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
              <div class="agent-meta" v-if="agentStatus.pi.installed && agentStatus.pi.modelsAvailable > 0">
                <span class="badge badge-primary">{{ agentStatus.pi.modelsAvailable }} 模型</span>
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
                <span v-for="p in agentStatus.opencode.providers || []" :key="p.name" class="badge badge-gray">{{ p.name }}({{ p.models }})</span>
              </div>
              <div class="agent-meta" v-else>
                <span class="badge badge-gray">需要 npm install</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Embedding Model Configuration -->
      <div class="card">
        <h2>🧠 嵌入模型配置</h2>
        <div class="text-muted mb-2">配置笔记库索引使用的嵌入模型（Embedding Model），用于语义搜索。支持 Ollama 和 OpenAI 兼容接口（如 vLLM、LM Studio 等）。填写 API Key 则使用 OpenAI 兼容接口，否则使用 Ollama。</div>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:end;">
          <div class="form-group" style="flex:1;min-width:160px;">
            <label style="font-size:12px;">模型名称</label>
            <input v-model="embedModel" type="text" class="form-control" placeholder="bge-m3 / ...">
          </div>
          <div class="form-group" style="flex:1;min-width:200px;">
            <label style="font-size:12px;">服务地址</label>
            <input v-model="embeddingBaseUrl" type="text" class="form-control" placeholder="http://127.0.0.1:11434">
          </div>
          <div class="form-group" style="flex:1;min-width:220px;">
            <label style="font-size:12px;">API Key（可选，非 Ollama 时填写）</label>
            <input v-model="embeddingApiKey" type="password" class="form-control" placeholder="sk-... 留空则使用 Ollama">
          </div>
          <button class="btn btn-primary" @click="saveEmbeddingConfig" style="margin-bottom:12px;">保存配置</button>
          <button class="btn btn-secondary" @click="testEmbedding" style="margin-bottom:12px;">测试连接</button>
        </div>
        <span v-if="embeddingStatus" class="text-muted" :style="{ color: embeddingStatus.startsWith('✅') ? '#22c55e' : embeddingStatus.startsWith('⏳') ? '#f59e0b' : '#ef4444' }">{{ embeddingStatus }}</span>
      </div>

      <!-- 笔记库索引排除配置 -->
      <div class="card">
        <h2>📂 笔记库索引配置</h2>
        <div class="text-muted mb-2">配置每个笔记库索引时排除的目录和文件（逗号分隔，支持通配符 *）。</div>
        <div v-for="p in noteProjects" :key="p.id" class="project-ignore-config">
          <div class="project-ignore-header">
            <span class="project-ignore-name">{{ p.name }}</span>
            <span class="project-ignore-dir">{{ p.dir }}</span>
          </div>
          <div class="form-row" style="gap:8px;flex-wrap:wrap;">
            <div class="form-group" style="flex:1;min-width:200px;">
              <label style="font-size:12px;color:var(--text-muted);">排除目录</label>
              <input v-model="p.ignore_dirs_local" type="text" class="form-control" placeholder="dist, build, temp">
            </div>
            <div class="form-group" style="flex:1;min-width:200px;">
              <label style="font-size:12px;color:var(--text-muted);">排除文件</label>
              <input v-model="p.ignore_files_local" type="text" class="form-control" placeholder="draft*, *test*, tmp_*.md">
            </div>
            <button class="btn btn-sm btn-primary" @click="saveProjectIgnore(p)" style="align-self:end;margin-bottom:12px;">保存</button>
          </div>
        </div>
        <div v-if="!noteProjects.length" class="text-muted" style="padding:12px 0;">暂无笔记库项目。</div>
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

      <!-- Report Settings -->
      <div class="card">
        <h2>📊 综合日报设置</h2>
        <div class="text-muted mb-2">管理综合日报的生成和保存策略。</div>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:center;">
          <div class="form-group" style="flex:0 0 160px;">
            <label style="font-size:12px;">保留天数</label>
            <input v-model="reportRetentionDays" type="number" class="form-control" min="1" max="365" style="width:100px;">
          </div>
          <button class="btn btn-primary" @click="saveReportSettings">保存</button>
        </div>
        <span v-if="reportSettingsStatus" class="text-muted" :style="{ color: reportSettingsStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }" style="margin-top:8px;display:block;">{{ reportSettingsStatus }}</span>
      </div>

      <!-- Report Template Editor -->
      <div class="card">
        <h2>🤖 日报 AI 提示词</h2>
        <div class="text-muted mb-2">
          编辑下方提示词（Prompt），AI 会据此生成日报的格式和内容。
        </div>
        <div class="info-box" style="background:#f0f7ff;border:1px solid #b3d4f7;border-radius:6px;padding:12px;margin-bottom:12px;font-size:13px;line-height:1.6;">
          <strong>💡 提示词分两级：</strong><br>
          <strong>系统级</strong>（不可修改）：工具定义、执行步骤 — AI 会自动调用工具查询待办、对话、笔记等数据<br>
          <strong>用户级</strong>（下方编辑）：日报格式要求、展示方式、注意事项 — 按你的偏好定制
        </div>
        <div class="template-help" @click="showTemplateHelp = !showTemplateHelp">
          <span>{{ showTemplateHelp ? '▼' : '▶' }}</span>
          📖 查看系统级工具说明（供参考）
        </div>
        <div v-if="showTemplateHelp" class="template-help-content">
          <table class="vars-table">
            <thead><tr><th>工具</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td><code>get_today_info()</code></td><td>获取今天的日期、项目/知识库信息</td></tr>
              <tr><td><code>query_todos(status, date_from)</code></td><td>查询待办事项，可按状态( done/in_progress/pending )和日期范围过滤</td></tr>
              <tr><td><code>query_messages(date_from, role)</code></td><td>查询对话记录，可按日期和角色( user/assistant )过滤</td></tr>
              <tr><td><code>query_documents(project_id, date_from)</code></td><td>查询项目/知识库文档更新记录</td></tr>
              <tr><td><code>query_data_records(dataset_name, date_from)</code></td><td>查询数据中心记录，可按数据集名称过滤</td></tr>
              <tr><td><code>query_reminders()</code></td><td>查询所有已启用的提醒</td></tr>
            </tbody>
          </table>
        </div>
        <textarea v-model="reportPrompt" class="code-editor" rows="20" spellcheck="false" placeholder="例如：&#10;请按以下格式生成日报：&#10;&#10;## 日报格式要求&#10;使用 Markdown 格式，包含今日概览、完成事项、待办事项、对话沟通、综合评估等板块。&#10;&#10;## 注意事项&#10;- 数据为空的部分略过&#10;- 给出效率评分和建议&#10;- 语言简洁专业"></textarea>
        <div class="flex" style="gap:8px;margin-top:8px;">
          <button class="btn btn-primary" @click="saveReportTemplate">保存提示词</button>
          <button class="btn btn-secondary" @click="resetReportTemplate">恢复默认</button>
          <span v-if="templateStatus" class="text-muted" :style="{ color: templateStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }" style="margin-left:8px;">{{ templateStatus }}</span>
        </div>
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
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';

const API = window.electronAPI;

const projects = ref<any[]>([]);
const agentStatus = ref({ pi: { installed: false, version: null, modelsAvailable: 0, firstModel: null }, opencode: { installed: false, version: null, providers: [], totalModels: 0 } });
const showHelp = ref(false);

const webhookUrl = ref('');
const webhookStatus = ref('');

const feishuAppId = ref('');
const feishuAppSecret = ref('');
const feishuRunning = ref(false);
const feishuStatus = ref('');

// Scheduled tasks
const schedulerRunning = ref(false);
const tasks = ref<any[]>([]);

// Report settings
const reportRetentionDays = ref('30');
const reportPrompt = ref('');
const reportSettingsStatus = ref('');
const showTemplateHelp = ref(false);
const templateStatus = ref('');
// Embedding model
const embedModel = ref('');
const embeddingBaseUrl = ref('');
const embeddingApiKey = ref('');
const embeddingStatus = ref('');


async function loadProjects() {
  try { projects.value = await API.project.list(); } catch { projects.value = []; }
}
const noteProjects = computed(() => projects.value
  .filter((p: any) => p.type === 'note')
  .map((p: any) => ({
    ...p,
    ignore_dirs_local: p.ignore_dirs || '',
    ignore_files_local: p.ignore_files || '',
  }))
);
async function saveProjectIgnore(p: any) {
  try {
    await API.project.update(p.id, { ignore_dirs: p.ignore_dirs_local, ignore_files: p.ignore_files_local });
  } catch {}
}
function projectName(projectId: number | null): string {
  if (!projectId) return '—';
  const p = projects.value.find(p => p.id === projectId);
  return p ? p.name : '—';
}
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

async function loadConfig() {
  try {
    const cfg = await API.config.get();
    webhookUrl.value = cfg.feishuWebhookUrl || '';
    feishuAppId.value = cfg.feishuAppId || '';
    feishuAppSecret.value = cfg.feishuAppSecret || '';
    reportRetentionDays.value = cfg.dailyReportRetentionDays || '30';
    reportPrompt.value = cfg.dailyReportPrompt || '';
    embedModel.value = cfg.embedModel || 'bge-m3';
    embeddingBaseUrl.value = cfg.embeddingBaseUrl || 'http://127.0.0.1:11434';
    embeddingApiKey.value = cfg.embeddingApiKey || '';
  } catch { console.warn('加载配置失败'); }
}

async function saveReportSettings() {
  try {
    await API.config.set({
      daily_report_retention_days: reportRetentionDays.value,
    });
    reportSettingsStatus.value = '✅ 已保存';
    setTimeout(() => reportSettingsStatus.value = '', 3000);
  } catch (e: any) {
    reportSettingsStatus.value = '❌ ' + (e.message || '保存失败');
  }
}

async function saveReportTemplate() {
  try {
    await API.config.set({ daily_report_prompt: reportPrompt.value });
    templateStatus.value = '✅ 已保存';
    setTimeout(() => templateStatus.value = '', 3000);
  } catch (e: any) {
    templateStatus.value = '❌ ' + (e.message || '保存失败');
  }
}

async function resetReportTemplate() {
  reportPrompt.value = '';
  await saveReportTemplate();
}
async function saveEmbeddingConfig() {
  if (!embedModel.value.trim()) { embeddingStatus.value = '❌ 请输入模型名称'; return; }
  try {
    await API.config.set({
      embedModel: embedModel.value.trim(),
      embeddingBaseUrl: embeddingBaseUrl.value.trim() || 'http://127.0.0.1:11434',
      embeddingApiKey: embeddingApiKey.value.trim() || '',
    });
    embeddingStatus.value = '✅ 已保存，重启应用后生效';
    setTimeout(() => embeddingStatus.value = '', 3000);
  } catch (e) {
    embeddingStatus.value = '❌ ' + (e.message || '保存失败');
  }
}

async function testEmbedding() {
  if (!embedModel.value.trim()) { embeddingStatus.value = '❌ 请输入模型名称'; return; }
  embeddingStatus.value = '⏳ 正在测试连接...';
  try {
    const result = await API.embedding.test(
      embedModel.value.trim(),
      embeddingBaseUrl.value.trim() || 'http://127.0.0.1:11434',
      embeddingApiKey.value.trim() || ''
    );
    if (result.ok) {
      embeddingStatus.value = result.message;
    } else {
      embeddingStatus.value = result.message;
    }
  } catch (e) {
    embeddingStatus.value = '❌ 测试异常: ' + (e.message || e);
  }
  setTimeout(() => {
    if (embeddingStatus.value.startsWith('⏳')) embeddingStatus.value = '';
  }, 10000);
}


onMounted(async () => {
  await loadConfig();
  checkAgentStatus();
  await loadProjects();
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

.template-help {
  padding: 6px 10px;
  margin-bottom: 8px;
  background: var(--hover);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--primary);
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: none;
}
.template-help:hover { background: #e8eaed; }
.template-help-content {
  margin-bottom: 8px;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fafbfc;
}

/* 笔记库索引配置 */
.project-ignore-config {
  background: var(--bg-main);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  margin-bottom: 8px;
}
.project-ignore-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.project-ignore-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}
.project-ignore-dir {
  font-size: 12px;
  color: var(--text-muted);
}
.vars-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.vars-table th { text-align: left; padding: 6px 10px; background: var(--hover); font-weight: 600; color: var(--text-secondary); border-bottom: 1px solid var(--border); position: sticky; top: 0; }
.vars-table td { padding: 4px 10px; border-bottom: 1px solid var(--border); color: var(--text-primary); }
.vars-table code { font-size: 11px; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; color: var(--primary); }
.code-editor {
  width: 100%;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  resize: vertical;
  min-height: 200px;
  tab-size: 2;
}
.code-editor:focus { outline: none; border-color: var(--primary); }
.code-editor::placeholder { color: #64748b; }
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
.config-table .task-project-name { font-size: 12px; color: var(--text-secondary); }
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