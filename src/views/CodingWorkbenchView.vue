<template>
  <div class="coding-workbench">
    <!-- ========== 左栏：项目树 + 对话列表 ========== -->
    <div class="workbench-sidebar">
      <div class="sidebar-header">
        <h3 class="sidebar-title">代码工作台</h3>
        <button class="btn btn-sm btn-secondary" @click="openAddProject">+ 项目</button>
      </div>

      <div class="project-tree" v-if="projects.length">
        <div
          v-for="project in projects"
          :key="project.id"
          class="project-node"
        >
          <div
            class="project-header"
            @click="toggleProject(project.id)"
            :class="{ expanded: expandedProjects.has(project.id) }"
          >
            <span class="project-arrow">{{ expandedProjects.has(project.id) ? '▼' : '▶' }}</span>
            <span class="project-icon">📁</span>
            <span class="project-name">{{ project.name }}</span>
            <span class="project-badge" v-if="project.dir">{{ project.dir.split('/').pop() || project.dir.split('\\').pop() }}</span>
            <span class="project-actions">
              <span class="project-edit-btn" @click.stop="openEditProject(project)" title="编辑项目">✏️</span>
              <span class="project-delete-btn" @click.stop="deleteProject(project)" title="删除项目">🗑️</span>
            </span>
          </div>

          <div v-if="expandedProjects.has(project.id)" class="conversation-list">
            <div
              v-for="session in projectSessions[project.id] || []"
              :key="session.id"
              class="conversation-item"
              :class="{ active: currentSessionId === session.id }"
              @click="selectSession(session)"
            >
              <span class="conv-icon">🗨️</span>
              <span class="conv-title">{{ session.title || '新对话' }}</span>
              <span class="conv-agent-badge" :class="session.active_agent">
                {{ agentLabel(session.active_agent) }}
              </span>
              <span class="conv-delete" @click.stop="deleteSession(session.id)" title="删除">×</span>
            </div>
            <div class="conversation-item new-conversation" @click="newSession(project.id)">
              <span class="conv-icon">➕</span>
              <span class="conv-title new">新对话</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="sidebar-empty">
        <div class="empty-icon">📁</div>
        <div class="empty-text">还没有项目，创建一个开始吧</div>
        <button class="btn btn-primary btn-sm" @click="openAddProject">新建项目</button>
      </div>
    </div>

    <!-- ========== 右栏：对话区 ========== -->
    <div class="workbench-main">
      <!-- 无对话时 -->
      <div v-if="!currentSessionId" class="workbench-empty">
        <div class="empty-icon">💻</div>
        <div class="empty-title">代码工作台</div>
        <div class="empty-desc">
          从左侧选择一个项目下的对话，或新建一个对话开始编程<br>
          支持 <strong>pi agent</strong> · <strong>opencode</strong> · <strong>Claude Code</strong> 三种 Agent
        </div>
      </div>

      <!-- 有对话时 -->
      <template v-else>
        <!-- 对话头部 -->
        <div class="chat-header">
          <div class="chat-header-left">
            <h3 class="chat-title">{{ currentSession?.title || '对话' }}</h3>
            <span class="chat-project-badge" v-if="currentProject">📁 {{ currentProject.name }}</span>
          </div>
          <div class="chat-header-right">
            <div class="agent-switcher">
              <span class="agent-label">Agent:</span>
              <div class="agent-select-wrapper">
                <select
                  v-model="activeAgent"
                  @change="onAgentSwitch"
                  class="agent-select"
                >
                  <option value="pi">🤖 pi agent</option>
                  <option value="opencode">🔧 opencode</option>
                  <option value="claude">🌿 Claude Code</option>
                </select>
                <span class="agent-status-dot" :class="agentReady ? 'ready' : 'checking'"></span>
              </div>
            </div>
          </div>
        </div>

        <!-- 消息列表 -->
        <div class="chat-messages" ref="messagesContainer">
          <div v-for="(msg, idx) in messages" :key="idx" class="message" :class="msg.role">
            <div class="message-avatar">
              <span v-if="msg.role === 'user'">👤</span>
              <span v-else-if="msg.role === 'tool'">🔧</span>
              <span v-else>🤖</span>
            </div>
            <div class="message-content-wrapper">
              <div class="message-header">
                <span class="message-author">
                  {{ msg.role === 'user' ? '我' : msg.role === 'tool' ? '工具' : agentLabel(msg.mode || currentSession?.active_agent) }}
                </span>
                <span class="message-status" v-if="msg.status">{{ msg.status }}</span>
              </div>
              <div
                class="message-content"
                :class="{ 'markdown-body': msg.role === 'assistant' }"
              >
                <div v-if="thinkingText && idx === messages.length - 1" class="thinking-status">{{ thinkingText }}</div>
                <div v-if="msg.images?.length" class="message-images">
                    <img v-for="(img, i) in msg.images" :key="i" :src="`data:${img.mimeType};base64,${img.data}`" class="chat-image" />
                  </div>
                <div v-html="msg.role === 'user' ? escHtml(msg.content) : renderMarkdown(msg.content)"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 输入区 -->
        <div class="chat-input-area">
          <div class="input-wrapper">
            <textarea
              v-model="inputText"
              class="chat-input"
              :placeholder="`输入代码问题，Enter 发送... (当前: ${agentLabel(activeAgent)})`"
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
                <span class="input-hint">Enter 发送 · Shift+Enter 换行</span>
              </div>
              <div class="input-right">
                <button
                  class="send-btn"
                  :disabled="!inputText.trim() || isStreaming"
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

    <!-- ========== 新建/编辑项目弹窗 ========== -->
    <div v-if="showProjectModal" class="modal-overlay" @click.self="closeProjectModal">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <h3>{{ editingProject ? '编辑项目' : '新建项目' }}</h3>
          <button class="modal-close" @click="closeProjectModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>项目名称 *</label>
            <input v-model="projectForm.name" class="form-control" placeholder="例如: CRM系统">
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea v-model="projectForm.description" class="form-control" rows="2" placeholder="项目描述"></textarea>
          </div>
          <div class="form-group">
            <label>代码目录</label>
            <div class="input-with-btn">
              <input v-model="projectForm.dir" class="form-control" placeholder="选择目录..." readonly>
              <button class="btn btn-secondary" @click="pickFolder">选择</button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeProjectModal">取消</button>
          <button class="btn btn-primary" :disabled="!projectForm.name.trim()" @click="saveProject">
            {{ editingProject ? '保存' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick, onBeforeUnmount } from 'vue';
import { marked } from 'marked';

const API = window.electronAPI;

// ========== 状态 ==========
const projects = ref<any[]>([]);
const expandedProjects = reactive(new Set<number>());
const projectSessions = reactive<Record<number, any[]>>({});
const currentSessionId = ref('');
const currentSession = ref<any>(null);
const messages = ref<any[]>([]);
const inputText = ref('');
const isStreaming = ref(false);
const composing = ref(false);
const activeAgent = ref('pi');
const agentReady = ref(false);
const thinkingText = ref('');
const inputRef = ref<HTMLTextAreaElement>();
const messagesContainer = ref<HTMLElement>();
const pendingImages = ref<{ data: string; mimeType: string }[]>([]);const fileInputRef = ref<HTMLInputElement | null>(null);
const showProjectModal = ref(false);
const editingProject = ref<any>(null);
const projectForm = ref({ name: '', description: '', dir: '' });

// ========== 计算属性 ==========
const currentProject = computed(() => {
  if (!currentSession.value?.project_id) return null;
  return projects.value.find(p => p.id === currentSession.value.project_id) || null;
});

// ========== Agent 工具函数 ==========
function agentLabel(agent: string) {
  if (agent === 'pi') return 'pi';
  if (agent === 'opencode') return 'opencode';
  if (agent === 'claude') return 'Claude';
  return agent || 'pi';
}

// ========== 加载数据 ==========
async function loadProjects() {
  try {
    projects.value = await API.project.list();
  } catch { projects.value = []; }
}

async function loadSessions(projectId: number) {
  try {
    const sessions = await API.coding.listSessionsByProject(String(projectId));
    projectSessions[projectId] = sessions || [];
  } catch {
    projectSessions[projectId] = [];
  }
}

async function loadMessages(sessionId: string) {
  try {
    const msgs = await API.coding.getMessages(sessionId);
    messages.value = msgs.map((m: any) => ({
      role: m.role,
      content: m.content,
      mode: m.mode,
      images: m.images || undefined,
    }));
    // 从数据库加载的消息中如果有图片，解析出来
    for (const m of messages.value) {
      if (m.images && typeof m.images === 'string') {
        try { m.images = JSON.parse(m.images); } catch { m.images = undefined; }
      }
    }
  } catch {
    messages.value = [];
  }
  scrollToBottom();
}

// ========== 项目展开/折叠 ==========
function toggleProject(projectId: number) {
  if (expandedProjects.has(projectId)) {
    expandedProjects.delete(projectId);
  } else {
    expandedProjects.add(projectId);
    if (!projectSessions[projectId]) {
      loadSessions(projectId);
    }
  }
}

// ========== 对话选择 ==========
async function selectSession(session: any) {
  if (isStreaming.value) return;
  currentSessionId.value = session.id;
  currentSession.value = session;
  activeAgent.value = session.active_agent || 'pi';
  await loadMessages(session.id);
  checkAgentStatus();
}

async function newSession(projectId: number) {
  if (isStreaming.value) return;
  const id = 'coding_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  try {
    const session = await API.coding.createSession(id, String(projectId), '新对话', activeAgent.value);
    currentSessionId.value = id;
    currentSession.value = session;
    messages.value = [];
    inputText.value = '';
    await loadSessions(projectId);
    // 自动展开项目并选中新对话
    expandedProjects.add(projectId);
    checkAgentStatus();
    nextTick(() => inputRef.value?.focus());
  } catch (e: any) {
    console.error('创建对话失败:', e);
  }
}

