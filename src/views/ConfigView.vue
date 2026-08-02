<template>
  <div class="config-view">
    <div class="content-header">
      <h1 class="content-title">设置</h1>
    </div>

    <div class="content-body">

      <!-- Note Library Settings -->
      <div class="card">
        <h2>📚 笔记库设置</h2>
        <div class="text-muted mb-2">设置唯一的笔记库目录。知识库浏览、语义检索和 AI 对话都会使用此目录。</div>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:end;">
          <div class="form-group" style="flex:1;min-width:300px;">
            <label style="font-size:12px;">笔记库目录</label>
            <div class="input-with-btn">
              <input v-model="notesDir" type="text" class="form-control" placeholder="选择笔记库目录..." readonly>
              <button class="btn btn-secondary" @click="pickNotesDir">选择</button>
            </div>
          </div>
          <button class="btn btn-primary" @click="saveNotesDir" style="margin-bottom:12px;">保存</button>
        </div>
        <span v-if="notesDirStatus" class="text-muted" :style="{ color: notesDirStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ notesDirStatus }}</span>
      </div>

      <!-- Embedding Model Configuration (hidden) -->
      <div v-if="false" class="card">
        <h2>🧠 嵌入模型配置</h2>
        <div class="text-muted mb-2">配置笔记库索引使用的嵌入模型（Embedding Model），用于语义搜索。支持 Ollama 和 OpenAI 兼容接口（如 vLLM、LM Studio 等）。填写 API Key 则使用 OpenAI 兼容接口，否则使用 Ollama。</div>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:end;">
          <div class="form-group" style="flex:1;min-width:130px;">
            <label style="font-size:12px;">提供商名称</label>
            <input v-model="embeddingProvider" type="text" class="form-control" placeholder="Ollama">
          </div>
          <div class="form-group" style="flex:1;min-width:160px;">
            <label style="font-size:12px;">模型名称</label>
            <input v-model="embeddingModel" type="text" class="form-control" placeholder="bge-m3 / ...">
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
          <button class="btn btn-primary" @click="saveFeishuBot">保存</button>
          <button class="btn btn-primary" @click="startFeishuBot">{{ feishuRunning ? '重启 Bot' : '启动 Bot' }}</button>
          <button v-if="feishuRunning" class="btn btn-danger" @click="stopFeishuBot">停止 Bot</button>
          <button class="btn btn-secondary" @click="testFeishuBot">测试</button>
          <span v-if="feishuRunning" class="badge badge-success">● 运行中</span>
          <span v-else class="badge badge-gray">○ 已停止</span>
        </div>
        <span v-if="feishuStatus" class="text-muted" :style="{ color: feishuStatus.startsWith('✅') ? '#22c55e' : '#ef4444' }">{{ feishuStatus }}</span>
      </div>

      <!-- 云端数据库（MySQL） -->
      <div class="card">
        <h2>☁️ 云端数据库（MySQL）</h2>
        <div class="text-muted mb-2">默认使用本地 SQLite。填写连接信息后，会话、项目、待办、提醒、数据中心等主数据将存储到云端 MySQL（知识库索引留在本地），软件重装或损坏不影响云端数据。</div>
        <div class="flex" style="gap:8px;align-items:center;margin-bottom:12px;">
          <span class="badge" :class="dbModeBadgeClass">{{ dbModeText }}</span>
          <span v-if="dbCloudState === 'ready'" class="badge badge-success">● 云端已连接</span>
          <span v-else-if="!dbEnabled && dbCloudConfigured" class="badge badge-gray">⏸ 云端已停用</span>
          <span v-else-if="dbCloudConfigured && dbCloudState === 'failed'" class="badge badge-danger">● 连接失败</span>
          <span v-else-if="dbCloudConfigured && dbCloudState === 'starting'" class="badge badge-warning">⏳ 连接中...</span>
          <span v-else class="badge badge-gray">○ 未配置</span>
          <span style="flex:1"></span>
          <label class="toggle" title="关闭后主数据（会话、项目、待办、提醒、数据中心等）切回本地 SQLite，云端连接信息保留，重新开启即可恢复云端">
            <input type="checkbox" v-model="dbEnabled" @change="toggleDbEnabled">
            <span class="slider"></span>
          </label>
          <span class="text-muted" style="font-size:12px;">启用云端数据库</span>
        </div>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:end;">
          <div class="form-group" style="flex:1;min-width:200px;">
            <label style="font-size:12px;">主机地址</label>
            <input v-model="dbHost" type="text" class="form-control" placeholder="如 rm-xxxx.mysql.rds.aliyuncs.com" :disabled="!dbEnabled">
          </div>
          <div class="form-group" style="flex:0 0 90px;">
            <label style="font-size:12px;">端口</label>
            <input v-model="dbPort" type="text" class="form-control" placeholder="3306" :disabled="!dbEnabled">
          </div>
          <div class="form-group" style="flex:1;min-width:150px;">
            <label style="font-size:12px;">用户名</label>
            <input v-model="dbUser" type="text" class="form-control" placeholder="MySQL 账号" :disabled="!dbEnabled">
          </div>
          <div class="form-group" style="flex:1;min-width:150px;">
            <label style="font-size:12px;">密码</label>
            <input v-model="dbPassword" type="password" class="form-control" placeholder="MySQL 密码" :disabled="!dbEnabled">
          </div>
          <div class="form-group" style="flex:1;min-width:150px;">
            <label style="font-size:12px;">数据库名</label>
            <input v-model="dbName" type="text" class="form-control" placeholder="如 qihang_work" :disabled="!dbEnabled">
          </div>
          <div class="form-group" style="flex:0 0 auto;display:flex;align-items:center;gap:6px;padding-bottom:4px;">
            <label style="font-size:12px;margin:0;">SSL 连接</label>
            <input v-model="dbSsl" type="checkbox" style="margin:0;" :disabled="!dbEnabled">
          </div>
        </div>
        <div class="flex" style="gap:8px;flex-wrap:wrap;margin-top:4px;">
          <button class="btn btn-primary" @click="saveDbConfig" :disabled="!dbEnabled">保存并连接</button>
          <button class="btn btn-secondary" @click="testDbConfig" :disabled="!dbEnabled">测试连接</button>
          <button class="btn btn-secondary" @click="migrateDb" :disabled="dbMigrating || !dbEnabled || !dbCloudConfigured">{{ dbMigrating ? '迁移中...' : '迁移本地数据到云端' }}</button>
        </div>
        <span v-if="dbStatus" class="text-muted" :style="{ color: dbStatus.startsWith('✅') ? '#22c55e' : dbStatus.startsWith('⏳') ? '#f59e0b' : '#ef4444' }" style="margin-top:8px;display:block;">{{ dbStatus }}</span>
      </div>

      <!-- Backup / Restore -->
      <div class="card">
        <h2>💾 数据备份与恢复</h2>
        <div class="text-muted mb-2">备份本地 SQLite 快照（知识库索引）。云端模式下，会话、项目、待办等主数据存储在云 MySQL（云厂商自带备份），本地备份仅覆盖知识库索引；恢复后需重启应用生效。</div>
        <div class="form-row" style="gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:12px;">
          <div class="form-group" style="flex:1;min-width:300px;margin:0;">
            <label style="font-size:12px;">备份目录（建议选择其他盘符）</label>
            <div class="input-with-btn">
              <input v-model="backupDir" type="text" class="form-control" placeholder="默认 ~/.qihang-work-ai/backups" readonly>
              <button class="btn btn-secondary" @click="pickBackupDir">选择</button>
            </div>
          </div>
        </div>
        <div class="flex" style="gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <button class="btn btn-primary" @click="createBackup" :disabled="backupBusy">{{ backupBusy ? '备份中...' : '一键备份' }}</button>
          <button class="btn btn-secondary" @click="restoreBackup">从备份恢复...</button>
          <button class="btn btn-secondary" @click="openBackupDir">打开备份目录</button>
        </div>
        <div class="flex" style="gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
          <label class="toggle" title="应用运行期间每小时检查一次，距上次备份超过 24 小时自动补一份">
            <input type="checkbox" v-model="autoBackupEnabled" @change="saveAutoBackup">
            <span class="slider"></span>
          </label>
          <span class="text-muted">自动备份（运行期间，距上次超 24 小时自动补一份）</span>
          <div class="form-group" style="margin:0 0 0 16px;display:flex;align-items:center;gap:6px;">
            <label style="font-size:12px;margin:0;">保留份数</label>
            <input v-model="backupRetention" type="number" min="1" max="365" class="form-control" style="width:80px;" @change="saveAutoBackup">
          </div>
        </div>
        <span v-if="backupStatus" class="text-muted" :style="{ color: backupStatus.startsWith('✅') ? '#22c55e' : backupStatus.startsWith('⏳') ? '#f59e0b' : '#ef4444' }">{{ backupStatus }}</span>
        <div v-if="backupList.length" class="backup-list">
          <div class="backup-item" v-for="b in backupList" :key="b.path">
            <span class="backup-name">{{ b.name }}</span>
            <span class="backup-size">{{ formatSize(b.size) }}</span>
            <span class="backup-time">{{ formatTime(b.createdAt) }}</span>
            <button class="btn btn-sm btn-secondary" @click="restoreBackupFile(b)">恢复</button>
            <button class="btn btn-sm btn-danger" @click="deleteBackup(b)">删除</button>
          </div>
        </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const API = window.electronAPI;

