import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Descriptions,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Select,
  Slider,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  AuditOutlined,
  DeleteOutlined,
  BulbOutlined,
  LinkOutlined,
  NotificationOutlined,
  PieChartOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import {
  AGENT_PROVIDER_PRESETS,
  type AgentDiagnosticResult,
  type AgentDiagnosticsResponse,
  type AgentProvider,
  type AgentToolCompatibilityMode,
  type AgentUsageStatsResponse,
} from '../../../shared/agent'
import {
  MEMORY_UPDATED_EVENT,
  RECIPE_CALIBRATION_UPDATED_EVENT,
  SETTINGS_UPDATED_EVENT,
  emitSettingsUpdated,
} from '../stores/events'
import {
  forget,
  listUserFacts,
  updateMemoryConfidence,
  confirmPendingMemory,
  dismissPendingMemory,
} from '../memory/manager'
import {
  countRecipesWithActiveApprovedCalibration,
  getRecipeCalibrationSummary,
  type RecipeCalibrationSummary,
} from '../stores/recipeCalibration'
import { getCoachingSettings, saveCoachingSettings } from '../coaching/trustDial'
import type { CoachingSettings, TrustMode } from '../coaching/types'
import type { UserMemory, UserMemoryType } from '../stores/planning'
import { getUserMemories } from '../stores/planning'
import { getSettings, saveSettings, type Settings } from '../stores/settings'
import './Settings.css'

const { Title, Text, Paragraph } = Typography

function getMemoryTypeLabel(type: UserMemoryType): string {
  switch (type) {
    case 'preference':
      return '偏好'
    case 'allergy':
      return '过敏'
    case 'avoidance':
      return '忌口'
    case 'habit':
      return '习惯'
    case 'schedule':
      return '作息'
    case 'health_note':
      return '健康'
    case 'goal':
      return '目标'
    default:
      return '其他'
  }
}

function getMemoryTypeColor(type: UserMemoryType): string {
  switch (type) {
    case 'allergy':
      return 'red'
    case 'avoidance':
      return 'orange'
    case 'preference':
      return 'pink'
    case 'habit':
      return 'blue'
    case 'schedule':
      return 'cyan'
    case 'health_note':
      return 'purple'
    case 'goal':
      return 'green'
    default:
      return 'default'
  }
}

function getDiagnosticAlertType(result: AgentDiagnosticResult): 'success' | 'error' | 'warning' | 'info' {
  switch (result.status) {
    case 'success':
      return 'success'
    case 'failed':
      return 'error'
    case 'warning':
      return 'warning'
    default:
      return 'info'
  }
}

function renderDiagnosticDescription(result: AgentDiagnosticResult): JSX.Element {
  return (
    <div className="diagnostic-alert-description">
      <Paragraph style={{ marginBottom: 8 }}>
        {result.message}
      </Paragraph>
      {result.finishReason && (
        <Text type="secondary" className="diagnostic-meta-line">
          finish_reason: {result.finishReason}
        </Text>
      )}
      {typeof result.toolCallsCount === 'number' && (
        <Text type="secondary" className="diagnostic-meta-line">
          tool_calls 数量: {result.toolCallsCount}
        </Text>
      )}
      {result.toolRequestMode && (
        <Text type="secondary" className="diagnostic-meta-line">
          工具协议模式: {result.toolRequestMode}
        </Text>
      )}
      {result.error?.code && (
        <Text type="secondary" className="diagnostic-meta-line">
          错误分类: {result.error.code}
        </Text>
      )}
      {result.preview && (
        <div className="diagnostic-preview">
          <Text strong>返回预览</Text>
          <pre>{result.preview}</pre>
        </div>
      )}
    </div>
  )
}

function formatUsageNumber(value: number): string {
  return value.toLocaleString('en-US')
}

function estimateUsageCost(stats: AgentUsageStatsResponse, settings: Settings): number | null {
  const promptPrice = settings.usagePricing.promptUsdPerMillionTokens
  const completionPrice = settings.usagePricing.completionUsdPerMillionTokens

  if (typeof promptPrice !== 'number' || typeof completionPrice !== 'number') {
    return null
  }

  return (stats.promptTokens / 1_000_000) * promptPrice +
    (stats.completionTokens / 1_000_000) * completionPrice
}

const TOOL_COMPATIBILITY_OPTIONS: Array<{ value: AgentToolCompatibilityMode; label: string }> = [
  { value: 'auto', label: '自动协商（推荐）' },
  { value: 'openai_tools', label: 'OpenAI tools + tool_choice' },
  { value: 'openai_tools_no_choice', label: 'OpenAI tools（不带 tool_choice）' },
  { value: 'legacy_functions', label: '旧版 functions / function_call' },
  { value: 'plain_chat', label: '纯聊天（禁用工具）' },
]

