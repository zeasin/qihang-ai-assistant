<template>
  <div class="chat-view">
    <div class="content-header">
      <h1 class="content-title">对话</h1>
      <div class="content-actions">
        <select v-model="selectedAgent" class="agent-select">
          <option value="pi">pi agent</option>
          <option value="opencode">opencode</option>
        </select>
        <select v-model="selectedKbId" class="kb-select">
          <option :value="null">不使用知识库</option>
          <option v-for="kb in kbList" :key="kb.id" :value="kb.id">
            {{ kb.name }}{{ kb.status?.indexed ? ' ✓' : '' }}
          </option>
        </select>
        <button class="btn btn-secondary btn-sm" @click="newSession">新对话</button>
      </div>
    </div>

    <div class="content-body">
      <div class="chat-wrapper">
        <div class="chat-messages" ref="messagesContainer">
          <div v-if="!messages.length" class="empty-state">
            <div class="empty-icon">💬</div>
            <div class="empty-title">开始对话</div>
            <div class="empty-desc">
              选择 agent 和知识库，然后开始提问。<br>
              pi agent 适合代码分析，opencode 适合通用任务。
            </div>
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
                v-html="msg.role === 'user' ? escHtml(msg.content) : renderMarkdown(msg.content)"
              ></div>
            </div>
          </div>
        </div>

        <div class="chat-input-area">
          <div class="input-wrapper">
            <textarea
              v-model="inputText"
              class="chat-input"
              placeholder="输入问题，按 Enter 发送..."
              @keydown.enter.exact.prevent="sendMessage"
              @input="autoResize"
              ref="inputRef"
              :disabled="isStreaming"
            ></textarea>
            <div class="input-footer">
              <div class="input-left">
                <span class="input-hint" v-if="selectedKbId">
                  📚 知识库已启用
                </span>
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
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue';
import { marked } from 'marked';

const API = window.electronAPI;

const inputText = ref('');
const messages = ref<any[]>([]);
const kbList = ref<any[]>([]);
const selectedAgent = ref('pi');
const selectedKbId = ref<string | null>(null);
const isStreaming = ref(false);
const messagesContainer = ref<HTMLElement>();
const inputRef = ref<HTMLTextAreaElement>();
const currentSessionId = ref('');

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

const newSession = () => {
  messages.value = [];
  currentSessionId.value = 'session_' + Date.now();
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
};

const sendMessage = async () => {
  const text = inputText.value.trim();
  if (!text || isStreaming.value) return;

  const sessionId = currentSessionId.value || 'session_' + Date.now();
  currentSessionId.value = sessionId;

  messages.value.push({
    role: 'user',
    content: text,
  });

  inputText.value = '';
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
    if (data.sessionId !== sessionId) return;
    const msg = messages.value[msgIdx];
    msg.content += data.text;
    msg.status = '';
    scrollToBottom();
  };

  const onStatus = (data: { sessionId: string; text: string }) => {
    if (data.sessionId !== sessionId) return;
    const msg = messages.value[msgIdx];
    msg.status = data.text;
  };

  const onTool = (data: { sessionId: string; type: string; name: string }) => {
    if (data.sessionId !== sessionId) return;
    if (data.type === 'start') {
      messages.value.push({ role: 'tool', content: `🔧 正在执行: ${data.name}` });
    }
    scrollToBottom();
  };

  const onDone = (data: { sessionId: string }) => {
    if (data.sessionId !== sessionId) return;
    isStreaming.value = false;
    const msg = messages.value[msgIdx];
    msg.status = '✓ 完成';
    scrollToBottom();
  };

  const onError = (data: { sessionId: string; text: string }) => {
    if (data.sessionId !== sessionId) return;
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
    await API.chat.send(text, selectedAgent.value, selectedKbId.value, '');
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
  newSession();
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
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.content-header {
  padding: 12px 24px;
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

.content-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-select, .kb-select {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  outline: none;
}

.agent-select:focus, .kb-select:focus {
  border-color: var(--primary);
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  background: #f5f5f5;
}

.chat-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #ffffff;
}

.message {
  display: flex;
  gap: 12px;
  max-width: 100%;
  animation: fadeIn 0.2s ease-out;
  margin-bottom: 8px;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}

.message.user .message-avatar {
  background: #5c5c5c;
  color: white;
}

.message.assistant .message-avatar {
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: white;
}

.message.tool .message-avatar {
  background: #f59e0b;
  color: white;
}

.message-content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 75%;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message-author {
  font-size: 13px;
  font-weight: 500;
}

.message.user .message-author { color: #64748b; }
.message.assistant .message-author { color: #6366f1; }
.message.tool .message-author { color: #f59e0b; }

.message-status {
  font-size: 11px;
  color: #94a3b8;
}

.message-content {
  padding: 14px 18px;
  border-radius: 16px;
  line-height: 1.7;
  font-size: 14px;
  word-wrap: break-word;
}

.message.user .message-content {
  background: #f1f5f9;
  color: #1e293b;
}

.message.assistant .message-content {
  background: #ffffff;
  color: #1e293b;
  border: 1px solid #e2e8f0;
}

.message.tool .message-content {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
  font-size: 13px;
  padding: 8px 14px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
  color: #94a3b8;
}

.empty-icon { font-size: 64px; margin-bottom: 16px; opacity: 0.3; }
.empty-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #1e293b; }
.empty-desc { font-size: 14px; line-height: 1.6; color: #64748b; }

.chat-input-area {
  padding: 12px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
}

.input-wrapper {
  background: white;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.chat-input {
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  font-size: 14px;
  outline: none;
  resize: none;
  min-height: 40px;
  max-height: 120px;
  line-height: 1.5;
}

.chat-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-input::placeholder { color: #94a3b8; }

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid #f1f5f9;
}

.input-left { display: flex; align-items: center; gap: 8px; }
.input-right { display: flex; align-items: center; gap: 4px; }

.input-hint {
  font-size: 12px;
  color: var(--primary);
  padding: 4px 10px;
  background: rgba(99, 102, 241, 0.08);
  border-radius: 10px;
}

.send-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  cursor: pointer;
  background: #6366f1;
  color: white;
  transition: all 0.2s;
  border: none;
}

.send-btn:hover { background: #4f46e5; }
.send-btn:disabled { background: #cbd5e1; cursor: not-allowed; }

.markdown-body {
  white-space: pre-wrap;
  word-break: break-word;
}

.markdown-body p { margin-bottom: 8px; }
.markdown-body ul, .markdown-body ol { padding-left: 20px; margin-bottom: 8px; }
.markdown-body li { margin-bottom: 4px; }
.markdown-body code {
  background: rgba(0,0,0,0.04);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}
.markdown-body pre {
  background: #1e293b;
  color: #e2e8f0;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 8px;
  font-family: monospace;
  font-size: 13px;
}
.markdown-body blockquote {
  border-left: 3px solid #6366f1;
  padding-left: 10px;
  color: #64748b;
  margin-bottom: 8px;
}
.markdown-body strong { font-weight: 600; }
.markdown-body a { color: #6366f1; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
</style>