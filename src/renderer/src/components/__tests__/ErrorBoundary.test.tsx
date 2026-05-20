/**
 * Smoke test for ErrorBoundary component.
 *
 * Validates: Requirements 6.1, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from '../ErrorBoundary'

let shouldThrow = false

function ProblemChild(): JSX.Element {
  if (shouldThrow) {
    throw new Error('Test explosion')
  }
  return <div>All good</div>
}

describe('ErrorBoundary', () => {
  it('renders children without throwing when no error occurs', () => {
    shouldThrow = false
    const { container } = render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    )
    expect(container).toBeTruthy()
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('renders error UI when child throws and allows reset via button click', async () => {
    // Suppress React error boundary console noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    shouldThrow = true
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    )

    // Error state should show the error message and a button
    expect(screen.getByText('Test explosion')).toBeInTheDocument()
    const retryButton = screen.getByRole('button')
    expect(retryButton).toBeInTheDocument()

    // Stop throwing before clicking reset
    shouldThrow = false

    // Click retry to reset the error boundary
    const user = userEvent.setup()
    await user.click(retryButton)

    // After reset, child renders normally
    expect(screen.getByText('All good')).toBeInTheDocument()

    spy.mockRestore()
  })
})
