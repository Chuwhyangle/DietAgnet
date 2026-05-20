import { useEffect, useState } from 'react'
import { Button, Card, Tag, Typography } from 'antd'
import { BellOutlined, CloseOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  updateProactiveEventResponse,
  type ProactiveEvent,
} from '../stores/planning'
import {
  DIET_LOG_UPDATED_EVENT,
  PLANNING_UPDATED_EVENT,
  SETTINGS_UPDATED_EVENT,
} from '../stores/events'
import { checkProactiveReminder, getSnoozeUntil, type ProactiveReminder as ProactiveReminderModel } from './rules'
import './ProactiveReminder.css'

const { Text } = Typography

function getRuleLabel(event: ProactiveEvent): string {
  switch (event.ruleId) {
    case 'breakfast_check':
      return '早餐提醒'
    case 'lunch_check':
      return '午餐提醒'
    case 'dinner_check':
      return '晚餐提醒'
    case 'weekly_report':
      return '周报提醒'
    case 'open_app_plandrift':
      return '计划偏移'
    case 'overcalorie_streak':
      return '连续偏高'
    default:
      return '主动提醒'
  }
}

function ProactiveReminder(): JSX.Element | null {
  const navigate = useNavigate()
  const [reminder, setReminder] = useState<ProactiveReminderModel | null>(null)
  const [notifiedEventId, setNotifiedEventId] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    let timer: number | undefined

    const checkReminder = async (): Promise<void> => {
      const nextReminder = await checkProactiveReminder()
      if (mounted && nextReminder) {
        setReminder(nextReminder)
      }
    }

    void checkReminder()
    timer = window.setInterval(() => {
      void checkReminder()
    }, 10 * 60 * 1000)

    window.addEventListener(DIET_LOG_UPDATED_EVENT, checkReminder)
    window.addEventListener(SETTINGS_UPDATED_EVENT, checkReminder)
    window.addEventListener(PLANNING_UPDATED_EVENT, checkReminder)

    return () => {
      mounted = false
      if (timer) {
        window.clearInterval(timer)
      }
      window.removeEventListener(DIET_LOG_UPDATED_EVENT, checkReminder)
      window.removeEventListener(SETTINGS_UPDATED_EVENT, checkReminder)
      window.removeEventListener(PLANNING_UPDATED_EVENT, checkReminder)
    }
  }, [])

  useEffect(() => {
    if (!reminder?.event.id || notifiedEventId === reminder.event.id) {
      return
    }

    setNotifiedEventId(reminder.event.id)
    void window.agent.showNotification({
      title: reminder.title,
      body: reminder.message,
      urgency: reminder.event.priority === 'high' ? 'critical' : 'normal',
    }).catch((error) => {
      console.error('Failed to show proactive notification:', error)
    })
  }, [notifiedEventId, reminder])

  if (!reminder) {
    return null
  }

  const handleOpen = async (): Promise<void> => {
    if (reminder.event.id) {
      await updateProactiveEventResponse(reminder.event.id, 'opened_chat')
    }
    setReminder(null)
    navigate(reminder.page === 'diet-log' ? '/diet-log' : reminder.page === 'chat' ? '/chat' : '/')
  }

  const handleSnooze = async (): Promise<void> => {
    if (reminder.event.id) {
      await updateProactiveEventResponse(reminder.event.id, 'snoozed', getSnoozeUntil())
    }
    setReminder(null)
  }

  const handleDismiss = async (): Promise<void> => {
    if (reminder.event.id) {
      await updateProactiveEventResponse(reminder.event.id, 'dismissed')
    }
    setReminder(null)
  }

  return (
    <Card className="proactive-reminder-card">
      <div className="proactive-reminder-head">
        <Tag icon={<BellOutlined />} color="processing" bordered={false}>
          {getRuleLabel(reminder.event)}
        </Tag>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={() => void handleDismiss()}
          aria-label="关闭提醒"
        />
      </div>

      <div className="proactive-reminder-body">
        <strong>{reminder.title}</strong>
        <Text type="secondary">{reminder.message}</Text>
      </div>

      <div className="proactive-reminder-actions">
        <Button type="primary" size="small" onClick={() => void handleOpen()}>
          {reminder.actionLabel}
        </Button>
        <Button
          size="small"
          icon={<ClockCircleOutlined />}
          onClick={() => void handleSnooze()}
        >
          稍后
        </Button>
      </div>
    </Card>
  )
}

export default ProactiveReminder
