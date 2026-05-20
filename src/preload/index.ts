import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AgentBridge,
  AgentChatRequest,
  DesktopNotificationRequest,
  AgentProvider,
  SaveApiKeyRequest,
} from '../shared/agent'
import {
  DIET_LOG_CHANNELS,
  type DietLogBridge,
  type DietLogExportRequest,
} from '../shared/dietLog'

const agentApi: AgentBridge = {
  getApiKeyStatus: (provider: AgentProvider) => ipcRenderer.invoke('agent:get-api-key-status', provider),
  saveApiKey: (request: SaveApiKeyRequest) => ipcRenderer.invoke('agent:save-api-key', request),
  clearApiKey: (provider: AgentProvider) => ipcRenderer.invoke('agent:clear-api-key', provider),
  chatCompletions: (request: AgentChatRequest) => ipcRenderer.invoke('agent:chat-completions', request),
  runDiagnostics: (settings) => ipcRenderer.invoke('agent:run-diagnostics', settings),
  getUsageStats: () => ipcRenderer.invoke('agent:get-usage-stats'),
  clearUsageStats: () => ipcRenderer.invoke('agent:clear-usage-stats'),
  showNotification: (request: DesktopNotificationRequest) => ipcRenderer.invoke('agent:show-notification', request),
}

const dietLogApi: DietLogBridge = {
  exportFile: (request: DietLogExportRequest) => ipcRenderer.invoke(DIET_LOG_CHANNELS.exportFile, request),
}

export interface CoachingBridge {
  onReminderTick: (callback: () => void) => () => void
  onNotificationClicked: (callback: (page: string) => void) => () => void
}

const coachingApi: CoachingBridge = {
  onReminderTick: (callback: () => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('coaching:reminder-tick', handler)
    return () => {
      ipcRenderer.removeListener('coaching:reminder-tick', handler)
    }
  },
  onNotificationClicked: (callback: (page: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, page: string): void => callback(page)
    ipcRenderer.on('coaching:notification-clicked', handler)
    return () => {
      ipcRenderer.removeListener('coaching:notification-clicked', handler)
    }
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('agent', agentApi)
    contextBridge.exposeInMainWorld('dietLog', dietLogApi)
    contextBridge.exposeInMainWorld('coaching', coachingApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.agent = agentApi
  // @ts-ignore
  window.dietLog = dietLogApi
  // @ts-ignore
  window.coaching = coachingApi
}
