import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send, Plus, Trash2, MessageSquare, Loader2,
  Sparkles, Pin, ChevronRight, X, Maximize2, Minimize2,
  TrendingDown, DollarSign, PiggyBank
} from 'lucide-react'
import {
  createConversation, getConversations, getMessages,
  saveMessage, generateTitle, deleteConversation,
  sendMessage, buildFinancialContext, SUGGESTED_PROMPTS,
  type ChatMessage, type Conversation,
} from '@/lib/chatService'
import { useAuthStore } from '@/stores/authStore'

// ── Message renderer ──────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage & { streaming?: boolean } }) {
  const isUser = msg.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} animate-fade-in`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 ${
        isUser ? 'bg-brand-600 text-white' : 'bg-slate-700 text-brand-400'
      }`}>
        {isUser ? 'You' : <Sparkles size={13} />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-brand-600 text-white rounded-tr-sm'
          : 'bg-slate-800 text-slate-200 border border-slate-700/50 rounded-tl-sm'
      }`}>
        {msg.streaming ? (
          <span>
            {msg.content}
            <span className="inline-block w-1.5 h-4 bg-brand-400 ml-0.5 animate-pulse rounded-sm" />
          </span>
        ) : (
          <FormattedMessage content={msg.content} />
        )}
      </div>
    </div>
  )
}

// Render markdown-lite: bold, bullets, line breaks
function FormattedMessage({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />
        // Bold: **text**
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        const rendered = parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j} className="font-semibold">{p.slice(2, -2)}</strong>
            : p
        )
        // Bullet
        if (line.trimStart().startsWith('- ') || line.trimStart().startsWith('• ')) {
          return <div key={i} className="flex gap-2"><span className="text-brand-400 mt-0.5">·</span><span>{rendered}</span></div>
        }
        return <div key={i}>{rendered}</div>
      })}
    </div>
  )
}

// ── Action button ─────────────────────────────────────────────
function ActionButton({ action, onAction }: { action: Record<string, unknown>; onAction: (a: Record<string, unknown>) => void }) {
  const icons: Record<string, React.ReactNode> = {
    schedule_payment:  <DollarSign size={13} />,
    open_debt_planner: <TrendingDown size={13} />,
    open_retirement:   <PiggyBank size={13} />,
  }
  return (
    <button
      onClick={() => onAction(action)}
      className="inline-flex items-center gap-1.5 text-xs bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 border border-brand-500/30 rounded-lg px-3 py-1.5 transition-all mt-2"
    >
      {icons[action.type as string] ?? <ChevronRight size={13} />}
      {action.label as string}
    </button>
  )
}

// ── Main chat component ───────────────────────────────────────
interface Props {
  initialContext?: string
  embedded?: boolean       // true = embedded in page, false = floating
  onClose?: () => void
  onAction?: (action: Record<string, unknown>) => void
}

export function AiChat({ initialContext = 'general', embedded = false, onClose, onAction }: Props) {
  const { user } = useAuthStore()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [contextSummary, setContextSummary] = useState<string>('')
  const [showSidebar, setShowSidebar] = useState(!embedded)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load conversations
  useEffect(() => {
    getConversations().then(setConversations)
    if (user) buildFinancialContext(user.id).then(setContextSummary)
  }, [user])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const startNewConversation = useCallback(async (): Promise<Conversation> => {
    setLoading(true)
    try {
      const conv = await createConversation(initialContext)
      setActiveConv(conv)
      setMessages([])
      setConversations(prev => [conv, ...prev])
      setTimeout(() => inputRef.current?.focus(), 100)
      return conv
    } finally {
      setLoading(false)
    }
  }, [initialContext])

  // Auto-start if no conversations
  useEffect(() => {
    if (conversations.length === 0 && !activeConv && !loading) {
      startNewConversation()
    }
  }, [conversations.length, activeConv, loading, startNewConversation])

  const loadConversation = async (conv: Conversation) => {
    setLoading(true)
    setActiveConv(conv)
    const msgs = await getMessages(conv.id)
    setMessages(msgs)
    setLoading(false)
  }

  const handleSend = async (text?: string) => {
    const userText = (text ?? input).trim()
    if (!userText || sending) return
    let conv = activeConv
    if (!conv) {
      conv = await startNewConversation()
    }
    setInput('')
    setSending(true)

    // Save user message
    const userMsg = await saveMessage(conv.id, 'user', userText)
    if (messages.length === 0) generateTitle(conv.id, userText)
    setMessages(prev => [...prev, userMsg])

    // Create streaming placeholder
    const tempId = `streaming-${Date.now()}`
    setStreamingId(tempId)
    let streamedText = ''

    const streamingMsg: ChatMessage = {
      id: tempId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, { ...streamingMsg, streaming: true } as ChatMessage & { streaming: boolean }])

    await sendMessage({
      conversationId: conv.id,
      messages,
      userMessage: userText,
      contextSnapshot: contextSummary,
      onChunk: (chunk) => {
        streamedText += chunk
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, content: streamedText } : m
        ))
      },
      onDone: async (fullText, action) => {
        const saved = await saveMessage(conv.id, 'assistant', fullText, {
          model: 'claude-haiku-4-5-20251001',
          suggestedAction: action ?? undefined,
        })
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...saved, suggested_action: action as Record<string, unknown> | null } : m
        ))
        setStreamingId(null)
        setSending(false)
        // Refresh conversation list
        getConversations().then(setConversations)
      },
      onError: (err) => {
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, content: `Error: ${err}`, streaming: false } : m
        ))
        setStreamingId(null)
        setSending(false)
      },
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleDelete = async (id: string) => {
    await deleteConversation(id)
    setConversations(prev => prev.filter(c => c.id !== id))
    if (activeConv?.id === id) {
      setActiveConv(null)
      setMessages([])
    }
  }

  const suggestions = SUGGESTED_PROMPTS[initialContext] ?? SUGGESTED_PROMPTS.general

  // Context chips
  const contextParts = contextSummary.split('\n').slice(1, 4).filter(Boolean)

  return (
    <div className={`flex ${embedded ? 'h-full' : 'h-[600px]'} bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden`}>

      {/* ── Sidebar ─────────────────────────────────────────── */}
      {showSidebar && (
        <div className="w-56 flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/80">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Conversations</span>
            <button onClick={startNewConversation} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors">
              <Plus size={15} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {conversations.map(conv => (
              <div key={conv.id}
                className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all ${activeConv?.id === conv.id ? 'bg-brand-600/20 text-brand-300' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                onClick={() => loadConversation(conv)}
              >
                <MessageSquare size={12} className="flex-shrink-0" />
                <span className="text-xs truncate flex-1">{conv.title ?? 'New conversation'}</span>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(conv.id) }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-all"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Chat area ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSidebar(v => !v)} className="btn-ghost p-1.5">
              {showSidebar ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <div className="p-1.5 rounded-lg bg-brand-500/20 text-brand-400">
              <Sparkles size={14} />
            </div>
            <div>
              <span className="text-sm font-semibold text-slate-200">AI Assistant</span>
              {contextParts.length > 0 && (
                <div className="flex gap-1 mt-0.5">
                  {contextParts.slice(0, 2).map((p, i) => (
                    <span key={i} className="text-xs text-slate-500 bg-slate-800 rounded px-1.5 py-0.5 truncate max-w-[100px]">{p}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="btn-ghost p-1.5"><X size={15} /></button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={20} className="animate-spin text-slate-600" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8 space-y-4">
              <div className="p-4 rounded-2xl bg-brand-500/10 text-brand-400">
                <Sparkles size={28} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">Ask me anything about your finances</p>
                <p className="text-xs text-slate-500 mt-1">I have context about your accounts and debt</p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {suggestions.map(s => (
                  <button key={s} onClick={() => handleSend(s)}
                    className="text-left text-xs text-slate-300 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 rounded-xl px-3 py-2.5 transition-all hover:border-brand-500/30">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map(msg => (
                <div key={msg.id}>
                  <MessageBubble msg={msg as ChatMessage & { streaming?: boolean }} />
                  {msg.suggested_action && msg.role === 'assistant' && (
                    <div className="ml-10 mt-1">
                      <ActionButton
                        action={msg.suggested_action as Record<string, unknown>}
                        onAction={onAction ?? (() => {})}
                      />
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-slate-800 flex-shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your finances… (Enter to send, Shift+Enter for new line)"
              rows={1}
              disabled={sending}
              className="input-base resize-none min-h-[40px] max-h-[120px] flex-1 py-2.5 text-sm"
              style={{ height: 'auto' }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || sending}
              className="btn-primary p-2.5 flex-shrink-0 disabled:opacity-40"
            >
              {sending
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={16} />
              }
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-1.5 px-1">
            Powered by Claude Haiku · Context: {contextParts[0] ?? 'Loading…'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Floating chat button ──────────────────────────────────────
export function FloatingChat() {
  const [open, setOpen] = useState(false)
  const [hasNew] = useState(false)

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-6 right-6 z-40 w-13 h-13 rounded-2xl shadow-2xl shadow-brand-900/50 flex items-center justify-center transition-all duration-200 ${open ? 'bg-slate-700 rotate-12' : 'bg-brand-600 hover:bg-brand-500'}`}
        style={{ width: 52, height: 52 }}
        title="AI Assistant"
      >
        {open ? <X size={20} className="text-white" /> : <Sparkles size={20} className="text-white" />}
        {hasNew && !open && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-950" />
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-40 w-[420px] max-w-[calc(100vw-48px)] shadow-2xl shadow-black/50 animate-slide-up">
          <AiChat
            initialContext="finance"
            embedded={false}
            onClose={() => setOpen(false)}
            onAction={(action) => {
              // Route actions to app sections
              if (action.type === 'open_debt_planner') window.location.href = '/finance/debt-planner'
              if (action.type === 'open_retirement') window.location.href = '/finance/retirement'
              if (action.type === 'schedule_payment') window.location.href = '/payments'
              setOpen(false)
            }}
          />
        </div>
      )}
    </>
  )
}
