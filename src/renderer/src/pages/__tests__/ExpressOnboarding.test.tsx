/**
 * Smoke test for ExpressOnboarding page.
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock planning store
vi.mock('../../stores/planning', () => ({
  getCurrentPlanningProfile: vi.fn().mockResolvedValue(null),
}))

// Mock coaching expressOnboarding
vi.mock('../../coaching/expressOnboarding', () => ({
  runExpressOnboarding: vi.fn().mockResolvedValue(undefined),
}))

// Mock settings store
vi.mock('../../stores/settings', () => ({
  getSettings: vi.fn().mockReturnValue({
    nickname: '测试用户',
    calorieGoal: 2000,
    onboarded: false,
    agent: { provider: 'openai', apiBaseUrl: '', model: 'gpt-4' },
    reminders: { enabled: false },
    usagePricing: {},
  }),
  saveSettings: vi.fn(),
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

const { default: ExpressOnboardingPage } = await import('../ExpressOnboarding')

describe('ExpressOnboardingPage', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <ExpressOnboardingPage />
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })

  it('displays the page title', () => {
    render(
      <MemoryRouter>
        <ExpressOnboardingPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('一分钟开始减肥')).toBeInTheDocument()
  })

  it('displays the submit button', () => {
    render(
      <MemoryRouter>
        <ExpressOnboardingPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /生成我的计划/ })).toBeInTheDocument()
  })

  it('handles clicking a gender radio button without throwing', async () => {
    render(
      <MemoryRouter>
        <ExpressOnboardingPage />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    // Ant Design Radio.Button wraps the input; click the label text instead
    const maleLabel = screen.getByText('男')
    await user.click(maleLabel)
    // Verify the radio is now checked
    const maleRadio = screen.getByRole('radio', { name: '男' })
    expect(maleRadio).toBeChecked()
  })
})
