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
import { getSettings, saveSettings, type AppLanguage, type Settings } from '../stores/settings'
import { useI18n } from '../i18n'
import './Settings.css'

const { Title, Text, Paragraph } = Typography

function getMemoryTypeLabel(type: UserMemoryType, language: AppLanguage): string {
  const labels = language === 'zh'
    ? {
        preference: '偏好',
        allergy: '过敏',
        avoidance: '忌口',
        habit: '习惯',
        schedule: '作息',
        health_note: '健康',
        goal: '目标',
        other: '其他',
      }
    : {
        preference: 'Preference',
        allergy: 'Allergy',
        avoidance: 'Avoid',
        habit: 'Habit',
        schedule: 'Schedule',
        health_note: 'Health',
        goal: 'Goal',
        other: 'Other',
      }

  switch (type) {
    case 'preference':
      return labels.preference
    case 'allergy':
      return labels.allergy
    case 'avoidance':
      return labels.avoidance
    case 'habit':
      return labels.habit
    case 'schedule':
      return labels.schedule
    case 'health_note':
      return labels.health_note
    case 'goal':
      return labels.goal
    default:
      return labels.other
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

function renderDiagnosticDescription(result: AgentDiagnosticResult, language: AppLanguage): JSX.Element {
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
          {language === 'zh' ? 'tool_calls 数量' : 'Tool calls'}: {result.toolCallsCount}
        </Text>
      )}
      {result.toolRequestMode && (
        <Text type="secondary" className="diagnostic-meta-line">
          {language === 'zh' ? '工具协议模式' : 'Tool protocol mode'}: {result.toolRequestMode}
        </Text>
      )}
      {result.error?.code && (
        <Text type="secondary" className="diagnostic-meta-line">
          {language === 'zh' ? '错误分类' : 'Error code'}: {result.error.code}
        </Text>
      )}
      {result.preview && (
        <div className="diagnostic-preview">
          <Text strong>{language === 'zh' ? '返回预览' : 'Response preview'}</Text>
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

function getToolCompatibilityOptions(language: AppLanguage): Array<{ value: AgentToolCompatibilityMode; label: string }> {
  return language === 'zh'
    ? [
        { value: 'auto', label: '自动协商（推荐）' },
        { value: 'openai_tools', label: 'OpenAI tools + tool_choice' },
        { value: 'openai_tools_no_choice', label: 'OpenAI tools（不带 tool_choice）' },
        { value: 'legacy_functions', label: '旧版 functions / function_call' },
        { value: 'plain_chat', label: '纯聊天（禁用工具）' },
      ]
    : [
        { value: 'auto', label: 'Auto negotiate (recommended)' },
        { value: 'openai_tools', label: 'OpenAI tools + tool_choice' },
        { value: 'openai_tools_no_choice', label: 'OpenAI tools (no tool_choice)' },
        { value: 'legacy_functions', label: 'Legacy functions / function_call' },
        { value: 'plain_chat', label: 'Plain chat (disable tools)' },
      ]
}

function getProviderDescription(provider: AgentProvider, language: AppLanguage): string {
  if (language === 'zh') {
    return AGENT_PROVIDER_PRESETS[provider].description
  }

  switch (provider) {
    case 'deepseek':
      return 'Uses DeepSeek’s OpenAI-compatible Chat Completions endpoint by default.'
    case 'qwen':
      return 'Uses Alibaba Cloud Bailian’s OpenAI-compatible Chat Completions endpoint by default.'
    case 'custom':
      return 'For other model services compatible with OpenAI Chat Completions.'
    default:
      return AGENT_PROVIDER_PRESETS[provider].description
  }
}

function SettingsPage(): JSX.Element {
  const { language, setLanguage, t } = useI18n()
  const l = (zh: string, en: string): string => language === 'zh' ? zh : en
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

  const handleLanguageChange = (nextLanguage: AppLanguage): void => {
    const nextSettings = { ...settings, language: nextLanguage }
    setSettings(nextSettings)
    setLanguage(nextLanguage)
    message.success(nextLanguage === 'zh' ? '语言已更新。' : 'Language updated.')
  }

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
      message.success(l('设置保存成功，猫猫虫已经记住啦~ 🐛💾', 'Settings saved. Diet Agent will remember them.'))
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const handleSave = async () => {
    setSavingConfig(true)

    try {
      await persistCurrentSettings(true)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : l('保存失败', 'Save failed')
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
      message.success(l('连接测试完成，结果已更新到下方诊断区。', 'Connection test complete. Diagnostics are updated below.'))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : l('连接测试失败', 'Connection test failed')
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
      message.success(l('当前通道的 API Key 已清除。', 'The API key for this provider has been cleared.'))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : l('清除失败', 'Clear failed')
      message.error(errorMessage)
    }
  }

  const handleForgetMemory = async (memoryId: number): Promise<void> => {
    try {
      await forget(memoryId, l('用户在设置页删除', 'Deleted by the user in Settings'))
      setMemories(await listUserFacts({ limit: 100 }))
      setPendingMemories(await getUserMemories({ status: 'pending_confirm', limit: 50 }))
      message.success(l('这条记忆已删除。', 'This memory has been deleted.'))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : l('删除失败', 'Delete failed')
      message.error(errorMessage)
    }
  }

  const handleClearUsageStats = async (): Promise<void> => {
    try {
      setUsageStats(await window.agent.clearUsageStats())
      message.success(l('AI 调用统计已清空。', 'AI usage statistics have been cleared.'))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : l('清空失败', 'Clear failed')
      message.error(errorMessage)
    }
  }

  const handleMemoryConfidenceChange = async (memoryId: number, confidence: number): Promise<void> => {
    try {
      await updateMemoryConfidence(memoryId, confidence / 100)
      setMemories(await listUserFacts({ limit: 100 }))
      setPendingMemories(await getUserMemories({ status: 'pending_confirm', limit: 50 }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : l('更新失败', 'Update failed')
      message.error(errorMessage)
    }
  }

  const handleConfirmPendingMemory = async (memoryId: number): Promise<void> => {
    try {
      await confirmPendingMemory(memoryId)
      setMemories(await listUserFacts({ limit: 100 }))
      setPendingMemories(await getUserMemories({ status: 'pending_confirm', limit: 50 }))
      message.success(l('已加入长期记忆。', 'Added to long-term memory.'))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : l('确认失败', 'Confirm failed')
      message.error(errorMessage)
    }
  }

  const handleDismissPendingMemory = async (memoryId: number): Promise<void> => {
    try {
      await dismissPendingMemory(memoryId)
      setPendingMemories(await getUserMemories({ status: 'pending_confirm', limit: 50 }))
      message.success(l('已丢弃该条待确认提炼。', 'Discarded this pending memory extraction.'))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : l('操作失败', 'Operation failed')
      message.error(errorMessage)
    }
  }

  const diagnosticsProviderName = diagnostics?.providerName ?? AGENT_PROVIDER_PRESETS[settings.agent.provider].name
  const diagnosticsEndpoint = diagnostics?.endpoint || settings.agent.apiBaseUrl || l('未填写', 'Not set')
  const diagnosticsResolvedEndpoint = diagnostics?.resolvedEndpoint || (
    settings.agent.apiBaseUrl
      ? settings.agent.apiBaseUrl.replace(/\/+$/, '').match(/\/chat\/completions$/i)
        ? settings.agent.apiBaseUrl.replace(/\/+$/, '')
        : `${settings.agent.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`
      : l('未填写', 'Not set')
  )
  const diagnosticsModel = diagnostics?.model || settings.agent.model || l('未填写', 'Not set')

  const estimatedCost = usageStats ? estimateUsageCost(usageStats, settings) : null

  return (
    <div className="settings-page">
      <Title level={3}>⚙️ {t('settings.title')}</Title>
      <Text type="secondary">{t('settings.subtitle')}</Text>

      <Card className="settings-card" style={{ marginTop: 24 }}>
        <div className="settings-section">
          <Title level={5}>🌐 {t('settings.language.title')}</Title>
          <Text type="secondary">{t('settings.language.description')}</Text>
          <Select
            value={language}
            options={[
              { value: 'en', label: t('settings.language.english') },
              { value: 'zh', label: t('settings.language.chinese') },
            ]}
            onChange={handleLanguageChange}
            style={{ marginTop: 8, maxWidth: 240, display: 'block' }}
          />
        </div>

        <div className="settings-section">
          <Title level={5}>🐱 {t('settings.nickname.title')}</Title>
          <Text type="secondary">{t('settings.nickname.description')}</Text>
          <Input
            placeholder={t('settings.nickname.placeholder')}
            value={settings.nickname}
            onChange={(event) => setSettings({ ...settings, nickname: event.target.value })}
            maxLength={20}
            style={{ marginTop: 8, maxWidth: 300 }}
          />
        </div>

        <div className="settings-section">
          <Title level={5}>🎯 {l('每日卡路里目标', 'Daily calorie goal')}</Title>
          <Text type="secondary">{l('设定每天的卡路里摄入目标（可选）', 'Set your daily calorie target (optional).')}</Text>
          <InputNumber
            placeholder={l('例如 2000', 'e.g. 2000')}
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
              <Title level={5}>🔔 {l('主动提醒设置', 'Proactive reminders')}</Title>
              <Text type="secondary">{l('让猫猫虫在合适的时候轻轻提醒，不打扰你专注。', 'Let Diet Agent nudge you at useful moments without interrupting focus.')}</Text>
            </div>
            <Tag
              icon={<NotificationOutlined />}
              color={settings.reminders.enabled ? 'success' : 'default'}
              bordered={false}
            >
              {settings.reminders.enabled ? l('已开启', 'Enabled') : l('已关闭', 'Disabled')}
            </Tag>
          </div>

          <div className="reminder-settings-list">
            <div className="reminder-setting-row">
              <div>
                <Text strong>{l('主动提醒总开关', 'Enable proactive reminders')}</Text>
                <Text type="secondary">{l('关闭后不会弹出早餐/午餐/晚餐等主动提醒。', 'When off, breakfast, lunch, dinner, and other proactive reminders will not appear.')}</Text>
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
                <Text strong>{l('餐次未记录提醒', 'Missing meal reminders')}</Text>
                <Text type="secondary">{l('早餐、午餐或晚餐过了时间还没记录时提醒。', 'Remind you when breakfast, lunch, or dinner is overdue and not logged.')}</Text>
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
                <Text strong>{l('动态计划建议提醒', 'Dynamic plan suggestions')}</Text>
                <Text type="secondary">{l('记录后发现当天计划偏差时展示补餐/减餐建议。', 'Show add-or-reduce meal suggestions when today drifts from the plan after logging.')}</Text>
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
                <Text strong>{l('每周报告提醒', 'Weekly report reminder')}</Text>
                <Text type="secondary">{l('周日晚上提醒查看本周饮食复盘。', 'Remind you on Sunday evening to review the week.')}</Text>
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
                <Text strong>{l('记录后推送偏差摘要到 AI 对话', 'Post plan-gap snapshot to AI chat after logging')}</Text>
                <Text type="secondary">
                  {l('保存饮食记录后，用与计划页相同口径生成一句快照（可选展开建议）；不调用大模型。', 'After saving a meal, generate a one-line snapshot using the same plan-gap logic; no model call required.')}
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
                <Text strong>{l('记录后桌面通知（一句）', 'Desktop notification after logging')}</Text>
                <Text type="secondary">
                  {l('需开启主动提醒总开关，并遵守静音时段；内容与对话快照一致。', 'Requires proactive reminders and respects quiet hours; content matches the chat snapshot.')}
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
                <Text>{l('静音开始', 'Quiet starts')}</Text>
                <InputNumber
                  min={0}
                  max={23}
                  value={settings.reminders.quietStartHour}
                  addonAfter={l('点', ':00')}
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
                <Text>{l('静音结束', 'Quiet ends')}</Text>
                <InputNumber
                  min={0}
                  max={23}
                  value={settings.reminders.quietEndHour}
                  addonAfter={l('点', ':00')}
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
                <Text>{l('同类提醒冷却', 'Cooldown')}</Text>
                <InputNumber
                  min={1}
                  max={24}
                  value={settings.reminders.cooldownHours}
                  addonAfter={l('小时', 'hours')}
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
              <Title level={5}>🎛️ {l('智能教练设置', 'Smart coach settings')}</Title>
              <Text type="secondary">{l('控制记录模式：自动模式省心省力，精确模式每笔确认。', 'Control logging mode: autopilot saves high-confidence entries, precision mode asks every time.')}</Text>
            </div>
          </div>

          <div className="coaching-settings-list">
            <div className="reminder-setting-row">
              <div>
                <Text strong>{l('记录模式', 'Logging mode')}</Text>
                <Text type="secondary">{l('选择记录饮食时的确认方式。', 'Choose how meal logs are confirmed.')}</Text>
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
              <Radio value="autopilot">{l('自动模式 — 高置信度时自动保存，不需要确认', 'Autopilot - save high-confidence entries without confirmation')}</Radio>
              <Radio value="precision">{l('精确模式 — 每次记录都需要手动确认', 'Precision - confirm every entry manually')}</Radio>
            </Radio.Group>

            {coachingSettings.trustMode === 'autopilot' && (
              <div className="agent-field" style={{ maxWidth: 400 }}>
                <Text strong>{l('自动保存置信度阈值', 'Auto-save confidence threshold')}</Text>
                <Text type="secondary">
                  {l('置信度 ≥ 此值时自动保存，当前', 'Auto-save when confidence is at least this value. Current')}: {Math.round(coachingSettings.estimateAutoConfidence * 100)}%
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
              <Title level={5}>🧾 {l('菜谱校准审计', 'Recipe calibration audit')}</Title>
              <Text type="secondary">
                {l('热量修正会先进入待审核记录；审核通过后，应用内菜谱营养会以「生效覆盖」读取（Git 中的 TypeScript 菜谱源文件仍不变，便于回滚与审计）。', 'Calorie corrections first go to review. Approved corrections are read as active overlays while the TypeScript recipe source remains unchanged for rollback and audit.')}
              </Text>
            </div>
            <Tag icon={<AuditOutlined />} color="gold" bordered={false}>
              {l(`${calibrationSummary.total} 条记录`, `${calibrationSummary.total} records`)}
            </Tag>
          </div>

          <Text type="secondary" className="calibration-active-line">
            {l('当前有', 'Currently')} <Text strong>{activeCalibrationRecipes}</Text> {l('道菜谱使用已通过的校准营养参与统计、推荐与记餐。', 'recipes use approved calibration values for stats, recommendations, and logging.')}
          </Text>

          <div className="calibration-summary-grid">
            <div className="calibration-summary-item">
              <Text type="secondary">{l('待审核', 'Pending')}</Text>
              <strong>{calibrationSummary.pending}</strong>
            </div>
            <div className="calibration-summary-item">
              <Text type="secondary">{l('需复核', 'Needs review')}</Text>
              <strong>{calibrationSummary.needsReview}</strong>
            </div>
            <div className="calibration-summary-item">
              <Text type="secondary">{l('已通过', 'Approved')}</Text>
              <strong>{calibrationSummary.approved}</strong>
            </div>
            <div className="calibration-summary-item">
              <Text type="secondary">{l('已拒绝', 'Rejected')}</Text>
              <strong>{calibrationSummary.rejected}</strong>
            </div>
          </div>

          {calibrationSummary.latestUpdatedAt && (
            <Text type="secondary" className="calibration-updated-at">
              {l('最近更新', 'Last updated')}: {new Date(calibrationSummary.latestUpdatedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
            </Text>
          )}
        </div>

        <div className="settings-section memory-settings-section">
          <div className="settings-section-head">
            <div>
              <Title level={5}>🧠 {l('长期记忆', 'Long-term memory')}</Title>
              <Text type="secondary">{l('猫猫虫会把你确认过的偏好、忌口、过敏和习惯放在这里，随时可以删除或调低置信度。', 'Diet Agent stores confirmed preferences, avoidances, allergies, and habits here. You can delete them or lower confidence anytime.')}</Text>
            </div>
            <Tag icon={<BulbOutlined />} color="purple" bordered={false}>
              {l(`${memories.length} 条记忆`, `${memories.length} memories`)}
            </Tag>
          </div>

          <div className="memory-extraction-options">
            <div className="reminder-setting-row">
              <div>
                <Text strong>{l('对话后自动提炼记忆', 'Extract memories after chat')}</Text>
                <div>
                  <Text type="secondary">
                    {l('每轮对话结束后异步调用模型抽取长期事实；高置信度直接入库，略低进入「待确认」。', 'After each chat, call the model in the background to extract long-term facts. High confidence is saved directly; lower confidence goes to pending confirmation.')}
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
                <Text type="secondary">{l('自动写入阈值（置信度 ≥）', 'Auto-save threshold (confidence >=)')}</Text>
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
                <Text type="secondary">{l('待确认最低置信度', 'Pending minimum confidence')}</Text>
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
              <Text strong>{l('待确认的记忆提炼', 'Pending memory extractions')}</Text>
              <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
                {l('来自对话推断，采纳后才会进入上面的长期记忆并在后续对话中生效。', 'These are inferred from chat and only become long-term memories after you accept them.')}
              </Text>
              <div className="pending-memory-list">
                {pendingMemories.map((memory) => (
                  <div className="pending-memory-item" key={memory.id ?? memory.content}>
                    <div className="memory-item-head">
                      <Tag color={getMemoryTypeColor(memory.type)} bordered={false}>
                        {getMemoryTypeLabel(memory.type, language)}
                      </Tag>
                      <Text type="secondary">
                        {l('置信度', 'Confidence')} {Math.round(memory.confidence * 100)}% · {l('来源', 'Source')} {memory.source === 'agent_inferred' ? l('对话推断', 'Chat inference') : memory.source}
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
                        {l('采纳', 'Accept')}
                      </Button>
                      <Button
                        size="small"
                        disabled={!memory.id}
                        onClick={() => memory.id && void handleDismissPendingMemory(memory.id)}
                      >
                        {l('丢弃', 'Discard')}
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
              description={l('还没有长期记忆', 'No long-term memories yet')}
            />
          ) : (
            <div className="memory-list">
              {memories.map((memory) => (
                <div className="memory-item" key={memory.id}>
                  <div className="memory-item-head">
                    <Tag color={getMemoryTypeColor(memory.type)} bordered={false}>
                      {getMemoryTypeLabel(memory.type, language)}
                    </Tag>
                    <Text type="secondary">
                      {l('置信度', 'Confidence')} {Math.round(memory.confidence * 100)}%
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
                      {l('删除', 'Delete')}
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
              <Title level={5}>🤖 {l('AI 对话设置', 'AI chat settings')}</Title>
              <Text type="secondary">{l('配置模型通道、Base URL、Model 和 API Key', 'Configure provider, Base URL, model, and API key.')}</Text>
            </div>
            <Tag color={apiKeyConfigured ? 'success' : 'warning'} bordered={false}>
              {checkingApiKey ? l('检查中', 'Checking') : apiKeyConfigured ? l('密钥已配置', 'Key configured') : l('密钥未配置', 'Key missing')}
            </Tag>
          </div>

          <div className="agent-settings-grid">
            <div className="agent-field">
              <Text>{l('模型提供商', 'Model provider')}</Text>
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
                {getProviderDescription(settings.agent.provider, language)}
              </Text>
            </div>

            <div className="agent-field">
              <Text>Base URL / Endpoint</Text>
              <Input
                placeholder={settings.agent.provider === 'custom'
                  ? l('可填完整地址，如 https://your-api.example.com/v1/chat/completions', 'Full endpoint is allowed, e.g. https://your-api.example.com/v1/chat/completions')
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
                  ? l('自定义通道既支持填写 Base URL，也支持直接填写完整的 /chat/completions 地址。', 'Custom providers accept either a Base URL or a full /chat/completions endpoint.')
                  : l('内置通道默认给出兼容接口地址，一般不需要改。', 'Built-in providers include a compatible default endpoint, so this usually does not need changes.')}
              </Text>
            </div>

            <div className="agent-field">
              <Text>Model</Text>
              <Input
                placeholder={l('例如 deepseek-v4-flash', 'e.g. deepseek-v4-flash')}
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
              <Text>{l('工具调用兼容模式', 'Tool-call compatibility mode')}</Text>
              <Select
                value={settings.agent.toolCompatibility}
                options={getToolCompatibilityOptions(language)}
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
                {l('自定义兼容接口建议先用自动协商；如果某个渠道只支持旧版 functions 或拒绝 tool_choice，可以在这里手动锁定。', 'For custom-compatible endpoints, start with auto negotiation. If a provider only supports legacy functions or rejects tool_choice, lock the mode here.')}
              </Text>
            </div>

            <div className="agent-field">
              <Text>API Key</Text>
              <Input.Password
                placeholder={apiKeyConfigured ? l('留空则保持当前已保存的 API Key', 'Leave blank to keep the saved API key') : l('输入新的 API Key', 'Enter a new API key')}
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                style={{ marginTop: 8 }}
              />
              <div className="agent-key-actions">
                <Text type="secondary" className="agent-help-text">
                  {l('API Key 仅存主进程安全存储，不写入渲染进程 localStorage。', 'API keys are stored only in main-process secure storage, not renderer localStorage.')}
                </Text>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => void handleClearApiKey()}
                  disabled={!apiKeyConfigured}
                >
                  {l('清除当前密钥', 'Clear current key')}
                </Button>
              </div>
            </div>
          </div>

          <div className="usage-stats-panel">
            <div className="usage-stats-head">
              <div>
                <Text strong>
                  <PieChartOutlined /> {l('AI 调用统计与费用估算', 'AI usage and cost estimate')}
                </Text>
                <Text type="secondary">
                  {l('统计主进程真实 API 调用次数与模型返回的 token usage；费用按你填写的百万 token 单价估算。', 'Tracks real API calls and returned token usage from the main process. Cost uses the per-million-token prices you enter.')}
                </Text>
              </div>
              <div className="usage-stats-actions">
                <Button
                  size="small"
                  onClick={() => void refreshUsageStats()}
                  loading={loadingUsageStats}
                >
                  {l('刷新', 'Refresh')}
                </Button>
                <Popconfirm
                  title={l('清空 AI 调用统计？', 'Clear AI usage statistics?')}
                  description={l('这只会清空本地统计记录，不会影响聊天历史或 API Key。', 'This only clears local usage records. Chat history and API keys are not affected.')}
                  okText={l('清空', 'Clear')}
                  cancelText={l('取消', 'Cancel')}
                  onConfirm={() => void handleClearUsageStats()}
                >
                  <Button size="small" danger>
                    {l('清空', 'Clear')}
                  </Button>
                </Popconfirm>
              </div>
            </div>

            <div className="usage-stats-grid">
              <div className="usage-stat-item">
                <Text type="secondary">{l('调用次数', 'Calls')}</Text>
                <strong>{formatUsageNumber(usageStats?.totalCalls ?? 0)}</strong>
                <small>{l('聊天', 'Chat')} {formatUsageNumber(usageStats?.chatCalls ?? 0)} / {l('诊断', 'Diagnostics')} {formatUsageNumber(usageStats?.diagnosticCalls ?? 0)}</small>
              </div>
              <div className="usage-stat-item">
                <Text type="secondary">{l('总 tokens', 'Total tokens')}</Text>
                <strong>{formatUsageNumber(usageStats?.totalTokens ?? 0)}</strong>
                <small>{l('输入', 'Input')} {formatUsageNumber(usageStats?.promptTokens ?? 0)} / {l('输出', 'Output')} {formatUsageNumber(usageStats?.completionTokens ?? 0)}</small>
              </div>
              <div className="usage-stat-item">
                <Text type="secondary">{l('费用估算', 'Estimated cost')}</Text>
                <strong>{estimatedCost === null ? l('待配置', 'Not configured') : `$${estimatedCost.toFixed(4)}`}</strong>
                <small>{l('按自定义单价计算，不硬编码 provider 价格', 'Uses custom prices, not hard-coded provider pricing')}</small>
              </div>
              <div className="usage-stat-item">
                <Text type="secondary">{l('usage 覆盖', 'Usage coverage')}</Text>
                <strong>{formatUsageNumber(usageStats?.usageAvailableCalls ?? 0)}</strong>
                <small>{l('返回 token usage 的请求数', 'Requests that returned token usage')}</small>
              </div>
            </div>

            <div className="usage-pricing-grid">
              <div className="agent-field">
                <Text>{l('输入单价', 'Input price')}</Text>
                <InputNumber
                  min={0}
                  step={0.01}
                  precision={4}
                  value={settings.usagePricing.promptUsdPerMillionTokens}
                  addonAfter={l('USD / 100万 tokens', 'USD / 1M tokens')}
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
                <Text>{l('输出单价', 'Output price')}</Text>
                <InputNumber
                  min={0}
                  step={0.01}
                  precision={4}
                  value={settings.usagePricing.completionUsdPerMillionTokens}
                  addonAfter={l('USD / 100万 tokens', 'USD / 1M tokens')}
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
                      {item.calls} {l('次', 'calls')} · {formatUsageNumber(item.totalTokens)} tokens
                    </Text>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="diagnostics-toolbar">
            <Text type="secondary">
              {l('测试连接会先保存当前表单配置；如果 API Key 输入框里有新值，也会先保存再测试。', 'Connection test saves the current form first. If the API key field has a new value, it will be saved before testing.')}
            </Text>
            <Button
              icon={<LinkOutlined />}
              onClick={() => void handleRunDiagnostics()}
              loading={testingConnection}
              className="diagnostics-btn"
            >
              {l('测试连接', 'Test connection')}
            </Button>
          </div>

          <Card className="diagnostics-card" size="small">
            <div className="diagnostics-card-head">
              <Title level={5} style={{ margin: 0 }}>
                {l('连接诊断', 'Connection diagnostics')}
              </Title>
              {diagnostics?.checkedAt && (
                <Text type="secondary">{l('最近测试', 'Last tested')}: {new Date(diagnostics.checkedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</Text>
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
                  label: l('实际请求地址', 'Resolved endpoint'),
                  children: diagnosticsResolvedEndpoint,
                },
                {
                  key: 'model',
                  label: 'Model',
                  children: diagnosticsModel,
                },
                {
                  key: 'apiKey',
                  label: l('API Key 状态', 'API key status'),
                  children: checkingApiKey ? l('检查中', 'Checking') : apiKeyConfigured ? l('已保存', 'Saved') : l('未保存', 'Not saved'),
                },
              ]}
            />

            {diagnostics ? (
              <div className="diagnostics-results">
                <Alert
                  type={getDiagnosticAlertType(diagnostics.plainChat)}
                  message={diagnostics.plainChat.title}
                  description={renderDiagnosticDescription(diagnostics.plainChat, language)}
                  showIcon
                />
                <Alert
                  type={getDiagnosticAlertType(diagnostics.toolCall)}
                  message={diagnostics.toolCall.title}
                  description={renderDiagnosticDescription(diagnostics.toolCall, language)}
                  showIcon
                />
              </div>
            ) : (
              <Alert
                type="info"
                showIcon
                message={l('还没有运行连接诊断', 'No diagnostics have been run yet')}
                description={l('点击上方“测试连接”后，这里会显示聊天测试和 Tool 调用测试的详细结果。', 'Click “Test connection” above to see detailed plain-chat and tool-call diagnostics here.')}
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
          {saved ? `${t('settings.saved')} ✨` : t('settings.save')}
        </Button>
      </Card>

      <Card className="about-card" style={{ marginTop: 20 }}>
        <div className="about-content">
          <span className="about-emoji">🐛</span>
          <div>
            <Title level={5}>{l('关于猫猫虫饮食小助手', 'About Diet Agent')}</Title>
            <Text type="secondary">
              {l('当前版本聚焦桌面端饮食管理与 AI 对话能力', 'This version focuses on desktop diet tracking and AI chat.')}
              <br />
              {l('菜谱库来源: HowToCook 灵感整理 + 本地扩展中西式菜谱', 'Recipe library: HowToCook-inspired items plus local Chinese and Western additions.')}
            </Text>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default SettingsPage
