# Diet Agent 开发日志与审计记录

> 最后更新: 2026-05-13

## 1. 本轮目标

本轮开发目标是落地 `v0.3 猫猫虫 AI 对话`，并补齐阶段审计要求：

- 交付可用的对话 UI
- 交付完整的本地工具系统与 Agent 控制器
- 交付主进程安全存储和远程 LLM 代理
- 在需求文档中同步记录完成度
- 保留清晰的实现偏差、验证结果和未完成项

## 2. 安装与环境记录

| 项目 | 结果 |
|------|------|
| 新增 npm 依赖 | 无 |
| 本轮额外安装 | 无 |
| 使用的现有能力 | Electron `safeStorage`、主进程 `fetch`、现有 Ant Design / React / Electron 工程 |

## 3. 关键设计决策

### 3.1 安全边界

- API Key 不进入渲染进程，也不写入 `localStorage`
- API Key 由 Electron 主进程通过 `safeStorage` 加密后保存到用户目录配置文件
- 远程模型请求由主进程代理，渲染进程只拿结果

### 3.2 架构折中

- 原设计希望 Agent 控制器和工具执行都放主进程
- 但当前项目数据层完全基于渲染进程 `localStorage`
- 为避免大规模迁移存储结构，本轮采用：
  - 渲染进程：对话 UI、上下文管理、工具执行、本地页面导航
  - 主进程：API Key 安全存储、远程 LLM 请求代理
- 该折中方案已同步回写到 `docs/PRD.md` 与 `docs/agent-chat-design.md`

## 4. 已完成需求映射

| 需求 | 完成度 | 实现说明 |
|------|--------|----------|
| 对话框 UI | 100% | 悬浮按钮、弹出面板、消息气泡、打字态、快捷操作已完成 |
| 工具系统 | 100% | 13 个工具全部定义并可执行 |
| LLM API 接入 | 100% | 已接 OpenAI 兼容 Chat Completions；支持 DeepSeek / 通义千问 / 自定义兼容接口 |
| Agent 控制器 | 100% | 已实现消息组装、工具循环、工具结果回传、轮数限制 |
| API Key 配置 | 100% | 设置页可配置；密钥主进程安全存储 |
| 猫猫虫 Prompt | 100% | 已实现动态 system prompt |
| 聊天后页面同步 | 100% | 首页、记录页、设置页均已接入事件刷新 |
| 补齐早期菜谱目标 | 100% | 新增 `米饭 (rice)`，完成阶段早期菜谱数量目标 |

## 5. 主要改动清单

### 5.1 主进程

- 新增 `src/main/agent.ts`
- 新增主进程 IPC：
  - `agent:get-api-key-status`
  - `agent:save-api-key`
  - `agent:clear-api-key`
  - `agent:chat-completions`

### 5.2 预加载与共享类型

- 新增 `src/shared/agent.ts`
- 预加载暴露 `window.agent`
- 渲染进程补充全局类型声明

### 5.3 渲染进程 Agent

- 新增 `src/renderer/src/agent/prompt.ts`
- 新增 `src/renderer/src/agent/tools.ts`
- 新增 `src/renderer/src/agent/controller.ts`
- 新增 `src/renderer/src/components/AgentChat.tsx`
- 新增 `src/renderer/src/components/AgentChat.css`

### 5.4 数据层

- 扩展设置存储，增加模型通道配置
- 扩展饮食记录存储，抽出统一的新增/删除/汇总逻辑
- 新增页面同步事件：`settings-updated`、`diet-log-updated`

### 5.5 页面

- `Layout` 接入悬浮聊天组件
- `Settings` 增加 AI 配置区
- `Home` / `DietLog` / `Settings` 支持事件驱动同步刷新

## 6. 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-11 | `npm run build` | 通过 |

## 7. 当前已知未覆盖项

- 还没有把对话历史持久化到 `localStorage`
- 还没有做 API 费用统计与每日配额上限显示
- 还没有做首次对话引导
- 还没有做端到端 UI 自动化验证，仅完成构建验证

## 8. 2026-05-11 补充修复记录

### 问题

- 设置页右下角悬浮聊天控件会遮挡 AI 配置区域，导致 API Key 输入体验异常
- 自定义 API 通道只接受 Base URL，不接受完整 `/chat/completions` 地址
- 自定义通道在空配置下会错误回退到 DeepSeek 默认值

### 修复

- 设置页隐藏悬浮聊天控件，避免遮挡配置表单
- 主进程请求地址改为同时兼容：
  - Base URL
  - 完整 `/chat/completions` endpoint
- 自定义通道配置规范化逻辑改为保留空值，不再回退到 DeepSeek 默认地址和模型
- 工具调用链路增加兼容性修复：
  - 保留 `tool_calls` 场景下的 `assistant.content = null`
  - 兼容旧式 `function_call`
  - 给 `tool` 消息补 `name`
  - 增加 45 秒超时和重复 tool-call 检测，避免无提示卡住
- 设置页新增连接诊断能力：
  - `测试连接` 按钮
  - 展示当前实际使用的 provider、endpoint、实际请求地址、model、API Key 保存状态
  - 展示聊天测试结果和 Tool 调用测试结果
- 主进程错误分类增强：
  - 认证失败
  - endpoint 不可达
  - 模型不存在
  - 不支持 tool calls
  - 请求超时
  - 非兼容响应 / 参数错误 / 未知错误

### 影响范围

- 设置页输入交互
- 自定义兼容 API 对接
- 阶段 3 AI 对话配置链路
- 设置页连接诊断与可审计性

## 9. 审计结论

本轮开发已经完成 `v0.3 猫猫虫 AI 对话` 的核心范围，且满足“每阶段可审计”的最低要求：

- 有明确的需求映射
- 有实现偏差说明
- 有验证记录
- 有文档回写
- 有未完成项清单

## 10. 2026-05-12 阶段4补充记录：AI 引导式计划主线

### 10.1 本轮目标

把首页主线从“接口是否可用”切回用户真实业务流程：

- 新增首页主按钮，启动 AI 引导式计划制定
- 一步一步采集用户档案，而不是测试聊天接口
- 采集过程即时落库，并保留完整审计链
- 异常数据时追加追问
- 资料收齐后生成并保存专属计划

### 10.2 安装与环境记录

| 项目 | 结果 |
|------|------|
| 新增 npm 依赖 | 无 |
| 本轮额外安装 | 无 |
| 使用的现有能力 | Dexie、React、Ant Design、已有主进程 LLM 代理 |

### 10.3 关键设计决策

#### 10.3.1 主线与聊天分离

- 用户已经明确要求：首页主线必须是“采集身体与生活数据”
- 因此本轮没有把该功能塞进右下角悬浮聊天框
- 实际落地为：首页主卡片 + 独立 `PlanBuilder` 抽屉式流程

#### 10.3.2 稳定性优先于模型自由发挥

- 资料采集与异常判断采用本地确定性逻辑
- 模型只参与最终计划文案增强，不负责关键数值计算
- 如果当前通道不可用，依然要保存完整档案并生成本地兜底计划

#### 10.3.3 审计链独立存储

