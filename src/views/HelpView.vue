<template>
  <div class="help-view">
    <div class="content-header">
      <h1 class="content-title">帮助中心</h1>
    </div>

    <div class="content-body">
      <div style="margin-bottom:24px;">
        <h2 style="font-size:22px;font-weight:600;margin-bottom:4px;">帮助中心</h2>
        <p class="text-muted">笔灵AI助理 — 功能指南与常见问题</p>
      </div>

      <div class="card">
        <h2>🚀 快速开始</h2>
        <p class="text-muted mb-2">笔灵AI助理基于 Spring AI 2.0 + Spring Boot 4.1，直连 LLM API，无需外部编排服务。启动后访问设置页面配置 LLM API Key 和笔记库即可使用全部功能。</p>
        <h3 style="font-size:13px;font-weight:600;margin:12px 0 8px;color:#5c5f66;">前置依赖</h3>
        <table class="help-table">
          <tr><th>依赖</th><th>说明</th><th>必须</th></tr>
          <tr><td>Java 17+</td><td>运行时环境</td><td style="color:#2b8a3e;">✅</td></tr>
          <tr><td>LLM API Key</td><td>DeepSeek / 商汤 / 智谱等兼容 API</td><td style="color:#2b8a3e;">✅</td></tr>
          <tr><td>语义检索</td><td>Ollama 本地 或 API（硅基流动等）</td><td style="color:#909296;">🔘 可选</td></tr>
        </table>
        <h3 style="font-size:13px;font-weight:600;margin:12px 0 8px;color:#5c5f66;">启动步骤</h3>
        <pre class="code-block"># 1. 编译
