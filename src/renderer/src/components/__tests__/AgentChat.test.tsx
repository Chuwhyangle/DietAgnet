/**
 * Smoke test for AgentChat component.
 *
 * Validates: Requirements 6.1, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock window.agent.getApiKeyStatus used by the component
beforeEach(() => {
  vi.stubGlobal('agent', {
    getApiKeyStatus: vi.fn().mockResolvedValue({ configured: true }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Lazy import after mocks are set up
const { default: AgentChat } = await import('../AgentChat')

describe('AgentChat', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <AgentChat />
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })

  it('renders nothing when hidden prop is true', () => {
    const { container } = render(
      <MemoryRouter>
        <AgentChat hidden={true} />
      </MemoryRouter>,
    )
    // Should render an empty fragment
    expect(container.innerHTML).toBe('')
  })

  it('handles a click on the launcher button without throwing', async () => {
    render(
      <MemoryRouter>
        <AgentChat />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: /AI 对话/ })
    expect(button).toBeInTheDocument()

    // Click should navigate (or at least not throw)
    await user.click(button)
  })

  it('interaction-depth: click launcher then click settings without throwing', async () => {
    render(
      <MemoryRouter>
        <AgentChat />
      </MemoryRouter>,
    )

    const user = userEvent.setup()

    // First interaction: click the main launcher button (navigates to /chat)
    const launcherButton = screen.getByRole('button', { name: /AI 对话/ })
    await user.click(launcherButton)

    // Second interaction: click the settings button (navigates to /settings)
    // Ant Design renders the button with the icon's aria-label as accessible name
    const settingsButton = screen.getByTitle('打开设置页')
    await user.click(settingsButton)

    // Assert the component is still rendered and didn't crash
    expect(launcherButton).toBeInTheDocument()
  })
})