- 原有 `localStorage` 继续负责设置和饮食记录
- 新增 Dexie 数据库 `diet-agent-planning`
- 单独保存：
  - 当前 profile
  - 每轮 session transcript
  - follow-up 队列与异常备注
  - 最终 plan 结果

### 10.4 已完成需求映射

| 需求 | 完成度 | 实现说明 |
|------|--------|----------|
| 首页主线按钮 | 100% | 首页新增显著主卡片和 CTA，优先引导用户建立档案 |
| 逐步问答 | 100% | 已实现 13 项结构化字段的一步一步采集 |
| 数据落库 | 100% | 每一步回答都会写入 Dexie，并同步刷新首页状态 |
| 异常追问 | 100% | 身高/体重/BMI/目标差距/目标不一致/餐次异常等会触发补充追问 |
| 保存计划 | 100% | 完成采集后自动保存 profile 与 plan |
| 模型生成计划 | 100% | AI 通道可用时调用模型生成文案；失败回退本地模板 |
| 首页计划展示 | 100% | 首页已显示档案进度、进行中会话、最新计划摘要 |
| 审计文档回写 | 100% | 已新增设计文档并回写 PRD 与开发日志 |

### 10.5 主要改动清单

#### 10.5.1 数据层

- 新增 `src/renderer/src/stores/planning.ts`
- 扩展 `src/renderer/src/stores/events.ts`
- 新增 planning 相关事件：`PLANNING_UPDATED_EVENT`

#### 10.5.2 规划引擎

- 新增 `src/renderer/src/planning/engine.ts`
- 实现：
  - 采集字段定义
  - 输入校验
  - 异常追问规则
  - 本地计划生成逻辑
  - 模型增强文案逻辑

#### 10.5.3 UI

- 新增 `src/renderer/src/components/PlanBuilder.tsx`
- 新增 `src/renderer/src/components/PlanBuilder.css`
- 重做 `src/renderer/src/pages/Home.tsx`
- 重做 `src/renderer/src/pages/Home.css`

#### 10.5.4 文档

- 新增 `docs/planning-flow-design.md`
- 更新 `docs/PRD.md`
- 更新 `docs/development-log.md`

### 10.6 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-12 | `npm run build` | 通过 |

### 10.7 当前已知未覆盖项

- 还没有做计划版本对比与历史 diff
- 还没有把计划数据接入悬浮聊天工具体系
- 还没有做“按历史饮食执行情况自动修订计划”

### 10.8 审计结论

本轮 `AI 引导式计划主线` 已完成核心范围，并满足阶段可审计要求：

- 首页已有明确主线入口
- 资料采集、异常追问、计划生成都有落库记录
- 结果可在首页直接查看
- 设计文档、需求文档、开发日志已同步回写

## 11. 2026-05-12 补充记录：AI 对话入口重构与遮挡修复

### 11.1 问题

- 首页引导式计划抽屉打开后，右下角悬浮对话入口会遮挡底部操作区
- 用户反馈“保存并继续”在实际测试中无法顺畅点击
- 现有右下角弹出式对话入口不够正式，希望左侧栏有独立对话页面

### 11.2 修复策略

- 右下角入口降级为“快捷入口”，不再承载正式对话面板
- 新增左侧栏独立 `AI 对话` 页面，提供正式对话工作区
- 快捷入口改为支持拖动位置
- 快捷入口层级改到抽屉之下，避免继续遮挡主线流程

### 11.3 主要改动

- 新增 `src/renderer/src/components/AgentChatWorkspace.tsx`
- 重写 `src/renderer/src/components/AgentChat.tsx`
- 重写 `src/renderer/src/components/AgentChat.css`
- 新增 `src/renderer/src/pages/Chat.tsx`
- 新增 `src/renderer/src/pages/Chat.css`
- 更新 `src/renderer/src/components/Layout.tsx`
- 更新 `src/renderer/src/App.tsx`
- 更新 `src/renderer/src/agent/tools.ts`

### 11.4 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-12 | `npm run build` | 通过 |

### 11.5 当前结果

- 首页计划抽屉不再被右下角入口压住
- 左侧栏已有正式“AI 对话”入口
- 右下角入口可拖动、可跳转到正式对话页

## 12. 2026-05-12 补充记录：计划版本审计与版本对比

### 12.1 本轮目标

补齐阶段4剩余的审计能力，让首页不仅能看到“最新计划”，还可以：

- 查看最近多个计划版本
- 切换查看某一版计划的完整目标
- 对比当前版本与上一版的差异

### 12.2 关键设计决策

- 不额外新建复杂页面，优先把版本审计放在首页主线附近
- 直接复用 Dexie 中已有的 `plans` 数据表
- 差异计算只基于结构化数据：
  - 热量与宏量营养目标
  - `profileSnapshot`
- 文案差异不做逐字 diff，避免噪音过高

### 12.3 主要改动

- 扩展 `src/renderer/src/stores/planning.ts`
  - 新增最近计划版本查询能力
- 扩展 `src/renderer/src/planning/engine.ts`
  - 新增版本生成来源展示
  - 新增计划版本差异计算逻辑
- 新增 `src/renderer/src/components/PlanVersionAudit.tsx`
- 新增 `src/renderer/src/components/PlanVersionAudit.css`
- 更新 `src/renderer/src/pages/Home.tsx`

### 12.4 已完成需求映射

| 需求 | 完成度 | 实现说明 |
|------|--------|----------|
| 最近计划版本查询 | 100% | 已支持读取最近 6 个计划版本 |
| 版本切换查看 | 100% | 首页可切换查看某一版计划 |
| 与上一版对比 | 100% | 已展示热量/宏量目标和用户档案字段变化 |
| 版本审计信息 | 100% | 已展示生成方式、生成时间、关联 session |
| 文档回写 | 100% | PRD、设计文档、开发日志已同步更新 |

### 12.5 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-12 | `npm run build` | 通过 |

## 13. 2026-05-12 补充记录：每周统计报表

### 13.1 本轮目标

补齐阶段2中仍未完成的“每周统计报表”，并满足当前项目的审计要求：

- 在饮食记录页增加基于当前选中日期的每周统计报表
- 不新增依赖，直接用现有 React + Ant Design + CSS 完成可视化
- 周报统计逻辑沉淀到数据层，供页面和 AI 工具层共用
- 完成后同步回写 PRD 与开发日志

### 13.2 关键设计决策

- 周报计算统一收敛到 `src/renderer/src/stores/dietLog.ts`，避免 UI 与工具层口径分叉
- 周起始日按周一计算，报表随 `selectedDate` 自动切换，不额外新增日期筛选器
- 不引入图表库，使用 CSS 横向条形图完成 7 日热量分布，控制实现复杂度
- “有效记录日”定义为当天存在实际餐次条目，空日志不计入完成度和目标命中
- “目标命中日”口径定义为当日热量落在每日目标上下浮动 10% 范围内

### 13.3 主要改动

- 扩展 `src/renderer/src/stores/dietLog.ts`
  - 新增 `WeeklyDietReport` / `WeeklyDietReportDay`
  - 新增 `getWeekBounds()` 与 `getWeeklyDietReport()`
  - 统一周总量、自然日均值、记录日均值、最高/最低摄入日、目标命中日等统计逻辑
