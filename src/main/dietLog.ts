import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import {
  DIET_LOG_CHANNELS,
  type DietLogExportRequest,
  type DietLogExportResponse,
} from '../shared/dietLog'

async function exportDietLogFile(
  window: BrowserWindow,
  request: DietLogExportRequest,
): Promise<DietLogExportResponse> {
  try {
    const result = await dialog.showSaveDialog(window, {
      defaultPath: request.defaultFileName,
      filters: request.filters,
    })

    if (result.canceled || !result.filePath) {
      return {
        status: 'cancelled',
      }
    }

    await writeFile(result.filePath, request.content, 'utf8')

    return {
      status: 'saved',
      filePath: result.filePath,
    }
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown export error',
    }
  }
}

export function registerDietLogIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.removeHandler(DIET_LOG_CHANNELS.exportFile)

  ipcMain.handle(
    DIET_LOG_CHANNELS.exportFile,
    async (_event, request: DietLogExportRequest): Promise<DietLogExportResponse> => {
      const window = getMainWindow()
      if (!window || window.isDestroyed()) {
        return {
          status: 'failed',
          error: 'Main window is not available',
        }
      }

      return exportDietLogFile(window, request)
    },
  )
}
