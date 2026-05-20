/**
 * Smoke test for DietLog page.
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock stores and modules used by DietLog page
vi.mock('../../stores/dietLog', () => ({
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

vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn().mockReturnValue({
    nickname: '测试用户',
    calorieGoal: 2000,
    agent: { provider: 'openai', apiBaseUrl: '', model: 'gpt-4' },
    reminders: { enabled: false },
    usagePricing: {},
  }),
}))

vi.mock('../../stores/planning', () => ({
  getLatestDailyPlanAdjustment: vi.fn().mockResolvedValue(null),
  updateDailyPlanAdjustmentResponse: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../stores/customFoods', () => ({
  getAllRecipesWithCustomFoods: vi.fn().mockReturnValue([]),
  findRecipeByIdWithCustomFoods: vi.fn().mockReturnValue(undefined),
}))

vi.mock('../../planning/dynamicPlan', () => ({
  getDailyPlanGap: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../export/dietLogExport', () => ({
  exportDietLogs: vi.fn().mockResolvedValue({
    payload: { summary: { itemCount: 0 } },
    result: { status: 'saved', filePath: '/tmp/test.json' },
  }),
}))

// Mock OneTapLogger to avoid its complex dependencies
vi.mock('../../components/OneTapLogger', () => ({
  default: () => <div data-testid="one-tap-logger-mock" />,
}))

beforeEach(() => {
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

const { default: DietLogPage } = await import('../DietLog')

describe('DietLogPage', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <DietLogPage />
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })

  it('displays the page title', () => {
    render(
      <MemoryRouter>
        <DietLogPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
  })

  it('displays the add record button', () => {
    render(
      <MemoryRouter>
        <DietLogPage />
      </MemoryRouter>,
    )
    // The button text is "添加记录"
    const buttons = screen.getAllByRole('button')
    const addButton = buttons.find(btn => btn.textContent?.includes('添加记录'))
    expect(addButton).toBeTruthy()
  })

  it('handles clicking the add record button without throwing', async () => {
    render(
      <MemoryRouter>
        <DietLogPage />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    const buttons = screen.getAllByRole('button')
    const addButton = buttons.find(btn => btn.textContent?.includes('添加记录'))!
    await user.click(addButton)
    // Modal should appear - look for the modal title
    expect(screen.getByText('🐛 添加饮食记录')).toBeInTheDocument()
  })
})
