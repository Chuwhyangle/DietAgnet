import { app, shell, BrowserWindow, Menu, nativeImage, Notification, Tray } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerAgentIpcHandlers } from './agent'
import { registerDietLogIpcHandlers } from './dietLog'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let backgroundTickInterval: ReturnType<typeof setInterval> | null = null

const BACKGROUND_TICK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

/**
 * Send a coaching:reminder-tick IPC to the renderer when the window is
 * hidden or minimized. Called every 30 minutes by the background interval.
 */
function sendBackgroundTick(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  // Only send when the window is not focused (hidden or minimized)
  if (!mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused()) {
    mainWindow.webContents.send('coaching:reminder-tick')
  }
}

function startBackgroundTick(): void {
  if (backgroundTickInterval) {
    return
  }
  backgroundTickInterval = setInterval(sendBackgroundTick, BACKGROUND_TICK_INTERVAL_MS)
}

function stopBackgroundTick(): void {
  if (backgroundTickInterval) {
    clearInterval(backgroundTickInterval)
    backgroundTickInterval = null
  }
}

function createTray(): void {
  if (tray) {
    return
  }

  const iconSvg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#ff8fa3"/>
      <circle cx="11" cy="13" r="3" fill="#fff8f0"/>
      <circle cx="21" cy="13" r="3" fill="#fff8f0"/>
      <path d="M9 21c4 3 10 3 14 0" stroke="#fff8f0" stroke-width="3" stroke-linecap="round" fill="none"/>
    </svg>
  `)

  tray = new Tray(nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${iconSvg}`))
  tray.setToolTip('Diet Agent')
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '打开 Diet Agent',
      click: focusMainWindow,
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ]))
  tray.on('click', focusMainWindow)
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 650,
    show: false,
    title: '猫猫虫的饮食小助手',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      backgroundThrottling: false,
      sandbox: false
    }
  })

  mainWindow = window

  window.on('ready-to-show', () => {
    window.show()
  })

  window.on('close', (event) => {
    if (isQuitting || process.platform === 'darwin' || is.dev) {
      return
    }

    event.preventDefault()
    window.hide()

    if (Notification.isSupported()) {
      new Notification({
        title: 'Diet Agent 已在后台运行',
        body: '提醒和周报会继续检查；从托盘菜单可以重新打开或退出。',
        silent: true,
      }).show()
    }
  })

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', focusMainWindow)
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.caterpillar.diet-agent')
  registerAgentIpcHandlers()
  registerDietLogIpcHandlers(() => mainWindow)
  mainWindow = createWindow()
  createTray()
  startBackgroundTick()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    } else {
      focusMainWindow()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
  stopBackgroundTick()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    return
  }
})
