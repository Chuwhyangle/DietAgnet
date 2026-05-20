/**
 * Smoke test for Settings page.
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock stores
vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn().mockReturnValue({
    nickname: '测试用户',
    calorieGoal: 2000,
    onboarded: true,
    agent: { provider: 'deepseek', apiBaseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', toolCompatibility: 'auto' },
    reminders: {
      enabled: true,
      mealReminders: true,
      planAdjustmentReminders: true,
      weeklyReportReminders: true,
      postLogGapSummaryInChat: true,
      postLogGapDesktopNotify: false,
      quietStartHour: 23,
      quietEndHour: 7,
      cooldownHours: 4,
    },
    usagePricing: { promptUsdPerMillionTokens: 3, completionUsdPerMillionTokens: 15 },
    memoryPostChatExtraction: true,
    memoryPostChatAutoConfidence: 0.78,
    memoryPostChatPendingMinConfidence: 0.52,
  }),
  saveSettings: vi.fn(),
}))

vi.mock('../../stores/events', () => ({
  MEMORY_UPDATED_EVENT: 'memory-updated',
  RECIPE_CALIBRATION_UPDATED_EVENT: 'recipe-calibration-updated',
  SETTINGS_UPDATED_EVENT: 'settings-updated',
  emitSettingsUpdated: vi.fn(),
}))

vi.mock('../../memory/manager', () => ({
  forget: vi.fn().mockResolvedValue(undefined),
  listUserFacts: vi.fn().mockResolvedValue([]),
  updateMemoryConfidence: vi.fn().mockResolvedValue(undefined),
  confirmPendingMemory: vi.fn().mockResolvedValue(undefined),
  dismissPendingMemory: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../stores/recipeCalibration', () => ({
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

vi.mock('../../coaching/trustDial', () => ({
  getCoachingSettings: vi.fn().mockReturnValue({
    trustMode: 'autopilot',
    estimateAutoConfidence: 0.85,
  }),
  saveCoachingSettings: vi.fn(),
}))

vi.mock('../../stores/planning', () => ({
  getUserMemories: vi.fn().mockResolvedValue([]),
}))

beforeEach(() => {
  vi.stubGlobal('agent', {
    getApiKeyStatus: vi.fn().mockResolvedValue({ configured: true }),
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

const { default: SettingsPage } = await import('../Settings')

describe('SettingsPage', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })

  it('displays the page title', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
  })

  it('displays the nickname input with current value', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )
    const nicknameInput = screen.getByPlaceholderText(/输入你的昵称/)
    expect(nicknameInput).toHaveValue('测试用户')
  })

  it('handles typing in the nickname input without throwing', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    const nicknameInput = screen.getByPlaceholderText(/输入你的昵称/)
    await user.clear(nicknameInput)
    await user.type(nicknameInput, '新昵称')
    expect(nicknameInput).toHaveValue('新昵称')
  })
})
