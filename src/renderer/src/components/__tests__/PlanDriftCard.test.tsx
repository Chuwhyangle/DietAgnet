/**
 * Smoke test for PlanDriftCard component.
 *
 * Validates: Requirements 6.1, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlanAdjustmentProposal } from '../../coaching/types'

// Mock the plan drift monitor to prevent real side effects
vi.mock('../../coaching/planDriftMonitor', () => ({
  acceptProposal: vi.fn().mockResolvedValue(undefined),
  dismissProposal: vi.fn().mockResolvedValue(undefined),
}))

const { default: PlanDriftCard } = await import('../PlanDriftCard')

const mockProposal: PlanAdjustmentProposal = {
  driftDirection: 'over',
  avgDriftPercent: 15.3,
  proposedPlan: {
    id: 42,
    title: '调整后计划',
    dailyCalorieTarget: 1800,
    proteinTarget: 90,
    carbsTarget: 200,
    fatTarget: 60,
    summary: '建议降低每日热量目标',
    mealGuidance: ['减少晚餐碳水'],
    cautionNotes: ['注意蛋白质摄入'],
    generationMode: 'ai',
    createdAt: '2024-01-15T10:00:00Z',
  },
}

describe('PlanDriftCard', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <PlanDriftCard proposal={mockProposal} />,
    )
    expect(container).toBeTruthy()
  })

  it('displays drift direction and metrics', () => {
    render(<PlanDriftCard proposal={mockProposal} />)
    expect(screen.getByText('计划偏移建议')).toBeInTheDocument()
    expect(screen.getByText('15.3%')).toBeInTheDocument()
    expect(screen.getByText('1800 kcal')).toBeInTheDocument()
  })

  it('handles clicking the accept button without throwing', async () => {
    const onAccepted = vi.fn()
    render(
      <PlanDriftCard proposal={mockProposal} onAccepted={onAccepted} />,
    )

    const user = userEvent.setup()
    const acceptButton = screen.getByRole('button', { name: /采用新计划/ })
    await user.click(acceptButton)
    // Should not throw
  })

  it('renders under direction for low drift', () => {
    const underProposal: PlanAdjustmentProposal = {
      ...mockProposal,
      driftDirection: 'under',
    }
    render(<PlanDriftCard proposal={underProposal} />)
    expect(screen.getByText('⬇️ 不足')).toBeInTheDocument()
  })
})
