import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, Row, Statistic, Tag, Typography } from 'antd'
import {
  BookOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CoffeeOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import PlanBuilder from '../components/PlanBuilder'
import PlanVersionAudit from '../components/PlanVersionAudit'
import { recipes } from '../data/recipes'
import { getTodayLog, summarizeDietLog, type DietLog } from '../stores/dietLog'
import {
  getCurrentPlanningProfile,
  getLatestActivePlanningSession,
  getLatestPersonalDietPlan,
  getRecentPersonalDietPlans,
  type PersonalDietPlan,
  type PlanningProfile,
  type PlanningSession,
} from '../stores/planning'
import { getSettings } from '../stores/settings'
import {
  DIET_LOG_UPDATED_EVENT,
  PLANNING_UPDATED_EVENT,
  SETTINGS_UPDATED_EVENT,
} from '../stores/events'
import { getPlanningProgress, summarizePlanningProfile } from '../planning/engine'
import './Home.css'

const { Title, Text, Paragraph } = Typography

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了，猫猫虫要睡觉啦 🌙'
  if (hour < 9) return '早上好呀！今天想吃什么早餐呢？🌅'
  if (hour < 11) return '上午好！记得喝杯水哦 💧'
  if (hour < 13) return '午饭时间到！猫猫虫饿饿了 🍱'
  if (hour < 17) return '下午好～来杯下午茶吧 🍵'
  if (hour < 19) return '晚饭时间！今天做点好吃的吧 🍲'
  return '晚上好～明天也要好好吃饭哦 🌟'
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return '尚未保存'
  }

  return new Date(value).toLocaleString('zh-CN')
}

function getPlanningActionLabel(params: {
  activeSession: PlanningSession | null
  latestPlan: PersonalDietPlan | null
  progressPercent: number
  completedCount: number
  totalCount: number
}): string {
  if (params.activeSession) {
    return '继续制定计划'
  }

  if (params.completedCount > 0 && params.completedCount < params.totalCount) {
    return '继续完善资料'
  }

  if (params.latestPlan) {
    return '重新制定计划'
  }

  if (params.progressPercent >= 100) {
    return '重新确认档案'
  }

  return '开始制定计划'
}

