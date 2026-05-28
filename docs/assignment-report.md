# Diet Agent — Assignment 2 Submission Report

> 本文档面向 Assignment 2 评审，逐条对应 rubric 给出项目证据。需要更细的内容请展开对应链接。
>
> - 演进路线与产品需求：[`PRD.md`](./PRD.md)
> - 系统架构与时序图：[`architecture.md`](./architecture.md)
> - 评测与示例任务：[`evaluation.md`](./evaluation.md)
> - 局限、失败案例与取舍：[`critical-reflection.md`](./critical-reflection.md)
> - 测试体系：[`../TESTING.md`](../TESTING.md)
> - 演示脚本：[`demo-script.md`](./demo-script.md)（如已生成）

## 0. 一行简介

**Diet Agent** 是一个名为「猫猫虫」的桌面端饮食教练 Agent。它接管用户的"目标设定 → 饮食记录 → 计划偏差监控 → 长期偏好学习"全流程：用户给目标，Agent 自己拆步骤、调工具、记录偏好、定时检查并主动提醒。基于 Electron + React + TypeScript，本地优先，兼容任何 OpenAI Chat Completions 风格的 LLM。

## 1. Problem Definition and Motivation (10%)

### 1.1 要解决的具体问题

普通人想"管好自己的吃"，通常会卡在四个地方：

1. **记录困难**：传统饮食 App 要求选食材、填克数，5 分钟一顿，三天就放弃。
2. **计划是死的**：减脂模板给一份"早午晚加餐每餐多少 kcal"，但中午临时多吃了 500 kcal 后没人告诉你"晚餐要减多少"。
3. **提醒太蠢**：到点叮一下"该吃饭了"，但今天明明已经记过早餐，它还在 9 点弹。
4. **忘了用户是谁**：每次都要重新解释"我对花生过敏"、"我不喝牛奶"、"我晚上 9 点才下班"。

### 1.2 为什么这是一个 Agent 问题而不是一个表单问题

| 维度 | 表单 / 静态 App | 单轮 Chatbot | Agent ✅ |
|---|---|---|---|
| 目标分解 | 用户自己拆 | 用户自己拆 | 自动从「目标体重」推导每日 kcal 与三餐比例 |
| 多步推理 | 不会 | 一轮就回 | 先 `recall` 偏好 → `check_today_plan_gap` → `find_foods_by_criteria` → `add_meal` → 回复 |
| 主动行为 | 死定时 | 不会主动 | 上下文感知：未记录餐次、计划偏差、连续忽略自动暂停 |
| 长期记忆 | 字段固定 | 上下文窗口内 | 持久化偏好/过敏/作息，对话后异步提炼候选记忆 |
| 数据可审计 | 直接改 | N/A | 写操作进入待确认/审核状态，可回滚 |

→ 也就是说，agentic approach 在这里**不是为了用 LLM 而用**，而是因为"基于上下文做决定 + 调用真实工具 + 持续学习"这件事，正是 agent 范式的核心擅长。

### 1.3 选这个题目的额外动机

- 数据敏感：饮食 / 健康 / 体重数据天然要本地化 → 验证了"轻量本地 Agent"是否可行。
- 高频低噪：日均 3~5 次交互，正好考察 Agent 的**长期记忆**和**主动行为**。
- 可观察可量化：是否记录、偏差多少、提醒是否被采纳，全部都有数字，便于评测（见 `evaluation.md`）。

## 2. Agentic Behavior (25%)

### 2.1 Agentic 能力矩阵