mvn package -q
# 2. 启动
java -jar target/ai-assistant-1.0.0.jar
# 3. 在设置页面配置 LLM API Key + 笔记库路径</pre>
        <p class="tip">提示：先配 API Key 和笔记库路径，否则 AI 功能和文件操作不可用。支持多 LLM 模型同时配置，可在对话页切换。</p>
      </div>

      <div class="card">
        <h2>🧭 页面导航</h2>
        <table class="help-table">
          <tr><th>菜单</th><th>功能</th></tr>
          <tr><td>💬 对话</td><td>AI 对话（笔记库/创作模式），支持语义检索、工具调用、对话导出</td></tr>
          <tr><td>📝 笔记</td><td>笔记管理，支持 Markdown 编辑、目录浏览、文件操作</td></tr>
          <tr><td>🗂️ 数据中心</td><td>多数据集管理、Schema 定义、Excel/JSON 导入导出</td></tr>
          <tr><td>📊 洞察</td><td>数据洞察分析、AI 分析报告</td></tr>
          <tr><td>📋 提醒</td><td>待办 + 提醒统一管理</td></tr>
          <tr><td>🔧 工具箱</td><td>图片识别、识题、数据导入等工具集合</td></tr>
          <tr><td>⚙️ 设置</td><td>系统配置：多 LLM 模型、语义向量模型、飞书、字段标签等</td></tr>
          <tr><td>📝 日志</td><td>操作日志查看</td></tr>
        </table>
      </div>

      <div class="card">
        <h2>💬 AI 对话</h2>
        <p class="text-muted mb-2">连续对话模式，按当前笔记库加载聊天历史，SSE 流式输出。AI 可自主调用工具操作笔记库。</p>
        <h3 style="font-size:13px;font-weight:600;margin:12px 0 8px;color:#5c5f66;">工作模式</h3>
        <ul>
          <li><strong>笔记库对话</strong>（默认）— 注入历史上下文 + 语义检索，适合基于笔记库的问答</li>
          <li><strong>创作式对话</strong> — 无历史上下文，适合独立创作或开放讨论</li>
        </ul>
        <h3 style="font-size:13px;font-weight:600;margin:12px 0 8px;color:#5c5f66;">AI 工具（自动编排）</h3>
        <table class="help-table">
          <tr><th>工具</th><th>功能</th><th>触发场景</th></tr>
          <tr><td><code>readFile</code></td><td>读取笔记库文件内容</td><td>AI 需要了解数据格式或历史内容</td></tr>
          <tr><td><code>writeFile</code></td><td>写入文件（先读后写，防覆盖）</td><td>创建/更新记录、文档</td></tr>
          <tr><td><code>listDir</code></td><td>列出目录内容</td><td>AI 需要探索笔记库结构</td></tr>
          <tr><td><code>searchFiles</code></td><td>按文件名关键词搜索</td><td>查找特定文件</td></tr>
        </table>
        <h3 style="font-size:13px;font-weight:600;margin:12px 0 8px;color:#5c5f66;">语义检索 / 长期记忆</h3>
        <ul>
          <li><strong>Ollama 本地</strong> — 不填 API Key，使用本地 Ollama（推荐 <code>bge-m3</code>）</li>
          <li><strong>API 模式</strong> — 填入 API Key，支持硅基流动等 OpenAI 兼容服务</li>
        </ul>
      </div>

      <div class="card">
        <h2>🗂️ 数据中心</h2>
        <p class="text-muted mb-2">集中管理结构化数据集，支持多数据集、Schema 定义、批量导入。</p>
        <ul>
          <li>创建数据集（定义 Schema：字段名、类型、描述、必填、默认值）</li>
          <li><strong>Excel 导入</strong> — 自动检测列头、模糊匹配字段映射，支持 AI 智能归一化</li>
          <li><strong>JSON 导入</strong> — 直接粘贴或上传 JSON 数据</li>
          <li><strong>URL 导入</strong> — AI 自动访问 URL 并提取结构化数据</li>
          <li>记录浏览、搜索、删除，自动 MD5 去重</li>
          <li>可将数据集导出到笔记库目录</li>
        </ul>
      </div>

      <div class="card">
        <h2>⚙️ 系统配置</h2>
        <p class="text-muted mb-2">所有配置通过设置页面管理，无需手动编辑文件。</p>
        <table class="help-table">
          <tr><th>配置项</th><th>说明</th></tr>
          <tr><td>AI 模型</td><td>多 LLM 模型管理（名称、API Key、地址、模型名、超时、类型），支持文本/多模态/向量模型</td></tr>
          <tr><td>语义向量模型</td><td>配置用于语义检索的向量模型（Ollama 本地 或 API）</td></tr>
          <tr><td>飞书 Webhook</td><td>消息推送 URL</td></tr>
          <tr><td>飞书消息接收</td><td>App ID / Secret / Chat ID，WebSocket 长连接接收消息</td></tr>
          <tr><td>字段标签</td><td>英文 key → 中文标签映射</td></tr>
          <tr><td>编程 AI</td><td>可选开启，独立飞书机器人</td></tr>
        </table>
        <h3 style="font-size:13px;font-weight:600;margin:12px 0 8px;color:#5c5f66;">支持的 LLM 提供商</h3>
        <table class="help-table">
          <tr><th>提供商</th><th>Base URL</th><th>示例模型</th></tr>
          <tr><td>DeepSeek</td><td><code>https://api.deepseek.com</code></td><td>deepseek-chat</td></tr>
          <tr><td>商汤 SenseNova</td><td><code>https://token.sensenova.cn/v1</code></td><td>SenseChat</td></tr>
          <tr><td>智谱 GLM</td><td><code>https://open.bigmodel.cn/api/paas/v4</code></td><td>glm-4</td></tr>
          <tr><td>本地 Ollama</td><td><code>http://127.0.0.1:11434/v1</code></td><td>qwen2.5</td></tr>
        </table>
      </div>

      <div class="card">
        <h2>❓ 常见问题</h2>
        <table class="help-table">
          <tr><th>问题</th><th>原因</th><th>解决</th></tr>
          <tr><td>AI 回复"API Key 未配置"</td><td>未在设置页面填写 API Key</td><td>设置页填写 LLM API Key</td></tr>
          <tr><td>AI 回复为空</td><td>LLM 超时或返回空</td><td>检查网络，超时设为 600s</td></tr>
          <tr><td>"未配置笔记库"</td><td>未添加笔记库或未配置路径</td><td>在笔记库管理页添加笔记库</td></tr>
          <tr><td>语义检索不可用</td><td>Ollama 未启动或向量模型未配置</td><td>启动 Ollama 或配置 API 模式的向量模型</td></tr>
          <tr><td>飞书消息收不到</td><td>WebSocket 未连接或 Webhook 未配置</td><td>在设置页检查飞书凭据</td></tr>
          <tr><td>对话记录丢失</td><td>切换了笔记库</td><td>每个笔记库的对话是独立的，切换回对应笔记库即可</td></tr>
        </table>
      </div>

      <div class="card">
        <h2>🏗️ 技术架构</h2>
        <table class="help-table">
          <tr><th>组件</th><th>技术</th></tr>
          <tr><td>框架</td><td>Spring Boot 4.1.0 + Spring AI 2.0.0 + Java 17</td></tr>
          <tr><td>AI 引擎</td><td>ChatClient 直连 LLM（OpenAI 兼容协议）</td></tr>
          <tr><td>工具编排</td><td>@Tool 注解 + ToolCallingAdvisor（自动路由）</td></tr>
          <tr><td>语义检索</td><td>Ollama（bge-m3 等）</td></tr>
          <tr><td>会话存储</td><td>SQLite（MyBatis-Plus）— sessions / messages / turn_embeddings</td></tr>
          <tr><td>笔记库存储</td><td>JSON / Markdown 文件（本地文件系统）</td></tr>
          <tr><td>前端</td><td>Vue 3 + Electron</td></tr>
          <tr><td>飞书集成</td><td>OpenAPI SDK（WebSocket）+ HttpURLConnection（Webhook）</td></tr>
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