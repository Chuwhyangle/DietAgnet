import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Modal, Tag, Typography } from 'antd'
import {
  ClearOutlined,
  RobotOutlined,
  SendOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { AGENT_PROVIDER_PRESETS } from '../../../shared/agent'
import { runAgentConversation, type ConversationTurn } from '../agent/controller'
import { describeToolExecution } from '../agent/tools'
import {
  clearChatHistory,
  loadChatHistory,
  saveChatHistory,
  type PersistedChatMessage,
} from '../stores/chatHistory'
import { SETTINGS_UPDATED_EVENT } from '../stores/events'
import { getSettings } from '../stores/settings'
import './AgentChat.css'

const { Text, Title } = Typography
const { TextArea } = Input

type ChatMessage = PersistedChatMessage

interface QuickAction {
  key: string
  label: string
  type: 'prefill' | 'send'
  content: string
}

const quickActions: QuickAction[] = [
  {
    key: 'lunch',
    label: '☀️ 记录午餐',
    type: 'prefill',
    content: '我今天午餐吃了',
  },
  {
    key: 'dinner',
    label: '🌙 记录晚餐',
    type: 'prefill',
    content: '我今天晚餐吃了',
  },
  {
    key: 'recommend',
    label: '🍳 推荐菜谱',
    type: 'send',
    content: '帮我推荐一道适合今天吃的菜谱吧',
  },
  {
    key: 'stats',
    label: '📊 今日统计',
    type: 'send',
    content: '我今天吃了多少卡路里？',
  },
]

function createMessage(kind: ChatMessage['kind'], content: string): ChatMessage {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    content,
    timestamp: new Date().toISOString(),
  }
}

function createWelcomeMessage(): ChatMessage {
  const settings = getSettings()
  const nickname = settings.nickname || '小可爱'
  const provider = AGENT_PROVIDER_PRESETS[settings.agent.provider]

  return createMessage(
    'assistant',
    `${nickname}，我现在在正式对话页里待命。你可以让我记录饮食、查菜谱、分析营养，或者直接问我今天该怎么吃。当前模型通道：${provider.name}。`,
  )
}

function toConversationHistory(messages: ChatMessage[]): ConversationTurn[] {
  return messages
    .filter((message) => message.kind === 'assistant' || message.kind === 'user')
    .map((message) => ({
      role: message.kind,
      content: message.content,
    }))
}

function initMessages(): ChatMessage[] {
  const saved = loadChatHistory()
  if (saved.length > 0) {
    return saved
  }

  return [createWelcomeMessage()]
}