- 更新 `src/renderer/src/pages/DietLog.tsx`
  - 新增“本周统计报表”卡片
  - 展示周总摄入、自然日均值、记录完成度、目标命中日
  - 展示 7 日热量分布、平均宏量营养与本周洞察
  - 监听设置更新事件，保证热量目标变化后周报实时刷新
- 更新 `src/renderer/src/pages/DietLog.css`
  - 新增周报区块样式、响应式布局与轻量可视化样式
- 更新 `src/renderer/src/agent/tools.ts`
  - `get_week_summary`
  - `analyze_nutrition_balance(period=week)`
  - 以上工具现已复用同一套周报统计逻辑
- 更新 `docs/PRD.md`
  - 将“每周统计报表”从待做改为完成
  - 回写实现范围与变更记录

### 13.4 已完成需求映射

| 需求 | 完成度 | 实现说明 |
|------|--------|----------|
| 周报数据层 | 100% | 已在 `dietLog` store 中统一实现周报模型与统计计算 |
| 饮食记录页周报 UI | 100% | 已展示周总摄入、自然日均值、记录完成度、目标命中日、7 日热量分布、平均宏量与洞察 |
| 热量目标联动 | 100% | 设置页的每日热量目标会影响“目标命中日”和图表参考上限 |
| AI 工具层口径统一 | 100% | 周汇总与周营养分析工具已复用 `getWeeklyDietReport()` |
| 文档回写 | 100% | PRD 与开发日志已同步更新 |

### 13.5 安装与验证记录

| 项目 | 结果 |
|------|------|
| 新增 npm 依赖 | 无 |
| 额外安装 | 无 |
| 验证命令 | `npm run build` |
| 验证结果 | 通过 |

### 13.6 当前已知未覆盖项

- 目前周报为轻量可视化实现，尚未提供可导出的图表或图片
- 还没有提供跨周切换的独立历史报表页，当前入口仍在饮食记录页内
- 阶段2中 `UI 动画增强`、`数据导出` 仍未完成

### 13.7 审计结论

本轮“每周统计报表”已满足可审计要求：

- 有明确目标与范围说明
- 有关键统计口径说明
- 有具体代码改动清单
- 有构建验证记录
- 有 PRD 与开发日志回写

## 14. 2026-05-13 补充记录：主动 Agent、动态计划与菜谱治理需求文档

### 14.1 本轮目标

本轮目标是更新需求和设计文档，不改业务代码：

- 将 PRD 从“被动记录 + 静态计划”升级为“主动 Agent + 当日动态计划建议 + 菜谱热量可审计修正”的需求基线
- 新增主动 Agent 与动态计划建议专项设计文档
- 新增菜谱热量校准与数据治理专项设计文档
- 更新 v0.5 扩展计划，明确 RAG / embedding 后置并按需加载
- 同步 README 的当前能力和文档入口

### 14.2 安装与环境记录

| 项目 | 结果 |
|------|------|
| 新增 npm 依赖 | 无 |
| 额外安装 | 无 |
| 业务代码改动 | 无 |
| 本轮改动类型 | 文档与需求设计 |

### 14.3 关键产品决策

#### 14.3.1 动态计划采用“建议调整”模式

- 系统可以根据当天计划和实际摄入计算偏差
- Agent 可以提醒用户补餐、减餐或调整下一餐
- 用户确认后再执行相关操作
- 系统不得自动覆盖正式长期计划，不得自动删除或修改用户饮食记录

#### 14.3.2 主动提醒必须低打扰

- 默认静音时段为 23:00-07:00
- 同类提醒必须有冷却时间
- 用户连续忽略同类提醒后，该规则应降级或暂停
- 浮层不能遮挡抽屉、表单和主流程操作

#### 14.3.3 菜谱热量用 LLM 估算，但必须可审计

- LLM 估算只生成候选记录
- 候选记录必须包含原值、新值、估算依据、置信度、风险备注和审核状态
- 未审核通过的结果不得覆盖正式菜谱数据
- 每次批量修正都必须保留原值并支持回滚

#### 14.3.4 菜谱数据需要先治理再扩量

- 当前菜谱已扩展到 120 道
- `recipeExtensions.ts` 已超过 1500 行，继续扩展会降低维护性
- 后续应拆分类型定义、中式菜谱、西式菜谱、校准记录和校验脚本
- 扩展到 500+ 前应先完成数据拆分和校验机制

#### 14.3.5 RAG / embedding 不进入第一阶段关键路径

- 动态计划建议可以先基于现有计划、饮食记录、菜谱库和本地规则实现
- `@xenova/transformers`、本地 embedding 模型和知识库会明显增加体积
- 后续引入 RAG 时必须按需加载，不能阻塞普通启动和首屏

### 14.4 主要文档改动

- 更新 `docs/PRD.md`
  - 当前菜谱数量修正为 120
  - 新增主动 Agent 与动态计划建议需求
  - 新增菜谱热量校准与可审计数据治理需求
  - 新增文档同步和可审计要求
  - 新增 v0.5 / v0.6 需求里程碑
- 新增 `docs/proactive-agent-dynamic-plan-design.md`
  - 定义主动触发场景、动态计划建议规则、用户确认流程、审计点和验收场景
- 新增 `docs/recipe-data-governance.md`
  - 定义 LLM 热量估算流程、校准记录、数据拆分方案、校验脚本和验收场景
- 更新 `docs/v0.5-extension-plan.md`
  - 对齐当前 120 道菜谱状态
  - 将“主动 Agent + 动态计划建议”设为 v0.5 核心
  - 将 RAG / embedding 后置为按需加载能力
- 更新 `README.md`
  - 同步当前菜谱数量、主动 Agent 规划、菜谱治理规划和新增文档入口

### 14.5 已完成需求映射

| 需求 | 完成度 | 说明 |
|------|--------|------|
| PRD 更新 | 100% | 已写入 120 道菜谱、主动 Agent、动态计划建议、菜谱治理和文档同步要求 |
| 主动 Agent 设计文档 | 100% | 已新增触发规则、建议规则、确认流程、审计点和验收场景 |
| 菜谱治理设计文档 | 100% | 已新增 LLM 估算、审核表、数据拆分、校验脚本和验收场景 |
| v0.5 计划更新 | 100% | 已从 RAG 优先调整为主动建议优先，RAG 后置按需加载 |
| README 同步 | 100% | 已同步当前能力和新增文档入口 |
| 业务代码实现 | 0% | 本轮按计划不改业务代码 |

### 14.6 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-13 | 文档链接与旧状态检索 | 通过，未发现旧版菜谱数量作为当前状态描述 |
| 2026-05-13 | `npm run build` | 通过 |

### 14.7 当前已知未覆盖项

- 还没有实现主动提醒调度、浮层 UI、冷却和静音策略
- 还没有实现当天计划差值计算和补餐/减餐建议
- 还没有实现新增 Agent 工具
- 还没有拆分菜谱数据文件
- 还没有实现 LLM 热量估算、校准审核表和校验脚本
- 还没有引入 RAG / embedding

