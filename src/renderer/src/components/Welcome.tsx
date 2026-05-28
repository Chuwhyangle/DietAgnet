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
import { useI18n } from '../i18n'
import './Welcome.css'

const { Title, Text, Paragraph } = Typography

interface WelcomeProps {
  onFinish: () => void
}

const TOTAL_STEPS = 3

function Welcome({ onFinish }: WelcomeProps): JSX.Element {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [nickname, setNickname] = useState('')
  const featureCards = [
    {
      icon: <EditOutlined />,
      color: '#FFB6C1',
      title: t('welcome.feature.log.title'),
      description: t('welcome.feature.log.description'),
    },
    {
      icon: <BookOutlined />,
      color: '#B8E8D0',
      title: t('welcome.feature.recipes.title'),
      description: t('welcome.feature.recipes.description'),
    },
    {
      icon: <RobotOutlined />,
      color: '#E8D5F5',
      title: t('welcome.feature.plan.title'),
      description: t('welcome.feature.plan.description'),
    },
  ]

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
              {t('welcome.hello.title')}
            </Title>
            <Paragraph className="welcome-step-description">
              {t('welcome.hello.description')}
            </Paragraph>

            <Button
              type="primary"
              size="large"
              icon={<ArrowRightOutlined />}
              onClick={handleNext}
              className="welcome-main-btn"
            >
              {t('welcome.hello.action')}
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="welcome-step welcome-step-nickname">
            <div className="welcome-step-icon-wrapper">
              <SmileOutlined className="welcome-step-icon" />
            </div>

            <Title level={3} className="welcome-step-title">
              {t('welcome.nickname.title')}
            </Title>
            <Paragraph className="welcome-step-description">
              {t('welcome.nickname.description')}
            </Paragraph>

            <Input
              placeholder={t('settings.nickname.placeholder')}
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
                {t('welcome.nickname.confirm')}
              </Button>
              <Button type="text" onClick={handleNext} className="welcome-skip-link">
                {t('welcome.nickname.skip')}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="welcome-step welcome-step-features">
            <Title level={3} className="welcome-step-title">
              {t('welcome.features.title')}
            </Title>
            <Paragraph className="welcome-step-description">
              {t('welcome.features.description')}
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
                {t('welcome.express')}
              </Button>
              <Button
                type="default"
                size="large"
                icon={<FormOutlined />}
                onClick={handleFullOnboarding}
                className="welcome-secondary-btn"
              >
                {t('welcome.full')}
              </Button>
            </div>
          </div>
        )}

      <button type="button" className="welcome-skip-all" onClick={handleSkip}>
          {t('welcome.skipAll')}
      </button>
      </div>
    </div>
  )
}

export default Welcome
