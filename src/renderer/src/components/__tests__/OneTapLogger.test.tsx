/**
 * Smoke test for OneTapLogger component.
 *
 * Validates: Requirements 6.1, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// jsdom doesn't implement matchMedia (needed by Ant Design grid in modal)
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

// Mock coaching modules to prevent real side effects
vi.mock('../../coaching/oneTapLogger', () => ({
  executeOneTapLog: vi.fn().mockResolvedValue({ success: true, dietLog: null }),
}))

vi.mock('../../coaching/trustDial', () => ({
  getCoachingSettings: vi.fn().mockReturnValue({
    trustMode: 'copilot',
    estimateAutoConfidence: 0.85,
  }),
}))

vi.mock('../../coaching/photoLogParser', () => ({
  estimateFromPhoto: vi.fn().mockResolvedValue({
    items: [],
    calories: 0,
    confidence: 0.9,
  }),
}))

vi.mock('../../coaching/textLogParser', () => ({
  estimateFromText: vi.fn().mockResolvedValue({
    items: [],
    calories: 0,
    confidence: 0.9,
  }),
}))

vi.mock('../../stores/planning', () => ({
  getUserMemories: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../stores/dietLog', () => ({
  addMealItemToDietLog: vi.fn(),
}))

const { default: OneTapLogger } = await import('../OneTapLogger')

describe('OneTapLogger', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <OneTapLogger date="2024-01-15" mealType="lunch" />,
    )
    expect(container).toBeTruthy()
  })

  it('displays the quick-log header', () => {
    render(<OneTapLogger date="2024-01-15" mealType="lunch" />)
    expect(screen.getByText(/Quick Log/)).toBeInTheDocument()
  })

  it('displays the photo button', () => {
    render(<OneTapLogger date="2024-01-15" mealType="lunch" />)
    expect(screen.getByRole('button', { name: /Photo/ })).toBeInTheDocument()
  })

  it('handles typing in the text input without throwing', async () => {
    render(<OneTapLogger date="2024-01-15" mealType="lunch" />)

    const user = userEvent.setup()
    const input = screen.getByPlaceholderText(/Describe food/)
    await user.type(input, '一碗面条')
    expect(input).toHaveValue('一碗面条')
  })

  it('interaction-depth: type food name then click submit without throwing', async () => {
    render(<OneTapLogger date="2024-01-15" mealType="lunch" />)

    const user = userEvent.setup()

    // First interaction: type a food name into the input
    const input = screen.getByPlaceholderText(/Describe food/)
    await user.type(input, '红烧肉')
    expect(input).toHaveValue('红烧肉')

    // Second interaction: click the submit/search button
    const submitButton = screen.getByRole('button', { name: /Recognize/ })
    await user.click(submitButton)

    // Assert the component didn't crash — the container should still be in the DOM
    // The mock returns { items: [], calories: 0, confidence: 0.9 } which in copilot mode
    // triggers a preview modal (empty items). The input may or may not remain.
    // We just verify no unhandled throw occurred by checking the component root is still present.
    expect(screen.getByText(/Quick Log/)).toBeInTheDocument()
  })
})
