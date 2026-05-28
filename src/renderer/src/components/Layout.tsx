import { Layout, Menu } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  HomeOutlined,
  BookOutlined,
  EditOutlined,
  MessageOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import AgentChat from './AgentChat'
import ProactiveReminder from '../proactive/ProactiveReminder'
import { useI18n } from '../i18n'
import './Layout.css'

const { Sider, Content } = Layout

interface AppLayoutProps {
  children: ReactNode
}

function AppLayout({ children }: AppLayoutProps): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()
  const hideAgentChat = location.pathname === '/settings' || location.pathname === '/chat'
  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: `🏠 ${t('layout.home')}`,
    },
    {
      key: '/recipes',
      icon: <BookOutlined />,
      label: `🍳 ${t('layout.recipes')}`,
    },
    {
      key: '/diet-log',
      icon: <EditOutlined />,
      label: `📝 ${t('layout.dietLog')}`,
    },
    {
      key: '/chat',
      icon: <MessageOutlined />,
      label: `🤖 ${t('layout.chat')}`,
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: `⚙️ ${t('layout.settings')}`,
    },
  ]

  return (
    <Layout className="app-shell">
      <Sider
        width={200}
        className="cat-sider"
        theme="light"
      >
        <div className="logo-area">
          <span className="logo-emoji">🐛</span>
          <span className="logo-text">{t('layout.brand')}</span>
          <span className="logo-sub">{t('layout.subtitle')}</span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="cat-menu"
        />
        <div className="sider-footer">
          <span>🐾 {t('layout.footer')}</span>
        </div>
      </Sider>
      <Content className="cat-content">
        {children}
      </Content>
      <ProactiveReminder />
      <AgentChat hidden={hideAgentChat} />
    </Layout>
  )
}

export default AppLayout