const projects = ref<any[]>([]);

const webhookUrl = ref('');
const webhookStatus = ref('');

const feishuAppId = ref('');
const feishuAppSecret = ref('');
const feishuRunning = ref(false);
const feishuStatus = ref('');

const schedulerRunning = ref(false);

// Report settings
const reportRetentionDays = ref('30');
const reportPrompt = ref('');
const reportSettingsStatus = ref('');
const showTemplateHelp = ref(false);
const templateStatus = ref('');
// Embedding model
const embeddingModel = ref('');
const embeddingProvider = ref('');
const embeddingBaseUrl = ref('');
const embeddingApiKey = ref('');
const embeddingStatus = ref('');
const notesDir = ref('');
const notesDirStatus = ref('');

// Backup
const backupBusy = ref(false);
const backupStatus = ref('');
const backupList = ref<any[]>([]);
const autoBackupEnabled = ref(false);
const backupRetention = ref('30');
const backupDir = ref('');

// 云端数据库
const dbHost = ref('');
const dbPort = ref('3306');
const dbUser = ref('');
const dbPassword = ref('');
const dbName = ref('');
const dbSsl = ref(false);
const dbEnabled = ref(true);
const dbStatus = ref('');
const dbMode = ref<'cloud' | 'local'>('local');
const dbCloudConfigured = ref(false);
const dbCloudState = ref('idle');
const dbMigrating = ref(false);

