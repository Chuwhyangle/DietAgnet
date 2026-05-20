/**
 * Smoke test for Welcome component.
 *
 * Validates: Requirements 6.1, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Welcome from '../Welcome'

describe('Welcome', () => {
  it('renders without throwing', () => {
    const onFinish = vi.fn()
    const { container } = render(<Welcome onFinish={onFinish} />)
    expect(container).toBeTruthy()
  })

  it('displays the initial greeting step', () => {
    const onFinish = vi.fn()
    render(<Welcome onFinish={onFinish} />)
    expect(screen.getByText(/欢迎来到猫猫虫的小窝/)).toBeInTheDocument()
  })

  it('advances to the next step when the button is clicked', async () => {
    const onFinish = vi.fn()
    render(<Welcome onFinish={onFinish} />)

    const user = userEvent.setup()
    const nextButton = screen.getByRole('button', { name: /认识一下/ })
    await user.click(nextButton)

    // Should now show the nickname step
    expect(screen.getByText(/猫猫虫该怎么称呼你呢/)).toBeInTheDocument()
  })

  it('calls onFinish when skip button is clicked', async () => {
    const onFinish = vi.fn()
    render(<Welcome onFinish={onFinish} />)

    const user = userEvent.setup()
    const skipButton = screen.getByRole('button', { name: /跳过引导/ })
    await user.click(skipButton)

    expect(onFinish).toHaveBeenCalled()
  })
})
