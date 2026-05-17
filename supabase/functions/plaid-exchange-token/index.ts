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

const TYPE_MAP: Record<string, string> = {
  checking: 'checking',
  savings: 'savings',
  'credit card': 'credit_card',
  paypal: 'credit_card',
  mortgage: 'mortgage',
  auto: 'auto_loan',
  student: 'student_loan',
  'home equity': 'heloc',
  '401k': 'retirement',
  ira: 'retirement',
  brokerage: 'investment',
  cd: 'cd',
  'money market': 'savings',
}

function mapAccountType(plaidType: string, plaidSubtype: string | null): string {
  if (plaidSubtype) {
    const mapped = TYPE_MAP[plaidSubtype.toLowerCase()]
    if (mapped) return mapped
  }
  const typeMap: Record<string, string> = {
    depository: 'checking',
    credit: 'credit_card',
    loan: 'other',
    investment: 'investment',
  }
  return typeMap[plaidType.toLowerCase()] ?? 'other'
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

    const { public_token, institution_id, institution_name } = await req.json()

    if (!public_token) {
      return json({ error: 'Missing public_token' }, 400)
    }

    const plaidBaseUrl = plaidEnv === 'production'
      ? 'https://production.plaid.com'
      : 'https://sandbox.plaid.com'

    // 1. Exchange public token for access token
    const exchangeResp = await fetch(`${plaidBaseUrl}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: plaidClientId,
        secret: plaidSecret,
        public_token,
      }),
    })

    if (!exchangeResp.ok) {
      const errText = await exchangeResp.text()
      return json({ error: `Token exchange failed: ${errText}` }, exchangeResp.status)
    }

    const { access_token, item_id } = await exchangeResp.json()

    // 2. Store the Plaid item (use service role to bypass RLS for insert)
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { error: itemError } = await adminClient.from('plaid_items').upsert({
      owner_id: user.id,
      plaid_item_id: item_id,
      plaid_access_token: access_token,
      institution_id: institution_id ?? null,
      institution_name: institution_name ?? null,
      status: 'active',
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'plaid_item_id' })

    if (itemError) {
      return json({ error: `Failed to store Plaid item: ${itemError.message}` }, 500)
    }

    // 3. Fetch account details from Plaid
    const accountsResp = await fetch(`${plaidBaseUrl}/accounts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: plaidClientId,
        secret: plaidSecret,
        access_token,
      }),
    })

    if (!accountsResp.ok) {
      const errText = await accountsResp.text()
      return json({ error: `Failed to fetch accounts: ${errText}` }, accountsResp.status)
    }

    const { accounts: plaidAccounts } = await accountsResp.json()
    let accountsAdded = 0

    // 4. Upsert each Plaid account into financial_accounts
    for (const pa of plaidAccounts) {
      const dbType = mapAccountType(pa.type, pa.subtype)
      const isDebt = ['credit_card', 'mortgage', 'auto_loan', 'student_loan', 'heloc', 'other'].includes(dbType)
        && pa.type !== 'depository'
      const balance = isDebt
        ? -(Math.abs(pa.balances.current ?? 0))
        : (pa.balances.current ?? 0)

      // Check if this plaid account already exists
      const { data: existing } = await adminClient
        .from('financial_accounts')
        .select('id')
        .eq('owner_id', user.id)
        .eq('plaid_account_id', pa.account_id)
        .maybeSingle()

      if (existing) {
        await adminClient.from('financial_accounts')
          .update({
            current_balance: balance,
            available_balance: pa.balances.available ?? null,
            plaid_last_synced: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        const { error: insertError } = await adminClient.from('financial_accounts').insert({
          owner_id: user.id,
          account_type: dbType,
          institution_name: institution_name ?? pa.name ?? 'Unknown',
          nickname: pa.official_name ?? pa.name ?? null,
          last_four: pa.mask ?? null,
          current_balance: balance,
          available_balance: pa.balances.available ?? null,
          credit_limit: pa.balances.limit ?? null,
          plaid_account_id: pa.account_id,
          plaid_item_id: item_id,
          plaid_last_synced: new Date().toISOString(),
          status: 'active',
          sort_order: 0,
          color: isDebt ? '#ef4444' : '#10b981',
          icon: '🏦',
          rewards_balance: 0,
          rewards_unit: 'points',
          rewards_cpp: 0.01,
        })

        if (!insertError) accountsAdded++
      }
    }

    return json({ success: true, accounts_added: accountsAdded, item_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})