function HomePage(): JSX.Element {
  const [nickname, setNickname] = useState('小可爱')
  const [todayLog, setTodayLog] = useState<DietLog | null>(null)
  const [planningProfile, setPlanningProfile] = useState<PlanningProfile | null>(null)
  const [activePlanningSession, setActivePlanningSession] = useState<PlanningSession | null>(null)
  const [latestPlan, setLatestPlan] = useState<PersonalDietPlan | null>(null)
  const [recentPlans, setRecentPlans] = useState<PersonalDietPlan[]>([])
  const [planBuilderOpen, setPlanBuilderOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    const syncPageData = async (): Promise<void> => {
      const settings = getSettings()
      const [profile, activeSession, plan, plans] = await Promise.all([
        getCurrentPlanningProfile(),
        getLatestActivePlanningSession(),
        getLatestPersonalDietPlan(),
        getRecentPersonalDietPlans(6),
      ])

      if (!mounted) {
        return
      }

      setNickname(settings.nickname || '小可爱')
      setTodayLog(getTodayLog())
      setPlanningProfile(profile)
      setActivePlanningSession(activeSession)
      setLatestPlan(plan)
      setRecentPlans(plans)
    }

    const handleSync = (): void => {
      void syncPageData()
    }

    void syncPageData()
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSync)
    window.addEventListener(DIET_LOG_UPDATED_EVENT, handleSync)
    window.addEventListener(PLANNING_UPDATED_EVENT, handleSync)

    return () => {
      mounted = false
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSync)
      window.removeEventListener(DIET_LOG_UPDATED_EVENT, handleSync)
      window.removeEventListener(PLANNING_UPDATED_EVENT, handleSync)
    }
  }, [])

  const nutritionSummary = summarizeDietLog(todayLog)
  const planningProgress = useMemo(
    () => getPlanningProgress(planningProfile ?? {}, activePlanningSession?.completedStepKeys ?? []),
    [planningProfile, activePlanningSession?.completedStepKeys],
  )
  const profileSummaryItems = useMemo(
    () => summarizePlanningProfile(planningProfile ?? {}).slice(0, 6),
    [planningProfile],
  )
  const planningActionLabel = getPlanningActionLabel({
    activeSession: activePlanningSession,
    latestPlan,
    progressPercent: planningProgress.percent,
    completedCount: planningProgress.completedCount,
    totalCount: planningProgress.totalCount,
  })

  return (
    <div className="home-page">
      <div className="welcome-card">
        <div className="welcome-emoji">🐛✨</div>
        <Title level={3} className="welcome-title">
          {nickname}，{getGreeting()}
        </Title>
        <Text type="secondary">猫猫虫陪你一起管理饮食，健康每一天~</Text>
      </div>

      <Card className="planning-hero-card" style={{ marginTop: 24 }}>
        <div className="planning-hero-content">
          <div className="planning-hero-main">
            <Tag color="gold" bordered={false}>主线功能</Tag>
            <Title level={3} className="planning-hero-title">
              让 AI 一步一步帮你制定专属饮食计划
            </Title>
            <Paragraph type="secondary" className="planning-hero-description">
              从体重、身高、目标到作息偏好，猫猫虫会逐项采集并落到本地数据库。
              如果数据出现异常或前后不一致，它会继续追问，直到得到可用档案。
            </Paragraph>

            <div className="planning-hero-badges">
              <span className="planning-badge">本地落库</span>
              <span className="planning-badge">异常追问</span>
              <span className="planning-badge">阶段可审计</span>
            </div>

            <div className="planning-hero-actions">
              <Button
                type="primary"
                size="large"
                icon={<RobotOutlined />}
                onClick={() => setPlanBuilderOpen(true)}
              >
                {planningActionLabel}
              </Button>
              <Text type="secondary">
                当前已确认 {planningProgress.completedCount}/{planningProgress.totalCount} 项资料
              </Text>
            </div>
          </div>

          <div className="planning-hero-side">
            <div className="planning-metric-box">
              <Text type="secondary">资料完成度</Text>
              <strong>{planningProgress.percent}%</strong>
            </div>
            <div className="planning-metric-box">
              <Text type="secondary">待确认异常</Text>
              <strong>{activePlanningSession?.pendingFollowUps?.length ?? 0}</strong>
            </div>
            <div className="planning-metric-box">
              <Text type="secondary">最近保存</Text>
              <strong>{activePlanningSession ? formatTimestamp(activePlanningSession.updatedAt) : '暂无进行中会话'}</strong>
            </div>
          </div>
        </div>
      </Card>

      <Row gutter={[20, 20]} style={{ marginTop: 24 }}>
        <Col xs={24} md={8}>
          <Card className="stat-card stat-card-pink" hoverable>
            <Statistic
              title="🔥 今日卡路里"
              value={nutritionSummary.calories}
              suffix="kcal"
              prefix={<FireOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="stat-card stat-card-mint" hoverable>
            <Statistic
              title="🍽️ 今日已记录"
              value={nutritionSummary.mealCount}
              suffix="餐"
              prefix={<CoffeeOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="stat-card stat-card-lavender" hoverable>
            <Statistic
              title="📖 可用菜谱"
              value={recipes.length}
              suffix="道"
              prefix={<BookOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[20, 20]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={11}>
          <Card className="planning-detail-card" title="当前档案状态">
            <div className="planning-status-tags">
              {activePlanningSession ? (
                <Tag color="processing" icon={<ClockCircleOutlined />} bordered={false}>
                  有一轮正在采集中
                </Tag>
              ) : (
                <Tag color="default" icon={<ClockCircleOutlined />} bordered={false}>
                  当前没有进行中的采集
                </Tag>
              )}
              {planningProgress.completedCount > 0 && (
                <Tag color="success" icon={<CheckCircleOutlined />} bordered={false}>
                  已保存到本地数据库
                </Tag>
              )}
              {(activePlanningSession?.pendingFollowUps?.length ?? 0) > 0 && (
                <Tag color="warning" icon={<ExclamationCircleOutlined />} bordered={false}>
                  {activePlanningSession?.pendingFollowUps.length} 项异常待确认
                </Tag>
              )}
            </div>

            {profileSummaryItems.length > 0 ? (
              <div className="planning-summary-list">
                {profileSummaryItems.map((item) => (
                  <div key={item.label} className="planning-summary-item">
                    <Text type="secondary">{item.label}</Text>
                    <Text strong>{item.value}</Text>
                  </div>
                ))}
              </div>
            ) : (
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                还没有建立用户档案。点击上方主线入口后，猫猫虫会从年龄、身高、体重开始逐步问你。
              </Paragraph>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={13}>
          <Card className="planning-detail-card" title="最新专属计划">
            {latestPlan ? (
              <div className="latest-plan-panel">
                <div className="latest-plan-head">
                  <div>
                    <Title level={5} style={{ marginBottom: 4 }}>{latestPlan.title}</Title>
                    <Text type="secondary">生成时间：{formatTimestamp(latestPlan.createdAt)}</Text>
                  </div>
                  <Tag color={latestPlan.generationMode === 'ai' ? 'success' : 'default'} bordered={false}>
                    {latestPlan.generationMode === 'ai' ? '模型生成' : '本地模板'}
                  </Tag>
                </div>

                <div className="latest-plan-metrics">
                  <div className="latest-plan-metric">
                    <Text type="secondary">热量</Text>
                    <strong>{latestPlan.dailyCalorieTarget} kcal</strong>
                  </div>
                  <div className="latest-plan-metric">
                    <Text type="secondary">蛋白质</Text>
                    <strong>{latestPlan.proteinTarget} g</strong>
                  </div>
                  <div className="latest-plan-metric">
                    <Text type="secondary">碳水</Text>
                    <strong>{latestPlan.carbsTarget} g</strong>
                  </div>
                  <div className="latest-plan-metric">
                    <Text type="secondary">脂肪</Text>
                    <strong>{latestPlan.fatTarget} g</strong>
                  </div>
                </div>

                <Paragraph className="latest-plan-summary">{latestPlan.summary}</Paragraph>

                <div className="latest-plan-guidance">
                  {latestPlan.mealGuidance.slice(0, 3).map((item) => (
                    <div key={item} className="latest-plan-guidance-item">
                      <span>•</span>
                      <Text>{item}</Text>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                还没有生成专属计划。完成首页主线采集后，这里会展示最新的热量目标、宏量营养建议和执行提醒。
              </Paragraph>
            )}
          </Card>
        </Col>
      </Row>

      <div style={{ marginTop: 24 }}>
        <PlanVersionAudit plans={recentPlans} />
      </div>

      <Card className="tip-card" style={{ marginTop: 24 }}>
        <div className="tip-content">
          <span className="tip-emoji">🐾</span>
          <div>
            <Text strong>猫猫虫小贴士</Text>
            <br />
            <Text type="secondary">
              饮食计划先求稳定，再求完美。先把真实资料录完整，再慢慢微调，执行起来会更稳。
            </Text>
          </div>
        </div>
      </Card>

      <PlanBuilder open={planBuilderOpen} onClose={() => setPlanBuilderOpen(false)} />
    </div>
  )
}

export default HomePage