| Rubric 关键词 | 项目对应实现 | 主要证据 |
|---|---|---|
| **Goal-directed action** | Express Onboarding（5 字段 60 秒）→ 生成 `PersonalDietPlan`（含三餐比例和宏量目标）→ 后续所有 tool 调用以该 plan 为参考 | `src/renderer/src/coaching/expressOnboarding.ts`、`src/renderer/src/planning/engine.ts` |
| **Multi-step reasoning** | Agent Controller 实现 ≤6 轮 tool-call 循环：搜菜谱 → 估算热量 → 写入饮食 → 计划差值检查 → 生成建议 | `src/renderer/src/agent/controller.ts:174-240` |
| **Planning** | 静态 plan（年度目标）+ 动态 plan（每日剩余 kcal、各餐 gap、补/减餐策略）双层 | `src/renderer/src/planning/engine.ts`、`src/renderer/src/planning/dynamicPlan.ts` |
| **Decision making** | provider-aware 工具子集选择、tool-call 死循环检测、autopilot vs precision 信任旋钮 | `controller.ts:117-144`（`selectAgentTools`）、`coaching/trustDial.ts` |
| **Tool use** | **37 个工具**：查询 8、记录 5、计划 7、记忆 6、知识库 4、校准 4、提醒偏好 2、导航 1 | `src/renderer/src/agent/tools.ts`（见下方 §2.2） |
| **Memory** | 长期事实存储 7 类（preference/allergy/avoidance/habit/schedule/health_note/goal）、置信度评分、对话后异步提炼候选 → "待确认"状态 | `memory/manager.ts`、`memory/postChatExtraction.ts` |
| **Interaction with environment** | 读写本地 dietLog / settings / Dexie；触发 OS 通知；操作系统托盘；按需打开应用内页面 | `agent/tools.ts` 的 `add_meal`、`update_settings`、`navigate_to`；`src/main/index.ts` 托盘与 OS notification |
| **Proactive behavior** | 前台 10 分钟 tick + 主进程 30 分钟后台 tick；静音时段、冷却时间、连续忽略 24h 暂停、升级阈值 | `coaching/reminderScheduler.ts:1-95`、`src/main/index.ts:32-55` |
| **Knowledge retrieval (RAG)** | 本地轻量知识库：常见食物营养、计划偏差处理原则、安全边界。第一阶段词法检索，按需懒加载 embedding 模型 | `knowledge/retriever.ts`、`knowledge/embedder.ts` |
| **Safety / guardrails** | 过激措辞替换、医嘱/孕期/未成年保守模式、过敏忌口优先级最高（property test 强制） | `planning/dynamicPlan.ts:74-83`、`coaching/__tests__/allergyFilter.property.test.ts` |
| **Auditability** | 所有动态调整、主动提醒、菜谱校准都进入本地审计表，带原值/新值/时间戳/用户响应 | Dexie schema in `stores/planning.ts`、`stores/recipeCalibration.ts` |

### 2.2 工具清单（37 个）

按职责分类：

**数据查询 (8)**
`get_today_nutrition`、`get_diet_log`、`get_week_summary`、`get_settings`、`get_current_plan`、`get_meal_plans`、`get_proactive_event_history`、`get_user_rhythm_summary`

**饮食记录 (5)**
`add_meal`、`add_custom_food_meal`、`remove_meal_item`、`update_settings`、`analyze_nutrition_balance`

**菜谱 (4)**
`search_recipe`、`get_recipe_detail`、`get_recipes_by_category`、`recommend_recipe`

**计划 (7)**
`check_today_plan_gap`、`suggest_plan_adjustment`、`record_adjustment_response`、`suggest_meal_plan`、`confirm_meal_plan`、`validate_recipe_library`、`update_reminder_preferences`

**长期记忆 (6)**
`remember`、`recall`、`forget`、`list_user_facts`、`update_memory_confidence`、`get_user_rhythm_summary`（与查询重叠，但语义上属于"记忆/节奏"读取）

**知识库 (4)**
`search_knowledgebase`、`lookup_food_nutrition`、`find_foods_by_criteria`、`get_guideline_advice`

**校准 (3)**
`estimate_recipe_nutrition`、`list_recipe_calibrations`、`review_recipe_calibration`

**导航 (1)**
`navigate_to`

### 2.3 一个真实的多步 agent loop（示例）

用户输入："我中午吃了宫保鸡丁和米饭，对了我对花生过敏。"

Agent 实际行为（来自 `controller.ts` 的 tool-call 循环）：

1. 第 1 轮 → LLM 返回 `tool_calls`: `search_recipe("宫保鸡丁")`、`search_recipe("米饭")`、`remember(type=allergy, content="花生过敏", confidence=0.95)`
2. 第 2 轮 → 工具结果回传，LLM 决定调用 `add_meal({ lunch, items: [kung-pao-chicken, rice] })`
3. 第 3 轮 → `add_meal` 内部触发 `evaluateDailyPlanAdjustment` → 如果偏差超过 25% 或 200 kcal，写入 `DailyPlanAdjustment` 审计
4. 第 4 轮 → LLM 生成最终回复："喵~ 已经记下来了，今天剩 ___ kcal，晚餐建议清淡点。另外我记住你对花生过敏啦，下次推荐不会出现含花生的菜🐛"

