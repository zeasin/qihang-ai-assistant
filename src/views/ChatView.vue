<template>
  <div class="chat-view">
    <div class="content-header">
      <h1 class="content-title">对话</h1>
      <div class="content-actions">
        <button class="btn btn-secondary btn-sm" @click="clearChat">清空</button>
      </div>
    </div>
    
    <div class="content-body">
      <div class="chat-wrapper">
        <div class="chat-messages" ref="messagesContainer">
          <div v-if="!hasKb" class="empty-state">
            <div class="empty-icon">💬</div>
            <div class="empty-title">开始对话</div>
            <div class="empty-desc">你还没有添加任何笔记库。<br>可以直接与 AI 对话，或添加笔记库后使用 @笔记库名 进行知识库问答。</div>
            <button class="empty-action" @click="goToConfig">去配置笔记库</button>
          </div>
          
          <div v-else id="messagesList">
            <div v-for="msg in messages" :key="msg.id" class="message" :class="msg.role">
              <div class="message-avatar">
                <span v-if="msg.role === 'user'">👤</span>
                <span v-else>🤖</span>
              </div>
              <div class="message-content-wrapper">
                <div class="message-header">
                  <span class="message-author">{{ msg.role === 'user' ? '我' : '笔灵 AI' }}</span>
                  <span v-if="msg.time" class="message-time">{{ msg.time }}</span>
                </div>
                <div
                  class="message-content"
                  :class="{ 'markdown-content': msg.role === 'assistant' }"
                  v-html="msg.role === 'user' ? highlightMentions(msg.content) : renderMarkdown(msg.content)"
                ></div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="chat-input-area">
          <div class="input-wrapper">
            <textarea 
              v-model="inputText" 
              class="chat-input" 
              placeholder="有问题尽管问"
              @keydown.enter.exact.prevent="sendChat"
              @input="autoResize"
              ref="inputRef"
            ></textarea>
            
            <div class="input-footer">
              <div class="input-left">
                <button class="footer-btn" ref="mentionBtnRef" @click="toggleMentionDropdown">
                  <span>@</span>
                </button>
                <div class="divider"></div>
                <button class="footer-btn" ref="modelBtnRef" @click="toggleModelDropdown">
                  <span>{{ currentModel || '默认模型' }}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
              </div>
              <div class="input-right">
                <button class="send-btn" @click="sendChat" :disabled="!inputText.trim()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          <div v-show="showMentionDropdown" class="dropdown-menu" ref="mentionDropdown">
            <div 
              v-for="kb in kbList" 
              :key="kb.id" 
              class="dropdown-item"
              @click="insertMention(kb.name)"
            >
              <div class="dropdown-item-icon">📚</div>
              <span>{{ kb.name }}</span>
            </div>
          </div>
          
          <div v-show="showModelDropdown" class="dropdown-menu" ref="modelDropdown">
            <div 
              v-for="model in chatModels" 
              :key="model.name" 
              class="dropdown-item"
              :class="{ selected: model.name === currentModel }"
              @click="selectModel(model.name)"
            >
              <span>{{ model.name }}</span>
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

const API_BASE = '';

const inputText = ref('');
const messages = ref<any[]>([]);
const kbList = ref<any[]>([]);
const chatModels = ref<any[]>([]);
const currentModel = ref('');
const currentKbId = ref<number | null>(null);
const hasKb = ref(true);
const showMentionDropdown = ref(false);
const showModelDropdown = ref(false);
const messagesContainer = ref<HTMLElement>();
const inputRef = ref<HTMLTextAreaElement>();
const mentionBtnRef = ref<HTMLElement>();
const modelBtnRef = ref<HTMLElement>();
const mentionDropdown = ref<HTMLElement>();
const modelDropdown = ref<HTMLElement>();

// ========== Markdown 渲染 ==========
const renderMarkdown = (content: string) => {
  if (!content) return '';
  try {
    return marked(content);
  } catch (e) {
    return content.replace(/\n/g, '<br>');
  }
};

const highlightMentions = (text: string) => {
  return text.replace(/@(\S+)/g, '<span class="mention-tag">@$1</span>');
};