### 14.8 审计结论

本轮完成的是需求和设计基线更新，满足“先写清楚、再实现”的审计要求：

- 需求、设计、路线图和 README 已同步
- 明确区分当前已完成能力与后续规划能力
- 关键产品决策已记录
- 业务代码保持不变

## 15. 2026-05-13 补充记录：动态计划建议与菜谱校验脚本

### 15.1 本轮目标

将 v0.5 需求中的第一阶段能力落到业务代码：

- 记录饮食后检查当天计划偏差
- 对明显低于/高于计划的餐次生成补餐/减餐建议
- 将建议写入本地审计记录
- 在首页和饮食记录页展示最新建议
- 让猫猫虫 Agent 能读取计划、检查偏差、生成建议和记录用户响应
- 新增菜谱数据校验脚本，为后续热量校准建立基础检查

### 15.2 安装与环境记录

| 项目 | 结果 |
|------|------|
| 新增 npm 依赖 | 无 |
| 额外安装 | 无 |
| 新增脚本 | `npm run validate:recipes` |

### 15.3 关键设计决策

- 动态计划仍采用“建议调整”，不自动覆盖正式计划版本。
- 餐次目标第一阶段采用确定性比例拆分，三餐为 25% / 40% / 35%，四餐为 20% / 35% / 30% / 15%。
- 只有单餐偏差超过 25% 且差值至少 200 kcal 时，添加/删除记录后才持久化建议。
- 首页和饮食记录页只展示最新一条当天建议，避免信息噪音过大。
- 菜谱校验脚本只读当前 TypeScript 数据，不改菜谱文件。

### 15.4 主要改动

- 扩展 `src/renderer/src/stores/planning.ts`
  - 新增 `DailyPlanAdjustment`
  - 新增 Dexie v2 表 `dailyPlanAdjustments`
  - 新增保存、查询、更新用户响应的函数
- 新增 `src/renderer/src/planning/dynamicPlan.ts`
  - 新增当天计划差值计算
  - 新增餐次热量拆分
  - 新增补餐/减餐/维持建议生成
  - 新增持久化动态建议入口
- 更新 `src/renderer/src/pages/Home.tsx` 与 `Home.css`
  - 展示当天最新动态建议
  - 支持采纳/忽略
- 更新 `src/renderer/src/pages/DietLog.tsx` 与 `DietLog.css`
  - 添加/删除饮食记录后触发动态建议检查
  - 展示最新动态建议
  - 支持采纳/忽略
- 更新 `src/renderer/src/agent/tools.ts`
  - 新增 `get_current_plan`
  - 新增 `check_today_plan_gap`
  - 新增 `suggest_plan_adjustment`
  - 新增 `record_adjustment_response`
- 新增 `scripts/validate-recipes.js`
- 更新 `package.json`
  - 新增 `validate:recipes`

### 15.5 已完成需求映射

| 需求 | 完成度 | 说明 |
|------|--------|------|
| 当天计划差值计算 | 100% | 已支持按正式计划或设置目标计算剩余热量和餐次差值 |
| 补餐/减餐建议 | 100% | 已根据偏差生成建议文本 |
| 建议审计记录 | 100% | 已落入 `dailyPlanAdjustments` |
| 用户响应记录 | 100% | 首页和饮食记录页可记录采纳/忽略，Agent 可记录 accepted/dismissed/snoozed |
| Agent 工具扩展 | 100% | 已新增 4 个计划相关工具 |
| 菜谱数据校验 | 100% | 已新增只读校验脚本并通过当前数据 |

### 15.6 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-13 | `npm run build` | 通过 |
| 2026-05-13 | `npm run validate:recipes` | 通过，120 道菜谱无重复 ID、无缺失字段、无异常热量或宏量校验问题 |

### 15.7 当前已知未覆盖项

- 还没有定时提醒调度。
- 还没有设置页提醒开关、静音时段和冷却策略。
- 还没有“稍后提醒”UI。
- 首页和饮食记录页只展示最新一条建议，还没有完整历史列表。
- 菜谱热量 LLM 估算、审核和应用流程尚未实现。

### 15.8 审计结论

本轮完成 v0.5 的第一段可用业务闭环：记录饮食后能生成动态计划建议、展示给用户、记录用户响应，并可由 Agent 调用。菜谱治理完成了第一步只读校验脚本，为后续 LLM 校准打地基。

## 16. 2026-05-13 补充记录：主动提醒基础设施

### 16.1 本轮目标

继续推进 v0.5 主动 Agent 能力：

- 新增主动提醒偏好设置
- 新增主动提醒审计记录
- 新增全局提醒浮层
- 实现早餐/午餐/晚餐未记录提醒
- 实现静音时段、冷却和稍后提醒

### 16.2 安装与环境记录

| 项目 | 结果 |
|------|------|
| 新增 npm 依赖 | 无 |
| 额外安装 | 无 |
| 新增数据库版本 | `diet-agent-planning` v3 |

### 16.3 关键设计决策

- 第一阶段只做前端运行时提醒，不做系统级后台常驻和 OS 通知。
- 餐次提醒默认开启，但遵守静音时段与同类提醒冷却。
- 主动提醒浮层挂在全局布局中，层级低于正式对话入口和模态层，避免遮挡主要操作。
- 动态计划建议提醒开关会影响饮食记录页自动持久化建议；Agent 手动调用仍可生成建议。

### 16.4 主要改动

- 扩展 `src/renderer/src/stores/settings.ts`
  - 新增 `ReminderSettings`
  - 新增提醒总开关、餐次提醒、动态计划建议、周报提醒、静音时段、冷却时间
- 扩展 `src/renderer/src/stores/planning.ts`
  - 新增 `ProactiveEvent`
  - 新增 Dexie v3 表 `proactiveEvents`
  - 新增保存、查询和更新提醒响应函数
- 新增 `src/renderer/src/proactive/rules.ts`
  - 实现早餐/午餐/晚餐未记录检查
  - 实现静音时段和冷却判断
- 新增 `src/renderer/src/proactive/ProactiveReminder.tsx`
  - 全局主动提醒浮层
  - 支持去记录、稍后、关闭
- 更新 `src/renderer/src/components/Layout.tsx`
  - 挂载全局主动提醒组件
- 更新 `src/renderer/src/pages/Settings.tsx`
  - 新增主动提醒设置区
- 更新 `src/renderer/src/planning/dynamicPlan.ts`
  - 自动动态计划建议遵守提醒开关

### 16.5 已完成需求映射

| 需求 | 完成度 | 说明 |
|------|--------|------|
| 主动提醒设置 | 100% | 设置页已支持提醒开关、静音时段和冷却时间 |
| 主动事件审计 | 100% | 已新增 `ProactiveEvent` 表和响应记录 |
| 餐次未记录提醒 | 100% | 前端运行时每 10 分钟检查早餐/午餐/晚餐 |
| 低打扰策略 | 90% | 已实现静音时段、冷却、稍后提醒；同一规则连续 3 次忽略后 24 小时内暂停 |
| 全局提醒 UI | 100% | 已新增轻量浮层 |

