/**
 * Smoke test for PlanVersionAudit component.
 *
 * Validates: Requirements 6.1, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PersonalDietPlan } from '../../stores/planning'

// Mock the planning engine
vi.mock('../../planning/engine', () => ({
  getPlanGenerationLabel: vi.fn().mockReturnValue('AI 生成'),
  getPlanVersionDiff: vi.fn().mockReturnValue({
    summary: '热量目标从 2000 调整到 1800',
    metricChanges: [
      { key: 'calories', label: '热量', delta: -200, unit: ' kcal' },
    ],
    profileChanges: [],
  }),
}))

const { default: PlanVersionAudit } = await import('../PlanVersionAudit')

const mockPlans: PersonalDietPlan[] = [
  {
    id: 2,
    title: '第二版计划',
    dailyCalorieTarget: 1800,
    proteinTarget: 90,
    carbsTarget: 200,
    fatTarget: 60,
    summary: '降低热量目标',
    mealGuidance: ['减少碳水'],
    cautionNotes: ['注意蛋白质'],
    generationMode: 'ai',
    generatedWithModel: 'deepseek-v4',
    createdAt: '2024-01-20T10:00:00Z',
    sourceSessionId: 2,
  },
  {
    id: 1,
    title: '初始计划',
    dailyCalorieTarget: 2000,
    proteinTarget: 100,
    carbsTarget: 250,
    fatTarget: 70,
    summary: '初始饮食计划',
    mealGuidance: ['均衡饮食'],
    cautionNotes: [],
    generationMode: 'local',
    createdAt: '2024-01-15T10:00:00Z',
    sourceSessionId: 1,
  },
]

describe('PlanVersionAudit', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <PlanVersionAudit plans={mockPlans} />,
    )
    expect(container).toBeTruthy()
  })

  it('displays the card title', () => {
    render(<PlanVersionAudit plans={mockPlans} />)
    expect(screen.getByText('Plan Version Audit')).toBeInTheDocument()
  })

  it('displays plan version count', () => {
    render(<PlanVersionAudit plans={mockPlans} />)
    expect(screen.getByText(/2 versions/)).toBeInTheDocument()
  })

  it('shows empty state when no plans', () => {
    render(<PlanVersionAudit plans={[]} />)
    expect(screen.getByText('No auditable plan versions yet')).toBeInTheDocument()
  })

  it('handles clicking a version item without throwing', async () => {
    render(<PlanVersionAudit plans={mockPlans} />)

    const user = userEvent.setup()
    // Click on the second plan version button
    const versionButtons = screen.getAllByRole('button')
    if (versionButtons.length > 0) {
      await user.click(versionButtons[0])
    }
    // Should not throw
  })
})
