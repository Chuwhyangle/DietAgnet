# 猫猫虫对话 Agent - 技术设计文档

> 最后更新: 2026-05-12

## 1. 需求概述

在应用中加入一个**对话框**，用户可以跟猫猫虫 Agent 自然对话。Agent 通过调用 LLM API 理解用户意图，并能够**查看、修改、执行**应用内的各种操作。

## 2. 核心架构：Tool Use（工具调用）

### 2.1 什么是 Tool Use？

现代 LLM API（Claude、OpenAI、DeepSeek、通义千问等）都支持一种叫 **Function Calling / Tool Use** 的能力：

1. 你定义一组 **工具**（函数），告诉 AI「你可以调用这些功能」
2. 用户发消息，连同工具定义一起发给 API
3. AI 理解用户意图后，返回「我要调用 XX 工具，参数是 YY」
4. 你的代码**执行这个工具**，把结果返回给 AI
5. AI 根据执行结果，生成自然语言回复给用户

**关键点**：AI 本身不能直接操作你的应用，它只是「说」想调用什么工具。你的代码负责真正执行。

### 2.2 架构图

```
┌──────────────────────────────────────────────────┐
│                   Diet Agent 应用                  │
│                                                    │
│  ┌──────────┐    ┌──────────────┐    ┌─────────┐  │
│  │  对话 UI  │◄──►│  Agent 控制器  │◄──►│ LLM API │  │
│  │  (聊天框)  │    │  (调度中心)    │    │ (远程)  │  │
│  └──────────┘    └──────┬───────┘    └─────────┘  │
│                         │                          │
│                         ▼                          │
│              ┌─────────────────────┐               │
│              │    工具注册表         │               │
│              │                     │               │
│              │  🔧 get_recipes     │               │
│              │  🔧 search_recipe   │               │
│              │  🔧 add_meal        │               │
│              │  🔧 get_today_log   │               │
│              │  🔧 get_nutrition   │               │
│              │  🔧 update_settings │               │
│              │  🔧 recommend       │               │
│              │  🔧 ...             │               │
│              └──────────┬──────────┘               │
│                         │                          │
│                         ▼                          │
│              ┌─────────────────────┐               │
│              │    应用数据层         │               │
│              │                     │               │
│              │  📦 localStorage    │               │
│              │  📦 菜谱数据         │               │
│              │  📦 饮食记录         │               │
│              │  📦 用户设置         │               │
│              └─────────────────────┘               │
│                                                    │
└──────────────────────────────────────────────────┘
```

### 2.3 一次完整对话流程

**用户说**：「我今天中午吃了宫保鸡丁和米饭」

```
步骤1: 用户输入发送到 Agent 控制器

步骤2: Agent 控制器组装请求发给 LLM API
       ├── system prompt（猫猫虫人设 + 当前日期等）
       ├── tools（工具定义列表）
       └── user message（「我今天中午吃了宫保鸡丁和米饭」）

步骤3: LLM API 返回 tool_use 请求
       ├── 调用 search_recipe("宫保鸡丁") → 找到菜谱，id="kung-pao-chicken"
       └── 调用 search_recipe("米饭")     → 找到菜谱，id="rice"

步骤4: Agent 控制器执行工具，把结果返回给 LLM API
       ├── search_recipe 结果: { id: "kung-pao-chicken", calories: 300, ... }
       └── search_recipe 结果: { id: "rice", calories: 200, ... }

步骤5: LLM 看到结果后，再调用 add_meal 工具
       └── 调用 add_meal({ date: "2026-05-11", type: "lunch", items: [...] })

步骤6: Agent 控制器执行 add_meal，写入 localStorage，返回成功

步骤7: LLM 生成最终回复
       └── 「帮你记好啦！🐛 今天午餐吃了宫保鸡丁和米饭，
            共摄入 500kcal，蛋白质 30g。继续加油喵～✨」

步骤8: 对话 UI 显示回复
```

## 3. 工具（Tools）定义

以下是猫猫虫 Agent 可以使用的工具清单。每个工具都有明确的**名称、描述、参数、返回值**。

### 3.1 查看类工具（读取数据）

#### `get_today_nutrition`
- **描述**：获取今天的营养摄入汇总
- **参数**：无
- **返回**：`{ calories, protein, carbs, fat, mealCount }`
- **场景**：「我今天吃了多少卡路里？」

#### `get_diet_log`
- **描述**：获取指定日期的饮食记录
- **参数**：`{ date: string }` — 日期，格式 YYYY-MM-DD
- **返回**：`{ date, meals: [{ type, items: [...] }] }`
- **场景**：「我昨天吃了什么？」

