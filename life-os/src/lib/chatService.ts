import { supabase } from '@/lib/supabase'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
  suggested_action?: Record<string, unknown> | null
}

export interface Conversation {
  id: string
  title: string | null
  context_type: string
  message_count: number
  last_message_at: string | null
  pinned: boolean
  created_at: string
}

// ── Financial context builder (safe — no account numbers) ─────
export async function buildFinancialContext(userId: string): Promise<string> {
  const [{ data: accounts }, { data: debts }] = await Promise.all([
    supabase.from('financial_accounts')
      .select('account_type, institution_name, current_balance, interest_rate, credit_limit')
      .eq('owner_id', userId)
      .is('deleted_at', null),
    supabase.from('financial_accounts')
      .select('institution_name, current_balance, interest_rate')
      .eq('owner_id', userId)
      .lt('current_balance', 0)
      .is('deleted_at', null),
  ])

  const lines: string[] = [
    `User's Financial Snapshot (${new Date().toLocaleDateString()}):`,
  ]

  if (accounts?.length) {
    const byType = accounts.reduce((acc, a) => {
      acc[a.account_type] = (acc[a.account_type] || [])
      acc[a.account_type].push(a)
      return acc
    }, {} as Record<string, typeof accounts>)

    for (const [type, accs] of Object.entries(byType)) {
      const total = accs.reduce((s, a) => s + (a.current_balance || 0), 0)
      lines.push(`${type}: ${accs.length} account(s), total $${total.toLocaleString()}`)
    }
  }

  const totalDebt = debts?.reduce((s, d) => s + Math.abs(d.current_balance || 0), 0) ?? 0
  if (totalDebt > 0) lines.push(`Total debt: $${totalDebt.toLocaleString()}`)

  return lines.join('\n')
}

const SYSTEM_PROMPT = `You are a knowledgeable, empathetic personal finance assistant built into Life OS — a personal command center app.

Your role:
- Give clear, actionable financial advice based on the user's actual data
- Explain financial concepts in plain language
- Help with debt payoff strategy, budgeting, investment questions, and planning
- Be encouraging — personal finance is stressful and people need support
- When suggesting actions the app can perform, include a JSON action block at the END of your response in this exact format:
  <action>{"type":"schedule_payment","label":"Schedule this payment","data":{}}</action>
  <action>{"type":"open_debt_planner","label":"Open Debt Planner","data":{}}</action>
  <action>{"type":"open_retirement","label":"View 401K Loan","data":{}}</action>

Rules:
- Never recommend specific stocks or securities
- Always note when professional advice (CPA, CFP) is warranted
- Keep responses focused and under 400 words unless the user asks for detail
- Format numbers as currency with commas
- Use bullet points for lists, but keep prose conversational`

// ── Create a new conversation ─────────────────────────────────
export async function createConversation(
  contextType: string = 'general'
): Promise<Conversation> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const context = await buildFinancialContext(user.id)

  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({
      owner_id: user.id,
      context_type: contextType,
      context_snapshot: { summary: context },
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

// ── Load conversations ────────────────────────────────────────
export async function getConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('*')
    .is('deleted_at', null)
    .order('pinned', { ascending: false })
    .order('last_message_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data ?? []
}

// ── Load messages for a conversation ─────────────────────────
export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, role, content, created_at, suggested_action')
    .eq('conversation_id', conversationId)
    .neq('role', 'system')
    .order('created_at')
  if (error) throw error
  return (data ?? []) as ChatMessage[]
}

// ── Save a message to DB ───────────────────────────────────────
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  meta?: { model?: string; inputTokens?: number; outputTokens?: number; suggestedAction?: unknown }
): Promise<ChatMessage> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('ai_messages')
    .insert({
      conversation_id: conversationId,
      owner_id: user.id,
      role,
      content,
      model: meta?.model ?? null,
      input_tokens: meta?.inputTokens ?? null,
      output_tokens: meta?.outputTokens ?? null,
      suggested_action: meta?.suggestedAction ?? null,
    })
    .select('id, role, content, created_at, suggested_action')
    .single()

  if (error) throw error
  return data as ChatMessage
}

// ── Auto-generate title from first message ────────────────────
export async function generateTitle(
  conversationId: string,
  firstMessage: string
): Promise<void> {
  // Simple title: first 60 chars of the user's first message
  const title = firstMessage.length > 60
    ? firstMessage.slice(0, 57) + '…'
    : firstMessage

  await supabase
    .from('ai_conversations')
    .update({ title })
    .eq('id', conversationId)
}

// ── Delete conversation ───────────────────────────────────────
export async function deleteConversation(id: string): Promise<void> {
  await supabase
    .from('ai_conversations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
}

// ── Main chat function (streaming) ───────────────────────────
export async function sendMessage(opts: {
  conversationId: string
  messages: ChatMessage[]
  userMessage: string
  contextSnapshot?: string
  onChunk: (chunk: string) => void
  onDone: (fullText: string, action: unknown) => void
  onError: (err: string) => void
}): Promise<void> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    opts.onError('Anthropic API key not configured')
    return
  }

  // Build message history for API (last 20 messages for context window)
  const history = opts.messages.slice(-20).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // Add current user message
  history.push({ role: 'user', content: opts.userMessage })

  // Prepend financial context as first user message if we have it
  const systemWithContext = opts.contextSnapshot
    ? `${SYSTEM_PROMPT}\n\n---\nCURRENT USER CONTEXT:\n${opts.contextSnapshot}`
    : SYSTEM_PROMPT

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        stream: true,
        system: systemWithContext,
        messages: history,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      opts.onError(`API error: ${err}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) { opts.onError('No response stream'); return }

    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

      for (const line of lines) {
        const jsonStr = line.slice(6)
        if (jsonStr === '[DONE]') continue
        try {
          const event = JSON.parse(jsonStr)
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            fullText += event.delta.text
            opts.onChunk(event.delta.text)
          }
        } catch { /* skip malformed lines */ }
      }
    }

    // Extract any action blocks
    const actionMatch = fullText.match(/<action>({.*?})<\/action>/s)
    let action: unknown = null
    let cleanText = fullText

    if (actionMatch) {
      try {
        action = JSON.parse(actionMatch[1])
        cleanText = fullText.replace(/<action>.*?<\/action>/gs, '').trim()
      } catch { /* ignore parse errors */ }
    }

    opts.onDone(cleanText, action)
  } catch (err) {
    opts.onError(err instanceof Error ? err.message : 'Unknown error')
  }
}

// ── Suggested prompts by context ─────────────────────────────
export const SUGGESTED_PROMPTS: Record<string, string[]> = {
  general: [
    'Give me a summary of my financial health',
    'What should I focus on improving first?',
    'Am I on track for my financial goals?',
  ],
  debt: [
    'Which debt should I pay off first?',
    'How much interest will I pay if I only make minimum payments?',
    'What if I put an extra $200/month toward debt?',
    'Compare avalanche vs snowball for my situation',
  ],
  retirement: [
    'What is the real cost of my 401K loan?',
    'Should I pay off my 401K loan early?',
    'How does my 401K loan affect my retirement savings?',
    'What is my opportunity cost?',
  ],
  finance: [
    'How much am I spending on interest each month?',
    'Which credit card is costing me the most?',
    'How can I improve my credit utilization?',
    'What is my debt-to-income ratio?',
  ],
}