// ========== 加载对话列表 ==========
async function loadMessages() {
  if (!currentKbId.value) return;
  try {
    const r = await fetch(`${API_BASE}/api/chat/messages?kbId=${currentKbId.value}`);
    const d = await r.json();
    if (d.ok && d.messages) {
      messages.value = d.messages.map((msg: any, i: number) => ({
        id: msg.id || i,
        role: msg.role,
        content: msg.content,
        time: msg.time || ''
      }));
      await nextTick();
      scrollToBottom();
    }
  } catch (e) {
    console.error('加载对话失败:', e);
  }
}

// ========== 加载笔记库列表 ==========
async function loadKbList() {
  try {
    const r = await fetch(`${API_BASE}/api/chat/kbs`);

    const d = await r.json();
    if (d.ok && d.data) {
      kbList.value = d.data;
      hasKb.value = d.data.length > 0;
      if (d.data.length > 0) {
        currentKbId.value = d.data[0].id;
        await loadMessages();
      } else {
        hasKb.value = false;
      }
    } else {
      hasKb.value = false;
    }
  } catch (e) {
    console.error('加载笔记库失败:', e);
    hasKb.value = false;
  }
}

// ========== 加载模型列表 ==========
async function loadModels() {
  try {
    const r = await fetch(`/api/chat/models`);
    const d = await r.json();
    if (d.ok && d.data) {
      // 过滤掉 image 类型，只保留对话/多模态模型
      const textModels = d.data.filter((p: any) => p.modelType !== 'image');
      chatModels.value = textModels;
      if (d.defaultModel) {
        currentModel.value = d.defaultModel;
      } else if (textModels.length > 0) {
        currentModel.value = textModels[0].name;
      }
    }
  } catch (e) {
    chatModels.value = [{ name: '默认模型' }];
    currentModel.value = '默认模型';
  }
}

