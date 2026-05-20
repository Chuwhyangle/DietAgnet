/**
 * Reusable `@electron-toolkit/preload` mock for preload-bridge tests
 * (task 2.3, Requirement 5.4).
 *
 * Wired in via:
 *
 *     vi.mock('@electron-toolkit/preload', async () => {
 *       const { electronToolkitPreloadMock } = await import(
 *         '@/test/doubles/ipcRenderer'
 *       )
 *       return electronToolkitPreloadMock()
 *     })
 *
 * The factory replaces the `@electron-toolkit/preload` module with an
 * object of shape `{ electronAPI: { ipcRenderer: {...} } }` so the
 * preload bridge (`src/preload/index.ts`) can import and use
 * `electronAPI` exactly the way it does in production, while every
 * `invoke`, `send`, `on`, and `removeListener` call is recorded for
 * later assertion.
 *
 * Design notes (per design.md "Mocking strategy" row for
 * `@electron-toolkit/preload`):
 *
 * - Only the four members the production code touches today are
 *   mocked: `invoke`, `send`, `on`, `removeListener`. Adding more
 *   later is cheap; over-mocking now would invite tests that depend
 *   on members the bridge never uses.
 *
 * - `invoke` resolves with `undefined` by default. Tests that need a
 *   specific resolved value override the mock per-test via
 *   `electronAPI.ipcRenderer.invoke.mockResolvedValueOnce(...)`.
 *
 * - The factory tracks every call to `invoke` and `send` in a
 *   per-mock recorder. The `recordedInvocations(channel)` helper
 *   reads that recorder and returns the forwarded argument tuples
 *   for the requested channel, so a Preload_Bridge_Test can assert:
 *
 *       expect(recordedInvocations('agent:save-api-key')).toEqual([
 *         [{ provider: 'deepseek', apiKey: 'sk-test' }],
 *       ])
 *
 *   `recordedInvocations` reads from the most recently created mock,
 *   which is the right behavior for the standard one-mock-per-file
 *   usage pattern Vitest enforces (each test file evaluates its own
 *   module graph). Tests that need explicit access to a specific
 *   mock instance can pass it as a second argument:
 *
 *       recordedInvocations('agent:get-api-key-status', mock)
 */

import { vi, type Mock } from 'vitest'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type IpcRendererListener = (
  event: unknown,
  ...args: unknown[]
) => void

export interface ElectronToolkitIpcRendererMock {
  invoke: Mock<[string, ...unknown[]], Promise<unknown>>
  send: Mock<[string, ...unknown[]], void>
  on: Mock<[string, IpcRendererListener], void>
  removeListener: Mock<[string, IpcRendererListener], void>
}

export interface ElectronToolkitPreloadMock {
  electronAPI: {
    ipcRenderer: ElectronToolkitIpcRendererMock
  }
}

// ---------------------------------------------------------------------------
// Module-level "current mock" tracker
// ---------------------------------------------------------------------------

/**
 * Each Vitest test file evaluates its own module graph, so the
 * "current mock" tracked here is scoped to a single file's run.
 * Tests that mock `@electron-toolkit/preload` once per file can
 * therefore use `recordedInvocations(channel)` without having to
 * thread the mock object through every assertion.
 */
let currentMock: ElectronToolkitPreloadMock | null = null

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a fresh `@electron-toolkit/preload` mock object.
 *
 * Each call returns an independent object with its own `vi.fn()`-
 * backed members so individual test files do not share recorder
 * state. The most recently created mock is also stored as the
 * module-level "current mock" used by `recordedInvocations`.
 */
