# 菜谱热量校准与数据治理 - 需求设计文档

> 最后更新: 2026-05-13
> 状态: 部分落地

## 1. 目标

当前项目已经内置 130 道中西式菜谱，但热量和宏量营养仍属于估算数据。随着 Agent 开始做动态计划建议，菜谱热量的准确性会直接影响每日摄入、计划偏差和推荐质量。

本阶段目标：

1. 建立可审计的菜谱热量校准流程。
2. 使用 LLM 批量估算热量与宏量营养，但不直接覆盖正式数据。
3. 将校准结果先写入待审核记录，审核通过后再进入正式菜谱。
4. 拆分当前膨胀的数据文件，降低后续维护成本。
5. 建立数据校验脚本，保证每次新增或修正菜谱都能被检查。

## 2. 当前问题

- 原 `recipeExtensions.ts` 已超过 1500 行；当前已拆出中式、西式和类型定义文件，后续继续增加菜谱时需要保持拆分结构。
- 当前热量数据来源以人工估算为主，缺少修正依据和审核记录。
- 饮食记录、周报、Agent 推荐和后续动态计划都会依赖菜谱热量，错误数据会被持续放大。
- 如果后续引入 RAG、embedding 或更大的菜谱库，renderer bundle 会继续膨胀，需要提前规划按需加载。

## 3. 核心原则

- **LLM 只生成候选**：模型估算结果不得直接覆盖正式菜谱。
- **审核后生效**：每条热量修正必须经过人工确认或明确审核状态。
- **可回滚**：正式数据更新后仍保留原值和修正原因。
- **可定位**：校验报告必须定位到具体 `recipeId`。
- **先治理再扩量**：大规模扩展到 500+ 菜谱前，先完成数据拆分和校验脚本。

## 4. LLM 热量估算流程

### 4.1 输入

每次估算传入一组菜谱，包含：

- `recipeId`
- `name`
- `category`
- `ingredients`
- `steps`
- 当前 `calories`
- 当前 `nutrition`

### 4.2 输出要求

LLM 必须输出结构化 JSON，不允许只输出自然语言。

每条结果必须包含：

- `recipeId`
- `originalCalories`
- `estimatedCalories`
- `estimatedProtein`
- `estimatedCarbs`
- `estimatedFat`
- `reasoning`
- `confidence`
- `riskNotes`

### 4.3 生效规则

- 估算结果先进入待审核校准记录。
- 置信度低于 0.6 的记录默认标记为 `needs_review`。
- 热量变化超过原值 30% 的记录默认标记为 `needs_review`。
- 宏量营养折算热量与估算总热量偏差超过 25% 的记录默认标记为 `needs_review`。
- 只有 `approved` 状态的记录才能进入正式菜谱数据。

## 5. 数据模型

本节中的 `RecipeCalibrationRecord` 已完成第一阶段本地落地，当前存储在渲染进程本地审计记录中；后续如需要批量审核或跨设备同步，可再迁移到 Dexie 或后端。

### 5.1 `RecipeCalibrationRecord`

```typescript
interface RecipeCalibrationRecord {
  id?: number
  recipeId: string
  recipeName: string
  originalCalories: number
  originalNutrition: {
    protein: number
    carbs: number
    fat: number
  }
  estimatedCalories: number
  estimatedNutrition: {
    protein: number
    carbs: number
    fat: number
  }
  reasoning: string
  confidence: number
  riskNotes: string[]
  status: 'pending' | 'approved' | 'rejected' | 'needs_review'
  source: 'llm_estimate' | 'manual_review' | 'external_reference'
  model?: string
  reviewerNote?: string
  createdAt: string
  updatedAt: string
  appliedAt?: string
}
```

### 5.2 `RecipeValidationReport`

```typescript
interface RecipeValidationReport {
  id?: number
  generatedAt: string
  totalRecipes: number
  duplicateIds: string[]
  missingRequiredFields: Array<{
    recipeId: string
    field: string
  }>
  invalidNutrition: Array<{
    recipeId: string
    reason: string
  }>
  suspiciousCalories: Array<{
    recipeId: string
    calories: number
    reason: string
  }>
  categoryCounts: Record<string, number>
  status: 'passed' | 'warning' | 'failed'
}
```

## 6. 数据拆分方案

当前已完成第一步代码拆分，结构如下：

```text
src/renderer/src/data/
├── recipeTypes.ts              # Recipe / Ingredient / Nutrition 类型
├── recipes.ts                  # 统一导出 recipes
├── chineseRecipes.ts           # 基础中式菜谱 + 扩展中式菜谱
├── westernRecipes.ts           # 西式菜谱
└── recipeValidation.ts         # 运行时或开发期校验辅助

src/renderer/src/stores/
└── recipeCalibration.ts        # 待审核校准记录与审核状态
```

拆分后要求：

- 页面和 Agent 工具仍从 `../data/recipes` 导入 `recipes` 和 `Recipe`。
- 业务调用方不感知内部文件拆分。
- 类型定义不再依赖具体数据文件。
- 校准补丁与正式菜谱分离，便于审核和回滚。

## 7. 数据校验脚本

已新增基础校验脚本：

```text
scripts/validate-recipes.js
```

后续可继续新增：

```text
scripts/estimate-recipe-nutrition.ts
scripts/apply-approved-calibrations.ts
```

