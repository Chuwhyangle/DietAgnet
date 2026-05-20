/**
 * Main-process diet-log IPC handler tests (task 8.2).
 *
 * Covers the `diet-log:export-file` IPC handler registered by
 * `registerDietLogIpcHandlers()` in `src/main/dietLog.ts`.
 *
 * Tests exercise:
 *   - Success path: dialog returns a file path, writeFile succeeds,
 *     handler returns `{ status: 'saved', filePath }`.
 *   - Cancelled path: dialog is cancelled by the user.
 *   - Failure modes: no window available, window destroyed, writeFile
 *     throws, dialog throws.
 *
 * Validates: Requirements 5.2, 5.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  electronMock,
  getRegisteredHandlers,
  type ElectronMock,
  type IpcMainHandler,
  type BrowserWindowInstance,
} from '../../test/doubles/electron'
import type { DietLogExportRequest, DietLogExportResponse } from '../../shared/dietLog'

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

let mockElectron: ElectronMock

vi.mock('electron', () => {
  mockElectron = electronMock()
  return mockElectron
})

const mockWriteFile = vi.fn<[string, string, string], Promise<void>>(() => Promise.resolve())

vi.mock('node:fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...(args as [string, string, string])),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExportRequest(overrides?: Partial<DietLogExportRequest>): DietLogExportRequest {
  return {
    defaultFileName: 'diet-log-2024-01-15.csv',
    mimeType: 'text/csv',
    content: 'date,meal,calories\n2024-01-15,breakfast,450',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    ...overrides,
  }
}

function createMockWindow(overrides?: Partial<BrowserWindowInstance>): BrowserWindowInstance {
  return {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isMinimized: vi.fn(() => false),
    isFocused: vi.fn(() => true),
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
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('src/main/dietLog.ts — diet-log:export-file IPC handler', () => {
  let exportHandler: IpcMainHandler
  let mockWindow: BrowserWindowInstance

  beforeEach(async () => {
    mockElectron = electronMock()
    mockWriteFile.mockReset()
    mockWriteFile.mockResolvedValue(undefined)
    mockWindow = createMockWindow()

    vi.resetModules()
    vi.doMock('electron', () => mockElectron)
    vi.doMock('node:fs/promises', () => ({
      writeFile: (...args: unknown[]) => mockWriteFile(...(args as [string, string, string])),
    }))

    const dietLogModule = await import('../dietLog')
    dietLogModule.registerDietLogIpcHandlers(() => mockWindow as unknown as import('electron').BrowserWindow)

    const handlers = getRegisteredHandlers(mockElectron)
    const handler = handlers.get('diet-log:export-file')
    expect(handler).toBeDefined()
    exportHandler = handler!
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Success path
  // -------------------------------------------------------------------------

  it('returns saved status with filePath when export succeeds', async () => {
    mockElectron.dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/home/user/diet-log-2024-01-15.csv',
    })

    const result = (await exportHandler(undefined, makeExportRequest())) as DietLogExportResponse

    expect(result).toEqual({
      status: 'saved',
      filePath: '/home/user/diet-log-2024-01-15.csv',
    })
  })

  it('calls dialog.showSaveDialog with correct options', async () => {
    mockElectron.dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/tmp/export.csv',
    })

    const request = makeExportRequest({
      defaultFileName: 'my-export.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })

    await exportHandler(undefined, request)

    expect(mockElectron.dialog.showSaveDialog).toHaveBeenCalledWith(
      mockWindow,
      {
        defaultPath: 'my-export.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      },
    )
  })

  it('writes file content with utf8 encoding', async () => {
    mockElectron.dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/tmp/export.csv',
    })

    const request = makeExportRequest({ content: 'hello,world' })
    await exportHandler(undefined, request)

    expect(mockWriteFile).toHaveBeenCalledWith('/tmp/export.csv', 'hello,world', 'utf8')
  })

  // -------------------------------------------------------------------------
  // Cancelled path
  // -------------------------------------------------------------------------

  it('returns cancelled status when user cancels the dialog', async () => {
    mockElectron.dialog.showSaveDialog.mockResolvedValue({
      canceled: true,
      filePath: undefined,
    })

    const result = (await exportHandler(undefined, makeExportRequest())) as DietLogExportResponse

    expect(result).toEqual({ status: 'cancelled' })
  })

  it('does not write file when dialog is cancelled', async () => {
    mockElectron.dialog.showSaveDialog.mockResolvedValue({
      canceled: true,
      filePath: undefined,
    })

    await exportHandler(undefined, makeExportRequest())

    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Failure: no window available
  // -------------------------------------------------------------------------

  it('returns failed status when main window is null', async () => {
    // Re-register with a getter that returns null
    vi.resetModules()
    vi.doMock('electron', () => mockElectron)
    vi.doMock('node:fs/promises', () => ({
      writeFile: (...args: unknown[]) => mockWriteFile(...(args as [string, string, string])),
    }))

    const dietLogModule = await import('../dietLog')
    dietLogModule.registerDietLogIpcHandlers(() => null)

    const handlers = getRegisteredHandlers(mockElectron)
    const handler = handlers.get('diet-log:export-file')!

    const result = (await handler(undefined, makeExportRequest())) as DietLogExportResponse

    expect(result).toEqual({
      status: 'failed',
      error: 'Main window is not available',
    })
  })

  // -------------------------------------------------------------------------
  // Failure: window is destroyed
  // -------------------------------------------------------------------------

  it('returns failed status when main window is destroyed', async () => {
    const destroyedWindow = createMockWindow({
      isDestroyed: vi.fn(() => true),
    })

    vi.resetModules()
    vi.doMock('electron', () => mockElectron)
    vi.doMock('node:fs/promises', () => ({
      writeFile: (...args: unknown[]) => mockWriteFile(...(args as [string, string, string])),
    }))

    const dietLogModule = await import('../dietLog')
    dietLogModule.registerDietLogIpcHandlers(
      () => destroyedWindow as unknown as import('electron').BrowserWindow,
    )

    const handlers = getRegisteredHandlers(mockElectron)
    const handler = handlers.get('diet-log:export-file')!

    const result = (await handler(undefined, makeExportRequest())) as DietLogExportResponse

    expect(result).toEqual({
      status: 'failed',
      error: 'Main window is not available',
    })
  })

  // -------------------------------------------------------------------------
  // Failure: writeFile throws
  // -------------------------------------------------------------------------

  it('returns failed status with error message when writeFile throws', async () => {
    mockElectron.dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/readonly/path.csv',
    })
    mockWriteFile.mockRejectedValue(new Error('EACCES: permission denied'))

    const result = (await exportHandler(undefined, makeExportRequest())) as DietLogExportResponse

    expect(result).toEqual({
      status: 'failed',
      error: 'EACCES: permission denied',
    })
  })

  it('returns generic error message for non-Error throws', async () => {
    mockElectron.dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/tmp/export.csv',
    })
    mockWriteFile.mockRejectedValue('string error')

    const result = (await exportHandler(undefined, makeExportRequest())) as DietLogExportResponse

    expect(result).toEqual({
      status: 'failed',
      error: 'Unknown export error',
    })
  })

  // -------------------------------------------------------------------------
  // Failure: dialog throws
  // -------------------------------------------------------------------------

  it('returns failed status when dialog.showSaveDialog throws', async () => {
    mockElectron.dialog.showSaveDialog.mockRejectedValue(
      new Error('Dialog service unavailable'),
    )

    const result = (await exportHandler(undefined, makeExportRequest())) as DietLogExportResponse

    expect(result).toEqual({
      status: 'failed',
      error: 'Dialog service unavailable',
    })
  })

  // -------------------------------------------------------------------------
  // Handler registration
  // -------------------------------------------------------------------------

  it('removes previous handler before registering a new one', async () => {
    // Register twice and verify removeHandler was called
    vi.resetModules()
    vi.doMock('electron', () => mockElectron)
    vi.doMock('node:fs/promises', () => ({
      writeFile: (...args: unknown[]) => mockWriteFile(...(args as [string, string, string])),
    }))

    const dietLogModule = await import('../dietLog')
    dietLogModule.registerDietLogIpcHandlers(() => mockWindow as unknown as import('electron').BrowserWindow)

    // The handler calls removeHandler before handle
    expect(mockElectron.ipcMain.removeHandler).toHaveBeenCalledWith('diet-log:export-file')
  })
})
