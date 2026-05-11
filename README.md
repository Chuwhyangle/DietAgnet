# Diet Agent

一个基于 Electron + React + TypeScript 的桌面端饮食管理应用，围绕“猫猫虫”这个 AI 饮食小助手设计。项目把菜谱浏览、饮食记录、营养统计、AI 对话和引导式饮食计划整合在一个本地优先的桌面应用里，适合个人日常使用。

## 功能亮点

- 菜谱浏览：内置 50 道菜谱，支持分类筛选、关键词搜索和详情查看。
- 饮食记录：按早餐、午餐、晚餐、加餐记录每天摄入，自动汇总热量与宏量营养素。
- 每周统计：基于所选日期生成 7 日摄入分布、完成度和目标命中情况。
- AI 对话：内置“猫猫虫”聊天入口，可通过兼容 OpenAI Chat Completions 的模型服务执行工具调用。
- AI 引导式计划：逐步采集年龄、身高、体重、目标、作息与偏好，生成专属饮食计划。
- 异常追问与审计：对异常 BMI、目标差距、餐次等情况继续追问，并保留计划版本对比。
- 本地优先：设置、饮食记录、聊天记录和计划数据都存本地，不依赖后端服务。
- 首次引导：新用户首次启动时会进入欢迎流程，帮助快速完成基础设置。

## 技术栈

- Electron 33
- React 18
- TypeScript 5
- electron-vite
- Ant Design 5
- React Router 6
- Dexie
- Day.js

## 快速开始

### 环境要求

- Node.js 20 或更新的 LTS 版本
- npm

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

### 构建应用

```bash
npm run build
```

### 打包桌面应用

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Electron + Vite 开发模式 |
| `npm run build` | 构建主进程、预加载脚本和渲染进程 |
| `npm run preview` | 预览生产构建 |
| `npm run start` | 等同于 `npm run preview` |
| `npm run build:win` | 构建并打包 Windows 安装包 |
| `npm run build:mac` | 构建并打包 macOS 应用 |
| `npm run build:linux` | 构建并打包 Linux 应用 |

## AI 对话配置

项目内置了一个猫猫虫 Agent，对接的是 OpenAI Chat Completions 兼容接口。目前支持：

- DeepSeek
- 通义千问
- 自定义兼容接口

配置方式：

1. 打开应用的“设置”页。
2. 在“AI 对话设置”里选择模型提供商。
3. 填写或确认 `Base URL / Endpoint` 与 `Model`。
4. 输入对应的 API Key。
5. 点击“测试连接”验证普通对话和 Tool Call 是否可用。

说明：

- API Key 不写入渲染进程 `localStorage`。
- API Key 由 Electron 主进程通过 `safeStorage` 加密保存。
- 自定义通道既支持填写基础地址，也支持直接填写完整的 `/chat/completions` 地址。

## 数据存储

项目当前采用本地存储方案，不依赖后端：

- 用户设置：`localStorage`
- 饮食记录：`localStorage`
- 聊天记录：`localStorage`
- AI 引导式计划与版本审计：Dexie 数据库 `diet-agent-planning`
- API Key：Electron 主进程安全存储

这意味着项目默认更偏向单机使用，当前不包含账号系统、云同步和后端服务。

## 主要页面

- 首页：今日摄入统计、计划主线入口、当前档案状态和最新专属计划概览
- 菜谱：浏览、筛选、搜索和查看菜谱详情
- 饮食记录：记录餐次、查看日汇总和周报
- AI 对话：与猫猫虫自然对话，调用应用内工具完成查看、记录和推荐
- 设置：昵称、每日热量目标、AI 通道配置与连接诊断

## 项目结构

```text
Diet Agent/
├─ docs/
│  ├─ PRD.md
│  ├─ agent-chat-design.md
│  ├─ development-log.md
│  └─ planning-flow-design.md
├─ resources/
├─ src/
│  ├─ main/          # Electron 主进程
│  ├─ preload/       # preload / IPC bridge
│  ├─ renderer/      # React 前端
│  └─ shared/        # 主进程与渲染进程共享类型
├─ electron.vite.config.ts
├─ package.json
└─ tsconfig.json
```

## 相关文档

- [产品需求文档](./docs/PRD.md)
- [Agent 对话设计](./docs/agent-chat-design.md)
- [AI 引导式计划设计](./docs/planning-flow-design.md)
- [开发日志](./docs/development-log.md)

## 当前范围

当前代码库聚焦桌面端 MVP 和本地优先能力，以下内容暂未包含：

- 用户注册与登录
- 云端同步
- 后端服务
- 移动端或 Web 版
- 图片识别食物

## 致谢

菜谱数据整理参考了 [HowToCook](https://github.com/Anduin2017/HowToCook) 开源项目，并结合当前应用的数据结构做了本地化整理。
