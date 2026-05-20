/**
 * Smoke test for AgentChatWorkspace component.
 *
 * Validates: Requirements 6.1, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock window.agent used by the component
beforeEach(() => {
  vi.stubGlobal('agent', {
    getApiKeyStatus: vi.fn().mockResolvedValue({ configured: true }),
    chatCompletions: vi.fn().mockResolvedValue({
      content: 'mock reply',
      toolCalls: [],
      assistantMessage: { role: 'assistant', content: 'mock reply' },
    }),
  })

  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Mock react-markdown to avoid ESM issues in test environment
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
  defaultUrlTransform: (url: string) => url,
}))

// Mock the agent controller to prevent real agent calls
vi.mock('../../agent/controller', () => ({
  runAgentConversation: vi.fn().mockResolvedValue({
    assistantMessage: 'mock response',
    assistantRemoteTranscript: [],
  }),
}))

// Mock memory extraction
vi.mock('../../memory/postChatExtraction', () => ({
  runPostChatMemoryExtraction: vi.fn().mockResolvedValue(undefined),
}))

const { default: AgentChatWorkspace } = await import('../AgentChatWorkspace')

describe('AgentChatWorkspace', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/chat']}>
        <AgentChatWorkspace />
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })

  it('displays the chat header with title', () => {
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <AgentChatWorkspace />
      </MemoryRouter>,
    )
    expect(screen.getByText('猫猫虫 AI 对话')).toBeInTheDocument()
  })

  it('handles typing in the text area without throwing', async () => {
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <AgentChatWorkspace />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, '你好')
    expect(textarea).toHaveValue('你好')
  })
})
