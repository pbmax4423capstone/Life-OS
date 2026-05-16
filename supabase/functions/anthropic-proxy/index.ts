import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // ── Auth verification ────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing or invalid authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify the caller's JWT using their own token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // ── Parse request ────────────────────────────────────────
    const { requestType, payload } = await req.json()

    if (!requestType || !payload) {
      return json({ error: 'Missing requestType or payload' }, 400)
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      return json({ error: 'Anthropic API key not configured on this server' }, 500)
    }

    // ── Call Anthropic Messages API ──────────────────────────
    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    })

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text()
      return json({ error: `Anthropic API error: ${errText}` }, anthropicResp.status)
    }

    // ── Stream (chat) vs. full JSON (image recognition) ─────
    if (requestType === 'chat_stream') {
      return new Response(anthropicResp.body, {
        headers: {
          ...CORS,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      })
    }

    // image_recognition and any other request types: return full JSON
    const data = await anthropicResp.json()
    return json(data, 200)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: message }, 500)
  }
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