### 7.1 `validate-recipes`

检查项：

- 总数统计。
- 分类统计。
- 重复 ID。
- 缺失必填字段。
- 空食材或空步骤。
- 非数字热量或宏量营养。
- 热量小于 30 kcal 或大于 1200 kcal 的异常值。
- 宏量营养折算热量与总热量偏差过大。

### 7.2 `estimate-recipe-nutrition`

功能：

- 分批读取菜谱。
- 调用配置好的 LLM 通道估算热量。
- 输出校准候选文件或写入 Dexie/本地 JSON。
- 不修改正式菜谱文件。
- 第一阶段已通过 Agent 工具 `estimate_recipe_nutrition` 支持单条菜谱候选入库；批量脚本仍待实现。

### 7.3 `apply-approved-calibrations`

功能：

- 只应用 `approved` 状态的校准记录。
- 生成变更摘要。
- 保留原值。
- 输出可回滚记录。

## 8. Agent 工具

| 工具 | 用途 |
|------|------|
| `estimate_recipe_nutrition` | 已实现：接收 LLM 估算的热量和宏量营养，输出待审核记录 |
| `list_recipe_calibrations` | 已实现：查看待审核、已通过或已拒绝的校准记录 |
| `review_recipe_calibration` | 已实现：更新某条校准记录状态，不覆盖正式菜谱 |
| `validate_recipe_library` | 已实现：检查菜谱数据质量并生成报告 |

## 9. Bundle 与性能要求

- 130 道内置菜谱当前可以继续随 renderer bundle 加载。
- 扩展到 500+ 前必须评估数据拆分和懒加载。
- RAG、embedding、`@xenova/transformers`、模型文件和大知识库不得进入首屏关键路径。
- 如果引入本地 embedding，应延迟到用户首次使用知识库或高级推荐时初始化。
- 食物成分表、膳食指南和向量数据应与基础 UI 分离，避免影响普通记录和浏览体验。

## 10. 审计点

每次菜谱热量修正必须记录：

- 菜谱 ID 和名称。
- 原热量和原宏量营养。
- 新热量和新宏量营养。
- LLM 模型名或人工来源。
- 估算依据。
- 置信度。
- 风险备注。
- 审核状态。
- 审核人或审核备注。
- 应用时间。
- 是否可回滚。

每次数据校验必须记录：

- 校验时间。
- 菜谱总数。
- 分类分布。
- 是否存在重复 ID。
- 是否存在缺失字段。
- 是否存在异常热量。
- 是否存在宏量偏差。

## 11. 验收场景

| 场景 | 验收标准 |
|------|----------|
| LLM 修正某菜谱热量 | 系统展示原值、新值、依据、置信度、风险备注和审核状态 |
| 置信度低于 0.6 | 记录进入 `needs_review`，不得自动应用 |
| 热量变化超过 30% | 记录进入 `needs_review`，需要人工确认 |
| 数据校验发现重复 ID | 报告能定位到具体重复 ID |
| 数据校验发现异常热量 | 报告能定位到具体 `recipeId` 和异常原因 |
| 审核通过一条校准记录 | 正式数据可更新，并保留原值和应用时间 |
| 拒绝一条校准记录 | 正式数据不变化，记录保留拒绝状态和备注 |

## 12. 当前不做

- 不在本轮做批量 LLM 热量估算脚本。
- 不在本轮引入外部营养数据库。
- 不在本轮引入 RAG 或 embedding。
- 不在本轮把 `approved` 校准记录自动写回正式菜谱文件。

## 13. 2026-05-13 落地状态

### 已完成

- 新增 `npm run validate:recipes`。
- 新增 `scripts/validate-recipes.js`。
- 拆分 `recipeTypes.ts`、`chineseRecipes.ts`、`westernRecipes.ts`。
- 保留 `recipes.ts` 统一出口，业务页面和 Agent 工具继续从 `../data/recipes` 获取完整菜谱库。
- 保留 `recipeExtensions.ts` 兼容出口，避免旧导入路径立即失效。
- 新增 `src/renderer/src/data/recipeValidation.ts`，让前端 Agent 工具和 Node 校验脚本复用同一套校验逻辑。
- 新增 `src/renderer/src/stores/recipeCalibration.ts`，保存 `RecipeCalibrationRecord` 本地审计记录。
- 新增 Agent 工具 `estimate_recipe_nutrition`、`list_recipe_calibrations`、`review_recipe_calibration`、`validate_recipe_library`。
- 设置页新增菜谱校准审计概览，展示待审核、需复核、已通过和已拒绝数量。
- 校验覆盖总数统计、分类统计、重复 ID、缺失字段、空食材/步骤、异常热量、宏量营养数值和宏量折算偏差。
- 当前 130 道菜谱校验通过。

### 尚未完成

- 审核通过后应用校准记录。
- 批量 LLM 热量估算脚本。
- 外部营养数据库或 RAG 知识库。

## 14. 文档同步要求

实现本需求时必须同步更新：

- `docs/PRD.md`
- `docs/development-log.md`
- `docs/v0.5-extension-plan.md` 或后续版本计划
- `README.md`

如果实际实现修改了 Agent 工具，还必须同步 `docs/agent-chat-design.md`。如果实际实现修改了计划动态建议，还必须同步 `docs/proactive-agent-dynamic-plan-design.md`。
