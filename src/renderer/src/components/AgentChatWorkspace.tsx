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
import { useI18n } from '../i18n'
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

function createMessage(kind: ChatMessage['kind'], content: string): ChatMessage {
  return {
    id: `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    content,
    timestamp: new Date().toISOString(),
  }
}

function createWelcomeMessage(language: 'en' | 'zh'): ChatMessage {
  const settings = getSettings()
  const nickname = settings.nickname || (language === 'zh' ? '小可爱' : 'friend')
  const provider = AGENT_PROVIDER_PRESETS[settings.agent.provider]

  return createMessage(
    'assistant',
    language === 'zh'
      ? `${nickname}，我现在在正式对话页里待命。你可以让我记录饮食、查菜谱、分析营养，或者直接问我今天该怎么吃。当前模型通道：${provider.name}。`
      : `${nickname}, I am ready in the full chat page. Ask me to log meals, search recipes, analyze nutrition, or plan what to eat today. Current model provider: ${provider.name}.`,
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

function initMessages(language: 'en' | 'zh'): ChatMessage[] {
  const saved = loadChatHistory()
  if (saved.length > 0) {
    return saved
  }

  return [createWelcomeMessage(language)]
}

function AgentChatWorkspace(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { language, t } = useI18n()
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(() => initMessages(language))
  const [isSending, setIsSending] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [apiConfigured, setApiConfigured] = useState(false)
  const [providerLabel, setProviderLabel] = useState(AGENT_PROVIDER_PRESETS.deepseek.name)
  const quickActions: QuickAction[] = [
    {
      key: 'lunch',
      label: language === 'zh' ? '☀️ 记录午餐' : '☀️ Log lunch',
      type: 'prefill',
      content: language === 'zh' ? '我今天午餐吃了' : 'For lunch today I ate ',
    },
    {
      key: 'dinner',
      label: language === 'zh' ? '🌙 记录晚餐' : '🌙 Log dinner',
      type: 'prefill',
      content: language === 'zh' ? '我今天晚餐吃了' : 'For dinner today I ate ',
    },
    {
      key: 'recommend',
      label: language === 'zh' ? '🍳 推荐菜谱' : '🍳 Recommend recipe',
      type: 'send',
      content: language === 'zh' ? '帮我推荐一道适合今天吃的菜谱吧' : 'Recommend a recipe that fits today.',
    },
    {
      key: 'stats',
      label: language === 'zh' ? '📊 今日统计' : '📊 Today’s stats',
      type: 'send',
      content: language === 'zh' ? '我今天吃了多少卡路里？' : 'How many calories have I eaten today?',
    },
    {
      key: 'estimate-custom-food',
      label: language === 'zh' ? '🥣 估算库外食物' : '🥣 Estimate custom food',
      type: 'prefill',
      content: language === 'zh'
        ? '我刚刚吃了一个菜谱库里没有的食物，请帮我估算份量、热量和宏量营养，并记录到今天的饮食里：'
        : 'I just ate something that is not in the recipe library. Please estimate the portion, calories, macros, and log it for today: ',
    },
  ]
  const onboardingActions: QuickAction[] = [
    {
      key: 'onboard-log',
      label: language === 'zh' ? '记录今天吃了什么' : 'Log what I ate',
      type: 'prefill',
      content: language === 'zh' ? '我今天早餐吃了' : 'For breakfast today I ate ',
    },
    {
      key: 'onboard-gap',
      label: language === 'zh' ? '检查今日计划偏差' : 'Check today’s plan gap',
      type: 'send',
      content: language === 'zh'
        ? '帮我检查今天的饮食计划有没有偏差，并给出下午或晚餐建议。'
        : 'Check whether today’s diet plan is off track and suggest what to do for the next meal.',
    },
    {
      key: 'onboard-memory',
      label: language === 'zh' ? '让 Agent 记住偏好' : 'Save a preference',
      type: 'prefill',
      content: language === 'zh' ? '请记住我不吃' : 'Please remember that I do not eat ',
    },
    {
      key: 'onboard-knowledge',
      label: language === 'zh' ? '查食物营养' : 'Look up nutrition',
      type: 'send',
      content: language === 'zh'
        ? '帮我查一下鸡胸肉和米饭的大致营养，并推荐一个低脂搭配。'
        : 'Look up the approximate nutrition for chicken breast and rice, then recommend a low-fat pairing.',
    },
  ]

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
      title: language === 'zh' ? '清空对话记录' : 'Clear chat history',
      content: language === 'zh' ? '确定要清空所有对话历史吗？清空后无法恢复哦~' : 'Clear all chat history? This cannot be undone.',
      okText: t('common.clear'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => {
        clearChatHistory()
        setMessages([createWelcomeMessage(language)])
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
        throw new Error(language === 'zh' ? '还没有配置当前模型通道的 API Key，先去设置页填一下吧。' : 'The current model provider has no API key yet. Please add one in Settings.')
      }

      if (!settings.agent.apiBaseUrl.trim() || !settings.agent.model.trim()) {
        throw new Error(language === 'zh' ? '模型或 Base URL 还没填好，先去设置页补一下配置。' : 'The model or Base URL is missing. Please finish the provider setup in Settings.')
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
      const errorMessage = error instanceof Error ? error.message : (language === 'zh' ? '发生了一个未知错误。' : 'An unknown error occurred.')
      appendMessage(createMessage('assistant', language === 'zh' ? `喵呜，刚刚没处理成功：${errorMessage}` : `Sorry, I could not complete that: ${errorMessage}`))
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
              {t('agent.workspaceTitle')}
            </Title>
            <Text type="secondary">
              {providerLabel}
              {' · '}
              {statusLoading ? t('agent.statusChecking') : apiConfigured ? t('agent.statusReady') : t('agent.statusMissing')}
            </Text>
          </div>
        </div>
        <div className="agent-chat-header-actions">
          <Tag color={apiConfigured ? 'success' : 'warning'} bordered={false}>
            {apiConfigured ? t('agent.canChat') : t('agent.needsSetup')}
          </Tag>
          <Button
            type="text"
            icon={<ClearOutlined />}
            onClick={handleClearHistory}
            disabled={isSending || messages.length <= 1}
            title={t('agent.clearHistory')}
          >
            {t('common.clear')}
          </Button>
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={() => navigate('/settings')}
          >
            {t('agent.goSettings')}
          </Button>
        </div>
      </div>

      <div className="agent-chat-body">
        {showOnboarding && (
          <div className="agent-chat-onboarding">
            <div className="agent-chat-onboarding-head">
              <BulbOutlined />
              <div>
                <Text strong>{language === 'zh' ? '第一次聊天可以从这里开始' : 'Start your first chat here'}</Text>
                <Text type="secondary">
                  {language === 'zh'
                    ? 'Agent 会优先调用本地工具，不只是聊天：它能记录饮食、看今日偏差、记住长期偏好，也能查菜谱和营养知识。'
                    : 'Diet Agent can use local tools, not just chat: it can log meals, check today’s plan gap, remember long-term preferences, and search recipes or nutrition knowledge.'}
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
          placeholder={t('agent.placeholder')}
          className="agent-chat-input"
          disabled={isSending}
        />

        <div className="agent-chat-footer-actions">
          <Text type="secondary">{t('agent.shiftEnter')}</Text>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => void handleSubmit(inputValue)}
            loading={isSending}
            disabled={!inputValue.trim()}
            className="agent-chat-send"
          >
            {t('agent.send')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AgentChatWorkspace
