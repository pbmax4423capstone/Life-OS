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

    const { products } = await req.json()

    const plaidBaseUrl = plaidEnv === 'production'
      ? 'https://production.plaid.com'
      : 'https://sandbox.plaid.com'

    const response = await fetch(`${plaidBaseUrl}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: plaidClientId,
        secret: plaidSecret,
        client_name: 'Life OS',
        language: 'en',
        country_codes: ['US'],
        user: { client_user_id: user.id },
        products: products || ['transactions', 'liabilities'],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return json({ error: `Plaid API error: ${errText}` }, response.status)
    }

    const data = await response.json()
    return json({ link_token: data.link_token })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})