async function deleteSession(sessionId: string) {
  if (!confirm('确定删除此对话？')) return;
  try {
    await API.coding.deleteSession(sessionId);
    if (currentSessionId.value === sessionId) {
      currentSessionId.value = '';
      currentSession.value = null;
      messages.value = [];
    }
    // 刷新所有项目的对话列表
    for (const pid of Object.keys(projectSessions)) {
      loadSessions(Number(pid));
    }
  } catch (e: any) {
    console.error('删除失败:', e);
  }
}

// ========== Agent 切换 ==========
async function onAgentSwitch() {
  if (!currentSessionId.value) return;
  try {
    const session = await API.coding.switchAgent(currentSessionId.value, activeAgent.value);
    currentSession.value = session;
    checkAgentStatus();
    // 刷新项目中的对话列表（更新 badge）
    for (const pid of Object.keys(projectSessions)) {
      loadSessions(Number(pid));
    }
  } catch (e: any) {
    console.error('切换 Agent 失败:', e);
  }
}

async function checkAgentStatus() {
  agentReady.value = false;
  try {
    const status = await API.agent.status();
    if (activeAgent.value === 'pi') agentReady.value = status.pi?.installed;
    else if (activeAgent.value === 'opencode') agentReady.value = status.opencode?.installed;
    else if (activeAgent.value === 'claude') agentReady.value = status.claude?.installed;
  } catch {
    agentReady.value = false;
  }
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
        const base64 = dataUrl.split(',')[1];
        pendingImages.value.push({ data: base64, mimeType: file.type });
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
      const base64 = dataUrl.split(',')[1];
      pendingImages.value.push({ data: base64, mimeType: file.type });
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
    // 如果还没有对话，找第一个项目自动创建
    if (projects.value.length === 0) {
      openAddProject();
      return;
    }
    const firstProject = projects.value[0];
    expandedProjects.add(firstProject.id);
    await loadSessions(firstProject.id);
    await newSession(firstProject.id);
    // 等 session 创建完成后再发送
    nextTick(() => {
      inputText.value = text;
      doSend(text);
    });
    return;
  }

  doSend(text);
}

