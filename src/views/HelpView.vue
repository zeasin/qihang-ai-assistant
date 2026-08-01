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
        <h2 style="font-size:17px;">✨ 核心卖点：一条完整的自动化链路</h2>
        <p class="text-muted mb-2">启航AI工作台不是"对话框 + 一堆孤立功能"，而是一套完整的自动化流程：</p>
        <div style="text-align:center;padding:12px 0;font-size:14px;font-weight:600;color:var(--primary);">
          采集 → 分析 → 建议 → 执行 → 推送
        </div>
        <ol style="margin:8px 0;padding-left:20px;font-size:13px;line-height:1.8;">
          <li><strong>采集</strong>：Markdown 笔记随手记，JSON 数据批量导入，自动索引进本地知识库</li>
          <li><strong>分析</strong>：AI 基于你的笔记和数据回答提问、查数据集、读文件，而不是凭空瞎编</li>
          <li><strong>建议</strong>：AI 不只是回答问题，还给出可执行的建议——该做的事、该记的档、该跟进的事项</li>
          <li><strong>执行</strong>：对话中产生的任务、记录直接落成待办和数据集，AI 还能读写笔记文件、操作本地数据</li>
          <li><strong>推送</strong>：定时提醒、每日 AI 日报自动汇总，通过飞书推送到你的群和联系人</li>
        </ol>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
          <div style="flex:1;min-width:140px;padding:10px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;font-size:12px;line-height:1.5;">
            <strong style="color:#16a34a;">🔒 数据安全</strong><br>
            <span class="text-muted">笔记、索引、对话、待办全部存在本机，不上传云端</span>
          </div>
          <div style="flex:1;min-width:140px;padding:10px;background:#f0f7ff;border-radius:8px;border:1px solid #b3d4f7;font-size:12px;line-height:1.5;">
            <strong style="color:#2563eb;">🧠 模型自由</strong><br>
            <span class="text-muted">支持 DeepSeek、OpenAI、Ollama 本地模型，随时切换</span>
          </div>
          <div style="flex:1;min-width:140px;padding:10px;background:#fefce8;border-radius:8px;border:1px solid #fde68a;font-size:12px;line-height:1.5;">
            <strong style="color:#d97706;">🚀 持续进化</strong><br>
            <span class="text-muted">底层 pi agent 引擎持续迭代，能力自动升级无需重构</span>
          </div>
        </div>
      </div>

      <div class="card card-prereq">
        <h2 style="font-size:17px;">📋 使用前必读：三个前置条件</h2>
        <p class="text-muted mb-2">应用启动后，需要完成以下三个配置才能正常使用所有功能。</p>

        <div class="prereq-item">
          <div class="prereq-number">1</div>
          <div class="prereq-content">
            <strong>安装 pi agent（AI 对话引擎）</strong>
            <p class="text-muted">所有 AI 对话、工具调用、日报生成都由 pi agent 驱动。打开终端执行：</p>
            <pre class="code-block">npm install -g @earendil-works/pi-coding-agent</pre>
            <p class="text-muted">安装后运行 <code>pi</code> 命令，按照提示完成登录和模型配置（推荐配置 DeepSeek 或 Ollama 模型）。配置完成后应用会自动识别。</p>
          </div>
        </div>

        <div class="prereq-item">
          <div class="prereq-number">2</div>
          <div class="prereq-content">
            <strong>准备向量模型（用于知识库语义搜索）</strong>
            <p class="text-muted">推荐使用 Ollama 本地运行 <code>bge-m3</code> 模型，完全免费离线：</p>
            <pre class="code-block"># 1. 下载安装 Ollama（https://ollama.com/download）
# 2. 拉取 bge-m3 模型
ollama pull bge-m3

