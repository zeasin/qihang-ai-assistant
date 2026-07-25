<template>
  <div class="chat-view">
    <div class="chat-layout">
      <div class="session-sidebar">
        <div class="sidebar-header">
          <h3 class="sidebar-title">历史对话</h3>
          <button class="btn btn-sm btn-secondary" @click="newSession">+ 新对话</button>
        </div>
        <div class="session-list">
          <div
            v-for="s in sessions"
            :key="s.id"
            class="session-item"
            :class="{ active: s.id === currentSessionId }"
            @click="loadSession(s.id)"
          >
            <div class="session-title">
              <span v-if="s.source === 'feishu'" class="source-badge feishu">飞</span>
              <span v-else class="source-badge ui">Web</span>
              {{ s.title || '新对话' }}
            </div>
            <div class="session-meta">
              <span class="session-date">{{ formatDate(s.updated_at) }}</span>
              <span class="session-delete" @click.stop="deleteSession(s.id)" title="删除">×</span>
            </div>
          </div>
          <div v-if="!sessions.length" class="sidebar-empty">暂无历史对话</div>
        </div>
      </div>

      <div class="chat-main">
        <div class="chat-wrapper">
          <div class="chat-messages" ref="messagesContainer">
            <div v-if="!messages.length" class="empty-state">
              <div class="empty-icon">💬</div>
              <div class="empty-title">开始对话</div>
              <div class="empty-desc">输入问题并按 Enter 发送。<br>输入 <code>@</code> 可提及笔记库进行定向检索。</div>
            </div>

            <div v-for="(msg, idx) in messages" :key="idx" class="message" :class="msg.role">
              <div class="message-avatar">
                <span v-if="msg.role === 'user'">👤</span>
                <span v-else-if="msg.role === 'tool'">🔧</span>
                <span v-else>🤖</span>
              </div>
              <div class="message-content-wrapper">
                <div class="message-header">
                  <span class="message-author">
                    {{ msg.role === 'user' ? '我' : msg.role === 'tool' ? '工具' : selectedAgent === 'pi' ? 'pi agent' : 'opencode' }}
                  </span>
                  <span class="message-status" v-if="msg.status">{{ msg.status }}</span>
                </div>
                <div
                  class="message-content"
                  :class="{ 'markdown-body': msg.role === 'assistant' }"
                >
                  <div v-if="msg.role === 'assistant' && thinkingContent && idx === messages.length - 1" class="thinking-status">{{ thinkingContent }}</div>
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
              <div class="textarea-wrapper">
              <div v-if="mentionedKbs.length || selectedProject" class="mention-chips-inline">
                <span v-if="selectedProject" class="chip chip-project">
                  📁 {{ selectedProject.name }}
                  <span class="chip-remove" @click="clearProject">×</span>
                </span>
                <span v-for="kb in mentionedKbs" :key="kb.id" class="chip">
                  📚 {{ kb.name }}
                  <span class="chip-remove" @click="removeMention(kb.id)">×</span>
                </span>
              </div>
                <textarea
                  v-model="inputText"
                  class="chat-input"
                  placeholder="输入问题，按 Enter 发送... 输入 @ 提及笔记库"
                  @keydown.enter.exact.prevent="sendMessage"
                  @keydown="handleKeydown"
                  @input="onInput"
                  @paste="handlePaste"
                  @compositionstart="composing = true"
                  @compositionend="composing = false"
                  ref="inputRef"
                  :disabled="isStreaming"
                ></textarea>
                <div v-if="showMention" class="mention-dropdown">
                  <div
                    v-for="(kb, i) in mentionFiltered"
                    :key="kb.id"
                    class="mention-item"
                    :class="{ active: mentionIndex === i }"
                    @click="selectMention(kb)"
                    @mouseenter="mentionIndex = i"
                  >
                    📚 {{ kb.name }}
                  </div>
                  <div v-if="mentionFiltered.length === 0" class="mention-item disabled">无匹配笔记库</div>
                </div>
              </div>
              <div v-if="pendingImages.length" class="image-preview-bar">
                <div v-for="(img, i) in pendingImages" :key="i" class="image-preview-item">
                  <img :src="`data:${img.mimeType};base64,${img.data}`" class="image-preview-thumb" />
                  <button class="image-preview-remove" @click="removeImage(i)">×</button>
                </div>
              </div>
              <div class="input-footer">
                <div class="input-left">
                  <div class="toolbar-btn-wrapper">
                    <button class="toolbar-btn" @click.stop="toggleMentionDropdown" title="提及笔记库">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <circle cx="12" cy="12" r="4"/>
                        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>
                      </svg>
                    </button>
                    <div v-if="showMentionPopup" class="agent-popup" @click.stop>
                      <div class="agent-popup-header">选择笔记库</div>
                      <div class="agent-popup-list">
                        <div
                          v-for="(kb, i) in kbList"
                          :key="kb.id"
                          class="agent-popup-item"
                          :class="{ active: mentionedKbs.some(m => m.id === kb.id) }"
                          @click="toggleKbMention(kb)"
                        >
                          📚 {{ kb.name }}
                          <span v-if="mentionedKbs.some(m => m.id === kb.id)" class="check-mark">✓</span>
                        </div>
                        <div v-if="kbList.length === 0" class="agent-popup-item disabled">暂无笔记库</div>
                      </div>
                    </div>
                  </div>
                  <div class="toolbar-btn-wrapper">
                    <button class="toolbar-btn" :class="{ active: selectedProject }" @click.stop="toggleProjectPopup" title="关联项目">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                      <span v-if="selectedProject" class="active-indicator" style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:#6366f1;"></span>
                    </button>
                    <div v-if="showProjectPopup" class="agent-popup" @click.stop>
                      <div class="agent-popup-header">关联项目</div>
                      <div class="agent-popup-list">
                        <div
                          v-for="(p, i) in projectList"
                          :key="p.id"
                          class="agent-popup-item"
                          :class="{ active: selectedProject?.id === p.id }"
                          @click="selectProject(p)"
                        >
                          📁 {{ p.name }}
                          <span v-if="selectedProject?.id === p.id" class="check-mark">✓</span>
                        </div>
                        <div v-if="selectedProject" class="agent-popup-item" style="color:#ef4444;" @click="clearProject">
                          ✕ 清除项目关联
                        </div>
                        <div v-if="projectList.length === 0" class="agent-popup-item disabled">暂无项目</div>
                      </div>
                    </div>
                  </div>
                  <div class="toolbar-btn-wrapper">
                    <button class="toolbar-btn toolbar-btn-agent" @click.stop="toggleAgentMenu" title="切换 Agent">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      <span class="agent-name">{{ selectedAgent === 'pi' ? 'pi agent' : 'opencode' }}</span>
                    </button>
                    <div v-if="showAgentMenu" class="agent-popup" @click.stop>
                      <div class="agent-popup-header">切换 Agent</div>
                      <div class="agent-popup-list">
                        <div
                          class="agent-popup-item"
                          :class="{ active: selectedAgent === 'pi' }"
                          @click="selectAgent('pi')"
                        >
                          🤖 pi agent
                          <span v-if="selectedAgent === 'pi'" class="check-mark">✓</span>
                        </div>
                        <div
                          class="agent-popup-item"
                          :class="{ active: selectedAgent === 'opencode' }"
                          @click="selectAgent('opencode')"
                        >
                          🔧 opencode
                          <span v-if="selectedAgent === 'opencode'" class="check-mark">✓</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button class="toolbar-btn" @click="handleImageClick" title="上传图片">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </button>
                  <input ref="fileInputRef" type="file" accept="image/*" multiple style="display:none" @change="handleImageUpload" />
                </div>
                <div class="input-right">
                  <button class="send-btn" @click="sendMessage" :disabled="!inputText.trim() || isStreaming">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, onBeforeUnmount } from 'vue';
