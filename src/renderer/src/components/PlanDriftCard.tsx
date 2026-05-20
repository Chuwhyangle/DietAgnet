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
  const [loading, setLoading] = useState<'accept' | 'dismiss' | null>(null)

  const isOver = proposal.driftDirection === 'over'

  // ---------------------------------------------------------------------------
  // Accept proposal
  // ---------------------------------------------------------------------------

  const handleAccept = useCallback(async () => {
    setLoading('accept')
    try {
      await acceptProposal(proposal.proposedPlan.id!)
      message.success('已采用新计划！')
      onAccepted?.()
    } catch (err) {
      message.error('操作失败，请重试')
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
      message.info('已保持现有计划')
      onDismissed?.()
    } catch (err) {
      message.error('操作失败，请重试')
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
          <Text strong>计划偏移建议</Text>
        </div>
        <Tag
          color={isOver ? 'error' : 'success'}
          icon={isOver ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          bordered={false}
        >
          {isOver ? '偏高' : '偏低'}
        </Tag>
      </div>

      <div className="plan-drift-body">
        <div className="plan-drift-metrics">
          <div className="plan-drift-metric">
            <Text type="secondary">偏移方向</Text>
            <span className="plan-drift-metric-value">
              {isOver ? '⬆️ 超出' : '⬇️ 不足'}
            </span>
          </div>
          <div className="plan-drift-metric">
            <Text type="secondary">平均偏移</Text>
            <span className="plan-drift-metric-value">
              {proposal.avgDriftPercent.toFixed(1)}%
            </span>
          </div>
          <div className="plan-drift-metric">
            <Text type="secondary">建议目标</Text>
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
            保持现状
          </Button>
          <Button
            type="primary"
            onClick={() => void handleAccept()}
            disabled={loading !== null}
            icon={loading === 'accept' ? <LoadingOutlined /> : undefined}
          >
            采用新计划
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default PlanDriftCard
