/// <reference types="vite/client" />

import type { ElectronAPI } from '@electron-toolkit/preload'
import type { AgentBridge } from '../../shared/agent'

declare global {
  interface Window {
    electron: ElectronAPI
    agent: AgentBridge
  }
}

export {}
