<template>
  <div class="chat-home">
    <!-- ========== 左栏：对话列表 ========== -->
    <div class="chat-sidebar">
      <div class="sidebar-header">
        <h3 class="sidebar-title">对话</h3>
        <button class="btn btn-sm btn-primary" @click="newSession">+ 新对话</button>
      </div>

      <div class="conversation-list" v-if="sessions.length">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="conversation-item"
          :class="{ active: currentSessionId === session.id }"
          @click="selectSession(session)"
        >
          <span class="conv-icon">🗨️</span>
          <div class="conv-info">
            <div class="conv-title">{{ session.title || '新对话' }}</div>
            <div class="conv-preview">{{ session.last_message || '' }}</div>
          </div>
          <span class="conv-delete" @click.stop="deleteSession(session.id)" title="删除">×</span>
        </div>
      </div>
      <div v-else class="sidebar-empty">
        <div class="empty-icon">💬</div>
        <div class="empty-text">还没有对话，开始第一个吧</div>
      </div>
    </div>

    <!-- ========== 右栏：对话区 ========== -->
    <div class="chat-main">
      <!-- 无对话时：未配置笔记库 → 首次引导 -->
      <div v-if="!currentSessionId && kbLoaded && !defaultKbId" class="chat-empty">
        <div class="empty-icon">📚</div>
        <div class="empty-title">欢迎使用启航 AI 助理</div>
        <div class="empty-desc">
          第一步：配置本地笔记库路径<br>
          笔记库用于知识检索与 AI 问答，可在设置页随时修改
        </div>
        <button class="btn btn-primary btn-lg" @click="setupNotesDir">📂 选择笔记库目录</button>
      </div>

      <!-- 无对话时 -->
      <div v-else-if="!currentSessionId" class="chat-empty">
        <div class="empty-icon">🤖</div>
        <div class="empty-title">启航 AI 助理</div>
        <div class="empty-desc">
          问任何问题，无需绑定项目<br>
          支持 日常问答 · 数据查询 · 笔记库检索 · 待办任务
        </div>
        <button class="btn btn-primary" @click="newSession">开始对话</button>
      </div>

      <!-- 有对话时 -->
      <template v-else>
        <div class="chat-header">
          <div class="chat-header-left">
            <h3 class="chat-title">{{ currentSession?.title || '对话' }}</h3>
          </div>
        </div>

        <div class="chat-messages" ref="messagesContainer">
          <div v-for="(msg, idx) in messages" :key="idx" class="message" :class="msg.role">
            <div class="message-avatar">
              <span v-if="msg.role === 'user'">👤</span>
              <span v-else-if="msg.role === 'tool'">🔧</span>
              <span v-else-if="msg.role === 'system'">⚡</span>
              <span v-else>🤖</span>
            </div>
            <div class="message-content-wrapper">
              <div class="message-header">
                <span class="message-author">
                  {{ msg.role === 'user' ? '我' : msg.role === 'tool' ? '工具' : msg.role === 'system' ? '系统' : 'AI 助理' }}
                </span>
                <span class="message-status" v-if="msg.status">{{ msg.status }}</span>
              </div>
              <div class="message-content" :class="{ 'markdown-body': msg.role === 'assistant' }">
                <div v-if="thinkingText && idx === messages.length - 1" class="thinking-status">{{ thinkingText }}</div>
                <div v-if="msg.images?.length" class="message-images">
                  <img v-for="(img, i) in msg.images" :key="i" :src="`data:${img.mimeType};base64,${img.data}`" class="chat-image" />
                </div>
                <div v-html="msg.role === 'user' ? escHtml(msg.content) : renderMarkdown(msg.content)"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="chat-input-area">
          <div class="input-wrapper">
            <textarea
              v-model="inputText"
              class="chat-input"
              :placeholder="defaultKbId ? '输入问题，Enter 发送... (已附加笔记库上下文)' : '输入问题，Enter 发送...'"
              @keydown.enter.exact.prevent="sendMessage"
              @paste="handlePaste"
              @compositionstart="composing = true"
              @compositionend="composing = false"
              ref="inputRef"
              :disabled="isStreaming"
              rows="1"
            ></textarea>
            <div v-if="pendingImages.length" class="image-preview-bar">
              <div v-for="(img, i) in pendingImages" :key="i" class="image-preview-item">
                <img :src="`data:${img.mimeType};base64,${img.data}`" class="image-preview-thumb" />
                <button class="image-preview-remove" @click="removeImage(i)">×</button>
              </div>
            </div>
            <div class="input-footer">
              <div class="input-left">
                <button class="toolbar-btn" @click="handleImageClick" title="上传图片">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </button>
                <input ref="fileInputRef" type="file" accept="image/*" multiple style="display:none" @change="handleImageUpload" />
                <select class="model-selector" v-model="selectedModel" :disabled="isStreaming" title="选择模型">
                  <option value="">默认模型</option>
                  <option v-for="m in piModels" :key="m.pattern" :value="m.pattern">
                    {{ m.providerLabel }} · {{ m.name }}
                  </option>
                </select>
                <span class="input-hint">Enter 发送 · Shift+Enter 换行 · pi agent 驱动</span>
              </div>
              <div class="input-right">
                <button
                  class="send-btn"
                  :disabled="(!inputText.trim() && !pendingImages.length) || isStreaming"
                  @click="sendMessage"
                  :title="isStreaming ? '正在处理...' : '发送'"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue';
