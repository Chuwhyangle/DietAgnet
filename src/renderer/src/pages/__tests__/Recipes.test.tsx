/**
 * Smoke test for Recipes page.
 *
 * Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Mock customFoods store to prevent localStorage access issues
vi.mock('../../stores/customFoods', () => ({
  getAllRecipesWithCustomFoods: vi.fn().mockReturnValue([
    {
      id: 'test-recipe-1',
      name: '番茄炒蛋',
      emoji: '🍳',
      category: '快手菜',
      calories: 200,
      time: 10,
      ingredients: [{ name: '番茄', amount: '2个' }],
      steps: ['切番茄', '炒蛋'],
      nutrition: { protein: 12, carbs: 8, fat: 14 },
    },
  ]),
}))

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

const { default: RecipesPage } = await import('../Recipes')

describe('RecipesPage', () => {
  it('renders without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <RecipesPage />
      </MemoryRouter>,
    )
    expect(container).toBeTruthy()
  })

  it('displays the page title', () => {
    render(
      <MemoryRouter>
        <RecipesPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Recipe Library/)).toBeInTheDocument()
  })

  it('handles typing in the search input without throwing', async () => {
    render(
      <MemoryRouter>
        <RecipesPage />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    const searchInput = screen.getByPlaceholderText(/Search recipes or ingredients/)
    await user.type(searchInput, '番茄')
    expect(searchInput).toHaveValue('番茄')
  })
})