import { marked } from 'marked';

const API = window.electronAPI;

const inputText = ref('');
const messages = ref<any[]>([]);
const sessions = ref<any[]>([]);
const kbList = ref<any[]>([]);
const selectedAgent = ref('pi');
const isStreaming = ref(false);
const messagesContainer = ref<HTMLElement>();
const inputRef = ref<HTMLTextAreaElement>();
const fileInputRef = ref<HTMLInputElement | null>(null);
const currentSessionId = ref('');

const composing = ref(false);
const showMention = ref(false);
const showMentionPopup = ref(false);
const showAgentMenu = ref(false);
const showProjectPopup = ref(false);
const mentionIndex = ref(0);
const mentionQuery = ref('');
const mentionedKbs = ref<any[]>([]);
const projectList = ref<any[]>([]);
const selectedProject = ref<any>(null);
const thinkingContent = ref('');
const pendingImages = ref<{ data: string; mimeType: string }[]>([]);

const renderMarkdown = (content: string) => {
  if (!content) return '';
  try {
    return marked(content);
  } catch {
    return escHtml(content).replace(/\n/g, '<br>');
  }
};

const escHtml = (text: string) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const autoResize = () => {
  if (inputRef.value) {
    inputRef.value.style.height = 'auto';
    inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 120) + 'px';
  }
};

