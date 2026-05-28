/**
 * Smoke test for AutopilotSuggestion component.
 *
 * Validates: Requirements 6.1, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AutopilotSuggestionRound } from '../../coaching/types'

// Mock the autopilot planner to prevent real side effects
vi.mock('../../coaching/autopilotPlanner', () => ({
  acceptCandidate: vi.fn().mockResolvedValue(undefined),
  skipSuggestionRound: vi.fn().mockResolvedValue(undefined),
}))

const { default: AutopilotSuggestion } = await import('../AutopilotSuggestion')

const mockSuggestion: AutopilotSuggestionRound = {
  date: '2024-01-15',
  mealType: 'lunch',
  fallback: false,
  candidates: [
    {
      recipeId: 'tomato-egg',
      name: '番茄炒蛋',
      emoji: '🍅',
      estimatedCalories: 280,
      reasoning: '低卡高蛋白',
    },
    {
      recipeId: 'steamed-egg',
      name: '蒸蛋羹',
      emoji: '🥚',
      estimatedCalories: 150,
      reasoning: '清淡易消化',
    },
    {
      recipeId: 'congee',
      name: '皮蛋瘦肉粥',
      emoji: '🥣',
      estimatedCalories: 220,
      reasoning: '暖胃',
    },
  ],
}

describe('AutopilotSuggestion', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <AutopilotSuggestion suggestion={mockSuggestion} />,
    )
    expect(container).toBeTruthy()
  })

  it('displays candidate names', () => {
    render(<AutopilotSuggestion suggestion={mockSuggestion} />)
    expect(screen.getByText('番茄炒蛋')).toBeInTheDocument()
    expect(screen.getByText('蒸蛋羹')).toBeInTheDocument()
    expect(screen.getByText('皮蛋瘦肉粥')).toBeInTheDocument()
  })

  it('handles clicking an accept button without throwing', async () => {
    const onAccepted = vi.fn()
    render(
      <AutopilotSuggestion suggestion={mockSuggestion} onAccepted={onAccepted} />,
    )

    const user = userEvent.setup()
    const acceptButtons = screen.getAllByRole('button', { name: /Choose this/ })
    await user.click(acceptButtons[0])
    // Should not throw
  })

  it('renders fallback message when no candidates', () => {
    const fallbackSuggestion: AutopilotSuggestionRound = {
      ...mockSuggestion,
      fallback: true,
      candidates: [],
    }
    render(<AutopilotSuggestion suggestion={fallbackSuggestion} />)
    expect(screen.getByText(/No suitable recommendation/)).toBeInTheDocument()
  })
})