function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<Settings>(getSettings())
  const [saved, setSaved] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [checkingApiKey, setCheckingApiKey] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [diagnostics, setDiagnostics] = useState<AgentDiagnosticsResponse | null>(null)
  const [calibrationSummary, setCalibrationSummary] = useState<RecipeCalibrationSummary>(
    getRecipeCalibrationSummary(),
  )
  const [activeCalibrationRecipes, setActiveCalibrationRecipes] = useState(
    () => countRecipesWithActiveApprovedCalibration(),
  )
  const [memories, setMemories] = useState<UserMemory[]>([])
  const [pendingMemories, setPendingMemories] = useState<UserMemory[]>([])
  const [usageStats, setUsageStats] = useState<AgentUsageStatsResponse | null>(null)
  const [loadingUsageStats, setLoadingUsageStats] = useState(false)
  const [coachingSettings, setCoachingSettings] = useState<CoachingSettings>(getCoachingSettings())

  useEffect(() => {
    setSettings(getSettings())
  }, [])

  useEffect(() => {
    const syncSettings = (): void => {
      setSettings(getSettings())
    }

    window.addEventListener(SETTINGS_UPDATED_EVENT, syncSettings)
    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, syncSettings)
    }
  }, [])

  useEffect(() => {
    const syncCalibrationSummary = (): void => {
      setCalibrationSummary(getRecipeCalibrationSummary())
      setActiveCalibrationRecipes(countRecipesWithActiveApprovedCalibration())
    }

    window.addEventListener(RECIPE_CALIBRATION_UPDATED_EVENT, syncCalibrationSummary)
    return () => {
      window.removeEventListener(RECIPE_CALIBRATION_UPDATED_EVENT, syncCalibrationSummary)
    }
  }, [])

  useEffect(() => {
    const refreshMemories = (): void => {
      void listUserFacts({ limit: 100 }).then(setMemories)
      void getUserMemories({ status: 'pending_confirm', limit: 50 }).then(setPendingMemories)
    }

    refreshMemories()
    window.addEventListener(MEMORY_UPDATED_EVENT, refreshMemories)
    return () => {
      window.removeEventListener(MEMORY_UPDATED_EVENT, refreshMemories)
    }
  }, [])

  useEffect(() => {
    const refreshApiKeyStatus = async (): Promise<void> => {
      setCheckingApiKey(true)

      try {
        const status = await window.agent.getApiKeyStatus(settings.agent.provider)
        setApiKeyConfigured(status.configured)
      } catch (error) {
        console.error('Failed to load API key status:', error)
        setApiKeyConfigured(false)
      } finally {
        setCheckingApiKey(false)
      }
    }

    void refreshApiKeyStatus()
  }, [settings.agent.provider])

  const refreshUsageStats = async (): Promise<void> => {
    setLoadingUsageStats(true)

    try {
      setUsageStats(await window.agent.getUsageStats())
    } catch (error) {
      console.error('Failed to load agent usage stats:', error)
    } finally {
      setLoadingUsageStats(false)
    }
  }

  useEffect(() => {
    void refreshUsageStats()
  }, [])

  useEffect(() => {
    setDiagnostics(null)
  }, [settings.agent.provider, settings.agent.apiBaseUrl, settings.agent.model, apiKeyInput])

  const handleProviderChange = (provider: AgentProvider) => {
    const preset = AGENT_PROVIDER_PRESETS[provider]
    setApiKeyInput('')
    setSettings((currentSettings) => ({
      ...currentSettings,
      agent: provider === 'custom'
        ? {
          provider,
          apiBaseUrl: '',
          model: '',
        }
        : {
          provider,
          apiBaseUrl: preset.defaultBaseUrl,
          model: preset.defaultModel,
        },
    }))
  }

  const persistCurrentSettings = async (showSuccessMessage: boolean): Promise<void> => {
    saveSettings(settings)

    if (apiKeyInput.trim()) {
      const status = await window.agent.saveApiKey({
        provider: settings.agent.provider,
        apiKey: apiKeyInput.trim(),
      })
      setApiKeyConfigured(status.configured)
      setApiKeyInput('')
    }

    if (showSuccessMessage) {
      setSaved(true)
      message.success('设置保存成功，猫猫虫已经记住啦~ 🐛💾')
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleSave = async () => {
    setSavingConfig(true)

    try {
      await persistCurrentSettings(true)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '保存失败'
      message.error(errorMessage)
    } finally {
      setSavingConfig(false)
    }
  }

  const handleRunDiagnostics = async () => {
    setTestingConnection(true)

    try {
      await persistCurrentSettings(false)
      const result = await window.agent.runDiagnostics(settings.agent)
      setDiagnostics(result)
      setApiKeyConfigured(result.apiKeyConfigured)
      await refreshUsageStats()
      message.success('连接测试完成，结果已更新到下方诊断区。')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '连接测试失败'
      message.error(errorMessage)
    } finally {
      setTestingConnection(false)
    }
  }

  const handleClearApiKey = async () => {
    try {
      await window.agent.clearApiKey(settings.agent.provider)
      setApiKeyConfigured(false)
      setApiKeyInput('')
      setDiagnostics(null)
      emitSettingsUpdated()
      message.success('当前通道的 API Key 已清除。')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '清除失败'
      message.error(errorMessage)
    }
  }

  const handleForgetMemory = async (memoryId: number): Promise<void> => {
    try {
      await forget(memoryId, '用户在设置页删除')
      setMemories(await listUserFacts({ limit: 100 }))
      setPendingMemories(await getUserMemories({ status: 'pending_confirm', limit: 50 }))
      message.success('这条记忆已删除。')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '删除失败'
      message.error(errorMessage)
    }
  }

  const handleClearUsageStats = async (): Promise<void> => {
    try {
      setUsageStats(await window.agent.clearUsageStats())
      message.success('AI 调用统计已清空。')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '清空失败'
      message.error(errorMessage)
    }
  }

  const handleMemoryConfidenceChange = async (memoryId: number, confidence: number): Promise<void> => {
    try {
      await updateMemoryConfidence(memoryId, confidence / 100)
      setMemories(await listUserFacts({ limit: 100 }))
      setPendingMemories(await getUserMemories({ status: 'pending_confirm', limit: 50 }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '更新失败'
      message.error(errorMessage)
    }
  }

  const handleConfirmPendingMemory = async (memoryId: number): Promise<void> => {
    try {
      await confirmPendingMemory(memoryId)
      setMemories(await listUserFacts({ limit: 100 }))
      setPendingMemories(await getUserMemories({ status: 'pending_confirm', limit: 50 }))
      message.success('已加入长期记忆。')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '确认失败'
      message.error(errorMessage)
    }
  }

  const handleDismissPendingMemory = async (memoryId: number): Promise<void> => {
    try {
      await dismissPendingMemory(memoryId)
      setPendingMemories(await getUserMemories({ status: 'pending_confirm', limit: 50 }))
      message.success('已丢弃该条待确认提炼。')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '操作失败'
      message.error(errorMessage)
    }
  }

  const diagnosticsProviderName = diagnostics?.providerName ?? AGENT_PROVIDER_PRESETS[settings.agent.provider].name
  const diagnosticsEndpoint = diagnostics?.endpoint || settings.agent.apiBaseUrl || '未填写'
  const diagnosticsResolvedEndpoint = diagnostics?.resolvedEndpoint || (
    settings.agent.apiBaseUrl
      ? settings.agent.apiBaseUrl.replace(/\/+$/, '').match(/\/chat\/completions$/i)
        ? settings.agent.apiBaseUrl.replace(/\/+$/, '')
        : `${settings.agent.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`
      : '未填写'
  )
  const diagnosticsModel = diagnostics?.model || settings.agent.model || '未填写'

  const estimatedCost = usageStats ? estimateUsageCost(usageStats, settings) : null

  return (
    <div className="settings-page">
      <Title level={3}>⚙️ 设置</Title>
      <Text type="secondary">让猫猫虫更了解你~</Text>

      <Card className="settings-card" style={{ marginTop: 24 }}>
        <div className="settings-section">
          <Title level={5}>🐱 昵称</Title>
          <Text type="secondary">猫猫虫怎么称呼你呢？</Text>
          <Input
            placeholder="输入你的昵称..."
            value={settings.nickname}
            onChange={(event) => setSettings({ ...settings, nickname: event.target.value })}
            maxLength={20}
            style={{ marginTop: 8, maxWidth: 300 }}
          />
        </div>

        <div className="settings-section">
          <Title level={5}>🎯 每日卡路里目标</Title>
          <Text type="secondary">设定每天的卡路里摄入目标（可选）</Text>
          <InputNumber
            placeholder="例如 2000"
            value={settings.calorieGoal}
            min={0}
            onChange={(value) => setSettings({ ...settings, calorieGoal: value ?? undefined })}
            addonAfter="kcal"
            style={{ marginTop: 8, maxWidth: 200 }}
          />
        </div>

        <div className="settings-section reminder-settings-section">
          <div className="settings-section-head">
            <div>
              <Title level={5}>🔔 主动提醒设置</Title>
              <Text type="secondary">让猫猫虫在合适的时候轻轻提醒，不打扰你专注。</Text>
            </div>
            <Tag
              icon={<NotificationOutlined />}
              color={settings.reminders.enabled ? 'success' : 'default'}
              bordered={false}
            >
              {settings.reminders.enabled ? '已开启' : '已关闭'}
            </Tag>
          </div>

          <div className="reminder-settings-list">
            <div className="reminder-setting-row">
              <div>
                <Text strong>主动提醒总开关</Text>
                <Text type="secondary">关闭后不会弹出早餐/午餐/晚餐等主动提醒。</Text>
              </div>
              <Switch
                checked={settings.reminders.enabled}
                onChange={(enabled) => setSettings({
                  ...settings,
                  reminders: {
                    ...settings.reminders,
                    enabled,
                  },
                })}
              />
            </div>

            <div className="reminder-setting-row">
              <div>
                <Text strong>餐次未记录提醒</Text>
                <Text type="secondary">早餐、午餐或晚餐过了时间还没记录时提醒。</Text>
              </div>
              <Switch
                checked={settings.reminders.mealReminders}
                disabled={!settings.reminders.enabled}
                onChange={(mealReminders) => setSettings({
                  ...settings,
                  reminders: {
                    ...settings.reminders,
                    mealReminders,
                  },
                })}
              />
            </div>

            <div className="reminder-setting-row">
              <div>
                <Text strong>动态计划建议提醒</Text>
                <Text type="secondary">记录后发现当天计划偏差时展示补餐/减餐建议。</Text>
              </div>
              <Switch
                checked={settings.reminders.planAdjustmentReminders}
                disabled={!settings.reminders.enabled}
                onChange={(planAdjustmentReminders) => setSettings({
                  ...settings,
                  reminders: {
                    ...settings.reminders,
                    planAdjustmentReminders,
                  },
                })}
              />
            </div>

            <div className="reminder-setting-row">
              <div>
                <Text strong>每周报告提醒</Text>
                <Text type="secondary">周日晚上提醒查看本周饮食复盘。</Text>
              </div>
              <Switch
                checked={settings.reminders.weeklyReportReminders}
                disabled={!settings.reminders.enabled}
                onChange={(weeklyReportReminders) => setSettings({
                  ...settings,
                  reminders: {
                    ...settings.reminders,
                    weeklyReportReminders,
                  },
                })}
              />
            </div>

            <div className="reminder-setting-row">
              <div>
                <Text strong>记录后推送偏差摘要到 AI 对话</Text>
                <Text type="secondary">
                  保存饮食记录后，用与计划页相同口径生成一句快照（可选展开建议）；不调用大模型。
                </Text>
              </div>
              <Switch
                checked={settings.reminders.postLogGapSummaryInChat !== false}
                onChange={(postLogGapSummaryInChat) => setSettings({
                  ...settings,
                  reminders: {
                    ...settings.reminders,
                    postLogGapSummaryInChat,
                  },
                })}
              />
            </div>

            <div className="reminder-setting-row">
              <div>
                <Text strong>记录后桌面通知（一句）</Text>
                <Text type="secondary">
                  需开启主动提醒总开关，并遵守静音时段；内容与对话快照一致。
                </Text>
              </div>
              <Switch
                checked={settings.reminders.postLogGapDesktopNotify === true}
                disabled={!settings.reminders.enabled}
                onChange={(postLogGapDesktopNotify) => setSettings({
                  ...settings,
                  reminders: {
                    ...settings.reminders,
                    postLogGapDesktopNotify,
                  },
                })}
              />
            </div>

            <div className="reminder-setting-grid">
              <div className="agent-field">
                <Text>静音开始</Text>
                <InputNumber
                  min={0}
                  max={23}
                  value={settings.reminders.quietStartHour}
                  addonAfter="点"
                  onChange={(value) => setSettings({
                    ...settings,
                    reminders: {
                      ...settings.reminders,
                      quietStartHour: value ?? 23,
                    },
                  })}
                  style={{ marginTop: 8, width: '100%' }}
                />
              </div>
              <div className="agent-field">
                <Text>静音结束</Text>
                <InputNumber
                  min={0}
                  max={23}
                  value={settings.reminders.quietEndHour}
                  addonAfter="点"
                  onChange={(value) => setSettings({
                    ...settings,
                    reminders: {
                      ...settings.reminders,
                      quietEndHour: value ?? 7,
                    },
                  })}
                  style={{ marginTop: 8, width: '100%' }}
                />
              </div>
              <div className="agent-field">
                <Text>同类提醒冷却</Text>
                <InputNumber
                  min={1}
                  max={24}
                  value={settings.reminders.cooldownHours}
                  addonAfter="小时"
                  onChange={(value) => setSettings({
                    ...settings,
                    reminders: {
                      ...settings.reminders,
                      cooldownHours: value ?? 4,
                    },
                  })}
                  style={{ marginTop: 8, width: '100%' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="settings-section coaching-settings-section">
          <div className="settings-section-head">
            <div>
              <Title level={5}>🎛️ 智能教练设置</Title>
              <Text type="secondary">控制记录模式：自动模式省心省力，精确模式每笔确认。</Text>
            </div>
          </div>

          <div className="coaching-settings-list">
            <div className="reminder-setting-row">
              <div>
                <Text strong>记录模式</Text>
                <Text type="secondary">选择记录饮食时的确认方式。</Text>
              </div>
            </div>
            <Radio.Group
              value={coachingSettings.trustMode}
              onChange={(e) => {
                const next: CoachingSettings = { ...coachingSettings, trustMode: e.target.value as TrustMode }
                setCoachingSettings(next)
                saveCoachingSettings(next)
              }}
              style={{ marginBottom: 16 }}
            >
              <Radio value="autopilot">自动模式 — 高置信度时自动保存，不需要确认</Radio>
              <Radio value="precision">精确模式 — 每次记录都需要手动确认</Radio>
            </Radio.Group>

            {coachingSettings.trustMode === 'autopilot' && (
              <div className="agent-field" style={{ maxWidth: 400 }}>
                <Text strong>自动保存置信度阈值</Text>
                <Text type="secondary">
                  置信度 ≥ 此值时自动保存，当前: {Math.round(coachingSettings.estimateAutoConfidence * 100)}%
                </Text>
                <Slider
                  min={50}
                  max={95}
                  step={5}
                  value={Math.round(coachingSettings.estimateAutoConfidence * 100)}
                  tooltip={{ formatter: (value) => `${value}%` }}
                  onChange={(value) => {
                    const next: CoachingSettings = { ...coachingSettings, estimateAutoConfidence: value / 100 }
                    setCoachingSettings(next)
                    saveCoachingSettings(next)
                  }}
                  style={{ marginTop: 8 }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="settings-section calibration-audit-section">
          <div className="settings-section-head">
            <div>
              <Title level={5}>🧾 菜谱校准审计</Title>
              <Text type="secondary">
                热量修正会先进入待审核记录；审核通过后，应用内菜谱营养会以「生效覆盖」读取（Git 中的 TypeScript 菜谱源文件仍不变，便于回滚与审计）。
              </Text>
            </div>
            <Tag icon={<AuditOutlined />} color="gold" bordered={false}>
              {calibrationSummary.total} 条记录
            </Tag>
          </div>

          <Text type="secondary" className="calibration-active-line">
            当前有 <Text strong>{activeCalibrationRecipes}</Text> 道菜谱使用已通过的校准营养参与统计、推荐与记餐。
          </Text>

          <div className="calibration-summary-grid">
            <div className="calibration-summary-item">
              <Text type="secondary">待审核</Text>
              <strong>{calibrationSummary.pending}</strong>
            </div>
            <div className="calibration-summary-item">
              <Text type="secondary">需复核</Text>
              <strong>{calibrationSummary.needsReview}</strong>
            </div>
            <div className="calibration-summary-item">
              <Text type="secondary">已通过</Text>
              <strong>{calibrationSummary.approved}</strong>
            </div>
            <div className="calibration-summary-item">
              <Text type="secondary">已拒绝</Text>
              <strong>{calibrationSummary.rejected}</strong>
            </div>
          </div>

          {calibrationSummary.latestUpdatedAt && (
            <Text type="secondary" className="calibration-updated-at">
              最近更新: {new Date(calibrationSummary.latestUpdatedAt).toLocaleString()}
            </Text>
          )}
        </div>

        <div className="settings-section memory-settings-section">
          <div className="settings-section-head">
            <div>
              <Title level={5}>🧠 长期记忆</Title>
              <Text type="secondary">猫猫虫会把你确认过的偏好、忌口、过敏和习惯放在这里，随时可以删除或调低置信度。</Text>
            </div>
            <Tag icon={<BulbOutlined />} color="purple" bordered={false}>
              {memories.length} 条记忆
            </Tag>
          </div>

          <div className="memory-extraction-options">
            <div className="reminder-setting-row">
              <div>
                <Text strong>对话后自动提炼记忆</Text>
                <div>
                  <Text type="secondary">
                    每轮对话结束后异步调用模型抽取长期事实；高置信度直接入库，略低进入「待确认」。
                  </Text>
                </div>
              </div>
              <Switch
                checked={settings.memoryPostChatExtraction !== false}
                onChange={(checked) => {
                  const next = { ...settings, memoryPostChatExtraction: checked }
                  setSettings(next)
                  saveSettings(next)
                }}
              />
            </div>
            <div className="memory-threshold-grid">
              <div className="agent-field">
                <Text type="secondary">自动写入阈值（置信度 ≥）</Text>
                <InputNumber
                  min={0.55}
                  max={0.95}
                  step={0.01}
                  value={settings.memoryPostChatAutoConfidence ?? 0.78}
                  disabled={settings.memoryPostChatExtraction === false}
                  onChange={(value) => {
                    const next = {
                      ...settings,
                      memoryPostChatAutoConfidence: typeof value === 'number' ? value : 0.78,
                    }
                    setSettings(next)
                    saveSettings(next)
                  }}
                  style={{ width: '100%', marginTop: 8 }}
                />
              </div>
              <div className="agent-field">
                <Text type="secondary">待确认最低置信度</Text>
                <InputNumber
                  min={0.35}
                  max={0.9}
                  step={0.01}
                  value={settings.memoryPostChatPendingMinConfidence ?? 0.52}
                  disabled={settings.memoryPostChatExtraction === false}
                  onChange={(value) => {
                    const next = {
                      ...settings,
                      memoryPostChatPendingMinConfidence: typeof value === 'number' ? value : 0.52,
                    }
                    setSettings(next)
                    saveSettings(next)
                  }}
                  style={{ width: '100%', marginTop: 8 }}
                />
              </div>
            </div>
          </div>

          {pendingMemories.length > 0 && (
            <div className="pending-memory-block">
              <Text strong>待确认的记忆提炼</Text>
              <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
                来自对话推断，采纳后才会进入上面的长期记忆并在后续对话中生效。
              </Text>
              <div className="pending-memory-list">
                {pendingMemories.map((memory) => (
                  <div className="pending-memory-item" key={memory.id ?? memory.content}>
                    <div className="memory-item-head">
                      <Tag color={getMemoryTypeColor(memory.type)} bordered={false}>
                        {getMemoryTypeLabel(memory.type)}
                      </Tag>
                      <Text type="secondary">
                        置信度 {Math.round(memory.confidence * 100)}% · 来源 {memory.source === 'agent_inferred' ? '对话推断' : memory.source}
                      </Text>
                    </div>
                    <Text className="memory-content">{memory.content}</Text>
                    <div className="pending-memory-actions">
                      <Button
                        type="primary"
                        size="small"
                        disabled={!memory.id}
                        onClick={() => memory.id && void handleConfirmPendingMemory(memory.id)}
                      >
                        采纳
                      </Button>
                      <Button
                        size="small"
                        disabled={!memory.id}
                        onClick={() => memory.id && void handleDismissPendingMemory(memory.id)}
                      >
                        丢弃
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {memories.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有长期记忆"
            />
          ) : (
            <div className="memory-list">
              {memories.map((memory) => (
                <div className="memory-item" key={memory.id}>
                  <div className="memory-item-head">
                    <Tag color={getMemoryTypeColor(memory.type)} bordered={false}>
                      {getMemoryTypeLabel(memory.type)}
                    </Tag>
                    <Text type="secondary">
                      置信度 {Math.round(memory.confidence * 100)}%
                    </Text>
                  </div>

                  <Text className="memory-content">{memory.content}</Text>

                  {memory.tags.length > 0 && (
                    <div className="memory-tags">
                      {memory.tags.map((tag) => (
                        <Tag key={tag} bordered={false}>
                          {tag}
                        </Tag>
                      ))}
                    </div>
                  )}

                  <div className="memory-item-actions">
                    <Slider
                      min={0}
                      max={100}
                      value={Math.round(memory.confidence * 100)}
                      tooltip={{ formatter: (value) => `${value}%` }}
                      onAfterChange={(value) => {
                        if (memory.id) {
                          void handleMemoryConfidenceChange(memory.id, value)
                        }
                      }}
                      className="memory-confidence-slider"
                    />
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => memory.id && void handleForgetMemory(memory.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="settings-section agent-settings-section">
          <div className="settings-section-head">
            <div>
              <Title level={5}>🤖 AI 对话设置</Title>
              <Text type="secondary">配置模型通道、Base URL、Model 和 API Key</Text>
            </div>
            <Tag color={apiKeyConfigured ? 'success' : 'warning'} bordered={false}>
              {checkingApiKey ? '检查中' : apiKeyConfigured ? '密钥已配置' : '密钥未配置'}
            </Tag>
          </div>

          <div className="agent-settings-grid">
            <div className="agent-field">
              <Text>模型提供商</Text>
              <Select
                value={settings.agent.provider}
                options={Object.values(AGENT_PROVIDER_PRESETS).map((preset) => ({
                  value: preset.id,
                  label: preset.name,
                }))}
                onChange={handleProviderChange}
                style={{ width: '100%', marginTop: 8 }}
              />
              <Text type="secondary" className="agent-help-text">
                {AGENT_PROVIDER_PRESETS[settings.agent.provider].description}
              </Text>
            </div>

            <div className="agent-field">
              <Text>Base URL / Endpoint</Text>
              <Input
                placeholder={settings.agent.provider === 'custom'
                  ? '可填完整地址，如 https://your-api.example.com/v1/chat/completions'
                  : 'https://...'}
                value={settings.agent.apiBaseUrl}
                onChange={(event) => setSettings({
                  ...settings,
                  agent: {
                    ...settings.agent,
                    apiBaseUrl: event.target.value,
                  },
                })}
                style={{ marginTop: 8 }}
              />
              <Text type="secondary" className="agent-help-text">
                {settings.agent.provider === 'custom'
                  ? '自定义通道既支持填写 Base URL，也支持直接填写完整的 /chat/completions 地址。'
                  : '内置通道默认给出兼容接口地址，一般不需要改。'}
              </Text>
            </div>

            <div className="agent-field">
              <Text>Model</Text>
              <Input
                placeholder="例如 deepseek-v4-flash"
                value={settings.agent.model}
                onChange={(event) => setSettings({
                  ...settings,
                  agent: {
                    ...settings.agent,
                    model: event.target.value,
                  },
                })}
                style={{ marginTop: 8 }}
              />
            </div>

            <div className="agent-field">
              <Text>工具调用兼容模式</Text>
              <Select
                value={settings.agent.toolCompatibility}
                options={TOOL_COMPATIBILITY_OPTIONS}
                onChange={(value) => setSettings({
                  ...settings,
                  agent: {
                    ...settings.agent,
                    toolCompatibility: value,
                  },
                })}
                style={{ width: '100%', marginTop: 8 }}
              />
              <Text type="secondary" className="agent-help-text">
                自定义兼容接口建议先用自动协商；如果某个渠道只支持旧版 functions 或拒绝 tool_choice，可以在这里手动锁定。
              </Text>
            </div>

            <div className="agent-field">
              <Text>API Key</Text>
              <Input.Password
                placeholder={apiKeyConfigured ? '留空则保持当前已保存的 API Key' : '输入新的 API Key'}
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                style={{ marginTop: 8 }}
              />
              <div className="agent-key-actions">
                <Text type="secondary" className="agent-help-text">
                  API Key 仅存主进程安全存储，不写入渲染进程 localStorage。
                </Text>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => void handleClearApiKey()}
                  disabled={!apiKeyConfigured}
                >
                  清除当前密钥
                </Button>
              </div>
            </div>
          </div>

          <div className="usage-stats-panel">
            <div className="usage-stats-head">
              <div>
                <Text strong>
                  <PieChartOutlined /> AI 调用统计与费用估算
                </Text>
                <Text type="secondary">
                  统计主进程真实 API 调用次数与模型返回的 token usage；费用按你填写的百万 token 单价估算。
                </Text>
              </div>
              <div className="usage-stats-actions">
                <Button
                  size="small"
                  onClick={() => void refreshUsageStats()}
                  loading={loadingUsageStats}
                >
                  刷新
                </Button>
                <Popconfirm
                  title="清空 AI 调用统计？"
                  description="这只会清空本地统计记录，不会影响聊天历史或 API Key。"
                  okText="清空"
                  cancelText="取消"
                  onConfirm={() => void handleClearUsageStats()}
                >
                  <Button size="small" danger>
                    清空
                  </Button>
                </Popconfirm>
              </div>
            </div>

            <div className="usage-stats-grid">
              <div className="usage-stat-item">
                <Text type="secondary">调用次数</Text>
                <strong>{formatUsageNumber(usageStats?.totalCalls ?? 0)}</strong>
                <small>聊天 {formatUsageNumber(usageStats?.chatCalls ?? 0)} / 诊断 {formatUsageNumber(usageStats?.diagnosticCalls ?? 0)}</small>
              </div>
              <div className="usage-stat-item">
                <Text type="secondary">总 tokens</Text>
                <strong>{formatUsageNumber(usageStats?.totalTokens ?? 0)}</strong>
                <small>输入 {formatUsageNumber(usageStats?.promptTokens ?? 0)} / 输出 {formatUsageNumber(usageStats?.completionTokens ?? 0)}</small>
              </div>
              <div className="usage-stat-item">
                <Text type="secondary">费用估算</Text>
                <strong>{estimatedCost === null ? '待配置' : `$${estimatedCost.toFixed(4)}`}</strong>
                <small>按自定义单价计算，不硬编码 provider 价格</small>
              </div>
              <div className="usage-stat-item">
                <Text type="secondary">usage 覆盖</Text>
                <strong>{formatUsageNumber(usageStats?.usageAvailableCalls ?? 0)}</strong>
                <small>返回 token usage 的请求数</small>
              </div>
            </div>

            <div className="usage-pricing-grid">
              <div className="agent-field">
                <Text>输入单价</Text>
                <InputNumber
                  min={0}
                  step={0.01}
                  precision={4}
                  value={settings.usagePricing.promptUsdPerMillionTokens}
                  addonAfter="USD / 100万 tokens"
                  onChange={(value) => setSettings({
                    ...settings,
                    usagePricing: {
                      ...settings.usagePricing,
                      promptUsdPerMillionTokens: typeof value === 'number' ? value : undefined,
                    },
                  })}
                  style={{ marginTop: 8, width: '100%' }}
                />
              </div>
              <div className="agent-field">
                <Text>输出单价</Text>
                <InputNumber
                  min={0}
                  step={0.01}
                  precision={4}
                  value={settings.usagePricing.completionUsdPerMillionTokens}
                  addonAfter="USD / 100万 tokens"
                  onChange={(value) => setSettings({
                    ...settings,
                    usagePricing: {
                      ...settings.usagePricing,
                      completionUsdPerMillionTokens: typeof value === 'number' ? value : undefined,
                    },
                  })}
                  style={{ marginTop: 8, width: '100%' }}
                />
              </div>
            </div>

            {usageStats && usageStats.byModel.length > 0 && (
              <div className="usage-model-list">
                {usageStats.byModel.slice(0, 3).map((item) => (
                  <div key={item.key} className="usage-model-row">
                    <Text strong>{item.providerName} / {item.model}</Text>
                    <Text type="secondary">
                      {item.calls} 次 · {formatUsageNumber(item.totalTokens)} tokens
                    </Text>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="diagnostics-toolbar">
            <Text type="secondary">
              测试连接会先保存当前表单配置；如果 API Key 输入框里有新值，也会先保存再测试。
            </Text>
            <Button
              icon={<LinkOutlined />}
              onClick={() => void handleRunDiagnostics()}
              loading={testingConnection}
              className="diagnostics-btn"
            >
              测试连接
            </Button>
          </div>

          <Card className="diagnostics-card" size="small">
            <div className="diagnostics-card-head">
              <Title level={5} style={{ margin: 0 }}>
                连接诊断
              </Title>
              {diagnostics?.checkedAt && (
                <Text type="secondary">最近测试: {new Date(diagnostics.checkedAt).toLocaleString()}</Text>
              )}
            </div>

            <Descriptions
              size="small"
              column={1}
              className="diagnostics-descriptions"
              items={[
                {
                  key: 'provider',
                  label: 'Provider',
                  children: diagnosticsProviderName,
                },
                {
                  key: 'endpoint',
                  label: 'Endpoint',
                  children: diagnosticsEndpoint,
                },
                {
                  key: 'resolvedEndpoint',
                  label: '实际请求地址',
                  children: diagnosticsResolvedEndpoint,
                },
                {
                  key: 'model',
                  label: 'Model',
                  children: diagnosticsModel,
                },
                {
                  key: 'apiKey',
                  label: 'API Key 状态',
                  children: checkingApiKey ? '检查中' : apiKeyConfigured ? '已保存' : '未保存',
                },
              ]}
            />

            {diagnostics ? (
              <div className="diagnostics-results">
                <Alert
                  type={getDiagnosticAlertType(diagnostics.plainChat)}
                  message={diagnostics.plainChat.title}
                  description={renderDiagnosticDescription(diagnostics.plainChat)}
                  showIcon
                />
                <Alert
                  type={getDiagnosticAlertType(diagnostics.toolCall)}
                  message={diagnostics.toolCall.title}
                  description={renderDiagnosticDescription(diagnostics.toolCall)}
                  showIcon
                />
              </div>
            ) : (
              <Alert
                type="info"
                showIcon
                message="还没有运行连接诊断"
                description="点击上方“测试连接”后，这里会显示聊天测试和 Tool 调用测试的详细结果。"
              />
            )}
          </Card>
        </div>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => void handleSave()}
          loading={savingConfig}
          className="save-btn"
        >
          {saved ? '已保存 ✨' : '保存设置'}
        </Button>
      </Card>

      <Card className="about-card" style={{ marginTop: 20 }}>
        <div className="about-content">
          <span className="about-emoji">🐛</span>
          <div>
            <Title level={5}>关于猫猫虫饮食小助手</Title>
            <Text type="secondary">
              当前版本聚焦桌面端饮食管理与 AI 对话能力
              <br />
              菜谱库来源: HowToCook 灵感整理 + 本地扩展中西式菜谱
            </Text>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default SettingsPage
