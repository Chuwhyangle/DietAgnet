import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AgentBridge,
  AgentChatRequest,
  AgentProvider,
  SaveApiKeyRequest,
} from '../shared/agent'

const agentApi: AgentBridge = {
  getApiKeyStatus: (provider: AgentProvider) => ipcRenderer.invoke('agent:get-api-key-status', provider),
  saveApiKey: (request: SaveApiKeyRequest) => ipcRenderer.invoke('agent:save-api-key', request),
  clearApiKey: (provider: AgentProvider) => ipcRenderer.invoke('agent:clear-api-key', provider),
  chatCompletions: (request: AgentChatRequest) => ipcRenderer.invoke('agent:chat-completions', request),
  runDiagnostics: (settings) => ipcRenderer.invoke('agent:run-diagnostics', settings),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('agent', agentApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.agent = agentApi
}
