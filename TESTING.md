# 测试指南

本文档面向贡献者，说明如何为 Diet Agent 项目编写和运行自动化测试。

## 概览：三层测试架构

项目采用三层模块分类，每层对应不同的测试策略：

| 层级 | 模块类型 | 测试要求 |
| --- | --- | --- |
| **Tier 1** | 纯逻辑（解析器、验证器、调度器、计划器、store reducer） | Example Test + Property Test（当存在不变量时） |
| **Tier 2** | 集成胶水（agent controller、tools、IPC handler、preload bridge） | Example Test + 结构化错误矩阵测试 |
| **Tier 3** | 展示层 React 组件和页面 | Component Smoke Test（挂载 + 一次交互） |

文件命名约定：

- `*.test.ts` / `*.test.tsx` — 基于示例的测试（Arrange-Act-Assert）
- `*.property.test.ts` — fast-check 属性测试
- 测试文件放在被测模块旁的 `__tests__/` 目录下
- 跨模块的测试基础设施放在 `src/test/`

## 运行测试

```bash
# 单次运行全部测试
npm test

# 监听模式（本地开发）
npm run test:watch

# 带覆盖率检查（CI 用）
npm run test:coverage

# 提高 PBT 迭代次数（CI 或深度探索）
VITEST_PBT_RUNS=500 npm test
```

## 如何添加属性测试（Property-Based Test）

### 何时使用 PBT

当被测行为存在**通用不变量**时，适合使用属性测试：

- **往返一致性（Round-trip）**：`parse(serialize(x)) ≅ x`
- **幂等性（Idempotence）**：`f(f(x)) = f(x)`
- **交换性 / 顺序无关性（Commutativity）**：打乱输入顺序不影响结果
- **算术恒等式**：`remaining + actual = target`
- **硬约束**：安静时段内不触发提醒、过敏食材不出现在推荐中

如果行为只是"给定输入 A 应该输出 B"，用 Example Test 即可。

### 模板

```typescript
/**
 * Property-Based Test: <属性名称>
 *
 * **Validates: Requirements X.Y**
 *
 * <不变量的自然语言描述>
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'

describe('Property N: <属性名称>', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('<不变量断言描述>', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 使用 src/test/arbitraries/ 下的共享 arbitrary
        arbMyInput(),
        async (input) => {
          const result = myFunction(input)
          // 断言不变量
          expect(result).toSatisfy(invariantCheck)
        },
      ),
      { ...defaultRunConfig() },
    )
  })
})
```

### `defaultRunConfig()` 与 `numRuns`

所有属性测试通过 `defaultRunConfig()` 获取运行配置：

```typescript
import { defaultRunConfig } from '@/test/arbitraries/runConfig'
// 或相对路径：
import { defaultRunConfig } from '../../../../test/arbitraries/runConfig'
```

`defaultRunConfig()` 读取环境变量 `VITEST_PBT_RUNS`，缺省值为 **100**。CI 可通过设置 `VITEST_PBT_RUNS=500` 提高迭代次数，无需修改测试文件。

如需为单个测试指定固定 seed（用于复现失败）：

```typescript
fc.assert(prop, { ...defaultRunConfig(), seed: 42 })
```

### 创建新的 Arbitrary

共享 arbitrary 放在 `src/test/arbitraries/` 目录下：

| 文件 | 导出 |
| --- | --- |
| `recipe.ts` | `arbValidRecipe()`, `arbInvalidRecipe()` |
| `dietLog.ts` | `arbDietLogEntry()`, `arbInconsistentDietLogEntry()` |
| `reminder.ts` | `arbReminderSettings()` |
| `memory.ts` | `arbUserMemory()` |
| `plan.ts` | `arbPersonalDietPlan()` |
| `runConfig.ts` | `defaultRunConfig()` |

新增 arbitrary 时：
1. 在 `src/test/arbitraries/` 下创建或扩展对应文件
2. 使用 `fc.record()`、`fc.oneof()` 等组合器构建
3. 约束生成空间以匹配业务规则（例如 `arbValidRecipe()` 保证宏量营养与热量偏差 ≤ 35%）
4. 导出正例和反例两个版本（如 `arbValidRecipe()` + `arbInvalidRecipe()`）

## 如何添加组件冒烟测试（Component Smoke Test）

### 模板

```tsx
/**
 * Smoke test for <组件名> component.
 *
 * Validates: Requirements 6.1, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock 依赖的 store（按需）
vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn().mockReturnValue({
    nickname: '测试用户',
    calorieGoal: 2000,
    // ...最小必要字段
  }),
}))

describe('<组件名>', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <MyComponent />
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })

  it('handles user interaction without throwing', async () => {
    render(
      <MemoryRouter>
        <MyComponent />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: /按钮文字/ })
    await user.click(button)

    // 断言 DOM 更新，不断言 CSS 类名或 Ant Design 内部结构
    expect(screen.getByText(/期望文字/)).toBeInTheDocument()
  })
})
```

### 何时使用 `MemoryRouter`

如果组件使用了 `react-router-dom` 的 hook（`useNavigate`、`useLocation`、`useParams` 等），必须用 `MemoryRouter` 包裹：

```tsx
import { MemoryRouter } from 'react-router-dom'

render(
  <MemoryRouter initialEntries={['/diet-log']}>
    <MyPageComponent />
  </MemoryRouter>,
)
```

### 何时 seed `Fake_Dexie` vs `Fake_LocalStorage`

