# 笔灵 AI - Electron 桌面应用

基于 Vue 3 + Electron 的桌面应用，迁移自 assistan-v2 项目。

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
├── index.html             # HTML 入口
├── package.json           # 项目配置
├── vite.config.ts         # Vite 配置
└── tsconfig.json          # TypeScript 配置
```

## 页面功能

1. **对话 (Chat)** - 与 AI 对话，支持 @笔记库 知识库问答
2. **笔记 (Notes)** - 查看和管理笔记文件
3. **数据中心 (Data)** - 管理数据模块
4. **洞察 (Insights)** - 数据统计和知识库搜索
5. **任务提醒 (Planner)** - 任务看板和定时提醒
6. **工具 (Tools)** - 导出、备份等工具

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建项目
npm run build

# 构建 Electron 应用
npm run electron:build
```

## 技术栈

- **前端框架**: Vue 3 + TypeScript
- **构建工具**: Vite
- **桌面框架**: Electron
- **状态管理**: Pinia
- **路由**: Vue Router
- **Markdown**: marked
- **数学公式**: KaTeX

## 迁移说明

本项目从 assistan-v2 的 Thymeleaf 模板迁移而来，主要变更：

1. 将 HTML 模板转换为 Vue 单文件组件
2. 将内联 JavaScript 改为 Vue Composition API
3. 将 CSS 变量提取到全局样式
4. 添加路由和状态管理
5. 集成 Electron 桌面框架
