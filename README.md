# 启航AI工作台 - Electron 桌面应用

基于 Vue 3 + Electron 的桌面应用，数据通过 Electron IPC 与主进程通信获取。

---

## 项目架构

```
┌──────────────────────────────────────────────┐
│           biling-ai (Electron)               │
│  ┌────────────────────────────────────────┐  │
│  │  Vue 3 SPA                            │  │
│  │  - ChatView  NotesView  ...           │  │
│  │  └── electronAPI (IPC) ────┐          │  │
│  └────────────────────────────┼───────────┘  │
│                               │              │
│  ┌────────────────────────────▼───────────┐  │
│  │  Electron Main Process                │  │
│  │  - SQLite (database.js)               │  │
│  │  - Scheduler (scheduler.js)           │  │
│  │  - Indexer (indexer.js)              │  │
│  │  - RAG (rag.js)                      │  │
│  │  - Feishu Bot (feishu.js)            │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

数据通过 Electron 的 IPC 机制在渲染进程和主进程之间通信，不依赖外部后端服务。部分页面（数据中心、洞察、任务提醒）的 API 数据源已移除，呈现实体为空状态。

## 前置条件

```bash
# 安装依赖
npm install

# 启动 Electron 桌面应用
npm run electron:dev

# 仅启动前端开发服务器（浏览器调试用，数据不可用）
npm run dev
```

## 项目结构

```
biling-ai/
├── electron/              # Electron 主进程
│   ├── main.ts           # 主进程入口
│   └── preload.ts        # 预加载脚本
├── src/
│   ├── components/        # 公共组件
│   │   └── AppSidebar.vue
│   ├── views/             # 页面组件
│   │   ├── ChatView.vue      # 对话页面
│   │   ├── NotesView.vue     # 笔记页面
│   │   ├── DataView.vue      # 数据中心
│   │   ├── DataModuleView.vue # 数据模块详情
│   │   ├── InsightsView.vue  # 洞察页面
│   │   ├── PlannerView.vue   # 任务提醒
│   │   └── ToolsView.vue     # 工具页面
│   ├── router/            # 路由配置
│   ├── stores/            # Pinia 状态管理
│   ├── styles/            # 全局样式
│   ├── App.vue            # 根组件
│   └── main.ts            # Vue 入口
├── docs/
│   └── api-endpoints.md   # 后端 API 接口清单
├── index.html             # HTML 入口
├── package.json           # 项目配置
├── vite.config.ts         # Vite 配置
└── tsconfig.json          # TypeScript 配置
```

数据通过 Electron IPC 获取，不依赖外部后端服务。

## 页面功能

1. **对话 (Chat)** - 与 AI 对话，支持 @笔记库 知识库问答（SSE 流式）
2. **笔记 (Notes)** - 查看和管理笔记文件（Markdown 渲染）
3. **数据中心 (Data)** - 管理数据模块、数据集、记录（含导入导出）
4. **洞察 (Insights)** - 数据统计、智能搜索、知识标签、热力图
5. **任务提醒 (Planner)** - 任务看板和定时提醒
6. **工具 (Tools)** - 导出、备份等工具

## 开发命令

```bash
# 安装依赖
npm install

# 【推荐】启动 Electron 桌面应用（同时启动 Vite + Electron）
npm run electron:dev

# 仅启动 Vue 前端开发服务器（浏览器调试用，不启动 Electron 窗口）
npm run dev

# 构建前端静态文件
npm run build

# 构建 Electron 安装包（生成 exe/dmg/AppImage）
npm run electron:build
```

> 首次使用前先编译 Electron 主进程 TypeScript 文件：
> ```bash
> npx tsc -p tsconfig.main.json
> ```
>
> 之后如果修改了 `electron/main.ts` 或 `electron/preload.ts`，需要重新编译。

## 技术栈

- **前端框架**: Vue 3 + TypeScript
- **构建工具**: Vite
- **桌面框架**: Electron
- **状态管理**: Pinia
- **路由**: Vue Router
- **Markdown 渲染**: marked
- **数据来源**: Electron IPC + SQLite

## 迁移说明

本项目从 assistan-v2 的 Thymeleaf 模板迁移而来，主要变更：

1. 将 HTML 模板转换为 Vue 单文件组件
2. 将内联 JavaScript 改为 Vue Composition API + TypeScript
3. 将 CSS 变量提取到全局样式
4. 添加路由（Vue Router）和状态管理（Pinia）
5. 集成 Electron 桌面框架