### 16.6 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-13 | `npm run build` | 通过 |
| 2026-05-13 | `npm run validate:recipes` | 通过，120 道菜谱无重复 ID、无缺失字段、无异常热量或宏量校验问题 |
| 2026-05-13 | `npm run build` | 通过，含连续忽略暂停逻辑 |

### 16.7 当前已知未覆盖项

- 尚未实现系统级 OS 通知。
- 尚未实现应用关闭后的后台常驻调度。
- 尚未实现周报主动提醒。

### 16.8 审计结论

本轮把主动 Agent 从“计划里的提醒规则”推进到可运行的前端提醒基础设施：用户可以配置提醒偏好，系统可以检查未记录餐次并展示低打扰提醒，提醒触发和用户响应可审计。

### 16.9 追加实现记录

- 新增 `getRecentProactiveEventsForRule`，支持按规则读取最近提醒事件。
- 主动提醒规则新增连续忽略保护：同一规则最近 3 次响应均为 `dismissed` 时，最近一次触发后的 24 小时内暂停该规则。
- 该策略只影响同类提醒，不会关闭用户的总提醒设置，也不会删除审计记录。
- Agent 工具补齐 `get_proactive_event_history` 和 `update_reminder_preferences`，支持通过对话查看提醒历史和调整提醒偏好。

## 17. 2026-05-13 补充记录：菜谱数据拆分与治理质量门禁

### 17.1 本轮目标

继续推进可维护的数据治理：

- 将 1597 行的 `recipeExtensions.ts` 拆分为类型、中式菜谱、西式菜谱和统一出口。
- 保持业务页面和 Agent 工具继续从 `recipes.ts` 读取完整菜谱库。
- 升级 `validate:recipes`，让拆分后的模块也能被校验。
- 同步 README、PRD、专项设计文档和开发日志。

### 17.2 安装与环境记录

| 项目 | 结果 |
|------|------|
| 新增 npm 依赖 | 无 |
| 额外安装 | 无 |
| 新增数据库版本 | 无 |

### 17.3 关键设计决策

- `recipes.ts` 继续作为唯一业务入口，页面和 Agent 不需要了解内部拆分。
- `recipeTypes.ts` 独立维护 `Recipe`、`Ingredient`、`Nutrition`、`RecipeSeed` 和 `buildRecipe`。
- `chineseRecipes.ts` 维护 50 道基础中式菜谱和 40 道扩展中式菜谱。
- `westernRecipes.ts` 维护 30 道西式菜谱。
- `recipeExtensions.ts` 暂时保留兼容导出，降低旧导入路径的迁移风险。
- `validate:recipes` 自动解析 data 目录下的相对 TypeScript 模块，并在状态不是 `passed` 时失败，作为后续数据质量门禁。

### 17.4 主要改动

- 新增 `src/renderer/src/data/recipeTypes.ts`
- 新增 `src/renderer/src/data/chineseRecipes.ts`
- 新增 `src/renderer/src/data/westernRecipes.ts`
- 精简 `src/renderer/src/data/recipes.ts`
  - 统一汇总中式和西式菜谱
  - 继续导出 `Recipe` 等类型
- 精简 `src/renderer/src/data/recipeExtensions.ts`
  - 只保留兼容导出
- 更新 `src/renderer/src/pages/Recipes.tsx`
  - 新增菜谱 ID 集合改为直接引用拆分后的中式/西式数据文件
- 更新 `scripts/validate-recipes.js`
  - 支持递归解析拆分后的 TypeScript 模块
  - 将异常热量、宏量偏差等 warning 也纳入失败条件

### 17.5 已完成需求映射

| 需求 | 完成度 | 说明 |
|------|--------|------|
| 菜谱类型拆分 | 100% | `Recipe`、`Ingredient`、`Nutrition`、`RecipeSeed` 已移入 `recipeTypes.ts` |
| 中西式数据拆分 | 100% | 中式和西式菜谱已拆入独立文件 |
| 统一业务入口 | 100% | `recipes.ts` 继续统一导出 120 道菜谱 |
| 兼容旧导入 | 100% | `recipeExtensions.ts` 保留 `additionalChineseRecipes` 与 `westernRecipes` 导出 |
| 校验脚本适配 | 100% | `validate:recipes` 已适配拆分模块并作为质量门禁 |

### 17.6 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-13 | `npm run validate:recipes` | 通过，120 道菜谱无重复 ID、无缺失字段、无异常热量或宏量校验问题 |
| 2026-05-13 | `npm run build` | 通过 |

### 17.7 当前已知未覆盖项

- 尚未实现 LLM 热量估算候选流程。
- 尚未实现校准审核表。
- 尚未实现审核通过后应用热量修正。
- 尚未引入外部营养数据库或 RAG 知识库。

### 17.8 审计结论

本轮把菜谱治理从文档规划推进到代码结构落地：菜谱数据已经从大单文件拆成更清晰的维护边界，校验脚本也成为可失败的质量门禁。当前 120 道菜谱内容和分类统计保持不变，构建通过。

## 18. 2026-05-13 补充记录：菜谱热量校准审计与 Agent 工具

### 18.1 本轮目标

继续推进“菜单热量更新要可审计”的业务代码：

- 新增菜谱校准记录数据结构。
- 让 LLM/Agent 估算热量时只能生成待审核记录，不直接覆盖正式菜谱。
- 将菜谱校验能力暴露给 Agent 工具。
- 在设置页展示校准审计概览。

### 18.2 安装与环境记录

| 项目 | 结果 |
|------|------|
| 新增 npm 依赖 | 无 |
| 额外安装 | 无 |
| 新增数据库版本 | 无，本阶段使用 localStorage 保存校准审计记录 |

### 18.3 关键设计决策

- `estimate_recipe_nutrition` 接收模型估算出的结构化数值和依据，然后写入 `RecipeCalibrationRecord`。
- 校准记录包含原热量、原宏量营养、新热量、新宏量营养、估算依据、置信度、风险备注、审核状态和模型名。
- 置信度低于 0.6、热量变化超过 30%、宏量折算偏差超过 25% 的记录自动标记为 `needs_review`。
- `approved` 目前只表示审核状态，不会自动写回正式菜谱文件。
- 菜谱校验逻辑抽到 `recipeValidation.ts`，Node 脚本和 Agent 工具复用同一套规则。

### 18.4 主要改动

- 新增 `src/renderer/src/data/recipeValidation.ts`
  - 抽出菜谱数据校验逻辑
- 更新 `scripts/validate-recipes.js`
  - 复用 `recipeValidation.ts`
- 新增 `src/renderer/src/stores/recipeCalibration.ts`
  - 新增 `RecipeCalibrationRecord`
  - 新增创建、查询、审核状态更新和汇总函数
- 更新 `src/renderer/src/stores/events.ts`
  - 新增 `RECIPE_CALIBRATION_UPDATED_EVENT`
- 更新 `src/renderer/src/agent/tools.ts`
  - 新增 `validate_recipe_library`
  - 新增 `estimate_recipe_nutrition`
  - 新增 `list_recipe_calibrations`
  - 新增 `review_recipe_calibration`
- 更新 `src/renderer/src/pages/Settings.tsx` 与 CSS
  - 新增菜谱校准审计概览