const formatDate = (d: string) => {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (date.toDateString() === now.toDateString()) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const loadSessions = async () => {
  try {
    sessions.value = (await API.chat.getSessions()) || [];
  } catch {
    sessions.value = [];
  }
};

const loadMessages = async (sessionId: string) => {
  try {
    const msgs = (await API.chat.getMessages(sessionId)) || [];
    messages.value = msgs.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));
  } catch {
    messages.value = [];
  }
  scrollToBottom();
};

const loadSession = async (id: string) => {
  currentSessionId.value = id;
  await loadMessages(id);
};

const newSession = async () => {
  const id = 'session_' + Date.now();
  currentSessionId.value = id;
  messages.value = [];
  mentionedKbs.value = [];
  selectedProject.value = null;
  thinkingContent.value = '';
  pendingImages.value = [];
  await API.chat.createSession(id, '新对话', 'general', 'ui');
  await loadSessions();
};

const deleteSession = async (id: string) => {
  await API.chat.deleteSession(id);
  if (currentSessionId.value === id) {
    currentSessionId.value = '';
    messages.value = [];
  }
  await loadSessions();
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

const mentionFiltered = computed(() => {
  const mentionedIds = new Set(mentionedKbs.value.map(k => k.id));
  const available = kbList.value.filter(k => !mentionedIds.has(k.id));
  if (!mentionQuery.value) return available;
  return available.filter(k => k.name.includes(mentionQuery.value));
});

function onInput() {
  autoResize();
  const cursor = inputRef.value?.selectionStart ?? 0;
  const textBefore = inputText.value.slice(0, cursor);
  const atMatch = textBefore.lastIndexOf('@');
  if (atMatch !== -1) {
    const afterAt = textBefore.slice(atMatch + 1);
    if (!afterAt.includes(' ') && afterAt.length < 20) {
      mentionQuery.value = afterAt;
      mentionIndex.value = 0;
      showMention.value = true;
      return;
    }
  }
  showMention.value = false;
}

function handleKeydown(e: KeyboardEvent) {
  if (composing.value) return;
  if (showMention.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mentionIndex.value = Math.min(mentionIndex.value + 1, mentionFiltered.value.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mentionIndex.value = Math.max(mentionIndex.value - 1, 0);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const kb = mentionFiltered.value[mentionIndex.value];
      if (kb) selectMention(kb);
    } else if (e.key === 'Escape') {
      showMention.value = false;
    }
  }
}

function selectMention(kb: any) {
  const cursor = inputRef.value?.selectionStart ?? 0;
  const textBefore = inputText.value.slice(0, cursor);
  const atPos = textBefore.lastIndexOf('@');
  inputText.value = inputText.value.slice(0, atPos) + inputText.value.slice(cursor);
  mentionedKbs.value = [kb];
  showMention.value = false;
  autoResize();
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus();
      inputRef.value.selectionStart = inputRef.value.selectionEnd = atPos;
    }
  });
}

function removeMention(kbId: string) {
  mentionedKbs.value = mentionedKbs.value.filter(k => k.id !== kbId);
}

function toggleAgentMenu() {
  showAgentMenu.value = !showAgentMenu.value;
  showMentionPopup.value = false;
}

function selectAgent(agent: string) {
  selectedAgent.value = agent;
  showAgentMenu.value = false;
}

function toggleMentionDropdown() {
  showMentionPopup.value = !showMentionPopup.value;
  showAgentMenu.value = false;
}

function toggleKbMention(kb: any) {
  mentionedKbs.value = [kb];
  showMentionPopup.value = false;
}

function handleImageUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  for (const file of input.files) {
    if (!file.type.startsWith('image/')) continue;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      pendingImages.value.push({ data: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }
  input.value = '';
}

function handleImageClick() {
  fileInputRef.value?.click();
}

function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        pendingImages.value.push({ data: base64, mimeType: file.type });
      };
      reader.readAsDataURL(file);
    }
  }
}

function removeImage(index: number) {
  pendingImages.value.splice(index, 1);
}

function toggleProjectPopup() {
  showProjectPopup.value = !showProjectPopup.value;
  showAgentMenu.value = false;
  showMentionPopup.value = false;
}

function selectProject(p: any) {
  selectedProject.value = p;
  showProjectPopup.value = false;
}

function clearProject() {
  selectedProject.value = null;
  showProjectPopup.value = false;
}

async function loadProjects() {
  try {
    projectList.value = await API.project.list();
  } catch {
    projectList.value = [];
  }
}

const sendMessage = async () => {
  const text = inputText.value.trim();
  const images = pendingImages.value.map(img => ({ data: img.data, mimeType: img.mimeType }));
  if (!text && !images.length) return;
  if (isStreaming.value) return;

  if (!currentSessionId.value) {
    currentSessionId.value = 'session_' + Date.now();
  }

  const kbContext = mentionedKbs.value.length > 0
    ? mentionedKbs.value.map(k => `@${k.name}`).join(' ') + ' '
    : '';
  const fullText = kbContext + text;

  const userMsg: any = {
    role: 'user',
    content: fullText,
  };
  if (images.length) {
    userMsg.images = images.map(img => ({ ...img }));
  }
  messages.value.push(userMsg);

  inputText.value = '';
  pendingImages.value = [];
  autoResize();

  const msgIdx = messages.value.length;
  messages.value.push({
    role: 'assistant',
    content: '',
    status: '准备中...',
  });

  isStreaming.value = true;
  scrollToBottom();

  const onDelta = (data: { sessionId: string; text: string }) => {
    if (data.sessionId !== currentSessionId.value) return;
    const msg = messages.value[msgIdx];
    msg.content += data.text;
    msg.status = '';
    scrollToBottom();
  };

  const onStatus = (data: { sessionId: string; text: string }) => {
    if (data.sessionId !== currentSessionId.value) return;
    const msg = messages.value[msgIdx];
    msg.status = data.text;
  };

  const onTool = (data: { sessionId: string; type: string; name: string; text?: string; error?: boolean }) => {
    if (data.sessionId !== currentSessionId.value) return;
    if (data.type === 'thinking') {
      thinkingContent.value = `💭 ${data.text || ''}`;
    } else if (data.type === 'start') {
      thinkingContent.value = `🔧 正在执行: ${data.name}`;
    } else if (data.type === 'end') {
      thinkingContent.value = `${data.error ? '❌' : '✅'} ${data.name} ${data.error ? '失败' : '完成'}`;
    }
    scrollToBottom();
  };

  const onDone = (data: { sessionId: string }) => {
    if (data.sessionId !== currentSessionId.value) return;
    isStreaming.value = false;
    const msg = messages.value[msgIdx];
    msg.status = '✓ 完成';
    thinkingContent.value = '';
    loadSessions();
    scrollToBottom();
  };

  const onError = (data: { sessionId: string; text: string }) => {
    if (data.sessionId !== currentSessionId.value) return;
    isStreaming.value = false;
    messages.value[msgIdx].content = '❌ ' + data.text;
    messages.value[msgIdx].status = '错误';
    scrollToBottom();
  };

  API.on('chat:delta', onDelta);
  API.on('chat:status', onStatus);
  API.on('chat:tool', onTool);
  API.on('chat:done', onDone);
  API.on('chat:error', onError);

  try {
    const kbIds = mentionedKbs.value.map(k => k.id);
    const projectDir = selectedProject.value?.dir || '';
    await API.chat.send(fullText, currentSessionId.value, projectDir, kbIds, images);
  } catch (err: any) {
    isStreaming.value = false;
    messages.value[msgIdx].content = '❌ ' + (err.message || '发送失败');
  }
};

const loadKbList = async () => {
  try {
    kbList.value = await API.kb.list();
  } catch {
    kbList.value = [];
  }
};

onMounted(async () => {
  await loadKbList();
  await loadProjects();
  await loadSessions();
  if (sessions.value.length > 0) {
    await loadSession(sessions.value[0].id);
  }
  document.addEventListener('click', closePopups);
});