# 3. 确认 Ollama 服务运行中（默认 http://127.0.0.1:11434）</pre>
            <p class="text-muted">然后进入应用「设置 → 嵌入模型配置」，填写：</p>
            <ul>
              <li>提供商名称：<code>Ollama</code></li>
              <li>模型名称：<code>bge-m3</code></li>
              <li>服务地址：<code>http://127.0.0.1:11434</code></li>
              <li>API Key：留空</li>
            </ul>
            <p class="text-muted">保存后可在知识库「概览」Tab 中点击「索引」按钮建立向量索引。</p>
          </div>
        </div>

        <div class="prereq-item">
          <div class="prereq-number">3</div>
          <div class="prereq-content">
            <strong>设置笔记库目录</strong>
            <p class="text-muted">笔记库是知识检索和 AI 问答的数据基础。进入「设置 → 笔记库设置」，选择一个包含 Markdown 文件的本地文件夹作为笔记库。保存后即可在知识库中浏览文件，并让 AI 基于你的笔记回答问题。</p>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>🚀 快速开始</h2>
        <p class="text-muted mb-2">启航AI工作台是一款桌面应用，将本地笔记知识库、结构化数据、待办提醒、飞书推送和 AI 智能体整合成一套完整的工作流。所有数据保存在本机，模型自由选择。</p>
        <ol style="margin:8px 0;padding-left:20px;font-size:13px;line-height:1.8;">
          <li>完成上方三个前置条件配置</li>
          <li>在「对话」页开始与 AI 对话（支持图片粘贴/上传）</li>
          <li>在「知识库」浏览笔记文件，或在「概览」Tab 中查看日报、待办、提醒</li>
          <li>在「数据」页管理结构化数据集，支持 JSON/URL 批量导入</li>
          <li>在「设置」页配置飞书集成、定时任务、日报提示词等高级功能</li>
        </ol>
      </div>

      <div class="card">
        <h2>🧭 页面导航</h2>
        <table class="help-table">
          <tr><th>菜单</th><th>说明</th></tr>
          <tr><td>💬 对话</td><td>AI 对话工作台，支持多轮对话、图片识别、模型切换，pi agent 驱动</td></tr>
          <tr><td>💻 编程</td><td>代码项目工作台，管理项目文件树，基于项目的 AI 编程对话</td></tr>
          <tr><td>📁 知识库</td><td>文件浏览 + 概览看板（统计、日报、待办、提醒、索引管理）</td></tr>
          <tr><td>🗃️ 数据</td><td>多数据集管理，自定义 Schema，JSON/URL 批量导入</td></tr>
          <tr><td>🔔 任务</td><td>待办看板 + 定时提醒统一管理</td></tr>
          <tr><td>⚙️ 设置</td><td>系统配置：笔记库、LLM 模型、嵌入模型、飞书、定时任务等</td></tr>
          <tr><td>📋 日志</td><td>操作日志查看，支持级别过滤和自动刷新</td></tr>
          <tr><td>🔧 工具箱</td><td>通用识别、识题、试卷识别、数据导入/采集/加工等工具</td></tr>
          <tr><td>❓ 帮助</td><td>使用指南（当前页面）</td></tr>
        </table>
      </div>

      <div class="card">
        <h2>📁 知识库</h2>
        <p class="text-muted mb-2">浏览和管理本地 Markdown 笔记文件，支持索引和语义搜索。</p>
        <ul>
          <li><strong>文件浏览</strong> — 左侧目录树浏览笔记文件，点击查看 Markdown 渲染内容，支持代码高亮</li>
          <li><strong>索引</strong> — 点击工具栏的 📇 按钮，系统自动扫描文件、分段并生成向量嵌入</li>
          <li><strong>搜索</strong> — 支持文件名关键词搜索 + 语义搜索（需先配置嵌入模型并完成索引）</li>
          <li><strong>概览 Tab</strong> — 查看向量模型状态、文档数/片段数/嵌入进度、综合日报、待办、提醒</li>
        </ul>
      </div>

      <div class="card">
        <h2>🗃️ 数据</h2>
        <p class="text-muted mb-2">模块化数据集管理，支持自定义字段和批量导入导出。</p>
        <ul>
          <li><strong>模块管理</strong> — 按模块分组管理数据集，可新建/编辑/删除模块</li>
          <li><strong>数据集 Schema</strong> — 自定义字段列表、类型选项、状态选项</li>
          <li><strong>记录管理</strong> — 基于 Schema 动态生成表单，支持增删改查、搜索</li>
          <li><strong>批量导入</strong> — 支持 JSON 粘贴或 URL 远程数据导入</li>
          <li>上次选中的数据集自动恢复</li>
        </ul>
      </div>

      <div class="card">
        <h2>🤖 AI 助理</h2>
        <p class="text-muted mb-2">基于 pi agent 引擎的本地 AI 助理，对话页支持图片上传/粘贴，可在输入框上方切换模型。</p>
        <table class="help-table">
          <tr><th>能力</th><th>说明</th></tr>
          <tr><td>💬 日常问答</td><td>通用对话，无需绑定项目即可提问</td></tr>
          <tr><td>📚 笔记库检索</td><td>基于笔记库内容进行 RAG 语义检索回答</td></tr>
          <tr><td>💾 数据集查询</td><td>通过结构化查询访问数据中心记录</td></tr>
          <tr><td>📁 项目文件操作</td><td>读写文件、目录浏览、grep 搜索、执行命令</td></tr>
          <tr><td>📅 日报生成</td><td>自动汇总待办、对话、文档等生成综合日报</td></tr>
          <tr><td>🖼️ 图片识别</td><td>支持粘贴或上传图片，AI 自动识别内容</td></tr>
        </table>
        <p class="text-muted">对话模型通过 pi agent 配置（终端运行 <code>pi</code> 命令设置），支持 DeepSeek、OpenAI 兼容接口、Ollama 本地模型等。</p>
      </div>

      <div class="card">
        <h2>⚙️ 系统配置</h2>
        <p class="text-muted mb-2">所有配置通过设置页面管理，无需手动编辑文件。</p>
        <table class="help-table">
          <tr><th>配置项</th><th>说明</th></tr>
          <tr><td>LLM 对话模型</td><td>通过 pi agent 配置（<code>pi</code> 命令），对话页可临时切换模型</td></tr>
          <tr><td>笔记库目录</td><td>本地笔记库路径，知识浏览与 AI 检索共用</td></tr>
          <tr><td>嵌入模型</td><td>语义检索用的向量模型（Ollama 或 OpenAI 兼容 API）</td></tr>
          <tr><td>笔记库索引配置</td><td>配置索引时排除的目录和文件（支持通配符）</td></tr>
          <tr><td>定时任务</td><td>管理内置定时任务（日报生成、自动索引等），支持飞书通知</td></tr>
          <tr><td>飞书 Webhook</td><td>消息推送 URL，用于发送日报和提醒到飞书群</td></tr>
          <tr><td>飞书 Bot</td><td>App ID / Secret，WebSocket 长连接接收消息，可在飞书内直接对话</td></tr>
          <tr><td>日报设置</td><td>每日 AI 综合日报，自定义提示词和保留天数</td></tr>
        </table>
      </div>

      <div class="card">
        <h2>❓ 常见问题</h2>
        <table class="help-table">
          <tr><th>问题</th><th>原因</th><th>解决</th></tr>
          <tr><td>对话为空或超时</td><td>pi agent 未安装或模型未配置</td><td>运行 <code>npm install -g @earendil-works/pi-coding-agent</code>，然后 <code>pi</code> 配置模型</td></tr>
          <tr><td>语义搜索无结果</td><td>笔记库未索引或嵌入模型未配置</td><td>在知识库「概览」Tab 点击索引按钮，检查设置页嵌入模型配置</td></tr>
          <tr><td>索引失败</td><td>嵌入模型服务未启动或地址错误</td><td>确认 Ollama 运行中或 API 地址正确，在设置页点「测试连接」</td></tr>
          <tr><td>飞书消息收不到</td><td>Webhook 或 Bot 配置有误</td><td>在设置页检查飞书配置，点「测试」验证</td></tr>
          <tr><td>定时任务未执行</td><td>调度器未开启</td><td>在设置页确认调度器运行中，检查任务是否已启用</td></tr>
          <tr><td>可以完全离线使用吗</td><td>—</td><td>可以。对话模型和嵌入模型都配置为 Ollama 本地模型即可完全离线</td></tr>
          <tr><td>AI 答非所问，没有用到笔记</td><td>知识库未索引或未配置嵌入模型</td><td>在知识库「概览」Tab 点击索引按钮，检查嵌入模型配置</td></tr>
          <tr><td>提示"模型连接失败"</td><td>pi agent 模型配置有误或 Ollama 未启动</td><td>运行 <code>pi</code> 检查配置，Ollama 需先 <code>ollama pull</code> 模型并确保服务运行</td></tr>
          <tr><td>数据会丢失吗</td><td>—</td><td>数据保存在本机数据库，正常退出不丢失；建议定期备份 <code>memory.db</code> 和笔记目录</td></tr>
        </table>
      </div>

      <div class="card">
        <h2>🔒 数据与隐私</h2>
        <ul>
          <li>所有数据保存在应用目录下的本地数据库（<code>memory.db</code>）与你的笔记文件夹中，不上传任何云端</li>
          <li>对话内容默认会发送给你配置的模型服务商（DeepSeek 等）用于生成回复</li>
          <li>如需<strong>完全离线</strong>：使用 Ollama 作为对话模型与嵌入模型即可（除软件自动更新外无任何网络请求）</li>
          <li>建议定期备份 <code>memory.db</code> 和笔记目录，后续版本将提供一键备份/恢复</li>
        </ul>
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

.card ol li {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-primary);
}

.card-prereq {
  border-color: var(--primary);
  background: linear-gradient(135deg, #fafaff 0%, #f5f3ff 100%);
}

.prereq-item {
  display: flex;
  gap: 14px;
  margin-bottom: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}

.prereq-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.prereq-number {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.prereq-content {
  flex: 1;
  min-width: 0;
}

.prereq-content strong {
  font-size: 14px;
  color: var(--text-primary);
  display: block;
  margin-bottom: 4px;
}

.prereq-content .code-block {
  margin: 6px 0;
}

.prereq-content ul {
  padding-left: 16px;
  margin: 4px 0;
}

.prereq-content ul li {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  margin-bottom: 1px;
}
</style>