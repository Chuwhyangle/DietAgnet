/**
 * Smoke test for Layout (AppLayout) component.
 *
 * Validates: Requirements 6.1, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock window.agent used by child components (AgentChat, AgentChatWorkspace)
beforeEach(() => {
  vi.stubGlobal('agent', {
    getApiKeyStatus: vi.fn().mockResolvedValue({ configured: true }),
    chatCompletions: vi.fn().mockResolvedValue({
      content: '',
      toolCalls: [],
      assistantMessage: { role: 'assistant', content: '' },
    }),
  })

  // jsdom doesn't implement scrollIntoView or matchMedia
  Element.prototype.scrollIntoView = vi.fn()
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

afterEach(() => {
  vi.unstubAllGlobals()
})

// Mock react-markdown used by AgentChatWorkspace
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
  defaultUrlTransform: (url: string) => url,
}))

// Mock agent controller
vi.mock('../../agent/controller', () => ({
  runAgentConversation: vi.fn().mockResolvedValue({
    assistantMessage: '',
    assistantRemoteTranscript: [],
  }),
}))

// Mock memory extraction
vi.mock('../../memory/postChatExtraction', () => ({
  runPostChatMemoryExtraction: vi.fn().mockResolvedValue(undefined),
}))

// Mock ProactiveReminder to avoid its complex dependencies
vi.mock('../../proactive/ProactiveReminder', () => ({
  default: () => <div data-testid="proactive-reminder-mock" />,
}))

const { default: AppLayout } = await import('../Layout')

describe('Layout (AppLayout)', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <AppLayout>
          <div>Page content</div>
        </AppLayout>
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })

  it('displays the app logo text', () => {
    render(
      <MemoryRouter>
        <AppLayout>
          <div>Page content</div>
        </AppLayout>
      </MemoryRouter>,
    )
    expect(screen.getByText('猫猫虫')).toBeInTheDocument()
  })

  it('renders children content', () => {
    render(
      <MemoryRouter>
        <AppLayout>
          <div>Test child content</div>
        </AppLayout>
      </MemoryRouter>,
    )
    expect(screen.getByText('Test child content')).toBeInTheDocument()
  })

  it('handles clicking a menu item without throwing', async () => {
    render(
      <MemoryRouter>
        <AppLayout>
          <div>Page content</div>
        </AppLayout>
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    // Click on the recipes menu item
    const recipesItem = screen.getByText('🍳 菜谱')
    await user.click(recipesItem)
    // Should not throw
  })
})
