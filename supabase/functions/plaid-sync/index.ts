import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing or invalid authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID')
    const plaidSecret = Deno.env.get('PLAID_SECRET')
    const plaidEnv = Deno.env.get('PLAID_ENV') || 'sandbox'

    if (!plaidClientId || !plaidSecret) {
      return json({ error: 'Plaid credentials not configured' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const itemId = body.item_id as string | undefined

    const plaidBaseUrl = plaidEnv === 'production'
      ? 'https://production.plaid.com'
      : 'https://sandbox.plaid.com'

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Fetch plaid items for this user
    let query = adminClient.from('plaid_items').select('*').eq('owner_id', user.id).eq('status', 'active')
    if (itemId) {
      query = query.eq('plaid_item_id', itemId)
    }
    const { data: items, error: itemsError } = await query

    if (itemsError || !items?.length) {
      return json({ error: 'No linked Plaid accounts found' }, 404)
    }

    let syncedAccounts = 0
    let newTransactions = 0

    for (const item of items) {
      // 1. Sync balances
      const balanceResp = await fetch(`${plaidBaseUrl}/accounts/balance/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: plaidClientId,
          secret: plaidSecret,
          access_token: item.plaid_access_token,
        }),
      })

      if (balanceResp.ok) {
        const { accounts: plaidAccounts } = await balanceResp.json()
        for (const pa of plaidAccounts) {
          const { data: dbAccount } = await adminClient
            .from('financial_accounts')
            .select('id, account_type')
            .eq('owner_id', user.id)
            .eq('plaid_account_id', pa.account_id)
            .maybeSingle()

          if (dbAccount) {
            const isDebt = ['credit_card', 'mortgage', 'auto_loan', 'student_loan', 'heloc']
              .includes(dbAccount.account_type)
            const balance = isDebt
              ? -(Math.abs(pa.balances.current ?? 0))
              : (pa.balances.current ?? 0)

            await adminClient.from('financial_accounts')
              .update({
                current_balance: balance,
                available_balance: pa.balances.available ?? null,
                plaid_last_synced: new Date().toISOString(),
              })
              .eq('id', dbAccount.id)
            syncedAccounts++
          }
        }
      }

      // 2. Sync transactions using /transactions/sync
      const txnResp = await fetch(`${plaidBaseUrl}/transactions/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: plaidClientId,
          secret: plaidSecret,
          access_token: item.plaid_access_token,
        }),
      })

      if (txnResp.ok) {
        const txnData = await txnResp.json()
        const added = txnData.added ?? []

        for (const txn of added) {
          // Find the matching financial_account
          const { data: dbAccount } = await adminClient
            .from('financial_accounts')
            .select('id')
            .eq('owner_id', user.id)
            .eq('plaid_account_id', txn.account_id)
            .maybeSingle()

          if (!dbAccount) continue

          // Skip if already imported
          const { data: existing } = await adminClient
            .from('transactions')
            .select('id')
            .eq('plaid_transaction_id', txn.transaction_id)
            .maybeSingle()

          if (existing) continue

          const { error: txnInsertError } = await adminClient.from('transactions').insert({
            owner_id: user.id,
            account_id: dbAccount.id,
            transaction_type: txn.amount < 0 ? 'credit' : 'debit',
            amount: Math.abs(txn.amount),
            currency: txn.iso_currency_code ?? 'USD',
            description: txn.name ?? null,
            merchant_name: txn.merchant_name ?? null,
            category: txn.personal_finance_category?.primary ?? txn.category?.[0] ?? null,
            transaction_date: txn.date,
            posted_date: txn.authorized_date ?? null,
            is_pending: txn.pending ?? false,
            is_recurring: false,
            plaid_transaction_id: txn.transaction_id,
            tags: [],
          })

          if (!txnInsertError) newTransactions++
        }
      }

      // 3. Update last_synced_at
      await adminClient.from('plaid_items')
        .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', item.id)
    }

    return json({ synced_accounts: syncedAccounts, new_transactions: newTransactions })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})