const dbModeText = computed(() => dbMode.value === 'cloud' ? '☁️ 云端 MySQL 模式' : '💾 本地 SQLite 模式');
const dbModeBadgeClass = computed(() => dbMode.value === 'cloud' ? 'badge-primary' : 'badge-gray');

async function loadDbStatus() {
  try {
    const s = await API.db.status();
    dbMode.value = s.mode || 'local';
    dbCloudConfigured.value = !!s.configured;
    dbEnabled.value = s.enabled !== false;
    dbCloudState.value = dbEnabled.value ? (s.state || 'idle') : 'idle';
    if (s.host) {
      dbHost.value = s.host;
      dbPort.value = s.port || '3306';
      dbName.value = s.dbName || '';
      dbSsl.value = s.dbSsl === '1';
    }
  } catch {}
}

async function toggleDbEnabled() {
  if (!dbEnabled.value) {
    if (!confirm('关闭云端数据库后，主数据（会话、项目、待办、提醒、数据中心等）将切换回本地 SQLite 存储。云端数据仍保留在云 MySQL 中，重新开启即可继续使用。确定关闭？')) {
      dbEnabled.value = true;
      return;
    }
  }
  try {
    await API.config.set({ dbEnabled: dbEnabled.value ? '1' : '0' });
    await API.db.reload();
    await loadDbStatus();
    if (dbEnabled.value) {
      dbStatus.value = 'ℹ️ 云端数据库已启用，请点击「保存并连接」或「测试连接」';
    } else {
      dbStatus.value = '✅ 已切换到本地 SQLite 模式，云端连接信息已保留';
      setTimeout(() => { if (dbStatus.value.startsWith('✅')) dbStatus.value = ''; }, 5000);
    }
  } catch (e: any) {
    dbEnabled.value = !dbEnabled.value;
    dbStatus.value = '❌ ' + (e.message || '操作失败');
  }
}

