import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl) throw new Error('Missing VITE_SUPABASE_URL')
if (!supabaseAnonKey) throw new Error('Missing VITE_SUPABASE_ANON_KEY')

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'life-os/1.0.0',
    },
  },
})

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      financial_accounts: { Row: FinancialAccount; Insert: Partial<FinancialAccount>; Update: Partial<FinancialAccount> }
      transactions: { Row: Transaction; Insert: Partial<Transaction>; Update: Partial<Transaction> }
      scheduled_payments: { Row: ScheduledPayment; Insert: Partial<ScheduledPayment>; Update: Partial<ScheduledPayment> }
      loyalty_programs: { Row: LoyaltyProgram; Insert: Partial<LoyaltyProgram>; Update: Partial<LoyaltyProgram> }
      flights: { Row: Flight; Insert: Partial<Flight>; Update: Partial<Flight> }
      appointments: { Row: Appointment; Insert: Partial<Appointment>; Update: Partial<Appointment> }
      insurance_claims: { Row: InsuranceClaim; Insert: Partial<InsuranceClaim>; Update: Partial<InsuranceClaim> }
      job_applications: { Row: JobApplication; Insert: Partial<JobApplication>; Update: Partial<JobApplication> }
      certifications: { Row: Certification; Insert: Partial<Certification>; Update: Partial<Certification> }
      image_recognitions: { Row: ImageRecognition; Insert: Partial<ImageRecognition>; Update: Partial<ImageRecognition> }
    }
  }
}

// ── Domain types ──────────────────────────────────────────────
export interface Profile {
  id: string; display_name: string | null; email: string
  avatar_url: string | null; mfa_enabled: boolean
  timezone: string; preferences: Record<string, unknown>
  created_at: string; updated_at: string
}

export interface FinancialAccount {
  id: string; owner_id: string; account_type: string
  status: string; institution_name: string; nickname: string | null
  last_four: string | null; current_balance: number
  available_balance: number | null; credit_limit: number | null
  original_amount: number | null; interest_rate: number | null
  rewards_balance: number; rewards_unit: string; rewards_cpp: number
  color: string; icon: string; sort_order: number
  deleted_at: string | null; created_at: string; updated_at: string
}

export interface Transaction {
  id: string; account_id: string; owner_id: string
  transaction_type: string; amount: number; currency: string
  description: string | null; merchant_name: string | null
  category: string | null; transaction_date: string
  posted_date: string | null; is_pending: boolean
  is_recurring: boolean; notes: string | null; tags: string[]
  deleted_at: string | null; created_at: string; updated_at: string
}

export interface ScheduledPayment {
  id: string; owner_id: string; from_account_id: string
  to_account_id: string | null; payee_name: string | null
  amount: number; frequency: string; next_due_date: string
  end_date: string | null; status: string; auto_pay: boolean
  memo: string | null; anchor_date: string | null
  deleted_at: string | null; created_at: string; updated_at: string
}

export interface LoyaltyProgram {
  id: string; owner_id: string; program_name: string
  program_type: string; airline_code: string | null
  member_number: string | null; miles_balance: number
  points_balance: number; cpp: number
  expiry_date: string | null; expiry_policy: string | null
  color: string; deleted_at: string | null
  created_at: string; updated_at: string
}

export interface Flight {
  id: string; owner_id: string; passenger_name: string
  airline: string; flight_number: string
  origin_code: string; destination_code: string
  departure_datetime: string; arrival_datetime: string | null
  status: string; cabin_class: string; seat_number: string | null
  confirmation_code: string | null; miles_earned: number
  ticket_cost: number | null; booked_with_miles: boolean
  deleted_at: string | null; created_at: string; updated_at: string
}

export interface Appointment {
  id: string; owner_id: string; member_id: string | null
  provider_id: string | null; appointment_type: string
  appointment_date: string; appointment_time: string | null
  status: string; location: string | null; telehealth: boolean
  reason: string | null; notes: string | null
  copay_amount: number | null; policy_id: string | null
  deleted_at: string | null; created_at: string; updated_at: string
}

export interface InsuranceClaim {
  id: string; owner_id: string; policy_id: string
  service_date: string; service_description: string
  billed_amount: number; covered_amount: number | null
  patient_owed: number | null; status: string
  deleted_at: string | null; created_at: string; updated_at: string
}

export interface JobApplication {
  id: string; owner_id: string; company_name: string
  job_title: string; status: string; applied_date: string | null
  salary_min: number | null; salary_max: number | null
  location: string | null; remote_type: string | null
  notes: string | null; offer_amount: number | null
  deleted_at: string | null; created_at: string; updated_at: string
}

export interface Certification {
  id: string; owner_id: string; name: string
  issuing_org: string | null; status: string
  progress_pct: number; target_date: string | null
  achieved_date: string | null; expiry_date: string | null
  deleted_at: string | null; created_at: string; updated_at: string
}

export interface ImageRecognition {
  id: string; owner_id: string; storage_path: string
  detected_type: string | null; confidence: string | null
  ai_raw_output: Record<string, unknown> | null
  target_table: string | null; record_created_id: string | null
  status: string; created_at: string
}