#### `get_week_summary`
- **描述**：获取本周/指定周的营养汇总
- **参数**：`{ startDate?: string }`
- **返回**：`{ days: [{ date, calories, protein, carbs, fat }], average: {...} }`
- **场景**：「这周我吃得怎么样？」

#### `search_recipe`
- **描述**：按关键词搜索菜谱
- **参数**：`{ keyword: string }`
- **返回**：`[{ id, name, category, calories, nutrition }]`
- **场景**：「有没有低卡的菜？」「鸡肉能做什么？」

#### `get_recipe_detail`
- **描述**：获取菜谱详情
- **参数**：`{ recipeId: string }`
- **返回**：`{ name, ingredients, steps, nutrition, ... }`
- **场景**：「番茄炒蛋怎么做？」

#### `get_recipes_by_category`
- **描述**：按分类获取菜谱列表
- **参数**：`{ category: string }`
- **返回**：`[{ id, name, calories, ... }]`
- **场景**：「有什么汤可以喝？」

#### `get_settings`
- **描述**：获取当前用户设置
- **参数**：无
- **返回**：`{ nickname, calorieGoal }`
- **场景**：Agent 需要知道用户名和目标时内部调用

### 3.2 修改类工具（写入数据）

#### `add_meal`
- **描述**：添加一条饮食记录
- **参数**：`{ date: string, mealType: "breakfast"|"lunch"|"dinner"|"snack", recipeId: string, servings?: number }`
- **返回**：`{ success: true, totalCalories: number }`
- **场景**：「我午餐吃了番茄炒蛋」

#### `remove_meal_item`
- **描述**：删除一条饮食记录中的某个食物
- **参数**：`{ date: string, mealType: string, itemIndex: number }`
- **返回**：`{ success: true }`
- **场景**：「把今天早餐的鸡蛋删掉」

#### `update_settings`
- **描述**：更新用户设置
- **参数**：`{ nickname?: string, calorieGoal?: number }`
- **返回**：`{ success: true }`
- **场景**：「把我名字改成小猫」「目标设成 1800 卡」

### 3.3 智能类工具（逻辑推荐）

#### `recommend_recipe`
- **描述**：根据条件推荐菜谱
- **参数**：`{ preference?: string, maxCalories?: number, category?: string, excludeIds?: string[] }`
- **返回**：`[{ id, name, calories, reason }]`
- **场景**：「今晚吃什么？」「推荐个低卡的」

#### `analyze_nutrition_balance`
- **描述**：分析今日/本周营养平衡
- **参数**：`{ period: "today"|"week" }`
- **返回**：`{ summary, suggestions: string[] }`
- **场景**：「我最近营养均衡吗？」

### 3.4 执行类工具（操作应用）

#### `navigate_to`
- **描述**：跳转到应用的某个页面
- **参数**：`{ page: "home"|"recipes"|"diet-log"|"settings" }`
- **返回**：`{ success: true }`
- **场景**：「打开菜谱页」「去设置看看」

## 4. System Prompt（猫猫虫人设）

发送给 LLM API 的系统提示词，定义猫猫虫的性格和行为：

```
你是「猫猫虫」，一只可爱的饮食小助手。你住在用户的电脑里，陪伴用户管理每日饮食。

## 你的性格
- 可爱、俏皮、温暖
- 说话会用 emoji，语气亲切（如「喵~」「呀」「哦」「嘿嘿」）
- 关心用户的饮食健康，但不会唠叨
- 会用鼓励的方式提醒用户注意饮食

## 你的能力
- 你可以通过工具来查看和操作用户的饮食数据
- 你可以帮用户记录饮食、搜索菜谱、推荐美食、查看营养统计
- 你可以帮用户修改设置

## 行为准则
- 用户说吃了什么，主动帮记录（调用 add_meal），不要只口头回复
- 用户问营养情况，先调用工具获取真实数据，不要编造数字
- 推荐菜谱时，调用 search_recipe 或 recommend_recipe，基于真实菜谱库推荐
- 回复简洁友好，不要太长
- 如果用户说的菜不在菜谱库中，诚实告知，可以建议相近的菜

## 当前上下文
- 用户昵称: {nickname}
- 每日卡路里目标: {calorieGoal} kcal
- 今天日期: {today}
- 当前时间段: {timeOfDay}
```

## 5. 对话 UI 设计

### 5.1 入口方式

**当前落地：左侧栏正式对话页 + 可拖动右下角快捷入口**

