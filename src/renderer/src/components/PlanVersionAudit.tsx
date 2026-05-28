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
import { useI18n } from '../i18n'
import './PlanVersionAudit.css'

const { Paragraph, Text, Title } = Typography

interface PlanVersionAuditProps {
  plans: PersonalDietPlan[]
}

function formatTimestamp(value: string, language: 'en' | 'zh'): string {
  return new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
}

function formatVersionLabel(versionNumber: number): string {
  return `V${versionNumber}`
}

function PlanVersionAudit({ plans }: PlanVersionAuditProps): JSX.Element {
  const { language } = useI18n()
  const l = (zh: string, en: string): string => (language === 'zh' ? zh : en)
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
  const diff = selectedPlan ? getPlanVersionDiff(selectedPlan, previousPlan, language) : null

  return (
    <Card
      className="plan-version-card"
      title={l('计划版本审计', 'Plan Version Audit')}
      extra={
        <Tag color="processing" bordered={false}>
          {l('共', '')} {plans.length} {l('版', plans.length === 1 ? 'version' : 'versions')}
        </Tag>
      }
    >
      {plans.length === 0 || !selectedPlan ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={l('还没有可审计的计划版本', 'No auditable plan versions yet')}
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
                      {plan.generationMode === 'ai' ? 'AI' : l('本地', 'Local')}
                    </Tag>
                  </div>
                  <Text className="plan-version-item-title">{plan.title}</Text>
                  <Text type="secondary" className="plan-version-item-meta">
                    {formatTimestamp(plan.createdAt, language)}
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
                  {formatTimestamp(selectedPlan.createdAt, language)}
                </Text>
              </div>
              <div className="plan-version-detail-tags">
                <Tag icon={<HistoryOutlined />} color="processing" bordered={false}>
                  {getPlanGenerationLabel(selectedPlan, language)}
                </Tag>
                {typeof selectedPlan.sourceSessionId === 'number' && (
                  <Tag icon={<ProfileOutlined />} color="default" bordered={false}>
                    {l('会话', 'Session')} #{selectedPlan.sourceSessionId}
                  </Tag>
                )}
              </div>
            </div>

            <div className="plan-version-metrics">
              <div className="plan-version-metric">
                <Text type="secondary">{l('热量', 'Calories')}</Text>
                <strong>{selectedPlan.dailyCalorieTarget} kcal</strong>
              </div>
              <div className="plan-version-metric">
                <Text type="secondary">{l('蛋白质', 'Protein')}</Text>
                <strong>{selectedPlan.proteinTarget} g</strong>
              </div>
              <div className="plan-version-metric">
                <Text type="secondary">{l('碳水', 'Carbs')}</Text>
                <strong>{selectedPlan.carbsTarget} g</strong>
              </div>
              <div className="plan-version-metric">
                <Text type="secondary">{l('脂肪', 'Fat')}</Text>
                <strong>{selectedPlan.fatTarget} g</strong>
              </div>
            </div>

            <Paragraph className="plan-version-summary">
              {selectedPlan.summary}
            </Paragraph>

            <div className="plan-version-detail-block">
              <Text strong>{l('关键提醒', 'Key Cautions')}</Text>
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
                  {l('当前版本没有额外提醒。', 'This version has no extra cautions.')}
                </Paragraph>
              )}
            </div>

            <div className="plan-version-detail-block">
              <div className="plan-version-compare-head">
                <Text strong>{l('版本差异', 'Version Changes')}</Text>
                {previousPlan && (
                  <Tag icon={<SwapOutlined />} color="warning" bordered={false}>
                    {l('相比', 'Compared with')} {formatVersionLabel(plans.length - (selectedIndex + 1))}
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
                      <Text strong>{l('目标调整', 'Target Changes')}</Text>
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
                      <Text strong>{l('档案变更', 'Profile Changes')}</Text>
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
                      {l(
                        '当前版本和上一版在结构化目标上没有变化，主要差异集中在文案表达与提醒补充。',
                        'This version has no structured target changes from the previous one; differences are mainly wording and reminder details.',
                      )}
                    </Paragraph>
                  )}
                </>
              ) : (
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {l(
                    '这是当前可追溯的首个计划版本，后续每次重新生成都会在这里留下可比对记录。',
                    'This is the first traceable plan version. Future regenerations will leave comparable records here.',
                  )}
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