async function saveDbConfig() {
  if (!dbHost.value.trim() || !dbUser.value.trim() || !dbName.value.trim()) {
    dbStatus.value = '❌ 请填写主机、用户名和数据库名';
    return;
  }
  try {
    await API.config.set({
      dbEnabled: dbEnabled.value ? '1' : '0',
      dbHost: dbHost.value.trim(),
      dbPort: dbPort.value.trim() || '3306',
      dbUser: dbUser.value.trim(),
      dbPassword: dbPassword.value,
      dbName: dbName.value.trim(),
      dbSsl: dbSsl.value ? '1' : '0',
    });
    await API.db.reload();
    await loadDbStatus();
    dbStatus.value = '⏳ 配置已保存，正在连接云端数据库...';
    const r = await API.db.test();
    if (r.ok && r.mode === 'cloud') {
      dbStatus.value = `✅ 已连接云端数据库（延迟 ${r.latencyMs ?? '?'}ms），主数据将存储到云端。如需导入本地数据，请点击「迁移本地数据到云端」`;
      dbCloudState.value = 'ready';
    } else {
      dbStatus.value = '⚠️ 配置已保存，但连接失败：' + (r.error || '未知错误');
    }
    setTimeout(() => { if (dbStatus.value.startsWith('✅')) dbStatus.value = ''; }, 6000);
  } catch (e: any) {
    dbStatus.value = '❌ ' + (e.message || '保存失败');
  }
}

async function testDbConfig() {
  if (!dbEnabled.value) {
    dbStatus.value = 'ℹ️ 云端数据库已停用（当前使用本地 SQLite），请先打开「启用云端数据库」开关';
    return;
  }
  dbStatus.value = '⏳ 正在测试连接...';
  try {
    const r = await API.db.test();
    if (r.ok && r.mode === 'cloud') {
      dbStatus.value = `✅ 云端数据库连接正常（延迟 ${r.latencyMs ?? '?'}ms）`;
      dbCloudState.value = 'ready';
    } else if (r.ok && r.mode === 'local') {
      dbStatus.value = 'ℹ️ 当前为本地 SQLite 模式（未配置云 MySQL）';
    } else {
      dbStatus.value = '❌ ' + (r.error || '连接失败');
      dbCloudState.value = 'failed';
    }
  } catch (e: any) {
    dbStatus.value = '❌ ' + (e.message || '测试异常');
  }
  setTimeout(() => { if (dbStatus.value.startsWith('✅')) dbStatus.value = ''; }, 6000);
}

