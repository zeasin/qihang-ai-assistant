<template>
  <div class="help-view">
    <div class="content-header">
      <h1 class="content-title">帮助中心</h1>
    </div>

    <div class="content-body">
      <div style="margin-bottom:24px;">
        <h2 style="font-size:22px;font-weight:600;margin-bottom:4px;">帮助中心</h2>
        <p class="text-muted">启航AI工作台 — 功能指南与常见问题</p>
      </div>

      <div class="card">
        <h2>🚀 快速开始</h2>
        <p class="text-muted mb-2">Electron + Vue 3 桌面端 启航AI工作台，支持笔记知识库管理、AI 对话、数据管理、定时日报等功能。后端基于 Node.js + SQLite，语义检索使用 Ollama 或兼容 API。</p>
        <h3 style="font-size:13px;font-weight:600;margin:12px 0 8px;color:#5c5f66;">启动步骤</h3>
        <pre class="code-block"># 1. 安装依赖
npm install

# 2. 启动开发模式（前后端）
npm run electron:dev

# 3. 打包构建
npm run electron:build</pre>
        <p class="tip">提示：首次使用请先到设置页配置 AI 模型、嵌入模型，并在总览页添加笔记库。</p>
      </div>

      <div class="card">
        <h2>🧭 页面导航</h2>
        <table class="help-table">
          <tr><th>菜单</th><th>说明</th></tr>
          <tr><td>📊 总览</td><td>全局看板：数据统计、语义搜索、笔记库索引管理</td></tr>
          <tr><td>💻 项目</td><td>AI 编程工作台，辅助代码开发</td></tr>
          <tr><td>📁 文件</td><td>Markdown 笔记管理，目录树浏览、编辑器、Zen 模式</td></tr>
          <tr><td>🗃️ 数据</td><td>多数据集管理，Excel/JSON 批量导入，AI 智能填充</td></tr>
          <tr><td>🔔 提醒</td><td>待办 + 定时提醒统一管理</td></tr>
          <tr><td>⚙️ 设置</td><td>系统配置：LLM 模型、嵌入模型、Agent、飞书、定时任务等</td></tr>
          <tr><td>📋 日志</td><td>操作日志查看</td></tr>
          <tr><td>❓ 帮助</td><td>使用指南（当前页面）</td></tr>
        </table>
        <p class="text-muted">侧边栏底部还有 🔧 工具箱（图片识别、识题、Markdown 预览等）通过路由 <code>/tools</code> 访问。</p>
      </div>

      <div class="card">
        <h2>📁 文件管理</h2>
        <p class="text-muted mb-2">Markdown 笔记/文件的目录树浏览、编辑、索引与搜索。</p>
        <ul>
          <li><strong>目录树</strong> — 侧边栏树状结构浏览，右键新建/重命名/删除文件或目录</li>
          <li><strong>编辑器</strong> — 分屏实时 Markdown 预览，支持 Zen 模式全屏写作、标签管理</li>
          <li><strong>索引</strong> — 在总览页按笔记库名称逐库索引，系统自动分段并生成向量嵌入</li>
          <li><strong>搜索</strong> — 文件名关键词搜索 + 语义搜索（基于向量相似度，需配置嵌入模型）</li>
        </ul>
      </div>

      <div class="card">
        <h2>🗃️ 数据</h2>
        <p class="text-muted mb-2">模块化数据集管理，支持自定义 Schema。</p>
        <ul>
          <li><strong>模块管理</strong> — 按模块分组管理数据集，可新建/编辑/删除模块</li>
          <li><strong>数据集 Schema</strong> — 自定义字段列表、类型选项、状态选项</li>
          <li><strong>记录管理</strong> — 基于 Schema 动态生成表单，支持增删改查、搜索、分页</li>
          <li>上次选中的数据集自动恢复</li>
        </ul>
      </div>

      <div class="card">
        <h2>🧠 语义检索与索引</h2>
        <p class="text-muted mb-2">笔记库通过嵌入模型建立向量索引，实现语义级搜索。</p>
        <h3 style="font-size:13px;font-weight:600;margin:12px 0 8px;color:#5c5f66;">工作原理</h3>
        <ul>
          <li>扫描笔记库 Markdown 文件，按段落/标题分块</li>
          <li>调用嵌入模型生成向量（默认 <code>bge-m3</code>）</li>
          <li>支持 Ollama 本地或 OpenAI 兼容 API（如硅基流动）</li>
          <li>搜索时按关键词 + 向量相似度综合排序</li>
        </ul>
        <h3 style="font-size:13px;font-weight:600;margin:12px 0 8px;color:#5c5f66;">在总览页管理</h3>
        <ul>
          <li>查看文档数、片段数、嵌入进度</li>
          <li>按笔记库单独索引或全部重新索引</li>
          <li>在搜索栏测试语义搜索效果</li>
        </ul>
      </div>

      <div class="card">
        <h2>🤖 Agent 系统</h2>
        <p class="text-muted mb-2">内置多个 AI Agent，各有不同能力定位。</p>
        <table class="help-table">
          <tr><th>Agent</th><th>用途</th><th>安装方式</th></tr>
          <tr><td>🧠 pi agent</td><td>AI 代码编排 agent，负责工具调用和任务编排</td><td><code>npm install @earendil-works/pi-coding-agent</code></td></tr>
          <tr><td>🔧 opencode</td><td>通用 AI agent SDK，适合通用对话任务</td><td><code>npm install @opencode-ai/sdk</code></td></tr>
          <tr><td>🤖 Claude Code CLI</td><td>Anthropic 官方 Agent SDK，流式对话</td><td><code>npm install @anthropic-ai/claude-agent-sdk</code></td></tr>
        </table>
        <p class="text-muted">状态和版本信息在设置页查看。API Key 通过环境变量配置。</p>
      </div>

      <div class="card">
        <h2>⚙️ 系统配置</h2>
        <p class="text-muted mb-2">所有配置通过设置页面管理，无需手动编辑文件。</p>
        <table class="help-table">
          <tr><th>配置项</th><th>说明</th></tr>
          <tr><td>嵌入模型</td><td>语义检索用的向量模型（Ollama 或 API）</td></tr>
          <tr><td>Agent 状态</td><td>查看 pi agent / opencode / Claude Code CLI 安装状态</td></tr>
          <tr><td>定时任务</td><td>管理内置定时任务（日报、消息汇总等），支持飞书通知</td></tr>
          <tr><td>飞书 Webhook</td><td>消息推送 URL</td></tr>
          <tr><td>飞书 Bot</td><td>App ID / Secret，WebSocket 长连接接收消息</td></tr>
          <tr><td>日报设置</td><td>每日 AI 综合日报，自定义提示词和保留天数</td></tr>
          <tr><td>笔记库索引配置</td><td>每个笔记库可单独配置排除目录和文件</td></tr>
        </table>

      </div>

      <div class="card">
        <h2>❓ 常见问题</h2>
        <table class="help-table">
          <tr><th>问题</th><th>原因</th><th>解决</th></tr>
          <tr><td>对话为空或超时</td><td>LLM 地址或网络不可达</td><td>检查 API 地址和网络，超时设 600s</td></tr>
          <tr><td>语义搜索无结果</td><td>笔记库未索引或嵌入模型未配置</td><td>在总览页点击索引按钮，检查嵌入模型配置</td></tr>
          <tr><td>索引失败</td><td>嵌入模型服务未启动</td><td>确认 Ollama 运行或 API 地址正确</td></tr>
          <tr><td>飞书消息收不到</td><td>Webhook 未配置或 Bot 未启动</td><td>在设置页检查飞书配置</td></tr>
          <tr><td>定时任务未执行</td><td>调度器未开启</td><td>在设置页确认调度器运行中</td></tr>
        </table>
      </div>

      <div class="card">
        <h2>🏗️ 技术架构</h2>
        <table class="help-table">
          <tr><th>层</th><th>技术</th></tr>
          <tr><td>前端框架</td><td>Vue 3 + TypeScript + Vite</td></tr>
          <tr><td>桌面壳</td><td>Electron</td></tr>
          <tr><td>后端</td><td>Node.js（主进程）</td></tr>
          <tr><td>数据库</td><td>SQLite（better-sqlite3）</td></tr>
          <tr><td>AI Agent</td><td>pi-coding-agent / opencode SDK / claude-agent-sdk</td></tr>
          <tr><td>语义检索</td><td>Ollama / OpenAI 兼容 API（bge-m3）</td></tr>
          <tr><td>LLM 接入</td><td>OpenAI 兼容协议（直连）</td></tr>
          <tr><td>飞书集成</td><td>Webhook + WebSocket Bot</td></tr>
          <tr><td>IPC 通信</td><td>Electron ipcMain / ipcRenderer</td></tr>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.help-view {
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
  margin: 12px 0 8px;
  color: #5c5f66;
}

.text-muted {
  color: var(--text-muted);
  font-size: 13px;
}

.mb-2 {
  margin-bottom: 8px;
}

.help-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-bottom: 12px;
}

.help-table th, .help-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.help-table th {
  background: var(--hover);
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 12px;
}

.help-table code {
  font-size: 12px;
  background: #f5f5f7;
  padding: 2px 6px;
  border-radius: 4px;
}

.code-block {
  background: #1e1e2e;
  color: #cdd6f4;
  padding: 12px 14px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  margin: 0;
}

.tip {
  font-size: 12px;
  color: var(--primary);
  background: #f5f3ff;
  padding: 8px 12px;
  border-radius: 6px;
  margin-top: 8px;
}

.card ul {
  padding-left: 20px;
  margin: 8px 0;
}

.card ul li {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  margin-bottom: 3px;
}
</style>
