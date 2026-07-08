# 笔灵 AI - API 端点清单

> 前端发起的所有 API 请求路径，后端 Spring Boot 端口 **6790**。

---

## 1. 对话模块 (`/api/chat`)

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `GET` | `/api/chat/kbs` | 无 | 获取笔记库列表 |
| `GET` | `/api/chat/models` | 无 | 获取模型列表（含默认模型） |
| `GET` | `/api/chat/messages` | `kbId`, `offset`, `limit` | 获取对话历史 |
| `POST` | `/api/chat/send` | FormData: `message`, `kbId`, `modelName`, `mode` | 发送消息（SSE 流式返回） |
| `DELETE` | `/api/chat/clear` | `kbId` | 清空对话 |
| `GET` | `/api/chat/search` | `kbId`, `q`, `limit` | 搜索消息 |
| `GET` | `/api/chat/export` | `kbId` | 导出对话（Markdown 格式） |

## 2. 数据中心 (`/api/datacenter`)

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `GET` | `/api/datacenter/modules` | 无 | 模块列表 |
| `POST` | `/api/datacenter/modules` | `name`, `description`, `icon` | 新建模块 |
| `GET` | `/api/datacenter/modules/{id}` | 无 | 获取模块 |
| `PUT` | `/api/datacenter/modules/{id}` | `name`, `description`, `icon`, `sortOrder` | 编辑模块 |
| `DELETE` | `/api/datacenter/modules/{id}` | 无 | 删除模块 |
| `GET` | `/api/datacenter/modules/{id}/datasets` | 无 | 获取模块下的数据集列表 |
| `GET` | `/api/datacenter/datasets` | 无 | 全量数据集列表 |
| `GET` | `/api/datacenter/datasets/{id}` | 无 | 获取数据集 |
| `POST` | `/api/datacenter/datasets` | JSON: DataSet 对象 | 新建数据集 |
| `PUT` | `/api/datacenter/datasets/{id}` | JSON: DataSet 对象 | 编辑数据集 |
| `DELETE` | `/api/datacenter/datasets/{id}` | 无 | 删除数据集 |
| `GET` | `/api/datacenter/datasets/{id}/records` | `page`, `size`, `keyword` | 记录列表 |
| `PUT` | `/api/datacenter/datasets/{id}/records/{recordId}` | JSON: `{data: {...}}` | 更新记录 |
| `DELETE` | `/api/datacenter/datasets/{id}/records/{recordId}` | 无 | 删除记录 |
| `PATCH` | `/api/datacenter/datasets/{id}/records/{recordId}/status` | `status` | 更新记录状态 |
| `POST` | `/api/datacenter/datasets/{id}/import/excel` | `file`, `mapping`, `useAi` | Excel 导入 |
| `POST` | `/api/datacenter/datasets/import/excel/preview` | `file` | Excel 预览 |
| `POST` | `/api/datacenter/datasets/{id}/import/json` | JSON: `{data: [...], useAi: boolean}` | JSON 导入 |
| `POST` | `/api/datacenter/datasets/{id}/import/url` | JSON: `{url: string}` | URL 导入 |
| `POST` | `/api/datacenter/datasets/{id}/export` | JSON: `{dir: string, recordIds: [...], prompt: string}` | 导出数据 |
| `GET` | `/api/datacenter/modules/{moduleId}/analysis` | 无 | 获取 AI 分析（缓存） |
| `POST` | `/api/datacenter/modules/{moduleId}/analysis` | JSON: `{datasets: [...]}` | 生成 AI 分析 |
| `DELETE` | `/api/datacenter/modules/{moduleId}/analysis` | 无 | 清除 AI 分析缓存 |
| `POST` | `/api/datacenter/llm/chat` | JSON: `{system, user}` | LLM 对话 |
| `GET` | `/api/datacenter/directories` | `kbId` | 获取目录列表 |

## 3. AI 洞察 (`/api/ai`)

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `GET` | `/api/ai/kb-stats` | `kbId` | 笔记库统计 |
| `GET` | `/api/ai/search` | `kbId`, `query`, `limit` | 智能搜索（混合检索） |
| `GET` | `/api/ai/projects` | `kbId` | 子项目列表 |
| `GET` | `/api/ai/tags` | `kbId` | 标签云 |
| `GET` | `/api/ai/heatmap` | `kbId` | 热力图（日期分布） |
| `POST` | `/api/ai/analyze-project` | `kbId`, `projectName` | 分析项目 |
| `POST` | `/api/ai/quick-action` | `kbId`, `action` | 快速操作（summarize-week/extract-key-points/generate-review-plan/find-related） |

