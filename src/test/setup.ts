/**
 * Shared test setup for the `comprehensive-testing` spec (task 1.4).
 *
 * Wired in via `vitest.config.ts` `setupFiles`. Vitest evaluates this
 * once per worker and registers per-test isolation hooks so test order,
 * the wall clock, the host network, and persistent storage cannot
 * affect outcomes.
 *
 * Responsibilities (per design.md "Shared setup file"):
 *   1. Install jsdom-friendly IndexedDB shim (`fake-indexeddb/auto`).
 *   2. Register `@testing-library/jest-dom` matchers.
 *   3. Per-test fetch guard - network access forbidden by default
 *      (Req 1.8, 9.7). Tests that need a fake fetch override the guard
 *      with `vi.spyOn(globalThis, 'fetch')` or `vi.stubGlobal('fetch', ...)`.
 *   4. Per-test `localStorage` reset for jsdom-environment tests
 *      (Req 2.8).
 *   5. Per-test Dexie reset - walks `indexedDB.databases()` and deletes
 *      each (Req 2.7).
 *   6. Per-test unflushed real-clock timer detector (Req 9.6). Records
 *      the caller's stack trace for every `setTimeout`/`setInterval`
 *      call and emits a structured warning (with stack traces) in
 *      `afterEach` if any real-clock callbacks remain pending. Leaked
 *      timers are cleared to prevent cross-test interference.
 *   7. Per-test cleanup: restore the original `globalThis.fetch`.
 *
 * Notes for test authors:
 *   - Tests driving time MUST use `vi.useFakeTimers()` paired with
 *     `vi.useRealTimers()` in `afterEach`. The timer detector does not
 *     flag fake-timer state because vitest swaps the globals while
 *     fake timers are active.
 *   - Tests that need fetch should mock it explicitly inside the test.
 *     The guard is reinstalled before every test so per-test mocks
 *     stay isolated.
 *   - The setup file deliberately does NOT call `vi.restoreAllMocks()`
 *     in `afterEach`. Doing so wipes the `mockReturnValue` set inside
 *     module-level `vi.mock(..., factory)` declarations and breaks
 *     tests that rely on persistent factory state across `it` blocks
 *     (the existing desktopNotifier test is one such case). Tests that
 *     create per-test spies via `vi.spyOn` are responsible for their
 *     own teardown - either pair with `mockRestore()` in `afterEach`
 *     or rely on Vitest's automatic restoration via the
 *     `restoreMocks: true` config (not enabled here for the same
 *     reason).
 */

import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Real-clock timer tracking
// ---------------------------------------------------------------------------
//
// We wrap the real `setTimeout` / `setInterval` at module load so the
// detector can spot tests that schedule background work but never clean
// it up. When a test calls `vi.useFakeTimers()`, vitest replaces these
// globals with its own fakes for the duration of the test, so our
// wrappers fall dormant - exactly what we want, since fake-timer tests
// don't leak real-clock callbacks. `vi.useRealTimers()` restores our
// wrapped versions.

interface PendingTimer {
  readonly kind: 'timeout' | 'interval'
  readonly createdAt: string // stack trace of the caller
  readonly delay: number | undefined
}

const pendingTimers = new Map<unknown, PendingTimer>()