async function migrateDb() {
  if (!confirm('将把本地 SQLite 中的会话、项目、待办、提醒、数据中心、AI 分析等数据导入云端 MySQL（知识库索引留本地）。\n\n云端同名表数据会被清空后重新导入，确定继续？')) return;
  dbMigrating.value = true;
  dbStatus.value = '⏳ 正在迁移，请稍候...';
  try {
    const r = await API.db.migrate();
    if (r.ok) {
      const parts = Object.entries(r.counts || {}).map(([t, c]) => `${t}: ${c}`);
      dbStatus.value = `✅ 迁移完成：${parts.join('，')}`;
    } else {
      dbStatus.value = '❌ ' + (r.error || '迁移失败');
    }
  } catch (e: any) {
    dbStatus.value = '❌ ' + (e.message || '迁移失败');
  }
  dbMigrating.value = false;
  setTimeout(() => { if (dbStatus.value.startsWith('✅')) dbStatus.value = ''; }, 8000);
}

async function loadBackups() {
  try { backupList.value = await API.backup.list(); } catch { backupList.value = []; }
}

async function loadAutoBackup() {
  try {
    const s = await API.backup.autoStatus();
    autoBackupEnabled.value = !!s.enabled;
    backupRetention.value = String(s.retention || 30);
    backupDir.value = s.dir || '';
  } catch {}
}

async function pickBackupDir() {
  try {
    const dir = await API.backup.pickDir();
    if (!dir) return;
    const res = await API.backup.setDir(dir);
    if (res.ok) {
      backupDir.value = res.dir || dir;
      backupStatus.value = `✅ 备份目录已设置为: ${dir}`;
      await loadBackups();
      setTimeout(() => { if (backupStatus.value.startsWith('✅')) backupStatus.value = ''; }, 5000);
    } else {
      backupStatus.value = '❌ ' + (res.error || '设置失败');
    }
  } catch (e: any) { backupStatus.value = '❌ ' + (e.message || '设置失败'); }
}

function formatSize(size: number): string {
  if (!size) return '0 B';
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / 1024 / 1024).toFixed(1) + ' MB';
}

function formatTime(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch { return iso; }
}

async function createBackup() {
  backupBusy.value = true;
  backupStatus.value = '⏳ 正在备份...';
  try {
    const res = await API.backup.create();
    if (res.ok) {
      backupStatus.value = `✅ 备份完成: ${res.path}`;
      await loadBackups();
    } else {
      backupStatus.value = '❌ ' + (res.error || '备份失败');
    }
  } catch (e: any) { backupStatus.value = '❌ ' + (e.message || '备份失败'); }
  backupBusy.value = false;
  setTimeout(() => { if (backupStatus.value.startsWith('✅')) backupStatus.value = ''; }, 6000);
}

async function restoreBackup() {
  try {
    const file = await API.backup.pickFile();
    if (!file) return;
    if (!confirm('恢复会替换当前全部数据，且需要重启应用。确定继续？')) return;
    const res = await API.backup.restore(file);
    if (res.ok) {
      alert('✅ 恢复成功，请重启应用生效');
    } else {
      alert('❌ 恢复失败: ' + (res.error || '未知错误'));
    }
  } catch (e: any) { alert('❌ 恢复失败: ' + (e.message || e)); }
}

async function restoreBackupFile(b: any) {
  if (!confirm(`从备份「${b.name}」恢复？\n将替换当前全部数据，且需要重启应用。`)) return;
  try {
    const res = await API.backup.restore(b.path);
    if (res.ok) {
      alert('✅ 恢复成功，请重启应用生效');
    } else {
      alert('❌ 恢复失败: ' + (res.error || '未知错误'));
    }
  } catch (e: any) { alert('❌ 恢复失败: ' + (e.message || e)); }
}

async function deleteBackup(b: any) {
  if (!confirm(`删除备份「${b.name}」？`)) return;
  try {
    const res = await API.backup.deleteFile(b.path);
    if (!res.ok) alert('❌ 删除失败: ' + (res.error || '未知错误'));
    await loadBackups();
  } catch (e: any) { alert('❌ 删除失败: ' + (e.message || e)); }
}

