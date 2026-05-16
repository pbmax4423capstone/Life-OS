import { supabase } from '@/lib/supabase'

export async function createLinkToken(
  products: string[] = ['transactions', 'liabilities']
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const response = await fetch(`${supabaseUrl}/functions/v1/plaid-link-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ products }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Failed to create link token: ${err}`)
  }

  const result = await response.json()
  if (!result.link_token) throw new Error('No link_token in response')
  return result.link_token
}

export async function exchangeToken(
  publicToken: string,
  metadata: { institution?: { institution_id?: string; name?: string } }
): Promise<{ success: boolean; accounts_added: number; item_id: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const response = await fetch(`${supabaseUrl}/functions/v1/plaid-exchange-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      public_token: publicToken,
      institution_id: metadata.institution?.institution_id ?? null,
      institution_name: metadata.institution?.name ?? null,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Token exchange failed: ${err}`)
  }

  return response.json()
}

export async function syncAccounts(
  itemId?: string
): Promise<{ synced_accounts: number; new_transactions: number }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const response = await fetch(`${supabaseUrl}/functions/v1/plaid-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(itemId ? { item_id: itemId } : {}),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Sync failed: ${err}`)
  }

  return response.json()
}