async function doSend(text: string) {
  // 获取待发送的图片并清空预览
  const images = pendingImages.value.map(img => ({ data: img.data, mimeType: img.mimeType }));
  pendingImages.value = [];

  const userMsg: any = { role: 'user', content: text };
  if (images.length) {
    userMsg.images = images;
  }
  messages.value.push(userMsg);

  inputText.value = '';
  autoResizeTextarea();

  const msgIdx = messages.value.length;
  messages.value.push({
    role: 'assistant',
    content: '',
    status: '准备中...',
    mode: activeAgent.value,
  });

  isStreaming.value = true;
  scrollToBottom();

  const sid = currentSessionId.value;
  const projectDir = currentProject.value?.dir || '';

  // 清理旧的事件监听器（避免泄漏）
  API.removeAllListeners('coding:delta');
  API.removeAllListeners('coding:status');
  API.removeAllListeners('coding:tool');
  API.removeAllListeners('coding:done');
  API.removeAllListeners('coding:error');

  // 注册事件监听
  const onDelta = (data: { sessionId: string; text: string }) => {
    if (data.sessionId !== sid) return;
    const msg = messages.value[msgIdx];
    if (msg) {
      msg.content += data.text;
      msg.status = '';
    }
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

  const onDone = (data: { sessionId: string }) => {
    if (data.sessionId !== sid) return;
    isStreaming.value = false;
    const msg = messages.value[msgIdx];
    if (msg) msg.status = '✓ 完成';
    thinkingText.value = '';
    scrollToBottom();
    // 刷新对话列表（更新标题等）
    if (currentProject.value) {
      loadSessions(currentProject.value.id);
    }
    // 清理监听器
    API.removeAllListeners('coding:delta');
    API.removeAllListeners('coding:status');
    API.removeAllListeners('coding:tool');
    API.removeAllListeners('coding:done');
    API.removeAllListeners('coding:error');
  };

  const onError = (data: { sessionId: string; text: string }) => {
    if (data.sessionId !== sid) return;
    isStreaming.value = false;
    const msg = messages.value[msgIdx];
    if (msg) {
      msg.content = '❌ ' + data.text;
      msg.status = '错误';
    }
    scrollToBottom();
    // 清理监听器
    API.removeAllListeners('coding:delta');
    API.removeAllListeners('coding:status');
    API.removeAllListeners('coding:tool');
    API.removeAllListeners('coding:done');
    API.removeAllListeners('coding:error');
  };

  API.on('coding:delta', onDelta);
  API.on('coding:status', onStatus);
  API.on('coding:tool', onTool);
  API.on('coding:done', onDone);
  API.on('coding:error', onError);

  try {
    await API.coding.send(text, sid, projectDir, activeAgent.value, images.length ? images : undefined);
  } catch (err: any) {
    isStreaming.value = false;
    const msg = messages.value[msgIdx];
    if (msg) msg.content = '❌ ' + (err.message || '发送失败');
    // 清理监听器
    API.removeAllListeners('coding:delta');
    API.removeAllListeners('coding:status');
    API.removeAllListeners('coding:tool');
    API.removeAllListeners('coding:done');
    API.removeAllListeners('coding:error');
  }
}

// ========== 工具函数 ==========
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

// ========== 项目弹窗 ==========
function openAddProject() {
  editingProject.value = null;
  projectForm.value = { name: '', description: '', dir: '' };
  showProjectModal.value = true;
}

function openEditProject(project: any) {
  editingProject.value = project;
  projectForm.value = {
    name: project.name || '',
    description: project.description || '',
    dir: project.dir || '',
  };
  showProjectModal.value = true;
}

function closeProjectModal() {
  showProjectModal.value = false;
  editingProject.value = null;
}

async function pickFolder() {
  try {
    const dir = await API.dialog.openDirectory();
    if (dir) projectForm.value.dir = dir;
  } catch {}
}

async function saveProject() {
  if (!projectForm.value.name.trim()) return;
  try {
    if (editingProject.value) {
      await API.project.update(editingProject.value.id, projectForm.value);
    } else {
      await API.project.add(projectForm.value.name, projectForm.value.dir, projectForm.value.description);
    }
    closeProjectModal();
    await loadProjects();
    // 自动展开新项目
    if (projects.value.length > 0 && !editingProject.value) {
      expandedProjects.add(projects.value[0].id);
    }
  } catch (e: any) {
    alert('保存失败: ' + (e.message || ''));
  }
}

async function deleteProject(project: any) {
  if (!confirm(`确定删除项目「${project.name}」？
此操作不会删除对话记录，但项目下的对话将无法通过项目树访问。`)) return;
  try {
    await API.project.delete(project.id);
    // 如果当前选中的对话属于这个项目，清空
    if (currentProject.value?.id === project.id) {
      currentSessionId.value = '';
      currentSession.value = null;
      messages.value = [];
    }
    expandedProjects.delete(project.id);
    delete projectSessions[project.id];
    await loadProjects();
  } catch (e: any) {
    alert('删除失败: ' + (e.message || ''));
  }
}

// ========== 生命周期 ==========
onMounted(async () => {
  await loadProjects();
  await checkAgentStatus();
  // 自动展开第一个项目
  if (projects.value.length > 0) {
    expandedProjects.add(projects.value[0].id);
    await loadSessions(projects.value[0].id);
  }
});

onBeforeUnmount(() => {
  API.removeAllListeners('coding:delta');
  API.removeAllListeners('coding:status');
  API.removeAllListeners('coding:tool');
  API.removeAllListeners('coding:done');
  API.removeAllListeners('coding:error');
});
</script>

<style scoped>
.coding-workbench {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: #f5f5f5;
}

/* ========== 左栏 ========== */
.workbench-sidebar {
  width: 280px;
  min-width: 280px;
  background: #fafafa;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 12px 14px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.project-tree {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.project-node {
  border-bottom: 1px solid #f0f0f0;
}

.project-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}