onBeforeUnmount(() => {
  API.removeAllListeners('chat:delta');
  API.removeAllListeners('chat:status');
  API.removeAllListeners('chat:tool');
  API.removeAllListeners('chat:done');
  API.removeAllListeners('chat:error');
  document.removeEventListener('click', closePopups);
});

function closePopups() {
  showAgentMenu.value = false;
  showMentionPopup.value = false;
  showProjectPopup.value = false;
}
</script>

<style scoped>
.chat-view { display: flex; flex-direction: column; height: 100%; }
.chat-layout { display: flex; flex: 1; overflow: hidden; }
.session-sidebar { width: 240px; border-right: 1px solid var(--border); background: #fafafa; display: flex; flex-direction: column; flex-shrink: 0; }
.sidebar-header { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
.sidebar-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0; }
.session-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.session-item { padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.15s; }
.session-item:hover { background: #f0f0f0; }
.session-item.active { background: rgba(99,102,241,0.08); border-left: 3px solid #6366f1; }
.session-title { font-size: 13px; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.session-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
.session-date { font-size: 11px; color: #94a3b8; }
.session-delete { font-size: 14px; color: #94a3b8; cursor: pointer; visibility: hidden; width: 16px; text-align: center; border-radius: 4px; line-height: 1; }
.session-item:hover .session-delete { visibility: visible; }
.session-delete:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
.sidebar-empty { padding: 20px; text-align: center; font-size: 13px; color: #94a3b8; }
.source-badge { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-right: 4px; flex-shrink: 0; }
.source-badge.feishu { background: #3370ff; color: white; }
.source-badge.ui { background: #e2e8f0; color: #64748b; }
.chat-main { flex: 1; display: flex; background: #f5f5f5; overflow: hidden; }
.content-header { padding: 12px 24px; border-bottom: 1px solid var(--border); display: none; align-items: center; justify-content: space-between; flex-shrink: 0; background: white; }
.content-title { font-size: 18px; font-weight: 600; color: var(--text-primary); }
.content-actions { display: flex; align-items: center; gap: 8px; }
.content-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; background: #f5f5f5; }
.chat-wrapper { width: 100%; display: flex; flex-direction: column; background: white; border-radius: var(--radius-lg); box-shadow: var(--shadow-md); overflow: hidden; }
.chat-messages { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; background: #ffffff; }
.message { display: flex; gap: 12px; max-width: 100%; animation: fadeIn 0.2s ease-out; margin-bottom: 8px; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.message.user { flex-direction: row-reverse; }
.message-avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }
.message.user .message-avatar { background: #5c5c5c; color: white; }
.message.assistant .message-avatar { background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white; }
.message.tool .message-avatar { background: #f59e0b; color: white; }
.message-content-wrapper { display: flex; flex-direction: column; gap: 6px; max-width: 75%; }
.message-header { display: flex; align-items: center; gap: 8px; }
.message-author { font-size: 13px; font-weight: 500; }
.message.user .message-author { color: #64748b; }
.message.assistant .message-author { color: #6366f1; }
.message.tool .message-author { color: #f59e0b; }
.message-status { font-size: 11px; color: #94a3b8; }
.message-content { padding: 14px 18px; border-radius: 16px; line-height: 1.7; font-size: 14px; word-wrap: break-word; }
.message.user .message-content { background: #f1f5f9; color: #1e293b; }
.message.assistant .message-content { background: #ffffff; color: #1e293b; border: 1px solid #e2e8f0; }
.message.tool .message-content { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; font-size: 13px; padding: 8px 14px; }
.thinking-status { font-size: 13px; color: #6366f1; padding: 6px 10px; margin-bottom: 8px; background: #eef2ff; border-radius: 8px; border: 1px solid #a5b4fc; display: flex; align-items: center; gap: 6px; }
.empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px 20px; color: #94a3b8; }
.empty-icon { font-size: 64px; margin-bottom: 16px; opacity: 0.3; }
.empty-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #1e293b; }
.empty-desc { font-size: 14px; line-height: 1.6; color: #64748b; }
.empty-desc code { background: rgba(99,102,241,0.1); color: var(--primary); padding: 1px 6px; border-radius: 4px; font-size: 13px; }
.chat-input-area { padding: 12px 20px; border-top: 1px solid #e2e8f0; background: #f8fafc; flex-shrink: 0; }
.input-wrapper { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; transition: border-color 0.2s; }
.input-wrapper:focus-within { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.1); }
.textarea-wrapper { position: relative; }
.chat-input { width: 100%; padding: 12px 16px; border: none; background: transparent; font-size: 14px; outline: none; resize: none; min-height: 40px; max-height: 120px; line-height: 1.5; font-family: inherit; }
.chat-input:disabled { opacity: 0.6; cursor: not-allowed; }
.chat-input::placeholder { color: #94a3b8; }
.mention-chips-inline { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 16px 0 16px; }
.mention-dropdown { position: absolute; bottom: 100%; left: 16px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); max-height: 200px; overflow-y: auto; min-width: 200px; z-index: 100; }
.mention-item { padding: 8px 14px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.mention-item:hover, .mention-item.active { background: rgba(99,102,241,0.08); color: var(--primary); }
.mention-item.disabled { color: #94a3b8; cursor: default; }
.input-footer { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px 8px 12px; }
.input-left { display: flex; align-items: center; gap: 4px; flex: 1; }
.input-right { display: flex; align-items: center; gap: 4px; }
.toolbar-btn-wrapper { position: relative; display: flex; align-items: center; }
.toolbar-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 6px; background: transparent; color: #64748b; cursor: pointer; transition: all 0.2s; }
.toolbar-btn:hover { background: #f1f5f9; color: #6366f1; }
.toolbar-btn.active { color: #6366f1; }
.toolbar-btn-agent { width: auto; padding: 0 8px; gap: 4px; font-size: 12px; }
.image-preview-bar { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 12px; border-top: 1px solid #f1f5f9; }
.image-preview-item { position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; flex-shrink: 0; }
.image-preview-thumb { width: 100%; height: 100%; object-fit: cover; }
.image-preview-remove { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(0,0,0,0.5); color: white; font-size: 12px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.image-preview-remove:hover { background: rgba(239,68,68,0.8); }
.message-images { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.chat-image { max-width: 300px; max-height: 300px; border-radius: 8px; border: 1px solid #e2e8f0; object-fit: contain; }
.agent-popup { position: absolute; bottom: 100%; left: 0; margin-bottom: 4px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); min-width: 180px; z-index: 200; overflow: hidden; }
.agent-popup-header { padding: 8px 12px; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #f1f5f9; }
.agent-popup-list { max-height: 200px; overflow-y: auto; }
.agent-popup-item { padding: 8px 12px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 8px; transition: background 0.15s; }
.agent-popup-item:hover { background: rgba(99,102,241,0.06); }
.agent-popup-item.active { color: #6366f1; background: rgba(99,102,241,0.06); }
.agent-popup-item.disabled { color: #94a3b8; cursor: default; }
.check-mark { margin-left: auto; color: #6366f1; font-weight: 600; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: rgba(99,102,241,0.1); color: var(--primary); border-radius: 12px; font-size: 12px; }
.chip-project { background: rgba(245,158,11,0.12); color: #b45309; }
.chip-remove { cursor: pointer; font-weight: 700; font-size: 14px; line-height: 1; margin-left: 2px; }
.chip-remove:hover { color: #ef4444; }
.send-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 12px; cursor: pointer; background: #6366f1; color: white; transition: all 0.2s; border: none; flex-shrink: 0; }
.send-btn:hover { background: #4f46e5; }
.send-btn:disabled { background: #cbd5e1; cursor: not-allowed; }
.markdown-body { white-space: pre-wrap; word-break: break-word; }
.markdown-body p { margin-bottom: 8px; }
.markdown-body ul, .markdown-body ol { padding-left: 20px; margin-bottom: 8px; }
.markdown-body li { margin-bottom: 4px; }
.markdown-body code { background: rgba(0,0,0,0.04); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; }
.markdown-body pre { background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 8px; overflow-x: auto; margin-bottom: 8px; font-family: monospace; font-size: 13px; }
.markdown-body blockquote { border-left: 3px solid #6366f1; padding-left: 10px; color: #64748b; margin-bottom: 8px; }
.markdown-body strong { font-weight: 600; }
.markdown-body a { color: #6366f1; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
</style>
