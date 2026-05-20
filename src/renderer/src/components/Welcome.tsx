import { useState } from 'react'
import { Button, Input, Typography } from 'antd'
import {
  ArrowRightOutlined,
  BookOutlined,
  EditOutlined,
  RobotOutlined,
  SmileOutlined,
  ThunderboltOutlined,
  FormOutlined,
} from '@ant-design/icons'
import { getSettings, saveSettings } from '../stores/settings'
import './Welcome.css'

const { Title, Text, Paragraph } = Typography

interface WelcomeProps {
  onFinish: () => void
}

const TOTAL_STEPS = 3

const featureCards = [
  {
    icon: <EditOutlined />,
    color: '#FFB6C1',
    title: '记录饮食',
    description: '轻松记录每日三餐和加餐，自动计算卡路里与营养',
  },
  {
    icon: <BookOutlined />,
    color: '#B8E8D0',
    title: '浏览菜谱',
    description: '130 道中西式菜谱随时查看，包含食材、步骤和营养信息',
  },
  {
    icon: <RobotOutlined />,
    color: '#E8D5F5',
    title: 'AI 专属计划',
    description: '猫猫虫逐步采集你的资料，生成个性化饮食建议',
  },
]

function Welcome({ onFinish }: WelcomeProps): JSX.Element {
  const [step, setStep] = useState(0)
  const [nickname, setNickname] = useState('')

  const handleNext = (): void => {
    if (step === 1 && nickname.trim()) {
      const settings = getSettings()
      saveSettings({ ...settings, nickname: nickname.trim() })
    }

    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1)
    } else {
      const settings = getSettings()
      saveSettings({ ...settings, onboarded: true })
      onFinish()
    }
  }

  const handleSkip = (): void => {
    const settings = getSettings()
    saveSettings({ ...settings, onboarded: true })
    onFinish()
  }

  const handleExpressOnboarding = (): void => {
    const settings = getSettings()
    saveSettings({ ...settings, onboarded: true })
    window.location.hash = '#/express-onboarding'
    onFinish()
  }

  const handleFullOnboarding = (): void => {
    const settings = getSettings()
    saveSettings({ ...settings, onboarded: true })
    window.location.hash = '#/chat'
    onFinish()
  }

  return (
    <div className="welcome-overlay">
      <div className="welcome-backdrop" />

      <div className="welcome-container">
        <div className="welcome-progress">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <div
              key={index}
              className={`welcome-progress-dot ${index === step ? 'is-active' : ''} ${index < step ? 'is-done' : ''}`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="welcome-step welcome-step-hello">
            <div className="welcome-mascot">
              <span className="welcome-mascot-emoji">🐛</span>
              <span className="welcome-mascot-sparkle welcome-sparkle-1">✨</span>
              <span className="welcome-mascot-sparkle welcome-sparkle-2">🌟</span>
              <span className="welcome-mascot-sparkle welcome-sparkle-3">💫</span>
            </div>

            <Title level={2} className="welcome-step-title">
              你好呀，欢迎来到猫猫虫的小窝！
            </Title>
            <Paragraph className="welcome-step-description">
              我是猫猫虫，你的饮食小助手。
              <br />
              我会陪你记录每天的饮食，帮你吃得更健康，更开心~
            </Paragraph>

            <Button
              type="primary"
              size="large"
              icon={<ArrowRightOutlined />}
              onClick={handleNext}
              className="welcome-main-btn"
            >
              认识一下
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="welcome-step welcome-step-nickname">
            <div className="welcome-step-icon-wrapper">
              <SmileOutlined className="welcome-step-icon" />
            </div>

            <Title level={3} className="welcome-step-title">
              猫猫虫该怎么称呼你呢？
            </Title>
            <Paragraph className="welcome-step-description">
              给自己起一个可爱的昵称吧，之后随时可以在设置页修改哦
            </Paragraph>

            <Input
              placeholder="输入你的昵称..."
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={20}
              className="welcome-nickname-input"
              onPressEnter={handleNext}
              autoFocus
            />

            <div className="welcome-step-actions">
              <Button
                type="primary"
                size="large"
                icon={<ArrowRightOutlined />}
                onClick={handleNext}
                className="welcome-main-btn"
                disabled={!nickname.trim()}
              >
                就叫这个！
              </Button>
              <Button type="text" onClick={handleNext} className="welcome-skip-link">
                先跳过，之后再设
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="welcome-step welcome-step-features">
            <Title level={3} className="welcome-step-title">
              猫猫虫能帮你做这些事 🐾
            </Title>
            <Paragraph className="welcome-step-description">
              三个核心能力，让健康饮食变得简单
            </Paragraph>

            <div className="welcome-features-grid">
              {featureCards.map((card) => (
                <div key={card.title} className="welcome-feature-card">
                  <div
                    className="welcome-feature-icon"
                    style={{ background: `${card.color}33`, color: card.color }}
                  >
                    {card.icon}
                  </div>
                  <div>
                    <Text strong>{card.title}</Text>
                    <br />
                    <Text type="secondary" className="welcome-feature-desc">
                      {card.description}
                    </Text>
                  </div>
                </div>
              ))}
            </div>

            <div className="welcome-onboarding-paths">
              <Button
                type="primary"
                size="large"
                icon={<ThunderboltOutlined />}
                onClick={handleExpressOnboarding}
                className="welcome-main-btn"
              >
                一分钟开始减肥
              </Button>
              <Button
                type="default"
                size="large"
                icon={<FormOutlined />}
                onClick={handleFullOnboarding}
                className="welcome-secondary-btn"
              >
                完整问答版
              </Button>
            </div>
          </div>
        )}

        <button type="button" className="welcome-skip-all" onClick={handleSkip}>
          跳过引导
        </button>
      </div>
    </div>
  )
}

export default Welcome