import { marked } from 'marked';

const API = window.electronAPI;

// ========== 状态 ==========
const sessions = ref<any[]>([]);
const currentSessionId = ref('');
const currentSession = ref<any>(null);
const messages = ref<any[]>([]);
const inputText = ref('');
const isStreaming = ref(false);
const composing = ref(false);
const thinkingText = ref('');
const defaultKbId = ref<number | null>(null);
const kbDir = ref('');
const kbLoaded = ref(false);
const inputRef = ref<HTMLTextAreaElement>();
const messagesContainer = ref<HTMLElement>();
const pendingImages = ref<{ data: string; mimeType: string }[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const piModels = ref<{ provider: string; providerLabel: string; id: string; name: string; pattern: string; configured: boolean }[]>([]);
const selectedModel = ref('');
const modelsLoaded = ref(false);

const CHAT_STATE_KEY = 'chat_home_state';
const CHAT_MODEL_KEY = 'chat_home_model';

// ========== 加载数据 ==========
async function loadKbLibraries() {
  try {
    kbDir.value = await API.kb.getDir();
    defaultKbId.value = kbDir.value ? 1 : null;
  } catch { defaultKbId.value = null; kbDir.value = ''; }
  kbLoaded.value = true;
}

async function loadPiModels() {
  try {
    const res = await API.pi.models();
    piModels.value = (res?.models || []).filter((m) => m.pattern);
    const saved = localStorage.getItem(CHAT_MODEL_KEY);
    if (saved && piModels.value.some((m) => m.pattern === saved)) selectedModel.value = saved;
  } catch { piModels.value = []; }
  modelsLoaded.value = true;
}

async function setupNotesDir() {
  try {
    const dir = await API.dialog.openDirectory();
    if (!dir) return;
    const p = await API.kb.setDir(dir);
    await loadKbLibraries();
    await loadSessions();
    await newSession();
  } catch (e: any) {
    alert('配置失败: ' + (e.message || e));
  }
}

async function loadSessions() {
  try {
    const all = await API.chat.getSessionsBySource('ui');
    sessions.value = (all || []).filter((s: any) => s.mode === 'general' || !s.project_id);
  } catch { sessions.value = []; }
}

async function loadMessages(sessionId: string) {
  try {
    const msgs = await API.chat.getMessages(sessionId);
    messages.value = msgs.map((m: any) => ({
      role: m.role,
      content: m.content,
      images: m.images || undefined,
    }));
    for (const m of messages.value) {
      if (m.images && typeof m.images === 'string') {
        try { m.images = JSON.parse(m.images); } catch { m.images = undefined; }
      }
    }
  } catch { messages.value = []; }
  scrollToBottom();
}

// ========== 对话操作 ==========
async function selectSession(session: any) {
  if (isStreaming.value) return;
  currentSessionId.value = session.id;
  currentSession.value = session;
  await loadMessages(session.id);
  saveState();
}

async function newSession() {
  if (isStreaming.value) return;
  const id = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  try {
    const session = await API.chat.createSession(id, null, '新对话', 'general', 'general', 'ui');
    currentSessionId.value = id;
    currentSession.value = session;
    messages.value = [];
    inputText.value = '';
    await loadSessions();
    saveState();
    nextTick(() => inputRef.value?.focus());
  } catch (e: any) {
    console.error('创建对话失败:', e);
  }
}

async function deleteSession(sessionId: string) {
  if (!confirm('确定删除此对话？')) return;
  try {
    await API.chat.deleteSession(sessionId);
    if (currentSessionId.value === sessionId) {
      currentSessionId.value = '';
      currentSession.value = null;
      messages.value = [];
      localStorage.removeItem(CHAT_STATE_KEY);
    }
    await loadSessions();
  } catch (e: any) {
    console.error('删除失败:', e);
  }
}

// ========== 状态持久化 ==========
function saveState() {
  try {
    localStorage.setItem(CHAT_STATE_KEY, JSON.stringify({ sessionId: currentSessionId.value }));
  } catch (e) {
    console.error('保存对话状态失败:', e);
  }
}

async function restoreState() {
  try {
    const saved = localStorage.getItem(CHAT_STATE_KEY);
    if (!saved) return false;
    const { sessionId } = JSON.parse(saved);
    if (!sessionId) return false;
    const session = sessions.value.find((s) => s.id === sessionId);
    if (!session) return false;
    currentSessionId.value = session.id;
    currentSession.value = session;
    await loadMessages(session.id);
    return true;
  } catch { return false; }
}

// ========== 图片处理 ==========
function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        pendingImages.value.push({ data: dataUrl.split(',')[1], mimeType: file.type });
      };
      reader.readAsDataURL(file);
    }
  }
}