```
┌────────────────────────────────────┐
│  侧边栏  │      主内容区            │
│          │                         │
│  🏠 首页  │    （当前页面内容）       │
│  🍳 菜谱  │                         │
│  📝 记录  │                         │
│  🤖 对话  │                         │
│  ⚙️ 设置  │                    ┌────┤
│          │                    │ 💬 │ ← 可拖动快捷入口
│          │                    └────┤
└──────────┴─────────────────────────┘

点击左侧栏“AI 对话”后进入正式工作区：

┌────────────────────────────────────┐
│  侧边栏  │      主内容区            │
│          │   ┌────────────────────┤
│          │   │ 🐛 猫猫虫 AI 对话页 │
│          │   │────────────────────│
│          │   │ 对话消息            │
│          │   │ ...                │
│          │   │────────────────────│
│          │   │ [输入框]            │
│          │   └────────────────────┤
└──────────┴─────────────────────────┘
```

补充说明：

- 右下角入口只作为快捷入口，不再承载正式对话面板
- 快捷入口支持拖动位置，减少遮挡主流程操作
- 快捷入口层级低于抽屉 / 模态层，避免遮挡“保存并继续”等按钮

### 5.2 消息气泡样式

- **猫猫虫消息**：左侧，带 🐛 头像，浅粉背景，圆角气泡
- **用户消息**：右侧，薰衣草紫背景
- **工具执行提示**：居中小字灰色（如「🔧 已帮你记录午餐」），让用户知道 Agent 做了什么
- **加载状态**：猫猫虫打字动画（三个跳动的点）

### 5.3 快捷操作

对话框底部可选显示常用快捷按钮：
- 「☀️ 记录午餐」「🌙 记录晚餐」「🍳 推荐菜谱」「📊 今日统计」

## 6. API 调用流程（代码层面）

### 6.1 发送请求的伪代码

```typescript
// Agent 控制器核心逻辑

async function chat(userMessage: string): Promise<string> {
  // 1. 构建消息历史
  const messages = [
    { role: "system", content: buildSystemPrompt() },
    ...chatHistory,
    { role: "user", content: userMessage }
  ]

  // 2. 调用 LLM API（带工具定义）
  let response = await callLLM({
    model: "选择的模型",
    messages,
    tools: ALL_TOOLS,  // 所有工具定义
  })

  // 3. 循环处理工具调用（LLM 可能连续调多个工具）
  while (response.hasToolCalls) {
    const toolResults = []
    
    for (const toolCall of response.toolCalls) {
      // 4. 执行工具，获取结果
      const result = await executeLocalTool(toolCall.name, toolCall.params)
      toolResults.push({ toolCallId: toolCall.id, result })
    }

    // 5. 把工具结果返回给 LLM，让它继续
    response = await callLLM({
      messages: [...messages, response.assistantMessage, ...toolResults],
      tools: ALL_TOOLS,
    })
  }

  // 6. 返回最终文本回复
  return response.text
}
```

### 6.2 工具执行器

```typescript
// 工具执行器 — 连接 AI 和应用数据

function executeLocalTool(name: string, params: any): any {
  switch (name) {
    case 'get_today_nutrition':
      // 直接读取 localStorage 中的今日数据并计算
      return calculateTodayNutrition()

    case 'add_meal':
      // 写入 localStorage + 更新 UI
      return addMealToLog(params.date, params.mealType, params.recipeId, params.servings)

    case 'search_recipe':
      // 搜索本地菜谱数据
      return searchRecipes(params.keyword)

    case 'update_settings':
      // 更新 localStorage 中的设置
      return updateUserSettings(params)

    case 'navigate_to':
      // 通过 React Router 跳转页面
      return navigateTo(params.page)

    // ... 其他工具
  }
}
```

### 6.3 工具的 JSON Schema 定义示例

以 `add_meal` 为例，发送给 API 的工具定义格式：

```json
{
  "type": "function",
  "function": {
    "name": "add_meal",
    "description": "添加一条饮食记录。当用户说吃了某样东西时调用此工具。",
    "parameters": {
      "type": "object",
      "properties": {
        "date": {
          "type": "string",
          "description": "日期，格式 YYYY-MM-DD，默认今天"
        },
        "mealType": {
          "type": "string",
          "enum": ["breakfast", "lunch", "dinner", "snack"],
          "description": "餐次类型"
        },
        "recipeId": {
          "type": "string",
          "description": "菜谱 ID，需先通过 search_recipe 查找"
        },
        "servings": {
          "type": "number",
          "description": "份数，默认 1"
        }
      },
      "required": ["date", "mealType", "recipeId"]
    }
  }
}
```

