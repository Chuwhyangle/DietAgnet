# Diet Agent

一个基于 Electron + React + TypeScript 的桌面端饮食管理应用，围绕"猫猫虫"这个 AI 饮食小助手设计。项目把菜谱浏览、饮食记录、营养统计、AI 对话和引导式饮食计划整合在一个本地优先的桌面应用里，适合个人日常使用。

当前项目已经完成桌面端 MVP 和 AI 引导式计划主线。下一阶段的产品方向，是让猫猫虫从"用户问才回答"的助手，升级为"能观察记录、判断偏差、主动建议"的饮食教练。

## 📚 Assignment 2 评审入口

如果你是来评审作业的，建议按下面顺序阅读：

1. [`docs/assignment-report.md`](./docs/assignment-report.md) — Rubric 逐条对应 + Agentic 能力矩阵（10 分钟看完）
2. [`docs/architecture.md`](./docs/architecture.md) — 系统架构 + Mermaid 时序图
3. [`docs/evaluation.md`](./docs/evaluation.md) — 8 个示例任务 + 失败案例 + 性能数据
4. [`docs/critical-reflection.md`](./docs/critical-reflection.md) — 限制、失败模式、设计取舍、未来改进
5. 跑通 `npm install && npm run dev` 后参考 [§5 分钟 demo 跑通](#5-分钟-demo-跑通) 复现核心场景

## 🎬 Demo Video

- [2-minute demo video](https://raw.githubusercontent.com/Chuwhyangle/DietAgnet/main/docs/demo/diet-agent-demo.mp4)
- [Subtitle file (.srt)](./docs/demo/diet-agent-demo.srt)

视频展示了 Diet Agent 的核心目标和工作流程：降低饮食记录成本、根据个人计划记录餐食、保存长期记忆，并结合当天摄入情况给出个性化建议。

## ✅ Reproduction Instructions

```bash
git clone https://github.com/Chuwhyangle/DietAgnet.git
cd DietAgnet
npm install
npm run dev
```

运行后可按以下步骤复现视频中的核心功能：

1. 在 Home 页面查看每日热量目标和当前饮食计划。
2. 进入 AI Chat，输入 `I had kung pao chicken and rice for lunch.`，让 Agent 从自然语言记录午餐。
3. 切到 Diet Log 页面，确认午餐记录和当天摄入统计已经更新。
4. 回到 AI Chat，输入 `Remember that I am allergic to peanuts.`，保存长期记忆。
5. 输入 `Recommend a light dinner for tonight.`，查看 Agent 如何结合计划和记忆给出个性化推荐。
6. 在 Diet Log 页面查看实际摄入与 daily target 的对比。

AI Chat 需要在 Settings 页面配置 OpenAI Chat Completions 兼容的模型服务，例如 DeepSeek、通义千问或自定义兼容接口。基础菜谱浏览、饮食记录、统计和本地计划页面可直接运行。

## 🧭 How to Use

1. 在 Home 页面创建或查看个人饮食计划。
2. 通过 Quick Log、Diet Log 或 AI Chat 记录餐食。
3. 在 AI Chat 中用自然语言查询、记录、推荐或保存偏好。
4. 在 Settings 页面配置模型、长期记忆、主动提醒和每日热量目标。
5. 在 Settings → Language 中切换 English / 中文，界面和 Agent 回复会同步切换。
6. 在 Diet Log 页面查看 intake vs target，并根据系统建议调整后续餐食。

## 📷 应用截图

> 截图占位区（请把对应文件放进 `docs/screenshots/` 后引用即可）：

| 场景 | 截图 |
|---|---|
| 首页：今日卡路里 + 计划主线入口 | `docs/screenshots/home.png` |
| Express Onboarding：60 秒生成专属计划 | `docs/screenshots/onboarding.png` |
| AI 对话：工具调用 + 计划差值卡 | `docs/screenshots/chat.png` |
| 饮食记录：周报 + 计划 vs 实际 | `docs/screenshots/dietlog.png` |
| 设置：长期记忆 + 待确认 + 校准审计 | `docs/screenshots/settings.png` |
| 主动提醒：未记录餐次浮层 | `docs/screenshots/proactive.png` |

放置方式：录制时全屏截图，统一保存为 `docs/screenshots/{name}.png`，README 渲染时会自动显示。

## 5 分钟 demo 跑通

> 任何 reviewer 都可以在 ~5 分钟内复现核心 agentic 行为。

```bash
# 1. 安装依赖（首次约 1-2 分钟）
npm install

# 2. 启动应用
npm run dev
```

启动后按下列步骤体验 7 个关键能力（对应 [`evaluation.md`](./docs/evaluation.md) 的 T1–T8）：

| 步骤 | 操作 | 验证点 |
|---|---|---|
| ① 引导 | 跳过 Welcome → 首页 | 看到首页问候 + 计划主卡片 |
| ② 配置 | 设置页 → AI 通道 → 填 DeepSeek/Qwen API Key → 测试连接 | 提示连接成功 + Tool 调用 OK |
| ③ 生成计划 | 首页 → 一分钟开始减肥 → 填 5 个字段 | 生成 PersonalDietPlan（每日 kcal + 三餐比例） |
| ④ 记录饮食 | AI 对话页 → "我中午吃了宫保鸡丁和米饭" | Agent 调用 `search_recipe`×2 + `add_meal`，午餐多两条 |
| ⑤ 长期记忆 | "记一下，我对花生过敏" | `remember` 写入，设置页 → 长期记忆可见 |
| ⑥ 推荐生效 | "晚上推荐两道清淡的菜" | Agent `recall` 后 `recommend_recipe`，结果不含花生菜 |
| ⑦ 计划偏差 | 饮食记录页 → 午餐手动加 3 份意大利肉酱面 | 自动弹"减餐建议"卡，建议晚餐清淡 |
| ⑧ 主动提醒 | 到下午 13:30 + 未记午餐时等 tick（或 DevTools 触发 `evaluateSchedulerTick`） | 浮层 "午餐还没记录呢" + 可选 OS 通知 |

跑完上述 8 步即覆盖了 rubric 的所有关键 agentic 能力关键词（goal-directed / multi-step / tool use / memory / planning / proactive / decision making）。

## 功能亮点

- 菜谱浏览：内置 130 道中西式菜谱，支持分类筛选、关键词搜索和详情查看。
- 饮食记录：按早餐、午餐、晚餐、加餐记录每天摄入，自动汇总热量与宏量营养素。
- 每周统计：基于所选日期生成 7 日摄入分布、完成度和目标命中情况。
- 一分钟开始减肥：Express Onboarding 只需填写性别、身高、体重、目标体重和活动水平 5 个字段，60 秒内生成专属饮食计划；完整 13 步问答版保留为可选路径。
- 一键饮食记录：One-Tap Logger 提供拍照、一行文字、"和昨天一样"快捷键和常见食物芯片四种入口，1–2 次点击完成记录。
- 拍照识别食物（有限范围）：通过 OpenAI 兼容的视觉模型（如 Qwen-VL、GPT-4o）经由现有 chat-completions 代理估算食物热量与宏量营养。不引入原生 CV 管线、不捆绑离线图像模型、不持久化原始图片字节。
- 信任旋钮（Trust Dial）：`autopilot` 模式下高置信度估算自动保存，`precision` 模式下每条记录需确认。默认 autopilot，随时可切换。
- AI 对话：内置“猫猫虫”聊天入口，可通过兼容 OpenAI Chat Completions 的模型服务执行工具调用。
- 中英文切换：Settings 页面提供 English / 中文切换，覆盖主要界面、Agent system prompt、工具描述、状态提示和菜谱名称本地化。
- 库外食物估算：如果用户吃了菜谱库里没有的食物，Agent 可按描述估算份量、热量和宏量营养，并保存为本地自定义食物供后续复用。
- AI 引导式计划：逐步采集年龄、身高、体重、目标、作息与偏好，生成专属饮食计划。
- 异常追问与审计：对异常 BMI、目标差距、餐次等情况继续追问，并保留计划版本对比。
- 动态计划建议：记录饮食后可检查当天计划偏差，生成补餐/减餐建议，并支持采纳或忽略。
- 主动 Agent：支持前端运行时餐次未记录提醒、静音时段、冷却策略、连续忽略暂停、提醒响应审计和对话内提醒偏好调整；窗口最小化时通过主进程后台 tick 和 OS 通知继续提醒。
- 长期记忆：Agent 可记住用户确认过的偏好、过敏、忌口、作息和习惯，并在设置页查看、删除或调置信度。
- 菜谱数据治理：菜谱类型、中式菜谱、西式菜谱已拆分维护，并提供 `validate:recipes` 质量校验脚本。
- 菜谱热量校准：Agent 可提交待审核热量估算记录，设置页展示校准审计概览，正式菜谱不会被自动覆盖。
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
| `npm test` | 单次运行全部测试 |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |
| `npm run test:budget` | 检查测试耗时是否在 90 秒预算内 |
| `npm run validate:recipes` | 校验菜谱数据的重复 ID、必填字段、热量和宏量营养 |
| `npm run build:win` | 构建并打包 Windows 安装包 |
| `npm run build:mac` | 构建并打包 macOS 应用 |
| `npm run build:linux` | 构建并打包 Linux 应用 |

## 测试

### 命令

| 命令 | 说明 |
| --- | --- |
| `npm test` | 单次运行全部测试（`vitest --run`） |
| `npm run test:watch` | 监听模式，文件变更时自动重跑 |
| `npm run test:coverage` | 单次运行 + 生成覆盖率报告（v8），未达阈值时退出码非零 |
| `npm run test:budget` | 检查测试总耗时是否在 90 秒预算内 |

### 文件命名与目录约定

- `*.test.ts` — 单元测试（example-based）
- `*.test.tsx` — React 组件 / 页面冒烟测试
- `*.property.test.ts` — 基于 fast-check 的属性测试（property-based）
- 测试文件放在被测模块旁的 `__tests__/` 目录下

### 三层测试架构

| 层级 | 覆盖范围 | 测试方式 |
| --- | --- | --- |
| Tier 1 | 纯逻辑模块（解析器、校验器、调度器、计算） | Example + Property 测试 |
| Tier 2 | Agent 控制器、IPC handler、preload bridge | 带 mock 的集成测试 |
| Tier 3 | React 组件和页面 | 渲染冒烟 + 单次交互断言 |

详细测试指南见 [TESTING.md](./TESTING.md)。

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
- 菜谱校准审计记录：`localStorage`
- AI 引导式计划、主动事件、动态建议与长期记忆：Dexie 数据库 `diet-agent-planning`
- API Key：Electron 主进程安全存储

后续主动 Agent 和动态计划建议仍遵循本地优先原则：

- 当天计划调整建议写入本地审计记录。
- 主动提醒事件写入本地审计记录。
- 长期记忆写入本地 Dexie，用户可在设置页删除或调低置信度。
- 菜谱热量校准结果先进入待审核记录，不直接覆盖正式菜谱。
- RAG、embedding 和大体积知识库必须按需加载，避免影响普通启动和首屏。

这意味着项目默认更偏向单机使用，当前不包含账号系统、云同步和后端服务。

## 主要页面

- 首页：今日摄入统计、计划主线入口、当前档案状态和最新专属计划概览
- 菜谱：浏览、筛选、搜索和查看菜谱详情
- 饮食记录：记录餐次、查看日汇总和周报
- AI 对话：与猫猫虫自然对话，调用应用内工具完成查看、记录和推荐
- 设置：昵称、每日热量目标、主动提醒、长期记忆、菜谱校准审计、AI 通道配置与连接诊断

## 项目结构

```text
Diet Agent/
├─ docs/
│  ├─ PRD.md
│  ├─ agent-chat-design.md
│  ├─ planning-flow-design.md
│  ├─ proactive-agent-dynamic-plan-design.md
│  ├─ recipe-data-governance.md
│  ├─ v0.5-extension-plan.md
│  └─ development-log.md
├─ resources/
├─ src/
│  ├─ main/          # Electron 主进程
│  ├─ preload/       # preload / IPC bridge
│  ├─ renderer/      # React 前端，含 data/recipes.ts 统一菜谱出口
│  └─ shared/        # 主进程与渲染进程共享类型
├─ electron.vite.config.ts
├─ package.json
└─ tsconfig.json
```

## 相关文档

### Assignment 2 评审材料

- [作业总报告](./docs/assignment-report.md) — Rubric 逐条对应 + Agentic 能力矩阵
- [系统架构](./docs/architecture.md) — Mermaid 架构图 + 时序图 + 模块职责表
- [评测与示例任务](./docs/evaluation.md) — 8 个 example tasks + 失败案例 + 性能数据
- [批判性反思](./docs/critical-reflection.md) — 限制 / 失败模式 / 设计取舍 / 未来改进

### 产品与工程设计文档

- [产品需求文档](./docs/PRD.md)
- [Agent 对话设计](./docs/agent-chat-design.md)
- [AI 引导式计划设计](./docs/planning-flow-design.md)
- [主动 Agent 与动态计划建议设计](./docs/proactive-agent-dynamic-plan-design.md)
- [菜谱热量校准与数据治理设计](./docs/recipe-data-governance.md)
- [v0.5 扩展设计](./docs/v0.5-extension-plan.md)
- [开发日志](./docs/development-log.md)
- [测试体系指南](./TESTING.md)

## 当前范围

当前代码库聚焦桌面端 MVP、本地优先能力、主动 Agent、低门槛教练和菜谱数据治理，以下内容暂未包含：

- 用户注册与登录
- 云端同步
- 后端服务
- 移动端或 Web 版
- 应用完全退出后的系统级后台服务（如 Windows Service / macOS LaunchAgent）
- 菜谱热量 LLM 批量校准脚本和自动应用流程
- RAG / embedding 本地知识库

## 致谢

菜谱数据整理参考了 [HowToCook](https://github.com/Anduin2017/HowToCook) 开源项目，并结合当前应用的数据结构做了本地化整理。
