import { Card, Typography } from 'antd'
import AgentChatWorkspace from '../components/AgentChatWorkspace'
import './Chat.css'

const { Paragraph, Text, Title } = Typography

function ChatPage(): JSX.Element {
  return (
    <div className="chat-page">
      <Card className="chat-page-hero">
        <Text className="chat-page-kicker">正式入口</Text>
        <Title level={3} className="chat-page-title">
          猫猫虫 AI 对话中心
        </Title>
        <Paragraph type="secondary" className="chat-page-description">
          这里是更正式的对话工作区。你可以直接让猫猫虫记录饮食、分析营养、查找菜谱，或者打开应用内页面。
          右下角只保留一个可拖动的快捷入口，不再遮挡主流程操作。
        </Paragraph>
      </Card>

      <AgentChatWorkspace />
    </div>
  )
}

export default ChatPage
