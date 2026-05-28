import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { DailyPlanAdjustment, ProactiveEvent } from '../../stores/planning'

let recentEvents: ProactiveEvent[] = []
let latestAdjustment: DailyPlanAdjustment | null = null

const checkedEvent: ProactiveEvent = {
  id: 8,
  ruleId: 'agent_check',
  trigger: 'cron',
  priority: 'low',
  firedAt: '2024-06-15T08:10:00.000Z',
  delivered: false,
  message: '早餐已经有饮食记录，本次不提醒。',
  payload: {
    checkedRuleId: 'coaching_breakfast_reminder',
    reason: 'already_logged',
    skipReason: 'already_logged',
    mealType: 'breakfast',
    dismissCount: 0,
  },
}

const activeAdjustment: DailyPlanAdjustment = {
  id: 3,
  date: '2024-06-15',
  ruleId: 'after_meal_plan_gap',
  mealType: 'lunch',
  plannedCalories: 800,
  actualCalories: 400,
  deltaCalories: 400,
  suggestedCalories: 320,
  suggestionType: 'supplement',
  suggestionText: '午餐比计划少了大约 400 kcal。建议补充 320 kcal 左右。',
  generatedBy: 'agent',
  createdAt: '2024-06-15T07:30:00.000Z',
  updatedAt: '2024-06-15T07:30:00.000Z',
}

vi.mock('../../stores/planning', () => ({
  getRecentProactiveEvents: vi.fn(() => Promise.resolve(recentEvents)),
  getLatestDailyPlanAdjustment: vi.fn(() => Promise.resolve(latestAdjustment)),
  updateDailyPlanAdjustmentResponse: vi.fn(async (adjustmentId: number, userResponse: string) => {
    if (!latestAdjustment || latestAdjustment.id !== adjustmentId) {
      return null
    }

    latestAdjustment = {
      ...latestAdjustment,
      userResponse: userResponse as DailyPlanAdjustment['userResponse'],
      updatedAt: '2024-06-15T08:15:00.000Z',
    }
    return latestAdjustment
  }),
  updateProactiveEventResponse: vi.fn(async () => null),
}))

vi.mock('../../stores/events', () => ({
  DIET_LOG_UPDATED_EVENT: 'diet-log-updated',
  PLANNING_UPDATED_EVENT: 'planning-updated',
  SETTINGS_UPDATED_EVENT: 'settings-updated',
}))

vi.mock('../../coaching/reminderScheduler', () => ({
  evaluateSchedulerTick: vi.fn(async () => {
    recentEvents = [checkedEvent]
    return {
      fired: null,
      escalated: false,
      quietHoursActive: false,
      cooldownActive: false,
      triggered: false,
      delivered: false,
      tickId: 'tick-test',
      checkedAt: checkedEvent.firedAt,
      ruleId: 'coaching_breakfast_reminder',
      reason: 'already_logged',
      message: checkedEvent.message,
      skipReason: 'already_logged',
      mealType: 'breakfast',
      isQuiet: false,
      isCoolingDown: false,
      isAlreadyLogged: true,
      isDismissPaused: false,
      isEscalated: false,
      dismissCount: 0,
      checkEvent: checkedEvent,
      evaluatedRules: [],
    }
  }),
}))

const { default: AgentActivity } = await import('../AgentActivity')
const { evaluateSchedulerTick } = await import('../../coaching/reminderScheduler')
const { updateDailyPlanAdjustmentResponse } = await import('../../stores/planning')

describe('AgentActivity', () => {
  beforeEach(() => {
    recentEvents = []
    latestAdjustment = null
    vi.clearAllMocks()
  })

  it('renders the Agent Inbox shell', async () => {
    render(
      <MemoryRouter>
        <AgentActivity />
      </MemoryRouter>,
    )

    expect(screen.getByText('Agent Inbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Run Agent Check Now/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('No Agent activity yet. You can run a manual check.')).toBeInTheDocument()
    })
  })

  it('runs a manual agent check and shows the new audit event', async () => {
    render(
      <MemoryRouter>
        <AgentActivity />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('button', { name: /Run Agent Check Now/ }))

    await waitFor(() => {
      expect(evaluateSchedulerTick).toHaveBeenCalledTimes(1)
      expect(screen.getByText('agent_check')).toBeInTheDocument()
      expect(screen.getAllByText(/already_logged/).length).toBeGreaterThan(0)
    })
  })

  it('persists adjustment feedback and refreshes status in the UI', async () => {
    latestAdjustment = activeAdjustment

    render(
      <MemoryRouter>
        <AgentActivity />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('after_meal_plan_gap')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'dismiss' }))

    await waitFor(() => {
      expect(updateDailyPlanAdjustmentResponse).toHaveBeenCalledWith(3, 'dismissed')
      expect(screen.getByText('userResponse: dismissed')).toBeInTheDocument()
    })
  })
})