这一个 loop 内同时演示了：**目标导向**（剩余 kcal 推导建议）、**多步推理**（≥4 个工具串行）、**记忆**（remember + 立刻应用）、**主动建议**（不需要用户问就给出晚餐策略）、**安全过滤**（recall 在下次推荐时阻止花生菜）。

## 3. System Design and Architecture (20%)

详细架构、时序图、模块职责表见 [`architecture.md`](./architecture.md)。下面是 grader 应该看到的关键事实：

- **三进程分离**：Main / Preload / Renderer，API Key 在主进程通过 `safeStorage` 加密，渲染进程拿不到原 key。
- **Agent Controller**（`controller.ts`，241 行）：MAX_TOOL_ROUNDS=6、MAX_HISTORY_MESSAGES=20、provider-aware 工具子集、tool-call signature 死循环检测。
- **认知层 4 大模块**：Memory（管理器 + 匹配器 + 对话后提炼）、Knowledge（retriever + embedder + reranker）、Planning（engine + dynamicPlan）、Rhythm Summary。
- **主动层 4 个组件**：reminderScheduler、proactiveRules、planDriftMonitor、autopilotPlanner。
- **持久化**：`localStorage`（settings/dietLog/chatHistory/calibration）+ Dexie 数据库 `diet-agent-planning`（profile/plan/memory/proactive events/adjustments/plannedMeals）。
- **可演化**：Tool 系统是声明式注册表，加新工具只需要往 `toolDefinitions` push 一条 + 在 `executeToolCall` 加一个 case，不必动 controller。

## 4. Implementation Quality (20%)

### 4.1 工程指标

| 项目 | 数值 |
|---|---|
| 代码语言 | TypeScript 5（strict 模式） |
| 主流程模块 | 30+（agent / coaching / planning / memory / knowledge / proactive / habits / stores / pages / components） |
| Agent 工具数 | 37 |
| 测试文件 | 52+ |
| 单元/组件测试用例 | 数百个（详见 `TESTING.md`） |
| 属性测试 invariants | 9 项 |
| 测试预算 | 全套 ≤90 秒 |
| 覆盖率门禁 | 全局 ≥80% 行 / ≥70% 分支；UI ≥50% 行 / ≥40% 分支 |
| 数据校验脚本 | `npm run validate:recipes`（重复 ID、缺失字段、异常热量、宏量偏差） |

### 4.2 超越 prompt / 静态 chatbot 的具体证据

1. **真正读写本地数据**：`add_meal` / `update_settings` / `remember` 不是返回字符串，是真的写到 localStorage 和 Dexie。
2. **真正的多轮 tool-call**：MAX_TOOL_ROUNDS=6，死循环检测，已经在 controller.test.ts 中覆盖。
3. **真正的主动行为**：哪怕用户没有打开聊天页，10 分钟前台 tick + 30 分钟后台 tick 也会自动检查未记录餐次并弹通知。
4. **真正的长期记忆**：跨 session 持久化，下次启动还在；并且支持"待确认"状态由用户在设置页采纳/丢弃。
5. **真正的安全边界**：API Key 主进程加密、过激措辞替换、过敏过滤 property test 强制不变量。

### 4.3 Demo runnable

```bash
npm install
npm run dev               # 启动 Electron + Vite 开发模式
# 或
npm run build && npm run start
```