- **Fake_Dexie**：组件通过 `dexie-react-hooks`（`useLiveQuery`）或直接调用 `stores/planning`、`stores/dietLog` 等读取 IndexedDB 时，需要 mock 对应的 store 模块或使用 `seedPlanningDb()` 预填数据。
- **Fake_LocalStorage**：组件通过 `stores/settings`、`stores/chatHistory` 等读取 `localStorage` 时，需要 mock 对应的 store 或在 `beforeEach` 中写入必要的 key。

全局 setup 文件（`src/test/setup.ts`）已经在每个测试前自动清空 `localStorage` 并在每个测试后删除所有 IndexedDB 数据库，所以你只需关注**写入测试所需的最小数据**。

### 不要断言的内容

- ❌ Ant Design 内部 DOM 结构（`ant-btn-primary`、`ant-card-body` 等 class）
- ❌ 精确的 CSS 样式值
- ❌ 组件内部实现细节

这样做是为了让 Ant Design 升级不会导致测试失败。

## IPC / Agent Tool 测试规则

> **规则：每个新增的 IPC channel 或 agent tool 必须在同一个 PR 中附带对应的测试。**

### 新增 IPC Channel

当你在 `src/main/` 中注册新的 `ipcMain.handle(channel, handler)` 时，必须在 `src/main/__tests__/` 中添加对应的 `Main_Process_Test`：

```typescript
// src/main/__tests__/myNewChannel.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { electronMock, getRegisteredHandlers } from '../../test/doubles/electron'

let mockElectron: ReturnType<typeof electronMock>

vi.mock('electron', () => {
  mockElectron = electronMock()
  return mockElectron
})

describe('my-new-channel IPC handler', () => {
  it('success path: returns expected shape', async () => {
    // 导入被测模块（触发 handler 注册）
    await import('../myModule')
    const handlers = getRegisteredHandlers(mockElectron)
    const handler = handlers.get('my-new-channel')

    const result = await handler!({} as any, validInput)
    expect(result).toMatchObject({ /* 期望的返回结构 */ })
  })

  it('failure path: returns structured error', async () => {
    // 模拟失败条件
    const result = await handler!({} as any, invalidInput)
    expect(result).toMatchObject({ error: { code: 'expected_error_code' } })
  })
})
```

### 新增 Agent Tool

当你在 `src/renderer/src/agent/tools.ts` 中注册新的 tool 时，必须在 `src/renderer/src/agent/__tests__/tools.test.ts` 中添加：

1. **输入 schema 拒绝测试**：传入不合法的参数，断言 tool 返回错误或抛出
2. **输出形状测试**：传入合法参数（seed 必要的 store 数据），断言返回值符合文档定义的结构

```typescript
describe('tool: myNewTool', () => {
  it('rejects malformed input', async () => {
    const result = await executeTool('myNewTool', { /* 缺少必填字段 */ })
    expect(result.error).toBeDefined()
  })

  it('returns correct shape on success', async () => {
    // Seed 必要数据
    mockSettings = { /* ... */ }
    const result = await executeTool('myNewTool', validArgs)
    expect(result).toMatchObject({ /* 期望结构 */ })
  })
})
```

## 可用的测试替身和工厂

### 测试替身（`src/test/doubles/`）

| 文件 | 用途 |
| --- | --- |
| `electron.ts` | `electronMock()` — 完整的 Electron mock（app、BrowserWindow、ipcMain、Notification、safeStorage、dialog） |
| `safeStorage.ts` | 内存中的 `encryptString` / `decryptString` 实现 |
| `ipcRenderer.ts` | `@electron-toolkit/preload` 的 mock，提供 `recordedInvocations(channel)` 辅助函数 |
| `windowAgent.ts` | `createMockChatCompletions()` — 脚本化的 AI 响应队列（enqueue / enqueueToolCall / enqueueError / enqueueHang） |
| `dexie.ts` | `resetPlanningDb()` / `seedPlanningDb(seed)` — IndexedDB 数据预填 |

### 数据工厂（`src/test/factories/`）

| 文件 | 导出 |
| --- | --- |
| `recipe.ts` | `makeRecipe(overrides)` |
| `dietLogEntry.ts` | `makeDietLogEntry(overrides)`, `makeDietLogItem(overrides)` |
| `userMemory.ts` | `makeUserMemory(overrides)` |
| `reminderSettings.ts` | `makeReminderSettings(overrides)` |
| `chatCompletionResponse.ts` | `makeAssistantMessage()`, `makeToolCallMessage()`, `makeAgentError(code)` |

工厂函数返回带有合理默认值的完整对象，通过 `overrides` 参数覆盖特定字段。

## 全局 Setup 提供的隔离保障

`src/test/setup.ts` 在每个测试前后自动执行：

- ✅ `fake-indexeddb/auto` — IndexedDB 内存实现
- ✅ `@testing-library/jest-dom/vitest` — DOM 匹配器
- ✅ `beforeEach`: 安装 `fetch` 守卫（未 mock 时调用会抛错）
- ✅ `beforeEach`: 清空 `localStorage`
- ✅ `afterEach`: 删除所有 IndexedDB 数据库
- ✅ `afterEach`: 检测未清理的真实时钟定时器并发出警告
- ✅ `afterEach`: 恢复原始 `fetch`

因此你**不需要**在每个测试中手动清理存储。如果测试需要 `fetch`，请显式 mock：

```typescript
vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
```

如果测试需要控制时间：

```typescript
beforeEach(() => { vi.useFakeTimers({ now: new Date('2024-06-15T08:00:00Z') }) })
afterEach(() => { vi.useRealTimers() })
```