function handleImageClick() {
  fileInputRef.value?.click();
}

function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files) return;
  for (const file of Array.from(input.files)) {
    if (!file.type.startsWith('image/')) continue;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      pendingImages.value.push({ data: dataUrl.split(',')[1], mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }
  input.value = '';
}

function removeImage(index: number) {
  pendingImages.value.splice(index, 1);
}

// ========== 发送消息 ==========
async function sendMessage() {
  const text = inputText.value.trim();
  if ((!text && !pendingImages.value.length) || isStreaming.value) return;

  if (!currentSessionId.value) {
    await newSession();
    nextTick(() => { doSend(text); });
    return;
  }
  doSend(text);
}

async function doSend(text: string) {
  const images = pendingImages.value.map(img => ({ data: img.data, mimeType: img.mimeType }));
  pendingImages.value = [];

  const userMsg: any = { role: 'user', content: text };
  if (images.length) userMsg.images = images;
  messages.value.push(userMsg);

  inputText.value = '';
  autoResizeTextarea();

  const msgIdx = messages.value.length;
  messages.value.push({ role: 'assistant', content: '', status: '准备中...' });

  isStreaming.value = true;
  scrollToBottom();

  const sid = currentSessionId.value;
  const kbIds = defaultKbId.value ? [defaultKbId.value] : undefined;

  API.removeAllListeners('chat:delta');
  API.removeAllListeners('chat:status');
  API.removeAllListeners('chat:tool');
  API.removeAllListeners('chat:done');
  API.removeAllListeners('chat:error');

  const onDelta = (data: { sessionId: string; text: string }) => {
    if (data.sessionId !== sid) return;
    const msg = messages.value[msgIdx];
    if (msg) { msg.content += data.text; msg.status = ''; }
    scrollToBottom();
  };

  const onStatus = (data: { sessionId: string; text: string }) => {
    if (data.sessionId !== sid) return;
    const msg = messages.value[msgIdx];
    if (msg) msg.status = data.text;
  };

  const onTool = (data: { sessionId: string; type: string; name: string; text?: string; error?: boolean }) => {
    if (data.sessionId !== sid) return;
    if (data.type === 'thinking') {
      thinkingText.value = `💭 ${data.text || ''}`;
    } else if (data.type === 'start') {
      thinkingText.value = `🔧 正在执行: ${data.name}`;
    } else if (data.type === 'end') {
      thinkingText.value = `${data.error ? '❌' : '✅'} ${data.name} ${data.error ? '失败' : '完成'}`;
    }
    scrollToBottom();
  };

  const cleanup = () => {
    API.removeAllListeners('chat:delta');
    API.removeAllListeners('chat:status');
    API.removeAllListeners('chat:tool');
    API.removeAllListeners('chat:done');
    API.removeAllListeners('chat:error');
  };

  const onDone = (data: { sessionId: string }) => {
    if (data.sessionId !== sid) return;
    isStreaming.value = false;
    const msg = messages.value[msgIdx];
    if (msg) msg.status = '✓ 完成';
    thinkingText.value = '';
    cleanup();
    loadSessions();
  };

  const onError = (data: { sessionId: string; text: string }) => {
    if (data.sessionId !== sid) return;
    isStreaming.value = false;
    const msg = messages.value[msgIdx];
    if (msg) { msg.content = '❌ ' + data.text; msg.status = '错误'; }
    cleanup();
    scrollToBottom();
  };

  API.on('chat:delta', onDelta);
  API.on('chat:status', onStatus);
  API.on('chat:tool', onTool);
  API.on('chat:done', onDone);
  API.on('chat:error', onError);

  try {
    await API.chat.send(text, sid, kbDir.value, kbIds, images.length ? images : undefined, 'general', selectedModel.value || undefined);
    if (selectedModel.value) localStorage.setItem(CHAT_MODEL_KEY, selectedModel.value);
    else localStorage.removeItem(CHAT_MODEL_KEY);
  } catch (err: any) {
    isStreaming.value = false;
    const msg = messages.value[msgIdx];
    if (msg) msg.content = '❌ ' + (err.message || '发送失败');
    cleanup();
  }
}

// ========== 工具函数 ==========
const renderMarkdown = (content: string) => {
  if (!content) return '';
  try { return marked(content); } catch { return escHtml(content).replace(/\n/g, '<br>'); }
};

const escHtml = (text: string) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

const autoResizeTextarea = () => {
  if (inputRef.value) {
    inputRef.value.style.height = 'auto';
    inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 120) + 'px';
  }
};

