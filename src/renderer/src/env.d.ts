/// <reference types="vite/client" />

import type { ElectronAPI } from '@electron-toolkit/preload'
import type { AgentBridge } from '../../shared/agent'
import type { DietLogBridge } from '../../shared/dietLog'
import type { CoachingBridge } from '../../preload/index'

declare global {
  interface Window {
    electron: ElectronAPI
    agent: AgentBridge
    dietLog: DietLogBridge
    coaching: CoachingBridge
  }
}

export {}