### 18.5 已完成需求映射

| 需求 | 完成度 | 说明 |
|------|--------|------|
| LLM 热量估算候选 | 70% | 已支持 Agent 提交单条估算候选；批量脚本未做 |
| 校准审计记录 | 100% | 已记录原值、新值、依据、置信度、风险备注、状态和更新时间 |
| 人工审核状态 | 70% | Agent 工具可更新状态；专门审核列表 UI 未做 |
| 不直接覆盖正式菜谱 | 100% | 工具返回 `officialRecipeUnchanged: true`，只写审计记录 |
| 菜谱校验 Agent 工具 | 100% | Agent 可生成当前菜谱质量报告 |
| 设置页审计概览 | 100% | 已展示总数、待审核、需复核、已通过、已拒绝 |

### 18.6 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-13 | `npm run build` | 通过 |
| 2026-05-13 | `npm run validate:recipes` | 通过，120 道菜谱无重复 ID、无缺失字段、无异常热量或宏量校验问题 |

### 18.7 当前已知未覆盖项

- 尚未实现批量 LLM 热量估算脚本。
- 尚未实现专门的校准审核列表页。
- 尚未实现 `approved` 校准记录写回正式菜谱文件。
- 尚未实现校准记录导出/导入。

### 18.8 审计结论

本轮把“更新菜单热量”从直接改数据升级为可审计流程：模型估算先进入待审核记录，用户可以查看审计概览，Agent 可以列出和更新审核状态，正式菜谱数据保持不被自动篡改。这样后续真正修正热量时，有来源、有理由、有状态，也有回滚空间。

## 19. 2026-05-13 补充记录：长期记忆系统

### 19.1 本轮目标

补齐 v0.5 第 4 阶段长期记忆能力：

- 新增 memory 目录与记忆管理模块。
- 新增 `memories` 数据表。
- 新增记忆相关 Agent 工具。
- 将长期记忆注入 system prompt。
- 设置页新增记忆管理 UI。

### 19.2 安装与环境记录

| 项目 | 结果 |
|------|------|
| 新增 npm 依赖 | 无 |
| 额外安装 | 无 |
| 新增数据库版本 | `diet-agent-planning` v4，新增 `memories` 表 |

### 19.3 关键设计决策

- 长期记忆只保存用户明确表达或确认过的事实，不做本轮异步自动提取。
- 记忆类型覆盖偏好、过敏、忌口、习惯、作息、健康备注、目标和其他。
- 记忆使用置信度控制可信程度，设置页允许用户调低或删除。
- `remember` 会做轻量去重和合并，避免同类重复记忆无限增长。
- 每轮 Agent 对话会注入当前长期记忆摘要；过敏和忌口优先级最高。

### 19.4 主要改动

- 扩展 `src/renderer/src/stores/planning.ts`
  - 新增 `UserMemory` 类型
  - 新增 Dexie v4 表 `memories`
  - 新增保存、查询、归档、更新置信度和标记使用函数
- 新增 `src/renderer/src/memory/store.ts`
- 新增 `src/renderer/src/memory/manager.ts`
- 新增 `src/renderer/src/memory/matcher.ts`
- 新增 `src/renderer/src/memory/prompt.ts`
- 更新 `src/renderer/src/agent/prompt.ts`
  - 加入长期记忆使用规则
- 更新 `src/renderer/src/agent/controller.ts`
  - 每轮对话注入长期记忆摘要
- 更新 `src/renderer/src/agent/tools.ts`
  - 新增 `remember`
  - 新增 `recall`
  - 新增 `forget`
  - 新增 `list_user_facts`
  - 新增 `update_memory_confidence`
- 更新 `src/renderer/src/pages/Settings.tsx` 与 CSS
  - 新增长期记忆管理区
  - 支持查看、删除和调整置信度

### 19.5 已完成需求映射

| 需求 | 完成度 | 说明 |
|------|--------|------|
| memory 目录 | 100% | 已新增 store / manager / matcher / prompt |
| Memory 数据表 | 100% | Dexie v4 新增 `memories` |
| 记忆 Agent 工具 | 100% | 已新增 5 个长期记忆工具 |
| prompt 注入 | 100% | Agent 对话会注入长期记忆摘要 |
| 设置页管理 UI | 100% | 支持查看、删除、调置信度 |
| 对话后异步提取 | 0% | 本轮未做，避免误记未确认信息 |

### 19.6 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-13 | `npm run build` | 通过 |
| 2026-05-13 | `npm run validate:recipes` | 通过，120 道菜谱无重复 ID、无缺失字段、无异常热量或宏量校验问题 |

### 19.7 当前已知未覆盖项

- 尚未实现对话后异步自动提取长期记忆。
- 尚未实现记忆编辑正文，只支持删除和调置信度。
- 尚未在推荐算法中硬过滤过敏/忌口；目前主要通过 Agent prompt 和 recall 工具约束。

### 19.8 审计结论

本轮把长期记忆从设计补成可运行能力：Agent 可以记住、召回、删除和调置信度，系统 prompt 会带上跨会话记忆，用户也能在设置页看见并管理这些事实。记忆能力保持用户可控，避免静默自动记错。


## 21. 2026-05-14 Common-food coverage, fixed navigation, and custom food capture

### 21.1 Goal

- Fix the long-chat navigation experience so the main sidebar stays visible while content scrolls.
- Expand the built-in food coverage with more everyday items such as milk, yogurt, rice, fruit, and snacks.
- Let the Agent handle foods that are not already in the library by estimating nutrition conservatively, saving a reusable local custom food, and writing the meal into the current diet log.

### 21.2 Product / UX changes

- Updated layout scrolling so the left navigation remains fixed within the viewport during long pages and chat-heavy use.
- Added a clearer entry in the diet log page for “AI estimate food” so users do not have to guess how to record foods missing from the recipe library.
- Updated the chat workspace quick actions so users can directly start a “估算库外食物” flow.

### 21.3 Data and tool changes

- Added more staple / common foods to the built-in library:
  - pure milk
  - plain yogurt
  - white rice
  - banana
  - apple
  - protein bar
  - potato chips
  - mixed nuts
  - dark chocolate
  - ice cream
- Avoided duplicate IDs by reusing existing built-in breakfast items where the library already had soy milk, steamed bun, and tea egg.
- Added / completed `add_custom_food_meal` so Agent can:
  - estimate per-serving calories and macros
  - save the result into local custom foods
  - write the meal into the selected day
- Updated custom-food persistence to reuse existing same-name entries instead of silently creating duplicate local custom-food records.

### 21.4 Verification

| Time | Action | Result |
|---|---|---|
| 2026-05-14 | `npm run validate:recipes` | Passed; 130 recipes, no duplicate IDs, no missing fields, no suspicious calories |
| 2026-05-14 | `npm run build` | Passed |

### 21.5 Notes

- README has been synced to 130 built-in recipes and the new custom-food estimation capability.
- Older planning / governance docs that previously referenced 120 recipes were updated where they described current state.


## 20. 2026-05-13 Recipe icon compatibility audit and project gap review

### 20.1 Goal

