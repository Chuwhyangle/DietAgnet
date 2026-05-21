/**
 * Smoke test for the full App route tree.
 *
 * Renders the App component with each route and asserts no crash occurs.
 *
 * Validates: Requirements 6.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Routes, Route } from 'react-router-dom'
import { Suspense, lazy } from 'react'

// Mock stores used by pages and layout
vi.mock('../stores/dietLog', () => ({
  getTodayLog: vi.fn().mockReturnValue(null),
  getDietLog: vi.fn().mockReturnValue(null),
  getWeeklyDietReport: vi.fn().mockReturnValue({
    startDate: '2024-01-15',
    endDate: '2024-01-21',
    days: [],
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, itemCount: 0 },
    averagePerDay: { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 },
    averagePerLoggedDay: { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 },
    loggedDays: 0,
    completionRate: 0,
    goalHitDays: 0,
    calorieGoal: undefined,
  }),
  summarizeDietLog: vi.fn().mockReturnValue({ calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 }),
  addRecipeToDietLog: vi.fn().mockReturnValue(null),
  removeMealItemFromDietLog: vi.fn().mockReturnValue(null),
  mealTypeOptions: [
    { value: 'breakfast', label: '🌅 早餐', emoji: '🌅' },
    { value: 'lunch', label: '☀️ 午餐', emoji: '☀️' },
    { value: 'dinner', label: '🌙 晚餐', emoji: '🌙' },
    { value: 'snack', label: '🍪 加餐', emoji: '🍪' },
  ],
}))

vi.mock('../stores/settings', () => ({
  getSettings: vi.fn().mockReturnValue({
    nickname: '测试用户',
    calorieGoal: 2000,
    onboarded: true,
    agent: { provider: 'deepseek', apiBaseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', toolCompatibility: 'auto' },
    reminders: { enabled: false },
    usagePricing: {},
    memoryPostChatExtraction: true,
    memoryPostChatAutoConfidence: 0.78,
    memoryPostChatPendingMinConfidence: 0.52,
  }),
  saveSettings: vi.fn(),
}))

vi.mock('../stores/planning', () => ({
  getCurrentPlanningProfile: vi.fn().mockResolvedValue(null),
  getLatestActivePlanningSession: vi.fn().mockResolvedValue(null),
  getLatestPersonalDietPlan: vi.fn().mockResolvedValue(null),
  getRecentPersonalDietPlans: vi.fn().mockResolvedValue([]),
  getRecentProactiveEvents: vi.fn().mockResolvedValue([]),
  getLatestDailyPlanAdjustment: vi.fn().mockResolvedValue(null),
  updateDailyPlanAdjustmentResponse: vi.fn().mockResolvedValue(null),
  updateProactiveEventResponse: vi.fn().mockResolvedValue(null),
  getUserMemories: vi.fn().mockResolvedValue([]),
}))

vi.mock('../stores/customFoods', () => ({
  getAllRecipesWithCustomFoods: vi.fn().mockReturnValue([]),
  findRecipeByIdWithCustomFoods: vi.fn().mockReturnValue(undefined),
}))

vi.mock('../stores/events', () => ({
  DIET_LOG_UPDATED_EVENT: 'diet-log-updated',
  PLANNING_UPDATED_EVENT: 'planning-updated',
  MEMORY_UPDATED_EVENT: 'memory-updated',
  RECIPE_CALIBRATION_UPDATED_EVENT: 'recipe-calibration-updated',
  SETTINGS_UPDATED_EVENT: 'settings-updated',
  emitSettingsUpdated: vi.fn(),
}))

vi.mock('../stores/recipeCalibration', () => ({
  countRecipesWithActiveApprovedCalibration: vi.fn().mockReturnValue(0),
  getRecipeCalibrationSummary: vi.fn().mockReturnValue({
    total: 0,
    pending: 0,
    needsReview: 0,
    approved: 0,
    rejected: 0,
    latestUpdatedAt: null,
  }),
}))

// Mock planning engine
vi.mock('../planning/engine', () => ({
  getPlanningProgress: vi.fn().mockReturnValue({ percent: 0, completedCount: 0, totalCount: 10 }),
  summarizePlanningProfile: vi.fn().mockReturnValue([]),
}))

vi.mock('../planning/dynamicPlan', () => ({
  getDailyPlanGap: vi.fn().mockResolvedValue(null),
}))

vi.mock('../coaching/reminderScheduler', () => ({
  evaluateSchedulerTick: vi.fn().mockResolvedValue({
    fired: null,
    escalated: false,
    quietHoursActive: false,
    cooldownActive: false,
    triggered: false,
    delivered: false,
    tickId: 'tick-test',
    checkedAt: '2024-06-15T08:00:00.000Z',
    ruleId: 'agent_check',
    reason: 'before_window',
    message: '还没到需要检查三餐记录的时间窗口。',
    isQuiet: false,
    isCoolingDown: false,
    isAlreadyLogged: false,
    isDismissPaused: false,
    isEscalated: false,
    dismissCount: 0,
    evaluatedRules: [],
  }),
  startForegroundScheduler: vi.fn().mockReturnValue(() => {}),
  startBackgroundTickListener: vi.fn().mockReturnValue(() => {}),
}))

// Mock export module
vi.mock('../export/dietLogExport', () => ({
  exportDietLogs: vi.fn().mockResolvedValue({
    payload: { summary: { itemCount: 0 } },
    result: { status: 'saved', filePath: '/tmp/test.json' },
  }),
}))

// Mock memory modules
vi.mock('../memory/manager', () => ({
  forget: vi.fn().mockResolvedValue(undefined),
  listUserFacts: vi.fn().mockResolvedValue([]),
  updateMemoryConfidence: vi.fn().mockResolvedValue(undefined),
  confirmPendingMemory: vi.fn().mockResolvedValue(undefined),
  dismissPendingMemory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../memory/postChatExtraction', () => ({
  runPostChatMemoryExtraction: vi.fn().mockResolvedValue(undefined),
}))

// Mock coaching modules
vi.mock('../coaching/trustDial', () => ({
  getCoachingSettings: vi.fn().mockReturnValue({
    trustMode: 'autopilot',
    estimateAutoConfidence: 0.85,
  }),
  saveCoachingSettings: vi.fn(),
}))

vi.mock('../coaching/notificationRouter', () => ({
  startNotificationClickListener: vi.fn().mockReturnValue(() => {}),
}))

// Mock coach module
vi.mock('../coach/dietLogCoach', () => ({
  registerDietLogCoachReactions: vi.fn().mockReturnValue(() => {}),
}))

// Mock agent controller
vi.mock('../agent/controller', () => ({
  runAgentConversation: vi.fn().mockResolvedValue({
    assistantMessage: '',
    assistantRemoteTranscript: [],
  }),
}))

// Mock chat history store
vi.mock('../stores/chatHistory', () => ({
  loadChatHistory: vi.fn().mockReturnValue([]),
  saveChatHistory: vi.fn(),
  clearChatHistory: vi.fn(),
}))

// Mock react-markdown used by AgentChatWorkspace
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
  defaultUrlTransform: (url: string) => url,
}))

// Mock complex child components to avoid deep dependency chains
vi.mock('../components/AgentChatWorkspace', () => ({
  default: () => <div data-testid="agent-chat-workspace-mock" />,
}))

vi.mock('../components/OneTapLogger', () => ({
  default: () => <div data-testid="one-tap-logger-mock" />,
}))

vi.mock('../components/PlanBuilder', () => ({
  default: ({ open }: { open: boolean }) => open ? <div data-testid="plan-builder-mock" /> : null,
}))

vi.mock('../components/PlanVersionAudit', () => ({
  default: () => <div data-testid="plan-version-audit-mock" />,
}))

vi.mock('../proactive/ProactiveReminder', () => ({
  default: () => <div data-testid="proactive-reminder-mock" />,
}))

beforeEach(() => {
  vi.stubGlobal('agent', {
    getApiKeyStatus: vi.fn().mockResolvedValue({ configured: true }),
    chatCompletions: vi.fn().mockResolvedValue({
      content: '',
      toolCalls: [],
      assistantMessage: { role: 'assistant', content: '' },
    }),
    saveApiKey: vi.fn().mockResolvedValue({ configured: true }),
    clearApiKey: vi.fn().mockResolvedValue(undefined),
    runDiagnostics: vi.fn().mockResolvedValue({
      apiKeyConfigured: true,
      providerName: 'OpenAI',
      endpoint: 'https://api.openai.com/v1',
      resolvedEndpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4',
      results: [],
    }),
    getUsageStats: vi.fn().mockResolvedValue({
      promptTokens: 0,
      completionTokens: 0,
      totalRequests: 0,
      byModel: [],
    }),
    clearUsageStats: vi.fn().mockResolvedValue({
      promptTokens: 0,
      completionTokens: 0,
      totalRequests: 0,
      byModel: [],
    }),
  })

  Element.prototype.scrollIntoView = vi.fn()

  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Lazy-load pages the same way App.tsx does
const HomePage = lazy(() => import('../pages/Home'))
const RecipesPage = lazy(() => import('../pages/Recipes'))
const DietLogPage = lazy(() => import('../pages/DietLog'))
const ChatPage = lazy(() => import('../pages/Chat'))
const SettingsPage = lazy(() => import('../pages/Settings'))

// Import the Layout component (used by App to wrap routes)
const { default: AppLayout } = await import('../components/Layout')

/**
 * Renders the full route tree (Layout + Routes) at the given path,
 * mirroring the structure in App.tsx but using MemoryRouter for testability.
 */
function renderAppAtRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppLayout>
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/recipes" element={<RecipesPage />} />
            <Route path="/diet-log" element={<DietLogPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </MemoryRouter>,
  )
}

describe('App route tree smoke tests', () => {
  it('renders / (Home) without throwing', () => {
    const { container } = renderAppAtRoute('/')
    expect(container).toBeTruthy()
  })

  it('renders /recipes without throwing', () => {
    const { container } = renderAppAtRoute('/recipes')
    expect(container).toBeTruthy()
  })

  it('renders /diet-log without throwing', () => {
    const { container } = renderAppAtRoute('/diet-log')
    expect(container).toBeTruthy()
  })

  it('renders /chat without throwing', () => {
    const { container } = renderAppAtRoute('/chat')
    expect(container).toBeTruthy()
  })

  it('renders /settings without throwing', () => {
    const { container } = renderAppAtRoute('/settings')
    expect(container).toBeTruthy()
  })
})
