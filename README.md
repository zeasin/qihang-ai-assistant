# 启航AI工作台 - Electron 桌面应用

基于 Vue 3 + Electron 的 AI 桌面工作台，集成笔记对话、AI 编程、知识库管理、任务规划与数据中心。

---

## 项目架构

```
┌──────────────────────────────────────────────────────────┐
│              启航AI工作台 (Electron)                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Vue 3 SPA (渲染进程)                              │  │
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
│  │  Electron Main Process                            │  │
│  │  ├─ database.js    — SQLite 数据层                │  │
│  │  ├─ scheduler.js   — 定时任务调度器               │  │
│  │  ├─ indexer.js     — 文件索引与向量嵌入           │  │
│  │  ├─ orchestrator.js— AI 编排引擎                  │  │
│  │  ├─ rag.js         — 语义检索                     │  │
│  │  ├─ feishu.js      — 飞书集成（Bot + Webhook）    │  │
│  │  ├─ httpserver.js  — HTTP 远程管理服务             │  │
│  │  ├─ pi-agent.js    — PI Coding Agent 集成         │  │
│  │  ├─ opencode.js    — opencode SDK 集成             │  │
│  │  ├─ claude-code.js — Claude Agent SDK 集成         │  │
│  │  └─ feishu-router.js—飞书消息路由                  │  │
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
├── electron/                  # Electron 主进程
│   ├── main.js                # 主进程入口（编译后）
│   ├── main.ts                # 主进程源码
│   ├── preload.js             # 预加载脚本（编译后）
│   ├── preload.ts             # 预加载脚本源码
│   └── services/              # 后端服务
│       ├── database.js        # SQLite 数据库操作
│       ├── scheduler.js       # 定时任务调度器
│       ├── indexer.js         # 文件索引与向量嵌入
│       ├── orchestrator.js    # AI 编排引擎
│       ├── rag.js             # RAG 语义检索
│       ├── feishu.js          # 飞书集成
│       ├── feishu-router.js   # 飞书消息路由
│       ├── httpserver.js      # HTTP 远程管理
│       ├── pi-agent.js        # PI Agent 集成
│       ├── opencode.js        # opencode SDK 集成
│       ├── claude-code.js     # Claude Agent 集成
│       ├── index-worker.js    # 索引子进程
│       └── logger.js          # 日志工具
├── src/                       # 渲染进程（Vue 3 SPA）
│   ├── components/
│   │   ├── AppSidebar.vue     # 侧边栏导航
│   │   └── TreeNode.vue       # 树形节点组件
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
│   ├── router/index.ts        # 路由配置
│   ├── stores/                # Pinia 状态管理
│   ├── styles/                # 全局样式
│   ├── App.vue                # 根组件
│   └── main.ts                # Vue 入口
├── index.html                 # HTML 入口
├── package.json               # 项目配置
├── vite.config.ts             # Vite 配置
└── tsconfig*.json             # TypeScript 配置
```

## 页面功能

| 菜单 | 功能 |
|------|------|
| **概览** | 全局看板：数据统计、语义搜索、笔记库索引管理 |
| **工作台** | AI 编程 + 笔记对话工作台：项目树管理、会话管理、多 Agent 切换、流式对话 |
| **知识库** | Markdown 笔记/代码文件浏览、目录树、编辑器、Zen 模式、全文索引与语义搜索 |
| **数据** | 多数据集管理，Excel/JSON 批量导入导出，AI 智能填充 |
| **任务** | 待办看板 + 定时提醒统一管理，支持优先级和截止日期 |
| **工具箱** | 图片识别、识题、Markdown 预览等工具 |
| **设置** | 系统配置：LLM 模型、嵌入模型、Agent、飞书、定时任务等 |

## 开发命令

```bash
# 安装依赖
npm install

# 【推荐】启动 Electron 桌面应用（Vite + Electron 同时启动）
npm run electron:dev

# 仅启动前端开发服务器（浏览器调试用）
npm run dev

# 构建前端静态文件
npm run build

# 构建 Electron 安装包
npm run electron:build
```

> 首次使用或修改 `electron/*.ts` 文件后，需要编译主进程 TypeScript：
> ```bash
> npx tsc -p tsconfig.main.json
> ```

## 技术栈

- **前端框架**: Vue 3 + TypeScript
- **构建工具**: Vite
- **桌面框架**: Electron
- **状态管理**: Pinia
- **路由**: Vue Router
- **数据库**: SQLite（better-sqlite3）
- **AI Agent**: pi-coding-agent / opencode SDK / claude-agent-sdk
- **语义检索**: Ollama / OpenAI 兼容 API
- **飞书集成**: Webhook + WebSocket Bot
- **Markdown 渲染**: marked + highlight.js + KaTeX
- **定时任务**: node-cron

## 定时任务

系统内置定时任务调度器，支持以下任务类型：

- **综合日报** - 每天早上按笔记库自动生成 AI 综合日报
- **自动索引** - 定时触发知识库文件索引与向量嵌入
- **定时提醒** - 自定义 cron 表达式的飞书/桌面通知

系统启动时会自动扫描所有笔记库项目，为缺少日报任务的项目自动补填。
