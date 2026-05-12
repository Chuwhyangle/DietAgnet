import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  InputNumber,
  Select,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  DeleteOutlined,
  LinkOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import {
  AGENT_PROVIDER_PRESETS,
  type AgentDiagnosticResult,
  type AgentDiagnosticsResponse,
  type AgentProvider,
} from '../../../shared/agent'
import { SETTINGS_UPDATED_EVENT, emitSettingsUpdated } from '../stores/events'
import { getSettings, saveSettings, type Settings } from '../stores/settings'
import './Settings.css'

const { Title, Text, Paragraph } = Typography

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

function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<Settings>(getSettings())
  const [saved, setSaved] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [checkingApiKey, setCheckingApiKey] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [diagnostics, setDiagnostics] = useState<AgentDiagnosticsResponse | null>(null)

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