- Scan all 120 recipe `emoji` fields for empty values, X-like placeholders, question marks, and newer Unicode emoji that may render as tofu / square / X icons in some Windows and Electron font environments.
- Replace high-risk newer emoji with more compatible older emoji without changing recipe ID, category, calories, ingredients, steps, or nutrition data.
- Run recipe validation and production build after the data-only fix.

### 20.2 Icon replacements

| Recipe ID | Recipe | Old emoji | New emoji | Reason |
|---|---|---:|---:|---|
| `pepper-steak` | Qingjiao beef stir-fry | U+1FAD1 | U+1F336 U+FE0F | Newer emoji may render as tofu / X |
| `dry-fried-beans` | Dry-fried green beans | U+1FAD8 | U+1F331 | Newer emoji may render as tofu / X |
| `miso-soup` | Miso soup | U+1FAD5 | U+1F372 | Use broadly supported soup icon |
| `scallion-pancake` | Scallion pancake | U+1FAD3 | U+1F95E | Use broadly supported pancake icon |
| `green-pepper-potato` | Green pepper potato strips | U+1FAD1 | U+1F336 U+FE0F | Avoid unsupported bell-pepper emoji |
| `spicy-lotus-root` | Cold lotus root slices | U+1FAB7 | U+1F957 | Avoid unsupported lotus emoji |
| `berry-yogurt-parfait` | Berry yogurt parfait | U+1FAD0 | U+1F353 | Avoid unsupported blueberry emoji |

### 20.3 Verification

| Time | Action | Result |
|---|---|---|
| 2026-05-13 | Custom scan for empty emoji, X-like placeholders, question marks, and high-risk U+1FA70+ emoji | 120 recipes have icons; high-risk newer emoji count reduced from 7 to 0 |
| 2026-05-13 | `npm run validate:recipes` | Passed; 120 recipes, no duplicate IDs, no missing fields, no abnormal nutrition issues |
| 2026-05-13 | `npm run build` | Passed; renderer still needs bundle-size attention, especially `vendor-antd` |

## 21. 2026-05-14 Agent 习惯适配：对话后记忆提炼 + 饮食节奏摘要

### 21.1 Goal

- 降低「Agent 功能单一、不懂用户」的体感：在**不增加用户操作负担**的前提下，让模型看到**可解释的本地统计节奏**，并允许**低打扰**地从对话中沉淀长期记忆。
- 记忆沉淀必须可撤销、可审计：推断记忆带置信度；中低置信度走「待确认」；用户显式 `remember` 行为不变。

### 21.2 Design decisions

| Topic | Decision |
|-------|----------|
| 触发点 | 仅 `AgentChatWorkspace`（正式对话页）在 `runAgentConversation` 成功返回后 `void` 异步执行，避免阻塞 UI |
| 提炼模型调用 | 复用 `window.agent.chatCompletions`，`tools: []`，短 `maxTokens`，低温 |
| 存储 | Dexie `memories` 表新增状态 `pending_confirm`；采纳时 `saveUserMemory` 改为 `active`；丢弃走 `forget`（归档） |
| 节奏数据 | 新模块 `habits/rhythmSummary.ts`，纯本地 `getLogsForRange` + `summarizeDietLog` 聚合，默认 14 天 |
| Prompt 注入 | `buildMemoryContextForPrompt` 在「已知长期记忆」前拼接 `formatRhythmSummaryForPrompt` |
| 工具 | `get_user_rhythm_summary` 加入 `BASE_TOOL_NAMES` 与 memory 工具组，便于自定义渠道按需加载 |
| 设置 | `memoryPostChatExtraction`（默认开）、`memoryPostChatAutoConfidence`、`memoryPostChatPendingMinConfidence` 写入 `settings` 并归一化 |

### 21.3 Verification

| Time | Action | Result |
|------|--------|--------|
| 2026-05-14 | `npm run build` | Passed |

### 20.4 Current known project gaps

- `vendor-antd` remains large. Page-level lazy loading and manual chunks are in place, but finer component-level optimization is still needed.
- Recipe governance still lacks batch LLM calibration script `scripts/estimate-recipe-nutrition.ts` and approved-calibration writeback script `scripts/apply-approved-calibrations.ts`.
- The knowledge base is still lightweight local retrieval; no external nutrition database, real embedding model, reranker model, or ingest pipeline yet.
- Proactive reminders have foreground and OS-notification foundations, but full system-level scheduling after complete app quit is not a true background service yet.
- Long-term memory: post-chat extraction and pending-confirm flow are implemented; direct memory editing in UI and hard allergy/avoidance filtering in recommendation ranking remain incremental work.
- Dynamic plan adjustment has core logic, but visual audit list, finer deduplication, and cross-week trend explanation need improvement.
- CSV/JSON diet export exists, but advanced filters, automatic backup, import/restore, and privacy confirmation are not complete.
- API cost tracking depends on provider token usage and user-configured prices; no built-in provider/model price table auto-update yet.


## 22. 2026-05-14 Low-Effort Coaching 功能落地

### 22.1 本轮目标

交付"低门槛教练"功能层，让用户以最小操作成本开始减肥并持续执行：

- **Express Onboarding（一分钟开始减肥）**：5 个必填字段即可生成有效 `PersonalDietPlan`，保留完整问答版作为可选路径。
- **One-Tap Logger（一键记录）**：拍照、一行文字/语音、"和昨天一样"、常见食物芯片四种入口，1–2 次点击完成饮食记录。
- **Autopilot Planner（自动建议）**：餐时自动推荐 3 道候选菜，按剩余热量、过敏/忌口、习惯节奏排序，用户一键选择即入库。
- **Reminder Scheduler + Desktop Notifier（提醒调度与 OS 通知）**：前台 10 分钟 / 后台 30 分钟 tick 评估提醒规则；窗口失焦时通过 `Notification` API 发送 OS 级通知；通知点击路由回目标页面。
- **Plan Drift Monitor（计划漂移监测）**：连续 3 天偏离 ≥15% 时生成 `PlanAdjustmentProposal`，用户一键采纳或保持现状，不覆盖已有计划。
- **Trust Dial（信任旋钮）**：`autopilot`（高置信度自动保存）与 `precision`（每条确认）两档，默认 autopilot。

### 22.2 关键设计决策

| 决策 | 说明 |
|------|------|
| 拍照识别范围 | 通过现有 chat-completions 代理 + 视觉模型实现，不引入原生 CV、不捆绑离线模型、不持久化图片字节 |
| 后台调度 | 主进程 `setInterval` 30 分钟 tick，仅在窗口 hidden/minimized 时激活 |
| OS 通知 | 使用 Electron `Notification` API；不支持时回退 in-app 浮层 |
| 数据层 | Dexie schema bump v5 → v6，新增 `coachingAuditLog` 表；`PersonalDietPlan` 新增 `status` / `sourcePlanId` |
| IPC 通道 | 仅新增 `coaching:reminder-tick` 和 `coaching:notification-clicked`，复用现有 preload bridge |
| 过敏硬过滤 | Autopilot Planner 在评分前硬排除 `confidence ≥ 0.6` 的 allergy/avoidance 记忆 |

