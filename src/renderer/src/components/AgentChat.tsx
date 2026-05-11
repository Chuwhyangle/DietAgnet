import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Button, Tag } from 'antd'
import { MessageOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { AGENT_PROVIDER_PRESETS } from '../../../shared/agent'
import { SETTINGS_UPDATED_EVENT } from '../stores/events'
import { getSettings } from '../stores/settings'
import './AgentChat.css'

interface AgentChatProps {
  hidden?: boolean
}

interface LauncherPosition {
  x: number
  y: number
}

const STORAGE_KEY = 'diet-agent-chat-launcher-position'
const BUTTON_WIDTH = 128
const BUTTON_HEIGHT = 96
const EDGE_PADDING = 16

function getDefaultLauncherPosition(): LauncherPosition {
  if (typeof window === 'undefined') {
    return { x: EDGE_PADDING, y: EDGE_PADDING }
  }

  return {
    x: Math.max(EDGE_PADDING, window.innerWidth - BUTTON_WIDTH - 32),
    y: Math.max(EDGE_PADDING, window.innerHeight - BUTTON_HEIGHT - 28),
  }
}

function clampLauncherPosition(position: LauncherPosition): LauncherPosition {
  if (typeof window === 'undefined') {
    return position
  }

  const maxX = Math.max(EDGE_PADDING, window.innerWidth - BUTTON_WIDTH - EDGE_PADDING)
  const maxY = Math.max(EDGE_PADDING, window.innerHeight - BUTTON_HEIGHT - EDGE_PADDING)

  return {
    x: Math.min(Math.max(position.x, EDGE_PADDING), maxX),
    y: Math.min(Math.max(position.y, EDGE_PADDING), maxY),
  }
}

function readLauncherPosition(): LauncherPosition {
  if (typeof window === 'undefined') {
    return getDefaultLauncherPosition()
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return getDefaultLauncherPosition()
    }

    const parsed = JSON.parse(raw) as Partial<LauncherPosition>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
      return getDefaultLauncherPosition()
    }

    return clampLauncherPosition({
      x: parsed.x,
      y: parsed.y,
    })
  } catch (error) {
    console.error('Failed to read chat launcher position:', error)
    return getDefaultLauncherPosition()
  }
}

function saveLauncherPosition(position: LauncherPosition): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
}

function AgentChat({ hidden = false }: AgentChatProps): JSX.Element {
  const navigate = useNavigate()
  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const [position, setPosition] = useState<LauncherPosition>(() => readLauncherPosition())
  const [isDragging, setIsDragging] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [apiConfigured, setApiConfigured] = useState(false)
  const [providerLabel, setProviderLabel] = useState(AGENT_PROVIDER_PRESETS.deepseek.name)

  useEffect(() => {
    const refreshStatus = async (): Promise<void> => {
      const settings = getSettings()
      const provider = AGENT_PROVIDER_PRESETS[settings.agent.provider]
      setProviderLabel(provider.name)

      try {
        const status = await window.agent.getApiKeyStatus(settings.agent.provider)
        setApiConfigured(status.configured)
      } catch (error) {
        console.error('Failed to load agent status:', error)
        setApiConfigured(false)
      } finally {
        setStatusLoading(false)
      }
    }

    void refreshStatus()

    const handleSettingsUpdated = (): void => {
      setStatusLoading(true)
      void refreshStatus()
    }

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdated)
    }
  }, [])

  useEffect(() => {
    const handleResize = (): void => {
      setPosition((currentPosition) => {
        const clamped = clampLauncherPosition(currentPosition)
        saveLauncherPosition(clamped)
        return clamped
      })
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return
      }

      const deltaX = event.clientX - dragState.startX
      const deltaY = event.clientY - dragState.startY
      const movedDistance = Math.abs(deltaX) + Math.abs(deltaY)

      if (movedDistance > 4 && !dragState.moved) {
        dragState.moved = true
      }

      const nextPosition = clampLauncherPosition({
        x: dragState.originX + deltaX,
        y: dragState.originY + deltaY,
      })

      setPosition(nextPosition)
    }

    const handlePointerUp = (event: PointerEvent): void => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return
      }

      const finalPosition = clampLauncherPosition(position)
      saveLauncherPosition(finalPosition)
      dragStateRef.current = null
      setIsDragging(false)

      if (dragState.moved) {
        suppressClickRef.current = true
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [position])

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    }
    setIsDragging(true)
  }

  const handleOpenChat = (): void => {
    if (suppressClickRef.current) {
      return
    }

    navigate('/chat')
  }

  if (hidden) {
    return <></>
  }

  return (
    <div
      className={`agent-chat-launcher-root ${isDragging ? 'is-dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
    >
      <Button
        type="primary"
        size="large"
        icon={<MessageOutlined />}
        className="agent-chat-launcher-button"
        onPointerDown={handlePointerDown}
        onClick={handleOpenChat}
        title="拖动可移动，点击进入正式 AI 对话页"
      >
        AI 对话
      </Button>

      <div className="agent-chat-launcher-meta">
        <Tag color={apiConfigured ? 'success' : 'warning'} bordered={false}>
          {statusLoading ? '检查中' : apiConfigured ? providerLabel : '待配置'}
        </Tag>
        <Button
          type="text"
          icon={<SettingOutlined />}
          className="agent-chat-launcher-settings"
          onClick={() => navigate('/settings')}
          title="打开设置页"
        />
      </div>
    </div>
  )
}

export default AgentChat
