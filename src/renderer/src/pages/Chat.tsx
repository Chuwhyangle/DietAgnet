import AgentChatWorkspace from '../components/AgentChatWorkspace'
import './Chat.css'

function ChatPage(): JSX.Element {
  return (
    <main className="chat-page" aria-label="AI 对话中心">
      <AgentChatWorkspace />
    </main>
  )
}

export default ChatPage