### 22.3 主要改动

- 新增 `src/renderer/src/coaching/` 模块目录，包含：types、auditLog、estimateValidator、photoLogParser、textLogParser、expressOnboarding、trustDial、oneTapLogger、autopilotPlanner、planDriftMonitor、reminderScheduler、desktopNotifier、notificationRouter
- 新增 `src/renderer/src/coaching/__tests__/` 属性测试：estimateConsistency、quietHours、allergyFilter、planImmutability、estimateRoundTrip
- 新增 `src/renderer/src/pages/ExpressOnboarding.tsx`
- 新增 `src/renderer/src/components/OneTapLogger.tsx`、`AutopilotSuggestion.tsx`、`PlanDriftCard.tsx`
- 更新 `src/main/index.ts`：后台 30 分钟 tick + 通知点击路由
- 更新 `src/preload/index.ts`：暴露 coaching IPC listener
- 更新 `src/renderer/src/App.tsx`：注册 `/express-onboarding` 路由
- 更新 `src/renderer/src/pages/Settings.tsx`：Trust Dial 设置区
- 更新 `src/renderer/src/pages/Home.tsx` 和 `DietLog.tsx`：集成 OneTapLogger
- 更新 `docs/PRD.md` §6：拍照识别从 ❌ 改为有限范围 ⚠️
- 更新 `docs/proactive-agent-dynamic-plan-design.md` §12：OS 通知和后台调度已实现
- 更新 `README.md`：新增功能描述

### 22.4 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-14 | `npm run build` | 通过 |
| 2026-05-14 | Property-based tests (fast-check) | 5 项属性测试通过 |

### 22.5 当前已知未覆盖项

- 语音输入依赖浏览器 Web Speech API 或外部转写，当前仅支持文本输入。
- 批量 LLM 热量校准脚本和自动应用流程仍未实现。
- 应用完全退出后的系统级后台服务（如 Windows Service / macOS LaunchAgent）不在本轮范围。

### 22.6 审计结论

本轮完成 low-effort-coaching 全部核心业务闭环：用户可以 60 秒完成 onboarding、一键记录饮食、接收 OS 级提醒、获得自动餐食建议、在计划漂移时一键采纳新方案。所有行为均写入审计日志，信任旋钮让用户自主选择自动化程度。

## 23. 2026-05-19 补充记录：comprehensive-testing 全面测试体系落地

### 23.1 本轮目标

为 Diet Agent 桌面应用建立全面的自动化测试体系，覆盖纯逻辑、集成和 UI 三层，确保现有功能在后续迭代中不被破坏：

- 建立三层测试架构（Tier 1 纯逻辑 / Tier 2 Agent 与 IPC 集成 / Tier 3 React 组件冒烟）
- 引入属性测试（Property-Based Testing）验证核心不变量
- 配置覆盖率门禁与乱序执行
- 同步文档与开发日志

### 23.2 安装与环境记录

| 项目 | 结果 |
|------|------|
| 新增 npm 依赖 | `@testing-library/react`、`@testing-library/jest-dom`、`@testing-library/user-event`、`@vitest/coverage-v8`、`fake-indexeddb`、`jsdom` |
| 测试框架 | Vitest 2.x + Testing Library + fast-check 3.x |
| 覆盖率工具 | `@vitest/coverage-v8`（reporters: `text-summary` + `lcov`） |
| 新增脚本 | `test:watch`、`test:coverage` |

### 23.3 落地范围

#### 测试规模

- 约 70 个测试文件，633+ 个测试用例
- 三层架构完整覆盖：
  - **Tier 1**：纯逻辑模块的 example + property 测试（coaching、coach、data、export、habits、knowledge、memory、planning、proactive、stores）
  - **Tier 2**：Agent 控制器、工具系统、prompt 组装、主进程 IPC handler、preload bridge
  - **Tier 3**：所有 `components/*.tsx` 和 `pages/*.tsx` 的渲染冒烟测试

#### 属性测试（Property-Based Testing）

9 项正确性属性通过 fast-check 验证：

1. Parser round-trip consistency（解析/序列化往返一致性）
2. Quiet-hours invariant（静音时段不变量）
3. Plan immutability（计划不可变性）
4. Allergy hard filter（过敏硬过滤）
5. Estimate consistency（估算一致性）
6. Recipe macro consistency（菜谱宏量一致性）
7. Rhythm summary idempotence（节奏摘要幂等性）
8. Memory matcher order insensitivity（记忆匹配器顺序无关性）
9. Plan-gap arithmetic（计划差值算术正确性）

#### 覆盖率目标

| 范围 | 行覆盖率 | 分支覆盖率 |
|------|----------|------------|
| 全局（非 UI 模块） | 80% | 70% |
| `components/**` / `pages/**` | 50% | 40% |

#### 基础设施

- 共享 setup 文件 `src/test/setup.ts`：
  - fetch 网络访问守卫（测试中禁止真实网络请求）
  - localStorage 每测试重置
  - IndexedDB（fake-indexeddb）每测试清理
  - 未清理定时器泄漏检测
- 可复用测试替身：`electron`、`safeStorage`、`ipcRenderer`、`windowAgent`、`dexie`
- 数据工厂：`recipe`、`dietLogEntry`、`userMemory`、`reminderSettings`、`chatCompletionResponse`
- 共享 fast-check arbitraries：`recipe`、`dietLog`、`reminder`、`memory`、`plan`
- `defaultRunConfig()` 统一管理 `numRuns`（默认 100，CI 可通过 `VITEST_PBT_RUNS` 环境变量提升至 500）

#### 执行保障

- 乱序执行（shuffle mode）已启用，验证测试间无顺序依赖
- 墙钟预算：90 秒（当前实际运行时间约 37 秒）

### 23.4 刻意排除项

| 排除项 | 原因 |
|--------|------|
| Playwright-Electron E2E | 延后至独立 spec，不阻塞本轮 |
| 真实 LLM API 测试 | 模型质量不在自动化测试范围内；Agent 通过确定性 mock 验证 |
| 真实网络访问 | 本地优先架构，测试中通过 fetch 守卫强制禁止 |

### 23.5 临时放宽

- 全局覆盖率阈值当前未完全达标（实际约 67% vs 目标 80%）——随着更多边缘场景补充测试，覆盖率将持续提升。该放宽已记录，不会静默成为永久状态。

### 23.6 验证记录

| 时间 | 操作 | 结果 |
|------|------|------|
| 2026-05-19 | `npm test`（含 shuffle） | 通过，633+ 测试全部绿色 |
| 2026-05-19 | `npm run test:coverage` | 通过，生成 `text-summary` + `lcov` 报告 |
| 2026-05-19 | 属性测试（fast-check） | 9 项属性测试通过 |
| 2026-05-19 | 墙钟预算检查 | ~37 秒，远低于 90 秒上限 |

### 23.7 审计结论

本轮 `comprehensive-testing` spec 已完成核心范围：三层测试架构落地、9 项属性测试验证核心不变量、覆盖率门禁配置完毕、乱序执行确认无顺序依赖、文档已同步。测试体系为后续迭代提供了回归保护基线。
