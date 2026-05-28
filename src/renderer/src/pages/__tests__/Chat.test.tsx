/**
 * Smoke test for Chat page.
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ChatPage from '../Chat'

vi.mock('../../components/AgentChatWorkspace', () => ({
  default: () => <div data-testid="agent-chat-workspace" />,
}))

describe('ChatPage', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })

  it('renders the chat workspace as the primary page content', () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('agent-chat-workspace')).toBeInTheDocument()
  })

  it('does not place an intro card above the chat workspace', () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )
    expect(screen.queryByText('猫猫虫 AI 对话中心')).not.toBeInTheDocument()
  })
})