.project-header:hover {
  background: #f0f0f0;
}

.project-arrow {
  font-size: 10px;
  color: #94a3b8;
  width: 12px;
  text-align: center;
  flex-shrink: 0;
}

.project-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.project-name {
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: #e2e8f0;
  color: #64748b;
  flex-shrink: 0;
}

.project-actions {
  display: none;
  gap: 2px;
  flex-shrink: 0;
  margin-left: auto;
}

.project-header:hover .project-actions {
  display: flex;
}

.project-edit-btn,
.project-delete-btn {
  font-size: 12px;
  cursor: pointer;
  padding: 1px 3px;
  border-radius: 4px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.project-edit-btn:hover {
  opacity: 1;
  background: rgba(99, 102, 241, 0.1);
}

.project-delete-btn:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.1);
}

.conversation-list {
  background: #f8f8fa;
}

.conversation-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px 8px 32px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
}

.conversation-item:hover {
  background: #eef2ff;
}

.conversation-item.active {
  background: rgba(99, 102, 241, 0.1);
  border-left: 3px solid #6366f1;
}

.conv-icon {
  font-size: 12px;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.conv-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #334155;
}

.conv-title.new {
  color: #6366f1;
}

.conv-agent-badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 6px;
  flex-shrink: 0;
  font-weight: 500;
}

