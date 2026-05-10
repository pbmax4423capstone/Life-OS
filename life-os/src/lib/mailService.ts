import { supabase } from '@/lib/supabase'

export interface MailDelivery {
  id: string
  owner_id: string
  delivery_date: string
  email_subject: string | null
  piece_count: number
  reviewed: boolean
  reviewed_at: string | null
  notification_id: string | null
  created_at: string
}

export interface MailPiece {
  id: string
  delivery_id: string
  image_storage_path: string
  image_url_original: string | null
  sender_name: string | null
  mail_type: string
  flagged: boolean
  flag_note: string | null
  flag_color: string
  reviewed_at: string | null
  sort_order: number
}

export interface SyncState {
  last_synced_at: string | null
  sync_status: 'idle' | 'running' | 'success' | 'error'
  error_message: string | null
  emails_processed: number
}

// ── Fetch today's + recent deliveries ─────────────────────────
export async function getRecentDeliveries(limit = 7): Promise<MailDelivery[]> {
  const { data, error } = await supabase
    .from('mail_deliveries')
    .select('*')
    .order('delivery_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// ── Fetch pieces for a delivery ───────────────────────────────
export async function getMailPieces(deliveryId: string): Promise<MailPiece[]> {
  const { data, error } = await supabase
    .from('mail_pieces')
    .select('*')
    .eq('delivery_id', deliveryId)
    .order('sort_order')
  if (error) throw error
  return data ?? []
}

// ── Get public image URL from storage ─────────────────────────
export function getMailImageUrl(storagePath: string): string {
  const { data } = supabase.storage
    .from('life-os-documents')
    .getPublicUrl(storagePath)
  return data.publicUrl
}

// ── Flag / unflag a mail piece ────────────────────────────────
export async function toggleFlag(
  pieceId: string,
  flagged: boolean,
  note?: string,
  color?: string
): Promise<void> {
  const { error } = await supabase
    .from('mail_pieces')
    .update({
      flagged,
      flag_note: note ?? null,
      flag_color: color ?? 'red',
    })
    .eq('id', pieceId)
  if (error) throw error
}

// ── Mark delivery as reviewed ─────────────────────────────────
export async function markDeliveryReviewed(deliveryId: string): Promise<void> {
  const { error } = await supabase
    .from('mail_deliveries')
    .update({ reviewed: true, reviewed_at: new Date().toISOString() })
    .eq('id', deliveryId)
  if (error) throw error

  // Mark all pieces as reviewed
  await supabase
    .from('mail_pieces')
    .update({ reviewed_at: new Date().toISOString() })
    .eq('delivery_id', deliveryId)
    .is('reviewed_at', null)
}

// ── Get Gmail sync state ──────────────────────────────────────
export async function getSyncState(): Promise<SyncState | null> {
  const { data } = await supabase
    .from('gmail_sync_state')
    .select('last_synced_at, sync_status, error_message, emails_processed')
    .maybeSingle()
  return data
}

// ── Trigger mail sync via edge function ───────────────────────
export async function triggerMailSync(): Promise<{
  success: boolean
  processed: number
  message: string
  error?: string
}> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/usps-mail-sync`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  )

  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error ?? 'Sync failed')
  return data
}

// ── Unreviewed count ──────────────────────────────────────────
export async function getUnreviewedCount(): Promise<number> {
  const { count } = await supabase
    .from('mail_deliveries')
    .select('*', { count: 'exact', head: true })
    .eq('reviewed', false)
  return count ?? 0
}