// ========== 生命周期 ==========
onMounted(async () => {
  await Promise.all([loadKbLibraries(), loadSessions(), loadPiModels()]);
  await restoreState();
});

onBeforeUnmount(() => {
  API.removeAllListeners('chat:delta');
  API.removeAllListeners('chat:status');
  API.removeAllListeners('chat:tool');
  API.removeAllListeners('chat:done');
  API.removeAllListeners('chat:error');
});
</script>

<style scoped>
.chat-home {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--bg-main);
}

/* ========== 左栏 ========== */
.chat-sidebar {
  width: 280px;
  min-width: 280px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.conversation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.conversation-item:hover {
  background: var(--hover);
}

.conversation-item.active {
  background: rgba(99, 102, 241, 0.1);
  border-left: 3px solid var(--primary);
}

.conv-icon {
  font-size: 13px;
  flex-shrink: 0;
  width: 18px;
  text-align: center;
}

.conv-info {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.conv-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-preview {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.conv-delete {
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
  visibility: hidden;
  width: 16px;
  text-align: center;
  border-radius: 4px;
  flex-shrink: 0;
  line-height: 1;
}

.conversation-item:hover .conv-delete {
  visibility: visible;
}

.conv-delete:hover {
  color: var(--danger);
  background: rgba(239, 68, 68, 0.1);
}

.sidebar-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px;
  gap: 8px;
}

.sidebar-empty .empty-icon {
  font-size: 32px;
  opacity: 0.3;
}

.sidebar-empty .empty-text {
  font-size: 13px;
  color: var(--text-muted);
}

/* ========== 右栏 ========== */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
  gap: 12px;
}

.chat-empty .empty-icon {
  font-size: 64px;
  opacity: 0.3;
}

.chat-empty .empty-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.chat-empty .empty-desc {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.btn-lg {
  padding: 10px 24px;
  font-size: 14px;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sidebar);
  flex-shrink: 0;
}

.chat-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.model-selector {
  font-size: 12px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  max-width: 180px;
  outline: none;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message {
  display: flex;
  gap: 10px;
  max-width: 100%;
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--hover);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.message.user .message-avatar {
  background: rgba(99, 102, 241, 0.1);
}

.message-content-wrapper {
  flex: 1;
  min-width: 0;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.message-author {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.message-status {
  font-size: 11px;
  color: var(--text-muted);
}

.message-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
}

.thinking-status {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.chat-image {
  max-width: 300px;
  max-height: 300px;
  border-radius: 8px;
  border: 1px solid var(--border);
  object-fit: contain;
}

/* ========== 输入区 ========== */
.chat-input-area {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-sidebar);
  flex-shrink: 0;
}

.input-wrapper {
  max-width: 900px;
  margin: 0 auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: white;
  padding: 10px 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-wrapper:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.chat-input {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  background: transparent;
  max-height: 120px;
  font-family: inherit;
}

.chat-input::placeholder {
  color: var(--text-muted);
}

.image-preview-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
}

.image-preview-item {
  position: relative;
}

.image-preview-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.image-preview-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: var(--danger);
  color: white;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
}

.input-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: all 0.15s;
}

.toolbar-btn:hover {
  color: var(--primary);
  background: var(--hover);
}

.input-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.send-btn {
  border: none;
  background: var(--primary);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.send-btn:hover:not(:disabled) {
  background: var(--primary-dark);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