.conv-agent-badge.pi { background: #eef2ff; color: #6366f1; }
.conv-agent-badge.opencode { background: #fef3c7; color: #b45309; }
.conv-agent-badge.claude { background: #d1fae5; color: #059669; }

.conv-delete {
  font-size: 14px;
  color: #94a3b8;
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
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.new-conversation {
  color: #6366f1;
  font-weight: 500;
}

.new-conversation:hover {
  background: rgba(99, 102, 241, 0.06);
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
  color: #94a3b8;
}

/* ========== 右栏 ========== */
.workbench-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workbench-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
  color: #94a3b8;
}

.workbench-empty .empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.workbench-empty .empty-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1e293b;
}

.workbench-empty .empty-desc {
  font-size: 14px;
  line-height: 1.6;
  color: #64748b;
}

/* ========== 对话头部 ========== */
.chat-header {
  padding: 12px 20px;
  border-bottom: 1px solid #e2e8f0;
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chat-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.chat-project-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  background: #f1f5f9;
  color: #64748b;
}

.chat-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.agent-select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.agent-select {
  padding: 4px 28px 4px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  background: white;
  color: #1e293b;
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}

.agent-select:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

.agent-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fbbf24;
  flex-shrink: 0;
}

.agent-status-dot.ready {
  background: #22c55e;
}

.agent-status-dot.checking {
  background: #fbbf24;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ========== 消息列表 ========== */
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

.thinking-status {
  font-size: 13px;
  color: #6366f1;
  padding: 6px 10px;
  margin-bottom: 8px;
  background: #eef2ff;
  border-radius: 8px;
  border: 1px solid #a5b4fc;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ========== 输入区 ========== */
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
  transition: border-color 0.2s;
}

.input-wrapper:focus-within {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
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
  font-family: inherit;
  box-sizing: border-box;
}

.chat-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-input::placeholder {
  color: #94a3b8;
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px 8px 12px;
}

.input-left {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.input-hint {
  font-size: 11px;
  color: #94a3b8;
}

/* ========== 图片预览（输入区） ========== */
.image-preview-bar { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 12px; border-top: 1px solid #f1f5f9; }
.image-preview-item { position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; flex-shrink: 0; }
.image-preview-thumb { width: 100%; height: 100%; object-fit: cover; }
.image-preview-remove { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(0,0,0,0.5); color: white; font-size: 12px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.image-preview-remove:hover { background: rgba(239,68,68,0.8); }
/* ========== 消息中的图片 ========== */
.message-images { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.chat-image { max-width: 300px; max-height: 300px; border-radius: 8px; border: 1px solid #e2e8f0; object-fit: contain; }

.input-right {
  display: flex;
  align-items: center;
  gap: 4px;
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
  flex-shrink: 0;
}

.send-btn:hover {
  background: #4f46e5;
}

.send-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

/* ========== Markdown 样式 ========== */
.markdown-body {
  white-space: pre-wrap;
  word-break: break-word;
}

.markdown-body p {
  margin-bottom: 8px;
}

.markdown-body ul, .markdown-body ol {
  padding-left: 20px;
  margin-bottom: 8px;
}

.markdown-body li {
  margin-bottom: 4px;
}

.markdown-body code {
  background: rgba(0, 0, 0, 0.04);
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

.markdown-body strong {
  font-weight: 600;
}

.markdown-body a {
  color: #6366f1;
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

/* ========== 弹窗 ========== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-box {
  background: white;
  border-radius: var(--radius-md);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 20px 24px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.modal-close:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
}

.modal-footer {
  padding: 0 24px 20px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-control {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}

.form-control:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

.input-with-btn {
  display: flex;
  gap: 8px;
}

.input-with-btn .form-control {
  flex: 1;
}
</style>