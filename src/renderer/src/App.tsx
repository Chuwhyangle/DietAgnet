import { lazy, Suspense, useEffect, useState, type AnimationEvent } from 'react'
import { ConfigProvider, Spin, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import AppLayout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Welcome from './components/Welcome'
import { registerDietLogCoachReactions } from './coach/dietLogCoach'
import { getSettings } from './stores/settings'
import { startNotificationClickListener } from './coaching/notificationRouter'

const HomePage = lazy(() => import('./pages/Home'))
const RecipesPage = lazy(() => import('./pages/Recipes'))
const DietLogPage = lazy(() => import('./pages/DietLog'))
const ChatPage = lazy(() => import('./pages/Chat'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const ExpressOnboardingPage = lazy(() => import('./pages/ExpressOnboarding'))

// 猫猫虫 Ant Design 主题配置
const caterpillarTheme = {
  token: {
    colorPrimary: '#FFB6C1',       // 柔粉色主色
    colorSuccess: '#7DD3A8',       // 薄荷绿
    colorWarning: '#FFB886',       // 蜜桃橙
    colorInfo: '#C9A6E8',          // 薰衣草紫
    colorBgContainer: '#FFFCF5',   // 奶油白背景
    colorBgLayout: 'transparent',
    colorText: '#4A3728',          // 暖棕色文字
    colorTextSecondary: '#7D6B5D',
    borderRadius: 12,
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: 14,
    controlHeight: 40,
  },
  algorithm: theme.defaultAlgorithm,
}

function AnimatedRoutes(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const [displayLocation, setDisplayLocation] = useState(location)
  const [transitionStage, setTransitionStage] = useState<'page-enter' | 'page-exit'>('page-enter')

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setTransitionStage('page-exit')
    }
  }, [displayLocation.pathname, location])

  // Listen for notification click routing from main process
  useEffect(() => {
    return startNotificationClickListener(navigate)
  }, [navigate])

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget || transitionStage !== 'page-exit') {
      return
    }

    setDisplayLocation(location)
    setTransitionStage('page-enter')
  }

  return (
    <div className={`route-stage ${transitionStage}`} onAnimationEnd={handleAnimationEnd}>
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin size="large" /></div>}>
        <Routes location={displayLocation}>
          <Route path="/" element={<HomePage />} />
          <Route path="/recipes" element={<RecipesPage />} />
          <Route path="/diet-log" element={<DietLogPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/express-onboarding" element={<ExpressOnboardingPage />} />
        </Routes>
      </Suspense>
    </div>
  )
}

function App(): JSX.Element {
  const [showWelcome, setShowWelcome] = useState(() => !getSettings().onboarded)

  useEffect(() => {
    return registerDietLogCoachReactions()
  }, [])

  return (
    <ConfigProvider theme={caterpillarTheme} locale={zhCN}>
      <ErrorBoundary>
        {showWelcome && <Welcome onFinish={() => setShowWelcome(false)} />}
        <HashRouter>
          <AppLayout>
            <AnimatedRoutes />
          </AppLayout>
        </HashRouter>
      </ErrorBoundary>
    </ConfigProvider>
  )
}

export default App
