/**
 * Example tests for `coaching/notificationRouter.ts` (task 4.1,
 * Requirement 2.1).
 *
 * `notificationRouter.ts` exports `startNotificationClickListener(navigate)`,
 * which:
 *   - returns a no-op cleanup if `window.coaching?.onNotificationClicked`
 *     isn't available (e.g., test runtime without the preload bridge);
 *   - otherwise subscribes via `window.coaching.onNotificationClicked`,
 *     mapping incoming page strings to React-Router paths through the
 *     internal `PAGE_ROUTES` table:
 *       'diet-log' → '/diet-log'
 *       'chat'     → '/chat'
 *       'home'     → '/'
 *     unknown     → '/'
 *   - returns the unsubscribe function emitted by the bridge.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { startNotificationClickListener } from '../notificationRouter'

type ClickHandler = (page: string) => void

describe('coaching/notificationRouter', () => {
  let registered: ClickHandler | null = null
  let unsubscribe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    registered = null
    unsubscribe = vi.fn()

    vi.stubGlobal('coaching', {
      onNotificationClicked: vi.fn((handler: ClickHandler) => {
        registered = handler
        return unsubscribe
      }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a no-op cleanup when window.coaching is missing', () => {
    vi.unstubAllGlobals()

    const navigate = vi.fn()
    const cleanup = startNotificationClickListener(navigate)

    expect(typeof cleanup).toBe('function')
    expect(() => cleanup()).not.toThrow()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('routes diet-log clicks to /diet-log', () => {
    const navigate = vi.fn()
    startNotificationClickListener(navigate)

    expect(registered).toBeTruthy()
    registered!('diet-log')

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/diet-log')
  })

  it('routes chat clicks to /chat', () => {
    const navigate = vi.fn()
    startNotificationClickListener(navigate)

    registered!('chat')

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/chat')
  })

  it('routes home clicks to /', () => {
    const navigate = vi.fn()
    startNotificationClickListener(navigate)

    registered!('home')

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('falls back to / for unknown pages', () => {
    const navigate = vi.fn()
    startNotificationClickListener(navigate)

    registered!('this-page-does-not-exist')

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('returns the unsubscribe function provided by the bridge', () => {
    const navigate = vi.fn()
    const cleanup = startNotificationClickListener(navigate)

    expect(unsubscribe).not.toHaveBeenCalled()
    cleanup()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
