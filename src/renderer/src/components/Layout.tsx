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
import AgentChatWorkspace from './AgentChatWorkspace'
import ProactiveReminder from '../proactive/ProactiveReminder'
import './Layout.css'

const { Sider, Content } = Layout

const menuItems = [
  {
    key: '/',
    icon: <HomeOutlined />,
    label: '🏠 首页',
  },
  {
    key: '/recipes',
    icon: <BookOutlined />,
    label: '🍳 菜谱',
  },
  {
    key: '/diet-log',
    icon: <EditOutlined />,
    label: '📝 饮食记录',
  },
  {
    key: '/chat',
    icon: <MessageOutlined />,
    label: '🤖 AI 对话',
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: '⚙️ 设置',
  },
]

interface AppLayoutProps {
  children: ReactNode
}

function AppLayout({ children }: AppLayoutProps): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const hideAgentChat = location.pathname === '/settings' || location.pathname === '/chat'
  const showChatWorkspace = location.pathname === '/chat'

  return (
    <Layout className="app-shell">
      <Sider
        width={200}
        className="cat-sider"
        theme="light"
      >
        <div className="logo-area">
          <span className="logo-emoji">🐛</span>
          <span className="logo-text">猫猫虫</span>
          <span className="logo-sub">饮食小助手</span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="cat-menu"
        />
        <div className="sider-footer">
          <span>🐾 吃好喝好，健康长大喵~</span>
        </div>
      </Sider>
      <Content className="cat-content">
        {children}
        <div className="agent-chat-workspace-container" style={{ display: showChatWorkspace ? 'block' : 'none' }}>
          <AgentChatWorkspace />
        </div>
      </Content>
      <ProactiveReminder />
      <AgentChat hidden={hideAgentChat} />
    </Layout>
  )
}

export default AppLayout
