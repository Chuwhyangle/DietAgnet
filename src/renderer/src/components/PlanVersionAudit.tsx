import { useEffect, useMemo, useState } from 'react'
import { Card, Empty, Tag, Typography } from 'antd'
import {
  HistoryOutlined,
  ProfileOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import {
  getPlanGenerationLabel,
  getPlanVersionDiff,
} from '../planning/engine'
import type { PersonalDietPlan } from '../stores/planning'
import './PlanVersionAudit.css'

const { Paragraph, Text, Title } = Typography

interface PlanVersionAuditProps {
  plans: PersonalDietPlan[]
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('zh-CN')
}

function formatVersionLabel(versionNumber: number): string {
  return `V${versionNumber}`
}

function PlanVersionAudit({ plans }: PlanVersionAuditProps): JSX.Element {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(plans[0]?.id ?? null)

  useEffect(() => {
    if (!plans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(plans[0]?.id ?? null)
    }
  }, [plans, selectedPlanId])

  const selectedIndex = useMemo(
    () => plans.findIndex((plan) => plan.id === selectedPlanId),
    [plans, selectedPlanId],
  )
  const selectedPlan = selectedIndex >= 0 ? plans[selectedIndex] : plans[0] ?? null
  const previousPlan = selectedIndex >= 0 && selectedIndex < plans.length - 1 ? plans[selectedIndex + 1] : null
  const diff = selectedPlan ? getPlanVersionDiff(selectedPlan, previousPlan) : null

  return (
    <Card
      className="plan-version-card"
      title="计划版本审计"
      extra={
        <Tag color="processing" bordered={false}>
          共 {plans.length} 版
        </Tag>
      }
    >
      {plans.length === 0 || !selectedPlan ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有可审计的计划版本"
        />
      ) : (
        <div className="plan-version-shell">
          <div className="plan-version-list">
            {plans.map((plan, index) => {
              const versionNumber = plans.length - index
              return (
                <button
                  key={plan.id ?? `${plan.createdAt}-${index}`}
                  type="button"
                  className={`plan-version-item ${plan.id === selectedPlan.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedPlanId(plan.id ?? null)}
                >
                  <div className="plan-version-item-top">
                    <strong>{formatVersionLabel(versionNumber)}</strong>
                    <Tag
                      color={plan.generationMode === 'ai' ? 'success' : 'default'}
                      bordered={false}
                    >
                      {plan.generationMode === 'ai' ? 'AI' : '本地'}
                    </Tag>
                  </div>
                  <Text className="plan-version-item-title">{plan.title}</Text>
                  <Text type="secondary" className="plan-version-item-meta">
                    {formatTimestamp(plan.createdAt)}
                  </Text>
                </button>
              )
            })}
          </div>

          <div className="plan-version-detail">
            <div className="plan-version-detail-head">
              <div>
                <Title level={5} style={{ marginBottom: 4 }}>
                  {selectedPlan.title}
                </Title>
                <Text type="secondary">
                  {formatTimestamp(selectedPlan.createdAt)}
                </Text>
              </div>
              <div className="plan-version-detail-tags">
                <Tag icon={<HistoryOutlined />} color="processing" bordered={false}>
                  {getPlanGenerationLabel(selectedPlan)}
                </Tag>
                {typeof selectedPlan.sourceSessionId === 'number' && (
                  <Tag icon={<ProfileOutlined />} color="default" bordered={false}>
                    会话 #{selectedPlan.sourceSessionId}
                  </Tag>
                )}
              </div>
            </div>

            <div className="plan-version-metrics">
              <div className="plan-version-metric">
                <Text type="secondary">热量</Text>
                <strong>{selectedPlan.dailyCalorieTarget} kcal</strong>
              </div>
              <div className="plan-version-metric">
                <Text type="secondary">蛋白质</Text>
                <strong>{selectedPlan.proteinTarget} g</strong>
              </div>
              <div className="plan-version-metric">
                <Text type="secondary">碳水</Text>
                <strong>{selectedPlan.carbsTarget} g</strong>
              </div>
              <div className="plan-version-metric">
                <Text type="secondary">脂肪</Text>
                <strong>{selectedPlan.fatTarget} g</strong>
              </div>
            </div>

            <Paragraph className="plan-version-summary">
              {selectedPlan.summary}
            </Paragraph>

            <div className="plan-version-detail-block">
              <Text strong>关键提醒</Text>
              {selectedPlan.cautionNotes.length > 0 ? (
                <div className="plan-version-note-list">
                  {selectedPlan.cautionNotes.map((item) => (
                    <div key={item} className="plan-version-note-item">
                      <span>•</span>
                      <Text>{item}</Text>
                    </div>
                  ))}
                </div>
              ) : (
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  当前版本没有额外提醒。
                </Paragraph>
              )}
            </div>

            <div className="plan-version-detail-block">
              <div className="plan-version-compare-head">
                <Text strong>版本差异</Text>
                {previousPlan && (
                  <Tag icon={<SwapOutlined />} color="warning" bordered={false}>
                    相比 {formatVersionLabel(plans.length - (selectedIndex + 1))}
                  </Tag>
                )}
              </div>

              {diff ? (
                <>
                  <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    {diff.summary}
                  </Paragraph>

                  {diff.metricChanges.length > 0 && (
                    <div className="plan-version-change-group">
                      <Text strong>目标调整</Text>
                      <div className="plan-version-change-tags">
                        {diff.metricChanges.map((change) => (
                          <Tag
                            key={change.key}
                            color={change.delta > 0 ? 'success' : 'error'}
                            bordered={false}
                          >
                            {change.label}
                            {change.delta > 0 ? ' +' : ' '}
                            {change.delta}
                            {change.unit}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  )}

                  {diff.profileChanges.length > 0 && (
                    <div className="plan-version-change-group">
                      <Text strong>档案变更</Text>
                      <div className="plan-version-profile-list">
                        {diff.profileChanges.map((change) => (
                          <div key={change.key} className="plan-version-profile-item">
                            <Text className="plan-version-profile-label">{change.label}</Text>
                            <Text type="secondary">{change.previous}</Text>
                            <span className="plan-version-profile-arrow">→</span>
                            <Text strong>{change.current}</Text>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {diff.metricChanges.length === 0 && diff.profileChanges.length === 0 && (
                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      当前版本和上一版在结构化目标上没有变化，主要差异集中在文案表达与提醒补充。
                    </Paragraph>
                  )}
                </>
              ) : (
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  这是当前可追溯的首个计划版本，后续每次重新生成都会在这里留下可比对记录。
                </Paragraph>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

export default PlanVersionAudit
