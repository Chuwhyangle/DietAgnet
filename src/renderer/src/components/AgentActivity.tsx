import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, Space, Tag, Typography, message } from 'antd'
import { ClockCircleOutlined, RobotOutlined, ThunderboltOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { evaluateSchedulerTick } from '../coaching/reminderScheduler'
import {
  DIET_LOG_UPDATED_EVENT,
  PLANNING_UPDATED_EVENT,
  SETTINGS_UPDATED_EVENT,
} from '../stores/events'
import {
  getLatestDailyPlanAdjustment,
  getRecentProactiveEvents,
  updateDailyPlanAdjustmentResponse,
  updateProactiveEventResponse,
  type DailyPlanAdjustment,
  type DailyPlanAdjustmentResponse,
  type ProactiveEvent,
} from '../stores/planning'
import { useI18n } from '../i18n'
import './AgentActivity.css'

const { Text, Title, Paragraph } = Typography

type ActivityItem =
  | {
    kind: 'event'
    id: string
    timestamp: string
    ruleId: string
    message: string
    userResponse?: string
    payload: Record<string, unknown>
    event: ProactiveEvent
  }
  | {
    kind: 'adjustment'
    id: string
    timestamp: string
    ruleId: string
    message: string
    userResponse?: string
    payload: Record<string, unknown>
    adjustment: DailyPlanAdjustment
  }

function getTodayDateString(): string {
  return dayjs().format('YYYY-MM-DD')
}

function formatTimestamp(value: string): string {
  return dayjs(value).format('MM-DD HH:mm')
}

function getRuleTone(item: ActivityItem): string {
  if (item.userResponse === 'accepted') {
    return 'success'
  }

  if (item.userResponse === 'dismissed') {
    return 'default'
  }

  if (item.kind === 'event' && item.event.delivered === false) {
    return 'default'
  }

  if (item.kind === 'adjustment' && item.adjustment.suggestionType === 'reduce') {
    return 'blue'
  }

  if (item.kind === 'adjustment' && item.adjustment.suggestionType === 'supplement') {
    return 'orange'
  }

  return 'processing'
}

function compactPayload(payload: Record<string, unknown>): string {
  const keys = [
    'checkedRuleId',
    'reason',
    'skipReason',
    'mealType',
    'mealLabel',
    'dismissCount',
    'deltaCalories',
    'plannedCalories',
    'actualCalories',
    'cooldownUntil',
    'pauseUntil',
  ]

  const compact = keys.reduce<Record<string, unknown>>((nextPayload, key) => {
    const value = payload[key]
    if (value !== undefined && value !== null && value !== '') {
      nextPayload[key] = value
    }
    return nextPayload
  }, {})

  if (Object.keys(compact).length === 0) {
    return 'no payload'
  }

  return JSON.stringify(compact)
}

function eventTargetPath(event: ProactiveEvent): string {
  if (event.ruleId.includes('meal') || event.ruleId.includes('reminder')) {
    return '/diet-log'
  }

  if (event.ruleId.includes('checkin')) {
    return '/'
  }

  return '/chat'
}

export default function AgentActivity(): JSX.Element {
  const navigate = useNavigate()
  const { language } = useI18n()
  const l = (zh: string, en: string): string => (language === 'zh' ? zh : en)
  const [events, setEvents] = useState<ProactiveEvent[]>([])
  const [latestAdjustment, setLatestAdjustment] = useState<DailyPlanAdjustment | null>(null)
  const [running, setRunning] = useState(false)

  const syncActivity = useCallback(async (): Promise<void> => {
    const [recentEvents, adjustment] = await Promise.all([
      getRecentProactiveEvents(10),
      getLatestDailyPlanAdjustment(getTodayDateString()),
    ])

    setEvents(recentEvents)
    setLatestAdjustment(adjustment)
  }, [])

  useEffect(() => {
    void syncActivity()

    const handleSync = (): void => {
      void syncActivity()
    }

    window.addEventListener(PLANNING_UPDATED_EVENT, handleSync)
    window.addEventListener(DIET_LOG_UPDATED_EVENT, handleSync)
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSync)

    return () => {
      window.removeEventListener(PLANNING_UPDATED_EVENT, handleSync)
      window.removeEventListener(DIET_LOG_UPDATED_EVENT, handleSync)
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSync)
    }
  }, [syncActivity])

  const activityItems = useMemo<ActivityItem[]>(() => {
    const eventItems = events.map<ActivityItem>((event) => ({
      kind: 'event',
      id: `event-${event.id ?? event.firedAt}-${event.ruleId}`,
      timestamp: event.firedAt,
      ruleId: event.ruleId,
      message: event.message,
      userResponse: event.userResponse,
      payload: event.payload ?? {},
      event,
    }))

    const adjustmentItems = latestAdjustment
      ? [{
        kind: 'adjustment' as const,
        id: `adjustment-${latestAdjustment.id ?? latestAdjustment.createdAt}`,
        timestamp: latestAdjustment.createdAt,
        ruleId: latestAdjustment.ruleId,
        message: latestAdjustment.suggestionText,
        userResponse: latestAdjustment.userResponse,
        payload: {
          mealType: latestAdjustment.mealType,
          suggestionType: latestAdjustment.suggestionType,
          plannedCalories: latestAdjustment.plannedCalories,
          actualCalories: latestAdjustment.actualCalories,
          deltaCalories: latestAdjustment.deltaCalories,
        },
        adjustment: latestAdjustment,
      }]
      : []

    return [...adjustmentItems, ...eventItems]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 10)
  }, [events, latestAdjustment])

  const handleRunCheckNow = async (): Promise<void> => {
    setRunning(true)
    try {
      const result = await evaluateSchedulerTick()
      await syncActivity()
      if (result.fired) {
        message.success(`Agent triggered ${result.ruleId}`)
      } else {
        message.info(`Agent check: ${result.reason}`)
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Agent check failed')
    } finally {
      setRunning(false)
    }
  }

  const handleAdjustmentResponse = async (
    adjustment: DailyPlanAdjustment,
    response: DailyPlanAdjustmentResponse,
  ): Promise<void> => {
    if (!adjustment.id) {
      return
    }

    const updated = await updateDailyPlanAdjustmentResponse(adjustment.id, response)
    if (updated) {
      setLatestAdjustment(updated)
      message.success(`Adjustment ${response}`)
    }
  }

  const handleOpenEvent = async (event: ProactiveEvent): Promise<void> => {
    if (event.id) {
      await updateProactiveEventResponse(event.id, 'accepted')
    }
    navigate(eventTargetPath(event))
  }

  return (
    <Card className="agent-activity-card">
      <div className="agent-activity-header">
        <div>
          <Tag icon={<RobotOutlined />} color="processing" bordered={false}>
            Agent Activity
          </Tag>
          <Title level={4} className="agent-activity-title">Agent Inbox</Title>
          <Text type="secondary">
            {l(
              '最近的主动提醒、跳过原因和动态计划建议都会留在这里，方便演示闭环。',
              'Recent proactive reminders, skipped reasons, and dynamic plan suggestions are collected here.',
            )}
          </Text>
        </div>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={running}
          onClick={() => void handleRunCheckNow()}
        >
          Run Agent Check Now
        </Button>
      </div>

      {activityItems.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={l('还没有 Agent 活动。可以手动运行一次检查。', 'No Agent activity yet. You can run a manual check.')}
        />
      ) : (
        <div className="agent-activity-list">
          {activityItems.map((item) => (
            <div key={item.id} className="agent-activity-item">
              <div className="agent-activity-item-head">
                <Space size={8} wrap>
                  <Tag color={getRuleTone(item)} bordered={false}>
                    {item.kind === 'event' ? 'proactive event' : item.adjustment.suggestionType}
                  </Tag>
                  <Text strong>{item.ruleId}</Text>
                </Space>
                <Text type="secondary" className="agent-activity-time">
                  <ClockCircleOutlined /> {formatTimestamp(item.timestamp)}
                </Text>
              </div>

              <Paragraph className="agent-activity-message">
                {item.message}
              </Paragraph>

              <div className="agent-activity-payload">
                <Text type="secondary">{compactPayload(item.payload)}</Text>
              </div>

              <div className="agent-activity-actions">
                {item.userResponse && (
                  <Tag bordered={false}>{l('用户响应', 'userResponse')}: {item.userResponse}</Tag>
                )}

                {item.kind === 'adjustment' && !item.adjustment.userResponse && (
                  <Space size={8} wrap>
                    <Button size="small" type="primary" onClick={() => void handleAdjustmentResponse(item.adjustment, 'accepted')}>
                      {l('采纳', 'accept')}
                    </Button>
                    <Button size="small" onClick={() => void handleAdjustmentResponse(item.adjustment, 'snoozed')}>
                      {l('稍后', 'snooze')}
                    </Button>
                    <Button size="small" onClick={() => void handleAdjustmentResponse(item.adjustment, 'dismissed')}>
                      {l('忽略', 'dismiss')}
                    </Button>
                  </Space>
                )}

                {item.kind === 'event' && item.event.delivered && !item.event.userResponse && (
                  <Button size="small" onClick={() => void handleOpenEvent(item.event)}>
                    {l('打开', 'open')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