export function electronToolkitPreloadMock(): ElectronToolkitPreloadMock {
  const ipcRenderer: ElectronToolkitIpcRendererMock = {
    invoke: vi.fn<[string, ...unknown[]], Promise<unknown>>(() =>
      Promise.resolve(undefined),
    ),
    send: vi.fn<[string, ...unknown[]], void>(),
    on: vi.fn<[string, IpcRendererListener], void>(),
    removeListener: vi.fn<[string, IpcRendererListener], void>(),
  }

  const mock: ElectronToolkitPreloadMock = {
    electronAPI: { ipcRenderer },
  }

  currentMock = mock
  return mock
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Return every argument tuple forwarded to `ipcRenderer.invoke` /
 * `ipcRenderer.send` for the given channel, oldest first.
 *
 * Each entry is the array of arguments that followed the channel
 * name. For example, given:
 *
 *     ipcRenderer.invoke('agent:save-api-key', { provider, apiKey })
 *     ipcRenderer.invoke('agent:save-api-key', { provider: 'x', apiKey: 'y' })
 *
 * `recordedInvocations('agent:save-api-key')` returns
 * `[[{ provider, apiKey }], [{ provider: 'x', apiKey: 'y' }]]`.
 *
 * Tests that need to disambiguate `invoke` from `send` can use
 * `recordedSends(channel)` instead.
 *
 * If `mock` is omitted, the most recently created mock is used; this
 * is the standard one-mock-per-file pattern. Pass `mock` explicitly
 * when a single test exercises multiple mock instances.
 */
export function recordedInvocations(
  channel: string,
  mock: ElectronToolkitPreloadMock | null = currentMock,
): unknown[][] {
  if (!mock) {
    throw new Error(
      'recordedInvocations: no mock has been created. Did you forget to ' +
        'call vi.mock("@electron-toolkit/preload", ...) with electronToolkitPreloadMock()?',
    )
  }
  const invokeCalls = mock.electronAPI.ipcRenderer.invoke.mock.calls
  return invokeCalls
    .filter(([calledChannel]) => calledChannel === channel)
    .map(([, ...args]) => args)
}

/**
 * Return every argument tuple forwarded to `ipcRenderer.send` for
 * the given channel, oldest first. Mirrors `recordedInvocations`
 * for fire-and-forget IPC channels.
 */
export function recordedSends(
  channel: string,
  mock: ElectronToolkitPreloadMock | null = currentMock,
): unknown[][] {
  if (!mock) {
    throw new Error(
      'recordedSends: no mock has been created. Did you forget to ' +
        'call vi.mock("@electron-toolkit/preload", ...) with electronToolkitPreloadMock()?',
    )
  }
  const sendCalls = mock.electronAPI.ipcRenderer.send.mock.calls
  return sendCalls
    .filter(([calledChannel]) => calledChannel === channel)
    .map(([, ...args]) => args)
}

/**
 * Return every `(channel, listener)` pair registered via
 * `ipcRenderer.on`. Useful for asserting that a renderer-side
 * subscription was wired up to the documented channel.
 */
export function recordedListeners(
  channel: string,
  mock: ElectronToolkitPreloadMock | null = currentMock,
): IpcRendererListener[] {
  if (!mock) {
    throw new Error(
      'recordedListeners: no mock has been created. Did you forget to ' +
        'call vi.mock("@electron-toolkit/preload", ...) with electronToolkitPreloadMock()?',
    )
  }
  const onCalls = mock.electronAPI.ipcRenderer.on.mock.calls
  return onCalls
    .filter(([calledChannel]) => calledChannel === channel)
    .map(([, listener]) => listener)
}

/**
 * Returns the most recently created mock. Test files that have
 * `vi.clearAllMocks()` in `beforeEach` should use this to reach
 * into the live mock between tests, since `vi.clearAllMocks` resets
 * the call history but leaves the object identity intact.
 */
export function getCurrentMock(): ElectronToolkitPreloadMock {
  if (!currentMock) {
    throw new Error(
      'getCurrentMock: no mock has been created. Did you forget to ' +
        'call vi.mock("@electron-toolkit/preload", ...) with electronToolkitPreloadMock()?',
    )
  }
  return currentMock
}
