# Proactive Dietary Coaching Agent MVP 实现说明

本文档简要说明当前项目已经实现的智能饮食 Agent 原型能力。实现重点不是聊天，而是让 Agent 在应用内形成可演示、可审计、可控制的闭环：感知输入、做出决策、采取行动、利用记忆，并保持安全边界。

## 1. Agent Check / Tick

应用启动后会自动注册前台定时检查和后台提醒 tick 监听，并在启动时执行一次初始检查。

核心实现位置：

- `src/renderer/src/App.tsx`
- `src/renderer/src/coaching/reminderScheduler.ts`
- `src/renderer/src/coaching/types.ts`

Agent Check 当前会读取并判断：

- 当前时间。
- 今日饮食记录。
- 当前提醒设置。
- 静音时段。
- 同类提醒冷却时间。
- 近期 proactive event 历史。
- 同类提醒连续 dismiss 次数。
- 餐次是否已经记录。

每次检查都会返回结构化结果，便于 UI 展示和测试断言。关键字段包括：

- `triggered`：本次是否触发提醒。
- `delivered`：是否真正投递给用户。
- `ruleId`：命中的规则，例如 `coaching_breakfast_reminder`。
- `reason`：判断结果原因，例如 `fired`、`already_logged`、`quiet_hours`、`cooldown`、`dismiss_pause`。
- `skipReason`：未触发时的跳过原因。
- `isQuiet`：是否处于静音时段。
- `isCoolingDown`：是否处于冷却中。
- `isAlreadyLogged`：对应餐次是否已记录。
- `isDismissPaused`：是否因为连续忽略而暂停。
- `dismissCount`：同类提醒连续忽略次数。
- `cooldownUntil` / `pauseUntil`：冷却或暂停结束时间。
- `evaluatedRules`：本次检查中每条规则的判断细节。

行为规则：

- 早餐时间后未记录早餐，会触发 `coaching_breakfast_reminder`。
- 已记录早餐时，不提醒，并记录 `already_logged`。
- 静音时段内不提醒，只写入审计事件。
- 冷却期内不重复提醒。
- 同类提醒连续 dismiss 3 次后，至少 24 小时内暂停该类提醒，降低打扰。
- 未触发的检查也会写入 `agent_check` proactive event，用于 Agent Activity 展示和审计。

## 2. 餐后偏差判断与动态建议

用户新增或删除饮食记录后，Agent 会检查今日实际摄入与计划目标的差距，并生成 `DailyPlanAdjustment`。

核心实现位置：

- `src/renderer/src/planning/dynamicPlan.ts`
- `src/renderer/src/stores/planning.ts`
- `src/renderer/src/pages/DietLog.tsx`

当前支持三类建议：

- `supplement`：实际摄入明显低于计划，建议温和补充。
- `reduce`：实际摄入明显高于计划，建议下一餐清淡一些。
- `maintain`：接近计划，给出低打扰的保持建议。

判断示例：

- 午餐计划 800 kcal，实际 400 kcal，生成 `supplement`。
- 午餐计划 800 kcal，实际 1200 kcal，生成 `reduce`。
- 实际摄入接近计划时，生成 `maintain` 或低打扰说明。

建议会持久化到本地 Dexie 数据库，并写入审计记录。用户可以对建议执行：

- `accept`
- `dismiss`
- `snooze`

反馈会通过 `updateDailyPlanAdjustmentResponse` 持久化，并刷新 UI。

## 3. Agent Activity / Agent Inbox

首页新增了 Agent Activity 区块，用来展示 Agent 最近的判断、提醒、建议和用户反馈。

核心实现位置：

- `src/renderer/src/components/AgentActivity.tsx`
- `src/renderer/src/components/AgentActivity.css`
- `src/renderer/src/pages/Home.tsx`

当前展示内容包括：

- 最近 proactive events。
- 最新 daily plan adjustment。
- 规则 ID。
- 触发或判断时间。
- Agent message / suggestion。
- 用户反馈状态 `userResponse`。
- 关键 payload，例如：
  - `mealType`
  - `dismissCount`
  - `deltaCalories`
  - `reason`
  - `skipReason`
  - `cooldownUntil`
  - `pauseUntil`

UI 提供 `Run Agent Check Now` 手动按钮，方便演示和测试。点击后会立即运行一次 Agent Check，并把新的判断结果写入本地事件历史，随后刷新 Agent Inbox。

对于动态计划建议，Agent Activity 中支持直接点击：

- `Accept`
- `Snooze`
- `Dismiss`

状态会持久化，不只是前端临时状态。

## 4. Agent Tools

聊天工具侧补齐了和 proactive coaching 相关的工具能力，工具不依赖真实 API key，可被测试和 mock。

核心实现位置：

- `src/renderer/src/agent/tools.ts`

新增或增强的工具：

- `get_proactive_event_history`
  - 查询最近主动提醒和 Agent 判断历史。
  - 支持用户问“最近你提醒过我什么？”

