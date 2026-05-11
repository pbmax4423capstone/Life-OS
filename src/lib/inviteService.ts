import { supabase } from '@/lib/supabase'

export interface InviteCode {
  id: string
  code: string
  plan_grant: string
  max_uses: number
  uses_count: number
  expires_at: string | null
  is_active: boolean
  note: string | null
  created_at: string
}

export interface EmailInvitation {
  id: string
  email: string
  plan_grant: string
  status: string
  personal_note: string | null
  sent_at: string | null
  accepted_at: string | null
  expires_at: string
  created_at: string
}

// ── Generate a random invite code ────────────────────────────
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const segment = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `LIFEOS-${segment(4)}-${segment(4)}`
}

// ── Create invite code ────────────────────────────────────────
export async function createInviteCode(opts: {
  maxUses?: number
  planGrant?: string
  expiresAt?: string
  note?: string
}): Promise<InviteCode> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('invite_codes')
    .insert({
      code: generateCode(),
      created_by: user.id,
      plan_grant: opts.planGrant ?? 'beta',
      max_uses: opts.maxUses ?? 1,
      expires_at: opts.expiresAt ?? null,
      note: opts.note ?? null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

// ── List invite codes created by user ─────────────────────────
export async function getMyInviteCodes(): Promise<InviteCode[]> {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return []
  return data ?? []
}

// ── Deactivate invite code ─────────────────────────────────────
export async function deactivateCode(id: string): Promise<void> {
  const { error } = await supabase
    .from('invite_codes')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

// ── Redeem an invite code at signup ──────────────────────────
export async function redeemInviteCode(code: string): Promise<{
  valid: boolean
  planGrant?: string
  error?: string
}> {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('id, plan_grant, max_uses, uses_count, expires_at, is_active')
    .eq('code', code.toUpperCase().trim())
    .maybeSingle()

  if (error || !data) return { valid: false, error: 'Invalid invite code' }
  if (!data.is_active) return { valid: false, error: 'This code is no longer active' }
  if (data.uses_count >= data.max_uses) return { valid: false, error: 'This code has been fully used' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { valid: false, error: 'This code has expired' }

  return { valid: true, planGrant: data.plan_grant }
}

// ── Send email invitation via edge function ───────────────────
export async function sendEmailInvitation(opts: {
  email: string
  personalNote?: string
  planGrant?: string
}): Promise<{ success: boolean; inviteUrl?: string; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite-email`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        email: opts.email,
        personal_note: opts.personalNote,
        plan_grant: opts.planGrant ?? 'beta',
      }),
    }
  )

  const data = await resp.json()
  if (!resp.ok) return { success: false, error: data.error }
  return { success: true, inviteUrl: data.invite_url }
}

// ── Get sent email invitations ─────────────────────────────────
export async function getSentInvitations(): Promise<EmailInvitation[]> {
  const { data, error } = await supabase
    .from('email_invitations')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return []
  return data ?? []
}

// ── Get current user's subscription ──────────────────────────
export async function getMySubscription() {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plans(*)')
    .maybeSingle()
  if (error) throw error
  return data
}
