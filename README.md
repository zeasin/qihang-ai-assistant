# 个人本地知识库 AI 助理

> 本地知识库 + 数据集 + 提醒 + AI 的综合个人助手，所有数据保存在本地，不依赖外部服务。

基于 Vue 3 + Electron + LangChain 的桌面应用，将笔记库、结构化数据、定时提醒与 AI 智能体融为一体，所有数据在本机 SQLite 中存储，通过本地模型或 API 完成 AI 推理。

---

## 核心能力

| 模块 | 能力 |
|------|------|
| **📚 本地知识库** | 管理 Markdown 笔记/文档目录树，全文索引 + 向量语义检索（RAG），AI 问答 |
| **📊 数据集** | 结构化数据管理（客户/项目/Bug 等），Excel/JSON 批量导入导出，AI 智能填充 |
| **⏰ 提醒** | 待办看板 + 定时提醒（桌面通知/飞书推送），支持优先级和截止日期 |
| **🤖 AI 智能体** | 多模型支持（DeepSeek / Ollama / OpenAI 兼容），工具调用（查数据/搜笔记/操作文件），流式对话 |
| **🔗 飞书集成** | Webhook 消息推送 + Bot 实时消息接收回复 |
| **📋 综合日报** | 每日自动汇总笔记库生成 AI 日报，定时推送到飞书 |

## 页面概览

| 菜单 | 功能 |
|------|------|
| **概览** | 全局看板：数据统计、语义搜索、笔记库索引管理 |
| **工作台** | AI 对话工作台：多模型切换、流式输出、工具调用 |
| **知识库** | Markdown 笔记浏览、目录树、编辑器、全文索引与语义搜索 |
| **数据** | 多数据集管理，Excel/JSON 批量导入导出，AI 智能填充 |
| **任务** | 待办看板 + 定时提醒统一管理 |
| **工具箱** | 图片识别、识题、Markdown 预览等工具 |
| **设置** | 系统配置：LLM 模型、嵌入模型、飞书、定时任务等 |

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                   个人本地知识库 AI 助理                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Vue 3 前端 (渲染进程)                             │  │
│  │  ┌─────────┐ ┌────────┐ ┌───────┐ ┌───────────┐  │  │
│  │  │  概览   │ │ 工作台 │ │知识库 │ │  数据/任务 │  │  │
│  │  └────┬────┘ └───┬────┘ └───┬───┘ └─────┬─────┘  │  │
│  │       └──────────┼──────────┼───────────┘         │  │
│  │            ┌─────▼──────────▼──────┐               │  │
│  │            │  electronAPI (IPC)    │               │  │
│  │            └──────────┬────────────┘               │  │
│  └───────────────────────┼────────────────────────────┘  │
│                          │                               │
│  ┌──────────────────────▼────────────────────────────┐  │
│  │  Electron 主进程                                   │  │
│  │  ├─ database.js    — SQLite（本地数据持久化）       │  │
│  │  ├─ rag.js         — 语义检索（BM25 + 向量混合）    │  │
│  │  ├─ agent.js      — AI 智能体（工具循环/流式输出）   │  │
│  │  ├─ orchestrator.js— AI 编排引擎（LangChain）       │  │
│  │  ├─ llm.js        — 模型工厂（多模型配置）           │  │
│  │  ├─ tools.js      — 工具定义（数据集/知识库/文件）   │  │
│  │  ├─ scheduler.js   — 定时任务调度器                 │  │
│  │  ├─ indexer.js     — 文件索引与向量嵌入             │  │
│  │  ├─ feishu.js      — 飞书集成                     │  │
│  │  └─ httpserver.js  — HTTP 远程管理                 │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

所有数据通过 Electron IPC 在主进程与渲染进程之间通信，不依赖外部后端服务。

## 前置条件

```bash
# 安装依赖
npm install

# 启动 Electron 桌面应用
npm run electron:dev
```

## 项目结构

```
├── electron/                  # Electron 主进程（后端服务）
│   ├── main.js                # 主进程入口
│   ├── preload.js             # 预加载脚本（IPC 桥接）
│   └── services/
│       ├── database.js        # SQLite 数据库操作
│       ├── rag.js             # RAG 语义检索
│       ├── agent.js           # AI 智能体执行器
│       ├── orchestrator.js    # AI 编排引擎
│       ├── llm.js             # 模型工厂
│       ├── tools.js           # 工具定义
│       ├── scheduler.js       # 定时任务调度器
│       ├── indexer.js         # 文件索引与向量嵌入
│       ├── feishu.js          # 飞书集成
│       ├── feishu-router.js   # 飞书消息路由
│       ├── httpserver.js      # HTTP 远程管理
│       ├── index-worker.js    # 索引子进程
│       └── logger.js          # 日志工具
├── src/                       # 渲染进程（Vue 3 SPA）
│   ├── components/
│   ├── views/
│   │   ├── InsightsView.vue   # 概览
│   │   ├── ProjectWorkbenchView.vue  # 工作台
│   │   ├── NotesView.vue      # 知识库
│   │   ├── DataView.vue       # 数据
│   │   ├── PlannerView.vue    # 任务
│   │   ├── ToolsView.vue      # 工具箱
│   │   ├── ConfigView.vue     # 设置
│   │   ├── LogView.vue        # 日志
│   │   └── HelpView.vue       # 帮助
│   ├── router/index.ts
│   ├── stores/
│   ├── styles/
│   ├── App.vue
│   └── main.ts
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig*.json
```

## 开发命令

```bash
# 安装依赖
npm install

# 启动 Electron 桌面应用
npm run electron:dev

# 仅启动前端开发服务器（浏览器调试）
npm run dev

# 构建前端静态文件
npm run build

# 构建 Electron 安装包
npm run electron:build
```

## 技术栈

- **前端框架**: Vue 3 + TypeScript
- **桌面框架**: Electron
- **数据库**: SQLite（sql.js）
- **AI 引擎**: LangChain.js（@langchain/openai + @langchain/ollama）
- **语义检索**: BM25 + 向量混合检索（本地 Ollama bge-m3 / OpenAI 兼容 API）
- **多模型**: 支持 DeepSeek / Ollama / OpenAI 兼容端点，设置页管理多模型配置
- **飞书集成**: Webhook + WebSocket Bot
- **定时任务**: node-cron
