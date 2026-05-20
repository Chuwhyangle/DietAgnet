/**
 * Reusable Electron mock for main-process tests (task 2.1).
 *
 * Wired in via:
 *
 *     vi.mock('electron', async () => {
 *       const { electronMock } = await import('@/test/doubles/electron')
 *       return electronMock()
 *     })
 *
 * The mock covers the surface area the production code under
 * `src/main/**` actually touches today (`app`, `BrowserWindow`,
 * `ipcMain`, `ipcRenderer`, `Notification`, `safeStorage`, `dialog`)
 * plus a small set of helpers tests use to invoke recorded IPC
 * handlers and inspect Notification instances.
 *
 * Design choices baked in here (see design.md "Mocking strategy"):
 *
 * - `ipcMain.handle(channel, listener)` records the listener into a
 *   `Map<string, listener>` accessible via `getRegisteredHandlers`.
 *   Tests call the recorded listener directly instead of round-
 *   tripping a real IPC event, so we get fast, deterministic
 *   coverage of the handler body.
 *
 * - `new Notification(options)` pushes a recorder entry into an
 *   array accessible via `getNotificationRecorder`. Each entry
 *   captures the constructor options plus `vi.fn()`-backed
 *   `show()`, `close()`, and `on()` so tests can both assert "this
 *   was created" and "the click handler was wired up".
 *
 * - `safeStorage` is a deterministic, in-memory `Buffer` round-trip
 *   stub imported from `./safeStorage` (task 2.2). Each `electronMock()`
 *   call gets a fresh instance via `createSafeStorageMock()` so per-file
 *   credential state stays isolated.
 *
 * - `BrowserWindow` is a `vi.fn()` constructor that yields a stub
 *   window with the methods `src/main/index.ts` and `src/main/agent.ts`
 *   reach for (`isDestroyed`, `isVisible`, `isMinimized`, `isFocused`,
 *   `restore`, `show`, `focus`, `hide`, `loadURL`, `loadFile`, `on`,
 *   `webContents.send`, `webContents.setWindowOpenHandler`). Tests
 *   that need different behavior override the relevant `Mock` per
 *   instance after construction.
 */

import { vi, type Mock } from 'vitest'

import { createSafeStorageMock, type SafeStorageMock } from './safeStorage'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NotificationConstructorOptions {
  title: string
  body: string
  silent?: boolean
  urgency?: 'normal' | 'critical' | 'low'
  [key: string]: unknown
}

export interface NotificationRecorderEntry {
  /** The options object passed to `new Notification(options)`. */
  options: NotificationConstructorOptions
  /** The instance returned by the constructor; tests can invoke `show()` / inspect `.on` calls. */
  instance: NotificationInstance
}

export interface NotificationInstance {
  show: Mock
  close: Mock
  on: Mock
  removeListener: Mock
}

export type IpcMainHandler = (
  event: unknown,
  ...args: unknown[]
) => unknown | Promise<unknown>

export interface BrowserWindowInstance {
  isDestroyed: Mock<[], boolean>
  isVisible: Mock<[], boolean>
  isMinimized: Mock<[], boolean>
  isFocused: Mock<[], boolean>
  restore: Mock
  show: Mock
  focus: Mock
  hide: Mock
  close: Mock
  loadURL: Mock
  loadFile: Mock
  on: Mock
  off: Mock
  webContents: {
    send: Mock
    setWindowOpenHandler: Mock
  }
}

export interface BrowserWindowConstructor extends Mock {
  getAllWindows: Mock<[], BrowserWindowInstance[]>
  getFocusedWindow: Mock<[], BrowserWindowInstance | null>
  fromWebContents: Mock<[unknown], BrowserWindowInstance | null>
}

export interface AppMock {
  whenReady: Mock<[], Promise<void>>
  on: Mock
  off: Mock
  quit: Mock
  exit: Mock
  getPath: Mock<[string], string>
  setAppUserModelId: Mock
  requestSingleInstanceLock: Mock<[], boolean>
  isReady: Mock<[], boolean>
}

export interface IpcMainMock {
  handle: Mock<[string, IpcMainHandler], void>
  handleOnce: Mock<[string, IpcMainHandler], void>
  removeHandler: Mock<[string], void>
  on: Mock
  removeAllListeners: Mock
}

export interface IpcRendererMock {
  invoke: Mock<[string, ...unknown[]], Promise<unknown>>
  send: Mock
  on: Mock
  off: Mock
  removeListener: Mock
  removeAllListeners: Mock
}

export interface NotificationConstructor extends Mock {
  isSupported: Mock<[], boolean>
}

export type { SafeStorageMock }

export interface DialogMock {
  showSaveDialog: Mock
  showOpenDialog: Mock
  showMessageBox: Mock
  showErrorBox: Mock
}

