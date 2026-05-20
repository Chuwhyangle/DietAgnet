/**
 * Smoke test for Chat page.
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ChatPage from '../Chat'

describe('ChatPage', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })

  it('displays the page title', () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('猫猫虫 AI 对话中心')).toBeInTheDocument()
  })

  it('displays the page description', () => {
    render(
      <MemoryRouter>
        <ChatPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/正式的对话工作区/)).toBeInTheDocument()
  })
})