async function saveAutoBackup() {
  try {
    await API.config.set({ autoBackupEnabled: autoBackupEnabled.value ? '1' : '0', backupRetention: backupRetention.value || '30' });
    await API.backup.setAuto(autoBackupEnabled.value);
    backupStatus.value = autoBackupEnabled.value ? '✅ 自动备份已开启' : '✅ 自动备份已关闭';
    setTimeout(() => { if (backupStatus.value.startsWith('✅')) backupStatus.value = ''; }, 3000);
  } catch (e: any) { backupStatus.value = '❌ ' + (e.message || '保存失败'); }
}

async function openBackupDir() {
  try {
    const s = await API.backup.autoStatus();
    await API.backup.openDir(s.dir);
  } catch {}
}


async function loadProjects() {
  try { projects.value = await API.project.list(); } catch { projects.value = []; }
}
async function loadNotesDir() {
  notesDir.value = await API.kb.getDir();
}
async function pickNotesDir() {
  try {
    const dir = await API.dialog.openDirectory();
    if (dir) notesDir.value = dir;
  } catch {}
}
async function saveNotesDir() {
  if (!notesDir.value.trim()) { notesDirStatus.value = '❌ 请先选择笔记库目录'; return; }
  try {
    const p = await API.kb.setDir(notesDir.value.trim());
    notesDirStatus.value = '✅ 已保存，笔记库: ' + (p?.name || '');
    await loadProjects();
    setTimeout(() => notesDirStatus.value = '', 3000);
  } catch (e: any) {
    notesDirStatus.value = '❌ ' + (e.message || '保存失败');
  }
}
async function loadSchedulerStatus() {
  try { const s = await API.service.status(); schedulerRunning.value = s.scheduler; } catch {}
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

async function saveFeishuBot() {
  try {
    await API.feishu.saveBot(feishuAppId.value, feishuAppSecret.value);
    feishuStatus.value = '✅ 配置已保存';
    setTimeout(() => feishuStatus.value = '', 3000);
  } catch (e: any) { feishuStatus.value = '❌ ' + (e.message || '保存失败'); }
}

async function startFeishuBot() {
  if (!feishuAppId.value || !feishuAppSecret.value) { feishuStatus.value = '❌ 请先填写 App ID 和 App Secret'; return; }
  try {
    await API.feishu.saveBot(feishuAppId.value, feishuAppSecret.value);
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
    embeddingModel.value = cfg.embeddingModel || '';
    embeddingProvider.value = cfg.embeddingProvider || 'Ollama';
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
  if (!embeddingModel.value.trim()) { embeddingStatus.value = '❌ 请输入模型名称'; return; }
  try {
    await API.config.set({
      embeddingModel: embeddingModel.value.trim(),
      embeddingProvider: embeddingProvider.value.trim() || 'Ollama',
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
  if (!embeddingModel.value.trim()) { embeddingStatus.value = '❌ 请输入模型名称'; return; }
  embeddingStatus.value = '⏳ 正在测试连接...';
  try {
    const result = await API.embedding.test(
      embeddingModel.value.trim(),
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
  await loadProjects();
  await loadNotesDir();
  await loadSchedulerStatus();
  await loadBackups();
  await loadAutoBackup();
  await loadDbStatus();
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
.input-with-btn { display: flex; gap: 8px; }
.input-with-btn .form-control { flex: 1; }
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
.badge-danger { background: rgba(220, 38, 38, 0.1); color: #dc2626; }

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

.backup-list { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; }
.backup-item { display: flex; align-items: center; gap: 10px; padding: 6px 4px; font-size: 13px; border-bottom: 1px solid var(--border); }
.backup-item:last-child { border-bottom: none; }
.backup-name { flex: 1; font-family: 'SF Mono', 'Consolas', monospace; font-size: 12px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.backup-size { font-size: 12px; color: var(--text-muted); min-width: 60px; text-align: right; }
.backup-time { font-size: 12px; color: var(--text-muted); min-width: 140px; }
</style>