走通 quickstart 见 [`README.md`](../README.md#5-分钟-demo-跑通)。

## 5. Evaluation and Testing (10%)

详见 [`evaluation.md`](./evaluation.md)。摘要：

- **8 个 example tasks**：从"记录单餐"到"过敏记忆生效"到"未记录餐次自动提醒"到"计划偏差自动建议"，覆盖 rubric 关键能力维度。
- **成功案例 + 失败案例**：包括 tool-call 死循环兜底、LLM 不支持 tool_calls 自动降级、菜谱库 miss 触发自定义食物估算、不熟悉食物估算偏差等。
- **性能数据位**：启动时间、agent 单轮平均延迟、token 使用量（`src/main/agent.ts` 中已有 usage stats 持久化）。
- **9 项属性测试不变量**：解析往返、静音时段、过敏过滤、估算自洽、计划不可变、菜谱校验、节奏幂等、记忆顺序无关、计划差值算术。
- **测试隔离保证**：无真实网络、无真实时钟、无跨测试持久状态、未刷新定时器自动失败。

## 6. Critical Reflection (10%)

详见 [`critical-reflection.md`](./critical-reflection.md)。摘要：

- **限制**：依赖远程 LLM、热量估算精度有限、本地单机无云同步、本地知识库为词法检索、拍照识别仅基于视觉 LLM。
- **失败模式**：断网、模型不支持 tool_calls、用户输入歧义、长对话超上下文、菜谱库 miss。
- **取舍**：Agent 在渲染进程 vs 主进程、本地优先 vs 多端、autopilot vs precision、记忆置信度阈值、提醒频率 vs 打扰。
- **未来**：云同步、原生 CV、强 embedding、移动端、可穿戴。

## 7. Demo Quality (5%)

- 视频脚本：[`demo-script.md`](./demo-script.md)（5 分钟，覆盖 problem → architecture → onboarding → agent tool call → memory → proactive reminder → reflection 七个点）。
- 应用内截图：见 `README.md` 顶部。

## 附录 A：代码结构地图

```
Diet Agent/
├─ docs/                              ← 设计文档与本作业报告
│  ├─ assignment-report.md            ← 本文件
│  ├─ architecture.md                 ← 系统架构 + 时序图
│  ├─ evaluation.md                   ← 评测与示例任务
│  ├─ critical-reflection.md          ← 反思
│  ├─ demo-script.md                  ← 视频旁白稿
│  ├─ PRD.md
│  ├─ agent-chat-design.md
│  ├─ planning-flow-design.md
│  ├─ proactive-agent-dynamic-plan-design.md
│  ├─ recipe-data-governance.md
│  └─ development-log.md
├─ src/
│  ├─ main/                           ← Electron 主进程
│  │  ├─ index.ts                     ← 窗口、托盘、后台 tick、IPC 注册
│  │  ├─ agent.ts                     ← LLM 代理、safeStorage API Key、usage stats
│  │  └─ dietLog.ts
│  ├─ preload/                        ← contextBridge IPC 暴露层
│  ├─ shared/                         ← 主/渲染共享类型
│  └─ renderer/src/
│     ├─ agent/                       ← Agent 控制器、prompt、tool 注册
│     │  ├─ controller.ts             ← Tool-call 循环 + provider 过滤
│     │  ├─ prompt.ts                 ← System prompt 组装
│     │  └─ tools.ts                  ← 37 个工具的定义与执行
│     ├─ planning/                    ← 计划引擎 + 动态计划
│     ├─ coaching/                    ← 教练模块（提醒/onboarding/drift/autopilot...）
│     ├─ memory/                      ← 长期记忆
│     ├─ knowledge/                   ← 知识库 retriever
│     ├─ habits/                      ← 节奏摘要
│     ├─ proactive/                   ← 提醒规则 + UI 浮层
│     ├─ stores/                      ← 数据访问层
│     ├─ pages/                       ← 5 个主页面
│     └─ components/                  ← React UI 组件
└─ TESTING.md                         ← 测试体系文档
```

## 附录 B：自评分预估

| 维度 | 预估分 | 主要依据 |
|---|---|---|
| Problem definition (10) | 9 | §1 给出表格对比"为什么是 agent" |
| Agentic behavior (25) | 23 | §2.1 能力矩阵 + 37 工具 + 真实 4 步 tool loop 示例 |
| System design (20) | 17 | `architecture.md` 三视图（组件 / 控制器 / 时序）+ 模块职责表 |
| Implementation (20) | 18 | 52+ 测试、属性测试、覆盖率门禁、真实主动行为 |
| Evaluation (10) | 9 | `evaluation.md` 8 task + 失败案例 + 性能数据 |
| Critical reflection (10) | 9 | `critical-reflection.md` 四节齐全 |
| Demo (5) | 4 | `demo-script.md` 待按稿录制 |
| **总分** | **89/100** | 假设 demo 视频按脚本完成 |