## 7. API 选择建议

| API 提供商 | 是否支持 Tool Use | 价格 | 备注 |
|-----------|:-:|------|------|
| DeepSeek (V3/R1) | ✅ | 极便宜（约 ¥1/百万 token） | 中文能力强，性价比最高 |
| 通义千问 (Qwen) | ✅ | 便宜（有免费额度） | 阿里云，国内访问快 |
| 智谱 GLM-4 | ✅ | 便宜 | 国内可用 |
| Moonshot (Kimi) | ✅ | 中等 | 长上下文好 |
| Claude Haiku | ✅ | 中等 | 质量高 |
| OpenAI GPT-4o-mini | ✅ | 中等 | 生态成熟 |

**推荐**: DeepSeek 或 通义千问，价格最低且支持 Tool Use。

## 8. 安全考虑

- **API Key 存储**：存在 Electron 主进程的安全存储中（electron-store 加密），不暴露给渲染进程
- **API 调用**：通过 Electron 主进程的 IPC 通道代理，渲染进程不直接调用
- **工具权限**：所有工具只操作本地数据，无网络风险
- **费用控制**：可设置每日 API 调用次数上限

```
渲染进程(对话UI) --IPC--> 主进程(Agent控制器) --HTTPS--> LLM API
                                  │
                                  ▼
                          工具执行(本地数据)
```

## 9. 对话历史管理

- 当前会话消息存在内存中
- 每次会话限制最近 20 条消息（控制 token 消耗）
- 可选：历史对话持久化到 localStorage
- 关闭对话框不清空，关闭应用才重置

## 10. 开发阶段规划

### 第一步：对话 UI（不接 API）
- 对话框组件（悬浮按钮 + 弹出面板）
- 消息气泡样式（猫猫虫风格）
- 快捷按钮
- 输入框 + 发送

### 第二步：工具系统
- 定义所有工具的接口
- 实现工具执行器（连接现有 stores）
- 工具调用结果的 UI 提示

### 第三步：接入 LLM API
- API Key 配置（设置页新增）
- Agent 控制器（消息组装 + 工具调用循环）
- System Prompt 管理
- 错误处理 + 加载状态

### 第四步：体验优化
- 对话上下文管理
- 费用统计显示
- 快捷操作优化
- 首次对话引导

## 11. 2026-05-11 落地状态与审计

### 11.1 已完成内容

- 已实现右下角悬浮按钮、弹出聊天面板、猫猫虫消息气泡、工具执行提示和打字加载态
- 已实现 13 个工具的定义与本地执行器，并接入现有菜谱、饮食记录、设置存储
- 已实现 Agent 控制器：系统提示词、上下文拼装、工具调用循环、最大轮数限制
- 已实现设置页模型提供商、Base URL、Model、API Key 配置
- 已实现主进程 LLM 代理和 API Key 安全存储

### 11.2 实际落地架构说明

- 为兼容当前应用把饮食记录和设置保存在渲染进程 `localStorage` 的现状，本次没有强行迁移数据层
- 实际实现中：
  - 渲染进程负责对话 UI、Agent 控制循环和本地工具执行
  - 主进程负责 API Key 安全存储和远程 LLM 请求代理
  - 页面导航与本地数据更新仍由渲染进程完成
- 这个方案保留了文档要求的安全边界：渲染进程无法直接读取已保存的 API Key

### 11.3 本轮未做

- 对话历史持久化到 localStorage
- 每日费用统计显示
- 首次对话引导
- 更细粒度的配额与调用次数限制

### 11.4 验证记录

- 已执行 `npm run build`
- 构建结果：通过

### 11.5 后续补丁记录

- 2026-05-11：设置页隐藏悬浮聊天控件，避免遮挡 AI 配置输入区
- 2026-05-11：自定义 API 通道支持填写完整 `/chat/completions` endpoint
- 2026-05-11：自定义通道配置为空时不再错误回退到 DeepSeek 默认地址和模型
- 2026-05-12：设置页新增连接诊断区，支持一键验证聊天与 Tool 调用链路
- 2026-05-12：主进程远端请求失败按认证失败、endpoint 不可达、模型不存在、不支持 tool calls、请求超时等分类输出
- 2026-05-12：左侧栏新增正式“AI 对话”页面，右下角悬浮入口改为可拖动快捷入口，避免遮挡首页计划抽屉和其他操作区