export interface ElectronMock {
  app: AppMock
  BrowserWindow: BrowserWindowConstructor
  ipcMain: IpcMainMock
  ipcRenderer: IpcRendererMock
  Notification: NotificationConstructor
  safeStorage: SafeStorageMock
  dialog: DialogMock
  /**
   * Internal: registered IPC handler map. Use `getRegisteredHandlers(mock)`
   * rather than reading this directly so the indirection is stable if we
   * ever change storage.
   */
  __ipcHandlers: Map<string, IpcMainHandler>
  /**
   * Internal: notification instance recorder. Use
   * `getNotificationRecorder(mock)` rather than reading this directly.
   */
  __notifications: NotificationRecorderEntry[]
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createBrowserWindowInstance(): BrowserWindowInstance {
  return {
    isDestroyed: vi.fn<[], boolean>(() => false),
    isVisible: vi.fn<[], boolean>(() => true),
    isMinimized: vi.fn<[], boolean>(() => false),
    isFocused: vi.fn<[], boolean>(() => true),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    loadFile: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    off: vi.fn(),
    webContents: {
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    },
  }
}

function createNotificationConstructor(
  recorder: NotificationRecorderEntry[],
): NotificationConstructor {
  // `vi.fn()` constructors return the value the implementation returns,
  // so we can use `new` on this and get back our stub instance.
  const ctor = vi.fn(function NotificationCtor(
    options: NotificationConstructorOptions = { title: '', body: '' },
  ) {
    const instance: NotificationInstance = {
      show: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    }
    recorder.push({ options, instance })
    return instance
  }) as unknown as NotificationConstructor

  ctor.isSupported = vi.fn<[], boolean>(() => true)
  return ctor
}

function createBrowserWindowConstructor(): BrowserWindowConstructor {
  const instances: BrowserWindowInstance[] = []
  const ctor = vi.fn(function BrowserWindowCtor() {
    const instance = createBrowserWindowInstance()
    instances.push(instance)
    return instance
  }) as unknown as BrowserWindowConstructor

  ctor.getAllWindows = vi.fn<[], BrowserWindowInstance[]>(() =>
    instances.filter((win) => !win.isDestroyed()),
  )
  ctor.getFocusedWindow = vi.fn<[], BrowserWindowInstance | null>(
    () =>
      instances.find((win) => !win.isDestroyed() && win.isFocused()) ?? null,
  )
  ctor.fromWebContents = vi.fn<[unknown], BrowserWindowInstance | null>(
    () => instances.find((win) => !win.isDestroyed()) ?? null,
  )
  return ctor
}

function createIpcMainMock(
  handlers: Map<string, IpcMainHandler>,
): IpcMainMock {
  return {
    handle: vi.fn<[string, IpcMainHandler], void>((channel, listener) => {
      handlers.set(channel, listener)
    }),
    handleOnce: vi.fn<[string, IpcMainHandler], void>((channel, listener) => {
      handlers.set(channel, async (event, ...args) => {
        handlers.delete(channel)
        return listener(event, ...args)
      })
    }),
    removeHandler: vi.fn<[string], void>((channel) => {
      handlers.delete(channel)
    }),
    on: vi.fn(),
    removeAllListeners: vi.fn<[string?], void>((channel) => {
      if (channel === undefined) {
        handlers.clear()
      } else {
        handlers.delete(channel)
      }
    }) as Mock,
  }
}

function createIpcRendererMock(): IpcRendererMock {
  return {
    invoke: vi.fn<[string, ...unknown[]], Promise<unknown>>(() =>
      Promise.resolve(undefined),
    ),
    send: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  }
}

function createAppMock(): AppMock {
  return {
    whenReady: vi.fn<[], Promise<void>>(() => Promise.resolve()),
    on: vi.fn(),
    off: vi.fn(),
    quit: vi.fn(),
    exit: vi.fn(),
    getPath: vi.fn<[string], string>((name) => `/tmp/electron-mock/${name}`),
    setAppUserModelId: vi.fn(),
    requestSingleInstanceLock: vi.fn<[], boolean>(() => true),
    isReady: vi.fn<[], boolean>(() => true),
  }
}

function createDialogMock(): DialogMock {
  return {
    showSaveDialog: vi.fn(() =>
      Promise.resolve({ canceled: true, filePath: undefined }),
    ),
    showOpenDialog: vi.fn(() =>
      Promise.resolve({ canceled: true, filePaths: [] }),
    ),
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0, checkboxChecked: false })),
    showErrorBox: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a fresh Electron mock object suitable for `vi.mock('electron', ...)`.
 *
 * Each call returns an independent object so individual test files do not
 * share recorder state. Within a single file, prefer constructing once
 * inside the `vi.mock` factory and then reaching into the same instance
 * via `getRegisteredHandlers` / `getNotificationRecorder`.
 */
export function electronMock(): ElectronMock {
  const ipcHandlers = new Map<string, IpcMainHandler>()
  const notifications: NotificationRecorderEntry[] = []

  return {
    app: createAppMock(),
    BrowserWindow: createBrowserWindowConstructor(),
    ipcMain: createIpcMainMock(ipcHandlers),
    ipcRenderer: createIpcRendererMock(),
    Notification: createNotificationConstructor(notifications),
    safeStorage: createSafeStorageMock(),
    dialog: createDialogMock(),
    __ipcHandlers: ipcHandlers,
    __notifications: notifications,
  }
}

/**
 * Returns the live `Map<channel, listener>` recorded by `ipcMain.handle`.
 *
 * Tests use this to invoke a registered handler directly:
 *
 *     const handler = getRegisteredHandlers(mock).get('agent:get-api-key-status')
 *     const response = await handler!(undefined, 'deepseek')
 */
export function getRegisteredHandlers(
  mock: ElectronMock,
): Map<string, IpcMainHandler> {
  return mock.__ipcHandlers
}

/**
 * Returns the live recorder array of `Notification` instances created
 * during the test. Each entry captures the constructor options and the
 * stub instance so tests can assert show/click wiring.
 */
export function getNotificationRecorder(
  mock: ElectronMock,
): NotificationRecorderEntry[] {
  return mock.__notifications
}