function AgentChatWorkspace(): JSX.Element {
  const navigate = useNavigate()
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(initMessages)
  const [isSending, setIsSending] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [apiConfigured, setApiConfigured] = useState(false)
  const [providerLabel, setProviderLabel] = useState(AGENT_PROVIDER_PRESETS.deepseek.name)

  // 每次消息变更时持久化到 localStorage
  const isInitialRender = useRef(true)
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }

    saveChatHistory(messages)
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

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

  const appendMessage = useCallback((message: ChatMessage): void => {
    setMessages((currentMessages) => [...currentMessages, message])
  }, [])

  const handleClearHistory = (): void => {
    Modal.confirm({
      title: '清空对话记录',
      content: '确定要清空所有对话历史吗？清空后无法恢复哦~',
      okText: '清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        clearChatHistory()
        setMessages([createWelcomeMessage()])
      },
    })
  }

  const handleSubmit = async (rawInput: string): Promise<void> => {
    const trimmedInput = rawInput.trim()
    if (!trimmedInput || isSending) {
      return
    }

    const settings = getSettings()
    const conversationHistory = toConversationHistory(messages)

    appendMessage(createMessage('user', trimmedInput))
    setInputValue('')
    setIsSending(true)

    try {
      const apiStatus = await window.agent.getApiKeyStatus(settings.agent.provider)
      if (!apiStatus.configured) {
        throw new Error('还没有配置当前模型通道的 API Key，先去设置页填一下吧。')
      }

      if (!settings.agent.apiBaseUrl.trim() || !settings.agent.model.trim()) {
        throw new Error('模型或 Base URL 还没填好，先去设置页补一下配置。')
      }

      const result = await runAgentConversation({
        history: conversationHistory,
        userInput: trimmedInput,
        navigate,
        onToolFinished: ({ toolCall, result: toolResult }) => {
          appendMessage(createMessage('tool', describeToolExecution(toolCall, toolResult)))
        },
      })

      appendMessage(createMessage('assistant', result.assistantMessage))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '发生了一个未知错误。'
      appendMessage(createMessage('assistant', `喵呜，刚刚没处理成功：${errorMessage}`))
    } finally {
      setIsSending(false)
      setStatusLoading(false)
      try {
        const status = await window.agent.getApiKeyStatus(settings.agent.provider)
        setApiConfigured(status.configured)
      } catch (error) {
        console.error('Failed to refresh agent status:', error)
      }
    }
  }

  const handleQuickAction = (action: QuickAction): void => {
    if (action.type === 'prefill') {
      setInputValue(action.content)
      return
    }

    void handleSubmit(action.content)
  }

  return (
    <div className="agent-chat-workspace">
      <div className="agent-chat-header">
        <div className="agent-chat-title">
          <div className="agent-chat-avatar">🐛</div>
          <div>
            <Title level={5} style={{ margin: 0 }}>
              猫猫虫 AI 对话
            </Title>
            <Text type="secondary">
              {providerLabel}
              {' · '}
              {statusLoading ? '检查中' : apiConfigured ? '已连接' : '未配置'}
            </Text>
          </div>
        </div>
        <div className="agent-chat-header-actions">
          <Tag color={apiConfigured ? 'success' : 'warning'} bordered={false}>
            {apiConfigured ? '可对话' : '需配置'}
          </Tag>
          <Button
            type="text"
            icon={<ClearOutlined />}
            onClick={handleClearHistory}
            disabled={isSending || messages.length <= 1}
            title="清空对话记录"
          >
            清空
          </Button>
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => navigate('/settings')}
          >
            去设置
          </Button>
        </div>
      </div>

      <div className="agent-chat-body">
        {messages.map((message) => {
          if (message.kind === 'tool') {
            return (
              <div key={message.id} className="agent-chat-tool-row">
                <span className="agent-chat-tool-pill">{message.content}</span>
              </div>
            )
          }

          return (
            <div
              key={message.id}
              className={`agent-chat-row ${message.kind === 'user' ? 'is-user' : 'is-assistant'}`}
            >
              {message.kind === 'assistant' && <div className="agent-chat-bubble-avatar">🐛</div>}
              <div className={`agent-chat-bubble ${message.kind === 'user' ? 'is-user' : 'is-assistant'}`}>
                <Text>{message.content}</Text>
              </div>
            </div>
          )
        })}

        {isSending && (
          <div className="agent-chat-row is-assistant">
            <div className="agent-chat-bubble-avatar">🐛</div>
            <div className="agent-chat-bubble is-assistant is-typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="agent-chat-footer">
        <div className="agent-chat-quick-actions">
          {quickActions.map((action) => (
            <button
              key={action.key}
              type="button"
              className="agent-chat-quick-button"
              onClick={() => handleQuickAction(action)}
              disabled={isSending}
            >
              {action.label}
            </button>
          ))}
        </div>

        <TextArea
          autoSize={{ minRows: 2, maxRows: 5 }}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault()
              void handleSubmit(inputValue)
            }
          }}
          placeholder="比如：我今天午餐吃了番茄炒蛋，或者 帮我推荐一道低卡晚餐"
          className="agent-chat-input"
          disabled={isSending}
        />

        <div className="agent-chat-footer-actions">
          <Text type="secondary">Shift + Enter 换行</Text>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => void handleSubmit(inputValue)}
            loading={isSending}
            disabled={!inputValue.trim()}
            className="agent-chat-send"
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AgentChatWorkspace