## 4. 笔记 (`/v3/api/notes`)

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `GET` | `/v3/api/notes/tree` | `kbId` | 文件树 |
| `GET` | `/v3/api/notes/read` | `kbId`, `path` | 读取笔记（Markdown） |

## 5. 任务提醒 (`/api/tasks`, `/api/reminders`)

### 任务

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `GET` | `/api/tasks` | `kbId` | 任务列表 |
| `POST` | `/api/tasks/add` | `kbId`, `title`, `description`, `priority`, `dueDate` | 新增任务 |
| `POST` | `/api/tasks/update` | `kbId`, `id`, `title`, `description`, `status`, `priority`, `dueDate` | 更新任务 |
| `POST` | `/api/tasks/delete` | `kbId`, `id` | 删除任务 |

### 提醒

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `GET` | `/api/reminders` | `kbId` | 提醒列表 |
| `POST` | `/api/reminders/add` | `kbId`, `name`, `message`, `type`, `time`, `date`, `dayOfWeek`, `dayOfMonth`, `monthDay` | 新增提醒 |
| `POST` | `/api/reminders/update` | `kbId`, `id`, `name`, `message`, `type`, `time`, `date`, `dayOfWeek`, `dayOfMonth`, `monthDay`, `enabled` | 更新提醒 |
| `POST` | `/api/reminders/delete` | `kbId`, `id` | 删除提醒 |
| `POST` | `/api/reminders/toggle` | `kbId`, `id` | 开关提醒 |
| `POST` | `/api/reminders/trigger` | `kbId`, `id` | 手动触发提醒 |

## 6. 配置 (`/api/config`)

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `GET` | `/api/config` | 无 | 获取配置 |
| `POST` | `/api/config/webhook` | `url` | 更新飞书 Webhook URL |
| `POST` | `/api/config/notesDir` | `notesDir` | 更新笔记库根目录 |
| `POST` | `/api/config/coding` | `appId`, `appSecret`, `chatId`, `projectDir`, `enabled`, `timeout` | 更新编程 AI 配置 |
| `POST` | `/api/config/feishu` | `appId`, `appSecret`, `chatId`, `pollingEnabled` | 更新飞书消息接收配置 |
| `POST` | `/api/config/feishu/chats` | `appId`, `appSecret` | 获取飞书聊天列表 |
| `POST` | `/api/config/feishu/test` | `appId`, `appSecret`, `chatId` | 测试飞书消息 |
| `GET` | `/api/config/labels` | 无 | 获取字段标签映射 |
| `POST` | `/api/config/labels` | JSON: `{key: value}` | 更新字段标签映射 |
| `POST` | `/api/config/ai-provider` | `provider` | 更新 AI 引擎（仅支持 direct） |
| `POST` | `/api/config/llm` | JSON: `{apiKey, baseUrl, model, timeout}` | 更新 LLM 配置 |
| `GET` | `/api/config/llm-profiles` | 无 | 获取模型列表 |
| `POST` | `/api/config/llm-profiles` | JSON: LlmProfileEntity | 保存模型配置 |
| `DELETE` | `/api/config/llm-profiles/{id}` | 无 | 删除模型 |
| `POST` | `/api/config/llm-profiles/{id}/default` | 无 | 设置默认模型 |
| `GET` | `/api/config/embedding-model` | 无 | 获取向量模型配置 |
| `POST` | `/api/config/embedding-model` | JSON: `{model, baseUrl, apiKey, provider}` | 更新向量模型配置 |
| `GET` | `/api/ollama/status` | 无 | Ollama 状态 |

## 7. 数据文件 (`/api/data`)

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `GET` | `/api/data/list` | `kbId`, `dir` | 获取目录下的 JSON 文件列表 |
| `GET` | `/api/data/column-settings` | `type` | 获取字段设置 |
| `POST` | `/api/data/column-settings` | `type`, JSON: `{column: [fields]}` | 保存字段设置 |

## 8. 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |

---

## 页面路由

| 路径 | 说明 |
|------|------|
| `/` | 首页（工作台） |
| `/chat` | 3.0 聊天页面 |
| `/v1/chat` | 1.0 聊天页面 |
| `/kb/{id}/chat` | 2.0 聊天页面（通过笔记库访问） |
| `/v1` | 重定向到首页 |
| `/config` | 配置页面 |
| `/coding` | 编程 AI 页面 |
| `/log` | 日志页面 |
| `/help` | 帮助页面 |