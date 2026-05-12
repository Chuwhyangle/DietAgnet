import { useEffect, useState, type AnimationEvent } from 'react'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import AppLayout from './components/Layout'
import Welcome from './components/Welcome'
import HomePage from './pages/Home'
import RecipesPage from './pages/Recipes'
import DietLogPage from './pages/DietLog'
import ChatPage from './pages/Chat'
import SettingsPage from './pages/Settings'
import { getSettings } from './stores/settings'

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
  const [displayLocation, setDisplayLocation] = useState(location)
  const [transitionStage, setTransitionStage] = useState<'page-enter' | 'page-exit'>('page-enter')

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setTransitionStage('page-exit')
    }
  }, [displayLocation.pathname, location])

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget || transitionStage !== 'page-exit') {
      return
    }

    setDisplayLocation(location)
    setTransitionStage('page-enter')
  }

  return (
    <div className={`route-stage ${transitionStage}`} onAnimationEnd={handleAnimationEnd}>
      <Routes location={displayLocation}>
        <Route path="/" element={<HomePage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/diet-log" element={<DietLogPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  )
}

function App(): JSX.Element {
  const [showWelcome, setShowWelcome] = useState(() => !getSettings().onboarded)

  return (
    <ConfigProvider theme={caterpillarTheme} locale={zhCN}>
      {showWelcome && <Welcome onFinish={() => setShowWelcome(false)} />}
      <HashRouter>
        <AppLayout>
          <AnimatedRoutes />
        </AppLayout>
      </HashRouter>
    </ConfigProvider>
  )
}

export default App
