/**
 * Preload bridge tests (task 8.4).
 *
 * Mocks `electron` and `@electron-toolkit/preload`, then imports
 * `src/preload/index.ts` to verify:
 *   - Every key exposed on `window.agent` forwards to `ipcRenderer.invoke`
 *     with the documented channel name and argument shape.
 *   - Every key exposed on `window.dietLog` forwards to `ipcRenderer.invoke`
 *     with the documented channel name.
 *   - Every key exposed on `window.coaching` wires up `ipcRenderer.on` /
 *     `ipcRenderer.removeListener` for the documented channels.
 *   - `ipcRenderer` itself is never re-exposed on the window object.
 *
 * Validates: Requirement 5.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockIpcRenderer = {
  invoke: vi.fn(() => Promise.resolve(undefined)),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: mockIpcRenderer,
}))

vi.mock('@electron-toolkit/preload', () => ({
  electronAPI: { ipcRenderer: mockIpcRenderer },
}))

// ---------------------------------------------------------------------------
// Import the preload script (triggers side effects)
// ---------------------------------------------------------------------------

// We need to capture what contextBridge.exposeInMainWorld receives.
// Since process.contextIsolated may be true in jsdom, we control it:
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

/**
 * Helper: imports the preload module fresh and returns the exposed APIs
 * by capturing `contextBridge.exposeInMainWorld` calls or the window
 * assignments (depending on `process.contextIsolated`).
 */