// ========== 清空对话 ==========
const clearChat = async () => {
  if (!currentKbId.value) {
    alert('请先选择一个笔记库');
    return;
  }
  try {
    const r = await fetch(`${API_BASE}/api/chat/clear?kbId=${currentKbId.value}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) {
      messages.value = [];
    }
  } catch (e) {
    console.error('清空对话失败:', e);
  }
};

const goToConfig = () => {
  // TODO: 路由到配置页（待添加）
  console.log('导航到配置页面');
};

const autoResize = () => {
  if (inputRef.value) {
    inputRef.value.style.height = 'auto';
    inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 120) + 'px';
  }
};

// ========== 下拉菜单 ==========
const toggleMentionDropdown = () => {
  if (showMentionDropdown.value) {
    showMentionDropdown.value = false;
    return;
  }
  showMentionDropdown.value = true;
  showModelDropdown.value = false;
  // 定位到按钮上方
  nextTick(() => {
    const btn = mentionBtnRef.value;
    const menu = mentionDropdown.value;
    if (btn && menu) {
      const rect = btn.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top = (rect.top - menu.offsetHeight - 4) + 'px';
    }
  });
};

const toggleModelDropdown = () => {
  if (showModelDropdown.value) {
    showModelDropdown.value = false;
    return;
  }
  showModelDropdown.value = true;
  showMentionDropdown.value = false;
  // 定位到按钮上方
  nextTick(() => {
    const btn = modelBtnRef.value;
    const menu = modelDropdown.value;
    if (btn && menu) {
      const rect = btn.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top = (rect.top - menu.offsetHeight - 4) + 'px';
    }
  });
};

const insertMention = (name: string) => {
  inputText.value += `@${name} `;
  showMentionDropdown.value = false;
  inputRef.value?.focus();
};

const selectModel = (modelName: string) => {
  currentModel.value = modelName;
  showModelDropdown.value = false;
};

// ========== 发送消息（SSE流式） ==========
const isSending = ref(false);
const sendChat = async () => {
  const text = inputText.value.trim();
  if (!text || isSending.value) return;
  isSending.value = true;

  messages.value.push({
    id: Date.now(),
    role: 'user',
    content: text,
    time: formatTime(new Date())
  });

  inputText.value = '';
  autoResize();
  await nextTick();
  scrollToBottom();

  // 添加打字指示器
  addTypingIndicator();

  // 解析 @提及
  const mentionedKb = parseMentionedKb(text);
  const sendKbId = mentionedKb !== null ? mentionedKb : currentKbId.value;

  try {
    const formData = new FormData();
    formData.append('message', text);
    if (sendKbId) formData.append('kbId', String(sendKbId));
    formData.append('modelName', currentModel.value);

    const response = await fetch(`${API_BASE}/api/chat/send`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error('Network response was not ok');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let replyContent = '';
    let replyDiv: HTMLElement | null = null;

    function readChunk() {
      reader.read().then((result: any) => {
        if (result.done) {
          isSending.value = false;
          removeTypingIndicator();
          scrollToBottom();
          return;
        }

        const chunk = decoder.decode(result.value, { stream: true });
        const lines = chunk.split('\n');

        lines.forEach((line: string) => {
          if (!line.trim()) return;
          if (line.startsWith('data:')) {
            line = line.substring(5).trim();
          }

          try {
            const data = JSON.parse(line);

            if (data.type === 'text') {
              removeTypingIndicator();
              if (!replyDiv) {
                replyDiv = document.createElement('div');
                replyDiv.className = 'message assistant';
                replyDiv.innerHTML = `
                  <div class="message-avatar">AI</div>
                  <div class="message-content-wrapper">
                    <div class="message-header">
                      <span class="message-author">AI</span>
                    </div>
                    <div class="message-content markdown-content"></div>
                  </div>
                `;
                messagesContainer.value?.querySelector('.empty-state')?.remove();
                const listEl = messagesContainer.value?.querySelector('#messagesList') || messagesContainer.value;
                listEl?.appendChild(replyDiv);
              }
              replyContent += data.content;
              const contentEl = replyDiv!.querySelector('.message-content') as HTMLElement;
              if (contentEl) {
                contentEl.innerHTML = String(renderMarkdown(replyContent));
              }
              scrollToBottom();
            } else if (data.type === 'status') {
              updateStatusInReply(data.content);
            } else if (data.type === 'done') {
              isSending.value = false;
              scrollToBottom();
            } else if (data.type === 'error') {
              removeTypingIndicator();
              addMessage('assistant', '❌ ' + data.content);
              isSending.value = false;
            }
          } catch (err) {
            console.warn('Parse error:', err, line);
          }
        });

        readChunk();
      }).catch((err: Error) => {
        console.error('Read error:', err);
        isSending.value = false;
        removeTypingIndicator();
      });
    }

    readChunk();
  } catch (err: any) {
    console.error('Fetch error:', err);
    isSending.value = false;
    removeTypingIndicator();
    addMessage('assistant', '❌ 发送失败: ' + err.message);
  }
};

// ========== 辅助方法 ==========
function addMessage(role: string, content: string) {
  const div = document.createElement('div');
  div.className = 'message ' + role;
  const avatar = role === 'user' ? 'U' : 'AI';
  const author = role === 'user' ? '你' : 'AI';
  const displayContent = role === 'assistant' ? renderMarkdown(content) : content;
  div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content-wrapper">
      <div class="message-header">
        <span class="message-author">${author}</span>
      </div>
      <div class="message-content ${role === 'assistant' ? 'markdown-content' : ''}">${displayContent}</div>
    </div>
  `;
  const listEl = messagesContainer.value?.querySelector('.empty-state')?.parentElement || messagesContainer.value;
  listEl?.appendChild(div);
  scrollToBottom();
}

function addTypingIndicator() {
  const container = messagesContainer.value;
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="message-avatar">AI</div>
    <div class="message-content-wrapper">
      <div class="message-header">
        <span class="message-author">AI</span>
      </div>
      <div class="message-content">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function updateStatusInReply(text: string) {
  const typingIndicator = document.getElementById('typingIndicator');
  if (typingIndicator) {
    const contentWrapper = typingIndicator.querySelector('.message-content-wrapper');
    if (contentWrapper) {
      let statusArea = contentWrapper.querySelector('.status-area') as HTMLElement;
      if (statusArea) {
        statusArea.textContent = text;
      } else {
        statusArea = document.createElement('div');
        statusArea.className = 'status-area';
        statusArea.textContent = text;
        const messageContent = contentWrapper.querySelector('.message-content');
        if (messageContent) {
          contentWrapper.insertBefore(statusArea, messageContent);
        }
      }
    }
  }
}

function parseMentionedKb(message: string): number | null {
  const match = message.match(/@(\S+)/);
  if (match) {
    const kbName = match[1];
    for (const kb of kbList.value) {
      if (kb.name === kbName || kb.name.includes(kbName)) {
        return kb.id;
      }
    }
  }
  return null;
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return (date.getMonth() + 1) + '月' + date.getDate() + '日 ' +
    date.getHours().toString().padStart(2, '0') + ':' +
    date.getMinutes().toString().padStart(2, '0');
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

// ========== 点击外部关闭下拉 ==========
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const isFooterBtn = target.classList.contains('footer-btn') || target.closest('.footer-btn');
  const isMentionDropdown = target.closest('#mentionDropdown');
  const isModelDropdown = target.closest('#modelDropdown');
  if (!isFooterBtn && !isMentionDropdown) showMentionDropdown.value = false;
  if (!isFooterBtn && !isModelDropdown) showModelDropdown.value = false;
}

onMounted(async () => {
  document.addEventListener('click', handleClickOutside);
  await Promise.all([loadKbList(), loadModels()]);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.chat-view {
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

.message.user .message-author {
  color: #64748b;
}

.message.assistant .message-author {
  color: #6366f1;
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

.message-time {
  font-size: 11px;
  color: #94a3b8;
}

.message.user .message-time {
  text-align: right;
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

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1e293b;
}

.empty-desc {
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
}

.empty-action {
  margin-top: 20px;
  padding: 8px 20px;
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  cursor: pointer;
}

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

.chat-input::placeholder {
  color: #94a3b8;
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid #f1f5f9;
}

.input-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.footer-btn {
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: #64748b;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.footer-btn:hover {
  background: #f1f5f9;
  color: #1e293b;
}

.footer-btn.active {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
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

.send-btn:hover {
  background: #4f46e5;
}

.send-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

.divider {
  width: 1px;
  height: 16px;
  background: #e2e8f0;
}

.dropdown-menu {
  position: fixed;
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 8px;
  width: 200px;
  max-height: 250px;
  overflow-y: auto;
  z-index: 9999;
}

.dropdown-item {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dropdown-item:hover {
  background: var(--hover);
}

.dropdown-item.selected {
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
}

.dropdown-item-icon {
  width: 24px;
  height: 24px;
  background: rgba(99, 102, 241, 0.1);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  font-size: 12px;
}

.status-area {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
  border-radius: 12px;
  font-size: 12px;
  margin-bottom: 8px;
  border: 1px solid rgba(99, 102, 241, 0.15);
  width: fit-content;
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 14px 18px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
}

.typing-dot {
  width: 6px;
  height: 6px;
  background: #94a3b8;
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out both;
}

.typing-dot:nth-child(1) {
  animation-delay: -0.32s;
}

.typing-dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes typing {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.markdown-content {
  white-space: pre-wrap;
  word-break: break-word;
}

.markdown-content p {
  margin-bottom: 8px;
}

.markdown-content ul, .markdown-content ol {
  padding-left: 20px;
  margin-bottom: 8px;
}

.markdown-content li {
  margin-bottom: 4px;
}

.markdown-content code {
  background: rgba(0,0,0,0.04);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}

.markdown-content pre {
  background: #1e293b;
  color: #e2e8f0;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 8px;
  font-family: monospace;
  font-size: 13px;
}

.markdown-content blockquote {
  border-left: 3px solid #6366f1;
  padding-left: 10px;
  color: #64748b;
  margin-bottom: 8px;
}

.markdown-content strong {
  font-weight: 600;
}

.markdown-content a {
  color: #6366f1;
  text-decoration: none;
}

.markdown-content a:hover {
  text-decoration: underline;
}

.mention-tag {
  display: inline-block;
  padding: 1px 6px;
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  font-size: 12px;
  border-radius: 4px;
  margin-right: 4px;
}
</style>
