import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, Modal, Tag, Typography } from 'antd'
import {
  ClearOutlined,
  BulbOutlined,
  SendOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown, { defaultUrlTransform, type UrlTransform } from 'react-markdown'
import { AGENT_PROVIDER_PRESETS } from '../../../shared/agent'
import { runAgentConversation, type ConversationTurn } from '../agent/controller'
import { describeToolExecution } from '../agent/tools'
import {
  clearChatHistory,
  loadChatHistory,
  saveChatHistory,
  type PersistedChatMessage,
} from '../stores/chatHistory'
import { runPostChatMemoryExtraction } from '../memory/postChatExtraction'
import { getSettings } from '../stores/settings'
import { SETTINGS_UPDATED_EVENT, CHAT_HISTORY_UPDATED_EVENT, type ChatHistoryUpdatedDetail } from '../stores/events'
import './AgentChat.css'

const { Text, Title } = Typography
const { TextArea } = Input

/** 助手气泡 Markdown：在库默认清洗之上，链接/图片仅允许 https? 与页内 #，降低 Electron 环境下的打开风险。 */
const agentMarkdownUrlTransform: UrlTransform = (url, key) => {
  const base = defaultUrlTransform(url)
  if (!base || !base.trim()) {
    return ''
  }
  if (key !== 'href' && key !== 'src') {
    return base
  }
  const t = base.trim()
  if (t.startsWith('#')) {
    return t
  }
  if (/^https?:\/\//i.test(t)) {
    try {
      return new URL(t).href
    } catch {
      return ''
    }
  }
  return ''
}

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
  {
    key: 'estimate-custom-food',
    label: '🥣 估算库外食物',
    type: 'prefill',
    content: '我刚刚吃了一个菜谱库里没有的食物，请帮我估算份量、热量和宏量营养，并记录到今天的饮食里：',
  },
]

const onboardingActions: QuickAction[] = [
  {
    key: 'onboard-log',
    label: '记录今天吃了什么',
    type: 'prefill',
    content: '我今天早餐吃了',
  },
  {
    key: 'onboard-gap',
    label: '检查今日计划偏差',
    type: 'send',
    content: '帮我检查今天的饮食计划有没有偏差，并给出下午或晚餐建议。',
  },
  {
    key: 'onboard-memory',
    label: '让 Agent 记住偏好',
    type: 'prefill',
    content: '请记住我不吃',
  },
  {
    key: 'onboard-knowledge',
    label: '查食物营养',
    type: 'send',
    content: '帮我查一下鸡胸肉和米饭的大致营养，并推荐一个低脂搭配。',
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
      remoteTranscript: message.kind === 'assistant' ? message.remoteTranscript : undefined,
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
  const location = useLocation()
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

  useEffect(() => {
    const handleChatHistory = (event: Event): void => {
      const detail = (event as CustomEvent<ChatHistoryUpdatedDetail>).detail
      if (detail?.appendedCoach) {
        setMessages((current) => [...current, detail.appendedCoach as PersistedChatMessage])
        return
      }
    }

    window.addEventListener(CHAT_HISTORY_UPDATED_EVENT, handleChatHistory)
    return () => {
      window.removeEventListener(CHAT_HISTORY_UPDATED_EVENT, handleChatHistory)
    }
  }, [])

  useEffect(() => {
    const routeState = location.state as { prefill?: string } | null
    if (!routeState?.prefill) {
      return
    }

    setInputValue(routeState.prefill)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

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

      appendMessage({
        ...createMessage('assistant', result.assistantMessage),
        remoteTranscript: result.assistantRemoteTranscript,
      })
      void runPostChatMemoryExtraction({
        userMessage: trimmedInput,
        assistantMessage: result.assistantMessage,
      }).catch((error) => {
        console.error('postChatMemoryExtraction failed', error)
      })
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

  const showOnboarding = messages.every((message) => message.kind !== 'user')

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
        {showOnboarding && (
          <div className="agent-chat-onboarding">
            <div className="agent-chat-onboarding-head">
              <BulbOutlined />
              <div>
                <Text strong>第一次聊天可以从这里开始</Text>
                <Text type="secondary">
                  Agent 会优先调用本地工具，不只是聊天：它能记录饮食、看今日偏差、记住长期偏好，也能查菜谱和营养知识。
                </Text>
              </div>
            </div>

            <div className="agent-chat-onboarding-grid">
              {onboardingActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  className="agent-chat-onboarding-card"
                  onClick={() => handleQuickAction(action)}
                  disabled={isSending}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          if (message.kind === 'tool') {
            return (
              <div key={message.id} className="agent-chat-tool-row">
                <span className="agent-chat-tool-pill">{message.content}</span>
              </div>
            )
          }

          if (message.kind === 'user') {
            return (
              <div key={message.id} className="agent-chat-row is-user">
                <div className="agent-chat-bubble is-user">
                  <Text>{message.content}</Text>
                </div>
              </div>
            )
          }

          return (
            <div key={message.id} className="agent-chat-row is-assistant">
              <div className="agent-chat-bubble-avatar">🐛</div>
              <div
                className={`agent-chat-bubble is-assistant ${message.kind === 'coach' ? 'is-coach' : ''}`}
              >
                <ReactMarkdown
                  className="agent-chat-markdown"
                  urlTransform={agentMarkdownUrlTransform}
                >
                  {message.content}
                </ReactMarkdown>
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