const realSetTimeout = globalThis.setTimeout
const realSetInterval = globalThis.setInterval
const realClearTimeout = globalThis.clearTimeout
const realClearInterval = globalThis.clearInterval

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trackedSetTimeout: any = (
  handler: TimerHandler,
  timeout?: number,
  ...args: unknown[]
) => {
  const callerStack = new Error().stack ?? '(no stack available)'
  let id: ReturnType<typeof realSetTimeout>
  // eslint-disable-next-line prefer-const
  id = realSetTimeout(
    (...cbArgs: unknown[]) => {
      pendingTimers.delete(id)
      if (typeof handler === 'function') {
        ;(handler as (...a: unknown[]) => void)(...cbArgs)
      }
    },
    timeout,
    ...args,
  )
  pendingTimers.set(id, { kind: 'timeout', createdAt: callerStack, delay: timeout })
  return id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trackedSetInterval: any = (
  handler: TimerHandler,
  timeout?: number,
  ...args: unknown[]
) => {
  const callerStack = new Error().stack ?? '(no stack available)'
  // Intervals fire repeatedly, so we keep the original handler intact
  // and only record the id; clearInterval removes it.
  const id = realSetInterval(handler, timeout, ...args)
  pendingTimers.set(id, { kind: 'interval', createdAt: callerStack, delay: timeout })
  return id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trackedClearTimeout: any = (id: unknown) => {
  pendingTimers.delete(id)
  return realClearTimeout(id as Parameters<typeof realClearTimeout>[0])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const trackedClearInterval: any = (id: unknown) => {
  pendingTimers.delete(id)
  return realClearInterval(id as Parameters<typeof realClearInterval>[0])
}

// Preserve helper props (e.g. node's `__promisify__`) so callers that
// reach for them still see the original surface.
Object.assign(trackedSetTimeout, realSetTimeout)
Object.assign(trackedSetInterval, realSetInterval)

globalThis.setTimeout = trackedSetTimeout
globalThis.setInterval = trackedSetInterval
globalThis.clearTimeout = trackedClearTimeout
globalThis.clearInterval = trackedClearInterval

// ---------------------------------------------------------------------------
// Per-test isolation hooks
// ---------------------------------------------------------------------------

// Capture the original fetch reference (may be `undefined` in plain
// node envs). The guard is reinstalled before each test, and we
// restore this exact reference in `afterEach`.
const originalFetch = globalThis.fetch

const NETWORK_FORBIDDEN_MESSAGE =
  'Network access during test is forbidden. Mock the call explicitly.'

beforeEach(() => {
  // 1. Network guard. Throws inside the mock body so callers see the
  //    error whether they `await fetch(...)` or treat it as sync.
  globalThis.fetch = vi.fn(() => {
    throw new Error(NETWORK_FORBIDDEN_MESSAGE)
  }) as unknown as typeof fetch

  // 2. localStorage reset (jsdom only - node env leaves the global
  //    undefined and we skip).
  if (typeof globalThis.localStorage !== 'undefined') {
    try {
      globalThis.localStorage.clear()
    } catch {
      // Some tests replace localStorage with a stub that disallows
      // direct mutation; ignore and let the test manage its own state.
    }
  }

  // 3. Reset timer bookkeeping so we only flag leaks caused by the
  //    test currently starting, not cross-test residue.
  pendingTimers.clear()
})

afterEach(async () => {
  // 1. Tear down every IndexedDB database opened during the test
  //    (Dexie's `diet-agent-planning` plus anything else fake-indexeddb
  //    created). Best-effort - failures are swallowed because the next
  //    test starts from an empty shim regardless.
  if (
    typeof indexedDB !== 'undefined' &&
    typeof indexedDB.databases === 'function'
  ) {
    try {
      const dbs = await indexedDB.databases()
      for (const db of dbs ?? []) {
        if (db.name) {
          try {
            indexedDB.deleteDatabase(db.name)
          } catch {
            // Connection still held by the test; ignore.
          }
        }
      }
    } catch {
      // databases() not implemented or threw; ignore.
    }
  }

  // 2. Detect leaked real-clock timers. Emit a structured warning with
  //    caller stack traces so developers can locate the source. Uses
  //    console.warn (not throw) to avoid hard-failing tests that trigger
  //    benign internal timers (e.g. Ant Design animation timers).
  if (pendingTimers.size > 0) {
    const leaks = Array.from(pendingTimers.values()).map((t) => ({
      kind: t.kind,
      delay: t.delay,
      createdAt: t.createdAt,
    }))
    // Structured payload for programmatic consumption.
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        level: 'warn',
        kind: 'unflushed-real-clock-timer',
        count: pendingTimers.size,
        types: leaks.map((l) => l.kind),
        hint: 'Pair vi.useFakeTimers() with vi.useRealTimers(), or clear setTimeout/setInterval ids explicitly.',
        leaks,
      }),
    )
    // Cancel the leaked timers so they don't fire during a later test.
    for (const id of Array.from(pendingTimers.keys())) {
      const t = pendingTimers.get(id)
      try {
        if (t?.kind === 'timeout') {
          realClearTimeout(id as Parameters<typeof realClearTimeout>[0])
        } else {
          realClearInterval(id as Parameters<typeof realClearInterval>[0])
        }
      } catch {
        // Best effort.
      }
    }
    pendingTimers.clear()
  }

  // 3. Restore the original fetch in case a test stubbed it without
  //    using vi (direct assignment isn't tracked by vi). The next
  //    `beforeEach` reinstalls the guard, so this just keeps the
  //    state tidy between tests.
  globalThis.fetch = originalFetch as typeof fetch
})
