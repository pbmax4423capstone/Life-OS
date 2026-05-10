/**
 * Image Recognition Service
 * Sends images to Claude Vision, parses the result,
 * and returns a structured pre-fill object for the correct domain form.
 */

export type RecognitionResult = {
  detectedType: string
  confidence: 'high' | 'medium' | 'low'
  targetTable: string
  displayLabel: string
  fields: Record<string, unknown>
  rawOutput: string
}

const SYSTEM_PROMPT = `You are a financial and personal document scanner embedded in a personal life management app.

When given an image, you must:
1. Identify exactly what type of document or item it is
2. Extract all relevant structured data from it
3. Return ONLY valid JSON — no markdown, no explanation

Supported document types and their JSON schemas:

credit_card_statement:
{"type":"credit_card_statement","institution":"string","last_four":"string","balance":number,"credit_limit":number,"apr":number,"min_payment":number,"due_date":"YYYY-MM-DD","rewards_points":number,"fees_charged":number,"interest_charged":number,"statement_date":"YYYY-MM-DD"}

bank_statement:
{"type":"bank_statement","institution":"string","last_four":"string","account_type":"checking|savings","balance":number,"apy":number,"interest_earned":number,"statement_date":"YYYY-MM-DD"}

insurance_card:
{"type":"insurance_card","insurer_name":"string","policy_type":"medical|dental|vision","policy_number":"string","group_number":"string","member_id":"string","member_name":"string","copay_primary":number,"copay_specialist":number,"effective_date":"YYYY-MM-DD"}

boarding_pass:
{"type":"boarding_pass","airline":"string","airline_code":"string","flight_number":"string","passenger_name":"string","origin_code":"string","destination_code":"string","departure_datetime":"ISO8601","seat_number":"string","cabin_class":"economy|premium_economy|business|first","confirmation_code":"string"}

frequent_flyer_card:
{"type":"frequent_flyer_card","program_name":"string","airline_code":"string","member_number":"string","miles_balance":number,"tier":"string"}

prescription_label:
{"type":"prescription_label","medication_name":"string","dosage":"string","frequency":"string","prescriber":"string","pharmacy_name":"string","refills_remaining":number,"next_refill_date":"YYYY-MM-DD"}

job_offer_letter:
{"type":"job_offer_letter","company_name":"string","job_title":"string","salary":number,"start_date":"YYYY-MM-DD","location":"string","remote_type":"onsite|hybrid|remote"}

certification:
{"type":"certification","name":"string","issuing_org":"string","credential_id":"string","achieved_date":"YYYY-MM-DD","expiry_date":"YYYY-MM-DD"}

business_card:
{"type":"business_card","full_name":"string","title":"string","company":"string","email":"string","phone":"string","linkedin_url":"string"}

travel_document:
{"type":"travel_document","doc_type":"passport|visa|global_entry|tsa_precheck","country":"string","expiry_date":"YYYY-MM-DD","doc_number":"string"}

credit_score_screenshot:
{"type":"credit_score_screenshot","score":number,"bureau":"Equifax|Experian|TransUnion|VantageScore","date":"YYYY-MM-DD"}

unknown:
{"type":"unknown","description":"brief description of what was seen"}

Return ONLY the JSON object. No other text.`

export async function recognizeImage(
  base64Image: string,
  mediaType: string = 'image/jpeg'
): Promise<RecognitionResult> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic API key not configured')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            { type: 'text', text: 'Scan this document and return the structured JSON.' },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API error: ${err}`)
  }

  const data = await response.json()
  const rawText = data.content?.[0]?.text ?? ''

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim())
  } catch {
    throw new Error('AI returned unparseable response')
  }

  return mapToResult(parsed, rawText)
}

// ── Map AI output → UI result ─────────────────────────────────
function mapToResult(
  parsed: Record<string, unknown>,
  rawOutput: string
): RecognitionResult {
  const type = parsed.type as string

  const typeMap: Record<string, { table: string; label: string }> = {
    credit_card_statement:   { table: 'financial_accounts', label: 'Credit Card Statement' },
    bank_statement:          { table: 'financial_accounts', label: 'Bank Statement' },
    insurance_card:          { table: 'insurance_policies', label: 'Insurance Card' },
    boarding_pass:           { table: 'flights',            label: 'Boarding Pass' },
    frequent_flyer_card:     { table: 'loyalty_programs',   label: 'Frequent Flyer Card' },
    prescription_label:      { table: 'prescriptions',      label: 'Prescription' },
    job_offer_letter:        { table: 'job_applications',   label: 'Job Offer Letter' },
    certification:           { table: 'certifications',     label: 'Certification' },
    business_card:           { table: 'contacts',           label: 'Business Card' },
    travel_document:         { table: 'travel_documents',   label: 'Travel Document' },
    credit_score_screenshot: { table: 'credit_score',       label: 'Credit Score' },
    unknown:                 { table: 'documents',          label: 'Unknown Document' },
  }

  const meta = typeMap[type] ?? { table: 'documents', label: 'Document' }

  // Simple heuristic confidence based on how many non-null fields came back
  const fieldCount = Object.values(parsed).filter(
    v => v !== null && v !== undefined && v !== ''
  ).length
  const confidence: 'high' | 'medium' | 'low' =
    fieldCount > 6 ? 'high' : fieldCount > 3 ? 'medium' : 'low'

  return {
    detectedType: type,
    confidence,
    targetTable: meta.table,
    displayLabel: meta.label,
    fields: parsed,
    rawOutput,
  }
}
