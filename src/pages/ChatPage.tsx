import { AiChat } from '@/components/chat/AiChat'
import { useNavigate } from 'react-router-dom'

export default function ChatPage() {
  const navigate = useNavigate()
  return (
    <div className="animate-fade-in space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">AI Assistant</h1>
        <p className="text-sm text-slate-400 mt-0.5">Ask anything about your finances, debt, investments, or any domain in Life OS</p>
      </div>
      <div style={{ height: 'calc(100vh - 180px)' }}>
        <AiChat
          initialContext="general"
          embedded
          onAction={(action) => {
            if (action.type === 'open_debt_planner') navigate('/finance/debt-planner')
            if (action.type === 'open_retirement') navigate('/finance/retirement')
            if (action.type === 'schedule_payment') navigate('/payments')
          }}
        />
      </div>
    </div>
  )
}
