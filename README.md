# 笔灵 AI - Electron 桌面应用

基于 Vue 3 + Electron 的桌面应用，数据来源于 **assistant-v2 项目的 Java Spring Boot 后端接口**。

---

## 项目架构

```
┌─────────────────────────────────────────────────┐
│              biling-ai (Electron)               │
│  ┌───────────────────────────────────────────┐  │
│  │  Vue 3 SPA                                │  │
│  │  - ChatView  NotesView  DataView ...      │  │
│  │  └── fetch() ────┐                        │  │
│  └──────────────────┼────────────────────────┘  │
│                     │  HTTP (port 15173)                    │
│  ┌──────────────────┼────────────────────────┐  │
│  │  Vite Dev Server │ proxy                  │  │
│  │  /api/* ────────►┼──── localhost:6790     │  │
│  └──────────────────┼────────────────────────┘  │
└─────────────────────┼───────────────────────────┘
                      │
         ┌────────────▼─────────────────┐
         │  assistant-v2 (Java Backend)  │
         │  Spring Boot :6790           │
         │  - ChatController            │
         │  - DataApiController         │
         │  - AiOverviewApiController   │
         │  - NotesApiController        │
         │  - PlannerApiController      │
         └──────────────────────────────┘
```

前端通过 HTTP 请求调用 Java 后端接口获取数据，Vite 开发服务器自动将 `/api` 和 `/v3` 路径代理转发到后端 6790 端口。

## 前置条件

需要同时运行 **Java 后端服务** 才能获取数据：

```bash
# 启动后端 (assistant-v2 项目)
cd D:\projects\assistant-v2
mvn spring-boot:run    # 默认端口 6790

# 启动前端 (本项目的 Electron 应用)
cd D:\projects\biling-ai
npm run electron:dev   # Vite 端口 15173
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
│   ├── views/             # 页面组件（数据均来自后端 API）
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
├── vite.config.ts         # Vite 配置（含 API 代理）
└── tsconfig.json          # TypeScript 配置
```

## 后端接口

所有页面数据来源于 Java 后端的 REST API，Vite 配置了代理转发（将 `/api` 和 `/v3` 请求转发到后端 6790 端口）：

```ts
// vite.config.ts
server: {
  port: 15173,
  proxy: {
    '/api': { target: 'http://localhost:6790', changeOrigin: true },
    '/v3':  { target: 'http://localhost:6790', changeOrigin: true }
  }
}
```

完整接口清单见 [`docs/api-endpoints.md`](docs/api-endpoints.md)，涵盖：

| 模块 | 接口数量 | 说明 |
|------|---------|------|
| 对话 | 5 个 | 笔记库列表、模型列表、对话历史、SSE 发送、清空 |
| 数据中心 | 19 个 | 模块/数据集/记录 CRUD、数据导入、AI 分析 |
| 洞察 | 7 个 | 统计、搜索、项目分析、标签、热力图、快捷操作 |
| 笔记 | 2 个 | 文件树、文件读取 |
| 任务提醒 | 9 个 | 任务/提醒 CRUD |
| 工具箱 | 1 个 | 工具列表（可选） |

> ⚠️ 后端必须先启动，前端才能正常加载数据。

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
- **数据来源**: assistant-v2 Java Spring Boot 后端 (端口 6790)

## 迁移说明

本项目从 assistan-v2 的 Thymeleaf 模板迁移而来，主要变更：

1. 将 HTML 模板转换为 Vue 单文件组件
2. 将内联 JavaScript 改为 Vue Composition API + TypeScript
3. 将 CSS 变量提取到全局样式
4. 添加路由（Vue Router）和状态管理（Pinia）
5. 集成 Electron 桌面框架
6. 所有数据请求从服务端渲染改为 REST API 调用
