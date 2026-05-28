/**
 * PlanDriftCard — displays a plan drift proposal with accept/dismiss actions.
 *
 * Shows drift direction, average drift percentage, and proposed new calorie target.
 * The user can accept the new plan ("采用新计划") or dismiss it ("保持现状").
 *
 * @validates Requirements 7.4, 7.5
 */

import { useState, useCallback } from 'react'
import { Card, Button, Typography, Tag, message } from 'antd'
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  LoadingOutlined,
  ExperimentOutlined,
} from '@ant-design/icons'
import { acceptProposal, dismissProposal } from '../coaching/planDriftMonitor'
import type { PlanAdjustmentProposal } from '../coaching/types'
import { useI18n } from '../i18n'
import './PlanDriftCard.css'

const { Text } = Typography

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlanDriftCardProps {
  proposal: PlanAdjustmentProposal
  onAccepted?: () => void
  onDismissed?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PlanDriftCard({
  proposal,
  onAccepted,
  onDismissed,
}: PlanDriftCardProps): JSX.Element {
  const { language } = useI18n()
  const l = (zh: string, en: string): string => (language === 'zh' ? zh : en)
  const [loading, setLoading] = useState<'accept' | 'dismiss' | null>(null)

  const isOver = proposal.driftDirection === 'over'

  // ---------------------------------------------------------------------------
  // Accept proposal
  // ---------------------------------------------------------------------------

  const handleAccept = useCallback(async () => {
    setLoading('accept')
    try {
      await acceptProposal(proposal.proposedPlan.id!)
      message.success(l('已采用新计划！', 'New plan accepted.'))
      onAccepted?.()
    } catch (err) {
      message.error(l('操作失败，请重试', 'Operation failed. Please try again.'))
    } finally {
      setLoading(null)
    }
  }, [proposal.proposedPlan.id, onAccepted])

  // ---------------------------------------------------------------------------
  // Dismiss proposal
  // ---------------------------------------------------------------------------

  const handleDismiss = useCallback(async () => {
    setLoading('dismiss')
    try {
      await dismissProposal(proposal.proposedPlan.id!)
      message.info(l('已保持现有计划', 'Current plan kept.'))
      onDismissed?.()
    } catch (err) {
      message.error(l('操作失败，请重试', 'Operation failed. Please try again.'))
    } finally {
      setLoading(null)
    }
  }, [proposal.proposedPlan.id, onDismissed])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Card className="plan-drift-card" size="small">
      <div className="plan-drift-header">
        <div className="plan-drift-header-left">
          <ExperimentOutlined style={{ fontSize: 18, color: '#fa8c16' }} />
          <Text strong>{l('计划偏移建议', 'Plan Drift Suggestion')}</Text>
        </div>
        <Tag
          color={isOver ? 'error' : 'success'}
          icon={isOver ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          bordered={false}
        >
          {isOver ? l('偏高', 'High') : l('偏低', 'Low')}
        </Tag>
      </div>

      <div className="plan-drift-body">
        <div className="plan-drift-metrics">
          <div className="plan-drift-metric">
            <Text type="secondary">{l('偏移方向', 'Direction')}</Text>
            <span className="plan-drift-metric-value">
              {isOver ? l('⬆️ 超出', 'Above target') : l('⬇️ 不足', 'Below target')}
            </span>
          </div>
          <div className="plan-drift-metric">
            <Text type="secondary">{l('平均偏移', 'Average drift')}</Text>
            <span className="plan-drift-metric-value">
              {proposal.avgDriftPercent.toFixed(1)}%
            </span>
          </div>
          <div className="plan-drift-metric">
            <Text type="secondary">{l('建议目标', 'Suggested target')}</Text>
            <span className="plan-drift-metric-value">
              {proposal.proposedPlan.dailyCalorieTarget} kcal
            </span>
          </div>
        </div>

        <div className="plan-drift-summary">
          <Text type="secondary">
            {proposal.proposedPlan.summary}
          </Text>
        </div>

        <div className="plan-drift-actions">
          <Button
            onClick={() => void handleDismiss()}
            disabled={loading !== null}
            icon={loading === 'dismiss' ? <LoadingOutlined /> : undefined}
          >
            {l('保持现状', 'Keep current')}
          </Button>
          <Button
            type="primary"
            onClick={() => void handleAccept()}
            disabled={loading !== null}
            icon={loading === 'accept' ? <LoadingOutlined /> : undefined}
          >
            {l('采用新计划', 'Accept new plan')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default PlanDriftCard