- `update_reminder_preferences`
  - 更新提醒偏好，例如总开关、餐次提醒、静音时段、冷却时间。
  - 支持 `disableMealRemindersToday`，用于“今天别提醒我吃饭了”。
  - 该能力不会永久关闭餐次提醒，而是为早餐、午餐、晚餐三类规则写入当天剩余时间的 snooze/cooldown 事件。

- `check_today_plan_gap`
  - 查询指定日期实际摄入与计划的差值。
  - 支持用户问“今天还差多少热量？”
  - 日期参数会校验为 `YYYY-MM-DD`。

- `suggest_plan_adjustment`
  - 根据当前计划差值生成动态计划建议，并保存审计记录。
  - 支持用户说“我午餐吃少了，晚上怎么调整？”

- `record_adjustment_response`
  - 记录用户对动态建议的反馈。
  - 支持 `accepted`、`dismissed`、`snoozed`。

这些工具保持了安全边界：不会自动删除饮食记录，不会直接修改正式计划，只会生成建议或记录用户偏好/反馈。

## 5. Memory 与个性化建议

动态计划建议会读取用户画像和长期记忆，并把这些信息纳入建议生成。

核心实现位置：

- `src/renderer/src/planning/dynamicPlan.ts`
- `src/renderer/src/memory/manager.ts`
- `src/renderer/src/stores/planning.ts`

已支持的记忆影响：

- 如果用户记忆或画像中出现“乳糖不耐受”“不喝牛奶”“不吃奶制品”等信息，补餐建议不会优先推荐牛奶或酸奶。
- 如果用户连续 dismiss 同类提醒 3 次，提醒调度器会暂停该类提醒至少 24 小时。
- 用户对动态建议的反馈会被持久化，后续 UI 和历史记录可以看到该反馈。

## 6. Safety 安全边界

当前实现遵守以下安全约束：

- Agent 不会自动删除饮食记录。
- Agent 不会自动修改正式饮食计划。
- 动态计划只生成建议，正式计划仍需要用户确认。
- 提醒关闭或“今天别提醒我”不会偷偷改长期计划。
- 建议文本避免极端节食表达。
- 对以下场景使用更保守的文案，并提示优先咨询专业人士：
  - 未成年人。
  - BMI 偏低。
  - 怀孕或哺乳期。
  - 疾病、医生、药物、医嘱等健康备注。
  - 进食障碍相关风险。

文案层面会避免或替换以下方向：

- “跳过下一餐”
- “完全不吃”
- “极端节食”
- 用不吃饭来补偿

## 7. 审计与持久化

当前 Agent 行为会落到本地可追踪记录中。

主要持久化内容：

- `ProactiveEvent`
  - 真实提醒事件。
  - 未触发的 Agent Check 判断事件。
  - 用户当天 snooze 三餐提醒的事件。

- `DailyPlanAdjustment`
  - 餐后偏差建议。
  - 建议类型、计划热量、实际热量、差值、推荐动作。
  - 用户反馈。

- `CoachingAuditEntry`
  - 动态建议保存审计：`daily_plan_adjustment.saved`。
  - 用户反馈审计：`daily_plan_adjustment.response`。

这些记录会被 Agent Activity 读取和展示。

## 8. 当前可演示场景

可以通过 UI 或测试数据演示以下场景：

- 早餐时间后没有早餐记录，点击 `Run Agent Check Now` 后出现早餐提醒事件。
- 已经记录早餐，再运行 Agent Check，会出现 `already_logged` 的跳过记录。
- 当前处于静音时段时，不触发提醒，只记录 `quiet_hours`。
- 同类提醒处于冷却时，不重复触发，并记录 `cooldown`。
- 连续 dismiss 同类提醒 3 次后，后续 24 小时内记录 `dismiss_pause`。
- 午餐计划 800 kcal，实际 400 kcal，生成补充建议。
- 午餐计划 800 kcal，实际 1200 kcal，生成下一餐清淡建议。
- 点击动态建议的 `dismiss` 后，刷新页面仍能看到已 dismissed 状态。
- 用户说“今天别提醒我吃饭了”时，工具会为三餐提醒写入当天 snooze 事件，而不是永久关闭提醒设置。

## 9. 自动化测试与验证

本轮实现补充了以下测试覆盖：

- Scheduler：提醒触发、静音跳过、冷却跳过、已记录跳过、连续 dismiss 暂停、结构化结果和 skip audit。
- Dynamic plan：`supplement`、`reduce`、`maintain`、乳糖不耐受记忆、安全保守文案。
- Store/audit：建议保存审计、用户反馈持久化和反馈审计。
- UI：Agent Activity 渲染、手动 Agent Check 更新、反馈按钮状态更新。
- Tools：日期校验、计划差值查询、建议保存、反馈记录、提醒偏好更新和当天三餐 snooze。

已通过验证命令：

```bash
npm test
npm run build
```