async function loadPreloadAndGetExposedApis(): Promise<{
  agent: Record<string, unknown>
  dietLog: Record<string, unknown>
  coaching: Record<string, unknown>
  electron: Record<string, unknown>
}> {
  // Force the non-contextIsolated path so APIs are assigned to window directly
  Object.defineProperty(process, 'contextIsolated', { value: false, writable: true })

  // Clear any previous window assignments
  delete (window as any).agent
  delete (window as any).dietLog
  delete (window as any).coaching
  delete (window as any).electron

  await import('../index')

  return {
    agent: (window as any).agent ?? {},
    dietLog: (window as any).dietLog ?? {},
    coaching: (window as any).coaching ?? {},
    electron: (window as any).electron ?? {},
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Preload Bridge (src/preload/index.ts)', () => {
  describe('window.agent API forwarding', () => {
    it('getApiKeyStatus forwards to ipcRenderer.invoke with agent:get-api-key-status', async () => {
      const { agent } = await loadPreloadAndGetExposedApis()
      const fn = agent.getApiKeyStatus as Function
      expect(fn).toBeTypeOf('function')

      await fn('deepseek')

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'agent:get-api-key-status',
        'deepseek',
      )
    })

    it('saveApiKey forwards to ipcRenderer.invoke with agent:save-api-key', async () => {
      const { agent } = await loadPreloadAndGetExposedApis()
      const fn = agent.saveApiKey as Function
      expect(fn).toBeTypeOf('function')

      const request = { provider: 'deepseek' as const, apiKey: 'test-api-key-placeholder' }
      await fn(request)

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'agent:save-api-key',
        request,
      )
    })

    it('clearApiKey forwards to ipcRenderer.invoke with agent:clear-api-key', async () => {
      const { agent } = await loadPreloadAndGetExposedApis()
      const fn = agent.clearApiKey as Function
      expect(fn).toBeTypeOf('function')

      await fn('qwen')

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'agent:clear-api-key',
        'qwen',
      )
    })

    it('chatCompletions forwards to ipcRenderer.invoke with agent:chat-completions', async () => {
      const { agent } = await loadPreloadAndGetExposedApis()
      const fn = agent.chatCompletions as Function
      expect(fn).toBeTypeOf('function')

      const request = {
        settings: {
          provider: 'deepseek',
          apiBaseUrl: 'https://api.deepseek.com',
          model: 'deepseek-v4-flash',
          toolCompatibility: 'auto',
        },
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
      }
      await fn(request)

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'agent:chat-completions',
        request,
      )
    })

    it('runDiagnostics forwards to ipcRenderer.invoke with agent:run-diagnostics', async () => {
      const { agent } = await loadPreloadAndGetExposedApis()
      const fn = agent.runDiagnostics as Function
      expect(fn).toBeTypeOf('function')

      const settings = {
        provider: 'deepseek',
        apiBaseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        toolCompatibility: 'auto',
      }
      await fn(settings)

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'agent:run-diagnostics',
        settings,
      )
    })

    it('getUsageStats forwards to ipcRenderer.invoke with agent:get-usage-stats', async () => {
      const { agent } = await loadPreloadAndGetExposedApis()
      const fn = agent.getUsageStats as Function
      expect(fn).toBeTypeOf('function')

      await fn()

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('agent:get-usage-stats')
    })

    it('clearUsageStats forwards to ipcRenderer.invoke with agent:clear-usage-stats', async () => {
      const { agent } = await loadPreloadAndGetExposedApis()
      const fn = agent.clearUsageStats as Function
      expect(fn).toBeTypeOf('function')

      await fn()

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('agent:clear-usage-stats')
    })

    it('showNotification forwards to ipcRenderer.invoke with agent:show-notification', async () => {
      const { agent } = await loadPreloadAndGetExposedApis()
      const fn = agent.showNotification as Function
      expect(fn).toBeTypeOf('function')

      const request = { title: 'Test', body: 'Hello', silent: false }
      await fn(request)

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'agent:show-notification',
        request,
      )
    })
  })

  describe('window.dietLog API forwarding', () => {
    it('exportFile forwards to ipcRenderer.invoke with diet-log:export-file', async () => {
      const { dietLog } = await loadPreloadAndGetExposedApis()
      const fn = dietLog.exportFile as Function
      expect(fn).toBeTypeOf('function')

      const request = {
        defaultFileName: 'export.csv',
        mimeType: 'text/csv',
        content: 'data',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      }
      await fn(request)

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'diet-log:export-file',
        request,
      )
    })
  })

  describe('window.coaching API forwarding', () => {
    it('onReminderTick registers a listener on coaching:reminder-tick and returns unsubscribe', async () => {
      const { coaching } = await loadPreloadAndGetExposedApis()
      const fn = coaching.onReminderTick as Function
      expect(fn).toBeTypeOf('function')

      const callback = vi.fn()
      const unsubscribe = fn(callback)

      expect(mockIpcRenderer.on).toHaveBeenCalledWith(
        'coaching:reminder-tick',
        expect.any(Function),
      )

      // Invoke the registered handler to verify it calls the callback
      const registeredHandler = mockIpcRenderer.on.mock.calls.find(
        ([channel]) => channel === 'coaching:reminder-tick',
      )?.[1]
      expect(registeredHandler).toBeDefined()
      registeredHandler!()
      expect(callback).toHaveBeenCalled()

      // Unsubscribe should call removeListener
      expect(unsubscribe).toBeTypeOf('function')
      unsubscribe()
      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
        'coaching:reminder-tick',
        expect.any(Function),
      )
    })

    it('onNotificationClicked registers a listener on coaching:notification-clicked and returns unsubscribe', async () => {
      const { coaching } = await loadPreloadAndGetExposedApis()
      const fn = coaching.onNotificationClicked as Function
      expect(fn).toBeTypeOf('function')

      const callback = vi.fn()
      const unsubscribe = fn(callback)

      expect(mockIpcRenderer.on).toHaveBeenCalledWith(
        'coaching:notification-clicked',
        expect.any(Function),
      )

      // Invoke the registered handler to verify it forwards the page argument
      const registeredHandler = mockIpcRenderer.on.mock.calls.find(
        ([channel]) => channel === 'coaching:notification-clicked',
      )?.[1]
      expect(registeredHandler).toBeDefined()
      registeredHandler!({}, 'diet-log')
      expect(callback).toHaveBeenCalledWith('diet-log')

      // Unsubscribe should call removeListener
      expect(unsubscribe).toBeTypeOf('function')
      unsubscribe()
      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
        'coaching:notification-clicked',
        expect.any(Function),
      )
    })
  })

  describe('ipcRenderer is not re-exposed', () => {
    it('window.ipcRenderer is not defined', async () => {
      await loadPreloadAndGetExposedApis()
      expect((window as any).ipcRenderer).toBeUndefined()
    })

    it('window.agent does not expose ipcRenderer', async () => {
      const { agent } = await loadPreloadAndGetExposedApis()
      expect((agent as any).ipcRenderer).toBeUndefined()
    })

    it('window.dietLog does not expose ipcRenderer', async () => {
      const { dietLog } = await loadPreloadAndGetExposedApis()
      expect((dietLog as any).ipcRenderer).toBeUndefined()
    })

    it('window.coaching does not expose ipcRenderer', async () => {
      const { coaching } = await loadPreloadAndGetExposedApis()
      expect((coaching as any).ipcRenderer).toBeUndefined()
    })
  })
})
