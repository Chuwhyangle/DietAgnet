/**
 * Smoke test for Home page.
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock stores
vi.mock('../../stores/dietLog', () => ({
  getTodayLog: vi.fn().mockReturnValue(null),
  summarizeDietLog: vi.fn().mockReturnValue({ calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 }),
}))

vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn().mockReturnValue({
    nickname: '小可爱',
    calorieGoal: 2000,
    agent: { provider: 'openai', apiBaseUrl: '', model: 'gpt-4' },
    reminders: { enabled: false },
    usagePricing: {},
  }),
}))

vi.mock('../../stores/planning', () => ({
  getCurrentPlanningProfile: vi.fn().mockResolvedValue(null),
  getLatestActivePlanningSession: vi.fn().mockResolvedValue(null),
  getLatestPersonalDietPlan: vi.fn().mockResolvedValue(null),
  getRecentPersonalDietPlans: vi.fn().mockResolvedValue([]),
  getLatestDailyPlanAdjustment: vi.fn().mockResolvedValue(null),
  updateDailyPlanAdjustmentResponse: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../planning/engine', () => ({
  getPlanningProgress: vi.fn().mockReturnValue({ percent: 0, completedCount: 0, totalCount: 10 }),
  summarizePlanningProfile: vi.fn().mockReturnValue([]),
}))

// Mock OneTapLogger to avoid its complex dependencies
vi.mock('../../components/OneTapLogger', () => ({
  default: () => <div data-testid="one-tap-logger-mock" />,
}))

// Mock PlanBuilder to avoid its complex dependencies
vi.mock('../../components/PlanBuilder', () => ({
  default: ({ open }: { open: boolean }) => open ? <div data-testid="plan-builder-mock">Plan Builder</div> : null,
}))

// Mock PlanVersionAudit to avoid its complex dependencies
vi.mock('../../components/PlanVersionAudit', () => ({
  default: () => <div data-testid="plan-version-audit-mock" />,
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

const { default: HomePage } = await import('../Home')

describe('HomePage', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })

  it('displays the greeting with nickname', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/小可爱/)).toBeInTheDocument()
  })

  it('displays the plan builder action button', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /开始制定计划/ })).toBeInTheDocument()
  })

  it('handles clicking the plan builder button without throwing', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    const planButton = screen.getByRole('button', { name: /开始制定计划/ })
    await user.click(planButton)
    // PlanBuilder mock should appear
    expect(screen.getByTestId('plan-builder-mock')).toBeInTheDocument()
  })
})
